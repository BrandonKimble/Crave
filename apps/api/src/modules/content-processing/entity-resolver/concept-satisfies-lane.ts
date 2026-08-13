import { BaseClaimLaneAdapter } from './claim-lane-adapter';

/** The lane name stored in `claim_verdicts.lane`. */
export const CONCEPT_SATISFIES_LANE = 'concept_satisfies';

/** The identity of one satisfies claim, as the adapter needs to see it. */
export interface SatisfiesClaimIdentity {
  fromEntityId: string;
  toEntityId: string;
}

/**
 * WHAT ONE SATISFIES CLAIM IS (H5 amendment (a)).
 *
 * A satisfies claim is one DIRECTED question: "if the user asked for A and we
 * showed them B instead, would they be satisfied?" — so, unlike the dedupe
 * lane one file over, the key does NOT sort. A→B and B→A are different
 * questions with different answers (`cheese` satisfies nobody who asked for
 * `cheese pizza`; the reverse is at least arguable), the prompt says so in as
 * many words ("Answer for THIS direction only — do not assume the reverse
 * also holds"), and `entity_satisfies` itself is keyed on the ordered
 * (from, to) pair. Sorting here would let one direction's verdict silently
 * answer for the other — the collision failure the base contract names.
 *
 * WHAT IS DELIBERATELY NOT IN THE KEY: the relation the judge answered.
 * 'satisfies', 'cousin' and 'reject' are the OUTCOMES of one claim, not three
 * claims — they live in `claim_verdicts.outcome`, and a re-hearing at a new
 * rule version supersedes whichever of them was ruled.
 */
export class ConceptSatisfiesLaneAdapter extends BaseClaimLaneAdapter<SatisfiesClaimIdentity> {
  readonly lane = CONCEPT_SATISFIES_LANE;

  canonicalClaimKey(claim: SatisfiesClaimIdentity): string {
    return `${claim.fromEntityId}>${claim.toEntityId}`;
  }
}

export const conceptSatisfiesLane = new ConceptSatisfiesLaneAdapter();
