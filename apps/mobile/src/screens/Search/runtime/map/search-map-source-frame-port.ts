import React from 'react';
import { useSyncExternalStore } from 'react';

import {
  EMPTY_SEARCH_MAP_SOURCE_STORE,
  type SearchMapSourceStore,
} from './search-map-source-store';

export type SearchMapSourceFrameSnapshot = {
  visualCycleKey: string | null;
  selectedRestaurantId: string | null;
  pinSourceStore: SearchMapSourceStore;
  dotSourceStore: SearchMapSourceStore;
  pinInteractionSourceStore: SearchMapSourceStore;
  labelSourceStore: SearchMapSourceStore;
  labelCollisionSourceStore: SearchMapSourceStore;
  labelDerivedSourceIdentityKey: string;
  markersRenderKey: string;
  visibleSortedRestaurantMarkersCount: number;
  visibleDotRestaurantFeaturesCount: number;
  isShortcutCoverageLoading: boolean;
  shortcutCoverageRequestKey: string | null;
  shortcutCoverageReadinessStatus:
    | 'idle'
    | 'loading'
    | 'completed'
    | 'empty'
    | 'failed'
    | 'aborted'
    | 'superseded';
  shortcutCoverageReadinessReason: string | null;
  mapSearchSurfaceResultsSourcesReady: boolean;
  mapSearchSurfaceResultsSourcesReadyKey: string | null;
  // The full ranked candidate catalog (pins via native LOD promotion) rides the SAME snapshot as the
  // dots/labels sources so the two channels can never desync: one publish + one dedup governs both, and a
  // cached-frame replay carries the catalog with it. Deduped on `.key` (changes only on a data change), so
  // it never churns per camera tick. The render owner forwards it to native setCandidateCatalog on submit.
  candidateCatalog: SearchMapCandidateCatalog | null;
};

export type SearchMapSourceFrameSnapshotKey = keyof SearchMapSourceFrameSnapshot;

export type SearchMapSourceFrameVisualStatePatch = Pick<
  SearchMapSourceFrameSnapshot,
  | 'visualCycleKey'
  | 'visibleSortedRestaurantMarkersCount'
  | 'visibleDotRestaurantFeaturesCount'
  | 'isShortcutCoverageLoading'
  | 'shortcutCoverageRequestKey'
  | 'shortcutCoverageReadinessStatus'
  | 'shortcutCoverageReadinessReason'
  | 'mapSearchSurfaceResultsSourcesReady'
  | 'mapSearchSurfaceResultsSourcesReadyKey'
>;

// Stage B: the full ranked candidate catalog (every showable marker's key +
// coordinate + rank), published once per results change. Kept OFF the per-frame
// snapshot (which churns every viewport tick) so it is pushed to native only when
// the candidate set actually changes. The owner reads it during frame submit and
// forwards it to the native screen-space projector via setCandidateCatalog.
export type SearchMapCandidateCatalogEntry = {
  markerKey: string;
  lng: number;
  lat: number;
  rank: number;
  // The resolved pin sprite ids (rank badge + active/highlighted variant), so the native pin OVERLAY
  // can render the exact same sprite the GL pin layer used to, pulled from the Mapbox style by id.
  badgeImageId?: string;
  activeBadgeImageId?: string;
  // The restaurant id, so the overlay's tap hit-test can emit the same press target the GL pin did.
  restaurantId?: string;
};

export type SearchMapCandidateCatalog = {
  key: string;
  entries: ReadonlyArray<SearchMapCandidateCatalogEntry>;
};

// Stage B (B2/B3): the native screen-space projector's latest on-screen marker
// set, written by the render owner from the `map_native_visible_markers` event and
// read by the JS selection policy to replace the padded lat/lng AABB visibility test.
export type SearchMapNativeVisibleMarkers = {
  markerKeys: ReadonlyArray<string>;
  // Native's LIVE promoted set (top-N by rank of the on-screen subset) — used to bake the label-
  // collision obstacle from CURRENT promotion so labels yield to mid-zoom-promoted pins (#16).
  nativePromotedKeys: ReadonlyArray<string>;
  catalogCount: number;
};

export type SearchMapSourceFramePort = {
  getSnapshot: () => SearchMapSourceFrameSnapshot;
  publishSnapshot: (snapshot: SearchMapSourceFrameSnapshot) => boolean;
  publishVisualState: (patch: Partial<SearchMapSourceFrameVisualStatePatch>) => boolean;
  // The candidate catalog now rides the frame snapshot (see SearchMapSourceFrameSnapshot.candidateCatalog);
  // this getter reads it from the committed snapshot so the render owner forwards the SAME catalog that was
  // committed atomically with the dots/labels — no separate publish channel that could arrive out of order.
  getCandidateCatalog: () => SearchMapCandidateCatalog | null;
  publishNativeVisibleMarkerKeys: (visible: SearchMapNativeVisibleMarkers) => void;
  getNativeVisibleMarkerKeys: () => SearchMapNativeVisibleMarkers | null;
  reset: () => void;
  subscribe: (
    listener: () => void,
    observedKeys?: readonly SearchMapSourceFrameSnapshotKey[],
    debugLabel?: string
  ) => () => void;
};

export const EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT: SearchMapSourceFrameSnapshot = {
  visualCycleKey: null,
  selectedRestaurantId: null,
  pinSourceStore: EMPTY_SEARCH_MAP_SOURCE_STORE,
  dotSourceStore: EMPTY_SEARCH_MAP_SOURCE_STORE,
  pinInteractionSourceStore: EMPTY_SEARCH_MAP_SOURCE_STORE,
  labelSourceStore: EMPTY_SEARCH_MAP_SOURCE_STORE,
  labelCollisionSourceStore: EMPTY_SEARCH_MAP_SOURCE_STORE,
  labelDerivedSourceIdentityKey: '',
  markersRenderKey: 'pins:0:empty:empty:0:dots:0:empty:empty:0',
  visibleSortedRestaurantMarkersCount: 0,
  visibleDotRestaurantFeaturesCount: 0,
  isShortcutCoverageLoading: false,
  shortcutCoverageRequestKey: null,
  shortcutCoverageReadinessStatus: 'idle',
  shortcutCoverageReadinessReason: null,
  mapSearchSurfaceResultsSourcesReady: true,
  mapSearchSurfaceResultsSourcesReadyKey: null,
  candidateCatalog: null,
};

const areSourceStoreFramesEqual = (
  left: SearchMapSourceStore,
  right: SearchMapSourceStore
): boolean =>
  left === right ||
  (left.sourceRevision === right.sourceRevision &&
    left.idsInOrder.length === right.idsInOrder.length &&
    left.idsInOrder.every(
      (id, index) =>
        id === right.idsInOrder[index] &&
        left.semanticRevisionById.get(id) === right.semanticRevisionById.get(id)
    ));

// Exported for the field-sensitivity spec (search-map-source-frame-port.spec.ts): every keyed
// field must independently flip equality — the "snapshot-equality omits a load-bearing field"
// bug class means a field the render reads but this fn skips silently blocks republish.
export const areSearchMapSourceFrameSnapshotsEqual = (
  left: SearchMapSourceFrameSnapshot,
  right: SearchMapSourceFrameSnapshot
): boolean =>
  left.visualCycleKey === right.visualCycleKey &&
  left.selectedRestaurantId === right.selectedRestaurantId &&
  areSourceStoreFramesEqual(left.pinSourceStore, right.pinSourceStore) &&
  areSourceStoreFramesEqual(left.dotSourceStore, right.dotSourceStore) &&
  areSourceStoreFramesEqual(left.pinInteractionSourceStore, right.pinInteractionSourceStore) &&
  areSourceStoreFramesEqual(left.labelSourceStore, right.labelSourceStore) &&
  areSourceStoreFramesEqual(left.labelCollisionSourceStore, right.labelCollisionSourceStore) &&
  left.labelDerivedSourceIdentityKey === right.labelDerivedSourceIdentityKey &&
  left.markersRenderKey === right.markersRenderKey &&
  // Catalog is deduped on its KEY only (a data-change fingerprint), so a camera-tick republish with an
  // unchanged catalog stays equal (no per-tick churn) while a real catalog change forces a republish that
  // carries the fresh pins in lockstep with the dots/labels.
  (left.candidateCatalog?.key ?? null) === (right.candidateCatalog?.key ?? null);

const SOURCE_FRAME_KEYS: readonly SearchMapSourceFrameSnapshotKey[] = [
  'visualCycleKey',
  'selectedRestaurantId',
  'pinSourceStore',
  'dotSourceStore',
  'pinInteractionSourceStore',
  'labelSourceStore',
  'labelCollisionSourceStore',
  'labelDerivedSourceIdentityKey',
  'markersRenderKey',
];

type SearchMapSourceFrameListenerRecord = {
  observedKeys: ReadonlySet<SearchMapSourceFrameSnapshotKey> | null;
  debugLabel: string | null;
};

export const createSearchMapSourceFramePort = (): SearchMapSourceFramePort => {
  let snapshot = EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT;
  let nativeVisibleMarkers: SearchMapNativeVisibleMarkers | null = null;
  const listeners = new Map<() => void, SearchMapSourceFrameListenerRecord>();

  const notify = (changedKeys: ReadonlySet<SearchMapSourceFrameSnapshotKey>) => {
    listeners.forEach((listenerRecord, listener) => {
      const { observedKeys } = listenerRecord;
      if (observedKeys == null) {
        listener();
        return;
      }
      for (const key of observedKeys) {
        if (changedKeys.has(key)) {
          listener();
          return;
        }
      }
    });
  };

  return {
    getSnapshot: () => snapshot,
    publishSnapshot: (nextSnapshot) => {
      const frameChanged =
        snapshot !== nextSnapshot && !areSearchMapSourceFrameSnapshotsEqual(snapshot, nextSnapshot);
      const changedKeys = new Set<SearchMapSourceFrameSnapshotKey>();
      SOURCE_FRAME_KEYS.forEach((key) => {
        if (!Object.is(snapshot[key], nextSnapshot[key])) {
          changedKeys.add(key);
        }
      });
      if (
        snapshot.visibleSortedRestaurantMarkersCount !==
        nextSnapshot.visibleSortedRestaurantMarkersCount
      ) {
        changedKeys.add('visibleSortedRestaurantMarkersCount');
      }
      if (
        snapshot.visibleDotRestaurantFeaturesCount !==
        nextSnapshot.visibleDotRestaurantFeaturesCount
      ) {
        changedKeys.add('visibleDotRestaurantFeaturesCount');
      }
      if (snapshot.isShortcutCoverageLoading !== nextSnapshot.isShortcutCoverageLoading) {
        changedKeys.add('isShortcutCoverageLoading');
      }
      if (snapshot.shortcutCoverageRequestKey !== nextSnapshot.shortcutCoverageRequestKey) {
        changedKeys.add('shortcutCoverageRequestKey');
      }
      if (
        snapshot.shortcutCoverageReadinessStatus !== nextSnapshot.shortcutCoverageReadinessStatus
      ) {
        changedKeys.add('shortcutCoverageReadinessStatus');
      }
      if (
        snapshot.shortcutCoverageReadinessReason !== nextSnapshot.shortcutCoverageReadinessReason
      ) {
        changedKeys.add('shortcutCoverageReadinessReason');
      }
      if (
        snapshot.mapSearchSurfaceResultsSourcesReady !==
        nextSnapshot.mapSearchSurfaceResultsSourcesReady
      ) {
        changedKeys.add('mapSearchSurfaceResultsSourcesReady');
      }
      if (
        snapshot.mapSearchSurfaceResultsSourcesReadyKey !==
        nextSnapshot.mapSearchSurfaceResultsSourcesReadyKey
      ) {
        changedKeys.add('mapSearchSurfaceResultsSourcesReadyKey');
      }
      // Catalog by KEY, not reference: a fresh snapshot object each projection would churn on Object.is,
      // but the catalog only meaningfully changed when its data-fingerprint key changed.
      if (
        (snapshot.candidateCatalog?.key ?? null) !== (nextSnapshot.candidateCatalog?.key ?? null)
      ) {
        changedKeys.add('candidateCatalog');
      }
      if (changedKeys.size === 0) {
        return false;
      }
      snapshot = nextSnapshot;
      notify(changedKeys);
      return frameChanged;
    },
    publishVisualState: (patch) => {
      let hasChange = false;
      const changedKeys = new Set<SearchMapSourceFrameSnapshotKey>();
      const nextSnapshot: SearchMapSourceFrameSnapshot = { ...snapshot };
      const nextSnapshotMutable = nextSnapshot as Record<string, unknown>;
      const currentSnapshotLookup = snapshot as Record<string, unknown>;
      (Object.keys(patch) as SearchMapSourceFrameSnapshotKey[]).forEach((key) => {
        const nextValue = patch[key as keyof SearchMapSourceFrameVisualStatePatch];
        if (!Object.is(currentSnapshotLookup[key], nextValue)) {
          nextSnapshotMutable[key] = nextValue;
          changedKeys.add(key);
          hasChange = true;
        }
      });
      if (!hasChange) {
        return false;
      }
      snapshot = nextSnapshot;
      notify(changedKeys);
      return true;
    },
    getCandidateCatalog: () => snapshot.candidateCatalog,
    publishNativeVisibleMarkerKeys: (visible) => {
      nativeVisibleMarkers = visible;
    },
    getNativeVisibleMarkerKeys: () => nativeVisibleMarkers,
    reset: () => {
      snapshot = EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT;
      nativeVisibleMarkers = null;
      notify(new Set(Object.keys(snapshot) as SearchMapSourceFrameSnapshotKey[]));
    },
    subscribe: (listener, observedKeys, debugLabel) => {
      const scopedKeys =
        observedKeys != null && observedKeys.length > 0 ? new Set(observedKeys) : null;
      listeners.set(listener, {
        observedKeys: scopedKeys,
        debugLabel: debugLabel ?? null,
      });
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

type EqualityFn<T> = (left: T, right: T) => boolean;

export const useSearchMapSourceFrameSelector = <T>(
  sourceFramePort: SearchMapSourceFramePort | null | undefined,
  selector: (snapshot: SearchMapSourceFrameSnapshot) => T,
  isEqual: EqualityFn<T> = Object.is,
  observedKeys?: readonly SearchMapSourceFrameSnapshotKey[],
  debugLabel?: string
): T => {
  const observedKeysSignature =
    observedKeys != null && observedKeys.length > 0 ? observedKeys.join('|') : '';
  const scopedObservedKeys = React.useMemo(() => observedKeys, [observedKeysSignature]);
  const cacheRef = React.useRef<{ version: number; selected: T }>({
    version: -1,
    selected: selector(sourceFramePort?.getSnapshot() ?? EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT),
  });
  const subscribe = React.useCallback(
    (listener: () => void) =>
      sourceFramePort?.subscribe(listener, scopedObservedKeys, debugLabel) ?? (() => undefined),
    [debugLabel, scopedObservedKeys, sourceFramePort]
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      const selected = selector(
        sourceFramePort?.getSnapshot() ?? EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT
      );
      if (!isEqual(cacheRef.current.selected, selected)) {
        cacheRef.current.selected = selected;
      }
      return cacheRef.current.selected;
    },
    () => selector(sourceFramePort?.getSnapshot() ?? EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT)
  );
};

export const SearchMapSourceFramePortContext = React.createContext<SearchMapSourceFramePort | null>(
  null
);

export const useSearchMapSourceFramePort = (): SearchMapSourceFramePort => {
  const sourceFramePort = React.useContext(SearchMapSourceFramePortContext);
  if (sourceFramePort == null) {
    throw new Error(
      'useSearchMapSourceFramePort must be used within a SearchMapSourceFramePortContext.Provider'
    );
  }
  return sourceFramePort;
};
