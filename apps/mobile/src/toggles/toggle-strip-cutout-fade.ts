/**
 * CUTOUT FADE-IN (wave-3 §2.8 — engine-level, pure + jest-able).
 *
 * A cutout window that appears MID-PRESENTATION (the undo/redo pill replacing the
 * "Edit lists" label after the first edit drops) must never snap a frost hole into a
 * white plate. The engine's mechanism: the hole punches into the mask immediately
 * (the mask is declarative geometry), and a per-hole COVER RECT — a white plate
 * fragment exactly the hole's rounded-rect shape — mounts over the fresh window and
 * animates white → clear. Any control opts in by declaring `stripHoleFadeIn` on its
 * element (the same per-slot convention as `stripHoleBorderRadius`); the engine does
 * the rest for BOTH mask layers (toggle row and action row).
 *
 * This module is the pure half: which holes get covers, and the cover's exact
 * geometry (mirroring the mask's radius default + HOLE_RADIUS_BOOST so cover and
 * window are congruent — an incongruent cover would leave a white sliver or a frost
 * ring at the corners).
 */

export type FadeableStripHole = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
  /** True = this hole's window fades white → clear when it first appears. */
  fadeIn?: boolean;
};

export type CutoutFadeCoverRect = {
  /** The hole-slot key — the cover's identity (one fade per hole appearance). */
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
};

/** House fade duration — matches the strip-citizen entry (one strip tempo). */
export const CUTOUT_FADE_IN_MS = 240;

/**
 * Covers for every fade-in hole in a mask layer's hole map, congruent with the
 * mask window (same radius default + boost the mask applies). Non-fade holes get
 * no cover — their appearance is first-paint chrome, not a mid-presentation punch.
 */
export const resolveCutoutFadeCovers = ({
  holeMap,
  defaultBorderRadius,
  radiusBoost,
}: {
  holeMap: Record<string, FadeableStripHole>;
  defaultBorderRadius: number;
  radiusBoost: number;
}): CutoutFadeCoverRect[] =>
  Object.entries(holeMap)
    .filter(([, hole]) => hole.fadeIn === true)
    .map(([key, hole]) => ({
      key,
      x: hole.x,
      y: hole.y,
      width: hole.width,
      height: hole.height,
      borderRadius: (hole.borderRadius ?? defaultBorderRadius) + radiusBoost,
    }));
