import type { RouteSceneSwitchDockedSceneRestoreIntent } from '../navigation/runtime/app-overlay-route-transition-contract';
import type { SearchRouteSceneLayoutState } from './searchRouteSceneLayoutContract';
import type {
  PollsPanelInitialSnapPoint,
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
  // F1494: this constant is 'collapsed', not 'expanded' — corrected 2026-08-05.
  // The prior comment here ("opens at the content seat (expanded); the collapsed
  // docked-bar initial is history") contradicted the line it annotated; verified
  // against the sole producer, the actual initial seat is the docked/collapsed one.
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
    initialSnapPoint,
    currentSnap,
    navBarTop: sceneLayout.navBarTop,
    navBarHeight: sceneLayout.navBarHeight,
    searchBarTop: sceneLayout.searchBarTop,
    snapPoints: sceneLayout.snapPoints,
  };
};
