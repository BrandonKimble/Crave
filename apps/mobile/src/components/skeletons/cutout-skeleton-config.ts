import { colors as themeColors } from '../../constants/theme';

export type CutoutShimmerMode = 'pulse' | 'sweep' | 'domino';

// THE canonical tuning for the app's cutout-shimmer loading skeletons.
//
// Both the production skeletons (SceneLoadingSurface → CutoutSkeletonSurface) and the dev preview
// (CutoutSkeletonDevPreview) read these values. The preview SEEDS its live controls from here; it
// does NOT write back, so tuning is: dial it in the preview, then copy the chosen numbers into this
// file (shimmer knobs) + the per-rowType hole geometry into cutout-skeleton-presets.ts. That manual
// copy IS the co-design loop — there is no runtime persistence.
//
// Shape contrast comes from the holes revealing the ONE constant frosted layer behind the sheet —
// the same frost the toggle-strip / header cutouts reveal. Every skeleton is a true cutout onto it;
// there is no self-frost and no painted imitation (foundation scenes punch the scene plate via
// FrostCutout so nothing opaque sits between the holes and the frost).
export type CutoutSkeletonConfig = {
  /** Shimmer style. We've collapsed on 'domino' (the rolling per-hole pulse). */
  shimmerMode: CutoutShimmerMode;
  /** Loop duration of one shimmer cycle (ms). */
  shimmerDurationMs: number;
  /** Highlight color pulsed inside each hole. */
  shimmerColor: string;
  /** Peak opacity of the highlight (0..1). */
  shimmerIntensity: number;
  /** Domino: wave-cycles spanning the surface — how spread out the stagger is. */
  dominoSpread: number;
  /** Domino: pulse sharpness — higher = tighter, more discrete peaks. */
  dominoSharpness: number;
  /** The opaque sheet plate the holes are punched out of (the sheet white). */
  plateColor: string;
};

export const CUTOUT_SKELETON_CONFIG: CutoutSkeletonConfig = {
  shimmerMode: 'domino',
  shimmerDurationMs: 1800,
  shimmerColor: '#ffffff',
  shimmerIntensity: 0.7,
  dominoSpread: 1.5,
  dominoSharpness: 2.2,
  // The sheet's white surface — the plate that reads as the sheet, with skeleton-shaped windows
  // punched through to the frosted map.
  plateColor: themeColors.surface,
};
