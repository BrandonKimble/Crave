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
function TrackShellSlot(
  props: ViewProps & { slotRole: 'frost' | 'chrome' | 'tail'; children?: React.ReactNode }
): React.ReactElement {
  const Native = TrackShellSlotNative as unknown as React.ComponentClass<Record<string, unknown>>;
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
  sceneKey: string;
  list: TrackSheetListProps<unknown>;
  listLeader?: React.ReactNode;
  rowSurfaceStyle?: ViewStyle;
  onUserListScrollActivity?: TrackSheetPhysicsOptions['onUserListScrollActivity'];
  /** PER-LEG CHROME (the residents centerpiece): each leg carries its OWN
   * touch chrome permanently — title + its strip — so the chrome never
   * changes parents on a flip and never remounts. Only the presented leg's
   * twin feeds the native pin. */
  title?: React.ReactNode;
  stripChildren?: React.ReactNode;
};

export type TrackSheetCommands = {
  /** Programmatic settle to a τ (detent) — rides the native scroll animation. */
  snapToTau: (tau: number, animated?: boolean) => void;
  /** Posture peeks (JS mirrors; used at rest for descriptor resolution). */
  readTau: () => number;
  readSigma: () => number;
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
  /** THE PERSISTENT STRIPS (residents rung 3): every resident scene's strip
   * band, mounted once and opacity-flipped with its leg — a strip never
   * remounts on switch, so its chips never re-measure and the late-chips gap
   * is unwritable. The presented scene's entry decides the band's presence. */
  strips?: Array<{ sceneKey: string; children: React.ReactNode }>;
  /** In-list leader content — scrolls away with the page (in-list strip mode). */
  listLeader?: React.ReactNode;
  /** Footer surface extension below the last row. */
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
  /** Scene identity for THE SWITCH FORMULA: on change, the outgoing scene's
   * list scroll (max(0, τ−H)) is saved and the incoming scene's is restored:
   * τ_new = min(τ, H) + listScroll(incoming). sheetTop is flat for τ ≥ H and
   * listScroll is nonzero only there, so the sheet PROVABLY cannot move on a
   * switch while every scene keeps its own scroll. */
  presentedSceneKey: string;
  /** THE SEAT (declarative): the desired resting τ. Re-asserted until reached —
   * on prop change, on native attach, and through recycler-mount races — and
   * CANCELLED the moment the user grabs the track (a seat is a target, never a
   * lock). null = no opinion (leave τ where it is). */
  seatTau?: number | null;
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
  strips = [],
  footerHeight = 160,
  legs,
  surfaceColor = '#ffffff',
  debugHud = false,
  commandsRef,
  seatTau = null,
  presentedSceneKey,
  publicationBindings,
  onGestureSettle,
  onSettle,
}: TrackSheetPageProps): React.ReactElement {
  // Pagination signals route to the PRESENTED leg only (hidden legs emit no
  // scroll events anyway; this keeps the physics hook identity stable).
  const presentedLegRef = React.useRef<TrackSheetLeg | null>(null);
  const presentedLeg = legs.find((leg) => leg.sceneKey === presentedSceneKey) ?? null;
  presentedLegRef.current = presentedLeg;
  const onUserListScrollActivity = React.useCallback((offsetY: number, distanceFromEnd: number) => {
    presentedLegRef.current?.onUserListScrollActivity?.(offsetY, distanceFromEnd);
  }, []);
  const physics = useTrackSheetPhysics(geometry, { onUserListScrollActivity });
  const { tau, trackH, sheetTopY, onScroll, attachToTag } = physics;
  const listLeader = presentedLeg?.listLeader ?? null;

  // THE SHORT-PAGE FILL (declared early; law documented at the handler below).
  // NOT mirrored into the ref on every render: the ref is the monotonic
  // accumulator and must only advance inside the handler.
  // Fresh page ⇒ fresh measurement: the accumulator resets when the data
  // identity changes, so a long page never inherits a short page's fill.

  // PRODUCTION CHROME GEOMETRY (acceptance inventory §1): the header block is
  // the exact un-rounded 68.25; strip scenes add band(32) + spacer(8).
  const presentedStrip = strips.find((entry) => entry.sceneKey === presentedSceneKey) ?? null;
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
  // one frame, zero lag between any two shell layers. The chrome TOUCH twin
  // stays in the content (pinChrome), where the band mask hides its pixels but
  // hit-testing survives — UIScrollView keeps owning tap-vs-drag for every
  // pixel of the sheet. MUST RE-ASSERT ON ATTACH: refs fire child-first and
  // the proxy may not exist on the first pass (same law as the seat).
  const applyPinRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => physics.subscribeAttached(() => applyPinRef.current?.()), [physics]);
  const trackTagRef = React.useRef<number | null>(null);
  const chromeTagRef = React.useRef<number | null>(null);
  const chromeVisualTagRef = React.useRef<number | null>(null);
  const frostTagRef = React.useRef<number | null>(null);
  const tailTagRef = React.useRef<number | null>(null);
  const applyPin = React.useCallback(() => {
    const nativePhysics = NativeModules.TrackScrollPhysics;
    if (trackTagRef.current == null) {
      return;
    }
    if (nativePhysics?.pinChrome != null) {
      nativePhysics.pinChrome(trackTagRef.current, chromeTagRef.current);
    }
    if (nativePhysics?.bindShell != null) {
      nativePhysics.bindShell(trackTagRef.current, {
        frostTag: frostTagRef.current,
        tailTag: tailTagRef.current,
        chromeTag: chromeVisualTagRef.current,
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
  const chromeVisualViewRef = React.useRef<View | null>(null);
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
          if (!audit.chromeBound) {
            problems.push('chrome UNBOUND');
          } else if (!audit.chromeAttached) {
            problems.push('chrome DETACHED (dead backing view)');
          } else if (
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
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applyPin]);
  // ── THE ORIGIN INVARIANT (RED-capable; this exact defect regressed 3x) ─────
  // The chrome IS the sheet's top edge, so its window y must equal sheetTopY.
  // It diverged by exactly expandedTop every time a layer applied that origin
  // twice — or, in the clip's case, applied the offset while its counter-offset
  // was silently dropped (FlashList ignores `top` in its style prop; MEASURED,
  // not assumed). A drift here is always an origin-ownership bug, so it barks
  // with both numbers rather than failing quietly on screen.
  const chromeViewRef = React.useRef<View | null>(null);
  React.useEffect(() => {
    if (!__DEV__) {
      return undefined;
    }
    // AT-REST ONLY (false-positive fix, 2026-07-29): measureInWindow is async,
    // so a moving sheet samples position and sheetTopY a frame apart — a 3pt
    // "drift" mid-settle is measurement skew, not an origin bug. Bark only when
    // two samples 600ms apart both drift AND the sheet did not move between
    // them (a real double-count is constant; skew is not).
    let cancelled = false;
    const sample = (onDrift: (drift: number, y: number) => void) => {
      const before = sheetTopY.value;
      chromeViewRef.current?.measureInWindow((_x, y) => {
        if (cancelled || sheetTopY.value !== before) {
          return; // moved while measuring — meaningless sample
        }
        const drift = Math.round(y - before);
        if (Math.abs(drift) > 1) {
          onDrift(drift, y);
        }
      });
    };
    const timer = setTimeout(() => {
      sample(() => {
        setTimeout(() => {
          sample((drift, y) => {
            // eslint-disable-next-line no-console
            console.error(
              `[ORIGIN] chrome window y (${Math.round(y)}) != sheetTopY (${Math.round(sheetTopY.value)}) — drift ${drift}pt; expandedTop=${Math.round(geometry.expandedTop)}. Some layer is applying the sheet origin twice, or dropping a counter-offset.`
            );
          });
        }, 600);
      });
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [geometry.expandedTop, sheetTopY]);

  applyPinRef.current = applyPin;

  // THE LEG REFS: one cached callback per scene; a mounting leg records its
  // tag, and if it is the PRESENTED leg the engine attaches to it (attach is
  // per-scroll-view, idempotent, retried) and the shell re-binds.
  const legTagsRef = React.useRef(new Map<string, number>());
  const legRefCacheRef = React.useRef(
    new Map<string, (instance: React.Component | null) => void>()
  );
  const legListRef = (sceneKey: string) => {
    let cb = legRefCacheRef.current.get(sceneKey);
    if (cb == null) {
      cb = (instance: React.Component | null) => {
        if (instance == null) {
          legTagsRef.current.delete(sceneKey);
          return;
        }
        const tag = findNodeHandle(instance);
        if (tag == null) {
          return;
        }
        legTagsRef.current.set(sceneKey, tag);
        if (sceneKey === presentedSceneKeyRef.current) {
          trackTagRef.current = tag;
          attachToTag(tag);
          applyPin();
        }
      };
      legRefCacheRef.current.set(sceneKey, cb);
    }
    return cb;
  };

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

  const cancelPendingSeat = React.useCallback(() => {
    seatTimerCancelRef.current?.();
  }, []);

  // ── THE SEAT: declarative re-asserting settle ──
  const seatTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (seatTau == null) {
      return;
    }
    let cancelled = false;
    let attempts = 0;
    // New seat target ⇒ the machine owns posture again until the next gesture.
    physics.userOwnsPosture.value = false;
    const assertSeat = () => {
      if (cancelled) {
        return;
      }
      // The user owns posture after ANY gesture — the seat never fights it
      // (the attach-listener re-arm was re-seating over user drags).
      if (physics.dragging.value || physics.userOwnsPosture.value) {
        return;
      }
      // THE SEAT IS POSTURE-SPACE, NOT τ-SPACE (attributed live 2026-07-29:
      // a restore to τ=916 was dragged back to H by an 'expanded' seat). A
      // seat targets sheetTop, and sheetTop is FLAT for τ ≥ H — so 'expanded'
      // (seatTau === trackH) is satisfied by ANY τ ≥ H. Compare postures
      // (min(τ, H)), never raw τ: the old system's seat moved sheetY only and
      // could not touch a page's scroll.
      if (Math.abs(Math.min(tau.value - physics.sigma.value, trackH) - seatTau) <= 1) {
        return;
      }
      physics.snapToTau(seatTau);
      attempts += 1;
      if (attempts < 15) {
        seatTimerRef.current = setTimeout(assertSeat, 250);
      }
    };
    assertSeat();
    // Re-assert on attach ONLY while the machine still owns posture (mount
    // races). Once the user has touched the sheet, attach re-asserts are
    // silent — the seat is a one-shot, never a leash.
    const unsubscribe = physics.subscribeAttached(() => {
      if (physics.userOwnsPosture.value) {
        return;
      }
      attempts = 0;
      assertSeat();
    });
    seatTimerCancelRef.current = () => {
      cancelled = true;
      if (seatTimerRef.current != null) {
        clearTimeout(seatTimerRef.current);
        seatTimerRef.current = null;
      }
    };
    return () => {
      cancelled = true;
      unsubscribe();
      seatTimerCancelRef.current = null;
      if (seatTimerRef.current != null) {
        clearTimeout(seatTimerRef.current);
      }
    };
  }, [physics, seatTau, tau]);

  // THE GESTURE CANCELS THE MACHINE (jerk fix): any pending seat retry or
  // in-flight programmatic spring dies the moment a finger lands — otherwise
  // the seat's spring and the drag fight for a few frames ("bounces back,
  // then continues once it realizes I'm swiping").
  const seatTimerCancelRef = React.useRef<(() => void) | null>(null);
  useAnimatedReaction(
    () => physics.dragging.value,
    (isDragging, was) => {
      if (isDragging && !was) {
        runOnJS(cancelPendingSeat)();
      }
    },
    [physics]
  );

  const pendingSnapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (commandsRef == null) {
      return;
    }
    commandsRef.current = {
      readTau: () => tau.value,
      readSigma: () => physics.sigma.value,
      // RETRYING SNAP (anti-trap, 2026-07-26): a scrollToOffset issued before the
      // recycler lays out is a silent no-op — the sheet sat at τ=0 while the OLD
      // sheet rendered the same page above it, and every visual check read the
      // wrong layer. Retry until τ actually reaches the target (or attempts cap).
      snapToTau: (tauTarget) => {
        if (pendingSnapTimer.current != null) {
          clearTimeout(pendingSnapTimer.current);
          pendingSnapTimer.current = null;
        }
        // Native spring settle (TrackScrollKit snapTo) — retry until τ moves
        // (a pre-attach call is a no-op; the recycler may still be mounting).
        let attempts = 0;
        const trySnap = () => {
          physics.snapToTau(tauTarget);
          attempts += 1;
          if (attempts < 12 && Math.abs(tau.value - tauTarget) > 1) {
            pendingSnapTimer.current = setTimeout(trySnap, 200);
          }
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
  }, [commandsRef, physics, tau]);

  // THE CHROME IS CONTENT (the scroll view IS the sheet): it sits right after
  // the spacer, so it shares the content's ONE motion source (no derived
  // transform ⇒ the wiggle is impossible), and it lives INSIDE the scroll view
  // ⇒ every touch on it — title, close, grab handle, strip chips — is a scroll
  // touch, so the whole sheet is grabbable by construction with UIScrollView's
  // own delaysContentTouches/cancelContentTouches as the tap-vs-drag rule.
  // TrackScrollKit pins it past H (native, same-frame).
  // THE VISUAL BAND: every resident strip mounted once, opacity-flipped;
  // PARKED (zero-height container, fixed-height layers) when the presented
  // scene has no band — children keep their layout, so un-parking is free.
  const visualBand =
    strips.length > 0 ? (
      <View
        style={
          presentedStrip != null ? { height: TOGGLE_STRIP_BAND_HEIGHT } : styles.stripBandParked
        }
      >
        {/* THE PERSISTENT STRIPS: every resident strip stays mounted in the
            band, opacity-flipped with its scene — no remount ⇒ no chip
            re-measure ⇒ the late-chips gap is unwritable. No plate of its
            own: chips paint directly over the frost. */}
        {strips.map((entry) => (
          <View
            key={entry.sceneKey}
            style={
              entry.sceneKey === presentedSceneKey ? styles.stripLayer : styles.stripLayerHidden
            }
            pointerEvents={entry.sceneKey === presentedSceneKey ? 'box-none' : 'none'}
          >
            <TrackSheetDockedStrip height={TOGGLE_STRIP_BAND_HEIGHT} plateColor="transparent">
              {entry.children}
            </TrackSheetDockedStrip>
          </View>
        ))}
      </View>
    ) : null;

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
      <MaskedHoleOverlay
        holes={plateHoles}
        backgroundColor={surfaceColor}
        renderWhenEmpty
        style={[styles.chromePlate, { height: OVERLAY_TAB_HEADER_HEIGHT }]}
      />
      {/* THE STRIP SEAM (polls gap fix): the 8pt spacer under the band is
              sheet material, not frost — it is part of the chrome plate's
              coverage, painted here so no gap can open between the band and
              the first row. */}
      {band != null ? (
        <View
          style={[
            styles.stripSeam,
            {
              top: OVERLAY_TAB_HEADER_HEIGHT + TOGGLE_STRIP_BAND_HEIGHT,
              backgroundColor: surfaceColor,
            },
          ]}
          pointerEvents="none"
        />
      ) : null}
      <View style={styles.grabWrapper}>
        <Pressable
          onPress={onGrabHandlePress}
          hitSlop={10}
          accessibilityLabel="Expand sheet"
          disabled={onGrabHandlePress == null}
        >
          <View style={[styles.grabHandle, grabHandleHidden && styles.grabHandleHidden]} />
        </Pressable>
      </View>
      <View style={styles.headerRow}>
        <View style={styles.titleSlot}>{chromeTitle}</View>
        <View style={styles.actionGroup}>
          {headerExtras}
          {navActionProgress != null && onNavActionPress != null ? (
            <HeaderNavAction
              progress={navActionProgress}
              onPress={onNavActionPress}
              accessibilityLabel={navActionLabel}
            />
          ) : null}
        </View>
      </View>
      {/* header block bottom padding — the 10 in 8+3.25+7+32+8+10=68.25 */}
      <View style={styles.headerBottomPad} />
      {band}
      <Reanimated.View style={[styles.divider, dividerStyle]} />
    </View>
  );
  // THE TWINS (per-leg chrome, the residents centerpiece): each leg carries
  // its OWN touch chrome permanently — it never changes parents on a flip, so
  // it never remounts and its strip's touch layer never re-measures. Only the
  // presented leg's twin feeds the pin (ref gated at fire time + on flip).
  // The VISUAL twin stays single in the stable overlay with the flip band.
  const legChromeTagsRef = React.useRef(new Map<string, number>());
  const legChromeRefCacheRef = React.useRef(new Map<string, (node: View | null) => void>());
  const legChromeRef = (sceneKey: string) => {
    let cb = legChromeRefCacheRef.current.get(sceneKey);
    if (cb == null) {
      cb = (node: View | null) => {
        if (node == null) {
          legChromeTagsRef.current.delete(sceneKey);
          return;
        }
        const tag = findNodeHandle(node);
        if (tag == null) {
          return;
        }
        legChromeTagsRef.current.set(sceneKey, tag);
        if (sceneKey === presentedSceneKeyRef.current) {
          chromeViewRef.current = node;
          chromeTagRef.current = tag;
          applyPin();
        }
      };
      legChromeRefCacheRef.current.set(sceneKey, cb);
    }
    return cb;
  };
  const touchChromeCacheRef = React.useRef(
    new Map<string, { leg: TrackSheetLeg; element: React.ReactElement }>()
  );
  const touchChromeForLeg = (leg: TrackSheetLeg) => {
    const cached = touchChromeCacheRef.current.get(leg.sceneKey);
    if (
      cached != null &&
      cached.leg.title === leg.title &&
      cached.leg.stripChildren === leg.stripChildren
    ) {
      return cached.element;
    }
    const band =
      leg.stripChildren != null ? (
        <View style={{ height: TOGGLE_STRIP_BAND_HEIGHT }}>
          <TrackSheetDockedStrip height={TOGGLE_STRIP_BAND_HEIGHT} plateColor="transparent">
            {leg.stripChildren}
          </TrackSheetDockedStrip>
        </View>
      ) : null;
    const element = renderChrome(
      legChromeRef(leg.sceneKey),
      leg.title ?? title,
      band,
      legChromeHeight(leg)
    );
    touchChromeCacheRef.current.set(leg.sceneKey, { leg, element });
    return element;
  };
  const chromeVisualElement = React.useMemo(
    () => renderChrome(null, presentedLeg?.title ?? title, visualBand, chromeHeight),
    [
      chromeHeight,
      strips,
      presentedStrip,
      grabHandleHidden,
      headerExtras,
      navActionProgress,
      navActionLabel,
      onGrabHandlePress,
      onNavActionPress,
      plateHoles,
      surfaceColor,
      title,
      presentedLeg,
      dividerStyle,
    ]
  );

  // Per-leg header: [spacer H][chrome band][leader]. The chrome TOUCH TWIN
  // renders ONLY in the presented leg (its ref feeds the pin; a hidden twin
  // would steal it); hidden legs reserve the same band height so their
  // content offsets stay comparable across flips.
  const headerForLeg = (leg: TrackSheetLeg, _isPresented: boolean) => (
    <View style={styles.chromeLane}>
      <View style={{ height: trackH }} pointerEvents="none" />
      {touchChromeForLeg(leg)}
      {leg.listLeader ?? null}
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

  // Per-leg row surface: each leg's renderItem wrapped once, memoized by leg
  // identity so resident legs keep stable cell identities across re-renders.
  const rowRendererCacheRef = React.useRef(
    new Map<string, { source: TrackSheetLeg; render: (info: never) => React.ReactElement }>()
  );
  const rendererForLeg = (leg: TrackSheetLeg) => {
    const cached = rowRendererCacheRef.current.get(leg.sceneKey);
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
    rowRendererCacheRef.current.set(leg.sceneKey, { source: leg, render });
    return render;
  };

  // THE SHORT-PAGE FILL LAW (ground-up, 2026-07-27): every detent must be
  // REACHABLE — UIKit clamps settles to (contentH − viewport), so a short page
  // silently forbids τ near H (the recurring τ≈225 mystery: an empty polls page
  // capped the track at its content edge and every spring settle was dragged
  // back there). The fill guarantees contentH ≥ spacer(H) + viewport.
  const handleContentSizeChange = React.useCallback(
    (sceneKey: string, height: number) => {
      // Only the PRESENTED leg's geometry feeds the physics (hidden legs are
      // display-detached; their sizes are not the sheet's).
      if (sceneKey !== presentedSceneKeyRef.current) {
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
  // (setOffset, never a spring: restoring YOUR scroll is not motion).
  const sceneScrollMemoryRef = React.useRef(new Map<string, number>());
  const presentedSceneKeyRef = React.useRef<string>(presentedSceneKey);
  presentedSceneKeyRef.current = presentedSceneKey;
  const prevSceneKeyRef = React.useRef<string | null>(presentedSceneKey);
  React.useLayoutEffect(() => {
    const sceneKey = presentedSceneKey;
    const prev = prevSceneKeyRef.current;
    if (prev === sceneKey) {
      return;
    }
    prevSceneKeyRef.current = sceneKey;
    // THE LEG FLIP: the engine attaches to the presented leg's scroll view
    // (attach is per-scroll-view, idempotent, retried); the shell re-binds to
    // it; refuse() then re-fuses posture + the leg's own scroll. A fresh
    // leg's proxy may attach async — subscribeAttached re-applies the restore.
    const nextTag = legTagsRef.current.get(sceneKey) ?? null;
    const nextChromeTag = legChromeTagsRef.current.get(sceneKey) ?? null;
    if (nextChromeTag != null) {
      chromeTagRef.current = nextChromeTag;
    }
    if (nextTag != null) {
      trackTagRef.current = nextTag;
      attachToTag(nextTag);
      applyPin();
    }
    const sigmaNow = physics.sigma.value;
    if (prev != null) {
      // The outgoing scroll = the stash (scroll carried by a header drag) plus
      // any live list scroll past the effective boundary.
      // Save uses the JS mirrors — switches happen at rest, where the mirrors
      // are settled; the TARGET is deliberately NOT computed here (XII red
      // team 3: the mirrors lag the UI thread, and a stale target disarmed
      // the correct write). Native computes it with fresh τ/σ in refuse().
      sceneScrollMemoryRef.current.set(prev, sigmaNow + Math.max(0, tau.value - trackH - sigmaNow));
    }
    const restored = sceneScrollMemoryRef.current.get(sceneKey) ?? 0;
    pendingRestoreRef.current = { sceneKey, restored };
    const nativePhysics = NativeModules.TrackScrollPhysics;
    if (nativePhysics?.refuse != null && trackTagRef.current != null) {
      nativePhysics.refuse(trackTagRef.current, restored);
    }
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
            `[PERF] switch ${prev}->${sceneKey} commit->paint=${t1 - t0}ms paint->next=${t2 - t1}ms`
          );
        });
      });
    }
  }, [presentedSceneKey, tau, trackH, attachToTag, applyPin]);
  // A freshly mounted leg attaches async: re-apply the pending restore once
  // the proxy exists (stamped by scene so a later switch cancels it).
  const pendingRestoreRef = React.useRef<{ sceneKey: string; restored: number } | null>(null);
  React.useEffect(
    () =>
      physics.subscribeAttached(() => {
        const pending = pendingRestoreRef.current;
        const nativePhysics = NativeModules.TrackScrollPhysics;
        if (
          pending != null &&
          pending.sceneKey === presentedSceneKeyRef.current &&
          nativePhysics?.refuse != null &&
          trackTagRef.current != null
        ) {
          nativePhysics.refuse(trackTagRef.current, pending.restored);
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
      {legs.map((leg) => {
        const isPresented = leg.sceneKey === presentedSceneKey;
        return (
          <View
            key={leg.sceneKey}
            style={isPresented ? styles.presentedLeg : styles.hiddenLeg}
            pointerEvents={isPresented ? 'auto' : 'none'}
          >
            <AnimatedFlashList
              ref={legListRef(leg.sceneKey) as unknown as React.Ref<React.Component>}
              style={StyleSheet.absoluteFill}
              contentContainerStyle={{ paddingTop: geometry.expandedTop }}
              data={leg.list.data}
              renderItem={rendererForLeg(leg) as never}
              keyExtractor={leg.list.keyExtractor}
              getItemType={leg.list.getItemType}
              ItemSeparatorComponent={leg.list.ItemSeparatorComponent}
              ListEmptyComponent={leg.list.ListEmptyComponent}
              onEndReached={leg.list.onEndReached}
              onEndReachedThreshold={leg.list.onEndReachedThreshold}
              extraData={leg.list.extraData}
              drawDistance={SCREEN.height}
              maintainVisibleContentPosition={{ disabled: true }}
              renderScrollComponent={TrackScrollComponent}
              ListHeaderComponent={headerForLeg(leg, isPresented)}
              ListFooterComponent={legFooter}
              showsVerticalScrollIndicator={false}
              bounces
              alwaysBounceVertical
              scrollEventThrottle={16}
              scrollEnabled={isPresented}
              onScroll={isPresented ? onScroll : undefined}
              automaticallyAdjustContentInsets={false}
              onContentSizeChange={(_w: number, h: number) =>
                handleContentSizeChange(leg.sceneKey, h)
              }
            />
          </View>
        );
      })}

      {/* THE TAIL: white below the content's end (translateY = max(sheetTop,
          contentEnd − τ), native) — the sheet is solid past any content end,
          through any bounce, with zero fabricated scroll length. */}
      <TrackShellSlot slotRole="tail" style={styles.founding} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: surfaceColor }]} />
      </TrackShellSlot>

      {/* THE CHROME VISUALS: pointerEvents none — every touch falls through to
          the track; the content twin supplies the buttons. Positioned natively
          at sheetTop, so chrome, frost and band mask agree every frame. */}
      <View style={styles.chromeOverlay} pointerEvents="none">
        <TrackShellSlot slotRole="chrome" pointerEvents="none">
          {chromeVisualElement}
        </TrackShellSlot>
      </View>

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
  presentedLeg: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  hiddenLeg: { ...StyleSheet.absoluteFillObject, opacity: 0, zIndex: 0 },
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
  // Containment (R6): nothing renders above the sheet's top edge. A clip, not
  // a reposition — the track inside is counter-offset so nothing shifts.
  chromeLane: { zIndex: 60 },
  chromeOverlay: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 60 },
  founding: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SCREEN.height * 2,
  },
  // Mask: transparent band over the chrome (content hidden there), opaque
  // below (content visible). Colors are irrelevant — alpha is the mask.
  chrome: {
    // In CONTENT now (not an overlay): the sheet's top edge whenever pinned.
    width: '100%',
    // The plate is a square SVG — the chrome clips it to the sheet's corners
    // (owner: "the header is no longer rounded").
    overflow: 'hidden',
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
  },
  chromePlate: { position: 'absolute', top: 0, left: 0, right: 0 },
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
  stripSeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM,
  },
  // Red team #2 mitigation: strips stay MOUNTED when the presented scene has
  // no band (zero-height, clipped) — flipping to a strip-less scene must not
  // destroy the resident strips' measure caches.
  stripBandParked: { height: 0, overflow: 'hidden' },
  // Fixed height (not absoluteFill): layers keep their layout inside a parked
  // zero-height container, so un-parking costs no re-measure.
  stripLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: TOGGLE_STRIP_BAND_HEIGHT },
  stripLayerHidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: TOGGLE_STRIP_BAND_HEIGHT,
    opacity: 0,
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  // Layer marker (debug builds of the parallel host): the TrackSheet surface is
  // the one with the amber top edge — never confuse it with the old sheet again.
  debugEdge: { borderTopWidth: 3, borderTopColor: '#f59e0b' },
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
