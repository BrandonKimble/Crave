import React from 'react';
import { Animated, type LayoutChangeEvent, View } from 'react-native';

import MapboxGL, { type MapState as MapboxMapState, type OnPressEvent } from '@rnmapbox/maps';
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

// Lock each restaurant to a single chosen candidate and only reconsider when that candidate
// disappears (i.e. it can’t be placed).
const ENABLE_STICKY_LABEL_CANDIDATES = true;
// Stabilize intra-layer ordering so placement priority doesn't vary with viewport y.
const STABILIZE_LABEL_ORDER = true;
// Pin collision obstacle geometry.
// - `outline`: uses the full pin sprite bounding box (conservative).
// - `fill`: uses the fill sprite bounding box (tighter).
// - `off`: disables pin collision obstacles entirely (labels may overlap pins).
const PIN_COLLISION_OBSTACLE_GEOMETRY: 'outline' | 'fill' | 'off' = 'fill';
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
const DOT_TO_PIN_TRANSITION_MIN_SCALE = 0.48;
const DOT_TO_PIN_RANK_FADE_START = 0.5;

const PIN_TRANSITION_ACTIVE_EXPRESSION = ['coalesce', ['get', 'pinTransitionActive'], 0] as const;
const PIN_TRANSITION_SCALE_EXPRESSION = ['coalesce', ['get', 'pinTransitionScale'], 1] as const;
const PIN_TRANSITION_OPACITY_EXPRESSION = ['coalesce', ['get', 'pinTransitionOpacity'], 1] as const;
const PIN_RANK_OPACITY_EXPRESSION = ['coalesce', ['get', 'pinRankOpacity'], 1] as const;
const PIN_LABEL_OPACITY_EXPRESSION = ['coalesce', ['get', 'pinLabelOpacity'], 1] as const;
const PIN_STEADY_OPACITY_EXPRESSION = ['-', 1, PIN_TRANSITION_ACTIVE_EXPRESSION] as const;

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
  getCoordinateFromView?: (point: [number, number]) => Promise<[number, number]>;
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
const DOT_TEXT_SIZE = 17;
// Keep in sync with SearchScreen's MAX_FULL_PINS. These slots guarantee deterministic pin stacking
// even as the pinned set changes during live LOD updates.
const STYLE_PIN_STACK_SLOTS = 30;
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
const PIN_PRESS_ANCHOR_SHIFT_Y_PX = PIN_MARKER_RENDER_SIZE * 0.42;

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
const USE_PIN_GLYPHS = true;
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
  selectedRestaurantId?: string | null;
  sortedRestaurantMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  dotRestaurantFeatures?: FeatureCollection<Point, RestaurantFeatureProperties> | null;
  markersRenderKey: string;
  pinsRenderKey: string;
  pinRevealRequestKey?: string | null;
  visualReadyRequestKey?: string | null;
  shouldSignalVisualReady?: boolean;
  requireMarkerVisualsForVisualReady?: boolean;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  markerRevealChunk?: number;
  markerRevealStaggerMs?: number;
  restaurantFeatures: FeatureCollection<Point, RestaurantFeatureProperties>;
  restaurantLabelStyle: MapboxGL.SymbolLayerStyle;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  locationPulse: Animated.Value;
  disableMarkers?: boolean;
  disableBlur?: boolean;
  onProfilerRender?: React.ProfilerOnRenderCallback;
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
  selectedRestaurantId,
  sortedRestaurantMarkers,
  dotRestaurantFeatures,
  markersRenderKey,
  pinsRenderKey,
  pinRevealRequestKey = null,
  visualReadyRequestKey = null,
  shouldSignalVisualReady = false,
  requireMarkerVisualsForVisualReady = false,
  buildMarkerKey,
  markerRevealChunk = 1,
  markerRevealStaggerMs = 0,
  restaurantFeatures,
  restaurantLabelStyle,
  isMapStyleReady,
  userLocation,
  locationPulse,
  disableMarkers = false,
  disableBlur = false,
  onProfilerRender,
}) => {
  const shouldDisableMarkers = disableMarkers === true;
  const shouldDisableBlur = disableBlur === true;
  const shouldRenderLabels = !shouldDisableMarkers && isMapStyleReady;
  const shouldRenderDots =
    !shouldDisableMarkers &&
    dotRestaurantFeatures != null &&
    dotRestaurantFeatures.features.length > 0;
  const pinnedRestaurantIds = React.useMemo(
    () => new Set(sortedRestaurantMarkers.map((feature) => feature.properties.restaurantId)),
    [sortedRestaurantMarkers]
  );
  const pinnedRestaurantIdList = React.useMemo(
    () => Array.from(pinnedRestaurantIds),
    [pinnedRestaurantIds]
  );
  const pinnedDotKeys = React.useMemo(
    () => new Set(sortedRestaurantMarkers.map((feature) => buildMarkerKey(feature))),
    [buildMarkerKey, sortedRestaurantMarkers]
  );
  const [pinTransitionClockMs, setPinTransitionClockMs] = React.useState(0);
  const pinPromoteStartedAtByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const pinPendingPromoteDelayByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const pinDemoteFeatureByMarkerKeyRef = React.useRef<
    Map<string, { startedAtMs: number; feature: Feature<Point, RestaurantFeatureProperties> }>
  >(new Map());
  const pinTransitionFrameRequestRef = React.useRef<number | null>(null);
  const previousPinnedFeatureByMarkerKeyRef = React.useRef<
    Map<string, Feature<Point, RestaurantFeatureProperties>>
  >(new Map());
  const pinInitialRevealQueuedRef = React.useRef(false);
  const pinRevealAppliedRequestKeyRef = React.useRef<string | null>(null);
  const pinTransitionMarkersKeyRef = React.useRef<string | null>(null);
  const visualReadySignaledRequestKeyRef = React.useRef<string | null>(null);
  const visualReadyPendingFramesRef = React.useRef(0);
  const visualReadyAwaitingPinTransitionStartRef = React.useRef(false);
  const demotingRestaurantIdList = React.useMemo(() => {
    const nowMs = pinTransitionClockMs > 0 ? pinTransitionClockMs : getNowMs();
    const restaurantIdSet = new Set<string>();
    pinDemoteFeatureByMarkerKeyRef.current.forEach(({ startedAtMs, feature }) => {
      if (nowMs - startedAtMs >= DOT_TO_PIN_TRANSITION_DURATION_MS) {
        return;
      }
      restaurantIdSet.add(feature.properties.restaurantId);
    });
    return Array.from(restaurantIdSet);
  }, [pinTransitionClockMs]);
  const hiddenDotRestaurantIdList = React.useMemo(() => {
    const next = new Set<string>(pinnedRestaurantIdList);
    demotingRestaurantIdList.forEach((restaurantId) => next.add(restaurantId));
    return Array.from(next);
  }, [demotingRestaurantIdList, pinnedRestaurantIdList]);
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
        ['==', ['get', 'restaurantId'], selectedRestaurantId ?? ''],
        PRIMARY_COLOR,
        [
          'case',
          ['==', ['literal', scoreModeLiteral], 'coverage_display'],
          ['coalesce', ['get', 'pinColorLocal'], ['get', 'pinColor']],
          ['coalesce', ['get', 'pinColorGlobal'], ['get', 'pinColor']],
        ],
      ],
    } as MapboxGL.SymbolLayerStyle;
  }, [hiddenDotRestaurantIdList, scoreMode, selectedRestaurantId]);
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
  const labelPlacementBootstrapTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
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
    // Style reloads (and RN "Reload") can change the ordering/timing of when images + layers are
    // registered with the native Mapbox style. If our (invisible) collision layer is created
    // before its icon is ready, it may not participate in the initial placement pass.
    //
    // We replicate the "warm state" behavior you can accidentally get via Fast Refresh (undo/redo)
    // by forcing a one-time, post-style-load re-mount of the label layers.
    if (!shouldRenderLabels) {
      labelPlacementBootstrapKeyRef.current = null;
      if (labelPlacementBootstrapTimeoutRef.current) {
        clearTimeout(labelPlacementBootstrapTimeoutRef.current);
        labelPlacementBootstrapTimeoutRef.current = null;
      }
      return;
    }

    const bootstrapKey = `${styleURL}::${markersRenderKey}`;
    if (labelPlacementBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    labelPlacementBootstrapKeyRef.current = bootstrapKey;

    // First bump: forces a re-layout on initial label render.
    setLabelPlacementEpoch((value) => value + 1);

    // Second bump: gives Mapbox a moment to register images, then forces another placement pass.
    labelPlacementBootstrapTimeoutRef.current = setTimeout(() => {
      setLabelPlacementEpoch((value) => value + 1);
      labelPlacementBootstrapTimeoutRef.current = null;
    }, 250);

    return () => {
      if (labelPlacementBootstrapTimeoutRef.current) {
        clearTimeout(labelPlacementBootstrapTimeoutRef.current);
        labelPlacementBootstrapTimeoutRef.current = null;
      }
    };
  }, [markersRenderKey, shouldRenderLabels, styleURL]);

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
  }, [markersRenderKey, shouldRenderLabels, styleURL]);

  const restaurantLabelFeaturesWithIds = React.useMemo(() => {
    if (!restaurantFeatures.features.length) {
      return restaurantFeatures;
    }

    const transitionNowMs = pinTransitionClockMs > 0 ? pinTransitionClockMs : getNowMs();
    const pinPromoteStartedAtByMarkerKey = pinPromoteStartedAtByMarkerKeyRef.current;
    const pinPendingPromoteDelayByMarkerKey = pinPendingPromoteDelayByMarkerKeyRef.current;
    let didChange = false;
    const nextFeatures = restaurantFeatures.features.map((feature, index) => {
      const markerKey = buildMarkerKey(feature);
      const labelOrder = index + 1;
      const pendingPromoteDelayMs = pinPendingPromoteDelayByMarkerKey.get(markerKey);
      const transitionVisual =
        typeof pendingPromoteDelayMs === 'number'
          ? START_PIN_TRANSITION_VISUAL
          : getPinTransitionVisual(
              pinPromoteStartedAtByMarkerKey.get(markerKey),
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
        return feature;
      }
      didChange = true;
      return {
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
    });

    if (!didChange) {
      return restaurantFeatures;
    }

    return { ...restaurantFeatures, features: nextFeatures };
  }, [buildMarkerKey, pinTransitionClockMs, restaurantFeatures]);
  const demotionTransitionFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const transitionNowMs = pinTransitionClockMs > 0 ? pinTransitionClockMs : getNowMs();
    const features: Array<Feature<Point, RestaurantFeatureProperties>> = [];

    pinDemoteFeatureByMarkerKeyRef.current.forEach(({ startedAtMs, feature }, markerKey) => {
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

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [pinTransitionClockMs]);
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

  const restaurantLabelCandidateFeaturesWithIds = React.useMemo(() => {
    if (!stylePinFeaturesWithTransitions.features.length) {
      return stylePinFeaturesWithTransitions as FeatureCollection<
        Point,
        RestaurantFeatureProperties
      >;
    }

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

    return { ...stylePinFeaturesWithTransitions, features: nextFeatures };
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
      textOpacity: ['*', baseTextOpacity, PIN_LABEL_OPACITY_EXPRESSION],
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
      ['==', ['get', 'restaurantId'], selectedRestaurantId ?? ''],
      PRIMARY_COLOR,
      [
        'case',
        ['==', ['literal', scoreModeLiteral], 'coverage_display'],
        ['coalesce', ['get', 'pinColorLocal'], ['get', 'pinColor']],
        ['coalesce', ['get', 'pinColorGlobal'], ['get', 'pinColor']],
      ],
    ] as const;
  }, [scoreMode, selectedRestaurantId]);

  const stylePinsShadowSteadyStyle = React.useMemo(
    () =>
      ({
        ...STYLE_PINS_SHADOW_STYLE,
        iconOpacity: ['*', STYLE_PINS_SHADOW_OPACITY, PIN_STEADY_OPACITY_EXPRESSION],
      } as MapboxGL.SymbolLayerStyle),
    []
  );

  const stylePinsShadowTransitionStyle = React.useMemo(
    () =>
      ({
        ...STYLE_PINS_SHADOW_STYLE,
        iconSize: ['*', STYLE_PINS_SHADOW_ICON_SIZE, PIN_TRANSITION_SCALE_EXPRESSION],
        iconOpacity: ['*', STYLE_PINS_SHADOW_OPACITY, PIN_TRANSITION_OPACITY_EXPRESSION],
      } as MapboxGL.SymbolLayerStyle),
    []
  );

  const stylePinsOutlineSteadyStyle = React.useMemo(() => {
    if (USE_PIN_GLYPHS) {
      return {
        ...STYLE_PINS_OUTLINE_GLYPH_STYLE,
        textOpacity: PIN_STEADY_OPACITY_EXPRESSION,
      } as MapboxGL.SymbolLayerStyle;
    }
    return {
      ...STYLE_PINS_OUTLINE_STYLE,
      iconOpacity: PIN_STEADY_OPACITY_EXPRESSION,
    } as MapboxGL.SymbolLayerStyle;
  }, []);

  const stylePinsFillSteadyStyle = React.useMemo(() => {
    if (USE_PIN_GLYPHS) {
      return {
        ...STYLE_PINS_FILL_GLYPH_STYLE,
        textColor: pinFillColorExpression,
        textOpacity: PIN_STEADY_OPACITY_EXPRESSION,
      } as MapboxGL.SymbolLayerStyle;
    }
    return {
      ...STYLE_PINS_FILL_STYLE,
      // NOTE: `iconColor` only tints SDF icons. If `pinFillAsset` isn't SDF, this will no-op and
      // we’ll need either per-color assets or a different composition (e.g. circles).
      iconColor: pinFillColorExpression,
      iconOpacity: PIN_STEADY_OPACITY_EXPRESSION,
    } as MapboxGL.SymbolLayerStyle;
  }, [pinFillColorExpression]);

  const stylePinsTransitionBaseStyle = React.useMemo(
    () =>
      ({
        ...STYLE_PINS_OUTLINE_STYLE,
        iconSize: ['*', STYLE_PINS_OUTLINE_ICON_SIZE, PIN_TRANSITION_SCALE_EXPRESSION],
        iconOpacity: PIN_TRANSITION_OPACITY_EXPRESSION,
      } as MapboxGL.SymbolLayerStyle),
    []
  );

  const stylePinsTransitionFillStyle = React.useMemo(
    () =>
      ({
        ...STYLE_PINS_FILL_STYLE,
        iconSize: ['*', STYLE_PINS_FILL_ICON_SIZE, PIN_TRANSITION_SCALE_EXPRESSION],
        iconColor: pinFillColorExpression,
        iconOpacity: PIN_TRANSITION_OPACITY_EXPRESSION,
      } as MapboxGL.SymbolLayerStyle),
    [pinFillColorExpression]
  );

  const stylePinsRankStyle = React.useMemo(
    () =>
      ({
        ...STYLE_PINS_RANK_STYLE,
        textOpacity: PIN_RANK_OPACITY_EXPRESSION,
      } as MapboxGL.SymbolLayerStyle),
    []
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

  const handleStylePinPress = React.useCallback(
    (event: OnPressEvent) => {
      if (!onMarkerPress) {
        return;
      }

      const features = event?.features ?? [];
      if (features.length === 0) {
        return;
      }

      const baseTarget =
        getCoordinateFromPressEvent(event) ?? getCoordinateFromPressFeature(features[0]) ?? null;
      if (!baseTarget) {
        const restaurantId = getRestaurantIdFromPressFeature(features[0]);
        if (restaurantId) {
          onMarkerPress(restaurantId, getCoordinateFromPressFeature(features[0]));
        }
        return;
      }
      const mapInstance = mapRef.current;
      const rawPoint = (event as unknown as { point?: unknown }).point;
      const point =
        rawPoint && typeof rawPoint === 'object' && !Array.isArray(rawPoint)
          ? (rawPoint as Record<string, unknown>)
          : null;
      const x = typeof point?.x === 'number' ? point.x : null;
      const y = typeof point?.y === 'number' ? point.y : null;

      // When pins are anchored at their tip (`iconAnchor: 'bottom'`), taps on the visual pin body
      // correspond to a map coordinate slightly north of the restaurant coordinate. Shift the tap
      // point downward in screen space and convert it back into a map coordinate to better align
      // selection when zoomed out and icons overlap.
      if (mapInstance?.getCoordinateFromView && x != null && y != null) {
        void mapInstance
          .getCoordinateFromView([x, y + PIN_PRESS_ANCHOR_SHIFT_Y_PX])
          .then((shifted) => {
            const target = isLngLatTuple(shifted)
              ? ({ lng: shifted[0], lat: shifted[1] } as Coordinate)
              : baseTarget;
            const pressMatch = pickClosestRestaurantIdFromPressFeatures(features, target);
            const restaurantId =
              pressMatch?.restaurantId ?? getRestaurantIdFromPressFeature(features[0]);
            if (restaurantId) {
              onMarkerPress(restaurantId, pressMatch?.coordinate ?? target);
            }
          })
          .catch(() => {
            const pressMatch = pickClosestRestaurantIdFromPressFeatures(features, baseTarget);
            const restaurantId =
              pressMatch?.restaurantId ?? getRestaurantIdFromPressFeature(features[0]);
            if (restaurantId) {
              onMarkerPress(restaurantId, pressMatch?.coordinate ?? baseTarget);
            }
          });
        return;
      }

      const pressMatch = pickClosestRestaurantIdFromPressFeatures(features, baseTarget);
      const restaurantId = pressMatch?.restaurantId ?? getRestaurantIdFromPressFeature(features[0]);
      if (!restaurantId) {
        return;
      }
      onMarkerPress(restaurantId, pressMatch?.coordinate ?? baseTarget);
    },
    [mapRef, onMarkerPress]
  );

  React.useEffect(() => {
    const transitionSetupKey = `${markersRenderKey}::${pinRevealRequestKey ?? 'none'}`;
    if (pinTransitionMarkersKeyRef.current === transitionSetupKey) {
      return;
    }
    pinTransitionMarkersKeyRef.current = transitionSetupKey;
    const pinnedByKey = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
    sortedRestaurantMarkers.forEach((feature) => {
      pinnedByKey.set(buildMarkerKey(feature), feature);
    });
    const markerRequestKey = markersRenderKey.split('::')[0] ?? null;
    const shouldRunInitialReveal =
      pinnedByKey.size > 0 &&
      pinRevealRequestKey != null &&
      markerRequestKey === pinRevealRequestKey &&
      pinRevealRequestKey !== pinRevealAppliedRequestKeyRef.current;

    previousPinnedFeatureByMarkerKeyRef.current = pinnedByKey;
    pinInitialRevealQueuedRef.current = shouldRunInitialReveal;
    pinPromoteStartedAtByMarkerKeyRef.current.clear();
    pinPendingPromoteDelayByMarkerKeyRef.current.clear();
    pinDemoteFeatureByMarkerKeyRef.current.clear();
    if (pinTransitionFrameRequestRef.current != null) {
      cancelAnimationFrame(pinTransitionFrameRequestRef.current);
      pinTransitionFrameRequestRef.current = null;
    }
    if (shouldRunInitialReveal) {
      pinRevealAppliedRequestKeyRef.current = pinRevealRequestKey;
      const revealChunk = Math.max(1, markerRevealChunk);
      const revealStaggerMs = Math.max(0, markerRevealStaggerMs);
      sortedRestaurantMarkers.forEach((feature, index) => {
        const markerKey = buildMarkerKey(feature);
        const withinChunkIndex = revealChunk > 1 ? index % revealChunk : 0;
        pinPendingPromoteDelayByMarkerKeyRef.current.set(
          markerKey,
          withinChunkIndex * revealStaggerMs
        );
      });
      setPinTransitionClockMs(getNowMs());
      runPinTransitionFrameRef.current();
      return;
    }
    setPinTransitionClockMs(0);
  }, [
    buildMarkerKey,
    markerRevealChunk,
    markerRevealStaggerMs,
    markersRenderKey,
    pinRevealRequestKey,
    sortedRestaurantMarkers,
  ]);

  React.useEffect(() => {
    const nextPinnedFeatureByMarkerKey = new Map<
      string,
      Feature<Point, RestaurantFeatureProperties>
    >();
    sortedRestaurantMarkers.forEach((feature) => {
      nextPinnedFeatureByMarkerKey.set(buildMarkerKey(feature), feature);
    });
    const previousPinnedFeatureByMarkerKey = previousPinnedFeatureByMarkerKeyRef.current;
    const pinPromoteStartedAtByMarkerKey = pinPromoteStartedAtByMarkerKeyRef.current;
    const pinPendingPromoteDelayByMarkerKey = pinPendingPromoteDelayByMarkerKeyRef.current;
    const pinDemoteFeatureByMarkerKey = pinDemoteFeatureByMarkerKeyRef.current;
    const now = getNowMs();
    let didMutateTransitions = false;
    let shouldStartAnimationLoop = false;

    for (const markerKey of nextPinnedFeatureByMarkerKey.keys()) {
      if (previousPinnedFeatureByMarkerKey.has(markerKey)) {
        continue;
      }
      pinPromoteStartedAtByMarkerKey.set(markerKey, now);
      pinPendingPromoteDelayByMarkerKey.delete(markerKey);
      pinDemoteFeatureByMarkerKey.delete(markerKey);
      didMutateTransitions = true;
      shouldStartAnimationLoop = true;
    }
    for (const [markerKey, feature] of previousPinnedFeatureByMarkerKey) {
      if (nextPinnedFeatureByMarkerKey.has(markerKey)) {
        continue;
      }
      pinDemoteFeatureByMarkerKey.set(markerKey, { startedAtMs: now, feature });
      pinPromoteStartedAtByMarkerKey.delete(markerKey);
      pinPendingPromoteDelayByMarkerKey.delete(markerKey);
      didMutateTransitions = true;
      shouldStartAnimationLoop = true;
    }
    for (const markerKey of Array.from(pinPromoteStartedAtByMarkerKey.keys())) {
      if (nextPinnedFeatureByMarkerKey.has(markerKey)) {
        continue;
      }
      pinPromoteStartedAtByMarkerKey.delete(markerKey);
      didMutateTransitions = true;
    }
    for (const markerKey of Array.from(pinPendingPromoteDelayByMarkerKey.keys())) {
      if (nextPinnedFeatureByMarkerKey.has(markerKey)) {
        continue;
      }
      pinPendingPromoteDelayByMarkerKey.delete(markerKey);
      didMutateTransitions = true;
    }
    for (const markerKey of Array.from(pinDemoteFeatureByMarkerKey.keys())) {
      if (!nextPinnedFeatureByMarkerKey.has(markerKey)) {
        continue;
      }
      pinDemoteFeatureByMarkerKey.delete(markerKey);
      didMutateTransitions = true;
    }

    previousPinnedFeatureByMarkerKeyRef.current = nextPinnedFeatureByMarkerKey;

    if (didMutateTransitions) {
      setPinTransitionClockMs(now);
    }
    if (shouldStartAnimationLoop) {
      runPinTransitionFrameRef.current();
    }
  }, [buildMarkerKey, markersRenderKey, sortedRestaurantMarkers]);

  React.useEffect(() => {
    return () => {
      if (pinTransitionFrameRequestRef.current != null) {
        cancelAnimationFrame(pinTransitionFrameRequestRef.current);
        pinTransitionFrameRequestRef.current = null;
      }
      pinPromoteStartedAtByMarkerKeyRef.current.clear();
      pinPendingPromoteDelayByMarkerKeyRef.current.clear();
      pinDemoteFeatureByMarkerKeyRef.current.clear();
      pinInitialRevealQueuedRef.current = false;
      labelStickyRefreshQueuedRef.current = false;
      if (labelStickyRefreshTimeoutRef.current) {
        clearTimeout(labelStickyRefreshTimeoutRef.current);
        labelStickyRefreshTimeoutRef.current = null;
      }
    };
  }, []);

  const handleMapViewportLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMapViewportSize((previous) => {
      if (previous.width === width && previous.height === height) {
        return previous;
      }
      return { width, height };
    });
  }, []);

  const runPinTransitionFrameRef = React.useRef<() => void>(() => undefined);
  const runPinTransitionFrame = React.useCallback(() => {
    if (pinTransitionFrameRequestRef.current != null) {
      return;
    }

    pinTransitionFrameRequestRef.current = requestAnimationFrame(() => {
      pinTransitionFrameRequestRef.current = null;

      const nowMs = getNowMs();
      const promoteTransitions = pinPromoteStartedAtByMarkerKeyRef.current;
      const pendingPromoteDelays = pinPendingPromoteDelayByMarkerKeyRef.current;
      const demoteTransitions = pinDemoteFeatureByMarkerKeyRef.current;
      let hasActiveTransitions = false;

      if (pendingPromoteDelays.size > 0) {
        pendingPromoteDelays.forEach((delayMs, markerKey) => {
          promoteTransitions.set(markerKey, nowMs + Math.max(0, delayMs));
        });
        pendingPromoteDelays.clear();
        pinInitialRevealQueuedRef.current = false;
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

      setPinTransitionClockMs(nowMs);

      if (hasActiveTransitions) {
        runPinTransitionFrameRef.current();
      }
    });
  }, []);
  runPinTransitionFrameRef.current = runPinTransitionFrame;

  const runStickyLabelRefreshRef = React.useRef<() => void>(() => undefined);
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

    void refreshStickyLabelCandidates().finally(() => {
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
  }, [refreshStickyLabelCandidates]);
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
    markersRenderKey,
    scheduleStickyLabelRefresh,
    shouldRenderLabels,
  ]);

  const handleDotPress = React.useCallback(
    (event: OnPressEvent) => {
      const features = event?.features ?? [];
      if (features.length === 0) {
        return;
      }
      const target =
        getCoordinateFromPressEvent(event) ?? getCoordinateFromPressFeature(features[0]) ?? null;
      if (!target) {
        const restaurantId = getRestaurantIdFromPressFeature(features[0]);
        if (restaurantId) {
          onMarkerPress?.(restaurantId, getCoordinateFromPressFeature(features[0]));
        }
        return;
      }
      const pressMatch = pickClosestRestaurantIdFromPressFeatures(features, target);
      const restaurantId = pressMatch?.restaurantId ?? getRestaurantIdFromPressFeature(features[0]);
      if (!restaurantId) {
        return;
      }
      if (pinnedRestaurantIds.has(restaurantId)) {
        return;
      }
      onMarkerPress?.(restaurantId, pressMatch?.coordinate ?? target);
    },
    [onMarkerPress, pinnedRestaurantIds]
  );

  React.useEffect(() => {
    if (!shouldRenderDots) {
      dotPinnedKeysRef.current = new Set();
      dotPinnedStateResetKeyRef.current = null;
      return;
    }
    const mapInstance = mapRef.current;
    if (!mapInstance?.setFeatureState) {
      return;
    }

    const resetKey = `${styleURL}::${markersRenderKey}::${
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
  }, [
    dotRestaurantFeatures,
    markersRenderKey,
    pinnedDotKeys,
    pinsRenderKey,
    shouldRenderDots,
    styleURL,
  ]);
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

      const probeFilter: unknown[] = ['all', ['has', 'markerKey'], ['has', 'labelCandidate']];
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

        const filtered = await mapInstance.queryRenderedFeaturesInRect([], probeFilter, null);
        probeFilterRendered = filtered?.features?.length ?? 0;

        if (typeof mapInstance.querySourceFeatures === 'function') {
          const source = await mapInstance.querySourceFeatures(
            RESTAURANT_LABEL_SOURCE_ID,
            ['has', 'markerKey'] as unknown[],
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
        const filter: unknown[] = ['all', ['has', 'markerKey'], ['has', 'labelCandidate']];
        const filtered = await mapInstance.queryRenderedFeaturesInRect([], filter, null);
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
  React.useEffect(() => {
    visualReadySignaledRequestKeyRef.current = null;
    visualReadyPendingFramesRef.current = 0;
    visualReadyAwaitingPinTransitionStartRef.current = false;
  }, [visualReadyRequestKey]);

  React.useEffect(() => {
    if (!visualReadyRequestKey || !shouldSignalVisualReady) {
      visualReadyPendingFramesRef.current = 0;
      visualReadyAwaitingPinTransitionStartRef.current = false;
      return;
    }
    // Wait for a couple of render ticks after marker source/layer updates so we only ack after
    // the map has had a chance to paint the current pin set.
    visualReadyPendingFramesRef.current = 2;
    visualReadyAwaitingPinTransitionStartRef.current =
      pinInitialRevealQueuedRef.current && sortedRestaurantMarkers.length > 0;
  }, [
    markersRenderKey,
    pinsRenderKey,
    shouldSignalVisualReady,
    sortedRestaurantMarkers.length,
    visualReadyRequestKey,
  ]);

  const handleDidFinishRenderingFrame = React.useCallback(() => {
    if (!onVisualReady || !visualReadyRequestKey || !shouldSignalVisualReady) {
      return;
    }
    if (visualReadySignaledRequestKeyRef.current === visualReadyRequestKey) {
      return;
    }
    if (visualReadyPendingFramesRef.current > 0) {
      visualReadyPendingFramesRef.current -= 1;
      return;
    }
    if (visualReadyAwaitingPinTransitionStartRef.current) {
      if (pinPendingPromoteDelayByMarkerKeyRef.current.size > 0) {
        return;
      }
      if (pinPromoteStartedAtByMarkerKeyRef.current.size <= 0) {
        return;
      }
      visualReadyAwaitingPinTransitionStartRef.current = false;
      // Leave one more frame so the newly-armed transition properties are guaranteed painted.
      visualReadyPendingFramesRef.current = Math.max(visualReadyPendingFramesRef.current, 1);
      return;
    }
    if (requireMarkerVisualsForVisualReady) {
      const hasMarkerVisuals =
        sortedRestaurantMarkers.length > 0 || (dotRestaurantFeatures?.features?.length ?? 0) > 0;
      if (!hasMarkerVisuals) {
        return;
      }
    }
    visualReadySignaledRequestKeyRef.current = visualReadyRequestKey;
    onVisualReady(visualReadyRequestKey);
  }, [
    dotRestaurantFeatures?.features?.length,
    onVisualReady,
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

  const handleMapLoadedStyle = React.useCallback(() => {
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleMapLoadedMap = React.useCallback(() => {
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleMapLoadError = React.useCallback(
    (event: unknown) => {
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

      logger.error('Mapbox map failed to load', {
        type: typeof eventRecord?.type === 'string' ? eventRecord.type : undefined,
        error: rawError,
        message: rawMessage,
        url: rawUrl ? getSafeUrlForLogs(rawUrl) : undefined,
        styleURL: getSafeStyleUrlForLogs(styleURL),
      });
    },
    [styleURL]
  );

  const handleTouchStart = React.useCallback(() => {
    onTouchStart?.();
  }, [onTouchStart]);

  const handleTouchEnd = React.useCallback(() => {
    onTouchEnd?.();
  }, [onTouchEnd]);

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
        onPress={onPress}
        onTouchStartCapture={handleTouchStart}
        onTouchEndCapture={handleTouchEnd}
        onTouchCancelCapture={handleTouchEnd}
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
        {shouldRenderDots ? (
          <React.Profiler id="SearchMapDots" onRender={profilerCallback}>
            <MapboxGL.ShapeSource
              id={DOT_SOURCE_ID}
              shape={dotRestaurantFeatures as FeatureCollection<Point, RestaurantFeatureProperties>}
              onPress={handleDotPress}
            >
              <MapboxGL.SymbolLayer
                id={DOT_LAYER_ID}
                slot="top"
                belowLayerID={SEARCH_PINS_Z_ANCHOR_LAYER_ID}
                style={dotLayerStyle}
                sourceID={DOT_SOURCE_ID}
              />
            </MapboxGL.ShapeSource>
          </React.Profiler>
        ) : null}
        {USE_STYLE_LAYER_PINS &&
        !shouldDisableMarkers &&
        stylePinFeaturesWithTransitions.features.length ? (
          <MapboxGL.ShapeSource
            id={STYLE_PINS_SOURCE_ID}
            shape={stylePinFeaturesWithTransitions}
            onPress={handleStylePinPress}
          >
            {stylePinLayerStack}
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
              {USE_STYLE_LAYER_PINS &&
              !shouldDisableMarkers &&
              PIN_COLLISION_OBSTACLE_GEOMETRY !== 'off' ? (
                <MapboxGL.ShapeSource
                  id={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
                  shape={stylePinFeaturesWithTransitions}
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
  if (prev.pinRevealRequestKey !== next.pinRevealRequestKey) {
    return false;
  }
  if (prev.markerRevealChunk !== next.markerRevealChunk) {
    return false;
  }
  if (prev.markerRevealStaggerMs !== next.markerRevealStaggerMs) {
    return false;
  }
  if (prev.disableMarkers !== next.disableMarkers) {
    return false;
  }
  if (prev.disableBlur !== next.disableBlur) {
    return false;
  }
  if (prev.onProfilerRender !== next.onProfilerRender) {
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
  if (prev.onVisualReady !== next.onVisualReady) {
    return false;
  }
  if (prev.visualReadyRequestKey !== next.visualReadyRequestKey) {
    return false;
  }
  if (prev.shouldSignalVisualReady !== next.shouldSignalVisualReady) {
    return false;
  }
  if (prev.requireMarkerVisualsForVisualReady !== next.requireMarkerVisualsForVisualReady) {
    return false;
  }
  return true;
};

export default React.memo(SearchMap, arePropsEqual);
