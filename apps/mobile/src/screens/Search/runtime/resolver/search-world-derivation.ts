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
