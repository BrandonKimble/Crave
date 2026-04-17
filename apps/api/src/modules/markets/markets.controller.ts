import { Body, Controller, Post } from '@nestjs/common';
import { MarketResolveDto } from './dto/market-resolve.dto';
import { MarketResolverService } from './market-resolver.service';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketResolver: MarketResolverService) {}

  @Post('resolve')
  resolve(@Body() dto: MarketResolveDto) {
    return this.marketResolver.resolve({
      bounds: dto.bounds ?? null,
      userLocation: dto.userLocation ?? null,
      mode: dto.mode,
    });
  }
}
