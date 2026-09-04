import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { isEnvFlagEnabled } from '../../shared/config/env-flag';
import {
  bannedMergeReasonClass,
  refusedMergeHoldReason,
} from '../../shared/merge-reason-tripwire';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';
import {
  ClaimVerdictLedgerService,
  HearingSource,
} from '../content-processing/entity-resolver/claim-verdict-ledger.service';
import { EntityAnchorRehomeService } from '../content-processing/entity-resolver/entity-anchor-rehome.service';
import { entityLockKey } from '../content-processing/entity-resolver/entity-identity';
import {
  acquireIdentityMergeLocks,
  finalizeMergeCompletion,
  rekeyEntityDimensionEventsToCanonical,
} from '../content-processing/reddit-collector/extraction-scope.service';
import {
  AttributeEntityType,
  fetchAttributeCarriers,
  sharesSignificantToken,
  trigramJaccard,
  TRIGRAM_NEAR_DUPLICATE_FLOOR,
} from './attribute-ontology.service';
import {
  ATTRIBUTE_ID_ARRAY_COLUMNS,
  ATTRIBUTE_ID_SCALAR_SITES,
  repointAttributeIdRefs,
} from './attribute-reference-registry';
import {
  ATTRIBUTE_MERGE_LANE,
  attributeMergeLane,
} from './attribute-merge-lane.adapter';
import {
  ATTRIBUTE_MERGE_RULE_FINGERPRINT,
  ATTRIBUTE_MERGE_RULE_VERSION,
} from './attribute-merge-rule';
import { EntityEmbeddingReconcilerService } from '../entity-text-search/entity-embedding-reconciler.service';

/**
 * A candidate pair — two live same-type attributes whose MEANING may
 * coincide, however different the spelling. Provenance says which recall
 * signal surfaced it (embedding neighborhood / shared token / trigram).
 */
export interface AttributeMergeCandidate {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  cosine: number;
  via: 'embedding' | 'token' | 'trigram' | 'ontology';
}

/** The FULL merge plan, computed BEFORE the verdict commits and stored as
 *  its subject — a crash-resume replays THIS, never a recomputation. */
export interface AttributeMergePlan {
  type: AttributeEntityType;
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
}

/** What a verdict orders done — the `claim_verdicts.subject` payload. */
export interface AttributeMergeVerdictSubject {
  type: AttributeEntityType;
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  via: AttributeMergeCandidate['via'];
  /** Present on 'merge' verdicts only; a 'hold' orders nothing. */
  plan: AttributeMergePlan | null;
}

export interface AttributeMergeSummary {
  candidatePairs: number;
  judgeMerged: number;
  judgeRejected: number;
  judgeAlreadyDecided: number;
  judgeHeld: number;
  judgeUnjudged: number;
}

/** Embedding top-K per anchor — the same measured shortlist width the
 *  placement lane uses (DEFAULT_SHORTLIST_K's rationale: the LLM can only
 *  merge what recall shows it; K bounds pair volume without a floor nobody
 *  has measured). */
const NEIGHBOR_K = 10;

/** Pairs per judge request — matches the entity-match batch grain. */
const JUDGE_BATCH_SIZE = 40;

/** Per-run hearing bound: candidates are cosine-ranked, so truncation drops
 *  the least-similar pairs; the ledger's memory makes the next run resume
 *  where this one stopped instead of re-buying anything. */
const DEFAULT_MAX_HEARINGS = 500;

/**
 * ACTIVE-VOCABULARY ATTRIBUTE DEDUPE-MERGE — the post-hoc merge lane the
 * attribute vocabulary never had (owner directive 2026-08-29).
 *
 * The placement lane (AttributeOntologyService) adjudicates PENDING terms
 * against the active ontology, so two synonyms that both went active —
 * "killer atmosphere" / "great ambience", coined in different runs or
 * different batches — are never compared again: resolution-time exact/alias/
 * fuzzy folding misses them because their STRINGS differ while their CLAIM
 * is one. This lane closes that hole in the proven food-dedupe architecture:
 * candidate generation tuned for meaning (embedding neighborhoods + lexical
 * recall), a batched LLM judge asking the ONE-INTENTION test
 * (attribute-merge-prompt.md), verdict memory on the hearing ledger
 * (verdict-then-effect, rejections persisted, a rule bump the only
 * re-opener), and a merge that redirects rather than orphans — every
 * registered reference column repointed, user anchors rehomed, the event
 * substrate rekeyed, entity_redirects written.
 *
 * Cuisine facet rows are OUT of scope — the cuisine system owns that
 * vocabulary's identity.
 */
@Injectable()
export class AttributeDedupeMergeService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly embeddingService: EmbeddingService,
    private readonly anchorRehome: EntityAnchorRehomeService,
    private readonly ledger: ClaimVerdictLedgerService,
    loggerService: LoggerService,
    private readonly entityEmbeddings: EntityEmbeddingReconcilerService,
  ) {
    this.logger = loggerService.setContext('AttributeDedupeMergeService');
  }

  /**
   * THE JUDGE LANE'S ACTIVATION GATE — same shape as
   * DEDUPE_JUDGE_LANES_ENABLED on the food lane: the code path is complete,
   * but hearings that end in irreversible merges only run when the operator
   * (or, later, the scheduler ruling) flips the flag. Candidate generation
   * and dry-run listing never wait on it.
   */
  private judgeLaneEnabled(): boolean {
    return isEnvFlagEnabled(process.env.ATTRIBUTE_MERGE_JUDGE_ENABLED);
  }

  /**
   * Schedulable entry point (NOT cron-registered yet — the owner sequences
   * activation). Finishes decided-but-unexecuted work first, then runs both
   * vocabularies under the steady source.
   */
  async runSweep(): Promise<void> {
    try {
      await this.resumePendingEffects();
    } catch (resumeError) {
      this.logger.error(
        'Attribute-merge verdict resume failed — sweep still runs',
        resumeError,
      );
    }
    for (const type of ['place_attribute', 'item_attribute'] as const) {
      await this.run(type, { dryRun: false, source: 'steady' });
    }
  }

  async run(
    type: AttributeEntityType,
    options: {
      dryRun?: boolean;
      /** Dry-run only: judge this many top-ranked pairs WITHOUT recording —
       *  a preview of verdicts, deliberately outside the ledger because no
       *  effect will follow (verdict-then-effect stays inviolate). */
      sample?: number;
      maxHearings?: number;
      source?: HearingSource;
    } = {},
  ): Promise<AttributeMergeSummary> {
    const dryRun = options.dryRun ?? true;
    const maxHearings = options.maxHearings ?? DEFAULT_MAX_HEARINGS;
    const summary: AttributeMergeSummary = {
      candidatePairs: 0,
      judgeMerged: 0,
      judgeRejected: 0,
      judgeAlreadyDecided: 0,
      judgeHeld: 0,
      judgeUnjudged: 0,
    };

    const candidates = await this.generateCandidates(type);
    summary.candidatePairs = candidates.length;
    if (!candidates.length) return summary;

    // Ledger memory: a pair ruled on at the CURRENT rule version is never
    // re-bought. Checked in dry-run too, so the printed docket is the real
    // one an apply would hear.
    const decided = await this.ledger.decidedKeys(
      ATTRIBUTE_MERGE_LANE,
      ATTRIBUTE_MERGE_RULE_VERSION,
      attributeMergeLane.keyFoldVersion,
      candidates.map((pair) =>
        attributeMergeLane.canonicalClaimKey({
          entityId: pair.aId,
          otherEntityId: pair.bId,
        }),
      ),
    );
    const due = candidates.filter((pair) => {
      const key = attributeMergeLane.canonicalClaimKey({
        entityId: pair.aId,
        otherEntityId: pair.bId,
      });
      if (decided.has(key)) {
        summary.judgeAlreadyDecided += 1;
        return false;
      }
      return true;
    });

    if (dryRun) {
      for (const pair of due) {
        this.logger.info('Would judge attribute pair', {
          type,
          a: pair.aName,
          b: pair.bName,
          via: pair.via,
          cosine: Number(pair.cosine.toFixed(3)),
        });
      }
      const sample = Math.min(options.sample ?? 0, due.length);
      if (sample > 0) {
        await this.previewVerdicts(type, due.slice(0, sample));
      }
      return summary;
    }

    if (!this.judgeLaneEnabled()) {
      summary.judgeHeld += due.length;
      this.logger.info('Attribute-merge judge lane held — gate off', {
        type,
        pairs: due.length,
      });
      return summary;
    }

    await this.adjudicate(
      type,
      due.slice(0, maxHearings),
      summary,
      options.source ?? 'steady',
    );
    this.logger.info('Attribute dedupe-merge pass complete', {
      type,
      ...(summary as unknown as Record<string, unknown>),
    });
    return summary;
  }

  /**
   * CANDIDATE GENERATION — meaning-first recall over the LIVE vocabulary.
   *
   * String similarity alone is proven insufficient for attributes ("killer
   * atmosphere" / "great ambience" share almost nothing lexically), so the
   * generator unions three signals, mirroring the placement shortlist's
   * measured design (attribute-ontology.service.ts):
   *   1. embedding top-K neighborhood per attribute (semantic recall);
   *   2. shared significant token ("great ambience"/"great ambiance",
   *      "live jazz"/"live music");
   *   3. trigram-Jaccard >= the measured 0.4 floor (near-identical spellings
   *      the embedding neighborhood can bury).
   * Pairs are deduped on the sorted id pair and ranked by cosine, so the
   * per-run hearing bound truncates the least-similar candidates.
   */
  async generateCandidates(
    type: AttributeEntityType,
  ): Promise<AttributeMergeCandidate[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ entityId: string; name: string }>
    >`
      SELECT entity_id AS "entityId", name
      FROM core_entities
      WHERE type = ${type}::entity_type
        AND status = 'active'
        -- Cuisine facet rows are the cuisine system's identity, not this
        -- lane's ('cuisine' is a category dimension; class ② of the 2026-08
        -- data audit keeps it place_attribute-typed only until the prompt
        -- emits a native slot).
        AND (facet IS DISTINCT FROM 'cuisine')
      ORDER BY name`;
    if (rows.length < 2) return [];

    const vectors = await this.embeddingService.embed(rows.map((r) => r.name));

    const pairs = new Map<string, AttributeMergeCandidate>();
    const addPair = (
      i: number,
      j: number,
      cosine: number,
      via: AttributeMergeCandidate['via'],
    ) => {
      const [a, b] = [rows[i], rows[j]];
      const key = [a.entityId, b.entityId].sort().join('|');
      if (pairs.has(key)) return;
      pairs.set(key, {
        aId: a.entityId,
        aName: a.name,
        bId: b.entityId,
        bName: b.name,
        cosine,
        via,
      });
    };

    // Full cosine matrix — the vocabulary is hundreds of rows, so O(n^2)
    // in memory is cheap and needs no distance floor nobody has measured.
    const cosine: number[][] = rows.map(() => []);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const c = EmbeddingService.cosine(vectors[i], vectors[j]);
        cosine[i][j] = c;
        (cosine[j] ??= [])[i] = c;
      }
    }
    for (let i = 0; i < rows.length; i++) {
      const neighbors = rows
        .map((_, j) => j)
        .filter((j) => j !== i)
        .sort((x, y) => (cosine[i][y] ?? 0) - (cosine[i][x] ?? 0))
        .slice(0, NEIGHBOR_K);
      for (const j of neighbors) {
        addPair(Math.min(i, j), Math.max(i, j), cosine[i][j] ?? 0, 'embedding');
      }
    }
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (pairs.has([rows[i].entityId, rows[j].entityId].sort().join('|'))) {
          continue;
        }
        if (sharesSignificantToken(rows[i].name, rows[j].name)) {
          addPair(i, j, cosine[i][j] ?? 0, 'token');
        } else if (
          trigramJaccard(rows[i].name, rows[j].name) >=
          TRIGRAM_NEAR_DUPLICATE_FLOOR
        ) {
          addPair(i, j, cosine[i][j] ?? 0, 'trigram');
        }
      }
    }

    return Array.from(pairs.values()).sort((a, b) => b.cosine - a.cosine);
  }

  /** Dry-run verdict preview: judge WITHOUT recording. Deliberately outside
   *  the ledger — verdict-then-effect is the recording law, and a preview
   *  executes no effect, so remembering it would strand pending 'merge'
   *  verdicts for a later resume to execute unasked. */
  private async previewVerdicts(
    type: AttributeEntityType,
    pairs: AttributeMergeCandidate[],
  ): Promise<void> {
    const carriers = await fetchAttributeCarriers(
      this.prisma,
      type,
      Array.from(new Set(pairs.flatMap((p) => [p.aId, p.bId]))),
    );
    for (const batch of this.chunk(pairs, JUDGE_BATCH_SIZE)) {
      const verdicts = await this.llmService.judgeAttributeMergesBatch({
        kind: type,
        pairs: batch.map((p) => ({
          a: p.aName,
          b: p.bName,
          aUsedBy: carriers.get(p.aId),
          bUsedBy: carriers.get(p.bId),
        })),
      });
      for (let i = 0; i < batch.length; i++) {
        this.logger.info('DRY-RUN attribute-merge verdict (not recorded)', {
          type,
          a: batch[i].aName,
          b: batch[i].bName,
          decision: verdicts[i]?.decision ?? 'keep',
          reason: verdicts[i]?.reason ?? '(none — fail-closed)',
        });
      }
    }
  }

  /**
   * THE JUDGE LANE, ON THE HEARING LEDGER (food-dedupe's adjudication shape):
   * batched hearings; a 'merge' stores the FULL plan as the verdict's subject
   * BEFORE the effect runs; a 'keep' persists as 'hold' so tomorrow's scan
   * does not pay to ask again; a reasonless reply is NOT a ruling — the pair
   * is left unheard and re-offered.
   */
  private async adjudicate(
    type: AttributeEntityType,
    pairs: AttributeMergeCandidate[],
    summary: AttributeMergeSummary,
    source: HearingSource,
  ): Promise<void> {
    // An id consumed by an earlier merge in this run must not reach a later
    // hearing (stale-snapshot guard, food-dedupe R4).
    const consumed = new Set<string>();
    // D2 context standard: each side's real carriers ride the hearing.
    const carriers = await fetchAttributeCarriers(
      this.prisma,
      type,
      Array.from(new Set(pairs.flatMap((p) => [p.aId, p.bId]))),
    );
    for (const batch of this.chunk(pairs, JUDGE_BATCH_SIZE)) {
      const live = batch.filter(
        (p) => !consumed.has(p.aId) && !consumed.has(p.bId),
      );
      if (!live.length) continue;
      const verdicts = await this.llmService.judgeAttributeMergesBatch({
        kind: type,
        pairs: live.map((p) => ({
          a: p.aName,
          b: p.bName,
          aUsedBy: carriers.get(p.aId),
          bUsedBy: carriers.get(p.bId),
        })),
      });
      for (let i = 0; i < live.length; i++) {
        const pair = live[i];
        if (consumed.has(pair.aId) || consumed.has(pair.bId)) continue;
        const verdict = verdicts[i];
        const reason = verdict?.reason?.trim() ?? '';
        if (!verdict || !reason) {
          summary.judgeUnjudged += 1;
          continue;
        }
        if (verdict.decision !== 'merge') {
          await this.settleVerdict(type, pair, 'hold', reason, null, source);
          summary.judgeRejected += 1;
          continue;
        }
        this.logger.warn('Merging duplicate attributes (judge-approved)', {
          type,
          a: pair.aName,
          b: pair.bName,
        });
        const plan = await this.planMerge(type, pair.aId, pair.bId);
        const settled = await this.settleVerdict(
          type,
          pair,
          'merge',
          reason,
          plan,
          source,
        );
        if (settled !== 'merge') {
          // The reason tripwire refused the merge and recorded a hold.
          summary.judgeRejected += 1;
          continue;
        }
        consumed.add(pair.aId);
        consumed.add(pair.bId);
        summary.judgeMerged += 1;
      }
    }
  }

  /**
   * Survivor selection — pure planning, no mutation.
   *
   * OWNER-RULED (2026-08-30, sameness court D1): NO canonical dictionary —
   * the earlier pinned-spelling set is overruled. Survivor = more evidence
   * references (the name more testimony already lives under); ties break to
   * the shorter (plainer) name. Cold start is benign: every losing spelling
   * survives as a searchable alias and sweeps re-run, so an early "wrong"
   * survivor self-corrects as evidence accumulates.
   */
  async planMerge(
    type: AttributeEntityType,
    idA: string,
    idB: string,
  ): Promise<AttributeMergePlan> {
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
    const [refsA, refsB] = await Promise.all([
      this.countReferences(type, idA),
      this.countReferences(type, idB),
    ]);
    const aWins =
      refsA !== refsB
        ? refsA > refsB
        : entityA.name.length <= entityB.name.length;
    const winner = aWins ? entityA : entityB;
    const loser = aWins ? entityB : entityA;
    return {
      type,
      winnerId: winner.entityId,
      winnerName: winner.name,
      loserId: loser.entityId,
      loserName: loser.name,
    };
  }

  /** Evidence weight = rows referencing the id across the registry's sites
   *  — the same declaration the merge repoint iterates, so the winner rule
   *  and the rewrite can never disagree about what counts. */
  private async countReferences(
    type: AttributeEntityType,
    id: string,
  ): Promise<number> {
    let total = 0;
    for (const site of ATTRIBUTE_ID_ARRAY_COLUMNS[type]) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM ${site.table} WHERE $1::uuid = ANY(${site.column})`,
        id,
      );
      total += Number(rows[0]?.n ?? 0);
    }
    for (const site of ATTRIBUTE_ID_SCALAR_SITES[type]) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM ${site.table} WHERE ${site.column} = $1::uuid`,
        id,
      );
      total += Number(rows[0]?.n ?? 0);
    }
    return total;
  }

  /**
   * THE ONE MERGE DOOR FOR ATTRIBUTES (red team 2026-09-04 ID-3). The
   * ontology canonicalization pass reaches its merge decisions through its
   * own placement judge, but it used to EXECUTE them privately: a bare
   * `foldSurfacesFromMerge` with no verdict (so the loser's name landed at
   * 'recall' — powerless under the grade law), the loser archived with NO
   * entity_redirects row and NO ledger row. Since the grade law that meant
   * every later mention of a merged-away attribute name was sunk into the
   * redirect-less tombstone and DROPPED instead of routed to the canonical
   * (114 such losers on the local corpus). A merge decided anywhere is
   * still a merge: it is recorded in the attribute_merge lane (the reason
   * tripwire applies — a banned-class reason becomes a hold), executed by
   * the same plan executor (refs repointed, anchors rehomed, events rekeyed,
   * redirect written, loser's name folded at 'judged'), and marked executed.
   */
  async mergeDecidedElsewhere(params: {
    type: AttributeEntityType;
    winnerId: string;
    winnerName: string;
    loserId: string;
    loserName: string;
    reason: string;
    source?: HearingSource;
  }): Promise<'merge' | 'hold'> {
    const plan: AttributeMergePlan = {
      type: params.type,
      winnerId: params.winnerId,
      winnerName: params.winnerName,
      loserId: params.loserId,
      loserName: params.loserName,
    };
    const pair: AttributeMergeCandidate = {
      aId: params.winnerId,
      aName: params.winnerName,
      bId: params.loserId,
      bName: params.loserName,
      cosine: 1,
      via: 'ontology',
    };
    return this.settleVerdict(
      params.type,
      pair,
      'merge',
      params.reason,
      plan,
      params.source ?? 'steady',
    );
  }

  /** Commit the verdict, THEN obey it (the ledger's amendment (c)).
   *
   *  THE REASON TRIPWIRE (shared with the entity dedupe lane —
   *  shared/merge-reason-tripwire.ts) runs at this recording chokepoint:
   *  a merge whose stated ground names a banned class is refused and
   *  recorded as a fail-closed 'hold' with a loud log. */
  private async settleVerdict(
    type: AttributeEntityType,
    pair: AttributeMergeCandidate,
    outcome: 'merge' | 'hold',
    reason: string,
    plan: AttributeMergePlan | null,
    source: HearingSource,
  ): Promise<'merge' | 'hold'> {
    if (outcome === 'merge') {
      const banned = bannedMergeReasonClass(reason);
      if (banned) {
        this.logger.error(
          'MERGE REFUSED — judge reason names a banned class; recording hold',
          {
            type,
            a: pair.aName,
            b: pair.bName,
            bannedClass: banned,
            reason,
          },
        );
        outcome = 'hold';
        reason = refusedMergeHoldReason(banned, reason);
        plan = null;
      }
    }
    const claimKey = attributeMergeLane.canonicalClaimKey({
      entityId: pair.aId,
      otherEntityId: pair.bId,
    });
    const subject: AttributeMergeVerdictSubject = {
      type,
      aId: pair.aId,
      aName: pair.aName,
      bId: pair.bId,
      bName: pair.bName,
      via: pair.via,
      plan,
    };
    await this.ledger.record<AttributeMergeVerdictSubject>({
      lane: ATTRIBUTE_MERGE_LANE,
      claimKey,
      ruleVersion: ATTRIBUTE_MERGE_RULE_VERSION,
      foldVersion: attributeMergeLane.keyFoldVersion,
      outcome,
      reason,
      ruleFingerprint: ATTRIBUTE_MERGE_RULE_FINGERPRINT,
      subject,
      source,
    });
    await this.applyMergeEffect(subject);
    await this.ledger.markExecuted(
      ATTRIBUTE_MERGE_LANE,
      claimKey,
      ATTRIBUTE_MERGE_RULE_VERSION,
      attributeMergeLane.keyFoldVersion,
    );
    return outcome;
  }

  /** THE ONE PLACE A VERDICT TOUCHES THE CORPUS — live hearings and
   *  crash-resume both call this with the SAME stored subject. Overridable
   *  so a test can kill the effect mid-hearing and prove the verdict
   *  survives. A 'hold' orders nothing. */
  protected async applyMergeEffect(
    subject: AttributeMergeVerdictSubject,
  ): Promise<void> {
    if (subject.plan) {
      await this.executeMergePlan(subject.plan);
    }
  }

  /**
   * Execute a merge plan. IDEMPOTENT BY STATE: a plan whose loser is already
   * archived has already been executed, so it completes as a no-op.
   *
   * Inside ONE transaction, in dependency order:
   *   1. identity advisory locks (same namespace the creator takes);
   *   2. every registered attribute-id reference repointed (THE shared
   *      implementation — arrays + evidence ledger);
   *   3. user anchors hard-rekeyed (polls, curated lists, photos, requests);
   *   4. the entity-event substrate rekeyed (a projection rebuild must not
   *      resurrect the loser);
   *   5. finalizeMergeCompletion — surfaces folded, loser archived, scores
   *      pruned, entity_redirects written and flattened.
   */
  protected async executeMergePlan(plan: AttributeMergePlan): Promise<void> {
    const loserRows = await this.prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status::text FROM core_entities
       WHERE entity_id = ${plan.loserId}::uuid`;
    if (!loserRows.length || loserRows[0].status === 'archived') {
      this.logger.info('Attribute merge plan already executed', {
        winner: plan.winnerName,
        loser: plan.loserName,
      });
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        await acquireIdentityMergeLocks(tx, plan.type as EntityType, [
          entityLockKey(plan.winnerName, plan.type as EntityType),
          entityLockKey(plan.loserName, plan.type as EntityType),
        ]);
        await repointAttributeIdRefs(
          tx,
          plan.type,
          plan.loserId,
          plan.winnerId,
        );
        await this.anchorRehome.rehomeEntityAnchors(
          tx,
          plan.winnerId,
          plan.loserId,
        );
        await rekeyEntityDimensionEventsToCanonical(
          tx,
          plan.winnerId,
          plan.loserId,
        );
        await tx.entity.update({
          where: { entityId: plan.winnerId },
          data: { nameEmbeddingStale: true },
        });
        // THE VERDICT RIDES THE FOLD (red team 2026-09-03 P1#1) — same law
        // as the food and place merges: a ledgered merge folds the loser's
        // name at grade 'judged', never 'recall'.
        await finalizeMergeCompletion(tx, plan.winnerId, plan.loserId, {
          mergeVerdict: {
            lane: ATTRIBUTE_MERGE_LANE,
            claimKey: attributeMergeLane.canonicalClaimKey({
              entityId: plan.winnerId,
              otherEntityId: plan.loserId,
            }),
            ruleVersion: ATTRIBUTE_MERGE_RULE_VERSION,
            foldVersion: attributeMergeLane.keyFoldVersion,
          },
        });
      },
      { timeout: 15 * 60 * 1000, maxWait: 30_000 },
    );

    // Write-time embedding law: the winner's doc just gained the loser's
    // folded name; re-embed after the commit.
    await this.entityEmbeddings.embedEntities([plan.winnerId]);

    this.logger.info('Merged duplicate attributes', {
      winner: plan.winnerName,
      loser: plan.loserName,
    });
  }

  /** DECIDED BUT NOT EXECUTED — replay the STORED plan, never recompute. */
  async resumePendingEffects(limit = 500): Promise<number> {
    const pending =
      await this.ledger.pendingExecution<AttributeMergeVerdictSubject>(
        ATTRIBUTE_MERGE_LANE,
        ATTRIBUTE_MERGE_RULE_VERSION,
        attributeMergeLane.keyFoldVersion,
        limit,
      );
    let resumed = 0;
    for (const verdict of pending) {
      await this.applyMergeEffect(verdict.subject);
      await this.ledger.markExecuted(
        ATTRIBUTE_MERGE_LANE,
        verdict.claimKey,
        verdict.ruleVersion,
        verdict.foldVersion,
      );
      resumed += 1;
    }
    if (resumed) {
      this.logger.info('Resumed decided-but-unexecuted attribute merges', {
        resumed,
      });
    }
    return resumed;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  }
}
