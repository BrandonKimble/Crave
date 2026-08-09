import React from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';

import type { FoodResult, RestaurantResult, SearchResponse } from '../../../../types';
import type { RestaurantResultCardDescriptor } from '../../components/restaurant-result-card-descriptor';
import type { SearchRouteResultsPolicyReadModelProjectionFacet } from '../shared/search-route-results-policy-domain-contract';
import type { SearchResultsBodyAdmissionHandoffPhase } from '../shared/search-results-panel-runtime-state-contract';
import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import { commitSearchMountedResultsPreparedRowsTarget } from '../shared/search-mounted-results-data-store';
import type { ResultsListItem } from './list-read-model-builder';
import { useSearchResultsHydrationKeyApplyRuntime } from './use-search-results-hydration-key-apply-runtime';
import { useSearchResultsHydrationKeyCommitEmissionRuntime } from './use-search-results-hydration-key-commit-emission-runtime';
import { useSearchResultsHydrationOperationIdRuntime } from './use-search-results-hydration-operation-id-runtime';
import { useSearchResultsHydrationRowsReleaseEmissionRuntime } from './use-search-results-hydration-rows-release-emission-runtime';
import { useSearchResultsHydrationRowsReleaseEventRuntime } from './use-search-results-hydration-rows-release-event-runtime';
import { useSearchResultsHydrationRowsReleaseRuntime } from './use-search-results-hydration-rows-release-runtime';
import { useSearchResultsHydrationSettleStateRuntime } from './use-search-results-hydration-settle-state-runtime';
import { useSearchResultsHydrationSyncLifecycleRuntime } from './use-search-results-hydration-sync-lifecycle-runtime';
import { useSearchResultsListFooterRuntime } from './use-search-results-list-footer-runtime';
import { useSearchResultsListHeaderTitleRuntime } from './use-search-results-list-header-title-runtime';
import { useSearchResultsListPremeasureRuntime } from './use-search-results-list-premeasure-runtime';
import { useSearchResultsListRenderItemRuntime } from './use-search-results-list-render-item-runtime';
import { useSearchResultsListProjectionStateRuntime } from './use-search-results-list-projection-state-runtime';
import { useSearchResultsListProjectionTelemetryRuntime } from './use-search-results-list-projection-telemetry-runtime';
import { useSearchResultsPageHeaderRuntime } from '../shared/use-search-results-page-header-runtime';

type UseSearchResultsReadModelSelectorsArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  results: SearchResponse | null;
  isInteractionLoadingActive: boolean;
  shouldHydrateResultsForRender: boolean;
  searchSurfaceRedrawPhase: SearchResultsBodyAdmissionHandoffPhase;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onDemandNotice: React.ReactNode;
  activeTabColor: string;
  submittedQuery: string;
  handleCloseResults: () => void;
  searchInteractionRef: React.MutableRefObject<{
    isResultsListScrolling: boolean;
    isResultsSheetDragging?: boolean;
    isResultsSheetSettling?: boolean;
  }>;
  renderDishCard: (item: FoodResult, index: number) => React.ReactElement | null;
  renderRestaurantCard: (
    item: RestaurantResult,
    index: number,
    preparedDescriptor?: RestaurantResultCardDescriptor | null
  ) => React.ReactElement | null;
  onRuntimeMechanismEvent?: (
    event: 'runtime_write_span',
    payload?: Record<string, unknown>
  ) => void;
  resultsIdentityKey: string | null;
  hydratedResultsKey: string | null;
  hydrationOperationId: string | null;
  activeOverlayKey: string;
  setHydratedResultsKeySync: (nextHydrationKey: string | null) => void;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
  readModelProjection?: SearchRouteResultsPolicyReadModelProjectionFacet;
  shouldRetainCommittedResultsForPolicy: boolean;
};

type SearchResultsReadModelSelectors = {
  safeResultsCountByTab: {
    dishes: number;
    restaurants: number;
  };
  isResultsHydrationSettled: boolean;
  rowsByTab: {
    dishes: ResultsListItem[];
    restaurants: ResultsListItem[];
  };
  renderListItem: NonNullable<FlashListProps<ResultsListItem>['renderItem']>;
  listFooterComponent: React.ReactNode;
  preMeasureOverlay: React.ReactNode;
};

export const useSearchResultsReadModelSelectors = (
  args: UseSearchResultsReadModelSelectorsArgs
): SearchResultsReadModelSelectors => {
  const {
    activeTab,
    dishes,
    restaurants,
    results,
    isInteractionLoadingActive,
    shouldHydrateResultsForRender,
    searchSurfaceRedrawPhase,
    canLoadMore,
    isLoadingMore,
    onDemandNotice,
    activeTabColor,
    submittedQuery,
    handleCloseResults,
    searchInteractionRef,
    renderDishCard,
    renderRestaurantCard,
    onRuntimeMechanismEvent,
    resultsIdentityKey,
    hydratedResultsKey,
    hydrationOperationId,
    activeOverlayKey,
    setHydratedResultsKeySync,
    phaseBMaterializerRef,
    readModelProjection,
    shouldRetainCommittedResultsForPolicy,
  } = args;

  const emitRuntimeWriteSpan = React.useCallback(
    (payload: Record<string, unknown>) => {
      onRuntimeMechanismEvent?.('runtime_write_span', {
        domain: 'results_read_model',
        ...payload,
      });
    },
    [onRuntimeMechanismEvent]
  );

  const searchRequestId = results?.metadata?.searchRequestId ?? null;
  const resolveHydrationOperationId = useSearchResultsHydrationOperationIdRuntime({
    hydrationOperationId,
    searchRequestIdentity: searchRequestId,
  });

  const resultsProjectionRuntime = useSearchResultsListProjectionStateRuntime({
    activeTab,
    dishes,
    restaurants,
    results,
    shouldRetainCommittedResults: shouldRetainCommittedResultsForPolicy,
    readModelProjection,
    searchSurfaceRedrawPhase,
  });
  useSearchResultsListProjectionTelemetryRuntime({
    activeTab,
    dishes,
    restaurants,
    results,
    resultsIdentityKey,
    shouldHydrateResultsForRender,
    emitRuntimeWriteSpan,
    projectionStateRuntime: resultsProjectionRuntime,
  });

  const hydrationSettleStateRuntime = useSearchResultsHydrationSettleStateRuntime({
    dishesCount: resultsProjectionRuntime.safeResultsCountByTab.dishes,
    restaurantsCount: resultsProjectionRuntime.safeResultsCountByTab.restaurants,
    resultsIdentityKey,
    hydratedResultsKey,
  });
  useSearchResultsHydrationRowsReleaseRuntime({
    resultsIdentityKey,
    activeOverlayKey,
    settleStateRuntime: hydrationSettleStateRuntime,
  });
  const applyHydrationKey = useSearchResultsHydrationKeyApplyRuntime({
    setHydratedResultsKeySync,
  });
  const emitHydrationKeyCommit = useSearchResultsHydrationKeyCommitEmissionRuntime({
    emitRuntimeWriteSpan,
    resolveOperationId: resolveHydrationOperationId,
    activeOverlayKey,
    searchRequestId,
  });
  const commitHydrationKey = React.useCallback(
    (nextHydrationKey: string | null) => {
      const durationMs = applyHydrationKey(nextHydrationKey);
      emitHydrationKeyCommit(nextHydrationKey, durationMs);
    },
    [applyHydrationKey, emitHydrationKeyCommit]
  );
  // F1735: the redraw-coordinator gates that used to condition these (raw phase past
  // visible admission; the hydration-finalize allowance) were pinned at their permissive
  // values by construction — the coordinator could never leave 'idle'. The live gate is
  // the sheet interaction state.
  const canFinalizeRowsRelease = React.useCallback(() => {
    const interactionState = searchInteractionRef.current;
    return (
      interactionState.isResultsSheetDragging !== true &&
      interactionState.isResultsSheetSettling !== true
    );
  }, [searchInteractionRef]);
  const canCommitHydrationKey = canFinalizeRowsRelease;
  const onFinalizeRowsReleaseReady = React.useCallback(() => {
    commitSearchMountedResultsPreparedRowsTarget({
      resultsIdentityKey,
    });
    hydrationSettleStateRuntime.setHydrationFinalizeRowsReleaseCompletedToken(
      hydrationSettleStateRuntime.hydrationRowsReleaseVersionToken
    );
  }, [hydrationSettleStateRuntime, resultsIdentityKey]);
  useSearchResultsHydrationSyncLifecycleRuntime({
    resultsIdentityKey,
    hydratedResultsKey,
    activeOverlayKey,
    // F4801: `shouldResetHydrationCommit: false` used to be passed here, under an F1735
    // comment explaining that the fossil redraw-coordinator could never produce `true`.
    // A parameter exists because two call sites disagree about it; with one call site
    // passing a literal, it was a constant wearing a type — and it kept an always-true
    // conjunct, a whole unreachable effect lane (cleanup included) and an instrument
    // field that could only ever print `reset:false` alive in the consumer. Deleted the
    // way F1062 was deleted (below, :277-286), not documented the way F1735 was.
    phaseBMaterializerRef,
    resolveOperationId: resolveHydrationOperationId,
    commitHydrationKey,
    canCommitHydrationKey,
    canFinalizeRowsRelease,
    onFinalizeRowsReleaseReady,
  });
  const hydrationRowsReleaseEvent = useSearchResultsHydrationRowsReleaseEventRuntime({
    settleStateRuntime: hydrationSettleStateRuntime,
  });
  useSearchResultsHydrationRowsReleaseEmissionRuntime({
    activeOverlayKey,
    resultsIdentityKey,
    searchRequestId,
    emitRuntimeWriteSpan,
    releaseToken: hydrationRowsReleaseEvent,
  });

  const renderListItem = useSearchResultsListRenderItemRuntime({
    renderDishCard,
    renderRestaurantCard,
  });

  const listHeaderTitle = useSearchResultsListHeaderTitleRuntime({
    submittedQuery,
  });
  // Publishes the results header model to the persistent-header live-state store (P5) — no
  // component comes back; the hoisted chrome renders it.
  useSearchResultsPageHeaderRuntime({
    handleCloseResults,
    headerTitle: listHeaderTitle,
  });
  const listFooterComponent = useSearchResultsListFooterRuntime({
    activeSafeResultsCount: resultsProjectionRuntime.activeSafeResultsData.length,
    onDemandNotice,
    isInteractionLoadingActive,
    isLoadingMore,
    canLoadMore,
    activeTabColor,
  });
  const preMeasureOverlay = useSearchResultsListPremeasureRuntime({
    restaurants,
  });
  // F1062: a `useSearchResultsFlashListViewabilityRuntime` used to merge a
  // `{onViewableItemsChanged, viewabilityConfig}` pair in here. Its callback filtered the
  // viewable set, ran a 250ms rate limiter, stamped the limiter's timestamp — and RETURNED.
  // There was no log statement in the file; it was a throttle around an emission that had
  // been deleted, so it could never show anything, RED or green. The red-team worry (that
  // its `viewabilityConfig` was load-bearing for FlashList behavior independent of logging)
  // is settled: the whole hook returned null unless `shouldLogResultsViewability`, and that
  // flag was a hardcoded `false` — the config was NEVER installed on any list. Deleted with
  // its flag plumbing rather than given an emitter: nothing asked for this observation, and
  // git holds the shape if a real blank-cell instrument is ever wanted.

  return {
    safeResultsCountByTab: resultsProjectionRuntime.safeResultsCountByTab,
    isResultsHydrationSettled: hydrationSettleStateRuntime.isResultsHydrationSettled,
    rowsByTab: resultsProjectionRuntime.rowsByTab,
    renderListItem,
    listFooterComponent,
    preMeasureOverlay,
  };
};

export type { ResultsListItem } from './list-read-model-builder';
