import { Controller, Get, Ip } from '@nestjs/common';
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

  // Leg 11 (strips/lists domain): the ListDetail Market chip's option vocabulary
  // (§8.16 — the virtual All list is "sliced by city"). The markets TABLE is the
  // self-provisioning source of truth: search rows carry no per-row market
  // provenance (the executor's marketKey column is an echo of the active-market
  // directive), so options come from the active markets themselves.
  @Get('active')
  listActive() {
    return this.marketRegistry.listActiveMarkets();
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
