import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { MetricsModule } from '../metrics/metrics.module';
import { MarketsController } from './markets.controller';
import { MarketBootstrapMetricsService } from './market-bootstrap-metrics.service';
import { MarketRegistryService } from './market-registry.service';
import { MarketResolverService } from './market-resolver.service';
import { TomTomBoundaryBootstrapService } from './tomtom-boundary-bootstrap.service';
import { IpLocationService } from './ip-location.service';

/**
 * PHASE C SURVIVOR LEDGER (geo-demand rebuild §15/§21 sweep, 2026-07-19).
 * The markets machinery lost these readers in Phase C: old event/rollup
 * writers, the old demand rollup, poll CREATION (re-keyed to the place
 * catalog; resolveOrEnsureForPollCreation deleted). What remains, and the
 * leg that kills each:
 *  - /markets/resolve: KILLED 2026-07-22 (wave-6 punch item 7) — its last
 *    reader was the perf harness, which now drives bounds-only camera
 *    commands; the endpoint + MarketResolveDto are deleted.
 *    MarketResolverService itself SURVIVES as internal machinery (the
 *    ip-location + registry coverage paths below resolve through it).
 *  - /markets/resolve-ip + IpLocationService: the STARTUP LADDER's
 *    no-device-signal IP→metro rung in MainLaunchCoordinator. Dies when the
 *    launch ladder re-keys its bottom rung to the place catalog.
 *  - /markets/active: ListDetail "Market" chip vocabulary — dies when that
 *    chip re-keys to the place catalog (city slice re-key).
 *  - resolveViewportCoverage: KILLED 2026-07-22 (ENGINE-COVERAGE re-key,
 *    markets extermination leg 2) — search/interpretation coverage is
 *    EngineCoverageService (engine territory grounds ∩ viewport, §5/§2.6);
 *    on-demand queues key off engineId; the autocomplete poll lane scopes
 *    by place ground ∩ viewport; resolveCollectableMarketKey(s) + the whole
 *    viewport-coverage/bootstrap support path deleted with it.
 *  - resolveOrEnsureForLocation + boundary bootstrap: entity market-presence
 *    stamping in enrichment — dies with the §13 territory-as-retrieval-prior
 *    re-key (presence → place geometry).
 *  - resolveMarketKeyForCommunity (unified-processing / batch): mention
 *    market provenance — same §13 re-key.
 *  - SignalsService.bboxFromMarketKey + the polls legacy feed arm: KILLED
 *    2026-07-20 (LEGACY-POLL-EXPIRY leg) — all 94 legacy market-keyed polls
 *    backfilled to catalog places (name+bbox identity match, else smallest
 *    same-state containing place); the feed/dedupe/signal-geo market arms and
 *    the feed dto marketKey are deleted. The attachMarketLabels display join
 *    + the legacy poll envelope died 2026-07-22 (wave-6 punch item 8);
 *    polls.market_key still EXISTS as the comment-highlight gazetteer scope
 *    (entityTextSearch { marketKey }) — it dies with the §13 territory
 *    re-key, which then also drops the column.
 *  - NotificationsService market fallback: KILLED 2026-07-19 (home-place
 *    registration leg) — poll-release targeting is homePlaceId subtree
 *    membership; the dispatch path reads no markets. notification_devices
 *    .city column DROPPED 2026-07-20 (legacy-poll-expiry leg).
 * core_markets itself drops only after ALL of the above are gone.
 *
 * POST-LEG-2 SURVIVOR SET (ratified target: {ip ladder, ListDetail chip,
 * polls gazetteer scope, core_markets}); still-standing §13 remnants beyond
 * that target are resolveOrEnsureForLocation (enrichment presence stamping)
 * and resolveMarketKeyForCommunity / listCommunityMarketTargets (mention
 * market provenance) — both die with the §13 territory-as-retrieval-prior
 * re-key (legs 3-4), which then also drops core_entity_market_presence and
 * polls.market_key.
 */
@Module({
  imports: [HttpModule, PrismaModule, SharedModule, MetricsModule],
  controllers: [MarketsController],
  providers: [
    MarketBootstrapMetricsService,
    MarketResolverService,
    MarketRegistryService,
    TomTomBoundaryBootstrapService,
    IpLocationService,
  ],
  // Only MarketRegistryService has external consumers (search / autocomplete /
  // interpretation / enrichment / reddit-collector); the rest are internal.
  exports: [MarketRegistryService],
})
export class MarketsModule {}
