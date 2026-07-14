import {
  resolveActionRowEnterTranslateX,
  resolveToggleRowExitDistance,
} from './toggle-strip-morph';

describe('toggle-strip-morph', () => {
  describe('resolveToggleRowExitDistance', () => {
    it('is exactly one viewport width — the translation applies to the CLIPPED viewport container, so one viewport fully exits', () => {
      expect(resolveToggleRowExitDistance({ viewportWidth: 390 })).toBe(390);
    });

    it('does NOT scale with content width or scroll offset (the leg-4 over-scaling fix): exit speed matches the action row entry', () => {
      // Same band, any content geometry: the distance is invariant. The old formula
      // (viewport + content − scrollX) made a 2000px strip exit ~6× faster than the
      // action row entered.
      const distance = resolveToggleRowExitDistance({ viewportWidth: 390 });
      expect(distance).toBe(
        -resolveActionRowEnterTranslateX({ actionProgress: 0, viewportWidth: 390 })
      );
    });

    it('unmeasured viewport contributes no translation', () => {
      expect(resolveToggleRowExitDistance({ viewportWidth: 0 })).toBe(0);
    });
  });

  describe('resolveActionRowEnterTranslateX', () => {
    it('sits one viewport off-screen-left at progress 0 and seated at progress 1', () => {
      expect(resolveActionRowEnterTranslateX({ actionProgress: 0, viewportWidth: 390 })).toBe(-390);
      expect(resolveActionRowEnterTranslateX({ actionProgress: 1, viewportWidth: 390 })).toBe(0);
    });

    it('is linear in progress (rides whatever curve drives the shared value)', () => {
      expect(resolveActionRowEnterTranslateX({ actionProgress: 0.25, viewportWidth: 400 })).toBe(
        -300
      );
    });
  });
});
