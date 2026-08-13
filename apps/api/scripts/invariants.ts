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
  linkSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  INVARIANTS,
  RUN_PROBE_FILES,
  SCRATCH_FILE,
  type Invariant,
  type Mutation,
} from '../src/shared/invariants/registry';

const API_ROOT = join(__dirname, '..');

interface Restore {
  (): void;
}

/**
 * THE FILE CHANGED UNDER US — the one thing this harness must never do
 * silently (2026-08-12).
 *
 * A patch-mutation edits a REAL, tracked file and puts it back afterwards by
 * writing the bytes it read at the start. In a shared tree that is a
 * last-writer-wins overwrite of whoever saved that file in between: their edit
 * disappears with no error, no diff, and no clue that this run was the cause.
 * Nobody would look here for it.
 *
 * So the restore VERIFIES first. The harness knows exactly what it left on
 * disk; if that is not what is there now, someone else wrote to the file and
 * their bytes — not ours — are the current truth. The run stops touching that
 * file, says so by name, and leaves the resolution to a human. A loud mutated
 * file is recoverable in one `git diff`; a silently reverted edit is not
 * recoverable at all.
 */
class ProbeRestoreConflict extends Error {
  constructor(readonly file: string) {
    super(
      `${file} CHANGED UNDER THE INVARIANT HARNESS — restore ABORTED.\n` +
        `    The harness mutated this file and another writer (a concurrent\n` +
        `    fleet session, an editor save, another 'yarn invariants') changed\n` +
        `    it before the restore. Putting our copy back would DELETE their\n` +
        `    work, so nothing was written. The file is left MUTATED: inspect\n` +
        `    'git diff ${file}' and keep whichever bytes are right.`,
    );
    this.name = 'ProbeRestoreConflict';
  }
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
      // Same verification as the patch arm: delete only what we wrote. The
      // probe paths carry a per-run tag, so a mismatch here is not a
      // concurrent run — it is a human or a tool that adopted the file.
      if (existsSync(path)) {
        if (readFileSync(path, 'utf8') !== mutation.content) {
          throw new ProbeRestoreConflict(mutation.file);
        }
        unlinkSync(path);
      }
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
  const mutated = original.replace(mutation.find, mutation.replace);
  writeFileSync(path, mutated);
  return () => {
    // THE VERIFIED RESTORE. Our own bytes, or nothing at all — see
    // ProbeRestoreConflict.
    if (!existsSync(path) || readFileSync(path, 'utf8') !== mutated) {
      throw new ProbeRestoreConflict(mutation.file);
    }
    writeFileSync(path, original);
  };
}

/**
 * A conflict ENDS THE RUN. Thrown by `restoreOrReport` once the failure is
 * recorded, caught only at the top of `run()`.
 *
 * WHY FATAL, not "recorded and carry on" (2026-08-13): a failed restore leaves
 * a real tracked file MUTATED. Every later mutation re-reads that file to
 * capture its "original" — and the bytes it captures are the harness's own
 * defect. Its restore then faithfully writes the DEFECT back and reports
 * success, so the harness has committed the very sabotage it exists to prove
 * gets rejected. Demonstrated on railway.json: one conflict, and a later proof
 * left the manifest permanently holding the mutation. There is no safe work
 * after a conflict, because the tree is no longer the tree the run measured.
 */
class HarnessAborted extends Error {
  constructor(readonly file: string) {
    super(`invariant harness ABORTED — ${file} is left mutated`);
    this.name = 'HarnessAborted';
  }
}

/**
 * Run a restore and turn a refusal into a recorded FAILURE first, so the
 * verdict it collided with survives into the report — then abort the run.
 * It is called from `finally`, where a raw exception would replace whatever
 * verdict the proof had just produced.
 */
function restoreOrReport(
  restore: Restore | undefined,
  id: string,
  failures: Failure[],
): void {
  if (!restore) return;
  try {
    restore();
  } catch (error) {
    if (!(error instanceof ProbeRestoreConflict)) throw error;
    console.log(`  ✗ ${error.message}`);
    failures.push({
      id,
      what: 'RESTORE ABORTED — the file changed under the harness',
      detail: error.message,
    });
    throw new HarnessAborted(error.file);
  }
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

  try {
    proofs = proveAll(selected, failures);
  } catch (error) {
    if (!(error instanceof HarnessAborted)) throw error;
    // Every remaining proof is cancelled: see HarnessAborted. Nothing further
    // is mutated, and the file that conflicted is named in the failure the
    // restore already recorded.
    console.log(
      `\n${'─'.repeat(72)}\nRUN ABORTED after a restore conflict on ${error.file}.\n` +
        `No further mutation was applied — a later proof would have read the\n` +
        `harness's own defect as that file's 'original' and written it back for\n` +
        `good. Resolve 'git diff ${error.file}' before re-running.`,
    );
    for (const failure of failures) {
      console.log(
        `\n  ${failure.id}\n    ${failure.what}\n    ${failure.detail}`,
      );
    }
    return 1;
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

/** Prove every selected invariant. Returns the proof count; throws HarnessAborted. */
function proveAll(selected: Invariant[], failures: Failure[]): number {
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
        restoreOrReport(restore, invariant.id, failures);
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
        restoreOrReport(restore, invariant.id, failures);
      }
    }
  }
  return proofs;
}

/**
 * ONE RUN AT A TIME, ACROSS THE WHOLE FLEET.
 *
 * Per-run probe paths fix the files this harness INVENTS. They cannot fix the
 * ones it BORROWS: a patch-mutation edits railway.json, .eslintrc.js, a real
 * service file — and there is exactly one of each. Two overlapping runs
 * measured on this tree: run B reported `patch ../../.eslintrc.js — proof
 * broken`, because run A was holding that file mutated and B's anchor text
 * genuinely was not there. Both runs red, no defect, and the message accuses
 * the code of having moved.
 *
 * There is no per-file trick for that — the mutation IS the shared file — so
 * the runs SERIALIZE.
 *
 * THE LOCK AND ITS OWNER ARE ONE ATOMIC WRITE (2026-08-13). The lock used to be
 * `mkdir` followed by a separate `writeFileSync` of the pid, and a release that
 * unlinked whatever was there. Both halves were stealable, and a 12×8 race
 * measured EVERY trial overlapping with up to five concurrent "holders":
 *   - between the mkdir and the pid write the directory is ownerless, so a
 *     rival reads pid `0`, calls it dead, breaks the lock and takes it — while
 *     the real owner believes it holds;
 *   - the release unlinked/rmdir'd without checking WHOSE lock it was, so a run
 *     that had already been broken open cheerfully deleted its successor's;
 *   - `process.kill(pid, 0)` throws EPERM for a LIVE process owned by another
 *     user, and every throw was read as "dead" — so a healthy foreign-owned run
 *     was declared a corpse.
 *
 * The lock is now a FILE PUBLISHED BY `link()`. The pid is written to a
 * private staging path first, and `link` — atomic, and EEXIST if the name is
 * taken — publishes that already-complete file under the lock name. The lock
 * therefore never exists without its owner already inside it.
 *
 * `open(path, 'wx')` is NOT enough, and the race says so: create-exclusive is
 * atomic about the NAME but the file it publishes is EMPTY, and the pid write
 * that follows is a second syscall. Racing that shape 12×16 still produced 5
 * overlapping trials with 3 simultaneous holders — a rival reading the empty
 * file sees owner `0`, calls it a corpse, and breaks a lock that is held. Same
 * bug as the mkdir version, one syscall smaller. The `link` shape races clean.
 *
 * Release reads the file back and unlinks ONLY if the pid is still ours. EPERM
 * from the liveness probe means ALIVE (the process exists; we merely may not
 * signal it); only ESRCH is a corpse. It lives in the temp dir rather than the
 * repo so it can never be committed or gitignored by mistake, and a lock whose
 * owner is provably gone is still broken open — a crashed run must not stop the
 * fleet forever, and the probe sweep below means a dead run left nothing behind
 * to protect anyway.
 */
const LOCK_FILE = join(
  tmpdir(),
  `crave-invariants-${createHash('sha1').update(API_ROOT).digest('hex').slice(0, 12)}.lock`,
);
const LOCK_WAIT_MS = 45 * 60 * 1000;

/** The pid recorded in the lock, or 0 when there is no readable owner. */
function lockOwner(): number {
  try {
    return Number(readFileSync(LOCK_FILE, 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Does this pid still exist? EPERM is the trap: it means the process is THERE
 * and simply not ours to signal. Only ESRCH — no such process — is death.
 */
function pidIsAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function acquireRunLock(): () => void {
  const started = Date.now();
  const ours = `${process.pid}\n`;
  // Staged, complete, and private until `link` publishes it. Per-pid, so two
  // racers never share a staging path.
  const staging = `${LOCK_FILE}.${process.pid}.staging`;
  writeFileSync(staging, ours);
  try {
    return publishLock(started, ours, staging);
  } finally {
    try {
      unlinkSync(staging);
    } catch {
      // Already gone; the published link is the copy that matters.
    }
  }
}

function publishLock(
  started: number,
  ours: string,
  staging: string,
): () => void {
  for (;;) {
    try {
      // THE atomic operation: the lock name appears already holding the pid.
      linkSync(staging, LOCK_FILE);
      return () => {
        try {
          // Release only OUR lock. If the pid on disk is not ours we were
          // broken open and someone else holds it now — deleting it would
          // hand the tree to a third run while they are mid-mutation.
          if (readFileSync(LOCK_FILE, 'utf8') === ours) unlinkSync(LOCK_FILE);
        } catch {
          // No lock to release. The next run will re-create it.
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = lockOwner();
      if (owner === 0) {
        // The lock is there but we could not read an owner out of it: it is
        // being released right now, or was just unlinked. NOT a corpse — a
        // corpse is a pid we positively read and positively buried. Breaking
        // on an unreadable owner is how the last overlap happened: read fails,
        // we call it dead, a fresh holder publishes, and our unlink deletes
        // THEIR live lock. Just retry the link; whoever owns it will show up.
        continue;
      }
      if (!pidIsAlive(owner)) {
        console.log(
          `  (breaking a stale invariant lock left by pid ${owner || '?'})`,
        );
        try {
          // Break only the corpse we just diagnosed: if the owner changed
          // between the read and here, a live run took it and this unlink
          // would steal it.
          if (lockOwner() === owner) unlinkSync(LOCK_FILE);
        } catch {
          // Someone else won the race to break it; loop and try to take it.
        }
        continue;
      }
      if (Date.now() - started > LOCK_WAIT_MS) {
        throw new Error(
          `Another invariant run (pid ${owner}) has held the tree for ` +
            `${Math.round(LOCK_WAIT_MS / 60000)} minutes. Nothing was mutated. ` +
            `If that process is wedged, kill it or remove ${LOCK_FILE}.`,
        );
      }
      if (Date.now() - started < 2000) {
        console.log(`Waiting for the invariant run held by pid ${owner}…`);
      }
      execSync('sleep 3');
    }
  }
}

/**
 * NO PROBE OUTLIVES ITS RUN. Every restore already removes its own file, but
 * a crash, a `find`-anchor throw or a Ctrl-C between write and restore would
 * strand one — and a stranded probe is a deliberately-defective source file
 * sitting in `src/`, which the next lint, build or reviewer will trip over
 * with no idea where it came from. The paths are this run's alone (see the
 * run tag in the registry), so removing them can never take somebody else's
 * work.
 */
function sweepProbes(): void {
  for (const file of RUN_PROBE_FILES) {
    const path = join(API_ROOT, file);
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Best effort: a probe we cannot delete is a warning, not a verdict.
    }
  }
}

process.on('exit', sweepProbes);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => process.exit(130));
}

const releaseRunLock = acquireRunLock();
process.on('exit', releaseRunLock);

process.exit(run());
