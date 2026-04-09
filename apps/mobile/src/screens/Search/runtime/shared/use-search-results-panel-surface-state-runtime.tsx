import React from 'react';

import type { ResultsPresentationPanelSurfaceMode } from './results-presentation-panel-state-contract';
import { type ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';
import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import type { SearchResultsPanelRenderPolicyRuntime } from './use-search-results-panel-render-policy-runtime';
import styles from '../../styles';

type UseSearchResultsPanelSurfaceStateRuntimeArgs = Pick<
  UseSearchResultsRoutePublicationArgs,
  'resultsSheetRuntime' | 'resultsPanelVisualRuntimeModel'
> & {
  panelDataRuntime: SearchResultsPanelDataRuntime;
  renderPolicyRuntime: SearchResultsPanelRenderPolicyRuntime;
};

export type SearchResultsPanelSurfaceStateRuntime = {
  shouldRenderResultsSheet: boolean;
  shouldDisableResultsSheetInteractionForRender: boolean;
  shouldShowInteractionLoadingState: boolean;
  resultsSheetContainerStyle: Array<unknown>;
  resultsSheetContainerAnimatedStyle: Array<unknown>;
};

export const useSearchResultsPanelSurfaceStateRuntime = ({
  resultsSheetRuntime,
  resultsPanelVisualRuntimeModel,
  panelDataRuntime,
  renderPolicyRuntime,
}: UseSearchResultsPanelSurfaceStateRuntimeArgs): SearchResultsPanelSurfaceStateRuntime => {
  const { shouldRenderResultsSheet } = resultsSheetRuntime;
  const { resultsSheetVisibilityAnimatedStyle, shouldDisableResultsSheetInteraction } =
    resultsPanelVisualRuntimeModel;
  const { searchSheetContentLane, renderPolicy, activeTab } = panelDataRuntime;
  const {
    shouldShowInteractionLoadingState,
    shouldFreezeCoveredResultsRender,
    shouldShowResultsCards,
    surfaceMode,
  } = renderPolicyRuntime;

  const isResultsClosing = searchSheetContentLane.kind === 'results_closing';
  const shouldDisableResultsSheetInteractionForRender =
    shouldDisableResultsSheetInteraction || isResultsClosing;

  const resultsSheetContainerStyle = React.useMemo(
    () => [styles.resultsSheetContainer, resultsSheetVisibilityAnimatedStyle],
    [resultsSheetVisibilityAnimatedStyle]
  );
  const resultsSheetContainerAnimatedStyle = React.useMemo(
    () => [resultsSheetRuntime.resultsContainerAnimatedStyle, resultsSheetVisibilityAnimatedStyle],
    [resultsSheetRuntime.resultsContainerAnimatedStyle, resultsSheetVisibilityAnimatedStyle]
  );

  const panelDiagRef = React.useRef<{
    shouldRenderResultsSheet: boolean;
    shouldDisableResultsSheetInteraction: boolean;
    shouldShowInteractionLoadingState: boolean;
    shouldFreezeCoveredResultsRender: boolean;
    shouldShowResultsCards: boolean;
    surfaceMode: ResultsPresentationPanelSurfaceMode;
    activeTab: 'dishes' | 'restaurants';
    renderSurfaceMode: ResultsPresentationReadModel['surfaceMode'];
    contentVisibility: ResultsPresentationReadModel['contentVisibility'];
    isAwaitingEnterMount: boolean;
    isEntering: boolean;
    isClosing: boolean;
  } | null>(null);

  React.useEffect(() => {
    const nextSnapshot = {
      shouldRenderResultsSheet,
      shouldDisableResultsSheetInteraction: shouldDisableResultsSheetInteractionForRender,
      shouldShowInteractionLoadingState,
      shouldFreezeCoveredResultsRender,
      shouldShowResultsCards,
      surfaceMode,
      activeTab,
      renderSurfaceMode: renderPolicy.surfaceMode,
      contentVisibility: renderPolicy.contentVisibility,
      isAwaitingEnterMount: renderPolicy.isAwaitingEnterMount,
      isEntering: renderPolicy.isEntering,
      isClosing: renderPolicy.isClosing,
    };
    const previousSnapshot = panelDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.shouldRenderResultsSheet === nextSnapshot.shouldRenderResultsSheet &&
      previousSnapshot.shouldDisableResultsSheetInteraction ===
        nextSnapshot.shouldDisableResultsSheetInteraction &&
      previousSnapshot.shouldShowInteractionLoadingState ===
        nextSnapshot.shouldShowInteractionLoadingState &&
      previousSnapshot.shouldFreezeCoveredResultsRender ===
        nextSnapshot.shouldFreezeCoveredResultsRender &&
      previousSnapshot.shouldShowResultsCards === nextSnapshot.shouldShowResultsCards &&
      previousSnapshot.surfaceMode === nextSnapshot.surfaceMode &&
      previousSnapshot.activeTab === nextSnapshot.activeTab &&
      previousSnapshot.renderSurfaceMode === nextSnapshot.renderSurfaceMode &&
      previousSnapshot.contentVisibility === nextSnapshot.contentVisibility &&
      previousSnapshot.isAwaitingEnterMount === nextSnapshot.isAwaitingEnterMount &&
      previousSnapshot.isEntering === nextSnapshot.isEntering &&
      previousSnapshot.isClosing === nextSnapshot.isClosing
    ) {
      return;
    }
    panelDiagRef.current = nextSnapshot;
  }, [
    activeTab,
    renderPolicy.contentVisibility,
    renderPolicy.isAwaitingEnterMount,
    renderPolicy.isClosing,
    renderPolicy.isEntering,
    renderPolicy.surfaceMode,
    shouldDisableResultsSheetInteractionForRender,
    shouldFreezeCoveredResultsRender,
    shouldRenderResultsSheet,
    shouldShowInteractionLoadingState,
    shouldShowResultsCards,
    surfaceMode,
  ]);

  return React.useMemo(
    () => ({
      shouldRenderResultsSheet,
      shouldDisableResultsSheetInteractionForRender,
      shouldShowInteractionLoadingState,
      resultsSheetContainerStyle,
      resultsSheetContainerAnimatedStyle,
    }),
    [
      resultsSheetContainerAnimatedStyle,
      resultsSheetContainerStyle,
      shouldDisableResultsSheetInteractionForRender,
      shouldRenderResultsSheet,
      shouldShowInteractionLoadingState,
    ]
  );
};
