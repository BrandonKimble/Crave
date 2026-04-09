import type React from 'react';

import type { FoodResult, RestaurantResult } from '../../../../types';
export type SearchResultsPanelCardRuntime = {
  onDemandNotice: React.ReactNode;
  renderDishCard: (item: FoodResult, index: number) => React.ReactNode;
  renderRestaurantCard: (restaurant: RestaurantResult, index: number) => React.ReactNode;
};

export type SearchResultsPanelCardMetricsRuntime = {
  canonicalRestaurantRankById: Map<string, number>;
  restaurantsById: Map<string, RestaurantResult>;
  primaryCoverageKey: string | null;
  hasCrossCoverage: boolean;
  primaryFoodTerm: string | null;
  restaurantQualityColorById: Map<string, string>;
  dishQualityColorByConnectionId: Map<string, string>;
};
