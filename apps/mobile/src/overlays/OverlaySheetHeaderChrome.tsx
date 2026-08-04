import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
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
// F977: this used to declare NINE more props (grabHandleCutout, fixedHeight, paddingTop,
// paddingHorizontal, transparent, afterRow, rowStyle, style, onLayout) that its SOLE render
// site (PersistentSheetHeaderHost) never passed. `fixedHeight` and `grabHandleCutout` were
// therefore permanently true, which made the measured-height state, its setter branch and
// both no-cutout arms unreachable — configurability nobody configured, hiding four dead
// branches. The defaults are now the STRUCTURE: the chrome row is a fixed box of
// OVERLAY_TAB_HEADER_HEIGHT with a grab-handle cutout, always. That is what makes
// computeSceneChromeHeight's declared sum physically true (text conforms to geometry).
type OverlaySheetHeaderChromeProps = {
  title: React.ReactNode;
  actionButton: React.ReactNode;
  onGrabHandlePress?: () => void;
  grabHandleAccessibilityLabel?: string;
  /** W4 (scene-foundation `grabHandle: 'hidden'`): suppresses the handle bar AND its
   *  cutout entirely (full-page-illusion scenes — settings is the first consumer). */
  grabHandleHidden?: boolean;
};

const PADDING_TOP = 0;
const PADDING_HORIZONTAL = OVERLAY_HORIZONTAL_PADDING;

// THE ROW BARK (F977 — the independent quantity). The wrapper measurement in
// PersistentSheetHeaderHost cannot falsify OVERLAY_TAB_HEADER_HEIGHT: `tabHeader` PINS the
// header box to exactly that constant, so computed and measured moved together and the
// "a chrome constant is stale" claim was green by construction. The header ROW, by
// contrast, is NOT pinned — it lays out to its tallest child. The declared sum asserts
// that child is OVERLAY_HEADER_CLOSE_BUTTON_SIZE tall. Grow the action button, or let a
// title wrap to two lines, and the row outgrows the constant while the pinned box silently
// clips it. THAT is falsifiable, and it is the exact defect the constants can suffer.
// RED recipe: bump OVERLAY_HEADER_CLOSE_BUTTON_SIZE's contribution here (or render a
// taller actionButton) and this barks on first present.
const barkedRowGeometryScenes = new Set<string>();

const DEFAULT_MASK_PADDING = 2;
const DEFAULT_CUTOUT_FILL = '#ffffff';
// F973(c): three zero-valued constants used to thread through the geometry below —
// DEFAULT_HOLE_PADDING, DEFAULT_HOLE_Y_OFFSET and HEADER_FOREGROUND_PLATE_OVERLAP_PX. Each
// contributed nothing to any result, and together they OBSCURED the geometry they were
// "kept for clarity" to explain: the close hole simply IS a circle of radius
// closeButtonSize / 2 centred on the close button, and the mask simply IS the header box
// plus its padding. (The plate overlap was a genuine value once, covering a seam with the
// content below; the header has been clipped to its own box — `overflow: 'hidden'` on
// overlaySheetStyles.header — with a bottom-flush scroll divider ever since, so the
// overhang has been obsolete, and 0, for as long as anyone can point to.)

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
  grabHandleHidden = false,
}) => {
  const { width: windowWidth } = useWindowDimensions();

  const headerHeight = OVERLAY_TAB_HEADER_HEIGHT;
  const paddingTop = PADDING_TOP;
  const paddingHorizontal = PADDING_HORIZONTAL;
  const maskPadding = DEFAULT_MASK_PADDING;
  const closeButtonSize = OVERLAY_HEADER_CLOSE_BUTTON_SIZE;
  const holeRadius = closeButtonSize / 2;

  const handleHeaderRowLayout = React.useCallback((event: LayoutChangeEvent) => {
    if (!__DEV__) {
      return;
    }
    const measuredRowHeight = event.nativeEvent.layout.height;
    if (Math.abs(measuredRowHeight - OVERLAY_HEADER_CLOSE_BUTTON_SIZE) <= 0.5) {
      return;
    }
    // Per DISTINCT measured height, not once per app lifetime: a second, differently
    // broken row must not be silenced by the first.
    const barkKey = measuredRowHeight.toFixed(2);
    if (barkedRowGeometryScenes.has(barkKey)) {
      return;
    }
    barkedRowGeometryScenes.add(barkKey);
    // eslint-disable-next-line no-console
    console.error(
      `[CHROME-GEOMETRY] the sheet header ROW laid out at ${measuredRowHeight}px but the ` +
        `declared chrome sum assumes OVERLAY_HEADER_CLOSE_BUTTON_SIZE (${OVERLAY_HEADER_CLOSE_BUTTON_SIZE}px) — ` +
        `OVERLAY_TAB_HEADER_HEIGHT is now stale and the pinned header box is CLIPPING this row ` +
        `(overlay-chrome-metrics.ts).`
    );
  }, []);

  const cutoutBackground = React.useMemo(() => {
    const maskHeight = headerHeight + maskPadding * 2;
    const fillColor = DEFAULT_CUTOUT_FILL;

    const headerRowY =
      paddingTop +
      OVERLAY_GRAB_HANDLE_PADDING_TOP +
      OVERLAY_GRAB_HANDLE_HEIGHT +
      OVERLAY_HEADER_ROW_MARGIN_TOP;

    const closeCenterX = windowWidth - paddingHorizontal - closeButtonSize / 2;
    const closeCenterY = headerRowY + closeButtonSize / 2 + maskPadding;

    const safeCloseCenterX = Math.max(holeRadius, Math.min(windowWidth - holeRadius, closeCenterX));
    const safeCloseCenterY = Math.max(holeRadius, Math.min(maskHeight - holeRadius, closeCenterY));

    const closeHolePath = circlePath(safeCloseCenterX, safeCloseCenterY, holeRadius);
    const cutoutPaths: string[] = [closeHolePath];

    if (!grabHandleHidden) {
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
    maskPadding,
    paddingHorizontal,
    paddingTop,
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
          <View style={[overlaySheetStyles.grabHandle, overlaySheetStyles.grabHandleCutout]} />
        </Pressable>
      ) : (
        <View style={[overlaySheetStyles.grabHandle, overlaySheetStyles.grabHandleCutout]} />
      )}
    </View>
  );

  return (
    <View
      style={[
        overlaySheetStyles.header,
        overlaySheetStyles.tabHeader,
        overlaySheetStyles.headerTransparent,
        { paddingTop, paddingHorizontal },
      ]}
      collapsable={false}
    >
      {cutoutBackground}
      {handleContent}
      <View
        style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}
        onLayout={handleHeaderRowLayout}
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
