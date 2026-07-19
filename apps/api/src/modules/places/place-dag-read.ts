/**
 * Place-DAG reads over the containment DAG (§1) that the catalog service does
 * not itself need: subtree expansion (descendants) and the structural
 * "subdivision-or-bigger" judgment. Pure functions over a Prisma client — no
 * module wiring, no service state. ADDITIVE beside the catalog (the §22
 * item-5 feed cut consumes these; the catalog internals are untouched).
 *
 * Parent-edge semantics: storage may hold duplicate edges (the catalog's
 * atomic `push` appends — see placeParentIds in places-catalog.service.ts);
 * every read here dedupes, exactly like that chokepoint.
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * All descendants of the given roots (roots INCLUDED), via one recursive CTE
 * over the parent_place_ids array column: children are places whose parent
 * edges contain a subtree member. UNION (not UNION ALL) makes the recursion a
 * fixpoint — a defective cycle in the DAG terminates instead of looping.
 */
export async function descendantPlaceIds(
  prisma: PrismaService,
  rootPlaceIds: string[],
): Promise<string[]> {
  const roots = [...new Set(rootPlaceIds)];
  if (!roots.length) {
    return [];
  }
  const rows = await prisma.$queryRaw<Array<{ place_id: string }>>(Prisma.sql`
    WITH RECURSIVE subtree AS (
      SELECT place_id FROM places WHERE place_id = ANY(${roots}::uuid[])
      UNION
      SELECT p.place_id
      FROM places p
      JOIN subtree s ON s.place_id = ANY(p.parent_place_ids)
    )
    SELECT place_id FROM subtree
  `);
  return rows.map((row) => row.place_id);
}

/**
 * §4 boundary — "big-place (subdivision+)" — judged STRUCTURALLY from the
 * DAG, never from the open providerLevelCode vocabulary (§1: stored, never
 * switched on): a place is subdivision-or-bigger iff a parentless ROOT of
 * the DAG is reachable within depth ≤ 1 (the place IS a root = country
 * level, or a direct child of a root = first-level subdivision). Sketch
 * chains always hang municipalities under a subdivision and/or county, so
 * town-and-smaller places sit at depth ≥ 2.
 *
 * Known honest edge: a place sketched with a degenerate chain (no broader
 * node named — a parentless orphan) reads as "big" and is therefore never
 * pushed; that fails safe (a missed push, never spam).
 */
export async function isSubdivisionOrBigger(
  prisma: PrismaService,
  placeId: string,
): Promise<boolean> {
  let frontier = [placeId];
  const visited = new Set(frontier);
  // depth 0 = the place itself; depth 1 = its parents. Deeper is small.
  for (let depth = 0; depth <= 1 && frontier.length > 0; depth += 1) {
    const rows = await prisma.place.findMany({
      where: { placeId: { in: frontier } },
      select: { placeId: true, parentPlaceIds: true },
    });
    const parentSets = rows.map((row) => [...new Set(row.parentPlaceIds)]);
    if (parentSets.some((parents) => parents.length === 0)) {
      return true; // a DAG root within depth ≤ 1
    }
    const next: string[] = [];
    for (const parents of parentSets) {
      for (const parentId of parents) {
        if (!visited.has(parentId)) {
          visited.add(parentId);
          next.push(parentId);
        }
      }
    }
    frontier = next;
  }
  return false;
}
