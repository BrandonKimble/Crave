import React from 'react';

import type { AppRouteSceneSwitchRuntime } from './app-route-scene-switch-controller';
import type { PresentationFrame } from './app-route-presentation-frame-contract';

// React bridge for the PresentationFrame (page-switch-master-plan.md §1/§9). ONE subscription
// source (useSyncExternalStore over the controller's flush-cadence publication — §9.1 R7), so
// every React consumer of the frame re-renders in the same commit and can never tear against
// another frame reader.
export const usePresentationFrame = (
  routeSceneSwitchRuntime: Pick<
    AppRouteSceneSwitchRuntime,
    'getPresentationFrame' | 'subscribePresentationFrame'
  >
): PresentationFrame => {
  // Wrap — do NOT pass the runtime's class methods as bare references: unbound `this` inside
  // getPresentationFrame reads `undefined.presentationFrame` and crashes at boot.
  const subscribe = React.useCallback(
    (onStoreChange: () => void) =>
      routeSceneSwitchRuntime.subscribePresentationFrame(onStoreChange),
    [routeSceneSwitchRuntime]
  );
  const getSnapshot = React.useCallback(
    () => routeSceneSwitchRuntime.getPresentationFrame(),
    [routeSceneSwitchRuntime]
  );
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

// Field-selector bridge (leg 6 — PF chrome clock): subscribe to ONE frame field without
// re-rendering on unrelated frame mutations (revision bumps, entry-id churn). Same
// flush-cadence publication as usePresentationFrame.
export const usePresentationFrameSelector = <TSelected>(
  routeSceneSwitchRuntime: Pick<
    AppRouteSceneSwitchRuntime,
    'getPresentationFrame' | 'subscribePresentationFrame'
  >,
  selector: (frame: PresentationFrame) => TSelected
): TSelected => {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) =>
      routeSceneSwitchRuntime.subscribePresentationFrame(onStoreChange),
    [routeSceneSwitchRuntime]
  );
  const selectorRef = React.useRef(selector);
  selectorRef.current = selector;
  const getSnapshot = React.useCallback(
    () => selectorRef.current(routeSceneSwitchRuntime.getPresentationFrame()),
    [routeSceneSwitchRuntime]
  );
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * Nav-out consumer read (leg 6): the bottom nav leaves whenever the committed frame says the
 * top-of-stack entry is a child scene. Replaces useIsNavOutChildSceneRevealed (the deleted
 * nav-out-derivation-store) — same boolean, now on the PF commit clock.
 */
export const useIsChildSceneRevealed = (
  routeSceneSwitchRuntime: Pick<
    AppRouteSceneSwitchRuntime,
    'getPresentationFrame' | 'subscribePresentationFrame'
  >
): boolean =>
  usePresentationFrameSelector(routeSceneSwitchRuntime, (frame) => frame.isChildSceneRevealed);
