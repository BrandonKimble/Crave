import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PERSON_DATA_RULES } from './person-data-class';
import { RetentionHorizonService } from './retention-horizon.service';
import { subjectRows } from './person-data-scope';

/**
 * A HORIZON NOBODY ENFORCES IS A LIE, and a SECOND ANSWER DRIFTS.
 *
 * Two failures of the same family, checked together because they are the same
 * mistake at different altitudes:
 *
 *  1. `horizonDays` was declared on three retained rules and NOTHING read it.
 *     `grep horizonDays` outside the declaration returned nothing at all. We
 *     told users financial records are kept for a bounded period and had no
 *     mechanism that would ever end that period — the grace-period disease,
 *     one policy over.
 *
 *  2. The staging scrub answers "what is a person's data?" in 183 lines of
 *     hand-written SQL, which is the SAME question PERSON_DATA_RULES answers.
 *     Two answers drift, and this pair already has: the scrub once matched
 *     `curated_lists.owner_user_id` and destroyed 672 rows of global editorial
 *     content that were nobody's personal data.
 */
describe('retention horizon — the promise has a mechanism', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('every horizon is reachable by the compiler', () => {
    // A horizon on a table the compiler cannot scope is unenforceable: the
    // sweep would skip it silently and the promise would stay unkept while
    // looking kept.
    const unreachable = PERSON_DATA_RULES.filter(
      (rule) =>
        rule.disposition === 'retain' &&
        rule.horizonDays != null &&
        subjectRows(rule.table, { includeRetained: true }) === null,
    ).map((rule) => `${rule.table}.${rule.column}`);
    expect(unreachable).toEqual([]);
    // And the net must be non-empty, or this test is reading an empty list
    // back to itself.
    expect(RetentionHorizonService.horizonRuleKeys().length).toBeGreaterThan(0);
  });

  it('no rule both retains-with-a-horizon and is erased at the deadline', () => {
    // A contradiction: the row would be destroyed at the purge and could never
    // reach the horizon that justifies keeping it. Declaring both means one of
    // the two statements is false.
    expect(RetentionHorizonService.contradictions()).toEqual([]);
  });

  it('the sweep runs against the real schema and reports honestly', async () => {
    const service = new RetentionHorizonService(
      prisma as never,
      {
        setContext: () => ({
          info() {},
          warn() {},
          error() {},
          debug() {},
        }),
      } as never,
    );
    // EXECUTABILITY is the point: a horizon whose SQL does not run is exactly
    // as unenforced as no horizon at all. 2555 days is far beyond any row this
    // corpus holds, so the honest expectation today is zero — what is being
    // proven is that the query RUNS, against every horizon rule, without
    // throwing.
    const overdue = await service.overdue();
    expect(Array.isArray(overdue)).toBe(true);
    expect(overdue).toEqual([]);
  });

  /**
   * THE SCRUB IS A SECOND ANSWER. It cannot be deleted (staging needs SQL that
   * runs without the app), but it must not disagree: every table the
   * declaration says holds a person's data has to be handled there, or staging
   * keeps PII the production eraser destroys.
   */
  it('every table the scrub KEEPS has its person link nulled', () => {
    // The precise invariant, and my first attempt got it wrong: it treated
    // "kept" as "not scrubbed" and flagged `polls`, which is exactly right to
    // keep — a poll survives its author (disposition `sever`: keep the row,
    // drop the link). Keeping a row is only a divergence if the PERSON stays
    // attached to it, so that is what this asserts.
    const scrub = readFileSync(
      join(
        __dirname,
        '../../../../../../scripts/rig/scrub-staging-user-data.sql',
      ),
      'utf8',
    );
    const kept =
      scrub.match(/keep_content text\[\] := ARRAY\[([^\]]+)\]/)?.[1] ?? '';
    const keptTables = [...kept.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keptTables.length).toBeGreaterThan(0);

    const unsevered = keptTables.filter((table) => {
      const personColumns = PERSON_DATA_RULES.filter(
        (rule) =>
          rule.table === table &&
          (rule.disposition === 'sever' || rule.disposition === 'delete_row'),
      ).map((rule) => rule.column);
      // Staging may keep the CONTENT, never the person on it.
      return personColumns.some(
        (column) =>
          !new RegExp(
            `UPDATE[^;]*${table}[^;]*SET\\s+${column}\\s*=\\s*NULL`,
            's',
          ).test(scrub),
      );
    });
    expect(unsevered).toEqual([]);
  });
});
