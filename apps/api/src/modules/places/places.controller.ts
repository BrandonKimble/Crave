import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  PLACES_SLICE_MARGIN_FACTOR,
  PlacesInViewSliceResponse,
  expandBboxByFactor,
} from '@crave-search/shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';
import { PlacesInViewQueryDto } from './dto/places-in-view.dto';
import { PlacesCatalogService, placeParentIds } from './places-catalog.service';

/**
 * The catalog SLICE read (header subject-store design, ratified 2026-07-21):
 * the client holds a sliding slice of the place catalog and runs THE SAME
 * subjects law (@crave-search/shared subjects.ts) locally per camera frame;
 * this endpoint is the slice's ONLY mouth. It is a pure READ — it never
 * triggers probes or reconciler work (slices are reads; SETTLES are
 * observations, and those flow through POST /signals/viewport-dwell and
 * search submit).
 *
 * Margin law: the served region is the requested view expanded by
 * PLACES_SLICE_MARGIN_FACTOR (×3 per axis — the re-fetch hysteresis: a pan
 * within the margin needs no network). The response echoes the margin box
 * served, which is the client's cache-validity region.
 *
 * CONTAINING-CHAIN REASONING (why there is no separate "containing chain"
 * field): the §2 containing-fallback needs places whose bbox CONTAINS the
 * view — and containment implies intersection, so every such place (however
 * over-scale: city, state, country) already intersects the margin box and is
 * already in `places`. placesInView's DB prefilter keeps crossing rows and
 * both lat/lng arms over-inclusive, so no containing node can be dropped.
 * The only rows it excludes are bbox-LESS places — and a bbox-less place can
 * never pass bboxContains, so it could never name a containing-fallback
 * header anyway. Shipping a second "smallestContaining + ancestors" list
 * would be redundant derivable data; the slice rows are sufficient for the
 * whole header law.
 */
@Controller('places')
@UseGuards(ClerkAuthGuard)
export class PlacesController {
  constructor(private readonly catalog: PlacesCatalogService) {}

  @Get('in-view')
  @RateLimitTier('default')
  async placesInView(
    @Query() query: PlacesInViewQueryDto,
  ): Promise<PlacesInViewSliceResponse> {
    if (query.minLat > query.maxLat) {
      // Latitude is not circular — this shape is malformed, not wrap.
      throw new BadRequestException('minLat must be <= maxLat');
    }
    const marginBox = expandBboxByFactor(
      query.toBbox(),
      PLACES_SLICE_MARGIN_FACTOR,
    );
    const rows = await this.catalog.placesInView(marginBox);
    return {
      marginBox,
      // Lean PlaceLike rows only: bbox + identity + DAG edges. Areas and
      // coverages are DERIVED client-side with the same shared functions —
      // derivable data never ships.
      places: rows.map(({ place, bbox }) => ({
        placeId: place.placeId,
        name: place.name,
        bbox,
        providerLevelCode: place.providerLevelCode,
        parentPlaceIds: placeParentIds(place),
      })),
    };
  }
}
