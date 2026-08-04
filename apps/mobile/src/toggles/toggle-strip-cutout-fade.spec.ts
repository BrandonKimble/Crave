import {
  CUTOUT_FADE_IN_MS,
  resolveCutoutFadeCovers,
  type FadeableStripHole,
} from './toggle-strip-cutout-fade';

describe('resolveCutoutFadeCovers (wave-3 §2.8 cutout fade-in)', () => {
  const holeMap: Record<string, FadeableStripHole> = {
    'strip-slot-cancel': { x: 0, y: 4, width: 60, height: 32 },
    'strip-slot-history': { x: 120, y: 4, width: 110, height: 32, borderRadius: 999, fadeIn: true },
    'strip-slot-save': { x: 300, y: 4, width: 64, height: 32, borderRadius: 8 },
  };

  it('emits a cover ONLY for fade-in holes, keyed by the hole-slot key', () => {
    const covers = resolveCutoutFadeCovers({ holeMap, defaultBorderRadius: 8 });
    expect(covers).toHaveLength(1);
    expect(covers[0].key).toBe('strip-slot-history');
  });

  it('cover geometry is congruent with the mask window (rect + boosted radius)', () => {
    const [cover] = resolveCutoutFadeCovers({ holeMap, defaultBorderRadius: 8 });
    expect(cover).toEqual({
      key: 'strip-slot-history',
      x: 120,
      y: 4,
      width: 110,
      height: 32,
      borderRadius: 1000, // declared 999 + HOLE_RADIUS_BOOST — same boost the mask applies
    });
  });

  it('falls back to the mask default radius (+boost) when the hole declares none', () => {
    const covers = resolveCutoutFadeCovers({
      holeMap: { a: { x: 1, y: 2, width: 3, height: 4, fadeIn: true } },
      defaultBorderRadius: 8,
    });
    expect(covers[0].borderRadius).toBe(9);
  });

  it('no fade-in holes → no covers (first-paint chrome never fades)', () => {
    expect(
      resolveCutoutFadeCovers({
        holeMap: { a: { x: 0, y: 0, width: 10, height: 10 } },
        defaultBorderRadius: 8,
      })
    ).toEqual([]);
  });

  // F860 (2026-08-03): the case that lived here — `expect(CUTOUT_FADE_IN_MS).toBe(240)`
  // under a comment claiming it checked the strip-citizen-entry coupling — is DELETED.
  // It restated the literal and never referenced the other side, so it could not show RED
  // on the only defect it named (the two tempos drifting apart) while failing on every
  // legitimate retune. The coupling is now STRUCTURAL: ToggleStrip's STRIP_CITIZEN_ENTER_MS
  // IS this constant, so there is no relation left to assert.
});
