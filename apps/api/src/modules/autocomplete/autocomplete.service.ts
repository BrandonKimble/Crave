import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { LoggerService, TextSanitizerService } from '../../shared';
import { EntityResolutionService } from '../content-processing/entity-resolver/entity-resolution.service';
import {
  AutocompleteRequestDto,
  AutocompleteResponseDto,
  AutocompleteMatchDto,
} from './dto/autocomplete.dto';
import { EntitySearchService } from './entity-search.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SearchQuerySuggestionService,
  type QuerySuggestion,
} from '../search/search-query-suggestion.service';
import type { User } from '@prisma/client';
import { SearchPopularityService } from '../search/search-popularity.service';
import { RestaurantStatusService } from '../search/restaurant-status.service';
import { viewportEnvelopeSql } from '../search/engine-coverage.service';
import type { MapBoundsDto } from '../search/dto/search-query.dto';
import {
  SignalDemandReadService,
  type RestaurantViewStatsRow,
  type ViewedRestaurantNameMatch,
} from '../signals/signal-demand-read.service';
import type { SignalKind } from '../signals/signals.service';

/** Row shape of the favorites read (favorite_list_items under the user's own
 *  lists): restaurant saves vs dish saves (connection → food entity). */
interface FavoriteListItemMatchRow {
  restaurantId: string | null;
  restaurant: { name: string; aliases: string[] } | null;
  connection: {
    foodId: string;
    food: { name: string; aliases: string[] };
  } | null;
}

// §16 CLASSIFICATION (suggest refit 2026-07-24 — the owner-ratified ideal
// shape, plans/suggest-ideal-shape.md). The pre-constitution holdovers this
// header used to flag (the 0.6/0.3/0.1 attribute weights, the 0.4 similarity
// floors, the naked ×1.35, the env lane-weight multipliers, and the 0.5
// query-score floor) are DELETED, not ratified: every lane now ranks its own
// candidates rank-only with type-appropriate signals, and lanes fuse by
// unweighted reciprocal-rank fusion. What remains, by class:
// - Slot counts / limits / min-length gates = K1 owner sentences (product
//   choices the eye re-ratifies, never measured). The slot caps and intent
//   gates cite "K1 RATIFIED 2026-07-24 §18-8b(e)".
// - RRF_K = the published RRF constant (Cormack et al. 2009) — a literature
//   fact, not a tuned weight.
// - Windows (90d support) = K1 attention-window sentences.
// - Evidence-tier ordinals = derivation (order-only) from the matcher's tier
//   ladder; magnitudes never leave the ordinal, so it cannot act as a weight.
const DEFAULT_LIMIT = 8; // K1 RATIFIED 2026-07-24 §18-8b(e): panel shows ≤ 8 rows
const MIN_QUERY_LENGTH = 1; // K1: suggest engages from the first character
// Query-suggestion STRIP composition (a separate UI surface from the panel):
// personal-first seating inside the ≤3-row strip. K1 owner sentences — they
// shape the strip ONLY, never the cross-lane panel blend.
const PERSONAL_QUERY_RESERVED_SLOTS = 2;
const GLOBAL_QUERY_RESERVED_SLOTS = 1;
// Recall breadth for the attribute-lane fetch (how many candidates we ask the
// matcher for, NOT how many we show) — structural plumbing, latency-bounded.
const ATTRIBUTE_RECALL_FLOOR = 6;
const ATTRIBUTE_SUPPORT_WINDOW_DAYS = 90; // K1 attention-window sentence
const ATTRIBUTE_LANE_RUNTIME_READY = true;
// Poll lane (§8.1): polls compete through the cross-lane fusion — zero
// reserved slots. Gated to longer queries so they don't flood food searches.
const POLL_LANE_MIN_QUERY_LENGTH = 3; // K1 intent gate (ratified): trigram matching is meaningless under 3 chars
// User lane (person rows, owner-scoped 2026-07-10: persons only — lists deliberately out):
// username/displayName prefix or word-similarity; taps push the userProfile page.
const USER_LANE_MIN_QUERY_LENGTH = 2; // K1 intent gate (ratified)
const USER_LANE_MAX_CANDIDATES = 3; // K1 RATIFIED 2026-07-24 §18-8b(e): ≤ 3 person rows
const POLL_LANE_MAX_CANDIDATES = 3; // K1 RATIFIED 2026-07-24 §18-8b(e): ≤ 3 poll rows
// Unweighted reciprocal-rank fusion constant, k = 60 — the published value
// from the original RRF paper (Cormack et al. 2009). Used both INSIDE the
// attribute lane (fusing its three sub-rankings) and ACROSS lanes (fusing
// lane ranks). §16 class: published-literature constant, not a tuned weight.
const RRF_K = 60;
type CacheResult = 'hit' | 'miss' | 'skipped';

// Cross-lane tie-break (a): text-match strength as an ORDINAL over the
// matcher's evidence-tier ladder (exact→prefix→contains→name/alias→fuzzy/
// edit→embedding). §16 class: derivation, ORDER ONLY — the integers are rank
// positions on the ladder, never magnitudes, so they cannot act as weights.
// Rows whose evidence is structural-by-construction (query suggestions,
// injected favorites/viewed, user/poll prefix hits are all literal prefix
// matches of the typed text) borrow the ladder position their match shape
// earns, not a hand score.
const EVIDENCE_TIER_STRENGTH: Record<string, number> = {
  exact: 7,
  prefix: 6,
  contains: 5,
  name: 4,
  alias: 4,
  fuzzy: 3,
  edit: 3,
  embedding: 2,
};

/**
 * One row inside a lane's internal ranking. The lane's ORDER is the ranking
 * signal handed to cross-lane RRF; the fields below are the only tie-break
 * facts (compared lexicographically, never blended):
 * (a) textStrength — evidence-tier ordinal,
 * (b) favorite/viewed/affinity — the requesting user's OWN engagement facts
 *     with this exact row,
 * (c) popularity — the global demand fact.
 */
type LaneCandidate = {
  match: AutocompleteMatchDto;
  textStrength: number;
  favorite: boolean;
  viewed: boolean;
  affinity: number;
  popularity: number;
};

// The three attribute-lane support signals, RAW (facts/derivations, no
// normalization — the lane consumes them rank-only via RRF):
// - typedSearchSupport: demand score of 'search' acts on the attribute,
// - autocompleteSelectionSupport: demand score of 'autocomplete_selection' acts,
// - corpusUsefulness: breadth × selectivity derivation over the corpus.
type AttributeSupportScore = {
  typedSearchSupport: number;
  autocompleteSelectionSupport: number;
  corpusUsefulness: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

@Injectable()
export class AutocompleteService {
  private readonly logger: LoggerService;
  private readonly redis: Redis;
  private readonly cacheTtlSeconds: number;
  private readonly cacheRedisKeyPrefix: string;
  private readonly weightGlobalPopularity: number;
  private readonly weightUserAffinity: number;
  private readonly favoriteBoost: number;
  private readonly viewAffinityWeight: number;
  private readonly viewRecencyDecayDays: number;
  private readonly viewFrequencyCap: number;
  private readonly querySuggestionMax: number;
  private readonly querySuggestionMinGlobalCount: number;
  private readonly querySuggestionMinUserCount: number;
  private readonly attributeLaneEnabled: boolean;
  private readonly pollLaneEnabled: boolean;
  private readonly userLaneEnabled: boolean;

  constructor(
    loggerService: LoggerService,
    redisService: RedisService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly textSanitizer: TextSanitizerService,
    private readonly entitySearchService: EntitySearchService,
    private readonly prisma: PrismaService,
    private readonly searchQuerySuggestionService: SearchQuerySuggestionService,
    private readonly searchPopularityService: SearchPopularityService,
    private readonly restaurantStatusService: RestaurantStatusService,
    private readonly signalDemandRead: SignalDemandReadService,
  ) {
    this.logger = loggerService.setContext('AutocompleteService');
    this.redis = redisService.getOrThrow();
    this.cacheTtlSeconds = this.resolveEnvInt(
      'AUTOCOMPLETE_CACHE_TTL_SECONDS',
      60,
    );
    this.cacheRedisKeyPrefix = this.resolveEnvString(
      'AUTOCOMPLETE_CACHE_REDIS_PREFIX',
      // v3: refit 2026-07-24 changed panel ordering semantics (RRF fusion);
      // the bump keeps ≤60s of pre-refit orderings from serving mixed.
      'autocomplete:v3',
    );
    // ENTITY-LANE within-tier re-rank boosts. §16: pre-constitution hand
    // weights, KEPT under the ratified entity-lane exception (2026-07-24):
    // the structural band clamp in calculateLexicalFirstEntityScore confines
    // them INSIDE one evidence tier, so they can only reorder rows whose text
    // evidence already ties — never promote weaker evidence over stronger.
    // Phase C (post-launch calibrated tap re-ranking) is their retirement path.
    this.weightGlobalPopularity = 0.35;
    this.weightUserAffinity = 0.1;
    this.favoriteBoost = 0.05;
    this.viewAffinityWeight = 0.08;
    this.viewRecencyDecayDays = 30;
    this.viewFrequencyCap = 10;
    // K1 RATIFIED 2026-07-24 §18-8b(e): query-suggestion strip shows ≤ 3.
    this.querySuggestionMax = 3;
    // Evidence gates (K1 sentences): a global suggestion needs 3 distinct
    // actors; your own single past query is enough for a personal one.
    this.querySuggestionMinGlobalCount = 3;
    this.querySuggestionMinUserCount = 1;
    this.attributeLaneEnabled =
      ATTRIBUTE_LANE_RUNTIME_READY &&
      this.resolveEnvBoolean('AUTOCOMPLETE_ENABLE_ATTRIBUTE_LANE', true);
    this.pollLaneEnabled = this.resolveEnvBoolean(
      'AUTOCOMPLETE_ENABLE_POLL_LANE',
      true,
    );
    this.userLaneEnabled = this.resolveEnvBoolean(
      'AUTOCOMPLETE_ENABLE_USER_LANE',
      true,
    );
  }

  async autocompleteEntities(
    dto: AutocompleteRequestDto,
    user?: User,
  ): Promise<AutocompleteResponseDto> {
    const normalizedQuery = this.textSanitizer.sanitizeOrThrow(dto.query, {
      maxLength: 140,
    });
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const entityTypes = this.resolveEntityTypes(dto);
    const attributeEntityTypes = this.resolveAttributeEntityTypes(dto);
    const cacheEntityTypes = [...entityTypes, ...attributeEntityTypes];
    const primaryEntityType = entityTypes[0] ?? EntityType.food;

    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      return {
        matches: [],
        query: dto.query,
        normalizedQuery,
        onDemandQueued: false,
        querySuggestions: [],
      };
    }

    const cacheKey = this.buildCacheKey(
      user?.userId ?? null,
      cacheEntityTypes,
      normalizedQuery,
      // Market-election cache scoping DIED with leg 2 of the markets
      // extermination — recall is global, so the cache scope is too.
      'global',
      this.attributeLaneEnabled,
    );
    const cacheLookup = await this.getFromCache(cacheKey);
    if (cacheLookup.response) {
      // A cache-hit serve is still an impression the LTR bootstrap needs.
      this.logImpressions(normalizedQuery, cacheLookup.response);
      return cacheLookup.response;
    }

    const injectedPromise =
      user && entityTypes.length > 0
        ? this.fetchInjectedUserMatches(normalizedQuery, entityTypes, user)
        : Promise.resolve({ favorites: [], viewed: [] });
    const querySuggestionPromise =
      this.searchQuerySuggestionService.getSuggestions(
        normalizedQuery,
        Math.min(10, Math.max(this.querySuggestionMax * 2, 6)),
        user?.userId,
      );

    const [searchResults, attributeResults] = await Promise.all([
      entityTypes.length
        ? this.entitySearchService.searchEntitiesHybrid(
            normalizedQuery,
            entityTypes,
            Math.min(limit * entityTypes.length, limit * 3),
          )
        : Promise.resolve([]),
      attributeEntityTypes.length
        ? this.entitySearchService.searchAttributeAutocompleteEntities(
            normalizedQuery,
            attributeEntityTypes,
            Math.max(limit, ATTRIBUTE_RECALL_FLOOR),
          )
        : Promise.resolve([]),
    ]);

    let matches: AutocompleteMatchDto[] = searchResults
      .slice(0, limit)
      .map((result) => ({
        entityId: result.entityId,
        entityType: result.type,
        name: result.name,
        confidence: Number(result.similarity.toFixed(2)),
        aliases: [],
        matchType: 'entity',
        evidenceTier: result.evidence,
      }));

    if (
      entityTypes.length > 0 &&
      matches.length === 0 &&
      normalizedQuery.length >= 3
    ) {
      matches = await this.resolveViaEntityResolver(
        dto,
        normalizedQuery,
        primaryEntityType,
        limit,
      );
    }

    const attributeMatches: AutocompleteMatchDto[] = attributeResults.map(
      (result) => ({
        entityId: result.entityId,
        entityType: result.type,
        name: result.name,
        confidence: Number(result.similarity.toFixed(2)),
        aliases: [],
        matchType: 'entity',
        evidenceTier: result.evidence,
      }),
    );

    const injected = await injectedPromise;

    const candidateMatches = this.mergeEntityMatches(
      [...matches, ...attributeMatches],
      [...injected.favorites, ...injected.viewed],
    );

    const querySuggestions = await querySuggestionPromise;

    const ranked = await this.rankCandidates({
      entityMatches: candidateMatches,
      querySuggestions,
      user,
      normalizedQuery,
      limit,
      bounds: dto.bounds ?? null,
    });

    // See-locations cut: the old per-request location-count query is DEAD —
    // the multi-location fact rides statusPreview.locationCount (one shared
    // status-preview read), which the "See locations" chip derives from.
    const matchesWithStatus = await this.attachStatusPreviews(ranked.matches);
    const response: AutocompleteResponseDto = {
      matches: matchesWithStatus,
      query: dto.query,
      normalizedQuery,
      onDemandQueued: false,
      onDemandReason: undefined,
      querySuggestions: ranked.querySuggestionTexts,
    };

    this.logImpressions(normalizedQuery, response);
    await this.setInCache(cacheKey, response);

    return response;
  }

  private mergeEntityMatches(
    base: AutocompleteMatchDto[],
    injected: AutocompleteMatchDto[],
  ): AutocompleteMatchDto[] {
    const results: AutocompleteMatchDto[] = [];
    const seen = new Set<string>();

    for (const match of [...base, ...injected]) {
      if (!match.entityId || seen.has(match.entityId)) {
        continue;
      }
      seen.add(match.entityId);
      results.push(match);
    }

    return results;
  }

  private async attachStatusPreviews(
    matches: AutocompleteMatchDto[],
  ): Promise<AutocompleteMatchDto[]> {
    const restaurantIds = Array.from(
      new Set(
        matches
          .filter((match) => match.entityType === EntityType.restaurant)
          .map((match) => match.entityId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (restaurantIds.length === 0) {
      return matches;
    }

    const previews = await this.restaurantStatusService.getStatusPreviews({
      restaurantIds,
    });
    const previewMap = new Map(
      previews.map((preview) => [preview.restaurantId, preview]),
    );

    return matches.map((match) => {
      if (match.entityType !== EntityType.restaurant) {
        return match;
      }
      const preview = previewMap.get(match.entityId);
      if (!preview) {
        return match;
      }
      return {
        ...match,
        statusPreview: preview,
      };
    });
  }

  private async fetchInjectedUserMatches(
    normalizedQuery: string,
    entityTypes: EntityType[],
    user: User,
  ): Promise<{
    favorites: AutocompleteMatchDto[];
    viewed: AutocompleteMatchDto[];
  }> {
    const tasks: Array<Promise<unknown>> = [];

    // Favorites live in the list system (favorite_list_items under the user's
    // own lists): restaurant saves carry restaurantId, dish saves carry a
    // connection whose food entity is the suggestable subject.
    const includeRestaurants = entityTypes.includes(EntityType.restaurant);
    const includeFoods = entityTypes.includes(EntityType.food);
    const namePrefix = {
      name: { startsWith: normalizedQuery, mode: 'insensitive' as const },
    };
    const favoriteBranches = [
      ...(includeRestaurants ? [{ restaurant: { is: namePrefix } }] : []),
      ...(includeFoods
        ? [{ connection: { is: { food: { is: namePrefix } } } }]
        : []),
    ];
    const favoritesTask = favoriteBranches.length
      ? this.prisma.favoriteListItem.findMany({
          where: {
            list: { is: { ownerUserId: user.userId } },
            OR: favoriteBranches,
          },
          select: {
            restaurantId: true,
            restaurant: { select: { name: true, aliases: true } },
            connection: {
              select: {
                foodId: true,
                food: { select: { name: true, aliases: true } },
              },
            },
          },
          take: 20,
        })
      : Promise.resolve([] as FavoriteListItemMatchRow[]);
    tasks.push(favoritesTask);
    // READER CUT (§22 item 6): "viewed" suggestions read the signals ledger
    // (kind = entity_view), not the dying user_restaurant_views table.
    const viewedTask = includeRestaurants
      ? this.signalDemandRead.viewedRestaurantNameMatches(
          user.userId,
          normalizedQuery,
          20,
        )
      : Promise.resolve([] as ViewedRestaurantNameMatch[]);
    tasks.push(viewedTask);

    const [favoriteRows, viewedRows] = (await Promise.all(tasks)) as [
      FavoriteListItemMatchRow[],
      ViewedRestaurantNameMatch[],
    ];

    const prefixMatches = (name: string | undefined): boolean =>
      Boolean(name?.toLowerCase().startsWith(normalizedQuery.toLowerCase()));

    const favoritesById = new Map<string, AutocompleteMatchDto>();
    for (const row of favoriteRows) {
      if (
        includeRestaurants &&
        row.restaurantId &&
        row.restaurant &&
        prefixMatches(row.restaurant.name)
      ) {
        favoritesById.set(row.restaurantId, {
          entityId: row.restaurantId,
          entityType: EntityType.restaurant,
          name: row.restaurant.name,
          confidence: 0.65,
          aliases: row.restaurant.aliases ?? [],
          matchType: 'entity',
          badges: { favorite: true },
        });
      }
      if (
        includeFoods &&
        row.connection?.food &&
        prefixMatches(row.connection.food.name)
      ) {
        favoritesById.set(row.connection.foodId, {
          entityId: row.connection.foodId,
          entityType: EntityType.food,
          name: row.connection.food.name,
          confidence: 0.65,
          aliases: row.connection.food.aliases ?? [],
          matchType: 'entity',
          badges: { favorite: true },
        });
      }
    }
    const favorites = Array.from(favoritesById.values());

    const viewed: AutocompleteMatchDto[] = viewedRows.map((row) => ({
      entityId: row.restaurantId,
      entityType: EntityType.restaurant,
      name: row.name,
      confidence: 0.65,
      aliases: row.aliases ?? [],
      matchType: 'entity',
      badges: { viewed: true },
    }));

    return { favorites, viewed };
  }

  private async rankCandidates(params: {
    entityMatches: AutocompleteMatchDto[];
    querySuggestions: QuerySuggestion[];
    user?: User;
    normalizedQuery: string;
    limit: number;
    bounds?: MapBoundsDto | null;
  }): Promise<{
    matches: AutocompleteMatchDto[];
    querySuggestionTexts: string[];
  }> {
    const { entityMatches, querySuggestions, user, limit, normalizedQuery } =
      params;

    // Poll lane runs in parallel with the entity/popularity DB work; it joins
    // the cross-lane RRF fusion below (zero reserved slots, §8.1).
    const pollCandidatesPromise = this.fetchPollMatches(
      normalizedQuery,
      limit,
      params.bounds ?? null,
    );
    const userCandidatesPromise = this.fetchUserMatches(normalizedQuery, limit);

    const entityIds = Array.from(
      new Set(entityMatches.map((match) => match.entityId)),
    );

    const restaurantIds = entityMatches
      .filter((match) => match.entityType === EntityType.restaurant)
      .map((match) => match.entityId);

    // READER CUT (§22 item 6): popularity/affinity read the signals substrate
    // and the view-affinity stats read the ledger (kind = entity_view) — the
    // user_restaurant_views read is dead.
    const [globalScores, affinityScores, favorites, views] = await Promise.all([
      entityIds.length
        ? this.searchPopularityService.getEntityPopularityScores(entityIds)
        : Promise.resolve(new Map<string, number>()),
      user?.userId && entityIds.length
        ? this.searchPopularityService.getUserEntityAffinity(
            user.userId,
            entityIds,
          )
        : Promise.resolve(new Map<string, number>()),
      user?.userId && entityIds.length
        ? this.prisma.favoriteListItem.findMany({
            where: {
              list: { is: { ownerUserId: user.userId } },
              OR: [
                { restaurantId: { in: entityIds } },
                { connection: { is: { foodId: { in: entityIds } } } },
              ],
            },
            select: {
              restaurantId: true,
              connection: { select: { foodId: true } },
            },
          })
        : Promise.resolve(
            [] as Array<{
              restaurantId: string | null;
              connection: { foodId: string } | null;
            }>,
          ),
      user?.userId && restaurantIds.length
        ? this.signalDemandRead.restaurantViewStats(user.userId, restaurantIds)
        : Promise.resolve([] as RestaurantViewStatsRow[]),
    ]);

    const favoriteSet = new Set(
      favorites
        .map((fav) => fav.restaurantId ?? fav.connection?.foodId)
        .filter((id): id is string => Boolean(id)),
    );
    const viewByRestaurantId = new Map(
      views.map((row) => [
        row.restaurantId,
        { lastViewedAt: row.lastViewedAt, viewCount: row.viewCount },
      ]),
    );

    const attributeSupport = await this.loadAttributeSupport(entityMatches);

    const scoredEntities = entityMatches.flatMap((match) => {
      const popularity = globalScores.get(match.entityId) ?? 0;
      const affinity = affinityScores.get(match.entityId) ?? 0;
      const isFavorite = favoriteSet.has(match.entityId);
      const view = viewByRestaurantId.get(match.entityId) ?? null;
      const isViewed = Boolean(view);
      const viewAffinity = view
        ? this.calculateViewAffinity(view.lastViewedAt, view.viewCount)
        : 0;
      const popularityBoost =
        this.normalizePopularity(popularity) * this.weightGlobalPopularity;
      const affinityBoost =
        this.normalizePopularity(affinity) * this.weightUserAffinity;
      const favoriteBoost = isFavorite ? this.favoriteBoost : 0;
      const viewedBoost = isViewed ? this.viewAffinityWeight * viewAffinity : 0;

      if (
        this.isAttributeType(match.entityType) &&
        !this.isStrongAttributeCandidate({
          match,
          normalizedQuery,
        })
      ) {
        return [];
      }

      // Entity-lane internal order only (attributes rank via their own RRF in
      // rankAttributeLane; the fused list ignores this score entirely).
      const score = this.isAttributeType(match.entityType)
        ? 0
        : this.calculateLexicalFirstEntityScore({
            confidence: match.confidence,
            boost:
              popularityBoost + affinityBoost + favoriteBoost + viewedBoost,
          });

      const candidate: LaneCandidate = {
        match: {
          ...match,
          badges: {
            ...match.badges,
            favorite: isFavorite || match.badges?.favorite,
            viewed: isViewed || match.badges?.viewed,
          },
        },
        textStrength: this.textStrengthOf(match),
        favorite: isFavorite || Boolean(match.badges?.favorite),
        viewed: isViewed || Boolean(match.badges?.viewed),
        affinity,
        popularity,
      };

      return [{ candidate, score }];
    });

    const existingNames = new Set(
      scoredEntities.map(({ candidate }) => candidate.match.name.toLowerCase()),
    );

    // QUERY LANE — rank-only. No constructed score: the suggestion service
    // already orders personal rows by the user's own recency/count and global
    // rows by distinct-actor demand; that order (laneRank) IS the ranking.
    // The min-count acceptance gates are the lane's evidence sentences.
    const acceptedQueryCandidates = querySuggestions
      .flatMap((suggestion, laneRank) => {
        const text = suggestion.text.trim();
        if (!text) return [];
        if (existingNames.has(text.toLowerCase())) return [];
        if (suggestion.userCount >= this.querySuggestionMinUserCount)
          return [{ suggestion, laneRank, text }];
        return suggestion.globalCount >= this.querySuggestionMinGlobalCount
          ? [{ suggestion, laneRank, text }]
          : [];
      })
      .map(({ suggestion, laneRank, text }) => {
        const match: AutocompleteMatchDto = {
          entityId: `query:${text.toLowerCase()}`,
          entityType: 'query',
          name: text,
          aliases: [],
          confidence: 1,
          matchType: 'query',
          querySuggestionSource: suggestion.source,
          badges:
            suggestion.source === 'personal'
              ? { recentQuery: true }
              : undefined,
        };

        const candidate: LaneCandidate = {
          match,
          // A suggestion is a literal prefix completion of the typed text —
          // structural prefix evidence, not a hand score.
          textStrength: EVIDENCE_TIER_STRENGTH.prefix,
          favorite: false,
          viewed: false,
          // Tie-break facts: your own use-count of this exact query, and its
          // global distinct-actor demand.
          affinity: suggestion.userCount,
          popularity: suggestion.globalCount,
        };

        return { candidate, laneRank };
      });

    const compareQueryLaneOrder = (
      a: { laneRank: number },
      b: { laneRank: number },
    ) => a.laneRank - b.laneRank;
    const personalQueryCandidates = acceptedQueryCandidates
      .filter(
        ({ candidate }) => candidate.match.querySuggestionSource === 'personal',
      )
      .sort(compareQueryLaneOrder);
    const globalQueryCandidates = acceptedQueryCandidates
      .filter(
        ({ candidate }) => candidate.match.querySuggestionSource === 'global',
      )
      .sort(compareQueryLaneOrder);
    // The query-suggestion STRIP (a separate UI surface from the main list) is the
    // ONLY consumer of the reserved-slot ordering: seat the user's own recent
    // queries first, then popular global ones, capped at querySuggestionMax. This
    // shaping stays local to the strip — the main-list blend below receives the
    // FULL, unshaped query lane (personal/globalQueryCandidates) so every suggestion
    // competes purely on score, never truncated by the strip's presentation cap.
    const querySuggestionStrip = [
      ...personalQueryCandidates.slice(
        0,
        Math.max(1, PERSONAL_QUERY_RESERVED_SLOTS),
      ),
      ...globalQueryCandidates.slice(
        0,
        Math.max(1, GLOBAL_QUERY_RESERVED_SLOTS),
      ),
      ...personalQueryCandidates.slice(
        Math.max(1, PERSONAL_QUERY_RESERVED_SLOTS),
      ),
      ...globalQueryCandidates.slice(Math.max(1, GLOBAL_QUERY_RESERVED_SLOTS)),
    ].slice(0, Math.max(1, this.querySuggestionMax));

    const pollCandidates = await pollCandidatesPromise;
    const userCandidates = await userCandidatesPromise;

    // ENTITY-LANE EXCEPTION (ratified): internal order stays evidence-tier-
    // first with the band-clamped demand re-rank INSIDE tiers — RRF fuses the
    // lanes but never breaks tier ordering within the entity lane itself.
    const entityLane = this.dropShadowedIngredientMatches(
      scoredEntities
        .filter(
          ({ candidate }) => !this.isAttributeType(candidate.match.entityType),
        )
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.candidate.textStrength - a.candidate.textStrength ||
            a.candidate.match.name.localeCompare(b.candidate.match.name),
        )
        .map(({ candidate }) => candidate),
    );

    const attributeLane = this.rankAttributeLane(
      scoredEntities
        .filter(({ candidate }) =>
          this.isAttributeType(candidate.match.entityType),
        )
        .map(({ candidate }) => candidate),
      attributeSupport,
    );

    // One query lane: personal (own recency/count) first, then global
    // (distinct-actor demand) — rank-only, item 3 of the ratified refit.
    const queryLane = [
      ...personalQueryCandidates,
      ...globalQueryCandidates,
    ].map(({ candidate }) => candidate);

    const finalMatches = this.mergeAutocompleteLanes({
      // Lane order is the FINAL structural tie-break ("a same-rank user/poll
      // row never displaces an entity"), applied only after evidence,
      // own-engagement, and popularity all tie.
      lanes: [
        entityLane,
        attributeLane,
        queryLane,
        pollCandidates,
        userCandidates,
      ],
      limit,
    });

    const querySuggestionTexts = querySuggestionStrip.map(
      ({ candidate }) => candidate.match.name,
    );

    return { matches: finalMatches, querySuggestionTexts };
  }

  /**
   * CROSS-LANE FUSION (ratified refit 2026-07-24): unweighted RRF over lane
   * ranks. Each lane hands over its own internal ordering; a row's fused
   * score is 1/(RRF_K + rankInLane) for its lane — lanes are partitioned by
   * ID namespace, so a candidate never appears in two lanes (the dedupe below
   * keeps the best entry rather than summing; if a future lane ever shares
   * IDs with another, revisit with true multi-list accumulation) — no
   * cross-family weights, ever. Ties (same rank across lanes) break on the
   * only type-neutral facts: (a) evidence-tier strength, (b) the requesting
   * user's OWN engagement with that exact row (favorite → viewed → affinity,
   * lexicographic — never blended), (c) global popularity, then lane order
   * (entity first — a same-rank user/poll row never displaces an entity) and
   * name for determinism. The FULL query lane enters (never the
   * strip-truncated subset); the reserved-slot constants shape only the
   * separate query-suggestion strip upstream.
   */
  private mergeAutocompleteLanes(params: {
    lanes: LaneCandidate[][];
    limit: number;
  }): AutocompleteMatchDto[] {
    const fused: Array<{
      candidate: LaneCandidate;
      rrf: number;
      laneIndex: number;
    }> = [];
    params.lanes.forEach((lane, laneIndex) => {
      lane.forEach((candidate, rank) => {
        fused.push({ candidate, rrf: 1 / (RRF_K + rank + 1), laneIndex });
      });
    });
    fused.sort(
      (a, b) =>
        b.rrf - a.rrf ||
        b.candidate.textStrength - a.candidate.textStrength ||
        Number(b.candidate.favorite) - Number(a.candidate.favorite) ||
        Number(b.candidate.viewed) - Number(a.candidate.viewed) ||
        b.candidate.affinity - a.candidate.affinity ||
        b.candidate.popularity - a.candidate.popularity ||
        a.laneIndex - b.laneIndex ||
        a.candidate.match.name.localeCompare(b.candidate.match.name),
    );
    const finalMatches: AutocompleteMatchDto[] = [];
    const seen = new Set<string>();
    for (const { candidate } of fused) {
      if (finalMatches.length >= params.limit) {
        break;
      }
      const key = `${candidate.match.entityType}:${candidate.match.entityId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      finalMatches.push(candidate.match);
    }
    return finalMatches;
  }

  /**
   * ATTRIBUTE LANE internal ranking (ratified refit 2026-07-24): the three
   * support signals — typed-demand, selection-demand, corpus usefulness —
   * are incomparable families, so they fuse as three independent RANKINGS
   * via unweighted RRF (replaces the deleted 0.6/0.3/0.1 blend × 1.35).
   * A candidate absent from a sub-ranking (zero signal) contributes nothing
   * to it. Ties (e.g. zero support everywhere) break on evidence strength,
   * then name for determinism. Show/hide stays with the structural
   * isStrongAttributeCandidate gate — support never decides visibility.
   */
  private rankAttributeLane(
    candidates: LaneCandidate[],
    support: Map<string, AttributeSupportScore>,
  ): LaneCandidate[] {
    const signals: Array<(s: AttributeSupportScore) => number> = [
      (s) => s.typedSearchSupport,
      (s) => s.autocompleteSelectionSupport,
      (s) => s.corpusUsefulness,
    ];
    const fusedById = new Map<string, number>();
    for (const read of signals) {
      const ranked = candidates
        .map((candidate) => ({
          candidate,
          value: read(
            support.get(candidate.match.entityId) ??
              this.emptyAttributeSupport(),
          ),
        }))
        .filter(({ value }) => value > 0)
        .sort(
          (a, b) =>
            b.value - a.value ||
            a.candidate.match.name.localeCompare(b.candidate.match.name),
        );
      ranked.forEach(({ candidate }, rank) => {
        const id = candidate.match.entityId;
        fusedById.set(id, (fusedById.get(id) ?? 0) + 1 / (RRF_K + rank + 1));
      });
    }
    return [...candidates].sort(
      (a, b) =>
        (fusedById.get(b.match.entityId) ?? 0) -
          (fusedById.get(a.match.entityId) ?? 0) ||
        b.textStrength - a.textStrength ||
        a.match.name.localeCompare(b.match.name),
    );
  }

  /**
   * Evidence-tier ordinal for a lane row. Rows without a matcher tier are the
   * injected personal lanes (favorites/viewed), which match by literal name
   * prefix — structural prefix evidence by construction.
   */
  private textStrengthOf(match: AutocompleteMatchDto): number {
    if (match.evidenceTier) {
      return EVIDENCE_TIER_STRENGTH[match.evidenceTier] ?? 0;
    }
    return EVIDENCE_TIER_STRENGTH.prefix;
  }

  /**
   * Poll lane (§8.1, refit 2026-07-24): active polls in the current viewport
   * scope whose question matches the query. Rank-only, no similarity floor:
   * prefix-tier first (question starts with the query), then word-similarity
   * order, capped at the K1 slots (≤ 3). A weak match can appear only when
   * fewer than 3 better ones exist — the honest meaning the deleted 0.4
   * floor was reaching for.
   */
  private async fetchPollMatches(
    normalizedQuery: string,
    limit: number,
    bounds: MapBoundsDto | null,
  ): Promise<LaneCandidate[]> {
    // Leg 2 markets extermination: the lane's old market_key scope (fed by the
    // per-search market election) is DEAD. Scope is now the §2.6 ground law
    // directly — polls of places whose ground intersects the viewport (same
    // place-scoped semantics as the polls feed). No bounds → lane off, exactly
    // as the old no-market case.
    const envelope = viewportEnvelopeSql(bounds);
    if (
      !this.pollLaneEnabled ||
      !envelope ||
      normalizedQuery.trim().length < POLL_LANE_MIN_QUERY_LENGTH
    ) {
      return [];
    }
    const take = Math.max(1, Math.min(limit, POLL_LANE_MAX_CANDIDATES));
    const likePattern = `%${normalizedQuery}%`;
    const prefixPattern = `${normalizedQuery}%`;
    // Membership is structural: the question contains the typed text, or
    // shares at least one trigram with it (word_similarity > 0) — "matched at
    // all", not a hand threshold. Rank order does the rest.
    const rows = await this.prisma.$queryRaw<
      Array<{
        poll_id: string;
        question: string;
        sim: number;
        is_prefix: boolean;
      }>
    >(Prisma.sql`
      SELECT p.poll_id, p.question,
             word_similarity(${normalizedQuery}, p.question) AS sim,
             (p.question ILIKE ${prefixPattern}) AS is_prefix
      FROM polls p
      WHERE p.state::text = 'active'
        AND p.place_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM place_geometries pg
          WHERE pg.place_id = p.place_id
            AND pg.geometry && ${envelope}
            AND ST_Intersects(pg.geometry, ${envelope})
        )
        AND (
          p.question ILIKE ${likePattern}
          OR word_similarity(${normalizedQuery}, p.question) > 0
        )
      ORDER BY is_prefix DESC, sim DESC, launched_at DESC NULLS LAST
      LIMIT ${take}
    `);
    return (
      rows
        .map((row) => ({
          row,
          sim: clamp01(Number(row.sim) || 0),
          isPrefix: Boolean(row.is_prefix),
        }))
        // Re-assert the lane contract in code (prefix tier first, then
        // similarity rank) so it holds regardless of driver row order.
        .sort(
          (a, b) => Number(b.isPrefix) - Number(a.isPrefix) || b.sim - a.sim,
        )
        .slice(0, take)
        .map(({ row, sim, isPrefix }) => ({
          match: {
            entityId: row.poll_id,
            entityType: 'poll' as const,
            name: row.question,
            aliases: [],
            confidence: Number(sim.toFixed(2)),
            matchType: 'poll' as const,
          },
          textStrength: isPrefix
            ? EVIDENCE_TIER_STRENGTH.prefix
            : EVIDENCE_TIER_STRENGTH.fuzzy,
          favorite: false,
          viewed: false,
          affinity: 0,
          popularity: 0,
        }))
    );
  }

  /**
   * User lane (person rows, refit 2026-07-24): people by username/displayName
   * prefix or word similarity. Rank-only, no similarity floor: prefix-tier
   * first, then word-similarity order, capped at the K1 slots (≤ 3). A weak
   * match can appear only when fewer than 3 better ones exist. A tap pushes
   * the userProfile page (client routes matchType 'user' through pushScene).
   */
  private async fetchUserMatches(
    normalizedQuery: string,
    limit: number,
  ): Promise<LaneCandidate[]> {
    if (
      !this.userLaneEnabled ||
      normalizedQuery.trim().length < USER_LANE_MIN_QUERY_LENGTH
    ) {
      return [];
    }
    const take = Math.max(1, Math.min(limit, USER_LANE_MAX_CANDIDATES));
    const prefixPattern = `${normalizedQuery}%`;
    // Membership is structural: name starts with the query, or shares at
    // least one trigram with it (sim > 0) — "matched at all", no threshold.
    const rows = await this.prisma.$queryRaw<
      Array<{
        user_id: string;
        username: string | null;
        display_name: string | null;
        sim: number;
        is_prefix: boolean;
      }>
    >(Prisma.sql`
      SELECT user_id, username, display_name, sim, is_prefix
      FROM (
        SELECT user_id, username, display_name,
               GREATEST(
                 word_similarity(${normalizedQuery}, COALESCE(username::text, '')),
                 word_similarity(${normalizedQuery}, COALESCE(display_name, ''))
               ) AS sim,
               (COALESCE(username::text ILIKE ${prefixPattern}, false)
                 OR COALESCE(display_name ILIKE ${prefixPattern}, false)) AS is_prefix
        FROM users
        WHERE username IS NOT NULL OR display_name IS NOT NULL
      ) candidates
      WHERE is_prefix OR sim > 0
      ORDER BY is_prefix DESC, sim DESC
      LIMIT ${take}
    `);
    return (
      rows
        .map((row) => ({
          row,
          sim: clamp01(Number(row.sim) || 0),
          isPrefix: Boolean(row.is_prefix),
        }))
        // Re-assert the lane contract in code (prefix tier first, then
        // similarity rank) so it holds regardless of driver row order.
        .sort(
          (a, b) => Number(b.isPrefix) - Number(a.isPrefix) || b.sim - a.sim,
        )
        .slice(0, take)
        .map(({ row, sim, isPrefix }) => {
          // Display-only confidence: prefix hits carry the prefix band (0.9,
          // the matcher's EVIDENCE_CONFIDENCE table); similarity hits carry
          // their similarity. Ranking never reads this field.
          const confidence = isPrefix ? Math.max(0.9, sim) : sim;
          return {
            match: {
              entityId: row.user_id,
              entityType: 'user' as const,
              name: row.display_name?.trim() || row.username || 'Crave member',
              aliases: row.username ? [row.username] : [],
              confidence: Number(confidence.toFixed(2)),
              matchType: 'user' as const,
              username: row.username,
            },
            textStrength: isPrefix
              ? EVIDENCE_TIER_STRENGTH.prefix
              : EVIDENCE_TIER_STRENGTH.fuzzy,
            favorite: false,
            viewed: false,
            affinity: 0,
            popularity: 0,
          };
        })
    );
  }

  private calculateLexicalFirstEntityScore(params: {
    confidence: number;
    boost: number;
  }): number {
    const confidence = clamp01(params.confidence);
    const boost = Number.isFinite(params.boost) ? Math.max(0, params.boost) : 0;
    const boosted = confidence * (1 + Math.min(boost, 0.35));
    // STRUCTURAL tier invariant: popularity/affinity boosts rank WITHIN an
    // evidence band, never across one — the boosted score is clamped just below
    // the next band's floor (pre-clamp, prefix 0.9 × 1.35 = 1.215 could outrank
    // an exact 1.0, silently violating evidence-first ranking whenever an
    // operator widened a boost weight env var). Bands mirror the entity-search
    // EVIDENCE_CONFIDENCE table; cross-lane blend calibration is untouched.
    const bands = [0.35, 0.4, 0.55, 0.6, 0.9, 1.0];
    const nextBand = bands.find((b) => b > confidence + 1e-9);
    return nextBand !== undefined
      ? Math.min(boosted, nextBand - 0.001)
      : boosted;
  }

  private isStrongAttributeCandidate(params: {
    match: AutocompleteMatchDto;
    normalizedQuery: string;
  }): boolean {
    if (!this.isAttributeType(params.match.entityType)) {
      return true;
    }
    // Structural show/hide rule (replaces the dead confidence×support matrix,
    // whose rankSupport capped at 0.096 against 0.22/0.42/0.65 floors — so a user
    // typing "vegan" verbatim got NOTHING). Now: exact or prefix evidence ⇒ always
    // show (you essentially typed it); fuzzier evidence needs a query of ≥4 chars
    // so a 1-3 char fragment doesn't surface loosely-matched attributes. Demand/
    // corpus support is a RANKING signal only (calculateAttributeScore) — it never
    // decides whether an attribute appears.
    const evidence = params.match.evidenceTier;
    if (evidence === 'exact' || evidence === 'prefix') {
      return true;
    }
    return params.normalizedQuery.trim().length >= 4;
  }

  private emptyAttributeSupport(): AttributeSupportScore {
    return {
      typedSearchSupport: 0,
      autocompleteSelectionSupport: 0,
      corpusUsefulness: 0,
    };
  }

  private async loadAttributeSupport(
    matches: AutocompleteMatchDto[],
  ): Promise<Map<string, AttributeSupportScore>> {
    const attributeIds = Array.from(
      new Set(
        matches
          .filter((match) => this.isAttributeType(match.entityType))
          .map((match) => match.entityId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (!attributeIds.length) {
      return new Map();
    }

    // READER CUT (§22 item 6): attribute demand support reads the signals
    // substrate — typed-search support = 'search' acts on the attribute,
    // selection support = 'autocomplete_selection' acts. Demand is global
    // (market scoping died with the market model; the old scoped-plus-
    // backstop split collapses away). The corpus lane below is unchanged.
    const [typedRows, selectedRows, corpusRows] = await Promise.all([
      this.loadAttributeDemandSupport(attributeIds, ['search']),
      this.loadAttributeDemandSupport(attributeIds, ['autocomplete_selection']),
      this.prisma.$queryRaw<
        Array<{
          attributeId: string;
          corpusConnectionCount: number;
          totalRestaurantCount: number;
        }>
      >(Prisma.sql`
      WITH scoped_restaurants AS (
        -- Leg 2 markets extermination: the market-scoped arm is DEAD; corpus
        -- support is global (matching the global demand lanes above).
        SELECT r.entity_id AS restaurant_id
        FROM core_entities r
        WHERE r.type = 'restaurant'
      ),
      attribute_refs AS (
        SELECT UNNEST(r.restaurant_attributes) AS attribute_id, r.entity_id AS restaurant_id
        FROM core_entities r
        JOIN scoped_restaurants sr ON sr.restaurant_id = r.entity_id
        UNION ALL
        SELECT UNNEST(c.food_attributes) AS attribute_id, c.restaurant_id
        FROM core_restaurant_items c
        JOIN scoped_restaurants sr ON sr.restaurant_id = c.restaurant_id
      ),
      totals AS (
        SELECT COUNT(*)::int AS total_restaurant_count
        FROM scoped_restaurants
      )
      SELECT
        attribute_id AS "attributeId",
        COUNT(DISTINCT restaurant_id)::int AS "corpusConnectionCount",
        (SELECT total_restaurant_count FROM totals) AS "totalRestaurantCount"
      FROM attribute_refs
      WHERE attribute_id = ANY(ARRAY[${Prisma.join(attributeIds)}]::uuid[])
      GROUP BY attribute_id
    `),
    ]);

    const corpusById = new Map(
      corpusRows.map((row) => [
        row.attributeId,
        {
          connectionCount: Number(row.corpusConnectionCount ?? 0),
          totalRestaurantCount: Number(row.totalRestaurantCount ?? 0),
        },
      ]),
    );
    const supportById = new Map<string, AttributeSupportScore>();

    for (const attributeId of attributeIds) {
      // RAW facts/derivations — the lane consumes these rank-only (RRF over
      // the three sub-rankings in rankAttributeLane), so no normalization and
      // no blended rankSupport exist anymore (refit 2026-07-24).
      supportById.set(attributeId, {
        typedSearchSupport: typedRows.get(attributeId) ?? 0,
        autocompleteSelectionSupport: selectedRows.get(attributeId) ?? 0,
        corpusUsefulness: this.normalizeAttributeCorpusUsefulness(
          corpusById.get(attributeId) ?? {
            connectionCount: 0,
            totalRestaurantCount: 0,
          },
        ),
      });
    }

    return supportById;
  }

  private async loadAttributeDemandSupport(
    attributeIds: string[],
    kinds: SignalKind[],
  ): Promise<Map<string, number>> {
    return this.signalDemandRead.entityDemandScores({
      entityIds: attributeIds,
      kinds,
      windowDays: ATTRIBUTE_SUPPORT_WINDOW_DAYS,
    });
  }

  private normalizeAttributeCorpusUsefulness(params: {
    connectionCount: number;
    totalRestaurantCount: number;
  }): number {
    if (params.connectionCount <= 0 || params.totalRestaurantCount <= 0) {
      return 0;
    }
    const breadth = clamp01(Math.log2(1 + params.connectionCount) / 6);
    const selectivity = clamp01(
      params.connectionCount / params.totalRestaurantCount,
    );
    const selectivityPenalty = Math.max(0.12, Math.pow(1 - selectivity, 0.8));
    return breadth * selectivityPenalty;
  }

  private isAttributeType(
    entityType: EntityType | 'query' | 'poll' | 'user',
  ): entityType is EntityType {
    return (
      entityType === EntityType.food_attribute ||
      entityType === EntityType.restaurant_attribute
    );
  }

  private calculateViewAffinity(lastViewedAt: Date, viewCount: number): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysSince = (Date.now() - lastViewedAt.getTime()) / msPerDay;
    const decayDays = Math.max(1, this.viewRecencyDecayDays);
    const viewRecency = Math.exp(-daysSince / decayDays);
    const cap = Math.max(1, this.viewFrequencyCap);
    const viewFrequency = Math.min(Math.log1p(viewCount) / Math.log1p(cap), 1);
    return viewRecency * 0.7 + viewFrequency * 0.3;
  }

  /**
   * Name-collision rule for ingredient rows (728 names exist as BOTH food
   * and ingredient entities — "burrata"): the FOOD row keeps the seat. Two
   * identical-looking rows with different tap behavior is the confusion;
   * the food row's dish results are the primary intent for a name that IS
   * a dish, and the typed-submit path still reaches the full union.
   */
  private dropShadowedIngredientMatches(
    candidates: LaneCandidate[],
  ): LaneCandidate[] {
    const nonIngredientNames = new Set(
      candidates
        .filter((c) => c.match.entityType !== EntityType.ingredient)
        .map((c) => c.match.name.trim().toLowerCase()),
    );
    return candidates.filter(
      (c) =>
        c.match.entityType !== EntityType.ingredient ||
        !nonIngredientNames.has(c.match.name.trim().toLowerCase()),
    );
  }

  private resolveEntityTypes(dto: AutocompleteRequestDto): EntityType[] {
    const hasExplicitTypes =
      Boolean(dto.entityType) || Boolean(dto.entityTypes?.length);
    const requested =
      dto.entityTypes && dto.entityTypes.length > 0
        ? dto.entityTypes
        : dto.entityType
          ? [dto.entityType]
          : // Ingredient rows joined the panel 2026-07-25 (owner ruling —
            // the "octopus"/"jalapeño" discovery surface). Same-named food
            // rows win the seat: see dropShadowedIngredientMatches.
            [EntityType.food, EntityType.restaurant, EntityType.ingredient];
    const filtered = requested.filter(
      (entityType) => !this.isAttributeType(entityType),
    );
    if (filtered.length > 0) {
      return filtered;
    }
    return hasExplicitTypes
      ? []
      : [EntityType.food, EntityType.restaurant, EntityType.ingredient];
  }

  private resolveAttributeEntityTypes(
    dto: AutocompleteRequestDto,
  ): EntityType[] {
    if (!this.attributeLaneEnabled) {
      return [];
    }
    const hasExplicitTypes =
      Boolean(dto.entityType) || Boolean(dto.entityTypes?.length);
    const requested =
      dto.entityTypes && dto.entityTypes.length > 0
        ? dto.entityTypes
        : dto.entityType
          ? [dto.entityType]
          : [];
    if (!hasExplicitTypes) {
      return [EntityType.food_attribute, EntityType.restaurant_attribute];
    }
    return requested.filter((entityType) => this.isAttributeType(entityType));
  }

  private async resolveViaEntityResolver(
    dto: AutocompleteRequestDto,
    normalizedQuery: string,
    entityType: EntityType,
    limit: number,
  ): Promise<AutocompleteMatchDto[]> {
    const resolution = await this.entityResolutionService.resolveBatch(
      [
        {
          tempId: 'autocomplete',
          normalizedName: normalizedQuery,
          originalText: dto.query,
          entityType,
          engineId: null,
        },
      ],
      {
        enableFuzzyMatching: true,
        batchSize: 1,
        allowEntityCreation: false,
      },
    );

    const resolvedIds = resolution.resolutionResults
      .filter((result) => result.entityId)
      .map((result) => result.entityId!);
    const entityNameMap =
      resolvedIds.length > 0
        ? new Map(
            (
              await this.prisma.entity.findMany({
                where: { entityId: { in: resolvedIds } },
                select: { entityId: true, name: true },
              })
            ).map((entity) => [entity.entityId, entity.name]),
          )
        : new Map<string, string>();

    const matches: AutocompleteMatchDto[] = [];
    for (const result of resolution.resolutionResults) {
      if (!result.entityId || (result.confidence ?? 0) < 0.5) {
        continue;
      }
      const canonicalName =
        entityNameMap.get(result.entityId) ?? result.matchedName ?? null;
      if (!canonicalName || !canonicalName.trim().length) {
        continue;
      }
      matches.push({
        entityId: result.entityId,
        entityType: result.entityType ?? entityType,
        name: canonicalName,
        aliases: result.originalInput.aliases ?? [],
        confidence: Number(Math.round((result.confidence ?? 0) * 100) / 100),
        matchType: 'entity',
      });
      if (matches.length >= limit) {
        break;
      }
    }
    return matches;
  }

  private normalizePopularity(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return Math.min(value, 50) / 50;
  }

  private resolveEnvInt(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined) {
      return fallback;
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value;
  }

  private resolveEnvString(key: string, fallback: string): string {
    const raw = process.env[key];
    if (typeof raw !== 'string') {
      return fallback;
    }
    const normalized = raw.trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  private resolveEnvBoolean(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (typeof raw !== 'string') {
      return fallback;
    }
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private buildCacheKey(
    userId: string | null,
    entityTypes: EntityType[],
    normalizedQuery: string,
    scopePlaceKey: string,
    attributeLaneEnabled: boolean,
  ): string {
    const scopeKey = entityTypes.slice().sort().join(',');
    const queryToken = encodeURIComponent(normalizedQuery);
    return `${this.cacheRedisKeyPrefix}:${
      userId ?? 'anon'
    }:${scopeKey}:${scopePlaceKey}:attrs-${
      attributeLaneEnabled ? 'on' : 'off'
    }:${queryToken}`;
  }

  /**
   * IMPRESSION INSTRUMENTATION (ratified refit 2026-07-24, layer-1 item 5):
   * one structured info line per served request — the durable impression side
   * of the (impression, tap) pairs post-launch calibrated LTR bootstraps
   * from (taps already land as autocomplete_selection signals). DELIBERATE
   * INTERIM: logs only, no new tables or signal kinds in this pass. Query
   * text is hashed (not stored raw) so the row id is stable and joinable
   * without keeping free text in the log line.
   */
  private logImpressions(
    normalizedQuery: string,
    response: AutocompleteResponseDto,
  ): void {
    try {
      const rows = response.matches.map((match, position) => ({
        lane: this.laneOf(match),
        entityType: String(match.entityType),
        entityRef:
          match.matchType === 'query'
            ? this.hashQueryText(match.name)
            : match.entityId,
        position,
        evidenceTier: match.evidenceTier ?? null,
      }));
      const strip = (response.querySuggestions ?? []).map((text, position) => ({
        lane: 'query_strip',
        entityType: 'query',
        entityRef: this.hashQueryText(text),
        position,
        evidenceTier: null,
      }));
      this.logger.info('autocomplete_impressions', {
        event: 'autocomplete_impressions',
        queryLength: normalizedQuery.length,
        rows: [...rows, ...strip],
      });
    } catch {
      // Instrumentation must never fail a request.
    }
  }

  private laneOf(match: AutocompleteMatchDto): string {
    if (match.matchType === 'query') return 'query';
    if (match.matchType === 'poll') return 'poll';
    if (match.matchType === 'user') return 'user';
    return this.isAttributeType(match.entityType) ? 'attribute' : 'entity';
  }

  private hashQueryText(text: string): string {
    return createHash('sha256')
      .update(text.trim().toLowerCase())
      .digest('hex')
      .slice(0, 16);
  }

  private async getFromCache(cacheKey: string): Promise<{
    response: AutocompleteResponseDto | null;
    result: CacheResult;
  }> {
    if (this.cacheTtlSeconds <= 0) {
      return { response: null, result: 'skipped' };
    }

    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) {
        return { response: null, result: 'miss' };
      }
      const parsed = JSON.parse(raw) as AutocompleteResponseDto;
      if (
        !parsed ||
        !Array.isArray(parsed.matches) ||
        typeof parsed.query !== 'string' ||
        typeof parsed.normalizedQuery !== 'string'
      ) {
        await this.redis.del(cacheKey);
        return { response: null, result: 'miss' };
      }
      return { response: parsed, result: 'hit' };
    } catch (error) {
      this.logger.warn('Autocomplete cache lookup failed', {
        operation: 'autocomplete_cache_get',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return { response: null, result: 'skipped' };
    }
  }

  private async setInCache(
    cacheKey: string,
    response: AutocompleteResponseDto,
  ): Promise<void> {
    if (this.cacheTtlSeconds <= 0) {
      return;
    }
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(response),
        'EX',
        Math.max(1, this.cacheTtlSeconds),
      );
    } catch (error) {
      this.logger.warn('Autocomplete cache write failed', {
        operation: 'autocomplete_cache_set',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
