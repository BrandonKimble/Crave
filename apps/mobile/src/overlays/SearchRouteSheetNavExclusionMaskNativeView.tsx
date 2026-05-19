import React from 'react';
import { requireNativeComponent, type ViewProps } from 'react-native';
import Animated from 'react-native-reanimated';

export type SearchRouteSheetNavExclusionMaskNativeProps = ViewProps & {
  maskEnabled?: boolean;
  navBodyBoundaryVisibleY?: number;
  navBodyBoundaryHiddenY?: number;
  navBodyBoundaryTranslateY?: number;
  maskOriginY?: number;
};

export const SearchRouteSheetNavExclusionMaskNativeView =
  requireNativeComponent<SearchRouteSheetNavExclusionMaskNativeProps>(
    'SearchRouteSheetNavExclusionMaskView'
  );

export const AnimatedSearchRouteSheetNavExclusionMaskNativeView = Animated.createAnimatedComponent(
  SearchRouteSheetNavExclusionMaskNativeView as React.ComponentType<SearchRouteSheetNavExclusionMaskNativeProps>
);
