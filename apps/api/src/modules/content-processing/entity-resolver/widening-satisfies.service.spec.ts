import { WideningSatisfiesService } from './widening-satisfies.service';
import {
  ATTRIBUTE_SATISFIES_PROMPT_VERSION,
  INGREDIENT_SATISFIES_PROMPT_VERSION,
} from './widening-satisfies-rule';

/**
 * THE WIDENING COURT'S ADMISSION AND SETTLEMENT LAWS, unit-proven:
 * docket hygiene (missing/archived/mismatched/merged pairs are reported,
 * never guessed at), per-kind rule versions on every verdict, dry-run
 * writes NOTHING, laundered reasons are refused, and a missing verdict is
 * left unreturned — never recorded as a reject.
 */
describe('WideningSatisfiesService', () => {
  const logger = {
    setContext: () => ({ warn: () => {}, info: () => {} }),
  } as never;

  const entity = (
    id: string,
    name: string,
    type: string,
    status = 'active',
  ) => ({ entity_id: id, name, type, status });

  const A = '11111111-1111-1111-1111-111111111111';
  const B = '22222222-2222-2222-2222-222222222222';
  const C = '33333333-3333-3333-3333-333333333333';

  const makeService = (opts: {
    entities: Array<Record<string, string>>;
    llmText?: string;
    decided?: Set<string>;
  }) => {
    const records: unknown[] = [];
    const executed: unknown[] = [];
    const effects: unknown[] = [];
    const prisma = {
      $queryRaw: jest.fn((query: { sql?: string }) => {
        const sql = String(query?.sql ?? '');
        if (sql.includes('FROM core_entities') && sql.includes('status')) {
          return Promise.resolve(opts.entities);
        }
        return Promise.resolve([]);
      }),
      $executeRaw: jest.fn((..._args: unknown[]) => {
        effects.push(_args);
        return Promise.resolve(1);
      }),
    };
    const llm = {
      generateForCaller: jest.fn(() =>
        Promise.resolve(opts.llmText ?? '{"items":[]}'),
      ),
    };
    const ledger = {
      pendingExecution: jest.fn(() => Promise.resolve([])),
      decidedKeys: jest.fn(() => Promise.resolve(opts.decided ?? new Set())),
      record: jest.fn((input: unknown) => {
        records.push(input);
        return Promise.resolve();
      }),
      markExecuted: jest.fn((...args: unknown[]) => {
        executed.push(args);
        return Promise.resolve();
      }),
    };
    const service = new WideningSatisfiesService(
      prisma as never,
      llm as never,
      ledger as never,
      logger,
    );
    return { service, prisma, llm, ledger, records, executed, effects };
  };

  it('skips missing, archived, kind-mismatched and merged-away pairs', async () => {
    const { service, llm } = makeService({
      entities: [
        entity(A, 'pub', 'place_attribute'),
        entity(B, 'bacon', 'ingredient'),
        entity(C, 'dead', 'place_attribute', 'archived'),
      ],
    });
    const summary = await service.hearDocket([
      { fromId: A, toId: '44444444-4444-4444-4444-444444444444' }, // missing
      { fromId: A, toId: B }, // kind mismatch
      { fromId: A, toId: C }, // archived side
      { fromId: A, toId: A }, // same entity
    ]);
    expect(summary.skipped).toBe(4);
    expect(summary.heard).toBe(0);
    // nothing admissible ⇒ the judge is never paid
    expect(llm.generateForCaller).not.toHaveBeenCalled();
  });

  it('dry-run judges but writes NOTHING', async () => {
    const { service, records, executed, effects } = makeService({
      entities: [
        entity(A, 'pub', 'place_attribute'),
        entity(B, 'bar', 'place_attribute'),
      ],
      llmText:
        '{"items":[{"n":1,"verdict":"satisfies","reason":"a pub-goer gets the same night out"}]}',
    });
    const summary = await service.hearDocket([{ fromId: A, toId: B }], {
      dryRun: true,
    });
    expect(summary.satisfies).toBe(1);
    expect(records).toHaveLength(0);
    expect(executed).toHaveLength(0);
    expect(
      effects.filter((e) => String(e).includes('entity_satisfies')),
    ).toHaveLength(0);
  });

  it('apply settles verdict-before-effect with the per-kind rule version', async () => {
    const { service, records, ledger } = makeService({
      entities: [
        entity(A, 'pub', 'place_attribute'),
        entity(B, 'bar', 'place_attribute'),
      ],
      llmText:
        '{"items":[{"n":1,"verdict":"satisfies","reason":"a pub-goer gets the same night out"}]}',
    });
    await service.hearDocket([{ fromId: A, toId: B }], { dryRun: false });
    expect(records).toHaveLength(1);
    const record = records[0] as {
      lane: string;
      ruleVersion: number;
      subject: { promptVersion: number };
    };
    expect(record.lane).toBe('concept_satisfies');
    expect(record.ruleVersion).toBe(ATTRIBUTE_SATISFIES_PROMPT_VERSION);
    expect(record.subject.promptVersion).toBe(
      ATTRIBUTE_SATISFIES_PROMPT_VERSION,
    );
    expect(ledger.markExecuted).toHaveBeenCalled();
  });

  it('ingredient cases carry the ingredient rule version', async () => {
    const { service, records } = makeService({
      entities: [
        entity(A, 'bacon', 'ingredient'),
        entity(B, 'pancetta', 'ingredient'),
      ],
      llmText:
        '{"items":[{"n":1,"verdict":"satisfies","reason":"cured pork belly either way"}]}',
    });
    await service.hearDocket([{ fromId: A, toId: B }], { dryRun: false });
    expect((records[0] as { ruleVersion: number }).ruleVersion).toBe(
      INGREDIENT_SATISFIES_PROMPT_VERSION,
    );
  });

  it('refuses a laundered reason (bare verdict word) — the case stays unreturned', async () => {
    const { service } = makeService({
      entities: [
        entity(A, 'pub', 'place_attribute'),
        entity(B, 'bar', 'place_attribute'),
      ],
      llmText: '{"items":[{"n":1,"verdict":"satisfies","reason":"satisfies"}]}',
    });
    const summary = await service.hearDocket([{ fromId: A, toId: B }]);
    expect(summary.unreturned).toBe(1);
    expect(summary.satisfies).toBe(0);
  });

  it('skips cases already decided at the current rule version', async () => {
    const { service, llm } = makeService({
      entities: [
        entity(A, 'pub', 'place_attribute'),
        entity(B, 'bar', 'place_attribute'),
      ],
      decided: new Set([`${A}>${B}`]),
    });
    const summary = await service.hearDocket([{ fromId: A, toId: B }]);
    expect(summary.skipped).toBe(1);
    expect(llm.generateForCaller).not.toHaveBeenCalled();
  });
});
