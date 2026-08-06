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
  | { kind: 'failed'; reason: string }
  /**
   * Rate admission refused (pool denial or a poisoned window) — try again
   * next settle. Split from 'failed' because the two say different things
   * about the WORLD: 'denied' is our own governor pacing us (expected,
   * quiet), 'failed' is an observation attempt that went wrong (worth a log
   * with a reason). It used to be a thrown string sentinel
   * ('tomtom_pool_denied') that seed-region matched by STRING COMPARISON —
   * the exact pre-P5 shape the union was built to end (red team 2026-08-04).
   */
  | { kind: 'denied' };

/**
 * THE SAME LAW, SAME SHAPE (red team 2026-08-04). This union predates the
 * probe's three-state rederivation and kept the two-state conflation the
 * probe fixed: a malformed body, an id the vendor did not echo, and "the
 * vendor answered and has no polygon" all collapsed into 'miss' — and a miss
 * is REMEMBERED. Three misses PERMANENTLY retire the place from polygon
 * promotion (refused_at, filtered by every drain forever). So three ticks of
 * a caching proxy returning HTML with a 200 wrote "the vendor has no polygon
 * for this geometry" into the catalog as vendor truth — P5 verbatim, on the
 * scarce-draw money path, with a permanent consequence instead of a 30-day
 * TTL.
 *
 * 'miss' now means exactly: the vendor answered, well-formed, echoing the id
 * asked, and models no polygon for it. Everything else about a bad answer is
 * 'failed' — never remembered, never a strike toward retirement.
 */
export type PolygonFetchResult =
  | { kind: 'ok'; geojson: GeoJsonFeatureCollection }
  /** Rate admission refused or window poisoned — try again later. */
  | { kind: 'denied' }
  /** The VENDOR's answer: no polygon exists for this id. Remembered. */
  | { kind: 'miss' }
  /**
   * WE failed to get an answer. Never remembered as ground truth.
   *
   * `scope` is load-bearing and was missing from the first version of this
   * arm (red team 2026-08-04, second pass). A fault is one of two things and
   * the caller must act differently on each:
   *
   *   'systemic' — transport, timeout, a gate that cannot answer. Nothing
   *      behind this row will fare better, so the pass should END.
   *   'row'      — the vendor answered ABOUT THIS ID and the answer was
   *      unusable (an id it did not echo, a payload that is not the
   *      contract). The next row is unaffected, and repeating the ask will
   *      not help, so it must COUNT toward retirement rather than re-draw
   *      forever.
   *
   * Collapsing the two made a single unusable row burn one scarce draw every
   * hour forever AND head-of-line block the entire queue, because the drain
   * reads oldest-first and stopped on it every tick.
   */
  | { kind: 'failed'; reason: string; scope: 'systemic' | 'row' };

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

/**
 * A single-level reverse geocode: "what does the vendor call the LEVEL-CODE
 * entity at this point?" — the question the catalog-vs-vendor audit and the
 * name resolver ask, one row at a time.
 *
 * Exists so those operator scripts stop carrying their own fetch() (red team
 * 2026-08-04): both read TOMTOM_API_KEY themselves and dialled the vendor
 * ungoverned — no pool draw (racing the drain past the vendor QPS), no
 * ledger row (invisible to cost-reconcile, the photoMedia incident's exact
 * shape), and `null` on !res.ok, which printed a 429 as "the vendor models
 * nothing here" — P5 again, in reporting.
 */
export type LevelEntityLookup =
  | {
      kind: 'named';
      /** The vendor's geometry id for the answering entity — the ID-MATCH
       *  gate callers must apply before believing anything else here. */
      geometryId: string | null;
      entityType: string | null;
      /** The RAW address fields, deliberately un-collapsed. A first draft of
       *  this method returned one `name` picked by a fallback chain
       *  (municipality ?? county ?? ...) — the exact scar class
       *  resolve-entity-names documents: the level-appropriate field being
       *  absent silently returned a COARSER entity's name and renamed
       *  Austin's Bouldin Creek to "Austin" (726 rows, 2026-07-28). Which
       *  field is the name at a given level is the CALLER's law. */
      address: Readonly<Record<string, string | undefined>>;
    }
  | { kind: 'empty' }
  | { kind: 'failed'; reason: string }
  | { kind: 'denied' };

export interface TomtomChainProbe {
  probe(anchor: GeoPoint): Promise<TomtomChainProbeResult>;
  /** See LevelEntityLookup. Rides the cheap reverse-geocode pool. */
  lookupLevelEntity(
    anchor: GeoPoint,
    levelCode: string,
  ): Promise<LevelEntityLookup>;
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
