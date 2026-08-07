import React from 'react';

import { logger } from '../../../../utils';
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { Coordinate, MapBounds } from '../../../../types';
import {
  normalizeAutocompleteQuery,
  writeAutocompleteSuggestions,
} from './search-autocomplete-request-runtime';
import type { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';

/**
 * A UX AFFORDANCE, NOT A COST CONTROL (2026-08-02).
 *
 * This was 0 — one request per keystroke — and it was being reasoned about as
 * a spend lever, because the server's autocomplete recall includes an
 * embedding arm that bills per token. That framing was the actual mistake: a
 * client-side debounce is a REQUEST THAT THE CLIENT BE POLITE, and the server
 * must never depend on client politeness for its cost envelope any more than
 * it does for auth. Cost is now enforced server-side where it belongs — the
 * embedding call passes the Gemini spend gate, and the endpoint carries the
 * `autocomplete` rate tier.
 *
 * With cost handled elsewhere, the only remaining question is what feels best
 * to a person typing, which is an owner judgement made by looking at the
 * screen. 90ms is short enough to feel instantaneous (well under the ~100ms
 * threshold where input stops feeling immediate) while collapsing the burst of
 * a fast typist into a single request per pause. Change it because the list
 * feels laggy or flickers — never to save money, which it no longer does.
 */
const AUTOCOMPLETE_DEBOUNCE_MS = 90;

export const useSearchAutocompleteRequestExecutionRuntime = ({
  trimmed,
  shouldRequest,
  runAutocomplete,
  cancelAutocomplete,
  setSuggestions,
  writeAutocompleteCache,
  requestStateRuntime,
  bounds,
  userLocation,
}: {
  trimmed: string;
  shouldRequest: boolean;
  runAutocomplete: (
    value: string,
    options?: {
      debounceMs?: number;
      bounds?: MapBounds | null;
      userLocation?: Coordinate | null;
    }
  ) => Promise<AutocompleteMatch[]>;
  cancelAutocomplete: () => void;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  writeAutocompleteCache: (rawQuery: string, matches: AutocompleteMatch[]) => void;
  requestStateRuntime: ReturnType<typeof useSearchAutocompleteRequestStateRuntime>;
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
}) => {
  React.useEffect(() => {
    if (!shouldRequest) {
      return;
    }

    const requestSequence = ++requestStateRuntime.autocompleteRequestSequenceRef.current;
    let isActive = true;

    void runAutocomplete(trimmed, {
      debounceMs: AUTOCOMPLETE_DEBOUNCE_MS,
      bounds,
      userLocation,
    })
      .then((matches) => {
        if (
          !isActive ||
          requestSequence !== requestStateRuntime.autocompleteRequestSequenceRef.current
        ) {
          return;
        }
        const latestTrimmedQuery = requestStateRuntime.latestAutocompleteQueryRef.current.trim();
        if (
          normalizeAutocompleteQuery(latestTrimmedQuery) !== normalizeAutocompleteQuery(trimmed)
        ) {
          return;
        }
        if (
          requestStateRuntime.latestAutocompleteSuppressedRef.current ||
          !requestStateRuntime.latestSuggestionScreenActiveRef.current
        ) {
          return;
        }
        writeAutocompleteCache(trimmed, matches);
        writeAutocompleteSuggestions(setSuggestions, matches);
      })
      .catch((error) => {
        if (
          !isActive ||
          requestSequence !== requestStateRuntime.autocompleteRequestSequenceRef.current
        ) {
          return;
        }
        if (
          requestStateRuntime.latestAutocompleteSuppressedRef.current ||
          !requestStateRuntime.latestSuggestionScreenActiveRef.current
        ) {
          return;
        }
        logger.warn('Autocomplete request failed', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
        // Never-blank rule (b): a failure KEEPS whatever list is showing (no
        // clear-to-blank). Communicating the failure is NOT this surface's job
        // (owner-standardized 2026-07-24): the api client already reports
        // service failures to the SystemStatusBanner — the app's ONE
        // network-trouble channel. A second, panel-local error surface would
        // fork that standard (and a modal would be hostile mid-typing).
      });

    return () => {
      isActive = false;
      requestStateRuntime.autocompleteRequestSequenceRef.current += 1;
      cancelAutocomplete();
    };
  }, [
    cancelAutocomplete,
    requestStateRuntime,
    runAutocomplete,
    setSuggestions,
    shouldRequest,
    trimmed,
    bounds,
    userLocation,
    writeAutocompleteCache,
  ]);
};
