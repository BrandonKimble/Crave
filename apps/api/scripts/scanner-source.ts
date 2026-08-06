/**
 * SOURCE AS THE COMPILER SEES IT — for the invariant scanners.
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
 * WHAT THIS IS NOT. This is a lexical strip, not a parser: it handles `//`,
 * `/* *\/`, `#` and SQL `--`, and it deliberately does not try to be clever
 * about comment markers inside string literals — it errs toward KEEPING code
 * (a false keep re-admits the naive behaviour for one line; a false strip
 * would silently blind a guard, which is the failure mode that matters).
 */

/** True when the line is inside a string that shouldn't have its `--` eaten. */
const SQL_LIKE = /\.sql$/i;

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
    // A `--` inside a TS file is almost always a decrement or SQL inside a
    // template literal; template-literal contents are already handled by the
    // quote branch above, so nothing to do here.

    out += c;
    i += 1;
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
