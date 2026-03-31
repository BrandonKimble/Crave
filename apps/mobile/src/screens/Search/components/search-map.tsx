import React from 'react';
import { Animated, Easing, View, findNodeHandle } from 'react-native';

import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';

type OnPressEvent = {
  features: Array<GeoJSON.Feature>;
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
};
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';

import pinAsset from '../../../assets/pin.png';
import pinFillAsset from '../../../assets/pin-fill.png';
import pinShadowAsset from '../../../assets/pin-shadow.png';
import { colors as themeColors } from '../../../constants/theme';
import type { StartupLocationSnapshot } from '../../../navigation/runtime/MainLaunchCoordinator';
import {
  startJsFrameSampler,
  type JsFrameSamplerWindowSummary,
} from '../../../perf/js-frame-sampler';
import {
  startUiFrameSampler,
  type UiFrameSamplerWindowSummary,
} from '../../../perf/ui-frame-sampler';
import type { Coordinate, MapBounds } from '../../../types';
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
import { isLngLatTuple } from '../utils/geo';
import {
  FOUR_DIGIT_RANK_MIN,
  TRIPLE_DIGIT_RANK_FONT_SIZE_DELTA,
  TRIPLE_DIGIT_RANK_MIN,
} from '../utils/rank-badge';
import { MARKER_VIEW_OVERSCAN_STYLE } from './marker-visibility';
import {
  useSearchMapNativeRenderOwnerStatus,
  useSearchMapNativeRenderOwnerSync,
} from './hooks/use-search-map-native-render-owner';
import { type SearchMapNativePresentationState } from './hooks/use-search-map-presentation-adapter';
import { useSearchMapLabelRuntime } from './hooks/use-search-map-label-runtime';
import { useSearchMapInteractionRuntime } from './hooks/use-search-map-interaction-runtime';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import {
  searchMapRenderController,
  type SearchMapRenderInteractionMode,
} from '../runtime/map/search-map-render-controller';
import { isSearchRuntimeMapPresentationPending } from '../runtime/shared/search-runtime-bus';
import {
  EMPTY_SEARCH_MAP_SOURCE_STORE,
  type SearchMapSourceStore,
} from '../runtime/map/search-map-source-store';

const MAP_PAN_DECELERATION_FACTOR = 0.995;
const SEARCH_MAP_COMPONENT_INSTANCE_ID_PREFIX = 'search-map-component';
const SEARCH_MAP_REF_OBJECT_ID_PREFIX = 'search-map-ref';
const SEARCH_MAP_NATIVE_REF_OBJECT_ID_PREFIX = 'search-map-native-ref';
let searchMapComponentInstanceSeq = 0;
let searchMapObjectDebugIdSeq = 0;
const searchMapObjectDebugIds = new WeakMap<object, string>();

const nextSearchMapComponentInstanceId = (): string => {
  searchMapComponentInstanceSeq += 1;
  return `${SEARCH_MAP_COMPONENT_INSTANCE_ID_PREFIX}:${searchMapComponentInstanceSeq}`;
};

const getSearchMapObjectDebugId = (
  value: object | null | undefined,
  prefix: string
): string | null => {
  if (value == null) {
    return null;
  }
  const existingId = searchMapObjectDebugIds.get(value);
  if (existingId) {
    return existingId;
  }
  searchMapObjectDebugIdSeq += 1;
  const nextId = `${prefix}:${searchMapObjectDebugIdSeq}`;
  searchMapObjectDebugIds.set(value, nextId);
  return nextId;
};

const roundPerfValue = (value: number): number => Math.round(value * 10) / 10;

const LABEL_STICKY_REFRESH_MS_IDLE = 140;
const LABEL_STICKY_REFRESH_MS_MOVING = 16;
const ENABLE_MAP_LABEL_PERF_DIAGNOSTICS = true;
const MAP_LABEL_PERF_WINDOW_MS = 1000;
// Sticky label tuning:
// - We keep a per-marker "locked" candidate (bottom/right/top/left) to prevent rapid anchor flips.
// - If the locked label isn't being placed, we unlock so Mapbox can pick a new side.
// - While moving, unlock/lock uses small hysteresis so brief query sampling gaps don't cause thrash.
const LABEL_STICKY_LOCK_STABLE_MS_MOVING = 140;
const LABEL_STICKY_LOCK_STABLE_MS_IDLE = 80;
const LABEL_STICKY_UNLOCK_MISSING_MS_MOVING = 260;
const LABEL_STICKY_UNLOCK_MISSING_MS_IDLE = 700;
const LABEL_STICKY_UNLOCK_MISSING_STREAK_MOVING = 3;
// Experimental: render restaurant pins via Mapbox style layers (instead of MarkerView).
// This avoids view-annotation gaps during fast pans and is the foundation for truly reversible fade.
const USE_STYLE_LAYER_PINS = true;
const STYLE_PIN_OUTLINE_IMAGE_ID = 'restaurant-pin-outline';
const STYLE_PIN_SHADOW_IMAGE_ID = 'restaurant-pin-shadow';
const STYLE_PIN_FILL_IMAGE_ID = 'restaurant-pin-fill';
const LABEL_MUTEX_IMAGE_ID = 'restaurant-label-mutex';
const STYLE_PINS_SOURCE_ID = 'restaurant-style-pins-source';
const PIN_INTERACTION_SOURCE_ID = 'restaurant-pin-interaction-source';
const LABEL_INTERACTION_SOURCE_ID = 'restaurant-label-interaction-source';

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
const PIN_COLLISION_SIDE_PAD_PX = 3;
// Move the shared per-restaurant collision point used to enforce "one candidate label" placement.
// This avoids the mutex being blocked by another pin's collision obstacle when pins stack.
const LABEL_MUTEX_POINT: 'below-pin' | 'above-pin' = 'above-pin';

// Approximate the MarkerView drop-shadow using the historical soft-edged sprite.
const STYLE_PINS_SHADOW_OPACITY = 0.65;
const STYLE_PINS_SHADOW_TRANSLATE: [number, number] = [
  0,
  1.25 + 18 * (PIN_MARKER_RENDER_SIZE / 98),
];
const PIN_OUTLINE_LOGICAL_HEIGHT_PX = 480;
const PIN_FILL_LOGICAL_HEIGHT_PX = 360;
const STYLE_PINS_OUTLINE_ICON_SIZE = PIN_MARKER_RENDER_SIZE / PIN_OUTLINE_LOGICAL_HEIGHT_PX;
const STYLE_PINS_SHADOW_ICON_SIZE = PIN_MARKER_RENDER_SIZE / 98;
const STYLE_PINS_FILL_ICON_SIZE = PIN_FILL_RENDER_HEIGHT / PIN_FILL_LOGICAL_HEIGHT_PX;
const STYLE_PINS_FILL_OFFSET_RENDER_PX = -(
  PIN_MARKER_RENDER_SIZE -
  (PIN_FILL_TOP_OFFSET + PIN_FILL_RENDER_HEIGHT)
);
const STYLE_PINS_FILL_OFFSET_IMAGE_PX =
  STYLE_PINS_FILL_OFFSET_RENDER_PX / STYLE_PINS_FILL_ICON_SIZE;
const STYLE_PINS_RANK_TRANSLATE_Y = PIN_FILL_CENTER_Y - PIN_MARKER_RENDER_SIZE;
const PIN_GLYPH_FONT_STACK = ['icomoon Regular'];
const PIN_GLYPH_OUTLINE = '\ue900';
const PIN_GLYPH_FILL = '\ue901';
const ENABLE_MAP_VIEW_DIAGNOSTICS = false;
const ENABLE_MAP_REVEAL_DIAGNOSTICS = false;
const PIN_GLYPH_TRANSLATE_Y_PX = Math.round(PIN_MARKER_RENDER_SIZE * 0.3);
const PIN_GLYPH_FILL_RELATIVE_TRANSLATE_Y_PX = -2;
const PIN_GLYPH_FILL_RELATIVE_TRANSLATE_X_PX = -0.3;

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
const PIN_COLLISION_OUTLINE_SIDE_PAD_IMAGE_PX =
  PIN_COLLISION_SIDE_PAD_PX / (STYLE_PINS_OUTLINE_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
const PIN_COLLISION_FILL_SIDE_PAD_IMAGE_PX =
  PIN_COLLISION_SIDE_PAD_PX / (STYLE_PINS_FILL_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
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
  nativeLodZ?: number;
  nativeLodOpacity?: number;
  nativeLodRankOpacity?: number;
  nativeLabelOpacity?: number;
  nativeDotOpacity?: number;
  nativePresentationOpacity?: number;
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
  labelPreference?: LabelCandidate;
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

const PRIMARY_COLOR = '#ff3368';
const ZERO_CAMERA_PADDING = { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 };
const DOT_SOURCE_ID = 'restaurant-dot-source';
const DOT_LAYER_ID = 'restaurant-dot-layer';
const DOT_INTERACTION_SOURCE_ID = 'restaurant-dot-interaction-source';
const DOT_INTERACTION_LAYER_ID = 'restaurant-dot-interaction-layer';
const USER_LOCATION_SOURCE_ID = 'user-location-source';
const USER_LOCATION_ACCURACY_SOURCE_ID = 'user-location-accuracy-source';
const USER_LOCATION_ACCURACY_FILL_LAYER_ID = 'user-location-accuracy-fill-layer';
const USER_LOCATION_ACCURACY_STROKE_LAYER_ID = 'user-location-accuracy-stroke-layer';
const USER_LOCATION_SHADOW_LAYER_ID = 'user-location-shadow-layer';
const USER_LOCATION_DOT_LAYER_ID = 'user-location-dot-layer';
const USER_LOCATION_RING_LAYER_ID = 'user-location-ring-layer';
const USER_LOCATION_PULSE_MIN_SCALE = 1.4;
const USER_LOCATION_PULSE_MAX_SCALE = 1.8;

type UserLocationVisualSpec = {
  uncertaintyRadiusMeters: number;
  dotRadius: number;
  ringRadius: number;
  shadowRadius: number;
  accuracyOpacity: number;
  accuracyStrokeOpacity: number;
  shadowOpacity: number;
  dotColor: string;
  ringColor: string;
  ringOpacity: number;
  dotOpacity: number;
};

const areUserLocationVisualSpecsEqual = (
  left: UserLocationVisualSpec,
  right: UserLocationVisualSpec
): boolean =>
  left.uncertaintyRadiusMeters === right.uncertaintyRadiusMeters &&
  left.dotRadius === right.dotRadius &&
  left.ringRadius === right.ringRadius &&
  left.shadowRadius === right.shadowRadius &&
  left.accuracyOpacity === right.accuracyOpacity &&
  left.accuracyStrokeOpacity === right.accuracyStrokeOpacity &&
  left.shadowOpacity === right.shadowOpacity &&
  left.dotColor === right.dotColor &&
  left.ringColor === right.ringColor &&
  left.ringOpacity === right.ringOpacity &&
  left.dotOpacity === right.dotOpacity;

const EARTH_RADIUS_METERS = 6_371_000;
const USER_LOCATION_UNCERTAINTY_STEPS = 128;
const USER_LOCATION_UNCERTAINTY_SCALE = 0.7;

const resolveDisplayedUncertaintyRadiusMeters = ({
  accuracyMeters,
  reducedAccuracy,
  isStale,
}: {
  accuracyMeters: number | null;
  reducedAccuracy: boolean;
  isStale: boolean;
}): number => {
  if (accuracyMeters != null) {
    return Math.max(Math.round(accuracyMeters * USER_LOCATION_UNCERTAINTY_SCALE), 18);
  }
  if (reducedAccuracy) {
    return 112;
  }
  if (isStale) {
    return 56;
  }
  return 32;
};

const buildCirclePolygon = (center: Coordinate, radiusMeters: number): Feature<Polygon> => {
  const latRadians = (center.lat * Math.PI) / 180;
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const coordinates: number[][] = [];

  for (let step = 0; step <= USER_LOCATION_UNCERTAINTY_STEPS; step += 1) {
    const bearing = (2 * Math.PI * step) / USER_LOCATION_UNCERTAINTY_STEPS;
    const sinLat = Math.sin(latRadians);
    const cosLat = Math.cos(latRadians);
    const sinAngular = Math.sin(angularDistance);
    const cosAngular = Math.cos(angularDistance);
    const nextLat = Math.asin(sinLat * cosAngular + cosLat * sinAngular * Math.cos(bearing));
    const nextLng =
      (center.lng * Math.PI) / 180 +
      Math.atan2(Math.sin(bearing) * sinAngular * cosLat, cosAngular - sinLat * Math.sin(nextLat));
    coordinates.push([(nextLng * 180) / Math.PI, (nextLat * 180) / Math.PI]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
};

const UserLocationLayers = React.memo(
  function UserLocationLayers({
    userLocationAccuracyFeatureCollection,
    userLocationFeatureCollection,
    userLocationVisualSpec,
  }: {
    userLocationAccuracyFeatureCollection: FeatureCollection<Polygon>;
    userLocationFeatureCollection: FeatureCollection<Point>;
    userLocationVisualSpec: UserLocationVisualSpec;
  }) {
    const [pulseScale, setPulseScale] = React.useState(USER_LOCATION_PULSE_MIN_SCALE);

    React.useEffect(() => {
      const pulse = new Animated.Value(0);
      let lastQuantizedValue = USER_LOCATION_PULSE_MIN_SCALE;
      const listenerId = pulse.addListener(({ value }) => {
        const nextScale =
          USER_LOCATION_PULSE_MIN_SCALE +
          (USER_LOCATION_PULSE_MAX_SCALE - USER_LOCATION_PULSE_MIN_SCALE) * value;
        const quantizedScale = Math.round(nextScale * 100) / 100;
        if (quantizedScale !== lastQuantizedValue) {
          lastQuantizedValue = quantizedScale;
          setPulseScale(quantizedScale);
        }
      });
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1000,
            easing: Easing.in(Easing.quad),
            useNativeDriver: false,
          }),
        ])
      );
      animation.start();
      return () => {
        animation.stop();
        pulse.removeListener(listenerId);
        pulse.removeAllListeners();
      };
    }, []);

    return (
      <React.Fragment>
        <MapboxGL.ShapeSource
          id={USER_LOCATION_ACCURACY_SOURCE_ID}
          shape={userLocationAccuracyFeatureCollection}
        >
          <MapboxGL.FillLayer
            id={USER_LOCATION_ACCURACY_FILL_LAYER_ID}
            slot="top"
            sourceID={USER_LOCATION_ACCURACY_SOURCE_ID}
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={{
              fillColor: userLocationVisualSpec.dotColor,
              fillOpacity: userLocationVisualSpec.accuracyOpacity,
            }}
          />
          <MapboxGL.LineLayer
            id={USER_LOCATION_ACCURACY_STROKE_LAYER_ID}
            slot="top"
            sourceID={USER_LOCATION_ACCURACY_SOURCE_ID}
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={{
              lineColor: userLocationVisualSpec.dotColor,
              lineOpacity: userLocationVisualSpec.accuracyStrokeOpacity,
              lineWidth: 1.5,
              lineJoin: 'round',
              lineCap: 'round',
            }}
          />
        </MapboxGL.ShapeSource>
        <MapboxGL.ShapeSource id={USER_LOCATION_SOURCE_ID} shape={userLocationFeatureCollection}>
          <MapboxGL.CircleLayer
            id={USER_LOCATION_SHADOW_LAYER_ID}
            slot="top"
            sourceID={USER_LOCATION_SOURCE_ID}
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={{
              circleRadius: userLocationVisualSpec.shadowRadius,
              circleColor: 'rgba(15, 23, 42, 1)',
              circleOpacity: userLocationVisualSpec.shadowOpacity,
              circleBlur: 0.9,
              circleTranslate: [0, 1],
              circleTranslateAnchor: 'viewport',
              circlePitchAlignment: 'viewport',
            }}
          />
          <MapboxGL.CircleLayer
            id={USER_LOCATION_RING_LAYER_ID}
            slot="top"
            sourceID={USER_LOCATION_SOURCE_ID}
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={{
              circleRadius: userLocationVisualSpec.ringRadius,
              circleColor: userLocationVisualSpec.ringColor,
              circleOpacity: userLocationVisualSpec.ringOpacity,
              circlePitchAlignment: 'viewport',
            }}
          />
          <MapboxGL.CircleLayer
            id={USER_LOCATION_DOT_LAYER_ID}
            slot="top"
            sourceID={USER_LOCATION_SOURCE_ID}
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={{
              circleRadius: userLocationVisualSpec.dotRadius * pulseScale,
              circleColor: userLocationVisualSpec.dotColor,
              circleOpacity: userLocationVisualSpec.dotOpacity,
              circlePitchAlignment: 'viewport',
            }}
          />
        </MapboxGL.ShapeSource>
      </React.Fragment>
    );
  },
  (prev, next) =>
    prev.userLocationAccuracyFeatureCollection === next.userLocationAccuracyFeatureCollection &&
    prev.userLocationFeatureCollection === next.userLocationFeatureCollection &&
    areUserLocationVisualSpecsEqual(prev.userLocationVisualSpec, next.userLocationVisualSpec)
);
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
const OVERLAY_Z_ANCHOR_STYLE: MapboxGL.SymbolLayerStyle = {
  // Render nothing; the layer exists purely as an ordering anchor.
  textField: '',
  textOpacity: 0,
} as MapboxGL.SymbolLayerStyle;
const RESTAURANT_LABEL_SOURCE_ID = 'restaurant-source';
const RESTAURANT_LABEL_COLLISION_SOURCE_ID = 'restaurant-label-collision-source';

type LabelCandidate = 'bottom' | 'right' | 'top' | 'left';
const LABEL_CANDIDATES_IN_ORDER: ReadonlyArray<LabelCandidate> = ['bottom', 'right', 'top', 'left'];
const LABEL_CANDIDATE_PRIORITY_BY_PREFERENCE = {
  bottom: ['bottom', 'right', 'top', 'left'],
  right: ['right', 'top', 'left', 'bottom'],
  top: ['top', 'left', 'bottom', 'right'],
  left: ['left', 'bottom', 'right', 'top'],
} as const satisfies Record<LabelCandidate, readonly LabelCandidate[]>;

type LabelLayerSpec = {
  preferredCandidate: LabelCandidate;
  candidate: LabelCandidate;
  layerId: string;
  interactionLayerId: string;
};

const LABEL_LAYER_SPECS: ReadonlyArray<LabelLayerSpec> = LABEL_CANDIDATES_IN_ORDER.flatMap(
  (preferredCandidate) =>
    [...LABEL_CANDIDATE_PRIORITY_BY_PREFERENCE[preferredCandidate]].reverse().map((candidate) => ({
      preferredCandidate,
      candidate,
      layerId: `restaurant-labels-preferred-${preferredCandidate}-candidate-${candidate}`,
      interactionLayerId: `restaurant-labels-interaction-preferred-${preferredCandidate}-candidate-${candidate}`,
    }))
);

const LABEL_INTERACTION_LAYER_IDS = LABEL_LAYER_SPECS.map(
  ({ interactionLayerId }) => interactionLayerId
);

// Minimum spacing to keep label candidates from being blocked by the pin's collision silhouette
// once we shift the ring upward to align with the pin fill centerline.
const LABEL_MIN_BOTTOM_GAP_PX = 3.5;
const LABEL_MIN_TOP_GAP_PX = 4;
const LABEL_MIN_HORIZONTAL_GAP_PX = Math.ceil(PIN_MARKER_RENDER_SIZE / 2) + 6;

const TRANSPARENT_PIXEL_IMAGE = {
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAFAAL/GMurNwAAAABJRU5ErkJggg==',
} as const;

// Tiny transparent icon used as a per-restaurant "mutex" so only one candidate label can place.
// This remains non-visual; the visible pin art is glyph-only.
const LABEL_MUTEX_ICON_RENDER_SIZE_PX = 0.8;
const LABEL_MUTEX_ICON_SIZE = LABEL_MUTEX_ICON_RENDER_SIZE_PX;
// Move the mutex into screen pixel space so placement does not depend on asset dimensions.
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

const getLabelStickyIdentityKeyFromFeature = (
  feature: Feature<Point, RestaurantFeatureProperties>
): string | null => {
  const markerKey = typeof feature.id === 'string' ? feature.id : null;
  return buildLabelStickyIdentityKey(feature.properties.restaurantId ?? null, markerKey);
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

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

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
  textIgnorePlacement: true,
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_SHADOW_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_SHADOW_IMAGE_ID,
  iconSize: STYLE_PINS_SHADOW_ICON_SIZE,
  iconAnchor: 'bottom',
  symbolZOrder: 'source',
  iconAllowOverlap: true,
  // Shadow should never affect placement/collision decisions for labels.
  iconIgnorePlacement: true,
  iconOpacity: STYLE_PINS_SHADOW_OPACITY,
  iconTranslate: STYLE_PINS_SHADOW_TRANSLATE,
  iconTranslateAnchor: 'viewport',
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_FILL_GLYPH_STYLE: MapboxGL.SymbolLayerStyle = {
  textField: PIN_GLYPH_FILL,
  textFont: PIN_GLYPH_FONT_STACK,
  textSize: PIN_FILL_RENDER_HEIGHT,
  textColor: '#ffffff',
  textAnchor: 'bottom',
  textTranslate: [
    PIN_GLYPH_FILL_RELATIVE_TRANSLATE_X_PX,
    STYLE_PINS_FILL_OFFSET_RENDER_PX +
      PIN_GLYPH_TRANSLATE_Y_PX +
      PIN_GLYPH_FILL_RELATIVE_TRANSLATE_Y_PX,
  ],
  textTranslateAnchor: 'viewport',
  symbolZOrder: 'source',
  textAllowOverlap: true,
  textIgnorePlacement: true,
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_RANK_STYLE: MapboxGL.SymbolLayerStyle = {
  symbolZOrder: 'source',
  textField: [
    'case',
    ['>=', ['coalesce', ['get', 'rank'], 0], FOUR_DIGIT_RANK_MIN],
    [
      'concat',
      ['to-string', ['floor', ['/', ['coalesce', ['get', 'rank'], 0], FOUR_DIGIT_RANK_MIN]]],
      'k+',
    ],
    ['to-string', ['get', 'rank']],
  ],
  // Match `styles.pinRank` (white, bold-ish).
  textSize: [
    'case',
    ['>=', ['coalesce', ['get', 'rank'], 0], TRIPLE_DIGIT_RANK_MIN],
    PIN_RANK_FONT_SIZE - TRIPLE_DIGIT_RANK_FONT_SIZE_DELTA,
    PIN_RANK_FONT_SIZE,
  ],
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

const getNowMs = () =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
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
  onNativeViewportChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  onMapFullyRendered?: () => void;
  onRevealBatchMountedHidden?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    readyAtMs: number;
  }) => void;
  onMarkerRevealStarted?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    startedAtMs: number;
  }) => void;
  onMarkerRevealFirstVisibleFrame?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    syncedAtMs: number;
  }) => void;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onMarkerRevealSettled?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  }) => void;
  onMarkerDismissStarted?: (payload: { requestKey: string; startedAtMs: number }) => void;
  onMarkerDismissSettled?: (payload: { requestKey: string; settledAtMs: number }) => void;
  selectedRestaurantId?: string | null;
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore?: SearchMapSourceStore | null;
  pinInteractionSourceStore: SearchMapSourceStore;
  dotInteractionSourceStore: SearchMapSourceStore;
  markersRenderKey: string;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  restaurantLabelStyle: MapboxGL.SymbolLayerStyle;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  userLocationSnapshot: StartupLocationSnapshot | null;
  disableMarkers?: boolean;
  disableBlur?: boolean;
  onProfilerRender?: React.ProfilerOnRenderCallback;
  mapQueryBudget?: MapQueryBudget | null;
  onRuntimeMechanismEvent?: (
    event: 'runtime_write_span',
    payload?: Record<string, unknown>
  ) => void;
  nativeViewportState: {
    bounds: MapBounds | null;
    isGestureActive: boolean;
    isMoving: boolean;
  };
  nativePresentationState: SearchMapNativePresentationState;
  nativeInteractionMode: SearchMapRenderInteractionMode;
  labelResetRequestKey: string | null;
  maxFullPins: number;
  lodVisibleCandidateBuffer: number;
  lodPinToggleStableMsMoving: number;
  lodPinToggleStableMsIdle: number;
  lodPinOffscreenToggleStableMsMoving: number;
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
  onNativeViewportChanged,
  onMapIdle,
  onMapLoaded,
  onMapFullyRendered,
  onRevealBatchMountedHidden,
  onMarkerRevealStarted,
  onMarkerRevealFirstVisibleFrame,
  onMarkerPress,
  onMarkerRevealSettled,
  onMarkerDismissStarted,
  onMarkerDismissSettled,
  selectedRestaurantId,
  pinSourceStore,
  dotSourceStore,
  pinInteractionSourceStore,
  dotInteractionSourceStore,
  markersRenderKey: incomingMarkersRenderKey,
  buildMarkerKey,
  restaurantLabelStyle,
  isMapStyleReady,
  userLocation,
  userLocationSnapshot,
  disableMarkers = false,
  onProfilerRender,
  mapQueryBudget = null,
  onRuntimeMechanismEvent: _onRuntimeMechanismEvent,
  nativeViewportState,
  nativePresentationState,
  nativeInteractionMode,
  labelResetRequestKey,
  maxFullPins: _maxFullPins,
  lodVisibleCandidateBuffer: _lodVisibleCandidateBuffer,
  lodPinToggleStableMsMoving: _lodPinToggleStableMsMoving,
  lodPinToggleStableMsIdle: _lodPinToggleStableMsIdle,
  lodPinOffscreenToggleStableMsMoving: _lodPinOffscreenToggleStableMsMoving,
}) => {
  const searchMapComponentInstanceIdRef = React.useRef<string | null>(null);
  if (searchMapComponentInstanceIdRef.current == null) {
    searchMapComponentInstanceIdRef.current = nextSearchMapComponentInstanceId();
  }
  const searchMapComponentInstanceId = searchMapComponentInstanceIdRef.current;
  const shouldDisableMarkers = disableMarkers === true;
  const { batchPhase } = nativePresentationState;
  const visualReadyRequestKey = labelResetRequestKey;
  const markersRenderKey = incomingMarkersRenderKey;
  const shouldProjectSearchMarkerFamilies =
    batchPhase === 'reveal_requested' ||
    batchPhase === 'revealing' ||
    batchPhase === 'live' ||
    batchPhase === 'dismiss_preroll' ||
    batchPhase === 'dismissing';
  const presentedPinSourceStore = shouldProjectSearchMarkerFamilies
    ? pinSourceStore
    : EMPTY_SEARCH_MAP_SOURCE_STORE;
  const presentedPinInteractionSourceStore = shouldProjectSearchMarkerFamilies
    ? pinInteractionSourceStore
    : EMPTY_SEARCH_MAP_SOURCE_STORE;
  const presentedDotSourceStore = shouldProjectSearchMarkerFamilies
    ? dotSourceStore ?? EMPTY_SEARCH_MAP_SOURCE_STORE
    : EMPTY_SEARCH_MAP_SOURCE_STORE;
  const presentedDotInteractionSourceStore = shouldProjectSearchMarkerFamilies
    ? dotInteractionSourceStore
    : EMPTY_SEARCH_MAP_SOURCE_STORE;
  const shouldRenderSearchMarkerLayers =
    !shouldDisableMarkers && isMapStyleReady && shouldProjectSearchMarkerFamilies;
  const shouldRenderLabels = shouldRenderSearchMarkerLayers;
  const shouldRenderDots =
    shouldRenderSearchMarkerLayers && presentedDotSourceStore.idsInOrder.length > 0;
  const shouldMountDotLayers = shouldRenderSearchMarkerLayers;
  const userLocationFeatureCollection = React.useMemo<FeatureCollection<Point>>(() => {
    if (!userLocation) {
      return {
        type: 'FeatureCollection',
        features: [],
      };
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'user-location',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: [userLocation.lng, userLocation.lat],
          },
        },
      ],
    };
  }, [userLocation]);
  const userLocationAccuracyFeatureCollection = React.useMemo<FeatureCollection<Polygon>>(() => {
    if (!userLocation) {
      return {
        type: 'FeatureCollection',
        features: [],
      };
    }
    const snapshot = userLocationSnapshot;
    const isStale = snapshot?.isStale ?? true;
    const reducedAccuracy = snapshot?.reducedAccuracy ?? false;
    const accuracyMeters =
      typeof snapshot?.accuracyMeters === 'number' && Number.isFinite(snapshot.accuracyMeters)
        ? snapshot.accuracyMeters
        : null;
    const shouldShowAccuracyCircle =
      reducedAccuracy || isStale || (accuracyMeters != null && accuracyMeters > 24);
    if (!shouldShowAccuracyCircle) {
      return {
        type: 'FeatureCollection',
        features: [],
      };
    }
    const uncertaintyRadiusMeters = resolveDisplayedUncertaintyRadiusMeters({
      accuracyMeters,
      reducedAccuracy,
      isStale,
    });
    return {
      type: 'FeatureCollection',
      features: [buildCirclePolygon(userLocation, uncertaintyRadiusMeters)],
    };
  }, [userLocation, userLocationSnapshot]);
  const userLocationVisualSpec = React.useMemo(() => {
    const snapshot = userLocationSnapshot;
    const isStale = snapshot?.isStale ?? true;
    const reducedAccuracy = snapshot?.reducedAccuracy ?? false;
    const accuracyMeters =
      typeof snapshot?.accuracyMeters === 'number' && Number.isFinite(snapshot.accuracyMeters)
        ? snapshot.accuracyMeters
        : null;
    const shouldShowAccuracyCircle =
      reducedAccuracy || isStale || (accuracyMeters != null && accuracyMeters > 24);
    return {
      uncertaintyRadiusMeters: resolveDisplayedUncertaintyRadiusMeters({
        accuracyMeters,
        reducedAccuracy,
        isStale,
      }),
      dotRadius: 4.5,
      ringRadius: 11,
      shadowRadius: 16,
      accuracyOpacity: shouldShowAccuracyCircle ? (reducedAccuracy ? 0.18 : 0.1) : 0,
      accuracyStrokeOpacity: shouldShowAccuracyCircle ? 0.9 : 0,
      shadowOpacity: isStale ? 0.22 : 0.4,
      dotColor: themeColors.secondaryAccent,
      ringColor: '#FFFFFF',
      ringOpacity: 1,
      dotOpacity: isStale ? 0.9 : 1,
    };
  }, [userLocationSnapshot]);

  const recordRuntimeAttribution = React.useCallback(
    (contributor: string, durationMs: number) => {
      if (
        ENABLE_MAP_LABEL_PERF_DIAGNOSTICS &&
        contributor.startsWith('map_label_') &&
        Number.isFinite(durationMs) &&
        durationMs >= 0
      ) {
        const totals = mapLabelPerfDiagRef.current.attributionTotalsMs;
        const counts = mapLabelPerfDiagRef.current.attributionCounts;
        const maxes = mapLabelPerfDiagRef.current.attributionMaxMs;
        totals.set(contributor, (totals.get(contributor) ?? 0) + durationMs);
        counts.set(contributor, (counts.get(contributor) ?? 0) + 1);
        maxes.set(contributor, Math.max(maxes.get(contributor) ?? 0, durationMs));
      }
      mapQueryBudget?.recordRuntimeAttributionDurationMs(contributor, durationMs);
    },
    [mapQueryBudget]
  );
  const mapLabelPerfDiagRef = React.useRef<{
    attributionTotalsMs: Map<string, number>;
    attributionCounts: Map<string, number>;
    attributionMaxMs: Map<string, number>;
    labelObservationEventCount: number;
    labelObservationDirtyEventCount: number;
    labelObservationMaxEffectiveRenderedFeatures: number;
    labelObservationLastEffectiveRenderedFeatures: number;
    labelObservationLastVisibleLabelCount: number;
    latestJsWindow: JsFrameSamplerWindowSummary | null;
    latestUiWindow: UiFrameSamplerWindowSummary | null;
    jsStallCount: number;
    uiStallCount: number;
  }>({
    attributionTotalsMs: new Map(),
    attributionCounts: new Map(),
    attributionMaxMs: new Map(),
    labelObservationEventCount: 0,
    labelObservationDirtyEventCount: 0,
    labelObservationMaxEffectiveRenderedFeatures: 0,
    labelObservationLastEffectiveRenderedFeatures: 0,
    labelObservationLastVisibleLabelCount: 0,
    latestJsWindow: null,
    latestUiWindow: null,
    jsStallCount: 0,
    uiStallCount: 0,
  });
  const nativeViewportChangedHandlerRef = React.useRef<
    | ((payload: {
        center: [number, number];
        zoom: number;
        bounds: {
          northEast: { lat: number; lng: number };
          southWest: { lat: number; lng: number };
        };
        isGestureActive: boolean;
        isMoving: boolean;
      }) => void)
    | null
  >(null);
  const handleNativeViewportChangedFromOwner = React.useCallback(
    (payload: {
      center: [number, number];
      zoom: number;
      bounds: {
        northEast: { lat: number; lng: number };
        southWest: { lat: number; lng: number };
      };
      isGestureActive: boolean;
      isMoving: boolean;
    }) => {
      nativeViewportChangedHandlerRef.current?.(payload);
    },
    []
  );
  const mapRefDiagRef = React.useRef<{
    mapRefObjectId: string | null;
    nativeRefObjectId: string | null;
    mapTag: number | null;
    usedNativeRef: boolean;
  } | null>(null);
  const [resolvedMapTag, setResolvedMapTag] = React.useState<number | null>(null);
  const [mapRefIdentityRevision, setMapRefIdentityRevision] = React.useState(0);
  const nativeRefSnapshot =
    (mapRef.current as { _nativeRef?: unknown } | null)?._nativeRef ?? mapRef.current;
  const mapRefObjectId = getSearchMapObjectDebugId(
    mapRef.current as object | null | undefined,
    SEARCH_MAP_REF_OBJECT_ID_PREFIX
  );
  const nativeRefObjectId = getSearchMapObjectDebugId(
    nativeRefSnapshot as object | null | undefined,
    SEARCH_MAP_NATIVE_REF_OBJECT_ID_PREFIX
  );
  const resolvedMapTagForRender = (() => {
    if (nativeRefSnapshot == null) {
      return null;
    }
    const tag = findNodeHandle(nativeRefSnapshot as never);
    return typeof tag === 'number' && tag > 0 ? tag : null;
  })();
  React.useEffect(() => {
    const nextSnapshot = {
      mapRefObjectId,
      nativeRefObjectId,
      mapTag: resolvedMapTagForRender,
      usedNativeRef: nativeRefSnapshot !== mapRef.current,
    };
    if (
      mapRefDiagRef.current?.mapRefObjectId === nextSnapshot.mapRefObjectId &&
      mapRefDiagRef.current?.nativeRefObjectId === nextSnapshot.nativeRefObjectId &&
      mapRefDiagRef.current?.mapTag === nextSnapshot.mapTag &&
      mapRefDiagRef.current?.usedNativeRef === nextSnapshot.usedNativeRef
    ) {
      return;
    }
    if (ENABLE_MAP_VIEW_DIAGNOSTICS) {
      logger.info('[MAP-VIEW-DIAG] refSnapshot', {
        componentInstanceId: searchMapComponentInstanceId,
        instanceId: nativeRenderOwnerInstanceId,
        mapRefObjectId,
        nativeRefObjectId,
        mapTag: resolvedMapTagForRender,
        usedNativeRef: nativeRefSnapshot !== mapRef.current,
        previousMapTag: mapRefDiagRef.current?.mapTag ?? null,
      });
    }
    mapRefDiagRef.current = nextSnapshot;
    setResolvedMapTag((previous) =>
      previous === resolvedMapTagForRender ? previous : resolvedMapTagForRender
    );
    setMapRefIdentityRevision((previous) => previous + 1);
  });
  const {
    instanceId: resolvedNativeRenderOwnerInstanceId,
    isAttached: resolvedIsNativeRenderOwnerAttached,
    isNativeAvailable: resolvedIsNativeRenderOwnerAvailable,
    attachState: resolvedNativeRenderOwnerAttachState,
    isNativeOwnerReady: resolvedIsNativeRenderOwnerReady,
    nativeFatalErrorMessage: resolvedNativeFatalErrorMessage,
    reportNativeFatalError: resolvedReportNativeFatalError,
  } = useSearchMapNativeRenderOwnerStatus({
    mapComponentInstanceId: searchMapComponentInstanceId,
    resolvedMapTag,
    mapRefIdentityRevision,
    isMapStyleReady,
    pinSourceId: STYLE_PINS_SOURCE_ID,
    pinInteractionSourceId: PIN_INTERACTION_SOURCE_ID,
    dotSourceId: DOT_SOURCE_ID,
    dotInteractionSourceId: DOT_INTERACTION_SOURCE_ID,
    labelSourceId: RESTAURANT_LABEL_SOURCE_ID,
    labelInteractionSourceId: LABEL_INTERACTION_SOURCE_ID,
    labelCollisionSourceId: RESTAURANT_LABEL_COLLISION_SOURCE_ID,
    onRevealBatchMountedHidden,
    onMarkerRevealStarted,
    onMarkerRevealFirstVisibleFrame,
    onMarkerRevealSettled: (payload) => {
      onMarkerRevealSettled?.({
        requestKey: payload.requestKey,
        frameGenerationId: payload.frameGenerationId,
        revealBatchId: payload.revealBatchId,
        markerRevealCommitId: null,
        settledAtMs: payload.settledAtMs,
      });
    },
    onMarkerDismissStarted,
    onMarkerDismissSettled,
    onViewportChanged: handleNativeViewportChangedFromOwner,
  });
  const nativeRenderOwnerInstanceId = resolvedNativeRenderOwnerInstanceId;
  const isNativeRenderOwnerAttached = resolvedIsNativeRenderOwnerAttached;
  const isNativeRenderOwnerAvailable = resolvedIsNativeRenderOwnerAvailable;
  const nativeRenderOwnerAttachState = resolvedNativeRenderOwnerAttachState;
  const isNativeRenderOwnerReady = resolvedIsNativeRenderOwnerReady;
  const nativeFatalErrorMessage = resolvedNativeFatalErrorMessage;
  const reportNativeFatalError = resolvedReportNativeFatalError;
  if (isMapStyleReady && !isNativeRenderOwnerAvailable) {
    throw new Error('SearchMap native render owner is required for the full cutover');
  }
  if (isMapStyleReady && nativeRenderOwnerAttachState === 'failed') {
    throw new Error(
      nativeFatalErrorMessage ?? 'SearchMap native render owner attach failed during full cutover'
    );
  }
  if (nativeFatalErrorMessage != null) {
    throw new Error(nativeFatalErrorMessage);
  }
  const isNativeOwnedMarkerRuntimeReady = isMapStyleReady && isNativeRenderOwnerReady;
  const mapDiagRef = React.useRef<{
    isMapStyleReady: boolean;
    isNativeRenderOwnerAttached: boolean;
    nativeRenderOwnerAttachState: string;
    isNativeRenderOwnerReady: boolean;
    isNativeOwnedMarkerRuntimeReady: boolean;
    nativeFatalErrorMessage: string | null;
  } | null>(null);
  React.useEffect(() => {
    const nextSnapshot = {
      isMapStyleReady,
      isNativeRenderOwnerAttached,
      nativeRenderOwnerAttachState,
      isNativeRenderOwnerReady,
      isNativeOwnedMarkerRuntimeReady,
      nativeFatalErrorMessage,
    };
    if (!ENABLE_MAP_VIEW_DIAGNOSTICS) {
      mapDiagRef.current = nextSnapshot;
      return;
    }
    const previousSnapshot = mapDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.isMapStyleReady === nextSnapshot.isMapStyleReady &&
      previousSnapshot.isNativeRenderOwnerAttached === nextSnapshot.isNativeRenderOwnerAttached &&
      previousSnapshot.nativeRenderOwnerAttachState === nextSnapshot.nativeRenderOwnerAttachState &&
      previousSnapshot.isNativeRenderOwnerReady === nextSnapshot.isNativeRenderOwnerReady &&
      previousSnapshot.isNativeOwnedMarkerRuntimeReady ===
        nextSnapshot.isNativeOwnedMarkerRuntimeReady &&
      previousSnapshot.nativeFatalErrorMessage === nextSnapshot.nativeFatalErrorMessage
    ) {
      return;
    }
    logger.info('[MAP-VIEW-DIAG] runtimeState', {
      instanceId: nativeRenderOwnerInstanceId,
      ...nextSnapshot,
    });
    mapDiagRef.current = nextSnapshot;
  }, [
    isMapStyleReady,
    isNativeOwnedMarkerRuntimeReady,
    isNativeRenderOwnerAttached,
    isNativeRenderOwnerReady,
    nativeFatalErrorMessage,
    nativeRenderOwnerAttachState,
    nativeRenderOwnerInstanceId,
  ]);
  const renderCallbackDiagRef = React.useRef({
    phaseKey: '',
    frameCount: 0,
    frameFullyCount: 0,
    lastFrameAtMs: 0,
    lastFrameFullyAtMs: 0,
  });
  const renderCallbackDiagSnapshotRef = React.useRef({
    instanceId: nativeRenderOwnerInstanceId,
    batchPhase,
    isMoving: nativeViewportState.isMoving,
    isMapStyleReady,
    isNativeRenderOwnerAttached,
    nativeRenderOwnerAttachState,
    isNativeOwnedMarkerRuntimeReady,
    pinCount: 0,
    dotCount: 0,
    labelCandidateCount: 0,
    visibleLabelCount: 0,
  });
  const logRenderCallback = React.useCallback((kind: 'frame' | 'frameFully') => {
    if (!ENABLE_MAP_VIEW_DIAGNOSTICS) {
      return;
    }
    const nowMs = Date.now();
    const snapshot = renderCallbackDiagSnapshotRef.current;
    const nextPhaseKey = [
      snapshot.batchPhase,
      snapshot.isMoving ? 'moving' : 'idle',
      snapshot.isMapStyleReady ? 'style_ready' : 'style_pending',
      snapshot.isNativeOwnedMarkerRuntimeReady ? 'runtime_ready' : 'runtime_pending',
    ].join(':');
    const diag = renderCallbackDiagRef.current;
    const phaseChanged = diag.phaseKey !== nextPhaseKey;
    if (phaseChanged) {
      diag.phaseKey = nextPhaseKey;
      diag.frameCount = 0;
      diag.frameFullyCount = 0;
      logger.info('[MAP-VIEW-DIAG] renderPhase', {
        instanceId: snapshot.instanceId,
        ts: nowMs,
        batchPhase: snapshot.batchPhase,
        isMoving: snapshot.isMoving,
        isMapStyleReady: snapshot.isMapStyleReady,
        isNativeRenderOwnerAttached: snapshot.isNativeRenderOwnerAttached,
        nativeRenderOwnerAttachState: snapshot.nativeRenderOwnerAttachState,
        isNativeOwnedMarkerRuntimeReady: snapshot.isNativeOwnedMarkerRuntimeReady,
        pinCount: snapshot.pinCount,
        dotCount: snapshot.dotCount,
        labelCandidateCount: snapshot.labelCandidateCount,
        visibleLabelCount: snapshot.visibleLabelCount,
      });
    }

    const previousAtMs = kind === 'frame' ? diag.lastFrameAtMs : diag.lastFrameFullyAtMs;
    const nextCount = kind === 'frame' ? (diag.frameCount += 1) : (diag.frameFullyCount += 1);
    const deltaMs = previousAtMs > 0 ? nowMs - previousAtMs : null;
    const isHighAttentionWindow =
      snapshot.isMoving || isSearchRuntimeMapPresentationPending(snapshot.batchPhase);
    if (kind === 'frame') {
      diag.lastFrameAtMs = nowMs;
    } else {
      diag.lastFrameFullyAtMs = nowMs;
    }

    if (
      !isHighAttentionWindow &&
      !phaseChanged &&
      nextCount > 2 &&
      (deltaMs == null || deltaMs < 120)
    ) {
      return;
    }

    logger.info('[MAP-VIEW-DIAG] renderCallback', {
      instanceId: snapshot.instanceId,
      ts: nowMs,
      kind,
      batchPhase: snapshot.batchPhase,
      isMoving: snapshot.isMoving,
      isMapStyleReady: snapshot.isMapStyleReady,
      isNativeOwnedMarkerRuntimeReady: snapshot.isNativeOwnedMarkerRuntimeReady,
      callbackCountInPhase: nextCount,
      deltaMs,
      pinCount: snapshot.pinCount,
      dotCount: snapshot.dotCount,
      labelCandidateCount: snapshot.labelCandidateCount,
      visibleLabelCount: snapshot.visibleLabelCount,
    });
  }, []);
  const handleDidFinishRenderingFrame = React.useCallback(() => {
    logRenderCallback('frame');
  }, [logRenderCallback]);
  const hasReportedFirstFullyRenderedFrameRef = React.useRef(false);
  const handleDidFinishRenderingFrameFully = React.useCallback(() => {
    logRenderCallback('frameFully');
    if (hasReportedFirstFullyRenderedFrameRef.current || !isMapStyleReady) {
      return;
    }
    hasReportedFirstFullyRenderedFrameRef.current = true;
    onMapFullyRendered?.();
  }, [isMapStyleReady, logRenderCallback, onMapFullyRendered]);
  const nativePresentationOpacityExpression = React.useMemo(
    () =>
      [
        'coalesce',
        ['feature-state', 'nativePresentationOpacity'],
        ['get', 'nativePresentationOpacity'],
        1,
      ] as const,
    []
  );
  const nativeLodOpacityExpression = React.useMemo(
    () =>
      ['coalesce', ['feature-state', 'nativeLodOpacity'], ['get', 'nativeLodOpacity'], 1] as const,
    []
  );
  const nativeLodRankOpacityExpression = React.useMemo(
    () =>
      [
        'coalesce',
        ['feature-state', 'nativeLodRankOpacity'],
        ['get', 'nativeLodRankOpacity'],
        1,
      ] as const,
    []
  );
  const nativeLabelOpacityExpression = React.useMemo(
    () =>
      [
        'coalesce',
        ['feature-state', 'nativeLabelOpacity'],
        ['get', 'nativeLabelOpacity'],
        1,
      ] as const,
    []
  );
  const nativeDotOpacityExpression = React.useMemo(
    () =>
      ['coalesce', ['feature-state', 'nativeDotOpacity'], ['get', 'nativeDotOpacity'], 1] as const,
    []
  );
  const nativeHighlightedExpression = React.useMemo(
    () => ['==', ['coalesce', ['feature-state', 'nativeHighlighted'], 0], 1] as const,
    []
  );
  const nativeDesiredPinFeatures = presentedPinSourceStore;
  const nativeDesiredPinInteractionFeatures = presentedPinInteractionSourceStore;
  const nativeDesiredDotFeatures = presentedDotSourceStore;
  const [optimisticSelectedRestaurantId, setOptimisticSelectedRestaurantId] = React.useState<
    string | null
  >(null);
  const effectiveSelectedRestaurantId = optimisticSelectedRestaurantId ?? selectedRestaurantId;
  React.useEffect(() => {
    setOptimisticSelectedRestaurantId(null);
  }, [selectedRestaurantId]);
  const highlightedMarkerKey = React.useMemo(() => {
    if (!effectiveSelectedRestaurantId) {
      return null;
    }
    const highlightedFeature =
      presentedPinSourceStore.idsInOrder
        .map((featureId) => presentedPinSourceStore.featureById.get(featureId))
        .find(
          (feature): feature is Feature<Point, RestaurantFeatureProperties> =>
            feature?.properties.restaurantId === effectiveSelectedRestaurantId
        ) ??
      presentedDotSourceStore.idsInOrder
        .map((featureId) => presentedDotSourceStore.featureById.get(featureId))
        .find(
          (feature): feature is Feature<Point, RestaurantFeatureProperties> =>
            feature?.properties.restaurantId === effectiveSelectedRestaurantId
        ) ??
      null;
    if (!highlightedFeature) {
      return null;
    }
    return typeof highlightedFeature.id === 'string' && highlightedFeature.id.length > 0
      ? highlightedFeature.id
      : buildMarkerKey(highlightedFeature as Feature<Point, RestaurantFeatureProperties>);
  }, [
    buildMarkerKey,
    effectiveSelectedRestaurantId,
    presentedDotSourceStore,
    presentedPinSourceStore,
  ]);
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
      textOpacity: ['*', nativePresentationOpacityExpression, nativeDotOpacityExpression],
      textOpacityTransition: PIN_OPACITY_TRANSITION,
      // Keep dots a constant screen size (like pins). The symbol can still cull/collide based on
      // Mapbox placement, but it won't scale with zoom.
      textSize: DOT_TEXT_SIZE,
      textColor: [
        'case',
        nativeHighlightedExpression,
        PRIMARY_COLOR,
        [
          'case',
          ['==', ['literal', scoreModeLiteral], 'coverage_display'],
          ['coalesce', ['get', 'pinColorLocal'], ['get', 'pinColor']],
          ['coalesce', ['get', 'pinColorGlobal'], ['get', 'pinColor']],
        ],
      ],
    } as MapboxGL.SymbolLayerStyle;
  }, [
    nativeHighlightedExpression,
    nativeDotOpacityExpression,
    nativePresentationOpacityExpression,
    scoreMode,
  ]);
  const {
    collisionSourceStore,
    nativeLabelSourceStore,
    settledVisibleLabelCount,
    handleMapViewportLayout,
    handleNativeViewportChanged: handleLabelRuntimeNativeViewportChanged,
    handleMapIdle: handleLabelRuntimeMapIdle,
    handleMapLoaded: handleLabelRuntimeMapLoaded,
  } = useSearchMapLabelRuntime({
    styleURL,
    isMapStyleReady,
    shouldDisableMarkers,
    shouldRenderLabels,
    allowLiveLabelUpdates:
      batchPhase === 'reveal_requested' || batchPhase === 'revealing' || batchPhase === 'live',
    publishVisibleLabelFeatureIds:
      (batchPhase === 'revealing' || batchPhase === 'live') && !nativeViewportState.isMoving,
    pinFeaturesForDerivedSources: presentedPinSourceStore,
    mapPresentationPhase: batchPhase,
    labelResetRequestKey: visualReadyRequestKey,
    nativeRenderOwnerInstanceId,
    isNativeOwnedMarkerRuntimeReady,
    restaurantLabelSourceId: RESTAURANT_LABEL_SOURCE_ID,
    buildLabelCandidateFeatureId,
    getLabelStickyIdentityKeyFromFeature,
    areStringArraysEqual,
    enableStickyLabelCandidates: ENABLE_STICKY_LABEL_CANDIDATES,
    labelStickyRefreshMsIdle: LABEL_STICKY_REFRESH_MS_IDLE,
    labelStickyRefreshMsMoving: LABEL_STICKY_REFRESH_MS_MOVING,
    labelStickyLockStableMsMoving: LABEL_STICKY_LOCK_STABLE_MS_MOVING,
    labelStickyLockStableMsIdle: LABEL_STICKY_LOCK_STABLE_MS_IDLE,
    labelStickyUnlockMissingMsMoving: LABEL_STICKY_UNLOCK_MISSING_MS_MOVING,
    labelStickyUnlockMissingMsIdle: LABEL_STICKY_UNLOCK_MISSING_MS_IDLE,
    labelStickyUnlockMissingStreakMoving: LABEL_STICKY_UNLOCK_MISSING_STREAK_MOVING,
    recordRuntimeAttribution,
    getNowMs,
    onNativeViewportChanged,
    onMapIdle,
    onMapLoaded,
  });
  const mapLabelPerfIsMovingRef = React.useRef(nativeViewportState.isMoving);
  React.useEffect(() => {
    mapLabelPerfIsMovingRef.current = nativeViewportState.isMoving;
  }, [nativeViewportState.isMoving]);
  React.useEffect(() => {
    if (!ENABLE_MAP_LABEL_PERF_DIAGNOSTICS) {
      return;
    }
    const resetPerfWindow = () => {
      mapLabelPerfDiagRef.current.attributionTotalsMs.clear();
      mapLabelPerfDiagRef.current.attributionCounts.clear();
      mapLabelPerfDiagRef.current.attributionMaxMs.clear();
      mapLabelPerfDiagRef.current.labelObservationEventCount = 0;
      mapLabelPerfDiagRef.current.labelObservationDirtyEventCount = 0;
      mapLabelPerfDiagRef.current.labelObservationMaxEffectiveRenderedFeatures = 0;
      mapLabelPerfDiagRef.current.labelObservationLastEffectiveRenderedFeatures = 0;
      mapLabelPerfDiagRef.current.labelObservationLastVisibleLabelCount = 0;
      mapLabelPerfDiagRef.current.latestJsWindow = null;
      mapLabelPerfDiagRef.current.latestUiWindow = null;
      mapLabelPerfDiagRef.current.jsStallCount = 0;
      mapLabelPerfDiagRef.current.uiStallCount = 0;
    };
    const flushPerfWindow = (reason: 'interval' | 'cleanup') => {
      const snapshot = mapLabelPerfDiagRef.current;
      const topContributors = Array.from(snapshot.attributionTotalsMs.entries())
        .map(([contributor, totalMs]) => {
          const sampleCount = snapshot.attributionCounts.get(contributor) ?? 0;
          return {
            contributor,
            totalMs: roundPerfValue(totalMs),
            sampleCount,
            meanMs: roundPerfValue(sampleCount > 0 ? totalMs / sampleCount : 0),
            maxMs: roundPerfValue(snapshot.attributionMaxMs.get(contributor) ?? 0),
          };
        })
        .sort((left, right) => right.totalMs - left.totalMs)
        .slice(0, 6);
      const shouldLog =
        topContributors.length > 0 ||
        snapshot.labelObservationEventCount > 0 ||
        snapshot.jsStallCount > 0 ||
        snapshot.uiStallCount > 0 ||
        mapLabelPerfIsMovingRef.current;
      if (!shouldLog) {
        resetPerfWindow();
        return;
      }
      logger.info('[MAP-LABEL-PERF-DIAG] window', {
        instanceId: nativeRenderOwnerInstanceId,
        reason,
        isMoving: mapLabelPerfIsMovingRef.current,
        stickyRefreshMsMoving: LABEL_STICKY_REFRESH_MS_MOVING,
        stickyEnabled: ENABLE_STICKY_LABEL_CANDIDATES,
        labelObservationEventCount: snapshot.labelObservationEventCount,
        labelObservationDirtyEventCount: snapshot.labelObservationDirtyEventCount,
        labelObservationLastVisibleLabelCount: snapshot.labelObservationLastVisibleLabelCount,
        labelObservationLastEffectiveRenderedFeatures:
          snapshot.labelObservationLastEffectiveRenderedFeatures,
        labelObservationMaxEffectiveRenderedFeatures:
          snapshot.labelObservationMaxEffectiveRenderedFeatures,
        jsFrameWindow: snapshot.latestJsWindow
          ? {
              avgFps: snapshot.latestJsWindow.avgFps,
              floorFps: snapshot.latestJsWindow.floorFps,
              p95FrameMs: snapshot.latestJsWindow.p95FrameMs,
              maxFrameMs: snapshot.latestJsWindow.maxFrameMs,
              droppedFrameRatio: snapshot.latestJsWindow.droppedFrameRatio,
              stallCount: snapshot.latestJsWindow.stallCount,
            }
          : null,
        uiFrameWindow: snapshot.latestUiWindow
          ? {
              avgFps: snapshot.latestUiWindow.avgFps,
              floorFps: snapshot.latestUiWindow.floorFps,
              p95FrameMs: snapshot.latestUiWindow.p95FrameMs,
              maxFrameMs: snapshot.latestUiWindow.maxFrameMs,
              droppedFrameRatio: snapshot.latestUiWindow.droppedFrameRatio,
              stallCount: snapshot.latestUiWindow.stallCount,
            }
          : null,
        jsStallCount: snapshot.jsStallCount,
        uiStallCount: snapshot.uiStallCount,
        topContributors,
      });
      resetPerfWindow();
    };
    const stopJsSampler = startJsFrameSampler({
      windowMs: MAP_LABEL_PERF_WINDOW_MS,
      stallFrameMs: 34,
      logOnlyBelowFps: 58,
      getNow: getNowMs,
      onWindow: (summary) => {
        mapLabelPerfDiagRef.current.latestJsWindow = summary;
      },
      onStall: () => {
        mapLabelPerfDiagRef.current.jsStallCount += 1;
      },
    });
    const stopUiSampler = startUiFrameSampler({
      windowMs: MAP_LABEL_PERF_WINDOW_MS,
      stallFrameMs: 34,
      logOnlyBelowFps: 58,
      onWindow: (summary) => {
        mapLabelPerfDiagRef.current.latestUiWindow = summary;
      },
      onStall: () => {
        mapLabelPerfDiagRef.current.uiStallCount += 1;
      },
    });
    const removeListener = searchMapRenderController.addListener((event) => {
      if (
        event.type !== 'label_observation_updated' ||
        event.instanceId !== nativeRenderOwnerInstanceId
      ) {
        return;
      }
      mapLabelPerfDiagRef.current.labelObservationEventCount += 1;
      if (event.dirtyStickyIdentityKeys.length > 0) {
        mapLabelPerfDiagRef.current.labelObservationDirtyEventCount += 1;
      }
      mapLabelPerfDiagRef.current.labelObservationLastVisibleLabelCount =
        event.visibleLabelFeatureIds.length;
      mapLabelPerfDiagRef.current.labelObservationLastEffectiveRenderedFeatures =
        event.effectiveRenderedFeatureCount;
      mapLabelPerfDiagRef.current.labelObservationMaxEffectiveRenderedFeatures = Math.max(
        mapLabelPerfDiagRef.current.labelObservationMaxEffectiveRenderedFeatures,
        event.effectiveRenderedFeatureCount
      );
    });
    const interval = setInterval(() => {
      flushPerfWindow('interval');
    }, MAP_LABEL_PERF_WINDOW_MS);
    return () => {
      clearInterval(interval);
      removeListener?.();
      stopJsSampler();
      stopUiSampler();
      flushPerfWindow('cleanup');
    };
  }, [getNowMs, nativeRenderOwnerInstanceId]);
  if (ENABLE_MAP_VIEW_DIAGNOSTICS) {
    renderCallbackDiagSnapshotRef.current = {
      instanceId: nativeRenderOwnerInstanceId,
      batchPhase,
      isMoving: nativeViewportState.isMoving,
      isMapStyleReady,
      isNativeRenderOwnerAttached,
      nativeRenderOwnerAttachState,
      isNativeOwnedMarkerRuntimeReady,
      pinCount: presentedPinSourceStore.idsInOrder.length,
      dotCount: presentedDotSourceStore.idsInOrder.length,
      labelCandidateCount: nativeLabelSourceStore.idsInOrder.length,
      visibleLabelCount: settledVisibleLabelCount,
    };
  }
  React.useEffect(() => {
    if (!ENABLE_MAP_REVEAL_DIAGNOSTICS) {
      return;
    }
    if (batchPhase !== 'reveal_requested' && batchPhase !== 'revealing' && batchPhase !== 'live') {
      return;
    }
    const dotCount = presentedDotSourceStore.idsInOrder.length;
    logger.info('[LABEL-REVEAL-DIAG] map', {
      instanceId: nativeRenderOwnerInstanceId,
      batchPhase,
      isMapStyleReady,
      isNativeRenderOwnerAttached,
      nativeRenderOwnerAttachState,
      isNativeOwnedMarkerRuntimeReady,
      shouldRenderLabels,
      pinCount: presentedPinSourceStore.idsInOrder.length,
      dotCount,
      labelCandidateCount: nativeLabelSourceStore.idsInOrder.length,
      visibleLabelCount: settledVisibleLabelCount,
      viewportMoving: nativeViewportState.isMoving,
      visualReadyRequestKey,
    });
  }, [
    batchPhase,
    isMapStyleReady,
    isNativeOwnedMarkerRuntimeReady,
    isNativeRenderOwnerAttached,
    nativeLabelSourceStore.idsInOrder.length,
    nativeRenderOwnerAttachState,
    nativeRenderOwnerInstanceId,
    nativeViewportState.isMoving,
    presentedDotSourceStore.idsInOrder.length,
    presentedPinSourceStore.idsInOrder.length,
    settledVisibleLabelCount,
    shouldRenderLabels,
    visualReadyRequestKey,
  ]);
  React.useEffect(() => {
    if (!ENABLE_MAP_REVEAL_DIAGNOSTICS) {
      return;
    }
    if (
      batchPhase !== 'live' ||
      nativeViewportState.isMoving ||
      !isMapStyleReady ||
      !isNativeOwnedMarkerRuntimeReady
    ) {
      return;
    }
    let cancelled = false;
    void searchMapRenderController
      .queryRenderedDotObservation({
        instanceId: nativeRenderOwnerInstanceId,
        layerIds: [DOT_LAYER_ID],
      })
      .then((observation) => {
        if (cancelled) {
          return;
        }
        logger.info('[DOT-REVEAL-DIAG] map', {
          instanceId: nativeRenderOwnerInstanceId,
          batchPhase,
          renderedFeatureCount: observation.renderedFeatureCount,
          renderedDotCount: observation.renderedDots.length,
          dotCount: presentedDotSourceStore.idsInOrder.length,
          pinCount: presentedPinSourceStore.idsInOrder.length,
          labelCandidateCount: nativeLabelSourceStore.idsInOrder.length,
          visualReadyRequestKey,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        logger.info('[DOT-REVEAL-DIAG] map', {
          instanceId: nativeRenderOwnerInstanceId,
          batchPhase,
          error: error instanceof Error ? error.message : String(error),
          visualReadyRequestKey,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    batchPhase,
    isMapStyleReady,
    isNativeOwnedMarkerRuntimeReady,
    nativeLabelSourceStore.idsInOrder.length,
    nativeRenderOwnerInstanceId,
    nativeViewportState.isMoving,
    presentedDotSourceStore.idsInOrder.length,
    presentedPinSourceStore.idsInOrder.length,
    visualReadyRequestKey,
  ]);
  const nativeDesiredDotInteractionFeatures = presentedDotInteractionSourceStore;
  const nativeDesiredLabelInteractionFeatures = EMPTY_SEARCH_MAP_SOURCE_STORE;

  const restaurantLabelStyleWithStableOrder = React.useMemo(() => {
    if (!STABILIZE_LABEL_ORDER) {
      return restaurantLabelStyle;
    }

    return {
      ...restaurantLabelStyle,
      symbolZOrder: 'source',
      // Placement priority is encoded in source data order (sorted by labelOrder
      // in the keyed label source builder output) instead of symbolSortKey.
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
      textOpacity: [
        '*',
        nativePresentationOpacityExpression,
        nativeLabelOpacityExpression,
        baseTextOpacity,
      ],
      textOpacityTransition: PIN_OPACITY_TRANSITION,
      // Tiny "mutex" icon at the feature point: prevents multiple candidate labels for the same
      // restaurant from being placed simultaneously, without reintroducing sprite-backed pin art.
      iconImage: LABEL_MUTEX_IMAGE_ID,
      iconSize: LABEL_MUTEX_ICON_SIZE,
      iconAnchor: 'bottom',
      iconTranslate: [0, LABEL_MUTEX_POINT === 'above-pin' ? LABEL_MUTEX_TRANSLATE_Y_PX : 0],
      iconTranslateAnchor: 'viewport',
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
    nativeLabelOpacityExpression,
    nativePresentationOpacityExpression,
    restaurantLabelStyleWithStableOrder,
  ]);

  const restaurantLabelPinCollisionLayerId = 'restaurant-labels-pin-collision';
  const restaurantLabelPinCollisionLayerIdSideLeft = 'restaurant-labels-pin-collision-side-left';
  const restaurantLabelPinCollisionLayerIdSideRight = 'restaurant-labels-pin-collision-side-right';
  const restaurantLabelPinCollisionLayerKey = `${restaurantLabelPinCollisionLayerId}-${PIN_COLLISION_OBSTACLE_GEOMETRY}`;
  const restaurantLabelPinCollisionStyles = React.useMemo(
    () =>
      PIN_COLLISION_OBSTACLE_GEOMETRY === 'fill'
        ? {
            center: LABEL_PIN_COLLISION_STYLE_FILL,
            left: LABEL_PIN_COLLISION_STYLE_FILL_SIDE_LEFT,
            right: LABEL_PIN_COLLISION_STYLE_FILL_SIDE_RIGHT,
          }
        : {
            center: LABEL_PIN_COLLISION_STYLE,
            left: LABEL_PIN_COLLISION_STYLE_SIDE_LEFT,
            right: LABEL_PIN_COLLISION_STYLE_SIDE_RIGHT,
          },
    []
  );

  const pinFillColorExpression = React.useMemo(() => {
    const scoreModeLiteral = scoreMode;
    return [
      'case',
      nativeHighlightedExpression,
      PRIMARY_COLOR,
      [
        'case',
        ['==', ['literal', scoreModeLiteral], 'coverage_display'],
        ['coalesce', ['get', 'pinColorLocal'], ['get', 'pinColor']],
        ['coalesce', ['get', 'pinColorGlobal'], ['get', 'pinColor']],
      ],
    ] as const;
  }, [nativeHighlightedExpression, scoreMode]);

  const stylePinsShadowSteadyStyle = React.useMemo(
    () =>
      ({
        ...withIconOpacity(STYLE_PINS_SHADOW_STYLE, [
          '*',
          nativePresentationOpacityExpression,
          nativeLodOpacityExpression,
          STYLE_PINS_SHADOW_OPACITY,
        ]),
        iconOpacityTransition: PIN_OPACITY_TRANSITION,
      } as MapboxGL.SymbolLayerStyle),
    [nativeLodOpacityExpression, nativePresentationOpacityExpression]
  );

  const stylePinsOutlineSteadyStyle = React.useMemo(
    () =>
      ({
        ...withTextOpacity({
          baseStyle: STYLE_PINS_OUTLINE_GLYPH_STYLE,
          textOpacity: ['*', nativePresentationOpacityExpression, nativeLodOpacityExpression],
        }),
        textOpacityTransition: PIN_OPACITY_TRANSITION,
      } as MapboxGL.SymbolLayerStyle),
    [nativeLodOpacityExpression, nativePresentationOpacityExpression]
  );

  const stylePinsFillSteadyStyle = React.useMemo(
    () =>
      ({
        ...withTextOpacity({
          baseStyle: STYLE_PINS_FILL_GLYPH_STYLE,
          textOpacity: ['*', nativePresentationOpacityExpression, nativeLodOpacityExpression],
          textColor: pinFillColorExpression,
        }),
        textOpacityTransition: PIN_OPACITY_TRANSITION,
      } as MapboxGL.SymbolLayerStyle),
    [nativeLodOpacityExpression, nativePresentationOpacityExpression, pinFillColorExpression]
  );

  const stylePinsRankStyle = React.useMemo(
    () =>
      ({
        ...withTextOpacity({
          baseStyle: STYLE_PINS_RANK_STYLE,
          textOpacity: ['*', nativePresentationOpacityExpression, nativeLodRankOpacityExpression],
        }),
        textOpacityTransition: PIN_RANK_OPACITY_TRANSITION,
      } as MapboxGL.SymbolLayerStyle),
    [nativeLodRankOpacityExpression, nativePresentationOpacityExpression]
  );

  const stylePinLayerStack = React.useMemo(() => {
    return Array.from({ length: STYLE_PIN_STACK_SLOTS }, (_, slotIndex) => {
      const lodSlotFilter = ['==', ['coalesce', ['get', 'nativeLodZ'], -1], slotIndex] as const;
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

  const pinInteractionLayerStack = React.useMemo(
    () =>
      Array.from({ length: STYLE_PIN_STACK_SLOTS }, (_, slotIndex) => {
        const lodSlotFilter = ['==', ['coalesce', ['get', 'nativeLodZ'], -1], slotIndex] as const;
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

  const labelLayerSpecs = React.useMemo(() => LABEL_LAYER_SPECS, []);

  useSearchMapNativeRenderOwnerSync({
    instanceId: nativeRenderOwnerInstanceId,
    isAttached: isNativeRenderOwnerAttached,
    isMapStyleReady,
    isNativeAvailable: isNativeRenderOwnerAvailable,
    pins: nativeDesiredPinFeatures,
    pinInteractions: nativeDesiredPinInteractionFeatures,
    dots: nativeDesiredDotFeatures,
    dotInteractions: nativeDesiredDotInteractionFeatures,
    labels: nativeLabelSourceStore,
    labelInteractions: nativeDesiredLabelInteractionFeatures,
    labelCollisions: collisionSourceStore,
    viewportState: {
      bounds: nativeViewportState.bounds,
      isGestureActive: nativeViewportState.isGestureActive,
      isMoving: nativeViewportState.isMoving,
    },
    presentationState: {
      ...nativePresentationState,
      selectedRestaurantId: effectiveSelectedRestaurantId ?? null,
    },
    highlightedMarkerKey,
    interactionMode: nativeInteractionMode,
    onSyncError: reportNativeFatalError,
  });

  const {
    dotInteractionFilter,
    handleStylePinPress,
    handleLabelPress,
    handleDotPress,
    refreshVisibleDotRestaurantIds,
  } = useSearchMapInteractionRuntime({
    mapRef,
    nativeRenderOwnerInstanceId,
    onMarkerPress,
    shouldRenderDots,
    dotLayerId: DOT_LAYER_ID,
    pinInteractionLayerIds: PIN_INTERACTION_LAYER_IDS,
    labelInteractionLayerIds: LABEL_INTERACTION_LAYER_IDS,
    markersRenderKey,
    styleURL,
    dotTapIntentRadiusPx: DOT_TAP_INTENT_RADIUS_PX,
    setOptimisticSelectedRestaurantId,
    getPointFromPressEvent,
    getCoordinateFromPressEvent,
    areStringArraysEqual,
    isTapInsideDotInteractionGeometry,
  });

  const profilerCallback =
    onProfilerRender ??
    ((() => {
      // noop
    }) as React.ProfilerOnRenderCallback);

  const handleNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      handleLabelRuntimeNativeViewportChanged(state);
    },
    [handleLabelRuntimeNativeViewportChanged]
  );
  nativeViewportChangedHandlerRef.current = (payload) => {
    const northEast: [number, number] = [
      payload.bounds.northEast.lng,
      payload.bounds.northEast.lat,
    ];
    const southWest: [number, number] = [
      payload.bounds.southWest.lng,
      payload.bounds.southWest.lat,
    ];
    const syntheticState = {
      properties: {
        center: payload.center,
        zoom: payload.zoom,
        bounds: {
          ne: northEast,
          sw: southWest,
        },
        heading: 0,
        pitch: 0,
      },
      gestures: {
        isGestureActive: payload.isGestureActive,
      },
    } as unknown as MapboxMapState;
    if (payload.isMoving) {
      handleNativeViewportChanged(syntheticState);
      return;
    }
    handleMapIdle(syntheticState);
  };

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      handleLabelRuntimeMapIdle(state);
      refreshVisibleDotRestaurantIds();
    },
    [handleLabelRuntimeMapIdle, refreshVisibleDotRestaurantIds]
  );
  // ---------------------------------------------------------------------------
  // Event-driven reveal signals: React effects that fire based on readiness
  // state rather than Mapbox frame callbacks. This ensures the reveal chain
  // completes regardless of Mapbox frame timing.
  // ---------------------------------------------------------------------------

  const handleMapLoaded = React.useCallback(() => {
    if (ENABLE_MAP_VIEW_DIAGNOSTICS) {
      logger.info('[MAP-VIEW-DIAG] mapLoaded', {
        instanceId: nativeRenderOwnerInstanceId,
      });
    }
    handleLabelRuntimeMapLoaded();
  }, [handleLabelRuntimeMapLoaded, nativeRenderOwnerInstanceId]);

  const handleMapLoadedStyle = React.useCallback(() => {
    if (ENABLE_MAP_VIEW_DIAGNOSTICS) {
      logger.info('[MAP-VIEW-DIAG] styleLoaded', {
        instanceId: nativeRenderOwnerInstanceId,
      });
    }
    handleMapLoaded();
  }, [handleMapLoaded, nativeRenderOwnerInstanceId]);

  const handleMapLoadedMap = React.useCallback(() => {
    if (ENABLE_MAP_VIEW_DIAGNOSTICS) {
      logger.info('[MAP-VIEW-DIAG] mapLoadedEvent', {
        instanceId: nativeRenderOwnerInstanceId,
      });
    }
    handleMapLoaded();
  }, [handleMapLoaded, nativeRenderOwnerInstanceId]);

  React.useEffect(() => {
    if (ENABLE_MAP_VIEW_DIAGNOSTICS) {
      logger.info('[MAP-VIEW-DIAG] mounted', {
        componentInstanceId: searchMapComponentInstanceId,
        instanceId: nativeRenderOwnerInstanceId,
        styleURL,
      });
    }
    return () => {
      if (ENABLE_MAP_VIEW_DIAGNOSTICS) {
        logger.info('[MAP-VIEW-DIAG] unmounted', {
          componentInstanceId: searchMapComponentInstanceId,
          instanceId: nativeRenderOwnerInstanceId,
        });
      }
    };
  }, [nativeRenderOwnerInstanceId, searchMapComponentInstanceId, styleURL]);

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
        onDidFinishLoadingStyle={handleMapLoadedStyle}
        onDidFinishLoadingMap={handleMapLoadedMap}
        onDidFinishRenderingFrame={handleDidFinishRenderingFrame}
        onDidFinishRenderingFrameFully={handleDidFinishRenderingFrameFully}
      >
        <MapboxGL.Images
          images={{
            [STYLE_PIN_OUTLINE_IMAGE_ID]: pinAsset,
            [STYLE_PIN_SHADOW_IMAGE_ID]: pinShadowAsset,
            [STYLE_PIN_FILL_IMAGE_ID]: { image: pinFillAsset, sdf: true },
            [LABEL_MUTEX_IMAGE_ID]: TRANSPARENT_PIXEL_IMAGE,
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
        <React.Profiler id="SearchMapDots" onRender={profilerCallback}>
          <MapboxGL.ShapeSource
            id={DOT_SOURCE_ID}
            shape={EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>}
          >
            {shouldMountDotLayers ? (
              <MapboxGL.SymbolLayer
                id={DOT_LAYER_ID}
                slot="top"
                belowLayerID={SEARCH_PINS_Z_ANCHOR_LAYER_ID}
                style={dotLayerStyle}
                sourceID={DOT_SOURCE_ID}
              />
            ) : undefined}
          </MapboxGL.ShapeSource>
          <MapboxGL.ShapeSource
            id={DOT_INTERACTION_SOURCE_ID}
            shape={EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>}
            onPress={handleDotPress}
          >
            {shouldMountDotLayers ? (
              <MapboxGL.CircleLayer
                id={DOT_INTERACTION_LAYER_ID}
                slot="top"
                belowLayerID={SEARCH_PINS_Z_ANCHOR_LAYER_ID}
                sourceID={DOT_INTERACTION_SOURCE_ID}
                style={DOT_INTERACTION_LAYER_STYLE}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                filter={dotInteractionFilter as any}
              />
            ) : undefined}
          </MapboxGL.ShapeSource>
        </React.Profiler>
        <MapboxGL.ShapeSource id={STYLE_PINS_SOURCE_ID} shape={EMPTY_POINT_FEATURES}>
          {USE_STYLE_LAYER_PINS && shouldRenderSearchMarkerLayers ? stylePinLayerStack : undefined}
        </MapboxGL.ShapeSource>
        <MapboxGL.ShapeSource
          id={PIN_INTERACTION_SOURCE_ID}
          shape={EMPTY_POINT_FEATURES}
          onPress={handleStylePinPress}
        >
          {USE_STYLE_LAYER_PINS && shouldRenderSearchMarkerLayers
            ? pinInteractionLayerStack
            : undefined}
        </MapboxGL.ShapeSource>
        <React.Profiler id="SearchMapLabels" onRender={profilerCallback}>
          <React.Fragment>
            <MapboxGL.ShapeSource id={RESTAURANT_LABEL_SOURCE_ID} shape={EMPTY_POINT_FEATURES}>
              {shouldRenderLabels
                ? labelLayerSpecs.map(({ preferredCandidate, candidate, layerId }) => (
                    <MapboxGL.SymbolLayer
                      key={layerId}
                      id={layerId}
                      slot="top"
                      sourceID={RESTAURANT_LABEL_SOURCE_ID}
                      belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                      style={labelCandidateStyles[candidate]}
                      filter={[
                        'all',
                        ['==', ['get', 'labelPreference'], preferredCandidate],
                        ['==', ['get', 'labelCandidate'], candidate],
                      ]}
                    />
                  ))
                : undefined}
            </MapboxGL.ShapeSource>
            <MapboxGL.ShapeSource
              id={LABEL_INTERACTION_SOURCE_ID}
              shape={EMPTY_POINT_FEATURES}
              onPress={handleLabelPress}
            >
              {shouldRenderLabels
                ? labelLayerSpecs.map(({ preferredCandidate, candidate, interactionLayerId }) => (
                    <MapboxGL.SymbolLayer
                      key={interactionLayerId}
                      id={interactionLayerId}
                      slot="top"
                      sourceID={LABEL_INTERACTION_SOURCE_ID}
                      belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                      style={labelInteractionStyles[candidate]}
                      filter={[
                        'all',
                        ['==', ['get', 'labelPreference'], preferredCandidate],
                        ['==', ['get', 'labelCandidate'], candidate],
                      ]}
                    />
                  ))
                : undefined}
            </MapboxGL.ShapeSource>
            <MapboxGL.ShapeSource
              id={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
              shape={EMPTY_POINT_FEATURES}
            >
              {USE_STYLE_LAYER_PINS &&
              shouldRenderSearchMarkerLayers &&
              shouldRenderLabels &&
              PIN_COLLISION_OBSTACLE_GEOMETRY !== 'off' ? (
                <React.Fragment>
                  <MapboxGL.SymbolLayer
                    key={restaurantLabelPinCollisionLayerKey}
                    id={restaurantLabelPinCollisionLayerId}
                    slot="top"
                    sourceID={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={restaurantLabelPinCollisionStyles.center}
                  />
                  <MapboxGL.SymbolLayer
                    key={`${restaurantLabelPinCollisionLayerKey}-left`}
                    id={restaurantLabelPinCollisionLayerIdSideLeft}
                    slot="top"
                    sourceID={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={restaurantLabelPinCollisionStyles.left}
                  />
                  <MapboxGL.SymbolLayer
                    key={`${restaurantLabelPinCollisionLayerKey}-right`}
                    id={restaurantLabelPinCollisionLayerIdSideRight}
                    slot="top"
                    sourceID={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={restaurantLabelPinCollisionStyles.right}
                  />
                </React.Fragment>
              ) : undefined}
            </MapboxGL.ShapeSource>
          </React.Fragment>
        </React.Profiler>
        {userLocation ? (
          <UserLocationLayers
            userLocationAccuracyFeatureCollection={userLocationAccuracyFeatureCollection}
            userLocationFeatureCollection={userLocationFeatureCollection}
            userLocationVisualSpec={userLocationVisualSpec}
          />
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

const areStartupLocationSnapshotsEqual = (
  left?: StartupLocationSnapshot | null,
  right?: StartupLocationSnapshot | null
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.source === right.source &&
    left.permission === right.permission &&
    left.reducedAccuracy === right.reducedAccuracy &&
    left.isStale === right.isStale &&
    left.acquiredAtMs === right.acquiredAtMs &&
    left.accuracyMeters === right.accuracyMeters &&
    areUserLocationsEqual(left.coordinate, right.coordinate)
  );
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
  if (prev.dotSourceStore !== next.dotSourceStore) {
    return false;
  }
  if (prev.markersRenderKey !== next.markersRenderKey) {
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
  if (!areStartupLocationSnapshotsEqual(prev.userLocationSnapshot, next.userLocationSnapshot)) {
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
  if (prev.onNativeViewportChanged !== next.onNativeViewportChanged) {
    return false;
  }
  if (prev.onMapIdle !== next.onMapIdle) {
    return false;
  }
  if (prev.onMapLoaded !== next.onMapLoaded) {
    return false;
  }
  if (prev.onMapFullyRendered !== next.onMapFullyRendered) {
    return false;
  }
  if (prev.onRevealBatchMountedHidden !== next.onRevealBatchMountedHidden) {
    return false;
  }
  if (prev.onMarkerRevealStarted !== next.onMarkerRevealStarted) {
    return false;
  }
  if (prev.onMarkerRevealFirstVisibleFrame !== next.onMarkerRevealFirstVisibleFrame) {
    return false;
  }
  if (prev.onMarkerPress !== next.onMarkerPress) {
    return false;
  }
  if (prev.onMarkerRevealSettled !== next.onMarkerRevealSettled) {
    return false;
  }
  if (prev.nativePresentationState !== next.nativePresentationState) {
    return false;
  }
  if (prev.nativeInteractionMode !== next.nativeInteractionMode) {
    return false;
  }
  if (prev.labelResetRequestKey !== next.labelResetRequestKey) {
    return false;
  }
  if (prev.nativeViewportState !== next.nativeViewportState) {
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
