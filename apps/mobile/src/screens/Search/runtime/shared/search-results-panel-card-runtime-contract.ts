import type React from 'react';

import type { FoodResult, RestaurantResult } from '../../../../types';
export type SearchResultsPanelCardRuntime = {
  onDemandNotice: React.ReactNode;
  renderDishCard: (item: FoodResult, index: number) => React.ReactNode;
  renderRestaurantCard: (restaurant: RestaurantResult, index: number) => React.ReactNode;
};
