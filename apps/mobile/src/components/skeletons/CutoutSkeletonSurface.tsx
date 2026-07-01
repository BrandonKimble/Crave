import React from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';

import { FrostedGlassBackground } from '../FrostedGlassBackground';
import MaskedHoleOverlay, { type MaskedHole } from '../MaskedHoleOverlay';
import { CUTOUT_SKELETON_CONFIG, type CutoutShimmerMode } from './cutout-skeleton-config';
import { buildPresetHoles, type CutoutSkeletonRowType } from './cutout-skeleton-presets';

/**
 * THE production loading-skeleton primitive: a sheet-colored plate with skeleton-shaped HOLES
 * punched out of it, pulsed by a shimmer. Where the surface sits over the transparent body lane
 * (the null-plate scenes), the holes reveal the constant frosted MAP behind the sheet — windows
 * onto the frost, the same effect the header grab-handle/close-button cutouts produce. Where it
 * sits over an opaque plate instead (PollDetail comment, the title pill), pass `withFrost` to mount
 * a SELF-contained frosted backing tinted from CUTOUT_SKELETON_CONFIG so those holes still read as
 * frosted windows. The shape contrast comes from the frost, not a per-skeleton tint.
 *
 * Rendered by SceneLoadingSurface (the single chokepoint for every wired scene) and CutoutSkeletonTitle.
 * Tuned via CUTOUT_SKELETON_CONFIG (knobs) + cutout-skeleton-presets.ts (hole geometry).
 *
 * Layer stack (bottom → top), absolutely filled:
 *   1. FrostedGlassBackground (optional `withFrost`) — the self-frost the holes reveal.
 *   2. Shimmer layer ('pulse' | 'sweep' | 'domino') — below the plate, so it reads only through holes.
 *   3. MaskedHoleOverlay — the opaque sheet plate with the holes punched out (top).
 */

const AnimatedRect = Reanimated.createAnimatedComponent(Rect);

export const CUTOUT_SHIMMER_DEFAULT_DURATION_MS = CUTOUT_SKELETON_CONFIG.shimmerDurationMs;
const PULSE_MIN_OPACITY = 0.4;
const PULSE_MAX_OPACITY = 0.85;

export type { CutoutShimmerMode };

export type CutoutSkeletonSurfaceProps = {
  /**
   * Declarative shape list (the core prop): absolute-positioned holes punched out of the plate.
   * Provide this directly, or pass `rowType` to derive a preset list.
   */
  holes?: MaskedHole[];
  /** Convenience: derive `holes` from a named preset (e.g. 'comment'). */
  rowType?: CutoutSkeletonRowType;
  /** How many preset rows to stack when using `rowType`. */
  rowCount?: number;
  /** Horizontal/vertical inset for the preset's first row. */
  insetX?: number;
  insetY?: number;

  /** Mount the self-frosted backing under the holes (scenes that can't frost-through to the map). */
  withFrost?: boolean;
  /** BlurView intensity for the frost backing (when `withFrost`). */
  frostIntensity?: number;
  /** Frost tint override (when `withFrost`). Defaults to the shared config tint. */
  frostTintColor?: string;
  frostTintOpacity?: number;

  // --- Shimmer knobs (default to the shared config so a dropped prop renders the shipped look) ---
  shimmerMode?: CutoutShimmerMode;
  shimmerDurationMs?: number;
  shimmerColor?: string;
  shimmerIntensity?: number;
  /** Sweep band tilt in degrees. */
  shimmerAngle?: number;
  /** Sweep band width as a fraction of the surface width. */
  shimmerWidthFraction?: number;
  /** Domino: wave-cycles spanning the surface (stagger amount). */
  dominoSpread?: number;
  /** Domino: pulse sharpness — higher = tighter peaks. */
  dominoSharpness?: number;

  /** Plate color punched with holes. Defaults to the shared config (sheet white). */
  plateColor?: string;

  style?: ViewStyle | ViewStyle[];
};

const DEFAULT_SHIMMER_ANGLE = 22;
const DEFAULT_SHIMMER_WIDTH_FRACTION = 0.85;

/**
 * One hole's pulsing highlight for `domino` mode. Every hole breathes on the SAME clock but offset
 * by `phase` (from its diagonal position), so the bright peak rolls top-left → bottom-right. NOTE:
 * each hole owns its useAnimatedStyle worklet (the per-hole stagger requires per-hole opacity) — the
 * shared clock shares the TIME, not the per-frame work; keep hole counts reasonable + the size
 * quantized so the worklet set doesn't churn on every onLayout.
 */
type DominoHoleProps = {
  hole: MaskedHole;
  phase: number;
  clock: SharedValue<number>;
  intensity: number;
  sharpness: number;
  color: string;
};

const DominoHole: React.FC<DominoHoleProps> = ({
  hole,
  phase,
  clock,
  intensity,
  sharpness,
  color,
}) => {
  const style = useAnimatedStyle(() => {
    const cyclePos = (((clock.value - phase) % 1) + 1) % 1;
    const base = 0.5 + 0.5 * Math.cos(2 * Math.PI * cyclePos);
    return { opacity: Math.pow(base, sharpness) * intensity };
  });
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: hole.x,
          top: hole.y,
          width: hole.width,
          height: hole.height,
          borderRadius: hole.borderRadius ?? 0,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
};

export const CutoutSkeletonSurface: React.FC<CutoutSkeletonSurfaceProps> = ({
  holes,
  rowType,
  rowCount = 6,
  insetX = 16,
  insetY = 8,
  withFrost = false,
  frostIntensity,
  frostTintColor = CUTOUT_SKELETON_CONFIG.frostTintColor,
  frostTintOpacity = CUTOUT_SKELETON_CONFIG.frostTintOpacity,
  shimmerMode = CUTOUT_SKELETON_CONFIG.shimmerMode,
  shimmerDurationMs = CUTOUT_SKELETON_CONFIG.shimmerDurationMs,
  shimmerColor = CUTOUT_SKELETON_CONFIG.shimmerColor,
  shimmerIntensity = CUTOUT_SKELETON_CONFIG.shimmerIntensity,
  shimmerAngle = DEFAULT_SHIMMER_ANGLE,
  shimmerWidthFraction = DEFAULT_SHIMMER_WIDTH_FRACTION,
  dominoSpread = CUTOUT_SKELETON_CONFIG.dominoSpread,
  dominoSharpness = CUTOUT_SKELETON_CONFIG.dominoSharpness,
  plateColor = CUTOUT_SKELETON_CONFIG.plateColor,
  style,
}) => {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  // Quantize the measured size to whole px so sub-pixel layout deltas (which fire repeatedly while
  // the sheet body animates open) don't rebuild the hole list / domino phases and churn the
  // per-hole animated views mid-reveal.
  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    const height = Math.round(event.nativeEvent.layout.height);
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  // Honor reduce-motion: render the skeleton STATIC (no infinite shimmer loop) for users who opt out.
  const [reduceMotion, setReduceMotion] = React.useState(false);
  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Resolve the hole list: explicit `holes` wins, else derive from `rowType`.
  const resolvedHoles = React.useMemo<MaskedHole[]>(() => {
    if (holes && holes.length > 0) {
      return holes;
    }
    if (rowType && size.width > 0) {
      return buildPresetHoles({
        rowType,
        rowWidth: size.width - insetX * 2,
        rowCount,
        insetX,
        insetY,
      });
    }
    return [];
  }, [holes, rowType, rowCount, insetX, insetY, size.width]);

  // --- Pulse: a full-surface highlight whose opacity breathes. ---
  const pulse = useSharedValue(PULSE_MAX_OPACITY);
  React.useEffect(() => {
    if (shimmerMode !== 'pulse') {
      return undefined;
    }
    cancelAnimation(pulse);
    if (reduceMotion) {
      pulse.value = (PULSE_MIN_OPACITY + PULSE_MAX_OPACITY) / 2;
      return undefined;
    }
    pulse.value = PULSE_MAX_OPACITY;
    pulse.value = withRepeat(
      withTiming(PULSE_MIN_OPACITY, { duration: shimmerDurationMs, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(pulse);
  }, [pulse, shimmerMode, shimmerDurationMs, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value * shimmerIntensity }));

  // --- Sweep: one wide diagonal band that crosses the whole surface as a single wave. ---
  const sweep = useSharedValue(0);
  React.useEffect(() => {
    if (shimmerMode !== 'sweep') {
      return undefined;
    }
    cancelAnimation(sweep);
    if (reduceMotion) {
      sweep.value = 0.5;
      return undefined;
    }
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: shimmerDurationMs, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(sweep);
  }, [sweep, shimmerMode, shimmerDurationMs, reduceMotion]);

  const cx = size.width / 2;
  const cy = size.height / 2;
  const surfaceDiagonal = Math.hypot(size.width, size.height);
  const bandWidth = Math.max(1, size.width * shimmerWidthFraction);
  const sweepStartX = cx - surfaceDiagonal / 2 - bandWidth;
  const sweepRange = surfaceDiagonal + bandWidth;
  const sweepAnimatedProps = useAnimatedProps(() => ({
    x: sweepStartX + sweep.value * sweepRange,
  }));

  // --- Domino: every hole pulses on ONE shared clock, phase-offset by its diagonal position. ---
  const dominoClock = useSharedValue(0);
  React.useEffect(() => {
    if (shimmerMode !== 'domino') {
      return undefined;
    }
    cancelAnimation(dominoClock);
    if (reduceMotion) {
      dominoClock.value = 0;
      return undefined;
    }
    dominoClock.value = 0;
    dominoClock.value = withRepeat(
      withTiming(1, { duration: shimmerDurationMs, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(dominoClock);
  }, [dominoClock, shimmerMode, shimmerDurationMs, reduceMotion]);

  const dominoPhases = React.useMemo(() => {
    const denom = size.width + size.height || 1;
    return resolvedHoles.map((h) => {
      const projected = h.x + h.width / 2 + (h.y + h.height / 2);
      return (projected / denom) * dominoSpread;
    });
  }, [resolvedHoles, size.width, size.height, dominoSpread]);

  const containerStyle = style ? [styles.fill, style] : styles.fill;

  return (
    <View style={containerStyle} onLayout={onLayout} pointerEvents="none">
      {/* 1. Self-frost backing (only the scenes that can't frost-through to the map). */}
      {withFrost ? (
        <FrostedGlassBackground
          intensity={frostIntensity}
          tintColor={frostTintColor}
          tintOpacity={frostTintOpacity}
        />
      ) : null}

      {/* 2. Shimmer — masked to the holes by the plate above. */}
      {shimmerMode === 'pulse' ? (
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: shimmerColor }, pulseStyle]}
        />
      ) : shimmerMode === 'domino' ? (
        resolvedHoles.map((hole, index) => (
          <DominoHole
            key={index}
            hole={hole}
            phase={dominoPhases[index] ?? 0}
            clock={dominoClock}
            intensity={shimmerIntensity}
            sharpness={dominoSharpness}
            color={shimmerColor}
          />
        ))
      ) : size.width > 0 ? (
        <Svg
          style={StyleSheet.absoluteFillObject}
          width={size.width}
          height={size.height}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id="cutout-shimmer-sweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={shimmerColor} stopOpacity={0} />
              <Stop offset="0.5" stopColor={shimmerColor} stopOpacity={shimmerIntensity} />
              <Stop offset="1" stopColor={shimmerColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <G origin={`${cx}, ${cy}`} rotation={shimmerAngle}>
            <AnimatedRect
              y={cy - surfaceDiagonal}
              width={bandWidth}
              height={surfaceDiagonal * 2}
              fill="url(#cutout-shimmer-sweep)"
              animatedProps={sweepAnimatedProps}
            />
          </G>
        </Svg>
      ) : null}

      {/* 3. The sheet plate with the holes punched out. renderWhenEmpty paints a holes-less plate on
          the first (pre-measure) frame so the scene lands on a solid plate, never a transparent flash. */}
      <MaskedHoleOverlay holes={resolvedHoles} backgroundColor={plateColor} renderWhenEmpty />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
});

export default CutoutSkeletonSurface;
