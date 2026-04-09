import React from 'react';

import type { SearchRouteHostVisualState } from '../../../../overlays/searchOverlayRouteHostContract';
import { useSearchRouteOverlayRuntime } from '../../../../overlays/useSearchRouteOverlayRuntime';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';
import { useSearchResultsPanelCoveredRenderRuntime } from './use-search-results-panel-covered-render-runtime';
import { useSearchResultsPanelDataRuntime } from './use-search-results-panel-data-runtime';
import { useSearchResultsPanelInteractionFrostRuntime } from './use-search-results-panel-interaction-frost-runtime';
import { useSearchResultsPanelReadModelRuntime } from './use-search-results-panel-read-model-runtime';
import { useSearchResultsPanelRenderPolicyRuntime } from './use-search-results-panel-render-policy-runtime';
import { useSearchResultsPanelRouteVisibilityRuntime } from './use-search-results-panel-route-visibility-runtime';
import { useSearchResultsPanelSpecRuntime } from './use-search-results-panel-spec-runtime';
import { useSearchResultsPanelSurfaceBackgroundRuntime } from './use-search-results-panel-surface-background-runtime';
import { useSearchResultsPanelSurfaceOverlayRuntime } from './use-search-results-panel-surface-overlay-runtime';
import { useSearchResultsPanelSurfaceStateRuntime } from './use-search-results-panel-surface-state-runtime';

type UseSearchRoutePanelPublicationRuntimeArgs = UseSearchResultsRoutePublicationArgs & {
  shouldRenderSearchOverlay: boolean;
  visualState: SearchRouteHostVisualState | null;
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  isForegroundEditing: boolean;
  isSuggestionPanelActive: boolean;
};

export const useSearchRoutePanelPublicationRuntime = ({
  resultsPresentationOwner,
  resultsSheetRuntime,
  resultsSheetInteractionModel,
  resultsPanelVisualRuntimeModel,
  pollBounds,
  startupPollsSnapshot,
  searchInteractionRef,
  toggleRankSelector,
  toggleOpenNow,
  toggleVotesFilter,
  togglePriceSelector,
  shouldDisableSearchBlur,
  searchFiltersLayoutCacheRef,
  handleSearchFiltersLayoutCache,
  scoreMode,
  getDishSaveHandler,
  getRestaurantSaveHandler,
  stableOpenRestaurantProfileFromResults,
  openScoreInfo,
  mapQueryBudget,
  overlayHeaderActionProgress,
  shouldLogResultsViewability,
  onRuntimeMechanismEvent,
  phaseBMaterializerRef,
  shouldRenderSearchOverlay,
  visualState,
  shouldFreezeOverlaySheetForCloseHandoff,
  shouldFreezeOverlayHeaderActionForRunOne,
  isForegroundEditing,
  isSuggestionPanelActive,
}: UseSearchRoutePanelPublicationRuntimeArgs): void => {
  const panelDataRuntime = useSearchResultsPanelDataRuntime({
    resultsPresentationOwner,
    searchFiltersLayoutCacheRef,
    handleSearchFiltersLayoutCache,
    toggleRankSelector,
    toggleOpenNow,
    toggleVotesFilter,
    togglePriceSelector,
    scoreMode,
    getDishSaveHandler,
    getRestaurantSaveHandler,
    stableOpenRestaurantProfileFromResults,
    openScoreInfo,
  });
  const readModelRuntime = useSearchResultsPanelReadModelRuntime({
    resultsSheetRuntime,
    searchInteractionRef,
    shouldDisableSearchBlur,
    mapQueryBudget,
    overlayHeaderActionProgress,
    shouldLogResultsViewability,
    onRuntimeMechanismEvent,
    phaseBMaterializerRef,
    panelDataRuntime,
  });
  const renderPolicyRuntime = useSearchResultsPanelRenderPolicyRuntime({
    panelDataRuntime,
    readModelRuntime,
  });
  const coveredRenderRuntime = useSearchResultsPanelCoveredRenderRuntime({
    panelDataRuntime,
    readModelRuntime,
    renderPolicyRuntime,
  });
  const surfaceStateRuntime = useSearchResultsPanelSurfaceStateRuntime({
    resultsSheetRuntime,
    resultsPanelVisualRuntimeModel,
    panelDataRuntime,
    renderPolicyRuntime,
  });
  const interactionFrostRuntime = useSearchResultsPanelInteractionFrostRuntime({
    notifyToggleInteractionFrostReady: panelDataRuntime.notifyToggleInteractionFrostReady,
    pendingPresentationIntentId: panelDataRuntime.pendingPresentationIntentId,
    shouldShowInteractionLoadingState: renderPolicyRuntime.shouldShowInteractionLoadingState,
  });
  const surfaceBackgroundRuntime = useSearchResultsPanelSurfaceBackgroundRuntime({
    readModelRuntime,
    coveredRenderRuntime,
    renderPolicyRuntime,
    shouldDisableSearchBlur,
  });
  const surfaceOverlayRuntime = useSearchResultsPanelSurfaceOverlayRuntime({
    resultsPanelVisualRuntimeModel,
    panelDataRuntime,
    coveredRenderRuntime,
    renderPolicyRuntime,
    interactionFrostRuntime,
  });
  const specRuntime = useSearchResultsPanelSpecRuntime({
    resultsSheetRuntime,
    resultsSheetInteractionModel,
    resultsPanelVisualRuntimeModel,
    readModelRuntime,
    coveredRenderRuntime,
    surfaceStateRuntime,
    surfaceBackgroundRuntime,
    surfaceOverlayRuntime,
  });
  const routeVisibilityRuntime = useSearchResultsPanelRouteVisibilityRuntime({
    searchSheetContentLane: panelDataRuntime.searchSheetContentLane,
    shouldRenderResultsSheet: surfaceStateRuntime.shouldRenderResultsSheet,
  });

  useSearchRouteOverlayRuntime({
    shouldRenderSearchOverlay,
    visualState,
    shouldShowSearchPanel: routeVisibilityRuntime.shouldShowSearchPanel,
    shouldShowDockedPollsPanel: routeVisibilityRuntime.shouldShowDockedPollsPanel,
    searchPanelSpec: specRuntime.searchPanelSpec,
    searchInteractionRef,
    pollBounds,
    startupPollsSnapshot,
    shouldFreezeOverlaySheetForCloseHandoff,
    shouldFreezeOverlayHeaderActionForRunOne,
    isForegroundEditing,
    isSuggestionPanelActive,
  });

  React.useDebugValue(
    shouldRenderSearchOverlay
      ? {
          shouldShowSearchPanel: routeVisibilityRuntime.shouldShowSearchPanel,
          shouldShowDockedPollsPanel: routeVisibilityRuntime.shouldShowDockedPollsPanel,
        }
      : 'hidden'
  );
};
