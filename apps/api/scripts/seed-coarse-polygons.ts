import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PlacesCatalogService,
  PlaceSketchNode,
} from '../src/modules/places/places-catalog.service';
import { countyAxisName } from './lib/gazetteer-names';

/**
 * COARSE POLYGON SEED (plans/geo-demand-foundation-rebuild.md §2.5(e),
 * ratified 2026-07-22): "coarse first (border countries + states + counties
 * — the diagonal-shape class that lies), municipalities paced behind,
 * organic forever-lazy."
 *
 * The diagonal-shape class is exactly why polygons are the truth (§2.5(c)):
 * a bbox around Texas, Mexico, or a mountain county contains vast ground the
 * place does not — those index rectangles used to NAME headers they had no
 * right to (the owner's Mexico bug). This script gives the whole coarse
 * layer its real ground:
 *
 *  1. Catalog rows (free, zero vendor spend):
 *     - countries US + Mexico + Canada: EXISTING rows are reused (Mexico and
 *       the US exist — organic probe / US seed); missing ones are minted via
 *       sketchChain, bbox-LESS. A bbox-less country gains its first index
 *       presence when its polygon lands (the drain widens places.bbox from
 *       the geometry envelope) — the index derives from truth, never from a
 *       hand-typed rectangle (§16: no chosen numbers).
 *     - all states/DC: rows exist from the US seed; sketchChain upserts are
 *       idempotent merges either way.
 *     - all ~3,142 county-layer rows from the Census county gazetteer
 *       (2024_Gaz_counties_national.txt): providerLevelCode
 *       'CountrySecondarySubdivision' (the TomTom rung the adapter threads),
 *       name = the bare provider-facing form (countyAxisName — same
 *       normalization idiom as the municipality seed), county column NULL (a
 *       county is not discriminated BY a county — the axis discriminates
 *       nodes FINER than the county rung), parent edge → its state, bbox =
 *       sqrt(ALAND) square on the internal point (measured under-estimate;
 *       §1 merge law only widens; the polygon envelope corrects it at
 *       promotion), provider 'census', GEOID as providerPlaceId.
 *
 *  2. Enqueue (still zero vendor spend): ALL of the above PLUS every
 *     existing municipality into place_geometry_promotions with trigger
 *     'paid_seed'. NO direct vendor calls happen here — the hourly governed
 *     drain (PlacesPromotionService) does every fetch through the cheap +
 *     scarce pools, so the owner-priced monthly budget (§16 K1,
 *     tomtom.scarcePolygons) is the real pacing: coarse rows enqueue FIRST
 *     (oldest-first drain = seed order §2.5(e)), municipalities behind them,
 *     and the backlog drains over however many month windows the budget
 *     allows.
 *
 * Usage:
 *   yarn places:seed-coarse-polygons             # dry-run: counts + samples
 *   yarn places:seed-coarse-polygons --execute   # write rows + enqueue
 */

const GAZETTEER_DIR =
  process.env.GAZETTEER_DIR ?? path.join(os.homedir(), 'crave-data/gazetteer');
const COUNTIES_FILE = path.join(
  GAZETTEER_DIR,
  '2024_Gaz_counties_national.txt',
);
const STATES_FILE = path.join(GAZETTEER_DIR, 'state.txt');

/** WGS-84 meters per degree of latitude (definitional). */
const METERS_PER_DEGREE_LAT = 111_320;

/** Border countries of the seed (§2.5(e) "border countries"). The US row
 *  exists from the municipality seed; Mexico exists organically. Rows are
 *  created only when missing, and always bbox-less (see header). */
const COUNTRIES: Array<{ name: string; countryCode: string }> = [
  { name: 'United States', countryCode: 'US' },
  { name: 'Mexico', countryCode: 'MX' },
  { name: 'Canada', countryCode: 'CA' },
];

type CountyRow = {
  usps: string;
  geoid: string;
  name: string;
  landAreaM2: number;
  lat: number;
  lng: number;
};

/** sqrt(ALAND) square centered on the internal point (measured under-estimate). */
function bboxFromLandArea(
  lat: number,
  lng: number,
  landAreaM2: number,
): PlaceSketchNode['bbox'] {
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

function parseCountyGazetteer(filePath: string): CountyRow[] {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const header = lines[0].split('\t').map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [iUsps, iGeoid, iName, iAland, iLat, iLng] = [
    col('USPS'),
    col('GEOID'),
    col('NAME'),
    col('ALAND'),
    col('INTPTLAT'),
    col('INTPTLONG'),
  ];
  const rows: CountyRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split('\t').map((c) => c.trim());
    const lat = Number(cells[iLat]);
    const lng = Number(cells[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    rows.push({
      usps: cells[iUsps],
      geoid: cells[iGeoid],
      name: cells[iName],
      landAreaM2: Number(cells[iAland]) || 0,
      lat,
      lng,
    });
  }
  return rows;
}

function parseStateNames(filePath: string): Map<string, string> {
  const byUsps = new Map<string, string>();
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n').slice(1)) {
    const cells = line.trim().split('|');
    if (cells.length >= 3) {
      byUsps.set(cells[1], cells[2]);
    }
  }
  return byUsps;
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  for (const file of [COUNTIES_FILE, STATES_FILE]) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `Missing ${file} — download the Census gazetteer inputs first (see header comment).`,
      );
    }
  }

  const allCounties = parseCountyGazetteer(COUNTIES_FILE);
  const stateNames = parseStateNames(STATES_FILE);
  const counties = allCounties.filter((county) => stateNames.has(county.usps));
  const nameless = allCounties.length - counties.length;
  const subdivisions = new Set(counties.map((county) => county.usps));

  console.log(
    `Coarse seed: ${COUNTRIES.length} border countries + ` +
      `${subdivisions.size} state-level subdivisions + ` +
      `${counties.length} county-layer rows` +
      (nameless > 0
        ? ` (${nameless} gazetteer rows skipped: no state.txt name)`
        : ''),
  );
  console.log(
    'County samples:',
    counties
      .slice(0, 3)
      .map(
        (county) =>
          `${county.name} → "${countyAxisName(county.name)}" (${county.usps})`,
      )
      .join(' · '),
  );
  if (!execute) {
    console.log(
      'Dry-run only. Re-run with --execute to write rows + enqueue the ' +
        'paid_seed promotions (the governed drain does all vendor fetching).',
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const catalog = app.get(PlacesCatalogService);
    const prisma = app.get(PrismaService);

    // ---- 1. Countries (reuse existing rows; mint bbox-less when missing).
    const countryPlaceIds: string[] = [];
    for (const country of COUNTRIES) {
      const existing = await prisma.place.findFirst({
        where: {
          countryCode: country.countryCode,
          providerLevelCode: { equals: 'Country', mode: 'insensitive' },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) {
        countryPlaceIds.push(existing.placeId);
        console.log(
          `country ${country.countryCode}: reusing "${existing.name}" (${existing.placeId})`,
        );
        continue;
      }
      const [created] = await catalog.sketchChain([
        {
          name: country.name,
          providerLevelCode: 'Country',
          countryCode: country.countryCode,
          subdivisionCode: null,
          provider: 'census',
        },
      ]);
      countryPlaceIds.push(created.placeId);
      console.log(
        `country ${country.countryCode}: created "${country.name}" (bbox-less; polygon envelope will index it)`,
      );
    }

    // ---- 2. States/DC + counties, one chain per county (county → state →
    // country). sketchChain merges idempotently into the US-seed state rows.
    let done = 0;
    for (const county of counties) {
      const chain: PlaceSketchNode[] = [
        {
          name: countyAxisName(county.name),
          providerLevelCode: 'CountrySecondarySubdivision',
          countryCode: 'US',
          subdivisionCode: county.usps,
          // A county is not discriminated BY a county — the axis only
          // discriminates nodes FINER than the county rung (§1 amendment).
          county: null,
          centroid: { lat: county.lat, lng: county.lng },
          bbox: bboxFromLandArea(county.lat, county.lng, county.landAreaM2),
          provider: 'census',
          providerPlaceId: county.geoid,
        },
        {
          name: stateNames.get(county.usps) as string,
          providerLevelCode: 'CountrySubdivision',
          countryCode: 'US',
          subdivisionCode: county.usps,
          provider: 'census',
        },
        {
          name: 'United States',
          providerLevelCode: 'Country',
          countryCode: 'US',
          subdivisionCode: null,
          provider: 'census',
        },
      ];
      await catalog.sketchChain(chain);
      done += 1;
      if (done % 500 === 0) {
        console.log(`  sketched ${done}/${counties.length} county chains`);
      }
    }
    console.log(`County layer sketched: ${done} chains.`);

    // ---- 3. Batch paid_seed enqueue, COARSE FIRST (oldest-first drain =
    // §2.5(e) seed order): countries, then states, then counties, then every
    // existing municipality. Mirrors PlacesPromotionService.enqueue's guards
    // (no fallback mints, no already-promoted ground, idempotent PK) in one
    // set-based statement per layer — zero vendor calls here; the governed
    // drain spends the pools.
    const enqueueLayer = async (
      label: string,
      where: Prisma.Sql,
    ): Promise<void> => {
      const inserted = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO place_geometry_promotions (place_id, trigger)
        SELECT p.place_id, 'paid_seed'
        FROM places p
        WHERE ${where}
          AND p.provider <> 'fallback'
          AND NOT EXISTS (
            SELECT 1 FROM place_geometries g
            WHERE g.place_id = p.place_id AND g.geometry IS NOT NULL
          )
        ON CONFLICT (place_id) DO NOTHING
      `);
      console.log(`enqueued ${label}: ${inserted} new paid_seed rows`);
    };

    await enqueueLayer(
      'countries',
      Prisma.sql`p.place_id = ANY(${countryPlaceIds}::uuid[])`,
    );
    await enqueueLayer(
      'states',
      Prisma.sql`lower(p.provider_level_code) = lower('CountrySubdivision') AND p.country_code = 'US'`,
    );
    await enqueueLayer(
      'counties',
      Prisma.sql`lower(p.provider_level_code) = lower('CountrySecondarySubdivision') AND p.country_code = 'US'`,
    );
    await enqueueLayer(
      'municipalities',
      Prisma.sql`lower(p.provider_level_code) = lower('Municipality')`,
    );

    const backlog = await prisma.placeGeometryPromotion.count({
      where: { promotedAt: null },
    });
    console.log(
      `Seed complete. Promotion backlog: ${backlog} rows — drains through ` +
        `the governed pools (scarce budget = the §16 K1 owner price-tag).`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('seed-coarse-polygons failed:', error);
  process.exitCode = 1;
});
