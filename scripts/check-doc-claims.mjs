#!/usr/bin/env node
// @script-class: gate
// @run-by: .github/workflows/ci.yml ('Static guard: doc commands and paths resolve').
/**
 * GATE: a doc that tells you what to RUN must be executable (F2500/F2504).
 *
 * README.md documented `yarn workspace api db:seed` three times. That script
 * has never existed — step 3 of Quick Start could not be run, and nothing
 * noticed, because a README's commands are the only part of a repo that can be
 * wrong silently: nothing runs them. A census this pass found 41 of 127 tracked
 * .md files carrying at least one reference that no longer resolves.
 *
 * WHAT IT CHECKS, over tracked .md files:
 *   1. every `yarn <script>` / `yarn workspace <ws> <script>` resolves to a
 *      real script in the real package.json it names;
 *   2. every repo-path-shaped token in backticks exists in the working tree.
 *
 * ── SCOPE IS THE WHOLE DESIGN OF THIS GUARD ──────────────────────────────
 *
 * History corpora are EXCLUDED, deliberately and permanently — see EXCLUDED
 * below, where every one carries its reason. A completed cutover worklog that
 * names a file the cutover deleted is an accurate HISTORICAL RECORD, not a
 * false claim; `plans/` is archaeology and must not be "fixed" into
 * uselessness. More practically: a repo-wide "every path in every .md must
 * exist" gate would be permanently red on ~150 historical references and would
 * therefore be disabled, which is worse than nothing. This is the same
 * reasoning that keeps check-migration-parallel-guard.mjs narrow (F2163).
 *
 * The line is intent, not folder aesthetics: docs that read as CURRENT RECIPES
 * are gated; docs that describe the past are not.
 *
 * MEASURED, not assumed: with `plans/` alone excluded (the D63 scope) the gate
 * reports 47 failures on a clean tree — the corpora added below are why it is
 * green today. That widening is recorded on F2504 for review.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { readTrackedFile, skipNote } from './lib/tracked-source.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * HISTORY, NOT RECIPES — every exclusion carries its reason, because an
 * unexplained exclusion is how a gate quietly stops covering things.
 *
 * Measured before choosing this line: with `plans/` alone excluded the gate
 * reports 47 unresolvable references and would be permanently red on day one.
 * Every corpus below is a record of the past or an explicitly-stale document,
 * and CLAUDE.md says so about most of them in its own words.
 */
const EXCLUDED = [
  [
    'plans/',
    'completed cutover worklogs — naming a file the cutover deleted is accurate history (D63/F2504)',
  ],
  ['audit/', 'the findings ledger cites paths as evidence AT THE TIME OF THE FINDING'],
  ['.claude/projects/', 'session memory: a personal log of what was true when it was written'],
  [
    'business/',
    'mined BRD/PRD material + the signal blueprint; CLAUDE.md already records its dead links as known',
  ],
  [
    'product/',
    'living feature-IDEA backlog — it describes things that do not exist yet, by design',
  ],
  ['CRAVE.md', 'territory map with extensive historical narrative ("X was DELETED this pass")'],
  ['PRD.md', 'CLAUDE.md: "the STALE original v3 spec — good seed ideas only"'],
  ['BRD.md', 'CLAUDE.md: "the STALE original v3 spec — good seed ideas only"'],
];

/**
 * A doc that ALREADY SAYS the thing is gone is not making a false claim — it is
 * the dated-correction shape maestro/perf/README.md models and D63 praised.
 * Checked over a small window because those corrections span a few lines.
 */
const CORRECTION_WORDS =
  /(\bDELETED\b|\bdeleted\b|\bdoes not exist\b|\bdoesn't exist\b|\bno longer exists?\b|\bnonexistent\b|\bsuperseded\b|\bSUPERSEDED\b|\bCORRECTED\b|\bCORRECTION\b|\bHISTORICAL\b|\bdead link\b|\bis dead\b|\bgitignored\b)/;

/** Tracked, gated .md files. Discovered, never hand-listed. */
function docs() {
  const out = execFileSync('git', ['ls-files', '*.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => !f.includes('node_modules/'))
    .filter((f) => !EXCLUDED.some(([prefix]) => f === prefix || f.startsWith(prefix)));
}

const files = docs();

// A gate that finds no documents reports clean while covering nothing.
if (files.length === 0) {
  console.error(
    'FAIL: no gated .md files found. Either the corpus moved or ' +
      'this discovery is broken; both mean this gate is covering nothing.'
  );
  process.exit(1);
}

/**
 * Tracked-but-absent files skipped this run (F3912 item six). Counted here so
 * both discovery passes report into one number, and PRINTED — a gate that
 * silently covers fewer files than it claims is the always-green disease.
 */
let skippedFiles = 0;

/** workspace name -> Set(script names), plus the root under the name '.'. */
function scriptIndex() {
  const manifests = execFileSync('git', ['ls-files', '*package.json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => !f.includes('/node_modules/'));

  const byWorkspaceName = new Map();
  let rootScripts = new Set();
  for (const rel of manifests) {
    const rawPkg = readTrackedFile(join(REPO_ROOT, rel));
    if (rawPkg === null) {
      skippedFiles += 1; // tracked, absent from the worktree (F3912 item six)
      continue;
    }
    let pkg;
    try {
      pkg = JSON.parse(rawPkg);
    } catch {
      continue;
    }
    const names = new Set(Object.keys(pkg.scripts || {}));
    if (rel === 'package.json') rootScripts = names;
    else if (pkg.name) byWorkspaceName.set(pkg.name, names);
  }
  return { rootScripts, byWorkspaceName };
}

const { rootScripts, byWorkspaceName } = scriptIndex();
if (rootScripts.size === 0 || byWorkspaceName.size === 0) {
  console.error('FAIL: could not build the script index — nothing would be checkable.');
  process.exit(1);
}

/**
 * `yarn` subcommands that are yarn's own, not repo scripts. `yarn prisma …`
 * and friends are BIN invocations (yarn v1 falls through to node_modules/.bin),
 * so a name that is not a script is only a failure when it is also not a bin.
 */
const YARN_BUILTINS = new Set([
  'install',
  'add',
  'remove',
  'upgrade',
  'why',
  'run',
  'workspace',
  'workspaces',
  'cache',
  'global',
  'link',
  'unlink',
  'info',
  'list',
  'outdated',
  'pack',
  'publish',
  'config',
  'init',
  'audit',
  'dlx',
  'create',
  'node',
  'exec',
  'set',
  'bin',
  'licenses',
  'check',
  'test',
  'version',
]);

const hasBin = (name) => existsSync(join(REPO_ROOT, 'node_modules', '.bin', name));

/**
 * Repo-path-shaped tokens, taken ONLY from inside backticks. Prose is not
 * scanned: a sentence mentioning "apps/api" is not a claim that a file exists,
 * and a scanner that guesses produces noise, gets ignored, and then gets
 * deleted. Anchored on real tracked top-level directories.
 */
const TOP_LEVEL = new Set(
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.split('/')[0])
    .filter(Boolean)
);

function isPathClaim(tok) {
  if (!tok.includes('/')) return false;
  if (/[\s`'"()\[\]{}<>|$\\]/.test(tok)) return false;
  if (/^[a-z]+:\/\//i.test(tok)) return false; // URLs
  if (tok.includes('*') || tok.includes('…') || tok.includes('?')) return false; // globs/elisions
  if (tok.startsWith('@')) return false; // npm scopes
  if (tok.startsWith('/')) return false; // absolute paths are not repo claims
  const head = tok.split('/')[0];
  return TOP_LEVEL.has(head);
}

const failures = [];
let checkedCommands = 0;
let checkedPaths = 0;
let suppressed = 0;

for (const rel of files) {
  const text = readTrackedFile(join(REPO_ROOT, rel));
  if (text === null) {
    skippedFiles += 1; // tracked, absent from the worktree (F3912 item six)
    continue;
  }
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    const where = `${rel}:${i + 1}`;

    // Quoting an error message is not invoking a command.
    if (/not found/.test(line)) return;

    const window = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
    if (CORRECTION_WORDS.test(window)) {
      // COUNTED, NOT SILENT: an escape hatch nobody can see is how a gate stops
      // covering things. The total is printed on success.
      suppressed += 1;
      return;
    }

    // --- yarn workspace <ws> <script>
    for (const m of line.matchAll(/yarn\s+workspace\s+(\S+)\s+([a-zA-Z][\w:.-]*)/g)) {
      const [, ws, script] = m;
      checkedCommands += 1;
      const scripts = byWorkspaceName.get(ws);
      if (!scripts) {
        failures.push(`${where}: \`yarn workspace ${ws} …\` — no workspace is named "${ws}".`);
      } else if (!scripts.has(script) && !hasBin(script)) {
        failures.push(
          `${where}: \`yarn workspace ${ws} ${script}\` — "${ws}" declares no "${script}" script (and it is not a bin).`
        );
      }
    }

    // --- yarn <script>   (root)
    for (const m of line.matchAll(/(?<![\w-])yarn\s+([a-zA-Z][\w:.-]*)/g)) {
      const script = m[1];
      if (YARN_BUILTINS.has(script)) continue;
      checkedCommands += 1;
      if (!rootScripts.has(script) && !hasBin(script)) {
        failures.push(
          `${where}: \`yarn ${script}\` — the root package.json declares no "${script}" script (and it is not a bin).`
        );
      }
    }

    // --- repo paths in backticks
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      // A backtick span may hold a command; check each whitespace-separated
      // token in it, not the span as a whole.
      for (const tok of m[1].split(/\s+/)) {
        const clean = tok.replace(/[.,;:)]+$/, '');
        if (!isPathClaim(clean)) continue;
        checkedPaths += 1;
        if (!existsSync(join(REPO_ROOT, clean.split('#')[0].split(':')[0]))) {
          failures.push(`${where}: \`${clean}\` — no such path in the working tree.`);
        }
      }
    }
  });
}

if (failures.length) {
  console.error(
    `doc-claims FAILED — ${failures.length} unresolvable reference(s) in gated docs:\n` +
      failures.map((f) => `  - ${f}`).join('\n') +
      `\n\nA doc that tells you what to run must be executable. Fix the claim, or ` +
      `— if the doc is describing the past — say so in the doc (see maestro/perf/README.md ` +
      `for the dated-correction shape).`
  );
  process.exit(1);
}

console.log(
  `doc-claims OK — ${files.length} gated .md file(s); ` +
    `${checkedCommands} yarn command(s) and ${checkedPaths} repo path(s) all resolve; ` +
    `${suppressed} line(s) skipped as self-declared corrections. ` +
    `(${EXCLUDED.length} corpora excluded BY DESIGN — they are history, not recipes.)` +
    skipNote(skippedFiles)
);
