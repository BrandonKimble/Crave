type PerfScenarioCommandRegistrySnapshot = {
  closeResults: (() => void) | null;
  setMapCamera:
    | ((input: {
        lat: number;
        lng: number;
        zoom: number;
        bearing?: number | null;
        pitch?: number | null;
        label?: string | null;
      }) => boolean)
    | null;
  animateMapCamera:
    | ((input: {
        lat: number;
        lng: number;
        zoom: number;
        bearing?: number | null;
        pitch?: number | null;
        cameraDurationMs: number;
        label?: string | null;
      }) => boolean)
    | null;
  moveMapForSearchThisArea:
    | ((input: { lat: number; lng: number; zoom: number; label?: string | null }) => boolean)
    | null;
  submitShortcutRestaurants: (() => Promise<void>) | null;
  // Verification harness: drive the restaurant<->dish tab toggle through its REAL flow
  // (scheduleTabToggleCommit) so a deep link can validate the canonical-swap toggle without the
  // GestureDetector that Maestro can't tap.
  toggleTab: ((input: { tab: 'dishes' | 'restaurants' }) => void) | null;
  setScaleProbeMarkers:
    | ((input: {
        count: number;
        lat: number;
        lng: number;
        collide?: boolean;
        spreadDeg?: number | null;
        label?: string | null;
      }) => boolean)
    | null;
  // Verification harness: open an overlay scene in its committed state, so a
  // Maestro flow / deep link can drive into any scene (e.g. pollDetail) without
  // the manual gesture dance the docked-lane preview required.
  openOverlayScene:
    | ((input: { scene: string; routeParam?: string | null; label?: string | null }) => boolean)
    | null;
  // Verification harness: deterministic results-list scroll (Maestro swipes are consumed by the
  // sheet's gesture handoff and cannot reliably reach the list bottom).
  scrollResults: ((input: { offsetY: number; animated?: boolean | null }) => boolean) | null;
};

const commandRegistry: PerfScenarioCommandRegistrySnapshot = {
  closeResults: null,
  setMapCamera: null,
  animateMapCamera: null,
  moveMapForSearchThisArea: null,
  submitShortcutRestaurants: null,
  toggleTab: null,
  setScaleProbeMarkers: null,
  openOverlayScene: null,
  scrollResults: null,
};

export type PerfScenarioCommandRegistration = {
  closeResults?: () => void;
  setMapCamera?: (input: {
    lat: number;
    lng: number;
    zoom: number;
    bearing?: number | null;
    pitch?: number | null;
    label?: string | null;
  }) => boolean;
  animateMapCamera?: (input: {
    lat: number;
    lng: number;
    zoom: number;
    bearing?: number | null;
    pitch?: number | null;
    cameraDurationMs: number;
    label?: string | null;
  }) => boolean;
  moveMapForSearchThisArea?: (input: {
    lat: number;
    lng: number;
    zoom: number;
    label?: string | null;
  }) => boolean;
  submitShortcutRestaurants?: () => Promise<void>;
  toggleTab?: (input: { tab: 'dishes' | 'restaurants' }) => void;
  setScaleProbeMarkers?: (input: {
    count: number;
    lat: number;
    lng: number;
    label?: string | null;
  }) => boolean;
  openOverlayScene?: (input: {
    scene: string;
    routeParam?: string | null;
    label?: string | null;
  }) => boolean;
  scrollResults?: (input: { offsetY: number; animated?: boolean | null }) => boolean;
};

export const registerPerfScenarioCommands = ({
  closeResults,
  setMapCamera,
  animateMapCamera,
  moveMapForSearchThisArea,
  submitShortcutRestaurants,
  toggleTab,
  setScaleProbeMarkers,
  openOverlayScene,
  scrollResults,
}: PerfScenarioCommandRegistration): (() => void) => {
  if (closeResults) {
    commandRegistry.closeResults = closeResults;
  }
  if (setMapCamera) {
    commandRegistry.setMapCamera = setMapCamera;
  }
  if (animateMapCamera) {
    commandRegistry.animateMapCamera = animateMapCamera;
  }
  if (moveMapForSearchThisArea) {
    commandRegistry.moveMapForSearchThisArea = moveMapForSearchThisArea;
  }
  if (submitShortcutRestaurants) {
    commandRegistry.submitShortcutRestaurants = submitShortcutRestaurants;
  }
  if (toggleTab) {
    commandRegistry.toggleTab = toggleTab;
  }
  if (setScaleProbeMarkers) {
    commandRegistry.setScaleProbeMarkers = setScaleProbeMarkers;
  }
  if (openOverlayScene) {
    commandRegistry.openOverlayScene = openOverlayScene;
  }
  if (scrollResults) {
    commandRegistry.scrollResults = scrollResults;
  }

  return () => {
    if (closeResults && commandRegistry.closeResults === closeResults) {
      commandRegistry.closeResults = null;
    }
    if (setMapCamera && commandRegistry.setMapCamera === setMapCamera) {
      commandRegistry.setMapCamera = null;
    }
    if (animateMapCamera && commandRegistry.animateMapCamera === animateMapCamera) {
      commandRegistry.animateMapCamera = null;
    }
    if (
      moveMapForSearchThisArea &&
      commandRegistry.moveMapForSearchThisArea === moveMapForSearchThisArea
    ) {
      commandRegistry.moveMapForSearchThisArea = null;
    }
    if (
      submitShortcutRestaurants &&
      commandRegistry.submitShortcutRestaurants === submitShortcutRestaurants
    ) {
      commandRegistry.submitShortcutRestaurants = null;
    }
    if (toggleTab && commandRegistry.toggleTab === toggleTab) {
      commandRegistry.toggleTab = null;
    }
    if (setScaleProbeMarkers && commandRegistry.setScaleProbeMarkers === setScaleProbeMarkers) {
      commandRegistry.setScaleProbeMarkers = null;
    }
    if (openOverlayScene && commandRegistry.openOverlayScene === openOverlayScene) {
      commandRegistry.openOverlayScene = null;
    }
    if (scrollResults && commandRegistry.scrollResults === scrollResults) {
      commandRegistry.scrollResults = null;
    }
  };
};

export const readPerfScenarioCommandRegistry = (): PerfScenarioCommandRegistrySnapshot => ({
  closeResults: commandRegistry.closeResults,
  setMapCamera: commandRegistry.setMapCamera,
  animateMapCamera: commandRegistry.animateMapCamera,
  moveMapForSearchThisArea: commandRegistry.moveMapForSearchThisArea,
  submitShortcutRestaurants: commandRegistry.submitShortcutRestaurants,
  toggleTab: commandRegistry.toggleTab,
  setScaleProbeMarkers: commandRegistry.setScaleProbeMarkers,
  openOverlayScene: commandRegistry.openOverlayScene,
  scrollResults: commandRegistry.scrollResults,
});
