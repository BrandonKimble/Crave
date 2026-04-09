import { useSearchSuggestionSurfaceRuntime } from './use-search-suggestion-surface-runtime';

type UseSearchRootSuggestionRuntimeArgs = Parameters<typeof useSearchSuggestionSurfaceRuntime>[0];

export type SearchRootSuggestionRuntime = ReturnType<typeof useSearchSuggestionSurfaceRuntime> & {
  isSuggestionScreenActive: boolean;
};

export const useSearchRootSuggestionRuntime = ({
  ...args
}: UseSearchRootSuggestionRuntimeArgs): SearchRootSuggestionRuntime => {
  const suggestionRuntime = useSearchSuggestionSurfaceRuntime(args);

  return {
    ...suggestionRuntime,
    isSuggestionScreenActive:
      args.isSuggestionPanelActive || suggestionRuntime.isSuggestionPanelVisible,
  };
};
