import React from 'react';

import type { FoodResult } from '../../../../types';
import { getMarkerColorForDish } from '../../utils/marker-lod';

export const useSearchResultsPanelDishCardMetricsRuntime = ({
  dishes,
}: {
  dishes: FoodResult[];
}) => {
  const dishQualityColorByConnectionId = React.useMemo(() => {
    const map = new Map<string, string>();
    dishes.forEach((dish) => {
      map.set(dish.connectionId, getMarkerColorForDish(dish));
    });
    return map;
  }, [dishes]);

  return React.useMemo(
    () => ({
      dishQualityColorByConnectionId,
    }),
    [dishQualityColorByConnectionId]
  );
};
