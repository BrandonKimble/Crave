import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { CUTOUT_SKELETON_CONFIG } from './cutout-skeleton-config';
import { CutoutSkeletonSurface } from './CutoutSkeletonSurface';

/**
 * THE HOLE SHAPE (THE PAGE L0): a single cutout placeholder for any pending chrome or
 * identity block — header titles, avatars, name bars, stat values. Titles and identity
 * blocks are hole SHAPES on the one loading material, never a second material: the
 * shape renders the same cutout plate + domino shimmer as every body skeleton, with a
 * self-contained frosted backing so it works over white plates, driven by the shared
 * CUTOUT_SKELETON_CONFIG — so it tunes together with everything else. (SkeletonBox,
 * the old gray second material, is DELETED — the owner's "solid gray sheets".)
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
  <View style={[{ width, height }, style]} pointerEvents="none">
    <CutoutSkeletonSurface
      holes={[{ x: 0, y: 0, width, height, borderRadius: borderRadius ?? height / 2 }]}
      withFrost
      shimmerMode={CUTOUT_SKELETON_CONFIG.shimmerMode}
      shimmerDurationMs={CUTOUT_SKELETON_CONFIG.shimmerDurationMs}
      shimmerColor={CUTOUT_SKELETON_CONFIG.shimmerColor}
      shimmerIntensity={CUTOUT_SKELETON_CONFIG.shimmerIntensity}
      dominoSpread={CUTOUT_SKELETON_CONFIG.dominoSpread}
      dominoSharpness={CUTOUT_SKELETON_CONFIG.dominoSharpness}
      plateColor={CUTOUT_SKELETON_CONFIG.plateColor}
    />
  </View>
);

export default CutoutSkeletonShape;
