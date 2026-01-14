import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type LayoutRectangle,
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

type OverlaySheetHeaderChromeProps = {
  title: React.ReactNode;
  badge?: React.ReactNode;
  actionButton: React.ReactNode;
  onGrabHandlePress?: () => void;
  grabHandleAccessibilityLabel?: string;
  grabHandleCutout?: boolean;
  fixedHeight?: boolean;
  paddingTop?: number;
  paddingHorizontal?: number;
  transparent?: boolean;
  showDivider?: boolean;
  afterRow?: React.ReactNode;
  rowStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  badgePadding?: number;
  badgeRadius?: number;
  badgeYOffset?: number;
};

const DEFAULT_MASK_PADDING = 2;
const DEFAULT_HOLE_PADDING = 0;
const DEFAULT_HOLE_Y_OFFSET = 0;
const DEFAULT_BADGE_PADDING = 0;
const DEFAULT_BADGE_Y_OFFSET = 0;
const DEFAULT_CUTOUT_FILL = '#ffffff';
const DEFAULT_CUTOUT_OUTLINE = 'rgba(15, 23, 42, 0.06)';
const DEFAULT_CUTOUT_OUTLINE_WIDTH = 0.5;

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
  badge,
  actionButton,
  onGrabHandlePress,
  grabHandleAccessibilityLabel = 'Close sheet',
  grabHandleCutout = true,
  fixedHeight = true,
  paddingTop = 0,
  paddingHorizontal = OVERLAY_HORIZONTAL_PADDING,
  transparent = true,
  showDivider = true,
  afterRow,
  rowStyle,
  style,
  onLayout,
  badgePadding = DEFAULT_BADGE_PADDING,
  badgeRadius,
  badgeYOffset = DEFAULT_BADGE_Y_OFFSET,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredHeight, setMeasuredHeight] = React.useState<number | null>(null);
  const [badgeLayout, setBadgeLayout] = React.useState<LayoutRectangle | null>(null);

  const headerHeight = fixedHeight
    ? OVERLAY_TAB_HEADER_HEIGHT
    : measuredHeight ?? OVERLAY_TAB_HEADER_HEIGHT;
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

  const handleBadgeLayout = React.useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setBadgeLayout((prev) => {
      if (
        prev &&
        Math.abs(prev.x - layout.x) < 0.5 &&
        Math.abs(prev.y - layout.y) < 0.5 &&
        Math.abs(prev.width - layout.width) < 0.5 &&
        Math.abs(prev.height - layout.height) < 0.5
      ) {
        return prev;
      }
      return layout;
    });
  }, []);

  const cutoutBackground = React.useMemo(() => {
    const maskHeight = headerHeight + maskPadding * 2;
    const fillColor = DEFAULT_CUTOUT_FILL;
    const outlineColor = DEFAULT_CUTOUT_OUTLINE;
    const outlineWidth = DEFAULT_CUTOUT_OUTLINE_WIDTH;

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
    const outlinePaths: string[] = [closeHolePath];

    if (grabHandleCutout) {
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
      outlinePaths.push(handlePath);
    }

    if (badge && badgeLayout && badgeLayout.width > 0 && badgeLayout.height > 0) {
      const rowX = paddingHorizontal;
      const rowY = headerRowY;
      const rect = {
        x: rowX + badgeLayout.x - badgePadding,
        y: rowY + badgeLayout.y - badgePadding + badgeYOffset + maskPadding,
        width: badgeLayout.width + badgePadding * 2,
        height: badgeLayout.height + badgePadding * 2,
      };
      const resolvedRadius = badgeRadius ?? rect.height / 2;
      const badgePath = roundedRectPath(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        Math.min(resolvedRadius, rect.height / 2, rect.width / 2)
      );
      cutoutPaths.push(badgePath);
      outlinePaths.push(badgePath);
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
        {outlinePaths.map((path) => (
          <SvgPath
            key={path}
            d={path}
            fill="none"
            stroke={outlineColor}
            strokeWidth={outlineWidth}
          />
        ))}
      </Svg>
    );
  }, [
    badge,
    badgeLayout?.height,
    badgeLayout?.width,
    badgeLayout?.x,
    badgeLayout?.y,
    badgePadding,
    badgeRadius,
    badgeYOffset,
    closeButtonSize,
    headerHeight,
    holeRadius,
    holeYOffset,
    maskPadding,
    paddingHorizontal,
    paddingTop,
    grabHandleCutout,
    windowWidth,
  ]);

  const handleContent = (
    <View style={overlaySheetStyles.grabHandleWrapper}>
      {onGrabHandlePress ? (
        <Pressable
          onPress={onGrabHandlePress}
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
        {title}
        {badge ? (
          <View onLayout={handleBadgeLayout} collapsable={false}>
            {badge}
          </View>
        ) : null}
        {actionButton}
      </View>
      {afterRow ?? null}
      {showDivider ? <View style={overlaySheetStyles.headerDivider} /> : null}
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
