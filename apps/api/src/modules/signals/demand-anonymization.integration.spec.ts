import { PrismaClient } from '@prisma/client';

/**
 * THE ANONYMITY INVARIANT, asserted against the live table.
 *
 * Not a transcript of the promotion code — a property of the DATA it produced.
 * The promotion service could be rewritten entirely and this would still be
 * the thing that matters: no row in the anonymous demand table carries a
 * person's words unless enough different people used them.
 *
 * RED RECIPE: lower the floor in DemandAnonymizationService (or insert a row
 * with text and distinct_actors = 1) and re-promote — this names it.
 */
describe('anonymous demand — the k-floor is a property of the table', () => {
  const prisma = new PrismaClient();
  const FLOOR = 3;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('carries NO free text below the k-floor', async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ subject_text: string; distinct_actors: number }>
    >(
      `SELECT subject_text, distinct_actors
       FROM signal_demand_anonymous
       WHERE subject_text IS NOT NULL
         AND subject_id IS NULL
         AND distinct_actors < $1
       LIMIT 20`,
      FLOOR,
    );
    // Printing the offenders names exactly which terms leaked.
    expect(rows.map((r) => `${r.subject_text} (${r.distinct_actors})`)).toEqual(
      [],
    );
  });

  it('has NO actor column at all — anonymity by construction, not by filtering', async () => {
    const cols = await prisma.$queryRawUnsafe<
      Array<{ column_name: string }>
    >(`SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'signal_demand_anonymous'`);
    const names = cols.map((c) => c.column_name);
    // The strongest possible guarantee: a reader cannot leak an identity from
    // a table that has no column holding one.
    expect(names).not.toContain('actor_id');
    expect(names).not.toContain('user_id');
    expect(names).toContain('distinct_actors');
  });

  it('preserves total demand — suppression removes WORDS, never COUNTS', async () => {
    const [daily] = await prisma.$queryRawUnsafe<Array<{ n: bigint | null }>>(
      `SELECT sum(signal_count)::bigint AS n FROM signal_demand_daily`,
    );
    const [anon] = await prisma.$queryRawUnsafe<Array<{ n: bigint | null }>>(
      `SELECT sum(act_count)::bigint AS n FROM signal_demand_anonymous`,
    );
    // If the anonymous table has not been promoted yet, skip rather than
    // assert a vacuous equality of two nulls.
    if (anon?.n == null) return;
    expect(Number(anon.n)).toBe(Number(daily?.n ?? 0));
  });
});
