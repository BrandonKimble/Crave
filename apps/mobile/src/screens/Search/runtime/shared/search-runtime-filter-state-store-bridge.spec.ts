// F6407: DIETARY FILTERS DID NOT SURVIVE A RELAUNCH, and the drift contract written to
// catch exactly that was blind by construction.
//
// The bridge is the ONLY writer of the zustand persistence mirror (searchStore.ts:48 states
// it), and its single write site sat behind a value-guard that enumerated SIX of the seven
// mirrored fields by hand, omitting `dietary`. A dietary-only toggle computed `unchanged`,
// returned early, and never reached AsyncStorage. The `__DEV__` drift contract could not
// report it because the early return skipped the `lastMirrored` baseline as well as the
// store write — the two values it compares stayed in perfect agreement while both went
// stale against the bus. The instrument was green PRECISELY BECAUSE the bug happened.
//
// This file pins both halves: the mirror is total over the record (round-trip, every field),
// and the drift contract can show RED when a field is mirrored into intent but not into the
// store. Sever either and one of these goes RED.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

jest.mock('../../../../utils', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const reportSearchFlowContractViolation = jest.fn();
jest.mock('./search-flow-contracts', () => ({
  reportSearchFlowContractViolation: (...args: unknown[]) =>
    reportSearchFlowContractViolation(...args),
}));

import { useSearchStore, type SearchRuntimeMirroredState } from '../../../../store/searchStore';
import { createSearchRuntimeBus } from './search-runtime-bus';
import { writeSearchDesiredTuple } from './search-desired-state-writer';
import { attachSearchStoreRuntimeStateMirror } from './search-runtime-filter-state-store-bridge';

const DEFAULT_MIRROR: SearchRuntimeMirroredState = {
  openNow: false,
  dietary: [],
  priceLevels: [],
  risingActive: false,
  activeTab: 'dishes',
  preferredActiveTab: 'dishes',
  hasActiveTabPreference: false,
};

describe('search store runtime-state mirror — the value-guard is derived from the record', () => {
  let detach: (() => void) | null = null;

  beforeEach(() => {
    reportSearchFlowContractViolation.mockClear();
    useSearchStore.setState({ ...DEFAULT_MIRROR, dietary: [], priceLevels: [] });
  });

  afterEach(() => {
    detach?.();
    detach = null;
  });

  // THE USER-FACING SPEC. RED before the derived guard: `dietary` was the one mirrored
  // field the hand-written guard omitted, so this toggle returned early and the store kept
  // its default forever.
  it('mirrors a DIETARY-ONLY toggle into the persisted store', () => {
    const bus = createSearchRuntimeBus();
    detach = attachSearchStoreRuntimeStateMirror(bus);

    writeSearchDesiredTuple(
      bus,
      { filterVariant: { ...bus.getState().desiredTuple.filterVariant, dietary: ['vegan'] } },
      'chip_dietary'
    );

    expect(useSearchStore.getState().dietary).toEqual(['vegan']);
  });

  // The other direction: clearing must land too, or a wall the user removed outlives the
  // relaunch that removed it.
  it('mirrors a dietary CLEAR back to empty', () => {
    const bus = createSearchRuntimeBus();
    detach = attachSearchStoreRuntimeStateMirror(bus);

    writeSearchDesiredTuple(
      bus,
      { filterVariant: { ...bus.getState().desiredTuple.filterVariant, dietary: ['vegan'] } },
      'chip_dietary'
    );
    expect(useSearchStore.getState().dietary).toEqual(['vegan']);

    writeSearchDesiredTuple(
      bus,
      { filterVariant: { ...bus.getState().desiredTuple.filterVariant, dietary: [] } },
      'chip_dietary'
    );
    expect(useSearchStore.getState().dietary).toEqual([]);
  });

  // TOTALITY, not a dietary spot-fix: every mirrored field round-trips. This is the
  // assertion that would have failed for `dietary` and will fail for the NEXT field if the
  // guard ever stops being derived from the record.
  it.each([
    ['openNow', { openNow: true }, { openNow: true }],
    ['priceLevels', { priceLevels: [2, 3] }, { priceLevels: [2, 3] }],
    ['dietary', { dietary: ['halal'] }, { dietary: ['halal'] }],
    ['rising', { rising: true }, { risingActive: true }],
  ] as const)('mirrors %s through the guard', (_label, filterPatch, expected) => {
    const bus = createSearchRuntimeBus();
    detach = attachSearchStoreRuntimeStateMirror(bus);

    writeSearchDesiredTuple(
      bus,
      { filterVariant: { ...bus.getState().desiredTuple.filterVariant, ...filterPatch } },
      'chip_dietary'
    );

    expect(useSearchStore.getState()).toMatchObject(expected);
  });

  // The guard still EARNS its keep — an unrelated tuple write (the S4e red-team case: the
  // desiredTuple subscription fires on bounds commits too) must not re-serialize the store.
  it('does not write for a tuple change that touches no mirrored field', () => {
    const bus = createSearchRuntimeBus();
    detach = attachSearchStoreRuntimeStateMirror(bus);
    const applySpy = jest.spyOn(useSearchStore.getState(), 'applySearchRuntimeStateMirror');

    writeSearchDesiredTuple(
      bus,
      {
        committedBounds: {
          bounds: {
            northEast: { lat: 1, lng: 1 },
            southWest: { lat: 0, lng: 0 },
          },
          viewportPolygon: null,
          camera: null,
        },
      },
      'search_this_area'
    );

    expect(applySpy).not.toHaveBeenCalled();
    applySpy.mockRestore();
  });

  // THE INSTRUMENT MUST BE ABLE TO SHOW RED. The baseline now advances unconditionally, so
  // a store that disagrees with what the mirror intended is reported on the next publish.
  // With the old code this was unreachable for a guard-skipped field, because the baseline
  // froze in lockstep with the store.
  it('reports filter_state_divergence when the store disagrees with the mirrored intent', () => {
    const bus = createSearchRuntimeBus();
    detach = attachSearchStoreRuntimeStateMirror(bus);

    writeSearchDesiredTuple(
      bus,
      { filterVariant: { ...bus.getState().desiredTuple.filterVariant, dietary: ['vegan'] } },
      'chip_dietary'
    );
    reportSearchFlowContractViolation.mockClear();

    // A foreign writer (or, before the fix, a guard that skipped the field) leaves the store
    // holding something other than what the mirror last intended.
    useSearchStore.setState({ dietary: [] });

    writeSearchDesiredTuple(
      bus,
      { filterVariant: { ...bus.getState().desiredTuple.filterVariant, openNow: true } },
      'chip_dietary'
    );

    expect(reportSearchFlowContractViolation).toHaveBeenCalledWith(
      'filter_state_divergence',
      expect.objectContaining({ driftedFields: ['dietary'] })
    );
  });

  it('stays silent when the store agrees with the mirrored intent', () => {
    const bus = createSearchRuntimeBus();
    detach = attachSearchStoreRuntimeStateMirror(bus);

    writeSearchDesiredTuple(
      bus,
      { filterVariant: { ...bus.getState().desiredTuple.filterVariant, dietary: ['vegan'] } },
      'chip_dietary'
    );
    writeSearchDesiredTuple(
      bus,
      { filterVariant: { ...bus.getState().desiredTuple.filterVariant, openNow: true } },
      'chip_dietary'
    );

    expect(reportSearchFlowContractViolation).not.toHaveBeenCalledWith(
      'filter_state_divergence',
      expect.anything()
    );
  });
});
