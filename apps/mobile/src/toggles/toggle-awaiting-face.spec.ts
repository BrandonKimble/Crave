import { resolveSceneLoadingMaterial } from '../navigation/runtime/scene-foundation-spec';
import { resolveToggleAwaitingMaterial } from './toggle-awaiting-face';

/**
 * OA12 — the primitive's one face resolver is the 'refetch' seam of the one material
 * path, for every scene. Total sweep over the foundation table: no scene with a
 * foundation row can yield a holed (strip-replacing) awaiting face, because the live
 * strip stays mounted above it. RED by mutating the resolver's seam to 'cold'.
 */
describe('resolveToggleAwaitingMaterial totality', () => {
  const scenes = ['polls', 'listDetail', 'lists', 'profile', 'home', 'saveList'] as const;

  it.each(scenes)('%s: refetch material, never strip holes', (scene) => {
    const material = resolveToggleAwaitingMaterial(scene);
    expect(material).toEqual(resolveSceneLoadingMaterial(scene, 'refetch'));
    if (material != null) {
      expect(material.withStripHoles).toBe(false);
    }
  });
});
