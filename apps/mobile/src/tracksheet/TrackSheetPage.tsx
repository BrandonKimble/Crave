import React from 'react';
import { Dimensions, StyleSheet, View, type ViewStyle } from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import Reanimated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { useTrackSheetPhysics, type TrackSheetGeometry } from './useTrackSheetPhysics';
import { TrackSheetDockedStrip, type TrackSheetDockedStripProps } from './TrackSheetStrip';

// ─── TrackSheetPage — THE sheet-page standard ──────────────────────────────────
//
// Every sheet page in the app is one of these. Baked in, zero per-page work:
//   • ONE TRACK physics — sheet travel + list scroll on one native scroll;
//     native rubber both ends; critically damped detent settles; the ballistic
//     wall (momentum never crosses the sheet-top boundary); durable native
//     hatch (TrackScrollKit).
//   • THE SHEET SURFACE — rounded clipping surface riding sheetTopY with the
//     fullscreen track counter-positioned inside (content can never escape the
//     sheet's bounds; overscroll reveals sheet material; real corners; touches
//     above the sheet fall through to the world).
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
const SHEET_CORNER_RADIUS = 24;

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

export type TrackSheetCommands = {
  /** Programmatic settle to a τ (detent) — rides the native scroll animation. */
  snapToTau: (tau: number, animated?: boolean) => void;
};

export type TrackSheetPageProps<Item> = {
  geometry: TrackSheetGeometry;
  /** Header chrome content (title row). Rendered at the surface top. */
  header: React.ReactNode;
  /** Height of the header block (pt) — content starts below it at rest. */
  headerHeight: number;
  /** Docked strip band with cutouts (chrome-pinned; rows vanish beneath it). */
  dockedStrip?: Omit<TrackSheetDockedStripProps, 'children'> & { children: React.ReactNode };
  /** In-list leader content — scrolls away with the page (in-list strip mode). */
  listLeader?: React.ReactNode;
  /** Footer surface extension below the last row. */
  footerHeight?: number;
  list: TrackSheetListProps<Item>;
  /** Sheet surface color. */
  surfaceColor?: string;
  /** Extra style on each row cell's surface wrapper (padding etc.). */
  rowSurfaceStyle?: ViewStyle;
  /** Dev HUD readout of τ. */
  debugHud?: boolean;
  /** Imperative commands (scene-switch snaps etc.) — filled on mount. */
  commandsRef?: React.MutableRefObject<TrackSheetCommands | null>;
};

export function TrackSheetPage<Item>({
  geometry,
  header,
  headerHeight,
  dockedStrip,
  listLeader,
  footerHeight = 160,
  list,
  surfaceColor = '#ffffff',
  rowSurfaceStyle,
  debugHud = false,
  commandsRef,
}: TrackSheetPageProps<Item>): React.ReactElement {
  const physics = useTrackSheetPhysics(geometry);
  const { tau, trackH, sheetTopY, onScroll, attachToTag } = physics;

  const chromeHeight = headerHeight + (dockedStrip?.height ?? 0);

  // ── Derivations (pure functions of τ / sheetTopY) ──
  const sheetClipStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTopY.value }],
  }));
  const trackCounterStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -sheetTopY.value }],
  }));
  const dividerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tau.value - trackH, [0, 3, 14], [0, 0.35, 1], 'clamp'),
  }));

  const listInstanceRef = React.useRef<{
    scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
  } | null>(null);
  const setListRef = React.useCallback(
    (instance: React.Component | null) => {
      listInstanceRef.current = instance as unknown as {
        scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
      } | null;
      if (instance != null) {
        // findNodeHandle inside attach; the physics hook retries until the
        // recycler's UIScrollView exists.
        const { findNodeHandle } = require('react-native') as typeof import('react-native');
        attachToTag(findNodeHandle(instance));
      }
    },
    [attachToTag]
  );
  const pendingSnapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (commandsRef == null) {
      return;
    }
    commandsRef.current = {
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

  const listHeader = React.useMemo(
    () => (
      <View>
        {/* spacer region [0,H): the sheet-travel section of the track */}
        <View style={{ height: trackH }} pointerEvents="none" />
        {/* the surface cap under the chrome (content rest position) */}
        <View style={{ height: chromeHeight, backgroundColor: surfaceColor }} />
        {listLeader}
      </View>
    ),
    [chromeHeight, listLeader, surfaceColor, trackH]
  );
  const listFooter = React.useMemo(
    () => <View style={{ height: footerHeight, backgroundColor: surfaceColor }} />,
    [footerHeight, surfaceColor]
  );

  const renderItem = list.renderItem;
  const renderRowOnSurface = React.useCallback(
    (info: Parameters<NonNullable<typeof renderItem>>[0]) => (
      <View style={[{ backgroundColor: surfaceColor }, rowSurfaceStyle]}>
        {renderItem?.(info) ?? null}
      </View>
    ),
    [renderItem, rowSurfaceStyle, surfaceColor]
  );

  const [hud, setHud] = React.useState('');
  React.useEffect(() => {
    if (!debugHud) {
      return;
    }
    const timer = setInterval(() => setHud(`τ=${Math.round(tau.value)}  H=${trackH}`), 250);
    return () => clearInterval(timer);
  }, [debugHud, tau, trackH]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Reanimated.View
        style={[
          styles.sheetClip,
          { backgroundColor: surfaceColor, height: SCREEN.height },
          debugHud && styles.debugEdge,
          sheetClipStyle,
        ]}
      >
        <Reanimated.View style={[styles.trackCounter, trackCounterStyle]}>
          <AnimatedFlashList
            ref={setListRef as unknown as React.Ref<React.Component>}
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{ paddingTop: geometry.expandedTop }}
            data={list.data}
            renderItem={renderRowOnSurface}
            keyExtractor={list.keyExtractor}
            getItemType={list.getItemType}
            ItemSeparatorComponent={list.ItemSeparatorComponent}
            ListEmptyComponent={list.ListEmptyComponent}
            onEndReached={list.onEndReached}
            onEndReachedThreshold={list.onEndReachedThreshold}
            extraData={list.extraData}
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
        </Reanimated.View>

        {/* Chrome: sheet material pinned at the surface top. */}
        <View style={styles.chrome} pointerEvents="box-none">
          <View style={{ height: headerHeight }} pointerEvents="box-none">
            {header}
          </View>
          {dockedStrip != null ? <TrackSheetDockedStrip {...dockedStrip} /> : null}
          <Reanimated.View style={[styles.divider, dividerStyle]} />
        </View>
      </Reanimated.View>

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
  sheetClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopLeftRadius: SHEET_CORNER_RADIUS,
    borderTopRightRadius: SHEET_CORNER_RADIUS,
  },
  trackCounter: { ...StyleSheet.absoluteFillObject },
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  divider: { height: 1, backgroundColor: '#e2e8f0' },
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
