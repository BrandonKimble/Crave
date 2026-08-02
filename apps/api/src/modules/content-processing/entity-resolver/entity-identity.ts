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
export function entityIdentityKey(name: string, type: EntityType): string {
  // THE canonical fold, mirrored byte-for-byte by every SQL site
  // (identity_key generated column, probes, sweeps, migrations):
  // apostrophes STRIP (Phil's == Phils), all other punctuation becomes a
  // SPACE (tex-mex == tex mex — round-6 red team: strip-to-nothing split
  // hyphenated cuisines instead of uniting them).
  const base = name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!base) {
    return base;
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
