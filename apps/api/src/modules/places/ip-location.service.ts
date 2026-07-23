import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../../shared';

type Coordinate = { lat: number; lng: number };

export type IpLocationResult = {
  // Coarse coordinate derived from the client IP (city-level). This is the
  // adaptive startup center for the no-device-location fallback.
  coordinate: Coordinate;
  // City/region labels (diagnostic / optional display).
  city: string | null;
  region: string | null;
  source: 'ip';
};

type IpApiResponse = {
  latitude?: unknown;
  longitude?: unknown;
  city?: unknown;
  region?: unknown;
  error?: unknown;
  reason?: unknown;
};

const isPrivateOrLoopbackIp = (ip: string): boolean =>
  ip === '127.0.0.1' ||
  ip === '::1' ||
  ip.startsWith('10.') ||
  ip.startsWith('192.168.') ||
  ip.startsWith('::ffff:127.') ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  ip.startsWith('fc') ||
  ip.startsWith('fd');

const finiteNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

@Injectable()
export class IpLocationService {
  private readonly logger: LoggerService;
  // ipapi.co: free, no API key, returns city-level lat/lng. Used ONLY on the rare
  // permission-denied cold-start fallback, so volume is tiny and the free tier is
  // ample. If it fails we return null and the client falls through to a neutral
  // national default — never a hardcoded city.
  private readonly providerBaseUrl = 'https://ipapi.co';
  private readonly requestTimeoutMs = 2_500;

  constructor(
    private readonly httpService: HttpService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('IpLocationService');
  }

  async resolveForIp(
    ip: string | null | undefined,
  ): Promise<IpLocationResult | null> {
    const trimmed = (ip ?? '').trim();
    if (!trimmed || isPrivateOrLoopbackIp(trimmed)) {
      // Local/dev/private IPs can't be geolocated; let the client use its default.
      return null;
    }

    const coordinate = await this.lookupCoordinate(trimmed);
    if (!coordinate) {
      return null;
    }

    return { ...coordinate, source: 'ip' };
  }

  private async lookupCoordinate(
    ip: string,
  ): Promise<Omit<IpLocationResult, 'source'> | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<IpApiResponse>(
          `${this.providerBaseUrl}/${ip}/json/`,
          {
            timeout: this.requestTimeoutMs,
          },
        ),
      );
      const data = response.data;
      if (data?.error) {
        this.logger.debug('IP geolocation provider error', {
          reason: String(data.reason),
        });
        return null;
      }
      const lat = finiteNumber(data?.latitude);
      const lng = finiteNumber(data?.longitude);
      if (lat == null || lng == null) {
        return null;
      }
      return {
        coordinate: { lat, lng },
        city: typeof data?.city === 'string' ? data.city : null,
        region: typeof data?.region === 'string' ? data.region : null,
      };
    } catch (error) {
      this.logger.warn('IP geolocation lookup failed', {
        detail: String(error),
      });
      return null;
    }
  }
}
