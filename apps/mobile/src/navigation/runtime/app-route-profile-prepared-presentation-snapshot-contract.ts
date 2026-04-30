import type {
  CameraSnapshot,
  ProfileTransitionState,
} from './app-route-profile-transition-state-contract';

export type PreparedProfilePresentationSnapshot = {
  transactionId: string;
  kind: 'profile_open' | 'profile_close';
  restaurantId: string | null;
  selectedRestaurantId: string | null;
  shellTarget: 'profile' | 'results' | 'default';
  targetCamera: CameraSnapshot | null;
  targetSheetSnap: 'middle' | 'collapsed' | null;
  restoreSheetSnap: 'expanded' | 'middle' | 'collapsed' | null;
  restoreResultsSheetSnap: 'expanded' | 'middle' | 'collapsed' | null;
  restoreCamera: CameraSnapshot | null;
  restoreResultsScrollOffset: number | null;
  shouldClearSearchOnClose: boolean;
};

export type PreparedProfileCloseSnapshotPlan = {
  shellTarget: 'results' | 'default';
  targetSheetSnap: 'collapsed' | null;
  restoreResultsSheetSnap: 'expanded' | 'middle' | 'collapsed' | null;
  shouldClearSearchOnClose: boolean;
};

export const createPreparedProfileOpenSnapshot = (
  transactionId: string,
  restaurantId: string | null,
  transitionState: ProfileTransitionState,
  options?: {
    selectedRestaurantId?: string | null;
    targetCamera?: CameraSnapshot | null;
  }
): PreparedProfilePresentationSnapshot => ({
  transactionId,
  kind: 'profile_open',
  restaurantId,
  selectedRestaurantId: options?.selectedRestaurantId ?? restaurantId,
  shellTarget: 'profile',
  targetCamera: options?.targetCamera
    ? {
        center: [...options.targetCamera.center],
        zoom: options.targetCamera.zoom,
        padding: options.targetCamera.padding ? { ...options.targetCamera.padding } : null,
      }
    : null,
  targetSheetSnap: 'middle',
  restoreSheetSnap: transitionState.savedSheetSnap,
  restoreResultsSheetSnap: null,
  restoreCamera: transitionState.savedCamera
    ? {
        center: [...transitionState.savedCamera.center],
        zoom: transitionState.savedCamera.zoom,
        padding: transitionState.savedCamera.padding
          ? { ...transitionState.savedCamera.padding }
          : null,
      }
    : null,
  restoreResultsScrollOffset: transitionState.savedResultsScrollOffset,
  shouldClearSearchOnClose: false,
});

export const createPreparedProfileCloseSnapshot = (
  transactionId: string,
  restaurantId: string | null,
  transitionState: ProfileTransitionState,
  options: PreparedProfileCloseSnapshotPlan & {
    selectedRestaurantId?: string | null;
  }
): PreparedProfilePresentationSnapshot => ({
  transactionId,
  kind: 'profile_close',
  restaurantId,
  selectedRestaurantId: options.selectedRestaurantId ?? null,
  shellTarget: options.shellTarget,
  targetCamera: null,
  targetSheetSnap: options.targetSheetSnap,
  restoreSheetSnap: transitionState.savedSheetSnap,
  restoreResultsSheetSnap: options.restoreResultsSheetSnap,
  restoreCamera: transitionState.savedCamera
    ? {
        center: [...transitionState.savedCamera.center],
        zoom: transitionState.savedCamera.zoom,
        padding: transitionState.savedCamera.padding
          ? { ...transitionState.savedCamera.padding }
          : null,
      }
    : null,
  restoreResultsScrollOffset: transitionState.savedResultsScrollOffset,
  shouldClearSearchOnClose: options.shouldClearSearchOnClose,
});

export const resolvePreparedProfileCloseSnapshotPlan = (options: {
  dismissBehavior: 'restore' | 'clear';
  shouldClearSearchOnDismiss: boolean;
  isSearchOverlay: boolean;
  savedSheetSnap: 'expanded' | 'middle' | 'collapsed' | null;
  lastVisibleSheetSnap: 'expanded' | 'middle' | 'collapsed' | null;
}): PreparedProfileCloseSnapshotPlan => {
  const shouldClearProfileDismiss = options.dismissBehavior === 'clear';
  return {
    shellTarget: shouldClearProfileDismiss ? 'default' : 'results',
    targetSheetSnap: shouldClearProfileDismiss ? 'collapsed' : null,
    restoreResultsSheetSnap:
      options.isSearchOverlay && !shouldClearProfileDismiss
        ? options.savedSheetSnap ?? options.lastVisibleSheetSnap ?? null
        : null,
    shouldClearSearchOnClose: options.shouldClearSearchOnDismiss,
  };
};

export const derivePreparedProfilePresentationSnapshotKey = (
  snapshot: PreparedProfilePresentationSnapshot
): string =>
  snapshot.kind === 'profile_close'
    ? `${snapshot.transactionId}:close:${snapshot.restaurantId ?? 'none'}`
    : `${snapshot.transactionId}:open:${snapshot.restaurantId ?? 'none'}`;
