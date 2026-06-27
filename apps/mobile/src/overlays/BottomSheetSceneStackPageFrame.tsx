import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
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
  }: BottomSheetSceneStackPageFrameProps) => {
    const [headerHeight, setHeaderHeight] = React.useState(OVERLAY_TAB_HEADER_HEIGHT);
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
        <View pointerEvents="none" style={styles.sceneStackPageUnderlayLayer}>
          {underlayComponent}
        </View>
        {/* SHARED FROST FOUNDATION: every sheet is frosty by default — one blur plane for the
            whole app, below all content. White layers (header plate, body surfaces) sit on top
            and punch cutouts to reveal this frost. Scenes no longer render their own frost. */}
        <View pointerEvents="none" style={styles.sceneStackPageBackgroundLayer}>
          <FrostedGlassBackground />
          {backgroundComponent}
        </View>
        <View
          ref={bodyViewportRef}
          pointerEvents="box-none"
          onLayout={onBodyViewportLayout}
          style={bodyLayerStyle}
        >
          {bodyComponent}
        </View>
        {headerComponent == null ? null : (
          <View
            pointerEvents="box-none"
            onLayout={handleHeaderLayout}
            style={styles.sceneStackPageHeaderLayer}
          >
            {headerComponent}
          </View>
        )}
        {headerDividerScrollOffset == null ? null : (
          <HeaderScrollDivider
            headerHeight={effectiveHeaderHeight}
            scrollOffset={headerDividerScrollOffset}
          />
        )}
        <View pointerEvents="box-none" style={styles.sceneStackPageOverlayLayer}>
          {overlayComponent}
        </View>
      </View>
    );
  }
);

BottomSheetSceneStackPageFrame.displayName = 'BottomSheetSceneStackPageFrame';
