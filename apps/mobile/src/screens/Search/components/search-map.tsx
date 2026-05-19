import React from 'react';
import { Platform, View, findNodeHandle, type LayoutChangeEvent } from 'react-native';

import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';
import type { Feature, FeatureCollection, Point } from 'geojson';

import pinAsset from '../../../assets/pin.png';
import pinFillAsset from '../../../assets/pin-fill.png';
import pinShadowAsset from '../../../assets/pin-shadow.png';
import { colors as themeColors } from '../../../constants/theme';
import type { StartupLocationSnapshot } from '../../../navigation/runtime/MainLaunchCoordinator';
import type { Coordinate, MapBounds } from '../../../types';
import { logger } from '../../../utils';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import { shouldLogSearchNavSwitchDiagnosticLogs } from '../runtime/shared/search-nav-switch-perf-probe';
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
import { useSearchMapNativeRenderOwner } from './hooks/use-search-map-native-render-owner';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import type { SearchMapPresentationScene } from '../runtime/map/map-presentation-runtime-contract';
import type { MapMotionPressureController } from '../runtime/map/map-motion-pressure';
import {
  EMPTY_SEARCH_MAP_SOURCE_STORE,
  type SearchMapSourceStore,
} from '../runtime/map/search-map-source-store';
import {
  searchMapRenderController,
  type SearchMapRenderInteractionMode,
} from '../runtime/map/search-map-render-controller';
import {
  useSearchMapSourceFrameSelector,
  type SearchMapSourceFramePort,
} from '../runtime/map/search-map-source-frame-port';
import type { ResultsPresentationAuthority } from '../runtime/shared/results-presentation-authority';
import type { SearchMapPresentationLifecyclePort } from '../runtime/shared/search-map-protocol-contract';

const MAP_PAN_DECELERATION_FACTOR = 0.995;
const SEARCH_MAP_COMPONENT_INSTANCE_ID_PREFIX = 'search-map-component';
let searchMapComponentInstanceSeq = 0;

const nextSearchMapComponentInstanceId = (): string => {
  searchMapComponentInstanceSeq += 1;
  return `${SEARCH_MAP_COMPONENT_INSTANCE_ID_PREFIX}:${searchMapComponentInstanceSeq}`;
};

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

type DirectSourceFrameStores = {
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore;
  pinInteractionSourceStore: SearchMapSourceStore;
  dotInteractionSourceStore: SearchMapSourceStore;
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
};

const DIRECT_SOURCE_FRAME_STORE_KEYS = [
  'pinSourceStore',
  'dotSourceStore',
  'pinInteractionSourceStore',
  'dotInteractionSourceStore',
  'labelSourceStore',
  'labelCollisionSourceStore',
] as const;

const areDirectSourceFrameStoresEqual = (
  left: DirectSourceFrameStores,
  right: DirectSourceFrameStores
): boolean =>
  left.pinSourceStore === right.pinSourceStore &&
  left.dotSourceStore === right.dotSourceStore &&
  left.pinInteractionSourceStore === right.pinInteractionSourceStore &&
  left.dotInteractionSourceStore === right.dotInteractionSourceStore &&
  left.labelSourceStore === right.labelSourceStore &&
  left.labelCollisionSourceStore === right.labelCollisionSourceStore;

const LABEL_STICKY_REFRESH_MS_IDLE = 140;
const LABEL_STICKY_REFRESH_MS_MOVING = 16;
// Sticky label tuning:
// - We keep a per-marker "locked" candidate (bottom/right/top/left) to prevent rapid anchor flips.
// - If the locked label isn't being placed, we unlock so Mapbox can pick a new side.
// - While moving, unlock/lock uses small hysteresis so brief query sampling gaps don't cause thrash.
const LABEL_STICKY_LOCK_STABLE_MS_MOVING = 140;
const LABEL_STICKY_LOCK_STABLE_MS_IDLE = 80;
const LABEL_STICKY_UNLOCK_MISSING_MS_MOVING = 260;
const LABEL_STICKY_UNLOCK_MISSING_MS_IDLE = 700;
const LABEL_STICKY_UNLOCK_MISSING_STREAK_MOVING = 3;
const STYLE_PIN_OUTLINE_IMAGE_ID = 'restaurant-pin-outline';
const STYLE_PIN_SHADOW_IMAGE_ID = 'restaurant-pin-shadow';
const STYLE_PIN_FILL_IMAGE_ID = 'restaurant-pin-fill';
const LABEL_MUTEX_IMAGE_ID = 'restaurant-label-mutex';
const STYLE_PINS_SOURCE_ID = 'restaurant-style-pins-source';
const PIN_INTERACTION_SOURCE_ID = 'restaurant-pin-interaction-source';
const LABEL_INTERACTION_SOURCE_ID = 'restaurant-label-interaction-source';

// Lock each restaurant to a single chosen candidate and only reconsider when that candidate
// disappears (i.e. it cannot be placed).
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

type SearchMapLabelLayersProps = {
  labelLayerSpecs: ReadonlyArray<{
    preferredCandidate: LabelCandidate;
    candidate: LabelCandidate;
    layerId: string;
    interactionLayerId: string;
  }>;
  labelCandidateStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  labelInteractionStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  handlePressTarget: (event: SearchMapPressEvent) => void;
  restaurantLabelPinCollisionLayerKey: string;
  restaurantLabelPinCollisionLayerId: string;
  restaurantLabelPinCollisionLayerIdSideLeft: string;
  restaurantLabelPinCollisionLayerIdSideRight: string;
  restaurantLabelPinCollisionStyles: {
    center: MapboxGL.SymbolLayerStyle;
    left: MapboxGL.SymbolLayerStyle;
    right: MapboxGL.SymbolLayerStyle;
  };
};

type LabelPlacementFilter = NonNullable<
  React.ComponentProps<typeof MapboxGL.SymbolLayer>['filter']
>;

const SearchMapLabelLayers = React.memo(
  ({
    labelLayerSpecs,
    labelCandidateStyles,
    labelInteractionStyles,
    handlePressTarget,
    restaurantLabelPinCollisionLayerKey,
    restaurantLabelPinCollisionLayerId,
    restaurantLabelPinCollisionLayerIdSideLeft,
    restaurantLabelPinCollisionLayerIdSideRight,
    restaurantLabelPinCollisionStyles,
  }: SearchMapLabelLayersProps) => {
    const buildLabelPlacementFilter = React.useCallback(
      (preferredCandidate: LabelCandidate, candidate: LabelCandidate): LabelPlacementFilter =>
        [
          'all',
          ['==', ['get', 'labelPreference'], preferredCandidate],
          ['==', ['get', 'labelCandidate'], candidate],
        ] as LabelPlacementFilter,
      []
    );
    const buildLabelInteractionFilter = React.useCallback(
      (_preferredCandidate: LabelCandidate, candidate: LabelCandidate): LabelPlacementFilter =>
        ['==', ['get', 'labelCandidate'], candidate] as LabelPlacementFilter,
      []
    );
    return (
      <React.Fragment>
        <MapboxGL.ShapeSource id={RESTAURANT_LABEL_SOURCE_ID} shape={EMPTY_POINT_FEATURES}>
          {labelLayerSpecs.map(({ preferredCandidate, candidate, layerId }) => (
            <MapboxGL.SymbolLayer
              key={layerId}
              id={layerId}
              slot="top"
              sourceID={RESTAURANT_LABEL_SOURCE_ID}
              belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
              style={labelCandidateStyles[candidate]}
              filter={buildLabelPlacementFilter(preferredCandidate, candidate)}
            />
          ))}
        </MapboxGL.ShapeSource>
        <MapboxGL.ShapeSource
          id={LABEL_INTERACTION_SOURCE_ID}
          shape={EMPTY_POINT_FEATURES}
          onPress={handlePressTarget}
        >
          {labelLayerSpecs.map(({ preferredCandidate, candidate, interactionLayerId }) => (
            <MapboxGL.SymbolLayer
              key={interactionLayerId}
              id={interactionLayerId}
              slot="top"
              sourceID={LABEL_INTERACTION_SOURCE_ID}
              belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
              style={labelInteractionStyles[candidate]}
              filter={buildLabelInteractionFilter(preferredCandidate, candidate)}
            />
          ))}
        </MapboxGL.ShapeSource>
        <MapboxGL.ShapeSource id={RESTAURANT_LABEL_COLLISION_SOURCE_ID} shape={EMPTY_POINT_FEATURES}>
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
        </MapboxGL.ShapeSource>
      </React.Fragment>
    );
  },
  (previousProps, nextProps) =>
    previousProps.labelLayerSpecs === nextProps.labelLayerSpecs &&
    previousProps.labelCandidateStyles === nextProps.labelCandidateStyles &&
    previousProps.labelInteractionStyles === nextProps.labelInteractionStyles &&
    previousProps.handlePressTarget === nextProps.handlePressTarget &&
    previousProps.restaurantLabelPinCollisionLayerKey ===
      nextProps.restaurantLabelPinCollisionLayerKey &&
    previousProps.restaurantLabelPinCollisionLayerId ===
      nextProps.restaurantLabelPinCollisionLayerId &&
    previousProps.restaurantLabelPinCollisionLayerIdSideLeft ===
      nextProps.restaurantLabelPinCollisionLayerIdSideLeft &&
    previousProps.restaurantLabelPinCollisionLayerIdSideRight ===
      nextProps.restaurantLabelPinCollisionLayerIdSideRight &&
    previousProps.restaurantLabelPinCollisionStyles === nextProps.restaurantLabelPinCollisionStyles
);

type SearchMapMarkerSceneProps = {
  dotLayerStyle: MapboxGL.SymbolLayerStyle;
  dotInteractionFilter: readonly unknown[];
  handlePressTarget: (event: SearchMapPressEvent) => void;
  stylePinLayerStack: React.ReactElement[];
  pinInteractionLayerStack: React.ReactElement[];
  profilerCallback: React.ProfilerOnRenderCallback;
  labelLayerSpecs: ReadonlyArray<{
    preferredCandidate: LabelCandidate;
    candidate: LabelCandidate;
    layerId: string;
    interactionLayerId: string;
  }>;
  labelCandidateStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  labelInteractionStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  restaurantLabelPinCollisionLayerKey: string;
  restaurantLabelPinCollisionLayerId: string;
  restaurantLabelPinCollisionLayerIdSideLeft: string;
  restaurantLabelPinCollisionLayerIdSideRight: string;
  restaurantLabelPinCollisionStyles: {
    center: MapboxGL.SymbolLayerStyle;
    left: MapboxGL.SymbolLayerStyle;
    right: MapboxGL.SymbolLayerStyle;
  };
};

const SearchMapMarkerScene = React.memo(
  ({
    dotLayerStyle,
    dotInteractionFilter,
    handlePressTarget,
    stylePinLayerStack,
    pinInteractionLayerStack,
    profilerCallback,
    labelLayerSpecs,
    labelCandidateStyles,
    labelInteractionStyles,
    restaurantLabelPinCollisionLayerKey,
    restaurantLabelPinCollisionLayerId,
    restaurantLabelPinCollisionLayerIdSideLeft,
    restaurantLabelPinCollisionLayerIdSideRight,
    restaurantLabelPinCollisionStyles,
  }: SearchMapMarkerSceneProps) => {
    return (
      <React.Fragment>
        <React.Profiler id="SearchMapDots" onRender={profilerCallback}>
          <MapboxGL.ShapeSource
            id={DOT_SOURCE_ID}
            shape={EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>}
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
            shape={EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>}
            onPress={handlePressTarget}
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
        <MapboxGL.ShapeSource
          id={STYLE_PINS_SOURCE_ID}
          shape={EMPTY_POINT_FEATURES}
        >
          {stylePinLayerStack}
        </MapboxGL.ShapeSource>
        <MapboxGL.ShapeSource
          id={PIN_INTERACTION_SOURCE_ID}
          shape={EMPTY_POINT_FEATURES}
          onPress={handlePressTarget}
        >
          {pinInteractionLayerStack}
        </MapboxGL.ShapeSource>
        <React.Profiler id="SearchMapLabels" onRender={profilerCallback}>
          <SearchMapLabelLayers
            labelLayerSpecs={labelLayerSpecs}
            labelCandidateStyles={labelCandidateStyles}
            labelInteractionStyles={labelInteractionStyles}
            handlePressTarget={handlePressTarget}
            restaurantLabelPinCollisionLayerKey={restaurantLabelPinCollisionLayerKey}
            restaurantLabelPinCollisionLayerId={restaurantLabelPinCollisionLayerId}
            restaurantLabelPinCollisionLayerIdSideLeft={restaurantLabelPinCollisionLayerIdSideLeft}
            restaurantLabelPinCollisionLayerIdSideRight={restaurantLabelPinCollisionLayerIdSideRight}
            restaurantLabelPinCollisionStyles={restaurantLabelPinCollisionStyles}
          />
        </React.Profiler>
      </React.Fragment>
    );
  },
  (previousProps, nextProps) =>
    previousProps.dotLayerStyle === nextProps.dotLayerStyle &&
    previousProps.dotInteractionFilter === nextProps.dotInteractionFilter &&
    previousProps.handlePressTarget === nextProps.handlePressTarget &&
    previousProps.stylePinLayerStack === nextProps.stylePinLayerStack &&
    previousProps.pinInteractionLayerStack === nextProps.pinInteractionLayerStack &&
    previousProps.profilerCallback === nextProps.profilerCallback &&
    previousProps.labelLayerSpecs === nextProps.labelLayerSpecs &&
    previousProps.labelCandidateStyles === nextProps.labelCandidateStyles &&
    previousProps.labelInteractionStyles === nextProps.labelInteractionStyles &&
    previousProps.restaurantLabelPinCollisionLayerKey ===
      nextProps.restaurantLabelPinCollisionLayerKey &&
    previousProps.restaurantLabelPinCollisionLayerId ===
      nextProps.restaurantLabelPinCollisionLayerId &&
    previousProps.restaurantLabelPinCollisionLayerIdSideLeft ===
      nextProps.restaurantLabelPinCollisionLayerIdSideLeft &&
    previousProps.restaurantLabelPinCollisionLayerIdSideRight ===
      nextProps.restaurantLabelPinCollisionLayerIdSideRight &&
    previousProps.restaurantLabelPinCollisionStyles === nextProps.restaurantLabelPinCollisionStyles
);

type SearchMapViewSceneProps = {
  onLayout: (event: LayoutChangeEvent) => void;
  mapHostViewRef: React.RefObject<View | null>;
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  styleURL: string;
  handleMapViewPress: (feature: GeoJSON.Feature) => void;
  handleTouchStart: () => void;
  handleTouchEnd: () => void;
  handleMapLoadedStyle: () => void;
  handleMapLoadedMap: () => void;
  handleDidFinishRenderingFrame: () => void;
  handleDidFinishRenderingFrameFully: () => void;
  handleCameraAnimationComplete?: (event: {
    nativeEvent: {
      payload?: {
        animationCompletionId?: string | null;
        status?: 'finished' | 'cancelled';
      } | null;
    };
  }) => void;
  mapCenter: [number, number] | null;
  mapZoom: number;
  mapCameraAnimation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  };
  cameraPadding: CameraPadding | null | undefined;
  isFollowingUser: boolean;
  markerSceneProps: SearchMapMarkerSceneProps | null;
  userLocationLayerProps: {
    pulsingColor: string;
    pulsingRadius: 'accuracy' | number;
    shouldAnimatePulse: boolean;
  } | null;
};

const areCoordinatesEqual = (
  left?: [number, number] | null,
  right?: [number, number] | null
): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left[0] === right[0] && left[1] === right[1];
};

const SearchMapViewScene = React.memo(
  ({
    onLayout,
    mapHostViewRef,
    mapRef,
    cameraRef,
    styleURL,
    handleMapViewPress,
    handleTouchStart,
    handleTouchEnd,
    handleMapLoadedStyle,
    handleMapLoadedMap,
    handleDidFinishRenderingFrame,
    handleDidFinishRenderingFrameFully,
    handleCameraAnimationComplete,
    mapCenter,
    mapZoom,
    mapCameraAnimation,
    cameraPadding,
    isFollowingUser,
    markerSceneProps,
    userLocationLayerProps,
  }: SearchMapViewSceneProps) => (
    <View ref={mapHostViewRef} style={styles.mapViewport} onLayout={onLayout}>
      <MapboxGL.MapView
        ref={mapRef}
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
          nativeHostKey="search_map_camera"
          centerCoordinate={mapCenter ?? USA_FALLBACK_CENTER}
          zoomLevel={mapZoom}
          padding={cameraPadding ?? ZERO_CAMERA_PADDING}
          followUserLocation={isFollowingUser}
          followZoomLevel={13}
          followPitch={0}
          followHeading={0}
          animationMode={mapCameraAnimation.mode}
          animationDuration={mapCameraAnimation.durationMs}
          animationCompletionId={mapCameraAnimation.completionId}
          onCameraAnimationComplete={handleCameraAnimationComplete}
        />
        <React.Fragment>
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
          {markerSceneProps ? <SearchMapMarkerScene {...markerSceneProps} /> : null}
          {userLocationLayerProps ? (
            <UserLocationLayers
              pulsingColor={userLocationLayerProps.pulsingColor}
              pulsingRadius={userLocationLayerProps.pulsingRadius}
              shouldAnimatePulse={userLocationLayerProps.shouldAnimatePulse}
            />
          ) : null}
        </React.Fragment>
      </MapboxGL.MapView>
    </View>
  ),
  (previousProps, nextProps) =>
    previousProps.onLayout === nextProps.onLayout &&
    previousProps.mapRef === nextProps.mapRef &&
    previousProps.cameraRef === nextProps.cameraRef &&
    previousProps.styleURL === nextProps.styleURL &&
    previousProps.handleMapViewPress === nextProps.handleMapViewPress &&
    previousProps.handleTouchStart === nextProps.handleTouchStart &&
    previousProps.handleTouchEnd === nextProps.handleTouchEnd &&
    previousProps.handleMapLoadedStyle === nextProps.handleMapLoadedStyle &&
    previousProps.handleMapLoadedMap === nextProps.handleMapLoadedMap &&
    previousProps.handleDidFinishRenderingFrame === nextProps.handleDidFinishRenderingFrame &&
    previousProps.handleDidFinishRenderingFrameFully ===
      nextProps.handleDidFinishRenderingFrameFully &&
    previousProps.handleCameraAnimationComplete === nextProps.handleCameraAnimationComplete &&
    areCoordinatesEqual(previousProps.mapCenter, nextProps.mapCenter) &&
    previousProps.mapZoom === nextProps.mapZoom &&
    previousProps.mapCameraAnimation.mode === nextProps.mapCameraAnimation.mode &&
    previousProps.mapCameraAnimation.durationMs === nextProps.mapCameraAnimation.durationMs &&
    previousProps.mapCameraAnimation.completionId === nextProps.mapCameraAnimation.completionId &&
    areCameraPaddingEqual(previousProps.cameraPadding, nextProps.cameraPadding) &&
    previousProps.isFollowingUser === nextProps.isFollowingUser &&
    previousProps.markerSceneProps === nextProps.markerSceneProps &&
    previousProps.userLocationLayerProps === nextProps.userLocationLayerProps
);

export type RestaurantFeatureProperties = {
  restaurantId: string;
  restaurantName: string;
  craveScore: number;
  scoreDelta7d?: number | null;
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
  restaurantCraveScore?: number | null;
  pinColor: string;
  labelCandidate?: LabelCandidate;
  labelPreference?: LabelCandidate;
  // Dish-specific fields (populated when rendering dish pins)
  isDishPin?: boolean;
  dishName?: string;
  connectionId?: string;
  topDishCraveScore?: number | null;
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
const DOT_INTERACTION_FILTER = ['has', 'restaurantId'] as const;
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

const UserLocationLayers = React.memo(
  function UserLocationLayers({
    pulsingColor,
    pulsingRadius,
    shouldAnimatePulse,
  }: {
    pulsingColor: string;
    pulsingRadius: 'accuracy' | number;
    shouldAnimatePulse: boolean;
  }) {
    return (
      <MapboxGL.LocationPuck
        visible
        pulsing={{
          isEnabled: shouldAnimatePulse,
          color: pulsingColor,
          radius: pulsingRadius,
        }}
      />
    );
  },
  (prev, next) =>
    prev.pulsingColor === next.pulsingColor &&
    prev.pulsingRadius === next.pulsingRadius &&
    prev.shouldAnimatePulse === next.shouldAnimatePulse
);
const DOT_TEXT_SIZE = 17;
// Keep in sync with SearchScreen's MAX_FULL_PINS. These slots guarantee deterministic pin stacking
// even as the pinned set changes during live LOD updates.
const STYLE_PIN_STACK_SLOTS = 30;
const PIN_INTERACTION_LAYER_ID = 'restaurant-pin-interaction-layer';
const PIN_INTERACTION_LAYER_IDS = [PIN_INTERACTION_LAYER_ID];
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
export const RESTAURANT_LABEL_SOURCE_ID = 'restaurant-source';
const RESTAURANT_LABEL_COLLISION_SOURCE_ID = 'restaurant-label-collision-source';
export type LabelCandidate = 'bottom' | 'right' | 'top' | 'left';
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

const buildLabelLayerSpecs = ({
  preferredCandidates,
}: {
  preferredCandidates: ReadonlyArray<LabelCandidate>;
}): ReadonlyArray<LabelLayerSpec> =>
  preferredCandidates.flatMap((preferredCandidate) =>
    [...LABEL_CANDIDATE_PRIORITY_BY_PREFERENCE[preferredCandidate]].reverse().map((candidate) => ({
      preferredCandidate,
      candidate,
      layerId: `restaurant-labels-preferred-${preferredCandidate}-candidate-${candidate}`,
      interactionLayerId: `restaurant-labels-interaction-preferred-${preferredCandidate}-candidate-${candidate}`,
    }))
  );

const LABEL_LAYER_SPECS: ReadonlyArray<LabelLayerSpec> = buildLabelLayerSpecs({
  preferredCandidates: LABEL_CANDIDATES_IN_ORDER,
});

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

const LABEL_MUTEX_ICON_RENDER_SIZE_PX = 0.8;
const LABEL_MUTEX_ICON_SIZE = LABEL_MUTEX_ICON_RENDER_SIZE_PX;
const LABEL_MUTEX_TRANSLATE_Y_PX = -(PIN_MARKER_RENDER_SIZE + 12);
const INTERACTION_LAYER_HIDDEN_OPACITY = 0.001;
const SHOW_INTERACTION_LAYER_DEBUG_COLORS = true;
// Feature coordinates are anchored at the pin tip, while the visible pin glyph is translated
// downward. Keep the interaction mirror centered on the historical rendered pin-body center.
const PIN_INTERACTION_CENTER_SHIFT_Y_PX = PIN_MARKER_RENDER_SIZE * 0.38 + 4.25;
const PIN_TAP_INTENT_RADIUS_PX = PIN_MARKER_RENDER_SIZE / 2;
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
  circleColor: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? '#ff6a3d' : '#000000',
  circleOpacity: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? 0.34 : INTERACTION_LAYER_HIDDEN_OPACITY,
  circleStrokeColor: '#000000',
  circleStrokeWidth: 0,
  circleStrokeOpacity: 0,
  circleSortKey: ['coalesce', ['get', 'nativeLodZ'], -1],
  circleTranslate: [0, -PIN_INTERACTION_CENTER_SHIFT_Y_PX],
  circleTranslateAnchor: 'viewport',
} as MapboxGL.CircleLayerStyle;
const DOT_INTERACTION_LAYER_STYLE: MapboxGL.CircleLayerStyle = {
  circleRadius: DOT_TAP_INTENT_RADIUS_PX,
  circleColor: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? '#24d4ff' : '#000000',
  circleOpacity: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? 0.22 : INTERACTION_LAYER_HIDDEN_OPACITY,
  circleStrokeColor: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? '#b8f3ff' : '#000000',
  circleStrokeWidth: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? 1 : 0,
  circleStrokeOpacity: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? 0.7 : 0,
} as MapboxGL.CircleLayerStyle;

export const buildLabelCandidateFeatureId = (markerKey: string, candidate: LabelCandidate) =>
  `${markerKey}::label::${candidate}`;

const getLabelCandidateFromFeatureId = (featureId: string): LabelCandidate | null => {
  for (const candidate of LABEL_CANDIDATES_IN_ORDER) {
    if (featureId.endsWith(`::label::${candidate}`)) {
      return candidate;
    }
  }
  return null;
};

type SearchMapPressEvent = {
  type?: GeoJSON.Feature['type'];
  geometry?: GeoJSON.Feature['geometry'] | null;
  properties?: GeoJSON.Feature['properties'] | null;
  features?: GeoJSON.Feature[] | null;
  coordinates?:
    | { latitude?: unknown; longitude?: unknown }
    | { lat?: unknown; lng?: unknown }
    | [unknown, unknown]
    | null;
  point?: { x?: unknown; y?: unknown } | null;
};

const getPointFromMapPressFeature = (
  feature: SearchMapPressEvent
): { x: number; y: number } | null => {
  const topLevelPoint = feature.point;
  if (topLevelPoint && typeof topLevelPoint === 'object') {
    const x = topLevelPoint.x;
    const y = topLevelPoint.y;
    if (
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y)
    ) {
      return { x, y };
    }
  }

  const properties = feature.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return null;
  }
  const x =
    typeof properties.screenPointX === 'number' && Number.isFinite(properties.screenPointX)
      ? properties.screenPointX
      : null;
  const y =
    typeof properties.screenPointY === 'number' && Number.isFinite(properties.screenPointY)
      ? properties.screenPointY
      : null;
  if (x == null || y == null) {
    return null;
  }
  return { x, y };
};

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

type MapPresentedMarkerScene = {
  shouldProjectSearchMarkerFamilies: boolean;
  presentedPinSourceStore: SearchMapSourceStore;
  presentedPinInteractionSourceStore: SearchMapSourceStore;
  presentedDotSourceStore: SearchMapSourceStore;
  presentedDotInteractionSourceStore: SearchMapSourceStore;
};

type MapPresentedLabelScene = {
  mountedSourceCounts: {
    pinCount: number;
    dotCount: number;
    labelCount: number;
  };
};

type SearchMapRenderedPressTarget = {
  restaurantId: string;
  coordinate: Coordinate | null;
  targetKind: 'pin' | 'label' | 'dot';
};

const getCoordinateFromFeature = (feature: GeoJSON.Feature): Coordinate | null => {
  const geometry = feature.geometry;
  if (geometry?.type !== 'Point') {
    return null;
  }
  const coordinates = geometry.coordinates;
  if (!isLngLatTuple(coordinates)) {
    return null;
  }
  return { lng: coordinates[0], lat: coordinates[1] };
};

const getCoordinateFromMapPressEvent = (event: SearchMapPressEvent): Coordinate | null => {
  if (event.geometry?.type === 'Point' && isLngLatTuple(event.geometry.coordinates)) {
    return { lng: event.geometry.coordinates[0], lat: event.geometry.coordinates[1] };
  }
  const coordinates = event.coordinates;
  if (isLngLatTuple(coordinates)) {
    return { lng: coordinates[0], lat: coordinates[1] };
  }
  if (coordinates && typeof coordinates === 'object' && !Array.isArray(coordinates)) {
    const record = coordinates as Record<string, unknown>;
    const lng = record.longitude ?? record.lng;
    const lat = record.latitude ?? record.lat;
    if (
      typeof lng === 'number' &&
      Number.isFinite(lng) &&
      typeof lat === 'number' &&
      Number.isFinite(lat)
    ) {
      return { lng, lat };
    }
  }
  return null;
};

const commitSearchMapRestaurantPressTarget = ({
  pressTarget,
  pressCoordinate,
  onMarkerPress,
}: {
  pressTarget: SearchMapRenderedPressTarget;
  pressCoordinate: Coordinate | null;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
}): void => {
  if (!onMarkerPress) {
    return;
  }
  onMarkerPress(pressTarget.restaurantId, pressTarget.coordinate ?? pressCoordinate);
};

type SearchMapInteractionRuntime = {
  dotInteractionFilter: readonly unknown[];
  handleMapPress: (feature: SearchMapPressEvent) => void;
};

const resolveMapPresentedMarkerScene = ({
  pinSourceStore,
  pinInteractionSourceStore,
  dotSourceStore,
  dotInteractionSourceStore,
}: {
  pinSourceStore: SearchMapSourceStore;
  pinInteractionSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore | null | undefined;
  dotInteractionSourceStore: SearchMapSourceStore;
}): MapPresentedMarkerScene => ({
  shouldProjectSearchMarkerFamilies: true,
  presentedPinSourceStore: pinSourceStore,
  presentedPinInteractionSourceStore: pinInteractionSourceStore,
  presentedDotSourceStore: dotSourceStore ?? EMPTY_SEARCH_MAP_SOURCE_STORE,
  presentedDotInteractionSourceStore: dotInteractionSourceStore,
});

const resolveMapLabelObservationPolicy = ({
  isPresentationLive,
}: {
  isPresentationLive: boolean;
}): {
  allowLiveLabelUpdates: boolean;
  publishVisibleLabelFeatureIds: boolean;
} => ({
  allowLiveLabelUpdates: isPresentationLive,
  publishVisibleLabelFeatureIds: isPresentationLive,
});

const resolveMapPresentedLabelScene = ({
  shouldMountSearchMarkerLayers,
  shouldProjectSearchMarkerFamilies: _shouldProjectSearchMarkerFamilies,
  presentedPinSourceStore,
  presentedDotSourceStore,
  labelSourceStore,
  labelCollisionSourceStore: _labelCollisionSourceStore,
}: {
  shouldMountSearchMarkerLayers: boolean;
  shouldProjectSearchMarkerFamilies: boolean;
  presentedPinSourceStore: SearchMapSourceStore;
  presentedDotSourceStore: SearchMapSourceStore;
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
}): MapPresentedLabelScene => {
  return {
    mountedSourceCounts: {
      pinCount: shouldMountSearchMarkerLayers ? presentedPinSourceStore.idsInOrder.length : 0,
      dotCount: shouldMountSearchMarkerLayers ? presentedDotSourceStore.idsInOrder.length : 0,
      labelCount: shouldMountSearchMarkerLayers ? labelSourceStore.idsInOrder.length : 0,
    },
  };
};

const collectPresentedMarkerKeysForRestaurantId = ({
  sourceStore,
  restaurantId,
  buildMarkerKey,
}: {
  sourceStore: SearchMapPresentationScene['pinSourceStore'];
  restaurantId: string;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
}): string[] => {
  const markerKeys: string[] = [];
  const seenMarkerKeys = new Set<string>();
  for (const featureId of sourceStore.idsInOrder) {
    const feature = sourceStore.featureById.get(featureId);
    if (feature?.properties.restaurantId === restaurantId) {
      const markerKey =
        typeof feature.id === 'string' && feature.id.length > 0
          ? feature.id
          : buildMarkerKey(feature);
      if (!seenMarkerKeys.has(markerKey)) {
        seenMarkerKeys.add(markerKey);
        markerKeys.push(markerKey);
      }
    }
  }

  return markerKeys;
};

const useSearchMapInteractionRuntime = ({
  nativeRenderOwnerInstanceId,
  onMarkerPress,
  onBlankMapPress,
  dotLayerId,
  pinInteractionLayerIds,
  labelInteractionLayerIds,
  labelTapHitbox,
  dotTapIntentRadiusPx,
}: {
  nativeRenderOwnerInstanceId: string;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onBlankMapPress: () => void;
  dotLayerId: string;
  pinInteractionLayerIds: string[];
  labelInteractionLayerIds: string[];
  labelTapHitbox: {
    textSize: number;
    radialXEm: number;
    radialYEm: number;
    radialTopEm: number;
    upShiftEm: number;
    charWidthFactor: number;
    lineHeightFactor: number;
    paddingPx: number;
    minWidthPx: number;
    maxWidthPx: number;
  };
  dotTapIntentRadiusPx: number;
}): SearchMapInteractionRuntime => {
  const resolveNativePressTarget = React.useCallback(
    async ({
      point,
      dotQueryBox,
      tapCoordinate,
    }: {
      point: { x: number; y: number };
      dotQueryBox?: [number, number, number, number] | null;
      tapCoordinate?: Coordinate | null;
    }): Promise<SearchMapRenderedPressTarget | null> =>
      searchMapRenderController.queryRenderedPressTarget({
        instanceId: nativeRenderOwnerInstanceId,
        point,
        pinLayerIds: pinInteractionLayerIds,
        labelLayerIds: labelInteractionLayerIds,
        labelTapHitbox,
        ...(dotQueryBox ? { dotLayerIds: [dotLayerId], dotQueryBox } : {}),
        ...(tapCoordinate ? { tapCoordinate } : {}),
      }),
    [
      dotLayerId,
      labelInteractionLayerIds,
      labelTapHitbox,
      nativeRenderOwnerInstanceId,
      pinInteractionLayerIds,
    ]
  );

  const pinPressResolutionSeqRef = React.useRef(0);
  const onMarkerPressRef = React.useRef(onMarkerPress);
  const onBlankMapPressRef = React.useRef(onBlankMapPress);
  const resolveNativePressTargetRef = React.useRef(resolveNativePressTarget);

  React.useEffect(() => {
    onMarkerPressRef.current = onMarkerPress;
  }, [onMarkerPress]);

  React.useEffect(() => {
    onBlankMapPressRef.current = onBlankMapPress;
  }, [onBlankMapPress]);

  React.useEffect(() => {
    resolveNativePressTargetRef.current = resolveNativePressTarget;
  }, [resolveNativePressTarget]);

  const commitRestaurantPressTarget = React.useCallback(
    (pressTarget: SearchMapRenderedPressTarget, pressCoordinate: Coordinate | null) => {
      commitSearchMapRestaurantPressTarget({
        pressTarget,
        pressCoordinate,
        onMarkerPress: onMarkerPressRef.current,
      });
    },
    []
  );

  const handleMapPress = React.useCallback(
    (feature: SearchMapPressEvent) => {
      const point = getPointFromMapPressFeature(feature);
      const tapCoordinate = getCoordinateFromMapPressEvent(feature);
      if (!point) {
        onBlankMapPressRef.current();
        return;
      }
      const queryBox = [
        point.x - dotTapIntentRadiusPx,
        point.y - dotTapIntentRadiusPx,
        point.x + dotTapIntentRadiusPx,
        point.y + dotTapIntentRadiusPx,
      ] as [number, number, number, number];
      const pressSeq = ++pinPressResolutionSeqRef.current;
      if (shouldLogSearchNavSwitchDiagnosticLogs()) {
        logger.debug('[PRESS-TARGET-DIAG] map_press_query_start', {
          pressSeq,
          point,
          tapCoordinate,
          dotQueryBox: queryBox,
          pinInteractionLayerIds,
          labelInteractionLayerIds,
          labelTapHitbox,
        });
      }
      void resolveNativePressTargetRef
        .current({
          point,
          dotQueryBox: queryBox,
          tapCoordinate,
        })
        .then((pressTarget) => {
          if (pressSeq !== pinPressResolutionSeqRef.current) {
            if (shouldLogSearchNavSwitchDiagnosticLogs()) {
              logger.debug('[PRESS-TARGET-DIAG] map_press_query_stale', {
                pressSeq,
                activePressSeq: pinPressResolutionSeqRef.current,
                point,
                targetKind: pressTarget?.targetKind ?? null,
                restaurantId: pressTarget?.restaurantId ?? null,
              });
            }
            return;
          }
          if (shouldLogSearchNavSwitchDiagnosticLogs()) {
            logger.debug('[PRESS-TARGET-DIAG] map_press_query_result', {
              pressSeq,
              point,
              tapCoordinate,
              targetKind: pressTarget?.targetKind ?? null,
              restaurantId: pressTarget?.restaurantId ?? null,
              targetCoordinate: pressTarget?.coordinate ?? null,
            });
          }
          if (!pressTarget) {
            onBlankMapPressRef.current();
            return;
          }
          commitRestaurantPressTarget(pressTarget, tapCoordinate);
        })
        .catch((error: unknown) => {
          if (shouldLogSearchNavSwitchDiagnosticLogs()) {
            logger.warn('[PRESS-TARGET-DIAG] map_press_query_error', {
              pressSeq,
              point,
              tapCoordinate,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          // Native exact hit testing is authoritative for map press resolution.
        });
    },
    [
      dotTapIntentRadiusPx,
      commitRestaurantPressTarget,
      labelInteractionLayerIds,
      labelTapHitbox,
      pinInteractionLayerIds,
    ]
  );

  return {
    dotInteractionFilter: DOT_INTERACTION_FILTER,
    handleMapPress,
  };
};

type SearchMapProps = {
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  styleURL: string;
  mapCenter: [number, number] | null;
  mapZoom: number;
  mapCameraAnimation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  };
  cameraPadding?: CameraPadding | null;
  isFollowingUser: boolean;
  onPress: () => void;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  onNativeViewportChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  onMapFullyRendered?: () => void;
  onCameraAnimationComplete?: (event: {
    nativeEvent: {
      payload?: {
        animationCompletionId?: string | null;
        status?: 'finished' | 'cancelled';
      } | null;
    };
  }) => void;
  presentationLifecyclePort?: SearchMapPresentationLifecyclePort;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onNativeMountedSourceCountsChanged?: (counts: {
    pinCount: number;
    dotCount: number;
    labelCount: number;
  }) => void;
  sourceFramePort?: SearchMapSourceFramePort | null;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  fallbackMapSceneSnapshot: SearchMapPresentationScene;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  restaurantLabelStyle: MapboxGL.SymbolLayerStyle;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  userLocationSnapshot: StartupLocationSnapshot | null;
  disableMarkers?: boolean;
  disableBlur?: boolean;
  onProfilerRender?: React.ProfilerOnRenderCallback | null;
  mapQueryBudget?: MapQueryBudget | null;
  nativeViewportState: {
    bounds: MapBounds | null;
    isGestureActive: boolean;
    isMoving: boolean;
  };
  nativeInteractionMode: SearchMapRenderInteractionMode;
  mapMotionPressureController: MapMotionPressureController;
  maxFullPins: number;
  lodVisibleCandidateBuffer: number;
  lodPinPromoteStableMsMoving: number;
  lodPinDemoteStableMsMoving: number;
  lodPinToggleStableMsIdle: number;
  lodPinOffscreenToggleStableMsMoving: number;
};

const SearchMap: React.FC<SearchMapProps> = ({
  mapRef,
  cameraRef,
  styleURL,
  mapCenter,
  mapZoom,
  mapCameraAnimation,
  cameraPadding,
  isFollowingUser,
  onPress,
  onTouchStart,
  onTouchEnd,
  onNativeViewportChanged,
  onMapIdle,
  onMapLoaded,
  onMapFullyRendered,
  onCameraAnimationComplete,
  presentationLifecyclePort,
  onMarkerPress,
  onNativeMountedSourceCountsChanged,
  sourceFramePort = null,
  resultsPresentationAuthority,
  fallbackMapSceneSnapshot,
  buildMarkerKey,
  restaurantLabelStyle,
  isMapStyleReady: _hostMapStyleReady,
  userLocation,
  userLocationSnapshot,
  disableMarkers = false,
  onProfilerRender,
  mapQueryBudget = null,
  nativeViewportState,
  nativeInteractionMode,
  mapMotionPressureController,
  maxFullPins: _maxFullPins,
  lodVisibleCandidateBuffer: _lodVisibleCandidateBuffer,
  lodPinPromoteStableMsMoving: _lodPinPromoteStableMsMoving,
  lodPinDemoteStableMsMoving: _lodPinDemoteStableMsMoving,
  lodPinToggleStableMsIdle: _lodPinToggleStableMsIdle,
  lodPinOffscreenToggleStableMsMoving: _lodPinOffscreenToggleStableMsMoving,
}) => {
  const mapHostViewRef = React.useRef<View | null>(null);
  const searchMapComponentInstanceIdRef = React.useRef<string | null>(null);
  if (searchMapComponentInstanceIdRef.current == null) {
    searchMapComponentInstanceIdRef.current = nextSearchMapComponentInstanceId();
  }
  const searchMapComponentInstanceId = searchMapComponentInstanceIdRef.current;
  React.useEffect(() => {
    if (shouldLogSearchNavSwitchDiagnosticLogs()) {
      logger.debug('[MAP-MOUNT-DIAG] SearchMap:mount', {
        searchMapComponentInstanceId,
        styleURL,
      });
    }
    return () => {
      if (shouldLogSearchNavSwitchDiagnosticLogs()) {
        logger.debug('[MAP-MOUNT-DIAG] SearchMap:unmount', {
          searchMapComponentInstanceId,
        });
      }
    };
  }, [searchMapComponentInstanceId, styleURL]);
  const shouldDisableMarkers = disableMarkers === true;
  const presentationAuthoritySnapshot = resultsPresentationAuthority.getSnapshot();
  const presentationTelemetryPhase =
    presentationAuthoritySnapshot.resultsPresentationTransport.executionStage;
  const visualReadyRequestKey =
    presentationAuthoritySnapshot.resultsPresentationTransport.transactionId;
  const {
    selectedRestaurantId,
    pinSourceStore,
    dotSourceStore,
    pinInteractionSourceStore,
    dotInteractionSourceStore,
    labelSourceStore,
    labelCollisionSourceStore,
  } = fallbackMapSceneSnapshot;
  const directSourceFrameStores = useSearchMapSourceFrameSelector(
    sourceFramePort,
    (snapshot): DirectSourceFrameStores => ({
      pinSourceStore: snapshot.pinSourceStore,
      dotSourceStore: snapshot.dotSourceStore,
      pinInteractionSourceStore: snapshot.pinInteractionSourceStore,
      dotInteractionSourceStore: snapshot.dotInteractionSourceStore,
      labelSourceStore: snapshot.labelSourceStore,
      labelCollisionSourceStore: snapshot.labelCollisionSourceStore,
    }),
    areDirectSourceFrameStoresEqual,
    DIRECT_SOURCE_FRAME_STORE_KEYS,
    'search_map_render_source_frame_stores'
  );
  const sourceFrameIsAuthoritative = sourceFramePort != null;
  const activePinSourceStore = sourceFrameIsAuthoritative
    ? directSourceFrameStores.pinSourceStore
    : pinSourceStore;
  const activeDotSourceStore = sourceFrameIsAuthoritative
    ? directSourceFrameStores.dotSourceStore
    : dotSourceStore;
  const activePinInteractionSourceStore = sourceFrameIsAuthoritative
    ? directSourceFrameStores.pinInteractionSourceStore
    : pinInteractionSourceStore;
  const activeDotInteractionSourceStore = sourceFrameIsAuthoritative
    ? directSourceFrameStores.dotInteractionSourceStore
    : dotInteractionSourceStore;
  const activeLabelSourceStore = sourceFrameIsAuthoritative
    ? directSourceFrameStores.labelSourceStore
    : labelSourceStore;
  const activeLabelCollisionSourceStore = sourceFrameIsAuthoritative
    ? directSourceFrameStores.labelCollisionSourceStore
    : labelCollisionSourceStore;
  const {
    shouldProjectSearchMarkerFamilies,
    presentedPinSourceStore,
    presentedPinInteractionSourceStore,
    presentedDotSourceStore,
    presentedDotInteractionSourceStore,
  } = resolveMapPresentedMarkerScene({
    pinSourceStore: activePinSourceStore,
    pinInteractionSourceStore: activePinInteractionSourceStore,
    dotSourceStore: activeDotSourceStore,
    dotInteractionSourceStore: activeDotInteractionSourceStore,
  });
  const [isLocalMapStyleReady, setIsLocalMapStyleReady] = React.useState(false);
  const [isStyleManagedContentReady, setIsStyleManagedContentReady] = React.useState(false);
  const hasReportedMapLoadedFromRenderFrameRef = React.useRef(false);
  const isLocalMapStyleReadyRef = React.useRef(false);
  const isStyleManagedContentReadyRef = React.useRef(false);
  const onMapFullyRenderedRef = React.useRef(onMapFullyRendered);
  React.useEffect(() => {
    hasReportedMapLoadedFromRenderFrameRef.current = false;
    isLocalMapStyleReadyRef.current = false;
    isStyleManagedContentReadyRef.current = false;
    setIsLocalMapStyleReady(false);
    setIsStyleManagedContentReady(false);
  }, [styleURL]);
  React.useEffect(() => {
    isLocalMapStyleReadyRef.current = isLocalMapStyleReady;
    isStyleManagedContentReadyRef.current = isStyleManagedContentReady;
  }, [isLocalMapStyleReady, isStyleManagedContentReady]);
  React.useEffect(() => {
    onMapFullyRenderedRef.current = onMapFullyRendered;
  }, [onMapFullyRendered]);
  const effectiveMapStyleReady = isLocalMapStyleReady && isStyleManagedContentReady;
  const mapStyleGateDiagnosticRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!shouldLogSearchNavSwitchDiagnosticLogs()) {
      mapStyleGateDiagnosticRef.current = null;
      return;
    }

    const nextDiagnostic = JSON.stringify({
      isMapStyleReady: isLocalMapStyleReady,
      isStyleManagedContentReady,
      effectiveMapStyleReady,
    });
    if (mapStyleGateDiagnosticRef.current === nextDiagnostic) {
      return;
    }
    logger.debug('[MAP-STYLE-GATE-DIAG] styleManagedContent', {
      isMapStyleReady: isLocalMapStyleReady,
      isStyleManagedContentReady,
      effectiveMapStyleReady,
    });
    mapStyleGateDiagnosticRef.current = nextDiagnostic;
  }, [effectiveMapStyleReady, isLocalMapStyleReady, isStyleManagedContentReady]);
  const shouldMountSearchMarkerLayers = !shouldDisableMarkers;
  const directPinSourceCount = directSourceFrameStores.pinSourceStore.idsInOrder.length;
  const directDotSourceCount = directSourceFrameStores.dotSourceStore.idsInOrder.length;
  const directLabelSourceCount = directSourceFrameStores.labelSourceStore.idsInOrder.length;
  const shouldPrepareLabelLayers =
    shouldProjectSearchMarkerFamilies &&
    (presentedPinSourceStore.idsInOrder.length > 0 || directPinSourceCount > 0) &&
    (activeLabelSourceStore.idsInOrder.length > 0 || directLabelSourceCount > 0);
  const shouldRenderLabels = shouldPrepareLabelLayers;
  const isResultsExitActive =
    presentationAuthoritySnapshot.resultsPresentationTransport.snapshotKind === 'results_exit';
  const { allowLiveLabelUpdates, publishVisibleLabelFeatureIds } = resolveMapLabelObservationPolicy(
    {
      isPresentationLive:
        presentationAuthoritySnapshot.resultsPresentation.contentVisibility === 'visible' &&
        !isResultsExitActive,
    }
  );
  const labelObservationConfig = React.useMemo(
    () => ({
      enableStickyLabelCandidates: ENABLE_STICKY_LABEL_CANDIDATES,
      refreshMsIdle: LABEL_STICKY_REFRESH_MS_IDLE,
      refreshMsMoving: LABEL_STICKY_REFRESH_MS_MOVING,
      stickyLockStableMsMoving: LABEL_STICKY_LOCK_STABLE_MS_MOVING,
      stickyLockStableMsIdle: LABEL_STICKY_LOCK_STABLE_MS_IDLE,
      stickyUnlockMissingMsMoving: LABEL_STICKY_UNLOCK_MISSING_MS_MOVING,
      stickyUnlockMissingMsIdle: LABEL_STICKY_UNLOCK_MISSING_MS_IDLE,
      stickyUnlockMissingStreakMoving: LABEL_STICKY_UNLOCK_MISSING_STREAK_MOVING,
      labelResetRequestKey: visualReadyRequestKey,
    }),
    [visualReadyRequestKey]
  );
  const nativeManagedLabelObservation =
    searchMapRenderController.platform === 'ios' ||
    searchMapRenderController.platform === 'android';
  const requestedNativeLabelObservationEnabled =
    nativeManagedLabelObservation && !shouldDisableMarkers;
  React.useEffect(() => {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'map_pin_label_observation_config_contract',
      allowLiveLabelUpdates,
      directLabelSourceCount,
      directPinSourceCount,
      directDotSourceCount,
      isResultsExitActive,
      isNativeManaged: nativeManagedLabelObservation,
      labelSourceCount: activeLabelSourceStore.idsInOrder.length,
      pinSourceCount: presentedPinSourceStore.idsInOrder.length,
      presentationTelemetryPhase,
      publishVisibleLabelFeatureIds,
      requestedNativeLabelObservationEnabled,
      shouldDisableMarkers,
      shouldRenderLabels,
    });
  }, [
    allowLiveLabelUpdates,
    directDotSourceCount,
    directLabelSourceCount,
    directPinSourceCount,
    isResultsExitActive,
    activeLabelSourceStore.idsInOrder.length,
    nativeManagedLabelObservation,
    presentedPinSourceStore.idsInOrder.length,
    presentationTelemetryPhase,
    publishVisibleLabelFeatureIds,
    requestedNativeLabelObservationEnabled,
    shouldDisableMarkers,
    shouldRenderLabels,
  ]);
  const userLocationPuckProps = React.useMemo<{
    pulsingColor: string;
    pulsingRadius: 'accuracy' | number;
    shouldAnimatePulse: boolean;
  } | null>(() => {
    if (!userLocation) {
      return null;
    }
    const snapshot = userLocationSnapshot;
    const isStale = snapshot?.isStale ?? true;
    const reducedAccuracy = snapshot?.reducedAccuracy ?? false;
    const accuracyMeters =
      typeof snapshot?.accuracyMeters === 'number' && Number.isFinite(snapshot.accuracyMeters)
        ? snapshot.accuracyMeters
        : null;
    return {
      pulsingColor: themeColors.secondaryAccent,
      pulsingRadius:
        reducedAccuracy || accuracyMeters == null
          ? 'accuracy'
          : resolveDisplayedUncertaintyRadiusMeters({
              accuracyMeters,
              reducedAccuracy,
              isStale,
            }),
      shouldAnimatePulse: !isStale,
    };
  }, [userLocation, userLocationSnapshot]);

  const recordRuntimeAttribution = React.useCallback(
    (contributor: string, durationMs: number) => {
      mapQueryBudget?.recordRuntimeAttributionDurationMs(contributor, durationMs);
    },
    [mapQueryBudget]
  );
  const recordTimedRuntimeAttribution = React.useCallback(
    <TReturn,>(contributor: string, work: () => TReturn): TReturn => {
      const startedAtMs = getNowMs();
      try {
        return work();
      } finally {
        recordRuntimeAttribution(contributor, getNowMs() - startedAtMs);
      }
    },
    [getNowMs, recordRuntimeAttribution]
  );
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
  const [resolvedMapTag, setResolvedMapTag] = React.useState<number | null>(null);
  const resolveCurrentNativeMapTag = React.useCallback(() => {
    const nativeRefSnapshot =
      Platform.OS === 'ios'
        ? mapHostViewRef.current
        : (mapRef.current as { _nativeRef?: unknown } | null)?._nativeRef ?? mapRef.current;
    if (nativeRefSnapshot == null) {
      return null;
    }
    const tag = findNodeHandle(nativeRefSnapshot as never);
    return typeof tag === 'number' && tag > 0 ? tag : null;
  }, [mapRef]);
  const publishResolvedMapTag = React.useCallback(() => {
    const nextTag = resolveCurrentNativeMapTag();
    setResolvedMapTag((previous) => (previous === nextTag ? previous : nextTag));
  }, [resolveCurrentNativeMapTag]);
  const nativeDesiredPinFeatures = presentedPinSourceStore;
  const nativeDesiredPinInteractionFeatures = presentedPinInteractionSourceStore;
  const nativeDesiredDotFeatures = presentedDotSourceStore;
  const nativeDesiredDotInteractionFeatures = presentedDotInteractionSourceStore;
  const nativeDesiredLabelInteractionFeatures = EMPTY_SEARCH_MAP_SOURCE_STORE;
  const authoritativeSelectedRestaurantId = selectedRestaurantId;
  const effectiveSelectedRestaurantId = authoritativeSelectedRestaurantId;
  const highlightedMarkerKeys = React.useMemo(() => {
    if (!effectiveSelectedRestaurantId) {
      return [];
    }
    const orderedMarkerKeys = [
      ...collectPresentedMarkerKeysForRestaurantId({
        sourceStore: directSourceFrameStores.pinSourceStore,
        restaurantId: effectiveSelectedRestaurantId,
        buildMarkerKey,
      }),
      ...collectPresentedMarkerKeysForRestaurantId({
        sourceStore: directSourceFrameStores.dotSourceStore,
        restaurantId: effectiveSelectedRestaurantId,
        buildMarkerKey,
      }),
      ...collectPresentedMarkerKeysForRestaurantId({
        sourceStore: presentedPinSourceStore,
        restaurantId: effectiveSelectedRestaurantId,
        buildMarkerKey,
      }),
      ...collectPresentedMarkerKeysForRestaurantId({
        sourceStore: presentedDotSourceStore,
        restaurantId: effectiveSelectedRestaurantId,
        buildMarkerKey,
      }),
    ];
    const seenMarkerKeys = new Set<string>();
    const markerKeys: string[] = [];
    for (const markerKey of orderedMarkerKeys) {
      if (seenMarkerKeys.has(markerKey)) {
        continue;
      }
      seenMarkerKeys.add(markerKey);
      markerKeys.push(markerKey);
    }
    return markerKeys;
  }, [
    buildMarkerKey,
    directSourceFrameStores,
    effectiveSelectedRestaurantId,
    presentedDotSourceStore,
    presentedPinSourceStore,
  ]);
  const highlightedMarkerKey = highlightedMarkerKeys[0] ?? null;
  const {
    instanceId: resolvedNativeRenderOwnerInstanceId,
    isNativeAvailable: resolvedIsNativeRenderOwnerAvailable,
    attachState: resolvedNativeRenderOwnerAttachState,
    isNativeOwnerReady: resolvedIsNativeRenderOwnerReady,
    nativeFatalErrorMessage: resolvedNativeFatalErrorMessage,
  } = useSearchMapNativeRenderOwner({
    mapComponentInstanceId: searchMapComponentInstanceId,
    resolvedMapTag,
    isMapStyleReady: isLocalMapStyleReady,
    isRenderFrameSyncReady: isLocalMapStyleReady,
    mapMotionPressureController,
    resultsPresentationAuthority,
    selectedRestaurantId: effectiveSelectedRestaurantId ?? null,
    pinSourceId: STYLE_PINS_SOURCE_ID,
    pinInteractionSourceId: PIN_INTERACTION_SOURCE_ID,
    dotSourceId: DOT_SOURCE_ID,
    dotInteractionSourceId: DOT_INTERACTION_SOURCE_ID,
    labelSourceId: RESTAURANT_LABEL_SOURCE_ID,
    labelInteractionSourceId: LABEL_INTERACTION_SOURCE_ID,
    labelCollisionSourceId: RESTAURANT_LABEL_COLLISION_SOURCE_ID,
    labelObservationEnabled: requestedNativeLabelObservationEnabled,
    labelObservationConfig,
    commitVisibleLabelInteractionVisibility: allowLiveLabelUpdates,
    pins: nativeDesiredPinFeatures,
    pinInteractions: nativeDesiredPinInteractionFeatures,
    dots: nativeDesiredDotFeatures,
    dotInteractions: nativeDesiredDotInteractionFeatures,
    labels: activeLabelSourceStore,
    labelInteractions: nativeDesiredLabelInteractionFeatures,
    labelCollisions: activeLabelCollisionSourceStore,
    sourceFramePort,
    viewportState: {
      bounds: nativeViewportState.bounds,
      isGestureActive: nativeViewportState.isGestureActive,
      isMoving: nativeViewportState.isMoving,
    },
    highlightedMarkerKey,
    highlightedMarkerKeys,
    interactionMode: nativeInteractionMode,
    onExecutionBatchMountedHidden: presentationLifecyclePort?.handleExecutionBatchMountedHidden,
    onMarkerEnterStarted: presentationLifecyclePort?.handleMarkerEnterStarted,
    onMarkerEnterSettled: (payload) => {
      presentationLifecyclePort?.handleMarkerEnterSettled({
        requestKey: payload.requestKey,
        frameGenerationId: payload.frameGenerationId,
        executionBatchId: payload.executionBatchId,
        markerEnterCommitId: null,
        pinCount: payload.pinCount,
        dotCount: payload.dotCount,
        labelCount: payload.labelCount,
        settledAtMs: payload.settledAtMs,
      });
    },
    onMarkerExitStarted: presentationLifecyclePort?.handleMarkerExitStarted,
    onMarkerExitSettled: presentationLifecyclePort?.handleMarkerExitSettled,
    onViewportChanged: handleNativeViewportChangedFromOwner,
    onLabelObservationUpdated: ({
      visibleLabelFeatureIds,
      layerRenderedFeatureCount,
      effectiveRenderedFeatureCount,
    }) => {
      const nextVisibleLabelFeatureIds = [...visibleLabelFeatureIds].sort();
      const previousVisibleLabelFeatureIds = visibleLabelFeatureIdListRef.current;
      const shouldLogFirstContract = !didLogLabelVisibilityContractRef.current;
      if (
        !shouldLogFirstContract &&
        areStringArraysEqual(previousVisibleLabelFeatureIds, nextVisibleLabelFeatureIds)
      ) {
        return;
      }
      visibleLabelFeatureIdListRef.current = nextVisibleLabelFeatureIds;
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        const sourceFrameSnapshot = sourceFramePort?.getSnapshot() ?? null;
        const visibleLabelCandidateCounts = nextVisibleLabelFeatureIds.reduce<
          Record<LabelCandidate, number>
        >(
          (counts, featureId) => {
            const candidate = getLabelCandidateFromFeatureId(featureId);
            if (candidate != null) {
              counts[candidate] += 1;
            }
            return counts;
          },
          { bottom: 0, right: 0, top: 0, left: 0 }
        );
        didLogLabelVisibilityContractRef.current = true;
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_pin_label_visibility_contract',
          visibleLabelCount: nextVisibleLabelFeatureIds.length,
          visibleLabelCandidateCounts,
          layerRenderedFeatureCount,
          effectiveRenderedFeatureCount,
          expectedPinLabelSourceCount:
            activeLabelSourceStore.idsInOrder.length ||
            sourceFrameSnapshot?.labelSourceStore.idsInOrder.length ||
            0,
          expectedPinCount:
            presentedPinSourceStore.idsInOrder.length ||
            sourceFrameSnapshot?.pinSourceStore.idsInOrder.length ||
            0,
          hasVisiblePinLabels: nextVisibleLabelFeatureIds.length > 0,
        });
      }
    },
  });
  const nativeRenderOwnerInstanceId = resolvedNativeRenderOwnerInstanceId;
  React.useEffect(() => {
    if (shouldLogSearchNavSwitchDiagnosticLogs()) {
      logger.debug('[MAP-MOUNT-DIAG] SearchMap:nativeOwner', {
        searchMapComponentInstanceId,
        instanceId: nativeRenderOwnerInstanceId,
        resolvedMapTag,
      });
    }
  }, [nativeRenderOwnerInstanceId, resolvedMapTag, searchMapComponentInstanceId]);
  const isNativeRenderOwnerAvailable = resolvedIsNativeRenderOwnerAvailable;
  const nativeRenderOwnerAttachState = resolvedNativeRenderOwnerAttachState;
  const isNativeRenderOwnerReady = resolvedIsNativeRenderOwnerReady;
  const nativeFatalErrorMessage = resolvedNativeFatalErrorMessage;
  if (isLocalMapStyleReady && !isNativeRenderOwnerAvailable) {
    throw new Error('SearchMap native render owner is required for the full cutover');
  }
  if (isLocalMapStyleReady && nativeRenderOwnerAttachState === 'failed') {
    throw new Error(
      nativeFatalErrorMessage ?? 'SearchMap native render owner attach failed during full cutover'
    );
  }
  if (nativeFatalErrorMessage != null) {
    throw new Error(nativeFatalErrorMessage);
  }
  const isNativeOwnedMarkerRuntimeReady = isLocalMapStyleReady && isNativeRenderOwnerReady;
  const hasReportedFirstFullyRenderedFrameRef = React.useRef(false);
  const handleDidFinishRenderingFrameFully = React.useCallback(() => {
    if (!isLocalMapStyleReadyRef.current) {
      return;
    }
    if (!isStyleManagedContentReadyRef.current) {
      isStyleManagedContentReadyRef.current = true;
      setIsStyleManagedContentReady(true);
      return;
    }
    if (hasReportedFirstFullyRenderedFrameRef.current) {
      return;
    }
    hasReportedFirstFullyRenderedFrameRef.current = true;
    onMapFullyRenderedRef.current?.();
  }, []);
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
  const dotLayerStyle = React.useMemo(() => {
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
        ['get', 'pinColor'],
      ],
    } as unknown as MapboxGL.SymbolLayerStyle;
  }, [
    nativeHighlightedExpression,
    nativeDotOpacityExpression,
    nativePresentationOpacityExpression,
  ]);
  const labelObservationEnabled =
    requestedNativeLabelObservationEnabled && isNativeOwnedMarkerRuntimeReady;
  const visibleLabelFeatureIdListRef = React.useRef<string[]>([]);
  const didLogLabelVisibilityContractRef = React.useRef(false);
  const clearLabelObservationSnapshotRefs = React.useCallback(() => {
    visibleLabelFeatureIdListRef.current = [];
    didLogLabelVisibilityContractRef.current = false;
  }, []);
  React.useEffect(() => {
    if (labelObservationEnabled) {
      return;
    }
    clearLabelObservationSnapshotRefs();
  }, [clearLabelObservationSnapshotRefs, labelObservationEnabled]);
  React.useEffect(
    () => () => clearLabelObservationSnapshotRefs(),
    [clearLabelObservationSnapshotRefs]
  );
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
    } as unknown as MapboxGL.SymbolLayerStyle;
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

  const labelUpShiftEm = React.useMemo(
    () => labelPinTipToFillCenterPx / labelTextSize,
    [labelPinTipToFillCenterPx, labelTextSize]
  );

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
    return [
      'case',
      nativeHighlightedExpression,
      PRIMARY_COLOR,
      ['get', 'pinColor'],
    ] as const;
  }, [nativeHighlightedExpression]);

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
    () => [
      <MapboxGL.CircleLayer
        key={PIN_INTERACTION_LAYER_ID}
        id={PIN_INTERACTION_LAYER_ID}
        slot="top"
        belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
        sourceID={PIN_INTERACTION_SOURCE_ID}
        style={PIN_INTERACTION_LAYER_STYLE}
      />,
    ],
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
        textColor: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? '#00e5ff' : style.textColor,
        textHaloColor: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? '#003b46' : style.textHaloColor,
        textHaloWidth: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? 2.5 : style.textHaloWidth,
        textOpacity: SHOW_INTERACTION_LAYER_DEBUG_COLORS ? 0.85 : INTERACTION_LAYER_HIDDEN_OPACITY,
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
  const { mountedSourceCounts } = resolveMapPresentedLabelScene({
    shouldMountSearchMarkerLayers,
    shouldProjectSearchMarkerFamilies,
    presentedPinSourceStore,
    presentedDotSourceStore,
    labelSourceStore: activeLabelSourceStore,
    labelCollisionSourceStore: activeLabelCollisionSourceStore,
  });

  React.useEffect(() => {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'map_pin_label_layer_mount_contract',
      directDotSourceCount,
      directLabelSourceCount,
      directPinSourceCount,
      isNativeOwnedMarkerRuntimeReady,
      labelSourceCount: activeLabelSourceStore.idsInOrder.length,
      shouldProjectSearchMarkerFamilies,
      markerLayerShellMounted: shouldMountSearchMarkerLayers,
    });
  }, [
    directDotSourceCount,
    directLabelSourceCount,
    directPinSourceCount,
    isNativeOwnedMarkerRuntimeReady,
    activeLabelSourceStore.idsInOrder.length,
    shouldProjectSearchMarkerFamilies,
    shouldMountSearchMarkerLayers,
  ]);

  React.useEffect(() => {
    if (sourceFramePort != null) {
      return;
    }
    onNativeMountedSourceCountsChanged?.(mountedSourceCounts);
  }, [mountedSourceCounts, onNativeMountedSourceCountsChanged, sourceFramePort]);

  const labelTapHitbox = React.useMemo(
    () => ({
      textSize: labelTextSize,
      radialXEm: labelRadialXEm,
      radialYEm: labelRadialYEm,
      radialTopEm: labelRadialTopEm,
      upShiftEm: labelUpShiftEm,
      charWidthFactor: LABEL_TAP_CHAR_WIDTH_FACTOR,
      lineHeightFactor: LABEL_TAP_LINE_HEIGHT_FACTOR,
      paddingPx: LABEL_TAP_PADDING_PX,
      minWidthPx: LABEL_TAP_MIN_WIDTH_PX,
      maxWidthPx: LABEL_TAP_MAX_WIDTH_PX,
    }),
    [labelRadialTopEm, labelRadialXEm, labelRadialYEm, labelTextSize, labelUpShiftEm]
  );
  const { dotInteractionFilter, handleMapPress } =
    useSearchMapInteractionRuntime({
      nativeRenderOwnerInstanceId,
      onMarkerPress,
      onBlankMapPress: onPress,
      dotLayerId: DOT_INTERACTION_LAYER_ID,
      pinInteractionLayerIds: PIN_INTERACTION_LAYER_IDS,
      labelInteractionLayerIds: LABEL_INTERACTION_LAYER_IDS,
      labelTapHitbox,
      dotTapIntentRadiusPx: DOT_TAP_INTENT_RADIUS_PX,
    });
  const onProfilerRenderRef = React.useRef(onProfilerRender);
  React.useEffect(() => {
    onProfilerRenderRef.current = onProfilerRender;
  }, [onProfilerRender]);
  const profilerCallback = React.useCallback<React.ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      recordRuntimeAttribution(`map_js_profiler_${id}`, actualDuration);
      onProfilerRenderRef.current?.(id, phase, actualDuration, baseDuration, startTime, commitTime);
    },
    [recordRuntimeAttribution]
  );

  const handleNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      recordTimedRuntimeAttribution('map_js_native_viewport_handler', () => {
        onNativeViewportChanged(state);
      });
    },
    [onNativeViewportChanged, recordTimedRuntimeAttribution]
  );
  nativeViewportChangedHandlerRef.current = (payload) => {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (
      payload.isGestureActive &&
      isPerfScenarioAttributionActive(scenarioConfig)
    ) {
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'map_post_results_gesture_contract',
        source: 'native_camera',
        touchReachedMap: true,
        centerLat: payload.center[1],
        centerLng: payload.center[0],
        zoom: payload.zoom,
        isGestureActive: payload.isGestureActive,
        isMoving: payload.isMoving,
      });
    }
    recordTimedRuntimeAttribution('map_js_owner_viewport_dispatch', () => {
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
    });
  };

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      recordTimedRuntimeAttribution('map_js_map_idle_handler', () => {
        onMapIdle(state);
      });
    },
    [onMapIdle, recordTimedRuntimeAttribution]
  );
  // ---------------------------------------------------------------------------
  // Event-driven reveal signals: React effects that fire based on readiness
  // state rather than Mapbox frame callbacks. This ensures the reveal chain
  // completes regardless of Mapbox frame timing.
  // ---------------------------------------------------------------------------

  const handleMapLoaded = React.useCallback(() => {
    publishResolvedMapTag();
    hasReportedMapLoadedFromRenderFrameRef.current = true;
    recordTimedRuntimeAttribution('map_js_map_loaded_handler', () => {
      onMapLoaded();
    });
  }, [onMapLoaded, publishResolvedMapTag, recordTimedRuntimeAttribution]);

  const handleDidFinishRenderingFrame = React.useCallback(() => {
    if (!isLocalMapStyleReadyRef.current) {
      return;
    }
    if (hasReportedMapLoadedFromRenderFrameRef.current) {
      return;
    }
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleMapLoadedStyle = React.useCallback(() => {
    isLocalMapStyleReadyRef.current = true;
    isStyleManagedContentReadyRef.current = false;
    setIsLocalMapStyleReady(true);
    setIsStyleManagedContentReady(false);
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleMapLoadedMap = React.useCallback(() => {
    isLocalMapStyleReadyRef.current = true;
    setIsLocalMapStyleReady(true);
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleTouchStart = React.useCallback(() => {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'map_post_results_gesture_contract',
        source: 'map_touch_start',
        touchReachedMap: true,
      });
    }
    onTouchStart?.();
  }, [onTouchStart]);

  const handleTouchEnd = React.useCallback(() => {
    onTouchEnd?.();
  }, [onTouchEnd]);

  const handleMapViewPress = handleMapPress;

  const markerSceneProps = React.useMemo<SearchMapMarkerSceneProps | null>(
    () =>
      shouldMountSearchMarkerLayers
        ? {
            dotLayerStyle,
            dotInteractionFilter,
            handlePressTarget: handleMapPress,
            stylePinLayerStack,
            pinInteractionLayerStack,
            profilerCallback,
            labelLayerSpecs,
            labelCandidateStyles,
            labelInteractionStyles,
            restaurantLabelPinCollisionLayerKey,
            restaurantLabelPinCollisionLayerId,
            restaurantLabelPinCollisionLayerIdSideLeft,
            restaurantLabelPinCollisionLayerIdSideRight,
            restaurantLabelPinCollisionStyles,
          }
        : null,
    [
      dotInteractionFilter,
      dotLayerStyle,
      handleMapPress,
      labelCandidateStyles,
      labelInteractionStyles,
      labelLayerSpecs,
      pinInteractionLayerStack,
      profilerCallback,
      restaurantLabelPinCollisionLayerId,
      restaurantLabelPinCollisionLayerIdSideLeft,
      restaurantLabelPinCollisionLayerIdSideRight,
      restaurantLabelPinCollisionLayerKey,
      restaurantLabelPinCollisionStyles,
      shouldMountSearchMarkerLayers,
      stylePinLayerStack,
    ]
  );

  const userLocationLayerProps = React.useMemo(
    () => userLocationPuckProps,
    [userLocationPuckProps]
  );
  const handleMapLayout = React.useCallback(
    (_event: LayoutChangeEvent) => {
      publishResolvedMapTag();
    },
    [publishResolvedMapTag]
  );
  return (
    <SearchMapViewScene
      mapHostViewRef={mapHostViewRef}
      mapRef={mapRef}
      cameraRef={cameraRef}
      styleURL={styleURL}
      handleMapViewPress={handleMapViewPress}
      handleTouchStart={handleTouchStart}
      handleTouchEnd={handleTouchEnd}
      handleMapLoadedStyle={handleMapLoadedStyle}
      handleMapLoadedMap={handleMapLoadedMap}
      handleDidFinishRenderingFrame={handleDidFinishRenderingFrame}
      handleDidFinishRenderingFrameFully={handleDidFinishRenderingFrameFully}
      handleCameraAnimationComplete={onCameraAnimationComplete}
      onLayout={handleMapLayout}
      mapCenter={mapCenter}
      mapZoom={mapZoom}
      mapCameraAnimation={mapCameraAnimation}
      cameraPadding={cameraPadding}
      isFollowingUser={isFollowingUser}
      markerSceneProps={markerSceneProps}
      userLocationLayerProps={userLocationLayerProps}
    />
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
  if (prev.mapZoom !== next.mapZoom) {
    return false;
  }
  if (
    prev.mapCameraAnimation.mode !== next.mapCameraAnimation.mode ||
    prev.mapCameraAnimation.durationMs !== next.mapCameraAnimation.durationMs ||
    prev.mapCameraAnimation.completionId !== next.mapCameraAnimation.completionId
  ) {
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
  if (prev.fallbackMapSceneSnapshot !== next.fallbackMapSceneSnapshot) {
    return false;
  }
  if (prev.sourceFramePort !== next.sourceFramePort) {
    return false;
  }
  if (prev.resultsPresentationAuthority !== next.resultsPresentationAuthority) {
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
  if (prev.onCameraAnimationComplete !== next.onCameraAnimationComplete) {
    return false;
  }
  if (prev.presentationLifecyclePort !== next.presentationLifecyclePort) {
    return false;
  }
  if (prev.onMarkerPress !== next.onMarkerPress) {
    return false;
  }
  if (prev.nativeInteractionMode !== next.nativeInteractionMode) {
    return false;
  }
  if (prev.nativeViewportState !== next.nativeViewportState) {
    return false;
  }
  if (prev.onProfilerRender !== next.onProfilerRender) {
    return false;
  }
  return true;
};

export default React.memo(SearchMap, arePropsEqual);
