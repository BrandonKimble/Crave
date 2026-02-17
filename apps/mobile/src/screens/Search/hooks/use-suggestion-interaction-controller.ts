import React from 'react';
import type { TextInput } from 'react-native';

type UseSuggestionInteractionControllerArgs = {
  inputRef: React.RefObject<TextInput | null>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  dismissSearchKeyboard: () => void;
  shouldLogPerf: boolean;
  dismissHoldMs?: number;
};

type UseSuggestionInteractionControllerResult = {
  isSuggestionScrollDismissing: boolean;
  handleSuggestionInteractionStart: () => void;
  handleSuggestionTouchStart: () => void;
  handleSuggestionInteractionEnd: () => void;
};

export const useSuggestionInteractionController = ({
  inputRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  setIsSearchFocused,
  dismissSearchKeyboard,
  shouldLogPerf,
  dismissHoldMs = 450,
}: UseSuggestionInteractionControllerArgs): UseSuggestionInteractionControllerResult => {
  const [isSuggestionScrollDismissing, setIsSuggestionScrollDismissing] = React.useState(false);
  const suggestionScrollDismissTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  React.useEffect(
    () => () => {
      if (suggestionScrollDismissTimeoutRef.current) {
        clearTimeout(suggestionScrollDismissTimeoutRef.current);
        suggestionScrollDismissTimeoutRef.current = null;
      }
    },
    []
  );

  const handleSuggestionInteractionStart = React.useCallback(() => {
    const focused = Boolean(inputRef.current?.isFocused?.());
    if (shouldLogPerf) {
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf] suggestionInteractionStart focused=${focused}`);
    }
    if (!focused) {
      return;
    }

    allowSearchBlurExitRef.current = true;
    ignoreNextSearchBlurRef.current = true;
    setIsSearchFocused(false);
    setIsSuggestionScrollDismissing(true);
    if (suggestionScrollDismissTimeoutRef.current) {
      clearTimeout(suggestionScrollDismissTimeoutRef.current);
    }
    dismissSearchKeyboard();
    suggestionScrollDismissTimeoutRef.current = setTimeout(() => {
      suggestionScrollDismissTimeoutRef.current = null;
      setIsSuggestionScrollDismissing(false);
    }, dismissHoldMs);
  }, [
    allowSearchBlurExitRef,
    dismissHoldMs,
    dismissSearchKeyboard,
    ignoreNextSearchBlurRef,
    inputRef,
    setIsSearchFocused,
    shouldLogPerf,
  ]);

  const handleSuggestionTouchStart = React.useCallback(() => {
    const focused = Boolean(inputRef.current?.isFocused?.());
    if (!focused) {
      return;
    }
    allowSearchBlurExitRef.current = true;
    ignoreNextSearchBlurRef.current = true;
    setIsSearchFocused(false);
    dismissSearchKeyboard();
  }, [
    allowSearchBlurExitRef,
    dismissSearchKeyboard,
    ignoreNextSearchBlurRef,
    inputRef,
    setIsSearchFocused,
  ]);

  const handleSuggestionInteractionEnd = React.useCallback(() => {
    if (suggestionScrollDismissTimeoutRef.current) {
      clearTimeout(suggestionScrollDismissTimeoutRef.current);
      suggestionScrollDismissTimeoutRef.current = null;
    }
    setIsSuggestionScrollDismissing(false);
  }, []);

  return {
    isSuggestionScrollDismissing,
    handleSuggestionInteractionStart,
    handleSuggestionTouchStart,
    handleSuggestionInteractionEnd,
  };
};
