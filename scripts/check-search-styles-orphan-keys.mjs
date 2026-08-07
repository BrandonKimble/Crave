#!/usr/bin/env node
/**
 * GATE: every key of a StyleSheet in screens/Search is READ through the sheet.
 *
 * THE INCIDENT (F5706 → F5851). A person read all 156 keys of a 932-line
 * stylesheet by hand and found THREE that nothing used. They were deleted (D98,
 * 90a80e2f5), but the finding mechanism was a human reading a file — it does not
 * scale and it does not repeat. The orphan check in
 * check-search-runtime-hook-names.mjs could not have found them: it asks whether
 * a MODULE is reached, never whether a member of one is. `styles.ts` has
 * sixteen importers, so it is maximally alive at file granularity while
 * containing dead weight at key granularity. Those are different questions, and
 * only one of them was being asked.
 *
 * THE TRAP THAT MAKES A NAIVE SWEEP LIE, and it is why this gate exists in this
 * shape. Two of the three orphans survived only in PROSE — comments in
 * overlaySheetStyles.ts:59 and ChromeTitleText.tsx:12 that NAME the key while
 * describing its history — and a third had a live SAME-NAMED key in a
 * component-local StyleSheet in SearchSuggestions.tsx:556. A grep for the bare
 * identifier answers "used" for all three. So this gate does two things a grep
 * does not: it strips comments before matching (prose cannot vote), and it
 * matches MEMBER ACCESS THROUGH THIS SHEET'S OWN BINDING — `<local>.<key>`,
 * where `<local>` is the name the consuming file actually bound this module to.
 * A same-named key on somebody else's sheet is somebody else's binding and
 * credits nothing here.
 *
 * WHAT THIS PROVES. For every `StyleSheet.create({...})` under
 * apps/mobile/src/screens/Search, every top-level key of the object is named by
 * a `<binding>.<key>` member access in the defining file or — when the sheet is
 * exported — in some file under apps/mobile/src that imports it.
 *
 * THE STATED BIASES, all in the OVER-CREDIT direction, because a gate whose
 * verdict is "delete this" must never be the loose one (D83's rule, inherited
 * from the module-orphan check next door):
 *   - importers are found by LAST PATH SEGMENT of the specifier, not by a
 *     resolved path — two modules with the same stem credit each other;
 *   - a COMPUTED access on the binding (`styles[name]`) makes the key set
 *     unknowable statically, so the whole sheet is credited and the skip is
 *     COUNTED AND PRINTED;
 *   - a namespace import (`* as m`), a `require()`/dynamic `import()` of the
 *     stem, or a re-export (`export … from`) does the same;
 *   - only TOP-LEVEL keys of the create object are subjects. A nested style
 *     member is not addressable as `styles.<key>` and is not a claim of its own.
 *
 * Comment stripping: ./lib/strip-comments.mjs (see that file for its lineage
 * back to apps/api/src/shared/testing/code-only.ts).
 *
 * MUTATION PROOF (2026-08-07, both mutations from the F5851 row, run):
 *   (1) add an unreferenced key to screens/Search/styles.ts → RED, naming
 *       styles.ts:<line> and the key.
 *   (2) add an unreferenced key AND mention its bare name in a comment in
 *       another file → STILL RED, because prose is stripped before matching.
 *   Clean tree → GREEN. Zero sheets or zero keys scanned is a FAILURE.
 */
import { execFileSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { stripComments } from './lib/strip-comments.mjs';
import { readTrackedFile, skipNote } from './lib/tracked-source.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH_DIR = join(REPO_ROOT, 'apps/mobile/src/screens/Search');
const MOBILE_SRC = join(REPO_ROOT, 'apps/mobile/src');

// Missing tooling is a FAILURE, never a pass.
for (const dir of [SEARCH_DIR, MOBILE_SRC]) {
  if (!existsSync(dir)) {
    console.error(
      `FAIL: ${dir} does not exist. This gate measures nothing until the ` +
        `directory resolves — if the layer moved, move this gate with it.`,
    );
    process.exit(1);
  }
}

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(abs));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Subjects come from the INDEX, so an untracked scratch file cannot fail CI. */
function trackedSearchFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', 'apps/mobile/src/screens/Search'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\.tsx?$/.test(l))
    .map((l) => join(REPO_ROOT, l));
}

const CREATE_RE = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*StyleSheet\s*\.\s*create\s*\(\s*\{/g;

/**
 * The balanced `{ … }` starting at `open`. Strings are already quote-aware in
 * the stripped source, so the scan tracks quotes as well as depth — an
 * unbalanced brace inside a string literal would otherwise truncate the object
 * and silently shrink the key set (a scan of fewer keys is a silent green).
 */
function objectBodyEnd(code, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Top-level `key:` names inside the create object, with 1-based line numbers. */
function topLevelKeys(code, open, end) {
  const keys = [];
  let depth = 0;
  let quote = null;
  for (let i = open; i <= end; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') {
      depth += 1;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth -= 1;
      continue;
    }
    if (depth !== 1) continue;
    const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(code.slice(i, i + 80));
    if (!m) continue;
    const before = code[i - 1];
    // A key starts after `{` or `,` (whitespace aside) — never mid-identifier.
    if (before !== undefined && /[\w$.]/.test(before)) continue;
    keys.push({
      name: m[1],
      line: code.slice(0, i).split('\n').length,
    });
    i += m[0].length - 1;
  }
  return keys;
}

const stemOf = (abs) => abs.slice(abs.lastIndexOf('/') + 1).replace(/\.tsx?$/, '');

/**
 * The local names a consumer bound this module to, or `null` meaning
 * "credit everything" (a form whose member reads cannot be enumerated).
 */
function bindingsFor(code, stem) {
  const bindings = new Set();
  let creditAll = false;
  const spec = `(?:'[^']*\\/${stem}'|"[^"]*\\/${stem}"|'\\.\\/${stem}'|"\\.\\/${stem}")`;
  // Re-export, namespace import, and dynamic forms: unenumerable, so credit all.
  if (new RegExp(`export\\s+[^;]*?from\\s+${spec}`).test(code)) creditAll = true;
  if (new RegExp(`import\\s+\\*\\s+as\\s+[\\w$]+\\s+from\\s+${spec}`).test(code)) creditAll = true;
  if (new RegExp(`(?:require|import)\\s*\\(\\s*${spec}`).test(code)) creditAll = true;
  for (const m of code.matchAll(new RegExp(`import\\s+([^;]*?)\\s+from\\s+${spec}`, 'g'))) {
    const clause = m[1];
    const defaultMatch = /^\s*([A-Za-z_$][\w$]*)/.exec(clause);
    if (defaultMatch) bindings.add(defaultMatch[1]);
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(',')) {
        const alias = /([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/.exec(part.trim());
        if (alias) bindings.add(alias[2] ?? alias[1]);
      }
    }
  }
  return creditAll ? null : bindings;
}

const skipped = { count: 0 };
function read(abs) {
  const raw = readTrackedFile(abs);
  if (raw === null) {
    skipped.count += 1;
    return null;
  }
  return stripComments(raw);
}

const subjectFiles = trackedSearchFiles();
if (subjectFiles.length === 0) {
  console.error(
    'FAIL: git ls-files found no TypeScript under screens/Search — the ' +
      'subject scan is broken, and a broken scan reports clean.',
  );
  process.exit(1);
}

const consumerFiles = collectSourceFiles(MOBILE_SRC);
if (consumerFiles.length === 0) {
  console.error(
    'FAIL: zero consumer files scanned under apps/mobile/src. A member-use ' +
      'check over an empty corpus reports every key as an orphan; an empty ' +
      'corpus is a broken scan, not a finding.',
  );
  process.exit(1);
}

const consumerCode = new Map();
for (const abs of consumerFiles) {
  const code = read(abs);
  if (code !== null) consumerCode.set(abs, code);
}

const sheets = [];
for (const abs of subjectFiles) {
  const code = read(abs);
  if (code === null) continue;
  CREATE_RE.lastIndex = 0;
  for (const match of code.matchAll(CREATE_RE)) {
    const open = code.indexOf('{', match.index + match[0].length - 1);
    const end = objectBodyEnd(code, open);
    if (end < 0) {
      console.error(
        `FAIL: unbalanced StyleSheet.create object in ${abs} — the key scan ` +
          `would silently see fewer keys than exist.`,
      );
      process.exit(1);
    }
    sheets.push({
      abs,
      code,
      name: match[1],
      exported:
        /^export\s/.test(match[0]) ||
        new RegExp(`export\\s+default\\s+${match[1]}\\b`).test(code) ||
        new RegExp(`export\\s*\\{[^}]*\\b${match[1]}\\b`).test(code),
      keys: topLevelKeys(code, open, end),
    });
  }
}

if (sheets.length === 0) {
  console.error(
    'FAIL: zero StyleSheet.create sheets found under screens/Search. Either ' +
      'the styling convention changed (retarget this gate deliberately) or ' +
      'the pattern rotted — a scan of nothing is a silent green.',
  );
  process.exit(1);
}

const totalKeys = sheets.reduce((n, s) => n + s.keys.length, 0);
if (totalKeys === 0) {
  console.error(
    'FAIL: the sheets were found but zero keys were parsed out of them — ' +
      'the key parser rotted, and a gate with no subjects always passes.',
  );
  process.exit(1);
}

const orphans = [];
let creditedAllSheets = 0;
for (const sheet of sheets) {
  const stem = stemOf(sheet.abs);
  // The defining file reads the sheet through the const's own name.
  const scopes = [{ code: sheet.code, names: new Set([sheet.name]) }];
  let creditAll = false;
  if (sheet.exported) {
    for (const [abs, code] of consumerCode) {
      if (abs === sheet.abs) continue;
      const names = bindingsFor(code, stem);
      if (names === null) {
        creditAll = true;
        break;
      }
      if (names.size) scopes.push({ code, names });
    }
  }
  if (creditAll) {
    creditedAllSheets += 1;
    continue;
  }
  const used = new Set();
  for (const scope of scopes) {
    for (const name of scope.names) {
      if (new RegExp(`\\b${name}\\s*\\[`).test(scope.code)) {
        creditAll = true;
        break;
      }
      for (const m of scope.code.matchAll(
        new RegExp(`\\b${name}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g'),
      )) {
        used.add(m[1]);
      }
    }
    if (creditAll) break;
  }
  if (creditAll) {
    creditedAllSheets += 1;
    continue;
  }
  for (const key of sheet.keys) {
    if (!used.has(key.name)) {
      orphans.push(
        `  - ${sheet.abs.slice(REPO_ROOT.length + 1)}:${key.line} — ` +
          `${sheet.name}.${key.name}`,
      );
    }
  }
}

const creditNote = creditedAllSheets
  ? ` (${creditedAllSheets} sheet(s) CREDITED WHOLE — reached by a computed, ` +
    `namespace, dynamic or re-exported form whose member reads cannot be ` +
    `enumerated statically; their keys are NOT checked.)`
  : '';

if (orphans.length) {
  console.error(
    `search-styles-orphan-keys FAILED — ${orphans.length} StyleSheet key(s) ` +
      `under screens/Search are never read through their own sheet:\n` +
      orphans.join('\n') +
      '\nA key nothing addresses is dead weight in a file reviewers read as ' +
      'the styling contract (F5706/F5851). Delete it — or, if it is reached ' +
      'by a form this gate cannot see, say so at the definition, because ' +
      'nothing else asks whether a stylesheet member is used at all.' +
      creditNote +
      skipNote(skipped.count),
  );
  process.exit(1);
}

console.log(
  `search-styles-orphan-keys OK — ${totalKeys} key(s) across ${sheets.length} ` +
    `StyleSheet.create sheet(s) under screens/Search are each read through ` +
    `their own binding, checked against ${consumerCode.size} source files ` +
    `under apps/mobile/src.${creditNote}${skipNote(skipped.count)}`,
);
