import { Prisma } from '@prisma/client';
import {
  redirectJoinSql,
  resolvedSubjectSql,
  subjectMatchesSql,
} from './subject-identity';

/**
 * THE BUILDER'S OWN BEHAVIOUR.
 *
 * WHAT LEFT THIS FILE. Three tests walked the source tree and regexed it for
 * hand-rolled `COALESCE(r.to_entity_id, ...)` and `LEFT JOIN entity_redirects`
 * — the form that lived at FOURTEEN sites in one reader, which is how three SQL
 * dialects coexisted under one vocabulary. Those are import/pattern boundaries
 * and they are ESLint selectors now (see eslint.config.mjs): same detection,
 * but it fires in the editor, it sees files a directory walk did not enumerate,
 * and its allowlist sits beside every other boundary rather than in a spec.
 *
 * What remains is what a lint rule cannot say: that the builder's OUTPUT is
 * correct, that its two halves cannot be taken apart, and that it refuses an
 * alias it cannot safely interpolate.
 */

function textOf(sql: Prisma.Sql): string {
  return sql.strings.join('?');
}

describe('subject-identity builder', () => {
  it('a caller cannot take the join and skip the fold-back — they share one alias argument', () => {
    expect(textOf(redirectJoinSql('a'))).toBe(
      'LEFT JOIN entity_redirects r ON r.from_entity_id = a.subject_id',
    );
    expect(textOf(resolvedSubjectSql('a'))).toBe(
      'COALESCE(r.to_entity_id, a.subject_id)',
    );
  });

  it('supports the two-subject case (a food and its serving restaurant) without a second dialect', () => {
    expect(textOf(redirectJoinSql('a', 'rr', 'ctx_restaurant_id'))).toBe(
      'LEFT JOIN entity_redirects rr ON rr.from_entity_id = a.ctx_restaurant_id',
    );
    expect(textOf(resolvedSubjectSql('a', 'rr', 'ctx_restaurant_id'))).toBe(
      'COALESCE(rr.to_entity_id, a.ctx_restaurant_id)',
    );
  });

  it('the predicate form matches merged-away ids, which is the whole point', () => {
    const sql = subjectMatchesSql('s', Prisma.sql`${'abc'}::uuid`);
    expect(textOf(sql)).toContain('COALESCE(r.to_entity_id, s.subject_id)');
  });

  it('refuses an alias that is not an identifier', () => {
    expect(() => redirectJoinSql('a; DROP TABLE signals')).toThrow(
      /Invalid SQL alias/,
    );
    expect(() => resolvedSubjectSql('a', 'r', 'x)--')).toThrow(
      /Invalid SQL alias/,
    );
  });
});
