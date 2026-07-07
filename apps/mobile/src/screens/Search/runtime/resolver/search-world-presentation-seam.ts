// The PRESENTATION SEAM (charter §3, S3 edit map §2): the ONE place a resolved world
// becomes mounted state. The commit body replicates the response-owner's atomic batch
// order exactly — (1) mounted-results snapshot, (2) per-tab coverage, (3) surface
// authority, (4) root-bus results patch, (5) operation/lane/loading publishes — then
// fires onPageOneResultsCommitted OUTSIDE the batch (the unchanged adapter into the
// surface-transaction machine, which stays the sole presentation writer).
//
// Ordering contract (the riskiest coupling named in the edit map): beginResolution
// publishes `activeOperationId` SYNCHRONOUSLY, BEFORE any pending presentation arm
// (search-this-area / variant-rerun) reads it as the transaction-id source.
//
// RED contract: a second commitWorldToMountedState for the same worldId is a violation —
// one structural frame per world, provable in the log.

import type { SearchResponse } from '../../../../types';
import { logger } from '../../../../utils';
import { reportSearchFlowContractViolation } from '../shared/search-flow-contracts';
import type { SearchRuntimeBus, SearchRuntimeBusState } from '../shared/search-runtime-bus';
import type { ResultsPresentationSurfaceAuthority } from '../shared/results-presentation-surface-authority';
import {
  commitSearchMountedResultsCoverage,
  publishSearchMountedResultsDataSnapshot,
  type SearchMountedResultsCoverageEntry,
  type SearchMountedResultsMarkerProjectionByTab,
} from '../shared/search-mounted-results-data-store';
import type { SearchSubmitPresentationIntentKind } from '../../hooks/use-search-submit-entry-owner';

/** The root-bus results patch a committed world carries (precomputed by the world-value
 *  constructor; the seam publishes it verbatim — identity keys preserved or narrowed by
 *  the constructor, never re-derived here). */
export type SearchWorldRootBusResultsPatch = Pick<
  SearchRuntimeBusState,
  'resultsIdentityCandidateKey' | 'resultsDishCount' | 'resultsRestaurantCount'
> &
  Partial<Pick<SearchRuntimeBusState, 'resultsRequestKey' | 'resultsPage'>>;

export type SearchWorldPaginationMeta = {
  page: number;
  isPaginationExhausted: boolean;
  totalRestaurantResults: number;
  totalFoodResults: number;
};

/** The cards-world VALUE (cache entry payload): everything the seam needs to present the
 *  world without consulting any owner. Coverage rides per tab (coverageWorld ⊆ value). */
export type SearchWorldValue = {
  committedResponse: SearchResponse;
  markerProjectionByTab: SearchMountedResultsMarkerProjectionByTab;
  resultsIdentityKey: string | null;
  searchRequestId: string;
  rootBusResultsPatch: SearchWorldRootBusResultsPatch;
  paginationMeta: SearchWorldPaginationMeta;
  coverageByTab: Partial<
    Record<'restaurants' | 'dishes', SearchMountedResultsCoverageEntry | null>
  >;
};

export type SearchWorldCommitArgs = {
  worldId: string;
  generation: number;
  value: SearchWorldValue;
  activeTab: 'restaurants' | 'dishes';
  dataReadyFrom: 'cache' | 'network' | 'in_flight';
  searchInputKey: string | null;
  presentationIntentKind?: SearchSubmitPresentationIntentKind;
  replaceResultsInPlace?: boolean;
  /** Version bump under the SAME identity (pagination append): steps 1/3/4/5 only — no
   *  page-one choreography, no coverage refetch. */
  isVersionUpdateOfPresentedWorld?: boolean;
};

export type SearchWorldPresentationSeamEnv = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  onPageOneResultsCommitted: (payload: {
    searchRequestId: string;
    requestBounds: import('../../../../types').MapBounds | null;
    resultsIdentityKey: string | null;
    resultsDataKey: string | null;
    dataReadyFrom: 'cache' | 'network' | 'in_flight';
    searchInputKey: string | null;
    replaceResultsInPlace: boolean;
    presentationIntentKind?: SearchSubmitPresentationIntentKind;
  }) => void;
  /** Surviving foreground effects from prepareSearchRequestForegroundUi (presentation
   *  intent start, keyboard dismiss, error clear) — invoked by beginResolution. */
  onResolutionStart?: (args: {
    generation: number;
    presentationIntentKind?: SearchSubmitPresentationIntentKind;
  }) => void;
};

export type SearchWorldPresentationSeam = {
  /** SYNCHRONOUS: publishes activeOperationId ('world:'+generation) + lane_a_ack +
   *  isSearchLoading before returning — pending presentation arms read it right after. */
  beginResolution: (args: {
    generation: number;
    presentationIntentKind?: SearchSubmitPresentationIntentKind;
  }) => void;
  commitWorldToMountedState: (args: SearchWorldCommitArgs) => void;
  failResolution: (args: { generation: number; reason: string }) => void;
};

export const createSearchWorldPresentationSeam = (
  env: SearchWorldPresentationSeamEnv
): SearchWorldPresentationSeam => {
  const committedWorldIds = new Set<string>();
  return {
    beginResolution: ({ generation, presentationIntentKind }) => {
      env.searchRuntimeBus.publish({
        activeOperationId: `world:${generation}`,
        activeOperationLane: 'lane_a_ack',
        isSearchLoading: true,
        pendingTabSwitchTab: null,
        isLoadingMore: false,
      });
      env.onResolutionStart?.({ generation, presentationIntentKind });
    },
    commitWorldToMountedState: (args) => {
      const {
        worldId,
        generation,
        value,
        activeTab,
        dataReadyFrom,
        searchInputKey,
        presentationIntentKind,
        replaceResultsInPlace,
        isVersionUpdateOfPresentedWorld,
      } = args;
      if (committedWorldIds.has(worldId)) {
        // RED: one structural frame per world — a re-commit means a lifecycle bug upstream.
        reportSearchFlowContractViolation('world_recommitted', { worldId, generation });
        return;
      }
      committedWorldIds.add(worldId);
      env.searchRuntimeBus.batch(() => {
        // (contract carried from the response owner) a page-1 response with zero rows on
        // both tabs but nonzero totals is internally inconsistent — loud, not fatal.
        const rowCount =
          (value.committedResponse.restaurants?.length ?? 0) +
          (value.committedResponse.dishes?.length ?? 0);
        const totals =
          (value.committedResponse.metadata?.totalRestaurantResults ?? 0) +
          (value.committedResponse.metadata?.totalFoodResults ?? 0);
        if (rowCount === 0 && totals > 0) {
          reportSearchFlowContractViolation('empty_page_with_nonzero_totals', {
            resultsIdentityKey: value.resultsIdentityKey,
            totals,
            dataReadyFrom,
            targetTab: activeTab,
          });
        }
        publishSearchMountedResultsDataSnapshot(value.committedResponse, {
          activeTab,
          markerProjectionByTab: value.markerProjectionByTab,
          resultsIdentityKey: value.resultsIdentityKey,
        });
        if (!isVersionUpdateOfPresentedWorld) {
          for (const tab of ['restaurants', 'dishes'] as const) {
            const entry = value.coverageByTab[tab];
            if (entry != null) {
              commitSearchMountedResultsCoverage({
                searchRequestId: value.searchRequestId,
                tab,
                entry,
              });
            }
          }
        }
        env.resultsPresentationSurfaceAuthority.publish(
          {
            resultsRequestKey: value.rootBusResultsPatch.resultsRequestKey ?? null,
            resultsIdentityKey: value.resultsIdentityKey,
            resultsPreparedRowsKey: null,
            listPreparedRowsReady: false,
            isResultsHydrationSettled: value.resultsIdentityKey == null,
          },
          'world_commit'
        );
        env.searchRuntimeBus.publish({
          ...value.rootBusResultsPatch,
          activeOperationId: `world:${generation}`,
          activeOperationLane: 'lane_b_data_commit',
          isSearchLoading: false,
          isLoadingMore: false,
          isPaginationExhausted: value.paginationMeta.isPaginationExhausted,
        });
      });
      if (!isVersionUpdateOfPresentedWorld && value.paginationMeta.page === 1) {
        env.onPageOneResultsCommitted({
          searchRequestId: value.searchRequestId,
          requestBounds: null,
          resultsIdentityKey: value.resultsIdentityKey,
          resultsDataKey: value.resultsIdentityKey,
          dataReadyFrom,
          searchInputKey,
          replaceResultsInPlace: Boolean(replaceResultsInPlace),
          presentationIntentKind,
        });
      }
      if (__DEV__) {
        logger.info('[WORLD-COMMIT]', {
          generation,
          worldId,
          dataReadyFrom,
          activeTab,
          dishCount: value.committedResponse.dishes?.length ?? 0,
          restaurantCount: value.committedResponse.restaurants?.length ?? 0,
          isVersionUpdate: Boolean(isVersionUpdateOfPresentedWorld),
        });
      }
    },
    failResolution: ({ generation, reason }) => {
      env.searchRuntimeBus.publish({
        activeOperationId: null,
        activeOperationLane: 'idle',
        isSearchLoading: false,
        isLoadingMore: false,
      });
      if (__DEV__) {
        logger.warn('[WORLD-COMMIT] resolution failed', { generation, reason });
      }
    },
  };
};
