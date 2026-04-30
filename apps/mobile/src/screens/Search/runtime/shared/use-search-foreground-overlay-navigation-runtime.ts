import React from 'react';
import { Keyboard } from 'react-native';

import type {
  SearchForegroundInteractionOverlayHandlers,
  SearchForegroundOverlayRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

export const useSearchForegroundOverlayNavigationRuntime = ({
  navigation,
  userLocation,
  transitionActions,
  ignoreNextSearchBlurRef,
  allowSearchBlurExitRef,
  inputRef,
}: SearchForegroundOverlayRuntimeArgs): SearchForegroundInteractionOverlayHandlers => {
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
      transitionActions.requestOverlaySwitch({
        targetSceneKey: target,
      });
    },
    [transitionActions]
  );

  const handleProfilePress = React.useCallback(() => {
    handleOverlaySelect('profile');
  }, [handleOverlaySelect]);

  return React.useMemo(
    () => ({
      handleRecentViewMorePress,
      handleRecentlyViewedMorePress,
      handleOverlaySelect,
      handleProfilePress,
    }),
    [
      handleOverlaySelect,
      handleProfilePress,
      handleRecentViewMorePress,
      handleRecentlyViewedMorePress,
    ]
  );
};
