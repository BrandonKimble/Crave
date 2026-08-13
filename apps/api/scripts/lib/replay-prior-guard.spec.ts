import { replayPriorUsable } from './replay-prior-guard';

describe('replayPriorUsable (the comparability guard)', () => {
  it('accepts the same community set at any scale', () => {
    expect(
      replayPriorUsable({
        priorName: 'reextract:austinfood+FoodNYC:v7',
        priorDocs: 500,
        thisCommunities: ['FoodNYC', 'austinfood'],
        docCount: 60_000,
      }).usable,
    ).toBe(true);
  });

  it('accepts a different set when scale is within 2x, both directions', () => {
    for (const priorDocs of [30_001, 59_999, 100_000, 119_999]) {
      expect(
        replayPriorUsable({
          priorName: 'reextract:austinfood:v7',
          priorDocs,
          thisCommunities: ['FoodNYC'],
          docCount: 60_000,
        }).usable,
      ).toBe(true);
    }
  });

  it('REFUSES a small pilot prior for a large replay (the defect this buys off)', () => {
    const verdict = replayPriorUsable({
      priorName: 'reextract:austinfood:v7',
      priorDocs: 200,
      thisCommunities: ['FoodNYC', 'austinfood'],
      docCount: 60_000,
    });
    expect(verdict.usable).toBe(false);
    expect(verdict.reason).toMatch(/ratio .*x > 2x/);
  });

  it('refuses a prior whose name does not parse rather than treating it as a match', () => {
    const verdict = replayPriorUsable({
      priorName: 'reextract-malformed-name',
      priorDocs: 100,
      thisCommunities: ['austinfood'],
      docCount: 50_000,
    });
    expect(verdict.usable).toBe(false);
  });

  it('refuses a zero-doc prior', () => {
    expect(
      replayPriorUsable({
        priorName: 'reextract:austinfood:v7',
        priorDocs: 0,
        thisCommunities: ['austinfood'],
        docCount: 10,
      }).usable,
    ).toBe(false);
  });
});
