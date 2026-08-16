import { createHash } from 'crypto';
import {
  BaseClaimLaneAdapter,
  UNFOLDED_CLAIM_KEY,
} from '../content-processing/entity-resolver/claim-lane-adapter';

/** The lane name stored in `claim_verdicts.lane`. */
export const PLACE_GROUNDING_LANE = 'place_grounding';

/**
 * THE GROUNDING LANE'S SEAM — canonicalization ONLY, no grounding logic
 * (hearing-ledger adoption, 2026-08-13).
 *
 * Two claim shapes live in one lane, because the chooser answers two
 * differently-keyed questions and both are paid, irreversible judgments:
 *
 *   - A GROUNDING: "restaurant R is Google place P" — keyed by the directed
 *     (restaurantId, placeId) pair. The verdict's subject carries the
 *     ABSOLUTE location-row target state, so a crash between the verdict and
 *     the write is resumed by replaying stored bytes, never by re-judging.
 *   - A REJECTION: "none of THESE candidates is R" — keyed by the exact
 *     candidate set the chooser saw (restaurantId + the sorted place-id
 *     digest). A rejection is a ruling ABOUT A SET: a different retrieval
 *     tomorrow is a different question and is heard fresh, but re-enrichment
 *     that surfaces the identical set skips the judge — the re-roll this
 *     lane exists to stop.
 *
 * Both keys are made of opaque ids (entity uuid, Google place id, a digest
 * of place ids): no folded text anywhere, so UNFOLDED_CLAIM_KEY.
 *
 * NO DRAIN DRIVER EXISTS FOR THIS LANE (yet): hearings happen one
 * enrichment at a time, bounded by the enrichment queue and the terminal
 * money guard — the memory only ever REDUCES that spend. A future batch
 * re-hearing driver (a chooser-rule bump re-opening remembered rejections)
 * must route through `ClaimRehearingBudgetService.authorizeDrain`, the
 * wave-1 budget chokepoint. This lane also composes with the ghost-survival
 * law (plans/prompt-fleet-audit.md): a remembered rejection IS the
 * groundability-failure verdict the lifecycle gate reads.
 */
export type PlaceGroundingClaim =
  | { kind: 'grounding'; placeEntityId: string; googlePlaceId: string }
  | { kind: 'rejection'; placeEntityId: string; candidatePlaceIds: string[] };

/** The stable digest of a candidate set — sorted so the same places in a
 *  different retrieval order are the same question. */
export function candidateSetDigest(placeIds: readonly string[]): string {
  return createHash('sha256')
    .update([...placeIds].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
}

export class PlaceGroundingLaneAdapter extends BaseClaimLaneAdapter<PlaceGroundingClaim> {
  readonly lane = PLACE_GROUNDING_LANE;

  /** Opaque ids only — no folded text, so there is no fold to version and no
   *  fold change that could ever re-spell one of these keys. */
  readonly keyFoldVersion = UNFOLDED_CLAIM_KEY;

  canonicalClaimKey(claim: PlaceGroundingClaim): string {
    return claim.kind === 'grounding'
      ? `${claim.placeEntityId}|${claim.googlePlaceId}`
      : `${claim.placeEntityId}|set:${candidateSetDigest(claim.candidatePlaceIds)}`;
  }
}

export const placeGroundingLane = new PlaceGroundingLaneAdapter();
