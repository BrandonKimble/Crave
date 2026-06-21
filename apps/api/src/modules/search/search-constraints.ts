import type { EntityType } from '@prisma/client';
import type { MapBoundsDto } from './dto/search-query.dto';

export type RelaxationStage =
  | 'strict'
  | 'relaxed_restaurant_attributes'
  | 'relaxed_food_attributes'
  | 'relaxed_modifiers';

export interface ConstraintInputPresence {
  restaurants: number;
  food: number;
  foodAttributes: number;
  restaurantAttributes: number;
}

export interface ConstraintResolvedIds {
  restaurantIds: string[];
  foodIds: string[];
  foodAttributeIds: string[];
  restaurantAttributeIds: string[];
}

export interface SearchConstraints {
  stage: RelaxationStage;
  format: 'dual_list';
  inputPresence: ConstraintInputPresence;
  stagePresence: ConstraintInputPresence;
  hadFoodGroup: boolean;
  hadRestaurantGroup: boolean;
  hadFoodAttributeGroup: boolean;
  hadRestaurantAttributeGroup: boolean;
  primaryFoodAttributeQuery: boolean;
  ids: ConstraintResolvedIds;
  filters: {
    bounds?: MapBoundsDto;
    // Screen-accurate viewport polygon ([lng, lat] pairs) — when present, the exact-viewport
    // filter (ST_Covers) the search uses instead of the AABB bounds box.
    viewportPolygon?: Array<[number, number]>;
    openNow?: boolean;
    priceLevels: number[];
    minimumVotes: number | null;
    rising: boolean;
  };
  unresolved: {
    groups: Array<{
      type: EntityType;
      terms: string[];
    }>;
  };
}
