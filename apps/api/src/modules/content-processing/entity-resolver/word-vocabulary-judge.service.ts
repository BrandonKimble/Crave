import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import {
  ClaimVerdictLedgerService,
  type HearingSource,
} from './claim-verdict-ledger.service';
import { ClaimRehearingBudgetService } from './claim-rehearing-budget.service';
import {
  CARRIES_CONCEPT,
  DOES_NOT_NEGATE,
  GRAMMATICAL_WORK,
  NEGATES,
  WORD_GENERICNESS_LANE,
  WORD_GENERICNESS_PROMPT,
  WORD_GENERICNESS_RULE_FINGERPRINT,
  WORD_GENERICNESS_RULE_VERSION,
  WORD_NEGATION_LANE,
  WORD_NEGATION_PROMPT,
  WORD_NEGATION_RULE_FINGERPRINT,
  WORD_NEGATION_RULE_VERSION,
  normalizeClaimLocale,
  wordGenericnessLane,
  wordNegationLane,
  type WordVocabularyClaim,
} from './word-vocabulary-lanes';

/** Words packed into one LLM call. Must equal the lane's `claimsPerCall` in
 *  HEARING_METERS, or the rolling allowance counts the wrong number of
 *  hearings per billed row — the spec below pins them together. */
export const VOCABULARY_CLAIMS_PER_CALL = 40;

/** Judge calls in flight at once during a drain. */
export const VOCABULARY_HEARING_CONCURRENCY = 8;

interface LaneWiring {
  lane: string;
  adapter: typeof wordGenericnessLane | typeof wordNegationLane;
  prompt: string;
  ruleVersion: number;
  ruleFingerprint: string;
  caller: string;
  /** The boolean field the judge answers with, and what each answer means. */
  answerField: 'carries_concept' | 'negates';
  outcomeTrue: string;
  outcomeFalse: string;
}

export const VOCABULARY_LANES: Readonly<Record<string, LaneWiring>> = {
  [WORD_GENERICNESS_LANE]: {
    lane: WORD_GENERICNESS_LANE,
    adapter: wordGenericnessLane,
    prompt: WORD_GENERICNESS_PROMPT,
    ruleVersion: WORD_GENERICNESS_RULE_VERSION,
    ruleFingerprint: WORD_GENERICNESS_RULE_FINGERPRINT,
    caller: 'vocabulary.genericness_judge',
    answerField: 'carries_concept',
    outcomeTrue: CARRIES_CONCEPT,
    outcomeFalse: GRAMMATICAL_WORK,
  },
  [WORD_NEGATION_LANE]: {
    lane: WORD_NEGATION_LANE,
    adapter: wordNegationLane,
    prompt: WORD_NEGATION_PROMPT,
    ruleVersion: WORD_NEGATION_RULE_VERSION,
    ruleFingerprint: WORD_NEGATION_RULE_FINGERPRINT,
    caller: 'vocabulary.negation_judge',
    answerField: 'negates',
    outcomeTrue: NEGATES,
    outcomeFalse: DOES_NOT_NEGATE,
  },
};

/** The options every drain takes, whether it asks one facet or all of them. */
export interface CertifyOptions {
  dryRun?: boolean;
  approvedHash?: string | null;
  /** WHO IS BUYING (A3, 2026-08-15). Default 'steady' — the unattended rail,
   *  whose spend the rolling allowance meters. An operator drain says
   *  'certification' and is exempt from that window, because it is bounded by
   *  the approve-by-hash law instead. */
  source?: HearingSource;
}

/** batch index (1-based) → lane → the ruling for that facet. A lane missing
 *  from the inner map is a facet that gave no ground and stays due. */
type FacetAnswers = Map<
  number,
  Map<string, { outcome: string; reason: string }>
>;

export interface VocabularyCertificationSummary {
  lane: string;
  /** Distinct (word, locale) pairs presented. */
  considered: number;
  /** Already answered at the rule and fold in force — free. */
  alreadyDecided: number;
  /** Heard and written this run. */
  judged: number;
  /** Presented, due, authorized — and the judge returned nothing usable. */
  unjudged: number;
  /** Batches whose LLM call failed outright. Their words stay due. */
  failedBatches: number;
  outcomes: Record<string, number>;
}

/**
 * THE VOCABULARY JUDGE — one hearing per word per language, for the two
 * classes the query path used to carry as hand lists.
 *
 * The shape is the word-claim adjudicator's, deliberately: due-predicate then
 * budget then batch then VERDICT-BEFORE-EFFECT. What differs is the effect.
 * A word-ownership ruling mutates the corpus — it banks or takes a surface —
 * so its verdict row carries a replayable subject and `executed_at` marks the
 * mutation done. These lanes mutate NOTHING. The verdict IS the artefact every
 * consumer reads, so "the effect" is exactly one thing: the in-memory read
 * cache in front of `claim_verdicts` learning the new answer. That is still
 * ordered verdict-first and still marked executed, because a cache that never
 * heard about a verdict is a consumer still behaving as though the word were
 * unjudged — a real, if cheap, unfinished effect.
 */
@Injectable()
export class WordVocabularyJudgeService {
  private readonly logger: LoggerService;

  /** Set by the read cache at construction; the judge tells it what it just
   *  learned so a freshly-heard word is live without a round trip. */
  private onVerdict: ((lane: string, key: string, outcome: string) => void)[] =
    [];

  constructor(
    private readonly llm: LLMService,
    loggerService: LoggerService,
    private readonly ledger: ClaimVerdictLedgerService,
    private readonly budget: ClaimRehearingBudgetService,
  ) {
    this.logger = loggerService.setContext('WordVocabularyJudgeService');
  }

  /** Register a listener — the read cache's invalidation hook. */
  subscribe(listener: (lane: string, key: string, outcome: string) => void) {
    this.onVerdict.push(listener);
  }

  /** Which of these words already have a verdict in force. Free; no LLM. */
  async decidedOutcomes(
    lane: string,
    claims: readonly WordVocabularyClaim[],
  ): Promise<Map<string, string>> {
    const wiring = laneWiring(lane);
    const keys = [
      ...new Set(claims.map((c) => wiring.adapter.canonicalClaimKey(c))),
    ];
    const decided = await this.ledger.decidedVerdicts(
      wiring.lane,
      wiring.ruleVersion,
      wiring.adapter.keyFoldVersion,
      keys,
    );
    return new Map([...decided].map(([key, v]) => [key, v.outcome]));
  }

  /**
   * HEAR EVERY WORD HERE THAT HAS NOT BEEN HEARD.
   *
   * The two gates the word lane learned to put here rather than in callers
   * (2026-08-13) apply unchanged: already-decided is not due, and the drain is
   * a spend event bounded by the rolling allowance or an approved estimate.
   */
  async certify(
    lane: string,
    claims: readonly WordVocabularyClaim[],
    options: CertifyOptions = {},
  ): Promise<VocabularyCertificationSummary> {
    const summaries = await this.certifyFacets([lane], claims, options);
    return summaries.get(lane) as VocabularyCertificationSummary;
  }

  /**
   * ONE HEARING, EVERY FACET THAT IS DUE (B-call, 2026-08-15).
   *
   * A word is a word. Asking "does it carry a concept?" and "does it negate?"
   * as two separate LLM calls about the SAME forty strings buys two calls'
   * worth of tokens, two round trips and two failure modes for one lookup of
   * one thing — and every caller looped the lanes, so that is what happened
   * every time. The facets stay INDEPENDENT where independence matters (their
   * own rule text, their own version, their own verdict row, their own
   * key space — `chưa` is glue AND a negator, and folding the answers is the
   * error that made a negation list get read as a genericness list); what
   * they share is the QUESTION'S SUBJECT, and that is what a batch is.
   *
   * The saving is not marginal at the scale this runs: the certified
   * vocabulary is ~32,000 words, two facets, forty per call — 1,620 calls
   * become 810, and every facet added after this one is close to free, which
   * is what makes a third facet a design option rather than a doubling.
   *
   * WHAT IS SENT: the words once, and the rule text of each DUE facet, each
   * under its own heading, each answered in its own field with its own stated
   * ground. A facet nobody is due for is not sent, so a drain that only needs
   * negation costs exactly a negation call.
   */
  async certifyFacets(
    lanes: readonly string[],
    claims: readonly WordVocabularyClaim[],
    options: CertifyOptions = {},
  ): Promise<Map<string, VocabularyCertificationSummary>> {
    const wirings = lanes.map((lane) => laneWiring(lane));
    const summaries = new Map<string, VocabularyCertificationSummary>(
      wirings.map((w) => [
        w.lane,
        {
          lane: w.lane,
          considered: 0,
          alreadyDecided: 0,
          judged: 0,
          unjudged: 0,
          failedBatches: 0,
          outcomes: {},
        },
      ]),
    );

    // ONE NORMALIZED CLAIM LIST, shared by every facet. The claim KEY differs
    // per lane (negation's carries no locale), so identity is per-lane below;
    // the SUBJECT is common, which is exactly the thing being batched.
    const normalized: WordVocabularyClaim[] = [];
    const seenSubjects = new Set<string>();
    for (const raw of claims) {
      const claim: WordVocabularyClaim = {
        word: raw.word,
        locale: normalizeClaimLocale(raw.locale),
      };
      if (!claim.word.trim()) continue;
      const subjectKey = `${claim.locale}|${claim.word}`;
      if (seenSubjects.has(subjectKey)) continue;
      seenSubjects.add(subjectKey);
      normalized.push(claim);
    }
    if (!normalized.length) return summaries;

    /** lane → the claims it still owes a hearing, in its own key space. */
    const dueByLane = new Map<string, Map<string, WordVocabularyClaim>>();
    for (const wiring of wirings) {
      const summary = summaries.get(wiring.lane)!;
      const byKey = new Map<string, WordVocabularyClaim>();
      for (const claim of normalized) {
        byKey.set(wiring.adapter.canonicalClaimKey(claim), claim);
      }
      summary.considered = byKey.size;
      const decided = await this.ledger.decidedKeys(
        wiring.lane,
        wiring.ruleVersion,
        wiring.adapter.keyFoldVersion,
        [...byKey.keys()],
      );
      summary.alreadyDecided = decided.size;
      const due = new Map(
        [...byKey.entries()].filter(([key]) => !decided.has(key)),
      );
      if (!due.size) continue;
      const authorized = await this.budget.authorizeDrain({
        lane: wiring.lane,
        ruleVersion: wiring.ruleVersion,
        dueCount: due.size,
        approvedHash: options.approvedHash ?? null,
      });
      // EACH FACET IS BOUNDED BY ITS OWN ALLOWANCE. Sharing a call does not
      // share a budget: a lane whose window is spent contributes no questions
      // to the batch, and the other lane's drain proceeds without it.
      dueByLane.set(
        wiring.lane,
        new Map([...due.entries()].slice(0, authorized.allowed)),
      );
    }
    if (options.dryRun) return summaries;
    if (!dueByLane.size) return summaries;

    // THE BATCH IS OVER SUBJECTS: every word due on ANY facet, asked once.
    const work = normalized.filter((claim) =>
      wirings.some((w) =>
        dueByLane.get(w.lane)?.has(w.adapter.canonicalClaimKey(claim)),
      ),
    );

    // BATCHES RUN IN PARALLEL, BOUNDED. Certifying the whole banked
    // vocabulary is ~810 calls; serially that is hours, and an operator who
    // has to babysit a run for hours runs it once and never again. The bound
    // is what keeps it a drain rather than a thundering herd — the gateway's
    // own rate limiter is the backstop, not the plan.
    const batches: WordVocabularyClaim[][] = [];
    for (let i = 0; i < work.length; i += VOCABULARY_CLAIMS_PER_CALL) {
      batches.push(work.slice(i, i + VOCABULARY_CLAIMS_PER_CALL));
    }
    let next = 0;
    const runOne = async (): Promise<void> => {
      for (;;) {
        const index = next++;
        if (index >= batches.length) return;
        const batch = batches[index];
        // A BATCH THAT FAILS LEAVES ITS WORDS DUE — it does not kill the run.
        // Measured the hard way on the first full certification: one Gemini
        // 504 out of 809 calls rejected the enclosing Promise.all and ended a
        // 32,299-verdict drain 41 words short of finishing. Every verdict
        // already written is durable (that is what verdict-before-effect
        // buys), so the only thing an abort destroys is the OPERATOR'S
        // afternoon. An unanswered word is simply a word still due, which the
        // next run picks up for the price of the words it actually missed.
        let answers: FacetAnswers;
        try {
          answers = await this.hearFacets(wirings, batch);
        } catch (error) {
          for (const wiring of wirings) {
            const summary = summaries.get(wiring.lane)!;
            summary.unjudged += batch.length;
            summary.failedBatches += 1;
          }
          this.logger.warn('Vocabulary hearing batch failed; words stay due', {
            lanes: wirings.map((w) => w.lane),
            words: batch.length,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          continue;
        }
        for (let n = 0; n < batch.length; n++) {
          const claim = batch[n];
          const perFacet = answers.get(n + 1);
          for (const wiring of wirings) {
            const key = wiring.adapter.canonicalClaimKey(claim);
            // Only a facet this word was actually DUE for is recorded — the
            // batch carries words another facet needed, and re-deciding an
            // answered claim would rewrite a verdict nobody re-opened.
            if (!dueByLane.get(wiring.lane)?.has(key)) continue;
            const summary = summaries.get(wiring.lane)!;
            const answer = perFacet?.get(wiring.lane);
            if (!answer) {
              // A ruling with no stated ground is not a ruling: the word stays
              // unjudged and due, which is what an unanswered question
              // deserves.
              summary.unjudged += 1;
              continue;
            }
            await this.ledger.record<WordVocabularyClaim>({
              lane: wiring.lane,
              claimKey: key,
              ruleVersion: wiring.ruleVersion,
              foldVersion: wiring.adapter.keyFoldVersion,
              outcome: answer.outcome,
              reason: answer.reason,
              ruleFingerprint: wiring.ruleFingerprint,
              subject: claim,
              source: options.source ?? 'steady',
            });
            for (const listener of this.onVerdict) {
              listener(wiring.lane, key, answer.outcome);
            }
            await this.ledger.markExecuted(
              wiring.lane,
              key,
              wiring.ruleVersion,
              wiring.adapter.keyFoldVersion,
            );
            summary.judged += 1;
            summary.outcomes[answer.outcome] =
              (summary.outcomes[answer.outcome] ?? 0) + 1;
          }
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(VOCABULARY_HEARING_CONCURRENCY, batches.length) },
        runOne,
      ),
    );

    for (const summary of summaries.values()) {
      this.logger.info('Certified vocabulary claims', { ...summary });
    }
    return summaries;
  }

  /**
   * FINISH WHAT WAS ALREADY DECIDED. A crash between `record` and
   * `markExecuted` leaves a verdict whose cache never heard it; on the next
   * boot the cache loads from the table anyway, so replaying is a no-op — but
   * the row is stamped so the resume queue does not grow forever.
   */
  async resumePendingEffects(lane: string, limit = 5000): Promise<number> {
    const wiring = laneWiring(lane);
    const pending = await this.ledger.pendingExecution<WordVocabularyClaim>(
      wiring.lane,
      limit,
    );
    for (const verdict of pending) {
      for (const listener of this.onVerdict) {
        listener(wiring.lane, verdict.claimKey, verdict.outcome);
      }
      await this.ledger.markExecuted(
        wiring.lane,
        verdict.claimKey,
        verdict.ruleVersion,
        verdict.foldVersion,
      );
    }
    return pending.length;
  }

  /**
   * ONE LLM CALL, EVERY DUE FACET. Overridable so a test can answer without
   * paying.
   *
   * THE SYSTEM INSTRUCTION IS THE FACETS' OWN RULE TEXTS, each under its own
   * heading and each answered in its own field. Concatenation is what lets a
   * verdict keep naming the rule that decided it: the section a facet's answer
   * came from is byte-identical to the .md its fingerprint is taken from, so
   * `rule_fingerprint` remains a true statement about the text the judge read
   * for that question. What the batch shares is the word list; what it never
   * shares is an answer.
   */
  protected async hearFacets(
    wirings: readonly LaneWiring[],
    claims: readonly WordVocabularyClaim[],
  ): Promise<FacetAnswers> {
    const systemInstruction = wirings
      .map(
        (wiring) =>
          `# FACET: ${wiring.lane} — answer in "${wiring.answerField}" with its ` +
          `ground in "${wiring.answerField}_reason"\n\n${wiring.prompt}`,
      )
      .join(
        '\n\n---\n\nThe facets above are INDEPENDENT questions about the same ' +
          "words. Answer each on its own rule; one facet's answer is never " +
          "evidence for another's.\n\n---\n\n",
      );

    const prompt = claims
      .map(
        (claim, index) =>
          `${index + 1}. word "${claim.word}" (language ${claim.locale})`,
      )
      .join('\n');

    const properties: Record<string, unknown> = { n: { type: 'number' } };
    const required: string[] = ['n'];
    for (const wiring of wirings) {
      properties[wiring.answerField] = { type: 'boolean' };
      properties[`${wiring.answerField}_reason`] = {
        type: 'string',
        description:
          "The stated ground for THIS facet's ruling — a ruling with no " +
          'stated ground is not a ruling; a blank reason leaves the word ' +
          'unjudged on this facet only',
      };
      required.push(wiring.answerField, `${wiring.answerField}_reason`);
    }

    const text = await this.llm.generateForCaller({
      // The call bills to the FIRST due facet's caller. Every facet's meter
      // names its own caller, and a shared call has one; attributing it to
      // the facet that led the batch keeps the rate measurable rather than
      // splitting one row across two meters it cannot be divided between.
      caller: wirings[0].caller,
      systemInstruction,
      prompt,
      generationConfig: {
        // ZERO, for the same measured reason every other verdict lane uses
        // zero: this is a persisted ruling about a fixed word, and a re-ask
        // must return the same answer.
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'object', properties, required },
            },
          },
          required: ['items'],
        },
      },
    });

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return new Map();
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      items?: Array<Record<string, unknown>>;
    };
    const out: FacetAnswers = new Map();
    for (const item of parsed.items ?? []) {
      const n = item.n;
      if (typeof n !== 'number') continue;
      const perFacet = new Map<string, { outcome: string; reason: string }>();
      for (const wiring of wirings) {
        const raw = item[`${wiring.answerField}_reason`];
        const reason = typeof raw === 'string' ? raw.trim() : '';
        // A FACET IS UNJUDGED ON ITS OWN. A blank ground for negation leaves
        // the word due on negation and answered on genericness — batching
        // must not make one facet's silence cost the other its verdict.
        if (!reason) continue;
        perFacet.set(wiring.lane, {
          outcome:
            item[wiring.answerField] === true
              ? wiring.outcomeTrue
              : wiring.outcomeFalse,
          reason,
        });
      }
      out.set(n, perFacet);
    }
    return out;
  }
}

export function laneWiring(lane: string): LaneWiring {
  const wiring = VOCABULARY_LANES[lane];
  if (!wiring) {
    throw new Error(
      `'${lane}' is not a judged-vocabulary lane. The two lanes are ` +
        `'${WORD_GENERICNESS_LANE}' and '${WORD_NEGATION_LANE}'.`,
    );
  }
  return wiring;
}
