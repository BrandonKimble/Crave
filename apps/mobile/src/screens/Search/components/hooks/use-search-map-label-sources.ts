import React from 'react';

import type { Feature, Point } from 'geojson';

import type { RestaurantFeatureProperties } from '../search-map';
import {
  createSearchMapSourceTransportFeature,
  createSearchMapMutableSourceStore,
  getSearchMapSourceTransportFeature,
  type SearchMapMutableSourceStore,
  type SearchMapSourceStore,
} from '../../runtime/map/search-map-source-store';

export type LabelCandidate = 'bottom' | 'right' | 'top' | 'left';
const LABEL_CANDIDATES_IN_ORDER: readonly LabelCandidate[] = ['bottom', 'right', 'top', 'left'];

const buildLabelSourceFeatureDiffKey = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  extraKey: string
): string => `${extraKey}:${getSearchMapSourceTransportFeature(feature).diffKey}`;

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
  labelStickyCandidateByMarkerKeyRef: React.MutableRefObject<Map<string, LabelCandidate>>;
  labelStickyEpoch: number;
  isMapMovingRef: React.MutableRefObject<boolean>;
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
  labelStickyCandidateByMarkerKeyRef,
  labelStickyEpoch,
  isMapMovingRef,
}: UseSearchMapLabelSourcesArgs): UseSearchMapLabelSourcesResult => {
  const collisionSourceStoreRef = React.useRef<SearchMapMutableSourceStore>(
    createSearchMapMutableSourceStore()
  );
  const labelCandidateSourceStoreRef = React.useRef<SearchMapMutableSourceStore>(
    createSearchMapMutableSourceStore()
  );
  const nativeLabelSourceStoreRef = React.useRef<SearchMapMutableSourceStore>(
    createSearchMapMutableSourceStore()
  );
  const labelMarkerIdentityKeyRef = React.useRef('');
  const labelCandidateAppliedStickyEpochRef = React.useRef(-1);
  const previousPinSemanticRevisionByMarkerKeyRef = React.useRef<Map<string, string>>(new Map());
  const collisionRecordByMarkerKeyRef = React.useRef<
    Map<string, { feature: Feature<Point, RestaurantFeatureProperties>; semanticRevision: string }>
  >(new Map());
  const labelCandidateRecordsByMarkerKeyRef = React.useRef<Map<string, LabelFeatureRecord[]>>(
    new Map()
  );
  const nativeLabelRecordsByMarkerKeyRef = React.useRef<Map<string, LabelFeatureRecord[]>>(
    new Map()
  );
  const pinFeatureIdsInOrder = pinFeaturesForDerivedSources.idsInOrder;

  const dirtyPinMarkerKeys = React.useMemo(() => {
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
    previousPinSemanticRevisionByMarkerKeyRef.current = nextSemanticRevisionByMarkerKey;
    return nextDirtyMarkerKeys;
  }, [pinFeatureIdsInOrder, pinFeaturesForDerivedSources.semanticRevisionById]);

  const collisionSourceStore = React.useMemo<SearchMapSourceStore>(() => {
    const startedAtMs = getNowMs();
    if (!pinFeatureIdsInOrder.length) {
      collisionRecordByMarkerKeyRef.current.clear();
      collisionSourceStoreRef.current.clear();
      collisionSourceStoreRef.current.setOrder([]);
      return collisionSourceStoreRef.current.commit();
    }
    const hasCommittedCollisionSourceStore =
      collisionSourceStoreRef.current.sourceRevision.length > 0 ||
      collisionSourceStoreRef.current.idsInOrder.length > 0;
    const nextCollisionRecordsByMarkerKey = collisionRecordByMarkerKeyRef.current;
    let didChange = !hasCommittedCollisionSourceStore;
    for (const markerKey of dirtyPinMarkerKeys) {
      const feature = pinFeaturesForDerivedSources.featureById.get(markerKey);
      if (!feature) {
        if (nextCollisionRecordsByMarkerKey.delete(markerKey)) {
          collisionSourceStoreRef.current.removeFeature(markerKey);
          didChange = true;
        }
        continue;
      }
      const collisionDiffKey = buildLabelSourceFeatureDiffKey(feature, 'collision');
      const previousRecord = nextCollisionRecordsByMarkerKey.get(markerKey);
      if (previousRecord?.semanticRevision === collisionDiffKey) {
        continue;
      }
      const nextFeature = {
        type: 'Feature',
        id: markerKey,
        geometry: feature.geometry,
        properties: {
          markerKey,
          restaurantId: feature.properties.restaurantId,
        } as RestaurantFeatureProperties,
      } satisfies Feature<Point, RestaurantFeatureProperties>;
      nextCollisionRecordsByMarkerKey.set(markerKey, {
        feature: nextFeature,
        semanticRevision: collisionDiffKey,
      });
      collisionSourceStoreRef.current.upsertFeature(nextFeature, {
        featureId: markerKey,
        semanticRevision: collisionDiffKey,
        transportFeature: createSearchMapSourceTransportFeature({
          feature: nextFeature,
          diffKey: collisionDiffKey,
        }),
      });
      didChange = true;
    }
    if (!didChange) {
      return collisionSourceStoreRef.current;
    }
    collisionSourceStoreRef.current.setOrderFromGroupedIds(pinFeatureIdsInOrder, (markerKey) =>
      nextCollisionRecordsByMarkerKey.has(markerKey) ? [markerKey] : []
    );
    recordRuntimeAttribution('map_label_collision_build', getNowMs() - startedAtMs);
    return collisionSourceStoreRef.current.commit();
  }, [getNowMs, pinFeatureIdsInOrder, pinFeaturesForDerivedSources, recordRuntimeAttribution]);

  const labelCandidateSourceStore = React.useMemo<SearchMapSourceStore>(() => {
    const startedAtMs = getNowMs();
    const hasCachedResult =
      labelCandidateSourceStoreRef.current.sourceRevision.length > 0 ||
      labelCandidateSourceStoreRef.current.idsInOrder.length > 0;
    if (!pinFeatureIdsInOrder.length) {
      labelMarkerIdentityKeyRef.current = '';
      labelCandidateAppliedStickyEpochRef.current = labelStickyEpoch;
      labelCandidateRecordsByMarkerKeyRef.current.clear();
      labelCandidateSourceStoreRef.current.clear();
      recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
      labelCandidateSourceStoreRef.current.setOrder([]);
      return labelCandidateSourceStoreRef.current.commit();
    }

    const identityKey = pinFeaturesForDerivedSources.sourceRevision;

    const identityChanged = identityKey !== labelMarkerIdentityKeyRef.current;
    const shouldFreezeRebuild = !allowLiveLabelUpdates && hasCachedResult;
    const shouldDeferRebuild =
      identityChanged && hasCachedResult && (isMapMovingRef.current || shouldFreezeRebuild);
    const stickyEpochChanged = labelCandidateAppliedStickyEpochRef.current !== labelStickyEpoch;

    if (!stickyEpochChanged && ((!identityChanged && hasCachedResult) || shouldDeferRebuild)) {
      labelCandidateAppliedStickyEpochRef.current = labelStickyEpoch;
      recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
      return labelCandidateSourceStoreRef.current;
    }

    labelMarkerIdentityKeyRef.current = identityKey;
    const nextLabelCandidateRecordsByMarkerKey = labelCandidateRecordsByMarkerKeyRef.current;
    const dirtyCandidateMarkerKeys = stickyEpochChanged
      ? new Set(pinFeatureIdsInOrder)
      : new Set(dirtyPinMarkerKeys);
    labelCandidateSourceStoreRef.current.idsInOrder.forEach((featureId) => {
      const feature = labelCandidateSourceStoreRef.current.featureById.get(featureId);
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
          for (const previousRecord of previousRecords) {
            labelCandidateSourceStoreRef.current.removeFeature(previousRecord.featureId);
          }
          nextLabelCandidateRecordsByMarkerKey.delete(markerKey);
          didChange = true;
        }
        continue;
      }
      const stickyIdentityKey = getLabelStickyIdentityKeyFromFeature(feature);
      const lockedCandidate = enableStickyLabelCandidates
        ? stickyIdentityKey
          ? labelStickyCandidateByMarkerKeyRef.current.get(stickyIdentityKey)
          : null
        : null;
      const candidates = lockedCandidate ? [lockedCandidate] : LABEL_CANDIDATES_IN_ORDER;
      const nextRecords = candidates.map((candidate) => {
        const featureId = buildLabelCandidateFeatureId(markerKey, candidate);
        const semanticRevision = buildLabelSourceFeatureDiffKey(feature, `candidate:${candidate}`);
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
          ...feature,
          id: featureId,
          properties: { ...feature.properties, labelCandidate: candidate, markerKey },
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
        const nextRecordById = new Map(
          nextRecords.map((record) => [record.featureId, record] as const)
        );
        for (const previousRecord of previousRecords) {
          const nextRecord = nextRecordById.get(previousRecord.featureId);
          if (!nextRecord) {
            labelCandidateSourceStoreRef.current.removeFeature(previousRecord.featureId);
            continue;
          }
          if (nextRecord.semanticRevision !== previousRecord.semanticRevision) {
            labelCandidateSourceStoreRef.current.upsertFeature(nextRecord.feature, {
              featureId: nextRecord.featureId,
              semanticRevision: nextRecord.semanticRevision,
              transportFeature: nextRecord.transportFeature,
            });
          }
        }
        for (const nextRecord of nextRecords) {
          if (!previousRecords.some((record) => record.featureId === nextRecord.featureId)) {
            labelCandidateSourceStoreRef.current.upsertFeature(nextRecord.feature, {
              featureId: nextRecord.featureId,
              semanticRevision: nextRecord.semanticRevision,
              transportFeature: nextRecord.transportFeature,
            });
          }
        }
        didChange = true;
      }
      nextLabelCandidateRecordsByMarkerKey.set(markerKey, nextRecords);
    }
    if (!didChange) {
      labelCandidateAppliedStickyEpochRef.current = labelStickyEpoch;
      recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
      return labelCandidateSourceStoreRef.current;
    }
    labelCandidateAppliedStickyEpochRef.current = labelStickyEpoch;
    labelCandidateSourceStoreRef.current.setOrderFromGroupedIds(
      pinFeatureIdsInOrder,
      (markerKey) =>
        nextLabelCandidateRecordsByMarkerKey.get(markerKey)?.map((record) => record.featureId) ?? []
    );
    recordRuntimeAttribution('map_label_candidate_build', getNowMs() - startedAtMs);
    return labelCandidateSourceStoreRef.current.commit();
  }, [
    allowLiveLabelUpdates,
    buildLabelCandidateFeatureId,
    enableStickyLabelCandidates,
    getNowMs,
    getLabelStickyIdentityKeyFromFeature,
    labelStickyCandidateByMarkerKeyRef,
    labelStickyEpoch,
    pinFeatureIdsInOrder,
    pinFeaturesForDerivedSources,
    recordRuntimeAttribution,
    isMapMovingRef,
  ]);

  const nativeLabelSourceStore = React.useMemo<SearchMapSourceStore>(() => {
    const hasCommittedNativeLabelSourceStore =
      nativeLabelSourceStoreRef.current.sourceRevision.length > 0 ||
      nativeLabelSourceStoreRef.current.idsInOrder.length > 0;
    if (!pinFeatureIdsInOrder.length) {
      nativeLabelRecordsByMarkerKeyRef.current.clear();
      nativeLabelSourceStoreRef.current.clear();
      nativeLabelSourceStoreRef.current.setOrder([]);
      return nativeLabelSourceStoreRef.current.commit();
    }
    const nextNativeLabelRecordsByMarkerKey = nativeLabelRecordsByMarkerKeyRef.current;
    let didChange = !hasCommittedNativeLabelSourceStore;
    const markAllNativeDirty =
      !hasCommittedNativeLabelSourceStore ||
      nativeLabelSourceStoreRef.current.idsInOrder.length !==
        labelCandidateSourceStore.idsInOrder.length;
    const dirtyNativeMarkerKeys = markAllNativeDirty
      ? new Set(pinFeatureIdsInOrder)
      : new Set<string>();
    if (!markAllNativeDirty) {
      dirtyPinMarkerKeys.forEach((markerKey) => dirtyNativeMarkerKeys.add(markerKey));
      nativeLabelRecordsByMarkerKeyRef.current.forEach((_, markerKey) => {
        if (!labelCandidateRecordsByMarkerKeyRef.current.has(markerKey)) {
          dirtyNativeMarkerKeys.add(markerKey);
        }
      });
    }
    for (const markerKey of dirtyNativeMarkerKeys) {
      const candidateRecords = labelCandidateRecordsByMarkerKeyRef.current.get(markerKey);
      const previousRecords = nextNativeLabelRecordsByMarkerKey.get(markerKey) ?? [];
      if (!candidateRecords || candidateRecords.length === 0) {
        if (previousRecords.length > 0) {
          for (const previousRecord of previousRecords) {
            nativeLabelSourceStoreRef.current.removeFeature(previousRecord.featureId);
          }
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
        const nextRecordById = new Map(
          nextRecords.map((record) => [record.featureId, record] as const)
        );
        for (const previousRecord of previousRecords) {
          const nextRecord = nextRecordById.get(previousRecord.featureId);
          if (!nextRecord) {
            nativeLabelSourceStoreRef.current.removeFeature(previousRecord.featureId);
            continue;
          }
          if (nextRecord.semanticRevision !== previousRecord.semanticRevision) {
            nativeLabelSourceStoreRef.current.upsertFeature(nextRecord.feature, {
              featureId: nextRecord.featureId,
              semanticRevision: nextRecord.semanticRevision,
              transportFeature: nextRecord.transportFeature,
            });
          }
        }
        for (const nextRecord of nextRecords) {
          if (!previousRecords.some((record) => record.featureId === nextRecord.featureId)) {
            nativeLabelSourceStoreRef.current.upsertFeature(nextRecord.feature, {
              featureId: nextRecord.featureId,
              semanticRevision: nextRecord.semanticRevision,
              transportFeature: nextRecord.transportFeature,
            });
          }
        }
        didChange = true;
      }
      nextNativeLabelRecordsByMarkerKey.set(markerKey, nextRecords);
    }
    if (!didChange) {
      return nativeLabelSourceStoreRef.current;
    }
    nativeLabelSourceStoreRef.current.setOrderFromGroupedIds(
      pinFeatureIdsInOrder,
      (markerKey) =>
        nextNativeLabelRecordsByMarkerKey.get(markerKey)?.map((record) => record.featureId) ?? []
    );
    return nativeLabelSourceStoreRef.current.commit();
  }, [dirtyPinMarkerKeys, labelCandidateSourceStore, pinFeatureIdsInOrder]);

  return {
    collisionSourceStore,
    nativeLabelSourceStore,
  };
};
