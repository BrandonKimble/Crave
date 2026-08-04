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

/**
 * THE OBSERVATION TYPE (abstraction re-derivation, 2026-08-01).
 *
 * Reality has THREE states and the old shape could express only two:
 * `{ chain: [] }` meant BOTH "the vendor observed nothing here" and "we
 * failed to observe" — and everything that failed had to throw, which threw
 * away work already paid for. That single conflation produced a whole
 * BUG CLASS, repeatedly: the census "no place here", the missing-country
 * bug, the malformed-200 bug, and the all-anchors-faulted pass. Each was
 * fixed one at a time; the TYPE is why they kept coming back.
 *
 * A FAILURE IS NOT AN OBSERVATION. Only an observation may be remembered,
 * and now only 'empty' carries a region to remember — so recording a fault
 * as ground truth is UNREPRESENTABLE rather than merely discouraged.
 * (PolygonFetchResult below has had this shape all along: ok|denied|miss.)
 *
 * The region a probe SPEAKS FOR is a DISC (P5, 2026-07-27): a reverse
 * geocode answers for a RADIUS around its anchor. Squaring it overclaimed
 * the corners — 4r² vs πr², so ~21% of "asked" ground had never been asked
 * and a real place sitting there could be suppressed from discovery.
 */
export type TomtomChainProbeResult =
  /** The vendor NAMED this ground: the chain, most specific first. */
  | { kind: 'named'; chain: PlaceSketchNode[]; probedRegion: ProbedRegion }
  /** The vendor OBSERVED nothing here — a first-class §2 negative. */
  | { kind: 'empty'; probedRegion: ProbedRegion }
  /** WE failed to observe. Never a memory; never ground truth. */
  | { kind: 'failed'; reason: string };

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
   *
   * `onDrawConsumed` (F350) fires once per ADMITTED vendor draw — including
   * the transport-error path, where the caller never sees a return value.
   * It is where a caller's own spend meter (the campaign envelope) belongs;
   * deriving "a draw happened" from the returned kind is what made the
   * envelope blind to errored draws the pool had already debited.
   */
  fetchPolygon(
    geometryId: string,
    onDrawConsumed?: () => void,
  ): Promise<PolygonFetchResult>;
}

/** Nest injection token for the port. */
export const TOMTOM_CHAIN_PROBE = Symbol('TOMTOM_CHAIN_PROBE');
