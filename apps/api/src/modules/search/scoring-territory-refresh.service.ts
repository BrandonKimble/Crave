import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * STORED FAME-PIN VERDICT (ideal-abstraction round 5, measured 2026-08-02).
 *
 * `core_restaurant_locations.in_scoring_territory` is a pure function of
 * (location coords × score provenance × engine territory) — zero request
 * state — yet it used to be computed as an ST_Covers EXISTS inside every
 * pooled search's DISTINCT ON sort key: 99% of the query's cost (3.45s
 * metro viewport → 27ms without it; the full-corpus recompute is ~9s ONCE).
 *
 * This cron re-derives the whole column nightly — cheap enough that
 * event-driven invalidation (score runs, coord changes, engine membership)
 * is not worth its plumbing at this corpus size; revisit at multi-city
 * scale.
 */
@Injectable()
export class ScoringTerritoryRefreshService {
  private readonly logger: LoggerService;
  private refreshInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('ScoringTerritoryRefreshService');
  }

  @Cron('20 8 * * *')
  async refresh(): Promise<void> {
    if (this.refreshInFlight) return;
    this.refreshInFlight = true;
    const started = Date.now();
    try {
      const result = await this.prisma.$executeRaw`
        UPDATE core_restaurant_locations rl
        SET in_scoring_territory = verdict.covered
        FROM (
          SELECT rl2.location_id,
            (rl2.latitude IS NOT NULL AND rl2.longitude IS NOT NULL AND EXISTS (
              SELECT 1
              FROM core_public_entity_scores pes
              JOIN sources src ON src.source_id = pes.provenance_source_id
              LEFT JOIN engines eng ON eng.engine_id = src.engine_id
              JOIN places p ON p.place_id = ANY(
                CASE WHEN eng.engine_id IS NOT NULL THEN eng.member_place_ids
                     ELSE ARRAY[src.anchor_place_id] END)
              WHERE pes.subject_type = 'restaurant'
                AND pes.subject_id = rl2.restaurant_id
                AND EXISTS (
                  SELECT 1 FROM place_geometries pgm
                  WHERE pgm.place_id = p.place_id
                    AND ST_Covers(pgm.geometry,
                          ST_SetSRID(ST_MakePoint(rl2.longitude::float8, rl2.latitude::float8), 4326))))) AS covered
          FROM core_restaurant_locations rl2
        ) verdict
        WHERE verdict.location_id = rl.location_id
          AND rl.in_scoring_territory IS DISTINCT FROM verdict.covered
      `;
      this.logger.info('Scoring-territory verdict refreshed', {
        changedRows: result,
        tookMs: Date.now() - started,
      });
    } catch (error) {
      this.logger.warn('Scoring-territory refresh failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.refreshInFlight = false;
    }
  }
}
