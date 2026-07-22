/**
 * TomtomChainProbe PORT (plans/geo-demand-foundation-rebuild.md §2).
 *
 * The §2 naming reconciler consumes probes through this thin port, NOT the
 * legacy TomTomBoundaryBootstrapService in src/modules/markets/ — the market
 * model is superseded by the places DAG (§20 changelog), and coupling the new
 * catalog to the dying bootstrap would drag the market vocabulary forward.
 *
 * Contract per §2 "sketch mechanics (live-verified)":
 *   - ONE reverse geocode at the anchor returns the FULL chain of names +
 *     stable geometry ids (neighbourhood → borough → city → county → state →
 *     country).
 *   - +1 cheap forward geocode per PREVIOUSLY-UNKNOWN node supplies its bbox
 *     (≤5 per probe, once ever per node globally; all cheap pool).
 *   - An empty chain is a first-class result: "no place here" is a
 *     region-scale observation over `probedBbox` (30d TTL — reconciler side).
 *
 * The real adapter also rides the governed TomTom cheap pool (§14 / §22
 * "TomTom pools governed FIRST — the one ungoverned money"), which is exactly
 * why it is NOT built here: governance wiring belongs to the Phase-B cutover.
 */
import { GeoBbox, GeoPoint } from '@crave-search/shared';
import { PlaceSketchNode } from './places-catalog.service';

/**
 * §16 K4 vendor fact: a probe speaks for ~100 m of ground — the vendor's
 * default reverse-geocode search radius. The adapter sizes `probedBbox` from
 * it, and the reconciler derives its deepest meaningful single-flight cell
 * level from it (below that scale every settle asks the same question).
 */
export const PROBE_SPEAKS_FOR_METERS = 100;

export interface TomtomChainProbeResult {
  /**
   * Reverse-geocode chain, MOST SPECIFIC FIRST (neighbourhood → … → country),
   * each node carrying its bbox when known (forward-geocode step). Empty =
   * "no place here".
   */
  chain: PlaceSketchNode[];
  /**
   * The region the probe speaks for — §2's negative observation is
   * REGION-scale ("probed bbox"), never a bare point.
   */
  probedBbox: GeoBbox;
}

/**
 * §2 promotion-drain vendor outcomes. `denied` = a governed pool said typed
 * not-now (the item stays queued, NOT an attempt); `miss` = the pool admitted
 * and the vendor had no usable answer (a draw was consumed — attempts++).
 * Transport/vendor ERRORS still throw (the drain treats a throw as a
 * consumed-draw systemic fault and ends the pass).
 */
export type GeometryIdResolution =
  | { kind: 'ok'; geometryId: string }
  | { kind: 'denied' }
  | { kind: 'miss' };

export type PolygonFetchResult =
  | { kind: 'ok'; geojson: GeoJsonFeatureCollection }
  | { kind: 'denied' }
  | { kind: 'miss' };

/** GeoJSON FeatureCollection of Polygon/MultiPolygon features (vendor
 *  Additional Data shape, filtered) — persisted verbatim into PostGIS via
 *  ST_GeomFromGeoJSON, so the port never needs to model coordinates. */
export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: string;
    geometry?: { type?: string } | null;
  }>;
}

/** The identity tuple a county-qualified forward geocode needs (§1). */
export type GeometryIdentityNode = Pick<
  PlaceSketchNode,
  'name' | 'county' | 'subdivisionCode' | 'countryCode' | 'providerLevelCode'
>;

export interface TomtomChainProbe {
  probe(anchor: GeoPoint): Promise<TomtomChainProbeResult>;
  /**
   * §2 promotion two-step, step 1 (census-seeded places only): ONE cheap-pool
   * county-qualified forward geocode to learn the place's stable TomTom
   * geometry id (a tomtom-provider place already carries it as
   * providerPlaceId — §1 identity law, live-validated).
   */
  resolveGeometryId(node: GeometryIdentityNode): Promise<GeometryIdResolution>;
  /**
   * §2 promotion step 2: the SCARCE-pool Additional Data polygon fetch
   * (geometry id → Polygon/MultiPolygon FeatureCollection).
   */
  fetchPolygon(geometryId: string): Promise<PolygonFetchResult>;
}

/** Nest injection token for the port. */
export const TOMTOM_CHAIN_PROBE = Symbol('TOMTOM_CHAIN_PROBE');
