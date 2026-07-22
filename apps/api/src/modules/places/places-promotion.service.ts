/**
 * §2 Tier-2 polygon promotion queue (plans/geo-demand-foundation-rebuild.md
 * §2 "Tier-2 polygon promotion (scarce pool) — earned moments").
 *
 * A place earns its scarce-pool polygon; nothing mass-fetches. The queue
 * (place_geometry_promotions, placeId PK) records the earned moment; a
 * governed hourly drain turns queued places into place_geometries rows.
 *
 * TRIGGERS (§2/§2.5), all fire-and-forget — the §2 "ONE blocking caller"
 * nuance is about NAME resolution at poll creation (which already never
 * blocks, wave-5 §17c fallback mint); the polygon enqueue itself never
 * blocks anything:
 *   (0) birth            — §2.5(d) POLYGON AT BIRTH (ratified 2026-07-22):
 *       the catalog's create chokepoint (PlacesCatalogService.upsertSketch,
 *       via PLACE_BIRTH_LISTENER) enqueues EVERY newly sketched place; the
 *       promotion queue is the ORDINARY intake now, and the hourly drain
 *       cadence is the only latency (birth→outline within the hour is fine);
 *   (a) poll_created     — polls.service createPoll after place resolution;
 *   (b) source_attached  — the §10 onboarding verb (prisma/
 *       market-provisioning.ts) for the source's anchor place. The lazy
 *       poll_surface source (§5) is deliberately NOT wired: its place
 *       already entered via (a)/(c) by construction (a poll_surface row is
 *       only minted at first graduation of that place's polls);
 *   (c) credit_prefetch  — the weekly ritual's §2 derived pre-fetch:
 *       credit + creditRate × Δt_to_tick ≥ 1 (creditRate is per-week, the
 *       tick is weekly, so the formula is credit + creditRate ≥ 1);
 *   (d) paid_seed        — §2.5(e) SEED ORDER: the coarse seed campaign
 *       (scripts/seed-coarse-polygons.ts) batch-enqueues border countries +
 *       states + counties (the diagonal-shape class that lies about its
 *       ground) first, municipalities paced behind, organic forever-lazy —
 *       ratified 2026-07-22 with the PAID scarce budget (§16 K1 in
 *       governance.service);
 *   (e) header_answers   — a place that answers the header more than once
 *       within the memory TTL joins the queue (noteHeaderAnswer; in-memory,
 *       same interim stance as the reconciler's negative-region cache).
 *       Under birth-intake (0) this is a belt-and-suspenders re-entry for
 *       pre-§2.5 rows and consumed-draw misses.
 *
 * POINT-ANSWER-BEATS-BBOX: resolved by construction under §2.5 — the header
 * read is polygon-native (resolvePlaceCoverage: polygon = truth, bbox =
 * index-only fallback), so bbox dominance can no longer out-vote real
 * ground; the old interim parenthetical has no seam left to arbitrate.
 *
 * DRAIN (governed lane):
 *   - Hourly cadence: §16 K3-shaped operational plumbing (same clock as the
 *     ritual tick; "a polygon an hour late is fine" — the queue itself is the
 *     lateness buffer). §21.2: destined to be a registered pacer lane.
 *   - Oldest-first; the SCARCE POOL bounds spend (hardClosed, owner-priced
 *     monthly budget — §16 K1 in governance.service) — no invented batch
 *     cap; the per-tick row LIMIT below is churn-bounding only.
 *   - Two-step vendor flow: a tomtom-provider place's providerPlaceId IS the
 *     stable geometry id (§1, live-validated); a census-seeded place (GEOID
 *     alias) first spends ONE cheap forward geocode (county-qualified) to
 *     learn it — cached on the queue row so a later scarce denial never
 *     re-spends the cheap draw.
 *   - Denial ≠ attempt: a pool's typed not-now leaves the row untouched
 *     (next window). A consumed-draw miss increments attempts (no cap — the
 *     pool bounds spend) and re-tries in the NEXT month window: the K4
 *     monthly pool is the backoff clock, not an invented constant.
 *   - fallback-provider places (§17c "this area near…" mints) never enqueue:
 *     a synthetic name has no vendor geometry; when naming backfill gives
 *     the ground real identity, the real place earns its own moment.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlaceGeometryPromotion, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { utcInstantSql } from '../signals/sql-instant';
import { NEGATIVE_OBSERVATION_TTL_MS } from './places-reconciler.service';
import {
  PolygonFetchResult,
  TOMTOM_CHAIN_PROBE,
  TomtomChainProbe,
} from './tomtom-chain-probe.port';

/**
 * §16: the header-answer memory window REUSES the §2 30d region-observation
 * TTL (K1 "30d no-place TTL") — one attention-memory constant, not a new
 * knob. More than one header answer inside the window = "frequent" (§2(e)'s
 * minimal honest reading: the smallest count that is a repeat).
 */
export const HEADER_ANSWER_MEMORY_TTL_MS = NEGATIVE_OBSERVATION_TTL_MS;

/**
 * §16 DERIVED — per-tick drain read bound: the scarce pool's monthly budget
 * (tomtom.scarcePolygons, §16 K1 owner price-tag in governance.service) is
 * the REAL spend limiter; a single tick can never usefully touch more rows
 * than the whole month admits, so the row LIMIT equals that budget. It
 * exists only to bound per-tick row churn on a deeply backlogged queue
 * (paid_seed enqueues ~23k rows at once) — it is not a pacing knob. What
 * changes it: the owner re-pricing the scarce pool, never tuning.
 */
export /** §16 K4-derived: 2 vendor calls per item ÷ ~5 QPS vendor window → 500ms. */
const VENDOR_QPS_SPACING_MS = 500;

const DRAIN_BATCH_LIMIT_PER_TICK = 10_000;

/** Per-item drain outcome (see promoteOne). 'stop' ends the whole pass. */
type DrainOutcome = 'promoted' | 'skipped' | 'attempted' | 'stop';

@Injectable()
export class PlacesPromotionService {
  private readonly logger: LoggerService;

  /** Single-flight for the drain (cron + ops seam can overlap). */
  private draining = false;

  /**
   * §2(e) header-answer memory: placeId → first-answer epoch ms. In-memory
   * interim, same documented stance as the reconciler's negative-region
   * cache (worst case a restart forgets one first-answer). `enqueuedOnce`
   * keeps a hot header place (every search names it) from re-hitting the
   * idempotent enqueue on each request.
   */
  private headerAnswers = new Map<string, number>();
  private readonly enqueuedOnce = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TOMTOM_CHAIN_PROBE) private readonly probe: TomtomChainProbe,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PlacesPromotionService');
  }

  /**
   * Idempotent enqueue of one earned moment. A place already queued OR
   * already promoted (queue row with promotedAt, or an existing
   * place_geometries polygon) is a no-op; fallback-provider mints never
   * enqueue. Never throws — every caller is fire-and-forget.
   */
  async enqueue(placeId: string, trigger: string): Promise<void> {
    try {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO place_geometry_promotions (place_id, trigger)
        SELECT p.place_id, ${trigger}
        FROM places p
        WHERE p.place_id = ${placeId}::uuid
          AND p.provider <> 'fallback'
          AND NOT EXISTS (
            SELECT 1 FROM place_geometries g
            WHERE g.place_id = p.place_id AND g.geometry IS NOT NULL
          )
        ON CONFLICT (place_id) DO NOTHING
      `);
    } catch (error) {
      this.logger.warn('Promotion enqueue failed (earned moment retries)', {
        placeId,
        trigger,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * §2(e): the header path reports every place-kind verdict here (search
   * header + polls feed header — one §2 judgment, both mouths). The SECOND
   * answer within the memory TTL enqueues 'header_answers'. Synchronous and
   * allocation-light — it sits on the hot search path.
   */
  noteHeaderAnswer(placeId: string): void {
    if (this.enqueuedOnce.has(placeId)) {
      return;
    }
    const now = Date.now();
    this.pruneHeaderMemory(now);
    const firstSeenAt = this.headerAnswers.get(placeId);
    if (firstSeenAt === undefined) {
      this.headerAnswers.set(placeId, now);
      return;
    }
    // Frequent: answered more than once within the TTL → earned moment.
    this.enqueuedOnce.add(placeId);
    this.headerAnswers.delete(placeId);
    void this.enqueue(placeId, 'header_answers');
  }

  private pruneHeaderMemory(nowMs: number): void {
    const cutoff = nowMs - HEADER_ANSWER_MEMORY_TTL_MS;
    for (const [placeId, seenAt] of this.headerAnswers) {
      if (seenAt < cutoff) {
        this.headerAnswers.delete(placeId);
      }
    }
  }

  /** Hourly governed drain (§16 K3 operational cadence — see header). */
  @Cron(CronExpression.EVERY_HOUR)
  async drainTick(now: Date = new Date()): Promise<void> {
    try {
      await this.drainQueue(now);
    } catch (error) {
      this.logger.error('Promotion drain failed (retries next tick)', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Drain queued places oldest-first through the governed vendor flow. An
   * item attempted THIS month window is skipped until the next window (the
   * K4 monthly pool is the backoff clock). The pass ends early on any pool
   * denial (hardClosed month pools: nothing later in the queue would admit
   * either) or on a vendor transport error (consumed draw, systemic).
   */
  async drainQueue(now: Date): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      const due = await this.prisma.$queryRaw<PlaceGeometryPromotion[]>(
        Prisma.sql`
          SELECT place_id            AS "placeId",
                 trigger             AS "trigger",
                 enqueued_at         AS "enqueuedAt",
                 promoted_at         AS "promotedAt",
                 attempts            AS "attempts",
                 last_attempt_at     AS "lastAttemptAt",
                 provider_boundary_id AS "providerBoundaryId"
          FROM place_geometry_promotions
          WHERE promoted_at IS NULL
            AND (last_attempt_at IS NULL
                 OR date_trunc('month', last_attempt_at)
                    < date_trunc('month', ${utcInstantSql(now)}))
          ORDER BY enqueued_at ASC
          LIMIT ${DRAIN_BATCH_LIMIT_PER_TICK}
        `,
      );
      for (const item of due) {
        const outcome = await this.promoteOne(item, now);
        if (outcome === 'stop') {
          break;
        }
        // §16 K4 (vendor fact): TomTom pay-as-you-go allows ~5 QPS on the
        // Search endpoints; each promotion spends up to 2 calls. Space items
        // so the drain can never out-run the vendor's per-second window (the
        // month pool bounds VOLUME; this bounds RATE — observed 429s on the
        // 2026-07-22 seed run without it).
        await new Promise((resolve) =>
          setTimeout(resolve, VENDOR_QPS_SPACING_MS),
        );
      }
    } finally {
      this.draining = false;
    }
  }

  private async promoteOne(
    item: PlaceGeometryPromotion,
    now: Date,
  ): Promise<DrainOutcome> {
    const place = await this.prisma.place.findUnique({
      where: { placeId: item.placeId },
    });
    if (!place) {
      // Dangling queue row (places are effectively never deleted; belt and
      // suspenders): drop it rather than draw for a ghost.
      await this.prisma.placeGeometryPromotion.delete({
        where: { placeId: item.placeId },
      });
      return 'skipped';
    }

    // Raced/pre-existing polygon → just stamp the promotion.
    const existing = await this.prisma.$queryRaw<Array<{ placeId: string }>>(
      Prisma.sql`
        SELECT place_id AS "placeId" FROM place_geometries
        WHERE place_id = ${item.placeId}::uuid AND geometry IS NOT NULL
      `,
    );
    if (existing.length > 0) {
      await this.stampPromoted(item.placeId, item.providerBoundaryId, now);
      return 'promoted';
    }

    // Step 1 — the stable TomTom geometry id. tomtom-provider places carry
    // it as providerPlaceId (§1 identity law); census-seeded places (GEOID
    // alias) resolve it via ONE cheap county-qualified forward geocode,
    // cached on the queue row across windows.
    let geometryId =
      item.providerBoundaryId ??
      (place.provider === 'tomtom' ? place.providerPlaceId : null);
    if (!geometryId) {
      const resolved = await this.probe.resolveGeometryId({
        name: place.name,
        county: place.county,
        subdivisionCode: place.subdivisionCode,
        countryCode: place.countryCode,
        providerLevelCode: place.providerLevelCode,
      });
      if (resolved.kind === 'denied') {
        return 'stop'; // cheap pool not-now — NOT an attempt; next window
      }
      if (resolved.kind === 'miss') {
        await this.recordAttempt(item.placeId, now);
        return 'attempted';
      }
      geometryId = resolved.geometryId;
      await this.prisma.placeGeometryPromotion.update({
        where: { placeId: item.placeId },
        data: { providerBoundaryId: geometryId },
      });
    }

    // Step 2 — the scarce polygon draw.
    let polygon: PolygonFetchResult;
    try {
      polygon = await this.probe.fetchPolygon(geometryId);
    } catch (error) {
      // Transport/vendor error: the draw was conservatively debited and the
      // fault is systemic — record the attempt and end the pass.
      await this.recordAttempt(item.placeId, now);
      this.logger.warn('Promotion polygon fetch errored (pass ends)', {
        placeId: item.placeId,
        geometryId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return 'stop';
    }
    if (polygon.kind === 'denied') {
      // §2: scarce denial = typed not-now — the item stays queued untouched
      // for next month's window; nothing behind it will admit either.
      return 'stop';
    }
    if (polygon.kind === 'miss') {
      await this.recordAttempt(item.placeId, now);
      return 'attempted';
    }

    await this.persistPolygon(item.placeId, geometryId, polygon.geojson, now);
    await this.stampPromoted(item.placeId, geometryId, now);
    this.logger.info('Place promoted to tier-2 polygon', {
      placeId: item.placeId,
      trigger: item.trigger,
      geometryId,
    });
    return 'promoted';
  }

  /**
   * Persist the vendor FeatureCollection into place_geometries — the PostGIS
   * geometry column lives OUTSIDE the prisma model (§1), raw SQL only. The
   * ST_ shape mirrors the live-proven legacy bootstrap write (collect →
   * unary-union → make-valid → extract polygons → ST_Multi).
   */
  private async persistPolygon(
    placeId: string,
    geometryId: string,
    geojson: unknown,
    now: Date,
  ): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      WITH raw_input AS (
        SELECT ${JSON.stringify(geojson)}::jsonb AS geojson
      ),
      source_geometries AS (
        SELECT
          ST_MakeValid(
            ST_SetSRID(
              ST_GeomFromGeoJSON((feature->'geometry')::text),
              4326
            )
          ) AS geometry
        FROM raw_input,
          jsonb_array_elements(raw_input.geojson->'features') AS feature
        WHERE feature ? 'geometry'
      ),
      merged AS (
        SELECT
          ST_Multi(
            ST_CollectionExtract(
              ST_MakeValid(ST_UnaryUnion(ST_Collect(geometry))),
              3
            )
          ) AS geometry
        FROM source_geometries
      ),
      bounded AS (
        -- STORAGE BOUND (§16 DERIVED, 2026-07-22 seed run): vendor zoom
        -- semantics are not trusted to bound row size (observed 1.5-3.5MB
        -- county/state rows). Simplify at WRITE to tolerance =
        -- placeSpan/1024: the polygon's only consumer is coverage judgment
        -- at viewport scales where the place is a candidate, and slices
        -- re-simplify to viewSpan/512 at read — sub-0.1%-of-span fidelity
        -- is invisible to every consumer while bounding rows to ~KB.
        SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(
                 ST_SimplifyPreserveTopology(
                   merged.geometry,
                   GREATEST(
                     ST_XMax(merged.geometry) - ST_XMin(merged.geometry),
                     ST_YMax(merged.geometry) - ST_YMin(merged.geometry)
                   ) / 1024.0
                 )
               ), 3)) AS geometry
        FROM merged
        WHERE merged.geometry IS NOT NULL
      )
      INSERT INTO place_geometries
        (place_id, provider_boundary_id, fetched_at, geometry)
      SELECT ${placeId}::uuid, ${geometryId}, ${now}, bounded.geometry
      FROM bounded
      WHERE bounded.geometry IS NOT NULL
      ON CONFLICT (place_id) DO UPDATE SET
        provider_boundary_id = EXCLUDED.provider_boundary_id,
        fetched_at = EXCLUDED.fetched_at,
        geometry = EXCLUDED.geometry
    `);
    // §2.5(c): bbox = INDEX only, and the index DERIVES from truth when
    // truth lands — widen the places bbox to the polygon's envelope
    // (grow-only, LEAST/GREATEST like the §1 merge law; COALESCE lets a
    // bbox-less coarse-seed row — a country created purely for its polygon —
    // gain its first index presence here). An over-wide envelope (a
    // seam-straddling country) is safe by construction: the index only
    // FINDS candidates, the polygon judges them.
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE places p SET
        bbox_min_lat = LEAST(COALESCE(p.bbox_min_lat, ST_YMin(g.geometry)), ST_YMin(g.geometry)),
        bbox_min_lng = LEAST(COALESCE(p.bbox_min_lng, ST_XMin(g.geometry)), ST_XMin(g.geometry)),
        bbox_max_lat = GREATEST(COALESCE(p.bbox_max_lat, ST_YMax(g.geometry)), ST_YMax(g.geometry)),
        bbox_max_lng = GREATEST(COALESCE(p.bbox_max_lng, ST_XMax(g.geometry)), ST_XMax(g.geometry))
      FROM place_geometries g
      WHERE g.place_id = p.place_id
        AND p.place_id = ${placeId}::uuid
        AND g.geometry IS NOT NULL
    `);
  }

  /** Promotion completes: stamp the queue row AND places.promoted_at. */
  private async stampPromoted(
    placeId: string,
    geometryId: string | null,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.placeGeometryPromotion.update({
        where: { placeId },
        data: { promotedAt: now, providerBoundaryId: geometryId },
      }),
      this.prisma.place.update({
        where: { placeId },
        data: { promotedAt: now },
      }),
    ]);
  }

  /** A consumed-draw miss: attempts++ (no cap), next chance next window. */
  private async recordAttempt(placeId: string, now: Date): Promise<void> {
    await this.prisma.placeGeometryPromotion.update({
      where: { placeId },
      data: { attempts: { increment: 1 }, lastAttemptAt: now },
    });
  }
}
