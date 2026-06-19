import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import {
  CraveScoreCandidate,
  CraveScoreMarketStat,
  CraveScoreSubjectType,
  PublicCraveScoreConfig,
  ScoredCraveSubject,
} from './public-crave-score.types';

type NumericLike = number | string | Prisma.Decimal | null | undefined;

type CandidateRow = {
  subject_type: CraveScoreSubjectType;
  subject_id: string;
  scoring_market_key: string | null;
  raw_quality_score: NumericLike;
  direct_mention_count: NumericLike;
  support_mention_count: NumericLike;
  upvote_mass: NumericLike;
  source_document_count: NumericLike;
};

type PriorScoreRow = {
  subject_type: CraveScoreSubjectType;
  subject_id: string;
  score_delta_days: number;
  display_score: NumericLike;
};

const DEFAULT_CONFIG: PublicCraveScoreConfig = {
  scoreVersion: 'crave-score-v2',
  displayCurveVersion: 'crave-score-display-v1',
  displayMin: 60,
  displayMax: 99.9,
  displayCenter: 0,
  displayScale: 0.31,
  marketReliabilityK: 80,
  entityConfidenceK: 4,
  entityConfidencePower: 3.8,
  robustSpreadFloor: 1,
  directMentionWeight: 0.75,
  upvoteMassWeight: 0.12,
  sourceBreadthWeight: 1.4,
  supportMentionWeight: 0.35,
};

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
  }): Promise<{
    scoreRunId: string;
    scoredCount: number;
    marketStatsCount: number;
  }> {
    const config = { ...DEFAULT_CONFIG, ...(params?.config ?? {}) };
    const recencyReferenceDate = params?.recencyReferenceDate ?? new Date();
    const scoreRunId = randomUUID();
    const startedAt = Date.now();

    await this.createRun(scoreRunId, config, recencyReferenceDate, params);

    try {
      const candidates = await this.loadCandidates(params);
      const priorScores = await this.loadPriorScores(
        config,
        recencyReferenceDate,
      );
      const { scored, marketStats } = this.scoreCandidates(
        candidates,
        priorScores,
        config,
      );

      await this.writeMarketStats(scoreRunId, marketStats);
      await this.writeScores(scoreRunId, scored, config, recencyReferenceDate);
      await this.completeRun(scoreRunId, {
        restaurants: scored.filter((row) => row.subjectType === 'restaurant')
          .length,
        connections: scored.filter((row) => row.subjectType === 'connection')
          .length,
        marketStats: marketStats.length,
      });

      this.logger.info('Rebuilt public Crave Scores', {
        scoreRunId,
        scoredCount: scored.length,
        marketStatsCount: marketStats.length,
        durationMs: Date.now() - startedAt,
      });

      return {
        scoreRunId,
        scoredCount: scored.length,
        marketStatsCount: marketStats.length,
      };
    } catch (error) {
      await this.failRun(scoreRunId, error);
      throw error;
    }
  }

  scoreCandidates(
    candidates: CraveScoreCandidate[],
    priorScores: Map<
      string,
      { score7d: number | null; score28d: number | null }
    >,
    config: PublicCraveScoreConfig = DEFAULT_CONFIG,
  ): { scored: ScoredCraveSubject[]; marketStats: CraveScoreMarketStat[] } {
    const bySubjectType = this.groupBy(
      candidates,
      (candidate) => candidate.subjectType,
    );
    const marketStats: CraveScoreMarketStat[] = [];
    const scored: ScoredCraveSubject[] = [];

    for (const [subjectType, subjectCandidates] of bySubjectType.entries()) {
      const globalDistribution = this.distributionStats(
        subjectCandidates.map((candidate) => candidate.rawQualityScore),
        config.robustSpreadFloor,
      );
      const byMarket = this.groupBy(
        subjectCandidates.filter((candidate) => candidate.scoringMarketKey),
        (candidate) => candidate.scoringMarketKey as string,
      );
      const marketDistribution = new Map<
        string,
        ReturnType<PublicCraveScoreService['distributionStats']> & {
          reliability: number;
          evidence: number;
        }
      >();

      for (const [marketKey, marketCandidates] of byMarket.entries()) {
        const stats = this.distributionStats(
          marketCandidates.map((candidate) => candidate.rawQualityScore),
          config.robustSpreadFloor,
        );
        const evidence = this.marketEvidence(marketCandidates, config);
        const reliability = this.saturating(
          evidence,
          config.marketReliabilityK,
        );
        marketDistribution.set(marketKey, { ...stats, reliability, evidence });
        marketStats.push({
          subjectType,
          marketKey,
          eligibleSubjectCount: marketCandidates.length,
          rawMedian: stats.median,
          rawMad: stats.mad,
          rawIqr: stats.iqr,
          rawSpread: stats.spread,
          globalMedian: globalDistribution.median,
          globalSpread: globalDistribution.spread,
          marketReliability: reliability,
          evidenceSummary: {
            effectiveMarketEvidence: this.round(evidence),
            sourceDocumentCount: this.sum(
              marketCandidates,
              'sourceDocumentCount',
            ),
          },
          factorTrace: {
            distribution: 'median_mad_iqr',
            marketReliabilityK: config.marketReliabilityK,
          },
        });
      }

      for (const candidate of subjectCandidates) {
        const marketStatsForCandidate = candidate.scoringMarketKey
          ? marketDistribution.get(candidate.scoringMarketKey)
          : null;
        const globalZ = this.robustZ(
          candidate.rawQualityScore,
          globalDistribution,
        );
        const marketZ = marketStatsForCandidate
          ? this.robustZ(candidate.rawQualityScore, marketStatsForCandidate)
          : null;
        const marketReliability = marketStatsForCandidate?.reliability ?? 0;
        const normalizedSignal =
          marketReliability * (marketZ ?? globalZ) +
          (1 - marketReliability) * globalZ;
        const entityEvidence = this.entityEvidence(candidate, config);
        const entityConfidence = this.saturating(
          entityEvidence,
          config.entityConfidenceK,
        );
        const confidenceShrink = Math.pow(
          entityConfidence,
          config.entityConfidencePower,
        );
        const posteriorSignal = confidenceShrink * normalizedSignal;
        const displayScore = this.displayScore(posteriorSignal, config);
        const prior = priorScores.get(this.subjectKey(candidate));
        const scoreDelta7d =
          prior?.score7d != null
            ? this.round(displayScore - prior.score7d, 1)
            : null;
        const scoreDelta28d =
          prior?.score28d != null
            ? this.round(displayScore - prior.score28d, 1)
            : null;
        const movementState =
          scoreDelta7d === null
            ? 'insufficient_history'
            : scoreDelta7d > 0
              ? 'rising'
              : scoreDelta7d < 0
                ? 'cooling'
                : 'stable';

        scored.push({
          ...candidate,
          globalZ: this.round(globalZ),
          marketZ: marketZ === null ? null : this.round(marketZ),
          marketReliability: this.round(marketReliability, 5),
          entityConfidence: this.round(entityConfidence, 5),
          normalizedSignal: this.round(normalizedSignal),
          posteriorSignal: this.round(posteriorSignal),
          displayScore,
          scoreDelta7d: scoreDelta7d === 0 ? null : scoreDelta7d,
          scoreDelta28d: scoreDelta28d === 0 ? null : scoreDelta28d,
          movementState,
          factorTrace: {
            rawQualitySource: 'source_facts_only',
            privateEvidence: {
              directMentionCount: candidate.directMentionCount,
              supportMentionCount: candidate.supportMentionCount,
              upvoteMass: candidate.upvoteMass,
              sourceDocumentCount: candidate.sourceDocumentCount,
            },
            globalDistribution,
            marketDistribution: marketStatsForCandidate
              ? {
                  median: marketStatsForCandidate.median,
                  spread: marketStatsForCandidate.spread,
                  reliability: this.round(marketReliability, 5),
                }
              : null,
            config: {
              scoreVersion: config.scoreVersion,
              displayCurveVersion: config.displayCurveVersion,
              entityConfidencePower: config.entityConfidencePower,
            },
          },
        });
      }
    }

    return { scored, marketStats };
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

  private async loadCandidates(params?: {
    fixtureRunId?: string;
  }): Promise<CraveScoreCandidate[]> {
    const fixtureRunId = params?.fixtureRunId ?? null;
    const fixtureFilter = fixtureRunId
      ? Prisma.sql`AND fixture_run_id = ${fixtureRunId}`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      WITH restaurant_markets AS (
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
      ),
      restaurant_item_aggregates AS (
        SELECT
          restaurant_id,
          SUM(mention_count)::numeric AS direct_mention_count,
          SUM(support_mention_count)::numeric AS support_mention_count,
          SUM(total_upvotes)::numeric AS upvote_mass
        FROM core_restaurant_items
        GROUP BY restaurant_id
      ),
      restaurant_source_aggregates AS (
        SELECT
          restaurant_id,
          COUNT(DISTINCT source_document_id)::numeric AS source_document_count
        FROM core_restaurant_events
        GROUP BY restaurant_id
      ),
      connection_source_aggregates AS (
        SELECT
          c.connection_id,
          COUNT(DISTINCT ree.source_document_id)::numeric AS source_document_count
        FROM core_restaurant_items c
        LEFT JOIN core_restaurant_entity_events ree
          ON ree.restaurant_id = c.restaurant_id
         AND ree.entity_id = c.food_id
        GROUP BY c.connection_id
      ),
      restaurant_raw AS (
        SELECT
          'restaurant'::crave_score_subject_type AS subject_type,
          e.entity_id AS subject_id,
          rm.market_key AS scoring_market_key,
          (
            35
            + LN(1 + COALESCE(ria.direct_mention_count, 0)) * 9
            + LN(1 + COALESCE(ria.support_mention_count, 0)) * 4
            + LN(1 + COALESCE(ria.upvote_mass, 0)) * 4
            + LN(1 + COALESCE(rsa.source_document_count, 0)) * 11
          )::numeric AS raw_quality_score,
          COALESCE(ria.direct_mention_count, 0)::numeric AS direct_mention_count,
          COALESCE(ria.support_mention_count, 0)::numeric AS support_mention_count,
          COALESCE(ria.upvote_mass, 0)::numeric AS upvote_mass,
          COALESCE(rsa.source_document_count, 0)::numeric AS source_document_count,
          (e.restaurant_metadata->>'fixtureRunId') AS fixture_run_id
        FROM core_entities e
        LEFT JOIN restaurant_markets rm ON rm.entity_id = e.entity_id
        LEFT JOIN restaurant_item_aggregates ria ON ria.restaurant_id = e.entity_id
        LEFT JOIN restaurant_source_aggregates rsa ON rsa.restaurant_id = e.entity_id
        WHERE e.type = 'restaurant'
      ),
      connection_raw AS (
        SELECT
          'connection'::crave_score_subject_type AS subject_type,
          c.connection_id AS subject_id,
          rm.market_key AS scoring_market_key,
          (
            35
            + LN(1 + COALESCE(c.mention_count, 0)) * 9
            + LN(1 + COALESCE(c.support_mention_count, 0)) * 4
            + LN(1 + COALESCE(c.total_upvotes, 0)) * 4
            + LN(1 + COALESCE(csa.source_document_count, 0)) * 11
          )::numeric AS raw_quality_score,
          COALESCE(c.mention_count, 0)::numeric AS direct_mention_count,
          COALESCE(c.support_mention_count, 0)::numeric AS support_mention_count,
          COALESCE(c.total_upvotes, 0)::numeric AS upvote_mass,
          COALESCE(csa.source_document_count, 0)::numeric AS source_document_count,
          (r.restaurant_metadata->>'fixtureRunId') AS fixture_run_id
        FROM core_restaurant_items c
        JOIN core_entities r ON r.entity_id = c.restaurant_id
        LEFT JOIN restaurant_markets rm ON rm.entity_id = c.restaurant_id
        LEFT JOIN connection_source_aggregates csa ON csa.connection_id = c.connection_id
      ),
      all_candidates AS (
        SELECT * FROM restaurant_raw
        UNION ALL
        SELECT * FROM connection_raw
      )
      SELECT *
      FROM all_candidates
      WHERE TRUE
        ${fixtureFilter}
    `;

    return rows.map((row) => ({
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      scoringMarketKey: row.scoring_market_key,
      rawQualityScore: this.toNumber(row.raw_quality_score),
      directMentionCount: this.toNumber(row.direct_mention_count),
      supportMentionCount: this.toNumber(row.support_mention_count),
      upvoteMass: this.toNumber(row.upvote_mass),
      sourceDocumentCount: this.toNumber(row.source_document_count),
    }));
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

  private async writeMarketStats(
    scoreRunId: string,
    marketStats: CraveScoreMarketStat[],
  ): Promise<void> {
    if (!marketStats.length) {
      return;
    }
    await this.prisma.$transaction(
      marketStats.map(
        (stat) =>
          this.prisma.$executeRaw`
          INSERT INTO core_crave_score_market_stats (
            score_run_id,
            subject_type,
            market_key,
            eligible_subject_count,
            raw_median,
            raw_mad,
            raw_iqr,
            raw_spread,
            global_median,
            global_spread,
            market_reliability,
            evidence_summary,
            factor_trace,
            computed_at
          )
          VALUES (
            ${scoreRunId}::uuid,
            ${stat.subjectType}::crave_score_subject_type,
            ${stat.marketKey},
            ${stat.eligibleSubjectCount},
            ${stat.rawMedian},
            ${stat.rawMad},
            ${stat.rawIqr},
            ${stat.rawSpread},
            ${stat.globalMedian},
            ${stat.globalSpread},
            ${stat.marketReliability},
            ${JSON.stringify(stat.evidenceSummary)}::jsonb,
            ${JSON.stringify(stat.factorTrace)}::jsonb,
            now()
          )
        `,
      ),
    );
  }

  private async writeScores(
    scoreRunId: string,
    scored: ScoredCraveSubject[],
    config: PublicCraveScoreConfig,
    referenceDate: Date,
  ): Promise<void> {
    if (!scored.length) {
      return;
    }

    await this.prisma.$transaction(
      scored.map(
        (row) =>
          this.prisma.$executeRaw`
          INSERT INTO core_public_entity_scores (
            subject_type,
            subject_id,
            score_run_id,
            scoring_market_key,
            raw_quality_score,
            global_z,
            market_z,
            market_reliability,
            entity_confidence,
            normalized_signal,
            posterior_signal,
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
            ${row.rawQualityScore},
            ${row.globalZ},
            ${row.marketZ},
            ${row.marketReliability},
            ${row.entityConfidence},
            ${row.normalizedSignal},
            ${row.posteriorSignal},
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
            raw_quality_score = EXCLUDED.raw_quality_score,
            global_z = EXCLUDED.global_z,
            market_z = EXCLUDED.market_z,
            market_reliability = EXCLUDED.market_reliability,
            entity_confidence = EXCLUDED.entity_confidence,
            normalized_signal = EXCLUDED.normalized_signal,
            posterior_signal = EXCLUDED.posterior_signal,
            display_score = EXCLUDED.display_score,
            score_delta_7d = EXCLUDED.score_delta_7d,
            score_delta_28d = EXCLUDED.score_delta_28d,
            movement_state = EXCLUDED.movement_state,
            score_version = EXCLUDED.score_version,
            display_curve_version = EXCLUDED.display_curve_version,
            factor_trace = EXCLUDED.factor_trace,
            computed_at = EXCLUDED.computed_at
        `,
      ),
    );

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
            normalized_signal,
            posterior_signal,
            entity_confidence,
            market_reliability,
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
            ${row.normalizedSignal},
            ${row.posteriorSignal},
            ${row.entityConfidence},
            ${row.marketReliability},
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
            normalized_signal = EXCLUDED.normalized_signal,
            posterior_signal = EXCLUDED.posterior_signal,
            entity_confidence = EXCLUDED.entity_confidence,
            market_reliability = EXCLUDED.market_reliability,
            movement_state = EXCLUDED.movement_state,
            factor_trace = EXCLUDED.factor_trace,
            computed_at = EXCLUDED.computed_at
        `,
      ),
    );
  }

  private distributionStats(
    values: number[],
    spreadFloor: number,
  ): {
    median: number;
    mad: number;
    iqr: number;
    spread: number;
  } {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) {
      return {
        median: 0,
        mad: spreadFloor,
        iqr: spreadFloor,
        spread: spreadFloor,
      };
    }
    const median = this.percentile(sorted, 0.5);
    const deviations = sorted
      .map((value) => Math.abs(value - median))
      .sort((a, b) => a - b);
    const mad = this.percentile(deviations, 0.5);
    const q1 = this.percentile(sorted, 0.25);
    const q3 = this.percentile(sorted, 0.75);
    const iqr = q3 - q1;
    const spread = Math.max(spreadFloor, mad * 1.4826, iqr / 1.349);
    return {
      median: this.round(median),
      mad: this.round(mad),
      iqr: this.round(iqr),
      spread: this.round(spread),
    };
  }

  private percentile(sortedValues: number[], p: number): number {
    if (!sortedValues.length) {
      return 0;
    }
    if (sortedValues.length === 1) {
      return sortedValues[0];
    }
    const index = (sortedValues.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  private robustZ(
    value: number,
    stats: { median: number; spread: number },
  ): number {
    return (value - stats.median) / Math.max(stats.spread, 0.0001);
  }

  private displayScore(value: number, config: PublicCraveScoreConfig): number {
    const sigmoid =
      1 /
      (1 + Math.exp(-((value - config.displayCenter) / config.displayScale)));
    return this.round(
      config.displayMin + (config.displayMax - config.displayMin) * sigmoid,
      1,
    );
  }

  private entityEvidence(
    candidate: CraveScoreCandidate,
    config: PublicCraveScoreConfig,
  ): number {
    return (
      Math.log1p(candidate.directMentionCount) * config.directMentionWeight +
      Math.log1p(candidate.supportMentionCount) * config.supportMentionWeight +
      Math.log1p(candidate.upvoteMass) * config.upvoteMassWeight +
      Math.log1p(candidate.sourceDocumentCount) * config.sourceBreadthWeight
    );
  }

  private marketEvidence(
    candidates: CraveScoreCandidate[],
    config: PublicCraveScoreConfig,
  ): number {
    return (
      candidates.length +
      Math.log1p(this.sum(candidates, 'directMentionCount')) *
        config.directMentionWeight +
      Math.log1p(this.sum(candidates, 'sourceDocumentCount')) *
        config.sourceBreadthWeight
    );
  }

  private saturating(evidence: number, k: number): number {
    return this.round(
      1 - Math.exp(-Math.max(0, evidence) / Math.max(k, 0.0001)),
      5,
    );
  }

  private subjectKey(
    candidate: Pick<CraveScoreCandidate, 'subjectType' | 'subjectId'>,
  ): string {
    return `${candidate.subjectType}:${candidate.subjectId}`;
  }

  private groupBy<T, K>(values: T[], keyFn: (value: T) => K): Map<K, T[]> {
    const grouped = new Map<K, T[]>();
    for (const value of values) {
      const key = keyFn(value);
      const bucket = grouped.get(key) ?? [];
      bucket.push(value);
      grouped.set(key, bucket);
    }
    return grouped;
  }

  private sum<T>(values: T[], key: keyof T): number {
    return values.reduce(
      (total, value) => total + this.toNumber(value[key] as NumericLike),
      0,
    );
  }

  private toNumber(value: NumericLike): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value && typeof value === 'object' && 'toNumber' in value) {
      const parsed = value.toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private round(value: number, digits = 6): number {
    return Number(value.toFixed(digits));
  }
}
