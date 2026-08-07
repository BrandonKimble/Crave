/**
 * @script-class: probe
 * @finding: BANKED 2026-08-06 — the header sticks on "Texas" from a ~200-mile
 * view all the way down to a ~55-mile view centred on Austin, then degrades
 * to "this area" before finally saying "Austin". Measured on the live local
 * catalog (half = degrees latitude from centre):
 *
 *   half=1.5  Texas        | Texas 1.000/55.75  US 1.000/787.2
 *   half=0.6  Texas        | Texas 1.000  US 1.000  Williamson 0.188  Travis 0.173
 *   half=0.4  Texas        | Texas 1.000  US 1.000  Travis 0.388  Austin 0.216
 *   half=0.3  «this area»  | Texas 1.000  US 1.000  Travis 0.594  Austin 0.378
 *   half=0.2  Austin       | Travis 0.882  Austin 0.731
 *
 * TWO DEFECTS, both visible above.
 *
 * 1. NO SCALE DISQUALIFIER. resolveHeaderPlace returns the FINEST place
 *    covering >= 2/3 of the view. Texas covers 100% of every view down to
 *    ~0.4 deg, and nothing finer reaches 2/3 until ~0.2 deg, so Texas names
 *    the header across the whole range — while being ~100x the view's area.
 *    isTooBigForView() is exactly this test and subjects.ts records that it
 *    is "NO LONGER a header arm (§2.5 killed it)".
 *
 * 2. A FALSE STRADDLE BETWEEN NESTED PLACES. At half=0.3 the straddle
 *    reservation fires: >=2 of the dominator's CHILDREN each hold >=1/3, so
 *    the verdict is "this area". The two children are Travis (0.594) and
 *    Austin (0.378) — but Austin is INSIDE Travis; they nest, they do not
 *    split the view. The test uses DAG siblinghood as a proxy for
 *    disjointness and the DAG does not encode county->municipality
 *    containment: measured, 19,451 municipalities have a CountrySubdivision
 *    (state) parent and only 14 have a CountrySecondarySubdivision (county)
 *    parent. So essentially every US city is a DAG sibling of its own county.
 *
 * Fixing (2) alone makes the symptom WORSE — with the straddle suppressed the
 * verdict falls through to the finest dominator, i.e. back to "Texas". The two
 * have to move together.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ViewportVerdictService } from '../src/modules/places/viewport-verdict.service';
import { PlacesCatalogService } from '../src/modules/places/places-catalog.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/** Austin city hall-ish. */
const AUSTIN = { lat: 30.2672, lng: -97.7431 };

/** Half-heights in degrees latitude, coarse → fine. */
const HALF_SPANS = [
  3.0, 2.0, 1.5, 1.0, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1, 0.05, 0.02,
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const verdicts = app.get(ViewportVerdictService);
  const catalog = app.get(PlacesCatalogService);

  for (const half of HALF_SPANS) {
    const view = {
      minLat: AUSTIN.lat - half,
      maxLat: AUSTIN.lat + half,
      minLng: AUSTIN.lng - half,
      maxLng: AUSTIN.lng + half,
    };
    const verdict = await verdicts.resolveViewportVerdict(view);
    const inView = await catalog.placesInView(view);
    const top = [...inView]
      .sort((a, b) => b.coverageOfView - a.coverageOfView)
      .slice(0, 5)
      .map(
        (e) =>
          `${e.place.name}(cov=${e.coverageOfView.toFixed(3)},area=${e.placeArea.toFixed(4)})`,
      )
      .join('  ');
    console.log(
      `half=${String(half).padStart(5)}  HEADER=${(
        verdict.headerPlace?.name ?? '«this area»'
      ).padEnd(24)} | ${top}`,
    );
  }
  await app.close();
}

void main();
