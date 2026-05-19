import type { ProfileAppForegroundExecutionArgs } from './profile-app-foreground-runtime';
import type { ProfileAppCloseExecutionArgs } from './profile-app-close-preparation-runtime';

export type ProfileAppExecutionArgs = {
  foregroundExecutionArgs: ProfileAppForegroundExecutionArgs;
  closeExecutionArgs: ProfileAppCloseExecutionArgs;
  resultsExecutionArgs: ProfileAppResultsExecutionArgs;
};

export type ProfileAppResultsExecutionArgs = Record<string, never>;
