/**
 * D40 §3 — THE DERIVED TASTE PROFILE, and the four laws that make it safe.
 *
 *  1. It reads `signal_demand_daily` THROUGH `dailyActsCteSql` — never raw
 *     `signals`, never a fourth dialect of the act-grain law. RED recipe:
 *     hand-write the CTE and the "builder-shaped SQL" case fails.
 *  2. It stores FACTS: `act_count` and `last_act_at`. No blended affinity
 *     score, no per-kind coefficient. RED recipe: add a weight column or a
 *     coefficient literal and the facts-only case fails.
 *  3. It invents NO horizon. Window 0 means ALL HISTORY, and the two non-zero
 *     windows are ratified constants that already exist. RED recipe: mint a
 *     new number and the windows case fails.
 *  4. It is delete-and-reinsert per (actor set, window), in a transaction —
 *     rebuildable from empty, so a wrong profile is fixed by rebuilding.
 *
 * The harness captures the REAL emitted SQL (Prisma.Sql objects) rather than
 * asserting that a helper was mentioned — the exact failure mode
 * `act-identity.ts` documents, where a test proved a shared fragment existed
 * while a reader quietly used its own.
 */
import 'reflect-metadata';
import {
  COOLDOWN_GAUSSIAN_DAYS,
  RECENCY_FLAT_DAYS,
} from '../polls/supply/poll-supply.constants';
import {
  TASTE_PROFILE_WINDOWS,
  TASTE_WINDOW_ALL_DAYS,
  UserTasteProfileBuilder,
} from './user-taste-profile.builder';

const ACTOR = '44444444-4444-4444-4444-444444444444';

interface Captured {
  sql: string;
  values: unknown[];
}

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

function createHarness(options: { actorIds?: string[] } = {}) {
  const statements: Captured[] = [];

  const capture = (
    first: TemplateStringsArray | { sql: string; values: unknown[] },
    ...rest: unknown[]
  ) => {
    const isSqlObject =
      typeof first === 'object' && first !== null && 'sql' in first;
    statements.push({
      sql: isSqlObject ? (first as { sql: string }).sql : first.join('?'),
      values: isSqlObject ? (first as { values: unknown[] }).values : rest,
    });
    return Promise.resolve(1);
  };

  const tx = { $executeRaw: jest.fn(capture) };
  const prisma = {
    $executeRaw: jest.fn(capture),
    $queryRaw: jest.fn(() =>
      Promise.resolve(
        (options.actorIds ?? [ACTOR]).map((actor_id) => ({ actor_id })),
      ),
    ),
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };

  const builder = new UserTasteProfileBuilder(
    prisma as never,
    createLogger() as never,
  );
  return { builder, prisma, statements };
}

const inserts = (statements: Captured[]) =>
  statements.filter((s) => s.sql.includes('INSERT INTO user_taste_profile'));

describe('UserTasteProfileBuilder — a derived read model of facts', () => {
  it('reads through the SHARED daily-acts builder: echo exclusion, the day filter and kind-in-the-grain all ride in', async () => {
    const { builder, statements } = createHarness();
    await builder.rebuildActors([ACTOR]);

    for (const statement of inserts(statements)) {
      // The three tells of dailyActsCteSql's output. A hand-rolled CTE would
      // have to reproduce all of them by accident to pass.
      expect(statement.sql).toContain('FROM signal_demand_daily a');
      expect(statement.sql).toContain('a.kind <> ALL(');
      expect(statement.sql).toContain('MAX(a.signal_count)');
      // kind IS in the GROUP BY — two kinds on one day are two acts.
      expect(statement.sql).toContain('a.actor_id, a.day, a.kind');
    }
    expect(inserts(statements).length).toBeGreaterThan(0);
  });

  it('counts acts ONCE: only the global tile (place_id IS NULL) feeds the profile', async () => {
    // §3 attribution fans one act across its containing and contained places.
    // Summing over place tiles would count that act many times.
    const { builder, statements } = createHarness();
    await builder.rebuildActors([ACTOR]);
    for (const statement of inserts(statements)) {
      expect(statement.sql).toContain('a.place_id IS NULL');
    }
  });

  it('stores FACTS ONLY — act_count and last_act_at, no weight and no coefficient', async () => {
    const { builder, statements } = createHarness();
    await builder.rebuildActors([ACTOR]);
    for (const statement of inserts(statements)) {
      expect(statement.sql).toContain('act_count');
      expect(statement.sql).toContain('last_act_at');
      // The F467 shape this model refuses to become.
      expect(statement.sql).not.toMatch(/affinity|weight|score|coefficient/i);
    }
  });

  it('invents NO horizon: window 0 is ALL HISTORY and the other windows are constants that already existed', async () => {
    expect(TASTE_WINDOW_ALL_DAYS).toBe(0);
    expect([...TASTE_PROFILE_WINDOWS]).toEqual([
      0,
      RECENCY_FLAT_DAYS,
      COOLDOWN_GAUSSIAN_DAYS,
    ]);

    const { builder, statements } = createHarness();
    await builder.rebuildActors([ACTOR]);
    // The all-history slice reaches back to the epoch — the absence of a
    // cutoff, expressed to a builder whose parameter is a since-day.
    const allHistory = statements.filter((s) =>
      s.values.includes('1970-01-01'),
    );
    expect(allHistory.length).toBeGreaterThan(0);
  });

  it('rebuilds by DELETE + reinsert per (actor set, window) — rebuildable from empty', async () => {
    const { builder, statements, prisma } = createHarness();
    await builder.rebuildActors([ACTOR]);

    const deletes = statements.filter((s) =>
      s.sql.includes('DELETE FROM user_taste_profile'),
    );
    // One delete per window, each scoped to the actors being rebuilt.
    expect(deletes).toHaveLength(TASTE_PROFILE_WINDOWS.length);
    expect(prisma.$transaction).toHaveBeenCalledTimes(
      TASTE_PROFILE_WINDOWS.length,
    );
    for (const statement of deletes) {
      expect(statement.sql).toContain('window_days');
      expect(statement.sql).toContain('actor_id = ANY(');
    }
  });

  it('an empty pass rebuilds nothing — it does not quietly rebuild the world', async () => {
    const { builder, statements, prisma } = createHarness();
    const result = await builder.rebuildForDays([]);
    expect(result).toEqual({ actors: 0, rows: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(statements).toHaveLength(0);
  });

  it('rebuildForDays resolves the touched actors from the days the aggregate just rebuilt', async () => {
    const { builder, prisma } = createHarness({ actorIds: [ACTOR] });
    await builder.rebuildForDays(['2026-08-01', '2026-08-02']);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    const scan = (prisma.$queryRaw as jest.Mock).mock.calls[0] as unknown[];
    expect(JSON.stringify(scan)).toContain('signal_demand_daily');
  });
});
