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
    options: {
      dryRun?: boolean;
      approvedHash?: string | null;
      /** WHO IS BUYING (A3, 2026-08-15). Default 'steady' — the unattended
       *  rail, whose spend the rolling allowance meters. An operator drain
       *  says 'certification' and is exempt from that window, because it is
       *  bounded by the approve-by-hash law instead. */
      source?: HearingSource;
    } = {},
  ): Promise<VocabularyCertificationSummary> {
    const wiring = laneWiring(lane);
    const summary: VocabularyCertificationSummary = {
      lane: wiring.lane,
      considered: 0,
      alreadyDecided: 0,
      judged: 0,
      unjudged: 0,
      failedBatches: 0,
      outcomes: {},
    };

    // One hearing per (word, locale), whatever the caller handed us.
    const byKey = new Map<string, WordVocabularyClaim>();
    for (const raw of claims) {
      const claim: WordVocabularyClaim = {
        word: raw.word,
        locale: normalizeClaimLocale(raw.locale),
      };
      if (!claim.word.trim()) continue;
      byKey.set(wiring.adapter.canonicalClaimKey(claim), claim);
    }
    summary.considered = byKey.size;
    if (!byKey.size) return summary;

    const decided = await this.ledger.decidedKeys(
      wiring.lane,
      wiring.ruleVersion,
      wiring.adapter.keyFoldVersion,
      [...byKey.keys()],
    );
    summary.alreadyDecided = decided.size;

    const due = [...byKey.entries()].filter(([key]) => !decided.has(key));
    if (!due.length) return summary;

    const authorized = await this.budget.authorizeDrain({
      lane: wiring.lane,
      ruleVersion: wiring.ruleVersion,
      dueCount: due.length,
      approvedHash: options.approvedHash ?? null,
    });
    const work = due.slice(0, authorized.allowed);
    if (options.dryRun) return summary;

    // BATCHES RUN IN PARALLEL, BOUNDED. Certifying the whole banked
    // vocabulary is ~1,600 calls; serially that is hours, and an operator who
    // has to babysit a run for hours runs it once and never again. The bound
    // is what keeps it a drain rather than a thundering herd — the gateway's
    // own rate limiter is the backstop, not the plan.
    const batches: Array<Array<[string, WordVocabularyClaim]>> = [];
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
        let answers: Map<number, { value: boolean; reason: string }>;
        try {
          answers = await this.hear(
            wiring,
            batch.map(([, c]) => c),
          );
        } catch (error) {
          summary.unjudged += batch.length;
          summary.failedBatches += 1;
          this.logger.warn('Vocabulary hearing batch failed; words stay due', {
            lane: wiring.lane,
            words: batch.length,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          continue;
        }
        for (let n = 0; n < batch.length; n++) {
          const answer = answers.get(n + 1);
          if (!answer) {
            // A ruling with no stated ground is not a ruling: the word stays
            // unjudged and due, which is what an unanswered question deserves.
            summary.unjudged += 1;
            continue;
          }
          const [key, claim] = batch[n];
          const outcome = answer.value
            ? wiring.outcomeTrue
            : wiring.outcomeFalse;
          await this.ledger.record<WordVocabularyClaim>({
            lane: wiring.lane,
            claimKey: key,
            ruleVersion: wiring.ruleVersion,
            foldVersion: wiring.adapter.keyFoldVersion,
            outcome,
            reason: answer.reason,
            ruleFingerprint: wiring.ruleFingerprint,
            subject: claim,
            source: options.source ?? 'steady',
          });
          for (const listener of this.onVerdict) {
            listener(wiring.lane, key, outcome);
          }
          await this.ledger.markExecuted(
            wiring.lane,
            key,
            wiring.ruleVersion,
            wiring.adapter.keyFoldVersion,
          );
          summary.judged += 1;
          summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(VOCABULARY_HEARING_CONCURRENCY, batches.length) },
        runOne,
      ),
    );

    this.logger.info('Certified vocabulary claims', { ...summary });
    return summary;
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

  /** ONE LLM CALL. Overridable so a test can answer without paying. */
  protected async hear(
    wiring: LaneWiring,
    claims: readonly WordVocabularyClaim[],
  ): Promise<Map<number, { value: boolean; reason: string }>> {
    const prompt = claims
      .map(
        (claim, index) =>
          `${index + 1}. word "${claim.word}" (language ${claim.locale})`,
      )
      .join('\n');

    const text = await this.llm.generateForCaller({
      caller: wiring.caller,
      systemInstruction: wiring.prompt,
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
              items: {
                type: 'object',
                properties: {
                  n: { type: 'number' },
                  [wiring.answerField]: { type: 'boolean' },
                  reason: {
                    type: 'string',
                    description:
                      'The stated ground for the ruling — a ruling with no stated ground is not a ruling; a blank reason leaves the word unjudged',
                  },
                },
                required: ['n', wiring.answerField, 'reason'],
              },
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
    const out = new Map<number, { value: boolean; reason: string }>();
    for (const item of parsed.items ?? []) {
      const n = item.n;
      const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
      if (typeof n !== 'number' || !reason) continue;
      out.set(n, { value: item[wiring.answerField] === true, reason });
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
