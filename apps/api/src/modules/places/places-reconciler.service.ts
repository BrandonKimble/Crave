/**
 * §2 background naming reconciler (plans/geo-demand-foundation-rebuild.md §2).
 *
 * Per settled viewport (background; reads NEVER wait):
 *   1. Stored places / negative ("no place here") observations answer the
 *      anchors → done, zero spend.
 *   2. Probe budget: ≤ ⌊1/ATTENTION_FRACTION⌋ = 3 anchors per view (center +
 *      largest-uncovered-region candidates) — subjects.probeAnchors.
 *   3. EVERY probe result is written: a returned chain is sketched in full
 *      (all nodes — commensurability is a READ-time judgment and never gates
 *      observation, §2 "observe every probe"); an empty chain becomes a
 *      REGION-scale negative observation (probed bbox, 30d TTL).
 *
 * Discipline: single-flight per ~cell (the §2 batch key), idempotent upserts
 * (catalog side), and a viral stampede self-extinguishes — the first probe
 * sketches, later resolves hit the catalog.
 *
 * §21.2 disposition: this reconciler is destined to be a registered PACER
 * LANE (dueAt = viewport settle, K1 lateness tolerance) riding the one draw
 * ledger. The pacer/governor registry is not built yet; until then
 * noteViewport() is the enqueue seam — its contract (void return, async work,
 * never blocks, never throws) is exactly the shape the pacer lane will absorb.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  GeoBbox,
  METERS_PER_DEGREE_LAT,
  MIN_COS_LAT,
  bboxArea,
  bboxLngSpan,
  ProbedRegion,
  probedRegionAnswersAnchor,
  probeAnchors,
  MAX_PROBE_ANCHORS,
  viewCenter,
} from '@crave-search/shared';
import { PlacesCatalogService } from './places-catalog.service';
import {
  PROBE_SPEAKS_FOR_METERS,
  TOMTOM_CHAIN_PROBE,
  TomtomChainProbe,
  TomtomChainProbeResult,
} from './tomtom-chain-probe.port';

/** Raw row shape of the view-scoped asked-region read. */
type ProbedRegionRow = {
  kind: string;
  center_lat: unknown;
  center_lng: unknown;
  radius_meters: unknown;
  min_lat: unknown;
  min_lng: unknown;
  max_lat: unknown;
  max_lng: unknown;
};

/** §2: region observations live 30 days. */
export const NEGATIVE_OBSERVATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** §16 K3 operational cadence: the TTL prune is housekeeping, not a read —
 *  once an hour per process is plenty for a 30-day TTL. */
const PRUNE_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Asked-ground memory (§2's "negative region cache", generalized — red-team
 * 7aaa66d9 finding 2): TWO kinds of region observation share this store and
 * TTL. (a) "no place here" — an empty chain's probedBbox. (b) "already asked
 * at this scale" — after a pass that probed, the VIEW region itself: the
 * vendor's finest rung there is now sketched, and when that rung is
 * over-scale for the view (the near-universal US street-zoom case) NOTHING
 * finer can ever be learned — without this memory the same 3 anchors
 * re-spend governed draws on every future settle of the same ground,
 * forever. The scale gate (probedRegionAnswersAnchor) still applies on read, so an
 * asked region answers commensurate-or-coarser future views and a genuinely
 * finer zoom re-asks once per scale band per TTL.
 */
// AskedRegion (the in-memory shape) DIED with docket #7: the memory now
// lives in the probed_regions table — durable across restarts and shared
// across processes. The judgment stays in TS; the table is the memory only.

/**
 * §16 DERIVED cell-level ceiling: the deepest meaningful single-flight cell
 * is where the cell's lng quantum (360/2^level degrees ≈ meters at the
 * equator) shrinks to the ~100 m a probe already speaks for (K4 vendor fact,
 * PROBE_SPEAKS_FOR_METERS) — below that scale every settle is asking the
 * same ground the same question. 360° × 111320 m/° ÷ 100 m → log2 ≈ 18.6 →
 * 19.
 */
export const MAX_CELL_LEVEL = Math.ceil(
  Math.log2((360 * METERS_PER_DEGREE_LAT) / PROBE_SPEAKS_FOR_METERS),
);

/**
 * §2 single-flight cell key: quantize the view's center on a grid sized by
 * the view's own span (wrap-aware), bucketed by power-of-two "zoom level" so
 * nearby settles at the same scale coalesce while different zooms stay
 * distinct. A zero-span (degenerate) view falls to the deepest level via the
 * MAX_CELL_LEVEL cap — no span floor needed.
 */
/**
 * THE MEMORY'S IDENTITY, per region kind (red-team of disease B, same day):
 * a region is keyed by the ground IT speaks for, at the scale it speaks at.
 *
 * The first cut keyed EVERY region by the VIEW's cell, which was wrong for
 * discs: a pass probes up to MAX_PROBE_ANCHORS anchors, so two anchors of
 * one view both returning "nothing here" wrote the same (cell,'disc') key
 * and the second OVERWROTE the first — a negative observation silently
 * lost, and the discarded anchor re-probed on every future settle. A disc
 * speaks for ~100m around ITS OWN anchor, and MAX_CELL_LEVEL is derived to
 * be exactly that scale, so that is its identity. A box speaks for the view
 * it exhausted, so the view's cell is its identity.
 */
export function regionCellKey(region: ProbedRegion): string {
  if (region.kind === 'box') {
    return viewportCellKey(region.bbox);
  }
  if (region.kind === 'ground') {
    // Ground regions are catalog-derived, judged live from placesInView on
    // every pass — they are never PERSISTED to probed_regions, so they
    // never need a storage identity. Reaching here is a programming error.
    throw new Error('ground regions are not persisted — no cell key exists');
  }
  const quantum = 360 / 2 ** MAX_CELL_LEVEL;
  const cellLat = Math.floor(region.center.lat / quantum);
  const cellLng = Math.floor(region.center.lng / quantum);
  return `${MAX_CELL_LEVEL}:${cellLat}:${cellLng}`;
}

export function viewportCellKey(view: GeoBbox): string {
  const lngSpan = bboxLngSpan(view);
  const level = Math.max(
    0,
    Math.min(MAX_CELL_LEVEL, Math.round(Math.log2(360 / lngSpan))),
  );
  const quantum = 360 / 2 ** level;
  const center = viewCenter(view);
  const cellLat = Math.floor(center.lat / quantum);
  const cellLng = Math.floor(center.lng / quantum);
  return `${level}:${cellLat}:${cellLng}`;
}

@Injectable()
export class PlacesReconcilerService {
  /** Throttle clock for the TTL prune (see pruneExpiredRegions). */
  private lastRegionPruneAtMs = 0;

  private readonly logger: LoggerService;

  /** Single-flight per cell (§2): cellKey → in-flight reconcile. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly catalog: PlacesCatalogService,
    @Inject(TOMTOM_CHAIN_PROBE) private readonly probe: TomtomChainProbe,
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PlacesReconcilerService');
  }

  /**
   * Enqueue-style entry point: callers hand over a SETTLED viewport and move
   * on. Returns void SYNCHRONOUSLY — the §2 law is that reads never wait on
   * naming, so there is nothing to await and no error to catch (failures are
   * logged and self-heal on a later settle; the negative cache and idempotent
   * sketches make retries free).
   */
  noteViewport(view: GeoBbox): void {
    const cellKey = viewportCellKey(view);
    if (this.inFlight.has(cellKey)) {
      // Single-flight: this cell is already being reconciled — the in-flight
      // pass observes for everyone (stampede self-extinguishes, §2).
      return;
    }
    const flight = this.reconcile(view)
      .catch((error: unknown) => {
        this.logger.warn(
          'viewport reconcile failed (will retry on a later settle)',
          {
            cellKey,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          },
        );
      })
      .finally(() => {
        this.inFlight.delete(cellKey);
      });
    this.inFlight.set(cellKey, flight);
  }

  /**
   * Test/ops seam: resolves when every in-flight reconcile has finished.
   * Production callers never await this (reads never wait).
   */
  async whenIdle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight.values()]);
    }
  }

  private async reconcile(view: GeoBbox): Promise<void> {
    // Step 1 (§2): what already answers? Stored place bboxes plus fresh
    // negative region observations both count as "known ground" — but only
    // at COMMENSURATE-OR-SMALLER scale: probeAnchors applies the same
    // too-big disqualifier as isTooBigForView (probedRegionAnswersAnchor's
    // scale half), so a
    // sketched country/state never marks street-zoom ground "answered" and
    // lazy neighborhood entry (§1) stays alive. Symmetric for negative
    // observations (in practice ~200 m regions, so the scale arm rarely
    // bites there — but the law is one law).
    const inView = await this.catalog.placesInView(view);
    const viewArea = bboxArea(view);
    // Places contribute their REAL GROUND (round-3 red team, 2026-08-08 —
    // this was `{kind:'box', bbox}` and was the LAST bbox-judged arm in the
    // stack: an anchor in a city's rectangle OVERHANG read as answered and
    // the place actually there could never be born from that zoom band,
    // exactly the ground-containment "Round Rock in Austin's rectangle"
    // class). Probes contribute the DISC they actually spoke for; a
    // fully-probed viewport contributes itself. One region list, three
    // honest shapes (one-ground charter P5).
    const knownRegions: ProbedRegion[] = [
      ...inView.map(
        (entry): ProbedRegion => ({
          kind: 'ground',
          ground: entry.ground,
          area: entry.placeArea,
        }),
      ),
      ...(await this.freshAskedRegions(view)),
    ];

    // Step 2 (§2): ≤3 anchors, center + largest-uncovered-region candidates.
    const anchors = probeAnchors(view, knownRegions, MAX_PROBE_ANCHORS);
    if (anchors.length === 0) {
      return; // fully answered — zero spend
    }

    // Step 3 (§2): probe sequentially — an early result can answer a later
    // anchor (anchor 1's city bbox, or its "no place here" region, may cover
    // anchors 2–3, scale-judged like any other known ground) — and WRITE
    // every result. Budget is structural: `anchors` is already capped at
    // MAX_PROBE_ANCHORS.
    let answered: ProbedRegion[] = [];
    // Did ANY anchor actually produce an observation this pass? If none did,
    // the view was not 'asked exhaustively' and must not be remembered as
    // such — a 30-day suppression of ground the vendor may name tomorrow.
    let observedAny = false;
    for (const anchor of anchors) {
      if (
        answered.some((region) =>
          probedRegionAnswersAnchor(viewArea, region, anchor),
        )
      ) {
        continue; // answered by an earlier probe in this same pass
      }
      // Config absence still THROWS and aborts the pass (a run with no key
      // can answer nothing). Everything else comes back typed — including
      // pool denial, which used to be a thrown string sentinel.
      const result: TomtomChainProbeResult = await this.probe.probe(anchor);
      if (result.kind === 'denied') {
        // The governor said not-now. Nothing behind this anchor will admit
        // either, so end the pass cleanly — KEEPING the regions already
        // answered. Aborting via throw here discarded rememberAskedRegion
        // work the pass had already paid for (red team 2026-08-04).
        this.logger.info('Probe pass ended early: pool denied', { anchor });
        break;
      }
      if (result.kind === 'failed') {
        // A FAILURE IS NOT AN OBSERVATION (observation type, 2026-08-01):
        // skip this anchor, remember nothing, keep the pass. No string
        // sentinel to match on — the type carries the distinction.
        this.logger.warn('Probe anchor skipped (vendor did not answer)', {
          anchor,
          reason: result.reason,
        });
        continue;
      }
      observedAny = true;
      if (result.kind === 'empty') {
        // The vendor OBSERVED that nothing lives here — region-scale, 30d.
        await this.rememberAskedRegion(result.probedRegion);
        answered = [...answered, result.probedRegion];
        continue;
      }
      // Sketch EVERYTHING: every chain node is written regardless of how it
      // will judge against any view — subjecthood is read-time (§2), and a
      // rejected-commensurability node is still catalog truth.
      const places = await this.catalog.sketchChain(result.chain);
      // P4: extents derived from the grounds just written — one batch read.
      const extents = await this.catalog.derivedBboxes(
        places.map((place) => place.placeId),
      );
      answered = [
        ...answered,
        ...[...extents.values()].map(
          (bbox): ProbedRegion => ({ kind: 'box', bbox }),
        ),
      ];
    }

    // Asked-ground memory: this pass probed and sketched everything the
    // vendor has for this view — remember the VIEW region so the same
    // ground doesn't re-spend draws every settle when its finest chain is
    // over-scale (see NegativeObservation doc). Recorded only when a probe
    // actually fired (a fully-answered pass costs nothing to repeat).
    // HONEST since 2026-08-07 round 2: probe() propagates identity
    // denials/faults instead of returning a chain with quiet gaps, so a
    // 'named' result here really did resolve every rung the vendor models —
    // this box can no longer bury a never-minted place for 30 days.
    if (observedAny) {
      await this.rememberAskedRegion({ kind: 'box', bbox: view });
    }
  }

  /**
   * Docket #7: the durable read — SCOPED TO THE VIEW (red-team 2026-08-01).
   *
   * A region can only answer an anchor of THIS view, and every anchor lies
   * inside the view, so a region that does not intersect the view can never
   * matter. The first cut read every unexpired row GLOBALLY: durability had
   * turned a per-process array (bounded, restart-reset) into an unbounded
   * table on the same unfiltered path — one row per probing pass, per dwell
   * and per search submit, retained 30 days, then Decimal-deserialized and
   * run through O(anchors x regions) distance math on every settle. That is
   * a scaling cliff, not a memory.
   *
   * Latitude filters always (no wrap on lat). Longitude filters only for a
   * non-crossing view — a seam-crossing view keeps the honest wider read
   * rather than a wrong predicate. Discs are matched on their centre with a
   * degree pad for their radius (~100m of vendor reach).
   */
  private async freshAskedRegions(view: GeoBbox): Promise<ProbedRegion[]> {
    const cutoff = new Date(Date.now() - NEGATIVE_OBSERVATION_TTL_MS);
    await this.pruneExpiredRegions(cutoff);
    // The pad covers a DISC's reach: its centre may sit outside the view
    // while its radius reaches in. MEASURED 2026-08-01 against the real DB:
    // one pad for both axes is WRONG — a degree of LONGITUDE shrinks with
    // latitude, so the vendor's 100m spans more degrees of lng the further
    // from the equator. At lat 60 a disc 66.7m outside the view (inside its
    // 100m reach) was EXCLUDED, its anchor read unanswered, and the cell
    // re-probed every settle: the spend-forever class this read exists to
    // prevent, reintroduced as a scale bug.
    const padLat = PROBE_SPEAKS_FOR_METERS / METERS_PER_DEGREE_LAT;
    const worstLat = Math.max(Math.abs(view.minLat), Math.abs(view.maxLat));
    const cosLat = Math.max(Math.cos((worstLat * Math.PI) / 180), MIN_COS_LAT);
    const padLng = padLat / cosLat;
    // RAW, not a query-builder filter, for one reason: a stored box may
    // itself CROSS THE SEAM (boxes are written verbatim from the view, so a
    // crossing view stores min_lng > max_lng). Such a row can answer anchors
    // at any longitude, and no field-to-field comparison expresses that in
    // the builder. A crossing QUERY view likewise drops the lng test rather
    // than apply a wrong one; latitude always filters (no wrap on lat).
    const crossesSeam = view.minLng > view.maxLng;
    const rows = await this.prisma.$queryRaw<ProbedRegionRow[]>(Prisma.sql`
      /*places:fresh_asked_regions*/
      SELECT kind, center_lat, center_lng, radius_meters,
             min_lat, min_lng, max_lat, max_lng
      FROM probed_regions
      WHERE observed_at >= ${cutoff}
        AND (
          (kind = 'disc'
            AND center_lat BETWEEN ${view.minLat - padLat}::numeric AND ${view.maxLat + padLat}::numeric
            AND (${crossesSeam}
                 OR center_lng BETWEEN ${view.minLng - padLng}::numeric AND ${view.maxLng + padLng}::numeric))
          OR
          (kind = 'box'
            AND max_lat >= ${view.minLat}::numeric AND min_lat <= ${view.maxLat}::numeric
            AND (${crossesSeam}
                 OR min_lng > max_lng
                 OR (max_lng >= ${view.minLng}::numeric AND min_lng <= ${view.maxLng}::numeric)))
        )
    `);
    return rows.map(
      (row): ProbedRegion =>
        row.kind === 'disc'
          ? {
              kind: 'disc',
              center: {
                lat: Number(row.center_lat),
                lng: Number(row.center_lng),
              },
              radiusMeters: Number(row.radius_meters),
            }
          : {
              kind: 'box',
              bbox: {
                minLat: Number(row.min_lat),
                minLng: Number(row.min_lng),
                maxLat: Number(row.max_lat),
                maxLng: Number(row.max_lng),
              },
            },
    );
  }

  /**
   * TTL prune, throttled to once per PRUNE_MIN_INTERVAL_MS per process
   * (red-team 2026-08-01: an unconditional deleteMany ran on EVERY settle).
   * Per-process state is right here — this is an operational cadence, not a
   * memory of truth; a missed prune only delays row cleanup, and the read
   * filters on the cutoff regardless.
   */
  private async pruneExpiredRegions(cutoff: Date): Promise<void> {
    const now = Date.now();
    if (now - this.lastRegionPruneAtMs < PRUNE_MIN_INTERVAL_MS) {
      return;
    }
    this.lastRegionPruneAtMs = now;
    await this.prisma.probedRegion.deleteMany({
      where: { observedAt: { lt: cutoff } },
    });
  }

  /** Docket #7: the durable write. Never throws — losing one memory row
   *  costs at most a re-spent cheap probe, never a failed settle. */
  private async rememberAskedRegion(region: ProbedRegion): Promise<void> {
    const cellKey = regionCellKey(region);
    try {
      // UPSERT ON THE CELL, never append (disease B, 2026-08-01). The
      // catalog learned this the expensive way: a memory without identity
      // is a log. Keyed by the same quantized cell the single-flight guard
      // already uses, one observation REPLACES the previous one for that
      // cell, so the table is bounded by the world at the levels people
      // look at instead of by traffic — and dedupe stops being a policy.
      // RAW, matching the PARTIAL unique (cell_key, kind) WHERE cell_key IS
      // NOT NULL — Prisma cannot express a partial unique, and declaring a
      // full one would drift from the migration.
      const disc = region.kind === 'disc' ? region : null;
      const box = region.kind === 'box' ? region : null;
      await this.prisma.$executeRaw(Prisma.sql`
        /*places:remember_asked_region*/
        INSERT INTO probed_regions (
          region_id, kind, cell_key, center_lat, center_lng, radius_meters,
          min_lat, min_lng, max_lat, max_lng, observed_at
        ) VALUES (
          gen_random_uuid(), ${region.kind}, ${cellKey},
          ${disc ? disc.center.lat : null}, ${disc ? disc.center.lng : null},
          ${disc ? disc.radiusMeters : null},
          ${box ? box.bbox.minLat : null}, ${box ? box.bbox.minLng : null},
          ${box ? box.bbox.maxLat : null}, ${box ? box.bbox.maxLng : null},
          now()
        )
        ON CONFLICT (cell_key, kind) WHERE cell_key IS NOT NULL
        DO UPDATE SET
          center_lat = EXCLUDED.center_lat,
          center_lng = EXCLUDED.center_lng,
          radius_meters = EXCLUDED.radius_meters,
          min_lat = EXCLUDED.min_lat,
          min_lng = EXCLUDED.min_lng,
          max_lat = EXCLUDED.max_lat,
          max_lng = EXCLUDED.max_lng,
          observed_at = EXCLUDED.observed_at
      `);
    } catch (error) {
      this.logger.warn(
        'Asked-region memory write failed (re-probe costs a cheap draw)',
        {
          detail: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
