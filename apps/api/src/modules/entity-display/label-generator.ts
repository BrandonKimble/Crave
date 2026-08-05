/**
 * M2 — THE LABEL GENERATOR SEAM (+ R5-10's judge shape).
 *
 * The sweep FINDS unlabeled concepts; a generator PRODUCES labels. They are
 * separate because the finding is stable forever and the producing is not:
 * today the only real generator is the spine seeder's batched Gemini call
 * (scripts/seed-spine-labels.ts); tomorrow the tail sweep gets its own.
 *
 * R5-10: judgement is MQM-SHAPED, not boolean. A 0-100 score with error spans
 * lets a near-miss be reviewed instead of silently dropped, and MULTI-SAMPLE
 * CONSENSUS is required for short context-free strings (single-word terms are
 * exactly where single-judgment noise is worst — this is measured practice,
 * not caution). Consensus disagreement lands `status='candidate'`; that is
 * what the entity_labels status column is for.
 */

/** One concept handed to a generator. */
export interface LabelGenerationRequest {
  entityId: string;
  /** The canonical English name — the source text. */
  name: string;
  /** 'restaurant_attribute' | 'food' | 'ingredient' | ... */
  entityType: string;
  /** Target BCP 47 locale. */
  locale: string;
  /** Optional disambiguating context (the concept's facet, siblings). */
  hint?: string | null;
}

/** MQM-shaped error span (R5-10). */
export interface LabelErrorSpan {
  /** accuracy | fluency | terminology | style | locale_convention */
  category: string;
  /** minor | major | critical */
  severity: string;
  text: string;
  note?: string;
}

export interface LabelJudgement {
  /** 0-100. */
  score: number;
  errorSpans: LabelErrorSpan[];
  /** score >= AUTO_APPROVE_SCORE and no critical span. */
  autoApprove: boolean;
}

export interface GeneratedLabel {
  entityId: string;
  locale: string;
  form: string;
  /** R5-6(a): the Wikidata-learned per-locale disambiguator. */
  description: string | null;
  judgement: LabelJudgement;
  /** 'active' when consensus agreed AND autoApprove; 'candidate' otherwise. */
  status: 'active' | 'candidate';
  /** How many of the N samples produced this exact form. */
  consensusVotes: number;
  consensusSamples: number;
  /**
   * SEARCH SURFACES for this concept in this locale — every way a native
   * speaker would TYPE it (gender/number variants, regional variants). The
   * label is what a user READS; these are what they can MATCH, and they are
   * the half that moved the launch gate 77.3% -> 96.7%.
   *
   * They ride together because they are ONE judgment about one concept in one
   * language; paying for that twice would be waste. They are STORED apart
   * (`entity_labels` vs `entity_alias`) because display and matching have
   * different laws. Optional, so label-only generators stay valid.
   */
  aliases?: string[];
}

/**
 * R5-10's threshold. An owner knob, stated once: at or above this MQM score a
 * label publishes without review; below it, it queues. 80 is the plan's
 * ratified number.
 */
export const AUTO_APPROVE_SCORE = 80;

/** The number of independent samples a consensus generator must draw. */
export const CONSENSUS_SAMPLES = 3;

export interface LabelGenerator {
  readonly name: string;
  generate(
    requests: readonly LabelGenerationRequest[],
  ): Promise<GeneratedLabel[]>;
}

/**
 * THE STUB. It produces NOTHING — deliberately. A stub that echoed the
 * English name would write 8,272 fake Spanish rows that look real, satisfy
 * every NOT EXISTS check, and permanently hide the concepts that actually
 * need labels. Returning zero rows keeps the watermark honest: an unlabeled
 * concept stays unlabeled until something real labels it.
 *
 * (The no-fake-estimates law, applied to text.)
 */
export class NoopLabelGenerator implements LabelGenerator {
  readonly name = 'noop';

  generate(
    requests: readonly LabelGenerationRequest[],
  ): Promise<GeneratedLabel[]> {
    void requests;
    return Promise.resolve([]);
  }
}

/**
 * Fold N independent samples of the same (entity, locale) into one verdict.
 * Shared by every consensus generator, including the spine seeder's script —
 * the consensus rule is a property of the DESIGN, not of one call site.
 */
export function consensusOf(
  samples: ReadonlyArray<{
    form: string;
    description: string | null;
  }>,
): {
  form: string;
  description: string | null;
  votes: number;
  samples: number;
  agreed: boolean;
} {
  const tally = new Map<string, number>();
  for (const sample of samples) {
    const key = sample.form.trim().toLocaleLowerCase();
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let winnerKey = '';
  let winnerVotes = 0;
  for (const [key, votes] of tally) {
    if (votes > winnerVotes) {
      winnerKey = key;
      winnerVotes = votes;
    }
  }
  const winner =
    samples.find(
      (sample) => sample.form.trim().toLocaleLowerCase() === winnerKey,
    ) ?? samples[0];
  return {
    form: winner?.form.trim() ?? '',
    description: winner?.description ?? null,
    votes: winnerVotes,
    samples: samples.length,
    // MAJORITY, not unanimity: 2 of 3 is agreement. 1/1/1 is not.
    agreed: samples.length > 0 && winnerVotes * 2 > samples.length,
  };
}
