import React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import type { Feature, Point } from 'geojson';
import { type MapState as MapboxMapState } from '@rnmapbox/maps';

import type { RestaurantFeatureProperties } from '../search-map';
import type { SearchMapSourceStore } from '../../runtime/map/search-map-source-store';
import type { SearchRuntimeMapPresentationPhase } from '../../runtime/shared/search-runtime-bus';
import { useSearchMapLabelSources, type LabelCandidate } from './use-search-map-label-sources';
import { useSearchMapLabelObservation } from './use-search-map-label-observation';

export type SearchMapLabelRuntime = {
  collisionSourceStore: SearchMapSourceStore;
  nativeLabelSourceStore: SearchMapSourceStore;
  settledVisibleLabelCount: number;
  handleMapViewportLayout: (event: LayoutChangeEvent) => void;
  handleNativeViewportChanged: (state: MapboxMapState) => void;
  handleMapIdle: (state: MapboxMapState) => void;
  handleMapLoaded: () => void;
};

export const useSearchMapLabelRuntime = ({
  styleURL,
  isMapStyleReady,
  shouldDisableMarkers,
  shouldRenderLabels,
  allowLiveLabelUpdates,
  publishVisibleLabelFeatureIds,
  pinFeaturesForDerivedSources,
  mapPresentationPhase,
  labelResetRequestKey,
  nativeRenderOwnerInstanceId,
  isNativeOwnedMarkerRuntimeReady,
  restaurantLabelSourceId,
  buildLabelCandidateFeatureId,
  buildLabelStickyIdentityKey,
  getLabelStickyIdentityKeyFromFeature,
  areStringArraysEqual,
  labelLayerIdsByCandidate,
  enableStickyLabelCandidates,
  labelStickyRefreshMsIdle,
  labelStickyRefreshMsMoving,
  labelStickyLockStableMsMoving,
  labelStickyLockStableMsIdle,
  labelStickyUnlockMissingMsMoving,
  labelStickyUnlockMissingMsIdle,
  labelStickyUnlockMissingStreakMoving,
  recordRuntimeAttribution,
  getNowMs,
  onNativeViewportChanged,
  onMapIdle,
  onMapLoaded,
}: {
  styleURL: string;
  isMapStyleReady: boolean;
  shouldDisableMarkers: boolean;
  shouldRenderLabels: boolean;
  allowLiveLabelUpdates: boolean;
  publishVisibleLabelFeatureIds: boolean;
  pinFeaturesForDerivedSources: SearchMapSourceStore;
  mapPresentationPhase: SearchRuntimeMapPresentationPhase;
  labelResetRequestKey: string | null;
  nativeRenderOwnerInstanceId: string;
  isNativeOwnedMarkerRuntimeReady: boolean;
  restaurantLabelSourceId: string;
  buildLabelCandidateFeatureId: (markerKey: string, candidate: LabelCandidate) => string;
  buildLabelStickyIdentityKey: (
    restaurantId: string | null,
    markerKey: string | null
  ) => string | null;
  getLabelStickyIdentityKeyFromFeature: (
    feature: Feature<Point, RestaurantFeatureProperties>
  ) => string | null;
  areStringArraysEqual: (left: string[], right: string[]) => boolean;
  labelLayerIdsByCandidate: Record<LabelCandidate, string>;
  enableStickyLabelCandidates: boolean;
  labelStickyRefreshMsIdle: number;
  labelStickyRefreshMsMoving: number;
  labelStickyLockStableMsMoving: number;
  labelStickyLockStableMsIdle: number;
  labelStickyUnlockMissingMsMoving: number;
  labelStickyUnlockMissingMsIdle: number;
  labelStickyUnlockMissingStreakMoving: number;
  recordRuntimeAttribution: (contributor: string, durationMs: number) => void;
  getNowMs: () => number;
  onNativeViewportChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
}): SearchMapLabelRuntime => {
  const [mapViewportSize, setMapViewportSize] = React.useState({ width: 0, height: 0 });
  const pinLabelInputKey = React.useMemo(() => {
    const featureIds = pinFeaturesForDerivedSources.idsInOrder;
    if (!featureIds.length) {
      return 'pins:0';
    }
    let identity = `pins:${featureIds.length}:`;
    for (let index = 0; index < featureIds.length; index += 1) {
      identity += `${index > 0 ? ',' : ''}${featureIds[index]}`;
    }
    return identity;
  }, [pinFeaturesForDerivedSources]);

  const {
    settledVisibleLabelCount,
    labelStickyCandidateByMarkerKeyRef,
    labelStickyEpoch,
    isMapMovingRef,
    handleNativeViewportChanged,
    handleMapIdle,
    handleMapLoaded,
  } = useSearchMapLabelObservation({
    styleURL,
    isMapStyleReady,
    shouldDisableMarkers,
    shouldRenderLabels,
    allowLiveLabelUpdates,
    publishVisibleLabelFeatureIds,
    pinFeaturesForDerivedSources,
    mapViewportSize,
    mapPresentationPhase,
    nativeRenderOwnerInstanceId,
    isNativeOwnedMarkerRuntimeReady,
    restaurantLabelSourceId,
    buildLabelStickyIdentityKey,
    areStringArraysEqual,
    labelLayerIdsByCandidate,
    enableStickyLabelCandidates,
    labelStickyRefreshMsIdle,
    labelStickyRefreshMsMoving,
    labelStickyLockStableMsMoving,
    labelStickyLockStableMsIdle,
    labelStickyUnlockMissingMsMoving,
    labelStickyUnlockMissingMsIdle,
    labelStickyUnlockMissingStreakMoving,
    labelResetRequestKey,
    recordRuntimeAttribution,
    getNowMs,
    onNativeViewportChanged,
    onMapIdle,
    onMapLoaded,
    pinLabelInputKey,
  });

  const { collisionSourceStore, nativeLabelSourceStore } = useSearchMapLabelSources({
    pinFeaturesForDerivedSources,
    getNowMs,
    recordRuntimeAttribution,
    allowLiveLabelUpdates,
    enableStickyLabelCandidates,
    getLabelStickyIdentityKeyFromFeature,
    buildLabelCandidateFeatureId,
    labelStickyCandidateByMarkerKeyRef,
    labelStickyEpoch,
    isMapMovingRef,
  });

  const handleMapViewportLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMapViewportSize((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height }
    );
  }, []);

  return {
    collisionSourceStore,
    nativeLabelSourceStore,
    settledVisibleLabelCount,
    handleMapViewportLayout,
    handleNativeViewportChanged,
    handleMapIdle,
    handleMapLoaded,
  };
};
