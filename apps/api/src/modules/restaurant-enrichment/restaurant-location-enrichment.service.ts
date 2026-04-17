import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Entity, EntityType, Prisma, RestaurantLocation } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { parse as parseDomain } from 'tldts';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityRepository } from '../../repositories/entity.repository';
import {
  GooglePlacesService,
  GooglePlacesV1AutocompleteSuggestion,
  GooglePlacesV1Place,
  GooglePlacesV1PlaceDetailsResponse,
} from '../external-integrations/google-places';
import { LoggerService } from '../../shared';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import { RankScoreRefreshQueueService } from '../content-processing/rank-score/rank-score-refresh.service';
import { MarketRegistryService } from '../markets/market-registry.service';
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';
import { RestaurantCuisineExtractionQueueService } from './restaurant-cuisine-extraction-queue.service';
import {
  GOOGLE_PLACE_TYPE_ATTRIBUTE_CANONICAL_NAMES,
  GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP,
} from './google-place-type-attributes';

const DEFAULT_COUNTRY = 'US';
const PREFERRED_PLACE_TYPES = new Set([
  'acai_shop',
  'afghani_restaurant',
  'african_restaurant',
  'american_restaurant',
  'asian_restaurant',
  'bagel_shop',
  'bakery',
  'bar',
  'bar_and_grill',
  'barbecue_restaurant',
  'brazilian_restaurant',
  'breakfast_restaurant',
  'brunch_restaurant',
  'buffet_restaurant',
  'cafe',
  'cafeteria',
  'candy_store',
  'cat_cafe',
  'chinese_restaurant',
  'chocolate_factory',
  'chocolate_shop',
  'coffee_shop',
  'confectionery',
  'deli',
  'dessert_restaurant',
  'dessert_shop',
  'diner',
  'dog_cafe',
  'donut_shop',
  'fast_food_restaurant',
  'fine_dining_restaurant',
  'food_court',
  'french_restaurant',
  'greek_restaurant',
  'hamburger_restaurant',
  'ice_cream_shop',
  'indian_restaurant',
  'indonesian_restaurant',
  'italian_restaurant',
  'japanese_restaurant',
  'juice_shop',
  'korean_restaurant',
  'lebanese_restaurant',
  'meal_delivery',
  'meal_takeaway',
  'mediterranean_restaurant',
  'mexican_restaurant',
  'middle_eastern_restaurant',
  'pizza_restaurant',
  'pub',
  'ramen_restaurant',
  'restaurant',
  'sandwich_shop',
  'seafood_restaurant',
  'spanish_restaurant',
  'steak_house',
  'sushi_restaurant',
  'tea_house',
  'thai_restaurant',
  'turkish_restaurant',
  'vegan_restaurant',
  'vegetarian_restaurant',
  'vietnamese_restaurant',
  'wine_bar',
]);
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
const GENERIC_WEBSITE_DOMAIN_DENYLIST = new Set([
  'doordash.com',
  'ubereats.com',
  'grubhub.com',
  'seamless.com',
  'toasttab.com',
  'toast.site',
  'square.site',
  'menufy.com',
  'opentable.com',
]);

type GoogleDayName = (typeof GOOGLE_DAY_NAMES)[number];

type GoogleRestaurantAttributeDefinition = {
  canonicalName: string;
  aliases: string[];
  isEnabled: (place: GooglePlacesV1Place) => boolean;
};

const GOOGLE_RESTAURANT_ATTRIBUTE_DEFINITIONS: GoogleRestaurantAttributeDefinition[] =
  [
    {
      canonicalName: 'allows dogs',
      aliases: [
        'dog friendly',
        'dog-friendly',
        'dogs allowed',
        'dogs welcome',
        'dogs ok',
        'pet friendly',
        'pet-friendly',
        'pets allowed',
        'pets welcome',
        'pets ok',
      ],
      isEnabled: (place) => place.allowsDogs === true,
    },
    {
      canonicalName: 'delivery',
      aliases: ['delivers', 'delivery available'],
      isEnabled: (place) => place.delivery === true,
    },
    {
      canonicalName: 'takeout',
      aliases: ['take out', 'pickup', 'pick up'],
      isEnabled: (place) => place.takeout === true,
    },
    {
      canonicalName: 'dine in',
      aliases: ['dine-in', 'dinein', 'dining in', 'dine inside'],
      isEnabled: (place) => place.dineIn === true,
    },
    {
      canonicalName: 'curbside pickup',
      aliases: ['curbside', 'curbside-pickup', 'curbside pick up'],
      isEnabled: (place) => place.curbsidePickup === true,
    },
    {
      canonicalName: 'good for children',
      aliases: [
        'child friendly',
        'child-friendly',
        'kid friendly',
        'kid-friendly',
        'kids welcome',
        'kids',
        'family-friendly',
        'family friendly',
        'good for kids',
      ],
      isEnabled: (place) => place.goodForChildren === true,
    },
    {
      canonicalName: 'good for groups',
      aliases: [
        'good for large groups',
        'large groups',
        'groups welcome',
        'large party',
        'large parties',
        'group friendly',
        'group-friendly',
        'good for groups of people',
      ],
      isEnabled: (place) => place.goodForGroups === true,
    },
    {
      canonicalName: 'good for watching sports',
      aliases: [
        'watch sports',
        'watch the game',
        'sports on tv',
        'games on tv',
        'sports tv',
        'sports viewing',
        'sports bar',
      ],
      isEnabled: (place) => place.goodForWatchingSports === true,
    },
    {
      canonicalName: 'live music',
      aliases: [
        'music',
        'live entertainment',
        'live performances',
        'live-music',
        'music venue',
      ],
      isEnabled: (place) => place.liveMusic === true,
    },
    {
      canonicalName: 'outdoor seating',
      aliases: [
        'patio',
        'patio seating',
        'outside seating',
        'al fresco',
        'alfresco',
        'outdoor dining',
        'outdoor-seating',
      ],
      isEnabled: (place) => place.outdoorSeating === true,
    },
    {
      canonicalName: 'serves beer',
      aliases: ['beer'],
      isEnabled: (place) => place.servesBeer === true,
    },
    {
      canonicalName: 'serves breakfast',
      aliases: ['breakfast'],
      isEnabled: (place) => place.servesBreakfast === true,
    },
    {
      canonicalName: 'serves brunch',
      aliases: ['brunch'],
      isEnabled: (place) => place.servesBrunch === true,
    },
    {
      canonicalName: 'serves cocktails',
      aliases: ['cocktails', 'mixed drinks', 'cocktail', 'cocktail bar'],
      isEnabled: (place) => place.servesCocktails === true,
    },
    {
      canonicalName: 'serves coffee',
      aliases: [
        'coffee',
        'coffee bar',
        'espresso',
        'espresso bar',
        'cafe',
        'café',
      ],
      isEnabled: (place) => place.servesCoffee === true,
    },
    {
      canonicalName: 'serves dinner',
      aliases: ['dinner'],
      isEnabled: (place) => place.servesDinner === true,
    },
    {
      canonicalName: 'serves dessert',
      aliases: [
        'dessert',
        'desserts',
        'dessert menu',
        'sweet treats',
        'sweets',
        'sweet',
      ],
      isEnabled: (place) => place.servesDessert === true,
    },
    {
      canonicalName: 'serves lunch',
      aliases: ['lunch'],
      isEnabled: (place) => place.servesLunch === true,
    },
    {
      canonicalName: 'serves vegetarian food',
      aliases: ['vegetarian', 'vegetarian friendly', 'vegetarian options'],
      isEnabled: (place) => place.servesVegetarianFood === true,
    },
    {
      canonicalName: 'serves wine',
      aliases: ['wine'],
      isEnabled: (place) => place.servesWine === true,
    },
  ];

const GOOGLE_RESTAURANT_ATTRIBUTE_CANONICAL_NAMES = Array.from(
  new Set(
    [
      ...GOOGLE_RESTAURANT_ATTRIBUTE_DEFINITIONS.map((definition) =>
        definition.canonicalName.trim().toLowerCase(),
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
}

export interface RestaurantEnrichmentOptions {
  force?: boolean;
  dryRun?: boolean;
  sessionToken?: string;
  overrideQuery?: string;
  countryFallback?: string;
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
  city?: string;
  region?: string;
  country?: string;
  locationBias?: { lat: number; lng: number; radiusMeters?: number };
}

interface PlaceCandidate {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
  types?: string[];
  distanceMeters?: number;
}

type RankedCandidate = {
  candidate: PlaceCandidate;
  score?: number;
};

type ResolvedPlaceMatch = {
  place: GooglePlacesV1Place;
  matchMetadata: MatchMetadata;
  score?: number;
};

@Injectable()
export class RestaurantLocationEnrichmentService {
  private readonly logger: LoggerService;
  private readonly transactionTimeoutMs: number;
  private readonly transactionMaxWaitMs: number;

  constructor(
    private readonly entityRepository: EntityRepository,
    private readonly prisma: PrismaService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly aliasManagementService: AliasManagementService,
    private readonly restaurantEntityMergeService: RestaurantEntityMergeService,
    private readonly marketRegistry: MarketRegistryService,
    private readonly rankScoreRefreshQueue: RankScoreRefreshQueueService,
    private readonly cuisineExtractionQueue: RestaurantCuisineExtractionQueueService,
    private readonly configService: ConfigService,
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

    return this.enrichRestaurant(entity, options);
  }

  async resolvePlaceForInput(params: {
    name: string;
    city?: string;
    region?: string;
    country?: string;
    locationBias?: { lat: number; lng: number; radiusMeters?: number };
    sessionToken?: string;
  }): Promise<{
    place: GooglePlacesV1Place;
    matchMetadata: MatchMetadata;
    score?: number;
  } | null> {
    const entity = {
      name: params.name,
      city: params.city ?? null,
      region: params.region ?? null,
      country: params.country ?? null,
      restaurantMetadata: null,
    } as RestaurantEntity;

    const searchContext = this.buildSearchContext(entity, {
      locationBias: params.locationBias,
      countryFallback: params.country,
      sessionToken: params.sessionToken,
    });

    if (!searchContext.query) {
      return null;
    }

    const autocomplete = await this.googlePlacesService.autocompletePlace(
      searchContext.query,
      {
        language: 'en',
        components: searchContext.country
          ? { country: searchContext.country }
          : undefined,
        sessionToken: params.sessionToken,
        locationBias: searchContext.locationBias,
        includeRaw: false,
      },
    );

    const candidates = this.extractAutocompleteCandidates(
      autocomplete.suggestions,
    );
    let ranked = this.rankCandidates(candidates);
    let matchSource: 'autocomplete' | 'find_place' = 'autocomplete';
    let fallbackStatus: string | undefined;

    if (ranked.length === 0) {
      const fallbackResult = await this.tryFindPlaceFallback(
        entity,
        searchContext,
        {
          locationBias: searchContext.locationBias,
          countryFallback: params.country,
          sessionToken: params.sessionToken,
        },
      );

      if (fallbackResult) {
        fallbackStatus = fallbackResult.status;
        ranked = fallbackResult.ranked;
        if (ranked.length > 0) {
          matchSource = 'find_place';
        }
      } else {
        fallbackStatus = 'error';
      }
    }

    const best = this.selectQualifiedCandidate(ranked, entity);
    if (!best) {
      if (fallbackStatus) {
        this.logger.debug('Place match failed after fallback', {
          name: params.name,
          fallbackStatus,
        });
      }
      return null;
    }

    const details = await this.googlePlacesService.getPlaceDetails(
      best.candidate.placeId,
      { includeRaw: true },
    );

    if (!details.place) {
      return null;
    }

    const placeDetails = details.place;
    if (typeof placeDetails.id !== 'string' || !placeDetails.id.trim()) {
      placeDetails.id = best.candidate.placeId;
    }

    const matchMetadata: MatchMetadata = {
      query: searchContext.query ?? '',
      predictionDescription: best.candidate.description,
      mainText: best.candidate.mainText,
      secondaryText: best.candidate.secondaryText,
      candidateTypes: best.candidate.types,
      predictionsConsidered: ranked.length,
      timestamp: new Date().toISOString(),
      source: matchSource,
    };

    const override = await this.resolveOutOfMarketSearchTextOverride({
      entity,
      context: searchContext,
      sessionToken: params.sessionToken,
      selectedCandidate: best.candidate,
      selectedPlace: placeDetails,
      selectedMatchSource: matchSource,
    });

    if (override) {
      return override;
    }

    return {
      place: placeDetails,
      matchMetadata,
    };
  }

  async buildRestaurantCreateInput(params: {
    name: string;
    marketKey: string;
    place: GooglePlacesV1Place;
    matchMetadata: MatchMetadata;
    alias?: string | null;
  }): Promise<Prisma.EntityCreateInput> {
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

    return {
      ...createUpdateData,
      name: displayName,
      type: EntityType.restaurant,
      canonicalDomain:
        this.resolveTrustedWebsiteDomain(params.place.websiteUri) ?? undefined,
      aliases: alias,
      marketPresences: {
        create: [
          {
            marketKey: this.normalizeRequiredMarketKey(params.marketKey),
          },
        ],
      },
      restaurantAttributes: mergedRestaurantAttributes,
      restaurantQualityScore: 0,
      generalPraiseUpvotes: 0,
    };
  }

  buildLocationCreateInput(
    restaurantId: string,
    place: GooglePlacesV1Place,
  ): Prisma.RestaurantLocationUncheckedCreateInput {
    return this.buildLocationUpsertData(restaurantId, null, place).create;
  }

  private async enrichRestaurant(
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

    const searchContext = this.buildSearchContext(entity, options);
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
      );
      return {
        entityId: entity.entityId,
        status: 'skipped',
        reason: 'insufficient location context',
      };
    }

    try {
      const autocomplete = await this.googlePlacesService.autocompletePlace(
        searchContext.query,
        {
          language: 'en',
          components: searchContext.country
            ? { country: searchContext.country }
            : undefined,
          sessionToken: options.sessionToken,
          locationBias: searchContext.locationBias,
          includeRaw: false,
        },
      );

      const candidates = this.extractAutocompleteCandidates(
        autocomplete.suggestions,
      );

      let ranked = this.rankCandidates(candidates);

      let matchSource: 'autocomplete' | 'find_place' = 'autocomplete';
      let fallbackAttempted = false;
      let fallbackStatus: string | undefined;

      if (ranked.length === 0) {
        fallbackAttempted = true;
        const fallbackResult = await this.tryFindPlaceFallback(
          entity,
          searchContext,
          options,
        );

        if (fallbackResult) {
          fallbackStatus = fallbackResult.status;
          ranked = fallbackResult.ranked;
          if (ranked.length > 0) {
            matchSource = 'find_place';
          }
        } else {
          fallbackStatus = 'error';
        }

        if (ranked.length === 0) {
          const noMatchMetadata = this.buildNoMatchMetadata(
            ranked,
            searchContext,
            {
              fallbackAttempted: true,
              fallbackStatus,
            },
          );
          await this.recordNoMatchCandidates(
            entity,
            'no predictions returned',
            noMatchMetadata,
          );
          return {
            entityId: entity.entityId,
            status: 'no_match',
            reason: 'no predictions returned',
          };
        }
      }

      const best = this.selectQualifiedCandidate(ranked, entity);

      if (!best) {
        const noMatchMetadata = this.buildNoMatchMetadata(
          ranked,
          searchContext,
          fallbackAttempted
            ? {
                fallbackAttempted: true,
                fallbackStatus,
                fallbackUsed: matchSource === 'find_place',
              }
            : undefined,
        );
        const reason = 'no prediction matched preferred place types';
        await this.recordNoMatchCandidates(entity, reason, noMatchMetadata);
        return {
          entityId: entity.entityId,
          status: 'no_match',
          reason,
        };
      }

      const details = await this.googlePlacesService.getPlaceDetails(
        best.candidate.placeId,
        { includeRaw: true },
      );
      latestDetails = details;

      if (!details.place) {
        const noMatchMetadata = this.buildNoMatchMetadata(
          ranked,
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
        placeDetails.id = best.candidate.placeId;
      }
      enrichmentScore = best.score;

      const matchMetadata: MatchMetadata = {
        query: searchContext.query ?? '',
        predictionDescription: best.candidate.description,
        mainText: best.candidate.mainText,
        secondaryText: best.candidate.secondaryText,
        candidateTypes: best.candidate.types,
        predictionsConsidered: ranked.length,
        timestamp: new Date().toISOString(),
        source: matchSource,
      };
      latestMatchMetadata = matchMetadata;

      const override = await this.resolveOutOfMarketSearchTextOverride({
        entity,
        context: searchContext,
        sessionToken: options.sessionToken,
        selectedCandidate: best.candidate,
        selectedPlace: placeDetails,
        selectedMatchSource: matchSource,
      });

      if (override) {
        latestDetails = {
          place: override.place,
          metadata: details.metadata,
          raw: details.raw,
        };
        latestMatchMetadata = override.matchMetadata;
        enrichmentScore = override.score;
      }

      const resolvedPlaceDetails = override?.place ?? placeDetails;
      const resolvedMatchMetadata = override?.matchMetadata ?? matchMetadata;

      const { updateData, updatedFields } = this.buildEntityUpdate(
        entity,
        resolvedPlaceDetails,
        details.metadata.fieldMask,
        resolvedMatchMetadata,
      );
      const { updateData: aliasUpdate, updatedFields: aliasFields } =
        this.computeNameAndAliasUpdate(
          entity,
          this.getPlaceDisplayName(resolvedPlaceDetails),
        );
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

      this.logger.info('Restaurant enriched with Google Places', {
        entityId: entity.entityId,
        placeId: placeDetails.id,
        score: best.score,
        updatedFields: combinedUpdatedFields,
      });

      const marketPresence = await this.reconcileMarketPresenceForEntity({
        entity,
        placeDetails,
        context: 'enrichment_update',
      });
      if (marketPresence?.mergedInto) {
        await this.cuisineExtractionQueue.queueExtraction(
          marketPresence.mergedInto,
          {
            source: 'google_places_enrichment',
          },
        );
        return {
          entityId: entity.entityId,
          mergedInto: marketPresence.mergedInto,
          status: 'updated',
          placeId: placeDetails.id,
          score: best.score,
          updatedFields: combinedUpdatedFields,
        };
      }
      const trustedCanonicalDomain =
        this.resolveTrustedWebsiteDomain(placeDetails.websiteUri) ??
        this.resolveTrustedWebsiteDomain(combinedUpdateData.canonicalDomain) ??
        this.resolveTrustedWebsiteDomain(entity.canonicalDomain);
      const resolvedMarketKey =
        marketPresence?.resolvedMarketKey ??
        (await this.resolveMarketKeyFromPlace(placeDetails));
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

      await this.enrichSecondaryLocations(
        secondaryLocationTarget,
        placeDetails,
        options.locationBias,
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
      this.logger.error('Failed to enrich restaurant', {
        entityId: entity.entityId,
        error: message,
      });

      await this.recordEnrichmentFailure(entity, message, {
        placeId: latestDetails?.place?.id,
        targetName: targetNameForUpdate ?? undefined,
        score: enrichmentScore || undefined,
        matchMetadata: latestMatchMetadata ?? undefined,
      });

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

  private computeNameAndAliasUpdate(
    entity: RestaurantEntity,
    canonicalName?: string | null,
    extraAliases: string[] = [],
  ): {
    updateData: Prisma.EntityUpdateInput;
    updatedFields: string[];
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
      updatedFields.push('name');
      aliasSources.add(entity.name);
    }

    const aliasResult = this.aliasManagementService.mergeAliases(
      entity.aliases ?? [],
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

    if (!this.aliasListsEqual(entity.aliases ?? [], mergedAliases)) {
      updateData.aliases = mergedAliases;
      updatedFields.push('aliases');
    }

    return { updateData, updatedFields };
  }

  private normalizeName(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed.toLowerCase() : null;
  }

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

  private aliasListsEqual(current: string[], next: string[]): boolean {
    if (current.length !== next.length) {
      return false;
    }

    const counts = new Map<string, number>();
    for (const alias of current) {
      counts.set(alias, (counts.get(alias) ?? 0) + 1);
    }

    for (const alias of next) {
      const existing = counts.get(alias);
      if (!existing) {
        return false;
      }
      if (existing === 1) {
        counts.delete(alias);
      } else {
        counts.set(alias, existing - 1);
      }
    }

    return counts.size === 0;
  }

  private collectAliasCandidates(entity: RestaurantEntity): string[] {
    const aliases = new Set<string>();
    if (entity.name?.trim()) {
      aliases.add(entity.name.trim());
    }
    for (const alias of entity.aliases ?? []) {
      if (alias && alias.trim().length) {
        aliases.add(alias.trim());
      }
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

    const [canonicalMarketKeys, duplicateMarketKeys] = await Promise.all([
      this.listMarketKeysForRestaurantEntity(canonical.entityId),
      this.listMarketKeysForRestaurantEntity(entity.entityId),
    ]);
    if (canonicalMarketKeys.join('|') !== duplicateMarketKeys.join('|')) {
      this.logger.warn('Google Place collision across seed market keys', {
        placeId,
        canonicalId: canonical.entityId,
        canonicalMarketKeys,
        duplicateId: entity.entityId,
        duplicateMarketKeys,
      });
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

    const updatedCanonical = await this.prisma.$transaction(
      async (tx) => {
        const location = await tx.restaurantLocation.update({
          where: { locationId: canonicalLocation.locationId },
          data: {
            ...locationUpsert.update,
            restaurantId: canonical.entityId,
            isPrimary: true,
            updatedAt: new Date(),
          } as Prisma.RestaurantLocationUncheckedUpdateInput,
        });

        const canonicalWithLocation =
          await this.restaurantEntityMergeService.mergeDuplicateRestaurant({
            canonical,
            duplicate: entity,
            canonicalUpdate: {
              ...mergedUpdate,
              primaryLocation: { connect: { locationId: location.locationId } },
            },
          });

        return canonicalWithLocation;
      },
      {
        timeout: this.transactionTimeoutMs,
        maxWait: this.transactionMaxWaitMs,
      },
    );

    const previousMarketKeys = await this.listMarketKeysForRestaurantEntity(
      updatedCanonical.entityId,
    );
    const syncedMarketKeys = await this.syncRestaurantMarketPresences({
      restaurantId: updatedCanonical.entityId,
      pruneToVerifiedLocationsOnly: true,
    });
    await this.rankScoreRefreshQueue.queueRefreshForMarkets(
      [...previousMarketKeys, ...syncedMarketKeys],
      { source: 'google_place_collision', force: true },
    );

    this.logger.info('Merged restaurant into canonical entity', {
      duplicateId: entity.entityId,
      canonicalId: updatedCanonical.entityId,
      placeId,
      updatedFields: mergedFields,
    });

    const marketPresence = await this.reconcileMarketPresenceForEntity({
      entity: updatedCanonical,
      placeDetails,
      context: 'place_collision',
    });
    const mergedInto = marketPresence?.mergedInto ?? updatedCanonical.entityId;
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
      this.resolveTrustedWebsiteDomain(placeDetails.websiteUri) ??
      this.resolveTrustedWebsiteDomain(entity.canonicalDomain);
    const marketKey = await this.resolveMarketKeyFromPlace(placeDetails);
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
              name:
                resolvedName ??
                this.getPlaceDisplayName(placeDetails) ??
                undefined,
              ...(marketKey
                ? {
                    marketPresences: {
                      some: { marketKey },
                    },
                  }
                : {}),
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

    const updatedCanonical = await this.prisma.$transaction(
      async (tx) => {
        const location = await this.upsertPrimaryLocation({
          tx,
          restaurantId: canonical.entityId,
          placeDetails,
          locationUpsert,
          targetLocation,
        });

        const mergedCanonical =
          await this.restaurantEntityMergeService.mergeDuplicateRestaurant({
            canonical,
            duplicate: entity,
            canonicalUpdate: {
              ...mergedUpdate,
              primaryLocation: { connect: { locationId: location.locationId } },
            },
          });

        return mergedCanonical;
      },
      {
        timeout: this.transactionTimeoutMs,
        maxWait: this.transactionMaxWaitMs,
      },
    );

    const previousMarketKeys = await this.listMarketKeysForRestaurantEntity(
      updatedCanonical.entityId,
    );
    const syncedMarketKeys = await this.syncRestaurantMarketPresences({
      restaurantId: updatedCanonical.entityId,
      pruneToVerifiedLocationsOnly: true,
    });
    await this.rankScoreRefreshQueue.queueRefreshForMarkets(
      [...previousMarketKeys, ...syncedMarketKeys],
      { source: 'google_place_name_conflict', force: true },
    );

    this.logger.info('Merged restaurant into existing canonical by name', {
      duplicateId: entity.entityId,
      canonicalId: updatedCanonical.entityId,
      targetName: resolvedName ?? this.getPlaceDisplayName(placeDetails),
    });

    const marketPresence = await this.reconcileMarketPresenceForEntity({
      entity: updatedCanonical,
      placeDetails,
      context: 'name_collision',
    });
    const mergedInto = marketPresence?.mergedInto ?? updatedCanonical.entityId;
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
      this.resolveTrustedWebsiteDomain(params.placeDetails.websiteUri) ??
      this.resolveTrustedWebsiteDomain(params.entity.canonicalDomain);
    if (!canonicalDomain) {
      return null;
    }

    const canonical = await this.prisma.entity.findFirst({
      where: {
        type: EntityType.restaurant,
        canonicalDomain,
        entityId: { not: params.entity.entityId },
      },
      include: { primaryLocation: true, locations: true },
      orderBy: [{ createdAt: 'asc' }, { entityId: 'asc' }],
    });

    if (!canonical) {
      return null;
    }

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

    const previousMarketKeys = await this.listMarketKeysForRestaurantEntity(
      refreshedCanonical.entityId,
    );
    const syncedMarketKeys = await this.syncRestaurantMarketPresences({
      restaurantId: refreshedCanonical.entityId,
      pruneToVerifiedLocationsOnly: true,
    });

    this.logger.info('Merged restaurant into canonical entity by domain', {
      duplicateId: params.entity.entityId,
      canonicalId: refreshedCanonical.entityId,
      canonicalDomain,
      score: params.score,
    });

    await this.rankScoreRefreshQueue.queueRefreshForMarkets(
      [...previousMarketKeys, ...syncedMarketKeys],
      {
        source: 'restaurant_domain_merge',
        force: true,
      },
    );

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

  private normalizeWebsiteDomain(value: unknown): string | null {
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

  private resolveTrustedWebsiteDomain(value: unknown): string | null {
    const domain = this.normalizeWebsiteDomain(value);
    if (!domain) {
      return null;
    }
    return this.isTrustedWebsiteDomain(domain) ? domain : null;
  }

  private isTrustedWebsiteDomain(domain: string | null | undefined): boolean {
    if (!domain) {
      return false;
    }

    const normalized = domain.trim().toLowerCase();
    if (!normalized.length) {
      return false;
    }

    return !GENERIC_WEBSITE_DOMAIN_DENYLIST.has(normalized);
  }

  private normalizeCountryCodeForAutocomplete(
    country?: string | null,
  ): string | undefined {
    if (!country) {
      return undefined;
    }
    const trimmed = country.trim();
    return trimmed ? trimmed.toLowerCase() : undefined;
  }

  private buildSearchContext(
    entity: RestaurantEntity,
    options: RestaurantEnrichmentOptions,
  ): EnrichmentSearchContext {
    const countrySource =
      entity.country ??
      entity.primaryLocation?.country ??
      options.countryFallback ??
      this.inferCountryFromAddress(
        entity.primaryLocation?.address ?? entity.address,
      ) ??
      DEFAULT_COUNTRY;
    const normalizedCountry =
      this.normalizeCountryCodeForAutocomplete(countrySource);

    if (options.overrideQuery) {
      return {
        query: options.overrideQuery,
        city: entity.city ?? undefined,
        region: entity.region ?? undefined,
        country: normalizedCountry,
        locationBias: options.locationBias ?? this.buildLocationBias(entity),
      };
    }

    const parts: string[] = [entity.name];

    const primaryLocation = entity.primaryLocation;
    const city =
      entity.city ||
      primaryLocation?.city ||
      this.extractCityFromAddress(primaryLocation?.address ?? entity.address) ||
      this.extractCityFromMetadata(entity.restaurantMetadata);

    const region =
      entity.region ||
      primaryLocation?.region ||
      this.extractRegionFromAddress(
        primaryLocation?.address ?? entity.address,
      ) ||
      this.extractRegionFromMetadata(entity.restaurantMetadata);

    if (city) {
      parts.push(city);
    }

    if (region) {
      parts.push(region);
    }

    const query = parts.filter(Boolean).join(' ');
    return {
      query: query.trim().length ? query : null,
      city: city ?? undefined,
      region: region ?? undefined,
      country: normalizedCountry,
      locationBias: options.locationBias ?? this.buildLocationBias(entity),
    };
  }

  private buildLocationBias(
    entity: RestaurantEntity,
  ): { lat: number; lng: number; radiusMeters?: number } | undefined {
    const lat =
      this.toNumberValue(entity.primaryLocation?.latitude) ??
      this.toNumberValue(entity.latitude);
    const lng =
      this.toNumberValue(entity.primaryLocation?.longitude) ??
      this.toNumberValue(entity.longitude);
    if (
      lat !== undefined &&
      lng !== undefined &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return { lat, lng };
    }
    return undefined;
  }

  private async enrichSecondaryLocations(
    entity: RestaurantEntity,
    placeDetails: GooglePlacesV1Place,
    locationBias?: { lat: number; lng: number; radiusMeters?: number },
  ): Promise<void> {
    try {
      const canonicalDomain =
        this.resolveTrustedWebsiteDomain(placeDetails.websiteUri) ??
        (this.isTrustedWebsiteDomain(entity.canonicalDomain)
          ? entity.canonicalDomain!.trim().toLowerCase()
          : null);
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

        for (const place of response.places) {
          if (!place?.id || seenPlaceIds.has(place.id)) {
            continue;
          }
          const candidateDomain = this.resolveTrustedWebsiteDomain(
            place.websiteUri,
          );
          if (!candidateDomain || candidateDomain !== canonicalDomain) {
            continue;
          }
          if (
            typeof place.location?.latitude !== 'number' ||
            typeof place.location?.longitude !== 'number' ||
            typeof place.formattedAddress !== 'string'
          ) {
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
          if (totalProcessed >= 60) {
            break;
          }
        }

        if (!response.nextPageToken || totalProcessed >= 60) {
          break;
        }

        pageToken = response.nextPageToken;
        await this.delay(2000);
      } while (pageToken);

      await this.syncRestaurantMarketPresences({
        restaurantId: entity.entityId,
        pruneToVerifiedLocationsOnly: true,
      });
    } catch (error) {
      this.logger.warn('Failed to enrich secondary locations', {
        entityId: entity.entityId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async listLocationDerivedMarketKeysForRestaurantEntity(
    restaurantId: string,
  ): Promise<string[]> {
    const locations = await this.prisma.restaurantLocation.findMany({
      where: {
        restaurantId,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        latitude: true,
        longitude: true,
      },
    });

    const resolved = await Promise.all(
      locations.map((location) =>
        this.marketRegistry.resolveOrEnsureForLocation({
          userLocation: {
            lat: Number(location.latitude),
            lng: Number(location.longitude),
          },
        }),
      ),
    );

    return Array.from(
      new Set(
        resolved
          .map((result) => this.normalizeMarketKey(result?.marketKey ?? null))
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  private async listMarketKeysForRestaurantEntity(
    restaurantId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.entityMarketPresence.findMany({
      where: { entityId: restaurantId },
      select: { marketKey: true },
      orderBy: [{ createdAt: 'asc' }, { marketKey: 'asc' }],
    });

    return Array.from(
      new Set(
        rows
          .map((row) => this.normalizeMarketKey(row.marketKey))
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  private async syncRestaurantMarketPresences(params: {
    restaurantId: string;
    seedMarketKeys?: Array<string | null | undefined>;
    tx?: Prisma.TransactionClient;
    pruneToVerifiedLocationsOnly?: boolean;
  }): Promise<string[]> {
    const delegate = params.tx ?? this.prisma;
    const pruneToVerifiedLocationsOnly =
      params.pruneToVerifiedLocationsOnly === true;
    const seedMarketKeys = Array.from(
      new Set(
        (params.seedMarketKeys ?? [])
          .map((value) => this.normalizeMarketKey(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const locationDerivedMarketKeys =
      await this.listLocationDerivedMarketKeysForRestaurantEntity(
        params.restaurantId,
      );
    const desiredMarketKeys = pruneToVerifiedLocationsOnly
      ? locationDerivedMarketKeys
      : Array.from(new Set([...seedMarketKeys, ...locationDerivedMarketKeys]));

    const existingRows = await delegate.entityMarketPresence.findMany({
      where: { entityId: params.restaurantId },
      select: { marketKey: true },
    });
    const existing = new Set(
      existingRows
        .map((row) => this.normalizeMarketKey(row.marketKey))
        .filter((value): value is string => Boolean(value)),
    );

    if (pruneToVerifiedLocationsOnly) {
      const desiredSet = new Set(desiredMarketKeys);
      const staleMarketKeys = Array.from(existing).filter(
        (marketKey) => !desiredSet.has(marketKey),
      );
      if (staleMarketKeys.length > 0) {
        await delegate.entityMarketPresence.deleteMany({
          where: {
            entityId: params.restaurantId,
            marketKey: { in: staleMarketKeys },
          },
        });
        staleMarketKeys.forEach((marketKey) => existing.delete(marketKey));
      }
    }

    if (!desiredMarketKeys.length) {
      return [];
    }

    for (const marketKey of desiredMarketKeys) {
      if (existing.has(marketKey)) {
        continue;
      }
      await delegate.entityMarketPresence.create({
        data: {
          entityId: params.restaurantId,
          marketKey,
        },
      });
      existing.add(marketKey);
    }

    return desiredMarketKeys;
  }

  private resolveIncludedType(primaryType?: string | null): string | null {
    if (primaryType && PREFERRED_PLACE_TYPES.has(primaryType)) {
      return primaryType;
    }
    return null;
  }

  private normalizePlaceName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private normalizePlaceNameCompact(value: string): string {
    return this.normalizePlaceName(value).replace(/\s+/g, '');
  }

  private tokenizeNormalizedPlaceName(value: string): string[] {
    const normalized = this.normalizePlaceName(value);
    return normalized.length > 0 ? normalized.split(/\s+/).filter(Boolean) : [];
  }

  private singularizePlaceToken(token: string): string {
    if (token.endsWith('ies') && token.length > 3) {
      return `${token.slice(0, -3)}y`;
    }
    if (token.endsWith('s') && token.length > 3) {
      return token.slice(0, -1);
    }
    return token;
  }

  private calculateLevenshteinDistance(left: string, right: string): number {
    if (left === right) {
      return 0;
    }
    if (left.length === 0) {
      return right.length;
    }
    if (right.length === 0) {
      return left.length;
    }

    const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
    const current = new Array<number>(right.length + 1);

    for (let row = 1; row <= left.length; row += 1) {
      current[0] = row;
      for (let col = 1; col <= right.length; col += 1) {
        const cost = left[row - 1] === right[col - 1] ? 0 : 1;
        current[col] = Math.min(
          current[col - 1] + 1,
          previous[col] + 1,
          previous[col - 1] + cost,
        );
      }
      for (let col = 0; col <= right.length; col += 1) {
        previous[col] = current[col];
      }
    }

    return previous[right.length];
  }

  private isLooselyEquivalentPlaceToken(left: string, right: string): boolean {
    if (!left || !right) {
      return false;
    }

    if (left === right) {
      return true;
    }

    if (left.startsWith(right) || right.startsWith(left)) {
      return true;
    }

    return this.calculateLevenshteinDistance(left, right) <= 1;
  }

  private isSalientSearchTextCandidateNameMatch(
    candidateName: string,
    requestedName: string,
  ): boolean {
    const candidateTokens = this.tokenizeNormalizedPlaceName(candidateName).map(
      (token) => this.singularizePlaceToken(token),
    );
    const requestedTokens = this.tokenizeNormalizedPlaceName(requestedName).map(
      (token) => this.singularizePlaceToken(token),
    );

    if (candidateTokens.length === 0 || requestedTokens.length === 0) {
      return false;
    }

    const longestRequestedTokenLength = Math.max(
      ...requestedTokens.map((token) => token.length),
    );
    const anchorTokens = requestedTokens.filter(
      (token) => token.length === longestRequestedTokenLength,
    );

    for (const anchorToken of anchorTokens) {
      if (
        candidateTokens.some((candidateToken) =>
          this.isLooselyEquivalentPlaceToken(candidateToken, anchorToken),
        )
      ) {
        return true;
      }
    }

    return false;
  }

  private isCanonicalPlaceMatch(
    place: GooglePlacesV1Place,
    canonicalName: string,
  ): boolean {
    const candidateName = this.getPlaceDisplayName(place);
    if (!candidateName) {
      return false;
    }
    const normalizedCandidate = this.normalizePlaceName(candidateName);
    const normalizedCanonical = this.normalizePlaceName(canonicalName);

    if (normalizedCandidate === normalizedCanonical) {
      return true;
    }

    const lowerCandidate = candidateName.trim().toLowerCase();
    const lowerCanonical = canonicalName.trim().toLowerCase();
    if (!lowerCandidate.startsWith(lowerCanonical)) {
      return false;
    }

    const suffix = lowerCandidate.slice(lowerCanonical.length);
    return this.isDelimiterSuffix(suffix);
  }

  private isDelimiterSuffix(value: string): boolean {
    const trimmed = value.trimStart();
    if (!trimmed) {
      return false;
    }
    if (trimmed.startsWith('at ')) {
      return true;
    }
    return (
      trimmed.startsWith('-') ||
      trimmed.startsWith('–') ||
      trimmed.startsWith('—') ||
      trimmed.startsWith('(') ||
      trimmed.startsWith('@') ||
      trimmed.startsWith('/')
    );
  }

  private isRestaurantishPlaceTypes(types?: string[]): boolean {
    return (
      Array.isArray(types) &&
      types.some((type) => PREFERRED_PLACE_TYPES.has(type.toLowerCase()))
    );
  }

  private normalizeMarketKey(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length ? normalized : null;
  }

  private normalizeRequiredMarketKey(value?: string | null): string {
    const normalized = this.normalizeMarketKey(value);
    if (!normalized) {
      throw new Error('Restaurant market key is required');
    }
    return normalized;
  }

  private async resolveMarketKeyFromPlace(
    placeDetails: GooglePlacesV1Place,
  ): Promise<string | null> {
    const latitude = placeDetails.location?.latitude;
    const longitude = placeDetails.location?.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const resolved = await this.marketRegistry.resolveOrEnsureForLocation({
      userLocation: {
        lat: latitude as number,
        lng: longitude as number,
      },
    });

    return this.normalizeMarketKey(resolved?.marketKey ?? null);
  }

  private async reconcileMarketPresenceForEntity(params: {
    entity: RestaurantEntity;
    placeDetails: GooglePlacesV1Place;
    context: string;
  }): Promise<{
    resolvedMarketKey: string | null;
    mergedInto?: string;
  } | null> {
    const currentMarketKeys = await this.listMarketKeysForRestaurantEntity(
      params.entity.entityId,
    );
    const targetKey = await this.resolveMarketKeyFromPlace(params.placeDetails);

    if (!targetKey || currentMarketKeys.includes(targetKey)) {
      return null;
    }

    const name = params.entity.name?.trim();
    if (!name) {
      return null;
    }

    const conflict = await this.prisma.entity.findFirst({
      where: {
        entityId: { not: params.entity.entityId },
        type: EntityType.restaurant,
        name,
        marketPresences: {
          some: { marketKey: targetKey },
        },
      },
      select: { entityId: true },
    });

    if (conflict) {
      const canonical = await this.prisma.entity.findUnique({
        where: { entityId: conflict.entityId },
        include: { primaryLocation: true, locations: true },
      });

      if (!canonical) {
        this.logger.warn(
          'Market-presence reconciliation conflict missing canonical entity',
          {
            entityId: params.entity.entityId,
            conflictEntityId: conflict.entityId,
            context: params.context,
          },
        );
        return null;
      }

      const placeId =
        typeof params.placeDetails.id === 'string'
          ? params.placeDetails.id.trim()
          : '';
      if (!placeId) {
        this.logger.warn(
          'Market-presence reconciliation conflict missing place id',
          {
            entityId: params.entity.entityId,
            canonicalId: canonical.entityId,
            currentMarketKeys,
            targetMarketKey: targetKey,
            context: params.context,
          },
        );
        return null;
      }

      const canonicalPlaceId = this.getOwnedPlaceId(canonical);
      let placeIdMatches = canonicalPlaceId === placeId;

      if (!placeIdMatches) {
        const canonicalLocation =
          await this.prisma.restaurantLocation.findFirst({
            where: {
              restaurantId: canonical.entityId,
              googlePlaceId: placeId,
            },
            select: { locationId: true },
          });
        placeIdMatches = Boolean(canonicalLocation);
      }

      if (!placeIdMatches) {
        this.logger.warn(
          'Market-presence reconciliation conflict skipped due to place id mismatch',
          {
            entityId: params.entity.entityId,
            canonicalId: canonical.entityId,
            placeId,
            canonicalPlaceId,
            currentMarketKeys,
            targetMarketKey: targetKey,
            context: params.context,
          },
        );
        return null;
      }

      const canonicalAliasUpdate = this.computeNameAndAliasUpdate(
        canonical,
        this.getPlaceDisplayName(params.placeDetails),
        this.collectAliasCandidates(params.entity),
      );
      const mergeAugmentations = this.buildCanonicalMergeAugmentations(
        canonical,
        params.entity,
      );
      const mergedUpdate = this.mergeEntityUpdates(
        canonicalAliasUpdate.updateData,
        mergeAugmentations.updateData,
      );

      const mergedCanonical =
        await this.restaurantEntityMergeService.mergeDuplicateRestaurant({
          canonical,
          duplicate: params.entity,
          canonicalUpdate: mergedUpdate,
        });

      await this.syncRestaurantMarketPresences({
        restaurantId: mergedCanonical.entityId,
        pruneToVerifiedLocationsOnly: true,
      });

      this.logger.info('Market-presence merge completed', {
        entityId: params.entity.entityId,
        mergedInto: mergedCanonical.entityId,
        currentMarketKeys,
        targetMarketKey: targetKey,
        context: params.context,
      });

      await this.rankScoreRefreshQueue.queueRefreshForMarkets(
        [...currentMarketKeys, targetKey],
        { source: 'enrichment' },
      );

      return {
        resolvedMarketKey: targetKey,
        mergedInto: mergedCanonical.entityId,
      };
    }

    this.logger.info(
      'Resolved restaurant market presence from place geometry',
      {
        entityId: params.entity.entityId,
        currentMarketKeys,
        targetMarketKey: targetKey,
        context: params.context,
      },
    );

    await this.syncRestaurantMarketPresences({
      restaurantId: params.entity.entityId,
      pruneToVerifiedLocationsOnly: true,
    });

    await this.rankScoreRefreshQueue.queueRefreshForMarkets(
      [...currentMarketKeys, targetKey],
      { source: 'enrichment' },
    );

    return { resolvedMarketKey: targetKey };
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

  private extractGoogleRestaurantAttributeDefinitions(
    place: GooglePlacesV1Place,
  ): GoogleRestaurantAttributeDefinition[] {
    return GOOGLE_RESTAURANT_ATTRIBUTE_DEFINITIONS.filter((definition) =>
      definition.isEnabled(place),
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
    definitions: GoogleRestaurantAttributeDefinition[],
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
      const entityId = idsByName.get(canonicalName);
      if (!entityId) {
        this.logger.warn('Missing seeded restaurant_attribute entity', {
          canonicalName,
          type: EntityType.restaurant_attribute,
        });
        continue;
      }
      ids.push(entityId);
    }

    return Array.from(new Set(ids));
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
      const entityId = idsByName.get(canonicalName);
      if (!entityId) {
        this.logger.warn('Missing seeded restaurant_attribute entity', {
          canonicalName,
          type: EntityType.restaurant_attribute,
        });
        continue;
      }
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
      if (typeof prediction?.distanceMeters === 'number') {
        candidate.distanceMeters = prediction.distanceMeters;
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

  private selectQualifiedCandidate(
    ranked: RankedCandidate[],
    entity: RestaurantEntity,
  ): RankedCandidate | undefined {
    for (const entry of ranked) {
      const types = entry.candidate.types;
      if (
        this.isRestaurantishPlaceTypes(types) &&
        this.isPrimaryCandidateNameMatch(entry.candidate, entity.name)
      ) {
        return entry;
      }
    }
    return undefined;
  }

  private isPrimaryCandidateNameMatch(
    candidate: PlaceCandidate,
    requestedName: string,
  ): boolean {
    const candidateName =
      candidate.mainText || candidate.description?.split(',')[0] || '';
    if (!candidateName.trim() || !requestedName.trim()) {
      return false;
    }

    if (
      this.isCanonicalPlaceMatch(
        { displayName: { text: candidateName } },
        requestedName,
      )
    ) {
      return true;
    }

    const normalizedCandidate = this.normalizePlaceNameCompact(candidateName);
    const normalizedRequested = this.normalizePlaceNameCompact(requestedName);

    return Boolean(
      normalizedCandidate &&
        normalizedRequested &&
        normalizedCandidate.startsWith(normalizedRequested),
    );
  }

  private isSearchTextCandidateNameMatch(
    candidate: PlaceCandidate,
    requestedName: string,
  ): boolean {
    if (this.isPrimaryCandidateNameMatch(candidate, requestedName)) {
      return true;
    }

    const candidateName =
      candidate.mainText || candidate.description?.split(',')[0] || '';
    if (!candidateName.trim() || !requestedName.trim()) {
      return false;
    }

    return this.isSalientSearchTextCandidateNameMatch(
      candidateName,
      requestedName,
    );
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
    const trustedWebsiteDomain = this.resolveTrustedWebsiteDomain(
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

    return summary;
  }

  private buildNoMatchMetadata(
    ranked: RankedCandidate[],
    context: EnrichmentSearchContext,
    extras: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const storageCountry = this.normalizeCountryCodeForStorage(
      context.country ?? null,
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

      if (typeof candidate.distanceMeters === 'number') {
        candidateRecord.distanceMeters = candidate.distanceMeters;
      }

      return candidateRecord;
    });

    return {
      query: context.query,
      country: storageCountry,
      city: context.city,
      region: context.region,
      preferredTypes: Array.from(PREFERRED_PLACE_TYPES),
      attemptedAt: new Date().toISOString(),
      count: ranked.length,
      candidates,
      ...extras,
    };
  }

  private async tryFindPlaceFallback(
    entity: RestaurantEntity,
    context: EnrichmentSearchContext,
    options: RestaurantEnrichmentOptions,
  ): Promise<{ status: string; ranked: RankedCandidate[] } | null> {
    if (!context.query) {
      return null;
    }

    try {
      const response = await this.googlePlacesService.findPlaceFromText(
        context.query,
        {
          language: 'en',
          sessionToken: options.sessionToken,
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
        .map((place) => this.mapTextSearchPlaceToCandidate(place, context))
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

  private shouldCrossCheckWithSearchText(params: {
    selectedCandidate: PlaceCandidate;
    selectedPlace: GooglePlacesV1Place;
    context: EnrichmentSearchContext;
    selectedMatchSource: 'autocomplete' | 'find_place';
  }): boolean {
    if (params.selectedMatchSource !== 'autocomplete') {
      return false;
    }

    const radiusMeters = params.context.locationBias?.radiusMeters;
    if (
      typeof radiusMeters !== 'number' ||
      !Number.isFinite(radiusMeters) ||
      radiusMeters <= 0
    ) {
      return false;
    }

    const distance =
      this.calculatePlaceDistanceMeters(params.selectedPlace, params.context) ??
      params.selectedCandidate.distanceMeters;

    return (
      typeof distance === 'number' &&
      Number.isFinite(distance) &&
      distance > radiusMeters
    );
  }

  private selectSearchTextOverrideCandidate(
    ranked: RankedCandidate[],
    entity: RestaurantEntity,
    context: EnrichmentSearchContext,
  ): RankedCandidate | undefined {
    for (const entry of ranked) {
      if (
        !this.isRestaurantishPlaceTypes(entry.candidate.types) ||
        !this.isSearchTextCandidateNameMatch(entry.candidate, entity.name) ||
        !this.isCandidateWithinSourceMarket(entry.candidate, context)
      ) {
        continue;
      }
      return entry;
    }

    return undefined;
  }

  private isCandidateWithinSourceMarket(
    candidate: PlaceCandidate,
    context: EnrichmentSearchContext,
  ): boolean {
    const radiusMeters = context.locationBias?.radiusMeters;
    if (
      typeof radiusMeters !== 'number' ||
      !Number.isFinite(radiusMeters) ||
      radiusMeters <= 0
    ) {
      return false;
    }

    return (
      typeof candidate.distanceMeters === 'number' &&
      Number.isFinite(candidate.distanceMeters) &&
      candidate.distanceMeters <= radiusMeters
    );
  }

  private async resolveOutOfMarketSearchTextOverride(params: {
    entity: RestaurantEntity;
    context: EnrichmentSearchContext;
    sessionToken?: string;
    selectedCandidate: PlaceCandidate;
    selectedPlace: GooglePlacesV1Place;
    selectedMatchSource: 'autocomplete' | 'find_place';
  }): Promise<ResolvedPlaceMatch | null> {
    if (!this.shouldCrossCheckWithSearchText(params)) {
      return null;
    }

    const fallbackResult = await this.tryFindPlaceFallback(
      params.entity,
      params.context,
      {
        sessionToken: params.sessionToken,
      },
    );

    if (!fallbackResult || fallbackResult.ranked.length === 0) {
      return null;
    }

    const override = this.selectSearchTextOverrideCandidate(
      fallbackResult.ranked,
      params.entity,
      params.context,
    );
    if (!override) {
      return null;
    }

    const details = await this.googlePlacesService.getPlaceDetails(
      override.candidate.placeId,
      { includeRaw: true },
    );

    if (!details.place) {
      return null;
    }

    const place = details.place;
    if (typeof place.id !== 'string' || !place.id.trim()) {
      place.id = override.candidate.placeId;
    }

    this.logger.debug(
      'Replacing out-of-market autocomplete match with searchText match',
      {
        entityName: params.entity.name,
        originalDescription: params.selectedCandidate.description,
        overrideDescription: override.candidate.description,
        query: params.context.query,
      },
    );

    return {
      place,
      matchMetadata: {
        query: params.context.query ?? '',
        predictionDescription: override.candidate.description,
        mainText: override.candidate.mainText,
        secondaryText: override.candidate.secondaryText,
        candidateTypes: override.candidate.types,
        predictionsConsidered: fallbackResult.ranked.length,
        timestamp: new Date().toISOString(),
        source: 'find_place',
      },
      score: override.score,
    };
  }

  private mapTextSearchPlaceToCandidate(
    place: GooglePlacesV1Place,
    context: EnrichmentSearchContext,
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

    const distance = this.calculatePlaceDistanceMeters(place, context);
    if (distance !== undefined) {
      candidate.distanceMeters = distance;
    }

    return candidate;
  }

  private calculatePlaceDistanceMeters(
    place: GooglePlacesV1Place,
    context: EnrichmentSearchContext,
  ): number | undefined {
    const origin = context.locationBias;
    const destination = place.location;

    if (
      !origin ||
      typeof origin.lat !== 'number' ||
      typeof origin.lng !== 'number'
    ) {
      return undefined;
    }

    if (
      !destination ||
      typeof destination.latitude !== 'number' ||
      typeof destination.longitude !== 'number'
    ) {
      return undefined;
    }

    return this.calculateDistanceMeters(
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.latitude, lng: destination.longitude },
    );
  }

  private calculateDistanceMeters(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): number {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeters = 6371000;

    const originLatRad = toRadians(origin.lat);
    const destinationLatRad = toRadians(destination.lat);
    const deltaLat = toRadians(destination.lat - origin.lat);
    const deltaLng = toRadians(destination.lng - origin.lng);

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(originLatRad) *
        Math.cos(destinationLatRad) *
        Math.sin(deltaLng / 2) *
        Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = earthRadiusMeters * c;
    return Math.round(distance);
  }

  private async recordNoMatchCandidates(
    entity: RestaurantEntity,
    reason: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      const emptyHours: NormalizedOpeningHours = {};
      const mergedMetadata = this.mergeRestaurantMetadata(
        entity.restaurantMetadata,
        {},
        emptyHours,
        {
          status: 'no_match',
          reason,
          ...metadata,
        },
      );

      await this.prisma.entity.update({
        where: { entityId: entity.entityId },
        data: {
          restaurantMetadata: mergedMetadata,
          lastUpdated: new Date(),
        },
      });

      entity.restaurantMetadata = mergedMetadata as unknown as Prisma.JsonValue;
    } catch (error) {
      this.logger.warn('Failed to record no-match candidates', {
        entityId: entity.entityId,
        reason,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  private async recordEnrichmentFailure(
    entity: RestaurantEntity,
    reason: string,
    extras: Record<string, unknown> = {},
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
          ...Object.fromEntries(
            Object.entries(extras).filter(([, value]) => value !== undefined),
          ),
        },
      );

      await this.prisma.entity.update({
        where: { entityId: entity.entityId },
        data: {
          restaurantMetadata: mergedMetadata,
          lastUpdated: new Date(),
        },
      });

      entity.restaurantMetadata = mergedMetadata as unknown as Prisma.JsonValue;
    } catch (error) {
      this.logger.warn('Failed to record enrichment failure metadata', {
        entityId: entity.entityId,
        reason,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
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
