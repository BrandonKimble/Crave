import React from 'react';
import {
  Dimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Reanimated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  type SharedValue,
} from 'react-native-reanimated';

import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import MaskedHoleOverlay from '../components/MaskedHoleOverlay';
import {
  FrostCutout,
  useIsInsideSceneFoundationSurface,
} from '../overlays/SceneBodyFoundationSurface';
import {
  clampToggleStripScrollX,
  cloneToggleStripLayoutCache,
  pruneToggleStripHoleMapToRenderedSlots,
  registerToggleStripSeatResetListener,
  type ToggleStripCacheSeat,
  type ToggleStripControlRect,
  type ToggleStripLayoutCache,
} from './toggle-strip-layout-cache';
import {
  resolveActionRowEnterTranslateX,
  resolveToggleRowExitDistance,
} from './toggle-strip-morph';
import {
  CUTOUT_FADE_IN_MS,
  resolveCutoutFadeCovers,
  type CutoutFadeCoverRect,
  type FadeableStripHole,
} from './toggle-strip-cutout-fade';
import { useSceneStripLawAssert, type ToggleStripPlacement } from './toggle-strip-scene-law';
import {
  ToggleStripSlotKeyContext,
  ToggleStripWarmRestoreContext,
  type ToggleStripWarmRestore,
} from './toggle-strip-warm-restore-context';

/**
 * THE TOGGLE-STRIP ENGINE (leg 2 — plans/toggle-strip-rebuild-ledger.md; target model
 * plans/toggle-strip-audit-leg1.md D3.2). ONE placement-agnostic strip band that owns
 * every fidelity-bar property BY CONSTRUCTION (charter Part 1) — consumers declare
 * controls, they cannot un-earn the bar:
 *
 * 1. FROST CUTOUTS — every child is auto-wrapped in a hole slot that measures itself
 *    and registers a see-through window; the white lives ONLY on a mask plate that
 *    scrolls WITH the controls, so the windows stay pinned to them.
 * 2. EDGE-TO-EDGE BLEED — the band is full-width and accepts NO style/geometry props;
 *    horizontal alignment is SCROLLABLE contentInset only. A mount cannot cap the
 *    band into a padded box through the API; a padded PARENT is a dev CONTRACT bark
 *    (band narrower than the window).
 * 3. VISUALLY INFINITE OVERSCROLL — the mask plate extends a full viewport width past
 *    both ends of the content; no rubber-band can reveal a frost edge.
 * 4. REAL PHYSICS + WARM RESTORE — native rubber-band scroll; layout AND settled
 *    scrollX restore through the engine-owned cache seat (`toggle-strip-layout-cache`).
 *    ScrollX restore is the one place the engine deliberately EXCEEDS the shipped
 *    reference (which reset to x=0 on every cross-list remount).
 * 5. BACKDROP HONESTY — the band always renders inside a `FrostCutout`: on a
 *    foundation-plated scene the white plate gets a band-height hole, so the strip's
 *    blur sees REAL frost (cutouts-over-dead-white is unrepresentable — the
 *    owner-ratified "the white area adapts"). The required `backdrop` literal is
 *    dev-asserted against the actual surface so a declaration cannot lie.
 * 6. ACTION-ROW SLOT — first-class alternate chrome (favorites-edit-mode-ideal
 *    decision 1): static (never scrollable), mounted ONLY while `actionProgress > 0`
 *    (unreachable by construction), per-row cutout holes, and the toggle row exits
 *    from its LIVE scroll position. No consumer exercises it in leg 2; the structure
 *    exists so edit mode (leg 5) lands on it rather than bolting on.
 *
 * Placement mounts are thin: `'in-list'` = the band rides a list header (results).
 * `'header'` (persistent-header extension) is the leg-3 mount. The scene foundation's
 * `strip:` declaration is load-bearing here via `useSceneStripLawAssert`.
 */

const STRIP_HOLE_BORDER_RADIUS = 8;
// Matches search: CONTENT_HORIZONTAL_PADDING (= OVERLAY_HORIZONTAL_PADDING) = 20.
const STRIP_CONTENT_INSET = 20;
// Matches search TOGGLE_STACK_GAP.
const STRIP_GAP = 8;
// Matches search HOLE_RADIUS_BOOST — the cutout window is a hair larger than the
// control so its rounded corners read cleanly against the frost.
const HOLE_RADIUS_BOOST = 1;
// Tolerance for the full-bleed contract bark (sub-pixel layout jitter).
const FULL_BLEED_TOLERANCE_PX = 2;

export type ToggleStripBackdrop = 'chrome-frost' | 'plated-body';

type RegisterHole = (key: string, hole: FadeableStripHole) => void;
type UnregisterHole = (key: string) => void;

type HoleRegistry = {
  registerHole: RegisterHole;
  unregisterHole: UnregisterHole;
};

const HoleRegistryContext = React.createContext<HoleRegistry | null>(null);

const holesEqual = (a: FadeableStripHole | undefined, b: FadeableStripHole): boolean =>
  a != null &&
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5 &&
  (a.fadeIn === true) === (b.fadeIn === true);

// ── STRIP-CITIZEN ENTRY/EXIT (engine-level — wave-2 §1.1) ──────────────────────────
// A CONDITIONAL citizen (favorites' Edit chip, search's "N similar" chip) must never
// snap into the row: a slot that mounts AFTER the strip's first commit animates its
// REAL width 0 → intrinsic (and back on unmount), so siblings are pushed/pulled by
// genuine layout each frame — and every sibling slot's onLayout streams through the
// grow, keeping the frost cutouts riding the controls, not jumping to final rects.
// (A visual-only transform (FadeIn + LinearTransition on the newcomer alone) was the
// audited defect: siblings snapped because nothing animated THEIR layout.)
const STRIP_CITIZEN_ENTER_MS = 240;
const STRIP_CITIZEN_EXIT_MS = 180;

const stripCitizenEntering = (values: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, width: 0 },
    animations: {
      opacity: withTiming(1, { duration: STRIP_CITIZEN_ENTER_MS }),
      width: withTiming(values.targetWidth, { duration: STRIP_CITIZEN_ENTER_MS }),
    },
  };
};

const stripCitizenExiting = (values: ExitAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 1, width: values.currentWidth },
    animations: {
      opacity: withTiming(0, { duration: STRIP_CITIZEN_EXIT_MS }),
      width: withTiming(0, { duration: STRIP_CITIZEN_EXIT_MS }),
    },
  };
};

/** Wraps a single control, measuring its box and registering it as a frosted cutout. */
const StripHoleSlot: React.FC<{
  slotKey: string;
  borderRadius: number;
  /** True when this slot mounted AFTER the strip's first commit (conditional citizen). */
  animateEntry: boolean;
  /** §2.8 conventions read off the element: fade the window in / punch no window. */
  fadeIn: boolean;
  holeDisabled: boolean;
  children: React.ReactNode;
}> = ({ slotKey, borderRadius, animateEntry, fadeIn, holeDisabled, children }) => {
  const registry = React.useContext(HoleRegistryContext);
  const holeKey = `strip-slot-${slotKey}`;
  // A fade-in slot's CONTENT stays invisible until its hole (and thus its cover, same
  // commit) exists — otherwise the control paints one frame on the bare plate before
  // layout registers the window (the sim-caught flash). Revealed with the cover: the
  // opaque cover fully hides it, then fades both in together.
  const [revealed, setRevealed] = React.useState(!fadeIn);
  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (!registry || holeDisabled) {
        return;
      }
      const { x, y, width, height } = event.nativeEvent.layout;
      registry.registerHole(holeKey, { x, y, width, height, borderRadius, fadeIn });
      if (fadeIn) {
        setRevealed(true);
      }
    },
    [registry, holeKey, borderRadius, fadeIn, holeDisabled]
  );
  // A slot that BECOMES hole-disabled must drop any window it already punched.
  React.useEffect(() => {
    if (holeDisabled) {
      registry?.unregisterHole(holeKey);
    }
  }, [holeDisabled, registry, holeKey]);
  React.useEffect(() => () => registry?.unregisterHole(holeKey), [registry, holeKey]);
  return (
    <ToggleStripSlotKeyContext.Provider value={slotKey}>
      <Reanimated.View
        entering={animateEntry ? stripCitizenEntering : undefined}
        exiting={animateEntry ? stripCitizenExiting : undefined}
        style={[styles.holeSlotClip, revealed ? null : styles.holeSlotHidden]}
        onLayout={handleLayout}
      >
        {children}
      </Reanimated.View>
    </ToggleStripSlotKeyContext.Provider>
  );
};

// ── CUTOUT FADE-IN COVER (wave-3 §2.8 — engine-level) ──────────────────────────────
// A hole that appears mid-presentation (declared `stripHoleFadeIn`) punches its
// window into the mask immediately; this congruent white rect mounts over the fresh
// window and animates white → clear ONCE, then sits inert (opacity 0) tracking the
// hole's live rect until the hole unregisters. Keyed by the hole key, so one fade
// per appearance by construction.
const CutoutFadeCover: React.FC<{ cover: CutoutFadeCoverRect; color: string }> = ({
  cover,
  color,
}) => {
  const coverOpacity = useSharedValue(1);
  React.useEffect(() => {
    coverOpacity.value = withTiming(0, { duration: CUTOUT_FADE_IN_MS });
  }, [coverOpacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: coverOpacity.value }));
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: cover.x,
          top: cover.y,
          width: cover.width,
          height: cover.height,
          borderRadius: cover.borderRadius,
          backgroundColor: color,
        },
        fadeStyle,
      ]}
    />
  );
};

/** The covers layer for one mask frame — absolute-fills the same box as its mask. */
const CutoutFadeCovers: React.FC<{
  covers: CutoutFadeCoverRect[];
  color: string;
}> = ({ covers, color }) =>
  covers.length ? (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {covers.map((cover) => (
        <CutoutFadeCover key={cover.key} cover={cover} color={color} />
      ))}
    </View>
  ) : null;

const useHoleMap = (
  seed: Record<string, FadeableStripHole> | null
): [Record<string, FadeableStripHole>, HoleRegistry] => {
  const [holeMap, setHoleMap] = React.useState<Record<string, FadeableStripHole>>(seed ?? {});
  const registry = React.useMemo<HoleRegistry>(
    () => ({
      registerHole: (key, hole) => {
        setHoleMap((prev) => (holesEqual(prev[key], hole) ? prev : { ...prev, [key]: hole }));
      },
      unregisterHole: (key) => {
        setHoleMap((prev) => {
          if (!(key in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[key];
          return next;
        });
      },
    }),
    []
  );
  return [holeMap, registry];
};

/**
 * Auto-wrap each control in a hole slot keyed by the child's OWN key (toArray stamps
 * one on every child), never by array position: a conditionally-mounted control
 * (search's "N similar" chip) would otherwise shift every later sibling's hole
 * identity on mount/unmount — unregister/re-register churn and a transient frame
 * where a control sits over a stale hole. Give conditional children explicit keys;
 * unconditional unkeyed children get React's stable positional key.
 */
const resolveChildSlotKeys = (children: React.ReactNode): string[] =>
  React.Children.toArray(children).map((child, index) => {
    const childKey = React.isValidElement(child) && child.key != null ? child.key : null;
    return String(childKey ?? `unkeyed-${index}`);
  });

/**
 * @param seenSlotKeys engine-owned mount ledger for the row (null = no citizen
 * entry/exit tracking — the action row rides the morph translation instead). A key
 * absent from the ledger on a post-first-commit render is a LATE-mounting citizen:
 * it gets the width-grow entry (and symmetric exit) so it pushes siblings instead of
 * snapping (§1.1). First-paint slots are recorded silently — first paint is instant.
 */
const wrapChildrenInHoleSlots = (
  children: React.ReactNode,
  holeBorderRadius: number,
  seenSlotKeys: Set<string> | null,
  lateSlotKeys: Set<string> | null,
  hasCommittedFirstRender: boolean
): React.ReactNode[] =>
  React.Children.toArray(children).map((child, index) => {
    const childKey = React.isValidElement(child) && child.key != null ? child.key : null;
    const slotKey = String(childKey ?? `unkeyed-${index}`);
    // Per-slot conventions (wave-3 §2.8), read off the element: `stripHoleBorderRadius`
    // (window shape — the undo/redo PILL cutout, radius 999), `stripHoleFadeIn` (the
    // window fades white → clear when it appears mid-presentation; the engine mounts a
    // congruent cover rect over the fresh hole and animates it clear), and
    // `stripHoleDisabled` (no window at all — plain chrome ON the plate, e.g. the
    // "Edit lists" label the pill replaces).
    const childProps = React.isValidElement(child)
      ? (child.props as {
          stripHoleBorderRadius?: number;
          stripHoleFadeIn?: boolean;
          stripHoleDisabled?: boolean;
        })
      : undefined;
    const slotBorderRadius = childProps?.stripHoleBorderRadius ?? holeBorderRadius;
    let animateEntry = false;
    if (seenSlotKeys != null && lateSlotKeys != null) {
      if (hasCommittedFirstRender && !seenSlotKeys.has(slotKey)) {
        // Once late, always late — the exit animation must survive later renders
        // (the `exiting` config is read at REMOVAL time from the latest props).
        lateSlotKeys.add(slotKey);
      }
      seenSlotKeys.add(slotKey);
      animateEntry = lateSlotKeys.has(slotKey);
    }
    return (
      <StripHoleSlot
        key={slotKey}
        slotKey={slotKey}
        borderRadius={slotBorderRadius}
        animateEntry={animateEntry}
        fadeIn={childProps?.stripHoleFadeIn === true}
        holeDisabled={childProps?.stripHoleDisabled === true}
      >
        {child}
      </StripHoleSlot>
    );
  });

export type ToggleStripProps = {
  /** The scrollable toggle-row controls (SegmentedToggle / chips / …). */
  children: React.ReactNode;
  /**
   * Where this strip is mounted — must agree with the scene's foundation `strip:`
   * declaration (dev-asserted). 'header' is the leg-3 mount.
   */
  placement: ToggleStripPlacement;
  /**
   * What the band sits on. 'chrome-frost' = honest frost by the host's construction
   * (search's canonical composition; the persistent-header region). 'plated-body' =
   * a foundation-plated scene body — the engine's band-height FrostCutout punches the
   * plate so the blur sees real frost either way; the literal exists so the
   * declaration is dev-assertable against the actual surface in BOTH directions.
   */
  backdrop: ToggleStripBackdrop;
  /** Solid color painted over the frost outside the control windows. */
  surfaceColor?: string;
  /** Per-control corner radius for the cutouts (default 8, matching the controls). */
  holeBorderRadius?: number;
  /** Horizontal SCROLLABLE inset so the first control lines up with page content. */
  contentInset?: number;
  /** Engine-owned warm restore: layout + settled scrollX (one seat per surface). */
  cacheSeat?: ToggleStripCacheSeat;
  /**
   * ACTION-ROW SLOT (leg-5 consumers; structure lands in leg 2): static alternate
   * chrome mounted ONLY while `actionProgress > 0`. Never scrollable, never
   * reachable by scrolling — absence, not clipping.
   */
  actionRow?: React.ReactNode;
  /** 0 = toggle row seated; 1 = action row seated. Drives the morph on the UI thread. */
  actionProgress?: SharedValue<number>;
  /** Reports the band's measured height (header-lane / divider consumers). */
  onHeightChange?: (height: number) => void;
  testID?: string;
};

export function ToggleStrip({
  children,
  placement,
  backdrop,
  surfaceColor = '#ffffff',
  holeBorderRadius = STRIP_HOLE_BORDER_RADIUS,
  contentInset = STRIP_CONTENT_INSET,
  cacheSeat,
  actionRow,
  actionProgress,
  onHeightChange,
  testID,
}: ToggleStripProps) {
  // ── The load-bearing declarations ─────────────────────────────────────────────
  useSceneStripLawAssert(placement, testID ?? 'ToggleStrip');
  const isInsidePlatedBody = useIsInsideSceneFoundationSurface();
  React.useEffect(() => {
    if (!__DEV__) {
      return;
    }
    if (backdrop === 'plated-body' && !isInsidePlatedBody) {
      console.error(
        `[ToggleStrip] '${testID ?? 'ToggleStrip'}' declares backdrop: 'plated-body' but is ` +
          `NOT inside a SceneBodyFoundationSurface — there is no plate to punch. Declare ` +
          `'chrome-frost' or mount it in the scene body lane.`
      );
    }
    if (backdrop === 'chrome-frost' && isInsidePlatedBody) {
      console.error(
        `[ToggleStrip] '${testID ?? 'ToggleStrip'}' declares backdrop: 'chrome-frost' but IS ` +
          `inside a SceneBodyFoundationSurface — its blur would see the foundation white ` +
          `plate, not frost. Declare 'plated-body'.`
      );
    }
  }, [backdrop, isInsidePlatedBody, testID]);

  // ── Warm-restore seed (read ONCE — the seat may be written every frame) ───────
  // The seeded hole map is PRUNED to the holes this mount's children will actually
  // produce (same keying as wrapChildrenInHoleSlots): a cached hole for a control
  // that is conditionally ABSENT this presentation would never re-register and never
  // unregister — a phantom see-through window. Filtering at the seed makes the
  // phantom unrepresentable (leg 4; pruneToggleStripHoleMapToRenderedSlots spec).
  const seedRef = React.useRef<ToggleStripLayoutCache | null | undefined>(undefined);
  if (seedRef.current === undefined) {
    const rawSeed = cacheSeat?.read() ?? null;
    seedRef.current = rawSeed
      ? {
          ...rawSeed,
          holeMap: pruneToggleStripHoleMapToRenderedSlots(
            rawSeed.holeMap,
            resolveChildSlotKeys(children).map((slotKey) => `strip-slot-${slotKey}`)
          ),
        }
      : null;
  }
  const seed = seedRef.current;

  const [toggleHoleMap, toggleHoleRegistry] = useHoleMap(seed?.holeMap ?? null);
  const [actionHoleMap, actionHoleRegistry] = useHoleMap(null);
  const [viewportWidth, setViewportWidth] = React.useState(seed?.viewportWidth ?? 0);
  const [rowHeight, setRowHeight] = React.useState(seed?.rowHeight ?? 0);
  const [contentRowWidth, setContentRowWidth] = React.useState(0);

  // Seed the initial scroll offset from the cache — clamped against the CACHED
  // geometry so a shrunk control row can never restore out of range. Captured once
  // (a stable object): RN re-applies `contentOffset` when the prop identity changes.
  const initialContentOffsetRef = React.useRef(
    seed && seed.scrollX > 0
      ? {
          x: clampToggleStripScrollX({
            scrollX: seed.scrollX,
            contentWidth: seed.contentWidth,
            viewportWidth: seed.viewportWidth,
          }),
          y: 0,
        }
      : undefined
  );

  // Live geometry mirrors for the cache writer + the UI-thread morph math. ScrollX
  // starts at the SEEDED offset — the native ScrollView really sits there from frame
  // one, and an honest initial value keeps the first layout-triggered cache write
  // from clobbering the restored position back to 0 (caught on the leg-2 sim pass:
  // seed 189 → layout write 0 → the SECOND flip lost the position).
  const contentSizeWidthRef = React.useRef(seed?.contentWidth ?? 0);
  const scrollXRef = React.useRef(initialContentOffsetRef.current?.x ?? 0);
  const sharedViewportWidth = useSharedValue(seed?.viewportWidth ?? 0);

  // Per-control geometry reported by strip citizens (pill segment rects), keyed by
  // slot key. Version state drives the cache-write effect; the map itself is a ref.
  const controlLayoutsRef = React.useRef<
    Record<string, readonly (ToggleStripControlRect | undefined)[]>
  >(seed?.controlLayouts ? { ...seed.controlLayouts } : {});
  const [controlLayoutsVersion, setControlLayoutsVersion] = React.useState(0);
  const warmRestore = React.useMemo<ToggleStripWarmRestore>(
    () => ({
      readControlSeed: (slotKey) => seedRef.current?.controlLayouts?.[slotKey],
      reportControlLayouts: (slotKey, layouts) => {
        controlLayoutsRef.current = { ...controlLayoutsRef.current, [slotKey]: [...layouts] };
        setControlLayoutsVersion((prev) => prev + 1);
      },
    }),
    []
  );

  // ── The engine-owned cache writer (layout + settled scrollX) ──────────────────
  const latestMeasuredRef = React.useRef({ toggleHoleMap, viewportWidth, rowHeight });
  latestMeasuredRef.current = { toggleHoleMap, viewportWidth, rowHeight };
  const writeCache = React.useCallback(() => {
    if (!cacheSeat) {
      return;
    }
    const measured = latestMeasuredRef.current;
    if (measured.viewportWidth <= 0 || measured.rowHeight <= 0) {
      return;
    }
    const contentWidth = contentSizeWidthRef.current;
    const cache = cloneToggleStripLayoutCache({
      viewportWidth: measured.viewportWidth,
      rowHeight: measured.rowHeight,
      contentWidth,
      holeMap: measured.toggleHoleMap,
      controlLayouts: controlLayoutsRef.current,
      scrollX: clampToggleStripScrollX({
        scrollX: scrollXRef.current,
        contentWidth,
        viewportWidth: measured.viewportWidth,
      }),
    });
    if (cache) {
      cacheSeat.write(cache);
    }
  }, [cacheSeat]);
  React.useEffect(() => {
    writeCache();
  }, [writeCache, toggleHoleMap, viewportWidth, rowHeight, controlLayoutsVersion]);

  // ── The re-present reset, LIVE half (owner decision 2026-07-12) ───────────────
  // `clearToggleStripCacheScrollX(seat)` zeroes the cold-remount seed AND fans out
  // here: a RETAINED instance (results leg survives dismiss) scrolls its living
  // ScrollView back to 0 so the next presentation paints at x=0 by construction.
  const scrollViewRef = React.useRef<ScrollView | null>(null);
  React.useEffect(() => {
    if (!cacheSeat) {
      return undefined;
    }
    return registerToggleStripSeatResetListener(cacheSeat, () => {
      scrollViewRef.current?.scrollTo({ x: 0, animated: false });
      scrollXRef.current = 0;
    });
  }, [cacheSeat]);

  // ── Scroll physics + settled-scroll capture ───────────────────────────────────
  const handleScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollXRef.current = event.nativeEvent.contentOffset.x;
  }, []);
  const handleScrollSettled = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollXRef.current = event.nativeEvent.contentOffset.x;
      writeCache();
    },
    [writeCache]
  );
  const handleContentSizeChange = React.useCallback((width: number) => {
    contentSizeWidthRef.current = width;
  }, []);
  // ── Full-bleed contract (RED in dev): the band must span the window ───────────
  const hasBarkedNarrowBandRef = React.useRef(false);
  const handleBandLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      onHeightChange?.(height);
      if (
        __DEV__ &&
        !hasBarkedNarrowBandRef.current &&
        width > 0 &&
        width < Dimensions.get('window').width - FULL_BLEED_TOLERANCE_PX
      ) {
        hasBarkedNarrowBandRef.current = true;
        console.error(
          `[ToggleStrip] '${testID ?? 'ToggleStrip'}' band measured ${Math.round(width)}px ` +
            `inside a ${Math.round(Dimensions.get('window').width)}px window — the strip is ` +
            `mounted in a horizontally-bounded box (parent padding?). Edge-to-edge bleed is ` +
            `the fidelity bar: align content with contentInset, never with a padded mount.`
        );
      }
    },
    [onHeightChange, testID]
  );

  // ── Mask geometry (byte-identical mechanics to the proven reference) ──────────
  const holes = React.useMemo(() => Object.values(toggleHoleMap), [toggleHoleMap]);
  const maxHoleExtent = React.useMemo(
    () => (holes.length ? Math.max(...holes.map((hole) => hole.x + hole.width)) : 0),
    [holes]
  );
  // Extend the mask far past the viewport on both sides so scrolling/bouncing never
  // reveals a hard frost edge — the white always runs off both ends.
  const overscrollMargin = Math.max(contentInset, viewportWidth);
  const maskWidth = Math.max(viewportWidth, maxHoleExtent + overscrollMargin * 2);
  const maskHeight = rowHeight > 0 ? rowHeight + STRIP_GAP : 0;
  const maskedHoles = React.useMemo(
    () =>
      holes.map((hole) => ({
        x: hole.x + overscrollMargin,
        y: hole.y,
        width: hole.width,
        height: hole.height,
        borderRadius: (hole.borderRadius ?? holeBorderRadius) + HOLE_RADIUS_BOOST,
      })),
    [holes, holeBorderRadius, overscrollMargin]
  );
  // Action holes register in actionRowContent coordinates (padding already shifts
  // child x) and the action mask absolute-fills that same box — shared frame, no
  // manual offset.
  const actionMaskedHoles = React.useMemo(
    () =>
      Object.values(actionHoleMap).map((hole) => ({
        x: hole.x,
        y: hole.y,
        width: hole.width,
        height: hole.height,
        borderRadius: (hole.borderRadius ?? holeBorderRadius) + HOLE_RADIUS_BOOST,
      })),
    [actionHoleMap, holeBorderRadius]
  );

  // ── §2.8 cutout fade-in covers (per mask layer, congruent with the windows) ───
  const toggleFadeCovers = React.useMemo(
    () =>
      resolveCutoutFadeCovers({
        holeMap: toggleHoleMap,
        defaultBorderRadius: holeBorderRadius,
        radiusBoost: HOLE_RADIUS_BOOST,
      }),
    [toggleHoleMap, holeBorderRadius]
  );
  const actionFadeCovers = React.useMemo(
    () =>
      resolveCutoutFadeCovers({
        holeMap: actionHoleMap,
        defaultBorderRadius: holeBorderRadius,
        radiusBoost: HOLE_RADIUS_BOOST,
      }),
    [actionHoleMap, holeBorderRadius]
  );

  // ── Action-row slot: mounted ONLY while actionProgress > 0 ────────────────────
  const [actionActive, setActionActive] = React.useState(false);
  useAnimatedReaction(
    () => (actionProgress ? actionProgress.value > 0 : false),
    (active, previous) => {
      if (active !== previous) {
        runOnJS(setActionActive)(active);
      }
    },
    [actionProgress]
  );
  // Exit translation applies to the CLIPPED viewport container: one viewport width is
  // full exit by construction, and the container carries its inner scroll offset with
  // it — the row departs from the user's live scroll position (toggle-strip-morph.ts,
  // leg-4 geometry correction: exit and action-row entry now traverse the same
  // distance, so their speeds match under one shared progress).
  const toggleRowMorphStyle = useAnimatedStyle(() => {
    if (!actionProgress) {
      return { transform: [{ translateX: 0 }] };
    }
    const exitDistance = resolveToggleRowExitDistance({
      viewportWidth: sharedViewportWidth.value,
    });
    return { transform: [{ translateX: actionProgress.value * exitDistance }] };
  }, [actionProgress]);
  const actionRowMorphStyle = useAnimatedStyle(() => {
    if (!actionProgress) {
      return { transform: [{ translateX: 0 }] };
    }
    return {
      transform: [
        {
          translateX: resolveActionRowEnterTranslateX({
            actionProgress: actionProgress.value,
            viewportWidth: sharedViewportWidth.value,
          }),
        },
      ],
    };
  }, [actionProgress]);
  // ── ACTION-ROW RETENTION (engine-level — wave-2 §1.2) ─────────────────────────
  // The reverse morph must be the exact mirror of entry. Consumers pass `actionRow`
  // conditionally on the SAME state that drives `actionProgress` back to 0 — without
  // retention the action layer (whose full-band white plate tiles the band with the
  // departing/returning toggle row) unmounted on the FIRST frame of the reverse:
  // the strip snapped out, frost showed through the band, and the toggle row slid
  // back without its complementary plate. The engine retains the last non-null
  // action row for as long as the morph is anywhere above 0, so exit = entry
  // reversed BY CONSTRUCTION. While exiting (intent null), the layer is inert.
  const retainedActionRowRef = React.useRef<React.ReactNode>(null);
  if (actionRow != null) {
    retainedActionRowRef.current = actionRow;
  }
  React.useEffect(() => {
    if (!actionActive) {
      retainedActionRowRef.current = null;
    }
  }, [actionActive]);
  const effectiveActionRow = actionRow ?? (actionActive ? retainedActionRowRef.current : null);
  const showActionRow = actionActive && effectiveActionRow != null;
  const isActionRowExiting = showActionRow && actionRow == null;

  // Strip-citizen mount ledger (§1.1): slots rendered on the FIRST commit are the
  // instant first paint; slots appearing on any later render are conditional
  // citizens and animate their real width in/out (pushing siblings by layout).
  const seenSlotKeysRef = React.useRef<Set<string>>(new Set());
  const lateSlotKeysRef = React.useRef<Set<string>>(new Set());
  const hasCommittedFirstRenderRef = React.useRef(false);
  React.useEffect(() => {
    hasCommittedFirstRenderRef.current = true;
  }, []);

  const toggleSlots = wrapChildrenInHoleSlots(
    children,
    holeBorderRadius,
    seenSlotKeysRef.current,
    lateSlotKeysRef.current,
    hasCommittedFirstRenderRef.current
  );
  const actionSlots = showActionRow
    ? wrapChildrenInHoleSlots(effectiveActionRow, holeBorderRadius, null, null, false)
    : null;

  return (
    // BACKDROP HONESTY BY CONSTRUCTION: on a foundation-plated scene this punches a
    // band-height hole in the white plate (the plate adapts to the strip, never the
    // reverse); outside one, FrostCutout is inert by its own contract.
    <FrostCutout style={styles.cutoutFrame}>
      <View style={styles.band} testID={testID} onLayout={handleBandLayout}>
        <FrostedGlassBackground />
        <Reanimated.View
          style={toggleRowMorphStyle}
          pointerEvents={showActionRow ? 'none' : 'auto'}
        >
          <View
            style={styles.viewport}
            onLayout={(event) => {
              const nextWidth = event.nativeEvent.layout.width;
              setViewportWidth((prev) => (Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth));
              sharedViewportWidth.value = nextWidth;
            }}
          >
            <ScrollView
              ref={scrollViewRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              directionalLockEnabled
              alwaysBounceHorizontal
              keyboardShouldPersistTaps="handled"
              scrollEnabled={!showActionRow}
              contentOffset={initialContentOffsetRef.current}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onScrollEndDrag={handleScrollSettled}
              onMomentumScrollEnd={handleScrollSettled}
              onContentSizeChange={handleContentSizeChange}
              contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentInset }]}
              style={styles.scroll}
            >
              <View
                style={styles.cutoutStrip}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  setContentRowWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
                  setRowHeight((prev) => (Math.abs(prev - height) < 0.5 ? prev : height));
                }}
              >
                <View style={styles.toggleRow}>
                  {contentRowWidth > 0 && rowHeight > 0 && maskedHoles.length > 0 ? (
                    <MaskedHoleOverlay
                      pointerEvents="none"
                      holes={maskedHoles}
                      backgroundColor={surfaceColor}
                      style={[
                        styles.maskOverlay,
                        {
                          width: maskWidth,
                          height: maskHeight,
                          top: 0,
                          left: -overscrollMargin,
                        },
                      ]}
                    />
                  ) : null}
                  <HoleRegistryContext.Provider value={toggleHoleRegistry}>
                    <ToggleStripWarmRestoreContext.Provider value={warmRestore}>
                      <View style={styles.toggleRowContent}>{toggleSlots}</View>
                    </ToggleStripWarmRestoreContext.Provider>
                  </HoleRegistryContext.Provider>
                  <CutoutFadeCovers covers={toggleFadeCovers} color={surfaceColor} />
                </View>
              </View>
            </ScrollView>
          </View>
        </Reanimated.View>
        {showActionRow ? (
          // STATIC alternate chrome: absolute (never part of the scroll content, so
          // never reachable by scrolling — it is UNMOUNTED unless actionProgress > 0),
          // its own white plate + hole set riding the morph translation.
          <Reanimated.View
            style={[styles.actionLayer, actionRowMorphStyle]}
            pointerEvents={isActionRowExiting ? 'none' : 'auto'}
          >
            <View style={[styles.actionRowContent, { paddingHorizontal: contentInset }]}>
              {/* The action plate must cover EXACTLY what the toggle plate covers —
                  the toggle mask extends STRIP_GAP past the row (clipped by the band)
                  so it always overshoots the foundation plate's punched hole; an
                  absolute-fill here stopped at the container's fractional bottom and
                  left the hole's last ~1px as a see-through hairline (wave-3 §2.8,
                  attributed on-sim). Same overshoot, same coverage, by construction. */}
              <MaskedHoleOverlay
                pointerEvents="none"
                holes={actionMaskedHoles}
                backgroundColor={surfaceColor}
                renderWhenEmpty
                style={[styles.actionMask, maskHeight > 0 ? { height: maskHeight } : null]}
              />
              <HoleRegistryContext.Provider value={actionHoleRegistry}>
                {actionSlots}
              </HoleRegistryContext.Provider>
              <CutoutFadeCovers covers={actionFadeCovers} color={surfaceColor} />
            </View>
          </Reanimated.View>
        ) : null}
      </View>
    </FrostCutout>
  );
}

const styles = StyleSheet.create({
  cutoutFrame: {
    alignSelf: 'stretch',
  },
  band: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
  },
  viewport: {
    width: '100%',
    position: 'relative',
  },
  scroll: {
    flexGrow: 0,
    width: '100%',
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: STRIP_GAP,
    paddingVertical: 0,
  },
  cutoutStrip: {
    position: 'relative',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  toggleRow: {
    position: 'relative',
  },
  toggleRowContent: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: STRIP_GAP,
    paddingVertical: 0,
  },
  holeSlotHidden: {
    opacity: 0,
  },
  holeSlotClip: {
    // Clips the control while a citizen's width grows/shrinks (entry/exit morph);
    // inert at rest — every control draws inside its own box.
    overflow: 'hidden',
  },
  maskOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  actionLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  actionMask: {
    // Height set inline to the toggle mask's height (rowHeight + STRIP_GAP) — never
    // absolute-fill (see the hairline note at the render site).
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  actionRowContent: {
    position: 'relative',
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // The action row is STATIC chrome with the band's full width — the canonical
    // layout is the spread (Cancel-left · tools-center · Save-right, favorites-edit-
    // mode-ideal). space-between here (not flex:1 on a child) because every child is
    // wrapped in a hug-content hole slot; this is exactly the spread the old
    // hand-rolled morph could never achieve inside a hug-content scroller (the leg-2
    // flex-huddle attribution).
    justifyContent: 'space-between',
    columnGap: STRIP_GAP,
  },
});
