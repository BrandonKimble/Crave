import type { PreparedProfilePresentationSnapshot } from '../shared/prepared-presentation-transaction';
import type {
  ProfileOpenSettleState,
  ProfileTransitionStatus,
} from './profile-transition-state-contract';
import type { PreparedProfilePresentationSettleEvent } from './profile-prepared-presentation-transaction-contract';

export type PreparedProfilePresentationSettleUpdate = {
  nextSettleState: ProfileOpenSettleState;
};

export const resolvePreparedProfilePresentationSettleUpdate = ({
  transitionStatus,
  snapshot,
  settleState,
  event,
}: {
  transitionStatus: ProfileTransitionStatus;
  snapshot: PreparedProfilePresentationSnapshot | null;
  settleState: ProfileOpenSettleState;
  event: PreparedProfilePresentationSettleEvent;
}): PreparedProfilePresentationSettleUpdate | null => {
  if (
    transitionStatus !== 'opening' ||
    snapshot == null ||
    snapshot.kind !== 'profile_open' ||
    settleState.transactionId !== snapshot.transactionId ||
    settleState.requestToken !== event.requestToken
  ) {
    return null;
  }

  if (event.type === 'sheet_settled') {
    const nextSettleState =
      event.snap === 'middle' && snapshot.targetSheetSnap === 'middle'
        ? {
            ...settleState,
            sheetSettled: true,
          }
        : settleState;
    return {
      nextSettleState,
    };
  }

  return {
    nextSettleState: {
      ...settleState,
      cameraSettled: true,
    },
  };
};
