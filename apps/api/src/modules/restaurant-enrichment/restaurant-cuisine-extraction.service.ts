import {
  canonicalFold,
  identityInsertData,
} from '../content-processing/entity-resolver/entity-identity';
import { addSurfaces } from '../content-processing/entity-resolver/entity-surface.service';
import { Inject, Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { GOOGLE_PLACE_CUISINE_TYPE_MAP } from './google-place-type-attributes';
import { identityScope } from '../../shared/locale/surface-scope';

// Every value here means "we HAD evidence and extracted from it": place
// types matched ('types'), the LLM was asked and returned cuisines ('llm'),
// or the LLM was asked and honestly found none ('llm_found_nothing'). There
// is deliberately no 'none' — "we had no evidence to ask with" is not a
// completed extraction, so it writes NO cuisineExtraction record at all. The
// ABSENCE of the record is what the once-ever gate reads as "not yet asked",
// so first-evidence-arrives-later re-tries instead of being permanently
// stamped done (F4948).
type CuisineExtractionSource = 'types' | 'llm' | 'llm_found_nothing';

type CuisineExtractionMetadata = {
  extractedAt: string;
  source: CuisineExtractionSource;
  cuisines: string[];
  attributeIds: string[];
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

    // ONCE EVER PER RESTAURANT, DELIBERATELY (F369). The gate is `extractedAt`
    // alone: a restaurant whose Google editorial summary later changes is not
    // re-extracted.
    //
    // This service used to ALSO hash that summary into the extraction
    // metadata (`summaryHash`) — the machinery for "has the evidence
    // changed?" — and a repo-wide grep found exactly three occurrences: the
    // type, the computation, and the write. NOTHING ever compared it. A
    // stored derived value with no reader is not a feature in waiting, it is
    // a claim about a future nobody committed to, so it is deleted rather
    // than left looking implemented. (Rows written before 2026-08-03 still
    // carry the key in their free-form metadata blob; nothing reads it there
    // either.)
    //
    // The alternative — gate on `extractedAt && summaryHash === current` —
    // costs one LLM call per changed restaurant per refresh cycle, on a
    // corpus refreshStaleLocations re-polls every 90 days, and the churn rate
    // of Google's editorial summaries is UNMEASURED. Measuring it needs a
    // Places re-poll, i.e. spend; so once-ever stands as the stated policy
    // until someone chooses otherwise with a number in hand.
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
        // Phase 4b: state the cuisine LLM's claims in the rebuildable
        // substrate — this source has no document/run, so the event ledger
        // cannot hold them and a derived array would otherwise drop them.
        await this.recordCuisineEvidence(entity.entityId, mergedAttributes);
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

    const typeMapping = this.mapTypesToCuisines(placeTypes);
    let rawCuisines = typeMapping.cuisines;
    let source: CuisineExtractionSource;

    if (rawCuisines.length) {
      source = 'types';
    } else if (summaryText) {
      // We HAD evidence (an editorial summary) and asked the LLM. Whether it
      // returned cuisines or not, the extraction genuinely ran — record it so
      // the once-ever gate does not re-spend on the same summary.
      const llmResult =
        await this.llmService.extractCuisineFromSummary(summaryText);
      rawCuisines = llmResult.cuisines ?? [];
      source = rawCuisines.length ? 'llm' : 'llm_found_nothing';
    } else {
      // NO EVIDENCE: no place types matched and there is no editorial summary
      // to ask the LLM with — the common case for a freshly-grounded
      // restaurant whose Places record has no summary yet. Writing a
      // 'none'/extractedAt record here would make the once-ever gate at :104
      // stamp it done PERMANENTLY, so when refreshStaleLocations re-polls and
      // a summary finally appears, this restaurant would never be re-asked.
      // Write NO record: the absence IS "not yet asked", and the next run
      // re-tries once first evidence exists (F4948).
      this.logger.debug('Cuisine extraction deferred (no evidence yet)', {
        restaurantId: entity.entityId,
        source: options.source,
      });
      return;
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
    // FOLD, never delete (2026-08-13, same defect class as the
    // normalizeBrandName fix): the old /[^\x20-\x7e]/ strip DELETED
    // non-ASCII letters — Niçoise→"nioise", Café→"caf" — banking corrupted
    // forms as surfaces AND entity names. canonicalFold is the one
    // identity authority (accents fold to base letters; CJK survives).
    const ascii = canonicalFold(value.trim()) ?? '';
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

    // Attributes reachable by NAME or by a banked recall surface, folded on
    // both sides — the retired `aliases: { hasSome }` was a byte-exact array
    // overlap, so a surface banked as "Tex-Mex" was invisible to an extracted
    // "tex-mex". This is an IDENTITY probe ("is this the same attribute?"),
    // so the surface slice is identityScope() — locale-blind by law
    // (surface-scope.ts): a hard-coded locale='und' here made an attribute
    // whose twin surface was banked es/vi invisible and minted a duplicate.
    const foldedProbes = Array.from(
      new Set(normalized.map((value) => canonicalFold(value)).filter(Boolean)),
    );
    const existingAttributes = (
      await this.prisma.$queryRaw<
        Array<{ entity_id: string; name: string; forms: string[] | null }>
      >`
        SELECT e.entity_id, e.name,
               (SELECT array_agg(s.form)
                  FROM entity_surface s
                 WHERE s.entity_id = e.entity_id
                   AND ${identityScope('s')}) AS forms
          FROM core_entities e
         WHERE e.type = 'restaurant_attribute'::entity_type
           AND (
             e.name = ANY(${normalized}::text[])
             OR EXISTS (
               SELECT 1 FROM entity_surface m
                WHERE m.entity_id = e.entity_id
                  AND ${identityScope('m')}
                  AND m.form_folded = ANY(${foldedProbes}::text[])
             )
           )`
    ).map((row) => ({
      entityId: row.entity_id,
      name: row.name,
      aliases: row.forms ?? [],
    }));

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
        // A1: through THE projection writer. normalizeAliasList's
        // trim+collapse is what addSurfaces applies to every form, and its
        // append order is what the seq-ordered projection reproduces —
        // the resulting array is unchanged, but each cuisine surface now
        // carries source 'cuisine'.
        await this.prisma.$transaction((tx) =>
          addSurfaces(
            tx,
            matched.entityId,
            scopedAliases.map((alias) => ({
              form: alias,
              source: 'cuisine' as const,
            })),
          ),
        );

        ids.push(matched.entityId);
        continue;
      }

      const createAliases = scopedAliases.length ? scopedAliases : [cuisine];
      const created = await this.prisma.entity.create({
        data: {
          name: cuisine,
          type: EntityType.restaurant_attribute,
          ...identityInsertData(cuisine, EntityType.restaurant_attribute),
        },
        select: { entityId: true },
      });
      await this.prisma.$transaction((tx) =>
        addSurfaces(
          tx,
          created.entityId,
          createAliases.map((alias) => ({
            form: alias,
            source: 'cuisine' as const,
          })),
          { markEmbeddingStale: false },
        ),
      );

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

  /** Phase 4b: cuisine-LLM attribute claims -> evidence substrate. */
  private async recordCuisineEvidence(
    restaurantId: string,
    attributeIds: string[],
  ): Promise<void> {
    const ids = Array.from(new Set(attributeIds.filter(Boolean)));
    if (!restaurantId || !ids.length) return;
    try {
      await this.prisma.restaurantAttributeEvidence.createMany({
        data: ids.map((attributeId) => ({
          restaurantId,
          attributeId,
          sourceClass: 'cuisine_llm',
          observations: 1,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn('Cuisine attribute evidence write failed', {
        operation: 'attribute_evidence_write',
        restaurantId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
