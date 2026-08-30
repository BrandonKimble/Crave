/**
 * ENTITY-TYPE LITERALS ARE ENUM MEMBERS (entity-type coverage audit F-13).
 *
 * The defect class, three confirmed incidents deep:
 *   1. F3800 — three hand-copied search-group lists forgot `ingredients`
 *      (fixed by the QUERY_ENTITY_GROUP_KEYS satisfies-pin).
 *   2. 2026-08-19 — demand-vocabulary carried `'food'` inside an
 *      `as EntityType[]` cast; Postgres errored `'food'::entity_type` and
 *      the learn-a-word lane died loudly (found by hand).
 *   3. F-1 — keyword-slice-selection carried `'restaurant','food'` compared
 *      via `= ANY(text[])`, which fails SILENT: place+item demand (74% of
 *      on-demand rows) never selected, for months.
 *
 * The law: anywhere a STRING LITERAL is used as an entity-type value, it
 * must be a value of the Prisma EntityType enum. Enforced by scanning the
 * shapes those incidents actually took — not every string in the tree:
 *
 *   A. `'x'::entity_type` casts inside SQL text (incident 2's crash form,
 *      and any `= ANY(...)` list is usually near one);
 *   B. an array literal bound to an identifier whose name contains
 *      ENTITY_TYPE (incident 3's exact shape);
 *   C. an `entityTypes: [...]` property with literal members (the demand
 *      read's parameter shape);
 *   D. an array literal pinned `as EntityType[]` / `satisfies ... EntityType`
 *      (incident 2's cast-hidden shape — the pin should be doing the work,
 *      so a non-member inside it is a cast that LIED).
 *
 * Anything outside those shapes ('active', lane names, slice names) is not
 * an entity-type claim and is deliberately not judged — tuned against the
 * live tree at introduction (zero false positives across src/ + scripts/).
 * The registry mutation replants the F-1 literal verbatim and requires this
 * scan to go red (yarn invariants).
 */
import * as fs from 'fs';
import * as path from 'path';

const API_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(API_ROOT, 'prisma', 'schema.prisma');
const SCAN_ROOTS = [path.join(API_ROOT, 'src'), path.join(API_ROOT, 'scripts')];

function readEnumValues(): Set<string> {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const match = schema.match(/enum\s+EntityType\s*\{([\s\S]*?)\}/);
  if (!match) {
    console.error(
      'check-entity-type-literals: EntityType enum not found in schema.prisma',
    );
    process.exit(1);
  }
  const values = new Set<string>();
  for (const raw of match[1].split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const word = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*$/);
    if (word) values.add(word[1]);
  }
  if (!values.size) {
    console.error(
      'check-entity-type-literals: EntityType enum parsed to zero values',
    );
    process.exit(1);
  }
  return values;
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...listTsFiles(full));
    } else if (
      entry.name.endsWith('.ts') &&
      // The scanner names the shapes it hunts; it cannot judge itself.
      entry.name !== 'check-entity-type-literals.ts'
    ) {
      out.push(full);
    }
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  literal: string;
  shape: string;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function stringLiterals(chunk: string): string[] {
  const out: string[] = [];
  const re = /'([^'\\]*)'|"([^"\\]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) {
    out.push(m[1] ?? m[2]);
  }
  return out;
}

/** Comments are prose, not claims — incident 2's fix left the sentence
 *  "sent 'food'::entity_type" in a comment, and prose must stay sayable.
 *  Block comments and whitespace-led // comments are stripped before the
 *  shape scan (a `//` mid-string, e.g. https://, is not a comment lead). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function scanFile(
  file: string,
  enumValues: Set<string>,
  violations: Violation[],
): void {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  const rel = path.relative(API_ROOT, file);

  // Shape A: '<literal>'::entity_type
  {
    const re = /'([^'\n]+)'\s*::\s*entity_type/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (!enumValues.has(m[1])) {
        violations.push({
          file: rel,
          line: lineOf(text, m.index),
          literal: m[1],
          shape: "'<x>'::entity_type cast",
        });
      }
    }
  }

  // Shape B: <NAME-containing-ENTITY_TYPE> = [ ...literals... ]
  {
    const re =
      /\b[A-Za-z_$][\w$]*ENTITY_TYPES?[\w$]*\s*(?::\s*[^=;]{0,120}?)?=\s*\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      for (const literal of stringLiterals(m[1])) {
        if (!enumValues.has(literal)) {
          violations.push({
            file: rel,
            line: lineOf(text, m.index),
            literal,
            shape: 'ENTITY_TYPES-named array literal',
          });
        }
      }
    }
  }

  // Shape C: entityTypes: [ ...literals... ]
  {
    const re = /\bentityTypes\s*:\s*\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      for (const literal of stringLiterals(m[1])) {
        if (!enumValues.has(literal)) {
          violations.push({
            file: rel,
            line: lineOf(text, m.index),
            literal,
            shape: 'entityTypes property array',
          });
        }
      }
    }
  }

  // Shape D: [ ... ] as EntityType[] / satisfies ... EntityType
  {
    const re =
      /\[([^\]]*)\]\s*(?:as|satisfies)\s+(?:readonly\s+|const\s+)?\(?\s*EntityType\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      for (const literal of stringLiterals(m[1])) {
        if (!enumValues.has(literal)) {
          violations.push({
            file: rel,
            line: lineOf(text, m.index),
            literal,
            shape: 'array cast/pinned to EntityType',
          });
        }
      }
    }
  }
}

function main(): void {
  const enumValues = readEnumValues();
  const files = SCAN_ROOTS.flatMap((root) =>
    fs.existsSync(root) ? listTsFiles(root) : [],
  );
  if (files.length < 100) {
    // Liveness floor: this scan covers src/ + scripts/ — a run that saw
    // almost nothing is a broken scan, not a clean tree.
    console.error(
      `check-entity-type-literals: only ${files.length} files scanned — the scan is broken, not the tree clean`,
    );
    process.exit(1);
  }
  const violations: Violation[] = [];
  for (const file of files) {
    scanFile(file, enumValues, violations);
  }
  if (violations.length) {
    console.error(
      `check-entity-type-literals: ${violations.length} entity-type literal(s) are not EntityType enum members (${[...enumValues].join(', ')}):`,
    );
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line} — '${violation.literal}' (${violation.shape})`,
      );
    }
    console.error(
      'A stale literal here matches NO row (text-compare) or crashes the query (enum cast). Derive the list from Object.values(EntityType) or use EntityType members.',
    );
    process.exit(1);
  }
  console.log(
    `check-entity-type-literals: OK — ${files.length} files, every entity-type literal is an enum member`,
  );
}

main();
