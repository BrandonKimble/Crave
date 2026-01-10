export type ActivityLevel = 'trending' | 'active' | 'normal';

export type EntityScope = 'restaurant' | 'food' | 'food_attribute' | 'restaurant_attribute';

export type QueryFormat = 'dual_list';

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
  restaurantLocationId?: string;
  qualityScore: number;
  displayScore?: number | null;
  displayPercentile?: number | null;
  coverageKey?: string;
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
  // Additional fields for map pins in dishes tab
  restaurantDisplayScore?: number | null;
  restaurantDisplayPercentile?: number | null;
  restaurantLatitude?: number | null;
  restaurantLongitude?: number | null;
}

export interface RestaurantFoodSnippet {
  connectionId: string;
  foodId: string;
  foodName: string;
  qualityScore: number;
  displayScore?: number | null;
  displayPercentile?: number | null;
  activityLevel: ActivityLevel;
}

export interface RestaurantLocationResult {
  locationId: string;
  googlePlaceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
  phoneNumber?: string | null;
  websiteUrl?: string | null;
  hours?: Record<string, unknown> | null;
  utcOffsetMinutes?: number | null;
  timeZone?: string | null;
  operatingStatus?: OperatingStatus | null;
  isPrimary: boolean;
  lastPolledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RestaurantResult {
  restaurantId: string;
  restaurantName: string;
  restaurantAliases: string[];
  contextualScore: number;
  restaurantQualityScore?: number | null;
  displayScore?: number | null;
  displayPercentile?: number | null;
  coverageKey?: string;
  mentionCount?: number;
  totalUpvotes?: number;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  restaurantLocationId?: string | null;
  priceLevel?: number | null;
  priceSymbol?: string | null;
  priceText?: string | null;
  priceLevelUpdatedAt?: string | null;
  topFood: RestaurantFoodSnippet[];
  totalDishCount: number;
  operatingStatus?: OperatingStatus | null;
  distanceMiles?: number | null;
  displayLocation?: RestaurantLocationResult | null;
  locations?: RestaurantLocationResult[];
  locationCount?: number;
}

export interface DishRestaurantLocation {
  locationId: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  city?: string | null;
  googlePlaceId?: string | null;
}

export interface DishRestaurantData {
  restaurantId: string;
  restaurantName: string;
  restaurantAliases: string[];
  displayScore?: number | null;
  displayPercentile?: number | null;
  priceLevel?: number | null;
  priceSymbol?: string | null;
  operatingStatus?: OperatingStatus | null;
  location: DishRestaurantLocation;
}

export interface DishResult {
  connectionId: string;
  foodId: string;
  foodName: string;
  foodAliases: string[];
  qualityScore: number;
  displayScore?: number | null;
  displayPercentile?: number | null;
  coverageKey?: string;
  activityLevel: ActivityLevel;
  mentionCount: number;
  totalUpvotes: number;
  recentMentionCount: number;
  lastMentionedAt?: string | null;
  categories: string[];
  foodAttributes: string[];
  restaurant: DishRestaurantData;
}

export interface SearchResponseMetadata {
  totalFoodResults: number;
  totalRestaurantResults: number;
  queryExecutionTimeMs: number;
  boundsApplied: boolean;
  openNowApplied: boolean;
  openNowSupportedRestaurants: number;
  openNowUnsupportedRestaurants: number;
  openNowUnsupportedRestaurantIds?: string[];
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
  searchRequestId?: string;
  analysisMetadata?: Record<string, unknown>;
  primaryFoodTerm?: string;
  coverageKey?: string | null;
  emptyQueryMessage?: string;
  onDemandQueued?: boolean;
  onDemandEtaMs?: number;
}

export interface SearchResponse {
  format: QueryFormat;
  plan: QueryPlan;
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  sqlPreview?: string | null;
  metadata: SearchResponseMetadata;
}

/** @deprecated Use SearchResponse with dishes instead */
export interface LegacySearchResponse {
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
  searchRequestId?: string;
  submissionSource?: 'manual' | 'recent' | 'autocomplete' | 'shortcut';
  submissionContext?: Record<string, unknown>;
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
