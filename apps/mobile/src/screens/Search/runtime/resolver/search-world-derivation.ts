// The DERIVATION TIER (charter §3; lens exit S2/S3 2026-07-16): serve a requested tuple
// by recomposing already-resolved data — zero network. Two arms, split by AXIS:
//
// - LENS fast path (open-now ON): the open view is a lens over the SAME world — project
//   the warm base slice (openNow:false lensKey under the same worldKey) client-side as
//   the optimistic first paint, marked PROVISIONAL so the resolver settles it with the
//   honest server slice fetch as a version update. The OFF direction never derives (the
//   open slice lacks the closed rows) — it is a warm slice hit by construction.
// - (RETIRED 2026-09-04, red team S-1) IDENTITY derivation for the includeSimilar
//   flip: the API no longer ships a page-1 union, and the toggle is retrieval
//   identity on the server — the flip keys a different worldKey and fetches.
//
// Tab-only changes never reach here (slice keys are tab-agnostic — cache hits by
// construction).

import type { Coordinate } from '../../../../types';
import {
  buildSearchWorldSliceKey,
  type SearchDesiredTuple,
} from '../shared/search-desired-state-contract';
import {
  projectOpenNowCoverageEntry,
  projectOpenNowResponseSlice,
  coverageCarriesOpenness,
} from '../shared/search-open-now-projection';
import type { SearchWorldCache } from '../shared/search-world-cache';
import type { SearchWorldValue } from './search-world-presentation-seam';
import type { SearchWorldNetworkFetchResult } from './search-world-resolver';
import { constructSearchWorldValue } from './search-world-value-constructor';

export const createSearchWorldDerivation =
  (env: { userLocationRef: { current: Coordinate | null } }) =>
  (args: {
    tuple: SearchDesiredTuple;
    sliceKey: string;
    cache: SearchWorldCache<SearchWorldValue>;
  }): SearchWorldNetworkFetchResult | null => {
    const { tuple, cache } = args;
    if (tuple.queryIdentity.kind === 'idle') {
      return null;
    }
    // LENS fast path — open-now ON: project the warm base slice of the SAME world.
    if (tuple.filterVariant.openNow) {
      const baseSliceKey = buildSearchWorldSliceKey({
        ...tuple,
        filterVariant: { ...tuple.filterVariant, openNow: false },
      });
      const base = cache.get(baseSliceKey);
      if (base != null && base.status.kind === 'ready' && base.value.paginationMeta.page === 1) {
        const baseCoverageDerivable =
          coverageCarriesOpenness(base.value.coverageByTab.dishes ?? null) &&
          coverageCarriesOpenness(base.value.coverageByTab.restaurants ?? null);
        const openResponse = baseCoverageDerivable
          ? projectOpenNowResponseSlice(base.value.committedResponse)
          : null;
        if (__DEV__ && openResponse == null) {
          // eslint-disable-next-line no-console
          console.log(
            `[DERIVE] open-now projection declined: coverageDerivable=${baseCoverageDerivable} baseRestaurants=${base.value.committedResponse.places?.length ?? 0} coverageFeatures=${base.value.coverageByTab.restaurants?.features?.length ?? -1}`
          );
        }
        if (openResponse != null) {
          const value = constructSearchWorldValue({
            response: openResponse,
            queryIdentity: tuple.queryIdentity,
            activeTab: tuple.tab,
            bounds: tuple.committedBounds?.bounds ?? null,
            userLocation: env.userLocationRef.current,
            preserveRouteIdentity: tuple.queryIdentity.kind !== 'shortcut',
          });
          value.coverageByTab = {
            dishes: projectOpenNowCoverageEntry(base.value.coverageByTab.dishes ?? null),
            restaurants: projectOpenNowCoverageEntry(base.value.coverageByTab.restaurants ?? null),
          };
          value.singleRestaurantCandidate = base.value.singleRestaurantCandidate;
          return { value, dataReadyFrom: 'cache', searchInputKey: null, provisional: true };
        }
      }
    }
    // NO LOCAL Include-similar derivation (red team 2026-09-04 S-1). The
    // page-1 flip used to be composed here from the sibling world's rows
    // marked exactMatch=false plus `similarDishes`/`similarPlaces` arrays —
    // arrays the API stopped emitting, on a flag the pooled gate now also
    // sets for tier-1 PARTIAL rows. Result: the "N similar" chip did nothing
    // and flipping OFF hid rows the server had served. includeSimilar is
    // retrieval identity on the SERVER (the ring is stamped tier 2 and
    // served under the toggle), and the flip keys a different worldKey, so
    // it resolves over the network like any other identity change.
    return null;
  };
