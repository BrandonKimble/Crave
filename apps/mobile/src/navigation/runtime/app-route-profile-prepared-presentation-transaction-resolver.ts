import type { PreparedProfilePresentationSnapshot } from './app-route-profile-prepared-presentation-snapshot-contract';
import {
  createPreparedProfilePresentationTransaction,
  type PreparedProfilePresentationTransaction,
} from './app-route-profile-prepared-presentation-transaction-contract';

export type ResolvePreparedProfilePresentationTransactionOptions = {
  profileOpenStatus?: 'opening' | 'open';
};

export const resolvePreparedProfilePresentationTransaction = (
  snapshot: PreparedProfilePresentationSnapshot,
  options: ResolvePreparedProfilePresentationTransactionOptions
): PreparedProfilePresentationTransaction => {
  const { profileOpenStatus } = options;
  if (snapshot.kind === 'profile_open') {
    const selectedRestaurantId = snapshot.selectedRestaurantId ?? snapshot.restaurantId;
    return createPreparedProfilePresentationTransaction({
      transactionId: snapshot.transactionId,
      preShellCommands: {
        ...(snapshot.targetCamera
          ? {
              targetCamera: snapshot.targetCamera,
            }
          : {}),
        ...(snapshot.preparedCameraPadding != null
          ? {
              profileCameraPadding: snapshot.preparedCameraPadding,
            }
          : {}),
        highlightedRestaurantId: selectedRestaurantId,
      },
      shellStateExecution: {
        transitionStatus: profileOpenStatus ?? 'open',
        routeIntent: {
          type: 'open_profile_restaurant_route',
          restaurantId: selectedRestaurantId,
          targetSheetSnap: snapshot.targetSheetSnap ?? 'middle',
          targetCamera: null,
          preserveSheetMotion: snapshot.preserveSheetMotionOnOpen,
        },
      },
    });
  }

  return createPreparedProfilePresentationTransaction({
    transactionId: snapshot.transactionId,
    shellCommands: {
      clearHighlightedRestaurantId: true,
    },
    shellStateExecution: {
      transitionStatus: 'closing',
      routeIntent: {
        type: 'close_profile_restaurant_route',
        restoreCamera: snapshot.restoreCamera,
        shellTarget: snapshot.shellTarget === 'default' ? 'default' : 'results',
        targetSheetSnap: snapshot.targetSheetSnap === 'collapsed' ? 'collapsed' : null,
      },
    },
  });
};
