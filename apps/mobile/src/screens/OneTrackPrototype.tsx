import React from 'react';
import {
  Dimensions,
  findNodeHandle,
  Linking,
  NativeEventEmitter,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';

import MaskedHoleOverlay from '../components/MaskedHoleOverlay';
import Reanimated, {
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

// ─── THE ONE TRACK — feel prototype (design doc "THE ONE TRACK", build law §7) ──────
//
// Dev-only overlay proving the track model on ONE native UIScrollView before any
// production migration: sheet travel + list scroll as one continuous scroll; native
// bounce both ends; the ballistic lower bound flipping to the list top on release
// (momentum bounces instead of collapsing the sheet); detent snaps only inside the
// spacer region. Open with:
//   crave://one-track-proto?show=1     (hide: show=0, toggle: no param)
//
// The prototype answers (RED-capable, by feel + the τ readout):
//   U1 spacer mechanics (static full-travel spacer; no re-basing on the happy path)
//   U2 ballistic clamp at H via contentInset flip on drag end
//   U3 detent snap via animated scrollTo (native ease — spring fidelity comes later
//      via the native-module hatch if this reads as enough)
//   U4 velocity continuity crossing H finger-down (one gesture, one engine)
//   U5 is FlashList's exam, NOT this file's — rows here are plain views on purpose.

const DEEP_LINK_HOST = 'one-track-proto';

const SCREEN = Dimensions.get('window');
// Detents in screen-space (sheet top edge y).
const EXPANDED_TOP = 120;
const MIDDLE_TOP = Math.round(SCREEN.height * 0.55);
const COLLAPSED_TOP = Math.round(SCREEN.height * 0.85);
// The track: τ ∈ [0, H] is sheet travel (0=collapsed, H=expanded); τ>H scrolls rows.
const H = COLLAPSED_TOP - EXPANDED_TOP;
const DETENT_TAUS = [0, COLLAPSED_TOP - MIDDLE_TOP, H];
const ROW_COUNT = 40;
const ROW_DATA = Array.from({ length: ROW_COUNT }, (_, index) => index);
const ROW_HEIGHT = 76;

const AnimatedScrollView = Reanimated.ScrollView;
// U5 — THE FLASHLIST EXAM: the track's list layer must be a real recycler. Same
// track, same hatch; the spacer rides as ListHeaderComponent. MVCP is DISABLED
// (re-sortable feeds anchor the old top row and scroll the chrome away — banked
// lesson) — on the one track the spacer means offset 0 is SHEET-collapsed, and
// any MVCP anchoring would fight sheet travel.
const AnimatedFlashList = Reanimated.createAnimatedComponent(
  FlashList as unknown as React.ComponentClass<Record<string, unknown>>
);
// THE VIRTUALIZATION LAW (U5, RED-proven): FlashList's own recycler handler rides
// the INNER scroll component's onScroll — with a bare inner ScrollView, Reanimated's
// outer worklet interception starves it and cells stop materializing (blank viewport
// at deep τ). The production cure: the inner scroll component must itself be an
// Animated ScrollView (renderScrollComponent), so the recycler's JS handler and the
// worklet stream coexist — exactly BottomSheetScrollContainer's shape.
const TrackScrollComponent = React.forwardRef<Reanimated.ScrollView, Record<string, unknown>>(
  (props, ref) => <Reanimated.ScrollView {...props} ref={ref} />
);
TrackScrollComponent.displayName = 'TrackScrollComponent';

// Docked strip band (production composition, miniaturized): a WHITE PLATE with
// chip-shaped holes punched through to the frost — the same MaskedHoleOverlay the
// header cutout plate / cutout skeletons use. Rows scrolling under the band vanish
// behind the plate; the chips read as windows straight through to the frost.
const STRIP_LABELS = ['Sort', 'Restaurants', 'Dishes', 'Open now'];
const STRIP_BAND_HEIGHT = 54;
const STRIP_PAD_X = 16;
const STRIP_PAD_Y = 11;
const SHEET_CORNER_RADIUS = 24;

export const OneTrackPrototype: React.FC = () => {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes(DEEP_LINK_HOST)) {
        return;
      }
      const show = /[?&]show=(1|true|on|yes)/i.test(url);
      const hide = /[?&]show=(0|false|off|no)/i.test(url);
      setVisible((prev) => (hide ? false : show ? true : !prev));
    };
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  if (!visible) {
    return null;
  }
  return <OneTrackSurface onClose={() => setVisible(false)} />;
};

const OneTrackSurface: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const scrollRef = React.useRef<FlashList<number> | null>(null);
  // THE TOP-EDGE DIP (owner-confirmed gap): the H boundary is synthesized mid-flight,
  // so UIScrollView clamps instead of bouncing (the bottom edge, engine-known from
  // gesture start, bounces natively). Until the native-module hatch makes H an
  // engine-known edge at willEndDragging time, ballistic arrival at H converts its
  // velocity into a synthesized dip on the same native constants (critically damped,
  // the rebound the owner already accepted in the earlier arc).
  const topDip = useSharedValue(0);
  const dipFired = useSharedValue(false);
  // Ballistic energy accounting: with the inset bound armed, UIScrollView RE-TARGETS
  // its deceleration to end exactly at H (eased arrival, v≈0) — so the dip velocity
  // must be computed AT RELEASE from the standard decel model (projection = v·0.499
  // for the normal rate), i.e. the speed the flick WOULD have carried through H.
  const pendingDipVelocity = useSharedValue(0);

  const [nativeHatch, setNativeHatch] = React.useState(false);
  React.useEffect(() => {
    const physics = NativeModules.TrackScrollPhysics;
    if (physics?.attach == null) {
      return;
    }
    // Recyclers mount their inner UIScrollView a beat after first render — the
    // attach RETRIES until the DFS finds it (and the per-drag re-assert keeps it).
    let cancelled = false;
    const tryAttach = (attempt: number) => {
      if (cancelled) {
        return;
      }
      const tag = findNodeHandle(scrollRef.current as unknown as React.Component);
      if (tag == null) {
        if (attempt < 10) {
          setTimeout(() => tryAttach(attempt + 1), 150);
        }
        return;
      }
      physics
        .attach(tag, { ballisticEdge: H, snapRegionEnd: H, snapOffsets: DETENT_TAUS })
        .then(() => {
          console.log(`[TRACKDBG] attach ok (attempt ${attempt})`);
          setNativeHatch(true);
        })
        .catch((e: unknown) => {
          if (attempt < 10) {
            setTimeout(() => tryAttach(attempt + 1), 150);
          } else {
            console.log(`[TRACKDBG] attach FAILED: ${String(e)}`);
            setNativeHatch(false);
          }
        });
    };
    tryAttach(0);
    const emitter = new NativeEventEmitter(physics);
    const arrival = emitter.addListener('trackTopArrival', ({ velocity, overshoot }) => {
      // Debug probe only: the bounce is NATIVE now. The module catches the
      // H-crossing and drives contentOffset itself along the rubber curve, so tau
      // genuinely dips below H and returns — every derivation reads the one track
      // variable; there is no JS motion source on the ballistic top edge.
      console.log(
        `[TRACKDBG] topArrival v=${Math.round(velocity)}pt/s overshoot=${Math.round(overshoot)}pt (native spring)`
      );
    });
    return () => {
      cancelled = true;
      arrival.remove();
      const tag = findNodeHandle(scrollRef.current as unknown as React.Component);
      if (tag != null) {
        physics.detach?.(tag);
      }
    };
  }, [pendingDipVelocity, scrollRef, topDip]);
  const nativeHatchRef = React.useRef(nativeHatch);
  nativeHatchRef.current = nativeHatch;
  const reassertHatch = React.useCallback(() => {
    const physics = NativeModules.TrackScrollPhysics;
    const tag = findNodeHandle(scrollRef.current as unknown as React.Component);
    if (physics?.attach != null && tag != null) {
      physics
        .attach(tag, { ballisticEdge: H, snapRegionEnd: H, snapOffsets: DETENT_TAUS })
        .catch(() => undefined);
    }
  }, [scrollRef]);
  const nativeHatchSV = useSharedValue(false);
  React.useEffect(() => {
    nativeHatchSV.value = nativeHatch;
  }, [nativeHatch, nativeHatchSV]);
  const tau = useSharedValue(0);
  const dragging = useSharedValue(false);
  // THE PHASE-DEPENDENT BOUND (boundary law): finger down ⇒ full track [0,end];
  // ballistic ⇒ lower bound H (momentum bounces at the list top, never collapses
  // the sheet). contentInset.top = -H makes offset H the native bounce edge.
  const ballisticClamp = useSharedValue(false);
  // Phase gate for the derivations: a ballistic release from the list region means
  // any sub-H excursion is the NATIVE BOUNCE (overscroll area — header stays pinned),
  // never sheet travel. Finger-down lifts it (sub-H is the grab again).
  const ballisticFromList = useSharedValue(false);
  const [tauReadout, setTauReadout] = React.useState('τ=0');
  const [chipHoles, setChipHoles] = React.useState<
    { x: number; y: number; width: number; height: number; borderRadius: number }[]
  >([]);
  const chipRectsRef = React.useRef(
    new Map<number, { x: number; y: number; width: number; height: number }>()
  );
  const onChipLayout = React.useCallback((index: number, e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    chipRectsRef.current.set(index, e.nativeEvent.layout);
    if (chipRectsRef.current.size === STRIP_LABELS.length) {
      setChipHoles(
        Array.from(chipRectsRef.current.entries())
          .sort(([a2], [b2]) => a2 - b2)
          .map(([, rect]) => ({
            // onLayout x/y are parent-relative and already include the row padding.
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            borderRadius: rect.height / 2,
          }))
      );
    }
  }, []);

  const lastReleasePhaseRef = React.useRef('');
  const publishReadout = React.useCallback((value: number, phase: string) => {
    if (phase.startsWith('native-hatch') || phase.startsWith('ballistic') || phase === 'snap') {
      lastReleasePhaseRef.current = phase;
    }
    const suffix = phase === 'settled' ? `settled [${lastReleasePhaseRef.current}]` : phase;
    setTauReadout(`τ=${Math.round(value)}  H=${H}  ${suffix}`);
  }, []);

  const snapToDetent = React.useCallback(
    (fromTau: number, velocityGuess: number) => {
      // Velocity-aware nearest detent (constants from the arc's proven feel work).
      const projected = fromTau + velocityGuess * 0.18;
      let best = DETENT_TAUS[0];
      for (const detent of DETENT_TAUS) {
        if (Math.abs(detent - projected) < Math.abs(best - projected)) {
          best = detent;
        }
      }
      scrollRef.current?.scrollToOffset({ offset: best, animated: true });
    },
    [scrollRef]
  );

  const lastTau = useSharedValue(0);
  const lastDelta = useSharedValue(0);
  const prevDelta = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const next = event.contentOffset.y;
        prevDelta.value = lastDelta.value;
        lastDelta.value = next - lastTau.value;
        lastTau.value = next;
        tau.value = next;
        // Ballistic arrival at the list top: fire the dip once per episode. Arrival
        // speed derives from our own offset deltas (event.velocity is a proven liar).
        if (
          ballisticClamp.value &&
          !dragging.value &&
          !dipFired.value &&
          pendingDipVelocity.value > 0 &&
          next <= H + 3
        ) {
          dipFired.value = true;
          // Nudge off exact zero: withSpring(to=0) from value 0 can early-exit as
          // "settled" and swallow the initial velocity (Reanimated completion check).
          topDip.value = 0.5;
          topDip.value = withSpring(0, {
            mass: 1,
            stiffness: 170,
            damping: 26,
            velocity: pendingDipVelocity.value,
          });
          pendingDipVelocity.value = 0;
        }
      },
      onBeginDrag: () => {
        runOnJS(reassertHatch)();
        dragging.value = true;
        ballisticClamp.value = false;
        ballisticFromList.value = false;
        dipFired.value = false;
        topDip.value = 0;
        runOnJS(publishReadout)(tau.value, 'drag');
      },
      onEndDrag: (event) => {
        dragging.value = false;
        ballisticFromList.value = event.contentOffset.y >= H;
        if (nativeHatchSV.value) {
          ballisticClamp.value = event.contentOffset.y >= H;
          // THE NATIVE HATCH OWNS THE RELEASE: bounds + detent targeting happen in
          // scrollViewWillEndDragging (engine-known edge => REAL bounce at H; detents
          // ride targetContentOffset). The JS synthesis below is fallback-only.
          runOnJS(publishReadout)(event.contentOffset.y, 'native-hatch');
          return;
        }
        const releasedTau = event.contentOffset.y;
        if (releasedTau < H) {
          // Spacer region: the detent snap owns the release (native decel would
          // drift the sheet — detents are the law here). Velocity from our own
          // delta tracking (event.velocity is a proven liar).
          runOnJS(snapToDetent)(releasedTau, lastDelta.value * 60);
          runOnJS(publishReadout)(releasedTau, 'snap');
        } else {
          // List region: free native momentum, but the lower bound flips to H so
          // an arriving flick stops at the list top (owner case a) — and if the
          // release energy WOULD have overshot H, bank the through-edge velocity
          // for the synthesized dip on arrival (v_arr = v·√(1 − d/p), constant-decel
          // model with projection p = v·0.499 at the normal rate).
          ballisticClamp.value = true;
          const releaseVelocity = Math.max(-lastDelta.value, -prevDelta.value) * 60;
          const distanceToEdge = releasedTau - H;
          const projection = releaseVelocity * 0.499;
          if (releaseVelocity > 0 && projection > distanceToEdge) {
            pendingDipVelocity.value =
              releaseVelocity * Math.sqrt(Math.max(0, 1 - distanceToEdge / projection));
          } else {
            pendingDipVelocity.value = 0;
          }
          runOnJS(publishReadout)(
            releasedTau,
            `ballistic v=${Math.round(releaseVelocity)} bank=${Math.round(pendingDipVelocity.value)}`
          );
        }
      },
      onMomentumEnd: () => {
        runOnJS(publishReadout)(tau.value, 'settled');
      },
    },
    [publishReadout, reassertHatch, snapToDetent]
  );

  const clampProps = useAnimatedProps(() => ({
    // Fallback-only bound: in native-hatch mode the track is NEVER inset-bounded —
    // the proxy's crossing intercept owns the top edge (bounding would make UIKit
    // re-target and EASE into H, the settle-then-jerk the owner rejected).
    contentInset: {
      top: ballisticClamp.value && !nativeHatchSV.value ? -H : 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
  }));

  // DERIVATIONS (each a pure function of τ — the model's §2 list, miniaturized):
  const sheetTopY = useDerivedValue(() =>
    ballisticFromList.value ? EXPANDED_TOP : EXPANDED_TOP + Math.max(0, H - tau.value)
  );
  const dipStyle = useAnimatedStyle(() => ({ transform: [{ translateY: topDip.value }] }));
  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTopY.value }],
  }));
  const dividerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tau.value - H, [0, 3, 14], [0, 0.35, 1], 'clamp'),
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tau.value, [0, H], [0.15, 0.55], 'clamp'),
  }));
  // THE WORLD MASK: the region above the sheet's top edge IS the map — scroll
  // content may never surface there. A map-replica cover from y=0 down to the
  // sheet top (pure derivation of sheetTopY; replicates map + dim exactly so
  // it is invisible as a layer).
  const worldMaskStyle = useAnimatedStyle(() => ({ height: sheetTopY.value }));
  // THE OVERSCROLL BLEED: during a ballistic bounce the sheet's surface streches
  // above its content top — the reveal is SHEET MATERIAL (solid white), never
  // the content's edge. Phase-derived: only exists while ballistic-from-list.
  const bleedStyle = useAnimatedStyle(() => ({
    opacity: ballisticFromList.value ? 1 : 0,
  }));

  // The track's content, recycler edition: spacer (sheet travel region) + the
  // sheet's top cap ride as the list header; every row paints on sheet white;
  // the footer extends the surface past the last row.
  const listHeader = React.useMemo(
    () => (
      <View>
        <View style={{ height: H }} pointerEvents="none" />
        <Reanimated.View style={[styles.overscrollBleed, bleedStyle]} pointerEvents="none" />
        <View style={styles.sheetCap} />
      </View>
    ),
    [bleedStyle]
  );
  const listFooter = React.useMemo(() => <View style={styles.sheetFooter} />, []);
  const renderRow = React.useCallback(
    ({ item }: { item: number }) => (
      <View style={styles.rowCell}>
        <View style={styles.row}>
          <View style={styles.rowBadge}>
            <Text style={styles.rowBadgeText}>{item + 1}</Text>
          </View>
          <View style={styles.rowLines}>
            <View style={styles.rowLineWide} />
            <View style={styles.rowLineNarrow} />
          </View>
        </View>
      </View>
    ),
    []
  );

  return (
    <View style={styles.root} pointerEvents="auto">
      {/* Fake map backdrop (the frost world behind) */}
      <View style={styles.map} />
      <Reanimated.View style={[styles.mapDim, backdropStyle]} pointerEvents="none" />

      {/* THE TRACK: one fullscreen native scroll. Content = transparent spacer(H)
          then the sheet content — the sheet IS where content begins. */}
      <AnimatedFlashList
        ref={scrollRef}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ paddingTop: EXPANDED_TOP }}
        data={ROW_DATA}
        renderItem={renderRow}
        getItemType={() => 'row'}
        drawDistance={SCREEN.height}
        maintainVisibleContentPosition={{ disabled: true }}
        renderScrollComponent={TrackScrollComponent}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        scrollEventThrottle={16}
        onScroll={onScroll}
      />

      {/* World mask: map-replica above the sheet top — content never shows here. */}
      <Reanimated.View style={[styles.worldMask, worldMaskStyle]} pointerEvents="none">
        <Reanimated.View style={[styles.worldMaskDim, backdropStyle]} />
      </Reanimated.View>

      {/* Pinned header chrome — a τ-derivation riding ABOVE the track (input surface
          2's home; in the prototype it only closes + reads out). */}
      <Reanimated.View style={[styles.header, headerStyle]} pointerEvents="box-none">
        {/* Corner ears: map-replica quarter-corner fillers — the sheet's rounded
            top corners stay rounded even while content slides beneath the chrome
            (the notches outside the radius are world, not sheet). */}
        <View style={[styles.cornerEar, styles.cornerEarLeft]} pointerEvents="none">
          <View style={[styles.cornerEarRing, styles.cornerEarRingLeft]} />
          <Reanimated.View
            style={[styles.cornerEarRing, styles.cornerEarRingLeft, styles.cornerEarRingDim, backdropStyle]}
          />
        </View>
        <View style={[styles.cornerEar, styles.cornerEarRight]} pointerEvents="none">
          <View style={[styles.cornerEarRing, styles.cornerEarRingRight]} />
          <Reanimated.View
            style={[styles.cornerEarRing, styles.cornerEarRingRight, styles.cornerEarRingDim, backdropStyle]}
          />
        </View>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>One Track</Text>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={12}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        {/* Docked strip band: frost replica under a WHITE PLATE with chip holes —
            the production cutout composition (MaskedHoleOverlay), miniaturized.
            Rows scrolling beneath vanish behind the plate; the chips are windows
            straight through to the frost. */}
        <View style={styles.stripBand} pointerEvents="none">
          <View style={styles.stripFrost} />
          <Reanimated.View style={[styles.stripFrostDim, backdropStyle]} />
          <View style={styles.stripFrostWash} />
          <MaskedHoleOverlay holes={chipHoles} backgroundColor="#ffffff" renderWhenEmpty />
          <View style={styles.stripRow}>
            {STRIP_LABELS.map((label, index) => (
              <View
                key={label}
                onLayout={(e) => onChipLayout(index, e)}
                style={[styles.chip, index === 1 && styles.chipActive]}
              >
                <Text style={[styles.chipText, index === 1 && styles.chipTextActive]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <Reanimated.View style={[styles.divider, dividerStyle]} />
      </Reanimated.View>

      <View style={styles.readout} pointerEvents="none">
        <Text style={styles.readoutText}>{tauReadout}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 9999 },
  map: { ...StyleSheet.absoluteFillObject, backgroundColor: '#dce7dd' },
  mapDim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b3d2e' },
  sheetCap: {
    height: 122,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: SHEET_CORNER_RADIUS,
    borderTopRightRadius: SHEET_CORNER_RADIUS,
  },
  rowCell: { backgroundColor: '#ffffff', paddingHorizontal: 16 },
  // Short: a screen-tall footer read as a blank page when a hard flick reached
  // the track's end (the "virtualization failure" that wasn't — U5 red herring).
  sheetFooter: { height: 160, backgroundColor: '#ffffff' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  worldMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: '#dce7dd',
  },
  worldMaskDim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b3d2e' },
  overscrollBleed: {
    position: 'absolute',
    top: -600,
    height: 600,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
  },
  headerCard: {
    marginHorizontal: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 20, color: '#0f172a', lineHeight: 22 },
  divider: { height: 1, backgroundColor: '#e2e8f0' },
  stripBand: { height: STRIP_BAND_HEIGHT, overflow: 'hidden' },
  stripFrost: { ...StyleSheet.absoluteFillObject, backgroundColor: '#dce7dd' },
  stripFrostDim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b3d2e' },
  stripFrostWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.45)' },
  stripRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: STRIP_PAD_X,
    paddingTop: STRIP_PAD_Y,
  },
  cornerEar: {
    position: 'absolute',
    top: 0,
    width: SHEET_CORNER_RADIUS,
    height: SHEET_CORNER_RADIUS,
    overflow: 'hidden',
    zIndex: 2,
  },
  cornerEarLeft: { left: 0 },
  cornerEarRight: { right: 0 },
  cornerEarRing: {
    position: 'absolute',
    width: SHEET_CORNER_RADIUS * 4,
    height: SHEET_CORNER_RADIUS * 4,
    borderRadius: SHEET_CORNER_RADIUS * 2,
    borderWidth: SHEET_CORNER_RADIUS,
    borderColor: '#dce7dd',
  },
  cornerEarRingLeft: { left: -SHEET_CORNER_RADIUS, top: -SHEET_CORNER_RADIUS },
  cornerEarRingRight: { left: -SHEET_CORNER_RADIUS * 2, top: -SHEET_CORNER_RADIUS },
  cornerEarRingDim: { borderColor: '#0b3d2e' },
  chip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: '#f43f5e' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  chipTextActive: { color: '#ffffff' },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBadgeText: { color: '#ffffff', fontWeight: '700' },
  rowLines: { flex: 1, gap: 8 },
  rowLineWide: { height: 12, borderRadius: 6, backgroundColor: '#e2e8f0', width: '80%' },
  rowLineNarrow: { height: 10, borderRadius: 5, backgroundColor: '#eef2f7', width: '55%' },
  readout: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  readoutText: { color: '#ffffff', fontSize: 12, fontVariant: ['tabular-nums'] },
});

export default OneTrackPrototype;
