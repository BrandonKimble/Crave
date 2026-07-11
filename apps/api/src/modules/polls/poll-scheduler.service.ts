import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DemandScoringConsumerKind,
  DemandScoringDecisionState,
  DemandSubjectKind,
  PollTopicStatus,
  PollState,
  PollOrigin,
  PollMode,
  EntityType,
  PollTopicType,
  PollTopic,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { NotificationsService } from '../notifications/notifications.service';
import { SearchDemandService } from '../analytics/search-demand.service';
import { DemandScoringTraceService } from '../analytics/demand-scoring-trace.service';
import * as curves from '../analytics/demand-scoring/curves';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const POLL_TOPIC_SCORER_VERSION = 'poll-topic-v1';

interface SchedulerConfig {
  topicLimit: number;
  maxPollsPerCity: number;
  demandWindowDays: number;
  minDemandScore: number;
  releaseDayOfWeek: number;
  releaseHour: number;
}

interface PollDemandCandidate {
  entityId: string;
  entityType: EntityType;
  signalCount: number;
  distinctUsers: number;
  weightedSignalCount: number;
  demandScore: number;
  lastSeenAt: Date;
}

interface PollScoredCandidate extends PollDemandCandidate {
  topicType: PollTopicType;
  title: string;
  description: string;
  region: string | null;
  country: string | null;
  finalScore: number;
  rank: number;
  selectedRank?: number;
  decisionReason?: string;
  factorBreakdown: Prisma.JsonObject;
}

type PublishReadyTopic = PollTopic & {
  currentPriorityScore: number;
  currentPriorityRank: number;
  currentPriorityMetadata: Prisma.JsonValue | null;
};

const POLL_CURRENT_CYCLE_DAYS = 7;
const POLL_ROLLING_BASELINE_DAYS = 28;
const POLL_COOLDOWN_CURVE_DAYS = 28;
const POLL_RESURGENCE_CREDIT_DAYS = 21;
const POLL_RESURGENCE_CREDIT_RATE = 0.35;
const POLL_RESURGENCE_BOOST_RATE = 0.7;
const POLL_RESURGENCE_BOOST_MAX_DELTA = 0.5;
const POLL_CANDIDATE_MIN_DEMAND_SCORE = 1;

@Injectable()
export class PollSchedulerService {
  private readonly logger: LoggerService;
  private readonly config: SchedulerConfig;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly notifications: NotificationsService,
    private readonly demandService: SearchDemandService,
    private readonly scoringTrace: DemandScoringTraceService,
  ) {
    this.logger = loggerService.setContext('PollSchedulerService');
    // 2026-07-11 config fold-in: formerly POLL_* env knobs; never varied by
    // environment. Drift note: dev .env had POLL_RELEASE_DAY_OF_WEEK=1
    // (Monday), but §B.5 of the polls spec says the app cadence publishes
    // SUNDAY (0) — reconciled in favor of the spec value.
    this.config = {
      topicLimit: 40, // markets refreshed per nightly topic pass
      maxPollsPerCity: 3,
      demandWindowDays: 14, // demand lookback for candidate markets
      minDemandScore: 1,
      releaseDayOfWeek: 0, // Sunday, per §B.5
      releaseHour: 9, // local 9am release
    };
  }

  private shouldTraceAllCandidates(): boolean {
    return (
      process.env.DEMAND_SCORING_TRACE_ALL_CANDIDATES?.trim().toLowerCase() ===
      'true'
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async refreshTopics(): Promise<void> {
    const since = new Date(
      Date.now() - this.config.demandWindowDays * MS_PER_DAY,
    );
    const markets = await this.demandService.listActiveLocations({
      since,
      minDemandScore: this.config.minDemandScore,
      limit: this.config.topicLimit,
    });

    let created = 0;
    for (const market of markets) {
      if (created >= this.config.topicLimit) {
        break;
      }
      created += await this.seedMarketTopics(
        market.marketKey,
        since,
        this.config.topicLimit - created,
      );
    }

    if (created > 0) {
      this.logger.info('Refreshed poll topics from search demand', {
        created,
      });
    }
  }

  private async seedMarketTopics(
    marketKey: string,
    since: Date,
    remainingSlots: number,
  ): Promise<number> {
    const slotBudget = Math.max(
      0,
      Math.min(remainingSlots, this.config.maxPollsPerCity),
    );
    if (slotBudget === 0) {
      return 0;
    }

    const candidates = await this.planMarketTopicCandidates({
      marketKey,
      since,
      limit: Math.max(20, Math.min(slotBudget * 12, 80)),
    });

    let created = 0;
    const selectedCandidates: PollScoredCandidate[] = [];

    for (const candidate of candidates) {
      if (created >= slotBudget) {
        break;
      }
      if (candidate.decisionReason) {
        continue;
      }

      const selectedCandidate: PollScoredCandidate = {
        ...candidate,
        selectedRank: selectedCandidates.length + 1,
      };
      const ok =
        selectedCandidate.entityType === EntityType.food
          ? await this.createDishTopic(marketKey, selectedCandidate)
          : await this.createRestaurantTopic(marketKey, selectedCandidate);
      if (ok) {
        created += 1;
        selectedCandidates.push(selectedCandidate);
      }
    }

    await this.tracePollTopicSelection({
      marketKey,
      since,
      selectedCandidates,
      candidatePool: candidates,
    });

    return created;
  }

  private async planMarketTopicCandidates(params: {
    marketKey: string;
    since: Date;
    limit: number;
  }): Promise<PollScoredCandidate[]> {
    const now = new Date();
    const currentCycleUntil = new Date(now.getTime() + MS_PER_DAY);
    const candidateRows = await this.demandService.getTopEntitiesForLocation({
      marketKey: params.marketKey,
      since: params.since,
      entityTypes: [EntityType.food, EntityType.restaurant],
      minDemandScore: POLL_CANDIDATE_MIN_DEMAND_SCORE,
      limit: params.limit,
      currentCycleDays: POLL_CURRENT_CYCLE_DAYS,
      halfLifeDays: 14,
    });

    const entityIds = candidateRows.map((candidate) => candidate.entityId);
    if (!entityIds.length) {
      return [];
    }

    const [entities, currentRows, previousRows, rollingRows, existingTopics] =
      await Promise.all([
        this.prisma.entity.findMany({
          where: { entityId: { in: entityIds } },
          select: {
            entityId: true,
            name: true,
            type: true,
            lastPolledAt: true,
            region: true,
            country: true,
          },
        }),
        this.demandService.getTopEntitiesForLocation({
          marketKey: params.marketKey,
          since: new Date(now.getTime() - POLL_CURRENT_CYCLE_DAYS * MS_PER_DAY),
          until: currentCycleUntil,
          entityIds,
          entityTypes: [EntityType.food, EntityType.restaurant],
          minDemandScore: 0,
          limit: entityIds.length,
          currentCycleDays: POLL_CURRENT_CYCLE_DAYS,
          halfLifeDays: 3650,
        }),
        this.demandService.getTopEntitiesForLocation({
          marketKey: params.marketKey,
          since: new Date(
            now.getTime() - POLL_CURRENT_CYCLE_DAYS * 2 * MS_PER_DAY,
          ),
          until: new Date(now.getTime() - POLL_CURRENT_CYCLE_DAYS * MS_PER_DAY),
          entityIds,
          entityTypes: [EntityType.food, EntityType.restaurant],
          minDemandScore: 0,
          limit: entityIds.length,
          currentCycleDays: POLL_CURRENT_CYCLE_DAYS,
          halfLifeDays: 3650,
        }),
        this.demandService.getTopEntitiesForLocation({
          marketKey: params.marketKey,
          since: new Date(
            now.getTime() -
              (POLL_CURRENT_CYCLE_DAYS + POLL_ROLLING_BASELINE_DAYS) *
                MS_PER_DAY,
          ),
          until: new Date(now.getTime() - POLL_CURRENT_CYCLE_DAYS * MS_PER_DAY),
          entityIds,
          entityTypes: [EntityType.food, EntityType.restaurant],
          minDemandScore: 0,
          limit: entityIds.length,
          currentCycleDays: POLL_ROLLING_BASELINE_DAYS,
          halfLifeDays: 3650,
        }),
        this.prisma.pollTopic.findMany({
          where: {
            marketKey: params.marketKey,
            status: { in: [PollTopicStatus.draft, PollTopicStatus.ready] },
            OR: [
              { targetDishId: { in: entityIds } },
              { targetRestaurantId: { in: entityIds } },
            ],
          },
          select: {
            targetDishId: true,
            targetRestaurantId: true,
          },
        }),
      ]);

    const entityById = new Map(
      entities.map((entity) => [entity.entityId, entity]),
    );
    const currentById = this.indexDemandByEntityId(currentRows);
    const previousById = this.indexDemandByEntityId(previousRows);
    const rollingById = this.indexDemandByEntityId(rollingRows);
    const existingTopicIds = new Set(
      existingTopics
        .flatMap((topic) => [topic.targetDishId, topic.targetRestaurantId])
        .filter((id): id is string => Boolean(id)),
    );

    return candidateRows
      .map((candidate): PollScoredCandidate | null => {
        const entity = entityById.get(candidate.entityId);
        if (!entity) {
          return null;
        }
        if (
          entity.type !== EntityType.food &&
          entity.type !== EntityType.restaurant
        ) {
          return null;
        }

        const currentCycleScore =
          currentById.get(candidate.entityId)?.demandScore ?? 0;
        const previousCycleScore =
          previousById.get(candidate.entityId)?.demandScore ?? 0;
        const rollingBaselineScore =
          (rollingById.get(candidate.entityId)?.demandScore ?? 0) /
          Math.max(1, POLL_ROLLING_BASELINE_DAYS / POLL_CURRENT_CYCLE_DAYS);
        const baselineScore = Math.max(
          previousCycleScore,
          rollingBaselineScore,
          3,
        );
        const surgeRatio =
          baselineScore > 0 ? currentCycleScore / baselineScore : 0;
        const surgeUnits = curves.surgeUnits(
          currentCycleScore,
          baselineScore,
          1,
        );
        const resurgenceCreditDays =
          POLL_RESURGENCE_CREDIT_DAYS *
          curves.saturating(surgeUnits, POLL_RESURGENCE_CREDIT_RATE);
        const daysSinceLastPoll = entity.lastPolledAt
          ? Math.max(
              0,
              (now.getTime() - entity.lastPolledAt.getTime()) / MS_PER_DAY,
            )
          : null;
        const effectiveDaysSinceLastPoll =
          daysSinceLastPoll === null
            ? null
            : daysSinceLastPoll + resurgenceCreditDays;
        const pollCooldownAvailability =
          effectiveDaysSinceLastPoll === null
            ? 1
            : curves.gaussianRamp(
                effectiveDaysSinceLastPoll,
                POLL_COOLDOWN_CURVE_DAYS,
              );
        const pollResurgenceBoost =
          1 +
          POLL_RESURGENCE_BOOST_MAX_DELTA *
            curves.saturating(surgeUnits, POLL_RESURGENCE_BOOST_RATE);
        const finalScore =
          candidate.demandScore *
          pollCooldownAvailability *
          pollResurgenceBoost;
        const topicType =
          entity.type === EntityType.food
            ? PollTopicType.best_dish
            : PollTopicType.what_to_order;
        const decisionReason = existingTopicIds.has(candidate.entityId)
          ? 'topic_already_ready'
          : undefined;

        return {
          ...candidate,
          entityType: entity.type,
          topicType,
          title:
            entity.type === EntityType.food
              ? this.buildDishQuestion(entity.name)
              : this.buildRestaurantQuestion(entity.name),
          description:
            entity.type === EntityType.food
              ? `Which spot has the best ${entity.name}?`
              : `Help everyone decide what to order at ${entity.name}.`,
          region: entity.region,
          country: entity.country,
          finalScore,
          rank: 0,
          decisionReason,
          factorBreakdown: {
            baseDemand: candidate.demandScore,
            signalCount: candidate.signalCount,
            distinctUsers: candidate.distinctUsers,
            weightedSignalCount: candidate.weightedSignalCount,
            currentCycleScore,
            previousCycleScore,
            rollingBaselineScore,
            baselineScore,
            surgeRatio,
            surgeUnits,
            resurgenceCreditDays,
            daysSinceLastPoll,
            effectiveDaysSinceLastPoll,
            pollCooldownAvailability,
            pollResurgenceBoost,
            scorerVersion: POLL_TOPIC_SCORER_VERSION,
          },
        };
      })
      .filter((candidate): candidate is PollScoredCandidate =>
        Boolean(candidate),
      )
      .sort(
        (a, b) =>
          b.finalScore - a.finalScore ||
          b.demandScore - a.demandScore ||
          b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
      )
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  }

  private indexDemandByEntityId(
    rows: PollDemandCandidate[],
  ): Map<string, PollDemandCandidate> {
    return new Map(rows.map((row) => [row.entityId, row]));
  }

  private async tracePollTopicSelection(params: {
    marketKey: string;
    since: Date;
    selectedCandidates: PollScoredCandidate[];
    candidatePool: PollScoredCandidate[];
  }): Promise<void> {
    try {
      const traceAllCandidates = this.shouldTraceAllCandidates();
      const runId = await this.scoringTrace.createRun({
        consumerKind: DemandScoringConsumerKind.poll_topic,
        marketKey: params.marketKey,
        cycleStartAt: params.since,
        cycleEndAt: new Date(),
        scorerVersion: POLL_TOPIC_SCORER_VERSION,
        traceAllCandidates,
        metadata: {
          maxPollsPerCity: this.config.maxPollsPerCity,
          marketMinDemandScore: this.config.minDemandScore,
          candidateMinDemandScore: POLL_CANDIDATE_MIN_DEMAND_SCORE,
          currentCycleDays: POLL_CURRENT_CYCLE_DAYS,
          cooldownCurveDays: POLL_COOLDOWN_CURVE_DAYS,
        },
      });

      const selectedIds = new Set(
        params.selectedCandidates.map((candidate) => candidate.entityId),
      );
      const rejectedCandidates = params.candidatePool.filter(
        (candidate) => !selectedIds.has(candidate.entityId),
      );
      const tracedRejectedCandidates = traceAllCandidates
        ? rejectedCandidates
        : rejectedCandidates.slice(0, 10);
      const traces = [
        ...params.selectedCandidates.map((candidate) => ({
          consumerKind: DemandScoringConsumerKind.poll_topic,
          candidateKind: candidate.topicType,
          subjectKind: DemandSubjectKind.entity,
          subjectKey: candidate.entityId,
          marketKey: params.marketKey,
          entityId: candidate.entityId,
          entityType: candidate.entityType,
          finalScore: candidate.finalScore,
          rank: candidate.selectedRank ?? candidate.rank,
          selected: true,
          decisionState: DemandScoringDecisionState.selected,
          decisionReason: 'topic_created',
          factorBreakdown: candidate.factorBreakdown,
        })),
        ...tracedRejectedCandidates.map((candidate, index) => {
          const isDebugOnlyCandidate =
            traceAllCandidates && index >= 10 && !candidate.decisionReason;
          const isReadyTopicCarryForward =
            candidate.decisionReason === 'topic_already_ready';
          const factorBreakdown = {
            ...candidate.factorBreakdown,
            traceScope: isDebugOnlyCandidate ? 'all_candidate' : 'near_miss',
          } satisfies Prisma.JsonObject;
          return {
            consumerKind: DemandScoringConsumerKind.poll_topic,
            candidateKind: candidate.topicType,
            subjectKind: DemandSubjectKind.entity,
            subjectKey: candidate.entityId,
            marketKey: params.marketKey,
            entityId: candidate.entityId,
            entityType: candidate.entityType,
            finalScore: candidate.finalScore,
            rank: candidate.rank,
            selected: false,
            decisionState: isReadyTopicCarryForward
              ? DemandScoringDecisionState.near_miss
              : candidate.decisionReason
                ? DemandScoringDecisionState.gate_reject
                : isDebugOnlyCandidate
                  ? DemandScoringDecisionState.budget_reject
                  : DemandScoringDecisionState.near_miss,
            decisionReason:
              (isReadyTopicCarryForward
                ? 'ready_topic_carried_forward'
                : candidate.decisionReason) ??
              (isDebugOnlyCandidate
                ? 'trace_all_not_selected'
                : 'not_selected_this_cycle'),
            factorBreakdown,
          };
        }),
      ];
      await this.scoringTrace.recordCandidates(runId, traces);
      await this.scoringTrace.finishRun(runId);
    } catch (error) {
      this.logger.warn('Failed to trace poll topic selection', {
        marketKey: params.marketKey,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  private async createDishTopic(
    marketKey: string,
    candidate: PollScoredCandidate,
  ): Promise<boolean> {
    if (candidate.entityType !== EntityType.food) {
      return false;
    }

    const exists = await this.topicExists(
      PollTopicType.best_dish,
      candidate.entityId,
      marketKey,
    );
    if (exists) {
      return false;
    }

    await this.prisma.pollTopic.create({
      data: {
        title: candidate.title,
        description: candidate.description,
        marketKey,
        region: candidate.region,
        country: candidate.country,
        topicType: PollTopicType.best_dish,
        targetDishId: candidate.entityId,
        categoryEntityIds: [candidate.entityId],
        seedEntityIds: [candidate.entityId],
        status: PollTopicStatus.ready,
        metadata: {
          source: 'search_demand_daily',
          marketKey,
          signalCount: candidate.signalCount,
          pollPriority: {
            score: candidate.finalScore,
            rank: candidate.selectedRank ?? candidate.rank,
            scorerVersion: POLL_TOPIC_SCORER_VERSION,
            factors: candidate.factorBreakdown,
          },
        } satisfies Prisma.JsonObject,
      },
    });

    return true;
  }

  private async createRestaurantTopic(
    marketKey: string,
    candidate: PollScoredCandidate,
  ): Promise<boolean> {
    if (candidate.entityType !== EntityType.restaurant) {
      return false;
    }

    const exists = await this.topicExists(
      PollTopicType.what_to_order,
      candidate.entityId,
      marketKey,
    );
    if (exists) {
      return false;
    }

    await this.prisma.pollTopic.create({
      data: {
        title: candidate.title,
        description: candidate.description,
        marketKey,
        region: candidate.region,
        country: candidate.country,
        topicType: PollTopicType.what_to_order,
        targetRestaurantId: candidate.entityId,
        seedEntityIds: [candidate.entityId],
        status: PollTopicStatus.ready,
        metadata: {
          source: 'search_demand_daily',
          marketKey,
          signalCount: candidate.signalCount,
          pollPriority: {
            score: candidate.finalScore,
            rank: candidate.selectedRank ?? candidate.rank,
            scorerVersion: POLL_TOPIC_SCORER_VERSION,
            factors: candidate.factorBreakdown,
          },
        } satisfies Prisma.JsonObject,
      },
    });

    return true;
  }
  private async topicExists(
    topicType: PollTopicType,
    targetId: string,
    marketKey: string,
  ): Promise<boolean> {
    const where: Prisma.PollTopicWhereInput = {
      topicType,
      status: { in: [PollTopicStatus.draft, PollTopicStatus.ready] },
      marketKey,
    };

    if (topicType === PollTopicType.best_dish) {
      where.targetDishId = targetId;
    } else {
      where.targetRestaurantId = targetId;
    }

    const count = await this.prisma.pollTopic.count({ where });
    return count > 0;
  }

  /**
   * Phase 3C: seeded polls know their structure (topicType + target), so derive the
   * axis directly — no LLM (unlike the user free-text path). Mirrors the axis shape
   * `inferPollSubject` produces, so both creation paths store the same structure.
   */
  private async buildSeededAxis(topic: {
    topicType: PollTopicType;
    targetDishId: string | null;
    targetRestaurantId: string | null;
    targetFoodAttributeId: string | null;
    targetRestaurantAttributeId: string | null;
  }): Promise<Prisma.InputJsonValue | null> {
    const nameOf = async (id: string | null): Promise<string | null> => {
      if (!id) return null;
      const e = await this.prisma.entity.findUnique({
        where: { entityId: id },
        select: { name: true },
      });
      return e?.name ?? null;
    };

    switch (topic.topicType) {
      case PollTopicType.best_dish: {
        const value = await nameOf(topic.targetDishId);
        return value
          ? {
              targetType: 'dish',
              constraint: { kind: 'category', value },
              anchor: null,
              marketHint: null,
            }
          : null;
      }
      case PollTopicType.what_to_order: {
        const anchor = await nameOf(topic.targetRestaurantId);
        return anchor
          ? { targetType: 'dish', constraint: null, anchor, marketHint: null }
          : null;
      }
      case PollTopicType.best_dish_attribute: {
        const value = await nameOf(topic.targetFoodAttributeId);
        return value
          ? {
              targetType: 'dish',
              constraint: { kind: 'dish_attribute', value },
              anchor: null,
              marketHint: null,
            }
          : null;
      }
      case PollTopicType.best_restaurant_attribute: {
        const value = await nameOf(topic.targetRestaurantAttributeId);
        return value
          ? {
              targetType: 'restaurant',
              constraint: { kind: 'restaurant_attribute', value },
              anchor: null,
              marketHint: null,
            }
          : null;
      }
      default:
        return null;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async publishWeeklyPolls(): Promise<void> {
    const now = new Date();
    if (!this.shouldPublishPolls(now)) {
      return;
    }

    const { start, end } = this.currentHourWindow(now);
    const alreadyScheduled = await this.prisma.poll.count({
      where: {
        scheduledFor: {
          gte: start,
          lt: end,
        },
      },
    });

    if (alreadyScheduled > 0) {
      return;
    }

    await this.refreshTopics();

    const topics = await this.prisma.pollTopic.findMany({
      where: { status: PollTopicStatus.ready },
      orderBy: { updatedAt: 'desc' },
    });
    const scoredTopics = (await this.rankReadyTopicsForPublish(topics)).sort(
      (a, b) =>
        b.currentPriorityScore - a.currentPriorityScore ||
        a.currentPriorityRank - b.currentPriorityRank ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    );

    const pollsByMarket = new Map<string, string[]>();
    const publishedTopicsByMarket = new Map<string, PublishReadyTopic[]>();
    const marketCounts = new Map<string, number>();
    let published = 0;

    for (const topic of scoredTopics) {
      if (topic.currentPriorityScore <= 0) {
        continue;
      }
      const marketKey = topic.marketKey?.toLowerCase().trim();
      if (!marketKey) {
        continue;
      }
      const currentCount = marketCounts.get(marketKey) ?? 0;
      if (currentCount >= this.config.maxPollsPerCity) {
        continue;
      }

      const axis = await this.buildSeededAxis(topic);
      const poll = await this.prisma.poll.create({
        data: {
          topicId: topic.topicId,
          question: topic.title,
          marketKey: topic.marketKey,
          region: topic.region,
          state: PollState.active,
          origin: PollOrigin.seeded,
          mode: PollMode.ranked,
          axis: axis ?? Prisma.JsonNull,
          scheduledFor: now,
          launchedAt: now,
          allowUserAdditions: true,
          metadata:
            topic.currentPriorityMetadata ?? topic.metadata ?? Prisma.JsonNull,
        },
      });

      await this.prisma.pollTopic.update({
        where: { topicId: topic.topicId },
        data: {
          status: PollTopicStatus.archived,
          metadata:
            topic.currentPriorityMetadata ?? topic.metadata ?? Prisma.JsonNull,
        },
      });

      if (topic.seedEntityIds.length) {
        await this.prisma.entity.updateMany({
          where: {
            entityId: { in: topic.seedEntityIds },
          },
          data: {
            lastPolledAt: now,
          },
        });
      }

      marketCounts.set(marketKey, currentCount + 1);
      pollsByMarket.set(marketKey, [
        ...(pollsByMarket.get(marketKey) ?? []),
        poll.pollId,
      ]);
      publishedTopicsByMarket.set(marketKey, [
        ...(publishedTopicsByMarket.get(marketKey) ?? []),
        topic,
      ]);
      published += 1;
    }

    for (const [marketKey, publishedTopics] of publishedTopicsByMarket) {
      await this.tracePollPublishSelection({
        marketKey,
        publishedTopics,
        candidatePool: scoredTopics.filter(
          (topic) => topic.marketKey?.trim().toLowerCase() === marketKey,
        ),
        cycleStartAt: now,
      });
    }

    for (const [marketKey, pollIds] of pollsByMarket.entries()) {
      await this.notifications.queuePollReleaseNotification({
        city: marketKey,
        pollIds,
        scheduledFor: now,
      });
    }

    if (published > 0) {
      this.logger.info('Published weekly polls', { published });
    }
  }

  private shouldPublishPolls(now: Date): boolean {
    return (
      now.getDay() === this.config.releaseDayOfWeek &&
      now.getHours() === this.config.releaseHour
    );
  }

  private currentHourWindow(now: Date): { start: Date; end: Date } {
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return { start, end };
  }

  private async rankReadyTopicsForPublish(
    topics: PollTopic[],
  ): Promise<PublishReadyTopic[]> {
    if (!topics.length) {
      return [];
    }

    const now = new Date();
    const since = new Date(
      now.getTime() - this.config.demandWindowDays * MS_PER_DAY,
    );
    const topicsByMarket = new Map<string, PollTopic[]>();
    for (const topic of topics) {
      const marketKey = topic.marketKey?.trim().toLowerCase();
      if (!marketKey) {
        continue;
      }
      topicsByMarket.set(marketKey, [
        ...(topicsByMarket.get(marketKey) ?? []),
        topic,
      ]);
    }

    const candidateByMarketEntityId = new Map<string, PollScoredCandidate>();
    for (const [marketKey, marketTopics] of topicsByMarket.entries()) {
      const candidates = await this.planMarketTopicCandidates({
        marketKey,
        since,
        limit: Math.max(80, marketTopics.length * 4),
      });
      for (const candidate of candidates) {
        candidateByMarketEntityId.set(
          `${marketKey}:${candidate.entityId}`,
          candidate,
        );
      }
    }

    return topics.map((topic) => {
      const marketKey = topic.marketKey?.trim().toLowerCase() ?? '';
      const targetEntityId = topic.targetDishId ?? topic.targetRestaurantId;
      const candidate =
        targetEntityId && marketKey
          ? candidateByMarketEntityId.get(`${marketKey}:${targetEntityId}`)
          : undefined;
      return {
        ...topic,
        currentPriorityScore: candidate?.finalScore ?? 0,
        currentPriorityRank: candidate?.rank ?? Number.MAX_SAFE_INTEGER,
        currentPriorityMetadata: candidate
          ? this.mergeTopicPriorityMetadata(topic.metadata, candidate)
          : topic.metadata,
      };
    });
  }

  private mergeTopicPriorityMetadata(
    metadata: Prisma.JsonValue | null,
    candidate: PollScoredCandidate,
  ): Prisma.JsonObject {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? { ...metadata }
        : {};
    return {
      ...base,
      source: 'search_demand_daily',
      pollPriority: {
        score: candidate.finalScore,
        rank: candidate.rank,
        scorerVersion: POLL_TOPIC_SCORER_VERSION,
        refreshedAt: new Date().toISOString(),
        factors: candidate.factorBreakdown,
      },
    } satisfies Prisma.JsonObject;
  }

  private async tracePollPublishSelection(params: {
    marketKey: string;
    publishedTopics: PublishReadyTopic[];
    candidatePool: PublishReadyTopic[];
    cycleStartAt: Date;
  }): Promise<void> {
    if (!params.publishedTopics.length) {
      return;
    }

    try {
      const traceAllCandidates = this.shouldTraceAllCandidates();
      const runId = await this.scoringTrace.createRun({
        consumerKind: DemandScoringConsumerKind.poll_topic,
        marketKey: params.marketKey,
        cycleStartAt: params.cycleStartAt,
        cycleEndAt: new Date(),
        scorerVersion: POLL_TOPIC_SCORER_VERSION,
        traceAllCandidates,
        metadata: {
          phase: 'publish',
          maxPollsPerCity: this.config.maxPollsPerCity,
        },
      });
      const publishedIds = new Set(
        params.publishedTopics.map((topic) => topic.topicId),
      );
      const rejectedTopics = params.candidatePool.filter(
        (topic) => !publishedIds.has(topic.topicId),
      );
      const tracedRejectedTopics = traceAllCandidates
        ? rejectedTopics
        : rejectedTopics.slice(0, 10);
      await this.scoringTrace.recordCandidates(runId, [
        ...params.publishedTopics.map((topic, index) =>
          this.buildPollTopicTraceCandidate({
            topic,
            rank: index + 1,
            selected: true,
            decisionState: DemandScoringDecisionState.selected,
            decisionReason: 'poll_published',
          }),
        ),
        ...tracedRejectedTopics.map((topic, index) =>
          this.buildPollTopicTraceCandidate({
            topic,
            rank: topic.currentPriorityRank,
            selected: false,
            decisionState:
              traceAllCandidates && index >= 10
                ? DemandScoringDecisionState.budget_reject
                : DemandScoringDecisionState.near_miss,
            decisionReason:
              traceAllCandidates && index >= 10
                ? 'trace_all_not_published'
                : 'not_published_this_cycle',
            traceScope:
              traceAllCandidates && index >= 10 ? 'all_candidate' : 'near_miss',
          }),
        ),
      ]);
      await this.scoringTrace.finishRun(runId);
    } catch (error) {
      this.logger.warn('Failed to trace poll publish selection', {
        marketKey: params.marketKey,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  private buildPollTopicTraceCandidate(params: {
    topic: PublishReadyTopic;
    rank: number;
    selected: boolean;
    decisionState: DemandScoringDecisionState;
    decisionReason: string;
    traceScope?: 'near_miss' | 'all_candidate';
  }) {
    const entityId =
      params.topic.targetDishId ?? params.topic.targetRestaurantId ?? null;
    const entityType = params.topic.targetDishId
      ? EntityType.food
      : params.topic.targetRestaurantId
        ? EntityType.restaurant
        : null;
    const priority = this.getTopicPriority(
      params.topic.currentPriorityMetadata,
    );
    const factorBreakdown =
      priority?.factors &&
      typeof priority.factors === 'object' &&
      !Array.isArray(priority.factors)
        ? { ...(priority.factors as Prisma.JsonObject) }
        : {};
    return {
      consumerKind: DemandScoringConsumerKind.poll_topic,
      candidateKind: params.topic.topicType as string,
      subjectKind: DemandSubjectKind.entity,
      subjectKey: entityId ?? params.topic.topicId,
      marketKey: params.topic.marketKey,
      entityId,
      entityType,
      finalScore: params.topic.currentPriorityScore,
      rank: params.rank,
      selected: params.selected,
      decisionState: params.decisionState,
      decisionReason: params.decisionReason,
      factorBreakdown: {
        ...factorBreakdown,
        phase: 'publish',
        topicId: params.topic.topicId,
        ...(params.traceScope ? { traceScope: params.traceScope } : {}),
      } satisfies Prisma.JsonObject,
    };
  }

  private buildDishQuestion(dishName: string): string {
    return `What's the best ${dishName} right now?`;
  }

  private buildRestaurantQuestion(restaurantName: string): string {
    return `What should we order at ${restaurantName}?`;
  }

  private getTopicPriorityScore(metadata: Prisma.JsonValue | null): number {
    const priority = this.getTopicPriority(metadata);
    const score = priority?.score;
    return typeof score === 'number' && Number.isFinite(score) ? score : 0;
  }

  private getTopicPriorityRank(metadata: Prisma.JsonValue | null): number {
    const priority = this.getTopicPriority(metadata);
    const rank = priority?.rank;
    return typeof rank === 'number' && Number.isFinite(rank)
      ? rank
      : Number.MAX_SAFE_INTEGER;
  }

  private getTopicPriority(
    metadata: Prisma.JsonValue | null,
  ): { score?: unknown; rank?: unknown; factors?: unknown } | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    const priority = (metadata as Record<string, unknown>).pollPriority;
    if (!priority || typeof priority !== 'object' || Array.isArray(priority)) {
      return null;
    }
    return priority as { score?: unknown; rank?: unknown; factors?: unknown };
  }
}
