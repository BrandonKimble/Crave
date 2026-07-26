import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';

import MaskedHoleOverlay from '../components/MaskedHoleOverlay';

// ─── The docked strip band (the production cutout composition, kit edition) ────
//
// A WHITE PLATE with holes punched through to whatever renders beneath it (the
// frosted foundation in production) — the same MaskedHoleOverlay the header
// cutout plate and cutout skeletons use. Any strip content works: wrap each
// see-through element in <TrackSheetStripCutout> and the plate grows a matching
// hole; painted elements (active pills) just render normally on top.

type StripHole = { x: number; y: number; width: number; height: number; borderRadius: number };

type StripCutoutContextValue = {
  register: (id: string, hole: StripHole) => void;
  remove: (id: string) => void;
  /** The band's host view — cutouts measure against it (nesting-proof coords). */
  bandRef: React.RefObject<View | null>;
};

const StripCutoutContext = React.createContext<StripCutoutContextValue | null>(null);

export type TrackSheetStripCutoutProps = {
  /** Hole corner radius; defaults to half the measured height (pill). */
  borderRadius?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
};

/** Wrap a strip element to punch its rect through the band's white plate. */
export const TrackSheetStripCutout: React.FC<TrackSheetStripCutoutProps> = ({
  borderRadius,
  style,
  children,
}) => {
  const context = React.useContext(StripCutoutContext);
  const id = React.useId();
  const selfRef = React.useRef<View | null>(null);
  // measureLayout against the BAND, not onLayout's parent-relative frame —
  // nesting-proof (the double-offset gotcha, banked 2026-07-26, generalized).
  const measure = React.useCallback(() => {
    const band = context?.bandRef.current;
    const node = selfRef.current;
    if (band == null || node == null) {
      return;
    }
    node.measureLayout(
      band,
      (x, y, width, height) => {
        context?.register(id, {
          x,
          y,
          width,
          height,
          borderRadius: borderRadius ?? height / 2,
        });
      },
      () => undefined
    );
  }, [borderRadius, context, id]);
  React.useEffect(() => () => context?.remove(id), [context, id]);
  return (
    <View ref={selfRef} onLayout={measure} style={style}>
      {children}
    </View>
  );
};

export type TrackSheetDockedStripProps = {
  /** Band height (pt). */
  height: number;
  /** Rendered UNDER the plate — the see-through target (frost in production). */
  backdrop?: React.ReactNode;
  /** Plate color (the sheet surface color). */
  plateColor?: string;
  /** Strip content; cutout-wrapped children punch holes, others paint on top. */
  children: React.ReactNode;
  /** Content container style (padding etc.) — hole coords are relative to it. */
  contentStyle?: ViewStyle;
};

export const TrackSheetDockedStrip: React.FC<TrackSheetDockedStripProps> = ({
  height,
  backdrop,
  plateColor = '#ffffff',
  children,
  contentStyle,
}) => {
  const holesRef = React.useRef(new Map<string, StripHole>());
  const [holes, setHoles] = React.useState<StripHole[]>([]);
  const bandRef = React.useRef<View | null>(null);
  const contextValue = React.useMemo<StripCutoutContextValue>(
    () => ({
      bandRef,
      register: (id, hole) => {
        holesRef.current.set(id, hole);
        setHoles(Array.from(holesRef.current.values()));
      },
      remove: (id) => {
        if (holesRef.current.delete(id)) {
          setHoles(Array.from(holesRef.current.values()));
        }
      },
    }),
    []
  );
  return (
    <View ref={bandRef} style={[styles.band, { height }]} pointerEvents="box-none">
      {backdrop != null ? <View style={StyleSheet.absoluteFill}>{backdrop}</View> : null}
      <MaskedHoleOverlay holes={holes} backgroundColor={plateColor} renderWhenEmpty />
      <StripCutoutContext.Provider value={contextValue}>
        <View style={[StyleSheet.absoluteFillObject, contentStyle]} pointerEvents="box-none">
          {children}
        </View>
      </StripCutoutContext.Provider>
    </View>
  );
};

const styles = StyleSheet.create({
  band: { overflow: 'hidden' },
});
