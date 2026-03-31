import React from 'react';

import type { Feature, Point } from 'geojson';

import type { RestaurantFeatureProperties } from '../search-map';
import {
  createSearchMapSourceTransportFeature,
  createSearchMapSourceStoreBuilder,
  getSearchMapSourceTransportFeature,
  type SearchMapSourceStore,
  EMPTY_SEARCH_MAP_SOURCE_STORE,
} from '../../runtime/map/search-map-source-store';
import type { StickyLabelStateSnapshot } from './use-search-map-label-observation';

export type LabelCandidate = 'bottom' | 'right' | 'top' | 'left';
const LABEL_CANDIDATES_IN_ORDER: readonly LabelCandidate[] = ['bottom', 'right', 'top', 'left'];

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

type UseSearchMapLabelSourcesArgs = {
  pinFeaturesForDerivedSources: SearchMapSourceStore;
  getNowMs: () => number;
  recordRuntimeAttribution: (contributor: string, durationMs: number) => void;
  allowLiveLabelUpdates: boolean;
  enableStickyLabelCandidates: boolean;
  getLabelStickyIdentityKeyFromFeature: (
    feature: Feature<Point, RestaurantFeatureProperties>
  ) => string | null;
  buildLabelCandidateFeatureId: (markerKey: string, candidate: LabelCandidate) => string;
  stickyLabelState: StickyLabelStateSnapshot;
};

type UseSearchMapLabelSourcesResult = {
  collisionSourceStore: SearchMapSourceStore;
  nativeLabelSourceStore: SearchMapSourceStore;
};

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

export const useSearchMapLabelSources = ({
  pinFeaturesForDerivedSources,
  getNowMs,
  recordRuntimeAttribution,
  allowLiveLabelUpdates,
  enableStickyLabelCandidates,
  getLabelStickyIdentityKeyFromFeature,
  buildLabelCandidateFeatureId,
  stickyLabelState,
}: UseSearchMapLabelSourcesArgs): UseSearchMapLabelSourcesResult => {
  const collisionSourceStoreRef = React.useRef<SearchMapSourceStore>(EMPTY_SEARCH_MAP_SOURCE_STORE);
  const labelCandidateSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const nativeLabelSourceStoreRef = React.useRef<SearchMapSourceStore>(
    EMPTY_SEARCH_MAP_SOURCE_STORE
  );
  const labelMarkerIdentityKeyRef = React.useRef('');
  const labelCandidateAppliedStickyEpochRef = React.useRef(-1);
  const previousPinSemanticRevisionByMarkerKeyRef = React.useRef<Map<string, string>>(new Map());
  const collisionRecordByMarkerKeyRef = React.useRef<Map<string, LabelFeatureRecord[]>>(new Map());
  const labelCandidateRecordsByMarkerKeyRef = React.useRef<Map<string, LabelFeatureRecord[]>>(
    new Map()
  );
  const nativeLabelRecordsByMarkerKeyRef = React.useRef<Map<string, LabelFeatureRecord[]>>(
    new Map()
  );
  const pinFeatureIdsInOrder = pinFeaturesForDerivedSources.idsInOrder;

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

  const collisionResult = React.useMemo<DerivedSourceStoreResult>(() => {
    const startedAtMs = getNowMs();
    const previousStore = collisionSourceStoreRef.current;
    const previousRecordsByMarkerKey = collisionRecordByMarkerKeyRef.current;
    const hasCommittedCollisionSourceStore =
      previousStore.sourceRevision.length > 0 || previousStore.idsInOrder.length > 0;
    if (!pinFeatureIdsInOrder.length) {
      const store = hasCommittedCollisionSourceStore
        ? buildStoreFromRecords(previousStore, [])
        : previousStore;
      recordRuntimeAttribution('map_label_collision_build', getNowMs() - startedAtMs);
      return {
        store,
        recordsByMarkerKey: new Map(),
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
      const collisionDiffKey = buildLabelSourceFeatureDiffKey(nextFeature, 'collision');
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
    };
  }, [
    buildOrderedRecords,
    buildStoreFromRecords,
    dirtyPinMarkerKeys,
    getNowMs,
    pinFeatureIdsInOrder,
    pinFeaturesForDerivedSources,
    recordRuntimeAttribution,
  ]);

  React.useEffect(() => {
    collisionRecordByMarkerKeyRef.current = collisionResult.recordsByMarkerKey;
    collisionSourceStoreRef.current = collisionResult.store;
  }, [collisionResult]);

  const labelCandidateResult = React.useMemo<
    DerivedSourceStoreResult & {
      identityKey: string;
      appliedStickyEpoch: number;
    }
  >(() => {
    const startedAtMs = getNowMs();
    const previousStore = labelCandidateSourceStoreRef.current;
    const previousRecordsByMarkerKey = labelCandidateRecordsByMarkerKeyRef.current;
    const previousIdentityKey = labelMarkerIdentityKeyRef.current;
    const previousStickyRevision = labelCandidateAppliedStickyEpochRef.current;
    const hasCachedResult =
      previousStore.sourceRevision.length > 0 || previousStore.idsInOrder.length > 0;
    if (!pinFeatureIdsInOrder.length) {
      const store = hasCachedResult ? buildStoreFromRecords(previousStore, []) : previousStore;
      recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
      return {
        store,
        recordsByMarkerKey: new Map(),
        identityKey: '',
        appliedStickyEpoch: stickyLabelState.revision,
      };
    }

    const identityKey = pinFeaturesForDerivedSources.sourceRevision;
    const identityChanged = identityKey !== previousIdentityKey;
    const shouldFreezeRebuild = !allowLiveLabelUpdates && hasCachedResult;
    const shouldDeferRebuild = identityChanged && hasCachedResult && shouldFreezeRebuild;
    const stickyRevisionChanged =
      enableStickyLabelCandidates && previousStickyRevision !== stickyLabelState.revision;

    if (!stickyRevisionChanged && ((!identityChanged && hasCachedResult) || shouldDeferRebuild)) {
      recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
      return {
        store: previousStore,
        recordsByMarkerKey: previousRecordsByMarkerKey,
        identityKey: previousIdentityKey,
        appliedStickyEpoch: stickyLabelState.revision,
      };
    }

    const nextLabelCandidateRecordsByMarkerKey = new Map(previousRecordsByMarkerKey);
    const dirtyCandidateMarkerKeys = new Set(dirtyPinMarkerKeys);
    if (stickyRevisionChanged && stickyLabelState.dirtyIdentityKeys.size > 0) {
      for (const markerKey of pinFeatureIdsInOrder) {
        const feature = pinFeaturesForDerivedSources.featureById.get(markerKey);
        if (!feature) {
          continue;
        }
        const stickyIdentityKey = getLabelStickyIdentityKeyFromFeature(feature);
        if (stickyIdentityKey && stickyLabelState.dirtyIdentityKeys.has(stickyIdentityKey)) {
          dirtyCandidateMarkerKeys.add(markerKey);
        }
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
      const stickyIdentityKey = getLabelStickyIdentityKeyFromFeature(feature);
      const stableLabelBaseFeature = buildStableLabelBaseFeature(feature, markerKey);
      const preferredCandidate =
        (enableStickyLabelCandidates && stickyIdentityKey
          ? stickyLabelState.candidateByIdentity.get(stickyIdentityKey)
          : null) ?? LABEL_CANDIDATES_IN_ORDER[0];
      const candidates = LABEL_CANDIDATES_IN_ORDER;
      const nextRecords = candidates.map((candidate) => {
        const featureId = buildLabelCandidateFeatureId(markerKey, candidate);
        const semanticRevision = buildLabelSourceFeatureDiffKey(
          stableLabelBaseFeature,
          `candidate:${candidate}:preferred:${preferredCandidate ?? LABEL_CANDIDATES_IN_ORDER[0]}`
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
            labelPreference: preferredCandidate ?? LABEL_CANDIDATES_IN_ORDER[0],
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
      appliedStickyEpoch: stickyLabelState.revision,
    };
  }, [
    allowLiveLabelUpdates,
    buildLabelCandidateFeatureId,
    buildOrderedRecords,
    buildStoreFromRecords,
    dirtyPinMarkerKeys,
    enableStickyLabelCandidates,
    getNowMs,
    getLabelStickyIdentityKeyFromFeature,
    pinFeatureIdsInOrder,
    pinFeaturesForDerivedSources,
    recordRuntimeAttribution,
    stickyLabelState,
  ]);

  React.useEffect(() => {
    labelMarkerIdentityKeyRef.current = labelCandidateResult.identityKey;
    labelCandidateAppliedStickyEpochRef.current = labelCandidateResult.appliedStickyEpoch;
    labelCandidateRecordsByMarkerKeyRef.current = labelCandidateResult.recordsByMarkerKey;
    labelCandidateSourceStoreRef.current = labelCandidateResult.store;
  }, [labelCandidateResult]);

  const nativeLabelResult = React.useMemo<DerivedSourceStoreResult>(() => {
    const previousStore = nativeLabelSourceStoreRef.current;
    const previousRecordsByMarkerKey = nativeLabelRecordsByMarkerKeyRef.current;
    const hasCommittedNativeLabelSourceStore =
      previousStore.sourceRevision.length > 0 || previousStore.idsInOrder.length > 0;
    if (!pinFeatureIdsInOrder.length) {
      const store = hasCommittedNativeLabelSourceStore
        ? buildStoreFromRecords(previousStore, [])
        : previousStore;
      return {
        store,
        recordsByMarkerKey: new Map(),
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
            ...record.feature.properties,
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
    };
  }, [
    buildOrderedRecords,
    buildStoreFromRecords,
    dirtyPinMarkerKeys,
    labelCandidateResult,
    pinFeatureIdsInOrder,
  ]);

  React.useEffect(() => {
    nativeLabelRecordsByMarkerKeyRef.current = nativeLabelResult.recordsByMarkerKey;
    nativeLabelSourceStoreRef.current = nativeLabelResult.store;
  }, [nativeLabelResult]);

  const collisionSourceStore = collisionResult.store;

  const nativeLabelSourceStore = nativeLabelResult.store;

  return {
    collisionSourceStore,
    nativeLabelSourceStore,
  };
};
