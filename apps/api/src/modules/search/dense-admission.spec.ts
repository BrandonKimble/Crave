import {
  DENSE_ADMISSION_PLACEHOLDER_FLOORS as FLOORS,
  denseAdmits,
  denseTypeAdmits,
} from './evidence-admission';

const base = {
  topCosine: 0.78,
  runnerCosine: 0.7,
  rrfRank: 1,
  candidateType: 'food',
  spanTypeAffinity: null as 'attribute' | null,
  inputType: 'food',
};

describe('dense admission tier (M4)', () => {
  it('admits a clear cross-lingual match', () => {
    expect(denseAdmits(base)).toBe(true);
  });

  it('refuses below the cosine floor', () => {
    expect(denseAdmits({ ...base, topCosine: FLOORS.cosine - 0.01 })).toBe(
      false,
    );
  });

  it('refuses when the fused RANK disagrees', () => {
    expect(denseAdmits({ ...base, rrfRank: FLOORS.rrfRankMax })).toBe(false);
  });

  it('refuses when a DIFFERENT answer was nearly as good', () => {
    expect(denseAdmits({ ...base, runnerCosine: base.topCosine - 0.001 })).toBe(
      false,
    );
  });

  it('admits when there is no different-named runner-up at all', () => {
    expect(denseAdmits({ ...base, runnerCosine: 0 })).toBe(true);
  });

  describe('type awareness (R5-4 — the Senza Gluten class)', () => {
    it('never links a restaurant proper noun for a non-restaurant input', () => {
      expect(
        denseTypeAdmits({
          candidateType: 'restaurant',
          spanTypeAffinity: null,
          inputType: 'food',
        }),
      ).toBe(false);
    });

    it('still allows a restaurant candidate for a restaurant input', () => {
      expect(
        denseTypeAdmits({
          candidateType: 'restaurant',
          spanTypeAffinity: null,
          inputType: 'restaurant',
        }),
      ).toBe(true);
    });

    it('refuses a non-attribute candidate when the span has an attribute reading', () => {
      expect(
        denseAdmits({
          ...base,
          candidateType: 'food',
          spanTypeAffinity: 'attribute',
        }),
      ).toBe(false);
      expect(
        denseAdmits({
          ...base,
          candidateType: 'food_attribute',
          spanTypeAffinity: 'attribute',
        }),
      ).toBe(true);
    });
  });

  it('states its floors as PLACEHOLDERS pending the gold-corpus sweep', () => {
    // A guard against the "hand-set 0.82 called validated" failure: if
    // these move, they move because a sweep generated them.
    expect(FLOORS).toEqual({
      cosine: 0.72,
      margin: 0.02,
      rrfRankMax: 3,
      typeMismatchMargin: 0.05,
    });
  });
});
