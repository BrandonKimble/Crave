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
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
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
import { buildSearchMapVisualIdentityKey } from '../utils/search-map-visual-identity';
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
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
};

const DIRECT_SOURCE_FRAME_STORE_KEYS = [
  'pinSourceStore',
  'dotSourceStore',
  'pinInteractionSourceStore',
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
  left.labelSourceStore === right.labelSourceStore &&
  left.labelCollisionSourceStore === right.labelCollisionSourceStore;

const LABEL_OBSERVATION_REFRESH_MS_IDLE = 140;
const LABEL_OBSERVATION_REFRESH_MS_MOVING = 16;
const STYLE_PIN_OUTLINE_IMAGE_ID = 'restaurant-pin-outline';
const STYLE_PIN_SHADOW_IMAGE_ID = 'restaurant-pin-shadow';
const STYLE_PIN_FILL_IMAGE_ID = 'restaurant-pin-fill';
const LABEL_MUTEX_IMAGE_ID = 'restaurant-label-mutex';
const STYLE_PINS_SOURCE_ID = 'restaurant-style-pins-source';
const PIN_INTERACTION_SOURCE_ID = 'restaurant-pin-interaction-source';
const buildPinSlotSourceId = (slotIndex: number): string =>
  `${STYLE_PINS_SOURCE_ID}-slot-${slotIndex}`;

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
  }) as MapboxGL.SymbolLayerStyle;

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
  }) as MapboxGL.SymbolLayerStyle;

type SearchMapSlotLabelLayersArgs = {
  slotIndex: number;
  sourceId: string;
  labelLayerSpecs: ReadonlyArray<{
    preferredCandidate: LabelCandidate;
    candidate: LabelCandidate;
    layerId: string;
  }>;
  labelCandidateStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
};

type LabelPlacementFilter = NonNullable<
  React.ComponentProps<typeof MapboxGL.SymbolLayer>['filter']
>;

const promotedPinFeatureFilter = [
  '==',
  ['get', 'nativeSlotFeatureKind'],
  'pin',
] as LabelPlacementFilter;
const promotedPinInteractionFeatureFilter = [
  '==',
  ['get', 'nativeSlotFeatureKind'],
  'pinInteraction',
] as LabelPlacementFilter;

const buildLabelPlacementFilter = (
  preferredCandidate: LabelCandidate,
  candidate: LabelCandidate
): LabelPlacementFilter =>
  [
    'all',
    ['==', ['get', 'nativeSlotFeatureKind'], 'label'],
    ['==', ['get', 'labelPreference'], preferredCandidate],
    ['==', ['get', 'labelCandidate'], candidate],
  ] as LabelPlacementFilter;

const renderSearchMapSlotLabelLayers = ({
  slotIndex,
  sourceId,
  labelLayerSpecs,
  labelCandidateStyles,
}: SearchMapSlotLabelLayersArgs) => (
  <React.Fragment key={`slot-label-family-${slotIndex}`}>
    {labelLayerSpecs.map(({ preferredCandidate, candidate, layerId }) => {
      const slotLayerId = buildLabelVisualLayerId(layerId, slotIndex);
      return (
        <MapboxGL.SymbolLayer
          key={slotLayerId}
          id={slotLayerId}
          slot="top"
          sourceID={sourceId}
          belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
          style={labelCandidateStyles[candidate]}
          filter={buildLabelPlacementFilter(preferredCandidate, candidate)}
        />
      );
    })}
  </React.Fragment>
);

type SearchMapMarkerSceneProps = {
  pinStackSlotCount: number;
  pinSlotSourceIds: readonly string[];
  dotLayerStyle: MapboxGL.SymbolLayerStyle;
  handlePressTarget?: (event: SearchMapPressEvent) => void;
  stylePinLayerStackBySlot: ReadonlyArray<React.ReactElement[]>;
  pinInteractionLayerBySlot: ReadonlyArray<React.ReactElement>;
  profilerCallback: React.ProfilerOnRenderCallback;
  labelLayerSpecs: ReadonlyArray<{
    preferredCandidate: LabelCandidate;
    candidate: LabelCandidate;
    layerId: string;
  }>;
  labelCandidateStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
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
    pinStackSlotCount,
    pinSlotSourceIds,
    dotLayerStyle,
    handlePressTarget,
    stylePinLayerStackBySlot,
    pinInteractionLayerBySlot,
    profilerCallback,
    labelLayerSpecs,
    labelCandidateStyles,
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
        </React.Profiler>
        {Array.from({ length: pinStackSlotCount }, (_, slotIndex) => (
          <MapboxGL.ShapeSource
            key={pinSlotSourceIds[slotIndex]}
            id={pinSlotSourceIds[slotIndex]}
            shape={EMPTY_POINT_FEATURES}
            {...(handlePressTarget ? { onPress: handlePressTarget } : {})}
          >
            <React.Fragment>
              {stylePinLayerStackBySlot[slotIndex]}
              {pinInteractionLayerBySlot[slotIndex]}
              {renderSearchMapSlotLabelLayers({
                slotIndex,
                sourceId: pinSlotSourceIds[slotIndex],
                labelLayerSpecs,
                labelCandidateStyles,
              })}
            </React.Fragment>
          </MapboxGL.ShapeSource>
        ))}
        <MapboxGL.ShapeSource
          id={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
          shape={EMPTY_POINT_FEATURES}
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
    previousProps.pinStackSlotCount === nextProps.pinStackSlotCount &&
    previousProps.pinSlotSourceIds === nextProps.pinSlotSourceIds &&
    previousProps.dotLayerStyle === nextProps.dotLayerStyle &&
    previousProps.handlePressTarget === nextProps.handlePressTarget &&
    previousProps.stylePinLayerStackBySlot === nextProps.stylePinLayerStackBySlot &&
    previousProps.pinInteractionLayerBySlot === nextProps.pinInteractionLayerBySlot &&
    previousProps.profilerCallback === nextProps.profilerCallback &&
    previousProps.labelLayerSpecs === nextProps.labelLayerSpecs &&
    previousProps.labelCandidateStyles === nextProps.labelCandidateStyles &&
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
  handleMapViewPress?: (feature: GeoJSON.Feature) => void;
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
  mapBearing: number | null;
  mapPitch: number | null;
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
    mapBearing,
    mapPitch,
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
        {...(handleMapViewPress ? { onPress: handleMapViewPress } : {})}
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
          heading={mapBearing ?? undefined}
          pitch={mapPitch ?? undefined}
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
    previousProps.mapBearing === nextProps.mapBearing &&
    previousProps.mapPitch === nextProps.mapPitch &&
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
// Keep the base count in sync with SearchScreen's MAX_FULL_PINS. Selected locations use
// preallocated overflow slots so profile open can stay in the source-clean role lane.
const STYLE_PIN_STACK_SLOTS = 30;
const buildPinInteractionLayerId = (slotIndex: number): string =>
  `restaurant-pin-interaction-slot-${slotIndex}`;
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
    }))
  );

const LABEL_LAYER_SPECS: ReadonlyArray<LabelLayerSpec> = buildLabelLayerSpecs({
  preferredCandidates: LABEL_CANDIDATES_IN_ORDER,
});

const buildLabelVisualLayerId = (layerId: string, slotIndex: number): string =>
  `${layerId}-slot-${slotIndex}`;
const RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID = 'restaurant-labels-pin-collision';
const RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID_SIDE_LEFT =
  'restaurant-labels-pin-collision-side-left';
const RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID_SIDE_RIGHT =
  'restaurant-labels-pin-collision-side-right';

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
const SHOW_INTERACTION_LAYER_DEBUG_COLORS =
  __DEV__ && process.env.EXPO_PUBLIC_SEARCH_MAP_INTERACTION_DEBUG === '1';
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

const collectMaxRestaurantVisualIdentityCount = (
  sourceStores: readonly (SearchMapSourceStore | null | undefined)[]
): number => {
  const visualIdentityKeysByRestaurantId = new Map<string, Set<string>>();
  sourceStores.forEach((sourceStore) => {
    if (!sourceStore) {
      return;
    }
    sourceStore.idsInOrder.forEach((featureId) => {
      const feature = sourceStore.featureById.get(featureId);
      const restaurantId = feature?.properties.restaurantId;
      if (!feature || !restaurantId) {
        return;
      }
      let visualIdentityKeys = visualIdentityKeysByRestaurantId.get(restaurantId);
      if (!visualIdentityKeys) {
        visualIdentityKeys = new Set<string>();
        visualIdentityKeysByRestaurantId.set(restaurantId, visualIdentityKeys);
      }
      visualIdentityKeys.add(buildSearchMapVisualIdentityKey(feature));
    });
  });

  let maxVisualIdentityCount = 0;
  visualIdentityKeysByRestaurantId.forEach((visualIdentityKeys) => {
    maxVisualIdentityCount = Math.max(maxVisualIdentityCount, visualIdentityKeys.size);
  });
  return maxVisualIdentityCount;
};

const resolvePinStackSlotCount = ({
  pinSourceStore,
  dotSourceStore,
}: {
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore | null | undefined;
}): number => {
  const selectedOverflowSlotCount = collectMaxRestaurantVisualIdentityCount([
    pinSourceStore,
    dotSourceStore,
  ]);
  return STYLE_PIN_STACK_SLOTS + selectedOverflowSlotCount;
};

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

const getMarkerKeyFromLabelFeatureId = (featureId: string): string | null => {
  const separatorIndex = featureId.indexOf('::label::');
  if (separatorIndex <= 0) {
    return null;
  }
  return featureId.slice(0, separatorIndex);
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
  handleMapPress: (feature: SearchMapPressEvent) => void;
  nativePressOwnerEnabled: boolean;
};

const resolveMapPresentedMarkerScene = ({
  pinSourceStore,
  pinInteractionSourceStore,
  dotSourceStore,
}: {
  pinSourceStore: SearchMapSourceStore;
  pinInteractionSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore | null | undefined;
}): MapPresentedMarkerScene => ({
  shouldProjectSearchMarkerFamilies: true,
  presentedPinSourceStore: pinSourceStore,
  presentedPinInteractionSourceStore: pinInteractionSourceStore,
  presentedDotSourceStore: dotSourceStore ?? EMPTY_SEARCH_MAP_SOURCE_STORE,
});

const resolveMapLabelObservationPolicy = ({
  isPresentationLive,
}: {
  isPresentationLive: boolean;
}): {
  publishVisibleLabelFeatureIds: boolean;
} => ({
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
  visibleDotLayerId,
  pinInteractionLayerIds,
  labelLayerIds,
  labelTapHitbox,
  dotTapIntentRadiusPx,
  isNativePressTargetingReady,
}: {
  nativeRenderOwnerInstanceId: string;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onBlankMapPress: () => void;
  visibleDotLayerId: string;
  pinInteractionLayerIds: string[];
  labelLayerIds: string[];
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
  isNativePressTargetingReady: boolean;
}): SearchMapInteractionRuntime => {
  const nativePressOwnerEnabled =
    searchMapRenderController.platform === 'ios' ||
    searchMapRenderController.platform === 'android';
  const [nativePressTargetingErrorMessage, setNativePressTargetingErrorMessage] = React.useState<
    string | null
  >(null);
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
        labelLayerIds,
        labelTapHitbox,
        ...(dotQueryBox ? { dotLayerIds: [visibleDotLayerId], dotQueryBox } : {}),
        ...(tapCoordinate ? { tapCoordinate } : {}),
      }),
    [
      visibleDotLayerId,
      labelLayerIds,
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

  React.useEffect(() => {
    if (!nativePressOwnerEnabled || !isNativePressTargetingReady) {
      return;
    }
    let isCurrentConfig = true;
    void searchMapRenderController
      .configureNativePressTargeting({
        instanceId: nativeRenderOwnerInstanceId,
        enabled: true,
        pinLayerIds: pinInteractionLayerIds,
        labelLayerIds,
        labelTapHitbox,
        dotLayerIds: [visibleDotLayerId],
        dotTapIntentRadiusPx,
      })
      .then(() => {
        if (!isCurrentConfig) {
          return;
        }
        setNativePressTargetingErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!isCurrentConfig) {
          return;
        }
        setNativePressTargetingErrorMessage(
          error instanceof Error ? error.message : String(error)
        );
      });

    return () => {
      isCurrentConfig = false;
    };
  }, [
    visibleDotLayerId,
    dotTapIntentRadiusPx,
    isNativePressTargetingReady,
    labelLayerIds,
    labelTapHitbox,
    nativePressOwnerEnabled,
    nativeRenderOwnerInstanceId,
    pinInteractionLayerIds,
  ]);

  React.useEffect(() => {
    if (!nativePressOwnerEnabled) {
      return;
    }
    return (
      searchMapRenderController.addListener((event) => {
        if (event.type !== 'native_press_target_resolved') {
          return;
        }
        if (event.instanceId !== nativeRenderOwnerInstanceId) {
          return;
        }
        if (!event.target) {
          onBlankMapPressRef.current();
          return;
        }
        commitRestaurantPressTarget(event.target, event.pressCoordinate);
      }) ?? undefined
    );
  }, [commitRestaurantPressTarget, nativePressOwnerEnabled, nativeRenderOwnerInstanceId]);

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
      void resolveNativePressTargetRef
        .current({
          point,
          dotQueryBox: queryBox,
          tapCoordinate,
        })
        .then((pressTarget) => {
          if (pressSeq !== pinPressResolutionSeqRef.current) {
            return;
          }
          if (!pressTarget) {
            onBlankMapPressRef.current();
            return;
          }
          commitRestaurantPressTarget(pressTarget, tapCoordinate);
        })
        .catch(() => {
          // Native exact hit testing is authoritative for map press resolution.
        });
    },
    [
      dotTapIntentRadiusPx,
      commitRestaurantPressTarget,
      labelLayerIds,
      labelTapHitbox,
      nativeRenderOwnerInstanceId,
      pinInteractionLayerIds,
    ]
  );

  if (nativePressTargetingErrorMessage != null) {
    throw new Error(nativePressTargetingErrorMessage);
  }

  return {
    handleMapPress,
    nativePressOwnerEnabled,
  };
};

type SearchMapProps = {
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  styleURL: string;
  mapCenter: [number, number] | null;
  mapZoom: number;
  mapBearing: number | null;
  mapPitch: number | null;
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
  emptyMapSceneSnapshot: SearchMapPresentationScene;
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
};

const SearchMap: React.FC<SearchMapProps> = ({
  mapRef,
  cameraRef,
  styleURL,
  mapCenter,
  mapZoom,
  mapBearing,
  mapPitch,
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
  emptyMapSceneSnapshot,
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
}) => {
  const mapHostViewRef = React.useRef<View | null>(null);
  const searchMapComponentInstanceIdRef = React.useRef<string | null>(null);
  if (searchMapComponentInstanceIdRef.current == null) {
    searchMapComponentInstanceIdRef.current = nextSearchMapComponentInstanceId();
  }
  const searchMapComponentInstanceId = searchMapComponentInstanceIdRef.current;
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
    labelSourceStore,
    labelCollisionSourceStore,
  } = emptyMapSceneSnapshot;
  const directSourceFrameStores = useSearchMapSourceFrameSelector(
    sourceFramePort,
    (snapshot): DirectSourceFrameStores => ({
      pinSourceStore: snapshot.pinSourceStore,
      dotSourceStore: snapshot.dotSourceStore,
      pinInteractionSourceStore: snapshot.pinInteractionSourceStore,
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
  } = resolveMapPresentedMarkerScene({
    pinSourceStore: activePinSourceStore,
    pinInteractionSourceStore: activePinInteractionSourceStore,
    dotSourceStore: activeDotSourceStore,
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
  const { publishVisibleLabelFeatureIds } = resolveMapLabelObservationPolicy({
    isPresentationLive:
      presentationAuthoritySnapshot.resultsPresentation.contentVisibility === 'visible' &&
      !isResultsExitActive,
  });
  const labelObservationConfig = React.useMemo(
    () => ({
      refreshMsIdle: LABEL_OBSERVATION_REFRESH_MS_IDLE,
      refreshMsMoving: LABEL_OBSERVATION_REFRESH_MS_MOVING,
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
        bearing: number;
        pitch: number;
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
      bearing: number;
      pitch: number;
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
        : ((mapRef.current as { _nativeRef?: unknown } | null)?._nativeRef ?? mapRef.current);
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
  const pinStackSlotCount = React.useMemo(
    () =>
      resolvePinStackSlotCount({
        pinSourceStore: activePinSourceStore,
        dotSourceStore: activeDotSourceStore,
      }),
    [activeDotSourceStore, activePinSourceStore]
  );
  const labelLayerSpecs = React.useMemo(() => LABEL_LAYER_SPECS, []);
  const labelVisualLayerIds = React.useMemo(
    () =>
      Array.from({ length: pinStackSlotCount }, (_, slotIndex) =>
        labelLayerSpecs.map(({ layerId }) => buildLabelVisualLayerId(layerId, slotIndex))
      ).flat(),
    [labelLayerSpecs, pinStackSlotCount]
  );
  const labelCollisionLayerIds = React.useMemo(
    () => [
      RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID,
      RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID_SIDE_LEFT,
      RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID_SIDE_RIGHT,
    ],
    []
  );
  const pinSlotSourceIds = React.useMemo(
    () => Array.from({ length: pinStackSlotCount }, (_, slotIndex) => buildPinSlotSourceId(slotIndex)),
    [pinStackSlotCount]
  );
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
    labelSourceId: RESTAURANT_LABEL_SOURCE_ID,
    labelCollisionSourceId: RESTAURANT_LABEL_COLLISION_SOURCE_ID,
    pinSlotSourceIds,
    labelLayerIds: labelVisualLayerIds,
    labelCollisionLayerIds,
    labelObservationEnabled: requestedNativeLabelObservationEnabled,
    labelObservationConfig,
    pins: nativeDesiredPinFeatures,
    pinInteractions: nativeDesiredPinInteractionFeatures,
    dots: nativeDesiredDotFeatures,
    labels: activeLabelSourceStore,
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
      nativeVisibleLabelsWithoutPromotedPinCount,
      nativeVisibleLabelsForDemotedMarkerCount,
      nativeMultipleVisibleLabelCandidateMarkerCount,
      nativeVisibleLabelsWithoutPromotedPinMarkerKeys,
      nativeVisibleLabelsForDemotedMarkerKeys,
      nativeExpectedPromotedPinCount,
      nativeExpectedDemotedDotCount,
      nativePromotedPinCollisionObstacleCount,
      nativePromotedPinCollisionObstacleCountMatchesPins,
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
      didLogLabelVisibilityContractRef.current = true;
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
        const expectedPinSourceStore = sourceFrameSnapshot?.pinSourceStore ?? presentedPinSourceStore;
        const expectedDotSourceStore = sourceFrameSnapshot?.dotSourceStore ?? presentedDotSourceStore;
        const expectedLabelCollisionSourceStore =
          sourceFrameSnapshot?.labelCollisionSourceStore ?? activeLabelCollisionSourceStore;
        const expectedPromotedMarkerKeys = new Set(expectedPinSourceStore.idsInOrder);
        const expectedDemotedMarkerKeys = new Set(expectedDotSourceStore.idsInOrder);
        const visibleLabelCountsByMarkerKey = new Map<string, number>();
        const visibleLabelsWithoutPromotedPinMarkerKeys: string[] = [];
        const visibleLabelsForDemotedMarkerKeys: string[] = [];
        let visibleLabelsWithoutPromotedPinCount = 0;
        let visibleLabelsForDemotedMarkerCount = 0;
        nextVisibleLabelFeatureIds.forEach((featureId) => {
          const markerKey = getMarkerKeyFromLabelFeatureId(featureId);
          if (markerKey == null) {
            visibleLabelsWithoutPromotedPinCount += 1;
            return;
          }
          visibleLabelCountsByMarkerKey.set(
            markerKey,
            (visibleLabelCountsByMarkerKey.get(markerKey) ?? 0) + 1
          );
          if (!expectedPromotedMarkerKeys.has(markerKey)) {
            visibleLabelsWithoutPromotedPinCount += 1;
            visibleLabelsWithoutPromotedPinMarkerKeys.push(markerKey);
          }
          if (expectedDemotedMarkerKeys.has(markerKey)) {
            visibleLabelsForDemotedMarkerCount += 1;
            visibleLabelsForDemotedMarkerKeys.push(markerKey);
          }
        });
        const multipleVisibleLabelCandidateMarkerCount = [
          ...visibleLabelCountsByMarkerKey.values(),
        ].filter((count) => count > 1).length;
        const promotedPinCollisionObstacleCount =
          expectedLabelCollisionSourceStore.idsInOrder.length;
        const contractUsesNativeRoleTable =
          typeof nativeExpectedPromotedPinCount === 'number' &&
          typeof nativeExpectedDemotedDotCount === 'number';
        const contractMultipleVisibleLabelCandidateMarkerCount =
          nativeMultipleVisibleLabelCandidateMarkerCount ??
          multipleVisibleLabelCandidateMarkerCount;
        const contractVisibleLabelsWithoutPromotedPinCount =
          nativeVisibleLabelsWithoutPromotedPinCount ?? visibleLabelsWithoutPromotedPinCount;
        const contractVisibleLabelsForDemotedMarkerCount =
          nativeVisibleLabelsForDemotedMarkerCount ?? visibleLabelsForDemotedMarkerCount;
        const contractPromotedPinCollisionObstacleCount =
          nativePromotedPinCollisionObstacleCount ?? promotedPinCollisionObstacleCount;
        const contractExpectedPromotedPinCount =
          nativeExpectedPromotedPinCount ?? expectedPromotedMarkerKeys.size;
        const contractExpectedDemotedDotCount =
          nativeExpectedDemotedDotCount ?? expectedDemotedMarkerKeys.size;
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
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'map_rendered_label_collision_contract',
          visibleLabelCount: nextVisibleLabelFeatureIds.length,
          visibleLabelMarkerCount: visibleLabelCountsByMarkerKey.size,
          multipleVisibleLabelCandidateMarkerCount:
            contractMultipleVisibleLabelCandidateMarkerCount,
          visibleLabelsWithoutPromotedPinCount:
            contractVisibleLabelsWithoutPromotedPinCount,
          visibleLabelsForDemotedMarkerCount:
            contractVisibleLabelsForDemotedMarkerCount,
          visibleLabelsWithoutPromotedPinMarkerKeys: [
            ...new Set(
              nativeVisibleLabelsWithoutPromotedPinMarkerKeys ??
                visibleLabelsWithoutPromotedPinMarkerKeys
            ),
          ].slice(0, 8),
          visibleLabelsForDemotedMarkerKeys: [
            ...new Set(
              nativeVisibleLabelsForDemotedMarkerKeys ?? visibleLabelsForDemotedMarkerKeys
            ),
          ].slice(0, 8),
          expectedPromotedPinCount: contractExpectedPromotedPinCount,
          expectedDemotedDotCount: contractExpectedDemotedDotCount,
          promotedPinCollisionObstacleCount: contractPromotedPinCollisionObstacleCount,
          promotedPinCollisionObstacleCountMatchesPins:
            nativePromotedPinCollisionObstacleCountMatchesPins ??
            contractPromotedPinCollisionObstacleCount === contractExpectedPromotedPinCount,
          labelCollisionConfigured:
            restaurantLabelStyle.textAllowOverlap === false &&
            restaurantLabelStyle.textIgnorePlacement === false &&
            restaurantLabelStyle.textOptional === false,
          contractUsesNativeRoleTable,
        });
      }
    },
  });
  const nativeRenderOwnerInstanceId = resolvedNativeRenderOwnerInstanceId;
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
      textColor: ['case', nativeHighlightedExpression, PRIMARY_COLOR, ['get', 'pinColor']],
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

  const restaurantLabelPinCollisionLayerId = RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID;
  const restaurantLabelPinCollisionLayerIdSideLeft =
    RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID_SIDE_LEFT;
  const restaurantLabelPinCollisionLayerIdSideRight =
    RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID_SIDE_RIGHT;
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
    return ['case', nativeHighlightedExpression, PRIMARY_COLOR, ['get', 'pinColor']] as const;
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
      }) as MapboxGL.SymbolLayerStyle,
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
      }) as MapboxGL.SymbolLayerStyle,
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
      }) as MapboxGL.SymbolLayerStyle,
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
      }) as MapboxGL.SymbolLayerStyle,
    [nativeLodRankOpacityExpression, nativePresentationOpacityExpression]
  );

  const stylePinLayerStackBySlot = React.useMemo(() => {
    return Array.from({ length: pinStackSlotCount }, (_, slotIndex) => {
      return [
        <MapboxGL.SymbolLayer
          key={`shadow-slot-${slotIndex}`}
          id={`restaurant-style-pins-shadow-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsShadowSteadyStyle}
          sourceID={pinSlotSourceIds[slotIndex]}
          filter={promotedPinFeatureFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`base-slot-${slotIndex}`}
          id={`restaurant-style-pins-base-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsOutlineSteadyStyle}
          sourceID={pinSlotSourceIds[slotIndex]}
          filter={promotedPinFeatureFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`fill-slot-${slotIndex}`}
          id={`restaurant-style-pins-fill-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsFillSteadyStyle}
          sourceID={pinSlotSourceIds[slotIndex]}
          filter={promotedPinFeatureFilter}
        />,
        <MapboxGL.SymbolLayer
          key={`rank-slot-${slotIndex}`}
          id={`restaurant-style-pins-rank-slot-${slotIndex}`}
          slot="top"
          belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
          style={stylePinsRankStyle}
          sourceID={pinSlotSourceIds[slotIndex]}
          filter={promotedPinFeatureFilter}
        />,
      ];
    });
  }, [
    pinSlotSourceIds,
    pinStackSlotCount,
    stylePinsFillSteadyStyle,
    stylePinsOutlineSteadyStyle,
    stylePinsRankStyle,
    stylePinsShadowSteadyStyle,
  ]);

  const pinInteractionLayerBySlot = React.useMemo(
    () =>
      Array.from({ length: pinStackSlotCount }, (_, slotIndex) => {
        const layerId = buildPinInteractionLayerId(slotIndex);
        return (
          <MapboxGL.CircleLayer
            key={layerId}
            id={layerId}
            slot="top"
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            sourceID={pinSlotSourceIds[slotIndex]}
            style={PIN_INTERACTION_LAYER_STYLE}
            filter={promotedPinInteractionFeatureFilter}
          />
        );
      }),
    [pinSlotSourceIds, pinStackSlotCount]
  );
  const pinInteractionLayerIds = React.useMemo(
    () => Array.from({ length: pinStackSlotCount }, (_, slotIndex) => buildPinInteractionLayerId(slotIndex)),
    [pinStackSlotCount]
  );
  React.useEffect(() => {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    const firstPinSlotSourceId = pinSlotSourceIds[0] ?? null;
    const lastPinSlotSourceId = pinSlotSourceIds[pinSlotSourceIds.length - 1] ?? null;
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'search_map_slot_topology_contract',
      pinStackSlotCount,
      normalSlotCount: STYLE_PIN_STACK_SLOTS,
      selectedOverflowSlotCount: Math.max(0, pinStackSlotCount - STYLE_PIN_STACK_SLOTS),
      pinSlotSourceIdCount: pinSlotSourceIds.length,
      pinInteractionLayerIdCount: pinInteractionLayerIds.length,
      labelVisualLayerIdCount: labelVisualLayerIds.length,
      labelCollisionLayerIdCount: labelCollisionLayerIds.length,
      dotLayerId: DOT_LAYER_ID,
      firstPinSlotSourceId,
      lastPinSlotSourceId,
      slotTopologyKey: `${pinStackSlotCount}:${firstPinSlotSourceId ?? 'none'}:${
        lastPinSlotSourceId ?? 'none'
      }`,
      shouldMountSearchMarkerLayers,
      sourceFramePortAvailable: sourceFramePort != null,
    });
  }, [
    labelCollisionLayerIds.length,
    labelVisualLayerIds.length,
    pinInteractionLayerIds.length,
    pinSlotSourceIds,
    pinStackSlotCount,
    shouldMountSearchMarkerLayers,
    sourceFramePort,
  ]);

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
  const { handleMapPress, nativePressOwnerEnabled } = useSearchMapInteractionRuntime({
    nativeRenderOwnerInstanceId,
    onMarkerPress,
    onBlankMapPress: onPress,
    visibleDotLayerId: DOT_LAYER_ID,
    pinInteractionLayerIds,
    labelLayerIds: labelVisualLayerIds,
    labelTapHitbox,
    dotTapIntentRadiusPx: DOT_TAP_INTENT_RADIUS_PX,
    isNativePressTargetingReady: isNativeOwnedMarkerRuntimeReady,
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
    if (payload.isGestureActive && isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'map_post_results_gesture_contract',
        source: 'native_camera',
        touchReachedMap: true,
        centerLat: payload.center[1],
        centerLng: payload.center[0],
                  zoom: payload.zoom,
                  bearing: payload.bearing,
                  pitch: payload.pitch,
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
          heading: payload.bearing,
          pitch: payload.pitch,
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

  const handleMapViewPress = nativePressOwnerEnabled ? undefined : handleMapPress;
  const handleMarkerScenePressTarget = nativePressOwnerEnabled ? undefined : handleMapPress;

  const markerSceneProps = React.useMemo<SearchMapMarkerSceneProps | null>(
    () =>
      shouldMountSearchMarkerLayers
        ? {
            pinStackSlotCount,
            pinSlotSourceIds,
            dotLayerStyle,
            handlePressTarget: handleMarkerScenePressTarget,
            stylePinLayerStackBySlot,
            pinInteractionLayerBySlot,
            profilerCallback,
            labelLayerSpecs,
            labelCandidateStyles,
            restaurantLabelPinCollisionLayerKey,
            restaurantLabelPinCollisionLayerId,
            restaurantLabelPinCollisionLayerIdSideLeft,
            restaurantLabelPinCollisionLayerIdSideRight,
            restaurantLabelPinCollisionStyles,
          }
        : null,
    [
      dotLayerStyle,
      handleMarkerScenePressTarget,
      labelCandidateStyles,
      labelLayerSpecs,
      pinInteractionLayerBySlot,
      pinStackSlotCount,
      pinSlotSourceIds,
      profilerCallback,
      restaurantLabelPinCollisionLayerId,
      restaurantLabelPinCollisionLayerIdSideLeft,
      restaurantLabelPinCollisionLayerIdSideRight,
      restaurantLabelPinCollisionLayerKey,
      restaurantLabelPinCollisionStyles,
      shouldMountSearchMarkerLayers,
      stylePinLayerStackBySlot,
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
      mapBearing={mapBearing}
      mapPitch={mapPitch}
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
  if (prev.mapBearing !== next.mapBearing || prev.mapPitch !== next.mapPitch) {
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
  if (prev.emptyMapSceneSnapshot !== next.emptyMapSceneSnapshot) {
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
