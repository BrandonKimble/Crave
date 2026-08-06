#!/usr/bin/env node
/**
 * COVERAGE staleness — a reviewed row whose file has changed is not reviewed.
 *
 * THE RULE (rederivation mandate): "revert a row to UNREVIEWED when its file
 * changes." Until now that rule was applied by MEMORY. A rule you have to
 * remember is a convention, and the whole point of IDEAL-VERIFIED is that it
 * means someone read the file AND argued the shape is right — a stale one is
 * worse than an unreviewed one, because it is never re-examined.
 *
 * So the rule is mechanical: every row records the blob sha it was reviewed at;
 * this recomputes the sha and reports (or, with --apply, performs) the reverts.
 *
 * WHAT IT CANNOT DO: it compares content, so a row can go stale for a
 * whitespace-only edit. That is the correct bias — a false UNREVIEWED costs one
 * re-read, a false IDEAL-VERIFIED costs the thing this whole exercise exists to
 * prevent.
 *
 *   node scripts/coverage-staleness.mjs           # report only, exit 0
 *   node scripts/coverage-staleness.mjs --apply   # rewrite stale rows
 *   node scripts/coverage-staleness.mjs --check   # exit 1 if any row is stale
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COVERAGE = join(REPO_ROOT, 'audit/COVERAGE.md');

/** Statuses that assert someone reviewed the file AT a particular sha. */
const REVIEWED = new Set(['IDEAL-VERIFIED', 'REDERIVED', 'PARTIAL', 'FIXED']);
/** Statuses about a file's absence — a sha means nothing for these. */
const ABSENT = new Set(['DELETED', 'MOOT']);

const apply = process.argv.includes('--apply');
const check = process.argv.includes('--check');

/** Current blob sha for every tracked path, in ONE git call. */
function currentShas() {
  const out = execFileSync('git', ['ls-files', '-s'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const map = new Map();
  for (const line of out.split('\n')) {
    if (!line) continue;
    // <mode> <sha> <stage>\t<path>
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const sha = line.slice(0, tab).split(/\s+/)[1];
    map.set(line.slice(tab + 1), sha);
  }
  return map;
}

const shas = currentShas();
// Missing tooling is a FAILURE, never a pass.
if (shas.size === 0) {
  console.error('FAIL: git ls-files -s returned nothing — the scan is broken.');
  process.exit(1);
}

const lines = readFileSync(COVERAGE, 'utf8').split('\n');
let reviewed = 0;
let stale = 0;
let missing = 0;
const staleRows = [];

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  if (!line.startsWith('| ')) continue;
  const cols = line.slice(1).split('|');
  if (cols.length < 6) continue;
  const path = cols[0].trim().replace(/^"|"$/g, '');
  const status = cols[2].trim();
  if (path === 'path' || /^-+$/.test(path)) continue;
  if (ABSENT.has(status)) continue;
  if (!REVIEWED.has(status)) continue;
  reviewed += 1;

  const recorded = cols[4].trim();
  if (!/^[0-9a-f]{7,40}$/.test(recorded.split(/\s/)[0] ?? '')) continue;
  const recordedSha = recorded.split(/\s/)[0];

  const now = shas.get(path);
  if (now === undefined) {
    // Tracked-at-review, absent now. Not stale — the row's subject is gone, and
    // saying so is a different (DELETED) judgement a human should make.
    missing += 1;
    continue;
  }
  if (now.startsWith(recordedSha) || recordedSha.startsWith(now.slice(0, recordedSha.length))) {
    continue;
  }

  stale += 1;
  staleRows.push({ path, status, recordedSha, now: now.slice(0, 12) });
  if (apply) {
    cols[2] = ` UNREVIEWED${' '.repeat(Math.max(0, cols[2].length - 12))}`;
    cols[5] = `${cols[5].replace(/\s+$/, '')} (reverted from ${status}: file changed since review, was ${recordedSha}) `;
    lines[i] = `|${cols.join('|')}`;
  }
}

if (apply) {
  writeFileSync(COVERAGE, lines.join('\n'));
}

console.log(
  `coverage-staleness — ${reviewed} reviewed rows, ${stale} STALE (file ` +
    `changed since review), ${missing} whose path is no longer tracked.`,
);
for (const r of staleRows.slice(0, 40)) {
  console.log(`  ${r.status.padEnd(15)} ${r.path}  (${r.recordedSha} -> ${r.now})`);
}
if (staleRows.length > 40) {
  console.log(`  ... and ${staleRows.length - 40} more (nothing truncated in --apply).`);
}
if (apply) console.log(`Reverted ${stale} row(s) to UNREVIEWED.`);
if (check && stale > 0) process.exit(1);
