import React from 'react';

import type { SearchFiltersProps } from '../../components/SearchFilters';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { ACTIVE_TAB_COLOR, CONTENT_HORIZONTAL_PADDING } from '../../constants/search';
import { useDietaryOptions } from '../../hooks/use-dietary-options';
import type { SearchRootFilterModalControlLane } from './search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';

export const useSearchRootSearchSceneFiltersHeaderRuntime = ({
  searchRuntimeBus,
  stateFoundationLane,
  filterModalControlLane,
  scheduleTabToggleCommit,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  stateFoundationLane: SearchRootStateFoundationLane;
  filterModalControlLane: SearchRootFilterModalControlLane;
  scheduleTabToggleCommit: (next: 'dishes' | 'restaurants') => void;
}) => {
  const { searchState } = stateFoundationLane.rootPrimitivesRuntime;
  const handleInteractionTabChange = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      scheduleTabToggleCommit(next);
    },
    [scheduleTabToggleCommit]
  );
  // The strip's dietary OPTIONS are the server's curated vocabulary; the
  // ACTIVE set is read live from the bus inside the strip (like every other
  // chip), so no per-flip prop churn reaches this memo.
  const dietaryOptions = useDietaryOptions();

  // F3900/D78: this memo used to carry EIGHT chip-state values (built by a 61-line
  // identity read model) that the strip overwrote from the runtime bus before reading
  // one of them — seven of the sixteen dep-array entries, so every chip flip churned
  // the chrome header to deliver values the destination discarded. The strip reads the
  // bus; the memo now carries only the strip's stable wiring, so a chip press no longer
  // re-renders the host tree at all.
  // The memo is TYPED as the strip's props, so an extra chip-state field here is a
  // compile error rather than a silently-ignored spread attribute (JSX spreads are not
  // excess-property checked) — that is what keeps the deleted second source deleted.
  return React.useMemo<SearchFiltersProps>(() => {
    const filtersHeaderProps: SearchFiltersProps = {
      // The strip's ONE chip-state source (see SearchFiltersProps.searchRuntimeBus) — a
      // stable reference, so it never churns this memo.
      searchRuntimeBus,
      onTabChange: handleInteractionTabChange,
      onToggleOpenNow: filterModalControlLane.filterModalRuntime.toggleOpenNow,
      dietaryOptions,
      onToggleDietary: filterModalControlLane.filterModalRuntime.toggleDietary,
      onToggleIncludeSimilar: filterModalControlLane.filterModalRuntime.toggleIncludeSimilar,
      onTogglePriceSelector: filterModalControlLane.filterModalRuntime.togglePriceSelector,
      onToggleSortSelector: filterModalControlLane.filterModalRuntime.toggleSortSelector,
      contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
      accentColor: ACTIVE_TAB_COLOR,
      // The strip engine seeds + writes layout AND settled scrollX through this ONE
      // per-surface seat (leg 2) — the old initial/onChange cache join is engine-owned.
      layoutCacheSeat: searchState.searchFiltersCacheSeat,
    };
    return filtersHeaderProps;
  }, [
    searchRuntimeBus,
    filterModalControlLane.filterModalRuntime.toggleOpenNow,
    filterModalControlLane.filterModalRuntime.toggleDietary,
    dietaryOptions,
    filterModalControlLane.filterModalRuntime.togglePriceSelector,
    filterModalControlLane.filterModalRuntime.toggleSortSelector,
    filterModalControlLane.filterModalRuntime.toggleIncludeSimilar,
    handleInteractionTabChange,
    searchState.searchFiltersCacheSeat,
  ]);
};
