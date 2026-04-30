import type { ResultsListItem } from '../read-models/list-read-model-builder';
import type { SearchResultsExactMatchProjection } from '../read-models/results-read-model-exact-match-state';
import {
  buildSearchResultsSectionedProjection,
  resolveSearchResultsSectionedProjectionCounts,
  type SearchResultsSectionedProjectionCounts,
} from '../read-models/results-read-model-sectioned-projection';
import type {
  ResultsSurfacePolicyRetainedReadModel,
  ResultsSurfacePolicyRowCounts,
  ResultsSurfacePolicyTab,
} from './results-surface-policy-controller';

export type ResultsSurfaceReadModelPolicySnapshot = {
  activeTab: ResultsSurfacePolicyTab;
  retainedReadModel: ResultsSurfacePolicyRetainedReadModel;
  exactMatchState: SearchResultsExactMatchProjection;
  safeResultsDataByTab: ReturnType<
    typeof buildSearchResultsSectionedProjection
  >['safeResultsDataByTab'];
  rowsByTab: {
    dishes: ResultsListItem[];
    restaurants: ResultsListItem[];
  };
  safeRowCountByTab: SearchResultsSectionedProjectionCounts['safeRowCountByTab'];
  sectionedRowCountByTab: ResultsSurfacePolicyRowCounts;
  rowCountByTabForSheetPolicy: ResultsSurfacePolicyRowCounts;
  activeTabSectionedRowCount: number;
  hasActiveTabRenderableRows: boolean;
};

export const createResultsSurfaceReadModelPolicySnapshot = ({
  activeTab,
  exactMatchState,
  retainedReadModel,
}: {
  activeTab: ResultsSurfacePolicyTab;
  exactMatchState: SearchResultsExactMatchProjection;
  retainedReadModel: ResultsSurfacePolicyRetainedReadModel;
}): ResultsSurfaceReadModelPolicySnapshot => {
  const sectionedProjection = buildSearchResultsSectionedProjection({
    dishes: retainedReadModel.dishes,
    restaurants: retainedReadModel.restaurants,
    exactMatchState,
  });
  const projectionCounts = resolveSearchResultsSectionedProjectionCounts(sectionedProjection);
  const activeTabSectionedRowCount = projectionCounts.sectionedRowCountByTab[activeTab];

  return {
    activeTab,
    retainedReadModel,
    exactMatchState,
    safeResultsDataByTab: sectionedProjection.safeResultsDataByTab,
    rowsByTab: sectionedProjection.sectionedRowsByTab,
    safeRowCountByTab: projectionCounts.safeRowCountByTab,
    sectionedRowCountByTab: projectionCounts.sectionedRowCountByTab,
    rowCountByTabForSheetPolicy: projectionCounts.sectionedRowCountByTab,
    activeTabSectionedRowCount,
    hasActiveTabRenderableRows: activeTabSectionedRowCount > 0,
  };
};
