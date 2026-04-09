import type {
  SearchRootMapInteractionArgsRuntime,
  UseSearchRootMapDisplayRuntimeArgs,
} from './use-search-root-map-display-runtime-contract';

export type SearchRootMapPrimitivesInteractionArgsRuntime = {
  interactionArgs: Pick<
    SearchRootMapInteractionArgsRuntime['interactionArgs'],
    | 'suppressMapMovedRef'
    | 'allowSearchBlurExitRef'
    | 'beginSuggestionCloseHold'
    | 'setIsAutocompleteSuppressed'
    | 'setIsSearchFocused'
    | 'setIsSuggestionPanelActive'
    | 'setShowSuggestions'
    | 'setSuggestions'
  >;
};

export const useSearchRootMapPrimitivesInteractionArgsRuntime = ({
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
}: Pick<
  UseSearchRootMapDisplayRuntimeArgs,
  'rootPrimitivesRuntime' | 'rootSuggestionRuntime'
>): SearchRootMapPrimitivesInteractionArgsRuntime => {
  const {
    mapState: { suppressMapMovedRef },
    searchState: {
      allowSearchBlurExitRef,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setShowSuggestions,
      setSuggestions,
    },
  } = rootPrimitivesRuntime;

  return {
    interactionArgs: {
      suppressMapMovedRef,
      allowSearchBlurExitRef,
      beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setShowSuggestions,
      setSuggestions,
    },
  };
};
