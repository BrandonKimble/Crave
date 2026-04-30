import { Body, Controller, Post } from '@nestjs/common';
import { MarketResolveDto } from './dto/market-resolve.dto';
import { MarketRegistryService } from './market-registry.service';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketRegistry: MarketRegistryService) {}

  @Post('resolve')
  resolve(@Body() dto: MarketResolveDto) {
    return this.marketRegistry.resolveViewportCoverage({
      bounds: dto.bounds ?? null,
      userLocation: dto.userLocation ?? null,
      mode: dto.mode,
      ensureLocalFallbackMarkets: false,
    });
  }
}
