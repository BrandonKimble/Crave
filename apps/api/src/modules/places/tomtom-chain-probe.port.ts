/**
 * TomtomChainProbe PORT (plans/geo-demand-foundation-rebuild.md §2).
 *
 * The §2 naming reconciler consumes probes through this thin port (the legacy
 * boundary-bootstrap service died with the market model — §20 changelog; the
 * places DAG is the only geography surface).
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
 * The real adapter (tomtom-chain-probe.adapter.ts) rides the governed
 * TomTom pools (§14 / §22); this port keeps the reconciler vendor-blind.
 */
import { GeoPoint, ProbedRegion } from '@crave-search/shared';
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
   * The region this probe SPEAKS FOR — §2's negative observation is
   * region-scale, never a bare point.
   *
   * A DISC (one-ground charter P5, 2026-07-27): a reverse geocode answers for
   * a RADIUS around its anchor, so that is what we record. It used to be
   * squared into a bbox, which overclaimed the corners — a square of side 2r
   * covers 4r² where the disc covers πr², so ~21% of the "asked" area had
   * never been asked, and a real place sitting there could be permanently
   * suppressed from discovery.
   */
  probedRegion: ProbedRegion;
}

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

// GeometryIdResolution / GeometryIdentityNode DELETED (dockets #1 + #4):
// the census resolve lane is gone; every place carries its geometry id from
// birth under the composite (id, level) identity.

export interface TomtomChainProbe {
  probe(anchor: GeoPoint): Promise<TomtomChainProbeResult>;
  /**
   * §2 promotion step 2: the SCARCE-pool Additional Data polygon fetch
   * (geometry id → Polygon/MultiPolygon FeatureCollection).
   */
  fetchPolygon(geometryId: string): Promise<PolygonFetchResult>;
}

/** Nest injection token for the port. */
export const TOMTOM_CHAIN_PROBE = Symbol('TOMTOM_CHAIN_PROBE');
