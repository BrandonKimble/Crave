import { useSearchSuggestionLayoutRuntime } from './use-search-suggestion-layout-runtime';
import { useSearchSuggestionVisibilityRuntime } from './use-search-suggestion-visibility-runtime';
import type {
  SearchSuggestionLayoutRuntime,
  SearchSuggestionVisibilityRuntime,
  UseSearchSuggestionSurfaceRuntimeArgs,
  UseSearchSuggestionSurfaceRuntimeResult,
} from './use-search-suggestion-surface-runtime-contract';

export type {
  SearchInteractionRef,
  SearchLayout,
  SearchSuggestionMaskedHole,
  SuggestionTransitionVariant,
  UseSearchSuggestionSurfaceRuntimeArgs,
  UseSearchSuggestionSurfaceRuntimeResult,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionSurfaceRuntime = ({
  ...args
}: UseSearchSuggestionSurfaceRuntimeArgs): UseSearchSuggestionSurfaceRuntimeResult => {
  const visibilityRuntime: SearchSuggestionVisibilityRuntime =
    useSearchSuggestionVisibilityRuntime(args);
  const layoutRuntime: SearchSuggestionLayoutRuntime = useSearchSuggestionLayoutRuntime({
    searchInteractionRef: args.searchInteractionRef,
    query: args.query,
    isSuggestionPanelActive: args.isSuggestionPanelActive,
    isSuggestionPanelVisible: visibilityRuntime.isSuggestionPanelVisible,
    shouldDriveSuggestionLayout: visibilityRuntime.shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground: visibilityRuntime.shouldShowSuggestionBackground,
    shouldRenderSuggestionPanel: visibilityRuntime.shouldRenderSuggestionPanel,
  });

  return {
    ...visibilityRuntime,
    ...layoutRuntime,
  };
};
