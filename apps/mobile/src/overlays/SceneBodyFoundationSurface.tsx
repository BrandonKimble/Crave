import React from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import MaskedHoleOverlay, { type MaskedHole } from '../components/MaskedHoleOverlay';
import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';
import { SceneStripLawContext } from '../toggles/toggle-strip-scene-law';

/**
 * THE FOUNDATION WHITE LAYER (owner standard, 2026-07-11): every sheet scene's body sits on a
 * WHITE plate over the shared frosted foundation — no page renders on bare frost. The plate is
 * declared per scene in `scene-foundation-spec.ts` (`bodySurface: 'white'`, a required literal —
 * a new scene must state it and cannot opt out to bare frost) and rendered HERE, at the body
 * lane (`useBottomSheetSceneStackBodyContentRuntime`), under the scene's scroll/list/static
 * content.
 *
 * CUTOUTS: the plate is per-page customizable with holes that reveal the frost — the same
 * plate-with-punched-holes composition the header cutout plate and the cutout skeleton use
 * (`MaskedHoleOverlay`). A panel wraps any content box in `<FrostCutout>`; the wrapper measures
 * its laid-out rect (measureLayout against this surface — content coordinates, immune to sheet
 * motion and scroll position) and registers a hole in the scene's white layer. Holes live in
 * CONTENT coordinates: when holes exist the plate renders as a content-tall sheet translated by
 * -scrollOffset on the UI thread, so cutouts track their boxes while scrolling. With no cutouts
 * registered (most pages) the layer is a plain static white fill — zero per-frame work.
 *
 * The search/results sheet is NOT routed through this layer (it owns its canonical frost + white
 * plate composition); the gate is `getSceneFoundationSpec(sceneKey)?.bodySurface`.
 */

const WHITE = '#ffffff';

type RegisteredHole = MaskedHole & { id: string };

type FrostCutoutStore = {
  subscribe: (listener: () => void) => () => void;
  getHoles: () => MaskedHole[];
  set: (hole: RegisteredHole) => void;
  remove: (id: string) => void;
};

const createFrostCutoutStore = (): FrostCutoutStore => {
  const holesById = new Map<string, RegisteredHole>();
  const listeners = new Set<() => void>();
  let snapshot: MaskedHole[] = [];

  const notify = () => {
    snapshot = Array.from(holesById.values()).map(({ id: _id, ...hole }) => hole);
    listeners.forEach((listener) => {
      listener();
    });
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getHoles: () => snapshot,
    set: (hole) => {
      const previous = holesById.get(hole.id);
      if (
        previous != null &&
        previous.x === hole.x &&
        previous.y === hole.y &&
        previous.width === hole.width &&
        previous.height === hole.height &&
        previous.borderRadius === hole.borderRadius
      ) {
        return;
      }
      holesById.set(hole.id, hole);
      notify();
    },
    remove: (id) => {
      if (!holesById.delete(id)) {
        return;
      }
      notify();
    },
  };
};

type SceneFrostCutoutContextValue = {
  /** Measure `node` relative to the scene's white layer (content coordinates) and register a hole. */
  measureAndRegister: (id: string, node: View | null, borderRadius: number) => void;
  unregister: (id: string) => void;
  /**
   * Re-measure EVERY registered cutout on the next frame (rAF-collapsed). RN `onLayout` only
   * fires when a view's own frame WITHIN ITS PARENT changes — when content ABOVE a cutout grows
   * (avatar/name loading, segment switches) an ANCESTOR shifts the box without resizing it, the
   * cutout's onLayout never fires, and the registered hole goes stale (the "hole drifts up"
   * bug). Any signal that scene content re-laid-out (content size change, a cutout commit)
   * schedules this sweep; `store.set` dedupes no-op rects so a sweep with nothing moved is free.
   */
  scheduleRemeasureAll: () => void;
};

const SceneFrostCutoutContext = React.createContext<SceneFrostCutoutContextValue | null>(null);

/**
 * Content-re-layout signal for the scene's frost cutouts. Body surfaces rendered inside a
 * SceneBodyFoundationSurface (the mounted ScrollView / FlashList body) call this from
 * `onContentSizeChange` so registered cutouts re-measure when content above them re-flows.
 * Outside a foundation surface it returns a stable no-op.
 */
export const useSceneFrostCutoutContentLayoutSignal = (): (() => void) => {
  const context = React.useContext(SceneFrostCutoutContext);
  const noop = React.useCallback(() => undefined, []);
  return context?.scheduleRemeasureAll ?? noop;
};

/**
 * Backdrop probe for the toggle-strip engine's declared-backdrop assert: TRUE when the
 * caller renders inside a foundation-plated scene body (a FrostCutout here punches the
 * white plate), FALSE on chrome / the search sheet (honest frost by construction).
 */
export const useIsInsideSceneFoundationSurface = (): boolean =>
  React.useContext(SceneFrostCutoutContext) != null;

type SceneBodyWhitePlateProps = {
  store: FrostCutoutStore;
  scrollOffset: SharedValue<number>;
  frameHeight: number;
};

/** The plate itself: plain white with no cutouts; a scroll-tracked hole-punched sheet with them. */
const SceneBodyWhitePlate: React.FC<SceneBodyWhitePlateProps> = ({
  store,
  scrollOffset,
  frameHeight,
}) => {
  const holes = React.useSyncExternalStore(store.subscribe, store.getHoles);

  // Content-tall plate: covers the visible window across the scroll range of interest. Once the
  // deepest hole has scrolled well off-screen the translation clamps (holes are guaranteed
  // off-screen by then) so the plate never lifts off the bottom of the lane on long content.
  const holesMaxY = holes.reduce((max, hole) => Math.max(max, hole.y + hole.height), 0);
  const plateHeight = Math.ceil(holesMaxY) + frameHeight * 2;
  const maxTranslate = Math.max(plateHeight - frameHeight, 0);

  const translateStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: -Math.min(Math.max(scrollOffset.value, 0), maxTranslate) }],
    }),
    [maxTranslate]
  );

  if (holes.length === 0 || frameHeight <= 0) {
    return <View pointerEvents="none" style={styles.plainWhiteFill} />;
  }

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[styles.holePlate, { height: plateHeight }, translateStyle]}
    >
      <MaskedHoleOverlay
        holes={holes}
        backgroundColor={WHITE}
        renderWhenEmpty
        style={{ width: '100%', height: plateHeight }}
      />
    </Reanimated.View>
  );
};

export type SceneBodyFoundationSurfaceProps = {
  /** The scene body lane's live scroll offset (shared scroll container / list). */
  scrollOffset: SharedValue<number>;
  /**
   * The scene this lane paints — provided over `SceneStripLawContext` so strip
   * components can assert the foundation's `strip:` declaration (the load-bearing
   * strip law, toggle-strip-scene-law.ts).
   */
  sceneKey?: SheetSceneKey | null;
  /** The body-lane style (the caller's existing wrapper style — absolute fill). */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export const SceneBodyFoundationSurface: React.FC<SceneBodyFoundationSurfaceProps> = ({
  scrollOffset,
  sceneKey = null,
  style,
  children,
}) => {
  const rootRef = React.useRef<View>(null);
  const storeRef = React.useRef<FrostCutoutStore | null>(null);
  if (storeRef.current == null) {
    storeRef.current = createFrostCutoutStore();
  }
  const store = storeRef.current;

  // Live cutout registrations (node ref + radius) so the surface can re-measure ALL holes when
  // scene content re-lays-out — not only when a cutout's own onLayout fires (see
  // scheduleRemeasureAll doc). Refs, not React state: measurement is imperative and per-frame.
  const registrationsRef = React.useRef(new Map<string, { node: View; borderRadius: number }>());
  const remeasureFrameRef = React.useRef<number | null>(null);

  const [frameHeight, setFrameHeight] = React.useState(0);

  const contextValue = React.useMemo<SceneFrostCutoutContextValue>(() => {
    const measureNode = (id: string, node: View, borderRadius: number) => {
      const rootNode = rootRef.current;
      if (rootNode == null) {
        return;
      }
      // measureLayout against the lane root = CONTENT coordinates by construction (native frame
      // accumulation — a ScrollView's contentOffset never moves child frames), so the measured
      // rect is immune to sheet snap motion and the current scroll position.
      node.measureLayout(
        rootNode,
        (x, y, width, height) => {
          if (!(width > 0 && height > 0)) {
            return;
          }
          store.set({
            id,
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
            borderRadius,
          });
        },
        () => undefined
      );
    };

    return {
      measureAndRegister: (id, node, borderRadius) => {
        if (node == null) {
          return;
        }
        registrationsRef.current.set(id, { node, borderRadius });
        measureNode(id, node, borderRadius);
      },
      unregister: (id) => {
        registrationsRef.current.delete(id);
        store.remove(id);
      },
      scheduleRemeasureAll: () => {
        if (remeasureFrameRef.current != null || registrationsRef.current.size === 0) {
          return;
        }
        // rAF-collapse: a burst of layout events (data load re-flowing several rows in one
        // commit) produces ONE sweep, after the frame's layout has settled.
        remeasureFrameRef.current = requestAnimationFrame(() => {
          remeasureFrameRef.current = null;
          registrationsRef.current.forEach(({ node, borderRadius }, id) => {
            measureNode(id, node, borderRadius);
          });
        });
      },
    };
  }, [store]);

  React.useEffect(
    () => () => {
      if (remeasureFrameRef.current != null) {
        cancelAnimationFrame(remeasureFrameRef.current);
      }
    },
    []
  );

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const height = Math.round(event.nativeEvent.layout.height);
      setFrameHeight((prev) => (prev === height ? prev : height));
      // The lane itself re-laid-out (sheet frame change) — registered holes may have shifted.
      contextValue.scheduleRemeasureAll();
    },
    [contextValue]
  );

  return (
    <View ref={rootRef} collapsable={false} style={style} onLayout={handleLayout}>
      <View pointerEvents="none" style={styles.whiteLayerRoot}>
        <SceneBodyWhitePlate store={store} scrollOffset={scrollOffset} frameHeight={frameHeight} />
      </View>
      <SceneFrostCutoutContext.Provider value={contextValue}>
        <SceneStripLawContext.Provider value={sceneKey}>{children}</SceneStripLawContext.Provider>
      </SceneFrostCutoutContext.Provider>
    </View>
  );
};

export type FrostCutoutProps = {
  /** Corner radius of the punched hole (match the box's own radius). */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Wrap a content box to punch its rect out of the scene's foundation white layer — the frost
 * shows through as the box's background. The wrapper measures itself on layout (and re-measures
 * on any layout change) and registers the hole; unmount removes it. Give the box NO opaque
 * background of its own. Outside a foundation surface (e.g. header chrome, the search sheet)
 * it renders children unchanged and registers nothing.
 */
export const FrostCutout: React.FC<FrostCutoutProps> = ({ borderRadius = 0, style, children }) => {
  const context = React.useContext(SceneFrostCutoutContext);
  const id = React.useId();
  const ref = React.useRef<View>(null);

  const handleLayout = React.useCallback(() => {
    context?.measureAndRegister(id, ref.current, borderRadius);
    // Own-frame layout implies surrounding content re-flowed too — sweep the scene's other
    // cutouts (their onLayout does NOT fire when only an ancestor shifted them).
    context?.scheduleRemeasureAll();
  }, [borderRadius, context, id]);

  // Every commit of the cutout re-measures on the next frame: a re-render of the panel (data
  // load, segment switch) can shift this box via an ANCESTOR without firing its onLayout.
  // rAF-collapsed + no-op-deduped in the store, so steady-state re-renders cost one cheap
  // measureLayout per cutout per commit.
  React.useEffect(() => {
    context?.scheduleRemeasureAll();
  });

  React.useEffect(() => {
    return () => {
      context?.unregister(id);
    };
  }, [context, id]);

  return (
    <View ref={ref} collapsable={false} style={style} onLayout={handleLayout}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  whiteLayerRoot: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  plainWhiteFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WHITE,
  },
  holePlate: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
