import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import Svg, { Path as SvgPath } from 'react-native-svg';
import {
  OVERLAY_GRAB_HANDLE_HEIGHT,
  OVERLAY_GRAB_HANDLE_PADDING_TOP,
  OVERLAY_GRAB_HANDLE_RADIUS,
  OVERLAY_GRAB_HANDLE_WIDTH,
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
} from './overlaySheetStyles';

type HeaderCloseCutoutOptions = {
  closeButtonSize?: number;
  fillColor?: string;
  maskPadding?: number;
  holePadding?: number;
  holeYOffset?: number;
  badgePadding?: number;
  badgeRadius?: number;
  badgeYOffset?: number;
  grabHandleCutout?: boolean;
  grabHandleWidth?: number;
  grabHandleHeight?: number;
  grabHandleRadius?: number;
  grabHandlePaddingTop?: number;
  headerPaddingTop?: number;
};

type HeaderCloseCutoutResult = {
  background: React.ReactNode;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onHeaderRowLayout: (event: LayoutChangeEvent) => void;
  onCloseLayout: (event: LayoutChangeEvent) => void;
  onBadgeLayout: (event: LayoutChangeEvent) => void;
  headerHeight: number;
};

const DEFAULT_MASK_PADDING = 2;
const DEFAULT_HOLE_PADDING = 0;
const DEFAULT_HOLE_Y_OFFSET = 0;
const DEFAULT_BADGE_PADDING = 0;
const DEFAULT_BADGE_Y_OFFSET = 0;

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

const useHeaderCloseCutout = (options: HeaderCloseCutoutOptions = {}): HeaderCloseCutoutResult => {
  const closeButtonSize = options.closeButtonSize ?? OVERLAY_HEADER_CLOSE_BUTTON_SIZE;
  const fillColor = options.fillColor ?? '#ffffff';
  const maskPadding = options.maskPadding ?? DEFAULT_MASK_PADDING;
  const holePadding = options.holePadding ?? DEFAULT_HOLE_PADDING;
  const holeYOffset = options.holeYOffset ?? DEFAULT_HOLE_Y_OFFSET;
  const badgePadding = options.badgePadding ?? DEFAULT_BADGE_PADDING;
  const badgeYOffset = options.badgeYOffset ?? DEFAULT_BADGE_Y_OFFSET;
  const holeRadius = closeButtonSize / 2 + holePadding;
  const grabHandleCutout = options.grabHandleCutout ?? false;
  const grabHandleWidth = options.grabHandleWidth ?? OVERLAY_GRAB_HANDLE_WIDTH;
  const grabHandleHeight = options.grabHandleHeight ?? OVERLAY_GRAB_HANDLE_HEIGHT;
  const grabHandleRadius = options.grabHandleRadius ?? OVERLAY_GRAB_HANDLE_RADIUS;
  const grabHandlePaddingTop = options.grabHandlePaddingTop ?? OVERLAY_GRAB_HANDLE_PADDING_TOP;
  const headerPaddingTop = options.headerPaddingTop ?? 0;

  const [headerLayout, setHeaderLayout] = React.useState({ width: 0, height: 0 });
  const [headerRowLayout, setHeaderRowLayout] = React.useState<LayoutRectangle>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [closeLayout, setCloseLayout] = React.useState<LayoutRectangle | null>(null);
  const [badgeLayout, setBadgeLayout] = React.useState<LayoutRectangle | null>(null);

  const onHeaderLayout = React.useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setHeaderLayout((prev) =>
      prev.width === layout.width && prev.height === layout.height
        ? prev
        : { width: layout.width, height: layout.height }
    );
  }, []);

  const onHeaderRowLayout = React.useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setHeaderRowLayout((prev) => {
      if (
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

  const onCloseLayout = React.useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setCloseLayout((prev) => {
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

  const onBadgeLayout = React.useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
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

  const background = React.useMemo(() => {
    if (!(headerLayout.width > 0 && headerLayout.height > 0)) {
      return <View style={[styles.fill, { backgroundColor: fillColor }]} pointerEvents="none" />;
    }

    const maskHeight = headerLayout.height + maskPadding * 2;
    const inferredCloseCenterX =
      headerRowLayout.width > 0
        ? headerRowLayout.x + headerRowLayout.width - closeButtonSize / 2
        : null;
    const inferredCloseCenterY =
      headerRowLayout.height > 0
        ? headerRowLayout.y + headerRowLayout.height / 2 + holeYOffset + maskPadding
        : null;
    const closeCenterX =
      closeLayout?.x !== undefined
        ? headerRowLayout.x + closeLayout.x + closeLayout.width / 2
        : inferredCloseCenterX;
    const closeCenterY =
      closeLayout?.y !== undefined
        ? headerRowLayout.y + closeLayout.y + closeLayout.height / 2 + holeYOffset + maskPadding
        : inferredCloseCenterY;
    const badgeRect =
      badgeLayout?.x !== undefined && badgeLayout?.y !== undefined
        ? {
            x: headerRowLayout.x + badgeLayout.x - badgePadding,
            y: headerRowLayout.y + badgeLayout.y - badgePadding + badgeYOffset + maskPadding,
            width: badgeLayout.width + badgePadding * 2,
            height: badgeLayout.height + badgePadding * 2,
          }
        : null;
    const badgeRadiusBase = options.badgeRadius ?? (badgeRect ? badgeRect.height / 2 : 0);
    const badgeRadius = badgeRect
      ? Math.min(badgeRadiusBase + badgePadding, badgeRect.height / 2, badgeRect.width / 2)
      : 0;

    const cutoutPaths: string[] = [];
    if (closeCenterX !== null && closeCenterY !== null) {
      cutoutPaths.push(circlePath(closeCenterX, closeCenterY, holeRadius));
    }
    if (badgeRect) {
      cutoutPaths.push(
        roundedRectPath(badgeRect.x, badgeRect.y, badgeRect.width, badgeRect.height, badgeRadius)
      );
    }
    if (grabHandleCutout) {
      const handleX = (headerLayout.width - grabHandleWidth) / 2;
      const handleY = headerPaddingTop + grabHandlePaddingTop + maskPadding;
      cutoutPaths.push(
        roundedRectPath(handleX, handleY, grabHandleWidth, grabHandleHeight, grabHandleRadius)
      );
    }

    const outerRect = `M 0 0 H ${headerLayout.width} V ${maskHeight} H 0 Z`;
    const d = cutoutPaths.length ? `${outerRect} ${cutoutPaths.join(' ')}` : outerRect;

    return (
      <Svg
        pointerEvents="none"
        width={headerLayout.width}
        height={maskHeight}
        style={[
          styles.absoluteTopLeft,
          {
            width: headerLayout.width,
            height: maskHeight,
            top: maskPadding ? -maskPadding : 0,
          },
        ]}
      >
        <SvgPath d={d} fill={fillColor} fillRule="evenodd" clipRule="evenodd" />
      </Svg>
    );
  }, [
    closeButtonSize,
    closeLayout?.height,
    closeLayout?.width,
    closeLayout?.x,
    closeLayout?.y,
    badgeLayout?.height,
    badgeLayout?.width,
    badgeLayout?.x,
    badgeLayout?.y,
    badgePadding,
    badgeYOffset,
    fillColor,
    grabHandleCutout,
    grabHandleHeight,
    grabHandlePaddingTop,
    grabHandleRadius,
    grabHandleWidth,
    headerLayout.height,
    headerLayout.width,
    headerPaddingTop,
    headerRowLayout.height,
    headerRowLayout.width,
    headerRowLayout.x,
    headerRowLayout.y,
    holeRadius,
    holeYOffset,
    options.badgeRadius,
    maskPadding,
  ]);

  return {
    background,
    onHeaderLayout,
    onHeaderRowLayout,
    onCloseLayout,
    onBadgeLayout,
    headerHeight: headerLayout.height,
  };
};

const styles = StyleSheet.create({
  absoluteTopLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

export { useHeaderCloseCutout };
