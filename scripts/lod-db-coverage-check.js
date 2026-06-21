#!/usr/bin/env node
/*
 * lod-db-coverage-check.js — DB cross-check for the map "dots" layer.
 *
 * WHY: the LOD harness reports how many dots are RESIDENT (pinapply nextPins) and how many are
 * actually VISIBLE after collision (render renderedDots), but neither is independently verified
 * against the database. This script answers "how many restaurants SHOULD be dots in this viewport?"
 * straight from postgres — the same count core_restaurant_locations feeds the /search/shortcut/
 * coverage endpoint — so a too-few-dots regression (app dropping markers between DB and source, or
 * collision over-culling) is catchable by comparing three numbers: DB-expected vs resident vs rendered.
 *
 * It mirrors search-coverage.service.ts's geographic_restaurants count EXACTLY: DISTINCT restaurant_id
 * from core_restaurant_locations with non-null lng/lat/google_place_id/address, inside the bbox
 * pre-filter, and (when a polygon is given) inside the screen-accurate viewport polygon via ST_Covers.
 *
 * USAGE (run from anywhere; reads apps/api/.env for DATABASE_URL):
 *   node scripts/lod-db-coverage-check.js --bbox <minLng> <minLat> <maxLng> <maxLat> [--rendered N] [--resident N]
 *   node scripts/lod-db-coverage-check.js --polygon "lng,lat lng,lat lng,lat ..." [--rendered N] [--resident N]
 *
 * Grab the polygon/bounds from the harness: the app sends `viewportPolygon` on the search payload,
 * and the [lodev] frame/camera_changed events carry the bounds; --rendered is the render event's
 * renderedDots, --resident is pinapply nextPins.
 */
const fs = require('fs');
const path = require('path');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve(__dirname, '../apps/api/.env');
  const text = fs.readFileSync(envPath, 'utf8');
  const match = text.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!match) throw new Error(`DATABASE_URL not found in ${envPath}`);
  return match[1];
}

function parseArgs(argv) {
  const out = { bbox: null, polygon: null, rendered: null, resident: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--bbox') {
      out.bbox = argv.slice(i + 1, i + 5).map(Number);
      i += 4;
    } else if (a === '--polygon') {
      out.polygon = argv[i + 1]
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number));
      i += 1;
    } else if (a === '--rendered') {
      out.rendered = Number(argv[i + 1]);
      i += 1;
    } else if (a === '--resident') {
      out.resident = Number(argv[i + 1]);
      i += 1;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bbox && !args.polygon) {
    console.error('Provide --bbox <minLng> <minLat> <maxLng> <maxLat> or --polygon "lng,lat ...".');
    process.exit(1);
  }

  // Derive the bbox pre-filter from the polygon when only a polygon is given (matches the service,
  // where mobile sends bounds = the polygon's bbox).
  let [minLng, minLat, maxLng, maxLat] = args.bbox || [];
  let polygon = args.polygon;
  if (polygon) {
    const lngs = polygon.map((p) => p[0]);
    const lats = polygon.map((p) => p[1]);
    minLng = Math.min(...lngs);
    maxLng = Math.max(...lngs);
    minLat = Math.min(...lats);
    maxLat = Math.max(...lats);
    // Close the ring for ST_MakePolygon if the caller didn't.
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) polygon = [...polygon, first];
  }

  process.env.DATABASE_URL = loadDatabaseUrl();
  // @prisma/client is hoisted to the monorepo root node_modules.
  const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'));
  const prisma = new PrismaClient();

  const baseWhere = `
    rl.longitude IS NOT NULL
    AND rl.latitude IS NOT NULL
    AND rl.google_place_id IS NOT NULL
    AND rl.address IS NOT NULL
    AND rl.longitude BETWEEN $1 AND $2
    AND rl.latitude BETWEEN $3 AND $4`;
  const params = [minLng, maxLng, minLat, maxLat];

  let polygonClause = '';
  if (polygon) {
    // ST_Covers(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(lng,lat), ...])), point) — mirrors
    // search-coverage.service.ts. Points are parameterized to avoid any injection / precision loss.
    const pointSql = polygon.map((_, idx) => {
      const lngIdx = params.length + idx * 2 + 1;
      const latIdx = lngIdx + 1;
      return `ST_MakePoint($${lngIdx}::double precision, $${latIdx}::double precision)`;
    });
    polygon.forEach((p) => params.push(p[0], p[1]));
    polygonClause = `
      AND ST_Covers(
        ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[${pointSql.join(', ')}])), 4326),
        ST_SetSRID(ST_MakePoint(rl.longitude::double precision, rl.latitude::double precision), 4326)
      )`;
  }

  const sql = `
    SELECT COUNT(DISTINCT rl.restaurant_id)::int AS dbcount
    FROM core_restaurant_locations rl
    WHERE ${baseWhere}${polygonClause}`;

  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    const dbCount = rows[0]?.dbcount ?? 0;
    console.log('--- LOD DB coverage cross-check ---');
    console.log(`bbox:      [${minLng}, ${minLat}] .. [${maxLng}, ${maxLat}]`);
    console.log(
      `polygon:   ${polygon ? `${polygon.length - 1}-gon (ST_Covers)` : 'none (bbox only)'}`
    );
    console.log(`DB dots in viewport (expected): ${dbCount}`);
    if (args.resident != null) {
      console.log(
        `resident (harness nextPins):    ${args.resident}  gap=${dbCount - args.resident}`
      );
    }
    if (args.rendered != null) {
      console.log(
        `rendered (harness renderedDots): ${args.rendered}  culled=${dbCount - args.rendered}`
      );
    }
    if (args.rendered != null && dbCount > 0) {
      const pct = ((args.rendered / dbCount) * 100).toFixed(1);
      console.log(`visible/expected: ${pct}%`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
