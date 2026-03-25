import React from 'react';

import { type MapState as MapboxMapState } from '@rnmapbox/maps';

import { searchMapRenderController } from '../../runtime/map/search-map-render-controller';
import {
  buildViewportMotionToken,
  decideMotionDerivation,
} from '../../runtime/map/map-motion-budget';
import type { SearchRuntimeMapPresentationPhase } from '../../runtime/shared/search-runtime-bus';
import type { SearchMapSourceStore } from '../../runtime/map/search-map-source-store';
import type { MapBounds } from '../../../../types';
import { logger } from '../../../../utils';
import type { LabelCandidate } from './use-search-map-label-sources';

type LabelStickyRuntime = {
  styleURL: string;
  isMapStyleReady: boolean;
  shouldDisableMarkers: boolean;
  shouldRenderLabels: boolean;
  viewport: { width: number; height: number };
  markerCount: number;
};

export type LabelPublishDiagContext = {
  refreshSeq: number | null;
  reasons: string[];
  isMovingAtStart: boolean;
  isMovingAtEnd: boolean;
  visibleIdsChanged: boolean;
  publishVisibleLabelFeatureIds: boolean;
  effectiveRenderedFeatures: number;
  layerRenderedFeatures: number;
} | null;

type UseSearchMapLabelObservationArgs = {
  styleURL: string;
  isMapStyleReady: boolean;
  shouldDisableMarkers: boolean;
  shouldRenderLabels: boolean;
  allowLiveLabelUpdates: boolean;
  publishVisibleLabelFeatureIds: boolean;
  pinFeaturesForDerivedSources: SearchMapSourceStore;
  mapViewportSize: { width: number; height: number };
  mapPresentationPhase: SearchRuntimeMapPresentationPhase;
  nativeRenderOwnerInstanceId: string;
  isNativeOwnedMarkerRuntimeReady: boolean;
  restaurantLabelSourceId: string;
  buildLabelStickyIdentityKey: (
    restaurantId: string | null,
    markerKey: string | null
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
  labelResetRequestKey: string | null;
  recordRuntimeAttribution: (contributor: string, durationMs: number) => void;
  getNowMs: () => number;
  onNativeViewportChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  pinLabelInputKey: string;
};

type UseSearchMapLabelObservationResult = {
  settledVisibleLabelCount: number;
  labelPublishDiagContextRef: React.MutableRefObject<LabelPublishDiagContext>;
  labelStickyCandidateByMarkerKeyRef: React.MutableRefObject<Map<string, LabelCandidate>>;
  labelStickyEpoch: number;
  isMapMovingRef: React.MutableRefObject<boolean>;
  handleNativeViewportChanged: (state: MapboxMapState) => void;
  handleMapIdle: (state: MapboxMapState) => void;
  handleMapLoaded: () => void;
};

const getBoundsFromMapState = (state: MapboxMapState): MapBounds | null => {
  const properties = state.properties as unknown as
    | {
        bounds?: {
          ne?: [number, number];
          sw?: [number, number];
        };
      }
    | undefined;
  const northEast = properties?.bounds?.ne;
  const southWest = properties?.bounds?.sw;
  if (
    !Array.isArray(northEast) ||
    !Array.isArray(southWest) ||
    northEast.length < 2 ||
    southWest.length < 2
  ) {
    return null;
  }
  return {
    northEast: {
      lat: northEast[1],
      lng: northEast[0],
    },
    southWest: {
      lat: southWest[1],
      lng: southWest[0],
    },
  };
};

const getZoomFromMapState = (state: MapboxMapState): number | null => {
  const properties = state.properties as { zoom?: number } | undefined;
  return typeof properties?.zoom === 'number' && Number.isFinite(properties.zoom)
    ? properties.zoom
    : null;
};

export const useSearchMapLabelObservation = ({
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
}: UseSearchMapLabelObservationArgs): UseSearchMapLabelObservationResult => {
  const [settledVisibleLabelCount, setSettledVisibleLabelCount] = React.useState(0);
  const labelStickyRefreshSeqRef = React.useRef(0);
  const labelStickyRefreshTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelStickyRefreshInFlightRef = React.useRef(false);
  const labelStickyRefreshQueuedRef = React.useRef(false);
  const labelPublishDiagContextRef = React.useRef<LabelPublishDiagContext>(null);
  const lastLoggedLabelPublishRef = React.useRef<{
    mapPresentationPhase: SearchRuntimeMapPresentationPhase;
    publishVisibleLabelFeatureIds: boolean;
    visibleLabelCount: number;
  } | null>(null);
  const labelStickyCandidateByMarkerKeyRef = React.useRef<Map<string, LabelCandidate>>(new Map());
  const labelStickyLastSeenAtByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const labelStickyMissingStreakByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const labelStickyProposedCandidateByMarkerKeyRef = React.useRef<Map<string, LabelCandidate>>(
    new Map()
  );
  const labelStickyProposedSinceAtByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const labelStickyRuntimeRef = React.useRef<LabelStickyRuntime>({
    styleURL,
    isMapStyleReady,
    shouldDisableMarkers,
    shouldRenderLabels,
    viewport: { width: 0, height: 0 },
    markerCount: 0,
  });
  const [labelStickyMarkersReadyAt, setLabelStickyMarkersReadyAt] = React.useState<number | null>(
    null
  );
  const labelStickyMarkersReadyKeyRef = React.useRef<string | null>(null);
  const labelStickyResetRequestKeyRef = React.useRef<string | null>(null);
  const [labelStickyEpoch, setLabelStickyEpoch] = React.useState(0);
  const isMapMovingRef = React.useRef(false);
  const visibleLabelFeatureIdListRef = React.useRef<string[]>([]);
  const refreshReasonsRef = React.useRef<Set<string>>(new Set());
  const lastRefreshCompletedAtMsRef = React.useRef(0);
  const lastRefreshVisibleIdsChangedRef = React.useRef(true);
  const lastRefreshStickyChangedRef = React.useRef(true);
  const labelRefreshDiagSeqRef = React.useRef(0);
  const lastMovingCameraRefreshRef = React.useRef<{
    token: ReturnType<typeof buildViewportMotionToken>;
    runAtMs: number;
  }>({
    token: null,
    runAtMs: 0,
  });
  const labelRefreshInputRef = React.useRef({
    styleURL,
    isMapStyleReady,
    shouldDisableMarkers,
    shouldRenderLabels,
    viewportWidth: 0,
    viewportHeight: 0,
    pinCount: 0,
    labelCandidateCount: 0,
    isMoving: false,
    markersReady: false,
  });
  const runStickyLabelRefreshRef = React.useRef<() => void>(() => undefined);
  const scheduleStickyLabelRefreshRef = React.useRef<(reason: string) => void>(() => undefined);
  const refreshStickyLabelCandidatesRef = React.useRef<(reasons?: string[]) => Promise<void>>(() =>
    Promise.resolve()
  );

  React.useEffect(() => {
    if (!shouldRenderLabels) {
      setLabelStickyMarkersReadyAt(null);
      labelStickyMarkersReadyKeyRef.current = null;
      labelStickyResetRequestKeyRef.current = null;
      return;
    }
  }, [shouldRenderLabels, styleURL]);

  labelStickyRuntimeRef.current = {
    styleURL,
    isMapStyleReady,
    shouldDisableMarkers,
    shouldRenderLabels,
    viewport: { width: mapViewportSize.width, height: mapViewportSize.height },
    markerCount: pinFeaturesForDerivedSources.idsInOrder.length,
  };

  React.useEffect(() => {
    if (!enableStickyLabelCandidates) {
      return;
    }
    if (!shouldRenderLabels) {
      setLabelStickyMarkersReadyAt(null);
      labelStickyMarkersReadyKeyRef.current = null;
      return;
    }
    const latchKey = `${styleURL}:${nativeRenderOwnerInstanceId}`;
    if (labelStickyMarkersReadyKeyRef.current !== latchKey) {
      labelStickyMarkersReadyKeyRef.current = latchKey;
      setLabelStickyMarkersReadyAt(null);
    }
    if (!isNativeOwnedMarkerRuntimeReady) {
      return;
    }
    if (mapViewportSize.width <= 0 || mapViewportSize.height <= 0) {
      return;
    }
    if (pinFeaturesForDerivedSources.idsInOrder.length === 0) {
      setLabelStickyMarkersReadyAt(Date.now());
      return;
    }
    let isActive = true;
    void searchMapRenderController
      .querySourceMembership({
        instanceId: nativeRenderOwnerInstanceId,
        sourceId: restaurantLabelSourceId,
      })
      .then((membership) => {
        if (!isActive) {
          return;
        }
        if (membership.featureIds.length > 0) {
          setLabelStickyMarkersReadyAt((previous) => previous ?? Date.now());
        }
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, [
    enableStickyLabelCandidates,
    isNativeOwnedMarkerRuntimeReady,
    mapViewportSize.height,
    mapViewportSize.width,
    nativeRenderOwnerInstanceId,
    pinFeaturesForDerivedSources.idsInOrder.length,
    restaurantLabelSourceId,
    shouldRenderLabels,
    styleURL,
  ]);

  labelRefreshInputRef.current = {
    styleURL,
    isMapStyleReady,
    shouldDisableMarkers,
    shouldRenderLabels,
    viewportWidth: mapViewportSize.width,
    viewportHeight: mapViewportSize.height,
    pinCount: pinFeaturesForDerivedSources.idsInOrder.length,
    labelCandidateCount: 0,
    isMoving: isMapMovingRef.current,
    markersReady: labelStickyMarkersReadyAt != null,
  };

  const runStickyLabelRefresh = React.useCallback(() => {
    if (labelStickyRefreshInFlightRef.current || !labelStickyRefreshQueuedRef.current) {
      return;
    }

    const reasons = Array.from(refreshReasonsRef.current);
    refreshReasonsRef.current.clear();
    labelStickyRefreshQueuedRef.current = false;
    labelStickyRefreshInFlightRef.current = true;
    const refreshSeq = ++labelStickyRefreshSeqRef.current;

    void refreshStickyLabelCandidatesRef.current(reasons).finally(() => {
      if (refreshSeq !== labelStickyRefreshSeqRef.current) {
        return;
      }
      labelStickyRefreshInFlightRef.current = false;
      if (labelStickyRefreshQueuedRef.current && !labelStickyRefreshTimeoutRef.current) {
        const delayMs = isMapMovingRef.current
          ? labelStickyRefreshMsMoving
          : labelStickyRefreshMsIdle;
        labelStickyRefreshTimeoutRef.current = setTimeout(() => {
          labelStickyRefreshTimeoutRef.current = null;
          runStickyLabelRefreshRef.current();
        }, delayMs);
      }
    });
  }, [labelStickyRefreshMsIdle, labelStickyRefreshMsMoving]);
  runStickyLabelRefreshRef.current = runStickyLabelRefresh;

  const scheduleStickyLabelRefresh = React.useCallback(
    (reason: string) => {
      if (
        reason === 'runtime_inputs_changed' &&
        isMapMovingRef.current &&
        !lastRefreshVisibleIdsChangedRef.current &&
        !lastRefreshStickyChangedRef.current &&
        getNowMs() - lastRefreshCompletedAtMsRef.current < labelStickyRefreshMsMoving
      ) {
        return;
      }
      refreshReasonsRef.current.add(reason);
      labelStickyRefreshQueuedRef.current = true;
      const delayMs = isMapMovingRef.current
        ? labelStickyRefreshMsMoving
        : labelStickyRefreshMsIdle;
      if (labelStickyRefreshTimeoutRef.current || labelStickyRefreshInFlightRef.current) {
        return;
      }
      labelStickyRefreshTimeoutRef.current = setTimeout(() => {
        labelStickyRefreshTimeoutRef.current = null;
        runStickyLabelRefreshRef.current();
      }, delayMs);
    },
    [getNowMs, labelStickyRefreshMsIdle, labelStickyRefreshMsMoving]
  );
  scheduleStickyLabelRefreshRef.current = scheduleStickyLabelRefresh;

  React.useEffect(() => {
    if (!enableStickyLabelCandidates || !shouldRenderLabels || !labelStickyMarkersReadyAt) {
      return;
    }
    if (!allowLiveLabelUpdates) {
      return;
    }
    if (labelStickyRefreshTimeoutRef.current) {
      clearTimeout(labelStickyRefreshTimeoutRef.current);
      labelStickyRefreshTimeoutRef.current = null;
    }
    refreshReasonsRef.current.add('markers_ready');
    labelStickyRefreshQueuedRef.current = true;
    runStickyLabelRefreshRef.current();
  }, [
    allowLiveLabelUpdates,
    enableStickyLabelCandidates,
    labelStickyMarkersReadyAt,
    shouldRenderLabels,
  ]);

  React.useEffect(() => {
    if (!enableStickyLabelCandidates || !shouldRenderLabels) {
      return;
    }
    if (!allowLiveLabelUpdates) {
      return;
    }
    if (mapViewportSize.width <= 0 || mapViewportSize.height <= 0) {
      return;
    }
    scheduleStickyLabelRefresh('runtime_inputs_changed');
  }, [
    allowLiveLabelUpdates,
    enableStickyLabelCandidates,
    mapViewportSize.height,
    mapViewportSize.width,
    pinLabelInputKey,
    scheduleStickyLabelRefresh,
    shouldRenderLabels,
  ]);

  const refreshStickyLabelCandidates = React.useCallback(
    async (reasons: string[] = []) => {
      const refreshStartedAtMs = getNowMs();
      const refreshSeq = ++labelRefreshDiagSeqRef.current;
      const refreshInputAtStart = { ...labelRefreshInputRef.current };
      const runtime = labelStickyRuntimeRef.current;
      if (runtime.shouldDisableMarkers || !runtime.shouldRenderLabels) {
        visibleLabelFeatureIdListRef.current = [];
        if (publishVisibleLabelFeatureIds) {
          setSettledVisibleLabelCount((previous) => (previous === 0 ? previous : 0));
        }
        return;
      }
      if (!allowLiveLabelUpdates) {
        return;
      }
      if (runtime.viewport.width <= 0 || runtime.viewport.height <= 0) {
        return;
      }

      const now = Date.now();
      const layerIDs = Object.values(labelLayerIdsByCandidate);
      const shouldRunFallbackQuery =
        !isMapMovingRef.current ||
        reasons.includes('map_idle') ||
        reasons.includes('markers_ready') ||
        reasons.includes('map_loaded');
      const queryStartedAtMs = getNowMs();
      let observation;
      try {
        observation = await searchMapRenderController.queryRenderedLabelObservation({
          instanceId: nativeRenderOwnerInstanceId,
          layerIds: layerIDs,
          allowFallback: shouldRunFallbackQuery,
          commitInteractionVisibility: publishVisibleLabelFeatureIds,
        });
      } catch {
        return;
      }
      const queryDurationMs = getNowMs() - queryStartedAtMs;

      const layerRenderedFeatures = observation.layerRenderedFeatureCount;
      const effectiveRenderedFeatures = observation.effectiveRenderedFeatureCount;
      const nextVisibleLabelFeatureIds = [...observation.visibleLabelFeatureIds].sort();
      const renderedCandidateByStickyIdentityKey = new Map<string, LabelCandidate>();
      for (const placedLabel of observation.placedLabels) {
        const candidate = placedLabel.candidate;
        if (
          candidate !== 'bottom' &&
          candidate !== 'right' &&
          candidate !== 'top' &&
          candidate !== 'left'
        ) {
          continue;
        }
        const stickyIdentityKey = buildLabelStickyIdentityKey(
          placedLabel.restaurantId,
          placedLabel.markerKey
        );
        if (!stickyIdentityKey || renderedCandidateByStickyIdentityKey.has(stickyIdentityKey)) {
          continue;
        }
        renderedCandidateByStickyIdentityKey.set(stickyIdentityKey, candidate);
      }
      const previousVisibleLabelFeatureIds = visibleLabelFeatureIdListRef.current;
      const visibleIdsChanged = !areStringArraysEqual(
        previousVisibleLabelFeatureIds,
        nextVisibleLabelFeatureIds
      );
      labelPublishDiagContextRef.current = {
        refreshSeq,
        reasons,
        isMovingAtStart: refreshInputAtStart.isMoving,
        isMovingAtEnd: isMapMovingRef.current,
        visibleIdsChanged,
        publishVisibleLabelFeatureIds,
        effectiveRenderedFeatures,
        layerRenderedFeatures,
      };
      visibleLabelFeatureIdListRef.current = nextVisibleLabelFeatureIds;
      const previousLoggedState = lastLoggedLabelPublishRef.current;
      const shouldLogVisibilitySequence =
        visibleIdsChanged ||
        previousLoggedState == null ||
        previousLoggedState.mapPresentationPhase !== mapPresentationPhase ||
        previousLoggedState.publishVisibleLabelFeatureIds !== publishVisibleLabelFeatureIds ||
        previousLoggedState.visibleLabelCount !== nextVisibleLabelFeatureIds.length;
      if (shouldLogVisibilitySequence) {
        logger.info('[LABEL-VIS-SEQ] publish', {
          mapPresentationPhase,
          publishVisibleLabelFeatureIds,
          previousVisibleLabelCount: previousVisibleLabelFeatureIds.length,
          nextVisibleLabelCount: nextVisibleLabelFeatureIds.length,
          visibleIdsChanged,
          reasons,
          layerRenderedFeatures,
          effectiveRenderedFeatures,
          isMovingAtStart: refreshInputAtStart.isMoving,
          isMovingAtEnd: isMapMovingRef.current,
          labelResetRequestKey,
        });
      }
      lastLoggedLabelPublishRef.current = {
        mapPresentationPhase,
        publishVisibleLabelFeatureIds,
        visibleLabelCount: nextVisibleLabelFeatureIds.length,
      };
      if (publishVisibleLabelFeatureIds) {
        setSettledVisibleLabelCount((previous) =>
          previous === nextVisibleLabelFeatureIds.length
            ? previous
            : nextVisibleLabelFeatureIds.length
        );
      }

      if (!enableStickyLabelCandidates) {
        return;
      }

      const stickyMap = labelStickyCandidateByMarkerKeyRef.current;
      const lastSeenAt = labelStickyLastSeenAtByMarkerKeyRef.current;
      const missingStreak = labelStickyMissingStreakByMarkerKeyRef.current;
      const proposedCandidate = labelStickyProposedCandidateByMarkerKeyRef.current;
      const proposedSinceAt = labelStickyProposedSinceAtByMarkerKeyRef.current;
      let didChange = false;

      for (const [stickyIdentityKey, candidate] of renderedCandidateByStickyIdentityKey) {
        lastSeenAt.set(stickyIdentityKey, now);
        missingStreak.set(stickyIdentityKey, 0);
        const locked = stickyMap.get(stickyIdentityKey);
        if (locked === candidate) {
          proposedCandidate.delete(stickyIdentityKey);
          proposedSinceAt.delete(stickyIdentityKey);
          continue;
        }

        const stableMs = isMapMovingRef.current
          ? labelStickyLockStableMsMoving
          : labelStickyLockStableMsIdle;
        const proposed = proposedCandidate.get(stickyIdentityKey);
        if (proposed !== candidate) {
          proposedCandidate.set(stickyIdentityKey, candidate);
          proposedSinceAt.set(stickyIdentityKey, now);
          continue;
        }
        const sinceAt = proposedSinceAt.get(stickyIdentityKey) ?? now;
        if (now - sinceAt < stableMs) {
          continue;
        }

        stickyMap.set(stickyIdentityKey, candidate);
        proposedCandidate.delete(stickyIdentityKey);
        proposedSinceAt.delete(stickyIdentityKey);
        didChange = true;
      }

      if (effectiveRenderedFeatures > 0) {
        const unlockMs = isMapMovingRef.current
          ? labelStickyUnlockMissingMsMoving
          : labelStickyUnlockMissingMsIdle;
        const requiredStreak = isMapMovingRef.current ? labelStickyUnlockMissingStreakMoving : 1;
        for (const stickyIdentityKey of stickyMap.keys()) {
          if (renderedCandidateByStickyIdentityKey.has(stickyIdentityKey)) {
            continue;
          }
          const nextStreak = (missingStreak.get(stickyIdentityKey) ?? 0) + 1;
          missingStreak.set(stickyIdentityKey, nextStreak);
          const seenAt = lastSeenAt.get(stickyIdentityKey) ?? 0;
          if (nextStreak >= requiredStreak && now - seenAt > unlockMs) {
            stickyMap.delete(stickyIdentityKey);
            proposedCandidate.delete(stickyIdentityKey);
            proposedSinceAt.delete(stickyIdentityKey);
            missingStreak.delete(stickyIdentityKey);
            didChange = true;
          }
        }
      }

      if (didChange) {
        setLabelStickyEpoch((value) => value + 1);
      }
      const refreshDurationMs = getNowMs() - refreshStartedAtMs;
      lastRefreshCompletedAtMsRef.current = getNowMs();
      lastRefreshVisibleIdsChangedRef.current = visibleIdsChanged;
      lastRefreshStickyChangedRef.current = didChange;
      recordRuntimeAttribution('map_label_refresh_query', queryDurationMs);
      recordRuntimeAttribution('map_label_refresh_total', refreshDurationMs);
    },
    [
      allowLiveLabelUpdates,
      areStringArraysEqual,
      buildLabelStickyIdentityKey,
      enableStickyLabelCandidates,
      getNowMs,
      labelLayerIdsByCandidate,
      labelStickyLockStableMsIdle,
      labelStickyLockStableMsMoving,
      labelStickyUnlockMissingMsIdle,
      labelStickyUnlockMissingMsMoving,
      labelStickyUnlockMissingStreakMoving,
      nativeRenderOwnerInstanceId,
      publishVisibleLabelFeatureIds,
      recordRuntimeAttribution,
    ]
  );
  refreshStickyLabelCandidatesRef.current = refreshStickyLabelCandidates;

  const handleNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      isMapMovingRef.current = true;
      if (allowLiveLabelUpdates && shouldRenderLabels) {
        const nowMs = getNowMs();
        const motionDecision = decideMotionDerivation({
          budgetClass: 'moving',
          previousToken: lastMovingCameraRefreshRef.current.token,
          nextToken: buildViewportMotionToken({
            bounds: getBoundsFromMapState(state),
            budgetClass: 'moving',
            zoom: getZoomFromMapState(state),
          }),
          lastRunAtMs: lastMovingCameraRefreshRef.current.runAtMs,
          nowMs,
          minIntervalMs: labelStickyRefreshMsMoving,
        });
        if (motionDecision.shouldRun) {
          lastMovingCameraRefreshRef.current = {
            token: motionDecision.token,
            runAtMs: nowMs,
          };
          scheduleStickyLabelRefreshRef.current('camera_motion');
        }
      }
      onNativeViewportChanged(state);
    },
    [
      allowLiveLabelUpdates,
      getNowMs,
      labelStickyRefreshMsMoving,
      onNativeViewportChanged,
      shouldRenderLabels,
    ]
  );

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      isMapMovingRef.current = false;
      lastMovingCameraRefreshRef.current = {
        token: buildViewportMotionToken({
          bounds: getBoundsFromMapState(state),
          budgetClass: 'settled',
          zoom: getZoomFromMapState(state),
        }),
        runAtMs: getNowMs(),
      };
      if (!allowLiveLabelUpdates) {
        onMapIdle(state);
        return;
      }
      if (labelStickyRefreshTimeoutRef.current) {
        clearTimeout(labelStickyRefreshTimeoutRef.current);
        labelStickyRefreshTimeoutRef.current = null;
      }
      refreshReasonsRef.current.add('map_idle');
      labelStickyRefreshQueuedRef.current = true;
      runStickyLabelRefreshRef.current();
      onMapIdle(state);
    },
    [allowLiveLabelUpdates, getNowMs, onMapIdle]
  );

  const handleMapLoaded = React.useCallback(() => {
    onMapLoaded();
    if (!allowLiveLabelUpdates) {
      return;
    }
    try {
      refreshReasonsRef.current.add('map_loaded');
      labelStickyRefreshQueuedRef.current = true;
      runStickyLabelRefreshRef.current();
    } catch {
      // noop
    }
  }, [allowLiveLabelUpdates, onMapLoaded]);

  React.useEffect(() => {
    if (!enableStickyLabelCandidates) {
      return;
    }
    if (!shouldRenderLabels) {
      return;
    }
    if (!labelResetRequestKey) {
      return;
    }
    if (labelStickyResetRequestKeyRef.current === labelResetRequestKey) {
      return;
    }
    labelStickyResetRequestKeyRef.current = labelResetRequestKey;
    labelStickyCandidateByMarkerKeyRef.current.clear();
    labelStickyLastSeenAtByMarkerKeyRef.current.clear();
    labelStickyMissingStreakByMarkerKeyRef.current.clear();
    labelStickyProposedCandidateByMarkerKeyRef.current.clear();
    labelStickyProposedSinceAtByMarkerKeyRef.current.clear();
    setLabelStickyEpoch((value) => value + 1);
  }, [enableStickyLabelCandidates, labelResetRequestKey, shouldRenderLabels, styleURL]);

  React.useEffect(
    () => () => {
      if (labelStickyRefreshTimeoutRef.current) {
        clearTimeout(labelStickyRefreshTimeoutRef.current);
      }
    },
    []
  );

  return {
    settledVisibleLabelCount,
    labelPublishDiagContextRef,
    labelStickyCandidateByMarkerKeyRef,
    labelStickyEpoch,
    isMapMovingRef,
    handleNativeViewportChanged,
    handleMapIdle,
    handleMapLoaded,
  };
};
