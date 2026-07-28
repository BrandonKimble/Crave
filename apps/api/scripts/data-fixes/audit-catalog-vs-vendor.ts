/**
 * AUDIT (and optionally REPAIR) the catalog against the VENDOR's model.
 *
 * The law this enforces: where our model and TomTom's disagree about WHAT a
 * place is, the vendor wins — and we correct it explicitly rather than
 * waiting for someone to look at it. Our identity and shapes are already
 * TomTom's (one-ground charter P0/P3/P4); this covers the remaining
 * census-shaped attributes: LEVEL and COUNTRY.
 *
 * Method: reverse-geocode each place's own interior anchor and read what the
 * vendor says is there. Point identity, same law as everywhere else.
 *
 * WHAT IT FIXES (--execute): providerLevelCode and countryCode. Both are
 * structural facts the vendor is authoritative about (Puerto Rico is a
 * COUNTRY to TomTom, not a US subdivision — 79 rows carry the wrong one).
 *
 * WHAT IT ONLY REPORTS: name differences. The vendor's most-specific entity
 * at a point can be a DIFFERENT GRANULARITY than our row, not a correction —
 * measured live: our "Rockville, SC" vs TomTom's "Wadmalaw Island" is a real
 * town inside a differently-named vendor municipality. Auto-renaming on that
 * signal would destroy correct data, so names need a human read.
 *
 * Usage:
 *   npx ts-node scripts/data-fixes/audit-catalog-vs-vendor.ts --sample 300
 *   npx ts-node scripts/data-fixes/audit-catalog-vs-vendor.ts --territories
 *   ... --territories --execute
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = process.env.TOMTOM_API_KEY ?? '';
/**
 * The vendor is asked AT OUR OWN LEVEL, never with the full ladder.
 *
 * Caught the hard way 2026-07-27: a full-ladder reverse geocode returns the
 * MOST SPECIFIC entity at that point, which is naturally finer than a county
 * row — Mineral County CO answers "Municipality (Creede)", Sacramento County
 * answers "Municipality (Elk Grove)". Both are true and neither is a
 * disagreement. Comparing against it produced 51 false positives out of 300,
 * and applying them would have relabelled counties as towns and destroyed the
 * hierarchy. Pinning the level asks the only question that means anything:
 * "does the vendor have an entity AT THIS LEVEL here, and is it ours?"
 */
/** Vendor fact (K4): ~5 QPS on the Search endpoints — 220ms keeps us under. */
const SPACING_MS = 220;

type Row = {
  place_id: string;
  name: string;
  provider_level_code: string;
  country_code: string;
  centroid_lat: string;
  centroid_lng: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function vendorAt(
  lat: number,
  lng: number,
  level: string,
): Promise<{ level: string; country: string; name: string } | null> {
  const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lng}.json?key=${API_KEY}&entityType=${encodeURIComponent(level)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    addresses?: Array<{
      entityType?: string;
      address?: Record<string, string>;
    }>;
  };
  const entry = data.addresses?.[0];
  if (!entry?.entityType) return null;
  const a = entry.address ?? {};
  const nameByLevel: Record<string, string | undefined> = {
    Neighbourhood: a.neighbourhood,
    MunicipalitySubdivision: a.municipalitySubdivision,
    Municipality: a.municipality,
    CountrySecondarySubdivision: a.countrySecondarySubdivision,
    CountrySubdivision: a.countrySubdivisionName ?? a.countrySubdivision,
    Country: a.country,
  };
  return {
    level: entry.entityType,
    country: (a.countryCode ?? '').toUpperCase(),
    name: nameByLevel[entry.entityType] ?? '',
  };
}

async function main(): Promise<void> {
  const argv = process.argv;
  const execute = argv.includes('--execute');
  const territoriesOnly = argv.includes('--territories');
  const sampleIdx = argv.indexOf('--sample');
  const sample = sampleIdx >= 0 ? Number(argv[sampleIdx + 1]) : 0;

  if (!API_KEY) throw new Error('TOMTOM_API_KEY required');

  const where = territoriesOnly
    ? `AND subdivision_code IN ('PR','VI','GU','AS','MP')`
    : '';
  const order = sample > 0 ? 'ORDER BY random()' : 'ORDER BY name';
  const limit = sample > 0 ? `LIMIT ${sample}` : '';
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT place_id, name, provider_level_code, country_code,
            centroid_lat::text, centroid_lng::text
     FROM places
     WHERE centroid_lat IS NOT NULL ${where} ${order} ${limit}`,
  );

  console.log(
    `[audit] ${rows.length} places | mode=${territoriesOnly ? 'territories' : sample ? `sample ${sample}` : 'all'} | execute=${execute}`,
  );

  let agree = 0;
  let levelDiff = 0;
  let countryDiff = 0;
  let nameDiff = 0;
  let noVendor = 0;
  const fixes: Array<{ id: string; level?: string; country?: string }> = [];

  for (const row of rows) {
    const vendor = await vendorAt(
      Number(row.centroid_lat),
      Number(row.centroid_lng),
      row.provider_level_code,
    );
    await sleep(SPACING_MS);
    if (!vendor) {
      // The vendor models NOTHING at our level here. That is the real
      // "our level is wrong" signal (or the vendor simply lacks the place —
      // the Keansburg class). Reported, never auto-applied.
      noVendor += 1;
      console.log(
        `  NO-ENTITY-AT-LEVEL ${row.name} (${row.provider_level_code}, ${row.country_code})`,
      );
      continue;
    }
    const levelWrong = vendor.level !== row.provider_level_code;
    const countryWrong =
      Boolean(vendor.country) && vendor.country !== row.country_code;
    const nameWrong =
      Boolean(vendor.name) && vendor.name !== row.name && !levelWrong;

    if (!levelWrong && !countryWrong && !nameWrong) {
      agree += 1;
      continue;
    }
    if (levelWrong) {
      levelDiff += 1;
      console.log(
        `  LEVEL       ${row.name}: we=${row.provider_level_code} vendor=${vendor.level} (${vendor.name})`,
      );
    }
    if (countryWrong) {
      countryDiff += 1;
      console.log(
        `  COUNTRY     ${row.name}: we=${row.country_code} vendor=${vendor.country}`,
      );
    }
    if (nameWrong) {
      nameDiff += 1;
      console.log(`  NAME(report) we='${row.name}' vendor='${vendor.name}'`);
    }
    if (levelWrong || countryWrong) {
      fixes.push({
        id: row.place_id,
        // Only structural facts are auto-applied; see the file header.
        level: levelWrong ? vendor.level : undefined,
        country: countryWrong ? vendor.country : undefined,
      });
    }
  }

  console.log(
    `[audit] agree=${agree} levelDiff=${levelDiff} countryDiff=${countryDiff} ` +
      `nameDiff=${nameDiff} noVendor=${noVendor} of ${rows.length}`,
  );

  if (!execute) {
    console.log(`[audit] dry-run — ${fixes.length} structural fixes available`);
    return;
  }
  for (const fix of fixes) {
    const sets: string[] = [];
    if (fix.level) sets.push(`provider_level_code = '${fix.level}'`);
    if (fix.country) sets.push(`country_code = '${fix.country}'`);
    await prisma.$executeRawUnsafe(
      `UPDATE places SET ${sets.join(', ')} WHERE place_id = $1::uuid`,
      fix.id,
    );
  }
  console.log(`[audit] applied ${fixes.length} structural fixes`);
}

void main().finally(() => prisma.$disconnect());
