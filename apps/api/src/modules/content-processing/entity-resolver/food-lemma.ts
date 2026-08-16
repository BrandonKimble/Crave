/**
 * DETERMINISTIC SINGULAR/PLURAL COLLAPSE for food and ingredient names.
 *
 * Why this exists (attributed 2026-07-28, llm_decision_records): the LLM
 * judge was asked "is 'dumplings' the same as 'dumpling'?" six times with an
 * IDENTICAL candidate list and answered `match` five times and `new` once —
 * and the one `new` created the duplicate entity at 06:54:32, permanently.
 * Across the ledger, 1,301 of 11,260 repeated identical questions (11.6%)
 * came back with conflicting verdicts, at temperature 0. Once a plural twin
 * exists, the exact-match tier finds it forever and the judge is never asked
 * again, so a single coin flip is unrecoverable.
 *
 * A plural is a morphological FACT, not a judgment. Deciding it in code
 * removes the question from the stochastic tier entirely: cheaper (no call)
 * and exact (no variance). Measured damage this prevents: 186 split pairs
 * across 27,317 events, with 3,121 events stranded on the minority twin
 * (taco/tacos, fajita/fajitas, cocktail/cocktails, dumpling/dumplings).
 *
 * DELIBERATELY CONSERVATIVE. This only ever collapses a word to its
 * singular; it never merges two different words. Words that merely END in
 * -s are protected (hummus, queso fresco), because over-collapsing would
 * fuse genuinely distinct foods — the one failure mode worse than a
 * duplicate.
 */

/** Mass nouns and loanwords whose singular form is not a real dish, or whose
 *  -s is not a plural at all. Collapsing these would invent a word. */
const NEVER_SINGULARIZE = new Set([
  'hummus',
  'couscous',
  'queso',
  'churros',
  'tapas',
  'grits',
  'greens',
  'molasses',
  'asparagus',
  'chips',
  'fries',
  'nachos',
  'ribs',
  'wings',
  'beans',
  'noodles',
  'oats',
  'sprouts',
  'mussels',
  'clams',
  'leftovers',
]);

/**
 * CANDIDATE singular forms for a head word. Returns a SET, not one answer,
 * because English plurals are genuinely ambiguous in reverse: "cookies" ->
 * cookie, but "curries" -> curry, and the plural alone cannot tell you
 * which. A single-valued lemma key must guess and is wrong half the time
 * (it turned "cookies" into "cooky"). Emitting both candidates and letting
 * the EXISTING ENTITY decide is deterministic and correct — only the form
 * that is actually in the database can match.
 */
function singularCandidates(word: string): string[] {
  if (word.length <= 3 || NEVER_SINGULARIZE.has(word)) {
    return [];
  }
  const candidates: string[] = [];
  if (word.endsWith('ies') && word.length > 4) {
    candidates.push(`${word.slice(0, -3)}y`); // curries -> curry
    candidates.push(`${word.slice(0, -1)}`); // cookies -> cookie
  }
  if (/(ches|shes|xes|sses|zzes)$/.test(word)) {
    candidates.push(word.slice(0, -2)); // sandwiches -> sandwich
  }
  if (word.endsWith('oes')) {
    candidates.push(word.slice(0, -2)); // potatoes -> potato
  }
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) {
    candidates.push(word.slice(0, -1)); // tacos -> taco
  }
  // Spanish/loanword -es after a consonant: chicharrones -> chicharron,
  // tamales -> tamal, frijoles -> frijol. Proposing a non-word here is
  // harmless BY DESIGN — a candidate only matches if it already exists as
  // an entity, which is the whole point of returning a set instead of
  // guessing one lemma.
  if (word.endsWith('es') && word.length > 4) {
    candidates.push(word.slice(0, -2));
  }
  return candidates.filter((c) => c.length >= 3);
}

function pluralCandidates(word: string): string[] {
  // SUB-3-CHAR FLOOR (R15 defect 1, 2026-08-16): a 1–2-char fragment is not a
  // food head word — it is a prefix someone stopped typing. Pluralizing it
  // MANUFACTURES exact-tier evidence out of nothing: submitted 'jo' minted
  // 'jos', which EXACT-matched Jo's Coffee's banked alias 'jos' and linked a
  // restaurant identity off a 2-char prefix — the same family as the fold
  // manufacturing its own language license. Mirrors singularCandidates'
  // length<=3 guard: variants are for words, never fragments. Typing 'jos'
  // VERBATIM still exact-matches (typed text is real evidence), and the
  // autocomplete prefix lane never runs through variants at all.
  if (word.length < 3 || word.endsWith('s')) {
    return [];
  }
  const guard = (forms: string[]): string[] =>
    forms.filter((form) => !NEVER_SINGULARIZE.has(form));
  // The deny-list guards BOTH directions (red team R7): it protected
  // 'wings' from singularizing but nothing stopped 'wing' from PROPOSING
  // 'wings' — the pair still collapsed, just onto the plural, defeating
  // the documented invariant in the one direction the specs did not pin.
  if (/(ch|sh|x|z)$/.test(word)) {
    return guard([`${word}es`]);
  }
  if (/[^aeiou]y$/.test(word)) {
    return guard([`${word.slice(0, -1)}ies`]);
  }
  // Consonant-final loanwords take -es (chicharron -> chicharrones).
  if (/[nlr]$/.test(word)) {
    return guard([`${word}s`, `${word}es`]);
  }
  // cookie -> cookies, taco -> tacos
  return guard([`${word}s`]);
}

/**
 * Every name form that would denote THE SAME FOOD as `name`. Two entities
 * are the same thing when one's name appears in the other's variants.
 *
 * English compound nouns are HEAD-FINAL, so only the last word carries
 * number: "breakfast tacos" == "breakfast taco", while "chicken tacos" and
 * "beef tacos" stay distinct.
 */
export function itemNameVariants(name: string): string[] {
  const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }
  const words = normalized.split(' ');
  const head = words[words.length - 1];
  const withHead = (form: string): string =>
    [...words.slice(0, -1), form].join(' ');
  const heads = [...singularCandidates(head), ...pluralCandidates(head)];
  return Array.from(new Set([normalized, ...heads.map(withHead)]));
}

/** True when the two names denote the same food up to singular/plural. */
export function isSameItemUpToNumber(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/\s+/g, ' ').trim();
  const right = b.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!left || !right) {
    return false;
  }
  return (
    left === right ||
    itemNameVariants(left).includes(right) ||
    itemNameVariants(right).includes(left)
  );
}
