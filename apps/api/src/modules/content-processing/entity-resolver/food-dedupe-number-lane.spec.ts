/* eslint-disable @typescript-eslint/require-await -- the async jest.fn mocks stand in
   for genuinely async methods; they must return promises to match the interfaces they
   replace, and several legitimately compute nothing asynchronous. */
/**
 * JUDGED VERDICTS OUTRANK MECHANICAL FOLDS — the bitter/bitters class
 * (acceptance red team 2026-08-30).
 *
 * The deterministic number-variant lane folds singular/plural twins in code,
 * no judge. That is a shortcut for pairs nobody has ever had to think about.
 * "bitter" (the adjective) and "bitters" (the cocktail ingredient) are
 * number-variants to the lemma fold, but the dedupe judge, asked, said KEEP
 * — and a judged verdict must beat the code fold, as a RULE, not as a
 * hardcoded pair list (the from-scratch shape: deterministic lanes yield to
 * judged verdicts).
 *
 * Proof + load-bearing control:
 *   1. with a 'hold' verdict ledgered on the pair, the sweep merges NOTHING;
 *   2. delete the verdict row (control) and the SAME sweep merges the pair —
 *      so assertion 1 can go red and the guard is real, not decorative.
 *
 * Pure unit spec: prisma is a dispatcher over the sweep's own SQL shapes, so
 * no database is touched and no other corpus pair can leak into the run.
 */
import { Prisma } from '@prisma/client';
import { ItemDedupeMergeService } from './food-dedupe-merge.service';
import { entityDedupeLane } from './entity-dedupe-lane.adapter';
import { LoggerService } from '../../../shared';

const A_ID = '11111111-1111-4111-8111-111111111111';
const B_ID = '22222222-2222-4222-8222-222222222222';
const HELD_KEY = entityDedupeLane.canonicalClaimKey({
  entityId: A_ID,
  otherEntityId: B_ID,
});

function noopLogger(): LoggerService {
  const logger: Partial<LoggerService> = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  logger.setContext = () => logger as LoggerService;
  return logger as LoggerService;
}

/** The text of a $queryRaw call, whether tagged-template or Prisma.sql. */
function queryText(args: unknown[]): string {
  const first = args[0] as { strings?: readonly string[]; sql?: string };
  if (Array.isArray(first)) return first.join(' ');
  if (typeof first?.sql === 'string') return first.sql;
  if (first?.strings) return first.strings.join(' ');
  return typeof first === 'string' ? first : '';
}

function buildService(options: { holdLedgered: boolean }) {
  const mergedPairs: Array<[string, string]> = [];
  const prisma = {
    $queryRaw: jest.fn(async (...args: unknown[]) => {
      const text = queryText(args);
      if (text.includes('FROM claim_verdicts')) {
        // ledgeredHoldPairs — the guard under test.
        return options.holdLedgered ? [{ claim_key: HELD_KEY }] : [];
      }
      if (text.includes('AS "entityId"')) {
        // activeItems: the number lane's universe — exactly the pair.
        return [
          { entityId: A_ID, name: 'bitter' },
          { entityId: B_ID, name: 'bitters' },
        ];
      }
      // order twins, trigram candidates, anything else: empty.
      return [];
    }),
  };
  const service = new ItemDedupeMergeService(
    prisma as never,
    // No judge lane runs here (flag off by default) — a call is a defect.
    {
      matchEntitiesBatch: async () => {
        throw new Error('unexpected LLM call from the number-lane spec');
      },
    } as never,
    {} as never,
    {} as never,
    noopLogger(),
    {
      authorizeDrain: ({ dueCount }: { dueCount: number }) =>
        Promise.resolve({ allowed: dueCount, estimate: null }),
    } as never,
    { embedEntities: () => Promise.resolve(0) } as never,
  );
  // Embedding recall is DB-shaped; not this spec's lane.
  (service as never as Record<string, unknown>).embeddingCandidatePairs =
    async () => [];
  (service as never as Record<string, unknown>).mergeItemPair = async (
    _type: string,
    pair: { a_id: string; b_id: string },
  ) => {
    mergedPairs.push([pair.a_id, pair.b_id]);
  };
  return { service, mergedPairs };
}

describe('number-variant lane vs the hearing ledger', () => {
  it('a ledgered judge KEEP (hold) blocks the deterministic number fold', async () => {
    const { service, mergedPairs } = buildService({ holdLedgered: true });
    const summary = await service.run({ dryRun: false });
    expect(mergedPairs).toEqual([]);
    expect(summary.autoMerged).toBe(0);
  });

  it('CONTROL — without the verdict row the same sweep folds the pair (the guard is load-bearing)', async () => {
    const { service, mergedPairs } = buildService({ holdLedgered: false });
    const summary = await service.run({ dryRun: false });
    // Both sweep types (item, ingredient) see the seeded universe.
    expect(mergedPairs.length).toBeGreaterThan(0);
    expect(mergedPairs[0].sort()).toEqual([A_ID, B_ID].sort());
    expect(summary.autoMerged).toBeGreaterThan(0);
  });
});

// Referenced so the import carries weight if the claim-key spelling drifts:
// the guard compares JS-sorted ids against the adapter's canonical key.
void Prisma;
