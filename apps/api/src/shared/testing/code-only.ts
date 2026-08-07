/**
 * SOURCE AS THE COMPILER SEES IT — the repo's ONE comment stripper.
 *
 * Every source-scanning guard in this repo asks "does this file DO X?" and
 * answers it by matching text. Raw text includes comments, and a comment is
 * where the opposite of the truth usually lives: the file that ships a raw
 * author row is exactly the file whose comment explains how carefully it
 * doesn't. `-- we deliberately do NOT join signal_emittable_terms here` is a
 * passing grade under a naive `/signal_emittable_terms/` test.
 *
 * That is the same failure as F2050 one level up. There, the author-identity
 * guard was satisfied by an unused IMPORT of the resolver it wanted called;
 * the fix required a call. But `publicAuthorIdentity(` in a comment would have
 * satisfied that too. Requiring a more specific string only narrows the set of
 * comments that can lie — it does not stop a comment from lying.
 *
 * So the guards match against code with comments removed. A prose mention can
 * no longer stand in for the behaviour it describes.
 *
 * WHY ONE STRIPPER (F3911, 2026-08-06). There used to be TWO — this file (red
 * team 2026-08-02: "over-stripping makes a guard STRICTER... the safe
 * direction") and `apps/api/scripts/scanner-source.ts` (F2080/F2081: "errs
 * toward KEEPING code... a false strip would silently blind a guard") — with
 * OPPOSITE documented biases, neither citing the other, disagreeing in practice
 * about `--` inside template literals. That is the hand-rolled-duplicate
 * pattern this exercise polices, inside the exercise's own tooling. There is
 * now one implementation, here; `scanner-source.ts` re-exports it.
 *
 * THE BIAS, decided once. A false KEEP re-admits the naive prose behaviour for
 * one construct; a false STRIP silently blinds a guard, and a blinded guard
 * reports clean. So the strip is conservative: when the lexer cannot tell what
 * it is looking at, it KEEPS the text. Concretely:
 *
 *   - Comment markers inside string literals survive (`'not // a comment'`).
 *   - A `/` in expression position is scanned as a REGEX LITERAL, so
 *     `/^https?:\/\//` no longer trips the `//` branch and blanks the rest of
 *     its line (F3910: that false strip made a real call on the same line
 *     invisible to the guard — the exact failure the old header promised could
 *     not happen). If a candidate regex has no closing `/` on its own line, it
 *     is NOT a regex and the `//` / `/*` branches get their turn.
 *   - Character classes are tracked, so a quote inside `/['x]/` no longer opens
 *     a phantom string that suppresses comment stripping for the rest of the
 *     file (the second half of F3910).
 *
 * The one place over-stripping is accepted is the one place it is provably
 * safe: a SQL `--` comment INSIDE a template literal (this repo writes SQL in
 * `Prisma.sql` templates, and a `--` there is a comment, not a decrement). Even
 * there the blank stops at `${`, so an interpolated expression — real code — is
 * never eaten.
 *
 * WHAT THIS IS NOT. A lexical strip, not a parser. It handles `//`, block
 * comments, and SQL `--` (in .sql files, and inside template literals). There
 * is no `#` handling — an earlier header claimed some; nothing implemented it,
 * and neither TypeScript nor Postgres needs it, so the claim is deleted rather
 * than fabricated (F3910).
 */

/** A file whose ENTIRE body is SQL, where `--` is always a comment. */
const SQL_LIKE = /\.sql$/i;

/** `/` after one of these is a regex literal, never division. */
const REGEX_PRECEDING_PUNCT = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '~',
  '^',
  '<',
  '>',
  '\n',
]);

/** ...and after one of these words, likewise. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'do',
  'else',
  'case',
  'yield',
  'await',
  'throw',
]);

/**
 * Is the `/` at `i` the start of a regex literal rather than a division or a
 * comment marker? Looks back past whitespace at the last significant token.
 */
function isRegexPosition(source: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(source[j])) j -= 1;
  if (j < 0) return true; // start of file: nothing to divide
  const p = source[j];
  if (REGEX_PRECEDING_PUNCT.has(p)) return true;
  if (/[A-Za-z0-9_$]/.test(p)) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(source[k])) k -= 1;
    return REGEX_PRECEDING_KEYWORDS.has(source.slice(k + 1, j + 1));
  }
  return false; // `)`, `]`, a quote: an operand, so `/` divides it
}

/**
 * Index of the regex literal's closing `/` starting at `i`, or -1 if there
 * isn't one on this line. -1 is the CONSERVATIVE bail: a `/` that opens
 * nothing is handled by the comment branches instead.
 */
function regexEnd(source: string, i: number): number {
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
 * Return `source` with comment text blanked out, preserving line count and
 * offsets so any line numbers a caller reports still line up with the file.
 */
export function stripComments(source: string, filePath = ''): string {
  const isSql = SQL_LIKE.test(filePath);
  let out = '';
  let i = 0;
  const n = source.length;
  let inBlock = false;
  let inLine = false;
  let quote: string | null = null;
  /**
   * Template-literal nesting. Each `true` is a template we are directly
   * inside; a `${` pushes a brace counter and puts us back in code.
   */
  const templates: number[] = [];
  const inTemplate = (): boolean =>
    templates.length > 0 && templates[templates.length - 1] === -1;

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
      // A template `--` comment ends at the newline OR at an interpolation:
      // `${...}` is real code and must never be blanked.
      if (c === '\n' || (c === '$' && next === '{' && inTemplate())) {
        inLine = false;
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

    if (inTemplate()) {
      if (c === '\\') {
        out += c + (next ?? '');
        i += 2;
        continue;
      }
      if (c === '`') {
        templates.pop();
        out += c;
        i += 1;
        continue;
      }
      if (c === '$' && next === '{') {
        templates.push(0);
        out += '${';
        i += 2;
        continue;
      }
      // The one accepted over-strip: SQL comments in embedded SQL.
      if (c === '-' && next === '-') {
        inLine = true;
        out += '  ';
        i += 2;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    if (c === '`') {
      templates.push(-1);
      out += c;
      i += 1;
      continue;
    }
    if (templates.length > 0) {
      // Inside a `${...}` interpolation: track braces so the closing one
      // returns us to the template rather than reading as an object literal.
      if (c === '{') templates[templates.length - 1] += 1;
      else if (c === '}') {
        if (templates[templates.length - 1] === 0) {
          templates.pop();
          out += c;
          i += 1;
          continue;
        }
        templates[templates.length - 1] -= 1;
      }
    }

    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }

    // `next` may not open a regex: `/*` and `//` are comment markers, and a
    // regex scan would happily read `/* c */` as a literal ending at the `*/`,
    // keeping the comment — a false KEEP that re-admits the prose false-pass.
    if (
      c === '/' &&
      !isSql &&
      next !== '*' &&
      next !== '/' &&
      isRegexPosition(source, i)
    ) {
      const end = regexEnd(source, i);
      if (end >= 0) {
        // Copy the literal (and its flags) verbatim — it is code.
        let j = end + 1;
        while (j < n && /[a-z]/.test(source[j])) j += 1;
        out += source.slice(i, j);
        i = j;
        continue;
      }
      // No terminator on this line: not a regex. Fall through.
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
    if (isSql && c === '-' && next === '-') {
      inLine = true;
      out += '  ';
      i += 2;
      continue;
    }
    // A `--` in TypeScript OUTSIDE a template literal is a decrement. The
    // embedded-SQL case is handled by the template branch above.

    out += c;
    i += 1;
    continue;
  }

  return out;
}

/**
 * Match `pattern` against a file's CODE, ignoring anything a comment claims.
 * The scanners' one entry point, so a new guard cannot accidentally go back to
 * matching prose.
 */
export function codeMatches(
  pattern: RegExp,
  source: string,
  filePath = '',
): boolean {
  return pattern.test(stripComments(source, filePath));
}

/**
 * The spec-side name for the same thing. Kept because five specs import it;
 * it is `stripComments` with no path, which is what those call sites meant.
 */
export function codeOnly(source: string): string {
  return stripComments(source);
}
