import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReconciliationMultiplierService } from './reconciliation-multiplier.service';

// LEDGER DOLLARS vs BILLED DOLLARS.
//
// cost-reconcile publishes the billed/ledger ratio per service. It was applied
// in exactly one place — grossing an ESTIMATE for owner approval — while every
// mechanism that decides WHEN TO STOP counted raw ledger dollars. So a
// campaign was minted in billed dollars and drained in ledger dollars: at the
// measured ~1.7x Gemini under-metering an $82 envelope spent ~$139 billed
// before it registered as breached, and the "3x" backstop was really ~5.1x.

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
    expect(service.gross('gemini', 1_000_000)).toBeCloseTo(1_700_000);
  });

  it('a never-reconciled service is 1.0 — the ratio is never invented', async () => {
    const service = serviceWith({});
    await service.prime(['gemini', 'google_places']);
    expect(service.multiplierFor('gemini')).toBe(1);
    expect(service.gross('gemini', 500_000)).toBe(500_000);
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
    expect(service.gross('gemini', 1_000_000)).toBe(1_000_000);
  });

  it('a ratio below 1 is honored — we can over-meter too', async () => {
    const service = serviceWith({ google_places: 0.8 });
    await service.prime(['google_places']);
    expect(service.gross('google_places', 1_000_000)).toBeCloseTo(800_000);
  });
});

// The seam only works if every stopping mechanism actually goes through it.
describe('every spend ceiling counts billed dollars', () => {
  const dir = __dirname;
  const ledger = readFileSync(join(dir, 'usage-ledger.service.ts'), 'utf8');
  const analytics = readFileSync(
    join(dir, 'spend-analytics.service.ts'),
    'utf8',
  );

  it('both monthly pools are metered through the multiplier', () => {
    // Scanned from the CALL SITES, not by searching for the pool name — the
    // name also appears in doc comments, and an earlier version of this test
    // matched one of those and reported a gap that was not there.
    const sites = [...ledger.matchAll(/pools\.meter\(/g)].map((m) =>
      ledger.slice(m.index ?? 0, (m.index ?? 0) + 220),
    );
    const monthly = sites.filter((call) => call.includes('monthlySpend'));
    expect(monthly).toHaveLength(2);
    for (const call of monthly) {
      const pool = /'([\w.]+monthlySpend)'/.exec(call)?.[1] ?? 'unknown';
      expect({ pool, grossed: call.includes('reconciliation?.gross') }).toEqual(
        {
          pool,
          grossed: true,
        },
      );
    }
    // Both pools, not the same one twice.
    const named = monthly.map(
      (call) => /'([\w.]+monthlySpend)'/.exec(call)?.[1],
    );
    expect(new Set(named).size).toBe(2);
  });

  it('the campaign envelope is drained in the currency it was minted in', () => {
    const at = ledger.indexOf('recordSpend(campaignId');
    expect(at).toBeGreaterThan(-1);
    expect(ledger.slice(Math.max(0, at - 300), at)).toContain(
      'reconciliation?.gross',
    );
  });

  it('the derived backstop is grossed IN the expression, not merely nearby', () => {
    // An earlier version asserted the multiplier appeared within 400 chars of
    // the derivation. Deleting it from the ARITHMETIC while leaving the
    // (now-unused) lookup above kept that test green — a check that cannot
    // see the defect it was written for.
    const derivation =
      /const derivedLimitMicros = Math\.round\(([\s\S]{0,200}?)\);/.exec(
        analytics,
      );
    expect(derivation?.[1] ?? null).not.toBeNull();
    expect(derivation![1]).toContain('geminiMultiplier');
    expect(derivation![1]).toContain('BACKSTOP_MULTIPLE');
  });
});
