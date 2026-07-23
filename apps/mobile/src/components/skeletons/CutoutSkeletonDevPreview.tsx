import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { CONTENT_HORIZONTAL_PADDING } from '../../screens/Search/constants/search';
import { CUTOUT_SKELETON_CONFIG } from './cutout-skeleton-config';
import { CutoutSkeletonSurface, type CutoutShimmerMode } from './CutoutSkeletonSurface';
import type { CutoutSkeletonRowType } from './cutout-skeleton-presets';

/**
 * Dev-only tuning preview for the cutout-shimmer loading skeletons. It renders the SAME
 * CutoutSkeletonSurface the production skeletons use, OVER THE LIVE APP (the real frosted map),
 * with live controls — so whatever you dial in here reads exactly as it will in a real sheet.
 *
 * Mounted at the App root and shown via a deep link so it never affects a real scene:
 *   show:  crave://cutout-skeleton-preview?show=1
 *   hide:  crave://cutout-skeleton-preview?show=0  (or the on-screen Close button)
 *
 * The overlay is transparent except the cutout area + the control panel, so whatever is behind
 * it shows through — open it from the home/map screen (sheets collapsed) to tune against the real
 * map. The holes are TRUE cutouts — transparent to whatever is behind the overlay, exactly like
 * production (open it over the map so they read as windows onto the real frost).
 *
 * The controls START from CUTOUT_SKELETON_CONFIG (the production values). When a look is dialed in,
 * bake the chosen values back into cutout-skeleton-config.ts (shimmer knobs) and the per-rowType
 * hole geometry into cutout-skeleton-presets.ts — that's the whole co-design loop.
 */

const DEEP_LINK_HOST = 'cutout-skeleton-preview';

const ROW_TYPES: CutoutSkeletonRowType[] = [
  'comment',
  'dish',
  'restaurant',
  'tile',
  'history',
  'photoStrip',
];
const ROW_COUNT_BY_TYPE: Record<CutoutSkeletonRowType, number> = {
  comment: 5,
  dish: 5,
  restaurant: 4,
  tile: 2,
  history: 7,
  photoStrip: 5,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

const Stepper: React.FC<{
  label: string;
  value: number;
  onDelta: (delta: number) => void;
  step?: number;
  format?: (value: number) => string;
}> = ({ label, value, onDelta, step = 0.05, format }) => (
  <View style={styles.controlRow}>
    <Text style={styles.controlLabel}>{label}</Text>
    <View style={styles.stepperGroup}>
      <Pressable style={styles.stepperBtn} onPress={() => onDelta(-step)}>
        <Text style={styles.stepperBtnText}>−</Text>
      </Pressable>
      <Text style={styles.controlValue}>{format ? format(value) : round2(value).toFixed(2)}</Text>
      <Pressable style={styles.stepperBtn} onPress={() => onDelta(step)}>
        <Text style={styles.stepperBtnText}>+</Text>
      </Pressable>
    </View>
  </View>
);

function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentedFull}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            style={[styles.segmentBtnFlex, active && styles.segmentBtnActive]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const CutoutSkeletonDevPreview: React.FC = () => {
  const [visible, setVisible] = React.useState(false);
  const [rowType, setRowType] = React.useState<CutoutSkeletonRowType>('comment');
  const [shimmerMode, setShimmerMode] = React.useState<CutoutShimmerMode>(
    CUTOUT_SKELETON_CONFIG.shimmerMode
  );
  const [shimmerIntensity, setShimmerIntensity] = React.useState(
    CUTOUT_SKELETON_CONFIG.shimmerIntensity
  );
  const [shimmerAngle, setShimmerAngle] = React.useState(22);
  const [shimmerWidth, setShimmerWidth] = React.useState(0.85);
  const [shimmerDurationMs, setShimmerDurationMs] = React.useState(
    CUTOUT_SKELETON_CONFIG.shimmerDurationMs
  );
  const [dominoSpread, setDominoSpread] = React.useState(CUTOUT_SKELETON_CONFIG.dominoSpread);
  const [dominoSharpness, setDominoSharpness] = React.useState(
    CUTOUT_SKELETON_CONFIG.dominoSharpness
  );

  React.useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) {
        return;
      }
      if (!url.includes(DEEP_LINK_HOST)) {
        return;
      }
      const show = /[?&]show=(1|true|on|yes)/i.test(url);
      const hide = /[?&]show=(0|false|off|no)/i.test(url);
      if (hide) {
        setVisible(false);
      } else if (show) {
        setVisible(true);
      } else {
        setVisible((prev) => !prev);
      }
    };
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* The cutout skeleton under test, over whatever is behind the overlay (open from the map
          screen to tune against the real frosted map) — true cutouts, same as production. */}
      <CutoutSkeletonSurface
        rowType={rowType}
        rowCount={ROW_COUNT_BY_TYPE[rowType]}
        insetX={CONTENT_HORIZONTAL_PADDING}
        shimmerMode={shimmerMode}
        shimmerIntensity={shimmerIntensity}
        shimmerColor={CUTOUT_SKELETON_CONFIG.shimmerColor}
        shimmerAngle={shimmerAngle}
        shimmerWidthFraction={shimmerWidth}
        shimmerDurationMs={shimmerDurationMs}
        dominoSpread={dominoSpread}
        dominoSharpness={dominoSharpness}
        plateColor={CUTOUT_SKELETON_CONFIG.plateColor}
        style={styles.cutoutArea}
      />

      {/* Live control panel. */}
      <View style={styles.panel} pointerEvents="auto">
        <Text style={styles.panelTitle}>Cutout skeleton — tune over the map</Text>
        <SegmentedRow options={ROW_TYPES} value={rowType} onChange={setRowType} />
        <SegmentedRow
          options={['pulse', 'sweep', 'domino'] as const}
          value={shimmerMode}
          onChange={setShimmerMode}
        />
        <Stepper
          label="intensity"
          value={shimmerIntensity}
          onDelta={(d) => setShimmerIntensity((v) => clamp01(v + d))}
        />
        {shimmerMode === 'sweep' ? (
          <Stepper
            label="angle"
            value={shimmerAngle}
            step={2}
            format={(v) => `${Math.round(v)}°`}
            onDelta={(d) => setShimmerAngle((v) => Math.max(0, Math.min(80, v + d)))}
          />
        ) : null}
        {shimmerMode === 'sweep' ? (
          <Stepper
            label="width"
            value={shimmerWidth}
            step={0.05}
            onDelta={(d) => setShimmerWidth((v) => Math.max(0.1, Math.min(2.5, round2(v + d))))}
          />
        ) : null}
        {shimmerMode === 'domino' ? (
          <Stepper
            label="spread"
            value={dominoSpread}
            step={0.1}
            onDelta={(d) => setDominoSpread((v) => Math.max(0.2, Math.min(4, round2(v + d))))}
          />
        ) : null}
        {shimmerMode === 'domino' ? (
          <Stepper
            label="sharpness"
            value={dominoSharpness}
            step={0.1}
            onDelta={(d) => setDominoSharpness((v) => Math.max(0.5, Math.min(6, round2(v + d))))}
          />
        ) : null}
        <Stepper
          label="speed (ms)"
          value={shimmerDurationMs}
          step={100}
          format={(v) => `${Math.round(v)}`}
          onDelta={(d) => setShimmerDurationMs((v) => Math.max(400, Math.min(5000, v + d)))}
        />
        <Pressable style={styles.closeBtn} onPress={() => setVisible(false)}>
          <Text style={styles.closeBtnText}>Close preview</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  cutoutArea: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    bottom: 300,
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: 'rgba(17,20,26,0.92)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  panelTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlLabel: {
    color: '#c7ccd6',
    fontSize: 13,
  },
  controlValue: {
    color: '#ffffff',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    minWidth: 44,
    textAlign: 'center',
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 36,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '600',
  },
  segmentedFull: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  segmentBtnFlex: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
  },
  segmentText: {
    color: '#c7ccd6',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#11141a',
  },
  closeBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default CutoutSkeletonDevPreview;
