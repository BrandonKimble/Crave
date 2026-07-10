import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { MarketResolveDto } from './dto/market-resolve.dto';
import { MarketRegistryService } from './market-registry.service';
import { IpLocationService } from './ip-location.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('markets')
export class MarketsController {
  constructor(
    private readonly marketRegistry: MarketRegistryService,
    private readonly ipLocation: IpLocationService,
  ) {}

  @Post('resolve')
  resolve(@Body() dto: MarketResolveDto) {
    return this.marketRegistry.resolveViewportCoverage({
      bounds: dto.bounds ?? null,
      userLocation: dto.userLocation ?? null,
      mode: dto.mode,
      ensureLocalityMarkets: false,
    });
  }

  // Coarse IP→metro for the startup map fallback when the device has no location
  // (permission denied). Returns a city-level coordinate + the containing market,
  // or { resolved: false } so the client uses a neutral national default — never a
  // hardcoded city. Behaves like Google's bottom geolocation rung.
  @Get('resolve-ip')
  async resolveIp(@Ip() ip: string) {
    const result = await this.ipLocation.resolveForIp(ip);
    if (!result) {
      return { resolved: false as const };
    }
    return { resolved: true as const, ...result };
  }
}
