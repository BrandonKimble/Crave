import { countEnrichmentFailure } from './enrichment-failure-counter';
import {
  classifyEnrichmentError,
  classifyNoMatchReason,
  type EnrichmentFailureVerdict,
} from './enrichment-failure-taxonomy';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';
import {
  addSurfaces,
  type SurfaceInput,
} from '../content-processing/entity-resolver/entity-surface.service';
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Entity,
  EntityStatus,
  EntityType,
  Prisma,
  RestaurantLocation,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { parse as parseDomain } from 'tldts';
import { PrismaService } from '../../prisma/prisma.service';
import {
  runInWorkContext,
  currentWorkContext,
} from '../external-integrations/shared/work-context';
import {
  GooglePlacesService,
  GooglePlacesV1AutocompleteSuggestion,
  GooglePlacesV1Place,
  GooglePlacesV1PlaceDetailsResponse,
  REFRESH_PLACE_DETAILS_FIELD_MASK_FIELDS,
} from '../external-integrations/google-places/google-places.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { LoggerService } from '../../shared';
import { bankableLanguageTag } from '../../shared/locale';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import {
  PublicCraveScoreService,
  RescoreCoordinatorService,
} from '../content-processing/public-crave-score';
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';
import { RestaurantCuisineExtractionQueueService } from './restaurant-cuisine-extraction-queue.service';
import { RestaurantSecondaryLocationExpansionQueueService } from './restaurant-secondary-location-expansion-queue.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import {
  brandClusterPurity,
  restaurantNamesAgree,
} from './business-identity-rules';
import {
  GOOGLE_BOOLEAN_ATTRIBUTE_VOCAB,
  GOOGLE_PLACE_TYPE_ATTRIBUTE_CANONICAL_NAMES,
  GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP,
  RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME,
  type RestaurantAttributeVocabEntry,
} from './google-place-type-attributes';

const GOOGLE_DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
const DEFAULT_ENRICHMENT_TX_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_ENRICHMENT_TX_MAX_WAIT_MS = 30 * 1000;
type GoogleDayName = (typeof GOOGLE_DAY_NAMES)[number];

const GOOGLE_RESTAURANT_ATTRIBUTE_CANONICAL_NAMES = Array.from(
  new Set(
    [
      ...GOOGLE_BOOLEAN_ATTRIBUTE_VOCAB.map((entry) =>
        entry.canonicalName.trim().toLowerCase(),
      ),
      ...GOOGLE_PLACE_TYPE_ATTRIBUTE_CANONICAL_NAMES,
    ].filter((name) => name.length > 0),
  ),
);

interface NormalizedOpeningHours {
  hours?: Partial<Record<GoogleDayName, string | string[]>>;
  utcOffsetMinutes?: number;
  timezone?: string;
}

interface MatchMetadata {
  query: string;
  score?: number;
  predictionDescription?: string;
  mainText?: string;
  secondaryText?: string;
  candidateTypes?: string[];
  predictionsConsidered: number;
  timestamp: string;
  source?: 'autocomplete' | 'find_place';
  redirectedFromPlaceId?: string;
  redirectedToPlaceId?: string;
  redirectedFromBusinessStatus?: string;
}

// NO PLACES SESSION TOKEN, BY DECISION (2026-08-07, audit F9520). This type
// used to carry a `sessionToken` that was threaded through every autocomplete /
// find-place call and dropped at the concluding getPlaceDetails — no caller
// anywhere ever produced one, so it billed nothing and hid a trap: "finishing"
// the client half would have made billing WORSE. Google's session pricing pays
// off when ONE session absorbs many keystrokes before a details call; our
// grounding is one-shot (one query, one autocomplete, one details), so a
// session saves at most the autocomplete line — ceiling ~$20 even at scale,
// less than the cost of minting, threading and metering the tokens. If this
// ever returns, it must arrive WITH a per-keystroke client producer, not as a
// server-side field waiting for one.
export interface RestaurantEnrichmentOptions {
  force?: boolean;
  /** Bypass the terminal-failure money guard — for the recovery sweep after a
   *  root-cause fix, when re-attempting known failures is the entire point. */
  retryTerminal?: boolean;
  dryRun?: boolean;
  query?: string;
  sourceText?: string;
  sourceLocale?: {
    city?: string | null;
    region?: string | null;
  };
  countryCode?: string;
  locationBias?: {
    lat: number;
    lng: number;
    radiusMeters?: number;
  };
}

export interface RestaurantEnrichmentResult {
  entityId: string;
  status: 'updated' | 'skipped' | 'not_found' | 'no_match' | 'error';
  reason?: string;
  placeId?: string;
  score?: number;
  updatedFields?: string[];
  mergedInto?: string;
}

export interface BatchEnrichmentOptions extends RestaurantEnrichmentOptions {
  limit?: number;
  entityId?: string;
}

export interface BatchEnrichmentSummary {
  attempted: number;
  updated: number;
  skipped: number;
  failures: Array<{ entityId: string; reason: string }>;
  results: RestaurantEnrichmentResult[];
}

/**
 * A restaurant entity CREATE payload plus the surface forms that must be
 * banked with it. `surfaceForms` is NOT a Prisma column — `core_entities.
 * aliases[]` was retired (§11 item 4 / I-2) and surfaces live only in
 * `entity_surface`, so the caller strips this field, inserts the row, and
 * calls addSurfaces inside the same transaction.
 */
export type RestaurantCreateInput = Prisma.EntityCreateInput & {
  surfaceForms: string[];
};

type RestaurantEntity = Entity & {
  restaurantMetadata: Prisma.JsonValue | null;
  primaryLocation?: RestaurantLocation | null;
  locations?: RestaurantLocation[];
};

type RestaurantEntityWithLocations = Prisma.EntityGetPayload<{
  include: { primaryLocation: true; locations: true };
}>;

interface EnrichmentSearchContext {
  query: string | null;
  sourceText?: string;
  city?: string;
  region?: string;
  countryCode?: string;
  locationBias?: { lat: number; lng: number; radiusMeters?: number };
}

interface PlaceCandidate {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
  types?: string[];
  latitude?: number;
  longitude?: number;
}

type RankedCandidate = {
  candidate: PlaceCandidate;
  score?: number;
};

type CandidateSelectionSource = 'autocomplete' | 'find_place';

type CandidateSelectionTrailEntry = {
  placeId: string;
  candidateName: string;
  source: CandidateSelectionSource;
  sameBusiness: boolean;
  reason?: string;
  autocompleteRank?: number;
  searchTextRank?: number;
  localeBiasMatch?: boolean;
  exactNameMatch?: boolean;
  consensusCandidate?: boolean;
};

type CandidateSelectionResult = {
  selected?: {
    entry: RankedCandidate;
    matchSource: CandidateSelectionSource;
    score?: number;
  };
  adjudicationTrail: CandidateSelectionTrailEntry[];
  strategy: 'gemini_staged';
};

type CandidateStageEvaluation = {
  selection: CandidateSelectionResult;
};

type GeminiSelectionFlowResult = {
  selection: CandidateSelectionResult;
  retryAutocompleteAttempted: boolean;
  retryAutocompleteRanked: RankedCandidate[];
  retryQuery?: string;
  fallbackAttempted: boolean;
  fallbackStatus?: string;
  fallbackRanked: RankedCandidate[];
  initialEvaluation: CandidateStageEvaluation;
  retryEvaluation?: CandidateStageEvaluation;
  finalEvaluation?: CandidateStageEvaluation;
};

type GeminiChooserCandidate = {
  candidateId: string;
  entry: RankedCandidate;
  matchSource: CandidateSelectionSource;
  autocompleteRank?: number;
  searchTextRank?: number;
  sourceLabels: CandidateSelectionSource[];
};

@Injectable()
export class RestaurantLocationEnrichmentService {
  private readonly logger: LoggerService;
  private readonly transactionTimeoutMs: number;
  private readonly transactionMaxWaitMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly llmService: LLMService,
    private readonly aliasManagementService: AliasManagementService,
    private readonly restaurantEntityMergeService: RestaurantEntityMergeService,
    private readonly publicCraveScoreService: PublicCraveScoreService,
    private readonly rescoreCoordinator: RescoreCoordinatorService,
    private readonly cuisineExtractionQueue: RestaurantCuisineExtractionQueueService,
    private readonly secondaryLocationExpansionQueue: RestaurantSecondaryLocationExpansionQueueService,
    private readonly configService: ConfigService,
    private readonly opsAlerts: OpsAlertsService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext(
      'RestaurantLocationEnrichmentService',
    );
    this.transactionTimeoutMs = DEFAULT_ENRICHMENT_TX_TIMEOUT_MS;
    this.transactionMaxWaitMs = DEFAULT_ENRICHMENT_TX_MAX_WAIT_MS;
  }

  async enrichMissingRestaurants(
    options: BatchEnrichmentOptions = {},
  ): Promise<BatchEnrichmentSummary> {
    if (options.entityId) {
      const result = await this.enrichRestaurantById(options.entityId, options);
      return {
        attempted: 1,
        updated: result.status === 'updated' ? 1 : 0,
        skipped: result.status === 'skipped' ? 1 : 0,
        failures:
          result.status === 'error'
            ? [{ entityId: options.entityId, reason: result.reason ?? 'error' }]
            : [],
        results: [result],
      };
    }

    const limit = options.limit ?? 25;
    const restaurants = await this.prisma.entity.findMany({
      where: {
        type: EntityType.restaurant,
        // ARCHIVED IS NEVER ENRICHED (big-one red team #6): all 308
        // archived restaurants are ungrounded, so an unfiltered window
        // spends its head-of-window budget RE-GROUNDING tombstones (junk
        // sinks + merge losers), partially undoing the class-③ archive —
        // ~$0.028 each, recurring every run. Same idiom as the janitor
        // and refreshStaleLocations.
        status: EntityStatus.active,
        OR: [
          { primaryLocation: null },
          { locations: { none: {} } },
          { primaryLocation: { latitude: null } },
          { primaryLocation: { longitude: null } },
          { primaryLocation: { address: null } },
          { primaryLocation: { googlePlaceId: null } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { primaryLocation: true, locations: true },
    });

    const summary: BatchEnrichmentSummary = {
      attempted: restaurants.length,
      updated: 0,
      skipped: 0,
      failures: [],
      results: [],
    };

    for (const entity of restaurants) {
      const result = await this.enrichRestaurant(entity, options);
      summary.results.push(result);

      if (result.status === 'updated') {
        summary.updated += 1;
      } else if (result.status === 'skipped' || result.status === 'no_match') {
        summary.skipped += 1;
      } else if (result.status === 'error') {
        summary.failures.push({
          entityId: entity.entityId,
          reason: result.reason || 'unknown error',
        });
      }
    }

    return summary;
  }

  async enrichRestaurantById(
    entityId: string,
    options: RestaurantEnrichmentOptions = {},
  ): Promise<RestaurantEnrichmentResult> {
    const entity = await this.prisma.entity.findUnique({
      where: { entityId },
      include: { primaryLocation: true, locations: true },
    });

    if (!entity) {
      return { entityId, status: 'not_found', reason: 'entity not found' };
    }
    if (entity.status === EntityStatus.archived) {
      // Closes the worker/--entity= paths too (big-one red team #6/#3c):
      // a dead entity must never buy Places data.
      return { entityId, status: 'skipped', reason: 'archived' };
    }

    // Attribution is derived inside enrichRestaurant (the single chokepoint),
    // so every path — this one, the bulk loop, the worker — is covered.
    return this.enrichRestaurant(entity, options);
  }

  /**
   * Cheap volatile-data refresh for ALREADY-ENRICHED locations. Uses the lean
   * refresh field mask (no atmosphere/editorial fields → bills below the
   * Enterprise+Atmosphere SKU the full mask forces) and only touches
   * locations whose lastPolledAt is older than the TTL. This is the ONLY
   * sanctioned way to re-poll Google for a place-backed location; `force`
   * full re-enrichment is for identity changes, not data freshness.
   */
  async refreshStaleLocations(
    options: { olderThanDays?: number; limit?: number } = {},
  ): Promise<{
    checked: number;
    updated: number;
    closedOrMoved: number;
    failed: number;
  }> {
    const olderThanDays = options.olderThanDays ?? 30;
    const limit = options.limit ?? 100;
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const stale = await this.prisma.restaurantLocation.findMany({
      where: {
        googlePlaceId: { not: null },
        OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: cutoff } }],
        // Archived restaurants (janitor's all-locations-closed action) are
        // dead weight — never spend Places refresh polls on them.
        restaurant: { status: { not: EntityStatus.archived } },
      },
      orderBy: { lastPolledAt: { sort: 'asc', nulls: 'first' } },
      take: limit,
    });

    const summary = { checked: 0, updated: 0, closedOrMoved: 0, failed: 0 };
    // Volatile-data re-polls are refresh spend, never new-grounding spend.
    return runInWorkContext(
      { ...(currentWorkContext() ?? {}), attribution: 'grounding.refresh' },
      () => this.refreshStaleLocationsInner(stale, summary),
    );
  }

  private async refreshStaleLocationsInner(
    stale: Awaited<ReturnType<PrismaService['restaurantLocation']['findMany']>>,
    summary: {
      checked: number;
      updated: number;
      closedOrMoved: number;
      failed: number;
    },
  ): Promise<{
    checked: number;
    updated: number;
    closedOrMoved: number;
    failed: number;
  }> {
    for (const location of stale) {
      summary.checked += 1;
      try {
        const details = await this.googlePlacesService.getPlaceDetails(
          location.googlePlaceId as string,
          { fields: REFRESH_PLACE_DETAILS_FIELD_MASK_FIELDS },
        );
        const place = details.place;
        if (!place) {
          summary.failed += 1;
          continue;
        }
        if (
          place.businessStatus === 'CLOSED_PERMANENTLY' ||
          (typeof place.movedPlaceId === 'string' && place.movedPlaceId.trim())
        ) {
          summary.closedOrMoved += 1;
          this.logger.warn('Refreshed location is closed or moved', {
            locationId: location.locationId,
            restaurantId: location.restaurantId,
            googlePlaceId: location.googlePlaceId,
            businessStatus: place.businessStatus,
            movedPlaceId: place.movedPlaceId,
          });
          // Persist the decay signal for the janitor to act on, and stamp
          // lastPolledAt so we don't re-poll it every run.
          await this.prisma.restaurantLocation.update({
            where: { locationId: location.locationId },
            data: {
              lastPolledAt: new Date(),
              businessStatus: place.businessStatus ?? null,
              movedPlaceId:
                typeof place.movedPlaceId === 'string' &&
                place.movedPlaceId.trim()
                  ? place.movedPlaceId.trim()
                  : null,
            },
          });
          continue;
        }
        const { update } = this.buildLocationUpsertData(
          location.restaurantId,
          location,
          place,
        );
        await this.prisma.restaurantLocation.update({
          where: { locationId: location.locationId },
          data: update,
        });
        summary.updated += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.warn('Location refresh failed', {
          locationId: location.locationId,
          googlePlaceId: location.googlePlaceId,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      }
    }

    this.logger.info('Stale location refresh complete', { ...summary });
    return summary;
  }

  async expandSecondaryLocationsForRestaurant(
    restaurantId: string,
    placeId: string,
    locationBias?: { lat: number; lng: number; radiusMeters?: number },
  ): Promise<void> {
    const normalizedRestaurantId = restaurantId?.trim();
    const normalizedPlaceId = placeId?.trim();
    if (!normalizedRestaurantId || !normalizedPlaceId) {
      return;
    }

    const entity = await this.prisma.entity.findUnique({
      where: { entityId: normalizedRestaurantId },
      include: { primaryLocation: true, locations: true },
    });

    if (!entity || entity.type !== EntityType.restaurant) {
      return;
    }

    // Secondary-location expansion re-reads an ALREADY-grounded place
    // (red-team cost P1) — refresh spend, never new-grounding.
    //
    // BUT IT IS NOT A REFRESH POLL (D29a). `includeRaw: true` is the FULL
    // field mask, which bills the Enterprise+Atmosphere SKU;
    // refreshStaleLocations was deliberately built on the lean
    // REFRESH_PLACE_DETAILS_FIELD_MASK_FIELDS precisely so refresh polls bill
    // BELOW that SKU. Labelling this 'grounding.refresh' put two different
    // SKUs in one bucket and produced a per-refresh unit cost that is true of
    // neither. The label now says which lane it is; the CALL is byte-
    // unchanged (whether this lane should use the lean mask, and whether it
    // should be campaign-captured, is F352/F354 — with the owner).
    const details = await runInWorkContext(
      { ...(currentWorkContext() ?? {}), attribution: 'grounding.expansion' },
      () =>
        this.googlePlacesService.getPlaceDetails(normalizedPlaceId, {
          includeRaw: true,
        }),
    );
    const resolvedDetails = await this.resolveEligiblePlaceDetails({
      details,
      fallbackPlaceId: normalizedPlaceId,
      query: entity.name,
      candidate: {
        placeId: normalizedPlaceId,
        description: entity.name,
        mainText: entity.name,
      },
      matchMetadata: {
        query: entity.name,
        predictionsConsidered: 1,
        timestamp: new Date().toISOString(),
        source: 'find_place',
      },
    });

    if (!resolvedDetails.details?.place) {
      return;
    }

    await this.enrichSecondaryLocations(
      entity,
      resolvedDetails.details.place,
      locationBias,
    );
  }

  async resolvePlaceForInput(params: {
    name: string;
    city?: string;
    region?: string;
    countryCode?: string;
    locationBias?: { lat: number; lng: number; radiusMeters?: number };
  }): Promise<{
    place: GooglePlacesV1Place;
    matchMetadata: MatchMetadata;
    score?: number;
  } | null> {
    const entity = {
      name: params.name,
      city: params.city ?? null,
      region: params.region ?? null,
      country: params.countryCode ?? null,
      restaurantMetadata: null,
    } as RestaurantEntity;

    const searchContext = this.buildSearchContext(entity, {
      sourceLocale: {
        city: params.city ?? null,
        region: params.region ?? null,
      },
      locationBias: params.locationBias,
      countryCode: params.countryCode,
      query: params.name,
    });

    if (!searchContext.query) {
      return null;
    }

    const ranked = await this.collectAutocompleteCandidates(
      searchContext.query,
      searchContext,
    );
    let matchSource: 'autocomplete' | 'find_place' = 'autocomplete';
    const flow = await this.runGeminiSelectionFlow({
      autocompleteRanked: ranked,
      entity,
      context: searchContext,
    });
    const {
      selection,
      fallbackAttempted,
      fallbackStatus,
      fallbackRanked,
      retryAutocompleteRanked,
    } = flow;

    if (!selection.selected) {
      if (fallbackAttempted && fallbackStatus) {
        this.logger.debug('Place match failed after fallback', {
          name: params.name,
          fallbackStatus,
        });
      }
      return null;
    }

    const best = selection.selected;
    matchSource = best.matchSource;

    const details = await this.googlePlacesService.getPlaceDetails(
      best.entry.candidate.placeId,
      { includeRaw: true },
    );

    if (!details.place) {
      return null;
    }

    const placeDetails = details.place;
    if (typeof placeDetails.id !== 'string' || !placeDetails.id.trim()) {
      placeDetails.id = best.entry.candidate.placeId;
    }

    const matchMetadata: MatchMetadata = {
      query: searchContext.query ?? '',
      predictionDescription: best.entry.candidate.description,
      mainText: best.entry.candidate.mainText,
      secondaryText: best.entry.candidate.secondaryText,
      candidateTypes: best.entry.candidate.types,
      predictionsConsidered:
        matchSource === 'find_place'
          ? fallbackRanked.length
          : this.mergeRankedCandidates([...ranked, ...retryAutocompleteRanked])
              .length,
      timestamp: new Date().toISOString(),
      source: matchSource,
    };

    const resolvedDetails = await this.resolveEligiblePlaceDetails({
      details,
      fallbackPlaceId: best.entry.candidate.placeId,
      query: searchContext.query ?? '',
      candidate: best.entry.candidate,
      matchMetadata,
    });
    if (!resolvedDetails.details?.place) {
      if (fallbackAttempted && fallbackStatus) {
        this.logger.debug('Place match rejected after details resolution', {
          name: params.name,
          fallbackStatus,
          reason: resolvedDetails.rejectionReason,
        });
      }
      return null;
    }

    return {
      place: resolvedDetails.details.place,
      matchMetadata,
    };
  }

  async buildRestaurantCreateInput(params: {
    name: string;
    place: GooglePlacesV1Place;
    matchMetadata: MatchMetadata;
    alias?: string | null;
  }): Promise<RestaurantCreateInput> {
    const baseEntity = {
      name: params.name,
      restaurantMetadata: null,
    } as RestaurantEntity;

    const displayName = this.getPlaceDisplayName(params.place) || params.name;
    const alias =
      params.alias &&
      params.alias.trim().length &&
      params.alias.trim().toLowerCase() !== displayName.toLowerCase()
        ? [params.alias.trim()]
        : [];

    const { updateData } = this.buildEntityUpdate(
      baseEntity,
      params.place,
      '',
      params.matchMetadata,
    );
    const createUpdateData = this.coerceEntityUpdateToCreateInput(updateData);

    const googleAttributeDefinitions =
      this.extractGoogleRestaurantAttributeDefinitions(params.place);
    const googleRestaurantAttributeIds =
      await this.resolveRestaurantAttributeIdsForDefinitions(
        googleAttributeDefinitions,
      );
    const placeTypeAttributes = this.mapPlaceTypesToRestaurantAttributeNames(
      params.place,
    );
    const placeTypeAttributeIds =
      await this.resolveRestaurantAttributeIdsForNames(placeTypeAttributes);
    const mergedRestaurantAttributes = this.unionStringArrays(
      googleRestaurantAttributeIds,
      placeTypeAttributeIds,
    );

    // §13 (markets extermination leg 3): NO presence stamping — geometric
    // presence (locations vs place grounds) is derived at read; the
    // core_entity_market_presence table is writer/reader-less.
    return {
      ...createUpdateData,
      name: displayName,
      type: EntityType.restaurant,
      canonicalDomain:
        this.normalizeWebsiteDomain(params.place.websiteUri) ?? undefined,
      // NOT a Prisma column any more (§11 item 4 / I-2 retired
      // core_entities.aliases[]). The caller creates the row, then banks
      // these through addSurfaces in the SAME transaction — one store for
      // surfaces, and the entity insert carries only entity columns.
      surfaceForms: alias,
      restaurantAttributes: mergedRestaurantAttributes,
      generalPraiseUpvotes: 0,
    };
  }

  buildLocationCreateInput(
    restaurantId: string,
    place: GooglePlacesV1Place,
  ): Prisma.RestaurantLocationUncheckedCreateInput {
    return this.buildLocationUpsertData(restaurantId, null, place).create;
  }

  // THE single chokepoint every enrichment path funnels through — bulk loop,
  // by-id, worker. Attribution is derived HERE (red-team cost P1, 2026-08-02:
  // the bulk `enrichMissingRestaurants` loop and secondary expansion called
  // the inner directly, bypassing the wrapper that used to live only on
  // enrichRestaurantById — so their Places spend wrote NULL attribution, was
  // dropped from the rate numerator while its restaurants stayed in the
  // denominator, and biased the per-restaurant rate low). Setting it here
  // means no caller can bypass it.
  private async enrichRestaurant(
    entity: RestaurantEntity,
    options: RestaurantEnrichmentOptions,
  ): Promise<RestaurantEnrichmentResult> {
    const alreadyGrounded =
      Boolean(entity.primaryLocation?.googlePlaceId) ||
      Boolean(entity.locations?.some((loc) => loc.googlePlaceId));
    return runInWorkContext(
      {
        ...(currentWorkContext() ?? {}),
        attribution: alreadyGrounded ? 'grounding.refresh' : 'grounding.new',
      },
      () => this.enrichRestaurantInner(entity, options),
    );
  }

  private async enrichRestaurantInner(
    entity: RestaurantEntity,
    options: RestaurantEnrichmentOptions,
  ): Promise<RestaurantEnrichmentResult> {
    if (entity.type !== EntityType.restaurant) {
      return {
        entityId: entity.entityId,
        status: 'skipped',
        reason: 'entity is not a restaurant',
      };
    }

    let latestDetails: GooglePlacesV1PlaceDetailsResponse | null = null;
    let latestMatchMetadata: MatchMetadata | null = null;
    let combinedUpdateData: Prisma.EntityUpdateInput | null = null;
    let combinedUpdatedFields: string[] = [];
    // A1: the Places alias forms, banked through the projection writer
    // after the entity row commits (see below).
    let pendingPlacesAliases: {
      entityId: string;
      forms: SurfaceInput[];
    } | null = null;
    let targetNameForUpdate: string | null = null;
    let enrichmentScore: number | undefined;
    let googleRestaurantAttributeIds: string[] = [];

    const hasPlaceId =
      Boolean(entity.primaryLocation?.googlePlaceId) ||
      Boolean(entity.locations?.some((loc) => loc.googlePlaceId));

    if (hasPlaceId && !options.force) {
      return {
        entityId: entity.entityId,
        status: 'skipped',
        reason: 'already has place-backed location identity',
      };
    }

    // THE MONEY GUARD (owner ruling 2026-08-08, janitor slim-down): once a
    // restaurant has definitively failed grounding `noMatchAttemptThreshold`
    // times, stop buying lookups for it — mention-driven retry would
    // otherwise re-purchase autocomplete (+ the expensive textSearch
    // fallback) on EVERY future mention of an ungroundable name, forever.
    // Only DEFINITIVE failures increment the counter (transient errors retry
    // free), the entity stays ACTIVE and name-searchable, and the ghost
    // recovery sweep bypasses with retryTerminal after a root-cause fix.
    // Threshold is a boot-validated positive int (F365) — no unset case
    // exists in a running process, so no unset branch exists here (F9965:
    // the earlier typeof check asserted a state prod cannot reach).
    const terminalThreshold = this.configService.get<number>(
      'locationLifecycle.noMatchAttemptThreshold',
    )!;
    if (
      (entity.enrichmentFailureCount ?? 0) >= terminalThreshold &&
      !options.force &&
      !options.retryTerminal
    ) {
      return {
        entityId: entity.entityId,
        status: 'skipped',
        reason: 'terminal grounding-failure threshold reached',
      };
    }

    // The chooser's GEOGRAPHY and WHAT-THE-PLACE-IS principles both key on
    // the community's own words ("Wegman's Astor Place", "the deli counter"),
    // and that text is already in our events — deriving it here means EVERY
    // lane feeds the judge, not just the recovery script that learned the
    // lesson (2026-08-08: the sweep passed snippets and live enqueues did
    // not, so day-to-day grounding still judged blind).
    const contextOptions = options.sourceText
      ? options
      : {
          ...options,
          sourceText:
            (await this.deriveSourceSnippet(entity.entityId)) ?? undefined,
        };
    const searchContext = this.buildSearchContext(entity, contextOptions);
    if (!searchContext.query) {
      await this.recordEnrichmentFailure(
        entity,
        'insufficient location context for enrichment query',
        {
          city: entity.city ?? undefined,
          region: entity.region ?? undefined,
          country: entity.country ?? undefined,
          latitude: this.toNumberValue(entity.latitude) ?? undefined,
          longitude: this.toNumberValue(entity.longitude) ?? undefined,
        },
        // DEFINITIVE: no vendor was ever called. The row itself has nothing to
        // search with, and it will have nothing tomorrow either.
        classifyNoMatchReason(
          'insufficient location context for enrichment query',
        ),
      );
      return {
        entityId: entity.entityId,
        status: 'skipped',
        reason: 'insufficient location context',
      };
    }

    try {
      const ranked = await this.collectAutocompleteCandidates(
        searchContext.query,
        searchContext,
      );

      let matchSource: 'autocomplete' | 'find_place' = 'autocomplete';
      const flow = await this.runGeminiSelectionFlow({
        autocompleteRanked: ranked,
        entity,
        context: searchContext,
      });
      const {
        selection,
        fallbackAttempted,
        fallbackStatus,
        fallbackRanked,
        retryAutocompleteRanked,
      } = flow;

      if (!selection.selected) {
        const noMatchMetadata = this.buildNoMatchMetadata(
          this.mergeRankedCandidates([
            ...ranked,
            ...retryAutocompleteRanked,
            ...fallbackRanked,
          ]),
          searchContext,
          fallbackAttempted
            ? {
                fallbackAttempted: true,
                fallbackStatus,
                fallbackUsed: fallbackRanked.length > 0,
                searchTextCandidates:
                  this.serializeRankedCandidates(fallbackRanked),
                candidateSelectionStrategy: selection.strategy,
                adjudicationTrail: selection.adjudicationTrail,
              }
            : {
                candidateSelectionStrategy: selection.strategy,
                adjudicationTrail: selection.adjudicationTrail,
              },
        );
        // Reason string is now honest: the CHOOSER declined every candidate
        // set (initial + locale retry + fallback). The old label blamed a
        // "preferred place types" filter that, by 2026-08-07, was only one
        // of several ways to arrive here — it sent the whole ghost
        // investigation down a type-list rabbit hole before the trails
        // showed the judge's own verdicts.
        const reason = 'chooser declined all candidate sets';
        await this.recordNoMatchCandidates(entity, reason, noMatchMetadata);
        return {
          entityId: entity.entityId,
          status: 'no_match',
          reason,
        };
      }

      const best = selection.selected;
      matchSource = best.matchSource;

      // FREE DUPLICATE PRE-CHECK before the paid details call (owner cost
      // question, 2026-08-10): the chooser's candidate already carries the
      // place id, and if ANOTHER entity of ours owns that place, the details
      // are already in the database — fetching them again spends the
      // expensive SKU to learn what one indexed lookup knows. Merge straight
      // into the owner instead. Same-entity ownership falls through to the
      // normal refresh path unchanged.
      const preOwned = await this.prisma.restaurantLocation.findUnique({
        where: { googlePlaceId: best.entry.candidate.placeId },
        select: { restaurantId: true },
      });
      if (preOwned && preOwned.restaurantId !== entity.entityId) {
        const canonical = await this.prisma.entity.findUnique({
          where: { entityId: preOwned.restaurantId },
        });
        if (canonical && canonical.status === 'active') {
          this.logger.info(
            'Place already owned by another entity — merging without a details call',
            {
              entityId: entity.entityId,
              canonicalId: canonical.entityId,
              placeId: best.entry.candidate.placeId,
            },
          );
          const merged =
            await this.restaurantEntityMergeService.mergeDuplicateRestaurant({
              canonical: canonical as never,
              duplicate: entity,
              canonicalUpdate: {},
            });
          return {
            entityId: merged.entityId,
            status: 'updated',
            reason: 'place_id owned by existing entity (pre-details check)',
          };
        }
      }

      const details = await this.googlePlacesService.getPlaceDetails(
        best.entry.candidate.placeId,
        { includeRaw: true },
      );
      latestDetails = details;

      if (!details.place) {
        const noMatchMetadata = this.buildNoMatchMetadata(
          this.mergeRankedCandidates([
            ...ranked,
            ...retryAutocompleteRanked,
            ...fallbackRanked,
          ]),
          searchContext,
        );
        await this.recordNoMatchCandidates(
          entity,
          'place details missing',
          noMatchMetadata,
        );
        return {
          entityId: entity.entityId,
          status: 'no_match',
          reason: 'place details missing',
        };
      }

      const placeDetails = details.place;
      if (typeof placeDetails.id !== 'string' || !placeDetails.id.trim()) {
        placeDetails.id = best.entry.candidate.placeId;
      }
      enrichmentScore = best.score;

      const matchMetadata: MatchMetadata = {
        query: searchContext.query ?? '',
        predictionDescription: best.entry.candidate.description,
        mainText: best.entry.candidate.mainText,
        secondaryText: best.entry.candidate.secondaryText,
        candidateTypes: best.entry.candidate.types,
        predictionsConsidered:
          matchSource === 'find_place' ? fallbackRanked.length : ranked.length,
        timestamp: new Date().toISOString(),
        source: matchSource,
      };
      latestMatchMetadata = matchMetadata;

      const resolvedDetails = await this.resolveEligiblePlaceDetails({
        details,
        fallbackPlaceId: best.entry.candidate.placeId,
        query: searchContext.query ?? '',
        candidate: best.entry.candidate,
        matchMetadata,
      });
      if (!resolvedDetails.details?.place) {
        const noMatchMetadata = this.buildNoMatchMetadata(
          ranked,
          searchContext,
          fallbackAttempted
            ? {
                fallbackAttempted: true,
                fallbackStatus,
                fallbackUsed: matchSource === 'find_place',
                searchTextCandidates:
                  this.serializeRankedCandidates(fallbackRanked),
                candidateSelectionStrategy: selection.strategy,
                adjudicationTrail: selection.adjudicationTrail,
              }
            : {
                candidateSelectionStrategy: selection.strategy,
                adjudicationTrail: selection.adjudicationTrail,
              },
        );
        await this.recordNoMatchCandidates(
          entity,
          resolvedDetails.rejectionReason ?? 'place details missing',
          noMatchMetadata,
        );
        return {
          entityId: entity.entityId,
          status: 'no_match',
          reason: resolvedDetails.rejectionReason ?? 'place details missing',
        };
      }
      latestDetails = resolvedDetails.details;

      // THE REDIRECT WAS COMPUTED AND THEN THROWN AWAY (red team 2026-08-02).
      // resolveEligiblePlaceDetails follows Google's moved-place redirect and
      // re-fetches the NEW place; this line used `placeDetails`, which is
      // `details.place` from before that call — the CLOSED place. Every
      // downstream write consumed it, so a moved restaurant was grounded on
      // the dead place id while its matchMetadata claimed the redirect had
      // been followed. The sibling caller (resolvePlaceForInput) already
      // returns `resolvedDetails.details.place` correctly; only this path
      // diverged.
      const resolvedPlaceDetails = resolvedDetails.details.place;
      const resolvedMatchMetadata = matchMetadata;

      const { updateData, updatedFields } = this.buildEntityUpdate(
        entity,
        resolvedPlaceDetails,
        details.metadata.fieldMask,
        resolvedMatchMetadata,
      );
      const {
        updateData: aliasUpdate,
        updatedFields: aliasFields,
        aliasForms: pendingAliasForms,
      } = this.computeNameAndAliasUpdate(
        entity,
        this.getPlaceDisplayName(resolvedPlaceDetails),
        [],
        this.getPlaceDisplayLocale(resolvedPlaceDetails),
      );
      pendingPlacesAliases = {
        entityId: entity.entityId,
        forms: pendingAliasForms,
      };
      combinedUpdateData = this.mergeEntityUpdates(updateData, aliasUpdate);
      combinedUpdatedFields = this.mergeUpdatedFieldLists(
        updatedFields,
        aliasFields,
      );
      targetNameForUpdate = this.extractTargetNameFromUpdate(
        combinedUpdateData,
        this.getPlaceDisplayName(resolvedPlaceDetails),
      );
      const targetLocation =
        entity.locations?.find(
          (location) => location.googlePlaceId === resolvedPlaceDetails.id,
        ) ??
        entity.primaryLocation ??
        null;
      const locationUpsert = this.buildLocationUpsertData(
        entity.entityId,
        targetLocation,
        resolvedPlaceDetails,
      );

      if (options.dryRun) {
        this.logger.info('Dry-run enrichment preview', {
          entityId: entity.entityId,
          placeId: resolvedPlaceDetails.id,
          updatedFields: combinedUpdatedFields,
        });
        return {
          entityId: entity.entityId,
          status: 'skipped',
          reason: 'dry_run',
          placeId: resolvedPlaceDetails.id,
          score: enrichmentScore,
          updatedFields: combinedUpdatedFields,
        };
      }

      const googleAttributeDefinitions =
        this.extractGoogleRestaurantAttributeDefinitions(resolvedPlaceDetails);
      googleRestaurantAttributeIds =
        await this.resolveRestaurantAttributeIdsForDefinitions(
          googleAttributeDefinitions,
        );
      const placeTypeAttributes =
        this.mapPlaceTypesToRestaurantAttributeNames(resolvedPlaceDetails);
      const placeTypeAttributeIds =
        await this.resolveRestaurantAttributeIdsForNames(placeTypeAttributes);
      googleRestaurantAttributeIds = this.unionStringArrays(
        googleRestaurantAttributeIds,
        placeTypeAttributeIds,
      );
      const mergedRestaurantAttributes = this.unionStringArrays(
        entity.restaurantAttributes,
        googleRestaurantAttributeIds,
      );
      if (
        !this.setsEqual(
          new Set(entity.restaurantAttributes),
          new Set(mergedRestaurantAttributes),
        )
      ) {
        combinedUpdateData.restaurantAttributes = mergedRestaurantAttributes;
        combinedUpdatedFields = this.mergeUpdatedFieldLists(
          combinedUpdatedFields,
          ['restaurantAttributes'],
        );
      }
      // Phase 4b: Google's claims stated in the rebuildable substrate, so
      // the derived array can be rebuilt without losing them (they have no
      // source document and cannot live in the event ledger).
      await this.recordAttributeEvidence(
        entity.entityId,
        googleRestaurantAttributeIds,
        'places_api',
      );

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const location = await this.upsertPrimaryLocation({
              tx,
              restaurantId: entity.entityId,
              placeDetails,
              locationUpsert,
              targetLocation,
            });

            await tx.restaurantLocation.updateMany({
              where: {
                restaurantId: entity.entityId,
                locationId: { not: location.locationId },
              },
              data: { isPrimary: false },
            });

            await tx.entity.update({
              where: { entityId: entity.entityId },
              data: {
                ...combinedUpdateData,
                primaryLocation: {
                  connect: { locationId: location.locationId },
                },
              },
            });
          },
          {
            timeout: this.transactionTimeoutMs,
            maxWait: this.transactionMaxWaitMs,
          },
        );
      } catch (error) {
        if (this.isGooglePlaceConflict(error)) {
          return this.handleGooglePlaceCollision({
            entity,
            details,
            matchMetadata,
            score: best.score,
            googleRestaurantAttributeIds,
          });
        }
        if (this.isEntityNameConflict(error) && combinedUpdateData) {
          return this.handleEntityNameConflict({
            entity,
            canonicalName: targetNameForUpdate,
            details,
            matchMetadata,
            score: best.score,
            googleRestaurantAttributeIds,
          });
        }
        throw error;
      }

      // A1: the alias half of the entity update lands here, through THE
      // projection writer, once the row itself is committed (the name and
      // identity keys had to move inside that transaction; the array is a
      // derived index input and follows).
      if (pendingPlacesAliases) {
        await this.bankPlacesAliases(
          pendingPlacesAliases.entityId,
          pendingPlacesAliases.forms,
        );
      }

      this.logger.info('Restaurant enriched with Google Places', {
        entityId: entity.entityId,
        placeId: placeDetails.id,
        score: best.score,
        updatedFields: combinedUpdatedFields,
      });

      const trustedCanonicalDomain =
        this.normalizeWebsiteDomain(placeDetails.websiteUri) ??
        this.normalizeWebsiteDomain(combinedUpdateData.canonicalDomain) ??
        this.normalizeWebsiteDomain(entity.canonicalDomain);
      const entityForSecondary: RestaurantEntity = {
        ...entity,
        canonicalDomain: trustedCanonicalDomain ?? entity.canonicalDomain,
      };

      const domainMerge = await this.mergeIntoCanonicalDomainEntityIfNeeded({
        entity: entityForSecondary,
        placeDetails,
        details,
        matchMetadata,
        score: best.score,
        googleRestaurantAttributeIds,
      });

      const enrichmentTarget =
        domainMerge?.canonicalEntity ?? entityForSecondary;
      const secondaryLocationTarget: RestaurantEntity = {
        ...enrichmentTarget,
        canonicalDomain:
          trustedCanonicalDomain ?? enrichmentTarget.canonicalDomain,
      };

      await this.secondaryLocationExpansionQueue.queueExpansion(
        secondaryLocationTarget.entityId,
        placeDetails.id,
        {
          source: domainMerge
            ? 'google_places_domain_merge'
            : 'google_places_enrichment',
        },
      );

      const cuisineTargetId =
        domainMerge?.mergedInto ?? entityForSecondary.entityId;
      await this.cuisineExtractionQueue.queueExtraction(cuisineTargetId, {
        source: domainMerge
          ? 'google_places_domain_merge'
          : 'google_places_enrichment',
      });

      if (domainMerge) {
        return {
          entityId: entity.entityId,
          mergedInto: domainMerge.mergedInto,
          status: 'updated',
          placeId: placeDetails.id,
          score: best.score,
          updatedFields: this.mergeUpdatedFieldLists(
            combinedUpdatedFields,
            domainMerge.updatedFields,
          ),
        };
      }
      return {
        entityId: entity.entityId,
        status: 'updated',
        placeId: placeDetails.id,
        score: best.score,
        updatedFields: combinedUpdatedFields,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A 429, a socket timeout and a closed budget are not evidence that this
      // restaurant does not exist — and three of them used to archive it
      // permanently. classifyEnrichmentError decides whether this attempt
      // spends a strike.
      const verdict = classifyEnrichmentError(error);
      this.logger.error('Failed to enrich restaurant', {
        entityId: entity.entityId,
        error: message,
        failureClass: verdict.failureClass,
        failureReasonCode: verdict.failureReasonCode,
      });

      await this.recordEnrichmentFailure(
        entity,
        message,
        {
          placeId: latestDetails?.place?.id,
          targetName: targetNameForUpdate ?? undefined,
          score: enrichmentScore || undefined,
          matchMetadata: latestMatchMetadata ?? undefined,
        },
        verdict,
      );

      return {
        entityId: entity.entityId,
        status: 'error',
        reason: message,
      };
    }
  }

  private mergeEntityUpdates(
    ...updates: Prisma.EntityUpdateInput[]
  ): Prisma.EntityUpdateInput {
    return updates.reduce<Prisma.EntityUpdateInput>((acc, update) => {
      Object.entries(update).forEach(([key, value]) => {
        if (value !== undefined) {
          (acc as Record<string, unknown>)[key] = value;
        }
      });
      return acc;
    }, {});
  }

  private mergeUpdatedFieldLists(
    ...lists: Array<string[] | undefined>
  ): string[] {
    const merged = new Set<string>();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const field of list) {
        if (field) merged.add(field);
      }
    }
    return Array.from(merged);
  }

  private getOwnedPlaceId(
    entity: RestaurantEntityWithLocations,
  ): string | null {
    const primaryPlaceId = entity.primaryLocation?.googlePlaceId?.trim();
    if (primaryPlaceId) {
      return primaryPlaceId;
    }

    const locationPlaceId = (entity.locations ?? [])
      .map((location) => location.googlePlaceId?.trim())
      .find((value): value is string => Boolean(value));
    if (locationPlaceId) {
      return locationPlaceId;
    }

    return null;
  }

  /**
   * A1: this writes no alias column. It returns the surface FORMS it learned;
   * the caller banks them through the surface writer (`bankPlacesAliases`)
   * after the entity write lands. The name/identity half is unchanged — that
   * IS an entity-column update.
   *
   * A4 free gift: `canonicalLocale` is Google's
   * `displayName.languageCode`, which we used to discard. The localized
   * display name lands as a TAGGED ALIAS ROW and NEVER overwrites `name`
   * beyond what this function already did — the language tag costs
   * nothing and is the only trustworthy tag we get for free.
   */
  private computeNameAndAliasUpdate(
    entity: RestaurantEntity,
    canonicalName?: string | null,
    extraAliases: string[] = [],
    canonicalLocale?: string | null,
  ): {
    updateData: Prisma.EntityUpdateInput;
    updatedFields: string[];
    aliasForms: SurfaceInput[];
  } {
    const updateData: Prisma.EntityUpdateInput = {};
    const updatedFields: string[] = [];
    const canonicalTrimmed =
      typeof canonicalName === 'string' ? canonicalName.trim() : null;
    const currentTrimmed =
      typeof entity.name === 'string' ? entity.name.trim() : null;

    const aliasSources = new Set<string>();
    if (canonicalTrimmed?.length) {
      aliasSources.add(canonicalTrimmed);
    }

    for (const alias of extraAliases) {
      const normalizedAlias = this.normalizeName(alias);
      if (normalizedAlias) {
        aliasSources.add(alias.trim());
      }
    }

    if (
      canonicalTrimmed &&
      currentTrimmed &&
      canonicalTrimmed !== currentTrimmed
    ) {
      updateData.name = canonicalTrimmed;
      // IDENTITY FOLLOWS THE NAME (round-4 foundations audit: this rename
      // path had the same drift the ontology rename had — name changed,
      // app-written identity keys kept the OLD string, on ~7k
      // never-deleted restaurant rows).
      const identity = identityInsertData(
        canonicalTrimmed,
        EntityType.restaurant,
      );
      updateData.identityKey = identity.identityKey;
      updateData.identityKeySorted = identity.identityKeySorted;
      updatedFields.push('name');
      aliasSources.add(entity.name);
    }

    // The entity's ALREADY-BANKED surfaces are deliberately absent from this
    // merge. They used to be read out of core_entities.aliases[] and written
    // straight back, which was a no-op dressed as a merge: addSurfaces is
    // idempotent per (entity, locale, form), so re-offering a form that is
    // already a row changes nothing. What matters is the NEW forms this
    // enrichment learned, and those are exactly `aliasSources`.
    const aliasResult = this.aliasManagementService.mergeAliases(
      [],
      [],
      Array.from(aliasSources),
    );

    let mergedAliases = [...aliasResult.mergedAliases];

    if (canonicalTrimmed) {
      mergedAliases = this.ensureAliasPresence(
        mergedAliases,
        canonicalTrimmed,
        'front',
      );
    }

    // Only Google's own display name carries Google's language tag; every
    // other form here is a pre-existing untagged surface or a merged
    // duplicate's name, and inventing a tag for those would poison both
    // languages' retrieval with no rollback.
    //
    // LANGUAGE ONLY, NEVER A REGION (A0 R4): Google answers `zh-TW` and
    // `pt-BR`, and a row banked under a regioned tag is reachable only by a
    // caller with the same region — the chain built from `zh` never reaches
    // `zh-tw`, so the one trustworthy free tag we get was hiding the surface
    // it described. bankableLanguageTag is the shared normalize-then-base.
    const locale = bankableLanguageTag(canonicalLocale);
    const aliasForms: SurfaceInput[] = mergedAliases.map((form) => ({
      form,
      source: 'places' as const,
      ...(locale && canonicalTrimmed && form === canonicalTrimmed
        ? { locale }
        : {}),
    }));

    return { updateData, updatedFields, aliasForms };
  }

  /** THE ONLY alias write in this service — every Places-derived surface
   *  goes through the surface writer. */
  private async bankPlacesAliases(
    entityId: string,
    aliasForms: SurfaceInput[],
  ): Promise<void> {
    if (!aliasForms.length) {
      return;
    }
    await this.prisma.$transaction((tx) =>
      addSurfaces(tx, entityId, aliasForms),
    );
  }

  /** A4: Google returns displayName.languageCode and we discarded it. */
  private getPlaceDisplayLocale(
    place: GooglePlacesV1Place | null | undefined,
  ): string | null {
    const code = place?.displayName?.languageCode;
    return typeof code === 'string' && code.trim().length > 0
      ? code.trim()
      : null;
  }

  private normalizeName(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed.toLowerCase() : null;
  }

  // normalizeBrandName / restaurantNamesAgree moved to
  // business-identity-rules.ts — ONE home for the brand doctrine, shared
  // with the same-name sweep's SQL and JS lanes (2026-08-11 audit change #2).

  private ensureAliasPresence(
    aliases: string[],
    value: string,
    position: 'front' | 'back' = 'back',
  ): string[] {
    const trimmedValue = value.trim();
    if (!trimmedValue.length) {
      return aliases;
    }

    const lowerValue = trimmedValue.toLowerCase();
    const filtered = aliases.filter(
      (alias) => alias.trim().toLowerCase() !== lowerValue,
    );

    if (position === 'front') {
      return [trimmedValue, ...filtered];
    }

    return [...filtered, trimmedValue];
  }

  /** The entity's own current name, as a surface candidate for a rename.
   *  It used to also re-collect every banked alias out of
   *  core_entities.aliases[]; those are rows already, and re-offering them
   *  through the idempotent surface writer only ever produced no-ops. */
  private collectAliasCandidates(entity: RestaurantEntity): string[] {
    const aliases = new Set<string>();
    if (entity.name?.trim()) {
      aliases.add(entity.name.trim());
    }
    return Array.from(aliases);
  }

  private isGooglePlaceConflict(error: unknown): boolean {
    if (!(error instanceof PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }
    const target = Array.isArray(error.meta?.target)
      ? (error.meta?.target as string[])
      : [];
    return target.some((value) =>
      value.toLowerCase().includes('google_place_id'),
    );
  }

  private isEntityNameConflict(error: unknown): boolean {
    if (!(error instanceof PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }
    const metaTarget = error.meta?.target;
    const targets: string[] = Array.isArray(metaTarget)
      ? (metaTarget as string[])
      : typeof metaTarget === 'string'
        ? [metaTarget]
        : [];
    const normalizedTargets = targets.map((value) => value.toLowerCase());
    return (
      normalizedTargets.includes('name') && normalizedTargets.includes('type')
    );
  }

  private async handleGooglePlaceCollision(params: {
    entity: RestaurantEntity;
    details: GooglePlacesV1PlaceDetailsResponse;
    matchMetadata: MatchMetadata;
    score?: number;
    googleRestaurantAttributeIds?: string[];
  }): Promise<RestaurantEnrichmentResult> {
    const {
      entity,
      details,
      matchMetadata,
      score,
      googleRestaurantAttributeIds,
    } = params;
    const placeId = details.place?.id;

    if (!placeId) {
      throw new Error('Google Place details missing id');
    }

    const canonicalLocation = await this.prisma.restaurantLocation.findUnique({
      where: { googlePlaceId: placeId },
    });

    if (!canonicalLocation) {
      this.logger.error(
        'Google Place ID conflict encountered but canonical location missing',
        {
          entityId: entity.entityId,
          placeId,
        },
      );
      throw new Error('Canonical location not found for Google Place ID');
    }

    const canonical = await this.prisma.entity.findUnique({
      where: { entityId: canonicalLocation.restaurantId },
      include: { primaryLocation: true, locations: true },
    });

    // SELF-MERGE GUARD (round-11 fuzz D1): if the colliding place id is
    // held by another location row of the SAME entity, this is not a
    // duplicate pair — merging an entity into itself annihilated the
    // ledger before the re-key guards existed. Refuse here too.
    if (canonical && canonical.entityId === entity.entityId) {
      this.logger.warn('Place-id collision resolves to self — skipping merge', {
        entityId: entity.entityId,
        placeId,
      });
      return { entityId: entity.entityId, status: 'skipped', reason: 'self' };
    }

    if (!canonical) {
      this.logger.error(
        'Google Place ID conflict encountered but canonical entity missing',
        {
          entityId: entity.entityId,
          placeId,
        },
      );
      throw new Error('Canonical entity not found for Google Place ID');
    }

    const placeDetails = details.place;

    const canonicalUpdate = this.buildEntityUpdate(
      canonical,
      placeDetails,
      details.metadata?.fieldMask ?? '',
      matchMetadata,
    );
    const locationUpsert = this.buildLocationUpsertData(
      canonical.entityId,
      canonicalLocation,
      placeDetails,
    );

    const canonicalAliasUpdate = this.computeNameAndAliasUpdate(
      canonical,
      this.getPlaceDisplayName(placeDetails),
      this.collectAliasCandidates(entity),
      this.getPlaceDisplayLocale(placeDetails),
    );

    const mergeAugmentations = this.buildCanonicalMergeAugmentations(
      canonical,
      entity,
      googleRestaurantAttributeIds,
    );

    const mergedUpdate = this.mergeEntityUpdates(
      canonicalUpdate.updateData,
      canonicalAliasUpdate.updateData,
      mergeAugmentations.updateData,
    );
    const mergedFields = this.mergeUpdatedFieldLists(
      canonicalUpdate.updatedFields,
      canonicalAliasUpdate.updatedFields,
      mergeAugmentations.updatedFields,
    );

    // The merge service owns the transaction and the post-commit rebuild
    // (F9966); the location re-point rides its `prepare` hook so it stays
    // atomic with the merge.
    const updatedCanonical =
      await this.restaurantEntityMergeService.mergeDuplicateRestaurant({
        canonical,
        duplicate: entity,
        canonicalUpdate: mergedUpdate,
        prepare: async (tx) => {
          const location = await tx.restaurantLocation.update({
            where: { locationId: canonicalLocation.locationId },
            data: {
              ...locationUpsert.update,
              restaurantId: canonical.entityId,
              isPrimary: true,
              updatedAt: new Date(),
            } as Prisma.RestaurantLocationUncheckedUpdateInput,
          });
          return {
            primaryLocation: { connect: { locationId: location.locationId } },
          };
        },
      });

    // §12.6: a merge moved evidence — mark the rescorer dirty (the old
    // market-key bookkeeping around this is dead; §13 presence is geometric).
    await this.rescoreCoordinator.markDirty('location-enrichment');

    // A1: alias forms bank through THE projection writer, after the
    // merge has committed the canonical row.
    await this.bankPlacesAliases(
      updatedCanonical.entityId,
      canonicalAliasUpdate.aliasForms,
    );
    this.logger.info('Merged restaurant into canonical entity', {
      duplicateId: entity.entityId,
      canonicalId: updatedCanonical.entityId,
      placeId,
      updatedFields: mergedFields,
    });

    const mergedInto = updatedCanonical.entityId;
    await this.cuisineExtractionQueue.queueExtraction(mergedInto, {
      source: 'google_places_collision',
    });

    return {
      entityId: entity.entityId,
      mergedInto,
      status: 'updated',
      placeId,
      score,
      updatedFields: mergedFields,
    };
  }

  private async handleEntityNameConflict(params: {
    entity: RestaurantEntity;
    canonicalName: string | null;
    details: GooglePlacesV1PlaceDetailsResponse;
    matchMetadata: MatchMetadata;
    score?: number;
    googleRestaurantAttributeIds?: string[];
  }): Promise<RestaurantEnrichmentResult> {
    const {
      entity,
      canonicalName,
      details,
      matchMetadata,
      score,
      googleRestaurantAttributeIds,
    } = params;

    const resolvedName = canonicalName?.trim().length
      ? canonicalName.trim()
      : null;

    if (!details.place) {
      throw new Error('Google Place details missing for name conflict');
    }

    const placeDetails = details.place;
    const trustedCanonicalDomain =
      this.normalizeWebsiteDomain(placeDetails.websiteUri) ??
      this.normalizeWebsiteDomain(entity.canonicalDomain);
    const canonical: RestaurantEntityWithLocations | null =
      trustedCanonicalDomain
        ? await this.prisma.entity.findFirst({
            where: {
              entityId: { not: entity.entityId },
              type: EntityType.restaurant,
              canonicalDomain: {
                equals: trustedCanonicalDomain,
                mode: 'insensitive',
              },
            },
            include: { primaryLocation: true, locations: true },
          })
        : await this.prisma.entity.findFirst({
            where: {
              entityId: { not: entity.entityId },
              type: EntityType.restaurant,
              // §13: identity is GLOBAL — name conflict is judged globally,
              // never through a market-presence lane.
              name:
                resolvedName ??
                this.getPlaceDisplayName(placeDetails) ??
                undefined,
            },
            include: { primaryLocation: true, locations: true },
          });

    if (!canonical) {
      this.logger.error(
        'Name conflict encountered but canonical restaurant missing',
        {
          entityId: entity.entityId,
          canonicalDomain: trustedCanonicalDomain,
          targetName: resolvedName ?? this.getPlaceDisplayName(placeDetails),
        },
      );
      throw new Error('Canonical restaurant not found for name conflict');
    }

    const canonicalUpdate = this.buildEntityUpdate(
      canonical,
      placeDetails,
      details.metadata?.fieldMask ?? '',
      matchMetadata,
    );
    const canonicalLocations = canonical.locations ?? [];
    const targetLocation =
      canonicalLocations.find(
        (location) => location.googlePlaceId === placeDetails.id,
      ) ??
      canonical.primaryLocation ??
      null;
    const locationUpsert = this.buildLocationUpsertData(
      canonical.entityId,
      targetLocation,
      placeDetails,
    );
    const canonicalAliasUpdate = this.computeNameAndAliasUpdate(
      canonical,
      this.getPlaceDisplayName(placeDetails),
      this.collectAliasCandidates(entity),
      this.getPlaceDisplayLocale(placeDetails),
    );
    const mergeAugmentations = this.buildCanonicalMergeAugmentations(
      canonical,
      entity,
      googleRestaurantAttributeIds,
    );

    const mergedUpdate = this.mergeEntityUpdates(
      canonicalUpdate.updateData,
      canonicalAliasUpdate.updateData,
      mergeAugmentations.updateData,
    );
    const mergedFields = this.mergeUpdatedFieldLists(
      canonicalUpdate.updatedFields,
      canonicalAliasUpdate.updatedFields,
      mergeAugmentations.updatedFields,
    );

    // The merge service owns the transaction and the post-commit rebuild
    // (F9966); the primary-location upsert rides its `prepare` hook.
    const updatedCanonical =
      await this.restaurantEntityMergeService.mergeDuplicateRestaurant({
        canonical,
        duplicate: entity,
        canonicalUpdate: mergedUpdate,
        prepare: async (tx) => {
          const location = await this.upsertPrimaryLocation({
            tx,
            restaurantId: canonical.entityId,
            placeDetails,
            locationUpsert,
            targetLocation,
          });
          return {
            primaryLocation: { connect: { locationId: location.locationId } },
          };
        },
      });

    await this.rescoreCoordinator.markDirty('location-enrichment');

    // A1: alias forms bank through THE projection writer, after the
    // merge has committed the canonical row.
    await this.bankPlacesAliases(
      updatedCanonical.entityId,
      canonicalAliasUpdate.aliasForms,
    );
    this.logger.info('Merged restaurant into existing canonical by name', {
      duplicateId: entity.entityId,
      canonicalId: updatedCanonical.entityId,
      targetName: resolvedName ?? this.getPlaceDisplayName(placeDetails),
    });

    const mergedInto = updatedCanonical.entityId;
    await this.cuisineExtractionQueue.queueExtraction(mergedInto, {
      source: 'google_places_name_collision',
    });

    return {
      entityId: entity.entityId,
      mergedInto,
      status: 'updated',
      placeId: placeDetails?.id,
      score,
      updatedFields: mergedFields,
    };
  }

  private buildCanonicalMergeAugmentations(
    canonical: RestaurantEntity,
    duplicate: RestaurantEntity,
    additionalRestaurantAttributes?: string[],
  ): {
    updateData: Prisma.EntityUpdateInput;
    updatedFields: string[];
  } {
    const updateData: Prisma.EntityUpdateInput = {};
    const updatedFields: string[] = [];
    const mergedAttributes = this.unionStringArrays(
      canonical.restaurantAttributes,
      duplicate.restaurantAttributes,
      additionalRestaurantAttributes,
    );

    if (
      !this.setsEqual(
        new Set(canonical.restaurantAttributes),
        new Set(mergedAttributes),
      )
    ) {
      updateData.restaurantAttributes = mergedAttributes;
      updatedFields.push('restaurantAttributes');
    }

    const canonicalDomain =
      typeof canonical.canonicalDomain === 'string' &&
      canonical.canonicalDomain.trim().length
        ? canonical.canonicalDomain.trim().toLowerCase()
        : typeof duplicate.canonicalDomain === 'string' &&
            duplicate.canonicalDomain.trim().length
          ? duplicate.canonicalDomain.trim().toLowerCase()
          : null;
    if (canonicalDomain && canonicalDomain !== canonical.canonicalDomain) {
      updateData.canonicalDomain = canonicalDomain;
      updatedFields.push('canonicalDomain');
    }

    updateData.lastUpdated = new Date();

    return { updateData, updatedFields };
  }

  private async mergeIntoCanonicalDomainEntityIfNeeded(params: {
    entity: RestaurantEntity;
    placeDetails: GooglePlacesV1Place;
    details: GooglePlacesV1PlaceDetailsResponse;
    matchMetadata: MatchMetadata;
    score?: number;
    googleRestaurantAttributeIds?: string[];
  }): Promise<{
    mergedInto: string;
    canonicalEntity: RestaurantEntityWithLocations;
    updatedFields: string[];
  } | null> {
    const canonicalDomain =
      this.normalizeWebsiteDomain(params.placeDetails.websiteUri) ??
      this.normalizeWebsiteDomain(params.entity.canonicalDomain);
    if (!canonicalDomain) {
      return null;
    }

    const candidates = await this.prisma.entity.findMany({
      where: {
        type: EntityType.restaurant,
        canonicalDomain,
        entityId: { not: params.entity.entityId },
      },
      include: { primaryLocation: true, locations: true },
      orderBy: [{ createdAt: 'asc' }, { entityId: 'asc' }],
      take: 50,
    });

    if (!candidates.length) {
      return null;
    }

    // BRAND-PURITY GATE (list-free): a domain is trusted as a chain key only when ALL
    // restaurants sharing it — including the incoming one — form a single brand cluster.
    // Real chains are brand-pure (every "7-Eleven" is named 7-Eleven, branches may add
    // suffixes); generic hosts (facebook.com, doordash.com, ...) accumulate many distinct
    // brands and therefore self-evidently carry no ownership signal — so they never merge,
    // even when two names coincide. Purity = every member agrees with the cluster's brand
    // root (the shortest brand name, so branch suffixes don't break a real chain).
    const incomingName =
      this.getPlaceDisplayName(params.placeDetails) ?? params.entity.name;
    const memberNames = [incomingName, ...candidates.map((c) => c.name)];
    // ONE brand-purity rule (business-identity-rules.ts), shared with the
    // sweep's judgment.
    const { pure: brandPure } = brandClusterPurity(memberNames);

    if (!brandPure) {
      this.logger.info(
        'Skipping canonical-domain merge: domain is not brand-pure',
        {
          canonicalDomain,
          incomingName,
          incomingEntityId: params.entity.entityId,
          sameDomainCandidates: candidates.length,
        },
      );
      return null;
    }

    const canonical = candidates[0];

    const canonicalUpdate = this.buildEntityUpdate(
      canonical,
      params.placeDetails,
      params.details.metadata?.fieldMask ?? '',
      params.matchMetadata,
    );
    const canonicalAliasUpdate = this.computeNameAndAliasUpdate(
      canonical,
      this.getPlaceDisplayName(params.placeDetails),
      this.collectAliasCandidates(params.entity),
      this.getPlaceDisplayLocale(params.placeDetails),
    );
    const mergeAugmentations = this.buildCanonicalMergeAugmentations(
      canonical,
      params.entity,
      params.googleRestaurantAttributeIds,
    );
    const mergedUpdate = this.mergeEntityUpdates(
      canonicalUpdate.updateData,
      canonicalAliasUpdate.updateData,
      mergeAugmentations.updateData,
      { canonicalDomain },
    );
    const mergedFields = this.mergeUpdatedFieldLists(
      canonicalUpdate.updatedFields,
      canonicalAliasUpdate.updatedFields,
      mergeAugmentations.updatedFields,
      ['canonicalDomain'],
    );

    const mergedCanonical =
      await this.restaurantEntityMergeService.mergeDuplicateRestaurant({
        canonical,
        duplicate: params.entity,
        canonicalUpdate: mergedUpdate,
      });

    const refreshedCanonical = await this.prisma.entity.findUnique({
      where: { entityId: mergedCanonical.entityId },
      include: { primaryLocation: true, locations: true },
    });

    if (!refreshedCanonical) {
      throw new Error('Merged canonical entity not found after domain merge');
    }

    // A1: alias forms bank through THE projection writer, after the
    // merge has committed the canonical row.
    await this.bankPlacesAliases(
      refreshedCanonical.entityId,
      canonicalAliasUpdate.aliasForms,
    );
    this.logger.info('Merged restaurant into canonical entity by domain', {
      duplicateId: params.entity.entityId,
      canonicalId: refreshedCanonical.entityId,
      canonicalDomain,
      score: params.score,
    });

    await this.rescoreCoordinator.markDirty('location-enrichment');

    return {
      mergedInto: refreshedCanonical.entityId,
      canonicalEntity: refreshedCanonical,
      updatedFields: mergedFields,
    };
  }

  private setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) {
      return false;
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }
    return true;
  }

  private unionStringArrays(
    ...arrays: Array<string[] | null | undefined>
  ): string[] {
    const merged = new Set<string>();
    for (const list of arrays) {
      if (!Array.isArray(list)) continue;
      for (const value of list) {
        if (value && value.length) {
          merged.add(value);
        }
      }
    }
    return Array.from(merged);
  }

  private normalizeCountryCodeForStorage(
    country?: string | null,
  ): string | undefined {
    if (!country) {
      return undefined;
    }
    const trimmed = country.trim();
    return trimmed ? trimmed.toUpperCase() : undefined;
  }

  private resolvePrimaryPhoneNumber(
    details: GooglePlacesV1Place,
  ): string | null {
    const raw =
      typeof details.nationalPhoneNumber === 'string'
        ? details.nationalPhoneNumber
        : typeof details.internationalPhoneNumber === 'string'
          ? details.internationalPhoneNumber
          : null;
    if (!raw) {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
  }

  private normalizeWebsiteUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }

    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname?.trim()) {
        return null;
      }
      return parsed.toString();
    } catch {
      try {
        const parsed = new URL(`https://${trimmed}`);
        if (!parsed.hostname?.trim()) {
          return null;
        }
        return parsed.toString();
      } catch {
        return null;
      }
    }
  }

  /** THE domain normalizer — shared so every identity decision (enrichment
   *  conflict resolution, the duplicate sweep, poll-path location adoption)
   *  compares domains the same way. */
  /**
   * Phase 4b: state this source's attribute claims in the rebuildable
   * substrate. Non-reddit sources (Google place types, the cuisine LLM)
   * have no source document or extraction run, so they cannot write
   * core_restaurant_entity_events — this is where their evidence lives.
   * Upsert-by-(restaurant, attribute, sourceClass): a source restating a
   * claim refreshes it rather than accumulating duplicates.
   */
  async recordAttributeEvidence(
    restaurantId: string,
    attributeIds: string[],
    sourceClass: string,
  ): Promise<void> {
    const ids = Array.from(new Set(attributeIds.filter(Boolean)));
    if (!restaurantId || !ids.length) return;
    try {
      await this.prisma.restaurantAttributeEvidence.createMany({
        data: ids.map((attributeId) => ({
          restaurantId,
          attributeId,
          sourceClass,
          observations: 1,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      // Evidence recording must never fail the enrichment it accompanies.
      this.logger.warn('Attribute evidence write failed', {
        operation: 'attribute_evidence_write',
        restaurantId,
        sourceClass,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  normalizeWebsiteDomain(value: unknown): string | null {
    const normalizedUrl = this.normalizeWebsiteUrl(value);
    if (!normalizedUrl) {
      return null;
    }

    const parsed = parseDomain(normalizedUrl, { allowPrivateDomains: true });
    const domain =
      typeof parsed.domain === 'string'
        ? parsed.domain.trim().toLowerCase()
        : '';
    if (!domain.length) {
      return null;
    }

    return domain.startsWith('www.') ? domain.slice(4) : domain;
  }

  /** The highest-upvote mention body for this restaurant — the community's
   *  own words, fed to the place chooser as source text when the caller has
   *  none. Returns null for entities with no usable mention (new entities in
   *  the live lane usually DO have one: their minting mention just wrote). */
  private async deriveSourceSnippet(entityId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ snippet: string }>>`
      SELECT left(regexp_replace(coalesce(d.body, ''), E'[\n\r]+', ' ', 'g'), 400) AS snippet
        FROM core_restaurant_entity_events e
        JOIN collection_source_documents d ON d.document_id = e.source_document_id
       WHERE e.restaurant_id = ${entityId}::uuid
         AND length(coalesce(d.body, '')) > 20
       ORDER BY e.source_upvotes DESC, length(d.body) DESC
       LIMIT 1`;
    return rows[0]?.snippet ?? null;
  }

  private buildSearchContext(
    entity: RestaurantEntity,
    options: RestaurantEnrichmentOptions,
  ): EnrichmentSearchContext {
    const sourceLocale = this.normalizeSourceLocale(options.sourceLocale);
    const query = options.query?.trim() || entity.name?.trim() || '';
    return {
      query: query.trim().length ? query : null,
      sourceText: options.sourceText?.trim() || undefined,
      city: sourceLocale.city ?? undefined,
      region: sourceLocale.region ?? undefined,
      countryCode: this.normalizeCountryCode(options.countryCode) ?? undefined,
      locationBias: options.locationBias,
    };
  }

  private normalizeSourceLocale(
    sourceLocale?: {
      city?: string | null;
      region?: string | null;
    } | null,
  ): {
    city?: string;
    region?: string;
  } {
    const city = sourceLocale?.city?.trim();
    const region = sourceLocale?.region?.trim();

    return {
      city: city || undefined,
      region: region || undefined,
    };
  }

  private normalizeCountryCode(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toUpperCase();
    return normalized.length ? normalized : null;
  }

  /**
   * F354, owner-ruled 2026-08-03 — THIS METHOD DELIBERATELY THROWS.
   *
   * It used to wrap its whole paginated body in one catch that logged a warn
   * and returned void. Because it could never throw, the driving queue's
   * `attempts: 3` was unreachable: a fault after page 1 left the brand
   * holding a PARTIAL branch set, the job was marked done, and nothing
   * anywhere recorded that the set was partial. The failure and the success
   * were the same observable — and the truncated location set is precisely
   * what the metro/chain analysis downstream reasons over.
   *
   * Not crashing and not telling anyone are different decisions; only the
   * first was ever made. So the loop throws and the queue retries, which is
   * the behaviour the queue's author already chose for the primary lane.
   *
   * A RETRY RESUMES RATHER THAN REPEATS — verified, not assumed:
   *   - `expandSecondaryLocationsForRestaurant` (the ONLY caller) re-reads the
   *     entity with `include: { locations: true }` on every attempt, so
   *     `seenPlaceIds` below is rebuilt from the rows PERSISTED by the
   *     previous attempt, not carried in memory;
   *   - each branch is written by `upsert({ where: { googlePlaceId } })`, a
   *     unique key, so re-processing a place updates rather than duplicates;
   *   - the writes are per-place transactions, so a mid-run throw keeps every
   *     page already committed.
   * A retry therefore re-walks the same result pages cheaply and skips
   * straight past what landed. Spend stays bounded by the existing per-op
   * ceilings and the 60-result cap below — retries buy no new authority.
   */
  private async enrichSecondaryLocations(
    entity: RestaurantEntity,
    placeDetails: GooglePlacesV1Place,
    locationBias?: { lat: number; lng: number; radiusMeters?: number },
  ): Promise<void> {
    const canonicalDomain =
      this.normalizeWebsiteDomain(placeDetails.websiteUri) ??
      this.normalizeWebsiteDomain(entity.canonicalDomain);
    if (!canonicalDomain) {
      return;
    }

    const canonicalName =
      this.getPlaceDisplayName(placeDetails) ?? entity.name ?? null;
    if (!canonicalName) {
      return;
    }

    const includedType = this.resolveIncludedType(placeDetails.primaryType);
    const existingLocations = entity.locations ?? [];
    const locationsByPlaceId = new Map(
      existingLocations
        .filter((location) => location.googlePlaceId)
        .map((location) => [location.googlePlaceId as string, location]),
    );
    const seenPlaceIds = new Set<string>([
      ...(placeDetails.id ? [placeDetails.id] : []),
      ...Array.from(locationsByPlaceId.keys()),
    ]);

    let pageToken: string | undefined;
    let totalProcessed = 0;
    do {
      const response = await this.googlePlacesService.findPlaceFromText(
        canonicalName,
        {
          locationBias,
          includedType: includedType ?? undefined,
          strictTypeFiltering: Boolean(includedType),
          pageToken,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'addressComponents',
            'location',
            'internationalPhoneNumber',
            'nationalPhoneNumber',
            'websiteUri',
            'regularOpeningHours',
            'currentOpeningHours',
            'utcOffsetMinutes',
            'timeZone',
          ],
        },
      );

      let processedThisPage = 0;
      // Branches on this page that ARE ours but are already stored. Counted
      // separately from `processedThisPage` because the "this page gave us
      // nothing, stop paginating" test below must mean "no branch of this
      // brand is on this page", NOT "nothing was WRITTEN". A retry (F354)
      // replays page 1 with every row already persisted, so a write-count
      // test would stop the retry at page 1 and it would never reach the page
      // that faulted — the resume would be a resume in name only. Found by
      // the retry spec, which failed against the write-count form.
      let alreadyStoredThisPage = 0;
      for (const place of response.places) {
        if (!place?.id) {
          continue;
        }
        const candidateDomain = this.normalizeWebsiteDomain(place.websiteUri);
        if (!candidateDomain || candidateDomain !== canonicalDomain) {
          continue;
        }
        // Domain match alone is NOT brand identity (generic hosts like facebook.com are
        // shared by unrelated restaurants). A secondary location must also carry the brand
        // name — otherwise any same-domain place drifting into the name search would be
        // absorbed as a fake "branch".
        if (
          !restaurantNamesAgree(canonicalName, this.getPlaceDisplayName(place))
        ) {
          continue;
        }
        if (
          typeof place.location?.latitude !== 'number' ||
          typeof place.location?.longitude !== 'number' ||
          typeof place.formattedAddress !== 'string'
        ) {
          continue;
        }

        // The seen-check sits HERE, after qualification, so that a place we
        // skip because it is already stored is still counted as "this page
        // carried a branch of ours". The canonical place is excluded: it is
        // seeded into seenPlaceIds and would otherwise make EVERY brand —
        // including one with zero branches — look like it had a hit on page
        // 1 and buy a second page.
        if (seenPlaceIds.has(place.id)) {
          if (place.id !== placeDetails.id) {
            alreadyStoredThisPage += 1;
          }
          continue;
        }

        const existingLocation = locationsByPlaceId.get(place.id) ?? null;
        const locationUpsert = this.buildLocationUpsertData(
          entity.entityId,
          existingLocation,
          place,
        );

        const ownedPlaceId = place.id;
        await this.prisma.$transaction(async (tx) => {
          await tx.restaurantLocation.upsert({
            where: { googlePlaceId: ownedPlaceId },
            update: {
              ...locationUpsert.update,
              restaurantId: entity.entityId,
              isPrimary: existingLocation?.isPrimary ?? false,
              updatedAt: new Date(),
            } as Prisma.RestaurantLocationUncheckedUpdateInput,
            create: {
              ...locationUpsert.create,
              restaurantId: entity.entityId,
              isPrimary: false,
            } as Prisma.RestaurantLocationUncheckedCreateInput,
          });
        });
        seenPlaceIds.add(ownedPlaceId);
        totalProcessed += 1;
        processedThisPage += 1;
        if (totalProcessed >= 60) {
          break;
        }
      }

      if (
        !response.nextPageToken ||
        totalProcessed >= 60 ||
        processedThisPage + alreadyStoredThisPage === 0
      ) {
        break;
      }

      pageToken = response.nextPageToken;
      await this.delay(2000);
    } while (pageToken);
  }

  /** Branch-expansion narrowing: a chain's branches share the brand's own
   *  primaryType, so the search restricts to it verbatim. No membership
   *  vetting — primaryType IS Google's classification (a Table A type by API
   *  contract), and the old food-set gate only DENIED narrowing to
   *  store-typed brands, the H-E-B error in miniature. */
  private resolveIncludedType(primaryType?: string | null): string | null {
    return primaryType?.trim() || null;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getPlaceDisplayName(
    place: GooglePlacesV1Place | null | undefined,
  ): string | null {
    const name = place?.displayName?.text;
    if (typeof name !== 'string') {
      return null;
    }
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private mapGooglePriceLevel(raw: unknown): number | null {
    if (typeof raw !== 'string') {
      return null;
    }
    switch (raw) {
      case 'PRICE_LEVEL_FREE':
        return 0;
      case 'PRICE_LEVEL_INEXPENSIVE':
        return 1;
      case 'PRICE_LEVEL_MODERATE':
        return 2;
      case 'PRICE_LEVEL_EXPENSIVE':
        return 3;
      case 'PRICE_LEVEL_VERY_EXPENSIVE':
        return 4;
      default:
        return null;
    }
  }

  /**
   * F363: the 20 Google boolean attributes and their aliases are declared
   * ONCE, in google-place-type-attributes.ts, where the predicate is a field
   * of the vocabulary entry. This service used to carry a second copy that
   * had already drifted on 7 of the 20.
   */
  private extractGoogleRestaurantAttributeDefinitions(
    place: GooglePlacesV1Place,
  ): RestaurantAttributeVocabEntry[] {
    return GOOGLE_BOOLEAN_ATTRIBUTE_VOCAB.filter((entry) =>
      entry.isEnabled!(place),
    );
  }

  private mapPlaceTypesToRestaurantAttributeNames(
    place: GooglePlacesV1Place,
  ): string[] {
    const types = Array.isArray(place.types) ? place.types : [];
    const names = new Set<string>();

    for (const type of types) {
      if (typeof type !== 'string') {
        continue;
      }
      const normalized = type.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      const canonical = GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP[normalized];
      if (canonical) {
        names.add(canonical);
      }
    }

    return Array.from(names);
  }

  private normalizeRestaurantAttributeName(value: string): string {
    return value.trim().toLowerCase();
  }

  private googleRestaurantAttributeIdsByNamePromise: Promise<
    Map<string, string>
  > | null = null;

  private async getGoogleRestaurantAttributeIdsByName(): Promise<
    Map<string, string>
  > {
    if (this.googleRestaurantAttributeIdsByNamePromise) {
      return this.googleRestaurantAttributeIdsByNamePromise;
    }

    this.googleRestaurantAttributeIdsByNamePromise = this.prisma.entity
      .findMany({
        where: {
          type: EntityType.restaurant_attribute,
          name: { in: GOOGLE_RESTAURANT_ATTRIBUTE_CANONICAL_NAMES },
        },
        select: { entityId: true, name: true },
      })
      .then((rows) => {
        const map = new Map<string, string>();
        for (const row of rows) {
          map.set(
            this.normalizeRestaurantAttributeName(row.name),
            row.entityId,
          );
        }
        return map;
      })
      .catch((error) => {
        this.googleRestaurantAttributeIdsByNamePromise = null;
        throw error;
      });

    return this.googleRestaurantAttributeIdsByNamePromise;
  }

  private async resolveRestaurantAttributeIdsForDefinitions(
    definitions: RestaurantAttributeVocabEntry[],
  ): Promise<string[]> {
    if (definitions.length === 0) {
      return [];
    }

    const idsByName = await this.getGoogleRestaurantAttributeIdsByName();
    const ids: string[] = [];

    for (const definition of definitions) {
      const canonicalName = this.normalizeRestaurantAttributeName(
        definition.canonicalName,
      );
      const entityId =
        idsByName.get(canonicalName) ??
        (await this.ensureRestaurantAttributeEntity(canonicalName, idsByName));
      ids.push(entityId);
    }

    return Array.from(new Set(ids));
  }

  /**
   * Attribute vocabulary is defined in code (google-place-type-attributes.ts),
   * not in a seed file — a missing entity is created on first use so
   * enrichment never silently drops an attribute link.
   */
  private async ensureRestaurantAttributeEntity(
    canonicalName: string,
    idsByName: Map<string, string>,
  ): Promise<string> {
    const seedAliases =
      RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME.get(canonicalName) ?? [];
    const created = await this.prisma.entity.create({
      data: {
        name: canonicalName,
        type: EntityType.restaurant_attribute,
        ...identityInsertData(canonicalName, EntityType.restaurant_attribute),
      },
      select: { entityId: true },
    });
    // The code-declared Google attribute surfaces, not Places text — 'seed',
    // and English by declaration, but left 'und' because the vocabulary file
    // carries no language tag to read.
    if (seedAliases.length) {
      await this.prisma.$transaction((tx) =>
        addSurfaces(
          tx,
          created.entityId,
          seedAliases.map((form) => ({ form, source: 'seed' as const })),
          { markEmbeddingStale: false },
        ),
      );
    }
    idsByName.set(canonicalName, created.entityId);
    this.logger.info('Created restaurant_attribute entity on demand', {
      canonicalName,
      entityId: created.entityId,
    });
    return created.entityId;
  }

  private async resolveRestaurantAttributeIdsForNames(
    names: string[],
  ): Promise<string[]> {
    if (!names.length) {
      return [];
    }

    const idsByName = await this.getGoogleRestaurantAttributeIdsByName();
    const ids: string[] = [];

    for (const name of names) {
      const canonicalName = this.normalizeRestaurantAttributeName(name);
      const entityId =
        idsByName.get(canonicalName) ??
        (await this.ensureRestaurantAttributeEntity(canonicalName, idsByName));
      ids.push(entityId);
    }

    return Array.from(new Set(ids));
  }

  private extractAutocompleteCandidates(
    suggestions: GooglePlacesV1AutocompleteSuggestion[],
  ): PlaceCandidate[] {
    const candidates: PlaceCandidate[] = [];

    for (const suggestion of suggestions) {
      const prediction = suggestion?.placePrediction;
      const placeId =
        typeof prediction?.placeId === 'string'
          ? prediction.placeId.trim()
          : '';
      if (!placeId) {
        continue;
      }

      const mainText = prediction?.structuredFormat?.mainText?.text;
      const secondaryText = prediction?.structuredFormat?.secondaryText?.text;
      const description =
        typeof mainText === 'string' && mainText.trim().length
          ? typeof secondaryText === 'string' && secondaryText.trim().length
            ? `${mainText.trim()}, ${secondaryText.trim()}`
            : mainText.trim()
          : placeId;

      const candidate: PlaceCandidate = {
        placeId,
        description,
      };

      if (typeof mainText === 'string' && mainText.trim().length) {
        candidate.mainText = mainText.trim();
      }
      if (typeof secondaryText === 'string' && secondaryText.trim().length) {
        candidate.secondaryText = secondaryText.trim();
      }
      if (Array.isArray(prediction?.types) && prediction.types.length > 0) {
        candidate.types = prediction.types.filter(
          (value): value is string => typeof value === 'string',
        );
      }
      candidates.push(candidate);
    }

    return candidates;
  }

  private rankCandidates(candidates: PlaceCandidate[]): RankedCandidate[] {
    return candidates.map((candidate) => ({
      candidate,
    }));
  }

  private hasCandidateLocaleBiasContext(
    context: EnrichmentSearchContext,
  ): boolean {
    const radiusMeters = context.locationBias?.radiusMeters;
    return (
      typeof radiusMeters === 'number' &&
      Number.isFinite(radiusMeters) &&
      radiusMeters > 0
    );
  }

  private serializeRankedCandidates(
    ranked: RankedCandidate[],
  ): Array<Record<string, unknown>> {
    return ranked.slice(0, 5).map(({ candidate, score }) => {
      const candidateRecord: Record<string, unknown> = {
        placeId: candidate.placeId,
      };

      if (typeof score === 'number') {
        candidateRecord.score = score;
      }
      if (candidate.description) {
        candidateRecord.description = candidate.description;
      }
      if (candidate.mainText) {
        candidateRecord.mainText = candidate.mainText;
      }
      if (candidate.secondaryText) {
        candidateRecord.secondaryText = candidate.secondaryText;
      }
      if (Array.isArray(candidate.types) && candidate.types.length > 0) {
        candidateRecord.types = candidate.types;
      }
      return candidateRecord;
    });
  }

  private finalizeSelectedCandidate(params: {
    selected?: {
      entry: RankedCandidate;
      matchSource: CandidateSelectionSource;
      score?: number;
    };
    adjudicationTrail: CandidateSelectionTrailEntry[];
    strategy: CandidateSelectionResult['strategy'];
    extras?: Partial<CandidateSelectionTrailEntry>;
  }): CandidateSelectionResult {
    const selected = params.selected;
    if (!selected) {
      return {
        adjudicationTrail: params.adjudicationTrail,
        strategy: params.strategy,
      };
    }

    // NO TYPE JUDGMENT OF ANY KIND (2026-08-08, owner question "why do we
    // even need this typeset?"): the chooser saw the candidate's raw types,
    // the source text, and the market, and its verdict stands. Candidate
    // types are recorded verbatim in the match metadata, so any off-category
    // audit is a query, not a curated set. History: a 64-key cuisine map
    // vetoed the judge (234 ghosts), then survived as a 164-type "hint" that
    // fed only a log line — both deleted.
    return {
      selected,
      adjudicationTrail: params.adjudicationTrail,
      strategy: params.strategy,
    };
  }

  private async evaluateGeminiCandidateSet(
    params: {
      autocompleteRanked: RankedCandidate[];
      searchTextRanked: RankedCandidate[];
      entity: RestaurantEntity;
      context?: EnrichmentSearchContext;
    },
    strategy: CandidateSelectionResult['strategy'],
  ): Promise<CandidateStageEvaluation> {
    const adjudicationTrail: CandidateSelectionTrailEntry[] = [];
    const chooserCandidates = this.buildGeminiChooserCandidates({
      ...params,
      autocompleteCandidateLimit: 10,
      searchTextCandidateLimit: 5,
    });
    if (!chooserCandidates.length) {
      adjudicationTrail.push({
        placeId: 'retry',
        candidateName: 'no candidate selected',
        source: 'autocomplete',
        sameBusiness: false,
        reason: 'no candidates available',
      });
      return {
        selection: {
          adjudicationTrail,
          strategy,
        },
      };
    }

    try {
      const decision = await this.llmService.chooseRestaurantPlaceCandidate({
        query: params.entity.name,
        sourceText: params.context?.sourceText,
        sourceLocale: {
          city: params.context?.city,
          region: params.context?.region,
        },
        candidates: chooserCandidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          name:
            candidate.entry.candidate.mainText ||
            candidate.entry.candidate.description.split(',')[0] ||
            candidate.entry.candidate.description,
          address: candidate.entry.candidate.description,
          types: candidate.entry.candidate.types ?? [],
          sourceLabels: candidate.sourceLabels,
          autocompleteRank: candidate.autocompleteRank ?? null,
          searchTextRank: candidate.searchTextRank ?? null,
        })),
      });

      if (decision.decision !== 'select' || !decision.candidateId) {
        adjudicationTrail.push({
          placeId: 'reject',
          candidateName: 'no candidate selected',
          source: 'autocomplete',
          sameBusiness: false,
          reason: 'chooser rejected current candidates',
        });
        return {
          selection: {
            adjudicationTrail,
            strategy,
          },
        };
      }

      const chosen = chooserCandidates.find(
        (candidate) => candidate.candidateId === decision.candidateId,
      );
      if (!chosen) {
        adjudicationTrail.push({
          placeId: 'reject',
          candidateName: 'invalid candidate selected',
          source: 'autocomplete',
          sameBusiness: false,
          reason: 'chooser selected unknown candidate id',
        });
        return {
          selection: {
            adjudicationTrail,
            strategy,
          },
        };
      }

      adjudicationTrail.push({
        placeId: chosen.entry.candidate.placeId,
        candidateName:
          chosen.entry.candidate.mainText ||
          chosen.entry.candidate.description.split(',')[0] ||
          chosen.entry.candidate.description,
        source: chosen.matchSource,
        sameBusiness: true,
        reason: 'chooser selected candidate',
        autocompleteRank: chosen.autocompleteRank,
        searchTextRank: chosen.searchTextRank,
        exactNameMatch: false,
        consensusCandidate:
          typeof chosen.autocompleteRank === 'number' &&
          typeof chosen.searchTextRank === 'number',
      });

      return {
        selection: this.finalizeSelectedCandidate({
          selected: {
            entry: chosen.entry,
            matchSource: chosen.matchSource,
            score: chosen.entry.score,
          },
          adjudicationTrail,
          strategy,
          extras: {
            autocompleteRank: chosen.autocompleteRank,
            searchTextRank: chosen.searchTextRank,
            exactNameMatch: false,
            consensusCandidate:
              typeof chosen.autocompleteRank === 'number' &&
              typeof chosen.searchTextRank === 'number',
          },
        }),
      };
    } catch (error) {
      this.logger.warn('Restaurant place chooser failed', {
        query: params.entity.name,
        sourceText: params.context?.sourceText?.slice(0, 300),
        candidateCount: chooserCandidates.length,
        strategy,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
        },
      });
      adjudicationTrail.push({
        placeId: 'reject',
        candidateName: 'chooser failed',
        source: 'autocomplete',
        sameBusiness: false,
        reason: 'chooser failed',
      });
      return {
        selection: {
          adjudicationTrail,
          strategy,
        },
      };
    }
  }

  private async runGeminiSelectionFlow(params: {
    autocompleteRanked: RankedCandidate[];
    entity: RestaurantEntity;
    context?: EnrichmentSearchContext;
  }): Promise<GeminiSelectionFlowResult> {
    const strategy: CandidateSelectionResult['strategy'] = 'gemini_staged';

    const initialEvaluation = await this.evaluateGeminiCandidateSet(
      {
        autocompleteRanked: params.autocompleteRanked,
        searchTextRanked: [],
        entity: params.entity,
        context: params.context,
      },
      strategy,
    );

    if (initialEvaluation.selection.selected) {
      return {
        selection: initialEvaluation.selection,
        retryAutocompleteAttempted: false,
        retryAutocompleteRanked: [],
        fallbackAttempted: false,
        fallbackRanked: [],
        initialEvaluation,
      };
    }

    let latestEvaluation = initialEvaluation;
    let combinedAutocompleteRanked = params.autocompleteRanked;
    let retryAutocompleteAttempted = false;
    let retryAutocompleteRanked: RankedCandidate[] = [];
    let retryEvaluation: CandidateStageEvaluation | undefined;

    const retryQuery =
      this.buildAutocompleteLocaleRetryQuery(
        params.context,
        params.context?.query ?? params.entity.name ?? null,
      ) ?? undefined;
    if (retryQuery) {
      retryAutocompleteAttempted = true;
      retryAutocompleteRanked = await this.collectAutocompleteCandidates(
        retryQuery,
        params.context,
      );
      if (retryAutocompleteRanked.length > 0) {
        combinedAutocompleteRanked = this.mergeRankedCandidates([
          ...params.autocompleteRanked,
          ...retryAutocompleteRanked,
        ]);
      }
      latestEvaluation = await this.evaluateGeminiCandidateSet(
        {
          autocompleteRanked: combinedAutocompleteRanked,
          searchTextRanked: [],
          entity: params.entity,
          context: params.context,
        },
        strategy,
      );
      retryEvaluation = latestEvaluation;
      if (latestEvaluation.selection.selected) {
        return {
          selection: {
            ...latestEvaluation.selection,
            adjudicationTrail: [
              ...initialEvaluation.selection.adjudicationTrail,
              ...latestEvaluation.selection.adjudicationTrail,
            ],
          },
          retryAutocompleteAttempted,
          retryAutocompleteRanked,
          retryQuery,
          fallbackAttempted: false,
          fallbackRanked: [],
          initialEvaluation,
          retryEvaluation,
        };
      }
    }

    const fallback = await this.collectFallbackSearchCandidates(
      params.entity,
      params.context ?? {
        query: params.entity.name ?? null,
      },
    );
    const finalEvaluation = await this.evaluateGeminiCandidateSet(
      {
        autocompleteRanked: combinedAutocompleteRanked,
        searchTextRanked: fallback.ranked,
        entity: params.entity,
        context: params.context,
      },
      strategy,
    );

    return {
      selection: {
        ...finalEvaluation.selection,
        adjudicationTrail: [
          ...(retryAutocompleteAttempted
            ? initialEvaluation.selection.adjudicationTrail
            : []),
          ...latestEvaluation.selection.adjudicationTrail,
          ...finalEvaluation.selection.adjudicationTrail,
        ],
      },
      retryAutocompleteAttempted,
      retryAutocompleteRanked,
      retryQuery,
      fallbackAttempted: fallback.attempted,
      fallbackStatus: fallback.status,
      fallbackRanked: fallback.ranked,
      initialEvaluation,
      retryEvaluation,
      finalEvaluation,
    };
  }

  private async collectFallbackSearchCandidates(
    entity: RestaurantEntity,
    context: EnrichmentSearchContext,
  ): Promise<{
    attempted: boolean;
    status?: string;
    ranked: RankedCandidate[];
  }> {
    const fallbackResult = await this.tryFindPlaceFallback(entity, context);
    if (fallbackResult) {
      return {
        attempted: true,
        status: fallbackResult.status,
        ranked: fallbackResult.ranked,
      };
    }

    return {
      attempted: true,
      status: 'error',
      ranked: [],
    };
  }

  private async collectAutocompleteCandidates(
    query: string,
    context?: EnrichmentSearchContext,
  ): Promise<RankedCandidate[]> {
    if (!query.trim()) {
      return [];
    }

    const autocomplete = await this.googlePlacesService.autocompletePlace(
      query,
      {
        language: 'en',
        locationBias: context?.locationBias,
        includeRaw: false,
      },
    );

    return this.rankCandidates(
      this.extractAutocompleteCandidates(autocomplete.suggestions),
    );
  }

  private buildAutocompleteLocaleRetryQuery(
    context: EnrichmentSearchContext | undefined,
    query: string | null,
  ): string | null {
    const trimmedQuery = query?.trim() ?? '';
    if (!trimmedQuery) {
      return null;
    }

    const localeParts = [context?.city?.trim(), context?.region?.trim()].filter(
      (value): value is string => Boolean(value && value.length > 0),
    );
    if (!localeParts.length) {
      return null;
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
    const missingParts = localeParts.filter(
      (part) => !normalizedQuery.includes(part.toLowerCase()),
    );
    if (!missingParts.length) {
      return null;
    }

    return `${trimmedQuery} ${missingParts.join(' ')}`.trim();
  }

  private mergeRankedCandidates(
    candidates: RankedCandidate[],
  ): RankedCandidate[] {
    const mergedByPlaceId = new Map<string, RankedCandidate>();

    for (const entry of candidates) {
      const placeId = entry.candidate.placeId?.trim();
      if (!placeId) {
        continue;
      }
      const existing = mergedByPlaceId.get(placeId);
      if (!existing) {
        mergedByPlaceId.set(placeId, entry);
        continue;
      }
      const existingScore =
        typeof existing.score === 'number'
          ? existing.score
          : Number.NEGATIVE_INFINITY;
      const nextScore =
        typeof entry.score === 'number'
          ? entry.score
          : Number.NEGATIVE_INFINITY;
      if (nextScore > existingScore) {
        mergedByPlaceId.set(placeId, entry);
      }
    }

    return Array.from(mergedByPlaceId.values()).sort((left, right) => {
      const leftScore =
        typeof left.score === 'number' ? left.score : Number.NEGATIVE_INFINITY;
      const rightScore =
        typeof right.score === 'number'
          ? right.score
          : Number.NEGATIVE_INFINITY;
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return left.candidate.placeId.localeCompare(right.candidate.placeId);
    });
  }

  private buildGeminiChooserCandidates(params: {
    autocompleteRanked: RankedCandidate[];
    searchTextRanked: RankedCandidate[];
    entity: RestaurantEntity;
    context?: EnrichmentSearchContext;
    autocompleteCandidateLimit?: number;
    searchTextCandidateLimit?: number;
  }): GeminiChooserCandidate[] {
    const candidatesByPlaceId = new Map<string, GeminiChooserCandidate>();
    const autocompleteCandidateLimit = Math.max(
      1,
      params.autocompleteCandidateLimit ?? 5,
    );
    const searchTextCandidateLimit = Math.max(
      1,
      params.searchTextCandidateLimit ?? 5,
    );

    const addCandidate = (
      entry: RankedCandidate,
      source: CandidateSelectionSource,
      rank: number,
    ) => {
      const placeId = entry.candidate.placeId;
      if (!placeId?.trim()) {
        return;
      }

      const existing = candidatesByPlaceId.get(placeId);
      if (existing) {
        if (!existing.sourceLabels.includes(source)) {
          existing.sourceLabels.push(source);
        }
        if (source === 'autocomplete') {
          existing.autocompleteRank = Math.min(
            existing.autocompleteRank ?? Number.POSITIVE_INFINITY,
            rank,
          );
          existing.entry = entry;
          existing.matchSource = 'autocomplete';
        } else {
          existing.searchTextRank = Math.min(
            existing.searchTextRank ?? Number.POSITIVE_INFINITY,
            rank,
          );
        }
        return;
      }

      candidatesByPlaceId.set(placeId, {
        candidateId: `c${candidatesByPlaceId.size + 1}`,
        entry,
        matchSource: source,
        autocompleteRank: source === 'autocomplete' ? rank : undefined,
        searchTextRank: source === 'find_place' ? rank : undefined,
        sourceLabels: [source],
      });
    };

    params.autocompleteRanked
      .slice(0, autocompleteCandidateLimit)
      .forEach((entry, index) => addCandidate(entry, 'autocomplete', index));
    params.searchTextRanked
      .slice(0, searchTextCandidateLimit)
      .forEach((entry, index) => addCandidate(entry, 'find_place', index));

    return Array.from(candidatesByPlaceId.values()).sort((a, b) => {
      const aBestRank = Math.min(
        a.autocompleteRank ?? Number.POSITIVE_INFINITY,
        a.searchTextRank ?? Number.POSITIVE_INFINITY,
      );
      const bBestRank = Math.min(
        b.autocompleteRank ?? Number.POSITIVE_INFINITY,
        b.searchTextRank ?? Number.POSITIVE_INFINITY,
      );
      if (aBestRank !== bBestRank) {
        return aBestRank - bBestRank;
      }
      return a.candidateId.localeCompare(b.candidateId);
    });
  }

  private buildEntityUpdate(
    entity: RestaurantEntity,
    details: GooglePlacesV1Place,
    _requestedFieldMask: string,
    matchMetadata: MatchMetadata,
  ): {
    updateData: Prisma.EntityUpdateInput;
    updatedFields: string[];
  } {
    const addressParts = this.extractAddressParts(details);
    const normalizedHours = this.normalizeGoogleOpeningHours(details);
    const googlePlacesMetadata = this.buildGooglePlacesMetadata(
      details,
      matchMetadata,
    );
    const trustedWebsiteDomain = this.normalizeWebsiteDomain(
      details.websiteUri,
    );
    const metadata = this.mergeRestaurantMetadata(
      entity.restaurantMetadata,
      googlePlacesMetadata,
      normalizedHours,
      null,
    );

    const updateData: Prisma.EntityUpdateInput = {
      lastUpdated: new Date(),
      restaurantMetadata: metadata,
    };

    const updatedFields: string[] = ['restaurantMetadata'];

    if (
      trustedWebsiteDomain &&
      trustedWebsiteDomain !==
        (entity.canonicalDomain?.trim().toLowerCase() ?? null)
    ) {
      updateData.canonicalDomain = trustedWebsiteDomain;
      updatedFields.push('canonicalDomain');
    }

    if (typeof details.location?.latitude === 'number') {
      updateData.latitude = details.location.latitude;
      updatedFields.push('latitude');
    }

    if (typeof details.location?.longitude === 'number') {
      updateData.longitude = details.location.longitude;
      updatedFields.push('longitude');
    }

    if (
      typeof details.formattedAddress === 'string' &&
      details.formattedAddress
    ) {
      updateData.address = details.formattedAddress;
      updatedFields.push('address');
    }

    if (addressParts.city) {
      updateData.city = addressParts.city;
      updatedFields.push('city');
    }

    if (addressParts.region) {
      updateData.region = addressParts.region;
      updatedFields.push('region');
    }

    if (addressParts.country) {
      const normalizedCountry = this.normalizeCountryCodeForStorage(
        addressParts.country,
      );
      if (normalizedCountry) {
        updateData.country = normalizedCountry;
        updatedFields.push('country');
      }
    }

    if (addressParts.postalCode) {
      updateData.postalCode = addressParts.postalCode;
      updatedFields.push('postalCode');
    }

    const mappedPriceLevel = this.mapGooglePriceLevel(details.priceLevel);
    if (mappedPriceLevel !== null) {
      updateData.priceLevel = mappedPriceLevel;
      updateData.priceLevelUpdatedAt = new Date();
      updatedFields.push('priceLevel', 'priceLevelUpdatedAt');
    } else {
      const priceRange = this.normalizeGooglePriceRange(details.priceRange);
      const derivedLevel = this.mapPriceRangeToLevel(priceRange);
      if (derivedLevel !== null) {
        updateData.priceLevel = derivedLevel;
        updateData.priceLevelUpdatedAt = new Date();
        updatedFields.push('priceLevel', 'priceLevelUpdatedAt');
      }
    }

    return { updateData, updatedFields };
  }

  private coerceEntityUpdateToCreateInput(
    updateData: Prisma.EntityUpdateInput,
  ): Partial<Prisma.EntityCreateInput> {
    const createData: Partial<Prisma.EntityCreateInput> = {};

    const canonicalDomain = this.unwrapUpdateValue(updateData.canonicalDomain);
    if (canonicalDomain !== undefined) {
      createData.canonicalDomain = canonicalDomain;
    }

    const lastUpdated = this.unwrapUpdateValue(updateData.lastUpdated);
    if (lastUpdated !== undefined && lastUpdated !== null) {
      createData.lastUpdated = lastUpdated;
    }

    const restaurantMetadata = this.unwrapUpdateValue(
      updateData.restaurantMetadata,
    );
    if (restaurantMetadata !== undefined && restaurantMetadata !== null) {
      createData.restaurantMetadata =
        restaurantMetadata as Prisma.InputJsonValue;
    }

    const latitude = this.unwrapUpdateValue(updateData.latitude);
    if (latitude !== undefined) {
      createData.latitude = latitude;
    }

    const longitude = this.unwrapUpdateValue(updateData.longitude);
    if (longitude !== undefined) {
      createData.longitude = longitude;
    }

    const address = this.unwrapUpdateValue(updateData.address);
    if (address !== undefined) {
      createData.address = address;
    }

    const city = this.unwrapUpdateValue(updateData.city);
    if (city !== undefined) {
      createData.city = city;
    }

    const region = this.unwrapUpdateValue(updateData.region);
    if (region !== undefined) {
      createData.region = region;
    }

    const country = this.unwrapUpdateValue(updateData.country);
    if (country !== undefined) {
      createData.country = country;
    }

    const postalCode = this.unwrapUpdateValue(updateData.postalCode);
    if (postalCode !== undefined) {
      createData.postalCode = postalCode;
    }

    const priceLevel = this.unwrapUpdateValue(updateData.priceLevel);
    if (priceLevel !== undefined) {
      createData.priceLevel = priceLevel;
    }

    const priceLevelUpdatedAt = this.unwrapUpdateValue(
      updateData.priceLevelUpdatedAt,
    );
    if (priceLevelUpdatedAt !== undefined) {
      createData.priceLevelUpdatedAt = priceLevelUpdatedAt;
    }

    return createData;
  }

  private unwrapUpdateValue<T>(
    value: T | { set?: T } | null | undefined,
  ): T | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }
    if (typeof value === 'object' && 'set' in value) {
      const keys = Object.keys(value as Record<string, unknown>);
      if (keys.length === 1 && keys[0] === 'set') {
        return (value as { set?: T }).set;
      }
    }
    return value as T;
  }

  private buildLocationUpsertData(
    restaurantId: string,
    current: RestaurantLocation | null | undefined,
    details: GooglePlacesV1Place,
  ): {
    create: Prisma.RestaurantLocationUncheckedCreateInput;
    update: Prisma.RestaurantLocationUncheckedUpdateInput;
    updatedFields: string[];
  } {
    const addressParts = this.extractAddressParts(details);
    const normalizedHours = this.normalizeGoogleOpeningHours(details);
    const phoneNumber = this.resolvePrimaryPhoneNumber(details);
    const websiteUrl = this.normalizeWebsiteUrl(details.websiteUri);
    const websiteDomain = this.normalizeWebsiteDomain(details.websiteUri);

    const baseData = {
      restaurantId,
      googlePlaceId: details.id ?? null,
      latitude:
        typeof details.location?.latitude === 'number'
          ? details.location.latitude
          : null,
      longitude:
        typeof details.location?.longitude === 'number'
          ? details.location.longitude
          : null,
      address:
        typeof details.formattedAddress === 'string'
          ? details.formattedAddress
          : null,
      city: addressParts.city ?? null,
      region: addressParts.region ?? null,
      country: addressParts.country
        ? this.normalizeCountryCodeForStorage(addressParts.country)
        : null,
      postalCode: addressParts.postalCode ?? null,
      phoneNumber,
      websiteUrl,
      websiteDomain,
      hours: normalizedHours.hours ?? Prisma.DbNull,
      utcOffsetMinutes:
        normalizedHours.utcOffsetMinutes !== undefined
          ? normalizedHours.utcOffsetMinutes
          : null,
      timeZone: normalizedHours.timezone ?? null,
      businessStatus:
        typeof details.businessStatus === 'string'
          ? details.businessStatus
          : null,
      movedPlaceId:
        typeof details.movedPlaceId === 'string' && details.movedPlaceId.trim()
          ? details.movedPlaceId.trim()
          : null,
      lastPolledAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedFields: string[] = [
      'googlePlaceId',
      'latitude',
      'longitude',
      'address',
      'city',
      'region',
      'country',
      'postalCode',
      'phoneNumber',
      'websiteUrl',
      'websiteDomain',
      'hours',
      'utcOffsetMinutes',
      'timeZone',
    ];

    const create: Prisma.RestaurantLocationUncheckedCreateInput = {
      ...baseData,
      isPrimary: current?.isPrimary ?? true,
    };

    const update: Prisma.RestaurantLocationUncheckedUpdateInput = {
      ...baseData,
      isPrimary: current?.isPrimary ?? true,
    };

    return {
      create,
      update,
      updatedFields,
    };
  }

  private async upsertPrimaryLocation(params: {
    tx: Prisma.TransactionClient;
    restaurantId: string;
    placeDetails: GooglePlacesV1Place;
    locationUpsert: {
      create: Prisma.RestaurantLocationUncheckedCreateInput;
      update: Prisma.RestaurantLocationUncheckedUpdateInput;
    };
    targetLocation?: RestaurantLocation | null;
  }): Promise<RestaurantLocation> {
    const { tx, restaurantId, placeDetails, locationUpsert, targetLocation } =
      params;
    const placeId = placeDetails.id;

    if (!placeId) {
      throw new Error('Google Place details missing id');
    }

    const placeholderLocation =
      targetLocation && !targetLocation.googlePlaceId ? targetLocation : null;

    const location = placeholderLocation
      ? await tx.restaurantLocation.update({
          where: { locationId: placeholderLocation.locationId },
          data: {
            ...locationUpsert.update,
            restaurantId,
            isPrimary: true,
            updatedAt: new Date(),
          } as Prisma.RestaurantLocationUncheckedUpdateInput,
        })
      : await tx.restaurantLocation.upsert({
          where: { googlePlaceId: placeId },
          update: {
            ...locationUpsert.update,
            restaurantId,
            isPrimary: true,
            updatedAt: new Date(),
          } as Prisma.RestaurantLocationUncheckedUpdateInput,
          create: {
            ...locationUpsert.create,
            restaurantId,
            isPrimary: true,
          } as Prisma.RestaurantLocationUncheckedCreateInput,
        });

    await tx.restaurantLocation.deleteMany({
      where: {
        restaurantId,
        googlePlaceId: null,
        locationId: { not: location.locationId },
      },
    });

    return location;
  }

  private mergeRestaurantMetadata(
    current: Prisma.JsonValue | null | undefined,
    googleMetadata: Record<string, unknown>,
    normalizedHours: NormalizedOpeningHours,
    extras?: Record<string, unknown> | null,
  ): Prisma.InputJsonValue {
    const base = this.toRecord(current);
    const existingGooglePlaces = this.toRecord(base.googlePlaces);
    delete existingGooglePlaces.fields;
    delete existingGooglePlaces.openingHours;
    delete existingGooglePlaces.currentOpeningHours;

    base.googlePlaces = {
      ...existingGooglePlaces,
      ...googleMetadata,
    };

    if (normalizedHours.hours) {
      base.hours = normalizedHours.hours;
    }

    if (
      normalizedHours.utcOffsetMinutes !== undefined &&
      normalizedHours.utcOffsetMinutes !== null
    ) {
      base.utc_offset_minutes = normalizedHours.utcOffsetMinutes;
    }

    if (normalizedHours.timezone) {
      base.timezone = normalizedHours.timezone;
    }

    if (extras && Object.keys(extras).length > 0) {
      base.lastEnrichmentAttempt = extras;
    } else if (extras === null) {
      delete base.lastEnrichmentAttempt;
    }

    return base as Prisma.InputJsonValue;
  }

  private buildGooglePlacesMetadata(
    details: GooglePlacesV1Place,
    matchMetadata: MatchMetadata,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      placeId: details.id,
      fetchedAt: new Date().toISOString(),
    };

    const displayName = this.getPlaceDisplayName(details);
    if (displayName) {
      metadata.name = displayName;
    }

    if (details.formattedAddress) {
      metadata.formattedAddress = details.formattedAddress;
    }

    if (details.businessStatus) {
      metadata.businessStatus = details.businessStatus;
    }

    if (details.movedPlace) {
      metadata.movedPlace = details.movedPlace;
    }

    if (details.movedPlaceId) {
      metadata.movedPlaceId = details.movedPlaceId;
    }

    if (details.nationalPhoneNumber) {
      metadata.formattedPhoneNumber = details.nationalPhoneNumber;
    }

    if (details.internationalPhoneNumber) {
      metadata.internationalPhoneNumber = details.internationalPhoneNumber;
    }

    if (details.websiteUri) {
      metadata.website = details.websiteUri;
    }

    if (details.primaryType) {
      metadata.primaryType = details.primaryType;
    }

    if (details.primaryTypeDisplayName?.text) {
      metadata.primaryTypeDisplayName = details.primaryTypeDisplayName.text;
    }

    if (details.editorialSummary?.text) {
      metadata.editorialSummary = {
        text: details.editorialSummary.text,
        languageCode: details.editorialSummary.languageCode,
      };
    }

    const mappedPriceLevel = this.mapGooglePriceLevel(details.priceLevel);
    if (mappedPriceLevel !== null) {
      metadata.priceLevel = mappedPriceLevel;
      metadata.priceLevelUpdatedAt = new Date().toISOString();
    }

    const priceRange = this.normalizeGooglePriceRange(details.priceRange);
    if (priceRange) {
      metadata.priceRange = priceRange;
      const derivedLevel = this.mapPriceRangeToLevel(priceRange);
      if (derivedLevel !== null) {
        metadata.priceRangeLevel = derivedLevel;
      }
    }

    if (Array.isArray(details.types) && details.types.length > 0) {
      metadata.types = details.types;
    }

    const matchSummary = this.buildMatchSummary(matchMetadata);
    if (Object.keys(matchSummary).length > 0) {
      metadata.matchSummary = matchSummary;
    }

    return metadata;
  }

  private buildMatchSummary(
    matchMetadata: MatchMetadata,
  ): Record<string, unknown> {
    const summary: Record<string, unknown> = {};

    if (matchMetadata.query) {
      summary.query = matchMetadata.query;
    }

    if (typeof matchMetadata.score === 'number') {
      summary.score = matchMetadata.score;
    }

    if (matchMetadata.mainText) {
      summary.mainText = matchMetadata.mainText;
    }

    if (matchMetadata.timestamp) {
      summary.timestamp = matchMetadata.timestamp;
    }

    if (matchMetadata.source) {
      summary.source = matchMetadata.source;
    }

    if (matchMetadata.redirectedFromPlaceId) {
      summary.redirectedFromPlaceId = matchMetadata.redirectedFromPlaceId;
    }

    if (matchMetadata.redirectedToPlaceId) {
      summary.redirectedToPlaceId = matchMetadata.redirectedToPlaceId;
    }

    if (matchMetadata.redirectedFromBusinessStatus) {
      summary.redirectedFromBusinessStatus =
        matchMetadata.redirectedFromBusinessStatus;
    }

    return summary;
  }

  private buildNoMatchMetadata(
    ranked: RankedCandidate[],
    context: EnrichmentSearchContext,
    extras: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const storageCountry = this.normalizeCountryCodeForStorage(
      context.countryCode ?? null,
    );

    const candidates = ranked.slice(0, 5).map(({ candidate, score }) => {
      const candidateRecord: Record<string, unknown> = {
        placeId: candidate.placeId,
      };

      if (typeof score === 'number') {
        candidateRecord.score = score;
      }

      if (candidate.description) {
        candidateRecord.description = candidate.description;
      }

      if (candidate.mainText) {
        candidateRecord.mainText = candidate.mainText;
      }

      if (candidate.secondaryText) {
        candidateRecord.secondaryText = candidate.secondaryText;
      }

      if (Array.isArray(candidate.types) && candidate.types.length > 0) {
        candidateRecord.types = candidate.types;
      }

      return candidateRecord;
    });

    return {
      query: context.query,
      country: storageCountry,
      city: context.city,
      region: context.region,
      attemptedAt: new Date().toISOString(),
      count: ranked.length,
      candidates,
      ...extras,
    };
  }

  private async tryFindPlaceFallback(
    entity: RestaurantEntity,
    context: EnrichmentSearchContext,
  ): Promise<{ status: string; ranked: RankedCandidate[] } | null> {
    if (!context.query) {
      return null;
    }

    try {
      const response = await this.googlePlacesService.findPlaceFromText(
        context.query,
        {
          language: 'en',
          includeRaw: false,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'types',
            'location',
          ],
          locationBias: context.locationBias
            ? {
                lat: context.locationBias.lat,
                lng: context.locationBias.lng,
                radiusMeters: context.locationBias.radiusMeters,
              }
            : undefined,
        },
      );

      const candidates = response.places
        .map((place) => this.mapTextSearchPlaceToCandidate(place))
        .filter((candidate): candidate is PlaceCandidate => candidate !== null);
      const ranked = this.rankCandidates(candidates);

      this.logger.debug('Find place fallback attempt completed', {
        entityId: entity.entityId,
        query: context.query,
        placeCount: response.places.length,
        rankedCount: ranked.length,
      });

      return {
        status: response.places.length > 0 ? 'OK' : 'ZERO_RESULTS',
        ranked,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Find place fallback failed', {
        entityId: entity.entityId,
        query: context.query,
        error: {
          message,
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
        },
      });
      return null;
    }
  }

  private async resolveEligiblePlaceDetails(params: {
    details: GooglePlacesV1PlaceDetailsResponse;
    fallbackPlaceId: string;
    query: string;
    candidate: PlaceCandidate;
    matchMetadata: MatchMetadata;
  }): Promise<{
    details: GooglePlacesV1PlaceDetailsResponse | null;
    rejectionReason?: string;
  }> {
    const place = params.details.place;
    if (!place) {
      return { details: null, rejectionReason: 'place details missing' };
    }

    if (typeof place.id !== 'string' || !place.id.trim()) {
      place.id = params.fallbackPlaceId;
    }

    if (place.businessStatus !== 'CLOSED_PERMANENTLY') {
      return { details: params.details };
    }

    const movedPlaceId =
      typeof place.movedPlaceId === 'string' ? place.movedPlaceId.trim() : '';
    if (!movedPlaceId) {
      this.logger.debug(
        'Rejecting permanently closed place without move target',
        {
          query: params.query,
          candidateName:
            params.candidate.mainText ||
            params.candidate.description?.split(',')[0] ||
            null,
          placeId: place.id,
        },
      );
      return {
        details: null,
        rejectionReason: 'place permanently closed',
      };
    }

    const redirectedDetails = await this.googlePlacesService.getPlaceDetails(
      movedPlaceId,
      { includeRaw: true },
    );
    if (!redirectedDetails.place) {
      return {
        details: null,
        rejectionReason: 'moved place details missing',
      };
    }

    if (
      typeof redirectedDetails.place.id !== 'string' ||
      !redirectedDetails.place.id.trim()
    ) {
      redirectedDetails.place.id = movedPlaceId;
    }

    params.matchMetadata.redirectedFromPlaceId = place.id;
    params.matchMetadata.redirectedToPlaceId = movedPlaceId;
    params.matchMetadata.redirectedFromBusinessStatus = place.businessStatus;

    this.logger.info('Following moved place redirect for closed location', {
      query: params.query,
      candidateName:
        params.candidate.mainText ||
        params.candidate.description?.split(',')[0] ||
        null,
      fromPlaceId: place.id,
      toPlaceId: movedPlaceId,
    });

    return { details: redirectedDetails };
  }

  private mapTextSearchPlaceToCandidate(
    place: GooglePlacesV1Place,
  ): PlaceCandidate | null {
    const placeId = typeof place.id === 'string' ? place.id.trim() : '';
    if (!placeId) {
      return null;
    }

    const name = this.getPlaceDisplayName(place);
    const formattedAddress =
      typeof place.formattedAddress === 'string'
        ? place.formattedAddress
        : null;

    const descriptionParts: string[] = [];
    if (name) {
      descriptionParts.push(name);
    }
    if (formattedAddress) {
      descriptionParts.push(formattedAddress);
    }

    const candidate: PlaceCandidate = {
      placeId,
      description: descriptionParts.join(', ') || placeId,
    };

    if (name) {
      candidate.mainText = name;
    }
    if (formattedAddress) {
      candidate.secondaryText = formattedAddress;
    }
    if (Array.isArray(place.types) && place.types.length > 0) {
      candidate.types = place.types.filter(
        (value): value is string => typeof value === 'string',
      );
    }

    if (typeof place.location?.latitude === 'number') {
      candidate.latitude = place.location.latitude;
    }
    if (typeof place.location?.longitude === 'number') {
      candidate.longitude = place.location.longitude;
    }

    return candidate;
  }

  private async recordNoMatchCandidates(
    entity: RestaurantEntity,
    reason: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // Every no-match path reached a VERDICT, so all of them are definitive;
    // the taxonomy is consulted for the stable reason CODE that lands in the
    // breadcrumb.
    const verdict = classifyNoMatchReason(reason);
    try {
      const emptyHours: NormalizedOpeningHours = {};
      const mergedMetadata = this.mergeRestaurantMetadata(
        entity.restaurantMetadata,
        {},
        emptyHours,
        {
          status: 'no_match',
          reason,
          ...this.buildFailureBreadcrumb(verdict),
          ...metadata,
        },
      );

      await this.prisma.entity.update({
        where: { entityId: entity.entityId },
        data: {
          restaurantMetadata: mergedMetadata,
          // A REAL attempt counter, incremented (never replaced). The
          // janitor's archive/retry policy used to read
          // metadata.lastEnrichmentAttempt.count, whose only writer set it to
          // the number of Google CANDIDATES — so the restaurants with the most
          // evidence got archived. See the migration for the full account.
          //
          // Counted only when the failure is DEFINITIVE — the janitor's third
          // strike is a PERMANENT archive, so only evidence about the
          // restaurant may spend a strike. See enrichment-failure-taxonomy.
          ...(verdict.failureClass === 'definitive'
            ? countEnrichmentFailure()
            : {}),
          lastUpdated: new Date(),
        },
      });

      entity.restaurantMetadata = mergedMetadata as unknown as Prisma.JsonValue;
    } catch (error) {
      // SWALLOW AND TELL SOMEONE (F205 doctrine, F4907's twin — F5100). This
      // catch guards the SAME attempt counter as recordEnrichmentFailure
      // forty lines below, and it carries the same stake, recorded in the
      // `countEnrichmentFailure` comment above: the janitor's archive/retry
      // policy reads that count, and when it was wrong "the restaurants with
      // the most evidence got archived". A transient DB error here leaves the
      // count where it was and the incident recurs with nothing but one warn
      // line to show for it. It still swallows (one entity must not end a
      // batch) — it just rings a bell now, in its twin's shape.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to record no-match candidates', {
        entityId: entity.entityId,
        reason,
        error:
          error instanceof Error
            ? { message, stack: error.stack }
            : { message },
      });
      this.opsAlerts.emit({
        severity: 'warn',
        kind: 'no_match_candidate_count_write_failed',
        title: 'No-match candidate counter did not persist',
        body: [
          'The write that records a no-match enrichment outcome — and increments the attempt COUNT the janitor reads — threw.',
          `Entity: ${entity.entityId}`,
          `No-match reason: ${reason}`,
          `Error: ${message}`,
          'Downstream: the count stays where it was, so the janitor archives and retries off a stale number — the incident countEnrichmentFailure exists to prevent — and this placeholder is re-enriched on the next run at real Places spend.',
        ].join('\n'),
        dedupeKey: `no_match_candidate_count_write_failed:${entity.entityId}`,
      });
    }
  }

  /**
   * The queryable half of the failure record. It rides in
   * `restaurant_metadata->'lastEnrichmentAttempt'` — an existing JSONB column
   * the janitor already reads — so the ungrounded backlog's CAUSES can be
   * counted with one query and no schema change:
   *
   *   SELECT restaurant_metadata->'lastEnrichmentAttempt'->>'failureReasonCode',
   *          restaurant_metadata->'lastEnrichmentAttempt'->>'failureClass',
   *          count(*)
   *   FROM core_entities WHERE type='restaurant' GROUP BY 1,2;
   */
  private buildFailureBreadcrumb(
    verdict: EnrichmentFailureVerdict,
  ): Record<string, unknown> {
    return {
      failureClass: verdict.failureClass,
      failureReasonCode: verdict.failureReasonCode,
      failureAt: new Date().toISOString(),
    };
  }

  private async recordEnrichmentFailure(
    entity: RestaurantEntity,
    reason: string,
    extras: Record<string, unknown> = {},
    // A caller that did not classify has, by definition, no evidence about
    // the restaurant — and the strike it would spend is permanent. Unclassified
    // defaults to TRANSIENT for the same reason the taxonomy's own fallback
    // does.
    verdict: EnrichmentFailureVerdict = {
      failureClass: 'transient',
      failureReasonCode: 'unclassified',
    },
  ): Promise<void> {
    try {
      const emptyHours: NormalizedOpeningHours = {};
      const mergedMetadata = this.mergeRestaurantMetadata(
        entity.restaurantMetadata,
        {},
        emptyHours,
        {
          status: 'error',
          reason,
          attemptedAt: new Date().toISOString(),
          ...this.buildFailureBreadcrumb(verdict),
          ...Object.fromEntries(
            Object.entries(extras).filter(([, value]) => value !== undefined),
          ),
        },
      );

      // THE BREADCRUMB IS ALSO AN EVENT, not only a column read. The 1,552
      // ungrounded placeholders accumulated with no way to ask WHY; a
      // structured line per failure lets the cause distribution be read from
      // logs even for entities whose row is later archived or merged away.
      this.logger.info('Enrichment failure classified', {
        entityId: entity.entityId,
        failureClass: verdict.failureClass,
        failureReasonCode: verdict.failureReasonCode,
        reason,
      });

      await this.prisma.entity.update({
        where: { entityId: entity.entityId },
        data: {
          restaurantMetadata: mergedMetadata,
          // The `error` path wrote NO count at all, so these placeholders sat
          // at 0 forever and were re-enriched every week at real Places spend.
          //
          // And then it counted EVERYTHING, which was the opposite defect:
          // three Google 429s archived a real restaurant permanently. Only a
          // DEFINITIVE outcome spends a strike; a transient one leaves the
          // count where it is and the entity retry-eligible.
          ...(verdict.failureClass === 'definitive'
            ? countEnrichmentFailure()
            : {}),
          lastUpdated: new Date(),
        },
      });

      entity.restaurantMetadata = mergedMetadata as unknown as Prisma.JsonValue;
    } catch (error) {
      // SWALLOW AND TELL SOMEONE (F205 doctrine, F4907). The write this
      // catch guards is the FAILURE COUNTER — the only thing standing
      // between a permanently-unenrichable placeholder and weekly Places
      // re-spend, which is the exact incident the `countEnrichmentFailure`
      // comment above records. A `warn` on the one path whose absence costs
      // money every week is not telling anyone: the count stays 0, the
      // janitor never archives, and the entity is re-enriched on the next
      // run at ~$0.045 per grounded location with no signal at all. It still
      // swallows (one entity must not end a batch) — it just rings a bell
      // now, in the sibling's shape.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to record enrichment failure metadata', {
        entityId: entity.entityId,
        reason,
        error:
          error instanceof Error
            ? { message, stack: error.stack }
            : { message },
      });
      this.opsAlerts.emit({
        severity: 'warn',
        kind: 'enrichment_failure_count_write_failed',
        title: 'Enrichment failure counter did not persist',
        body: [
          'The write that records an enrichment failure — and increments the attempt COUNT the janitor reads — threw.',
          `Entity: ${entity.entityId}`,
          `Enrichment reason: ${reason}`,
          `Error: ${message}`,
          'Downstream: the count stays where it was, so this placeholder is re-enriched on the next run at real Places spend, every run, until someone notices. That is the incident countEnrichmentFailure exists to prevent.',
        ].join('\n'),
        dedupeKey: `enrichment_failure_count_write_failed:${entity.entityId}`,
      });
    }
  }

  private extractTargetNameFromUpdate(
    update: Prisma.EntityUpdateInput,
    fallback?: string | null,
  ): string | null {
    const updateValue = update.name;

    if (typeof updateValue === 'string' && updateValue.trim().length) {
      return updateValue.trim();
    }

    if (
      updateValue &&
      typeof updateValue === 'object' &&
      typeof updateValue.set === 'string' &&
      updateValue.set.trim().length
    ) {
      return updateValue.set.trim();
    }

    if (typeof fallback === 'string' && fallback.trim().length) {
      return fallback.trim();
    }

    return null;
  }

  private normalizeGoogleOpeningHours(
    details: GooglePlacesV1Place,
  ): NormalizedOpeningHours {
    const normalized: NormalizedOpeningHours = {};
    const source =
      details.currentOpeningHours ?? details.regularOpeningHours ?? null;
    const sourceRecord = this.toRecord(source);
    const hoursByDay: Partial<Record<GoogleDayName, string[]>> = {};

    const periods = Array.isArray(sourceRecord.periods)
      ? (sourceRecord.periods as Array<{
          open?: { day?: number; hour?: number; minute?: number };
          close?: { day?: number; hour?: number; minute?: number };
        }>)
      : [];

    for (const period of periods) {
      if (!period?.open) {
        continue;
      }

      const dayKey = this.normalizeDayKeyFromIndex(period.open.day);
      const openTime = this.formatV1HourMinute(
        period.open.hour,
        period.open.minute,
      );
      const closeTime = this.formatV1HourMinute(
        period.close?.hour ?? period.open.hour,
        period.close?.minute ?? period.open.minute,
      );

      if (!dayKey || !openTime || !closeTime) {
        continue;
      }

      if (!hoursByDay[dayKey]) {
        hoursByDay[dayKey] = [];
      }

      hoursByDay[dayKey].push(`${openTime}-${closeTime}`);
    }

    if (Object.keys(hoursByDay).length === 0) {
      const weekdayText = Array.isArray(sourceRecord.weekdayDescriptions)
        ? (sourceRecord.weekdayDescriptions as string[])
        : [];
      if (weekdayText.length > 0) {
        this.populateHoursFromWeekdayText(weekdayText, hoursByDay);
      }
    }

    if (Object.keys(hoursByDay).length > 0) {
      normalized.hours = this.collapseHours(hoursByDay);
    }

    if (typeof details.utcOffsetMinutes === 'number') {
      normalized.utcOffsetMinutes = details.utcOffsetMinutes;
    } else if (typeof sourceRecord.utcOffsetMinutes === 'number') {
      normalized.utcOffsetMinutes = Number(sourceRecord.utcOffsetMinutes);
    }

    const timezoneCandidate =
      typeof details.timeZone === 'string'
        ? details.timeZone
        : typeof sourceRecord.timeZone === 'string'
          ? sourceRecord.timeZone
          : typeof sourceRecord.timezone === 'string'
            ? sourceRecord.timezone
            : undefined;

    if (timezoneCandidate) {
      normalized.timezone = timezoneCandidate;
    }

    return normalized;
  }

  private collapseHours(
    hoursByDay: Partial<Record<GoogleDayName, string[]>>,
  ): Partial<Record<GoogleDayName, string | string[]>> {
    const collapsed: Partial<Record<GoogleDayName, string | string[]>> = {};
    for (const [day, ranges] of Object.entries(hoursByDay) as Array<
      [GoogleDayName, string[]]
    >) {
      if (!ranges || ranges.length === 0) {
        continue;
      }

      const deduped = Array.from(new Set(ranges));
      collapsed[day] = deduped.length === 1 ? deduped[0] : deduped;
    }
    return collapsed;
  }

  private populateHoursFromWeekdayText(
    weekdayText: string[],
    hoursByDay: Partial<Record<GoogleDayName, string[]>>,
  ): void {
    for (const entry of weekdayText) {
      if (typeof entry !== 'string' || !entry.includes(':')) {
        continue;
      }

      const [rawDay, rawRange] = entry.split(':', 2);
      const dayKey = this.normalizeDayKey(rawDay);
      if (!dayKey) {
        continue;
      }

      const range = this.normalizeWeekdayTextRange(rawRange);
      if (!range) {
        continue;
      }

      if (!hoursByDay[dayKey]) {
        hoursByDay[dayKey] = [];
      }

      hoursByDay[dayKey].push(range);
    }
  }

  private normalizeWeekdayTextRange(value: string): string | null {
    if (!value) {
      return null;
    }

    const ascii = value
      .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-')
      .replace(/[\u2009\u202f\u00a0]/g, ' ')
      .trim();

    if (!ascii || /closed/i.test(ascii)) {
      return null;
    }

    if (/open\s+24\s+hours/i.test(ascii)) {
      return '00:00-23:59';
    }

    const times = Array.from(
      ascii.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi),
    );

    if (times.length < 2) {
      return null;
    }

    const [openMatch, closeMatch] = times;
    const closeMeridian =
      closeMatch[3]?.toUpperCase() ?? openMatch[3]?.toUpperCase();
    const openMeridian =
      openMatch[3]?.toUpperCase() ?? closeMatch[3]?.toUpperCase();

    const openTime = this.to24HourTime(
      openMatch[1],
      openMatch[2],
      openMeridian,
    );
    const closeTime = this.to24HourTime(
      closeMatch[1],
      closeMatch[2],
      closeMeridian,
    );

    if (!openTime || !closeTime) {
      return null;
    }

    return `${openTime}-${closeTime}`;
  }

  private normalizeDayKey(value: string): GoogleDayName | null {
    const normalized = value.trim().toLowerCase();
    return GOOGLE_DAY_NAMES.find((day) => normalized.startsWith(day)) ?? null;
  }

  private normalizeDayKeyFromIndex(
    index: number | undefined,
  ): GoogleDayName | null {
    if (typeof index !== 'number') {
      return null;
    }

    if (index < 0 || index >= GOOGLE_DAY_NAMES.length) {
      return null;
    }

    return GOOGLE_DAY_NAMES[index];
  }

  private formatV1HourMinute(
    hour: number | undefined,
    minute: number | undefined,
  ): string | null {
    if (typeof hour !== 'number' || !Number.isFinite(hour)) {
      return null;
    }
    if (hour < 0 || hour > 23) {
      return null;
    }

    const normalizedMinute =
      typeof minute === 'number' && Number.isFinite(minute) ? minute : 0;
    if (normalizedMinute < 0 || normalizedMinute > 59) {
      return null;
    }

    return `${hour.toString().padStart(2, '0')}:${normalizedMinute
      .toString()
      .padStart(2, '0')}`;
  }

  private formatGoogleTime(value: string | undefined): string | null {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!/^\d{3,4}$/.test(trimmed)) {
      return null;
    }

    const padded = trimmed.padStart(4, '0');
    const hours = padded.slice(0, 2);
    const minutes = padded.slice(2, 4);
    return `${hours}:${minutes}`;
  }

  private to24HourTime(
    hourValue: string | undefined,
    minuteValue: string | undefined,
    meridian: string | undefined,
  ): string | null {
    if (!hourValue) {
      return null;
    }

    let hour = Number(hourValue);
    if (!Number.isFinite(hour)) {
      return null;
    }

    let minutes = minuteValue ? Number(minuteValue) : 0;
    if (!Number.isFinite(minutes)) {
      minutes = 0;
    }

    const normalizedMeridian = meridian?.toUpperCase();
    if (normalizedMeridian === 'PM' && hour < 12) {
      hour += 12;
    } else if (normalizedMeridian === 'AM' && hour === 12) {
      hour = 0;
    }

    hour %= 24;

    return `${hour.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}`;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return { ...(value as Record<string, unknown>) };
  }

  private extractAddressParts(details: GooglePlacesV1Place): {
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  } {
    const components = details.addressComponents || [];

    const cityComponent = components.find((component) =>
      component.types?.some((type) =>
        [
          'locality',
          'postal_town',
          'sublocality',
          'sublocality_level_1',
        ].includes(type),
      ),
    );

    const regionComponent = components.find((component) =>
      component.types?.includes('administrative_area_level_1'),
    );

    const countryComponent = components.find((component) =>
      component.types?.includes('country'),
    );

    const postalCodeComponent = components.find((component) =>
      component.types?.includes('postal_code'),
    );

    return {
      city: cityComponent?.longText,
      region: regionComponent?.shortText || regionComponent?.longText,
      country: countryComponent?.shortText?.toUpperCase(),
      postalCode: postalCodeComponent?.longText,
    };
  }

  private extractCityFromAddress(address?: string | null): string | null {
    if (!address) return null;
    const parts = address.split(',');
    if (parts.length >= 2) {
      return parts[1].trim();
    }
    return null;
  }

  private extractRegionFromAddress(address?: string | null): string | null {
    if (!address) return null;
    const parts = address.split(',');
    if (parts.length >= 3) {
      const regionPart = parts[2].trim().split(' ')[0];
      return regionPart || null;
    }
    return null;
  }

  private extractCityFromMetadata(
    metadata: Prisma.JsonValue | null | undefined,
  ): string | null {
    const record = this.toRecord(metadata);
    const location = this.toRecord(record.location);
    if (typeof location.city === 'string') {
      return location.city;
    }
    return null;
  }

  private extractRegionFromMetadata(
    metadata: Prisma.JsonValue | null | undefined,
  ): string | null {
    const record = this.toRecord(metadata);
    const location = this.toRecord(record.location);
    if (typeof location.state === 'string') {
      return location.state;
    }
    if (typeof location.region === 'string') {
      return location.region;
    }
    return null;
  }

  private inferCountryFromAddress(address?: string | null): string | null {
    if (!address) {
      return null;
    }
    const lower = address.toLowerCase();
    if (lower.includes('united states') || lower.includes('usa')) {
      return 'US';
    }
    if (lower.includes('canada')) {
      return 'CA';
    }
    return null;
  }

  private normalizeGooglePriceRange(raw: unknown): {
    min: number | null;
    max: number | null;
    rawText: string | null;
    formattedText: string | null;
  } | null {
    if (raw === null || raw === undefined) {
      return null;
    }

    let rawText: string | null = null;
    if (typeof raw === 'string') {
      rawText = raw.trim();
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      rawText = `$${raw}`;
    }

    let min: number | null = null;
    let max: number | null = null;

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      min = raw;
      max = raw;
    } else if (typeof raw === 'string') {
      const matches = Array.from(raw.matchAll(/\d+(?:\.\d+)?/g));
      const numbers = matches
        .map((match) => Number(match[0]))
        .filter((value) => Number.isFinite(value));

      if (numbers.length === 1) {
        if (/under|less\s+than|up\s*to|^</i.test(raw)) {
          max = numbers[0];
        } else {
          min = numbers[0];
        }
      } else if (numbers.length >= 2) {
        min = Math.min(...numbers);
        max = Math.max(...numbers);
      }
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const record = raw as Record<string, unknown>;
      const startPrice = this.parseGoogleMoney(
        record.startPrice ?? record.start_price,
      );
      const endPrice = this.parseGoogleMoney(
        record.endPrice ?? record.end_price,
      );
      const minCandidate = this.pickFirstNumber(
        startPrice,
        record.min,
        record.minimum,
        record.low,
        record.lower,
        record.from,
        record.start,
      );
      const maxCandidate = this.pickFirstNumber(
        endPrice,
        record.max,
        record.maximum,
        record.high,
        record.upper,
        record.to,
        record.end,
      );
      min = minCandidate ?? null;
      max = maxCandidate ?? null;
      if (typeof record.text === 'string' && !rawText) {
        rawText = record.text.trim();
      }
    }

    const formattedText =
      min !== null && max !== null
        ? `$${min}-${max}`
        : max !== null
          ? `<$${max}`
          : min !== null
            ? `$${min}+`
            : rawText;

    return {
      min,
      max,
      rawText,
      formattedText: formattedText ?? null,
    };
  }

  private mapPriceRangeToLevel(
    range: {
      min: number | null;
      max: number | null;
      rawText?: string | null;
    } | null,
  ): number | null {
    if (!range) {
      return null;
    }

    const effective = range.max ?? range.min;
    if (effective === null || !Number.isFinite(effective)) {
      return null;
    }

    if (effective <= 0) {
      return 0;
    }
    if (effective <= 25) {
      return 1;
    }
    if (effective <= 50) {
      return 2;
    }
    if (effective <= 75) {
      return 3;
    }
    return 4;
  }

  private pickFirstNumber(...candidates: Array<unknown>): number | null {
    for (const candidate of candidates) {
      const value = this.toNumberValue(candidate);
      if (value !== undefined && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  private toNumberValue(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'units' in value
    ) {
      return (
        this.parseGoogleMoney(value as Record<string, unknown>) ?? undefined
      );
    }

    return undefined;
  }

  private parseGoogleMoney(raw: unknown): number | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const record = raw as Record<string, unknown>;
    const unitsValue = record.units ?? record.value;
    const nanosValue = record.nanos ?? record.nano ?? 0;
    const units = this.toNumberValue(unitsValue);
    const nanos = this.toNumberValue(nanosValue) ?? 0;

    if (units === undefined) {
      return null;
    }

    const total = units + nanos / 1_000_000_000;
    return Number.isFinite(total) ? total : null;
  }
}
