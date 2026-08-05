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
    // F1036(a): TopFoodPreMeasure latches `done` permanently once its FIRST batch finishes
    // measuring, then renders null forever — it never re-arms for a later, different batch.
    // Mounted here with no `key`, so when `restaurants` changes React reconciled it as an
    // UPDATE (same instance, `done` still true) instead of a remount, and the new batch's
    // uncached widths were silently never measured. Key on a CONTENT signature (not object
    // identity — a fresh `preMeasureKeys` object every render must NOT force a remount loop)
    // so only a genuinely different set of items/moreCounts to measure gets a fresh instance.
    const contentKey = `${preMeasureKeys.items.map((item) => item.connectionId).join(',')}|${preMeasureKeys.moreCounts.join(',')}`;
    return (
      <TopFoodPreMeasure
        key={contentKey}
        items={preMeasureKeys.items}
        moreCounts={preMeasureKeys.moreCounts}
      />
    );
  }, [preMeasureKeys]);
};
