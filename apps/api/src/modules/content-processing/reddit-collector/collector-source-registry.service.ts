/**
 * §10 source-centric collector state: sources, engines, and per-(source, lane)
 * cadence rows. Collection work keys off SOURCE rows; engines are
 * operator-attached member-place sets whose territory is a DERIVED union
 * (members + places-DAG descendants at read), never stored.
 *
 * Lane state (chronological cursor, keyword heavy-sort watermark) lives on the
 * lane row (§10). The lane row also carries the §12.4 OUTPUT-DERIVED heartbeat:
 * documents produced per due-tick vs the lane's own EWMA baseline — a lane
 * that keeps "running" while its output collapses reads RED (legit-zero vs
 * broken-zero is judged against the baseline, not a constant).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDDIT_LANES } from './reddit-collection-adapter';

export interface CollectorLane {
  sourceId: string;
  lane: string;
  enabled: boolean;
  cadenceDays: number;
  latenessToleranceDays: number;
  dueAt: Date;
  lastRanAt: Date | null;
  state: Record<string, unknown>;
  lastOutputDocs: number | null;
  outputDocsBaseline: number | null;
  /** Joined source columns — the lane's collection identity. */
  platform: string;
  handle: string;
  anchorPlaceId: string | null;
  engineId: string | null;
}

export interface CollectorHeartbeat {
  sourceId: string;
  handle: string;
  lane: string;
  /** §14.3 normalized lateness — the universal severity scale. > 1 = RED. */
  normalizedLateness: number;
  /** Output collapse vs own baseline (§12.4). */
  outputCollapsed: boolean;
  lastOutputDocs: number | null;
  outputDocsBaseline: number | null;
  /** §10 advance-at-extraction: a staged window older than the reconcile
   *  grace that never committed = the lane FETCHED but no extraction run
   *  entered the evidence system — RED. */
  pendingWindowStale: boolean;
  /** §10 expectedBatches reconciler verdict (written by the hourly pass):
   *  expected fan-out minus proven (created runs + covered-skip batches).
   *  > 0 = RED. null until the reconciler has judged a window. */
  expectedBatchesShortfall: number | null;
  /** §10 saturation detector: an uncleared C4 coverage-gap fact on the lane
   *  (fetch reach ended before the cursor) — RED until recovered. */
  coverageGapDetected: boolean;
}

/** §10 pending window: staged at fetch, committed (into lastProcessedAt) only
 *  when the window's extraction evidence is durably created. */
export interface PendingWindowState {
  parentJobId: string;
  /** visible-at-fetch coveredThrough (ISO) — the value the cursor takes when
   *  the window commits. */
  coveredThrough: string;
  expectedBatches: number;
  stagedAt: string;
}

/** EWMA weight for the output baseline — a K2-shaped smoothing prior. */
const OUTPUT_BASELINE_ALPHA = 0.3;
/** §16: K3-shaped operational bound — how long a staged §10 window may sit
 *  uncommitted (fetch happened, no extraction run yet) before it reads RED.
 *  Sized to the slowest honest fetch→run path (batch enqueue delays are
 *  seconds; gating + persistence minutes); pacer-derived refinement replaces
 *  it when the estimator-refresher lands (§22). Shared by the heartbeat
 *  reader and the hourly expectedBatches reconciler. */
export const PENDING_WINDOW_GRACE_HOURS = 2;
/** A tick producing under this fraction of baseline reads collapsed (§12.4).
 *  Applied only once a baseline exists — first ticks can never false-RED.
 *  §16 K2 (per-source burst variance family): 0.2 is the prior alarm
 *  threshold; measured per-source output variance refines it when the
 *  estimator-refresher turns on (§22 trigger-deferred reader). */
const OUTPUT_COLLAPSE_FRACTION = 0.2;

export function normalizedLateness(
  lane: Pick<CollectorLane, 'dueAt' | 'latenessToleranceDays'>,
  now: Date,
): number {
  const toleranceMs = Math.max(
    lane.latenessToleranceDays * 24 * 60 * 60 * 1000,
    1,
  );
  return (now.getTime() - lane.dueAt.getTime()) / toleranceMs;
}

@Injectable()
export class CollectorSourceRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Due lanes ordered by normalized lateness DESC — §14.3 priority. */
  async listDueLanes(now: Date = new Date()): Promise<CollectorLane[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        source_id: string;
        lane: string;
        enabled: boolean;
        cadence_days: number;
        lateness_tolerance_days: number;
        due_at: Date;
        last_ran_at: Date | null;
        state: Record<string, unknown> | null;
        last_output_docs: number | null;
        output_docs_baseline: number | null;
        platform: string;
        handle: string;
        anchor_place_id: string | null;
        engine_id: string | null;
      }>
    >`
      SELECT l.*, s.platform, s.handle, s.anchor_place_id, s.engine_id
      FROM source_collection_lanes l
      JOIN sources s ON s.source_id = l.source_id
      WHERE l.enabled AND l.due_at <= ${now}
      ORDER BY (EXTRACT(EPOCH FROM (${now}::timestamp - l.due_at))
                / GREATEST(l.lateness_tolerance_days * 86400, 1)) DESC
    `;
    return rows.map((row) => ({
      sourceId: row.source_id,
      lane: row.lane,
      enabled: row.enabled,
      cadenceDays: Number(row.cadence_days),
      latenessToleranceDays: Number(row.lateness_tolerance_days),
      dueAt: row.due_at,
      lastRanAt: row.last_ran_at,
      state: row.state ?? {},
      lastOutputDocs: row.last_output_docs,
      outputDocsBaseline:
        row.output_docs_baseline === null
          ? null
          : Number(row.output_docs_baseline),
      platform: row.platform,
      handle: row.handle,
      anchorPlaceId: row.anchor_place_id,
      engineId: row.engine_id,
    }));
  }

  async findRedditSourceByHandle(handle: string): Promise<{
    sourceId: string;
    engineId: string | null;
    anchorPlaceId: string | null;
  } | null> {
    const source = await this.prisma.source.findFirst({
      where: { platform: 'reddit', handle: { equals: handle.trim() } },
      select: { sourceId: true, engineId: true, anchorPlaceId: true },
    });
    if (source) return source;
    // Handles are case-normalized inconsistently across legacy paths.
    const rows = await this.prisma.$queryRaw<
      Array<{
        source_id: string;
        engine_id: string | null;
        anchor_place_id: string | null;
      }>
    >`
      SELECT source_id, engine_id, anchor_place_id FROM sources
      WHERE platform = 'reddit' AND lower(handle) = lower(${handle.trim()})
      LIMIT 1
    `;
    const row = rows[0];
    return row
      ? {
          sourceId: row.source_id,
          engineId: row.engine_id,
          anchorPlaceId: row.anchor_place_id,
        }
      : null;
  }

  async getEngine(
    engineId: string,
  ): Promise<{ engineId: string; name: string; memberPlaceIds: string[] }> {
    const engine = await this.prisma.engine.findUniqueOrThrow({
      where: { engineId },
    });
    return {
      engineId: engine.engineId,
      name: engine.name,
      memberPlaceIds: engine.memberPlaceIds,
    };
  }

  /**
   * Engine territory = member places + their places-DAG DESCENDANTS (§5:
   * derived union, never stored). Ancestor rows need no special handling
   * under the aggregate's intersection attribution — a state-wide signal
   * intersecting a member's bbox already carries a member-place row.
   */
  async territoryPlaceIds(engineId: string): Promise<string[]> {
    const engine = await this.getEngine(engineId);
    if (!engine.memberPlaceIds.length) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<Array<{ place_id: string }>>`
      WITH RECURSIVE territory AS (
        SELECT place_id FROM places
        WHERE place_id = ANY(${engine.memberPlaceIds}::uuid[])
        UNION
        SELECT p.place_id FROM places p
        JOIN territory t ON t.place_id = ANY(p.parent_place_ids)
      )
      SELECT place_id FROM territory
    `;
    return rows.map((row) => row.place_id);
  }

  /**
   * Idempotent lane provisioning (v2 cadence audit, 2026-07-23): the
   * original lane rows were seeded by the 20260719230000 migration from the
   * dead collection_schedules table — NEW sources onboarded after it got NO
   * lanes and the pacer would never visit them. Every lane the platform
   * adapter declares is inserted due-NOW (the post-archive baseline sweep
   * fires on the next pacer tick — the archive-end gap starts growing the
   * moment onboarding finishes). ON CONFLICT keeps existing rows untouched.
   */
  async ensureLanes(sourceId: string): Promise<void> {
    for (const declaration of REDDIT_LANES) {
      await this.prisma.$executeRaw`
        INSERT INTO source_collection_lanes
          (source_id, lane, enabled, cadence_days, lateness_tolerance_days,
           due_at, state)
        VALUES
          (${sourceId}::uuid, ${declaration.lane}, true,
           ${declaration.defaultCadenceDays},
           ${declaration.defaultLatenessToleranceDays},
           now(), '{}'::jsonb)
        ON CONFLICT (source_id, lane) DO NOTHING
      `;
    }
  }

  /**
   * Advance a dispatched lane by its cadence (the pacer's row-advance).
   * `maxIntervalDays` clamps the advance below the row cadence — the
   * chronological LOSS-HORIZON FLOOR (v2 cadence design, 2026-07-23): the
   * only irreversible cadence error is letting posts scroll past the
   * vendor's 1000-post /new window uncollected, converting free
   * chronological completeness into expensive keyword gap-repair.
   */
  async advanceLane(
    sourceId: string,
    lane: string,
    now: Date = new Date(),
    maxIntervalDays?: number,
  ): Promise<void> {
    const cap =
      typeof maxIntervalDays === 'number' &&
      Number.isFinite(maxIntervalDays) &&
      maxIntervalDays > 0
        ? maxIntervalDays
        : null;
    await this.prisma.$executeRaw`
      UPDATE source_collection_lanes
      SET due_at = ${now}::timestamp + make_interval(
            secs => LEAST(cadence_days, COALESCE(${cap}::float8, cadence_days)) * 86400
          ),
          last_ran_at = ${now},
          updated_at = now()
      WHERE source_id = ${sourceId}::uuid AND lane = ${lane}
    `;
  }

  /** Re-arm a lane as due NOW (governance-denial mid-dispatch: the pacer
   *  advanced dueAt at dispatch, but the work never ran — a typed not-now
   *  leaves the work item DUE, never errored). LEAST() never pushes a lane
   *  later than it already is. */
  async markLaneDue(
    sourceId: string,
    lane: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE source_collection_lanes
      SET due_at = LEAST(due_at, ${now}::timestamp),
          updated_at = now()
      WHERE source_id = ${sourceId}::uuid AND lane = ${lane}
    `;
  }

  /**
   * §10 advance-at-extraction, step 1 of the idempotent two-step: the FETCH
   * stages the window (visible-at-fetch coveredThrough + expected fan-out)
   * WITHOUT moving the cursor. A crash between fetch and extraction-run
   * creation leaves the cursor untouched → the next dispatch re-fetches the
   * window (persist-first upserts make the re-fetch idempotent) instead of
   * losing it. A newer dispatch overwrites the stage — its wider window
   * subsumes the old one.
   */
  async stagePendingWindow(
    sourceId: string,
    lane: string,
    window: PendingWindowState,
  ): Promise<void> {
    await this.mergeLaneState(sourceId, lane, {
      pendingWindow: window as unknown as Record<string, unknown>,
    });
  }

  /**
   * §10 advance-at-extraction, step 2: the cursor moves ONLY when the
   * window's extraction evidence is durably created ("this window entered
   * the evidence system" — a fact, not intent). Conditional on the staged
   * parentJobId, so it is idempotent (later batches of the same parent
   * no-op) and race-safe (a stale parent can never commit over a newer
   * stage). Returns true when this call performed the commit.
   */
  async commitPendingWindow(
    sourceId: string,
    lane: string,
    parentJobId: string,
  ): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE source_collection_lanes
      SET state = (COALESCE(state, '{}'::jsonb) - 'pendingWindow')
            || jsonb_build_object(
                 'lastProcessedAt', state->'pendingWindow'->'coveredThrough'
               ),
          updated_at = now()
      WHERE source_id = ${sourceId}::uuid AND lane = ${lane}
        AND state->'pendingWindow'->>'parentJobId' = ${parentJobId}
    `;
    return updated > 0;
  }

  /** Merge lane-kind state (cursor, heavy-sort watermark) into the lane row. */
  async mergeLaneState(
    sourceId: string,
    lane: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE source_collection_lanes
      SET state = COALESCE(state, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
          updated_at = now()
      WHERE source_id = ${sourceId}::uuid AND lane = ${lane}
    `;
  }

  /**
   * §12.4 heartbeat write: record a tick's OUTPUT (documents produced) and
   * fold it into the lane's EWMA baseline. Output is a fact about persisted
   * documents — never "a handler fired".
   */
  /**
   * V2-CADENCE PREREQUISITE (audited 2026-07-23): for the keyword lane this
   * records TOTAL search results — fine for the heartbeat's output-collapse
   * baseline, but the v2 value-ranked scheduler keys keyword decay on
   * UNCOVERED yield (new docs per dispatch), which today exists only
   * transiently in the extraction pipeline's coverage split. When v2 lands,
   * persist uncovered count per (source, lane) beside last_output_docs.
   */
  async recordLaneOutput(
    sourceId: string,
    lane: string,
    outputDocs: number,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE source_collection_lanes
      SET last_output_docs = ${outputDocs},
          output_docs_baseline = CASE
            WHEN output_docs_baseline IS NULL THEN ${outputDocs}::float8
            ELSE output_docs_baseline * ${1 - OUTPUT_BASELINE_ALPHA}
                 + ${outputDocs}::float8 * ${OUTPUT_BASELINE_ALPHA}
          END,
          updated_at = now()
      WHERE source_id = ${sourceId}::uuid AND lane = ${lane}
    `;
  }

  /**
   * The per-(source, lane) heartbeat reader (§12.4/C8) — CAN show RED two
   * ways: normalized lateness > 1 (the lane stopped running) or output
   * collapse vs its own baseline (the lane runs but produces nothing where
   * it used to produce plenty).
   */
  async collectorHeartbeats(
    now: Date = new Date(),
  ): Promise<CollectorHeartbeat[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        source_id: string;
        handle: string;
        lane: string;
        due_at: Date;
        lateness_tolerance_days: number;
        last_output_docs: number | null;
        output_docs_baseline: number | null;
        state: Record<string, unknown> | null;
      }>
    >`
      SELECT l.source_id, s.handle, l.lane, l.due_at,
             l.lateness_tolerance_days, l.last_output_docs,
             l.output_docs_baseline, l.state
      FROM source_collection_lanes l
      JOIN sources s ON s.source_id = l.source_id
      WHERE l.enabled
    `;
    return rows.map((row) => {
      const lateness = normalizedLateness(
        {
          dueAt: row.due_at,
          latenessToleranceDays: Number(row.lateness_tolerance_days),
        },
        now,
      );
      const baseline =
        row.output_docs_baseline === null
          ? null
          : Number(row.output_docs_baseline);
      const outputCollapsed =
        baseline !== null &&
        baseline > 0 &&
        row.last_output_docs !== null &&
        row.last_output_docs < baseline * OUTPUT_COLLAPSE_FRACTION;
      const state = row.state ?? {};
      // §10 fetched-but-no-runs RED: a staged window past the grace with no
      // extraction-run commit.
      const pendingWindow = state.pendingWindow as
        | Partial<PendingWindowState>
        | undefined;
      const stagedAtMs =
        typeof pendingWindow?.stagedAt === 'string'
          ? Date.parse(pendingWindow.stagedAt)
          : NaN;
      const pendingWindowStale =
        Number.isFinite(stagedAtMs) &&
        now.getTime() - stagedAtMs >
          PENDING_WINDOW_GRACE_HOURS * 60 * 60 * 1000;
      // §10 reconciler verdict (written hourly by the pacer's pass).
      const reconciler = state.reconciler as
        | { shortfall?: unknown }
        | undefined;
      const expectedBatchesShortfall =
        typeof reconciler?.shortfall === 'number' &&
        Number.isFinite(reconciler.shortfall)
          ? reconciler.shortfall
          : null;
      return {
        sourceId: row.source_id,
        handle: row.handle,
        lane: row.lane,
        normalizedLateness: lateness,
        outputCollapsed,
        lastOutputDocs: row.last_output_docs,
        outputDocsBaseline: baseline,
        pendingWindowStale,
        expectedBatchesShortfall,
        coverageGapDetected: state.coverageGap != null,
      };
    });
  }

  /** Durable heavy-sort watermark on the keyword lane row (was
   *  collection_schedules metadata). */
  async recordTopRelevanceRun(
    sourceId: string,
    executedAt: Date,
  ): Promise<void> {
    await this.mergeLaneState(sourceId, 'keyword', {
      lastTopRelevanceRunAt: executedAt.toISOString(),
    });
  }

  /** Read one lane row (worker-side cursor reads). */
  async getLane(sourceId: string, lane: string): Promise<CollectorLane | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        source_id: string;
        lane: string;
        enabled: boolean;
        cadence_days: number;
        lateness_tolerance_days: number;
        due_at: Date;
        last_ran_at: Date | null;
        state: Record<string, unknown> | null;
        last_output_docs: number | null;
        output_docs_baseline: number | null;
        platform: string;
        handle: string;
        anchor_place_id: string | null;
        engine_id: string | null;
      }>
    >(Prisma.sql`
      SELECT l.*, s.platform, s.handle, s.anchor_place_id, s.engine_id
      FROM source_collection_lanes l
      JOIN sources s ON s.source_id = l.source_id
      WHERE l.source_id = ${sourceId}::uuid AND l.lane = ${lane}
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      sourceId: row.source_id,
      lane: row.lane,
      enabled: row.enabled,
      cadenceDays: Number(row.cadence_days),
      latenessToleranceDays: Number(row.lateness_tolerance_days),
      dueAt: row.due_at,
      lastRanAt: row.last_ran_at,
      state: row.state ?? {},
      lastOutputDocs: row.last_output_docs,
      outputDocsBaseline:
        row.output_docs_baseline === null
          ? null
          : Number(row.output_docs_baseline),
      platform: row.platform,
      handle: row.handle,
      anchorPlaceId: row.anchor_place_id,
      engineId: row.engine_id,
    };
  }
}
