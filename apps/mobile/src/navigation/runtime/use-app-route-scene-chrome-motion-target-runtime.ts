import React from 'react';
import { Easing, runOnJS, type SharedValue, withTiming } from 'react-native-reanimated';

import type { AppRouteSceneChromeMotionTarget } from './app-route-scene-motion-controller';
import { useAppRouteSceneRuntime } from './AppRouteSceneRuntimeProvider';

// F950 — UNATTRIBUTED, said out loud rather than left to look intentional.
//
// 180ms with an out-cubic ease is the chrome fade's duration. It is not tied to a spring, a
// frame budget, or a recorded owner choice; it is a number that felt right to someone and was
// never written down as such. It is small enough that changing it is a look-at-the-sim
// decision, not a calculation — so if you touch it, do it with the sim open, and record what
// you saw here.
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
  // F951(d): the 'preserve' arm is UNREACHABLE by construction, twice over — the motion
  // executor's `dispatchChromeMotion` short-circuits on
  // `areChromeTargetsEqual(..., PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET)` before it ever
  // resolves a chrome target, and `resolveMotionPlanes` never adds 'chrome' to a preserve
  // plan in the first place. It is left in place ONLY because the target interface's
  // parameter type is the full three-variant union (narrowing it is a contract change, not
  // a guard deletion) — but it no longer pretends to be a live branch: reaching it means a
  // preserve target got past both gates, which is a bug to attribute, so it BARKS instead
  // of silently returning "already settled".
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(
      '[route-chrome-motion] F951(d): a preserve chrome target reached the motion target — ' +
        'dispatchChromeMotion and resolveMotionPlanes should both have excluded it.'
    );
  }
  return currentProgress;
};

// The settle epsilon for a 0..1 progress value. 0.001 is a FLOAT-COMPARISON tolerance, not a
// perceptual one: chrome progress is driven by withTiming, which lands on the target within
// float error rather than exactly on it, and 1/1000th of the range is far below any
// difference a pixel can express (the chrome is a few hundred points tall at most). Any value
// between float epsilon and ~1/255 would behave identically.
const CHROME_PROGRESS_SETTLE_EPSILON = 0.001;

const isChromeProgressSettled = (currentProgress: number, targetProgress: number): boolean =>
  Math.abs(currentProgress - targetProgress) < CHROME_PROGRESS_SETTLE_EPSILON;

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
