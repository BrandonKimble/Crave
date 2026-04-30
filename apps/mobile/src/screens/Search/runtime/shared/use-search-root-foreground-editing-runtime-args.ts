import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootForegroundInputRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import type { SearchForegroundEditingRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';
import { useSearchRootForegroundEditingActionArgs } from './use-search-root-foreground-editing-action-args';
import { useSearchRootForegroundEditingStateArgs } from './use-search-root-foreground-editing-state-args';

type UseSearchRootForegroundEditingRuntimeArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  foregroundInputRuntime: SearchRootForegroundInputRuntime;
  profileOwner: ProfileOwner;
};

export const useSearchRootForegroundEditingRuntimeArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  autocompleteAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  resultsPresentationOwner,
  foregroundInputRuntime,
  profileOwner,
}: UseSearchRootForegroundEditingRuntimeArgsArgs): SearchForegroundEditingRuntimeArgs => {
  const editingStateArgs = useSearchRootForegroundEditingStateArgs({
    stateFoundationLane,
    resultsPresentationOwner,
    profileOwner,
  });
  const editingActionArgs = useSearchRootForegroundEditingActionArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    autocompleteAuthorityRuntime,
    clearRestoreAuthorityRuntime,
    resultsPresentationOwner,
    foregroundInputRuntime,
  });

  return React.useMemo(
    () => ({
      ...editingStateArgs,
      ...editingActionArgs,
    }),
    [editingActionArgs, editingStateArgs]
  );
};
