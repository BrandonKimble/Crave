/**
 * D47 scale pass — the SHAPE of the score write.
 *
 * rebuildAllScores scores the WHOLE graph in one run, so `scored.length` is the
 * corpus (24,032 subjects on the mirror today). The write must therefore cost
 * ONE statement, not one per subject: the per-row shape measured 18.6 s and a
 * 2,461 MB heap at 10x corpus versus 5.3 s / 790 MB for the set-based one, and
 * the heap is what actually kills a container.
 *
 * These specs pin the shape at the only place it can be observed without a
 * database — the SQL the service hands to Prisma — plus the precondition the
 * set-based shape newly depends on.
 */
import { PublicCraveScoreService } from './public-crave-score.service';
import { ScoredCraveSubject } from './public-crave-score.types';

const logger = {
  setContext: jest.fn().mockReturnThis(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

type CapturedStatement = { sql: string; values: unknown[] };

/** Captures every $executeRaw template the write path builds. */
function buildCapturingPrisma(captured: CapturedStatement[]) {
  return {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const statement = { sql: strings.join('?'), values };
      captured.push(statement);
      return statement;
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

function subject(id: string, overrides: Partial<ScoredCraveSubject> = {}) {
  return {
    subjectType: 'connection',
    subjectId: id,
    provenanceSourceId: null,
    endorsementRaw: 1.5,
    percentileRank: 0.5,
    rawDisplay: 5,
    displayScore: 5,
    rising: null,
    factorTrace: {},
    ...overrides,
  } as ScoredCraveSubject;
}

/** writeScores is private — it is the unit under test, reached deliberately. */
function writeScores(
  service: PublicCraveScoreService,
  scored: ScoredCraveSubject[],
  pruneStaleSubjects: boolean,
): Promise<void> {
  return (
    service as unknown as {
      writeScores: (
        runId: string,
        rows: ScoredCraveSubject[],
        config: unknown,
        prune: boolean,
      ) => Promise<void>;
    }
  ).writeScores(
    '00000000-0000-0000-0000-0000000000aa',
    scored,
    service.getConfig(),
    pruneStaleSubjects,
  );
}

describe('writeScores — one statement per RUN, not per subject', () => {
  it('emits a SINGLE upsert for 500 subjects', async () => {
    const captured: CapturedStatement[] = [];
    const service = new PublicCraveScoreService(
      buildCapturingPrisma(captured) as never,
      logger as never,
    );

    const scored = Array.from({ length: 500 }, (_, i) => subject(`id-${i}`));
    await writeScores(service, scored, false);

    // RED against the per-row shape this replaced: that built 500.
    expect(captured).toHaveLength(1);
    expect(captured[0].sql).toContain('INSERT INTO core_public_entity_scores');
    expect(captured[0].sql).toContain('FROM unnest(');
    expect(captured[0].sql).toContain('ON CONFLICT (subject_type, subject_id)');
  });

  it('columns travel as PARALLEL ARRAYS — one bound array per column, each as long as the batch', async () => {
    const captured: CapturedStatement[] = [];
    const service = new PublicCraveScoreService(
      buildCapturingPrisma(captured) as never,
      logger as never,
    );

    const scored = Array.from({ length: 500 }, (_, i) => subject(`id-${i}`));
    await writeScores(service, scored, false);

    const arrays = captured[0].values.filter((value): value is unknown[] =>
      Array.isArray(value),
    );
    // subject_type, subject_id, provenance_source_id, endorsement_raw,
    // percentile_rank, display_score, rising, factor_trace.
    expect(arrays).toHaveLength(8);
    for (const array of arrays) {
      expect(array).toHaveLength(500);
    }
  });

  it('numerics are bound as TEXT so Postgres parses the exact decimal, never a re-rounded float', async () => {
    const captured: CapturedStatement[] = [];
    const service = new PublicCraveScoreService(
      buildCapturingPrisma(captured) as never,
      logger as never,
    );

    await writeScores(
      service,
      [
        subject('id-0', {
          endorsementRaw: 1.234567,
          percentileRank: 0.98765,
          displayScore: 7.42,
          rising: -0.125,
        }),
      ],
      false,
    );

    const arrays = captured[0].values.filter((v): v is unknown[] =>
      Array.isArray(v),
    );
    expect(arrays).toContainEqual(['1.234567']);
    expect(arrays).toContainEqual(['0.98765']);
    expect(arrays).toContainEqual(['7.42']);
    expect(arrays).toContainEqual(['-0.125']);
    expect(captured[0].sql).toContain('::numeric');
  });

  it('a null `rising` survives as a null ARRAY ELEMENT, not the string "null"', async () => {
    const captured: CapturedStatement[] = [];
    const service = new PublicCraveScoreService(
      buildCapturingPrisma(captured) as never,
      logger as never,
    );

    await writeScores(service, [subject('id-0', { rising: null })], false);

    const arrays = captured[0].values.filter((v): v is unknown[] =>
      Array.isArray(v),
    );
    expect(arrays).toContainEqual([null]);
    expect(arrays).not.toContainEqual(['null']);
  });

  it('the stale-subject prune is a SECOND statement in the SAME transaction — atomic with the upsert', async () => {
    const captured: CapturedStatement[] = [];
    const prisma = buildCapturingPrisma(captured);
    const service = new PublicCraveScoreService(
      prisma as never,
      logger as never,
    );

    await writeScores(service, [subject('id-0')], true);

    expect(captured).toHaveLength(2);
    expect(captured[1].sql).toContain('DELETE FROM core_public_entity_scores');
    // Both statements go to ONE $transaction call, in order: upsert then prune.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [firstTxnCall] = prisma.$transaction.mock.calls as [
      [CapturedStatement[]],
    ];
    const batch = firstTxnCall[0];
    expect(batch).toHaveLength(2);
    expect(batch[0].sql).toContain('INSERT INTO');
    expect(batch[1].sql).toContain('DELETE FROM');
  });

  it('a fixture-scoped run emits NO prune — it owns a subset, not the table', async () => {
    const captured: CapturedStatement[] = [];
    const service = new PublicCraveScoreService(
      buildCapturingPrisma(captured) as never,
      logger as never,
    );

    await writeScores(service, [subject('id-0')], false);

    expect(captured).toHaveLength(1);
    expect(captured.some((s) => s.sql.includes('DELETE FROM'))).toBe(false);
  });

  it('REFUSES a duplicated subject by name — the precondition the set-based upsert depends on', async () => {
    const captured: CapturedStatement[] = [];
    const service = new PublicCraveScoreService(
      buildCapturingPrisma(captured) as never,
      logger as never,
    );

    // The per-row loop this replaced silently let the second row overwrite the
    // first; a set-based upsert would instead raise Postgres' opaque "ON
    // CONFLICT DO UPDATE command cannot affect row a second time".
    await expect(
      writeScores(
        service,
        [subject('dupe-id'), subject('other'), subject('dupe-id')],
        false,
      ),
    ).rejects.toThrow('two rows for subject connection:dupe-id');
    expect(captured).toHaveLength(0);
  });

  it('the same id under a DIFFERENT subject_type is not a duplicate — the key is the pair', async () => {
    const captured: CapturedStatement[] = [];
    const service = new PublicCraveScoreService(
      buildCapturingPrisma(captured) as never,
      logger as never,
    );

    await writeScores(
      service,
      [
        subject('shared-id', { subjectType: 'connection' }),
        subject('shared-id', { subjectType: 'restaurant' }),
      ],
      false,
    );

    expect(captured).toHaveLength(1);
  });

  it('an empty run writes NOTHING — no upsert, and no prune that would empty the table', async () => {
    const captured: CapturedStatement[] = [];
    const prisma = buildCapturingPrisma(captured);
    const service = new PublicCraveScoreService(
      prisma as never,
      logger as never,
    );

    await writeScores(service, [], true);

    expect(captured).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
