import type { PreparedProfileCloseSnapshotPlan } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-snapshot-contract';
import {
  createPreparedProfileCloseSnapshot,
  resolvePreparedProfileCloseSnapshotPlan,
} from '../../../../navigation/runtime/app-route-profile-prepared-presentation-snapshot-contract';
import type { ProfileTransitionState } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { PreparedProfilePresentationTransaction } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import { resolvePreparedProfilePresentationTransaction } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-resolver';
import { applyPreparedProfileCloseSnapshot } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transition-runtime';

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export const closePreparedProfilePresentationTransaction = ({
  transition,
  createTransactionId,
  restaurantId,
  dismissBehavior,
  shouldClearSearchOnDismiss,
  isSearchOverlay,
  lastVisibleSheetSnap,
}: {
  transition: ProfileTransitionState;
  createTransactionId: () => string;
  restaurantId: string | null;
  dismissBehavior: 'restore' | 'clear';
  shouldClearSearchOnDismiss: boolean;
  isSearchOverlay: boolean;
  lastVisibleSheetSnap: Exclude<OverlaySheetSnap, 'hidden'> | null;
}): PreparedProfilePresentationTransaction => {
  const closePlan: PreparedProfileCloseSnapshotPlan = resolvePreparedProfileCloseSnapshotPlan({
    dismissBehavior,
    shouldClearSearchOnDismiss,
    isSearchOverlay,
    savedSheetSnap: transition.savedSheetSnap,
    lastVisibleSheetSnap,
  });
  const snapshot = createPreparedProfileCloseSnapshot(
    createTransactionId(),
    restaurantId,
    transition,
    {
      selectedRestaurantId: null,
      ...closePlan,
    }
  );
  applyPreparedProfileCloseSnapshot({
    transition,
    snapshot,
  });
  return resolvePreparedProfilePresentationTransaction(snapshot, {
    shouldForceSharedMiddleSnap: false,
  });
};
