import type { PreparedProfileCloseSnapshotPlan } from '../shared/prepared-presentation-transaction';
import {
  createPreparedProfileCloseSnapshot,
  resolvePreparedProfileCloseSnapshotPlan,
} from '../shared/prepared-presentation-transaction';
import type { ProfileTransitionState } from './profile-transition-state-contract';
import type { PreparedProfilePresentationTransaction } from './profile-prepared-presentation-transaction-contract';
import { applyPreparedProfileCloseSnapshot } from './profile-prepared-presentation-transition-runtime';
import { resolvePreparedProfilePresentationTransaction } from './profile-prepared-presentation-transaction-resolver';

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
