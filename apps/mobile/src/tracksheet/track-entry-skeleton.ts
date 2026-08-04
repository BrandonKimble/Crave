// ─── SKELETON VARIANTS ARE DATA (G-SKEL / OA2, R2) ───────────────────────────
//
// The track's cold-leg skeleton used to hardcode rowType="restaurant" — a
// second skeleton material, exactly what OA2 forbids. The variant is the
// scene's FOUNDATION-SPEC declaration (rowType + the SKELETON-STRIP LAW's
// strip-holes derivation), resolved through the one existing home
// (resolveSceneLoadingMaterial) — this module only adds the track's fallback
// for the spec-excluded scenes ('search' owns its composition; 'sheetHost' /
// modals never present a track skeleton) so the decision is total and pure.

import type { OverlayKey } from '../overlays/types';
import type { SceneLoadingRowType } from '../components/skeletons';
import { resolveSceneLoadingMaterial } from '../navigation/runtime/scene-foundation-spec';

export type TrackSkeletonMaterial = {
  rowType: SceneLoadingRowType;
  withStripHoles: boolean;
};

const FALLBACK_MATERIAL: TrackSkeletonMaterial = { rowType: 'restaurant', withStripHoles: false };

export const trackSkeletonMaterialForScene = (sceneKey: string): TrackSkeletonMaterial =>
  resolveSceneLoadingMaterial(sceneKey as OverlayKey) ?? FALLBACK_MATERIAL;
