import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsLatitude,
  IsLongitude,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ViewportDwellCoordinateDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

/** Wrap-aware map bounds: west = southWest.lng, east = northEast.lng —
 *  west > east means the viewport crosses the antimeridian and is stored
 *  as-is (SignalsService.bboxFromBounds, red-team 3c). */
export class ViewportDwellBoundsDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ViewportDwellCoordinateDto)
  northEast!: ViewportDwellCoordinateDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => ViewportDwellCoordinateDto)
  southWest!: ViewportDwellCoordinateDto;
}

/**
 * §3/§4 viewport_dwell observation (wave-5 F3): SUBJECTLESS settled-viewport
 * attention — browsing IS demand; browse-only towns cold-start their §4
 * structural bootstrap poll through exactly this signal. The client reports
 * a settled viewport that produced NO search submit (a submitted search
 * already records a 'search' act for the same attention — writing dwell
 * there would double-represent one act).
 */
export class RecordViewportDwellDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ViewportDwellBoundsDto)
  bounds!: ViewportDwellBoundsDto;

  /** Settled-dwell duration. API-boundary sanity clamp only (qualifiers are
   *  judged at read, §3): non-negative, capped at 1h — a foregrounded-
   *  overnight tab is not an hour of attention. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  dwellMs!: number;
}
