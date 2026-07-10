import type { ProfileForegroundUiRestoreState } from './app-route-profile-transition-state-contract';

export type ProfileAppForegroundExecutionRuntime = {
  prepareForegroundUiForProfileOpen: (options?: {
    captureSaveSheetState?: boolean;
  }) => ProfileForegroundUiRestoreState | null;
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
