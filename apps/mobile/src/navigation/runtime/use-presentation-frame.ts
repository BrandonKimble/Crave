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
