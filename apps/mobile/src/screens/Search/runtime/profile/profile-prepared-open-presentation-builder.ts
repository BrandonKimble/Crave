import { createPreparedProfileOpenSnapshot } from '../shared/prepared-presentation-transaction';
import type { CameraSnapshot, ProfileTransitionState } from './profile-transition-state-contract';
import type { PreparedProfilePresentationTransaction } from './profile-prepared-presentation-transaction-contract';
import { applyPreparedProfileOpenSnapshot } from './profile-prepared-presentation-transition-runtime';
import { resolvePreparedProfilePresentationTransaction } from './profile-prepared-presentation-transaction-resolver';

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
  const snapshot = createPreparedProfileOpenSnapshot(
    createTransactionId(),
    restaurantId,
    transition,
    {
      selectedRestaurantId: restaurantId,
      targetCamera,
    }
  );
  applyPreparedProfileOpenSnapshot({
    transition,
    snapshot,
    status,
  });
  return resolvePreparedProfilePresentationTransaction(snapshot, {
    shouldForceSharedMiddleSnap,
    profileOpenStatus: status,
  });
};
