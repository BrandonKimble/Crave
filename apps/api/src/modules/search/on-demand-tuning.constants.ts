/**
 * On-demand keyword-collection trigger threshold, shared by the three
 * consumers that must agree on it (SearchService trigger, keyword-search
 * scheduler priority, keyword-slice low-result severity).
 *
 * 2026-07-11 config fold-in: formerly env `SEARCH_ON_DEMAND_MIN_RESULTS`.
 * The .env value production behavior has been using is 1 (trigger on-demand
 * collection only when a food query returns ZERO restaurants); the scattered
 * code fallbacks (25 / defaultPageSize) were never in effect and disagreed
 * with each other. Reconciled in favor of the .env value.
 */
export const ON_DEMAND_MIN_RESULTS = 1;

/**
 * On-demand collection is market-wide, so a viewport must be at least
 * ~neighborhood-sized before its emptiness says anything about the market.
 * The 0.85 tolerance is hysteresis: a viewport a hair under the 2-mile floor
 * shouldn't flap the trigger. Formerly duplicated verbatim in
 * search.service.ts and search-query-interpretation.service.ts (a silent
 * behavior fork if one drifted) — extracted 2026-07-11 (value census).
 */
export const ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES = 2;
export const ON_DEMAND_VIEWPORT_TOLERANCE = 0.85;
export const ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES =
  ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES * ON_DEMAND_VIEWPORT_TOLERANCE;
