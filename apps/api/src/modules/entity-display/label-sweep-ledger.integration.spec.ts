import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { LabelSweepService, sweepPass } from './label-sweep.service';
import type { LabelGenerator } from './label-generator';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';

/**
 * THE SWEEP'S WATERMARK IS THE RUN LEDGER (audit KL-A, applied to the label
 * sweep 2026-08-09) — proven against a real database.
 *
 * THE STARVATION IT CLOSES, executed: a concept the generator ABSTAINS on
 * writes no label row, so an output-only watermark leaves it due forever.
 * The batch is ordered most-referenced-first, so the same abstentions
 * deterministically re-occupy the head of every capped nightly run and the
 * concepts behind them are never reached — the pass reads healthy while doing
 * nothing, which is exactly the shape KL-A found in the satisfies pass.
 */
describe('label sweep run ledger — proven against a live database', () => {
  const prisma = new PrismaClient();
  const made: string[] = [];
  const startedAt = new Date();

  /** A generator that really asks and legitimately produces nothing back. */
  const abstaining: LabelGenerator = {
    name: 'test-abstaining',
    dryRun: false,
    generate: () => Promise.resolve([]),
  };

  const sweep = new LabelSweepService(
    prisma as never,
    {
      adjudicate: jest.fn(),
    } as never,
  );

  const mintFood = async (name: string): Promise<string> => {
    const id = randomUUID();
    const identity = identityInsertData(name, 'food' as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
       VALUES ($1::uuid, $2, 'food'::entity_type, 'active'::entity_status, $3, $4)`,
      id,
      name,
      identity.identityKey,
      identity.identityKeySorted,
    );
    made.push(id);
    return id;
  };

  afterAll(async () => {
    // The sweep under test records an ASK for every concept in its batch —
    // including the real ones that happened to be due. Nobody actually asked
    // about those, so the ledger rows this test wrote are removed and the
    // corpus is left exactly as found.
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_pass_runs WHERE pass = $1 AND ran_at >= $2`,
      sweepPass('es'),
      startedAt,
    );
    if (made.length) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
        made,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
        made,
      );
    }
    await prisma.$disconnect();
  });

  it('an abstained-on concept is asked ONCE, not offered forever', async () => {
    const id = await mintFood(`zzq sweep ledger ${randomUUID().slice(0, 8)}`);

    const before = await sweep.nextBatch('es', 5000);
    expect(before.requests.map((r) => r.entityId)).toContain(id);

    const result = await sweep.sweep('es', {
      limit: 5000,
      generator: abstaining,
    });
    expect(result.written).toBe(0); // nothing was produced...

    // ...and the ask is recorded anyway. That row IS the watermark.
    const ledger = await prisma.$queryRawUnsafe<Array<{ outcome: string }>>(
      `SELECT outcome FROM knowledge_pass_runs
        WHERE pass = $1 AND subject_id = $2::uuid`,
      sweepPass('es'),
      id,
    );
    expect(ledger).toEqual([{ outcome: 'not_generated' }]);

    const after = await sweep.nextBatch('es', 5000);
    expect(after.requests.map((r) => r.entityId)).not.toContain(id);
  });

  it('a DRY RUN records nothing — an ask nobody made must not close a concept', async () => {
    const id = await mintFood(`zzq sweep dry ${randomUUID().slice(0, 8)}`);
    await sweep.sweep('es', {
      limit: 5000,
      generator: {
        name: 'test-noop',
        dryRun: true,
        generate: () => Promise.resolve([]),
      },
    });
    const after = await sweep.nextBatch('es', 5000);
    expect(after.requests.map((r) => r.entityId)).toContain(id);
  });
});
