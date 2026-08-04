// THE PUBLIC SURFACE OF @crave-search/shared — EXPLICIT, ONE NAME AT A TIME.
//
// F1656 (2026-08-04). This file used to be three `export *` lines. A barrel that
// re-exports everything makes the package's contract whatever happens to be `export`ed
// somewhere inside it, and that drifted: a 130-name census against apps/api + apps/mobile
// found 37 names reaching NO consumer — ten PRD-era fossils (deleted in the same pass) and
// 27 helpers that are live INTERNAL code but were being promised to the outside world by
// accident. An export nobody imports is an unpaid maintenance promise.
//
// THE RULE: a name appears below only when an app imports it. Internal helpers stay
// `export`ed in their own module (their siblings and specs need them) and simply do not
// come through here. Adding a name here is a deliberate act of widening the contract.

export type {
  OnboardingAnswerValue,
  OnboardingAnswers,
  OnboardingStatus,
  UserOnboardingProfile,
} from './types';

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
  RestaurantLocationResult,
  RestaurantMatchedTag,
  RestaurantProfile,
  RestaurantResult,
  RestaurantResultScorePreview,
  ScoreInfoSummary,
  SearchResponse,
  SearchResponseMetadata,
  StructuredWeeklyHours,
} from './types/search';

export { ONBOARDING_VERSION } from './constants';

export {
  ATTRIBUTION_OPTION_IDS,
  BUDGET_OPTION_IDS,
  DECIDE_HOW_OPTION_IDS,
  DIETARY_NEED_OPTION_IDS,
  DINING_FREQUENCY_OPTION_IDS,
  DINING_GOAL_OPTION_IDS,
  NOTIFICATION_CADENCE_OPTION_IDS,
  ONBOARDING_QUESTION_IDS,
  ONBOARDING_QUESTION_SET_VERSION,
  SPICE_OPTION_IDS,
  parseOnboardingAnswers,
} from './constants/onboarding-questions';

export {
  CONTEXT_OPTION_IDS,
  CRAVING_OPTION_IDS,
  CUISINE_OPTION_IDS,
  LIVE_CITY_VALUES,
  labelledOptions,
} from './constants/onboarding-vocabulary';
export type {
  ContextOptionId,
  CravingOptionId,
  CuisineOptionId,
  LiveCityValue,
} from './constants/onboarding-vocabulary';

export {
  METERS_PER_DEGREE_LAT,
  MIN_COS_LAT,
  bboxArea,
  bboxCenter,
  bboxContains,
  bboxContainsPoint,
  bboxCrossesAntimeridian,
  bboxIntersectionParts,
  bboxLatSpan,
  bboxLngSpan,
  bboxUnion,
  isGeoPoint,
  normalizePlaceName,
  pointToBbox,
  pointToBboxDistance,
} from './geo/place-geo';
export type { GeoBbox, GeoPoint } from './geo/place-geo';

export {
  bboxToGround,
  clipRingToRect,
  groundArea,
  groundContainsPoint,
  groundCoverageOfView,
  ringShoelaceArea,
} from './geo/ground';
export type { PlaceGround } from './geo/ground';

export {
  ATTENTION_FRACTION,
  COVERING_FRACTION,
  MAX_PROBE_ANCHORS,
  isTooBigForView,
  probeAnchors,
  probedRegionAnswersAnchor,
  resolveHeaderPlace,
  resolvePlaceCoverage,
  subjectCandidatesInView,
  viewCenter,
} from './geo/subjects';
export type { HeaderResolution, PlaceLike, ProbedRegion, SubjectCandidate } from './geo/subjects';

export { PLACES_SLICE_MARGIN_FACTOR, expandBboxByFactor } from './geo/slice';
export type { PlacesInViewSliceResponse } from './geo/slice';
