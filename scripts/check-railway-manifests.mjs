#!/usr/bin/env node
// @script-class: gate
// @run-by: .github/workflows/ci.yml ('Static guard: railway manifests carry no startCommand/watchPatterns').
/**
 * GATE: the two Railway manifest keys that break production silently.
 *
 * Both are burned-in laws in CLAUDE.md, written after real incidents, and
 * neither was enforced by anything until F2162. A law you have to remember is
 * a convention.
 *
 * (1) `deploy.startCommand` — OVERRIDES the Dockerfile CMD, and Railway execs
 *     it WITHOUT a shell. The api CMD is
 *
 *         ["sh", "-c", "npx prisma migrate deploy ... && node apps/api/dist/main.js"]
 *
 *     so a startCommand turns `&&` into an argv element: the container runs the
 *     migration, exits 0, and never starts the server. Exit 0 is the cruelty —
 *     nothing reports a failure.
 *
 * (2) `build.watchPatterns` — makes Railway SKIP a deploy it considers
 *     unaffected. On 2026-08-02 a prod deploy skipped live while printing
 *     "Deploy complete". The smoke passed because it checked uptime rather than
 *     the running commit.
 *
 * WHAT THIS CANNOT DO, and it matters. watchPatterns ALSO live on the Railway
 * DASHBOARD service setting, and the dashboard and the manifest MERGE — a clean
 * railway.json is NOT sufficient, which is exactly the correction CLAUDE.md
 * records after an earlier "RESOLVED" claim proved wrong. This gate covers the
 * half that lives in the repo. The dashboard half is unowned by CI and stays a
 * deploy-time check (scripts/rig/deploy.sh asserts SKIPPED unconditionally, and
 * the smoke asserts /health.commit == HEAD).
 */
import { execFileSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { readTrackedFile, skipNote } from './lib/tracked-source.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Discovered, not hardcoded: a new railway manifest must be covered too.
 *
 * THE PATHSPEC WAS ROOT-ANCHORED (F3913, 2026-08-06). `git ls-files
 * 'railway*.json'` does NOT cross directories — a pathspec without a leading
 * `*` matches repo-root files only (executed: `git ls-files 'check*.mjs'`
 * returns nothing while `git ls-files '*check*.mjs'` returns the scripts/
 * files). All three manifests happen to be root-level, so the gate was honest
 * and blind at the same time; a per-service `apps/worker/railway.json` — the
 * standard Railway layout — would have carried startCommand/watchPatterns
 * un-audited while this printed OK. The recursive form plus a BASENAME filter:
 * `*railway*.json` crosses directories but would also drag in
 * `railway-notes.json`, and a gate that fails on a file Railway never reads is
 * a gate that gets deleted.
 */
export function manifests() {
  const out = execFileSync('git', ['ls-files', '*railway*.json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((rel) => /^railway[^/]*\.json$/.test(rel.split('/').pop()));
}

const files = manifests();
let skipped = 0;

// Missing tooling is a FAILURE, never a pass — a gate that finds no manifests
// reports clean while covering nothing.
if (files.length === 0) {
  console.error(
    'FAIL: no railway*.json manifests found. Either they were renamed or the ' +
      'scan is broken; both mean this gate is covering nothing.',
  );
  process.exit(1);
}

const failures = [];
for (const rel of files) {
  let cfg;
  const raw = readTrackedFile(join(REPO_ROOT, rel));
  if (raw === null) {
    // Tracked, absent from the worktree (F3912 item six): skip and COUNT.
    skipped += 1;
    continue;
  }
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    failures.push(`${rel}: not valid JSON (${err.message}) — Railway would ignore it.`);
    continue;
  }

  if (cfg?.deploy?.startCommand !== undefined) {
    failures.push(
      `${rel}: sets \`deploy.startCommand\`. It OVERRIDES the Dockerfile CMD ` +
        `and Railway execs it WITHOUT a shell, so a CMD of the form ` +
        `sh -c "migrate && start" becomes argv: the container migrates, exits ` +
        `0, and never starts the server — with no failure reported. Delete it ` +
        `and let the Dockerfile CMD stand.`,
    );
  }

  const watch = cfg?.build?.watchPatterns;
  if (watch !== undefined && !(Array.isArray(watch) && watch.length === 0)) {
    failures.push(
      `${rel}: sets \`build.watchPatterns\` (${JSON.stringify(watch)}). Railway ` +
        `then SKIPS deploys it considers unaffected — on 2026-08-02 a prod ` +
        `deploy skipped live while printing "Deploy complete". Note the ` +
        `dashboard setting MERGES with this file, so clearing it here is ` +
        `necessary and NOT sufficient.`,
    );
  }
}

if (failures.length) {
  console.error(
    'railway-manifests FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `railway-manifests OK — ${files.length} manifest(s), no startCommand, no ` +
    `non-empty watchPatterns. (Dashboard-side watchPatterns are NOT covered ` +
    `here; deploy.sh's unconditional SKIPPED check owns that half.)` +
    skipNote(skipped),
);
