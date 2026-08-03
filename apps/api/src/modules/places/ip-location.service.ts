import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
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

/**
 * NON-GLOBALLY-ROUTABLE ADDRESS SPACE — the IANA special-purpose registries,
 * declared once (F362).
 *
 * This used to be a hand-rolled prefix list (`10.`, `192.168.`, a 172.16-31
 * regex, `fc`/`fd`, and exactly one IPv4-mapped form). It missed
 * 169.254.0.0/16 link-local, 100.64.0.0/10 CGNAT, every IPv4-mapped private
 * form except loopback, and upper-case IPv6 — and each miss fails in the
 * EXPENSIVE direction: the address is handed to a paid third-party vendor
 * that cannot possibly geolocate it.
 *
 * "Is this address routable" is an IANA FACT with a canonical definition, not
 * a list to curate by hand. Parsing is `node:net`'s (isIP), the ranges are the
 * registries, and the comparison is numeric on the parsed bytes — so a
 * mapped, abbreviated or upper-case spelling of a private address is the same
 * address, which is the whole point.
 *
 * Sources: RFC 6890 / IANA IPv4 Special-Purpose Address Registry; IANA IPv6
 * Special-Purpose Address Registry.
 */
const IPV4_NON_ROUTABLE: ReadonlyArray<{ cidr: string; why: string }> = [
  { cidr: '0.0.0.0/8', why: '"this network" (RFC 1122)' },
  { cidr: '10.0.0.0/8', why: 'private (RFC 1918)' },
  { cidr: '100.64.0.0/10', why: 'carrier-grade NAT (RFC 6598)' },
  { cidr: '127.0.0.0/8', why: 'loopback' },
  { cidr: '169.254.0.0/16', why: 'link-local (RFC 3927)' },
  { cidr: '172.16.0.0/12', why: 'private (RFC 1918)' },
  { cidr: '192.0.0.0/24', why: 'IETF protocol assignments' },
  { cidr: '192.0.2.0/24', why: 'documentation TEST-NET-1' },
  { cidr: '192.168.0.0/16', why: 'private (RFC 1918)' },
  { cidr: '198.18.0.0/15', why: 'benchmarking (RFC 2544)' },
  { cidr: '198.51.100.0/24', why: 'documentation TEST-NET-2' },
  { cidr: '203.0.113.0/24', why: 'documentation TEST-NET-3' },
  { cidr: '224.0.0.0/4', why: 'multicast' },
  { cidr: '240.0.0.0/4', why: 'reserved, incl. 255.255.255.255 broadcast' },
];

const IPV6_NON_ROUTABLE: ReadonlyArray<{ cidr: string; why: string }> = [
  { cidr: '::/128', why: 'unspecified' },
  { cidr: '::1/128', why: 'loopback' },
  { cidr: 'fc00::/7', why: 'unique local (RFC 4193)' },
  { cidr: 'fe80::/10', why: 'link-local' },
  { cidr: 'ff00::/8', why: 'multicast' },
  { cidr: '2001:db8::/32', why: 'documentation' },
];

/** IPv4 dotted quad → 4 bytes. Caller has already had `net.isIP` say 4. */
function ipv4Bytes(ip: string): number[] {
  return ip.split('.').map((part) => Number(part));
}

/**
 * IPv6 → 16 bytes, including the IPv4-mapped/compatible tail form
 * (`::ffff:10.0.0.1`). Caller has already had `net.isIP` say 6.
 */
function ipv6Bytes(ip: string): number[] {
  let text = ip;
  // A trailing dotted quad is the last four bytes; rewrite it as two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = ipv4Bytes(dotted[1]);
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    text = `${text.slice(0, dotted.index)}${hi}:${lo}`;
  }
  const [head, tail] = text.split('::');
  const headGroups = head ? head.split(':').filter(Boolean) : [];
  const tailGroups =
    tail === undefined ? [] : tail ? tail.split(':').filter(Boolean) : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [
    ...headGroups,
    ...Array<string>(tail === undefined ? 0 : missing).fill('0'),
    ...tailGroups,
  ];
  const bytes: number[] = [];
  for (const group of groups) {
    const value = parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function parseCidr(cidr: string): { bytes: number[]; prefixBits: number } {
  const [address, bits] = cidr.split('/');
  return {
    bytes: address.includes(':') ? ipv6Bytes(address) : ipv4Bytes(address),
    prefixBits: Number(bits),
  };
}

const IPV4_RANGES = IPV4_NON_ROUTABLE.map((entry) => parseCidr(entry.cidr));
const IPV6_RANGES = IPV6_NON_ROUTABLE.map((entry) => parseCidr(entry.cidr));

function withinPrefix(
  bytes: number[],
  range: { bytes: number[]; prefixBits: number },
): boolean {
  let remaining = range.prefixBits;
  for (let i = 0; remaining > 0; i += 1) {
    const take = Math.min(8, remaining);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((bytes[i] & mask) !== (range.bytes[i] & mask)) return false;
    remaining -= take;
  }
  return true;
}

/**
 * TRUE when the address cannot be geolocated by a public vendor: it is
 * private, loopback, link-local, CGNAT, documentation, multicast, reserved —
 * or is not an IP address at all, which is the same answer for our purpose
 * (never spend a vendor call on it).
 */
export const isNonRoutableIp = (raw: string): boolean => {
  const ip = raw.trim();
  const family = isIP(ip);
  if (family === 4) {
    const bytes = ipv4Bytes(ip);
    return IPV4_RANGES.some((range) => withinPrefix(bytes, range));
  }
  if (family === 6) {
    const bytes = ipv6Bytes(ip);
    // An IPv4-mapped address IS that IPv4 address (::ffff:192.168.1.1 is
    // 192.168.1.1) — judge it by the IPv4 registry, not the IPv6 one.
    if (
      bytes.slice(0, 10).every((b) => b === 0) &&
      bytes[10] === 0xff &&
      bytes[11] === 0xff
    ) {
      const mapped = bytes.slice(12);
      return IPV4_RANGES.some((range) => withinPrefix(mapped, range));
    }
    return IPV6_RANGES.some((range) => withinPrefix(bytes, range));
  }
  return true;
};

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
    if (!trimmed || isNonRoutableIp(trimmed)) {
      // Non-routable (private/loopback/CGNAT/link-local/…) or unparseable:
      // no vendor can geolocate it, so no vendor call is made. Let the client
      // use its default.
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
