import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { MapBoundsDto } from './dto/search-query.dto';

/**
 * §5/§10/§11 ENGINE-COVERAGE (leg 2 of the markets extermination): viewport
 * coverage is a GROUND question about ENGINE TERRITORIES, not a market
 * election. An engine's territory is the DERIVED union of its member places'
 * grounds plus their DAG descendants (§5: territory is never stored); a
 * place's ground is the ONE place_geometries.geometry representation (§2.6 —
 * sketch envelopes and vendor outlines live in the same column, so a single
 * ST_Intersection/ST_Area judgment covers both grades with no fallback arm).
 *
 * Output is the raw SHARE (covered area / viewport area) plus the engines
 * present — NO thresholds here (§16: a "covered" boolean would be an
 * unclassifiable constant; consumers judge per their own law). The share is
 * overlap-correct: member grounds are ST_Union'd per engine before measuring
 * (overlapping member grounds never double-count), and the total share
 * unions across engines.
 *
 * Cost: ONE round trip. The recursive territory CTE walks the places DAG
 * (small table, parent_place_ids array), and `pg.geometry && view` is the
 * §2.5(c) GiST candidate prefilter preceding the exact clip.
 */

export type EngineViewportCoverageEngine = {
  engineId: string;
  name: string;
  /** area(engine territory ∩ viewport) / area(viewport), 0..1 */
  share: number;
};

export type EngineViewportCoverage = {
  /** area(union of ALL engine territories ∩ viewport) / area(viewport). */
  share: number;
  engines: EngineViewportCoverageEngine[];
};

const EMPTY_COVERAGE: EngineViewportCoverage = { share: 0, engines: [] };

@Injectable()
export class EngineCoverageService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('EngineCoverageService');
  }

  /**
   * Never throws — a coverage failure must not fail the search (mirrors the
   * old context resolver's stance); it degrades to the uncovered state.
   */
  async resolveViewportCoverage(
    bounds?: MapBoundsDto | null,
  ): Promise<EngineViewportCoverage> {
    const envelope = this.viewportEnvelopeSql(bounds);
    if (!envelope) {
      return EMPTY_COVERAGE;
    }
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          engineId: string;
          name: string;
          share: number;
          totalShare: number;
        }>
      >(Prisma.sql`
        WITH RECURSIVE view AS (
          SELECT ${envelope} AS g
        ),
        territory AS (
          SELECT e.engine_id, unnest(e.member_place_ids) AS place_id
          FROM engines e
          UNION
          SELECT t.engine_id, p.place_id
          FROM places p
          JOIN territory t ON t.place_id = ANY(p.parent_place_ids)
        ),
        clips AS (
          SELECT t.engine_id,
                 ST_Union(ST_Intersection(pg.geometry, v.g)) AS clip
          FROM (SELECT DISTINCT engine_id, place_id FROM territory) t
          JOIN place_geometries pg ON pg.place_id = t.place_id
          JOIN view v ON pg.geometry && v.g
          GROUP BY t.engine_id
        )
        SELECT c.engine_id AS "engineId",
               e.name,
               ST_Area(c.clip) / NULLIF((SELECT ST_Area(g) FROM view), 0)
                 AS share,
               (SELECT ST_Area(ST_Union(clip)) FROM clips)
                 / NULLIF((SELECT ST_Area(g) FROM view), 0) AS "totalShare"
        FROM clips c
        JOIN engines e ON e.engine_id = c.engine_id
      `);
      if (!rows.length) {
        return EMPTY_COVERAGE;
      }
      const clamp01 = (value: unknown): number => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return n >= 1 ? 1 : n;
      };
      return {
        share: clamp01(rows[0].totalShare),
        engines: rows
          .map((row) => ({
            engineId: row.engineId,
            name: row.name,
            share: clamp01(row.share),
          }))
          .sort((a, b) => b.share - a.share),
      };
    } catch (error) {
      this.logger.warn('Engine viewport coverage failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return EMPTY_COVERAGE;
    }
  }

  private viewportEnvelopeSql(bounds?: MapBoundsDto | null): Prisma.Sql | null {
    return viewportEnvelopeSql(bounds);
  }
}

/**
 * Wrap-aware viewport envelope (place-geo R1: SW.lng > NE.lng encodes an
 * antimeridian crossing — the envelope is the ST_Union of the two arms,
 * never one seam-spanning rectangle; same law as signals ground-containment
 * geoEnvelopeSql). Shared by engine coverage and the autocomplete poll lane.
 */
export function viewportEnvelopeSql(
  bounds?: MapBoundsDto | null,
): Prisma.Sql | null {
  if (!bounds?.northEast || !bounds.southWest) {
    return null;
  }
  const { northEast, southWest } = bounds;
  const values = [northEast.lat, northEast.lng, southWest.lat, southWest.lng];
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return null;
  }
  const minLat = Math.min(southWest.lat, northEast.lat);
  const maxLat = Math.max(southWest.lat, northEast.lat);
  if (minLat === maxLat || southWest.lng === northEast.lng) {
    return null;
  }
  if (southWest.lng <= northEast.lng) {
    return Prisma.sql`ST_MakeEnvelope(
        ${southWest.lng}::float8, ${minLat}::float8,
        ${northEast.lng}::float8, ${maxLat}::float8, 4326)`;
  }
  return Prisma.sql`ST_Union(
      ST_MakeEnvelope(${southWest.lng}::float8, ${minLat}::float8,
                      180::float8, ${maxLat}::float8, 4326),
      ST_MakeEnvelope((-180)::float8, ${minLat}::float8,
                      ${northEast.lng}::float8, ${maxLat}::float8, 4326))`;
}
