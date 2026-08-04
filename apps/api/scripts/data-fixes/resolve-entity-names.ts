/**
 * @script-class: operational
 * ENTITY-NAME RESOLUTION (one-ground charter).
 *
 * The law: A PLACE'S NAME IS WHAT THE VENDOR CALLS THE ENTITY WHOSE ID WE HOLD.
 *
 * Every earlier name audit asked the WRONG question — "what municipality is at
 * this point?" — which can answer with a NEIGHBOUR or the containing town, and
 * produced a long tail of fake "disagreements" (measured: Jacksonville NC,
 * Lake Ozark MO, Absecon NJ ...). Adopting those answers would paste a
 * different entity's name onto our polygon, re-creating the duplicate-identity
 * class P3 eliminated.
 *
 * This asks the only question that means anything: probe the place's own
 * on-ground point, then compare the RETURNED GEOMETRY ID against our stored
 * providerPlaceId. A name is only a candidate when the ids MATCH — the vendor
 * is then naming us, not somebody else.
 *
 * Report-only by default. --execute applies same-entity renames.
 */
import { NestFactory } from '@nestjs/core';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import {
  TOMTOM_CHAIN_PROBE,
  TomtomChainProbe,
} from '../../src/modules/places/tomtom-chain-probe.port';

const prisma = new PrismaClient();

type Row = {
  place_id: string;
  name: string;
  sub: string | null;
  lvl: string;
  pid: string;
  lat: string;
  lng: string;
};

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  // THROUGH THE PORT (red team 2026-08-04). This script carried its own
  // fetch() + key read + 220ms sleep: ungoverned (racing the drain past the
  // vendor QPS), unmetered (zero ledger rows — the photoMedia incident's
  // shape), and it printed !res.ok as "no entity" — P5, in reporting. The
  // adapter's governed path is now the only door: pool-paced, ledgered,
  // money-gated, and faults come back TYPED.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  stopCronsForScript(app);
  const probe = app.get<TomtomChainProbe>(TOMTOM_CHAIN_PROBE);

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT p.place_id, p.name, p.subdivision_code sub, p.provider_level_code lvl,
            p.provider_place_id pid,
            ST_Y(ST_PointOnSurface(g.geometry))::text lat,
            ST_X(ST_PointOnSurface(g.geometry))::text lng
       FROM places p JOIN place_geometries g ON g.place_id = p.place_id
      WHERE p.provider_place_id IS NOT NULL
      ORDER BY p.name, p.subdivision_code`,
  );
  console.log(`[entity-names] ${rows.length} places | execute=${execute}`);

  let sameAgree = 0,
    sameRename = 0,
    other = 0,
    none = 0;
  const renames: Array<{
    id: string;
    from: string;
    to: string;
    sub: string | null;
  }> = [];

  let denied = 0;
  let faulted = 0;
  for (const r of rows) {
    const lookup = await probe.lookupLevelEntity(
      { lat: Number(r.lat), lng: Number(r.lng) },
      r.lvl,
    );
    if (lookup.kind === 'denied') {
      // Money gate or pool said not-now — stop rather than misreport the
      // tail of the catalog as unanswerable.
      denied += 1;
      console.log('[entity-names] STOPPED: pool/budget denied');
      break;
    }
    if (lookup.kind === 'failed') {
      // A fault is NOT "no entity" — count it apart so a vendor outage
      // cannot read as a catalog full of nameless places.
      faulted += 1;
      continue;
    }
    if (lookup.kind === 'empty') {
      none += 1;
      continue;
    }
    const gid = lookup.geometryId;
    if (!gid || gid !== r.pid) {
      other += 1;
      continue;
    } // vendor named someone else

    // The name field is keyed to the place's OWN LEVEL — never a fallback
    // chain. A blind `municipality ?? countrySecondarySubdivision ?? ...`
    // silently returns a COARSER entity's name when the level-appropriate
    // field is absent: it renamed Austin's Bouldin Creek neighbourhood to
    // "Austin" and Alexander AR (a municipality) to "Saline" (its county).
    // Caught after it wrote 726 rows, 2026-07-28. The vendor answering with a
    // matching geometry id does NOT license reading a different field off it.
    const addr = lookup.address;
    const nameByLevel: Record<string, string | undefined> = {
      Neighbourhood: addr.neighbourhood,
      MunicipalitySubdivision: addr.municipalitySubdivision,
      Municipality: addr.municipality,
      CountrySecondarySubdivision: addr.countrySecondarySubdivision,
      // NAME field only — NO `?? addr.countrySubdivision` fallback. That
      // field is the two-letter CODE ("TX"), not a name; when the vendor
      // omits countrySubdivisionName, a matching geometry id would have
      // licensed renaming Missouri to "MO". Both red-team reviewers flagged
      // it independently (2026-07-29) as the scar class this file documents,
      // alive in the file that documents it. Field absent = no candidate.
      CountrySubdivision: addr.countrySubdivisionName,
      Country: addr.country,
    };
    const nm = nameByLevel[r.lvl] ?? '';
    if (!nm) {
      none += 1;
      continue;
    }
    if (nm === r.name) {
      sameAgree += 1;
      continue;
    }

    sameRename += 1;
    renames.push({ id: r.place_id, from: r.name, to: nm, sub: r.sub });
    console.log(`  RENAME  "${r.name}, ${r.sub ?? ''}"  ->  "${nm}"`);
  }

  console.log(
    `\n[entity-names] same-entity agree=${sameAgree} same-entity RENAME=${sameRename} ` +
      `other-entity(skipped)=${other} vendor-empty=${none} ` +
      `faulted=${faulted} denied=${denied} of ${rows.length}`,
  );

  if (!execute) {
    console.log(`[entity-names] dry-run — ${renames.length} renames available`);
    await app.close();
    return;
  }
  // Per-row, fault-tolerant so one bad row cannot abort a 22k-row pass. A
  // failure here is USUALLY the identity index (country, subdivision, level,
  // name, county) NULLS NOT DISTINCT rejecting a name a sibling already holds
  // — harmless, since identity is the VENDOR ID, not the name.
  //
  // SCAR: an earlier version labelled EVERY failure "COLLISION" and printed
  // `e.message.split('\n')[0]`. Prisma messages START with a newline, so the
  // reason printed EMPTY, and two TRANSIENT CONNECTION DROPS were reported —
  // to the owner, as fact — as collisions that had "correctly" blocked a
  // rename. Both renames were valid, and one of them (East Lansing MI ->
  // Lansing) corrected a row that had been holding LANSING's 39.8 sq mi
  // polygon under the wrong census-era name. Never collapse an error class you
  // have not actually read, and never report a swallowed error as a diagnosis.
  let applied = 0;
  const failed: string[] = [];
  for (const rn of renames) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE places SET name = $1 WHERE place_id = $2::uuid`,
        rn.to,
        rn.id,
      );
      applied += 1;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message.replace(/\s+/g, ' ').trim() : String(e);
      failed.push(
        `  FAILED "${rn.from}, ${rn.sub ?? ''}" -> "${rn.to}": ${msg}`,
      );
    }
  }
  if (failed.length) {
    console.log(
      '\n[entity-names] could not apply (READ THESE — not all are collisions):',
    );
    console.log(failed.join('\n'));
  }
  console.log(
    `[entity-names] applied ${applied} renames, ${failed.length} failures`,
  );
}

void main().finally(() => prisma.$disconnect());
// (the Nest context is closed inside main; process exit reaps the rest)
