import type { PendingOnboardingCompletion } from '../../store/onboardingStore';

/**
 * THE REPLAY DECISION (F810), pure so it can be proved without a device.
 *
 * A completion that the server never confirmed is persisted (see
 * `pendingServerCompletion`) and re-sent on the next authenticated launch. The
 * rules are deliberately few, because every extra condition is another way for
 * the payload to be quietly dropped — which is the defect this exists to end:
 *
 *   - the user must be SIGNED IN (an anonymous replay would land on nobody),
 *   - there must be something to replay,
 *   - one attempt in flight at a time,
 *   - it NEVER expires. A payload we cannot land today is still the only copy
 *     of the user's answers; dropping it after N days is the silent loss again,
 *     just slower.
 */
export type OnboardingReplayDecision =
  | { kind: 'replay'; payload: PendingOnboardingCompletion }
  | { kind: 'skip'; reason: 'nothing_pending' | 'not_signed_in' | 'already_in_flight' };

export const decideOnboardingCompletionReplay = (input: {
  pending: PendingOnboardingCompletion | null;
  isSignedIn: boolean;
  inFlight: boolean;
}): OnboardingReplayDecision => {
  if (input.pending == null) {
    return { kind: 'skip', reason: 'nothing_pending' };
  }
  if (!input.isSignedIn) {
    return { kind: 'skip', reason: 'not_signed_in' };
  }
  if (input.inFlight) {
    return { kind: 'skip', reason: 'already_in_flight' };
  }
  return { kind: 'replay', payload: input.pending };
};
