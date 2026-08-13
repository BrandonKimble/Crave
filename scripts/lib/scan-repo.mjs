// @script-class: library
// @run-by: imported by the repo-root scanners in scripts/ (check-*.mjs); runs whenever they do.
/**
 * WHAT A SCANNER LOOKS AT — one enumeration, one refusal, one process.
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 *
 * Eleven scanners in scripts/ each hand-rolled the same four lines:
 *
 *     const out = execFileSync('git', ['ls-files', '*.ts'], { cwd, encoding });
 *     const files = out.split('\n').map(l => l.trim()).filter(Boolean);
 *     if (files.length === 0) { console.error('FAIL: ...'); process.exit(1); }
 *
 * Eleven copies is eleven chances to get one of them subtly wrong, and the
 * copies had ALREADY diverged in three ways that matter:
 *
 *   1. THE INDEX IS NOT THE REPOSITORY. Every copy passed `ls-files` with no
 *      `--others`, so it enumerated TRACKED files only. A file that exists,
 *      compiles, and ships — but has not been `git add`ed yet — was invisible
 *      to every one of them. The defect is therefore caught only AFTER it is
 *      staged, which is one commit later than the author wanted to know, and
 *      never at all for anyone who stages and pushes in one motion.
 *      `check-source-is-text.ts` (apps/api) already learned this and passes
 *      `--others --exclude-standard`; that is the precedent this file ports.
 *
 *   2. NO `-z`. `git ls-files` QUOTES a path containing a newline or a
 *      non-ASCII byte ("a\nb.ts" with the quotes literal), so a splitter on
 *      '\n' both mangles that path and invents a second one. `-z` makes the
 *      record separator a byte that cannot occur in a path.
 *
 *   3. THE REFUSAL WAS A CONVENTION, NOT A MECHANISM. Nine of the eleven
 *      refused on zero files; the wording, the exit path, and whether the
 *      count was ever PRINTED differed in each. A convention is exactly the
 *      thing that gets forgotten by the twelfth scanner.
 *
 * ─── EXIT-STATUS DISCRIMINATION ──────────────────────────────────────────
 *
 * The most recurrent gate defect in this repository (four gates, F8900) is a
 * scanner that cannot tell "the tool found nothing" from "the tool was not
 * there" — `if rg ...` and `... | grep -c || true` both read exit 2 and exit
 * 127 as a clean bill of health. `scripts/lib/gate-runner.sh` owns that
 * problem for the SHELL gates. This owns it for the node ones:
 *
 *   - git absent, git failing, a bad pathspec, a broken repo → a NAMED fatal
 *     naming this gate, never an empty list, never a raw node stack.
 *   - zero files matched → a NAMED fatal, because a scan of nothing is the
 *     always-green disease and there is no legitimate caller that wants it.
 *
 * There is no code path through this module that returns an empty array.
 *
 * ─── SCOPE IS A PATHSPEC, NOT A SKIP LIST ────────────────────────────────
 *
 * Callers pass git pathspecs. Ignored paths (node_modules, dist, build output)
 * are excluded by `--exclude-standard` reading .gitignore, so no directory
 * skip-list exists here to rot. NOTE the pathspec trap F3913 bought: a
 * pathspec WITHOUT a leading `*` is root-anchored — `ls-files 'railway*.json'`
 * matches repo-root files only. Write `*railway*.json` to cross directories.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Read a path that came from somewhere other than scanRepo — a recursive
 * worktree walk, a hardcoded owner file — returning null if it is absent.
 * Any OTHER error (permissions, a directory, a decode failure) still throws:
 * swallowing those would be the silent-coverage hole one level down.
 *
 * A gate whose subject list comes from `readdirSync` cannot race the index and
 * needs none of this; only paths derived from git do. (F3912 item six.)
 */
export function readOrNull(absolutePath) {
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** The one-line report a gate prints so a skipped file cannot hide. */
export function skipNote(skipped) {
  if (!skipped) return '';
  return (
    ` (${skipped} file(s) SKIPPED — present in the index, absent from the ` +
    'worktree: a staged deletion or a concurrent edit. Re-run on a clean ' +
    'tree for full coverage.)'
  );
}

/** Die with a message that names the gate. Never returns. */
function fatal(label, message) {
  console.error(`FAIL [${label}]: ${message}`);
  process.exit(1);
}

/**
 * Enumerate the repository.
 *
 * @param {object} options
 * @param {string} options.label       The gate's name, for every message.
 * @param {string[]} [options.pathspecs] git pathspecs; default = everything.
 * @param {boolean} [options.untracked] Include files not yet `git add`ed.
 *   Default TRUE — a file that exists is a file that ships. Pass false only
 *   when a scratch file in someone's worktree would legitimately fail the
 *   gate, and say why at the call site.
 * @returns {{ files: string[], count: number, read: (rel: string) => string|null, skipped: () => number, note: () => string }}
 */
export function scanRepo({ label, pathspecs = [], untracked = true }) {
  if (!label) throw new Error('scanRepo requires a label — it names failures.');

  const args = ['ls-files', '-z', '--cached'];
  if (untracked) args.push('--others', '--exclude-standard');
  if (pathspecs.length > 0) args.push('--', ...pathspecs);

  let out;
  try {
    out = execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'buffer',
      maxBuffer: 256 * 1024 * 1024,
      // stderr is captured so a git complaint reaches the message below
      // rather than interleaving with the gate's own output.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // THE DISCRIMINATION. ENOENT = no git on PATH (exit 127's cousin); a
    // non-zero status = git ran and refused. Both are the scan being BROKEN,
    // and a broken scan must never look like a clean one.
    const detail =
      error && error.code === 'ENOENT'
        ? 'git is not on PATH'
        : `git ls-files exited ${error && error.status}: ${String(
            (error && error.stderr) || ''
          ).trim()}`;
    return fatal(
      label,
      `${detail}. The subject list could not be built, so this gate covered ` +
        'NOTHING. A broken scan reports clean; refusing instead.'
    );
  }

  const files = out
    .toString('utf8')
    .split('\0')
    .filter((path) => path.length > 0);

  if (files.length === 0) {
    return fatal(
      label,
      `git ls-files matched no files for pathspec(s) [${
        pathspecs.join(', ') || '<all>'
      }]. Either the corpus moved or the pathspec rotted (a pathspec with no ` +
        'leading `*` is ROOT-ANCHORED); both mean this gate is covering nothing.'
    );
  }

  let skipped = 0;

  /**
   * Read one enumerated file, or null if it is in the index but absent from
   * the worktree (a staged deletion, a concurrent lane mid-edit). The skip is
   * COUNTED and printed by `note()` — never silent, never a crash. Any other
   * error still throws: swallowing a permissions failure would be the silent
   * -coverage hole one level down. (F3912's sixth hole; this subsumes
   * lib/tracked-source.mjs, whose two functions live on here as readOrNull/skipNote.)
   */
  const read = (rel) => {
    try {
      return readFileSync(join(REPO_ROOT, rel), 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        skipped += 1;
        return null;
      }
      throw error;
    }
  };

  const note = () =>
    skipped === 0
      ? ''
      : ` (${skipped} file(s) SKIPPED — present in the index, absent from the ` +
        'worktree: a staged deletion or a concurrent edit. Re-run on a clean ' +
        'tree for full coverage.)';

  return { files, count: files.length, read, skipped: () => skipped, note };
}
