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
/** Accent translate table (final red team F3): the fold's `[^a-z0-9]+`
 *  arm turned every accented char into a SPACE, so "crème brûlée" and
 *  "creme brulee" held different keys and the unique index + advisory
 *  lock were both blind to the twin. One explicit 1:1 map, mirrored
 *  byte-for-byte by the DB's crave_fold() function — do not use NFKD
 *  here, the SQL side can't, and the two MUST stay identical. */
const FOLD_ACCENTS_FROM =
  'àáâãäåāăąçćčèéêëēĕėęěìíîïĩīĭįñńňòóôõöøōŏőùúûüũūŭůűųýÿžźżšśşğłđřťßæœ';
const FOLD_ACCENTS_TO =
  'aaaaaaaaaccceeeeeeeeeiiiiiiiinnnooooooooouuuuuuuuuuyyzzzsssgldrtsao';
const FOLD_ACCENT_MAP: Record<string, string> = {};
for (let i = 0; i < FOLD_ACCENTS_FROM.length; i += 1) {
  FOLD_ACCENT_MAP[FOLD_ACCENTS_FROM[i]] = FOLD_ACCENTS_TO[i];
}

/** THE canonical fold — THE ONLY IMPLEMENTATION (ideal-shape pass,
 *  2026-08-02). It used to be mirrored byte-for-byte by a DB function
 *  (crave_fold) feeding a GENERATED column, but Unicode character
 *  classes are PLATFORM-DEPENDENT in Postgres ([:alnum:] folds
 *  Devanagari differently on glibc PG17 than on mac PG18 — measured),
 *  so a SQL mirror can never be trusted across environments. identity_key
 *  is now APP-WRITTEN from this function (like identity_key_sorted);
 *  the DB only stores and uniquely indexes it.
 *  LANGUAGE-AGNOSTIC: lower → strip the Turkish-İ combining dot →
 *  Latin accents fold (é==e) → apostrophes STRIP, straight AND curly
 *  (Phil's == Phils == Phil’s) → every non-letter/digit run OF ANY
 *  SCRIPT becomes ONE SPACE (tex-mex == tex mex; Пельменная and
 *  食べ放題 keep their characters and are real, distinct identities) →
 *  trim. Only genuinely letterless names (emoji-only, '!!!') fold to
 *  '' and fall to the nfc: degenerate fallback below. */
export function canonicalFold(name: string): string {
  return (
    name
      .toLowerCase()
      // Turkish dotted capital İ: JS toLowerCase yields "i" + combining
      // dot U+0307, which the punctuation arm turned into a SPACE — the
      // lock key diverged from SQL lower('İ')='i' and twin restaurants
      // minted live (final-final red team HIGH-2). Postgres produces no
      // combining mark here; strip it so the mirrors stay byte-identical.
      .replace(/\u0307/g, '')
      .replace(/[\u0080-\uffff]/g, (ch) => FOLD_ACCENT_MAP[ch] ?? ch)
      .replace(/['’‘ʼ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  );
}

export function entityIdentityKey(name: string, type: EntityType): string {
  const base = canonicalFold(name);
  if (!base) {
    // DEGENERATE NAMES ONLY (post-unicode-fold this is emoji-only /
    // punctuation-only names — real scripts all survive the fold now).
    // Distinct per name, deterministic for the lock; probes skip it.
    return `nfc:${name.normalize('NFC').toLowerCase().trim()}`;
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
