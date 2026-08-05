import React from 'react';
import {
  Dimensions,
  findNodeHandle,
  NativeModules,
  Pressable,
  requireNativeComponent,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import Reanimated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import { TOGGLE_STRIP_BAND_HEIGHT } from '../toggles/toggle-strip-metrics';
import { overlaySheetStyles } from '../overlays/overlaySheetStyles';
import MaskedHoleOverlay from '../components/MaskedHoleOverlay';
import HeaderNavAction from '../overlays/HeaderNavAction';
import {
  OVERLAY_CORNER_RADIUS,
  OVERLAY_GRAB_HANDLE_HEIGHT,
  OVERLAY_GRAB_HANDLE_PADDING_TOP,
  OVERLAY_GRAB_HANDLE_RADIUS,
  OVERLAY_GRAB_HANDLE_WIDTH,
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
  OVERLAY_HEADER_PADDING_BOTTOM,
  OVERLAY_HEADER_ROW_MARGIN_TOP,
  OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
} from '../overlays/overlay-chrome-metrics';

import {
  useTrackSheetPhysics,
  type TrackSheetGeometry,
  type TrackSheetPhysicsOptions,
} from './useTrackSheetPhysics';
import { TrackSheetDockedStrip } from './TrackSheetStrip';
import type { TrackEntryKey } from './track-entry-identity';
import { computeOutgoingScroll, TrackEntryScrollMemory } from './track-entry-scroll-memory';
import { resolveSnapRetryDecision } from './track-motion-authority';
import { executeEntrySwitch, planEntrySwitch, TrackRestoreCoordinator } from './track-entry-switch';

// ─── TrackSheetPage — THE sheet-page standard ──────────────────────────────────
//
// Every sheet page in the app is one of these. Baked in, zero per-page work:
//   • ONE TRACK physics — sheet travel + list scroll on one native scroll;
//     native rubber both ends; critically damped detent settles; the ballistic
//     wall (momentum never crosses the sheet-top boundary); durable native
//     hatch (TrackScrollKit).
//   • THE SCROLL VIEW *IS* THE SHEET — content is
//     [transparent spacer = sheet travel][chrome][body], inset at expandedTop.
//     The chrome is content (one motion source ⇒ no wiggle) pinned natively
//     past H, and every touch anywhere on the sheet is a scroll touch ⇒ the
//     whole sheet is grabbable, with UIScrollView owning tap-vs-drag.
//   • CHROME — header row at the surface top, optional docked strip band with
//     TRUE CUTOUTS through the white plate (MaskedHoleOverlay), and the
//     divider that fades in as content slides under the chrome.
//   • A real recycler list layer (FlashList, MVCP disabled on the track, inner
//     Animated scroll component so worklet + recycler events coexist).
//
// Strip permutations: pass `dockedStrip` for the cutout band (chrome-pinned),
// and/or `listLeader` for in-list content that scrolls away with the page.
// Omit both for a plain header sheet.

const SCREEN = Dimensions.get('window');

// THE REAL SLOT (transition derivation XIII): a native view that SELF-REGISTERS
// with the engine inside its own UIKit lifecycle and whose transform is SEALED
// against every writer but the engine. React may recreate it freely — the
// replacement registers and is positioned in the same UIKit transaction it
// appears in, so the detach flash and the parked-header class are unwritable.
// Module double-evaluation (HMR / mixed-revision boots) makes a second
// requireNativeComponent call an Invariant Violation -- cache globally.
const slotCache = globalThis as { __TrackShellSlotNative?: unknown };
const TrackShellSlotNative = (slotCache.__TrackShellSlotNative ??=
  requireNativeComponent('TrackShellSlot'));
// forwardRef is LOAD-BEARING: a ref on a plain function component is silently
// dropped, so the engine never learns the view's tag.
const TrackShellSlot = React.forwardRef<
  unknown,
  ViewProps & {
    slotRole: 'frost' | 'chrome' | 'tail' | 'chromeContent';
    children?: React.ReactNode;
  }
>(function TrackShellSlot(props, ref): React.ReactElement {
  const Native = TrackShellSlotNative as unknown as React.ComponentClass<Record<string, unknown>>;
  return <Native ref={ref as never} {...(props as unknown as Record<string, unknown>)} />;
});

// THE CARVE (responsibility audit #2): the legs' scroll views fill the screen,
// but the sheet only OWNS from sheetTop down. This native wrapper's hitTest
// releases every touch above the engine-published live sheet edge to the map —
// the CraveBottomSheetHostView interactive-frame law, ported. Paint masking
// never carved touches (P7); this is the missing half.
const carveCache = globalThis as { __TrackTouchCarveNative?: unknown };
const TrackTouchCarveNative = (carveCache.__TrackTouchCarveNative ??=
  requireNativeComponent('TrackTouchCarve'));
function TrackTouchCarve(props: ViewProps & { children?: React.ReactNode }): React.ReactElement {
  const Native = TrackTouchCarveNative as unknown as React.ComponentClass<Record<string, unknown>>;
  return <Native {...(props as unknown as Record<string, unknown>)} />;
}

const AnimatedFlashList = Reanimated.createAnimatedComponent(
  FlashList as unknown as React.ComponentClass<Record<string, unknown>>
);

// THE VIRTUALIZATION LAW (U5): the recycler's own handler rides the INNER
// scroll component's onScroll — the inner component must itself be Animated so
// the worklet stream and the recycler's JS handler coexist.
const TrackScrollComponent = React.forwardRef<Reanimated.ScrollView, Record<string, unknown>>(
  (props, ref) => <Reanimated.ScrollView {...props} ref={ref} />
);
TrackScrollComponent.displayName = 'TrackScrollComponent';

export type TrackSheetListProps<Item> = Pick<
  FlashListProps<Item>,
  | 'data'
  | 'renderItem'
  | 'keyExtractor'
  | 'getItemType'
  | 'ItemSeparatorComponent'
  | 'ListEmptyComponent'
  | 'onEndReached'
  | 'onEndReachedThreshold'
  | 'extraData'
>;

/** THE RESIDENT LEG (residents-cutover Part F): a scene's rows, mounted once
 * on first visit and kept resident; switches display-flip legs while the
 * singletons (chrome, slots, shell, physics, τ) never remount. */
export type TrackSheetLeg = {
  /** ENTRY identity (`sceneKey#entryId` — track-entry-identity.ts): THE key of
   * every per-leg store on the page (scroll memory, chrome/renderer caches,
   * chrome stack identity). Two stacked entries of the same scene are two
   * legs; scene-keyed stores collided them (G-ENTRY). */
  entryKey: TrackEntryKey;
  sceneKey: string;
  list: TrackSheetListProps<unknown>;
  rowSurfaceStyle?: ViewStyle;
  onUserListScrollActivity?: TrackSheetPhysicsOptions['onUserListScrollActivity'];
  /** PER-LEG CHROME (the residents centerpiece): each leg carries its OWN
   * touch chrome permanently — title + its strip — so the chrome never
   * changes parents on a flip and never remounts. Only the presented leg's
   * twin feeds the native pin. */
  title?: React.ReactNode;
  stripChildren?: React.ReactNode;
  listLeader?: React.ReactNode;
};

/** What native snapTo answered (FIX 3 / G-HIDDEN generation stamp). refused
 * means a live drag owned τ when the command landed — THE FINGER OWNS TAU,
 * the command is dead, never re-issued. hiddenGeneration is present iff the
 * command armed a hidden excursion (the stamp trackHiddenEdgeCleared events
 * must match to be consumed). */
export type TrackSnapOutcome = { refused: boolean; hiddenGeneration?: number };

export type TrackSheetCommands = {
  /** Programmatic settle to a τ (detent) — rides the native scroll animation.
   * onOutcome reports native's verdict: a refusal (finger owns τ) or the
   * armed hidden-excursion generation. */
  snapToTau: (tau: number, onOutcome?: (outcome: TrackSnapOutcome) => void) => void;
  /** Posture peeks (JS mirrors; used at rest for descriptor resolution). */
  readTau: () => number;
  readSigma: () => number;
  /** G-INTERRUPT (A5): true while a finger owns τ — a mid-drag policy read
   * must answer from live posture and ignore any machine spring target. */
  readDragging: () => boolean;
  /** G-HIDDEN (R4): snapshot the presented entry's list scroll into entry
   * memory BEFORE a hidden excursion moves τ below collapsed. The deferred
   * swap commits at τ=−depth, where the live scroll term is gone — the plan
   * layer suppresses saves there (planEntrySwitch, tau<0), so this snapshot
   * is the ONE write that preserves the entry's offset across a hide. */
  saveScrollForPresentedEntry: () => void;
};

export type TrackSheetPageProps = {
  geometry: TrackSheetGeometry;
  /** Title-slot content (left side of the header row). */
  title: React.ReactNode;
  /** Extras rendered LEFT of the nav action in the action group. */
  headerExtras?: React.ReactNode;
  /** plus↔X progress SV (0=plus,1=X); null hides the nav action + its cutout. */
  navActionProgress?: SharedValue<number> | null;
  onNavActionPress?: () => void;
  navActionLabel?: string;
  /** Grab handle (production: 40x3.25 cutout to the frost; tap promotes). */
  grabHandleHidden?: boolean;
  onGrabHandlePress?: () => void;
  /** Footer surface extension below the last row.
   *  F878 (2026-08-03): an ORPHAN docstring sat here — "In-list leader content — scrolls
   *  away with the page (in-list strip mode)" — documenting a prop that no longer exists,
   *  and therefore silently documenting `footerHeight` instead. */
  footerHeight?: number;
  /** THE RESIDENT LEGS — every visited scene's rows. The presented leg is
   * live; the rest are display-detached, scroll preserved via the switch
   * formula. Lazy: the host adds a leg on first visit (E1). */
  legs: TrackSheetLeg[];
  /** Sheet surface color. */
  surfaceColor?: string;
  /** Dev HUD readout of τ. */
  debugHud?: boolean;
  /** Imperative commands (scene-switch snaps etc.) — filled on mount. */
  commandsRef?: React.MutableRefObject<TrackSheetCommands | null>;
  /** ENTRY identity for THE SWITCH FORMULA: on change, the outgoing entry's
   * list scroll (max(0, τ−H)) is saved and the incoming entry's is restored:
   * τ_new = min(τ, H) + listScroll(incoming). sheetTop is flat for τ ≥ H and
   * listScroll is nonzero only there, so the sheet PROVABLY cannot move on a
   * switch while every entry keeps its own scroll. Entry-keyed (G-ENTRY):
   * revisiting the same SCENE under a different entry is a different identity. */
  presentedEntryKey: TrackEntryKey;
  /** THE PUBLICATION BRIDGE (acceptance inventory §5.8): mirror the track into
   * the app-wide shared sheet values — every legacy subscriber (search chrome
   * transition, scrim, dismiss plane, origin capture) rides the track. */
  publicationBindings?: {
    sheetTranslateY?: SharedValue<number>;
    sheetScrollOffset?: SharedValue<number>;
  };
  /** THE SETTLE OBSERVER: fires once per GESTURE-born rest on a detent (τ of
   * the detent). Feeds posture memory — seats are gesture-written only
   * (inventory §5.10). Programmatic settles never fire it. */
  onGestureSettle?: (detentTau: number) => void;
  /** THE MOTION-AUTHORITY SIGNAL: fires on EVERY rest, gesture or programmatic.
   * The search redraw join's 'sheet' leg rides this — the old host marked
   * sheetReady at snap SETTLE regardless of writer. Deliberately distinct from
   * onGestureSettle, which is posture memory and must stay gesture-only. */
  onSettle?: (detentTau: number) => void;
  /** THE MOTION-AUTHORITY SIGNAL, begin side (R7 fence): fires once per native
   * drag begin (physics.dragging false→true) — the proven "the sheet started
   * moving under a finger" fact the sheet-motion fence's PENDING flip rides.
   * Commanded flights flip pending at the command (willMove), so this covers
   * exactly the gesture half. */
  onDragBegin?: () => void;
};

export function TrackSheetPage({
  geometry,
  title,
  headerExtras,
  navActionProgress = null,
  onNavActionPress,
  navActionLabel = 'Close',
  grabHandleHidden = false,
  onGrabHandlePress,
  // PROVENANCE (F874): 160 is a DEFAULT, overridden by every real caller that has a chin;
  // it exists so a leg with no footer still leaves room to scroll the last row clear of the
  // bottom safe area. Not measured — a caller that needs an exact chin passes one.
  footerHeight = 160,
  legs,
  surfaceColor = '#ffffff',
  debugHud = false,
  commandsRef,
  presentedEntryKey,
  publicationBindings,
  onGestureSettle,
  onSettle,
  onDragBegin,
}: TrackSheetPageProps): React.ReactElement {
  // Pagination signals route to the PRESENTED leg only (hidden legs emit no
  // scroll events anyway; this keeps the physics hook identity stable).
  const presentedLegRef = React.useRef<TrackSheetLeg | null>(null);
  // Handlers behind refs: chrome elements are CACHED per scene, and an element
  // that closes over a per-switch callback identity defeats the cache (red
  // team: the cache never hit). The elements read through these refs instead.
  const onNavActionPressRef = React.useRef(onNavActionPress);
  onNavActionPressRef.current = onNavActionPress;
  const onGrabHandlePressRef = React.useRef(onGrabHandlePress);
  onGrabHandlePressRef.current = onGrabHandlePress;
  const stableNavActionPress = React.useCallback(() => onNavActionPressRef.current?.(), []);
  const stableGrabHandlePress = React.useCallback(() => onGrabHandlePressRef.current?.(), []);
  const presentedLeg = legs.find((leg) => leg.entryKey === presentedEntryKey) ?? null;
  presentedLegRef.current = presentedLeg;
  const onUserListScrollActivity = React.useCallback((offsetY: number, distanceFromEnd: number) => {
    presentedLegRef.current?.onUserListScrollActivity?.(offsetY, distanceFromEnd);
  }, []);
  const physics = useTrackSheetPhysics(geometry, { onUserListScrollActivity });
  const { tau, trackH, sheetTopY, onScroll, attachToTag } = physics;

  // F878 (2026-08-03): a law block about "the monotonic accumulator ref" stood here. That
  // ref is gone — the handler does one assignment now — so the block reasoned about code
  // that no longer exists, in the sheet the whole app renders through.

  // PRODUCTION CHROME GEOMETRY (acceptance inventory §1): the header block is
  // the exact un-rounded 68.25; strip scenes add band(32) + spacer(8).
  const legChromeHeight = (leg: TrackSheetLeg | null) =>
    OVERLAY_TAB_HEADER_HEIGHT +
    (leg?.stripChildren != null
      ? TOGGLE_STRIP_BAND_HEIGHT + OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM
      : 0);
  const chromeHeight = legChromeHeight(presentedLeg);

  // THE HEADER CUTOUT PLATE (inventory §1.5): white plate with the grab-handle
  // slot and the close-circle punched through to the frost beneath.
  const plateHoles = React.useMemo(() => {
    const holes: { x: number; y: number; width: number; height: number; borderRadius: number }[] =
      [];
    if (!grabHandleHidden) {
      holes.push({
        x: (SCREEN.width - OVERLAY_GRAB_HANDLE_WIDTH) / 2,
        y: OVERLAY_GRAB_HANDLE_PADDING_TOP,
        width: OVERLAY_GRAB_HANDLE_WIDTH,
        height: OVERLAY_GRAB_HANDLE_HEIGHT,
        borderRadius: OVERLAY_GRAB_HANDLE_RADIUS,
      });
    }
    if (navActionProgress != null) {
      const headerRowY =
        OVERLAY_GRAB_HANDLE_PADDING_TOP +
        OVERLAY_GRAB_HANDLE_HEIGHT +
        OVERLAY_HEADER_ROW_MARGIN_TOP;
      holes.push({
        x: SCREEN.width - OVERLAY_HORIZONTAL_PADDING - OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
        y: headerRowY,
        width: OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
        height: OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
        borderRadius: OVERLAY_HEADER_CLOSE_BUTTON_SIZE / 2,
      });
    }
    return holes;
  }, [grabHandleHidden, navActionProgress]);

  // ── Derivations (pure functions of τ / sheetTopY) ──
  // ── THE SURFACE FOLLOWS THE TRACK (counter-translate DELETED, 2026-07-27) ──
  // The track is a plain, untransformed, unclipped full-screen scroll: touches
  // land natively everywhere and no trick sits between the finger and the
  // engine. Content already begins at sheetTopY BY CONSTRUCTION (the spacer
  // occupies exactly [0,H] of the track), so nothing has to be pushed into
  // place. The sheet surface and chrome simply RIDE sheetTopY, and the only
  // thing that ever needed clipping — rows scrolling above the sheet — is
  // handled by a MASK (paint-only, hit-test-free).
  // Mask band: everything above the chrome's bottom edge is hidden.
  const trackHShared = useSharedValue(trackH);
  React.useEffect(() => {
    trackHShared.value = trackH;
  }, [trackH, trackHShared]);
  const dividerStyle = useAnimatedStyle(() => {
    // LIVE H, never a captured constant: at boot the geometry seed can report
    // expandedTop === collapsedTop ⇒ trackH 0, which degenerates this to
    // `opacity: τ` — pinning the divider ON at rest on EVERY page (the exact
    // universality the owner saw). The fade only means anything once H is real.
    const h = trackHShared.value;
    if (h <= 0) {
      return { opacity: 0 };
    }
    // σ shifts the boundary: content is "under the chrome" past H+σ.
    return {
      opacity: interpolate(tau.value - h - physics.sigma.value, [0, 3, 14], [0, 0.35, 1], 'clamp'),
    };
  });

  // ── THE NATIVE SHELL BIND (native-shell derivation, 2026-07-29) ────────────
  // Native owns POSITION, RN owns PIXELS. Every view whose position is a
  // function of τ (frost, tail, chrome visuals) hands its tag to the shell,
  // and TrackScrollKit transforms them in scrollViewDidScroll — one writer,
  // one frame, zero lag between any two shell layers. There is no chrome twin
  // and no pin any more: the ONE chrome lives in the shell slot and redirects
  // its own unmarked touches into the presented leg's scroll view, so
  // UIScrollView still owns tap-vs-drag for every pixel of the sheet.
  // MUST RE-ASSERT ON ATTACH: refs fire child-first and
  // the proxy may not exist on the first pass (same law as the seat).
  const applyPinRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => physics.subscribeAttached(() => applyPinRef.current?.()), [physics]);
  const trackTagRef = React.useRef<number | null>(null);
  const applyPin = React.useCallback(() => {
    const nativePhysics = NativeModules.TrackScrollPhysics;
    if (trackTagRef.current == null) {
      return;
    }
    if (nativePhysics?.bindShell != null) {
      if (nativePhysics?.pinChrome != null) {
        nativePhysics.pinChrome(trackTagRef.current, chromeContentTagRef.current);
      }
      nativePhysics.bindShell(trackTagRef.current, {
        chromeTag: null,
        chromeContentTag: chromeContentTagRef.current,
        leaderTag: leaderTagRef.current,
        expandedTop: geometry.expandedTop,
        trackH,
        chromeHeight,
      });
    }
  }, [chromeHeight, geometry.expandedTop, trackH]);
  React.useEffect(() => {
    applyPin();
  }, [applyPin]);
  // COMMIT-PROOF: React resets a view's transform whenever it recommits (its
  // style carries none), and a resting sheet gets no scroll frame to restore
  // it — a scene switch left the chrome visuals at y=0 (seen live 2026-07-29,
  // profile). Re-assert the bind after EVERY commit; bindShell re-applies the
  // current frame immediately, so a reset can never survive a commit.
  // DELETE PASS (2026-07-31): the every-commit re-assert, the settled
  // re-bind (rAF + 150ms), and the audit self-heal are gone — THE REAL SLOT
  // self-registers in its own UIKit lifecycle and composes position inside
  // setFrame, so there is no stale-tag window left to compensate for. The
  // bind now re-asserts only when it MEANS something: geometry change
  // (below), native attach, and the touch twin's ref.
  // THE SHELL AUDIT (P10, 2026-07-31): Fabric's measureInWindow is SHADOW-TREE
  // layout — blind to native transforms (it barked y=0 while the screen was
  // provably correct). Truth is asked of UIKit via the native auditShell, at
  // rest, double-sampled. Barks on real divergence or an unbound/detached
  // chrome view — the header-at-screen-top class, measured honestly.
  React.useEffect(() => {
    if (!__DEV__) {
      return undefined;
    }
    let cancelled = false;
    let priorBad: string | null = null;
    const timer = setInterval(() => {
      const nativePhysics = NativeModules.TrackScrollPhysics;
      if (nativePhysics?.auditShell == null || trackTagRef.current == null) {
        return;
      }
      void nativePhysics.auditShell(trackTagRef.current).then(
        (audit: {
          ok: boolean;
          tau?: number;
          sigma?: number;
          expectedSheetTop?: number;
          chromeBound?: boolean;
          chromeAttached?: boolean;
          chromeWindowY?: number;
        }) => {
          if (cancelled || !audit.ok) {
            return;
          }
          const problems: string[] = [];
          // Positional invariant only: the chrome's window y IS the sheet edge.
          if (
            audit.chromeWindowY != null &&
            audit.expectedSheetTop != null &&
            Math.abs(audit.chromeWindowY - audit.expectedSheetTop) > 1
          ) {
            problems.push(
              `chrome at ${Math.round(audit.chromeWindowY)} != sheetTop ${Math.round(audit.expectedSheetTop)}`
            );
          }
          const key = problems.join('; ') || null;
          // Double-sample: bark only when the SAME problem persists across two
          // consecutive audits (a moving sheet can skew one sample).
          if (key != null && key === priorBad) {
            // eslint-disable-next-line no-console
            console.error(`[SHELL] audit: ${key} (τ=${Math.round(audit.tau ?? -1)})`);
          }
          priorBad = key;
        },
        () => undefined
      );
      // PROVENANCE (F874): the shell audit is a BACKGROUND correctness probe, not a
      // latency measurement — 3s is "often enough to catch a stuck layer within a few
      // seconds of it happening, rare enough to cost nothing". It double-samples before
      // barking, so the interval also sets how long a real problem must persist.
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applyPin]);

  applyPinRef.current = applyPin;

  // THE LEG REFS: one cached callback per scene; a mounting leg records its
  // tag, and if it is the PRESENTED leg the engine attaches to it (attach is
  // per-scroll-view, idempotent, retried) and the shell re-binds.
  const EMPTY_DATA: readonly never[] = [];
  const chromeContentTagRef = React.useRef<number | null>(null);
  const leaderTagRef = React.useRef<number | null>(null);
  const chromeContentRef = React.useCallback((node: unknown) => {
    const tag = node == null ? null : findNodeHandle(node as never);
    if (tag !== chromeContentTagRef.current) {
      chromeContentTagRef.current = tag;
      applyPinRef.current?.();
    }
  }, []);
  const leaderRef = React.useCallback((node: View | null) => {
    const tag = node == null ? null : findNodeHandle(node);
    if (tag !== leaderTagRef.current) {
      leaderTagRef.current = tag;
      applyPinRef.current?.();
    }
  }, []);
  const trackTagOnlyRef = React.useRef<number | null>(null);
  const trackListRef = React.useCallback(
    (instance: React.Component | null) => {
      if (instance == null) {
        trackTagOnlyRef.current = null;
        return;
      }
      const tag = findNodeHandle(instance);
      if (tag == null || tag === trackTagOnlyRef.current) {
        return;
      }
      trackTagOnlyRef.current = tag;
      trackTagRef.current = tag;
      attachToTag(tag);
      applyPin();
    },
    [attachToTag, applyPin]
  );

  // THE PUBLICATION BRIDGE: one-way, UI-thread mirrors — the track is the ONE
  // writer; legacy readers see the exact values the old sheet used to publish.
  const boundTranslateY = publicationBindings?.sheetTranslateY ?? null;
  const boundScrollOffset = publicationBindings?.sheetScrollOffset ?? null;
  useAnimatedReaction(
    () => sheetTopY.value,
    (value) => {
      if (boundTranslateY != null) {
        boundTranslateY.value = value;
      }
    },
    [boundTranslateY]
  );
  useAnimatedReaction(
    () => Math.max(0, tau.value - trackH),
    (value) => {
      if (boundScrollOffset != null) {
        boundScrollOffset.value = value;
      }
    },
    [boundScrollOffset, trackH]
  );

  // ── THE SETTLE OBSERVER (gesture-written posture memory) ──
  // UI-THREAD REACTION, never polling (jiggle fix, 2026-07-27): a 250ms JS
  // interval reading physics during a spring animation stutters the motion —
  // the sheet must never be sampled by the JS thread while it moves. This
  // reaction fires once, on the frame the track comes to rest on a detent
  // after a gesture.
  const onGestureSettleRef = React.useRef(onGestureSettle);
  onGestureSettleRef.current = onGestureSettle;
  // ── THE DRAG-BEGIN OBSERVER (R7 fence, pending side) ──
  // Same UI-thread-reaction discipline as the settle observer below: fires once
  // on the frame the finger takes τ, never polls.
  const onDragBeginRef = React.useRef(onDragBegin);
  onDragBeginRef.current = onDragBegin;
  const reportDragBegin = React.useCallback(() => {
    onDragBeginRef.current?.();
  }, []);
  useAnimatedReaction(
    () => physics.dragging.value,
    (dragging, previous) => {
      if (dragging && previous !== true) {
        runOnJS(reportDragBegin)();
      }
    },
    [reportDragBegin]
  );
  const onSettleRef = React.useRef(onSettle);
  onSettleRef.current = onSettle;
  const settleReportedTau = useSharedValue(-1);
  const settleLastTau = useSharedValue(-1);
  const reportSettle = React.useCallback((detentTau: number, owned: boolean) => {
    onSettleRef.current?.(detentTau);
    // Posture memory is gesture-written ONLY (inventory §5.10).
    if (owned) {
      onGestureSettleRef.current?.(detentTau);
    }
  }, []);
  useAnimatedReaction(
    () => ({
      value: tau.value,
      dragging: physics.dragging.value,
      owned: physics.userOwnsPosture.value,
    }),
    (current) => {
      // The WRITER no longer gates the observation — only the finger does. A
      // programmatic settle is still a settle; reportSettle routes by writer.
      if (current.dragging) {
        settleLastTau.value = -1;
        return;
      }
      const stable =
        settleLastTau.value >= 0 && Math.abs(current.value - settleLastTau.value) <= 0.5;
      settleLastTau.value = current.value;
      if (!stable) {
        return;
      }
      const posture = current.value - physics.sigma.value;
      for (const detent of physics.detentTaus) {
        if (Math.abs(detent - posture) <= 2 && settleReportedTau.value !== detent) {
          settleReportedTau.value = detent;
          runOnJS(reportSettle)(detent, current.owned);
          return;
        }
      }
    },
    [physics, reportSettle]
  );

  // ── THE SEAT: DELETED (F861, 2026-08-03) ──────────────────────────────────────
  // ~80 lines lived here that COULD NOT EXECUTE: the declarative re-asserting seat
  // (`cancelPendingSeat`, `assertSeat`, the 15-attempt / 250ms loop, the attach
  // re-subscribe, and the drag-cancels-seat animated reaction). Every one of them was
  // gated on a `seatTau` prop, and TrackSheetRouteHost — the only mount — passed a
  // literal `const seatTau = null`. The one other consumer (OneTrackPrototype) never
  // passed it and has no mount site.
  //
  // It was SUPERSEDED, not forgotten: the host's own note says "THE PARALLEL SEAT IS
  // DELETED — the track host registers as the 'sheetHost' motion target and consumes
  // the descriptor table's commands". That path is live below (motionCommandValue /
  // registerSheetMotionTarget / the pendingSnapTimer command lane). This corpse was
  // left mounted beside it, carrying some of the file's hardest-won comments — which is
  // exactly why it was dangerous: a reader debugging posture would have read the
  // seat's reasoning as current and edited dead code.
  //
  // The two lessons those comments bought are PRESERVED where they are still true, on
  // the live command lane: (1) a seat/snap is POSTURE-space, not tau-space — compare
  // `min(tau, H)`, because sheetTop is FLAT for tau >= H, so an 'expanded' target is
  // satisfied by ANY tau >= H (attributed live 2026-07-29: a restore to tau=916 was
  // dragged back to H); (2) the user owns posture after ANY gesture — a programmatic
  // target must die the moment a finger lands, or its spring and the drag fight for a
  // few frames ("bounces back, then continues once it realizes I'm swiping").

  const pendingSnapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** One live retry loop at a time: each snapToTau call mints an id; a stale
   * loop's async native answer is dropped instead of scheduling a retry. */
  const snapLoopIdRef = React.useRef(0);
  React.useEffect(() => {
    if (commandsRef == null) {
      return;
    }
    commandsRef.current = {
      readTau: () => tau.value,
      readSigma: () => physics.sigma.value,
      readDragging: () => physics.dragging.value,
      saveScrollForPresentedEntry: () => {
        // The EXACT term the switch formula saves, read at hide START where
        // the JS mirrors are settled (hides launch from rest).
        entryScrollMemoryRef.current.save(
          presentedEntryKeyRef.current,
          computeOutgoingScroll(tau.value, trackH, physics.sigma.value)
        );
      },
      // RETRYING SNAP (anti-trap, 2026-07-26): a scrollToOffset issued before the
      // recycler lays out is a silent no-op — the sheet sat at τ=0 while the OLD
      // sheet rendered the same page above it, and every visual check read the
      // wrong layer. Retry until τ actually reaches the target (or attempts cap).
      snapToTau: (tauTarget, onOutcome) => {
        if (pendingSnapTimer.current != null) {
          clearTimeout(pendingSnapTimer.current);
          pendingSnapTimer.current = null;
        }
        // Native spring settle (TrackScrollKit snapTo) — retry until τ moves
        // (a pre-attach call is a no-op; the recycler may still be mounting).
        // PROVENANCE (F874, 2026-08-03): 12 x 200ms = a 2.4s ceiling on "the recycler is
        // still mounting". Chosen, not measured: it must outlast a cold list mount and must
        // NOT outlast a user's patience with a sheet that has not moved. A budget that
        // EXPIRES is deliberate — an uncapped retry here would fight a user who dragged the
        // sheet in the meantime. If this ever expires in practice, the defect is upstream
        // (a snap issued against a track that never attaches), not a number to raise.
        //
        // THE FINGER OWNS TAU, both sides (native red team FIX 3): a live drag
        // aborts before issuing, and a native `refused` (the command landed
        // mid-drag) ends the loop for good — the user's posture choice
        // supersedes the stale command intent; never re-issue after the drag.
        // The per-step verdict is pure (resolveSnapRetryDecision, falsified in
        // track-motion-authority.spec.ts). Each call mints a loop id so a stale
        // promise from a superseded command can never schedule a retry.
        const loopId = snapLoopIdRef.current + 1;
        snapLoopIdRef.current = loopId;
        let attempts = 0;
        const settleStep = (outcome?: { refused?: boolean; hiddenGeneration?: number }) => {
          if (snapLoopIdRef.current !== loopId) {
            return;
          }
          if (outcome?.hiddenGeneration != null) {
            onOutcome?.({ refused: false, hiddenGeneration: outcome.hiddenGeneration });
          }
          const decision = resolveSnapRetryDecision({
            dragging: physics.dragging.value,
            refused: outcome?.refused === true,
            attempts,
            distance: Math.abs(tau.value - tauTarget),
          });
          if (decision === 'abort-finger' || decision === 'abort-refused') {
            onOutcome?.({ refused: true });
            return;
          }
          if (decision === 'retry') {
            pendingSnapTimer.current = setTimeout(trySnap, 200);
          }
        };
        const trySnap = () => {
          if (snapLoopIdRef.current !== loopId) {
            return;
          }
          if (physics.dragging.value) {
            onOutcome?.({ refused: true });
            return;
          }
          attempts += 1;
          const nativePhysics = NativeModules.TrackScrollPhysics;
          const tag = trackTagRef.current;
          if (nativePhysics?.snapTo == null || tag == null) {
            // No native engine (tests / pre-attach): the wrapper issue keeps
            // the old fire-and-forget shape; the distance check drives retry.
            physics.snapToTau(tauTarget);
            settleStep(undefined);
            return;
          }
          void Promise.resolve(nativePhysics.snapTo(tag, tauTarget)).then(
            (outcome: { refused?: boolean; hiddenGeneration?: number } | undefined) =>
              settleStep(outcome),
            () => settleStep(undefined)
          );
        };
        trySnap();
      },
    };
    return () => {
      if (pendingSnapTimer.current != null) {
        clearTimeout(pendingSnapTimer.current);
      }
      commandsRef.current = null;
    };
  }, [commandsRef, physics, tau, trackH]);

  // THE CHROME IS CONTENT, AND IT EXISTS TWICE (two-surfaces fix, 2026-08-01).
  //
  // The chrome sits right after the spacer, INSIDE the scroll view, so every touch on it
  // — title, close, grab handle, strip chips — is a scroll touch: the whole sheet is
  // grabbable by construction, with UIScrollView's own
  // delaysContentTouches/cancelContentTouches as the tap-vs-drag rule.
  //
  // Two copies are necessary: a TOUCH TWIN in the scroll content (the grabbable-sheet law
  // above) and a VISUAL TWIN in the shell slot, which rides sheetTop NATIVELY and so
  // cannot wiggle. Painting BOTH made each copy look like a self-sufficient sheet — which
  // is why a desync ever read as TWO SHEETS rather than one misplaced layer. The touch
  // twin is now INVISIBLE (opacity 0): same layout, same hit-testing, zero pixels. Two
  // headers on screen is unrepresentable, not merely avoided. TrackScrollKit pins the
  // visual twin past H (native, same-frame).
  //
  // F878 (2026-08-03): this was THREE stacked paragraphs whose claims disagreed — an
  // earlier one asserted the chrome shares the content's ONE motion source so "the wiggle
  // is impossible", which the later two then explain is not the whole story (the visual
  // twin is exactly the second motion source). Only the last was true; they are now one.
  const renderChrome = (
    refCallback: ((node: View | null) => void) | null,
    chromeTitle: React.ReactNode,
    band: React.ReactNode | null,
    chromeH: number
  ) => (
    <View ref={refCallback} collapsable={false} style={[styles.chrome, { height: chromeH }]}>
      {/* NO CHROME FROST SLAB: the frost founds the SHEET (see the founding
              layers below). A slab here would sit ON that frost and blur an
              already-blurred layer — the owner's "double frosty". The chrome's
              cutouts reach the founding frost directly. */}
      {/* Plate covers the HEADER BLOCK only — the strip band paints its
              own plate, and anything beneath its holes must be FROST (a full-
              chrome plate blocked the strip cutouts with white). */}
      {/* THE SAME-EDGE LAW (the owner's gap, found by reading, 2026-08-02).
          The plate used to be position:absolute with its OWN height while the
          band below it was a FLOW child whose top is the sum of five
          separately-rounded flow heights. Two independently-rounded numbers
          had to land on the same fractional boundary (68.25pt = 204.75px @3x)
          — and whenever their roundings disagreed, a sub-pixel sliver of
          FROST showed between the two whites: the persistent "gap under the
          header". Boxes that must tile may not round separately, so the plate
          is now the header block's BACKGROUND — plate bottom and band top are
          literally the same edge, and the seam is unrepresentable. */}
      <View style={styles.headerBlock} collapsable={false}>
        {/* THE UNDER-LAP (the wiggling joint, 2026-08-02). The plate and the
            band material are both SVG surfaces whose antialiased fractional
            edges meet at this joint — together they transmit a partial-alpha
            pixel. Over frost that reads white (invisible); over SCROLLING ROWS
            it tints per frame — the gap that wiggles. The plate extends 1pt
            UNDER the band (the band paints over it), so whatever the joint
            transmits shows plate-white, never the content moving beneath. */}
        <MaskedHoleOverlay
          // F884: geometry comes from `style` below, not from filling the parent.
          fill={false}
          holes={plateHoles}
          backgroundColor={surfaceColor}
          renderWhenEmpty
          style={styles.plateUnderlap}
        />

        {/* CONTROLS ARE MARKED (THE SINGLE PAINTED CHROME): the chrome slot's
          hitTest hands every UNMARKED point to the presented leg's scroll view,
          so the header drags the sheet exactly like a row does. Marked
          subtrees keep their own touches: buttons and the strip's horizontal
          scroller. */}
        <View
          style={styles.grabWrapper}
          nativeID="track-chrome-control"
          testID="track-chrome-control"
        >
          <Pressable
            onPress={stableGrabHandlePress}
            hitSlop={10}
            accessibilityLabel="Expand sheet"
            disabled={onGrabHandlePress == null}
          >
            <View style={[styles.grabHandle, grabHandleHidden && styles.grabHandleHidden]} />
          </Pressable>
        </View>
        <View style={styles.headerRow}>
          <View style={styles.titleSlot}>{chromeTitle}</View>
          <View
            style={styles.actionGroup}
            nativeID="track-chrome-control"
            testID="track-chrome-control"
          >
            {headerExtras}
            {navActionProgress != null && onNavActionPress != null ? (
              <HeaderNavAction
                progress={navActionProgress}
                onPress={stableNavActionPress}
                accessibilityLabel={navActionLabel}
              />
            ) : null}
          </View>
        </View>
        {/* header block bottom padding — the 10 in 8+3.25+7+32+8+10=68.25 */}
        <View style={styles.headerBottomPad} />
      </View>
      {band != null ? <View>{band}</View> : null}
      {/* The 8pt under the band is sheet material. As a FLOW child it shares
          the band's bottom edge exactly (same-edge law) instead of being an
          absolutely-positioned box rounded on its own. */}
      {band != null ? (
        <View
          style={[styles.stripSeamFlow, { backgroundColor: surfaceColor }]}
          pointerEvents="none"
        />
      ) : null}
      <Reanimated.View style={[styles.divider, dividerStyle]} />
    </View>
  );
  // CHROME IDENTITY IS PER ENTRY, NOT PER LEG OBJECT (strip-lateness fix,
  // 2026-08-01; entry-keyed under G-ENTRY, 2026-08-03). `legs` is rebuilt
  // whenever ANY scene's data changes, so keying the chrome off the leg object
  // remounted the strip on unrelated data ticks — and a remounted strip
  // re-measures its chips, which is what makes the toggle strip appear late.
  // Keyed by ENTRY so two stacked entries of the same scene keep independent
  // chrome (strip selection, title) instead of sharing one cached element.
  // THE CACHE KEY MUST INCLUDE EVERY PROP THE CHROME CLOSES OVER — including
  // its HANDLERS. Keying on title + strip children alone handed back an
  // element holding a STALE onNavActionPress, so the close button on child
  // pages silently did nothing (the element was built when the action was
  // still "create"). A memo that omits a closure is not a cache, it is a
  // freeze. Data churn is excluded because leg DATA is not in this list.
  const chromeElementCacheRef = React.useRef(
    new Map<TrackEntryKey, { signature: readonly unknown[]; element: React.ReactElement }>()
  );
  // Per-leg row renderers (declared before the chrome memo — its sweep reads
  // this map): each leg's renderItem wrapped once, memoized by ENTRY identity
  // so resident legs keep stable cell identities across re-renders.
  const rowRendererCacheRef = React.useRef(
    new Map<TrackEntryKey, { source: TrackSheetLeg; render: (info: never) => React.ReactElement }>()
  );
  const visualChromeLegs = React.useMemo(() => {
    // ELEMENT-CACHE HYGIENE (depth-K retention): entries evicted from the leg
    // list drop their cached chrome + row renderers here — caches must not
    // outgrow the retained set. Scroll memory deliberately survives eviction.
    const liveEntryKeys = new Set(legs.map((leg) => leg.entryKey));
    for (const key of [...chromeElementCacheRef.current.keys()]) {
      if (!liveEntryKeys.has(key)) {
        chromeElementCacheRef.current.delete(key);
      }
    }
    for (const key of [...rowRendererCacheRef.current.keys()]) {
      if (!liveEntryKeys.has(key)) {
        rowRendererCacheRef.current.delete(key);
      }
    }
    return legs.map((leg) => {
      // Signature holds ONLY per-scene inputs. Handlers go through stable
      // refs; shared inputs (holes, colors, progress) change rarely and are
      // included; per-switch identities are excluded BY DESIGN so the cache
      // actually hits across switches (red team: it never did).
      const signature: readonly unknown[] = [
        leg.title,
        leg.stripChildren,
        grabHandleHidden,
        headerExtras,
        plateHoles,
        surfaceColor,
        navActionProgress,
      ];
      const cached = chromeElementCacheRef.current.get(leg.entryKey);
      if (
        cached != null &&
        cached.signature.length === signature.length &&
        cached.signature.every((value, index) => value === signature[index])
      ) {
        return { entryKey: leg.entryKey, element: cached.element };
      }
      const band =
        leg.stripChildren != null ? (
          <View style={{ height: TOGGLE_STRIP_BAND_HEIGHT }}>
            <TrackSheetDockedStrip height={TOGGLE_STRIP_BAND_HEIGHT} plateColor="transparent">
              {leg.stripChildren}
            </TrackSheetDockedStrip>
          </View>
        ) : null;
      const element = renderChrome(null, leg.title ?? title, band, legChromeHeight(leg));
      chromeElementCacheRef.current.set(leg.entryKey, { signature, element });
      return { entryKey: leg.entryKey, element };
    });
  }, [
    legs,
    grabHandleHidden,
    headerExtras,
    navActionProgress,
    navActionLabel,
    onGrabHandlePress,
    onNavActionPress,
    plateHoles,
    surfaceColor,
    title,
    dividerStyle,
  ]);

  // Per-leg header: [spacer H][chrome band][leader]. The chrome TOUCH TWIN
  // renders ONLY in the presented leg (its ref feeds the pin; a hidden twin
  // would steal it); hidden legs reserve the same band height so their
  // content offsets stay comparable across flips.
  // THE TOUCH TWIN IS GONE. The header no longer renders inside the content —
  // it lives once, in the chrome slot, and redirects its own touches into this
  // scroll view (TrackShellSlotView hitTest). The content only RESERVES the
  // band so rows start below the chrome; nothing in here paints a header, so
  // two headers on screen is unrepresentable rather than merely avoided.
  // THE CHROME IS CONTENT. Every touch inside the scroll view is a potential
  // sheet drag, and UIScrollView's own delaysContentTouches /
  // canCancelContentTouches decides tap-vs-drag after MOVEMENT — which is the
  // old system's axis-locked pan, implemented by UIKit. A nested horizontal
  // scroller (the strip) wins horizontal by the same rule. None of that is
  // expressible while the chrome sits outside the scroll view, because
  // hitTest must choose at touch-DOWN, before direction exists.
  // THE RESIDENT CHROME STACK (strip red team, 2026-08-02). Rendering only
  // the presented chrome UNMOUNTED the strip on every strip<->plain switch:
  // the band came back as a fresh mount — blank white plate first, chips and
  // cutouts frames later ("the toggle strip switches first / does weird
  // stuff"). Every leg's chrome now stays mounted in the slot, absolutely
  // stacked, and WHICH ONE SHOWS flips by opacity in the SAME React commit as
  // the data swap — chips, holes, measurements and strip scroll state are
  // immortal, and header/rows can no longer change on different frames.
  const headerForLeg = (leg: TrackSheetLeg | null) => (
    <View style={styles.chromeLane}>
      <View style={{ height: trackH }} pointerEvents="none" />
      <TrackShellSlot slotRole="chromeContent" ref={chromeContentRef as never}>
        <View style={{ height: legChromeHeight(leg) }}>
          {visualChromeLegs.map((entry) => {
            const isPresented = entry.entryKey === presentedEntryKey;
            return (
              <View
                key={entry.entryKey}
                style={isPresented ? styles.chromeStackLayer : styles.chromeStackLayerHidden}
                pointerEvents={isPresented ? 'box-none' : 'none'}
              >
                {entry.element}
              </View>
            );
          })}
        </View>
      </TrackShellSlot>
      {leg?.listLeader != null ? (
        <View ref={leaderRef} collapsable={false}>
          {leg.listLeader}
        </View>
      ) : null}
    </View>
  );
  const legFooter = React.useMemo(
    () => (
      <View
        style={{
          // The tail must outlast any bounce: the list's own bottom edge must
          // never appear inside the sheet.
          height: footerHeight,
          backgroundColor: surfaceColor,
        }}
      />
    ),
    [footerHeight, surfaceColor]
  );

  // rowRendererCacheRef is declared above the chrome memo (its sweep needs it).
  const rendererForLeg = (leg: TrackSheetLeg) => {
    const cached = rowRendererCacheRef.current.get(leg.entryKey);
    if (
      cached != null &&
      cached.source.list.renderItem === leg.list.renderItem &&
      cached.source.rowSurfaceStyle === leg.rowSurfaceStyle
    ) {
      return cached.render;
    }
    const legRenderItem = leg.list.renderItem;
    const render = (info: never) => (
      <View style={[{ backgroundColor: surfaceColor }, leg.rowSurfaceStyle]}>
        {legRenderItem?.(info) ?? null}
      </View>
    );
    rowRendererCacheRef.current.set(leg.entryKey, { source: leg, render });
    return render;
  };

  const presentedRenderer = React.useMemo(
    () => (presentedLeg != null ? rendererForLeg(presentedLeg) : () => null),
    // rendererForLeg closes over surfaceColor/rowSurfaceStyle only.
    [presentedLeg, surfaceColor]
  );

  // THE SHORT-PAGE FILL LAW (ground-up, 2026-07-27): every detent must be
  // REACHABLE — UIKit clamps settles to (contentH − viewport), so a short page
  // silently forbids τ near H (the recurring τ≈225 mystery: an empty polls page
  // capped the track at its content edge and every spring settle was dragged
  // back there). The fill guarantees contentH ≥ spacer(H) + viewport.
  const handleContentSizeChange = React.useCallback(
    (entryKey: TrackEntryKey, height: number) => {
      // Only the PRESENTED leg's geometry feeds the physics (hidden legs are
      // display-detached; their sizes are not the sheet's).
      if (entryKey !== presentedEntryKeyRef.current) {
        return;
      }
      physics.contentHeight.value = height;
      // THE FILL IS MONOTONIC (thrash fix, 2026-07-27): the fill is derived
      // from a measurement the fill itself changes — a feedback loop that
      // oscillated content height MID-GESTURE (trace: 1702<->1522), and every
      // shrink made UIKit clamp the offset, killing the drag. Grow-only makes
      // the loop converge in one step by construction; the fill resets when
      // the DATA identity changes (a new page measures fresh).
      // REACHABILITY RE-ASSERT (profile mid-detent seat, 2026-07-28): a seat is
      // UNREACHABLE until content supports it — UIKit clamps any settle to
      // contentH − viewport. Bodies that grow after mount (profile: avatar,
      // stats, tabs) therefore seat SHORT, landing between detents. Whenever
      // the reachable range grows, re-assert the seat — unless the user has
      // taken posture, which always outranks the machine.
      // THE RANGE LAW (transition derivation VI): the ENGINE owns τ's legal
      // range natively, synchronously with every contentSize change — every
      // posture is always legal, so every seat is reachable by construction.
      // The JS inset and the reachability re-assert are DELETED, not moved.
    },
    [physics.contentHeight]
  );

  // ── THE FOUNDING LAYERS (red team 2, 2026-07-28) ───────────────────────────
  // The app's ONE frost founds the SHEET, not the chrome. It cannot be
  // full-bleed (it would frost the map above the sheet), so it is anchored to
  // sheetTop and runs unbounded downward — the sheet's material, in τ.
  // White is NOT a layer beneath the rows: nothing opaque may sit between a
  // row's plate and the frost, or every body cutout reveals white instead of
  // blur. White comes from the row plates themselves, and the tail below the
  // last row gets its own plate anchored at the content's end — so a short
  // page reads solid to the screen bottom and through any rubber band, with no
  // fabricated scroll length (R4/R5).

  // THE SWITCH FORMULA — applied synchronously at the switch commit, instant
  // (native refuse: restoring YOUR scroll is not motion). ENTRY-KEYED
  // (G-ENTRY): the memory + restore live in pure modules the jest lane
  // falsifies directly (track-entry-scroll-memory / track-entry-switch) — the
  // page only executes the plan.
  const entryScrollMemoryRef = React.useRef(new TrackEntryScrollMemory());
  const restoreCoordinatorRef = React.useRef(new TrackRestoreCoordinator());
  const presentedEntryKeyRef = React.useRef<TrackEntryKey>(presentedEntryKey);
  presentedEntryKeyRef.current = presentedEntryKey;
  const prevEntryKeyRef = React.useRef<TrackEntryKey | null>(presentedEntryKey);
  React.useLayoutEffect(() => {
    const entryKey = presentedEntryKey;
    const prev = prevEntryKeyRef.current;
    if (prev === entryKey) {
      return;
    }
    prevEntryKeyRef.current = entryKey;
    // THE ENTRY SWAP: one track, one scroll view, one posture. Nothing
    // attaches, re-binds, or changes owner — the sheet does not move because
    // there is nothing for it to move to. Only the data changes.
    // Save uses the JS mirrors — switches happen at rest, where the mirrors
    // are settled; the TARGET is deliberately NOT computed here (XII red
    // team 3: the mirrors lag the UI thread, and a stale target disarmed
    // the correct write). Native computes it with fresh τ/σ in refuse().
    const plan = planEntrySwitch({
      outgoingEntryKey: prev,
      incomingEntryKey: entryKey,
      tau: tau.value,
      trackH,
      sigma: physics.sigma.value,
      memory: entryScrollMemoryRef.current,
    });
    const nativePhysics = NativeModules.TrackScrollPhysics;
    executeEntrySwitch(plan, {
      saveOutgoing: (outgoingKey, offset) => entryScrollMemoryRef.current.save(outgoingKey, offset),
      // RE-ASSERT THE SHELL CONFIG (found by READING the switch path, 2026-08-02).
      // "Nothing re-binds on a switch" was right about POSITION — but bindShell
      // also carries per-scene CONFIG, and chromeHeight is scene-dependent
      // (strip scenes 108.25, plain 68.25). With applyPin only firing from
      // mount-time refs, a polls -> child switch left the band mask and the
      // stash band 40pt TALL (rows hidden under the shorter header), and the
      // reverse switch left them 40pt SHORT (rows painting into the strip band).
      // Idempotent, config-only: position still never moves on a switch.
      // ORDER LAW (A4): this — and with it the chrome/segment selection that
      // committed in THIS render — lands before the scroll restore below.
      applyChromeSelection: () => applyPinRef.current?.(),
      // A freshly mounted leg attaches async: arm the one-shot BEFORE the
      // immediate apply so the attach path can re-fuse it (and a later switch
      // supersedes it inside the coordinator).
      armRestore: (incomingKey, offset) =>
        restoreCoordinatorRef.current.schedule(incomingKey, offset),
      // THE SWITCH FORMULA, as originally derived — and correct again now that
      // there is ONE scroll view. refuse() re-fuses the sheet's CURRENT posture
      // with the incoming entry's remembered scroll, computing both natively
      // from fresh tau/sigma. It only ever misbehaved because N resident legs
      // meant it read posture from whichever view happened to be attached.
      applyRestore: (offset) => {
        if (nativePhysics?.refuse != null && trackTagRef.current != null) {
          nativePhysics.refuse(trackTagRef.current, offset);
        }
      },
    });
    if (__DEV__) {
      // THE SWITCH PERF PROBE: JS-thread stall around the switch commit —
      // time from this layout effect to the next TWO animation frames (the
      // first rAF fires after paint; the gap to the second exposes the stall).
      const t0 = Date.now();
      requestAnimationFrame(() => {
        const t1 = Date.now();
        requestAnimationFrame(() => {
          const t2 = Date.now();
          // eslint-disable-next-line no-console
          console.log(
            `[PERF] switch ${prev}->${entryKey} commit->paint=${t1 - t0}ms paint->next=${t2 - t1}ms`
          );
        });
      });
    }
  }, [presentedEntryKey, tau, trackH, attachToTag, applyPin, physics]);
  // Attach-gated one-shot (G-RESTORE c): the restore applies only after the
  // track attaches, only for the entry that scheduled it, at most once — a
  // remembered 0 still applies (consumeOnAttach returns 0, not null, for it).
  React.useEffect(
    () =>
      physics.subscribeAttached(() => {
        const offset = restoreCoordinatorRef.current.consumeOnAttach(presentedEntryKeyRef.current);
        const nativePhysics = NativeModules.TrackScrollPhysics;
        if (offset != null && nativePhysics?.refuse != null && trackTagRef.current != null) {
          nativePhysics.refuse(trackTagRef.current, offset);
        }
      }),
    [physics]
  );

  const [hud, setHud] = React.useState('');
  React.useEffect(() => {
    if (!debugHud) {
      return;
    }
    // Debug only, and slow: any JS-thread sampling of a moving sheet costs
    // smoothness (this HUD is why motion looked jittery with debug=1).
    const timer = setInterval(() => setHud(`τ=${Math.round(tau.value)}  H=${trackH}`), 1000);
    return () => clearInterval(timer);
  }, [debugHud, tau, trackH]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* THE SCROLL VIEW IS THE SHEET: content = [transparent spacer = sheet
          travel][chrome][body]; inset at expandedTop; transparent background so
          the map shows through the spacer region. No counter-translate, no
          mask, no surface overlay, no chrome overlay, no chromeGrab — the
          engine owns motion, bounds, pinning and tap-vs-drag. */}
      {/* THE FROST: RN pixels, native position (translateY = sheetTop each
          frame, written by the shell in scrollViewDidScroll). Carries the
          silhouette: r22 corners + the production shadow on the non-clipping
          wrapper. */}
      {/* THE SHADOW STAYS (owner correction 2026-07-29): the deleted thing is
          the 12% scrim, not the sheet's own top-edge shadow — shadowShell on
          the non-clipping wrapper so the corners don't eat it. */}
      {/* THE SLOT CARRIES NO PAINT (interop wrapper law, 2026-07-31): under
          Fabric interop, style paint lands on a WRAPPER view the engine does
          not transform — a background on the slot itself stays parked at y=0
          (the white blanket, named by the coverage walk). Geometry on the
          slot; every painted pixel on inner children. */}
      <TrackShellSlot slotRole="frost" style={styles.founding} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, overlaySheetStyles.shadowShell, styles.silhouette]}>
          <View style={[StyleSheet.absoluteFill, styles.silhouetteClip]}>
            <FrostedGlassBackground />
          </View>
        </View>
      </TrackShellSlot>
      {/* THE RESIDENT LEGS (residents-cutover F): per-scene lists, mounted on
          first visit, display-flipped. The presented leg is the live track;
          hidden legs emit no events, keep their cells warm, and cost no
          layout (display none). One chrome, one shell, one engine. */}
      {/* box-none is LOAD-BEARING (P12's sibling): under Fabric the legacy
          interop WRAPPER hit-tests, not our subclass — box-none makes the
          wrapper defer to the carve view, whose hitTest override rules. */}
      <TrackTouchCarve style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* THE ONE TRACK — literally one. Resident LEGS (a scroll view per
            scene) made posture a property of whichever view happened to be
            attached: N scroll views, N rival claims on where the sheet is, and
            every hard bug of this arc descended from reconciling them (the
            posture register, the switch transaction, leg adoption, ownership
            rules, the boot-seed race, the teleport). Residency is preserved
            where it actually pays — the scenes' data hooks live in the HOST
            and stay warm regardless of what is presented, and per-scene scroll
            is a remembered number restored by the switch formula. Only the
            row VIEWS re-render, which is what FlashList's recycler is for. */}
        <AnimatedFlashList
          ref={trackListRef as unknown as React.Ref<React.Component>}
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ paddingTop: geometry.expandedTop }}
          data={presentedLeg?.list.data ?? EMPTY_DATA}
          renderItem={presentedRenderer as never}
          keyExtractor={presentedLeg?.list.keyExtractor}
          getItemType={presentedLeg?.list.getItemType}
          ItemSeparatorComponent={presentedLeg?.list.ItemSeparatorComponent}
          ListEmptyComponent={presentedLeg?.list.ListEmptyComponent}
          onEndReached={presentedLeg?.list.onEndReached}
          onEndReachedThreshold={presentedLeg?.list.onEndReachedThreshold}
          extraData={presentedLeg?.list.extraData}
          drawDistance={SCREEN.height}
          maintainVisibleContentPosition={{ disabled: true }}
          renderScrollComponent={TrackScrollComponent}
          ListHeaderComponent={headerForLeg(presentedLeg)}
          ListFooterComponent={legFooter}
          showsVerticalScrollIndicator={false}
          bounces
          alwaysBounceVertical
          scrollEventThrottle={16}
          automaticallyAdjustContentInsets={false}
          // status-bar scroll-to-top targets contentOffset 0 = COLLAPSED sheet
          // in tau-space, not top-of-list; explicitly off (red team #5).
          scrollsToTop={false}
          onScroll={onScroll}
          onContentSizeChange={(_w: number, h: number) =>
            handleContentSizeChange(presentedEntryKey, h)
          }
        />
      </TrackTouchCarve>

      {/* THE TAIL: white below the content's end (translateY = max(sheetTop,
          contentEnd − τ), native) — the sheet is solid past any content end,
          through any bounce, with zero fabricated scroll length. */}
      <TrackShellSlot slotRole="tail" style={styles.founding} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: surfaceColor }]} />
      </TrackShellSlot>

      {debugHud ? (
        <View style={styles.hud} pointerEvents="none">
          <Reanimated.Text style={styles.hudText}>{hud}</Reanimated.Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  // OPACITY-DETACHED, not display:none (perf, measured): flipping display
  // forces a full Yoga relayout of the leg's whole subtree (~100ms on real
  // scenes); opacity is paint-only, so the flip costs nothing — the old
  // system's residents flipped exactly this way. Hidden legs keep layout,
  // take no touches, and emit no scroll events.
  // NO OPACITY HERE, EVER: leg visibility is the engine's (TrackLegSlot alpha,
  // flipped inside the switch transaction). A React opacity would multiply it
  // on the interop wrapper and fight the transaction.
  // The shadow must live on a view that does NOT clip, so the silhouette is a
  // shadow shell (radii, no overflow) wrapping a clipped frost.
  silhouette: {
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
  },
  silhouetteClip: {
    overflow: 'hidden',
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
  },
  // F878 (2026-08-03): `chromeLane: {}` — an EMPTY style carrying containment law
  // ("nothing renders above the sheet's top edge; a clip, not a reposition") that it does
  // not implement. The law is real and lives where it is enforced (the `chrome` clip
  // below); an empty rule reads as a knob someone can turn. Kept as a named style only
  // because the JSX still references it as a layout slot.
  chromeLane: {},
  founding: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SCREEN.height * 2,
  },
  // F878 (2026-08-03): a "Mask: transparent band over the chrome … alpha is the mask"
  // comment sat here for a mask that is GONE — the chrome is CONTENT now (see below).
  chrome: {
    // In CONTENT now (not an overlay): the sheet's top edge whenever pinned.
    width: '100%',
    // The plate is a square SVG — the chrome clips it to the sheet's corners
    // (owner: "the header is no longer rounded").
    overflow: 'hidden',
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
  },
  // F878 (2026-08-03): `headerBlock: {}` — the second empty style; same class as
  // `chromeLane` above. Retained as a JSX slot name, documented as carrying no rules.
  headerBlock: {},
  chromeStackLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  chromeStackLayerHidden: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  plateUnderlap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: -1 },
  grabWrapper: { alignItems: 'center', paddingTop: OVERLAY_GRAB_HANDLE_PADDING_TOP },
  grabHandle: {
    width: OVERLAY_GRAB_HANDLE_WIDTH,
    height: OVERLAY_GRAB_HANDLE_HEIGHT,
    borderRadius: OVERLAY_GRAB_HANDLE_RADIUS,
    // Transparent: the plate hole shows the frost through the handle slot.
    backgroundColor: 'transparent',
  },
  grabHandleHidden: { opacity: 0 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: OVERLAY_HEADER_ROW_MARGIN_TOP,
    marginBottom: OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    height: OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
  },
  titleSlot: { flex: 1, minWidth: 0, marginRight: 12, flexDirection: 'row', alignItems: 'center' },
  actionGroup: { flexDirection: 'row', alignItems: 'center' },
  headerBottomPad: { height: OVERLAY_HEADER_PADDING_BOTTOM },
  stripSeamFlow: { height: OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM },
  // Red team #2 mitigation: strips stay MOUNTED when the presented scene has
  // no band (zero-height, clipped) — flipping to a strip-less scene must not
  // destroy the resident strips' measure caches.
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  // The debug HUD pill (dev only, `debugHud`).
  // F878 (2026-08-03): this said "the TrackSheet surface is the one with the AMBER TOP
  // EDGE" — there is no amber edge; the pill below is plain dark. It also called this "the
  // parallel host", which stopped being true at the rung-5 flip (see F877).
  hud: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hudText: { color: '#f8fafc', fontSize: 14 },
});
