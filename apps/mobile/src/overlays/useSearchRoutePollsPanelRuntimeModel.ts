import React from 'react';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type { SearchRouteOverlayCommandState } from './searchRouteOverlayCommandRuntimeContract';
import type { SearchRoutePollsPanelInputs } from './searchOverlayRouteHostContract';
import { logger } from '../utils';
import type {
  PollsPanelInitialSnapPoint,
  PollsPanelMode,
  UsePollsPanelSpecOptions,
} from './panels/runtime/polls-panel-runtime-contract';
import {
  EMPTY_SEARCH_ROUTE_VISUAL_STATE,
  type SearchRouteOverlaySheetKeys,
} from './searchResolvedRouteHostModelContract';
import type { OverlaySheetSnap, OverlaySheetSnapRequest } from './types';

type UseSearchRoutePollsPanelRuntimeModelArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  pollOverlayParams: UsePollsPanelSpecOptions['params'];
  commandState: SearchRouteOverlayCommandState;
  overlaySheetKeys: SearchRouteOverlaySheetKeys;
  searchRouteDockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
};

type SearchRoutePollsPanelRuntimeModel = {
  visible: boolean;
  bounds: SearchRoutePollsPanelInputs['pollBounds'];
  bootstrapSnapshot: SearchRoutePollsPanelInputs['startupPollsSnapshot'];
  userLocation: SearchRoutePollsPanelInputs['userLocation'];
  interactionRef: UsePollsPanelSpecOptions['interactionRef'];
  params: UseSearchRoutePollsPanelRuntimeModelArgs['pollOverlayParams'];
  mode: PollsPanelMode;
  initialSnapPoint: PollsPanelInitialSnapPoint;
  currentSnap: OverlaySheetSnap;
  navBarTop: number;
  navBarHeight: number;
  searchBarTop: number;
  snapPoints: SearchRouteHostVisualState['snapPoints'];
  shellSnapRequest: OverlaySheetSnapRequest | null;
};

const buildShellSnapRequest = (
  snap: OverlaySheetSnap | null | undefined,
  token?: number | null
): OverlaySheetSnapRequest | null => (snap ? { snap, token: token ?? null } : null);

export const useSearchRoutePollsPanelRuntimeModel = ({
  publishedVisualState,
  pollOverlayParams,
  commandState,
  overlaySheetKeys,
  searchRouteDockedPollsPanelInputs,
}: UseSearchRoutePollsPanelRuntimeModelArgs): SearchRoutePollsPanelRuntimeModel => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;
  const pollsOverlayMode: PollsPanelMode = 'docked';
  const pollsOverlaySnapPoint: PollsPanelInitialSnapPoint = 'collapsed';
  const isPersistentPollsVisible =
    overlaySheetKeys.isSearchOverlay &&
    overlaySheetKeys.isPersistentPollLane &&
    !commandState.isDockedPollsDismissed;
  const resolvedCurrentSnap: OverlaySheetSnap =
    isPersistentPollsVisible && commandState.pollsSheetSnap === 'hidden'
      ? (commandState.pollsDockedSnapRequest?.snap ?? pollsOverlaySnapPoint)
      : commandState.pollsSheetSnap;
  const diagRef = React.useRef<string | null>(null);
  const perfStartRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!isPersistentPollsVisible) {
      perfStartRef.current = null;
      return;
    }
    if (perfStartRef.current == null) {
      perfStartRef.current = Date.now();
      logger.debug('[NAV-SWITCH-SCENE-PERF] pollsMount', {
        mode: pollsOverlayMode,
        initialSnapPoint: pollsOverlaySnapPoint,
      });
    }
  }, [isPersistentPollsVisible, pollsOverlayMode, pollsOverlaySnapPoint]);

  React.useEffect(() => {
    if (!isPersistentPollsVisible || perfStartRef.current == null) {
      return;
    }
    if (resolvedCurrentSnap === 'hidden') {
      return;
    }
    logger.debug('[NAV-SWITCH-SCENE-PERF] pollsReady', {
      mode: pollsOverlayMode,
      currentSnap: resolvedCurrentSnap,
      elapsedMs: Date.now() - perfStartRef.current,
    });
    perfStartRef.current = null;
  }, [isPersistentPollsVisible, pollsOverlayMode, resolvedCurrentSnap]);

  React.useEffect(() => {
    const nextSnapshot = JSON.stringify({
      visible: isPersistentPollsVisible,
      mode: pollsOverlayMode,
      initialSnapPoint: pollsOverlaySnapPoint,
      currentSnap: resolvedCurrentSnap,
      navBarTop: visualState.navBarTopForSnaps,
      navBarHeight: visualState.navBarHeight,
      searchBarTop: visualState.searchBarTop,
      snapPoints: visualState.snapPoints,
    });

    if (diagRef.current === nextSnapshot) {
      return;
    }
    diagRef.current = nextSnapshot;
    logger.debug('[SEARCH-ROUTE-POLLS-GEOMETRY-DIAG]', JSON.parse(nextSnapshot));
  }, [
    commandState.isDockedPollsDismissed,
    commandState.pollsSheetSnap,
    commandState.tabOverlaySnapRequest,
    overlaySheetKeys.isPersistentPollLane,
    overlaySheetKeys.isSearchOverlay,
    isPersistentPollsVisible,
    pollsOverlayMode,
    pollsOverlaySnapPoint,
    resolvedCurrentSnap,
    visualState.navBarHeight,
    visualState.navBarTopForSnaps,
    visualState.searchBarTop,
    visualState.snapPoints,
  ]);

  return {
    visible: isPersistentPollsVisible,
    bounds: searchRouteDockedPollsPanelInputs?.pollBounds,
    bootstrapSnapshot: searchRouteDockedPollsPanelInputs?.startupPollsSnapshot,
    userLocation: searchRouteDockedPollsPanelInputs?.userLocation ?? null,
    interactionRef: searchRouteDockedPollsPanelInputs?.interactionRef ?? undefined,
    params: pollOverlayParams,
    mode: pollsOverlayMode,
    initialSnapPoint: pollsOverlaySnapPoint,
    currentSnap: resolvedCurrentSnap,
    navBarTop: visualState.navBarTopForSnaps,
    navBarHeight: visualState.navBarHeight,
    searchBarTop: visualState.searchBarTop,
    snapPoints: visualState.snapPoints,
    shellSnapRequest:
      commandState.pollsDockedSnapRequest?.snap != null &&
      commandState.pollsDockedSnapRequest.snap !== resolvedCurrentSnap
        ? buildShellSnapRequest(
            commandState.pollsDockedSnapRequest.snap,
            commandState.pollsDockedSnapRequest.token
          )
        : null,
  };
};
