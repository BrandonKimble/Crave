import React from 'react';
import { StyleSheet } from 'react-native';

import Reanimated from 'react-native-reanimated';

import { OVERLAY_STACK_ZINDEX } from './overlaySheetStyles';
import type { OverlayContentSpec } from './types';

type UseRestaurantRouteSheetRenderRuntimeArgs = {
  activeShellSpec: OverlayContentSpec<unknown>;
  sheetClipAnimatedStyle: object;
  bottomSheetElement: React.ReactNode;
};

export type RestaurantRouteSheetRenderRuntime = {
  renderedSheet: React.ReactNode;
};

export const useRestaurantRouteSheetRenderRuntime = ({
  activeShellSpec,
  sheetClipAnimatedStyle,
  bottomSheetElement,
}: UseRestaurantRouteSheetRenderRuntimeArgs): RestaurantRouteSheetRenderRuntime => {
  const renderedSheet = React.useMemo(() => {
    const sheetElement = (
      <Reanimated.View
        pointerEvents="box-none"
        style={[styles.sheetClip, sheetClipAnimatedStyle]}
      >
        {activeShellSpec.underlayComponent ?? null}
        {bottomSheetElement}
      </Reanimated.View>
    );

    return typeof activeShellSpec.renderWrapper === 'function'
      ? activeShellSpec.renderWrapper(sheetElement)
      : sheetElement;
  }, [activeShellSpec, bottomSheetElement, sheetClipAnimatedStyle]);

  return React.useMemo(
    () => ({
      renderedSheet,
    }),
    [renderedSheet]
  );
};

const styles = StyleSheet.create({
  sheetClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: OVERLAY_STACK_ZINDEX,
  },
});
