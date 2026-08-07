// R1c of the search-flow rebuild (plans/search-flow-plan.md §D6): SINGLE-WRITER filter/tab state.
//
// The SearchRuntimeBus is the runtime authority for openNow / priceLevels /
// risingActive / activeTab / preferredActiveTab / hasActiveTabPreference.
// (includeSimilarActive is bus-only session state — deliberately NOT mirrored here.)
// The zustand searchStore is a pure persistence mirror for those fields (AsyncStorage persist +
// survival across route-scene bus resets). This bridge is the ONLY place that flows state
// between the two:
//   - seedSearchRuntimeBusFromSearchStore: store → bus, once, at bus creation (and once more
//     when zustand persist finishes async rehydration, for the persisted filter fields).
//   - attachSearchStoreRuntimeStateMirror: bus → store, the single zustand writer
//     (applySearchRuntimeStateMirror), with a dev drift contract on every write.

import {
  normalizeActiveTab,
  useSearchStore,
  type SearchRuntimeMirroredState,
} from '../../../../store/searchStore';
import { reportSearchFlowContractViolation } from './search-flow-contracts';
import { writeSearchDesiredTuple } from './search-desired-state-writer';
import type { SearchRuntimeBus, SearchRuntimeBusState } from './search-runtime-bus';

// S4e: the mirrored filter fields re-derive from the desired tuple (the legacy projection
// keys left the bus); tab-lane keys keep their own lane until their own migration step.
const MIRRORED_BUS_KEYS = [
  'desiredTuple',
  'activeTab',
  'preferredActiveTab',
  'hasActiveTabPreference',
] as const;

// ONE comparator for the mirrored record, used by BOTH the value-guard and the dev drift
// contract. Arrays are minted fresh per publish (priceLevels, dietary), so they compare by
// VALUE, not reference — an equal-but-new array read as divergence false-positived this
// contract on [[]] vs [[]] in the R1c gate, and a lying contract is the old disease.
const isMirroredValueEqual = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => Object.is(entry, b[index]));
  }
  return Object.is(a, b);
};

// F6407: the value-guard is DERIVED FROM the record, never restated beside it. The old guard
// enumerated six of the seven mirrored fields by hand and omitted `dietary`, so a dietary-only
// toggle returned `unchanged` and never reached zustand — dietary filters did not survive a
// relaunch. Enumerating the keys of the record makes omitting a field unwritable.
const diffMirroredFields = (
  a: SearchRuntimeMirroredState,
  b: SearchRuntimeMirroredState
): Array<keyof SearchRuntimeMirroredState> =>
  (Object.keys(a) as Array<keyof SearchRuntimeMirroredState>).filter(
    (key) => !isMirroredValueEqual(a[key], b[key])
  );

const readMirroredStateFromStore = (): SearchRuntimeMirroredState => {
  const storeState = useSearchStore.getState();
  return {
    openNow: storeState.openNow,
    dietary: storeState.dietary,
    priceLevels: storeState.priceLevels,
    risingActive: storeState.risingActive,
    activeTab: normalizeActiveTab(storeState.activeTab),
    preferredActiveTab: normalizeActiveTab(storeState.preferredActiveTab),
    hasActiveTabPreference: storeState.hasActiveTabPreference,
  };
};

const toMirroredState = (busState: SearchRuntimeBusState): SearchRuntimeMirroredState => ({
  openNow: busState.desiredTuple.filterVariant.openNow,
  dietary: [...busState.desiredTuple.filterVariant.dietary],
  priceLevels: [...busState.desiredTuple.filterVariant.priceLevels],
  risingActive: busState.desiredTuple.filterVariant.rising,
  activeTab: busState.activeTab,
  preferredActiveTab: busState.preferredActiveTab,
  hasActiveTabPreference: busState.hasActiveTabPreference,
});

export const seedSearchRuntimeBusFromSearchStore = (searchRuntimeBus: SearchRuntimeBus): void => {
  const mirrored = readMirroredStateFromStore();
  // S2: the persist mirror seeds the DESIRED TUPLE (once here; once more on async
  // rehydration below) and is write-through-only otherwise — nothing else ever reads it.
  // The tuple writer projects the legacy filter keys in the same publish, so both the
  // ranked-request lane and the coverage lane read ONE seeded source (the measured
  // cold-start split — persisted filter reaching coverage but not the ranked request —
  // is unrepresentable).
  writeSearchDesiredTuple(
    searchRuntimeBus,
    {
      filterVariant: {
        openNow: mirrored.openNow,
        dietary: mirrored.dietary,
        priceLevels: mirrored.priceLevels,
        rising: mirrored.risingActive,
      },
      tab: mirrored.activeTab === 'dishes' ? 'dishes' : 'restaurants',
    },
    'boot_seed'
  );
  // Tab-lane keys stay on their existing lane until S4 (activeTab/preferred/preference).
  searchRuntimeBus.publish({
    activeTab: mirrored.activeTab,
    preferredActiveTab: mirrored.preferredActiveTab,
    hasActiveTabPreference: mirrored.hasActiveTabPreference,
  });
};

export const attachSearchStoreRuntimeStateMirror = (
  searchRuntimeBus: SearchRuntimeBus
): (() => void) => {
  // Snapshot of what this mirror last wrote (or observed) in zustand. If zustand drifts from
  // it, a second writer touched the mirrored fields — the exact divergence R1c eliminates.
  let lastMirrored = readMirroredStateFromStore();

  const writeMirror = () => {
    if (__DEV__) {
      const storeNow = readMirroredStateFromStore();
      const driftedFields = diffMirroredFields(storeNow, lastMirrored);
      if (driftedFields.length > 0) {
        reportSearchFlowContractViolation('filter_state_divergence', {
          driftedFields,
          storeValues: driftedFields.map((key) => storeNow[key]),
          lastMirroredValues: driftedFields.map((key) => lastMirrored[key]),
        });
      }
    }
    const next = toMirroredState(searchRuntimeBus.getState());
    // S4e red-team fix: the 'desiredTuple' subscription fires on EVERY tuple write
    // (bounds commits, identity writes), not just mirrored-field changes like the old
    // per-key publishes. Value-guard before the zustand write or every gesture would
    // serialize the whole persisted state to AsyncStorage.
    const unchanged = diffMirroredFields(next, lastMirrored).length === 0;
    // THE BASELINE ADVANCES UNCONDITIONALLY, and that is what makes the drift contract above
    // able to show RED. `lastMirrored` is what the mirror INTENDS the store to hold; when it
    // was only advanced alongside the write, a guard that wrongly said `unchanged` froze BOTH
    // sides together and the two values the contract compares stayed in perfect agreement
    // while both went stale against the bus — green precisely because the bug happened.
    // Advancing here means any field the guard fails to write shows up as store-vs-intent
    // drift on the very next publish.
    lastMirrored = next;
    if (unchanged) {
      return;
    }
    useSearchStore.getState().applySearchRuntimeStateMirror(next);
  };

  const unsubscribeBus = searchRuntimeBus.subscribe(
    writeMirror,
    MIRRORED_BUS_KEYS,
    'search_store_runtime_state_mirror'
  );

  // zustand persist rehydrates asynchronously from AsyncStorage. If hydration lands after the
  // bus was seeded, re-seed the bus from the (now persisted) values — matching the pre-R1c
  // behavior where readers saw the rehydrated zustand values directly.
  let unsubscribeHydration: (() => void) | null = null;
  if (!useSearchStore.persist.hasHydrated()) {
    unsubscribeHydration = useSearchStore.persist.onFinishHydration(() => {
      lastMirrored = readMirroredStateFromStore();
      // Convergence rule for the ASYNC seed: rehydration may only seed a tuple the user
      // hasn't touched yet. If any non-seed write already landed, the user's desire wins —
      // a late rehydrate clobbering a live toggle would be the state equivalent of a stale
      // resolution presenting. Skipped LOUDLY, never silently.
      const state = searchRuntimeBus.getState();
      const userHasWritten =
        state.desiredTupleGeneration > 0 && state.desiredTupleCause !== 'boot_seed';
      if (userHasWritten) {
        reportSearchFlowContractViolation('persist_rehydrate_after_user_write_skipped', {
          desiredTupleGeneration: state.desiredTupleGeneration,
          desiredTupleCause: state.desiredTupleCause ?? 'null',
        });
        return;
      }
      seedSearchRuntimeBusFromSearchStore(searchRuntimeBus);
    });
  }

  return () => {
    unsubscribeBus();
    unsubscribeHydration?.();
  };
};
