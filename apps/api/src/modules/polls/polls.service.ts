import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { SupportedLocale } from '../../shared/locale';
import { randomBytes } from 'crypto';
import {
  PollState,
  PollMode,
  PollOrigin,
  PollCommentModerationStatus,
  PollCommentExtractionStatus,
  PollLeaderboardSubjectType,
  EntityType,
  PollTopicType,
  Prisma,
  type Place,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService, TextSanitizerService } from '../../shared';
import { ModerationService } from '../moderation/moderation.service';
import { resolveModeration } from '../moderation/moderation-verdict';
import { SignalsService } from '../signals/signals.service';
import { computeIpAuditHmacs, hmacDeviceKey } from '../signals/audit-hmac';
import { PollsGateway } from './polls.gateway';
import { PollListSort, PollListTime, PollListType } from './dto/list-polls.dto';
import { ListUserPollsDto, UserPollActivity } from './dto/list-user-polls.dto';
import { CreateCommentDto, EditCommentDto } from './dto/create-comment.dto';
import {
  PollEntitySeedService,
  type PollPlaceContext,
} from './poll-entity-seed.service';
import { QueryPollsDto } from './dto/query-polls.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { CheckPollDuplicateDto } from './dto/check-poll-duplicate.dto';
import { LLMService } from '../external-integrations/llm/llm.service';
import { LLMPollAxis } from '../external-integrations/llm/llm.types';
import {
  EntityTextSearchService,
  type EntitySpan,
} from '../entity-text-search/entity-text-search.service';
import {
  DEFAULT_USER_POLL_WINDOW_DAYS,
  MS_PER_DAY,
  clampUserPollWindowDays,
  extractCloseWindowDays,
  resolvePollClosesAt,
} from './poll-timing';
import { PlacesCatalogService } from '../places/places-catalog.service';
import { descendantPlaceIds } from '../places/place-dag-read';
import { ViewportVerdictService } from '../places/viewport-verdict.service';
import { UserBlockService } from '../identity/user-block.service';
import { DEFAULT_LOCALE } from '../../shared/locale';
import { EntityDisplayService } from '../entity-display/entity-display.service';
import { renderPollTitle } from '../entity-display/poll-title-render';
import {
  AUTHOR_SELECT,
  publicAuthorIdentity,
} from '../identity/public-author-identity';
import {
  GeoBbox,
  PLACES_SLICE_MARGIN_FACTOR,
  expandBboxByFactor,
} from '@crave-search/shared';
import {
  PollFeedCursor,
  decodePollFeedCursor,
  encodePollFeedCursor,
} from './poll-feed-cursor';

// Stage-1 dedup threshold: high (precision-favoring) so only obvious duplicate
// questions are surfaced — "best tacos" vs "best taco truck" should NOT collide;
// the precise entity-level dedup runs post-resolution (stage 3).
const POLL_DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

// Per-user soft cap (§5): a creator may start at most this many polls per place in a
// rolling window. Comments/discussion are never capped. App/seeded polls don't count
// (they have no `createdByUserId`).
const POLL_USER_WEEKLY_CAP = 2;
const POLL_USER_WEEKLY_CAP_WINDOW_DAYS = 7;

// Trending = decayed distinct-user engagement velocity (votes + comments), the same
// half-life "heat" model used elsewhere for trending. Each distinct engager counts
// once at their most-recent engagement (spam-resistant), weighted e^(−ln2/halfLife·age).
const POLL_TRENDING_HALF_LIFE_DAYS = 3;

// §6/§16: page size is a DTO-validated client choice (QueryPollsDto.limit,
// @Max like search's PaginationDto). This default only serves clients that
// omit `limit` — the same value as search's DEFAULT_PAGE_SIZE, preserving the
// pre-cursor page-1 shape for pre-cut mobile builds.
const POLL_FEED_DEFAULT_PAGE_SIZE = 25;

/** Map the §6 Type filter to a `PollMode` where-filter (null = All = no filter). */
function resolvePollModeFilter(
  type: PollListType | undefined,
): PollMode | null {
  switch (type) {
    case PollListType.polls:
      return PollMode.ranked;
    case PollListType.discussions:
      return PollMode.discussion;
    default:
      return null;
  }
}

const POLL_TIME_WINDOW_MS: Partial<Record<PollListTime, number>> = {
  // Rolling windows (wave-2 §3: Today / This week / This month under the Top sort).
  [PollListTime.today]: 24 * 60 * 60 * 1000,
  [PollListTime.this_week]: 7 * 24 * 60 * 60 * 1000,
  [PollListTime.this_month]: 30 * 24 * 60 * 60 * 1000,
};

/** Map the Time period to a `launchedAt >=` cutoff (null = All Time = no filter). */
function resolvePollTimeCutoff(time: PollListTime | undefined): Date | null {
  const windowMs = time != null ? POLL_TIME_WINDOW_MS[time] : undefined;
  return windowMs != null ? new Date(Date.now() - windowMs) : null;
}

@Injectable()
export class PollsService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly sanitizer: TextSanitizerService,
    private readonly moderation: ModerationService,
    private readonly pollEntitySeedService: PollEntitySeedService,
    private readonly gateway: PollsGateway,
    private readonly llmService: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
    private readonly signals: SignalsService,
    private readonly placesCatalog: PlacesCatalogService,
    private readonly viewportVerdict: ViewportVerdictService,
    private readonly blocks: UserBlockService,
    // N10/D1: the ONE display boundary — templated poll questions render
    // through it, user prose bypasses it entirely.
    private readonly entityDisplay: EntityDisplayService,
  ) {
    this.logger = loggerService.setContext('PollsService');
  }

  /**
   * §3 signal subject for a poll act: the poll's single target entity when it
   * has exactly one, else the (normalized) poll question as a term subject.
   */
  private pollSignalSubject(poll: {
    question: string;
    topic?: {
      targetDishId: string | null;
      targetRestaurantId: string | null;
      targetFoodAttributeId: string | null;
      targetRestaurantAttributeId: string | null;
    } | null;
  }): { entityId: string } | { term: string } | null {
    const targets = [
      poll.topic?.targetDishId,
      poll.topic?.targetRestaurantId,
      poll.topic?.targetFoodAttributeId,
      poll.topic?.targetRestaurantAttributeId,
    ].filter((value): value is string => Boolean(value));
    if (targets.length === 1) {
      return { entityId: targets[0] };
    }
    const term = poll.question.trim();
    return term.length ? { term } : null;
  }

  // pollSignalGeo DELETED (docket #3): a poll act's WHERE is its placeId —
  // the anchor — and it carries NO geometry (nullable geo, anchor-or-geo
  // CHECK). The centroid-manufacturing helper died with the NOT NULL columns.

  /**
   * §6 POLLS FEED — polls of places in view (+ descendants of the
   * commensurate subject), keyset CURSOR pagination (the take-25 hard limit
   * is dead), §2 header verdict in the response metadata.
   *
   * Membership: placesInView(bounds) → the §2 subjecthood judgment
   * (resolveHeaderPlace — the SAME derivation search's displayPlaceName
   * uses) → feed members = in-view places (minus over-scale subdivision+
   * places, §4's feed-at-that-zoom boundary) ∪ descendants of the
   * commensurate subject(s). Every poll row is place-keyed (legacy-poll
   * expiry, 2026-07-20) — the market-bbox interim arm is gone.
   *
   * Response carries the place-native contract: header / promise /
   * nextCursor / per-poll placeName. (The pre-cut legacy envelope —
   * marketName + bare polls array — was deleted with the mobile cut.)
   */
  async queryPolls(
    query: QueryPollsDto,
    viewerUserId?: string | null,
    locale: string = DEFAULT_LOCALE,
  ) {
    const sort = query.sort ?? PollListSort.new;
    const limit = query.limit ?? POLL_FEED_DEFAULT_PAGE_SIZE;
    const targetState =
      (query.state as PollState | undefined) ?? PollState.active;
    // Type filter (§6): All = no mode filter; Polls = ranked; Discussions = discussion.
    const targetMode = resolvePollModeFilter(query.type);
    // Time filter (§6): This Week = launched within 7d; All Time = no cutoff.
    const launchedAfter = resolvePollTimeCutoff(query.time);
    const cursor = query.cursor
      ? decodePollFeedCursor(query.cursor, sort)
      : null;

    const view = this.resolveFeedView(query);
    if (!view) {
      return this.buildFeedResponse({
        headerPlaceName: null,
        polls: [],
        nextCursor: null,
        promiseEligible: false,
        placeOptions: [],
      });
    }

    // THE shared viewport→place-verdict seam (ViewportVerdictService): the
    // same placesInView + resolveFeedMembership + resolveHeaderPlace
    // composition home consumes via GET /places/viewport-verdict.
    const verdict = await this.viewportVerdict.resolveViewportVerdict(view);

    // §6 place slicer: options are computed over the UNFILTERED membership
    // (so the selected place never vanishes from its own selector), ranked by
    // content contribution across the feed's whole status universe
    // (LIVE + CLOSED — the span of PollListState).
    const placeOptions = await this.buildPlaceOptions(verdict.placeIds);

    // Server-truth place slice: constrain the feed to the filter place's DAG
    // SUBTREE (self + descendants) intersected with the viewport membership.
    let feedPlaceIds = verdict.placeIds;
    if (query.placeFilterId && feedPlaceIds.length) {
      const subtree = new Set(
        await descendantPlaceIds(this.prisma, [query.placeFilterId]),
      );
      feedPlaceIds = feedPlaceIds.filter((placeId) => subtree.has(placeId));
    }

    const page = await this.queryFeedPage({
      state: targetState,
      mode: targetMode,
      launchedAfter,
      placeIds: feedPlaceIds,
      sort,
      limit,
      cursor,
    });
    const [polls, catalogWatermark] = await Promise.all([
      this.hydrateFeedPolls(page.pollIds, viewerUserId, locale),
      this.placesCatalog.catalogWatermark(
        expandBboxByFactor(view, PLACES_SLICE_MARGIN_FACTOR),
      ),
    ]);

    return this.buildFeedResponse({
      headerPlaceName: verdict.headerPlace?.name ?? null,
      catalogWatermark,
      polls,
      nextCursor: page.nextCursor,
      // §6 cold-start promise: first page, zero polls, but the viewport DOES
      // resolve to a place (a seeded town) — the copy is mobile's.
      promiseEligible: cursor === null && polls.length === 0,
      placeOptions,
    });
  }

  /**
   * §6 place-slicer options: GROUP BY place over the viewport membership set,
   * across the feed's full status universe (active + closed — every state the
   * Live/Results toggle can show). Zero-poll places never appear; rank is
   * pollCount desc, name asc (deterministic tiebreak).
   */
  private async buildPlaceOptions(
    placeIds: string[],
  ): Promise<Array<{ placeId: string; name: string; pollCount: number }>> {
    if (!placeIds.length) {
      return [];
    }
    const counts = await this.prisma.$queryRaw<
      Array<{ place_id: string; name: string; poll_count: bigint | number }>
    >(Prisma.sql`
      SELECT p.place_id, pl.name, COUNT(*) AS poll_count
      FROM polls p
      JOIN places pl ON pl.place_id = p.place_id
      WHERE p.place_id = ANY(${placeIds}::uuid[])
        AND p.state::text = ANY(${[PollState.active, PollState.closed] as string[]}::text[])
      GROUP BY p.place_id, pl.name
    `);
    return counts
      .map((row) => ({
        placeId: row.place_id,
        name: row.name,
        pollCount: Number(row.poll_count),
      }))
      .sort(
        (left, right) =>
          right.pollCount - left.pollCount ||
          left.name.localeCompare(right.name),
      );
  }

  /**
   * The feed view. `bounds` IS the contract (the legacy marketKey→market-bbox
   * arm died with the legacy-poll-expiry leg — no market is ever read here).
   */
  private resolveFeedView(query: {
    bounds?: QueryPollsDto['bounds'];
  }): GeoBbox | null {
    const bounds = query.bounds;
    if (bounds?.northEast && bounds.southWest) {
      const { northEast, southWest } = bounds;
      if (
        [northEast.lat, northEast.lng, southWest.lat, southWest.lng].every(
          (value) => typeof value === 'number' && Number.isFinite(value),
        )
      ) {
        // Wrap-aware mapping (place-geo R1): SW/NE longitudes map DIRECTLY —
        // minLng > maxLng encodes an antimeridian-crossing viewport.
        return {
          minLat: Math.min(southWest.lat, northEast.lat),
          maxLat: Math.max(southWest.lat, northEast.lat),
          minLng: southWest.lng,
          maxLng: northEast.lng,
        };
      }
    }
    return null;
  }

  /**
   * One keyset page of poll ids for the feed, ordered per sort. The keyset
   * tuple always closes with the immutable (created_at, poll_id) pair — see
   * poll-feed-cursor.ts for the stability contract (rows inserting
   * mid-pagination can neither skip nor duplicate).
   */
  private async queryFeedPage(params: {
    state: PollState;
    mode: PollMode | null;
    launchedAfter: Date | null;
    placeIds: string[];
    sort: PollListSort;
    limit: number;
    cursor: PollFeedCursor | null;
  }): Promise<{ pollIds: string[]; nextCursor: string | null }> {
    const { state, mode, launchedAfter, placeIds, sort, limit } = params;
    if (!placeIds.length) {
      return { pollIds: [], nextCursor: null };
    }
    // §6 membership: every poll row is place-keyed (legacy-poll expiry).
    const filters = Prisma.sql`
      p.state::text = ${state}
      AND (${mode}::text IS NULL OR p.mode::text = ${mode}::text)
      ${
        launchedAfter
          ? Prisma.sql`AND p.launched_at >= ${launchedAfter}`
          : Prisma.empty
      }
      AND p.place_id = ANY(${placeIds}::uuid[])
    `;

    if (sort === PollListSort.new) {
      const cursor =
        params.cursor?.sort === PollListSort.new ? params.cursor : null;
      const keyset = cursor
        ? Prisma.sql`AND (p.created_at, p.poll_id) < (${new Date(cursor.createdAtMs)}, ${cursor.pollId}::uuid)`
        : Prisma.empty;
      const rows = await this.prisma.$queryRaw<
        Array<{ poll_id: string; created_at: Date }>
      >(Prisma.sql`
        SELECT p.poll_id, p.created_at
        FROM polls p
        WHERE ${filters} ${keyset}
        ORDER BY p.created_at DESC, p.poll_id DESC
        LIMIT ${limit + 1}
      `);
      const page = rows.slice(0, limit);
      const last = rows.length > limit ? page[page.length - 1] : null;
      return {
        pollIds: page.map((row) => row.poll_id),
        nextCursor: last
          ? encodePollFeedCursor({
              sort: PollListSort.new,
              createdAtMs: last.created_at.getTime(),
              pollId: last.poll_id,
            })
          : null,
      };
    }

    // Top/Trending: distinct-user engagement (a vote OR comment, once per
    // user at their most-recent action). Trending weights by recency against
    // the CURSOR'S reference epoch (decay-invariant paging — see
    // poll-feed-cursor.ts).
    const trending = sort === PollListSort.trending;
    const refMs =
      params.cursor?.sort === PollListSort.trending
        ? params.cursor.refMs
        : Date.now();
    const metricExpr = trending
      ? Prisma.sql`COALESCE(
          SUM(
            EXP(
              -LN(2) / ${POLL_TRENDING_HALF_LIFE_DAYS}::float8
              * (EXTRACT(EPOCH FROM (${new Date(refMs)} - en.last_ts)) / 86400.0)
            )
          ),
          0
        )`
      : Prisma.sql`COUNT(en.user_id)::float8`;
    const cursor =
      params.cursor && params.cursor.sort !== PollListSort.new
        ? params.cursor
        : null;
    const keyset = cursor
      ? Prisma.sql`HAVING (${metricExpr}, p.created_at, p.poll_id) < (${cursor.metric}::float8, ${new Date(cursor.createdAtMs)}, ${cursor.pollId}::uuid)`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ poll_id: string; created_at: Date; metric: number }>
    >(Prisma.sql`
      -- ENGAGEMENT IS SCOPED TO THE VIEWPORT'S POLLS.
      --
      -- This CTE used to aggregate poll_endorsements and poll_comments in
      -- FULL — every engagement row in the app — and only then join to the
      -- filtered polls. Cost therefore scaled with total app activity rather
      -- than with what the page returns, on the app's hottest read. Measured
      -- against 502,068 synthetic engagement rows over the real poll
      -- population: the old shape hash-aggregated all 502,068 and SPILLED TO
      -- DISK to return 2 rows (213.6ms); scoping it first is 0.221ms, a 968x
      -- difference, with results identical on every poll (0 rows differing
      -- across a full-table comparison). At today's 41 engagement rows both
      -- are instant — which is exactly why this had to be fixed before it
      -- mattered, not after.
      WITH candidates AS (
        SELECT p.poll_id, p.created_at
        FROM polls p
        WHERE ${filters}
      ),
      engagement AS (
        SELECT poll_id, user_id, MAX(ts) AS last_ts
        FROM (
          SELECT e.poll_id, e.user_id, e.created_at AS ts
          FROM poll_endorsements e
          WHERE e.poll_id IN (SELECT poll_id FROM candidates)
          UNION ALL
          SELECT c.poll_id, c.user_id, c.logged_at AS ts
          FROM poll_comments c
          WHERE c.deleted_at IS NULL
            AND c.poll_id IN (SELECT poll_id FROM candidates)
        ) events
        GROUP BY poll_id, user_id
      )
      SELECT p.poll_id, p.created_at, ${metricExpr} AS metric
      FROM candidates p
      LEFT JOIN engagement en ON en.poll_id = p.poll_id
      GROUP BY p.poll_id, p.created_at
      ${keyset}
      ORDER BY metric DESC, p.created_at DESC, p.poll_id DESC
      LIMIT ${limit + 1}
    `);
    const page = rows.slice(0, limit);
    const last = rows.length > limit ? page[page.length - 1] : null;
    return {
      pollIds: page.map((row) => row.poll_id),
      nextCursor: last
        ? encodePollFeedCursor(
            trending
              ? {
                  sort: PollListSort.trending,
                  refMs,
                  metric: Number(last.metric),
                  createdAtMs: last.created_at.getTime(),
                  pollId: last.poll_id,
                }
              : {
                  sort: PollListSort.top,
                  metric: Number(last.metric),
                  createdAtMs: last.created_at.getTime(),
                  pollId: last.poll_id,
                },
          )
        : null,
    };
  }

  /** Hydrate a feed page preserving SQL order, with labels + card stats. */
  /**
   * D1/N10 — TEMPLATED poll questions render in the reader's locale; USER
   * prose never does.
   *
   * The marker (`topic.titleSource`) is the whole reason this is safe: before
   * it, "Best tacos" and "where do y'all get tacos after 2am" were the same
   * kind of string to a reader of this table. One label query for the page.
   */
  private async localizePollQuestions<
    T extends {
      question: string;
      placeName?: string | null;
      topic?: {
        topicType: string;
        titleSource?: string;
        targetDishId: string | null;
        targetRestaurantId: string | null;
        targetFoodAttributeId: string | null;
        targetRestaurantAttributeId: string | null;
        metadata?: unknown;
      } | null;
    },
  >(polls: T[], locale: string): Promise<T[]> {
    const templated = polls.filter(
      (poll) => poll.topic?.titleSource === 'template',
    );
    if (!templated.length) {
      return polls;
    }
    // Concept targets get labels; restaurant targets keep their proper noun.
    const conceptIds = templated.flatMap((poll) =>
      [
        poll.topic?.targetDishId,
        poll.topic?.targetFoodAttributeId,
        poll.topic?.targetRestaurantAttributeId,
      ].filter((id): id is string => Boolean(id)),
    );
    const restaurantIds = templated.flatMap((poll) =>
      poll.topic?.targetRestaurantId ? [poll.topic.targetRestaurantId] : [],
    );
    const [entities, labels] = await Promise.all([
      this.prisma.entity.findMany({
        where: { entityId: { in: [...conceptIds, ...restaurantIds] } },
        select: { entityId: true, name: true },
      }),
      this.entityDisplay.loadLabels(conceptIds, locale),
    ]);
    const byId = new Map(entities.map((entity) => [entity.entityId, entity]));
    return polls.map((poll) => {
      const topic = poll.topic;
      if (!topic || topic.titleSource !== 'template') {
        return poll;
      }
      const conceptId =
        topic.targetDishId ??
        topic.targetFoodAttributeId ??
        topic.targetRestaurantAttributeId ??
        null;
      const concept = conceptId ? byId.get(conceptId) : undefined;
      const restaurant = topic.targetRestaurantId
        ? byId.get(topic.targetRestaurantId)
        : undefined;
      const source = (topic.metadata as { source?: string } | null)?.source;
      const rendered = renderPollTitle(
        source === 'poll_supply_weekly_ritual'
          ? 'weekly_ritual'
          : 'user_created',
        topic.topicType,
        locale,
        {
          conceptLabel: concept
            ? this.entityDisplay.displayLabel(concept, locale, labels)
            : null,
          restaurantName: restaurant?.name ?? null,
          placeName: poll.placeName ?? null,
        },
      );
      return rendered ? { ...poll, question: rendered } : poll;
    });
  }

  private async hydrateFeedPolls(
    pollIds: string[],
    viewerUserId?: string | null,
    locale: string = DEFAULT_LOCALE,
  ) {
    if (!pollIds.length) {
      return [];
    }
    const polls = await this.prisma.poll.findMany({
      where: { pollId: { in: pollIds } },
      include: {
        topic: {
          select: {
            topicType: true,
            targetDishId: true,
            targetRestaurantId: true,
            targetFoodAttributeId: true,
            targetRestaurantAttributeId: true,
            title: true,
            titleSource: true,
            titleLocale: true,
            description: true,
            metadata: true,
          },
        },
      },
    });
    const byId = new Map(polls.map((poll) => [poll.pollId, poll]));
    const ordered = pollIds
      .map((id) => byId.get(id))
      .filter((poll): poll is (typeof polls)[number] => poll != null);
    const labeled = await this.attachPlaceLabels(ordered);
    // Place labels FIRST: 'best_restaurants' renders its place name.
    const localized = await this.localizePollQuestions(labeled, locale);
    return this.attachPollStats(localized, viewerUserId);
  }

  /**
   * §6 per-poll place labels: ONE batch place lookup for the page.
   */
  private async attachPlaceLabels<T extends { placeId?: string | null }>(
    polls: T[],
  ): Promise<Array<T & { placeName: string | null }>> {
    const placeIds = [
      ...new Set(
        polls
          .map((poll) => poll.placeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const places = placeIds.length
      ? await this.prisma.place.findMany({
          where: { placeId: { in: placeIds } },
          select: { placeId: true, name: true },
        })
      : [];
    const nameById = new Map(
      places.map((place) => [place.placeId, place.name]),
    );
    return polls.map((poll) => {
      const placeName = poll.placeId
        ? (nameById.get(poll.placeId) ?? null)
        : null;
      return {
        ...poll,
        placeName,
      };
    });
  }

  /**
   * Feed response envelope: header (§2 verdict; null renders "Polls in this
   * area"), typed cold-start promise (§6), polls, nextCursor.
   */
  private buildFeedResponse(params: {
    headerPlaceName: string | null;
    polls: unknown[];
    nextCursor: string | null;
    promiseEligible: boolean;
    placeOptions: Array<{ placeId: string; name: string; pollCount: number }>;
    catalogWatermark?: string | null;
  }) {
    const { headerPlaceName, polls, nextCursor, placeOptions } = params;
    const promise =
      params.promiseEligible && headerPlaceName
        ? // Typed state only — "Polls drop Sundays — this town's first
          // unlocks as people search and vote." is MOBILE copy (§6).
          { kind: 'weekly_drop_pending' as const, placeName: headerPlaceName }
        : null;
    return {
      header: { placeName: headerPlaceName },
      // Header ideal 2026-08-01: the catalog revision for the request's
      // slice-margin region — the client subject store revalidates its
      // slice when this DIFFERS from the slice's own watermark (change,
      // never clock).
      catalogWatermark: params.catalogWatermark ?? null,
      promise,
      polls,
      nextCursor,
      // §6 place slicer (server-truth): membership places carrying content,
      // ranked by contribution — zero-poll places never listed.
      placeOptions,
    };
  }

  /**
   * Phase C re-key: user poll creation attaches to the PLACE CATALOG — the
   * poll's place = smallestContaining(creation-context bbox) (§3 attribution
   * law over the creator's viewport bounds). `bounds` is the only geo input
   * (the legacy marketKey→market-bbox arm died with legacy-poll expiry). No
   * market is ever minted for a poll again.
   */
  private async resolveCreationPlace(dto: {
    bounds?: {
      northEast: { lat: number; lng: number };
      southWest: { lat: number; lng: number };
    } | null;
  }): Promise<Place | null> {
    const view = this.resolveFeedView({ bounds: dto.bounds ?? undefined });
    if (!view) {
      return null;
    }
    return this.placesCatalog.smallestContaining(view);
  }

  /** Entity-seeding bias derived from the creation place (verification
   *  location bias + region hints — the old market context's role). */
  private buildPlaceSeedContext(place: Place): PollPlaceContext {
    const centroidLat =
      place.centroidLat != null ? Number(place.centroidLat) : null;
    const centroidLng =
      place.centroidLng != null ? Number(place.centroidLng) : null;
    return {
      center:
        centroidLat != null &&
        centroidLng != null &&
        Number.isFinite(centroidLat) &&
        Number.isFinite(centroidLng)
          ? { lat: centroidLat, lng: centroidLng }
          : undefined,
      city: place.name,
      region: place.subdivisionCode ?? null,
      countryCode: place.countryCode ?? null,
    };
  }

  /**
   * Stage-1 creation dedup (the volume valve): a fast `word_similarity` match of the
   * free-text question against ACTIVE polls of the same PLACE — no LLM. Precision-
   * favoring (high threshold) so only obvious duplicates surface; the precise
   * entity-level dedup happens post-resolution inside createPoll (stage 3).
   * Place-scoped only — every poll row is place-keyed (legacy-poll expiry).
   */
  async checkDuplicate(dto: CheckPollDuplicateDto): Promise<{
    matches: Array<{ pollId: string; question: string; similarity: number }>;
  }> {
    const question = dto.question.trim();
    if (question.length < 3) {
      return { matches: [] };
    }
    const place = await this.resolveCreationPlace(dto);
    if (!place) {
      return { matches: [] };
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ poll_id: string; question: string; sim: number }>
    >(Prisma.sql`
      SELECT poll_id, question,
             word_similarity(${question}, question) AS sim
      FROM polls
      WHERE state::text = 'active'
        AND place_id = ${place.placeId}::uuid
        AND word_similarity(${question}, question) >= ${POLL_DUPLICATE_SIMILARITY_THRESHOLD}
      ORDER BY sim DESC, launched_at DESC NULLS LAST
      LIMIT 3
    `);
    return {
      matches: rows.map((row) => ({
        pollId: row.poll_id,
        question: row.question,
        similarity: Number((Number(row.sim) || 0).toFixed(2)),
      })),
    };
  }

  /**
   * Per-user soft cap: 2/user/PLACE/week (§4 boundaries — a per-USER rule,
   * deliberately separate from place supply). Throws a clear BadRequest so
   * the client can show the "you've used your polls this week" message.
   */
  private async enforceWeeklyPollCap(
    userId: string,
    placeId: string,
  ): Promise<void> {
    const windowStart = new Date(
      Date.now() - POLL_USER_WEEKLY_CAP_WINDOW_DAYS * MS_PER_DAY,
    );
    // COUNT ATTEMPTS, NOT SUCCESSES (2026-08-01). This gate runs before the
    // spend, which was always right — but it counted polls the user
    // successfully CREATED. A name that fails vendor verification throws
    // AFTER the paid lookups and writes no poll row, so the counter never
    // moved and the same user could retry forever, paying us out one lookup
    // at a time. A turnstile that only counts the people who got through,
    // while charging everyone who tries.
    const recentAttempts = await this.prisma.pollCreationAttempt.count({
      where: { userId, placeId, attemptedAt: { gte: windowStart } },
    });
    if (recentAttempts >= POLL_USER_WEEKLY_CAP) {
      throw new BadRequestException(
        `You've used your ${POLL_USER_WEEKLY_CAP} polls this week in this area. ` +
          `Try again in a few days, or jump into an existing discussion.`,
      );
    }
    // Record the attempt BEFORE any vendor or LLM call. Best-effort: a
    // bookkeeping failure must not block a legitimate creation.
    try {
      await this.prisma.pollCreationAttempt.create({
        data: { userId, placeId },
      });
    } catch (error) {
      this.logger.warn('Poll attempt bookkeeping failed (creation proceeds)', {
        userId,
        placeId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async createPoll(dto: CreatePollDto, userId: string) {
    // "TomTom or nothing" (owner ruling 2026-08-01): when no catalog place
    // contains the creation viewport, the creation is REFUSED honestly.
    // The fallback mint ("this area near (lat, lng)", ZZ country, a
    // rectangle sized by the creator's zoom) is deleted — it fired zero
    // times ever on prod, and it was the one non-vendor ground in the
    // system. Viewport reads seed real places long before anyone polls.
    const place = await this.resolveCreationPlace(dto);
    if (!place) {
      throw new BadRequestException('Unable to resolve a place for this poll');
    }
    // Docket #1: the 'poll_created' earned-moment trigger is DELETED —
    // under birth-intake with an immediate drain, the place already has (or
    // is seconds from) its outline; nothing is left to earn.
    await this.enforceWeeklyPollCap(userId, place.placeId);
    if (dto.question?.trim()) {
      return this.createPollFromQuestion(
        dto.question.trim(),
        dto,
        userId,
        place,
      );
    }
    if (!dto.topicType) {
      throw new BadRequestException(
        'A poll question or a topicType is required',
      );
    }
    return this.createStructuredPoll(dto, userId, place);
  }

  private async createStructuredPoll(
    dto: CreatePollDto,
    userId: string,
    place: Place,
    opts: {
      axis?: Prisma.InputJsonValue;
      sourceQuestion?: string;
      questionPreModerated?: boolean;
    } = {},
  ) {
    const rawDescription = this.sanitizer.sanitizeOrThrow(
      dto.description ?? opts.sourceQuestion ?? '',
      {
        maxLength: 500,
        allowEmpty: false,
      },
    );
    const description = rawDescription.trim();
    if (!description.length) {
      throw new BadRequestException('Poll description is required');
    }

    if (!opts.questionPreModerated) {
      // WRITE PATH — policy 'hold': a description is about to become
      // permanent, public and attributed, so an unreachable moderator refuses
      // with a named cause rather than publishing unmoderated text.
      const outcome = resolveModeration(
        await this.moderation.moderateText(description),
        'hold',
      );
      if (!outcome.ok) {
        throw new BadRequestException(
          `Description rejected by moderation: ${outcome.cause}`,
        );
      }
    }

    // Phase C re-key: the poll belongs to its PLACE (resolved once in
    // createPoll); marketKey is never written on new rows.
    const placeContext = this.buildPlaceSeedContext(place);

    const topicType = dto.topicType;
    if (!topicType) {
      throw new BadRequestException('A poll topicType is required');
    }

    let targetDishId: string | null = null;
    let targetRestaurantId: string | null = null;
    let targetFoodAttributeId: string | null = null;
    let targetRestaurantAttributeId: string | null = null;
    // MODERATE THE USER-SUPPLIED ENTITY NAME BEFORE RESOLVING IT.
    //
    // Resolution is where we spend: it can call Google Places and it CREATES
    // a permanent entity row. Title moderation ran only after that, so a poll
    // whose name was abusive still cost us a Places lookup and left an
    // orphaned entity carrying the abusive text — rejected at the door, but
    // paid for and persisted. Moderating the name first makes the refusal
    // free and leaves nothing behind. Names selected by id are already ours
    // and skip this.
    const suppliedName = [
      dto.targetDishId ? null : dto.targetDishName,
      dto.targetRestaurantId ? null : dto.targetRestaurantName,
      dto.targetFoodAttributeId ? null : dto.targetFoodAttributeName,
      dto.targetRestaurantAttributeId
        ? null
        : dto.targetRestaurantAttributeName,
    ]
      .find((value) => typeof value === 'string' && value.trim().length > 0)
      ?.trim();
    if (suppliedName) {
      // WRITE PATH — policy 'hold': resolving this name SPENDS (Places) and
      // creates a permanent entity row, so an unanswered moderator must not
      // let it through.
      const nameOutcome = resolveModeration(
        await this.moderation.moderateText(suppliedName),
        'hold',
      );
      if (!nameOutcome.ok) {
        throw new BadRequestException(
          `Name rejected by moderation: ${nameOutcome.cause}`,
        );
      }
    }

    let question = '';

    switch (topicType) {
      case PollTopicType.best_dish: {
        const dish = await this.pollEntitySeedService.resolveFood({
          entityId: dto.targetDishId ?? null,
          name: dto.targetDishName ?? null,
        });
        targetDishId = dish.entityId;
        question = this.buildPollQuestion(topicType, dish.name);
        break;
      }
      case PollTopicType.what_to_order: {
        const restaurant = await this.pollEntitySeedService.resolveRestaurant({
          entityId: dto.targetRestaurantId ?? null,
          name: dto.targetRestaurantName ?? null,
          place: placeContext,
          sessionToken: dto.sessionToken,
        });
        targetRestaurantId = restaurant.entityId;
        question = this.buildPollQuestion(topicType, restaurant.name);
        break;
      }
      case PollTopicType.best_dish_attribute: {
        const attribute = await this.pollEntitySeedService.resolveAttribute({
          entityId: dto.targetFoodAttributeId ?? null,
          name: dto.targetFoodAttributeName ?? null,
          entityType: EntityType.food_attribute,
        });
        targetFoodAttributeId = attribute.entityId;
        question = this.buildPollQuestion(topicType, attribute.name);
        break;
      }
      case PollTopicType.best_restaurant_attribute: {
        const attribute = await this.pollEntitySeedService.resolveAttribute({
          entityId: dto.targetRestaurantAttributeId ?? null,
          name: dto.targetRestaurantAttributeName ?? null,
          entityType: EntityType.restaurant_attribute,
        });
        targetRestaurantAttributeId = attribute.entityId;
        question = this.buildPollQuestion(topicType, attribute.name);
        break;
      }
      default: {
        throw new BadRequestException('Unsupported poll type');
      }
    }

    // Free-text path: the user's actual question is the poll title (not the
    // templated "Best X"); it was already moderated upstream.
    if (opts.sourceQuestion) {
      question = opts.sourceQuestion;
    }
    if (!opts.questionPreModerated) {
      // WRITE PATH — policy 'hold' (see createPoll).
      const questionOutcome = resolveModeration(
        await this.moderation.moderateText(question),
        'hold',
      );
      if (!questionOutcome.ok) {
        throw new BadRequestException(
          `Poll title rejected by moderation: ${questionOutcome.cause}`,
        );
      }
    }

    const now = new Date();
    const poll = await this.prisma.$transaction(async (tx) => {
      const topic = await tx.pollTopic.create({
        data: {
          title: question,
          // D1 — the marker, written AT THE SOURCE where the fact is known.
          // `sourceQuestion` present ⇒ the title IS the user's own prose;
          // otherwise buildPollQuestion() produced it from a template and it
          // is renderable per locale. Deriving this later from the string is
          // exactly what D1 exists to avoid.
          titleSource: opts.sourceQuestion ? 'user' : 'template',
          titleLocale: DEFAULT_LOCALE,
          description,
          placeId: place.placeId,
          topicType,
          createdByUserId: userId,
          targetDishId,
          targetRestaurantId,
          targetFoodAttributeId,
          targetRestaurantAttributeId,
          categoryEntityIds: [
            targetDishId,
            targetFoodAttributeId,
            targetRestaurantAttributeId,
          ].filter((value): value is string => Boolean(value)),
          seedEntityIds: [targetDishId, targetRestaurantId].filter(
            (value): value is string => Boolean(value),
          ),
          metadata: {
            source: 'user',
            createdBy: userId,
            // §5: the creator's self-scheduled close window (clamped 3–14, default 7).
            closeWindowDays:
              clampUserPollWindowDays(dto.closeWindowDays) ??
              DEFAULT_USER_POLL_WINDOW_DAYS,
          },
        },
      });

      const createdPoll = await tx.poll.create({
        data: {
          topicId: topic.topicId,
          question,
          placeId: place.placeId,
          state: PollState.active,
          mode: PollMode.ranked,
          axis: opts.axis ?? Prisma.JsonNull,
          scheduledFor: now,
          launchedAt: now,
          allowUserAdditions: true,
          metadata: topic.metadata ?? Prisma.JsonNull,
          createdByUserId: userId,
        },
        include: {
          topic: {
            select: {
              topicType: true,
              targetDishId: true,
              targetRestaurantId: true,
              targetFoodAttributeId: true,
              targetRestaurantAttributeId: true,
              title: true,
              description: true,
              metadata: true,
            },
          },
        },
      });

      const entitiesToUpdate = [targetDishId, targetRestaurantId].filter(
        (value): value is string => Boolean(value),
      );
      if (entitiesToUpdate.length) {
        await tx.entity.updateMany({
          where: { entityId: { in: entitiesToUpdate } },
          data: { lastPolledAt: now },
        });
      }

      return createdPoll;
    });

    this.gateway.emitPollUpdate(poll.pollId);
    // §3 signals: the poll_created act.
    this.signals.record({
      kind: 'poll_created',
      userId,
      subject: this.pollSignalSubject(poll),
      geo: null,
      placeId: poll.placeId,
      meta: { pollId: poll.pollId },
    });
    // W4: no pollsCreatedCount counter bump — the profile "Polls" stat is a
    // live count over polls.createdByUserId (see UserService.countCreatedPolls).
    // §2 Option A: seed the leaderboard from the creator's description immediately,
    // so a ranked poll ranks the creator's organic suggestion from frame one.
    // (No-op for discussion polls — rebuildPollLeaderboard early-returns.)
    await this.rebuildPollLeaderboard(poll.pollId);
    const [enriched] = await this.attachPlaceLabels([poll]);
    return enriched;
  }

  /**
   * Phase 3B: free-text poll creation. Moderate the question, infer its subject
   * (ranked + axis, or discussion), then either reuse the structured creation flow
   * with the derived target, or create a topic-less discussion poll.
   */
  private async createPollFromQuestion(
    rawQuestion: string,
    dto: CreatePollDto,
    userId: string,
    place: Place,
  ) {
    const question = this.sanitizer
      .sanitizeOrThrow(rawQuestion, { maxLength: 280, allowEmpty: false })
      .trim();
    if (!question.length) {
      throw new BadRequestException('Poll question is required');
    }

    // WRITE PATH — policy 'hold': the question is published as a poll title.
    const questionOutcome = resolveModeration(
      await this.moderation.moderateText(question),
      'hold',
    );
    if (!questionOutcome.ok) {
      throw new BadRequestException(
        `Poll question rejected by moderation: ${questionOutcome.cause}`,
      );
    }

    const subject = await this.llmService.inferPollSubject(question);
    const mapped =
      subject.mode === 'ranked' && subject.axis
        ? this.mapAxisToStructured(subject.axis)
        : null;

    // Discussion, or a ranked axis we cannot map onto a structured topic type.
    if (!mapped || !subject.axis) {
      return this.createDiscussionPoll(question, dto, userId, place);
    }

    return this.createStructuredPoll(
      {
        ...dto,
        topicType: mapped.topicType,
        description: question,
        targetDishName: mapped.targetDishName,
        targetRestaurantName: mapped.targetRestaurantName,
        targetFoodAttributeName: mapped.targetFoodAttributeName,
        targetRestaurantAttributeName: mapped.targetRestaurantAttributeName,
      },
      userId,
      place,
      {
        axis: subject.axis as unknown as Prisma.InputJsonValue,
        sourceQuestion: question,
        questionPreModerated: true,
      },
    );
  }

  /** Map an inferred axis onto the 4 structured topic types (null if unmappable). */
  private mapAxisToStructured(axis: LLMPollAxis): {
    topicType: PollTopicType;
    targetDishName?: string;
    targetRestaurantName?: string;
    targetFoodAttributeName?: string;
    targetRestaurantAttributeName?: string;
  } | null {
    if (axis.targetType === 'dish') {
      if (axis.anchor) {
        return {
          topicType: PollTopicType.what_to_order,
          targetRestaurantName: axis.anchor,
        };
      }
      if (axis.constraint?.kind === 'category') {
        return {
          topicType: PollTopicType.best_dish,
          targetDishName: axis.constraint.value,
        };
      }
      if (axis.constraint?.kind === 'dish_attribute') {
        return {
          topicType: PollTopicType.best_dish_attribute,
          targetFoodAttributeName: axis.constraint.value,
        };
      }
      return null;
    }
    // restaurant — cuisine + restaurant_attribute both rank places by an attribute.
    if (
      axis.constraint?.kind === 'restaurant_attribute' ||
      axis.constraint?.kind === 'cuisine'
    ) {
      return {
        topicType: PollTopicType.best_restaurant_attribute,
        targetRestaurantAttributeName: axis.constraint.value,
      };
    }
    return null;
  }

  /** Create a topic-less discussion poll (no axis, no options, no leaderboard). */
  private async createDiscussionPoll(
    question: string,
    dto: CreatePollDto,
    userId: string,
    place: Place,
  ) {
    const now = new Date();
    const poll = await this.prisma.poll.create({
      data: {
        question,
        placeId: place.placeId,
        state: PollState.active,
        mode: PollMode.discussion,
        allowUserAdditions: false,
        scheduledFor: now,
        launchedAt: now,
        createdByUserId: userId,
        metadata: {
          source: 'user',
          createdBy: userId,
          // §5: the creator's self-scheduled close window (clamped 3–14, default 7).
          closeWindowDays:
            clampUserPollWindowDays(dto.closeWindowDays) ??
            DEFAULT_USER_POLL_WINDOW_DAYS,
        },
      },
      include: {
        topic: {
          select: {
            topicType: true,
            targetDishId: true,
            targetRestaurantId: true,
            targetFoodAttributeId: true,
            targetRestaurantAttributeId: true,
            title: true,
            description: true,
            metadata: true,
          },
        },
      },
    });

    this.gateway.emitPollUpdate(poll.pollId);
    // §3 signals: the poll_created act (discussion polls are topic-less —
    // subject falls through to the question term).
    this.signals.record({
      kind: 'poll_created',
      userId,
      subject: this.pollSignalSubject(poll),
      geo: null,
      placeId: poll.placeId,
      meta: { pollId: poll.pollId },
    });
    // W4: no counter bump — the stat is a live count (UserService.countCreatedPolls).
    const [enriched] = await this.attachPlaceLabels([poll]);
    return enriched;
  }

  async getPoll(pollId: string, locale?: SupportedLocale) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      include: {
        topic: {
          select: {
            topicType: true,
            targetDishId: true,
            targetRestaurantId: true,
            targetFoodAttributeId: true,
            targetRestaurantAttributeId: true,
            title: true,
            // titleSource is the D1/N10 marker localizePollQuestions filters
            // on. Omitting it made every poll look like USER prose here, so
            // the detail screen rendered templated questions untranslated
            // while the feed — which selects it — translated the same poll.
            titleSource: true,
            titleLocale: true,
            description: true,
            metadata: true,
          },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    // Place labels FIRST: 'best_restaurants' renders its place name. Same
    // order as hydrateFeedPolls, which is the other half of this contract —
    // the controller has always passed `locale` here, and this method
    // silently dropped it (it was an unused parameter until 2026-08-05).
    const [enriched] = await this.attachPlaceLabels([poll]);
    const [localized] = await this.localizePollQuestions(
      [enriched],
      locale ?? DEFAULT_LOCALE,
    );
    return localized;
  }

  // ─── Comments (Phase 4) ──────────────────────────────────────────────────

  private generateCommentPublicId(): string {
    return randomBytes(12).toString('base64url'); // 16 url-safe chars
  }

  /**
   * Phase 5 gazetteer: scan a comment for KNOWN restaurant/food mentions (no
   * LLM) and return display spans for highlight + deeplink. Brand-new entities
   * aren't here yet — they graduate at close (§6.1).
   *
   * §13 territory-as-retrieval-prior (markets extermination leg 3): restaurant
   * matching is scoped to the ENGINE whose territory covers the poll's PLACE
   * (a member on the place's own ancestor chain — declared fact, no
   * geometry). A poll outside every engine territory scans globally — the
   * honest uncovered state, never a market key.
   */
  async highlightCommentSpans(
    body: string,
    placeId: string | null,
  ): Promise<Prisma.InputJsonValue> {
    const engineId = await this.engineIdForPlace(placeId);
    const spans = await this.entityTextSearch.scanForKnownEntities(
      body,
      [
        EntityType.restaurant,
        EntityType.food,
        EntityType.food_attribute,
        EntityType.restaurant_attribute,
      ],
      { engineId },
    );
    return spans as unknown as Prisma.InputJsonValue;
  }

  /**
   * The covering engine for a place: an engine one of whose MEMBERS sits on
   * the place's own ancestor chain — the place itself, or a `parent_place_ids`
   * ancestor (§5 territory = members ∪ DAG descendants, the same law
   * resolveEngineTerritoryPlaceIds states from the other end). Membership is
   * a DECLARED fact, so it is answered from the vendor chain, never from
   * geometry: the previous ST_Covers-over-centroid form re-derived it
   * geometrically and inherited the measured 10.85% non-nesting spill
   * (ground-containment.ts — TomTom's Washington centroid can sit outside
   * the District's outline, silently dropping the covering engine). Nearest
   * rung wins on overlap (a member place beats a member ancestor); depth is
   * capped at 12 as a defective-cycle guard (the ladder is ≤6). null = no
   * covering engine (gazetteer scope falls back to global).
   */
  private async engineIdForPlace(
    placeId: string | null,
  ): Promise<string | null> {
    if (!placeId) {
      return null;
    }
    try {
      const rows = await this.prisma.$queryRaw<Array<{ engineId: string }>>(
        Prisma.sql`
          WITH RECURSIVE chain(place_id, depth) AS (
            SELECT ${placeId}::uuid, 0
            UNION
            SELECT parent.place_id, c.depth + 1
            FROM chain c
            JOIN places p ON p.place_id = c.place_id
            CROSS JOIN LATERAL unnest(p.parent_place_ids) AS parent(place_id)
            WHERE c.depth < 12
          )
          SELECT e.engine_id AS "engineId"
          FROM chain c
          JOIN engines e ON c.place_id = ANY(e.member_place_ids)
          ORDER BY c.depth ASC, e.engine_id ASC
          LIMIT 1
        `,
      );
      return rows[0]?.engineId ?? null;
    } catch (error) {
      this.logger.warn(
        'Covering-engine lookup failed — gazetteer scanning globally',
        { placeId, detail: String(error) },
      );
      return null;
    }
  }

  async postComment(pollId: string, dto: CreateCommentDto, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        pollId: true,
        state: true,
        placeId: true,
        question: true,
        topic: {
          select: {
            targetDishId: true,
            targetRestaurantId: true,
            targetFoodAttributeId: true,
            targetRestaurantAttributeId: true,
          },
        },
      },
    });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }
    if (poll.state !== PollState.active) {
      throw new BadRequestException('Poll is not active');
    }

    const body = this.sanitizer
      .sanitizeOrThrow(dto.body, { maxLength: 2000, allowEmpty: false })
      .trim();
    if (!body.length) {
      throw new BadRequestException('Comment body is required');
    }

    // WRITE PATH — policy 'hold': the comment is about to be persisted and
    // rendered to every reader of the poll.
    const bodyOutcome = resolveModeration(
      await this.moderation.moderateText(body),
      'hold',
    );
    if (!bodyOutcome.ok) {
      throw new BadRequestException(
        `Comment rejected by moderation: ${bodyOutcome.cause}`,
      );
    }

    if (dto.parentCommentId) {
      const parent = await this.prisma.pollComment.findUnique({
        where: { commentId: dto.parentCommentId },
        select: { pollId: true, deletedAt: true },
      });
      if (!parent || parent.pollId !== pollId || parent.deletedAt) {
        throw new NotFoundException('Parent comment not found for poll');
      }
    }

    const entitySpans = await this.highlightCommentSpans(body, poll.placeId);
    const comment = await this.prisma.pollComment.create({
      data: {
        pollId,
        userId,
        parentCommentId: dto.parentCommentId ?? null,
        body,
        publicId: this.generateCommentPublicId(),
        // Sync-moderated above; `pending` is reserved for future async/soft-hold.
        moderationStatus: PollCommentModerationStatus.approved,
        entitySpans,
        extractionStatus: PollCommentExtractionStatus.highlighted,
      },
    });

    await this.rebuildPollLeaderboard(pollId);
    this.gateway.emitPollUpdate(pollId);
    // §3 signals: the poll_comment act (the pre-ledger user_events
    // dual-write died in the full-plan red team, 2026-07-23).
    this.signals.record({
      kind: 'poll_comment',
      userId,
      subject: this.pollSignalSubject(poll),
      geo: null,
      placeId: poll.placeId,
      meta: { pollId },
    });
    return comment;
  }

  async editComment(commentId: string, dto: EditCommentDto, userId: string) {
    const comment = await this.requireOwnComment(commentId, userId);

    const body = this.sanitizer
      .sanitizeOrThrow(dto.body, { maxLength: 2000, allowEmpty: false })
      .trim();
    if (!body.length) {
      throw new BadRequestException('Comment body is required');
    }
    // WRITE PATH — policy 'hold': the comment is about to be persisted and
    // rendered to every reader of the poll.
    const bodyOutcome = resolveModeration(
      await this.moderation.moderateText(body),
      'hold',
    );
    if (!bodyOutcome.ok) {
      throw new BadRequestException(
        `Comment rejected by moderation: ${bodyOutcome.cause}`,
      );
    }

    const poll = await this.prisma.poll.findUnique({
      where: { pollId: comment.pollId },
      select: { placeId: true },
    });
    const entitySpans = await this.highlightCommentSpans(
      body,
      poll?.placeId ?? null,
    );
    const updated = await this.prisma.pollComment.update({
      where: { commentId },
      data: {
        body,
        editedAt: new Date(),
        entitySpans,
        extractionStatus: PollCommentExtractionStatus.highlighted,
      },
    });
    await this.rebuildPollLeaderboard(comment.pollId);
    this.gateway.emitPollUpdate(comment.pollId);
    return updated;
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.requireOwnComment(commentId, userId);
    await this.prisma.pollComment.update({
      where: { commentId },
      data: { deletedAt: new Date() },
    });
    await this.rebuildPollLeaderboard(comment.pollId);
    this.gateway.emitPollUpdate(comment.pollId);
    return { commentId, deleted: true };
  }

  /** §9b reportContent (Apple 1.2 UGC). v1 RECORDS ONLY — no auto-hide
   *  threshold; moderation is human for now and reads poll_comment_reports
   *  directly. State gates: the comment must exist, be non-deleted, and be
   *  approved (pending/rejected comments are not publicly visible — nothing
   *  to report). Dedupe = the unique (commentId, reporter) index; a repeat
   *  report is a quiet no-op. */
  async reportComment(commentId: string, userId: string, reason: string) {
    const comment = await this.prisma.pollComment.findUnique({
      where: { commentId },
      select: { deletedAt: true, moderationStatus: true },
    });
    if (
      !comment ||
      comment.deletedAt ||
      comment.moderationStatus !== PollCommentModerationStatus.approved
    ) {
      throw new NotFoundException('Comment not found');
    }
    try {
      await this.prisma.pollCommentReport.create({
        data: { commentId, reporterUserId: userId, reason },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { reported: true }; // already reported by this user
      }
      throw error;
    }
    return { reported: true };
  }

  private async requireOwnComment(commentId: string, userId: string) {
    const comment = await this.prisma.pollComment.findUnique({
      where: { commentId },
      select: { userId: true, pollId: true, deletedAt: true },
    });
    if (!comment || comment.deletedAt) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.userId !== userId) {
      throw new BadRequestException('You can only modify your own comment');
    }
    return comment;
  }

  async toggleCommentLike(commentId: string, userId: string) {
    const comment = await this.prisma.pollComment.findUnique({
      where: { commentId },
      select: { pollId: true, deletedAt: true },
    });
    if (!comment || comment.deletedAt) {
      throw new NotFoundException('Comment not found');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pollCommentLike.findUnique({
        where: { commentId_userId: { commentId, userId } },
      });
      if (existing) {
        await tx.pollCommentLike.delete({
          where: { commentId_userId: { commentId, userId } },
        });
        const updated = await tx.pollComment.update({
          where: { commentId },
          data: { score: { decrement: 1 } },
        });
        return { liked: false, score: updated.score };
      }
      await tx.pollCommentLike.create({ data: { commentId, userId } });
      const updated = await tx.pollComment.update({
        where: { commentId },
        data: { score: { increment: 1 } },
      });
      return { liked: true, score: updated.score };
    });

    await this.rebuildPollLeaderboard(comment.pollId);
    this.gateway.emitPollUpdate(comment.pollId);
    return result;
  }

  async listComments(
    pollId: string,
    userId: string | null,
    sort: 'top' | 'new' = 'top',
  ) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: { pollId: true },
    });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    // BLOCK FILTER (red-team 2026-08-02): the thread is the app's main UGC
    // surface and had NO block filtering, while restaurant-mentions.service
    // filters the SAME PollComment rows for the same viewer — an oversight,
    // not a decision. Bidirectional + viewer-scoped, identical semantics to
    // that sibling: an authed viewer never sees a blocked peer's comments;
    // anonymous viewers get no filter (nothing to scope by).
    const blockedPeers = userId
      ? await this.blocks.blockedPeerIds(userId)
      : new Set<string>();

    const comments = await this.prisma.pollComment.findMany({
      where: {
        pollId,
        deletedAt: null,
        ...(blockedPeers.size
          ? { userId: { notIn: Array.from(blockedPeers) } }
          : {}),
      },
      orderBy:
        sort === 'new'
          ? [{ loggedAt: 'desc' }]
          : [{ score: 'desc' }, { loggedAt: 'desc' }],
      select: {
        commentId: true,
        pollId: true,
        parentCommentId: true,
        body: true,
        score: true,
        publicId: true,
        entitySpans: true,
        loggedAt: true,
        editedAt: true,
        // AUTHOR_SELECT, not a hand-written field list: `deletedAt` is the
        // field the byline decision turns on, and a hand-written select is
        // exactly how it got left out everywhere.
        user: { select: AUTHOR_SELECT },
      },
    });

    let likedSet = new Set<string>();
    if (userId && comments.length) {
      const likes = await this.prisma.pollCommentLike.findMany({
        where: {
          userId,
          commentId: { in: comments.map((c) => c.commentId) },
        },
        select: { commentId: true },
      });
      likedSet = new Set(likes.map((l) => l.commentId));
    }

    // Flat list + parentCommentId — the client nests (presentational, shallow).
    return comments.map((c) => ({
      ...c,
      // A deleted author keeps their comment (removing it would tear a hole in
      // the thread) and loses their name. ONE function decides what the world
      // sees, so every surface agrees — see public-author-identity.
      user: publicAuthorIdentity(c.user),
      currentUserLiked: likedSet.has(c.commentId),
    }));
  }

  // ─── Endorsement leaderboard projection (Phase 4D) ───────────────────────

  /**
   * Project the comment thread into the leaderboard (§5, "gazetteer-live" default,
   * no sentiment in v1 — presence = endorsement, ~95%, corrected at close). A
   * comment's gazetteer spans are the subjects it endorses; its author and everyone
   * who liked it endorse those subjects; dedupe (user, subject) → COUNT(DISTINCT
   * user). Rebuilt on each interaction. Subject span type follows the axis:
   * `what_to_order` ranks dishes (food spans); every other ranked axis ranks
   * restaurants (restaurant spans). v1 uses `entity` subjects; the restaurant+dish
   * `Connection` refinement (§13) is formed at close-time (§6.3).
   */
  /** Public entry for the periodic backstop + close-time finalize (§2.4). */
  async refreshPollLeaderboard(pollId: string): Promise<void> {
    await this.rebuildPollLeaderboard(pollId);
  }

  /**
   * Dish-axis polls (best_dish / what_to_order / best_dish_attribute) rank
   * restaurant+dish Connections — every option is restaurant-anchored (plan §2.3).
   * Only best_restaurant_attribute ranks bare restaurant entities. A dish with no
   * resolvable restaurant is NOT a leaderboard row (it stays discussion-only).
   */
  private usesConnectionSubjects(
    topicType: PollTopicType | undefined,
  ): boolean {
    return (
      topicType === PollTopicType.best_dish ||
      topicType === PollTopicType.what_to_order ||
      topicType === PollTopicType.best_dish_attribute
    );
  }

  /**
   * Resolve the (restaurant, dish) pairs a comment's gazetteer spans endorse, per
   * the poll's axis. The fixed side comes from the topic; the variable side from
   * the comment. Pairs that can't be completed (e.g. a dish with no restaurant)
   * are dropped — never bare-entity rows.
   */
  private resolveConnectionPairs(
    topicType: PollTopicType | undefined,
    targets: { targetRestaurantId: string | null; targetDishId: string | null },
    spanRestaurantIds: string[],
    spanFoodIds: string[],
  ): Array<{ restaurantId: string; foodId: string }> {
    const pairs: Array<{ restaurantId: string; foodId: string }> = [];
    if (topicType === PollTopicType.what_to_order) {
      // Fixed restaurant (the poll's spot), variable dish from the comment.
      if (!targets.targetRestaurantId) return pairs;
      for (const foodId of spanFoodIds) {
        pairs.push({ restaurantId: targets.targetRestaurantId, foodId });
      }
    } else if (topicType === PollTopicType.best_dish) {
      // Fixed dish (the poll's axis), variable restaurant from the comment;
      // specific dishes named in the comment roll up to the axis dish.
      if (!targets.targetDishId) return pairs;
      for (const restaurantId of spanRestaurantIds) {
        pairs.push({ restaurantId, foodId: targets.targetDishId });
      }
    } else if (topicType === PollTopicType.best_dish_attribute) {
      // Both sides come from the comment — pair each restaurant with each dish.
      // NOTE (intentional v1): we do NOT filter pairs by the poll's attribute /
      // category target. The live Connection has no attribute data yet (those are
      // populated only at close-time graduation), and off-axis pairs naturally
      // rank low, so relevance self-corrects. Product-owner-approved deferral.
      for (const restaurantId of spanRestaurantIds) {
        for (const foodId of spanFoodIds) {
          pairs.push({ restaurantId, foodId });
        }
      }
    }
    return pairs;
  }

  private async rebuildPollLeaderboard(pollId: string): Promise<void> {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        mode: true,
        createdByUserId: true,
        placeId: true,
        topic: {
          select: {
            topicType: true,
            targetRestaurantId: true,
            targetDishId: true,
            // Creator's organic seed (Option A): scanned in place, no DB column.
            description: true,
          },
        },
      },
    });
    if (!poll || poll.mode === PollMode.discussion) {
      await this.prisma.pollLeaderboardEntry.deleteMany({ where: { pollId } });
      return;
    }

    const topicType = poll.topic?.topicType;
    const useConnections = this.usesConnectionSubjects(topicType);
    const subjectType = useConnections
      ? PollLeaderboardSubjectType.connection
      : PollLeaderboardSubjectType.entity;

    const comments = await this.prisma.pollComment.findMany({
      where: {
        pollId,
        deletedAt: null,
        moderationStatus: PollCommentModerationStatus.approved,
      },
      select: { commentId: true, userId: true, entitySpans: true },
    });
    const likes = await this.prisma.pollCommentLike.findMany({
      where: { comment: { pollId } },
      select: { commentId: true, userId: true },
    });
    const likersByComment = new Map<string, string[]>();
    for (const like of likes) {
      const arr = likersByComment.get(like.commentId);
      if (arr) arr.push(like.userId);
      else likersByComment.set(like.commentId, [like.userId]);
    }

    const spansOf = (comment: { entitySpans: unknown }): EntitySpan[] =>
      (Array.isArray(comment.entitySpans)
        ? comment.entitySpans
        : []) as EntitySpan[];
    const entityIdsOfType = (
      spans: EntitySpan[],
      type: EntityType,
    ): string[] => [
      ...new Set(
        spans
          .filter((s) => s?.type === type && s?.entityId)
          .map((s) => s.entityId),
      ),
    ];

    // subjectId → distinct endorsers. For restaurant-axis polls subjectId is the
    // restaurant entityId; for dish-axis polls it's a poll-local (restaurant,dish)
    // composite (see encodeConnectionSubjectId).
    const endorsers = new Map<string, Set<string>>();

    // §2 Option A: the creator's `description` is their organic seed — treated like
    // a comment, attributed to the creator's userId. Re-scanned in place (stateless;
    // the description is short and always-fresh is cleaner than a stored column).
    // The same Set<userId> dedup as comments means a creator who repeats the same
    // entity in a later comment still counts once.
    const description = poll.topic?.description?.trim();
    const createdByUserId = poll.createdByUserId;
    const descSpans: EntitySpan[] =
      description && createdByUserId
        ? await this.entityTextSearch.scanForKnownEntities(
            description,
            [
              EntityType.restaurant,
              EntityType.food,
              EntityType.food_attribute,
              EntityType.restaurant_attribute,
            ],
            { engineId: await this.engineIdForPlace(poll.placeId) },
          )
        : [];

    if (useConnections) {
      // Dish-axis: the subject identity is a poll-local (restaurant, dish)
      // composite — we deliberately do NOT write rows into the shared Connection
      // table (core_restaurant_items) here. Those are unverified comment mentions;
      // real Connections are minted only at close-time graduation by the verified
      // collection pipeline.
      const targets = {
        targetRestaurantId: poll.topic?.targetRestaurantId ?? null,
        targetDishId: poll.topic?.targetDishId ?? null,
      };
      for (const comment of comments) {
        const spans = spansOf(comment);
        const pairs = this.resolveConnectionPairs(
          topicType,
          targets,
          entityIdsOfType(spans, EntityType.restaurant),
          entityIdsOfType(spans, EntityType.food),
        );
        if (!pairs.length) continue;
        const endorsingUsers = [
          comment.userId,
          ...(likersByComment.get(comment.commentId) ?? []),
        ];
        for (const pair of pairs) {
          const subjectId = this.encodeConnectionSubjectId(
            pair.restaurantId,
            pair.foodId,
          );
          let set = endorsers.get(subjectId);
          if (!set) {
            set = new Set();
            endorsers.set(subjectId, set);
          }
          for (const u of endorsingUsers) set.add(u);
        }
      }
      // Fold the creator's description seed in — mirrors the comment logic exactly,
      // keyed by createdByUserId (guarded above: only runs when both exist).
      if (descSpans.length && createdByUserId) {
        const pairs = this.resolveConnectionPairs(
          topicType,
          targets,
          entityIdsOfType(descSpans, EntityType.restaurant),
          entityIdsOfType(descSpans, EntityType.food),
        );
        for (const pair of pairs) {
          const subjectId = this.encodeConnectionSubjectId(
            pair.restaurantId,
            pair.foodId,
          );
          let set = endorsers.get(subjectId);
          if (!set) {
            set = new Set();
            endorsers.set(subjectId, set);
          }
          set.add(createdByUserId);
        }
      }
    } else {
      // Restaurant-axis (best_restaurant_attribute): bare restaurant entity subjects.
      for (const comment of comments) {
        const subjectIds = entityIdsOfType(
          spansOf(comment),
          EntityType.restaurant,
        );
        if (!subjectIds.length) continue;
        const endorsingUsers = [
          comment.userId,
          ...(likersByComment.get(comment.commentId) ?? []),
        ];
        for (const subjectId of subjectIds) {
          let set = endorsers.get(subjectId);
          if (!set) {
            set = new Set();
            endorsers.set(subjectId, set);
          }
          for (const u of endorsingUsers) set.add(u);
        }
      }
      // Fold the creator's description seed in — mirrors the comment logic exactly,
      // keyed by createdByUserId (guarded above: only runs when both exist).
      if (descSpans.length && createdByUserId) {
        const subjectIds = entityIdsOfType(descSpans, EntityType.restaurant);
        for (const subjectId of subjectIds) {
          let set = endorsers.get(subjectId);
          if (!set) {
            set = new Set();
            endorsers.set(subjectId, set);
          }
          set.add(createdByUserId);
        }
      }
    }

    // Fold in direct per-candidate endorsements (tap-to-endorse on the bars) —
    // matched to this poll's subject kind — alongside comment-derived endorsers.
    const directEndorsements = await this.prisma.pollEndorsement.findMany({
      where: { pollId, subjectType },
      select: { subjectId: true, userId: true },
    });
    for (const endorsement of directEndorsements) {
      let set = endorsers.get(endorsement.subjectId);
      if (!set) {
        set = new Set();
        endorsers.set(endorsement.subjectId, set);
      }
      set.add(endorsement.userId);
    }

    // ONE-HOP REDIRECT RESOLUTION (F541). A direct tap-to-endorse stores the
    // restaurant's entityId (or a restaurant::dish composite) as it stood at tap
    // time; if that restaurant is later MERGED, its endorsement keeps pointing at
    // the now-archived id and silently splits from — or is lost against — the
    // survivor's endorsements. (Comment spans re-scan and self-heal; a stored tap
    // never does.) Resolve every subject key through the redirect table and MERGE
    // the endorser sets so a merged-after-tap endorsement lands on the survivor.
    // The writer keeps chains flat (one hop — merge-writer spec), so a single
    // lookup is sufficient.
    const resolvedEndorsers = await this.resolveLeaderboardSubjectRedirects(
      endorsers,
      useConnections,
    );

    const ranked = [...resolvedEndorsers.entries()]
      .map(([subjectId, users]) => ({
        subjectId,
        distinctEndorsers: users.size,
      }))
      .sort((a, b) => b.distinctEndorsers - a.distinctEndorsers);

    await this.prisma.$transaction(async (tx) => {
      // Serialize rebuilds PER POLL (2026-07-13): delete+createMany is not safe under
      // concurrency — the hourly cron racing an interaction-time rebuild (or a second
      // API process's cron) yields delete/delete/insert/insert → unique violation on
      // (poll_id, subject_type, subject_id), which silently starved the leaderboard
      // every hour. A transaction-scoped advisory lock makes concurrent rebuilds of
      // the SAME poll queue instead of colliding; different polls stay parallel.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pollId}))`;
      await tx.pollLeaderboardEntry.deleteMany({ where: { pollId } });
      if (ranked.length) {
        await tx.pollLeaderboardEntry.createMany({
          data: ranked.map((r, i) => ({
            pollId,
            subjectType,
            subjectId: r.subjectId,
            distinctEndorsers: r.distinctEndorsers,
            score: r.distinctEndorsers,
            rank: i + 1,
          })),
        });
      }
    });
  }

  /**
   * Redirect-resolve leaderboard subject keys (F541), merging endorser sets that
   * collapse onto the same survivor. For entity subjects the key IS a restaurant
   * entityId; for connection subjects it is a `restaurantId::foodId` composite and
   * BOTH parts resolve. One-hop (writer keeps redirect chains flat).
   */
  private async resolveLeaderboardSubjectRedirects(
    endorsers: Map<string, Set<string>>,
    useConnections: boolean,
  ): Promise<Map<string, Set<string>>> {
    if (endorsers.size === 0) {
      return endorsers;
    }
    // Collect every entity id referenced by a subject key.
    const entityIds = new Set<string>();
    for (const subjectId of endorsers.keys()) {
      if (useConnections) {
        const parts = this.decodeConnectionSubjectId(subjectId);
        if (parts) {
          entityIds.add(parts.restaurantId);
          entityIds.add(parts.foodId);
        }
      } else {
        entityIds.add(subjectId);
      }
    }
    const redirects = await this.prisma.entityRedirect.findMany({
      where: { fromEntityId: { in: [...entityIds] } },
      select: { fromEntityId: true, toEntityId: true },
    });
    if (redirects.length === 0) {
      return endorsers;
    }
    const redirectMap = new Map(
      redirects.map((r) => [r.fromEntityId, r.toEntityId]),
    );
    const resolve = (id: string): string => redirectMap.get(id) ?? id;

    const resolved = new Map<string, Set<string>>();
    for (const [subjectId, users] of endorsers.entries()) {
      let key = subjectId;
      if (useConnections) {
        const parts = this.decodeConnectionSubjectId(subjectId);
        if (parts) {
          key = this.encodeConnectionSubjectId(
            resolve(parts.restaurantId),
            resolve(parts.foodId),
          );
        }
      } else {
        key = resolve(subjectId);
      }
      const existing = resolved.get(key);
      if (existing) {
        for (const u of users) existing.add(u);
      } else {
        resolved.set(key, new Set(users));
      }
    }
    return resolved;
  }

  // Dish-axis leaderboard subjects are poll-local (restaurant, dish) composites,
  // NOT shared Connection rows — so the live leaderboard never writes unverified
  // pairs into core_restaurant_items. UUIDs contain no "::", so the split is safe.
  private encodeConnectionSubjectId(
    restaurantId: string,
    foodId: string,
  ): string {
    return `${restaurantId}::${foodId}`;
  }

  private decodeConnectionSubjectId(
    subjectId: string,
  ): { restaurantId: string; foodId: string } | null {
    const parts = subjectId.split('::');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { restaurantId: parts[0], foodId: parts[1] };
  }

  /**
   * Resolve restaurant/food names for poll-local connection subject ids in one
   * Entity query (the subjects don't reference a Connection row, so names come
   * straight from the encoded entity ids).
   */
  private async resolveConnectionSubjectNames(
    subjectIds: string[],
  ): Promise<
    Map<string, { restaurantName: string | null; foodName: string | null }>
  > {
    const result = new Map<
      string,
      { restaurantName: string | null; foodName: string | null }
    >();
    const decoded = subjectIds
      .map((subjectId) => ({
        subjectId,
        parts: this.decodeConnectionSubjectId(subjectId),
      }))
      .filter(
        (
          d,
        ): d is {
          subjectId: string;
          parts: { restaurantId: string; foodId: string };
        } => d.parts != null,
      );
    if (!decoded.length) return result;
    const entityIds = new Set<string>();
    for (const d of decoded) {
      entityIds.add(d.parts.restaurantId);
      entityIds.add(d.parts.foodId);
    }
    const names = new Map<string, string | null>();
    const entities = await this.prisma.entity.findMany({
      where: { entityId: { in: [...entityIds] } },
      select: { entityId: true, name: true },
    });
    for (const e of entities) names.set(e.entityId, e.name);
    for (const d of decoded) {
      result.set(d.subjectId, {
        restaurantName: names.get(d.parts.restaurantId) ?? null,
        foodName: names.get(d.parts.foodId) ?? null,
      });
    }
    return result;
  }

  /**
   * Display label for a restaurant+dish Connection subject — the side the poll is
   * choosing among (a dish for fixed-restaurant polls, a restaurant for fixed-dish
   * polls, "Dish at Restaurant" for the free-form attribute axis).
   */
  private formatConnectionDisplayName(
    topicType: PollTopicType | undefined,
    restaurantName: string | null,
    foodName: string | null,
  ): string | null {
    if (topicType === PollTopicType.what_to_order) {
      return foodName ?? restaurantName;
    }
    if (topicType === PollTopicType.best_dish) {
      return restaurantName ?? foodName;
    }
    if (foodName && restaurantName) {
      return `${foodName} at ${restaurantName}`;
    }
    return foodName ?? restaurantName;
  }

  /** Resolve display name/type for leaderboard subjects (entity OR connection). */
  private async resolveLeaderboardSubjectDisplay(
    subjects: Array<{
      subjectType: PollLeaderboardSubjectType;
      subjectId: string;
    }>,
    topicType: PollTopicType | undefined,
  ): Promise<Map<string, { name: string | null; type: string | null }>> {
    const display = new Map<
      string,
      { name: string | null; type: string | null }
    >();
    const entityIds = subjects
      .filter((s) => s.subjectType === PollLeaderboardSubjectType.entity)
      .map((s) => s.subjectId);
    const connectionIds = subjects
      .filter((s) => s.subjectType === PollLeaderboardSubjectType.connection)
      .map((s) => s.subjectId);
    if (entityIds.length) {
      const entities = await this.prisma.entity.findMany({
        // F4 (product red team): an archived loser's bar must not keep
        // rendering the dead name as if live; the rekey handles rows, this
        // handles any straggler until the next rebuild.
        where: { entityId: { in: entityIds }, status: 'active' },
        select: { entityId: true, name: true, type: true },
      });
      for (const e of entities) {
        display.set(e.entityId, { name: e.name, type: e.type });
      }
    }
    if (connectionIds.length) {
      const connectionNames =
        await this.resolveConnectionSubjectNames(connectionIds);
      for (const [subjectId, names] of connectionNames) {
        display.set(subjectId, {
          name: this.formatConnectionDisplayName(
            topicType,
            names.restaurantName,
            names.foodName,
          ),
          type: 'connection',
        });
      }
    }
    return display;
  }

  async getPollLeaderboard(pollId: string, viewerUserId?: string | null) {
    const entries = await this.prisma.pollLeaderboardEntry.findMany({
      where: { pollId },
      orderBy: { rank: 'asc' },
    });
    if (!entries.length) return [];
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: { topic: { select: { topicType: true } } },
    });
    const display = await this.resolveLeaderboardSubjectDisplay(
      entries,
      poll?.topic?.topicType,
    );
    const endorsedByViewer = viewerUserId
      ? new Set(
          (
            await this.prisma.pollEndorsement.findMany({
              where: { pollId, userId: viewerUserId },
              select: { subjectId: true },
            })
          ).map((row) => row.subjectId),
        )
      : new Set<string>();
    return entries.map((e) => ({
      rank: e.rank,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      name: display.get(e.subjectId)?.name ?? null,
      type: display.get(e.subjectId)?.type ?? null,
      distinctEndorsers: e.distinctEndorsers,
      currentUserEndorsed: endorsedByViewer.has(e.subjectId),
    }));
  }

  /**
   * Toggle a viewer's direct endorsement of an existing leaderboard candidate
   * (tap-to-endorse on the bars). New candidates only ever enter via discussion,
   * so the subject must already be on the leaderboard — you can endorse what's
   * there, not conjure a candidate. Rebuilds the leaderboard and returns the fresh
   * standings (with the viewer's endorsement flags) so the UI can settle in place.
   */
  async togglePollEndorsement(
    pollId: string,
    subjectId: string,
    userId: string,
    subjectType: PollLeaderboardSubjectType = PollLeaderboardSubjectType.entity,
    /** Vote-time audit context (plans/vote-integrity-ladder.md): best-effort
     *  device key + request ip. The ip is HMAC'd below — never stored raw. */
    auditContext?: { ip?: string | null; deviceKey?: string | null },
  ) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        state: true,
        question: true,
        placeId: true,
        topic: {
          select: {
            targetDishId: true,
            targetRestaurantId: true,
            targetFoodAttributeId: true,
            targetRestaurantAttributeId: true,
          },
        },
      },
    });
    if (!poll) {
      throw new NotFoundException('poll not found');
    }
    if (poll.state !== PollState.active) {
      throw new BadRequestException('poll is no longer open for endorsements');
    }

    const candidate = await this.prisma.pollLeaderboardEntry.findUnique({
      where: {
        pollId_subjectType_subjectId: { pollId, subjectType, subjectId },
      },
      select: { subjectId: true },
    });
    if (!candidate) {
      throw new BadRequestException(
        'not a poll candidate — add it through the discussion first',
      );
    }

    const key = {
      pollId_subjectType_subjectId_userId: {
        pollId,
        subjectType,
        subjectId,
        userId,
      },
    };
    const existing = await this.prisma.pollEndorsement.findUnique({
      where: key,
      select: { userId: true },
    });
    let endorsed: boolean;
    if (existing) {
      await this.prisma.pollEndorsement.delete({ where: key });
      endorsed = false;
    } else {
      await this.prisma.pollEndorsement.create({
        data: { pollId, subjectType, subjectId, userId },
      });
      endorsed = true;

      // DUAL-WRITE (delete with old logging — master plan §22, one-milestone hard deletion)
      // §3 signals: an endorsement IS the poll vote act (append-only ledger —
      // un-endorsing removes the endorsement row, never the signal). Geo =
      // the poll PLACE's bbox for place-keyed polls, the legacy market bbox
      // otherwise (skip-with-debug when unresolvable) — red-team 3e. Meta
      // carries the endorsed candidate itself: the mutable pollEndorsement
      // row can be deleted, so the ledger must hold WHAT was voted for, not
      // just which poll.
      this.signals.record({
        kind: 'poll_vote',
        userId,
        subject: this.pollSignalSubject(poll),
        geo: null,
        placeId: poll.placeId,
        meta: {
          pollId,
          endorsedSubjectId: subjectId,
          endorsedSubjectType: subjectType,
          // Vote-integrity audit fields (plans/vote-integrity-ladder.md):
          // the one skip-forever-lose-forever capture. deviceKeyHmac =
          // keyed HMAC of the keychain install id; ipHmac/ipSubnetHmac =
          // keyed HMACs of the canonicalized IP/subnet. All equality-
          // joinable, never reversible: the append-only ledger must hold NO
          // redactable identifier, so the RAW device key (like the raw ip)
          // never enters it — it lives only in the retention-manageable
          // user_devices table, while the HMAC preserves every equality
          // join. Absent inputs / absent SIGNAL_AUDIT_HMAC_KEY → fields
          // omitted, never faked.
          ...((): Record<string, string> => {
            const deviceKeyHmac = hmacDeviceKey(
              auditContext?.deviceKey,
              (message) => this.logger.warn(message),
            );
            return deviceKeyHmac ? { deviceKeyHmac } : {};
          })(),
          ...(computeIpAuditHmacs(auditContext?.ip, (message) =>
            this.logger.warn(message),
          ) ?? {}),
        },
      });
    }

    await this.rebuildPollLeaderboard(pollId);
    const leaderboard = await this.getPollLeaderboard(pollId, userId);
    return { endorsed, leaderboard };
  }

  /** User-profile Comments section (page-registry §7.3): the user's live
   *  comment rows, newest first, with enough poll context to open
   *  pollDetail scrolled to the comment. §8.6 block gating happens at the
   *  controller. */
  async listCommentsByUser(userId: string, limit = 50) {
    const rows = await this.prisma.pollComment.findMany({
      where: {
        userId,
        deletedAt: null,
        moderationStatus: PollCommentModerationStatus.approved,
      },
      orderBy: { loggedAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        commentId: true,
        pollId: true,
        body: true,
        score: true,
        loggedAt: true,
        poll: {
          select: {
            pollId: true,
            topic: { select: { title: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      commentId: row.commentId,
      pollId: row.pollId,
      body: row.body,
      score: row.score,
      loggedAt: row.loggedAt,
      pollTitle: row.poll?.topic?.title ?? null,
    }));
  }

  async listPollsForUser(userId: string, query: ListUserPollsDto) {
    const activity = query.activity ?? UserPollActivity.participated;
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const state = query.state;

    if (activity === UserPollActivity.created) {
      const polls = await this.prisma.poll.findMany({
        where: {
          createdByUserId: userId,
          state,
        },
        orderBy: [{ launchedAt: 'desc' }, { scheduledFor: 'desc' }],
        skip: offset,
        take: limit,
        include: {
          topic: {
            select: {
              topicType: true,
              targetDishId: true,
              targetRestaurantId: true,
              targetFoodAttributeId: true,
              targetRestaurantAttributeId: true,
              title: true,
              description: true,
              metadata: true,
            },
          },
        },
      });

      const enriched = await this.attachPlaceLabels(polls);
      return {
        activity,
        polls: enriched,
      };
    }

    const pollIds = new Set<string>();
    if (
      activity === UserPollActivity.commented ||
      activity === UserPollActivity.participated
    ) {
      const comments = await this.prisma.pollComment.findMany({
        where: { userId, deletedAt: null },
        select: { pollId: true },
        distinct: ['pollId'],
      });
      for (const comment of comments) {
        pollIds.add(comment.pollId);
      }
    }
    if (activity === UserPollActivity.participated) {
      const created = await this.prisma.poll.findMany({
        where: { createdByUserId: userId },
        select: { pollId: true },
      });
      for (const poll of created) {
        pollIds.add(poll.pollId);
      }
    }

    const polls =
      pollIds.size > 0
        ? await this.prisma.poll.findMany({
            where: {
              pollId: { in: Array.from(pollIds.values()) },
              state,
            },
            orderBy: [{ launchedAt: 'desc' }, { scheduledFor: 'desc' }],
            skip: offset,
            take: limit,
            include: {
              topic: {
                select: {
                  topicType: true,
                  targetDishId: true,
                  targetRestaurantId: true,
                  targetFoodAttributeId: true,
                  targetRestaurantAttributeId: true,
                  title: true,
                  description: true,
                  metadata: true,
                },
              },
            },
          })
        : [];

    const enriched = await this.attachPollStats(
      await this.attachPlaceLabels(polls),
      userId,
    );
    return {
      activity,
      polls: enriched,
    };
  }

  /**
   * Enrich a poll list with the card's Reddit-style stats: comment count, distinct
   * endorser (participant) count, and the creator (avatar for user-created polls;
   * origin flag so app/curated polls render a placeholder icon instead).
   */
  private async attachPollStats<
    T extends {
      pollId: string;
      createdByUserId?: string | null;
      origin?: PollOrigin;
      state?: PollState;
      launchedAt?: Date | string | null;
    },
  >(
    polls: T[],
    viewerUserId?: string | null,
  ): Promise<
    Array<
      T & {
        commentCount: number;
        endorserCount: number;
        closesAt: Date | null;
        topCandidates: Array<{
          rank: number;
          subjectType: PollLeaderboardSubjectType;
          subjectId: string;
          name: string | null;
          distinctEndorsers: number;
          currentUserEndorsed: boolean;
        }>;
        creator: {
          origin: PollOrigin;
          username: string | null;
          displayName: string | null;
          avatarUrl: string | null;
        };
      }
    >
  > {
    if (!polls.length) {
      return polls as never;
    }
    const pollIds = polls.map((poll) => poll.pollId);
    const countRows = await this.prisma.$queryRaw<
      Array<{ poll_id: string; comment_count: bigint; endorser_count: bigint }>
    >(Prisma.sql`
      SELECT poll_id,
             COUNT(*) AS comment_count,
             COUNT(DISTINCT user_id) AS endorser_count
      FROM poll_comments
      WHERE poll_id IN (${Prisma.join(pollIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND deleted_at IS NULL
        AND moderation_status::text = 'approved'
      GROUP BY poll_id
    `);
    const statsByPoll = new Map(
      countRows.map((row) => [
        row.poll_id,
        {
          commentCount: Number(row.comment_count),
          endorserCount: Number(row.endorser_count),
        },
      ]),
    );

    // Top-N leaderboard candidates per poll ("see the poll" on the card) + the
    // viewer's endorsement flags so each bar renders its tap-to-endorse state.
    const POLL_CARD_TOP_CANDIDATES = 4;
    const candidateRows = await this.prisma.pollLeaderboardEntry.findMany({
      where: {
        pollId: { in: pollIds },
        rank: { lte: POLL_CARD_TOP_CANDIDATES },
      },
      orderBy: { rank: 'asc' },
      select: {
        pollId: true,
        rank: true,
        subjectType: true,
        subjectId: true,
        distinctEndorsers: true,
      },
    });
    // Resolve candidate display names — entity subjects via Entity, connection
    // (restaurant+dish) subjects via their poll-local composite, formatted per the
    // poll's axis.
    const entitySubjectIds = Array.from(
      new Set(
        candidateRows
          .filter(
            (row) => row.subjectType === PollLeaderboardSubjectType.entity,
          )
          .map((row) => row.subjectId),
      ),
    );
    const connectionSubjectIds = Array.from(
      new Set(
        candidateRows
          .filter(
            (row) => row.subjectType === PollLeaderboardSubjectType.connection,
          )
          .map((row) => row.subjectId),
      ),
    );
    const candidateNameById = new Map(
      (entitySubjectIds.length
        ? await this.prisma.entity.findMany({
            where: { entityId: { in: entitySubjectIds } },
            select: { entityId: true, name: true },
          })
        : []
      ).map((row) => [row.entityId, row.name]),
    );
    const connectionNameById =
      await this.resolveConnectionSubjectNames(connectionSubjectIds);
    const topicTypeByPoll = new Map(
      connectionSubjectIds.length
        ? (
            await this.prisma.poll.findMany({
              where: { pollId: { in: pollIds } },
              select: { pollId: true, topic: { select: { topicType: true } } },
            })
          ).map((p) => [p.pollId, p.topic?.topicType])
        : [],
    );
    const resolveCandidateName = (row: {
      pollId: string;
      subjectType: PollLeaderboardSubjectType;
      subjectId: string;
    }): string | null => {
      if (row.subjectType === PollLeaderboardSubjectType.connection) {
        const names = connectionNameById.get(row.subjectId);
        return this.formatConnectionDisplayName(
          topicTypeByPoll.get(row.pollId),
          names?.restaurantName ?? null,
          names?.foodName ?? null,
        );
      }
      return candidateNameById.get(row.subjectId) ?? null;
    };
    const viewerEndorsements = viewerUserId
      ? await this.prisma.pollEndorsement.findMany({
          where: { pollId: { in: pollIds }, userId: viewerUserId },
          select: { pollId: true, subjectId: true },
        })
      : [];
    const viewerEndorsedKeys = new Set(
      viewerEndorsements.map((row) => `${row.pollId}:${row.subjectId}`),
    );
    const candidatesByPoll = new Map<
      string,
      Array<{
        rank: number;
        subjectType: PollLeaderboardSubjectType;
        subjectId: string;
        name: string | null;
        distinctEndorsers: number;
        currentUserEndorsed: boolean;
      }>
    >();
    for (const row of candidateRows) {
      const list = candidatesByPoll.get(row.pollId) ?? [];
      list.push({
        rank: row.rank,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        name: resolveCandidateName(row),
        distinctEndorsers: row.distinctEndorsers,
        currentUserEndorsed: viewerEndorsedKeys.has(
          `${row.pollId}:${row.subjectId}`,
        ),
      });
      candidatesByPoll.set(row.pollId, list);
    }

    const creatorIds = Array.from(
      new Set(
        polls
          .map((poll) => poll.createdByUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const creatorRows = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { userId: { in: creatorIds } },
          select: AUTHOR_SELECT,
        })
      : [];
    const creatorById = new Map(creatorRows.map((row) => [row.userId, row]));

    return polls.map((poll) => {
      const stats = statsByPoll.get(poll.pollId) ?? {
        commentCount: 0,
        endorserCount: 0,
      };
      const origin = poll.origin ?? PollOrigin.seeded;
      const user =
        origin === PollOrigin.user && poll.createdByUserId
          ? creatorById.get(poll.createdByUserId)
          : null;
      return {
        ...poll,
        commentCount: stats.commentCount,
        endorserCount: stats.endorserCount,
        closesAt:
          poll.state === PollState.active
            ? resolvePollClosesAt(
                poll.launchedAt,
                extractCloseWindowDays(
                  (poll as { metadata?: unknown }).metadata,
                ),
              )
            : null,
        topCandidates: candidatesByPoll.get(poll.pollId) ?? [],
        creator: {
          origin,
          // A poll outlives its creator's account; the byline does not.
          ...publicAuthorIdentity(user),
        },
      };
    });
  }

  private buildPollQuestion(
    topicType: PollTopicType,
    targetName: string,
  ): string {
    switch (topicType) {
      case PollTopicType.best_dish:
        return `Best ${targetName}`;
      case PollTopicType.what_to_order:
        return `What to order at ${targetName}?`;
      case PollTopicType.best_dish_attribute:
        return `Best ${targetName} dish`;
      case PollTopicType.best_restaurant_attribute:
        return `Best ${targetName} restaurants`;
      default:
        return targetName;
    }
  }
}
