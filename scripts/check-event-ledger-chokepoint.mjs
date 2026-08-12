#!/usr/bin/env node
// @script-class: gate
// @run-by: .github/workflows/ci.yml ('Static guard: the event ledger has one write door').
/**
 * GATE: nothing writes the evidence ledger except its front door.
 *
 * WHAT THE LEDGER IS. `core_restaurant_events` and
 * `core_restaurant_entity_events` are where every claim the corpus makes about
 * a restaurant lives — "this document said this dish is good here". The
 * projections users actually read (scores, dish lists, restaurant profiles)
 * are rebuilt FROM these two tables and nothing else.
 *
 * WHAT THE DOOR IS FOR (456f74894, the convergence audit's ranked change #1).
 * Entities merge. A merge archives the loser and re-keys its ledger rows onto
 * the winner. A writer that resolved its entity ids BEFORE that merge and
 * inserts AFTER it lands live evidence on an archived tombstone: the rebuild
 * reads by restaurant with no redirect hop, so the evidence is simply dark —
 * a restaurant quietly missing the dishes people said it was good at, until a
 * nightly sweep happened to find them. So `writeRestaurantEvents` /
 * `writeRestaurantEntityEvents` in extraction-scope.service.ts resolve every
 * id through `entity_redirects` at the moment of insert. That is the
 * invariant, and it is only an invariant if EVERY writer goes through them.
 *
 * WHY A GATE AND NOT A COMMENT. The rule was written as prose in the
 * chokepoint's header ("Writers must not call
 * tx.restaurantEvent/.restaurantEntityEvent.createMany directly") and enforced
 * by nothing — a 2026-08-12 red team walked the whole tree and found today's
 * three writers compliant, which is exactly the state in which the next writer
 * added is silently not. A rule whose only enforcement is that someone read
 * the header is a rule with a half-life.
 *
 * WHY NOT ESLINT. eslint.config.mjs holds ONE `no-restricted-syntax` block for
 * the whole tree, by a hard-won law printed in that file (flat config does not
 * merge rule OPTIONS, so a second block silently replaces the first), and that
 * block's `ignores` is the UNION of every selector's exemptions — it already
 * exempts unified-processing.service.ts and poll-ballot-mention.service.ts,
 * which are precisely the two originating writers this rule exists to bind. A
 * selector added there would be exempt exactly where it matters.
 *
 * RED PROOF: add `await tx.restaurantEvent.createMany({ data: rows })` to any
 * file other than the owner and this exits 1 naming the line.
 */
import { execFileSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { readTrackedFile, skipNote } from './lib/tracked-source.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * THE ONE OWNER. The chokepoint functions live here, so this is the only file
 * allowed to name the Prisma create verbs on either ledger model — and the
 * only file allowed to write raw `INSERT INTO` against either table.
 */
const OWNER =
  'apps/api/src/modules/content-processing/reddit-collector/extraction-scope.service.ts';

/**
 * DELIBERATE EXCEPTIONS, each with the reason it is not a production writer.
 * A spec that BYPASSES the door on purpose is how the crash-window backstop
 * gets proven — it must be able to write a tombstoned row.
 */
const EXCEPTIONS = new Map([
  [
    'apps/api/src/modules/content-processing/reddit-collector/redirect-aware-event-write.integration.spec.ts',
    'plants an unresolved row on purpose, to prove the tombstone sweep heals it',
  ],
]);

/**
 * The Prisma create verbs on either ledger model, in every spelling that
 * reaches the database: `.restaurantEvent.create(`, `.createMany(`,
 * `.createManyAndReturn(`, `.upsert(`. Matched on the MODEL ACCESSOR so the
 * client variable's name (`tx`, `prisma`, `this.prisma`) does not matter.
 */
const PRISMA_WRITE =
  /\.(restaurantEvent|restaurantEntityEvent)\s*\.\s*(create|createMany|createManyAndReturn|upsert)\s*\(/g;

/** Raw SQL that inserts into either ledger table, in any casing/whitespace. */
const RAW_INSERT =
  /insert\s+into\s+(?:public\s*\.\s*)?(core_restaurant_events|core_restaurant_entity_events)\b/gi;

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.sql'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const files = trackedFiles();

// Missing tooling is a FAILURE, never a pass (the tool-absence-swallow class:
// a gate whose subject list came back empty reports clean and means nothing).
if (files.length === 0) {
  console.error(
    'FAIL: git ls-files returned no source files — the scan is broken, and a ' +
      'broken scan reports clean.'
  );
  process.exit(1);
}

// The owner must exist and must still hold the door. If someone renames or
// deletes it, this gate would otherwise pass by finding nothing anywhere.
const ownerSrc = readTrackedFile(join(REPO_ROOT, OWNER));
if (ownerSrc === null) {
  console.error(
    `FAIL: the ledger's owner file is missing: ${OWNER}. Either it moved (update ` +
      'OWNER here in the same commit) or the chokepoint is gone.'
  );
  process.exit(1);
}
for (const door of ['writeRestaurantEvents', 'writeRestaurantEntityEvents']) {
  if (!ownerSrc.includes(`export async function ${door}`)) {
    console.error(
      `FAIL: ${OWNER} no longer exports ${door} — the write door this gate ` +
        'protects does not exist.'
    );
    process.exit(1);
  }
}

const failures = [];
const allowed = [];
let skipped = 0;
for (const rel of files) {
  if (rel === OWNER) continue;
  const src = readTrackedFile(join(REPO_ROOT, rel));
  if (src === null) {
    skipped += 1;
    continue;
  }
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    PRISMA_WRITE.lastIndex = 0;
    RAW_INSERT.lastIndex = 0;
    const hit = PRISMA_WRITE.test(line) || RAW_INSERT.test(line);
    if (!hit) continue;
    const reason = EXCEPTIONS.get(rel);
    if (reason) {
      allowed.push(`${rel}:${i + 1} (${reason})`);
      continue;
    }
    failures.push(
      `${rel}:${i + 1} — writes the evidence ledger directly. Every insert ` +
        `must go through writeRestaurantEvents / writeRestaurantEntityEvents ` +
        `in ${OWNER}, which resolve entity_redirects at insert time; a direct ` +
        `write lands live evidence on a merged-away tombstone, where the ` +
        `projection rebuild cannot see it.\n      ${line.trim()}`
    );
  }
}

if (failures.length) {
  console.error('event-ledger-chokepoint FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(
  `event-ledger-chokepoint OK — ${files.length} tracked source files, no ` +
    `direct write to core_restaurant_events / core_restaurant_entity_events ` +
    `outside ${OWNER}` +
    skipNote(skipped) +
    (allowed.length
      ? `. Declared exceptions: ${allowed.join('; ')}`
      : '. No declared exceptions in use.') +
    ' SCOPE: this reads source text, so it binds the spellings above — a ' +
    'write funnelled through a dynamically-built model accessor is not ' +
    'visible to it.'
);
