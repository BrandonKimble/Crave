/**
 * @script-class: probe
 * @finding: BANKED 2026-08-07 — YES. Settling one viewport on the West
 * Village created it in under five seconds:
 *
 *   BEFORE {"probes":0,"neighbourhoods":0,"names":[]}
 *   t+5s   {"probes":1,"neighbourhoods":1,"names":["West Village"]}
 *
 * So the pipeline is HEALTHY end to end — vendor answer, probe record, place
 * row, geometry. Nothing swallows the fine ground. The catalog gap is not a
 * defect at all: the neighbourhood tier is built lazily from where people
 * actually look, and nobody had ever looked at the West Village.
 *
 * Consequence for the header work: New York SELF-HEALS on first visit. Once
 * the place existed, the centre chain became
 *   West Village[3km2] ⊂ New York[83] ⊂ New York[986] ⊂ New York[136129] ⊂ US
 * and the candidate header law produced the full expected ladder —
 * United States → New York → West Village. No backfill is required for
 * correctness, though warming popular ground would improve the FIRST
 * visitor's experience, since they are the one who pays the probe.
 *
 * Still unresolved, and unrelated to this probe: three of those five rungs
 * are all spelled "New York".
 *
 * ── original question ───────────────────────────────────────────────────
 * Does SETTLING a viewport on the West Village actually create it?
 *
 * The catalog's neighbourhood tier is built lazily: PlacesReconcilerService
 * .noteViewport() is the seam a settled viewport reaches (POST
 * /signals/viewport-dwell and the search submit are its two mouths), and it
 * probes TomTom for the ground under that view. Prod has 34 neighbourhoods
 * total, 0 within 20 km of the West Village, and until today `probed_regions`
 * had no rows at all — so nothing has ever asked about that ground.
 *
 * TomTom DOES answer there (verified live: entityType 'Neighbourhood',
 * neighbourhood 'West Village'). The open question is whether OUR pipeline
 * turns that answer into a place row, or whether something upstream — an
 * over-scale probed region, a scale gate, a level filter — swallows it.
 *
 * Spends a small number of real TomTom draws (reverse geocode, inside the
 * vendor's free monthly allowance at this volume).
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PlacesReconcilerService } from '../src/modules/places/places-reconciler.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const WEST_VILLAGE = { lat: 40.7358, lng: -74.0036 };
/** ~1.4 miles across — neighbourhood zoom, where a user would be browsing. */
const HALF = 0.01;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function snapshot(
  prisma: PrismaService,
): Promise<{ probes: number; neighbourhoods: number; names: string[] }> {
  const [probes] = await prisma.$queryRaw<Array<{ n: bigint }>>(
    Prisma.sql`SELECT count(*)::bigint AS n FROM probed_regions`,
  );
  const rows = await prisma.$queryRaw<Array<{ name: string }>>(
    Prisma.sql`
      SELECT p.name
      FROM places p
      JOIN place_geometries g ON g.place_id = p.place_id
      WHERE ST_DWithin(
        g.geometry::geography,
        ST_SetSRID(ST_MakePoint(${WEST_VILLAGE.lng}::double precision, ${WEST_VILLAGE.lat}::double precision), 4326)::geography,
        20000
      )
      AND p.provider_level_code IN ('Neighbourhood', 'MunicipalitySubdivision')
      ORDER BY p.name
    `,
  );
  return {
    probes: Number(probes.n),
    neighbourhoods: rows.length,
    names: rows.map((r) => r.name),
  };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  stopCronsForScript(app);
  const reconciler = app.get(PlacesReconcilerService);
  const prisma = app.get(PrismaService);

  const before = await snapshot(prisma);
  console.log('BEFORE', JSON.stringify(before));

  const view = {
    minLat: WEST_VILLAGE.lat - HALF,
    maxLat: WEST_VILLAGE.lat + HALF,
    minLng: WEST_VILLAGE.lng - HALF,
    maxLng: WEST_VILLAGE.lng + HALF,
  };
  console.log('settling viewport', JSON.stringify(view));
  reconciler.noteViewport(view);

  // noteViewport is sync-return by law (reads never wait on naming), so poll.
  for (let i = 1; i <= 12; i += 1) {
    await sleep(5_000);
    const now = await snapshot(prisma);
    console.log(`t+${i * 5}s`, JSON.stringify(now));
    if (now.neighbourhoods > before.neighbourhoods) {
      console.log('\nCREATED:', now.names.join(', '));
      break;
    }
  }

  const after = await snapshot(prisma);
  console.log('\nAFTER ', JSON.stringify(after));
  console.log(
    after.neighbourhoods > before.neighbourhoods
      ? 'VERDICT: settling the viewport DOES create the fine ground.'
      : 'VERDICT: settling the viewport did NOT create it — the gap is in our pipeline, not the vendor.',
  );
  await app.close();
}

void main();
