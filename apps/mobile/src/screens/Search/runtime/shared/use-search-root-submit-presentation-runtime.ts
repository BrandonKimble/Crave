import type {
  ResultsCloseTransitionActions,
  ResultsPresentationActions,
} from './results-presentation-shell-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';

type UseSearchRootSubmitPresentationRuntimeArgs = {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
};

export type SearchRootSubmitPresentationRuntime = {
  closeTransitionActions: ResultsCloseTransitionActions;
  preparedResultsSnapshotKey: string | null;
  scheduleToggleCommit: (kind: 'open_now' | 'rank' | 'price') => string;
  handlePageOneResultsCommitted: (payload: {
    searchRequestId: string | null;
    requestBounds: import('../../../types').MapBounds | null;
    replaceResultsInPlace: boolean;
  }) => void;
  handlePresentationIntentAbort: () => void;
  onPresentationIntentStart: NonNullable<
    Parameters<
      typeof import('../../hooks/use-search-submit-owner').default
    >[0]['uiPorts']['onPresentationIntentStart']
  >;
};

export const useSearchRootSubmitPresentationRuntime = ({
  rootSessionRuntime,
  rootPrimitivesRuntime,
  requestLaneRuntime,
}: UseSearchRootSubmitPresentationRuntimeArgs): SearchRootSubmitPresentationRuntime => {
  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: { resultsPresentationOwner },
    },
  } = requestLaneRuntime;

  const requestSearchPresentationIntent: ResultsPresentationActions['requestSearchPresentationIntent'] =
    resultsPresentationOwner.presentationActions.requestSearchPresentationIntent;
  const cancelCloseSearch: ResultsPresentationActions['cancelCloseSearch'] =
    resultsPresentationOwner.presentationActions.cancelCloseSearch;
  const {
    scheduleToggleCommit,
    pendingTogglePresentationIntentId,
    handlePageOneResultsCommitted,
    handlePresentationIntentAbort,
    closeTransitionActions,
    preparedResultsSnapshotKey,
  } = resultsPresentationOwner;

  const onPresentationIntentStart: SearchRootSubmitPresentationRuntime['onPresentationIntentStart'] =
    (params) => {
      cancelCloseSearch();
      requestSearchPresentationIntent({
        kind: params.kind === 'shortcut_rerun' ? 'shortcut_submit' : 'manual_submit',
        transactionId: pendingTogglePresentationIntentId ?? undefined,
        query:
          params.submittedLabel ??
          (params.mode === 'shortcut'
            ? rootSessionRuntime.resultsArrivalState.submittedQuery
            : rootPrimitivesRuntime.searchState.query.trim()),
        targetTab: params.targetTab,
        preserveSheetState: params.preserveSheetState,
        transitionFromDockedPolls: params.transitionFromDockedPolls,
      });
    };

  return {
    closeTransitionActions,
    preparedResultsSnapshotKey,
    scheduleToggleCommit,
    handlePageOneResultsCommitted,
    handlePresentationIntentAbort,
    onPresentationIntentStart,
  };
};
