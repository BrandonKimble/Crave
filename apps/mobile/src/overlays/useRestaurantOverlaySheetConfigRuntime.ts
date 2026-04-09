import React from 'react';
import { Dimensions, type ViewStyle } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { overlaySheetStyles } from './overlaySheetStyles';
import { calculateSnapPoints } from './sheetUtils';

export type RestaurantOverlaySheetConfig = {
  snapPoints: import('./bottomSheetMotionTypes').BottomSheetSnapPoints;
  initialSnapPoint: Exclude<import('./bottomSheetMotionTypes').BottomSheetSnap, 'hidden'>;
  animateOnMount: true;
  style: ViewStyle | ViewStyle[];
  onHidden: (() => void) | undefined;
  dismissThreshold: number | undefined;
  preventSwipeDismiss: true;
  interactionEnabled: boolean;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

type UseRestaurantOverlaySheetConfigRuntimeArgs = {
  navBarTop?: number;
  searchBarTop?: number;
  onDismiss?: () => void;
  interactionEnabled?: boolean;
  containerStyle?: ViewStyle | null;
};

export const useRestaurantOverlaySheetConfigRuntime = ({
  navBarTop = 0,
  searchBarTop = 0,
  onDismiss,
  interactionEnabled = true,
  containerStyle,
}: UseRestaurantOverlaySheetConfigRuntimeArgs): RestaurantOverlaySheetConfig => {
  const insets = useSafeAreaInsets();
  const navBarOffset = Math.max(navBarTop, 0);
  const dismissThreshold = navBarOffset > 0 ? navBarOffset : undefined;
  const snapPoints = React.useMemo(
    () => calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insets.top, navBarOffset, 0),
    [insets.top, navBarOffset, searchBarTop]
  );

  return React.useMemo(
    () => ({
      snapPoints,
      initialSnapPoint: 'middle' as const satisfies Exclude<
        RestaurantOverlaySheetConfig['initialSnapPoint'],
        'hidden'
      >,
      animateOnMount: true,
      style: [overlaySheetStyles.container, containerStyle as ViewStyle],
      onHidden: onDismiss,
      dismissThreshold,
      preventSwipeDismiss: true,
      interactionEnabled,
    }),
    [containerStyle, dismissThreshold, interactionEnabled, onDismiss, snapPoints]
  );
};
