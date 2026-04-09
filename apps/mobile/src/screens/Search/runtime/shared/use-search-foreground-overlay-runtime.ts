import React from 'react';
import { Keyboard } from 'react-native';

import { useOverlaySheetPositionStore } from '../../../../overlays/useOverlaySheetPositionStore';

import type {
  SearchForegroundInteractionOverlayHandlers,
  SearchForegroundInteractionSubmitHandlers,
  UseSearchForegroundInteractionRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundOverlayRuntimeArgs = Pick<
  UseSearchForegroundInteractionRuntimeArgs,
  | 'navigation'
  | 'routeSearchIntent'
  | 'userLocation'
  | 'rootOverlay'
  | 'profilePresentationActive'
  | 'overlayRuntimeController'
  | 'closeRestaurantProfile'
  | 'dismissTransientOverlays'
  | 'beginSuggestionCloseHoldRef'
  | 'setOverlaySwitchInFlight'
  | 'setTabOverlaySnapRequest'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setIsAutocompleteSuppressed'
  | 'setIsSuggestionLayoutWarm'
  | 'setSearchTransitionVariant'
  | 'ignoreNextSearchBlurRef'
  | 'allowSearchBlurExitRef'
  | 'inputRef'
  | 'cancelAutocomplete'
  | 'resetSearchHeaderFocusProgress'
  | 'resetSubmitTransitionHold'
>;

type UseSearchForegroundOverlayRuntimeDependencies = {
  submitHandlers: Pick<
    SearchForegroundInteractionSubmitHandlers,
    | 'handleRecentSearchPress'
    | 'handleRecentlyViewedRestaurantPress'
    | 'handleRecentlyViewedFoodPress'
  >;
};

export const useSearchForegroundOverlayRuntime = ({
  navigation,
  routeSearchIntent,
  userLocation,
  rootOverlay,
  profilePresentationActive,
  overlayRuntimeController,
  closeRestaurantProfile,
  dismissTransientOverlays,
  beginSuggestionCloseHoldRef,
  setOverlaySwitchInFlight,
  setTabOverlaySnapRequest,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  setIsAutocompleteSuppressed,
  setIsSuggestionLayoutWarm,
  setSearchTransitionVariant,
  ignoreNextSearchBlurRef,
  allowSearchBlurExitRef,
  inputRef,
  cancelAutocomplete,
  resetSearchHeaderFocusProgress,
  resetSubmitTransitionHold,
  submitHandlers,
}: UseSearchForegroundOverlayRuntimeArgs &
  UseSearchForegroundOverlayRuntimeDependencies): SearchForegroundInteractionOverlayHandlers => {
  const resetSuggestionUiForExternalSubmit = React.useCallback(() => {
    ignoreNextSearchBlurRef.current = true;
    resetSearchHeaderFocusProgress();
    const input = inputRef.current;
    if (input?.isFocused?.()) {
      input.blur();
    }
    Keyboard.dismiss();
    resetSubmitTransitionHold();
    setSearchTransitionVariant('default');
    setIsAutocompleteSuppressed(true);
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    setIsSuggestionLayoutWarm(false);
    setShowSuggestions(false);
    setSuggestions([]);
    cancelAutocomplete();
  }, [
    cancelAutocomplete,
    ignoreNextSearchBlurRef,
    inputRef,
    resetSearchHeaderFocusProgress,
    resetSubmitTransitionHold,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionLayoutWarm,
    setIsSuggestionPanelActive,
    setSearchTransitionVariant,
    setShowSuggestions,
    setSuggestions,
  ]);

  const runViewMoreIntent = React.useCallback(
    (intent: NonNullable<UseSearchForegroundInteractionRuntimeArgs['routeSearchIntent']>) => {
      if (intent.type === 'recentSearch') {
        submitHandlers.handleRecentSearchPress(intent.entry);
        return;
      }
      if (intent.type === 'recentlyViewed') {
        submitHandlers.handleRecentlyViewedRestaurantPress(intent.restaurant);
        return;
      }
      submitHandlers.handleRecentlyViewedFoodPress(intent.food);
    },
    [submitHandlers]
  );

  React.useLayoutEffect(() => {
    if (!routeSearchIntent) {
      return;
    }
    resetSuggestionUiForExternalSubmit();
    navigation.setParams({ searchIntent: undefined });
    runViewMoreIntent(routeSearchIntent);
  }, [navigation, resetSuggestionUiForExternalSubmit, routeSearchIntent, runViewMoreIntent]);

  const prepareForViewMoreNavigation = React.useCallback(() => {
    const input = inputRef.current;
    if (input?.isFocused?.()) {
      ignoreNextSearchBlurRef.current = true;
      allowSearchBlurExitRef.current = true;
      input.blur();
    }
    Keyboard.dismiss();
  }, [allowSearchBlurExitRef, ignoreNextSearchBlurRef, inputRef]);

  const handleRecentViewMorePress = React.useCallback(() => {
    prepareForViewMoreNavigation();
    navigation.push('RecentSearches', { userLocation });
  }, [navigation, prepareForViewMoreNavigation, userLocation]);

  const handleRecentlyViewedMorePress = React.useCallback(() => {
    prepareForViewMoreNavigation();
    navigation.push('RecentlyViewed', { userLocation });
  }, [navigation, prepareForViewMoreNavigation, userLocation]);

  const handleOverlaySelect = React.useCallback(
    (target: UseSearchForegroundInteractionRuntimeArgs['rootOverlay']) => {
      dismissTransientOverlays();
      const shouldDeferSuggestionClear = beginSuggestionCloseHoldRef.current();
      setIsSuggestionPanelActive(false);
      if (target === 'search') {
        setOverlaySwitchInFlight(true);
        overlayRuntimeController.switchToSearchRootWithDockedPolls();
        setIsSearchFocused(false);
        setIsAutocompleteSuppressed(true);
        if (!shouldDeferSuggestionClear) {
          setShowSuggestions(false);
          setSuggestions([]);
        }
        inputRef.current?.blur?.();
        requestAnimationFrame(() => {
          setOverlaySwitchInFlight(false);
        });
        return;
      }

      const overlaySheetPositionState = useOverlaySheetPositionStore.getState();
      const desiredTabSnap = overlaySheetPositionState.hasUserSharedSnap
        ? overlaySheetPositionState.sharedSnap
        : 'expanded';
      const shouldRequestTabSnap = rootOverlay === 'search';

      setTabOverlaySnapRequest(shouldRequestTabSnap ? desiredTabSnap : null);
      if (profilePresentationActive) {
        closeRestaurantProfile();
      }

      setOverlaySwitchInFlight(true);
      overlayRuntimeController.setRootOverlay(target);
      inputRef.current?.blur?.();
      requestAnimationFrame(() => {
        setOverlaySwitchInFlight(false);
      });
    },
    [
      beginSuggestionCloseHoldRef,
      closeRestaurantProfile,
      dismissTransientOverlays,
      inputRef,
      overlayRuntimeController,
      profilePresentationActive,
      rootOverlay,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setOverlaySwitchInFlight,
      setShowSuggestions,
      setSuggestions,
      setTabOverlaySnapRequest,
    ]
  );

  const handleProfilePress = React.useCallback(() => {
    handleOverlaySelect('profile');
  }, [handleOverlaySelect]);

  return {
    handleRecentViewMorePress,
    handleRecentlyViewedMorePress,
    handleOverlaySelect,
    handleProfilePress,
  };
};
