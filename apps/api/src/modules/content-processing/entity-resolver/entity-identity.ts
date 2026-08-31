import { EntityType } from '@prisma/client';
import { itemNameVariants } from './food-lemma';

/**
 * ENTITY IDENTITY KEY (async-integrity step 2, Law 1: identity is content,
 * not delivery). Two names that denote the same real-world thing must
 * contend on the SAME advisory lock and probe the SAME candidate set at
 * creation time — otherwise concurrent batches mint twins that no
 * name-string lock can see (observed: word-order twins "pizza square"/
 * "square pizza" minted 2026-07-31; plural twins before the lemma fix).
 *
 * The key is deliberately COARSE — it exists to serialize creators and
 * widen the adopt probe, not to assert equality. Collisions between
 * genuinely different names ("rice noodle"/"noodle rice"?) cost one lock
 * wait; misses cost a permanent duplicate. Coarse is the right side.
 *
 * Shape per type:
 * - food/ingredient: lemma-collapse the head word to its minimal variant
 *   (min over foodNameVariants — deterministic: both "taco" and "tacos"
 *   variant-sets contain "taco", so both pick it), then SORT the content
 *   tokens so word-order variants converge.
 * - everything else (restaurants, attributes): lowercase, strip
 *   punctuation/possessives ("Phil's" == "Phils"), collapse whitespace.
 *   No token sort — restaurant word order is branding.
 */
/** Non-decomposable Latin letters — NFKD leaves them whole, so they need an
 *  explicit rule where every accented letter gets one for free (e-acute -> e
 *  + combining acute, folded by the mark strip). The set is finite and
 *  CLOSED: there is no stream of "one more non-decomposable Latin letter" the
 *  way there is an endless stream of new accented forms.
 *
 *  THE TABLE IS SPLIT BY ONE QUESTION (red team A0 R3, 2026-08-11): DOES THIS
 *  CHARACTER CHANGE WHICH WORD THIS IS, in the language that writes it?
 *
 *  - A LETTER does. Vietnamese đ is the eighth letter of its alphabet, not a
 *    decorated d: `đá` (ice/stone) and `da` (skin) are different words, and
 *    `đầu` (head) and `dầu` (oil) are the pair that exposed this — the
 *    keyword ledger merged them into one row, which is the exact bò/bơ defect
 *    the accent-preserving fold exists to prevent, one table over. Same for
 *    Polish ł (`łaska` grace vs `laska` cane), Nordic ø, Icelandic þ/ð,
 *    Turkish dotless ı (`kırmızı`), Maltese ħ/ŧ, Sami ŋ/ĸ. These fold ONLY
 *    where accents fold — they behave exactly like an accent, because in
 *    their own orthographies that is what they are: a letter distinguished by
 *    a stroke, bar or missing dot.
 *
 *  - A SPELLING VARIANT does not. German ß IS `ss` — Switzerland writes the
 *    same word that way — and the ligatures æ/œ are the same word as `ae`/`oe`
 *    (French `œuf`/`oeuf`). Folding these merges two spellings of ONE word,
 *    which is the whole job of a fold, so they fold in BOTH directions,
 *    accent-preserving or not.
 *
 *  The split costs nothing at the identity key: canonicalFold folds every
 *  entry in both tables, byte for byte as before, so no stored identity_key
 *  moves. What changes is diacriticFold — and there the change is a
 *  correction: `diacriticFold(x) !== canonicalFold(x)` is meant to mean
 *  "x carries at least one accent", and a word written with đ or ł carries
 *  exactly that kind of evidence. */
const NON_DECOMPOSABLE_SPELLING: Record<string, string> = {
  ß: 'ss', // ß — Swiss German writes the same word 'ss'
  æ: 'ae', // æ
  œ: 'oe', // œ — 'œuf' / 'oeuf' is one word, two spellings
};

/** Letters whose ASCII lookalike is a DIFFERENT letter of the same alphabet.
 *  Folded by canonicalFold (the coarse key), preserved by diacriticFold. */
const NON_DECOMPOSABLE_LETTER: Record<string, string> = {
  ø: 'o', // ø
  đ: 'd', // đ — Vietnamese/Croatian: đầu (head) is not dầu (oil)
  ł: 'l', // ł — Polish: łaska (grace) is not laska (cane)
  þ: 'th', // þ
  ð: 'd', // ð
  ħ: 'h', // ħ
  ŧ: 't', // ŧ
  ı: 'i', // ı (dotless i) — Turkish: kırmızı is not kirmizi
  ĸ: 'k', // ĸ
  ŋ: 'n', // ŋ
};

const NON_DECOMPOSABLE: Record<string, string> = {
  ...NON_DECOMPOSABLE_SPELLING,
  ...NON_DECOMPOSABLE_LETTER,
};
const NON_DECOMPOSABLE_RE = /[ßæœøđłþðħŧıĸŋ]/g;
const NON_DECOMPOSABLE_SPELLING_RE = /[ßæœ]/g;

/** The Combining Diacritical Marks blocks — Latin/Greek/Cyrillic/Vietnamese
 *  accents and the Turkish-İ dot (U+0307). DELIBERATELY EXCLUDES the CJK
 *  voicing marks U+3099/U+309A: those live in a separate block and are
 *  phonemic, not decorative — a blanket \p{M} strip turns katakana pa into
 *  ha and ga into ka, a wrong merge. Naming the diacritic blocks instead of
 *  \p{M} folds every accent while leaving CJK voicing intact (verified
 *  against the live corpus in the i18n red team). */
const COMBINING_DIACRITICS =
  // Matching combining marks in the class is the WHOLE point; the rule guards
  // against ACCIDENTAL ones, these are the deliberate, escaped accent blocks.
  // eslint-disable-next-line no-misleading-character-class
  /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/gu;

/** THE canonical fold — THE ONLY IMPLEMENTATION.
 *
 *  identity_key is APP-WRITTEN from this function; the DB only stores and
 *  indexes it. A DB mirror (crave_fold) was tried and abandoned — Postgres
 *  Unicode character classes are PLATFORM-DEPENDENT ([:alnum:] folds
 *  Devanagari differently on glibc PG17 than on mac PG18, measured) — so
 *  there is NO SQL side to stay byte-identical with, and the fold is free to
 *  use the correct Unicode primitive (this comment previously forbade NFKD
 *  for a mirror that no longer exists).
 *
 *  LANGUAGE-AGNOSTIC, by Unicode decomposition rather than a hand list:
 *    NFKD (decompose accents to base+mark; fold fullwidth/compat forms so
 *      fullwidth ramen == ramen, roman-numeral VIII == viii)
 *    -> strip the combining-diacritic blocks (e-acute==e, n-tilde==n across
 *      every script; Turkish İ's dot; but NOT CJK voicing — pa stays pa)
 *    -> NFC recompose (restore any CJK letter whose voicing mark survived)
 *    -> lower
 *    -> the closed non-decomposable table (ß==ss, ø==o …)
 *    -> apostrophes STRIP, straight and curly (Phil's == Phils)
 *    -> every non-letter/digit run OF ANY SCRIPT becomes ONE SPACE (tex-mex
 *      == tex mex; Cyrillic and CJK names keep their letters, distinct ids)
 *    -> trim.
 *  Only genuinely letterless names (emoji-only, '!!!') fold to '' and fall to
 *  the NULL "no identity" of the partial index and every probe.
 *
 *  This fixes two twin CLASSES the hand list could not: (1) DECOMPOSED (NFD)
 *  input — iOS pasteboards and the macOS filesystem deliver NFD, and the old
 *  map only matched precomposed codepoints, so a name typed one way twinned
 *  itself typed the other; (2) every accented letter absent from the finite
 *  hand list (pinyin carons, Czech d-caron, …) silently survived unfolded. */
/**
 * THE FOLD ALGORITHM VERSION (multilingual ruling R5, 2026-08-12). Every
 * `identity_key` in the database was computed by SOME revision of the fold
 * below — and a behavioral fold change silently strands every stored key at
 * the old algorithm (the narrowed heal only touches NULL/recent rows; the
 * planned tone-mark-fold work would widen the gap corpus-wide). Recording
 * starts at 1 = the fold as of 2026-08-12.
 *
 * THE LAW: any change to the OUTPUT of canonicalFold/diacriticFold for any
 * input bumps this constant, and the bump's commit must state the backfill
 * decision ({full:true} heal or a reasoned deferral). Enforcement:
 *  - scripts/check-fold-drift.ts recomputes the fold over a DB sample and
 *    fails on any stored-key divergence (the invariant registry proves the
 *    check bites by mutating the fold);
 *  - the identity.fold-version-recorded invariant fails when the fold
 *    implementation changes without this constant moving (hash pin).
 * The `fold_version` column beside identity_key (applied 20260812090000)
 * records per-row provenance; identityInsertData stamps it on every create,
 * and the two raw re-key paths (the ontology rename, the identity-key heal)
 * stamp it alongside the keys they rewrite.
 */
export const FOLD_ALGORITHM_VERSION = 2;
/* v2 (2026-08-30, punctuation-matrix audit): ™/℠ fold as separators instead
 * of NFKD-glued letters ("Wingstop™" keys `wingstop`, not `wingstoptm`).
 * BACKFILL DECISION: reasoned deferral — the staging corpus holds ZERO active
 * rows whose name contains ™ or ℠ (census 2026-08-30; the 4 ®-named rows fold
 * byte-identically under v1 and v2), so no stored identity_key moves and
 * check-fold-drift stays green with no heal. */

/**
 * THE CHARACTERS THE FOLD DELETES OUTRIGHT — it neither keeps them nor turns
 * them into a separator, so they are INVISIBLE TO IDENTITY in the strongest
 * sense: `ta<ZWSP>co` and `taco` are one string, `Phil's` and `Phils` are one
 * string. Two families, one property:
 *
 *  - INVISIBLE MODIFIERS that carry no identity — format controls (\p{Cf}:
 *    ZWSP, ZWJ, ZWNJ, the BOM, U+061C), the soft hyphen, and the VARIATION
 *    SELECTORS (U+FE00–FE0F and the astral supplement; category Mn, so the
 *    mark-PRESERVING step would otherwise keep them and a trailing emoji VS16
 *    would change a name's identity). Deleted, not spaced: the old fold's
 *    punctuation arm turned a stray ZWSP inside "ta<ZWSP>co" into a space and
 *    minted "ta co" as a twin no lock or index could see (LLM extraction and
 *    pasteboards inject these).
 *  - APOSTROPHES, straight and curly. "Phil's" and "Phils" are one name.
 *
 * EXPORTED because the QUERY TOKENIZER has to agree with it (2026-08-13).
 * `query-analyzer` cuts the query at every non-letter/digit and then asks, per
 * gap, how the two sides re-join — and the honest answer for a gap made only
 * of these characters is "with nothing between them", because that is exactly
 * what the fold will do. Re-stating the set there produced the F4/F5 defect
 * pair: `harry's` re-joined correctly only because the apostrophe was welded
 * into the tokenizer's own character class, while `珍珠<ZWSP>奶茶` lost its
 * compound because a ZWSP is not `\s` and no rule there had ever heard of
 * \p{Cf}. One definition, both readers.
 */
/** THE INVISIBLES. Applied BEFORE the accent policy, because a format control
 *  sitting between a letter and its combining mark would otherwise block the
 *  recomposition the policy depends on. */
const FOLD_DELETED_INVISIBLE_RE =
  // eslint-disable-next-line no-misleading-character-class -- deliberate
  /[\p{Cf}­︀-️\u{E0100}-\u{E01EF}]/gu;

/** THE LETTER-GLUE SYMBOLS (fold v2, punctuation-matrix audit 2026-08-30).
 *  ™ (U+2122) and ℠ (U+2120) COMPATIBILITY-DECOMPOSE to the letters "tm"/"sm"
 *  under NFKD, so a fold that ran them through the pipeline minted glued keys:
 *  "Wingstop™" keyed as `wingstoptm` — an unreachable twin of `wingstop` that
 *  no query form could ever fold to. Every OTHER mark of this family (®, ©,
 *  ℗) has no compat decomposition and already falls to the separator arm as a
 *  space, which is the behavior a trademark sign should have: decoration, not
 *  identity. So these two become a SPACE BEFORE NFKD — the only point where
 *  they are still distinguishable from real letters — exactly the separator
 *  treatment ® and © already get; the space then collapses in the separator
 *  arm, so a trailing sign vanishes without minting a stray-token key. */
const FOLD_SEPARATOR_TRADEMARK_RE = /[™℠]/g;

/** THE APOSTROPHES. Applied AFTER NFKD, which is load-bearing: the fullwidth
 *  apostrophe U+FF07 only BECOMES U+0027 under compatibility decomposition,
 *  and a strip that ran before it would leave the fullwidth form to fall
 *  through to the separator arm and mint "phil s". */
const FOLD_DELETED_APOSTROPHE_RE = /['’‘ʼ]/g;

/** Is every character of `text` one the fold deletes outright — either family?
 *  True of the EMPTY string, which is the adjacency case and re-joins with
 *  nothing by the same logic. */
export function foldDeletesEntirely(text: string): boolean {
  return (
    text
      .normalize('NFKD')
      .replace(FOLD_DELETED_INVISIBLE_RE, '')
      .replace(FOLD_DELETED_APOSTROPHE_RE, '') === ''
  );
}

export function canonicalFold(name: string): string {
  return foldWithAccentPolicy(name, true);
}

/** THE ACCENT-PRESERVING FOLD — canonicalFold's twin, differing in EXACTLY
 *  one step: the combining-diacritic strip is skipped. Everything else
 *  (NFKD/NFC, format-control deletion, lowercasing, the non-decomposable
 *  table, apostrophe strip, separator collapse, trim) is the SAME code path,
 *  which is why both live in one private implementation — a copy would drift,
 *  and the whole point of this function is that the two keys differ ONLY by
 *  accents.
 *
 *  THE INVARIANT THIS BUYS: `diacriticFold(x) !== canonicalFold(x)` is
 *  precisely the predicate "x carries at least one accent". That is the
 *  evidence test the query path needs — see the DIACRITIC EVIDENCE rule in
 *  EntityTextSearchService.scanForKnownEntityGroups. When a user TYPES
 *  accents, the accents are evidence; a stored surface that disagrees on them
 *  is a different word (bò beef vs bơ butter/avocado, cơm chay vegetarian rice
 *  vs cơm cháy scorched rice), not an exact match. When the user types no
 *  accents ('pho', 'bo') there is no evidence and the folded key rules, so
 *  de-diacritized typing — the way most people type Vietnamese on a US
 *  keyboard — keeps working exactly as before. Language-neutral: nothing here
 *  knows what Vietnamese is. */
export function diacriticFold(name: string): string {
  return foldWithAccentPolicy(name, false);
}

function foldWithAccentPolicy(name: string, stripAccents: boolean): string {
  return (
    name
      // ™/℠ become separators BEFORE NFKD decomposes them into the letters
      // "tm"/"sm" — after which they are indistinguishable from real letters
      // and would glue onto the preceding token ("Wingstop™" → wingstoptm).
      .replace(FOLD_SEPARATOR_TRADEMARK_RE, ' ')
      .normalize('NFKD')
      // Invisible modifiers that carry NO identity: format-controls (\p{Cf}:
      // ZWSP, ZWJ, ZWNJ, BOM …), the soft hyphen, and the VARIATION SELECTORS
      // (U+FE00–FE0F and the astral supplement — category Mn, so the
      // mark-preserving step below would otherwise keep them; a trailing emoji
      // VS16 must not change a name's identity). DELETE them (not space): the
      // old fold's punctuation arm turned a stray ZWSP inside "ta<ZWSP>co" into
      // a space, minting "ta co" as a twin of "taco" that no lock or index
      // could see (LLM extraction and pasteboards inject these).
      .replace(FOLD_DELETED_INVISIBLE_RE, '')
      // Strip Latin/Greek/Cyrillic/Vietnamese ACCENTS only (é==e). NOT CJK
      // voicing, NOT Arabic harakat, NOT Thai/Devanagari vowel signs — those
      // live outside these blocks and are handled by the mark-preserving
      // separator step below.
      .replace(COMBINING_DIACRITICS, stripAccents ? '' : '$&')
      .normalize('NFC')
      .toLowerCase()
      // A letter that changes WORD IDENTITY folds only where accents fold;
      // a pure spelling variant (ß/æ/œ) folds in both directions. See the
      // table split above.
      .replace(
        stripAccents ? NON_DECOMPOSABLE_RE : NON_DECOMPOSABLE_SPELLING_RE,
        (ch) =>
          (stripAccents ? NON_DECOMPOSABLE : NON_DECOMPOSABLE_SPELLING)[ch] ??
          ch,
      )
      .replace(FOLD_DELETED_APOSTROPHE_RE, '')
      // Only TRUE separators/punctuation become one space. \p{M} is PRESERVED
      // so a Thai/Devanagari/Arabic vowel sign stays attached to its base
      // letter — the old `[^\p{L}\p{N}]+` shredded "ผัดไทย" into "ผ ดไทย" and
      // "पनीर" into "पन र", nonsense keys that would collide at scale. A
      // non-Latin mark that reaches here is semantic; keeping it yields a
      // distinct, correct identity (the conservative, non-merging side).
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
      .trim()
  );
}

/** THE DISPLAY-PRESERVING NORMAL FORM of a stored surface (alias form, label
 *  form) — the ONE shape text takes before it is written, so byte-identity is
 *  a property the unique indexes over `form` can actually enforce. NFC
 *  composition collapses the NFD and NFC spellings of one surface (iOS
 *  pasteboards and the macOS filesystem deliver NFD) that would otherwise mint
 *  two rows; format-control characters (ZWSP/ZWJ/BOM …) are DELETED as
 *  invisible non-identity; whitespace is trimmed and collapsed. Unlike
 *  canonicalFold this KEEPS case and accents — it is the display form, not the
 *  recall key. Aliases and labels share this exact function so a surface has
 *  one normal form regardless of which table it lands in. */
export function normalizeSurface(text: string): string {
  return (text ?? '')
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Does this text carry any identity-bearing content — at least one letter or
 *  digit of ANY script — or is it blank/invisible (all whitespace, punctuation,
 *  combining marks, zero-width/format controls)? The write-ingress authority
 *  for "is this a real surface": a label or alias that fails this renders an
 *  invisible name. It is APP-SIDE on purpose — V8's `\p{L}`/`\p{N}` are
 *  Unicode-version-stable and platform-independent, whereas a Postgres
 *  `[[:alnum:]]` CHECK folds non-Latin scripts differently across libc builds
 *  (the same lesson that made identity_key app-written). NFC first so a
 *  decomposed letter is seen as a letter. Equivalent to `canonicalFold(t) !==
 *  ''` but cheaper — no fold needed to answer a yes/no. */
export function isDisplayable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test((text ?? '').normalize('NFC'));
}

/** The stored identity for a name, or NULL when the name has no
 *  foldable identity (emoji-only / punctuation-only). NULL is the native
 *  "no identity" of the partial unique index and of every probe — the
 *  old 'nfc:' sentinel hand-emulated that in four places and could still
 *  twin ("🍕" vs "🍕 "); round-12 architecture audit deleted the concept. */
export function entityIdentityKey(
  name: string,
  type: EntityType,
): string | null {
  const base = canonicalFold(name);
  if (!base) {
    return null;
  }
  if (type === EntityType.item || type === EntityType.ingredient) {
    // PER-TOKEN fold, then sort (round-3 empirical red team: folding the
    // whole name stems only the LAST word — head-final — so the key
    // depended on token order and 41.8% of real multi-word names,
    // including "pizza square"/"square pizza", still took different
    // locks). Folding each token independently to its variant-closure
    // minimum is order-invariant by construction; sorting finishes it.
    // Coarse by design: this key serializes creators and widens probes,
    // it never asserts equality.
    return base
      .split(' ')
      .map((token) => tokenFold(token))
      .sort()
      .join(' ');
  }
  return base;
}

/** Canonical fold of ONE word: min over the fixpoint closure of its
 *  number variants (round 2 ⑥b: any bounded expansion is asymmetric —
 *  the fixpoint makes every member of a variant family land on the same
 *  closed set). Terminates: singular candidates strictly shrink, grown
 *  forms end in 's' and cannot grow again (proven round 3, ≤3 iterations
 *  on real data). */
function tokenFold(token: string): string {
  const closure = new Set<string>(itemNameVariants(token));
  for (let size = -1; size !== closure.size; ) {
    size = closure.size;
    for (const variant of Array.from(closure)) {
      for (const next of itemNameVariants(variant)) {
        closure.add(next);
      }
    }
  }
  return Array.from(closure).sort()[0] ?? token;
}

/** The advisory-lock key — TOTAL (every name locks on something):
 *  the stored identity when one exists, else the raw normalized name.
 *  Locking and identity are different functions with different totality
 *  requirements; conflating them is what created the nfc: sentinel. */
export function entityLockKey(name: string, type: EntityType): string {
  return (
    entityIdentityKey(name, type) ??
    `raw:${name.normalize('NFC').toLowerCase().trim()}`
  );
}

/** The ONE way identity columns enter the database: spread this into
 *  every entity create payload. Keys are atomic with the row — no
 *  window where an entity exists without identity (round-12: six
 *  keyless creation sites defeated the unique index and every probe,
 *  and the post-insert UPDATE left the P2002 savepoint guarding the
 *  wrong statement). */
export function identityInsertData(
  name: string,
  type: EntityType,
): {
  identityKey: string | null;
  identityKeySorted: string | null;
  foldVersion: number;
} {
  return {
    identityKey: canonicalFold(name) || null,
    identityKeySorted: entityIdentityKey(name, type),
    // THE ROW SAYS WHICH FOLD SPELLED IT (D-census, 2026-08-13). The column
    // has existed since 20260812090000 and every row carried the DEFAULT,
    // which is a fact about the migration rather than about the row: a key
    // written after a fold bump would still have claimed version 1, so the
    // drift the column exists to expose would have been invisible in exactly
    // the rows that had it. Stamped HERE because this is the one helper the
    // keys themselves come from — a create path that writes a key without
    // going through it is the same class of bug the helper was made to end.
    foldVersion: FOLD_ALGORITHM_VERSION,
  };
}

/**
 * Candidate NAMES an entity with this name could already exist under —
 * used by the creation path's adopt-probe (case-insensitive IN query).
 * For foods/ingredients this is the number-variant set; other types probe
 * the literal name only (their identity nuance lives in the lock key, and
 * the DB query can't strip punctuation without a stored key column).
 */
export function identityProbeNames(name: string, type: EntityType): string[] {
  if (type === EntityType.item || type === EntityType.ingredient) {
    return itemNameVariants(name.toLowerCase().replace(/\s+/g, ' ').trim());
  }
  return [name];
}

/**
 * DIACRITIC EVIDENCE — the exact-tier admission rule (2026-08-09).
 *
 * THE DEFECT: the exact tier matches on the FOLDED key, and the fold strips
 * accents so de-diacritized typing works ('pho' → phở, the way most people
 * type Vietnamese on a US keyboard). But the same collapse merges words that
 * are only distinguished BY their accents, and it did so at confidence 1.0:
 * 'bò' (beef) ground to avocado (via bơ), 'mỹ' (American) to mian (via mỳ),
 * 'cơm chay' (vegetarian rice) to scorched rice (via cơm cháy). A confident
 * wrong answer, on the one tier that admits no doubt.
 *
 * THE RULE, in one line: **when the user types accents, the accents are
 * evidence.** A span typed WITH accents is admitted at the exact tier only by
 * a surface that agrees on them; a surface that matches only after the accents
 * are stripped is not exact — it may still be reached by the lower-evidence
 * lanes (residue probe, dense link), which is where a genuine near-miss
 * belongs. A span typed WITHOUT accents carries no evidence either way, so
 * the folded key rules exactly as before and 'pho'/'bo' behave identically to
 * yesterday.
 *
 * THE SCOPE IS PER TOKEN, and that is the whole subtlety (red team, executed,
 * 2026-08-09 — the first cut of this rule compared the WHOLE span and was
 * refuted). PARTIAL accenting is the normal way Vietnamese is typed: 'phở bo',
 * 'bún bò hue', 'cà phê sữa da'. Under a whole-span test none of those agrees
 * with any banked surface, so the phrase was refused and SHREDDED into
 * confidently-wrong single tokens ('phở bo' → pho + avocado). Measured over
 * the vi gold corpus with exactly one word de-accented: 73 of 150 queries
 * changed grounding, 59 losing the right concept. So evidence is read where
 * the user actually supplied it — token by token. An accented token must
 * agree with the surface's token in the same position; a plain token asks
 * nothing, exactly as before.
 *
 * ONE RULE, BOTH DIRECTIONS OF TRAFFIC (2026-08-12). This lived in
 * gazetteer-spans.ts and governed only what a SEARCHER's query may ground on,
 * while the ingestion resolver enforced its own accent rule by comparing the
 * WHOLE string. They disagreed on the commonest real-world Vietnamese typing:
 * 'phở bo' against the banked 'phở bò' — the gazetteer admits it, the resolver
 * REFUSED it, so a mention a searcher can find was not being banked onto the
 * entity in the first place. The rule now lives with the folds it is made of
 * and both paths call it; gazetteer-spans.ts re-exports it for its consumers.
 *
 * Language-neutral and list-free: nothing here knows Vietnamese exists. It
 * falls out of `diacriticFold` vs `canonicalFold` — the two functions directly
 * above. The accent-agreeing case also settles the collision the fold created: when
 * `bơ` and a hypothetical `bò` both fold to 'bo', typing `bò` admits only the
 * one that matches raw.
 */
export interface SurfaceSpelling {
  /** canonicalFold(form) — the key the recall arm matched on. */
  folded: string;
  /** diacriticFold(form) — the same form with its accents intact. */
  diacritic: string;
}

/** The two readings of one stored or typed spelling: the coarse recall key and
 *  the accent-preserving one. Every consumer of the admission rule builds its
 *  evidence through this function, so "a spelling" has ONE construction. */
export function spellingOf(form: string): SurfaceSpelling {
  return { folded: canonicalFold(form), diacritic: diacriticFold(form) };
}

/** Does this spelling ASSERT anything about accents? The two folds disagree
 *  exactly when the text carries an accent (or an identity-bearing letter —
 *  đ, ł, ı) that survives folding. An input that carries one is EVIDENCE about
 *  which word was meant; an unaccented input asserts nothing. Every accent
 *  tier — query gazetteer, resolver tiers 1/2, the mint veto — turns on this
 *  one question, so it is one function, here, next to the folds. */
export function isAccented(text: string): boolean {
  return diacriticFold(text) !== canonicalFold(text);
}

/** The WHOLE-STRING accent veto for consumers that have no banked side to
 *  discriminate with (mint-time twins, dedupe sweeps, brand agreement):
 *  when BOTH names carry accent evidence and their accent-preserving folds
 *  conflict, they are different words — never the same entity — even though
 *  the accent-stripped fold (identity_key) says they collide. One-sided or
 *  absent accents assert nothing and pass, so de-diacritized typing keeps
 *  matching. Word-boundary prefix on the accented folds counts as agreement
 *  (the stub/qualifier merge shape, same agrees() shape as
 *  restaurantNamesAgree). This is the one shared home for the rule the
 *  resolver's mint veto states in place; every identity_key-grouped MERGE
 *  lane must consult it before treating a fold collision as identity (the
 *  2026-08-12 red team found two sweeps — restaurant same-name, food dedupe
 *  auto-merge — that merged accent-blind through this exact hole). */
export function accentsAgreeUnbanked(a: string, b: string): boolean {
  if (!isAccented(a) || !isAccented(b)) return true;
  const da = diacriticFold(a);
  const db = diacriticFold(b);
  return da === db || da.startsWith(`${db} `) || db.startsWith(`${da} `);
}

export function admitsAtExactTier(
  span: { folded: string; diacritic: string },
  spellings: readonly SurfaceSpelling[],
  /** Every ACCENT-FREE spelling the registry actually banks as a whole
   *  surface, as seen by this query. A plain token that appears here is a WORD
   *  the user spelled correctly, not a lazily de-accented one — see the
   *  accent-complete note in the rule below. */
  bankedPlainForms: ReadonlySet<string> = new Set(),
): boolean {
  // A FULLY PLAIN SPAN IS NOT A SPECIAL CASE (2026-08-09). This used to
  // return true immediately — "nothing accented ⇒ no evidence" — which is
  // right about ACCENTS and wrong about WORDS: a token the registry banks as
  // a complete accent-free surface of the request's language is a word the
  // user spelled, and the loop below already knows that (the accent-complete
  // arm). The shortcut simply denied it the chance to say so whenever the
  // WHOLE span happened to be plain, which is the commonest way a one-word
  // query arrives. Symptom: 'chay' (vegetarian, a banked vi word) also
  // exact-matched 'chảy' (runny) and a vegetarian-rice search came back
  // carrying a gooey constraint. Dropping the shortcut costs nothing for
  // 'pho'/'bo' — those are not banked plain forms, so every token still
  // 'continue's and the folded key decides exactly as before.
  const spanFolded = span.folded.split(' ');
  const spanTyped = span.diacritic.split(' ');
  return spellings.some((spelling) => {
    // Only a surface that actually matched THIS span's folded key can be its
    // exact match; the evidence set is wider than the match (it carries every
    // spelling the entity has) so the fold equality is re-checked here.
    if (spelling.folded !== span.folded) return false;
    const surface = spelling.diacritic.split(' ');
    // Token counts are equal whenever the folds are — accents never add or
    // remove a space. The guard is for the impossible case, and it falls back
    // to the whole-phrase comparison rather than inventing an alignment.
    if (
      surface.length !== spanTyped.length ||
      surface.length !== spanFolded.length
    ) {
      return spelling.diacritic === span.diacritic;
    }
    for (let i = 0; i < spanTyped.length; i++) {
      // Token typed WITHOUT accents ⇒ no evidence about this position ⇒ it
      // already matched on the fold and nothing more is asked of it.
      if (spanTyped[i] === spanFolded[i]) {
        // ACCENT-COMPLETE TOKEN. A plain token normally asks nothing — that is
        // what makes 'phở bo' reach phở bò. But when the registry banks that
        // exact accent-free string as a surface of its own, the token is a
        // WORD the user spelled completely, not an accent they skipped:
        // 'chay' (vegetarian) is banked; 'bo' is not. Without this, 'cơm chay'
        // (vegetarian rice) matches the scorched-rice surface 'cơm cháy'
        // through its second token and hands a diner a rice crust. The
        // discriminator is the DATA, not a word list of ours.
        if (!bankedPlainForms.has(spanTyped[i])) continue;
      }
      if (surface[i] !== spanTyped[i]) return false;
    }
    return true;
  });
}
