import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { LoggerService } from '../../shared';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';
import { addSurfaces } from '../content-processing/entity-resolver/entity-surface.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttributeDedupeMergeService } from './attribute-dedupe-merge.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';
import { LLMAttributePlacementResult } from '../external-integrations/llm/llm.types';
import { stripAttributeIdRefs } from './attribute-reference-registry';
import { EntityEmbeddingReconcilerService } from '../entity-text-search/entity-embedding-reconciler.service';

/** Attribute entity types this service canonicalizes. */
export type AttributeEntityType = 'item_attribute' | 'place_attribute';

/**
 * D2 context standard: real carriers of each live tag — the evidence that
 * killed piano bar→live music in the ledger audit. One grouped query per
 * caller; capped at 3 names per tag on the wire. Shared by the placement
 * bench (this service) and the pair bench (attribute-dedupe-merge), so the
 * two courts read the same evidence.
 */
export async function fetchAttributeCarriers(
  prisma: PrismaService,
  type: AttributeEntityType,
  attributeIds: string[],
): Promise<Map<string, string[]>> {
  if (!attributeIds.length) return new Map();
  const rows =
    type === 'place_attribute'
      ? await prisma.$queryRaw<
          Array<{ attribute_id: string; carriers: string[] }>
        >(Prisma.sql`
          SELECT x.attribute_id::text, (array_agg(x.name))[1:3] AS carriers
            FROM (
              SELECT unnest(e.restaurant_attributes) AS attribute_id, e.name
                FROM core_entities e
               WHERE e.type = 'place' AND e.status = 'active'
            ) x
           WHERE x.attribute_id = ANY(${attributeIds}::uuid[])
           GROUP BY x.attribute_id`)
      : await prisma.$queryRaw<
          Array<{ attribute_id: string; carriers: string[] }>
        >(Prisma.sql`
          SELECT x.attribute_id::text, (array_agg(DISTINCT x.name))[1:3]
                   AS carriers
            FROM (
              SELECT unnest(c.food_attributes) AS attribute_id, f.name
                FROM core_restaurant_items c
                JOIN core_entities f ON f.entity_id = c.food_id
            ) x
           WHERE x.attribute_id = ANY(${attributeIds}::uuid[])
           GROUP BY x.attribute_id`);
  return new Map(rows.map((r) => [r.attribute_id, r.carriers ?? []]));
}

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
  /** The placement judge's stated ground — recorded with the merge verdict
   *  (the reason tripwire reads it). */
  reason: string;
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
  /** Connection/entity rows an id was re-pointed on. Merges now execute
   *  through the ledgered merge door, which repoints via the reference
   *  registry and reports in its own log — this counter no longer covers
   *  them (0 for merges). */
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
  /** D2 context standard: a few real carriers (places/dishes) of this tag,
   *  shown to the placement judge as `used_by`. Seeds only — a canonical
   *  minted this run has no carriers yet. */
  usedBy?: string[];
}

const DEFAULT_SHORTLIST_K = 10;
const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_CONCURRENCY = 12;

/**
 * A tuning knob is either absent (take the measured default) or a positive
 * integer. Zero/negative/fractional is refused HERE, at the argv boundary, so
 * no downstream loop has to defend against `chunk(0)` or a fractional stride.
 */
function requirePositiveInt(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `${label} must be a positive integer; got ${value}. ` +
        `A non-positive batch/shortlist size silently runs the whole set unbatched.`,
    );
  }
  return value;
}

/** Tokens too generic to be a useful shared-token recall signal. */
/**
 * LEXICAL-RECALL FLOOR — MEASURED, 2026-08-03, against the live vocabulary
 * (411 active restaurant_attribute entities on the local mirror, 84,255
 * distinct pairs). F368 found this as a bare `>= 0.4` in a method that cites a
 * measured figure for its OTHER arm.
 *
 * Jaccard-over-character-trigrams admits, at each floor:
 *   0.3 → 205 pairs (0.24%) — the tail is noise ('juice shop'/'spice house')
 *   0.4 →  56 pairs (0.07%) — every one a real near-duplicate the LLM must
 *          adjudicate: cocktails/serves cocktails, breakfast/serves breakfast,
 *          korean/korean bbq, delivery/free delivery, parking/valet parking
 *   0.5 →  19 pairs — LOSES cocktails/serves cocktails, breakfast/serves
 *          breakfast and mexican/mexican owned, i.e. exactly the collisions
 *          adjudication exists to catch
 * This arm is RECALL ONLY — the LLM adjudicates whatever it shortlists — so
 * the honest floor is the lowest one whose admissions are all real, which is
 * where 0.4 sits. Re-measure it against the vocabulary, never tune it.
 */
export const TRIGRAM_NEAR_DUPLICATE_FLOOR = 0.4;

/**
 * SIGNIFICANT-TOKEN LENGTH — MEASURED on the same corpus. Shared-token recall
 * admits 716 pairs at a 3-character floor. Dropping the floor to 1 or 2 adds
 * exactly 18 pairs, and EVERY one of them is joined by an English function
 * word rather than a shared concept: 'no frills'/'no cash', 'no
 * tipping'/'no reservations', 'wine on tap'/'on a boat', 'dine in'/'hole in
 * the wall'. Raising it to 4 drops 305 real pairs. Every token shorter than 3
 * in the live vocabulary is a function word or a fragment ('a', 'in', 'no',
 * 'on', 'up', 's', 'fu', 'na') — which is the derivation: 3 is the shortest
 * length at which no function word survives.
 */
export const SIGNIFICANT_TOKEN_MIN_LENGTH = 3;

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

/** Tokenize an attribute name for lexical recall — lowercased, non-alnum
 *  split, stopwords dropped. Module-level and pure so the active-vocabulary
 *  dedupe lane's candidate generator shares THE one implementation. */
export function attributeTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !SHORTLIST_STOPWORDS.has(t));
}

/** True if the two names share a significant non-stopword token. */
export function sharesSignificantToken(a: string, b: string): boolean {
  const tokens = new Set(attributeTokens(a));
  return attributeTokens(b).some(
    (t) => t.length >= SIGNIFICANT_TOKEN_MIN_LENGTH && tokens.has(t),
  );
}

/** Jaccard similarity over character trigrams (lexical near-dup signal). */
export function trigramJaccard(a: string, b: string): number {
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
    /** THE merge door — every attribute merge, ontology-decided or
     *  dedupe-decided, is ledgered and executed by one implementation. */
    private readonly dedupeMerge: AttributeDedupeMergeService,
    private readonly entityEmbeddings: EntityEmbeddingReconcilerService,
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
   * RUN SIZE IS NOT CAPPED HERE, DELIBERATELY (F357). The loop issues one
   * `placeAttribute` call per candidate, one per new canonical, one
   * `chooseAttributeName` per canonical that absorbed synonyms, plus an
   * embedding pass over every candidate AND (in 'pending' scope) every active
   * canonical — and `candidateCount` is however many `pending` rows collection
   * happened to mint. A per-run candidate cap would be a number nobody has
   * measured, and this repo does not seed priors; so the bound is an EXISTING
   * governed one instead: the adjudication job now carries the enqueuing
   * work's campaignId and the worker re-establishes it, so a run triggered
   * during a reload/re-extract campaign debits that campaign's envelope and
   * stops when it breaches. Outside a campaign the run is bounded only by the
   * monthly Gemini spend gate the individual calls already ride.
   *
   * @param type   which attribute vocabulary to canonicalize
   * @param scope  'pending' (steady state) or 'all' (one-time bootstrap)
   */
  async buildPlan(
    type: AttributeEntityType,
    scope: CanonicalizationScope = 'pending',
    options: BuildPlanOptions = {},
  ): Promise<CanonicalizationPlan> {
    // These flow straight from CLI argv into a loop that issues one Gemini
    // call per candidate; `chunk` used to treat size <= 0 as "one batch of
    // everything", so `--batch=0` on a 40k-candidate run silently became one
    // unbatched mapLimit (F4946). Refuse a non-positive knob at the boundary
    // rather than let it degrade the run silently.
    const shortlistK = requirePositiveInt(
      options.shortlistK,
      DEFAULT_SHORTLIST_K,
      'shortlistK',
    );
    const batchSize = requirePositiveInt(
      options.batchSize,
      DEFAULT_BATCH_SIZE,
      'batchSize',
    );
    const concurrency = requirePositiveInt(
      options.concurrency,
      DEFAULT_CONCURRENCY,
      'concurrency',
    );

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
    // EmbeddingService.embed returns ONE VECTOR PER INPUT OR THROWS
    // ("Embedding count mismatch: requested N, got M"), and every name here is
    // inserted positionally from that same array — so this map cannot miss a
    // name that is in it. Three `?? []` fallbacks used to sit downstream
    // pretending otherwise (F368); what they actually accomplished was to turn
    // an impossible empty vector into `cos: 0` for every canonical, i.e. to
    // silently degrade the semantic-recall arm into "the first k canonicals in
    // arbitrary order" while the logs reported success. A fallback that
    // quietly weakens the algorithm is worse than a crash, because the plan it
    // produces still looks like a plan. The contract is relied on, not
    // re-checked.
    const vectorList = await this.embeddingService.embed(namesToEmbed);
    const vectorByName = new Map<string, number[]>();
    namesToEmbed.forEach((name, i) => vectorByName.set(name, vectorList[i]));
    const vectorFor = (name: string): number[] => {
      const vector = vectorByName.get(name);
      if (!vector) {
        // Not defensiveness — a broken contract, said out loud.
        throw new Error(
          `Attribute adjudication has no embedding for '${name}'; ` +
            `EmbeddingService.embed returns one vector per input or throws.`,
        );
      }
      return vector;
    };

    // The growing set of canonical anchors. In 'all' scope it starts empty and
    // canonicals emerge; in 'pending' scope it starts as the live ontology.
    const carriersById = await this.fetchCarriers(
      type,
      seedRows.map((r) => r.entityId),
    );
    const canonicals: Canonical[] = seedRows.map((r) => ({
      entityId: r.entityId,
      name: r.name,
      vector: vectorFor(r.name),
      isSeed: true,
      usedBy: carriersById.get(r.entityId),
    }));

    // PASS 1 — place each candidate against its nearest canonicals.
    const batches = this.chunk(incomingRows, batchSize);
    let processed = 0;
    for (const batch of batches) {
      // Freeze the candidate pool for the batch so its placements are independent.
      const snapshot = canonicals.slice();
      const decisions = await this.mapLimit(batch, concurrency, (row) =>
        this.place(row, type, vectorFor, snapshot, shortlistK),
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
            reason: result.reason ?? '(audit reasons off)',
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
            vector: vectorFor(row.name),
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
    vectorFor: (name: string) => number[],
    snapshot: Canonical[],
    shortlistK: number,
  ): Promise<{
    row: AttributeRow;
    result: LLMAttributePlacementResult;
    shortlist: Canonical[];
  }> {
    const shortlist = this.buildShortlist(
      row.name,
      vectorFor(row.name),
      snapshot,
      shortlistK,
    );
    const result = await this.llmService.placeAttribute({
      term: row.name,
      kind: type,
      candidates: shortlist.map((c, i) => ({
        id: i,
        name: c.name,
        usedBy: c.usedBy,
      })),
    });
    return { row, result, shortlist };
  }

  private fetchCarriers(
    type: AttributeEntityType,
    attributeIds: string[],
  ): Promise<Map<string, string[]>> {
    return fetchAttributeCarriers(this.prisma, type, attributeIds);
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
        candidates: shortlist.map((c, i) => ({
          id: i,
          name: c.name,
          usedBy: c.usedBy,
        })),
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
          reason: result.reason ?? '(audit reasons off)',
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
    // No empty-vector branch: every vector here came from `vectorFor`, which
    // throws rather than hand back a missing embedding (F368).
    const scored = canonicals.map((c) => ({
      c,
      cos: EmbeddingService.cosine(vector, c.vector),
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
        this.trigramSim(name, c.name) >= TRIGRAM_NEAR_DUPLICATE_FLOOR
      ) {
        picked.set(c.entityId, c);
      }
    }
    return Array.from(picked.values());
  }

  /**
   * True if the two names share a SIGNIFICANT non-stopword token — significant
   * meaning at least SIGNIFICANT_TOKEN_MIN_LENGTH characters.
   */
  private sharesToken(a: string, b: string): boolean {
    return sharesSignificantToken(a, b);
  }

  private trigramSim(a: string, b: string): number {
    return trigramJaccard(a, b);
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
   * The merged/rejected attribute ids are re-pointed/stripped at every site
   * declared in attribute-reference-registry.ts — the registry (not this
   * comment) is the exhaustiveness claim, and its scanner spec fails the
   * build when a uuid[] column appears in the schema unclassified.
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

    // MERGES GO THROUGH THE ONE MERGE DOOR (red team 2026-09-04 ID-3),
    // each its own ledgered transaction: verdict recorded in the
    // attribute_merge lane, refs repointed, anchors rehomed, redirect
    // written, loser's name folded at 'judged'. They run BEFORE the
    // promotions/rejections/renames transaction so the group's aliases are
    // already folded in when renames run (the order the old in-tx loop
    // kept). Verify mode (apply:false) COUNTS planned merges and executes
    // none — a ledgered merge cannot be rolled back with the rest.
    if (options.apply) {
      for (const merge of plan.merges) {
        const outcome = await this.dedupeMerge.mergeDecidedElsewhere({
          type: plan.type,
          winnerId: merge.canonicalEntityId,
          winnerName: merge.canonicalName,
          loserId: merge.mergedEntityId,
          loserName: merge.mergedName,
          reason: merge.reason,
        });
        if (outcome === 'merge') counts.merges += 1;
      }
    } else {
      counts.merges = plan.merges.length;
    }

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
            // IDENTITY FOLLOWS THE NAME (multilingual-plan round-3 audit:
            // this UPDATE set name but not the app-written identity keys,
            // so after an LLM rename the unique index and every probe
            // silently referred to the OLD display string — latent
            // identity drift, one adjudication run from live).
            // round-4: use the row's REAL type, not a hardcoded one — the
            // pass renames both attribute types (identical fold semantics
            // today; latent divergence trap otherwise).
            // F4947: DERIVE the type from the plan, not a DB re-query with a
            // `?? 'food_attribute'` fallback. Every rename in a plan came from
            // rows fetched for `plan.type` (buildPlan → fetchAttributeRows), so
            // `plan.type` IS this row's type — the old lookup could silently
            // write a food_attribute-keyed identity onto a restaurant_attribute
            // when the row read returned []. AttributeEntityType is a subset of
            // EntityType, so no cast and no fallback is representable.
            const identity = identityInsertData(rename.to, plan.type);
            counts.renames += await tx.$executeRawUnsafe(
              // fold_version travels WITH the keys (one-fold law): this raw
              // re-key writes everything identityInsertData computed,
              // version included — a rename used to stamp new keys under the
              // row's OLD fold_version, mislabeling which algorithm spelled
              // them.
              `UPDATE core_entities
               SET name = $2,
                   identity_key = $3,
                   identity_key_sorted = $4,
                   fold_version = $5,
                   name_embedding_stale = true
               WHERE entity_id = $1::uuid`,
              rename.entityId,
              rename.to,
              identity.identityKey,
              identity.identityKeySorted,
              identity.foldVersion,
            );
            // A1 + N10: the demoted OLD DISPLAY NAME becomes a tagged,
            // sourced alias ROW instead of being laundered anonymously
            // into the untagged bag — 'ontology_rename' IS the label
            // history the plan asked for. The new name is DEPRECATED as a
            // surface (it is the display string now, not an alias),
            // replacing the old array_remove: demotion is remembered, so
            // a later writer re-proposing it does not silently resurrect
            // the name into its own recall bag.
            await addSurfaces(
              tx,
              rename.entityId,
              [{ form: rename.from, source: 'ontology_rename' }],
              { deprecateForms: [rename.to] },
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
    if (counts.applied) {
      // Write-time embedding law: renamed rows (name_embedding_stale set
      // in the tx above) and merge winners (flagged by the merge door)
      // re-embed now, after the commit.
      await this.entityEmbeddings.embedEntities([
        ...plan.renames.map((rename) => rename.entityId),
        ...plan.merges.map((merge) => merge.canonicalEntityId),
        ...plan.promotions.map((promotion) => promotion.entityId),
      ]);
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

  /** Strip a rejected attribute id at EVERY registered reference site —
   *  delegated to THE one implementation (attribute-reference-registry.ts). */
  private async removeRejectRefs(
    tx: Prisma.TransactionClient,
    type: AttributeEntityType,
    id: string,
  ): Promise<number> {
    return stripAttributeIdRefs(tx, type, id);
  }

  private chunk<T>(items: T[], size: number): T[][] {
    // size is a positive integer by construction (requirePositiveInt at the
    // buildPlan boundary) — no silent "size <= 0 => one unbatched pass" branch.
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  }
}
