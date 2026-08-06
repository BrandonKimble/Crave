import { Prisma } from '@prisma/client';

/**
 * THE K-ANONYMITY FLOOR FOR FREE TEXT.
 *
 * The floor itself is NOT here. It is the database view
 * `signal_emittable_terms` (see its migration). This module is the TypeScript
 * doorway to it, plus the statement of the rule.
 *
 * WHAT IS ACTUALLY AT RISK. `signals.subject_text` is a person's typed words.
 * Measured 2026-08-03 on the local corpus: of 30 distinct search subjects, 26
 * had exactly ONE distinct actor behind them. So a read that returns a term is,
 * most of the time, returning one identifiable person's search to somebody
 * else.
 *
 * WHAT IS NOT AT RISK, and why this is a COLUMN-level rule rather than a
 * table-level one:
 *
 *  - The ACT is not at risk. Counts, places, kinds and subject ids carry no
 *    words. They are the ranking substrate and they stay where they are.
 *  - The ACTOR is not at risk. `signal_demand_daily.actor_id` is a pseudonym in
 *    `signal_actors`; account deletion SEVERS `signal_actors.user_id`, so the
 *    ledger keeps anonymous evidence and loses the person. That is the declared
 *    disposition (person-data-class), not an assumption made here.
 *  - A person's OWN text is not at risk from that person. Own-actor-scoped
 *    reads (`personalQueryRows`, `personalQueryCounts`, `recentSearches`, the
 *    cache-reveal replay in search.service) MUST NOT apply the floor — it would
 *    hide someone's own history from themselves.
 *
 * THE THREE SHAPES THIS WENT THROUGH, because the discarded ones are the
 * argument for the current one:
 *
 *  1. A PER-READER OPINION. One service held `minGlobalDistinctUsers = 3`;
 *     three other readers that emit text held nothing. A rule enforced by one
 *     of its four subjects is not a rule.
 *  2. A PARALLEL ANONYMOUS TABLE, with the actor grouped away. Fatal, not
 *     strong: demand mass is DEFINED per actor (Σ over actors of log2(1+acts)),
 *     so a table with no actor column cannot compute it — only store a number
 *     baked at promotion time, silently freezing the recency kernel, kind
 *     weights, echo exclusion, place lineage and window. It disagreed with
 *     demand-mass.reader on every one of those axes with nothing failing. An
 *     entire second copy of the ledger, to police one column.
 *  3. A SHARED SQL FRAGMENT each reader applied. Better, and still wrong: it
 *     binds only callers who remember to import it. `warm-query-embedding-cache`
 *     read the raw column and shipped the terms to a third-party embedding API;
 *     the guard could not see it, because the guard was counting call sites in
 *     one file rather than stating the invariant.
 *
 * So the floor is a database object, and the rule is enforced repo-wide by the
 * `signals.subject-text-emission` invariant rather than by anyone's memory.
 *
 * THE VALUE is a privacy commitment, not a derivation — deriving it from usage
 * would let popularity redefine the protection. 3 is the number this codebase
 * already published and shipped, so adopting it makes the shared rule at least
 * as strict as the strictest reader that had a private opinion.
 *
 * NOTE ON A NEIGHBOURING NUMBER: `keyword-slice-selection`'s
 * EXPLORE_DISTINCT_ACTOR_FLOOR (2) is NOT a competing privacy floor — it is a
 * candidacy gate on already-emitted rows. Unrelated concerns, one shared word.
 */

/**
 * Mirror of the floor baked into the view. The VIEW is the authority; this
 * exists so tests and docs can name the number. They are asserted equal
 * against `pg_get_viewdef` — a drift between them is a test failure, not a
 * silent disagreement.
 */
export const SUBJECT_TEXT_K_FLOOR = 3;

/** The view that IS the floor. */
export const EMITTABLE_TERMS_VIEW = 'signal_emittable_terms';

/**
 * Join fragment restricting a query to terms that may be spoken.
 *
 * `termExpr` is the query's own subject-text expression at that point
 * (`a.subject_text`, `s.subject_text`, `term`, …). An INNER JOIN, so an
 * ineligible term never leaves Postgres: a caller cannot leak one by
 * forgetting to filter, and a LIMIT applies to eligible rows only.
 */
export function emittableTermsJoinSql(termExpr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`JOIN signal_emittable_terms _emit ON _emit.term = ${termExpr}`;
}
