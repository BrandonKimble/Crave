import { Prisma } from '@prisma/client';

/**
 * THE LEDGER'S IDENTITY LAW, AS A BUILDER RATHER THAN A CONVENTION.
 *
 * §3: identity is a judgment. A merge writes an `entity_redirects` row; the
 * ledger is NEVER rekeyed (correct, and the reason merges are cheap). The
 * consequence is that "resolve subject_id through entity_redirects at read" is
 * load-bearing for CORRECTNESS — and until 2026-08-02 it was enforced nowhere.
 * It was hand-copied as a LEFT JOIN plus a one-hop COALESCE at fourteen sites
 * in signal-demand-read.service.ts alone, and one reader had already forgotten
 * it (`lastEntityViewAt` filtered `s.subject_id = $1` raw, so after a merge the
 * repeat-view dedupe valve stopped seeing the loser id's history). The blast
 * that time was small. The omission was the proof that nothing prevented the
 * next, larger one.
 *
 * The guard that existed was worse than none: a spec asserting
 * `expect(demandSql).toContain('entity_redirects')` passes for a reader that
 * joins the table and then ignores the COALESCE — which act-identity.ts's own
 * header already names as the failure mode that let three SQL dialects coexist
 * under one shared vocabulary.
 *
 * So this is a BUILDER, for the same reason `dailyActsCteSql` is one: a
 * half-adoptable helper is exactly what lets dialects diverge. A caller cannot
 * take the join and skip the fold-back, because the join and the fold-back are
 * emitted by the same pair of functions over the same alias, and the lockdown
 * spec (subject-identity-lockdown.spec.ts) fails on any hand-rolled copy.
 *
 * WHY NOT A VIEW: F202's stronger proposal was a `signals_resolved` view with
 * the raw column renamed, which would make the unresolved id unreachable
 * rather than merely unused. It was not adopted here because the sargable
 * app-side expansion (expandWithRedirectSources) is on the hot autocomplete
 * path and a planner hop through a view has to be MEASURED against it before
 * it can be trusted. This is the weaker-but-real fix that design named as its
 * own fallback. If the view is ever measured and wins, this file is what it
 * replaces.
 */

/** Aliases are code-supplied, never user data — validated so they cannot be. */
function assertAlias(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error(`Invalid SQL alias: ${alias}`);
  }
  return alias;
}

/**
 * The one-hop redirect join for a ledger row source (`signals s`,
 * `signal_demand_daily a`, or a CTE that carries `subject_id`).
 *
 * `redirectAlias` exists only because one query resolves TWO subjects (a food
 * and its serving restaurant) and needs two joins; it is not a knob.
 */
export function redirectJoinSql(
  subjectAlias: string,
  redirectAlias = 'r',
  subjectColumn = 'subject_id',
): Prisma.Sql {
  return Prisma.raw(
    `LEFT JOIN entity_redirects ${assertAlias(redirectAlias)} ` +
      `ON ${assertAlias(redirectAlias)}.from_entity_id = ` +
      `${assertAlias(subjectAlias)}.${assertAlias(subjectColumn)}`,
  );
}

/**
 * The resolved subject id: the merge survivor when one exists, else the raw
 * recorded id. ALWAYS paired with `redirectJoinSql` over the same aliases.
 */
export function resolvedSubjectSql(
  subjectAlias: string,
  redirectAlias = 'r',
  subjectColumn = 'subject_id',
): Prisma.Sql {
  return Prisma.raw(
    `COALESCE(${assertAlias(redirectAlias)}.to_entity_id, ` +
      `${assertAlias(subjectAlias)}.${assertAlias(subjectColumn)})`,
  );
}

/**
 * The predicate form: "this ledger row is about entity X", true for rows
 * recorded against X and for rows recorded against anything that has since
 * been merged INTO X. This is the shape `lastEntityViewAt` was missing.
 */
export function subjectMatchesSql(
  subjectAlias: string,
  entityIdSql: Prisma.Sql,
  redirectAlias = 'r',
  subjectColumn = 'subject_id',
): Prisma.Sql {
  return Prisma.sql`${resolvedSubjectSql(subjectAlias, redirectAlias, subjectColumn)} = ${entityIdSql}`;
}
