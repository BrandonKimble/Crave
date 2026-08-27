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
 * THE REFUSAL CHECK: does the observed span appear inside the cited source's
 * text? A lookup, not a judgment (v17-coherence-redteam F1): both sides get
 * the identical mechanical normalization, the occurrence must be anchored at
 * word boundaries (redteam-l1 F2 — `oro` never verifies against "Loro"), and
 * the only tolerated variance is the possessive clitic (the emitted form may
 * lack a trailing 's / ' the text has, or carry one the text lacks in
 * apostrophe-form drift, including a no-apostrophe "Leftys" spelling).
 */
export function observedSpanAppearsInSource(
  placeObserved: string,
  sourceText: string,
): boolean {
  const span = normalizeSpanMechanically(placeObserved);
  if (!span) return false;
  const text = normalizeSpanMechanically(sourceText);
  if (!text) return false;
  return possessiveVariants(span).some((variant) =>
    occursAtWordBoundary(text, variant),
  );
}
