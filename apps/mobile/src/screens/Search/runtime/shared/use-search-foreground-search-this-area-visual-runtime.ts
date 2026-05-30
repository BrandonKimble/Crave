import React from 'react';
import { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';

import { SEARCH_CHROME_SCALE_TRANSFORM_ORIGIN } from '../../constants/search';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';

import type {
  SearchForegroundSearchThisAreaVisualRuntime,
  UseSearchForegroundVisualRuntimeArgs,
} from './use-search-foreground-visual-runtime-contract';

type UseSearchForegroundSearchThisAreaVisualRuntimeArgs = Pick<
  UseSearchForegroundVisualRuntimeArgs,
  | 'isSuggestionPanelActive'
  | 'searchChromeOpacity'
  | 'searchChromeScale'
  | 'searchLayoutTop'
  | 'searchLayoutHeight'
  | 'insetsTop'
  | 'isSuggestionOverlayVisible'
  | 'isSearchOverlay'
  | 'backdropTarget'
  | 'isSearchSessionActive'
  | 'mapMovedSinceSearch'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'hasResults'
>;

export const useSearchForegroundSearchThisAreaVisualRuntime = ({
  isSuggestionPanelActive,
  searchChromeOpacity,
  searchChromeScale,
  searchLayoutTop,
  searchLayoutHeight,
  insetsTop,
  isSuggestionOverlayVisible,
  isSearchOverlay,
  backdropTarget,
  isSearchSessionActive,
  mapMovedSinceSearch,
  isSearchLoading,
  isLoadingMore,
  hasResults,
}: UseSearchForegroundSearchThisAreaVisualRuntimeArgs): SearchForegroundSearchThisAreaVisualRuntime => {
  const shouldShowSearchThisArea =
    isSearchOverlay &&
    !isSuggestionPanelActive &&
    backdropTarget === 'results' &&
    isSearchSessionActive &&
    mapMovedSinceSearch &&
    !isSearchLoading &&
    !isLoadingMore &&
    hasResults;
  React.useEffect(() => {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'search_this_area_visibility_inputs_contract',
      shouldShowSearchThisArea,
      isSearchOverlay,
      isSuggestionPanelActive,
      backdropTarget,
      isSearchSessionActive,
      mapMovedSinceSearch,
      isSearchLoading,
      isLoadingMore,
      hasResults,
    });
  }, [
    backdropTarget,
    hasResults,
    isLoadingMore,
    isSearchLoading,
    isSearchOverlay,
    isSearchSessionActive,
    isSuggestionPanelActive,
    mapMovedSinceSearch,
    shouldShowSearchThisArea,
  ]);
  const shouldLockSearchChromeTransform = isSuggestionPanelActive || isSuggestionOverlayVisible;
  const searchThisAreaRevealProgress = useDerivedValue(() => {
    return withTiming(shouldShowSearchThisArea ? 1 : 0, {
      duration: 200,
    });
  }, [shouldShowSearchThisArea]);
  const searchThisAreaAnimatedStyle = useAnimatedStyle(() => {
    const opacity = searchChromeOpacity.value * searchThisAreaRevealProgress.value;
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    return {
      opacity,
      transformOrigin: SEARCH_CHROME_SCALE_TRANSFORM_ORIGIN,
      transform: [{ scale: chromeScale }],
      display: opacity < 0.02 ? 'none' : 'flex',
    };
  }, [shouldLockSearchChromeTransform]);
  const searchThisAreaTop = Math.max(searchLayoutTop + searchLayoutHeight + 12, insetsTop + 12);
  const statusBarFadeHeightFallback = Math.max(0, insetsTop + 16);
  const statusBarFadeHeight = Math.max(
    0,
    searchLayoutTop > 0 ? searchLayoutTop + 8 : statusBarFadeHeightFallback
  );

  return {
    shouldShowSearchThisArea,
    searchThisAreaTop,
    searchThisAreaAnimatedStyle,
    statusBarFadeHeight,
  };
};
