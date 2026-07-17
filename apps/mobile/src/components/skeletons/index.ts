// THE LOADING MATERIAL (THE PAGE L0): exactly ONE loading material exists anywhere in
// the app — the cutout plate (plate + holes + shimmer). SceneLoadingSurface is the
// scene-body chokepoint; CutoutSkeletonShape is the hole shape for pending chrome and
// identity blocks (titles, avatars, stat bars). There is no gray-box material and no
// hand-rolled pending branch — a second material here failed design review by
// construction (grep-invariants enforces zero SkeletonBox references).
export { SceneLoadingSurface } from './SceneLoadingSurface';
export type { SceneLoadingSurfaceProps, SceneLoadingRowType } from './SceneLoadingSurface';

// Cutout-shimmer skeleton (the production loading skeleton): a white sheet plate with
// skeleton-shaped HOLES punched through to the constant frosted map, pulsed by a domino
// shimmer. SceneLoadingSurface renders this; CutoutSkeletonDevPreview tunes it over the map.
export { CutoutSkeletonSurface } from './CutoutSkeletonSurface';
export type { CutoutSkeletonSurfaceProps, CutoutShimmerMode } from './CutoutSkeletonSurface';
export { CutoutSkeletonShape } from './CutoutSkeletonShape';
export type { CutoutSkeletonShapeProps } from './CutoutSkeletonShape';
export { CutoutSkeletonDevPreview } from './CutoutSkeletonDevPreview';
export { buildPresetHoles, presetRowStride } from './cutout-skeleton-presets';
export type { CutoutSkeletonRowType } from './cutout-skeleton-presets';
export { CUTOUT_SKELETON_CONFIG } from './cutout-skeleton-config';
export type { CutoutSkeletonConfig } from './cutout-skeleton-config';
