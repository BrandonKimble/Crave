/**
 * @script-class: probe
 * @finding: see BANKED FINDINGS at the bottom of this header.
 *
 * ATTRIBUTION + DESIGN VALIDATION for the §2.5 map header.
 *
 * Runs the REAL ViewportVerdictService against the REAL catalog across a zoom
 * ladder, so today's law is never reimplemented here. Alongside it, evaluates
 * the CANDIDATE law being considered:
 *
 *   header = the finest place BY MEASURED GROUND AREA whose polygon contains
 *            the view's centre and which covers >= T of the view.
 *
 * The candidate law deliberately uses no parent DAG and no vendor level code.
 * Both are unfit, and this probe is where that was established:
 *   - the DAG records 19,451 municipalities under their STATE and only 14
 *     under their county, so Austin and Travis read as siblings;
 *   - the level ladder INVERTS between cities: Austin is a Municipality
 *     (1,441 km2) inside a CountrySecondarySubdivision (2,654 km2), while
 *     Manhattan is a CountrySecondarySubdivision (83 km2) inside the
 *     Municipality of New York (986 km2).
 *
 * ── BANKED FINDINGS ──────────────────────────────────────────────────────
 *
 * TODAY'S LAW, Austin (half = degrees latitude from centre):
 *   half=1.5  Texas        | Texas 1.000  US 1.000
 *   half=0.6  Texas        | Texas 1.000  Travis 0.173  Austin 0.096
 *   half=0.4  Texas        | Travis 0.388  Austin 0.216
 *   half=0.3  «this area»  | Travis 0.594  Austin 0.378
 *   half=0.2  Austin       | Travis 0.882  Austin 0.731
 *
 * Two defects. (1) NO SCALE DISQUALIFIER: resolveHeaderPlace returns the
 * finest place covering >= 2/3 of the view; Texas covers 100% of every view
 * down to ~0.4 deg while being ~100x its area, so it names the header from a
 * ~200-mile view to a ~55-mile one. (2) FALSE STRADDLE BETWEEN NESTED PLACES:
 * at half=0.3, Travis (0.594) and Austin (0.378) are both DAG children of
 * Texas and each hold >= 1/3, so the verdict degrades to "this area" — but
 * Austin is INSIDE Travis; they nest, they do not split the view. Fixing (2)
 * alone makes it worse: the fall-through lands back on "Texas".
 *
 * THE CANDIDATE LAW, VALIDATED COUNTRY-TO-BLOCK (2026-08-06).
 *
 * Austin — the ladder is exactly what a user expects, and both defects go:
 *   2760mi United States · 414mi Texas · 55mi Austin · 3mi Downtown Austin
 * (today's law says Texas at 55mi and «this area» at 41mi.)
 *
 * New York — the model is RIGHT and the OUTPUT IS STILL WRONG, for two
 * reasons that are not the header law and cannot be fixed inside it:
 *
 *   1. WEST VILLAGE IS NOT IN THE CATALOG. The centre chain at the West
 *      Village has FOUR rungs and no neighbourhood. Measured: 42
 *      Neighbourhood places exist in the entire catalog, 27 of them within
 *      20 km of Austin, and ZERO within 20 km of the West Village. No header
 *      law can name ground that was never collected. (Same root as the
 *      demand-blind NY collection finding.)
 *
 *   2. THREE RUNGS ARE ALL SPELLED "New York" — the CountrySecondarySubdivision
 *      (Manhattan, 83 km2), the Municipality (NYC, 986 km2) and the
 *      CountrySubdivision (the state, 136,129 km2). The candidate law
 *      transitions correctly between all three, and the header reads
 *      "New York" unchanged from a 414-mile view down to 1 mile. Three
 *      correct transitions, one visible string — the user's original
 *      complaint reproduced by a different cause.
 *
 * Worth noting how bad TODAY's law is in NYC: «this area» at most zooms and
 * "United States" at 55-138 miles — naming the country while the viewer looks
 * at a 55-mile view of New York City. The candidate law is a large
 * improvement there even with the ambiguity unresolved.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ViewportVerdictService } from '../src/modules/places/viewport-verdict.service';
import { PlacesCatalogService } from '../src/modules/places/places-catalog.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/** The coverage-of-view a place must hold to be allowed to name the header. */
const T = 0.2;

type Site = { label: string; lat: number; lng: number };

const SITES: Site[] = [
  { label: 'West Village, NYC', lat: 40.7358, lng: -74.0036 },
  { label: 'Austin, TX', lat: 30.2672, lng: -97.7431 },
];

/**
 * Country-scale down to a few blocks. Degrees of latitude from centre, so
 * half=20 is continental and half=0.004 is roughly one block.
 */
const HALF_SPANS = [
  20, 10, 5, 3, 2, 1, 0.6, 0.4, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01, 0.004,
];

/** Rough miles across, for reading the ladder as a human. */
const milesAcross = (half: number): string =>
  `${Math.round(half * 2 * 69)}mi`.padStart(6);

async function chainAt(
  prisma: PrismaService,
  site: Site,
): Promise<Array<{ placeId: string; name: string; km2: number }>> {
  return prisma.$queryRaw<
    Array<{ placeId: string; name: string; km2: number }>
  >(
    Prisma.sql`
      SELECT p.place_id AS "placeId",
             p.name,
             ST_Area(g.geometry::geography) / 1e6 AS km2
      FROM places p
      JOIN place_geometries g ON g.place_id = p.place_id
      WHERE ST_Covers(
        g.geometry,
        ST_SetSRID(ST_MakePoint(${site.lng}::double precision, ${site.lat}::double precision), 4326)
      )
      ORDER BY km2 ASC
    `,
  );
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const verdicts = app.get(ViewportVerdictService);
  const catalog = app.get(PlacesCatalogService);
  const prisma = app.get(PrismaService);

  for (const site of SITES) {
    const chain = await chainAt(prisma, site);
    console.log(`\n═══ ${site.label} ═══`);
    console.log(
      `centre chain (finest first): ${chain
        .map((c) => `${c.name}[${Math.round(c.km2)}km2]`)
        .join(' ⊂ ')}`,
    );
    console.log(
      `${'across'.padStart(6)}  ${'TODAY'.padEnd(20)}  ${`PROPOSED (T=${T})`.padEnd(20)}  chain coverage`,
    );

    for (const half of HALF_SPANS) {
      const view = {
        minLat: site.lat - half,
        maxLat: site.lat + half,
        minLng: site.lng - half,
        maxLng: site.lng + half,
      };
      const verdict = await verdicts.resolveViewportVerdict(view);
      const inView = await catalog.placesInView(view);
      const byId = new Map(inView.map((e) => [e.place.placeId, e]));

      // The candidate law: finest-by-area member of the centre chain that
      // holds at least T of the view. Chain is already area-ascending.
      let proposed = '«this area»';
      const parts: string[] = [];
      for (const link of chain) {
        const cov = byId.get(link.placeId)?.coverageOfView ?? 0;
        parts.push(`${link.name} ${cov.toFixed(3)}`);
        if (proposed === '«this area»' && cov >= T) proposed = link.name;
      }
      console.log(
        `${milesAcross(half)}  ${(verdict.headerPlace?.name ?? '«this area»').padEnd(20)}  ${proposed.padEnd(20)}  ${parts.join('  ')}`,
      );
    }
  }
  await app.close();
}

void main();
