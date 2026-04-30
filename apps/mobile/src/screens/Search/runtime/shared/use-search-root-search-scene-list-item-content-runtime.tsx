import React from 'react';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';

export const useSearchRootSearchSceneListItemContentRuntime = ({
  activeTab,
  renderListItem,
}: {
  activeTab: 'dishes' | 'restaurants';
  renderListItem: ReturnType<
    typeof useSearchResultsReadModelSelectors
  >['renderListItem'];
}) => {
  const resultsKeyExtractor = React.useCallback(
    (item: ResultsListItem, index: number) => {
      if (item && typeof item === 'object' && 'kind' in item) {
        return item.key || `row-${index}`;
      }
      if (item && 'foodId' in item) {
        if (item.connectionId) {
          return item.connectionId;
        }
        if (item.foodId && item.restaurantId) {
          return `${item.foodId}-${item.restaurantId}`;
        }
        return `dish-${index}`;
      }
      if (item && 'restaurantId' in item) {
        return item.restaurantId || `restaurant-${index}`;
      }
      return `result-${index}`;
    },
    []
  );

  const estimatedItemSize =
    activeTab === 'dishes' ? 240 : 270;
  const resultsRenderItem = renderListItem;

  return React.useMemo(
    () => ({
      estimatedItemSize,
      resultsKeyExtractor,
      resultsRenderItem,
    }),
    [
      estimatedItemSize,
      resultsKeyExtractor,
      resultsRenderItem,
    ]
  );
};
