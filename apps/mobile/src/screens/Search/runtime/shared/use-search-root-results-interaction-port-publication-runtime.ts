import React from 'react';

import type { ResultsSheetInteractionModel } from './results-sheet-interaction-contract';
import type { SearchRootResultsInteractionPorts } from './search-root-control-ports-runtime-contract';

type UseSearchRootResultsInteractionPortPublicationRuntimeArgs = {
  resultsInteractionPorts: SearchRootResultsInteractionPorts;
  resultsSheetInteractionModel: Pick<
    ResultsSheetInteractionModel,
    'resetResultsListScrollProgress'
  >;
};

export const useSearchRootResultsInteractionPortPublicationRuntime = ({
  resultsInteractionPorts,
  resultsSheetInteractionModel,
}: UseSearchRootResultsInteractionPortPublicationRuntimeArgs) => {
  React.useEffect(() => {
    resultsInteractionPorts.resetResultsListScrollProgressRef.current =
      resultsSheetInteractionModel.resetResultsListScrollProgress;
  }, [
    resultsInteractionPorts.resetResultsListScrollProgressRef,
    resultsSheetInteractionModel.resetResultsListScrollProgress,
  ]);
};
