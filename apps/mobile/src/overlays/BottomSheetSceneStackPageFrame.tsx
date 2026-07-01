import React from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { OVERLAY_TAB_HEADER_HEIGHT } from './overlaySheetStyles';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';

type BottomSheetSceneStackPageFrameProps = {
  underlayComponent?: React.ReactNode;
  backgroundComponent?: React.ReactNode;
  bodyComponent: React.ReactNode;
  headerComponent?: React.ReactNode;
  overlayComponent?: React.ReactNode;
  bodyViewportRef?: React.Ref<View>;
  onBodyViewportLayout?: (event: LayoutChangeEvent) => void;
  onHeaderLayout?: (event: LayoutChangeEvent) => void;
  reserveHeaderLane?: boolean;
  reservedHeaderHeight?: number;
  headerDividerScrollOffset?: SharedValue<number>;
  // Four-lane split (sheet-frost-architecture). The host-owned player drives per-region opacities
  // applied HERE, at the page-frame's own z-layers:
  //   • chromeOpacityStyle → the CHROME regions (underlay / plate / header / overlay): an INSTANT
  //     swap (resolveHeaderSwap, paint-ack-gated) so the header NEVER fades and its cutouts always
  //     reveal the constant frosted-map; the white plate HARD-swaps (stays opaque, no map leak).
  //   • bodyOpacityStyle → the BODY region ONLY: the cross-dissolve (resolveContentLaneOpacities).
  // When omitted (search scene / no transition) the layers render at their static opacity, as before.
  // onBodyFirstPaint → the BODY's first onLayout = the paint-ack producer (the incoming body painted).
  chromeOpacityStyle?: StyleProp<ViewStyle>;
  bodyOpacityStyle?: StyleProp<ViewStyle>;
  onBodyFirstPaint?: (event: LayoutChangeEvent) => void;
};

// The header/content seam is a SINGLE boundary at `headerHeight` — it is simultaneously the
// header plate's bottom (clipped via overflow:hidden) AND the body-lane / scroll-strip top. The
// divider marks that boundary and must sit FLUSH with it: anchor the divider by its BOTTOM edge
// (top = boundary − thickness) so header, divider, and content meet edge-to-edge — no white sliver
// below it, no overlap into the content. `DIVIDER_THICKNESS` ties the offset to the line's own
// height so the bottom always lands exactly on the boundary regardless of the device hairline.
const DIVIDER_THICKNESS = StyleSheet.hairlineWidth;

const HeaderScrollDivider = React.memo(
  ({ headerHeight, scrollOffset }: { headerHeight: number; scrollOffset: SharedValue<number> }) => {
    const dividerStyle = useAnimatedStyle(
      () => ({
        opacity: interpolate(scrollOffset.value, [0, 3, 14], [0, 0.35, 1], Extrapolation.CLAMP),
      }),
      [scrollOffset]
    );

    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sceneStackPageHeaderScrollDivider,
          { top: Math.max(0, headerHeight) - DIVIDER_THICKNESS },
          dividerStyle,
        ]}
      />
    );
  }
);

HeaderScrollDivider.displayName = 'HeaderScrollDivider';

export const BottomSheetSceneStackPageFrame = React.memo(
  ({
    underlayComponent,
    backgroundComponent,
    bodyComponent,
    headerComponent,
    overlayComponent,
    bodyViewportRef,
    onBodyViewportLayout,
    onHeaderLayout,
    reserveHeaderLane = false,
    reservedHeaderHeight,
    headerDividerScrollOffset,
    chromeOpacityStyle,
    bodyOpacityStyle,
    onBodyFirstPaint,
  }: BottomSheetSceneStackPageFrameProps) => {
    const [headerHeight, setHeaderHeight] = React.useState(OVERLAY_TAB_HEADER_HEIGHT);
    // The body's onLayout fans out to the existing viewport-layout consumer AND the paint-ack
    // producer (onBodyFirstPaint) — both fire on the body's first real measured frame.
    const handleBodyLayout = React.useCallback(
      (event: LayoutChangeEvent) => {
        onBodyViewportLayout?.(event);
        onBodyFirstPaint?.(event);
      },
      [onBodyViewportLayout, onBodyFirstPaint]
    );
    const effectiveHeaderHeight =
      headerComponent == null && reservedHeaderHeight != null ? reservedHeaderHeight : headerHeight;
    const handleHeaderLayout = React.useCallback(
      (event: LayoutChangeEvent) => {
        onHeaderLayout?.(event);
        const nextHeight = event.nativeEvent.layout.height;
        if (nextHeight <= 0) {
          return;
        }
        setHeaderHeight((previousHeight) =>
          Math.abs(previousHeight - nextHeight) < 0.5 ? previousHeight : nextHeight
        );
      },
      [onHeaderLayout]
    );
    const shouldReserveHeaderLane = reserveHeaderLane || headerComponent != null;
    const bodyLayerStyle = React.useMemo(
      () => [
        styles.sceneStackPageBodyLayer,
        shouldReserveHeaderLane ? { top: Math.max(0, effectiveHeaderHeight) } : null,
      ],
      [effectiveHeaderHeight, shouldReserveHeaderLane]
    );

    return (
      <View pointerEvents="box-none" style={styles.sceneStackPageBundle}>
        {/* CHROME regions (underlay / plate / header / overlay) carry the INSTANT-swap opacity
            (chromeOpacityStyle = resolveHeaderSwap): they never fade — the header swaps in one frame
            on the paint-ack so its cutouts always reveal the constant frosted-map, and the white
            plate hard-swaps (stays opaque). The BODY layer carries the cross-dissolve opacity
            (bodyOpacityStyle = resolveContentLaneOpacities) — the only thing that dissolves. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.sceneStackPageUnderlayLayer, chromeOpacityStyle]}
        >
          {underlayComponent}
        </Animated.View>
        {/* Phase 0 (opaque-backing hoist): the SHARED FROST FOUNDATION (one blur+white plate for
            the whole sheet) has been HOISTED to the surface host (ActiveSceneStackSurfaceHost),
            mounted ONCE below all content layers at a CONSTANT opacity 1.0. It is no longer
            painted inside this per-scene leg frame, so the player can never fade the backing toward
            transparent — the map is structurally unrepresentable inside the sheet. Per-scene white
            plates + cutouts (backgroundComponent) STAY here (above the shared hoisted plate) and
            HARD-swap (chromeOpacityStyle, never a fade) so the solid areas never see-through. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.sceneStackPageBackgroundLayer, chromeOpacityStyle]}
        >
          {backgroundComponent}
        </Animated.View>
        <Animated.View
          ref={bodyViewportRef}
          pointerEvents="box-none"
          onLayout={handleBodyLayout}
          style={[bodyLayerStyle, bodyOpacityStyle]}
        >
          {bodyComponent}
        </Animated.View>
        {headerComponent == null ? null : (
          <Animated.View
            pointerEvents="box-none"
            onLayout={handleHeaderLayout}
            style={[styles.sceneStackPageHeaderLayer, chromeOpacityStyle]}
          >
            {headerComponent}
          </Animated.View>
        )}
        {headerDividerScrollOffset == null ? null : (
          <HeaderScrollDivider
            headerHeight={effectiveHeaderHeight}
            scrollOffset={headerDividerScrollOffset}
          />
        )}
        <Animated.View
          pointerEvents="box-none"
          style={[styles.sceneStackPageOverlayLayer, chromeOpacityStyle]}
        >
          {overlayComponent}
        </Animated.View>
      </View>
    );
  }
);

BottomSheetSceneStackPageFrame.displayName = 'BottomSheetSceneStackPageFrame';
