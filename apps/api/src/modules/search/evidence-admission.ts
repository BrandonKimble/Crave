import {
  LINKER_MARGIN,
  LINKER_MIN_FLOOR,
  LINKER_TIER_FLOORS,
  type LinkerTierFloors,
} from './linker-calibration.generated';
import { isDeployedEnv, resolveAppEnv } from '../../shared/config/app-env';

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

/* ------------------------------------------------------------------ *
 * THE DENSE ADMISSION TIER (multilingual M4 + R5-1 + R5-4)
 * ------------------------------------------------------------------ */

/**
 * WHY A SECOND ADMISSION PATH: the dense lane has always run, but its
 * candidates were structurally UNSELECTABLE — the linker's decider reads
 * only sparseSimilarity and LINK_ELIGIBLE_EVIDENCE excludes 'embedding'
 * (the ham/rum guard). That guard is right for English queries, where a
 * semantic neighbour outranking a lexical match is always a mistake. It is
 * wrong for a query the lexical lanes CANNOT SEE AT ALL — "pulpo" against
 * an English corpus produces zero sparse evidence, so there is nothing for
 * dense to outrank.
 *
 * So dense admission is GATED ON ABSENCE, never on strength: the caller
 * may only reach here when the span produced no sparse link AND the
 * analyzer says the query is non-Latin-script or confidently non-English.
 * The floors below then decide whether the dense answer is good enough.
 *
 * ⚠️ EVERY NUMBER IN THIS BLOCK IS A PLACEHOLDER. They are deliberately
 * conservative (a miss costs an unresolved span; a wrong admit costs wrong
 * search results) and are to be REPLACED WHOLESALE by the D3 gold-corpus
 * sweep — the same way linker-calibration.generated.ts replaced the
 * hand-set 0.82. Do not cite them as calibrated.
 */
export const DENSE_ADMISSION_PLACEHOLDER_FLOORS = {
  /** Absolute cosine floor. The 2026-08-03 adversarial run put correct
   *  cross-lingual matches at 0.75-0.85 and the known-bad тако→tako at
   *  0.821 — so cosine ALONE can never be the decision (hence rrfTop). */
  cosine: 0.72,
  /** Dominance over the runner-up, as a cosine DIFFERENCE — cosine spaces
   *  are compressed and a RATIO margin (the sparse rule) is meaningless
   *  here: 0.82/0.80 = 1.025 would "dominate" nothing. The runner-up is
   *  the best candidate with a DIFFERENT FOLDED NAME (measured on the
   *  mirror: "pulpo" returns octopus[ingredient] and octopus[food] at an
   *  identical 0.753 — the food/ingredient twin is ONE answer, and a
   *  naive runner-up margin rejects every concept that has a twin). */
  margin: 0.02,
  /**
   * RANK AGREEMENT (R5-1), stated as a rank window rather than "must be
   * the RRF top". Requiring the fused #1 was measured DEAD on the mirror:
   * this tier is reached precisely when sparse produced no ADMISSIBLE
   * link, but the fused list is still topped by INADMISSIBLE sparse noise
   * ("pulpo" → "grapefruit pulp" fuzzy 0.667, "kabuli pulao" edit 0.800),
   * so the dense answer can never be #1 by construction. The honest rank
   * condition is that dense's best is near the top of the FUSED order —
   * still a rank fact, never a cross-space score comparison.
   */
  rrfRankMax: 3,
  /** A type-mismatched candidate must beat an on-type one by this much
   *  before it is even considered (R5-4). */
  typeMismatchMargin: 0.05,
} as const;

/**
 * THE DENSE FLOORS IN EFFECT — resolved ONCE, at module load, never per call.
 *
 * The gold-corpus calibration sweep varies these via DENSE_SWEEP_* env vars.
 * That override is a DEV/HARNESS affordance and must never move a floor in a
 * deployed environment: reading `process.env` inside `denseAdmits` (as this
 * did) meant a stray Railway variable silently shifted production admission
 * with no log line — the exact class the app-env helper exists to close (red
 * team 2026-08-04, executed: DENSE_SWEEP_COSINE=0.99 dropped real prod
 * groundings). So the overrides apply ONLY when `!isDeployedEnv`, are read
 * once here, and announce themselves — a calibration run is loud, prod is
 * pinned to the placeholders until the sweep replaces them wholesale.
 */
type DenseFloors = {
  cosine: number;
  margin: number;
  rrfRankMax: number;
  typeMismatchMargin: number;
};
function resolveDenseFloors(): DenseFloors {
  if (isDeployedEnv(resolveAppEnv())) {
    return DENSE_ADMISSION_PLACEHOLDER_FLOORS;
  }
  const num = (v: string | undefined) =>
    v && Number.isFinite(Number(v)) ? Number(v) : undefined;
  const overrides = {
    cosine: num(process.env.DENSE_SWEEP_COSINE),
    rrfRankMax: num(process.env.DENSE_SWEEP_RANK),
    margin: num(process.env.DENSE_SWEEP_MARGIN),
  };
  const active = Object.entries(overrides).filter(([, v]) => v !== undefined);
  if (active.length) {
    console.warn(
      `[dense-floors] SWEEP OVERRIDE active (dev only): ${active
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    );
  }
  return {
    ...DENSE_ADMISSION_PLACEHOLDER_FLOORS,
    ...(overrides.cosine !== undefined ? { cosine: overrides.cosine } : {}),
    ...(overrides.rrfRankMax !== undefined
      ? { rrfRankMax: overrides.rrfRankMax }
      : {}),
    ...(overrides.margin !== undefined ? { margin: overrides.margin } : {}),
  };
}

const DENSE_ADMISSION_FLOORS = resolveDenseFloors();

/**
 * R5-1: FUSION IS BY RANK, NEVER BY SCORE. RRF (k=60, the parameter-free
 * 2025-26 default, already the constant retrieveCandidates fuses with) is
 * what makes "dense agrees with sparse" expressible without comparing a
 * cosine to a trigram similarity — the тако 0.821-beats-taco-0.751 hazard
 * is exactly that comparison. `rrfTop` below means "this candidate is the
 * top of the FUSED list", which is a rank fact, not a score fact.
 */
export const RRF_K = 60;

/** Attribute-shaped types. A constraint span ("sin gluten", "vegetariano")
 *  names one of these; a restaurant proper noun that merely CONTAINS the
 *  constraint words ("Senza Gluten") is a type confusion, not a match. */
const ATTRIBUTE_TYPES = new Set<string>([
  'food_attribute',
  'restaurant_attribute',
]);

export interface DenseDecisionInput {
  /** Cosine of the top dense candidate. */
  topCosine: number;
  /** Cosine of the best dense candidate with a DIFFERENT folded name, or
   *  0 when there is none (see `margin`). */
  runnerCosine: number;
  /** 0-based rank of the top dense candidate in the RRF-fused list. */
  rrfRank: number;
  /** Entity type of the top dense candidate. */
  candidateType: string;
  /**
   * The span's own type expectation, when the query itself carries one:
   * 'attribute' when a sibling candidate of attribute type exists for the
   * same span (the constraint reading is available), else null. Never
   * guessed from the words.
   */
  spanTypeAffinity: 'attribute' | null;
  /** Type of input the caller is resolving ('restaurant' relaxes the
   *  restaurant guard, exactly as the sparse rule does). */
  inputType: string;
}

/**
 * R5-4 TYPE-AWARE ADMISSION, stated conservatively: dense may never link a
 * RESTAURANT proper noun for a non-restaurant input, and when the span has
 * an attribute reading available, a non-attribute dense candidate must not
 * win. "sin gluten" → the restaurant "Senza Gluten" is refused twice over.
 */
export function denseTypeAdmits(
  input: Pick<
    DenseDecisionInput,
    'candidateType' | 'spanTypeAffinity' | 'inputType'
  >,
): boolean {
  if (
    input.candidateType === 'restaurant' &&
    input.inputType !== 'restaurant'
  ) {
    return false;
  }
  if (
    input.spanTypeAffinity === 'attribute' &&
    !ATTRIBUTE_TYPES.has(input.candidateType)
  ) {
    return false;
  }
  return true;
}

/** The dense tier's admission question — the mirror of linkerAdmits, with
 *  its own floors and its own (rank-based) dominance test. */
export function denseAdmits(input: DenseDecisionInput): boolean {
  if (!denseTypeAdmits(input)) return false;
  const floors = DENSE_ADMISSION_FLOORS;
  if (input.topCosine < floors.cosine) return false;
  // ALL THREE conditions, deliberately: the cosine floor says
  // "semantically close enough to consider"; the RRF rank says "the fused
  // ranking agrees this is near the top"; the margin says "and no
  // DIFFERENT answer was nearly as good". A single-signal admission is
  // how a confident wrong neighbour gets in.
  if (input.rrfRank >= floors.rrfRankMax) return false;
  if (
    input.runnerCosine > 0 &&
    input.topCosine - input.runnerCosine < floors.margin
  ) {
    return false;
  }
  return true;
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
