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

  beforeAll(async () => {
    // The guard its three siblings carry (subject-identity, occurred-at-timezone,
    // entity-alias-lost-update) and this file did not — F6609. Every assertion
    // below is about what the DATABASE returns, so a missing DATABASE_URL turns
    // the whole file into a differently-shaped vacuity: it fails obscurely at
    // the first query with a Prisma initialization error that reads like a
    // broken test rather than a missing environment, or it connects somewhere
    // unintended and reports on a corpus nobody chose.
    //
    // MEASURED while proving this: on a tree that has apps/api/.env, importing
    // @prisma/client INJECTS DATABASE_URL into process.env before any
    // beforeAll runs, so this guard — and its three siblings' — is dormant on
    // every developer machine and live only where the file is absent, which is
    // CI and containers. That is where it matters, and it is worth knowing.
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required — a skipped k-floor test proves nothing.',
      );
    }
    await prisma.$connect();
  });

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
  it('the view admits an at-or-above-floor term and excludes a below-floor one', async () => {
    // A POSITIVE WITNESS THE CASE MINTS ITSELF (F6609). This assertion used to
    // be a bare `expect(belowFloorTerms).toEqual([])`, which returns `[]`
    // identically for an empty database, an empty view, a broken join key and
    // a genuinely correct view. It was not a hypothetical: MEASURED on the dev
    // corpus, signal_emittable_terms holds ZERO rows and no subject_text
    // reaches more than 2 distinct actors against a floor of 3 — so the
    // assertion was empty-vs-empty and could not have shown RED for any
    // reason. Its neighbour twenty lines above already refuses to pass on a
    // corpus that cannot exercise it.
    //
    // Throwing VACUOUS here would only move the vacuity into a permanently red
    // case, since nothing in the corpus reaches the floor. So the case SEEDS
    // both sides instead: one term carrying exactly SUBJECT_TEXT_K_FLOOR
    // distinct actors and one carrying a single actor. Now the emptiness of
    // the second is a DISCRIMINATION — the same machinery that produced the
    // first refused the second — rather than a default, and the case no longer
    // depends on whatever happens to be in the developer's database.
    const above = `f6609-above-${Date.now()}`;
    const below = `f6609-below-${Date.now()}`;
    const actors = Array.from(
      { length: SUBJECT_TEXT_K_FLOOR },
      (_unused, index) =>
        `00000000-0000-4000-8000-00000066090${index.toString(16)}`,
    );
    const seed = async (term: string, actorIds: string[]) => {
      for (const actorId of actorIds) {
        await prisma.$executeRaw`
          INSERT INTO signal_demand_daily
            (row_id, day, place_id, actor_id, kind, subject_type, subject_text,
             signal_count, last_occurred_at)
          VALUES (gen_random_uuid(), CURRENT_DATE, NULL, ${actorId}::uuid,
                  'search', 'query', ${term}, 1, now())
        `;
      }
    };

    try {
      await seed(above, actors);
      await seed(below, actors.slice(0, 1));

      const terms = await prisma.$queryRawUnsafe<Array<{ term: string }>>(
        `SELECT term FROM signal_emittable_terms WHERE term = ANY($1::text[])`,
        [above, below],
      );
      const admitted = terms.map((r) => r.term);

      // The witness: the view CAN admit, so the exclusion below is a choice.
      expect(admitted).toContain(above);
      expect(admitted).not.toContain(below);

      // And the standing repo-wide claim, now known to be non-vacuous.
      const leaked = await prisma.$queryRawUnsafe<Array<{ term: string }>>(
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
      expect(leaked.map((r) => r.term)).toEqual([]);
    } finally {
      await prisma.$executeRaw`
        DELETE FROM signal_demand_daily
        WHERE subject_text IN (${above}, ${below})
      `;
    }
  });
});
