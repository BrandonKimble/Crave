import React from 'react';
import type { Feature, Point } from 'geojson';

import type { MapBounds } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import { buildMarkerRenderModel } from '../../utils/map-render-model';
import type { MapQueryBudget } from './map-query-budget';
import {
  type MapMotionPressureController,
  resolveMapPlannerAdmission,
} from './map-motion-pressure';

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
  mapMotionPressureController: MapMotionPressureController;
  isMapMoving: boolean;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  mapQueryBudget: MapQueryBudget;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, durationMs: number) => void;
  maxPins: number;
  visibleCandidateBuffer: number;
  promoteStableMsMoving: number;
  demoteStableMsMoving: number;
  stableMsIdle: number;
  offscreenStableMsMoving: number;
};

type LodPinnedMarkerMeta = { markerKey: string; lodZ: number };

type PlannerInvocationSnapshot = {
  searchMode: UseMapDiffApplierArgs['searchMode'];
  activeTab: UseMapDiffApplierArgs['activeTab'];
  selectedRestaurantId: string | null;
  scoreMode: UseMapDiffApplierArgs['scoreMode'];
  isMapMoving: boolean;
  bounds: {
    northEastLat: number;
    northEastLng: number;
    southWestLat: number;
    southWestLng: number;
  };
  rankedCandidates: readonly Feature<Point, RestaurantFeatureProperties>[];
  markerCandidates: readonly Feature<Point, RestaurantFeatureProperties>[];
  pinnedKey: string;
};

const captureMapBoundsSnapshot = (bounds: MapBounds): PlannerInvocationSnapshot['bounds'] => ({
  northEastLat: bounds.northEast.lat,
  northEastLng: bounds.northEast.lng,
  southWestLat: bounds.southWest.lat,
  southWestLng: bounds.southWest.lng,
});

const areBoundsSnapshotsMateriallyEqual = (
  left: PlannerInvocationSnapshot['bounds'],
  right: PlannerInvocationSnapshot['bounds']
): boolean =>
  left.northEastLat === right.northEastLat &&
  left.northEastLng === right.northEastLng &&
  left.southWestLat === right.southWestLat &&
  left.southWestLng === right.southWestLng;

const hasMaterialLodPlannerInputChange = ({
  previousInvocation,
  nextInvocation,
}: {
  previousInvocation: PlannerInvocationSnapshot | null;
  nextInvocation: PlannerInvocationSnapshot;
}): boolean =>
  previousInvocation == null ||
  previousInvocation.searchMode !== nextInvocation.searchMode ||
  previousInvocation.activeTab !== nextInvocation.activeTab ||
  previousInvocation.selectedRestaurantId !== nextInvocation.selectedRestaurantId ||
  previousInvocation.scoreMode !== nextInvocation.scoreMode ||
  previousInvocation.isMapMoving !== nextInvocation.isMapMoving ||
  !areBoundsSnapshotsMateriallyEqual(previousInvocation.bounds, nextInvocation.bounds) ||
  previousInvocation.rankedCandidates !== nextInvocation.rankedCandidates ||
  previousInvocation.markerCandidates !== nextInvocation.markerCandidates ||
  previousInvocation.pinnedKey !== nextInvocation.pinnedKey;

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
    mapMotionPressureController,
    isMapMoving,
    buildMarkerKey,
    mapQueryBudget,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxPins,
    visibleCandidateBuffer,
    promoteStableMsMoving,
    demoteStableMsMoving,
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
  const lastPlannerInvocationRef = React.useRef<PlannerInvocationSnapshot | null>(null);

  React.useEffect(() => {
    lodContextRef.current = { searchMode, activeTab, selectedRestaurantId };
  }, [activeTab, searchMode, selectedRestaurantId]);

  React.useEffect(() => {
    const resetKey = `${searchMode ?? 'none'}::${activeTab}::${scoreMode}`;
    if (lodPinnedResetKeyRef.current === resetKey) {
      return;
    }
    lodPinnedResetKeyRef.current = resetKey;
    lodPinnedKeyRef.current = '';
    lastPlannerInvocationRef.current = null;
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
        lastPlannerInvocationRef.current = null;
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
        lastPlannerInvocationRef.current = null;
        return;
      }

      const lastPlannerInvocation = lastPlannerInvocationRef.current;
      const nowMs = Date.now();
      const nextPlannerInvocation: PlannerInvocationSnapshot = {
        searchMode: context.searchMode,
        activeTab: context.activeTab,
        selectedRestaurantId: selectedId,
        scoreMode,
        isMapMoving,
        bounds: captureMapBoundsSnapshot(bounds),
        rankedCandidates,
        markerCandidates: markerCandidatesRef.current,
        pinnedKey: lodPinnedKeyRef.current,
      };
      const plannerAdmission = resolveMapPlannerAdmission({
        hasMaterialChange: hasMaterialLodPlannerInputChange({
          previousInvocation: lastPlannerInvocation,
          nextInvocation: nextPlannerInvocation,
        }),
        pressureState: mapMotionPressureController.getState(),
        nowMs,
        workClass: 'lod_pins',
      });
      mapMotionPressureController.applyNormalWorkEffect(plannerAdmission.normalWorkEffect, nowMs);
      if (plannerAdmission.decision !== 'run_now') {
        return;
      }

      const promoteStableMs = isMapMoving ? promoteStableMsMoving : stableMsIdle;
      const demoteStableMs = isMapMoving ? demoteStableMsMoving : stableMsIdle;
      const offscreenDemoteStableMs = isMapMoving ? offscreenStableMsMoving : 0;
      lastPlannerInvocationRef.current = nextPlannerInvocation;
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
        promoteStableMs,
        demoteStableMs,
        offscreenDemoteStableMs,
        nowMs,
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
        if (lastPlannerInvocationRef.current) {
          lastPlannerInvocationRef.current.pinnedKey = nextKey;
        }
        return;
      }

      const mapDiffApplyStartMs = getPerfNow();
      lodPinnedKeyRef.current = nextKey;
      if (lastPlannerInvocationRef.current) {
        lastPlannerInvocationRef.current.pinnedKey = nextKey;
      }
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
      isMapMoving,
      logSearchCompute,
      mapMotionPressureController,
      mapQueryBudget,
      markerCandidatesRef,
      maxPins,
      offscreenStableMsMoving,
      promoteStableMsMoving,
      demoteStableMsMoving,
      shouldLogSearchComputes,
      shortcutCoverageRankedRef,
      stableMsIdle,
      visibleCandidateBuffer,
    ]
  );

  return {
    lodPinnedMarkerMeta,
    lodPinnedMarkersRef,
    recomputeLodPinnedMarkers,
  };
};
