export type SearchRouteOverlayTransitionController = {
  beginOverlaySwitch: () => void;
  endOverlaySwitch: () => void;
  isOverlaySwitchInFlight: () => boolean;
  setNavRestorePending: (next: boolean) => void;
  isNavRestorePending: () => boolean;
};

let overlaySwitchInFlight = false;
let navRestorePending = false;

export const searchRouteOverlayTransitionController: SearchRouteOverlayTransitionController = {
  beginOverlaySwitch: () => {
    overlaySwitchInFlight = true;
  },
  endOverlaySwitch: () => {
    overlaySwitchInFlight = false;
  },
  isOverlaySwitchInFlight: () => overlaySwitchInFlight,
  setNavRestorePending: (next: boolean) => {
    navRestorePending = next;
  },
  isNavRestorePending: () => navRestorePending,
};

export const useSearchRouteOverlayTransitionController =
  (): SearchRouteOverlayTransitionController => searchRouteOverlayTransitionController;
