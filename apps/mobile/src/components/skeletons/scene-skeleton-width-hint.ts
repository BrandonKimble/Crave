import React from 'react';

/**
 * THE SKELETON WIDTH HINT (strip choreography fix 2a, 2026-08-08).
 *
 * Cutout skeleton holes are a pure function of the surface WIDTH — a quantity the
 * HOST already knows at render time (the track's body cell is window width minus
 * the declared mounted-body inset). Before this hint, every skeleton surface
 * discovered its width via onLayout → setState → a SECOND commit, so its first
 * committed frame was a hole-less white plate: pixel-identical to the white-gap
 * defect the skeleton exists to hide, and (under the one-frame handoff release)
 * frequently the ONLY frame the skeleton ever painted.
 *
 * A host that knows the body lane's width provides it here; SceneLoadingSurface
 * (and through it CutoutSkeletonSurface) seeds its measured size from the hint so
 * `rowType` holes exist on commit 1. onLayout still refines — the hint is declared
 * geometry, never a guess: provide it only where the width is a construction fact.
 *
 * Null = no hint (legacy hosts): behavior is exactly the pre-fix measure-first
 * path.
 */
export const SceneSkeletonWidthHintContext = React.createContext<number | null>(null);
