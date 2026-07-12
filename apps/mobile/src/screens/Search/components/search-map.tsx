import React from 'react';
import {
  Animated,
  Easing,
  Platform,
  View,
  findNodeHandle,
  type LayoutChangeEvent,
} from 'react-native';

import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';

import pinAsset from '../../../assets/pin.png';
import pinFillAsset from '../../../assets/pin-fill.png';
import pinShadowAsset from '../../../assets/pin-shadow.png';
// Single-symbol pin model: one pre-composited sprite per (bucket × badge) — the
// pin body + tinted fill + the baked NUMBER (rank or score). The number is part of
// the icon, so symbol-z-order:'viewport-y' stacks pin+number as one unit (no text
// bleed). All 369 sprites are registered from the generated map below.
import { DOT_IMAGES, DOT_SPRITE_SCALE } from '../../../generated/dot-images';
import { PIN_BADGE_IMAGES, PIN_BADGE_SPRITE_SCALE } from '../../../generated/pin-badge-images';
import { colors as themeColors } from '../../../constants/theme';
import type { StartupLocationSnapshot } from '../../../navigation/runtime/MainLaunchCoordinator';
import type { Coordinate, MapBounds } from '../../../types';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import {
  generateScaleProbeFeatures,
  usePerfScaleProbeStore,
} from '../../../perf/perf-scale-probe-store';
import {
  PIN_FILL_CENTER_Y,
  PIN_FILL_RENDER_HEIGHT,
  PIN_FILL_TOP_OFFSET,
  PIN_MARKER_RENDER_SIZE,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
} from '../constants/search';

import styles from '../styles';
import { isLngLatTuple } from '../utils/geo';
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
import { getSearchSurfaceRuntime } from '../runtime/surface/search-surface-runtime';
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

const STYLE_PIN_OUTLINE_IMAGE_ID = 'restaurant-pin-outline';
const STYLE_PIN_SHADOW_IMAGE_ID = 'restaurant-pin-shadow';
const STYLE_PIN_FILL_IMAGE_ID = 'restaurant-pin-fill';
// Single-symbol pin: one pre-baked sprite per (bucket × badge). The whole pin —
// body, tinted fill, AND the baked number (rank in-viewport / score out) — is the
// icon. `icon-image` is data-driven on the feature's `badgeImageId` property (set
// in the source builder), so the number rides the pin's z-order natively.
// PIN_BADGE_IMAGES maps imageId → bundled source; register each at the sprite scale.
const PIN_BADGE_IMAGE_ENTRIES: Record<string, { image: unknown; scale: number }> =
  Object.fromEntries(
    Object.entries(PIN_BADGE_IMAGES).map(([id, image]) => [
      id,
      { image, scale: PIN_BADGE_SPRITE_SCALE },
    ])
  );
// Pre-baked circle DOT sprites (one per score bucket + highlighted), registered at scale 3 so
// the 24px @3x art renders at 8pt with icon-size 1 — crisp, no upscale, tight square collision box.
const DOT_IMAGE_ENTRIES: Record<string, { image: unknown; scale: number }> = Object.fromEntries(
  Object.entries(DOT_IMAGES).map(([id, image]) => [id, { image, scale: DOT_SPRITE_SCALE }])
);
// Feature-count degradation harness (#21): a dedicated resident source+layer that
// mounts N synthetic pins (allow-overlap + ignore-placement → no collision culling,
// so every feature is drawn) to isolate the pure feature-count cost in one layer.
const SCALE_PROBE_SOURCE_ID = 'perf-scale-probe-source';
const SCALE_PROBE_LAYER_ID = 'perf-scale-probe-layer';
const STYLE_PINS_SOURCE_ID = 'restaurant-style-pins-source';
// The pin bundle source. It no longer renders anything on iOS — pins are drawn as native
// ViewAnnotations (PinVAView) and tapped via overlayHitTest, and its GL pin/shadow/interaction
// layers were removed. It stays mounted as the target for the native pin-LOD setFeatureState writes + the
// engine's viewport-y group ordering. Kept distinct from STYLE_PINS_SOURCE_ID, which native uses as
// the in-memory pin *staging* family (marker render state / transitions). Derivation must match
// native: `"\(pinSourceId)-bundle"`.
const RESTAURANT_PIN_BUNDLE_SOURCE_ID = `${STYLE_PINS_SOURCE_ID}-bundle`;
// UN-BUNDLED name-label render source. Derivation must match native
// `"\(pinSourceId)-label-render"`. Holds the native-wrapped, promote-gated labels so label churn
// re-layouts only labels, never the resident pins.
const PIN_INTERACTION_SOURCE_ID = 'restaurant-pin-interaction-source';

// Pin collision obstacle geometry.
// - `outline`: uses the full pin sprite bounding box (conservative).
// - `fill`: uses the fill sprite bounding box (tighter).
// - `off`: disables pin collision obstacles entirely (labels may overlap pins).
// [box1-match-pin TEST 2026-06-27] 'fill' (smaller, up-shifted into crown) → 'outline'
// (full pin silhouette, tip-aligned, no up-shift — see iconOffset:[0,0] below) so the
// label obstacle (BOX 1) matches the pin's OWN footprint exactly. Goal: stop the obstacle
// poking above the crown, which culls a label sitting above the pin. Flip back to 'fill'
// for the A/B before measurement.
const PIN_COLLISION_OBSTACLE_GEOMETRY: 'outline' | 'fill' | 'off' = 'outline' as
  | 'outline'
  | 'fill'
  | 'off';
// 2026-06-22 REGRESSION FIX: commit 73719a62 bumped this 0.6 → 1.1. At 1.1 the invisible pin-collision
// obstacle is ~10% BIGGER than the visible pin, so a promoted pin's OWN offset name-label (min-gapped
// to just clear the pin body) lands inside the obstacle and gets collision-culled — ALL name-labels
// vanished. Attributed via the LOD harness + a loud-label probe (labels render fine with collision off;
// disabling this obstacle alone restored them; mutex-off did not). 0.6 was the value prior "missing
// labels" debugging settled on: obstacle covers the pin core so own-labels clear it, while other pins'
// labels still yield to the pin. Keep ≤ ~1.0; do not re-bump without re-checking labels actually paint.
// 2026-06-23: the accurate `lopreal` probe (queryRenderedFeatures of label layers over each pin's body)
// proved the 0.6 compromise FAILS — 18/30 promoted pins have a foreign label rendered on their body at
// settle. Trying full body (1.0) so OTHER labels yield to the whole pin; verified empirically via
// lopreal.covered (must drop) vs renderedLabels/labelEff (own labels must survive — own label sits below
// the bottom-anchored body, so an above-anchor body obstacle should reposition not cull). Revert if labels drop.
const PIN_COLLISION_OBSTACLE_SCALE = 1.0;
// DOT-only collision obstacle scale. The 0.6 label obstacle above is a forced compromise: it must be
// big enough that OTHER restaurants' labels yield to the pin, but small enough that the pin's OWN
// min-gapped name-label clears it (1.1 swallowed the own label — see the comment above). That core-sized
// obstacle UNDER-covers the pin body, so a neighbour restaurant's coverage DOT that lands inside the pin
// body but outside the 0.6 core is not culled → it paints over the pin body (#9). Fix = a SEPARATE,
// full-pin-body obstacle that ONLY DOTS yield to (placed BELOW the labels in the layer stack, so labels
// never yield to it — no own-label regression — but ABOVE the dots, so dots yield to the whole body).
const PIN_DOT_COLLISION_OBSTACLE_SCALE = 1.0;
// Approximate the MarkerView drop-shadow using the historical soft-edged sprite.
const STYLE_PINS_SHADOW_OPACITY = 0.65;
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

// Collision tuning: shift the pin obstacle upward so other restaurants' labels collide with the pin
// body sooner (reducing overlap at the top) while allowing a bit more overlap near the tip.
//
// NOTE: Must use `iconOffset` (layout) instead of `iconTranslate` (paint), otherwise collision won't
// move even if the visualization does.
// 2026-06-22 REGRESSION FIX (part 2): commit 73719a62 also changed this factor 0.25 → -0.054,
// which flips the obstacle's Y shift from -7px (UP, clear of the below-pin name-labels) to +2px
// (DOWN, into the below-pin label region) — so even after restoring the 0.6 scale the obstacle still
// culled the bottom label candidate. Restore the 0.25 factor: shift the pin obstacle UP so other
// restaurants' labels still collide with the pin body, but a pin's OWN below-pin label clears it.
const PIN_COLLISION_OFFSET_Y_PX = -Math.round(PIN_MARKER_RENDER_SIZE * 0.25);
const PIN_COLLISION_FILL_OFFSET_IMAGE_PX =
  PIN_COLLISION_OFFSET_Y_PX / (STYLE_PINS_FILL_ICON_SIZE * PIN_COLLISION_OBSTACLE_SCALE);
// Pin fade timing lives natively now: the display-link tick owns ALL pin opacity
// animation (LOD promote/demote + presentation reveal/dismiss). There is no JS/Mapbox
// style transition for pin opacity — pins are ViewAnnotations (PinVAView) whose alpha the
// tick writes per frame (refreshPinVAAlpha), so it is the sole animator (this is what
// removed the per-frame placement-pass pin jitter).

type LabelPlacementFilter = NonNullable<
  React.ComponentProps<typeof MapboxGL.SymbolLayer>['filter']
>;

// The invisible pin-collision obstacle (which makes name-labels yield to pins) must exist ONLY at
// actual promoted pins — never at demoted-dot markers, or its full pin-silhouette boxes flood the
// map and collision-cull every label. The collision source bakes `nativeLodOpacity` = 1 for the
// promoted seed and 0 for demoted markers; gate the obstacle on it. (Baked seed, not feature-state —
// good enough: it matches the promoted set at reveal and is refreshed on each republish.)
const promotedPinCollisionObstacleFilter = [
  '>',
  ['coalesce', ['get', 'nativeLodOpacity'], 0],
  0.5,
] as LabelPlacementFilter;

// The GL label render pipeline is GONE (2026-07-11, VA-cleanup manifest 07). Labels render as
// native ViewAnnotations (LabelVAView); their collision box is the VA itself
// (enableSymbolLayerCollision), minted at reveal start and removed at dismiss start. The GL
// SymbolLayer here never painted (native held it visibility:none) and its collision-twin sibling
// was the phantom dot-culler. Only the obstacle layers (pin + dot body) remain GL.

type SearchMapMarkerSceneProps = {
  dotLayerStyle: MapboxGL.SymbolLayerStyle;
  handlePressTarget?: (event: SearchMapPressEvent) => void;
  profilerCallback: React.ProfilerOnRenderCallback;
  restaurantLabelPinCollisionLayerKey: string;
  restaurantLabelPinCollisionLayerId: string;
  restaurantLabelPinCollisionStyle: MapboxGL.SymbolLayerStyle;
};

const SearchMapMarkerScene = React.memo(
  ({
    dotLayerStyle,
    handlePressTarget,
    profilerCallback,
    restaurantLabelPinCollisionLayerKey,
    restaurantLabelPinCollisionLayerId,
    restaurantLabelPinCollisionStyle,
  }: SearchMapMarkerSceneProps) => {
    return (
      <React.Fragment>
        <React.Profiler id="SearchMapDots" onRender={profilerCallback}>
          <MapboxGL.ShapeSource
            id={DOT_SOURCE_ID}
            maxZoomLevel={13}
            shape={EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>}
          >
            <MapboxGL.SymbolLayer
              id={DOT_LAYER_ID}
              slot={undefined}
              belowLayerID={SEARCH_PINS_Z_ANCHOR_LAYER_ID}
              // L4 (§3.4): invisible-resident group siblings (out-of-searched-bounds market
              // locations) never place a dot — not even an opacity-0 one, which would still
              // collide (cull neighbors / suppress basemap labels in its footprint). They only
              // ever surface as promoted VA pins via the selection overlay's forcedKeys.
              filter={['!=', ['get', 'isInvisibleResident'], true]}
              style={dotLayerStyle}
              sourceID={DOT_SOURCE_ID}
            />
          </MapboxGL.ShapeSource>
        </React.Profiler>
        {/* Pins render + tap as native ViewAnnotations (PinVAView in
            SearchMapRenderController.swift) — SDK-positioned, so they don't re-quantize on zoom-out
            (the wiggle fix) and the native VA hit-test owns all pin taps. This bundle source has NO
            render/interaction layer of its own anymore; it stays mounted only as the target for
            the native pin LOD feature-state writes + the engine's viewport-y group ordering.
            Name-labels are UN-BUNDLED into their own source below so their promote/demote churn
            never re-snaps the resident pins. */}
        <MapboxGL.ShapeSource
          id={RESTAURANT_PIN_BUNDLE_SOURCE_ID}
          maxZoomLevel={13}
          shape={EMPTY_POINT_FEATURES}
          {...(handlePressTarget ? { onPress: handlePressTarget } : {})}
        />
        {/* UN-BUNDLED name-label render source: the label candidate layers read from here, not the
            pin bundle, so their promote/demote churn never re-snaps the resident pins. */}
        <MapboxGL.ShapeSource
          id={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
          maxZoomLevel={13}
          shape={EMPTY_POINT_FEATURES}
        >
          <MapboxGL.SymbolLayer
            key={restaurantLabelPinCollisionLayerKey}
            id={restaurantLabelPinCollisionLayerId}
            slot={undefined}
            sourceID={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
            belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            style={restaurantLabelPinCollisionStyle}
            filter={promotedPinCollisionObstacleFilter}
          />
          {/* DOT-only full-body obstacle (#9): below the labels (so labels never yield to it) but above
              the dots (so neighbouring restaurants' dots yield to the WHOLE pin body, not just the 0.6
              label core). belowLayerID = the pins z-anchor → it places below the labels, above the dots. */}
          <MapboxGL.SymbolLayer
            key={`${restaurantLabelPinCollisionLayerKey}-dotbody`}
            id={RESTAURANT_PIN_DOT_COLLISION_LAYER_ID}
            slot={undefined}
            sourceID={RESTAURANT_LABEL_COLLISION_SOURCE_ID}
            belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
            style={DOT_PIN_COLLISION_STYLE}
            filter={promotedPinCollisionObstacleFilter}
          />
        </MapboxGL.ShapeSource>
      </React.Fragment>
    );
  },
  (previousProps, nextProps) =>
    previousProps.dotLayerStyle === nextProps.dotLayerStyle &&
    previousProps.handlePressTarget === nextProps.handlePressTarget &&
    previousProps.profilerCallback === nextProps.profilerCallback &&
    previousProps.restaurantLabelPinCollisionLayerKey ===
      nextProps.restaurantLabelPinCollisionLayerKey &&
    previousProps.restaurantLabelPinCollisionLayerId ===
      nextProps.restaurantLabelPinCollisionLayerId &&
    previousProps.restaurantLabelPinCollisionStyle === nextProps.restaurantLabelPinCollisionStyle
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
  cameraPadding: CameraPadding | null | undefined;
  isFollowingUser: boolean;
  markerSceneProps: SearchMapMarkerSceneProps | null;
  userLocationLayerProps: {
    featureCollection: FeatureCollection<Point>;
    accuracyRingFeatureCollection: FeatureCollection<Polygon> | null;
    visualSpec: UserLocationVisualSpec;
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

// Resident synthetic-marker layer for the feature-count degradation harness (#21).
// Subscribes to the scale-probe store; when markerCount>0 it mounts that many pins
// into ONE symbol layer with the cheapest worst-case topology (allow-overlap +
// ignore-placement so nothing is collision-culled, viewport-y for native stacking).
// Renders nothing when idle, so it is inert outside perf runs.
const SCALE_PROBE_LAYER_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: ['get', 'badgeImageId'] as unknown as string,
  iconSize: 1,
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
  iconAnchor: 'bottom',
  symbolZOrder: 'viewport-y',
} as unknown as MapboxGL.SymbolLayerStyle;

// Collision-ON variant: allowOverlap:false + ignorePlacement:false → symbols block
// each other and overlapping ones are draw-culled. Measures the "load many, show only
// the non-colliding subset" approach (everything loaded, most hidden at any view).
const SCALE_PROBE_LAYER_STYLE_COLLIDE: MapboxGL.SymbolLayerStyle = {
  iconImage: ['get', 'badgeImageId'] as unknown as string,
  iconSize: 1,
  iconAllowOverlap: false,
  iconIgnorePlacement: false,
  iconAnchor: 'bottom',
  symbolZOrder: 'viewport-y',
} as unknown as MapboxGL.SymbolLayerStyle;

// Perf scale-probe shadow. Real pins now render as native ViewAnnotations (no GL pin/shadow symbols),
// but this standalone probe keeps a shadow symbol so it can measure raw GL symbol-layer cost — it
// historically modeled the old GL pin's 2-symbol cost (pin + shared shadow).
const SCALE_PROBE_SHADOW_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_SHADOW_IMAGE_ID,
  iconSize: STYLE_PINS_SHADOW_ICON_SIZE,
  iconAnchor: 'bottom',
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
  iconOpacity: STYLE_PINS_SHADOW_OPACITY,
  symbolZOrder: 'viewport-y',
} as unknown as MapboxGL.SymbolLayerStyle;
const SCALE_PROBE_SHADOW_LAYER_ID = 'perf-scale-probe-shadow-layer';

const ScaleProbeLayer: React.FC = () => {
  const markerCount = usePerfScaleProbeStore((state) => state.markerCount);
  const centerLng = usePerfScaleProbeStore((state) => state.centerLng);
  const centerLat = usePerfScaleProbeStore((state) => state.centerLat);
  const spreadDeg = usePerfScaleProbeStore((state) => state.spreadDeg);
  const collide = usePerfScaleProbeStore((state) => state.collide);
  const generation = usePerfScaleProbeStore((state) => state.generation);

  const shape = React.useMemo(
    // `generation` bumps on every setProbe so identical params still re-emit.
    () => generateScaleProbeFeatures(markerCount, centerLng, centerLat, spreadDeg),
    [markerCount, centerLng, centerLat, spreadDeg, generation]
  );

  if (markerCount <= 0) {
    return null;
  }

  // collision OFF (in-view-pin case): shadow + pin, every symbol drawn, faithful
  // per-pin topology. collision ON: pin only — a second independent-collision shadow
  // layer would double placement cost and disagree on what to cull.
  const layers: React.ReactElement[] = [];
  if (!collide) {
    layers.push(
      <MapboxGL.SymbolLayer
        key="scale-probe-shadow"
        id={SCALE_PROBE_SHADOW_LAYER_ID}
        slot={undefined}
        sourceID={SCALE_PROBE_SOURCE_ID}
        style={SCALE_PROBE_SHADOW_STYLE}
      />
    );
  }
  layers.push(
    <MapboxGL.SymbolLayer
      key="scale-probe-pin"
      id={SCALE_PROBE_LAYER_ID}
      slot={undefined}
      sourceID={SCALE_PROBE_SOURCE_ID}
      style={collide ? SCALE_PROBE_LAYER_STYLE_COLLIDE : SCALE_PROBE_LAYER_STYLE}
    />
  );

  return (
    <MapboxGL.ShapeSource
      id={SCALE_PROBE_SOURCE_ID}
      shape={shape as unknown as FeatureCollection<Point, RestaurantFeatureProperties>}
    >
      {layers}
    </MapboxGL.ShapeSource>
  );
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
            // All pre-baked pin badge sprites (bucket × rank|score), each a
            // single 84px (3x) file → scale:3 renders at ~28pt with icon-size:1.
            ...PIN_BADGE_IMAGE_ENTRIES,
            // Pre-baked circle dot sprites (10 buckets + highlighted).
            ...DOT_IMAGE_ENTRIES,
          }}
        />
        {/*
          The camera is UNCONTROLLED for center/zoom/heading/pitch. Those used to
          be controlled props (centerCoordinate/zoomLevel/...), which made rnmapbox
          rebuild and re-apply a CameraStop carrying the LAST programmatic center
          whenever any sibling prop (padding/animation) changed — snapping the map
          back to the initial viewport the instant a gesture settled. `defaultSettings`
          positions the first frame only (applied once in native `_setInitialCamera`,
          never re-applied), and every programmatic move flows through the imperative
          path (CameraIntentArbiter -> native executor / cameraRef.setCamera), which
          also carries the animationCompletionId that drives onCameraAnimationComplete.
          User gestures own the camera and it stays where the user leaves it.
          `padding` stays controlled — a padding-only stop never carries a center, so
          it cannot snap the viewport. The animation props are PINNED to none/0:
          binding them to arbiter state made every commit recompute the declarative
          stop (new completionId), and that padding-only stop re-applied ~1 React
          commit after the imperative setCamera — CANCELLING the in-flight easeTo
          (camera froze ~150ms into every programmatic move, and stops pushed
          mid-gesture fought the user's pinch). Completion ids ride the imperative
          stops; onCameraAnimationComplete still receives them.
        */}
        <MapboxGL.Camera
          ref={cameraRef}
          nativeHostKey="search_map_camera"
          defaultSettings={{
            centerCoordinate: mapCenter ?? USA_FALLBACK_CENTER,
            zoomLevel: mapZoom ?? USA_FALLBACK_ZOOM,
          }}
          padding={cameraPadding ?? ZERO_CAMERA_PADDING}
          followUserLocation={isFollowingUser}
          followZoomLevel={13}
          followPitch={0}
          followHeading={0}
          animationMode="none"
          animationDuration={0}
          onCameraAnimationComplete={handleCameraAnimationComplete}
        />
        <React.Fragment>
          <MapboxGL.ShapeSource
            id={OVERLAY_Z_ANCHOR_SOURCE_ID}
            shape={EMPTY_POINT_FEATURES as FeatureCollection<Point, RestaurantFeatureProperties>}
          >
            <MapboxGL.SymbolLayer
              id={OVERLAY_Z_ANCHOR_LAYER_ID}
              sourceID={OVERLAY_Z_ANCHOR_SOURCE_ID}
              style={OVERLAY_Z_ANCHOR_STYLE}
            />
            {/* ATTR: no slot, no anchor = default-top placement (above everything) — avoids the
                  fragile aboveLayerID="continent-label" target-missing failure proven via gate0 */}
            <MapboxGL.SymbolLayer
              id={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
              slot={undefined}
              sourceID={OVERLAY_Z_ANCHOR_SOURCE_ID}
              style={OVERLAY_Z_ANCHOR_STYLE}
              belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
            />
            <MapboxGL.SymbolLayer
              id={SEARCH_PINS_Z_ANCHOR_LAYER_ID}
              slot={undefined}
              sourceID={OVERLAY_Z_ANCHOR_SOURCE_ID}
              style={OVERLAY_Z_ANCHOR_STYLE}
              belowLayerID={SEARCH_LABELS_Z_ANCHOR_LAYER_ID}
            />
          </MapboxGL.ShapeSource>
          {markerSceneProps ? <SearchMapMarkerScene {...markerSceneProps} /> : null}
          <ScaleProbeLayer />
          {userLocationLayerProps ? (
            <UserLocationLayers
              userLocationFeatureCollection={userLocationLayerProps.featureCollection}
              accuracyRingFeatureCollection={userLocationLayerProps.accuracyRingFeatureCollection}
              userLocationVisualSpec={userLocationLayerProps.visualSpec}
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
    areCameraPaddingEqual(previousProps.cameraPadding, nextProps.cameraPadding) &&
    previousProps.isFollowingUser === nextProps.isFollowingUser &&
    previousProps.markerSceneProps === nextProps.markerSceneProps &&
    previousProps.userLocationLayerProps === nextProps.userLocationLayerProps
);

export type RestaurantFeatureProperties = {
  restaurantId: string;
  restaurantName: string;
  craveScore: number;
  // High-precision Crave score (percentile_rank, 0..1) — the map RANKS by this so the badge == the
  // results-list position; craveScore (display, rounded to 1 decimal) is for the number/color only.
  craveScoreExact?: number | null;
  rising?: number | null;
  markerKey?: string;
  nativeLodZ?: number;
  nativeLodOpacity?: number;
  nativeLodRankOpacity?: number;
  nativeLabelOpacity?: number;
  nativeDotOpacity?: number;
  nativePresentationOpacity?: number;
  rank: number;
  /** Per-feature openness (open-now client derivation); null = no hours data. */
  isOpen?: boolean | null;
  // Pre-baked pin badge sprite id (rank in-viewport / score out-of-viewport),
  // chosen in the source builder and consumed by the pin layer's icon-image.
  badgeImageId?: string;
  // Active-color variant of the badge (same rank number) — the pin layer swaps to this when the marker is
  // highlighted (selected/pressed) so a tapped pin recolors to the active color while keeping its rank.
  activeBadgeImageId?: string;
  // Pre-baked circle-dot sprite id for this marker's score bucket (dot-b0..dot-b9),
  // chosen in the source builder and consumed by the dot layer's icon-image.
  dotImageId?: string;
  // True when the pin is inside the frozen overlap-allowed region. Drives the pin
  // layer split: in-region pins overlap freely (allowOverlap:true, ranked); out-of-
  // region pins collision-cull (allowOverlap:false, scored). Set in the source builder.
  inOverlapRegion?: boolean;
  // Stable per-frame ordering key for label placement tie-breaks.
  labelOrder?: number;
  // For pin SymbolLayer z-ordering: fixed slot index (0 = bottom ... 39 = top).
  lodZ?: number;
  restaurantCraveScore?: number | null;
  pinColor: string;
  labelCandidate?: LabelCandidate;
  labelPreference?: LabelCandidate;
  // RT-7: the group's representative location (the P5 anchor pick) — the visual sort and
  // the native ranking tiebreak on this so the representative wins the group's budget slot.
  isGroupRepresentative?: boolean;
  // World-camera L4: invisible-resident group sibling (out-of-searched-bounds market
  // location). In the catalog so selection can force-promote it; excluded from dot/label
  // presentation and from LOD rank promotion while unselected.
  isInvisibleResident?: boolean;
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

const ZERO_CAMERA_PADDING = { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 };
const DOT_SOURCE_ID = 'restaurant-dot-source';
const DOT_LAYER_ID = 'restaurant-dot-layer';

// Restored custom user-location marker (the "purple pulsing dot" from commit 07e8db25): a static
// shadow + static white ring + an INNER purple dot that pulses (scales 1.4→1.8→1.4). NOT the native
// LocationPuck (whose pulse is an OUTER expanding ring we explicitly don't want, and whose dot can't
// be recolored to purple). Driven by the resolved userLocation coordinate (passed in), so it still
// tracks location. No outer pulse ring.
const USER_LOCATION_SOURCE_ID = 'user-location-source';
const USER_LOCATION_SHADOW_LAYER_ID = 'user-location-shadow-layer';
const USER_LOCATION_RING_LAYER_ID = 'user-location-ring-layer';
const USER_LOCATION_DOT_LAYER_ID = 'user-location-dot-layer';
const USER_LOCATION_ACCURACY_SOURCE_ID = 'user-location-accuracy-source';
const USER_LOCATION_ACCURACY_FILL_LAYER_ID = 'user-location-accuracy-fill-layer';
const USER_LOCATION_ACCURACY_LINE_LAYER_ID = 'user-location-accuracy-line-layer';
const USER_LOCATION_PULSE_MIN_SCALE = 1.4;
const USER_LOCATION_PULSE_MAX_SCALE = 1.8;

// GPS accuracy ring: a geodesic n-gon approximating a circle of `radiusMeters` around the user's
// location. Rendered as a Fill+Line in GEO space (a real Polygon source), so unlike the pixel-radius
// CircleLayers of the puck it scales with zoom and represents the true horizontal-accuracy radius.
// 64 segments is visually smooth at any practical zoom while staying cheap (it rebuilds only when the
// coordinate or accuracy changes). Great-circle offset per vertex (handles latitude distortion).
const ACCURACY_RING_SEGMENTS = 64;
const EARTH_RADIUS_METERS = 6371008.8;

const buildAccuracyRingFeatureCollection = (
  lng: number,
  lat: number,
  radiusMeters: number,
  segments: number = ACCURACY_RING_SEGMENTS
): FeatureCollection<Polygon> => {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const cosAng = Math.cos(angularDistance);
  const sinAng = Math.sin(angularDistance);
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i += 1) {
    const bearing = (2 * Math.PI * i) / segments;
    const pointSinLat = sinLat * cosAng + cosLat * sinAng * Math.cos(bearing);
    const pointLatRad = Math.asin(pointSinLat);
    const pointLngRad =
      lngRad + Math.atan2(Math.sin(bearing) * sinAng * cosLat, cosAng - sinLat * pointSinLat);
    ring.push([(pointLngRad * 180) / Math.PI, (pointLatRad * 180) / Math.PI]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  };
};

type UserLocationVisualSpec = {
  dotRadius: number;
  ringRadius: number;
  shadowRadius: number;
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
  left.dotRadius === right.dotRadius &&
  left.ringRadius === right.ringRadius &&
  left.shadowRadius === right.shadowRadius &&
  left.shadowOpacity === right.shadowOpacity &&
  left.dotColor === right.dotColor &&
  left.ringColor === right.ringColor &&
  left.ringOpacity === right.ringOpacity &&
  left.dotOpacity === right.dotOpacity;

const UserLocationLayers = React.memo(
  function UserLocationLayers({
    userLocationFeatureCollection,
    accuracyRingFeatureCollection,
    userLocationVisualSpec,
    shouldAnimatePulse,
  }: {
    userLocationFeatureCollection: FeatureCollection<Point>;
    accuracyRingFeatureCollection: FeatureCollection<Polygon> | null;
    userLocationVisualSpec: UserLocationVisualSpec;
    shouldAnimatePulse: boolean;
  }) {
    const [pulseScale, setPulseScale] = React.useState(USER_LOCATION_PULSE_MIN_SCALE);

    React.useEffect(() => {
      if (!shouldAnimatePulse) {
        setPulseScale(USER_LOCATION_PULSE_MIN_SCALE);
        return;
      }
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
    }, [shouldAnimatePulse]);

    return (
      <>
        {accuracyRingFeatureCollection ? (
          <MapboxGL.ShapeSource
            id={USER_LOCATION_ACCURACY_SOURCE_ID}
            shape={accuracyRingFeatureCollection}
          >
            {/* Geo-space accuracy area: translucent fill + faint outline, BELOW the puck so the
                dot stays crisp on top. Scales with zoom (real Polygon), unlike the pixel puck. */}
            <MapboxGL.FillLayer
              id={USER_LOCATION_ACCURACY_FILL_LAYER_ID}
              slot={undefined}
              sourceID={USER_LOCATION_ACCURACY_SOURCE_ID}
              belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
              style={{
                fillColor: userLocationVisualSpec.dotColor,
                fillOpacity: 0.12,
              }}
            />
            <MapboxGL.LineLayer
              id={USER_LOCATION_ACCURACY_LINE_LAYER_ID}
              slot={undefined}
              sourceID={USER_LOCATION_ACCURACY_SOURCE_ID}
              belowLayerID={OVERLAY_Z_ANCHOR_LAYER_ID}
              style={{
                lineColor: userLocationVisualSpec.dotColor,
                lineWidth: 1.5,
                lineOpacity: 0.4,
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}
        <MapboxGL.ShapeSource id={USER_LOCATION_SOURCE_ID} shape={userLocationFeatureCollection}>
          <MapboxGL.CircleLayer
            id={USER_LOCATION_SHADOW_LAYER_ID}
            slot={undefined}
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
            slot={undefined}
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
            slot={undefined}
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
      </>
    );
  },
  (prev, next) =>
    prev.userLocationFeatureCollection === next.userLocationFeatureCollection &&
    prev.accuracyRingFeatureCollection === next.accuracyRingFeatureCollection &&
    areUserLocationVisualSpecsEqual(prev.userLocationVisualSpec, next.userLocationVisualSpec) &&
    prev.shouldAnimatePulse === next.shouldAnimatePulse
);
const DOT_TEXT_SIZE = 17;
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
// Full-pin-body obstacle layer that ONLY dots yield to (placed below the labels). See DOT_PIN_COLLISION_STYLE.
const RESTAURANT_PIN_DOT_COLLISION_LAYER_ID = 'restaurant-pin-dot-collision-layer';
export type LabelCandidate = 'bottom' | 'right' | 'top' | 'left';

// COLLISION-TWIN (R-5, owner label policy): the invisible collider. It carries the label text geometry
// through Mapbox placement (competes, gets culled, SUPPRESSES basemap under our labels) while the render
// layer above leaves the placement system entirely (allowOverlap+ignorePlacement) — so our visible labels
// SNAP on every collision-driven change (visibility = purely the __lea_revealed__/__lea_lod__ literals +
// the presentation ramp) and only ever FADE via our own LOD/presentation machinery. Basemap keeps its
// native placement fades. Opacity-0 symbols still place + collide + suppress (proven by the post-dismiss
// suppression defect), so the twin is a constant-invisible, always-competing stand-in.

const RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID = 'restaurant-labels-pin-collision';

// Dot glyphs render notably smaller than `DOT_TEXT_SIZE` due to font metrics/line-height.
// Keep the interaction target tight so it feels intentionally dot-sized (about ~2x visible dot).
const DOT_TAP_INTENT_RADIUS_PX = Math.max(7, DOT_TEXT_SIZE * 0.42);

export const buildLabelCandidateFeatureId = (markerKey: string, candidate: LabelCandidate) =>
  `${markerKey}::label::${candidate}`;

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
  // [box1-match-pin TEST 2026-06-27] no up-shift (was [0, PIN_COLLISION_OUTLINE_OFFSET_IMAGE_PX]).
  // Tip-aligned full silhouette ⇒ BOX 1 == the pin's own footprint (BOX 2). Restore the offset
  // const if labels regress (own-label cull). See PIN_COLLISION_OBSTACLE_GEOMETRY note above.
  iconOffset: [0, 0],
  symbolZOrder: 'source',
  // Always place the obstacle, even when pins overlap each other.
  iconAllowOverlap: true,
  // IMPORTANT: must be false so this layer reserves collision space for subsequent symbols.
  iconIgnorePlacement: false,
  iconPadding: 0,
  // Keep it invisible while still participating in placement.
  iconOpacity: 0.001,
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

// DOT-only collision obstacle: the FULL pin silhouette (outline sprite at scale 1.0, anchored at the pin
// coordinate), invisible + always-placed. Its layer sits BELOW the name-labels in the stack, so only the
// (lower-priority) coverage dots yield to it — the labels, placed first, never do. A neighbouring
// restaurant's dot that overlaps any part of the pin body is therefore collision-culled (#9), with zero
// effect on label placement. No up-offset / no side pads: cover the whole pin from tip to crown.
const DOT_PIN_COLLISION_STYLE: MapboxGL.SymbolLayerStyle = {
  iconImage: STYLE_PIN_OUTLINE_IMAGE_ID,
  iconSize: STYLE_PINS_OUTLINE_ICON_SIZE * PIN_DOT_COLLISION_OBSTACLE_SCALE,
  iconAnchor: 'bottom',
  symbolZOrder: 'source',
  iconAllowOverlap: true,
  iconIgnorePlacement: false,
  iconPadding: 0,
  iconOpacity: 0.001,
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
  dotTapIntentRadiusPx,
  isNativePressTargetingReady,
}: {
  nativeRenderOwnerInstanceId: string;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onBlankMapPress: () => void;
  visibleDotLayerId: string;
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
        ...(dotQueryBox ? { dotLayerIds: [visibleDotLayerId], dotQueryBox } : {}),
        ...(tapCoordinate ? { tapCoordinate } : {}),
      }),
    [visibleDotLayerId, nativeRenderOwnerInstanceId]
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
        setNativePressTargetingErrorMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      isCurrentConfig = false;
    };
  }, [
    visibleDotLayerId,
    dotTapIntentRadiusPx,
    isNativePressTargetingReady,
    nativePressOwnerEnabled,
    nativeRenderOwnerInstanceId,
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
    [dotTapIntentRadiusPx, commitRestaurantPressTarget, nativeRenderOwnerInstanceId]
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
  const shouldMountSearchMarkerLayers = !shouldDisableMarkers;
  const directPinSourceCount = directSourceFrameStores.pinSourceStore.idsInOrder.length;
  const directDotSourceCount = directSourceFrameStores.dotSourceStore.idsInOrder.length;
  const directLabelSourceCount = directSourceFrameStores.labelSourceStore.idsInOrder.length;
  const userLocationPuckProps = React.useMemo<{
    featureCollection: FeatureCollection<Point>;
    accuracyRingFeatureCollection: FeatureCollection<Polygon> | null;
    visualSpec: UserLocationVisualSpec;
    shouldAnimatePulse: boolean;
  } | null>(() => {
    if (!userLocation) {
      return null;
    }
    const snapshot = userLocationSnapshot;
    const isStale = snapshot?.isStale ?? true;
    // Show the GPS accuracy ring only when we have a real, finite, positive horizontal accuracy.
    // A tiny accuracy (good fix) renders sub-pixel and is effectively invisible; a large one
    // (coarse/reduced-accuracy fix) renders a big ring, which is the correct representation of the
    // uncertainty. No artificial cap — the ring should be truthful.
    const accuracyMeters = snapshot?.accuracyMeters;
    const accuracyRingFeatureCollection =
      typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters > 0
        ? buildAccuracyRingFeatureCollection(userLocation.lng, userLocation.lat, accuracyMeters)
        : null;
    return {
      featureCollection: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [userLocation.lng, userLocation.lat] },
          },
        ],
      },
      accuracyRingFeatureCollection,
      visualSpec: {
        dotRadius: 4.5,
        ringRadius: 11,
        shadowRadius: 16,
        shadowOpacity: isStale ? 0.22 : 0.4,
        dotColor: themeColors.secondaryAccent,
        ringColor: '#FFFFFF',
        ringOpacity: 1,
        dotOpacity: isStale ? 0.9 : 1,
      },
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
  // Single resident label RENDER layer id — kept only so native can force-hide it (labels render as
  // ViewAnnotations; the render layer never paints, but the collision-twin on the same source stays live).
  const labelCollisionLayerIds = React.useMemo(
    // Both invisible collision-obstacle layers must dorm/wake together on dismiss/reveal — the native
    // setLabelCollisionObstacleLayersVisible loop toggles only the ids in this list, so omitting the
    // dot-body obstacle left it permanently in Mapbox's placement pipeline while the surface is hidden.
    () => [RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID, RESTAURANT_PIN_DOT_COLLISION_LAYER_ID],
    []
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
    labelCollisionLayerIds,
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
    onToggleSettled: (payload) => {
      // UNIFIED-FADE TOGGLE (map-LOD-v6): deterministic, supersession-immune cover-lift resolver. The
      // native fade-in completion fires under the LATEST requestKey, so this always lands on the active
      // redraw transaction (latest-wins) — fixing the rapid-tap stuck cover where the per-batch
      // mounted_hidden gate was silently dropped for superseded intents. Keyed on the surface transaction
      // (not "search"), so favorites/polls inherit it. `degraded` lifts the cover anyway (never hang).
      getSearchSurfaceRuntime().markRedrawSettled(payload.requestKey, payload.degraded);
    },
    onMarkerExitStarted: presentationLifecyclePort?.handleMarkerExitStarted,
    onMarkerExitSettled: presentationLifecyclePort?.handleMarkerExitSettled,
    onViewportChanged: handleNativeViewportChangedFromOwner,
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
  // LAYER-LEVEL O(1) PRESENTATION (map-LOD-v6 rework): presentation opacity is no longer read per-feature
  // here — it is element [1] of the icon/text-opacity product below, a plain layer-level scalar (init 1)
  // that native swaps every fade-tick via setLayerPresentationOpacity (one setLayerProperty, NOT an O(N)
  // setFeatureState sweep). The uniform layer multiplier fades every dot + label together (pins fade in
  // lockstep via the pin ViewAnnotation alpha off the same presentation scalar). The nativePresentationOpacity
  // feature-state is fully retired.
  // REFINED LEA (Layer-Expression Authority — reparse-immune membership fallback) — the shared pattern
  // for the dot + label opacity expressions below. feature-state (the native wall-clock stepper) drives
  // the SMOOTH crossfade and wins the coalesce at rest and mid-fade. When feature-state is CLEARED —
  // which a geojson-vt tile reparse on every integer zoom step does — the coalesce falls through to the
  // MEMBERSHIP literal: native swaps it via setLayerProperty on each membership change
  // (updateLeaMembershipLiterals), so it is always the current promoted set and is itself reparse-immune
  // (it lives in the layer's paint expression, which a reparse re-evaluates unchanged). Literal starts
  // empty; native populates it on the first decide. (Pins are no longer GL-rendered — they're drawn as
  // native ViewAnnotations (PinVAView) — so there is no pin opacity expression here; only dots + labels use LEA.)
  // (GL label opacity/selector expressions deleted 2026-07-11 — labels are ViewAnnotations.)
  const nativeDotOpacityExpression = React.useMemo(
    // REFINED LEA fallback (see nativeLabelOpacityExpression), INVERSE of the pin: on reparse the dot
    // falls through to the membership literal: promoted → 0 (no dot under the pin), else → 1 (dot shows).
    // So a reparse can never paint a pin AND its dot at once. Native swaps the literal (sentinel `__lea_lod__`).
    () =>
      [
        'coalesce',
        ['feature-state', 'nativeDotOpacity'],
        ['case', ['in', ['get', 'markerKey'], ['literal', ['__lea_lod__']]], 0, 1],
      ] as const,
    []
  );
  const nativeHighlightedExpression = React.useMemo(
    () => ['==', ['coalesce', ['feature-state', 'nativeHighlighted'], 0], 1] as const,
    []
  );
  const dotLayerStyle = React.useMemo(() => {
    return {
      symbolZOrder: 'source',
      // Pre-baked circle ICON per score bucket (dot-b0..dot-b9), highlighted → dot-highlighted.
      // Replaces the old `●` TEXT glyph, whose rectangular bounding box was ~2.4× the visible dot
      // and taller-than-wide, so dots culled far apart and unevenly (diagonal worse than orthogonal).
      // The icon's collision box is a tight SQUARE ≈ the dot → uniform, much closer packing; and the
      // PNG renders 1:1 at @3x (icon-size 1) so the circle is pixel-perfect crisp (no glyph/SDF fuzz).
      iconImage: ['case', nativeHighlightedExpression, 'dot-highlighted', ['get', 'dotImageId']],
      // Pre-baked at @3x, registered at scale 3 → icon-size 1 renders at the native 8pt (ORIGINAL
      // size — do not shrink; dot count is a collision-PRIORITY problem, not a size problem).
      iconSize: 1,
      iconAnchor: 'center',
      // Dots COLLIDE (allowOverlap:false + ignorePlacement:false). The CORRECT behavior (matching the
      // old glyph dots): dots must SUPPRESS the native basemap street labels (win over them) and be
      // culled ONLY by our pins, our pin-labels, and each other — NOT by basemap labels. Basemap
      // labels must never show mid-search. The earlier ignorePlacement:true attempt was wrong (it let
      // basemap labels show during search). The real lever is collision PRIORITY/order vs the basemap
      // (under investigation); iconPadding is the dot-vs-dot gap, tuned once the collision box is
      // visualized.
      // COLLISION ON (2026-06-22): the whole overlay stack now sits above the basemap import (default-top
      // anchor, no slot), so dots are culled ONLY by our pins, our pin-labels, and each other — never by
      // basemap labels — and they suppress basemap labels in their own footprint. allowOverlap:false +
      // ignorePlacement:false is the correct steady state. (The earlier allowOverlap:true was a temporary
      // unblock from when we were still under the basemap labels at slot="top" and dots culled to ~0.)
      iconAllowOverlap: false,
      iconIgnorePlacement: false,
      // iconPadding 0 = the collision box is just the icon's own bounds (no extra gap). The box was
      // ~2× the visible dot mostly because of this padding; 0 shrinks it toward the circle. The box
      // can't go SMALLER than the icon bounds — if it's still bigger than the visible circle at 0, the
      // sprite has transparent border to crop (tighten generate-dot-sprites.js), not a padding issue.
      iconPadding: 0,
      // element [1] is the layer-level presentation scalar (init 1); native owns it via setLayerPresentationOpacity.
      iconOpacity: ['*', 1, nativeDotOpacityExpression],
      // No *OpacityTransition — the native stepper is the SOLE opacity animator (see the pin layer).
    } as unknown as MapboxGL.SymbolLayerStyle;
  }, [nativeHighlightedExpression, nativeDotOpacityExpression]);

  const restaurantLabelPinCollisionLayerId = RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID;
  const restaurantLabelPinCollisionLayerKey = `${restaurantLabelPinCollisionLayerId}-${PIN_COLLISION_OBSTACLE_GEOMETRY}`;
  const restaurantLabelPinCollisionStyle = React.useMemo(
    () =>
      PIN_COLLISION_OBSTACLE_GEOMETRY === 'fill'
        ? LABEL_PIN_COLLISION_STYLE_FILL
        : LABEL_PIN_COLLISION_STYLE,
    []
  );

  // Pin body/number/shadow rendering AND tap targeting moved to native ViewAnnotations
  // (PinVAView, tapped via overlayHitTest, in SearchMapRenderController.swift). The VA skins each pin
  // from the style sprite by `badgeImageId`/`activeBadgeImageId` (applyPinVASprite) and bakes the silhouette
  // shadow itself, so the GL pin SymbolLayer, shadow SymbolLayer, and tap-interaction CircleLayer were all
  // removed — no pin render or interaction layer remains in JS.

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

  const { handleMapPress, nativePressOwnerEnabled } = useSearchMapInteractionRuntime({
    nativeRenderOwnerInstanceId,
    onMarkerPress,
    onBlankMapPress: onPress,
    visibleDotLayerId: DOT_LAYER_ID,
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
            dotLayerStyle,
            handlePressTarget: handleMarkerScenePressTarget,
            profilerCallback,
            restaurantLabelPinCollisionLayerKey,
            restaurantLabelPinCollisionLayerId,
            restaurantLabelPinCollisionStyle,
          }
        : null,
    [
      dotLayerStyle,
      handleMarkerScenePressTarget,
      profilerCallback,
      restaurantLabelPinCollisionLayerId,
      restaurantLabelPinCollisionLayerKey,
      restaurantLabelPinCollisionStyle,
      shouldMountSearchMarkerLayers,
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
