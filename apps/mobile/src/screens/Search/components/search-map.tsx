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
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import { logger } from '../../../utils';

const EMPTY_DEMOTION_LIST: string[] = [];
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
const ENABLE_LOD_DIAG = __DEV__;
const ENABLE_REVEAL_DEADLOCK_DIAG = __DEV__;
const LOD_DIAG_SAMPLE_LIMIT = 6;
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
const PIN_COLLISION_OBSTACLE_GEOMETRY: 'outline' | 'fill' | 'off' = 'fill' as
  | 'outline'
  | 'fill'
  | 'off';
const PIN_COLLISION_OBSTACLE_SCALE = 1.1;
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
const PIN_COLLISION_OFFSET_Y_PX = -Math.round(PIN_MARKER_RENDER_SIZE * -0.054);
const PIN_COLLISION_OUTLINE_OFFSET_IMAGE_PX =
  PIN_COLLISION_OFFSET_Y_PX / (STYLE_PINS_OUTLINE_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
const PIN_COLLISION_FILL_OFFSET_IMAGE_PX =
  PIN_COLLISION_OFFSET_Y_PX / (STYLE_PINS_FILL_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
// Single source of truth for ALL pin fade animations (batch reveal/dismiss + LOD promote/demote).
// Changing these values affects every pin fade globally.
const PIN_FADE_CONFIG = {
  durationMs: 300,
  rankDelayFraction: 0.5,
} as const;

// Native Mapbox transition configs for batch fade animations (60fps GPU-driven).
// The JS thread only sets target values (0 or 1) — Mapbox handles all interpolation.
const PIN_OPACITY_TRANSITION = { duration: PIN_FADE_CONFIG.durationMs, delay: 0 };
const PIN_RANK_OPACITY_TRANSITION = {
  duration: PIN_FADE_CONFIG.durationMs * (1 - PIN_FADE_CONFIG.rankDelayFraction),
  delay: PIN_FADE_CONFIG.durationMs * PIN_FADE_CONFIG.rankDelayFraction,
};

const PINS_RENDER_KEY_HOLD_PREFIX = 'hold::';
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

const sampleMarkerKeys = (
  markerKeys: Iterable<string>,
  limit: number = LOD_DIAG_SAMPLE_LIMIT
): string[] => {
  const sample: string[] = [];
  for (const markerKey of markerKeys) {
    sample.push(markerKey);
    if (sample.length >= limit) {
      break;
    }
  }
  return sample;
};

const logLodDiag = (label: string, payload?: Record<string, unknown>) => {
  if (!ENABLE_LOD_DIAG) {
    return;
  }
  logger.info(`[LOD-DIAG] ${label}`, payload ?? {});
};

const logRevealDeadlockDiag = (label: string, payload?: Record<string, unknown>) => {
  if (!ENABLE_REVEAL_DEADLOCK_DIAG) {
    return;
  }
  logger.info(`[REVEAL-DEADLOCK] ${label}`, payload ?? {});
};

const withIconOpacity = (
  baseStyle: MapboxGL.SymbolLayerStyle,
  iconOpacity: unknown
): MapboxGL.SymbolLayerStyle =>
  ({
    ...baseStyle,
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
// Require two fully-rendered map frames after preroll arms before flipping
// batch opacity target 0->1. This guarantees at least one committed paint
// where newly-mounted pins exist at opacity 0.
const PREROLL_FULL_FRAME_ACKS_REQUIRED = 2;
// Promote LOD lanes must also wait for fully-rendered frame acknowledgements
// before flipping 0->1, otherwise Mapbox can observe mount+flip too close
// together and the pin can flash.
const LOD_PROMOTE_FULL_FRAME_ACKS_REQUIRED = 2;
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
// Temporary debug aid: visualize pressable interaction layers (pin/dot/label interactions).
const DEBUG_PRESSABLE_INTERACTION_LAYERS = false;
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
  circleColor: DEBUG_PRESSABLE_INTERACTION_LAYERS ? '#FF6A3D' : '#000000',
  circleOpacity: DEBUG_PRESSABLE_INTERACTION_LAYERS ? 0.2 : INTERACTION_LAYER_HIDDEN_OPACITY,
  circleStrokeColor: DEBUG_PRESSABLE_INTERACTION_LAYERS ? '#FFD9CC' : '#000000',
  circleStrokeWidth: DEBUG_PRESSABLE_INTERACTION_LAYERS ? 1 : 0,
  circleStrokeOpacity: DEBUG_PRESSABLE_INTERACTION_LAYERS ? 0.65 : 0,
  circleTranslate: [0, -PIN_INTERACTION_CENTER_SHIFT_Y_PX],
  circleTranslateAnchor: 'viewport',
} as MapboxGL.CircleLayerStyle;
const DOT_INTERACTION_LAYER_STYLE: MapboxGL.CircleLayerStyle = {
  circleRadius: DOT_TAP_INTENT_RADIUS_PX,
  circleColor: DEBUG_PRESSABLE_INTERACTION_LAYERS ? '#24D4FF' : '#000000',
  circleOpacity: DEBUG_PRESSABLE_INTERACTION_LAYERS ? 0.22 : INTERACTION_LAYER_HIDDEN_OPACITY,
  circleStrokeColor: DEBUG_PRESSABLE_INTERACTION_LAYERS ? '#B8F3FF' : '#000000',
  circleStrokeWidth: DEBUG_PRESSABLE_INTERACTION_LAYERS ? 1 : 0,
  circleStrokeOpacity: DEBUG_PRESSABLE_INTERACTION_LAYERS ? 0.65 : 0,
} as MapboxGL.CircleLayerStyle;

const buildLabelCandidateFeatureId = (markerKey: string, candidate: LabelCandidate) =>
  `${markerKey}::label::${candidate}`;

const LABEL_CANDIDATE_FEATURE_ID_DELIMITER = '::label::';
const LABEL_STICKY_IDENTITY_RESTAURANT_PREFIX = 'restaurant:';
const LABEL_STICKY_IDENTITY_MARKER_PREFIX = 'marker:';

const buildLabelStickyIdentityKey = (
  restaurantId: string | null,
  markerKey: string | null
): string | null => {
  if (typeof restaurantId === 'string' && restaurantId.length > 0) {
    return `${LABEL_STICKY_IDENTITY_RESTAURANT_PREFIX}${restaurantId}`;
  }
  if (typeof markerKey === 'string' && markerKey.length > 0) {
    return `${LABEL_STICKY_IDENTITY_MARKER_PREFIX}${markerKey}`;
  }
  return null;
};

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

const getLabelStickyIdentityKeyFromFeature = (
  feature: Feature<Point, RestaurantFeatureProperties>
): string | null => {
  const markerKey = typeof feature.id === 'string' ? feature.id : null;
  return buildLabelStickyIdentityKey(feature.properties.restaurantId ?? null, markerKey);
};

const getLabelStickyIdentityKeyFromRenderedFeature = (
  feature: unknown,
  fallbackMarkerKey: string | null
): string | null => {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
    return buildLabelStickyIdentityKey(null, fallbackMarkerKey);
  }
  const record = feature as Record<string, unknown>;
  const props =
    record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
      ? (record.properties as Record<string, unknown>)
      : null;
  const restaurantId = typeof props?.restaurantId === 'string' ? props.restaurantId : null;
  const markerKey =
    typeof props?.markerKey === 'string'
      ? props.markerKey
      : typeof record.id === 'string'
      ? parseLabelCandidateFeatureId(record.id)?.markerKey ?? null
      : fallbackMarkerKey;
  return buildLabelStickyIdentityKey(restaurantId, markerKey);
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
const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

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

const getNowMs = () =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
type PinTransitionKind = 'promote' | 'demote';

type BatchTransitionPhase = 'idle' | 'dismissing' | 'preroll_wait_frame' | 'revealing';
type TransitionLaneState = 'staged' | 'flipped' | 'settling';

type TransitionLane = {
  laneId: string;
  direction: PinTransitionKind;
  startedAtMs: number;
  expiresAtMs: number;
  startOpacity: number;
  targetOpacity: 0 | 1;
  opacityTarget: number;
  state: TransitionLaneState;
  flipAcksRequired: number;
  flipAcksRemaining: number;
  flipAcksObserved: number;
  markerKeys: Set<string>;
  featuresByMarkerKey: Map<string, Feature<Point, RestaurantFeatureProperties>>;
};

type TransitionLaneRenderModel = {
  laneId: string;
  direction: PinTransitionKind;
  opacityTarget: number;
  state: TransitionLaneState;
  pinFeatures: FeatureCollection<Point, RestaurantFeatureProperties>;
};

type PinTransitionState = {
  steadyPinnedFeatureByMarkerKey: Map<string, Feature<Point, RestaurantFeatureProperties>>;
  latestDesiredPinnedFeatureByMarkerKey: Map<string, Feature<Point, RestaurantFeatureProperties>>;
  latestVisiblePinnedFeatureByMarkerKey: Map<string, Feature<Point, RestaurantFeatureProperties>>;
  transitionLaneById: Map<string, TransitionLane>;
  markerToLaneId: Map<string, string>;
  nextLaneOrdinal: number;
  pendingInitialRevealKey: string | null;
  appliedInitialRevealKey: string | null;
  observedInitialRevealKey: string | null;
  // Batch reveal key: set when batch reveal fires, cleared after
  // PIN_FADE_CONFIG.durationMs. Drives hasStartedPromotions without
  // creating per-feature LOD transitions.
  batchRevealActiveKey: string | null;
  batchRevealStartedAtMs: number | null;
};

const createPinTransitionState = (): PinTransitionState => ({
  steadyPinnedFeatureByMarkerKey: new Map(),
  latestDesiredPinnedFeatureByMarkerKey: new Map(),
  latestVisiblePinnedFeatureByMarkerKey: new Map(),
  transitionLaneById: new Map(),
  markerToLaneId: new Map(),
  nextLaneOrdinal: 0,
  pendingInitialRevealKey: null,
  appliedInitialRevealKey: null,
  observedInitialRevealKey: null,
  batchRevealActiveKey: null,
  batchRevealStartedAtMs: null,
});

const clonePinnedFeatureForRender = (
  markerKey: string,
  feature: Feature<Point, RestaurantFeatureProperties>
): Feature<Point, RestaurantFeatureProperties> => ({
  ...feature,
  id: markerKey,
});

const toFeatureCollectionFromMap = (
  featureByMarkerKey: Map<string, Feature<Point, RestaurantFeatureProperties>>
): FeatureCollection<Point, RestaurantFeatureProperties> => ({
  type: 'FeatureCollection',
  features: Array.from(featureByMarkerKey.entries()).map(([markerKey, feature]) =>
    clonePinnedFeatureForRender(markerKey, feature)
  ),
});

const resolveLaneOpacityAt = (lane: TransitionLane, nowMs: number): number => {
  const elapsed = Math.max(0, nowMs - lane.startedAtMs);
  const progress = clampNumber(elapsed / PIN_FADE_CONFIG.durationMs, 0, 1);
  return lane.startOpacity + (lane.targetOpacity - lane.startOpacity) * progress;
};

const usePinTransitionController = ({
  mapRef,
  pinsSourceCommitEpoch,
  sortedRestaurantMarkers,
  dotRestaurantFeatures,
  pinsRenderKey,
  presentationMapRevealRequestKey,
  presentationDismissEpoch,
  presentationTransitionLoadingMode,
  buildMarkerKey,
  suppressTransitions,
  mapQueryBudget: _mapQueryBudget,
}: {
  mapRef: React.RefObject<MapboxMapRef | null>;
  pinsSourceCommitEpoch: number;
  sortedRestaurantMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  dotRestaurantFeatures: FeatureCollection<Point, RestaurantFeatureProperties> | null | undefined;
  pinsRenderKey: string;
  presentationMapRevealRequestKey: string | null;
  presentationDismissEpoch: number;
  presentationTransitionLoadingMode: 'none' | 'initial_cover' | 'interaction_frost';
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  suppressTransitions: boolean;
  mapQueryBudget: MapQueryBudget | null;
}) => {
  // ---------------------------------------------------------------------------
  // Batch opacity: pure native Mapbox-driven fades.
  //
  // JS sets batchOpacityTarget to 0 or 1 — only twice per batch.
  // iconOpacityTransition / textOpacityTransition on every pin SymbolLayer
  // tell Mapbox to interpolate between old and new evaluated opacity values
  // over PIN_FADE_CONFIG.durationMs at 60fps on the GPU. Zero JS work
  // during the animation.
  //
  // Reveal preroll: on initial reveal, features mount with target=0 in the
  // FIRST commit. We then wait for two fully-rendered Mapbox frames before
  // flipping target=1. This guarantees a committed 0-opacity preroll paint
  // and prevents 0/1 coalescing snaps on initial mount.
  // ---------------------------------------------------------------------------
  const [batchOpacityTarget, setBatchOpacityTarget] = React.useState<0 | 1>(
    presentationTransitionLoadingMode !== 'none' ? 0 : 1
  );
  const batchOpacityTargetRef = React.useRef<0 | 1>(batchOpacityTarget);
  const initialBatchPhase: BatchTransitionPhase =
    presentationTransitionLoadingMode !== 'none' ? 'dismissing' : 'idle';
  const batchPhaseRef = React.useRef<BatchTransitionPhase>(initialBatchPhase);
  const [batchPhase, setBatchPhase] = React.useState<BatchTransitionPhase>(initialBatchPhase);
  const pendingRevealFlipKeyRef = React.useRef<string | null>(null);

  const commitBatchPhase = React.useCallback((nextPhase: BatchTransitionPhase) => {
    const prevPhase = batchPhaseRef.current;
    if (prevPhase === nextPhase) {
      return;
    }
    logRevealDeadlockDiag('batchPhase:transition', {
      from: prevPhase,
      to: nextPhase,
    });
    batchPhaseRef.current = nextPhase;
    setBatchPhase(nextPhase);
  }, []);

  // Dismiss snapshot: features captured when dismiss starts, kept in the source
  // so Mapbox can fade them out via layer-level opacity. Cleared on reveal.
  const dismissSnapshotFeaturesRef = React.useRef<
    Array<Feature<Point, RestaurantFeatureProperties>>
  >([]);

  // Transition lifecycle is event/timer-driven (no per-frame JS animation loop).
  const [transitionRenderVersion, forceTransitionRender] = React.useReducer(
    (x: number) => x + 1,
    0
  );
  const laneFlipHandleByLaneIdRef = React.useRef<
    Map<string, { first: number | ReturnType<typeof setTimeout>; second?: number | ReturnType<typeof setTimeout> }>
  >(new Map());
  const laneSettleTimeoutByLaneIdRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const batchRevealSettleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchRevealSettleTokenRef = React.useRef<string | null>(null);

  const stateRef = React.useRef<PinTransitionState>(createPinTransitionState());
  const state = stateRef.current;
  const isMarkerDataHeld = isPinsRenderKeyHeld(pinsRenderKey);
  const prerollFullFrameAcksRemainingRef = React.useRef(0);
  const revealFrameSequenceRef = React.useRef(0);
  const prerollArmedPinsSourceEpochRef = React.useRef(0);
  const revealPrerollBlockDiagRef = React.useRef<{ signature: string | null; atMs: number }>({
    signature: null,
    atMs: 0,
  });
  const prerollProbeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const prerollProbeInFlightRef = React.useRef(false);
  const prerollProbeLastLogRef = React.useRef<{ signature: string | null; atMs: number }>({
    signature: null,
    atMs: 0,
  });
  const revealFrameDiagRef = React.useRef({
    activeRevealKey: null as string | null,
    startedAtMs: 0,
    rawFrameCount: 0,
    fullyFrameCount: 0,
    handleCalls: 0,
    lastRawFrameAtMs: 0,
    lastFullyFrameAtMs: 0,
    lastHandleCallAtMs: 0,
  });
  const revealPrerollWatchdogIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const lodDiagLastPromoteMutationSignatureRef = React.useRef<string | null>(null);
  const lodDiagLastPromoteCompositionSignatureRef = React.useRef<string | null>(null);
  const nextPinnedFeatureByMarkerKey = React.useMemo(() => {
    const next = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
    sortedRestaurantMarkers.forEach((feature, index) => {
      const markerKey = buildMarkerKey(feature);
      const labelOrder = index + 1;
      next.set(markerKey, {
        ...feature,
        id: markerKey,
        properties: {
          ...feature.properties,
          labelOrder,
        },
      });
    });
    return next;
  }, [buildMarkerKey, sortedRestaurantMarkers]);

  const rebuildVisiblePinnedFeatureMap = React.useCallback(() => {
    const next = new Map(state.steadyPinnedFeatureByMarkerKey);
    state.transitionLaneById.forEach((lane) => {
      lane.featuresByMarkerKey.forEach((feature, markerKey) => {
        next.set(markerKey, feature);
      });
    });
    state.latestVisiblePinnedFeatureByMarkerKey = next;
  }, [forceTransitionRender, state]);

  const clearLaneFlipHandle = React.useCallback((laneId: string) => {
    const handle = laneFlipHandleByLaneIdRef.current.get(laneId);
    if (handle == null) {
      return;
    }
    if (typeof handle.first === 'number' && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(handle.first);
    } else {
      clearTimeout(handle.first as ReturnType<typeof setTimeout>);
    }
    if (handle.second != null) {
      if (typeof handle.second === 'number' && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle.second);
      } else {
        clearTimeout(handle.second as ReturnType<typeof setTimeout>);
      }
    }
    laneFlipHandleByLaneIdRef.current.delete(laneId);
  }, []);

  const clearLaneSettleTimeout = React.useCallback((laneId: string) => {
    const timeout = laneSettleTimeoutByLaneIdRef.current.get(laneId);
    if (timeout == null) {
      return;
    }
    clearTimeout(timeout);
    laneSettleTimeoutByLaneIdRef.current.delete(laneId);
  }, []);

  const retireLane = React.useCallback(
    (laneId: string) => {
      const lane = state.transitionLaneById.get(laneId);
      clearLaneFlipHandle(laneId);
      clearLaneSettleTimeout(laneId);
      if (lane != null) {
        lane.markerKeys.forEach((markerKey) => {
          if (state.markerToLaneId.get(markerKey) === laneId) {
            state.markerToLaneId.delete(markerKey);
          }
        });
      }
      state.transitionLaneById.delete(laneId);
    },
    [clearLaneFlipHandle, clearLaneSettleTimeout, state]
  );

  const scheduleLaneFlip = React.useCallback(
    (laneId: string) => {
      clearLaneFlipHandle(laneId);
      const runFlip = () => {
        laneFlipHandleByLaneIdRef.current.delete(laneId);
        const lane = state.transitionLaneById.get(laneId);
        if (lane == null || lane.state !== 'staged') {
          return;
        }
        if (lane.direction === 'promote') {
          // Promote flips are gated by fully-rendered frame acknowledgements.
          return;
        }
        lane.state = 'flipped';
        lane.opacityTarget = lane.targetOpacity;
        forceTransitionRender();
      };

      if (typeof requestAnimationFrame === 'function') {
        const first = requestAnimationFrame(() => {
          const second = requestAnimationFrame(() => {
            runFlip();
          });
          laneFlipHandleByLaneIdRef.current.set(laneId, { first, second });
        });
        laneFlipHandleByLaneIdRef.current.set(laneId, { first });
        return;
      }

      const timeout = setTimeout(runFlip, 16);
      laneFlipHandleByLaneIdRef.current.set(laneId, { first: timeout });
    },
    [clearLaneFlipHandle, state]
  );

  const advancePromoteLaneFlipsOnFullFrame = React.useCallback(() => {
    let didFlip = false;
    const nowMs = getNowMs();

    state.transitionLaneById.forEach((lane) => {
      if (lane.direction !== 'promote' || lane.state !== 'staged') {
        return;
      }

      const remainingBefore = lane.flipAcksRemaining;
      if (remainingBefore > 0) {
        lane.flipAcksRemaining = remainingBefore - 1;
        lane.flipAcksObserved += 1;
        logLodDiag('promote:ack', {
          laneId: lane.laneId,
          phase: batchPhaseRef.current,
          markerCount: lane.markerKeys.size,
          remainingBefore,
          remainingAfter: lane.flipAcksRemaining,
          observed: lane.flipAcksObserved,
          required: lane.flipAcksRequired,
          ageMs: Math.max(0, Math.round(nowMs - lane.startedAtMs)),
          sampleMarkers: sampleMarkerKeys(lane.markerKeys),
        });
        if (lane.flipAcksRemaining > 0) {
          return;
        }
      }

      lane.state = 'flipped';
      lane.opacityTarget = lane.targetOpacity;

      let steadyOverlapCount = 0;
      let desiredMissingCount = 0;
      lane.markerKeys.forEach((markerKey) => {
        if (state.steadyPinnedFeatureByMarkerKey.has(markerKey)) {
          steadyOverlapCount += 1;
        }
        if (!state.latestDesiredPinnedFeatureByMarkerKey.has(markerKey)) {
          desiredMissingCount += 1;
        }
      });
      logLodDiag('promote:flip', {
        laneId: lane.laneId,
        markerCount: lane.markerKeys.size,
        phase: batchPhaseRef.current,
        ageMs: Math.max(0, Math.round(nowMs - lane.startedAtMs)),
        startOpacity: lane.startOpacity,
        targetOpacity: lane.targetOpacity,
        opacityTarget: lane.opacityTarget,
        steadyOverlapCount,
        desiredMissingCount,
        ackObserved: lane.flipAcksObserved,
        ackRequired: lane.flipAcksRequired,
        sampleMarkers: sampleMarkerKeys(lane.markerKeys),
      });
      didFlip = true;
    });

    if (didFlip) {
      forceTransitionRender();
    }
  }, [state]);

  const scheduleLaneSettle = React.useCallback(
    (laneId: string) => {
      clearLaneSettleTimeout(laneId);
      const lane = state.transitionLaneById.get(laneId);
      if (lane == null) {
        return;
      }
      const delayMs = Math.max(0, lane.expiresAtMs - getNowMs());
      const timeout = setTimeout(() => {
        laneSettleTimeoutByLaneIdRef.current.delete(laneId);
        const liveLane = state.transitionLaneById.get(laneId);
        if (liveLane == null) {
          return;
        }
        liveLane.state = 'settling';
        let committedToSteadyCount = 0;
        if (liveLane.direction === 'promote') {
          liveLane.markerKeys.forEach((markerKey) => {
            const desired = state.latestDesiredPinnedFeatureByMarkerKey.get(markerKey);
            if (desired != null) {
              state.steadyPinnedFeatureByMarkerKey.set(markerKey, desired);
              committedToSteadyCount += 1;
            }
          });
        } else {
          liveLane.markerKeys.forEach((markerKey) => {
            state.steadyPinnedFeatureByMarkerKey.delete(markerKey);
          });
        }
        retireLane(laneId);
        rebuildVisiblePinnedFeatureMap();
        if (liveLane.direction === 'promote') {
          logLodDiag('promote:settle', {
            laneId,
            markerCount: liveLane.markerKeys.size,
            ageMs: Math.max(0, Math.round(getNowMs() - liveLane.startedAtMs)),
            committedToSteadyCount,
            droppedBeforeSettleCount: Math.max(0, liveLane.markerKeys.size - committedToSteadyCount),
            steadyCountAfterSettle: state.steadyPinnedFeatureByMarkerKey.size,
            sampleMarkers: sampleMarkerKeys(liveLane.markerKeys),
          });
        }
        forceTransitionRender();
      }, delayMs + 1);
      laneSettleTimeoutByLaneIdRef.current.set(laneId, timeout);
    },
    [clearLaneSettleTimeout, rebuildVisiblePinnedFeatureMap, retireLane, state]
  );

  const createLane = React.useCallback(
    ({
      direction,
      markerFeatures,
      startOpacity,
      nowMs,
    }: {
      direction: PinTransitionKind;
      markerFeatures: Array<{ markerKey: string; feature: Feature<Point, RestaurantFeatureProperties> }>;
      startOpacity: number;
      nowMs: number;
    }) => {
      if (markerFeatures.length === 0) {
        return;
      }
      const laneId = `lod-lane-${state.nextLaneOrdinal + 1}`;
      state.nextLaneOrdinal += 1;
      const featuresByMarkerKey = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
      const markerKeys = new Set<string>();
      let existingLaneAssignmentCount = 0;
      const existingLaneAssignmentIds = new Set<string>();
      markerFeatures.forEach(({ markerKey, feature }) => {
        const existingLaneId = state.markerToLaneId.get(markerKey);
        if (existingLaneId != null) {
          existingLaneAssignmentCount += 1;
          existingLaneAssignmentIds.add(existingLaneId);
        }
        featuresByMarkerKey.set(markerKey, feature);
        markerKeys.add(markerKey);
        state.markerToLaneId.set(markerKey, laneId);
      });
      const lane: TransitionLane = {
        laneId,
        direction,
        startedAtMs: nowMs,
        expiresAtMs: nowMs + PIN_FADE_CONFIG.durationMs,
        startOpacity,
        targetOpacity: direction === 'promote' ? 1 : 0,
        opacityTarget: startOpacity,
        state: 'staged',
        flipAcksRequired:
          direction === 'promote' ? LOD_PROMOTE_FULL_FRAME_ACKS_REQUIRED : 0,
        flipAcksRemaining:
          direction === 'promote' ? LOD_PROMOTE_FULL_FRAME_ACKS_REQUIRED : 0,
        flipAcksObserved: 0,
        markerKeys,
        featuresByMarkerKey,
      };
      state.transitionLaneById.set(laneId, lane);
      if (direction === 'promote') {
        let steadyOverlapCount = 0;
        markerKeys.forEach((markerKey) => {
          if (state.steadyPinnedFeatureByMarkerKey.has(markerKey)) {
            steadyOverlapCount += 1;
          }
        });
        logLodDiag('promote:create', {
          laneId,
          markerCount: markerFeatures.length,
          startOpacity,
          targetOpacity: lane.targetOpacity,
          ackRequired: lane.flipAcksRequired,
          steadyCountAtCreate: state.steadyPinnedFeatureByMarkerKey.size,
          steadyOverlapCount,
          existingLaneAssignmentCount,
          existingLaneIds: sampleMarkerKeys(existingLaneAssignmentIds),
          sampleMarkers: sampleMarkerKeys(markerKeys),
        });
      }
      if (direction === 'demote') {
        scheduleLaneFlip(laneId);
      }
      scheduleLaneSettle(laneId);
      forceTransitionRender();
    },
    [scheduleLaneFlip, scheduleLaneSettle, state]
  );
  React.useLayoutEffect(() => {
    if (
      presentationMapRevealRequestKey != null &&
      state.observedInitialRevealKey !== presentationMapRevealRequestKey
    ) {
      state.observedInitialRevealKey = presentationMapRevealRequestKey;
      state.pendingInitialRevealKey = presentationMapRevealRequestKey;
    }
    if (presentationMapRevealRequestKey == null && state.observedInitialRevealKey != null) {
      state.observedInitialRevealKey = null;
      if (
        state.pendingInitialRevealKey != null &&
        state.pendingInitialRevealKey !== state.appliedInitialRevealKey
      ) {
        state.pendingInitialRevealKey = null;
      }
    }
  }, [presentationMapRevealRequestKey, state]);

  // Session mismatch handling for preroll ownership.
  React.useLayoutEffect(() => {
    if (
      pendingRevealFlipKeyRef.current == null ||
      presentationMapRevealRequestKey === pendingRevealFlipKeyRef.current
    ) {
      return;
    }
    pendingRevealFlipKeyRef.current = null;
    prerollFullFrameAcksRemainingRef.current = 0;
    state.batchRevealActiveKey = null;
    state.batchRevealStartedAtMs = null;
    dismissSnapshotFeaturesRef.current = [];
    const nextPhase: BatchTransitionPhase =
      presentationTransitionLoadingMode !== 'none' ? 'dismissing' : 'idle';
    commitBatchPhase(nextPhase);
    const nextTarget: 0 | 1 = presentationTransitionLoadingMode !== 'none' ? 0 : 1;
    if (batchOpacityTargetRef.current !== nextTarget) {
      batchOpacityTargetRef.current = nextTarget;
      setBatchOpacityTarget(nextTarget);
    }
  }, [
    commitBatchPhase,
    presentationMapRevealRequestKey,
    presentationTransitionLoadingMode,
    state,
  ]);

  // Combined dismiss + loading-mode sync effect.
  // Merges epoch-change snapshot capture and loading-mode enter/exit into one
  // layout effect so that when both fields change atomically (e.g. initial cover
  // via enterTransitionMode), SearchMap renders once instead of twice.
  const prevDismissEpochRef = React.useRef(presentationDismissEpoch);
  const prevLoadingModeRef = React.useRef(presentationTransitionLoadingMode);
  React.useLayoutEffect(() => {
    const epochChanged = presentationDismissEpoch !== prevDismissEpochRef.current;
    const prevMode = prevLoadingModeRef.current;
    const enteredLoading = prevMode === 'none' && presentationTransitionLoadingMode !== 'none';
    const shouldDismissFromLoadingEnter =
      enteredLoading && presentationTransitionLoadingMode !== 'interaction_frost';
    const exitedLoading = prevMode !== 'none' && presentationTransitionLoadingMode === 'none';

    prevDismissEpochRef.current = presentationDismissEpoch;
    prevLoadingModeRef.current = presentationTransitionLoadingMode;

    // Dismiss snapshot: capture BEFORE overwriting state.
    if (epochChanged && state.latestVisiblePinnedFeatureByMarkerKey.size > 0) {
      dismissSnapshotFeaturesRef.current = Array.from(
        state.latestVisiblePinnedFeatureByMarkerKey.entries()
      ).map(([markerKey, feature]) => ({
        ...feature,
        id: markerKey,
      }));
      pendingRevealFlipKeyRef.current = null;
    }

    // Clear pending reveal on loading mode enter (previously in separate effect).
    if (enteredLoading) {
      pendingRevealFlipKeyRef.current = null;
    }

    // For interaction_frost, dismiss starts from epoch (deferred tick) to keep
    // feedback commit light. Non-toggle loading modes still dismiss on entry.
    if ((epochChanged || shouldDismissFromLoadingEnter) && batchOpacityTargetRef.current !== 0) {
      commitBatchPhase('dismissing');
      batchOpacityTargetRef.current = 0;
      setBatchOpacityTarget(0);
    } else if (epochChanged || shouldDismissFromLoadingEnter) {
      // Epoch or loading mode changed but target already 0 — still update phase.
      commitBatchPhase('dismissing');
    }

    // Exit loading: transition to idle if no pending reveal.
    if (
      exitedLoading &&
      batchPhaseRef.current === 'dismissing' &&
      pendingRevealFlipKeyRef.current == null &&
      state.batchRevealActiveKey == null
    ) {
      commitBatchPhase('idle');
    }
  }, [commitBatchPhase, presentationDismissEpoch, presentationTransitionLoadingMode, state]);

  // Event-style LOD reconciliation effect (no render-time mutation).
  React.useLayoutEffect(() => {
    const now = getNowMs();
    let didMutateTransitions = false;
    let clearedAllForSuppress = false;
    let clearedAllForInitialReveal = false;
    let addedPromoteCount = 0;
    let addedDemoteCount = 0;
    let removedPromoteCount = 0;
    let removedDemoteCount = 0;
    let retargetedToPromoteCount = 0;
    let retargetedToDemoteCount = 0;

    state.latestDesiredPinnedFeatureByMarkerKey = nextPinnedFeatureByMarkerKey;

    const clearAllLanes = () => {
      const laneIds = Array.from(state.transitionLaneById.keys());
      laneIds.forEach((laneId) => retireLane(laneId));
    };

    if (suppressTransitions) {
      if (state.transitionLaneById.size > 0 || state.markerToLaneId.size > 0) {
        clearAllLanes();
        didMutateTransitions = true;
      }
      state.steadyPinnedFeatureByMarkerKey = new Map(nextPinnedFeatureByMarkerKey);
      rebuildVisiblePinnedFeatureMap();
      clearedAllForSuppress = true;
      state.pendingInitialRevealKey = null;
      state.batchRevealActiveKey = null;
      state.batchRevealStartedAtMs = null;
      pendingRevealFlipKeyRef.current = null;
      const nextPhase: BatchTransitionPhase =
        presentationTransitionLoadingMode !== 'none' ? 'dismissing' : 'idle';
      commitBatchPhase(nextPhase);
      const nextTarget: 0 | 1 = presentationTransitionLoadingMode !== 'none' ? 0 : 1;
      if (batchOpacityTargetRef.current !== nextTarget) {
        batchOpacityTargetRef.current = nextTarget;
        setBatchOpacityTarget(nextTarget);
      }
      if (presentationMapRevealRequestKey != null) {
        state.appliedInitialRevealKey = presentationMapRevealRequestKey;
      }
      state.latestDesiredPinnedFeatureByMarkerKey = nextPinnedFeatureByMarkerKey;
    } else {
      const shouldRunInitialReveal =
        state.pendingInitialRevealKey != null &&
        state.pendingInitialRevealKey !== state.appliedInitialRevealKey &&
        !isMarkerDataHeld &&
        nextPinnedFeatureByMarkerKey.size > 0;
      if (shouldRunInitialReveal) {
        state.appliedInitialRevealKey = state.pendingInitialRevealKey;
        state.pendingInitialRevealKey = null;
        if (state.transitionLaneById.size > 0 || state.markerToLaneId.size > 0) {
          clearAllLanes();
          didMutateTransitions = true;
        }
        state.steadyPinnedFeatureByMarkerKey = new Map(nextPinnedFeatureByMarkerKey);
        rebuildVisiblePinnedFeatureMap();
        clearedAllForInitialReveal = true;
        state.batchRevealActiveKey = null;
        state.batchRevealStartedAtMs = null;
        pendingRevealFlipKeyRef.current = state.appliedInitialRevealKey;
        prerollFullFrameAcksRemainingRef.current = PREROLL_FULL_FRAME_ACKS_REQUIRED;
        revealFrameSequenceRef.current = 0;
        revealFrameDiagRef.current = {
          activeRevealKey: state.appliedInitialRevealKey,
          startedAtMs: getNowMs(),
          rawFrameCount: 0,
          fullyFrameCount: 0,
          handleCalls: 0,
          lastRawFrameAtMs: 0,
          lastFullyFrameAtMs: 0,
          lastHandleCallAtMs: 0,
        };
        dismissSnapshotFeaturesRef.current = [];
        logRevealDeadlockDiag('preroll:arm', {
          revealKey: state.appliedInitialRevealKey,
          markerCount: nextPinnedFeatureByMarkerKey.size,
          loadingMode: presentationTransitionLoadingMode,
          batchPhaseBefore: batchPhaseRef.current,
          acksRequired: PREROLL_FULL_FRAME_ACKS_REQUIRED,
          armedPinsSourceEpoch: pinsSourceCommitEpoch,
        });
        prerollArmedPinsSourceEpochRef.current = pinsSourceCommitEpoch;
        commitBatchPhase('preroll_wait_frame');
        if (batchOpacityTargetRef.current !== 0) {
          batchOpacityTargetRef.current = 0;
          setBatchOpacityTarget(0);
        }
      } else {
        if (
          presentationTransitionLoadingMode === 'none' &&
          state.pendingInitialRevealKey != null &&
          state.pendingInitialRevealKey !== state.appliedInitialRevealKey &&
          !isMarkerDataHeld &&
          nextPinnedFeatureByMarkerKey.size === 0
        ) {
          state.appliedInitialRevealKey = state.pendingInitialRevealKey;
          state.pendingInitialRevealKey = null;
        }

        if (presentationTransitionLoadingMode === 'none') {
          state.steadyPinnedFeatureByMarkerKey.forEach((_, markerKey) => {
            const nextFeature = nextPinnedFeatureByMarkerKey.get(markerKey);
            if (nextFeature) {
              state.steadyPinnedFeatureByMarkerKey.set(markerKey, nextFeature);
            }
          });

          const retargetPromoteEntries: Array<{
            markerKey: string;
            feature: Feature<Point, RestaurantFeatureProperties>;
            startOpacity: number;
          }> = [];
          const retargetDemoteEntries: Array<{
            markerKey: string;
            feature: Feature<Point, RestaurantFeatureProperties>;
            startOpacity: number;
          }> = [];

          Array.from(state.markerToLaneId.entries()).forEach(([markerKey, laneId]) => {
            const lane = state.transitionLaneById.get(laneId);
            if (lane == null) {
              state.markerToLaneId.delete(markerKey);
              return;
            }
            const nextFeature = nextPinnedFeatureByMarkerKey.get(markerKey);
            if (lane.direction === 'promote') {
              if (nextFeature) {
                lane.featuresByMarkerKey.set(markerKey, nextFeature);
                return;
              }
              const currentOpacity = resolveLaneOpacityAt(lane, now);
              const feature = lane.featuresByMarkerKey.get(markerKey);
              lane.markerKeys.delete(markerKey);
              lane.featuresByMarkerKey.delete(markerKey);
              state.markerToLaneId.delete(markerKey);
              removedPromoteCount += 1;
              if (lane.markerKeys.size === 0) {
                retireLane(laneId);
              }
              if (feature) {
                retargetDemoteEntries.push({
                  markerKey,
                  feature,
                  startOpacity: currentOpacity,
                });
                retargetedToDemoteCount += 1;
              }
              didMutateTransitions = true;
              return;
            }

            if (!nextFeature) {
              return;
            }
            const currentOpacity = resolveLaneOpacityAt(lane, now);
            lane.markerKeys.delete(markerKey);
            lane.featuresByMarkerKey.delete(markerKey);
            state.markerToLaneId.delete(markerKey);
            removedDemoteCount += 1;
            if (lane.markerKeys.size === 0) {
              retireLane(laneId);
            }
            retargetPromoteEntries.push({
              markerKey,
              feature: nextFeature,
              startOpacity: currentOpacity,
            });
            retargetedToPromoteCount += 1;
            didMutateTransitions = true;
          });

          const promoteEntries: Array<{
            markerKey: string;
            feature: Feature<Point, RestaurantFeatureProperties>;
          }> = [];
          const demoteEntries: Array<{
            markerKey: string;
            feature: Feature<Point, RestaurantFeatureProperties>;
          }> = [];

          nextPinnedFeatureByMarkerKey.forEach((feature, markerKey) => {
            if (
              state.steadyPinnedFeatureByMarkerKey.has(markerKey) ||
              state.markerToLaneId.has(markerKey)
            ) {
              return;
            }
            promoteEntries.push({ markerKey, feature });
            addedPromoteCount += 1;
          });

          Array.from(state.steadyPinnedFeatureByMarkerKey.entries()).forEach(
            ([markerKey, feature]) => {
              if (
                nextPinnedFeatureByMarkerKey.has(markerKey) ||
                state.markerToLaneId.has(markerKey)
              ) {
                return;
              }
              state.steadyPinnedFeatureByMarkerKey.delete(markerKey);
              demoteEntries.push({ markerKey, feature });
              addedDemoteCount += 1;
            }
          );

          if (promoteEntries.length > 0) {
            createLane({
              direction: 'promote',
              markerFeatures: promoteEntries,
              startOpacity: 0,
              nowMs: now,
            });
            didMutateTransitions = true;
          }
          if (demoteEntries.length > 0) {
            createLane({
              direction: 'demote',
              markerFeatures: demoteEntries,
              startOpacity: 1,
              nowMs: now,
            });
            didMutateTransitions = true;
          }

          retargetPromoteEntries.forEach((entry) => {
            createLane({
              direction: 'promote',
              markerFeatures: [{ markerKey: entry.markerKey, feature: entry.feature }],
              startOpacity: entry.startOpacity,
              nowMs: now,
            });
          });
          retargetDemoteEntries.forEach((entry) => {
            createLane({
              direction: 'demote',
              markerFeatures: [{ markerKey: entry.markerKey, feature: entry.feature }],
              startOpacity: entry.startOpacity,
              nowMs: now,
            });
          });
        } else {
          if (state.transitionLaneById.size > 0 || state.markerToLaneId.size > 0) {
            clearAllLanes();
            didMutateTransitions = true;
          }
          state.steadyPinnedFeatureByMarkerKey = new Map(nextPinnedFeatureByMarkerKey);
        }
      }
      rebuildVisiblePinnedFeatureMap();
    }

    if (didMutateTransitions && ENABLE_LOD_DIAG) {
      const promoteLaneCount = Array.from(state.transitionLaneById.values()).reduce(
        (count, lane) => count + (lane.direction === 'promote' ? 1 : 0),
        0
      );
      const promoteMarkerCount = Array.from(state.transitionLaneById.values()).reduce(
        (count, lane) => count + (lane.direction === 'promote' ? lane.markerKeys.size : 0),
        0
      );
      const mutationSignature = [
        `addedPromote:${addedPromoteCount}`,
        `retargetPromote:${retargetedToPromoteCount}`,
        `removedPromote:${removedPromoteCount}`,
        `promoteLanes:${promoteLaneCount}`,
        `promoteMarkers:${promoteMarkerCount}`,
        `clearedInit:${clearedAllForInitialReveal ? 1 : 0}`,
        `clearedSuppress:${clearedAllForSuppress ? 1 : 0}`,
        `batch:${batchPhaseRef.current}`,
      ].join('|');
      if (lodDiagLastPromoteMutationSignatureRef.current !== mutationSignature) {
        lodDiagLastPromoteMutationSignatureRef.current = mutationSignature;
        logLodDiag('promote:diff', {
          ts: now,
          loadingMode: presentationTransitionLoadingMode,
          batchPhase: batchPhaseRef.current,
          markerCount: nextPinnedFeatureByMarkerKey.size,
          promoteLaneCount,
          promoteMarkerCount,
          steadyCount: state.steadyPinnedFeatureByMarkerKey.size,
          addedPromoteCount,
          retargetedToPromoteCount,
          removedPromoteCount,
          removedDemoteCount,
          retargetedToDemoteCount,
          addedDemoteCount,
          clearedAllForSuppress,
          clearedAllForInitialReveal,
          revealRequestKey: presentationMapRevealRequestKey,
          pendingRevealFlipKey: pendingRevealFlipKeyRef.current,
        });
      }
    }
    if (didMutateTransitions) {
      forceTransitionRender();
    }
  }, [
    commitBatchPhase,
    createLane,
    isMarkerDataHeld,
    nextPinnedFeatureByMarkerKey,
    presentationMapRevealRequestKey,
    presentationTransitionLoadingMode,
    rebuildVisiblePinnedFeatureMap,
    retireLane,
    state,
    suppressTransitions,
  ]);

  // Loading mode sync was merged into the combined dismiss + loading-mode
  // effect above (prevLoadingModeRef is shared).

  React.useLayoutEffect(() => {
    const revealKey = state.batchRevealActiveKey;
    const startedAtMs = state.batchRevealStartedAtMs;
    if (revealKey == null || startedAtMs == null) {
      if (batchRevealSettleTimeoutRef.current != null) {
        clearTimeout(batchRevealSettleTimeoutRef.current);
        batchRevealSettleTimeoutRef.current = null;
      }
      batchRevealSettleTokenRef.current = null;
      return;
    }

    const settleToken = `${revealKey}:${startedAtMs}`;
    if (batchRevealSettleTokenRef.current === settleToken) {
      return;
    }
    if (batchRevealSettleTimeoutRef.current != null) {
      clearTimeout(batchRevealSettleTimeoutRef.current);
      batchRevealSettleTimeoutRef.current = null;
    }
    batchRevealSettleTokenRef.current = settleToken;

    const delayMs = Math.max(0, startedAtMs + PIN_FADE_CONFIG.durationMs - getNowMs());
    batchRevealSettleTimeoutRef.current = setTimeout(() => {
      if (
        state.batchRevealActiveKey !== revealKey ||
        state.batchRevealStartedAtMs !== startedAtMs
      ) {
        return;
      }
      state.batchRevealActiveKey = null;
      state.batchRevealStartedAtMs = null;
      if (batchPhaseRef.current === 'revealing') {
        commitBatchPhase('idle');
      }
      forceTransitionRender();
    }, delayMs);
  });

  React.useEffect(() => {
    return () => {
      if (batchRevealSettleTimeoutRef.current != null) {
        clearTimeout(batchRevealSettleTimeoutRef.current);
        batchRevealSettleTimeoutRef.current = null;
      }
      batchRevealSettleTokenRef.current = null;
      Array.from(state.transitionLaneById.keys()).forEach((laneId) => retireLane(laneId));
      state.steadyPinnedFeatureByMarkerKey.clear();
      state.latestDesiredPinnedFeatureByMarkerKey.clear();
      state.latestVisiblePinnedFeatureByMarkerKey.clear();
      state.markerToLaneId.clear();
      state.pendingInitialRevealKey = null;
      state.appliedInitialRevealKey = null;
      state.observedInitialRevealKey = null;
      state.batchRevealActiveKey = null;
      state.batchRevealStartedAtMs = null;
      pendingRevealFlipKeyRef.current = null;
      prerollFullFrameAcksRemainingRef.current = 0;
      batchPhaseRef.current = 'idle';
    };
  }, [retireLane, state]);

  const transitionPinLanes = React.useMemo<TransitionLaneRenderModel[]>(() => {
    return Array.from(state.transitionLaneById.values())
      .sort((left, right) => left.startedAtMs - right.startedAtMs)
      .map((lane) => ({
        laneId: lane.laneId,
        direction: lane.direction,
        opacityTarget: lane.opacityTarget,
        state: lane.state,
        pinFeatures: toFeatureCollectionFromMap(lane.featuresByMarkerKey),
      }));
  }, [state, transitionRenderVersion]);

  const steadyPinFeatures = React.useMemo<FeatureCollection<Point, RestaurantFeatureProperties>>(
    () => toFeatureCollectionFromMap(state.steadyPinnedFeatureByMarkerKey),
    [state, transitionRenderVersion]
  );

  const demotingRestaurantIdList = React.useMemo(() => {
    const restaurantIds = new Set<string>();
    transitionPinLanes.forEach((lane) => {
      if (lane.direction !== 'demote') {
        return;
      }
      lane.pinFeatures.features.forEach((feature) => {
        restaurantIds.add(feature.properties.restaurantId);
      });
    });
    if (restaurantIds.size === 0) return EMPTY_DEMOTION_LIST;
    return Array.from(restaurantIds);
  }, [transitionPinLanes]);

  const hasPendingPromotions = false;
  const hasStartedPromotions = React.useMemo(
    () =>
      state.batchRevealActiveKey != null ||
      transitionPinLanes.some((lane) => lane.direction === 'promote'),
    [state.batchRevealActiveKey, transitionPinLanes]
  );

  const dismissSnapshot = dismissSnapshotFeaturesRef.current;
  const effectivePinFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const byMarkerKey = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
    steadyPinFeatures.features.forEach((feature) => {
      const markerKey = typeof feature.id === 'string' ? feature.id : buildMarkerKey(feature);
      byMarkerKey.set(markerKey, clonePinnedFeatureForRender(markerKey, feature));
    });
    transitionPinLanes.forEach((lane) => {
      lane.pinFeatures.features.forEach((feature) => {
        const markerKey = typeof feature.id === 'string' ? feature.id : buildMarkerKey(feature);
        byMarkerKey.set(markerKey, clonePinnedFeatureForRender(markerKey, feature));
      });
    });
    dismissSnapshot.forEach((feature) => {
      const markerKey = typeof feature.id === 'string' ? feature.id : buildMarkerKey(feature);
      if (!byMarkerKey.has(markerKey)) {
        byMarkerKey.set(markerKey, clonePinnedFeatureForRender(markerKey, feature));
      }
    });
    return {
      type: 'FeatureCollection',
      features: Array.from(byMarkerKey.values()),
    };
  }, [buildMarkerKey, dismissSnapshot, steadyPinFeatures, transitionPinLanes]);

  React.useEffect(() => {
    if (!ENABLE_LOD_DIAG) {
      return;
    }
    const steadyMarkerKeys = new Set<string>();
    steadyPinFeatures.features.forEach((feature) => {
      const markerKey = typeof feature.id === 'string' ? feature.id : buildMarkerKey(feature);
      steadyMarkerKeys.add(markerKey);
    });

    const promoteMarkerKeys = new Set<string>();
    const demoteMarkerKeys = new Set<string>();
    const promoteLaneSummaries: string[] = [];
    transitionPinLanes.forEach((lane) => {
      if (lane.direction === 'promote') {
        promoteLaneSummaries.push(
          `${lane.laneId}:${lane.state}:${lane.opacityTarget}:${lane.pinFeatures.features.length}`
        );
      }
      lane.pinFeatures.features.forEach((feature) => {
        const markerKey = typeof feature.id === 'string' ? feature.id : buildMarkerKey(feature);
        if (lane.direction === 'promote') {
          promoteMarkerKeys.add(markerKey);
        } else {
          demoteMarkerKeys.add(markerKey);
        }
      });
    });

    let steadyPromoteOverlapCount = 0;
    promoteMarkerKeys.forEach((markerKey) => {
      if (steadyMarkerKeys.has(markerKey)) {
        steadyPromoteOverlapCount += 1;
      }
    });
    let promoteDemoteOverlapCount = 0;
    promoteMarkerKeys.forEach((markerKey) => {
      if (demoteMarkerKeys.has(markerKey)) {
        promoteDemoteOverlapCount += 1;
      }
    });

    const signature = [
      `promoteMarkers:${promoteMarkerKeys.size}`,
      `demoteMarkers:${demoteMarkerKeys.size}`,
      `steady:${steadyMarkerKeys.size}`,
      `steadyPromoteOverlap:${steadyPromoteOverlapCount}`,
      `promoteDemoteOverlap:${promoteDemoteOverlapCount}`,
      `lanes:${promoteLaneSummaries.join(',')}`,
      `batch:${batchPhase}`,
      `batchTarget:${batchOpacityTarget}`,
      `reveal:${state.batchRevealActiveKey ?? 'none'}`,
    ].join('|');
    if (lodDiagLastPromoteCompositionSignatureRef.current === signature) {
      return;
    }
    lodDiagLastPromoteCompositionSignatureRef.current = signature;
    logLodDiag('promote:composition', {
      promoteMarkerCount: promoteMarkerKeys.size,
      demoteMarkerCount: demoteMarkerKeys.size,
      steadyMarkerCount: steadyMarkerKeys.size,
      steadyPromoteOverlapCount,
      promoteDemoteOverlapCount,
      promoteLaneCount: promoteLaneSummaries.length,
      promoteLaneSummaries: promoteLaneSummaries.slice(0, LOD_DIAG_SAMPLE_LIMIT),
      batchPhase,
      batchOpacityTarget,
      batchRevealActiveKey: state.batchRevealActiveKey,
      pendingRevealFlipKey: pendingRevealFlipKeyRef.current,
      pendingInitialRevealKey: state.pendingInitialRevealKey,
      appliedInitialRevealKey: state.appliedInitialRevealKey,
      samplePromoteMarkers: sampleMarkerKeys(promoteMarkerKeys),
      sampleSteadyMarkers: sampleMarkerKeys(steadyMarkerKeys),
    });
  }, [
    batchOpacityTarget,
    batchPhase,
    buildMarkerKey,
    state,
    steadyPinFeatures,
    transitionPinLanes,
  ]);

  // ---------------------------------------------------------------------------
  // Controller-owned dot feature lifecycle.
  // The hook holds the last non-empty dot snapshot so that during dismiss the
  // ShapeSource keeps rendering dots while layer-level opacity fades them out.
  // Without this, dots vanish instantly because the parent clears the feature
  // prop in the same render that triggers the dismiss layout effect.
  // ---------------------------------------------------------------------------
  const heldDotFeaturesRef = React.useRef(dotRestaurantFeatures);
  const [heldDotRenderVersion, forceHeldDotRender] = React.useReducer((x: number) => x + 1, 0);
  const dotsHaveFeatures =
    dotRestaurantFeatures != null && dotRestaurantFeatures.features.length > 0;
  React.useLayoutEffect(() => {
    if (dotsHaveFeatures) {
      if (heldDotFeaturesRef.current !== dotRestaurantFeatures) {
        heldDotFeaturesRef.current = dotRestaurantFeatures;
        forceHeldDotRender();
      }
      return;
    }
    if (batchOpacityTarget === 1 && heldDotFeaturesRef.current != null) {
      heldDotFeaturesRef.current = null;
      forceHeldDotRender();
    }
  }, [batchOpacityTarget, dotRestaurantFeatures, dotsHaveFeatures]);
  void heldDotRenderVersion;
  const dotsAreHeld = !dotsHaveFeatures && heldDotFeaturesRef.current != null;
  const effectiveDotFeatures = dotsAreHeld ? heldDotFeaturesRef.current! : dotRestaurantFeatures;

  const handleMapRenderFrame = React.useCallback(() => {
    const frameNowMs = getNowMs();
    const frameDiag = revealFrameDiagRef.current;
    frameDiag.handleCalls += 1;
    frameDiag.lastHandleCallAtMs = frameNowMs;
    if (batchPhaseRef.current !== 'preroll_wait_frame') {
      return;
    }
    revealFrameSequenceRef.current += 1;
    const revealKey = pendingRevealFlipKeyRef.current;
    if (revealKey == null) {
      const signature = `block:missing_reveal_key:${batchPhaseRef.current}`;
      const nowMs = frameNowMs;
      if (
        revealPrerollBlockDiagRef.current.signature !== signature ||
        nowMs - revealPrerollBlockDiagRef.current.atMs > 250
      ) {
        revealPrerollBlockDiagRef.current = { signature, atMs: nowMs };
        logRevealDeadlockDiag('preroll:block', {
          reason: 'missing_reveal_key',
          frameSeq: revealFrameSequenceRef.current,
          phase: batchPhaseRef.current,
          rawFrameCount: frameDiag.rawFrameCount,
          fullyFrameCount: frameDiag.fullyFrameCount,
          handleCalls: frameDiag.handleCalls,
        });
      }
      return;
    }
    // Require at least one mounted pin in the source before flipping to reveal.
    if (state.latestVisiblePinnedFeatureByMarkerKey.size === 0) {
      const signature = `block:no_visible_pins:${revealKey}`;
      const nowMs = frameNowMs;
      if (
        revealPrerollBlockDiagRef.current.signature !== signature ||
        nowMs - revealPrerollBlockDiagRef.current.atMs > 250
      ) {
        revealPrerollBlockDiagRef.current = { signature, atMs: nowMs };
        logRevealDeadlockDiag('preroll:block', {
          reason: 'no_visible_pins',
          revealKey,
          frameSeq: revealFrameSequenceRef.current,
          visiblePinCount: state.latestVisiblePinnedFeatureByMarkerKey.size,
          rawFrameCount: frameDiag.rawFrameCount,
          fullyFrameCount: frameDiag.fullyFrameCount,
          handleCalls: frameDiag.handleCalls,
        });
      }
      return;
    }
    // Session ownership: only the currently-requested reveal key can flip.
    const activeRevealRequestKey = presentationMapRevealRequestKey;
    if (activeRevealRequestKey !== revealKey) {
      const signature = `block:key_mismatch:${revealKey}:${activeRevealRequestKey ?? 'null'}`;
      const nowMs = frameNowMs;
      if (
        revealPrerollBlockDiagRef.current.signature !== signature ||
        nowMs - revealPrerollBlockDiagRef.current.atMs > 250
      ) {
        revealPrerollBlockDiagRef.current = { signature, atMs: nowMs };
        logRevealDeadlockDiag('preroll:block', {
          reason: 'reveal_key_mismatch',
          revealKey,
          activeRequestKey: activeRevealRequestKey,
          frameSeq: revealFrameSequenceRef.current,
          rawFrameCount: frameDiag.rawFrameCount,
          fullyFrameCount: frameDiag.fullyFrameCount,
          handleCalls: frameDiag.handleCalls,
        });
      }
      return;
    }
    const remainingAcks = prerollFullFrameAcksRemainingRef.current;
    if (remainingAcks > 1) {
      prerollFullFrameAcksRemainingRef.current = remainingAcks - 1;
      logRevealDeadlockDiag('preroll:block', {
        reason: 'awaiting_full_frames',
        revealKey,
        frameSeq: revealFrameSequenceRef.current,
        remainingBefore: remainingAcks,
        remainingAfter: prerollFullFrameAcksRemainingRef.current,
        rawFrameCount: frameDiag.rawFrameCount,
        fullyFrameCount: frameDiag.fullyFrameCount,
        handleCalls: frameDiag.handleCalls,
      });
      return;
    }
    pendingRevealFlipKeyRef.current = null;
    prerollFullFrameAcksRemainingRef.current = 0;
    revealPrerollBlockDiagRef.current = { signature: null, atMs: 0 };
    dismissSnapshotFeaturesRef.current = [];
    state.batchRevealActiveKey = revealKey;
    state.batchRevealStartedAtMs = getNowMs();
    logRevealDeadlockDiag('preroll:flip', {
      revealKey,
      frameSeq: revealFrameSequenceRef.current,
      visiblePinCount: state.latestVisiblePinnedFeatureByMarkerKey.size,
      loadingMode: presentationTransitionLoadingMode,
      rawFrameCount: frameDiag.rawFrameCount,
      fullyFrameCount: frameDiag.fullyFrameCount,
      handleCalls: frameDiag.handleCalls,
    });
    commitBatchPhase('revealing');
    if (batchOpacityTargetRef.current !== 1) {
      batchOpacityTargetRef.current = 1;
      setBatchOpacityTarget(1);
    }
    forceTransitionRender();
  }, [
    commitBatchPhase,
    forceTransitionRender,
    getNowMs,
    presentationMapRevealRequestKey,
    presentationTransitionLoadingMode,
    state,
  ]);

  const clearPrerollProbeLoop = React.useCallback(() => {
    if (prerollProbeTimeoutRef.current != null) {
      clearTimeout(prerollProbeTimeoutRef.current);
      prerollProbeTimeoutRef.current = null;
    }
    prerollProbeInFlightRef.current = false;
  }, []);

  const schedulePrerollProbe = React.useCallback(
    (delayMs: number) => {
      if (prerollProbeTimeoutRef.current != null) {
        clearTimeout(prerollProbeTimeoutRef.current);
      }
      prerollProbeTimeoutRef.current = setTimeout(() => {
        prerollProbeTimeoutRef.current = null;
        if (batchPhaseRef.current !== 'preroll_wait_frame') {
          return;
        }
        const revealKey = pendingRevealFlipKeyRef.current;
        if (revealKey == null) {
          return;
        }
        const visiblePinCount = state.latestVisiblePinnedFeatureByMarkerKey.size;
        if (visiblePinCount === 0) {
          schedulePrerollProbe(34);
          return;
        }
        const armedPinsSourceEpoch = prerollArmedPinsSourceEpochRef.current;
        if (pinsSourceCommitEpoch <= armedPinsSourceEpoch) {
          const signature = `probe:block:awaiting_source_commit:${revealKey}`;
          const nowMs = getNowMs();
          if (
            prerollProbeLastLogRef.current.signature !== signature ||
            nowMs - prerollProbeLastLogRef.current.atMs > 400
          ) {
            prerollProbeLastLogRef.current = { signature, atMs: nowMs };
            logRevealDeadlockDiag('preroll:probe:block', {
              reason: 'awaiting_source_commit',
              revealKey,
              visiblePinCount,
              pinsSourceCommitEpoch,
              armedPinsSourceEpoch,
            });
          }
          schedulePrerollProbe(34);
          return;
        }
        if (prerollProbeInFlightRef.current) {
          schedulePrerollProbe(34);
          return;
        }
        prerollProbeInFlightRef.current = true;
        const mapInstance = mapRef.current;
        const telemetryPromise =
          mapInstance != null &&
          typeof mapInstance.querySourceFeatures === 'function' &&
          typeof mapInstance.queryRenderedFeaturesInRect === 'function'
            ? Promise.allSettled([
                mapInstance.querySourceFeatures(STYLE_PINS_SOURCE_ID),
                mapInstance.querySourceFeatures(PIN_INTERACTION_SOURCE_ID),
                mapInstance.queryRenderedFeaturesInRect([], [], PIN_INTERACTION_LAYER_IDS),
              ])
            : Promise.resolve([]);
        void telemetryPromise
          .then((probeResults) => {
            if (
              batchPhaseRef.current !== 'preroll_wait_frame' ||
              pendingRevealFlipKeyRef.current !== revealKey
            ) {
              return;
            }
            const styleSourceCount =
              probeResults[0]?.status === 'fulfilled'
                ? (probeResults[0].value?.features?.length ?? 0)
                : null;
            const interactionSourceCount =
              probeResults[1]?.status === 'fulfilled'
                ? (probeResults[1].value?.features?.length ?? 0)
                : null;
            const renderedCount =
              probeResults[2]?.status === 'fulfilled'
                ? (probeResults[2].value?.features?.length ?? 0)
                : null;
            prerollProbeLastLogRef.current = { signature: null, atMs: 0 };
            logRevealDeadlockDiag('preroll:probe:confirmed', {
              revealKey,
              visiblePinCount,
              pinsSourceCommitEpoch,
              armedPinsSourceEpoch,
              styleSourceCount,
              interactionSourceCount,
              renderedCount,
            });

            // Ack 1 now, ack 2 on next frame tick to preserve preroll semantics.
            handleMapRenderFrame();
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => {
                handleMapRenderFrame();
              });
            } else {
              setTimeout(() => {
                handleMapRenderFrame();
              }, 16);
            }
          })
          .finally(() => {
            prerollProbeInFlightRef.current = false;
            if (
              batchPhaseRef.current === 'preroll_wait_frame' &&
              pendingRevealFlipKeyRef.current === revealKey
            ) {
              schedulePrerollProbe(34);
            }
          });
      }, delayMs);
    },
    [getNowMs, handleMapRenderFrame, mapRef, pinsSourceCommitEpoch, state]
  );

  React.useEffect(() => {
    const clearWatchdog = () => {
      if (revealPrerollWatchdogIntervalRef.current != null) {
        clearInterval(revealPrerollWatchdogIntervalRef.current);
        revealPrerollWatchdogIntervalRef.current = null;
      }
    };

    if (batchPhase !== 'preroll_wait_frame') {
      clearWatchdog();
      const diag = revealFrameDiagRef.current;
      if (diag.activeRevealKey != null) {
        const nowMs = getNowMs();
        logRevealDeadlockDiag('preroll:watch:end', {
          revealKey: diag.activeRevealKey,
          endPhase: batchPhase,
          elapsedMs: Math.max(0, nowMs - diag.startedAtMs),
          rawFrameCount: diag.rawFrameCount,
          fullyFrameCount: diag.fullyFrameCount,
          handleCalls: diag.handleCalls,
          pendingRevealFlipKey: pendingRevealFlipKeyRef.current,
          visiblePinCount: state.latestVisiblePinnedFeatureByMarkerKey.size,
          acksRemaining: prerollFullFrameAcksRemainingRef.current,
          msSinceLastRawFrame:
            diag.lastRawFrameAtMs > 0 ? Math.max(0, nowMs - diag.lastRawFrameAtMs) : null,
          msSinceLastFullyFrame:
            diag.lastFullyFrameAtMs > 0 ? Math.max(0, nowMs - diag.lastFullyFrameAtMs) : null,
          msSinceLastHandle:
            diag.lastHandleCallAtMs > 0 ? Math.max(0, nowMs - diag.lastHandleCallAtMs) : null,
        });
        diag.activeRevealKey = null;
      }
      return;
    }

    const diag = revealFrameDiagRef.current;
    if (diag.activeRevealKey == null) {
      diag.activeRevealKey = pendingRevealFlipKeyRef.current;
      diag.startedAtMs = getNowMs();
    }
    logRevealDeadlockDiag('preroll:watch:start', {
      revealKey: diag.activeRevealKey,
      acksRemaining: prerollFullFrameAcksRemainingRef.current,
      visiblePinCount: state.latestVisiblePinnedFeatureByMarkerKey.size,
    });

    revealPrerollWatchdogIntervalRef.current = setInterval(() => {
      if (batchPhaseRef.current !== 'preroll_wait_frame') {
        return;
      }
      const nowMs = getNowMs();
      const currentDiag = revealFrameDiagRef.current;
      logRevealDeadlockDiag('preroll:watchdog', {
        revealKey: currentDiag.activeRevealKey,
        elapsedMs: Math.max(0, nowMs - currentDiag.startedAtMs),
        rawFrameCount: currentDiag.rawFrameCount,
        fullyFrameCount: currentDiag.fullyFrameCount,
        handleCalls: currentDiag.handleCalls,
        pendingRevealFlipKey: pendingRevealFlipKeyRef.current,
        visiblePinCount: state.latestVisiblePinnedFeatureByMarkerKey.size,
        acksRemaining: prerollFullFrameAcksRemainingRef.current,
        msSinceLastRawFrame:
          currentDiag.lastRawFrameAtMs > 0
            ? Math.max(0, nowMs - currentDiag.lastRawFrameAtMs)
            : null,
        msSinceLastFullyFrame:
          currentDiag.lastFullyFrameAtMs > 0
            ? Math.max(0, nowMs - currentDiag.lastFullyFrameAtMs)
            : null,
        msSinceLastHandle:
          currentDiag.lastHandleCallAtMs > 0
            ? Math.max(0, nowMs - currentDiag.lastHandleCallAtMs)
            : null,
      });
    }, 400);

    return clearWatchdog;
  }, [batchPhase, getNowMs, state]);

  React.useEffect(() => {
    if (batchPhase !== 'preroll_wait_frame') {
      clearPrerollProbeLoop();
      return;
    }
    logRevealDeadlockDiag('preroll:probe:start', {
      revealKey: pendingRevealFlipKeyRef.current,
      visiblePinCount: state.latestVisiblePinnedFeatureByMarkerKey.size,
      acksRemaining: prerollFullFrameAcksRemainingRef.current,
    });
    schedulePrerollProbe(0);
    return clearPrerollProbeLoop;
  }, [batchPhase, clearPrerollProbeLoop, schedulePrerollProbe, state]);

  const handleDidFinishRenderingFrame = React.useCallback(() => {
    const nowMs = getNowMs();
    const diag = revealFrameDiagRef.current;
    diag.rawFrameCount += 1;
    diag.lastRawFrameAtMs = nowMs;
    if (
      batchPhaseRef.current === 'preroll_wait_frame' &&
      (diag.rawFrameCount <= 3 || diag.rawFrameCount % 10 === 0)
    ) {
      logRevealDeadlockDiag('frame:raw', {
        revealKey: pendingRevealFlipKeyRef.current,
        rawFrameCount: diag.rawFrameCount,
        fullyFrameCount: diag.fullyFrameCount,
        handleCalls: diag.handleCalls,
        acksRemaining: prerollFullFrameAcksRemainingRef.current,
      });
    }
  }, [getNowMs]);

  const handleDidFinishRenderingFrameFully = React.useCallback(() => {
    const nowMs = getNowMs();
    const diag = revealFrameDiagRef.current;
    diag.fullyFrameCount += 1;
    diag.lastFullyFrameAtMs = nowMs;
    advancePromoteLaneFlipsOnFullFrame();

    if (
      batchPhaseRef.current === 'preroll_wait_frame' &&
      (diag.fullyFrameCount <= 3 || diag.fullyFrameCount % 10 === 0)
    ) {
      logRevealDeadlockDiag('frame:fully', {
        revealKey: pendingRevealFlipKeyRef.current,
        rawFrameCount: diag.rawFrameCount,
        fullyFrameCount: diag.fullyFrameCount,
        handleCalls: diag.handleCalls,
        acksRemaining: prerollFullFrameAcksRemainingRef.current,
      });
    }

    if (batchPhase !== 'preroll_wait_frame') {
      if (batchPhaseRef.current === 'preroll_wait_frame') {
        logRevealDeadlockDiag('frame:phase_mismatch', {
          statePhase: batchPhase,
          refPhase: batchPhaseRef.current,
          revealKey: pendingRevealFlipKeyRef.current,
          rawFrameCount: diag.rawFrameCount,
          fullyFrameCount: diag.fullyFrameCount,
          handleCalls: diag.handleCalls,
        });
      }
      return;
    }
    handleMapRenderFrame();
  }, [advancePromoteLaneFlipsOnFullFrame, batchPhase, getNowMs, handleMapRenderFrame]);

  return {
    batchOpacityTarget,
    batchPhase,
    isBatchTransitionActive: batchPhase !== 'idle',
    handleMapRenderFrame,
    handleDidFinishRenderingFrame,
    handleDidFinishRenderingFrameFully,
    pendingRevealCommitKey: pendingRevealFlipKeyRef.current,
    // Controller-owned features: the hook decides what to render and when.
    effectiveDotFeatures,
    dotsAreHeld,
    steadyPinFeatures,
    transitionPinLanes,
    effectivePinFeatures,
    demotingRestaurantIdList,
    hasPendingPromotions,
    hasStartedPromotions,
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
  onMarkerRevealStarted?: (payload: {
    requestKey: string;
    markerRevealCommitId: number | null;
    startedAtMs: number;
  }) => void;
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
  onMarkerRevealStarted,
  onMarkerRevealSettled,
  selectedRestaurantId,
  sortedRestaurantMarkers: incomingSortedRestaurantMarkers,
  dotRestaurantFeatures: incomingDotRestaurantFeatures,
  markersRenderKey: incomingMarkersRenderKey,
  pinsRenderKey: incomingPinsRenderKey,
  buildMarkerKey,
  restaurantFeatures: _restaurantFeatures,
  restaurantLabelStyle,
  isMapStyleReady,
  userLocation,
  locationPulse,
  disableMarkers = false,
  disableBlur = false,
  onProfilerRender,
  mapQueryBudget = null,
  searchRuntimeBus,
  onRuntimeMechanismEvent,
}) => {
  const shouldDisableMarkers = disableMarkers === true;
  const shouldDisableBlur = disableBlur === true;

  const {
    isMapActivationDeferred,
    presentationMapRevealRequestKey,
    presentationDismissEpoch,
    presentationTransitionLoadingMode,
    runOneCommitSpanPressureActive,
  } = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isMapActivationDeferred: state.isMapActivationDeferred,
      presentationMapRevealRequestKey: state.presentationMapRevealRequestKey,
      presentationDismissEpoch: state.presentationDismissEpoch,
      presentationTransitionLoadingMode: state.presentationTransitionLoadingMode,
      runOneCommitSpanPressureActive: state.runOneCommitSpanPressureActive,
    }),
    (left, right) =>
      left.isMapActivationDeferred === right.isMapActivationDeferred &&
      left.presentationMapRevealRequestKey === right.presentationMapRevealRequestKey &&
      left.presentationDismissEpoch === right.presentationDismissEpoch &&
      left.presentationTransitionLoadingMode === right.presentationTransitionLoadingMode &&
      left.runOneCommitSpanPressureActive === right.runOneCommitSpanPressureActive,
    [
      'isMapActivationDeferred',
      'presentationMapRevealRequestKey',
      'presentationDismissEpoch',
      'presentationTransitionLoadingMode',
      'runOneCommitSpanPressureActive',
    ] as const
  );
  const visualReadyRequestKey = presentationMapRevealRequestKey;
  const sortedRestaurantMarkers = incomingSortedRestaurantMarkers;
  const dotRestaurantFeatures = incomingDotRestaurantFeatures;
  const markersRenderKey = incomingMarkersRenderKey;
  const pinsRenderKey = incomingPinsRenderKey;
  const markersTopologyRenderKey = React.useMemo(
    () => markersRenderKey.replace(/^pins:(?:hold::|show::)/, 'pins:'),
    [markersRenderKey]
  );
  const shouldDeferMapFromPressure = isMapActivationDeferred || runOneCommitSpanPressureActive;
  const isMapPinsDeferred = React.useCallback(
    () => shouldDeferMapFromPressure,
    [shouldDeferMapFromPressure]
  );
  const isMapFinalizeDeferred = React.useCallback(
    () => shouldDeferMapFromPressure,
    [shouldDeferMapFromPressure]
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
        if (
          state.activeOperationId !== operationId ||
          state.activeOperationLane !== 'lane_f_polish'
        ) {
          return;
        }
        if (state.presentationMapRevealRequestKey != null || isMapFinalizeDeferred()) {
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
      if (state.presentationMapRevealRequestKey != null || isMapPinsDeferred()) {
        return;
      }
      searchRuntimeBus.publish({
        activeOperationLane: 'lane_f_polish',
      });
      scheduleRelease(operationId);
    };
    maybeAdvancePolishLane();
    const unsubscribe = searchRuntimeBus.subscribe(maybeAdvancePolishLane, [
      'activeOperationId',
      'activeOperationLane',
      'presentationMapRevealRequestKey',
    ]);
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
  const transitionSortedRestaurantMarkers = shouldDisableMarkers
    ? EMPTY_SORTED_RESTAURANT_MARKERS
    : sortedRestaurantMarkers;
  const shouldRenderLabels =
    !shouldDisableMarkers &&
    isMapStyleReady;
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
  const [pinsSourceCommitEpoch, setPinsSourceCommitEpoch] = React.useState(0);
  const pinsSourceCommitSignaledRevealKeyRef = React.useRef<string | null>(null);
  const markerRevealStartedSignaledRequestKeyRef = React.useRef<string | null>(null);
  const markerRevealSettledSignaledRequestKeyRef = React.useRef<string | null>(null);
  const isMapMovingRef = React.useRef(false);
  const {
    batchOpacityTarget,
    batchPhase,
    isBatchTransitionActive,
    handleDidFinishRenderingFrame,
    handleDidFinishRenderingFrameFully,
    pendingRevealCommitKey,
    effectiveDotFeatures,
    dotsAreHeld,
    steadyPinFeatures,
    transitionPinLanes,
    effectivePinFeatures,
    demotingRestaurantIdList,
    hasPendingPromotions,
    hasStartedPromotions,
  } = usePinTransitionController({
    mapRef,
    pinsSourceCommitEpoch,
    sortedRestaurantMarkers: transitionSortedRestaurantMarkers,
    dotRestaurantFeatures,
    pinsRenderKey,
    presentationMapRevealRequestKey,
    presentationDismissEpoch,
    presentationTransitionLoadingMode,
    buildMarkerKey,
    suppressTransitions: false,
    mapQueryBudget,
  });
  React.useLayoutEffect(() => {
    if (!USE_STYLE_LAYER_PINS || shouldDisableMarkers) {
      return;
    }
    if (pendingRevealCommitKey == null) {
      return;
    }
    if (pinsSourceCommitSignaledRevealKeyRef.current === pendingRevealCommitKey) {
      return;
    }
    pinsSourceCommitSignaledRevealKeyRef.current = pendingRevealCommitKey;
    setPinsSourceCommitEpoch((prev) => prev + 1);
    logRevealDeadlockDiag('preroll:source_commit_epoch', {
      revealKey: pendingRevealCommitKey,
      nextEpoch: pinsSourceCommitEpoch + 1,
      batchPhase,
    });
  }, [batchPhase, pendingRevealCommitKey, pinsSourceCommitEpoch, shouldDisableMarkers]);
  // The hook owns the dot feature lifecycle: it holds the last non-empty
  // snapshot during dismiss so dots fade out with layer-level opacity
  // instead of vanishing. shouldRenderDotsOrDismiss extends rendering while held.
  const shouldRenderDotsOrDismiss = shouldRenderDots || dotsAreHeld;
  const lodDiagLastPromoteRenderSignatureRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ENABLE_LOD_DIAG) {
      return;
    }
    const promoteLanes = transitionPinLanes.filter((lane) => lane.direction === 'promote');
    const signature = promoteLanes
      .map((lane) => `${lane.laneId}:${lane.state}:${lane.opacityTarget}:${lane.pinFeatures.features.length}`)
      .join('|');
    if (lodDiagLastPromoteRenderSignatureRef.current === signature) {
      return;
    }
    lodDiagLastPromoteRenderSignatureRef.current = signature;
    if (promoteLanes.length === 0) {
      return;
    }
    logLodDiag('promote:render_state', {
      promoteLaneCount: promoteLanes.length,
      promoteLaneSummaries: promoteLanes
        .slice(0, LOD_DIAG_SAMPLE_LIMIT)
        .map((lane) => `${lane.laneId}:${lane.state}:${lane.opacityTarget}:${lane.pinFeatures.features.length}`),
      steadyPinsCount: steadyPinFeatures.features.length,
      transitionPinsCount: transitionPinLanes.reduce(
        (count, lane) => count + lane.pinFeatures.features.length,
        0
      ),
      effectivePinsCount: effectivePinFeatures.features.length,
      batchPhase,
      batchOpacityTarget,
    });
  }, [
    batchOpacityTarget,
    batchPhase,
    effectivePinFeatures.features.length,
    steadyPinFeatures.features.length,
    transitionPinLanes,
  ]);
  const shouldHidePinnedDots = true;
  const hiddenDotRestaurantIdList = React.useMemo(() => {
    // During batch dismiss, dots fade out via layer-level opacity — don't hide them
    if (batchOpacityTarget === 0) return EMPTY_DEMOTION_LIST;
    const next = new Set<string>();
    if (shouldHidePinnedDots) {
      pinnedRestaurantIdList.forEach((restaurantId) => next.add(restaurantId));
    }
    demotingRestaurantIdList.forEach((restaurantId) => next.add(restaurantId));
    if (next.size === 0) return EMPTY_DEMOTION_LIST;
    return Array.from(next);
  }, [batchOpacityTarget, demotingRestaurantIdList, pinnedRestaurantIdList, shouldHidePinnedDots]);
  // Stabilize the hidden list reference so dotLayerStyle only recreates when
  // the actual set of hidden IDs changes, not on every transition clock tick.
  const hiddenDotListPrevRef = React.useRef(hiddenDotRestaurantIdList);
  const stableHiddenDotRestaurantIdList = React.useMemo(() => {
    const prev = hiddenDotListPrevRef.current;
    const next = hiddenDotRestaurantIdList;
    if (
      prev.length === next.length &&
      (prev.length === 0 || prev.every((id, i) => id === next[i]))
    ) {
      return prev;
    }
    hiddenDotListPrevRef.current = next;
    return next;
  }, [hiddenDotRestaurantIdList]);
  const [optimisticSelectedRestaurantId, setOptimisticSelectedRestaurantId] = React.useState<
    string | null
  >(null);
  const pinPressResolutionSeqRef = React.useRef(0);
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
      textOpacity: [
        '*',
        batchOpacityTarget,
        [
          'case',
          ['in', ['get', 'restaurantId'], ['literal', stableHiddenDotRestaurantIdList]],
          0,
          1,
        ],
      ],
      textOpacityTransition: PIN_OPACITY_TRANSITION,
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
  }, [batchOpacityTarget, effectiveSelectedRestaurantId, stableHiddenDotRestaurantIdList, scoreMode]);
  const [mapViewportSize, setMapViewportSize] = React.useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [visibleLabelFeatureIdList, setVisibleLabelFeatureIdList] = React.useState<string[]>([]);
  const [visibleDotRestaurantIdList, setVisibleDotRestaurantIdList] = React.useState<string[]>([]);
  const dotPinnedKeysRef = React.useRef<Set<string>>(new Set());
  const dotPinnedStateResetKeyRef = React.useRef<string | null>(null);
  const labelStickyRefreshSeqRef = React.useRef(0);
  const labelStickyRefreshTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelStickyRefreshInFlightRef = React.useRef(false);
  const labelStickyRefreshQueuedRef = React.useRef(false);
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
  const pendingPinLayerRemountRef = React.useRef(false);
  const [labelStickyMarkersReadyAt, setLabelStickyMarkersReadyAt] = React.useState<number | null>(
    null
  );
  const labelStickyMarkersReadyKeyRef = React.useRef<string | null>(null);
  const labelStickyResetRequestKeyRef = React.useRef<string | null>(null);
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
      labelStickyResetRequestKeyRef.current = null;
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
    if (!shouldRenderLabels) {
      return;
    }
    if (!visualReadyRequestKey) {
      return;
    }
    if (labelStickyResetRequestKeyRef.current === visualReadyRequestKey) {
      return;
    }
    labelStickyResetRequestKeyRef.current = visualReadyRequestKey;
    labelStickyCandidateByMarkerKeyRef.current.clear();
    labelStickyLastSeenAtByMarkerKeyRef.current.clear();
    labelStickyMissingStreakByMarkerKeyRef.current.clear();
    labelStickyProposedCandidateByMarkerKeyRef.current.clear();
    labelStickyProposedSinceAtByMarkerKeyRef.current.clear();
    setLabelStickyEpoch((value) => value + 1);
  }, [shouldRenderLabels, styleURL, visualReadyRequestKey]);

  // ---------------------------------------------------------------------------
  // Bridge-serialization-optimized sources (Phase 8)
  // Strip unnecessary properties to reduce native bridge payload.
  // ---------------------------------------------------------------------------

  // Collision source — geometry only, no transition-visual properties needed.
  // Use identity tracking to skip rebuilds when only transition visual props change.
  const prevCollisionIdentityRef = React.useRef<string>('');
  const prevCollisionFeaturesRef = React.useRef<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(null);
  const collisionSourceFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const features = effectivePinFeatures.features;
    if (!features.length) {
      prevCollisionIdentityRef.current = '';
      prevCollisionFeaturesRef.current = effectivePinFeatures;
      return effectivePinFeatures;
    }
    // Identity = feature IDs. Only rebuild when the set of features changes,
    // not when transition visual properties (opacity) change mid-tick.
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
        properties: {
          restaurantId: feature.properties.restaurantId,
        } as RestaurantFeatureProperties,
      })),
    };
    prevCollisionFeaturesRef.current = built;
    return built;
  }, [effectivePinFeatures]);

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
    markerCount: effectivePinFeatures.features.length,
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
    if (effectivePinFeatures.features.length > 0) {
      setLabelStickyMarkersReadyAt(Date.now());
    }
  }, [
    labelStickyMarkersReadyAt,
    mapViewportSize.height,
    mapViewportSize.width,
    effectivePinFeatures.features.length,
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
      labelStickyMissingStreakByMarkerKeyRef.current.clear();
      labelStickyProposedCandidateByMarkerKeyRef.current.clear();
      labelStickyProposedSinceAtByMarkerKeyRef.current.clear();
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
  const labelCandidateAppliedStickyEpochRef = React.useRef(-1);
  const previousLabelCandidateCollectionRef = React.useRef<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(null);

  const restaurantLabelCandidateFeaturesWithIds = React.useMemo(() => {
    if (!effectivePinFeatures.features.length) {
      labelMarkerIdentityKeyRef.current = '';
      labelCandidateAppliedStickyEpochRef.current = labelStickyEpoch;
      previousLabelCandidateCollectionRef.current = null;
      return effectivePinFeatures as FeatureCollection<Point, RestaurantFeatureProperties>;
    }

    // Compute marker identity fingerprint (keys + order only)
    let identityKey = '';
    for (const feature of effectivePinFeatures.features) {
      const markerKey = feature.id;
      if (typeof markerKey === 'string' && markerKey.length > 0) {
        identityKey += markerKey + ',';
      }
    }

    // If marker identity hasn't changed and we have a cached result,
    // only rebuild if sticky epoch changed (label position lock changed).
    // While actively moving, avoid full global rebuild churn; instead:
    // - prune stale cached candidates immediately
    // - keep transition props synced
    // - append stable candidates for newly promoted markers only
    const identityChanged = identityKey !== labelMarkerIdentityKeyRef.current;
    const hasCachedResult = previousLabelCandidateCollectionRef.current != null;
    const shouldDeferRebuild = identityChanged && hasCachedResult && isMapMovingRef.current;
    const stickyEpochChanged = labelCandidateAppliedStickyEpochRef.current !== labelStickyEpoch;

    if (!stickyEpochChanged && ((!identityChanged && hasCachedResult) || shouldDeferRebuild)) {
      // Reuse cached label candidates — update transition properties only
      const prevFeatures = previousLabelCandidateCollectionRef.current!.features;
      const srcByKey = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
      const srcByRestaurantId = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
      for (const feature of effectivePinFeatures.features) {
        const markerKey = feature.id;
        if (typeof markerKey === 'string') {
          srcByKey.set(markerKey, feature);
        }
        const restaurantId = feature.properties.restaurantId;
        if (typeof restaurantId === 'string' && restaurantId.length > 0) {
          srcByRestaurantId.set(restaurantId, feature);
        }
      }

      let didChange = false;
      const existingMarkerKeys = new Set<string>();
      const existingRestaurantIds = new Set<string>();
      const updatedFeatures: Array<Feature<Point, RestaurantFeatureProperties>> = [];
      for (const labelFeature of prevFeatures) {
        const srcMarkerKey = labelFeature.properties.markerKey;
        const restaurantId = labelFeature.properties.restaurantId;
        if (!srcMarkerKey) {
          updatedFeatures.push(labelFeature);
          if (typeof restaurantId === 'string' && restaurantId.length > 0) {
            existingRestaurantIds.add(restaurantId);
          }
          continue;
        }
        existingMarkerKeys.add(srcMarkerKey);
        let srcFeature = srcByKey.get(srcMarkerKey);
        // While moving, LOD can churn marker keys for the same restaurant.
        // Keep the existing candidate stable by matching via restaurantId instead
        // of forcing prune/re-add cycles when only the marker key changed.
        if (
          !srcFeature &&
          typeof restaurantId === 'string' &&
          restaurantId.length > 0 &&
          srcByRestaurantId.has(restaurantId)
        ) {
          srcFeature = srcByRestaurantId.get(restaurantId);
          const nextMarkerKey = srcFeature?.id;
          if (typeof nextMarkerKey === 'string' && nextMarkerKey.length > 0) {
            existingMarkerKeys.add(nextMarkerKey);
          }
        }
        // While moving we defer *new* candidate generation, but stale candidates
        // for markers that no longer exist must be pruned immediately.
        if (!srcFeature) {
          didChange = true;
          continue;
        }
        updatedFeatures.push(labelFeature);
        if (typeof restaurantId === 'string' && restaurantId.length > 0) {
          existingRestaurantIds.add(restaurantId);
        }
      }

      // While panning/zooming, newly promoted pins should still get immediate
      // label candidates without forcing a full global rebuild.
      for (const feature of effectivePinFeatures.features) {
        const markerKey = feature.id;
        if (typeof markerKey !== 'string' || markerKey.length === 0) {
          continue;
        }
        if (existingMarkerKeys.has(markerKey)) {
          continue;
        }
        const restaurantId = feature.properties.restaurantId;
        if (
          typeof restaurantId === 'string' &&
          restaurantId.length > 0 &&
          existingRestaurantIds.has(restaurantId)
        ) {
          continue;
        }
        didChange = true;
        const stickyIdentityKey = getLabelStickyIdentityKeyFromFeature(feature);
        const lockedCandidate = ENABLE_STICKY_LABEL_CANDIDATES
          ? stickyIdentityKey
            ? labelStickyCandidateByMarkerKeyRef.current.get(stickyIdentityKey)
            : null
          : null;
        const candidates = lockedCandidate ? [lockedCandidate] : LABEL_CANDIDATES;
        for (const candidate of candidates) {
          updatedFeatures.push({
            ...feature,
            id: buildLabelCandidateFeatureId(markerKey, candidate),
            properties: { ...feature.properties, labelCandidate: candidate, markerKey },
          });
        }
        if (typeof restaurantId === 'string' && restaurantId.length > 0) {
          existingRestaurantIds.add(restaurantId);
        }
      }

      if (!didChange) {
        labelCandidateAppliedStickyEpochRef.current = labelStickyEpoch;
        return previousLabelCandidateCollectionRef.current!;
      }
      // Sort by labelOrder so source order encodes placement priority.
      // This replaces symbolSortKey (which caused per-frame re-sort wobble).
      updatedFeatures.sort(
        (a, b) => (a.properties.labelOrder ?? 9999) - (b.properties.labelOrder ?? 9999)
      );
      const updated = { ...effectivePinFeatures, features: updatedFeatures };
      labelCandidateAppliedStickyEpochRef.current = labelStickyEpoch;
      previousLabelCandidateCollectionRef.current = updated;
      return updated;
    }

    // Full rebuild — marker set changed (while map idle) or first run
    labelMarkerIdentityKeyRef.current = identityKey;
    const nextFeatures: Array<Feature<Point, RestaurantFeatureProperties>> = [];
    // Iterate in source order (already sorted by rank/priority from upstream).
    for (const feature of effectivePinFeatures.features) {
      const markerKey = feature.id;
      if (typeof markerKey !== 'string' || markerKey.length === 0) {
        continue;
      }
      const stickyIdentityKey = getLabelStickyIdentityKeyFromFeature(feature);
      const lockedCandidate = ENABLE_STICKY_LABEL_CANDIDATES
        ? stickyIdentityKey
          ? labelStickyCandidateByMarkerKeyRef.current.get(stickyIdentityKey)
          : null
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

    // Sort by labelOrder so source order encodes placement priority.
    nextFeatures.sort(
      (a, b) => (a.properties.labelOrder ?? 9999) - (b.properties.labelOrder ?? 9999)
    );
    const collection = { ...effectivePinFeatures, features: nextFeatures };
    labelCandidateAppliedStickyEpochRef.current = labelStickyEpoch;
    previousLabelCandidateCollectionRef.current = collection;
    return collection;
  }, [labelStickyEpoch, effectivePinFeatures]);

  const restaurantLabelStyleWithStableOrder = React.useMemo(() => {
    if (!STABILIZE_LABEL_ORDER) {
      return restaurantLabelStyle;
    }

    return {
      ...restaurantLabelStyle,
      symbolZOrder: 'source',
      // Placement priority is encoded in source data order (sorted by labelOrder
      // in restaurantLabelCandidateFeaturesWithIds) instead of symbolSortKey.
      // symbolSortKey caused per-frame re-sort during camera movement which,
      // combined with the large collision obstacles (1.1x), produced sub-pixel
      // placement wobble.
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
      textOpacity: ['*', batchOpacityTarget, baseTextOpacity],
      textOpacityTransition: PIN_OPACITY_TRANSITION,
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
    batchOpacityTarget,
    labelRadialTopEm,
    labelRadialXEm,
    labelRadialYEm,
    labelUpShiftEm,
    restaurantLabelStyleWithStableOrder,
  ]);

  const restaurantLabelPinCollisionLayerId = 'restaurant-labels-pin-collision';
  const restaurantLabelPinCollisionLayerKey = `${restaurantLabelPinCollisionLayerId}-${PIN_COLLISION_OBSTACLE_GEOMETRY}`;
  const restaurantLabelPinCollisionStyle = React.useMemo(
    () =>
      PIN_COLLISION_OBSTACLE_GEOMETRY === 'fill'
        ? LABEL_PIN_COLLISION_STYLE_FILL
        : LABEL_PIN_COLLISION_STYLE,
    []
  );

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

  // --- Diagnostic: when does SearchMap render with the new batchOpacityTarget? ---
  const prevDiagBatchTargetRef = React.useRef(batchOpacityTarget);
  if (batchOpacityTarget !== prevDiagBatchTargetRef.current) {
    logger.info('[TOGGLE-DIAG] searchMap:batchTargetRender', {
      from: prevDiagBatchTargetRef.current,
      to: batchOpacityTarget,
      phase: batchPhase,
      ts: Date.now(),
    });
    prevDiagBatchTargetRef.current = batchOpacityTarget;
  }
  React.useEffect(() => {
    const commitTs = Date.now();
    logger.info('[TOGGLE-DIAG] searchMap:batchTargetCommitted', {
      target: batchOpacityTarget,
      phase: batchPhase,
      ts: commitTs,
    });
    const rafId = requestAnimationFrame(() => {
      logger.info('[TOGGLE-DIAG] searchMap:firstRAFAfterCommit', {
        target: batchOpacityTarget,
        msSinceCommit: Date.now() - commitTs,
        ts: Date.now(),
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [batchOpacityTarget, batchPhase]);
  const stylePinsShadowSteadyStyle = React.useMemo(
    () => ({
      ...withIconOpacity(STYLE_PINS_SHADOW_STYLE, ['*', batchOpacityTarget, STYLE_PINS_SHADOW_OPACITY]),
      iconOpacityTransition: PIN_OPACITY_TRANSITION,
    } as MapboxGL.SymbolLayerStyle),
    [batchOpacityTarget]
  );

  const stylePinsOutlineSteadyStyle = React.useMemo(
    () => ({
      ...withTextOpacity({
        baseStyle: STYLE_PINS_OUTLINE_GLYPH_STYLE,
        textOpacity: batchOpacityTarget,
      }),
      textOpacityTransition: PIN_OPACITY_TRANSITION,
    } as MapboxGL.SymbolLayerStyle),
    [batchOpacityTarget]
  );

  const stylePinsFillSteadyStyle = React.useMemo(
    () => ({
      ...withTextOpacity({
        baseStyle: STYLE_PINS_FILL_GLYPH_STYLE,
        textColor: pinFillColorExpression,
        textOpacity: batchOpacityTarget,
      }),
      textOpacityTransition: PIN_OPACITY_TRANSITION,
    } as MapboxGL.SymbolLayerStyle),
    [batchOpacityTarget, pinFillColorExpression]
  );

  const stylePinsRankStyle = React.useMemo(
    () => ({
      ...withTextOpacity({
        baseStyle: STYLE_PINS_RANK_STYLE,
        textOpacity: batchOpacityTarget,
      }),
      textOpacityTransition: PIN_RANK_OPACITY_TRANSITION,
    } as MapboxGL.SymbolLayerStyle),
    [batchOpacityTarget]
  );

  const stylePinLayerStack = React.useMemo(() => {
    return Array.from({ length: STYLE_PIN_STACK_SLOTS }, (_, slotIndex) => {
      const lodSlotFilter = ['==', ['coalesce', ['get', 'lodZ'], -1], slotIndex] as const;
      return [
        <MapboxGL.SymbolLayer
          key={`shadow-slot-${slotIndex}`}
          id={`restaurant-style-pins-shadow-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsShadowSteadyStyle}
          filter={lodSlotFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`base-slot-${slotIndex}`}
          id={`restaurant-style-pins-base-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsOutlineSteadyStyle}
          filter={lodSlotFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`fill-slot-${slotIndex}`}
          id={`restaurant-style-pins-fill-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsFillSteadyStyle}
          filter={lodSlotFilter}
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
  ]);

  const transitionPinLayerTrees = React.useMemo(() => {
    return transitionPinLanes.map((lane) => {
      const laneOpacity = lane.opacityTarget;
      const laneShadowStyle: MapboxGL.SymbolLayerStyle = {
        ...withIconOpacity(STYLE_PINS_SHADOW_STYLE, [
          '*',
          batchOpacityTarget,
          laneOpacity,
          STYLE_PINS_SHADOW_OPACITY,
        ]),
        iconOpacityTransition: PIN_OPACITY_TRANSITION,
      };
      const laneOutlineStyle: MapboxGL.SymbolLayerStyle = {
        ...withTextOpacity({
          baseStyle: STYLE_PINS_OUTLINE_GLYPH_STYLE,
          textOpacity: ['*', batchOpacityTarget, laneOpacity],
        }),
        textOpacityTransition: PIN_OPACITY_TRANSITION,
      };
      const laneFillStyle: MapboxGL.SymbolLayerStyle = {
        ...withTextOpacity({
          baseStyle: STYLE_PINS_FILL_GLYPH_STYLE,
          textColor: pinFillColorExpression,
          textOpacity: ['*', batchOpacityTarget, laneOpacity],
        }),
        textOpacityTransition: PIN_OPACITY_TRANSITION,
      };
      const laneRankStyle: MapboxGL.SymbolLayerStyle = {
        ...withTextOpacity({
          baseStyle: STYLE_PINS_RANK_STYLE,
          textOpacity: ['*', batchOpacityTarget, laneOpacity],
        }),
        textOpacityTransition: PIN_RANK_OPACITY_TRANSITION,
      };
      const slotSet = new Set<number>();
      lane.pinFeatures.features.forEach((feature) => {
        const slot = feature.properties.lodZ;
        if (typeof slot === 'number' && Number.isFinite(slot) && slot >= 0) {
          slotSet.add(slot);
        }
      });
      const slots = Array.from(slotSet).sort((left, right) => left - right);
      return {
        lane,
        slots,
        laneShadowStyle,
        laneOutlineStyle,
        laneFillStyle,
        laneRankStyle,
      };
    });
  }, [batchOpacityTarget, pinFillColorExpression, transitionPinLanes]);
  const lodDiagLastPromoteLayerTreeSignatureRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ENABLE_LOD_DIAG) {
      return;
    }
    const promoteLaneTrees = transitionPinLayerTrees.filter(
      (laneTree) => laneTree.lane.direction === 'promote'
    );
    const signature = promoteLaneTrees
      .map(
        (laneTree) =>
          `${laneTree.lane.laneId}:${laneTree.lane.state}:${laneTree.lane.opacityTarget}:${laneTree.lane.pinFeatures.features.length}:${laneTree.slots.join('.')}`
      )
      .join('|');
    if (lodDiagLastPromoteLayerTreeSignatureRef.current === signature) {
      return;
    }
    lodDiagLastPromoteLayerTreeSignatureRef.current = signature;
    if (promoteLaneTrees.length === 0) {
      return;
    }
    logLodDiag('promote:layer_tree', {
      promoteLaneCount: promoteLaneTrees.length,
      lanes: promoteLaneTrees.slice(0, LOD_DIAG_SAMPLE_LIMIT).map((laneTree) => ({
        laneId: laneTree.lane.laneId,
        state: laneTree.lane.state,
        opacityTarget: laneTree.lane.opacityTarget,
        markerCount: laneTree.lane.pinFeatures.features.length,
        slotCount: laneTree.slots.length,
        sampleSlots: laneTree.slots.slice(0, LOD_DIAG_SAMPLE_LIMIT),
        sampleMarkers: sampleMarkerKeys(
          laneTree.lane.pinFeatures.features.map((feature) =>
            typeof feature.id === 'string' ? feature.id : buildMarkerKey(feature)
          )
        ),
      })),
      batchPhase,
      batchOpacityTarget,
    });
  }, [
    batchOpacityTarget,
    batchPhase,
    buildMarkerKey,
    transitionPinLayerTrees,
  ]);

  const pinInteractionLayerStack = React.useMemo(
    () =>
      Array.from({ length: STYLE_PIN_STACK_SLOTS }, (_, slotIndex) => {
        const lodSlotFilter = ['==', ['coalesce', ['get', 'lodZ'], -1], slotIndex] as const;
        return (
          <MapboxGL.CircleLayer
            key={`pin-interaction-slot-${slotIndex}`}
            id={`restaurant-pin-interaction-slot-${slotIndex}`}
            slot="top"
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={PIN_INTERACTION_LAYER_STYLE}
            filter={lodSlotFilter}
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
        textOpacity: DEBUG_PRESSABLE_INTERACTION_LAYERS ? 0.38 : INTERACTION_LAYER_HIDDEN_OPACITY,
        textColor: DEBUG_PRESSABLE_INTERACTION_LAYERS ? '#00E5FF' : style.textColor,
        textHaloColor: DEBUG_PRESSABLE_INTERACTION_LAYERS ? '#003B46' : style.textHaloColor,
        textHaloWidth: DEBUG_PRESSABLE_INTERACTION_LAYERS ? 1 : style.textHaloWidth,
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
        bottom: [
          'all',
          ['==', ['get', 'labelCandidate'], 'bottom'],
          ['in', ['id'], ['literal', visibleLabelFeatureIdList]],
        ] as unknown[],
        right: [
          'all',
          ['==', ['get', 'labelCandidate'], 'right'],
          ['in', ['id'], ['literal', visibleLabelFeatureIdList]],
        ] as unknown[],
        top: [
          'all',
          ['==', ['get', 'labelCandidate'], 'top'],
          ['in', ['id'], ['literal', visibleLabelFeatureIdList]],
        ] as unknown[],
        left: [
          'all',
          ['==', ['get', 'labelCandidate'], 'left'],
          ['in', ['id'], ['literal', visibleLabelFeatureIdList]],
        ] as unknown[],
      } satisfies Record<LabelCandidate, unknown[]>),
    [visibleLabelFeatureIdList]
  );

  const refreshVisibleDotRestaurantIds = React.useCallback(() => {
    if (!shouldRenderDots) {
      setVisibleDotRestaurantIdList((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    const mapInstance = mapRef.current;
    if (!mapInstance?.queryRenderedFeaturesInRect) {
      return;
    }

    void mapInstance
      .queryRenderedFeaturesInRect([], [], [DOT_LAYER_ID])
      .then((rendered) => {
        const nextSet = new Set<string>();
        for (const feature of rendered?.features ?? []) {
          const restaurantId = getRestaurantIdFromPressFeature(feature);
          if (restaurantId) {
            nextSet.add(restaurantId);
          }
        }
        const next = Array.from(nextSet).sort();
        setVisibleDotRestaurantIdList((previous) =>
          areStringArraysEqual(previous, next) ? previous : next
        );
      })
      .catch(() => undefined);
  }, [mapRef, shouldRenderDots]);

  const dotInteractionFilter = React.useMemo(
    () =>
      [
        'all',
        ['!', ['in', ['get', 'restaurantId'], ['literal', stableHiddenDotRestaurantIdList]]],
        ['in', ['get', 'restaurantId'], ['literal', visibleDotRestaurantIdList]],
      ] as unknown[],
    [stableHiddenDotRestaurantIdList, visibleDotRestaurantIdList]
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
      const pressSeq = ++pinPressResolutionSeqRef.current;
      const selectFromFeatures = (features: unknown[]) => {
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
      };

      const mapInstance = mapRef.current;
      const point = getPointFromPressEvent(event);
      if (!mapInstance?.queryRenderedFeaturesAtPoint || !point) {
        selectFromFeatures(event?.features ?? []);
        return;
      }

      void mapInstance
        .queryRenderedFeaturesAtPoint([point.x, point.y], [], PIN_INTERACTION_LAYER_IDS)
        .then((renderedAtPoint) => {
          if (pressSeq !== pinPressResolutionSeqRef.current) {
            return;
          }
          selectFromFeatures(renderedAtPoint?.features ?? []);
        })
        .catch(() => {
          if (pressSeq !== pinPressResolutionSeqRef.current) {
            return;
          }
          selectFromFeatures(event?.features ?? []);
        });
    },
    [mapRef, onMarkerPress]
  );

  const handleLabelPress = React.useCallback(
    (event: OnPressEvent) => {
      if (!onMarkerPress) {
        return;
      }
      const pressSeq = ++pinPressResolutionSeqRef.current;

      const features: unknown[] = event?.features ?? [];
      if (features.length === 0) {
        return;
      }

      const firstLabelMatch = pickFirstRestaurantIdFromPressFeatures(features);
      if (!firstLabelMatch) {
        return;
      }
      const mapInstance = mapRef.current;
      const point = getPointFromPressEvent(event);
      const selectLabelIfIntentional = () => {
        const restaurantId = firstLabelMatch.restaurantId;
        const coordinate =
          firstLabelMatch.coordinate ??
          getCoordinateFromPressFeature(features[0]) ??
          getCoordinateFromPressEvent(event);
        const matchedLabelFeature =
          features.find((feature) => getRestaurantIdFromPressFeature(feature) === restaurantId) ??
          features[0];

        void isTapIntentionalForLabelFeature({
          mapInstance,
          tapPoint: point,
          feature: matchedLabelFeature,
        }).then((isIntentional) => {
          if (pressSeq !== pinPressResolutionSeqRef.current) {
            return;
          }
          if (!isIntentional) {
            return;
          }
          setOptimisticSelectedRestaurantId(firstLabelMatch.restaurantId);
          onMarkerPress(firstLabelMatch.restaurantId, coordinate);
        });
      };

      if (!mapInstance?.queryRenderedFeaturesAtPoint || !point) {
        selectLabelIfIntentional();
        return;
      }

      void mapInstance
        .queryRenderedFeaturesAtPoint([point.x, point.y], [], PIN_INTERACTION_LAYER_IDS)
        .then((renderedAtPoint) => {
          if (pressSeq !== pinPressResolutionSeqRef.current) {
            return;
          }
          const pinFeatures = renderedAtPoint?.features ?? [];
          if (pinFeatures.length === 0) {
            selectLabelIfIntentional();
            return;
          }

          const pressMatch = pickTopRestaurantIdFromPressFeatures(pinFeatures);
          if (pressSeq !== pinPressResolutionSeqRef.current) {
            return;
          }
          if (!pressMatch) {
            selectLabelIfIntentional();
            return;
          }
          setOptimisticSelectedRestaurantId(pressMatch.restaurantId);
          onMarkerPress(pressMatch.restaurantId, pressMatch.coordinate);
        })
        .catch(() => {
          selectLabelIfIntentional();
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
  const refreshStickyLabelCandidatesRef = React.useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );
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
        const delayMs = isMapMovingRef.current
          ? LABEL_STICKY_REFRESH_MS_MOVING
          : LABEL_STICKY_REFRESH_MS_IDLE;
        labelStickyRefreshTimeoutRef.current = setTimeout(() => {
          labelStickyRefreshTimeoutRef.current = null;
          runStickyLabelRefreshRef.current();
        }, delayMs);
      }
    });
  }, []);
  runStickyLabelRefreshRef.current = runStickyLabelRefresh;

  const scheduleStickyLabelRefresh = React.useCallback((_reason: string) => {
    labelStickyRefreshQueuedRef.current = true;
    const delayMs = isMapMovingRef.current
      ? LABEL_STICKY_REFRESH_MS_MOVING
      : LABEL_STICKY_REFRESH_MS_IDLE;

    if (labelStickyRefreshTimeoutRef.current || labelStickyRefreshInFlightRef.current) {
      return;
    }
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

  React.useEffect(() => {
    refreshVisibleDotRestaurantIds();
  }, [markersRenderKey, refreshVisibleDotRestaurantIds, shouldRenderDots, styleURL]);

  React.useEffect(() => {
    if (!shouldRenderLabels) {
      return;
    }
    scheduleStickyLabelRefresh('labels-or-topology');
  }, [
    labelPlacementEpoch,
    markersRenderKey,
    scheduleStickyLabelRefresh,
    shouldRenderLabels,
    styleURL,
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
            stableHiddenDotRestaurantIdList.includes(restaurantId)
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
    [stableHiddenDotRestaurantIdList, mapRef, onMarkerPress, pinnedRestaurantIds]
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
    if (runtime.shouldDisableMarkers || !runtime.shouldRenderLabels) {
      setVisibleLabelFeatureIdList((previous) => (previous.length === 0 ? previous : []));
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
          ? [restaurantLabelPinCollisionLayerId]
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

        const filtered = await mapInstance.queryRenderedFeaturesInRect(
          [],
          probeFilter as unknown as [],
          null
        );
        probeFilterRendered = filtered?.features?.length ?? 0;

        if (typeof mapInstance.querySourceFeatures === 'function') {
          const source = await mapInstance.querySourceFeatures(
            RESTAURANT_LABEL_SOURCE_ID,
            ['has', 'markerKey'] as unknown as [],
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
        const filtered = await mapInstance.queryRenderedFeaturesInRect(
          [],
          filter as unknown as [],
          null
        );
        const filteredCount = filtered?.features?.length ?? 0;
        if (filteredCount > 0) {
          renderedForParsing = filtered;
        }
      } catch {
        // Ignore: we already report query errors above, and this is best-effort only.
      }
    }

    const effectiveRenderedFeatures = renderedForParsing?.features?.length ?? 0;

    const visibleLabelFeatureIdSet = new Set<string>();
    const renderedCandidateByStickyIdentityKey = new Map<string, LabelCandidate>();
    for (const feature of renderedForParsing?.features ?? []) {
      const parsed = getLabelCandidateInfoFromRenderedFeature(feature);
      if (!parsed) {
        continue;
      }
      visibleLabelFeatureIdSet.add(
        buildLabelCandidateFeatureId(parsed.markerKey, parsed.candidate)
      );
      const stickyIdentityKey = getLabelStickyIdentityKeyFromRenderedFeature(
        feature,
        parsed.markerKey
      );
      if (!stickyIdentityKey) {
        continue;
      }
      if (!renderedCandidateByStickyIdentityKey.has(stickyIdentityKey)) {
        renderedCandidateByStickyIdentityKey.set(stickyIdentityKey, parsed.candidate);
      }
    }
    const nextVisibleLabelFeatureIds = Array.from(visibleLabelFeatureIdSet).sort();
    setVisibleLabelFeatureIdList((previous) =>
      areStringArraysEqual(previous, nextVisibleLabelFeatureIds)
        ? previous
        : nextVisibleLabelFeatureIds
    );

    const isActivelyMoving = isMapMovingRef.current;

    if (!ENABLE_STICKY_LABEL_CANDIDATES) {
      return;
    }

    const stickyMap = labelStickyCandidateByMarkerKeyRef.current;
    const lastSeenAt = labelStickyLastSeenAtByMarkerKeyRef.current;
    const missingStreak = labelStickyMissingStreakByMarkerKeyRef.current;
    const proposedCandidate = labelStickyProposedCandidateByMarkerKeyRef.current;
    const proposedSinceAt = labelStickyProposedSinceAtByMarkerKeyRef.current;
    let didChange = false;

    for (const [stickyIdentityKey, candidate] of renderedCandidateByStickyIdentityKey) {
      lastSeenAt.set(stickyIdentityKey, now);
      missingStreak.set(stickyIdentityKey, 0);
      const locked = stickyMap.get(stickyIdentityKey);
      if (locked === candidate) {
        proposedCandidate.delete(stickyIdentityKey);
        proposedSinceAt.delete(stickyIdentityKey);
        continue;
      }

      const stableMs = isActivelyMoving
        ? LABEL_STICKY_LOCK_STABLE_MS_MOVING
        : LABEL_STICKY_LOCK_STABLE_MS_IDLE;

      const proposed = proposedCandidate.get(stickyIdentityKey);
      if (proposed !== candidate) {
        proposedCandidate.set(stickyIdentityKey, candidate);
        proposedSinceAt.set(stickyIdentityKey, now);
        continue;
      }

      const sinceAt = proposedSinceAt.get(stickyIdentityKey) ?? now;
      if (now - sinceAt < stableMs) {
        continue;
      }

      stickyMap.set(stickyIdentityKey, candidate);
      proposedCandidate.delete(stickyIdentityKey);
      proposedSinceAt.delete(stickyIdentityKey);
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

      for (const stickyIdentityKey of stickyMap.keys()) {
        if (renderedCandidateByStickyIdentityKey.has(stickyIdentityKey)) {
          continue;
        }

        const nextStreak = (missingStreak.get(stickyIdentityKey) ?? 0) + 1;
        missingStreak.set(stickyIdentityKey, nextStreak);

        const seenAt = lastSeenAt.get(stickyIdentityKey) ?? 0;
        if (nextStreak >= requiredStreak && now - seenAt > unlockMs) {
          stickyMap.delete(stickyIdentityKey);
          proposedCandidate.delete(stickyIdentityKey);
          proposedSinceAt.delete(stickyIdentityKey);
          missingStreak.delete(stickyIdentityKey);
          didChange = true;
        }
      }
    }

    if (didChange) {
      setLabelStickyEpoch((value) => value + 1);
    }
  }, [mapRef, restaurantLabelPinCollisionLayerId]);
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
      refreshVisibleDotRestaurantIds();
    },
    [onMapIdle, refreshVisibleDotRestaurantIds]
  );
  // ---------------------------------------------------------------------------
  // Event-driven reveal signals: React effects that fire based on readiness
  // state rather than Mapbox frame callbacks. This ensures the reveal chain
  // completes regardless of Mapbox frame timing.
  // ---------------------------------------------------------------------------

  // Reset dedup refs when the request key changes.
  const revealStartedBlockSigRef = React.useRef<string | null>(null);
  const revealSettledBlockSigRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    markerRevealStartedSignaledRequestKeyRef.current = null;
    markerRevealSettledSignaledRequestKeyRef.current = null;
    revealStartedBlockSigRef.current = null;
    revealSettledBlockSigRef.current = null;
  }, [visualReadyRequestKey]);

  // Reveal started: for pinned markers, fires only after preroll was confirmed
  // by a rendered frame and batch phase entered `revealing` (target flipped to 1).
  // This keeps cover-drop synchronized with the actual visible start of fade-in.
  React.useEffect(() => {
    if (!visualReadyRequestKey) {
      const signature = 'start:block:no_visual_ready_request_key';
      if (revealStartedBlockSigRef.current !== signature) {
        revealStartedBlockSigRef.current = signature;
        logRevealDeadlockDiag('revealStarted:block', {
          reason: 'no_visual_ready_request_key',
        });
      }
      return;
    }
    if (markerRevealStartedSignaledRequestKeyRef.current === visualReadyRequestKey) {
      return;
    }
    const hasPinnedMarkers = sortedRestaurantMarkers.length > 0;
    if (hasPinnedMarkers) {
      // Reveal-start is a pin-visibility contract, not a label-readiness contract.
      // Gating this on labels can deadlock initial reveal when style/label layers lag.
      if (batchPhase !== 'revealing') {
        const signature = `start:block:phase_not_revealing:${visualReadyRequestKey}:${batchPhase}`;
        if (revealStartedBlockSigRef.current !== signature) {
          revealStartedBlockSigRef.current = signature;
          logRevealDeadlockDiag('revealStarted:block', {
            reason: 'phase_not_revealing',
            visualReadyRequestKey,
            batchPhase,
            hasStartedPromotions,
            sortedMarkerCount: sortedRestaurantMarkers.length,
            revealRequestKey: presentationMapRevealRequestKey,
          });
        }
        return;
      }
      if (!hasStartedPromotions) {
        const signature = `start:block:no_started_promotions:${visualReadyRequestKey}`;
        if (revealStartedBlockSigRef.current !== signature) {
          revealStartedBlockSigRef.current = signature;
          logRevealDeadlockDiag('revealStarted:block', {
            reason: 'no_started_promotions',
            visualReadyRequestKey,
            batchPhase,
            sortedMarkerCount: sortedRestaurantMarkers.length,
          });
        }
        return;
      }
    } else {
      // No pinned markers — check for dot markers.
      const hasDots = (dotRestaurantFeatures?.features?.length ?? 0) > 0;
      if (!hasDots) {
        const signature = `start:block:no_pins_no_dots:${visualReadyRequestKey}`;
        if (revealStartedBlockSigRef.current !== signature) {
          revealStartedBlockSigRef.current = signature;
          logRevealDeadlockDiag('revealStarted:block', {
            reason: 'no_pins_no_dots',
            visualReadyRequestKey,
            batchPhase,
            sortedMarkerCount: sortedRestaurantMarkers.length,
            dotCount: dotRestaurantFeatures?.features?.length ?? 0,
          });
        }
        return;
      }
    }
    revealStartedBlockSigRef.current = null;
    markerRevealStartedSignaledRequestKeyRef.current = visualReadyRequestKey;
    logRevealDeadlockDiag('revealStarted:emit', {
      visualReadyRequestKey,
      batchPhase,
      hasStartedPromotions,
      sortedMarkerCount: sortedRestaurantMarkers.length,
      dotCount: dotRestaurantFeatures?.features?.length ?? 0,
    });
    emitMapRuntimeWriteSpan({
      label: 'marker_reveal_started_signal',
      requestKey: visualReadyRequestKey,
      markerRevealCommitId: null,
    });
    onMarkerRevealStarted?.({
      requestKey: visualReadyRequestKey,
      markerRevealCommitId: null,
      startedAtMs: getNowMs(),
    });
  }, [
    emitMapRuntimeWriteSpan,
    batchPhase,
    visualReadyRequestKey,
    hasStartedPromotions,
    sortedRestaurantMarkers.length,
    dotRestaurantFeatures?.features?.length,
    onMarkerRevealStarted,
    getNowMs,
  ]);

  // Reveal settled: fires when all pin promotion animations have completed.
  React.useEffect(() => {
    const revealSignalKey = markerRevealStartedSignaledRequestKeyRef.current;
    if (!revealSignalKey) {
      const signature = 'settled:block:no_reveal_started_signal_key';
      if (revealSettledBlockSigRef.current !== signature) {
        revealSettledBlockSigRef.current = signature;
        logRevealDeadlockDiag('revealSettled:block', {
          reason: 'no_reveal_started_signal_key',
        });
      }
      return;
    }
    if (markerRevealSettledSignaledRequestKeyRef.current === revealSignalKey) {
      return;
    }
    // Wait for all promotions to finish.
    if (hasPendingPromotions || hasStartedPromotions) {
      const signature = `settled:block:awaiting_promotions:${revealSignalKey}:${hasPendingPromotions ? 1 : 0}:${hasStartedPromotions ? 1 : 0}`;
      if (revealSettledBlockSigRef.current !== signature) {
        revealSettledBlockSigRef.current = signature;
        logRevealDeadlockDiag('revealSettled:block', {
          reason: 'awaiting_promotions',
          revealSignalKey,
          hasPendingPromotions,
          hasStartedPromotions,
          batchPhase,
        });
      }
      return;
    }
    revealSettledBlockSigRef.current = null;
    markerRevealSettledSignaledRequestKeyRef.current = revealSignalKey;
    logRevealDeadlockDiag('revealSettled:emit', {
      revealSignalKey,
      batchPhase,
      hasPendingPromotions,
      hasStartedPromotions,
    });
    emitMapRuntimeWriteSpan({
      label: 'marker_reveal_settled_signal',
      requestKey: revealSignalKey,
      markerRevealCommitId: null,
    });
    onMarkerRevealSettled?.({
      requestKey: revealSignalKey,
      markerRevealCommitId: null,
      settledAtMs: getNowMs(),
    });
  }, [
    emitMapRuntimeWriteSpan,
    hasPendingPromotions,
    hasStartedPromotions,
    onMarkerRevealSettled,
    getNowMs,
  ]);

  const handleMapLoaded = React.useCallback(() => {
    // IMPORTANT: mark the map as ready first. Refresh routines can fail transiently during early
    // initialization (e.g. before the view->coordinate APIs are fully warm), and we don't want
    // those failures to prevent labels from mounting.
    onMapLoaded();
    try {
      labelStickyRefreshQueuedRef.current = true;
      runStickyLabelRefreshRef.current();
    } catch {
      // noop
    }
  }, [onMapLoaded]);

  const remountPinLayerTree = React.useCallback(() => {
    if (isBatchTransitionActive) {
      // Defer pin-tree remount while batch transition is active so we don't
      // reset native transition state mid-fade (which can cause snapping).
      pendingPinLayerRemountRef.current = true;
      return;
    }
    const nowMs = Date.now();
    if (nowMs - pinLayerRecoveryLastAttemptAtRef.current < 400) {
      return;
    }
    pinLayerRecoveryLastAttemptAtRef.current = nowMs;
    const remountStartedAtMs = getNowMs();
    setPinLayerTreeEpoch((value) => value + 1);
    recordRuntimeAttribution(getNowMs() - remountStartedAtMs);
  }, [
    getNowMs,
    isBatchTransitionActive,
    recordRuntimeAttribution,
    styleURL,
  ]);

  React.useEffect(() => {
    if (isBatchTransitionActive || !pendingPinLayerRemountRef.current) {
      return;
    }
    pendingPinLayerRemountRef.current = false;
    remountPinLayerTree();
  }, [isBatchTransitionActive, remountPinLayerTree]);

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
      const errorText = `${rawError ?? ''} ${rawMessage ?? ''}`.toLowerCase();
      const isMissingStylePinsSource =
        errorText.includes(STYLE_PINS_SOURCE_ID) && errorText.includes('not in style');

      if (isMissingStylePinsSource) {
        remountPinLayerTree();
      }
    },
    [remountPinLayerTree]
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
        {...({
          onTouchStartCapture: handleTouchStart,
          onTouchEndCapture: handleTouchEnd,
          onTouchCancelCapture: handleTouchEnd,
        } as Record<string, unknown>)}
        onCameraChanged={handleCameraChanged}
        onMapIdle={handleMapIdle}
        onDidFinishLoadingStyle={handleMapLoadedStyle}
        onDidFinishLoadingMap={handleMapLoadedMap}
        onDidFinishRenderingFrame={handleDidFinishRenderingFrame}
        onDidFinishRenderingFrameFully={handleDidFinishRenderingFrameFully}
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
                shouldRenderDotsOrDismiss && effectiveDotFeatures
                  ? (effectiveDotFeatures as FeatureCollection<Point, RestaurantFeatureProperties>)
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
                  ? (dotInteractionFeatures as FeatureCollection<
                      Point,
                      RestaurantFeatureProperties
                    >)
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
              steadyPinFeatures.features.length > 0
                ? steadyPinFeatures
                : EMPTY_POINT_FEATURES
            }
          >
            {stylePinLayerStack}
          </MapboxGL.ShapeSource>
        ) : null}
        {USE_STYLE_LAYER_PINS && !shouldDisableMarkers
          ? transitionPinLayerTrees.map((laneTree) => (
              <MapboxGL.ShapeSource
                key={`style-pins-transition-source-${laneTree.lane.laneId}`}
                id={`restaurant-style-pins-transition-source-${laneTree.lane.laneId}`}
                shape={
                  laneTree.lane.pinFeatures.features.length > 0
                    ? laneTree.lane.pinFeatures
                    : EMPTY_POINT_FEATURES
                }
              >
                {laneTree.slots.flatMap((slotIndex) => {
                  const lodSlotFilter = [
                    '==',
                    ['coalesce', ['get', 'lodZ'], -1],
                    slotIndex,
                  ] as const;
                  return [
                    <MapboxGL.SymbolLayer
                      key={`transition-${laneTree.lane.laneId}-shadow-slot-${slotIndex}`}
                      id={`restaurant-style-pins-transition-${laneTree.lane.laneId}-shadow-slot-${slotIndex}`}
                      slot="top"
                      belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
                      style={laneTree.laneShadowStyle}
                      filter={lodSlotFilter}
                    />,
                    <MapboxGL.SymbolLayer
                      key={`transition-${laneTree.lane.laneId}-base-slot-${slotIndex}`}
                      id={`restaurant-style-pins-transition-${laneTree.lane.laneId}-base-slot-${slotIndex}`}
                      slot="top"
                      belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
                      style={laneTree.laneOutlineStyle}
                      filter={lodSlotFilter}
                    />,
                    <MapboxGL.SymbolLayer
                      key={`transition-${laneTree.lane.laneId}-fill-slot-${slotIndex}`}
                      id={`restaurant-style-pins-transition-${laneTree.lane.laneId}-fill-slot-${slotIndex}`}
                      slot="top"
                      belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
                      style={laneTree.laneFillStyle}
                      filter={lodSlotFilter}
                    />,
                    <MapboxGL.SymbolLayer
                      key={`transition-${laneTree.lane.laneId}-rank-slot-${slotIndex}`}
                      id={`restaurant-style-pins-transition-${laneTree.lane.laneId}-rank-slot-${slotIndex}`}
                      slot="top"
                      belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
                      style={laneTree.laneRankStyle}
                      filter={lodSlotFilter}
                    />,
                  ];
                })}
              </MapboxGL.ShapeSource>
            ))
          : null}
        {USE_STYLE_LAYER_PINS && !shouldDisableMarkers ? (
          <MapboxGL.ShapeSource
            key={`pin-interaction-source-${pinLayerTreeEpoch}`}
            id={PIN_INTERACTION_SOURCE_ID}
            shape={
              effectivePinFeatures.features.length > 0
                ? effectivePinFeatures
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
                    key={LABEL_LAYER_IDS_BY_CANDIDATE[candidate]}
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
                    key={LABEL_INTERACTION_LAYER_IDS_BY_CANDIDATE[candidate]}
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
                    style={restaurantLabelPinCollisionStyle}
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
  if (prev.sortedRestaurantMarkers !== next.sortedRestaurantMarkers) {
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
  if (prev.onMarkerRevealStarted !== next.onMarkerRevealStarted) {
    return false;
  }
  if (prev.onMarkerRevealSettled !== next.onMarkerRevealSettled) {
    return false;
  }
  if (prev.searchRuntimeBus !== next.searchRuntimeBus) {
    return false;
  }
  if (prev.onRuntimeMechanismEvent !== next.onRuntimeMechanismEvent) {
    return false;
  }
  if (prev.onProfilerRender !== next.onProfilerRender) {
    return false;
  }
  return true;
};

export default React.memo(SearchMap, arePropsEqual);
