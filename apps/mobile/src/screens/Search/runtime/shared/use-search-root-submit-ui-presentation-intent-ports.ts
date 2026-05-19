import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';

type SearchRootSubmitUiPresentationIntentPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  'onPresentationIntentStart' | 'onPresentationIntentAbort'
>;

type UseSearchRootSubmitUiPresentationIntentPortsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  resultsPresentationOwner: ResultsPresentationOwner;
  submitReadModel: Parameters<typeof useSearchSubmitOwnerValue>[0]['readModel'];
};

export const useSearchRootSubmitUiPresentationIntentPorts = ({
  stateFoundationLane,
  resultsPresentationOwner,
  submitReadModel,
}: UseSearchRootSubmitUiPresentationIntentPortsArgs): SearchRootSubmitUiPresentationIntentPorts => {
  const { rootPrimitivesRuntime } = stateFoundationLane;

  return React.useMemo(
    () => ({
      onPresentationIntentStart: (params) => {
        resultsPresentationOwner.presentationActions.cancelCloseSearch();
        if (params.kind === 'search_this_area') {
          resultsPresentationOwner.beginSearchThisAreaPresentationPending();
          return;
        }
        const presentationKind =
          params.kind === 'shortcut_rerun' ? 'shortcut_submit' : 'manual_submit';
        resultsPresentationOwner.presentationActions.requestSearchPresentationIntent({
          kind: presentationKind,
          transactionId: resultsPresentationOwner.pendingTogglePresentationIntentId ?? undefined,
          query:
            params.submittedLabel ??
            (params.mode === 'shortcut'
              ? submitReadModel.submittedQuery
              : rootPrimitivesRuntime.searchState.query.trim()),
          targetTab: params.targetTab,
          preserveSheetState: params.preserveSheetState,
          transitionFromDockedPolls: params.transitionFromDockedPolls,
          entrySurface: params.entrySurface,
        });
      },
      onPresentationIntentAbort: resultsPresentationOwner.handlePresentationIntentAbort,
    }),
    [
      resultsPresentationOwner,
      rootPrimitivesRuntime.searchState.query,
      submitReadModel.submittedQuery,
    ]
  );
};
