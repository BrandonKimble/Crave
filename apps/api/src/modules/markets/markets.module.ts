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
