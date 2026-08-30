import { DemandVocabularyRailService } from './demand-vocabulary-rail.service';
import type { DemandVocabularyService } from './demand-vocabulary.service';
import { DEMAND_VOCABULARY_ADVISORY_LOCK_KEY } from './demand-vocabulary.service';

/**
 * THE DEMAND-VOCABULARY RAIL'S GATE — flag both ways, kill-switch honored,
 * and the sweep untouched by the wiring (flywheel arming 2026-08-30).
 *
 * Mutation proofs: flip the flag's fallback to `true` in the rail and the
 * default-off test fails; drop the isSchedulerRuntime() term and the
 * CRONS_ENABLED test fails; revert the advisory key to 0x766f6362 and the
 * collision test fails.
 */
describe('DemandVocabularyRailService gating', () => {
  const saved: Record<string, string | undefined> = {};
  const ENV_KEYS = [
    'DEMAND_VOCABULARY_SWEEP_ENABLED',
    'CRONS_ENABLED',
    'PROCESS_ROLE',
  ];

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    // The import chain loads the repo .env (PROCESS_ROLE=api on a laptop),
    // and process-role caches the first answer — pin a worker role BEFORE
    // the first isSchedulerRuntime() call so the suite tests the flag, not
    // the machine it runs on. (CRONS_ENABLED is read fresh each call.)
    process.env.PROCESS_ROLE = 'worker';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  const build = () => {
    const run = jest.fn().mockResolvedValue({
      termsConsidered: 0,
      judged: 0,
      learned: 0,
      refused: 0,
      leftAsDemand: 0,
    });
    const service = new DemandVocabularyRailService({
      run,
    } as unknown as DemandVocabularyService);
    return { service, run };
  };

  it('DEFAULT OFF: with no env set, the nightly runs NOTHING (iteration phase — the launch flip-list arms it)', async () => {
    const { service, run } = build();
    await service.nightly();
    expect(run).not.toHaveBeenCalled();
  });

  it('armed: flag on in a scheduler runtime → the sweep runs', async () => {
    process.env.DEMAND_VOCABULARY_SWEEP_ENABLED = 'true';
    const { service, run } = build();
    await service.nightly();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('the global kill-switch wins: CRONS_ENABLED=false silences the rail even with its own flag on', async () => {
    process.env.DEMAND_VOCABULARY_SWEEP_ENABLED = 'true';
    process.env.CRONS_ENABLED = 'false';
    const { service, run } = build();
    await service.nightly();
    expect(run).not.toHaveBeenCalled();
  });

  it('a sweep failure is contained — the rail logs and never throws into the scheduler', async () => {
    process.env.DEMAND_VOCABULARY_SWEEP_ENABLED = 'true';
    const run = jest.fn().mockRejectedValue(new Error('judge down'));
    const service = new DemandVocabularyRailService({
      run,
    } as unknown as DemandVocabularyService);
    await expect(service.nightly()).resolves.toBeUndefined();
  });

  it("the sweep's advisory key no longer collides with the vocabulary-maintenance rail's 'vocb' (0x766f6362)", () => {
    // Two nightly jobs sharing one pg advisory key means the second silently
    // skips while the first is mid-flight — the 2026-08-30 collision fix.
    expect(DEMAND_VOCABULARY_ADVISORY_LOCK_KEY).not.toBe(0x766f6362);
  });
});
