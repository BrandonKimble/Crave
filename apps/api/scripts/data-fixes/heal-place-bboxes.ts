/**
 * Heal corrupt place bboxes (attributed 2026-07-26).
 *
 * ROOT CAUSE: the §1 merge law's widen-only bbox union merged DISTINCT
 * same-named entities (e.g. "San Juan Municipio" PR ∪ a western "San Juan"
 * probe; "Delcambre" LA ∪ a northern collision) — leaving impossible bboxes
 * (a municipio spanning 45° of longitude). The seed under-estimate bbox was
 * designed to only ever widen; cross-entity widening is the defect. The
 * merge-law fix is its own arc (charter registry #14); THIS script heals the
 * DATA from factual sources only:
 *
 *  1. OUTLINE HEAL — places with a TomTom outline: bbox := the outline's
 *     envelope (TomTom truth). Skips wrap-encoded bboxes (min > max, e.g.
 *     Aleutians) — the envelope of a crossing geometry is not expressible as
 *     a plain range.
 *  2. SEED HEAL — census-born places WITHOUT an outline: bbox := the exact
 *     seed law (sqrt(ALAND) square on the census internal point) recomputed
 *     from the census gazetteer by GEOID (places 7-digit, counties 5-digit).
 *     Their sketch envelope rows are refreshed to match.
 *
 * Usage:
 *   npx ts-node scripts/data-fixes/heal-place-bboxes.ts            # dry-run
 *   npx ts-node scripts/data-fixes/heal-place-bboxes.ts --execute
 *   DATABASE_URL=<prod> npx ts-node ... --execute                  # prod
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const GAZETTEER_DIR =
  process.env.GAZETTEER_DIR ?? path.join(os.homedir(), 'crave-data/gazetteer');
const PLACES_FILE = path.join(GAZETTEER_DIR, '2024_Gaz_place_national.txt');
const COUNTIES_FILE = path.join(
  GAZETTEER_DIR,
  '2024_Gaz_counties_national.txt',
);

const METERS_PER_DEGREE_LAT = 111_320;

/** EXACT copy of seed-us-places.ts bboxFromLandArea — the one seed law. */
function bboxFromLandArea(lat: number, lng: number, landAreaM2: number) {
  if (!(landAreaM2 > 0)) {
    return null;
  }
  const sideMeters = Math.sqrt(landAreaM2);
  const dLat = sideMeters / 2 / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const dLng = dLat / cosLat;
  return {
    minLat: lat - dLat,
    minLng: lng - dLng,
    maxLat: lat + dLat,
    maxLng: lng + dLng,
  };
}

type GazRow = { geoid: string; lat: number; lng: number; landAreaM2: number };

function parseGazetteer(filePath: string): Map<string, GazRow> {
  const rows = new Map<string, GazRow>();
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const header = lines[0].split('\t').map((column) => column.trim());
  const col = (name: string) => header.indexOf(name);
  const geoidIdx = col('GEOID');
  const landIdx = col('ALAND');
  const latIdx = col('INTPTLAT');
  const lngIdx = col('INTPTLONG');
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const geoid = parts[geoidIdx]?.trim();
    if (!geoid) continue;
    rows.set(geoid, {
      geoid,
      lat: Number(parts[latIdx]),
      lng: Number(parts[lngIdx]),
      landAreaM2: Number(parts[landIdx]),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const prisma = new PrismaClient();
  try {
    // ── 1. OUTLINE HEAL ────────────────────────────────────────────────────
    const outlineDrift = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM place_geometries pg JOIN places p ON p.place_id = pg.place_id
      WHERE pg.provider_boundary_id IS NOT NULL
        AND p.bbox_min_lat IS NOT NULL AND p.bbox_min_lng <= p.bbox_max_lng
        AND (ST_XMax(pg.geometry) - ST_XMin(pg.geometry)) < 180
        AND (abs(p.bbox_min_lat - ST_YMin(pg.geometry)) > 0.001
          OR abs(p.bbox_max_lat - ST_YMax(pg.geometry)) > 0.001
          OR abs(p.bbox_min_lng - ST_XMin(pg.geometry)) > 0.001
          OR abs(p.bbox_max_lng - ST_XMax(pg.geometry)) > 0.001)
    `;
    console.log(
      `[outline-heal] rows drifting from TomTom envelope: ${outlineDrift[0].n}`,
    );
    if (execute) {
      const updated = await prisma.$executeRaw`
        UPDATE places p SET
          bbox_min_lat = ST_YMin(pg.geometry), bbox_max_lat = ST_YMax(pg.geometry),
          bbox_min_lng = ST_XMin(pg.geometry), bbox_max_lng = ST_XMax(pg.geometry)
        FROM place_geometries pg
        WHERE pg.place_id = p.place_id
          AND pg.provider_boundary_id IS NOT NULL
          AND p.bbox_min_lat IS NOT NULL AND p.bbox_min_lng <= p.bbox_max_lng
          AND (ST_XMax(pg.geometry) - ST_XMin(pg.geometry)) < 180
          AND (abs(p.bbox_min_lat - ST_YMin(pg.geometry)) > 0.001
            OR abs(p.bbox_max_lat - ST_YMax(pg.geometry)) > 0.001
            OR abs(p.bbox_min_lng - ST_XMin(pg.geometry)) > 0.001
            OR abs(p.bbox_max_lng - ST_XMax(pg.geometry)) > 0.001)
      `;
      console.log(`[outline-heal] updated: ${updated}`);
    }

    // ── 2. SEED HEAL (census places without an outline) ────────────────────
    const gaz = parseGazetteer(PLACES_FILE);
    for (const [geoid, row] of parseGazetteer(COUNTIES_FILE)) {
      gaz.set(geoid, row);
    }
    const sketchOnly = await prisma.$queryRaw<
      Array<{
        place_id: string;
        name: string;
        provider_place_id: string | null;
        bbox_min_lat: number | null;
        bbox_max_lat: number | null;
        bbox_min_lng: number | null;
        bbox_max_lng: number | null;
      }>
    >`
      SELECT p.place_id, p.name, p.provider_place_id,
             p.bbox_min_lat::float8 AS bbox_min_lat, p.bbox_max_lat::float8 AS bbox_max_lat,
             p.bbox_min_lng::float8 AS bbox_min_lng, p.bbox_max_lng::float8 AS bbox_max_lng
      FROM places p
      WHERE p.provider = 'census'
        AND p.provider_place_id ~ '^[0-9]+$'
        AND NOT EXISTS (
          SELECT 1 FROM place_geometries pg
          WHERE pg.place_id = p.place_id AND pg.provider_boundary_id IS NOT NULL
        )
    `;
    let healed = 0;
    let missing = 0;
    for (const place of sketchOnly) {
      const row = place.provider_place_id
        ? gaz.get(place.provider_place_id)
        : undefined;
      if (!row) {
        missing += 1;
        continue;
      }
      const bbox = bboxFromLandArea(row.lat, row.lng, row.landAreaM2);
      if (!bbox) {
        missing += 1;
        continue;
      }
      const drift =
        place.bbox_min_lat == null ||
        Math.abs(place.bbox_min_lat - bbox.minLat) > 0.001 ||
        Math.abs((place.bbox_max_lat ?? 0) - bbox.maxLat) > 0.001 ||
        Math.abs((place.bbox_min_lng ?? 0) - bbox.minLng) > 0.001 ||
        Math.abs((place.bbox_max_lng ?? 0) - bbox.maxLng) > 0.001;
      if (!drift) {
        continue;
      }
      healed += 1;
      console.log(
        `[seed-heal] ${place.name} (${place.provider_place_id}): ` +
          `[${place.bbox_min_lat?.toFixed(3)},${place.bbox_min_lng?.toFixed(3)} → ` +
          `${place.bbox_max_lat?.toFixed(3)},${place.bbox_max_lng?.toFixed(3)}] => ` +
          `[${bbox.minLat.toFixed(3)},${bbox.minLng.toFixed(3)} → ` +
          `${bbox.maxLat.toFixed(3)},${bbox.maxLng.toFixed(3)}]`,
      );
      if (execute) {
        await prisma.$executeRaw`
          UPDATE places SET
            bbox_min_lat = ${bbox.minLat}, bbox_max_lat = ${bbox.maxLat},
            bbox_min_lng = ${bbox.minLng}, bbox_max_lng = ${bbox.maxLng}
          WHERE place_id = ${place.place_id}::uuid
        `;
        // Refresh the sketch envelope to the healed bbox (sketch = bbox
        // envelope by definition; a stale corrupt envelope must not survive).
        await prisma.$executeRaw`
          UPDATE place_geometries SET
            geometry = ST_Multi(ST_MakeEnvelope(
              ${bbox.minLng}::float8, ${bbox.minLat}::float8,
              ${bbox.maxLng}::float8, ${bbox.maxLat}::float8, 4326)),
            fetched_at = now()
          WHERE place_id = ${place.place_id}::uuid
            AND provider_boundary_id IS NULL
        `;
      }
    }
    console.log(
      `[seed-heal] census places without outline: ${sketchOnly.length}; ` +
        `healed: ${healed}; no gazetteer match: ${missing}; execute=${execute}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
