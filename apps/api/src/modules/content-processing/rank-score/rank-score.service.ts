import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

const SCORE_MAX = 100;
const SCORE_NON_TOP_MAX = 99.9;
const SCORE_MULTIPLIER = 10;
const DEFAULT_RANK_SCORE_TX_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_RANK_SCORE_TX_MAX_WAIT_MS = 30 * 1000;

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

    const marketKeys = await this.fetchMarketKeysForConnections(uniqueIds);
    await this.refreshRankScoresForMarkets(marketKeys);
  }

  async refreshRankScoresForMarkets(
    marketKeys: Array<string | null | undefined>,
  ): Promise<void> {
    const normalized = Array.from(
      new Set(
        marketKeys
          .filter((key): key is string => typeof key === 'string')
          .map((key) => key.trim().toLowerCase())
          .filter((key) => key.length > 0),
      ),
    );

    if (!normalized.length) {
      this.logger.debug('No market keys resolved for rank refresh');
      return;
    }

    for (const marketKey of normalized) {
      try {
        await this.refreshRankScoresForMarket(marketKey);
      } catch (error) {
        this.logger.error('Rank score refresh failed', {
          marketKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async refreshRankScoresForMarket(marketKey: string): Promise<void> {
    const normalizedKey = marketKey.trim().toLowerCase();
    if (!normalizedKey) {
      return;
    }

    await this.refreshConnectionRankScores(normalizedKey);
    await this.refreshRestaurantRankScores(normalizedKey);
  }

  private async refreshConnectionRankScores(marketKey: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rank_score:${marketKey}:connection`}))`;
        await tx.$executeRaw`
DELETE FROM core_display_rank_scores
WHERE market_key = ${marketKey}
  AND subject_type = 'connection'::display_rank_subject_type`;

        await tx.$executeRaw`
WITH ranked AS (
  SELECT
    c.connection_id AS subject_id,
    ${marketKey}::varchar(255) AS market_key,
    COALESCE(c.food_quality_score, 0) AS quality_score,
    COALESCE(c.total_upvotes, 0) AS total_upvotes,
    COALESCE(c.mention_count, 0) AS mention_count,
    ROW_NUMBER() OVER (
      PARTITION BY ${marketKey}::varchar(255)
      ORDER BY
        COALESCE(c.food_quality_score, 0) DESC,
        COALESCE(c.total_upvotes, 0) DESC,
        COALESCE(c.mention_count, 0) DESC,
        c.connection_id ASC
    ) AS row_number,
    PERCENT_RANK() OVER (
      PARTITION BY ${marketKey}::varchar(255)
      ORDER BY
        COALESCE(c.food_quality_score, 0) DESC,
        COALESCE(c.total_upvotes, 0) DESC,
        COALESCE(c.mention_count, 0) DESC,
        c.connection_id ASC
    ) AS percent_rank
  FROM (
    SELECT DISTINCT emp.entity_id AS restaurant_id
    FROM core_entity_market_presence emp
    JOIN core_markets m
      ON m.market_key = ${marketKey}
     AND m.market_key = emp.market_key
     AND m.is_active = true
  ) mr
  JOIN core_entities r ON r.entity_id = mr.restaurant_id
  JOIN core_restaurant_items c ON c.restaurant_id = r.entity_id
),
scored AS (
  SELECT
    market_key,
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
  market_key,
  subject_type,
  subject_id,
  rank_score_raw,
  rank_score_display,
  rank_percentile,
  computed_at
)
SELECT
  market_key,
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
      },
      {
        timeout: DEFAULT_RANK_SCORE_TX_TIMEOUT_MS,
        maxWait: DEFAULT_RANK_SCORE_TX_MAX_WAIT_MS,
      },
    );

    this.logger.info('Connection display ranks refreshed', { marketKey });
  }

  private async refreshRestaurantRankScores(marketKey: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rank_score:${marketKey}:restaurant`}))`;
        await tx.$executeRaw`
DELETE FROM core_display_rank_scores
WHERE market_key = ${marketKey}
  AND subject_type = 'restaurant'::display_rank_subject_type`;

        await tx.$executeRaw`
WITH restaurant_metrics AS (
  SELECT
    r.entity_id AS subject_id,
    ${marketKey}::varchar(255) AS market_key,
    COALESCE(r.restaurant_quality_score, 0) AS quality_score,
    COALESCE(SUM(c.total_upvotes), 0) AS total_upvotes,
    COALESCE(SUM(c.mention_count), 0) AS mention_count
  FROM (
    SELECT DISTINCT emp.entity_id AS restaurant_id
    FROM core_entity_market_presence emp
    JOIN core_markets m
      ON m.market_key = ${marketKey}
     AND m.market_key = emp.market_key
     AND m.is_active = true
  ) mr
  JOIN core_entities r ON r.entity_id = mr.restaurant_id
  LEFT JOIN core_restaurant_items c ON c.restaurant_id = r.entity_id
  WHERE r.type = 'restaurant'
  GROUP BY r.entity_id, r.restaurant_quality_score
),
ranked AS (
  SELECT
    subject_id,
    market_key,
    quality_score,
    total_upvotes,
    mention_count,
    ROW_NUMBER() OVER (
      PARTITION BY market_key
      ORDER BY
        quality_score DESC,
        total_upvotes DESC,
        mention_count DESC,
        subject_id ASC
    ) AS row_number,
    PERCENT_RANK() OVER (
      PARTITION BY market_key
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
    market_key,
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
  market_key,
  subject_type,
  subject_id,
  rank_score_raw,
  rank_score_display,
  rank_percentile,
  computed_at
)
SELECT
  market_key,
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
      },
      {
        timeout: DEFAULT_RANK_SCORE_TX_TIMEOUT_MS,
        maxWait: DEFAULT_RANK_SCORE_TX_MAX_WAIT_MS,
      },
    );

    this.logger.info('Restaurant display ranks refreshed', { marketKey });
  }

  private async fetchMarketKeysForConnections(
    connectionIds: string[],
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ market_key: string }>>(
      Prisma.sql`
SELECT DISTINCT m.market_key AS market_key
FROM core_restaurant_items c
JOIN core_entity_market_presence emp ON emp.entity_id = c.restaurant_id
JOIN core_markets m
  ON m.market_key = emp.market_key
 AND m.is_active = true
WHERE c.connection_id = ANY(${this.buildUuidArray(connectionIds)})
`,
    );

    const keys = rows
      .map((row) => row.market_key)
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
