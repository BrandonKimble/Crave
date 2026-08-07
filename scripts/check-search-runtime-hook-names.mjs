#!/usr/bin/env node
/**
 * GATE: a `use-*` file in the Search runtime/shared layer must call a hook.
 *
 * THE INCIDENT (F2900/D70). The runtime/shared composition layer grew 462
 * files; a full census found 13 files whose `use-` prefix was a NAME-LIE —
 * pure type/contract files and plain derive/pluck functions that call NO hook
 * at all (one was 401 lines of types named `use-...-contract.ts`). The prefix
 * is a load-bearing claim: reviewers grant hook files the Rules-of-Hooks
 * reading (call-order sensitivity, render-time-only), and react-hooks lint
 * treats `useX(` callers differently. A name that lies about being a hook
 * makes every one of those readings wrong silently.
 *
 * WHAT THIS PROVES. Every `use-*.ts`/`use-*.tsx` under
 * apps/mobile/src/screens/Search/runtime/shared calls at least one hook —
 * a `useX(...)` (optionally generic: `useX<...>(...)`) in CODE, not comments.
 * Type-position references (`typeof useX`) do not count: `ReturnType<typeof
 * useSharedValue<number>>` is a type describing a hook, not a call to one.
 *
 * Comment stripping replicates apps/api/src/shared/testing/code-only.ts (the
 * repo's "source as the compiler sees it" precedent, and since F3911 its ONE
 * home) — replicated locally rather than imported because scripts/ must not
 * reach across workspaces into apps/api's TS toolchain. A replica is a debt:
 * it inherited the F3910 regex-literal false strip and has been repaired to
 * match. If the original changes again, this changes with it.
 *
 * MUTATION PROOF (2026-08-06): run against the pre-rename tree, this gate
 * failed naming all 13 NAME-LIE files; after the D70 Stage-1 renames it
 * passes. Zero files scanned is a FAILURE, never a pass.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_DIR = join(
  REPO_ROOT,
  'apps/mobile/src/screens/Search/runtime/shared',
);

/**
 * F3910, ported. A `/` in EXPRESSION position opens a regex literal, and a
 * regex containing escaped slashes ends in `//` — which the line-comment
 * branch below would read as a comment and use to blank the REST OF THE LINE,
 * hiding a real `useX(` call from this gate. A blinded gate reports clean.
 * If the candidate has no closing `/` on its own line it is not a regex, and
 * the comment branches get their turn (the conservative bail).
 */
const REGEX_PRECEDING_PUNCT = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*',
  '%', '~', '^', '<', '>',
]);
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do',
  'else', 'case', 'yield', 'await', 'throw',
]);

function isRegexPosition(source, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(source[j])) j -= 1;
  if (j < 0) return true;
  const p = source[j];
  if (REGEX_PRECEDING_PUNCT.has(p)) return true;
  if (/[A-Za-z0-9_$]/.test(p)) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(source[k])) k -= 1;
    return REGEX_PRECEDING_KEYWORDS.has(source.slice(k + 1, j + 1));
  }
  return false;
}

function regexEnd(source, i) {
  let j = i + 1;
  let inClass = false;
  while (j < source.length) {
    const c = source[j];
    if (c === '\n') return -1;
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return j;
    j += 1;
  }
  return -1;
}

/**
 * Blank comments while preserving line count, so any future line reporting
 * stays honest. Local replica of code-only.ts's stripComments (TS/JS branch
 * only — no SQL here).
 */
function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  let inBlock = false;
  let inLine = false;
  let quote = null;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        out += '  ';
        i += 2;
        continue;
      }
      out += c === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += '\n';
        i += 1;
        continue;
      }
      out += ' ';
      i += 1;
      continue;
    }
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && next !== '*' && next !== '/' && isRegexPosition(source, i)) {
      const end = regexEnd(source, i);
      if (end >= 0) {
        let j = end + 1;
        while (j < n && /[a-z]/.test(source[j])) j += 1;
        out += source.slice(i, j);
        i = j;
        continue;
      }
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      out += '  ';
      i += 2;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      out += '  ';
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * True when the stripped code contains a hook CALL.
 * `typeof useX` references are blanked first: they are type positions, and
 * `typeof useSharedValue<number>` would otherwise read as a generic call —
 * exactly the false green that let a 401-line pure-type file keep its
 * `use-` name through the original census.
 */
function callsAHook(code) {
  const withoutTypeRefs = code.replace(
    /\btypeof\s+use[A-Z][A-Za-z0-9_]*/g,
    'TYPEOF_HOOK_REF',
  );
  return /\buse[A-Z][A-Za-z0-9_]*\s*[(<]/.test(withoutTypeRefs);
}

/**
 * ORPHAN CHECK (F4100/D83, added 2026-08-06).
 *
 * THE SECOND INCIDENT. `use-search-root-foreground-effects-runtime-args.ts`
 * sat in this directory with ZERO importers — its only repo-wide mentions were
 * three superseded plans/ docs and its own coverage row. It survived the D45
 * repacker collapse and the D70 rename sweep because both keyed on files that
 * DO have importers, and it survived knip because knip does not glob
 * per-workspace (F63/D63). The hook-name check above could not see it either:
 * that gate asks whether a name is HONEST, never whether the file is REACHED.
 * Those are different questions, and only one of them was being asked.
 *
 * WHAT THIS PROVES. Every `use-*.ts`/`use-*.tsx` in runtime/shared is named by
 * at least one module specifier somewhere in apps/mobile/src (excluding its own
 * file). Dynamic forms count — `import('...')`, `require('...')`,
 * `jest.mock('...')` — because a module reached only at runtime or only by a
 * spec is still reached; D83 records a file legitimately banked by a spec's
 * require(), and a gate that missed that would demand a live file's deletion.
 *
 * THE STATED BIAS: this matches on the specifier's LAST PATH SEGMENT, not on a
 * resolved path. Two files with the same stem in different directories credit
 * each other. That over-credits, which is the SAFE direction for a deletion
 * gate: it can fail to report an orphan, but it cannot accuse a live file. A
 * gate whose failure mode is "delete this file" must never be the loose one.
 */
const MOBILE_SRC = join(REPO_ROOT, 'apps/mobile/src');

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

/**
 * Every quoted string in the stripped code that could be a module specifier:
 * it must look like a path (relative, or containing a `/`), which keeps plain
 * words and copy strings out. Template literals are read as raw text — a
 * `${}` inside one simply will not match a stem, and that is the over-credit
 * direction again.
 */
function referencedModuleStems(code) {
  const stems = new Set();
  for (const match of code.matchAll(/['"`]([^'"`\n]*\/[^'"`\n/]+|\.[^'"`\n/]+)['"`]/g)) {
    const specifier = match[1];
    const segment = specifier.slice(specifier.lastIndexOf('/') + 1);
    stems.add(segment.replace(/\.(ts|tsx|js|jsx)$/, ''));
  }
  return stems;
}

// Missing tooling is a FAILURE, never a pass.
if (!existsSync(SHARED_DIR)) {
  console.error(
    `FAIL: ${SHARED_DIR} does not exist. This gate measures nothing until ` +
      `the directory resolves — if the layer moved, move this gate with it.`,
  );
  process.exit(1);
}

const files = readdirSync(SHARED_DIR)
  .filter((f) => /^use-.*\.tsx?$/.test(f))
  .filter((f) => !/\.spec\.tsx?$/.test(f))
  .sort();

if (files.length === 0) {
  console.error(
    'FAIL: zero use-* files scanned in runtime/shared. Either the naming ' +
      'convention changed (retire or retarget this gate deliberately) or the ' +
      'glob rotted — a scan of nothing is a silent green.',
  );
  process.exit(1);
}

const liars = files.filter(
  (f) => !callsAHook(stripComments(readFileSync(join(SHARED_DIR, f), 'utf8'))),
);

if (liars.length) {
  console.error(
    `search-runtime-hook-names FAILED — ${liars.length} use-* file(s) in ` +
      `runtime/shared call no hook:\n` +
      liars.map((f) => `  - ${f}`).join('\n') +
      '\nA use- prefix is a Rules-of-Hooks claim. Either call a hook or ' +
      'rename: pure type files drop the prefix; plain functions become ' +
      'derive-*/select-* (see D70).',
  );
  process.exit(1);
}
// Missing tooling is a FAILURE, never a pass — same rule as SHARED_DIR above.
if (!existsSync(MOBILE_SRC)) {
  console.error(
    `FAIL: ${MOBILE_SRC} does not exist, so the orphan check would credit ` +
      `NOTHING and report every file as an orphan. Retarget it deliberately.`,
  );
  process.exit(1);
}

const importerFiles = collectSourceFiles(MOBILE_SRC);
if (importerFiles.length === 0) {
  console.error(
    'FAIL: zero importer files scanned under apps/mobile/src. An orphan ' +
      'check over an empty corpus reports every file as an orphan; an empty ' +
      'corpus is a broken scan, not a finding.',
  );
  process.exit(1);
}

const referencedStems = new Set();
for (const abs of importerFiles) {
  // A file cannot keep ITSELF alive: skip the subject's own source when
  // collecting, or a self-referential path string would credit it.
  const isSubject = abs.startsWith(SHARED_DIR) && /[\\/]use-[^\\/]*\.tsx?$/.test(abs);
  const stems = referencedModuleStems(stripComments(readFileSync(abs, 'utf8')));
  if (isSubject) stems.delete(abs.slice(abs.lastIndexOf('/') + 1).replace(/\.tsx?$/, ''));
  for (const stem of stems) referencedStems.add(stem);
}

const orphans = files.filter((f) => !referencedStems.has(f.replace(/\.tsx?$/, '')));

if (orphans.length) {
  console.error(
    `search-runtime-hook-names FAILED — ${orphans.length} use-* file(s) in ` +
      `runtime/shared are named by NO module specifier anywhere in ` +
      `apps/mobile/src:\n` +
      orphans.map((f) => `  - ${f}`).join('\n') +
      '\nAn unreferenced module in a leaf directory is deletable by ' +
      'definition (F4100). Delete it, or — if it is genuinely reached by a ' +
      'path this check cannot see — say so at the call site, because nothing ' +
      'else in the guard set asks whether this layer is reachable at all.',
  );
  process.exit(1);
}

console.log(
  `search-runtime-hook-names OK — ${files.length} use-* file(s) in ` +
    `runtime/shared each call a hook, and each is referenced by at least one ` +
    `of the ${importerFiles.length} source files under apps/mobile/src.`,
);
