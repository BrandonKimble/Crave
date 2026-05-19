type PerfScenarioCommandRegistrySnapshot = {
  closeResults: (() => void) | null;
  setMapCamera:
    | ((input: { lat: number; lng: number; zoom: number; label?: string | null }) => boolean)
    | null;
  moveMapForSearchThisArea:
    | ((input: { lat: number; lng: number; zoom: number; label?: string | null }) => boolean)
    | null;
  submitShortcutRestaurants: (() => Promise<void>) | null;
};

const commandRegistry: PerfScenarioCommandRegistrySnapshot = {
  closeResults: null,
  setMapCamera: null,
  moveMapForSearchThisArea: null,
  submitShortcutRestaurants: null,
};

export type PerfScenarioCommandRegistration = {
  closeResults?: () => void;
  setMapCamera?: (input: {
    lat: number;
    lng: number;
    zoom: number;
    label?: string | null;
  }) => boolean;
  moveMapForSearchThisArea?: (input: {
    lat: number;
    lng: number;
    zoom: number;
    label?: string | null;
  }) => boolean;
  submitShortcutRestaurants?: () => Promise<void>;
};

export const registerPerfScenarioCommands = ({
  closeResults,
  setMapCamera,
  moveMapForSearchThisArea,
  submitShortcutRestaurants,
}: PerfScenarioCommandRegistration): (() => void) => {
  if (closeResults) {
    commandRegistry.closeResults = closeResults;
  }
  if (setMapCamera) {
    commandRegistry.setMapCamera = setMapCamera;
  }
  if (moveMapForSearchThisArea) {
    commandRegistry.moveMapForSearchThisArea = moveMapForSearchThisArea;
  }
  if (submitShortcutRestaurants) {
    commandRegistry.submitShortcutRestaurants = submitShortcutRestaurants;
  }

  return () => {
    if (closeResults && commandRegistry.closeResults === closeResults) {
      commandRegistry.closeResults = null;
    }
    if (setMapCamera && commandRegistry.setMapCamera === setMapCamera) {
      commandRegistry.setMapCamera = null;
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
  };
};

export const readPerfScenarioCommandRegistry = (): PerfScenarioCommandRegistrySnapshot => ({
  closeResults: commandRegistry.closeResults,
  setMapCamera: commandRegistry.setMapCamera,
  moveMapForSearchThisArea: commandRegistry.moveMapForSearchThisArea,
  submitShortcutRestaurants: commandRegistry.submitShortcutRestaurants,
});
