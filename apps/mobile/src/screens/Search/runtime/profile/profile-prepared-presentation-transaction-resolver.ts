import type { PreparedProfilePresentationSnapshot } from '../shared/prepared-presentation-transaction';
import {
  createPreparedProfilePresentationTransaction,
  type PreparedProfilePresentationTransaction,
} from './profile-prepared-presentation-transaction-contract';

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
              targetCamera: snapshot.targetCamera,
            }
          : {}),
        ...(shouldForceSharedMiddleSnap
          ? {
              forceSharedMiddleSnap: true,
            }
          : {}),
        ...(snapshot.targetSheetSnap
          ? {
              restaurantSheetCommand: {
                type: 'request' as const,
                snap: snapshot.targetSheetSnap,
              },
            }
          : {}),
      },
      shellStateExecution: {
        transitionStatus: profileOpenStatus ?? (snapshot.restoreSheetSnap ? 'opening' : 'open'),
        routeIntent: {
          type: 'show_search_restaurant_route',
          restaurantId: selectedRestaurantId,
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
        type: 'hide_search_restaurant_route',
      },
    },
  });
};
