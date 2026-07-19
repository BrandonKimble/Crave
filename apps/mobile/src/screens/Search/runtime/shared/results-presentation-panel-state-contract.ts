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
};

export const resolveResultsPresentationPanelState = ({
  renderPolicy,
  allowsInteractionLoadingState,
  hasRenderableRows,
  hasResolvedResults,
  hasResolutionFailure = false,
  isSearchLoading,
  shouldUsePlaceholderRows,
  freezeClassification,
}: {
  renderPolicy: ResultsPresentationReadModel;
  allowsInteractionLoadingState: boolean;
  hasRenderableRows: boolean;
  hasResolvedResults: boolean;
  /** The bus failure level: a failed FIRST search has nothing resolved but must
   *  still render the empty surface (failure copy + Retry), never a blank sheet. */
  hasResolutionFailure?: boolean;
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
    (hasResolvedResults || hasResolutionFailure) &&
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
    // THE STRIP RENDERS REAL FROM THE FIRST FRAME (owner skeleton-sheet law §3,
    // 2026-07-18): the initial-loading strip hide existed only because the old pinned
    // cover painted strip-pill HOLES where the strip sits (double-render). The cover
    // and its pills are dead (the pending block carries no header skeleton), so the
    // hide field died as a class — chrome changes immediately; the chips read the
    // live desired tuple, so their state is correct before the world lands.
  };
};
