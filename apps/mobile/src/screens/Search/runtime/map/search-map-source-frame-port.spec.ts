/**
 * Field-sensitivity spec for areSearchMapSourceFrameSnapshotsEqual — the guard against the
 * Crave "snapshot-equality omits a load-bearing field" bug class ("state correct but screen
 * wrong": an equality fn that skips a field the render reads silently blocks republish).
 *
 * Every FRAME-KEYED field must INDEPENDENTLY flip equality (mutate exactly one → unequal),
 * every exempt field must NOT (they flow through publishVisualState/changedKeys subscriber
 * notification, not frame equality — deliberate), and EVERY snapshot field must be classified
 * as one or the other: adding a field to SearchMapSourceFrameSnapshot without deciding whether
 * the frame comparator must see it fails the exhaustiveness test below.
 */
import {
  areSearchMapSourceFrameSnapshotsEqual,
  EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT,
  type SearchMapSourceFrameSnapshot,
} from './search-map-source-frame-port';
import type { SearchMapSourceStore } from './search-map-source-store';

// Fabricate a minimal SearchMapSourceStore — the comparator only reads sourceRevision,
// idsInOrder, and semanticRevisionById; everything else is inert scaffolding.
const makeStore = (spec: {
  sourceRevision?: string;
  ids?: readonly string[];
  semanticRevisionById?: Record<string, string>;
}): SearchMapSourceStore => {
  const ids = spec.ids ?? ['m1', 'm2'];
  const semanticRevisionById = new Map(
    Object.entries(spec.semanticRevisionById ?? Object.fromEntries(ids.map((id) => [id, 'sem-1'])))
  );
  return {
    idsInOrder: ids,
    featureById: new Map(),
    transportFeatureById: new Map(),
    semanticRevisionById,
    revisionById: new Map(),
    sourceRevision: spec.sourceRevision ?? 'rev-1',
    committedDeltaJournal: null,
    committedDeltaJournalHistory: [],
    acknowledgeTransportRevision: () => {},
    buildReplaceDelta: () => ({ mode: 'replace', nextFeatureIdsInOrder: [], removeIds: [] }),
  };
};

// A fully-populated baseline (every field holds a non-default, distinct value so a mutation of
// one field can never be masked by another).
const makeSnapshot = (): SearchMapSourceFrameSnapshot => ({
  visualCycleKey: 'cycle-1',
  selectedRestaurantId: 'r-1',
  pinSourceStore: makeStore({ sourceRevision: 'pin-rev-1' }),
  dotSourceStore: makeStore({ sourceRevision: 'dot-rev-1' }),
  pinInteractionSourceStore: makeStore({ sourceRevision: 'pin-interaction-rev-1' }),
  labelCollisionSourceStore: makeStore({ sourceRevision: 'label-collision-rev-1' }),
  markersRenderKey: 'render-key-1',
  visibleSortedRestaurantMarkersCount: 3,
  visibleDotRestaurantFeaturesCount: 7,
  isShortcutCoverageLoading: false,
  shortcutCoverageRequestKey: 'coverage-key-1',
  shortcutCoverageReadinessStatus: 'completed',
  shortcutCoverageReadinessReason: 'accepted_features',
  mapSearchSurfaceResultsSourcesReady: true,
  mapSearchSurfaceResultsSourcesReadyKey: 'ready-key-1',
  candidateCatalog: null,
});

// The frame comparator's contract: these fields ARE keyed (each must flip equality)…
const FRAME_KEYED_FIELDS = [
  'visualCycleKey',
  'selectedRestaurantId',
  'pinSourceStore',
  'dotSourceStore',
  'pinInteractionSourceStore',
  'labelCollisionSourceStore',
  'markersRenderKey',
  'candidateCatalog',
] as const satisfies readonly (keyof SearchMapSourceFrameSnapshot)[];

// …and these are DELIBERATELY exempt: telemetry/readiness surface state that notifies
// subscribers via publishSnapshot's changedKeys / publishVisualState, but does not constitute
// a new source FRAME (frameChanged). If one of these becomes render-load-bearing for the frame,
// it must move up into FRAME_KEYED_FIELDS *and* into areSearchMapSourceFrameSnapshotsEqual.
const FRAME_EXEMPT_FIELDS = [
  'visibleSortedRestaurantMarkersCount',
  'visibleDotRestaurantFeaturesCount',
  'isShortcutCoverageLoading',
  'shortcutCoverageRequestKey',
  'shortcutCoverageReadinessStatus',
  'shortcutCoverageReadinessReason',
  'mapSearchSurfaceResultsSourcesReady',
  'mapSearchSurfaceResultsSourcesReadyKey',
] as const satisfies readonly (keyof SearchMapSourceFrameSnapshot)[];

// One distinct-value mutator per snapshot field. The exhaustiveness test below forces every
// NEW snapshot field to get a mutator + a classification.
const FIELD_MUTATORS: {
  [K in keyof SearchMapSourceFrameSnapshot]: (
    base: SearchMapSourceFrameSnapshot
  ) => SearchMapSourceFrameSnapshot[K];
} = {
  visualCycleKey: () => 'cycle-2',
  selectedRestaurantId: () => 'r-2',
  pinSourceStore: () => makeStore({ sourceRevision: 'pin-rev-2' }),
  dotSourceStore: () => makeStore({ sourceRevision: 'dot-rev-2' }),
  pinInteractionSourceStore: () => makeStore({ sourceRevision: 'pin-interaction-rev-2' }),
  labelCollisionSourceStore: () => makeStore({ sourceRevision: 'label-collision-rev-2' }),
  markersRenderKey: () => 'render-key-2',
  visibleSortedRestaurantMarkersCount: (base) => base.visibleSortedRestaurantMarkersCount + 1,
  visibleDotRestaurantFeaturesCount: (base) => base.visibleDotRestaurantFeaturesCount + 1,
  isShortcutCoverageLoading: (base) => !base.isShortcutCoverageLoading,
  shortcutCoverageRequestKey: () => 'coverage-key-2',
  shortcutCoverageReadinessStatus: () => 'loading',
  shortcutCoverageReadinessReason: () => 'request_failed',
  mapSearchSurfaceResultsSourcesReady: (base) => !base.mapSearchSurfaceResultsSourcesReady,
  mapSearchSurfaceResultsSourcesReadyKey: () => 'ready-key-2',
  candidateCatalog: () => ({ key: 'catalog-2', entries: [] }),
};

const withMutatedField = (
  base: SearchMapSourceFrameSnapshot,
  field: keyof SearchMapSourceFrameSnapshot
): SearchMapSourceFrameSnapshot => ({
  ...base,
  [field]: FIELD_MUTATORS[field](base),
});

describe('areSearchMapSourceFrameSnapshotsEqual — field classification', () => {
  it('classifies EVERY snapshot field as frame-keyed or exempt (new fields must be classified here)', () => {
    const allFields = Object.keys(EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT).sort();
    const classified = [...FRAME_KEYED_FIELDS, ...FRAME_EXEMPT_FIELDS].sort();
    expect(classified).toEqual(allFields);
    // …and every field has a mutator, so the sensitivity loops below cover the whole snapshot.
    expect(Object.keys(FIELD_MUTATORS).sort()).toEqual(allFields);
  });

  it('is a SEMANTIC equality: two independently-built, value-identical snapshots are equal', () => {
    // Fresh store objects + fresh maps everywhere — no shared references.
    expect(areSearchMapSourceFrameSnapshotsEqual(makeSnapshot(), makeSnapshot())).toBe(true);
  });

  it.each([...FRAME_KEYED_FIELDS])('keyed field %s INDEPENDENTLY flips equality', (field) => {
    const base = makeSnapshot();
    const mutated = withMutatedField(base, field);
    // The mutator must actually produce a different value (guard the guard).
    expect(Object.is(base[field], mutated[field])).toBe(false);
    expect(areSearchMapSourceFrameSnapshotsEqual(base, mutated)).toBe(false);
    expect(areSearchMapSourceFrameSnapshotsEqual(mutated, base)).toBe(false);
  });

  it.each([...FRAME_EXEMPT_FIELDS])(
    'exempt field %s does NOT flip frame equality (flows through changedKeys, not frameChanged)',
    (field) => {
      const base = makeSnapshot();
      const mutated = withMutatedField(base, field);
      expect(Object.is(base[field], mutated[field])).toBe(false);
      expect(areSearchMapSourceFrameSnapshotsEqual(base, mutated)).toBe(true);
    }
  );
});

describe('areSearchMapSourceFrameSnapshotsEqual — source-store sub-field sensitivity', () => {
  // The five store slots share one comparator (areSourceStoreFramesEqual); prove each of its
  // load-bearing sub-fields — sourceRevision, idsInOrder (length, order, identity), and
  // semanticRevisionById — independently flips equality through the snapshot comparator.
  const withPinStore = (store: SearchMapSourceStore): SearchMapSourceFrameSnapshot => ({
    ...makeSnapshot(),
    pinSourceStore: store,
  });

  it('sourceRevision alone flips equality (ids + semantic revisions identical)', () => {
    const left = withPinStore(makeStore({ sourceRevision: 'pin-rev-1' }));
    const right = withPinStore(makeStore({ sourceRevision: 'pin-rev-CHANGED' }));
    expect(areSearchMapSourceFrameSnapshotsEqual(left, right)).toBe(false);
  });

  it('idsInOrder LENGTH alone flips equality', () => {
    const left = withPinStore(makeStore({ ids: ['m1', 'm2'] }));
    const right = withPinStore(
      makeStore({
        ids: ['m1', 'm2', 'm3'],
        semanticRevisionById: { m1: 'sem-1', m2: 'sem-1', m3: 'sem-1' },
      })
    );
    expect(areSearchMapSourceFrameSnapshotsEqual(left, right)).toBe(false);
  });

  it('idsInOrder ORDER alone flips equality (same membership, same revisions)', () => {
    const left = withPinStore(makeStore({ ids: ['m1', 'm2'] }));
    const right = withPinStore(makeStore({ ids: ['m2', 'm1'] }));
    expect(areSearchMapSourceFrameSnapshotsEqual(left, right)).toBe(false);
  });

  it('idsInOrder IDENTITY alone flips equality (same length + order shape)', () => {
    const left = withPinStore(makeStore({ ids: ['m1', 'm2'] }));
    const right = withPinStore(
      makeStore({ ids: ['m1', 'mX'], semanticRevisionById: { m1: 'sem-1', mX: 'sem-1' } })
    );
    expect(areSearchMapSourceFrameSnapshotsEqual(left, right)).toBe(false);
  });

  it('ONE semanticRevisionById entry alone flips equality (same ids, same sourceRevision)', () => {
    const left = withPinStore(makeStore({ semanticRevisionById: { m1: 'sem-1', m2: 'sem-1' } }));
    const right = withPinStore(
      makeStore({ semanticRevisionById: { m1: 'sem-1', m2: 'sem-CHANGED' } })
    );
    expect(areSearchMapSourceFrameSnapshotsEqual(left, right)).toBe(false);
  });

  it('value-identical stores in different objects stay EQUAL (reference-free comparison)', () => {
    const left = withPinStore(makeStore({}));
    const right = withPinStore(makeStore({}));
    expect(areSearchMapSourceFrameSnapshotsEqual(left, right)).toBe(true);
  });

  it('every one of the four store slots is independently sensitive (not just pins)', () => {
    (
      [
        'pinSourceStore',
        'dotSourceStore',
        'pinInteractionSourceStore',
        'labelCollisionSourceStore',
      ] as const
    ).forEach((slot) => {
      const base = makeSnapshot();
      const mutated: SearchMapSourceFrameSnapshot = {
        ...base,
        [slot]: makeStore({ semanticRevisionById: { m1: 'sem-1', m2: 'sem-CHANGED' } }),
      };
      expect(areSearchMapSourceFrameSnapshotsEqual(base, mutated)).toBe(false);
    });
  });
});
