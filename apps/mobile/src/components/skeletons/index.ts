// Skeleton/loading primitives. Structure-matched placeholders that paint while a scene's real
// content loads, then swap to content. SceneLoadingSurface is the single chokepoint that drives
// the results/restaurant (dish), save-sheet/bookmarks/profile-favorites (tile), poll detail
// (comment), and recent-history (history) reveals via the cutout-shimmer skeleton.
//
// SkeletonBox is the legacy gray-box atom, kept only for the ProfilePanel identity skeleton.
export { SkeletonBox, SKELETON_PULSE_DURATION_MS } from './SkeletonBox';
export type { SkeletonBoxProps } from './SkeletonBox';
export { SceneLoadingSurface } from './SceneLoadingSurface';
export type { SceneLoadingSurfaceProps, SceneLoadingRowType } from './SceneLoadingSurface';

// Cutout-shimmer skeleton (the production loading skeleton): a white sheet plate with
// skeleton-shaped HOLES punched through to the constant frosted map, pulsed by a domino
// shimmer. SceneLoadingSurface renders this; CutoutSkeletonDevPreview tunes it over the map.
export { CutoutSkeletonSurface } from './CutoutSkeletonSurface';
export type { CutoutSkeletonSurfaceProps, CutoutShimmerMode } from './CutoutSkeletonSurface';
export { CutoutSkeletonTitle } from './CutoutSkeletonTitle';
export type { CutoutSkeletonTitleProps } from './CutoutSkeletonTitle';
export { CutoutSkeletonDevPreview } from './CutoutSkeletonDevPreview';
export { buildPresetHoles, presetRowStride } from './cutout-skeleton-presets';
export type { CutoutSkeletonRowType } from './cutout-skeleton-presets';
export { CUTOUT_SKELETON_CONFIG } from './cutout-skeleton-config';
export type { CutoutSkeletonConfig } from './cutout-skeleton-config';
