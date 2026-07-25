import React from 'react';

// Never-blank rule (c) (plans/suggest-ideal-shape.md — "add an error state distinct
// from no-matches"): autocomplete failures used to resolve to [] silently, so a
// network error rendered exactly like "no matches". This store carries the ONE bit
// "the latest adopted autocomplete attempt failed" from the request execution
// runtime to the suggestion rows, which render a quiet one-line notice when there
// is nothing else to show. Module scope IS the surface scope (house
// module-registry pattern — ONE search surface exists per app; see
// use-search-root-search-primitives-runtime.ts) — threading one boolean through
// the full arg-contract chain would touch ~8 contracts for no added truth.

let hasSearchAutocompleteError = false;
const listeners = new Set<() => void>();

export const setSearchAutocompleteError = (next: boolean): void => {
  if (hasSearchAutocompleteError === next) {
    return;
  }
  hasSearchAutocompleteError = next;
  listeners.forEach((listener) => listener());
};

export const getSearchAutocompleteError = (): boolean => hasSearchAutocompleteError;

export const subscribeSearchAutocompleteError = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useSearchAutocompleteError = (): boolean =>
  React.useSyncExternalStore(
    subscribeSearchAutocompleteError,
    getSearchAutocompleteError,
    getSearchAutocompleteError
  );
