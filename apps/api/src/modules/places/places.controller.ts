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
import { PlacesCatalogService } from './places-catalog.service';

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
 * field), restated for the center-anchored law (2026-08-07): the header's
 * candidates are places whose ground contains a view centre inside the
 * margin box — and containing a point inside the box implies intersecting
 * the box, so every such place (however over-scale: city, state, country)
 * already intersects the margin box and is already in `places`. placesInView's candidate find is the geometry GiST
 * (`geometry && arm`, per-arm at the seam — P4a), so no covering node can
 * be dropped; the only rows it excludes are GROUND-LESS places, which are
 * honestly not containers (§2.6). Shipping a second "smallestContaining +
 * ancestors" list would be
 * redundant derivable data; the slice rows are sufficient for the whole
 * header law.
 */
@Controller('places')
@UseGuards(ClerkAuthGuard)
export class PlacesController {
  constructor(private readonly catalog: PlacesCatalogService) {}

  // The slice read: in-view EXPANDS the requested box by the slice margin
  // before serializing every ground it touches. (A standalone
  // GET /places/viewport-verdict route lived here until 2026-08-08 — zero
  // callers ever; the verdict SERVICE is alive through the polls feed and
  // home feed, but the HTTP mouth was dead and four comments claimed
  // otherwise. Round-3 red team.)
  @Get('in-view')
  @RateLimitTier('heavyGeoRead')
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
    const [rows, catalogWatermark] = await Promise.all([
      this.catalog.placesInView(marginBox),
      this.catalog.catalogWatermark(marginBox),
    ]);
    return {
      marginBox,
      catalogWatermark,
      // Lean PlaceLike rows: bbox (index) + identity + DAG edges + the §2.6
      // ONE ground — ALWAYS present (a sketch-grade place ships its 5-point
      // envelope rectangle; outlines are simplified to the MARGIN box span
      // inside placesInView — view-appropriate detail, full geometry never
      // ships). Areas and coverages are DERIVED client-side with the same
      // shared functions — derivable data never ships.
      places: rows.map(({ place, bbox, ground }) => ({
        placeId: place.placeId,
        name: place.name,
        bbox,
        providerLevelCode: place.providerLevelCode,
        ground,
      })),
    };
  }
}
