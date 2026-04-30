import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import type { BottomSheetSceneStackChromeEntry } from './bottomSheetSceneStackHostContract';
import { BottomSheetSceneStackMountedChrome } from './BottomSheetSceneStackMountedChromeRegistry';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';

type SceneStackDecorLayerKind = 'underlay' | 'background' | 'overlay';

type SceneStackDecorLayerProps = {
  entry: BottomSheetSceneStackChromeEntry;
  kind: SceneStackDecorLayerKind;
  visibilityValue: SharedValue<number>;
};

type SceneStackHeaderLayerProps = {
  entry: BottomSheetSceneStackChromeEntry;
  visibilityValue: SharedValue<number>;
};

export const SceneStackDecorLayer = React.memo(
  ({ entry, kind, visibilityValue }: SceneStackDecorLayerProps) => {
    const { sceneKey } = entry;
    const visibilityStyle = useAnimatedStyle(
      () => {
        const isVisible = visibilityValue.value > 0.5;
        return {
          display: isVisible ? 'flex' : 'none',
          opacity: visibilityValue.value,
          zIndex: isVisible ? 2 : 0,
        };
      },
      [visibilityValue]
    );
    const component =
      entry.surfaceKind === 'mounted' && entry.mountedChromeKey != null ? (
        <BottomSheetSceneStackMountedChrome
          mountedChromeKey={entry.mountedChromeKey}
          surface={kind}
        />
      ) : kind === 'underlay' ? (
        entry.underlayComponent
      ) : kind === 'background' ? (
        entry.backgroundComponent
      ) : (
        entry.overlayComponent
      );
    if (!component) {
      return null;
    }

    const pointerEvents = kind === 'overlay' ? 'box-none' : 'none';

    return (
      <Animated.View
        key={`${kind}-${sceneKey}`}
        pointerEvents={pointerEvents}
        style={[StyleSheet.absoluteFillObject, visibilityStyle]}
      >
        {component}
      </Animated.View>
    );
  },
  (previousProps, nextProps) =>
    previousProps.entry === nextProps.entry &&
    previousProps.kind === nextProps.kind &&
    previousProps.visibilityValue === nextProps.visibilityValue
);

export const SceneStackHeaderLayer = React.memo(
  ({ entry, visibilityValue }: SceneStackHeaderLayerProps) => {
    const visibilityStyle = useAnimatedStyle(
      () => {
        const isVisible = visibilityValue.value > 0.5;
        return {
          display: isVisible ? 'flex' : 'none',
          opacity: visibilityValue.value,
          zIndex: isVisible ? 2 : 0,
        };
      },
      [visibilityValue]
    );
    const headerComponent =
      entry.surfaceKind === 'mounted' && entry.mountedChromeKey != null ? (
        <BottomSheetSceneStackMountedChrome
          mountedChromeKey={entry.mountedChromeKey}
          surface="header"
        />
      ) : (
        entry.headerComponent
      );
    if (!headerComponent) {
      return null;
    }

    return (
      <Animated.View
        key={`header-${entry.sceneKey}`}
        pointerEvents="auto"
        style={[styles.sceneHeaderLayer, visibilityStyle]}
      >
        {headerComponent}
      </Animated.View>
    );
  },
  (previousProps, nextProps) =>
    previousProps.entry === nextProps.entry &&
    previousProps.visibilityValue === nextProps.visibilityValue
);
