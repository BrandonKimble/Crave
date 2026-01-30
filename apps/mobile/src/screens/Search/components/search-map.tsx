import React from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  View,
} from 'react-native';

import MapboxGL, { type MapState as MapboxMapState, type OnPressEvent } from '@rnmapbox/maps';
import type { Feature, FeatureCollection, Point } from 'geojson';

import pinAsset from '../../../assets/pin.png';
import pinFillAsset from '../../../assets/pin-fill.png';
import pinShadowAsset from '../../../assets/pin-shadow.png';
import AppBlurView from '../../../components/app-blur-view';
import type { Coordinate } from '../../../types';
import { logger } from '../../../utils';
import {
  PIN_FILL_CENTER_Y,
  PIN_FILL_RENDER_HEIGHT,
  PIN_FILL_TOP_OFFSET,
  PIN_MARKER_RENDER_SIZE,
  PIN_RANK_FONT_SIZE,
  USA_FALLBACK_CENTER,
} from '../constants/search';

import styles from '../styles';
import { haversineDistanceMiles } from '../utils/geo';
import {
  getViewportMercatorPolygonForMarkerVisibility,
  isPointInPolygon,
  MARKER_VIEW_OVERSCAN_STYLE,
  projectToMercator,
} from './marker-visibility';

const MAP_PAN_DECELERATION_FACTOR = 0.995;
// When a marker re-enters the (overscanned) visibility bounds while the map is still moving, we
// hold the fade-in briefly to avoid flicker caused by view->coordinate sampling jitter.
const MARKER_REENTRY_HOLD_MS = 120;
// Visibility refresh is intentionally frequent while moving to keep edge fade responsive, but not
// so frequent that rounding/jitter causes rapid visible<->hidden toggles (which reads as "snapping").
const MARKER_VISIBILITY_REFRESH_MS_IDLE = 120;
const MARKER_VISIBILITY_REFRESH_MS_MOVING = 80;
const USER_LOCATION_ANCHOR = { x: 0.5, y: 0.5 } as const;

// Experimental: render restaurant pins via Mapbox style layers (instead of MarkerView).
// This avoids view-annotation gaps during fast pans and is the foundation for truly reversible fade.
const USE_STYLE_LAYER_PINS = true;
const STYLE_PIN_OUTLINE_IMAGE_ID = 'restaurant-pin-outline';
const STYLE_PIN_SHADOW_IMAGE_ID = 'restaurant-pin-shadow';
const STYLE_PIN_FILL_IMAGE_ID = 'restaurant-pin-fill';
const STYLE_PINS_SOURCE_ID = 'restaurant-style-pins-source';
const DEBUG_STYLE_PINS_COLLISION = false;
// Extreme diagnostic: force labels to render *only* above pins, bypassing collision logic.
// If you still don't see top labels with this enabled, the issue isn't collision/offset math.
const DEBUG_FORCE_TOP_LABELS = false;

// Approximate the MarkerView drop-shadow (`styles.pinShadow`) using a translated, tinted SDF copy
// of the pin silhouette.
const STYLE_PINS_SHADOW_OPACITY = 0.65;
// `pin-shadow.png` includes extra bottom padding (see `apps/mobile/scripts/generate-pin-shadow.mjs`)
// so the blur isn't clipped. Compensate by shifting it down a touch so it still sits under the pin.
const STYLE_PINS_SHADOW_TRANSLATE: [number, number] = [0, 1.25 + 18 * (PIN_MARKER_RENDER_SIZE / 98)];
const STYLE_PIN_LAYER_ID_SAFE_MAX_LEN = 120;

// `SymbolLayer.iconSize` scales relative to the source image's pixel dimensions.
// These values are derived to match the existing RN pin layout in `styles.ts` + `constants/search.ts`.
const PIN_OUTLINE_IMAGE_HEIGHT_PX = 98;
const PIN_FILL_IMAGE_HEIGHT_PX = 72;

const STYLE_PINS_OUTLINE_ICON_SIZE = PIN_MARKER_RENDER_SIZE / PIN_OUTLINE_IMAGE_HEIGHT_PX;
const STYLE_PINS_FILL_ICON_SIZE = PIN_FILL_RENDER_HEIGHT / PIN_FILL_IMAGE_HEIGHT_PX;
// `SymbolLayer.iconOffset` is specified in the *source image's pixel units* (and then scaled by
// `iconSize`). Our pin layout constants are in "rendered wrapper pixels", so we convert.
const STYLE_PINS_FILL_OFFSET_RENDER_PX =
  -(PIN_MARKER_RENDER_SIZE - (PIN_FILL_TOP_OFFSET + PIN_FILL_RENDER_HEIGHT));
const STYLE_PINS_FILL_OFFSET_IMAGE_PX = STYLE_PINS_FILL_OFFSET_RENDER_PX / STYLE_PINS_FILL_ICON_SIZE;
const STYLE_PINS_RANK_TRANSLATE_Y = PIN_FILL_CENTER_Y - PIN_MARKER_RENDER_SIZE;

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
  rank: number;
  pinColor: string;
  anchor?: 'top' | 'bottom' | 'left' | 'right';
  // Dish-specific fields (populated when rendering dish pins)
  isDishPin?: boolean;
  dishName?: string;
  connectionId?: string;
};

const toSafeLayerIdPart = (value: string) => {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (normalized.length <= STYLE_PIN_LAYER_ID_SAFE_MAX_LEN) {
    return normalized;
  }
  return normalized.slice(0, STYLE_PIN_LAYER_ID_SAFE_MAX_LEN);
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

const PRIMARY_COLOR = '#ff3368';
const ZERO_CAMERA_PADDING = { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 };
const DOT_SOURCE_ID = 'restaurant-dot-source';
const DOT_LAYER_ID = 'restaurant-dot-layer';
const RESTAURANT_LABEL_SOURCE_ID = 'restaurant-source';
const DOT_LAYER_STYLE: MapboxGL.CircleLayerStyle = {
  circleColor: ['get', 'pinColor'],
  circleOpacity: 1,
  circleRadius: ['interpolate', ['linear'], ['zoom'], 8, 2, 12, 3, 16, 4, 20, 6],
  circleStrokeWidth: 0,
};

const LABEL_OPACITY_STEP_MS = 80;

const DEBUG_STYLE_PINS_COLLISION_STYLE: MapboxGL.CircleLayerStyle = {
  circleRadius: PIN_MARKER_RENDER_SIZE * 0.6,
  circleColor: 'rgba(255, 0, 0, 0.12)',
  circleStrokeColor: 'rgba(255, 0, 0, 0.55)',
  circleStrokeWidth: 1,
  // Approximate the pin icon collision region (icon is anchored at bottom, so its center is above
  // the point). This is only a visual debugging aid.
  circleTranslate: [0, -PIN_MARKER_RENDER_SIZE * 0.5],
  circleTranslateAnchor: 'viewport',
};

const STYLE_PINS_OUTLINE_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_OUTLINE_IMAGE_ID,
  iconSize: STYLE_PINS_OUTLINE_ICON_SIZE,
  iconAnchor: 'bottom',
  symbolZOrder: 'viewport-y',
  iconAllowOverlap: true,
  // Visual-only: label placement is handled by the label layer itself (see `restaurantLabelStyle`).
  iconIgnorePlacement: true,
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_SHADOW_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_SHADOW_IMAGE_ID,
  // `pin-shadow.png` includes padding so blur isn't clipped; keep size aligned with the base pin.
  iconSize: STYLE_PINS_OUTLINE_ICON_SIZE,
  iconAnchor: 'bottom',
  symbolZOrder: 'viewport-y',
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
  symbolZOrder: 'viewport-y',
  iconAllowOverlap: true,
  // Fill should never affect placement/collision decisions for labels (only the base does).
  iconIgnorePlacement: true,
} as MapboxGL.SymbolLayerStyle;

const STYLE_PINS_RANK_STYLE: MapboxGL.SymbolLayerStyle = {
  symbolZOrder: 'viewport-y',
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

const areStringSetsEqual = (left: Set<string>, right: Set<string>) => {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
};

const easeInCubic = (t: number) => t * t * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

type SearchMapProps = {
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  styleURL: string;
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
  onMarkerPress?: (restaurantId: string) => void;
  selectedRestaurantId?: string | null;
  sortedRestaurantMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  dotRestaurantFeatures?: FeatureCollection<Point, RestaurantFeatureProperties> | null;
  markersRenderKey: string;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  shouldAnimateMarkerReveal?: boolean;
  markerRevealChunk?: number;
  markerRevealStaggerMs?: number;
  markerRevealAnimMs?: number;
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
  selectedRestaurantId,
  sortedRestaurantMarkers,
  dotRestaurantFeatures,
  markersRenderKey,
  buildMarkerKey,
  shouldAnimateMarkerReveal = false,
  markerRevealChunk = 1,
  markerRevealStaggerMs = 0,
  markerRevealAnimMs = 2000,
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
  const canUseLabelFeatureState = !!mapRef.current?.setFeatureState;
  const shouldRenderDots =
    !shouldDisableMarkers &&
    dotRestaurantFeatures != null &&
    dotRestaurantFeatures.features.length > 0;
  const [mapViewportSize, setMapViewportSize] = React.useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [visibleMarkerKeys, setVisibleMarkerKeys] = React.useState<Set<string>>(() => new Set());
  const labelRevealRegistryRef = React.useRef<Set<string>>(new Set());
  const previousShouldAnimateMarkerRevealRef = React.useRef(false);
  // Marker visibility refreshes are async (Mapbox view->coordinate conversion) and can complete
  // out of order. This "sequencer + single-flight queue" prevents stale results from applying,
  // which would otherwise make `isVisible` flap near edges and read as snapping.
  const visibilityRefreshSeqRef = React.useRef(0);
  const visibilityRefreshTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityRefreshInFlightRef = React.useRef(false);
  const visibilityRefreshQueuedRef = React.useRef(false);
  const isMapMovingRef = React.useRef(false);
  const mapLastMovedAtRef = React.useRef(0);
  const labelOpacityByIdRef = React.useRef<Map<string, number>>(new Map());
  const labelAnimationTimeoutsRef = React.useRef<Map<string, Array<ReturnType<typeof setTimeout>>>>(
    new Map()
  );
  const previousVisibleLabelIdsRef = React.useRef<Set<string>>(new Set());

  const markerMercatorEntries = React.useMemo(
    () =>
      sortedRestaurantMarkers.map((feature) => {
        const markerKey = buildMarkerKey(feature);
        const coordinate = feature.geometry.coordinates as [number, number];
        return { markerKey, mercatorPoint: projectToMercator(coordinate) };
      }),
    [buildMarkerKey, sortedRestaurantMarkers]
  );

  const restaurantLabelFeaturesWithIds = React.useMemo(() => {
    if (!restaurantFeatures.features.length) {
      return restaurantFeatures;
    }

    let didChange = false;
    const nextFeatures = restaurantFeatures.features.map((feature) => {
      const markerKey = buildMarkerKey(feature);
      if (feature.id === markerKey) {
        return feature;
      }
      didChange = true;
      return { ...feature, id: markerKey };
    });

    if (!didChange) {
      return restaurantFeatures;
    }

    return { ...restaurantFeatures, features: nextFeatures };
  }, [buildMarkerKey, restaurantFeatures]);

  const stylePinDrawOrder = React.useMemo(() => {
    if (!restaurantLabelFeaturesWithIds.features.length) {
      return [];
    }

    const user = userLocation ? { lng: userLocation.lng, lat: userLocation.lat } : null;
    const missingDistanceMiles = 1e12;

    const entries = restaurantLabelFeaturesWithIds.features
      .map((feature) => {
        const markerKey = buildMarkerKey(feature);
        const rank = feature.properties.rank;
        const coordinates = feature.geometry.coordinates as [number, number];
        const lng = coordinates?.[0];
        const lat = coordinates?.[1];
        const distanceMiles =
          user &&
          typeof lng === 'number' &&
          Number.isFinite(lng) &&
          typeof lat === 'number' &&
          Number.isFinite(lat)
            ? haversineDistanceMiles(user, { lng, lat })
            : missingDistanceMiles;
        return { markerKey, rank, distanceMiles };
      })
      .filter(
        (entry) =>
          typeof entry.markerKey === 'string' &&
          entry.markerKey.length > 0 &&
          typeof entry.rank === 'number' &&
          Number.isFinite(entry.rank) &&
          entry.rank > 0
      );

    // Layer order determines draw order: earlier layers are under later layers.
    // We want:
    //   - rank 50 underneath rank 1
    //   - within same rank: farther underneath closer
    return entries.sort((a, b) => {
      const rankDelta = b.rank - a.rank;
      if (rankDelta !== 0) {
        return rankDelta;
      }
      const distDelta = b.distanceMiles - a.distanceMiles;
      if (distDelta !== 0) {
        return distDelta;
      }
      return a.markerKey.localeCompare(b.markerKey);
    });
  }, [buildMarkerKey, restaurantLabelFeaturesWithIds.features, userLocation]);

  const labelFeatureIdSet = React.useMemo(() => {
    if (!restaurantLabelFeaturesWithIds.features.length) {
      return new Set<string>();
    }
    const ids = restaurantLabelFeaturesWithIds.features
      .map((feature) => feature.id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    return new Set(ids);
  }, [restaurantLabelFeaturesWithIds]);

  const restaurantLabelStyleWithOpacity = React.useMemo(() => {
    if (!canUseLabelFeatureState) {
      return restaurantLabelStyle;
    }
    const baseOpacity = restaurantLabelStyle.textOpacity ?? 1;

    return {
      ...restaurantLabelStyle,
      textOpacity: ['*', baseOpacity, ['coalesce', ['feature-state', 'opacity'], 0]],
    } as MapboxGL.SymbolLayerStyle;
  }, [canUseLabelFeatureState, restaurantLabelStyle]);

  const restaurantLabelForceTopDebugStyle = React.useMemo(() => {
    if (!DEBUG_FORCE_TOP_LABELS) {
      return null;
    }

    return {
      // IMPORTANT: This debug layer must not depend on feature-state opacity. When label opacity is
      // gated via feature-state (our normal label path), any mismatch in state updates can make
      // debug output invisible and hide the root cause we're trying to diagnose.
      ...restaurantLabelStyle,
      // Only allow "top" and bypass collision so we can prove the engine can render top labels.
      // NOTE: `textVariableAnchor` expects a plain array (not an expression).
      textVariableAnchor: ['top'],
      textAllowOverlap: true,
      textIgnorePlacement: true,
      textOptional: true,
      textOpacity: 1,
      textColor: '#ef4444',
      textHaloColor: 'rgba(255, 255, 255, 0.85)',
      textHaloWidth: 1.2,
      textHaloBlur: 0.9,
    } as MapboxGL.SymbolLayerStyle;
  }, [restaurantLabelStyle]);

  const stylePinsFillStyle = React.useMemo(() => {
    return {
      ...STYLE_PINS_FILL_STYLE,
      // NOTE: `iconColor` only tints SDF icons. If `pinFillAsset` isn't SDF, this will no-op and
      // we’ll need either per-color assets or a different composition (e.g. circles).
      iconColor: [
        'case',
        ['==', ['get', 'restaurantId'], selectedRestaurantId ?? ''],
        PRIMARY_COLOR,
        ['get', 'pinColor'],
      ],
    } as MapboxGL.SymbolLayerStyle;
  }, [selectedRestaurantId]);

  const stylePinLayerStack = React.useMemo(() => {
    if (!stylePinDrawOrder.length) {
      return null;
    }

    // Critical: we need per-pin layer stacks so overlap renders like:
    //   shadow+base+fill+text (pin A), then shadow+base+fill+text (pin B), etc.
    //
    // Mapbox cannot interleave per-feature across separate layers, but it *can* interleave by
    // layer order. Creating a layer stack per pin guarantees perfect interleaving even when
    // multiple pins share the same rank.
    return stylePinDrawOrder.flatMap((entry) => {
      const stackSuffix = toSafeLayerIdPart(entry.markerKey);
      const featureFilter = ['==', ['id'], entry.markerKey] as const;
      return [
        <MapboxGL.SymbolLayer
          key={`shadow-${entry.markerKey}`}
          id={`restaurant-style-pins-shadow-${stackSuffix}`}
          style={STYLE_PINS_SHADOW_STYLE}
          filter={featureFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`base-${entry.markerKey}`}
          id={`restaurant-style-pins-base-${stackSuffix}`}
          style={STYLE_PINS_OUTLINE_STYLE}
          filter={featureFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`fill-${entry.markerKey}`}
          id={`restaurant-style-pins-fill-${stackSuffix}`}
          style={stylePinsFillStyle}
          filter={featureFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`rank-${entry.markerKey}`}
          id={`restaurant-style-pins-rank-${stackSuffix}`}
          style={STYLE_PINS_RANK_STYLE}
          filter={featureFilter}
        />,
      ];
    });
  }, [stylePinDrawOrder, stylePinsFillStyle]);

  const handleStylePinPress = React.useCallback(
    (event: OnPressEvent) => {
      const feature = event?.features?.[0];
      const restaurantId = feature?.properties?.restaurantId;
      if (typeof restaurantId !== 'string') {
        return;
      }
      onMarkerPress?.(restaurantId);
    },
    [onMarkerPress]
  );

  React.useEffect(() => {
    if (shouldAnimateMarkerReveal && !previousShouldAnimateMarkerRevealRef.current) {
      labelRevealRegistryRef.current.clear();
    }
    previousShouldAnimateMarkerRevealRef.current = shouldAnimateMarkerReveal;
  }, [shouldAnimateMarkerReveal]);

  React.useEffect(() => {
    return () => {
      visibilityRefreshQueuedRef.current = false;
      if (visibilityRefreshTimeoutRef.current) {
        clearTimeout(visibilityRefreshTimeoutRef.current);
        visibilityRefreshTimeoutRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    return () => {
      for (const timeouts of labelAnimationTimeoutsRef.current.values()) {
        for (const timeout of timeouts) {
          clearTimeout(timeout);
        }
      }
      labelAnimationTimeoutsRef.current.clear();
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

  const getIsFirstLabelReveal = React.useCallback((markerKey: string) => {
    const registry = labelRevealRegistryRef.current;
    const isFirstReveal = !registry.has(markerKey);
    if (isFirstReveal) {
      registry.add(markerKey);
    }
    return isFirstReveal;
  }, []);

  const refreshVisibleMarkerKeys = React.useCallback(async () => {
    if (shouldDisableMarkers) {
      return;
    }
    if (!markerMercatorEntries.length) {
      return;
    }
    if (mapViewportSize.width <= 0 || mapViewportSize.height <= 0) {
      return;
    }
    const mapInstance = mapRef.current;
    if (!mapInstance?.getCoordinateFromView) {
      return;
    }

    // Visibility is computed from the same *overscanned* view bounds used by the MapView style.
    // This coupling is what makes the fade-in smooth and avoids "snapping" at the viewport edge.
    const refreshSeq = ++visibilityRefreshSeqRef.current;

    try {
      const mercatorPolygon = await getViewportMercatorPolygonForMarkerVisibility(
        mapInstance,
        mapViewportSize
      );

      if (refreshSeq !== visibilityRefreshSeqRef.current) {
        return;
      }

      if (!mercatorPolygon) {
        return;
      }

      const nextVisibleKeys = new Set<string>();
      for (const entry of markerMercatorEntries) {
        if (isPointInPolygon(entry.mercatorPoint, mercatorPolygon)) {
          nextVisibleKeys.add(entry.markerKey);
        }
      }

      setVisibleMarkerKeys((previous) =>
        // Avoid thrashing React renders (and downstream animation restarts) when the key set is
        // unchanged but a refresh tick produced a new Set instance.
        areStringSetsEqual(previous, nextVisibleKeys) ? previous : nextVisibleKeys
      );
    } catch {
      // Ignore: Mapbox can transiently reject view->coordinate conversions during load/teardown.
    }
  }, [
    mapRef,
    mapViewportSize.height,
    mapViewportSize.width,
    markerMercatorEntries,
    shouldDisableMarkers,
  ]);

  const getIsMapMoving = React.useCallback(
    () => isMapMovingRef.current || Date.now() - mapLastMovedAtRef.current < MARKER_REENTRY_HOLD_MS,
    []
  );

  const cancelLabelAnimation = React.useCallback((featureId: string) => {
    const timeouts = labelAnimationTimeoutsRef.current.get(featureId);
    if (!timeouts?.length) {
      return;
    }
    for (const timeout of timeouts) {
      clearTimeout(timeout);
    }
    labelAnimationTimeoutsRef.current.delete(featureId);
  }, []);

  const setLabelOpacityNow = React.useCallback(
    (featureId: string, opacity: number) => {
      labelOpacityByIdRef.current.set(featureId, opacity);
      const mapInstance = mapRef.current;
      if (!mapInstance?.setFeatureState) {
        return;
      }
      void mapInstance
        .setFeatureState(featureId, { opacity }, RESTAURANT_LABEL_SOURCE_ID)
        .catch(() => undefined);
    },
    [mapRef]
  );

  const animateLabelOpacity = React.useCallback(
    (featureId: string, targetOpacity: number, delayMs: number, durationMs: number) => {
      cancelLabelAnimation(featureId);

      const resolvedDelayMs = Math.max(0, delayMs);
      const resolvedDurationMs = Math.max(0, durationMs);
      if (resolvedDurationMs === 0) {
        setLabelOpacityNow(featureId, targetOpacity);
        return;
      }

      const startOpacity = labelOpacityByIdRef.current.get(featureId) ?? 0;
      if (startOpacity === targetOpacity) {
        setLabelOpacityNow(featureId, targetOpacity);
        return;
      }

      const easing = targetOpacity > startOpacity ? easeOutCubic : easeInCubic;
      const steps = Math.max(1, Math.ceil(resolvedDurationMs / LABEL_OPACITY_STEP_MS));
      const timeouts: Array<ReturnType<typeof setTimeout>> = [];

      for (let step = 1; step <= steps; step++) {
        const tLinear = step / steps;
        const t = easing(tLinear);
        const nextOpacity = startOpacity + (targetOpacity - startOpacity) * t;
        const timeout = setTimeout(() => {
          setLabelOpacityNow(featureId, nextOpacity);
          if (step === steps) {
            labelAnimationTimeoutsRef.current.delete(featureId);
          }
        }, resolvedDelayMs + Math.round(tLinear * resolvedDurationMs));
        timeouts.push(timeout);
      }

      labelAnimationTimeoutsRef.current.set(featureId, timeouts);
    },
    [cancelLabelAnimation, setLabelOpacityNow]
  );

  const runVisibleMarkerRefreshRef = React.useRef<() => void>(() => undefined);
  const runVisibleMarkerRefresh = React.useCallback(() => {
    if (visibilityRefreshInFlightRef.current) {
      return;
    }
    if (!visibilityRefreshQueuedRef.current) {
      return;
    }

    visibilityRefreshQueuedRef.current = false;
    visibilityRefreshInFlightRef.current = true;

    void refreshVisibleMarkerKeys().finally(() => {
      visibilityRefreshInFlightRef.current = false;
      if (visibilityRefreshQueuedRef.current && !visibilityRefreshTimeoutRef.current) {
        visibilityRefreshTimeoutRef.current = setTimeout(
          () => {
            visibilityRefreshTimeoutRef.current = null;
            runVisibleMarkerRefreshRef.current();
          },
          isMapMovingRef.current
            ? MARKER_VISIBILITY_REFRESH_MS_MOVING
            : MARKER_VISIBILITY_REFRESH_MS_IDLE
        );
      }
    });
  }, [refreshVisibleMarkerKeys]);
  runVisibleMarkerRefreshRef.current = runVisibleMarkerRefresh;

  const scheduleVisibleMarkerRefresh = React.useCallback(() => {
    visibilityRefreshQueuedRef.current = true;
    if (visibilityRefreshTimeoutRef.current || visibilityRefreshInFlightRef.current) {
      return;
    }
    const delayMs = isMapMovingRef.current
      ? MARKER_VISIBILITY_REFRESH_MS_MOVING
      : MARKER_VISIBILITY_REFRESH_MS_IDLE;
    visibilityRefreshTimeoutRef.current = setTimeout(() => {
      visibilityRefreshTimeoutRef.current = null;
      runVisibleMarkerRefreshRef.current();
    }, delayMs);
  }, []);

  React.useEffect(() => {
    if (!shouldRenderLabels) {
      for (const timeouts of labelAnimationTimeoutsRef.current.values()) {
        for (const timeout of timeouts) {
          clearTimeout(timeout);
        }
      }
      labelAnimationTimeoutsRef.current.clear();
      labelOpacityByIdRef.current.clear();
      previousVisibleLabelIdsRef.current = new Set();
      labelRevealRegistryRef.current.clear();
      return;
    }

    if (!canUseLabelFeatureState) {
      return;
    }

    const mapInstance = mapRef.current;

    for (const timeouts of labelAnimationTimeoutsRef.current.values()) {
      for (const timeout of timeouts) {
        clearTimeout(timeout);
      }
    }
    labelAnimationTimeoutsRef.current.clear();
    labelOpacityByIdRef.current.clear();
    previousVisibleLabelIdsRef.current = new Set();
    labelRevealRegistryRef.current.clear();

    for (const featureId of labelFeatureIdSet) {
      labelOpacityByIdRef.current.set(featureId, 0);
      void mapInstance
        .setFeatureState(featureId, { opacity: 0 }, RESTAURANT_LABEL_SOURCE_ID)
        .catch(() => undefined);
    }
  }, [canUseLabelFeatureState, labelFeatureIdSet, mapRef, markersRenderKey, shouldRenderLabels]);

  React.useEffect(() => {
    scheduleVisibleMarkerRefresh();
  }, [
    markerMercatorEntries,
    mapViewportSize.height,
    mapViewportSize.width,
    scheduleVisibleMarkerRefresh,
  ]);

  const handleDotPress = React.useCallback(
    (event: OnPressEvent) => {
      const feature = event?.features?.[0];
      const restaurantId = feature?.properties?.restaurantId;
      if (typeof restaurantId !== 'string') {
        return;
      }
      onMarkerPress?.(restaurantId);
    },
    [onMarkerPress]
  );
  const profilerCallback =
    onProfilerRender ??
    ((() => {
      // noop
    }) as React.ProfilerOnRenderCallback);

  const handleCameraChanged = React.useCallback(
    (state: MapboxMapState) => {
      isMapMovingRef.current = true;
      mapLastMovedAtRef.current = Date.now();
      scheduleVisibleMarkerRefresh();
      onCameraChanged(state);
    },
    [onCameraChanged, scheduleVisibleMarkerRefresh]
  );

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      isMapMovingRef.current = false;
      mapLastMovedAtRef.current = Date.now();
      if (visibilityRefreshTimeoutRef.current) {
        clearTimeout(visibilityRefreshTimeoutRef.current);
        visibilityRefreshTimeoutRef.current = null;
      }
      visibilityRefreshQueuedRef.current = true;
      runVisibleMarkerRefreshRef.current();
      onMapIdle(state);
    },
    [onMapIdle]
  );

  const handleMapLoaded = React.useCallback(() => {
    visibilityRefreshQueuedRef.current = true;
    runVisibleMarkerRefreshRef.current();
    onMapLoaded();
  }, [onMapLoaded]);

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

  const renderedMarkerMetaByKey = React.useMemo(() => {
    const revealChunk = Math.max(1, markerRevealChunk);
    const revealStaggerMs = Math.max(0, markerRevealStaggerMs);
    const meta = new Map<string, { enterDelayMs: number }>();

    for (let index = 0; index < sortedRestaurantMarkers.length; index++) {
      const feature = sortedRestaurantMarkers[index];
      const markerKey = buildMarkerKey(feature);
      const withinChunkIndex = revealChunk > 1 ? index % revealChunk : 0;
      const enterDelayMs = withinChunkIndex * revealStaggerMs;
      meta.set(markerKey, { enterDelayMs });
    }

    return meta;
  }, [
    buildMarkerKey,
    markerRevealChunk,
    markerRevealStaggerMs,
    sortedRestaurantMarkers,
  ]);

  React.useEffect(() => {
    if (!shouldRenderLabels) {
      return;
    }

    if (!canUseLabelFeatureState) {
      previousVisibleLabelIdsRef.current = new Set();
      return;
    }

    if (!labelFeatureIdSet.size) {
      previousVisibleLabelIdsRef.current = new Set();
      return;
    }

    const nextVisibleLabelIds = new Set<string>();
    for (const markerKey of renderedMarkerMetaByKey.keys()) {
      if (!labelFeatureIdSet.has(markerKey)) {
        continue;
      }
      if (visibleMarkerKeys.has(markerKey)) {
        nextVisibleLabelIds.add(markerKey);
      }
    }

    const previousVisible = previousVisibleLabelIdsRef.current;
    for (const markerKey of previousVisible) {
      if (nextVisibleLabelIds.has(markerKey)) {
        continue;
      }
      animateLabelOpacity(markerKey, 0, 0, Math.max(0, markerRevealAnimMs));
    }

    const shouldHoldForReentry = getIsMapMoving();
    for (const markerKey of nextVisibleLabelIds) {
      if (previousVisible.has(markerKey)) {
        continue;
      }

      const markerMeta = renderedMarkerMetaByKey.get(markerKey);
      const enterDelayMs = markerMeta?.enterDelayMs ?? 0;
      const shouldUseReveal = shouldAnimateMarkerReveal && getIsFirstLabelReveal(markerKey);
      const delayMs = shouldUseReveal
        ? enterDelayMs
        : shouldHoldForReentry
        ? MARKER_REENTRY_HOLD_MS
        : 0;

      animateLabelOpacity(markerKey, 1, delayMs, Math.max(0, markerRevealAnimMs));
    }

    previousVisibleLabelIdsRef.current = nextVisibleLabelIds;
  }, [
    animateLabelOpacity,
    canUseLabelFeatureState,
    getIsFirstLabelReveal,
    getIsMapMoving,
    labelFeatureIdSet,
    markerRevealAnimMs,
    renderedMarkerMetaByKey,
    shouldAnimateMarkerReveal,
    shouldRenderLabels,
    visibleMarkerKeys,
  ]);

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
        onDidFinishLoadingStyle={handleMapLoaded}
        onDidFinishLoadingMap={handleMapLoaded}
        onDidFailLoadingMap={handleMapLoadError}
        onDidFailLoadingStyle={handleMapLoadError}
      >
        {USE_STYLE_LAYER_PINS ? (
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
        ) : null}
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
        {shouldRenderDots ? (
          <React.Profiler id="SearchMapDots" onRender={profilerCallback}>
            <MapboxGL.ShapeSource
              id={DOT_SOURCE_ID}
              shape={dotRestaurantFeatures as FeatureCollection<Point, RestaurantFeatureProperties>}
              onPress={handleDotPress}
            >
              <MapboxGL.CircleLayer id={DOT_LAYER_ID} style={DOT_LAYER_STYLE} />
            </MapboxGL.ShapeSource>
          </React.Profiler>
        ) : null}
        {USE_STYLE_LAYER_PINS && !shouldDisableMarkers && sortedRestaurantMarkers.length ? (
          <MapboxGL.ShapeSource
            id={STYLE_PINS_SOURCE_ID}
            shape={restaurantLabelFeaturesWithIds}
            onPress={handleStylePinPress}
          >
            {DEBUG_STYLE_PINS_COLLISION ? (
              <MapboxGL.CircleLayer
                id="restaurant-style-pins-collision-debug"
                style={DEBUG_STYLE_PINS_COLLISION_STYLE}
              />
            ) : null}
            {stylePinLayerStack}
          </MapboxGL.ShapeSource>
        ) : null}
        {shouldRenderLabels ? (
          <React.Profiler id="SearchMapLabels" onRender={profilerCallback}>
            <MapboxGL.ShapeSource
              id={RESTAURANT_LABEL_SOURCE_ID}
              shape={restaurantLabelFeaturesWithIds}
            >
              <MapboxGL.SymbolLayer
                id="restaurant-labels"
                sourceID={RESTAURANT_LABEL_SOURCE_ID}
                style={restaurantLabelStyleWithOpacity}
              />
              {DEBUG_FORCE_TOP_LABELS && restaurantLabelForceTopDebugStyle ? (
                <MapboxGL.SymbolLayer
                  id="restaurant-labels-force-top-debug"
                  sourceID={RESTAURANT_LABEL_SOURCE_ID}
                  style={restaurantLabelForceTopDebugStyle}
                />
              ) : null}
            </MapboxGL.ShapeSource>
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
  if (prev.shouldAnimateMarkerReveal !== next.shouldAnimateMarkerReveal) {
    return false;
  }
  if (prev.markerRevealChunk !== next.markerRevealChunk) {
    return false;
  }
  if (prev.markerRevealStaggerMs !== next.markerRevealStaggerMs) {
    return false;
  }
  if (prev.markerRevealAnimMs !== next.markerRevealAnimMs) {
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
  return true;
};

export default React.memo(SearchMap, arePropsEqual);
