import {
  LINKER_MARGIN,
  LINKER_MIN_FLOOR,
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

/**
 * THE LINK DECISION — ONE DEFINITION, IMPORTED (audit 2026-08-03, F1260).
 *
 * Five search harnesses re-implemented this rule in-script and each called its
 * copy "the live rule". That was genuinely necessary once: the harnesses
 * existed to compare a CANDIDATE policy against the INCUMBENT, and the
 * incumbent had no importable home. The rung was writing the incumbent as a
 * LITERAL — `const THRESH = 0.82 // the live 0.82 rule`. When the margin flip
 * shipped, the service moved on and the five replicas did not; they went on
 * reporting a policy nothing serves as the production baseline. One of them
 * was worse than stale: it imported the calibrated constants, used them, and
 * still printed `threshold=0.82` in its provenance line — a number it did not
 * use, over output that looked freshly generated.
 *
 * So: exactly one definition of the live decision exists, and everything that
 * evaluates the incumbent IMPORTS it. A harness holds CANDIDATE-policy code
 * only, because only the candidate has no home yet, and a future flip is a
 * one-line change here that every harness inherits.
 *
 * EXEMPT BY CONSTRUCTION: `scripts/search-harness/linker-calibration-sweep.ts`
 * GENERATES `linker-calibration.generated.ts`, so it must keep its own
 * derivation — unifying it would calibrate the constants against their own
 * output.
 */
export interface LinkDecisionInput {
  /** sparseSimilarity of the top eligible candidate. */
  topSim: number;
  /** sparseSimilarity of the runner-up, or 0 when there is none. */
  runnerSim: number;
  /** How many candidates survived link-eligibility filtering. */
  eligibleCount: number;
  /** The top candidate's sparse evidence tier (null → fallback floors). */
  tier: string | null;
}

export function linkerAdmits(input: LinkDecisionInput): boolean {
  const { topSim, runnerSim, eligibleCount, tier } = input;
  const floors = linkerFloorsForTier(tier);
  return (
    topSim >= LINKER_MIN_FLOOR &&
    (topSim >= floors.absolute ||
      // SINGLETON: an absent runner-up is infinite dominance, so a lower bar
      // is warranted — but only when nothing else competed.
      (eligibleCount === 1 && topSim >= floors.singleton) ||
      // MARGIN: dominance over the runner-up, self-normalizing, on
      // sparseSimilarity and NEVER rrf (rrf's rank gap is a fixed constant).
      (runnerSim > 0 && topSim >= LINKER_MARGIN * runnerSim))
  );
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
