import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Entity, EntityType, Prisma, RestaurantLocation } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as stringSimilarity from 'string-similarity';
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
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';

const DEFAULT_COUNTRY = 'US';
const DEFAULT_MIN_SCORE_THRESHOLD = 0.1;
const PREFERRED_PLACE_TYPES = new Set(['food', 'restaurant', 'cafe', 'bar']);
const GOOGLE_DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

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
    GOOGLE_RESTAURANT_ATTRIBUTE_DEFINITIONS.map((definition) =>
      definition.canonicalName.trim().toLowerCase(),
    ).filter((name) => name.length > 0),
  ),
);

interface NormalizedOpeningHours {
  hours?: Partial<Record<GoogleDayName, string | string[]>>;
  utcOffsetMinutes?: number;
  timezone?: string;
}

interface MatchMetadata {
  query: string;
  score: number;
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

interface EnrichmentSearchContext {
  query: string | null;
  city?: string;
  region?: string;
  country?: string;
  locationBias?: { lat: number; lng: number };
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
  score: number;
};

@Injectable()
export class RestaurantLocationEnrichmentService {
  private readonly logger: LoggerService;
  private readonly minScoreThreshold: number;

  constructor(
    private readonly entityRepository: EntityRepository,
    private readonly prisma: PrismaService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly aliasManagementService: AliasManagementService,
    private readonly restaurantEntityMergeService: RestaurantEntityMergeService,
    private readonly configService: ConfigService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext(
      'RestaurantLocationEnrichmentService',
    );
    this.minScoreThreshold = this.resolveMinScoreThreshold();
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
    let enrichmentScore = 0;
    let googleRestaurantAttributeIds: string[] = [];

    const hasPlaceId =
      Boolean(entity.googlePlaceId) ||
      Boolean(entity.primaryLocation?.googlePlaceId) ||
      Boolean(entity.locations?.some((loc) => loc.googlePlaceId));

    if (hasPlaceId && !options.force) {
      return {
        entityId: entity.entityId,
        status: 'skipped',
        reason: 'already has googlePlaceId',
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

      let ranked = this.rankCandidates(candidates, entity, searchContext);

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

      const best = this.selectQualifiedCandidate(ranked);

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
        const reason = `no prediction matched preferred place types with min score ${this.minScoreThreshold}`;
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
        score: best.score,
        predictionDescription: best.candidate.description,
        mainText: best.candidate.mainText,
        secondaryText: best.candidate.secondaryText,
        candidateTypes: best.candidate.types,
        predictionsConsidered: ranked.length,
        timestamp: new Date().toISOString(),
        source: matchSource,
      };
      latestMatchMetadata = matchMetadata;

      const { updateData, updatedFields } = this.buildEntityUpdate(
        entity,
        placeDetails,
        details.metadata.fieldMask,
        matchMetadata,
      );
      const { updateData: aliasUpdate, updatedFields: aliasFields } =
        this.computeNameAndAliasUpdate(
          entity,
          this.getPlaceDisplayName(placeDetails),
        );
      combinedUpdateData = this.mergeEntityUpdates(updateData, aliasUpdate);
      combinedUpdatedFields = this.mergeUpdatedFieldLists(
        updatedFields,
        aliasFields,
      );
      targetNameForUpdate = this.extractTargetNameFromUpdate(
        combinedUpdateData,
        this.getPlaceDisplayName(placeDetails),
      );
      const targetLocation =
        entity.locations?.find(
          (location) => location.googlePlaceId === placeDetails.id,
        ) ??
        entity.primaryLocation ??
        entity.locations?.[0] ??
        null;
      const locationUpsert = this.buildLocationUpsertData(
        entity.entityId,
        targetLocation,
        placeDetails,
        matchMetadata,
      );

      if (options.dryRun) {
        this.logger.info('Dry-run enrichment preview', {
          entityId: entity.entityId,
          placeId: placeDetails.id,
          updatedFields: combinedUpdatedFields,
        });
        return {
          entityId: entity.entityId,
          status: 'skipped',
          reason: 'dry_run',
          placeId: placeDetails.id,
          score: best.score,
          updatedFields: combinedUpdatedFields,
        };
      }

      const googleAttributeDefinitions =
        this.extractGoogleRestaurantAttributeDefinitions(placeDetails);
      googleRestaurantAttributeIds =
        await this.resolveRestaurantAttributeIdsForDefinitions(
          googleAttributeDefinitions,
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
        await this.prisma.$transaction(async (tx) => {
          const location = await tx.restaurantLocation.upsert({
            where: { googlePlaceId: placeDetails.id },
            update: {
              ...locationUpsert.update,
              restaurantId: entity.entityId,
              isPrimary: true,
              updatedAt: new Date(),
            } as Prisma.RestaurantLocationUncheckedUpdateInput,
            create: {
              ...locationUpsert.create,
              restaurantId: entity.entityId,
              isPrimary: true,
            } as Prisma.RestaurantLocationUncheckedCreateInput,
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
              primaryLocation: { connect: { locationId: location.locationId } },
            },
          });
        });
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
    score: number;
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
      matchMetadata,
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

    const updatedCanonical = await this.prisma.$transaction(async (tx) => {
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
    });

    this.logger.info('Merged restaurant into canonical entity', {
      duplicateId: entity.entityId,
      canonicalId: updatedCanonical.entityId,
      placeId,
      updatedFields: mergedFields,
    });

    return {
      entityId: entity.entityId,
      mergedInto: updatedCanonical.entityId,
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
    score: number;
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
    const canonical = await this.prisma.entity.findFirst({
      where: {
        type: EntityType.restaurant,
        name:
          resolvedName ?? this.getPlaceDisplayName(placeDetails) ?? undefined,
      },
      include: { primaryLocation: true, locations: true },
    });

    if (!canonical) {
      this.logger.error(
        'Name conflict encountered but canonical restaurant missing',
        {
          entityId: entity.entityId,
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
    const targetLocation =
      canonical.locations?.find(
        (location) => location.googlePlaceId === placeDetails.id,
      ) ??
      canonical.primaryLocation ??
      canonical.locations?.[0] ??
      null;
    const locationUpsert = this.buildLocationUpsertData(
      canonical.entityId,
      targetLocation,
      placeDetails,
      matchMetadata,
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

    const updatedCanonical = await this.prisma.$transaction(async (tx) => {
      const location = await tx.restaurantLocation.upsert({
        where: { googlePlaceId: placeDetails.id },
        update: {
          ...locationUpsert.update,
          restaurantId: canonical.entityId,
          isPrimary: true,
          updatedAt: new Date(),
        } as Prisma.RestaurantLocationUncheckedUpdateInput,
        create: {
          ...locationUpsert.create,
          restaurantId: canonical.entityId,
          isPrimary: true,
        } as Prisma.RestaurantLocationUncheckedCreateInput,
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
    });

    this.logger.info('Merged restaurant into existing canonical by name', {
      duplicateId: entity.entityId,
      canonicalId: updatedCanonical.entityId,
      targetName: resolvedName ?? this.getPlaceDisplayName(placeDetails),
    });

    return {
      entityId: entity.entityId,
      mergedInto: updatedCanonical.entityId,
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

    const totalPraise =
      (canonical.generalPraiseUpvotes ?? 0) +
      (duplicate.generalPraiseUpvotes ?? 0);
    if (totalPraise !== (canonical.generalPraiseUpvotes ?? 0)) {
      updateData.generalPraiseUpvotes = totalPraise;
      updatedFields.push('generalPraiseUpvotes');
    }

    const qualityScore = this.maxDecimalValue(
      canonical.restaurantQualityScore,
      duplicate.restaurantQualityScore,
    );
    if (
      qualityScore &&
      (!canonical.restaurantQualityScore ||
        !qualityScore.equals(canonical.restaurantQualityScore))
    ) {
      updateData.restaurantQualityScore = qualityScore;
      updatedFields.push('restaurantQualityScore');
    }

    updateData.lastUpdated = new Date();

    return { updateData, updatedFields };
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

  private maxDecimalValue(
    current: Prisma.Decimal | number | string | null | undefined,
    next: Prisma.Decimal | number | string | null | undefined,
  ): Prisma.Decimal | null {
    if (current === null || current === undefined) {
      return next === null || next === undefined ? null : this.toDecimal(next);
    }
    if (next === null || next === undefined) {
      return this.toDecimal(current);
    }
    const currentDecimal = this.toDecimal(current);
    const nextDecimal = this.toDecimal(next);
    return currentDecimal.greaterThan(nextDecimal)
      ? currentDecimal
      : nextDecimal;
  }

  private toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
    if (value instanceof Prisma.Decimal) {
      return value;
    }
    return new Prisma.Decimal(value);
  }

  private resolveMinScoreThreshold(): number {
    const configured = this.configService.get<string | number | undefined>(
      'restaurantEnrichment.minScoreThreshold',
    );

    const numeric =
      typeof configured === 'number'
        ? configured
        : typeof configured === 'string'
          ? Number(configured)
          : NaN;

    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1) {
      return Number(numeric.toFixed(3));
    }

    return DEFAULT_MIN_SCORE_THRESHOLD;
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
        locationBias: this.buildLocationBias(entity),
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
      locationBias: this.buildLocationBias(entity),
    };
  }

  private buildLocationBias(
    entity: RestaurantEntity,
  ): { lat: number; lng: number } | undefined {
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

  private rankCandidates(
    candidates: PlaceCandidate[],
    entity: RestaurantEntity,
    context: EnrichmentSearchContext,
  ): RankedCandidate[] {
    return candidates
      .map((candidate) => ({
        candidate,
        score: this.scoreCandidate(candidate, entity, context),
      }))
      .sort((a, b) => b.score - a.score);
  }

  private selectQualifiedCandidate(
    ranked: RankedCandidate[],
  ): RankedCandidate | undefined {
    for (const entry of ranked) {
      const types = entry.candidate.types;
      if (
        Array.isArray(types) &&
        types.some((type) => PREFERRED_PLACE_TYPES.has(type.toLowerCase())) &&
        entry.score >= this.minScoreThreshold
      ) {
        return entry;
      }
    }
    return undefined;
  }

  private scoreCandidate(
    candidate: PlaceCandidate,
    entity: RestaurantEntity,
    context: EnrichmentSearchContext,
  ): number {
    const normalizedEntityName = entity.name.toLowerCase().trim();
    const candidateName =
      candidate.mainText || candidate.description?.split(',')[0] || '';

    let score = stringSimilarity.compareTwoStrings(
      normalizedEntityName,
      candidateName.toLowerCase(),
    );

    if (context.city) {
      if (
        candidate.description
          ?.toLowerCase()
          .includes(context.city.toLowerCase())
      ) {
        score += 0.15;
      }
    }

    if (context.region) {
      if (
        candidate.description
          ?.toLowerCase()
          .includes(context.region.toLowerCase())
      ) {
        score += 0.1;
      }
    }

    if (typeof candidate.distanceMeters === 'number') {
      const dist = Math.max(0, candidate.distanceMeters);
      const maxBoostDistance = 10000; // 10km
      const proximityBoost =
        dist <= maxBoostDistance ? 0.05 * (1 - dist / maxBoostDistance) : 0;
      score += proximityBoost;
    }

    return Math.min(score, 1);
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
    const metadata = this.mergeRestaurantMetadata(
      entity.restaurantMetadata,
      googlePlacesMetadata,
      normalizedHours,
      null,
    );

    const updateData: Prisma.EntityUpdateInput = {
      googlePlaceId: details.id ?? null,
      lastUpdated: new Date(),
      restaurantMetadata: metadata,
    };

    const updatedFields: string[] = ['googlePlaceId', 'restaurantMetadata'];

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

  private buildLocationUpsertData(
    restaurantId: string,
    current: RestaurantLocation | null | undefined,
    details: GooglePlacesV1Place,
    matchMetadata: MatchMetadata,
  ): {
    create: Prisma.RestaurantLocationUncheckedCreateInput;
    update: Prisma.RestaurantLocationUncheckedUpdateInput;
    updatedFields: string[];
  } {
    const addressParts = this.extractAddressParts(details);
    const normalizedHours = this.normalizeGoogleOpeningHours(details);
    const googlePlacesMetadata = this.buildGooglePlacesMetadata(
      details,
      matchMetadata,
    );
    const metadata = this.mergeRestaurantMetadata(
      current?.metadata,
      googlePlacesMetadata,
      normalizedHours,
      null,
    );

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
      metadata,
      updatedAt: new Date(),
    };

    let priceLevel: number | null = null;
    let priceLevelUpdatedAt: Date | null = null;
    const mappedPriceLevel = this.mapGooglePriceLevel(details.priceLevel);
    if (mappedPriceLevel !== null) {
      priceLevel = mappedPriceLevel;
      priceLevelUpdatedAt = new Date();
    } else {
      const priceRange = this.normalizeGooglePriceRange(details.priceRange);
      const derivedLevel = this.mapPriceRangeToLevel(priceRange);
      if (derivedLevel !== null) {
        priceLevel = derivedLevel;
        priceLevelUpdatedAt = new Date();
      }
    }

    const updatedFields: string[] = [
      'googlePlaceId',
      'latitude',
      'longitude',
      'address',
      'city',
      'region',
      'country',
      'postalCode',
      'metadata',
      'priceLevel',
      'priceLevelUpdatedAt',
    ];

    const create: Prisma.RestaurantLocationUncheckedCreateInput = {
      ...baseData,
      priceLevel,
      priceLevelUpdatedAt,
      isPrimary: current?.isPrimary ?? true,
    };

    const update: Prisma.RestaurantLocationUncheckedUpdateInput = {
      ...baseData,
      priceLevel,
      priceLevelUpdatedAt,
      isPrimary: current?.isPrimary ?? true,
    };

    return {
      create,
      update,
      updatedFields,
    };
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
        score,
      };

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
      threshold: this.minScoreThreshold,
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
              }
            : undefined,
        },
      );

      const candidates = response.places
        .map((place) => this.mapTextSearchPlaceToCandidate(place, context))
        .filter((candidate): candidate is PlaceCandidate => candidate !== null);
      const ranked = this.rankCandidates(candidates, entity, context);

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
      typeof sourceRecord.timeZone === 'string'
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
