import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import {
  addSurfaces,
  mintWordClaimVerdict,
  surfaceClaimKey,
  type SurfaceSource,
} from './entity-surface.service';
import { canonicalFold } from './entity-identity';
import {
  CLAIM_JUDGE_PROMPT,
  CLAIM_JUDGE_PROMPT_VERSION,
  CLAIM_JUDGE_RULE_FINGERPRINT,
} from './claim-judge-rule';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { ClaimRehearingBudgetService } from './claim-rehearing-budget.service';
import { WORD_CLAIM_LANE, wordClaimLane } from './word-claim-lane';

/**
 * THE WORD-CLAIM ADJUDICATOR — the judge behind the collision guard
 * (concept-graph §9.9, owner-ruled 2026-08-07: "build the claims registry").
 *
 * THE LAW IT ENFORCES. A word→concept claim carries provenance:
 *   testimony (observed: extraction/legacy/places — a person really said it)
 *     > judged (this service's verdicts)
 *     > inferred (vocabulary/knowledge_synthesis/seed/query_banking).
 * The collision guard (P0-b) refuses an inferred claim when ANY other entity
 * already holds the word. That is correct against testimony — an inference
 * never overrides evidence — but between two INFERENCES it is first-writer-
 * wins: a wrong early claim squats forever (`picante` on hot sauce blocked
 * spicy; measured cost: 4,698 blocked surfaces in one sweep). Both naive
 * alternatives were EXECUTED and falsified on the launch gate: allowing
 * cross-type coexistence blindly banked `helado` onto iced[attr] and beat
 * ice cream (gate 90.7→88.7, reverted in 69e6eeac7). So conflicts between
 * inferences go to a judge, per word, and the verdict is REMEMBERED:
 *   - a losing incumbent loses the WORD, never the label: a role='both' row
 *     degrades to role='display' (still rendered, no longer grounds), a
 *     role='recall' row is deprecated. Either way it cannot silently return;
 *   - a losing newcomer is written status='deprecated' (never re-proposed —
 *     the same remembered-wrong shape as R5-6b);
 *   - BOTH may win (`picante` = hot sauce to an American, spicy in Spanish)
 *     — a word naming two concepts is a fact the span scanner already
 *     carries; placement resolves per query.
 *
 * THE CASE IS ONE WORD, NOT ONE FOLD (2026-08-09). A conflict exists only
 * between claimants that want the IDENTICAL form (`surfaceClaimKey` — case and
 * punctuation fold, accents do not). The recall key `canonicalFold` drops
 * accents on purpose so 'bo' typed on a US keyboard still reaches bò, and
 * adjudicating on it meant every hearing between two Vietnamese words was a
 * FALSE CONFLICT: bò (beef), bơ (butter) and bó (bunch) arrived as one case,
 * and BOTH possible outcomes — refuse the newcomer, or evict the incumbent —
 * took a correct word→concept pairing away. Measured before the fix: 5 of 5
 * re-heard vi refusals would have evicted a correct incumbent, and the judge
 * flipped 60% of its own verdicts on re-ask. All of the regressions that built
 * this guard (caldo→soup, helado→iced, picante) are identical-form collisions
 * and are unaffected.
 *
 * The guard stays exactly as strict as before. This service is its appeal
 * court, run OFFLINE over the blocked backlog — never in a request path.
 */

/**
 * THE JUDGE'S RULE HAS A VERSION, AND A BUMP RE-OPENS EVERY VERDICT IT MADE
 * (2026-08-09; re-seated on the hearing ledger 2026-08-12). Every verdict is
 * a row in `claim_verdicts` stamped with the rule that reached it, and
 * `dueClaims` re-offers any claim with no verdict at the CURRENT rule. That
 * is the whole reason the number exists: when the RULE is found wrong, the
 * corpus is corrected by re-hearing, never by hand-editing rows. Two verdicts
 * were hand-reverted on 2026-08-09 (`chả giò`, `chảy`) because there was no
 * other lever.
 *
 * The number itself is DERIVED from the rule text (claim-judge-rule.ts), not
 * declared here: a constant beside the prompt can drift from it, and the
 * drift is silent in the direction that ruins the memory.
 */
export { CLAIM_JUDGE_PROMPT_VERSION } from './claim-judge-rule';

/** Claims per LLM call. */
const PER_CALL = 10;

/**
 * How many candidate rows one page of the due-scan reads. The due-predicate
 * cannot be a single SQL statement: the claim key is canonicalized in
 * TypeScript by the LANE'S ADAPTER (`surfaceClaimKey` — NFKD, format-control
 * deletion, case and punctuation folding, accents PRESERVED), and re-deriving
 * that in SQL would mint a second, subtly different definition of what one
 * claim is. That second definition is precisely the bug class this ledger
 * exists to end, so the population is paged and the decided set is subtracted
 * in the one place the canonicalization lives.
 */
const DUE_SCAN_PAGE = 500;

// TESTIMONY BY GRADE (alias-clean-slate, 2026-09-02): the old
// TESTIMONY_SOURCES set branched on WRITER provenance, which let a
// judge-normalized or template-generated string masquerade as testimony
// because of who wrote it. Authority now keys on claim_grade — only
// 'observed' (a person or the ground-truth provider actually used this
// string for this entity) is unevictable testimony. 'judged' rows are
// court output, re-hearable by construction; 'recall' is speculation.

export interface ContestedClaim {
  /** The word (verbatim surface) the target entity wants to claim. */
  form: string;
  locale: string;
  /** The entity trying to claim it. */
  entityId: string;
  source: SurfaceSource;
  /**
   * WHICH QUESTION THIS HEARING ANSWERS (2026-08-12). The default, 'grant', is
   * every caller that existed before: "may this concept TAKE this word?" —
   * and if nothing contests it there is nothing to decide, so it is banked
   * without paying for a judge. 'retain' is the retraction feed: "this
   * concept ALREADY HOLDS this word — should it?" That question is real even
   * with no rival, and it is the only reason a mis-bank nobody contests can
   * ever be corrected.
   *
   * THE ROW DECIDES WHICH QUESTION IS REAL (H5, 2026-08-12). This used to be
   * the caller's assertion, on the reasoning that the two questions have
   * opposite cheap answers and a hearing costs money. But the caller cannot
   * be more right about it than the row: a LIVE recall row can only be asked
   * "should this still hold?", and a deprecated or display row can only be
   * asked "may this be taken?". `dueClaims` derives it, so a feed can no
   * longer mis-state the question and pay for an answer nothing may act on.
   * A caller-supplied value is still honoured for the direct-call path.
   */
  hearing?: 'grant' | 'retain';
}

export interface AdjudicationSummary {
  considered: number;
  /** Skipped: incumbent is testimony or the entity's own name — no appeal. */
  testimonyUpheld: number;
  judged: number;
  /** Newcomer banked, incumbent kept (legit multi-claim). */
  bothUpheld: number;
  /**
   * SURFACES ACTUALLY BANKED BY THIS HEARING — counted at the `bank()` call
   * itself, which is the only honest place. It is NOT `bothUpheld +
   * incumbentEvicted`: the uncontested branch above increments `bothUpheld`
   * for a claim whose target entity no longer exists (`!p.target`) and banks
   * NOTHING. The label sweep reports its banked total from this number, so
   * an outcome counter that overcounts by one dead entity would inflate the
   * sweep's headline. Zero under dryRun, because nothing was written.
   */
  banked: number;
  /** Incumbent deprecated, newcomer banked. */
  incumbentEvicted: number;
  /** Newcomer written 'deprecated' — remembered wrong, never re-proposed. */
  newcomerRefused: number;
  /**
   * A claim the entity ALREADY HELD, taken back — the retraction outcome
   * (2026-08-12). Counted apart from `newcomerRefused` because the two are
   * different events in the corpus: a refusal keeps a wrong word OUT, a
   * retraction takes a wrong word that has been grounding mentions at 0.95
   * AWAY. Only the second one changes what a searcher sees today.
   */
  claimsRetracted: number;
  /** Judge unavailable/failed — left blocked, re-offered next run. */
  unjudged: number;
  /** Every hearing that reached a verdict, with the judge's stated reason. */
  cases: JudgedCase[];
}

interface Claimant {
  entityId: string;
  name: string;
  type: string;
  /** Up to 3 sample active surfaces — the judge's context for what this
   *  concept actually is (v1's bare name+type mis-voted picante/café). */
  context: string[];
  /** True when the claim is testimony or the entity's own identity. */
  testimony: boolean;
  aliasId: string | null;
  /**
   * How this concept sits next to the CLAIMANT under judgment in the derived
   * concept graph — the near-synonym question, answered from data the corpus
   * already derives (`entity_satisfies`, `derived_entity_sibling_edges`)
   * instead of from the model's feel for two bare names. Null on the target
   * itself.
   */
  adjacency: string | null;
}

/** One case's outcome, as the judge stated it — kept so a verdict can be
 *  read back with its reason instead of inferred from row diffs. */
export interface JudgedCase {
  form: string;
  locale: string;
  entityId: string;
  targetName: string;
  outcome:
    | 'bothUpheld'
    | 'incumbentEvicted'
    | 'newcomerRefused'
    | 'claimRetracted';
  /** Incumbents this hearing kept / took the word from, as "name[type]". */
  upheld: string[];
  evicted: string[];
  reason: string;
}

/**
 * WHAT THE VERDICT ORDERS DONE — persisted as the verdict's `subject`, so a
 * resumed effect replays the decision rather than re-deriving it from a corpus
 * that may have moved. Three orthogonal moves cover every outcome this lane
 * can reach: take the word from some surfaces, bank it on the claimant,
 * remember it as refused.
 */
export interface WordClaimEffect {
  form: string;
  locale: string;
  entityId: string;
  source: SurfaceSource;
  /**
   * Surfaces whose recall claim dies — evicted incumbents, or the held row on
   * a retraction — each with THE STATE THE VERDICT ORDERS IT INTO.
   *
   * ABSOLUTE, NOT RELATIVE (2026-08-13). This used to be a bare list of
   * surface ids, and the transition ("a 'both' row becomes 'display', anything
   * else is deprecated") was re-derived from the row's CURRENT state at write
   * time. That makes the effect non-idempotent in the worst way: run it once
   * and a label row is degraded to 'display' and deliberately left ACTIVE, so
   * the user keeps their localized name; run the very same effect again and
   * the row is no longer 'both', the second arm fires instead, and the label
   * is deprecated — 15,565 default-label rows away from an English fallback
   * nobody ruled on. A replay is not a new decision and must not be able to
   * mean something new.
   *
   * So the target state is computed ONCE, when the verdict is reached, and
   * stored here. Replaying writes the same bytes, because the bytes are what
   * was decided rather than a function of a corpus that has since moved.
   */
  takeWord: SurfaceTargetState[];
  /** Write the claim active on the claimant. */
  bank: boolean;
  /** Write the claim 'deprecated' — remembered wrong, never re-proposed. */
  refuse: boolean;
}

/** One surface, and the exact (role, status) the verdict puts it in. */
export interface SurfaceTargetState {
  surfaceId: string;
  role: string;
  status: string;
}

type WordClaimIdentityFields = Pick<
  WordClaimEffect,
  'form' | 'locale' | 'entityId' | 'source'
>;

@Injectable()
export class WordClaimAdjudicatorService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    loggerService: LoggerService,
    private readonly ledger: ClaimVerdictLedgerService,
    private readonly budget: ClaimRehearingBudgetService,
  ) {
    this.logger = loggerService.setContext('WordClaimAdjudicatorService');
  }

  /**
   * FINISH WHAT WAS ALREADY DECIDED, BEFORE DECIDING ANYTHING NEW
   * (amendment (c)).
   *
   * A verdict commits before its effect runs, so a process that dies in
   * between leaves a decision the corpus has not yet obeyed. Every effect
   * this lane performs is idempotent — banking upserts, refusing upserts,
   * taking the word is an UPDATE keyed by surface id — so resuming is
   * replaying the stored effect, not reconstructing it: the subject row
   * carries exactly what the decision said to do, which is why a resumed
   * effect can never drift from the verdict that ordered it.
   *
   * Returns how many verdicts it completed.
   */
  async resumePendingEffects(limit = 500): Promise<number> {
    const pending = await this.ledger.pendingExecution<WordClaimEffect>(
      WORD_CLAIM_LANE,
      CLAIM_JUDGE_PROMPT_VERSION,
      wordClaimLane.keyFoldVersion,
      limit,
    );
    let resumed = 0;
    for (const verdict of pending) {
      await this.applyEffect(verdict.subject);
      await this.ledger.markExecuted(
        WORD_CLAIM_LANE,
        verdict.claimKey,
        verdict.ruleVersion,
        verdict.foldVersion,
      );
      resumed += 1;
    }
    if (resumed) {
      this.logger.info('Resumed decided-but-unexecuted word-claim verdicts', {
        resumed,
      });
    }
    return resumed;
  }

  /**
   * THE ONE PLACE A WORD CLAIM'S DECISION TOUCHES THE CORPUS.
   *
   * Live hearings and crash-resume both call this with the SAME stored
   * subject, so there is no second implementation to drift. Overridable so a
   * test can kill the effect mid-hearing and prove the verdict survives.
   */
  protected async applyEffect(effect: WordClaimEffect): Promise<boolean> {
    if (effect.takeWord.length) {
      await this.takeTheWord(effect.takeWord);
    }
    if (effect.refuse) {
      await this.refuse(effect);
      return false;
    }
    if (effect.bank) {
      return this.bank(effect);
    }
    return false;
  }

  /** Commit the verdict, THEN obey it. Returns whether a surface was banked. */
  private async settle(
    claim: ContestedClaim,
    outcome: JudgedCase['outcome'],
    reason: string,
    effect: Omit<WordClaimEffect, keyof WordClaimIdentityFields>,
  ): Promise<boolean> {
    const full: WordClaimEffect = {
      form: claim.form,
      locale: claim.locale,
      entityId: claim.entityId,
      source: claim.source,
      ...effect,
    };
    const claimKey = wordClaimLane.canonicalClaimKey(claim);
    await this.ledger.record<WordClaimEffect>({
      lane: WORD_CLAIM_LANE,
      claimKey,
      ruleVersion: CLAIM_JUDGE_PROMPT_VERSION,
      foldVersion: wordClaimLane.keyFoldVersion,
      outcome,
      reason,
      ruleFingerprint: CLAIM_JUDGE_RULE_FINGERPRINT,
      subject: full,
    });
    const banked = await this.applyEffect(full);
    await this.ledger.markExecuted(
      WORD_CLAIM_LANE,
      claimKey,
      CLAIM_JUDGE_PROMPT_VERSION,
      wordClaimLane.keyFoldVersion,
    );
    return banked;
  }

  /**
   * HEAR THESE CLAIMS — and the ONE place a hearing can be paid for.
   *
   * Two gates live here rather than in the callers (2026-08-13), because a
   * gate a caller has to remember is a gate that has already been forgotten:
   * the nightly label sweep called straight into this method with its whole
   * appeal docket, past a budget check it never made and a due-predicate it
   * never consulted.
   *
   *   - ALREADY DECIDED IS NOT DUE. A claim with a verdict at the rule and
   *     fold in force has been answered; re-asking buys the same answer twice
   *     and — before `record` stopped re-opening identical verdicts — marked
   *     the finished effect unexecuted and replayed it.
   *   - THE DRAIN IS A SPEND EVENT. What is left of the rolling allowance
   *     bounds it, and beyond that an approved estimate is required. The
   *     refusal carries the quote.
   */
  async adjudicate(
    claims: ContestedClaim[],
    options: { dryRun?: boolean; approvedHash?: string | null } = {},
  ): Promise<AdjudicationSummary> {
    const dryRun = options.dryRun ?? false;
    const summary: AdjudicationSummary = {
      considered: 0,
      testimonyUpheld: 0,
      judged: 0,
      bothUpheld: 0,
      banked: 0,
      incumbentEvicted: 0,
      newcomerRefused: 0,
      claimsRetracted: 0,
      unjudged: 0,
      cases: [],
    };

    // One judgment per (word, target entity).
    const seen = new Set<string>();
    const deduped = claims.filter((c) => {
      // Keyed by the CLAIM unit (the word), not the recall fold: bò and bơ on
      // one entity are two claims, and folding them together silently dropped
      // the second one unheard.
      const key = `${surfaceClaimKey(c.form)}|${c.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // THE DUE-PREDICATE, AT THE CHOKEPOINT. Same test `dueClaims` applies, so
    // a caller that selected properly loses nothing and a caller that did not
    // stops paying for settled questions.
    const alreadyDecided = await this.ledger.decidedKeys(
      WORD_CLAIM_LANE,
      CLAIM_JUDGE_PROMPT_VERSION,
      wordClaimLane.keyFoldVersion,
      deduped.map((claim) => wordClaimLane.canonicalClaimKey(claim)),
    );
    const undecided = deduped.filter(
      (claim) => !alreadyDecided.has(wordClaimLane.canonicalClaimKey(claim)),
    );

    // THE BUDGET GATE. Refuses loudly with a quote; it does not silently
    // truncate, because a caller that believes it heard everything and did
    // not is how a backlog goes quietly unheard.
    const authorized = await this.budget.authorizeDrain({
      lane: WORD_CLAIM_LANE,
      ruleVersion: CLAIM_JUDGE_PROMPT_VERSION,
      dueCount: undecided.length,
      approvedHash: options.approvedHash,
    });
    const unique = undecided.slice(0, authorized.allowed);

    for (let i = 0; i < unique.length; i += PER_CALL) {
      const batch = unique.slice(i, i + PER_CALL);
      const prepared = await Promise.all(
        batch.map(async (claim) => ({
          claim,
          target: await this.entityCard(claim.entityId, claim.form),
          incumbents: await this.incumbentsOf(claim.form, claim.entityId),
          // Only a RETAIN hearing reads the held row: a grant hearing has the
          // same cheap answer it always had.
          held:
            claim.hearing === 'retain' ? await this.heldClaimOf(claim) : null,
        })),
      );

      const judgeable: typeof prepared = [];
      for (const p of prepared) {
        summary.considered += 1;
        if (p.claim.hearing === 'retain' && !p.held) {
          // The row moved between selection and hearing (merged, evicted,
          // already retracted). A retain hearing may never BANK — it was
          // asked to review a claim, not to create one — so it simply has
          // nothing to review.
          continue;
        }
        if (!p.target || (p.incumbents.length === 0 && !p.held)) {
          // Nothing contests it anymore — bank directly. This is also how a
          // FALSE CONFLICT is undone: a claim refused when the hearing was
          // held on the accent-blind fold has no same-word incumbent at all,
          // so the re-hearing finds no case to answer and the word goes back.
          if (p.target && !dryRun) {
            // A RULING, NOT AN ABSENCE. Nothing contested the word, so the
            // rule decided it without a judge — but it IS a decision, and
            // recording it is what stops the nightly re-offering the same
            // free question forever (the stamp did the same job before).
            // A rule-version bump re-opens it exactly like a judged one.
            if (
              await this.settle(
                p.claim,
                'bothUpheld',
                'uncontested — no other concept claims this word',
                { takeWord: [], bank: true, refuse: false },
              )
            ) {
              summary.banked += 1;
            }
          }
          summary.bothUpheld += 1;
          if (p.target) {
            summary.cases.push({
              form: p.claim.form,
              locale: p.claim.locale,
              entityId: p.claim.entityId,
              targetName: `${p.target.name}[${p.target.type}]`,
              outcome: 'bothUpheld',
              upheld: [],
              evicted: [],
              reason: 'uncontested — no other concept claims this word',
            });
          }
          continue;
        }
        // THE SINGLE-CLAIMANT HEARING (2026-08-12) — why the branch above is
        // now conditioned on `held`.
        //
        // "Nothing contests it, so bank it" is the right answer for a claim
        // being PROPOSED. It is the wrong answer, and was the wrong answer
        // forever, for a claim the entity ALREADY HOLDS: there is nothing to
        // bank, so the shortcut decided nothing, and a wrong surface with no
        // rival was never heard at all. `bánh cuộn` sat on `wrap` grounding
        // Vietnamese mentions at 0.95 with no other concept claiming the word,
        // so no hearing could ever be convened for it — the judge only met
        // CONTESTS, and a mis-bank is not a contest, it is one claimant who
        // should not have the word.
        //
        // So a held claim is heard on its own. The question does not change:
        // the v3 prompt asks, per claimant, "would a speaker of this locale
        // typing this word be satisfied by THIS concept?" — a question about
        // ONE pairing, which an empty incumbent list does not affect (the
        // model answers `a_owns_word` and an empty `incumbents_own_word`).
        // The ANSWER is what differs: a NO here does not refuse a newcomer, it
        // RETRACTS a word the corpus is actively grounding on, and a YES
        // stamps the row with the rule that upheld it so no later feed pays to
        // ask again.
        //
        // TESTIMONY MAKES AN INCUMBENT UNEVICTABLE — it does NOT bar a
        // co-claim. `cafe` the venue type owns the string as its NAME, and
        // "café" is STILL the Spanish word for coffee: the newcomer's own
        // merit gets a hearing; only eviction is off the table. (First
        // version refused without a hearing and cost café→coffee,
        // picante→spicy on the launch gate — measured, corrected.)
        judgeable.push(p);
      }
      if (!judgeable.length) continue;

      let verdicts: Map<
        number,
        { target: boolean; others: boolean[]; reason: string }
      >;
      try {
        verdicts = await this.judge(judgeable);
      } catch (error) {
        summary.unjudged += judgeable.length;
        this.logger.warn('Claim judge failed (claims left blocked)', {
          size: judgeable.length,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        continue;
      }

      for (let n = 0; n < judgeable.length; n += 1) {
        const p = judgeable[n];
        const verdict = verdicts.get(n + 1);
        if (!verdict) {
          summary.unjudged += 1;
          continue;
        }
        summary.judged += 1;
        const label = (c: Claimant) => `${c.name}[${c.type}]`;
        if (!verdict.target) {
          // A NO MEANS TWO DIFFERENT THINGS, and the row decides which.
          // For a claim the entity does NOT hold, it is a refusal: remember
          // the word as wrong so no sweep re-proposes it. For a claim it DOES
          // hold, it is a RETRACTION: the word is grounding mentions right
          // now, and the same encoding eviction uses takes it back — the word
          // dies, the label lives.
          if (!dryRun) {
            await this.settle(
              p.claim,
              p.held ? 'claimRetracted' : 'newcomerRefused',
              verdict.reason,
              p.held
                ? {
                    takeWord: await this.takeWordTargets([p.held.surfaceId]),
                    bank: false,
                    refuse: false,
                  }
                : { takeWord: [], bank: false, refuse: true },
            );
          }
          if (p.held) {
            summary.claimsRetracted += 1;
          } else {
            summary.newcomerRefused += 1;
          }
          summary.cases.push({
            form: p.claim.form,
            locale: p.claim.locale,
            entityId: p.claim.entityId,
            targetName: p.target ? label(p.target) : p.claim.entityId,
            outcome: p.held ? 'claimRetracted' : 'newcomerRefused',
            upheld: p.incumbents.map(label),
            evicted: [],
            reason: verdict.reason,
          });
          continue;
        }
        // PER-INCUMBENT verdicts (v2): evict exactly the incumbents the
        // judge rejected — never a testimony claim (unevictable by law).
        const evictable = p.incumbents.filter(
          (inc, k) => verdict.others[k] === false && !inc.testimony,
        );
        if (!dryRun) {
          const banked = await this.settle(
            p.claim,
            evictable.length ? 'incumbentEvicted' : 'bothUpheld',
            verdict.reason,
            {
              takeWord: await this.takeWordTargets(
                evictable
                  .map((inc) => inc.aliasId)
                  .filter((id): id is string => id !== null),
              ),
              bank: true,
              refuse: false,
            },
          );
          if (banked) summary.banked += 1;
        }
        if (evictable.length) {
          summary.incumbentEvicted += 1;
        } else {
          summary.bothUpheld += 1;
        }
        const evictedSet = new Set(evictable.map((inc) => inc.entityId));
        summary.cases.push({
          form: p.claim.form,
          locale: p.claim.locale,
          entityId: p.claim.entityId,
          targetName: p.target ? label(p.target) : p.claim.entityId,
          outcome: evictable.length ? 'incumbentEvicted' : 'bothUpheld',
          upheld: p.incumbents
            .filter((inc) => !evictedSet.has(inc.entityId))
            .map(label),
          evicted: evictable.map(label),
          reason: verdict.reason,
        });
      }
    }

    this.logger.info('Word-claim adjudication complete', {
      ...summary,
      cases: summary.cases.length,
      dryRun,
    });
    return summary;
  }

  private async entityCard(
    entityId: string,
    form: string,
  ): Promise<Claimant | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ entity_id: string; name: string; type: string }>
    >`SELECT entity_id::text, name, type::text FROM core_entities
       WHERE entity_id = ${entityId}::uuid AND status = 'active'`;
    const row = rows[0];
    if (!row) return null;
    return {
      entityId: row.entity_id,
      name: row.name,
      type: row.type,
      context: await this.sampleSurfaces(row.entity_id, form),
      testimony: false,
      aliasId: null,
      adjacency: null,
    };
  }

  /**
   * The claimant's context — "what else do people call this concept" — for the
   * judge to see what it actually IS (v1's bare name+type mis-voted
   * picante/café).
   *
   * THE WORD UNDER JUDGMENT IS NEVER ITS OWN EVIDENCE (2026-08-12). When the
   * claim is one the entity already HOLDS — every retraction hearing — that
   * row is in this sample, so the card read "…also known as: <the word>" and
   * the judge answered, verbatim, "the word is explicitly listed as a name for
   * the claimant concept in the provided data". That is the claim restated as
   * proof of itself: a retraction hearing could never reach NO, no matter how
   * wrong the pairing. Excluding it costs a contested hearing nothing (an
   * incumbent's holding of the word is already stated by its being an
   * incumbent) and is what makes the single-claimant question answerable.
   */
  private async sampleSurfaces(
    entityId: string,
    exceptForm: string,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ form: string }>>`
      SELECT form FROM entity_surface
       WHERE entity_id = ${entityId}::uuid AND status = 'active'
         -- Recall surfaces only: this is "what do people CALL it", the
         -- judge's context for what the concept actually is.
         AND role <> 'display'
       ORDER BY created_at ASC LIMIT 4`;
    const under = surfaceClaimKey(exceptForm);
    return rows
      .filter((r) => surfaceClaimKey(r.form) !== under)
      .slice(0, 3)
      .map((r) => r.form);
  }

  /**
   * Every OTHER active entity currently holding THE SAME WORD, with provenance.
   *
   * THE HEARING IS PER FORM (2026-08-09). The fold still FETCHES the candidate
   * set — it is the indexed column, and a superset of the real conflicts — but
   * an incumbent only contests the claim when it wants the identical word,
   * accents included (`surfaceClaimKey`). Before this the judge was handed
   * bò/bơ/bó as one case and asked which concept owns `bo`: an unanswerable
   * question it answered differently 60% of the time on re-ask, and whose every
   * outcome was wrong — 5 of 5 refused vi claims would, re-heard, have evicted
   * a CORRECT incumbent. A question that cannot be answered must not be asked.
   */
  private async incumbentsOf(
    form: string,
    exceptEntityId: string,
  ): Promise<Claimant[]> {
    const folded = canonicalFold(form);
    const claimKey = surfaceClaimKey(form);
    const rows = await this.prisma.$queryRaw<
      Array<{
        entity_id: string;
        name: string;
        type: string;
        form: string;
        source: string | null;
        surface_id: string | null;
        is_name: boolean;
        claim_grade: string | null;
      }>
    >`SELECT e.entity_id::text, e.name, e.type::text, e.name AS form,
             NULL AS source, NULL::uuid AS surface_id, TRUE AS is_name,
             NULL AS claim_grade
        FROM core_entities e
       WHERE e.identity_key = ${folded} AND e.status <> 'archived'
         AND e.entity_id <> ${exceptEntityId}::uuid
      UNION ALL
      SELECT e.entity_id::text, e.name, e.type::text, a.form, a.source,
             a.surface_id, FALSE, a.claim_grade
        FROM entity_surface a
        JOIN core_entities e ON e.entity_id = a.entity_id
       WHERE a.form_folded = ${folded} AND a.status = 'active'
         -- An INCUMBENT is an entity that HOLDS the word for recall. A
         -- role='display' row makes no recall claim (its own was refused or
         -- withheld), so it contests nothing.
         AND a.role <> 'display'
         AND e.status = 'active'
         AND a.entity_id <> ${exceptEntityId}::uuid`;
    const claimants: Claimant[] = [];
    for (const row of rows) {
      // Same fold, different word (bò vs bơ) — not a conflict, no hearing.
      if (surfaceClaimKey(row.form) !== claimKey) continue;
      claimants.push({
        entityId: row.entity_id,
        name: row.name,
        type: row.type,
        context: await this.sampleSurfaces(row.entity_id, form),
        testimony: row.is_name || row.claim_grade === 'observed',
        aliasId: row.surface_id,
        adjacency: await this.adjacencyOf(exceptEntityId, row.entity_id),
      });
    }
    return claimants;
  }

  /**
   * IS THIS CLAIM ALREADY BANKED — the one fact that turns a hearing from
   * "should this word be granted?" into "should this word be taken back?".
   *
   * A row qualifies only if it is what a mis-bank actually is: ACTIVE, making
   * a RECALL claim (role='display' holds nothing — its claim was refused or
   * never made, so there is nothing to retract), on THIS entity, in the
   * claim's own locale, and spelled the IDENTICAL word. The fold fetches, the
   * claim key decides — the same two-step every other claim test in this file
   * uses, because `bò` and `bơ` share a fold and retracting one on the
   * strength of the other is the very false-conflict the v3 hearing exists to
   * stop.
   */
  private async heldClaimOf(
    claim: ContestedClaim,
  ): Promise<{ surfaceId: string; form: string; role: string } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ surface_id: string; form: string; role: string }>
    >`SELECT surface_id::text, form, role::text
        FROM entity_surface
       WHERE entity_id = ${claim.entityId}::uuid
         AND locale = ${claim.locale}
         AND form_folded = ${canonicalFold(claim.form)}
         AND status = 'active'
         AND role <> 'display'`;
    const claimKey = surfaceClaimKey(claim.form);
    const row = rows.find((r) => surfaceClaimKey(r.form) === claimKey);
    return row
      ? { surfaceId: row.surface_id, form: row.form, role: row.role }
      : null;
  }

  private async judge(
    items: Array<{
      claim: ContestedClaim;
      target: Claimant | null;
      incumbents: Claimant[];
    }>,
  ): Promise<
    Map<number, { target: boolean; others: boolean[]; reason: string }>
  > {
    const card = (c: Claimant | null, label: string) =>
      `   ${label}: "${c?.name}" [${c?.type}]` +
      (c?.context.length ? ` — also known as: ${c.context.join(', ')}` : '') +
      (c?.adjacency ? `\n      graph: ${c.adjacency}` : '');
    // THE RULE lives in prompts/claim-judge-prompt.md (promoted from an
    // inline block, prompt-fleet audit 2026-08-11 — same v3 text verbatim,
    // so CLAIM_JUDGE_PROMPT_VERSION stays 3: a placement change re-hears
    // nothing). Only the dynamic case cards are built here.
    const prompt = items
      .map(({ claim, target, incumbents }, index) =>
        [
          `${index + 1}. WORD "${claim.form}" (locale ${claim.locale})`,
          card(target, 'claimant_a (new)'),
          ...incumbents.map((inc, k) => card(inc, `incumbent_${k + 1}`)),
        ].join('\n'),
      )
      .join('\n');

    const text = await this.llm.generateForCaller({
      caller: 'aliases.claim_judge',
      systemInstruction: CLAIM_JUDGE_PROMPT,
      prompt,
      generationConfig: {
        // ZERO, not 0.1 (2026-08-11) — same measured rationale as the
        // vocabulary pass (vocabulary-generator.ts): ownership verdicts are
        // persisted rulings over a fixed claimant set; a re-ask must return
        // the same answer, and sampling variety was measurable harm there.
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  n: { type: 'number' },
                  a_owns_word: { type: 'boolean' },
                  incumbents_own_word: {
                    type: 'array',
                    items: { type: 'boolean' },
                  },
                  reason: {
                    type: 'string',
                    description:
                      'The stated ground for the ruling — a ruling with no stated ground is not a ruling; a blank reason leaves the claim unjudged',
                  },
                },
                required: ['n', 'a_owns_word', 'incumbents_own_word', 'reason'],
              },
            },
          },
          required: ['items'],
        },
      },
    });
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      items?: Array<{
        n?: number;
        a_owns_word?: boolean;
        incumbents_own_word?: boolean[];
        reason?: string;
      }>;
    };
    return new Map(
      (parsed.items ?? [])
        .filter((item) => typeof item.n === 'number')
        // A RULING WITH NO STATED GROUND IS NOT A RULING (H5 amendment (d)).
        // The rule asks for the reason by name and the schema requires it, so
        // a blank one means the model did not actually answer this case —
        // dropping it here leaves the claim UNJUDGED and due, which is what
        // an unanswered question deserves. Acting on it would mutate the
        // corpus with nothing on the record to audit or re-open, and the
        // database refuses that write anyway.
        .filter((item) => (item.reason ?? '').trim().length > 0)
        .map((item) => [
          item.n as number,
          {
            target: item.a_owns_word === true,
            others: item.incumbents_own_word ?? [],
            reason: (item.reason ?? '').trim(),
          },
        ]),
    );
  }

  /**
   * HOW THESE TWO CONCEPTS SIT IN THE GRAPH — the near-synonym question,
   * answered from derived data.
   *
   * `entity_satisfies` is an explicit judgment the corpus already made about
   * substitutability ('satisfies' / 'cousin' / 'reject'), and
   * `derived_entity_sibling_edges` carries embedding neighbourhood with a
   * mutual rank. Shrimp and prawns, for instance, are a satisfies edge AND
   * each other's rank-1 mutual sibling — which is exactly the evidence that
   * makes "a searcher would accept either" a fact rather than a hunch. Handing
   * the judge nothing forced it to decide near-synonymy from two bare names,
   * and it decided wrong (tôm, chả giò).
   */
  private async adjacencyOf(
    entityId: string,
    otherId: string,
  ): Promise<string | null> {
    const [relations, siblings] = await Promise.all([
      this.prisma.$queryRaw<Array<{ relation: string }>>`
        SELECT relation FROM entity_satisfies
         WHERE (from_entity_id = ${entityId}::uuid AND to_entity_id = ${otherId}::uuid)
            OR (from_entity_id = ${otherId}::uuid AND to_entity_id = ${entityId}::uuid)`,
      this.prisma.$queryRaw<Array<{ forward_rank: number }>>`
        SELECT forward_rank FROM derived_entity_sibling_edges
         WHERE (anchor_entity_id = ${entityId}::uuid AND sibling_entity_id = ${otherId}::uuid)
            OR (anchor_entity_id = ${otherId}::uuid AND sibling_entity_id = ${entityId}::uuid)
         ORDER BY forward_rank ASC LIMIT 1`,
    ]);
    const parts: string[] = [];
    for (const row of relations) parts.push(`${row.relation} edge`);
    if (siblings[0]) {
      parts.push(`semantic sibling (rank ${siblings[0].forward_rank})`);
    }
    // SILENCE IS NOT EVIDENCE OF DISTANCE. An absent edge can mean "judged
    // unrelated" or "never derived for this pair", and the two are not the
    // same claim — so nothing is said when nothing is known.
    return parts.length ? parts.join(', ') : null;
  }

  /**
   * THE CLAIMS DUE A FRESH HEARING — one predicate, symmetric over wins and
   * losses (H5, 2026-08-12). This replaces `staleVerdictClaims`, and the
   * replacement is not a rename.
   *
   * The old selection could only see claims that had LOST: a refused newcomer
   * (status='deprecated') or an evicted recall claim (role='display'), because
   * those are the rows a lost hearing leaves behind and the stamp had to live
   * on a row. A claim the judge UPHELD became an ordinary active surface,
   * indistinguishable from one nobody ever heard — so a wrong YES could not be
   * re-opened by a rule bump, by a re-hearing, or by anything at all. The
   * corpus was grounding Vietnamese mentions on `bánh cuộn`→wrap at 0.95 with
   * no mechanism that could ever ask about it.
   *
   * With the verdict keyed by the CLAIM, both outcomes are the same shape and
   * this is the whole predicate: an inferred claim on an active entity, in
   * this locale, with NO VERDICT AT THE CURRENT RULE VERSION. Every held claim
   * and every lost claim is in the population; a bump re-opens both.
   *
   * The hearing KIND follows the row's actual state rather than the caller's
   * intent, because the row is what makes the question real: a live recall row
   * can only be asked "should this still hold?" (retain), and a deprecated or
   * display row can only be asked "may this be taken?" (grant). Asking either
   * one the other question is paying for an answer that cannot act.
   *
   * Only INFERRED sources are offered. Testimony is not a claim anyone judged,
   * it is a real person's word, and it is unevictable by law elsewhere in this
   * machinery — feeding it would ask a question nothing may act on.
   *
   * COLLISION-SHAPED CLAIMS COME FIRST. A surface whose folded form IS another
   * active entity's identity key, of the same type, is the highest-yield
   * mis-bank shape (the retraction feed's probe): the collision guard runs at
   * WRITE time, so anything banked before the guard existed, or before the
   * twin existed, is sitting there uncontested. A drain is always budget-
   * bounded, so the order in which claims are offered decides what actually
   * gets heard.
   */
  async dueClaims(
    locale: string | readonly string[],
    options: {
      limit?: number;
      forms?: readonly string[];
      /** Only claims whose word IS another concept's name — the probe. */
      collisionsOnly?: boolean;
    } = {},
  ): Promise<ContestedClaim[]> {
    const limit = options.limit ?? 200;
    const due: ContestedClaim[] = [];
    for await (const page of this.candidatePages(locale, options)) {
      const decided = await this.ledger.decidedKeys(
        WORD_CLAIM_LANE,
        CLAIM_JUDGE_PROMPT_VERSION,
        wordClaimLane.keyFoldVersion,
        page.map((claim) => wordClaimLane.canonicalClaimKey(claim)),
      );
      for (const claim of page) {
        if (decided.has(wordClaimLane.canonicalClaimKey(claim))) continue;
        due.push(claim);
        if (due.length >= limit) return due;
      }
    }
    return due;
  }

  /**
   * HOW MANY CLAIMS A DRAIN WOULD HEAR — the count amendment (b) prices.
   *
   * It scans the whole population rather than sampling, because the number is
   * the input to a spend approval: an estimate built on a guess is exactly the
   * thing the campaign idiom exists to refuse.
   */
  async countDue(
    locale: string | readonly string[],
    options: { forms?: readonly string[]; collisionsOnly?: boolean } = {},
  ): Promise<number> {
    let total = 0;
    for await (const page of this.candidatePages(locale, options)) {
      const decided = await this.ledger.decidedKeys(
        WORD_CLAIM_LANE,
        CLAIM_JUDGE_PROMPT_VERSION,
        wordClaimLane.keyFoldVersion,
        page.map((claim) => wordClaimLane.canonicalClaimKey(claim)),
      );
      for (const claim of page) {
        if (!decided.has(wordClaimLane.canonicalClaimKey(claim))) total += 1;
      }
    }
    return total;
  }

  /** The candidate population, paged. Ordering and filters live here so the
   *  due-predicate and its count can never read different populations. */
  private async *candidatePages(
    locale: string | readonly string[],
    options: { forms?: readonly string[]; collisionsOnly?: boolean },
  ): AsyncGenerator<ContestedClaim[]> {
    const forms = (options.forms ?? []).map((f) => canonicalFold(f));
    // A DOCKET MAY BE MORE THAN ONE LOCALE, BUT A CLAIM IS STILL EXACTLY ONE.
    // The scan widens to a SET so a drain can open every bankable docket in
    // one pass (`CLAIMABLE_LOCALES`) instead of enumerating the serve list and
    // silently skipping `und`. What does NOT widen is the claim: every row is
    // mapped with `locale: row.locale` below, so the key stays
    // `<row locale>|<word>|<entity>` and a verdict in one language can never
    // answer for another — the same exactness `canonicalClaimKey` spells.
    const locales = typeof locale === 'string' ? [locale] : [...locale];
    const collisionsOnly = options.collisionsOnly === true;
    for (let offset = 0; ; offset += DUE_SCAN_PAGE) {
      const rows = await this.prisma.$queryRaw<
        Array<{
          form: string;
          locale: string;
          entity_id: string;
          source: string;
          hearing: string;
          collision: boolean;
        }>
      >`
        SELECT s.form, s.locale, s.entity_id::text, s.source,
               CASE WHEN s.status = 'active' AND s.role <> 'display'
                    THEN 'retain' ELSE 'grant' END AS hearing,
               EXISTS (SELECT 1 FROM core_entities twin
                        WHERE twin.identity_key = s.form_folded
                          AND twin.type = e.type
                          AND twin.status = 'active'
                          AND twin.entity_id <> s.entity_id) AS collision
          FROM entity_surface s
          JOIN core_entities e ON e.entity_id = s.entity_id
         WHERE e.status = 'active'
           AND s.locale = ANY(${locales}::text[])
           AND s.source IN ('vocabulary', 'sweep', 'knowledge_synthesis',
                            'seed', 'query_banking', 'synthesis')
           AND s.status IN ('active', 'deprecated')
           AND (${forms.length === 0} OR s.form_folded = ANY(${forms}::text[]))
           AND (${!collisionsOnly} OR EXISTS (
                 SELECT 1 FROM core_entities twin
                  WHERE twin.identity_key = s.form_folded
                    AND twin.type = e.type
                    AND twin.status = 'active'
                    AND twin.entity_id <> s.entity_id))
         ORDER BY s.surface_id
         LIMIT ${DUE_SCAN_PAGE} OFFSET ${offset}`;
      if (!rows.length) return;
      const page = rows
        // Collision-shaped first WITHIN the page: the scan order itself must
        // stay stable (surface_id) so paging cannot skip or repeat a row.
        .sort((a, b) => Number(b.collision) - Number(a.collision))
        .map((row) => ({
          form: row.form,
          locale: row.locale,
          entityId: row.entity_id,
          source: row.source as SurfaceSource,
          hearing: row.hearing as 'grant' | 'retain',
        }));
      yield page;
      if (rows.length < DUE_SCAN_PAGE) return;
    }
  }

  /** Bank a won claim. The guard re-checks; with the incumbent deprecated it
   *  passes, so there is NO bypass flag — eviction IS the admission.
   *
   *  Returns whether a row was actually written, so callers tally what
   *  HAPPENED rather than what an outcome counter implies. */
  private async bank(claim: WordClaimIdentityFields): Promise<boolean> {
    await this.prisma.$transaction((tx) =>
      addSurfaces(
        tx,
        claim.entityId,
        [
          {
            form: claim.form,
            locale: claim.locale,
            source: claim.source,
            claimJudgeVersion: CLAIM_JUDGE_PROMPT_VERSION,
          },
        ],
        // The verdict IS the ownership ruling — a 'both win' is a sanctioned
        // collision, so the guard defers to it (it blocked every coexistence
        // verdict otherwise; 862-claim forever-loop, 2026-08-08).
        { adjudicated: mintWordClaimVerdict() },
      ),
    );
    return true;
  }

  /** A losing newcomer is REMEMBERED as wrong (status 'deprecated'), so no
   *  future sweep re-proposes it — R5-6b applied to claims. */
  private async refuse(claim: WordClaimIdentityFields): Promise<void> {
    await this.prisma.$transaction((tx) =>
      addSurfaces(tx, claim.entityId, [
        {
          form: claim.form,
          locale: claim.locale,
          source: claim.source,
          status: 'deprecated',
          claimJudgeVersion: CLAIM_JUDGE_PROMPT_VERSION,
        },
      ]),
    );
  }

  /**
   * EVICTION TAKES THE WORD, NOT THE LABEL.
   *
   * A losing incumbent loses its RECALL claim. If that row is also the label
   * a user reads (role='both' — 13,734 of them are somebody's rendered
   * `is_default` name), deprecating it would silently revert that user's
   * localized label to English because every display read requires
   * status='active'. So eviction DEGRADES a 'both' row to 'display': the
   * label survives, the recall claim is dead (every recall arm reads
   * `role <> 'display'`), and the row itself is the memory that it lost —
   * exactly the encoding `addSurfaces` uses when the guard refuses a claim at
   * write time. A pure 'recall' row has no display life to keep, so it is
   * deprecated as before.
   *
   * THE DEGRADED ROW CANNOT RE-LITIGATE. It contests nothing (the collision
   * probe and `incumbentsOf` both skip role='display'), it cannot widen back
   * to 'both' on any unadjudicated write (insertSurfaceRows pins it), and it
   * still satisfies the sweep's "this concept is labelled" watermark, so no
   * nightly pass re-offers it. Only a fresh hearing can give the word back.
   */
  /**
   * ...and RETRACTION IS EVICTION WITHOUT A RIVAL (2026-08-12), which is why
   * both arrive here as one list of surface ids. A mis-banked surface is a
   * wrong word→concept claim, and taking a word from a concept is one move
   * whether a rival won it or nobody wanted it: the word stops grounding, the
   * label survives if the row was one, and the verdict in the ledger records
   * which rule took it.
   */
  private async takeTheWord(targets: SurfaceTargetState[]): Promise<void> {
    if (!targets.length) return;
    for (const target of targets) {
      // ABSOLUTE, and a NO-OP when the row already says what the verdict
      // ordered. The `IS DISTINCT FROM` guard is what makes a replay
      // byte-identical rather than merely equivalent: without it every replay
      // would still move `updated_at`, and "did this run twice?" would stop
      // being answerable from the row.
      await this.prisma.$executeRaw`
        UPDATE entity_surface
           SET role   = ${target.role},
               status = ${target.status},
               -- The loser's row records WHICH rule took its word, so a later
               -- bump re-opens this eviction the same way it re-opens a
               -- refusal.
               claim_judge_version = ${CLAIM_JUDGE_PROMPT_VERSION},
               updated_at = now()
         WHERE surface_id = ${target.surfaceId}::uuid
           AND (role, status, claim_judge_version)
               IS DISTINCT FROM
               (${target.role}, ${target.status},
                ${CLAIM_JUDGE_PROMPT_VERSION}::int)`;
    }
  }

  /**
   * WHAT TAKING THE WORD FROM THESE ROWS MEANS, DECIDED NOW.
   *
   * The transition is read once, at decision time, and frozen into the
   * verdict's subject: a role='both' row keeps its status and becomes
   * 'display' (the label lives, the word dies), anything else is deprecated.
   * Encoding the RESULT rather than the rule is the whole of the idempotence
   * fix — see `WordClaimEffect.takeWord`.
   *
   * A row that has vanished between selection and decision contributes
   * nothing: there is no state to order it into, and inventing one would be
   * this method deciding something the judge did not.
   */
  private async takeWordTargets(
    surfaceIds: readonly string[],
  ): Promise<SurfaceTargetState[]> {
    if (!surfaceIds.length) return [];
    const rows = await this.prisma.$queryRaw<
      Array<{ surface_id: string; role: string; status: string }>
    >`SELECT surface_id::text, role::text, status::text
        FROM entity_surface
       WHERE surface_id = ANY(${[...surfaceIds]}::uuid[])`;
    return rows.map((row) => ({
      surfaceId: row.surface_id,
      role: row.role === 'both' ? 'display' : row.role,
      status: row.role === 'both' ? row.status : 'deprecated',
    }));
  }
}
