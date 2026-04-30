import React from 'react';
import { Keyboard, type TextInput } from 'react-native';

import type { AutocompleteMatch } from '../../../services/autocomplete';

type UseSuggestionInteractionControllerArgs = {
  inputRef: React.RefObject<TextInput | null>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  beginSuggestionCloseHold: (mode?: 'default' | 'submitting') => boolean;
  resetSearchHeaderFocusProgress: () => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  shouldLogPerf?: boolean;
};

export const useSuggestionInteractionController = ({
  inputRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  beginSuggestionCloseHold,
  resetSearchHeaderFocusProgress,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  shouldLogPerf: _shouldLogPerf = false,
}: UseSuggestionInteractionControllerArgs) => {
  const [isSuggestionScrollDismissing, setIsSuggestionScrollDismissing] = React.useState(false);

  const dismissSearchKeyboard = React.useCallback(() => {
    inputRef.current?.blur?.();
    Keyboard.dismiss();
  }, [inputRef]);

  const dismissSearchInteractionUi = React.useCallback(() => {
    allowSearchBlurExitRef.current = true;
    ignoreNextSearchBlurRef.current = false;
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    setShowSuggestions(false);
    setSuggestions([]);
    setIsSuggestionScrollDismissing(false);
    resetSearchHeaderFocusProgress();
    dismissSearchKeyboard();
  }, [
    allowSearchBlurExitRef,
    dismissSearchKeyboard,
    ignoreNextSearchBlurRef,
    resetSearchHeaderFocusProgress,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
  ]);

  const handleSuggestionTouchStart = React.useCallback(() => {
    allowSearchBlurExitRef.current = false;
    setIsSuggestionScrollDismissing(false);
  }, [allowSearchBlurExitRef]);

  const handleSuggestionInteractionStart = React.useCallback(() => {
    allowSearchBlurExitRef.current = false;
    setIsSuggestionScrollDismissing(true);
  }, [allowSearchBlurExitRef]);

  const handleSuggestionInteractionEnd = React.useCallback(() => {
    beginSuggestionCloseHold();
    setIsSuggestionScrollDismissing(false);
  }, [beginSuggestionCloseHold]);

  return React.useMemo(
    () => ({
      inputRef,
      dismissSearchKeyboard,
      dismissSearchInteractionUi,
      handleSuggestionTouchStart,
      handleSuggestionInteractionStart,
      handleSuggestionInteractionEnd,
      isSuggestionScrollDismissing,
    }),
    [
      dismissSearchInteractionUi,
      dismissSearchKeyboard,
      handleSuggestionInteractionEnd,
      handleSuggestionInteractionStart,
      handleSuggestionTouchStart,
      inputRef,
      isSuggestionScrollDismissing,
    ]
  );
};
