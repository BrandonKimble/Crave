import { codeMatches, stripComments } from './scanner-source';

/**
 * F2051 — the source-scanning guards matched prose.
 *
 * A guard that asks "does this file call X?" by matching raw text is satisfied
 * by a comment saying it does — and the file that ships the raw row is exactly
 * the file whose comment explains how carefully it doesn't. These specs pin the
 * two properties the guards depend on: prose cannot satisfy a match, and real
 * code is never blinded by the strip.
 */
describe('stripComments', () => {
  it('blanks a line comment so its text cannot satisfy a guard', () => {
    const src = `// we map through publicAuthorIdentity(row) here\nconst x = 1;\n`;

    expect(codeMatches(/publicAuthorIdentity\s*\(/, src, 'a.ts')).toBe(false);
    expect(stripComments(src, 'a.ts')).toContain('const x = 1;');
  });

  it('blanks a block comment, including a multi-line one', () => {
    const src = `/*\n * joins signal_emittable_terms for the floor\n */\nconst y = 2;\n`;

    expect(codeMatches(/signal_emittable_terms/, src, 'a.ts')).toBe(false);
    expect(stripComments(src, 'a.ts')).toContain('const y = 2;');
  });

  it('still sees the real call — the guard is not blinded', () => {
    const src = `// nothing to see\nconst out = publicAuthorIdentity(row);\n`;

    expect(codeMatches(/publicAuthorIdentity\s*\(/, src, 'a.ts')).toBe(true);
  });

  it('preserves line count and offsets so reported line numbers stay true', () => {
    const src = `const a = 1;\n// a comment\n/* block\n   spans */\nconst b = 2;\n`;
    const stripped = stripComments(src, 'a.ts');

    expect(stripped.split('\n').length).toBe(src.split('\n').length);
    expect(stripped.length).toBe(src.length);
    expect(stripped.split('\n')[4]).toBe('const b = 2;');
  });

  it('eats SQL -- comments in .sql files', () => {
    const src = `-- we deliberately do NOT join signal_emittable_terms\nSELECT 1;\n`;

    expect(codeMatches(/signal_emittable_terms/, src, 'q.sql')).toBe(false);
    expect(stripComments(src, 'q.sql')).toContain('SELECT 1;');
  });

  it('keeps SQL inside a template literal, comment markers and all', () => {
    // Prisma.sql templates are how this repo writes queries; the join lives
    // inside a string, and a strip that ate string contents would blind the
    // subject-text floor guard entirely.
    const src =
      'const q = Prisma.sql`SELECT * FROM s JOIN signal_emittable_terms e ON e.term = s.subject_text`;\n';

    expect(codeMatches(/signal_emittable_terms/, src, 'a.ts')).toBe(true);
  });

  it('does not treat a decrement or a URL as a comment', () => {
    const src = `let n = 5;\nn--;\nconst u = 'https://example.com/x';\n`;
    const stripped = stripComments(src, 'a.ts');

    expect(stripped).toContain('n--;');
    expect(stripped).toContain('https://example.com/x');
  });

  it('errs toward KEEPING code: a comment marker inside a string survives', () => {
    // The documented trade-off. A false keep re-admits the naive behaviour for
    // one line; a false strip would silently blind a guard, which is the
    // failure mode that actually matters.
    const src = `const s = 'not // a comment';\n`;

    expect(stripComments(src, 'a.ts')).toContain('not // a comment');
  });

  /**
   * F3910 — THE FALSE STRIP THE OLD HEADER PROMISED COULD NOT HAPPEN.
   *
   * A regex literal containing an escaped-slash pair ends in `//`. Without a
   * regex-literal state that tripped the line-comment branch and blanked the
   * REST OF THE LINE, so a real call sharing that line was invisible to the
   * guard — a blinded guard reports clean, which is the one failure mode that
   * matters. Revert to the naive strip and this goes RED.
   */
  it('a regex literal with escaped slashes does not blind the rest of the line', () => {
    const src = `const isUrl = /^https?:\\/\\//.test(s); publicAuthorIdentity(row);\n`;

    expect(codeMatches(/publicAuthorIdentity\s*\(/, src, 'a.ts')).toBe(true);
    expect(stripComments(src, 'a.ts')).toContain('publicAuthorIdentity(row);');
  });

  it('a quote inside a regex character class does not open a phantom string', () => {
    // The second half of F3910: `/['x]/` used to open a string that was never
    // closed, after which comments stopped being stripped — re-admitting the
    // prose false-pass for the whole rest of the file.
    const src = `const q = /['x]/;\n// we map through publicAuthorIdentity(row) here\n`;

    expect(codeMatches(/publicAuthorIdentity\s*\(/, src, 'a.ts')).toBe(false);
  });

  it('a division is still a division — the regex heuristic does not eat code', () => {
    const src = `const half = total / 2; publicAuthorIdentity(row);\n`;

    expect(codeMatches(/publicAuthorIdentity\s*\(/, src, 'a.ts')).toBe(true);
    expect(stripComments(src, 'a.ts')).toContain('total / 2');
  });

  it('a block comment after a semicolon is still stripped, not read as a regex', () => {
    const src = `const a = 1; /* joins signal_emittable_terms */\n`;

    expect(codeMatches(/signal_emittable_terms/, src, 'a.ts')).toBe(false);
  });

  /**
   * F3911 — the unified bias, stated as a spec rather than as two headers that
   * disagreed. Inside a template literal a `--` is a SQL comment (this repo
   * writes SQL in `Prisma.sql`), so it is stripped; but the blank STOPS at an
   * interpolation, because `${...}` is real code and eating it would be the
   * false strip all over again.
   */
  it('strips a SQL comment inside a template literal but never an interpolation', () => {
    const src =
      'const q = Prisma.sql`SELECT 1 -- we do NOT join signal_emittable_terms\n' +
      '  AND id = ${publicAuthorIdentity(row)}`;\n';
    const stripped = stripComments(src, 'a.ts');

    expect(codeMatches(/signal_emittable_terms/, src, 'a.ts')).toBe(false);
    expect(stripped).toContain('${publicAuthorIdentity(row)}');
    expect(stripped.length).toBe(src.length);
  });
});
