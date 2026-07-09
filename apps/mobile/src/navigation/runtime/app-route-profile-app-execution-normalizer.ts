import type { AppRouteSaveSheetState } from './app-route-overlay-command-controller';
import type { ProfileForegroundUiRestoreState } from './app-route-profile-transition-state-contract';

export type ProfileCloseHydrationCommitInput = {
  resultsIdentityKey: string | null;
  hydratedResultsKey: string | null;
  hydrationOperationId: string | null;
};

export type ProfileCloseHydrationCommitRequest = {
  operationId: string;
  nextHydrationKey: string;
};

export const resolveProfileCloseHydrationCommitRequest = ({
  resultsIdentityKey,
  hydratedResultsKey,
  hydrationOperationId,
}: ProfileCloseHydrationCommitInput): ProfileCloseHydrationCommitRequest | null => {
  if (!resultsIdentityKey || resultsIdentityKey === hydratedResultsKey) {
    return null;
  }
  return {
    operationId: hydrationOperationId ?? 'profile-close-hydration',
    nextHydrationKey: resultsIdentityKey,
  };
};

export const resolveProfileForegroundSaveSheetRestoreState = (
  state: ProfileForegroundUiRestoreState | null
): AppRouteSaveSheetState | null => {
  const restoreState = state as AppRouteSaveSheetState | null;
  return restoreState?.visible ? restoreState : null;
};
