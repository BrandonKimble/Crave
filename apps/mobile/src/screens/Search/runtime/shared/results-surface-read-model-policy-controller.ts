import {
  createSearchResultsExactMatchOwnerController,
  type SearchResultsExactMatchOwnerController,
} from '../read-models/results-read-model-exact-match-state';
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
  getExactMatchController: () => SearchResultsExactMatchOwnerController;
  getRetainedResultsController: () => SearchResultsRetainedResultsController<ResultsSurfacePolicyResults>;
  readSnapshot: (args: {
    activeTab: ResultsSurfacePolicyTab;
    results: ResultsSurfacePolicyResults;
    shouldRetainCommittedResults: boolean;
  }) => ResultsSurfaceReadModelPolicySnapshot;
  reset: (results: ResultsSurfacePolicyResults) => void;
  showMoreExactDishes: () => void;
  showMoreExactRestaurants: () => void;
  updateExactMatchResults: (results: ResultsSurfacePolicyResults) => void;
};

export const createResultsSurfaceReadModelPolicyController = ({
  initialResults = null,
}: ResultsSurfaceReadModelPolicyControllerOptions = {}): ResultsSurfaceReadModelPolicyController => {
  const retainedResultsController =
    createSearchResultsRetainedResultsController<ResultsSurfacePolicyResults>(initialResults);
  const exactMatchController = createSearchResultsExactMatchOwnerController();

  return {
    commitResults({ results, shouldRetainCommittedResults }) {
      retainedResultsController.commitRetainedResults({
        results,
        shouldRetainCommittedResults,
      });
      exactMatchController.updateResults(results);
    },
    getExactMatchController: () => exactMatchController,
    getRetainedResultsController: () => retainedResultsController,
    readSnapshot({ activeTab, results, shouldRetainCommittedResults }) {
      return createResultsSurfaceReadModelPolicySnapshot({
        activeTab,
        exactMatchState: exactMatchController.getProjection(),
        retainedReadModel: retainedResultsController.readRetainedReadModel({
          results,
          shouldRetainCommittedResults,
        }),
      });
    },
    reset(results) {
      retainedResultsController.reset(results);
      exactMatchController.reset();
    },
    showMoreExactDishes() {
      exactMatchController.showMoreExactDishes();
    },
    showMoreExactRestaurants() {
      exactMatchController.showMoreExactRestaurants();
    },
    updateExactMatchResults(results) {
      exactMatchController.updateResults(results);
    },
  };
};
