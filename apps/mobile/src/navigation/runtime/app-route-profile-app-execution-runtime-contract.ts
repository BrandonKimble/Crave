import type {
  PreparedProfileCloseFinalization,
  PreparedProfileRouteIntent,
  ProfilePresentationCommandExecutionContext,
} from './app-route-profile-prepared-presentation-transaction-contract';
import type { ProfileForegroundUiRestoreState } from './app-route-profile-transition-state-contract';

export type ProfileAppForegroundExecutionRuntime = {
  prepareForegroundUiForProfileOpen: (options?: {
    captureSaveSheetState?: boolean;
  }) => ProfileForegroundUiRestoreState | null;
};

export type ProfileAppRouteExecutionRuntime = {
  applyProfileRouteIntent: (
    routeIntent: PreparedProfileRouteIntent,
    executionContext: ProfilePresentationCommandExecutionContext
  ) => void;
};

export type ProfileAppCloseExecutionRuntime = {
  prepareForProfileClose: () => void;
  finalizePreparedProfileClose: (closeFinalization: PreparedProfileCloseFinalization) => void;
};

export type ProfileAppShellExecutionRuntime = {
  foregroundExecutionModel: ProfileAppForegroundExecutionRuntime;
  routeExecutionModel: ProfileAppRouteExecutionRuntime;
  closeExecutionModel: ProfileAppCloseExecutionRuntime;
};

export type ProfileAppCommandExecutionRuntime = {
  clearMapHighlightedRestaurantId: () => void;
};

export type ProfileAppExecutionRuntime = {
  shellExecutionModel: ProfileAppShellExecutionRuntime;
  commandExecutionModel: ProfileAppCommandExecutionRuntime;
};
