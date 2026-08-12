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
    for (const locale of ['es', 'en']) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM knowledge_pass_runs WHERE pass = $1 AND ran_at >= $2`,
        sweepPass(locale),
        startedAt,
      );
    }
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

  /**
   * THE ASSERTION IS THE WATERMARK, NOT THE BATCH WINDOW. This test used to
   * mint a concept and look for it in `nextBatch(locale, 5000)` — which only
   * worked while the whole backlog fitted in one batch. A routine
   * VOCABULARY_PROMPT_VERSION bump makes every concept due again (8,781 on
   * 2026-08-09), the freshly minted zero-reference concept sorts LAST, and the
   * test went red for a reason that had nothing to do with the ledger. It now
   * asks about exactly ONE named concept and reads the watermark directly, so
   * it says the same thing at any corpus size — and it no longer writes
   * thousands of ledger rows for concepts nobody asked about.
   */
  const isDue = async (locale: string, entityId: string): Promise<boolean> => {
    const rows = await prisma.$queryRawUnsafe<Array<{ due: boolean }>>(
      `SELECT NOT EXISTS (
         SELECT 1 FROM knowledge_pass_runs r
          WHERE r.pass = $1 AND r.subject_id = $2::uuid
       ) AS due`,
      sweepPass(locale),
      entityId,
    );
    return rows[0].due;
  };

  it('an abstained-on concept is asked ONCE, not offered forever', async () => {
    const name = `zzq sweep ledger ${randomUUID().slice(0, 8)}`;
    const id = await mintFood(name);
    expect(await isDue('es', id)).toBe(true);

    const result = await sweep.sweep('es', {
      generator: abstaining,
      entityNames: [name],
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
    expect(await isDue('es', id)).toBe(false);
    // And the honest re-offer signal agrees: the concept has left the backlog.
    const after = await sweep.nextBatch('es', 5000);
    expect(after.requests.map((r) => r.entityId)).not.toContain(id);
  });

  /**
   * THE SAME WATERMARK, IN ENGLISH (L2, 2026-08-11). `en` is a sweepable
   * locale now, and "sweepable" is not one boolean — it is the ledger key
   * (`label_sweep:en`), the due predicate reading it, and the batch that stops
   * offering a concept once it has been asked. If any of those quietly
   * answered for a different locale the en sweep would either re-pay forever
   * or never run at all, and the money is real.
   */
  it('English keeps its OWN ledger, and es cannot answer for it', async () => {
    const name = `zzq sweep en ${randomUUID().slice(0, 8)}`;
    const id = await mintFood(name);
    expect(await isDue('en', id)).toBe(true);

    await sweep.sweep('en', { generator: abstaining, entityNames: [name] });

    const ledger = await prisma.$queryRawUnsafe<Array<{ outcome: string }>>(
      `SELECT outcome FROM knowledge_pass_runs
        WHERE pass = $1 AND subject_id = $2::uuid`,
      sweepPass('en'),
      id,
    );
    expect(ledger).toEqual([{ outcome: 'not_generated' }]);
    expect(await isDue('en', id)).toBe(false);
    // ...and the Spanish sweep is untouched: two locales asking different
    // questions about one concept must not close each other's backlog.
    expect(await isDue('es', id)).toBe(true);

    const after = await sweep.nextBatch('en', 5000);
    expect(after.requests.map((r) => r.entityId)).not.toContain(id);
  });

  it('a fresh English concept is DUE — the en backlog is a real number', async () => {
    // countDue for en used to be unaskable (the sweep filtered English out of
    // its own locale list). It must now answer, and answer about en.
    const name = `zzq sweep en due ${randomUUID().slice(0, 8)}`;
    const id = await mintFood(name);
    expect(await sweep.countDue('en')).toBeGreaterThan(0);
    expect(await isDue('en', id)).toBe(true);
  });

  it('a DRY RUN records nothing — an ask nobody made must not close a concept', async () => {
    const name = `zzq sweep dry ${randomUUID().slice(0, 8)}`;
    const id = await mintFood(name);
    await sweep.sweep('es', {
      entityNames: [name],
      generator: {
        name: 'test-noop',
        dryRun: true,
        generate: () => Promise.resolve([]),
      },
    });
    expect(await isDue('es', id)).toBe(true);
  });
});
