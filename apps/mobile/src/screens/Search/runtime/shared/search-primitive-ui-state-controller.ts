import type React from 'react';
import type { TextInput } from 'react-native';

import type { AutocompleteMatch } from '../../../../services/autocomplete';

export type SearchPrimitiveUiStateSnapshot = {
  suggestions: AutocompleteMatch[];
  isAutocompleteSuppressed: boolean;
  isSearchFocused: boolean;
};

export type SearchPrimitiveUiStateController = {
  getSnapshot: () => SearchPrimitiveUiStateSnapshot;
  setSuggestions: (
    nextValue: React.SetStateAction<AutocompleteMatch[]>
  ) => SearchPrimitiveUiStateSnapshot | null;
  setIsAutocompleteSuppressed: (
    nextValue: React.SetStateAction<boolean>
  ) => SearchPrimitiveUiStateSnapshot | null;
  setIsSearchFocused: (
    nextValue: React.SetStateAction<boolean>
  ) => SearchPrimitiveUiStateSnapshot | null;
  beginSuggestionCloseHoldRef: React.MutableRefObject<() => boolean>;
  setBeginSuggestionCloseHold: (handler: () => boolean) => void;
  beginSuggestionCloseHold: () => boolean;
  inputRef: React.MutableRefObject<TextInput | null>;
  focusInput: () => void;
  blurInput: () => void;
  reset: () => SearchPrimitiveUiStateSnapshot | null;
};

export type SearchPrimitiveUiCleanupActions = {
  beginSuggestionCloseHold: () => boolean;
  setSearchFocusedInactive: () => void;
  suppressAutocomplete: () => void;
  clearSuggestions: () => void;
  blurInput: () => void;
};

const resolveStateAction = <TValue>(
  nextValue: React.SetStateAction<TValue>,
  previousValue: TValue
): TValue =>
  typeof nextValue === 'function'
    ? (nextValue as (previousValue: TValue) => TValue)(previousValue)
    : nextValue;

export const createSearchPrimitiveUiStateController = (
  initialSnapshot: SearchPrimitiveUiStateSnapshot = {
    suggestions: [],
    isAutocompleteSuppressed: false,
    isSearchFocused: false,
  }
): SearchPrimitiveUiStateController => {
  let snapshot = initialSnapshot;
  const beginSuggestionCloseHoldRef: React.MutableRefObject<() => boolean> = {
    current: () => false,
  };
  const inputRef: React.MutableRefObject<TextInput | null> = {
    current: null,
  };

  const commitSnapshot = (
    nextSnapshot: SearchPrimitiveUiStateSnapshot
  ): SearchPrimitiveUiStateSnapshot | null => {
    if (
      Object.is(snapshot.suggestions, nextSnapshot.suggestions) &&
      snapshot.isAutocompleteSuppressed === nextSnapshot.isAutocompleteSuppressed &&
      snapshot.isSearchFocused === nextSnapshot.isSearchFocused
    ) {
      return null;
    }

    snapshot = nextSnapshot;
    return snapshot;
  };

  return {
    getSnapshot: () => snapshot,
    setSuggestions(nextValue) {
      return commitSnapshot({
        ...snapshot,
        suggestions: resolveStateAction(nextValue, snapshot.suggestions),
      });
    },
    setIsAutocompleteSuppressed(nextValue) {
      return commitSnapshot({
        ...snapshot,
        isAutocompleteSuppressed: resolveStateAction(nextValue, snapshot.isAutocompleteSuppressed),
      });
    },
    setIsSearchFocused(nextValue) {
      return commitSnapshot({
        ...snapshot,
        isSearchFocused: resolveStateAction(nextValue, snapshot.isSearchFocused),
      });
    },
    beginSuggestionCloseHoldRef,
    setBeginSuggestionCloseHold(handler) {
      beginSuggestionCloseHoldRef.current = handler;
    },
    beginSuggestionCloseHold: () => beginSuggestionCloseHoldRef.current(),
    inputRef,
    focusInput: () => {
      inputRef.current?.focus?.();
    },
    blurInput: () => {
      inputRef.current?.blur?.();
    },
    reset: () =>
      commitSnapshot({
        suggestions: [],
        isAutocompleteSuppressed: false,
        isSearchFocused: false,
      }),
  };
};
