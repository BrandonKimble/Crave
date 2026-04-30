import React from 'react';

import type { RouteSceneSwitchDockedPollsRestoreIntent } from '../navigation/runtime/app-overlay-route-transition-contract';
import type { DockedPollsSnapRequest } from '../navigation/runtime/app-route-sheet-snap-session-runtime';
import { createSearchRouteSceneShellSnapRequest } from './searchRouteSceneShellMotionContract';
import type { SearchRouteSceneLayoutState } from './searchRouteSceneLayoutContract';
import type {
  PollsPanelInitialSnapPoint,
  PollsPanelMode,
  UsePollsPanelSpecOptions,
} from './panels/runtime/polls-panel-runtime-contract';
import type { OverlaySheetSnap, OverlaySheetSnapRequest } from './types';

type UseSearchRoutePollsSceneStateRuntimeArgs = {
  sceneLayout: SearchRouteSceneLayoutState;
  pollOverlayParams: UsePollsPanelSpecOptions['params'];
  dockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
  commandState: {
    pollsDockedSnapRequest: DockedPollsSnapRequest | null;
    pollsSheetSnap: OverlaySheetSnap;
    isDockedPollsDismissed: boolean;
    dockedPollsRestoreInFlight: boolean;
    ignoreDockedPollsHiddenUntilMs: number;
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
  sheetMotionRequest: OverlaySheetSnapRequest | null;
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
  const isPersistentPollsVisible =
    overlayVisibilityState.isSearchOverlay &&
    overlayVisibilityState.isPersistentPollLane &&
    (!commandState.isDockedPollsDismissed || dockedPollsRestoreIntent != null);
  const currentSnap: OverlaySheetSnap =
    isPersistentPollsVisible && commandState.pollsSheetSnap === 'hidden'
      ? dockedPollsRestoreIntent?.snap ??
        commandState.pollsDockedSnapRequest?.snap ??
        initialSnapPoint
      : commandState.pollsSheetSnap;
  const routeRestoreSnapRequest =
    dockedPollsRestoreIntent != null && dockedPollsRestoreIntent.snap !== currentSnap
      ? createSearchRouteSceneShellSnapRequest(
          dockedPollsRestoreIntent.snap,
          dockedPollsRestoreIntent.token
        )
      : null;
  const commandSnapRequest =
    commandState.pollsDockedSnapRequest?.snap != null &&
    commandState.pollsDockedSnapRequest.snap !== currentSnap
      ? createSearchRouteSceneShellSnapRequest(
          commandState.pollsDockedSnapRequest.snap,
          commandState.pollsDockedSnapRequest.token
        )
      : null;

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
    sheetMotionRequest: routeRestoreSnapRequest ?? commandSnapRequest,
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
