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
// Shape contrast comes from the holes revealing the constant frosted map behind the sheet (the same
// frost the header grab-handle / close-button cutouts reveal). The scenes that sit over an opaque
// plate instead of the transparent body lane (the PollDetail comment thread; the header title pill)
// can't reach that map, so they use a SELF-CONTAINED frost tinted by frostTint* below — kept here so
// the preview's frost-gray slider maps to the same value those production paths use.
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
  /** Self-frost tint for the scenes that can't frost-through to the map (PollDetail comment, title). */
  frostTintColor: string;
  frostTintOpacity: number;
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
  // A neutral gray so the self-frost windows read as frosted gray (not a faint blur of white),
  // consistent with the real frosted-map windows on the frost-through scenes.
  frostTintColor: 'rgb(146, 151, 159)',
  frostTintOpacity: 0.4,
};
