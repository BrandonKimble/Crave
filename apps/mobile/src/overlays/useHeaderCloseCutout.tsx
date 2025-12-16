import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, {
  Circle as SvgCircle,
  Rect as SvgRect,
  Defs as SvgDefs,
  Mask as SvgMask,
} from 'react-native-svg';
import { OVERLAY_HEADER_CLOSE_BUTTON_SIZE } from './overlaySheetStyles';

type HeaderCloseCutoutOptions = {
  closeButtonSize?: number;
  fillColor?: string;
  maskPadding?: number;
  holePadding?: number;
  holeYOffset?: number;
};

type HeaderCloseCutoutResult = {
  background: React.ReactNode;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onHeaderRowLayout: (event: LayoutChangeEvent) => void;
  onCloseLayout: (event: LayoutChangeEvent) => void;
};

const DEFAULT_MASK_PADDING = 2;
const DEFAULT_HOLE_PADDING = 0;
const DEFAULT_HOLE_Y_OFFSET = 0;

const useHeaderCloseCutout = (options: HeaderCloseCutoutOptions = {}): HeaderCloseCutoutResult => {
  const closeButtonSize = options.closeButtonSize ?? OVERLAY_HEADER_CLOSE_BUTTON_SIZE;
  const fillColor = options.fillColor ?? '#ffffff';
  const maskPadding = options.maskPadding ?? DEFAULT_MASK_PADDING;
  const holePadding = options.holePadding ?? DEFAULT_HOLE_PADDING;
  const holeYOffset = options.holeYOffset ?? DEFAULT_HOLE_Y_OFFSET;
  const holeRadius = closeButtonSize / 2 + holePadding;

  const [headerLayout, setHeaderLayout] = React.useState({ width: 0, height: 0 });
  const [headerRowOffset, setHeaderRowOffset] = React.useState({ x: 0, y: 0 });
  const [closeLayout, setCloseLayout] = React.useState<LayoutRectangle | null>(null);
  const maskId = React.useMemo(
    () => `overlay-header-close-mask-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

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

  const background = React.useMemo(() => {
    const fillStyle = [styles.fill, { backgroundColor: fillColor }];

    if (!(headerLayout.width > 0 && headerLayout.height > 0)) {
      return <View style={fillStyle} pointerEvents="none" />;
    }

    const maskHeight = headerLayout.height + maskPadding * 2;
    const closeCenterX =
      closeLayout?.x !== undefined
        ? headerRowOffset.x + closeLayout.x + closeLayout.width / 2
        : null;
    const closeCenterY =
      closeLayout?.y !== undefined
        ? headerRowOffset.y + closeLayout.y + closeLayout.height / 2 + holeYOffset
        : null;

    return (
      <MaskedView
        pointerEvents="none"
        style={styles.maskOverlay}
        maskElement={
          <Svg width={headerLayout.width} height={maskHeight}>
            <SvgDefs>
              <SvgMask
                id={maskId}
                x={0}
                y={0}
                width={headerLayout.width}
                height={maskHeight}
                maskUnits="userSpaceOnUse"
                maskContentUnits="userSpaceOnUse"
              >
                <SvgRect x={0} y={0} width={headerLayout.width} height={maskHeight} fill="white" />
                {closeCenterX !== null && closeCenterY !== null ? (
                  <SvgCircle cx={closeCenterX} cy={closeCenterY} r={holeRadius} fill="black" />
                ) : null}
              </SvgMask>
            </SvgDefs>
            <SvgRect
              x={0}
              y={0}
              width={headerLayout.width}
              height={maskHeight}
              fill="white"
              mask={`url(#${maskId})`}
            />
          </Svg>
        }
      >
        <View style={fillStyle} pointerEvents="none" />
      </MaskedView>
    );
  }, [
    closeLayout?.height,
    closeLayout?.width,
    closeLayout?.x,
    closeLayout?.y,
    fillColor,
    headerLayout.height,
    headerLayout.width,
    headerRowOffset.x,
    headerRowOffset.y,
    holeRadius,
    holeYOffset,
    maskId,
    maskPadding,
  ]);

  return {
    background,
    onHeaderLayout,
    onHeaderRowLayout,
    onCloseLayout,
  };
};

const styles = StyleSheet.create({
  maskOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

export { useHeaderCloseCutout };
