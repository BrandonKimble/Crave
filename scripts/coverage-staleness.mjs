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
let unverifiable = 0;
let rescued = 0;
const staleRows = [];
const unverifiableRows = [];

/** Cheap membership test: is this token a commit we can resolve? */
const commitCache = new Map();
function isCommitish(sha) {
  if (commitCache.has(sha)) return commitCache.get(sha);
  let ok = false;
  try {
    execFileSync('git', ['rev-parse', '--verify', `${sha}^{commit}`], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    ok = true;
  } catch {
    ok = false;
  }
  commitCache.set(sha, ok);
  return ok;
}

/** The blob sha this path had AT that commit, or null if it did not exist. */
function blobShaAtCommit(commit, path) {
  try {
    const out = execFileSync('git', ['ls-tree', commit, '--', path], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = /^\S+\s+blob\s+(\S+)\t/.exec(out);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

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
  const token = recorded.split(/\s/)[0] ?? '';

  // F2600 — MY OWN GUARD COULD NOT FAIL HERE. This used to `continue` on any
  // non-hex token AFTER counting the row as reviewed, so 112 rows carrying
  // `Read`, `npx`, `Prompt`, `-`, `(uncommitted` were permanently exempt while
  // the summary printed "3595 reviewed, 2 STALE" — completeness it never
  // measured. A row whose review point is unrecorded is not fresh; it is
  // UNVERIFIABLE, and saying so is the whole job.
  if (!/^[0-9a-f]{7,40}$/.test(token)) {
    unverifiable += 1;
    unverifiableRows.push({ path, status, token: token || '(empty)' });
    if (apply) {
      // Same bias as a stale row, for the same reason: a review nobody can
      // reproduce is not a review. Filling in the CURRENT sha instead would
      // assert a verification that never happened — it would make the ledger
      // agree with itself by inventing the evidence, which is the failure this
      // whole pass exists to end.
      cols[2] = ` UNREVIEWED${' '.repeat(Math.max(0, cols[2].length - 12))}`;
      cols[5] = `${cols[5].replace(/\s+$/, '')} (reverted from ${status}: review point unrecorded, sha column read "${token || 'empty'}" — F2600) `;
      lines[i] = `|${cols.join('|')}`;
    }
    continue;
  }
  const recordedSha = token;

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

  // F2600 — A COMMIT SHA IS A VALID REVIEW POINT, just a differently-shaped
  // one. 46 of one territory's 110 rows recorded the COMMIT the review landed
  // in rather than the file's blob sha; comparing those against a blob sha can
  // never match, so a whole pass (38 files read, 63 tests, two mutation proofs)
  // was reverted by bookkeeping rather than by any edit. Resolve the file AT
  // that commit and compare CONTENT: if it is byte-identical, the review still
  // stands.
  if (isCommitish(recordedSha)) {
    const thenSha = blobShaAtCommit(recordedSha, path);
    if (thenSha && thenSha === now) {
      rescued += 1;
      if (apply) {
        // Normalise to the blob sha so the next run compares directly.
        cols[4] = ` ${now.slice(0, 12)} (was commit ${recordedSha.slice(0, 9)}) `;
        lines[i] = `|${cols.join('|')}`;
      }
      continue;
    }
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
    `changed since review), ${rescued} verified via a COMMIT review point, ` +
    `${unverifiable} UNVERIFIABLE (no usable review point), ${missing} whose ` +
    `path is no longer tracked.`,
);
for (const r of unverifiableRows.slice(0, 15)) {
  console.log(`  UNVERIFIABLE  ${r.status.padEnd(15)} ${r.path}  (sha column: ${r.token})`);
}
if (unverifiableRows.length > 15) {
  console.log(`  ... and ${unverifiableRows.length - 15} more unverifiable rows.`);
}
for (const r of staleRows.slice(0, 40)) {
  console.log(`  ${r.status.padEnd(15)} ${r.path}  (${r.recordedSha} -> ${r.now})`);
}
if (staleRows.length > 40) {
  console.log(`  ... and ${staleRows.length - 40} more (nothing truncated in --apply).`);
}
if (apply) console.log(`Reverted ${stale} row(s) to UNREVIEWED.`);
// An UNVERIFIABLE row fails too. The alternative — counting it and moving on —
// is precisely the hole F2600 found in this file: a guard reporting coverage it
// never measured.
if (check && (stale > 0 || unverifiable > 0)) process.exit(1);
