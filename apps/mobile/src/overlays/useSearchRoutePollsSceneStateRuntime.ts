import React from 'react';

import type { RouteSceneSwitchDockedSceneRestoreIntent } from '../navigation/runtime/app-overlay-route-transition-contract';
import type { SearchRouteSceneLayoutState } from './searchRouteSceneLayoutContract';
import type {
  PollsPanelInitialSnapPoint,
  PollsPanelMode,
  UsePollsPanelSpecOptions,
} from './panels/runtime/polls-panel-runtime-contract';
import type { OverlaySheetSnap } from './types';

type UseSearchRoutePollsSceneStateRuntimeArgs = {
  sceneLayout: SearchRouteSceneLayoutState;
  pollOverlayParams: UsePollsPanelSpecOptions['params'];
  dockedSceneRestoreIntent: RouteSceneSwitchDockedSceneRestoreIntent | null;
  commandState: {
    pollsSheetSnap: OverlaySheetSnap;
    isDockedSceneDismissed: boolean;
  };
  overlayVisibilityState: {
    isSearchOverlay: boolean;
    isDockedLane: boolean;
  };
  interactionRef: UsePollsPanelSpecOptions['interactionRef'];
};

export type SearchRoutePollsSceneStateRuntime = {
  visible: boolean;
  interactionRef: UsePollsPanelSpecOptions['interactionRef'];
  params: UseSearchRoutePollsSceneStateRuntimeArgs['pollOverlayParams'];
  mode: PollsPanelMode;
  initialSnapPoint: PollsPanelInitialSnapPoint;
  currentSnap: OverlaySheetSnap;
  navBarTop: number;
  navBarHeight: number;
  searchBarTop: number;
  snapPoints: SearchRouteSceneLayoutState['snapPoints'];
};

export const createSearchRoutePollsSceneStateRuntime = ({
  sceneLayout,
  pollOverlayParams,
  commandState,
  dockedSceneRestoreIntent,
  overlayVisibilityState,
  interactionRef,
}: UseSearchRoutePollsSceneStateRuntimeArgs): SearchRoutePollsSceneStateRuntime => {
  const mode: PollsPanelMode = 'docked';
  const initialSnapPoint: PollsPanelInitialSnapPoint = 'collapsed';
  const physicalPollsSheetSnap = commandState.pollsSheetSnap;
  const hasDockedSceneRestoreDemand = dockedSceneRestoreIntent != null;
  const isDockedLane =
    overlayVisibilityState.isSearchOverlay && overlayVisibilityState.isDockedLane;
  const isDockedSceneVisible =
    isDockedLane &&
    (hasDockedSceneRestoreDemand ||
      (!commandState.isDockedSceneDismissed && physicalPollsSheetSnap !== 'hidden'));
  const currentSnap: OverlaySheetSnap =
    hasDockedSceneRestoreDemand && physicalPollsSheetSnap === 'hidden'
      ? dockedSceneRestoreIntent.snap
      : physicalPollsSheetSnap;

  return {
    visible: isDockedSceneVisible,
    interactionRef,
    params: pollOverlayParams,
    mode,
    initialSnapPoint,
    currentSnap,
    navBarTop: sceneLayout.navBarTop,
    navBarHeight: sceneLayout.navBarHeight,
    searchBarTop: sceneLayout.searchBarTop,
    snapPoints: sceneLayout.snapPoints,
  };
};

export const useSearchRoutePollsSceneStateRuntime = ({
  sceneLayout,
  pollOverlayParams,
  commandState,
  dockedSceneRestoreIntent,
  overlayVisibilityState,
  interactionRef,
}: UseSearchRoutePollsSceneStateRuntimeArgs): SearchRoutePollsSceneStateRuntime => {
  return React.useMemo(
    () =>
      createSearchRoutePollsSceneStateRuntime({
        sceneLayout,
        pollOverlayParams,
        commandState,
        dockedSceneRestoreIntent,
        overlayVisibilityState,
        interactionRef,
      }),
    [
      commandState,
      dockedSceneRestoreIntent,
      interactionRef,
      overlayVisibilityState,
      pollOverlayParams,
      sceneLayout,
    ]
  );
};
