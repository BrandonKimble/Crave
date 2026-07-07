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

const MIRRORED_BUS_KEYS = [
  'openNow',
  'priceLevels',
  'risingActive',
  'activeTab',
  'preferredActiveTab',
  'hasActiveTabPreference',
] as const;

const readMirroredStateFromStore = (): SearchRuntimeMirroredState => {
  const storeState = useSearchStore.getState();
  return {
    openNow: storeState.openNow,
    priceLevels: storeState.priceLevels,
    risingActive: storeState.risingActive,
    activeTab: normalizeActiveTab(storeState.activeTab),
    preferredActiveTab: normalizeActiveTab(storeState.preferredActiveTab),
    hasActiveTabPreference: storeState.hasActiveTabPreference,
  };
};

const toMirroredState = (busState: SearchRuntimeBusState): SearchRuntimeMirroredState => ({
  openNow: busState.openNow,
  priceLevels: busState.priceLevels,
  risingActive: busState.risingActive,
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
      const driftedFields = (
        Object.keys(lastMirrored) as Array<keyof SearchRuntimeMirroredState>
      ).filter((key) => {
        const storeValue = storeNow[key];
        const mirroredValue = lastMirrored[key];
        // priceLevels is an array minted fresh per publish — compare by VALUE, not reference,
        // or an equal-but-new array reads as divergence (this contract false-positived on
        // [[]] vs [[]] in the R1c gate — a lying contract is the old disease, R0 rules apply).
        if (Array.isArray(storeValue) && Array.isArray(mirroredValue)) {
          return (
            storeValue.length !== mirroredValue.length ||
            storeValue.some((entry, index) => !Object.is(entry, mirroredValue[index]))
          );
        }
        return !Object.is(storeValue, mirroredValue);
      });
      if (driftedFields.length > 0) {
        reportSearchFlowContractViolation('filter_state_divergence', {
          driftedFields,
          storeValues: driftedFields.map((key) => storeNow[key]),
          lastMirroredValues: driftedFields.map((key) => lastMirrored[key]),
        });
      }
    }
    const next = toMirroredState(searchRuntimeBus.getState());
    lastMirrored = next;
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
      seedSearchRuntimeBusFromSearchStore(searchRuntimeBus);
    });
  }

  return () => {
    unsubscribeBus();
    unsubscribeHydration?.();
  };
};
