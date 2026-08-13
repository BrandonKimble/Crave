#!/usr/bin/env node
// @script-class: gate
// @run-by: .github/workflows/ci.yml ('Static guard: no backtick inside an embedded SQL comment').
/**
 * GATE: no backtick inside a SQL comment in a template literal.
 *
 * THE TRAP (CLAUDE.md, "cost 4 round trips in one day"). This repo writes SQL
 * in `Prisma.sql` template literals. A backtick inside a SQL comment —
 *
 *     -- a bare `::date` literal resolves in the session timezone
 *
 * — CLOSES THE TEMPLATE. Everything after it parses as ordinary TypeScript,
 * which it is not, and tsc reports a cascade of nonsense: `TS1005: ',' expected`,
 * `TS1134: Variable declaration expected`, sometimes anchored a line or two off
 * the real cause. Reproduced while writing this gate: a three-line SQL comment
 * with one backtick produced three errors, none of which mentions a template
 * literal, a backtick, or a string.
 *
 * WHY A SEPARATE SCANNER AND NOT A LINT RULE. Both eslint and tsc need to PARSE
 * the file, and the file no longer parses — that is the whole defect. Any
 * parser-based tool can only report where it got confused, never why. A text
 * scan is the only thing that still works on a file in this state, which is
 * exactly when you need the answer.
 *
 * So this is not a second detector for something tsc already catches. tsc
 * catches it; tsc cannot NAME it. This names it.
 *
 * THE RULE, from CLAUDE.md: no backticks inside a template literal, ever — in
 * SQL comments write `::date` bare. Same family as a nested end-of-comment
 * marker terminating a doc comment early.
 */
import { scanRepo } from './lib/scan-repo.mjs';

/**
 * Files to scan: TypeScript only — a backtick in a real .sql file is harmless,
 * since nothing is embedding it in a template there.
 *
 * UNTRACKED FILES ARE IN SCOPE, and that is the point of the shared
 * enumeration: this gate used to read the INDEX only, so a brand-new .ts file
 * carrying the trap compiled, failed tsc with the unrelated TS1005 cascade the
 * header describes, and was invisible to the one tool that could have NAMED
 * it — until someone thought to `git add` first. scanRepo refuses on an empty
 * subject list and discriminates a missing/failing git from a clean scan.
 */
const scan = scanRepo({
  label: 'sql-comment-backticks',
  pathspecs: ['*.ts', '*.tsx'],
});
const files = scan.files;

/**
 * A SQL comment line: optional whitespace, then `--`. Inside a .ts file that
 * shape occurs essentially only in embedded SQL, and a decrement never starts
 * a line. We look only at this proven shape rather than trying to track
 * template-literal state — once the stray backtick is present the template's
 * own boundaries are ambiguous, so state-tracking would be reasoning about a
 * structure the defect has already destroyed.
 *
 * THE SCOPE THIS LEAVES OPEN, stated so a green run is not over-read (F3912).
 * The law is "no backtick inside a template literal, EVER" — the trap is
 * position-agnostic. This gate enforces a strict SUBSET: comments that START a
 * line. A TRAILING comment —
 *
 *     SELECT 1 -- a bare `::date` note
 *
 * — closes the template just the same and passes here. The scope is not an
 * oversight; it is the header's own argument applied honestly. Widening it
 * needs template-literal state, which is the structure the defect destroys,
 * and the only hardened stripper in this repo
 * (`apps/api/src/shared/testing/code-only.ts`) is TypeScript that this .mjs
 * gate cannot import — replicating it here would recreate the very duplicate
 * F3911 just eliminated. So the limitation is PRINTED on every OK line
 * instead: the gate's job is to NAME the trap, tsc still catches the break,
 * and an operator who reads "no line-initial backtick" as "no backtick" is the
 * only way this scope can hurt.
 */
const SQL_COMMENT_LINE = /^\s*--/;

const failures = [];
for (const rel of files) {
  // null = in the index, absent from the worktree. scanRepo counts the skip
  // and prints it in note(); it is never silent and never a crash.
  const src = scan.read(rel);
  if (src === null) continue;
  if (!src.includes('--')) continue;
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!SQL_COMMENT_LINE.test(line)) continue;
    if (!line.includes('`')) continue;
    failures.push(
      `${rel}:${i + 1} — backtick inside a SQL comment. This ENDS the ` +
        `template literal; everything after it parses as TypeScript and tsc ` +
        `will report TS1005/TS1134 somewhere unrelated. Write the term bare ` +
        `(\`::date\` -> ::date).\n      ${line.trim()}`,
    );
  }
}

if (failures.length) {
  console.error(
    'sql-comment-backticks FAILED:\n' +
      failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `sql-comment-backticks OK — ${files.length} TypeScript files, no backtick ` +
    `in a LINE-INITIAL SQL comment` +
    scan.note() +
    `. SCOPE (F3912): this checks comments that START a line only. A TRAILING ` +
    `\`-- ... \\\` ...\` closes the template just as hard and is NOT covered ` +
    `here — tsc catches the break, this gate only names the ones it sees.`,
);
