import { ReconciliationMultiplierService } from './reconciliation-multiplier.service';
import { ledgerMicros } from './spend-currency';

// LEDGER DOLLARS vs BILLED DOLLARS — the ARITHMETIC of the exchange.
//
// That every stopping mechanism goes THROUGH this exchange used to be a second
// describe here, scanning the call sites for the string `reconciliation?.gross`.
// It is now carried by the LedgerMicros/BilledMicros brands: a ceiling accepts
// only billed micros, and gross() is the only function that produces them. The
// scanner's own blind spot proves the point — it scanned two files, and the
// third campaign drain (TomTom, in places-promotion) had never been grossed at
// all. The types found it in one compile.

describe('reconciliation multiplier', () => {
  function serviceWith(rows: Record<string, number>) {
    const prisma = {
      spendUnitCost: {
        findUnique: jest.fn(
          ({ where }: { where: { workClass_unit: { workClass: string } } }) => {
            const key = where.workClass_unit.workClass.replace(
              'reconciliation.',
              '',
            );
            const value = rows[key];
            return Promise.resolve(
              value === undefined ? null : { microUsdPerUnit: value },
            );
          },
        ),
      },
    };
    return new ReconciliationMultiplierService(prisma as never);
  }

  it('grosses ledger micros into billed micros once primed', async () => {
    const service = serviceWith({ gemini: 1.7 });
    await service.prime(['gemini']);
    expect(service.gross('gemini', ledgerMicros(1_000_000))).toBeCloseTo(
      1_700_000,
    );
  });

  it('a never-reconciled service is 1.0 — the ratio is never invented', async () => {
    const service = serviceWith({});
    await service.prime(['gemini', 'google_places']);
    expect(service.multiplierFor('gemini')).toBe(1);
    expect(service.gross('gemini', ledgerMicros(500_000))).toBe(500_000);
  });

  it('refuses a non-positive or non-finite ratio rather than zeroing spend', async () => {
    // A 0 multiplier would silently make ALL metered spend free — the failure
    // mode that matters most here.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const service = serviceWith({ gemini: bad });
      await service.prime(['gemini']);
      expect({ bad, m: service.multiplierFor('gemini') }).toEqual({
        bad,
        m: 1,
      });
    }
  });

  it('a cold cache under-grosses, never over-grosses', () => {
    // gross() is synchronous on the metering hot path. Before the first
    // refresh lands it must return the LEDGER figure (too low), never a
    // guessed one (which could over-charge an envelope and stop real work).
    const service = serviceWith({ gemini: 1.7 });
    expect(service.gross('gemini', ledgerMicros(1_000_000))).toBe(1_000_000);
  });

  it('a ratio below 1 is honored — we can over-meter too', async () => {
    const service = serviceWith({ google_places: 0.8 });
    await service.prime(['google_places']);
    expect(service.gross('google_places', ledgerMicros(1_000_000))).toBeCloseTo(
      800_000,
    );
  });
});
