import { Controller, Get, Ip } from '@nestjs/common';
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

  @Get('launch-position')
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
    const bounds =
      place &&
      place.bboxMinLat !== null &&
      place.bboxMinLng !== null &&
      place.bboxMaxLat !== null &&
      place.bboxMaxLng !== null
        ? {
            southWest: {
              lat: Number(place.bboxMinLat),
              lng: Number(place.bboxMinLng),
            },
            northEast: {
              lat: Number(place.bboxMaxLat),
              lng: Number(place.bboxMaxLng),
            },
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
