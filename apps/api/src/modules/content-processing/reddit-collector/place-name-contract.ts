/**
 * THE OBSERVED-SPAN CONTRACT — code side (v17, plans/v17-program.md item 1).
 *
 * The v17 prompt stops choosing canonical names: it emits `place_observed`
 * (the span as written, mechanically lowercased) plus `place_source_id`
 * (which source's text contains that span). Everything the old prompt's B.3
 * did NON-mechanically now happens here, deterministically:
 *
 *   1. `canonicalizeObservedPlaceName` derives the resolver-facing name from
 *      the observed span — exactly the old B.3 location-suffix drop
 *      ("Drop trailing neighborhood/borough/location suffixes ('les',
 *      'chelsea', 'midtown', 'queens'), even when the text contrasts
 *      branches — emit only the core brand tokens"), and nothing else:
 *      every other byte of the observed span is kept.
 *   2. `observedSpanAppearsInSource` is the refusal check: a mechanical
 *      substring lookup (never a judgment) of the observed span inside the
 *      cited source's text, both sides normalized identically (lowercase,
 *      NFC, curly→straight apostrophes, whitespace collapse), allowing only
 *      the possessive-clitic variance the prompt licenses (B.3 strips an
 *      attaching `'s`, so the emitted form may lack a trailing possessive
 *      the text has — and vice versa for apostrophe-form drift).
 *
 * Pure functions only — no I/O, no services — so the contract is unit-tested
 * in isolation and the same bytes-in produce the same bytes-out forever.
 */

import { canonicalFold } from '../entity-resolver/entity-identity';

/**
 * Trailing location/branch designators the old prompt's B.3 ordered dropped.
 * Deliberately conservative: exactly the tokens the rule named (les, chelsea,
 * midtown, queens + soho from the branch-designator clause) plus the
 * remaining NYC boroughs of the same class. A token is dropped ONLY when it
 * TRAILS a longer brand — a name that IS one of these tokens, or starts with
 * one, is untouched. Growing this lexicon is an owner call per metro
 * (v17-coherence-redteam F2: "city-specific data we must own").
 */
const TRAILING_LOCATION_TOKENS: ReadonlySet<string> = new Set([
  'les',
  'chelsea',
  'midtown',
  'queens',
  'soho',
  'brooklyn',
  'manhattan',
  'bronx',
  // City tags: the prompt transcribes a capitalized trailing city tag as
  // written ("Au Cheval NYC" → `au cheval nyc`); this normalizer owns the
  // drop. Growing this per-metro is an owner call (v17 red team F2).
  'nyc',
  'austin',
  'atx',
]);

/**
 * The mechanical normalization both sides of every comparison share:
 * NFC, lowercase, curly→straight apostrophes, whitespace collapse, trim.
 * This is the SAME normalization the prompt orders for emission (lowercase +
 * whitespace collapse), so a compliant emission is a fixed point of it.
 */
export function normalizeSpanMechanically(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Derive the resolver-facing canonical name from the observed span:
 * mechanical normalization, then the old B.3 trailing-location drop — a
 * lexicon token is peeled off the END while a longer brand remains in front
 * of it. Everything else is byte-identical to the observed span.
 */
export function canonicalizeObservedPlaceName(placeObserved: string): string {
  const normalized = normalizeSpanMechanically(placeObserved);
  const tokens = normalized.split(' ');
  while (
    tokens.length > 1 &&
    TRAILING_LOCATION_TOKENS.has(tokens[tokens.length - 1])
  ) {
    tokens.pop();
  }
  return tokens.join(' ');
}

/** Possessive-clitic variants the prompt licenses between span and text. */
function possessiveVariants(span: string): string[] {
  const variants = new Set<string>([span]);
  if (span.endsWith("'s")) {
    variants.add(span.slice(0, -2));
    variants.add(`${span.slice(0, -2)}'`);
    // Apostrophe-form drift: the text may write the plural/possessive with no
    // apostrophe at all ("Leftys" for an emitted `lefty's`).
    variants.add(`${span.slice(0, -2)}s`);
  } else if (span.endsWith("'")) {
    variants.add(span.slice(0, -1));
    variants.add(`${span}s`);
  } else {
    variants.add(`${span}'s`);
    variants.add(`${span}'`);
  }
  return [...variants].filter((v) => v.length > 0);
}

/** Unicode-aware word character — letters and digits in any script. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Does `variant` occur in `text` anchored at word boundaries? A raw substring
 * hit whose neighbor on either side is a letter/digit is NOT an occurrence —
 * `oro` inside "loro" proves nothing about the source having written "oro".
 * Apostrophes and punctuation do not break the boundary (a plain span still
 * matches immediately before a possessive clitic the variants license).
 */
function occursAtWordBoundary(text: string, variant: string): boolean {
  let from = 0;
  for (;;) {
    const idx = text.indexOf(variant, from);
    if (idx === -1) return false;
    const before = idx > 0 ? text[idx - 1] : '';
    const after =
      idx + variant.length < text.length ? text[idx + variant.length] : '';
    if (
      !(before && WORD_CHAR.test(before)) &&
      !(after && WORD_CHAR.test(after))
    ) {
      return true;
    }
    from = idx + 1;
  }
}

/**
 * Number-inflection variants for an INGREDIENT span (v17 loop2, junk RC2).
 * C.5 orders the emitted form "singular, lowercase", so a compliant emission
 * legitimately differs from the source text by number ONLY: the source wrote
 * "chanterelles"/"berries" and the model emits `chanterelle`/`berry`. The
 * inflection lives on the HEAD (final) token of the phrase, so variants are
 * generated there and nowhere else — anything beyond number variance
 * (expansion, translation, substitution, a synthesized head noun) is exactly
 * the pantry-canonicalization RC2 exists to refuse.
 */
function ingredientNumberVariants(span: string): string[] {
  const tokens = span.split(' ');
  const head = tokens[tokens.length - 1];
  const heads = new Set<string>([head]);
  // Emitted singular ↔ source plural.
  heads.add(`${head}s`);
  heads.add(`${head}es`);
  if (head.endsWith('y') && head.length > 1) {
    heads.add(`${head.slice(0, -1)}ies`);
  }
  // Emitted plural ↔ source singular (the prompt says singular, but the
  // contract tolerates the model failing to singularize — the WORD is still
  // the source's word; C.5's "noodles"-style natural plurals land here too).
  if (head.endsWith('ies') && head.length > 3) {
    heads.add(head.slice(0, -3) + 'y');
  }
  if (head.endsWith('es') && head.length > 2) {
    heads.add(head.slice(0, -2));
  }
  if (head.endsWith('s') && head.length > 1) {
    heads.add(head.slice(0, -1));
  }
  const prefix = tokens.slice(0, -1).join(' ');
  return [...heads]
    .filter((h) => h.length > 0)
    .map((h) => (prefix ? `${prefix} ${h}` : h));
}

/**
 * Diacritic fold for the INGREDIENT comparison only (v17 loop3): the bench
 * caught "jalapeno" refused against a source that wrote "jalapeños" —
 * plural AND accent differ together, and the number-variance generator ran
 * on the accent-carrying form so no variant could ever match. The honest
 * minimal fold: strip combining marks from BOTH sides before generating
 * number variants, so accent presence never decides an ingredient's fate
 * in either direction (emitted plain vs accented source, and vice versa).
 * The PLACE contract is untouched — place names keep their diacritics.
 */
function foldDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC');
}

/**
 * Hyphen fold for the INGREDIENT comparison only (v17 mechanical): the
 * residual wrong refusals included hyphen-vs-space drift — the source wrote
 * "chili-garlic" and the model emitted `chili garlic` (or vice versa).
 * Hyphens become spaces on BOTH sides before variant generation, so the
 * join character never decides an ingredient's fate. The PLACE contract is
 * untouched.
 */
function foldHyphens(value: string): string {
  return value.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Bound-morpheme occurrence (v17 mechanical): "cheese" inside
 * "cheeseburger" verifies — the ingredient appears WHOLLY, as a bound
 * morpheme, inside a single longer source word. Strictly narrower than a
 * raw substring hit: single-token ingredients only, anchored at the START
 * or END of the containing word, and the remaining morpheme must be a
 * plausible word chunk (>= 3 chars) — so `oro` never verifies against
 * "loro" (remainder "l") and `rice` never verifies against "price"
 * (remainder "p"); the word-boundary pin stays green.
 */
const MIN_MORPHEME_REMAINDER = 3;
function occursAsBoundMorpheme(text: string, variant: string): boolean {
  if (variant.includes(' ')) return false;
  for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
    const remainder = word.length - variant.length;
    if (remainder < MIN_MORPHEME_REMAINDER) continue;
    if (word.startsWith(variant) || word.endsWith(variant)) return true;
  }
  return false;
}

/**
 * THE INGREDIENT REFUSAL CHECK (junk RC2): does this emitted ingredient
 * appear — as a whole phrase, at word boundaries — in the given source
 * texts? Same mechanical normalization as the place contract plus a
 * diacritic fold and a hyphen fold on both sides (loop3 jalapeño case;
 * mechanical-round chili-garlic case); the only other tolerated variances
 * are NUMBER on the head token (C.5's singular mandate) and the
 * bound-morpheme compound case ("cheese" inside "cheeseburger"), mirroring
 * how the place check tolerates only the possessive clitic B.3 licenses.
 * "fermented crab" never verifies an emitted `salted crab`, and
 * "peach tea glazed" never verifies `tea leaf`.
 */
export function ingredientSpanAppearsInSource(
  ingredient: string,
  sourceTexts: readonly string[],
): boolean {
  const span = foldHyphens(
    foldDiacritics(normalizeSpanMechanically(ingredient)),
  );
  if (!span) return false;
  const variants = ingredientNumberVariants(span);
  return sourceTexts.some((sourceText) => {
    const text = foldHyphens(
      foldDiacritics(normalizeSpanMechanically(sourceText)),
    );
    if (!text) return false;
    return variants.some(
      (variant) =>
        occursAtWordBoundary(text, variant) ||
        occursAsBoundMorpheme(text, variant),
    );
  });
}

/**
 * THE ATOM RUN (2026-08-31, span-refusal distribution study).
 *
 * MEASURED PROBLEM: of the 103 `span_not_in_cited_source` refusals banked by
 * the v18 shadow re-extraction (39,793 documents), 59 were spans the source
 * DOES contain — written without the spaces, or with different punctuation
 * between the words:
 *
 *   source `fuegolatinogastropub.com`            span `fuego latino gastropub`
 *   source `@gangnamkrnbbq`                      span `gangnam krn bbq`
 *   source `@guatemalteca_authentic_food`        span `guatemalteca authentic food`
 *   source `H‑E‑B` (U+2011 non-breaking hyphen)  span `h-e-b`
 *   source `J&J's`                               span `j&js`
 *   source `Curra's Oltorf`                      span `curras oltorf`
 *   source `Saps spring rolls`                   span `sap`
 *
 * The old check could not see any of these, because it looked for the span's
 * exact character sequence and required a non-word character on each side:
 * the space in `fuego latino` simply is not in the domain, and `sap` inside
 * "Saps" is boundary-blocked. Every one of them is a CORRECT recovery of a
 * name the source genuinely wrote — refusing them is a standing loss.
 *
 * THE RULE: an ATOM is a maximal letter/digit run of `canonicalFold` output
 * (the repo's ONE fold — accents folded, apostrophes DELETED, every other
 * non-letter/digit run turned into a single space). The span occurs when its
 * atoms, concatenated, equal a CONTIGUOUS RUN of the source's atoms,
 * concatenated — allowing only a trailing `s`/`es` in either direction (the
 * same singular/plural + possessive variance the possessive-clitic path
 * already licenses, here on the run's tail).
 *
 * WHY THIS IS NOT A SUBSTRING MATCH — the hallucination guard is intact.
 * The match must cover WHOLE atoms at both ends. `oro` still never verifies
 * against "Loro": "loro" is one atom, and `oro` is not that atom nor any run
 * of atoms. A span may drop the separators BETWEEN source atoms; it may never
 * start or end in the middle of one. That is exactly the difference between
 * "the source wrote this name with different punctuation" and "the model
 * pulled a fragment out of an unrelated word". No similarity threshold, no
 * edit distance, no fuzzy scoring — a structural equality on a folded
 * sequence.
 *
 * WHAT REMAINS REFUSED, and why that is the guard working (the other 44 of
 * the 103, read case by case against their source text):
 *   - THE SOURCE HAS A TYPO the model silently corrected: "Texas Chili
 *     Parlol" → `texas chili parlor`, "Jester kingw" → `jester king`,
 *     "Pontotoc Yineyard" → `pontotoc vineyard`, "fraught house brewery" →
 *     `draught house brewery`. The name is right in the world and absent
 *     from the text; accepting it needs edit distance, which is precisely
 *     the door invention walks through.
 *   - THE MODEL COMPLETED THE OFFICIAL NAME from its own knowledge: source
 *     "Better Half" → `better half coffee & cocktails`, "Draught House" →
 *     `draught house brewery`, "Lil and Big Nonnas" → `lil nonnas`. The
 *     extra tokens are not in the source; the contract's whole point is
 *     that the span is the source's words, not the model's.
 *   - THE MODEL TRUNCATED: source "Cafe Cremé" → `cafe crem`. `crem` is a
 *     fragment of the atom "creme", so the run rule refuses it — the same
 *     structural reason `oro` is refused against "Loro".
 *   - THE SPAN IS A PREFIX INSIDE A LONGER HANDLE/HOST ATOM: `boteco` from
 *     "botecoatx.com", `ezov` from "ezovatx.com", `tillies` from
 *     "tilliesdrippingsprings.com". A host is unsegmentable, so licensing a
 *     prefix of one would license a prefix of EVERY word — `red` would
 *     verify against "reddit.com". Refused on purpose.
 *   - GENUINE ABSENCE: `unknown restaurant`, `atx cucina`, `el nino` — no
 *     trace in any source of the input. The Luckys class; the guard's reason
 *     for existing.
 */
const ATOM_RUN_TAIL_VARIANCE_MAX = 2; // the longest tail the rule adds: "es"

/** The span's / the text's letter-digit atoms under the canonical fold. */
function foldedAtoms(value: string): string[] {
  return canonicalFold(value)
    .split(' ')
    .filter((atom) => atom.length > 0);
}

/** Whole-atom-run equality with singular/plural tail variance. */
function atomRunMatches(run: string, target: string): boolean {
  return (
    run === target ||
    run === `${target}s` ||
    target === `${run}s` ||
    run === `${target}es` ||
    target === `${run}es`
  );
}

/** Does the span's folded atom sequence equal a contiguous run of the
 *  source's folded atoms? See THE ATOM RUN above for what this accepts and
 *  what it deliberately still refuses. */
function occursAsAtomRun(sourceText: string, span: string): boolean {
  const target = foldedAtoms(span).join('');
  if (!target) return false;
  const textAtoms = foldedAtoms(sourceText);
  for (let start = 0; start < textAtoms.length; start += 1) {
    let run = '';
    for (let end = start; end < textAtoms.length; end += 1) {
      run += textAtoms[end];
      if (run.length > target.length + ATOM_RUN_TAIL_VARIANCE_MAX) break;
      if (atomRunMatches(run, target)) return true;
    }
  }
  return false;
}

/**
 * THE REFUSAL CHECK: does the observed span appear inside the cited source's
 * text? A lookup, not a judgment (v17-coherence-redteam F1): both sides get
 * the identical mechanical normalization, the occurrence must be anchored at
 * word boundaries (redteam-l1 F2 — `oro` never verifies against "Loro"), and
 * the only tolerated variance is the possessive clitic (the emitted form may
 * lack a trailing 's / ' the text has, or carry one the text lacks in
 * apostrophe-form drift, including a no-apostrophe "Leftys" spelling), plus
 * the ATOM RUN above — the same name written with different separators
 * (a domain, a social handle, an accented spelling, a possessive). The two
 * paths are ADDITIVE: nothing that verified before stops verifying.
 */
export function observedSpanAppearsInSource(
  placeObserved: string,
  sourceText: string,
): boolean {
  const span = normalizeSpanMechanically(placeObserved);
  if (!span) return false;
  const text = normalizeSpanMechanically(sourceText);
  if (!text) return false;
  if (
    possessiveVariants(span).some((variant) =>
      occursAtWordBoundary(text, variant),
    )
  ) {
    return true;
  }
  return occursAsAtomRun(sourceText, placeObserved);
}
