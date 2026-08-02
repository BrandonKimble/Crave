import { Prisma } from '@prisma/client';

/**
 * THE naive-UTC coercion — for `signals.occurred_at`, and nothing else.
 *
 * WHY THIS STILL EXISTS WHEN THE REST WAS DELETED (2026-08-02).
 *
 * Every other timestamp column in this database is now `timestamptz`, so a
 * bound JS Date compares correctly under any session timezone and no helper is
 * needed anywhere. The migration that did that could not touch ONE column:
 * `signals.occurred_at` is the RANGE partition key, and Postgres refuses —
 * "cannot alter column ... because it is part of the partition key".
 *
 * So this is not a leftover or a deferral. It is the exact residue of a
 * structural constraint, scoped to the one place the constraint applies. The
 * shared helper and the source scanner that policed 162 columns are gone; what
 * remains is one function for one column, in the module that owns it.
 *
 * If `signals` is ever rebuilt (a new partitioned table keyed on a timestamptz
 * column, copy, swap), delete this file with it.
 */
export function utcInstantSql(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant} AT TIME ZONE 'UTC')`;
}
