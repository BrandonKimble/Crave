import React from 'react';
import type { ResultsListItem } from '../read-models/read-model-selectors';

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

  const overrideItemLayout = React.useCallback(
    (layout: { size?: number; span?: number }, item: ResultsListItem) => {
      if (item && typeof item === 'object' && 'kind' in item) {
        layout.size =
          item.kind === 'section' ? 44 : item.kind === 'mounted_restaurant_card' ? 270 : 88;
        return;
      }
      layout.size = 'foodId' in item ? 240 : 270;
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
