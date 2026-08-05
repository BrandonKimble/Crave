export type ProfileAppForegroundExecutionRuntime = {
  prepareForegroundUiForProfileOpen: () => void;
};

// L3 slice 4: the machine's route-intent + close-finalization arms are DELETED — the
// standard push/pop owns navigation; the pop-teardown owner runs the close.
export type ProfileAppCloseExecutionRuntime = {
  prepareForProfileClose: () => void;
};

export type ProfileAppShellExecutionRuntime = {
  foregroundExecutionModel: ProfileAppForegroundExecutionRuntime;
  closeExecutionModel: ProfileAppCloseExecutionRuntime;
};

export type ProfileAppCommandExecutionRuntime = {
  clearMapHighlightedRestaurantId: () => void;
};

export type ProfileAppExecutionRuntime = {
  shellExecutionModel: ProfileAppShellExecutionRuntime;
  commandExecutionModel: ProfileAppCommandExecutionRuntime;
};
