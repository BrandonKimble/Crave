/**
 * Repair places that SHARE a TomTom polygon (found 2026-07-27).
 *
 * THE DEFECT: the old name-based geometry-id resolution matched several
 * distinct municipalities onto ONE TomTom entity — e.g. Aleknagik,
 * Dillingham, Ekwok, Togiak and Manokotak (five separate Alaska towns) all
 * carry geometry id 0000414b-…464f, so five towns share one outline. Prod at
 * time of writing: 363 places across 165 shared ids.
 *
 * This is the same disease as the San Juan bbox corruption — an identity
 * resolved by NAME instead of by ground — surfacing in the polygon rather
 * than the rectangle. Point identity (one-ground charter P0, live-proven
 * 12/12) resolves each town from its OWN interior coordinate, so it cannot
 * collide this way.
 *
 * THE REPAIR (no data invented, no shape guessed):
 *   - demote the shared outline to sketch grade (provider_boundary_id = NULL)
 *     so promoteOne stops treating the place as already-done. The polygon
 *     itself is LEFT IN PLACE: it is the wrong shape either way, and leaving
 *     it keeps the "every place has a ground" invariant true for the hour
 *     until the drain replaces it.
 *   - reopen the queue row (promoted_at, last_attempt_at, cached id cleared)
 *     so the next hourly drain re-resolves BY POINT and overwrites.
 * A place whose town the vendor genuinely does not model (the Keansburg
 * class) simply stays sketch-grade — honest, and visible to a re-run.
 *
 * Idempotent: re-running after the drain reports 0 groups.
 *
 * Usage:
 *   npx ts-node scripts/data-fixes/repair-shared-polygons.ts            # dry-run
 *   npx ts-node scripts/data-fixes/repair-shared-polygons.ts --execute
 *   DATABASE_URL=<prod> npx ts-node ... --execute                       # prod
 */
import { PrismaClient } from '@prisma/client';

type SharedRow = {
  provider_boundary_id: string;
  place_id: string;
  name: string;
  has_anchor: boolean;
};

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<SharedRow[]>`
      WITH dup AS (
        SELECT provider_boundary_id
        FROM place_geometries
        WHERE provider_boundary_id IS NOT NULL
        GROUP BY 1 HAVING count(*) > 1
      )
      SELECT pg.provider_boundary_id, pg.place_id, p.name,
             (p.centroid_lat IS NOT NULL) AS has_anchor
      FROM dup d
      JOIN place_geometries pg ON pg.provider_boundary_id = d.provider_boundary_id
      JOIN places p ON p.place_id = pg.place_id
      ORDER BY pg.provider_boundary_id, p.name
    `;
    const groups = new Map<string, SharedRow[]>();
    for (const row of rows) {
      const bucket = groups.get(row.provider_boundary_id);
      if (bucket) bucket.push(row);
      else groups.set(row.provider_boundary_id, [row]);
    }
    const anchorless = rows.filter((row) => !row.has_anchor);
    console.log(
      `[shared-polygons] ${groups.size} shared geometry ids across ${rows.length} places; ` +
        `${anchorless.length} lack an interior anchor (cannot be point-resolved)`,
    );
    for (const [id, members] of [...groups].slice(0, 5)) {
      console.log(`  ${id}: ${members.map((m) => m.name).join(', ')}`);
    }
    if (groups.size > 5) {
      console.log(`  … ${groups.size - 5} more groups`);
    }
    if (!execute) {
      console.log('[shared-polygons] dry-run — nothing written');
      return;
    }

    const placeIds = rows.map((row) => row.place_id);
    const demoted = await prisma.$executeRaw`
      UPDATE place_geometries SET provider_boundary_id = NULL
      WHERE place_id = ANY(${placeIds}::uuid[])
    `;
    const reopened = await prisma.$executeRaw`
      UPDATE place_geometry_promotions
      SET promoted_at = NULL, last_attempt_at = NULL, provider_boundary_id = NULL
      WHERE place_id = ANY(${placeIds}::uuid[])
    `;
    // A place that never had a queue row (pre-queue vintage) needs one, or
    // the drain will never see it.
    const enqueued = await prisma.$executeRaw`
      INSERT INTO place_geometry_promotions (place_id, trigger, enqueued_at)
      SELECT p.place_id, 'shared_polygon_repair', now()
      FROM places p
      WHERE p.place_id = ANY(${placeIds}::uuid[])
      ON CONFLICT (place_id) DO NOTHING
    `;
    console.log(
      `[shared-polygons] demoted ${demoted} outlines, reopened ${reopened} queue rows, ` +
        `enqueued ${enqueued} missing rows — the next drain re-resolves them BY POINT`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
