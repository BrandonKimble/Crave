import type { SceneLoadingRowType } from '../components/skeletons';
import { resolveSceneLoadingMaterial } from '../navigation/runtime/scene-foundation-spec';
import type { OverlayKey } from '../overlays/types';

/**
 * THE AWAITING-FACE MATERIAL (OA12, 2026-08-08) — variant A as the only law.
 *
 * A content-toggle press paints the scene's declared REFETCH material under the live
 * strip while the new slice is in flight. This resolver is the primitive's one source
 * for that face: always the 'refetch' seam of the ONE material path
 * (resolveSceneLoadingMaterial), so strip holes are never minted (the real strip stays
 * mounted and interactive above the face) and the rowType is the scene's declared
 * skeleton row — cold, refetch and per-scene variants remain one family through the
 * one resolver.
 *
 * Deliberately: there is no argument that disables the face. The OA9-era polls A/B
 * dev-flag global and its bare-white arm are dead by ruling (and banned by the
 * toggle-awaiting-face-law sweep); a bare-white awaiting window is unrepresentable
 * through this module.
 */
export type ToggleAwaitingMaterial = {
  rowType: SceneLoadingRowType;
  withStripHoles: boolean;
};

export const resolveToggleAwaitingMaterial = (scene: OverlayKey): ToggleAwaitingMaterial | null =>
  resolveSceneLoadingMaterial(scene, 'refetch');
