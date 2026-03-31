import React from 'react';

import { type MapState as MapboxMapState } from '@rnmapbox/maps';

import { searchMapRenderController } from '../../runtime/map/search-map-render-controller';
import type { SearchRuntimeMapPresentationPhase } from '../../runtime/shared/search-runtime-bus';
import type { SearchMapSourceStore } from '../../runtime/map/search-map-source-store';
import { logger } from '../../../../utils';
import type { LabelCandidate } from './use-search-map-label-sources';

export type StickyLabelStateSnapshot = {
  revision: number;
  candidateByIdentity: ReadonlyMap<string, LabelCandidate>;
  dirtyIdentityKeys: ReadonlySet<string>;
};

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
  areStringArraysEqual: (left: string[], right: string[]) => boolean;
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
  stickyLabelState: StickyLabelStateSnapshot;
  isMapMoving: boolean;
  isMapMovingRef: React.MutableRefObject<boolean>;
  handleNativeViewportChanged: (state: MapboxMapState) => void;
  handleMapIdle: (state: MapboxMapState) => void;
  handleMapLoaded: () => void;
};

export const useSearchMapLabelObservation = ({
  styleURL,
  isMapStyleReady: _isMapStyleReady,
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
  areStringArraysEqual,
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
  const nativeManagedObservation =
    searchMapRenderController.platform === 'ios' ||
    searchMapRenderController.platform === 'android';
  const [settledVisibleLabelCount, setSettledVisibleLabelCount] = React.useState(0);
  const labelStickyRefreshSeqRef = React.useRef(0);
  const labelStickyRefreshTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelStickyRefreshInFlightRef = React.useRef(false);
  const labelStickyRefreshQueuedRef = React.useRef(false);
  const lastLoggedLabelPublishRef = React.useRef<{
    mapPresentationPhase: SearchRuntimeMapPresentationPhase;
    publishVisibleLabelFeatureIds: boolean;
    visibleLabelCount: number;
  } | null>(null);
  const [labelStickyMarkersReadyAt, setLabelStickyMarkersReadyAt] = React.useState<number | null>(
    null
  );
  const labelStickyMarkersReadyKeyRef = React.useRef<string | null>(null);
  const labelStickyResetRequestKeyRef = React.useRef<string | null>(null);
  const [stickyLabelState, setStickyLabelState] = React.useState<StickyLabelStateSnapshot>({
    revision: 0,
    candidateByIdentity: new Map(),
    dirtyIdentityKeys: new Set(),
  });
  const [isMapMoving, setIsMapMoving] = React.useState(false);
  const isMapMovingRef = React.useRef(false);
  const visibleLabelFeatureIdListRef = React.useRef<string[]>([]);
  const refreshReasonsRef = React.useRef<Set<string>>(new Set());
  const lastRefreshCompletedAtMsRef = React.useRef(0);
  const lastRefreshVisibleIdsChangedRef = React.useRef(true);
  const lastRefreshStickyChangedRef = React.useRef(true);
  const runStickyLabelRefreshRef = React.useRef<() => void>(() => undefined);
  const scheduleStickyLabelRefreshRef = React.useRef<(reason: string) => void>(() => undefined);
  const refreshStickyLabelCandidatesRef = React.useRef<(reasons?: string[]) => Promise<void>>(() =>
    Promise.resolve()
  );

  const applyObservationSnapshot = React.useCallback(
    (
      observation: {
        visibleLabelFeatureIds: string[];
        layerRenderedFeatureCount: number;
        effectiveRenderedFeatureCount: number;
        stickyRevision: number;
        stickyCandidates: Array<{ identityKey: string; candidate: string }>;
        dirtyStickyIdentityKeys: string[];
      },
      reasons: string[],
      isMovingAtStart: boolean
    ) => {
      const layerRenderedFeatures = observation.layerRenderedFeatureCount;
      const effectiveRenderedFeatures = observation.effectiveRenderedFeatureCount;
      const nextVisibleLabelFeatureIds = [...observation.visibleLabelFeatureIds].sort();
      const previousVisibleLabelFeatureIds = visibleLabelFeatureIdListRef.current;
      const visibleIdsChanged = !areStringArraysEqual(
        previousVisibleLabelFeatureIds,
        nextVisibleLabelFeatureIds
      );
      visibleLabelFeatureIdListRef.current = nextVisibleLabelFeatureIds;
      const nextStickyLabelState: StickyLabelStateSnapshot = {
        revision: observation.stickyRevision,
        candidateByIdentity: new Map(
          observation.stickyCandidates.flatMap(({ identityKey, candidate }) =>
            candidate === 'bottom' ||
            candidate === 'right' ||
            candidate === 'top' ||
            candidate === 'left'
              ? ([[identityKey, candidate]] as const)
              : []
          )
        ),
        dirtyIdentityKeys: new Set(observation.dirtyStickyIdentityKeys),
      };
      const previousLoggedState = lastLoggedLabelPublishRef.current;
      const shouldLogVisibilitySequence =
        previousLoggedState == null ||
        previousLoggedState.mapPresentationPhase !== mapPresentationPhase ||
        previousLoggedState.publishVisibleLabelFeatureIds !== publishVisibleLabelFeatureIds ||
        (!isMovingAtStart &&
          !isMapMovingRef.current &&
          (visibleIdsChanged ||
            previousLoggedState.visibleLabelCount !== nextVisibleLabelFeatureIds.length));
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
          isMovingAtStart,
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
      setStickyLabelState((previous) =>
        previous.revision === nextStickyLabelState.revision &&
        previous.candidateByIdentity.size === nextStickyLabelState.candidateByIdentity.size &&
        previous.dirtyIdentityKeys.size === nextStickyLabelState.dirtyIdentityKeys.size
          ? previous
          : nextStickyLabelState
      );
      lastRefreshCompletedAtMsRef.current = getNowMs();
      lastRefreshVisibleIdsChangedRef.current = visibleIdsChanged;
      lastRefreshStickyChangedRef.current = nextStickyLabelState.dirtyIdentityKeys.size > 0;
    },
    [
      areStringArraysEqual,
      getNowMs,
      labelResetRequestKey,
      mapPresentationPhase,
      publishVisibleLabelFeatureIds,
    ]
  );

  React.useEffect(() => {
    if (!shouldRenderLabels) {
      setLabelStickyMarkersReadyAt(null);
      labelStickyMarkersReadyKeyRef.current = null;
      labelStickyResetRequestKeyRef.current = null;
      return;
    }
  }, [shouldRenderLabels, styleURL]);

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
      if (labelStickyRefreshQueuedRef.current && nativeManagedObservation) {
        runStickyLabelRefreshRef.current();
        return;
      }
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
      if (nativeManagedObservation) {
        if (reason === 'camera_motion' || reason === 'map_idle') {
          return;
        }
        refreshReasonsRef.current.add(reason);
        labelStickyRefreshQueuedRef.current = true;
        if (labelStickyRefreshInFlightRef.current) {
          return;
        }
        runStickyLabelRefreshRef.current();
        return;
      }
      if (isMapMovingRef.current && reason === 'runtime_inputs_changed') {
        return;
      }
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
    if (isMapMoving) {
      return;
    }
    scheduleStickyLabelRefresh('runtime_inputs_changed');
  }, [
    allowLiveLabelUpdates,
    enableStickyLabelCandidates,
    isMapMoving,
    mapViewportSize.height,
    mapViewportSize.width,
    pinLabelInputKey,
    scheduleStickyLabelRefresh,
    shouldRenderLabels,
  ]);

  const refreshStickyLabelCandidates = React.useCallback(
    async (reasons: string[] = []) => {
      const refreshStartedAtMs = getNowMs();
      const isMovingAtStart = isMapMovingRef.current;
      if (shouldDisableMarkers || !shouldRenderLabels) {
        visibleLabelFeatureIdListRef.current = [];
        setSettledVisibleLabelCount((previous) => (previous === 0 ? previous : 0));
        return;
      }
      if (!allowLiveLabelUpdates) {
        return;
      }
      if (mapViewportSize.width <= 0 || mapViewportSize.height <= 0) {
        return;
      }

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
          allowFallback: shouldRunFallbackQuery,
          commitInteractionVisibility: publishVisibleLabelFeatureIds,
          refreshMsIdle: labelStickyRefreshMsIdle,
          refreshMsMoving: labelStickyRefreshMsMoving,
          enableStickyLabelCandidates,
          stickyLockStableMsMoving: labelStickyLockStableMsMoving,
          stickyLockStableMsIdle: labelStickyLockStableMsIdle,
          stickyUnlockMissingMsMoving: labelStickyUnlockMissingMsMoving,
          stickyUnlockMissingMsIdle: labelStickyUnlockMissingMsIdle,
          stickyUnlockMissingStreakMoving: labelStickyUnlockMissingStreakMoving,
          labelResetRequestKey,
        });
      } catch {
        return;
      }
      const queryDurationMs = getNowMs() - queryStartedAtMs;
      applyObservationSnapshot(observation, reasons, isMovingAtStart);
      const refreshDurationMs = getNowMs() - refreshStartedAtMs;
      recordRuntimeAttribution('map_label_refresh_query', queryDurationMs);
      recordRuntimeAttribution('map_label_refresh_total', refreshDurationMs);
    },
    [
      allowLiveLabelUpdates,
      applyObservationSnapshot,
      enableStickyLabelCandidates,
      getNowMs,
      labelStickyRefreshMsIdle,
      labelStickyRefreshMsMoving,
      labelStickyLockStableMsIdle,
      labelStickyLockStableMsMoving,
      labelStickyUnlockMissingMsIdle,
      labelStickyUnlockMissingMsMoving,
      labelStickyUnlockMissingStreakMoving,
      labelResetRequestKey,
      mapViewportSize.height,
      mapViewportSize.width,
      nativeRenderOwnerInstanceId,
      publishVisibleLabelFeatureIds,
      recordRuntimeAttribution,
      shouldDisableMarkers,
      shouldRenderLabels,
    ]
  );
  refreshStickyLabelCandidatesRef.current = refreshStickyLabelCandidates;

  React.useEffect(() => {
    if (!nativeManagedObservation) {
      return;
    }
    const removeListener = searchMapRenderController.addListener((event) => {
      if (event.type !== 'label_observation_updated') {
        return;
      }
      if (event.instanceId !== nativeRenderOwnerInstanceId) {
        return;
      }
      if (!allowLiveLabelUpdates || shouldDisableMarkers || !shouldRenderLabels) {
        return;
      }
      applyObservationSnapshot(event, ['native_event'], isMapMovingRef.current);
    });
    return () => {
      removeListener?.();
    };
  }, [
    allowLiveLabelUpdates,
    applyObservationSnapshot,
    nativeManagedObservation,
    nativeRenderOwnerInstanceId,
    shouldDisableMarkers,
    shouldRenderLabels,
  ]);

  const handleNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      if (!isMapMovingRef.current) {
        isMapMovingRef.current = true;
        setIsMapMoving(true);
      }
      if (
        !nativeManagedObservation &&
        allowLiveLabelUpdates &&
        enableStickyLabelCandidates &&
        shouldRenderLabels
      ) {
        scheduleStickyLabelRefresh('camera_motion');
      }
      onNativeViewportChanged(state);
    },
    [
      allowLiveLabelUpdates,
      enableStickyLabelCandidates,
      nativeManagedObservation,
      onNativeViewportChanged,
      scheduleStickyLabelRefresh,
      shouldRenderLabels,
    ]
  );

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      if (isMapMovingRef.current) {
        isMapMovingRef.current = false;
        setIsMapMoving(false);
      }
      if (!allowLiveLabelUpdates) {
        onMapIdle(state);
        return;
      }
      if (nativeManagedObservation) {
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
    [allowLiveLabelUpdates, nativeManagedObservation, onMapIdle]
  );

  const handleMapLoaded = React.useCallback(() => {
    onMapLoaded();
    if (!allowLiveLabelUpdates) {
      return;
    }
    try {
      scheduleStickyLabelRefresh('map_loaded');
    } catch {
      // noop
    }
  }, [allowLiveLabelUpdates, onMapLoaded, scheduleStickyLabelRefresh]);

  React.useEffect(() => {
    if (!shouldRenderLabels || !labelResetRequestKey) {
      return;
    }
    scheduleStickyLabelRefresh('label_reset_request_changed');
    if (labelStickyResetRequestKeyRef.current === labelResetRequestKey) {
      return;
    }
    labelStickyResetRequestKeyRef.current = labelResetRequestKey;
    setStickyLabelState((previous) => ({
      revision: previous.revision + 1,
      candidateByIdentity: new Map(),
      dirtyIdentityKeys: new Set(previous.candidateByIdentity.keys()),
    }));
  }, [
    enableStickyLabelCandidates,
    labelResetRequestKey,
    scheduleStickyLabelRefresh,
    shouldRenderLabels,
    styleURL,
  ]);

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
    stickyLabelState,
    isMapMoving,
    isMapMovingRef,
    handleNativeViewportChanged,
    handleMapIdle,
    handleMapLoaded,
  };
};
