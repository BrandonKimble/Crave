import React from 'react';

import type { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';

export const useSearchAutocompleteRequestCleanupRuntime = ({
  cancelAutocomplete,
  requestStateRuntime,
}: {
  cancelAutocomplete: () => void;
  requestStateRuntime: ReturnType<typeof useSearchAutocompleteRequestStateRuntime>;
}) => {
  React.useEffect(
    () => () => {
      requestStateRuntime.autocompleteRequestSequenceRef.current += 1;
      cancelAutocomplete();
    },
    [cancelAutocomplete, requestStateRuntime]
  );
};
