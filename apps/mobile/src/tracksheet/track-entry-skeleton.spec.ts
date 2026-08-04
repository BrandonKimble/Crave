// ─── G-SKEL / OA2 FALSIFIER (R2): skeleton variants follow the spec data ─────
//
// The contract's Part-3 sample falsifier, executed: for EVERY foundation-spec
// scene, the track's skeleton material is the spec's declared rowType and the
// strip-holes derivation of the SKELETON-STRIP LAW (in-list strips carry pill
// holes; header strips are live chrome above any skeleton; 'none' has nothing
// to represent).
//
// RED-proof record: hardcoding trackSkeletonMaterialForScene to the old
// { rowType: 'restaurant', withStripHoles: false } fails every tile/dish/
// comment scene and the listDetail strip-holes row.

import { SCENE_FOUNDATION_SPECS } from '../navigation/runtime/scene-foundation-spec';
import { trackSkeletonMaterialForScene } from './track-entry-skeleton';

describe('trackSkeletonMaterialForScene (G-SKEL: one material, per-scene shape from data)', () => {
  it.each(Object.entries(SCENE_FOUNDATION_SPECS))(
    '%s renders its declared skeleton variant',
    (sceneKey, spec) => {
      expect(trackSkeletonMaterialForScene(sceneKey)).toEqual({
        rowType: spec.skeleton.rowType,
        withStripHoles: spec.strip === 'in-list',
      });
    }
  );

  it('OA2: at least one scene declares strip-in-skeleton pills and one does not (the variants are real data, not a constant)', () => {
    const materials = Object.keys(SCENE_FOUNDATION_SPECS).map((key) =>
      trackSkeletonMaterialForScene(key)
    );
    expect(materials.some((material) => material.withStripHoles)).toBe(true);
    expect(materials.some((material) => !material.withStripHoles)).toBe(true);
  });

  it('spec-excluded scenes fall back to a total decision (search owns its own composition)', () => {
    expect(trackSkeletonMaterialForScene('search')).toEqual({
      rowType: 'restaurant',
      withStripHoles: false,
    });
  });
});
