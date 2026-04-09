import type {
  CameraSnapshot,
  ProfileTransitionState,
} from '../profile/profile-transition-state-contract';

export type ResultsPresentationEnterMutationKind =
  | 'initial_search'
  | 'search_this_area'
  | 'shortcut_rerun';

export type ResultsPresentationCoverState = 'hidden' | 'initial_loading' | 'interaction_loading';

export type PreparedResultsEnterPresentationSnapshot = {
  transactionId: string;
  kind: 'results_enter';
  mutationKind: ResultsPresentationEnterMutationKind;
  coverState: Exclude<ResultsPresentationCoverState, 'hidden'>;
};

export type PreparedResultsExitPresentationSnapshot = {
  transactionId: string;
  kind: 'results_exit';
};

export type PreparedResultsPresentationSnapshot =
  | PreparedResultsEnterPresentationSnapshot
  | PreparedResultsExitPresentationSnapshot;

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

export type PreparedResultsStagedSnapshot = {
  snapshot: PreparedResultsPresentationSnapshot;
  dataReady: boolean;
  stagingResultsSnapshotKey: string | null;
};

export type PreparedResultsStagingInputs = {
  resultsSnapshotKey: string | null;
  listFirstPaintReady: boolean;
  isShortcutCoverageLoading: boolean;
  mapPreparedLabelSourcesReady: boolean;
};

export type PreparedResultsStagingCoordinatorOptions = {
  applyStagingCoverState: (coverState: Exclude<ResultsPresentationCoverState, 'hidden'>) => void;
  publishMapPreparedLabelSourcesReady: (value: boolean) => void;
  commitPreparedResultsSnapshot: (snapshot: PreparedResultsPresentationSnapshot) => void;
  onStagedSnapshotChanged?: () => void;
};

export type PreparedResultsStagingCoordinator = {
  getStagedSnapshot: () => PreparedResultsStagedSnapshot | null;
  getPreparedResultsSnapshotKey: (
    committedPreparedResultsSnapshotKey: string | null
  ) => string | null;
  stage: (
    snapshot: PreparedResultsPresentationSnapshot,
    stagingResultsSnapshotKey: string | null
  ) => void;
  clear: (transactionId?: string) => void;
  maybeCommit: (inputs: PreparedResultsStagingInputs) => boolean;
  handlePageOneResultsCommitted: (inputs: PreparedResultsStagingInputs) => void;
};

export const createPreparedResultsEnterSnapshot = (
  transactionId: string,
  mutationKind: ResultsPresentationEnterMutationKind,
  coverState: Exclude<ResultsPresentationCoverState, 'hidden'>
): PreparedResultsEnterPresentationSnapshot => ({
  transactionId,
  kind: 'results_enter',
  mutationKind,
  coverState,
});

export const createPreparedResultsExitSnapshot = (
  transactionId: string
): PreparedResultsExitPresentationSnapshot => ({
  transactionId,
  kind: 'results_exit',
});

export const resolvePreparedResultsEnterCoverState = (
  preserveSheetState: boolean
): Exclude<ResultsPresentationCoverState, 'hidden'> =>
  preserveSheetState ? 'interaction_loading' : 'initial_loading';

export const resolvePreparedResultsStagingCoverState = (
  snapshot: PreparedResultsPresentationSnapshot
): Exclude<ResultsPresentationCoverState, 'hidden'> =>
  snapshot.kind === 'results_exit' ? 'interaction_loading' : snapshot.coverState;

export const resolveCommittedPreparedResultsCoverState = (
  snapshot: PreparedResultsPresentationSnapshot
): ResultsPresentationCoverState =>
  snapshot.kind === 'results_exit' ? 'hidden' : snapshot.coverState;

const requiresPreparedResultsCoverage = (snapshot: PreparedResultsPresentationSnapshot): boolean =>
  snapshot.kind === 'results_enter' &&
  (snapshot.mutationKind === 'shortcut_rerun' || snapshot.mutationKind === 'search_this_area');

export const isPreparedResultsSnapshotReadyForCommit = (
  stagedSnapshot: PreparedResultsStagedSnapshot | null,
  listFirstPaintReady: boolean,
  isShortcutCoverageLoading: boolean,
  mapPreparedLabelSourcesReady: boolean
): boolean => {
  if (!stagedSnapshot?.dataReady) {
    return false;
  }
  if (!listFirstPaintReady) {
    return false;
  }
  if (requiresPreparedResultsCoverage(stagedSnapshot.snapshot) && isShortcutCoverageLoading) {
    return false;
  }
  return mapPreparedLabelSourcesReady;
};

export const createPreparedResultsStagingCoordinator = (
  options: PreparedResultsStagingCoordinatorOptions
): PreparedResultsStagingCoordinator => {
  let stagedSnapshot: PreparedResultsStagedSnapshot | null = null;

  const notifyChanged = () => {
    options.onStagedSnapshotChanged?.();
  };

  const setStagedSnapshot = (nextSnapshot: PreparedResultsStagedSnapshot | null) => {
    stagedSnapshot = nextSnapshot;
    notifyChanged();
  };

  const promoteDataReady = (resultsSnapshotKey: string | null) => {
    if (
      stagedSnapshot == null ||
      stagedSnapshot.dataReady ||
      resultsSnapshotKey == null ||
      resultsSnapshotKey === stagedSnapshot.stagingResultsSnapshotKey
    ) {
      return stagedSnapshot;
    }
    const promotedSnapshot = {
      ...stagedSnapshot,
      dataReady: true,
    };
    setStagedSnapshot(promotedSnapshot);
    return promotedSnapshot;
  };

  const coordinator: PreparedResultsStagingCoordinator = {
    getStagedSnapshot: () => stagedSnapshot,
    getPreparedResultsSnapshotKey(committedPreparedResultsSnapshotKey) {
      return committedPreparedResultsSnapshotKey ?? stagedSnapshot?.snapshot.transactionId ?? null;
    },
    stage(snapshot, stagingResultsSnapshotKey) {
      options.applyStagingCoverState(resolvePreparedResultsStagingCoverState(snapshot));
      options.publishMapPreparedLabelSourcesReady(false);
      setStagedSnapshot({
        snapshot,
        dataReady: false,
        stagingResultsSnapshotKey,
      });
    },
    clear(transactionId) {
      if (transactionId != null && stagedSnapshot?.snapshot.transactionId !== transactionId) {
        return;
      }
      setStagedSnapshot(null);
      options.publishMapPreparedLabelSourcesReady(false);
    },
    maybeCommit(inputs) {
      const nextSnapshot = promoteDataReady(inputs.resultsSnapshotKey) ?? stagedSnapshot;
      if (
        !isPreparedResultsSnapshotReadyForCommit(
          nextSnapshot,
          inputs.listFirstPaintReady,
          inputs.isShortcutCoverageLoading,
          inputs.mapPreparedLabelSourcesReady
        )
      ) {
        return false;
      }
      setStagedSnapshot(null);
      options.publishMapPreparedLabelSourcesReady(false);
      options.commitPreparedResultsSnapshot(nextSnapshot.snapshot);
      return true;
    },
    handlePageOneResultsCommitted(inputs) {
      if (stagedSnapshot == null) {
        return;
      }
      options.publishMapPreparedLabelSourcesReady(false);
      setStagedSnapshot({
        ...stagedSnapshot,
        dataReady: true,
      });
      coordinator.maybeCommit(inputs);
    },
  };
  return coordinator;
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
