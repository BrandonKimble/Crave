import { EntityType } from '@prisma/client';
import { foodNameVariants } from './food-lemma';

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
/** Non-decomposable Latin letters. NFKD gives EVERY accented letter a
 *  canonical decomposition (e-acute -> e + combining acute), so the fold
 *  needs no hand-maintained accent list — it strips the combining marks and
 *  the base letter falls out for free, across Latin, Greek, Cyrillic and
 *  Vietnamese alike. These few letters are the exception: they carry no
 *  combining mark to strip and NFKD leaves them whole, so they get an
 *  explicit rule. Unlike the accent list this REPLACED, the set is finite and
 *  CLOSED — there is no stream of "one more non-decomposable Latin letter"
 *  the way there is an endless stream of new accented forms. */
const NON_DECOMPOSABLE: Record<string, string> = {
  ß: 'ss', // ß
  æ: 'ae', // æ
  œ: 'oe', // œ
  ø: 'o', // ø
  đ: 'd', // đ
  ł: 'l', // ł
  þ: 'th', // þ
  ð: 'd', // ð
  ħ: 'h', // ħ
  ŧ: 't', // ŧ
  ı: 'i', // ı (dotless i)
  ĸ: 'k', // ĸ
  ŋ: 'n', // ŋ
};
const NON_DECOMPOSABLE_RE = /[ßæœøđłþðħŧıĸŋ]/g;

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
export function canonicalFold(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Invisible modifiers that carry NO identity: format-controls (\p{Cf}:
      // ZWSP, ZWJ, ZWNJ, BOM …), the soft hyphen, and the VARIATION SELECTORS
      // (U+FE00–FE0F and the astral supplement — category Mn, so the
      // mark-preserving step below would otherwise keep them; a trailing emoji
      // VS16 must not change a name's identity). DELETE them (not space): the
      // old fold's punctuation arm turned a stray ZWSP inside "ta<ZWSP>co" into
      // a space, minting "ta co" as a twin of "taco" that no lock or index
      // could see (LLM extraction and pasteboards inject these).
      // eslint-disable-next-line no-misleading-character-class -- deliberate
      .replace(/[\p{Cf}\u00AD\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, '')
      // Strip Latin/Greek/Cyrillic/Vietnamese ACCENTS only (é==e). NOT CJK
      // voicing, NOT Arabic harakat, NOT Thai/Devanagari vowel signs — those
      // live outside these blocks and are handled by the mark-preserving
      // separator step below.
      .replace(COMBINING_DIACRITICS, '')
      .normalize('NFC')
      .toLowerCase()
      .replace(NON_DECOMPOSABLE_RE, (ch) => NON_DECOMPOSABLE[ch] ?? ch)
      .replace(/['’‘ʼ]/g, '')
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
  if (type === EntityType.food || type === EntityType.ingredient) {
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
  const closure = new Set<string>(foodNameVariants(token));
  for (let size = -1; size !== closure.size; ) {
    size = closure.size;
    for (const variant of Array.from(closure)) {
      for (const next of foodNameVariants(variant)) {
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
): { identityKey: string | null; identityKeySorted: string | null } {
  return {
    identityKey: canonicalFold(name) || null,
    identityKeySorted: entityIdentityKey(name, type),
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
  if (type === EntityType.food || type === EntityType.ingredient) {
    return foodNameVariants(name.toLowerCase().replace(/\s+/g, ' ').trim());
  }
  return [name];
}
