import React from 'react';
import {
  Animated,
  Image,
  type LayoutChangeEvent,
  Pressable,
  Text as RNText,
  View,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import MapboxGL, { type MapState as MapboxMapState, type OnPressEvent } from '@rnmapbox/maps';
import type { Feature, FeatureCollection, Point } from 'geojson';

import pinAsset from '../../../assets/pin.png';
import pinFillAsset from '../../../assets/pin-fill.png';
import AppBlurView from '../../../components/app-blur-view';
import type { Coordinate } from '../../../types';
import { logger } from '../../../utils';
import { USA_FALLBACK_CENTER } from '../constants/search';

import styles from '../styles';
import { getMarkerZIndex } from '../utils/map';
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
const MARKER_MOUNT_INITIAL_BATCH = 4;
const MARKER_MOUNT_BATCH_SIZE = 2;
const MARKER_MOUNT_DEFER_CHECK_MS = 100;
const MARKER_ANCHOR = { x: 0.5, y: 1 } as const;
const USER_LOCATION_ANCHOR = { x: 0.5, y: 0.5 } as const;
const MARKER_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

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

type MarkerPinProps = {
  markerKey: string;
  getIsFirstReveal: (markerKey: string) => boolean;
  getIsMapMoving: () => boolean;
  isVisible: boolean;
  isSelected: boolean;
  pinColor: string;
  rank: number;
  shouldAnimateOnMount: boolean;
  enterDelayMs: number;
  enterDurationMs: number;
};

/**
 * MarkerPin - MarkerView "edge fade" with *no snapping*.
 *
 * The critical invariant: **MarkerView stays mounted** and we only drive its visual presence via an
 * opacity animation.
 *
 * Why it doesn't snap/pop:
 * - We never conditionally mount/unmount the MarkerView based on viewport intersection.
 * - Visibility is computed against an *overscanned* viewport polygon (see `marker-visibility.ts`)
 *   so the fade-in starts while the pin is still outside the clipped viewport, and the hard-hide
 *   happens after it's already offscreen.
 * - We gate the fade-in on a single boolean edge (`wasVisible -> isVisible`) and keep steady-state
 *   "visible" pins from restarting their animation on every refresh tick.
 *
 * DO NOT "simplify" this by:
 * - toggling MarkerView rendering on `isVisible`
 * - swapping `opacity` for `display: none`
 * - removing the overscan coupling
 *
 * Any of those changes tends to reintroduce native annotation pop/snapping at the viewport edge,
 * especially during fast pans.
 */
const MarkerPin: React.FC<MarkerPinProps> = React.memo(
  ({
    markerKey,
    getIsFirstReveal,
    getIsMapMoving,
    isVisible,
    isSelected,
    pinColor,
    rank,
    shouldAnimateOnMount,
    enterDelayMs,
    enterDurationMs,
  }) => {
    const shouldAnimateOnMountRef = React.useRef(shouldAnimateOnMount);
    const enterDelayMsRef = React.useRef(enterDelayMs);
    const enterDurationMsRef = React.useRef(enterDurationMs);

    shouldAnimateOnMountRef.current = shouldAnimateOnMount;
    enterDelayMsRef.current = enterDelayMs;
    enterDurationMsRef.current = enterDurationMs;

    const opacity = useSharedValue(0);
    const previousVisibilityRef = React.useRef<boolean | null>(null);

    React.useEffect(() => {
      const wasVisible = previousVisibilityRef.current === true;
      previousVisibilityRef.current = isVisible;

      // This cancellation is the difference between a clean fade and jittery "snaps" when map
      // movement causes visibility to toggle quickly (native view annotations can lag by a frame).
      cancelAnimation(opacity);

      if (!isVisible) {
        // Hard-hide immediately. This transition only happens once the pin is already offscreen
        // thanks to the overscanned visibility bounds, so users never perceive this as a snap.
        opacity.value = 0;
        return;
      }

      if (wasVisible) {
        // Stay visible; do not restart the animation on every visibility refresh tick.
        return;
      }

      const shouldUseReveal = shouldAnimateOnMountRef.current && getIsFirstReveal(markerKey);
      const shouldHoldForReentry = !shouldUseReveal && getIsMapMoving();
      let delayMs = 0;
      if (shouldUseReveal) {
        delayMs = Math.max(0, enterDelayMsRef.current);
      } else if (shouldHoldForReentry) {
        delayMs = MARKER_REENTRY_HOLD_MS;
      }
      const durationMs = Math.max(0, enterDurationMsRef.current);
      const easing = Easing.out(Easing.cubic);

      // Always restart the reveal from 0, even if a previous reveal was mid-flight.
      // Combined with `cancelAnimation` this guarantees we never "jump" to an unexpected opacity.
      opacity.value = 0;
      opacity.value = withDelay(
        delayMs,
        withTiming(1, {
          duration: durationMs,
          easing,
        })
      );
    }, [getIsFirstReveal, getIsMapMoving, isVisible, markerKey, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
    }));

    return (
      <Reanimated.View style={[styles.pinWrapper, styles.pinShadow, animatedStyle]}>
        {/* Prevent React Native's default image crossfade from fighting our opacity animation. */}
        <Image source={pinAsset} style={styles.pinBase} fadeDuration={0} />
        <Image
          source={pinFillAsset}
          style={[styles.pinFill, { tintColor: isSelected ? PRIMARY_COLOR : pinColor }]}
          fadeDuration={0}
        />
        <View style={styles.pinRankWrapper}>
          <RNText style={styles.pinRank}>{rank}</RNText>
        </View>
      </Reanimated.View>
    );
  }
);

type MarkerItemProps = {
  markerKey: string;
  restaurantId: string;
  coordinate: [number, number];
  zIndex: number;
  rank: number;
  pinColor: string;
  isVisible: boolean;
  isSelected: boolean;
  onMarkerPress?: (restaurantId: string) => void;
  getIsFirstReveal: (markerKey: string) => boolean;
  getIsMapMoving: () => boolean;
  shouldAnimateOnMount: boolean;
  enterDelayMs: number;
  enterDurationMs: number;
};

const MarkerItem: React.FC<MarkerItemProps> = React.memo(
  ({
    markerKey,
    restaurantId,
    coordinate,
    zIndex,
    rank,
    pinColor,
    isVisible,
    isSelected,
    onMarkerPress,
    getIsFirstReveal,
    getIsMapMoving,
    shouldAnimateOnMount,
    enterDelayMs,
    enterDurationMs,
  }) => {
    const markerViewStyle = React.useMemo(() => [styles.markerView, { zIndex }], [zIndex]);
    const handlePress = React.useCallback(() => {
      onMarkerPress?.(restaurantId);
    }, [onMarkerPress, restaurantId]);

    return (
      <MapboxGL.MarkerView
        id={`restaurant-marker-${markerKey}`}
        coordinate={coordinate}
        anchor={MARKER_ANCHOR}
        allowOverlap
        isSelected={true}
        style={markerViewStyle}
      >
        <Pressable
          onPress={handlePress}
          hitSlop={MARKER_HIT_SLOP}
          pointerEvents={isVisible ? 'auto' : 'none'}
        >
          <MarkerPin
            markerKey={markerKey}
            getIsFirstReveal={getIsFirstReveal}
            getIsMapMoving={getIsMapMoving}
            isVisible={isVisible}
            isSelected={isSelected}
            pinColor={pinColor}
            rank={rank}
            shouldAnimateOnMount={shouldAnimateOnMount}
            enterDelayMs={enterDelayMs}
            enterDurationMs={enterDurationMs}
          />
        </Pressable>
      </MapboxGL.MarkerView>
    );
  },
  (prev, next) => {
    if (prev.markerKey !== next.markerKey) {
      return false;
    }
    if (prev.restaurantId !== next.restaurantId) {
      return false;
    }
    if (prev.coordinate[0] !== next.coordinate[0] || prev.coordinate[1] !== next.coordinate[1]) {
      return false;
    }
    if (prev.zIndex !== next.zIndex) {
      return false;
    }
    if (prev.rank !== next.rank) {
      return false;
    }
    if (prev.pinColor !== next.pinColor) {
      return false;
    }
    if (prev.isVisible !== next.isVisible) {
      return false;
    }
    if (prev.isSelected !== next.isSelected) {
      return false;
    }
    if (prev.onMarkerPress !== next.onMarkerPress) {
      return false;
    }
    if (prev.getIsFirstReveal !== next.getIsFirstReveal) {
      return false;
    }
    if (prev.getIsMapMoving !== next.getIsMapMoving) {
      return false;
    }
    if (prev.shouldAnimateOnMount !== next.shouldAnimateOnMount) {
      return false;
    }
    if (prev.enterDelayMs !== next.enterDelayMs) {
      return false;
    }
    if (prev.enterDurationMs !== next.enterDurationMs) {
      return false;
    }
    return true;
  }
);

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
  getShouldDeferMarkerMount?: () => boolean;
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
  getShouldDeferMarkerMount,
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
  const [markerRenderCount, setMarkerRenderCount] = React.useState(0);
  const markerRevealRegistryRef = React.useRef<Set<string>>(new Set());
  const labelRevealRegistryRef = React.useRef<Set<string>>(new Set());
  const previousShouldAnimateMarkerRevealRef = React.useRef(false);
	  const previousMarkersRenderKeyRef = React.useRef<string | null>(null);
	  const markerRenderCountRef = React.useRef(0);
	  const markerMountRafRef = React.useRef<number | null>(null);
	  const markerMountDeferTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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

  React.useEffect(() => {
    markerRenderCountRef.current = markerRenderCount;
  }, [markerRenderCount]);

  React.useEffect(() => {
    if (shouldDisableMarkers) {
      if (markerMountRafRef.current != null) {
        cancelAnimationFrame(markerMountRafRef.current);
        markerMountRafRef.current = null;
      }
      if (markerMountDeferTimeoutRef.current) {
        clearTimeout(markerMountDeferTimeoutRef.current);
        markerMountDeferTimeoutRef.current = null;
      }
      markerRenderCountRef.current = 0;
      setMarkerRenderCount(0);
      previousMarkersRenderKeyRef.current = markersRenderKey;
      return;
    }

    const targetCount = sortedRestaurantMarkers.length;
    const previousKey = previousMarkersRenderKeyRef.current;
    const isAppend =
      typeof previousKey === 'string' &&
      previousKey.length > 0 &&
      markersRenderKey.startsWith(previousKey);
    const shouldDeferMarkerMount = getShouldDeferMarkerMount?.() === true;

    previousMarkersRenderKeyRef.current = markersRenderKey;

    if (markerMountRafRef.current != null) {
      cancelAnimationFrame(markerMountRafRef.current);
      markerMountRafRef.current = null;
    }
    if (markerMountDeferTimeoutRef.current) {
      clearTimeout(markerMountDeferTimeoutRef.current);
      markerMountDeferTimeoutRef.current = null;
    }

    const initialCount = isAppend
      ? Math.min(markerRenderCountRef.current, targetCount)
      : shouldDeferMarkerMount
      ? 0
      : Math.min(targetCount, MARKER_MOUNT_INITIAL_BATCH);

    if (markerRenderCountRef.current !== initialCount) {
      markerRenderCountRef.current = initialCount;
      setMarkerRenderCount(initialCount);
    }

    if (markerRenderCountRef.current >= targetCount) {
      return;
    }

    const tick = () => {
      if (getShouldDeferMarkerMount?.() === true) {
        if (markerMountDeferTimeoutRef.current) {
          return;
        }
        markerMountDeferTimeoutRef.current = setTimeout(() => {
          markerMountDeferTimeoutRef.current = null;
          tick();
        }, MARKER_MOUNT_DEFER_CHECK_MS);
        return;
      }
      const nextCount = Math.min(
        targetCount,
        markerRenderCountRef.current + MARKER_MOUNT_BATCH_SIZE
      );
      if (nextCount === markerRenderCountRef.current) {
        markerMountRafRef.current = null;
        return;
      }
      markerRenderCountRef.current = nextCount;
      setMarkerRenderCount(nextCount);
      if (nextCount < targetCount) {
        markerMountRafRef.current = requestAnimationFrame(tick);
      } else {
        markerMountRafRef.current = null;
      }
    };

    markerMountRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (markerMountRafRef.current != null) {
        cancelAnimationFrame(markerMountRafRef.current);
        markerMountRafRef.current = null;
      }
      if (markerMountDeferTimeoutRef.current) {
        clearTimeout(markerMountDeferTimeoutRef.current);
        markerMountDeferTimeoutRef.current = null;
      }
    };
  }, [
    getShouldDeferMarkerMount,
    markersRenderKey,
    shouldDisableMarkers,
    sortedRestaurantMarkers.length,
  ]);

  React.useEffect(() => {
    if (shouldAnimateMarkerReveal && !previousShouldAnimateMarkerRevealRef.current) {
      markerRevealRegistryRef.current.clear();
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

  const getIsFirstMarkerReveal = React.useCallback((markerKey: string) => {
    const registry = markerRevealRegistryRef.current;
    const isFirstReveal = !registry.has(markerKey);
    if (isFirstReveal) {
      registry.add(markerKey);
    }
    return isFirstReveal;
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

  const resolvedMarkerRenderCount = React.useMemo(() => {
    const targetCount = sortedRestaurantMarkers.length;
    if (targetCount === 0) {
      return 0;
    }
    if (shouldDisableMarkers) {
      return 0;
    }

    const previousKey = previousMarkersRenderKeyRef.current;
    const isRenderKeyStale = previousKey !== markersRenderKey;
    if (!isRenderKeyStale) {
      return Math.min(markerRenderCount, targetCount);
    }

    const isAppend =
      typeof previousKey === 'string' &&
      previousKey.length > 0 &&
      markersRenderKey.startsWith(previousKey);
    if (isAppend) {
      return Math.min(markerRenderCount, targetCount);
    }
    if (getShouldDeferMarkerMount?.() === true) {
      return 0;
    }
    return Math.min(targetCount, MARKER_MOUNT_INITIAL_BATCH);
  }, [
    getShouldDeferMarkerMount,
    markerRenderCount,
    markersRenderKey,
    shouldDisableMarkers,
    sortedRestaurantMarkers.length,
  ]);

  const renderedMarkerMetaByKey = React.useMemo(() => {
    const revealChunk = Math.max(1, markerRevealChunk);
    const revealStaggerMs = Math.max(0, markerRevealStaggerMs);
    const meta = new Map<string, { enterDelayMs: number }>();

    for (
      let index = 0;
      index < Math.min(resolvedMarkerRenderCount, sortedRestaurantMarkers.length);
      index++
    ) {
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
    resolvedMarkerRenderCount,
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
        {!shouldDisableMarkers && sortedRestaurantMarkers.length ? (
          <React.Profiler id="SearchMapMarkers" onRender={profilerCallback}>
            <React.Fragment>
              {sortedRestaurantMarkers.slice(0, resolvedMarkerRenderCount).map((feature, index) => {
                const coordinates = feature.geometry.coordinates as [number, number];
                const markerKey = buildMarkerKey(feature);
                const zIndex = getMarkerZIndex(feature.properties.rank);
                const revealChunk = Math.max(1, markerRevealChunk);
                const revealStaggerMs = Math.max(0, markerRevealStaggerMs);
                const withinChunkIndex = revealChunk > 1 ? index % revealChunk : 0;
                const enterDelayMs = withinChunkIndex * revealStaggerMs;
                const isSelected = selectedRestaurantId === feature.properties.restaurantId;
                const isMarkerVisible = visibleMarkerKeys.has(markerKey);
                return (
                  <MarkerItem
                    key={markerKey}
                    markerKey={markerKey}
                    restaurantId={feature.properties.restaurantId}
                    coordinate={coordinates}
                    zIndex={zIndex}
                    rank={feature.properties.rank}
                    pinColor={feature.properties.pinColor}
                    isVisible={isMarkerVisible}
                    isSelected={isSelected}
                    onMarkerPress={onMarkerPress}
                    getIsFirstReveal={getIsFirstMarkerReveal}
                    getIsMapMoving={getIsMapMoving}
                    shouldAnimateOnMount={shouldAnimateMarkerReveal}
                    enterDelayMs={enterDelayMs}
                    enterDurationMs={markerRevealAnimMs}
                  />
                );
              })}
            </React.Fragment>
          </React.Profiler>
        ) : null}
        {shouldRenderLabels ? (
          <React.Profiler id="SearchMapLabels" onRender={profilerCallback}>
            <MapboxGL.ShapeSource
              id={RESTAURANT_LABEL_SOURCE_ID}
              shape={restaurantLabelFeaturesWithIds}
            >
              <MapboxGL.SymbolLayer
                id="restaurant-labels"
                style={restaurantLabelStyleWithOpacity}
              />
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
  if (prev.getShouldDeferMarkerMount !== next.getShouldDeferMarkerMount) {
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
