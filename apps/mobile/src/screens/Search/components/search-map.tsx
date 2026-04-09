import React from 'react';
import { Animated, Easing, View, findNodeHandle } from 'react-native';

import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';

type OnPressEvent = {
  features: Array<GeoJSON.Feature>;
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
};

type CameraAnimationCompleteEvent = {
  nativeEvent?: {
    payload?: {
      animationCompletionId?: string | null;
      status?: string;
    };
    payloadRenamed?: {
      animationCompletionId?: string | null;
      status?: string;
    };
  };
};
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';

import pinAsset from '../../../assets/pin.png';
import pinFillAsset from '../../../assets/pin-fill.png';
import pinShadowAsset from '../../../assets/pin-shadow.png';
import { colors as themeColors } from '../../../constants/theme';
import type { StartupLocationSnapshot } from '../../../navigation/runtime/MainLaunchCoordinator';
import type { Coordinate, MapBounds } from '../../../types';
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
import {
  FOUR_DIGIT_RANK_MIN,
  TRIPLE_DIGIT_RANK_FONT_SIZE_DELTA,
  TRIPLE_DIGIT_RANK_MIN,
} from '../utils/rank-badge';
import { MARKER_VIEW_OVERSCAN_STYLE } from './marker-visibility';
import { useSearchMapNativeRenderOwner } from './hooks/use-search-map-native-render-owner';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import {
  type SearchMapPresentationScene,
  type MapSnapshotPresentationPolicy,
} from '../runtime/map/map-presentation-runtime-contract';
import type { MapMotionPressureController } from '../runtime/map/map-motion-pressure';
import {
  areSearchMapRenderPresentationStatesEqual,
  searchMapRenderController,
  type SearchMapRenderInteractionMode,
  type SearchMapRenderPresentationState,
} from '../runtime/map/search-map-render-controller';

const MAP_PAN_DECELERATION_FACTOR = 0.995;
const SEARCH_MAP_COMPONENT_INSTANCE_ID_PREFIX = 'search-map-component';
let searchMapComponentInstanceSeq = 0;

const nextSearchMapComponentInstanceId = (): string => {
  searchMapComponentInstanceSeq += 1;
  return `${SEARCH_MAP_COMPONENT_INSTANCE_ID_PREFIX}:${searchMapComponentInstanceSeq}`;
};

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

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
  shouldMountLabelSource: boolean;
  shouldMountInteractionSource: boolean;
  shouldMountCollisionSource: boolean;
  shouldMountLabelLayers: boolean;
  shouldMountInteractionLayers: boolean;
  shouldMountCollisionLayers: boolean;
  labelSourceRevision: string;
  collisionSourceRevision: string;
  labelLayerSpecs: ReadonlyArray<{
    preferredCandidate: LabelCandidate;
    candidate: LabelCandidate;
    layerId: string;
    interactionLayerId: string;
  }>;
  labelCandidateStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  labelInteractionStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  handleLabelPress: (event: OnPressEvent) => void;
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
    shouldMountLabelSource,
    shouldMountInteractionSource,
    shouldMountCollisionSource,
    shouldMountLabelLayers,
    shouldMountInteractionLayers,
    shouldMountCollisionLayers,
    labelSourceRevision: _labelSourceRevision,
    collisionSourceRevision: _collisionSourceRevision,
    labelLayerSpecs,
    labelCandidateStyles,
    labelInteractionStyles,
    handleLabelPress,
    restaurantLabelPinCollisionLayerKey,
    restaurantLabelPinCollisionLayerId,
    restaurantLabelPinCollisionLayerIdSideLeft,
    restaurantLabelPinCollisionLayerIdSideRight,
    restaurantLabelPinCollisionStyles,
  }: SearchMapLabelLayersProps) => {
    const interactionOnPress = shouldMountInteractionLayers ? handleLabelPress : undefined;
    const buildLabelPlacementFilter = React.useCallback(
      (preferredCandidate: LabelCandidate, candidate: LabelCandidate): LabelPlacementFilter =>
        [
          'all',
          [
            '==',
            ['coalesce', ['feature-state', 'nativeLabelPreference'], LABEL_CANDIDATES_IN_ORDER[0]],
            preferredCandidate,
          ],
          ['==', ['get', 'labelCandidate'], candidate],
        ] as LabelPlacementFilter,
      []
    );
    return (
      <React.Fragment>
        {shouldMountLabelSource ? (
          <MapboxGL.ShapeSource id={RESTAURANT_LABEL_SOURCE_ID} shape={EMPTY_POINT_FEATURES}>
            {shouldMountLabelLayers
              ? labelLayerSpecs.map(({ preferredCandidate, candidate, layerId }) => (
                  <MapboxGL.SymbolLayer
                    key={layerId}
                    id={layerId}
                    slot="top"
                    sourceID={RESTAURANT_LABEL_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={labelCandidateStyles[candidate]}
                    filter={buildLabelPlacementFilter(preferredCandidate, candidate)}
                  />
                ))
              : undefined}
          </MapboxGL.ShapeSource>
        ) : null}
        {shouldMountInteractionSource ? (
          <MapboxGL.ShapeSource
            id={LABEL_INTERACTION_SOURCE_ID}
            shape={EMPTY_POINT_FEATURES}
            onPress={interactionOnPress}
          >
            {shouldMountInteractionLayers
              ? labelLayerSpecs.map(({ preferredCandidate, candidate, interactionLayerId }) => (
                  <MapboxGL.SymbolLayer
                    key={interactionLayerId}
                    id={interactionLayerId}
                    slot="top"
                    sourceID={LABEL_INTERACTION_SOURCE_ID}
                    belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
                    style={labelInteractionStyles[candidate]}
                    filter={buildLabelPlacementFilter(preferredCandidate, candidate)}
                  />
                ))
              : undefined}
          </MapboxGL.ShapeSource>
        ) : null}
        {shouldMountCollisionSource ? (
          <MapboxGL.ShapeSource
            id={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
            shape={EMPTY_POINT_FEATURES}
          >
            {shouldMountCollisionLayers ? (
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
        ) : null}
      </React.Fragment>
    );
  },
  (previousProps, nextProps) => {
    if (
      !previousProps.shouldMountLabelSource &&
      !nextProps.shouldMountLabelSource &&
      !previousProps.shouldMountInteractionSource &&
      !nextProps.shouldMountInteractionSource &&
      !previousProps.shouldMountCollisionSource &&
      !nextProps.shouldMountCollisionSource &&
      !previousProps.shouldMountLabelLayers &&
      !nextProps.shouldMountLabelLayers &&
      !previousProps.shouldMountCollisionLayers &&
      !nextProps.shouldMountCollisionLayers
    ) {
      return true;
    }
    return (
      previousProps.shouldMountLabelSource === nextProps.shouldMountLabelSource &&
      previousProps.shouldMountInteractionSource === nextProps.shouldMountInteractionSource &&
      previousProps.shouldMountCollisionSource === nextProps.shouldMountCollisionSource &&
      previousProps.shouldMountLabelLayers === nextProps.shouldMountLabelLayers &&
      previousProps.shouldMountInteractionLayers === nextProps.shouldMountInteractionLayers &&
      previousProps.shouldMountCollisionLayers === nextProps.shouldMountCollisionLayers &&
      previousProps.labelSourceRevision === nextProps.labelSourceRevision &&
      previousProps.collisionSourceRevision === nextProps.collisionSourceRevision &&
      previousProps.labelLayerSpecs === nextProps.labelLayerSpecs &&
      previousProps.labelCandidateStyles === nextProps.labelCandidateStyles &&
      previousProps.labelInteractionStyles === nextProps.labelInteractionStyles &&
      previousProps.handleLabelPress === nextProps.handleLabelPress &&
      previousProps.restaurantLabelPinCollisionLayerKey ===
        nextProps.restaurantLabelPinCollisionLayerKey &&
      previousProps.restaurantLabelPinCollisionLayerId ===
        nextProps.restaurantLabelPinCollisionLayerId &&
      previousProps.restaurantLabelPinCollisionLayerIdSideLeft ===
        nextProps.restaurantLabelPinCollisionLayerIdSideLeft &&
      previousProps.restaurantLabelPinCollisionLayerIdSideRight ===
        nextProps.restaurantLabelPinCollisionLayerIdSideRight &&
      previousProps.restaurantLabelPinCollisionStyles ===
        nextProps.restaurantLabelPinCollisionStyles
    );
  }
);

type SearchMapMarkerSceneProps = {
  shouldMountDotLayers: boolean;
  shouldMountSearchMarkerLayers: boolean;
  dotLayerStyle: MapboxGL.SymbolLayerStyle;
  dotInteractionFilter: unknown[];
  handleDotPress: (event: OnPressEvent) => void;
  stylePinLayerStack: React.ReactElement[];
  handleStylePinPress: (event: OnPressEvent) => void;
  pinInteractionLayerStack: React.ReactElement[];
  profilerCallback: React.ProfilerOnRenderCallback;
  shouldMountLabelSource: boolean;
  shouldMountLabelInteractionSource: boolean;
  shouldMountLabelCollisionSource: boolean;
  shouldMountLabelLayers: boolean;
  shouldMountLabelInteractionLayers: boolean;
  shouldMountLabelCollisionLayers: boolean;
  labelSourceRevision: string;
  collisionSourceRevision: string;
  labelLayerSpecs: ReadonlyArray<{
    preferredCandidate: LabelCandidate;
    candidate: LabelCandidate;
    layerId: string;
    interactionLayerId: string;
  }>;
  labelCandidateStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  labelInteractionStyles: Record<LabelCandidate, MapboxGL.SymbolLayerStyle>;
  handleLabelPress: (event: OnPressEvent) => void;
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
    shouldMountDotLayers,
    shouldMountSearchMarkerLayers,
    dotLayerStyle,
    dotInteractionFilter,
    handleDotPress,
    stylePinLayerStack,
    handleStylePinPress,
    pinInteractionLayerStack,
    profilerCallback,
    shouldMountLabelSource,
    shouldMountLabelInteractionSource,
    shouldMountLabelCollisionSource,
    shouldMountLabelLayers,
    shouldMountLabelInteractionLayers,
    shouldMountLabelCollisionLayers,
    labelSourceRevision,
    collisionSourceRevision,
    labelLayerSpecs,
    labelCandidateStyles,
    labelInteractionStyles,
    handleLabelPress,
    restaurantLabelPinCollisionLayerKey,
    restaurantLabelPinCollisionLayerId,
    restaurantLabelPinCollisionLayerIdSideLeft,
    restaurantLabelPinCollisionLayerIdSideRight,
    restaurantLabelPinCollisionStyles,
  }: SearchMapMarkerSceneProps) => {
    const shouldMountAnyLabelScene =
      shouldMountLabelSource ||
      shouldMountLabelInteractionSource ||
      shouldMountLabelCollisionSource ||
      shouldMountLabelLayers ||
      shouldMountLabelInteractionLayers ||
      shouldMountLabelCollisionLayers;

    return (
      <React.Fragment>
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
          {USE_STYLE_LAYER_PINS && shouldMountSearchMarkerLayers ? stylePinLayerStack : undefined}
        </MapboxGL.ShapeSource>
        <MapboxGL.ShapeSource
          id={PIN_INTERACTION_SOURCE_ID}
          shape={EMPTY_POINT_FEATURES}
          onPress={handleStylePinPress}
        >
          {USE_STYLE_LAYER_PINS && shouldMountSearchMarkerLayers
            ? pinInteractionLayerStack
            : undefined}
        </MapboxGL.ShapeSource>
        {shouldMountAnyLabelScene ? (
          <React.Profiler id="SearchMapLabels" onRender={profilerCallback}>
            <SearchMapLabelLayers
              shouldMountLabelSource={shouldMountLabelSource}
              shouldMountInteractionSource={shouldMountLabelInteractionSource}
              shouldMountCollisionSource={shouldMountLabelCollisionSource}
              shouldMountLabelLayers={shouldMountLabelLayers}
              shouldMountInteractionLayers={shouldMountLabelInteractionLayers}
              shouldMountCollisionLayers={shouldMountLabelCollisionLayers}
              labelSourceRevision={labelSourceRevision}
              collisionSourceRevision={collisionSourceRevision}
              labelLayerSpecs={labelLayerSpecs}
              labelCandidateStyles={labelCandidateStyles}
              labelInteractionStyles={labelInteractionStyles}
              handleLabelPress={handleLabelPress}
              restaurantLabelPinCollisionLayerKey={restaurantLabelPinCollisionLayerKey}
              restaurantLabelPinCollisionLayerId={restaurantLabelPinCollisionLayerId}
              restaurantLabelPinCollisionLayerIdSideLeft={
                restaurantLabelPinCollisionLayerIdSideLeft
              }
              restaurantLabelPinCollisionLayerIdSideRight={
                restaurantLabelPinCollisionLayerIdSideRight
              }
              restaurantLabelPinCollisionStyles={restaurantLabelPinCollisionStyles}
            />
          </React.Profiler>
        ) : null}
      </React.Fragment>
    );
  },
  (previousProps, nextProps) =>
    previousProps.shouldMountDotLayers === nextProps.shouldMountDotLayers &&
    previousProps.shouldMountSearchMarkerLayers === nextProps.shouldMountSearchMarkerLayers &&
    previousProps.dotLayerStyle === nextProps.dotLayerStyle &&
    previousProps.dotInteractionFilter === nextProps.dotInteractionFilter &&
    previousProps.handleDotPress === nextProps.handleDotPress &&
    previousProps.stylePinLayerStack === nextProps.stylePinLayerStack &&
    previousProps.handleStylePinPress === nextProps.handleStylePinPress &&
    previousProps.pinInteractionLayerStack === nextProps.pinInteractionLayerStack &&
    previousProps.profilerCallback === nextProps.profilerCallback &&
    previousProps.shouldMountLabelSource === nextProps.shouldMountLabelSource &&
    previousProps.shouldMountLabelInteractionSource ===
      nextProps.shouldMountLabelInteractionSource &&
    previousProps.shouldMountLabelCollisionSource === nextProps.shouldMountLabelCollisionSource &&
    previousProps.shouldMountLabelLayers === nextProps.shouldMountLabelLayers &&
    previousProps.shouldMountLabelInteractionLayers ===
      nextProps.shouldMountLabelInteractionLayers &&
    previousProps.shouldMountLabelCollisionLayers === nextProps.shouldMountLabelCollisionLayers &&
    previousProps.labelSourceRevision === nextProps.labelSourceRevision &&
    previousProps.collisionSourceRevision === nextProps.collisionSourceRevision &&
    previousProps.labelLayerSpecs === nextProps.labelLayerSpecs &&
    previousProps.labelCandidateStyles === nextProps.labelCandidateStyles &&
    previousProps.labelInteractionStyles === nextProps.labelInteractionStyles &&
    previousProps.handleLabelPress === nextProps.handleLabelPress &&
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
  handleCameraAnimationComplete: (event: CameraAnimationCompleteEvent) => void;
  mapCenter: [number, number] | null;
  mapZoom: number;
  mapCameraAnimation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  };
  cameraPadding: CameraPadding | null | undefined;
  isFollowingUser: boolean;
  markerSceneProps: SearchMapMarkerSceneProps;
  userLocationLayerProps: {
    userLocationAccuracyFeatureCollection: FeatureCollection<Polygon>;
    userLocationFeatureCollection: FeatureCollection<Point>;
    userLocationVisualSpec: UserLocationVisualSpec;
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
    <View style={styles.mapViewport} onLayout={onLayout}>
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
          animationCompletionId={mapCameraAnimation.completionId}
          followUserLocation={isFollowingUser}
          followZoomLevel={13}
          followPitch={0}
          followHeading={0}
          animationMode={mapCameraAnimation.mode}
          animationDuration={mapCameraAnimation.durationMs}
          onCameraAnimationComplete={handleCameraAnimationComplete}
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
        <SearchMapMarkerScene {...markerSceneProps} />
        {userLocationLayerProps ? (
          <UserLocationLayers
            userLocationAccuracyFeatureCollection={
              userLocationLayerProps.userLocationAccuracyFeatureCollection
            }
            userLocationFeatureCollection={userLocationLayerProps.userLocationFeatureCollection}
            userLocationVisualSpec={userLocationLayerProps.userLocationVisualSpec}
          />
        ) : null}
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
const USER_LOCATION_COLLISION_LAYER_ID = 'user-location-collision-layer';
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
    const userLocationCollisionStyle = React.useMemo<MapboxGL.SymbolLayerStyle>(() => {
      const collisionRadiusPx =
        Math.max(
          userLocationVisualSpec.shadowRadius,
          userLocationVisualSpec.ringRadius,
          userLocationVisualSpec.dotRadius * USER_LOCATION_PULSE_MAX_SCALE
        ) + 4;

      return {
        iconImage: LABEL_MUTEX_IMAGE_ID,
        // Transparent 1px image scaled into a collision box matching the marker footprint.
        iconSize: collisionRadiusPx * 2,
        iconAnchor: 'center',
        symbolZOrder: 'source',
        iconAllowOverlap: true,
        iconIgnorePlacement: false,
        iconPadding: 0,
        iconOpacity: 0.001,
        iconPitchAlignment: 'viewport',
      } as MapboxGL.SymbolLayerStyle;
    }, [
      userLocationVisualSpec.dotRadius,
      userLocationVisualSpec.ringRadius,
      userLocationVisualSpec.shadowRadius,
    ]);

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
          <MapboxGL.SymbolLayer
            id={USER_LOCATION_COLLISION_LAYER_ID}
            slot="top"
            sourceID={USER_LOCATION_SOURCE_ID}
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={userLocationCollisionStyle}
          />
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
export const RESTAURANT_LABEL_SOURCE_ID = 'restaurant-source';
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

export const buildLabelCandidateFeatureId = (markerKey: string, candidate: LabelCandidate) =>
  `${markerKey}::label::${candidate}`;

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

type MapPresentedMarkerScene = {
  shouldProjectSearchMarkerFamilies: boolean;
  presentedPinSourceStore: SearchMapSourceStore;
  presentedPinInteractionSourceStore: SearchMapSourceStore;
  presentedDotSourceStore: SearchMapSourceStore;
  presentedDotInteractionSourceStore: SearchMapSourceStore;
};

type MapPresentedLabelScene = {
  shouldMountLabelSource: boolean;
  shouldMountLabelInteractionSource: boolean;
  shouldMountLabelCollisionSource: boolean;
  shouldMountLabelLayers: boolean;
  shouldMountLabelInteractionLayers: boolean;
  shouldMountLabelCollisionLayers: boolean;
  nativeDesiredLabelInteractionFeatures: SearchMapSourceStore;
  mountedSourceCounts: {
    pinCount: number;
    dotCount: number;
    labelCount: number;
  };
};

type MapPreparedVisualSceneGate = {
  shouldAllowVisualScene: boolean;
  shouldAllowLabelInteractionScene: boolean;
  isVisualScenePrepared: boolean;
};

type SearchMapRenderedPressTarget = {
  restaurantId: string;
  coordinate: Coordinate | null;
  targetKind: 'pin' | 'label';
};

type SearchMapInteractionRuntime = {
  dotInteractionFilter: unknown[];
  handleStylePinPress: (event: OnPressEvent) => void;
  handleLabelPress: (event: OnPressEvent) => void;
  handleDotPress: (event: OnPressEvent) => void;
  refreshVisibleDotRestaurantIds: () => void;
};

const areMapSnapshotPresentationPoliciesEqual = (
  left: MapSnapshotPresentationPolicy,
  right: MapSnapshotPresentationPolicy
): boolean =>
  left.batchPhase === right.batchPhase &&
  left.visualReadyRequestKey === right.visualReadyRequestKey &&
  left.visualSceneKey === right.visualSceneKey &&
  left.shouldFreezePreparedScene === right.shouldFreezePreparedScene &&
  left.shouldCapturePreparedScene === right.shouldCapturePreparedScene &&
  left.shouldAllowVisualScene === right.shouldAllowVisualScene &&
  left.shouldAllowLabelInteractionScene === right.shouldAllowLabelInteractionScene &&
  left.shouldProjectSearchMarkerFamilies === right.shouldProjectSearchMarkerFamilies &&
  left.shouldAllowLiveLabelUpdates === right.shouldAllowLiveLabelUpdates &&
  left.shouldPublishVisibleLabelFeatureIds === right.shouldPublishVisibleLabelFeatureIds &&
  left.shouldResetPreparedVisualScene === right.shouldResetPreparedVisualScene &&
  left.shouldResetEnterLabelsUnavailableSignature ===
    right.shouldResetEnterLabelsUnavailableSignature &&
  left.enterLaneActive === right.enterLaneActive &&
  left.isPresentationPending === right.isPresentationPending;

const shouldDeferPreSourceRevealRender = ({
  previousPresentationState,
  previousBatchPhase,
  nextPresentationState,
  nextBatchPhase,
  nextPinSourceStore,
  nextDotSourceStore,
}: {
  previousPresentationState: SearchMapRenderPresentationState;
  previousBatchPhase: MapSnapshotPresentationPolicy['batchPhase'];
  nextPresentationState: SearchMapRenderPresentationState;
  nextBatchPhase: MapSnapshotPresentationPolicy['batchPhase'];
  nextPinSourceStore: SearchMapSourceStore;
  nextDotSourceStore: SearchMapSourceStore | null | undefined;
}): boolean => {
  const hasPreparedMarkerSourceData =
    nextPinSourceStore.idsInOrder.length > 0 || (nextDotSourceStore?.idsInOrder.length ?? 0) > 0;
  if (hasPreparedMarkerSourceData) {
    return false;
  }

  const previousPreRevealPhase =
    previousBatchPhase === 'covered' || previousBatchPhase === 'enter_requested';
  const nextPreRevealPhase = nextBatchPhase === 'enter_requested' || nextBatchPhase === 'entering';
  if (!previousPreRevealPhase || !nextPreRevealPhase) {
    return false;
  }

  return (
    previousPresentationState.coverState === nextPresentationState.coverState &&
    previousPresentationState.selectedRestaurantId === nextPresentationState.selectedRestaurantId &&
    previousPresentationState.allowEmptyEnter === nextPresentationState.allowEmptyEnter
  );
};

const resolveMapPresentedMarkerScene = ({
  phasePolicy,
  pinSourceStore,
  pinInteractionSourceStore,
  dotSourceStore,
  dotInteractionSourceStore,
}: {
  phasePolicy: MapSnapshotPresentationPolicy;
  pinSourceStore: SearchMapSourceStore;
  pinInteractionSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore | null | undefined;
  dotInteractionSourceStore: SearchMapSourceStore;
}): MapPresentedMarkerScene => ({
  shouldProjectSearchMarkerFamilies: phasePolicy.shouldProjectSearchMarkerFamilies,
  presentedPinSourceStore: phasePolicy.shouldProjectSearchMarkerFamilies
    ? pinSourceStore
    : EMPTY_SEARCH_MAP_SOURCE_STORE,
  presentedPinInteractionSourceStore: phasePolicy.shouldProjectSearchMarkerFamilies
    ? pinInteractionSourceStore
    : EMPTY_SEARCH_MAP_SOURCE_STORE,
  presentedDotSourceStore: phasePolicy.shouldProjectSearchMarkerFamilies
    ? dotSourceStore ?? EMPTY_SEARCH_MAP_SOURCE_STORE
    : EMPTY_SEARCH_MAP_SOURCE_STORE,
  presentedDotInteractionSourceStore: phasePolicy.shouldProjectSearchMarkerFamilies
    ? dotInteractionSourceStore
    : EMPTY_SEARCH_MAP_SOURCE_STORE,
});

const resolvePreparedLabelSourcesReady = ({
  shouldProjectSearchMarkerFamilies,
  isNativeOwnedMarkerRuntimeReady,
  shouldRenderLabels,
  presentedPinSourceStore,
  labelDerivedSourceIdentityKey,
  labelSourceStore,
  labelCollisionSourceStore,
}: {
  shouldProjectSearchMarkerFamilies: boolean;
  isNativeOwnedMarkerRuntimeReady: boolean;
  shouldRenderLabels: boolean;
  presentedPinSourceStore: SearchMapSourceStore;
  labelDerivedSourceIdentityKey: string;
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
}): boolean => {
  const shouldWaitForPreparedNativeOwnerReady = shouldProjectSearchMarkerFamilies;
  return (
    (!shouldWaitForPreparedNativeOwnerReady || isNativeOwnedMarkerRuntimeReady) &&
    (!shouldRenderLabels ||
      (labelDerivedSourceIdentityKey === presentedPinSourceStore.sourceRevision &&
        ((presentedPinSourceStore.idsInOrder.length === 0 &&
          labelSourceStore.idsInOrder.length === 0 &&
          labelCollisionSourceStore.idsInOrder.length === 0) ||
          (labelCollisionSourceStore.idsInOrder.length ===
            presentedPinSourceStore.idsInOrder.length &&
            labelSourceStore.idsInOrder.length > 0))))
  );
};

const resolveMapLabelObservationPolicy = ({
  phasePolicy,
}: {
  phasePolicy: MapSnapshotPresentationPolicy;
}): {
  allowLiveLabelUpdates: boolean;
  publishVisibleLabelFeatureIds: boolean;
} => ({
  allowLiveLabelUpdates: phasePolicy.shouldAllowLiveLabelUpdates,
  publishVisibleLabelFeatureIds: phasePolicy.shouldPublishVisibleLabelFeatureIds,
});

const resolveMapPresentedLabelScene = ({
  shouldMountSearchMarkerLayers,
  shouldProjectSearchMarkerFamilies,
  shouldAllowVisualScene,
  shouldAllowLabelInteractionScene,
  isVisualScenePrepared,
  presentedPinSourceStore,
  presentedDotSourceStore,
  labelSourceStore,
  labelCollisionSourceStore,
  settledVisibleLabelCount,
  shouldUsePinCollisionObstacle,
}: {
  shouldMountSearchMarkerLayers: boolean;
  shouldProjectSearchMarkerFamilies: boolean;
  shouldAllowVisualScene: boolean;
  shouldAllowLabelInteractionScene: boolean;
  isVisualScenePrepared: boolean;
  presentedPinSourceStore: SearchMapSourceStore;
  presentedDotSourceStore: SearchMapSourceStore;
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
  settledVisibleLabelCount: number;
  shouldUsePinCollisionObstacle: boolean;
}): MapPresentedLabelScene => {
  const shouldMountLabelSource =
    shouldMountSearchMarkerLayers &&
    shouldProjectSearchMarkerFamilies &&
    labelSourceStore.idsInOrder.length > 0;
  const shouldMountLabelLayers =
    shouldMountLabelSource && shouldAllowVisualScene && isVisualScenePrepared;
  const shouldMountLabelInteractionSource =
    shouldMountLabelSource && shouldAllowVisualScene && isVisualScenePrepared;
  const shouldMountLabelInteractionLayers =
    shouldMountLabelInteractionSource &&
    shouldAllowLabelInteractionScene &&
    settledVisibleLabelCount > 0;
  const shouldMountLabelCollisionSource =
    shouldMountSearchMarkerLayers &&
    shouldProjectSearchMarkerFamilies &&
    labelCollisionSourceStore.idsInOrder.length > 0 &&
    shouldUsePinCollisionObstacle;
  const shouldMountLabelCollisionLayers =
    shouldMountLabelCollisionSource && shouldAllowVisualScene && isVisualScenePrepared;

  return {
    shouldMountLabelSource,
    shouldMountLabelInteractionSource,
    shouldMountLabelCollisionSource,
    shouldMountLabelLayers,
    shouldMountLabelInteractionLayers,
    shouldMountLabelCollisionLayers,
    nativeDesiredLabelInteractionFeatures: EMPTY_SEARCH_MAP_SOURCE_STORE,
    mountedSourceCounts: {
      pinCount: shouldMountSearchMarkerLayers ? presentedPinSourceStore.idsInOrder.length : 0,
      dotCount: shouldMountSearchMarkerLayers ? presentedDotSourceStore.idsInOrder.length : 0,
      labelCount: shouldMountLabelSource ? labelSourceStore.idsInOrder.length : 0,
    },
  };
};

const findPresentedFeatureForRestaurantId = ({
  sourceStore,
  restaurantId,
}: {
  sourceStore: SearchMapPresentationScene['pinSourceStore'];
  restaurantId: string;
}): Feature<Point, RestaurantFeatureProperties> | null => {
  for (const featureId of sourceStore.idsInOrder) {
    const feature = sourceStore.featureById.get(featureId);
    if (feature?.properties.restaurantId === restaurantId) {
      return feature;
    }
  }

  return null;
};

const useMapPreparedVisualSceneGate = ({
  phasePolicy,
  sceneSnapshotKey,
  canPrepareScene,
}: {
  phasePolicy: MapSnapshotPresentationPolicy;
  sceneSnapshotKey: string | null;
  canPrepareScene: boolean;
}): MapPreparedVisualSceneGate => {
  const [preparedVisualSceneKey, setPreparedVisualSceneKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (phasePolicy.shouldResetPreparedVisualScene) {
      setPreparedVisualSceneKey(null);
      return;
    }
    setPreparedVisualSceneKey((current) => {
      if (current == null || current === sceneSnapshotKey) {
        return current;
      }
      return null;
    });
  }, [phasePolicy.shouldResetPreparedVisualScene, sceneSnapshotKey]);

  React.useEffect(() => {
    if (!phasePolicy.shouldAllowVisualScene || !canPrepareScene || sceneSnapshotKey == null) {
      return;
    }
    setPreparedVisualSceneKey((current) =>
      current === sceneSnapshotKey ? current : sceneSnapshotKey
    );
  }, [canPrepareScene, phasePolicy.shouldAllowVisualScene, sceneSnapshotKey]);

  return {
    shouldAllowVisualScene: phasePolicy.shouldAllowVisualScene,
    shouldAllowLabelInteractionScene: phasePolicy.shouldAllowLabelInteractionScene,
    isVisualScenePrepared: sceneSnapshotKey != null && preparedVisualSceneKey === sceneSnapshotKey,
  };
};

const useSearchMapInteractionRuntime = ({
  mapRef,
  nativeRenderOwnerInstanceId,
  onMarkerPress,
  shouldRenderDots,
  dotLayerId,
  pinInteractionLayerIds,
  labelInteractionLayerIds,
  markersRenderKey,
  styleURL,
  dotTapIntentRadiusPx,
  setOptimisticSelectedRestaurantId,
  getPointFromPressEvent,
  getCoordinateFromPressEvent,
  areStringArraysEqual,
  isTapInsideDotInteractionGeometry,
}: {
  mapRef: React.RefObject<MapboxMapRef | null>;
  nativeRenderOwnerInstanceId: string;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  shouldRenderDots: boolean;
  dotLayerId: string;
  pinInteractionLayerIds: string[];
  labelInteractionLayerIds: string[];
  markersRenderKey: string;
  styleURL: string;
  dotTapIntentRadiusPx: number;
  setOptimisticSelectedRestaurantId: React.Dispatch<React.SetStateAction<string | null>>;
  getPointFromPressEvent: (event: OnPressEvent) => { x: number; y: number } | null;
  getCoordinateFromPressEvent: (event: OnPressEvent) => Coordinate | null;
  areStringArraysEqual: (left: string[], right: string[]) => boolean;
  isTapInsideDotInteractionGeometry: (args: {
    mapInstance: MapboxMapRef | null;
    tapPoint: { x: number; y: number };
    coordinate: Coordinate | null;
  }) => Promise<boolean>;
}): SearchMapInteractionRuntime => {
  const resolveNativePressTarget = React.useCallback(
    async ({
      point,
      includeLabels,
    }: {
      point: { x: number; y: number };
      includeLabels: boolean;
    }): Promise<SearchMapRenderedPressTarget | null> =>
      searchMapRenderController.queryRenderedPressTarget({
        instanceId: nativeRenderOwnerInstanceId,
        point,
        pinLayerIds: pinInteractionLayerIds,
        ...(includeLabels ? { labelLayerIds: labelInteractionLayerIds } : {}),
      }),
    [labelInteractionLayerIds, nativeRenderOwnerInstanceId, pinInteractionLayerIds]
  );

  const [visibleDotRestaurantIdList, setVisibleDotRestaurantIdList] = React.useState<string[]>([]);
  const pinPressResolutionSeqRef = React.useRef(0);
  const onMarkerPressRef = React.useRef(onMarkerPress);
  const shouldRenderDotsRef = React.useRef(shouldRenderDots);
  const getPointFromPressEventRef = React.useRef(getPointFromPressEvent);
  const getCoordinateFromPressEventRef = React.useRef(getCoordinateFromPressEvent);
  const resolveNativePressTargetRef = React.useRef(resolveNativePressTarget);
  const isTapInsideDotInteractionGeometryRef = React.useRef(isTapInsideDotInteractionGeometry);

  React.useEffect(() => {
    onMarkerPressRef.current = onMarkerPress;
  }, [onMarkerPress]);

  React.useEffect(() => {
    shouldRenderDotsRef.current = shouldRenderDots;
  }, [shouldRenderDots]);

  React.useEffect(() => {
    getPointFromPressEventRef.current = getPointFromPressEvent;
  }, [getPointFromPressEvent]);

  React.useEffect(() => {
    getCoordinateFromPressEventRef.current = getCoordinateFromPressEvent;
  }, [getCoordinateFromPressEvent]);

  React.useEffect(() => {
    resolveNativePressTargetRef.current = resolveNativePressTarget;
  }, [resolveNativePressTarget]);

  React.useEffect(() => {
    isTapInsideDotInteractionGeometryRef.current = isTapInsideDotInteractionGeometry;
  }, [isTapInsideDotInteractionGeometry]);

  const refreshVisibleDotRestaurantIds = React.useCallback(() => {
    if (!shouldRenderDots) {
      setVisibleDotRestaurantIdList((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    void searchMapRenderController
      .queryRenderedDotObservation({
        instanceId: nativeRenderOwnerInstanceId,
        layerIds: [dotLayerId],
      })
      .then((observation) => {
        const next = [...observation.restaurantIds].sort();
        setVisibleDotRestaurantIdList((previous) =>
          areStringArraysEqual(previous, next) ? previous : next
        );
      })
      .catch(() => undefined);
  }, [areStringArraysEqual, dotLayerId, nativeRenderOwnerInstanceId, shouldRenderDots]);

  React.useEffect(() => {
    refreshVisibleDotRestaurantIds();
  }, [markersRenderKey, refreshVisibleDotRestaurantIds, shouldRenderDots, styleURL]);

  const handleStylePinPress = React.useCallback(
    (event: OnPressEvent) => {
      const onMarkerPressCurrent = onMarkerPressRef.current;
      if (!onMarkerPressCurrent) {
        return;
      }
      const point = getPointFromPressEventRef.current(event);
      if (!point) {
        return;
      }
      const pressSeq = ++pinPressResolutionSeqRef.current;
      void resolveNativePressTargetRef
        .current({ point, includeLabels: false })
        .then((pressTarget) => {
          if (pressSeq !== pinPressResolutionSeqRef.current || !pressTarget) {
            return;
          }
          setOptimisticSelectedRestaurantId(pressTarget.restaurantId);
          onMarkerPressCurrent(
            pressTarget.restaurantId,
            pressTarget.coordinate ?? getCoordinateFromPressEventRef.current(event) ?? null
          );
        })
        .catch(() => undefined);
    },
    [setOptimisticSelectedRestaurantId]
  );

  const handleLabelPress = React.useCallback(
    (event: OnPressEvent) => {
      const onMarkerPressCurrent = onMarkerPressRef.current;
      if (!onMarkerPressCurrent) {
        return;
      }
      const point = getPointFromPressEventRef.current(event);
      if (!point) {
        return;
      }
      const pressSeq = ++pinPressResolutionSeqRef.current;
      void resolveNativePressTargetRef
        .current({ point, includeLabels: true })
        .then((pressTarget) => {
          if (pressSeq !== pinPressResolutionSeqRef.current || !pressTarget) {
            return;
          }
          setOptimisticSelectedRestaurantId(pressTarget.restaurantId);
          onMarkerPressCurrent(
            pressTarget.restaurantId,
            pressTarget.coordinate ?? getCoordinateFromPressEventRef.current(event) ?? null
          );
        })
        .catch(() => undefined);
    },
    [setOptimisticSelectedRestaurantId]
  );

  const handleDotPress = React.useCallback(
    (event: OnPressEvent) => {
      const point = getPointFromPressEventRef.current(event);
      const mapInstance = mapRef.current;
      if (!point) {
        return;
      }
      const queryBox = [
        point.x - dotTapIntentRadiusPx,
        point.y - dotTapIntentRadiusPx,
        point.x + dotTapIntentRadiusPx,
        point.y + dotTapIntentRadiusPx,
      ] as [number, number, number, number];

      void searchMapRenderController
        .queryRenderedDotObservation({
          instanceId: nativeRenderOwnerInstanceId,
          layerIds: [dotLayerId],
          queryBox,
        })
        .then((observation) => {
          const renderedDots = observation.renderedDots;
          if (renderedDots.length === 0) {
            return;
          }
          const target =
            getCoordinateFromPressEventRef.current(event) ?? renderedDots[0]?.coordinate ?? null;
          if (!target) {
            return;
          }
          let pressMatch: {
            restaurantId: string;
            coordinate: Coordinate | null;
          } | null = null;
          let closestDistanceSq = Number.POSITIVE_INFINITY;
          for (const renderedDot of renderedDots) {
            const coordinate = renderedDot.coordinate;
            if (!coordinate) {
              continue;
            }
            const distance = haversineDistanceMiles(target, coordinate);
            if (distance >= closestDistanceSq) {
              continue;
            }
            closestDistanceSq = distance;
            pressMatch = {
              restaurantId: renderedDot.restaurantId,
              coordinate,
            };
          }
          const restaurantId = pressMatch?.restaurantId ?? renderedDots[0]?.restaurantId ?? null;
          if (!restaurantId) {
            return;
          }

          const coordinate = pressMatch?.coordinate ?? target;
          void isTapInsideDotInteractionGeometryRef
            .current({
              mapInstance,
              tapPoint: point,
              coordinate,
            })
            .then((isIntentional) => {
              if (!isIntentional) {
                return;
              }
              setOptimisticSelectedRestaurantId(restaurantId);
              onMarkerPressRef.current?.(restaurantId, coordinate);
            });
        })
        .catch(() => undefined);
    },
    [
      dotLayerId,
      dotTapIntentRadiusPx,
      mapRef,
      nativeRenderOwnerInstanceId,
      setOptimisticSelectedRestaurantId,
    ]
  );

  const dotInteractionFilter = React.useMemo(
    () =>
      [
        'all',
        ['in', ['get', 'restaurantId'], ['literal', visibleDotRestaurantIdList]],
      ] as unknown[],
    [visibleDotRestaurantIdList]
  );

  return {
    dotInteractionFilter,
    handleStylePinPress,
    handleLabelPress,
    handleDotPress,
    refreshVisibleDotRestaurantIds,
  };
};

type SearchMapProps = {
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  styleURL: string;
  scoreMode: 'global_quality' | 'coverage_display';
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
  onCameraAnimationComplete: (payload: {
    animationCompletionId: string | null;
    status: 'finished' | 'cancelled';
  }) => void;
  onMapLoaded: () => void;
  onMapFullyRendered?: () => void;
  onPreparedLabelSourcesReadyChange?: (ready: boolean) => void;
  onExecutionBatchMountedHidden?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    readyAtMs: number;
  }) => void;
  onMarkerEnterStarted?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    startedAtMs: number;
  }) => void;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onMarkerEnterSettled?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    markerEnterCommitId: number | null;
    settledAtMs: number;
  }) => void;
  onMarkerExitStarted?: (payload: { requestKey: string; startedAtMs: number }) => void;
  onMarkerExitSettled?: (payload: { requestKey: string; settledAtMs: number }) => void;
  onNativeMountedSourceCountsChanged?: (counts: {
    pinCount: number;
    dotCount: number;
    labelCount: number;
  }) => void;
  mapSceneSnapshot: SearchMapPresentationScene;
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
  nativePresentationState: SearchMapRenderPresentationState;
  mapSnapshotPresentationPolicy: MapSnapshotPresentationPolicy;
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
  scoreMode,
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
  onCameraAnimationComplete,
  onMapLoaded,
  onMapFullyRendered,
  onPreparedLabelSourcesReadyChange,
  onExecutionBatchMountedHidden,
  onMarkerEnterStarted,
  onMarkerPress,
  onMarkerEnterSettled,
  onMarkerExitStarted,
  onMarkerExitSettled,
  onNativeMountedSourceCountsChanged,
  mapSceneSnapshot,
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
  mapSnapshotPresentationPolicy,
  nativeInteractionMode,
  mapMotionPressureController,
  maxFullPins: _maxFullPins,
  lodVisibleCandidateBuffer: _lodVisibleCandidateBuffer,
  lodPinPromoteStableMsMoving: _lodPinPromoteStableMsMoving,
  lodPinDemoteStableMsMoving: _lodPinDemoteStableMsMoving,
  lodPinToggleStableMsIdle: _lodPinToggleStableMsIdle,
  lodPinOffscreenToggleStableMsMoving: _lodPinOffscreenToggleStableMsMoving,
}) => {
  const searchMapComponentInstanceIdRef = React.useRef<string | null>(null);
  if (searchMapComponentInstanceIdRef.current == null) {
    searchMapComponentInstanceIdRef.current = nextSearchMapComponentInstanceId();
  }
  const searchMapComponentInstanceId = searchMapComponentInstanceIdRef.current;
  const shouldDisableMarkers = disableMarkers === true;
  const phasePolicy = mapSnapshotPresentationPolicy;
  const presentationTelemetryPhase = phasePolicy.batchPhase;
  const visualReadyRequestKey = phasePolicy.visualReadyRequestKey;
  const {
    selectedRestaurantId,
    pinSourceStore,
    dotSourceStore,
    pinInteractionSourceStore,
    dotInteractionSourceStore,
    labelSourceStore,
    labelCollisionSourceStore,
    labelDerivedSourceIdentityKey,
    markersRenderKey,
  } = mapSceneSnapshot;
  const {
    shouldProjectSearchMarkerFamilies,
    presentedPinSourceStore,
    presentedPinInteractionSourceStore,
    presentedDotSourceStore,
    presentedDotInteractionSourceStore,
  } = resolveMapPresentedMarkerScene({
    phasePolicy,
    pinSourceStore,
    pinInteractionSourceStore,
    dotSourceStore,
    dotInteractionSourceStore,
  });
  const shouldMountSearchMarkerLayers = !shouldDisableMarkers && isMapStyleReady;
  const shouldPrepareLabelLayers =
    shouldProjectSearchMarkerFamilies && presentedPinSourceStore.idsInOrder.length > 0;
  const shouldRenderLabels = shouldPrepareLabelLayers;
  const shouldRenderDots =
    shouldProjectSearchMarkerFamilies && presentedDotSourceStore.idsInOrder.length > 0;
  const shouldMountDotLayers = shouldMountSearchMarkerLayers;
  const { allowLiveLabelUpdates, publishVisibleLabelFeatureIds } = resolveMapLabelObservationPolicy(
    {
      phasePolicy,
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
    nativeManagedLabelObservation &&
    allowLiveLabelUpdates &&
    presentationTelemetryPhase === 'live' &&
    shouldRenderLabels &&
    !shouldDisableMarkers;
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
  const nativeRefSnapshot =
    (mapRef.current as { _nativeRef?: unknown } | null)?._nativeRef ?? mapRef.current;
  const resolvedMapTagForRender = (() => {
    if (nativeRefSnapshot == null) {
      return null;
    }
    const tag = findNodeHandle(nativeRefSnapshot as never);
    return typeof tag === 'number' && tag > 0 ? tag : null;
  })();
  React.useEffect(() => {
    setResolvedMapTag((previous) =>
      previous === resolvedMapTagForRender ? previous : resolvedMapTagForRender
    );
  }, [resolvedMapTagForRender]);
  const {
    instanceId: resolvedNativeRenderOwnerInstanceId,
    isNativeAvailable: resolvedIsNativeRenderOwnerAvailable,
    attachState: resolvedNativeRenderOwnerAttachState,
    isNativeOwnerReady: resolvedIsNativeRenderOwnerReady,
    nativeFatalErrorMessage: resolvedNativeFatalErrorMessage,
  } = useSearchMapNativeRenderOwner({
    mapComponentInstanceId: searchMapComponentInstanceId,
    resolvedMapTag,
    isMapStyleReady,
    mapMotionPressureController,
    presentationState: {
      ...nativePresentationState,
      selectedRestaurantId: effectiveSelectedRestaurantId ?? null,
    },
    pinSourceId: STYLE_PINS_SOURCE_ID,
    pinInteractionSourceId: PIN_INTERACTION_SOURCE_ID,
    dotSourceId: DOT_SOURCE_ID,
    dotInteractionSourceId: DOT_INTERACTION_SOURCE_ID,
    labelSourceId: RESTAURANT_LABEL_SOURCE_ID,
    labelInteractionSourceId: LABEL_INTERACTION_SOURCE_ID,
    labelCollisionSourceId: RESTAURANT_LABEL_COLLISION_SOURCE_ID,
    labelObservationEnabled: requestedNativeLabelObservationEnabled,
    labelObservationConfig,
    commitVisibleLabelInteractionVisibility: publishVisibleLabelFeatureIds,
    pins: nativeDesiredPinFeatures,
    pinInteractions: nativeDesiredPinInteractionFeatures,
    dots: nativeDesiredDotFeatures,
    dotInteractions: nativeDesiredDotInteractionFeatures,
    labels: labelSourceStore,
    labelInteractions: nativeDesiredLabelInteractionFeatures,
    labelCollisions: labelCollisionSourceStore,
    viewportState: {
      bounds: nativeViewportState.bounds,
      isGestureActive: nativeViewportState.isGestureActive,
      isMoving: nativeViewportState.isMoving,
    },
    highlightedMarkerKey,
    interactionMode: nativeInteractionMode,
    onExecutionBatchMountedHidden,
    onMarkerEnterStarted,
    onMarkerEnterSettled: (payload) => {
      onMarkerEnterSettled?.({
        requestKey: payload.requestKey,
        frameGenerationId: payload.frameGenerationId,
        executionBatchId: payload.executionBatchId,
        markerEnterCommitId: null,
        settledAtMs: payload.settledAtMs,
      });
    },
    onMarkerExitStarted,
    onMarkerExitSettled,
    onViewportChanged: handleNativeViewportChangedFromOwner,
    onLabelObservationUpdated: ({ visibleLabelFeatureIds }) => {
      const nextVisibleLabelFeatureIds = [...visibleLabelFeatureIds].sort();
      const previousVisibleLabelFeatureIds = visibleLabelFeatureIdListRef.current;
      if (areStringArraysEqual(previousVisibleLabelFeatureIds, nextVisibleLabelFeatureIds)) {
        return;
      }
      visibleLabelFeatureIdListRef.current = nextVisibleLabelFeatureIds;
      if (publishVisibleLabelFeatureIds) {
        setSettledVisibleLabelCount((previous) =>
          previous === nextVisibleLabelFeatureIds.length
            ? previous
            : nextVisibleLabelFeatureIds.length
        );
      }
    },
  });
  const nativeRenderOwnerInstanceId = resolvedNativeRenderOwnerInstanceId;
  const isNativeRenderOwnerAvailable = resolvedIsNativeRenderOwnerAvailable;
  const nativeRenderOwnerAttachState = resolvedNativeRenderOwnerAttachState;
  const isNativeRenderOwnerReady = resolvedIsNativeRenderOwnerReady;
  const nativeFatalErrorMessage = resolvedNativeFatalErrorMessage;
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
  const handleDidFinishRenderingFrame = React.useCallback(() => {}, []);
  const hasReportedFirstFullyRenderedFrameRef = React.useRef(false);
  const handleDidFinishRenderingFrameFully = React.useCallback(() => {
    if (hasReportedFirstFullyRenderedFrameRef.current || !isMapStyleReady) {
      return;
    }
    hasReportedFirstFullyRenderedFrameRef.current = true;
    onMapFullyRendered?.();
  }, [isMapStyleReady, onMapFullyRendered]);
  const handleCameraAnimationCompleteEvent = React.useCallback(
    (event: CameraAnimationCompleteEvent) => {
      const payload = event.nativeEvent?.payload ?? event.nativeEvent?.payloadRenamed ?? null;
      onCameraAnimationComplete({
        animationCompletionId:
          typeof payload?.animationCompletionId === 'string' ? payload.animationCompletionId : null,
        status: payload?.status === 'cancelled' ? 'cancelled' : 'finished',
      });
    },
    [onCameraAnimationComplete]
  );
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
      findPresentedFeatureForRestaurantId({
        sourceStore: presentedPinSourceStore,
        restaurantId: effectiveSelectedRestaurantId,
      }) ??
      findPresentedFeatureForRestaurantId({
        sourceStore: presentedDotSourceStore,
        restaurantId: effectiveSelectedRestaurantId,
      });
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
  const labelObservationEnabled =
    requestedNativeLabelObservationEnabled && isNativeOwnedMarkerRuntimeReady;
  const [settledVisibleLabelCount, setSettledVisibleLabelCount] = React.useState(0);
  const visibleLabelFeatureIdListRef = React.useRef<string[]>([]);
  const clearLabelObservationSnapshotRefs = React.useCallback(() => {
    visibleLabelFeatureIdListRef.current = [];
  }, []);
  React.useEffect(() => {
    if (labelObservationEnabled) {
      return;
    }
    clearLabelObservationSnapshotRefs();
    setSettledVisibleLabelCount((previous) => (previous === 0 ? previous : 0));
  }, [clearLabelObservationSnapshotRefs, labelObservationEnabled]);
  React.useEffect(
    () => () => clearLabelObservationSnapshotRefs(),
    [clearLabelObservationSnapshotRefs]
  );
  const preparedLabelSourcesReady = resolvePreparedLabelSourcesReady({
    shouldProjectSearchMarkerFamilies,
    isNativeOwnedMarkerRuntimeReady,
    shouldRenderLabels,
    presentedPinSourceStore,
    labelDerivedSourceIdentityKey,
    labelSourceStore,
    labelCollisionSourceStore,
  });
  React.useEffect(() => {
    // The coordinator force-resets the bus readiness flag to false for each staged cycle.
    // Re-assert readiness when the map enters a new presentation batch phase even if the derived
    // readiness boolean stayed true across cycles, and when a new results snapshot lands
    // inside the same covered phase.
    onPreparedLabelSourcesReadyChange?.(preparedLabelSourcesReady);
  }, [
    labelCollisionSourceStore.sourceRevision,
    labelDerivedSourceIdentityKey,
    labelSourceStore.sourceRevision,
    onPreparedLabelSourcesReadyChange,
    phasePolicy.batchPhase,
    phasePolicy.visualSceneKey,
    preparedLabelSourcesReady,
    presentedPinSourceStore.sourceRevision,
    visualReadyRequestKey,
  ]);
  const nativeDesiredDotInteractionFeatures = presentedDotInteractionSourceStore;

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
  const {
    shouldAllowVisualScene: shouldAllowVisibleLabelScene,
    shouldAllowLabelInteractionScene,
    isVisualScenePrepared: isVisibleLabelScenePrepared,
  } = useMapPreparedVisualSceneGate({
    phasePolicy,
    sceneSnapshotKey: phasePolicy.visualSceneKey,
    canPrepareScene:
      shouldProjectSearchMarkerFamilies &&
      shouldMountSearchMarkerLayers &&
      presentedPinSourceStore.idsInOrder.length > 0 &&
      labelSourceStore.idsInOrder.length > 0 &&
      isNativeOwnedMarkerRuntimeReady,
  });
  const {
    shouldMountLabelSource,
    shouldMountLabelInteractionSource,
    shouldMountLabelCollisionSource,
    shouldMountLabelLayers,
    shouldMountLabelInteractionLayers,
    shouldMountLabelCollisionLayers,
    nativeDesiredLabelInteractionFeatures,
    mountedSourceCounts,
  } = resolveMapPresentedLabelScene({
    shouldMountSearchMarkerLayers,
    shouldProjectSearchMarkerFamilies,
    shouldAllowVisualScene: shouldAllowVisibleLabelScene,
    shouldAllowLabelInteractionScene,
    isVisualScenePrepared: isVisibleLabelScenePrepared,
    presentedPinSourceStore,
    presentedDotSourceStore,
    labelSourceStore,
    labelCollisionSourceStore,
    settledVisibleLabelCount,
    shouldUsePinCollisionObstacle:
      USE_STYLE_LAYER_PINS && PIN_COLLISION_OBSTACLE_GEOMETRY !== 'off',
  });

  React.useEffect(() => {
    onNativeMountedSourceCountsChanged?.(mountedSourceCounts);
  }, [mountedSourceCounts, onNativeMountedSourceCountsChanged]);

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
        refreshVisibleDotRestaurantIds();
      });
    },
    [onMapIdle, recordTimedRuntimeAttribution, refreshVisibleDotRestaurantIds]
  );
  // ---------------------------------------------------------------------------
  // Event-driven reveal signals: React effects that fire based on readiness
  // state rather than Mapbox frame callbacks. This ensures the reveal chain
  // completes regardless of Mapbox frame timing.
  // ---------------------------------------------------------------------------

  const handleMapLoaded = React.useCallback(() => {
    recordTimedRuntimeAttribution('map_js_map_loaded_handler', () => {
      onMapLoaded();
    });
  }, [onMapLoaded, recordTimedRuntimeAttribution]);

  const handleMapLoadedStyle = React.useCallback(() => {
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleMapLoadedMap = React.useCallback(() => {
    handleMapLoaded();
  }, [handleMapLoaded]);

  const handleTouchStart = React.useCallback(() => {
    onTouchStart?.();
  }, [onTouchStart]);

  const handleTouchEnd = React.useCallback(() => {
    onTouchEnd?.();
  }, [onTouchEnd]);

  const handleMapViewPress = React.useCallback(
    (feature: GeoJSON.Feature) => {
      // Mapbox MapView onPress is typed as a single feature; wrap it into the
      // marker-guard event shape consumed by the shared press classifier.
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

  const markerSceneProps = React.useMemo<SearchMapMarkerSceneProps>(
    () => ({
      shouldMountDotLayers,
      shouldMountSearchMarkerLayers,
      dotLayerStyle,
      dotInteractionFilter,
      handleDotPress,
      stylePinLayerStack,
      handleStylePinPress,
      pinInteractionLayerStack,
      profilerCallback,
      shouldMountLabelSource,
      shouldMountLabelInteractionSource,
      shouldMountLabelCollisionSource,
      shouldMountLabelLayers,
      shouldMountLabelInteractionLayers,
      shouldMountLabelCollisionLayers,
      labelSourceRevision: labelSourceStore.sourceRevision,
      collisionSourceRevision: labelCollisionSourceStore.sourceRevision,
      labelLayerSpecs,
      labelCandidateStyles,
      labelInteractionStyles,
      handleLabelPress,
      restaurantLabelPinCollisionLayerKey,
      restaurantLabelPinCollisionLayerId,
      restaurantLabelPinCollisionLayerIdSideLeft,
      restaurantLabelPinCollisionLayerIdSideRight,
      restaurantLabelPinCollisionStyles,
    }),
    [
      labelCollisionSourceStore.sourceRevision,
      dotInteractionFilter,
      dotLayerStyle,
      handleDotPress,
      handleLabelPress,
      handleStylePinPress,
      labelCandidateStyles,
      labelInteractionStyles,
      labelLayerSpecs,
      labelSourceStore.sourceRevision,
      pinInteractionLayerStack,
      profilerCallback,
      shouldMountLabelCollisionSource,
      restaurantLabelPinCollisionLayerId,
      restaurantLabelPinCollisionLayerIdSideLeft,
      restaurantLabelPinCollisionLayerIdSideRight,
      restaurantLabelPinCollisionLayerKey,
      restaurantLabelPinCollisionStyles,
      shouldMountDotLayers,
      shouldMountLabelInteractionSource,
      shouldMountLabelInteractionLayers,
      shouldMountLabelCollisionLayers,
      shouldMountLabelLayers,
      shouldMountLabelSource,
      shouldMountSearchMarkerLayers,
      stylePinLayerStack,
    ]
  );

  const userLocationLayerProps = React.useMemo(
    () =>
      userLocation
        ? {
            userLocationAccuracyFeatureCollection,
            userLocationFeatureCollection,
            userLocationVisualSpec,
          }
        : null,
    [
      userLocation,
      userLocationAccuracyFeatureCollection,
      userLocationFeatureCollection,
      userLocationVisualSpec,
    ]
  );

  return (
    <SearchMapViewScene
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
      handleCameraAnimationComplete={handleCameraAnimationCompleteEvent}
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
  if (prev.scoreMode !== next.scoreMode) {
    return false;
  }
  if (prev.isMapStyleReady !== next.isMapStyleReady) {
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
  if (prev.mapSceneSnapshot !== next.mapSceneSnapshot) {
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
  if (prev.onCameraAnimationComplete !== next.onCameraAnimationComplete) {
    return false;
  }
  if (prev.onMapLoaded !== next.onMapLoaded) {
    return false;
  }
  if (prev.onMapFullyRendered !== next.onMapFullyRendered) {
    return false;
  }
  if (prev.onPreparedLabelSourcesReadyChange !== next.onPreparedLabelSourcesReadyChange) {
    return false;
  }
  if (prev.onExecutionBatchMountedHidden !== next.onExecutionBatchMountedHidden) {
    return false;
  }
  if (prev.onMarkerEnterStarted !== next.onMarkerEnterStarted) {
    return false;
  }
  if (prev.onMarkerPress !== next.onMarkerPress) {
    return false;
  }
  if (prev.onMarkerEnterSettled !== next.onMarkerEnterSettled) {
    return false;
  }
  const shouldDeferPresentationDelta = shouldDeferPreSourceRevealRender({
    previousPresentationState: prev.nativePresentationState,
    previousBatchPhase: prev.mapSnapshotPresentationPolicy.batchPhase,
    nextPresentationState: next.nativePresentationState,
    nextBatchPhase: next.mapSnapshotPresentationPolicy.batchPhase,
    nextPinSourceStore: next.mapSceneSnapshot.pinSourceStore,
    nextDotSourceStore: next.mapSceneSnapshot.dotSourceStore,
  });
  if (
    !areSearchMapRenderPresentationStatesEqual(
      prev.nativePresentationState,
      next.nativePresentationState
    ) &&
    !shouldDeferPresentationDelta
  ) {
    return false;
  }
  if (
    !areMapSnapshotPresentationPoliciesEqual(
      prev.mapSnapshotPresentationPolicy,
      next.mapSnapshotPresentationPolicy
    ) &&
    !shouldDeferPresentationDelta
  ) {
    return false;
  }
  if (prev.nativeInteractionMode !== next.nativeInteractionMode) {
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
