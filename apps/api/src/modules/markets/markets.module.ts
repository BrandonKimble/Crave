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
 *  - /markets/resolve + /markets/resolve-ip + IpLocationService: after the
 *    HOME-PLACE REGISTRATION leg (2026-07-19: registration → placeAt →
 *    homePlaceId LANDED; notifications no longer read markets) the surviving
 *    mobile readers are the STARTUP LADDER only — resolve-ip is the
 *    no-device-signal IP→metro rung in MainLaunchCoordinator; /markets/resolve
 *    is down to the perf harness (PerfScenarioCoordinator). Dies when the
 *    launch ladder re-keys its bottom rung to the place catalog.
 *  - /markets/active: ListDetail "Market" chip vocabulary — dies when that
 *    chip re-keys to the place catalog (city slice re-key).
 *  - resolveViewportCoverage (search / interpretation / autocomplete):
 *    collectable-coverage gating for on-demand + the mobile coverage notice
 *    — dies when coverage re-keys to ENGINES (source-centric collector
 *    territory), a §10/§11 follow-up.
 *  - resolveOrEnsureForLocation + boundary bootstrap: entity market-presence
 *    stamping in enrichment — dies with the §13 territory-as-retrieval-prior
 *    re-key (presence → place geometry).
 *  - resolveMarketKeyForCommunity (unified-processing / batch): mention
 *    market provenance — same §13 re-key.
 *  - SignalsService.bboxFromMarketKey + the polls legacy feed arm: legacy
 *    market-keyed poll rows — die with the LEGACY-POLL-EXPIRY leg.
 *  - NotificationsService market fallback: KILLED 2026-07-19 (home-place
 *    registration leg) — poll-release targeting is homePlaceId subtree
 *    membership; the dispatch path reads no markets.
 * core_markets itself drops only after ALL of the above are gone.
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
  exports: [
    MarketResolverService,
    MarketRegistryService,
    MarketBootstrapMetricsService,
    TomTomBoundaryBootstrapService,
  ],
})
export class MarketsModule {}
