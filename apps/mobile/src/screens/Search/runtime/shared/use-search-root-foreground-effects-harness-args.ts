import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootMutationCancelAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { FilterModalRuntime } from './use-search-root-control-plane-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import type { SearchForegroundEffectsRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundEffectsHarnessArgs = Pick<
  SearchForegroundEffectsRuntimeArgs,
  | 'registerPendingMutationWorkCancel'
  | 'cancelToggleInteraction'
  | 'toggleOpenNowHarnessRef'
  | 'toggleOpenNow'
  | 'selectOverlayHarnessRef'
>;

type UseSearchRootForegroundEffectsHarnessArgsArgs = {
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  mutationCancelAuthorityRuntime: SearchRootMutationCancelAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  filterModalRuntime: FilterModalRuntime;
};

export const useSearchRootForegroundEffectsHarnessArgs = ({
  rootOverlayFoundationRuntime,
  mutationCancelAuthorityRuntime,
  resultsPresentationOwner,
  filterModalRuntime,
}: UseSearchRootForegroundEffectsHarnessArgsArgs): SearchRootForegroundEffectsHarnessArgs => {
  const { rootInstrumentationRuntime } = rootOverlayFoundationRuntime;
  const { mutationCancelPort } = mutationCancelAuthorityRuntime;

  return React.useMemo(
    () => ({
      registerPendingMutationWorkCancel:
        mutationCancelPort.registerPendingMutationWorkCancel,
      cancelToggleInteraction: resultsPresentationOwner.cancelToggleInteraction,
      toggleOpenNowHarnessRef: rootInstrumentationRuntime.toggleOpenNowHarnessRef,
      toggleOpenNow: filterModalRuntime.toggleOpenNow,
      selectOverlayHarnessRef: rootInstrumentationRuntime.selectOverlayHarnessRef,
    }),
    [
      filterModalRuntime.toggleOpenNow,
      mutationCancelPort.registerPendingMutationWorkCancel,
      resultsPresentationOwner.cancelToggleInteraction,
      rootInstrumentationRuntime.selectOverlayHarnessRef,
      rootInstrumentationRuntime.toggleOpenNowHarnessRef,
    ]
  );
};
