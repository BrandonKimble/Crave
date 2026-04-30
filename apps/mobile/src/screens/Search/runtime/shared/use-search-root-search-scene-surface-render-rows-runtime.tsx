import React from 'react';

import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';

type UseSearchRootSearchSceneSurfaceRenderRowsRuntimeArgs = {
  activeTab: ReturnType<
    typeof useSearchResultsPanelResultsRuntimeState
  >['activeTab'];
  resultsReadModelSelectors: ReturnType<
    typeof useSearchResultsReadModelSelectors
  >;
};

export const useSearchRootSearchSceneSurfaceRenderRowsRuntime = ({
  activeTab,
  resultsReadModelSelectors,
}: UseSearchRootSearchSceneSurfaceRenderRowsRuntimeArgs) => {
  const primaryTab: 'restaurants' | 'dishes' = 'restaurants';
  const secondaryTab: 'restaurants' | 'dishes' = 'dishes';

  return React.useMemo(() => {
    const activeListLive: 'primary' | 'secondary' =
      activeTab === primaryTab ? 'primary' : 'secondary';
    const primaryRowsLive = resultsReadModelSelectors.rowsByTab[primaryTab];
    const secondaryRowsLive = resultsReadModelSelectors.rowsByTab[secondaryTab];
    const renderRowCountLive = resultsReadModelSelectors.rowsByTab[activeTab].length;

    return {
      activeListLive,
      primaryRowsLive,
      renderRowCountLive,
      secondaryRowsLive,
    };
  }, [activeTab, resultsReadModelSelectors.rowsByTab]);
};
