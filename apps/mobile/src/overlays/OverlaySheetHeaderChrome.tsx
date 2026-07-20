import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import Svg, { Path as SvgPath } from 'react-native-svg';

import {
  overlaySheetStyles,
  OVERLAY_GRAB_HANDLE_HEIGHT,
  OVERLAY_GRAB_HANDLE_PADDING_TOP,
  OVERLAY_GRAB_HANDLE_RADIUS,
  OVERLAY_GRAB_HANDLE_WIDTH,
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
  OVERLAY_HEADER_ROW_MARGIN_TOP,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
} from './overlaySheetStyles';

// THE standardized sheet header — identical on every page: a white cutout plate with a grab-handle
// cutout (top-center) + a close-button circle cutout (right), and the title on the left. There is no
// per-scene special case (the poll-count badge cutout was removed 2026-07-01, page-switch-master-plan.md).
type OverlaySheetHeaderChromeProps = {
  title: React.ReactNode;
  actionButton: React.ReactNode;
  onGrabHandlePress?: () => void;
  grabHandleAccessibilityLabel?: string;
  grabHandleCutout?: boolean;
  /** W4 (scene-foundation `grabHandle: 'hidden'`): suppresses the handle bar AND its
   *  cutout entirely (full-page-illusion scenes — settings is the first consumer). */
  grabHandleHidden?: boolean;
  fixedHeight?: boolean;
  paddingTop?: number;
  paddingHorizontal?: number;
  transparent?: boolean;
  afterRow?: React.ReactNode;
  rowStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
};

const DEFAULT_MASK_PADDING = 2;
const DEFAULT_HOLE_PADDING = 0;
const DEFAULT_HOLE_Y_OFFSET = 0;
const DEFAULT_CUTOUT_FILL = '#ffffff';
// The white cutout plate used to overhang the header bottom by this much to "cover the seam"
// with the content below. The header is now clipped to its box (`overflow:'hidden'` on
// `overlaySheetStyles.header`) and the scroll divider is bottom-flush on the boundary, so the
// overhang is obsolete — the plate ends exactly at the header bottom. Kept at 0 for clarity.
const HEADER_FOREGROUND_PLATE_OVERLAP_PX = 0;

const circlePath = (cx: number, cy: number, radius: number) =>
  `M ${cx} ${cy} m -${radius},0 a ${radius},${radius} 0 1,0 ${
    radius * 2
  },0 a ${radius},${radius} 0 1,0 -${radius * 2},0 Z`;

const roundedRectPath = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const right = x + width;
  const bottom = y + height;
  return [
    `M ${x + r} ${y}`,
    `H ${right - r}`,
    `A ${r} ${r} 0 0 1 ${right} ${y + r}`,
    `V ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${bottom - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
};

const OverlaySheetHeaderChrome: React.FC<OverlaySheetHeaderChromeProps> = ({
  title,
  actionButton,
  onGrabHandlePress,
  grabHandleAccessibilityLabel = 'Close sheet',
  grabHandleCutout = true,
  grabHandleHidden = false,
  fixedHeight = true,
  paddingTop = 0,
  paddingHorizontal = OVERLAY_HORIZONTAL_PADDING,
  transparent = true,
  afterRow,
  rowStyle,
  style,
  onLayout,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredHeight, setMeasuredHeight] = React.useState<number | null>(null);

  const headerHeight = fixedHeight
    ? OVERLAY_TAB_HEADER_HEIGHT
    : (measuredHeight ?? OVERLAY_TAB_HEADER_HEIGHT);
  const maskPadding = DEFAULT_MASK_PADDING;
  const holePadding = DEFAULT_HOLE_PADDING;
  const holeYOffset = DEFAULT_HOLE_Y_OFFSET;
  const closeButtonSize = OVERLAY_HEADER_CLOSE_BUTTON_SIZE;
  const holeRadius = closeButtonSize / 2 + holePadding;

  const handleHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      if (!fixedHeight) {
        const nextHeight = event.nativeEvent.layout.height;
        setMeasuredHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      }
    },
    [fixedHeight, onLayout]
  );

  const cutoutBackground = React.useMemo(() => {
    const maskHeight = headerHeight + maskPadding * 2 + HEADER_FOREGROUND_PLATE_OVERLAP_PX;
    const fillColor = DEFAULT_CUTOUT_FILL;

    const headerRowY =
      paddingTop +
      OVERLAY_GRAB_HANDLE_PADDING_TOP +
      OVERLAY_GRAB_HANDLE_HEIGHT +
      OVERLAY_HEADER_ROW_MARGIN_TOP;

    const closeCenterX = windowWidth - paddingHorizontal - closeButtonSize / 2;
    const closeCenterY = headerRowY + closeButtonSize / 2 + holeYOffset + maskPadding;

    const safeCloseCenterX = Math.max(holeRadius, Math.min(windowWidth - holeRadius, closeCenterX));
    const safeCloseCenterY = Math.max(holeRadius, Math.min(maskHeight - holeRadius, closeCenterY));

    const closeHolePath = circlePath(safeCloseCenterX, safeCloseCenterY, holeRadius);
    const cutoutPaths: string[] = [closeHolePath];

    if (grabHandleCutout && !grabHandleHidden) {
      const handleX = (windowWidth - OVERLAY_GRAB_HANDLE_WIDTH) / 2;
      const handleY = paddingTop + OVERLAY_GRAB_HANDLE_PADDING_TOP + maskPadding;
      const handlePath = roundedRectPath(
        handleX,
        handleY,
        OVERLAY_GRAB_HANDLE_WIDTH,
        OVERLAY_GRAB_HANDLE_HEIGHT,
        OVERLAY_GRAB_HANDLE_RADIUS
      );
      cutoutPaths.push(handlePath);
    }

    const outerRect = `M 0 0 H ${windowWidth} V ${maskHeight} H 0 Z`;
    const d = `${outerRect} ${cutoutPaths.join(' ')}`;

    return (
      <Svg
        pointerEvents="none"
        width={windowWidth}
        height={maskHeight}
        style={[
          styles.absoluteTopLeft,
          {
            width: windowWidth,
            height: maskHeight,
            top: -maskPadding,
          },
        ]}
      >
        <SvgPath d={d} fill={fillColor} fillRule="evenodd" clipRule="evenodd" />
      </Svg>
    );
  }, [
    closeButtonSize,
    headerHeight,
    holeRadius,
    holeYOffset,
    maskPadding,
    paddingHorizontal,
    paddingTop,
    grabHandleCutout,
    grabHandleHidden,
    windowWidth,
  ]);

  // grabHandleHidden keeps the wrapper's LAYOUT slot (the headerRow/close-cutout Y math
  // assumes the handle band exists) but renders no bar — and the cutout path above is
  // suppressed, so the plate is solid where the handle would be.
  const handleContent = grabHandleHidden ? (
    <View style={overlaySheetStyles.grabHandleWrapper}>
      <View style={{ width: OVERLAY_GRAB_HANDLE_WIDTH, height: OVERLAY_GRAB_HANDLE_HEIGHT }} />
    </View>
  ) : (
    <View style={overlaySheetStyles.grabHandleWrapper}>
      {onGrabHandlePress ? (
        <Pressable
          onPressOut={onGrabHandlePress}
          accessibilityRole="button"
          accessibilityLabel={grabHandleAccessibilityLabel}
          hitSlop={10}
        >
          <View
            style={[
              overlaySheetStyles.grabHandle,
              grabHandleCutout ? overlaySheetStyles.grabHandleCutout : null,
            ]}
          />
        </Pressable>
      ) : (
        <View
          style={[
            overlaySheetStyles.grabHandle,
            grabHandleCutout ? overlaySheetStyles.grabHandleCutout : null,
          ]}
        />
      )}
    </View>
  );

  return (
    <View
      style={[
        overlaySheetStyles.header,
        fixedHeight ? overlaySheetStyles.tabHeader : null,
        transparent ? overlaySheetStyles.headerTransparent : null,
        style,
        { paddingTop, paddingHorizontal },
      ]}
      onLayout={handleHeaderLayout}
      collapsable={false}
    >
      {cutoutBackground}
      {handleContent}
      <View
        style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced, rowStyle]}
        collapsable={false}
      >
        {/* THE TITLE SLOT BOUND (truncation law): the slot — not each panel's text —
            owns the width bound that makes single-line ellipsis physical. Without it
            a long title pushed the action button (space-between with an overflowing
            child); panels used to hand-roll flex:1 bounds inconsistently. */}
        <View style={overlaySheetStyles.headerTitleSlot} collapsable={false}>
          {title}
        </View>
        {actionButton}
      </View>
      {afterRow ?? null}
    </View>
  );
};

const styles = StyleSheet.create({
  absoluteTopLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

export default OverlaySheetHeaderChrome;
