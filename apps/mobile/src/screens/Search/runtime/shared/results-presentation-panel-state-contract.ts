import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';

export type ResultsPresentationPanelSurfaceMode =
  | ResultsPresentationReadModel['surfaceMode']
  | 'empty';

export type ResultsPresentationPanelState = {
  shouldShowInteractionLoadingState: boolean;
  shouldShowInitialLoadingState: boolean;
  shouldShowLoadingState: boolean;
  shouldFreezeCoveredResultsRender: boolean;
  shouldShowResultsCards: boolean;
  surfaceMode: ResultsPresentationPanelSurfaceMode;
  shouldShowResultsSurface: boolean;
  surfaceActive: boolean;
  shouldUseInteractionSurface: boolean;
  shouldHideScrollHeaderForSurface: boolean;
  shouldRenderWhiteWash: boolean;
};

export const resolveResultsPresentationPanelState = ({
  renderPolicy,
  allowsInteractionLoadingState,
  hasRenderableRows,
  hasResolvedResults,
  isSearchLoading,
  shouldUsePlaceholderRows,
}: {
  renderPolicy: ResultsPresentationReadModel;
  allowsInteractionLoadingState: boolean;
  hasRenderableRows: boolean;
  hasResolvedResults: boolean;
  isSearchLoading: boolean;
  shouldUsePlaceholderRows: boolean;
}): ResultsPresentationPanelState => {
  const shouldShowInteractionLoadingState =
    renderPolicy.surfaceMode === 'interaction_loading' && allowsInteractionLoadingState;
  const shouldShowInitialLoadingState = renderPolicy.surfaceMode === 'initial_loading';
  const shouldFreezeCoveredResultsRender =
    renderPolicy.surfaceMode === 'initial_loading' && !renderPolicy.isEntering;
  const shouldShowResultsCards = renderPolicy.contentVisibility !== 'hidden';
  const isSurfaceShowingEmptyState =
    !shouldShowInteractionLoadingState &&
    !shouldShowInitialLoadingState &&
    !hasRenderableRows &&
    hasResolvedResults &&
    !isSearchLoading;
  const surfaceMode: ResultsPresentationPanelSurfaceMode = shouldShowInitialLoadingState
    ? 'initial_loading'
    : shouldShowInteractionLoadingState
    ? 'interaction_loading'
    : isSurfaceShowingEmptyState
    ? 'empty'
    : 'none';

  return {
    shouldShowInteractionLoadingState,
    shouldShowInitialLoadingState,
    shouldShowLoadingState: shouldShowInteractionLoadingState || shouldShowInitialLoadingState,
    shouldFreezeCoveredResultsRender,
    shouldShowResultsCards,
    surfaceMode,
    shouldShowResultsSurface:
      surfaceMode !== 'none' || hasRenderableRows || shouldUsePlaceholderRows,
    surfaceActive: surfaceMode !== 'none',
    shouldUseInteractionSurface: surfaceMode === 'interaction_loading',
    shouldHideScrollHeaderForSurface: surfaceMode === 'initial_loading',
    shouldRenderWhiteWash: surfaceMode === 'initial_loading',
  };
};
