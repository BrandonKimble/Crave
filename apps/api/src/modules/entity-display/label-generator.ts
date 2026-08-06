/**
 * M2 — THE LABEL GENERATOR SEAM (+ R5-10's judge shape).
 *
 * The sweep FINDS unlabeled concepts; a generator PRODUCES them. They are
 * separate because the finding is stable forever and the producing is not.
 * The real generator is `VocabularyGenerator` (labels AND search surfaces,
 * per locale); `NoopLabelGenerator` below is the honest dry run.
 *
 * R5-10: judgement is MQM-SHAPED, not boolean. A 0-100 score with error spans
 * lets a near-miss be reviewed instead of silently dropped, and a generator
 * that is unsure lands `status='candidate'`; that is what the entity_labels
 * status column is for.
 *
 * MULTI-SAMPLE CONSENSUS WAS REMOVED, and the removal is a MEASUREMENT, not a
 * simplification. R5-10 asserted consensus was "required for short
 * context-free strings ... measured practice, not caution". Re-measured
 * 2026-08-05: 3 runs x 6 anchors (foods, a restaurant_attribute, a
 * food_attribute, an ingredient) produced 100% agreement and ZERO unstable
 * verdicts. Sampling three times tripled cost to re-derive a stable answer.
 * What DID move results was prompt WORDING, which is why the prompts are
 * version-pinned and re-measured against the launch gate on every change.
 * The helper had no production caller after the spine seeder was superseded,
 * so it is gone rather than left as tested-but-unused machinery implying a
 * design that is not real.
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
  /** 'active' publishes; 'candidate' queues for review. */
  status: 'active' | 'candidate';
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
