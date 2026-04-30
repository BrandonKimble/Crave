import React from 'react';

type SearchAutocompleteRequestStateRuntime = {
  autocompleteRequestSequenceRef: React.MutableRefObject<number>;
  latestAutocompleteQueryRef: React.MutableRefObject<string>;
  latestSuggestionScreenActiveRef: React.MutableRefObject<boolean>;
  latestAutocompleteSuppressedRef: React.MutableRefObject<boolean>;
  manuallySuppressedAutocompleteRef: React.MutableRefObject<boolean>;
  suppressAutocompleteResults: () => void;
  allowAutocompleteResults: () => void;
};

export const useSearchAutocompleteRequestStateRuntime = ({
  query,
  isSuggestionScreenActive,
  isAutocompleteSuppressed,
  cancelAutocomplete,
}: {
  query: string;
  isSuggestionScreenActive: boolean;
  isAutocompleteSuppressed: boolean;
  cancelAutocomplete: () => void;
}): SearchAutocompleteRequestStateRuntime => {
  const autocompleteRequestSequenceRef = React.useRef(0);
  const latestAutocompleteQueryRef = React.useRef(query);
  const latestSuggestionScreenActiveRef = React.useRef(isSuggestionScreenActive);
  const latestAutocompleteSuppressedRef = React.useRef(isAutocompleteSuppressed);
  const manuallySuppressedAutocompleteRef = React.useRef(false);

  latestAutocompleteQueryRef.current = query;
  latestSuggestionScreenActiveRef.current = isSuggestionScreenActive;
  latestAutocompleteSuppressedRef.current = isAutocompleteSuppressed;
  if (!isAutocompleteSuppressed) {
    manuallySuppressedAutocompleteRef.current = false;
  }

  const suppressAutocompleteResults = React.useCallback(() => {
    manuallySuppressedAutocompleteRef.current = true;
    autocompleteRequestSequenceRef.current += 1;
    cancelAutocomplete();
  }, [cancelAutocomplete]);

  const allowAutocompleteResults = React.useCallback(() => {
    manuallySuppressedAutocompleteRef.current = false;
  }, []);

  return React.useMemo(
    () => ({
      autocompleteRequestSequenceRef,
      latestAutocompleteQueryRef,
      latestSuggestionScreenActiveRef,
      latestAutocompleteSuppressedRef,
      manuallySuppressedAutocompleteRef,
      suppressAutocompleteResults,
      allowAutocompleteResults,
    }),
    [
      allowAutocompleteResults,
      suppressAutocompleteResults,
    ]
  );
};
