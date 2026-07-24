/**
 * On-demand keyword-collection trigger threshold, shared by the three
 * consumers that must agree on it (SearchService trigger, keyword-search
 * scheduler priority, keyword-slice low-result severity).
 *
 * §16 K6 (definitional — the smallest honest count): trigger on-demand
 * collection exactly when a food query returns ZERO restaurants — "the app
 * had nothing to show" is the definition of an unmet ask, not a threshold.
 * Any value > 1 would be an invented quality bar. (2026-07-11 fold-in:
 * formerly env SEARCH_ON_DEMAND_MIN_RESULTS; scattered 25/pageSize
 * fallbacks were never in effect.)
 */
export const ON_DEMAND_MIN_RESULTS = 1;

/**
 * §16 K1 (owner sentences): "a viewport must be at least ~neighborhood-
 * sized (2 miles) before its emptiness says anything about the area," and
 * "a hair under the floor must not flap the trigger" (0.85 hysteresis).
 * Falsifiable product sentences, not measurements — the eye/usage may
 * re-ratify them. Formerly duplicated verbatim in search.service.ts and
 * search-query-interpretation.service.ts — extracted 2026-07-11.
 */
export const ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES = 2;
export const ON_DEMAND_VIEWPORT_TOLERANCE = 0.85;
export const ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES =
  ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES * ON_DEMAND_VIEWPORT_TOLERANCE;
