import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { CUTOUT_SKELETON_CONFIG } from './cutout-skeleton-config';
import { CutoutSkeletonSurface } from './CutoutSkeletonSurface';

/**
 * A single-bar cutout placeholder for a sheet HEADER TITLE, shown while a scene's title loads.
 * The standard header chrome (grab handle + close button) stays live and functional — only the
 * title becomes a skeleton. A scene passes this as its `title` node while the real title resolves.
 *
 * The title sits on the header's white plate (over the frost), so the bar uses a self-contained
 * frosted backing (a frosted pill) with the SAME domino shimmer as the body skeletons, driven by
 * the shared CUTOUT_SKELETON_CONFIG — so it tunes together with everything else.
 */
export type CutoutSkeletonTitleProps = {
  /** Width of the title bar (px). */
  width?: number;
  /** Height of the title bar (px). */
  height?: number;
  style?: ViewStyle | ViewStyle[];
};

export const CutoutSkeletonTitle: React.FC<CutoutSkeletonTitleProps> = ({
  width = 150,
  height = 18,
  style,
}) => (
  <View style={[{ width, height }, style]} pointerEvents="none">
    <CutoutSkeletonSurface
      holes={[{ x: 0, y: 0, width, height, borderRadius: height / 2 }]}
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

export default CutoutSkeletonTitle;
