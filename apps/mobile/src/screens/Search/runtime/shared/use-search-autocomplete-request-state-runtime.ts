import React from 'react';

type SearchAutocompleteRequestStateRuntime = {
  autocompleteRequestSequenceRef: React.MutableRefObject<number>;
  latestAutocompleteQueryRef: React.MutableRefObject<string>;
  latestSuggestionScreenActiveRef: React.MutableRefObject<boolean>;
  latestAutocompleteSuppressedRef: React.MutableRefObject<boolean>;
  suppressAutocompleteResults: () => void;
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

  latestAutocompleteQueryRef.current = query;
  latestSuggestionScreenActiveRef.current = isSuggestionScreenActive;
  latestAutocompleteSuppressedRef.current = isAutocompleteSuppressed;

  // F6000: there is ONE suppression fact (`isAutocompleteSuppressed`, the state
  // the lifecycle memo reads) and ONE staleness fact (the monotonic sequence).
  // A third used to live here — `manuallySuppressedAutocompleteRef`, set by this
  // callback and erased unconditionally in this render body whenever the state
  // was false. At every call site it was therefore either wiped before any
  // reader saw it, or an exact duplicate of the state set beside it. Dropping a
  // late response is the sequence bump's job (the execution runtime's
  // `.then`/`.catch` compare against it before anything else); keeping the panel
  // suppressed across renders is the state's job. A caller that wants the panel
  // to stay suppressed sets the state — it cannot suppress invisibly anymore.
  const suppressAutocompleteResults = React.useCallback(() => {
    autocompleteRequestSequenceRef.current += 1;
    cancelAutocomplete();
  }, [cancelAutocomplete]);

  return React.useMemo(
    () => ({
      autocompleteRequestSequenceRef,
      latestAutocompleteQueryRef,
      latestSuggestionScreenActiveRef,
      latestAutocompleteSuppressedRef,
      suppressAutocompleteResults,
    }),
    [suppressAutocompleteResults]
  );
};
