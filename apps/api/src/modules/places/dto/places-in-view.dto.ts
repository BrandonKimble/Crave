import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import type { GeoBbox } from '@crave-search/shared';

/**
 * GET /places/in-view query — the client's CURRENT view bbox (header
 * subject-store design). WRAP-AWARE: minLng > maxLng is a VALID crossing
 * view (Fiji) and passes through as-is — the shared geo law owns the seam.
 * Latitude, unlike longitude, is not circular, so minLat > maxLat is the
 * one genuinely malformed shape (rejected in the controller — a cross-field
 * rule, not a per-field one).
 */
export class PlacesInViewQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  minLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  minLng!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  maxLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  maxLng!: number;

  toBbox(): GeoBbox {
    return {
      minLat: this.minLat,
      minLng: this.minLng,
      maxLat: this.maxLat,
      maxLng: this.maxLng,
    };
  }
}
