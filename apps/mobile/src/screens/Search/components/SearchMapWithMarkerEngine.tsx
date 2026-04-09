import React from 'react';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';
import type { Feature, FeatureCollection, Point } from 'geojson';

import type { StartupLocationSnapshot } from '../../../navigation/runtime/MainLaunchCoordinator';
import type { Coordinate, MapBounds, RestaurantResult } from '../../../types';
import { useMapMarkerEngine } from '../hooks/use-map-marker-engine';
import type { MapQueryBudget } from '../runtime/map/map-query-budget';
import {
  type MapMotionPressureController,
  type MapSnapshotPresentationPolicy,
  type SearchMapPresentationScene,
} from '../runtime/map/map-presentation-runtime-contract';
import type { MotionPressureState } from '../runtime/map/map-motion-pressure';
import type { ResolvedRestaurantMapLocation } from '../runtime/map/restaurant-location-selection';
import {
  derivePreparedPresentationSnapshotKey,
  type SearchRuntimeBus,
  isSearchRuntimeMapPresentationPending,
  useSearchBus,
} from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';
import {
  createSearchMapSourceTransportFeature,
  createSearchMapSourceStoreBuilder,
  getSearchMapSourceTransportFeature,
  type SearchMapSourceStore,
  EMPTY_SEARCH_MAP_SOURCE_STORE,
} from '../runtime/map/search-map-source-store';
import { mapStateBoundsToMapBounds } from '../utils/geo';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import { areResultsPresentationReadModelsEqual } from '../runtime/shared/results-presentation-runtime-contract';
import {
  areSearchMapRenderPresentationStatesEqual,
  deriveSearchMapRenderPresentationPhase,
  deriveSearchMapRenderPresentationRequestKey,
  type SearchMapRenderInteractionMode,
  type SearchMapRenderPresentationState,
} from '../runtime/map/search-map-render-controller';
import SearchMap, {
  type MapboxMapRef,
  buildLabelCandidateFeatureId,
  type RestaurantFeatureProperties,
} from './search-map';

type MarkerProfileActions = {
  openRestaurantProfilePreview: (
    restaurantId: string,
    restaurantName: string,
    options?: {
      pressedCoordinate?: Coordinate | null;
      forceMiddleSnap?: boolean;
    }
  ) => void;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    options?: {
      pressedCoordinate?: Coordinate | null;
      forceMiddleSnap?: boolean;
      source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card';
    }
  ) => void;
};

type ShortcutCoverageFeatureProps = {
  restaurantId?: string;
  restaurantName?: string;
};

type MapPresentationMountedSourceCounts = {
  pinCount: number;
  dotCount: number;
  labelCount: number;
};

type MapPresentationSceneSnapshot<TScene> = {
  snapshotKey: string | null;
  scene: TScene;
};

type MapPresentationSceneControllerResult<TScene> = {
  activeSceneSnapshot: MapPresentationSceneSnapshot<TScene>;
  isSceneSnapshotFrozen: boolean;
};

type MapPresentationSourceUpdateGate = {
  shouldAllowPreparedSourceUpdates: boolean;
  shouldCapturePreparedScene: boolean;
};

type LabelCandidate = 'bottom' | 'right' | 'top' | 'left';
const LABEL_CANDIDATES_IN_ORDER: readonly LabelCandidate[] = ['bottom', 'right', 'top', 'left'];

type LabelFeatureRecord = {
  featureId: string;
  feature: Feature<Point, RestaurantFeatureProperties>;
  semanticRevision: string;
  transportFeature: ReturnType<typeof createSearchMapSourceTransportFeature>;
};

type DerivedSourceStoreResult = {
  store: SearchMapSourceStore;
  recordsByMarkerKey: Map<string, LabelFeatureRecord[]>;
};

const buildLabelSourceFeatureDiffKey = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  extraKey: string
): string => `${extraKey}:${getSearchMapSourceTransportFeature(feature).diffKey}`;

const buildStableLabelBaseFeature = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  markerKey: string
): Feature<Point, RestaurantFeatureProperties> => {
  const stableProperties = { ...feature.properties };
  delete stableProperties.nativeLodZ;
  delete stableProperties.nativeLodOpacity;
  delete stableProperties.nativeLodRankOpacity;
  delete stableProperties.nativeLabelOpacity;
  delete stableProperties.nativeDotOpacity;
  delete stableProperties.nativePresentationOpacity;
  delete stableProperties.labelOrder;
  delete stableProperties.lodZ;
  return {
    type: 'Feature',
    id: markerKey,
    geometry: feature.geometry,
    properties: {
      ...stableProperties,
      markerKey,
    },
  } satisfies Feature<Point, RestaurantFeatureProperties>;
};

const buildStableCollisionFeature = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  markerKey: string
): Feature<Point, RestaurantFeatureProperties> =>
  ({
    type: 'Feature',
    id: markerKey,
    geometry: feature.geometry,
    properties: {
      markerKey,
      restaurantId: feature.properties.restaurantId,
    } as RestaurantFeatureProperties,
  } satisfies Feature<Point, RestaurantFeatureProperties>);

const buildNativeLabelProperties = (
  properties: RestaurantFeatureProperties
): RestaurantFeatureProperties => {
  const nativeLabelProperties = { ...properties };
  return nativeLabelProperties;
};

const areLabelFeatureRecordsEqual = (
  left: readonly LabelFeatureRecord[],
  right: readonly LabelFeatureRecord[]
): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index]?.featureId !== right[index]?.featureId ||
      left[index]?.semanticRevision !== right[index]?.semanticRevision
    ) {
      return false;
    }
  }
  return true;
};

const useSearchMapLabelSources = ({
  pinFeaturesForDerivedSources,
  sceneSnapshotKey,
  getNowMs,
  recordRuntimeAttribution,
  allowLabelSourceUpdates,
  buildLabelCandidateFeatureId,
}: {
  pinFeaturesForDerivedSources: SearchMapSourceStore;
  sceneSnapshotKey: string | null;
  getNowMs: () => number;
  recordRuntimeAttribution: (contributor: string, durationMs: number) => void;
  allowLabelSourceUpdates: boolean;
  buildLabelCandidateFeatureId: (markerKey: string, candidate: LabelCandidate) => string;
}): {
  collisionSourceStore: SearchMapSourceStore;
  nativeLabelSourceStore: SearchMapSourceStore;
  derivedLabelSourceIdentityKey: string;
} => {
  const collisionSourceStoreRef = React.useRef<SearchMapSourceStore>(EMPTY_SEARCH_MAP_SOURCE_STORE);
  const labelCandidateSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const nativeLabelSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const collisionIdentityKeyRef = React.useRef('');
  const labelMarkerIdentityKeyRef = React.useRef('');
  const nativeLabelIdentityKeyRef = React.useRef('');
  const previousPinSemanticRevisionByMarkerKeyRef = React.useRef<Map<string, string>>(new Map());
  const collisionRecordByMarkerKeyRef = React.useRef<Map<string, LabelFeatureRecord[]>>(new Map());
  const labelCandidateRecordsByMarkerKeyRef = React.useRef<Map<string, LabelFeatureRecord[]>>(
    new Map()
  );
  const nativeLabelRecordsByMarkerKeyRef = React.useRef<Map<string, LabelFeatureRecord[]>>(
    new Map()
  );
  const pinFeatureIdsInOrder = pinFeaturesForDerivedSources.idsInOrder;
  const snapshotScopeKey = sceneSnapshotKey ?? 'no_snapshot';

  const { dirtyPinMarkerKeys, nextPinSemanticRevisionByMarkerKey } = React.useMemo(() => {
    const nextDirtyMarkerKeys = new Set<string>();
    const previousSemanticRevisionByMarkerKey = previousPinSemanticRevisionByMarkerKeyRef.current;
    const nextSemanticRevisionByMarkerKey = new Map<string, string>();
    for (const markerKey of pinFeatureIdsInOrder) {
      const semanticRevision = pinFeaturesForDerivedSources.semanticRevisionById.get(markerKey);
      if (!semanticRevision) {
        continue;
      }
      nextSemanticRevisionByMarkerKey.set(markerKey, semanticRevision);
      if (previousSemanticRevisionByMarkerKey.get(markerKey) !== semanticRevision) {
        nextDirtyMarkerKeys.add(markerKey);
      }
    }
    previousSemanticRevisionByMarkerKey.forEach((_, markerKey) => {
      if (!nextSemanticRevisionByMarkerKey.has(markerKey)) {
        nextDirtyMarkerKeys.add(markerKey);
      }
    });
    return {
      dirtyPinMarkerKeys: nextDirtyMarkerKeys,
      nextPinSemanticRevisionByMarkerKey: nextSemanticRevisionByMarkerKey,
    };
  }, [pinFeatureIdsInOrder, pinFeaturesForDerivedSources.semanticRevisionById]);

  React.useEffect(() => {
    previousPinSemanticRevisionByMarkerKeyRef.current = nextPinSemanticRevisionByMarkerKey;
  }, [nextPinSemanticRevisionByMarkerKey]);

  const buildOrderedRecords = React.useCallback(
    (
      recordsByMarkerKey: ReadonlyMap<string, readonly LabelFeatureRecord[]>
    ): LabelFeatureRecord[] =>
      pinFeatureIdsInOrder.flatMap((markerKey) => recordsByMarkerKey.get(markerKey) ?? []),
    [pinFeatureIdsInOrder]
  );

  const buildStoreFromRecords = React.useCallback(
    (
      previousStore: SearchMapSourceStore,
      orderedRecords: readonly LabelFeatureRecord[]
    ): SearchMapSourceStore => {
      const builder = createSearchMapSourceStoreBuilder(previousStore);
      orderedRecords.forEach((record) => {
        builder.appendFeature(record.feature, {
          featureId: record.featureId,
          semanticRevision: record.semanticRevision,
          transportFeature: record.transportFeature,
        });
      });
      return builder.finish();
    },
    []
  );

  const collisionResult = React.useMemo<
    DerivedSourceStoreResult & {
      identityKey: string;
    }
  >(() => {
    const startedAtMs = getNowMs();
    const previousStore = collisionSourceStoreRef.current;
    const previousRecordsByMarkerKey = collisionRecordByMarkerKeyRef.current;
    const previousIdentityKey = collisionIdentityKeyRef.current;
    const hasCommittedCollisionSourceStore =
      previousStore.sourceRevision.length > 0 || previousStore.idsInOrder.length > 0;
    const identityKey = `${snapshotScopeKey}|${pinFeaturesForDerivedSources.sourceRevision}`;
    const identityChanged = identityKey !== previousIdentityKey;
    const shouldFreezeRebuild = !allowLabelSourceUpdates && hasCommittedCollisionSourceStore;
    if (!pinFeatureIdsInOrder.length) {
      const store = hasCommittedCollisionSourceStore
        ? buildStoreFromRecords(previousStore, [])
        : previousStore;
      recordRuntimeAttribution('map_label_collision_build', getNowMs() - startedAtMs);
      return {
        store,
        recordsByMarkerKey: new Map(),
        identityKey: '',
      };
    }
    if (shouldFreezeRebuild && identityChanged) {
      recordRuntimeAttribution('map_label_collision_build', getNowMs() - startedAtMs);
      return {
        store: previousStore,
        recordsByMarkerKey: previousRecordsByMarkerKey,
        identityKey: previousIdentityKey,
      };
    }
    const nextCollisionRecordsByMarkerKey = new Map(previousRecordsByMarkerKey);
    let didChange = !hasCommittedCollisionSourceStore;
    for (const markerKey of dirtyPinMarkerKeys) {
      const feature = pinFeaturesForDerivedSources.featureById.get(markerKey);
      if (!feature) {
        if (nextCollisionRecordsByMarkerKey.delete(markerKey)) {
          didChange = true;
        }
        continue;
      }
      const nextFeature = buildStableCollisionFeature(feature, markerKey);
      const collisionDiffKey = buildLabelSourceFeatureDiffKey(
        nextFeature,
        `${snapshotScopeKey}:collision`
      );
      const previousRecord = nextCollisionRecordsByMarkerKey.get(markerKey);
      if (previousRecord?.[0]?.semanticRevision === collisionDiffKey) {
        continue;
      }
      nextCollisionRecordsByMarkerKey.set(markerKey, [
        {
          featureId: markerKey,
          feature: nextFeature,
          semanticRevision: collisionDiffKey,
          transportFeature: createSearchMapSourceTransportFeature({
            feature: nextFeature,
            diffKey: collisionDiffKey,
          }),
        },
      ]);
      didChange = true;
    }
    const orderedRecords = buildOrderedRecords(nextCollisionRecordsByMarkerKey);
    const orderChanged =
      previousStore.idsInOrder.length !== orderedRecords.length ||
      previousStore.idsInOrder.some(
        (featureId, index) => orderedRecords[index]?.featureId !== featureId
      );
    const store =
      didChange || orderChanged
        ? buildStoreFromRecords(previousStore, orderedRecords)
        : previousStore;
    recordRuntimeAttribution('map_label_collision_build', getNowMs() - startedAtMs);
    return {
      store,
      recordsByMarkerKey: nextCollisionRecordsByMarkerKey,
      identityKey,
    };
  }, [
    allowLabelSourceUpdates,
    buildOrderedRecords,
    buildStoreFromRecords,
    dirtyPinMarkerKeys,
    getNowMs,
    pinFeatureIdsInOrder,
    pinFeaturesForDerivedSources,
    recordRuntimeAttribution,
    snapshotScopeKey,
  ]);

  React.useEffect(() => {
    collisionIdentityKeyRef.current = collisionResult.identityKey;
    collisionRecordByMarkerKeyRef.current = collisionResult.recordsByMarkerKey;
    collisionSourceStoreRef.current = collisionResult.store;
  }, [collisionResult]);

  const labelCandidateResult = React.useMemo<
    DerivedSourceStoreResult & {
      identityKey: string;
    }
  >(() => {
    const startedAtMs = getNowMs();
    const previousStore = labelCandidateSourceStoreRef.current;
    const previousRecordsByMarkerKey = labelCandidateRecordsByMarkerKeyRef.current;
    const previousIdentityKey = labelMarkerIdentityKeyRef.current;
    const hasCachedResult =
      previousStore.sourceRevision.length > 0 || previousStore.idsInOrder.length > 0;
    const hasCommittedCandidateRecords =
      previousRecordsByMarkerKey.size > 0 || previousStore.idsInOrder.length > 0;
    if (!pinFeatureIdsInOrder.length) {
      const store = hasCachedResult ? buildStoreFromRecords(previousStore, []) : previousStore;
      recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
      return {
        store,
        recordsByMarkerKey: new Map(),
        identityKey: '',
      };
    }
    if (!allowLabelSourceUpdates && hasCachedResult) {
      recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
      return {
        store: previousStore,
        recordsByMarkerKey: previousRecordsByMarkerKey,
        identityKey: previousIdentityKey,
      };
    }

    const identityKey = `${snapshotScopeKey}|${pinFeaturesForDerivedSources.sourceRevision}`;
    const identityChanged = identityKey !== previousIdentityKey;
    const shouldFreezeRebuild = !allowLabelSourceUpdates && hasCachedResult;
    const shouldDeferRebuild =
      identityChanged && shouldFreezeRebuild && hasCommittedCandidateRecords;
    if ((!identityChanged && hasCachedResult) || shouldDeferRebuild) {
      recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
      return {
        store: previousStore,
        recordsByMarkerKey: previousRecordsByMarkerKey,
        identityKey: previousIdentityKey,
      };
    }

    const nextLabelCandidateRecordsByMarkerKey = new Map(previousRecordsByMarkerKey);
    const dirtyCandidateMarkerKeys = new Set(dirtyPinMarkerKeys);
    for (const markerKey of pinFeatureIdsInOrder) {
      if (
        pinFeaturesForDerivedSources.featureById.has(markerKey) &&
        !nextLabelCandidateRecordsByMarkerKey.has(markerKey)
      ) {
        dirtyCandidateMarkerKeys.add(markerKey);
      }
    }
    previousStore.idsInOrder.forEach((featureId) => {
      const feature = previousStore.featureById.get(featureId);
      const markerKey = feature?.properties.markerKey;
      if (markerKey && !pinFeaturesForDerivedSources.featureById.has(markerKey)) {
        dirtyCandidateMarkerKeys.add(markerKey);
      }
    });
    let didChange = !hasCachedResult;
    for (const markerKey of dirtyCandidateMarkerKeys) {
      const feature = pinFeaturesForDerivedSources.featureById.get(markerKey);
      const previousRecords = nextLabelCandidateRecordsByMarkerKey.get(markerKey) ?? [];
      if (!feature) {
        if (previousRecords.length > 0) {
          nextLabelCandidateRecordsByMarkerKey.delete(markerKey);
          didChange = true;
        }
        continue;
      }
      const stableLabelBaseFeature = buildStableLabelBaseFeature(feature, markerKey);
      const nextRecords = LABEL_CANDIDATES_IN_ORDER.map((candidate) => {
        const featureId = buildLabelCandidateFeatureId(markerKey, candidate);
        const semanticRevision = buildLabelSourceFeatureDiffKey(
          stableLabelBaseFeature,
          `${snapshotScopeKey}:candidate:${candidate}`
        );
        const previousRecord = nextLabelCandidateRecordsByMarkerKey
          .get(markerKey)
          ?.find(
            (record) =>
              record.featureId === featureId && record.semanticRevision === semanticRevision
          );
        if (previousRecord) {
          return previousRecord;
        }
        didChange = true;
        const nextFeature = {
          ...stableLabelBaseFeature,
          id: featureId,
          properties: {
            ...stableLabelBaseFeature.properties,
            labelCandidate: candidate,
            markerKey,
          },
        } satisfies Feature<Point, RestaurantFeatureProperties>;
        const transportFeature = createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: semanticRevision,
        });
        return {
          featureId,
          feature: nextFeature,
          semanticRevision,
          transportFeature,
        } satisfies LabelFeatureRecord;
      });
      nextRecords.sort(
        (left, right) =>
          (left.feature.properties.labelOrder ?? 9999) -
          (right.feature.properties.labelOrder ?? 9999)
      );
      if (!areLabelFeatureRecordsEqual(previousRecords, nextRecords)) {
        didChange = true;
      }
      nextLabelCandidateRecordsByMarkerKey.set(markerKey, nextRecords);
    }
    const orderedRecords = buildOrderedRecords(nextLabelCandidateRecordsByMarkerKey);
    const orderChanged =
      previousStore.idsInOrder.length !== orderedRecords.length ||
      previousStore.idsInOrder.some(
        (featureId, index) => orderedRecords[index]?.featureId !== featureId
      );
    const store =
      didChange || orderChanged
        ? buildStoreFromRecords(previousStore, orderedRecords)
        : previousStore;
    recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
    return {
      store,
      recordsByMarkerKey: nextLabelCandidateRecordsByMarkerKey,
      identityKey,
    };
  }, [
    allowLabelSourceUpdates,
    buildLabelCandidateFeatureId,
    buildOrderedRecords,
    buildStoreFromRecords,
    dirtyPinMarkerKeys,
    getNowMs,
    pinFeatureIdsInOrder,
    pinFeaturesForDerivedSources,
    recordRuntimeAttribution,
    snapshotScopeKey,
  ]);

  React.useEffect(() => {
    labelMarkerIdentityKeyRef.current = labelCandidateResult.identityKey;
    labelCandidateRecordsByMarkerKeyRef.current = labelCandidateResult.recordsByMarkerKey;
    labelCandidateSourceStoreRef.current = labelCandidateResult.store;
  }, [labelCandidateResult]);

  const nativeLabelResult = React.useMemo<
    DerivedSourceStoreResult & {
      identityKey: string;
    }
  >(() => {
    const previousStore = nativeLabelSourceStoreRef.current;
    const previousRecordsByMarkerKey = nativeLabelRecordsByMarkerKeyRef.current;
    const previousIdentityKey = nativeLabelIdentityKeyRef.current;
    const hasCommittedNativeLabelSourceStore =
      previousStore.sourceRevision.length > 0 || previousStore.idsInOrder.length > 0;
    const identityKey = labelCandidateResult.identityKey;
    const identityChanged = identityKey !== previousIdentityKey;
    const shouldFreezeRebuild = !allowLabelSourceUpdates && hasCommittedNativeLabelSourceStore;
    if (!pinFeatureIdsInOrder.length) {
      const store = hasCommittedNativeLabelSourceStore
        ? buildStoreFromRecords(previousStore, [])
        : previousStore;
      return {
        store,
        recordsByMarkerKey: new Map(),
        identityKey: '',
      };
    }
    if (shouldFreezeRebuild && identityChanged) {
      return {
        store: previousStore,
        recordsByMarkerKey: previousRecordsByMarkerKey,
        identityKey: previousIdentityKey,
      };
    }
    const nextNativeLabelRecordsByMarkerKey = new Map(previousRecordsByMarkerKey);
    let didChange = !hasCommittedNativeLabelSourceStore;
    const markAllNativeDirty =
      !hasCommittedNativeLabelSourceStore ||
      previousStore.idsInOrder.length !== labelCandidateResult.store.idsInOrder.length;
    const dirtyNativeMarkerKeys = markAllNativeDirty
      ? new Set(pinFeatureIdsInOrder)
      : new Set<string>();
    if (!markAllNativeDirty) {
      dirtyPinMarkerKeys.forEach((markerKey) => dirtyNativeMarkerKeys.add(markerKey));
      labelCandidateResult.recordsByMarkerKey.forEach((candidateRecords, markerKey) => {
        const previousRecords = previousRecordsByMarkerKey.get(markerKey) ?? [];
        if (!areLabelFeatureRecordsEqual(previousRecords, candidateRecords)) {
          dirtyNativeMarkerKeys.add(markerKey);
        }
      });
      previousRecordsByMarkerKey.forEach((_, markerKey) => {
        if (!labelCandidateResult.recordsByMarkerKey.has(markerKey)) {
          dirtyNativeMarkerKeys.add(markerKey);
        }
      });
    }
    for (const markerKey of dirtyNativeMarkerKeys) {
      const candidateRecords = labelCandidateResult.recordsByMarkerKey.get(markerKey);
      const previousRecords = nextNativeLabelRecordsByMarkerKey.get(markerKey) ?? [];
      if (!candidateRecords || candidateRecords.length === 0) {
        if (previousRecords.length > 0) {
          nextNativeLabelRecordsByMarkerKey.delete(markerKey);
          didChange = true;
        }
        continue;
      }
      const nextRecords = candidateRecords.map((record) => {
        const nativeDiffKey = record.semanticRevision;
        const previousRecord = nextNativeLabelRecordsByMarkerKey
          .get(markerKey)
          ?.find(
            (candidateRecord) =>
              candidateRecord.featureId === record.featureId &&
              candidateRecord.semanticRevision === nativeDiffKey
          );
        if (previousRecord) {
          return previousRecord;
        }
        didChange = true;
        const nextFeature = {
          ...record.feature,
          properties: {
            ...buildNativeLabelProperties(record.feature.properties),
            nativeLabelOpacity: 1,
            nativePresentationOpacity: 1,
          },
        } satisfies Feature<Point, RestaurantFeatureProperties>;
        const transportFeature = createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: nativeDiffKey,
        });
        return {
          featureId: record.featureId,
          feature: nextFeature,
          semanticRevision: nativeDiffKey,
          transportFeature,
        } satisfies LabelFeatureRecord;
      });
      if (!areLabelFeatureRecordsEqual(previousRecords, nextRecords)) {
        didChange = true;
      }
      nextNativeLabelRecordsByMarkerKey.set(markerKey, nextRecords);
    }
    const orderedRecords = buildOrderedRecords(nextNativeLabelRecordsByMarkerKey);
    const orderChanged =
      previousStore.idsInOrder.length !== orderedRecords.length ||
      previousStore.idsInOrder.some(
        (featureId, index) => orderedRecords[index]?.featureId !== featureId
      );
    const store =
      didChange || orderChanged
        ? buildStoreFromRecords(previousStore, orderedRecords)
        : previousStore;
    return {
      store,
      recordsByMarkerKey: nextNativeLabelRecordsByMarkerKey,
      identityKey,
    };
  }, [
    allowLabelSourceUpdates,
    buildOrderedRecords,
    buildStoreFromRecords,
    dirtyPinMarkerKeys,
    labelCandidateResult,
    pinFeatureIdsInOrder,
  ]);

  React.useEffect(() => {
    nativeLabelIdentityKeyRef.current = nativeLabelResult.identityKey;
    nativeLabelRecordsByMarkerKeyRef.current = nativeLabelResult.recordsByMarkerKey;
    nativeLabelSourceStoreRef.current = nativeLabelResult.store;
  }, [nativeLabelResult]);

  return {
    collisionSourceStore: collisionResult.store,
    nativeLabelSourceStore: nativeLabelResult.store,
    derivedLabelSourceIdentityKey: nativeLabelResult.identityKey,
  };
};

const shouldAdvanceMapPolishLane = ({
  mapPresentationSettled,
  shouldDeferMapFromPressure,
  nativeSyncInFlight,
}: {
  mapPresentationSettled: boolean;
  shouldDeferMapFromPressure: boolean;
  nativeSyncInFlight: boolean;
}): boolean => mapPresentationSettled && !shouldDeferMapFromPressure && !nativeSyncInFlight;

const isMapNativeSyncInFlight = (
  mapMotionPressureController: MapMotionPressureController
): boolean => {
  const controller = mapMotionPressureController as {
    getState: () => MotionPressureState;
  };
  return controller.getState().nativeSyncInFlight;
};

const deriveSearchMapRenderAllowEmptyEnter = (
  state: Pick<
    import('../runtime/shared/search-runtime-bus').SearchRuntimeBusState,
    'results' | 'precomputedMarkerPrimaryCount' | 'precomputedMarkerCatalog'
  >
): boolean =>
  (state.results?.restaurants?.length ?? 0) + (state.results?.dishes?.length ?? 0) === 0 &&
  state.precomputedMarkerPrimaryCount === 0 &&
  (state.precomputedMarkerCatalog?.length ?? 0) === 0;

const deriveSearchMapRenderPresentationStateFromRuntimeState = ({
  state,
  selectedRestaurantId,
}: {
  state: Pick<
    import('../runtime/shared/search-runtime-bus').SearchRuntimeBusState,
    | 'resultsPresentationTransport'
    | 'results'
    | 'precomputedMarkerPrimaryCount'
    | 'precomputedMarkerCatalog'
  >;
  selectedRestaurantId: string | null;
}): SearchMapRenderPresentationState => ({
  transactionId: state.resultsPresentationTransport.transactionId,
  snapshotKind: state.resultsPresentationTransport.snapshotKind,
  executionBatch: state.resultsPresentationTransport.executionBatch,
  executionStage: state.resultsPresentationTransport.executionStage,
  startToken: state.resultsPresentationTransport.startToken,
  coverState: state.resultsPresentationTransport.coverState,
  selectedRestaurantId,
  allowEmptyEnter: deriveSearchMapRenderAllowEmptyEnter(state),
});

const useSearchMapPresentationAdapter = ({
  searchRuntimeBus,
  selectedRestaurantId,
  disableMarkers,
}: {
  searchRuntimeBus: ReturnType<typeof useSearchBus>;
  selectedRestaurantId: string | null;
  disableMarkers: boolean;
}): {
  nativePresentationState: SearchMapRenderPresentationState;
  nativeInteractionMode: SearchMapRenderInteractionMode;
} => {
  const nativePresentationState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) =>
      deriveSearchMapRenderPresentationStateFromRuntimeState({
        state,
        selectedRestaurantId,
      }),
    areSearchMapRenderPresentationStatesEqual,
    [
      'resultsPresentationTransport',
      'results',
      'precomputedMarkerPrimaryCount',
      'precomputedMarkerCatalog',
    ] as const
  );

  return {
    nativePresentationState,
    nativeInteractionMode: disableMarkers ? 'suppressed' : 'enabled',
  };
};

const useSearchMapLaneAdvancement = ({
  mapMotionPressureController,
  searchRuntimeBus,
  shouldDeferMapFromPressure,
}: {
  mapMotionPressureController: MapMotionPressureController;
  searchRuntimeBus: SearchRuntimeBus;
  shouldDeferMapFromPressure: boolean;
}): void => {
  const { resultsPresentation, activeOperationId, activeOperationLane } =
    useSearchRuntimeBusSelector(
      searchRuntimeBus,
      (state) => ({
        resultsPresentation: state.resultsPresentation,
        activeOperationId: state.activeOperationId,
        activeOperationLane: state.activeOperationLane,
      }),
      (left, right) =>
        areResultsPresentationReadModelsEqual(
          left.resultsPresentation,
          right.resultsPresentation
        ) &&
        left.activeOperationId === right.activeOperationId &&
        left.activeOperationLane === right.activeOperationLane,
      ['resultsPresentation', 'activeOperationId', 'activeOperationLane'] as const
    );
  const activeOperationStateRef = React.useRef({
    activeOperationId,
    activeOperationLane,
  });

  React.useEffect(() => {
    activeOperationStateRef.current = {
      activeOperationId,
      activeOperationLane,
    };
  }, [activeOperationId, activeOperationLane]);

  React.useEffect(() => {
    let animationFrameHandle: number | null = null;
    let microtaskReleaseCancelled = false;

    const clearScheduledRelease = () => {
      if (animationFrameHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameHandle);
        animationFrameHandle = null;
      }
      microtaskReleaseCancelled = true;
    };

    const canAdvanceMapPolishLane = () => {
      return shouldAdvanceMapPolishLane({
        mapPresentationSettled: resultsPresentation.isSettled,
        shouldDeferMapFromPressure,
        nativeSyncInFlight: isMapNativeSyncInFlight(mapMotionPressureController),
      });
    };

    const releaseIdleIfReady = (operationId: string) => {
      if (
        activeOperationStateRef.current.activeOperationId !== operationId ||
        activeOperationStateRef.current.activeOperationLane !== 'lane_f_polish'
      ) {
        return;
      }
      if (!canAdvanceMapPolishLane()) {
        return;
      }
      searchRuntimeBus.publish({
        activeOperationLane: 'idle',
        activeOperationId: null,
      });
    };

    const scheduleRelease = (operationId: string) => {
      clearScheduledRelease();
      microtaskReleaseCancelled = false;
      if (typeof requestAnimationFrame === 'function') {
        animationFrameHandle = requestAnimationFrame(() => {
          animationFrameHandle = null;
          releaseIdleIfReady(operationId);
        });
        return;
      }
      queueMicrotask(() => {
        if (microtaskReleaseCancelled) {
          return;
        }
        releaseIdleIfReady(operationId);
      });
    };

    const maybeAdvancePolishLane = () => {
      if (!activeOperationId || activeOperationLane !== 'lane_e_map_pins') {
        return;
      }
      if (!canAdvanceMapPolishLane()) {
        return;
      }
      searchRuntimeBus.publish({
        activeOperationLane: 'lane_f_polish',
      });
      scheduleRelease(activeOperationId);
    };

    maybeAdvancePolishLane();

    return () => {
      clearScheduledRelease();
    };
  }, [
    activeOperationId,
    activeOperationLane,
    resultsPresentation,
    mapMotionPressureController,
    searchRuntimeBus,
    shouldDeferMapFromPressure,
  ]);
};

const useMarkerInteractionController = ({
  anchoredShortcutCoverageFeatures,
  restaurants,
  pendingMarkerOpenAnimationFrameRef,
  profileActions,
}: {
  anchoredShortcutCoverageFeatures: FeatureCollection<Point, ShortcutCoverageFeatureProps> | null;
  restaurants: RestaurantResult[];
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  profileActions: MarkerProfileActions;
}): {
  handleMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
} => {
  const shortcutCoverageRestaurantNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    const features = anchoredShortcutCoverageFeatures?.features ?? [];
    for (const feature of features) {
      const props = feature.properties;
      const restaurantId = props?.restaurantId;
      const restaurantName = props?.restaurantName;
      if (typeof restaurantId === 'string' && restaurantId && typeof restaurantName === 'string') {
        map.set(restaurantId, restaurantName);
      }
    }
    return map;
  }, [anchoredShortcutCoverageFeatures?.features]);

  const handleMarkerPress = React.useCallback(
    (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
      if (pendingMarkerOpenAnimationFrameRef.current != null) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(pendingMarkerOpenAnimationFrameRef.current);
        }
        pendingMarkerOpenAnimationFrameRef.current = null;
      }
      const restaurant = restaurants.find((item) => item.restaurantId === restaurantId);
      const openProfile = () => {
        if (!restaurant) {
          const fallbackName = shortcutCoverageRestaurantNameById.get(restaurantId);
          if (fallbackName) {
            profileActions.openRestaurantProfilePreview(restaurantId, fallbackName, {
              pressedCoordinate: pressedCoordinate ?? null,
              forceMiddleSnap: true,
            });
          }
          return;
        }
        profileActions.openRestaurantProfile(restaurant, {
          pressedCoordinate,
          forceMiddleSnap: true,
          source: 'results_sheet',
        });
      };
      openProfile();
    },
    [
      pendingMarkerOpenAnimationFrameRef,
      profileActions,
      restaurants,
      shortcutCoverageRestaurantNameById,
    ]
  );

  return { handleMarkerPress };
};

const usePreparedPresentationSnapshotKey = (searchRuntimeBus: ReturnType<typeof useSearchBus>) =>
  useSearchRuntimeBusSelector(searchRuntimeBus, derivePreparedPresentationSnapshotKey, Object.is, [
    'preparedPresentationSnapshotKey',
    'resultsHydrationKey',
    'resultsRequestKey',
  ] as const);

const usePreparedLabelSourcesReadyPublisher = (
  searchRuntimeBus: ReturnType<typeof useSearchBus>
): ((ready: boolean) => void) =>
  React.useCallback(
    (ready: boolean) => {
      searchRuntimeBus.publish({
        mapPreparedLabelSourcesReady: ready,
      });
    },
    [searchRuntimeBus]
  );

const useMapPresentationSourceTelemetryPublisher = ({
  searchRuntimeBus,
  isShortcutCoverageLoading,
}: {
  searchRuntimeBus: ReturnType<typeof useSearchBus>;
  isShortcutCoverageLoading: boolean;
}): { publishMountedSourceCounts: (counts: MapPresentationMountedSourceCounts) => void } => {
  const [mountedSourceCounts, setMountedSourceCounts] =
    React.useState<MapPresentationMountedSourceCounts>({
      pinCount: 0,
      dotCount: 0,
      labelCount: 0,
    });

  React.useEffect(() => {
    searchRuntimeBus.publish({
      visibleSortedRestaurantMarkersCount: mountedSourceCounts.pinCount,
      visibleDotRestaurantFeaturesCount: mountedSourceCounts.dotCount,
      isShortcutCoverageLoading,
    });
  }, [
    isShortcutCoverageLoading,
    mountedSourceCounts.dotCount,
    mountedSourceCounts.pinCount,
    searchRuntimeBus,
  ]);

  const publishMountedSourceCounts = React.useCallback(
    (counts: MapPresentationMountedSourceCounts) => {
      setMountedSourceCounts((previous) =>
        previous.pinCount === counts.pinCount &&
        previous.dotCount === counts.dotCount &&
        previous.labelCount === counts.labelCount
          ? previous
          : counts
      );
    },
    []
  );

  return {
    publishMountedSourceCounts,
  };
};

const resolveMapSnapshotPresentationPolicy = ({
  presentationState,
  preparedResultsSnapshotKey,
  isMapMoving,
}: {
  presentationState: SearchMapRenderPresentationState;
  preparedResultsSnapshotKey: string | null;
  isMapMoving: boolean;
}): MapSnapshotPresentationPolicy => {
  const batchPhase = deriveSearchMapRenderPresentationPhase(presentationState);
  const visualReadyRequestKey = deriveSearchMapRenderPresentationRequestKey(presentationState);
  const enterLaneActive = batchPhase === 'enter_requested' || batchPhase === 'entering';
  const shouldProjectSearchMarkerFamilies = batchPhase !== 'idle';

  return {
    batchPhase,
    visualReadyRequestKey,
    visualSceneKey: preparedResultsSnapshotKey ?? visualReadyRequestKey ?? null,
    shouldFreezePreparedScene: enterLaneActive,
    shouldCapturePreparedScene: batchPhase === 'covered',
    shouldAllowVisualScene: shouldProjectSearchMarkerFamilies,
    shouldAllowLabelInteractionScene: batchPhase === 'live',
    shouldProjectSearchMarkerFamilies,
    shouldAllowLiveLabelUpdates: batchPhase === 'live',
    shouldPublishVisibleLabelFeatureIds: batchPhase === 'live' && !isMapMoving,
    shouldResetPreparedVisualScene: batchPhase === 'idle',
    shouldResetEnterLabelsUnavailableSignature: batchPhase === 'idle' || batchPhase === 'live',
    enterLaneActive,
    isPresentationPending: isSearchRuntimeMapPresentationPending(batchPhase),
  };
};

const useMapPresentationSourceUpdateGate = ({
  phasePolicy,
}: {
  phasePolicy: import('../runtime/map/map-presentation-runtime-contract').MapSnapshotPresentationPolicy;
}): MapPresentationSourceUpdateGate => ({
  shouldAllowPreparedSourceUpdates:
    phasePolicy.shouldCapturePreparedScene || phasePolicy.shouldAllowLabelInteractionScene,
  shouldCapturePreparedScene: phasePolicy.shouldCapturePreparedScene,
});

const useMapPresentationSceneController = <TScene,>({
  phasePolicy,
  nextPreparedSceneSnapshot,
}: {
  phasePolicy: import('../runtime/map/map-presentation-runtime-contract').MapSnapshotPresentationPolicy;
  nextPreparedSceneSnapshot: MapPresentationSceneSnapshot<TScene>;
}): MapPresentationSceneControllerResult<TScene> => {
  const preparedSceneSnapshotRef = React.useRef(nextPreparedSceneSnapshot);
  const frozenSceneSnapshotRef = React.useRef<MapPresentationSceneSnapshot<TScene> | null>(null);
  const [isSceneSnapshotFrozen, setIsSceneSnapshotFrozen] = React.useState(false);

  if (phasePolicy.shouldCapturePreparedScene) {
    preparedSceneSnapshotRef.current = nextPreparedSceneSnapshot;
  }

  if (phasePolicy.shouldFreezePreparedScene && frozenSceneSnapshotRef.current == null) {
    frozenSceneSnapshotRef.current = preparedSceneSnapshotRef.current;
  }

  React.useEffect(() => {
    if (phasePolicy.shouldFreezePreparedScene) {
      frozenSceneSnapshotRef.current = preparedSceneSnapshotRef.current;
      setIsSceneSnapshotFrozen(true);
      return;
    }

    if (phasePolicy.shouldAllowLabelInteractionScene && frozenSceneSnapshotRef.current) {
      frozenSceneSnapshotRef.current = null;
      setIsSceneSnapshotFrozen(false);
      return;
    }

    frozenSceneSnapshotRef.current = null;
    setIsSceneSnapshotFrozen(false);
  }, [phasePolicy.shouldAllowLabelInteractionScene, phasePolicy.shouldFreezePreparedScene]);

  const activeSceneSnapshot =
    (phasePolicy.shouldFreezePreparedScene || isSceneSnapshotFrozen) &&
    frozenSceneSnapshotRef.current
      ? frozenSceneSnapshotRef.current
      : nextPreparedSceneSnapshot;

  return {
    activeSceneSnapshot,
    isSceneSnapshotFrozen,
  };
};

const useSearchMapPresentationSceneSnapshot = ({
  phasePolicy,
  preparedResultsSnapshotKey,
  selectedRestaurantId,
  pinSourceStore,
  dotSourceStore,
  pinInteractionSourceStore,
  dotInteractionSourceStore,
  markersRenderKey,
  getNowMs,
  buildLabelCandidateFeatureId,
}: {
  phasePolicy: import('../runtime/map/map-presentation-runtime-contract').MapSnapshotPresentationPolicy;
  preparedResultsSnapshotKey: string | null;
  selectedRestaurantId: string | null;
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore | null;
  pinInteractionSourceStore: SearchMapSourceStore;
  dotInteractionSourceStore: SearchMapSourceStore;
  markersRenderKey: string;
  getNowMs: () => number;
  buildLabelCandidateFeatureId: (markerKey: string, candidate: LabelCandidate) => string;
}): MapPresentationSceneControllerResult<SearchMapPresentationScene> => {
  const recordPreparedLabelRuntimeAttribution = React.useCallback(() => {}, []);
  const { shouldAllowPreparedSourceUpdates } = useMapPresentationSourceUpdateGate({
    phasePolicy,
  });
  const {
    collisionSourceStore: labelCollisionSourceStore,
    nativeLabelSourceStore: labelSourceStore,
    derivedLabelSourceIdentityKey: labelDerivedSourceIdentityKey,
  } = useSearchMapLabelSources({
    pinFeaturesForDerivedSources: pinSourceStore,
    sceneSnapshotKey: preparedResultsSnapshotKey,
    getNowMs,
    recordRuntimeAttribution: recordPreparedLabelRuntimeAttribution,
    allowLabelSourceUpdates: shouldAllowPreparedSourceUpdates,
    buildLabelCandidateFeatureId,
  });
  const nextPreparedSceneSnapshot = React.useMemo<
    MapPresentationSceneSnapshot<SearchMapPresentationScene>
  >(
    () => ({
      snapshotKey: preparedResultsSnapshotKey,
      scene: {
        selectedRestaurantId,
        pinSourceStore,
        dotSourceStore,
        pinInteractionSourceStore,
        dotInteractionSourceStore,
        markersRenderKey,
        labelSourceStore,
        labelCollisionSourceStore,
        labelDerivedSourceIdentityKey,
      },
    }),
    [
      dotInteractionSourceStore,
      dotSourceStore,
      labelCollisionSourceStore,
      labelDerivedSourceIdentityKey,
      labelSourceStore,
      markersRenderKey,
      pinInteractionSourceStore,
      pinSourceStore,
      preparedResultsSnapshotKey,
      selectedRestaurantId,
    ]
  );

  return useMapPresentationSceneController({
    phasePolicy,
    nextPreparedSceneSnapshot,
  });
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Imperative handle type
// ---------------------------------------------------------------------------

export type SearchMapMarkerEngineHandle = {
  resetShortcutCoverageState: () => void;
  handleShortcutSearchCoverageSnapshot: ReturnType<
    typeof useMapMarkerEngine
  >['handleShortcutSearchCoverageSnapshot'];
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SearchMapWithMarkerEngineProps = {
  // --- Marker engine inputs ---
  scoreMode: 'global_quality' | 'coverage_display';
  restaurantOnlyId: string | null;
  highlightedRestaurantId: string | null;
  viewportBoundsService: ViewportBoundsService;
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => ResolvedRestaurantMapLocation[];
  resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  getQualityColorFromScore: (score: number | null | undefined) => string;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  mapMotionPressureController: MapMotionPressureController;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, duration: number) => void;
  maxFullPins: number;
  lodVisibleCandidateBuffer: number;
  lodPinPromoteStableMsMoving: number;
  lodPinDemoteStableMsMoving: number;
  lodPinToggleStableMsIdle: number;
  lodPinOffscreenToggleStableMsMoving: number;
  mapQueryBudget: MapQueryBudget;

  // --- Marker interaction inputs ---
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  profileActions: MarkerProfileActions;

  // --- SearchMap pass-through props ---
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<import('@rnmapbox/maps').Camera | null>;
  styleURL: string;
  mapCenter: [number, number] | null;
  mapZoom: number;
  mapCameraAnimation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  };
  cameraPadding?: {
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
  } | null;
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
  onMarkerEnterSettled?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    markerEnterCommitId: number | null;
    settledAtMs: number;
  }) => void;
  onMarkerExitStarted?: (payload: { requestKey: string; startedAtMs: number }) => void;
  onMarkerExitSettled?: (payload: { requestKey: string; settledAtMs: number }) => void;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  userLocationSnapshot: StartupLocationSnapshot | null;
  disableMarkers?: boolean;
  disableBlur?: boolean;
  onProfilerRender?: React.ProfilerOnRenderCallback;
  onRuntimeMechanismEvent?: (
    event: 'runtime_write_span',
    payload?: Record<string, unknown>
  ) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SearchMapWithMarkerEngineInner: React.ForwardRefRenderFunction<
  SearchMapMarkerEngineHandle,
  SearchMapWithMarkerEngineProps
> = (
  {
    // Marker engine inputs
    scoreMode,
    restaurantOnlyId,
    highlightedRestaurantId,
    viewportBoundsService,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
    mapGestureActiveRef,
    mapMotionPressureController,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    lodVisibleCandidateBuffer,
    lodPinPromoteStableMsMoving,
    lodPinDemoteStableMsMoving,
    lodPinToggleStableMsIdle,
    lodPinOffscreenToggleStableMsMoving,
    mapQueryBudget,

    // Marker interaction inputs
    pendingMarkerOpenAnimationFrameRef,
    profileActions,

    // SearchMap pass-through props
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
    onCameraAnimationComplete,
    onMapLoaded,
    onMapFullyRendered,
    onExecutionBatchMountedHidden,
    onMarkerEnterStarted,
    onMarkerEnterSettled,
    onMarkerExitStarted,
    onMarkerExitSettled,
    isMapStyleReady,
    userLocation,
    userLocationSnapshot,
    disableMarkers,
    disableBlur,
    onProfilerRender,
    onRuntimeMechanismEvent,
  },
  ref
) => {
  const engineInstanceIdRef = React.useRef<string | null>(null);
  if (engineInstanceIdRef.current == null) {
    engineInstanceIdRef.current = `search-map-engine:${Math.random().toString(36).slice(2)}`;
  }
  const [nativeViewportState, setNativeViewportState] = React.useState<{
    bounds: MapBounds | null;
    isGestureActive: boolean;
    isMoving: boolean;
  }>({
    bounds: viewportBoundsService.getBounds(),
    isGestureActive: mapGestureActiveRef.current,
    isMoving: mapGestureActiveRef.current,
  });

  // -------------------------------------------------------------------------
  // Bus — read from context (decoupled from parent props)
  // -------------------------------------------------------------------------

  const searchRuntimeBus = useSearchBus();

  const { isMapActivationDeferred, runOneCommitSpanPressureActive } = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isMapActivationDeferred: state.isMapActivationDeferred,
      runOneCommitSpanPressureActive: state.runOneCommitSpanPressureActive,
    }),
    (left, right) =>
      left.isMapActivationDeferred === right.isMapActivationDeferred &&
      left.runOneCommitSpanPressureActive === right.runOneCommitSpanPressureActive,
    ['isMapActivationDeferred', 'runOneCommitSpanPressureActive'] as const
  );

  // -------------------------------------------------------------------------
  // Handoff-derived state — read from the bus, published by the Search root handoff bridge.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Marker engine
  // -------------------------------------------------------------------------

  const { nativePresentationState, nativeInteractionMode } = useSearchMapPresentationAdapter({
    searchRuntimeBus,
    selectedRestaurantId: highlightedRestaurantId,
    disableMarkers: disableMarkers === true,
  });
  const preparedResultsSnapshotKey = usePreparedPresentationSnapshotKey(searchRuntimeBus);
  const handlePreparedLabelSourcesReadyChange =
    usePreparedLabelSourcesReadyPublisher(searchRuntimeBus);
  const mapSnapshotPresentationPolicy = React.useMemo(
    () =>
      resolveMapSnapshotPresentationPolicy({
        presentationState: nativePresentationState,
        preparedResultsSnapshotKey,
        isMapMoving: nativeViewportState.isMoving,
      }),
    [nativePresentationState, nativeViewportState.isMoving, preparedResultsSnapshotKey]
  );

  const {
    pinSourceStore,
    dotSourceStore,
    pinInteractionSourceStore,
    dotInteractionSourceStore,
    markersRenderKey,
    restaurantLabelStyle,
    buildMarkerKey,
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    isShortcutCoverageLoading,
    anchoredShortcutCoverageFeatures,
    restaurants,
  } = useMapMarkerEngine({
    searchRuntimeBus,
    scoreMode,
    restaurantOnlyId,
    highlightedRestaurantId,
    viewportBoundsService,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
    mapGestureActiveRef,
    mapMotionPressureController,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
    maxFullPins,
    lodVisibleCandidateBuffer,
    lodPinPromoteStableMsMoving,
    lodPinDemoteStableMsMoving,
    lodPinToggleStableMsIdle,
    lodPinOffscreenToggleStableMsMoving,
    isMapMoving: nativeViewportState.isMoving,
    externalMapQueryBudget: mapQueryBudget,
  });

  React.useEffect(
    () =>
      viewportBoundsService.subscribe((bounds) => {
        setNativeViewportState((previous) => {
          const boundsUnchanged =
            previous.bounds?.northEast.lat === bounds?.northEast.lat &&
            previous.bounds?.northEast.lng === bounds?.northEast.lng &&
            previous.bounds?.southWest.lat === bounds?.southWest.lat &&
            previous.bounds?.southWest.lng === bounds?.southWest.lng;
          if (boundsUnchanged) {
            return previous;
          }
          return {
            bounds,
            isGestureActive: previous.isGestureActive,
            isMoving: previous.isMoving,
          };
        });
      }),
    [viewportBoundsService]
  );

  const handleSearchMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      const idleBounds = viewportBoundsService.getBounds() ?? mapStateBoundsToMapBounds(state);
      setNativeViewportState((previous) => {
        const boundsUnchanged =
          previous.bounds?.northEast.lat === idleBounds?.northEast.lat &&
          previous.bounds?.northEast.lng === idleBounds?.northEast.lng &&
          previous.bounds?.southWest.lat === idleBounds?.southWest.lat &&
          previous.bounds?.southWest.lng === idleBounds?.southWest.lng;
        if (boundsUnchanged && previous.isGestureActive === false && previous.isMoving === false) {
          return previous;
        }
        return {
          bounds: idleBounds,
          isGestureActive: false,
          isMoving: false,
        };
      });
      onMapIdle(state);
    },
    [onMapIdle, viewportBoundsService]
  );

  const handleSearchMapNativeViewportChanged = React.useCallback(
    (state: MapboxMapState) => {
      const nextIsGestureActive = Boolean(state?.gestures?.isGestureActive);
      const nextBounds = mapStateBoundsToMapBounds(state);
      setNativeViewportState((previous) => {
        const boundsUnchanged =
          previous.bounds?.northEast.lat === nextBounds?.northEast.lat &&
          previous.bounds?.northEast.lng === nextBounds?.northEast.lng &&
          previous.bounds?.southWest.lat === nextBounds?.southWest.lat &&
          previous.bounds?.southWest.lng === nextBounds?.southWest.lng;
        if (
          boundsUnchanged &&
          previous.isGestureActive === nextIsGestureActive &&
          previous.isMoving
        ) {
          return previous;
        }
        return {
          bounds: nextBounds,
          isGestureActive: nextIsGestureActive,
          isMoving: true,
        };
      });
      onNativeViewportChanged(state);
    },
    [onNativeViewportChanged]
  );

  const handleSearchMapTouchStart = React.useCallback(() => {
    setNativeViewportState((previous) =>
      previous.isGestureActive && previous.isMoving
        ? previous
        : {
            bounds: previous.bounds,
            isGestureActive: true,
            isMoving: true,
          }
    );
    onTouchStart?.();
  }, [onTouchStart]);

  const handleSearchMapTouchEnd = React.useCallback(() => {
    setNativeViewportState((previous) =>
      previous.isGestureActive === false
        ? previous
        : {
            bounds: previous.bounds,
            isGestureActive: false,
            isMoving: previous.isMoving,
          }
    );
    onTouchEnd?.();
  }, [onTouchEnd]);

  // -------------------------------------------------------------------------
  // Publish marker telemetry to bus for harness observer
  // -------------------------------------------------------------------------

  const { publishMountedSourceCounts: handleNativeMountedSourceCountsChanged } =
    useMapPresentationSourceTelemetryPublisher({
      searchRuntimeBus,
      isShortcutCoverageLoading,
    });

  // -------------------------------------------------------------------------
  // Marker interaction controller
  // -------------------------------------------------------------------------

  const { handleMarkerPress } = useMarkerInteractionController({
    anchoredShortcutCoverageFeatures,
    restaurants,
    pendingMarkerOpenAnimationFrameRef,
    profileActions,
  });

  // -------------------------------------------------------------------------
  // Stable marker press ref (avoids SearchMap memo invalidation)
  // -------------------------------------------------------------------------

  const handleMarkerPressRef = React.useRef(handleMarkerPress);
  handleMarkerPressRef.current = handleMarkerPress;

  const stableHandleMarkerPress = React.useMemo(
    () => (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
      handleMarkerPressRef.current(restaurantId, pressedCoordinate);
    },
    []
  );

  const shouldDeferMapFromPressure = isMapActivationDeferred || runOneCommitSpanPressureActive;

  useSearchMapLaneAdvancement({
    mapMotionPressureController,
    searchRuntimeBus,
    shouldDeferMapFromPressure,
  });

  // -------------------------------------------------------------------------
  // Map tree props
  // -------------------------------------------------------------------------

  const { activeSceneSnapshot } = useSearchMapPresentationSceneSnapshot({
    phasePolicy: mapSnapshotPresentationPolicy,
    preparedResultsSnapshotKey,
    selectedRestaurantId: highlightedRestaurantId,
    pinSourceStore,
    dotSourceStore,
    pinInteractionSourceStore,
    dotInteractionSourceStore,
    markersRenderKey,
    getNowMs: getPerfNow,
    buildLabelCandidateFeatureId,
  });
  const mapTreePropsForRender = activeSceneSnapshot.scene;

  // -------------------------------------------------------------------------
  // Imperative handle
  // -------------------------------------------------------------------------

  React.useImperativeHandle(
    ref,
    () => ({
      resetShortcutCoverageState,
      handleShortcutSearchCoverageSnapshot,
    }),
    [resetShortcutCoverageState, handleShortcutSearchCoverageSnapshot]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <SearchMap
      mapRef={mapRef}
      cameraRef={cameraRef}
      styleURL={styleURL}
      scoreMode={scoreMode}
      mapCenter={mapCenter}
      mapZoom={mapZoom}
      mapCameraAnimation={mapCameraAnimation}
      cameraPadding={cameraPadding}
      isFollowingUser={isFollowingUser}
      onPress={onPress}
      onTouchStart={handleSearchMapTouchStart}
      onTouchEnd={handleSearchMapTouchEnd}
      onNativeViewportChanged={handleSearchMapNativeViewportChanged}
      onMapIdle={handleSearchMapIdle}
      onCameraAnimationComplete={onCameraAnimationComplete}
      onMapLoaded={onMapLoaded}
      onMapFullyRendered={onMapFullyRendered}
      onPreparedLabelSourcesReadyChange={handlePreparedLabelSourcesReadyChange}
      onMarkerPress={stableHandleMarkerPress}
      onExecutionBatchMountedHidden={onExecutionBatchMountedHidden}
      onMarkerEnterStarted={onMarkerEnterStarted}
      onMarkerEnterSettled={onMarkerEnterSettled}
      onMarkerExitStarted={onMarkerExitStarted}
      onMarkerExitSettled={onMarkerExitSettled}
      onNativeMountedSourceCountsChanged={handleNativeMountedSourceCountsChanged}
      mapSceneSnapshot={mapTreePropsForRender}
      buildMarkerKey={buildMarkerKey}
      restaurantLabelStyle={restaurantLabelStyle}
      isMapStyleReady={isMapStyleReady}
      userLocation={userLocation}
      userLocationSnapshot={userLocationSnapshot}
      disableMarkers={disableMarkers}
      disableBlur={disableBlur}
      onProfilerRender={onProfilerRender}
      mapQueryBudget={mapQueryBudget}
      onRuntimeMechanismEvent={onRuntimeMechanismEvent}
      nativeViewportState={nativeViewportState}
      nativePresentationState={nativePresentationState}
      mapSnapshotPresentationPolicy={mapSnapshotPresentationPolicy}
      nativeInteractionMode={nativeInteractionMode}
      mapMotionPressureController={mapMotionPressureController}
      maxFullPins={maxFullPins}
      lodVisibleCandidateBuffer={lodVisibleCandidateBuffer}
      lodPinPromoteStableMsMoving={lodPinPromoteStableMsMoving}
      lodPinDemoteStableMsMoving={lodPinDemoteStableMsMoving}
      lodPinToggleStableMsIdle={lodPinToggleStableMsIdle}
      lodPinOffscreenToggleStableMsMoving={lodPinOffscreenToggleStableMsMoving}
    />
  );
};

const SearchMapWithMarkerEngine = React.memo(React.forwardRef(SearchMapWithMarkerEngineInner));

export default SearchMapWithMarkerEngine;
