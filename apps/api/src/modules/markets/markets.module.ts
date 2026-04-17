import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { MarketsController } from './markets.controller';
import { MarketRegistryService } from './market-registry.service';
import { MarketResolverService } from './market-resolver.service';

@Module({
  imports: [PrismaModule, SharedModule],
  controllers: [MarketsController],
  providers: [MarketResolverService, MarketRegistryService],
  exports: [MarketResolverService, MarketRegistryService],
})
export class MarketsModule {}
