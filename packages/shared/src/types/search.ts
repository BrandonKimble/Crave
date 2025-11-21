export type ActivityLevel = 'trending' | 'active' | 'normal';

export type EntityScope = 'restaurant' | 'food' | 'food_attribute' | 'restaurant_attribute';

export type QueryFormat = 'single_list' | 'dual_list';

export type FilterStage = 'restaurant' | 'connection';

export interface FilterClause {
  scope: FilterStage;
  description: string;
  entityType: EntityScope;
  entityIds: string[];
  payload?: Record<string, unknown>;
}

export interface QueryPlan {
  format: QueryFormat;
  restaurantFilters: FilterClause[];
  connectionFilters: FilterClause[];
  ranking: {
    foodOrder: string;
    restaurantOrder: string;
  };
  diagnostics: {
    missingEntities: EntityScope[];
    notes: string[];
  };
}

export interface OperatingStatus {
  isOpen: boolean | null;
  closesAtDisplay?: string | null;
  closesInMinutes?: number | null;
  nextOpenDisplay?: string | null;
}

export interface FoodResult {
  connectionId: string;
  foodId: string;
  foodName: string;
  foodAliases: string[];
  restaurantId: string;
  restaurantName: string;
  restaurantAliases: string[];
  qualityScore: number;
  activityLevel: ActivityLevel;
  mentionCount: number;
  totalUpvotes: number;
  recentMentionCount: number;
  lastMentionedAt?: string | null;
  categories: string[];
  foodAttributes: string[];
  restaurantPriceLevel?: number | null;
  restaurantPriceSymbol?: string | null;
  restaurantDistanceMiles?: number | null;
  restaurantOperatingStatus?: OperatingStatus | null;
}

export interface RestaurantFoodSnippet {
  connectionId: string;
  foodId: string;
  foodName: string;
  qualityScore: number;
  activityLevel: ActivityLevel;
}

export interface RestaurantResult {
  restaurantId: string;
  restaurantName: string;
  restaurantAliases: string[];
  contextualScore: number;
  restaurantQualityScore?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  priceLevel?: number | null;
  priceSymbol?: string | null;
  priceText?: string | null;
  priceLevelUpdatedAt?: string | null;
  topFood: RestaurantFoodSnippet[];
  operatingStatus?: OperatingStatus | null;
  distanceMiles?: number | null;
}

export interface SearchResponseMetadata {
  totalFoodResults: number;
  totalRestaurantResults: number;
  queryExecutionTimeMs: number;
  boundsApplied: boolean;
  openNowApplied: boolean;
  openNowSupportedRestaurants: number;
  openNowUnsupportedRestaurants: number;
  openNowFilteredOut: number;
  priceFilterApplied?: boolean;
  minimumVotesApplied?: boolean;
  page: number;
  pageSize: number;
  perRestaurantLimit: number;
  coverageStatus?: 'full' | 'partial' | 'unresolved';
  unresolvedEntities?: Array<{
    type: EntityScope;
    terms: string[];
  }>;
  sourceQuery?: string;
  analysisMetadata?: Record<string, unknown>;
  primaryFoodTerm?: string;
}

export interface SearchResponse {
  format: QueryFormat;
  plan: QueryPlan;
  food: FoodResult[];
  restaurants?: RestaurantResult[];
  sqlPreview?: string | null;
  metadata: SearchResponseMetadata;
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface MapBounds {
  northEast: Coordinate;
  southWest: Coordinate;
}

export interface Pagination {
  page?: number;
  pageSize?: number;
}

export interface NaturalSearchRequest {
  query: string;
  bounds?: MapBounds;
  openNow?: boolean;
  priceLevels?: number[];
  minimumVotes?: number;
  pagination?: Pagination;
  includeSqlPreview?: boolean;
  userLocation?: Coordinate;
}

export interface SearchFixtureMap {
  default: SearchResponse;
  byQuery?: Record<string, SearchResponse | undefined>;
}
