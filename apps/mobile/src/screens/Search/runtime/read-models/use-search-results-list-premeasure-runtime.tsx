import React from 'react';

import type { RestaurantResult } from '../../../../types';
import TopFoodPreMeasure from '../../components/TopFoodPreMeasure';
import { TOP_FOOD_RENDER_LIMIT } from '../../constants/search';
import { computeTopFoodPreMeasureKeys } from '../../hooks/use-top-food-measurement';

type SearchResultsListPremeasureRuntimeArgs = {
  restaurants: RestaurantResult[];
};

export const useSearchResultsListPremeasureRuntime = ({
  restaurants,
}: SearchResultsListPremeasureRuntimeArgs) => {
  const preMeasureKeys = React.useMemo(() => {
    if (restaurants.length === 0) {
      return null;
    }
    const keys = computeTopFoodPreMeasureKeys(restaurants, TOP_FOOD_RENDER_LIMIT);
    if (keys.items.length === 0 && keys.moreCounts.length === 0) {
      return null;
    }
    return keys;
  }, [restaurants]);

  return React.useMemo(() => {
    if (!preMeasureKeys) {
      return null;
    }
    return (
      <TopFoodPreMeasure
        items={preMeasureKeys.items}
        moreCounts={preMeasureKeys.moreCounts}
      />
    );
  }, [preMeasureKeys]);
};
