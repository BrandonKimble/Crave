import type {
  SearchRootResultsPanelVisualArgsRuntime,
  UseSearchRootVisualPublicationArgsRuntimeArgs,
} from './use-search-root-visual-publication-args-runtime-contract';

export const useSearchRootResultsPanelVisualArgsRuntime = ({
  rootPrimitivesRuntime,
  presentationState,
}: Pick<
  UseSearchRootVisualPublicationArgsRuntimeArgs,
  'rootPrimitivesRuntime' | 'presentationState'
>): SearchRootResultsPanelVisualArgsRuntime => {
  return {
    resultsPanelVisualArgs: {
      resultsScrollRef: rootPrimitivesRuntime.searchState.resultsScrollRef,
      shouldDisableResultsSheetInteraction: presentationState.shouldDisableResultsSheetInteraction,
    },
  };
};
