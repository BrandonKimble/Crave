#!/usr/bin/env node
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
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Files to scan. Tracked TypeScript only — a backtick in a real .sql file is
 * harmless, since nothing is embedding it in a template there.
 */
function trackedTsFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '*.ts', '*.tsx'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

const files = trackedTsFiles();

// Missing tooling is a FAILURE, never a pass.
if (files.length === 0) {
  console.error(
    'FAIL: git ls-files returned no TypeScript files — the scan is broken, ' +
      'and a broken scan reports clean.',
  );
  process.exit(1);
}

/**
 * A SQL comment line: optional whitespace, then `--`. Inside a .ts file that
 * shape occurs essentially only in embedded SQL, and a decrement never starts
 * a line. We look only at this proven shape rather than trying to track
 * template-literal state — once the stray backtick is present the template's
 * own boundaries are ambiguous, so state-tracking would be reasoning about a
 * structure the defect has already destroyed.
 */
const SQL_COMMENT_LINE = /^\s*--/;

const failures = [];
for (const rel of files) {
  const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
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
    `inside an embedded SQL comment.`,
);
