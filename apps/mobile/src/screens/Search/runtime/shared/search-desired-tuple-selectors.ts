// S4e (charter §4): the legacy bus keys leave `SearchRuntimeBusState`; every reader
// derives from the desired tuple through these named selectors — the SAME semantics the
// writer's projections used to publish, now computed at read time from the one source.
// Subscription key lists change from the legacy key to ['desiredTuple'].
//
// DESIRED vs PRESENTED: these selectors are all DESIRED reads (chips render optimistic
// desire by construction). Content reads — which tab's rows are mounted — read the
// mounted snapshot's world-scoped fields, never the tuple.

import type { SearchQueryIdentity } from './search-desired-state-contract';
import type { SearchRuntimeBusState } from './search-runtime-bus';

export const selectFilterVariant = (state: SearchRuntimeBusState) =>
  state.desiredTuple.filterVariant;

export const selectOpenNow = (state: SearchRuntimeBusState): boolean =>
  state.desiredTuple.filterVariant.openNow;

export const selectPriceLevels = (state: SearchRuntimeBusState): readonly number[] =>
  state.desiredTuple.filterVariant.priceLevels;

export const selectRisingActive = (state: SearchRuntimeBusState): boolean =>
  state.desiredTuple.filterVariant.rising;

export const selectIncludeSimilarActive = (state: SearchRuntimeBusState): boolean =>
  state.desiredTuple.filterVariant.includeSimilar;

// The map-frame rule (previously deriveLegacySearchMode, LOAD-BEARING): 'shortcut'
// switches the controller into the shortcut-coverage projection. Only true shortcuts and
// restaurant-entity taps (single-restaurant projection) may claim it; food/attribute
// entity taps and favorites run the natural lane — projecting 'shortcut' for them would
// starve the frame on their coverage-less worlds.
export const deriveSearchModeFromIdentity = (
  identity: SearchQueryIdentity
): 'natural' | 'shortcut' | null =>
  identity.kind === 'natural' || identity.kind === 'entities'
    ? 'natural'
    : identity.kind === 'shortcut'
      ? 'shortcut'
      : identity.kind === 'entity'
        ? identity.entityType === 'restaurant'
          ? 'shortcut'
          : 'natural'
        : null;

export const selectSearchMode = (state: SearchRuntimeBusState): 'natural' | 'shortcut' | null =>
  deriveSearchModeFromIdentity(state.desiredTuple.queryIdentity);

// The display-label rule (previously deriveLegacySubmittedQuery) — header title text.
export const deriveSubmittedQueryFromIdentity = (identity: SearchQueryIdentity): string =>
  identity.kind === 'natural'
    ? identity.query
    : identity.kind === 'shortcut'
      ? identity.shortcutTab === 'restaurants'
        ? 'Best restaurants'
        : 'Best dishes'
      : identity.kind === 'entities'
        ? identity.displayTitle
        : identity.kind === 'entity'
          ? identity.displayName
          : '';

export const selectSubmittedQuery = (state: SearchRuntimeBusState): string =>
  deriveSubmittedQueryFromIdentity(state.desiredTuple.queryIdentity);

export const selectIsSearchSessionActive = (state: SearchRuntimeBusState): boolean =>
  state.desiredTuple.queryIdentity.kind !== 'idle' &&
  state.desiredTuple.queryIdentity.kind !== 'profileSeed';

// DESIRED tab (chips, pills). The PRESENTED tab lives only in the mounted snapshot.
export const selectDesiredTab = (state: SearchRuntimeBusState): 'restaurants' | 'dishes' =>
  state.desiredTuple.tab;
