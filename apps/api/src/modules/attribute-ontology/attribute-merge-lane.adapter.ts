import {
  BaseClaimLaneAdapter,
  UNFOLDED_CLAIM_KEY,
} from '../content-processing/entity-resolver/claim-lane-adapter';

/**
 * THE ATTRIBUTE-MERGE LANE'S SEAM — canonicalization ONLY, no merge logic
 * (the entity-dedupe adapter's pattern, applied to the attribute vocabulary).
 *
 * A merge claim is about a PAIR of attribute entities, and a pair is
 * unordered: "is A the same claim as B" and "is B the same claim as A" are
 * one question, so they must be one key — otherwise a pair judged in one
 * direction is re-heard, and re-paid for, whenever the candidate generator
 * emits it the other way round.
 *
 * Nothing here decides anything. The lane's policy (candidates, judge,
 * plan, settle, resume) lives in AttributeDedupeMergeService; its rule
 * version lives in attribute-merge-rule.ts.
 */
export const ATTRIBUTE_MERGE_LANE = 'attribute_merge';

export interface AttributePairClaim {
  entityId: string;
  otherEntityId: string;
}

export class AttributeMergeLaneAdapter extends BaseClaimLaneAdapter<AttributePairClaim> {
  readonly lane = ATTRIBUTE_MERGE_LANE;

  /** A pair of entity ids — no folded text, so no fold to version. */
  readonly keyFoldVersion = UNFOLDED_CLAIM_KEY;

  canonicalClaimKey(claim: AttributePairClaim): string {
    const [first, second] = [claim.entityId, claim.otherEntityId].sort();
    return `${first}|${second}`;
  }
}

export const attributeMergeLane = new AttributeMergeLaneAdapter();
