import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import {
  CraveScoreCandidates,
  CraveScoreMovementState,
  CraveScoreSubjectType,
  DishCandidate,
  PublicCraveScoreConfig,
  RestaurantCandidate,
  ScoredCraveSubject,
} from './public-crave-score.types';

type NumericLike = number | string | Prisma.Decimal | null | undefined;

type DishRow = {
  connection_id: string;
  restaurant_id: string;
  scoring_market_key: string | null;
  mentions: NumericLike;
  upvotes: NumericLike;
};

type RestaurantRow = {
  restaurant_id: string;
  scoring_market_key: string | null;
  praise_mentions: NumericLike;
  praise_upvotes: NumericLike;
};

type PriorScoreRow = {
  subject_type: CraveScoreSubjectType;
  subject_id: string;
  score_delta_days: number;
  display_score: NumericLike;
};

const DEFAULT_CONFIG: PublicCraveScoreConfig = {
  scoreVersion: 'crave-score-v3',
  displayCurveVersion: 'crave-score-display-v3',
  displayMin: 60,
  displayMax: 99.9,
  dishMentionWeight: 0.7,
  dishUpvoteWeight: 0.3,
  discountRho: 0.5,
  dishWeight: 1.0,
  praiseWeight: 2.0,
  endorsementHalfLifeDays: 365,
};

// Reusable: each restaurant's single scoring market (most-regional wins).
const RESTAURANT_MARKETS_CTE = Prisma.sql`
  restaurant_markets AS (
    SELECT DISTINCT ON (emp.entity_id)
      emp.entity_id,
      emp.market_key
    FROM core_entity_market_presence emp
    LEFT JOIN core_markets m ON m.market_key = emp.market_key
    ORDER BY
      emp.entity_id,
      CASE m.market_type
        WHEN 'regional' THEN 0
        WHEN 'manual' THEN 1
        WHEN 'locality' THEN 2
        ELSE 3
      END,
      emp.market_key ASC
  )
`;

@Injectable()
export class PublicCraveScoreService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PublicCraveScoreService');
  }

  getConfig(): PublicCraveScoreConfig {
    return { ...DEFAULT_CONFIG };
  }

  async rebuildAllScores(params?: {
    fixtureRunId?: string;
    config?: Partial<PublicCraveScoreConfig>;
    recencyReferenceDate?: Date;
  }): Promise<{ scoreRunId: string; scoredCount: number }> {
    const config = { ...DEFAULT_CONFIG, ...(params?.config ?? {}) };
    const recencyReferenceDate = params?.recencyReferenceDate ?? new Date();
    const scoreRunId = randomUUID();
    const startedAt = Date.now();

    await this.createRun(scoreRunId, config, recencyReferenceDate, params);

    try {
      const candidates = await this.loadCandidates(config, params);
      const priorScores = await this.loadPriorScores(
        config,
        recencyReferenceDate,
      );
      const scored = this.scoreCandidates(candidates, priorScores, config);

      // Only a full/global rebuild owns the entire scored set, so only it may
      // prune subjects outside this run's output. A fixture-scoped rebuild
      // writes a subset and must never touch unrelated subjects.
      const pruneStaleSubjects = !params?.fixtureRunId;
      await this.writeScores(
        scoreRunId,
        scored,
        config,
        recencyReferenceDate,
        pruneStaleSubjects,
      );
      await this.completeRun(scoreRunId, {
        restaurants: scored.filter((row) => row.subjectType === 'restaurant')
          .length,
        connections: scored.filter((row) => row.subjectType === 'connection')
          .length,
      });

      this.logger.info('Rebuilt public Crave Scores', {
        scoreRunId,
        scoredCount: scored.length,
        durationMs: Date.now() - startedAt,
      });

      return { scoreRunId, scoredCount: scored.length };
    } catch (error) {
      await this.failRun(scoreRunId, error);
      throw error;
    }
  }

  // ── Scoring (v3): endorsement strength → global percentile → display ──────
  //
  // Dishes are atomic: a dish's score is its own endorsement strength.
  // Restaurants are composite: a discounted aggregate of their dishes'
  // endorsement (best dish counts fully, each next one less) plus a by-name
  // praise term (which alone carries dishless restaurants). Each subject type
  // is normalized by GLOBAL percentile → one stable meaning everywhere.
  scoreCandidates(
    candidates: CraveScoreCandidates,
    priorScores: Map<
      string,
      { score7d: number | null; score28d: number | null }
    >,
    config: PublicCraveScoreConfig = DEFAULT_CONFIG,
  ): ScoredCraveSubject[] {
    const endorse = (mentions: number, upvotes: number): number =>
      config.dishMentionWeight * Math.log1p(Math.max(0, mentions)) +
      config.dishUpvoteWeight * Math.log1p(Math.max(0, upvotes));

    // 1. Dish endorsement + group by restaurant.
    const dishEndorsement = new Map<string, number>();
    const dishesByRestaurant = new Map<string, number[]>();
    for (const dish of candidates.dishes) {
      const value = endorse(dish.mentions, dish.upvotes);
      dishEndorsement.set(dish.connectionId, value);
      const bucket = dishesByRestaurant.get(dish.restaurantId);
      if (bucket) {
        bucket.push(value);
      } else {
        dishesByRestaurant.set(dish.restaurantId, [value]);
      }
    }

    // 2. Restaurant endorsement = discounted dish-acclaim + praise.
    const restaurantAggregate = new Map<
      string,
      {
        endorsement: number;
        acclaim: number;
        praise: number;
        dishCount: number;
        bestDish: number;
      }
    >();
    for (const restaurant of candidates.restaurants) {
      const dishes = (dishesByRestaurant.get(restaurant.restaurantId) ?? [])
        .slice()
        .sort((a, b) => b - a);
      let acclaim = 0;
      for (let i = 0; i < dishes.length; i += 1) {
        acclaim += Math.pow(config.discountRho, i) * dishes[i];
      }
      const praise = endorse(
        restaurant.praiseMentions,
        restaurant.praiseUpvotes,
      );
      restaurantAggregate.set(restaurant.restaurantId, {
        endorsement: config.dishWeight * acclaim + config.praiseWeight * praise,
        acclaim,
        praise,
        dishCount: dishes.length,
        bestDish: dishes[0] ?? 0,
      });
    }

    const scored: ScoredCraveSubject[] = [];

    // 3a. Dishes — include any with endorsement (all connections have ≥1 mention).
    const dishEntries = candidates.dishes
      .map((dish) => ({
        dish,
        endorsement: dishEndorsement.get(dish.connectionId) ?? 0,
      }))
      .filter((entry) => entry.endorsement > 0);
    const dishRanks = this.percentileRanks(
      dishEntries.map((e) => e.endorsement),
    );
    dishEntries.forEach((entry, i) => {
      scored.push(
        this.buildScored(
          'connection',
          entry.dish.connectionId,
          entry.dish.scoringMarketKey,
          entry.endorsement,
          dishRanks[i],
          config,
          priorScores,
          {
            kind: 'dish',
            mentions: entry.dish.mentions,
            upvotes: entry.dish.upvotes,
          },
        ),
      );
    });

    // 3b. Restaurants — inclusion floor: any endorsement (dish acclaim or praise).
    const restEntries = candidates.restaurants
      .map((restaurant) => ({
        restaurant,
        agg: restaurantAggregate.get(restaurant.restaurantId)!,
      }))
      .filter((entry) => entry.agg && entry.agg.endorsement > 0);
    const restRanks = this.percentileRanks(
      restEntries.map((e) => e.agg.endorsement),
    );
    restEntries.forEach((entry, i) => {
      scored.push(
        this.buildScored(
          'restaurant',
          entry.restaurant.restaurantId,
          entry.restaurant.scoringMarketKey,
          entry.agg.endorsement,
          restRanks[i],
          config,
          priorScores,
          {
            kind: 'restaurant',
            dishCount: entry.agg.dishCount,
            bestDish: this.round(entry.agg.bestDish),
            acclaim: this.round(entry.agg.acclaim),
            praise: this.round(entry.agg.praise),
          },
        ),
      );
    });

    return scored;
  }

  private buildScored(
    subjectType: CraveScoreSubjectType,
    subjectId: string,
    scoringMarketKey: string | null,
    endorsementRaw: number,
    percentile: number,
    config: PublicCraveScoreConfig,
    priorScores: Map<
      string,
      { score7d: number | null; score28d: number | null }
    >,
    endorsementTrace: Record<string, unknown>,
  ): ScoredCraveSubject {
    const displayScore = this.round(
      config.displayMin + (config.displayMax - config.displayMin) * percentile,
      1,
    );
    const prior = priorScores.get(`${subjectType}:${subjectId}`);
    const rawDelta7d =
      prior?.score7d != null
        ? this.round(displayScore - prior.score7d, 1)
        : null;
    const rawDelta28d =
      prior?.score28d != null
        ? this.round(displayScore - prior.score28d, 1)
        : null;
    const movementState: CraveScoreMovementState =
      rawDelta7d === null
        ? 'insufficient_history'
        : rawDelta7d > 0
          ? 'rising'
          : rawDelta7d < 0
            ? 'cooling'
            : 'stable';

    return {
      subjectType,
      subjectId,
      scoringMarketKey,
      endorsementRaw: this.round(endorsementRaw),
      percentileRank: this.round(percentile, 5),
      displayScore,
      scoreDelta7d: rawDelta7d === 0 ? null : rawDelta7d,
      scoreDelta28d: rawDelta28d === 0 ? null : rawDelta28d,
      movementState,
      factorTrace: {
        endorsement: endorsementTrace,
        percentileRank: this.round(percentile, 5),
        config: {
          scoreVersion: config.scoreVersion,
          discountRho: config.discountRho,
          dishWeight: config.dishWeight,
          praiseWeight: config.praiseWeight,
        },
      },
    };
  }

  // Percentile rank in [0,1] aligned to the input order (ties broken by index).
  private percentileRanks(values: number[]): number[] {
    const n = values.length;
    const order = values
      .map((value, index) => [value, index] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const ranks = new Array<number>(n).fill(0);
    order.forEach(([, index], k) => {
      ranks[index] = n > 1 ? k / (n - 1) : 0.5;
    });
    return ranks;
  }

  private async createRun(
    scoreRunId: string,
    config: PublicCraveScoreConfig,
    recencyReferenceDate: Date,
    params?: {
      fixtureRunId?: string;
    },
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO core_crave_score_runs (
        score_run_id,
        score_version,
        display_curve_version,
        display_min,
        display_max,
        status,
        recency_reference_date,
        config_snapshot,
        input_counts
      )
      VALUES (
        ${scoreRunId}::uuid,
        ${config.scoreVersion},
        ${config.displayCurveVersion},
        ${config.displayMin},
        ${config.displayMax},
        'running',
        ${recencyReferenceDate}::date,
        ${JSON.stringify(config)}::jsonb,
        ${JSON.stringify({
          fixtureRunId: params?.fixtureRunId ?? null,
          rebuildScope: 'global',
        })}::jsonb
      )
    `;
  }

  private async completeRun(
    scoreRunId: string,
    inputCounts: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE core_crave_score_runs
      SET status = 'completed',
          completed_at = now(),
          input_counts = COALESCE(input_counts, '{}'::jsonb) || ${JSON.stringify(inputCounts)}::jsonb
      WHERE score_run_id = ${scoreRunId}::uuid
    `;
  }

  private async failRun(scoreRunId: string, error: unknown): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE core_crave_score_runs
      SET status = 'failed',
          completed_at = now(),
          error_message = ${error instanceof Error ? error.message : String(error)}
      WHERE score_run_id = ${scoreRunId}::uuid
    `;
  }

  private async loadCandidates(
    config: PublicCraveScoreConfig,
    params?: {
      fixtureRunId?: string;
    },
  ): Promise<CraveScoreCandidates> {
    const fixtureRunId = params?.fixtureRunId ?? null;
    const dishFixtureFilter = fixtureRunId
      ? Prisma.sql`r.restaurant_metadata->>'fixtureRunId' = ${fixtureRunId}`
      : Prisma.sql`TRUE`;
    const restFixtureFilter = fixtureRunId
      ? Prisma.sql`e.restaurant_metadata->>'fixtureRunId' = ${fixtureRunId}`
      : Prisma.sql`TRUE`;
    // Half-life is a trusted numeric config value (never user input); inline it
    // as a SQL numeric literal so the decay weight is a plain expression. Clamp to
    // a tiny positive so a bad/zero/negative config can't divide-by-zero or invert
    // decay; ages are clamped to >=0 below so a future-dated mention can't weigh >1.
    const halfLife = Prisma.raw(
      `(${Math.max(0.0001, Number(config.endorsementHalfLifeDays) || 0)})::numeric`,
    );

    const dishRows = await this.prisma.$queryRaw<DishRow[]>`
      WITH ${RESTAURANT_MARKETS_CTE}
      SELECT
        c.connection_id,
        c.restaurant_id,
        rm.market_key AS scoring_market_key,
        COALESCE(d.mentions, 0)::numeric AS mentions,
        COALESCE(d.upvotes, 0)::numeric AS upvotes
      FROM core_restaurant_items c
      JOIN core_entities r ON r.entity_id = c.restaurant_id
      LEFT JOIN restaurant_markets rm ON rm.entity_id = c.restaurant_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLife})), 0) AS mentions,
          COALESCE(SUM(m.source_upvotes * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLife})), 0) AS upvotes
        FROM core_restaurant_item_mentions m
        WHERE m.connection_id = c.connection_id
      ) d ON TRUE
      WHERE ${dishFixtureFilter}
    `;

    const restRows = await this.prisma.$queryRaw<RestaurantRow[]>`
      WITH ${RESTAURANT_MARKETS_CTE},
      restaurant_praise AS (
        SELECT
          restaurant_id,
          SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - mentioned_at)))/86400.0/${halfLife}))::numeric AS praise_mentions,
          SUM(upv * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - mentioned_at)))/86400.0/${halfLife}))::numeric AS praise_upvotes
        FROM (
          SELECT
            restaurant_id,
            mention_key,
            MAX(mentioned_at) AS mentioned_at,
            MAX(source_upvotes) AS upv
          FROM core_restaurant_events
          GROUP BY restaurant_id, mention_key
        ) dedup
        GROUP BY restaurant_id
      )
      SELECT
        e.entity_id AS restaurant_id,
        rm.market_key AS scoring_market_key,
        COALESCE(rp.praise_mentions, 0)::numeric AS praise_mentions,
        COALESCE(rp.praise_upvotes, 0)::numeric AS praise_upvotes
      FROM core_entities e
      LEFT JOIN restaurant_markets rm ON rm.entity_id = e.entity_id
      LEFT JOIN restaurant_praise rp ON rp.restaurant_id = e.entity_id
      WHERE e.type = 'restaurant'
        AND ${restFixtureFilter}
    `;

    const dishes: DishCandidate[] = dishRows.map((row) => ({
      connectionId: row.connection_id,
      restaurantId: row.restaurant_id,
      scoringMarketKey: row.scoring_market_key,
      mentions: this.toNumber(row.mentions),
      upvotes: this.toNumber(row.upvotes),
    }));
    const restaurants: RestaurantCandidate[] = restRows.map((row) => ({
      restaurantId: row.restaurant_id,
      scoringMarketKey: row.scoring_market_key,
      praiseMentions: this.toNumber(row.praise_mentions),
      praiseUpvotes: this.toNumber(row.praise_upvotes),
    }));
    return { dishes, restaurants };
  }

  private async loadPriorScores(
    config: PublicCraveScoreConfig,
    referenceDate: Date,
  ): Promise<Map<string, { score7d: number | null; score28d: number | null }>> {
    const rows = await this.prisma.$queryRaw<PriorScoreRow[]>`
      WITH target_dates AS (
        SELECT 7 AS score_delta_days, (${referenceDate}::date - INTERVAL '7 days')::date AS target_date
        UNION ALL
        SELECT 28 AS score_delta_days, (${referenceDate}::date - INTERVAL '28 days')::date AS target_date
      ),
      ranked AS (
        SELECT
          h.subject_type,
          h.subject_id,
          td.score_delta_days,
          h.display_score,
          ROW_NUMBER() OVER (
            PARTITION BY h.subject_type, h.subject_id, td.score_delta_days
            ORDER BY ABS(h.snapshot_date - td.target_date), h.snapshot_date DESC
          ) AS rn
        FROM core_public_entity_score_history h
        JOIN target_dates td
          ON h.snapshot_date BETWEEN td.target_date - INTERVAL '2 days'
                                AND td.target_date + INTERVAL '2 days'
        WHERE h.score_version = ${config.scoreVersion}
      )
      SELECT subject_type, subject_id, score_delta_days, display_score
      FROM ranked
      WHERE rn = 1
    `;

    const result = new Map<
      string,
      { score7d: number | null; score28d: number | null }
    >();
    for (const row of rows) {
      const key = `${row.subject_type}:${row.subject_id}`;
      const current = result.get(key) ?? { score7d: null, score28d: null };
      if (row.score_delta_days === 7) {
        current.score7d = this.toNumber(row.display_score);
      } else if (row.score_delta_days === 28) {
        current.score28d = this.toNumber(row.display_score);
      }
      result.set(key, current);
    }
    return result;
  }

  private async writeScores(
    scoreRunId: string,
    scored: ScoredCraveSubject[],
    config: PublicCraveScoreConfig,
    referenceDate: Date,
    pruneStaleSubjects: boolean,
  ): Promise<void> {
    if (!scored.length) {
      return;
    }

    const scoreWrites: Prisma.PrismaPromise<number>[] = scored.map(
      (row) =>
        this.prisma.$executeRaw`
          INSERT INTO core_public_entity_scores (
            subject_type,
            subject_id,
            score_run_id,
            scoring_market_key,
            endorsement_raw,
            percentile_rank,
            display_score,
            score_delta_7d,
            score_delta_28d,
            movement_state,
            score_version,
            display_curve_version,
            factor_trace,
            computed_at
          )
          VALUES (
            ${row.subjectType}::crave_score_subject_type,
            ${row.subjectId}::uuid,
            ${scoreRunId}::uuid,
            ${row.scoringMarketKey},
            ${row.endorsementRaw},
            ${row.percentileRank},
            ${row.displayScore},
            ${row.scoreDelta7d},
            ${row.scoreDelta28d},
            ${row.movementState}::crave_score_movement_state,
            ${config.scoreVersion},
            ${config.displayCurveVersion},
            ${JSON.stringify(row.factorTrace)}::jsonb,
            now()
          )
          ON CONFLICT (subject_type, subject_id) DO UPDATE SET
            score_run_id = EXCLUDED.score_run_id,
            scoring_market_key = EXCLUDED.scoring_market_key,
            endorsement_raw = EXCLUDED.endorsement_raw,
            percentile_rank = EXCLUDED.percentile_rank,
            display_score = EXCLUDED.display_score,
            score_delta_7d = EXCLUDED.score_delta_7d,
            score_delta_28d = EXCLUDED.score_delta_28d,
            movement_state = EXCLUDED.movement_state,
            score_version = EXCLUDED.score_version,
            display_curve_version = EXCLUDED.display_curve_version,
            factor_trace = EXCLUDED.factor_trace,
            computed_at = EXCLUDED.computed_at
        `,
    );

    if (pruneStaleSubjects) {
      // core_public_entity_scores is "latest only": every currently-scored
      // subject was just upserted to this run, so any row still pointing at a
      // prior run is an orphan (its subject no longer exists or is no longer in
      // the scored candidate set). Deleting them inside this transaction keeps
      // the table an exact mirror of the run's scored subjects atomically.
      scoreWrites.push(
        this.prisma.$executeRaw`
          DELETE FROM core_public_entity_scores
          WHERE score_run_id <> ${scoreRunId}::uuid
        `,
      );
    }

    await this.prisma.$transaction(scoreWrites);

    await this.prisma.$transaction(
      scored.map(
        (row) =>
          this.prisma.$executeRaw`
          INSERT INTO core_public_entity_score_history (
            score_run_id,
            snapshot_date,
            subject_type,
            subject_id,
            scoring_market_key,
            score_version,
            display_curve_version,
            display_score,
            endorsement_raw,
            percentile_rank,
            movement_state,
            factor_trace,
            computed_at
          )
          VALUES (
            ${scoreRunId}::uuid,
            ${referenceDate}::date,
            ${row.subjectType}::crave_score_subject_type,
            ${row.subjectId}::uuid,
            ${row.scoringMarketKey},
            ${config.scoreVersion},
            ${config.displayCurveVersion},
            ${row.displayScore},
            ${row.endorsementRaw},
            ${row.percentileRank},
            ${row.movementState}::crave_score_movement_state,
            ${JSON.stringify(row.factorTrace)}::jsonb,
            now()
          )
          ON CONFLICT (snapshot_date, subject_type, subject_id, score_version)
          DO UPDATE SET
            score_run_id = EXCLUDED.score_run_id,
            scoring_market_key = EXCLUDED.scoring_market_key,
            display_curve_version = EXCLUDED.display_curve_version,
            display_score = EXCLUDED.display_score,
            endorsement_raw = EXCLUDED.endorsement_raw,
            percentile_rank = EXCLUDED.percentile_rank,
            movement_state = EXCLUDED.movement_state,
            factor_trace = EXCLUDED.factor_trace,
            computed_at = EXCLUDED.computed_at
        `,
      ),
    );

    if (pruneStaleSubjects) {
      // History is an append-only time series (keyed by snapshot_date), so we
      // must keep every snapshot for subjects that still exist. We only sweep
      // rows whose subject is gone entirely — a deleted restaurant entity or a
      // removed connection — which can never be reached again and would
      // otherwise leak alongside the latest-score orphans pruned above.
      await this.prisma.$executeRaw`
        DELETE FROM core_public_entity_score_history h
        WHERE (
          h.subject_type = 'restaurant'::crave_score_subject_type
          AND NOT EXISTS (
            SELECT 1 FROM core_entities e
            WHERE e.entity_id = h.subject_id AND e.type = 'restaurant'
          )
        )
        OR (
          h.subject_type = 'connection'::crave_score_subject_type
          AND NOT EXISTS (
            SELECT 1 FROM core_restaurant_items c
            WHERE c.connection_id = h.subject_id
          )
        )
      `;
    }
  }

  private toNumber(value: NumericLike): number {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private round(value: number, digits = 6): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
