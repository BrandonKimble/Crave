/**
 * Hermetic spec for the transport-owned FlashList merge (F983/F2400/F2954).
 *
 * What must go RED (mutation-proven at authoring time, D69 residual work):
 *  - remove SCENE_FLASH_LIST_MVCP_DEFAULT from the merge → "default present" fails;
 *  - move the default spread AFTER the scene spread → "scene override wins" fails
 *    (the order test is DIRECTIONAL: it asserts the scene's opt-in still wins,
 *    not merely that both keys exist).
 */
import {
  SCENE_FLASH_LIST_MVCP_DEFAULT,
  mergeSceneFlashListProps,
} from './sceneFlashListPropsMerge';

describe('mergeSceneFlashListProps', () => {
  it('supplies the MVCP-disabled default when the scene passes nothing', () => {
    const merged = mergeSceneFlashListProps({
      base: { drawDistance: 250 },
      sceneProps: undefined,
    });
    expect(merged.maintainVisibleContentPosition).toEqual({ disabled: true });
    expect(merged.maintainVisibleContentPosition).toEqual(
      SCENE_FLASH_LIST_MVCP_DEFAULT.maintainVisibleContentPosition
    );
    expect(merged.drawDistance).toBe(250);
  });

  it('lets a scene opt IN by overriding the default (the opt-in door)', () => {
    const merged = mergeSceneFlashListProps({
      base: {},
      sceneProps: {
        maintainVisibleContentPosition: { disabled: false },
      },
    });
    // Directional: the SCENE value must win, proving the default spreads BEFORE
    // the scene props. If the base/default spread moves after the scene spread,
    // this reads { disabled: true } and goes RED.
    expect(merged.maintainVisibleContentPosition).toEqual({ disabled: false });
  });

  it('scene props win over base fields; forced fields win over scene props', () => {
    const merged = mergeSceneFlashListProps({
      base: { drawDistance: 250, removeClippedSubviews: false },
      sceneProps: { drawDistance: 100, style: { opacity: 0.5 } },
      forced: { style: { opacity: 1 } },
    });
    expect(merged.drawDistance).toBe(100); // scene beats base
    expect(merged.style).toEqual({ opacity: 1 }); // forced beats scene
    expect(merged.removeClippedSubviews).toBe(false); // base survives when uncontested
  });

  it('nests overrideProps base → scene → forced', () => {
    const merged = mergeSceneFlashListProps({
      base: {},
      sceneProps: { overrideProps: { initialDrawBatchSize: 7, sceneOnly: 'x' } },
      baseOverrideProps: { initialDrawBatchSize: 2, baseOnly: 'y' },
      forcedOverrideProps: { forcedOnly: 'z' },
    });
    expect(merged.overrideProps).toEqual({
      initialDrawBatchSize: 7, // scene beats base
      baseOnly: 'y',
      sceneOnly: 'x',
      forcedOnly: 'z',
    });
  });

  it('forced overrideProps beat the scene overrideProps', () => {
    const merged = mergeSceneFlashListProps({
      base: {},
      sceneProps: { overrideProps: { initialDrawBatchSize: 7 } },
      forcedOverrideProps: { initialDrawBatchSize: 1 },
    });
    expect(merged.overrideProps).toEqual({ initialDrawBatchSize: 1 });
  });

  it('always emits an overrideProps object, matching the pre-extraction merge shape', () => {
    const merged = mergeSceneFlashListProps({ base: {}, sceneProps: undefined });
    expect(merged.overrideProps).toEqual({});
  });
});
