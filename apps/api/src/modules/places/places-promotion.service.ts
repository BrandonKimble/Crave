/**
 * §2 Tier-2 polygon promotion queue (plans/geo-demand-foundation-rebuild.md
 * §2 "Tier-2 polygon promotion (scarce pool) — earned moments").
 *
 * A place earns its scarce-pool polygon; nothing mass-fetches. The queue
 * (place_geometry_promotions, placeId PK) records the earned moment; a
 * governed hourly drain turns queued places into place_geometries rows.
 *
 * TRIGGERS (§2 a–e), all fire-and-forget — the §2 "ONE blocking caller"
 * nuance is about NAME resolution at poll creation (which already never
 * blocks, wave-5 §17c fallback mint); the polygon enqueue itself never
 * blocks anything:
 *   (a) poll_created     — polls.service createPoll after place resolution;
 *   (b) source_attached  — the §10 onboarding verb (prisma/
 *       market-provisioning.ts) for the source's anchor place. The lazy
 *       poll_surface source (§5) is deliberately NOT wired: its place
 *       already entered via (a)/(c) by construction (a poll_surface row is
 *       only minted at first graduation of that place's polls);
 *   (c) credit_prefetch  — the weekly ritual's §2 derived pre-fetch:
 *       credit + creditRate × Δt_to_tick ≥ 1 (creditRate is per-week, the
 *       tick is weekly, so the formula is credit + creditRate ≥ 1);
 *   (d) batch seed       — NOT a mass enqueue. OWNER-RATIFY (reading of
 *       record): §2(d) reads as seed-batches EARNING promotion, not the
 *       19.5k-row US seed pre-spending ~8 months of the 2,500/mo scarce
 *       pool with zero attention evidence. Seeded places therefore enter
 *       the queue through the OTHER triggers when attention arrives; a
 *       future paid seed campaign (§14.6 money grant) would enqueue its
 *       batch explicitly through enqueue() with its own trigger word;
 *   (e) header_answers   — a place that answers the §2 header more than
 *       once within the memory TTL joins the queue (noteHeaderAnswer;
 *       in-memory, same interim stance as the reconciler's negative-region
 *       cache).
 *
 * POINT-ANSWER-BEATS-BBOX (§2 parenthetical, documented no-op): "until
 * promoted, the probe's point-answer beats bbox dominance on disagreement."
 * Today the subjects/header read (subjects.ts resolveHeaderPlace) is
 * bbox-only — polygons are not consulted at read and a probe's point-answer
 * exists only transiently inside the reconciler before being sketched into
 * the same bboxes, so no bbox-vs-point disagreement SEAM exists to arbitrate.
 * The rule becomes live machinery when a polygon-precise header read lands;
 * building it now would be machinery without a caller.
 *
 * DRAIN (governed lane):
 *   - Hourly cadence: §16 K3-shaped operational plumbing (same clock as the
 *     ritual tick; "a polygon an hour late is fine" — the queue itself is the
 *     lateness buffer). §21.2: destined to be a registered pacer lane.
 *   - Oldest-first; the SCARCE POOL bounds spend (hardClosed 2,500/mo) — no
 *     invented batch cap.
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
        `,
      );
      for (const item of due) {
        const outcome = await this.promoteOne(item, now);
        if (outcome === 'stop') {
          break;
        }
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
      )
      INSERT INTO place_geometries
        (place_id, provider_boundary_id, fetched_at, geometry)
      SELECT ${placeId}::uuid, ${geometryId}, ${now}, merged.geometry
      FROM merged
      WHERE merged.geometry IS NOT NULL
      ON CONFLICT (place_id) DO UPDATE SET
        provider_boundary_id = EXCLUDED.provider_boundary_id,
        fetched_at = EXCLUDED.fetched_at,
        geometry = EXCLUDED.geometry
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
