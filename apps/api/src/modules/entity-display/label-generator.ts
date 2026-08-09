/**
 * M2 — THE LABEL GENERATOR SEAM (+ R5-10's judge shape).
 *
 * The sweep FINDS unlabeled concepts; a generator PRODUCES them. They are
 * separate because the finding is stable forever and the producing is not.
 * The real generator is `VocabularyGenerator` (labels AND search surfaces,
 * per locale); `NoopLabelGenerator` below is the honest dry run.
 *
 * R5-10's MQM SCORING WAS REMOVED. It specified a 0-100 score with error spans
 * so a near-miss could be reviewed rather than dropped. No reviewer was ever
 * built, and the real generator does not produce near-misses — it ABSTAINS,
 * writing nothing, which is strictly better than a scored guess. So the score
 * was always the same constant compared against itself, and the error-span
 * array was always empty: scaffolding for a design that does not exist.
 * `status` stays because the entity_surface.status column is real and a future human
 * review flow would set it; the generator only ever emits 'active'.
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

export interface GeneratedLabel {
  entityId: string;
  locale: string;
  form: string;
  /** R5-6(a): the Wikidata-learned per-locale disambiguator. */
  description: string | null;
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
   * (role='display' vs role='recall') because display and matching have
   * different laws. Optional, so label-only generators stay valid.
   */
  aliases?: string[];
}

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
