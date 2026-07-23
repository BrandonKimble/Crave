import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { FrostCutout } from '../../overlays/SceneBodyFoundationSurface';
import { CutoutSkeletonSurface } from './CutoutSkeletonSurface';

/**
 * THE HOLE SHAPE (THE PAGE L0): a single cutout placeholder for any pending chrome or
 * identity block — header titles, avatars, name bars, stat values. Titles and identity
 * blocks are hole SHAPES on the one loading material, never a second material: the
 * shape renders the same cutout plate + domino shimmer as every body skeleton. It is a TRUE
 * cutout: the FrostCutout punches its rect out of the scene's foundation white plate, so the
 * hole reveals the ONE shared frost — never a self-frost or painted stand-in. Knobs default
 * from the shared CUTOUT_SKELETON_CONFIG inside the surface, so it tunes together with
 * everything else. (SkeletonBox, the old gray second material, is DELETED — the owner's
 * "solid gray sheets".)
 */
export type CutoutSkeletonShapeProps = {
  /** Width of the shape (px). */
  width?: number;
  /** Height of the shape (px). */
  height?: number;
  /** Corner radius; defaults to a pill (height/2). Pass explicitly for circles etc. */
  borderRadius?: number;
  style?: ViewStyle | ViewStyle[];
};

export const CutoutSkeletonShape: React.FC<CutoutSkeletonShapeProps> = ({
  width = 150,
  height = 18,
  borderRadius,
  style,
}) => (
  <FrostCutout
    borderRadius={borderRadius ?? height / 2}
    style={[{ width, height }, style]}
  >
    <View style={{ width, height }} pointerEvents="none">
      <CutoutSkeletonSurface
        holes={[{ x: 0, y: 0, width, height, borderRadius: borderRadius ?? height / 2 }]}
      />
    </View>
  </FrostCutout>
);

export default CutoutSkeletonShape;
