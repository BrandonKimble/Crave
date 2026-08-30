/**
 * THE MERGE-REASON TRIPWIRE (merge-batch audit 2026-08-30, action #4).
 *
 * The judge's stated reason is load-bearing evidence: in the 2026-08-30
 * entity_dedupe batch, 32 of 47 wrong EXECUTED merges announced — in their
 * own reason strings — the exact classes the doctrine bans ("category fold,
 * same restaurant", "specification fold", "format fold"). The reason was a
 * perfect tripwire and nothing read it.
 *
 * This module reads it. It is defense-in-depth BEHIND the prompt, wired at
 * every merge lane's verdict-recording chokepoint (entity dedupe AND
 * attribute merge — one shared implementation): a MERGE verdict whose reason
 * names a banned class is refused before it can enter the ledger as a
 * merge; the caller records a fail-closed 'hold' with a loud log instead.
 * Hold verdicts are never inspected — a judge may lawfully name a banned
 * class as its ground for KEEPING a pair apart.
 *
 * Banned classes (each a doctrine citation, not a heuristic):
 *   - category / specification / format folds — the entity-match prompt
 *     bans them unconditionally ("a subtype never folds into its category —
 *     in either direction").
 *   - broader / narrower — the same subtype-vs-category fold in the judge's
 *     other vocabulary.
 *   - same-restaurant folds — the corpus-global law (entity merge =
 *     IDENTITY only; plans/named-offering-fragmentation-study.md §4):
 *     "same restaurant" is never a ground for an entity merge. This also
 *     refuses "venue-name decoration, same restaurant" reasons at the
 *     SWEEP chokepoint — deliberately fail-closed: legacy venue-name
 *     residue is rare, re-extraction heals it, and a held pair costs a
 *     re-hearing while a wrong merge costs the corpus.
 */

interface BannedClass {
  name: string;
  pattern: RegExp;
}

const BANNED_CLASSES: readonly BannedClass[] = [
  { name: 'category-fold', pattern: /\bcategor(?:y|ical)\b/i },
  { name: 'specification-fold', pattern: /\bspecification\b/i },
  { name: 'format-fold', pattern: /\bformat\b/i },
  { name: 'broader-narrower', pattern: /\b(?:broader|narrower)\b/i },
  {
    name: 'same-restaurant-fold',
    pattern: /same[\s_-]*(?:restaurant|place|venue|kitchen)/i,
  },
  // The two decoration classes the 2026-08-30 doctrine change deleted from
  // the merge court (they belong to extraction pro-forms / emit-as-spoken):
  { name: 'narration-decoration', pattern: /\bnarration\b/i },
  { name: 'channel-wording', pattern: /\bchannel\b/i },
];

/**
 * Classify a MERGE verdict's reason. Returns the banned class name when the
 * reason names one (the caller must refuse the merge and record a hold), or
 * null when the reason is clean.
 */
export function bannedMergeReasonClass(reason: string): string | null {
  for (const banned of BANNED_CLASSES) {
    if (banned.pattern.test(reason)) return banned.name;
  }
  return null;
}

/** The hold reason a refused merge is recorded under — keeps the judge's
 *  original ground legible behind the refusal. */
export function refusedMergeHoldReason(
  bannedClass: string,
  originalReason: string,
): string {
  return `merge refused by reason tripwire (banned class: ${bannedClass}) — judge said: ${originalReason}`;
}
