/**
 * THE LOCALE READ DOOR — the three scopes an `entity_surface` read may have,
 * and the only place any of them is spelled.
 *
 * The WRITE side has had one door for a while: `addSurfaces` is the sole
 * writer, so a form cannot land unfolded, untagged, or role-less. The READ
 * side had no such door, and the cost was not theoretical — every reader
 * hand-wrote its own predicate, and the hand-written ones disagreed:
 *
 *   - nine sites hard-coded `locale = 'und'` on what is an IDENTITY probe
 *     ("is this the same thing?"), which silently made identity
 *     locale-scoped. 1,055 entities in the live corpus own a recall surface
 *     that names an existing twin, and every one of them was invisible to
 *     those nine reads because the surface was banked `es`/`vi` rather than
 *     `und`.
 *   - `entity-display` matched label rows with `startsWith(primarySubtag)`
 *     plus a second RFC-4647 Lookup over whatever locales came back. That is
 *     a THIRD locale semantics, and its prefix band can never contain `und`
 *     — so a universal label row was unreachable from every request.
 *
 * The three scopes below are the whole taxonomy. Which one a read wants is
 * decided by the QUESTION it is asking, never by convenience:
 *
 *   identityScope  — "are these two rows the same thing?"  LOCALE-BLIND.
 *   recallScope    — "may this document/query ground through this form?"
 *   displayScope   — "what text do we render to this reader?"
 *
 * COMPOSE THE SQL FORMS WITH `Prisma.sql`, never a bare `$queryRaw` tagged
 * template: `$queryRaw`'s own template turns every interpolation into a BIND
 * PARAMETER, so a fragment would arrive as a parameter object instead of a
 * predicate. Use `prisma.$queryRaw(Prisma.sql`...`)` — the function form.
 */
import { Prisma } from '@prisma/client';
import { localeLookupChain } from './accept-language';

/**
 * IDENTITY IS LOCALE-BLIND. THIS SCOPE CARRIES NO LOCALE PREDICATE, BY LAW.
 *
 * An identity probe asks whether two rows denote the SAME THING — a
 * dedupe/twin question, answered on the canonical fold (`form_folded` against
 * another entity's `identity_key`, or against a caller's `canonicalFold(name)`).
 * The answer cannot depend on which language someone happened to have been
 * speaking when the form was banked. "Limonada" and "lemonade" are one
 * concept whether the row that says so is tagged `es` or `und`; a
 * `locale = 'und'` filter here does not scope the question, it CORRUPTS it —
 * it makes "same thing" mean "same thing, and also nobody could tell what
 * language it was in," which is not a property of the thing at all.
 *
 * The failure is silent and expensive in both directions. A resolution probe
 * that misses its twin MINTS A DUPLICATE ENTITY (metro-adoption's own comment
 * says "resolve locally must mean resolve, not mint"); a search probe that
 * misses its twin just returns less than it knows.
 *
 * `status = 'active'` stays — a `candidate` form is banked but unjudged and a
 * `deprecated` form is REMEMBERED AS WRONG (R5-6b); neither may assert
 * identity. `role <> 'display'` stays too: a display row makes no recall
 * claim (it is a label, or a claim the collision guard REFUSED), so letting
 * it assert identity would resurrect exactly the claim that lost. That test
 * used to be safe to omit here by data coincidence; it no longer is — the
 * `und` slice now holds 23 `both` rows and one `display` row.
 */
export function identityScope(alias = 's'): Prisma.Sql {
  const table = Prisma.raw(alias);
  return Prisma.sql`${table}.status = 'active'
     AND ${table}.role <> 'display'`;
}

/**
 * THE RECALL SLICE — "may a document or query in THIS language ground through
 * this form?"
 *
 * Unlike identity, recall genuinely is locale-scoped: grounding an `es`
 * document through a Vietnamese word list is the F2 bug the gazetteer removed
 * its legacy-array arm to fix. The chain is the opposite of matching
 * everything at once — it is a CLOSED SET the request names:
 *   `es` → ['es','und'] · `es-MX` → ['es-mx','es-419','es','und'] · null → ['und']
 *
 * A caller with no locale passes null and gets `['und']`, byte-identical to
 * the und-only predicate this replaced — which is why every locale-less
 * caller is unchanged by adopting the door.
 *
 * LOWER() on the stored side, because the chain is lowercased by construction
 * while `normalizeLocaleTag` preserves canonical region casing (`es-MX`).
 */
export function recallScope(
  locale: string | null | undefined,
  alias = 's',
): Prisma.Sql {
  const table = Prisma.raw(alias);
  return Prisma.sql`${table}.status = 'active'
     AND LOWER(${table}.locale) = ANY(${localeLookupChain(locale ?? null)}::text[])
     AND ${table}.role <> 'display'`;
}

/**
 * THE DISPLAY SLICE — "what text do we render to this reader?"
 *
 * The mirror of `recallScope` across the role axis: `role <> 'recall'`,
 * because a `recall` row is a corpus surface nobody should ever be SHOWN
 * ("ctm" for tikka masala), while `display` and `both` rows are renderable.
 *
 * It reads through the SAME chain as recall, and that is the fix: the prefix
 * band this replaced (`locale LIKE 'es%'`) could not contain `und`, so a
 * label banked as universal — the honest tag for a form nobody can assign a
 * language to — was unreachable from every request that existed. Every chain
 * ends in `und` precisely so the universal answer is always the last resort
 * rather than no answer.
 */
export function displayScope(
  locale: string | null | undefined,
  alias = 's',
): Prisma.Sql {
  const table = Prisma.raw(alias);
  return Prisma.sql`${table}.status = 'active'
     AND LOWER(${table}.locale) = ANY(${localeLookupChain(locale ?? null)}::text[])
     AND ${table}.role <> 'recall'`;
}

/**
 * The same three scopes as PRISMA WHERE FRAGMENTS, for the reads that are
 * `findMany`/`findFirst` rather than raw SQL. Same semantics, same chain, one
 * definition each — a second hand-rolled Prisma spelling would be exactly the
 * drift this module exists to end.
 *
 * `locale` is compared against the chain via `in`, which Prisma emits as
 * `IN (...)`. Stored tags are language-only by write law (`bankableLanguageTag`)
 * and the chain is lowercase, so the comparison is exact rather than
 * case-folded here; `mode: 'insensitive'` is set so a legacy regional row
 * (`es-MX`) still matches the `es-mx` chain entry the SQL forms LOWER() into.
 */
export function identityScopeWhere(): Prisma.EntitySurfaceWhereInput {
  return { status: 'active', role: { not: 'display' } };
}

export function recallScopeWhere(
  locale: string | null | undefined,
): Prisma.EntitySurfaceWhereInput {
  return {
    status: 'active',
    role: { not: 'display' },
    locale: { in: localeLookupChain(locale ?? null), mode: 'insensitive' },
  };
}

export function displayScopeWhere(
  locale: string | null | undefined,
): Prisma.EntitySurfaceWhereInput {
  return {
    status: 'active',
    role: { not: 'recall' },
    locale: { in: localeLookupChain(locale ?? null), mode: 'insensitive' },
  };
}

/**
 * HOW SPECIFIC A ROW'S LOCALE IS FOR THIS REQUEST — the chain's own index,
 * which is its preference order (most specific first, `und` last).
 *
 * This is what replaces the second RFC-4647 Lookup `entity-display` used to
 * run over "whatever locales came back". Lookup-over-the-result-set and the
 * chain agree on every case the old code handled, but the chain also ORDERS
 * `und` — it ranks last, behind every real language match, which is exactly
 * what "universal is the last resort" means. A row whose locale is off-chain
 * cannot appear (the scope filtered it out); it ranks last defensively rather
 * than winning by sorting to -1.
 */
export function localeChainRank(
  chain: readonly string[],
  locale: string,
): number {
  const index = chain.indexOf(locale.toLowerCase());
  return index === -1 ? chain.length : index;
}
