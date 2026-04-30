type SearchAutocompleteRuntimeValue = {
  showCachedSuggestionsIfFresh: (rawQuery: string) => boolean;
  suppressAutocompleteResults: () => void;
  allowAutocompleteResults: () => void;
};

export const createSearchAutocompleteRuntimeValue = ({
  showCachedSuggestionsIfFresh,
  suppressAutocompleteResults,
  allowAutocompleteResults,
}: SearchAutocompleteRuntimeValue): SearchAutocompleteRuntimeValue => ({
  showCachedSuggestionsIfFresh,
  suppressAutocompleteResults,
  allowAutocompleteResults,
});
