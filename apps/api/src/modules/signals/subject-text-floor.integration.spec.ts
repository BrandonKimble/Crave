import { PrismaClient } from '@prisma/client';
import {
  EMITTABLE_TERMS_VIEW,
  SUBJECT_TEXT_K_FLOOR,
} from './subject-text-floor';
import { SignalDemandReadService } from './signal-demand-read.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { LoggerService } from '../../shared';

/**
 * THE K-FLOOR, asserted through the REAL reader against the REAL database.
 *
 * Two earlier versions of this file were weaker in ways only mutation found:
 *  - one re-implemented the reader's SQL and asserted on its own copy, so it
 *    could not have detected the floor being deleted from the service;
 *  - one counted helper call sites in a single file, so it could not see
 *    `warm-query-embedding-cache` reading the raw column and shipping the
 *    terms to a third-party embedding API.
 *
 * Repo-wide coverage now belongs to the `signals.subject-text-emission`
 * scanner (scripts/check-subject-text-emission.ts), which can see every file.
 * This file's job is the part a scanner cannot do: run the queries and look at
 * what actually comes back.
 */
describe('subject-text k-floor', () => {
  const prisma = new PrismaClient();
  const reader = new SignalDemandReadService(
    prisma as unknown as PrismaService,
    {
      setContext: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
    } as unknown as LoggerService,
  );

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * The floor lives in the view, so the TS constant is a mirror. Read the
   * floor back out of the view's own definition rather than trusting that the
   * two were kept in step by hand.
   */
  it('the view enforces exactly SUBJECT_TEXT_K_FLOOR', async () => {
    const [def] = await prisma.$queryRawUnsafe<Array<{ d: string }>>(
      `SELECT pg_get_viewdef($1::regclass, true) AS d`,
      EMITTABLE_TERMS_VIEW,
    );
    const match = def.d.match(/count\(DISTINCT actor_id\)\s*>=\s*(\d+)/);
    if (!match) {
      throw new Error(`Could not read a floor out of the view:\n${def.d}`);
    }
    expect(Number(match[1])).toBe(SUBJECT_TEXT_K_FLOOR);
  });

  /**
   * Independent net: compute the below-floor terms straight from the ledger,
   * then assert the reader returns none of them. Deriving the expectation from
   * the reader's own query is how a verifier inherits its subject's blind spot
   * — a failure this work already committed once, on the demand-mass
   * equivalence "proof".
   */
  it('queryDemand returns no term below the floor', async () => {
    const rare = await prisma.$queryRawUnsafe<Array<{ subject_text: string }>>(
      `SELECT subject_text
       FROM signal_demand_daily
       WHERE subject_text IS NOT NULL
       GROUP BY subject_text
       HAVING count(DISTINCT actor_id) < $1`,
      SUBJECT_TEXT_K_FLOOR,
    );
    if (rare.length === 0) {
      throw new Error(
        'VACUOUS: the corpus contains no below-floor term, so this test ' +
          'cannot show RED. Seed one rather than letting it pass.',
      );
    }

    const rareSet = new Set(rare.map((r) => r.subject_text));
    const prefixes = [...new Set(rare.map((r) => r.subject_text[0]))];
    const leaked: string[] = [];
    for (const prefix of prefixes) {
      const rows = await reader.queryDemand({
        prefix,
        windowDays: 365,
        limit: 500,
      });
      leaked.push(
        ...rows.map((r) => r.queryKey).filter((key) => rareSet.has(key)),
      );
    }
    expect(leaked).toEqual([]);
  });

  /**
   * The view is the authority, so its own contents are worth asserting
   * directly: nothing eligible may be below the floor.
   */
  it('the view itself contains no below-floor term', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ term: string }>>(
      `SELECT v.term
       FROM signal_emittable_terms v
       JOIN (
         SELECT subject_text, count(DISTINCT actor_id) AS n
         FROM signal_demand_daily
         WHERE subject_text IS NOT NULL
         GROUP BY subject_text
       ) t ON t.subject_text = v.term
       WHERE t.n < $1`,
      SUBJECT_TEXT_K_FLOOR,
    );
    expect(rows.map((r) => r.term)).toEqual([]);
  });
});
