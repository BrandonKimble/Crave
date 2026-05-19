import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

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
  freezeClassification,
}: {
  renderPolicy: ResultsPresentationReadModel;
  allowsInteractionLoadingState: boolean;
  hasRenderableRows: boolean;
  hasResolvedResults: boolean;
  isSearchLoading: boolean;
  shouldUsePlaceholderRows: boolean;
  freezeClassification: SearchFreezeClassification;
}): ResultsPresentationPanelState => {
  const shouldShowInteractionLoadingState =
    renderPolicy.surfaceMode === 'interaction_loading' && allowsInteractionLoadingState;
  const shouldShowInitialLoadingState = renderPolicy.surfaceMode === 'initial_loading';
  const shouldShowSettledResultsSurface =
    renderPolicy.surfaceMode === 'results' || hasRenderableRows || shouldUsePlaceholderRows;
  const shouldFreezeCoveredResultsRender =
    freezeClassification === 'recovery' &&
    renderPolicy.surfaceMode === 'initial_loading' &&
    !renderPolicy.isEntering;
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
    : shouldShowSettledResultsSurface
    ? 'results'
    : 'none';

  return {
    shouldShowInteractionLoadingState,
    shouldShowInitialLoadingState,
    shouldShowLoadingState: shouldShowInteractionLoadingState || shouldShowInitialLoadingState,
    shouldFreezeCoveredResultsRender,
    shouldShowResultsCards,
    surfaceMode,
    shouldShowResultsSurface: surfaceMode !== 'none',
    surfaceActive: surfaceMode !== 'none',
    shouldUseInteractionSurface: surfaceMode === 'interaction_loading',
    shouldHideScrollHeaderForSurface: surfaceMode === 'initial_loading',
    shouldRenderWhiteWash: surfaceMode === 'initial_loading',
  };
};
