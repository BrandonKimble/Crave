import React from 'react';
import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import { resolveSearchResultsBand, searchResultsRowKeyOf } from './search-results-page-bands';

export const useSearchRootSearchSceneListItemContentRuntime = ({
  activeTab,
  renderListItem,
}: {
  activeTab: 'dishes' | 'restaurants';
  renderListItem: ReturnType<typeof useSearchResultsReadModelSelectors>['renderListItem'];
}) => {
  // Template facts come from the band DECLARATION (search-results-page-bands) — the
  // one home; this runtime only projects the active band.
  const resultsKeyExtractor = searchResultsRowKeyOf;
  const estimatedItemSize = resolveSearchResultsBand(activeTab).estimatedRowHeight;
  const resultsRenderItem = renderListItem;

  return React.useMemo(
    () => ({
      estimatedItemSize,
      resultsKeyExtractor,
      resultsRenderItem,
    }),
    [estimatedItemSize, resultsKeyExtractor, resultsRenderItem]
  );
};
