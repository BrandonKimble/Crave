import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import Svg, {
  Path as SvgPath,
} from 'react-native-svg';
import { OVERLAY_HEADER_CLOSE_BUTTON_SIZE } from './overlaySheetStyles';

type HeaderCloseCutoutOptions = {
  closeButtonSize?: number;
  fillColor?: string;
  maskPadding?: number;
  holePadding?: number;
  holeYOffset?: number;
  badgePadding?: number;
  badgeRadius?: number;
  badgeYOffset?: number;
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
  `M ${cx} ${cy} m -${radius},0 a ${radius},${radius} 0 1,0 ${radius * 2},0 a ${radius},${radius} 0 1,0 -${
    radius * 2
  },0`;

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

  const [headerLayout, setHeaderLayout] = React.useState({ width: 0, height: 0 });
  const [headerRowOffset, setHeaderRowOffset] = React.useState({ x: 0, y: 0 });
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
    setHeaderRowOffset((prev) => {
      if (Math.abs(prev.x - layout.x) < 0.5 && Math.abs(prev.y - layout.y) < 0.5) {
        return prev;
      }
      return { x: layout.x, y: layout.y };
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
    const closeCenterX =
      closeLayout?.x !== undefined
        ? headerRowOffset.x + closeLayout.x + closeLayout.width / 2
        : null;
    const closeCenterY =
      closeLayout?.y !== undefined
        ? headerRowOffset.y + closeLayout.y + closeLayout.height / 2 + holeYOffset + maskPadding
        : null;
    const badgeRect =
      badgeLayout?.x !== undefined && badgeLayout?.y !== undefined
        ? {
            x: headerRowOffset.x + badgeLayout.x - badgePadding,
            y: headerRowOffset.y + badgeLayout.y - badgePadding + badgeYOffset + maskPadding,
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

    const outerRect = `M 0 0 H ${headerLayout.width} V ${maskHeight} H 0 Z`;
    const d = cutoutPaths.length ? `${outerRect} ${cutoutPaths.join(' ')}` : outerRect;

    return (
      <Svg
        pointerEvents="none"
        width={headerLayout.width}
        height={maskHeight}
        style={[styles.fill, maskPadding ? { top: -maskPadding, height: maskHeight } : null]}
      >
        <SvgPath d={d} fill={fillColor} fillRule="evenodd" />
      </Svg>
    );
  }, [
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
    headerLayout.height,
    headerLayout.width,
    headerRowOffset.x,
    headerRowOffset.y,
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
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

export { useHeaderCloseCutout };
