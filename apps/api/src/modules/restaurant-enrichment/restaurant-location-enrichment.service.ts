import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Entity, EntityType, Prisma } from '@prisma/client';
import * as stringSimilarity from 'string-similarity';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityRepository } from '../../repositories/entity.repository';
import {
  GooglePlaceDetailsResponse,
  GooglePlaceDetailsResult,
  GooglePlacesService,
  GooglePlacePrediction,
} from '../external-integrations/google-places';
import { LoggerService } from '../../shared';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';

const DEFAULT_COUNTRY = 'US';
const DEFAULT_MIN_SCORE_THRESHOLD = 0.2;
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
};

interface EnrichmentSearchContext {
  query: string | null;
  city?: string;
  region?: string;
  country?: string;
  locationBias?: { lat: number; lng: number };
}

type RankedPrediction = {
  prediction: GooglePlacePrediction;
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
          { googlePlaceId: null },
          { latitude: null },
          { longitude: null },
          { address: null },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
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
    const entity = await this.entityRepository.findById(entityId);

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

    if (entity.googlePlaceId && !options.force) {
      return {
        entityId: entity.entityId,
        status: 'skipped',
        reason: 'already has googlePlaceId',
      };
    }

    const searchContext = this.buildSearchContext(entity, options);
    if (!searchContext.query) {
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

      const ranked = this.rankPredictions(
        autocomplete.predictions,
        entity,
        searchContext,
      );

      if (ranked.length === 0) {
        const noMatchMetadata = this.buildNoMatchMetadata(
          ranked,
          searchContext,
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

      const best = this.selectQualifiedPrediction(ranked);

      if (!best) {
        const noMatchMetadata = this.buildNoMatchMetadata(
          ranked,
          searchContext,
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
        best.prediction.place_id,
        { includeRaw: true },
      );

      if (!details.result) {
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

      const matchMetadata: MatchMetadata = {
        query: searchContext.query ?? '',
        score: best.score,
        predictionDescription: best.prediction.description,
        mainText: best.prediction.structured_formatting?.main_text,
        secondaryText: best.prediction.structured_formatting?.secondary_text,
        candidateTypes: best.prediction.types,
        predictionsConsidered: ranked.length,
        timestamp: new Date().toISOString(),
      };

      const { updateData, updatedFields } = this.buildEntityUpdate(
        entity,
        details.result,
        details.metadata.fields,
        matchMetadata,
      );
      const { updateData: aliasUpdate, updatedFields: aliasFields } =
        this.computeNameAndAliasUpdate(entity, details.result.name);
      const combinedUpdateData = this.mergeEntityUpdates(
        updateData,
        aliasUpdate,
      );
      const combinedUpdatedFields = this.mergeUpdatedFieldLists(
        updatedFields,
        aliasFields,
      );

      if (options.dryRun) {
        this.logger.info('Dry-run enrichment preview', {
          entityId: entity.entityId,
          placeId: details.result.place_id,
          updatedFields: combinedUpdatedFields,
        });
        return {
          entityId: entity.entityId,
          status: 'skipped',
          reason: 'dry_run',
          placeId: details.result.place_id,
          score: best.score,
          updatedFields: combinedUpdatedFields,
        };
      }

      try {
        await this.prisma.entity.update({
          where: { entityId: entity.entityId },
          data: combinedUpdateData,
        });
      } catch (error) {
        if (this.isGooglePlaceConflict(error)) {
          return this.handleGooglePlaceCollision({
            entity,
            details,
            matchMetadata,
            score: best.score,
          });
        }
        throw error;
      }

      this.logger.info('Restaurant enriched with Google Places', {
        entityId: entity.entityId,
        placeId: details.result.place_id,
        score: best.score,
        updatedFields: combinedUpdatedFields,
      });

      return {
        entityId: entity.entityId,
        status: 'updated',
        placeId: details.result.place_id,
        score: best.score,
        updatedFields: combinedUpdatedFields,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to enrich restaurant', {
        entityId: entity.entityId,
        error: message,
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
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
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

  private async handleGooglePlaceCollision(params: {
    entity: RestaurantEntity;
    details: GooglePlaceDetailsResponse;
    matchMetadata: MatchMetadata;
    score: number;
  }): Promise<RestaurantEnrichmentResult> {
    const { entity, details, matchMetadata, score } = params;
    const placeId = details.result?.place_id;

    if (!placeId) {
      throw new Error('Google Place details missing place_id');
    }

    if (!details.result) {
      throw new Error('Google Place details missing result payload');
    }

    const canonical = await this.prisma.entity.findUnique({
      where: { googlePlaceId: placeId },
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

    const canonicalUpdate = this.buildEntityUpdate(
      canonical,
      details.result,
      details.metadata?.fields ?? [],
      matchMetadata,
    );

    const canonicalAliasUpdate = this.computeNameAndAliasUpdate(
      canonical,
      details.result?.name,
      this.collectAliasCandidates(entity),
    );

    const mergeAugmentations = this.buildCanonicalMergeAugmentations(
      canonical,
      entity,
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

    const updatedCanonical =
      await this.restaurantEntityMergeService.mergeDuplicateRestaurant({
        canonical,
        duplicate: entity,
        canonicalUpdate: mergedUpdate,
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

  private buildCanonicalMergeAugmentations(
    canonical: RestaurantEntity,
    duplicate: RestaurantEntity,
  ): {
    updateData: Prisma.EntityUpdateInput;
    updatedFields: string[];
  } {
    const updateData: Prisma.EntityUpdateInput = {};
    const updatedFields: string[] = [];
    const mergedAttributes = this.unionStringArrays(
      canonical.restaurantAttributes,
      duplicate.restaurantAttributes,
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
      options.countryFallback ??
      this.inferCountryFromAddress(entity.address) ??
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

    const city =
      entity.city ||
      this.extractCityFromAddress(entity.address) ||
      this.extractCityFromMetadata(entity.restaurantMetadata);

    const region =
      entity.region ||
      this.extractRegionFromAddress(entity.address) ||
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
    const lat = this.toNumberValue(entity.latitude);
    const lng = this.toNumberValue(entity.longitude);
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

  private rankPredictions(
    predictions: GooglePlacePrediction[],
    entity: RestaurantEntity,
    context: EnrichmentSearchContext,
  ): RankedPrediction[] {
    return predictions
      .map((prediction) => ({
        prediction,
        score: this.scorePrediction(prediction, entity, context),
      }))
      .sort((a, b) => b.score - a.score);
  }

  private selectQualifiedPrediction(
    ranked: RankedPrediction[],
  ): RankedPrediction | undefined {
    for (const candidate of ranked) {
      const types = candidate.prediction.types;
      if (
        Array.isArray(types) &&
        types.some((type) => PREFERRED_PLACE_TYPES.has(type.toLowerCase())) &&
        candidate.score >= this.minScoreThreshold
      ) {
        return candidate;
      }
    }
    return undefined;
  }

  private scorePrediction(
    prediction: GooglePlacePrediction,
    entity: RestaurantEntity,
    context: EnrichmentSearchContext,
  ): number {
    const normalizedEntityName = entity.name.toLowerCase().trim();
    const candidateName =
      prediction.structured_formatting?.main_text ||
      prediction.description?.split(',')[0] ||
      '';

    let score = stringSimilarity.compareTwoStrings(
      normalizedEntityName,
      candidateName.toLowerCase(),
    );

    if (context.city) {
      if (
        prediction.description
          ?.toLowerCase()
          .includes(context.city.toLowerCase())
      ) {
        score += 0.15;
      }
    }

    if (context.region) {
      if (
        prediction.description
          ?.toLowerCase()
          .includes(context.region.toLowerCase())
      ) {
        score += 0.1;
      }
    }

    if (
      typeof prediction.distance_meters === 'number' &&
      prediction.distance_meters < 2000
    ) {
      score += 0.05;
    }

    return Math.min(score, 1);
  }

  private buildEntityUpdate(
    entity: RestaurantEntity,
    details: GooglePlaceDetailsResult,
    _requestedFields: string[],
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
      googlePlaceId: details.place_id,
      lastUpdated: new Date(),
      restaurantMetadata: metadata,
    };

    const updatedFields: string[] = ['googlePlaceId', 'restaurantMetadata'];

    if (details.geometry?.location?.lat !== undefined) {
      updateData.latitude = details.geometry.location.lat;
      updatedFields.push('latitude');
    }

    if (details.geometry?.location?.lng !== undefined) {
      updateData.longitude = details.geometry.location.lng;
      updatedFields.push('longitude');
    }

    if (details.formatted_address) {
      updateData.address = details.formatted_address;
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

    return { updateData, updatedFields };
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
    details: GooglePlaceDetailsResult,
    matchMetadata: MatchMetadata,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      placeId: details.place_id,
      fetchedAt: new Date().toISOString(),
    };

    if (details.name) {
      metadata.name = details.name;
    }

    if (details.formatted_address) {
      metadata.formattedAddress = details.formatted_address;
    }

    if (details.business_status) {
      metadata.businessStatus = details.business_status;
    }

    if (details.formatted_phone_number) {
      metadata.formattedPhoneNumber = details.formatted_phone_number;
    }

    if (details.international_phone_number) {
      metadata.internationalPhoneNumber = details.international_phone_number;
    }

    if (details.website) {
      metadata.website = details.website;
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

    return summary;
  }

  private buildNoMatchMetadata(
    ranked: RankedPrediction[],
    context: EnrichmentSearchContext,
  ): Record<string, unknown> {
    const storageCountry = this.normalizeCountryCodeForStorage(
      context.country ?? null,
    );

    const candidates = ranked.slice(0, 5).map(({ prediction, score }) => {
      const candidate: Record<string, unknown> = {
        placeId: prediction.place_id,
        score,
      };

      if (prediction.description) {
        candidate.description = prediction.description;
      }

      const mainText = prediction.structured_formatting?.main_text;
      if (mainText) {
        candidate.mainText = mainText;
      }

      const secondaryText = prediction.structured_formatting?.secondary_text;
      if (secondaryText) {
        candidate.secondaryText = secondaryText;
      }

      if (Array.isArray(prediction.types) && prediction.types.length > 0) {
        candidate.types = prediction.types;
      }

      if (typeof prediction.distance_meters === 'number') {
        candidate.distanceMeters = prediction.distance_meters;
      }

      return candidate;
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
    };
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

  private normalizeGoogleOpeningHours(
    details: GooglePlaceDetailsResult,
  ): NormalizedOpeningHours {
    const normalized: NormalizedOpeningHours = {};
    const source =
      details.current_opening_hours ?? details.opening_hours ?? null;
    const sourceRecord = this.toRecord(source);
    const hoursByDay: Partial<Record<GoogleDayName, string[]>> = {};

    const periods = Array.isArray(sourceRecord.periods)
      ? (sourceRecord.periods as Array<{
          open?: { day?: number; time?: string };
          close?: { day?: number; time?: string };
        }>)
      : [];

    for (const period of periods) {
      if (!period?.open) {
        continue;
      }

      const dayKey = this.normalizeDayKeyFromIndex(period.open.day);
      const openTime = this.formatGoogleTime(period.open.time);
      const closeTime = this.formatGoogleTime(
        period.close?.time ?? period.open.time,
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
      const weekdayText = Array.isArray(sourceRecord.weekday_text)
        ? (sourceRecord.weekday_text as string[])
        : [];
      if (weekdayText.length > 0) {
        this.populateHoursFromWeekdayText(weekdayText, hoursByDay);
      }
    }

    if (Object.keys(hoursByDay).length > 0) {
      normalized.hours = this.collapseHours(hoursByDay);
    }

    if (typeof details.utc_offset_minutes === 'number') {
      normalized.utcOffsetMinutes = details.utc_offset_minutes;
    } else if (typeof sourceRecord.utc_offset_minutes === 'number') {
      normalized.utcOffsetMinutes = Number(sourceRecord.utc_offset_minutes);
    }

    const timezoneCandidate =
      typeof sourceRecord.time_zone === 'string'
        ? sourceRecord.time_zone
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

  private toRecord(
    value:
      | Prisma.JsonValue
      | Record<string, unknown>
      | null
      | undefined
      | unknown,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return { ...value };
  }

  private extractAddressParts(details: GooglePlaceDetailsResult): {
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  } {
    const components = details.address_components || [];

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
      city: cityComponent?.long_name,
      region: regionComponent?.short_name || regionComponent?.long_name,
      country: countryComponent?.short_name?.toUpperCase(),
      postalCode: postalCodeComponent?.long_name,
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

  private toNumberValue(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number | undefined {
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

    return undefined;
  }
}
