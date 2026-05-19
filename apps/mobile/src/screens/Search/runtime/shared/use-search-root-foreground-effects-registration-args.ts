import React from 'react';

import type { SearchRootMutationCancelAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import type { SearchForegroundEffectsRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundEffectsRegistrationArgs = Pick<
  SearchForegroundEffectsRuntimeArgs,
  'registerPendingMutationWorkCancel' | 'cancelToggleInteraction'
>;

type UseSearchRootForegroundEffectsRegistrationArgsArgs = {
  mutationCancelAuthorityRuntime: SearchRootMutationCancelAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
};

export const useSearchRootForegroundEffectsRegistrationArgs = ({
  mutationCancelAuthorityRuntime,
  resultsPresentationOwner,
}: UseSearchRootForegroundEffectsRegistrationArgsArgs): SearchRootForegroundEffectsRegistrationArgs => {
  const { mutationCancelPort } = mutationCancelAuthorityRuntime;

  return React.useMemo(
    () => ({
      registerPendingMutationWorkCancel: mutationCancelPort.registerPendingMutationWorkCancel,
      cancelToggleInteraction: resultsPresentationOwner.cancelToggleInteraction,
    }),
    [
      mutationCancelPort.registerPendingMutationWorkCancel,
      resultsPresentationOwner.cancelToggleInteraction,
    ]
  );
};
