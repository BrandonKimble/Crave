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
});
