import type {
  SearchRootResultsSheetVisualArgsRuntime,
  UseSearchRootVisualPublicationArgsRuntimeArgs,
} from './use-search-root-visual-publication-args-runtime-contract';

export const useSearchRootResultsSheetVisualArgsRuntime = ({
  rootSessionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
}: UseSearchRootVisualPublicationArgsRuntimeArgs): SearchRootResultsSheetVisualArgsRuntime => {
  const {
    runtimeOwner: { searchRuntimeBus },
    resultsArrivalState: { resultsPage },
    runtimeFlags: { searchMode, isSearchLoading },
    freezeGate: {
      isRunOneChromeFreezeActive,
      isRunOnePreflightFreezeActive,
      isResponseFrameFreezeActive,
    },
  } = rootSessionRuntime;
  const {
    overlaySessionRuntime: { searchBarTop, navBarCutoutHeight },
    resultsSheetRuntimeOwner,
  } = rootScaffoldRuntime;
  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: { resultsPresentationOwner },
    },
  } = requestLaneRuntime;

  return {
    resultsSheetVisualArgs: {
      searchRuntimeBus,
      shouldRenderResultsSheet: resultsSheetRuntimeOwner.shouldRenderResultsSheet,
      isRunOneChromeFreezeActive,
      isRunOnePreflightFreezeActive,
      isResponseFrameFreezeActive,
      searchMode,
      resultsPage,
      isSearchLoading,
      sheetTranslateY: resultsSheetRuntimeOwner.sheetTranslateY,
      resultsScrollOffset: resultsSheetRuntimeOwner.resultsScrollOffset,
      resultsMomentum: resultsSheetRuntimeOwner.resultsMomentum,
      searchBarTop,
      snapPoints: resultsSheetRuntimeOwner.snapPoints,
      navBarCutoutHeight,
      isCloseTransitionActive: resultsPresentationOwner.shellModel.isCloseTransitionActive,
    },
  };
};
