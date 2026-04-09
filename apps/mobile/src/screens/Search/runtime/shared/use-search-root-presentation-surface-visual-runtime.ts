import { useSearchResultsPanelVisualRuntimeModel } from './use-search-results-panel-visual-runtime-model';
import { useSearchResultsSheetVisualRuntime } from './use-search-results-sheet-visual-runtime';
import { useSearchRootOverlayPublicationStateRuntime } from './use-search-root-overlay-publication-state-runtime';
import { useSearchRootResultsPanelVisualArgsRuntime } from './use-search-root-results-panel-visual-args-runtime';
import { useSearchRootResultsSheetVisualArgsRuntime } from './use-search-root-results-sheet-visual-args-runtime';
import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import { useSearchRootVisualRuntime } from './use-search-root-visual-runtime';
import { useSearchRootVisualRuntimeArgsRuntime } from './use-search-root-visual-runtime-args-runtime';

type UseSearchRootPresentationSurfaceVisualRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
} & SearchRootActionLanes;

export type SearchRootPresentationSurfaceVisualRuntime = {
  visualRuntime: ReturnType<typeof useSearchRootVisualRuntime>;
  overlayPublicationStateRuntime: ReturnType<typeof useSearchRootOverlayPublicationStateRuntime>;
  searchSheetVisualContextValue: ReturnType<
    typeof useSearchResultsSheetVisualRuntime
  >['searchSheetVisualContextValue'];
  shouldFreezeSuggestionSurfaceForRunOne: ReturnType<
    typeof useSearchResultsSheetVisualRuntime
  >['shouldFreezeSuggestionSurfaceForRunOne'];
  shouldFreezeOverlayHeaderChromeForRunOne: ReturnType<
    typeof useSearchResultsSheetVisualRuntime
  >['shouldFreezeOverlayHeaderChromeForRunOne'];
  shouldFreezeOverlaySheetForCloseHandoff: ReturnType<
    typeof useSearchResultsSheetVisualRuntime
  >['shouldFreezeOverlaySheetForCloseHandoff'];
  resultsPanelVisualRuntimeModel: ReturnType<typeof useSearchResultsPanelVisualRuntimeModel>;
};

export const useSearchRootPresentationSurfaceVisualRuntime = ({
  insets,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  resultsSheetInteractionModel,
  presentationState,
}: UseSearchRootPresentationSurfaceVisualRuntimeArgs): SearchRootPresentationSurfaceVisualRuntime => {
  const visualRuntimeArgsRuntime = useSearchRootVisualRuntimeArgsRuntime({
    insets,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
    resultsSheetInteractionModel,
    presentationState,
  });
  const resultsSheetVisualArgsRuntime = useSearchRootResultsSheetVisualArgsRuntime({
    rootSessionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
  });
  const resultsPanelVisualArgsRuntime = useSearchRootResultsPanelVisualArgsRuntime({
    rootPrimitivesRuntime,
    presentationState,
  });
  const overlayPublicationStateRuntime = useSearchRootOverlayPublicationStateRuntime({
    rootScaffoldRuntime,
  });
  const visualRuntime = useSearchRootVisualRuntime(visualRuntimeArgsRuntime.visualRuntimeArgs);
  const {
    searchSheetVisualContextValue,
    shouldFreezeSuggestionSurfaceForRunOne,
    shouldFreezeOverlayHeaderChromeForRunOne,
    shouldFreezeOverlaySheetForCloseHandoff,
  } = useSearchResultsSheetVisualRuntime({
    ...resultsSheetVisualArgsRuntime.resultsSheetVisualArgs,
    overlayHeaderActionProgress: visualRuntime.overlayHeaderActionProgress,
    navBarHeight: visualRuntime.navBarHeight,
    navBarTopForSnaps: visualRuntime.navBarTop,
    closeVisualHandoffProgress: visualRuntime.closeVisualHandoffProgress,
    navBarCutoutProgress: visualRuntime.navBarCutoutProgress,
    bottomNavHiddenTranslateY: visualRuntime.bottomNavHiddenTranslateY,
    navBarCutoutIsHiding: visualRuntime.navBarCutoutIsHiding,
  });
  const resultsPanelVisualRuntimeModel = useSearchResultsPanelVisualRuntimeModel({
    ...resultsPanelVisualArgsRuntime.resultsPanelVisualArgs,
    resultsWashAnimatedStyle: visualRuntime.resultsWashAnimatedStyle,
    resultsSheetVisibilityAnimatedStyle: visualRuntime.resultsSheetVisibilityAnimatedStyle,
  });

  return {
    visualRuntime,
    overlayPublicationStateRuntime,
    searchSheetVisualContextValue,
    shouldFreezeSuggestionSurfaceForRunOne,
    shouldFreezeOverlayHeaderChromeForRunOne,
    shouldFreezeOverlaySheetForCloseHandoff,
    resultsPanelVisualRuntimeModel,
  };
};
