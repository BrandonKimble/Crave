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
 * file other than the owner and this exits 1 naming the line — including when
 * prettier has wrapped it across two lines, and including in a `.mjs` script.
 * Both of those escaped the gate until 2026-08-13; see the matcher below.
 */
import { scanRepo } from './lib/scan-repo.mjs';

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
  [
    'apps/api/src/shared/invariants/registry.ts',
    'DECLARES the defect as a string, so that the invariant harness can plant ' +
      'it in a scratch file and prove this gate still rejects it. The registry ' +
      'never executes anything; a mutation that could not spell the banned ' +
      'shape would not be a proof of anything',
  ],
  [
    'scripts/check-event-ledger-chokepoint.mjs',
    'is THIS GATE. Widening the pathspec to .mjs brought it into its own ' +
      'subject list, where its RED-PROOF header sentence and the PRISMA_WRITE ' +
      'pattern source both spell the banned shape. Same reason as the ' +
      'registry: a gate that could not write down what it forbids could not ' +
      'forbid it. It holds no database client',
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

/**
 * The subject list. UNTRACKED FILES ARE IN SCOPE: a new service that writes
 * the ledger directly is a live defect from the moment it exists, not from
 * the moment it is staged. scanRepo owns the refusal-on-zero and tells a
 * missing/failing git apart from a clean scan.
 *
 * `.mjs`/`.js`/`.cjs` ARE IN SCOPE (2026-08-13). The pathspec used to be
 * TypeScript and SQL only, which quietly declared that JavaScript cannot
 * reach the database — and this repository runs a whole shelf of node
 * scripts that hold a PrismaClient (scripts/, apps/api/scripts/*.mjs,
 * data-fixes). A one-off backfill written in .mjs is exactly the writer that
 * resolves its ids, takes minutes to run, and inserts after a merge lands.
 * The file extension was never the reason the rule applied.
 */
const scan = scanRepo({
  label: 'event-ledger-chokepoint',
  pathspecs: ['*.ts', '*.tsx', '*.mjs', '*.js', '*.cjs', '*.sql'],
});
const files = scan.files;

// The owner must exist and must still hold the door. If someone renames or
// deletes it, this gate would otherwise pass by finding nothing anywhere.
const ownerSrc = scan.read(OWNER);
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

/**
 * THE MATCH IS OVER THE WHOLE FILE, NOT LINE BY LINE (2026-08-13).
 *
 * This loop used to `split('\n')` and test each line, which made the gate
 * defeatable BY PRETTIER. Both patterns already spell their gaps `\s*`, and
 * `\s` matches a newline — but a line-at-a-time test can never see one. So
 *
 *     await tx.restaurantEvent
 *       .createMany({ data: rows });
 *
 * passed, and that is not an exotic hand-crafted evasion: it is what the
 * formatter PRODUCES the moment the expression grows past the print width.
 * The gate was one long variable name away from silently not applying. The
 * same holds for the raw-SQL arm, where a wrapped `INSERT\n INTO` in a
 * Prisma.sql template is entirely ordinary.
 *
 * Matching the joined source costs the line number, so we recover it by
 * counting newlines up to the match index and quote that line for the
 * report — a multi-line hit is reported at the line the write STARTS on.
 */
function lineAt(src, index) {
  return src.slice(0, index).split('\n').length;
}

function findWrites(src) {
  const hits = [];
  for (const pattern of [PRISMA_WRITE, RAW_INSERT]) {
    pattern.lastIndex = 0;
    for (let m = pattern.exec(src); m !== null; m = pattern.exec(src)) {
      const line = lineAt(src, m.index);
      hits.push({ line, text: m[0].replace(/\s+/g, ' ').trim() });
      // A zero-length match cannot happen with these patterns, but an
      // unadvanced lastIndex would spin forever if one ever did.
      if (m[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

const failures = [];
const allowed = [];
for (const rel of files) {
  if (rel === OWNER) continue;
  const src = scan.read(rel);
  if (src === null) continue;
  for (const hit of findWrites(src)) {
    const reason = EXCEPTIONS.get(rel);
    if (reason) {
      allowed.push(`${rel}:${hit.line} (${reason})`);
      continue;
    }
    failures.push(
      `${rel}:${hit.line} — writes the evidence ledger directly. Every insert ` +
        `must go through writeRestaurantEvents / writeRestaurantEntityEvents ` +
        `in ${OWNER}, which resolve entity_redirects at insert time; a direct ` +
        `write lands live evidence on a merged-away tombstone, where the ` +
        `projection rebuild cannot see it.\n      ${hit.text}`
    );
  }
}

if (failures.length) {
  console.error('event-ledger-chokepoint FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(
  `event-ledger-chokepoint OK — ${files.length} source files, no ` +
    `direct write to core_restaurant_events / core_restaurant_entity_events ` +
    `outside ${OWNER}` +
    scan.note() +
    (allowed.length
      ? `. Declared exceptions: ${allowed.join('; ')}`
      : '. No declared exceptions in use.') +
    ' SCOPE: this reads source text, so it binds the spellings above — a ' +
    'write funnelled through a dynamically-built model accessor is not ' +
    'visible to it.'
);
