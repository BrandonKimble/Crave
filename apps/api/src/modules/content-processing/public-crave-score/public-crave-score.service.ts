import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import {
  CraveScoreCandidates,
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
  mentions_fast: NumericLike;
  upvotes_fast: NumericLike;
};

type RestaurantRow = {
  restaurant_id: string;
  scoring_market_key: string | null;
  praise_mentions: NumericLike;
  praise_upvotes: NumericLike;
  praise_mentions_fast: NumericLike;
  praise_upvotes_fast: NumericLike;
};

const DEFAULT_CONFIG: PublicCraveScoreConfig = {
  scoreVersion: 'crave-score-v3',
  displayCurveVersion: 'crave-score-display-v6',
  displayMin: 0,
  displayMax: 10,
  bellK: 3.0,
  discountRho: 0.5,
  dishWeight: 1.0,
  praiseWeight: 2.0,
  upvoteWeight: 0.7,
  endorsementHalfLifeDays: 365,
  risingHalfLifeDays: 21,
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
      // Dual pass inside ONE run: one SQL pass emits BOTH decayed masses (stable
      // half-life + fast half-life); we score each in memory, then `rising` is the
      // per-subject delta of the fast vs stable un-rounded display values. We must
      // NOT issue a second run/write/prune — the keyed upsert + stale-prune would
      // wipe the first pass.
      const { stable, fast } = await this.loadCandidates(config, params);
      const stableScored = this.scoreCandidates(stable, config);
      const fastScored = this.scoreCandidates(fast, config);

      const fastDisplayByKey = new Map<string, number>();
      for (const row of fastScored) {
        fastDisplayByKey.set(`${row.subjectType}:${row.subjectId}`, row.rawDisplay);
      }
      const scored = stableScored.map((row) => {
        const fastRaw = fastDisplayByKey.get(
          `${row.subjectType}:${row.subjectId}`,
        );
        return {
          ...row,
          rising: fastRaw != null ? this.round(fastRaw - row.rawDisplay, 3) : null,
        };
      });

      // Only a full/global rebuild owns the entire scored set, so only it may
      // prune subjects outside this run's output. A fixture-scoped rebuild
      // writes a subset and must never touch unrelated subjects.
      const pruneStaleSubjects = !params?.fixtureRunId;
      await this.writeScores(scoreRunId, scored, config, pruneStaleSubjects);
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
  // A single pass over ONE set of decayed masses. Dishes are atomic: a dish's
  // score is its own endorsement strength. Restaurants are composite: a discounted
  // aggregate of their dishes' endorsement (best dish counts fully, each next one
  // less) plus a by-name praise term (which alone carries dishless restaurants).
  // Each subject type is normalized by GLOBAL percentile → one stable meaning.
  //
  // `endorse` pools mentions + upvotes (a written mention counts as 1; an upvote / poll-like
  // counts as config.upvoteWeight = 0.7 — a gentle premium for the conviction + origination of
  // writing, while still treating agreement as a strong signal) and keeps log1p: for a single
  // dish mass the log is rank-irrelevant, but it holds the restaurant composite's operands on the
  // scale its rho/weights are tuned for. `rising` is left null here and filled by the dual pass
  // in rebuildAllScores.
  scoreCandidates(
    candidates: CraveScoreCandidates,
    config: PublicCraveScoreConfig = DEFAULT_CONFIG,
  ): ScoredCraveSubject[] {
    const endorse = (mentions: number, upvotes: number): number =>
      Math.log1p(
        Math.max(0, mentions) + config.upvoteWeight * Math.max(0, upvotes),
      );

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
          {
            kind: 'dish',
            endorsers: this.round(entry.dish.mentions + entry.dish.upvotes),
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
    endorsementTrace: Record<string, unknown>,
  ): ScoredCraveSubject {
    const rawDisplay = this.displayFromPercentile(percentile, config);
    return {
      subjectType,
      subjectId,
      scoringMarketKey,
      endorsementRaw: this.round(endorsementRaw),
      percentileRank: this.round(percentile, 5),
      rawDisplay,
      displayScore: this.round(rawDisplay, 2),
      rising: null,
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

  // Map a uniform percentile [0,1] to the display value. `bellK` null → the linear (uniform) map;
  // otherwise the inverse-CDF of a TRUNCATED NORMAL centered at the band midpoint with std `bellK`
  // — so the displayed-score DISTRIBUTION is a bell (most places mid, extremes rare). It reaches
  // displayMin/Max smoothly at p=0/1 with no pile-up at the bounds (a clamped probit would clump
  // the tails). Ranking is preserved (monotonic); this is a pure presentation reshape.
  private displayFromPercentile(
    percentile: number,
    config: PublicCraveScoreConfig,
  ): number {
    const { displayMin, displayMax } = config;
    if (config.bellK == null) {
      return displayMin + (displayMax - displayMin) * percentile;
    }
    const mid = (displayMin + displayMax) / 2;
    const lo = this.normalCdf((displayMin - mid) / config.bellK);
    const hi = this.normalCdf((displayMax - mid) / config.bellK);
    const z = this.probit(lo + percentile * (hi - lo));
    return Math.max(displayMin, Math.min(displayMax, mid + config.bellK * z));
  }

  // Standard-normal CDF Φ via erf (Abramowitz & Stegun 7.1.26).
  private normalCdf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * ax);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
        0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-ax * ax);
    return 0.5 * (1 + sign * y);
  }

  // Inverse standard-normal CDF Φ⁻¹ (probit), Acklam's rational approximation.
  private probit(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [
      -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
      1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
    ];
    const b = [
      -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
      6.680131188771972e1, -1.328068155288572e1,
    ];
    const c = [
      -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
      -2.549732539343734, 4.374664141464968, 2.938163982698783,
    ];
    const d = [
      7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
      3.754408661907416,
    ];
    const plow = 0.02425;
    const phigh = 1 - plow;
    if (p < plow) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    }
    if (p <= phigh) {
      const q = p - 0.5;
      const r = q * q;
      return (
        ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
          q) /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
      );
    }
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  private percentileRanks(values: number[]): number[] {
    const n = values.length;
    const ranks = new Array<number>(n).fill(0.5);
    if (n <= 1) {
      return ranks;
    }
    const order = values
      .map((value, index) => [value, index] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    // Tie-averaging: subjects with identical endorsement share one percentile (the average of
    // their sorted positions), so equal endorsement → equal score and the result is independent
    // of the (unstable) query row order. (i + j) / 2 / (n - 1) maps rank positions to [0, 1].
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1][0] === order[i][0]) {
        j += 1;
      }
      const pct = (i + j) / 2 / (n - 1);
      for (let k = i; k <= j; k += 1) {
        ranks[order[k][1]] = pct;
      }
      i = j + 1;
    }
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

  // Loads candidates with BOTH decayed masses in one scan per table: the stable
  // (endorsementHalfLifeDays) and fast (risingHalfLifeDays) half-lives. Returns two
  // candidate views over the same subjects so scoreCandidates can run once per axis.
  private async loadCandidates(
    config: PublicCraveScoreConfig,
    params?: {
      fixtureRunId?: string;
    },
  ): Promise<{ stable: CraveScoreCandidates; fast: CraveScoreCandidates }> {
    const fixtureRunId = params?.fixtureRunId ?? null;
    const dishFixtureFilter = fixtureRunId
      ? Prisma.sql`r.restaurant_metadata->>'fixtureRunId' = ${fixtureRunId}`
      : Prisma.sql`TRUE`;
    const restFixtureFilter = fixtureRunId
      ? Prisma.sql`e.restaurant_metadata->>'fixtureRunId' = ${fixtureRunId}`
      : Prisma.sql`TRUE`;
    // Half-lives are trusted numeric config values (never user input); inline them
    // as SQL numeric literals so the decay weight is a plain expression. Clamp to a
    // tiny positive so a bad/zero/negative config can't divide-by-zero or invert
    // decay; ages are clamped to >=0 below so a future-dated mention can't weigh >1.
    const halfLife = Prisma.raw(
      `(${Math.max(0.0001, Number(config.endorsementHalfLifeDays) || 0)})::numeric`,
    );
    const halfLifeFast = Prisma.raw(
      `(${Math.max(0.0001, Number(config.risingHalfLifeDays) || 0)})::numeric`,
    );

    const dishRows = await this.prisma.$queryRaw<DishRow[]>`
      WITH ${RESTAURANT_MARKETS_CTE}
      SELECT
        c.connection_id,
        c.restaurant_id,
        rm.market_key AS scoring_market_key,
        COALESCE(d.mentions, 0)::numeric AS mentions,
        COALESCE(d.upvotes, 0)::numeric AS upvotes,
        COALESCE(d.mentions_fast, 0)::numeric AS mentions_fast,
        COALESCE(d.upvotes_fast, 0)::numeric AS upvotes_fast
      FROM core_restaurant_items c
      JOIN core_entities r ON r.entity_id = c.restaurant_id
      LEFT JOIN restaurant_markets rm ON rm.entity_id = c.restaurant_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLife})), 0) AS mentions,
          COALESCE(SUM(m.source_upvotes * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLife})), 0) AS upvotes,
          COALESCE(SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLifeFast})), 0) AS mentions_fast,
          COALESCE(SUM(m.source_upvotes * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLifeFast})), 0) AS upvotes_fast
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
          SUM(upv * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - mentioned_at)))/86400.0/${halfLife}))::numeric AS praise_upvotes,
          SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - mentioned_at)))/86400.0/${halfLifeFast}))::numeric AS praise_mentions_fast,
          SUM(upv * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - mentioned_at)))/86400.0/${halfLifeFast}))::numeric AS praise_upvotes_fast
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
        COALESCE(rp.praise_upvotes, 0)::numeric AS praise_upvotes,
        COALESCE(rp.praise_mentions_fast, 0)::numeric AS praise_mentions_fast,
        COALESCE(rp.praise_upvotes_fast, 0)::numeric AS praise_upvotes_fast
      FROM core_entities e
      LEFT JOIN restaurant_markets rm ON rm.entity_id = e.entity_id
      LEFT JOIN restaurant_praise rp ON rp.restaurant_id = e.entity_id
      WHERE e.type = 'restaurant'
        AND ${restFixtureFilter}
    `;

    const stableDishes: DishCandidate[] = dishRows.map((row) => ({
      connectionId: row.connection_id,
      restaurantId: row.restaurant_id,
      scoringMarketKey: row.scoring_market_key,
      mentions: this.toNumber(row.mentions),
      upvotes: this.toNumber(row.upvotes),
    }));
    const fastDishes: DishCandidate[] = dishRows.map((row) => ({
      connectionId: row.connection_id,
      restaurantId: row.restaurant_id,
      scoringMarketKey: row.scoring_market_key,
      mentions: this.toNumber(row.mentions_fast),
      upvotes: this.toNumber(row.upvotes_fast),
    }));
    const stableRestaurants: RestaurantCandidate[] = restRows.map((row) => ({
      restaurantId: row.restaurant_id,
      scoringMarketKey: row.scoring_market_key,
      praiseMentions: this.toNumber(row.praise_mentions),
      praiseUpvotes: this.toNumber(row.praise_upvotes),
    }));
    const fastRestaurants: RestaurantCandidate[] = restRows.map((row) => ({
      restaurantId: row.restaurant_id,
      scoringMarketKey: row.scoring_market_key,
      praiseMentions: this.toNumber(row.praise_mentions_fast),
      praiseUpvotes: this.toNumber(row.praise_upvotes_fast),
    }));

    return {
      stable: { dishes: stableDishes, restaurants: stableRestaurants },
      fast: { dishes: fastDishes, restaurants: fastRestaurants },
    };
  }

  private async writeScores(
    scoreRunId: string,
    scored: ScoredCraveSubject[],
    config: PublicCraveScoreConfig,
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
            rising,
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
            ${row.rising},
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
            rising = EXCLUDED.rising,
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
