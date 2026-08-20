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
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { activeSupportExistsSql } from '../reddit-collector/extraction-scope.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import {
  ENTITY_DEDUPE_LANE,
  entityDedupeLane,
} from './entity-dedupe-lane.adapter';
import {
  ENTITY_DEDUPE_RULE_FINGERPRINT,
  ENTITY_DEDUPE_RULE_VERSION,
} from './entity-dedupe-rule';

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
}

/** What a dedupe verdict orders done — the `claim_verdicts.subject` payload. */
export interface DedupeVerdictSubject {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  via: 'token-multiset+judge' | 'similarity+judge';
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
      WHERE e.type = 'item' AND e.status = 'active'
        AND ${Prisma.raw(activeSupportExistsSql('e.entity_id'))}`);
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
    for (const pair of numberVariantPairs) {
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
          via: 'number',
        });
      } else {
        await this.mergeItemPair(pair.a_id, pair.b_id);
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
      WHERE a.type = 'item' AND b.type = 'item'
        AND a.status = 'active' AND b.status = 'active'
        AND (
          EXISTS (SELECT 1 FROM core_restaurant_items ca
                  WHERE a.entity_id IN (ca.restaurant_id, ca.food_id))
          OR EXISTS (SELECT 1 FROM core_restaurant_items cb
                     WHERE b.entity_id IN (cb.restaurant_id, cb.food_id))
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
      WHERE a.type = 'item' AND b.type = 'item'
        AND a.status = 'active' AND b.status = 'active'
        -- active-support only (D5): never merge shadow-minted vocabulary.
        -- The predicate is the scope service's ONE definition, imported.
        AND ${Prisma.raw(activeSupportExistsSql('a.entity_id'))}
        AND ${Prisma.raw(activeSupportExistsSql('b.entity_id'))}
        AND similarity(a.name, b.name) > ${floor}
        AND position(a.name IN b.name) = 0
        AND position(b.name IN a.name) = 0
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
    summary.candidatePairs = pairs.length;
    if (!pairs.length) {
      return summary;
    }

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

    for (const pair of autoMerge) {
      if (dryRun) {
        this.logger.info('Would merge duplicate foods', {
          a: pair.a_name,
          b: pair.b_name,
          via: 'auto',
        });
      } else {
        await this.mergeItemPair(pair.a_id, pair.b_id);
        // Same stale-snapshot guard as the number lane (R4): an id this
        // merge consumed must not reach the judge lane below.
        consumedByNumberLane.add(pair.a_id);
        consumedByNumberLane.add(pair.b_id);
      }
      summary.autoMerged += 1;
    }

    if (needJudge.length && !dryRun) {
      await this.adjudicateDedupeCandidates(
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
          via: 'similarity+judge',
        });
      }
    }

    this.logger.info('Food dedupe-merge pass complete', {
      dryRun,
      ...(summary as unknown as Record<string, unknown>),
    });
    return summary;
  }

  /** Full merge: pick winner by evidence, fold connections, bank the loser's
   *  name+surfaces on the winner, archive the loser. The deterministic lanes'
   *  entry point; the judge lane goes through settleDedupeVerdict so the plan
   *  is stored BEFORE the effect runs. */
  private async mergeItemPair(idA: string, idB: string): Promise<void> {
    if (idA === idB) {
      return; // self-merge annihilates the ledger (round-11 D1)
    }
    await this.executeItemMergePlan(await this.planItemMerge(idA, idB));
  }

  /** Winner selection — more connections wins (more evidence behind its
   *  name); ties break to the shorter name (more canonical). Pure planning,
   *  no mutation: the judge lane persists this as the verdict's subject
   *  before any effect runs. */
  private async planItemMerge(
    idA: string,
    idB: string,
  ): Promise<ItemMergePlan> {
    const [connectionsA, connectionsB] = await Promise.all([
      this.prisma.connection.count({ where: { itemId: idA } }),
      this.prisma.connection.count({ where: { itemId: idB } }),
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

    await this.prisma.$transaction(
      async (tx) => {
        await acquireIdentityMergeLocks(tx, EntityType.item, [
          entityLockKey(winner.name, EntityType.item),
          entityLockKey(loser.name, EntityType.item),
        ]);
        // Fold colliding connections (same restaurant has both variants).
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

        await finalizeMergeCompletion(tx, winner.entityId, loser.entityId);
      },
      // Explicit budget (round-12: default 5s + per-event loop = a
      // taco/tacos merge could never complete; matches the rebuild's).
      { timeout: 15 * 60 * 1000, maxWait: 30_000 },
    );

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

    const verdicts = await this.llmService.matchEntitiesBatch({
      kind: 'item',
      items: due.map((pair) => ({
        term: pair.a_name,
        candidates: [{ id: 1, name: pair.b_name }],
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
        via,
      });
      const plan = await this.planItemMerge(pair.a_id, pair.b_id);
      await this.settleDedupeVerdict(pair, via, 'merge', reason, plan);
      consumed.add(pair.a_id);
      consumed.add(pair.b_id);
      summary.judgeMerged += 1;
    }
  }

  /** Commit the verdict, THEN obey it (amendment (c)). */
  private async settleDedupeVerdict(
    pair: { a_id: string; a_name: string; b_id: string; b_name: string },
    via: DedupeVerdictSubject['via'],
    outcome: 'merge' | 'hold',
    reason: string,
    plan: ItemMergePlan | null,
  ): Promise<void> {
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
