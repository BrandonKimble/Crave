import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

const SCORE_MAX = 100;
const SCORE_NON_TOP_MAX = 99.9;
const SCORE_MULTIPLIER = 10;

@Injectable()
export class RankScoreService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RankScoreService');
  }

  async refreshRankScoresForConnections(
    connectionIds: string[],
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(connectionIds)).filter(Boolean);
    if (!uniqueIds.length) {
      this.logger.debug('No connection IDs supplied for rank refresh');
      return;
    }

    const locationKeys = await this.fetchLocationKeysForConnections(uniqueIds);
    await this.refreshRankScoresForLocations(locationKeys);
  }

  async refreshRankScoresForLocations(
    locationKeys: Array<string | null | undefined>,
  ): Promise<void> {
    const normalized = Array.from(
      new Set(
        locationKeys
          .filter((key): key is string => typeof key === 'string')
          .map((key) => key.trim().toLowerCase())
          .filter((key) => key.length > 0),
      ),
    );

    if (!normalized.length) {
      this.logger.debug('No coverage keys resolved for rank refresh');
      return;
    }

    for (const locationKey of normalized) {
      try {
        await this.refreshRankScoresForLocation(locationKey);
      } catch (error) {
        this.logger.error('Rank score refresh failed', {
          locationKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async refreshRankScoresForLocation(
    locationKey: string,
  ): Promise<void> {
    const normalizedKey = locationKey.trim().toLowerCase();
    if (!normalizedKey) {
      return;
    }

    await this.refreshConnectionRankScores(normalizedKey);
    await this.refreshRestaurantRankScores(normalizedKey);
  }

  private async refreshConnectionRankScores(
    locationKey: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
DELETE FROM core_display_rank_scores
WHERE location_key = ${locationKey}
  AND subject_type = 'connection'::display_rank_subject_type`;

      await tx.$executeRaw`
WITH ranked AS (
  SELECT
    c.connection_id AS subject_id,
    r.location_key AS location_key,
    COALESCE(c.food_quality_score, 0) AS quality_score,
    COALESCE(c.total_upvotes, 0) AS total_upvotes,
    COALESCE(c.mention_count, 0) AS mention_count,
    ROW_NUMBER() OVER (
      PARTITION BY r.location_key
      ORDER BY
        COALESCE(c.food_quality_score, 0) DESC,
        COALESCE(c.total_upvotes, 0) DESC,
        COALESCE(c.mention_count, 0) DESC,
        c.connection_id ASC
    ) AS row_number,
    PERCENT_RANK() OVER (
      PARTITION BY r.location_key
      ORDER BY
        COALESCE(c.food_quality_score, 0) DESC,
        COALESCE(c.total_upvotes, 0) DESC,
        COALESCE(c.mention_count, 0) DESC,
        c.connection_id ASC
    ) AS percent_rank
  FROM core_connections c
  JOIN core_entities r ON r.entity_id = c.restaurant_id
  WHERE r.location_key = ${locationKey}
),
scored AS (
  SELECT
    location_key,
    subject_id,
    row_number,
    (1 - percent_rank) AS rank_percentile,
    CASE
      WHEN row_number = 1 THEN ${SCORE_MAX}::numeric
      ELSE LEAST(${SCORE_NON_TOP_MAX}, GREATEST(0, ${SCORE_MAX} * (1 - percent_rank)))::numeric
    END AS rank_score_raw
  FROM ranked
)
INSERT INTO core_display_rank_scores (
  location_key,
  subject_type,
  subject_id,
  rank_score_raw,
  rank_score_display,
  rank_percentile,
  computed_at
)
SELECT
  location_key,
  'connection'::display_rank_subject_type,
  subject_id,
  rank_score_raw,
  CASE
    WHEN row_number = 1 THEN ${SCORE_MAX}::numeric
    ELSE floor(rank_score_raw * ${SCORE_MULTIPLIER})::numeric / ${SCORE_MULTIPLIER}
  END AS rank_score_display,
  rank_percentile::numeric,
  NOW()
FROM scored`;
    });

    this.logger.info('Connection display ranks refreshed', { locationKey });
  }

  private async refreshRestaurantRankScores(
    locationKey: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
DELETE FROM core_display_rank_scores
WHERE location_key = ${locationKey}
  AND subject_type = 'restaurant'::display_rank_subject_type`;

      await tx.$executeRaw`
WITH restaurant_metrics AS (
  SELECT
    r.entity_id AS subject_id,
    r.location_key AS location_key,
    COALESCE(r.restaurant_quality_score, 0) AS quality_score,
    COALESCE(SUM(c.total_upvotes), 0) AS total_upvotes,
    COALESCE(SUM(c.mention_count), 0) AS mention_count
  FROM core_entities r
  LEFT JOIN core_connections c ON c.restaurant_id = r.entity_id
  WHERE r.type = 'restaurant'
    AND r.location_key = ${locationKey}
  GROUP BY r.entity_id, r.location_key, r.restaurant_quality_score
),
ranked AS (
  SELECT
    subject_id,
    location_key,
    quality_score,
    total_upvotes,
    mention_count,
    ROW_NUMBER() OVER (
      PARTITION BY location_key
      ORDER BY
        quality_score DESC,
        total_upvotes DESC,
        mention_count DESC,
        subject_id ASC
    ) AS row_number,
    PERCENT_RANK() OVER (
      PARTITION BY location_key
      ORDER BY
        quality_score DESC,
        total_upvotes DESC,
        mention_count DESC,
        subject_id ASC
    ) AS percent_rank
  FROM restaurant_metrics
),
scored AS (
  SELECT
    location_key,
    subject_id,
    row_number,
    (1 - percent_rank) AS rank_percentile,
    CASE
      WHEN row_number = 1 THEN ${SCORE_MAX}::numeric
      ELSE LEAST(${SCORE_NON_TOP_MAX}, GREATEST(0, ${SCORE_MAX} * (1 - percent_rank)))::numeric
    END AS rank_score_raw
  FROM ranked
)
INSERT INTO core_display_rank_scores (
  location_key,
  subject_type,
  subject_id,
  rank_score_raw,
  rank_score_display,
  rank_percentile,
  computed_at
)
SELECT
  location_key,
  'restaurant'::display_rank_subject_type,
  subject_id,
  rank_score_raw,
  CASE
    WHEN row_number = 1 THEN ${SCORE_MAX}::numeric
    ELSE floor(rank_score_raw * ${SCORE_MULTIPLIER})::numeric / ${SCORE_MULTIPLIER}
  END AS rank_score_display,
  rank_percentile::numeric,
  NOW()
FROM scored`;
    });

    this.logger.info('Restaurant display ranks refreshed', { locationKey });
  }

  private async fetchLocationKeysForConnections(
    connectionIds: string[],
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ location_key: string }>>(
      Prisma.sql`
SELECT DISTINCT r.location_key
FROM core_connections c
JOIN core_entities r ON r.entity_id = c.restaurant_id
WHERE c.connection_id = ANY(${this.buildUuidArray(connectionIds)})`,
    );

    const keys = rows
      .map((row) => row.location_key)
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(keys.map((value) => value.trim().toLowerCase())));
  }

  private buildUuidArray(values: string[]): Prisma.Sql {
    const mapped = Prisma.join(
      values.map((value) => Prisma.sql`${value}::uuid`),
      ', ',
    );
    return Prisma.sql`ARRAY[${mapped}]::uuid[]`;
  }
}
