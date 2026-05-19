import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { BottomSheetSceneStackChromeEntry } from './bottomSheetSceneStackHostContract';
import { BottomSheetSceneStackMountedChrome } from './BottomSheetSceneStackMountedChromeRegistry';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';

type SceneStackDecorLayerKind = 'underlay' | 'background' | 'overlay';

type SceneStackDecorLayerProps = {
  entry: BottomSheetSceneStackChromeEntry;
  kind: SceneStackDecorLayerKind;
  promotedZIndex?: number;
  isVisible: boolean;
};

type SceneStackHeaderLayerProps = {
  entry: BottomSheetSceneStackChromeEntry;
  promotedZIndex?: number;
  isVisible: boolean;
};

export const SceneStackDecorLayer = React.memo(
  ({ entry, kind, promotedZIndex, isVisible }: SceneStackDecorLayerProps) => {
    const { sceneKey } = entry;
    const visibilityStyle = React.useMemo<StyleProp<ViewStyle>>(() => {
      const resolvedZIndex = promotedZIndex ?? (kind === 'overlay' ? 30 : 0);
      return {
        display: isVisible ? 'flex' : 'none',
        opacity: isVisible ? 1 : 0,
        zIndex: isVisible ? resolvedZIndex : 0,
        elevation: isVisible ? resolvedZIndex : 0,
      };
    }, [isVisible, kind, promotedZIndex]);
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
      <View
        key={`${kind}-${sceneKey}`}
        pointerEvents={pointerEvents}
        style={[StyleSheet.absoluteFillObject, visibilityStyle]}
      >
        {component}
      </View>
    );
  },
  (previousProps, nextProps) =>
    previousProps.entry === nextProps.entry &&
    previousProps.kind === nextProps.kind &&
    previousProps.promotedZIndex === nextProps.promotedZIndex &&
    previousProps.isVisible === nextProps.isVisible
);

export const SceneStackHeaderLayer = React.memo(
  ({ entry, promotedZIndex, isVisible }: SceneStackHeaderLayerProps) => {
    const visibilityStyle = React.useMemo<StyleProp<ViewStyle>>(() => {
      const resolvedZIndex = promotedZIndex ?? 40;
      return {
        display: isVisible ? 'flex' : 'none',
        opacity: isVisible ? 1 : 0,
        zIndex: isVisible ? resolvedZIndex : 0,
        elevation: isVisible ? resolvedZIndex : 0,
      };
    }, [isVisible, promotedZIndex]);
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
      <View
        key={`header-${entry.sceneKey}`}
        pointerEvents="auto"
        style={[styles.sceneHeaderLayer, visibilityStyle]}
      >
        {headerComponent}
      </View>
    );
  },
  (previousProps, nextProps) =>
    previousProps.entry === nextProps.entry &&
    previousProps.promotedZIndex === nextProps.promotedZIndex &&
    previousProps.isVisible === nextProps.isVisible
);
