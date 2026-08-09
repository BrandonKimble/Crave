import { Prisma } from '@prisma/client';

/**
 * THE preview derivation (concept-graph §11 item 6). The builder used to carry
 * a hand-written `preview` string beside every Prisma.Sql clause — a second
 * source of truth that could drift from the query that actually ran (and, at
 * the top-level assembly, was only ever a sketch: literals like "...top dishes
 * subquery..."). The preview is now DERIVED from the executed Prisma.Sql, so
 * divergence is impossible by construction.
 *
 * HONEST CAVEAT: this inlines `sql.values` into the statement's placeholders
 * for DEBUG DISPLAY. The database still executes the parameterized statement —
 * nothing here is ever sent to Postgres, and this must never be used to build
 * a query. Values are rendered as SQL literals (quoted + escaped) so the
 * output is readable and, in practice, pasteable into psql; that is a
 * convenience, not a guarantee.
 *
 * Prisma renders positional parameters as `?` in `Sql#sql`, consumed in order.
 * A literal `?` inside a `Prisma.raw` fragment would shift the mapping; no
 * fragment in this module contains one.
 */
export function renderInlinedSql(sql: Prisma.Sql): string {
  const values = sql.values;
  let index = 0;
  return sql.sql.replace(/\?/g, () => formatSqlValue(values[index++]));
}

function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (Array.isArray(value)) {
    return `ARRAY[${value.map((entry) => formatSqlValue(entry)).join(', ')}]`;
  }
  if (value instanceof Date) {
    return quote(value.toISOString());
  }
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (typeof value === 'string') {
    return quote(value);
  }
  return quote(JSON.stringify(value));
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
