import { PrismaClient } from '@prisma/client';
import { BENCH_PHASES, IterationBenchService } from './iteration-bench.service';

/**
 * THE BENCH MACHINE, proven against Postgres (plans/iteration-bench.md S1).
 * Mutations these pin:
 *  - allow a phase skip → the strict-order test goes RED;
 *  - drop the one-active-run refusal → the concurrency test goes RED;
 *  - drop the meter/ledger gate → the poisoned-meter preflight test goes
 *    RED (the v16 first-arm incident, replayed as a fixture).
 */
const prisma = new PrismaClient();
const logger = {
  setContext: () => logger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as never;
const opsAlerts = { emit: () => {} } as never;
const geminiBatch = { poll: async () => {} } as never;
const bench = new IterationBenchService(
  prisma as never,
  opsAlerts,
  geminiBatch,
  logger,
);

const TAG = 'bench-spec';
let candidateVersion: number;

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM iteration_runs WHERE phase_state->>'specTag' = '${TAG}' OR status='active'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM llm_prompts WHERE notes = '${TAG}'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM pool_window_consumption WHERE pool_name = 'gemini.monthlySpend' AND window_key = to_char(now(), 'YYYY-MM') AND granted = 424242`,
  );
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('bench integration spec needs DATABASE_URL (dev db)');
  }
  await cleanup();
  const [row] = await prisma.$queryRawUnsafe<Array<{ version: number }>>(
    `INSERT INTO llm_prompts (kind, version, content, content_hash, status, notes)
     SELECT 'collection_system', COALESCE(MAX(version),0)+1000, 'spec prompt', md5(random()::text), 'candidate', '${TAG}'
     FROM llm_prompts WHERE kind='collection_system'
     RETURNING version`,
  );
  candidateVersion = row.version;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('the iteration bench state machine', () => {
  let runId: string;

  it('starts at inventory and refuses a second concurrent run', async () => {
    const started = await bench.start({ candidateVersion });
    runId = started.runId;
    expect(started.next.phase).toBe('inventory');
    await expect(bench.start({ candidateVersion })).rejects.toThrow(
      /active .* iteration already exists/,
    );
  });

  it('advance() computes inventory then the proofs artifact, stopping at the owner gate', async () => {
    const afterInventory = await bench.advance(runId);
    expect(afterInventory.phase).toBe('proofs');
    const afterProofs = await bench.advance(runId);
    expect(afterProofs.phase).toBe('approval');
    expect(afterProofs.automatic).toBe(false);
    // The gate refuses to be advanced past mechanically.
    await expect(bench.advance(runId)).rejects.toThrow(/human gate/);
    const run = await prisma.iterationRun.findUniqueOrThrow({
      where: { runId },
    });
    const state = run.phaseState as {
      inventory?: { collectionPrompt?: { changed?: boolean } };
      approvalSheet?: unknown;
    };
    expect(state.inventory?.collectionPrompt?.changed).toBe(true);
    expect(state.approvalSheet).toBeDefined();
  });

  it('phases are strictly ordered — a skip is unrepresentable', async () => {
    // review-phase verbs refuse while the run sits at approval.
    await expect(bench.recordDiffArtifact(runId, '/tmp/x')).rejects.toThrow(
      /not diff/,
    );
    await expect(bench.closeReview(runId, 'nope')).rejects.toThrow(
      /not review/,
    );
    expect(BENCH_PHASES.indexOf('replay')).toBe(
      BENCH_PHASES.indexOf('approval') + 1,
    );
  });

  it('preflight REFUSES on the poisoned-meter signature (the v16 first arm)', async () => {
    // The approval BINDS the sheet that was read: a wrong hash refuses
    // (pins the S2 binding), the stored one passes.
    await expect(bench.approve(runId, 'wrong-hash')).rejects.toThrow(
      /Sheet hash mismatch/,
    );
    const sheetRun = await prisma.iterationRun.findUniqueOrThrow({
      where: { runId },
    });
    const sheetHash = (sheetRun.phaseState as { sheetHash?: string }).sheetHash;
    expect(sheetHash).toBeDefined();
    await bench.approve(runId, sheetHash as string);
    // Fixture: the meter claims real month spend the priced ledger cannot
    // back (granted=424242 marks the row as this spec's).
    await prisma.$executeRawUnsafe(
      `INSERT INTO pool_window_consumption (pool_name, window_key, consumed, granted, updated_at)
       VALUES ('gemini.monthlySpend', to_char(now(), 'YYYY-MM'), 350000000, 424242, now())
       ON CONFLICT (pool_name, window_key)
       DO UPDATE SET consumed = pool_window_consumption.consumed + 350000000, granted = 424242`,
    );
    const red = await bench.preflight(runId);
    expect(red.green).toBe(false);
    expect(red.refusals.join(' ')).toMatch(/meter disagrees/);
    // Remove the poison → the meter gate clears.
    await prisma.$executeRawUnsafe(
      `UPDATE pool_window_consumption SET consumed = consumed - 350000000
       WHERE pool_name='gemini.monthlySpend' AND window_key=to_char(now(),'YYYY-MM') AND granted=424242`,
    );
    const after = await bench.preflight(runId);
    expect(after.refusals.join(' ')).not.toMatch(/meter disagrees/);
  });

  it('the outcome close is only reachable through the review gates', async () => {
    await expect(bench.recordOutcome(runId, 'activated')).rejects.toThrow(
      /not activation/,
    );
  });
});
