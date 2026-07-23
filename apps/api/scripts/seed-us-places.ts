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
import { countyAxisName, stripLsadDescriptor } from './lib/gazetteer-names';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

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
 * COUNTY AXIS (§1 amendment, ratified 2026-07-19): every municipality seeds
 * with its PRINCIPAL county on the identity tuple, so the 17 same-name-same-
 * state collision groups (35 towns, previously skip-listed) seed as DISTINCT
 * rows. County names are normalized to the provider-facing bare form
 * (probed live 2026-07-19: TomTom countrySecondarySubdivision = "Tarrant",
 * no designator) — see countyAxisName. For multi-county places (1,110 active
 * places span 2–5 counties) the principal county = the county containing the
 * place's Census INTERNAL POINT (resolved once via the Census geocoder into
 * the cache file below; fallback = first-listed county in FIPS order).
 * Residual cross-provider county-name disagreements are absorbed at merge by
 * the county decision table's overlap rule (stored county wins, logged) —
 * they can not fork.
 *
 * Inputs (downloaded once to ~/crave-data/gazetteer/, outside git):
 *  - 2024_Gaz_place_national.txt (tab-separated; census.gov gazetteer)
 *  - state.txt (pipe-separated FIPS reference; census.gov) — state display
 *    names come from DATA, not a hardcoded list.
 *  - place_principal_county2020.txt (pipe-separated, derived 2026-07-19:
 *    PLACEGEOID|COUNTYGEOID|COUNTYNAME|METHOD). Sources: place→county set
 *    from www2.census.gov/geo/docs/reference/codes2020/
 *    national_place_by_county2020.txt; principal pick for multi-county
 *    places via geocoding.geo.census.gov point-in-county on the gazetteer
 *    internal point (METHOD=intpt; single|first otherwise).
 *
 * Usage:
 *   yarn places:seed-us            # dry-run: counts + samples, writes nothing
 *   yarn places:seed-us --execute  # sketch all chains
 */

const GAZETTEER_DIR =
  process.env.GAZETTEER_DIR ?? path.join(os.homedir(), 'crave-data/gazetteer');
const PLACES_FILE = path.join(GAZETTEER_DIR, '2024_Gaz_place_national.txt');
const STATES_FILE = path.join(GAZETTEER_DIR, 'state.txt');
const COUNTIES_FILE = path.join(
  GAZETTEER_DIR,
  'place_principal_county2020.txt',
);

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

// Name normalization lives in scripts/lib/gazetteer-names.ts (shared with
// seed-coarse-polygons.ts — one idiom, one home; §1 identity is name-based).

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

/** PLACEGEOID → county-axis name (normalized bare form; see countyAxisName). */
function parsePrincipalCounties(filePath: string): Map<string, string> {
  const byGeoid = new Map<string, string>();
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const cells = line.trim().split('|');
    if (cells.length >= 3 && cells[0] && cells[2]) {
      byGeoid.set(cells[0], countyAxisName(cells[2]));
    }
  }
  return byGeoid;
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
  for (const file of [PLACES_FILE, STATES_FILE, COUNTIES_FILE]) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `Missing ${file} — download the Census gazetteer inputs first (see header comment).`,
      );
    }
  }

  const allMunicipalities = parseGazetteer(PLACES_FILE);
  const stateNames = parseStateNames(STATES_FILE);
  const principalCounties = parsePrincipalCounties(COUNTIES_FILE);

  // Identity-collision guard, COUNTY-AXIS edition (§1 amendment, ratified
  // 2026-07-19): the amended tuple (country, subdivision, COUNTY, level,
  // name) distinguishes the real same-name-same-state municipalities (17
  // groups incl. the two Texas "Lakeside"s), so they now seed as distinct
  // rows. Within a same-name-same-state group, a member is UNSEEDABLE only
  // when the county axis cannot discriminate it: (i) it shares its principal
  // county with a sibling (the WI city/village twins — Pewaukee, Superior),
  // or (ii) its county is UNKNOWN (2020-relationship gap, e.g. Waukesha
  // village inc. 2021) — a county-less seed row beside a same-name sibling
  // would merge into it under the county-less rules (u2/u3). Skipped members
  // enter organically via §2 probes, where the merge law's disjoint-bbox
  // guard (retained as defense in depth) refuses the phantom union.
  const byName = new Map<string, GazetteerRow[]>();
  for (const muni of allMunicipalities) {
    const key = `${muni.usps}|${stripLsadDescriptor(muni.name).toLowerCase()}`;
    byName.set(key, [...(byName.get(key) ?? []), muni]);
  }
  const collided = new Set<string>();
  const collisionNotes: string[] = [];
  for (const group of byName.values()) {
    if (group.length < 2) {
      continue;
    }
    const countyOf = (muni: GazetteerRow) =>
      principalCounties.get(muni.geoid)?.toLowerCase();
    const unseedable = group.filter((muni) => {
      const county = countyOf(muni);
      if (!county) {
        return true; // (ii) undiscriminable — county unknown
      }
      return group.some(
        (other) => other !== muni && countyOf(other) === county,
      ); // (i) county shared with a sibling
    });
    for (const muni of unseedable) {
      collided.add(muni.geoid);
    }
    if (unseedable.length > 0) {
      collisionNotes.push(
        `${stripLsadDescriptor(group[0].name)} (${group[0].usps} ×${unseedable.length}/${group.length})`,
      );
    }
  }
  const municipalities = allMunicipalities.filter(
    (muni) => !collided.has(muni.geoid),
  );
  if (collided.size > 0) {
    console.log(
      `SKIPPED ${collided.size} municipalities the county axis cannot discriminate from a same-name sibling (organic §2 entry): ` +
        collisionNotes.join(', '),
    );
  }
  const countyless = municipalities.filter(
    (muni) => !principalCounties.get(muni.geoid),
  );
  if (countyless.length > 0) {
    // 2024 gazetteer places absent from the 2020 relationship file (new
    // incorporations): seed with county UNKNOWN — the §1 gap-fill law adopts
    // the county from the first organic probe.
    console.log(
      `${countyless.length} municipalities lack a 2020 principal county (seed county-unknown; organic gap-fill).`,
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
  stopCronsForScript(app);
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
          // §1 county axis: principal county (bare provider-facing form).
          // State/country nodes below carry none — a state is not inside a
          // county.
          county: principalCounties.get(muni.geoid) ?? null,
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
