/** K4 price-table math: the gemini.monthlySpend meter's unit economics. */
import {
  GEMINI_RATES,
  UNKNOWN_MODEL_RATES,
  geminiCostMicros,
  msUntilVendorMonthReset,
} from './gemini-pricing';

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

  it('§24 red team finding 6: NaN token fields sanitize to 0 micros, never NaN (spend must not vanish)', () => {
    expect(
      geminiCostMicros({
        model: 'gemini-3-flash-preview',
        mode: 'interactive',
        inputTokens: NaN,
        outputTokens: NaN,
        cachedTokens: NaN,
      }),
    ).toBe(0);
    // A NaN input alongside a valid output still prices the valid part —
    // one malformed field doesn't erase the whole event's spend.
    expect(
      geminiCostMicros({
        model: 'gemini-3-flash-preview',
        mode: 'interactive',
        inputTokens: NaN,
        outputTokens: 1_000_000, // $3.00/M
        cachedTokens: 0,
      }),
    ).toBe(3_000_000);
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

describe('cache storage pricing', () => {
  it('prices a storage row by token-HOURS, not as a cached read', () => {
    // 17,000 tokens held 30h at $1/M/hr = $0.51 — the figure the code has
    // been quoting in prose while metering none of it.
    const micros = geminiCostMicros({
      model: 'gemini-3-flash-preview',
      cachedTokens: 17_000,
      durationHours: 30,
    });
    expect(micros).toBe(510_000);
  });

  it('does NOT treat a normal cached read as storage', () => {
    const read = geminiCostMicros({
      model: 'gemini-3-flash-preview',
      inputTokens: 17_000,
      cachedTokens: 17_000,
    });
    // Cached READ at $0.05/M = $0.00085, three orders of magnitude below the
    // 30h hold. Conflating them would misprice both.
    expect(read).toBe(850);
  });

  it('storage rows carry no generation cost', () => {
    expect(
      geminiCostMicros({
        model: 'gemini-3-flash-preview',
        cachedTokens: 1_000_000,
        durationHours: 1,
      }),
    ).toBe(1_000_000);
  });
});

describe('UNKNOWN_MODEL_RATES (F121 — the fallback must DOMINATE the table)', () => {
  // The fallback's whole job: spend from a model this table hasn't met
  // OVER-meters rather than vanishing. Because it is DERIVED as the
  // per-field max of GEMINI_RATES, this can only fail if the derivation
  // breaks — adding a pricier model cannot silently demote the fallback.
  const fields = ['input', 'cachedInput', 'output', 'cacheStorage'] as const;

  it('is >= every field of every known model', () => {
    expect(Object.keys(GEMINI_RATES).length).toBeGreaterThan(0);
    for (const [model, rates] of Object.entries(GEMINI_RATES)) {
      for (const field of fields) {
        // The pair is spelled into the assertion so a failure names the
        // model and field that outgrew the fallback.
        expect([
          model,
          field,
          UNKNOWN_MODEL_RATES[field] >= rates[field],
        ]).toEqual([model, field, true]);
      }
    }
  });

  it('meters an unknown model at no less than any known model', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const unknown = geminiCostMicros({ ...usage, model: 'gemini-99-nonesuch' });
    for (const model of Object.keys(GEMINI_RATES)) {
      expect(unknown).toBeGreaterThanOrEqual(
        geminiCostMicros({ ...usage, model }),
      );
    }
  });
});
