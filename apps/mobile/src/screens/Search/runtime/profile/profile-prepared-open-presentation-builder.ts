import { createPreparedProfileOpenSnapshot } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-snapshot-contract';
import type {
  CameraSnapshot,
  ProfileTransitionState,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { PreparedProfilePresentationTransaction } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import { resolvePreparedProfilePresentationTransaction } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-resolver';
import { applyPreparedProfileOpenSnapshot } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transition-runtime';

export const openPreparedProfilePresentationTransaction = ({
  transition,
  createTransactionId,
  restaurantId,
  targetCamera,
  shouldForceSharedMiddleSnap,
  status,
}: {
  transition: ProfileTransitionState;
  createTransactionId: () => string;
  restaurantId: string;
  targetCamera: CameraSnapshot | null | undefined;
  shouldForceSharedMiddleSnap: boolean;
  status: 'opening' | 'open';
}): PreparedProfilePresentationTransaction => {
  const shouldPreserveSheetMotion = !shouldForceSharedMiddleSnap;
  const snapshot = createPreparedProfileOpenSnapshot(
    createTransactionId(),
    restaurantId,
    transition,
    {
      selectedRestaurantId: restaurantId,
      targetCamera,
      preserveSheetMotionOnOpen: shouldPreserveSheetMotion,
    }
  );
  applyPreparedProfileOpenSnapshot({
    transition,
    snapshot,
    status,
  });
  return resolvePreparedProfilePresentationTransaction(snapshot, {
    profileOpenStatus: status,
  });
};
