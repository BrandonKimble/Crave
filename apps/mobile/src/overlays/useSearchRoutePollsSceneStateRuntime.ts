import React from 'react';

import type { RouteSceneSwitchDockedPollsRestoreIntent } from '../navigation/runtime/app-overlay-route-transition-contract';
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
  dockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
  commandState: {
    pollsSheetSnap: OverlaySheetSnap;
    isDockedPollsDismissed: boolean;
  };
  overlayVisibilityState: {
    isSearchOverlay: boolean;
    isPersistentPollLane: boolean;
  };
  pollBounds: UsePollsPanelSpecOptions['bounds'];
  startupPollsSnapshot: UsePollsPanelSpecOptions['bootstrapSnapshot'];
  userLocation: UsePollsPanelSpecOptions['userLocation'];
  interactionRef: UsePollsPanelSpecOptions['interactionRef'];
};

export type SearchRoutePollsSceneStateRuntime = {
  visible: boolean;
  bounds: UsePollsPanelSpecOptions['bounds'];
  bootstrapSnapshot: UsePollsPanelSpecOptions['bootstrapSnapshot'];
  userLocation: UsePollsPanelSpecOptions['userLocation'];
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
  dockedPollsRestoreIntent,
  overlayVisibilityState,
  pollBounds,
  startupPollsSnapshot,
  userLocation,
  interactionRef,
}: UseSearchRoutePollsSceneStateRuntimeArgs): SearchRoutePollsSceneStateRuntime => {
  const mode: PollsPanelMode = 'docked';
  const initialSnapPoint: PollsPanelInitialSnapPoint = 'collapsed';
  const physicalPollsSheetSnap = commandState.pollsSheetSnap;
  const hasDockedPollsRestoreDemand = dockedPollsRestoreIntent != null;
  const isPersistentPollsVisible =
    overlayVisibilityState.isSearchOverlay &&
    overlayVisibilityState.isPersistentPollLane &&
    (!commandState.isDockedPollsDismissed || hasDockedPollsRestoreDemand);
  const currentSnap: OverlaySheetSnap =
    isPersistentPollsVisible && physicalPollsSheetSnap === 'hidden'
      ? dockedPollsRestoreIntent?.snap ?? initialSnapPoint
      : physicalPollsSheetSnap;

  return {
    visible: isPersistentPollsVisible,
    bounds: pollBounds,
    bootstrapSnapshot: startupPollsSnapshot,
    userLocation,
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
  dockedPollsRestoreIntent,
  overlayVisibilityState,
  pollBounds,
  startupPollsSnapshot,
  userLocation,
  interactionRef,
}: UseSearchRoutePollsSceneStateRuntimeArgs): SearchRoutePollsSceneStateRuntime => {
  return React.useMemo(
    () =>
      createSearchRoutePollsSceneStateRuntime({
        sceneLayout,
        pollOverlayParams,
        commandState,
        dockedPollsRestoreIntent,
        overlayVisibilityState,
        pollBounds,
        startupPollsSnapshot,
        userLocation,
        interactionRef,
      }),
    [
      commandState,
      dockedPollsRestoreIntent,
      interactionRef,
      overlayVisibilityState,
      pollBounds,
      pollOverlayParams,
      sceneLayout,
      startupPollsSnapshot,
      userLocation,
    ]
  );
};
