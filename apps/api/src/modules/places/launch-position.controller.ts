import { Controller, Get, Ip } from '@nestjs/common';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { IpLocationService } from './ip-location.service';
import { PlacesCatalogService } from './places-catalog.service';

/**
 * The startup ladder's no-device-signal rung (markets extermination leg 3 —
 * replaces GET /markets/resolve-ip): coarse IP→coords, plus the CATALOG's
 * smallest ground-containing place's bbox as the camera envelope. The client
 * consumes coords/bounds only — no market (or place) shape crosses the wire
 * beyond the envelope. Public + paywall-exempt like the launch rung it
 * replaces: it runs before the user can possibly be entitled.
 */
@AllowUnentitled()
@Controller('places')
export class LaunchPositionController {
  constructor(
    private readonly ipLocation: IpLocationService,
    private readonly catalog: PlacesCatalogService,
  ) {}

  // TIERED (audit 2026-08-01): every call makes an outbound ipapi.co request
  // with no cache — an anonymous, untiered way to burn a third-party quota
  // (and, past the free tier, money) and to hold a socket per request.
  @Get('launch-position')
  @RateLimitTier('heavyGeoRead')
  async launchPosition(@Ip() ip: string) {
    const located = await this.ipLocation.resolveForIp(ip);
    if (!located) {
      return { resolved: false as const };
    }

    // Camera envelope: the smallest catalog place whose GROUND contains the
    // IP coordinate (§2.5(c)/§2.6 containment read). No container → coords
    // only; the client keeps its single-locale default zoom.
    const place = await this.catalog.smallestContaining({
      lat: located.coordinate.lat,
      lng: located.coordinate.lng,
    });
    // P4 (2026-07-30): the camera envelope is DERIVED from the ground at the
    // moment of use — a "camera fit" is charter-legitimate rectangle #2 and
    // never justified a stored column.
    // Wrap guard (2026-07-26, unchanged in meaning): a seam-straddling place
    // derives minLng > maxLng, which as a plain camera box is INVERTED (the
    // client would derive a ~360°-wide zoom). Such a place ships no bounds —
    // the client keeps its default zoom, the same honest absence a
    // groundless place produces.
    const derived = place
      ? (await this.catalog.derivedBboxes([place.placeId])).get(place.placeId)
      : undefined;
    const bounds =
      derived && derived.minLng <= derived.maxLng
        ? {
            southWest: { lat: derived.minLat, lng: derived.minLng },
            northEast: { lat: derived.maxLat, lng: derived.maxLng },
          }
        : null;

    return {
      resolved: true as const,
      coordinate: located.coordinate,
      city: located.city,
      region: located.region,
      bounds,
    };
  }
}
