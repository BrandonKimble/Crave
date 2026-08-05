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
