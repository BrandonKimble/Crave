/** K4 price-table math: the gemini.monthlySpend meter's unit economics. */
import { geminiCostMicros, msUntilVendorMonthReset } from './gemini-pricing';

describe('geminiCostMicros (K4 vendor rates, fetched 2026-07-24)', () => {
  it('prices uncached + cached input and output at model rates', () => {
    // 1M uncached in ($0.50) + 1M cached ($0.05) + 1M out ($3.00) = $3.55
    expect(
      geminiCostMicros({
        model: 'gemini-3-flash-preview',
        mode: 'interactive',
        inputTokens: 2_000_000, // full prompt count (cached included)
        cachedTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(3_550_000);
  });

  it('batch mode is a flat 50% discount', () => {
    expect(
      geminiCostMicros({
        model: 'gemini-3-flash-preview',
        mode: 'batch',
        inputTokens: 2_000_000,
        cachedTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(1_775_000);
  });

  it('an UNKNOWN model over-meters at the priciest known flash rate — spend never vanishes', () => {
    const unknown = geminiCostMicros({
      model: 'gemini-99-ultra',
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(unknown).toBe(1_500_000); // $1.50/M input, the 3.5-flash rate
  });

  it('vendor month reset is the next PST month start plus grace', () => {
    // 2026-07-24T13:00Z → PST is 05:00 Jul 24 → reset Aug 1 00:00 PST
    // = Aug 1 08:00Z, +1h grace = Aug 1 09:00Z.
    const now = new Date('2026-07-24T13:00:00Z');
    const ms = msUntilVendorMonthReset(now);
    expect(new Date(now.getTime() + ms).toISOString()).toBe(
      '2026-08-01T09:00:00.000Z',
    );
  });
});
