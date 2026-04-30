import React from 'react';

import { logger } from '../../../../utils';
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import {
  normalizeAutocompleteQuery,
  writeAutocompleteSuggestions,
} from './search-autocomplete-request-runtime';
import type { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';

const AUTOCOMPLETE_DEBOUNCE_MS = 0;

export const useSearchAutocompleteRequestExecutionRuntime = ({
  trimmed,
  shouldRequest,
  runAutocomplete,
  cancelAutocomplete,
  setSuggestions,
  setShowSuggestions,
  clearAutocompleteSuggestions,
  writeAutocompleteCache,
  requestStateRuntime,
}: {
  trimmed: string;
  shouldRequest: boolean;
  runAutocomplete: (
    value: string,
    options?: { debounceMs?: number }
  ) => Promise<AutocompleteMatch[]>;
  cancelAutocomplete: () => void;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  clearAutocompleteSuggestions: () => void;
  writeAutocompleteCache: (rawQuery: string, matches: AutocompleteMatch[]) => void;
  requestStateRuntime: ReturnType<typeof useSearchAutocompleteRequestStateRuntime>;
}) => {
  React.useEffect(() => {
    if (!shouldRequest) {
      return;
    }

    const requestSequence =
      ++requestStateRuntime.autocompleteRequestSequenceRef.current;
    let isActive = true;

    void runAutocomplete(trimmed, { debounceMs: AUTOCOMPLETE_DEBOUNCE_MS })
      .then((matches) => {
        if (
          !isActive ||
          requestSequence !== requestStateRuntime.autocompleteRequestSequenceRef.current
        ) {
          return;
        }
        const latestTrimmedQuery =
          requestStateRuntime.latestAutocompleteQueryRef.current.trim();
        if (
          normalizeAutocompleteQuery(latestTrimmedQuery) !==
          normalizeAutocompleteQuery(trimmed)
        ) {
          return;
        }
        const isLatestSuppressed =
          requestStateRuntime.latestAutocompleteSuppressedRef.current ||
          requestStateRuntime.manuallySuppressedAutocompleteRef.current;
        if (
          isLatestSuppressed ||
          !requestStateRuntime.latestSuggestionScreenActiveRef.current
        ) {
          return;
        }
        writeAutocompleteCache(trimmed, matches);
        writeAutocompleteSuggestions(setSuggestions, setShowSuggestions, matches);
      })
      .catch((error) => {
        if (
          !isActive ||
          requestSequence !== requestStateRuntime.autocompleteRequestSequenceRef.current
        ) {
          return;
        }
        const isLatestSuppressed =
          requestStateRuntime.latestAutocompleteSuppressedRef.current ||
          requestStateRuntime.manuallySuppressedAutocompleteRef.current;
        if (
          isLatestSuppressed ||
          !requestStateRuntime.latestSuggestionScreenActiveRef.current
        ) {
          return;
        }
        logger.warn('Autocomplete request failed', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
        clearAutocompleteSuggestions();
      });

    return () => {
      isActive = false;
      requestStateRuntime.autocompleteRequestSequenceRef.current += 1;
      cancelAutocomplete();
    };
  }, [
    cancelAutocomplete,
    clearAutocompleteSuggestions,
    requestStateRuntime,
    runAutocomplete,
    setShowSuggestions,
    setSuggestions,
    shouldRequest,
    trimmed,
    writeAutocompleteCache,
  ]);
};
