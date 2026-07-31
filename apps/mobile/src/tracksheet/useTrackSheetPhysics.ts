import React from 'react';
import { findNodeHandle, NativeEventEmitter, NativeModules } from 'react-native';
import {
  runOnJS,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

// ─── THE ONE TRACK physics (plans/page-composition-from-scratch-design.md) ─────
//
// One native UIScrollView is the ONLY motion engine: sheet travel and list
// scroll are one continuous track. τ = contentOffset.y; τ ∈ [0,H) is sheet
// travel (spacer region), τ ≥ H scrolls the page's content. Every visual is a
// pure derivation of τ + phase. The TrackScrollKit native hatch owns releases:
//   - sheet-region release → detent settle on a critically damped native spring
//     (THE BALLISTIC WALL: momentum born in the sheet may never cross H);
//   - list-region release → free momentum; the crossing intercept catches the
//     exact frame the offset crosses H and drives the native rubber spring
//     (velocity-continuous top bounce); bottom edge bounces natively.
// The proxy re-wraps itself via KVO when Fabric replaces the delegate — attach
// is one-shot durable (the FlashList lesson). The CHROME is content inside this
// same scroll view (see TrackSheetPage) and is pinned natively past H, so there
// is no chrome region and no second input surface — one track, one engine.

export type TrackSheetGeometry = {
  /** Sheet top edge (screen y) when fully expanded. */
  expandedTop: number;
  /** Sheet top edge (screen y) when collapsed. */
  collapsedTop: number;
  /** Sheet top edges (screen y) of every detent, expanded → collapsed order or any. */
  detentTops: number[];
};

export type TrackSheetPhysics = {
  /** The one track variable (contentOffset.y). */
  tau: SharedValue<number>;
  /** Sheet travel span: collapsedTop − expandedTop; τ=H ⇔ fully expanded. */
  trackH: number;
  /** Detents in τ-space (0 = collapsed). */
  detentTaus: number[];
  /** Finger down on the track. */
  dragging: SharedValue<boolean>;
  /** Ballistic phase entered from the list region (sub-H excursion = bounce, not travel). */
  ballisticFromList: SharedValue<boolean>;
  /** The sheet's top edge (screen y) — THE derivation every surface rides. */
  sheetTopY: Readonly<SharedValue<number>>;
  /** Scroll handler to install on the track's Animated scroll component. */
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  /** Ref callback target: the component whose subtree holds the UIScrollView. */
  attachToTag: (tag: number | null) => void;
  /** Programmatic settle to a τ — rides the same native critically damped spring. */
  snapToTau: (tau: number) => void;
  /** Fires after each successful native attach (seat re-assertion hook). */
  subscribeAttached: (listener: () => void) => () => void;
  /** Written by the page's onContentSizeChange (scroll events carry no contentSize). */
  contentHeight: SharedValue<number>;
  /** THE STASH σ — native-owned effective-boundary shift (H+σ). */
  sigma: SharedValue<number>;
  /** Latches true on the first user gesture; the seat must not re-assert while
   * set (a seat is a target, never a lock). Cleared by the page on seat change. */
  userOwnsPosture: SharedValue<boolean>;
};

const SPACER_EPSILON = 0.5;

export type TrackSheetPhysicsOptions = {
  /** Production pagination signal (sceneBodyTransport.onUserListScrollActivity):
   * fired from real user scrolls in the LIST region with the list-space offset
   * (τ−H) and distance-from-end. Throttled; JS thread. */
  onUserListScrollActivity?: (offsetY: number, distanceFromEnd: number) => void;
};

export const useTrackSheetPhysics = (
  geometry: TrackSheetGeometry,
  options?: TrackSheetPhysicsOptions
): TrackSheetPhysics => {
  const trackH = geometry.collapsedTop - geometry.expandedTop;
  const detentTaus = React.useMemo(
    () => geometry.detentTops.map((top) => geometry.collapsedTop - top).sort((a, b) => a - b),
    [geometry.collapsedTop, geometry.detentTops]
  );

  const tau = useSharedValue(0);
  const dragging = useSharedValue(false);
  const userOwnsPosture = useSharedValue(false);
  const ballisticFromList = useSharedValue(false);
  /** Track content height (written by the page's onContentSizeChange — the
   * scroll event's contentSize is NULL in Reanimated events, banked lore). */
  const contentHeight = useSharedValue(0);
  /** THE STASH σ (transition derivation XI): native-owned; mirrored here so
   * every τ-consumer (sheetTopY, divider, settles, seats, the switch formula)
   * reads the EFFECTIVE boundary H+σ. Written only by the native events. */
  const sigma = useSharedValue(0);
  const lastActivityAt = useSharedValue(0);
  const onUserListScrollActivity = options?.onUserListScrollActivity;

  const sheetTopY = useDerivedValue(() =>
    ballisticFromList.value
      ? geometry.expandedTop
      : geometry.expandedTop + Math.max(0, trackH + sigma.value - tau.value)
  );

  // ── Native hatch attach (durable; retries cover a recycler's late mount) ──
  const attachedTagRef = React.useRef<number | null>(null);
  const attachedListenersRef = React.useRef(new Set<() => void>());
  const subscribeAttached = React.useCallback((listener: () => void) => {
    attachedListenersRef.current.add(listener);
    return () => {
      attachedListenersRef.current.delete(listener);
    };
  }, []);
  const attachToTag = React.useCallback(
    (tag: number | null) => {
      const physics = NativeModules.TrackScrollPhysics;
      if (physics?.attach == null || tag == null) {
        return;
      }
      attachedTagRef.current = tag;
      let attempt = 0;
      const tryAttach = () => {
        if (attachedTagRef.current !== tag) {
          return;
        }
        physics
          .attach(tag, {
            ballisticEdge: trackH,
            snapRegionEnd: trackH,
            snapOffsets: detentTaus,
          })
          .then(() => {
            if (__DEV__) {
              console.log(`[TRACKDBG] attach ok (attempt ${attempt})`);
            }
            attachedListenersRef.current.forEach((listener) => listener());
          })
          .catch(() => {
            attempt += 1;
            // UNCAPPED with backoff (post-flip lesson): the host now mounts at
            // BOOT, and the recycler can appear later than any fixed cap — a
            // dead attach means no physics at all.
            if (__DEV__ && attempt % 10 === 0) {
              console.log(`[TRACKDBG] attach retrying (attempt ${attempt})`);
            }
            setTimeout(tryAttach, Math.min(1000, 150 * Math.ceil(attempt / 5)));
          });
      };
      tryAttach();
    },
    [detentTaus, trackH]
  );
  React.useEffect(() => {
    const physics = NativeModules.TrackScrollPhysics;
    if (physics?.attach == null) {
      return;
    }
    const emitter = new NativeEventEmitter(physics);
    // Debug probe only: the bounce itself is fully native (the module drives
    // contentOffset along the rubber spring; τ genuinely dips below H).
    const sigmaListener = emitter.addListener(
      'trackSigmaChanged',
      ({ sigma: nextSigma }: { sigma: number }) => {
        sigma.value = nextSigma;
      }
    );
    const shellWarning = emitter.addListener(
      'trackShellWarning',
      ({ part, tag }: { part: string; tag: number }) => {
        // eslint-disable-next-line no-console
        console.error(
          `[SHELL] bindShell could not resolve the ${part} view (tag ${tag}) — that layer will NEVER be positioned (header-at-screen-top class). The bind must be re-asserted with a live tag.`
        );
      }
    );
    const arrival = emitter.addListener('trackTopArrival', ({ velocity, overshoot }) => {
      if (__DEV__) {
        console.log(
          `[TRACKDBG] topArrival v=${Math.round(velocity)}pt/s overshoot=${Math.round(overshoot)}pt (native spring)`
        );
      }
    });
    return () => {
      shellWarning.remove();
      sigmaListener.remove();
      arrival.remove();
      const tag = attachedTagRef.current;
      attachedTagRef.current = null;
      if (tag != null) {
        physics.detach?.(tag);
      }
    };
  }, []);
  const snapToTau = React.useCallback((tauTarget: number) => {
    const physics = NativeModules.TrackScrollPhysics;
    const tag = attachedTagRef.current;
    if (physics?.snapTo != null && tag != null) {
      physics.snapTo(tag, tauTarget);
    }
  }, []);
  const reassertAttach = React.useCallback(() => {
    const tag = attachedTagRef.current;
    if (tag != null) {
      attachToTag(tag);
    }
  }, [attachToTag]);

  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        tau.value = event.contentOffset.y;
        if (
          onUserListScrollActivity != null &&
          event.contentOffset.y > trackH + sigma.value &&
          contentHeight.value > 0
        ) {
          const now = Date.now();
          if (now - lastActivityAt.value >= 120) {
            lastActivityAt.value = now;
            const offsetY = event.contentOffset.y - trackH - sigma.value;
            const distanceFromEnd =
              contentHeight.value - (event.contentOffset.y + event.layoutMeasurement.height);
            runOnJS(onUserListScrollActivity)(offsetY, distanceFromEnd);
          }
        }
      },
      onBeginDrag: () => {
        userOwnsPosture.value = true;
        // Belt-and-braces: KVO already keeps the proxy wrapped; a JS re-assert
        // per gesture costs nothing and covers a detach-race.
        runOnJS(reassertAttach)();
        dragging.value = true;
        ballisticFromList.value = false;
      },
      onEndDrag: (event) => {
        dragging.value = false;
        ballisticFromList.value = event.contentOffset.y >= trackH + sigma.value - SPACER_EPSILON;
      },
    },
    [contentHeight, lastActivityAt, onUserListScrollActivity, reassertAttach, trackH]
  );

  // STABLE IDENTITY (feel-bug root cause, 2026-07-26): consumers key effects on
  // this object — a fresh literal per render re-ran the SEAT effect on every
  // HUD tick, clearing the user-owns-posture latch and re-snapping the sheet
  // 4x/second ("bounces back, won't stay at any snap point").
  return React.useMemo(
    () => ({
      tau,
      trackH,
      detentTaus,
      dragging,
      ballisticFromList,
      sheetTopY,
      onScroll,
      attachToTag,
      snapToTau,
      subscribeAttached,
      contentHeight,
      userOwnsPosture,
      sigma,
    }),
    [
      tau,
      trackH,
      detentTaus,
      dragging,
      ballisticFromList,
      sheetTopY,
      onScroll,
      attachToTag,
      snapToTau,
      subscribeAttached,
      contentHeight,
      userOwnsPosture,
      sigma,
    ]
  );
};
