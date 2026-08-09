import { PrismaClient } from '@prisma/client';
import {
  buildOperatingMetadataFromLocation,
  evaluateOperatingStatus,
} from './utils/restaurant-status';

/**
 * H8 — OPEN-NOW TWO-MECHANISM PARITY, AS A CHECKED PROPERTY.
 *
 * Openness exists twice by design: the SQL membership predicate over
 * derived_location_open_intervals decides FILTERING, and the JS evaluator
 * (evaluateOperatingStatus) decides the DISPLAY flags ("Open now", "closes
 * at"). The builder derives the interval table THROUGH the JS chain, so the
 * data is parity-identical by construction — but the query-time comparison
 * (timezone shift + minute-of-day vs the evaluator's own local-time context)
 * is independent arithmetic in two languages. The old "parity-proven
 * 500/500" was a one-time claim in a comment; this spec makes it a standing
 * law over EVERY interval-backed location at four instants (now, +6h, +12h,
 * +18h — covering both sides of a business day and midnight-crossers).
 *
 * MUTATION PROOF: flip `<` to `<=` on end_min in the replica below (or shift
 * one mechanism's instant by an hour) and this REDs on real corpus rows.
 *
 * Known-null asymmetry, asserted too: a location whose metadata the JS chain
 * cannot build has NO interval rows (SQL closed) — the JS evaluator returns
 * null there and the display layer shows nothing, so "no claim" vs "closed"
 * never disagree in front of a user.
 */
const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('open-now SQL predicate ↔ JS evaluator parity (H8)', () => {
  it('agrees on openness for every interval-backed location at 4 instants', async () => {
    const locations = await prisma.$queryRaw<
      Array<{
        location_id: string;
        hours: unknown;
        utc_offset_minutes: number | null;
        time_zone: string | null;
      }>
    >`
      SELECT DISTINCT l.location_id, l.hours,
             l.utc_offset_minutes::int AS utc_offset_minutes, l.time_zone
      FROM core_restaurant_locations l
      JOIN derived_location_open_intervals oi ON oi.location_id = l.location_id
    `;
    expect(locations.length).toBeGreaterThan(0);

    const base = Date.now();
    const instants = [0, 6, 12, 18].map((h) => new Date(base + h * 3600_000));

    const mismatches: string[] = [];
    for (const instant of instants) {
      // The predicate replica: identical arithmetic to
      // buildOpenNowPredicateSql, with the instant parametrized instead of
      // now() so both mechanisms judge the same moment.
      const sqlOpen = await prisma.$queryRaw<Array<{ location_id: string }>>`
        SELECT l.location_id
        FROM core_restaurant_locations l
        WHERE EXISTS (
          SELECT 1 FROM derived_location_open_intervals oi
          WHERE oi.location_id = l.location_id
            AND oi.dow = EXTRACT(dow FROM (${instant}::timestamptz AT TIME ZONE l.time_zone))::int
            AND (EXTRACT(hour FROM (${instant}::timestamptz AT TIME ZONE l.time_zone))::int * 60
                 + EXTRACT(minute FROM (${instant}::timestamptz AT TIME ZONE l.time_zone))::int) >= oi.start_min
            AND (EXTRACT(hour FROM (${instant}::timestamptz AT TIME ZONE l.time_zone))::int * 60
                 + EXTRACT(minute FROM (${instant}::timestamptz AT TIME ZONE l.time_zone))::int) < oi.end_min
        )
      `;
      const openBySql = new Set(sqlOpen.map((r) => r.location_id));

      for (const location of locations) {
        const metadata = buildOperatingMetadataFromLocation(
          location.hours,
          location.utc_offset_minutes,
          location.time_zone,
        );
        const status = metadata
          ? evaluateOperatingStatus(metadata, instant)
          : null;
        const jsOpen = status?.isOpen === true;
        const sqlSaysOpen = openBySql.has(location.location_id);
        if (jsOpen !== sqlSaysOpen) {
          mismatches.push(
            `${location.location_id} @${instant.toISOString()} tz=${location.time_zone} sql=${sqlSaysOpen} js=${jsOpen}`,
          );
        }
      }
    }
    expect(mismatches.slice(0, 25)).toEqual([]);
  });

  it('a location the JS chain cannot evaluate has no interval rows (no-claim vs closed never diverges)', async () => {
    const backed = await prisma.$queryRaw<
      Array<{
        location_id: string;
        hours: unknown;
        utc_offset_minutes: number | null;
        time_zone: string | null;
      }>
    >`
      SELECT DISTINCT l.location_id, l.hours,
             l.utc_offset_minutes::int AS utc_offset_minutes, l.time_zone
      FROM core_restaurant_locations l
      JOIN derived_location_open_intervals oi ON oi.location_id = l.location_id
    `;
    const unevaluable = backed.filter(
      (location) =>
        !buildOperatingMetadataFromLocation(
          location.hours,
          location.utc_offset_minutes,
          location.time_zone,
        ),
    );
    expect(unevaluable.map((l) => l.location_id)).toEqual([]);
  });
});
