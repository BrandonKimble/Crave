// @script-class: library
// @run-by: imported by check-search-runtime-hook-names.mjs + the comment-matching gates; runs whenever they do.
/**
 * "THE SOURCE AS THE COMPILER SEES IT" — the ONE home for scripts/ (D85's
 * replica rule, applied, 2026-08-07).
 *
 * LINEAGE, stated because this is a replica and a replica is a debt. The
 * original is `apps/api/src/shared/testing/code-only.ts`, which F3911 made
 * the single home for that idea INSIDE the api workspace. scripts/ cannot
 * import it — a repo-root gate must not reach across a workspace boundary
 * into apps/api's TS toolchain — so `check-search-runtime-hook-names.mjs`
 * carried a hand-ported copy, complete with the F3910 regex-literal repair.
 * F5851 needed the same stripper for a second gate. Rather than let the debt
 * compound to a third copy that could rot independently, the port lives here
 * once and both gates import it. TWO copies of the idea remain in the repo
 * (this and code-only.ts) and that is the floor the workspace boundary
 * allows; if the original changes, this changes with it.
 *
 * WHY EVERY SOURCE-SCANNING GATE NEEDS IT: 13 of the 19 historical guard
 * failures in this repo were source scanners defeated by a COMMENT. A gate
 * that reads raw source credits prose — and F5851's own trap is exactly that
 * (two dead style keys survived only inside comments describing their
 * history, so a grep answered "used" for both).
 */

/**
 * F3910. A `/` in EXPRESSION position opens a regex literal, and a regex
 * containing escaped slashes ends in `//` — which the line-comment branch
 * below would read as a comment and use to blank the REST OF THE LINE, hiding
 * real code from the caller. A blinded gate reports clean. If the candidate
 * has no closing `/` on its own line it is not a regex, and the comment
 * branches get their turn (the conservative bail).
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
 * Blank comments while preserving line count, so any line reporting a caller
 * does stays honest. TS/JS branch only — no SQL here.
 */
export function stripComments(source) {
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
