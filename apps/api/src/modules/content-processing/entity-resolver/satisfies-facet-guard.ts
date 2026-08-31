import { Prisma } from '@prisma/client';

/**
 * THE FACET GUARD AT HEARING ADMISSION (widening red team F5, 2026-08-31).
 *
 * Cuisine-faceted vocabulary (facet='cuisine' — a category dimension, owned
 * by the cuisine system) and dietary-constrained vocabulary
 * (constraint_class='dietary' — the curated lifestyle set the relaxation
 * ladder may NEVER drop) are inadmissible as satisfies-edge endpoints:
 * widening a dietary wall or a cuisine identity is exactly the generosity
 * the owner ruling forbids. Read-time anchor filtering already refuses to
 * WIDEN from such anchors; this guard is the write-side twin — no court may
 * WRITE an edge touching them, and the docket never nominates one.
 *
 * A refusal is a logged fact, never a silent drop: callers receive the
 * per-id reason and must surface it (skipped row, warn log, console line).
 *
 * ONE DERIVATION: both satisfies courts and the docket's nomination path
 * import THIS — a second inline copy of the predicate is the divergence
 * class this module exists to prevent.
 */

/** Minimal query surface — PrismaService and TransactionClient both fit. */
interface RawQueryable {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
}

/**
 * The subset of `ids` that may not carry a satisfies edge, mapped to the
 * human-readable reason. Ids absent from the map are admissible.
 */
export async function facetInadmissibleIds(
  db: RawQueryable,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const rows = await db.$queryRaw<
    Array<{ entity_id: string; facet: string | null; cc: string | null }>
  >(Prisma.sql`
    SELECT entity_id::text, facet, constraint_class AS cc
      FROM core_entities
     WHERE entity_id = ANY(${unique}::uuid[])
       AND (facet = 'cuisine' OR constraint_class = 'dietary')`);
  return new Map(
    rows.map((row) => [
      row.entity_id,
      row.facet === 'cuisine'
        ? 'cuisine-faceted — the cuisine system owns this identity'
        : 'dietary-constrained — the dietary wall is never widened',
    ]),
  );
}
