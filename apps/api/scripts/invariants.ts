/**
 * PROVE THAT EVERY INVARIANT STILL BITES.
 *
 * For each entry in src/shared/invariants/registry.ts: apply each mutation,
 * run that entry's check, and require the check to FAIL. Then apply each
 * `legitimate` case and require the check to PASS. Restore, always.
 *
 * A mutation that does not FAIL is a guard that has stopped working — which is
 * the failure mode this repository keeps hitting, six times in one session, and
 * never once caught by anything except a person happening to try it.
 *
 * A mutation whose `find` text is no longer present is a HARD FAILURE. The code
 * moved and the proof stopped applying; a proof that silently no longer applies
 * is the same lie as a guard that silently no longer fires.
 *
 *   yarn invariants            every entry
 *   yarn invariants spend.     entries whose id starts with the prefix
 *
 * Exit 0 means every declared invariant was demonstrated to reject the defect
 * it was bought with.
 */
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  INVARIANTS,
  SCRATCH_FILE,
  type Invariant,
  type Mutation,
} from '../src/shared/invariants/registry';

const API_ROOT = join(__dirname, '..');

interface Restore {
  (): void;
}

/** Apply a mutation and return the undo. Throws if it does not apply. */
function apply(mutation: Mutation): Restore {
  const path = join(API_ROOT, mutation.file);

  if ('content' in mutation) {
    if (existsSync(path)) {
      throw new Error(
        `${mutation.file} already exists — a create-mutation must not clobber a real file.`,
      );
    }
    // A create-mutation may need a directory that does not exist yet, and for
    // one whole class of defect that IS the defect: an unguarded heavy
    // migration arrives as a NEW prisma/migrations/<name>/migration.sql, never
    // as an edit to an existing one (every heavy migration in the corpus today
    // is grandfathered, so editing one proves nothing about what a new one
    // would do). Directories created here are removed on restore, innermost
    // first, and only while still empty — an rmdir that would delete somebody
    // else's file simply fails the emptiness test and is skipped.
    const created: string[] = [];
    for (let dir = dirname(path); !existsSync(dir); dir = dirname(dir)) {
      created.unshift(dir);
    }
    if (created.length > 0) mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, mutation.content);
    return () => {
      if (existsSync(path)) unlinkSync(path);
      for (const dir of [...created].reverse()) {
        try {
          rmdirSync(dir);
        } catch {
          // Not empty: another lane put something here. Leave it.
        }
      }
    };
  }

  if (!existsSync(path)) {
    throw new Error(`${mutation.file} does not exist — the proof has rotted.`);
  }
  const original = readFileSync(path, 'utf8');
  if (!original.includes(mutation.find)) {
    throw new Error(
      `The mutation for ${mutation.file} no longer applies — its anchor text is gone:\n` +
        `  ${mutation.find.split('\n')[0].trim().slice(0, 90)}\n` +
        `The code moved. Re-derive the mutation; do not delete it.`,
    );
  }
  writeFileSync(path, original.replace(mutation.find, mutation.replace));
  return () => writeFileSync(path, original);
}

/**
 * Establish that the check PASSES before any mutation.
 *
 * For an entry whose check lints the scratch probe, "clean" means the probe
 * exists and is innocuous — an absent file makes eslint exit non-zero, which
 * would read as perfect enforcement of everything. (This harness's own first
 * run failed exactly that way, which is the point of having a baseline at all.)
 */
function holdsOnCleanTree(invariant: Invariant): boolean {
  if (!invariant.check.command.includes(SCRATCH_FILE)) {
    return holds(invariant);
  }
  const path = join(API_ROOT, SCRATCH_FILE);
  writeFileSync(path, 'export const innocuous = 1;\n');
  try {
    return holds(invariant);
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
}

/** True when the invariant HOLDS (the check exits 0). */
function holds(invariant: Invariant): boolean {
  try {
    execSync(invariant.check.command, {
      cwd: API_ROOT,
      stdio: 'pipe',
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

function describe(mutation: Mutation): string {
  return 'content' in mutation
    ? `add ${mutation.file}`
    : `patch ${mutation.file}`;
}

interface Failure {
  readonly id: string;
  readonly what: string;
  readonly detail: string;
}

function run(): number {
  const prefix = process.argv[2] ?? '';
  const selected = INVARIANTS.filter((i) => i.id.startsWith(prefix));
  if (selected.length === 0) {
    console.error(`No invariant id starts with "${prefix}".`);
    return 1;
  }

  const failures: Failure[] = [];
  let proofs = 0;

  for (const invariant of selected) {
    if (invariant.mutations.length === 0) {
      failures.push({
        id: invariant.id,
        what: 'no mutation declared',
        detail:
          'An invariant with no mutation is an unproven claim. Declare one that must break it.',
      });
      continue;
    }

    console.log(`\n${invariant.id}  [${invariant.level}]`);
    console.log(`  ${invariant.statement}`);

    // The check must PASS on the clean tree, or every result below is
    // meaningless — a check that is already failing "rejects" every mutation.
    if (!holdsOnCleanTree(invariant)) {
      failures.push({
        id: invariant.id,
        what: 'the check fails on the CLEAN tree',
        detail:
          `${invariant.check.command}\n` +
          '    Nothing below can be trusted until this passes: a broken check ' +
          'rejects every mutation and looks like perfect enforcement.',
      });
      continue;
    }

    for (const mutation of invariant.mutations) {
      let restore: Restore | undefined;
      try {
        restore = apply(mutation);
        proofs += 1;
        if (holds(invariant)) {
          failures.push({
            id: invariant.id,
            what: `NOT ENFORCED — ${describe(mutation)} was accepted`,
            detail:
              `The check still passes with the defect present, so the guard is absent.\n` +
              `    check:    ${invariant.check.command}\n` +
              `    mechanism: ${invariant.mechanism}`,
          });
          console.log(`  ✗ ${describe(mutation)} — ACCEPTED (guard is absent)`);
        } else {
          console.log(`  ✓ ${describe(mutation)} — rejected`);
        }
      } catch (error) {
        failures.push({
          id: invariant.id,
          what: `the proof itself is broken (${describe(mutation)})`,
          detail: (error as Error).message,
        });
        console.log(`  ✗ ${describe(mutation)} — proof broken`);
      } finally {
        restore?.();
      }
    }

    for (const legitimate of invariant.legitimate ?? []) {
      let restore: Restore | undefined;
      try {
        restore = apply(legitimate);
        proofs += 1;
        if (holds(invariant)) {
          console.log(`  ✓ ${describe(legitimate)} — allowed (not too broad)`);
        } else {
          failures.push({
            id: invariant.id,
            what: `TOO BROAD — ${describe(legitimate)} was rejected`,
            detail:
              'This is a legitimate use and the guard refused it. A guard that ' +
              'cries wolf gets suppressed, which is how it stops being enforcement.',
          });
          console.log(`  ✗ ${describe(legitimate)} — REJECTED (too broad)`);
        }
      } catch (error) {
        failures.push({
          id: invariant.id,
          what: `the legitimate case is broken (${describe(legitimate)})`,
          detail: (error as Error).message,
        });
      } finally {
        restore?.();
      }
    }
  }

  console.log(
    `\n${'─'.repeat(72)}\n${selected.length} invariant(s), ${proofs} proof(s) run.`,
  );

  if (failures.length === 0) {
    console.log('Every invariant rejected the defect it was bought with.');
    return 0;
  }

  console.log(`\n${failures.length} PROBLEM(S):\n`);
  for (const failure of failures) {
    console.log(`  ${failure.id}`);
    console.log(`    ${failure.what}`);
    console.log(`    ${failure.detail}\n`);
  }
  return 1;
}

process.exit(run());
