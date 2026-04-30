import type { PreparedProfilePresentationSnapshot } from './app-route-profile-prepared-presentation-snapshot-contract';
import {
  createPreparedProfilePresentationTransaction,
  type PreparedProfilePresentationTransaction,
} from './app-route-profile-prepared-presentation-transaction-contract';

export type ResolvePreparedProfilePresentationTransactionOptions = {
  shouldForceSharedMiddleSnap: boolean;
  profileOpenStatus?: 'opening' | 'open';
};

export const resolvePreparedProfilePresentationTransaction = (
  snapshot: PreparedProfilePresentationSnapshot,
  options: ResolvePreparedProfilePresentationTransactionOptions
): PreparedProfilePresentationTransaction => {
  const { shouldForceSharedMiddleSnap, profileOpenStatus } = options;
  if (snapshot.kind === 'profile_open') {
    const selectedRestaurantId = snapshot.selectedRestaurantId ?? snapshot.restaurantId;
    return createPreparedProfilePresentationTransaction({
      transactionId: snapshot.transactionId,
      preShellCommands: {
        ...(snapshot.targetCamera
          ? {
              profileCameraPadding: snapshot.targetCamera?.padding ?? null,
            }
          : {}),
        ...(shouldForceSharedMiddleSnap
          ? {
              forceSharedMiddleSnap: true,
            }
          : {}),
      },
      shellStateExecution: {
        transitionStatus: profileOpenStatus ?? (snapshot.restoreSheetSnap ? 'opening' : 'open'),
        routeIntent: {
          type: 'open_profile_restaurant_route',
          restaurantId: selectedRestaurantId,
          targetSheetSnap: snapshot.targetSheetSnap ?? 'middle',
          targetCamera: snapshot.targetCamera,
        },
      },
    });
  }

  return createPreparedProfilePresentationTransaction({
    transactionId: snapshot.transactionId,
    ...(snapshot.shellTarget === 'default'
      ? {
          preShellCommands: {
            resultsSheetCommand: {
              type: 'hide',
            },
          },
        }
      : {}),
    shellStateExecution: {
      transitionStatus: 'closing',
      routeIntent: {
        type: 'close_profile_restaurant_route',
        restoreCamera: snapshot.restoreCamera,
      },
    },
  });
};
