import { BaseClaimLaneAdapter } from './claim-lane-adapter';
import { surfaceClaimKey } from './entity-surface.service';
import { FOLD_ALGORITHM_VERSION } from './entity-identity';

/** The lane name stored in `claim_verdicts.lane`. Matches the third-lane
 *  shape proof in claim-hearing-ledger.integration.spec.ts. */
export const RESTAURANT_NAME_LANE = 'restaurant_name';

/**
 * The identity of a restaurant-name claim: ONE surface form asking to be a
 * name of ONE restaurant entity.
 */
export interface RestaurantNameClaim {
  /** The restaurant entity the form claims to name. */
  entityId: string;
  /** The surface form under judgment, verbatim. */
  form: string;
}

/**
 * WHAT ONE RESTAURANT-NAME CLAIM IS (H5 amendment (a) — the C4a lane).
 *
 * The claim is "this form is genuinely a name of this specific place". Two
 * parts, both load-bearing:
 *
 *   - THE FORM IS `surfaceClaimKey`, NOT the recall fold. Case and punctuation
 *     fold (Chili's == chilis as a spelling question), accents are PRESERVED —
 *     the recall fold destroys them on purpose for retrieval and was never an
 *     identity; keying hearings on it is the exact defect the word lane spent
 *     months paying for (bò/bơ/bó as one case).
 *   - THE ENTITY is the subject. "best" on the ghost restaurant "Best" and
 *     "best" on some real venue named Best Pizza are DIFFERENT claims with
 *     different answers; a verdict on one may never answer for the other.
 *
 * NO LOCALE in the key: a restaurant's name is not a per-language question the
 * way a word→concept claim is — the place is called what it is called, and the
 * census feeds forms regardless of which docket surfaced them. A verdict
 * therefore answers for every locale's copy of the same form on the same
 * entity, which is the correct scope for "is this a name at all".
 *
 * NOT IN THE KEY: which question was asked. "May this form become a name?" and
 * "should it still be one?" are two questions about one claim; splitting them
 * would let a wrong YES hide from its own retraction — the asymmetry the
 * ledger exists to end.
 */
export class RestaurantNameLaneAdapter extends BaseClaimLaneAdapter<RestaurantNameClaim> {
  readonly lane = RESTAURANT_NAME_LANE;

  /** The key contains folded text (`surfaceClaimKey` is the versioned
   *  diacritic fold), so the fold's version is part of the claim's identity —
   *  a fold bump re-opens the corpus through the budgeted drain instead of
   *  orphaning every stored verdict. */
  readonly keyFoldVersion = FOLD_ALGORITHM_VERSION;

  canonicalClaimKey(claim: RestaurantNameClaim): string {
    return `${claim.entityId}|${surfaceClaimKey(claim.form)}`;
  }
}

export const restaurantNameLane = new RestaurantNameLaneAdapter();
