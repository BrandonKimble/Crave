/**
 * READING A TRACKED FILE THAT IS NOT ON DISK (F3912's sixth hole, 2026-08-06).
 *
 * Every gate in scripts/ discovers its subjects with `git ls-files` and then
 * `readFileSync`s each one. Those two facts disagree whenever the INDEX and the
 * WORKTREE disagree: a file staged for deletion, a file `git add`ed and then
 * removed, a concurrent lane mid-delete. In CI the checkout is clean and this
 * never happens; locally the tree moves under you, and what you get is a raw
 *
 *     Error: ENOENT: no such file or directory, open '.../foo.ts'
 *         at readFileSync (node:fs:440:20)
 *
 * with a node stack and no gate name, from a gate that was working. That is how
 * a verification attempt for F3912 got CONFOUNDED — the crash looked like the
 * gate being broken rather than the tree being mid-edit, which is exactly the
 * wrong conclusion to hand someone.
 *
 * THE RULE. A tracked-but-absent file is SKIPPED, and the skip is COUNTED and
 * PRINTED. Never silent (a gate that quietly covers fewer files than it says is
 * the always-green disease), never a crash (the file's absence is not the
 * gate's failure). A gate whose subject list comes from the WORKTREE
 * (`readdirSync`) needs none of this; only the ls-files gates do.
 */
import { readFileSync } from 'fs';

/**
 * Read `absPath`, or return `null` if it is tracked but absent from the
 * worktree. Any OTHER error (permissions, a directory, a decode failure) still
 * throws — those are real, and swallowing them would be the silent-coverage
 * hole one level down.
 */
export function readTrackedFile(absPath) {
  try {
    return readFileSync(absPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * The one-line report every gate prints when it skipped something, so the count
 * cannot hide. Returns '' when nothing was skipped, which keeps the OK line
 * clean on a clean tree.
 */
export function skipNote(skipped) {
  if (!skipped) return '';
  return (
    ` (${skipped} tracked file(s) SKIPPED — present in the index, absent from ` +
    `the worktree: a staged deletion or a concurrent edit. Re-run on a clean ` +
    `tree for full coverage.)`
  );
}
