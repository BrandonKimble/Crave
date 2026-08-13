/**
 * THE DERIVED-INDEX LAW, proven at the base class.
 *
 * Two executed-proven findings live here:
 *   1. The law is UNBYPASSABLE — a subclass's rebuildAll() is protected, and
 *      the only public driver (runNow) routes through runGuarded. The
 *      compile-level half is the @ts-expect-error below: it FAILS THE BUILD
 *      if anyone re-widens rebuildAll to public.
 *   2. The kill-switch is HONEST — the boot self-heal respects the scheduler
 *      gate, and when gated off with an empty table it still SCREAMS.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DerivedIndexJob } from './derived-index-job';
import type { EmitOpsAlertParams } from '../modules/external-integrations/shared/ops-alerts.service';
import { EntitySiblingEdgeBuilderService } from '../modules/entity-text-search/entity-sibling-edge-builder.service';
import { NameContainmentEdgeBuilderService } from '../modules/entity-text-search/name-containment-edge-builder.service';
import { OpenIntervalsBuilderService } from '../modules/search/open-intervals-builder.service';
import { EntityLexiconBuilderService } from '../modules/entity-text-search/entity-lexicon-builder.service';
import { FoodCategoryEdgeBuilderService } from '../modules/search/food-category-edge-builder.service';

describe('DerivedIndexJob: no subclass can be driven around the guard', () => {
  it('rebuildAll is NOT public on any subclass that has one (compile-level)', () => {
    const sibling = {} as EntitySiblingEdgeBuilderService;
    const containment = {} as NameContainmentEdgeBuilderService;
    // @ts-expect-error rebuildAll is protected — drive it with runNow().
    void sibling.rebuildAll;
    // @ts-expect-error rebuildAll is protected — drive it with runNow().
    void containment.rebuildAll;
    expect(true).toBe(true);
  });

  it('every subclass exposes exactly one public driver: runNow (compile-level)', () => {
    const drivers: Array<() => Promise<unknown>> = [
      // Typing each subclass into the base-class driver signature is the
      // consistency assertion: a subclass that renamed or dropped runNow, or
      // one that stopped extending DerivedIndexJob, fails to compile here.
      // This list stays HAND-WRITTEN on purpose — only a named import can be
      // type-checked — but it is no longer measured against a hand-written
      // NUMBER. Its length is asserted against REGISTERED_JOBS below, which is
      // itself checked against the schema, so a table added without a job, or
      // a job added without an entry here, fails.
      ...(
        [
          {} as EntitySiblingEdgeBuilderService,
          {} as NameContainmentEdgeBuilderService,
          {} as OpenIntervalsBuilderService,
          {} as EntityLexiconBuilderService,
          {} as FoodCategoryEdgeBuilderService,
        ] as DerivedIndexJob[]
      ).map((job) => () => job.runNow()),
    ];
    expect(drivers).toHaveLength(REGISTERED_JOBS.length);
  });
});

/**
 * MEMBERSHIP IS DERIVED, NOT LISTED (D3, 2026-08-13).
 *
 * This spec used to assert `toHaveLength(4)` against a hand-written list of
 * four job classes. That number is a claim about the WORLD — "four derived
 * tables exist" — checked against a copy of itself, so it could only ever
 * agree. It agreed for months while `derived_food_category_edges` sat there
 * as a fifth derived hot-path table with no rebuild job at all: four readers
 * failing open on it, one incremental writer, and nothing that could
 * repopulate it after a wipe. Adding a fifth table cost nothing here; the
 * spec's list simply did not mention it, and a list that does not mention a
 * thing cannot notice it is missing.
 *
 * So the subject list comes from the SCHEMA now. Every `derived_*` table in
 * schema.prisma must name a registered job, and the job must declare that
 * exact table. Introduce a sixth derived table and this spec fails BY THE
 * TABLE'S EXISTENCE, before anyone has written a reader that can fail open
 * on it — which is the only moment the law is cheap to apply.
 */
const REGISTERED_JOBS: ReadonlyArray<{
  readonly table: string;
  readonly job: string;
}> = [
  { table: 'derived_entity_sibling_edges', job: 'EntitySiblingEdgeBuilder' },
  {
    table: 'derived_name_containment_edges',
    job: 'NameContainmentEdgeBuilder',
  },
  { table: 'derived_location_open_intervals', job: 'OpenIntervalsBuilder' },
  { table: 'derived_entity_word_deletes', job: 'EntityLexiconBuilder' },
  { table: 'derived_food_category_edges', job: 'FoodCategoryEdgeBuilder' },
];

/**
 * THE ACKNOWLEDGED NON-MEMBER. EntityEmbeddingReconciler heals
 * `core_entity_embeddings` at boot with its own bespoke routine, and it is
 * deliberately NOT a DerivedIndexJob. The law here is EMPTINESS-driven: "this
 * table has no rows, therefore derivation did not happen, therefore rebuild
 * everything." The embedding table is never empty in the interesting case —
 * it is STALE, holding rows for entities whose text changed, and the repair is
 * a per-row reconcile against a paid embedding API, not a full replace. Forcing
 * it into this shape would buy a boot self-heal that re-embeds the corpus on
 * any empty table and a zero-output alert that cannot fire. It is listed here
 * so that "why isn't that one in the list" has an answer instead of a silence.
 * `core_entity_embeddings` is not named `derived_*`, so the check below does
 * not reach it either way.
 */

describe('every derived_* table in the schema has a rebuild job', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  // `@@map("derived_...")` is how a Prisma model names its physical table, and
  // the physical name is what DerivedIndexJob.derivedTable must match — the
  // base class SELECTs from it by that string.
  const tablesInSchema = [
    ...schema.matchAll(/@@map\("(derived_[a-z0-9_]+)"\)/g),
  ].map((m) => m[1]);

  it('found the derived tables (the scan itself is not vacuous)', () => {
    // A regex that silently matched nothing would make every assertion below
    // pass by having no subjects — the always-green disease this repo keeps
    // paying for.
    expect(tablesInSchema.length).toBeGreaterThan(0);
  });

  it('every derived_* table names a registered rebuild job', () => {
    const registered = new Set(REGISTERED_JOBS.map((j) => j.table));
    const unregistered = tablesInSchema.filter((t) => !registered.has(t));
    expect(unregistered).toEqual([]);
  });

  it('every registered job names a table that still exists', () => {
    const inSchema = new Set(tablesInSchema);
    const orphaned = REGISTERED_JOBS.filter((j) => !inSchema.has(j.table));
    expect(orphaned).toEqual([]);
  });

  it('each registered job declares exactly the table it is registered for', () => {
    // The service files are the ground truth for `derivedTable`; reading them
    // is what stops the list above from drifting into fiction.
    const mismatches: string[] = [];
    for (const { table, job } of REGISTERED_JOBS) {
      // `--others --exclude-standard` is load-bearing: a job file that EXISTS
      // but has not been `git add`ed is a real job, and the index is not the
      // repository (the lesson scripts/lib/scan-repo.mjs was written for).
      // Without it this check reports "no service file found" for the very
      // job someone is in the middle of adding.
      const [file] = execFileSync(
        'git',
        [
          'ls-files',
          '--cached',
          '--others',
          '--exclude-standard',
          `*${kebab(job)}.service.ts`,
        ],
        { cwd: join(__dirname, '..', '..'), encoding: 'utf8' },
      )
        .split('\n')
        .filter(Boolean);
      if (!file) {
        mismatches.push(`${job}: no service file found`);
        continue;
      }
      const src = readFileSync(join(__dirname, '..', '..', file), 'utf8');
      if (!src.includes(`derivedTable = '${table}'`)) {
        mismatches.push(`${job} does not declare derivedTable = '${table}'`);
      }
      if (!src.includes('extends DerivedIndexJob')) {
        mismatches.push(`${job} no longer extends DerivedIndexJob`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

function kebab(pascal: string): string {
  return pascal.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

class TestJob extends DerivedIndexJob {
  protected readonly logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as never;
  protected readonly derivedTable = 'derived_test_table';
  protected readonly disableFlagEnv = '';
  protected readonly alert = {
    kind: 'test_table_empty',
    title: 'Test table empty',
    consequence: 'Nothing real dies; this is a fixture.',
  };
  public rebuildCalls = 0;
  public rebuildResult = { input: 10, output: 10 };

  protected rebuild(): Promise<{ input: number; output: number }> {
    this.rebuildCalls += 1;
    return Promise.resolve(this.rebuildResult);
  }
}

const makeJob = (empty: boolean) => {
  const emit = jest.fn<void, [EmitOpsAlertParams]>();
  const prisma = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ empty }]),
  } as never;
  const job = new TestJob(prisma, { emit } as never);
  return { job, emit };
};

describe('DerivedIndexJob boot self-heal honours the cron kill-switch', () => {
  const originalCrons = process.env.CRONS_ENABLED;
  const originalRole = process.env.PROCESS_ROLE;

  afterEach(() => {
    process.env.CRONS_ENABLED = originalCrons;
    process.env.PROCESS_ROLE = originalRole;
    jest.resetModules();
  });

  const setCrons = (enabled: boolean) => {
    process.env.PROCESS_ROLE = 'worker';
    // process-role caches the ROLE, not the flag, so CRONS_ENABLED is live.
    process.env.CRONS_ENABLED = enabled ? 'true' : 'false';
  };

  it('crons ON + table EMPTY → rebuilds, no alert', async () => {
    setCrons(true);
    const { job, emit } = makeJob(true);
    await job.onModuleInit();
    expect(job.rebuildCalls).toBe(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it('crons ON + table POPULATED → no rebuild, no alert', async () => {
    setCrons(true);
    const { job, emit } = makeJob(false);
    await job.onModuleInit();
    expect(job.rebuildCalls).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('crons OFF + table EMPTY → NO rebuild, but a critical alert', async () => {
    setCrons(false);
    const { job, emit } = makeJob(true);
    await job.onModuleInit();
    expect(job.rebuildCalls).toBe(0);
    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0][0];
    expect(payload.severity).toBe('critical');
    expect(payload.kind).toBe('test_table_empty');
    // The operator must learn BOTH facts: it is empty, and nothing is coming.
    expect(payload.body).toContain('EMPTY');
    expect(payload.body).toContain('crons disabled');
  });

  it('crons OFF + table POPULATED → silent, nothing to say', async () => {
    setCrons(false);
    const { job, emit } = makeJob(false);
    await job.onModuleInit();
    expect(job.rebuildCalls).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('runNow carries the law', () => {
  it('emits the zero-output scream for a manual run, like the cron does', async () => {
    const { job, emit } = makeJob(false);
    job.rebuildResult = { input: 17_000, output: 0 };
    const result = await job.runNow();
    expect(result).toEqual({ input: 17_000, output: 0 });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].severity).toBe('critical');
  });

  it('returns the counts of a healthy run', async () => {
    const { job, emit } = makeJob(false);
    await expect(job.runNow()).resolves.toEqual({ input: 10, output: 10 });
    expect(emit).not.toHaveBeenCalled();
  });
});
