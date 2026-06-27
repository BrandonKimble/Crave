import React from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { FrostedGlassBackground } from './FrostedGlassBackground';
import MaskedHoleOverlay, { type MaskedHole } from './MaskedHoleOverlay';

/**
 * Reusable frosted filter/toggle strip — the SHARED shell for every page's filter row.
 * `SearchFilters.tsx` (the search results strip), the polls feed strip, and favorites next
 * all render their controls as children of THIS component, so they can't drift apart: search
 * — the known-correct surface — renders through it, proving the shell. Consumers differ only
 * in their controls + a couple of props (e.g. `disableBlur`, the warm-restore cache hooks).
 *
 * It mirrors `SearchFilters`' mask MECHANICS exactly so it looks identical:
 *   1. `FrostedGlassBackground` fills the band and blurs whatever sits behind it.
 *   2. A white `MaskedHoleOverlay` rides INSIDE the horizontal ScrollView, sized far
 *      wider than the viewport (`overscrollMargin` on each side) so it never reveals a
 *      hard edge as controls scroll/bounce off-screen. A window is punched behind each
 *      control, so the frost shows through ONLY under the controls. Because the mask
 *      scrolls WITH the controls, the windows stay pinned to them (they don't slide
 *      under fixed holes).
 *   3. The controls (a `SegmentedToggle`, `FilterChip`s, …) sit on top of the windows.
 *
 * Consumers pass plain controls as children; the strip auto-wraps each in a hole slot
 * that measures its box and registers it as a cutout. The band hugs the control height
 * (no extra vertical padding — search doesn't have any). `contentInset` matches the
 * page content padding so the first control lines up with the list content.
 */

const STRIP_HOLE_BORDER_RADIUS = 8;
// Matches search: CONTENT_HORIZONTAL_PADDING (= OVERLAY_HORIZONTAL_PADDING) = 20.
const STRIP_CONTENT_INSET = 20;
// Matches search TOGGLE_STACK_GAP.
const STRIP_GAP = 8;
// Matches search HOLE_RADIUS_BOOST — the cutout window is a hair larger than the
// control so its rounded corners read cleanly against the frost.
const HOLE_RADIUS_BOOST = 1;

type RegisterHole = (key: string, hole: MaskedHole) => void;
type UnregisterHole = (key: string) => void;

type FrostedFilterStripContextValue = {
  registerHole: RegisterHole;
  unregisterHole: UnregisterHole;
};

const FrostedFilterStripContext = React.createContext<FrostedFilterStripContextValue | null>(null);

const holesEqual = (a: MaskedHole | undefined, b: MaskedHole): boolean =>
  a != null &&
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

/** Wraps a single control, measuring its box and registering it as a frosted cutout. */
const StripHoleSlot: React.FC<{
  holeKey: string;
  borderRadius: number;
  children: React.ReactNode;
}> = ({ holeKey, borderRadius, children }) => {
  const ctx = React.useContext(FrostedFilterStripContext);
  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (!ctx) {
        return;
      }
      const { x, y, width, height } = event.nativeEvent.layout;
      ctx.registerHole(holeKey, { x, y, width, height, borderRadius });
    },
    [ctx, holeKey, borderRadius]
  );
  React.useEffect(() => () => ctx?.unregisterHole(holeKey), [ctx, holeKey]);
  return <View onLayout={handleLayout}>{children}</View>;
};

export type FrostedFilterStripProps = {
  children: React.ReactNode;
  /** Solid color painted over the frost outside the control windows. */
  surfaceColor?: string;
  /** Skip the FrostedGlassBackground (e.g. when the host already supplies the blur). */
  disableBlur?: boolean;
  /** Per-control corner radius for the cutouts (default 8, matching the controls). */
  holeBorderRadius?: number;
  /** Horizontal content inset so the first control lines up with the page content. */
  contentInset?: number;
  /** Reports the strip's measured band height (for the sheet header lane / divider). */
  onHeightChange?: (height: number) => void;
  /** Warm-restore: seed the measured layout so the mask paints without a measure-flash. */
  initialHoleLayout?: FrostedFilterStripMeasuredLayout | null;
  /** Emits the measured layout (hole map + viewport + row height) for warm-restore caching. */
  onMeasuredLayoutChange?: (layout: FrostedFilterStripMeasuredLayout) => void;
  style?: ViewStyle;
  testID?: string;
};

export type FrostedFilterStripMeasuredLayout = {
  holeMap: Record<string, MaskedHole>;
  viewportWidth: number;
  rowHeight: number;
};

export function FrostedFilterStrip({
  children,
  surfaceColor = '#ffffff',
  disableBlur = false,
  holeBorderRadius = STRIP_HOLE_BORDER_RADIUS,
  contentInset = STRIP_CONTENT_INSET,
  onHeightChange,
  initialHoleLayout,
  onMeasuredLayoutChange,
  style,
  testID,
}: FrostedFilterStripProps) {
  const [holeMap, setHoleMap] = React.useState<Record<string, MaskedHole>>(
    initialHoleLayout?.holeMap ?? {}
  );
  const [viewportWidth, setViewportWidth] = React.useState(initialHoleLayout?.viewportWidth ?? 0);
  const [rowHeight, setRowHeight] = React.useState(initialHoleLayout?.rowHeight ?? 0);
  const [stripContentWidth, setStripContentWidth] = React.useState(0);

  const registerHole = React.useCallback<RegisterHole>((key, hole) => {
    setHoleMap((prev) => (holesEqual(prev[key], hole) ? prev : { ...prev, [key]: hole }));
  }, []);
  const unregisterHole = React.useCallback<UnregisterHole>((key) => {
    setHoleMap((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);
  const ctx = React.useMemo(
    () => ({ registerHole, unregisterHole }),
    [registerHole, unregisterHole]
  );

  const holes = React.useMemo(() => Object.values(holeMap), [holeMap]);
  const maxHoleExtent = React.useMemo(
    () => (holes.length ? Math.max(...holes.map((hole) => hole.x + hole.width)) : 0),
    [holes]
  );
  // Extend the mask far past the viewport on both sides so scrolling/bouncing never
  // reveals a hard frost edge — the white always runs off both ends (search's trick).
  const overscrollMargin = Math.max(contentInset, viewportWidth);
  const maskWidth = Math.max(viewportWidth, maxHoleExtent + overscrollMargin * 2);
  // The mask used to bleed 1px UP (`maskTopOffset:-1` + paired `+1`s) to hide a seam at the strip's
  // top. The header plate is now clipped + the scroll divider is bottom-flush on the boundary, so the
  // strip sits flush under it and the bleed is obsolete — the mask starts at the strip's own top edge.
  const maskHeight = rowHeight > 0 ? rowHeight + STRIP_GAP : 0;
  const maskTopOffset = 0;
  const maskedHoles = React.useMemo(
    () =>
      holes.map((hole) => ({
        x: hole.x + overscrollMargin,
        y: hole.y,
        width: hole.width,
        height: hole.height,
        borderRadius: (hole.borderRadius ?? holeBorderRadius) + HOLE_RADIUS_BOOST,
      })),
    [holes, holeBorderRadius, overscrollMargin]
  );

  // Expose the measured layout so a host (e.g. SearchFilters) can warm-restore it and
  // avoid a measure-flash when the sheet re-opens.
  React.useEffect(() => {
    if (!onMeasuredLayoutChange || viewportWidth <= 0 || rowHeight <= 0) {
      return;
    }
    onMeasuredLayoutChange({ holeMap, viewportWidth, rowHeight });
  }, [holeMap, onMeasuredLayoutChange, rowHeight, viewportWidth]);

  // Auto-wrap each control in a hole slot keyed by position.
  const slots = React.Children.toArray(children).map((child, index) => (
    <StripHoleSlot key={index} holeKey={`strip-slot-${index}`} borderRadius={holeBorderRadius}>
      {child}
    </StripHoleSlot>
  ));

  return (
    <FrostedFilterStripContext.Provider value={ctx}>
      <View
        style={[styles.wrapper, style]}
        testID={testID}
        onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      >
        {!disableBlur ? <FrostedGlassBackground /> : null}
        <View
          style={styles.paddedWrapper}
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width;
            setViewportWidth((prev) => (Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth));
          }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            directionalLockEnabled
            alwaysBounceHorizontal
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentInset }]}
            style={styles.scroll}
          >
            <View
              style={styles.cutoutStrip}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setStripContentWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
                setRowHeight((prev) => (Math.abs(prev - height) < 0.5 ? prev : height));
              }}
            >
              <View style={styles.toggleRow}>
                {stripContentWidth > 0 && rowHeight > 0 && maskedHoles.length > 0 ? (
                  <MaskedHoleOverlay
                    pointerEvents="none"
                    holes={maskedHoles}
                    backgroundColor={surfaceColor}
                    style={[
                      styles.maskOverlay,
                      {
                        width: maskWidth,
                        height: maskHeight,
                        top: maskTopOffset,
                        left: -overscrollMargin,
                      },
                    ]}
                  />
                ) : null}
                <View style={styles.toggleRowContent}>{slots}</View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </FrostedFilterStripContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  paddedWrapper: {
    width: '100%',
    position: 'relative',
  },
  scroll: {
    flexGrow: 0,
    width: '100%',
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: STRIP_GAP,
    paddingVertical: 0,
  },
  cutoutStrip: {
    position: 'relative',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  toggleRow: {
    position: 'relative',
  },
  toggleRowContent: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: STRIP_GAP,
    paddingVertical: 0,
  },
  maskOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
});
