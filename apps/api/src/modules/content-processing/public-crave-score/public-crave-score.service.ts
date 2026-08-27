import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { notABallotDocumentSql } from '../../polls/supply/ballot-document-marker';
import { randomUUID } from 'crypto';
import { activePlaceEventsSourceSql } from '../reddit-collector/extraction-scope.service';
import { marketIncludedSql } from '../../restaurant-enrichment/servable-place-scope';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import {
  CraveScoreCandidates,
  CraveScoreSubjectType,
  DishCandidate,
  PublicCraveScoreConfig,
  PlaceCandidate,
  ScoredCraveSubject,
  SourceContribution,
} from './public-crave-score.types';
import {
  CALIBRATION_LANES,
  CalibrationIndex,
  CalibrationLane,
  LaneCalibrationConstants,
  SourceActivity,
  buildCalibrationIndex,
  poolSourcesByMarket,
  distinctRoomActivities,
  calibrationG,
  calibrationInfluence,
  deriveLaneConstants,
  laneActivity,
  neutralCalibrationIndex,
  observedDays,
} from './score-calibration';

type NumericLike = number | string | Prisma.Decimal | null | undefined;

type DishRow = {
  connection_id: string;
  place_id: string;
  source_id: string | null;
  platform: string | null;
  mentions: NumericLike;
  upvotes: NumericLike;
  mentions_fast: NumericLike;
  upvotes_fast: NumericLike;
};

type PlaceRow = {
  place_id: string;
  source_id: string | null;
  platform: string | null;
  praise_mentions: NumericLike;
  praise_upvotes: NumericLike;
  praise_mentions_fast: NumericLike;
  praise_upvotes_fast: NumericLike;
};

type SourceActivityRow = {
  source_id: string;
  platform: string;
  anchor_place_id: string | null;
  engine_id: string | null;
  created_at: Date;
  first_doc: Date | null;
  last_doc: Date | null;
  mass_stable: NumericLike;
  mass_fast: NumericLike;
  last_ran_at: Date | null;
};

const DEFAULT_CONFIG: PublicCraveScoreConfig = {
  // ONE scoreVersion (§8/§15): v4 = v3 math over per-source-calibrated
  // masses. The per-lane A_ref/A_floor pins are keyed by THIS string —
  // changing calibration inputs requires bumping it (a new epoch).
  scoreVersion: 'crave-score-v4',
  displayCurveVersion: 'crave-score-display-v6',
  // §16 classifications (master plan constants constitution — values are
  // classified in the plan's inventory; do not change without its process):
  // displayMin/displayMax — K1 (owner-ratified product sentence: scores
  // display on a 0–10 scale; part of the DONE Crave Score redesign).
  displayMin: 0,
  displayMax: 10,
  // bellK — K5 (display-curve-version-bound: the truncated-normal display
  // shape; re-probe rides a displayCurveVersion bump, never a live edit).
  bellK: 3.0,
  // discountRho — K5 (§8 Phase-0 dial re-probe on CALIBRATED masses: the
  // geometric dish-acclaim discount 0.5, scoreVersion-epoch-bound).
  discountRho: 0.5,
  dishWeight: 1.0,
  // praiseWeight — K5 (§8 Phase-0 dial re-probe pair of discountRho:
  // praise 2×, re-probed per scoreVersion epoch on calibrated masses).
  praiseWeight: 2.0,
  // upvoteWeight — K5 with a pre-agreed K2 adoption path (§8 upvote-
  // linearity named gate: 0.7 stands until the measured u_i/ū_source share
  // replaces it — measured share, never a fitted exponent).
  upvoteWeight: 0.7,
  // endorsementHalfLifeDays / risingHalfLifeDays — K1 (owner-ratified
  // product sentences: 365d stable / 21d rising mention half-lives).
  endorsementHalfLifeDays: 365,
  risingHalfLifeDays: 21,
  // §8: default 1.0 per platform class (a poll vote ≈ a Reddit mention);
  // only deviations are listed, so {} = every class at 1.0.
  sourceClassInfluence: {},
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
  }): Promise<{ scoreRunId: string; scoredCount: number }> {
    const config = { ...DEFAULT_CONFIG, ...(params?.config ?? {}) };
    const recencyReferenceDate = params?.recencyReferenceDate ?? new Date();
    const scoreRunId = randomUUID();
    const startedAt = Date.now();

    // §8 per-source calibration: measure every source's room (A per lane),
    // resolve the epoch's pinned per-lane constants (pin them on first use
    // of this scoreVersion), and build the g lookups.
    const sources = await this.loadSourceActivities(config);
    const calibration = await this.resolveCalibration(config, sources);

    await this.createRun(scoreRunId, config, recencyReferenceDate, {
      fixtureRunId: params?.fixtureRunId,
      calibration: {
        stable: {
          ...calibration.stable.constants,
          lane: 'stable',
        },
        fast: { ...calibration.fast.constants, lane: 'fast' },
        sources: sources.map((source) => ({
          sourceId: source.sourceId,
          platform: source.platform,
          anchorPlaceId: source.anchorPlaceId,
          engineId: source.engineId,
          aStable: Number(source.activity.stable.toPrecision(6)),
          aFast: Number(source.activity.fast.toPrecision(6)),
        })),
      },
    });

    try {
      // Dual pass inside ONE run: one SQL pass emits BOTH decayed masses (stable
      // half-life + fast half-life); we score each in memory, then `rising` is the
      // per-subject delta of the fast vs stable un-rounded display values. We must
      // NOT issue a second run/write/prune — the keyed upsert + stale-prune would
      // wipe the first pass.
      const { stable, fast } = await this.loadCandidates(config, params);
      const threadShare =
        config.pooling === 'thread-share' ||
        config.pooling === 'thread-share-confidence'
          ? await this.threadShareEndorsements(config)
          : undefined;
      const stableScored = this.scoreCandidates(
        stable,
        config,
        calibration.stable,
        threadShare,
      );
      const fastScored = this.scoreCandidates(fast, config, calibration.fast);

      const fastDisplayByKey = new Map<string, number>();
      for (const row of fastScored) {
        fastDisplayByKey.set(
          `${row.subjectType}:${row.subjectId}`,
          row.rawDisplay,
        );
      }
      const scored = stableScored.map((row) => {
        const fastRaw = fastDisplayByKey.get(
          `${row.subjectType}:${row.subjectId}`,
        );
        return {
          ...row,
          rising:
            fastRaw != null ? this.round(fastRaw - row.rawDisplay, 3) : null,
        };
      });

      // Only a full/global rebuild owns the entire scored set, so only it may
      // prune subjects outside this run's output. A fixture-scoped rebuild
      // writes a subset and must never touch unrelated subjects.
      const pruneStaleSubjects = !params?.fixtureRunId;
      await this.writeScores(scoreRunId, scored, config, pruneStaleSubjects);
      await this.completeRun(scoreRunId, {
        places: scored.filter((row) => row.subjectType === 'restaurant').length,
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

  // ── Scoring (v4): per-source calibration → endorsement → percentile ───────
  //
  // A single pass over ONE lane's decayed masses. Dishes are atomic: a dish's
  // score is its own endorsement strength. Restaurants are composite: a discounted
  // aggregate of their dishes' endorsement (best dish counts fully, each next one
  // less) plus a by-name praise term (which alone carries dishless restaurants).
  // Each subject type is normalized by GLOBAL percentile → one stable meaning
  // (one global pool per subject type — the PURPOSE of calibration, §8).
  //
  // §8 calibration happens INSIDE log1p: pooled = Σ over source rooms of
  // influence(platform) · (m + upvoteWeight·u) / g(source), endorsement =
  // log1p(pooled). A written mention counts 1, an upvote/poll-like counts
  // upvoteWeight = 0.7; g divides the mention by the size of ITS OWN room, so
  // one global percentile pool stays meaningful across rooms of wildly
  // different activity. v3 downstream (log1p → rho discount → praise 2× →
  // percentile → truncated-normal display) is unchanged. With no calibration
  // index (fixtures) g = 1 everywhere and the math IS raw v3.
  scoreCandidates(
    candidates: CraveScoreCandidates,
    config: PublicCraveScoreConfig = DEFAULT_CONFIG,
    calibration: CalibrationIndex = neutralCalibrationIndex('stable'),
    /** Bake-off variant input (pooling thread-share*): per-place decayed
     *  conversation-share endorsement, computed by threadShareEndorsements. */
    threadShareEndorsements?: ReadonlyMap<string, number>,
  ): ScoredCraveSubject[] {
    const pooledOne = (contribution: SourceContribution): number =>
      (calibrationInfluence(calibration, contribution.platform) *
        (Math.max(0, contribution.mentions) +
          config.upvoteWeight * Math.max(0, contribution.upvotes))) /
      calibrationG(calibration, contribution.sourceId);
    const compress = config.compression === 'sqrt' ? Math.sqrt : Math.log1p;
    const endorse = (contributions: SourceContribution[]): number =>
      compress(
        Math.max(
          0,
          contributions.reduce((sum, c) => sum + pooledOne(c), 0),
        ),
      );
    const rawEndorsers = (contributions: SourceContribution[]): number =>
      contributions.reduce(
        (sum, c) => sum + Math.max(0, c.mentions) + Math.max(0, c.upvotes),
        0,
      );

    // §5 scoring provenance: per subject, the source with the dominant
    // calibrated pooled mass (unattributed mass can never be provenance).
    const accumulateProvenance = (
      map: Map<string, number>,
      contributions: SourceContribution[],
    ): void => {
      for (const contribution of contributions) {
        if (!contribution.sourceId) continue;
        map.set(
          contribution.sourceId,
          (map.get(contribution.sourceId) ?? 0) + pooledOne(contribution),
        );
      }
    };
    const dominantSource = (map: Map<string, number>): string | null => {
      let best: string | null = null;
      let bestMass = 0;
      for (const [sourceId, mass] of map) {
        if (
          mass > bestMass ||
          (mass === bestMass && best !== null && sourceId < best)
        ) {
          best = sourceId;
          bestMass = mass;
        }
      }
      return bestMass > 0 ? best : null;
    };

    // 1. Dish endorsement + group by restaurant.
    const dishEndorsement = new Map<string, number>();
    const dishesByPlace = new Map<string, number[]>();
    const dishContributionsByPlace = new Map<string, SourceContribution[]>();
    for (const dish of candidates.dishes) {
      const value = endorse(dish.contributions);
      dishEndorsement.set(dish.connectionId, value);
      const bucket = dishesByPlace.get(dish.placeId);
      if (bucket) {
        bucket.push(value);
      } else {
        dishesByPlace.set(dish.placeId, [value]);
      }
      const contributionBucket = dishContributionsByPlace.get(dish.placeId);
      if (contributionBucket) {
        contributionBucket.push(...dish.contributions);
      } else {
        dishContributionsByPlace.set(dish.placeId, [...dish.contributions]);
      }
    }

    // 2. Restaurant endorsement = discounted dish-acclaim + praise.
    const placeAggregate = new Map<
      string,
      {
        endorsement: number;
        acclaim: number;
        praise: number;
        dishCount: number;
        bestDish: number;
        provenanceSourceId: string | null;
      }
    >();
    for (const place of candidates.places) {
      const dishes = (dishesByPlace.get(place.placeId) ?? [])
        .slice()
        .sort((a, b) => b - a);
      let acclaim = 0;
      for (let i = 0; i < dishes.length; i += 1) {
        acclaim += Math.pow(config.discountRho, i) * dishes[i];
      }
      const praise = endorse(place.praiseContributions);
      // Provenance pools the restaurant's OWN praise rooms with its dishes'
      // rooms on raw calibrated mass (the composite's rho/praise weighting is
      // a ranking shape, not a provenance question).
      const provenanceMass = new Map<string, number>();
      accumulateProvenance(provenanceMass, place.praiseContributions);
      accumulateProvenance(
        provenanceMass,
        dishContributionsByPlace.get(place.placeId) ?? [],
      );
      // ONE-POOL (probe): every ballot endorsing this place — through a
      // dish or by name — lands in one pool under one law. See
      // PublicCraveScoreConfig.pooling.
      const onePool =
        config.pooling === 'one-pool'
          ? endorse([
              ...(dishContributionsByPlace.get(place.placeId) ?? []),
              ...place.praiseContributions,
            ])
          : null;
      placeAggregate.set(place.placeId, {
        endorsement:
          onePool ?? config.dishWeight * acclaim + config.praiseWeight * praise,
        acclaim,
        praise,
        dishCount: dishes.length,
        bestDish: dishes[0] ?? 0,
        provenanceSourceId: dominantSource(provenanceMass),
      });
    }

    // THREAD-SHARE POOLING (bake-off variant, owner-tabled 2026-08-17): a
    // thread is a poll — a place's stable endorsement is its decayed SHARE
    // of each conversation's ballots ('confidence' multiplies each poll by
    // total/(total+8) so tiny uncontested threads count fractionally).
    // Probe-only shape: overrides the STABLE restaurant endorsement; dish
    // scores and the rising delta keep the structured math.
    if (
      threadShareEndorsements &&
      (config.pooling === 'thread-share' ||
        config.pooling === 'thread-share-confidence')
    ) {
      for (const [placeId, aggregate] of placeAggregate) {
        aggregate.endorsement = threadShareEndorsements.get(placeId) ?? 0;
      }
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
      const provenanceMass = new Map<string, number>();
      accumulateProvenance(provenanceMass, entry.dish.contributions);
      scored.push(
        this.buildScored(
          'connection',
          entry.dish.connectionId,
          dominantSource(provenanceMass),
          entry.endorsement,
          dishRanks[i],
          config,
          calibration,
          {
            kind: 'dish',
            endorsers: this.round(rawEndorsers(entry.dish.contributions)),
          },
        ),
      );
    });

    // 3b. Restaurants — inclusion floor: any endorsement (dish acclaim or praise).
    const restEntries = candidates.places
      .map((place) => ({
        place,
        agg: placeAggregate.get(place.placeId)!,
      }))
      .filter((entry) => entry.agg && entry.agg.endorsement > 0);
    const restRanks = this.percentileRanks(
      restEntries.map((e) => e.agg.endorsement),
    );
    restEntries.forEach((entry, i) => {
      scored.push(
        this.buildScored(
          'restaurant',
          entry.place.placeId,
          entry.agg.provenanceSourceId,
          entry.agg.endorsement,
          restRanks[i],
          config,
          calibration,
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
    provenanceSourceId: string | null,
    endorsementRaw: number,
    percentile: number,
    config: PublicCraveScoreConfig,
    calibration: CalibrationIndex,
    endorsementTrace: Record<string, unknown>,
  ): ScoredCraveSubject {
    const rawDisplay = this.displayFromPercentile(percentile, config);
    return {
      subjectType,
      subjectId,
      provenanceSourceId,
      endorsementRaw: this.round(endorsementRaw),
      percentileRank: this.round(percentile, 5),
      rawDisplay,
      displayScore: this.round(rawDisplay, 2),
      rising: null,
      factorTrace: {
        endorsement: endorsementTrace,
        percentileRank: this.round(percentile, 5),
        calibration: {
          lane: calibration.lane,
          aRef: calibration.constants.aRef,
          aFloor: calibration.constants.aFloor,
          provenanceSourceId,
        },
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
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
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

  // ── §8 calibration measurement + epoch pins ────────────────────────────────

  /**
   * Measure every source's room: A(τ) per lane = decayed gate-passing
   * document mass ÷ observed days within τ. A document is gate-passing when
   * its thread's admission verdict is not keep=false — documents with NO
   * verdict count (the legacy corpus survived the old destructive write-time
   * gate, so persistence itself was the pass; poll_surface graduation/ballot
   * documents are admitted by construction and never judged).
   */
  async loadSourceActivities(
    config: PublicCraveScoreConfig,
    now: Date = new Date(),
  ): Promise<SourceActivity[]> {
    const halfLife = Prisma.raw(
      `(${Math.max(0.0001, Number(config.endorsementHalfLifeDays) || 0)})::numeric`,
    );
    const halfLifeFast = Prisma.raw(
      `(${Math.max(0.0001, Number(config.risingHalfLifeDays) || 0)})::numeric`,
    );
    const rows = await this.prisma.$queryRaw<SourceActivityRow[]>`
      SELECT
        s.source_id,
        s.platform,
        s.anchor_place_id,
        s.engine_id,
        s.created_at,
        d.first_doc,
        d.last_doc,
        COALESCE(d.mass_stable, 0)::numeric AS mass_stable,
        COALESCE(d.mass_fast, 0)::numeric AS mass_fast,
        l.last_ran_at
      FROM sources s
      LEFT JOIN LATERAL (
        SELECT
          MIN(sd.source_created_at) AS first_doc,
          MAX(sd.source_created_at) AS last_doc,
          SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - sd.source_created_at)))/86400.0/${halfLife})) AS mass_stable,
          SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - sd.source_created_at)))/86400.0/${halfLifeFast})) AS mass_fast
        FROM collection_source_documents sd
        WHERE sd.platform = s.platform
          AND lower(sd.community) = lower(s.handle)
          -- Per-voter ballot documents (round-3 red team C2) are claim
          -- carriers, not room activity: one poll must contribute ONE doc
          -- to A(τ), not voters+1, or the poll room's calibration silently
          -- re-weights by turnout. The predicate and the key it tests are
          -- one fact, owned by polls/supply/ballot-document-marker.
          AND ${notABallotDocumentSql('sd')}
          -- Gate verdicts are config-scoped since the P7 re-open
          -- (2026-08-17): a post can carry one verdict per gate
          -- configuration, so "gate-rejected" means the LATEST judgment
          -- says drop — a re-heard post rejoins A(τ) the moment a newer
          -- verdict keeps it. No verdict at all fails open (kept).
          -- Fetch-outcome sentinels (prompt_hash 'unfetchable': the
          -- orphan-parent and batch-fetch tombstones) are NOT judgments and
          -- rank BELOW every real one (red team 2026-08-19 D8): a later
          -- re-fetch 404 must not evict already-collected, gate-kept
          -- documents from the room. A sentinel speaks only when it is all
          -- a post has.
          AND COALESCE((
            SELECT v.keep FROM collection_relevance_verdicts v
            WHERE v.platform = sd.platform
              AND v.post_id = COALESCE(sd.parent_source_id, sd.source_id)
            ORDER BY (v.prompt_hash = 'unfetchable') ASC, v.judged_at DESC
            LIMIT 1
          ), true)
      ) d ON TRUE
      LEFT JOIN LATERAL (
        SELECT MAX(lr.last_ran_at) AS last_ran_at
        FROM source_collection_lanes lr
        WHERE lr.source_id = s.source_id
      ) l ON TRUE
    `;

    const tauByLane: Record<CalibrationLane, number> = {
      stable: Math.max(0.0001, Number(config.endorsementHalfLifeDays) || 0),
      fast: Math.max(0.0001, Number(config.risingHalfLifeDays) || 0),
    };
    return rows.map((row) => {
      const from = this.earliest(row.first_doc, row.created_at);
      const through = this.latest(
        row.last_doc,
        row.last_ran_at,
        row.created_at,
      );
      const massByLane: Record<CalibrationLane, number> = {
        stable: this.toNumber(row.mass_stable),
        fast: this.toNumber(row.mass_fast),
      };
      const activity = {} as Record<CalibrationLane, number>;
      for (const lane of CALIBRATION_LANES) {
        activity[lane] = laneActivity(
          massByLane[lane],
          observedDays({ from, through }, tauByLane[lane], now),
        );
      }
      return {
        sourceId: row.source_id,
        platform: row.platform,
        anchorPlaceId: row.anchor_place_id,
        engineId: row.engine_id,
        activity,
      };
    });
  }

  /**
   * Resolve the epoch's per-lane constants: read the pin for this
   * scoreVersion; on first use, derive from the measured corpus and pin it
   * (ON CONFLICT DO NOTHING + re-read keeps concurrent pinners consistent).
   * Re-pinning requires a scoreVersion bump (§8) — an existing pin is NEVER
   * recomputed here.
   */
  private async resolveCalibration(
    config: PublicCraveScoreConfig,
    sources: SourceActivity[],
  ): Promise<Record<CalibrationLane, CalibrationIndex>> {
    // MARKET ROOMS (owner ruling 2026-08-17): pool activities per market
    // before deriving constants or building the index — a city is one room.
    const pooled = poolSourcesByMarket(sources);
    const result = {} as Record<CalibrationLane, CalibrationIndex>;
    for (const lane of CALIBRATION_LANES) {
      const constants = await this.resolveLaneConstants(
        config.scoreVersion,
        lane,
        distinctRoomActivities(pooled, lane),
      );
      result[lane] = buildCalibrationIndex(
        lane,
        constants,
        pooled,
        config.sourceClassInfluence,
      );
    }
    return result;
  }

  private async resolveLaneConstants(
    scoreVersion: string,
    lane: CalibrationLane,
    activities: number[],
  ): Promise<LaneCalibrationConstants> {
    const read = async (): Promise<LaneCalibrationConstants | null> => {
      const rows = await this.prisma.$queryRaw<
        Array<{ a_ref: number; a_floor: number }>
      >`
        SELECT a_ref, a_floor FROM crave_score_calibration_epochs
        WHERE score_version = ${scoreVersion} AND lane = ${lane}
      `;
      return rows[0]
        ? { aRef: Number(rows[0].a_ref), aFloor: Number(rows[0].a_floor) }
        : null;
    };

    const existing = await read();
    if (existing) {
      return existing;
    }
    const { constants, derivation } = deriveLaneConstants(activities);
    await this.prisma.$executeRaw`
      INSERT INTO crave_score_calibration_epochs
        (score_version, lane, a_ref, a_floor, derivation)
      VALUES (${scoreVersion}, ${lane}, ${constants.aRef}, ${constants.aFloor},
              ${JSON.stringify(derivation)}::jsonb)
      ON CONFLICT (score_version, lane) DO NOTHING
    `;
    this.logger.info('Pinned score-calibration epoch constants', {
      scoreVersion,
      lane,
      ...constants,
    });
    return (await read()) ?? constants;
  }

  private earliest(...dates: Array<Date | null>): Date | null {
    const valid = dates.filter((d): d is Date => d != null);
    if (!valid.length) return null;
    return valid.reduce((min, d) => (d < min ? d : min));
  }

  private latest(...dates: Array<Date | null>): Date | null {
    const valid = dates.filter((d): d is Date => d != null);
    if (!valid.length) return null;
    return valid.reduce((max, d) => (d > max ? d : max));
  }

  // ── run bookkeeping ────────────────────────────────────────────────────────

  private async createRun(
    scoreRunId: string,
    config: PublicCraveScoreConfig,
    recencyReferenceDate: Date,
    extras: {
      fixtureRunId?: string;
      calibration: Record<string, unknown>;
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
        ${JSON.stringify({ ...config, calibration: extras.calibration })}::jsonb,
        ${JSON.stringify({
          fixtureRunId: extras.fixtureRunId ?? null,
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

  // Loads candidates with BOTH decayed masses in one scan per table, GROUPED
  // BY SOURCE ROOM (§8): mention → its document → the (platform, handle)
  // source row. Mentions whose document has no source row surface as a
  // sourceId-null contribution (unmeasurable room → g = 1). Returns two
  // candidate views over the same subjects so scoreCandidates can run once
  // per lane.
  /**
   * BAKE-OFF: per-place decayed conversation-share endorsement (pooling
   * 'thread-share' / 'thread-share-confidence'). A thread is a poll: a
   * place's per-conversation signal is its share of that conversation's
   * floored ballots (dish + praise pooled); 'confidence' multiplies each
   * poll by total/(total+8). Stable lane only — the tabled equation
   * comparison (owner 2026-08-17) re-runs post-backfill through
   * scripts/consensus-policy-diff.ts.
   */
  private async threadShareEndorsements(
    config: PublicCraveScoreConfig,
  ): Promise<Map<string, number>> {
    const tau = Math.max(0.0001, Number(config.endorsementHalfLifeDays) || 365);
    const confidence =
      config.pooling === 'thread-share-confidence'
        ? Prisma.sql`(per_t.total / (per_t.total + 8))`
        : Prisma.sql`1`;
    const rows = await this.prisma.$queryRaw<
      Array<{ rid: string; endorsement: number }>
    >(Prisma.sql`
      WITH dish_ballots AS (
        SELECT c.restaurant_id AS rid,
               coalesce(d.parent_source_id, d.source_id) AS thread,
               (1 + 0.7*(CASE WHEN d.source_type='post' THEN 1
                              ELSE m.source_upvotes END))::numeric AS w,
               m.mentioned_at AS at
        FROM core_restaurant_items c
        JOIN core_restaurant_item_mentions m ON m.connection_id = c.connection_id
        JOIN collection_source_documents d ON d.document_id = m.source_document_id
      ),
      praise_ballots AS (
        SELECT ev_scope.restaurant_id,
               coalesce(d_scope.parent_source_id, d_scope.source_id),
               (1 + 0.7*(CASE WHEN d_scope.source_type='post' THEN 1
                              ELSE MAX(ev_scope.source_upvotes) END))::numeric,
               MAX(ev_scope.mentioned_at)
        FROM ${Prisma.raw(activePlaceEventsSourceSql())}
        GROUP BY ev_scope.restaurant_id,
                 coalesce(d_scope.parent_source_id, d_scope.source_id),
                 ev_scope.mention_key, d_scope.source_type
      ),
      ballots AS (SELECT * FROM dish_ballots UNION ALL SELECT * FROM praise_ballots),
      per_rt AS (SELECT rid, thread, SUM(w) AS mass, MAX(at) AS at
                   FROM ballots GROUP BY rid, thread),
      per_t AS (SELECT thread, SUM(mass) AS total FROM per_rt GROUP BY thread)
      SELECT per_rt.rid::text AS rid,
             SUM((per_rt.mass/per_t.total) * ${confidence}
                 * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now()-per_rt.at)))/86400.0/${Prisma.raw(String(tau))}))::float AS endorsement
      FROM per_rt JOIN per_t USING(thread)
      GROUP BY per_rt.rid`);
    return new Map(rows.map((row) => [row.rid, Number(row.endorsement)]));
  }

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
      SELECT
        c.connection_id,
        c.restaurant_id AS place_id,
        src.source_id,
        src.platform,
        COALESCE(SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLife})), 0)::numeric AS mentions,
        COALESCE(SUM(m.source_upvotes * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLife})), 0)::numeric AS upvotes,
        COALESCE(SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLifeFast})), 0)::numeric AS mentions_fast,
        COALESCE(SUM(m.source_upvotes * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - m.mentioned_at)))/86400.0/${halfLifeFast})), 0)::numeric AS upvotes_fast
      FROM core_restaurant_items c
      JOIN core_entities r ON r.entity_id = c.restaurant_id
        -- ARCHIVED IS NEVER RANKED (big-one red team: 308 archived
        -- restaurants held freshly-computed scores — merged losers and
        -- junk sinks were user-rankable)
        AND r.status = 'active'
        -- OUT-OF-MARKET IS NEVER RANKED (v17 S4): a place excluded from
        -- every crediting community's market leaves the score pool too —
        -- its rows would otherwise distort every percentile it sat in.
        -- (Shared fragment, red-team L3 F1: the score lanes keep their own
        -- stricter status = 'active' and compose only the verdict piece.)
        AND ${Prisma.raw(marketIncludedSql('r'))}
      JOIN core_restaurant_item_mentions m ON m.connection_id = c.connection_id
      LEFT JOIN collection_source_documents d ON d.document_id = m.source_document_id
      LEFT JOIN sources src
        ON src.platform = d.platform AND lower(src.handle) = lower(d.community)
      WHERE ${dishFixtureFilter}
      GROUP BY c.connection_id, c.restaurant_id, src.source_id, src.platform
    `;

    const restRows = await this.prisma.$queryRaw<PlaceRow[]>`
      WITH praise_dedup AS (
        -- general_praise is a RESTAURANT-level fact riding dish-scoped
        -- mention keys: dedupe per (restaurant, mention_key) so one praising
        -- source counts once. The newest event's document carries the
        -- provenance for the whole group.
        SELECT
          restaurant_id,
          mention_key,
          MAX(mentioned_at) AS mentioned_at,
          MAX(source_upvotes) AS upv,
          (array_agg(source_document_id ORDER BY mentioned_at DESC))[1] AS source_document_id
        -- ACTIVE-RUN ONLY (final red team #2): the dish lane inherits this
        -- guard through the rebuilt mentions table, but praise read events
        -- directly — a retained superseded generation (activate-shadow
        -- 'retain') would inflate praise mass. Executed proof: one event on
        -- a never-activated run grew praise_dedup 5 → 6 without this join.
        FROM ${Prisma.raw(activePlaceEventsSourceSql())}
        GROUP BY restaurant_id, mention_key
      )
      SELECT
        e.entity_id AS place_id,
        src.source_id,
        src.platform,
        COALESCE(SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - pd.mentioned_at)))/86400.0/${halfLife})), 0)::numeric AS praise_mentions,
        COALESCE(SUM(pd.upv * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - pd.mentioned_at)))/86400.0/${halfLife})), 0)::numeric AS praise_upvotes,
        COALESCE(SUM(power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - pd.mentioned_at)))/86400.0/${halfLifeFast})), 0)::numeric AS praise_mentions_fast,
        COALESCE(SUM(pd.upv * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (now() - pd.mentioned_at)))/86400.0/${halfLifeFast})), 0)::numeric AS praise_upvotes_fast
      FROM core_entities e
      LEFT JOIN praise_dedup pd ON pd.restaurant_id = e.entity_id
      LEFT JOIN collection_source_documents d ON d.document_id = pd.source_document_id
      LEFT JOIN sources src
        ON src.platform = d.platform AND lower(src.handle) = lower(d.community)
      WHERE e.type = 'place'
        AND e.status = 'active'
        -- OUT-OF-MARKET IS NEVER RANKED (v17 S4), same as the dish lane —
        -- composed through the shared fragment (red-team L3 F1).
        AND ${Prisma.raw(marketIncludedSql('e'))}
        AND ${restFixtureFilter}
      GROUP BY e.entity_id, src.source_id, src.platform
    `;

    // Assemble per-subject contribution lists for each lane.
    const dishByConnection = new Map<
      string,
      {
        placeId: string;
        stable: SourceContribution[];
        fast: SourceContribution[];
      }
    >();
    for (const row of dishRows) {
      let entry = dishByConnection.get(row.connection_id);
      if (!entry) {
        entry = { placeId: row.place_id, stable: [], fast: [] };
        dishByConnection.set(row.connection_id, entry);
      }
      entry.stable.push({
        sourceId: row.source_id,
        platform: row.platform,
        mentions: this.toNumber(row.mentions),
        upvotes: this.toNumber(row.upvotes),
      });
      entry.fast.push({
        sourceId: row.source_id,
        platform: row.platform,
        mentions: this.toNumber(row.mentions_fast),
        upvotes: this.toNumber(row.upvotes_fast),
      });
    }

    const placeById = new Map<
      string,
      { stable: SourceContribution[]; fast: SourceContribution[] }
    >();
    for (const row of restRows) {
      let entry = placeById.get(row.place_id);
      if (!entry) {
        entry = { stable: [], fast: [] };
        placeById.set(row.place_id, entry);
      }
      entry.stable.push({
        sourceId: row.source_id,
        platform: row.platform,
        mentions: this.toNumber(row.praise_mentions),
        upvotes: this.toNumber(row.praise_upvotes),
      });
      entry.fast.push({
        sourceId: row.source_id,
        platform: row.platform,
        mentions: this.toNumber(row.praise_mentions_fast),
        upvotes: this.toNumber(row.praise_upvotes_fast),
      });
    }

    const stableDishes: DishCandidate[] = [];
    const fastDishes: DishCandidate[] = [];
    for (const [connectionId, entry] of dishByConnection) {
      stableDishes.push({
        connectionId,
        placeId: entry.placeId,
        contributions: entry.stable,
      });
      fastDishes.push({
        connectionId,
        placeId: entry.placeId,
        contributions: entry.fast,
      });
    }
    const stablePlaces: PlaceCandidate[] = [];
    const fastPlaces: PlaceCandidate[] = [];
    for (const [placeId, entry] of placeById) {
      stablePlaces.push({
        placeId,
        praiseContributions: entry.stable,
      });
      fastPlaces.push({ placeId, praiseContributions: entry.fast });
    }

    return {
      stable: { dishes: stableDishes, places: stablePlaces },
      fast: { dishes: fastDishes, places: fastPlaces },
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

    // ONE STATEMENT, NOT ONE PER SUBJECT (D47 scale pass). The run scores the
    // WHOLE graph — every restaurant and every connection — so `scored.length`
    // is the corpus, not a page: 24,032 subjects on the mirror today. The
    // previous shape built one $executeRaw per subject and handed the whole
    // array to $transaction, which is a per-row round trip through the query
    // engine and a per-row SQL string retained in memory until the transaction
    // settles. MEASURED on the mirror against a clone of this table:
    //   24,032 subjects (today):  per-row 2,229 ms   ->  unnest   643 ms
    //  240,320 subjects (10x):    per-row 18,610 ms  ->  unnest 5,251 ms
    //                             per-row heap 2,461 MB -> unnest 790 MB
    // The heap is the real ceiling, not the seconds: 2.4 GB of retained
    // statement objects inside one transaction is an OOM on any container we
    // run, and it is reached by growing the corpus alone. Columns travel as
    // parallel arrays and are re-assembled by unnest, so the wire cost is the
    // data and nothing else.
    //
    // Numerics travel as TEXT, deliberately. endorsement_raw/percentile_rank/
    // display_score/rising are numeric(p,s); binding a JS float64 and letting
    // Postgres round is a second, silent rounding on top of the one
    // scoreCandidates already performed. String(n) is the shortest round-trip
    // decimal for the float64 we hold, and ::numeric parses it exactly.
    //
    // ONE ROW PER SUBJECT IS NOW A PRECONDITION, so it is stated here. The
    // per-row loop this replaced would silently let a duplicated subject
    // overwrite itself (last write wins, no trace); a set-based upsert instead
    // raises Postgres' opaque "ON CONFLICT DO UPDATE command cannot affect row
    // a second time". Distinctness is structural today — loadCandidates builds
    // both candidate lists by iterating Maps keyed by connectionId and
    // restaurantId, and subjectType separates the two — so a duplicate here
    // means that construction broke upstream. Say which subject, and refuse.
    const seenSubjects = new Set<string>();
    for (const row of scored) {
      const key = `${row.subjectType}:${row.subjectId}`;
      if (seenSubjects.has(key)) {
        throw new Error(
          `Score run ${scoreRunId} produced two rows for subject ${key} — ` +
            `candidate assembly is keyed by subject and must not duplicate.`,
        );
      }
      seenSubjects.add(key);
    }

    const subjectTypes = scored.map((row) => row.subjectType);
    const subjectIds = scored.map((row) => row.subjectId);
    const provenanceSourceIds = scored.map((row) => row.provenanceSourceId);
    const endorsementRaws = scored.map((row) => String(row.endorsementRaw));
    const percentileRanks = scored.map((row) => String(row.percentileRank));
    const displayScores = scored.map((row) => String(row.displayScore));
    const risings = scored.map((row) =>
      row.rising === null ? null : String(row.rising),
    );
    const factorTraces = scored.map((row) => JSON.stringify(row.factorTrace));

    const scoreWrites: Prisma.PrismaPromise<number>[] = [
      this.prisma.$executeRaw`
        INSERT INTO core_public_entity_scores (
          subject_type,
          subject_id,
          score_run_id,
          provenance_source_id,
          endorsement_raw,
          percentile_rank,
          display_score,
          rising,
          score_version,
          display_curve_version,
          factor_trace,
          computed_at
        )
        SELECT
          row.subject_type::crave_score_subject_type,
          row.subject_id::uuid,
          ${scoreRunId}::uuid,
          row.provenance_source_id::uuid,
          row.endorsement_raw::numeric,
          row.percentile_rank::numeric,
          row.display_score::numeric,
          row.rising::numeric,
          ${config.scoreVersion},
          ${config.displayCurveVersion},
          row.factor_trace::jsonb,
          now()
        FROM unnest(
          ${subjectTypes}::text[],
          ${subjectIds}::text[],
          ${provenanceSourceIds}::text[],
          ${endorsementRaws}::text[],
          ${percentileRanks}::text[],
          ${displayScores}::text[],
          ${risings}::text[],
          ${factorTraces}::text[]
        ) AS row(
          subject_type,
          subject_id,
          provenance_source_id,
          endorsement_raw,
          percentile_rank,
          display_score,
          rising,
          factor_trace
        )
        ON CONFLICT (subject_type, subject_id) DO UPDATE SET
          score_run_id = EXCLUDED.score_run_id,
          provenance_source_id = EXCLUDED.provenance_source_id,
          endorsement_raw = EXCLUDED.endorsement_raw,
          percentile_rank = EXCLUDED.percentile_rank,
          display_score = EXCLUDED.display_score,
          rising = EXCLUDED.rising,
          score_version = EXCLUDED.score_version,
          display_curve_version = EXCLUDED.display_curve_version,
          factor_trace = EXCLUDED.factor_trace,
          computed_at = EXCLUDED.computed_at
      `,
    ];

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
