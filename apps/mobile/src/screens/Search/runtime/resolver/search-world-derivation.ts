// The DERIVATION TIER (charter §3; lens exit S2/S3 2026-07-16): serve a requested tuple
// by recomposing already-resolved data — zero network. Two arms, split by AXIS:
//
// - LENS fast path (open-now ON): the open view is a lens over the SAME world — project
//   the warm base slice (openNow:false lensKey under the same worldKey) client-side as
//   the optimistic first paint, marked PROVISIONAL so the resolver settles it with the
//   honest server slice fetch as a version update. The OFF direction never derives (the
//   open slice lacks the closed rows) — it is a warm slice hit by construction.
// - IDENTITY derivation (page-1 includeSimilar flip): includeSimilar is retrieval-
//   semantic, so the sibling here is a genuinely different WORLD (different worldKey);
//   the page-1 response carries both the exact and similar sets, so the flip is a local
//   recomposition of the sibling world's value.
//
// Tab-only changes never reach here (slice keys are tab-agnostic — cache hits by
// construction).

import type { Coordinate } from '../../../../types';
import {
  buildSearchWorldSliceKey,
  type SearchDesiredTuple,
} from '../shared/search-desired-state-contract';
import { buildIncludeSimilarVariantResponse } from '../shared/search-include-similar-variant';
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
            `[DERIVE] open-now projection declined: coverageDerivable=${baseCoverageDerivable} baseRestaurants=${base.value.committedResponse.restaurants?.length ?? 0} coverageFeatures=${base.value.coverageByTab.restaurants?.features?.length ?? -1}`
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
    // IDENTITY derivation — page-1 includeSimilar flip from the sibling WORLD (the
    // inverted-similar tuple keys a different worldKey; same lens).
    const siblingSliceKey = buildSearchWorldSliceKey({
      ...tuple,
      filterVariant: {
        ...tuple.filterVariant,
        includeSimilar: !tuple.filterVariant.includeSimilar,
      },
    });
    const sibling = cache.get(siblingSliceKey);
    if (sibling == null || sibling.status.kind !== 'ready') {
      return null;
    }
    if (sibling.value.paginationMeta.page !== 1) {
      // Mid-pagination flips re-resolve over the network (charter rule).
      return null;
    }
    const variantResponse = buildIncludeSimilarVariantResponse(
      sibling.value.committedResponse,
      tuple.filterVariant.includeSimilar
    );
    if (variantResponse == null) {
      return null;
    }
    const value = constructSearchWorldValue({
      response: variantResponse,
      queryIdentity: tuple.queryIdentity,
      activeTab: tuple.tab,
      bounds: tuple.committedBounds?.bounds ?? null,
      userLocation: env.userLocationRef.current,
      preserveRouteIdentity: tuple.queryIdentity.kind !== 'shortcut',
    });
    // includeSimilar never enters the coverage variant (coverage varies by LENS, and
    // similar is identity) — the sibling world's coverage IS this world's coverage.
    value.coverageByTab = sibling.value.coverageByTab;
    value.singleRestaurantCandidate = sibling.value.singleRestaurantCandidate;
    return { value, dataReadyFrom: 'cache', searchInputKey: null };
  };
