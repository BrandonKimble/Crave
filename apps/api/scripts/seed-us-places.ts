import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import {
  PlacesCatalogService,
  PlaceSketchNode,
} from '../src/modules/places/places-catalog.service';

/**
 * US pre-seed (plans/geo-demand-foundation-rebuild.md §1): sketch every
 * ACTIVE-government municipality from the Census gazetteer into the Place
 * Catalog — names + centroids + a measured under-estimate bbox, ZERO vendor
 * spend. Verified 2026-07-19: FUNCSTAT=A rows = 19,465 — the plan's "~19.5k
 * municipalities" is a measured fact, not an estimate.
 *
 * What this deliberately does NOT do:
 *  - No TomTom draws. The §1 "$50 TomTom polygons" are TIER-2 geometry: seeded
 *    places enter the §2 promotion queue via trigger (d) "batch seed" and
 *    drain through the governed scarce pool on its own schedule (or a
 *    price-tagged owner-approved grant). Sketches are free.
 *  - No neighborhoods. §1: they are NOT in the seed; they enter lazily on
 *    first attention via the reconciler.
 *
 * Identity-safety notes (the fork traps this script must not spring):
 *  - Census NAME carries the LSAD descriptor ("Abbeville city"); TomTom names
 *    the same place "Abbeville". Seeding the suffixed form would PERMANENTLY
 *    fork against every organic probe (identity is name-based). We strip the
 *    trailing run of all-lowercase / parenthesized-lowercase tokens — the
 *    LSAD descriptor is always appended lowercase ("city", "town", "borough",
 *    "metropolitan government (balance)", "zona urbana") while proper-name
 *    tokens are capitalized ("Carson City", "Village of the Branch" survive).
 *    Self-deriving rule on purpose: no hardcoded LSAD table to rot.
 *  - bbox = square of side sqrt(ALAND) centered on the internal point: a
 *    measured UNDER-estimate. §1's merge law only ever widens, so a too-small
 *    seed bbox self-heals on the first real probe; a too-large one never
 *    could.
 *  - GEOID becomes providerPlaceId (provider 'census') — a stable alias, per
 *    the §1 alias-adoption law.
 *
 * Inputs (downloaded once to ~/crave-data/gazetteer/, outside git):
 *  - 2024_Gaz_place_national.txt (tab-separated; census.gov gazetteer)
 *  - state.txt (pipe-separated FIPS reference; census.gov) — state display
 *    names come from DATA, not a hardcoded list.
 *
 * Usage:
 *   yarn places:seed-us            # dry-run: counts + samples, writes nothing
 *   yarn places:seed-us --execute  # sketch all chains
 */

const GAZETTEER_DIR =
  process.env.GAZETTEER_DIR ?? path.join(os.homedir(), 'crave-data/gazetteer');
const PLACES_FILE = path.join(GAZETTEER_DIR, '2024_Gaz_place_national.txt');
const STATES_FILE = path.join(GAZETTEER_DIR, 'state.txt');

/** WGS-84 meters per degree of latitude (definitional). */
const METERS_PER_DEGREE_LAT = 111_320;

type GazetteerRow = {
  usps: string;
  geoid: string;
  name: string;
  landAreaM2: number;
  lat: number;
  lng: number;
};

/** Strip the trailing LSAD descriptor: the run of tokens that are entirely
 *  lowercase (optionally parenthesized). "Abbeville city" → "Abbeville";
 *  "Nashville-Davidson metropolitan government (balance)" →
 *  "Nashville-Davidson"; "Carson City" and "Village of the Branch" untouched
 *  (trailing token capitalized). */
export function stripLsadDescriptor(name: string): string {
  const tokens = name.trim().split(/\s+/);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    const bare = last.replace(/^\(|\)$/g, '');
    if (bare.length > 0 && bare === bare.toLowerCase()) {
      tokens.pop();
    } else {
      break;
    }
  }
  return tokens.join(' ');
}

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

function parseGazetteer(filePath: string): GazetteerRow[] {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const header = lines[0].split('\t').map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [iUsps, iGeoid, iName, iFunc, iAland, iLat, iLng] = [
    col('USPS'),
    col('GEOID'),
    col('NAME'),
    col('FUNCSTAT'),
    col('ALAND'),
    col('INTPTLAT'),
    col('INTPTLONG'),
  ];
  const rows: GazetteerRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      continue;
    }
    const cells = line.split('\t').map((c) => c.trim());
    // FUNCSTAT A = active government: the plan's municipality set. CDPs and
    // inactive/statistical entities (S/I/F/N/B) are NOT municipalities.
    if (cells[iFunc] !== 'A') {
      continue;
    }
    const lat = Number(cells[iLat]);
    const lng = Number(cells[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
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
  for (const file of [PLACES_FILE, STATES_FILE]) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `Missing ${file} — download the Census gazetteer inputs first (see header comment).`,
      );
    }
  }

  const allMunicipalities = parseGazetteer(PLACES_FILE);
  const stateNames = parseStateNames(STATES_FILE);

  // Identity-collision guard (red-team 7aaa66d9 finding 3): the §1 identity
  // tuple (country, subdivision, level, name) cannot distinguish two REAL
  // same-name municipalities in one state (18 groups in the gazetteer, e.g.
  // the two Texas "Lakeside"s 4.7° apart). Seeding both would merge them
  // into one phantom-bbox row that poisons containing-fallback headers.
  // SKIP every member of a duplicate group, loudly — they enter organically
  // via §2 probes, where the catalog's disjoint-bbox guard refuses the
  // phantom union. The identity-law discriminator amendment is flagged for
  // wave-5.
  const byIdentity = new Map<string, GazetteerRow[]>();
  for (const muni of allMunicipalities) {
    const key = `${muni.usps}|${stripLsadDescriptor(muni.name).toLowerCase()}`;
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), muni]);
  }
  const collisionGroups = [...byIdentity.values()].filter(
    (group) => group.length > 1,
  );
  const collided = new Set(collisionGroups.flat().map((muni) => muni.geoid));
  const municipalities = allMunicipalities.filter(
    (muni) => !collided.has(muni.geoid),
  );
  if (collisionGroups.length > 0) {
    console.log(
      `SKIPPED ${collided.size} municipalities in ${collisionGroups.length} same-name-same-state identity collisions (organic §2 entry): ` +
        collisionGroups
          .map(
            (g) =>
              `${stripLsadDescriptor(g[0].name)} (${g[0].usps} ×${g.length})`,
          )
          .join(', '),
    );
  }
  const missingStates = [
    ...new Set(
      municipalities.map((m) => m.usps).filter((usps) => !stateNames.has(usps)),
    ),
  ];
  if (missingStates.length > 0) {
    throw new Error(
      `state.txt lacks names for: ${missingStates.join(', ')} — refusing to seed nameless subdivisions.`,
    );
  }

  console.log(
    `US seed: ${municipalities.length} active-government municipalities across ` +
      `${new Set(municipalities.map((m) => m.usps)).size} subdivisions.`,
  );
  // No silent coverage caps (§16): subdivisions whose municipal layer lives
  // at COUNTY level have zero incorporated places here — measured 2026-07-19:
  // DC, HI (5 counties), PR (78 municipios), AS/GU/MP/UM/VI. Deliberately NOT
  // seeded: county-gazetteer names carry capitalized descriptors ("Hawaii
  // County") that TomTom strips ("Honolulu"), so seeding them would fork the
  // identity law. They enter organically via §2 with the provider's own
  // naming on first attention.
  const seeded = new Set(municipalities.map((m) => m.usps));
  const absent = [...stateNames.keys()].filter((usps) => !seeded.has(usps));
  if (absent.length > 0) {
    console.log(
      `NOT covered by this seed (county-level municipal layers; organic §2 entry): ${absent.sort().join(', ')}`,
    );
  }
  console.log(
    'Samples:',
    municipalities
      .slice(0, 3)
      .map((m) => `${m.name} → "${stripLsadDescriptor(m.name)}" (${m.usps})`)
      .join(' · '),
  );
  if (!execute) {
    console.log('Dry-run only. Re-run with --execute to sketch the catalog.');
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const catalog = app.get(PlacesCatalogService);
    let done = 0;
    for (const muni of municipalities) {
      const chain: PlaceSketchNode[] = [
        {
          name: stripLsadDescriptor(muni.name),
          providerLevelCode: 'Municipality',
          countryCode: 'US',
          subdivisionCode: muni.usps,
          centroid: { lat: muni.lat, lng: muni.lng },
          bbox: bboxFromLandArea(muni.lat, muni.lng, muni.landAreaM2),
          provider: 'census',
          providerPlaceId: muni.geoid,
        },
        {
          name: stateNames.get(muni.usps) as string,
          providerLevelCode: 'CountrySubdivision',
          countryCode: 'US',
          subdivisionCode: muni.usps,
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
      if (done % 1000 === 0) {
        console.log(`  sketched ${done}/${municipalities.length}`);
      }
    }
    console.log(`Seed complete: ${done} municipality chains sketched.`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('seed-us-places failed:', error);
  process.exitCode = 1;
});
