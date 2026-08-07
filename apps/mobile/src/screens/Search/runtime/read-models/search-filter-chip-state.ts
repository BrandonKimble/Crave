import { areDietarySetsEqual } from '../shared/search-desired-state-contract';
import type { SearchRuntimeBusKey, SearchRuntimeBusState } from '../shared/search-runtime-bus';

/**
 * THE FILTER STRIP'S ONE CHIP-STATE SOURCE (F3900 / D78).
 *
 * This file replaces `chip-read-model-builder.ts`, which took nine values and
 * returned the same nine plus a `projectionKey` nobody read — an identity
 * function behind a memo, feeding eight props that `SearchFilters` overwrote
 * from the runtime bus before reading a single one. The props are gone; this is
 * the projection that actually happens.
 *
 * It is a plain function of bus state, deliberately NOT a hook: the strip reads
 * it through `useSearchRuntimeBusSelector`, whose cacheRef is seeded with
 * `selector(bus.getState())` on the FIRST render too — which is why the old
 * props could never have been "the first-render values" the deleted comment
 * claimed. Keeping the projection pure is also what makes it testable in the
 * hermetic node lane (`search-filter-chip-state.spec.ts`); the .tsx strip is
 * not.
 */
export type SearchFilterChipState = {
  activeTab: 'dishes' | 'restaurants';
  openNow: boolean;
  dietary: readonly string[];
  includeSimilarActive: boolean;
  similarAvailableCount: number;
  risingActive: boolean;
  priceButtonActive: boolean;
  priceButtonLabel: string;
  isPriceSelectorVisible: boolean;
  isSortSelectorVisible: boolean;
};

/**
 * The bus keys this projection reads. Passed to the selector's subscribe scope,
 * so the strip is woken only by the keys below — and, because the list lives
 * beside the reads it describes, a new read without a new key is one file's
 * worth of reading away rather than two.
 */
export const SEARCH_FILTER_CHIP_OBSERVED_BUS_KEYS: readonly SearchRuntimeBusKey[] = [
  'desiredTuple',
  'results',
  'priceButtonIsActive',
  'priceButtonLabelText',
  'isPriceSelectorVisible',
  'isSortSelectorVisible',
] as const;

export const selectSearchFilterChipState = (
  state: SearchRuntimeBusState
): SearchFilterChipState => ({
  // S4e: the chip strip renders DESIRED state — the tuple directly (tuple.tab IS the
  // old optimistic `pendingTabSwitchTab ?? activeTab` read, by the writer's invariant).
  activeTab: state.desiredTuple.tab,
  openNow: state.desiredTuple.filterVariant.openNow,
  dietary: state.desiredTuple.filterVariant.dietary,
  includeSimilarActive: state.desiredTuple.filterVariant.includeSimilar,
  similarAvailableCount: state.results?.metadata?.similarAvailable ?? 0,
  risingActive: state.desiredTuple.filterVariant.rising,
  priceButtonActive: state.priceButtonIsActive,
  priceButtonLabel: state.priceButtonLabelText,
  isPriceSelectorVisible: state.isPriceSelectorVisible,
  isSortSelectorVisible: state.isSortSelectorVisible,
});

export const areSearchFilterChipStatesEqual = (
  left: SearchFilterChipState,
  right: SearchFilterChipState
): boolean =>
  left.activeTab === right.activeTab &&
  left.openNow === right.openNow &&
  areDietarySetsEqual(left.dietary, right.dietary) &&
  left.includeSimilarActive === right.includeSimilarActive &&
  left.similarAvailableCount === right.similarAvailableCount &&
  left.risingActive === right.risingActive &&
  left.priceButtonActive === right.priceButtonActive &&
  left.priceButtonLabel === right.priceButtonLabel &&
  left.isPriceSelectorVisible === right.isPriceSelectorVisible &&
  left.isSortSelectorVisible === right.isSortSelectorVisible;
