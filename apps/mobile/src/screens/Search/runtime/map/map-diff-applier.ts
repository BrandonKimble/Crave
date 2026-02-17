import React from 'react';
import type { Feature, Point } from 'geojson';

import type { MapBounds } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import { buildMarkerRenderModel } from '../../utils/map-render-model';
import type { MapQueryBudget } from './map-query-budget';

type UseMapDiffApplierArgs = {
  searchMode: 'shortcut' | 'natural' | 'entity' | null;
  activeTab: 'dishes' | 'restaurants';
  selectedRestaurantId: string | null;
  scoreMode: 'coverage_display' | 'global_quality';
  markerCandidatesRef: React.MutableRefObject<Array<Feature<Point, RestaurantFeatureProperties>>>;
  shortcutCoverageRankedRef: React.MutableRefObject<
    Array<Feature<Point, RestaurantFeatureProperties>>
  >;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  mapQueryBudget: MapQueryBudget;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, durationMs: number) => void;
  maxPins: number;
  visibleCandidateBuffer: number;
  stableMsMoving: number;
  stableMsIdle: number;
  offscreenStableMsMoving: number;
};

type LodPinnedMarkerMeta = { markerKey: string; lodZ: number };

type UseMapDiffApplierResult = {
  lodPinnedMarkerMeta: LodPinnedMarkerMeta[];
  lodPinnedMarkersRef: React.MutableRefObject<Array<Feature<Point, RestaurantFeatureProperties>>>;
  recomputeLodPinnedMarkers: (bounds: MapBounds | null) => void;
};

export const useMapDiffApplier = (args: UseMapDiffApplierArgs): UseMapDiffApplierResult => {
  const {
    searchMode,
    activeTab,
    selectedRestaurantId,
    scoreMode,
    markerCandidatesRef,
    shortcutCoverageRankedRef,
    mapGestureActiveRef,
    buildMarkerKey,
    mapQueryBudget,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxPins,
    visibleCandidateBuffer,
    stableMsMoving,
    stableMsIdle,
    offscreenStableMsMoving,
  } = args;

  const [lodPinnedMarkerMeta, setLodPinnedMarkerMeta] = React.useState<LodPinnedMarkerMeta[]>([]);
  const lodPinnedMarkersRef = React.useRef<Array<Feature<Point, RestaurantFeatureProperties>>>([]);
  const lodPinnedKeyRef = React.useRef<string>('');
  const lodPinProposedPromoteSinceByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const lodPinProposedDemoteSinceByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const lodPinnedResetKeyRef = React.useRef<string>('');
  const lodContextRef = React.useRef({ searchMode, activeTab, selectedRestaurantId });

  React.useEffect(() => {
    lodContextRef.current = { searchMode, activeTab, selectedRestaurantId };
  }, [activeTab, searchMode, selectedRestaurantId]);

  React.useEffect(() => {
    // Keep LOD pin state stable across request id churn; reset only on true mode/style pivots.
    const resetKey = `${searchMode ?? 'none'}::${activeTab}::${scoreMode}`;
    if (lodPinnedResetKeyRef.current === resetKey) {
      return;
    }
    lodPinnedResetKeyRef.current = resetKey;
    lodPinnedKeyRef.current = '';
    lodPinProposedPromoteSinceByMarkerKeyRef.current.clear();
    lodPinProposedDemoteSinceByMarkerKeyRef.current.clear();
  }, [activeTab, scoreMode, searchMode]);

  const recomputeLodPinnedMarkers = React.useCallback(
    (bounds: MapBounds | null) => {
      const start = shouldLogSearchComputes ? getPerfNow() : 0;
      if (!bounds) {
        if (lodPinnedKeyRef.current !== '') {
          lodPinnedKeyRef.current = '';
          lodPinnedMarkersRef.current = [];
          setLodPinnedMarkerMeta([]);
        }
        return;
      }

      const context = lodContextRef.current;
      const rankedCandidates =
        context.searchMode === 'shortcut'
          ? shortcutCoverageRankedRef.current
          : markerCandidatesRef.current;
      const selectedId = context.selectedRestaurantId;
      const selectedRestaurantCandidates = selectedId
        ? [...markerCandidatesRef.current, ...rankedCandidates]
        : rankedCandidates;

      if (!rankedCandidates.length && !selectedRestaurantCandidates.length) {
        if (lodPinnedKeyRef.current !== '') {
          lodPinnedKeyRef.current = '';
          lodPinnedMarkersRef.current = [];
          setLodPinnedMarkerMeta([]);
        }
        return;
      }

      const stableMs = mapGestureActiveRef.current ? stableMsMoving : stableMsIdle;
      const offscreenStableMs = mapGestureActiveRef.current ? offscreenStableMsMoving : 0;
      const now = Date.now();
      const readModelBuildStartMs = getPerfNow();
      const nextModel = buildMarkerRenderModel({
        bounds,
        rankedCandidates,
        selectedRestaurantCandidates,
        currentPinnedMarkers: lodPinnedMarkersRef.current,
        selectedRestaurantId: selectedId,
        buildMarkerKey,
        maxPins,
        visibleCandidateBuffer,
        stableMs,
        offscreenStableMs,
        nowMs: now,
        proposedPromoteSinceByMarkerKey: lodPinProposedPromoteSinceByMarkerKeyRef.current,
        proposedDemoteSinceByMarkerKey: lodPinProposedDemoteSinceByMarkerKeyRef.current,
      });
      const markerFeatureDerivationDurationMs = getPerfNow() - readModelBuildStartMs;
      mapQueryBudget.recordReadModelBuildSliceDurationMs(markerFeatureDerivationDurationMs);
      mapQueryBudget.recordRuntimeAttributionDurationMs(
        'marker_feature_derivation',
        markerFeatureDerivationDurationMs
      );

      lodPinProposedPromoteSinceByMarkerKeyRef.current =
        nextModel.nextProposedPromoteSinceByMarkerKey;
      lodPinProposedDemoteSinceByMarkerKeyRef.current =
        nextModel.nextProposedDemoteSinceByMarkerKey;

      const nextKey = nextModel.nextPinnedKey;
      if (nextKey === lodPinnedKeyRef.current) {
        return;
      }

      const mapDiffApplyStartMs = getPerfNow();
      lodPinnedKeyRef.current = nextKey;
      lodPinnedMarkersRef.current = nextModel.nextPinnedMarkers;
      setLodPinnedMarkerMeta(nextModel.nextPinnedMeta);
      mapQueryBudget.recordMapDiffApplySliceDurationMs(getPerfNow() - mapDiffApplyStartMs);

      if (shouldLogSearchComputes) {
        logSearchCompute(
          `lodPinnedMarkers pins=${nextModel.nextPinnedMarkers.length}`,
          getPerfNow() - start
        );
      }
    },
    [
      buildMarkerKey,
      getPerfNow,
      logSearchCompute,
      mapGestureActiveRef,
      mapQueryBudget,
      markerCandidatesRef,
      maxPins,
      offscreenStableMsMoving,
      shouldLogSearchComputes,
      shortcutCoverageRankedRef,
      stableMsIdle,
      stableMsMoving,
      visibleCandidateBuffer,
    ]
  );

  return {
    lodPinnedMarkerMeta,
    lodPinnedMarkersRef,
    recomputeLodPinnedMarkers,
  };
};
