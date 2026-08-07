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
console.log(
  `search-runtime-hook-names OK — ${files.length} use-* file(s) in ` +
    `runtime/shared each call a hook.`,
);
