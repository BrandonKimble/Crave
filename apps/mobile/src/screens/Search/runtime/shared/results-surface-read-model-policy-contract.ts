import {
  buildSafeResultsDataByTab,
  type SearchResultsListRowsByTab,
} from '../read-models/list-read-model-builder';
import type {
  ResultsSurfacePolicyRetainedReadModel,
  ResultsSurfacePolicyRowCounts,
  ResultsSurfacePolicyTab,
} from './results-surface-policy-controller';

export type ResultsSurfaceReadModelPolicySnapshot = {
  activeTab: ResultsSurfacePolicyTab;
  retainedReadModel: ResultsSurfacePolicyRetainedReadModel;
  safeResultsDataByTab: SearchResultsListRowsByTab;
  rowsByTab: SearchResultsListRowsByTab;
  rowCountByTab: ResultsSurfacePolicyRowCounts;
  rowCountByTabForSheetPolicy: ResultsSurfacePolicyRowCounts;
  activeTabRowCount: number;
  hasActiveTabRenderableRows: boolean;
};

// ONE LIST (owner ruling): the rows a tab renders ARE its safe server-ranked rows —
// there is no second, "sectioned" row list, so `rowsByTab` and `safeResultsDataByTab`
// are the same arrays and every count is one count.
export const createResultsSurfaceReadModelPolicySnapshot = ({
  activeTab,
  retainedReadModel,
}: {
  activeTab: ResultsSurfacePolicyTab;
  retainedReadModel: ResultsSurfacePolicyRetainedReadModel;
}): ResultsSurfaceReadModelPolicySnapshot => {
  const rowsByTab = buildSafeResultsDataByTab({
    dishes: retainedReadModel.dishes,
    restaurants: retainedReadModel.restaurants,
  });
  const rowCountByTab = {
    dishes: rowsByTab.dishes.length,
    restaurants: rowsByTab.restaurants.length,
  };
  const activeTabRowCount = rowCountByTab[activeTab];

  return {
    activeTab,
    retainedReadModel,
    safeResultsDataByTab: rowsByTab,
    rowsByTab,
    rowCountByTab,
    rowCountByTabForSheetPolicy: rowCountByTab,
    activeTabRowCount,
    hasActiveTabRenderableRows: activeTabRowCount > 0,
  };
};
