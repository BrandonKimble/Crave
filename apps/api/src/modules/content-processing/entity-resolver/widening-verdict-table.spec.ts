/* eslint-disable @typescript-eslint/require-await -- the async jest.fn mocks stand in
   for genuinely async methods; they must return promises to match the interfaces they
   replace, and several legitimately compute nothing asynchronous. */
/**
 * DOCKET DETERMINISM (acceptance red team 2026-08-30): --apply consumes the
 * reviewed verdict table and never re-judges. Three proofs:
 *   1. apply REFUSES without a file, and refuses a stale-rule-version table;
 *   2. settleReviewedVerdicts writes EXACTLY the reviewed rows — no LLM call
 *      exists on its path at all (the judge mock throws);
 *   3. the table's sha256 is recorded on every ledger row's subject
 *      (provenance: each verdict names the table that authorized it).
 */
import { createHash } from 'crypto';
import {
  wideningApplyRefusal,
  wideningTableSha256,
  type WideningVerdictTable,
} from './widening-verdict-table';
import { WideningSatisfiesService } from './widening-satisfies.service';
import { LoggerService } from '../../../shared';

const CURRENT = { attribute: 3, ingredient: 3 };

const tableOf = (ruleVersions: {
  attribute: number;
  ingredient: number;
}): WideningVerdictTable => ({
  generatedAt: new Date().toISOString(),
  ruleVersions,
  rows: [],
});

describe('wideningApplyRefusal', () => {
  it('refuses without a verdict file', () => {
    expect(wideningApplyRefusal(undefined, null, CURRENT)).toContain('REFUSED');
  });

  it('refuses a table judged under different rule versions (stale review)', () => {
    const refusal = wideningApplyRefusal(
      'verdicts.json',
      tableOf({ attribute: 2, ingredient: 3 }),
      CURRENT,
    );
    expect(refusal).toContain('REFUSED');
    expect(refusal).toContain('rule versions');
  });

  it('refuses a file that is not a verdict table', () => {
    expect(wideningApplyRefusal('x.json', null, CURRENT)).toContain('REFUSED');
  });

  it('admits a current-version table', () => {
    expect(
      wideningApplyRefusal('v.json', tableOf(CURRENT), CURRENT),
    ).toBeNull();
  });
});

describe('wideningTableSha256', () => {
  it('is the sha256 of the exact bytes', () => {
    const bytes = Buffer.from('{"rows":[]}');
    expect(wideningTableSha256(bytes)).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
  });
});

describe('settleReviewedVerdicts', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

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

  function build(options: { decided: boolean }) {
    const recorded: Array<Record<string, unknown>> = [];
    const prisma = {
      // live-entity check; the facet guard's query (recognizable by its
      // 'facet' predicate) finds nothing inadmissible.
      $queryRaw: jest.fn(async (query: unknown) =>
        String((query as { sql?: string })?.sql ?? '').includes('facet')
          ? []
          : [{ entity_id: A }, { entity_id: B }],
      ),
    };
    const ledger = {
      decidedKeys: jest.fn(
        async (_l: string, _v: number, _f: unknown, keys: string[]) =>
          options.decided ? new Set(keys) : new Set<string>(),
      ),
      record: jest.fn(async (input: Record<string, unknown>) => {
        recorded.push(input);
      }),
      markExecuted: jest.fn(async () => undefined),
    };
    const llm = {
      // APPLY NEVER RE-JUDGES: any LLM call here is the defect under test.
      generate: jest.fn(() => {
        throw new Error('apply must never call the judge');
      }),
    };
    const service = new WideningSatisfiesService(
      prisma as never,
      llm as never,
      ledger as never,
      noopLogger(),
    );
    (service as never as Record<string, unknown>).applyEffect = async () =>
      undefined;
    return { service, recorded, llm };
  }

  const rows = [
    {
      kind: 'attribute' as const,
      fromId: A,
      fromName: 'bar',
      toId: B,
      toName: 'pub',
      verdict: 'satisfies' as const,
      reason: 'reviewed and approved',
    },
    {
      kind: 'attribute' as const,
      fromId: B,
      fromName: 'pub',
      toId: A,
      toName: 'bar',
      verdict: 'skipped' as const,
      reason: 'not a verdict row — must not settle',
    },
  ];

  it('settles exactly the reviewed verdict rows, stamping the table hash, with no judge call', async () => {
    const { service, recorded, llm } = build({ decided: false });
    const sha = 'a'.repeat(64);
    const result = await service.settleReviewedVerdicts(rows, sha);
    expect(result.settled).toBe(1);
    expect(recorded).toHaveLength(1);
    const subject = recorded[0].subject as Record<string, unknown>;
    expect(subject.reviewedTableSha256).toBe(sha);
    expect(subject.fromEntityId).toBe(A);
    expect(recorded[0].outcome).toBe('satisfies');
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('skips rows already decided at the current rule version (idempotent re-apply)', async () => {
    const { service, recorded } = build({ decided: true });
    const result = await service.settleReviewedVerdicts(rows, 'b'.repeat(64));
    expect(result.settled).toBe(0);
    expect(result.skippedDecided).toBe(1);
    expect(recorded).toHaveLength(0);
  });
});
