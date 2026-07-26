import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';
import { LLMAttributePlacementResult } from '../external-integrations/llm/llm.types';

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

/** A surviving canonical relabeled to its group's clearest display name. */
export interface PlannedRename {
  entityId: string;
  from: string;
  to: string;
}

export interface CanonicalizationPlan {
  type: AttributeEntityType;
  scope: CanonicalizationScope;
  candidateCount: number;
  promotions: PlannedPromotion[];
  merges: PlannedMerge[];
  rejections: PlannedRejection[];
  renames: PlannedRename[];
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
  renames: number;
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
  /** A pre-existing active canonical (stable); false for ones created this run. */
  isSeed: boolean;
}

const DEFAULT_SHORTLIST_K = 10;
const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_CONCURRENCY = 12;

/** Tokens too generic to be a useful shared-token recall signal. */
const SHORTLIST_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'for',
  'with',
  'and',
  'or',
  'to',
  'in',
  'on',
  'at',
  'is',
  'it',
  'no',
  'not',
]);

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
      renames: [],
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
      isSeed: true,
    }));

    // PASS 1 — place each candidate against its nearest canonicals.
    const batches = this.chunk(incomingRows, batchSize);
    let processed = 0;
    for (const batch of batches) {
      // Freeze the candidate pool for the batch so its placements are independent.
      const snapshot = canonicals.slice();
      const decisions = await this.mapLimit(batch, concurrency, (row) =>
        this.place(row, type, vectorByName, snapshot, shortlistK),
      );

      for (const { row, result, shortlist } of decisions) {
        if (result.decision === 'reject') {
          plan.rejections.push({
            entityId: row.entityId,
            name: row.name,
            reason: result.reason ?? '(audit reasons off)',
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
            isSeed: false,
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

    // PASS 2 — dedupe canonicals created this run against the rest. Batching in
    // pass 1 lets two synonyms in different batches both become canonicals; here
    // each new canonical is re-placed against the others, and a match folds it in
    // (re-pointing pass-1 merges + dropping its promotion). Seeds are stable.
    const survivors = await this.dedupeNewCanonicals(
      canonicals,
      type,
      shortlistK,
      plan,
    );

    // PASS 3 — name the new groups. Pass 1 makes whichever synonym arrived first
    // the label ("huge" beating "generous portion"); once the full group is known,
    // let the LLM pick the clearest consumer-facing display name. Display-only:
    // matching weighs name and aliases equally, but autocomplete and tag chips
    // render the name. Seeds keep their live labels.
    await this.nameNewCanonicals(survivors, type, plan);

    this.logPlanSummary(plan, survivors.length);
    return plan;
  }

  /** Choose display names for non-seed canonicals that absorbed synonyms. */
  private async nameNewCanonicals(
    survivors: Canonical[],
    type: AttributeEntityType,
    plan: CanonicalizationPlan,
  ): Promise<void> {
    const mergedNamesByCanonical = new Map<string, string[]>();
    for (const merge of plan.merges) {
      const list = mergedNamesByCanonical.get(merge.canonicalEntityId) ?? [];
      list.push(merge.mergedName);
      mergedNamesByCanonical.set(merge.canonicalEntityId, list);
    }

    for (const canonical of survivors) {
      if (canonical.isSeed) continue;
      const groupNames = mergedNamesByCanonical.get(canonical.entityId);
      if (!groupNames || groupNames.length === 0) continue;

      const chosen = await this.llmService.chooseAttributeName({
        kind: type,
        names: [canonical.name, ...groupNames],
      });
      if (chosen && chosen !== canonical.name) {
        plan.renames.push({
          entityId: canonical.entityId,
          from: canonical.name,
          to: chosen,
        });
      }
    }
  }

  /** Place one row against a frozen canonical snapshot (pass-1 unit of work). */
  private async place(
    row: AttributeRow,
    type: AttributeEntityType,
    vectorByName: Map<string, number[]>,
    snapshot: Canonical[],
    shortlistK: number,
  ): Promise<{
    row: AttributeRow;
    result: LLMAttributePlacementResult;
    shortlist: Canonical[];
  }> {
    const shortlist = this.buildShortlist(
      row.name,
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
  }

  /**
   * Fold near-duplicate canonicals created this run into earlier survivors.
   * Processes new canonicals sequentially against the surviving pool (seeds +
   * already-kept new ones); a `match` re-points that canonical's pass-1 merges to
   * the target, drops its promotion, and records it as a merge. Returns the
   * surviving canonicals.
   */
  private async dedupeNewCanonicals(
    canonicals: Canonical[],
    type: AttributeEntityType,
    shortlistK: number,
    plan: CanonicalizationPlan,
  ): Promise<Canonical[]> {
    const survivors = canonicals.filter((c) => c.isSeed);
    const fresh = canonicals.filter((c) => !c.isSeed);
    let folded = 0;

    for (const canonical of fresh) {
      const shortlist = this.buildShortlist(
        canonical.name,
        canonical.vector,
        survivors,
        shortlistK,
      );
      if (shortlist.length === 0) {
        survivors.push(canonical);
        continue;
      }
      const result = await this.llmService.placeAttribute({
        term: canonical.name,
        kind: type,
        candidates: shortlist.map((c, i) => ({ id: i, name: c.name })),
      });

      if (
        result.decision === 'match' &&
        result.candidateId !== null &&
        shortlist[result.candidateId]
      ) {
        const target = shortlist[result.candidateId];
        // Re-point every pass-1 merge that pointed at this canonical to target.
        for (const merge of plan.merges) {
          if (merge.canonicalEntityId === canonical.entityId) {
            merge.canonicalEntityId = target.entityId;
            merge.canonicalName = target.name;
          }
        }
        // A new canonical is never a real promotion if it folds away.
        plan.promotions = plan.promotions.filter(
          (p) => p.entityId !== canonical.entityId,
        );
        plan.merges.push({
          canonicalEntityId: target.entityId,
          canonicalName: target.name,
          mergedEntityId: canonical.entityId,
          mergedName: canonical.name,
        });
        folded++;
      } else {
        survivors.push(canonical);
      }
    }

    if (folded > 0) {
      this.logger.info('Canonical dedupe folded near-duplicates', {
        type,
        folded,
        survivors: survivors.length,
      });
    }
    return survivors;
  }

  /**
   * Candidate shortlist for a term: the union of three recall signals, so a true
   * synonym is surfaced whether it is semantically close, shares a token, or is
   * lexically near. Embedding alone (a narrow 0.78–0.96 cosine band for short
   * phrases) misses token-overlap pairs (`live jazz`/`live music`) and lexical
   * near-dups (`walk-ins`/`walk-ins only`) — the LLM can only merge what it sees.
   */
  private buildShortlist(
    name: string,
    vector: number[],
    canonicals: Canonical[],
    k: number,
  ): Canonical[] {
    if (canonicals.length === 0) return [];
    const scored = canonicals.map((c) => ({
      c,
      cos:
        vector.length && c.vector.length
          ? EmbeddingService.cosine(vector, c.vector)
          : 0,
    }));

    // Embedding top-K (semantic recall).
    const picked = new Map<string, Canonical>();
    for (const s of [...scored].sort((a, b) => b.cos - a.cos).slice(0, k)) {
      picked.set(s.c.entityId, s.c);
    }
    // Lexical recall: any canonical that shares a significant token or is
    // trigram-near — catches token-overlap and near-identical spellings that the
    // embedding neighbourhood buries.
    for (const c of canonicals) {
      if (picked.has(c.entityId)) continue;
      if (
        this.sharesToken(name, c.name) ||
        this.trigramSim(name, c.name) >= 0.4
      ) {
        picked.set(c.entityId, c);
      }
    }
    return Array.from(picked.values());
  }

  /** True if the two names share a significant (length ≥ 3) non-stopword token. */
  private sharesToken(a: string, b: string): boolean {
    const tokens = new Set(this.tokenize(a));
    return this.tokenize(b).some((t) => t.length >= 3 && tokens.has(t));
  }

  private tokenize(name: string): string[] {
    return name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !SHORTLIST_STOPWORDS.has(t));
  }

  /** Jaccard similarity over character trigrams (lexical near-duplicate signal). */
  private trigramSim(a: string, b: string): number {
    const grams = (s: string): Set<string> => {
      const x = `  ${s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()}  `;
      const set = new Set<string>();
      for (let i = 0; i < x.length - 2; i++) set.add(x.slice(i, i + 3));
      return set;
    };
    const A = grams(a);
    const B = grams(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return inter / (A.size + B.size - inter);
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
      renames: plan.renames.length,
      canonicals: canonicalCount,
    });
  }

  /**
   * Execute a canonicalization plan. The whole plan runs in ONE transaction:
   * promotions flip status, merges fold synonyms + re-point references +
   * archive the merged entity, rejections strip references + archive. Entities
   * are NEVER hard-deleted: in-flight extractions hold resolved ids in memory
   * for minutes, and a delete here turns their later event/ref writes into FK
   * crashes. Archived rows are invisible to read surfaces and to resolution's
   * match tiers; rejected tombstones additionally absorb repeat mentions of
   * the same junk term (resolution's creation path sinks to them), so nothing
   * is re-judged. With `apply: false`
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
      renames: 0,
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
               ),
               name_embedding_stale = true
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
            // ARCHIVE, never delete: a live extraction may hold this id in
            // memory (event/ref writes land after adjudication) — a hard
            // delete turns that into an FK crash. The tombstone keeps the FK
            // world closed; read surfaces exclude non-active, and future
            // mentions forward to the canonical via the banked alias because
            // resolution tiers skip archived rows.
            counts.merges += await tx.$executeRawUnsafe(
              `UPDATE core_entities SET status = 'archived'
               WHERE entity_id = $1::uuid`,
              merge.mergedEntityId,
            );
          }

          for (const rejection of plan.rejections) {
            counts.refsRemoved += await this.removeRejectRefs(
              tx,
              plan.type,
              rejection.entityId,
            );
            // ARCHIVE, never delete (same FK-safety contract as merges).
            // The rejected tombstone also becomes a SINK: resolution reuses
            // it for repeat mentions of the junk term instead of minting a
            // fresh pending entity, so the judge never re-adjudicates the
            // same term. Its refs stay inert (read surfaces are active-only).
            counts.rejections += await tx.$executeRawUnsafe(
              `UPDATE core_entities SET status = 'archived'
               WHERE entity_id = $1::uuid`,
              rejection.entityId,
            );
          }

          // After merges so the group's aliases are already folded in: relabel,
          // keep the old name as an alias, drop the new name from the aliases.
          for (const rename of plan.renames) {
            counts.renames += await tx.$executeRawUnsafe(
              `UPDATE core_entities
               SET name = $2,
                   aliases = (
                     SELECT array_agg(DISTINCT a)
                     FROM unnest(array_remove(aliases || ARRAY[$3]::varchar[], $2)) a
                   ),
                   name_embedding_stale = true
               WHERE entity_id = $1::uuid`,
              rename.entityId,
              rename.to,
              rename.from,
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
