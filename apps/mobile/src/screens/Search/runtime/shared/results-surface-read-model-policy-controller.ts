import {
  createSearchResultsRetainedResultsController,
  type SearchResultsRetainedResultsController,
} from './results-retained-read-model-controller';
import {
  createResultsSurfaceReadModelPolicySnapshot,
  type ResultsSurfaceReadModelPolicySnapshot,
} from './results-surface-read-model-policy-contract';
import type {
  ResultsSurfacePolicyResults,
  ResultsSurfacePolicyTab,
} from './results-surface-policy-controller';

export type ResultsSurfaceReadModelPolicyControllerOptions = {
  initialResults?: ResultsSurfacePolicyResults;
};

export type ResultsSurfaceReadModelPolicyController = {
  commitResults: (args: {
    results: ResultsSurfacePolicyResults;
    shouldRetainCommittedResults: boolean;
  }) => void;
  getRetainedResultsController: () => SearchResultsRetainedResultsController<ResultsSurfacePolicyResults>;
  readSnapshot: (args: {
    activeTab: ResultsSurfacePolicyTab;
    results: ResultsSurfacePolicyResults;
    shouldRetainCommittedResults: boolean;
  }) => ResultsSurfaceReadModelPolicySnapshot;
  reset: (results: ResultsSurfacePolicyResults) => void;
};

export const createResultsSurfaceReadModelPolicyController = ({
  initialResults = null,
}: ResultsSurfaceReadModelPolicyControllerOptions = {}): ResultsSurfaceReadModelPolicyController => {
  const retainedResultsController =
    createSearchResultsRetainedResultsController<ResultsSurfacePolicyResults>(initialResults);

  return {
    commitResults({ results, shouldRetainCommittedResults }) {
      retainedResultsController.commitRetainedResults({
        results,
        shouldRetainCommittedResults,
      });
    },
    getRetainedResultsController: () => retainedResultsController,
    readSnapshot({ activeTab, results, shouldRetainCommittedResults }) {
      return createResultsSurfaceReadModelPolicySnapshot({
        activeTab,
        retainedReadModel: retainedResultsController.readRetainedReadModel({
          results,
          shouldRetainCommittedResults,
        }),
      });
    },
    reset(results) {
      retainedResultsController.reset(results);
    },
  };
};
