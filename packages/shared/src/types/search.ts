export type EntityScope = 'restaurant' | 'food' | 'food_attribute' | 'restaurant_attribute';

export type QueryFormat = 'dual_list' | 'single_list';

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
  scoreSubjectType: 'connection';
  scoreSubjectId: string;
  craveScore: number;
  scoreDelta7d?: number | null;
  scoreInfo?: ScoreInfoSummary;
  marketKey?: string;
  marketName?: string | null;
  mentionCount: number;
  totalUpvotes: number;
  lastMentionedAt?: string | null;
  categories: string[];
  foodAttributes: string[];
  restaurantPriceLevel?: number | null;
  restaurantPriceSymbol?: string | null;
  restaurantDistanceMiles?: number | null;
  restaurantOperatingStatus?: OperatingStatus | null;
  restaurantCraveScore: number;
  restaurantLatitude?: number | null;
  restaurantLongitude?: number | null;
}

export interface RestaurantFoodSnippet {
  connectionId: string;
  foodId: string;
  foodName: string;
  scoreSubjectType: 'connection';
  scoreSubjectId: string;
  craveScore: number;
  scoreDelta7d?: number | null;
  scoreInfo?: ScoreInfoSummary;
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

export interface RestaurantMatchedTag {
  entityId: string;
  name: string;
  entityType: string;
  mentionCount: number;
}

export interface RestaurantResult {
  restaurantId: string;
  restaurantName: string;
  restaurantAliases: string[];
  /**
   * Canonical ordinal rank for the current search snapshot (1-based).
   * This should be server-assigned and stable across cards + map pins.
   */
  rank?: number;
  scoreSubjectType: 'restaurant';
  scoreSubjectId: string;
  craveScore: number;
  scoreDelta7d?: number | null;
  scoreInfo?: ScoreInfoSummary;
  marketKey?: string;
  marketName?: string | null;
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
  matchedTags?: RestaurantMatchedTag[];
  matchEvidenceType?: 'connection' | 'tag_signal' | 'mixed' | null;
  hasMenuItems?: boolean;
}

export type RestaurantResultScorePreview = Omit<
  RestaurantResult,
  'craveScore' | 'scoreDelta7d' | 'scoreInfo'
> & {
  /**
   * Profile-open shell only. Public search/favorite/coverage payloads must use
   * `RestaurantResult` and carry a computed numeric Crave Score.
   */
  craveScore: null;
  scoreDelta7d?: null;
  scoreInfo?: undefined;
};

export interface RestaurantProfile {
  restaurant: RestaurantResult;
  dishes: FoodResult[];
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
  restaurantCraveScore: number;
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
  scoreSubjectType: 'connection';
  scoreSubjectId: string;
  craveScore: number;
  scoreDelta7d?: number | null;
  scoreInfo?: ScoreInfoSummary;
  marketKey?: string;
  marketName?: string | null;
  mentionCount: number;
  totalUpvotes: number;
  lastMentionedAt?: string | null;
  categories: string[];
  foodAttributes: string[];
  restaurant: DishRestaurantData;
}

export interface ScoreInfoSummary {
  confidenceLabel: 'early' | 'solid' | 'strong';
  evidenceCopy: string;
  pollCount?: number | null;
  voteCount?: number | null;
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
  /**
   * When the API expands the query beyond the strict intent, page 1 can include
   * both “exact” and “broader” sections. These fields describe how many of the
   * returned items belong to the strict (exact) section.
   */
  exactDishCountOnPage?: number;
  exactRestaurantCountOnPage?: number;
  relaxationApplied?: boolean;
  relaxationStage?:
    | 'strict'
    | 'relaxed_restaurant_attributes'
    | 'relaxed_food_attributes'
    | 'relaxed_modifiers';
  resultCoverageStatus?: 'full' | 'partial' | 'unresolved';
  unresolvedEntities?: Array<{
    type: EntityScope;
    terms: string[];
  }>;
  sourceQuery?: string;
  searchRequestId?: string;
  originalBackendSearchRequestId?: string;
  dataReadyFrom?: 'backend' | 'cache' | 'in_flight';
  analysisMetadata?: Record<string, unknown>;
  primaryFoodTerm?: string;
  marketKey?: string | null;
  displayMarketName?: string | null;
  marketResolutionStatus?: 'resolved' | 'multi_market' | 'no_market' | 'error';
  candidateLocalityName?: string | null;
  candidateBoundaryProvider?: string | null;
  candidateBoundaryId?: string | null;
  candidateBoundaryType?: string | null;
  attributionMarketKeys?: string[];
  collectableMarketKeys?: string[];
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
  compactResponse?: boolean;
  submissionSource?: 'manual' | 'recent' | 'autocomplete' | 'shortcut';
  submissionContext?: Record<string, unknown>;
  bounds?: MapBounds;
  // Screen-accurate viewport polygon ([lng, lat] pairs, pitch/twist-aware). When present the
  // backend filters by the exact polygon (ST_Covers) instead of the AABB `bounds`.
  viewportPolygon?: Array<[number, number]>;
  openNow?: boolean;
  priceLevels?: number[];
  minimumVotes?: number;
  risingActive?: boolean;
  pagination?: Pagination;
  includeSqlPreview?: boolean;
  userLocation?: Coordinate;
}

export interface SearchFixtureMap {
  default: SearchResponse;
  byQuery?: Record<string, SearchResponse | undefined>;
}
