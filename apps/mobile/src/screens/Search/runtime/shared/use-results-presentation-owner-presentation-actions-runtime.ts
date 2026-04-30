import React from 'react';

import { createResultsPresentationActionsRuntimeValue } from '../controller/results-presentation-owner-presentation-actions-runtime';
import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { ResultsPresentationActions } from './results-presentation-shell-runtime-contract';
import type { SearchPresentationIntent } from './results-presentation-shell-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsPresentationCloseActionsRuntime } from './use-results-presentation-close-actions-runtime';
import { useResultsPresentationEditingActionsRuntime } from './use-results-presentation-editing-actions-runtime';
import { useResultsPresentationEnterActionsRuntime } from './use-results-presentation-enter-actions-runtime';

type UseResultsPresentationOwnerPresentationActionsRuntimeArgs = {
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  submittedQuery: string;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  handleCloseResultsUiReset: () => void;
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    | 'animateSheetTo'
    | 'prepareShortcutSheetTransition'
    | 'resultsSheetRuntimeModel'
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
    | 'sheetState'
  > &
    Pick<AppRouteResultsSheetRuntimeOwner, 'snapPoints'>;
  shellLocalState: ResultsPresentationShellLocalState;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  scheduleCloseSearchCleanup: (closeIntentId: string) => void;
  cancelCloseSearchCleanup: () => void;
  setPendingCloseIntentId: (intentId: string | null) => void;
  matchesPendingCloseIntentId: (intentId: string) => boolean;
  beginCloseTransition: (closeIntentId: string) => void;
  markSearchSheetCloseSheetSettled: (
    snap: Exclude<import('../../../../overlays/types').OverlaySheetSnap, 'hidden'>
  ) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

export const useResultsPresentationOwnerPresentationActionsRuntime = ({
  clearTypedQuery,
  submittedQuery,
  isSearchSessionActive,
  hasResults,
  ignoreNextSearchBlurRef,
  isClearingSearchRef,
  handleCloseResultsUiReset,
  resultsSheetRuntime,
  shellLocalState,
  resultsRuntimeOwner,
  scheduleCloseSearchCleanup,
  cancelCloseSearchCleanup,
  setPendingCloseIntentId,
  matchesPendingCloseIntentId,
  beginCloseTransition,
  markSearchSheetCloseSheetSettled,
  cancelSearchSheetCloseTransition,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationOwnerPresentationActionsRuntimeArgs): ResultsPresentationActions => {
  const closeActionsRuntime = useResultsPresentationCloseActionsRuntime({
    clearTypedQuery,
    submittedQuery,
    isSearchSessionActive,
    hasResults,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    handleCloseResultsUiReset,
    resultsSheetRuntime,
    shellLocalState,
    resultsRuntimeOwner,
    scheduleCloseSearchCleanup,
    cancelCloseSearchCleanup,
    setPendingCloseIntentId,
    matchesPendingCloseIntentId,
    beginCloseTransition,
    markSearchSheetCloseSheetSettled,
    cancelSearchSheetCloseTransition,
  });

  const editingActionsRuntime = useResultsPresentationEditingActionsRuntime({
    shellLocalState,
    routeSceneVisibilityPolicyRuntime,
  });

  const enterActionsRuntime = useResultsPresentationEnterActionsRuntime({
    resultsSheetRuntime,
    shellLocalState,
    resultsRuntimeOwner,
    cancelSearchSheetCloseTransition,
  });

  const requestSearchPresentationIntent = React.useCallback(
    (intent: SearchPresentationIntent) => {
      switch (intent.kind) {
        case 'focus_editing':
        case 'exit_editing':
          return editingActionsRuntime.requestEditingPresentationIntent(intent);
        case 'close':
          return closeActionsRuntime.requestClosePresentationIntent();
        default:
          return enterActionsRuntime.requestEnterPresentationIntent(intent);
      }
    },
    [
      closeActionsRuntime.requestClosePresentationIntent,
      editingActionsRuntime.requestEditingPresentationIntent,
      enterActionsRuntime.requestEnterPresentationIntent,
    ]
  );

  return React.useMemo(
    () =>
      createResultsPresentationActionsRuntimeValue({
        requestSearchPresentationIntent,
        beginCloseSearch: closeActionsRuntime.beginCloseSearch,
        handleCloseResults: closeActionsRuntime.handleCloseResults,
        cancelCloseSearch: closeActionsRuntime.cancelCloseSearch,
      }),
    [
      closeActionsRuntime.beginCloseSearch,
      closeActionsRuntime.cancelCloseSearch,
      closeActionsRuntime.handleCloseResults,
      requestSearchPresentationIntent,
    ]
  );
};
