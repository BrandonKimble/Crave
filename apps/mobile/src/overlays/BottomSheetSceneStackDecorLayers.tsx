import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { BottomSheetSceneStackChromeEntry } from './bottomSheetSceneStackHostContract';
import { createShapeEquality, sameFieldRef } from './shape-equality';

type SceneStackDecorLayerKind = 'underlay' | 'background' | 'overlay';

type SceneStackDecorLayerProps = {
  entry: BottomSheetSceneStackChromeEntry;
  kind: SceneStackDecorLayerKind;
  isVisible: boolean;
};

// F9304: DERIVE the skip fn from the props shape (shape-equality.ts) instead of hand-rolling
// a field-by-field comparator. A future added prop is now a COMPILE ERROR here (the
// `FieldComparators` map must name every field), not a silently-uncompared value that would
// freeze this layer. Every field is ref/primitive identity — sameFieldRef.
const shouldSkipSceneStackDecorLayerUpdate = createShapeEquality<SceneStackDecorLayerProps>({
  entry: sameFieldRef,
  kind: sameFieldRef,
  isVisible: sameFieldRef,
});

export const SceneStackDecorLayer = React.memo(
  ({ entry, kind, isVisible }: SceneStackDecorLayerProps) => {
    const { sceneKey } = entry;
    const visibilityStyle = React.useMemo<StyleProp<ViewStyle>>(() => {
      const resolvedZIndex = kind === 'overlay' ? 30 : 0;
      return {
        display: isVisible ? 'flex' : 'none',
        opacity: isVisible ? 1 : 0,
        zIndex: isVisible ? resolvedZIndex : 0,
        elevation: isVisible ? resolvedZIndex : 0,
      };
    }, [isVisible, kind]);
    // Mounted-chrome entries (surfaceKind 'mounted') render NOTHING per-leg — frost lives in the
    // shared page-frame foundation and headers in the hoisted persistent header
    // (app-route-persistent-header-registry). createChromeEntry builds them with all component
    // fields null, so they fall through to the null return below (the old
    // BottomSheetSceneStackMountedChrome registry shell is deleted).
    const component =
      kind === 'underlay'
        ? entry.underlayComponent
        : kind === 'background'
          ? entry.backgroundComponent
          : entry.overlayComponent;
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
  shouldSkipSceneStackDecorLayerUpdate
);

// P3 (page-switch-master-plan.md §6-P3): SceneStackHeaderLayer is DELETED. The per-leg header
// render lane is gone — the ONE persistent header (PersistentSheetHeaderHost, hoisted above the
// legs in ActiveSceneStackSurfaceHost) renders every scene-stack scene's header chrome from the
// persistent-header registry. Decor (underlay / white plate / overlay) stays per-leg above.
