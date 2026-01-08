import { Inject, Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { GOOGLE_PLACE_CUISINE_TYPE_MAP } from './google-place-type-attributes';

type CuisineExtractionSource = 'types' | 'llm' | 'none';

type CuisineExtractionMetadata = {
  extractedAt: string;
  source: CuisineExtractionSource;
  cuisines: string[];
  attributeIds: string[];
  summaryHash?: string | null;
  matchedTypes?: string[];
};

const CUISINE_STRIP_TOKENS = new Set([
  'cuisine',
  'food',
  'foods',
  'restaurant',
  'eatery',
  'kitchen',
  'style',
]);

const CUISINE_SPLIT_PATTERN = /[,&/;|]+/g;

@Injectable()
export class RestaurantCuisineExtractionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly aliasManagement: AliasManagementService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantCuisineExtraction');
  }

  async extractCuisineForRestaurant(
    restaurantId: string,
    options: { source?: string } = {},
  ): Promise<void> {
    const entity = await this.prisma.entity.findUnique({
      where: { entityId: restaurantId },
      select: {
        entityId: true,
        name: true,
        type: true,
        restaurantAttributes: true,
        restaurantMetadata: true,
      },
    });

    if (!entity) {
      this.logger.warn('Cuisine extraction skipped (restaurant not found)', {
        restaurantId,
        source: options.source,
      });
      return;
    }

    if (entity.type !== EntityType.restaurant) {
      this.logger.warn('Cuisine extraction skipped (not a restaurant)', {
        restaurantId: entity.entityId,
        type: entity.type,
      });
      return;
    }

    const metadata = this.toRecord(entity.restaurantMetadata);
    const existingExtraction = this.toRecord(metadata.cuisineExtraction);
    const extractedAt = this.coerceString(existingExtraction.extractedAt);
    const priorAttributeIds = this.coerceStringArray(
      existingExtraction.attributeIds,
    );

    if (extractedAt) {
      if (priorAttributeIds.length > 0) {
        const mergedAttributes = this.unionStringArrays(
          entity.restaurantAttributes,
          priorAttributeIds,
        );
        if (
          !this.setsEqual(
            new Set(entity.restaurantAttributes),
            new Set(mergedAttributes),
          )
        ) {
          await this.prisma.entity.update({
            where: { entityId: entity.entityId },
            data: {
              restaurantAttributes: mergedAttributes,
              lastUpdated: new Date(),
            },
          });
        }
      }

      this.logger.debug('Cuisine extraction already completed', {
        restaurantId: entity.entityId,
        extractedAt,
      });
      return;
    }

    const googlePlaces = this.toRecord(metadata.googlePlaces);
    const placeTypes = this.extractPlaceTypes(googlePlaces);
    const summaryText = this.extractEditorialSummary(googlePlaces);
    const summaryHash = summaryText ? this.hashValue(summaryText) : null;

    const typeMapping = this.mapTypesToCuisines(placeTypes);
    let rawCuisines = typeMapping.cuisines;
    let source: CuisineExtractionSource = rawCuisines.length ? 'types' : 'none';

    if (!rawCuisines.length && summaryText) {
      const llmResult = await this.llmService.extractCuisineFromSummary(
        summaryText,
      );
      rawCuisines = llmResult.cuisines ?? [];
      source = rawCuisines.length ? 'llm' : 'none';
    }

    const normalizedCuisines = this.normalizeCuisineList(rawCuisines);
    const scopeCheck = this.aliasManagement.validateScopeConstraints(
      EntityType.restaurant_attribute,
      normalizedCuisines,
    );
    const filteredCuisines = this.normalizeCuisineList(scopeCheck.validAliases);

    const cuisineAttributeIds =
      filteredCuisines.length > 0
        ? await this.resolveCuisineAttributeIds(filteredCuisines)
        : [];
    const mergedAttributes = this.unionStringArrays(
      entity.restaurantAttributes,
      cuisineAttributeIds,
    );

    const cuisineMetadata: CuisineExtractionMetadata = {
      extractedAt: new Date().toISOString(),
      source,
      cuisines: filteredCuisines,
      attributeIds: cuisineAttributeIds,
      summaryHash,
      matchedTypes: typeMapping.matchedTypes,
    };

    const updatedMetadata = this.applyCuisineMetadata(
      entity.restaurantMetadata,
      cuisineMetadata,
    );

    await this.prisma.entity.update({
      where: { entityId: entity.entityId },
      data: {
        restaurantAttributes: mergedAttributes,
        restaurantMetadata: updatedMetadata,
        lastUpdated: new Date(),
      },
    });

    this.logger.info('Cuisine extraction completed', {
      restaurantId: entity.entityId,
      cuisines: filteredCuisines,
      source,
      matchedTypes: typeMapping.matchedTypes,
    });
  }

  private extractPlaceTypes(metadata: Record<string, unknown>): string[] {
    return this.coerceStringArray(metadata.types).map((value) =>
      value.trim().toLowerCase(),
    );
  }

  private extractEditorialSummary(
    metadata: Record<string, unknown>,
  ): string | null {
    const summary = metadata.editorialSummary;
    if (typeof summary === 'string') {
      const trimmed = summary.trim();
      return trimmed.length ? trimmed : null;
    }
    if (!summary || typeof summary !== 'object') {
      return null;
    }
    const text = (summary as Record<string, unknown>).text;
    if (typeof text !== 'string') {
      return null;
    }
    const trimmed = text.trim();
    return trimmed.length ? trimmed : null;
  }

  private mapTypesToCuisines(types: string[]): {
    cuisines: string[];
    matchedTypes: string[];
  } {
    const cuisines = new Set<string>();
    const matchedTypes = new Set<string>();

    for (const type of types) {
      const normalized = type.trim().toLowerCase();
      const cuisine = GOOGLE_PLACE_CUISINE_TYPE_MAP[normalized];
      if (cuisine) {
        cuisines.add(cuisine);
        matchedTypes.add(normalized);
      }
    }

    return {
      cuisines: Array.from(cuisines),
      matchedTypes: Array.from(matchedTypes),
    };
  }

  private normalizeCuisineList(values: string[]): string[] {
    const normalized = new Set<string>();
    for (const value of values) {
      if (!value || typeof value !== 'string') {
        continue;
      }
      const parts = value.split(CUISINE_SPLIT_PATTERN);
      for (const part of parts) {
        const cleaned = this.normalizeCuisineName(part);
        if (cleaned) {
          normalized.add(cleaned);
        }
      }
    }
    return Array.from(normalized);
  }

  private normalizeCuisineName(value: string): string | null {
    const ascii = value
      .trim()
      .toLowerCase()
      .replace(/[^\x20-\x7e]/g, '');
    if (!ascii) {
      return null;
    }

    const tokens = ascii
      .replace(/[()[\]{}]/g, ' ')
      .replace(/["'`]/g, '')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const filtered = tokens.filter((token) => !CUISINE_STRIP_TOKENS.has(token));
    const normalized = filtered.join(' ').replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length < 2) {
      return null;
    }
    return normalized;
  }

  private async resolveCuisineAttributeIds(
    cuisines: string[],
  ): Promise<string[]> {
    const normalized = Array.from(
      new Set(
        cuisines
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0),
      ),
    );
    if (normalized.length === 0) {
      return [];
    }

    const existingAttributes = await this.prisma.entity.findMany({
      where: {
        type: EntityType.restaurant_attribute,
        OR: [
          { name: { in: normalized } },
          { aliases: { hasSome: normalized } },
        ],
      },
      select: { entityId: true, name: true, aliases: true },
    });

    const ids: string[] = [];
    for (const cuisine of normalized) {
      const matched = this.matchExistingAttribute(existingAttributes, cuisine);
      const aliasCandidates = this.normalizeAliasList(
        this.buildCuisineAliases(cuisine),
      );
      const scopeCheck = this.aliasManagement.validateScopeConstraints(
        EntityType.restaurant_attribute,
        aliasCandidates,
      );
      const scopedAliases = this.normalizeAliasList(scopeCheck.validAliases);

      if (matched) {
        const existingAliases = Array.isArray(matched.aliases)
          ? matched.aliases
          : [];
        const mergedAliases = this.normalizeAliasList([
          ...existingAliases,
          ...scopedAliases,
        ]);

        if (!this.setsEqual(new Set(existingAliases), new Set(mergedAliases))) {
          await this.prisma.entity.update({
            where: { entityId: matched.entityId },
            data: { aliases: mergedAliases },
          });
        }

        ids.push(matched.entityId);
        continue;
      }

      const created = await this.prisma.entity.create({
        data: {
          name: cuisine,
          type: EntityType.restaurant_attribute,
          locationKey: 'global',
          aliases: scopedAliases.length ? scopedAliases : [cuisine],
        },
        select: { entityId: true },
      });

      ids.push(created.entityId);
    }

    return Array.from(new Set(ids));
  }

  private buildCuisineAliases(canonical: string): string[] {
    const normalized = canonical.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return [
      normalized,
      `${normalized} cuisine`,
      `${normalized} food`,
      `${normalized} restaurant`,
    ];
  }

  private matchExistingAttribute(
    attributes: Array<{ entityId: string; name: string; aliases: string[] }>,
    cuisine: string,
  ): { entityId: string; name: string; aliases: string[] } | null {
    const target =
      this.normalizeCuisineName(cuisine) ?? cuisine.trim().toLowerCase();
    if (!target) {
      return null;
    }

    const exactMatch = attributes.find(
      (attribute) =>
        this.normalizeCuisineName(attribute.name) === target ||
        attribute.name.trim().toLowerCase() === target,
    );
    if (exactMatch) {
      return exactMatch;
    }

    for (const attribute of attributes) {
      const aliases = Array.isArray(attribute.aliases) ? attribute.aliases : [];
      const hasAlias = aliases.some((alias) => {
        const normalized =
          this.normalizeCuisineName(alias) ?? alias.trim().toLowerCase();
        return normalized === target;
      });
      if (hasAlias) {
        return attribute;
      }
    }

    return null;
  }

  private normalizeAliasList(values: string[]): string[] {
    return Array.from(
      new Set(
        values
          .filter((value) => typeof value === 'string')
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private applyCuisineMetadata(
    current: Prisma.JsonValue | null | undefined,
    cuisineMetadata: CuisineExtractionMetadata,
  ): Prisma.InputJsonValue {
    const base = this.toRecord(current);
    base.cuisineExtraction = cuisineMetadata;
    return base as Prisma.InputJsonValue;
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

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return { ...(value as Record<string, unknown>) };
  }

  private coerceStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const results: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }
      const normalized = entry.trim();
      if (normalized.length) {
        results.push(normalized);
      }
    }
    return results;
  }

  private coerceString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
