import type { Feature, Point } from 'geojson';

import type { RestaurantFeatureProperties } from '../../components/search-map';

export type SearchMapSourceFeature = Feature<Point, RestaurantFeatureProperties>;

const transportFeatureCache = new WeakMap<
  SearchMapSourceFeature,
  SearchMapSourceTransportFeature
>();

const TRANSIENT_VISUAL_PROPERTY_KEYS = new Set([
  'nativeDotOpacity',
  'nativeHighlighted',
  'nativeLabelOpacity',
  'nativeLodOpacity',
  'nativeLodRankOpacity',
  'nativePresentationOpacity',
]);

type SearchMapSourceTransportFeatureState = {
  nativeDotOpacity?: number;
  nativeHighlighted?: number;
  nativeLabelOpacity?: number;
  nativeLodOpacity?: number;
  nativeLodRankOpacity?: number;
  nativePresentationOpacity?: number;
};

export type SearchMapSourceTransportFeature = {
  id: string;
  lng: number;
  lat: number;
  properties?: RestaurantFeatureProperties;
  diffKey: string;
  markerKey: string;
  featureState?: SearchMapSourceTransportFeatureState;
};

export type SearchMapSourceStoreDelta = {
  mode: 'patch' | 'replace';
  nextFeatureIdsInOrder: string[];
  removeIds: string[];
  dirtyGroupIds?: string[];
  orderChangedGroupIds?: string[];
  removedGroupIds?: string[];
  upsertFeatures?: SearchMapSourceTransportFeature[];
};

export type SearchMapCommittedSourceDeltaJournal = {
  baseSourceRevision: string;
  sourceRevision: string;
  delta: SearchMapSourceStoreDelta;
};

export type SearchMapSourceStore = {
  idsInOrder: readonly string[];
  featureById: ReadonlyMap<string, SearchMapSourceFeature>;
  transportFeatureById: ReadonlyMap<string, SearchMapSourceTransportFeature>;
  semanticRevisionById: ReadonlyMap<string, string>;
  revisionById: ReadonlyMap<string, string>;
  sourceRevision: string;
  committedDeltaJournal: SearchMapCommittedSourceDeltaJournal | null;
  committedDeltaJournalHistory: readonly SearchMapCommittedSourceDeltaJournal[];
  acknowledgeTransportRevision: (sourceRevision: string | null) => void;
  buildReplaceDelta: () => SearchMapSourceStoreDelta;
};

export type SearchMapSourceStoreBuilder = {
  appendFeature: (
    feature: SearchMapSourceFeature,
    options?: {
      featureId?: string;
      semanticRevision?: string;
      transportFeature?: SearchMapSourceTransportFeature;
    }
  ) => void;
  finish: () => SearchMapSourceStore;
};

export type SearchMapMutableSourceStore = SearchMapSourceStore & {
  clear: () => void;
  removeFeature: (featureId: string) => void;
  setOrder: (nextFeatureIdsInOrder: readonly string[]) => void;
  setOrderFromGroupedIds: (
    orderedGroupIds: readonly string[],
    getFeatureIdsForGroup: (groupId: string) => readonly string[] | null | undefined
  ) => void;
  upsertFeature: (
    feature: SearchMapSourceFeature,
    options?: {
      featureId?: string;
      semanticRevision?: string;
      transportFeature?: SearchMapSourceTransportFeature;
    }
  ) => void;
  commit: () => SearchMapSourceStore;
};

const createEmptySearchMapSourceStoreState = () => ({
  idsInOrder: [],
  featureById: new Map(),
  transportFeatureById: new Map(),
  semanticRevisionById: new Map(),
  revisionById: new Map(),
  sourceRevision: '',
  committedDeltaJournal: null,
  committedDeltaJournalHistory: [],
  acknowledgeTransportRevision: () => {},
  buildReplaceDelta: () => ({
    mode: 'replace' as const,
    nextFeatureIdsInOrder: [],
    removeIds: [],
  }),
});

export const EMPTY_SEARCH_MAP_SOURCE_STORE: SearchMapSourceStore =
  createEmptySearchMapSourceStoreState();

const areStringArraysEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const assertUniqueOrderedFeatureIds = (
  featureIds: readonly string[],
  context: string
): string[] => {
  const seenFeatureIds = new Set<string>();
  const nextFeatureIds: string[] = [];
  for (const featureId of featureIds) {
    if (!featureId) {
      throw new Error(`[SearchMapSourceStore] Missing feature id in ${context}`);
    }
    if (seenFeatureIds.has(featureId)) {
      throw new Error(`[SearchMapSourceStore] Duplicate feature id "${featureId}" in ${context}`);
    }
    seenFeatureIds.add(featureId);
    nextFeatureIds.push(featureId);
  }
  return nextFeatureIds;
};

const requireStringFeatureId = (featureId: unknown, context: string): string => {
  if (typeof featureId !== 'string' || featureId.length === 0) {
    throw new Error(`[SearchMapSourceStore] Missing feature id in ${context}`);
  }
  return featureId;
};

const cloneStringArrayMap = (
  source: ReadonlyMap<string, readonly string[]> | Map<string, string[]>
): Map<string, string[]> =>
  new Map<string, string[]>([...source.entries()].map(([key, value]) => [key, [...value]]));

const cloneSourceStoreDelta = (delta: SearchMapSourceStoreDelta): SearchMapSourceStoreDelta => ({
  mode: delta.mode,
  nextFeatureIdsInOrder: [...delta.nextFeatureIdsInOrder],
  removeIds: [...delta.removeIds],
  ...(delta.dirtyGroupIds ? { dirtyGroupIds: [...delta.dirtyGroupIds] } : {}),
  ...(delta.orderChangedGroupIds ? { orderChangedGroupIds: [...delta.orderChangedGroupIds] } : {}),
  ...(delta.removedGroupIds ? { removedGroupIds: [...delta.removedGroupIds] } : {}),
  ...(delta.upsertFeatures ? { upsertFeatures: [...delta.upsertFeatures] } : {}),
});

const cloneCommittedDeltaJournal = (
  journal: SearchMapCommittedSourceDeltaJournal | null
): SearchMapCommittedSourceDeltaJournal | null =>
  journal == null
    ? null
    : {
        baseSourceRevision: journal.baseSourceRevision,
        sourceRevision: journal.sourceRevision,
        delta: cloneSourceStoreDelta(journal.delta),
      };

const cloneCommittedDeltaJournalHistory = (
  journals: readonly SearchMapCommittedSourceDeltaJournal[]
): SearchMapCommittedSourceDeltaJournal[] =>
  journals.map((journal) => cloneCommittedDeltaJournal(journal)!);

type SearchMapSourceStoreTransportSyncState = {
  acknowledgedSourceRevision: string | null;
};

const transportSyncStateSymbol = Symbol('searchMapSourceStoreTransportSyncState');

type SearchMapSourceStoreInternal = SearchMapSourceStore & {
  [transportSyncStateSymbol]: SearchMapSourceStoreTransportSyncState;
};

const getTransportSyncState = (
  store: SearchMapSourceStore | null
): SearchMapSourceStoreTransportSyncState => {
  const existingState = (store as SearchMapSourceStoreInternal | null)?.[transportSyncStateSymbol];
  if (existingState) {
    return existingState;
  }
  return {
    acknowledgedSourceRevision: null,
  };
};

const pruneCommittedDeltaJournalHistory = (
  journals: readonly SearchMapCommittedSourceDeltaJournal[],
  acknowledgedSourceRevision: string | null,
  currentSourceRevision: string
): SearchMapCommittedSourceDeltaJournal[] => {
  if (
    journals.length === 0 ||
    acknowledgedSourceRevision == null ||
    acknowledgedSourceRevision === currentSourceRevision
  ) {
    return [];
  }
  const startIndex = journals.findIndex(
    (journal) => journal.baseSourceRevision === acknowledgedSourceRevision
  );
  if (startIndex === -1) {
    return [];
  }
  return journals.slice(startIndex);
};

const buildGroupedFeatureIds = (
  idsInOrder: readonly string[],
  transportFeatureById: ReadonlyMap<string, SearchMapSourceTransportFeature>
): Map<string, string[]> => {
  const featureIdsByGroup = new Map<string, string[]>();
  for (const featureId of idsInOrder) {
    const markerKey = transportFeatureById.get(featureId)?.markerKey ?? featureId;
    const featureIds = featureIdsByGroup.get(markerKey);
    if (featureIds) {
      featureIds.push(featureId);
    } else {
      featureIdsByGroup.set(markerKey, [featureId]);
    }
  }
  return featureIdsByGroup;
};

export const createSearchMapMutableSourceStore = (
  initialStore: SearchMapSourceStore | null = null
): SearchMapMutableSourceStore => {
  const initialState = initialStore ?? EMPTY_SEARCH_MAP_SOURCE_STORE;
  const transportSyncState = getTransportSyncState(initialState);
  let idsInOrder = [...initialState.idsInOrder];
  let featureById = new Map(initialState.featureById);
  let transportFeatureById = new Map(initialState.transportFeatureById);
  let semanticRevisionById = new Map(initialState.semanticRevisionById);
  let revisionById = new Map(initialState.revisionById);
  let pendingUpsertTransportFeatureById = new Map<string, SearchMapSourceTransportFeature>();
  let sourceRevision = initialState.sourceRevision;
  let lastCommittedIdsInOrder = [...initialState.idsInOrder];
  let lastCommittedRevisionById = new Map(initialState.revisionById);
  let lastCommittedTransportFeatureById = new Map(initialState.transportFeatureById);
  let lastCommittedFeatureIds = new Set(initialState.idsInOrder);
  let groupedOrderIds: string[] | null = null;
  let featureIdsByGroup = buildGroupedFeatureIds(
    initialState.idsInOrder,
    initialState.transportFeatureById
  );
  let pendingDirtyGroupIds = new Set<string>();
  let pendingOrderChangedGroupIds = new Set<string>();
  let pendingRemovedGroupIds = new Set<string>();
  let lastCommittedDeltaJournal: SearchMapCommittedSourceDeltaJournal | null = null;
  let committedDeltaJournalHistory = pruneCommittedDeltaJournalHistory(
    cloneCommittedDeltaJournalHistory(initialState.committedDeltaJournalHistory),
    transportSyncState.acknowledgedSourceRevision,
    initialState.sourceRevision
  );

  const parseSourceRevisionVersion = (sourceRevision: string): number => {
    if (!sourceRevision.startsWith('v')) {
      return 0;
    }
    const parsed = Number.parseInt(sourceRevision.slice(1), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  let committedRevisionVersion = parseSourceRevisionVersion(sourceRevision);

  const addPendingDirtyGroup = (groupId: string | null | undefined) => {
    if (!groupId) {
      return;
    }
    pendingDirtyGroupIds.add(groupId);
  };

  const addPendingOrderChangedGroup = (groupId: string | null | undefined) => {
    if (!groupId) {
      return;
    }
    pendingOrderChangedGroupIds.add(groupId);
    pendingDirtyGroupIds.add(groupId);
  };

  const addPendingRemovedGroup = (groupId: string | null | undefined) => {
    if (!groupId) {
      return;
    }
    pendingRemovedGroupIds.add(groupId);
    pendingOrderChangedGroupIds.add(groupId);
    pendingDirtyGroupIds.add(groupId);
  };

  const buildReplaceDelta = (): SearchMapSourceStoreDelta => {
    const nextFeatureIdsInOrder = [...idsInOrder];
    const upsertFeatures = nextFeatureIdsInOrder.map((featureId) => {
      const transportFeature = transportFeatureById.get(featureId);
      if (!transportFeature) {
        throw new Error(
          `[SearchMapSourceStore] Missing transport feature "${featureId}" while building replace delta`
        );
      }
      return transportFeature;
    });
    const dirtyGroupIds = new Set<string>(upsertFeatures.map((feature) => feature.markerKey));
    return {
      mode: 'replace',
      nextFeatureIdsInOrder,
      removeIds: [],
      ...(dirtyGroupIds.size > 0 ? { dirtyGroupIds: [...dirtyGroupIds] } : {}),
      ...(dirtyGroupIds.size > 0 ? { orderChangedGroupIds: [...dirtyGroupIds] } : {}),
      ...(upsertFeatures.length > 0 ? { upsertFeatures } : {}),
    };
  };

  const refreshCommittedDeltaJournalHistory = () => {
    committedDeltaJournalHistory = pruneCommittedDeltaJournalHistory(
      committedDeltaJournalHistory,
      transportSyncState.acknowledgedSourceRevision,
      sourceRevision
    );
  };

  const store: SearchMapMutableSourceStore = {
    get idsInOrder() {
      return idsInOrder;
    },
    get featureById() {
      return featureById;
    },
    get transportFeatureById() {
      return transportFeatureById;
    },
    get semanticRevisionById() {
      return semanticRevisionById;
    },
    get revisionById() {
      return revisionById;
    },
    get sourceRevision() {
      return sourceRevision;
    },
    get committedDeltaJournal() {
      return cloneCommittedDeltaJournal(lastCommittedDeltaJournal);
    },
    get committedDeltaJournalHistory() {
      refreshCommittedDeltaJournalHistory();
      return cloneCommittedDeltaJournalHistory(committedDeltaJournalHistory);
    },
    acknowledgeTransportRevision(nextAcknowledgedSourceRevision) {
      transportSyncState.acknowledgedSourceRevision = nextAcknowledgedSourceRevision;
      refreshCommittedDeltaJournalHistory();
    },
    buildReplaceDelta() {
      return buildReplaceDelta();
    },
    clear() {
      for (const transportFeature of transportFeatureById.values()) {
        addPendingRemovedGroup(transportFeature.markerKey);
      }
      idsInOrder = [];
      featureById.clear();
      transportFeatureById.clear();
      semanticRevisionById.clear();
      revisionById.clear();
      pendingUpsertTransportFeatureById.clear();
      groupedOrderIds = null;
      featureIdsByGroup.clear();
    },
    removeFeature(featureId: string) {
      const previousTransportFeature =
        transportFeatureById.get(featureId) ?? lastCommittedTransportFeatureById.get(featureId);
      addPendingRemovedGroup(previousTransportFeature?.markerKey ?? featureId);
      featureById.delete(featureId);
      transportFeatureById.delete(featureId);
      semanticRevisionById.delete(featureId);
      revisionById.delete(featureId);
      pendingUpsertTransportFeatureById.delete(featureId);
    },
    setOrderFromGroupedIds(orderedGroupIds, getFeatureIdsForGroup) {
      const nextOrderedGroupIds = [...orderedGroupIds];
      const nextFeatureIdsByGroup = new Map<string, string[]>();
      const seenOrderedFeatureIds = new Set<string>();
      let orderChanged =
        groupedOrderIds == null || !areStringArraysEqual(nextOrderedGroupIds, groupedOrderIds);

      for (const groupId of nextOrderedGroupIds) {
        const rawFeatureIds = getFeatureIdsForGroup(groupId) ?? [];
        const nextFeatureIds: string[] = [];
        for (const featureId of rawFeatureIds) {
          if (!featureId) {
            throw new Error(
              `[SearchMapSourceStore] Missing feature id in grouped order for "${groupId}"`
            );
          }
          if (seenOrderedFeatureIds.has(featureId)) {
            throw new Error(
              `[SearchMapSourceStore] Duplicate feature id "${featureId}" across grouped order`
            );
          }
          seenOrderedFeatureIds.add(featureId);
          nextFeatureIds.push(featureId);
        }
        nextFeatureIdsByGroup.set(groupId, nextFeatureIds);
        const previousFeatureIds = featureIdsByGroup.get(groupId);
        if (!previousFeatureIds || !areStringArraysEqual(previousFeatureIds, nextFeatureIds)) {
          orderChanged = true;
        }
      }

      if (!orderChanged && featureIdsByGroup.size !== nextFeatureIdsByGroup.size) {
        orderChanged = true;
      }

      const changedGroupIds = new Set<string>([
        ...featureIdsByGroup.keys(),
        ...nextFeatureIdsByGroup.keys(),
      ]);
      for (const groupId of changedGroupIds) {
        const previousFeatureIds = featureIdsByGroup.get(groupId) ?? [];
        const nextFeatureIdsForGroup = nextFeatureIdsByGroup.get(groupId) ?? [];
        if (!areStringArraysEqual(previousFeatureIds, nextFeatureIdsForGroup)) {
          addPendingOrderChangedGroup(groupId);
          if (nextFeatureIdsForGroup.length === 0) {
            addPendingRemovedGroup(groupId);
          }
        }
      }
      if (groupedOrderIds != null && !areStringArraysEqual(nextOrderedGroupIds, groupedOrderIds)) {
        for (const groupId of new Set([...groupedOrderIds, ...nextOrderedGroupIds])) {
          addPendingOrderChangedGroup(groupId);
        }
      }

      groupedOrderIds = nextOrderedGroupIds;
      featureIdsByGroup = nextFeatureIdsByGroup;
      if (!orderChanged) {
        return;
      }

      const nextIdsInOrder: string[] = [];
      for (const groupId of nextOrderedGroupIds) {
        const featureIds = nextFeatureIdsByGroup.get(groupId);
        if (!featureIds || featureIds.length === 0) {
          continue;
        }
        nextIdsInOrder.push(...featureIds);
      }
      idsInOrder = nextIdsInOrder;
    },
    upsertFeature(feature, options) {
      const featureId = requireStringFeatureId(options?.featureId ?? feature.id, 'upsertFeature');
      const semanticRevision =
        typeof options?.semanticRevision === 'string' && options.semanticRevision.length > 0
          ? options.semanticRevision
          : getSearchMapSourceTransportFeature(feature).diffKey;
      const previousTransportFeature =
        transportFeatureById.get(featureId) ?? lastCommittedTransportFeatureById.get(featureId);
      featureById.set(featureId, feature);
      semanticRevisionById.set(featureId, semanticRevision);
      const nextTransportFeature =
        options?.transportFeature ??
        createSearchMapSourceTransportFeature({
          feature,
          diffKey: semanticRevision,
        });
      transportFeatureById.set(featureId, nextTransportFeature);
      const transportRevision = getSearchMapSourceTransportFeatureRevision(nextTransportFeature);
      revisionById.set(featureId, transportRevision);
      const previousMarkerKey = previousTransportFeature?.markerKey;
      if (previousMarkerKey && previousMarkerKey !== nextTransportFeature.markerKey) {
        addPendingRemovedGroup(previousMarkerKey);
        addPendingOrderChangedGroup(nextTransportFeature.markerKey);
      }
      const committedRevision = lastCommittedRevisionById.get(featureId);
      if (committedRevision === transportRevision && lastCommittedFeatureIds.has(featureId)) {
        pendingUpsertTransportFeatureById.delete(featureId);
        return;
      }
      pendingUpsertTransportFeatureById.set(featureId, nextTransportFeature);
      addPendingDirtyGroup(nextTransportFeature.markerKey);
      if (!lastCommittedFeatureIds.has(featureId)) {
        addPendingOrderChangedGroup(nextTransportFeature.markerKey);
      }
    },
    setOrder(nextFeatureIdsInOrder) {
      idsInOrder = assertUniqueOrderedFeatureIds(nextFeatureIdsInOrder, 'setOrder');
      const nextFeatureIdsByGroup = buildGroupedFeatureIds(idsInOrder, transportFeatureById);
      const changedGroupIds = new Set<string>([
        ...featureIdsByGroup.keys(),
        ...nextFeatureIdsByGroup.keys(),
      ]);
      for (const groupId of changedGroupIds) {
        const previousFeatureIds = featureIdsByGroup.get(groupId) ?? [];
        const nextFeatureIdsForGroup = nextFeatureIdsByGroup.get(groupId) ?? [];
        if (!areStringArraysEqual(previousFeatureIds, nextFeatureIdsForGroup)) {
          addPendingOrderChangedGroup(groupId);
          if (nextFeatureIdsForGroup.length === 0) {
            addPendingRemovedGroup(groupId);
          }
        }
      }
      groupedOrderIds = null;
      featureIdsByGroup = nextFeatureIdsByGroup;
    },
    commit() {
      const orderChanged =
        lastCommittedIdsInOrder.length !== idsInOrder.length ||
        lastCommittedIdsInOrder.some((featureId, index) => idsInOrder[index] !== featureId);
      const committedRecordsStillPresent = lastCommittedIdsInOrder.every((featureId) => {
        return (
          featureById.has(featureId) &&
          transportFeatureById.has(featureId) &&
          semanticRevisionById.has(featureId) &&
          revisionById.has(featureId)
        );
      });
      if (
        pendingUpsertTransportFeatureById.size === 0 &&
        !orderChanged &&
        committedRecordsStillPresent
      ) {
        return store;
      }

      const committedIdsInOrder: string[] = [];
      const nextFeatureById = new Map<string, SearchMapSourceFeature>();
      const nextTransportFeatureById = new Map<string, SearchMapSourceTransportFeature>();
      const nextSemanticRevisionById = new Map<string, string>();
      const nextRevisionById = new Map<string, string>();
      const nextIds = new Set<string>();

      for (const featureId of idsInOrder) {
        const feature = featureById.get(featureId);
        const transportFeature = transportFeatureById.get(featureId);
        const semanticRevision = semanticRevisionById.get(featureId);
        const revision = revisionById.get(featureId);
        if (!feature || !transportFeature || !semanticRevision || !revision) {
          throw new Error(
            `[SearchMapSourceStore] Incomplete committed feature state for "${featureId}" during commit`
          );
        }
        committedIdsInOrder.push(featureId);
        nextIds.add(featureId);
        nextFeatureById.set(featureId, feature);
        nextTransportFeatureById.set(featureId, transportFeature);
        nextSemanticRevisionById.set(featureId, semanticRevision);
        nextRevisionById.set(featureId, revision);
      }

      const removeIds = lastCommittedIdsInOrder.filter((featureId) => !nextIds.has(featureId));
      const upsertFeatures = committedIdsInOrder.flatMap((featureId) => {
        const transportFeature = pendingUpsertTransportFeatureById.get(featureId);
        return transportFeature ? [transportFeature] : [];
      });
      const nextCommittedFeatureIdsByGroup =
        groupedOrderIds == null
          ? buildGroupedFeatureIds(committedIdsInOrder, nextTransportFeatureById)
          : cloneStringArrayMap(featureIdsByGroup);
      const removedGroupIds = new Set(
        [...pendingRemovedGroupIds].filter((groupId) => {
          const nextFeatureIdsForGroup = nextCommittedFeatureIdsByGroup.get(groupId);
          return !nextFeatureIdsForGroup || nextFeatureIdsForGroup.length === 0;
        })
      );
      const dirtyGroupIds = new Set<string>(pendingDirtyGroupIds);
      const orderChangedGroupIds = new Set<string>(pendingOrderChangedGroupIds);
      for (const transportFeature of upsertFeatures) {
        dirtyGroupIds.add(transportFeature.markerKey);
      }
      for (const removedFeatureId of removeIds) {
        const removedMarkerKey =
          lastCommittedTransportFeatureById.get(removedFeatureId)?.markerKey ?? removedFeatureId;
        dirtyGroupIds.add(removedMarkerKey);
        if (!removedGroupIds.has(removedMarkerKey)) {
          orderChangedGroupIds.add(removedMarkerKey);
        }
      }
      for (const removedGroupId of removedGroupIds) {
        dirtyGroupIds.add(removedGroupId);
        orderChangedGroupIds.add(removedGroupId);
      }
      const hasDelta = orderChanged || removeIds.length > 0 || upsertFeatures.length > 0;
      const previousSourceRevision = sourceRevision;
      sourceRevision = hasDelta ? `v${committedRevisionVersion + 1}` : sourceRevision;
      committedRevisionVersion = parseSourceRevisionVersion(sourceRevision);
      idsInOrder = [...committedIdsInOrder];
      featureById = new Map(nextFeatureById);
      transportFeatureById = new Map(nextTransportFeatureById);
      semanticRevisionById = new Map(nextSemanticRevisionById);
      revisionById = new Map(nextRevisionById);
      lastCommittedIdsInOrder = [...committedIdsInOrder];
      lastCommittedRevisionById = new Map(nextRevisionById);
      lastCommittedTransportFeatureById = new Map(nextTransportFeatureById);
      lastCommittedFeatureIds = new Set(committedIdsInOrder);
      pendingUpsertTransportFeatureById = new Map();
      featureIdsByGroup = cloneStringArrayMap(nextCommittedFeatureIdsByGroup);
      lastCommittedDeltaJournal = hasDelta
        ? {
            baseSourceRevision: previousSourceRevision,
            sourceRevision,
            delta: {
              mode: 'patch',
              nextFeatureIdsInOrder: [...committedIdsInOrder],
              removeIds,
              ...(dirtyGroupIds.size > 0 ? { dirtyGroupIds: [...dirtyGroupIds] } : {}),
              ...(orderChangedGroupIds.size > 0
                ? { orderChangedGroupIds: [...orderChangedGroupIds] }
                : {}),
              ...(removedGroupIds.size > 0 ? { removedGroupIds: [...removedGroupIds] } : {}),
              ...(upsertFeatures.length > 0 ? { upsertFeatures } : {}),
            },
          }
        : null;
      committedDeltaJournalHistory = lastCommittedDeltaJournal
        ? [...committedDeltaJournalHistory, cloneCommittedDeltaJournal(lastCommittedDeltaJournal)!]
        : committedDeltaJournalHistory;
      refreshCommittedDeltaJournalHistory();
      pendingDirtyGroupIds = new Set();
      pendingOrderChangedGroupIds = new Set();
      pendingRemovedGroupIds = new Set();
      return store;
    },
  };
  (store as SearchMapSourceStoreInternal)[transportSyncStateSymbol] = transportSyncState;
  return store;
};

export const createSearchMapSourceStoreBuilder = (
  previousStore: SearchMapSourceStore | null = null
): SearchMapSourceStoreBuilder => {
  const mutableStore = createSearchMapMutableSourceStore(previousStore);
  const idsInOrder: string[] = [];

  return {
    appendFeature(feature, options) {
      const featureId = requireStringFeatureId(options?.featureId ?? feature.id, 'appendFeature');
      idsInOrder.push(featureId);
      mutableStore.upsertFeature(feature, options);
    },
    finish() {
      mutableStore.setOrder(idsInOrder);
      return mutableStore.commit();
    },
  };
};

export const materializeSearchMapSourceStoreCollection = (
  store: SearchMapSourceStore
): FeatureCollection<Point, RestaurantFeatureProperties> => ({
  type: 'FeatureCollection',
  features: store.idsInOrder.map((featureId) => {
    const feature = store.featureById.get(featureId);
    if (!feature) {
      throw new Error(
        `[SearchMapSourceStore] Missing feature "${featureId}" while materializing source store collection`
      );
    }
    return feature;
  }),
});

const appendStableDiffValue = (
  parts: string[],
  value: unknown,
  {
    isFeatureRoot = false,
    isPropertiesRoot = false,
  }: { isFeatureRoot?: boolean; isPropertiesRoot?: boolean } = {}
): void => {
  if (value == null) {
    parts.push('null');
    return;
  }
  if (Array.isArray(value)) {
    parts.push('[');
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) {
        parts.push(',');
      }
      appendStableDiffValue(parts, value[index]);
    }
    parts.push(']');
    return;
  }
  if (typeof value === 'object') {
    parts.push('{');
    const object = value as Record<string, unknown>;
    let didWrite = false;
    for (const key of Object.keys(object).sort()) {
      if (isFeatureRoot && key === 'id') {
        continue;
      }
      if (isPropertiesRoot && TRANSIENT_VISUAL_PROPERTY_KEYS.has(key)) {
        continue;
      }
      if (didWrite) {
        parts.push(',');
      }
      didWrite = true;
      parts.push(key, ':');
      appendStableDiffValue(parts, object[key], {
        isPropertiesRoot: key === 'properties',
      });
    }
    parts.push('}');
    return;
  }
  if (typeof value === 'string') {
    parts.push('"', value, '"');
    return;
  }
  parts.push(String(value));
};

const buildSearchMapSourceFeatureDiffKey = (feature: SearchMapSourceFeature): string => {
  const parts: string[] = [];
  appendStableDiffValue(parts, feature as unknown as Record<string, unknown>, {
    isFeatureRoot: true,
  });
  return parts.join('');
};

export const getSearchMapSourceTransportFeature = (
  feature: SearchMapSourceFeature
): SearchMapSourceTransportFeature => {
  const cached = transportFeatureCache.get(feature);
  if (cached != null) {
    return cached;
  }
  const transportFeature = createSearchMapSourceTransportFeature({
    feature,
    diffKey: buildSearchMapSourceFeatureDiffKey(feature),
  });
  transportFeatureCache.set(feature, transportFeature);
  return transportFeature;
};

export const createSearchMapSourceTransportFeature = ({
  feature,
  diffKey,
}: {
  feature: SearchMapSourceFeature;
  diffKey: string;
}): SearchMapSourceTransportFeature => {
  const featureId = typeof feature.id === 'string' ? feature.id : '';
  const markerKey =
    typeof feature.properties?.markerKey === 'string' && feature.properties.markerKey.length > 0
      ? feature.properties.markerKey
      : featureId;
  const [lng, lat] = feature.geometry.coordinates;
  const featureState = Array.from(
    TRANSIENT_VISUAL_PROPERTY_KEYS
  ).reduce<SearchMapSourceTransportFeatureState>((nextState, key) => {
    const value = feature.properties?.[key as keyof RestaurantFeatureProperties];
    if (typeof value === 'number' && Number.isFinite(value)) {
      nextState[key as keyof SearchMapSourceTransportFeatureState] = value;
    }
    return nextState;
  }, {});
  const transportFeature: SearchMapSourceTransportFeature = {
    id: featureId,
    lng,
    lat,
    ...(feature.properties != null ? { properties: feature.properties } : {}),
    diffKey,
    markerKey,
    ...(Object.keys(featureState).length > 0 ? { featureState } : {}),
  };
  return transportFeature;
};

export const getSearchMapSourceTransportFeatureRevision = (
  transportFeature: SearchMapSourceTransportFeature
): string => {
  const featureStateRevision = transportFeature.featureState
    ? Object.entries(transportFeature.featureState)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${value}`)
        .join(',')
    : '';
  return `${transportFeature.diffKey}|${featureStateRevision}`;
};
