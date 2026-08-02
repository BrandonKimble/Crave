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
import { ViewportVerdictService } from './viewport-verdict.service';

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
 * field): the §2.5 law's dominators include every place whose ground covers
 * the view — and covering implies intersecting, so every such place (however
 * over-scale: city, state, country) already intersects the margin box and is
 * already in `places`. placesInView's candidate find is the geometry GiST
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
  constructor(
    private readonly catalog: PlacesCatalogService,
    private readonly viewportVerdict: ViewportVerdictService,
  ) {}

  /**
   * The standalone viewport→place-verdict read (home's header): the SAME
   * §2/§2.5 law composition the polls feed runs (ViewportVerdictService is
   * the one implementation). Nulls when the viewport resolves to no covering
   * place — the client renders its "this area" copy.
   */
  // heavyGeoRead, not default (red team 2026-08-02). That tier was created
  // for exactly this shape and its own comment describes these two endpoints
  // — they were simply never moved onto it. Authenticated, so this is not an
  // exposure fix: it is that 100/min of viewport reads is a Postgres-and-
  // egress bill a human panning a map never approaches.
  @Get('viewport-verdict')
  @RateLimitTier('heavyGeoRead')
  async viewportVerdictRead(
    @Query() query: PlacesInViewQueryDto,
  ): Promise<{ placeId: string | null; placeName: string | null }> {
    if (query.minLat > query.maxLat) {
      // Latitude is not circular — this shape is malformed, not wrap.
      throw new BadRequestException('minLat must be <= maxLat');
    }
    const verdict = await this.viewportVerdict.resolveViewportVerdict(
      query.toBbox(),
    );
    return {
      placeId: verdict.headerPlace?.placeId ?? null,
      placeName: verdict.headerPlace?.name ?? null,
    };
  }

  // See viewport-verdict above: in-view additionally EXPANDS the requested
  // box by the slice margin before serializing every ground it touches.
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
        parentPlaceIds: placeParentIds(place),
        ground,
      })),
    };
  }
}
