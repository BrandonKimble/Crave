import React from 'react';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import { SEARCH_RESULTS_ROW_KIND_HEIGHTS } from './search-results-page-bands';

export const useSearchRootSearchSceneListItemTransportRuntime = () => {
  const getResultItemType = React.useCallback((item: ResultsListItem) => {
    if (item && typeof item === 'object' && 'kind' in item) {
      if (item.kind === 'mounted_restaurant_card') {
        return 'restaurant';
      }
      return item.kind;
    }
    return 'foodId' in item ? 'dish' : 'restaurant';
  }, []);

  // F1325: row heights come from the band declaration's ONE home
  // (SEARCH_RESULTS_ROW_KIND_HEIGHTS) — see search-results-page-bands.ts.
  const overrideItemLayout = React.useCallback(
    (layout: { size?: number; span?: number }, item: ResultsListItem) => {
      if (item && typeof item === 'object' && 'kind' in item) {
        layout.size =
          item.kind === 'mounted_restaurant_card'
            ? SEARCH_RESULTS_ROW_KIND_HEIGHTS.mountedRestaurantCard
            : SEARCH_RESULTS_ROW_KIND_HEIGHTS.kindFallback;
        return;
      }
      layout.size =
        'foodId' in item
          ? SEARCH_RESULTS_ROW_KIND_HEIGHTS.dish
          : SEARCH_RESULTS_ROW_KIND_HEIGHTS.restaurant;
    },
    []
  );

  return React.useMemo(
    () => ({
      getResultItemType,
      overrideItemLayout,
    }),
    [getResultItemType, overrideItemLayout]
  );
};
