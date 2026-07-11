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
