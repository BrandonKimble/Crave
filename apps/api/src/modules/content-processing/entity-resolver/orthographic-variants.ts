import { canonicalFold, normalizeSurface } from './entity-identity';

/**
 * ORTHOGRAPHIC VARIANTS — the CLOSED, MECHANICAL half of the &↔"and" gap
 * (plans/normalization-coherence-audit.md, queued item 1; owner-ruled fix
 * 2026-08-30, placement red-teamed in plans/orthographic-surfaces-report.md).
 *
 * THE GAP: `canonicalFold` turns "&" into a separator, so `Salt & Time`
 * banks fold `salt time` — and a user typing "salt and time" (folded
 * `salt and time`) misses it at the EXACT tier and, worse, at the GAZETTEER
 * scan that recognizes restaurants inside query text. 530 active names carry
 * `&`; only 232 had any " and " surface. The reverse direction is the same
 * gap mirrored: 152 active names contain the word "and", and a user typing
 * "&" folds it away.
 *
 * WHY THIS IS CODE AND NOT AN LLM ASK (the placement verdict, condensed):
 * "&" read as the word "and" has ONE answer — there is no judgment to buy,
 * and paying a model per name (and per future mint, forever) to compute a
 * deterministic mapping is fabricated work. The fold itself was the other
 * rejected home: folding `&` to ` and ` is English baked into a locale-blind
 * normalizer AND moves 530 stored identity keys. A VARIANT SURFACE is the
 * house shape — data, per-name, collision-guarded, revisable — exactly how
 * possessive and accent variants are already reachable.
 *
 * WHAT STAYS WITH THE LLM: expansions that need MEANING. The staging corpus
 * itself proves abbreviation expansion is semantic, not mechanical:
 * "St. Elmo Brewing" is SAINT but "Clinton St. Baking Company" and
 * "11th St. Bar" are STREET — same token, opposite words, decidable only by
 * reading the name. Those flow through the per-locale vocabulary sweep
 * (v8 prompt, orthographic-retyping rule), never through this table.
 *
 * THE CLOSED TABLE IS LEGITIMATE DATA, not a banned non-exhaustive list:
 * like TRAILING_LOCATION_TOKENS and the dietary vocabulary, it is a finite,
 * owner-reviewable mapping whose completeness is a decision, not a hope.
 * Today it holds the English "and" because this corpus's `&` names are read
 * with "and" by locals of every language in the launch metros; whether a
 * locale's own connector (`y`, `và`, `和`) earns a banked variant is the
 * owner-visible per-locale decision the audit queued — add it HERE when
 * ruled, and the census re-covers the whole corpus on its next pass.
 */
export const AMPERSAND_WORDS: ReadonlyArray<string> = ['and'];

/** Word-bounded "and" (any of AMPERSAND_WORDS) for the reverse direction. */
const AND_WORD_PATTERN = new RegExp(
  `(^|[\\s(])(${AMPERSAND_WORDS.join('|')})([\\s)]|$)`,
  'gi',
);

const AMPERSAND = /&/;

/** Does this form carry either side of the &↔and class? */
export function hasOrthographicTrigger(form: string): boolean {
  if (AMPERSAND.test(form)) return true;
  AND_WORD_PATTERN.lastIndex = 0;
  return AND_WORD_PATTERN.test(form);
}

/**
 * The variant spellings a person really types for `form`, EXCLUDING form
 * itself and excluding anything that folds identically to the original
 * (a variant that cannot change recall teaches nothing — "A&W" -> "A and W"
 * DOES change the fold, `a w` vs `a and w`, so it stays).
 *
 * Both directions of the class:
 *   - `&` -> each AMPERSAND_WORDS entry, space-normalized ("Salt & Time" and
 *     the glued "Ham&Eggs" both yield "... and ...").
 *   - the word -> `&` ("Salt and Time" -> "Salt & Time"), so a typed "&"
 *     reaches a name stored with the word.
 */
export function orthographicVariants(rawForm: string): string[] {
  const form = normalizeSurface(rawForm);
  if (!form) return [];
  const out = new Set<string>();
  const baseFold = canonicalFold(form);

  if (AMPERSAND.test(form)) {
    for (const word of AMPERSAND_WORDS) {
      // Glued "&" ("Ham&Eggs") needs the spaces the word requires.
      out.add(normalizeSurface(form.replace(/\s*&\s*/g, ` ${word} `)));
    }
  }
  AND_WORD_PATTERN.lastIndex = 0;
  if (AND_WORD_PATTERN.test(form)) {
    AND_WORD_PATTERN.lastIndex = 0;
    out.add(
      normalizeSurface(
        form.replace(AND_WORD_PATTERN, (_m, pre, _w, post) => `${pre}&${post}`),
      ),
    );
  }

  return [...out].filter(
    (variant) =>
      variant &&
      variant !== form &&
      canonicalFold(variant) !== baseFold &&
      canonicalFold(variant).length > 0,
  );
}
