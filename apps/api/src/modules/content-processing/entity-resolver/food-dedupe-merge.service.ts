import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { itemNameVariants, isSameItemUpToNumber } from './food-lemma';
import {
  accentsAgreeUnbanked,
  canonicalFold,
  entityLockKey,
  identityInsertData,
} from './entity-identity';
import {
  acquireIdentityMergeLocks,
  finalizeMergeCompletion,
  rekeyEntityDimensionEventsToCanonical,
} from '../reddit-collector/extraction-scope.service';
import { LoggerService } from '../../../shared';
import {
  bannedMergeReasonClass,
  refusedMergeHoldReason,
} from '../../../shared/merge-reason-tripwire';
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { activeSupportExistsSql } from '../reddit-collector/extraction-scope.service';
import { ClaimRehearingBudgetService } from './claim-rehearing-budget.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import {
  ENTITY_DEDUPE_LANE,
  entityDedupeLane,
} from './entity-dedupe-lane.adapter';
import {
  ENTITY_DEDUPE_RULE_FINGERPRINT,
  ENTITY_DEDUPE_RULE_VERSION,
} from './entity-dedupe-rule';
import { EntityEmbeddingReconcilerService } from '../../entity-text-search/entity-embedding-reconciler.service';

export interface DedupeMergeSummary {
  candidatePairs: number;
  autoMerged: number;
  judgeMerged: number;
  judgeRejected: number;
  /** Pairs already ruled on at the current rule version — the ledger's
   *  memory working: a judged pair is never re-bought by a re-scan. */
  judgeAlreadyDecided: number;
  /** Judge-lane pairs held unheard because the activation gate is off. */
  judgeHeld: number;
  /** Judge returned no verdict or no stated ground — left unjudged, never
   *  recorded, re-offered next run (H5 amendment (d)). */
  judgeUnjudged: number;
}

/**
 * THE FULL MERGE PLAN — everything the effect needs, computed BEFORE the
 * verdict commits and stored as its subject. A crash-resume replays THIS,
 * never a recomputation: the corpus may have moved since the ruling, and the
 * effect must obey the decision that was actually made.
 */
export interface ItemMergePlan {
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
  /** Which vocabulary the pair lives in. Absent on plans stored before the
   *  ingredient extension (entity-type coverage audit F-2) — those were all
   *  item plans, so the executor defaults to 'item'. */
  entityType?: DedupeSweepType;
}

/** The two vocabularies the sweep scans (coverage audit F-2): dishes and
 *  ingredients. NEVER cross-type — 'beef' the ingredient and 'beef' the
 *  dish-word are deliberately distinct entities; each type is its own
 *  candidate universe, its own judge doctrine (matchEntitiesBatch kind),
 *  and its own advisory-lock namespace. */
export const DEDUPE_SWEEP_TYPES = [
  EntityType.item,
  EntityType.ingredient,
] as const;
export type DedupeSweepType = (typeof DEDUPE_SWEEP_TYPES)[number];

/** Active-support predicate per vocabulary. Items are supported by carrying
 *  a connection (the D5 predicate). An ingredient is never a connection's
 *  food_id — its evidence is REFERENCE: a connection's source-faithful
 *  `ingredients` array or an active dish's synthesized
 *  `canonical_ingredients`. Same D5 intent (never merge shadow-minted
 *  vocabulary): both tiers are written only by the active graph. */
function sweepSupportSql(type: DedupeSweepType, entityRef: string): string {
  if (type === EntityType.ingredient) {
    return `(EXISTS (
      SELECT 1 FROM core_restaurant_items c_scope
      WHERE c_scope.ingredients @> ARRAY[${entityRef}]
    ) OR EXISTS (
      SELECT 1 FROM core_entities f_scope
      WHERE f_scope.canonical_ingredients @> ARRAY[${entityRef}]
        AND f_scope.status = 'active'
    ))`;
  }
  return activeSupportExistsSql(entityRef);
}

/**
 * Anti-join on the hearing ledger, IN THE CANDIDATE QUERY (red-team F2,
 * plans/wave-redteam-report.md). The embedding lane's stated law — "the
 * ledger's memory drains the docket across runs" — was aspirational while
 * LIMIT ran before the memory: every run recalled the SAME closest 200
 * pairs, and once all 200 were judged (holds persist at the current rule
 * version) later runs recalled 200, skipped 200, heard 0 — pairs 201+ were
 * unreachable. The attribute lane got the order right (candidates → ledger
 * filter → cap); this puts the same order inside the SQL so LIMIT bounds
 * the UNDRAINED docket. COLLATE "C" pins LEAST/GREATEST to codepoint order,
 * the same order the adapter's JS `.sort()` uses to spell the claim key.
 */
function undecidedPairSql(aRef: string, bRef: string): Prisma.Sql {
  const a = Prisma.raw(aRef);
  const b = Prisma.raw(bRef);
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM claim_verdicts v
    WHERE v.lane = ${ENTITY_DEDUPE_LANE}
      AND v.rule_version = ${ENTITY_DEDUPE_RULE_VERSION}
      AND v.fold_version = ${entityDedupeLane.keyFoldVersion}
      AND v.claim_key =
        LEAST(${a}::text COLLATE "C", ${b}::text COLLATE "C")
        || '|' ||
        GREATEST(${a}::text COLLATE "C", ${b}::text COLLATE "C")
  )`;
}

/** What a dedupe verdict orders done — the `claim_verdicts.subject` payload. */
export interface DedupeVerdictSubject {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  via:
    | 'token-multiset+judge'
    | 'similarity+judge'
    | 'embedding+judge'
    // Deterministic auto lanes — ledgered since 2026-08-30 (merge-batch
    // audit action #4: the ~6 auto merges of the wave sweep wrote NO ledger
    // row and were unauditable; every merge now records its verdict —
    // outcome 'merge', reason naming the deterministic rule — BEFORE the
    // effect, the same verdict-then-effect contract as the judge lane).
    | 'number-auto'
    | 'token-multiset-auto';
  /** Present on 'merge' verdicts only; a 'hold' orders nothing. */
  plan: ItemMergePlan | null;
}

const STOPWORDS = new Set(['and', 'with', 'the', 'a', 'of', 'de', 'y']);

/**
 * Periodic food dedupe-merge — the long-term-ideal replacement for the old
 * "Phase 3 raw-emit" idea. Duplicate variants that slip past within-batch
 * dedupe ("steak and frites" vs "steak frites", "hainan" vs "hainanese
 * chicken") get found by trigram candidate scan, adjudicated (deterministic
 * token-multiset rule first, batched LLM judge for the rest), and MERGED:
 * connections re-pointed (colliding (restaurant,food) rows folded together),
 * the loser's name banked as an alias on the winner, loser archived. The
 * variation data is thereby fully exploited instead of lost.
 *
 * Winner = the food with more connections (more evidence behind its name);
 * ties break to the shorter name (more canonical).
 */
@Injectable()
export class ItemDedupeMergeService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly anchorRehome: EntityAnchorRehomeService,
    private readonly ledger: ClaimVerdictLedgerService,
    loggerService: LoggerService,
    /** THE budget chokepoint every court drains through (G2). */
    private readonly budget: ClaimRehearingBudgetService,
    private readonly entityEmbeddings: EntityEmbeddingReconcilerService,
  ) {
    this.logger = loggerService.setContext('FoodDedupeMergeService');
  }

  /**
   * THE JUDGE LANES' ACTIVATION GATE (H5 adoption, 2026-08-12).
   *
   * The dedupe judge lanes ran nightly with NO verdict memory — the exact
   * defect the H5 red team flagged URGENT: merges are irreversible, and a
   * judge REJECTION left no row at all, so every nightly re-scan re-bought
   * the same 'no' forever (plans/iteration-phase-open-items.md, H5). The
   * hearing-ledger adapter below is that memory: verdict-then-effect,
   * rejections persisted, a rule bump the only re-opener.
   *
   * The lanes stay OFF by default while the coordinator sequences activation
   * (the post-v8-activation ruling: v8 activation → dedupe → retraction →
   * language wave, so sweeps land on a deduped corpus). Flip
   * DEDUPE_JUDGE_LANES_ENABLED=true to activate — the code path behind it is
   * complete and proven; only the sequencing is pending. The deterministic
   * lanes (number variants, exact-token-multiset auto-merge) are decided in
   * code, cost nothing, and never wait on this gate.
   */
  private judgeLanesEnabled(): boolean {
    return isEnvFlagEnabled(process.env.DEDUPE_JUDGE_LANES_ENABLED);
  }

  /** Nightly convergence (class ④): the restaurant sweep has run nightly
   *  for weeks while food dedupe was manual-only — which is how 26
   *  duplicate food groups accumulated. Same 3AM window; deterministic
   *  lanes are free, the judge lane is a handful of interactive calls
   *  under Tier-2/3 governance. Cron registration is worker-gated
   *  globally (isSchedulerRuntime). */
  async runNightly(): Promise<void> {
    // Heal and dedupe are decoupled (round-12 F2: one collision inside
    // the heal used to kill the WHOLE nightly dedupe).
    try {
      await this.refreshSortedIdentityKeys();
    } catch (healError) {
      this.logger.error(
        'Identity-key heal failed — dedupe still runs',
        healError,
      );
    }
    // FINISH WHAT WAS ALREADY DECIDED, BEFORE DECIDING ANYTHING NEW
    // (amendment (c)). This runs even while the judge-lane gate is off:
    // replaying a stored plan is not a new hearing — it is a paid-for
    // decision the corpus has not yet obeyed.
    try {
      await this.resumePendingDedupeEffects();
    } catch (resumeError) {
      this.logger.error(
        'Dedupe verdict resume failed — dedupe still runs',
        resumeError,
      );
    }
    await this.run({ dryRun: false });
  }

  /** Heal candidate window — see refreshSortedIdentityKeys. 7 nightly runs
   *  cover every row in the window, so a crashed night (or six) never loses
   *  a candidate; the window only has to exceed the cadence, not bound it. */
  private static readonly IDENTITY_HEAL_LOOKBACK_DAYS = 7;

  /** identity_key / identity_key_sorted are APP-WRITTEN (the fold has no SQL
   *  mirror by design — Postgres Unicode classes are platform-dependent).
   *  Creates write them inline (f1e1770d4's deterministic tiers depend on
   *  that) and every rename path stamps last_updated (enrichment's
   *  buildEntityUpdate and the merge's buildCanonicalMergeAugmentations both
   *  set it), so drift can only appear on a row that was TOUCHED — which is
   *  what the candidate window reads (2026-08-11 audit change #4: this used
   *  to recompute the fold for EVERY row nightly, an unflagged O(corpus)
   *  scan). NULL-keyed rows are always candidates regardless of age
   *  (pre-column backfill gaps have no touch timestamp to trust). The full
   *  scan survives as an explicit lever ({ full: true }) for backfills and
   *  fold-algorithm changes — a new fold version MUST run it once. */
  async refreshSortedIdentityKeys(
    options: { full?: boolean } = {},
  ): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        ItemDedupeMergeService.IDENTITY_HEAL_LOOKBACK_DAYS * 24 * 3600 * 1000,
    );
    const rows = options.full
      ? await this.prisma.$queryRaw<
          Array<{
            entityId: string;
            name: string;
            type: string;
            key: string | null;
            sorted: string | null;
            foldVersion: number;
          }>
        >`
          SELECT entity_id AS "entityId", name, type::text AS type,
                 identity_key AS key, identity_key_sorted AS sorted,
                 fold_version AS "foldVersion"
          FROM core_entities
        `
      : await this.prisma.$queryRaw<
          Array<{
            entityId: string;
            name: string;
            type: string;
            key: string | null;
            sorted: string | null;
            foldVersion: number;
          }>
        >`
          SELECT entity_id AS "entityId", name, type::text AS type,
                 identity_key AS key, identity_key_sorted AS sorted,
                 fold_version AS "foldVersion"
          FROM core_entities
          WHERE identity_key IS NULL
             OR identity_key_sorted IS NULL
             OR last_updated >= ${cutoff}
             -- created_at is timestamp WITHOUT time zone holding UTC wall
             -- clock; bind through the explicit UTC frame (same idiom as
             -- the placeholder cleanup) so the window never depends on the
             -- session TimeZone.
             OR created_at >= (${cutoff}::timestamptz AT TIME ZONE 'UTC')
        `;
    for (const row of rows) {
      // THE ONE IDENTITY HELPER (one-fold law): the heal re-keys through
      // identityInsertData — the same helper every create path spreads — so
      // a re-keyed row carries fold_version like any other written key. This
      // UPDATE used to stamp the keys and NOT the version, leaving the
      // { full: true } post-fold-bump backfill writing current-algorithm keys
      // labeled with the OLD version — the exact provenance lie the column
      // exists to expose.
      const expected = identityInsertData(row.name, row.type as never);
      if (
        row.key !== expected.identityKey ||
        row.sorted !== expected.identityKeySorted ||
        row.foldVersion !== expected.foldVersion
      ) {
        try {
          await this.prisma.$executeRaw`
            UPDATE core_entities
            SET identity_key = ${expected.identityKey},
                identity_key_sorted = ${expected.identityKeySorted},
                fold_version = ${expected.foldVersion}
            WHERE entity_id = ${row.entityId}::uuid`;
        } catch {
          // 23505 = this row IS a duplicate of an already-keyed twin. The
          // heal is a convergent sweep, never all-or-nothing (round-12 F2):
          // log it as a merge candidate and keep going — the dedupe lanes
          // own the merge decision.
          this.logger.warn('Identity-key heal collision — merge candidate', {
            entityId: row.entityId,
            name: row.name,
            type: row.type,
          });
        }
      }
    }
  }

  async run(
    options: { similarityFloor?: number; dryRun?: boolean } = {},
  ): Promise<DedupeMergeSummary> {
    // DERIVED 2026-08-03 (F470): the floor is a judge-shortlist RECALL bound,
    // not a merge decision (auto-merge still requires identical token
    // multisets; everything else goes to the batched judge). Measured on the
    // mirror: accepted merges exist down to similarity 0.61, and the old 0.72
    // floor truncated the accept distribution mid-cliff (its largest bucket
    // sat AT 0.72-0.74). At 0.65 the full candidate backlog is 140 pairs —
    // one judge batch, inside LIMIT 200 — while 0.60 triples candidates (397)
    // for a measured accept tail of ~2 pairs. 0.65 is the knee.
    const floor = options.similarityFloor ?? 0.65;
    const dryRun = options.dryRun ?? false;
    const summary: DedupeMergeSummary = {
      candidatePairs: 0,
      autoMerged: 0,
      judgeMerged: 0,
      judgeRejected: 0,
      judgeAlreadyDecided: 0,
      judgeHeld: 0,
      judgeUnjudged: 0,
    };

    // Same lanes, once per vocabulary (coverage audit F-2): the sweep used
    // to scan type='item' only, so ingredient twins ("beef ribeye"/"ribeye
    // beef") accumulated with no merge path at all — the resolver's judge
    // covers them at mint time and nothing healed the corpus after.
    for (const sweepType of DEDUPE_SWEEP_TYPES) {
      await this.runForType(sweepType, floor, dryRun, summary);
    }

    this.logger.info('Food dedupe-merge pass complete', {
      dryRun,
      ...(summary as unknown as Record<string, unknown>),
    });
    return summary;
  }

  private async runForType(
    sweepType: DedupeSweepType,
    floor: number,
    dryRun: boolean,
    summary: DedupeMergeSummary,
  ): Promise<void> {
    // 0. NUMBER VARIANTS FIRST — and deliberately OUTSIDE the trigram scan.
    // This sweep has always excluded substring-related pairs (step 1's
    // `position(a.name IN b.name) = 0`) to protect legitimate specific-vs-
    // general dishes like "chicken sandwich" inside "chicken parm sandwich".
    // But "taco" is a substring of "tacos", so that guard silently excluded
    // EVERY singular/plural pair — which is why 260 of them accumulated in a
    // database that has had a dedupe sweep all along. Number variance is
    // decided in code (food-lemma.ts), never by similarity or by the judge,
    // so it gets its own lane with no floor and no LLM call.
    // ACTIVE-SUPPORT ONLY (foundational re-derivation, D5): this sweep used
    // to see EVERY active food, including vocabulary a SHADOW extraction
    // minted. It could then judge a shadow-minted food and a live one the
    // same, archive the LIVE one, and rekey user list items into a
    // candidate that might be discarded — which `discard` cannot undo.
    // "Has a connection" IS "has active support": the projection rebuild
    // only writes connections from the document's ACTIVE run.
    const activeItems = await this.prisma.$queryRaw<
      Array<{ entityId: string; name: string }>
    >(Prisma.sql`
      SELECT e.entity_id AS "entityId", e.name
      FROM core_entities e
      WHERE e.type = ${sweepType}::entity_type AND e.status = 'active'
        AND ${Prisma.raw(sweepSupportSql(sweepType, 'e.entity_id'))}`);
    const seenNumberPair = new Set<string>();
    const numberVariantPairs: {
      a_id: string;
      a_name: string;
      b_id: string;
      b_name: string;
    }[] = [];
    const byLowerName = new Map(
      activeItems.map((f) => [f.name.toLowerCase().trim(), f]),
    );
    for (const item of activeItems) {
      for (const variant of itemNameVariants(item.name)) {
        const other = byLowerName.get(variant);
        if (!other || other.entityId === item.entityId) continue;
        if (!isSameItemUpToNumber(item.name, other.name)) continue;
        const key = [item.entityId, other.entityId].sort().join(':');
        if (seenNumberPair.has(key)) continue;
        seenNumberPair.add(key);
        numberVariantPairs.push({
          a_id: item.entityId,
          a_name: item.name,
          b_id: other.entityId,
          b_name: other.name,
        });
      }
    }
    // STALE-SNAPSHOT GUARD (red team R4): with three variants
    // (taco/tacos/tacoes) the pair list is enumerated once, so a later pair
    // can reference an entity an earlier pair already archived — and the
    // winner rule would happily crown a tombstone. Any id consumed by a
    // completed number merge skips subsequent pairs; the next sweep run
    // sees the healed state and finishes the chain.
    const consumedByNumberLane = new Set<string>();
    // JUDGED VERDICTS OUTRANK MECHANICAL FOLDS (acceptance red team
    // 2026-08-30, the bitter/bitters class): a deterministic lane is a
    // shortcut for pairs nobody has ever had to think about — the moment a
    // judge has HELD a pair apart ("bitter" the adjective vs "bitters" the
    // cocktail ingredient), the mechanical number fold no longer speaks for
    // it. Any-rule-version on purpose: a rule bump re-opens the pair for the
    // JUDGE lane's re-hearing, not for a code lane that cannot weigh the
    // question at all. This is the general rule, not a hardcoded pair list.
    const heldPairs = await this.ledgeredHoldPairs(numberVariantPairs);
    for (const pair of numberVariantPairs) {
      if (heldPairs.has([pair.a_id, pair.b_id].sort().join('|'))) {
        this.logger.info(
          'Number-variant fold skipped — a judge verdict holds the pair apart',
          { a: pair.a_name, b: pair.b_name, type: sweepType },
        );
        continue;
      }
      if (
        consumedByNumberLane.has(pair.a_id) ||
        consumedByNumberLane.has(pair.b_id)
      ) {
        continue;
      }
      if (dryRun) {
        this.logger.info('Would merge number-variant foods', {
          a: pair.a_name,
          b: pair.b_name,
          type: sweepType,
          via: 'number',
        });
      } else {
        await this.mergeItemPair(
          sweepType,
          pair,
          'number-auto',
          'deterministic number-variant fold (food-lemma: same item up to a numeral)',
        );
        consumedByNumberLane.add(pair.a_id);
        consumedByNumberLane.add(pair.b_id);
      }
      summary.autoMerged += 1;
    }
    const mergedByNumber = new Set(
      numberVariantPairs.flatMap((p) => [p.a_id, p.b_id]),
    );

    // 0b. WORD-ORDER TWINS (final red team #6): identical token multiset
    // after the canonical fold ("square pizza"/"pizza square" — the exact
    // twin class the identity lock was built for, still in the graph
    // because the trigram lane requires BOTH sides supported and one twin
    // never got items). Deterministic like the number lane: decided in
    // code, no judge. OR-support suffices — merging an unsupported twin
    // into its supported double cannot promote shadow vocabulary, the
    // supported side wins. Same conflation caveat as the creation-time
    // order-probe (round 4): logged loudly, none genuinely distinct today.
    const orderTwinPairs = await this.prisma.$queryRaw<
      { a_id: string; a_name: string; b_id: string; b_name: string }[]
    >`
      SELECT a.entity_id a_id, a.name a_name, b.entity_id b_id, b.name b_name
      FROM core_entities a
      JOIN core_entities b ON a.entity_id < b.entity_id
      WHERE a.type = ${sweepType}::entity_type
        AND b.type = ${sweepType}::entity_type
        AND a.status = 'active' AND b.status = 'active'
        AND (
          ${Prisma.raw(sweepSupportSql(sweepType, 'a.entity_id'))}
          OR ${Prisma.raw(sweepSupportSql(sweepType, 'b.entity_id'))}
        )
        AND a.identity_key_sorted IS NOT NULL
        AND a.identity_key_sorted = b.identity_key_sorted
    `;
    // JUDGE-GATED, never auto (final-final red team: the column's first
    // backfill immediately surfaced "dumpling soup"/"soup dumplings" —
    // token-multiset-identical yet genuinely DIFFERENT dishes. Word order
    // can be meaning; only the judge may collapse it.)
    const orderPairsToJudge = orderTwinPairs.filter(
      (pair) =>
        !consumedByNumberLane.has(pair.a_id) &&
        !consumedByNumberLane.has(pair.b_id) &&
        !mergedByNumber.has(pair.a_id) &&
        !mergedByNumber.has(pair.b_id),
    );
    if (orderPairsToJudge.length && !dryRun) {
      await this.adjudicateDedupeCandidates(
        sweepType,
        orderPairsToJudge,
        'token-multiset+judge',
        summary,
        consumedByNumberLane,
      );
    } else if (orderPairsToJudge.length) {
      for (const pair of orderPairsToJudge) {
        this.logger.info('Would judge word-order twin foods', {
          a: pair.a_name,
          b: pair.b_name,
          type: sweepType,
        });
      }
    }

    // 1. Candidate pairs: high trigram similarity, both active foods, and not
    // substring-related (substrings are legitimate specific-vs-general dishes,
    // e.g. "chicken sandwich" ⊂ "chicken parm sandwich").
    const allPairs = await this.prisma.$queryRaw<
      { a_id: string; a_name: string; b_id: string; b_name: string }[]
    >`
      SELECT a.entity_id a_id, a.name a_name, b.entity_id b_id, b.name b_name
      FROM core_entities a
      JOIN core_entities b ON a.entity_id < b.entity_id
      WHERE a.type = ${sweepType}::entity_type
        AND b.type = ${sweepType}::entity_type
        AND a.status = 'active' AND b.status = 'active'
        -- active-support only (D5): never merge shadow-minted vocabulary.
        -- The predicate is the scope service's ONE definition, imported.
        AND ${Prisma.raw(sweepSupportSql(sweepType, 'a.entity_id'))}
        AND ${Prisma.raw(sweepSupportSql(sweepType, 'b.entity_id'))}
        AND similarity(a.name, b.name) > ${floor}
        AND position(a.name IN b.name) = 0
        AND position(b.name IN a.name) = 0
        -- Judged pairs never occupy the work bound (red-team F2): the LIMIT
        -- below truncates the UNDRAINED docket, not a re-recalled one.
        AND ${undecidedPairSql('a.entity_id', 'b.entity_id')}
      ORDER BY similarity(a.name, b.name) DESC
      -- Per-run work bound, similarity-ranked so truncation drops the WORST
      -- candidates. 200 > the measured full backlog at the 0.65 floor (140
      -- pairs, 2026-08-03), so a single run drains the whole queue; it only
      -- truncates under abnormal growth, and the next run resumes.
      LIMIT 200
    `;
    const pairs = allPairs.filter(
      (p) => !mergedByNumber.has(p.a_id) && !mergedByNumber.has(p.b_id),
    );
    // (No early return on an empty trigram docket: the embedding lane below
    // has its own recall and must run regardless.)
    summary.candidatePairs = pairs.length;

    // 2. Deterministic rule: identical token multisets modulo connector
    // stopwords ("steak and frites" == "steak frites") auto-merge; the rest
    // go to one batched judge call.
    const autoMerge: typeof pairs = [];
    const needJudge: typeof pairs = [];
    for (const pair of pairs) {
      // ACCENT VETO on the deterministic arm (2026-08-12 red team):
      // contentTokens is canonicalFold-based (accent-stripped), so
      // "cơm chay" and "cơm cháy" read as identical token multisets and
      // auto-merged with no judge. When both names carry accent evidence
      // and their accent-preserving folds conflict, the pair is NOT
      // deterministically identical — it is exactly the judge's question.
      // Same shared rule as the resolver's mint veto (entity-identity.ts).
      if (
        this.contentTokens(pair.a_name) === this.contentTokens(pair.b_name) &&
        accentsAgreeUnbanked(pair.a_name, pair.b_name)
      ) {
        autoMerge.push(pair);
      } else {
        needJudge.push(pair);
      }
    }

    // Same judged-verdict supremacy as the number lane: the candidate query's
    // ledger anti-join is scoped to the CURRENT rule version (that is its
    // job — a bump re-opens hearings), so after a bump a previously-HELD pair
    // re-enters here. It must go back to the JUDGE, never to the code fold.
    const heldAutoPairs = await this.ledgeredHoldPairs(autoMerge);
    for (let i = autoMerge.length - 1; i >= 0; i -= 1) {
      const pair = autoMerge[i];
      const key = [pair.a_id, pair.b_id].sort().join('|');
      if (heldAutoPairs.has(key)) {
        autoMerge.splice(i, 1);
        needJudge.push(pair);
      }
    }

    for (const pair of autoMerge) {
      if (dryRun) {
        this.logger.info('Would merge duplicate foods', {
          a: pair.a_name,
          b: pair.b_name,
          type: sweepType,
          via: 'auto',
        });
      } else {
        await this.mergeItemPair(
          sweepType,
          pair,
          'token-multiset-auto',
          'deterministic identical token multiset (canonical fold, stopwords dropped, accents agree)',
        );
        // Same stale-snapshot guard as the number lane (R4): an id this
        // merge consumed must not reach the judge lane below.
        consumedByNumberLane.add(pair.a_id);
        consumedByNumberLane.add(pair.b_id);
      }
      summary.autoMerged += 1;
    }

    if (needJudge.length && !dryRun) {
      await this.adjudicateDedupeCandidates(
        sweepType,
        needJudge,
        'similarity+judge',
        summary,
        consumedByNumberLane,
      );
    } else if (needJudge.length) {
      for (const pair of needJudge) {
        this.logger.info('Would judge duplicate foods', {
          a: pair.a_name,
          b: pair.b_name,
          type: sweepType,
          via: 'similarity+judge',
        });
      }
    }

    // 3. EMBEDDING RECALL LANE (sameness court D2, 2026-08-30): the trigram
    // scan is structurally blind to lexically-distant same-concepts — "soup
    // dumplings"/"xiao long bao", "japanese fried chicken"/"chicken karaage"
    // (a satisfies verdict on such a pair is a merge signal this pipeline
    // could never see — systems-map overlap #12). name_embedding already
    // exists on every reconciled entity, so recall is a pgvector top-K
    // lateral (measured ~2s over the 3.7k-item staging corpus). This is the
    // attribute ontology's meaning-first finder generalized to dishes.
    // Distance-ranked with a per-run hearing cap (the trigram lane's LIMIT
    // pattern): no similarity floor nobody has measured — the ledger's
    // memory drains the docket across runs, closest pairs first, and every
    // pair still faces the judge (substring pairs INCLUDED: the enriched
    // judge now carries the home-restaurant doctrine that decides
    // specific-vs-general, which the old blind judge could not).
    const embeddingPairs = await this.embeddingCandidatePairs(sweepType);
    const trigramSeen = new Set(
      allPairs.map((p) => [p.a_id, p.b_id].sort().join(':')),
    );
    const embeddingToJudge = embeddingPairs.filter(
      (p) =>
        !consumedByNumberLane.has(p.a_id) &&
        !consumedByNumberLane.has(p.b_id) &&
        !mergedByNumber.has(p.a_id) &&
        !mergedByNumber.has(p.b_id) &&
        !trigramSeen.has([p.a_id, p.b_id].sort().join(':')),
    );
    summary.candidatePairs += embeddingToJudge.length;
    if (embeddingToJudge.length && !dryRun) {
      await this.adjudicateDedupeCandidates(
        sweepType,
        embeddingToJudge,
        'embedding+judge',
        summary,
        consumedByNumberLane,
      );
    } else if (embeddingToJudge.length) {
      for (const pair of embeddingToJudge) {
        this.logger.info('Would judge duplicate foods', {
          a: pair.a_name,
          b: pair.b_name,
          type: sweepType,
          via: 'embedding+judge',
        });
      }
    }
  }

  /**
   * The embedding-recall candidate query, its own method so the two-run
   * drain law is TESTABLE read-only (running the full sweep against a
   * shared database is destructive — the pair spec's own warning). The
   * ledger anti-join lives INSIDE both bounds (red-team F2): the lateral's
   * K picks the closest UNJUDGED neighbors, and the outer LIMIT truncates
   * the undrained docket — so repeat runs walk deeper into the distance
   * ranking instead of re-recalling the same judged 200 forever.
   */
  protected async embeddingCandidatePairs(
    sweepType: DedupeSweepType,
  ): Promise<{ a_id: string; a_name: string; b_id: string; b_name: string }[]> {
    return this.prisma.$queryRaw<
      { a_id: string; a_name: string; b_id: string; b_name: string }[]
    >`
      SELECT a.entity_id a_id, a.name a_name, n.entity_id b_id, n.name b_name
      FROM core_entities a
      JOIN LATERAL (
        SELECT b.entity_id, b.name,
               (a.name_embedding <=> b.name_embedding) AS dist
        FROM core_entities b
        WHERE b.type = ${sweepType}::entity_type AND b.status = 'active'
          AND b.name_embedding IS NOT NULL
          AND b.entity_id <> a.entity_id
          AND ${Prisma.raw(sweepSupportSql(sweepType, 'b.entity_id'))}
          AND ${undecidedPairSql('a.entity_id', 'b.entity_id')}
        ORDER BY a.name_embedding <=> b.name_embedding
        LIMIT 4
      ) n ON true
      WHERE a.type = ${sweepType}::entity_type AND a.status = 'active'
        AND a.name_embedding IS NOT NULL
        AND ${Prisma.raw(sweepSupportSql(sweepType, 'a.entity_id'))}
        AND a.entity_id < n.entity_id
      ORDER BY n.dist ASC
      LIMIT 200
    `;
  }

  /** Full merge: pick winner by evidence, fold connections, bank the loser's
   *  name+surfaces on the winner, archive the loser. The deterministic lanes'
   *  entry point — SAME verdict-then-effect contract as the judge lane
   *  (merge-batch audit action #4): the plan is stored as a claim_verdicts
   *  row (outcome 'merge', reason naming the deterministic rule) BEFORE the
   *  effect runs, so every auto merge is auditable and crash-resumable. */
  private async mergeItemPair(
    sweepType: DedupeSweepType,
    pair: { a_id: string; a_name: string; b_id: string; b_name: string },
    via: 'number-auto' | 'token-multiset-auto',
    reason: string,
  ): Promise<void> {
    if (pair.a_id === pair.b_id) {
      return; // self-merge annihilates the ledger (round-11 D1)
    }
    const plan = await this.planItemMerge(sweepType, pair.a_id, pair.b_id);
    await this.settleDedupeVerdict(pair, via, 'merge', reason, plan);
  }

  /** Evidence behind a name, per vocabulary: an item's evidence is its
   *  connections; an ingredient's is the rows that REFERENCE it (connection
   *  `ingredients` arrays + dish `canonical_ingredients`). */
  private async evidenceCount(
    sweepType: DedupeSweepType,
    entityId: string,
  ): Promise<number> {
    if (sweepType === EntityType.ingredient) {
      const rows = await this.prisma.$queryRaw<Array<{ refs: bigint }>>`
        SELECT (SELECT count(*) FROM core_restaurant_items
                 WHERE ingredients @> ARRAY[${entityId}::uuid])
             + (SELECT count(*) FROM core_entities
                 WHERE canonical_ingredients @> ARRAY[${entityId}::uuid])
               AS refs`;
      return Number(rows[0]?.refs ?? 0);
    }
    return this.prisma.connection.count({ where: { itemId: entityId } });
  }

  /** Winner selection — more evidence wins (more rows behind its name);
   *  ties break to the shorter name (more canonical). Pure planning,
   *  no mutation: the judge lane persists this as the verdict's subject
   *  before any effect runs. */
  private async planItemMerge(
    sweepType: DedupeSweepType,
    idA: string,
    idB: string,
  ): Promise<ItemMergePlan> {
    const [connectionsA, connectionsB] = await Promise.all([
      this.evidenceCount(sweepType, idA),
      this.evidenceCount(sweepType, idB),
    ]);
    const [entityA, entityB] = await Promise.all([
      this.prisma.entity.findUniqueOrThrow({
        where: { entityId: idA },
        select: { entityId: true, name: true },
      }),
      this.prisma.entity.findUniqueOrThrow({
        where: { entityId: idB },
        select: { entityId: true, name: true },
      }),
    ]);
    const aWins =
      connectionsA !== connectionsB
        ? connectionsA > connectionsB
        : entityA.name.length <= entityB.name.length;
    const winner = aWins ? entityA : entityB;
    const loser = aWins ? entityB : entityA;
    return {
      winnerId: winner.entityId,
      winnerName: winner.name,
      loserId: loser.entityId,
      loserName: loser.name,
      entityType: sweepType,
    };
  }

  /**
   * THE ONE PLACE A MERGE PLAN TOUCHES THE CORPUS. Live hearings,
   * deterministic lanes and crash-resume all execute THIS with a fixed
   * winner/loser, so there is no second merge implementation to drift.
   *
   * IDEMPOTENT BY STATE: a plan whose loser is already archived has already
   * been executed (a crash between the merge commit and markExecuted replays
   * here), so it completes as a no-op rather than double-folding evidence.
   */
  protected async executeItemMergePlan(plan: ItemMergePlan): Promise<void> {
    const loserRows = await this.prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status::text FROM core_entities
       WHERE entity_id = ${plan.loserId}::uuid`;
    if (!loserRows.length || loserRows[0].status === 'archived') {
      this.logger.info('Merge plan already executed — loser archived', {
        winner: plan.winnerName,
        loser: plan.loserName,
      });
      return;
    }
    const winner = { entityId: plan.winnerId, name: plan.winnerName };
    const loser = { entityId: plan.loserId, name: plan.loserName };
    // Plans stored before the ingredient extension (F-2) carried no type —
    // every one of them was an item plan.
    const sweepType: DedupeSweepType = plan.entityType ?? EntityType.item;

    await this.prisma.$transaction(
      async (tx) => {
        await acquireIdentityMergeLocks(tx, sweepType, [
          entityLockKey(winner.name, sweepType),
          entityLockKey(loser.name, sweepType),
        ]);
        // Fold colliding connections (same restaurant has both variants).
        // An ingredient is never a connection's food_id, so the loser set is
        // empty for ingredient merges; its references are re-pointed below.
        const loserConnections = await tx.connection.findMany({
          where: { itemId: loser.entityId },
        });
        for (const connection of loserConnections) {
          const surviving = await tx.connection.findUnique({
            where: {
              placeId_itemId: {
                placeId: connection.placeId,
                itemId: winner.entityId,
              },
            },
            select: { connectionId: true, lastMentionedAt: true },
          });
          if (!surviving) {
            await tx.connection.update({
              where: { connectionId: connection.connectionId },
              data: { itemId: winner.entityId },
            });
            continue;
          }
          // Re-point dependents, sum counters, drop the loser row.
          // COLLISION DEDUPE (red team R1): the claim-identity rollup shadows
          // only ACROSS foods (c2.food_id <> c.food_id), so two direct
          // mentions of the SAME document landing on ONE merged connection
          // can never shadow each other — a bare re-point would recreate at
          // the mention grain exactly the double count this merge exists to
          // kill. A loser mention whose (document, kind) already exists on
          // the survivor is dropped, mirroring mergeFoodEntityEvents.
          const survivorMentions = await tx.placeItemMention.findMany({
            where: { connectionId: surviving.connectionId },
            select: { sourceDocumentId: true, kind: true },
          });
          const survivorKeys = new Set(
            survivorMentions.map(
              (mention) => `${mention.sourceDocumentId ?? ''}:${mention.kind}`,
            ),
          );
          const loserMentions = await tx.placeItemMention.findMany({
            where: { connectionId: connection.connectionId },
            select: {
              id: true,
              sourceDocumentId: true,
              kind: true,
              sourceUpvotes: true,
            },
          });
          // Deleted mentions must ALSO leave the counters (red team F2): the
          // loser's counters are incremented onto the survivor wholesale
          // below, so a deduped-away mention would stay baked into
          // mention_count/total_upvotes — dish ranking and minimumVotes read
          // those columns, recreating at the dish grain the double count this
          // dedupe kills at the mention grain.
          let deletedDirectCount = 0;
          let deletedDirectUpvotes = 0;
          let deletedSupportCount = 0;
          let deletedSupportUpvotes = 0;
          for (const mention of loserMentions) {
            const key = `${mention.sourceDocumentId ?? ''}:${mention.kind}`;
            if (mention.sourceDocumentId && survivorKeys.has(key)) {
              await tx.placeItemMention.delete({
                where: { id: mention.id },
              });
              if (mention.kind === 'direct') {
                deletedDirectCount += 1;
                deletedDirectUpvotes += mention.sourceUpvotes;
              } else {
                deletedSupportCount += 1;
                deletedSupportUpvotes += mention.sourceUpvotes;
              }
            } else {
              await tx.placeItemMention.update({
                where: { id: mention.id },
                data: { connectionId: surviving.connectionId },
              });
              survivorKeys.add(key);
            }
          }
          await this.anchorRehome.rehomeUserListItems(
            tx,
            'connectionId',
            surviving.connectionId,
            connection.connectionId,
          );
          // curated picks + photos cascade on connection delete — repoint
          // BEFORE the loser row goes (shared user-anchor law)
          await this.anchorRehome.rehomeConnectionAnchors(
            tx,
            surviving.connectionId,
            connection.connectionId,
          );
          // (event re-pointing happens once per pair, after the connection
          // loop — see mergeFoodEntityEvents)
          // Phase C: view history lives in the signals ledger — the reader
          // resolves the dead connectionId to the survivor at read (via
          // entity_redirects + (food, restaurant)); no rekey.
          await tx.connection.update({
            where: { connectionId: surviving.connectionId },
            data: {
              mentionCount: {
                increment: connection.mentionCount - deletedDirectCount,
              },
              totalUpvotes: {
                increment: connection.totalUpvotes - deletedDirectUpvotes,
              },
              supportMentionCount: {
                increment: connection.supportMentionCount - deletedSupportCount,
              },
              supportTotalUpvotes: {
                increment:
                  connection.supportTotalUpvotes - deletedSupportUpvotes,
              },
              lastMentionedAt:
                connection.lastMentionedAt &&
                (!surviving.lastMentionedAt ||
                  connection.lastMentionedAt > surviving.lastMentionedAt)
                  ? connection.lastMentionedAt
                  : undefined,
            },
          });
          await tx.connection.delete({
            where: { connectionId: connection.connectionId },
          });
        }

        // INGREDIENT REFERENCE RE-POINTING (coverage audit F-2). The search
        // seam reads `c.ingredients && ids` / `canonical_ingredients && ids`
        // with the QUERY-time winner's id (the loser is archived, so the
        // gazetteer can only ground the winner) — a loser id left inside
        // those arrays is evidence a search can never reach again. Redirects
        // do not save it: no array reader follows entity_redirects. Rewrite
        // both columns in-transaction, deduping in case a row already
        // carried the winner alongside the loser.
        if (sweepType === EntityType.ingredient) {
          await tx.$executeRaw`
            UPDATE core_restaurant_items
            SET ingredients = (
              SELECT COALESCE(array_agg(DISTINCT CASE
                WHEN x = ${loser.entityId}::uuid THEN ${winner.entityId}::uuid
                ELSE x END), '{}')
              FROM unnest(ingredients) AS x)
            WHERE ingredients @> ARRAY[${loser.entityId}::uuid]`;
          await tx.$executeRaw`
            UPDATE core_entities
            SET canonical_ingredients = (
              SELECT COALESCE(array_agg(DISTINCT CASE
                WHEN x = ${loser.entityId}::uuid THEN ${winner.entityId}::uuid
                ELSE x END), '{}')
              FROM unnest(canonical_ingredients) AS x)
            WHERE canonical_ingredients @> ARRAY[${loser.entityId}::uuid]`;
        }

        // Alias banking + archive + score prune + redirect flatten live in
        // finalizeMergeCompletion (called below) — ONE contract for every
        // merge. Only the embedding staleness mark is food-specific.
        await tx.entity.update({
          where: { entityId: winner.entityId },
          data: { nameEmbeddingStale: true },
        });

        // Hard-rekey every user-anchored table off the archived loser (poll
        // targets + topic arrays, curated items, photos, on-demand requests,
        // demand candidates) — user links never point at a tombstone.
        await this.anchorRehome.rehomeEntityAnchors(
          tx,
          winner.entityId,
          loser.entityId,
        );

        // Identity is a judgment (§3, red-team 2b): merges WRITE redirects; the
        // signals ledger is never rekeyed — readers resolve loser subjectIds to
        // the survivor at read. Chains are flattened so the readers' one-hop
        // COALESCE stays complete (A→B then B→C rewrites A→C), and any stale
        // redirect FROM the live winner is dropped.
        // THE SUBSTRATE, NOT JUST THE PROJECTION (2026-07-28). Re-pointing
        // connections alone is NOT DURABLE: core_restaurant_items is a
        // PROJECTION rebuilt from the entity-event ledger, and the
        // rebuild does not follow entity_redirects. So a merge that leaves the
        // event ledger pointing at the archived loser is undone by the next
        // full rebuild — it would RESURRECT every split we just collapsed.
        // Measured when this was found: 4,247 events still pointed at archived
        // foods. The restaurant merge already did this
        // (mergeRestaurantEntityEvents); the food merge simply never did.
        await rekeyEntityDimensionEventsToCanonical(
          tx,
          winner.entityId,
          loser.entityId,
        );

        // THE VERDICT RIDES THE FOLD (red team 2026-09-03 P1#1): every
        // dedupe merge is ledgered under ENTITY_DEDUPE_LANE, and passing its
        // coordinates makes the loser's name fold as grade 'judged' — an
        // identity claim that keeps ROUTING mentions while its rule version
        // is in force. The old verdict-less call banked it 'recall', so
        // "taco al pastor" stopped resolving the moment it merged and every
        // later mention re-paid the judge.
        await finalizeMergeCompletion(tx, winner.entityId, loser.entityId, {
          mergeVerdict: {
            lane: ENTITY_DEDUPE_LANE,
            claimKey: entityDedupeLane.canonicalClaimKey({
              entityId: winner.entityId,
              otherEntityId: loser.entityId,
            }),
            ruleVersion: ENTITY_DEDUPE_RULE_VERSION,
            foldVersion: entityDedupeLane.keyFoldVersion,
          },
        });
      },
      // Explicit budget (round-12: default 5s + per-event loop = a
      // taco/tacos merge could never complete; matches the rebuild's).
      { timeout: 15 * 60 * 1000, maxWait: 30_000 },
    );

    // Write-time embedding law: the winner's doc just gained the loser's
    // folded name; re-embed after the commit.
    await this.entityEmbeddings.embedEntities([winner.entityId]);

    this.logger.info('Merged duplicate foods', {
      winner: winner.name,
      loser: loser.name,
    });
  }

  /**
   * THE DEDUPE JUDGE LANE, ON THE HEARING LEDGER (H5 adoption, 2026-08-12).
   *
   * One method for both judge-fed lanes (word-order twins and the trigram
   * scan), because they ask the judge the same question and their verdicts
   * live under the same claim key — the SORTED entity pair
   * (entity-dedupe-lane.adapter.ts): "is A the same as B" and "is B the same
   * as A" are one claim however the candidate generator emits it.
   *
   *   - A pair with a verdict at the CURRENT rule version is SKIPPED — this
   *     is the memory the lane never had: a judge 'hold' used to leave no
   *     row, so nightly re-scans re-bought the same rejection forever.
   *   - uphold => 'merge': the FULL plan (winner/loser, fixed) is stored as
   *     the verdict's subject BEFORE the merge executes, so a crash leaves
   *     work to finish and the resume replays the DECIDED plan.
   *   - reject => 'hold': the pair stays two entities, and the row is why
   *     tomorrow's scan does not pay to ask again.
   *   - No verdict, or no stated ground, is NOT a ruling (amendment (d)):
   *     the pair is left unjudged and re-offered. matchEntitiesBatch fails
   *     CLOSED to a reasonless 'new', so a judge outage records nothing.
   */
  private async adjudicateDedupeCandidates(
    sweepType: DedupeSweepType,
    candidates: Array<{
      a_id: string;
      a_name: string;
      b_id: string;
      b_name: string;
    }>,
    via: DedupeVerdictSubject['via'],
    summary: DedupeMergeSummary,
    consumed: Set<string>,
  ): Promise<void> {
    if (!this.judgeLanesEnabled()) {
      summary.judgeHeld += candidates.length;
      this.logger.info('Dedupe judge lane held — activation gate off', {
        via,
        pairs: candidates.length,
      });
      return;
    }
    const decided = await this.ledger.decidedKeys(
      ENTITY_DEDUPE_LANE,
      ENTITY_DEDUPE_RULE_VERSION,
      entityDedupeLane.keyFoldVersion,
      candidates.map((pair) =>
        entityDedupeLane.canonicalClaimKey({
          entityId: pair.a_id,
          otherEntityId: pair.b_id,
        }),
      ),
    );
    const due = candidates.filter((pair) => {
      if (consumed.has(pair.a_id) || consumed.has(pair.b_id)) return false;
      const key = entityDedupeLane.canonicalClaimKey({
        entityId: pair.a_id,
        otherEntityId: pair.b_id,
      });
      if (decided.has(key)) {
        summary.judgeAlreadyDecided += 1;
        return false;
      }
      return true;
    });
    if (!due.length) return;
    // AUTHORIZED, LIKE EVERY OTHER COURT (red team 2026-08-19 G2, landed
    // 2026-09-04): the judge batch below used to go straight to the LLM —
    // the one lane whose drain no allowance bounded. The allowance decides
    // how many of the due pairs this run may buy; the rest wait.
    const authorized = await this.budget.authorizeDrain({
      lane: 'entity_dedupe',
      ruleVersion: ENTITY_DEDUPE_RULE_VERSION,
      dueCount: due.length,
    });
    if (authorized.allowed < due.length) {
      this.logger.warn('Dedupe judge drain capped by the hearing allowance', {
        due: due.length,
        allowed: authorized.allowed,
      });
      due.splice(authorized.allowed);
    }
    if (!due.length) return;

    // D2 context standard: the sweep judge used to see two bare names.
    // Every hearing now carries each side's home restaurants — the evidence
    // the venue-name rule and the doubt-says-new rule read.
    //
    // NO same_place FLAG ON SWEEP HEARINGS (merge-batch audit 2026-08-30,
    // root cause #1): the sweep judges pairs of corpus-wide AGGREGATES, and
    // the old flag was footprint OVERLAP (place_ids ∩ ≠ ∅) — true for any
    // specific dish sharing one venue with a 22-restaurant generic. The
    // judge read it as a same-restaurant license and invented the banned
    // "category/specification/format fold, same restaurant" classes — the
    // 47 wrong merges. Under the corpus-global law (entity merge = identity
    // only; same-restaurant unification belongs to extraction pro-forms,
    // plans/named-offering-fragmentation-study.md §4) NO honest version of
    // the flag licenses anything a sweep fold may do, so it is not sent at
    // all. The birth judge's same_place (thread restaurant vs candidate
    // homes, entity-resolution.service.ts) is a different, honest fact and
    // stays — it scopes the venue-name identity rule for MENTION hearings.
    const dueIds = Array.from(
      new Set(due.flatMap((pair) => [pair.a_id, pair.b_id])),
    );
    // An ingredient's homes are the restaurants whose dishes CARRY it (the
    // `ingredients` array), the same evidence the item arm reads off food_id.
    const homeRows =
      sweepType === EntityType.ingredient
        ? await this.prisma.$queryRaw<
            Array<{ food_id: string; place_ids: string[]; homes: string[] }>
          >(Prisma.sql`
      SELECT x.ingredient_id AS food_id,
             array_agg(c.restaurant_id::text ORDER BY c.mention_count DESC)
               AS place_ids,
             (array_agg(r.name ORDER BY c.mention_count DESC))[1:3] AS homes
        FROM core_restaurant_items c
        JOIN LATERAL unnest(c.ingredients) AS x(ingredient_id) ON true
        JOIN core_entities r ON r.entity_id = c.restaurant_id
       WHERE x.ingredient_id = ANY(${dueIds}::uuid[])
       GROUP BY x.ingredient_id`)
        : await this.prisma.$queryRaw<
            Array<{ food_id: string; place_ids: string[]; homes: string[] }>
          >(Prisma.sql`
      SELECT c.food_id,
             array_agg(c.restaurant_id::text ORDER BY c.mention_count DESC)
               AS place_ids,
             (array_agg(r.name ORDER BY c.mention_count DESC))[1:3] AS homes
        FROM core_restaurant_items c
        JOIN core_entities r ON r.entity_id = c.restaurant_id
       WHERE c.food_id = ANY(${dueIds}::uuid[])
       GROUP BY c.food_id`);
    const homesById = new Map(homeRows.map((r) => [r.food_id, r]));

    // THE REAL KIND (coverage audit F-8): the judge prompt carries an
    // ingredient doctrine section — sending an ingredient pair as 'item'
    // makes it reason with dish doctrine about a component word.
    const verdicts = await this.llmService.matchEntitiesBatch({
      kind: sweepType === EntityType.ingredient ? 'ingredient' : 'item',
      items: due.map((pair) => ({
        term: pair.a_name,
        termHomePlaces: homesById.get(pair.a_id)?.homes ?? undefined,
        candidates: [
          {
            id: 1,
            name: pair.b_name,
            homePlaces: homesById.get(pair.b_id)?.homes ?? undefined,
          },
        ],
      })),
    });
    for (let i = 0; i < due.length; i += 1) {
      const pair = due[i];
      // Later pairs may reference an entity an earlier verdict just merged
      // away (the same stale-snapshot class as R4) — leave them unheard;
      // the next scan sees the healed graph.
      if (consumed.has(pair.a_id) || consumed.has(pair.b_id)) continue;
      const verdict = verdicts[i];
      const reason = verdict?.reason?.trim() ?? '';
      if (!verdict || !reason) {
        summary.judgeUnjudged += 1;
        continue;
      }
      if (verdict.decision !== 'match') {
        await this.settleDedupeVerdict(pair, via, 'hold', reason, null);
        summary.judgeRejected += 1;
        continue;
      }
      this.logger.warn('Merging duplicate foods (judge-approved)', {
        a: pair.a_name,
        b: pair.b_name,
        type: sweepType,
        via,
      });
      const plan = await this.planItemMerge(sweepType, pair.a_id, pair.b_id);
      const settled = await this.settleDedupeVerdict(
        pair,
        via,
        'merge',
        reason,
        plan,
      );
      if (settled !== 'merge') {
        // The reason tripwire refused the merge and recorded a hold.
        summary.judgeRejected += 1;
        continue;
      }
      consumed.add(pair.a_id);
      consumed.add(pair.b_id);
      summary.judgeMerged += 1;
    }
  }

  /**
   * The claim keys, among `pairs`, that a judge verdict HOLDS apart —
   * any rule version (see the number-lane comment: re-hearing after a rule
   * bump belongs to the judge lane, so an old hold still outranks a code
   * fold today). Read-only; one query for the whole candidate list.
   */
  protected async ledgeredHoldPairs(
    pairs: ReadonlyArray<{ a_id: string; b_id: string }>,
  ): Promise<Set<string>> {
    if (!pairs.length) return new Set();
    const keys = pairs.map((pair) =>
      entityDedupeLane.canonicalClaimKey({
        entityId: pair.a_id,
        otherEntityId: pair.b_id,
      }),
    );
    const rows = await this.prisma.$queryRaw<Array<{ claim_key: string }>>`
      SELECT DISTINCT claim_key FROM claim_verdicts
      WHERE lane = ${ENTITY_DEDUPE_LANE}
        AND outcome = 'hold'
        AND claim_key IN (${Prisma.join(keys)})`;
    return new Set(rows.map((row) => row.claim_key));
  }

  /** Commit the verdict, THEN obey it (amendment (c)).
   *
   *  THE REASON TRIPWIRE runs HERE, at the recording chokepoint, so every
   *  lane that can order a merge passes through it: a merge whose stated
   *  ground names a banned class (category/specification/format fold,
   *  broader/narrower, same-restaurant fold) is refused and recorded as a
   *  fail-closed 'hold' with a loud log — the 2026-08-30 batch proved the
   *  judge announces its banned folds in its own reasons. */
  private async settleDedupeVerdict(
    pair: { a_id: string; a_name: string; b_id: string; b_name: string },
    via: DedupeVerdictSubject['via'],
    outcome: 'merge' | 'hold',
    reason: string,
    plan: ItemMergePlan | null,
  ): Promise<'merge' | 'hold'> {
    if (outcome === 'merge') {
      const banned = bannedMergeReasonClass(reason);
      if (banned) {
        this.logger.error(
          'MERGE REFUSED — judge reason names a banned class; recording hold',
          { a: pair.a_name, b: pair.b_name, via, bannedClass: banned, reason },
        );
        outcome = 'hold';
        reason = refusedMergeHoldReason(banned, reason);
        plan = null;
      }
    }
    const claimKey = entityDedupeLane.canonicalClaimKey({
      entityId: pair.a_id,
      otherEntityId: pair.b_id,
    });
    const subject: DedupeVerdictSubject = {
      aId: pair.a_id,
      aName: pair.a_name,
      bId: pair.b_id,
      bName: pair.b_name,
      via,
      plan,
    };
    await this.ledger.record<DedupeVerdictSubject>({
      lane: ENTITY_DEDUPE_LANE,
      claimKey,
      ruleVersion: ENTITY_DEDUPE_RULE_VERSION,
      foldVersion: entityDedupeLane.keyFoldVersion,
      outcome,
      reason,
      ruleFingerprint: ENTITY_DEDUPE_RULE_FINGERPRINT,
      subject,
    });
    await this.applyDedupeEffect(subject);
    await this.ledger.markExecuted(
      ENTITY_DEDUPE_LANE,
      claimKey,
      ENTITY_DEDUPE_RULE_VERSION,
      entityDedupeLane.keyFoldVersion,
    );
    return outcome;
  }

  /**
   * THE ONE PLACE A DEDUPE VERDICT TOUCHES THE CORPUS. Live hearings and
   * crash-resume both call this with the SAME stored subject. Overridable so
   * a test can kill the effect mid-hearing and prove the verdict survives.
   * A 'hold' orders nothing — the row itself is the whole effect.
   */
  protected async applyDedupeEffect(
    subject: DedupeVerdictSubject,
  ): Promise<void> {
    if (subject.plan) {
      await this.executeItemMergePlan(subject.plan);
    }
  }

  /**
   * DECIDED BUT NOT EXECUTED — replay the STORED plan, never recompute
   * (amendment (c)). A crash between the verdict and the merge leaves the
   * answer paid for and durable; this finishes it without a judge. Returns
   * how many verdicts it completed.
   */
  async resumePendingDedupeEffects(limit = 500): Promise<number> {
    const pending = await this.ledger.pendingExecution<DedupeVerdictSubject>(
      ENTITY_DEDUPE_LANE,
      ENTITY_DEDUPE_RULE_VERSION,
      entityDedupeLane.keyFoldVersion,
      limit,
    );
    let resumed = 0;
    for (const verdict of pending) {
      await this.applyDedupeEffect(verdict.subject);
      await this.ledger.markExecuted(
        ENTITY_DEDUPE_LANE,
        verdict.claimKey,
        verdict.ruleVersion,
        verdict.foldVersion,
      );
      resumed += 1;
    }
    if (resumed) {
      this.logger.info('Resumed decided-but-unexecuted dedupe verdicts', {
        resumed,
      });
    }
    return resumed;
  }

  private contentTokens(name: string): string {
    // THE canonical fold (round-12: this was a fourth almost-fold that
    // collapsed non-Latin names to nothing), minus connector stopwords,
    // token-sorted.
    return canonicalFold(name)
      .split(' ')
      .filter((token) => token && !STOPWORDS.has(token))
      .sort()
      .join(' ');
  }
  /** Re-point the loser's evidence events onto the winner. Mirrors
   *  RestaurantEntityMergeService.mergeRestaurantEntityEvents: an event that
   *  would collide with an identical winner event is dropped rather than
   *  duplicated, so a merge can never inflate evidence. */
}
