import React from 'react';
import { Keyboard, unstable_batchedUpdates } from 'react-native';

import { clearSearchRoutePollsPanelParams } from '../../../../overlays/searchRouteOverlayCommandStore';
import { useOverlaySheetPositionStore } from '../../../../overlays/useOverlaySheetPositionStore';
import { logger } from '../../../../utils';
import { beginSearchNavSwitchPerfProbe } from './search-nav-switch-perf-probe';

import type {
  SearchForegroundOverlayRuntimeArgs,
  SearchForegroundInteractionOverlayHandlers,
  SearchForegroundInteractionSubmitHandlers,
} from './use-search-foreground-interaction-runtime-contract';

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
  transitionController,
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
}: SearchForegroundOverlayRuntimeArgs &
  UseSearchForegroundOverlayRuntimeDependencies): SearchForegroundInteractionOverlayHandlers => {
  const getNowMs = React.useCallback(() => {
    const perfNow = globalThis.performance?.now?.();
    return typeof perfNow === 'number' && Number.isFinite(perfNow) ? perfNow : Date.now();
  }, []);

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
    (intent: NonNullable<SearchForegroundOverlayRuntimeArgs['routeSearchIntent']>) => {
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
    (target: SearchForegroundOverlayRuntimeArgs['rootOverlay']) => {
      const perfProbe = beginSearchNavSwitchPerfProbe({
        from: rootOverlay,
        to: target,
      });
      const startedAtMs = getNowMs();
      const logNavSwitchStep = (step: string) => {
        logger.debug('[NAV-SWITCH-PERF] handlerStep', {
          seq: perfProbe.seq,
          from: perfProbe.from,
          to: perfProbe.to,
          step,
          elapsedMs: Number((getNowMs() - startedAtMs).toFixed(1)),
        });
      };

      logNavSwitchStep('begin');
      dismissTransientOverlays();
      logNavSwitchStep('dismissTransientOverlays');
      const shouldDeferSuggestionClear = beginSuggestionCloseHoldRef.current();
      logNavSwitchStep('beginSuggestionCloseHold');
      setIsSuggestionPanelActive(false);
      logNavSwitchStep('setIsSuggestionPanelActive:false');
      if (target === 'search' || target === 'polls') {
        transitionController.beginOverlaySwitch();
        unstable_batchedUpdates(() => {
          clearSearchRoutePollsPanelParams();
          logNavSwitchStep('setOverlaySwitchInFlight:true');
          overlayRuntimeController.switchToSearchRootWithDockedPolls();
          logNavSwitchStep('switchToSearchRootWithDockedPolls');
          setIsSearchFocused(false);
          setIsAutocompleteSuppressed(true);
          logNavSwitchStep('setSearchFlagsForSearchRoot');
          if (!shouldDeferSuggestionClear) {
            setShowSuggestions(false);
            setSuggestions([]);
            logNavSwitchStep('clearSuggestions');
          }
          inputRef.current?.blur?.();
        });
        logNavSwitchStep('blurInput');
        requestAnimationFrame(() => {
          transitionController.endOverlaySwitch();
          logger.debug('[NAV-SWITCH-PERF] handlerStep', {
            seq: perfProbe.seq,
            from: perfProbe.from,
            to: perfProbe.to,
            step: 'setOverlaySwitchInFlight:false',
            elapsedMs: Number((getNowMs() - startedAtMs).toFixed(1)),
          });
        });
        return;
      }

      const overlaySheetPositionState = useOverlaySheetPositionStore.getState();
      const desiredTabSnap = overlaySheetPositionState.hasUserSharedSnap
        ? overlaySheetPositionState.sharedSnap
        : 'expanded';
      const shouldRequestTabSnap = rootOverlay === 'search';

      transitionController.beginOverlaySwitch();
      unstable_batchedUpdates(() => {
        clearSearchRoutePollsPanelParams();
        setTabOverlaySnapRequest(shouldRequestTabSnap ? desiredTabSnap : null);
        logNavSwitchStep('setTabOverlaySnapRequest');
        if (profilePresentationActive) {
          closeRestaurantProfile();
          logNavSwitchStep('closeRestaurantProfile');
        }

        logNavSwitchStep('setOverlaySwitchInFlight:true');
        overlayRuntimeController.setRootOverlay(target);
        logNavSwitchStep('setRootOverlay');
        inputRef.current?.blur?.();
      });
      logNavSwitchStep('blurInput');
      requestAnimationFrame(() => {
        transitionController.endOverlaySwitch();
        logger.debug('[NAV-SWITCH-PERF] handlerStep', {
          seq: perfProbe.seq,
          from: perfProbe.from,
          to: perfProbe.to,
          step: 'setOverlaySwitchInFlight:false',
          elapsedMs: Number((getNowMs() - startedAtMs).toFixed(1)),
        });
      });
    },
    [
      beginSuggestionCloseHoldRef,
      closeRestaurantProfile,
      dismissTransientOverlays,
      getNowMs,
      inputRef,
      overlayRuntimeController,
      profilePresentationActive,
      rootOverlay,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setShowSuggestions,
      setSuggestions,
      setTabOverlaySnapRequest,
      transitionController,
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
