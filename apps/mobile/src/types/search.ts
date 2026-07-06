// TODO(shared-types): the include-similar search contract below is NOT on
// packages/shared main yet (it lives on the API session's branch). This module
// augmentation mirrors that contract for the mobile client:
//   - request: `includeSimilar?: boolean` (explicit value overrides the server env
//     default; false suppresses silent dense widening)
//   - page-1 responses: `similarDishes` / `similarRestaurants` arrays +
//     `metadata.similarAvailable` (count)
//   - every row: `exactMatch?: boolean` (false = dense sibling) and
//     `relevance?: number` (1.0 for exact)
// Move these fields into packages/shared/src/types/search.ts (and delete this
// augmentation) once the API branch lands on main.
declare module '@crave-search/shared' {
  interface FoodResult {
    exactMatch?: boolean;
    relevance?: number;
  }
  interface RestaurantResult {
    exactMatch?: boolean;
    relevance?: number;
  }
  interface SearchResponse {
    similarDishes?: import('@crave-search/shared').FoodResult[];
    similarRestaurants?: import('@crave-search/shared').RestaurantResult[];
  }
  interface SearchResponseMetadata {
    similarAvailable?: number;
  }
  interface NaturalSearchRequest {
    includeSimilar?: boolean;
  }
}

export type {
  Coordinate,
  DishRestaurantData,
  DishRestaurantLocation,
  DishResult,
  EntityScope,
  FilterClause,
  FoodResult,
  MapBounds,
  NaturalSearchRequest,
  OperatingStatus,
  Pagination,
  QueryFormat,
  QueryPlan,
  RestaurantFoodSnippet,
  RestaurantMatchedTag,
  RestaurantProfile,
  RestaurantResult,
  RestaurantResultScorePreview,
  ScoreInfoSummary,
  SearchResponse,
  SearchResponseMetadata,
} from '@crave-search/shared';
