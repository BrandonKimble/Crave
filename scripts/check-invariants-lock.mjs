#!/usr/bin/env node
/**
 * @script-class: gate
 * @run-by: lefthook pre-commit (invariants-lock) — see lefthook.yml
 *
 * THE INVARIANTS-HARNESS COMMIT FENCE (red team 2026-09-04).
 *
 * `yarn invariants` MUTATES source files in place and restores them when it
 * is done. On 2026-09-04 a second session ran it in this working tree while
 * another session was committing; a directory-wide `git add` swept one of
 * the harness's mutations (entity-match-prompt.md) into a commit, its
 * fingerprint was unreleased, entity-dedupe-rule threw at import and the
 * API could not boot on main for ~40 minutes.
 *
 * The harness already holds a per-checkout lock (apps/api/scripts/
 * invariants.ts, LOCK_FILE in the OS tmpdir keyed by the api root) so two
 * harness runs serialize. This fence makes the COMMIT honour that lock:
 * while a live harness owns it, the tree is not a state anyone should
 * snapshot. Refuses only when the lock's pid is alive — a stale lock from a
 * crashed run never blocks a commit.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(repoRoot, 'apps', 'api');
const lockFile = join(
  tmpdir(),
  `crave-invariants-${createHash('sha1').update(apiRoot).digest('hex').slice(0, 12)}.lock`,
);

let owner = 0;
try {
  owner = Number(readFileSync(lockFile, 'utf8').trim()) || 0;
} catch {
  process.exit(0);
}
let alive = false;
if (owner > 0) {
  try {
    process.kill(owner, 0);
    alive = true;
  } catch (error) {
    alive = error.code !== 'ESRCH';
  }
}
if (!alive) process.exit(0);
console.error(
  `invariants-lock: REFUSED — \`yarn invariants\` (pid ${owner}) is running in this checkout ` +
    `and mutates source files in place. Wait for it to finish (or stop it), re-check ` +
    `\`git status\`, then commit. Lock: ${lockFile}`,
);
process.exit(1);
