import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { CONTENT_HORIZONTAL_PADDING } from '../../screens/Search/constants/search';
import { FrostCutout } from '../../overlays/SceneBodyFoundationSurface';
import { CutoutSkeletonSurface } from './CutoutSkeletonSurface';
import {
  buildFilterStripPillHoles,
  FILTER_STRIP_HOLES_BLOCK_HEIGHT,
  presetRowStride,
  type CutoutSkeletonRowType,
} from './cutout-skeleton-presets';

/**
 * The loading container. Fills the sheet body and paints a structure-matched CUTOUT-SHIMMER
 * skeleton for the requested row type: a white sheet plate with skeleton-shaped HOLES punched
 * through to the constant frosted map behind the sheet (the same frost the header's grab-handle
 * / close-button cutouts reveal), pulsed by the shared domino shimmer. The later skeleton→content
 * swap replaces this surface with the resolved list.
 *
 * The look is driven entirely by two co-designable inputs: the per-rowType HOLE GEOMETRY
 * (cutout-skeleton-presets.ts) and the shared shimmer knobs (cutout-skeleton-config.ts). This
 * container only sizes the surface and supplies the inset.
 *
 * ONE contrast source (the true-cutout law): every hole is transparent down to the sheet's ONE
 * constant frosted layer — the same frost the toggle-strip / header cutouts reveal. There is no
 * self-frost and no painted imitation. Where the scene body sits on the foundation white plate
 * (SceneBodyFoundationSurface), the surface wraps itself in a FrostCutout: its whole rect is
 * punched out of the scene plate, the skeleton's own plate takes over as THE white there, and
 * the holes reach the real frost. Outside a foundation surface (the search sheet's canonical
 * composition) FrostCutout is a no-op and the lane is transparent by construction.
 */

export type SceneLoadingRowType = CutoutSkeletonRowType;

const DEFAULT_ROW_COUNT = 6;
// A tile row is two tiles tall — fewer rows fill the sheet without a runaway column.
const TILE_ROW_COUNT = 3;

export type SceneLoadingSurfaceProps = {
  /** Which skeleton row to repeat (mirrors the scene's real content). */
  rowType: SceneLoadingRowType;
  /** How many placeholder rows to render. */
  count?: number;
  /**
   * Horizontal inset for the holes (px). The surface always fills the full body lane, so holes are
   * positioned in absolute coordinates: pass the DEFAULT (CONTENT_HORIZONTAL_PADDING) when the
   * surface renders full-width (holes must inset to where the real content sits), or pass 0 when the
   * surface already renders INSIDE a container the transport inset (e.g. a list whose
   * contentContainerStyle has paddingHorizontal) — otherwise the holes double-inset and the
   * skeleton renders narrower than the real content, jumping on the swap.
   */
  insetX?: number;
  /**
   * Prepend a static block of pill-shaped holes where the toggle strip sits (the
   * INITIAL/reveal skeleton — the real strip is hidden then; rows stack below the block).
   * The interaction skeleton omits it: the live strip renders above that cover.
   */
  withFilterStripHoles?: boolean;
  style?: ViewStyle | ViewStyle[];
};

export const SceneLoadingSurface: React.FC<SceneLoadingSurfaceProps> = ({
  rowType,
  count = rowType === 'tile' ? TILE_ROW_COUNT : DEFAULT_ROW_COUNT,
  insetX = CONTENT_HORIZONTAL_PADDING,
  withFilterStripHoles = false,
  style,
}) => {
  const rowCount = Math.max(0, Math.floor(count));
  const stripBlockHeight = withFilterStripHoles ? FILTER_STRIP_HOLES_BLOCK_HEIGHT : 0;
  const extraHoles = React.useMemo(
    () =>
      withFilterStripHoles ? buildFilterStripPillHoles({ originX: insetX, originY: 0 }) : undefined,
    [insetX, withFilterStripHoles]
  );
  // The cutout surface is absolutely filled (no intrinsic height), so guarantee the container is
  // at least tall enough for the rows — otherwise a content-sizing parent (e.g. a ListEmptyComponent
  // without flexGrow) would collapse it to zero and paint no holes. flex:1 still lets it fill a
  // taller body (the white plate covers the whole sheet) when the parent provides the height.
  const minRowsHeight = stripBlockHeight + rowCount * presetRowStride(rowType);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.surface, { minHeight: minRowsHeight }, style]}
    >
      {/* The FrostCutout punches this surface's whole rect out of the scene's foundation white
          plate (no-op outside one), so the skeleton's own plate is the ONE white here and its
          holes are true windows onto the shared frost. Shimmer knobs + plate color default from
          CUTOUT_SKELETON_CONFIG inside the surface — this container only owns sizing + inset. */}
      <FrostCutout style={styles.cutoutFill}>
        <CutoutSkeletonSurface
          rowType={rowType}
          rowCount={rowCount}
          insetX={insetX}
          insetY={stripBlockHeight}
          extraHoles={extraHoles}
        />
      </FrostCutout>
    </View>
  );
};

const styles = StyleSheet.create({
  // No backgroundColor: the cutout surface's white plate is the sheet, and its holes must be
  // transparent down to the hoisted frosted map.
  surface: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
  },
  cutoutFill: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default SceneLoadingSurface;
