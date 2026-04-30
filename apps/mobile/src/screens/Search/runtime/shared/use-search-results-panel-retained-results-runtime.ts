import React from 'react';

import type { SearchResultsPanelRetainedResultsRuntime } from './search-results-panel-hydration-runtime-contract';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';
import type { SearchResultsShellModel } from './results-presentation-shell-contract';
import type { SearchRouteResultsPolicyRetainedResultsWriterFacet } from './search-route-results-policy-domain-contract';
import { createSearchResultsRetainedResultsController } from './results-retained-read-model-controller';

type UseSearchResultsPanelRetainedResultsRuntimeArgs = {
  results: SearchResultsPayload;
  searchSheetContentLane: SearchResultsShellModel['searchSheetContentLane'];
  retainedResultsWriter?: SearchRouteResultsPolicyRetainedResultsWriterFacet;
};

export const useSearchResultsPanelRetainedResultsRuntime = ({
  results,
  searchSheetContentLane,
  retainedResultsWriter: providedRetainedResultsWriter,
}: UseSearchResultsPanelRetainedResultsRuntimeArgs): SearchResultsPanelRetainedResultsRuntime => {
  const shouldRetainCommittedResults = searchSheetContentLane.kind !== 'persistent_poll';
  const localRetainedResultsController = React.useMemo(
    () => createSearchResultsRetainedResultsController<SearchResultsPayload>(results),
    []
  );
  const retainedResultsWriter = providedRetainedResultsWriter ?? localRetainedResultsController;
  const [retainedResults, setRetainedResults] = React.useState(
    retainedResultsWriter.getRetainedResults
  );

  React.useEffect(() => {
    setRetainedResults(
      retainedResultsWriter.commitRetainedResults({
        results,
        shouldRetainCommittedResults,
      })
    );
  }, [results, retainedResultsWriter, shouldRetainCommittedResults]);

  const retainedReadModel = React.useMemo(
    () =>
      retainedResultsWriter.readRetainedReadModel({
        results,
        shouldRetainCommittedResults,
      }),
    [results, retainedResults, retainedResultsWriter, shouldRetainCommittedResults]
  );

  return React.useMemo(
    () => ({
      resolvedResults: retainedReadModel.resolvedResults,
      dishes: retainedReadModel.dishes,
      restaurants: retainedReadModel.restaurants,
    }),
    [retainedReadModel.dishes, retainedReadModel.resolvedResults, retainedReadModel.restaurants]
  );
};
