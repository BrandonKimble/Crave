import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';

/** Attribute entity types this service canonicalizes. */
export type AttributeEntityType = 'food_attribute' | 'restaurant_attribute';

export type CanonicalizationScope =
  | 'pending' // steady state: place new pending terms against the active ontology
  | 'all'; // one-time bulk: re-cluster the entire (active + pending) vocabulary

interface AttributeRow {
  entityId: string;
  name: string;
  status: string;
}

/** A pending entity confirmed as a brand-new canonical (status -> active). */
export interface PlannedPromotion {
  entityId: string;
  name: string;
  /** Synonym names folded onto this canonical's aliases. */
  aliases: string[];
}

/** One entity folded into another: `merged` is deleted, its refs re-point to `canonical`. */
export interface PlannedMerge {
  canonicalEntityId: string;
  canonicalName: string;
  mergedEntityId: string;
  mergedName: string;
}

/** A term the LLM judged invalid: the entity is deleted (and dropped from any arrays). */
export interface PlannedRejection {
  entityId: string;
  name: string;
  reason: string;
}

export interface CanonicalizationPlan {
  type: AttributeEntityType;
  scope: CanonicalizationScope;
  candidateCount: number;
  promotions: PlannedPromotion[];
  merges: PlannedMerge[];
  rejections: PlannedRejection[];
}

export interface BuildPlanOptions {
  /** How many embedding-nearest canonicals to offer the LLM per decision. */
  shortlistK?: number;
  /** Terms placed concurrently against a frozen canonical snapshot per batch. */
  batchSize?: number;
  /** Max in-flight placement calls. */
  concurrency?: number;
}

export interface ApplyResult {
  /** false when the plan was executed then rolled back (verify mode). */
  applied: boolean;
  promotions: number;
  merges: number;
  rejections: number;
  /** Connection/entity rows whose attribute arrays were re-pointed (merge). */
  refsRepointed: number;
  /** Connection/entity rows an id was stripped from (reject). */
  refsRemoved: number;
}

/** A canonical anchor: an active (or newly-promoted) attribute + its embedding. */
interface Canonical {
  entityId: string;
  name: string;
  vector: number[];
}

const DEFAULT_SHORTLIST_K = 10;
const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_CONCURRENCY = 12;

/** Thrown to abort the apply transaction in verify (dry) mode. */
class PlanRollback extends Error {}

/**
 * Builds (and applies) the canonical attribute ontology via entity resolution.
 *
 * The ontology has no separate table: the canonical vocabulary IS the set of
 * `core_entities` rows of the given attribute type with `status = 'active'`,
 * each carrying its synonyms in `aliases`.
 *
 * Method: embeddings for **recall** (a term's semantically-nearest canonicals,
 * even when spelled differently — "al fresco" ≈ "outdoor seating"), then a narrow
 * LLM **precision** decision placing each term against that shortlist — match an
 * existing canonical / become a new one / reject as junk. This separates same-axis
 * opposite-value pairs ("thick" vs "thin") that pure embedding distance cannot, and
 * is order-stable (no list-clustering). The same routine serves both regimes:
 * bootstrap (`scope: 'all'`, no seed canonicals) and steady-state (`scope:
 * 'pending'`, placing new pending terms against the live active ontology).
 */
@Injectable()
export class AttributeOntologyService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly embeddingService: EmbeddingService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('AttributeOntologyService');
  }

  /**
   * Compute a canonicalization plan without mutating anything.
   *
   * Embeds every candidate (and the seed canonicals), then places each candidate
   * against its embedding-nearest canonicals via a narrow LLM decision. Candidates
   * are processed in batches against a frozen canonical snapshot so a batch runs
   * concurrently; a confirmed `new` canonical is visible to subsequent batches.
   *
   * @param type   which attribute vocabulary to canonicalize
   * @param scope  'pending' (steady state) or 'all' (one-time bootstrap)
   */
  async buildPlan(
    type: AttributeEntityType,
    scope: CanonicalizationScope = 'pending',
    options: BuildPlanOptions = {},
  ): Promise<CanonicalizationPlan> {
    const shortlistK = options.shortlistK ?? DEFAULT_SHORTLIST_K;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

    const rows = await this.fetchAttributeRows(type);
    const activeRows = rows.filter((r) => r.status === 'active');
    const incomingRows =
      scope === 'all' ? rows : rows.filter((r) => r.status === 'pending');

    const plan: CanonicalizationPlan = {
      type,
      scope,
      candidateCount: incomingRows.length,
      promotions: [],
      merges: [],
      rejections: [],
    };

    if (incomingRows.length === 0) {
      this.logger.info('No candidate attributes to canonicalize', {
        type,
        scope,
      });
      return plan;
    }

    // Embed every name we will reason over: the candidates plus (in 'pending'
    // scope) the live active canonicals they are placed against.
    const seedRows = scope === 'all' ? [] : activeRows;
    const namesToEmbed = Array.from(
      new Set([
        ...incomingRows.map((r) => r.name),
        ...seedRows.map((r) => r.name),
      ]),
    );
    const vectorList = await this.embeddingService.embed(namesToEmbed);
    const vectorByName = new Map<string, number[]>();
    namesToEmbed.forEach((name, i) => vectorByName.set(name, vectorList[i]));

    // The growing set of canonical anchors. In 'all' scope it starts empty and
    // canonicals emerge; in 'pending' scope it starts as the live ontology.
    const canonicals: Canonical[] = seedRows.map((r) => ({
      entityId: r.entityId,
      name: r.name,
      vector: vectorByName.get(r.name) ?? [],
    }));

    const batches = this.chunk(incomingRows, batchSize);
    let processed = 0;
    for (const batch of batches) {
      // Freeze the candidate pool for the batch so its placements are independent.
      const snapshot = canonicals.slice();
      const decisions = await this.mapLimit(batch, concurrency, async (row) => {
        const shortlist = this.nearest(
          vectorByName.get(row.name) ?? [],
          snapshot,
          shortlistK,
        );
        const result = await this.llmService.placeAttribute({
          term: row.name,
          kind: type,
          candidates: shortlist.map((c, i) => ({ id: i, name: c.name })),
        });
        return { row, result, shortlist };
      });

      for (const { row, result, shortlist } of decisions) {
        if (result.decision === 'reject') {
          plan.rejections.push({
            entityId: row.entityId,
            name: row.name,
            reason: result.reason,
          });
        } else if (
          result.decision === 'match' &&
          result.candidateId !== null &&
          shortlist[result.candidateId]
        ) {
          const target = shortlist[result.candidateId];
          plan.merges.push({
            canonicalEntityId: target.entityId,
            canonicalName: target.name,
            mergedEntityId: row.entityId,
            mergedName: row.name,
          });
        } else {
          // new canonical: promote if it was pending; always becomes an anchor.
          if (row.status === 'pending') {
            plan.promotions.push({
              entityId: row.entityId,
              name: row.name,
              aliases: [],
            });
          }
          canonicals.push({
            entityId: row.entityId,
            name: row.name,
            vector: vectorByName.get(row.name) ?? [],
          });
        }
      }

      processed += batch.length;
      this.logger.info('Canonicalization batch placed', {
        type,
        scope,
        processed: `${processed}/${incomingRows.length}`,
        canonicals: canonicals.length,
      });
    }

    this.logPlanSummary(plan, canonicals.length);
    return plan;
  }

  /** Top-K canonicals by cosine similarity to a query vector. */
  private nearest(
    query: number[],
    canonicals: Canonical[],
    k: number,
  ): Canonical[] {
    if (query.length === 0 || canonicals.length === 0) return [];
    return canonicals
      .map((c) => ({ c, score: EmbeddingService.cosine(query, c.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.c);
  }

  /** Run an async mapper over items with bounded concurrency, preserving order. */
  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (cursor < items.length) {
          const index = cursor++;
          results[index] = await mapper(items[index]);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  private async fetchAttributeRows(
    type: AttributeEntityType,
  ): Promise<AttributeRow[]> {
    const rows = await this.prisma.entity.findMany({
      where: { type: type as EntityType },
      select: { entityId: true, name: true, status: true },
    });
    return rows.map((r) => ({
      entityId: r.entityId,
      name: r.name,
      status: String(r.status),
    }));
  }

  private logPlanSummary(
    plan: CanonicalizationPlan,
    canonicalCount: number,
  ): void {
    this.logger.info('Canonicalization plan built (dry run — no mutations)', {
      type: plan.type,
      scope: plan.scope,
      candidateCount: plan.candidateCount,
      promotions: plan.promotions.length,
      merges: plan.merges.length,
      rejections: plan.rejections.length,
      canonicals: canonicalCount,
    });
  }

  /**
   * Execute a canonicalization plan. The whole plan runs in ONE transaction:
   * promotions flip status, merges fold synonyms + re-point references + delete
   * the merged entity, rejections strip references + delete. With `apply: false`
   * (the default) the transaction is rolled back after running — verifying the
   * mechanics (and affected-row counts) against real data without persisting.
   *
   * The merged/rejected attribute ids live in `core_restaurant_items.food_attributes`
   * (food) or `core_entities.restaurant_attributes` (restaurant) — those are the
   * only array columns that hold an attribute id, so re-pointing is type-scoped.
   */
  async applyPlan(
    plan: CanonicalizationPlan,
    options: { apply: boolean } = { apply: false },
  ): Promise<ApplyResult> {
    this.assertPlanConsistent(plan);

    const counts: ApplyResult = {
      applied: false,
      promotions: 0,
      merges: 0,
      rejections: 0,
      refsRepointed: 0,
      refsRemoved: 0,
    };

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const promotion of plan.promotions) {
            counts.promotions += await tx.$executeRawUnsafe(
              `UPDATE core_entities SET status = 'active'
               WHERE entity_id = $1::uuid AND status = 'pending'`,
              promotion.entityId,
            );
          }

          for (const merge of plan.merges) {
            // Fold the merged entity's name + aliases onto the canonical.
            await tx.$executeRawUnsafe(
              `UPDATE core_entities y
               SET aliases = (
                 SELECT array_agg(DISTINCT a)
                 FROM unnest(y.aliases || ARRAY[x.name] || x.aliases) a
               )
               FROM core_entities x
               WHERE y.entity_id = $1::uuid AND x.entity_id = $2::uuid`,
              merge.canonicalEntityId,
              merge.mergedEntityId,
            );
            counts.refsRepointed += await this.repointMergeRefs(
              tx,
              plan.type,
              merge.mergedEntityId,
              merge.canonicalEntityId,
            );
            counts.merges += await tx.$executeRawUnsafe(
              `DELETE FROM core_entities WHERE entity_id = $1::uuid`,
              merge.mergedEntityId,
            );
          }

          for (const rejection of plan.rejections) {
            counts.refsRemoved += await this.removeRejectRefs(
              tx,
              plan.type,
              rejection.entityId,
            );
            counts.rejections += await tx.$executeRawUnsafe(
              `DELETE FROM core_entities WHERE entity_id = $1::uuid`,
              rejection.entityId,
            );
          }

          if (!options.apply) {
            throw new PlanRollback('verify');
          }
        },
        { timeout: 120_000, maxWait: 15_000 },
      );
      counts.applied = true;
    } catch (error) {
      if (!(error instanceof PlanRollback)) throw error;
    }

    this.logger.info(
      counts.applied
        ? 'Canonicalization plan APPLIED'
        : 'Canonicalization plan verified (rolled back — no mutations)',
      {
        type: plan.type,
        scope: plan.scope,
        ...counts,
      },
    );
    return counts;
  }

  /**
   * Reject any plan where one entity would play two conflicting roles (e.g. a
   * canonical target that is also merged away, or merged-and-rejected). A
   * promoted entity doubling as a canonical is fine — that is the expected case.
   */
  private assertPlanConsistent(plan: CanonicalizationPlan): void {
    const merged = new Set(plan.merges.map((m) => m.mergedEntityId));
    const rejected = new Set(plan.rejections.map((r) => r.entityId));
    const canonicals = new Set(plan.merges.map((m) => m.canonicalEntityId));
    const promoted = new Set(plan.promotions.map((p) => p.entityId));

    const conflicts: string[] = [];
    for (const id of merged) {
      if (rejected.has(id)) conflicts.push(`${id}: merged and rejected`);
      if (canonicals.has(id)) conflicts.push(`${id}: merged and a canonical`);
    }
    for (const id of promoted) {
      if (merged.has(id)) conflicts.push(`${id}: promoted and merged`);
      if (rejected.has(id)) conflicts.push(`${id}: promoted and rejected`);
    }
    for (const id of canonicals) {
      if (rejected.has(id)) conflicts.push(`${id}: canonical and rejected`);
    }

    if (conflicts.length > 0) {
      throw new Error(
        `Inconsistent canonicalization plan — refusing to apply:\n${conflicts.join('\n')}`,
      );
    }
  }

  /** Re-point a merged attribute id to its canonical in the type's array column. */
  private repointMergeRefs(
    tx: Prisma.TransactionClient,
    type: AttributeEntityType,
    mergedId: string,
    canonicalId: string,
  ): Promise<number> {
    if (type === 'food_attribute') {
      return tx.$executeRawUnsafe(
        `UPDATE core_restaurant_items
         SET food_attributes = (
           SELECT array_agg(DISTINCT e)
           FROM unnest(array_replace(food_attributes, $1::uuid, $2::uuid)) e
         )
         WHERE $1::uuid = ANY(food_attributes)`,
        mergedId,
        canonicalId,
      );
    }
    return tx.$executeRawUnsafe(
      `UPDATE core_entities
       SET restaurant_attributes = (
         SELECT array_agg(DISTINCT e)
         FROM unnest(array_replace(restaurant_attributes, $1::uuid, $2::uuid)) e
       )
       WHERE $1::uuid = ANY(restaurant_attributes)`,
      mergedId,
      canonicalId,
    );
  }

  /** Strip a rejected attribute id from the type's array column. */
  private removeRejectRefs(
    tx: Prisma.TransactionClient,
    type: AttributeEntityType,
    id: string,
  ): Promise<number> {
    if (type === 'food_attribute') {
      return tx.$executeRawUnsafe(
        `UPDATE core_restaurant_items
         SET food_attributes = array_remove(food_attributes, $1::uuid)
         WHERE $1::uuid = ANY(food_attributes)`,
        id,
      );
    }
    return tx.$executeRawUnsafe(
      `UPDATE core_entities
       SET restaurant_attributes = array_remove(restaurant_attributes, $1::uuid)
       WHERE $1::uuid = ANY(restaurant_attributes)`,
      id,
    );
  }

  private chunk<T>(items: T[], size: number): T[][] {
    if (size <= 0) return [items];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  }
}
