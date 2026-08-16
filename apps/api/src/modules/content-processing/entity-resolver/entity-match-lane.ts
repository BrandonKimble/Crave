import { BaseClaimLaneAdapter } from './claim-lane-adapter';
import { diacriticFold, FOLD_ALGORITHM_VERSION } from './entity-identity';

/** The lane name stored in `claim_verdicts.lane`. */
export const ENTITY_MATCH_LANE = 'entity_match';

/**
 * THE RESOLUTION-MATCH LANE'S SEAM — canonicalization ONLY, no resolution
 * logic (hearing-ledger adoption, 2026-08-13).
 *
 * The claim is the DIRECTED question the tier-3 judge is actually asked, one
 * candidate at a time: "is this extracted TERM the same real-world <kind> as
 * this PERSISTED candidate entity?" The judge answers over a shortlist, but
 * the shortlist is retrieval, not identity — the same term recalled tomorrow
 * gets a different shortlist, and a verdict keyed on the set would never be
 * found again. Keyed per (term, candidate) pair, a 'match' is reusable
 * whenever the candidate is recalled again, and a judged 'new' removes that
 * candidate from every future docket at this rule version.
 *
 * DIRECTED, not sorted: the term is free text from an extraction, the
 * candidate is an entity id — there is no symmetric twin to canonicalize
 * away (contrast entity-dedupe-lane.adapter.ts, whose two sides are both
 * entity ids).
 *
 * THE TERM IS SPELLED BY THE ACCENT-PRESERVING FOLD (`diacriticFold`), the
 * same claim-unit doctrine the word-claim lane proved the hard way
 * (surface-claim-unit.integration.spec.ts): bò and bơ against one candidate
 * are TWO questions, and `canonicalFold` would have collapsed them into one
 * remembered answer. Case, punctuation and invisible characters still fold —
 * "Bánh Mì" and "bánh mì" are one claim — but accents are identity.
 *
 * NO DRAIN DRIVER EXISTS FOR THIS LANE (yet): hearings happen demand-side,
 * one document batch at a time, bounded by the collection pipeline itself —
 * the memory only ever REDUCES that spend. If a batch re-hearing driver is
 * ever built (a rule bump re-opening the judged corpus), it must route
 * through `ClaimRehearingBudgetService.authorizeDrain`, the wave-1 budget
 * chokepoint.
 *
 * The intra-batch overlay judge (entity-resolution.service.ts, the
 * chicken-patty/patties class) is deliberately NOT on this lane: its
 * candidates are this run's UNPERSISTED primaries, identified only by
 * tempIds that die with the batch — there is no durable identity to key a
 * verdict on, and the question ("is this mention the same as the entity the
 * previous loop iteration is about to mint?") cannot recur across runs.
 */
export interface EntityMatchClaim {
  /** The judge's `kind` — part of the question: the same string can name a
   *  restaurant and a dish, and those are different claims. */
  kind: 'place' | 'item' | 'ingredient';
  /** The extracted term as the judge sees it (normalizedName). */
  term: string;
  /** The persisted candidate entity the term is judged against. */
  candidateEntityId: string;
}

export class EntityMatchLaneAdapter extends BaseClaimLaneAdapter<EntityMatchClaim> {
  readonly lane = ENTITY_MATCH_LANE;

  /** The key contains folded text (the term), so the fold's version is part
   *  of the claim identity — a fold bump re-spells every key and must re-open
   *  the corpus loudly rather than orphan it (D-census, claim-lane-adapter). */
  readonly keyFoldVersion = FOLD_ALGORITHM_VERSION;

  canonicalClaimKey(claim: EntityMatchClaim): string {
    return `${claim.kind}|${diacriticFold(claim.term)}|${claim.candidateEntityId}`;
  }
}

export const entityMatchLane = new EntityMatchLaneAdapter();
