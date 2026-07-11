export type EntityScope =
  | 'restaurant'
  | 'food'
  | 'food_attribute'
  | 'restaurant_attribute'
  | 'ingredient'
  | 'connection';

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
  // Sectioned relevancy: true = exact-match tier (section 1), false = widened
  // (sibling/category/lexical) tier. Absent when sectioning didn't apply.
  exactMatch?: boolean;
  // Graded relatedness to the query entity on one calibrated 0..1 scale
  // (1 = the thing you asked for or an instance of it; siblings carry
  // ceiling-normalized cosine). Present whenever the query resolved a food;
  // unread by ranking today — the substrate for a future relevancy treatment.
  relevance?: number;
  // High-precision Crave score (percentile_rank, Decimal(6,5), 0..1, higher = better). `craveScore` is the
  // DISPLAY score (0-10 scale) rounded for display — ordering by it ties top restaurants and the map vs list
  // break ties differently. Order/rank by this; never display it. Additive/optional for backward-compat.
  craveScoreExact?: number;
  rising?: number | null;
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
  // Favorites-list projection only (w1-listdetail spec B.1.5): the saver's
  // personal note on this item. Never set by real search responses.
  note?: string | null;
}

export interface RestaurantFoodSnippet {
  connectionId: string;
  foodId: string;
  foodName: string;
  scoreSubjectType: 'connection';
  scoreSubjectId: string;
  craveScore: number;
  rising?: number | null;
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
  // Sectioned relevancy: true = exact-match tier (section 1), false = widened
  // (sibling/category/lexical) tier. Absent when sectioning didn't apply.
  exactMatch?: boolean;
  // Graded relatedness to the query entity on one calibrated 0..1 scale
  // (1 = the thing you asked for or an instance of it; siblings carry
  // ceiling-normalized cosine). Present whenever the query resolved a food;
  // unread by ranking today — the substrate for a future relevancy treatment.
  relevance?: number;
  // High-precision Crave score (percentile_rank, Decimal(6,5), 0..1, higher = better) — see FoodResult. The
  // map ranks pins and the results list orders rows by THIS so the badge number == the list position; the
  // rounded `craveScore` is display-only. Additive/optional.
  craveScoreExact?: number;
  rising?: number | null;
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
  // Favorites-list projection only (w1-listdetail spec B.1.5): the saver's
  // personal note on this item. Never set by real search responses.
  note?: string | null;
}

export type RestaurantResultScorePreview = Omit<
  RestaurantResult,
  'craveScore' | 'rising' | 'scoreInfo'
> & {
  /**
   * Profile-open shell only. Public search/favorite/coverage payloads must use
   * `RestaurantResult` and carry a computed numeric Crave Score.
   */
  craveScore: null;
  rising?: null;
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
  rising?: number | null;
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
  evidenceCopy: string;
  pollCount?: number | null;
  voteCount?: number | null;
}

export interface SearchResponseMetadata {
  /** Count of similar (sibling) dishes available beyond the exact results —
   *  drives the "show N similar dishes" chip. Present on page-1 exact-view
   *  responses when the query resolved a food. */
  similarAvailable?: number;
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
  /**
   * "Include similar" page-1 union prefetch: when the request ran WITHOUT
   * includeSimilar, these are the pooled-page-1 rows NOT already in
   * dishes/restaurants (tagged exactMatch=false, relevance attached). The
   * client composes the toggle-ON view from one payload — page-1 flips are
   * zero-network and the map gets its extra pins from the same union.
   */
  similarDishes?: FoodResult[];
  similarRestaurants?: RestaurantResult[];
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
