/**
 * @script-class: probe
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
import { NestFactory } from '@nestjs/core';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import {
  LevelEntityLookup,
  TOMTOM_CHAIN_PROBE,
  TomtomChainProbe,
} from '../../src/modules/places/tomtom-chain-probe.port';

const prisma = new PrismaClient();
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

type VendorAnswer =
  | { kind: 'entity'; level: string; country: string; name: string }
  | { kind: 'none' }
  | { kind: 'faulted'; reason: string }
  | { kind: 'denied' };

/**
 * THROUGH THE PORT (red team 2026-08-04). This script read the key itself
 * and fetch()ed the vendor directly: ungoverned, unmetered, and a 429 or a
 * 500 came back as `null` — printed as NO-ENTITY-AT-LEVEL, so one vendor
 * outage during a full run reported the ENTIRE catalog as vendor-unknown.
 * The level-keyed name law stays HERE (it is this audit's law, not the
 * port's); the transport, pacing, ledger and money gate are the adapter's.
 */
function interpret(lookup: LevelEntityLookup): VendorAnswer {
  if (lookup.kind === 'denied') return { kind: 'denied' };
  if (lookup.kind === 'failed') {
    return { kind: 'faulted', reason: lookup.reason };
  }
  // 'wrong-level' is the adapter's own echo gate now (2026-08-07): the
  // vendor answered about a DIFFERENT rung, which for this audit's question
  // ("does the vendor model an entity at THIS level here?") is the same
  // observation as none.
  if (lookup.kind === 'empty' || lookup.kind === 'wrong-level') {
    return { kind: 'none' };
  }
  if (!lookup.entityType) return { kind: 'none' };
  const a = lookup.address;
  const nameByLevel: Record<string, string | undefined> = {
    Neighbourhood: a.neighbourhood,
    MunicipalitySubdivision: a.municipalitySubdivision,
    Municipality: a.municipality,
    CountrySecondarySubdivision: a.countrySecondarySubdivision,
    // NAME field only — see resolve-entity-names.ts for the scar. The CODE
    // fallback made this auditor score a code-named row ("MO") as AGREEING
    // with the vendor, so the tool meant to DETECT divergence hid it.
    CountrySubdivision: a.countrySubdivisionName,
    Country: a.country,
  };
  return {
    kind: 'entity',
    level: lookup.entityType,
    country: (a.countryCode ?? '').toUpperCase(),
    name: nameByLevel[lookup.entityType] ?? '',
  };
}

async function main(): Promise<void> {
  const argv = process.argv;
  const execute = argv.includes('--execute');
  const territoriesOnly = argv.includes('--territories');
  const sampleIdx = argv.indexOf('--sample');
  const sample = sampleIdx >= 0 ? Number(argv[sampleIdx + 1]) : 0;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  stopCronsForScript(app);
  const probe = app.get<TomtomChainProbe>(TOMTOM_CHAIN_PROBE);
  try {
    const where = territoriesOnly
      ? `AND subdivision_code IN ('PR','VI','GU','AS','MP')`
      : '';
    const order = sample > 0 ? 'ORDER BY random()' : 'ORDER BY name';
    const limit = sample > 0 ? `LIMIT ${sample}` : '';
    // Red-team 2026-07-29: probe ST_PointOnSurface(ground), never the stored
    // centroid — the stored point can drift off-ground again (mergeSketch
    // gap-fills it from the vendor position), and an off-ground probe returns a
    // NEIGHBOUR, whose country would then be AUTO-APPLIED under --execute.
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT p.place_id, p.name, p.provider_level_code, p.country_code,
            ST_Y(ST_PointOnSurface(g.geometry))::text AS centroid_lat,
            ST_X(ST_PointOnSurface(g.geometry))::text AS centroid_lng
     FROM places p JOIN place_geometries g ON g.place_id = p.place_id
     ${where ? 'WHERE ' + where.replace(/^AND /, '') : ''} ${order} ${limit}`,
    );

    console.log(
      `[audit] ${rows.length} places | mode=${territoriesOnly ? 'territories' : sample ? `sample ${sample}` : 'all'} | execute=${execute}`,
    );

    let agree = 0;
    let levelDiff = 0;
    let countryDiff = 0;
    let nameDiff = 0;
    let noVendor = 0;
    let faulted = 0;
    const fixes: Array<{ id: string; level?: string; country?: string }> = [];

    for (const row of rows) {
      const vendor = interpret(
        await probe.lookupLevelEntity(
          { lat: Number(row.centroid_lat), lng: Number(row.centroid_lng) },
          row.provider_level_code,
        ),
      );
      if (vendor.kind === 'denied') {
        console.log('[audit] STOPPED: pool/budget denied');
        break;
      }
      if (vendor.kind === 'faulted') {
        // A fault is not an observation — reported apart, never as
        // NO-ENTITY-AT-LEVEL.
        faulted += 1;
        console.log(`  FAULTED ${row.name} (${vendor.reason})`);
        continue;
      }
      if (vendor.kind === 'none') {
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
        `nameDiff=${nameDiff} noVendor=${noVendor} faulted=${faulted} of ${rows.length}`,
    );

    if (!execute) {
      console.log(
        `[audit] dry-run — ${fixes.length} structural fixes available`,
      );
      return;
    }
    // Red-team 2026-07-29: parameterized (vendor strings were interpolated raw
    // next to a correctly-parameterized id) and per-row fault-tolerant — the
    // level is an input to the identity expression index, so one collision used
    // to throw and silently abandon every remaining fix after a partial prefix.
    let applied = 0;
    for (const fix of fixes) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE places
            SET provider_level_code = COALESCE($1, provider_level_code),
                country_code = COALESCE($2, country_code)
          WHERE place_id = $3::uuid`,
          fix.level ?? null,
          fix.country ?? null,
          fix.id,
        );
        applied += 1;
      } catch (e) {
        console.log(
          `  FAILED fix for ${fix.id}: ${e instanceof Error ? e.message.replace(/\s+/g, ' ').trim() : String(e)}`,
        );
      }
    }
    console.log(`[audit] applied ${applied}/${fixes.length} structural fixes`);
  } finally {
    // Closing the context flushes the usage ledger — see the exit note below.
    await app.close();
  }
}

// EXIT CODE IS A FACT (red team 2026-08-04). `process.exit(0)` in a finally
// made every run — including a Nest boot failure — report success, so no cron,
// CI step or operator could tell a completed audit from a crash. It also
// skipped app.close(), and UsageLedgerService.onModuleDestroy is what awaits
// the fire-and-forget ledger writes: the last draws of every run were lost,
// which is the unmetered-vendor-call shape this conversion existed to close.
void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
