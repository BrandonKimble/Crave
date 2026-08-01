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
  // ASCII-only strip, EXACTLY mirroring the SQL expression the non-food
  // adopt-probe uses (lower + regexp_replace('[^a-z0-9 ]') + squeeze) — the
  // TS key and the DB-computed key must agree byte-for-byte or the probe
  // can't find what the lock serialized.
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) {
    return base;
  }
  if (type === EntityType.food || type === EntityType.ingredient) {
    // VARIANT CLOSURE TO A FIXPOINT (red team F8, round 2 ⑥b): any bounded
    // expansion is asymmetric — two levels still gave 'curry' → min
    // 'curri' vs 'curries' → min 'curr'. Iterating to a true fixpoint
    // makes every member of a variant family land on the SAME closed set,
    // so min-over-closure is a genuine canonical fold. Converges fast
    // (variant rules only shrink/extend the head word by a few chars);
    // over-collapse costs lock contention, never correctness — this key
    // serializes and probes, it never asserts equality.
    const closure = new Set<string>(foodNameVariants(base));
    for (let size = -1; size !== closure.size; ) {
      size = closure.size;
      for (const variant of Array.from(closure)) {
        for (const next of foodNameVariants(variant)) {
          closure.add(next);
        }
      }
    }
    const collapsed = Array.from(closure).sort()[0] ?? base;
    return collapsed.split(' ').sort().join(' ');
  }
  return base;
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
