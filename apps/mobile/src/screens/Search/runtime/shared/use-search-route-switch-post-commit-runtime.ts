import React from 'react';

import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { OverlayKey } from '../../../../overlays/types';
import type { RouteSceneSwitchTransitionState } from '../../../../navigation/runtime/app-route-scene-switch-controller';
import type { SearchForegroundOverlayRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';
import {
  beginSearchNavSwitchPerfProbe,
  getActiveSearchNavSwitchPerfProbe,
} from './search-nav-switch-perf-probe';
import { withSearchNavSwitchRuntimeAttribution } from './search-nav-switch-runtime-attribution';

type SearchRouteSwitchPostCommitPerfState = {
  probe: ReturnType<typeof beginSearchNavSwitchPerfProbe>;
};

type SearchRouteSwitchSettledCleanup = SearchRouteSwitchPostCommitPerfState & {
  transitionToken: number;
  sourceSceneKey: OverlayKey | null;
  targetSceneKey: OverlayKey | null;
};

type SearchRouteSwitchCleanupRuntime = Pick<
  SearchForegroundOverlayRuntimeArgs,
  'transientCleanupActions'
>;

const SEARCH_ROUTE_SWITCH_CLEANUP_QUIET_DELAY_MS = 650;

export const useSearchRouteSwitchPostCommitRuntime = ({
  transientCleanupActions,
}: SearchForegroundOverlayRuntimeArgs): void => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const routeSceneSwitchRuntime = routeSceneRuntime.routeSceneSwitchRuntime;
  const pendingCleanupRef = React.useRef<SearchRouteSwitchSettledCleanup | null>(null);
  const quietCleanupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRuntimeRef = React.useRef<SearchRouteSwitchCleanupRuntime>({
    transientCleanupActions,
  });
  const clearQuietCleanupTimer = React.useCallback(() => {
    const timer = quietCleanupTimerRef.current;
    if (timer == null) {
      return;
    }
    clearTimeout(timer);
    quietCleanupTimerRef.current = null;
  }, []);

  React.useEffect(() => {
    cleanupRuntimeRef.current = {
      transientCleanupActions,
    };
  }, [transientCleanupActions]);

  const flushSettledCleanup = React.useCallback((cleanup: SearchRouteSwitchSettledCleanup) => {
    withSearchNavSwitchRuntimeAttribution('routeSwitchPostCommit', 'flushSettledCleanup', () => {
      const runtime = cleanupRuntimeRef.current;
      const { targetSceneKey } = cleanup;

      const isSearchRootTarget = targetSceneKey === 'search' || targetSceneKey === 'polls';
      const isSearchProfileRouteTarget = targetSceneKey === 'restaurant';
      const cleanupSnapshot = runtime.transientCleanupActions.getSnapshot();

      runtime.transientCleanupActions.dismissTransientOverlays();
      const shouldDeferSuggestionClear = cleanupSnapshot.isSuggestionPanelActive
        ? runtime.transientCleanupActions.beginSuggestionCloseHold()
        : false;
      if (cleanupSnapshot.isSuggestionPanelActive) {
        runtime.transientCleanupActions.resetSuggestionPanelActive();
      }
      if (isSearchRootTarget) {
        runtime.transientCleanupActions.setSearchFlagsForSearchRoot();
      }
      if (!shouldDeferSuggestionClear && isSearchRootTarget) {
        runtime.transientCleanupActions.clearSuggestions();
      }
      if (isSearchRootTarget && cleanupSnapshot.profilePresentationActive) {
        runtime.transientCleanupActions.closeRestaurantProfile();
      }
      if (
        !isSearchRootTarget &&
        !isSearchProfileRouteTarget &&
        cleanupSnapshot.profilePresentationActive
      ) {
        runtime.transientCleanupActions.closeRestaurantProfile();
      }
      runtime.transientCleanupActions.blurInput();
    });
  }, []);

  const scheduleQuietSettledCleanup = React.useCallback(
    (cleanup: SearchRouteSwitchSettledCleanup) => {
      clearQuietCleanupTimer();
      quietCleanupTimerRef.current = setTimeout(() => {
        quietCleanupTimerRef.current = null;
        const activeTransitionState = routeSceneSwitchRuntime.getTransitionState();
        if (
          activeTransitionState.transitionToken !== cleanup.transitionToken ||
          activeTransitionState.transitionPhase !== 'idle'
        ) {
          return;
        }
        flushSettledCleanup(cleanup);
      }, SEARCH_ROUTE_SWITCH_CLEANUP_QUIET_DELAY_MS);
    },
    [clearQuietCleanupTimer, flushSettledCleanup, routeSceneSwitchRuntime]
  );

  React.useEffect(() => {
    const isForegroundOverlaySwitchTarget = (sceneKey: OverlayKey | null): boolean =>
      sceneKey === 'search' ||
      sceneKey === 'polls' ||
      sceneKey === 'bookmarks' ||
      sceneKey === 'profile';
    const maybeCaptureCleanup = (transitionState: RouteSceneSwitchTransitionState): void => {
      const transitionContract = transitionState.transitionContract;
      if (
        transitionContract == null ||
        transitionContract.committedRouteAction !== 'setRoot' ||
        !isForegroundOverlaySwitchTarget(transitionContract.targetSceneKey)
      ) {
        return;
      }
      const sourceSceneKey = transitionContract.sourceSceneKey;
      const targetSceneKey = transitionContract.targetSceneKey;
      const isSearchRootSource = sourceSceneKey === 'search' || sourceSceneKey === 'polls';
      const isSearchRootTarget = targetSceneKey === 'search' || targetSceneKey === 'polls';
      const runtime = cleanupRuntimeRef.current;
      const cleanupSnapshot = runtime.transientCleanupActions.getSnapshot();
      if (
        !isSearchRootSource &&
        isSearchRootTarget &&
        !cleanupSnapshot.isSuggestionPanelActive &&
        !cleanupSnapshot.profilePresentationActive
      ) {
        return;
      }
      const existingCleanup = pendingCleanupRef.current;
      if (existingCleanup?.transitionToken === transitionContract.transitionToken) {
        return;
      }
      pendingCleanupRef.current = {
        transitionToken: transitionContract.transitionToken,
        sourceSceneKey,
        targetSceneKey,
        probe:
          getActiveSearchNavSwitchPerfProbe() ??
          beginSearchNavSwitchPerfProbe({
            from: sourceSceneKey ?? 'none',
            to: targetSceneKey ?? 'none',
          }),
      };
    };

    let previousTransitionState = routeSceneSwitchRuntime.getTransitionState();
    maybeCaptureCleanup(previousTransitionState);

    return routeSceneSwitchRuntime.subscribeTransitionState((nextTransitionState) => {
      maybeCaptureCleanup(nextTransitionState);
      const pendingCleanup = pendingCleanupRef.current;
      if (
        pendingCleanup != null &&
        previousTransitionState.transitionPhase !== 'idle' &&
        nextTransitionState.transitionPhase === 'idle' &&
        nextTransitionState.transitionToken === pendingCleanup.transitionToken
      ) {
        pendingCleanupRef.current = null;
        scheduleQuietSettledCleanup(pendingCleanup);
      }
      previousTransitionState = nextTransitionState;
    }, 'searchRouteSwitchPostCommit');
  }, [routeSceneSwitchRuntime, scheduleQuietSettledCleanup]);

  React.useEffect(() => clearQuietCleanupTimer, [clearQuietCleanupTimer]);
};
