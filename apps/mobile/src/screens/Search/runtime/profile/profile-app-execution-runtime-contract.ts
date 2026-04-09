import type {
  ProfileAppForegroundExecutionArgs,
  ProfileAppForegroundExecutionRuntime,
} from './profile-app-foreground-runtime';
import type { ProfileAppRouteExecutionRuntime } from './profile-app-route-runtime';
import type { ProfileAppCloseExecutionArgs } from './profile-app-close-preparation-runtime';
import type { PreparedProfileCloseFinalization } from './profile-app-close-finalization-runtime';

export type ProfileAppExecutionArgs = {
  foregroundExecutionArgs: ProfileAppForegroundExecutionArgs;
  closeExecutionArgs: ProfileAppCloseExecutionArgs;
  resultsExecutionArgs: ProfileAppResultsExecutionArgs;
};

export type ProfileAppResultsExecutionArgs = {
  resultsSheetExecutionModel: import('../shared/results-presentation-owner-contract').ResultsSheetExecutionModel;
};

export type ProfileAppShellExecutionRuntime = {
  foregroundExecutionModel: ProfileAppForegroundExecutionRuntime;
  routeExecutionModel: ProfileAppRouteExecutionRuntime;
  closeExecutionModel: ProfileAppCloseExecutionRuntime;
};

export type ProfileAppCloseExecutionRuntime = {
  prepareForProfileClose: () => void;
  finalizePreparedProfileClose: (closeFinalization: PreparedProfileCloseFinalization) => void;
};

export type ProfileAppExecutionRuntime = {
  shellExecutionModel: ProfileAppShellExecutionRuntime;
  commandExecutionModel: ProfileAppCommandExecutionRuntime;
};

export type ProfileAppCommandExecutionRuntime = {
  requestResultsSheetSnap: (
    snap: 'expanded' | 'middle' | 'collapsed' | 'hidden',
    requestToken: number | null
  ) => void;
  hideResultsSheet: (requestToken: number | null) => void;
  forceSharedMiddleSnap: () => void;
  clearMapHighlightedRestaurantId: () => void;
};
