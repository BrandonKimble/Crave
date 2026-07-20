import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  PollState,
  PollMode,
  PollOrigin,
  PollCommentModerationStatus,
  PollCommentExtractionStatus,
  PollLeaderboardSubjectType,
  EntityType,
  PollTopicStatus,
  PollTopicType,
  Prisma,
  type Place,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService, TextSanitizerService } from '../../shared';
import { ModerationService } from '../moderation/moderation.service';
import { SignalBbox, SignalsService } from '../signals/signals.service';
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
import { UserEventService } from '../identity/user-event.service';
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
import {
  descendantPlaceIds,
  isSubdivisionOrBigger,
} from '../places/place-dag-read';
import { GeoBbox, bboxArea, bboxCenter } from '../places/place-geo';
import { isTooBigForView } from '../places/subjects';
import {
  FeedPlaceCandidate,
  resolveFeedMembership,
} from './poll-feed-membership';
import {
  PollFeedCursor,
  decodePollFeedCursor,
  encodePollFeedCursor,
} from './poll-feed-cursor';

// Stage-1 dedup threshold: high (precision-favoring) so only obvious duplicate
// questions are surfaced — "best tacos" vs "best taco truck" should NOT collide;
// the precise entity-level dedup runs post-resolution (stage 3).
const POLL_DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

// Per-user soft cap (§5): a creator may start at most this many polls per market in a
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
    private readonly userEventService: UserEventService,
    private readonly llmService: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
    private readonly signals: SignalsService,
    private readonly placesCatalog: PlacesCatalogService,
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

  /**
   * §3 signal geo for poll acts (red-team 3e): a PLACE-keyed poll attributes
   * to its place's bbox — the closed loop that feeds poll_vote back into the
   * place's demand mass and answerYield. Only legacy market-keyed polls
   * (placeId null) still walk the marketKey path; both helpers never reject,
   * so the promise is safe un-awaited as RecordSignalInput.geo.
   */
  private pollSignalGeo(poll: {
    placeId: string | null;
    marketKey: string | null;
  }): Promise<SignalBbox | null> {
    return poll.placeId
      ? this.signals.bboxFromPlace(poll.placeId)
      : this.signals.bboxFromMarketKey(poll.marketKey);
  }

  /**
   * §6 POLLS FEED — polls of places in view (+ descendants of the
   * commensurate subject), keyset CURSOR pagination (the take-25 hard limit
   * is dead), §2 header verdict in the response metadata.
   *
   * Membership: placesInView(bounds) → the §2 subjecthood judgment
   * (resolveHeaderPlace — the SAME derivation search's displayMarketName
   * uses) → feed members = in-view places (minus over-scale subdivision+
   * places, §4's feed-at-that-zoom boundary) ∪ descendants of the
   * commensurate subject(s). Legacy marketKey-only poll rows join via their
   * market's bbox intersecting the view — an INTERIM seam until Phase C
   * purges marketKey from polls entirely.
   *
   * Response carries BOTH the new contract (header / promise / nextCursor /
   * per-poll placeName) and the legacy envelope fields pre-cut mobile
   * renders (marketName = the header verdict, polls array) — the mobile cut
   * lands next and deletes the legacy block.
   */
  async queryPolls(query: QueryPollsDto, viewerUserId?: string | null) {
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

    const view = await this.resolveFeedView(query);
    if (!view) {
      return this.buildFeedResponse({
        headerPlaceName: null,
        polls: [],
        nextCursor: null,
        promiseEligible: false,
      });
    }

    const membership = await this.resolveViewportMembership(view);
    const legacyMarketKeys = await this.legacyMarketKeysInView(view);

    const page = await this.queryFeedPage({
      state: targetState,
      mode: targetMode,
      launchedAfter,
      placeIds: membership.placeIds,
      marketKeys: legacyMarketKeys,
      sort,
      limit,
      cursor,
    });
    const polls = await this.hydrateFeedPolls(page.pollIds, viewerUserId);

    return this.buildFeedResponse({
      headerPlaceName: membership.headerPlaceName,
      polls,
      nextCursor: page.nextCursor,
      // §6 cold-start promise: first page, zero polls, but the viewport DOES
      // resolve to a place (a seeded town) — the copy is mobile's.
      promiseEligible: cursor === null && polls.length === 0,
    });
  }

  /**
   * The feed view. `bounds` is the contract; the marketKey arm serves
   * PRE-CUT mobile builds that send a cached marketKey instead (their
   * market's stored bbox becomes the view) — dies with the mobile feed cut.
   */
  private async resolveFeedView(query: QueryPollsDto): Promise<GeoBbox | null> {
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
    const marketKey = query.marketKey?.trim();
    if (!marketKey) {
      return null;
    }
    const market = await this.prisma.market.findFirst({
      where: { marketKey: { equals: marketKey, mode: 'insensitive' } },
      select: {
        bboxSwLat: true,
        bboxSwLng: true,
        bboxNeLat: true,
        bboxNeLng: true,
      },
    });
    if (
      !market ||
      market.bboxSwLat == null ||
      market.bboxSwLng == null ||
      market.bboxNeLat == null ||
      market.bboxNeLng == null
    ) {
      return null;
    }
    return {
      minLat: Number(market.bboxSwLat),
      minLng: Number(market.bboxSwLng),
      maxLat: Number(market.bboxNeLat),
      maxLng: Number(market.bboxNeLng),
    };
  }

  /** §6/§2/§4: in-view membership + header verdict + descendant expansion. */
  private async resolveViewportMembership(view: GeoBbox): Promise<{
    placeIds: string[];
    headerPlaceName: string | null;
  }> {
    const placesInView = await this.placesCatalog.placesInView(view);
    const candidates: FeedPlaceCandidate[] = placesInView.map((entry) => ({
      placeId: entry.place.placeId,
      name: entry.place.name,
      bbox: entry.bbox,
      coverageOfView: entry.coverageOfView,
      placeArea: entry.placeArea,
    }));
    // §4 feed half: only OVER-SCALE candidates ever need the structural
    // subdivision+ judgment (a handful of ancestors per view).
    const viewArea = bboxArea(view);
    const bigPlaceIds = new Set<string>();
    for (const candidate of candidates) {
      if (
        isTooBigForView(viewArea, candidate.placeArea) &&
        (await isSubdivisionOrBigger(this.prisma, candidate.placeId))
      ) {
        bigPlaceIds.add(candidate.placeId);
      }
    }
    const membership = resolveFeedMembership(view, candidates, bigPlaceIds);
    const descendants = membership.subjectPlaceIds.length
      ? await descendantPlaceIds(this.prisma, membership.subjectPlaceIds)
      : [];
    return {
      placeIds: [...new Set([...membership.memberPlaceIds, ...descendants])],
      headerPlaceName: membership.headerPlaceName,
    };
  }

  /**
   * INTERIM legacy feed arm: legacy marketKey-only poll rows are fed by
   * their market's bbox intersecting the view. Legacy markets are plain
   * (non-antimeridian) US metros, so the btree range test is exact here.
   * Phase C kept this deliberately (only NEW writes re-keyed to placeId);
   * it dies with the LEGACY-POLL-EXPIRY leg (all legacy rows closed/expired),
   * which also purges polls.market_key + this market bbox read.
   */
  private async legacyMarketKeysInView(view: GeoBbox): Promise<string[]> {
    const markets = await this.prisma.market.findMany({
      where: {
        isActive: true,
        bboxSwLat: { lte: view.maxLat },
        bboxNeLat: { gte: view.minLat },
        bboxSwLng: { lte: view.maxLng },
        bboxNeLng: { gte: view.minLng },
      },
      select: { marketKey: true },
    });
    return markets.map((market) => market.marketKey.toLowerCase());
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
    marketKeys: string[];
    sort: PollListSort;
    limit: number;
    cursor: PollFeedCursor | null;
  }): Promise<{ pollIds: string[]; nextCursor: string | null }> {
    const { state, mode, launchedAfter, placeIds, marketKeys, sort, limit } =
      params;
    if (!placeIds.length && !marketKeys.length) {
      return { pollIds: [], nextCursor: null };
    }
    // §6 membership: place-keyed rows by placeId; legacy marketKey-only rows
    // via their in-view market (placeId is the truth when both exist).
    const filters = Prisma.sql`
      p.state::text = ${state}
      AND (${mode}::text IS NULL OR p.mode::text = ${mode}::text)
      AND (${launchedAfter}::timestamptz IS NULL OR p.launched_at >= ${launchedAfter}::timestamptz)
      AND (
        p.place_id = ANY(${placeIds}::uuid[])
        OR (
          p.place_id IS NULL
          AND p.market_key IS NOT NULL
          AND LOWER(p.market_key) = ANY(${marketKeys}::text[])
        )
      )
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
              * (EXTRACT(EPOCH FROM (${new Date(refMs)}::timestamptz - en.last_ts)) / 86400.0)
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
      WITH engagement AS (
        SELECT poll_id, user_id, MAX(ts) AS last_ts
        FROM (
          SELECT poll_id, user_id, created_at AS ts FROM poll_endorsements
          UNION ALL
          SELECT poll_id, user_id, logged_at AS ts FROM poll_comments WHERE deleted_at IS NULL
        ) events
        GROUP BY poll_id, user_id
      )
      SELECT p.poll_id, p.created_at, ${metricExpr} AS metric
      FROM polls p
      LEFT JOIN engagement en ON en.poll_id = p.poll_id
      WHERE ${filters}
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
  private async hydrateFeedPolls(
    pollIds: string[],
    viewerUserId?: string | null,
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
            marketKey: true,
            title: true,
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
    const labeled = await this.attachPlaceLabels(
      await this.attachMarketLabels(ordered),
    );
    return this.attachPollStats(labeled, viewerUserId);
  }

  /**
   * §6 per-poll place labels: ONE batch place lookup for the page. Legacy
   * marketKey rows keep their attachMarketLabels name; place-keyed rows also
   * mirror placeName into marketName so pre-cut mobile renders a label.
   */
  private async attachPlaceLabels<
    T extends { placeId?: string | null; marketName?: string | null },
  >(polls: T[]): Promise<Array<T & { placeName: string | null }>> {
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
        marketName: poll.marketName ?? placeName,
      };
    });
  }

  /**
   * Feed response envelope. New contract: header (§2 verdict; null renders
   * "Polls in this area"), typed cold-start promise (§6), nextCursor. The
   * legacy fields exist ONLY for pre-cut mobile (marketName carries the
   * header verdict; marketKey is dead) and are deleted with the mobile cut.
   */
  private buildFeedResponse(params: {
    headerPlaceName: string | null;
    polls: unknown[];
    nextCursor: string | null;
    promiseEligible: boolean;
  }) {
    const { headerPlaceName, polls, nextCursor } = params;
    const promise =
      params.promiseEligible && headerPlaceName
        ? // Typed state only — "Polls drop Sundays — this town's first
          // unlocks as people search and vote." is MOBILE copy (§6).
          { kind: 'weekly_drop_pending' as const, placeName: headerPlaceName }
        : null;
    return {
      header: { placeName: headerPlaceName },
      promise,
      polls,
      nextCursor,
      // ─── legacy envelope (pre-cut mobile; dies with the mobile cut) ───
      marketKey: null,
      marketName: headerPlaceName,
      marketStatus: 'resolved' as const,
      candidateLocalityName: null,
      candidateBoundaryProvider: null,
      candidateBoundaryId: null,
      candidateBoundaryType: null,
      cta: {
        kind: 'create_poll' as const,
        label: headerPlaceName
          ? `Create a poll for ${headerPlaceName}`
          : 'Create a poll',
        prompt: headerPlaceName
          ? `Create a poll for ${headerPlaceName}`
          : 'Create a poll',
      },
    };
  }

  /**
   * Phase C re-key: user poll creation attaches to the PLACE CATALOG — the
   * poll's place = smallestContaining(creation-context bbox) (§3 attribution
   * law over the creator's viewport bounds). Legacy pre-cut clients that
   * send only a marketKey resolve through that market's stored bbox. No
   * market is ever minted for a poll again.
   */
  private async resolveCreationPlace(dto: {
    bounds?: {
      northEast: { lat: number; lng: number };
      southWest: { lat: number; lng: number };
    } | null;
    marketKey?: string | null;
  }): Promise<Place | null> {
    const view = await this.resolveFeedView({
      bounds: dto.bounds ?? undefined,
      marketKey: dto.marketKey ?? undefined,
    } as QueryPollsDto);
    if (!view) {
      return null;
    }
    return this.placesCatalog.smallestContaining(view);
  }

  /**
   * §2 quota-drought degradation (wave-5 §17c): when smallestContaining finds
   * NO catalog row for the creation viewport, mint the ratified fallback —
   * "this area near (lat, lng)" — through the ordinary sketch path (identity
   * law dedupes repeat creations near the same rounded center; bboxes merge).
   * The row participates in attribution immediately and is BACKFILLED (name/
   * hierarchy) by the §2 naming reconciler as probes land. Creation-only:
   * checkDuplicate keeps the side-effect-free resolveCreationPlace.
   */
  private async mintFallbackCreationPlace(dto: {
    bounds?: {
      northEast: { lat: number; lng: number };
      southWest: { lat: number; lng: number };
    } | null;
    marketKey?: string | null;
  }): Promise<Place | null> {
    const view = await this.resolveFeedView({
      bounds: dto.bounds ?? undefined,
      marketKey: dto.marketKey ?? undefined,
    } as QueryPollsDto);
    if (!view) {
      return null;
    }
    const center = bboxCenter(view);
    // ~1km rounding: nearby droughted creations converge on ONE place row.
    const name = `this area near (${center.lat.toFixed(2)}, ${center.lng.toFixed(2)})`;
    try {
      const [place] = await this.placesCatalog.sketchChain([
        {
          name,
          // Open §1 vocabulary — a distinct code so backfill/promotion can
          // recognize fallback rows without a schema flag.
          providerLevelCode: 'areaFallback',
          // ISO 3166 user-assigned "unknown" — no provider chain exists yet.
          countryCode: 'ZZ',
          provider: 'fallback',
          bbox: view,
          centroid: center,
        },
      ]);
      this.logger.warn('Poll creation minted a fallback place (§2 drought)', {
        placeId: place.placeId,
        name,
      });
      return place;
    } catch (error) {
      this.logger.error('Fallback place mint failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
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
   * Legacy market-keyed rows (place_id NULL) join via the legacy marketKey arm.
   */
  async checkDuplicate(dto: CheckPollDuplicateDto): Promise<{
    matches: Array<{ pollId: string; question: string; similarity: number }>;
  }> {
    const question = dto.question.trim();
    if (question.length < 3) {
      return { matches: [] };
    }
    const place = await this.resolveCreationPlace(dto);
    const legacyMarketKey = dto.marketKey?.trim() ?? null;
    if (!place && !legacyMarketKey) {
      return { matches: [] };
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ poll_id: string; question: string; sim: number }>
    >(Prisma.sql`
      SELECT poll_id, question,
             word_similarity(${question}, question) AS sim
      FROM polls
      WHERE state::text = 'active'
        AND (
          place_id = ${place?.placeId ?? null}::uuid
          OR (
            place_id IS NULL
            AND ${legacyMarketKey}::text IS NOT NULL
            AND market_key = ${legacyMarketKey}
          )
        )
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
    const recentCount = await this.prisma.poll.count({
      where: {
        createdByUserId: userId,
        placeId,
        launchedAt: { gte: windowStart },
      },
    });
    if (recentCount >= POLL_USER_WEEKLY_CAP) {
      throw new BadRequestException(
        `You've used your ${POLL_USER_WEEKLY_CAP} polls this week in this area. ` +
          `Try again in a few days, or jump into an existing discussion.`,
      );
    }
  }

  async createPoll(dto: CreatePollDto, userId: string) {
    // §2 law (wave-5 §17c): poll creation NEVER blocks on place resolution.
    // When no catalog place contains the creation viewport (unseeded ground,
    // cheap-pool drought), the poll is created against a minted
    // "this area near (lat, lng)" place, backfilled by later naming probes.
    // Only a request with NO resolvable geo at all (no bounds, no legacy
    // market bbox) still 400s — there is nothing to anchor the poll to.
    const place =
      (await this.resolveCreationPlace(dto)) ??
      (await this.mintFallbackCreationPlace(dto));
    if (!place) {
      throw new BadRequestException('Unable to resolve a place for this poll');
    }
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
      const moderationDecision =
        await this.moderation.moderateText(description);
      if (!moderationDecision.allowed) {
        throw new BadRequestException(
          `Description rejected by moderation: ${moderationDecision.reason}`,
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
      const questionModeration = await this.moderation.moderateText(question);
      if (!questionModeration.allowed) {
        throw new BadRequestException(
          `Poll title rejected by moderation: ${questionModeration.reason}`,
        );
      }
    }

    const now = new Date();
    const poll = await this.prisma.$transaction(async (tx) => {
      const topic = await tx.pollTopic.create({
        data: {
          title: question,
          description,
          placeId: place.placeId,
          topicType,
          createdByUserId: userId,
          targetDishId,
          targetRestaurantId,
          targetFoodAttributeId,
          targetRestaurantAttributeId,
          status: PollTopicStatus.archived,
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
              marketKey: true,
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
    void this.userEventService.recordEvent({
      userId,
      eventType: 'poll_created',
      eventData: {
        pollId: poll.pollId,
        topicId: poll.topicId,
        placeId: poll.placeId,
        topicType: dto.topicType,
      },
    });
    // §3 signals: the poll_created act.
    this.signals.record({
      kind: 'poll_created',
      userId,
      subject: this.pollSignalSubject(poll),
      geo: this.pollSignalGeo(poll),
      meta: { pollId: poll.pollId },
    });
    // W4: no pollsCreatedCount counter bump — the profile "Polls" stat is a
    // live count over polls.createdByUserId (see UserService.countCreatedPolls).
    // §2 Option A: seed the leaderboard from the creator's description immediately,
    // so a ranked poll ranks the creator's organic suggestion from frame one.
    // (No-op for discussion polls — rebuildPollLeaderboard early-returns.)
    await this.rebuildPollLeaderboard(poll.pollId);
    const [enriched] = await this.attachPlaceLabels(
      await this.attachMarketLabels([poll]),
    );
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

    const moderation = await this.moderation.moderateText(question);
    if (!moderation.allowed) {
      throw new BadRequestException(
        `Poll question rejected by moderation: ${moderation.reason}`,
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
            marketKey: true,
            title: true,
            description: true,
            metadata: true,
          },
        },
      },
    });

    this.gateway.emitPollUpdate(poll.pollId);
    void this.userEventService.recordEvent({
      userId,
      eventType: 'poll_created',
      eventData: {
        pollId: poll.pollId,
        placeId: poll.placeId,
        mode: PollMode.discussion,
      },
    });
    // §3 signals: the poll_created act (discussion polls are topic-less —
    // subject falls through to the question term).
    this.signals.record({
      kind: 'poll_created',
      userId,
      subject: this.pollSignalSubject(poll),
      geo: this.pollSignalGeo(poll),
      meta: { pollId: poll.pollId },
    });
    // W4: no counter bump — the stat is a live count (UserService.countCreatedPolls).
    const [enriched] = await this.attachPlaceLabels(
      await this.attachMarketLabels([poll]),
    );
    return enriched;
  }

  async getPoll(pollId: string) {
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
            marketKey: true,
            title: true,
            description: true,
            metadata: true,
          },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    const [enriched] = await this.attachMarketLabels([poll]);
    return enriched;
  }

  // ─── Comments (Phase 4) ──────────────────────────────────────────────────

  private generateCommentPublicId(): string {
    return randomBytes(12).toString('base64url'); // 16 url-safe chars
  }

  /**
   * Phase 5 gazetteer: scan a comment for KNOWN restaurant/food mentions (no LLM,
   * market-scoped) and return display spans for highlight + deeplink. Brand-new
   * entities aren't here yet — they graduate at close (§6.1).
   */
  async highlightCommentSpans(
    body: string,
    marketKey: string | null,
  ): Promise<Prisma.InputJsonValue> {
    const spans = await this.entityTextSearch.scanForKnownEntities(
      body,
      [
        EntityType.restaurant,
        EntityType.food,
        EntityType.food_attribute,
        EntityType.restaurant_attribute,
      ],
      { marketKey },
    );
    return spans as unknown as Prisma.InputJsonValue;
  }

  async postComment(pollId: string, dto: CreateCommentDto, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        pollId: true,
        state: true,
        marketKey: true,
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

    const moderation = await this.moderation.moderateText(body);
    if (!moderation.allowed) {
      throw new BadRequestException(
        `Comment rejected by moderation: ${moderation.reason}`,
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

    const entitySpans = await this.highlightCommentSpans(body, poll.marketKey);
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
    void this.userEventService.recordEvent({
      userId,
      eventType: 'poll_comment_posted',
      eventData: { pollId, commentId: comment.commentId },
    });
    // DUAL-WRITE (delete with old logging — master plan §22, one-milestone hard deletion)
    // §3 signals: the poll_comment act beside the userEventService writer.
    this.signals.record({
      kind: 'poll_comment',
      userId,
      subject: this.pollSignalSubject(poll),
      geo: this.pollSignalGeo(poll),
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
    const moderation = await this.moderation.moderateText(body);
    if (!moderation.allowed) {
      throw new BadRequestException(
        `Comment rejected by moderation: ${moderation.reason}`,
      );
    }

    const poll = await this.prisma.poll.findUnique({
      where: { pollId: comment.pollId },
      select: { marketKey: true },
    });
    const entitySpans = await this.highlightCommentSpans(
      body,
      poll?.marketKey ?? null,
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
    void this.userEventService.recordEvent({
      userId,
      eventType: result.liked ? 'poll_comment_liked' : 'poll_comment_unliked',
      eventData: { pollId: comment.pollId, commentId },
    });
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

    const comments = await this.prisma.pollComment.findMany({
      where: { pollId, deletedAt: null },
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
        user: {
          select: {
            userId: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
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
        marketKey: true,
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
            { marketKey: poll.marketKey },
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

    const ranked = [...endorsers.entries()]
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
        where: { entityId: { in: entityIds } },
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
  ) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        state: true,
        question: true,
        marketKey: true,
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
        geo: this.pollSignalGeo(poll),
        meta: {
          pollId,
          endorsedSubjectId: subjectId,
          endorsedSubjectType: subjectType,
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
    const marketKey = query.marketKey?.trim();
    const state = query.state;

    if (activity === UserPollActivity.created) {
      const polls = await this.prisma.poll.findMany({
        where: {
          createdByUserId: userId,
          marketKey: marketKey
            ? { equals: marketKey, mode: 'insensitive' }
            : undefined,
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
              marketKey: true,
              title: true,
              description: true,
              metadata: true,
            },
          },
        },
      });

      const enriched = await this.attachMarketLabels(polls, marketKey);
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
              marketKey: marketKey
                ? { equals: marketKey, mode: 'insensitive' }
                : undefined,
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
                  marketKey: true,
                  title: true,
                  description: true,
                  metadata: true,
                },
              },
            },
          })
        : [];

    const enriched = await this.attachPollStats(
      await this.attachMarketLabels(polls, marketKey),
      userId,
    );
    return {
      activity,
      polls: enriched,
    };
  }

  private async attachMarketLabels<
    T extends {
      marketKey?: string | null;
      topic?: { marketKey?: string | null } | null;
    },
  >(
    polls: T[],
    fallbackMarketKey?: string | null,
  ): Promise<Array<T & { marketName?: string | null }>> {
    const marketKeys = new Set<string>();
    for (const poll of polls) {
      const rawKey =
        poll.marketKey ?? poll.topic?.marketKey ?? fallbackMarketKey ?? null;
      if (typeof rawKey === 'string' && rawKey.trim()) {
        marketKeys.add(rawKey.trim().toLowerCase());
      }
    }

    if (marketKeys.size === 0) {
      return polls;
    }

    const keys = Array.from(marketKeys.values());
    const marketRows = await this.prisma.market.findMany({
      where: {
        marketKey: { in: keys },
      },
      select: {
        marketKey: true,
        marketName: true,
        marketShortName: true,
      },
    });

    const labelByKey = new Map<string, string>();
    for (const row of marketRows) {
      const label = this.resolveMarketLabel(row);
      if (!label) {
        continue;
      }
      labelByKey.set(row.marketKey.toLowerCase(), label);
    }

    return polls.map((poll) => {
      const rawKey =
        poll.marketKey ?? poll.topic?.marketKey ?? fallbackMarketKey ?? null;
      const key = typeof rawKey === 'string' ? rawKey.trim().toLowerCase() : '';
      const marketName = key ? (labelByKey.get(key) ?? null) : null;
      return {
        ...poll,
        marketName,
      };
    });
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
          select: {
            userId: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
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
          username: user?.username ?? null,
          displayName: user?.displayName ?? null,
          avatarUrl: user?.avatarUrl ?? null,
        },
      };
    });
  }

  private resolveMarketLabel(row: {
    marketKey: string;
    marketName: string;
    marketShortName: string | null;
  }): string | null {
    if (row.marketShortName && row.marketShortName.trim()) {
      return row.marketShortName.trim();
    }
    if (row.marketName && row.marketName.trim()) {
      return row.marketName.trim();
    }
    return row.marketKey.trim() || null;
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
