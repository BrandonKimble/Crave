import type {
  SearchRootHeaderInputPublicationArgsRuntime,
  UseSearchRootChromeInputPublicationArgsRuntimeArgs,
} from './use-search-root-chrome-input-publication-args-runtime-contract';

export const useSearchRootHeaderInputPublicationArgsRuntime = ({
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
}: UseSearchRootChromeInputPublicationArgsRuntimeArgs): SearchRootHeaderInputPublicationArgsRuntime => {
  const {
    searchState: { inputRef },
  } = rootPrimitivesRuntime;
  const {
    shouldShowAutocompleteSpinnerInBar,
    handleSearchHeaderLayout,
    handleSearchContainerLayout,
    handleSearchShortcutsRowLayout,
    handleRestaurantsShortcutLayout,
    handleDishesShortcutLayout,
    searchHeaderFocusProgress,
  } = rootSuggestionRuntime;
  const {
    requestPresentationFlowRuntime: { foregroundInputRuntime },
  } = requestLaneRuntime;
  const { suggestionInteractionRuntime, foregroundInteractionRuntime } = sessionActionRuntime;

  return {
    headerInputsArgs: {
      handleSearchContainerLayout,
      shouldShowAutocompleteSpinnerInBar,
      handleSearchHeaderLayout,
      inputRef,
      searchHeaderFocusProgress,
      handleSearchShortcutsRowLayout,
      handleRestaurantsShortcutLayout,
      handleDishesShortcutLayout,
      handleQueryChange: foregroundInputRuntime.handleQueryChange,
      handleSubmit: foregroundInteractionRuntime.handleSubmit,
      handleSearchFocus: foregroundInteractionRuntime.handleSearchFocus,
      handleSearchBlur: foregroundInteractionRuntime.handleSearchBlur,
      handleClear: foregroundInteractionRuntime.handleClear,
      focusSearchInput: foregroundInputRuntime.focusSearchInput,
      handleSearchPressIn: foregroundInputRuntime.handleSearchPressIn,
      handleSearchBack: foregroundInteractionRuntime.handleSearchBack,
      isSuggestionScrollDismissing: suggestionInteractionRuntime.isSuggestionScrollDismissing,
      handleBestRestaurantsHere: foregroundInteractionRuntime.handleBestRestaurantsHere,
      handleBestDishesHere: foregroundInteractionRuntime.handleBestDishesHere,
      handleSearchThisArea: foregroundInteractionRuntime.handleSearchThisArea,
    },
  };
};
