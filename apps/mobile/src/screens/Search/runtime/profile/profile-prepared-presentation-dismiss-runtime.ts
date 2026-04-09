import type { ProfileTransitionStatus } from './profile-transition-state-contract';
import type { PreparedProfilePresentationTransaction } from './profile-prepared-presentation-transaction-contract';

export type PreparedProfileOverlayDismissUpdate = {
  nextDismissHandled: boolean;
  nextRequestSeq: number;
  transaction: PreparedProfilePresentationTransaction | null;
};

export const resolvePreparedProfileOverlayDismissUpdate = ({
  transitionStatus,
  preparedCompletionTransaction,
  dismissRequestToken,
  dismissHandled,
  requestSeq,
  eventRequestToken,
}: {
  transitionStatus: ProfileTransitionStatus;
  preparedCompletionTransaction: PreparedProfilePresentationTransaction | null;
  dismissRequestToken: number | null;
  dismissHandled: boolean;
  requestSeq: number;
  eventRequestToken: number | null;
}): PreparedProfileOverlayDismissUpdate | null => {
  if (dismissHandled) {
    return null;
  }
  if (transitionStatus === 'idle' && preparedCompletionTransaction == null) {
    return null;
  }
  if (dismissRequestToken !== eventRequestToken) {
    return null;
  }
  return {
    nextDismissHandled: true,
    nextRequestSeq: requestSeq + 1,
    transaction: preparedCompletionTransaction,
  };
};
