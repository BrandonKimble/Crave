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
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  GeoBbox,
  METERS_PER_DEGREE_LAT,
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
    // Places contribute their (rectangular) extent; probes contribute the
    // DISC they actually spoke for; a fully-probed viewport contributes
    // itself. One region list, three honest shapes (one-ground charter P5).
    const knownRegions: ProbedRegion[] = [
      ...inView.map(
        (entry): ProbedRegion => ({ kind: 'box', bbox: entry.bbox }),
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
    for (const anchor of anchors) {
      if (
        answered.some((region) =>
          probedRegionAnswersAnchor(viewArea, region, anchor),
        )
      ) {
        continue; // answered by an earlier probe in this same pass
      }
      let result: TomtomChainProbeResult;
      try {
        result = await this.probe.probe(anchor);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'tomtom_missing_country_code') {
          // PER-ANCHOR vendor contract violation. Red-team 2026-08-01: the
          // adapter's throw (192628d6) and the seed script's per-cell skip
          // (bf350c35) were each correct and JOINTLY WRONG — nothing taught
          // the reconciler, so the throw unwound past the remaining anchors
          // AND past rememberAskedRegion below, and every future settle of
          // this cell re-probed forever. That is the spend-forever shape
          // docket #7 exists to prevent. Skip the anchor, keep the pass.
          this.logger.warn('Probe anchor skipped (vendor contract violation)', {
            anchor,
            detail: message,
          });
          continue;
        }
        // Pool denial / config absence are RUN-GLOBAL faults: the ground was
        // never asked, so the pass must not write an asked-region memory.
        throw error;
      }
      if (result.chain.length === 0) {
        // "No place here" IS an observation — region-scale, 30d TTL (§2).
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
    await this.rememberAskedRegion({ kind: 'box', bbox: view });
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
    const pad = PROBE_SPEAKS_FOR_METERS / METERS_PER_DEGREE_LAT;
    const latWindow = { gte: view.minLat - pad, lte: view.maxLat + pad };
    const crossesSeam = view.minLng > view.maxLng;
    const lngWindow = { gte: view.minLng - pad, lte: view.maxLng + pad };
    const rows = await this.prisma.probedRegion.findMany({
      where: {
        observedAt: { gte: cutoff },
        OR: [
          {
            kind: 'disc',
            centerLat: latWindow,
            ...(crossesSeam ? {} : { centerLng: lngWindow }),
          },
          {
            kind: 'box',
            maxLat: { gte: view.minLat },
            minLat: { lte: view.maxLat },
            ...(crossesSeam
              ? {}
              : { maxLng: { gte: view.minLng }, minLng: { lte: view.maxLng } }),
          },
        ],
      },
    });
    return rows.map(
      (row): ProbedRegion =>
        row.kind === 'disc'
          ? {
              kind: 'disc',
              center: {
                lat: Number(row.centerLat),
                lng: Number(row.centerLng),
              },
              radiusMeters: Number(row.radiusMeters),
            }
          : {
              kind: 'box',
              bbox: {
                minLat: Number(row.minLat),
                minLng: Number(row.minLng),
                maxLat: Number(row.maxLat),
                maxLng: Number(row.maxLng),
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
    try {
      await this.prisma.probedRegion.create({
        data:
          region.kind === 'disc'
            ? {
                kind: 'disc',
                centerLat: region.center.lat,
                centerLng: region.center.lng,
                radiusMeters: region.radiusMeters,
              }
            : {
                kind: 'box',
                minLat: region.bbox.minLat,
                minLng: region.bbox.minLng,
                maxLat: region.bbox.maxLat,
                maxLng: region.bbox.maxLng,
              },
      });
    } catch (error) {
      this.logger.warn('asked-region write failed (worst case: one re-probe)', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
