import { BaseClaimLaneAdapter } from './claim-lane-adapter';

/**
 * THE DEDUPE LANE'S SEAM — canonicalization ONLY, no dedupe logic
 * (H5, 2026-08-12).
 *
 * The dedupe judge is a second lane that pays for an answer and then mutates
 * the corpus, and it will move onto this ledger on its own schedule. What
 * lands now is the part the abstraction has to be able to express, proven by
 * an adapter that actually compiles against the contract rather than by an
 * assurance that it would: a dedupe claim is about a PAIR of entities, and a
 * pair is unordered.
 *
 * SORTING IS THE WHOLE POINT. "Is A the same concept as B?" and "is B the
 * same concept as A?" are one question, so they must be one key — otherwise
 * a merge judged in one direction is re-heard, and re-paid for, whenever the
 * candidate generator happens to emit the pair the other way round. That this
 * is a DIFFERENT canonicalization from the word lane's is why amendment (a)
 * made `canonicalClaimKey` abstract: no default could have been right for
 * both, and a plausible default is how the word lane spent months
 * adjudicating on the wrong key.
 *
 * Nothing here decides anything. There is no judge call, no merge, and no
 * effect — deliberately: a stub that quietly implemented half a policy would
 * be worse than none when the real lane arrives.
 */
export const ENTITY_DEDUPE_LANE = 'entity_dedupe';

export interface EntityPairClaim {
  entityId: string;
  otherEntityId: string;
}

export class EntityDedupeLaneAdapter extends BaseClaimLaneAdapter<EntityPairClaim> {
  readonly lane = ENTITY_DEDUPE_LANE;

  canonicalClaimKey(claim: EntityPairClaim): string {
    const [first, second] = [claim.entityId, claim.otherEntityId].sort();
    return `${first}|${second}`;
  }
}

export const entityDedupeLane = new EntityDedupeLaneAdapter();
