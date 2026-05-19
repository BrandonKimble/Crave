import type React from 'react';

import type { FoodResult, RestaurantResult } from '../../../../types';
import type { RestaurantResultCardDescriptor } from '../../components/restaurant-result-card-descriptor';
export type SearchResultsPanelCardRuntime = {
  onDemandNotice: React.ReactNode;
  renderDishCard: (item: FoodResult, index: number) => React.ReactNode;
  renderRestaurantCard: (
    restaurant: RestaurantResult,
    index: number,
    preparedDescriptor?: RestaurantResultCardDescriptor | null
  ) => React.ReactNode;
};
