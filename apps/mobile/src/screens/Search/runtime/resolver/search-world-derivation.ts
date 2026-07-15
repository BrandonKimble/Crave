// The DERIVATION TIER (charter §3): serve a requested tuple by recomposing an already
// resolved world — zero network. Today's one derivation: the page-1 includeSimilar flip
// (the page-1 response carries BOTH the exact and similar sets; the flip is a local
// recomposition of the SIBLING variant's world). Tab-only changes never reach here
// (cardsKey is tab-agnostic — they are cache hits by construction).

import type { Coordinate } from '../../../../types';
import {
  buildSearchCardsWorldKey,
  type SearchDesiredTuple,
} from '../shared/search-desired-state-contract';
import { buildIncludeSimilarVariantResponse } from '../shared/search-include-similar-variant';
import {
  buildOpenNowCoverageEntry,
  buildOpenNowVariantResponse,
  coverageCarriesOpenness,
} from '../shared/search-open-now-variant';
import type { SearchWorldCache } from '../shared/search-world-cache';
import type { SearchWorldValue } from './search-world-presentation-seam';
import type { SearchWorldNetworkFetchResult } from './search-world-resolver';
import { constructSearchWorldValue } from './search-world-value-constructor';

export const createSearchWorldDerivation =
  (env: { userLocationRef: { current: Coordinate | null } }) =>
  (args: {
    tuple: SearchDesiredTuple;
    cardsKey: string;
    cache: SearchWorldCache<SearchWorldValue>;
  }): SearchWorldNetworkFetchResult | null => {
    const { tuple, cache } = args;
    if (tuple.queryIdentity.kind === 'idle') {
      return null;
    }
    // OPEN-NOW flip ON: derive from the base sibling (openNow:false, all else equal) —
    // a pure client-side filter over rows AND coverage (both carry openness). Marked
    // PROVISIONAL: the resolver presents it instantly, then trues up from the network
    // as a version update. The OFF direction never derives (the ON world lacks the
    // closed rows) — it is a cache hit on the base world by construction.
    if (tuple.filterVariant.openNow) {
      const baseKey = buildSearchCardsWorldKey({
        ...tuple,
        filterVariant: { ...tuple.filterVariant, openNow: false },
      });
      const base = cache.get(baseKey);
      if (base != null && base.status.kind === 'ready' && base.value.paginationMeta.page === 1) {
        const baseCoverageDerivable =
          coverageCarriesOpenness(base.value.coverageByTab.dishes ?? null) &&
          coverageCarriesOpenness(base.value.coverageByTab.restaurants ?? null);
        const openResponse = baseCoverageDerivable
          ? buildOpenNowVariantResponse(base.value.committedResponse)
          : null;
        if (__DEV__ && openResponse == null) {
          // eslint-disable-next-line no-console
          console.log(
            `[DERIVE] open-now declined: coverageDerivable=${baseCoverageDerivable} baseRestaurants=${base.value.committedResponse.restaurants?.length ?? 0} coverageFeatures=${base.value.coverageByTab.restaurants?.features?.length ?? -1}`
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
            dishes: buildOpenNowCoverageEntry(base.value.coverageByTab.dishes ?? null),
            restaurants: buildOpenNowCoverageEntry(base.value.coverageByTab.restaurants ?? null),
          };
          value.singleRestaurantCandidate = base.value.singleRestaurantCandidate;
          return { value, dataReadyFrom: 'cache', searchInputKey: null, provisional: true };
        }
      }
    }
    // Page-1 includeSimilar flip: derive from the SIBLING variant (same tuple with
    // includeSimilar inverted) when it is resolved at page 1.
    const siblingKey = buildSearchCardsWorldKey({
      ...tuple,
      filterVariant: {
        ...tuple.filterVariant,
        includeSimilar: !tuple.filterVariant.includeSimilar,
      },
    });
    const sibling = cache.get(siblingKey);
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
    // includeSimilar never enters the coverage variant (its filters key is
    // open/price/rising) — the sibling's coverage IS this world's coverage.
    value.coverageByTab = sibling.value.coverageByTab;
    value.singleRestaurantCandidate = sibling.value.singleRestaurantCandidate;
    return { value, dataReadyFrom: 'cache', searchInputKey: null };
  };
