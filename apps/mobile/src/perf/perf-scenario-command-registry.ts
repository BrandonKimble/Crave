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
};

const commandRegistry: PerfScenarioCommandRegistrySnapshot = {
  closeResults: null,
  setMapCamera: null,
  animateMapCamera: null,
  moveMapForSearchThisArea: null,
  submitShortcutRestaurants: null,
  setScaleProbeMarkers: null,
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
  setScaleProbeMarkers?: (input: {
    count: number;
    lat: number;
    lng: number;
    label?: string | null;
  }) => boolean;
};

export const registerPerfScenarioCommands = ({
  closeResults,
  setMapCamera,
  animateMapCamera,
  moveMapForSearchThisArea,
  submitShortcutRestaurants,
  setScaleProbeMarkers,
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
  if (setScaleProbeMarkers) {
    commandRegistry.setScaleProbeMarkers = setScaleProbeMarkers;
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
    if (
      setScaleProbeMarkers &&
      commandRegistry.setScaleProbeMarkers === setScaleProbeMarkers
    ) {
      commandRegistry.setScaleProbeMarkers = null;
    }
  };
};

export const readPerfScenarioCommandRegistry = (): PerfScenarioCommandRegistrySnapshot => ({
  closeResults: commandRegistry.closeResults,
  setMapCamera: commandRegistry.setMapCamera,
  animateMapCamera: commandRegistry.animateMapCamera,
  moveMapForSearchThisArea: commandRegistry.moveMapForSearchThisArea,
  submitShortcutRestaurants: commandRegistry.submitShortcutRestaurants,
  setScaleProbeMarkers: commandRegistry.setScaleProbeMarkers,
});
