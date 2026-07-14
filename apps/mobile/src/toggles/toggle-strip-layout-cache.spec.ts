import {
  clampToggleStripScrollX,
  pruneToggleStripHoleMapToRenderedSlots,
  clearToggleStripCacheScrollX,
  cloneToggleStripLayoutCache,
  registerToggleStripSeatResetListener,
  type ToggleStripCacheSeat,
  type ToggleStripLayoutCache,
} from './toggle-strip-layout-cache';

describe('toggle-strip-layout-cache', () => {
  describe('cloneToggleStripLayoutCache', () => {
    const cache: ToggleStripLayoutCache = {
      viewportWidth: 390,
      rowHeight: 34,
      contentWidth: 612,
      holeMap: {
        'strip-slot-.$sort': { x: 0, y: 0, width: 64, height: 34, borderRadius: 8 },
        'strip-slot-.$segment': { x: 72, y: 0, width: 180, height: 34, borderRadius: 8 },
      },
      controlLayouts: {
        '.$segment': [
          { x: 0, y: 0, width: 90, height: 34 },
          { x: 90, y: 0, width: 90, height: 34 },
        ],
      },
      scrollX: 42,
    };

    it('null-passes empty input', () => {
      expect(cloneToggleStripLayoutCache(null)).toBeNull();
      expect(cloneToggleStripLayoutCache(undefined)).toBeNull();
    });

    it('deep-copies every layer (mutating the clone never touches the source)', () => {
      const clone = cloneToggleStripLayoutCache(cache);
      expect(clone).toEqual(cache);
      expect(clone).not.toBe(cache);
      clone!.holeMap['strip-slot-.$sort']!.x = 999;
      clone!.controlLayouts['.$segment']![0]!.width = 999;
      clone!.scrollX = 999;
      expect(cache.holeMap['strip-slot-.$sort']!.x).toBe(0);
      expect(cache.controlLayouts['.$segment']![0]!.width).toBe(90);
      expect(cache.scrollX).toBe(42);
    });

    it('preserves sparse control-layout entries (undefined segments not yet measured)', () => {
      const sparse: ToggleStripLayoutCache = {
        ...cache,
        controlLayouts: { '.$segment': [undefined, { x: 90, y: 0, width: 90, height: 34 }] },
      };
      const clone = cloneToggleStripLayoutCache(sparse);
      expect(clone!.controlLayouts['.$segment']![0]).toBeUndefined();
      expect(clone!.controlLayouts['.$segment']![1]).toEqual({
        x: 90,
        y: 0,
        width: 90,
        height: 34,
      });
    });
  });

  describe('clearToggleStripCacheScrollX (owner decision: reset on re-present, persist across tab flips)', () => {
    const makeSeat = (initial: ToggleStripLayoutCache | null) => {
      let stored: ToggleStripLayoutCache | null = initial;
      const seat: ToggleStripCacheSeat = {
        read: () => stored,
        write: (cache) => {
          stored = cache;
        },
      };
      return { seat, get: () => stored };
    };
    const warmCache: ToggleStripLayoutCache = {
      viewportWidth: 390,
      rowHeight: 34,
      contentWidth: 612,
      holeMap: { 'strip-slot-.$sort': { x: 0, y: 0, width: 64, height: 34, borderRadius: 8 } },
      controlLayouts: { '.$segment': [{ x: 0, y: 0, width: 90, height: 34 }] },
      scrollX: 189,
    };

    it('PERSISTS across an intra-presentation remount (tab flip): nothing clears, the seat keeps scrollX', () => {
      const { seat } = makeSeat({ ...warmCache });
      // A tab flip is just unmount→remount reading the same seat — no clear call.
      expect(seat.read()!.scrollX).toBe(189);
    });

    it('RESETS on re-present: the presentation-end clear zeroes scrollX but KEEPS the layout half', () => {
      const { seat, get } = makeSeat({ ...warmCache });
      clearToggleStripCacheScrollX(seat);
      const after = get()!;
      expect(after.scrollX).toBe(0);
      expect(after.viewportWidth).toBe(390);
      expect(after.rowHeight).toBe(34);
      expect(after.contentWidth).toBe(612);
      expect(after.holeMap).toEqual(warmCache.holeMap);
      expect(after.controlLayouts).toEqual(warmCache.controlLayouts);
    });

    it('resets LIVE instances too: registered seat listeners fire on clear (retained legs)', () => {
      const { seat } = makeSeat({ ...warmCache });
      let liveResets = 0;
      const unregister = registerToggleStripSeatResetListener(seat, () => {
        liveResets += 1;
      });
      clearToggleStripCacheScrollX(seat);
      expect(liveResets).toBe(1);
      unregister();
      clearToggleStripCacheScrollX(seat);
      expect(liveResets).toBe(1);
    });

    it('no-ops on a cold seat and on an already-zero scrollX (no gratuitous writes)', () => {
      const cold = makeSeat(null);
      expect(() => clearToggleStripCacheScrollX(cold.seat)).not.toThrow();
      expect(cold.get()).toBeNull();
      let writes = 0;
      const zeroed: ToggleStripCacheSeat = {
        read: () => ({ ...warmCache, scrollX: 0 }),
        write: () => {
          writes += 1;
        },
      };
      clearToggleStripCacheScrollX(zeroed);
      expect(writes).toBe(0);
    });
  });

  describe('clampToggleStripScrollX', () => {
    const geometry = { contentWidth: 612, viewportWidth: 390 };

    it('passes an in-range settled offset through untouched', () => {
      expect(clampToggleStripScrollX({ scrollX: 120, ...geometry })).toBe(120);
    });

    it('kills rubber-band negatives (never restore a strip frozen mid-bounce)', () => {
      expect(clampToggleStripScrollX({ scrollX: -35, ...geometry })).toBe(0);
    });

    it('clamps past-the-end offsets to the max for the CURRENT geometry (content shrank)', () => {
      // maxScrollX = 612 − 390 = 222.
      expect(clampToggleStripScrollX({ scrollX: 400, ...geometry })).toBe(222);
    });

    it('content narrower than the viewport pins to 0 (nothing to scroll)', () => {
      expect(clampToggleStripScrollX({ scrollX: 50, contentWidth: 300, viewportWidth: 390 })).toBe(
        0
      );
    });

    it('unknown geometry trusts the settled offset (minus negatives) instead of killing the restore', () => {
      expect(clampToggleStripScrollX({ scrollX: 120, contentWidth: 0, viewportWidth: 390 })).toBe(
        120
      );
      expect(clampToggleStripScrollX({ scrollX: -5, contentWidth: 0, viewportWidth: 390 })).toBe(0);
      expect(clampToggleStripScrollX({ scrollX: 120, contentWidth: 612, viewportWidth: 0 })).toBe(
        120
      );
    });

    it('non-finite input restores to 0', () => {
      expect(clampToggleStripScrollX({ scrollX: Number.NaN, ...geometry })).toBe(0);
      expect(clampToggleStripScrollX({ scrollX: Number.POSITIVE_INFINITY, ...geometry })).toBe(0);
    });
  });

  describe('pruneToggleStripHoleMapToRenderedSlots (leg 4 — the phantom seeded hole is unrepresentable)', () => {
    const holeMap = {
      'strip-slot-.$edit': { x: 0, y: 0, width: 58, height: 34, borderRadius: 8 },
      'strip-slot-.$sort': { x: 66, y: 0, width: 64, height: 34, borderRadius: 8 },
      'strip-slot-.$list-type': { x: 138, y: 0, width: 180, height: 34, borderRadius: 8 },
    };

    it('drops a seeded hole whose control is not rendered this mount (the conditional Edit chip absent at sort=recent)', () => {
      const pruned = pruneToggleStripHoleMapToRenderedSlots(holeMap, [
        'strip-slot-.$sort',
        'strip-slot-.$list-type',
      ]);
      expect(Object.keys(pruned).sort()).toEqual(['strip-slot-.$list-type', 'strip-slot-.$sort']);
      // The phantom window cannot exist: no rendered slot key, no seeded hole.
      expect(pruned['strip-slot-.$edit']).toBeUndefined();
    });

    it('is the identity when every seeded hole has a rendered slot', () => {
      const pruned = pruneToggleStripHoleMapToRenderedSlots(holeMap, [
        'strip-slot-.$edit',
        'strip-slot-.$sort',
        'strip-slot-.$list-type',
      ]);
      expect(pruned).toEqual(holeMap);
    });

    it('an empty render prunes everything (no children — no windows)', () => {
      expect(pruneToggleStripHoleMapToRenderedSlots(holeMap, [])).toEqual({});
    });
  });
});
