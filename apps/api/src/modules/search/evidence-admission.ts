import {
  LINKER_TIER_FLOORS,
  type LinkerTierFloors,
} from './linker-calibration.generated';

/**
 * ONE EVIDENCE ENGINE, PER-CONSUMER FLOORS (spec §1.2, step 4).
 *
 * The recall core is already shared (EntityTextSearchService lattice); what
 * had drifted into two independently tuned implementations was the ADMISSION
 * question — "is this lexical evidence strong enough for YOUR purpose?".
 * The linker and search-time expansion price a mistake differently, so they
 * keep DIFFERENT floors, but the floors now live in one table with one
 * shape, read through one function — the calibration sweep re-fits one
 * authority, not two rate tables that silently diverge.
 *
 * - LINKING asserts identity (a wrong link = wrong results): sweep-derived
 *   per-tier floors (linker-calibration.generated.ts), margin + singleton
 *   branches, hard minimum.
 * - EXPANSION admits a pool member (a wrong admit is absorbed by provenance
 *   + score ranking): strong tiers pass outright; fuzzy/edit carry hand-set
 *   floors pending the calibration tail's re-measure.
 */

export interface EvidenceMatch {
  evidence: string;
  similarity?: number;
}

/** Evidence tiers that may NOMINATE a link — never weak/dense-only
 *  collisions (the ham/rum class). */
export const LINK_ELIGIBLE_EVIDENCE = new Set<string>([
  'exact',
  'prefix',
  'name',
  'alias',
  'fuzzy',
  // Honest-score tiers (P2): containment carries COVERAGE (term/name ratio),
  // edit carries 1 − lev/len — both flow through the same floors/margins.
  'contains',
  'edit',
]);

/** Tiers absent from the sweep table use this conservative fallback. */
export const LINKER_FALLBACK_FLOORS: LinkerTierFloors = {
  absolute: 0.82,
  singleton: 0.65,
};

export function linkerFloorsForTier(tier: string | null): LinkerTierFloors {
  return (tier && LINKER_TIER_FLOORS[tier]) || LINKER_FALLBACK_FLOORS;
}

/** Expansion widens the ACTUAL result set, so it admits only strong lexical
 *  evidence. 'contains' is STRONG here: the same-token menu-variant class
 *  ("al pastor taco" for "taco") measured 94% wanted. */
const EXPANSION_STRONG_EVIDENCE = new Set<string>([
  'exact',
  'prefix',
  'name',
  'alias',
  'contains',
]);
const EXPANSION_TIER_FLOORS: Record<string, number> = {
  fuzzy: 0.5,
  // ≈1 edit on a 4+ letter word — looser edits are typo junk.
  edit: 0.75,
};

/** The expansion consumer's admission question. */
export function admitsForExpansion(match: EvidenceMatch): boolean {
  if (EXPANSION_STRONG_EVIDENCE.has(match.evidence)) return true;
  const floor = EXPANSION_TIER_FLOORS[match.evidence];
  return floor != null && (match.similarity ?? 0) >= floor;
}
