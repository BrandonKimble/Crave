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
import { LoggerService } from '../../shared';
import { GeoBbox, bboxContainsPoint } from './place-geo';
import { PlacesCatalogService, placeBbox } from './places-catalog.service';
import { probeAnchors, MAX_PROBE_ANCHORS, viewCenter } from './subjects';
import {
  TOMTOM_CHAIN_PROBE,
  TomtomChainProbe,
} from './tomtom-chain-probe.port';

/** §2: negative region observations live 30 days. */
export const NEGATIVE_OBSERVATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface NegativeObservation {
  bbox: GeoBbox;
  observedAtMs: number;
}

/**
 * §2 single-flight cell key: quantize the view's center on a grid sized by
 * the view's own span, bucketed by power-of-two "zoom level" so nearby
 * settles at the same scale coalesce while different zooms stay distinct.
 */
export function viewportCellKey(view: GeoBbox): string {
  const lngSpan = Math.max(view.maxLng - view.minLng, 1e-6);
  const level = Math.max(0, Math.min(24, Math.round(Math.log2(360 / lngSpan))));
  const quantum = 360 / 2 ** level;
  const center = viewCenter(view);
  const cellLat = Math.floor(center.lat / quantum);
  const cellLng = Math.floor(center.lng / quantum);
  return `${level}:${cellLat}:${cellLng}`;
}

@Injectable()
export class PlacesReconcilerService {
  private readonly logger: LoggerService;

  /**
   * TODO(persistence): §2's negative region cache is a durable fact (a probed
   * bbox with a 30d TTL) and belongs in a table so observations survive
   * restarts and are shared across processes; in-memory is the documented
   * interim (worst case a restart re-spends ≤3 cheap probes per region).
   */
  private negativeObservations: NegativeObservation[] = [];

  /** Single-flight per cell (§2): cellKey → in-flight reconcile. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly catalog: PlacesCatalogService,
    @Inject(TOMTOM_CHAIN_PROBE) private readonly probe: TomtomChainProbe,
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
    // negative region observations both count as "known ground".
    const inView = await this.catalog.placesInView(view);
    const knownBboxes: GeoBbox[] = [
      ...inView.map((entry) => entry.bbox),
      ...this.freshNegativeBboxes(),
    ];

    // Step 2 (§2): ≤3 anchors, center + largest-uncovered-region candidates.
    const anchors = probeAnchors(view, knownBboxes, MAX_PROBE_ANCHORS);
    if (anchors.length === 0) {
      return; // fully answered — zero spend
    }

    // Step 3 (§2): probe sequentially — an early result can answer a later
    // anchor (anchor 1's city bbox, or its "no place here" region, may cover
    // anchors 2–3) — and WRITE every result. Budget is structural: `anchors`
    // is already capped at MAX_PROBE_ANCHORS.
    let answeredBboxes: GeoBbox[] = [];
    for (const anchor of anchors) {
      if (answeredBboxes.some((bbox) => bboxContainsPoint(bbox, anchor))) {
        continue; // answered by an earlier probe in this same pass
      }
      const result = await this.probe.probe(anchor);
      if (result.chain.length === 0) {
        // "No place here" IS an observation — region-scale, 30d TTL (§2).
        this.negativeObservations.push({
          bbox: result.probedBbox,
          observedAtMs: Date.now(),
        });
        answeredBboxes = [...answeredBboxes, result.probedBbox];
        continue;
      }
      // Sketch EVERYTHING: every chain node is written regardless of how it
      // will judge against any view — subjecthood is read-time (§2), and a
      // rejected-commensurability node is still catalog truth.
      const places = await this.catalog.sketchChain(result.chain);
      answeredBboxes = [
        ...answeredBboxes,
        ...places
          .map((place) => placeBbox(place))
          .filter((bbox): bbox is GeoBbox => bbox !== null),
      ];
    }
  }

  private freshNegativeBboxes(): GeoBbox[] {
    const cutoff = Date.now() - NEGATIVE_OBSERVATION_TTL_MS;
    // Prune expired entries on read — the cache stays bounded by attention.
    this.negativeObservations = this.negativeObservations.filter(
      (entry) => entry.observedAtMs >= cutoff,
    );
    return this.negativeObservations.map((entry) => entry.bbox);
  }
}
