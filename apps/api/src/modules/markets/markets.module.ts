import { Module } from '@nestjs/common';

/**
 * PHASE C SURVIVOR LEDGER (geo-demand rebuild §15/§21 sweep; leg-3 close
 * 2026-07-22). POST-LEG-3 STATE: **core_markets is writer-less and
 * reader-less — leg 4 performs the physical census + drop.** Every service
 * this module ever held is deleted; the module survives only as this ledger
 * until leg 4 removes it from app.module.
 *
 * Final dispositions (leg 3, markets extermination):
 *  - /markets/resolve: KILLED 2026-07-22 (wave-6 punch item 7).
 *  - resolveViewportCoverage: KILLED 2026-07-22 (ENGINE-COVERAGE re-key,
 *    leg 2) — coverage is EngineCoverageService (engine territory grounds).
 *  - /markets/active + listActiveMarkets: KILLED leg 3 — the ListDetail chip
 *    re-keyed to "cities present in the list" (POST
 *    /favorites/lists/:listId/cities — municipality places whose ground
 *    covers the list's restaurant locations; slice filter = place ground
 *    containment in the results assembler; dto.marketKey → dto.cityPlaceId).
 *  - /markets/resolve-ip + the market half of IpLocationService: KILLED
 *    leg 3 — the launch ladder rung is GET /places/launch-position
 *    (IpLocationService MOVED to modules/places, geolocation only; camera
 *    envelope = smallestContaining place bbox; no market shape on the wire).
 *  - polls gazetteer scope (entityTextSearch { marketKey }): KILLED leg 3 —
 *    scanning scopes by the ENGINE covering the poll's place (member grounds
 *    cover the place centroid; uncovered ⇒ global). polls.market_key and
 *    poll_topics.market_key are now reader-less AND writer-less → leg-4
 *    column drops.
 *  - resolveOrEnsureForLocation + boundary bootstrap (presence stamping):
 *    KILLED leg 3 — §13 presence is GEOMETRIC (locations vs place grounds,
 *    derived at read). No presence writer or reader remains anywhere →
 *    core_entity_market_presence is leg-4 drop material.
 *  - resolveMarketKeyForCommunity / listCommunityMarketTargets (mention
 *    provenance): KILLED leg 3 — provenance keys off SOURCES (§5):
 *    unified-processing resolves the community's source row
 *    (collector-source-registry findRedditSourceByHandle) and uses its
 *    engineId for recall bias and its anchorPlaceId for enrichment bias
 *    (place centroid + bbox-derived radius). Entity resolution is engine-
 *    scoped (T1/alias GLOBAL per §13; recall geo-biased by engine territory).
 *  - MarketRegistryService / MarketResolverService /
 *    TomTomBoundaryBootstrapService / MarketBootstrapMetricsService /
 *    market-geo.util / markets.controller: DELETED leg 3 (caller-less).
 *  - SignalsService.bboxFromMarketKey + polls legacy feed arm: KILLED
 *    2026-07-20 (legacy-poll expiry). NotificationsService market fallback:
 *    KILLED 2026-07-19 (home-place registration).
 *
 * LEG-4 CENSUS (dead physical schema left for the drop leg):
 *  - core_markets (table) — zero writers/readers.
 *  - core_entity_market_presence (table) — zero writers/readers.
 *  - polls.market_key, poll_topics.market_key (columns) — zero readers,
 *    zero writers.
 *  - geo_boundary_features / market_bootstrap_events (bootstrap tables) —
 *    writers deleted with the bootstrap service; census with the rest.
 *  - collection_communities.market_key (column) — last reader
 *    (resolveMarketKeyForCommunity) deleted.
 */
@Module({})
export class MarketsModule {}
