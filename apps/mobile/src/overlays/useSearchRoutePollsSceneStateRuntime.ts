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
  };
  overlayVisibilityState: {
    /** Polls demotion (home-surface-charter Job 3): polls is a regular tab —
     *  presented ⟺ the polls route is the active root (children on top keep
     *  the root, so the feed stays live under pollDetail exactly as before). */
    isPollsRoot: boolean;
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
  // Content page now: opens at the content seat (expanded); the collapsed
  // docked-bar initial is history.
  const initialSnapPoint: PollsPanelInitialSnapPoint = 'collapsed';
  const physicalPollsSheetSnap = commandState.pollsSheetSnap;
  const isPollsVisible = overlayVisibilityState.isPollsRoot && physicalPollsSheetSnap !== 'hidden';
  const currentSnap: OverlaySheetSnap =
    dockedSceneRestoreIntent != null && physicalPollsSheetSnap === 'hidden'
      ? dockedSceneRestoreIntent.snap
      : physicalPollsSheetSnap;

  return {
    visible: isPollsVisible,
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
