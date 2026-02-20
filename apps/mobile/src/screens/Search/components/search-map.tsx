import React from 'react';
import { Animated, type LayoutChangeEvent, View } from 'react-native';

import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';

type OnPressEvent = {
  features: Array<GeoJSON.Feature>;
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
};

// Mapbox expression type for filter/query props — uses `any` to match
// the library's internal Expression type without importing private modules.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Expression = readonly [string, ...any[]];
import type { Feature, FeatureCollection, Point } from 'geojson';

import pinAsset from '../../../assets/pin.png';
import pinFillAsset from '../../../assets/pin-fill.png';
import pinShadowAsset from '../../../assets/pin-shadow.png';
import AppBlurView from '../../../components/app-blur-view';
import type { Coordinate } from '../../../types';
import { logger } from '../../../utils';
import {
  LABEL_RADIAL_OFFSET_EM,
  LABEL_TEXT_SIZE,
  PIN_FILL_CENTER_Y,
  PIN_FILL_RENDER_HEIGHT,
  PIN_FILL_TOP_OFFSET,
  PIN_MARKER_RENDER_SIZE,
  PIN_RANK_FONT_SIZE,
  USA_FALLBACK_CENTER,
} from '../constants/search';

import styles from '../styles';
import { haversineDistanceMiles, isLngLatTuple } from '../utils/geo';
import { MARKER_VIEW_OVERSCAN_STYLE } from './marker-visibility';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import type { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import type {
  SearchRuntimeBus,
  SearchRuntimeOperationLane,
} from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';

const SEARCH_MAP_STAGED_PUBLISH_MODE = true;
const MAP_PAN_DECELERATION_FACTOR = 0.995;
const LABEL_STICKY_REFRESH_MS_IDLE = 140;
const LABEL_STICKY_REFRESH_MS_MOVING = 90;
const LABEL_STICKY_QUERY_PROBE_MIN_INTERVAL_MS = 450;
// Sticky label tuning:
// - We keep a per-marker "locked" candidate (bottom/right/top/left) to prevent rapid anchor flips.
// - If the locked label isn't being placed, we unlock so Mapbox can pick a new side.
// - While moving, unlock/lock uses small hysteresis so brief query sampling gaps don't cause thrash.
const LABEL_STICKY_LOCK_STABLE_MS_MOVING = 140;
const LABEL_STICKY_LOCK_STABLE_MS_IDLE = 80;
const LABEL_STICKY_UNLOCK_MISSING_MS_MOVING = 260;
const LABEL_STICKY_UNLOCK_MISSING_MS_IDLE = 700;
const LABEL_STICKY_UNLOCK_MISSING_STREAK_MOVING = 3;
const LABEL_STICKY_COLD_START_RECOVER_AFTER_MS = 3500;
const LABEL_STICKY_COLD_START_RECOVER_MAX_ATTEMPTS = 2;
const LABEL_STICKY_BOOTSTRAP_POLL_MS = 650;
const LABEL_STICKY_BOOTSTRAP_MAX_POLL_MS = 10000;
const USER_LOCATION_ANCHOR = { x: 0.5, y: 0.5 } as const;

// Experimental: render restaurant pins via Mapbox style layers (instead of MarkerView).
// This avoids view-annotation gaps during fast pans and is the foundation for truly reversible fade.
const USE_STYLE_LAYER_PINS = true;
const STYLE_PIN_OUTLINE_IMAGE_ID = 'restaurant-pin-outline';
const STYLE_PIN_SHADOW_IMAGE_ID = 'restaurant-pin-shadow';
const STYLE_PIN_FILL_IMAGE_ID = 'restaurant-pin-fill';
const STYLE_PINS_SOURCE_ID = 'restaurant-style-pins-source';
const PIN_INTERACTION_SOURCE_ID = 'restaurant-pin-interaction-source';
const LABEL_INTERACTION_SOURCE_ID = 'restaurant-label-interaction-source';
const ENABLE_LABEL_PLACEMENT_BOOTSTRAP = false;

// Lock each restaurant to a single chosen candidate and only reconsider when that candidate
// disappears (i.e. it can’t be placed).
const ENABLE_STICKY_LABEL_CANDIDATES = true;
// Stabilize intra-layer ordering so placement priority doesn't vary with viewport y.
const STABILIZE_LABEL_ORDER = true;
// Pin collision obstacle geometry.
// - `outline`: uses the full pin sprite bounding box (conservative).
// - `fill`: uses the fill sprite bounding box (tighter).
// - `off`: disables pin collision obstacles entirely (labels may overlap pins).
const PIN_COLLISION_OBSTACLE_GEOMETRY: 'outline' | 'fill' | 'off' = 'fill' as 'outline' | 'fill' | 'off';
const PIN_COLLISION_OBSTACLE_SCALE = 0.6;
// Move the shared per-restaurant collision point used to enforce "one candidate label" placement.
// This avoids the mutex being blocked by another pin's collision obstacle when pins stack.
const LABEL_MUTEX_POINT: 'below-pin' | 'above-pin' = 'above-pin';

// Approximate the MarkerView drop-shadow (`styles.pinShadow`) using a translated, tinted SDF copy
// of the pin silhouette.
const STYLE_PINS_SHADOW_OPACITY = 0.65;
// `pin-shadow.png` includes extra bottom padding (see `apps/mobile/scripts/generate-pin-shadow.mjs`)
// so the blur isn't clipped. Compensate by shifting it down a touch so it still sits under the pin.
const STYLE_PINS_SHADOW_TRANSLATE: [number, number] = [
  0,
  1.25 + 18 * (PIN_MARKER_RENDER_SIZE / 98),
];
// `SymbolLayer.iconSize` scales relative to the source image's pixel dimensions.
// These values are derived to match the existing RN pin layout in `styles.ts` + `constants/search.ts`.
// `SymbolLayer.iconSize` scales relative to the source image's logical pixel dimensions.
// We keep the pin's on-screen size fixed, but provide `pin@2x.png` / `pin@3x.png` so RN resolves
// the correct density for the device (sharper while keeping layout stable).
const PIN_OUTLINE_LOGICAL_HEIGHT_PX = 480;
const PIN_FILL_LOGICAL_HEIGHT_PX = 360;

const STYLE_PINS_OUTLINE_ICON_SIZE = PIN_MARKER_RENDER_SIZE / PIN_OUTLINE_LOGICAL_HEIGHT_PX;
// `pin-shadow.png` is generated from a downscaled ~98px-tall silhouette for perf / bundle size.
// Keep its on-screen size aligned with the base pin by scaling against the same 98px baseline.
const STYLE_PINS_SHADOW_ICON_SIZE = PIN_MARKER_RENDER_SIZE / 98;
const STYLE_PINS_FILL_ICON_SIZE = PIN_FILL_RENDER_HEIGHT / PIN_FILL_LOGICAL_HEIGHT_PX;
// `SymbolLayer.iconOffset` is specified in the *source image's pixel units* (and then scaled by
// `iconSize`). Our pin layout constants are in "rendered wrapper pixels", so we convert.
const STYLE_PINS_FILL_OFFSET_RENDER_PX = -(
  PIN_MARKER_RENDER_SIZE -
  (PIN_FILL_TOP_OFFSET + PIN_FILL_RENDER_HEIGHT)
);
const STYLE_PINS_FILL_OFFSET_IMAGE_PX =
  STYLE_PINS_FILL_OFFSET_RENDER_PX / STYLE_PINS_FILL_ICON_SIZE;
const STYLE_PINS_RANK_TRANSLATE_Y = PIN_FILL_CENTER_Y - PIN_MARKER_RENDER_SIZE;

// Collision tuning: shift the pin obstacle upward so other restaurants' labels collide with the pin
// body sooner (reducing overlap at the top) while allowing a bit more overlap near the tip.
//
// NOTE: Must use `iconOffset` (layout) instead of `iconTranslate` (paint), otherwise collision won't
// move even if the visualization does.
const PIN_COLLISION_OFFSET_Y_PX = -Math.round(PIN_MARKER_RENDER_SIZE * 0.25);
// Extra left/right collision padding between pins and labels. This does NOT move the restaurant's
// own label candidates; it widens the effective pin obstacle by adding two side-offset obstacles.
const PIN_COLLISION_SIDE_PAD_PX = 3;
const PIN_COLLISION_OUTLINE_OFFSET_IMAGE_PX =
  PIN_COLLISION_OFFSET_Y_PX / (STYLE_PINS_OUTLINE_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
const PIN_COLLISION_FILL_OFFSET_IMAGE_PX =
  PIN_COLLISION_OFFSET_Y_PX / (STYLE_PINS_FILL_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
const PIN_COLLISION_OUTLINE_SIDE_PAD_IMAGE_PX =
  PIN_COLLISION_SIDE_PAD_PX / (STYLE_PINS_OUTLINE_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
const PIN_COLLISION_FILL_SIDE_PAD_IMAGE_PX =
  PIN_COLLISION_SIDE_PAD_PX / (STYLE_PINS_FILL_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
const DOT_TO_PIN_TRANSITION_DURATION_MS = 300;
const MAP_STAGE_PRESSURE_SOFT_BUDGET_MS = 8;
const MAP_STAGE_PRESSURE_CRITICAL_BUDGET_MS = 12;
const MAP_STAGE_PRESSURE_MAX_QUEUE_DEPTH = 2;
const MAP_STAGE_LABELS_HEALTHY_FRAMES_REQUIRED = 1;
const MAP_STAGE_LABELS_HEALTHY_FRAMES_REQUIRED_AFTER_HANDOFF = 2;
const DOT_TO_PIN_TRANSITION_MIN_SCALE = 0.48;
const DOT_TO_PIN_RANK_FADE_START = 0.5;

const PIN_TRANSITION_ACTIVE_EXPRESSION = ['coalesce', ['get', 'pinTransitionActive'], 0] as const;
const PIN_TRANSITION_SCALE_EXPRESSION = ['coalesce', ['get', 'pinTransitionScale'], 1] as const;
const PIN_TRANSITION_OPACITY_EXPRESSION = ['coalesce', ['get', 'pinTransitionOpacity'], 1] as const;
const PIN_RANK_OPACITY_EXPRESSION = ['coalesce', ['get', 'pinRankOpacity'], 1] as const;
const PIN_LABEL_OPACITY_EXPRESSION = ['coalesce', ['get', 'pinLabelOpacity'], 1] as const;
const PIN_STEADY_OPACITY_EXPRESSION = ['-', 1, PIN_TRANSITION_ACTIVE_EXPRESSION] as const;
const PINS_RENDER_KEY_HOLD_PREFIX = 'hold::';
const PINS_RENDER_KEY_SHOW_PREFIX = 'show::';
const SEARCH_OPERATION_LANE_RANK: Record<SearchRuntimeOperationLane, number> = {
  idle: 0,
  lane_a_ack: 1,
  lane_b_data_commit: 2,
  lane_c_list_first_paint: 3,
  lane_d_map_dots: 4,
  lane_e_map_pins: 5,
  lane_f_polish: 6,
};

const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

const hashStringFNV1a = (value: string, seed: number = FNV1A_OFFSET_BASIS): number => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV1A_PRIME) >>> 0;
  }
  return hash >>> 0;
};

const buildStableKeyFingerprint = (keys: readonly string[]): string => {
  if (!keys.length) {
    return '0:empty:empty:0';
  }

  let hash = FNV1A_OFFSET_BASIS;
  for (const key of keys) {
    hash = hashStringFNV1a(key, hash);
  }

  const firstKey = keys[0] ?? 'empty';
  const lastKey = keys[keys.length - 1] ?? 'empty';
  return `${keys.length}:${firstKey}:${lastKey}:${hash.toString(36)}`;
};

const withIconOpacity = (
  baseStyle: MapboxGL.SymbolLayerStyle,
  iconOpacity: unknown
): MapboxGL.SymbolLayerStyle =>
  ({
    ...baseStyle,
    iconOpacity,
  } as MapboxGL.SymbolLayerStyle);

const withScaledIconTransition = ({
  baseStyle,
  baseIconSize,
  iconOpacity,
  iconColor,
}: {
  baseStyle: MapboxGL.SymbolLayerStyle;
  baseIconSize: number;
  iconOpacity: unknown;
  iconColor?: unknown;
}): MapboxGL.SymbolLayerStyle =>
  ({
    ...baseStyle,
    iconSize: ['*', baseIconSize, PIN_TRANSITION_SCALE_EXPRESSION],
    ...(iconColor === undefined ? {} : { iconColor }),
    iconOpacity,
  } as MapboxGL.SymbolLayerStyle);

const withTextOpacity = ({
  baseStyle,
  textOpacity,
  textColor,
}: {
  baseStyle: MapboxGL.SymbolLayerStyle;
  textOpacity: unknown;
  textColor?: unknown;
}): MapboxGL.SymbolLayerStyle =>
  ({
    ...baseStyle,
    ...(textColor === undefined ? {} : { textColor }),
    textOpacity,
  } as MapboxGL.SymbolLayerStyle);

const getSafeStyleUrlForLogs = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('mapbox://')) {
    return trimmed;
  }

  const withoutQuery = trimmed.split('?')[0] ?? trimmed;
  return withoutQuery;
};

const getSafeUrlForLogs = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const [base] = trimmed.split('?');
  return base ?? trimmed;
};

export type RestaurantFeatureProperties = {
  restaurantId: string;
  restaurantName: string;
  contextualScore: number;
  markerKey?: string;
  rank: number;
  // Stable per-frame ordering key for label placement tie-breaks.
  labelOrder?: number;
  // For pin SymbolLayer z-ordering: fixed slot index (0 = bottom ... 39 = top).
  lodZ?: number;
  displayScore?: number | null;
  displayPercentile?: number | null;
  restaurantQualityScore?: number | null;
  pinColor: string;
  pinColorGlobal?: string;
  pinColorLocal?: string;
  pinTransitionActive?: number;
  pinTransitionScale?: number;
  pinTransitionOpacity?: number;
  pinRankOpacity?: number;
  pinLabelOpacity?: number;
  anchor?: 'top' | 'bottom' | 'left' | 'right';
  labelCandidate?: LabelCandidate;
  // Dish-specific fields (populated when rendering dish pins)
  isDishPin?: boolean;
  dishName?: string;
  connectionId?: string;
  topDishDisplayPercentile?: number | null;
  topDishDisplayScore?: number | null;
};

export type MapboxMapRef = InstanceType<typeof MapboxGL.MapView> & {
  getVisibleBounds?: () => Promise<[number[], number[]]>;
  getCenter?: () => Promise<[number, number]>;
  getZoom?: () => Promise<number>;
  getPointInView?: (coordinate: [number, number]) => Promise<[number, number]>;
  setFeatureState?: (
    featureId: string,
    state: Record<string, unknown>,
    sourceId: string,
    sourceLayerId?: string | null
  ) => Promise<void>;
};

type CameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

type LabelStickyRuntime = {
  styleURL: string;
  labelLayerTreeEpoch: number;
  isMapStyleReady: boolean;
  shouldDisableMarkers: boolean;
  shouldRenderLabels: boolean;
  viewport: { width: number; height: number };
  markerCount: number;
};

const PRIMARY_COLOR = '#ff3368';
const ZERO_CAMERA_PADDING = { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 };
const DOT_SOURCE_ID = 'restaurant-dot-source';
const DOT_LAYER_ID = 'restaurant-dot-layer';
const DOT_INTERACTION_SOURCE_ID = 'restaurant-dot-interaction-source';
const DOT_INTERACTION_LAYER_ID = 'restaurant-dot-interaction-layer';
const DOT_TEXT_SIZE = 17;
// Keep in sync with SearchScreen's MAX_FULL_PINS. These slots guarantee deterministic pin stacking
// even as the pinned set changes during live LOD updates.
const STYLE_PIN_STACK_SLOTS = 30;
const PIN_INTERACTION_LAYER_IDS = Array.from(
  { length: STYLE_PIN_STACK_SLOTS },
  (_, slotIndex) => `restaurant-pin-interaction-slot-${slotIndex}`
);
// Use stable "anchor" layers to guarantee pins/dots/labels remain ordered correctly even if React
// remounts layers (e.g. live LOD changes, style reloads).
const OVERLAY_Z_ANCHOR_SOURCE_ID = 'search-overlay-z-anchor-source';
const OVERLAY_Z_ANCHOR_LAYER_ID = 'search-overlay-z-anchor-layer';
const SEARCH_LABELS_Z_ANCHOR_LAYER_ID = 'search-labels-z-anchor-layer';
const SEARCH_PINS_Z_ANCHOR_LAYER_ID = 'search-pins-z-anchor-layer';
const EMPTY_POINT_FEATURES: FeatureCollection<Point, RestaurantFeatureProperties> = {
  type: 'FeatureCollection',
  features: [],
};
const EMPTY_SORTED_RESTAURANT_MARKERS: Array<Feature<Point, RestaurantFeatureProperties>> = [];
const OVERLAY_Z_ANCHOR_STYLE: MapboxGL.SymbolLayerStyle = {
  // Render nothing; the layer exists purely as an ordering anchor.
  textField: '',
  textOpacity: 0,
} as MapboxGL.SymbolLayerStyle;
const RESTAURANT_LABEL_SOURCE_ID = 'restaurant-source';
const RESTAURANT_LABEL_COLLISION_SOURCE_ID = 'restaurant-label-collision-source';

type LabelCandidate = 'bottom' | 'right' | 'top' | 'left';
const LABEL_CANDIDATES: ReadonlyArray<LabelCandidate> = ['bottom', 'right', 'top', 'left'];
// Placement preference (highest -> lowest): bottom, right, top, left.
// Mapbox symbol placement gives priority to higher layers, so we render candidates in reverse.
const LABEL_CANDIDATE_LAYER_ORDER: ReadonlyArray<LabelCandidate> = [
  'left',
  'top',
  'right',
  'bottom',
];

const LABEL_LAYER_IDS_BY_CANDIDATE = {
  bottom: 'restaurant-labels-candidate-bottom',
  right: 'restaurant-labels-candidate-right',
  top: 'restaurant-labels-candidate-top',
  left: 'restaurant-labels-candidate-left',
} as const satisfies Record<LabelCandidate, string>;
const LABEL_INTERACTION_LAYER_IDS_BY_CANDIDATE = {
  bottom: 'restaurant-labels-interaction-bottom',
  right: 'restaurant-labels-interaction-right',
  top: 'restaurant-labels-interaction-top',
  left: 'restaurant-labels-interaction-left',
} as const satisfies Record<LabelCandidate, string>;

// Minimum spacing to keep label candidates from being blocked by the pin's collision silhouette
// once we shift the ring upward to align with the pin fill centerline.
const LABEL_MIN_BOTTOM_GAP_PX = 3.5;
const LABEL_MIN_TOP_GAP_PX = 4;
const LABEL_MIN_HORIZONTAL_GAP_PX = Math.ceil(PIN_MARKER_RENDER_SIZE / 2) + 6;

// Tiny icon used as a per-restaurant "mutex" so only one candidate label can place.
// IMPORTANT: `iconSize` is a scale factor relative to the source image pixel dimensions. Since
// `pin-outline.png` can be exported at very high resolution, derive `iconSize` from a desired
// on-screen size so label placement doesn't change when the asset resolution changes.
const LABEL_MUTEX_ICON_RENDER_SIZE_PX = 0.8;
const LABEL_MUTEX_ICON_SIZE = LABEL_MUTEX_ICON_RENDER_SIZE_PX / PIN_OUTLINE_LOGICAL_HEIGHT_PX;
// Offset the mutex icon away from the pin base collision region so it doesn't get blocked by the
// dedicated pin-obstacle layer. This is in *source image pixels* (scaled by `iconSize`).
const LABEL_MUTEX_ICON_OFFSET_IMAGE_PX = 1600;
// Move the mutex into screen pixel space via a constant viewport translation so it doesn't depend
// on iconSize/image pixels.
const LABEL_MUTEX_TRANSLATE_Y_PX = -(PIN_MARKER_RENDER_SIZE + 12);
const INTERACTION_LAYER_HIDDEN_OPACITY = 0.001;
// Feature coordinates are anchored at the pin tip. Shift the interaction circle upward so
// presses map to the visible pin body/base rather than the anchor point itself.
const PIN_INTERACTION_CENTER_SHIFT_Y_PX = PIN_MARKER_RENDER_SIZE * 0.38 + 4.25;
const PIN_TAP_INTENT_RADIUS_PX = Math.max(10, PIN_MARKER_RENDER_SIZE * 0.46) + 1;
// Dot glyphs render notably smaller than `DOT_TEXT_SIZE` due to font metrics/line-height.
// Keep the interaction target tight so it feels intentionally dot-sized (about ~2x visible dot).
const DOT_TAP_INTENT_RADIUS_PX = Math.max(7, DOT_TEXT_SIZE * 0.42);
const LABEL_TAP_CHAR_WIDTH_FACTOR = 0.56;
const LABEL_TAP_LINE_HEIGHT_FACTOR = 1.18;
const LABEL_TAP_PADDING_PX = 4;
const LABEL_TAP_MIN_WIDTH_PX = 34;
const LABEL_TAP_MAX_WIDTH_PX = 220;
const PIN_INTERACTION_LAYER_STYLE: MapboxGL.CircleLayerStyle = {
  circleRadius: PIN_TAP_INTENT_RADIUS_PX,
  circleColor: '#000000',
  circleOpacity: INTERACTION_LAYER_HIDDEN_OPACITY,
  circleStrokeOpacity: 0,
  circleTranslate: [0, -PIN_INTERACTION_CENTER_SHIFT_Y_PX],
  circleTranslateAnchor: 'viewport',
} as MapboxGL.CircleLayerStyle;
const DOT_INTERACTION_LAYER_STYLE: MapboxGL.CircleLayerStyle = {
  circleRadius: DOT_TAP_INTENT_RADIUS_PX,
  circleColor: '#000000',
  circleOpacity: INTERACTION_LAYER_HIDDEN_OPACITY,
  circleStrokeOpacity: 0,
} as MapboxGL.CircleLayerStyle;

const buildLabelCandidateFeatureId = (markerKey: string, candidate: LabelCandidate) =>
  `${markerKey}::label::${candidate}`;

const LABEL_CANDIDATE_FEATURE_ID_DELIMITER = '::label::';

const parseLabelCandidateFeatureId = (
  value: unknown
): { markerKey: string; candidate: LabelCandidate } | null => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const delimiterIndex = value.lastIndexOf(LABEL_CANDIDATE_FEATURE_ID_DELIMITER);
  if (delimiterIndex <= 0) {
    return null;
  }
  const markerKey = value.slice(0, delimiterIndex);
  const rawCandidate = value.slice(delimiterIndex + LABEL_CANDIDATE_FEATURE_ID_DELIMITER.length);
  if (
    rawCandidate === 'bottom' ||
    rawCandidate === 'right' ||
    rawCandidate === 'top' ||
    rawCandidate === 'left'
  ) {
    return { markerKey, candidate: rawCandidate };
  }
  return null;
};

const getLabelCandidateInfoFromRenderedFeature = (
  feature: unknown
): { markerKey: string; candidate: LabelCandidate } | null => {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
    return null;
  }

  const record = feature as Record<string, unknown>;
  const parsed = parseLabelCandidateFeatureId(record.id);
  if (parsed) {
    return parsed;
  }

  const props =
    record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
      ? (record.properties as Record<string, unknown>)
      : null;
  const markerKey = typeof props?.markerKey === 'string' ? props.markerKey : null;
  const rawCandidate = props?.labelCandidate;
  if (
    markerKey &&
    (rawCandidate === 'bottom' ||
      rawCandidate === 'right' ||
      rawCandidate === 'top' ||
      rawCandidate === 'left')
  ) {
    return { markerKey, candidate: rawCandidate };
  }

  return null;
};

const getRestaurantIdFromPressFeature = (feature: unknown): string | null => {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
    return null;
  }
  const record = feature as Record<string, unknown>;
  const props =
    record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
      ? (record.properties as Record<string, unknown>)
      : null;
  const restaurantId = props?.restaurantId;
  if (typeof restaurantId !== 'string' || restaurantId.length === 0) {
    return null;
  }
  return restaurantId;
};

const getCoordinateFromPressFeature = (feature: unknown): Coordinate | null => {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
    return null;
  }
  const geometry = (feature as { geometry?: unknown }).geometry;
  if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) {
    return null;
  }
  const coords = (geometry as { coordinates?: unknown }).coordinates;
  if (!isLngLatTuple(coords)) {
    return null;
  }
  return { lng: coords[0], lat: coords[1] };
};

const getCoordinateFromPressEvent = (event: OnPressEvent): Coordinate | null => {
  const coords = event?.coordinates as unknown;
  if (coords && typeof coords === 'object' && !Array.isArray(coords)) {
    const record = coords as Record<string, unknown>;
    const lng = record.longitude;
    const lat = record.latitude;
    if (
      typeof lng === 'number' &&
      Number.isFinite(lng) &&
      typeof lat === 'number' &&
      Number.isFinite(lat)
    ) {
      return { lng, lat };
    }
  }

  // Defensive fallback (some Mapbox APIs use `[lng, lat]` arrays)
  if (isLngLatTuple(coords)) {
    return { lng: coords[0], lat: coords[1] };
  }

  return null;
};

const getPointFromPressEvent = (event: OnPressEvent): { x: number; y: number } | null => {
  const rawPoint = (event as unknown as { point?: unknown }).point;
  if (!rawPoint || typeof rawPoint !== 'object' || Array.isArray(rawPoint)) {
    return null;
  }
  const point = rawPoint as Record<string, unknown>;
  const x = typeof point.x === 'number' && Number.isFinite(point.x) ? point.x : null;
  const y = typeof point.y === 'number' && Number.isFinite(point.y) ? point.y : null;
  if (x == null || y == null) {
    return null;
  }
  return { x, y };
};

const pressEventTargetsMarkerFeature = (event: OnPressEvent): boolean => {
  const features: unknown[] = event?.features ?? [];
  if (features.length === 0) {
    return false;
  }
  return features.some((feature) => Boolean(getRestaurantIdFromPressFeature(feature)));
};

const isTapInsidePinInteractionGeometry = ({
  mapInstance,
  tapPoint,
  coordinate,
}: {
  mapInstance: MapboxMapRef | null;
  tapPoint: { x: number; y: number };
  coordinate: Coordinate | null;
}): Promise<boolean> => {
  if (!coordinate || !mapInstance?.getPointInView) {
    return Promise.resolve(false);
  }

  return mapInstance
    .getPointInView([coordinate.lng, coordinate.lat])
    .then((pointInView) => {
      if (!pointInView || pointInView.length < 2) {
        return false;
      }
      const centerX = pointInView[0];
      const centerY = pointInView[1] - PIN_INTERACTION_CENTER_SHIFT_Y_PX;
      const dx = tapPoint.x - centerX;
      const dy = tapPoint.y - centerY;
      return dx * dx + dy * dy <= PIN_TAP_INTENT_RADIUS_PX * PIN_TAP_INTENT_RADIUS_PX;
    })
    .catch(() => false);
};

const isTapInsideDotInteractionGeometry = ({
  mapInstance,
  tapPoint,
  coordinate,
}: {
  mapInstance: MapboxMapRef | null;
  tapPoint: { x: number; y: number };
  coordinate: Coordinate | null;
}): Promise<boolean> => {
  if (!coordinate || !mapInstance?.getPointInView) {
    return Promise.resolve(false);
  }

  return mapInstance
    .getPointInView([coordinate.lng, coordinate.lat])
    .then((pointInView) => {
      if (!pointInView || pointInView.length < 2) {
        return false;
      }
      const dx = tapPoint.x - pointInView[0];
      const dy = tapPoint.y - pointInView[1];
      return dx * dx + dy * dy <= DOT_TAP_INTENT_RADIUS_PX * DOT_TAP_INTENT_RADIUS_PX;
    })
    .catch(() => false);
};

const pickFirstRestaurantIdFromPressFeatures = (
  features: unknown[]
): { restaurantId: string; coordinate: Coordinate | null } | null => {
  for (const feature of features) {
    const restaurantId = getRestaurantIdFromPressFeature(feature);
    if (!restaurantId) {
      continue;
    }
    return { restaurantId, coordinate: getCoordinateFromPressFeature(feature) };
  }
  return null;
};

const getNumericPressFeatureProperty = (feature: unknown, key: string): number | null => {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
    return null;
  }
  const record = feature as Record<string, unknown>;
  const props =
    record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
      ? (record.properties as Record<string, unknown>)
      : null;
  const value = props?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

const pickTopRestaurantIdFromPressFeatures = (
  features: unknown[]
): { restaurantId: string; coordinate: Coordinate | null } | null => {
  let best: {
    restaurantId: string;
    coordinate: Coordinate | null;
    lodZ: number;
    rank: number;
    featureIndex: number;
  } | null = null;

  for (const [featureIndex, feature] of features.entries()) {
    const restaurantId = getRestaurantIdFromPressFeature(feature);
    if (!restaurantId) {
      continue;
    }
    const coordinate = getCoordinateFromPressFeature(feature);
    const lodZ = getNumericPressFeatureProperty(feature, 'lodZ') ?? Number.NEGATIVE_INFINITY;
    const rank = getNumericPressFeatureProperty(feature, 'rank') ?? Number.POSITIVE_INFINITY;

    if (!best) {
      best = { restaurantId, coordinate, lodZ, rank, featureIndex };
      continue;
    }
    if (lodZ > best.lodZ) {
      best = { restaurantId, coordinate, lodZ, rank, featureIndex };
      continue;
    }
    if (lodZ < best.lodZ) {
      continue;
    }
    if (rank < best.rank) {
      best = { restaurantId, coordinate, lodZ, rank, featureIndex };
      continue;
    }
    if (rank > best.rank) {
      continue;
    }
    if (featureIndex < best.featureIndex) {
      best = { restaurantId, coordinate, lodZ, rank, featureIndex };
    }
  }

  if (!best) {
    return null;
  }
  return { restaurantId: best.restaurantId, coordinate: best.coordinate };
};

const getStringPressFeatureProperty = (feature: unknown, key: string): string | null => {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
    return null;
  }
  const record = feature as Record<string, unknown>;
  const props =
    record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
      ? (record.properties as Record<string, unknown>)
      : null;
  const value = props?.[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value;
};

const getLabelTextFromPressFeature = (feature: unknown): string | null => {
  const dishName = getStringPressFeatureProperty(feature, 'dishName');
  const restaurantName = getStringPressFeatureProperty(feature, 'restaurantName');
  const isDishPin =
    (feature as { properties?: { isDishPin?: unknown } })?.properties?.isDishPin === true;

  if (isDishPin && dishName && restaurantName) {
    return `${dishName}\n${restaurantName}`;
  }
  if (dishName) {
    return dishName;
  }
  if (restaurantName) {
    return restaurantName;
  }
  return null;
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizePinsRenderKeyForTopology = (pinsRenderKey: string): string => {
  if (pinsRenderKey.startsWith(PINS_RENDER_KEY_HOLD_PREFIX)) {
    return pinsRenderKey.slice(PINS_RENDER_KEY_HOLD_PREFIX.length);
  }
  if (pinsRenderKey.startsWith(PINS_RENDER_KEY_SHOW_PREFIX)) {
    return pinsRenderKey.slice(PINS_RENDER_KEY_SHOW_PREFIX.length);
  }
  return pinsRenderKey;
};

const isPinsRenderKeyHeld = (pinsRenderKey: string): boolean =>
  pinsRenderKey.startsWith(PINS_RENDER_KEY_HOLD_PREFIX);

const pickClosestRestaurantIdFromPressFeatures = (
  features: unknown[],
  target: Coordinate
): { restaurantId: string; coordinate: Coordinate | null } | null => {
  let best: { restaurantId: string; coordinate: Coordinate | null } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const feature of features) {
    const restaurantId = getRestaurantIdFromPressFeature(feature);
    if (!restaurantId) {
      continue;
    }
    const coordinate = getCoordinateFromPressFeature(feature);
    if (!coordinate) {
      continue;
    }
    const distance = haversineDistanceMiles(target, coordinate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { restaurantId, coordinate };
    }
  }
  return best;
};

const STYLE_PINS_OUTLINE_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_OUTLINE_IMAGE_ID,
  iconSize: STYLE_PINS_OUTLINE_ICON_SIZE,
  iconAnchor: 'bottom',
  symbolZOrder: 'source',
  iconAllowOverlap: true,
  // Visual-only: label placement is handled by the label layer itself (see `restaurantLabelStyle`).
  iconIgnorePlacement: true,
} as MapboxGL.SymbolLayerStyle;

// Pin glyph rendering (crisper than raster sprites at small sizes).
// Requires style `glyphs` to point at the account that hosts `icomoon Regular`.
const PIN_GLYPH_FONT_STACK = ['icomoon Regular'];
const PIN_GLYPH_OUTLINE = '\ue900';
const PIN_GLYPH_FILL = '\ue901';
// IcoMoon fonts often have extra vertical bearing/whitespace below the visible glyph.
// Nudge the glyph down so the pin tip sits on the coordinate point (matching the raster pin).
const PIN_GLYPH_TRANSLATE_Y_PX = Math.round(PIN_MARKER_RENDER_SIZE * 0.3);
// Fill glyph tends to sit slightly lower than the raster fill due to font bearings. Negative
// values move the fill up relative to the base.
const PIN_GLYPH_FILL_RELATIVE_TRANSLATE_Y_PX = -2;
// Fine-tune fill glyph x alignment relative to the base. Negative moves left.
const PIN_GLYPH_FILL_RELATIVE_TRANSLATE_X_PX = -0.3;

const STYLE_PINS_OUTLINE_GLYPH_STYLE: MapboxGL.SymbolLayerStyle = {
  textField: PIN_GLYPH_OUTLINE,
  textFont: PIN_GLYPH_FONT_STACK,
  textSize: PIN_MARKER_RENDER_SIZE,
  textColor: '#ffffff',
  textAnchor: 'bottom',
  textTranslate: [0, PIN_GLYPH_TRANSLATE_Y_PX],
  textTranslateAnchor: 'viewport',
  symbolZOrder: 'source',
  textAllowOverlap: true,
  // Visual-only: label placement is handled by the label layer itself (see `restaurantLabelStyle`).
  textIgnorePlacement: true,
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_SHADOW_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_SHADOW_IMAGE_ID,
  // `pin-shadow.png` includes padding so blur isn't clipped; keep size aligned with the base pin.
  iconSize: STYLE_PINS_SHADOW_ICON_SIZE,
  iconAnchor: 'bottom',
  symbolZOrder: 'source',
  iconAllowOverlap: true,
  // Shadow should never affect placement/collision decisions for labels.
  iconIgnorePlacement: true,
  // Shadow opacity is baked into the sprite, but we keep an extra multiplier here so it's easy
  // to tune without regenerating assets.
  iconOpacity: STYLE_PINS_SHADOW_OPACITY,
  iconTranslate: STYLE_PINS_SHADOW_TRANSLATE,
  iconTranslateAnchor: 'viewport',
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_FILL_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_FILL_IMAGE_ID,
  iconSize: STYLE_PINS_FILL_ICON_SIZE,
  iconAnchor: 'bottom',
  // Match `styles.pinFill` layout (positioned within the base image bounds).
  iconOffset: [0, STYLE_PINS_FILL_OFFSET_IMAGE_PX],
  symbolZOrder: 'source',
  iconAllowOverlap: true,
  // Fill should never affect placement/collision decisions for labels (only the base does).
  iconIgnorePlacement: true,
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_FILL_GLYPH_STYLE: MapboxGL.SymbolLayerStyle = {
  textField: PIN_GLYPH_FILL,
  textFont: PIN_GLYPH_FONT_STACK,
  // Match `PIN_FILL_RENDER_HEIGHT` within the same wrapper footprint.
  textSize: PIN_FILL_RENDER_HEIGHT,
  textColor: '#ffffff',
  textAnchor: 'bottom',
  // Match `styles.pinFill` layout (positioned within the base image bounds).
  textTranslate: [
    PIN_GLYPH_FILL_RELATIVE_TRANSLATE_X_PX,
    STYLE_PINS_FILL_OFFSET_RENDER_PX +
      PIN_GLYPH_TRANSLATE_Y_PX +
      PIN_GLYPH_FILL_RELATIVE_TRANSLATE_Y_PX,
  ],
  textTranslateAnchor: 'viewport',
  symbolZOrder: 'source',
  textAllowOverlap: true,
  // Fill should never affect placement/collision decisions for labels (only the base does).
  textIgnorePlacement: true,
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_RANK_STYLE: MapboxGL.SymbolLayerStyle = {
  symbolZOrder: 'source',
  textField: ['to-string', ['get', 'rank']],
  // Match `styles.pinRank` (white, bold-ish).
  textSize: PIN_RANK_FONT_SIZE,
  textColor: '#ffffff',
  textFont: ['DIN Offc Pro Bold', 'DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textAnchor: 'center',
  // Match `styles.pinRankWrapper` layout (centered on the pin fill region).
  textTranslate: [0, STYLE_PINS_RANK_TRANSLATE_Y],
  textTranslateAnchor: 'viewport',
} as MapboxGL.SymbolLayerStyle;

// Invisible collision obstacle used to make label placement respect pin bases.
//
// This layer creates a collision box at each pin coordinate using the base silhouette, but renders
// it fully transparent.
//
// IMPORTANT (layer ordering): Mapbox symbol placement gives priority to *higher* layers. We insert
// this collision layer *above* the real label layer so pin obstacles reserve collision space before
// labels are evaluated.
const LABEL_PIN_COLLISION_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_OUTLINE_IMAGE_ID,
  iconSize: STYLE_PINS_OUTLINE_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE,
  iconAnchor: 'bottom',
  iconOffset: [0, PIN_COLLISION_OUTLINE_OFFSET_IMAGE_PX],
  symbolZOrder: 'source',
  // Always place the obstacle, even when pins overlap each other.
  iconAllowOverlap: true,
  // IMPORTANT: must be false so this layer reserves collision space for subsequent symbols.
  iconIgnorePlacement: false,
  iconPadding: 0,
  // Keep it invisible while still participating in placement.
  //
  // NOTE: We intentionally keep this non-zero. On cold starts / RN reloads, Mapbox can sometimes
  // skip placement/collision for symbols that are effectively "not drawable" (missing image,
  // fully-transparent, etc). We pair this with a one-time post-style-load re-mount to guarantee
  // collision is initialized deterministically.
  iconOpacity: 0.001,
} as MapboxGL.SymbolLayerStyle;

const LABEL_PIN_COLLISION_STYLE_SIDE_LEFT: MapboxGL.SymbolLayerStyle = {
  ...LABEL_PIN_COLLISION_STYLE,
  iconOffset: [-PIN_COLLISION_OUTLINE_SIDE_PAD_IMAGE_PX, PIN_COLLISION_OUTLINE_OFFSET_IMAGE_PX],
} as MapboxGL.SymbolLayerStyle;

const LABEL_PIN_COLLISION_STYLE_SIDE_RIGHT: MapboxGL.SymbolLayerStyle = {
  ...LABEL_PIN_COLLISION_STYLE,
  iconOffset: [PIN_COLLISION_OUTLINE_SIDE_PAD_IMAGE_PX, PIN_COLLISION_OUTLINE_OFFSET_IMAGE_PX],
} as MapboxGL.SymbolLayerStyle;

const LABEL_PIN_COLLISION_STYLE_FILL: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_FILL_IMAGE_ID,
  iconSize: STYLE_PINS_FILL_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE,
  iconAnchor: 'bottom',
  // Match `styles.pinFill` layout (positioned within the base image bounds).
  iconOffset: [0, STYLE_PINS_FILL_OFFSET_IMAGE_PX + PIN_COLLISION_FILL_OFFSET_IMAGE_PX],
  symbolZOrder: 'source',
  // Always place the obstacle, even when pins overlap each other.
  iconAllowOverlap: true,
  // IMPORTANT: must be false so this layer reserves collision space for subsequent symbols.
  iconIgnorePlacement: false,
  iconPadding: 0,
  // Keep it invisible while still participating in placement.
  iconOpacity: 0.001,
} as MapboxGL.SymbolLayerStyle;

const LABEL_PIN_COLLISION_STYLE_FILL_SIDE_LEFT: MapboxGL.SymbolLayerStyle = {
  ...LABEL_PIN_COLLISION_STYLE_FILL,
  iconOffset: [
    -PIN_COLLISION_FILL_SIDE_PAD_IMAGE_PX,
    STYLE_PINS_FILL_OFFSET_IMAGE_PX + PIN_COLLISION_FILL_OFFSET_IMAGE_PX,
  ],
} as MapboxGL.SymbolLayerStyle;

const LABEL_PIN_COLLISION_STYLE_FILL_SIDE_RIGHT: MapboxGL.SymbolLayerStyle = {
  ...LABEL_PIN_COLLISION_STYLE_FILL,
  iconOffset: [
    PIN_COLLISION_FILL_SIDE_PAD_IMAGE_PX,
    STYLE_PINS_FILL_OFFSET_IMAGE_PX + PIN_COLLISION_FILL_OFFSET_IMAGE_PX,
  ],
} as MapboxGL.SymbolLayerStyle;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const getNowMs = () =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
type MapStagePressure = 'healthy' | 'pressured' | 'critical';

type PinTransitionDirection = 'promote' | 'demote';

type PinTransitionVisual = {
  active: number;
  scale: number;
  opacity: number;
  rankOpacity: number;
  labelOpacity: number;
};

const STEADY_PIN_TRANSITION_VISUAL: PinTransitionVisual = {
  active: 0,
  scale: 1,
  opacity: 1,
  rankOpacity: 1,
  labelOpacity: 1,
};

const getPinTransitionProfile = (progress01: number): Omit<PinTransitionVisual, 'active'> => {
  const clampedProgress = clamp01(progress01);
  const easedProgress = easeOutQuart(clampedProgress);
  const rankProgressLinear = clamp01(
    (clampedProgress - DOT_TO_PIN_RANK_FADE_START) / (1 - DOT_TO_PIN_RANK_FADE_START)
  );
  const rankOpacity = easeOutCubic(rankProgressLinear);

  return {
    scale: DOT_TO_PIN_TRANSITION_MIN_SCALE + (1 - DOT_TO_PIN_TRANSITION_MIN_SCALE) * easedProgress,
    opacity: easedProgress,
    rankOpacity,
    labelOpacity: easedProgress,
  };
};
const START_PIN_TRANSITION_VISUAL: PinTransitionVisual = {
  active: 1,
  ...getPinTransitionProfile(0),
};

const getPinTransitionVisual = (
  startedAtMs: number | undefined,
  nowMs: number,
  direction: PinTransitionDirection = 'promote'
): PinTransitionVisual => {
  if (typeof startedAtMs !== 'number') {
    return STEADY_PIN_TRANSITION_VISUAL;
  }
  const elapsedProgress = clamp01((nowMs - startedAtMs) / DOT_TO_PIN_TRANSITION_DURATION_MS);
  if (elapsedProgress >= 1) {
    return STEADY_PIN_TRANSITION_VISUAL;
  }
  const profileProgress = direction === 'promote' ? elapsedProgress : 1 - elapsedProgress;
  const profile = getPinTransitionProfile(profileProgress);

  return {
    active: 1,
    ...profile,
  };
};

type PinTransitionDemotionEntry = {
  markerKey: string;
  startedAtMs: number;
  feature: Feature<Point, RestaurantFeatureProperties>;
};

type PinTransitionState = {
  promoteStartedAtByMarkerKey: Map<string, number>;
  pendingPromoteDelayByMarkerKey: Map<string, number>;
  demoteFeatureByMarkerKey: Map<
    string,
    { startedAtMs: number; feature: Feature<Point, RestaurantFeatureProperties> }
  >;
  previousPinnedFeatureByMarkerKey: Map<string, Feature<Point, RestaurantFeatureProperties>>;
  pendingInitialRevealCommitId: number | null;
  appliedInitialRevealCommitId: number | null;
  observedInitialRevealCommitId: number | null;
  initialRevealQueued: boolean;
};

const createPinTransitionState = (): PinTransitionState => ({
  promoteStartedAtByMarkerKey: new Map(),
  pendingPromoteDelayByMarkerKey: new Map(),
  demoteFeatureByMarkerKey: new Map(),
  previousPinnedFeatureByMarkerKey: new Map(),
  pendingInitialRevealCommitId: null,
  appliedInitialRevealCommitId: null,
  observedInitialRevealCommitId: null,
  initialRevealQueued: false,
});

const usePinTransitionController = ({
  sortedRestaurantMarkers,
  pinsRenderKey,
  markerRevealCommitId,
  buildMarkerKey,
  pinnedDotKeys,
  suppressTransitions,
}: {
  sortedRestaurantMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  pinsRenderKey: string;
  markerRevealCommitId: number | null;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  pinnedDotKeys: Set<string>;
  suppressTransitions: boolean;
}) => {
  const [transitionClockMs, setTransitionClockMs] = React.useState(0);
  const stateRef = React.useRef<PinTransitionState>(createPinTransitionState());
  const state = stateRef.current;
  const MIN_TRANSITION_TICK_MS = 16;
  const isMarkerDataHeld = isPinsRenderKeyHeld(pinsRenderKey);
  const isInitialRevealCommitPending =
    markerRevealCommitId != null &&
    markerRevealCommitId !== state.appliedInitialRevealCommitId &&
    !isMarkerDataHeld;

  // Keep per-marker transitions only; avoid global batch opacity fades which can
  // cause flash/disappear artifacts when lane/phase transitions race.
  const batchFadeProgress = 1;

  const pinTransitionFrameHandleRef = React.useRef<number | ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastTickMsRef = React.useRef(0);
  const clearPinTransitionFrameHandle = React.useCallback(() => {
    const handle = pinTransitionFrameHandleRef.current;
    if (handle == null) {
      return;
    }
    if (typeof handle === 'number') {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle);
      }
    } else {
      clearTimeout(handle);
    }
    pinTransitionFrameHandleRef.current = null;
  }, []);
  const schedulePinTransitionTick = React.useCallback((tick: (frameTimeMs: number) => void) => {
    if (typeof requestAnimationFrame === 'function') {
      pinTransitionFrameHandleRef.current = requestAnimationFrame((frameTimeMs) =>
        tick(frameTimeMs)
      );
      return;
    }
    pinTransitionFrameHandleRef.current = setTimeout(() => tick(getNowMs()), MIN_TRANSITION_TICK_MS);
  }, []);
  const runPinTransitionFrameRef = React.useRef<() => void>(() => undefined);
  const runPinTransitionFrame = React.useCallback(() => {
    if (suppressTransitions) {
      return;
    }
    // Already running on a frame loop.
    if (pinTransitionFrameHandleRef.current != null) {
      return;
    }

    const tick = (frameTimeMs: number) => {
      const nowMs = Number.isFinite(frameTimeMs) ? frameTimeMs : getNowMs();
      if (nowMs - lastTickMsRef.current < MIN_TRANSITION_TICK_MS) {
        schedulePinTransitionTick(tick);
        return;
      }
      const promoteTransitions = state.promoteStartedAtByMarkerKey;
      const pendingPromoteDelays = state.pendingPromoteDelayByMarkerKey;
      const demoteTransitions = state.demoteFeatureByMarkerKey;
      let hasActiveTransitions = false;

      if (pendingPromoteDelays.size > 0) {
        pendingPromoteDelays.forEach((delayMs, markerKey) => {
          promoteTransitions.set(markerKey, nowMs + Math.max(0, delayMs));
        });
        pendingPromoteDelays.clear();
        state.initialRevealQueued = false;
        hasActiveTransitions = true;
      }

      for (const [markerKey, startedAtMs] of promoteTransitions) {
        if (nowMs - startedAtMs >= DOT_TO_PIN_TRANSITION_DURATION_MS) {
          promoteTransitions.delete(markerKey);
          continue;
        }
        hasActiveTransitions = true;
      }
      for (const [markerKey, entry] of demoteTransitions) {
        if (nowMs - entry.startedAtMs >= DOT_TO_PIN_TRANSITION_DURATION_MS) {
          demoteTransitions.delete(markerKey);
          continue;
        }
        hasActiveTransitions = true;
      }

      lastTickMsRef.current = nowMs;
      setTransitionClockMs(nowMs);

      if (hasActiveTransitions) {
        schedulePinTransitionTick(tick);
        return;
      }
      clearPinTransitionFrameHandle();
    };

    tick(getNowMs());
  }, [clearPinTransitionFrameHandle, schedulePinTransitionTick, state, suppressTransitions]);
  runPinTransitionFrameRef.current = runPinTransitionFrame;

  // Clean up frame loop on unmount
  React.useEffect(() => {
    return () => {
      clearPinTransitionFrameHandle();
    };
  }, [clearPinTransitionFrameHandle]);

  React.useLayoutEffect(() => {
    if (markerRevealCommitId == null) {
      return;
    }
    if (state.observedInitialRevealCommitId === markerRevealCommitId) {
      return;
    }
    state.observedInitialRevealCommitId = markerRevealCommitId;
    state.pendingInitialRevealCommitId = markerRevealCommitId;
  }, [markerRevealCommitId, state]);

  React.useLayoutEffect(() => {
    const nextPinnedFeatureByMarkerKey = new Map<
      string,
      Feature<Point, RestaurantFeatureProperties>
    >();
    sortedRestaurantMarkers.forEach((feature) => {
      nextPinnedFeatureByMarkerKey.set(buildMarkerKey(feature), feature);
    });

    if (suppressTransitions) {
      state.promoteStartedAtByMarkerKey.clear();
      state.pendingPromoteDelayByMarkerKey.clear();
      state.demoteFeatureByMarkerKey.clear();
      state.pendingInitialRevealCommitId = null;
      state.initialRevealQueued = false;
      if (markerRevealCommitId != null) {
        state.appliedInitialRevealCommitId = markerRevealCommitId;
      }
      state.previousPinnedFeatureByMarkerKey = nextPinnedFeatureByMarkerKey;
      if (transitionClockMs !== 0) {
        setTransitionClockMs(0);
      }
      return;
    }

    const now = getNowMs();
    const shouldRunInitialReveal =
      state.pendingInitialRevealCommitId != null &&
      state.pendingInitialRevealCommitId !== state.appliedInitialRevealCommitId &&
      !isMarkerDataHeld &&
      nextPinnedFeatureByMarkerKey.size > 0;
    let didMutateTransitions = false;
    let shouldStartAnimationLoop = false;

    if (shouldRunInitialReveal) {
      // Initial reveal: pins appear at steady state (no global batch opacity fade).
      state.promoteStartedAtByMarkerKey.clear();
      state.pendingPromoteDelayByMarkerKey.clear();
      state.demoteFeatureByMarkerKey.clear();
      state.appliedInitialRevealCommitId = state.pendingInitialRevealCommitId;
      state.pendingInitialRevealCommitId = null;
      state.initialRevealQueued = false;
      didMutateTransitions = true;
    } else {
      if (
        state.pendingInitialRevealCommitId != null &&
        state.pendingInitialRevealCommitId !== state.appliedInitialRevealCommitId &&
        !isMarkerDataHeld &&
        nextPinnedFeatureByMarkerKey.size === 0
      ) {
        state.appliedInitialRevealCommitId = state.pendingInitialRevealCommitId;
        state.pendingInitialRevealCommitId = null;
        state.initialRevealQueued = false;
      }

      for (const markerKey of nextPinnedFeatureByMarkerKey.keys()) {
        if (state.previousPinnedFeatureByMarkerKey.has(markerKey)) {
          continue;
        }
        state.promoteStartedAtByMarkerKey.set(markerKey, now);
        state.pendingPromoteDelayByMarkerKey.delete(markerKey);
        state.demoteFeatureByMarkerKey.delete(markerKey);
        didMutateTransitions = true;
        shouldStartAnimationLoop = true;
      }
      for (const [markerKey, feature] of state.previousPinnedFeatureByMarkerKey) {
        if (nextPinnedFeatureByMarkerKey.has(markerKey)) {
          continue;
        }
        state.demoteFeatureByMarkerKey.set(markerKey, { startedAtMs: now, feature });
        state.promoteStartedAtByMarkerKey.delete(markerKey);
        state.pendingPromoteDelayByMarkerKey.delete(markerKey);
        didMutateTransitions = true;
        shouldStartAnimationLoop = true;
      }
    }

    for (const markerKey of Array.from(state.promoteStartedAtByMarkerKey.keys())) {
      if (nextPinnedFeatureByMarkerKey.has(markerKey)) {
        continue;
      }
      state.promoteStartedAtByMarkerKey.delete(markerKey);
      didMutateTransitions = true;
    }
    for (const markerKey of Array.from(state.pendingPromoteDelayByMarkerKey.keys())) {
      if (nextPinnedFeatureByMarkerKey.has(markerKey)) {
        continue;
      }
      state.pendingPromoteDelayByMarkerKey.delete(markerKey);
      didMutateTransitions = true;
    }
    for (const markerKey of Array.from(state.demoteFeatureByMarkerKey.keys())) {
      if (!nextPinnedFeatureByMarkerKey.has(markerKey)) {
        continue;
      }
      state.demoteFeatureByMarkerKey.delete(markerKey);
      didMutateTransitions = true;
    }

    state.previousPinnedFeatureByMarkerKey = nextPinnedFeatureByMarkerKey;

    if (didMutateTransitions) {
      setTransitionClockMs(now);
    }
    if (
      !shouldStartAnimationLoop &&
      state.promoteStartedAtByMarkerKey.size === 0 &&
      state.pendingPromoteDelayByMarkerKey.size === 0 &&
      state.demoteFeatureByMarkerKey.size === 0
    ) {
      setTransitionClockMs(0);
    }
    if (shouldStartAnimationLoop) {
      runPinTransitionFrameRef.current();
    }
  }, [
    buildMarkerKey,
    isMarkerDataHeld,
    markerRevealCommitId,
    sortedRestaurantMarkers,
    suppressTransitions,
    state,
    transitionClockMs,
  ]);

  React.useEffect(() => {
    return () => {
      clearPinTransitionFrameHandle();
      state.promoteStartedAtByMarkerKey.clear();
      state.pendingPromoteDelayByMarkerKey.clear();
      state.demoteFeatureByMarkerKey.clear();
      state.previousPinnedFeatureByMarkerKey.clear();
      state.initialRevealQueued = false;
      state.pendingInitialRevealCommitId = null;
      state.appliedInitialRevealCommitId = null;
      state.observedInitialRevealCommitId = null;
    };
  }, [clearPinTransitionFrameHandle, state]);

  const immediatePromotionStartedAtByMarkerKey = React.useMemo(() => {
    const nowMs = transitionClockMs > 0 ? transitionClockMs : getNowMs();
    const next = new Map<string, number>();

    sortedRestaurantMarkers.forEach((feature) => {
      const markerKey = buildMarkerKey(feature);
      if (
        state.promoteStartedAtByMarkerKey.has(markerKey) ||
        state.pendingPromoteDelayByMarkerKey.has(markerKey)
      ) {
        return;
      }
      // Phase 9: Initial reveal is instant — skip predictive transition entries.
      // Pins will appear at steady state on the next render after layout effect applies the commit.
      if (isInitialRevealCommitPending) {
        return;
      }
      if (!state.previousPinnedFeatureByMarkerKey.has(markerKey)) {
        next.set(markerKey, nowMs);
      }
    });

    return next;
  }, [
    buildMarkerKey,
    isInitialRevealCommitPending,
    sortedRestaurantMarkers,
    state,
    transitionClockMs,
  ]);

  const demotionTransitions = React.useMemo<Array<PinTransitionDemotionEntry>>(() => {
    const nowMs = transitionClockMs > 0 ? transitionClockMs : getNowMs();
    const transitions: Array<PinTransitionDemotionEntry> = [];
    state.demoteFeatureByMarkerKey.forEach(({ startedAtMs, feature }, markerKey) => {
      if (nowMs - startedAtMs >= DOT_TO_PIN_TRANSITION_DURATION_MS) {
        return;
      }
      transitions.push({ markerKey, startedAtMs, feature });
    });
    state.previousPinnedFeatureByMarkerKey.forEach((feature, markerKey) => {
      if (pinnedDotKeys.has(markerKey) || state.demoteFeatureByMarkerKey.has(markerKey)) {
        return;
      }
      transitions.push({ markerKey, startedAtMs: nowMs, feature });
    });
    return transitions;
  }, [pinnedDotKeys, state, transitionClockMs]);

  const demotingRestaurantIdList = React.useMemo(() => {
    const restaurantIds = new Set<string>();
    demotionTransitions.forEach(({ feature }) => {
      restaurantIds.add(feature.properties.restaurantId);
    });
    return Array.from(restaurantIds);
  }, [demotionTransitions]);

  const hasPendingPromotions = state.pendingPromoteDelayByMarkerKey.size > 0;
  const hasStartedPromotions =
    state.promoteStartedAtByMarkerKey.size > 0 || immediatePromotionStartedAtByMarkerKey.size > 0;
  const isAwaitingInitialRevealStart =
    (state.initialRevealQueued || isInitialRevealCommitPending) &&
    sortedRestaurantMarkers.length > 0;

  return {
    transitionClockMs,
    batchFadeProgress,
    promoteStartedAtByMarkerKey: state.promoteStartedAtByMarkerKey,
    pendingPromoteDelayByMarkerKey: state.pendingPromoteDelayByMarkerKey,
    immediatePromotionStartedAtByMarkerKey,
    demotionTransitions,
    demotingRestaurantIdList,
    hasPendingPromotions,
    hasStartedPromotions,
    isAwaitingInitialRevealStart,
  };
};

type SearchMapProps = {
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  styleURL: string;
  scoreMode: 'global_quality' | 'coverage_display';
  mapCenter: [number, number] | null;
  mapZoom: number;
  cameraPadding?: CameraPadding | null;
  isFollowingUser: boolean;
  onPress: () => void;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  onCameraChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onVisualReady?: (requestKey: string) => void;
  onMarkerRevealSettled?: (payload: {
    requestKey: string;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  }) => void;
  selectedRestaurantId?: string | null;
  sortedRestaurantMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  dotRestaurantFeatures?: FeatureCollection<Point, RestaurantFeatureProperties> | null;
  markersRenderKey: string;
  pinsRenderKey: string;
  shouldSignalVisualReady?: boolean;
  requireMarkerVisualsForVisualReady?: boolean;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  restaurantFeatures: FeatureCollection<Point, RestaurantFeatureProperties>;
  restaurantLabelStyle: MapboxGL.SymbolLayerStyle;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  locationPulse: Animated.Value;
  disableMarkers?: boolean;
  disableBlur?: boolean;
  onProfilerRender?: React.ProfilerOnRenderCallback;
  mapQueryBudget?: MapQueryBudget | null;
  runtimeWorkSchedulerRef?: React.MutableRefObject<RuntimeWorkScheduler> | null;
  selectionFeedbackOperationId?: string | null;
  isRunOneHandoffActive?: boolean;
  isRunOneChromeDeferred?: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  onRuntimeMechanismEvent?: (
    event: 'runtime_write_span',
    payload?: Record<string, unknown>
  ) => void;
};

const SearchMap: React.FC<SearchMapProps> = ({
  mapRef,
  cameraRef,
  styleURL,
  scoreMode,
  mapCenter,
  mapZoom,
  cameraPadding,
  isFollowingUser,
  onPress,
  onTouchStart,
  onTouchEnd,
  onCameraChanged,
  onMapIdle,
  onMapLoaded,
  onMarkerPress,
  onVisualReady,
  onMarkerRevealSettled,
  selectedRestaurantId,
  sortedRestaurantMarkers: incomingSortedRestaurantMarkers,
  dotRestaurantFeatures: incomingDotRestaurantFeatures,
  markersRenderKey: incomingMarkersRenderKey,
  pinsRenderKey: incomingPinsRenderKey,
  shouldSignalVisualReady = false,
  requireMarkerVisualsForVisualReady = false,
  buildMarkerKey,
  restaurantFeatures,
  restaurantLabelStyle,
  isMapStyleReady,
  userLocation,
  locationPulse,
  disableMarkers = false,
  disableBlur = false,
  onProfilerRender,
  mapQueryBudget = null,
  runtimeWorkSchedulerRef = null,
  selectionFeedbackOperationId = null,
  isRunOneHandoffActive = false,
  isRunOneChromeDeferred = false,
  searchRuntimeBus,
  onRuntimeMechanismEvent,
}) => {
  const shouldDisableMarkers = disableMarkers === true;
  const shouldDisableBlur = disableBlur === true;
  const runOneMapLoadSheddingActive = isRunOneHandoffActive || isRunOneChromeDeferred;
  const [stagedPublishPhase, setStagedPublishPhase] = React.useState<'dots' | 'pins' | 'full'>(
    'full'
  );
  const stagedPublishTokenRef = React.useRef<string | null>(null);
  const stagedPublishOperationIdRef = React.useRef<string | null>(null);
  const stagedPublishPhaseRef = React.useRef<'dots' | 'pins' | 'full'>('full');
  React.useEffect(() => {
    stagedPublishPhaseRef.current = stagedPublishPhase;
  }, [stagedPublishPhase]);
  const stagedPublishHealthyLabelFrameCountRef = React.useRef(0);
  const stagedPublishAwaitingPostDeferredFrameRef = React.useRef(false);
  const stagedPublishConsecutiveYieldFramesRef = React.useRef(0);
  const stagedPublishLastYieldCountRef = React.useRef(0);
  const isRunOneHandoffActiveRef = React.useRef(isRunOneHandoffActive);
  isRunOneHandoffActiveRef.current = isRunOneHandoffActive;
  const isRunOneChromeDeferredRef = React.useRef(isRunOneChromeDeferred);
  isRunOneChromeDeferredRef.current = isRunOneChromeDeferred;
  const {
    isMapActivationDeferred,
    visualSyncCandidateRequestKey,
    markerRevealCommitId,
    runOneCommitSpanPressureActive,
    activeOperationLane,
  } =
    useSearchRuntimeBusSelector(
      searchRuntimeBus,
      (state) => ({
        isMapActivationDeferred: state.isMapActivationDeferred,
        visualSyncCandidateRequestKey: state.visualSyncCandidateRequestKey,
        markerRevealCommitId: state.markerRevealCommitId,
        runOneCommitSpanPressureActive: state.runOneCommitSpanPressureActive,
        activeOperationLane:
          SEARCH_OPERATION_LANE_RANK[state.activeOperationLane] >=
          SEARCH_OPERATION_LANE_RANK.lane_d_map_dots
            ? state.activeOperationLane
            : 'lane_c_list_first_paint',
      }),
      (left, right) =>
        left.isMapActivationDeferred === right.isMapActivationDeferred &&
        left.visualSyncCandidateRequestKey === right.visualSyncCandidateRequestKey &&
        left.markerRevealCommitId === right.markerRevealCommitId &&
        left.runOneCommitSpanPressureActive === right.runOneCommitSpanPressureActive &&
        left.activeOperationLane === right.activeOperationLane
    );
  const visualReadyRequestKey = visualSyncCandidateRequestKey;
  const shouldDeferDotsForOperationLane = false;
  const shouldDeferPinsForOperationLane = false;
  const shouldDeferFinalizeForOperationLane = false;
  const sortedRestaurantMarkers = shouldDeferDotsForOperationLane
    ? EMPTY_SORTED_RESTAURANT_MARKERS
    : incomingSortedRestaurantMarkers;
  const dotRestaurantFeatures = shouldDeferDotsForOperationLane ? null : incomingDotRestaurantFeatures;
  const markersRenderKey = incomingMarkersRenderKey;
  const pinsRenderKey = incomingPinsRenderKey;
  const hasStagedPublishPayload =
    sortedRestaurantMarkers.length > 0 || (dotRestaurantFeatures?.features?.length ?? 0) > 0;
  const shouldUseStagedPublish =
    false;
  const pinsTopologyKey = React.useMemo(
    () => normalizePinsRenderKeyForTopology(pinsRenderKey),
    [pinsRenderKey]
  );
  const markersTopologyRenderKey = React.useMemo(
    () => markersRenderKey.replace(/^pins:(?:hold::|show::)/, 'pins:'),
    [markersRenderKey]
  );
  const shouldDeferMapFromPressure = isMapActivationDeferred || runOneCommitSpanPressureActive;
  const isMapPinsDeferred = React.useCallback(
    () => shouldDeferPinsForOperationLane || shouldDeferMapFromPressure,
    [shouldDeferMapFromPressure, shouldDeferPinsForOperationLane]
  );
  const isMapFinalizeDeferred = React.useCallback(
    () => shouldDeferFinalizeForOperationLane || shouldDeferMapFromPressure,
    [shouldDeferFinalizeForOperationLane, shouldDeferMapFromPressure]
  );
  React.useEffect(() => {
    let animationFrameHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const clearScheduledRelease = () => {
      if (animationFrameHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameHandle);
        animationFrameHandle = null;
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };
    const scheduleRelease = (operationId: string) => {
      clearScheduledRelease();
      const releaseIdleIfReady = () => {
        const state = searchRuntimeBus.getState();
        if (state.activeOperationId !== operationId || state.activeOperationLane !== 'lane_f_polish') {
          return;
        }
        if (state.isVisualSyncPending || isMapFinalizeDeferred()) {
          return;
        }
        searchRuntimeBus.publish({
          activeOperationLane: 'idle',
          activeOperationId: null,
        });
      };
      if (typeof requestAnimationFrame === 'function') {
        animationFrameHandle = requestAnimationFrame(() => {
          animationFrameHandle = null;
          releaseIdleIfReady();
        });
        return;
      }
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        releaseIdleIfReady();
      }, 0);
    };
    const maybeAdvancePolishLane = () => {
      const state = searchRuntimeBus.getState();
      const operationId = state.activeOperationId;
      if (!operationId || state.activeOperationLane !== 'lane_e_map_pins') {
        return;
      }
      if (state.isVisualSyncPending || isMapPinsDeferred()) {
        return;
      }
      searchRuntimeBus.publish({
        activeOperationLane: 'lane_f_polish',
      });
      scheduleRelease(operationId);
    };
    maybeAdvancePolishLane();
    const unsubscribe = searchRuntimeBus.subscribe(maybeAdvancePolishLane);
    return () => {
      unsubscribe();
      clearScheduledRelease();
    };
  }, [isMapFinalizeDeferred, isMapPinsDeferred, searchRuntimeBus]);
  const emitMapRuntimeWriteSpan = React.useCallback(
    (payload: Record<string, unknown>) => {
      onRuntimeMechanismEvent?.('runtime_write_span', {
        domain: 'map_stage',
        ...payload,
      });
    },
    [onRuntimeMechanismEvent]
  );

  React.useEffect(() => {
    if (!shouldUseStagedPublish) {
      setStagedPublishPhase('full');
      stagedPublishOperationIdRef.current = null;
      return;
    }
    const scheduler = runtimeWorkSchedulerRef?.current ?? null;
    const fallbackOperationId = `map-stage:${markersTopologyRenderKey}:${pinsTopologyKey}:${
      markerRevealCommitId ?? 'none'
    }`;
    const operationId = selectionFeedbackOperationId ?? fallbackOperationId;
    const previousOperationId = stagedPublishOperationIdRef.current;
    const shouldReuseExistingOperation = previousOperationId === operationId;
    let currentStagePhase: 'dots' | 'pins' | 'full' = stagedPublishPhaseRef.current;
    const commitStagedPhase = (
      phase: 'dots' | 'pins' | 'full',
      payload?: Record<string, unknown>
    ) => {
      if (currentStagePhase === phase) {
        return;
      }
      currentStagePhase = phase;
      setStagedPublishPhase(phase);
      emitMapRuntimeWriteSpan({
        label: 'map_stage_phase_commit',
        phase,
        operationId,
        ...(payload ?? {}),
        nowMs: Number(getNowMs().toFixed(1)),
      });
    };
    const startingPhase: 'dots' | 'pins' | 'full' = shouldReuseExistingOperation
      ? currentStagePhase
      : 'dots';
    stagedPublishOperationIdRef.current = operationId;
    const shouldCancelOwnedOperation = selectionFeedbackOperationId == null;
    let animationFrameHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let labelAttemptOrdinal = 0;
    let stageAttemptOrdinal = 0;
    const stageToken = `${operationId}:${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    stagedPublishTokenRef.current = stageToken;
    stagedPublishHealthyLabelFrameCountRef.current = 0;
    stagedPublishAwaitingPostDeferredFrameRef.current =
      isRunOneChromeDeferredRef.current || isRunOneHandoffActiveRef.current;
    let requireExtendedHealthyFrames = stagedPublishAwaitingPostDeferredFrameRef.current;
    stagedPublishConsecutiveYieldFramesRef.current = 0;
    stagedPublishLastYieldCountRef.current = scheduler?.snapshotPressure().yieldCount ?? 0;
    let lastPinsGateReason: string | null = null;
    let lastLabelsGateReason: string | null = null;

    const clearNextFrameHandle = () => {
      if (animationFrameHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameHandle);
        animationFrameHandle = null;
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    const isStageStillActive = () => stagedPublishTokenRef.current === stageToken;
    const scheduleOnNextFrame = (run: () => void) => {
      clearNextFrameHandle();
      if (typeof requestAnimationFrame === 'function') {
        animationFrameHandle = requestAnimationFrame(() => {
          animationFrameHandle = null;
          run();
        });
        return;
      }
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        run();
      }, 0);
    };
    const resolveMapStagePressure = (): MapStagePressure => {
      if (!scheduler) {
        return 'healthy';
      }
      const pressureSnapshot = scheduler.snapshotPressure();
      const yieldDelta = Math.max(
        0,
        pressureSnapshot.yieldCount - stagedPublishLastYieldCountRef.current
      );
      stagedPublishLastYieldCountRef.current = pressureSnapshot.yieldCount;
      if (yieldDelta > 0) {
        stagedPublishConsecutiveYieldFramesRef.current += 1;
      } else {
        stagedPublishConsecutiveYieldFramesRef.current = 0;
      }

      if (
        pressureSnapshot.lastFrameSpentMs > MAP_STAGE_PRESSURE_CRITICAL_BUDGET_MS ||
        stagedPublishConsecutiveYieldFramesRef.current >= 2
      ) {
        return 'critical';
      }

      if (
        pressureSnapshot.lastFrameSpentMs > MAP_STAGE_PRESSURE_SOFT_BUDGET_MS ||
        pressureSnapshot.queueDepth > MAP_STAGE_PRESSURE_MAX_QUEUE_DEPTH ||
        yieldDelta > 0
      ) {
        return 'pressured';
      }

      return 'healthy';
    };

    const labelsStageStartMs = getNowMs();
    const LABELS_STAGE_DEADLINE_MS = 2000;

    const scheduleLabelsStageAttempt = () => {
      if (!scheduler || !isStageStillActive()) {
        return;
      }
      const taskId = `${operationId}:map-stage-labels:${stageToken}:${labelAttemptOrdinal}`;
      labelAttemptOrdinal += 1;
      scheduler.schedule({
        id: taskId,
        lane: 'selection_feedback',
        operationId,
        estimatedCostMs: 1,
        run: () => {
          if (!isStageStillActive()) {
            return;
          }
          // Deadline fallback: force labels to render if pressure never settles
          if (getNowMs() - labelsStageStartMs > LABELS_STAGE_DEADLINE_MS) {
            commitStagedPhase('full', { reason: 'deadline_fallback' });
            lastLabelsGateReason = null;
            return;
          }
          if (isRunOneChromeDeferredRef.current || isRunOneHandoffActiveRef.current) {
            requireExtendedHealthyFrames = true;
            stagedPublishHealthyLabelFrameCountRef.current = 0;
            stagedPublishAwaitingPostDeferredFrameRef.current = true;
            if (lastLabelsGateReason !== 'handoff_deferred') {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'labels',
                reason: 'handoff_deferred',
                operationId,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastLabelsGateReason = 'handoff_deferred';
            }
            scheduleOnNextFrame(scheduleLabelsStageAttempt);
            return;
          }
          if (stagedPublishAwaitingPostDeferredFrameRef.current) {
            stagedPublishAwaitingPostDeferredFrameRef.current = false;
            stagedPublishHealthyLabelFrameCountRef.current = 0;
            if (lastLabelsGateReason !== 'post_deferred_cooldown') {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'labels',
                reason: 'post_deferred_cooldown',
                operationId,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastLabelsGateReason = 'post_deferred_cooldown';
            }
            scheduleOnNextFrame(scheduleLabelsStageAttempt);
            return;
          }
          if (isMapFinalizeDeferred()) {
            stagedPublishHealthyLabelFrameCountRef.current = 0;
            const finalizeGateReason = shouldDeferFinalizeForOperationLane
              ? 'operation_lane_wait_finalize'
              : 'defer_map_finalize_signal';
            if (lastLabelsGateReason !== finalizeGateReason) {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'labels',
                reason: finalizeGateReason,
                operationId,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastLabelsGateReason = finalizeGateReason;
            }
            scheduleOnNextFrame(scheduleLabelsStageAttempt);
            return;
          }
          if (isMapPinsDeferred()) {
            stagedPublishHealthyLabelFrameCountRef.current = 0;
            const pinsGateReason = shouldDeferPinsForOperationLane
              ? 'operation_lane_wait_pins'
              : 'defer_map_pins_signal';
            if (lastLabelsGateReason !== pinsGateReason) {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'labels',
                reason: pinsGateReason,
                operationId,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastLabelsGateReason = pinsGateReason;
            }
            scheduleOnNextFrame(scheduleLabelsStageAttempt);
            return;
          }
          const pressure = resolveMapStagePressure();
          if (pressure !== 'healthy') {
            stagedPublishHealthyLabelFrameCountRef.current = 0;
            const nextReason = `pressure_${pressure}`;
            if (lastLabelsGateReason !== nextReason) {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'labels',
                reason: nextReason,
                operationId,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastLabelsGateReason = nextReason;
            }
            scheduleOnNextFrame(scheduleLabelsStageAttempt);
            return;
          }
          const requiredHealthyFrames = requireExtendedHealthyFrames
            ? MAP_STAGE_LABELS_HEALTHY_FRAMES_REQUIRED_AFTER_HANDOFF
            : MAP_STAGE_LABELS_HEALTHY_FRAMES_REQUIRED;
          stagedPublishHealthyLabelFrameCountRef.current += 1;
          if (stagedPublishHealthyLabelFrameCountRef.current < requiredHealthyFrames) {
            if (lastLabelsGateReason !== 'healthy_frames_pending') {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'labels',
                reason: 'healthy_frames_pending',
                operationId,
                requiredHealthyFrames,
                observedHealthyFrames: stagedPublishHealthyLabelFrameCountRef.current,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastLabelsGateReason = 'healthy_frames_pending';
            }
            scheduleOnNextFrame(scheduleLabelsStageAttempt);
            return;
          }
          commitStagedPhase('full');
          lastLabelsGateReason = null;
        },
      });
      scheduler.startFrameLoop();
    };

    const schedulePinsStageAttempt = () => {
      if (!scheduler || !isStageStillActive()) {
        return;
      }
      const taskId = `${operationId}:map-stage-pins:${stageToken}:${stageAttemptOrdinal}`;
      stageAttemptOrdinal += 1;
      scheduler.schedule({
        id: taskId,
        lane: 'selection_feedback',
        operationId,
        estimatedCostMs: 1,
        run: () => {
          if (!isStageStillActive()) {
            return;
          }
          if (isRunOneChromeDeferredRef.current || isRunOneHandoffActiveRef.current) {
            requireExtendedHealthyFrames = true;
            if (lastPinsGateReason !== 'handoff_deferred') {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'pins',
                reason: 'handoff_deferred',
                operationId,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastPinsGateReason = 'handoff_deferred';
            }
            scheduleOnNextFrame(schedulePinsStageAttempt);
            return;
          }
          if (isMapPinsDeferred()) {
            const pinsGateReason = shouldDeferPinsForOperationLane
              ? 'operation_lane_wait_pins'
              : 'defer_map_pins_signal';
            if (lastPinsGateReason !== pinsGateReason) {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'pins',
                reason: pinsGateReason,
                operationId,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastPinsGateReason = pinsGateReason;
            }
            scheduleOnNextFrame(schedulePinsStageAttempt);
            return;
          }
          const pressure = resolveMapStagePressure();
          if (pressure === 'critical') {
            if (lastPinsGateReason !== 'pressure_critical') {
              emitMapRuntimeWriteSpan({
                label: 'map_stage_gate',
                gate: 'pins',
                reason: 'pressure_critical',
                operationId,
                nowMs: Number(getNowMs().toFixed(1)),
              });
              lastPinsGateReason = 'pressure_critical';
            }
            scheduleOnNextFrame(schedulePinsStageAttempt);
            return;
          }
          commitStagedPhase('pins', { pressure });
          lastPinsGateReason = null;
          scheduleOnNextFrame(scheduleLabelsStageAttempt);
        },
      });
      scheduler.startFrameLoop();
    };

    commitStagedPhase(startingPhase);
    if (!scheduler) {
      if (startingPhase === 'dots') {
        scheduleOnNextFrame(() => {
          if (!isStageStillActive()) {
            return;
          }
          commitStagedPhase('pins', { pressure: 'none' });
          scheduleOnNextFrame(() => {
            if (!isStageStillActive()) {
              return;
            }
            commitStagedPhase('full');
          });
        });
      } else if (startingPhase === 'pins') {
        scheduleOnNextFrame(() => {
          if (!isStageStillActive()) {
            return;
          }
          commitStagedPhase('full');
        });
      }
      return () => {
        clearNextFrameHandle();
      };
    }

    if (startingPhase === 'dots') {
      scheduleOnNextFrame(schedulePinsStageAttempt);
    } else if (startingPhase === 'pins') {
      scheduleOnNextFrame(scheduleLabelsStageAttempt);
    }
    return () => {
      clearNextFrameHandle();
      if (shouldCancelOwnedOperation) {
        scheduler.cancelLaneTasksByOperation(operationId, 'selection_feedback');
      }
      if (stagedPublishTokenRef.current === stageToken) {
        stagedPublishTokenRef.current = null;
      }
      stagedPublishAwaitingPostDeferredFrameRef.current = false;
    };
  }, [
    markerRevealCommitId,
    markersTopologyRenderKey,
    pinsTopologyKey,
    runtimeWorkSchedulerRef,
    selectionFeedbackOperationId,
    shouldUseStagedPublish,
    isMapPinsDeferred,
    isMapFinalizeDeferred,
    shouldDeferPinsForOperationLane,
    shouldDeferFinalizeForOperationLane,
    emitMapRuntimeWriteSpan,
  ]);
  const shouldRenderStagedPins = !shouldDisableMarkers;
  const transitionSortedRestaurantMarkers = shouldRenderStagedPins
    ? sortedRestaurantMarkers
    : EMPTY_SORTED_RESTAURANT_MARKERS;
  const shouldRenderLabels =
    !shouldDisableMarkers &&
    isMapStyleReady &&
    shouldRenderStagedPins &&
    !isRunOneHandoffActive &&
    (!shouldUseStagedPublish || stagedPublishPhase !== 'dots');
  const shouldRenderDots =
    !shouldDisableMarkers &&
    isMapStyleReady &&
    dotRestaurantFeatures != null &&
    dotRestaurantFeatures.features.length > 0;
  const shouldMountDotLayers = !shouldDisableMarkers && isMapStyleReady;
  const recordRuntimeAttribution = React.useCallback(
    (durationMs: number) => {
      mapQueryBudget?.recordRuntimeAttributionDurationMs('map_label_bootstrap', durationMs);
    },
    [mapQueryBudget]
  );
  const markerTopologyKey = markersTopologyRenderKey;
  const dotTopologyKey = React.useMemo(() => {
    if (!dotRestaurantFeatures?.features?.length) {
      return '0:empty:empty:0';
    }
    const dotKeys = dotRestaurantFeatures.features.map((feature) =>
      buildMarkerKey(feature as Feature<Point, RestaurantFeatureProperties>)
    );
    return buildStableKeyFingerprint(dotKeys);
  }, [buildMarkerKey, dotRestaurantFeatures]);
  const pinnedRestaurantIds = React.useMemo(() => {
    return new Set(
      transitionSortedRestaurantMarkers.map((feature) => feature.properties.restaurantId)
    );
  }, [transitionSortedRestaurantMarkers]);
  const pinnedRestaurantIdList = React.useMemo(
    () => Array.from(pinnedRestaurantIds),
    [pinnedRestaurantIds]
  );
  const pinnedDotKeys = React.useMemo(() => {
    return new Set(transitionSortedRestaurantMarkers.map((feature) => buildMarkerKey(feature)));
  }, [buildMarkerKey, transitionSortedRestaurantMarkers]);
  const visualReadySignaledRequestKeyRef = React.useRef<string | null>(null);
  const markerRevealSettledSignaledRequestKeyRef = React.useRef<string | null>(null);
  const visualReadyPendingFramesRef = React.useRef(0);
  const visualReadyAwaitingPinTransitionStartRef = React.useRef(false);
  const {
    transitionClockMs: pinTransitionClockMs,
    batchFadeProgress,
    promoteStartedAtByMarkerKey,
    pendingPromoteDelayByMarkerKey,
    immediatePromotionStartedAtByMarkerKey,
    demotionTransitions,
    demotingRestaurantIdList,
    hasPendingPromotions,
    hasStartedPromotions,
    isAwaitingInitialRevealStart,
  } = usePinTransitionController({
    sortedRestaurantMarkers: transitionSortedRestaurantMarkers,
    pinsRenderKey,
    markerRevealCommitId,
    buildMarkerKey,
    pinnedDotKeys,
    suppressTransitions: runOneMapLoadSheddingActive,
  });
  const shouldHidePinnedDots = false;
  const hiddenDotRestaurantIdList = React.useMemo(() => {
    const next = new Set<string>();
    if (shouldHidePinnedDots) {
      pinnedRestaurantIdList.forEach((restaurantId) => next.add(restaurantId));
    }
    demotingRestaurantIdList.forEach((restaurantId) => next.add(restaurantId));
    return Array.from(next);
  }, [demotingRestaurantIdList, pinnedRestaurantIdList, shouldHidePinnedDots]);
  const [optimisticSelectedRestaurantId, setOptimisticSelectedRestaurantId] = React.useState<
    string | null
  >(null);
  const effectiveSelectedRestaurantId = optimisticSelectedRestaurantId ?? selectedRestaurantId;
  React.useEffect(() => {
    setOptimisticSelectedRestaurantId(null);
  }, [selectedRestaurantId]);
  const dotLayerStyle = React.useMemo(() => {
    const scoreModeLiteral = scoreMode;
    return {
      symbolZOrder: 'source',
      // Use a font/glyph combo that reliably renders as a true circle (avoid tofu/missing-glyph boxes).
      textField: '●',
      textAnchor: 'center',
      textFont: ['Arial Unicode MS Regular', 'Open Sans Semibold'],
      textAllowOverlap: false,
      textIgnorePlacement: false,
      // Reduce collision buffer so dots can pack tighter before culling.
      textPadding: 0,
      // Keep the collision box closer to the actual glyph bounds.
      textLineHeight: 0.5,
      // Hide dots that correspond to currently-pinned restaurants. Using feature-state is
      // unreliable because Mapbox can drop source feature-state when ShapeSource data updates.
      // A property-based expression keeps dots/pins mutually exclusive deterministically.
      textOpacity:
        batchFadeProgress < 1
          ? [
              '*',
              [
                'case',
                ['in', ['get', 'restaurantId'], ['literal', hiddenDotRestaurantIdList]],
                0,
                1,
              ],
              batchFadeProgress,
            ]
          : [
              'case',
              ['in', ['get', 'restaurantId'], ['literal', hiddenDotRestaurantIdList]],
              0,
              1,
            ],
      // Keep dots a constant screen size (like pins). The symbol can still cull/collide based on
      // Mapbox placement, but it won't scale with zoom.
      textSize: DOT_TEXT_SIZE,
      textColor: [
        'case',
        ['==', ['get', 'restaurantId'], effectiveSelectedRestaurantId ?? ''],
        PRIMARY_COLOR,
        [
          'case',
          ['==', ['literal', scoreModeLiteral], 'coverage_display'],
          ['coalesce', ['get', 'pinColorLocal'], ['get', 'pinColor']],
          ['coalesce', ['get', 'pinColorGlobal'], ['get', 'pinColor']],
        ],
      ],
    } as MapboxGL.SymbolLayerStyle;
  }, [batchFadeProgress, effectiveSelectedRestaurantId, hiddenDotRestaurantIdList, scoreMode]);
  const [mapViewportSize, setMapViewportSize] = React.useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const dotPinnedKeysRef = React.useRef<Set<string>>(new Set());
  const dotPinnedStateResetKeyRef = React.useRef<string | null>(null);
  const labelStickyRefreshSeqRef = React.useRef(0);
  const labelStickyRefreshTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelStickyRefreshInFlightRef = React.useRef(false);
  const labelStickyRefreshQueuedRef = React.useRef(false);
  const isMapMovingRef = React.useRef(false);
  const mapLastMovedAtRef = React.useRef(0);
  const [labelPlacementEpoch, setLabelPlacementEpoch] = React.useState(0);
  const labelPlacementBootstrapKeyRef = React.useRef<string | null>(null);
  const labelStickyCandidateByMarkerKeyRef = React.useRef<Map<string, LabelCandidate>>(new Map());
  const labelStickyLastSeenAtByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const labelStickyMissingStreakByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const labelStickyProposedCandidateByMarkerKeyRef = React.useRef<Map<string, LabelCandidate>>(
    new Map()
  );
  const labelStickyProposedSinceAtByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const labelStickyQueryReadyRef = React.useRef(false);
  const labelStickyQueryReadyAtRef = React.useRef<number | null>(null);
  const labelStickyLastProbeAtRef = React.useRef(0);
  const labelStickyLastProbeSnapshotRef = React.useRef<{
    at: number;
    controlRendered: number;
    filterRendered: number;
    sourceFeatures: number;
    lastError: string | null;
  }>({
    at: 0,
    controlRendered: 0,
    filterRendered: 0,
    sourceFeatures: 0,
    lastError: null,
  });
  const labelStickyColdStartRecoverAttemptsRef = React.useRef(0);
  const labelStickyColdStartRecoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const labelStickyBootstrapPollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const labelStickyBootstrapPollStartedAtRef = React.useRef<number | null>(null);
  const labelStickyRuntimeRef = React.useRef<LabelStickyRuntime>({
    styleURL: '',
    labelLayerTreeEpoch: 0,
    isMapStyleReady: false,
    shouldDisableMarkers: false,
    shouldRenderLabels: false,
    viewport: { width: 0, height: 0 },
    markerCount: 0,
  });
  const [labelLayerTreeEpoch, setLabelLayerTreeEpoch] = React.useState(0);
  const [pinLayerTreeEpoch, setPinLayerTreeEpoch] = React.useState(0);
  const pinLayerRecoveryLastAttemptAtRef = React.useRef(0);
  const [labelStickyMarkersReadyAt, setLabelStickyMarkersReadyAt] = React.useState<number | null>(
    null
  );
  const labelStickyMarkersReadyKeyRef = React.useRef<string | null>(null);
  const [labelStickyEpoch, setLabelStickyEpoch] = React.useState(0);

  React.useEffect(() => {
    if (!shouldRenderLabels) {
      labelStickyQueryReadyRef.current = false;
      labelStickyQueryReadyAtRef.current = null;
      labelStickyLastProbeAtRef.current = 0;
      labelStickyColdStartRecoverAttemptsRef.current = 0;
      labelStickyBootstrapPollStartedAtRef.current = null;
      if (labelStickyBootstrapPollTimeoutRef.current) {
        clearTimeout(labelStickyBootstrapPollTimeoutRef.current);
        labelStickyBootstrapPollTimeoutRef.current = null;
      }
      labelStickyLastProbeSnapshotRef.current = {
        at: 0,
        controlRendered: 0,
        filterRendered: 0,
        sourceFeatures: 0,
        lastError: null,
      };
      if (labelStickyColdStartRecoverTimeoutRef.current) {
        clearTimeout(labelStickyColdStartRecoverTimeoutRef.current);
        labelStickyColdStartRecoverTimeoutRef.current = null;
      }
      setLabelStickyMarkersReadyAt(null);
      labelStickyMarkersReadyKeyRef.current = null;
      return;
    }

    // Style changes or MapView remounts can invalidate query readiness on iOS cold start.
    labelStickyQueryReadyRef.current = false;
    labelStickyQueryReadyAtRef.current = null;
    labelStickyLastProbeAtRef.current = 0;
    labelStickyLastProbeSnapshotRef.current = {
      at: 0,
      controlRendered: 0,
      filterRendered: 0,
      sourceFeatures: 0,
      lastError: null,
    };
    labelStickyBootstrapPollStartedAtRef.current = null;
    if (labelStickyBootstrapPollTimeoutRef.current) {
      clearTimeout(labelStickyBootstrapPollTimeoutRef.current);
      labelStickyBootstrapPollTimeoutRef.current = null;
    }
  }, [labelLayerTreeEpoch, shouldRenderLabels, styleURL]);

  React.useEffect(() => {
    // One bootstrap bump is enough to stabilize initial label placement without paying the
    // heavy cost of a second unconditional remount in the first hydration window.
    if (!ENABLE_LABEL_PLACEMENT_BOOTSTRAP) {
      labelPlacementBootstrapKeyRef.current = null;
      return;
    }
    if (!shouldRenderLabels) {
      labelPlacementBootstrapKeyRef.current = null;
      return;
    }

    const bootstrapKey = styleURL;
    if (labelPlacementBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    labelPlacementBootstrapKeyRef.current = bootstrapKey;

    // First bump: forces a re-layout on initial label render.
    const firstBumpStartedAtMs = getNowMs();
    setLabelPlacementEpoch((value) => value + 1);
    recordRuntimeAttribution(getNowMs() - firstBumpStartedAtMs);
  }, [recordRuntimeAttribution, shouldRenderLabels, styleURL]);

  React.useEffect(() => {
    if (!ENABLE_STICKY_LABEL_CANDIDATES) {
      return;
    }
    labelStickyCandidateByMarkerKeyRef.current.clear();
    labelStickyLastSeenAtByMarkerKeyRef.current.clear();
    labelStickyMissingStreakByMarkerKeyRef.current.clear();
    labelStickyProposedCandidateByMarkerKeyRef.current.clear();
    labelStickyProposedSinceAtByMarkerKeyRef.current.clear();
    setLabelStickyEpoch((value) => value + 1);
  }, [markerTopologyKey, shouldRenderLabels, styleURL]);

  const labelFeatureBuildDurationMsRef = React.useRef<number | null>(null);
  const previousLabelFeatureByKeyRef = React.useRef(
    new Map<string, Feature<Point, RestaurantFeatureProperties>>()
  );
  const restaurantLabelFeaturesWithIds = React.useMemo(() => {
    const buildStartedAtMs = getNowMs();
    if (!restaurantFeatures.features.length) {
      previousLabelFeatureByKeyRef.current.clear();
      labelFeatureBuildDurationMsRef.current = getNowMs() - buildStartedAtMs;
      return restaurantFeatures;
    }

    const hasActiveTransitions =
      promoteStartedAtByMarkerKey.size > 0 ||
      pendingPromoteDelayByMarkerKey.size > 0 ||
      immediatePromotionStartedAtByMarkerKey.size > 0;
    const transitionNowMs = pinTransitionClockMs > 0 ? pinTransitionClockMs : getNowMs();
    let didChange = false;
    const prevCache = previousLabelFeatureByKeyRef.current;
    const nextCache = new Map<string, Feature<Point, RestaurantFeatureProperties>>();

    const nextFeatures = restaurantFeatures.features.map((feature, index) => {
      const markerKey = buildMarkerKey(feature);
      const labelOrder = index + 1;

      // Fast path: no active transitions — only stamp identity
      if (!hasActiveTransitions) {
        const cached = prevCache.get(markerKey);
        if (
          cached &&
          cached.id === markerKey &&
          cached.properties.labelOrder === labelOrder &&
          cached.properties.pinTransitionActive == null &&
          cached.properties.restaurantId === feature.properties.restaurantId &&
          cached.properties.rank === feature.properties.rank
        ) {
          nextCache.set(markerKey, cached);
          return cached;
        }
        if (
          feature.id === markerKey &&
          feature.properties.labelOrder === labelOrder &&
          feature.properties.pinTransitionActive == null
        ) {
          nextCache.set(markerKey, feature);
          return feature;
        }
        didChange = true;
        const stamped = {
          ...feature,
          id: markerKey,
          properties: { ...feature.properties, labelOrder },
        };
        nextCache.set(markerKey, stamped);
        return stamped;
      }

      // Slow path: check transition state for this feature
      const isFeatureTransitioning =
        pendingPromoteDelayByMarkerKey.has(markerKey) ||
        immediatePromotionStartedAtByMarkerKey.has(markerKey) ||
        promoteStartedAtByMarkerKey.has(markerKey);

      if (!isFeatureTransitioning) {
        // Steady feature — reuse cached if identity matches
        const cached = prevCache.get(markerKey);
        if (
          cached &&
          cached.id === markerKey &&
          cached.properties.labelOrder === labelOrder &&
          cached.properties.pinTransitionActive == null &&
          cached.properties.restaurantId === feature.properties.restaurantId &&
          cached.properties.rank === feature.properties.rank
        ) {
          nextCache.set(markerKey, cached);
          return cached;
        }
        const matchesIdentity =
          feature.id === markerKey && feature.properties.labelOrder === labelOrder;
        if (matchesIdentity && feature.properties.pinTransitionActive == null) {
          nextCache.set(markerKey, feature);
          return feature;
        }
        didChange = true;
        const stamped = {
          ...feature,
          id: markerKey,
          properties: { ...feature.properties, labelOrder },
        };
        nextCache.set(markerKey, stamped);
        return stamped;
      }

      // Transitioning feature — full computation
      const pendingPromoteDelayMs = pendingPromoteDelayByMarkerKey.get(markerKey);
      const immediatePromoteStartedAtMs = immediatePromotionStartedAtByMarkerKey.get(markerKey);
      const transitionVisual =
        typeof pendingPromoteDelayMs === 'number'
          ? START_PIN_TRANSITION_VISUAL
          : typeof immediatePromoteStartedAtMs === 'number'
          ? getPinTransitionVisual(immediatePromoteStartedAtMs, transitionNowMs, 'promote')
          : getPinTransitionVisual(
              promoteStartedAtByMarkerKey.get(markerKey),
              transitionNowMs,
              'promote'
            );
      const hasTransitionProps =
        feature.properties.pinTransitionActive != null ||
        feature.properties.pinTransitionScale != null ||
        feature.properties.pinTransitionOpacity != null ||
        feature.properties.pinRankOpacity != null ||
        feature.properties.pinLabelOpacity != null;

      const matchesIdentity =
        feature.id === markerKey && feature.properties.labelOrder === labelOrder;
      const matchesTransition =
        feature.properties.pinTransitionActive === transitionVisual.active &&
        feature.properties.pinTransitionScale === transitionVisual.scale &&
        feature.properties.pinTransitionOpacity === transitionVisual.opacity &&
        feature.properties.pinRankOpacity === transitionVisual.rankOpacity &&
        feature.properties.pinLabelOpacity === transitionVisual.labelOpacity;

      if (
        matchesIdentity &&
        ((transitionVisual.active === 0 && !hasTransitionProps) || matchesTransition)
      ) {
        nextCache.set(markerKey, feature);
        return feature;
      }
      didChange = true;
      const built = {
        ...feature,
        id: markerKey,
        properties: {
          ...feature.properties,
          labelOrder,
          pinTransitionActive: transitionVisual.active === 0 ? undefined : transitionVisual.active,
          pinTransitionScale: transitionVisual.active === 0 ? undefined : transitionVisual.scale,
          pinTransitionOpacity:
            transitionVisual.active === 0 ? undefined : transitionVisual.opacity,
          pinRankOpacity: transitionVisual.active === 0 ? undefined : transitionVisual.rankOpacity,
          pinLabelOpacity:
            transitionVisual.active === 0 ? undefined : transitionVisual.labelOpacity,
        },
      };
      nextCache.set(markerKey, built);
      return built;
    });

    previousLabelFeatureByKeyRef.current = nextCache;

    if (!didChange) {
      labelFeatureBuildDurationMsRef.current = getNowMs() - buildStartedAtMs;
      return restaurantFeatures;
    }

    const nextCollection = { ...restaurantFeatures, features: nextFeatures };
    labelFeatureBuildDurationMsRef.current = getNowMs() - buildStartedAtMs;
    return nextCollection;
  }, [
    buildMarkerKey,
    immediatePromotionStartedAtByMarkerKey,
    pendingPromoteDelayByMarkerKey,
    pinTransitionClockMs,
    promoteStartedAtByMarkerKey,
    restaurantFeatures,
  ]);
  React.useEffect(() => {
    const durationMs = labelFeatureBuildDurationMsRef.current;
    if (durationMs == null) {
      return;
    }
    recordRuntimeAttribution(durationMs);
    labelFeatureBuildDurationMsRef.current = null;
  }, [recordRuntimeAttribution, restaurantLabelFeaturesWithIds]);
  const demotionTransitionFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const transitionNowMs = pinTransitionClockMs > 0 ? pinTransitionClockMs : getNowMs();
    const features: Array<Feature<Point, RestaurantFeatureProperties>> = [];

    demotionTransitions.forEach(({ markerKey, startedAtMs, feature }) => {
      const transitionVisual = getPinTransitionVisual(startedAtMs, transitionNowMs, 'demote');
      if (transitionVisual.active === 0) {
        return;
      }
      features.push({
        ...feature,
        id: markerKey,
        properties: {
          ...feature.properties,
          pinTransitionActive: transitionVisual.active,
          pinTransitionScale: transitionVisual.scale,
          pinTransitionOpacity: transitionVisual.opacity,
          pinRankOpacity: transitionVisual.rankOpacity,
          pinLabelOpacity: transitionVisual.labelOpacity,
        },
      });
    });

    const nextFeatures = {
      type: 'FeatureCollection' as const,
      features,
    };
    return nextFeatures;
  }, [demotionTransitions, pinTransitionClockMs]);
  const stylePinFeaturesWithTransitions = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    if (!demotionTransitionFeatures.features.length) {
      return restaurantLabelFeaturesWithIds;
    }
    return {
      ...restaurantLabelFeaturesWithIds,
      features: [
        ...restaurantLabelFeaturesWithIds.features,
        ...demotionTransitionFeatures.features,
      ],
    };
  }, [demotionTransitionFeatures, restaurantLabelFeaturesWithIds]);

  // ---------------------------------------------------------------------------
  // Bridge-serialization-optimized sources (Phase 8)
  // Strip unnecessary properties to reduce native bridge payload.
  // ---------------------------------------------------------------------------

  // Collision source — geometry only, no transition-visual properties needed.
  // Use identity tracking to skip rebuilds when only transition visual props change.
  const prevCollisionIdentityRef = React.useRef<string>('');
  const prevCollisionFeaturesRef = React.useRef<FeatureCollection<Point, RestaurantFeatureProperties> | null>(null);
  const collisionSourceFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const features = stylePinFeaturesWithTransitions.features;
    if (!features.length) {
      prevCollisionIdentityRef.current = '';
      prevCollisionFeaturesRef.current = stylePinFeaturesWithTransitions;
      return stylePinFeaturesWithTransitions;
    }
    // Identity = feature IDs. Only rebuild when the set of features changes,
    // not when transition visual properties (scale, opacity) change mid-tick.
    let identity = '';
    for (let i = 0; i < features.length; i++) {
      identity += (i > 0 ? ',' : '') + (features[i].id ?? '');
    }
    if (identity === prevCollisionIdentityRef.current && prevCollisionFeaturesRef.current) {
      return prevCollisionFeaturesRef.current;
    }
    prevCollisionIdentityRef.current = identity;
    const built = {
      type: 'FeatureCollection' as const,
      features: features.map((feature) => ({
        type: 'Feature' as const,
        id: feature.id,
        geometry: feature.geometry,
        properties: { restaurantId: feature.properties.restaurantId } as RestaurantFeatureProperties,
      })),
    };
    prevCollisionFeaturesRef.current = built;
    return built;
  }, [stylePinFeaturesWithTransitions]);

  // Pin interaction source — minimal properties for press handling.
  // Only rebuild when feature set or pinTransitionActive values change.
  const prevInteractionIdentityRef = React.useRef<string>('');
  const prevInteractionFeaturesRef = React.useRef<FeatureCollection<Point, RestaurantFeatureProperties> | null>(null);
  const pinInteractionFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const features = stylePinFeaturesWithTransitions.features;
    if (!features.length) {
      prevInteractionIdentityRef.current = '';
      prevInteractionFeaturesRef.current = stylePinFeaturesWithTransitions;
      return stylePinFeaturesWithTransitions;
    }
    // Identity includes pinTransitionActive since interaction layers filter on it.
    let identity = '';
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      identity += (i > 0 ? ',' : '') + (f.id ?? '') + ':' + (f.properties.pinTransitionActive ?? 0);
    }
    if (identity === prevInteractionIdentityRef.current && prevInteractionFeaturesRef.current) {
      return prevInteractionFeaturesRef.current;
    }
    prevInteractionIdentityRef.current = identity;
    const built = {
      type: 'FeatureCollection' as const,
      features: features.map((feature) => ({
        type: 'Feature' as const,
        id: feature.id,
        geometry: feature.geometry,
        properties: {
          restaurantId: feature.properties.restaurantId,
          lodZ: feature.properties.lodZ,
          pinTransitionActive: feature.properties.pinTransitionActive,
        } as RestaurantFeatureProperties,
      })),
    };
    prevInteractionFeaturesRef.current = built;
    return built;
  }, [stylePinFeaturesWithTransitions]);

  // Dot interaction source — minimal properties for press handling
  const dotInteractionFeatures = React.useMemo<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(() => {
    if (!dotRestaurantFeatures || !dotRestaurantFeatures.features.length) {
      return dotRestaurantFeatures ?? null;
    }
    return {
      type: 'FeatureCollection',
      features: dotRestaurantFeatures.features.map((feature) => ({
        type: 'Feature' as const,
        id: feature.id,
        geometry: feature.geometry,
        properties: {
          restaurantId: feature.properties.restaurantId,
        } as RestaurantFeatureProperties,
      })),
    };
  }, [dotRestaurantFeatures]);

  // Keep a single authoritative snapshot for async/timer callbacks.
  // This prevents stale-closure behavior where schedule logs show new props but refresh runs with old ones.
  labelStickyRuntimeRef.current = {
    styleURL,
    labelLayerTreeEpoch,
    isMapStyleReady,
    shouldDisableMarkers,
    shouldRenderLabels,
    viewport: { width: mapViewportSize.width, height: mapViewportSize.height },
    markerCount: stylePinFeaturesWithTransitions.features.length,
  };

  React.useEffect(() => {
    if (!ENABLE_STICKY_LABEL_CANDIDATES) {
      return;
    }
    if (!shouldRenderLabels) {
      return;
    }

    const latchKey = styleURL;
    if (labelStickyMarkersReadyKeyRef.current !== latchKey) {
      labelStickyMarkersReadyKeyRef.current = latchKey;
      setLabelStickyMarkersReadyAt(null);
      labelStickyColdStartRecoverAttemptsRef.current = 0;
    }

    if (labelStickyMarkersReadyAt) {
      return;
    }
    if (mapViewportSize.width <= 0 || mapViewportSize.height <= 0) {
      return;
    }
    if (stylePinFeaturesWithTransitions.features.length > 0) {
      setLabelStickyMarkersReadyAt(Date.now());
    }
  }, [
    labelStickyMarkersReadyAt,
    mapViewportSize.height,
    mapViewportSize.width,
    stylePinFeaturesWithTransitions.features.length,
    shouldRenderLabels,
    styleURL,
  ]);

  React.useEffect(() => {
    if (!ENABLE_STICKY_LABEL_CANDIDATES) {
      return;
    }
    if (!shouldRenderLabels) {
      return;
    }
    if (!labelStickyMarkersReadyAt) {
      return;
    }
    if (labelStickyQueryReadyRef.current) {
      return;
    }
    if (labelStickyColdStartRecoverTimeoutRef.current) {
      return;
    }

    labelStickyColdStartRecoverTimeoutRef.current = setTimeout(() => {
      labelStickyColdStartRecoverTimeoutRef.current = null;
      if (labelStickyQueryReadyRef.current) {
        return;
      }
      if (
        labelStickyColdStartRecoverAttemptsRef.current >=
        LABEL_STICKY_COLD_START_RECOVER_MAX_ATTEMPTS
      ) {
        return;
      }

      const snapshot = labelStickyLastProbeSnapshotRef.current;
      const snapshotAgeMs = snapshot.at ? Date.now() - snapshot.at : null;
      const shouldRecover =
        snapshot.sourceFeatures > 0 &&
        snapshot.controlRendered === 0 &&
        snapshot.filterRendered === 0 &&
        snapshotAgeMs != null &&
        snapshotAgeMs < 1500;

      if (!shouldRecover) {
        return;
      }

      labelStickyColdStartRecoverAttemptsRef.current += 1;
      setLabelLayerTreeEpoch((value) => value + 1);
      labelStickyCandidateByMarkerKeyRef.current.clear();
      labelStickyLastSeenAtByMarkerKeyRef.current.clear();
      setLabelStickyEpoch((value) => value + 1);
      setLabelPlacementEpoch((value) => value + 1);
    }, LABEL_STICKY_COLD_START_RECOVER_AFTER_MS);

    return () => {
      if (labelStickyColdStartRecoverTimeoutRef.current) {
        clearTimeout(labelStickyColdStartRecoverTimeoutRef.current);
        labelStickyColdStartRecoverTimeoutRef.current = null;
      }
    };
  }, [labelStickyMarkersReadyAt, shouldRenderLabels, styleURL]);

  // Marker identity fingerprint — only changes when the set of marker keys changes,
  // not when transition properties change. Used to gate label candidate rebuilds.
  const labelMarkerIdentityKeyRef = React.useRef('');
  const previousLabelCandidateCollectionRef = React.useRef<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(null);

  const restaurantLabelCandidateFeaturesWithIds = React.useMemo(() => {
    if (!stylePinFeaturesWithTransitions.features.length) {
      labelMarkerIdentityKeyRef.current = '';
      previousLabelCandidateCollectionRef.current = null;
      return stylePinFeaturesWithTransitions as FeatureCollection<
        Point,
        RestaurantFeatureProperties
      >;
    }

    // Compute marker identity fingerprint (keys + order only)
    let identityKey = '';
    for (const feature of stylePinFeaturesWithTransitions.features) {
      const markerKey = feature.id;
      if (typeof markerKey === 'string' && markerKey.length > 0) {
        identityKey += markerKey + ',';
      }
    }

    // If marker identity hasn't changed and we have a cached result,
    // only rebuild if sticky epoch changed (label position lock changed)
    if (
      identityKey === labelMarkerIdentityKeyRef.current &&
      previousLabelCandidateCollectionRef.current != null
    ) {
      // Same markers, same sticky epoch — reuse cached label candidates
      // but update transition properties on the source features
      const prevFeatures = previousLabelCandidateCollectionRef.current.features;
      const srcByKey = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
      for (const feature of stylePinFeaturesWithTransitions.features) {
        const markerKey = feature.id;
        if (typeof markerKey === 'string') {
          srcByKey.set(markerKey, feature);
        }
      }

      let hasTransitionChange = false;
      const updatedFeatures = prevFeatures.map((labelFeature) => {
        const srcMarkerKey = labelFeature.properties.markerKey;
        if (!srcMarkerKey) {
          return labelFeature;
        }
        const srcFeature = srcByKey.get(srcMarkerKey);
        if (!srcFeature) {
          return labelFeature;
        }
        // Check if transition properties actually changed
        if (
          labelFeature.properties.pinTransitionActive === srcFeature.properties.pinTransitionActive &&
          labelFeature.properties.pinTransitionScale === srcFeature.properties.pinTransitionScale &&
          labelFeature.properties.pinTransitionOpacity === srcFeature.properties.pinTransitionOpacity &&
          labelFeature.properties.pinRankOpacity === srcFeature.properties.pinRankOpacity &&
          labelFeature.properties.pinLabelOpacity === srcFeature.properties.pinLabelOpacity
        ) {
          return labelFeature;
        }
        hasTransitionChange = true;
        return {
          ...labelFeature,
          properties: {
            ...labelFeature.properties,
            pinTransitionActive: srcFeature.properties.pinTransitionActive,
            pinTransitionScale: srcFeature.properties.pinTransitionScale,
            pinTransitionOpacity: srcFeature.properties.pinTransitionOpacity,
            pinRankOpacity: srcFeature.properties.pinRankOpacity,
            pinLabelOpacity: srcFeature.properties.pinLabelOpacity,
          },
        };
      });

      if (!hasTransitionChange) {
        return previousLabelCandidateCollectionRef.current;
      }
      const updated = { ...stylePinFeaturesWithTransitions, features: updatedFeatures };
      previousLabelCandidateCollectionRef.current = updated;
      return updated;
    }

    // Full rebuild — marker set changed or first run
    labelMarkerIdentityKeyRef.current = identityKey;
    const nextFeatures: Array<Feature<Point, RestaurantFeatureProperties>> = [];
    for (const feature of stylePinFeaturesWithTransitions.features) {
      const markerKey = feature.id;
      if (typeof markerKey !== 'string' || markerKey.length === 0) {
        continue;
      }
      const lockedCandidate = ENABLE_STICKY_LABEL_CANDIDATES
        ? labelStickyCandidateByMarkerKeyRef.current.get(markerKey)
        : null;
      const candidates = lockedCandidate ? [lockedCandidate] : LABEL_CANDIDATES;
      for (const candidate of candidates) {
        nextFeatures.push({
          ...feature,
          id: buildLabelCandidateFeatureId(markerKey, candidate),
          properties: { ...feature.properties, labelCandidate: candidate, markerKey },
        });
      }
    }

    const collection = { ...stylePinFeaturesWithTransitions, features: nextFeatures };
    previousLabelCandidateCollectionRef.current = collection;
    return collection;
  }, [labelStickyEpoch, stylePinFeaturesWithTransitions]);

  const restaurantLabelStyleWithStableOrder = React.useMemo(() => {
    if (!STABILIZE_LABEL_ORDER) {
      return restaurantLabelStyle;
    }

    return {
      ...restaurantLabelStyle,
      symbolZOrder: 'source',
      // Higher sort keys are drawn/placed on top (higher priority).
      // Use a stable, explicit ordering key first so ties (e.g. same rank across multiple
      // locations) don't bounce due to placement pass ordering differences.
      symbolSortKey: [
        '-',
        100000,
        ['coalesce', ['get', 'labelOrder'], ['coalesce', ['get', 'rank'], 9999]],
      ],
    } as MapboxGL.SymbolLayerStyle;
  }, [restaurantLabelStyle]);

  const labelTextSize = React.useMemo(() => {
    const candidate = restaurantLabelStyleWithStableOrder.textSize as unknown;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
    return LABEL_TEXT_SIZE;
  }, [restaurantLabelStyleWithStableOrder.textSize]);

  const labelPinTipToFillCenterPx = React.useMemo(() => {
    // Feature coordinate is anchored at the pin tip (bottom of wrapper).
    // We want candidate label placements centered on the pin fill centerline instead.
    return PIN_MARKER_RENDER_SIZE - PIN_FILL_CENTER_Y;
  }, []);

  const labelUpShiftEm = React.useMemo(
    () => labelPinTipToFillCenterPx / labelTextSize,
    [labelPinTipToFillCenterPx, labelTextSize]
  );

  const labelRadialXEm = React.useMemo(() => {
    const baselineRadialPx = LABEL_RADIAL_OFFSET_EM * labelTextSize;
    const radialPx = Math.max(baselineRadialPx, LABEL_MIN_HORIZONTAL_GAP_PX);
    return radialPx / labelTextSize;
  }, [labelPinTipToFillCenterPx, labelTextSize]);

  const labelRadialYEm = React.useMemo(() => {
    const baselineRadialPx = LABEL_RADIAL_OFFSET_EM * labelTextSize;
    const radialPx = Math.max(
      baselineRadialPx,
      labelPinTipToFillCenterPx + LABEL_MIN_BOTTOM_GAP_PX
    );
    return radialPx / labelTextSize;
  }, [labelPinTipToFillCenterPx, labelTextSize]);

  const labelRadialTopEm = React.useMemo(() => {
    const baselineRadialPx = LABEL_RADIAL_OFFSET_EM * labelTextSize;
    // For the top candidate, the total upward shift is `labelUpShiftPx + labelRadialTopPx`.
    // Keep the text comfortably above the pin base silhouette, but don't over-push it (we want
    // top labels closer than bottom/left/right when possible).
    const minRadialPx = Math.max(
      0,
      PIN_MARKER_RENDER_SIZE + LABEL_MIN_TOP_GAP_PX - labelPinTipToFillCenterPx
    );
    const radialPx = Math.max(baselineRadialPx, minRadialPx);
    return radialPx / labelTextSize;
  }, [labelPinTipToFillCenterPx, labelTextSize]);

  const labelCandidateStyles = React.useMemo(() => {
    const baseTextOpacity = restaurantLabelStyleWithStableOrder.textOpacity ?? 1;
    const base: MapboxGL.SymbolLayerStyle = {
      ...restaurantLabelStyleWithStableOrder,
      textOpacity:
        batchFadeProgress < 1
          ? ['*', baseTextOpacity, PIN_LABEL_OPACITY_EXPRESSION, batchFadeProgress]
          : ['*', baseTextOpacity, PIN_LABEL_OPACITY_EXPRESSION],
      // Tiny "mutex" icon at the feature point: prevents multiple candidate labels for the same
      // restaurant from being placed simultaneously, without materially affecting other symbols.
      iconImage: STYLE_PIN_OUTLINE_IMAGE_ID,
      iconSize: LABEL_MUTEX_ICON_SIZE,
      iconAnchor: 'bottom',
      ...(LABEL_MUTEX_POINT === 'above-pin'
        ? {
            iconOffset: [0, 0],
            iconTranslate: [0, LABEL_MUTEX_TRANSLATE_Y_PX] as [number, number],
            iconTranslateAnchor: 'viewport' as const,
          }
        : { iconOffset: [0, LABEL_MUTEX_ICON_OFFSET_IMAGE_PX] }),
      iconAllowOverlap: false,
      iconIgnorePlacement: false,
      iconOpacity: 0.001,
      iconPadding: 0,
      textAllowOverlap: false,
      textIgnorePlacement: false,
    };

    return {
      bottom: {
        ...base,
        textAnchor: 'top',
        textOffset: [0, labelRadialYEm - labelUpShiftEm],
      },
      right: {
        ...base,
        textAnchor: 'left',
        textOffset: [labelRadialXEm, -labelUpShiftEm],
      },
      top: {
        ...base,
        textAnchor: 'bottom',
        textOffset: [0, -(labelRadialTopEm + labelUpShiftEm)],
      },
      left: {
        ...base,
        textAnchor: 'right',
        textOffset: [-labelRadialXEm, -labelUpShiftEm],
      },
    } satisfies Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  }, [
    batchFadeProgress,
    labelRadialTopEm,
    labelRadialXEm,
    labelRadialYEm,
    labelUpShiftEm,
    restaurantLabelStyleWithStableOrder,
  ]);

  const restaurantLabelPinCollisionLayerId = 'restaurant-labels-pin-collision';
  const restaurantLabelPinCollisionLayerIdSideLeft = 'restaurant-labels-pin-collision-side-left';
  const restaurantLabelPinCollisionLayerIdSideRight = 'restaurant-labels-pin-collision-side-right';
  const restaurantLabelPinCollisionLayerKey = `${restaurantLabelPinCollisionLayerId}-${labelPlacementEpoch}-${PIN_COLLISION_OBSTACLE_GEOMETRY}`;
  const restaurantLabelPinCollisionLayerKeySideLeft = `${restaurantLabelPinCollisionLayerIdSideLeft}-${labelPlacementEpoch}-${PIN_COLLISION_OBSTACLE_GEOMETRY}`;
  const restaurantLabelPinCollisionLayerKeySideRight = `${restaurantLabelPinCollisionLayerIdSideRight}-${labelPlacementEpoch}-${PIN_COLLISION_OBSTACLE_GEOMETRY}`;
  const restaurantLabelPinCollisionStyles = React.useMemo(() => {
    if (PIN_COLLISION_OBSTACLE_GEOMETRY === 'fill') {
      return {
        center: LABEL_PIN_COLLISION_STYLE_FILL,
        left: LABEL_PIN_COLLISION_STYLE_FILL_SIDE_LEFT,
        right: LABEL_PIN_COLLISION_STYLE_FILL_SIDE_RIGHT,
      };
    }
    return {
      center: LABEL_PIN_COLLISION_STYLE,
      left: LABEL_PIN_COLLISION_STYLE_SIDE_LEFT,
      right: LABEL_PIN_COLLISION_STYLE_SIDE_RIGHT,
    };
  }, []);

  const pinFillColorExpression = React.useMemo(() => {
    const scoreModeLiteral = scoreMode;
    return [
      'case',
      ['==', ['get', 'restaurantId'], effectiveSelectedRestaurantId ?? ''],
      PRIMARY_COLOR,
      [
        'case',
        ['==', ['literal', scoreModeLiteral], 'coverage_display'],
        ['coalesce', ['get', 'pinColorLocal'], ['get', 'pinColor']],
        ['coalesce', ['get', 'pinColorGlobal'], ['get', 'pinColor']],
      ],
    ] as const;
  }, [effectiveSelectedRestaurantId, scoreMode]);

  const stylePinsShadowSteadyStyle = React.useMemo(
    () =>
      withIconOpacity(
        STYLE_PINS_SHADOW_STYLE,
        batchFadeProgress < 1
          ? ['*', STYLE_PINS_SHADOW_OPACITY, PIN_STEADY_OPACITY_EXPRESSION, batchFadeProgress]
          : ['*', STYLE_PINS_SHADOW_OPACITY, PIN_STEADY_OPACITY_EXPRESSION]
      ),
    [batchFadeProgress]
  );

  const stylePinsShadowTransitionStyle = React.useMemo(
    () =>
      withScaledIconTransition({
        baseStyle: STYLE_PINS_SHADOW_STYLE,
        baseIconSize: STYLE_PINS_SHADOW_ICON_SIZE,
        iconOpacity:
          batchFadeProgress < 1
            ? ['*', STYLE_PINS_SHADOW_OPACITY, PIN_TRANSITION_OPACITY_EXPRESSION, batchFadeProgress]
            : ['*', STYLE_PINS_SHADOW_OPACITY, PIN_TRANSITION_OPACITY_EXPRESSION],
      }),
    [batchFadeProgress]
  );

  const stylePinsOutlineSteadyStyle = React.useMemo(
    () =>
      withTextOpacity({
        baseStyle: STYLE_PINS_OUTLINE_GLYPH_STYLE,
        textOpacity:
          batchFadeProgress < 1
            ? ['*', PIN_STEADY_OPACITY_EXPRESSION, batchFadeProgress]
            : PIN_STEADY_OPACITY_EXPRESSION,
      }),
    [batchFadeProgress]
  );

  const stylePinsFillSteadyStyle = React.useMemo(
    () =>
      withTextOpacity({
        baseStyle: STYLE_PINS_FILL_GLYPH_STYLE,
        textColor: pinFillColorExpression,
        textOpacity:
          batchFadeProgress < 1
            ? ['*', PIN_STEADY_OPACITY_EXPRESSION, batchFadeProgress]
            : PIN_STEADY_OPACITY_EXPRESSION,
      }),
    [batchFadeProgress, pinFillColorExpression]
  );

  const stylePinsTransitionBaseStyle = React.useMemo(
    () =>
      withScaledIconTransition({
        baseStyle: STYLE_PINS_OUTLINE_STYLE,
        baseIconSize: STYLE_PINS_OUTLINE_ICON_SIZE,
        iconOpacity:
          batchFadeProgress < 1
            ? ['*', PIN_TRANSITION_OPACITY_EXPRESSION, batchFadeProgress]
            : PIN_TRANSITION_OPACITY_EXPRESSION,
      }),
    [batchFadeProgress]
  );

  const stylePinsTransitionFillStyle = React.useMemo(
    () =>
      withScaledIconTransition({
        baseStyle: STYLE_PINS_FILL_STYLE,
        baseIconSize: STYLE_PINS_FILL_ICON_SIZE,
        iconColor: pinFillColorExpression,
        iconOpacity:
          batchFadeProgress < 1
            ? ['*', PIN_TRANSITION_OPACITY_EXPRESSION, batchFadeProgress]
            : PIN_TRANSITION_OPACITY_EXPRESSION,
      }),
    [batchFadeProgress, pinFillColorExpression]
  );

  const stylePinsRankStyle = React.useMemo(
    () =>
      withTextOpacity({
        baseStyle: STYLE_PINS_RANK_STYLE,
        textOpacity:
          batchFadeProgress < 1
            ? ['*', PIN_RANK_OPACITY_EXPRESSION, batchFadeProgress]
            : PIN_RANK_OPACITY_EXPRESSION,
      }),
    [batchFadeProgress]
  );

  const stylePinLayerStack = React.useMemo(() => {
    // Deterministic pin stacking while moving:
    // - We keep a fixed number of "z slots" as separate layer stacks.
    // - Each pinned feature is assigned a `lodZ` slot (0..39) at the call site.
    // - Because layer IDs do not come/go as the pinned set changes, Mapbox can't "promote"
    //   newly-added pins above older ones just because their layers were inserted later.
    return Array.from({ length: STYLE_PIN_STACK_SLOTS }, (_, slotIndex) => {
      const lodSlotFilter = ['==', ['coalesce', ['get', 'lodZ'], -1], slotIndex] as const;
      const steadyFilter = [
        'all',
        lodSlotFilter,
        ['==', PIN_TRANSITION_ACTIVE_EXPRESSION, 0],
      ] as const;
      const transitionFilter = [
        'all',
        lodSlotFilter,
        ['==', PIN_TRANSITION_ACTIVE_EXPRESSION, 1],
      ] as const;
      return [
        <MapboxGL.SymbolLayer
          key={`shadow-slot-${slotIndex}`}
          id={`restaurant-style-pins-shadow-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsShadowSteadyStyle}
          filter={steadyFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`shadow-transition-slot-${slotIndex}`}
          id={`restaurant-style-pins-shadow-transition-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsShadowTransitionStyle}
          filter={transitionFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`base-slot-${slotIndex}`}
          id={`restaurant-style-pins-base-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsOutlineSteadyStyle}
          filter={steadyFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`fill-slot-${slotIndex}`}
          id={`restaurant-style-pins-fill-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsFillSteadyStyle}
          filter={steadyFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`base-transition-slot-${slotIndex}`}
          id={`restaurant-style-pins-base-transition-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsTransitionBaseStyle}
          filter={transitionFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`fill-transition-slot-${slotIndex}`}
          id={`restaurant-style-pins-fill-transition-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsTransitionFillStyle}
          filter={transitionFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`rank-slot-${slotIndex}`}
          id={`restaurant-style-pins-rank-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsRankStyle}
          filter={lodSlotFilter}
        />,
      ];
    }).flat();
  }, [
    stylePinsFillSteadyStyle,
    stylePinsOutlineSteadyStyle,
    stylePinsRankStyle,
    stylePinsShadowSteadyStyle,
    stylePinsShadowTransitionStyle,
    stylePinsTransitionBaseStyle,
    stylePinsTransitionFillStyle,
  ]);

  const pinInteractionLayerStack = React.useMemo(
    () =>
      Array.from({ length: STYLE_PIN_STACK_SLOTS }, (_, slotIndex) => {
        const lodSlotFilter = ['==', ['coalesce', ['get', 'lodZ'], -1], slotIndex] as const;
        const steadyFilter = [
          'all',
          lodSlotFilter,
          ['==', PIN_TRANSITION_ACTIVE_EXPRESSION, 0],
        ] as const;
        return (
          <MapboxGL.CircleLayer
            key={`pin-interaction-slot-${slotIndex}`}
            id={`restaurant-pin-interaction-slot-${slotIndex}`}
            slot="top"
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={PIN_INTERACTION_LAYER_STYLE}
            filter={steadyFilter}
          />
        );
      }),
    []
  );

  const labelInteractionStyles = React.useMemo(() => {
    const toInteractionStyle = (style: MapboxGL.SymbolLayerStyle): MapboxGL.SymbolLayerStyle =>
      ({
        ...style,
        // Interaction layers should never influence placement. We separately filter interaction
        // features to IDs that are currently rendered by the visual label layers.
        iconSize: 0,
        iconOpacity: INTERACTION_LAYER_HIDDEN_OPACITY,
        iconAllowOverlap: true,
        iconIgnorePlacement: true,
        iconPadding: 0,
        textOpacity: INTERACTION_LAYER_HIDDEN_OPACITY,
        textAllowOverlap: true,
        textIgnorePlacement: true,
        textPadding: 0,
      } as MapboxGL.SymbolLayerStyle);

    return {
      bottom: toInteractionStyle(labelCandidateStyles.bottom),
      right: toInteractionStyle(labelCandidateStyles.right),
      top: toInteractionStyle(labelCandidateStyles.top),
      left: toInteractionStyle(labelCandidateStyles.left),
    } satisfies Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  }, [labelCandidateStyles]);

  const labelInteractionFilters = React.useMemo(
    () =>
      ({
        bottom: ['==', ['get', 'labelCandidate'], 'bottom'] as Expression,
        right: ['==', ['get', 'labelCandidate'], 'right'] as Expression,
        top: ['==', ['get', 'labelCandidate'], 'top'] as Expression,
        left: ['==', ['get', 'labelCandidate'], 'left'] as Expression,
      } satisfies Record<LabelCandidate, Expression>),
    []
  );

  const dotInteractionFilter = React.useMemo(
    () =>
      [
        'all',
        ['!', ['in', ['get', 'restaurantId'], ['literal', hiddenDotRestaurantIdList]]],
      ] as Expression,
    [hiddenDotRestaurantIdList]
  );

  const isTapIntentionalForLabelFeature = React.useCallback(
    ({
      mapInstance,
      tapPoint,
      feature,
    }: {
      mapInstance: MapboxMapRef | null;
      tapPoint: { x: number; y: number } | null;
      feature: unknown;
    }): Promise<boolean> => {
      if (!tapPoint || !mapInstance?.getPointInView) {
        return Promise.resolve(true);
      }
      const coordinate = getCoordinateFromPressFeature(feature);
      if (!coordinate) {
        return Promise.resolve(true);
      }
      const candidateInfo = getLabelCandidateInfoFromRenderedFeature(feature);
      const candidate = candidateInfo?.candidate;
      if (!candidate) {
        return Promise.resolve(true);
      }
      const labelText = getLabelTextFromPressFeature(feature);
      if (!labelText) {
        return Promise.resolve(true);
      }

      const lines = labelText.split('\n');
      const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
      const estimatedWidth = clampNumber(
        longestLineLength * labelTextSize * LABEL_TAP_CHAR_WIDTH_FACTOR + 10,
        LABEL_TAP_MIN_WIDTH_PX,
        LABEL_TAP_MAX_WIDTH_PX
      );
      const estimatedHeight =
        Math.max(1, lines.length) * labelTextSize * LABEL_TAP_LINE_HEIGHT_FACTOR + 4;

      let offsetXPx = 0;
      let offsetYPx = 0;
      if (candidate === 'bottom') {
        offsetYPx = (labelRadialYEm - labelUpShiftEm) * labelTextSize;
      } else if (candidate === 'right') {
        offsetXPx = labelRadialXEm * labelTextSize;
        offsetYPx = -labelUpShiftEm * labelTextSize;
      } else if (candidate === 'top') {
        offsetYPx = -(labelRadialTopEm + labelUpShiftEm) * labelTextSize;
      } else {
        offsetXPx = -labelRadialXEm * labelTextSize;
        offsetYPx = -labelUpShiftEm * labelTextSize;
      }

      return mapInstance
        .getPointInView([coordinate.lng, coordinate.lat])
        .then((pointInView) => {
          if (!pointInView || pointInView.length < 2) {
            return true;
          }

          const anchorX = pointInView[0] + offsetXPx;
          const anchorY = pointInView[1] + offsetYPx;

          let left = anchorX - estimatedWidth / 2;
          let right = anchorX + estimatedWidth / 2;
          let top = anchorY - estimatedHeight / 2;
          let bottom = anchorY + estimatedHeight / 2;

          if (candidate === 'bottom') {
            top = anchorY;
            bottom = anchorY + estimatedHeight;
          } else if (candidate === 'top') {
            top = anchorY - estimatedHeight;
            bottom = anchorY;
          } else if (candidate === 'left') {
            left = anchorX - estimatedWidth;
            right = anchorX;
          } else if (candidate === 'right') {
            left = anchorX;
            right = anchorX + estimatedWidth;
          }

          return (
            tapPoint.x >= left - LABEL_TAP_PADDING_PX &&
            tapPoint.x <= right + LABEL_TAP_PADDING_PX &&
            tapPoint.y >= top - LABEL_TAP_PADDING_PX &&
            tapPoint.y <= bottom + LABEL_TAP_PADDING_PX
          );
        })
        .catch(() => true);
    },
    [labelRadialTopEm, labelRadialXEm, labelRadialYEm, labelTextSize, labelUpShiftEm]
  );

  const handleStylePinPress = React.useCallback(
    (event: OnPressEvent) => {
      if (!onMarkerPress) {
        return;
      }
      const features = event?.features ?? [];
      if (features.length === 0) {
        return;
      }
      const topMatch = pickTopRestaurantIdFromPressFeatures(features);
      if (!topMatch) {
        return;
      }
      setOptimisticSelectedRestaurantId(topMatch.restaurantId);
      onMarkerPress(
        topMatch.restaurantId,
        topMatch.coordinate ?? getCoordinateFromPressEvent(event) ?? null
      );
    },
    [onMarkerPress]
  );

  const handleLabelPress = React.useCallback(
    (event: OnPressEvent) => {
      if (!onMarkerPress) {
        return;
      }

      const features: unknown[] = event?.features ?? [];
      if (features.length === 0) {
        return;
      }

      const mapInstance = mapRef.current;
      const point = getPointFromPressEvent(event);
      const selectLabelIfIntentional = ({
        restaurantId,
        coordinate,
        feature,
      }: {
        restaurantId: string;
        coordinate: Coordinate | null;
        feature: unknown;
      }) => {
        void isTapIntentionalForLabelFeature({
          mapInstance,
          tapPoint: point,
          feature,
        }).then((isIntentional) => {
          if (!isIntentional) {
            return;
          }
          setOptimisticSelectedRestaurantId(restaurantId);
          onMarkerPress(restaurantId, coordinate);
        });
      };

      if (!mapInstance?.queryRenderedFeaturesAtPoint || !point) {
        const fallbackMatch = pickFirstRestaurantIdFromPressFeatures(features);
        if (!fallbackMatch) {
          return;
        }
        const fallbackFeature =
          features.find(
            (feature) => getRestaurantIdFromPressFeature(feature) === fallbackMatch.restaurantId
          ) ?? features[0];
        const fallbackCoordinate =
          fallbackMatch.coordinate ??
          getCoordinateFromPressFeature(fallbackFeature) ??
          getCoordinateFromPressEvent(event);
        selectLabelIfIntentional({
          restaurantId: fallbackMatch.restaurantId,
          coordinate: fallbackCoordinate,
          feature: fallbackFeature,
        });
        return;
      }

      void mapInstance
        .queryRenderedFeaturesAtPoint(
          [point.x, point.y],
          [],
          Object.values(LABEL_LAYER_IDS_BY_CANDIDATE)
        )
        .then((renderedLabelsAtPoint) => {
          const visibleLabelFeatures = renderedLabelsAtPoint?.features ?? [];
          const visibleLabelMatch = pickFirstRestaurantIdFromPressFeatures(visibleLabelFeatures);
          if (!visibleLabelMatch) {
            return;
          }
          const matchedLabelFeature =
            visibleLabelFeatures.find(
              (feature) =>
                getRestaurantIdFromPressFeature(feature) === visibleLabelMatch.restaurantId
            ) ?? visibleLabelFeatures[0];
          const labelCoordinate =
            visibleLabelMatch.coordinate ??
            getCoordinateFromPressFeature(matchedLabelFeature) ??
            getCoordinateFromPressEvent(event);

          return mapInstance
            .queryRenderedFeaturesAtPoint([point.x, point.y], [], PIN_INTERACTION_LAYER_IDS)
            .then((renderedAtPoint) => {
              const pinFeatures = renderedAtPoint?.features ?? [];
              if (pinFeatures.length === 0) {
                selectLabelIfIntentional({
                  restaurantId: visibleLabelMatch.restaurantId,
                  coordinate: labelCoordinate,
                  feature: matchedLabelFeature,
                });
                return;
              }

              const topPinMatch = pickTopRestaurantIdFromPressFeatures(pinFeatures);
              if (!topPinMatch) {
                selectLabelIfIntentional({
                  restaurantId: visibleLabelMatch.restaurantId,
                  coordinate: labelCoordinate,
                  feature: matchedLabelFeature,
                });
                return;
              }
              void isTapInsidePinInteractionGeometry({
                mapInstance,
                tapPoint: point,
                coordinate: topPinMatch.coordinate,
              }).then((isIntentional) => {
                if (!isIntentional) {
                  selectLabelIfIntentional({
                    restaurantId: visibleLabelMatch.restaurantId,
                    coordinate: labelCoordinate,
                    feature: matchedLabelFeature,
                  });
                  return;
                }
                setOptimisticSelectedRestaurantId(topPinMatch.restaurantId);
                onMarkerPress(topPinMatch.restaurantId, topPinMatch.coordinate);
              });
            })
            .catch(() => {
              selectLabelIfIntentional({
                restaurantId: visibleLabelMatch.restaurantId,
                coordinate: labelCoordinate,
                feature: matchedLabelFeature,
              });
            });
        })
        .catch(() => {
          const fallbackMatch = pickFirstRestaurantIdFromPressFeatures(features);
          if (!fallbackMatch) {
            return;
          }
          const fallbackFeature =
            features.find(
              (feature) => getRestaurantIdFromPressFeature(feature) === fallbackMatch.restaurantId
            ) ?? features[0];
          const fallbackCoordinate =
            fallbackMatch.coordinate ??
            getCoordinateFromPressFeature(fallbackFeature) ??
            getCoordinateFromPressEvent(event);
          selectLabelIfIntentional({
            restaurantId: fallbackMatch.restaurantId,
            coordinate: fallbackCoordinate,
            feature: fallbackFeature,
          });
        });
    },
    [isTapIntentionalForLabelFeature, mapRef, onMarkerPress]
  );

  const handleMapViewportLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMapViewportSize((previous) => {
      if (previous.width === width && previous.height === height) {
        return previous;
      }
      return { width, height };
    });
  }, []);

  const runStickyLabelRefreshRef = React.useRef<() => void>(() => undefined);
  const refreshStickyLabelCandidatesRef = React.useRef<() => Promise<void>>(() => Promise.resolve());
  const runStickyLabelRefresh = React.useCallback(() => {
    if (labelStickyRefreshInFlightRef.current) {
      return;
    }
    if (!labelStickyRefreshQueuedRef.current) {
      return;
    }

    labelStickyRefreshQueuedRef.current = false;
    labelStickyRefreshInFlightRef.current = true;
    const refreshSeq = ++labelStickyRefreshSeqRef.current;

    void refreshStickyLabelCandidatesRef.current().finally(() => {
      if (refreshSeq !== labelStickyRefreshSeqRef.current) {
        return;
      }
      labelStickyRefreshInFlightRef.current = false;
      if (labelStickyRefreshQueuedRef.current && !labelStickyRefreshTimeoutRef.current) {
        labelStickyRefreshTimeoutRef.current = setTimeout(
          () => {
            labelStickyRefreshTimeoutRef.current = null;
            runStickyLabelRefreshRef.current();
          },
          isMapMovingRef.current ? LABEL_STICKY_REFRESH_MS_MOVING : LABEL_STICKY_REFRESH_MS_IDLE
        );
      }
    });
  }, []);
  runStickyLabelRefreshRef.current = runStickyLabelRefresh;

  const scheduleStickyLabelRefresh = React.useCallback((_reason: string) => {
    labelStickyRefreshQueuedRef.current = true;

    if (labelStickyRefreshTimeoutRef.current || labelStickyRefreshInFlightRef.current) {
      return;
    }
    const delayMs = isMapMovingRef.current
      ? LABEL_STICKY_REFRESH_MS_MOVING
      : LABEL_STICKY_REFRESH_MS_IDLE;
    labelStickyRefreshTimeoutRef.current = setTimeout(() => {
      labelStickyRefreshTimeoutRef.current = null;
      runStickyLabelRefreshRef.current();
    }, delayMs);
  }, []);

  React.useEffect(() => {
    if (!ENABLE_STICKY_LABEL_CANDIDATES) {
      return;
    }
    if (!shouldRenderLabels) {
      return;
    }
    if (!labelStickyMarkersReadyAt) {
      return;
    }
    if (labelStickyQueryReadyRef.current) {
      return;
    }

    const startedAt = labelStickyBootstrapPollStartedAtRef.current ?? Date.now();
    labelStickyBootstrapPollStartedAtRef.current = startedAt;

    const tick = () => {
      labelStickyBootstrapPollTimeoutRef.current = null;
      if (!ENABLE_STICKY_LABEL_CANDIDATES || !shouldRenderLabels) {
        return;
      }
      if (labelStickyQueryReadyRef.current) {
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > LABEL_STICKY_BOOTSTRAP_MAX_POLL_MS) {
        return;
      }
      scheduleStickyLabelRefresh('bootstrap-poll');
      labelStickyBootstrapPollTimeoutRef.current = setTimeout(tick, LABEL_STICKY_BOOTSTRAP_POLL_MS);
    };

    scheduleStickyLabelRefresh('markers-ready');
    labelStickyBootstrapPollTimeoutRef.current = setTimeout(tick, LABEL_STICKY_BOOTSTRAP_POLL_MS);

    return () => {
      if (labelStickyBootstrapPollTimeoutRef.current) {
        clearTimeout(labelStickyBootstrapPollTimeoutRef.current);
        labelStickyBootstrapPollTimeoutRef.current = null;
      }
    };
  }, [labelStickyMarkersReadyAt, scheduleStickyLabelRefresh, shouldRenderLabels]);

  React.useEffect(() => {
    if (!ENABLE_STICKY_LABEL_CANDIDATES) {
      return;
    }
    if (!shouldRenderLabels) {
      return;
    }
    if (mapViewportSize.width <= 0 || mapViewportSize.height <= 0) {
      return;
    }
    scheduleStickyLabelRefresh('viewport-or-markers');
  }, [
    mapViewportSize.height,
    mapViewportSize.width,
    markerTopologyKey,
    scheduleStickyLabelRefresh,
    shouldRenderLabels,
  ]);

  const handleDotPress = React.useCallback(
    (event: OnPressEvent) => {
      const mapInstance = mapRef.current;
      const point = getPointFromPressEvent(event);
      if (!mapInstance?.queryRenderedFeaturesInRect || !point) {
        return;
      }
      const radiusPx = DOT_TAP_INTENT_RADIUS_PX;
      const queryBox = [
        point.x - radiusPx,
        point.y - radiusPx,
        point.x + radiusPx,
        point.y + radiusPx,
      ] as [number, number, number, number];

      void mapInstance
        .queryRenderedFeaturesInRect(queryBox, [], [DOT_LAYER_ID])
        .then((renderedAtPoint) => {
          const features = renderedAtPoint?.features ?? [];
          if (features.length === 0) {
            return;
          }
          const target =
            getCoordinateFromPressEvent(event) ??
            getCoordinateFromPressFeature(features[0]) ??
            null;
          if (!target) {
            return;
          }
          const pressMatch = pickClosestRestaurantIdFromPressFeatures(features, target);
          const restaurantId =
            pressMatch?.restaurantId ?? getRestaurantIdFromPressFeature(features[0]);
          if (
            !restaurantId ||
            pinnedRestaurantIds.has(restaurantId) ||
            hiddenDotRestaurantIdList.includes(restaurantId)
          ) {
            return;
          }

          const coordinate = pressMatch?.coordinate ?? target;
          void isTapInsideDotInteractionGeometry({
            mapInstance,
            tapPoint: point,
            coordinate,
          }).then((isIntentional) => {
            if (!isIntentional) {
              return;
            }
            setOptimisticSelectedRestaurantId(restaurantId);
            onMarkerPress?.(restaurantId, coordinate);
          });
        })
        .catch(() => undefined);
    },
    [hiddenDotRestaurantIdList, mapRef, onMarkerPress, pinnedRestaurantIds]
  );

  React.useEffect(() => {
    if (!shouldRenderDots || !dotRestaurantFeatures?.features?.length) {
      dotPinnedKeysRef.current = new Set();
      dotPinnedStateResetKeyRef.current = null;
      return;
    }
    const mapInstance = mapRef.current;
    if (!mapInstance?.setFeatureState) {
      return;
    }

    const resetKey = `${styleURL}::${dotTopologyKey}::${
      dotRestaurantFeatures?.features.length ?? 0
    }`;
    let previous = dotPinnedKeysRef.current;
    if (dotPinnedStateResetKeyRef.current !== resetKey) {
      // When the dot ShapeSource is replaced/updated, Mapbox can drop feature-state for that source.
      // Re-apply pinned state deterministically so dots don't show under pins.
      dotPinnedStateResetKeyRef.current = resetKey;
      previous = new Set();
    }
    const next = pinnedDotKeys;
    dotPinnedKeysRef.current = new Set(next);

    previous.forEach((key) => {
      if (next.has(key)) return;
      void mapInstance
        .setFeatureState(key, { isPinned: false }, DOT_SOURCE_ID)
        .catch(() => undefined);
    });
    next.forEach((key) => {
      if (previous.has(key)) return;
      void mapInstance
        .setFeatureState(key, { isPinned: true }, DOT_SOURCE_ID)
        .catch(() => undefined);
    });
  }, [dotRestaurantFeatures, dotTopologyKey, pinnedDotKeys, shouldRenderDots, styleURL]);
  const profilerCallback =
    onProfilerRender ??
    ((() => {
      // noop
    }) as React.ProfilerOnRenderCallback);

  const handleCameraChanged = React.useCallback(
    (state: MapboxMapState) => {
      isMapMovingRef.current = true;
      mapLastMovedAtRef.current = Date.now();
      if (state?.gestures?.isGestureActive) {
        scheduleStickyLabelRefresh('camera-changed');
      }
      onCameraChanged(state);
    },
    [onCameraChanged, scheduleStickyLabelRefresh]
  );

  const refreshStickyLabelCandidates = React.useCallback(async () => {
    const runtime = labelStickyRuntimeRef.current;
    if (!ENABLE_STICKY_LABEL_CANDIDATES) {
      return;
    }
    if (runtime.shouldDisableMarkers || !runtime.shouldRenderLabels) {
      return;
    }
    if (runtime.viewport.width <= 0 || runtime.viewport.height <= 0) {
      return;
    }

    const mapInstance = mapRef.current;
    if (!mapInstance?.queryRenderedFeaturesInRect) {
      return;
    }

    const now = Date.now();
    if (!labelStickyQueryReadyRef.current) {
      const msSinceProbe = now - labelStickyLastProbeAtRef.current;
      if (msSinceProbe < LABEL_STICKY_QUERY_PROBE_MIN_INTERVAL_MS) {
        return;
      }

      labelStickyLastProbeAtRef.current = now;

      const probeFilter: Expression = ['all', ['has', 'markerKey'], ['has', 'labelCandidate']];
      const controlLayerIDs =
        USE_STYLE_LAYER_PINS &&
        !runtime.shouldDisableMarkers &&
        PIN_COLLISION_OBSTACLE_GEOMETRY !== 'off'
          ? [
              restaurantLabelPinCollisionLayerId,
              restaurantLabelPinCollisionLayerIdSideLeft,
              restaurantLabelPinCollisionLayerIdSideRight,
            ]
          : null;

      let probeControlRendered = 0;
      let probeFilterRendered = 0;
      let probeSourceFeatures = 0;
      let probeLastError: string | null = null;

      try {
        if (controlLayerIDs?.length) {
          const control = await mapInstance.queryRenderedFeaturesInRect([], [], controlLayerIDs);
          probeControlRendered = control?.features?.length ?? 0;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filtered = await mapInstance.queryRenderedFeaturesInRect([], probeFilter as any, null);
        probeFilterRendered = filtered?.features?.length ?? 0;

        if (typeof mapInstance.querySourceFeatures === 'function') {
          const source = await mapInstance.querySourceFeatures(
            RESTAURANT_LABEL_SOURCE_ID,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ['has', 'markerKey'] as any,
            []
          );
          probeSourceFeatures = source?.features?.length ?? 0;
        }
      } catch (error) {
        probeLastError =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: unknown }).message)
            : String(error);
      }

      labelStickyLastProbeSnapshotRef.current = {
        at: now,
        controlRendered: probeControlRendered,
        filterRendered: probeFilterRendered,
        sourceFeatures: probeSourceFeatures,
        lastError: probeLastError,
      };

      const probeReady = probeControlRendered > 0 || probeFilterRendered > 0;
      if (probeReady) {
        labelStickyQueryReadyRef.current = true;
        labelStickyQueryReadyAtRef.current = now;
        if (labelStickyColdStartRecoverTimeoutRef.current) {
          clearTimeout(labelStickyColdStartRecoverTimeoutRef.current);
          labelStickyColdStartRecoverTimeoutRef.current = null;
        }
      }

      if (!probeReady) {
        return;
      }
    }

    const layerIDs = Object.values(LABEL_LAYER_IDS_BY_CANDIDATE);
    let rendered: FeatureCollection | undefined;
    try {
      // IMPORTANT: Our MapView is intentionally overscanned (negative top/left + larger bounds) so
      // markers can render just outside the clipped viewport. `queryRenderedFeaturesInRect` uses the
      // MapView’s *own* coordinate system, so querying `[0..viewportW/H]` can miss the visible area.
      // Querying with `[]` asks RNMBX to use the full MapView bounds (v10), which is stable with
      // overscan and works for both idle + in-motion sampling.
      rendered = await mapInstance.queryRenderedFeaturesInRect([], [], layerIDs);
    } catch {
      return;
    }

    const layerRenderedFeatures = rendered?.features?.length ?? 0;
    let renderedForParsing = rendered;

    if (layerRenderedFeatures === 0) {
      // Diagnostic fallback: on iOS cold start, layerID-restricted queries can return empty even
      // when the same features are queryable via property filters (or are visibly rendered).
      try {
        const filter: Expression = ['all', ['has', 'markerKey'], ['has', 'labelCandidate']];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filtered = await mapInstance.queryRenderedFeaturesInRect([], filter as any, null);
        const filteredCount = filtered?.features?.length ?? 0;
        if (filteredCount > 0) {
          renderedForParsing = filtered;
        }
      } catch {
        // Ignore: we already report query errors above, and this is best-effort only.
      }
    }

    const effectiveRenderedFeatures = renderedForParsing?.features?.length ?? 0;

    const renderedCandidateByMarkerKey = new Map<string, LabelCandidate>();
    for (const feature of renderedForParsing?.features ?? []) {
      const parsed = getLabelCandidateInfoFromRenderedFeature(feature);
      if (!parsed) {
        continue;
      }
      if (!renderedCandidateByMarkerKey.has(parsed.markerKey)) {
        renderedCandidateByMarkerKey.set(parsed.markerKey, parsed.candidate);
      }
    }

    const isActivelyMoving = isMapMovingRef.current;

    const stickyMap = labelStickyCandidateByMarkerKeyRef.current;
    const lastSeenAt = labelStickyLastSeenAtByMarkerKeyRef.current;
    const missingStreak = labelStickyMissingStreakByMarkerKeyRef.current;
    const proposedCandidate = labelStickyProposedCandidateByMarkerKeyRef.current;
    const proposedSinceAt = labelStickyProposedSinceAtByMarkerKeyRef.current;
    let didChange = false;

    for (const [markerKey, candidate] of renderedCandidateByMarkerKey) {
      lastSeenAt.set(markerKey, now);
      missingStreak.set(markerKey, 0);
      const locked = stickyMap.get(markerKey);
      if (locked === candidate) {
        proposedCandidate.delete(markerKey);
        proposedSinceAt.delete(markerKey);
        continue;
      }

      const stableMs = isActivelyMoving
        ? LABEL_STICKY_LOCK_STABLE_MS_MOVING
        : LABEL_STICKY_LOCK_STABLE_MS_IDLE;

      const proposed = proposedCandidate.get(markerKey);
      if (proposed !== candidate) {
        proposedCandidate.set(markerKey, candidate);
        proposedSinceAt.set(markerKey, now);
        continue;
      }

      const sinceAt = proposedSinceAt.get(markerKey) ?? now;
      if (now - sinceAt < stableMs) {
        continue;
      }

      stickyMap.set(markerKey, candidate);
      proposedCandidate.delete(markerKey);
      proposedSinceAt.delete(markerKey);
      didChange = true;
    }

    // If we haven't seen the locked candidate rendered recently, it's likely blocked by collision.
    // IMPORTANT: only treat "missing" as a signal when the query is returning *some* features.
    // During active camera changes on iOS, querying can occasionally return empty/stale results;
    // unlocking on those frames causes locks to churn and effectively disables stickiness.
    if (effectiveRenderedFeatures > 0) {
      const unlockMs = isActivelyMoving
        ? LABEL_STICKY_UNLOCK_MISSING_MS_MOVING
        : LABEL_STICKY_UNLOCK_MISSING_MS_IDLE;
      const requiredStreak = isActivelyMoving ? LABEL_STICKY_UNLOCK_MISSING_STREAK_MOVING : 1;

      for (const markerKey of stickyMap.keys()) {
        if (renderedCandidateByMarkerKey.has(markerKey)) {
          continue;
        }

        const nextStreak = (missingStreak.get(markerKey) ?? 0) + 1;
        missingStreak.set(markerKey, nextStreak);

        const seenAt = lastSeenAt.get(markerKey) ?? 0;
        if (nextStreak >= requiredStreak && now - seenAt > unlockMs) {
          stickyMap.delete(markerKey);
          proposedCandidate.delete(markerKey);
          proposedSinceAt.delete(markerKey);
          missingStreak.delete(markerKey);
          didChange = true;
        }
      }
    }

    if (didChange) {
      setLabelStickyEpoch((value) => value + 1);
      // Updating the source data is enough for Mapbox to re-run placement. Forcing a full
      // SymbolLayer re-mount here causes a visible "flash" (labels disappear/reappear) when the
      // user releases a gesture, so we avoid it during steady-state refreshes.
    }
  }, [
    mapRef,
    restaurantLabelPinCollisionLayerId,
    restaurantLabelPinCollisionLayerIdSideLeft,
    restaurantLabelPinCollisionLayerIdSideRight,
  ]);
  refreshStickyLabelCandidatesRef.current = refreshStickyLabelCandidates;

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      isMapMovingRef.current = false;
      mapLastMovedAtRef.current = Date.now();
      if (labelStickyRefreshTimeoutRef.current) {
        clearTimeout(labelStickyRefreshTimeoutRef.current);
        labelStickyRefreshTimeoutRef.current = null;
      }
      labelStickyRefreshQueuedRef.current = true;
      runStickyLabelRefreshRef.current();
      onMapIdle(state);
    },
    [onMapIdle]
  );
  const visualReadyGateReasonRef = React.useRef<string | null>(null);
  const visualReadyArmSnapshotRef = React.useRef<{
    requestKey: string;
    markersRenderKey: string;
    pinsRenderKey: string;
    shouldSignalVisualReady: boolean;
  } | null>(null);
  React.useEffect(() => {
    visualReadySignaledRequestKeyRef.current = null;
    markerRevealSettledSignaledRequestKeyRef.current = null;
    visualReadyPendingFramesRef.current = 0;
    visualReadyAwaitingPinTransitionStartRef.current = false;
    visualReadyGateReasonRef.current = null;
  }, [visualReadyRequestKey]);

  React.useEffect(() => {
    if (!visualReadyRequestKey) {
      visualReadyPendingFramesRef.current = 0;
      visualReadyAwaitingPinTransitionStartRef.current = false;
      visualReadyArmSnapshotRef.current = null;
      return;
    }
    const previousArmSnapshot = visualReadyArmSnapshotRef.current;
    if (!shouldSignalVisualReady) {
      // Keep pending progress sticky while signal eligibility is transiently suspended.
      visualReadyArmSnapshotRef.current = {
        requestKey: visualReadyRequestKey,
        markersRenderKey,
        pinsRenderKey,
        shouldSignalVisualReady,
      };
      return;
    }
    const armCause = (() => {
      if (!previousArmSnapshot) {
        return 'initial';
      }
      if (previousArmSnapshot.requestKey !== visualReadyRequestKey) {
        return 'request_key_change';
      }
      return null;
    })();
    if (armCause) {
      // Arm once per request key to avoid repeated pending-frame resets under map topology churn.
      visualReadyPendingFramesRef.current = 2;
      visualReadyAwaitingPinTransitionStartRef.current = isAwaitingInitialRevealStart;
      emitMapRuntimeWriteSpan({
        label: 'visual_ready_arm',
        requestKey: visualReadyRequestKey,
        markerRevealCommitId,
        armCause,
        markersRenderKey,
        pinsRenderKey,
        sortedMarkerCount: sortedRestaurantMarkers.length,
        dotFeatureCount: dotRestaurantFeatures?.features?.length ?? 0,
        pendingFrames: visualReadyPendingFramesRef.current,
        awaitingPinTransitionStart: visualReadyAwaitingPinTransitionStartRef.current,
      });
    } else {
      if (isAwaitingInitialRevealStart) {
        visualReadyAwaitingPinTransitionStartRef.current = true;
      }
      const rearmSuppressedCause =
        previousArmSnapshot?.markersRenderKey !== markersRenderKey
          ? 'markers_render_key_change'
          : previousArmSnapshot?.pinsRenderKey !== pinsRenderKey
          ? 'pins_render_key_change'
          : previousArmSnapshot?.shouldSignalVisualReady !== shouldSignalVisualReady
          ? 'signal_toggle'
          : null;
      if (rearmSuppressedCause) {
        emitMapRuntimeWriteSpan({
          label: 'visual_ready_arm_suppressed',
          requestKey: visualReadyRequestKey,
          markerRevealCommitId,
          reason: rearmSuppressedCause,
          markersRenderKey,
          pinsRenderKey,
          sortedMarkerCount: sortedRestaurantMarkers.length,
          dotFeatureCount: dotRestaurantFeatures?.features?.length ?? 0,
          pendingFrames: visualReadyPendingFramesRef.current,
          awaitingPinTransitionStart: visualReadyAwaitingPinTransitionStartRef.current,
        });
      }
    }
    visualReadyArmSnapshotRef.current = {
      requestKey: visualReadyRequestKey,
      markersRenderKey,
      pinsRenderKey,
      shouldSignalVisualReady,
    };
  }, [
    emitMapRuntimeWriteSpan,
    isAwaitingInitialRevealStart,
    markerRevealCommitId,
    markersRenderKey,
    pinsRenderKey,
    shouldSignalVisualReady,
    sortedRestaurantMarkers.length,
    dotRestaurantFeatures?.features?.length,
    visualReadyRequestKey,
  ]);

  const handleDidFinishRenderingFrame = React.useCallback(() => {
    if (!visualReadyRequestKey) {
      return;
    }
    const shouldEmitVisualReady = Boolean(onVisualReady && shouldSignalVisualReady);
    const shouldEmitMarkerRevealSettled = onMarkerRevealSettled != null;
    if (!shouldEmitVisualReady && !shouldEmitMarkerRevealSettled) {
      return;
    }
    const visualReadyAlreadySignaled =
      visualReadySignaledRequestKeyRef.current === visualReadyRequestKey;
    const markerRevealSettledAlreadySignaled =
      markerRevealSettledSignaledRequestKeyRef.current === visualReadyRequestKey;
    if (
      (visualReadyAlreadySignaled || !shouldEmitVisualReady) &&
      (markerRevealSettledAlreadySignaled || !shouldEmitMarkerRevealSettled)
    ) {
      return;
    }
    const emitVisualReadyGateReason = (reason: string | null) => {
      if (visualReadyGateReasonRef.current === reason) {
        return;
      }
      visualReadyGateReasonRef.current = reason;
      if (!reason) {
        return;
      }
      emitMapRuntimeWriteSpan({
        label: 'visual_ready_gate',
        requestKey: visualReadyRequestKey,
        markerRevealCommitId,
        reason,
        pendingFrames: visualReadyPendingFramesRef.current,
        awaitingPinTransitionStart: visualReadyAwaitingPinTransitionStartRef.current,
        hasPendingPromotions,
        hasStartedPromotions,
      });
    };
    if (visualReadyPendingFramesRef.current > 0) {
      emitVisualReadyGateReason('pending_frames');
      visualReadyPendingFramesRef.current -= 1;
      return;
    }
    if (visualReadyAwaitingPinTransitionStartRef.current) {
      if (hasPendingPromotions) {
        emitVisualReadyGateReason('awaiting_pin_transition_pending_promotions');
        return;
      }
      if (!hasStartedPromotions) {
        // Phase 9: If no promotions pending and none started, the initial reveal was instant.
        // Clear the gate and fall through to signal visual ready.
        visualReadyAwaitingPinTransitionStartRef.current = false;
      }
      visualReadyAwaitingPinTransitionStartRef.current = false;
      // Leave one more frame so the newly-armed transition properties are guaranteed painted.
      visualReadyPendingFramesRef.current = Math.max(visualReadyPendingFramesRef.current, 1);
      emitVisualReadyGateReason('pending_transition_paint_frame');
      return;
    }
    if (requireMarkerVisualsForVisualReady) {
      const hasMarkerVisuals =
        sortedRestaurantMarkers.length > 0 || (dotRestaurantFeatures?.features?.length ?? 0) > 0;
      if (!hasMarkerVisuals) {
        emitVisualReadyGateReason('awaiting_marker_visuals');
        return;
      }
    }
    emitVisualReadyGateReason(null);
    if (shouldEmitMarkerRevealSettled && !markerRevealSettledAlreadySignaled) {
      markerRevealSettledSignaledRequestKeyRef.current = visualReadyRequestKey;
      emitMapRuntimeWriteSpan({
        label: 'marker_reveal_settled_signal',
        requestKey: visualReadyRequestKey,
        markerRevealCommitId,
      });
      onMarkerRevealSettled?.({
        requestKey: visualReadyRequestKey,
        markerRevealCommitId,
        settledAtMs: getNowMs(),
      });
    }
    if (shouldEmitVisualReady && !visualReadyAlreadySignaled) {
      visualReadySignaledRequestKeyRef.current = visualReadyRequestKey;
      emitMapRuntimeWriteSpan({
        label: 'visual_ready_signal',
        requestKey: visualReadyRequestKey,
        markerRevealCommitId,
      });
      onVisualReady?.(visualReadyRequestKey);
    }
  }, [
    emitMapRuntimeWriteSpan,
    dotRestaurantFeatures?.features?.length,
    hasPendingPromotions,
    hasStartedPromotions,
    markerRevealCommitId,
    onVisualReady,
    onMarkerRevealSettled,
    requireMarkerVisualsForVisualReady,
    shouldSignalVisualReady,
    sortedRestaurantMarkers.length,
    visualReadyRequestKey,
  ]);

  const handleMapLoaded = React.useCallback(() => {
    // IMPORTANT: mark the map as ready first. Refresh routines can fail transiently during early
    // initialization (e.g. before the view->coordinate APIs are fully warm), and we don't want
    // those failures to prevent labels from mounting.
    onMapLoaded();
    try {
      labelStickyRefreshQueuedRef.current = true;
      runStickyLabelRefreshRef.current();
    } catch (error: unknown) {
      logger.error('Mapbox post-load refresh failed', { error });
    }
  }, [onMapLoaded]);

  const remountPinLayerTree = React.useCallback(() => {
    const nowMs = Date.now();
    if (nowMs - pinLayerRecoveryLastAttemptAtRef.current < 400) {
      return;
    }
    pinLayerRecoveryLastAttemptAtRef.current = nowMs;
    const remountStartedAtMs = getNowMs();
    setPinLayerTreeEpoch((value) => value + 1);
    recordRuntimeAttribution(getNowMs() - remountStartedAtMs);
  }, [recordRuntimeAttribution]);

  const handleMapLoadedStyle = React.useCallback(() => {
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleMapLoadedMap = React.useCallback(() => {
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleMapLoadError = React.useCallback(
    (event?: unknown) => {
      const eventRecord =
        event && typeof event === 'object' && !Array.isArray(event)
          ? (event as Record<string, unknown>)
          : null;
      const payload =
        eventRecord?.payload &&
        typeof eventRecord.payload === 'object' &&
        !Array.isArray(eventRecord.payload)
          ? (eventRecord.payload as Record<string, unknown>)
          : null;
      const rawError = typeof payload?.error === 'string' ? payload.error : undefined;
      const rawMessage = typeof payload?.message === 'string' ? payload.message : undefined;
      const rawUrl = typeof payload?.url === 'string' ? payload.url : undefined;
      const errorText = `${rawError ?? ''} ${rawMessage ?? ''}`.toLowerCase();
      const isMissingStylePinsSource =
        errorText.includes(STYLE_PINS_SOURCE_ID) && errorText.includes('not in style');

      if (isMissingStylePinsSource) {
        remountPinLayerTree();
      }

      logger.error('Mapbox map failed to load', {
        type: typeof eventRecord?.type === 'string' ? eventRecord.type : undefined,
        error: rawError,
        message: rawMessage,
        url: rawUrl ? getSafeUrlForLogs(rawUrl) : undefined,
        styleURL: getSafeStyleUrlForLogs(styleURL),
      });
    },
    [remountPinLayerTree, styleURL]
  );

  const handleTouchStart = React.useCallback(() => {
    onTouchStart?.();
  }, [onTouchStart]);

  const handleTouchEnd = React.useCallback(() => {
    onTouchEnd?.();
  }, [onTouchEnd]);

  const handleMapViewPress = React.useCallback(
    (feature: GeoJSON.Feature) => {
      // Wrap single feature into the legacy OnPressEvent shape for downstream guards.
      const syntheticEvent: OnPressEvent = {
        features: [feature],
        coordinates: { latitude: 0, longitude: 0 },
        point: { x: 0, y: 0 },
      };
      if (pressEventTargetsMarkerFeature(syntheticEvent)) {
        return;
      }
      setOptimisticSelectedRestaurantId(null);
      onPress();
    },
    [onPress]
  );

  return (
    <View style={styles.mapViewport} onLayout={handleMapViewportLayout}>
      <MapboxGL.MapView
        ref={mapRef}
        // Overscan is required for our no-snapping edge fade: it lets Mapbox render markers just
        // outside the clipped viewport so fade-ins can start offscreen (see `marker-visibility.ts`).
        style={[styles.map, MARKER_VIEW_OVERSCAN_STYLE]}
        styleURL={styleURL}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        gestureSettings={{ panDecelerationFactor: MAP_PAN_DECELERATION_FACTOR }}
        onPress={handleMapViewPress}
        {...({ onTouchStartCapture: handleTouchStart, onTouchEndCapture: handleTouchEnd, onTouchCancelCapture: handleTouchEnd } as Record<string, unknown>)}
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
        onDidFinishLoadingStyle={handleMapLoadedStyle}
        onDidFinishLoadingMap={handleMapLoadedMap}
        onDidFinishRenderingFrame={handleDidFinishRenderingFrame}
        onMapLoadingError={handleMapLoadError}
      >
        <MapboxGL.Images
          images={{
            [STYLE_PIN_OUTLINE_IMAGE_ID]: pinAsset,
            // Used only for the shadow layer (tinted + translated). Keep the outline itself as
            // a non-SDF image so we preserve the original asset as-is.
            [STYLE_PIN_SHADOW_IMAGE_ID]: pinShadowAsset,
            // `iconColor` only applies to SDF images. Our RN MarkerView path relies on `tintColor`,
            // so we mark the fill as SDF here to enable color tinting via `SymbolLayer.iconColor`.
            [STYLE_PIN_FILL_IMAGE_ID]: { image: pinFillAsset, sdf: true },
          }}
        />
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={mapCenter ?? USA_FALLBACK_CENTER}
          zoomLevel={mapZoom}
          padding={cameraPadding ?? ZERO_CAMERA_PADDING}
          followUserLocation={isFollowingUser}
          followZoomLevel={13}
          followPitch={0}
          followHeading={0}
          animationMode="none"
          animationDuration={0}
        />
        <MapboxGL.ShapeSource
          id={OVERLAY_Z_ANCHOR_SOURCE_ID}
          shape={EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>}
        >
          <MapboxGL.SymbolLayer
            id={OVERLAY_Z_ANCHOR_LAYER_ID}
            slot="top"
            sourceID={OVERLAY_Z_ANCHOR_SOURCE_ID}
            style={OVERLAY_Z_ANCHOR_STYLE}
          />
          <MapboxGL.SymbolLayer
            id={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
            slot="top"
            sourceID={OVERLAY_Z_ANCHOR_SOURCE_ID}
            style={OVERLAY_Z_ANCHOR_STYLE}
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
          />
          <MapboxGL.SymbolLayer
            id={SEARCH_PINS_Z_ANCHOR_LAYER_ID}
            slot="top"
            sourceID={OVERLAY_Z_ANCHOR_SOURCE_ID}
            style={OVERLAY_Z_ANCHOR_STYLE}
            belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          />
        </MapboxGL.ShapeSource>
        {shouldMountDotLayers ? (
          <React.Profiler id="SearchMapDots" onRender={profilerCallback}>
            <MapboxGL.ShapeSource
              id={DOT_SOURCE_ID}
              shape={
                shouldRenderDots && dotRestaurantFeatures
                  ? (dotRestaurantFeatures as FeatureCollection<Point, RestaurantFeatureProperties>)
                  : (EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>)
              }
            >
              <MapboxGL.SymbolLayer
                id={DOT_LAYER_ID}
                slot="top"
                belowLayerID={SEARCH_PINS_Z_ANCHOR_LAYER_ID}
                style={dotLayerStyle}
                sourceID={DOT_SOURCE_ID}
              />
            </MapboxGL.ShapeSource>
            <MapboxGL.ShapeSource
              id={DOT_INTERACTION_SOURCE_ID}
              shape={
                shouldRenderDots && dotInteractionFeatures
                  ? (dotInteractionFeatures as FeatureCollection<Point, RestaurantFeatureProperties>)
                  : (EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>)
              }
              onPress={handleDotPress}
            >
              <MapboxGL.CircleLayer
                id={DOT_INTERACTION_LAYER_ID}
                slot="top"
                belowLayerID={SEARCH_PINS_Z_ANCHOR_LAYER_ID}
                sourceID={DOT_INTERACTION_SOURCE_ID}
                style={DOT_INTERACTION_LAYER_STYLE}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                filter={dotInteractionFilter as any}
              />
            </MapboxGL.ShapeSource>
          </React.Profiler>
        ) : null}
        {USE_STYLE_LAYER_PINS && !shouldDisableMarkers ? (
          <MapboxGL.ShapeSource
            key={`style-pins-source-${pinLayerTreeEpoch}`}
            id={STYLE_PINS_SOURCE_ID}
            shape={
              shouldRenderStagedPins && stylePinFeaturesWithTransitions.features.length > 0
                ? stylePinFeaturesWithTransitions
                : EMPTY_POINT_FEATURES
            }
          >
            {stylePinLayerStack}
          </MapboxGL.ShapeSource>
        ) : null}
        {USE_STYLE_LAYER_PINS && !shouldDisableMarkers ? (
          <MapboxGL.ShapeSource
            key={`pin-interaction-source-${pinLayerTreeEpoch}`}
            id={PIN_INTERACTION_SOURCE_ID}
            shape={
              shouldRenderStagedPins && pinInteractionFeatures.features.length > 0
                ? pinInteractionFeatures
                : EMPTY_POINT_FEATURES
            }
            onPress={handleStylePinPress}
          >
            {pinInteractionLayerStack}
          </MapboxGL.ShapeSource>
        ) : null}
        {shouldRenderLabels ? (
          <React.Profiler id="SearchMapLabels" onRender={profilerCallback}>
            <React.Fragment key={`labels-${labelLayerTreeEpoch}`}>
              <MapboxGL.ShapeSource
                id={RESTAURANT_LABEL_SOURCE_ID}
                shape={restaurantLabelCandidateFeaturesWithIds}
              >
                {LABEL_CANDIDATE_LAYER_ORDER.map((candidate) => (
                  <MapboxGL.SymbolLayer
                    key={`${LABEL_LAYER_IDS_BY_CANDIDATE[candidate]}-${labelPlacementEpoch}`}
                    id={LABEL_LAYER_IDS_BY_CANDIDATE[candidate]}
                    slot="top"
                    sourceID={RESTAURANT_LABEL_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={labelCandidateStyles[candidate]}
                    filter={['==', ['get', 'labelCandidate'], candidate]}
                  />
                ))}
              </MapboxGL.ShapeSource>
              <MapboxGL.ShapeSource
                id={LABEL_INTERACTION_SOURCE_ID}
                shape={restaurantLabelCandidateFeaturesWithIds}
                onPress={handleLabelPress}
              >
                {LABEL_CANDIDATE_LAYER_ORDER.map((candidate) => (
                  <MapboxGL.SymbolLayer
                    key={`${LABEL_INTERACTION_LAYER_IDS_BY_CANDIDATE[candidate]}-${labelPlacementEpoch}`}
                    id={LABEL_INTERACTION_LAYER_IDS_BY_CANDIDATE[candidate]}
                    slot="top"
                    sourceID={LABEL_INTERACTION_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={labelInteractionStyles[candidate]}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    filter={labelInteractionFilters[candidate] as any}
                  />
                ))}
              </MapboxGL.ShapeSource>
              {USE_STYLE_LAYER_PINS &&
              !shouldDisableMarkers &&
              shouldRenderStagedPins &&
              PIN_COLLISION_OBSTACLE_GEOMETRY !== 'off' ? (
                <MapboxGL.ShapeSource
                  id={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
                  shape={collisionSourceFeatures}
                >
                  <MapboxGL.SymbolLayer
                    key={restaurantLabelPinCollisionLayerKey}
                    id={restaurantLabelPinCollisionLayerId}
                    slot="top"
                    sourceID={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={restaurantLabelPinCollisionStyles.center}
                  />
                  <MapboxGL.SymbolLayer
                    key={restaurantLabelPinCollisionLayerKeySideLeft}
                    id={restaurantLabelPinCollisionLayerIdSideLeft}
                    slot="top"
                    sourceID={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={restaurantLabelPinCollisionStyles.left}
                  />
                  <MapboxGL.SymbolLayer
                    key={restaurantLabelPinCollisionLayerKeySideRight}
                    id={restaurantLabelPinCollisionLayerIdSideRight}
                    slot="top"
                    sourceID={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={restaurantLabelPinCollisionStyles.right}
                  />
                </MapboxGL.ShapeSource>
              ) : null}
            </React.Fragment>
          </React.Profiler>
        ) : null}
        {userLocation ? (
          <MapboxGL.MarkerView
            id="user-location"
            coordinate={[userLocation.lng, userLocation.lat]}
            anchor={USER_LOCATION_ANCHOR}
            allowOverlap
            isSelected
            style={[styles.markerView, styles.userLocationMarkerView]}
          >
            <View style={styles.userLocationWrapper}>
              <View style={styles.userLocationShadow}>
                {shouldDisableBlur ? (
                  <View style={styles.userLocationHaloWrapper}>
                    <Animated.View
                      style={[
                        styles.userLocationDot,
                        {
                          transform: [
                            {
                              scale: locationPulse.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1.4, 1.8],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  </View>
                ) : (
                  <AppBlurView intensity={25} tint="light" style={styles.userLocationHaloWrapper}>
                    <Animated.View
                      style={[
                        styles.userLocationDot,
                        {
                          transform: [
                            {
                              scale: locationPulse.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1.4, 1.8],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  </AppBlurView>
                )}
              </View>
            </View>
          </MapboxGL.MarkerView>
        ) : null}
      </MapboxGL.MapView>
    </View>
  );
};

const areCameraPaddingEqual = (left?: CameraPadding | null, right?: CameraPadding | null) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.paddingTop === right.paddingTop &&
    left.paddingBottom === right.paddingBottom &&
    left.paddingLeft === right.paddingLeft &&
    left.paddingRight === right.paddingRight
  );
};

const areCentersEqual = (left?: [number, number] | null, right?: [number, number] | null) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left[0] === right[0] && left[1] === right[1];
};

const areUserLocationsEqual = (left?: Coordinate | null, right?: Coordinate | null) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.lat === right.lat && left.lng === right.lng;
};

const arePropsEqual = (prev: SearchMapProps, next: SearchMapProps) => {
  if (prev.styleURL !== next.styleURL) {
    return false;
  }
  if (prev.scoreMode !== next.scoreMode) {
    return false;
  }
  if (prev.isMapStyleReady !== next.isMapStyleReady) {
    return false;
  }
  if (prev.mapZoom !== next.mapZoom) {
    return false;
  }
  if (!areCentersEqual(prev.mapCenter, next.mapCenter)) {
    return false;
  }
  if (!areCameraPaddingEqual(prev.cameraPadding, next.cameraPadding)) {
    return false;
  }
  if (prev.isFollowingUser !== next.isFollowingUser) {
    return false;
  }
  if (prev.selectedRestaurantId !== next.selectedRestaurantId) {
    return false;
  }
  if (prev.dotRestaurantFeatures !== next.dotRestaurantFeatures) {
    return false;
  }
  if (prev.markersRenderKey !== next.markersRenderKey) {
    return false;
  }
  if (prev.pinsRenderKey !== next.pinsRenderKey) {
    return false;
  }
  if (prev.disableMarkers !== next.disableMarkers) {
    return false;
  }
  if (prev.disableBlur !== next.disableBlur) {
    return false;
  }
  // Handoff props (isRunOneHandoffActive, isRunOneChromeDeferred,
  // selectionFeedbackOperationId) only affect load shedding and staged
  // publish which are no-ops without markers.  The map stores them in refs
  // so callbacks always see the latest value after the next render.  Skip
  // re-rendering for handoff-only changes to avoid a full map commit in the
  // preflight frame when no marker data has changed.
  const markersUnchanged =
    prev.markersRenderKey === next.markersRenderKey &&
    prev.sortedRestaurantMarkers === next.sortedRestaurantMarkers &&
    prev.dotRestaurantFeatures === next.dotRestaurantFeatures;
  if (!markersUnchanged) {
    if (prev.isRunOneChromeDeferred !== next.isRunOneChromeDeferred) {
      return false;
    }
    if (prev.isRunOneHandoffActive !== next.isRunOneHandoffActive) {
      return false;
    }
    if (prev.selectionFeedbackOperationId !== next.selectionFeedbackOperationId) {
      return false;
    }
    if (prev.onRuntimeMechanismEvent !== next.onRuntimeMechanismEvent) {
      return false;
    }
    if (prev.onProfilerRender !== next.onProfilerRender) {
      return false;
    }
  }
  if (!areUserLocationsEqual(prev.userLocation, next.userLocation)) {
    return false;
  }
  if (prev.locationPulse !== next.locationPulse) {
    return false;
  }
  if (prev.restaurantLabelStyle !== next.restaurantLabelStyle) {
    return false;
  }
  if (prev.buildMarkerKey !== next.buildMarkerKey) {
    return false;
  }
  if (prev.onPress !== next.onPress) {
    return false;
  }
  if (prev.onTouchStart !== next.onTouchStart) {
    return false;
  }
  if (prev.onTouchEnd !== next.onTouchEnd) {
    return false;
  }
  if (prev.onCameraChanged !== next.onCameraChanged) {
    return false;
  }
  if (prev.onMapIdle !== next.onMapIdle) {
    return false;
  }
  if (prev.onMapLoaded !== next.onMapLoaded) {
    return false;
  }
  if (prev.onMarkerPress !== next.onMarkerPress) {
    return false;
  }
  if (prev.onVisualReady !== next.onVisualReady) {
    return false;
  }
  if (prev.onMarkerRevealSettled !== next.onMarkerRevealSettled) {
    return false;
  }
  if (prev.shouldSignalVisualReady !== next.shouldSignalVisualReady) {
    return false;
  }
  if (prev.requireMarkerVisualsForVisualReady !== next.requireMarkerVisualsForVisualReady) {
    return false;
  }
  if (prev.searchRuntimeBus !== next.searchRuntimeBus) {
    return false;
  }
  return true;
};

export default React.memo(SearchMap, arePropsEqual);
