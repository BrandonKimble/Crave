import { ItemDedupeMergeService } from './food-dedupe-merge.service';
import { LoggerService } from '../../../shared';

/**
 * THE TRIPWIRE AT THE CHOKEPOINT (merge-batch audit 2026-08-30, action #4):
 * settleDedupeVerdict is the one place every dedupe merge — judge lanes AND
 * the deterministic auto lanes — records its verdict, so the refusal proven
 * here covers them all. A merge whose reason names a banned class must be
 * recorded as a 'hold' with no plan, and its effect must never run.
 */
function noopLogger(): LoggerService {
  const logger = {
    setContext: () => logger,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
  return logger as never;
}

const PAIR = {
  a_id: '11111111-1111-4111-8111-111111111111',
  a_name: 'carnitas',
  b_id: '22222222-2222-4222-8222-222222222222',
  b_name: 'carnitas tacos',
};
const PLAN = {
  winnerId: PAIR.b_id,
  winnerName: PAIR.b_name,
  loserId: PAIR.a_id,
  loserName: PAIR.a_name,
  entityType: 'item' as const,
};

function buildService() {
  const recorded: Array<{
    outcome: string;
    reason: string;
    subject: { plan: unknown };
  }> = [];
  const executed: unknown[] = [];
  const ledger = {
    record: (input: (typeof recorded)[number]) => {
      recorded.push(input);
      return Promise.resolve();
    },
    markExecuted: () => Promise.resolve(undefined),
  };
  const service = new ItemDedupeMergeService(
    {} as never,
    {} as never,
    {} as never,
    ledger as never,
    noopLogger(),
  );
  (service as never as Record<string, unknown>).executeItemMergePlan = (
    plan: unknown,
  ) => {
    executed.push(plan);
    return Promise.resolve();
  };
  return { service, recorded, executed };
}

type Settle = (
  pair: typeof PAIR,
  via: string,
  outcome: 'merge' | 'hold',
  reason: string,
  plan: typeof PLAN | null,
) => Promise<'merge' | 'hold'>;

describe('merge-reason tripwire at settleDedupeVerdict', () => {
  it('a merge whose reason names a banned class is recorded as hold, plan dropped, effect never runs', async () => {
    const { service, recorded, executed } = buildService();
    const settle: Settle = (
      service as never as { settleDedupeVerdict: Settle }
    ).settleDedupeVerdict.bind(service) as Settle;
    const outcome: 'merge' | 'hold' = await settle(
      PAIR,
      'embedding+judge',
      'merge',
      'format fold, same restaurant',
      PLAN,
    );
    expect(outcome).toBe('hold');
    expect(recorded).toHaveLength(1);
    expect(recorded[0].outcome).toBe('hold');
    expect(recorded[0].reason).toContain('banned class: format-fold');
    expect(recorded[0].reason).toContain('format fold, same restaurant');
    expect(recorded[0].subject.plan).toBeNull();
    expect(executed).toEqual([]);
  });

  it('a merge with a clean reason records as merge and executes its plan', async () => {
    const { service, recorded, executed } = buildService();
    const settle: Settle = (
      service as never as { settleDedupeVerdict: Settle }
    ).settleDedupeVerdict.bind(service) as Settle;
    const outcome: 'merge' | 'hold' = await settle(
      PAIR,
      'embedding+judge',
      'merge',
      'cross-language synonym',
      PLAN,
    );
    expect(outcome).toBe('merge');
    expect(recorded[0].outcome).toBe('merge');
    expect(executed).toEqual([PLAN]);
  });

  it('a hold is never inspected — a banned phrase may lawfully ground a keep', async () => {
    const { service, recorded, executed } = buildService();
    const settle: Settle = (
      service as never as { settleDedupeVerdict: Settle }
    ).settleDedupeVerdict.bind(service) as Settle;
    const outcome: 'merge' | 'hold' = await settle(
      PAIR,
      'embedding+judge',
      'hold',
      'format fold would be required — the pair is two things',
      null,
    );
    expect(outcome).toBe('hold');
    expect(recorded[0].outcome).toBe('hold');
    expect(recorded[0].reason).toBe(
      'format fold would be required — the pair is two things',
    );
    expect(executed).toEqual([]);
  });
});
