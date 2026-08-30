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
import { AttributeOntologyQueueService } from '../attribute-ontology/attribute-ontology-queue.service';
import { mintCuisineFacetRow } from '../content-processing/entity-resolver/cuisine-attribute';
import { derivePlaceAttributes } from '../content-processing/reddit-collector/place-attribute-projection';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * INPUT-FINGERPRINT (S4): the hash that keys one completed venue-facts
 * computation — the venue name, the editorial summary text, the Google place
 * types, and the prompt text itself. The reconciler (worker re-enqueues after every
 * enrichment/refresh) skips a restaurant whose fingerprint is unchanged and
 * recomputes when any input or the prompt changes. This replaces the
 * once-ever `extractedAt` gate (F369): the machinery F369's comment said
 * nobody had committed to now has a reader — this comparison.
 */
const CUISINE_PROMPT_FINGERPRINT = createHash('sha256')
  .update(
    readFileSync(
      join(__dirname, '../external-integrations/llm/prompts/cuisine-prompt.md'),
      'utf8',
    ),
  )
  .digest('hex')
  .slice(0, 12);

// Every value here means "we HAD evidence and extracted from it": place
// types matched ('types'), the LLM was asked and returned cuisines ('llm'),
// or the LLM was asked and honestly found none ('llm_found_nothing'). There
// is deliberately no 'none' — "we had no evidence to ask with" is not a
// completed extraction, so it writes NO cuisineExtraction record at all. The
// ABSENCE of the record is what the once-ever gate reads as "not yet asked",
// so first-evidence-arrives-later re-tries instead of being permanently
// stamped done (F4948).
type CuisineExtractionSource =
  | 'types'
  | 'llm'
  | 'llm_found_nothing'
  // S4: place types matched AND a summary existed, so the LLM was also asked
  // (the summary is now the venue-facts source, not just the cuisine
  // fallback) — cuisines union both readings.
  | 'types+llm';

type CuisineExtractionMetadata = {
  extractedAt: string;
  source: CuisineExtractionSource;
  cuisines: string[];
  /** Canonical cuisine attribute ids (kept under its historical key). */
  attributeIds: string[];
  /** S4: venue attributes the summary stated (FILTER TEST survivors). */
  attributes?: string[];
  /** S4: their resolved place_attribute entity ids (active or pending). */
  editorialAttributeIds?: string[];
  matchedTypes?: string[];
  /** Hash of (name, summary, types, prompt) this computation answered. */
  inputFingerprint?: string;
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
export class PlaceCuisineExtractionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly aliasManagement: AliasManagementService,
    private readonly attributeOntologyQueue: AttributeOntologyQueueService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantCuisineExtraction');
  }

  async extractCuisineForPlace(
    placeId: string,
    options: { source?: string } = {},
  ): Promise<void> {
    const entity = await this.prisma.entity.findUnique({
      where: { entityId: placeId },
      select: {
        entityId: true,
        name: true,
        type: true,
        placeAttributes: true,
        placeMetadata: true,
      },
    });

    if (!entity) {
      this.logger.warn('Cuisine extraction skipped (restaurant not found)', {
        placeId,
        source: options.source,
      });
      return;
    }

    if (entity.type !== EntityType.place) {
      this.logger.warn('Cuisine extraction skipped (not a restaurant)', {
        placeId: entity.entityId,
        type: entity.type,
      });
      return;
    }

    const metadata = this.toRecord(entity.placeMetadata);
    const existingExtraction = this.toRecord(metadata.cuisineExtraction);
    const extractedAt = this.coerceString(existingExtraction.extractedAt);
    const priorAttributeIds = this.coerceStringArray(
      existingExtraction.attributeIds,
    );
    const priorEditorialIds = this.coerceStringArray(
      existingExtraction.editorialAttributeIds,
    );

    const googlePlaces = this.toRecord(metadata.googlePlaces);
    const placeTypes = this.extractPlaceTypes(googlePlaces);
    const summaryText = this.extractEditorialSummary(googlePlaces);
    const venueName = (entity.name ?? '').trim();
    const inputFingerprint = this.computeInputFingerprint(
      venueName,
      summaryText,
      placeTypes,
    );

    // INPUT-FINGERPRINT GATE (S4, supersedes the once-ever F369 gate): a
    // completed extraction is skipped IFF its inputs are unchanged — same
    // summary text, same place types, same prompt text. A changed summary,
    // a Places re-poll that grew types, or a prompt edit all change the
    // fingerprint and the extraction reruns (correcting, not accumulating:
    // this lane's evidence rows are deleted and rewritten). Legacy rows
    // stamped before fingerprinting carry no fingerprint and rerun once.
    const storedFingerprint = this.coerceString(
      existingExtraction.inputFingerprint,
    );
    if (extractedAt && storedFingerprint === inputFingerprint) {
      const carriedIds = this.unionStringArrays(
        priorAttributeIds,
        priorEditorialIds,
      );
      if (carriedIds.length > 0) {
        // Phase 4b: state the lane's claims in the rebuildable substrate —
        // this source has no document/run, so the event ledger cannot hold
        // them. The read column is a PROJECTION of that substrate
        // (redteam-l2 K1): write evidence, then project — never a second
        // union-write semantics on the column itself.
        await this.recordEvidence(
          entity.entityId,
          priorAttributeIds,
          priorEditorialIds,
          { replace: false },
        );
        await derivePlaceAttributes(this.prisma, [entity.entityId]);
      }

      this.logger.debug('Cuisine extraction inputs unchanged — skipped', {
        placeId: entity.entityId,
        extractedAt,
      });
      return;
    }

    const typeMapping = this.mapTypesToCuisines(placeTypes);
    let rawCuisines = typeMapping.cuisines;
    let rawAttributes: string[] = [];
    let source: CuisineExtractionSource;

    if (venueName || summaryText) {
      // ONE CUISINE JUDGE, ALL SIGNALS (owner-ruled 2026-08-30): the venue
      // NAME is first-class evidence alongside the editorial summary and
      // place types — the judge reads all three and rules whether each
      // cuisine-shaped name word claims the KITCHEN'S TRADITION (never a
      // product word, proper name, or homograph). A place always has a
      // name, so the judge is always asked; the deterministic name-vote
      // lane this replaces is deleted.
      const llmResult = await this.llmService.extractVenueCuisineFacts({
        name: venueName,
        summary: summaryText,
        types: placeTypes,
      });
      rawCuisines = this.unionStringArrays(
        rawCuisines,
        llmResult.cuisines ?? [],
      );
      rawAttributes = llmResult.attributes ?? [];
      source = typeMapping.cuisines.length
        ? 'types+llm'
        : rawCuisines.length || rawAttributes.length
          ? 'llm'
          : 'llm_found_nothing';
    } else if (rawCuisines.length) {
      source = 'types';
    } else {
      // NO EVIDENCE: no name, no summary, and no place types matched — a
      // degenerate row (places always carry a name; this survives only as
      // the F4948 safety shape). Writing a 'none'/extractedAt record here
      // would make the fingerprint gate stamp it done PERMANENTLY, so when
      // evidence later appears this place would never be re-asked. Write NO
      // record: the absence IS "not yet asked" (F4948).
      this.logger.debug('Cuisine extraction deferred (no evidence yet)', {
        placeId: entity.entityId,
        source: options.source,
      });
      return;
    }

    const normalizedCuisines = this.normalizeCuisineList(rawCuisines);
    const scopeCheck = this.aliasManagement.validateScopeConstraints(
      EntityType.place_attribute,
      normalizedCuisines,
    );
    const filteredCuisines = this.normalizeCuisineList(scopeCheck.validAliases);

    const cuisineAttributeIds =
      filteredCuisines.length > 0
        ? await this.resolveCuisineAttributeIds(filteredCuisines)
        : [];

    // S4: venue attributes ride the attribute ONTOLOGY — matched onto
    // existing place_attribute vocabulary, or minted PENDING (quarantined)
    // for the placement judge to merge/promote/reject like any
    // collection-coined attribute.
    const editorial = await this.resolveEditorialAttributeIds(rawAttributes);

    const cuisineMetadata: CuisineExtractionMetadata = {
      extractedAt: new Date().toISOString(),
      source,
      cuisines: filteredCuisines,
      attributeIds: cuisineAttributeIds,
      attributes: editorial.attributes,
      editorialAttributeIds: editorial.ids,
      matchedTypes: typeMapping.matchedTypes,
      inputFingerprint,
    };

    const updatedMetadata = this.applyCuisineMetadata(
      entity.placeMetadata,
      cuisineMetadata,
    );

    await this.prisma.entity.update({
      where: { entityId: entity.entityId },
      data: {
        placeMetadata: updatedMetadata,
        lastUpdated: new Date(),
      },
    });

    // Re-extraction CORRECTS: this lane owns its two source classes, so the
    // restaurant's prior claims are replaced, never accumulated beside —
    // and the read column is re-projected from evidence IN THIS RUN
    // (redteam-l2 K1), so a dropped attribute leaves search immediately
    // instead of waiting for an unrelated reddit-driven rebuild. Pending
    // mints stay quarantined: the projection is active-only.
    await this.recordEvidence(
      entity.entityId,
      cuisineAttributeIds,
      editorial.ids,
      { replace: true },
    );
    await derivePlaceAttributes(this.prisma, [entity.entityId]);

    if (editorial.mintedPending) {
      await this.attributeOntologyQueue.queueAdjudication();
    }

    this.logger.info('Cuisine extraction completed', {
      placeId: entity.entityId,
      cuisines: filteredCuisines,
      attributes: editorial.attributes,
      source,
      matchedTypes: typeMapping.matchedTypes,
      rerun: Boolean(extractedAt),
    });
  }

  /** The (name, summary, types, prompt) hash the fingerprint gate compares.
   *  The NAME joined the judge's inputs 2026-08-30 (one-cuisine-judge
   *  rederivation), so a renamed place — or this fingerprint-shape change
   *  itself — recomputes, exactly like a prompt edit. */
  private computeInputFingerprint(
    venueName: string,
    summaryText: string | null,
    placeTypes: string[],
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          name: venueName,
          summary: summaryText ?? '',
          types: [...placeTypes].sort(),
          prompt: CUISINE_PROMPT_FINGERPRINT,
        }),
      )
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * S4: resolve the widened response's venue attributes onto the attribute
   * ontology. Matching mirrors the cuisine resolver (name, identity fold, or
   * banked recall surface — fold on both sides); a term the vocabulary has
   * never seen mints a PENDING place_attribute (quarantined until the
   * placement judge adjudicates it), exactly like collection-coined
   * attributes — so synonyms merge into canonical attribute entities instead
   * of forking the vocabulary.
   */
  private async resolveEditorialAttributeIds(values: string[]): Promise<{
    /** The normalized attribute strings that survived scope validation. */
    attributes: string[];
    /** All resolved entity ids (active + pending). */
    ids: string[];
    /** The subset safe for the read-side placeAttributes projection. */
    activeIds: string[];
    mintedPending: boolean;
  }> {
    const normalized = this.normalizeAliasList(values);
    if (!normalized.length) {
      return { attributes: [], ids: [], activeIds: [], mintedPending: false };
    }
    const scopeCheck = this.aliasManagement.validateScopeConstraints(
      EntityType.place_attribute,
      normalized,
    );
    const attributes = this.normalizeAliasList(scopeCheck.validAliases);

    const ids: string[] = [];
    const activeIds: string[] = [];
    let mintedPending = false;
    for (const attribute of attributes) {
      const folded = canonicalFold(attribute);
      const [existing] = await this.prisma.$queryRaw<
        Array<{ entity_id: string; status: string }>
      >`
        SELECT e.entity_id, e.status::text AS status
          FROM core_entities e
         WHERE e.type = 'place_attribute'::entity_type
           AND e.status IN ('active'::entity_status, 'pending'::entity_status)
           AND (
             e.name = ${attribute}
             OR e.identity_key = ${folded}
             OR EXISTS (
               SELECT 1 FROM entity_surface s
                WHERE s.entity_id = e.entity_id
                  AND ${identityScope('s')}
                  AND s.form_folded = ${folded}
             )
           )
         ORDER BY (e.status = 'active'::entity_status) DESC
         LIMIT 1`;
      if (existing) {
        ids.push(existing.entity_id);
        if (existing.status === 'active') activeIds.push(existing.entity_id);
        continue;
      }
      try {
        const created = await this.prisma.entity.create({
          data: {
            name: attribute,
            type: EntityType.place_attribute,
            status: 'pending',
            ...identityInsertData(attribute, EntityType.place_attribute),
          },
          select: { entityId: true },
        });
        await this.prisma.$transaction((tx) =>
          addSurfaces(
            tx,
            created.entityId,
            [{ form: attribute, source: 'extraction' as const }],
            { markEmbeddingStale: false },
          ),
        );
        ids.push(created.entityId);
        mintedPending = true;
      } catch (error) {
        // uq_attribute_identity_key: the find-then-create race loses loudly —
        // refetch the winner (any status the probe accepts).
        const winner = await this.prisma.entity.findFirst({
          where: {
            type: EntityType.place_attribute,
            name: attribute,
            status: { in: ['active', 'pending'] },
          },
          select: { entityId: true, status: true },
        });
        if (winner) {
          ids.push(winner.entityId);
          if (winner.status === 'active') activeIds.push(winner.entityId);
          continue;
        }
        this.logger.warn('Editorial attribute mint failed', {
          attribute,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    return {
      attributes,
      ids: Array.from(new Set(ids)),
      activeIds: Array.from(new Set(activeIds)),
      mintedPending,
    };
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
         WHERE e.type = 'place_attribute'::entity_type
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
        EntityType.place_attribute,
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
      // THE shared minter (redteam-l2 K5): this lane used to mint with
      // neither facet nor status — an ACTIVE facet-NULL row invisible to
      // the cuisine registry, the grain bridge, and placement. Now both
      // cuisine lanes mint through one primitive: facet='cuisine', status
      // explicit, race-safe.
      const minted = await mintCuisineFacetRow(this.prisma, cuisine, {
        forms: createAliases,
        source: 'cuisine',
      });
      if (!minted) {
        this.logger.warn('Cuisine attribute mint failed', { cuisine });
        continue;
      }
      ids.push(minted.entityId);
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

  /**
   * Phase 4b: this lane's claims -> the rebuildable evidence substrate.
   * Two source classes, one writer: 'cuisine_llm' (cuisines — the shipped
   * class, unchanged) and 'editorial_llm' (S4 venue attributes — its own
   * class so this lane can delete/rewrite its attribute claims without
   * touching any other writer's rows, the same ownership contract
   * projection-rebuild has over 'reddit_evidence').
   *
   * `replace: true` (a fresh or fingerprint-changed extraction) deletes the
   * restaurant's rows in BOTH lane-owned classes first, so a re-extraction
   * corrects instead of accumulating; `replace: false` (carry-forward) is
   * additive + skipDuplicates.
   */
  private async recordEvidence(
    placeId: string,
    cuisineAttributeIds: string[],
    editorialAttributeIds: string[],
    options: { replace: boolean },
  ): Promise<void> {
    if (!placeId) return;
    const cuisineIds = Array.from(new Set(cuisineAttributeIds.filter(Boolean)));
    const editorialIds = Array.from(
      new Set(editorialAttributeIds.filter(Boolean)),
    );
    if (!options.replace && !cuisineIds.length && !editorialIds.length) return;
    // No swallow (redteam-l2 K1): the read column is now DERIVED from these
    // rows, so a failed evidence write is a failed extraction — it throws to
    // the caller/queue instead of logging a warn over silently stale search.
    if (options.replace) {
      await this.prisma.placeAttributeEvidence.deleteMany({
        where: {
          placeId,
          sourceClass: { in: ['cuisine_llm', 'editorial_llm'] },
        },
      });
    }
    const data = [
      ...cuisineIds.map((attributeId) => ({
        placeId,
        attributeId,
        sourceClass: 'cuisine_llm',
        observations: 1,
      })),
      ...editorialIds.map((attributeId) => ({
        placeId,
        attributeId,
        sourceClass: 'editorial_llm',
        observations: 1,
      })),
    ];
    if (data.length) {
      await this.prisma.placeAttributeEvidence.createMany({
        data,
        skipDuplicates: true,
      });
    }
  }
}
