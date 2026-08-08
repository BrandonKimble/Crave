/**
 * WHAT WE EXPECT TO SPEND, PER VENDOR, PER MONTH — the number the nightly
 * comparator measures reality against (D149, owner-approved 2026-08-07).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 * Spend governance used to work by REFUSING: a pool said no and the work
 * stopped — sometimes the user's work. The owner's ruling replaced that with
 * watching: everyday spend is compared against what we expect and the owner
 * is TOLD when reality diverges, while the work keeps flowing. This file is
 * the "what we expect" half. Without it, "$412 spent so far this month" is a
 * number with nothing to mean.
 *
 * ── WHY A CHECKED-IN FILE AND NOT A TABLE ───────────────────────────────
 * These are owner decisions about a handful of vendors, changed a few times a
 * year. A table would need a migration, an admin surface to edit it, and a
 * seeding story — and would make the current values invisible in code review.
 * A constants file is versioned, diffable, and the value is right here where
 * anyone reasoning about spend will read it.
 *
 * ── THE ONE RULE FOR EDITING ────────────────────────────────────────────
 * Every number below is a MEASUREMENT or an owner decision, and says which,
 * with a date and a source. Never write a plausible-looking number here: the
 * comparator's alerts are only as meaningful as these are honest, and a
 * guessed expectation produces either a permanent false alarm (which trains
 * the owner to ignore the emails) or permanent silence.
 */

/** Vendors the comparator watches. These are the `service` values written to
 *  api_usage_ledger (`api_usage_events.service`), so the join is exact — not
 *  a display-name mapping that can drift. */
export type WatchedVendor = 'gemini' | 'google_places' | 'tomtom';

export interface VendorExpectation {
  /** Expected spend in whole US dollars for a full month of NORMAL
   *  operation. Prorated by day-of-month before comparison. */
  expectedMonthlyUsd: number;
}

export const EXPECTED_MONTHLY_SPEND_USD: Record<
  WatchedVendor,
  VendorExpectation
> = {
  /**
   * MEASURED — $155/month steady-state Gemini spend.
   *
   * Source: the 2026-08-02 capacity re-derivation, which measured the
   * steady-state monthly LLM bill from api_usage_ledger priced through
   * gemini-pricing.ts (and cross-checked against the BigQuery billing
   * export, which reads ~1.7x the ledger — see CLAUDE.md's cost-truth note;
   * this figure is the LEDGER number, and the comparator reads the ledger,
   * so both sides of the comparison are in the same currency).
   *
   * This EXCLUDES one-off events: a city onboarding or a full re-extraction
   * is a deliberate, owner-initiated burst, and the comparator is expected to
   * fire during one. That is correct behavior — the owner knows he started it
   * and the alert is the receipt.
   */
  gemini: { expectedMonthlyUsd: 155 },

  /**
   * MEASURED — ~$100/month steady-state Google Places spend.
   *
   * Source: the 2026-08-02/08-03 ledger derivations behind the per-operation
   * rate ceilings in configuration.ts (45-day window, steady-state days
   * excluding the 07-30/31 full-city onboarding burst), priced through
   * vendor-pricing.ts's per-SKU rates.
   *
   * Places is the vendor that does NOT converge: TomTom cost is per place and
   * a place is outlined once, while Places is driven by user text, which is
   * infinite. So this expectation is the one most likely to need honest
   * re-measurement as usage grows — re-derive it from api_usage_ledger, don't
   * nudge it to silence an alert.
   */
  google_places: { expectedMonthlyUsd: 100 },

  /**
   * MEASURED — $76 for the July 2026 month.
   *
   * Source: 23,384 scarce draws recorded in pool_window_consumption for July
   * 2026, priced at the vendor-verified rate (€3.00/1k polygons) — the same
   * measurement that sized tomtom.monthlySpend's backstop in
   * governance.service.ts.
   *
   * Expected to TREND DOWN, not up: a polygon is fetched once per place and
   * cached forever, so this asymptotes as the catalog fills in. A month that
   * doubles it means either a new city or a cache that stopped working — both
   * worth an email.
   */
  tomtom: { expectedMonthlyUsd: 76 },
};

/** Every vendor the comparator iterates. Derived from the record so adding a
 *  vendor above is the only edit needed. */
export const WATCHED_VENDORS = Object.keys(
  EXPECTED_MONTHLY_SPEND_USD,
) as WatchedVendor[];

/**
 * The share of a vendor's monthly expectation that "should" have been spent
 * by the given moment, assuming an even burn.
 *
 * Even proration is deliberately CRUDE and deliberately stated as such: real
 * spend here is bursty (batch reloads, 14-day source cadences), so the day-3
 * prorated figure is noisy. That is why the alert thresholds are 1x and 2x
 * rather than something tight — this is a "something is wrong" detector, not
 * a forecast. The `dayOfMonth` floor of 1 keeps the first day from dividing
 * the expectation down to nothing and screaming at the month's first dollar.
 */
export function proratedExpectedUsd(
  expectedMonthlyUsd: number,
  now: Date,
): number {
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const dayOfMonth = Math.max(1, now.getUTCDate());
  return (expectedMonthlyUsd * dayOfMonth) / daysInMonth;
}
