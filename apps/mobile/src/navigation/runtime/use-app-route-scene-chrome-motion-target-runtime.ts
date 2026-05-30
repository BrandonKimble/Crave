import React from 'react';
import { Easing, runOnJS, type SharedValue, withTiming } from 'react-native-reanimated';

import type { AppRouteSceneChromeMotionTarget } from './app-route-scene-motion-controller';
import { useAppRouteSceneRuntime } from './AppRouteSceneRuntimeProvider';

const ROUTE_CHROME_MOTION_MS = 180;

export type UseAppRouteSceneChromeMotionTargetRuntimeArgs = {
  overlayChromeVisibilityProgress: SharedValue<number>;
  routeChromeMotionProgress: SharedValue<number>;
};

const resolveChromeProgressTarget = (
  searchChrome: 'visible' | 'hidden' | 'preserve',
  currentProgress: number
): number => {
  if (searchChrome === 'visible') {
    return 1;
  }
  if (searchChrome === 'hidden') {
    return 0;
  }
  return currentProgress;
};

const isChromeProgressSettled = (currentProgress: number, targetProgress: number): boolean =>
  Math.abs(currentProgress - targetProgress) < 0.001;

export const useAppRouteSceneChromeMotionTargetRuntime = ({
  overlayChromeVisibilityProgress,
  routeChromeMotionProgress,
}: UseAppRouteSceneChromeMotionTargetRuntimeArgs): void => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const routeSceneMotionRuntime = routeSceneRuntime.routeSceneMotionRuntime;
  const target = React.useMemo<AppRouteSceneChromeMotionTarget>(
    () => ({
      isChromeVisibilityTargetSettled: (chromeVisibilityTarget) => {
        const nextChromeProgress = resolveChromeProgressTarget(
          chromeVisibilityTarget.searchChrome,
          overlayChromeVisibilityProgress.value
        );
        return isChromeProgressSettled(overlayChromeVisibilityProgress.value, nextChromeProgress);
      },
      executeChromeVisibilityTarget: (chromeVisibilityTarget, contract, complete) => {
        const nextChromeProgress = resolveChromeProgressTarget(
          chromeVisibilityTarget.searchChrome,
          overlayChromeVisibilityProgress.value
        );
        const activeRouteChromeMotionToken = contract.transitionToken;

        routeChromeMotionProgress.value = activeRouteChromeMotionToken;
        overlayChromeVisibilityProgress.value = withTiming(
          nextChromeProgress,
          {
            duration: ROUTE_CHROME_MOTION_MS,
            easing: Easing.out(Easing.cubic),
          },
          () => {
            if (routeChromeMotionProgress.value === activeRouteChromeMotionToken) {
              routeChromeMotionProgress.value = 0;
            }
            runOnJS(complete)();
          }
        );
        return true;
      },
    }),
    [overlayChromeVisibilityProgress, routeChromeMotionProgress]
  );

  React.useEffect(
    () => routeSceneMotionRuntime.registerChromeMotionTarget(target),
    [routeSceneMotionRuntime, target]
  );
};
