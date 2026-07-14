import React from 'react';

import type { RestaurantOverlayData } from './restaurantRoutePanelContract';

// P3 persistent header (page-switch-master-plan.md §6-P3 / §8-R10) — the RESTAURANT header's
// live-state publication. The persistent header's Title/Action/grab components mount OUTSIDE the
// restaurant panel (inside the hoisted PersistentSheetHeaderHost chrome) and therefore cannot
// read the panel's props. The restaurant presentation, however, has TWO producers (the
// parent-scoped global-restaurant draft opened from polls/bookmarks/profile, and the
// search-scoped control-selection snapshot the search runtime seeds), and the ONE place the
// winner is resolved — including the freeze-retain semantics the header must honor — is
// RestaurantRouteSceneInputHost (`parent ?? search`, mirroring its published scene descriptor).
// Re-deriving that selection here would recreate exactly the multi-site presented-scene disease
// the PresentationFrame work deletes, so instead the input host (an app-level input-writer that
// is NOT the panel and persists across scene switches) publishes the resolved header inputs to
// this module-scope store (the origin-scene-live-state-registry house pattern), and the
// descriptor components subscribe. The entity-tap title seed flows unchanged: seedRestaurantProfile
// → restaurantPanelSnapshot → control selection → input host → THIS store → Title, in the same
// commit that previously produced the inline headerComponent.
export type RestaurantHeaderLiveState = {
  /** The winner's (freeze-retained) panel data — null on the pre-data seed frame. */
  data: RestaurantOverlayData | null;
  onToggleFavorite: (id: string) => void;
  onRequestClose: () => void;
};

type Listener = () => void;

let currentRestaurantHeaderLiveState: RestaurantHeaderLiveState | null = null;
const listeners = new Set<Listener>();

export const publishRestaurantHeaderLiveState = (state: RestaurantHeaderLiveState | null): void => {
  if (currentRestaurantHeaderLiveState === state) {
    return;
  }
  currentRestaurantHeaderLiveState = state;
  listeners.forEach((listener) => {
    listener();
  });
};

// Exported (leg 6): the header host's close OVERRIDE for 'restaurant' reads the live state at
// press time (registerHeaderCloseAction in RestaurantPanel).
export const getRestaurantHeaderLiveState = (): RestaurantHeaderLiveState | null =>
  currentRestaurantHeaderLiveState;

const subscribeRestaurantHeaderLiveState = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useRestaurantHeaderLiveState = (): RestaurantHeaderLiveState | null =>
  React.useSyncExternalStore(
    subscribeRestaurantHeaderLiveState,
    getRestaurantHeaderLiveState,
    getRestaurantHeaderLiveState
  );
