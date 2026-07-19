/**
 * §4 THE WEEKLY RITUAL — one tick per place at Sunday 09:00 LOCAL, publishing
 * the controller-approved cohort TOGETHER (appointment behavior; 7-day
 * windows close together = weekly results day).
 *
 * Implementation shape (per the §22 staging directive): an HOURLY cron that
 * fires exactly the places whose local wall-clock is inside their Sunday
 * ritual (dow = Sunday, hour ≥ 09:00 — the ≥ gives same-Sunday catch-up if
 * an hour is missed; a fully missed Sunday is skipped, next week's tick
 * carries the demand — credit persists). The pacer-lane version replaces the
 * cron wholesale when the §21.2 pacer lands. Idempotency: the UNIQUE
 * (placeId, weekOf-local) tick row, created INSIDE the publish transaction —
 * publish is atomic (tick + poll rows + archived birth-certificate topics +
 * supply-state update) so a crash can neither double-publish nor
 * half-publish. Per-place jitter within the minute is a deterministic hash
 * of the placeId.
 *
 * Subject choice: demandMass × cooldownAvailability × resurgenceBoost
 * (28d gaussian cooldown recovery; resurgence = surge-over-baseline as a
 * multiplicative factor ≥ 1). Credit with no ranked subject publishes the
 * structural bootstrap poll ("Best restaurants in {place}") — browse-only
 * towns cold-start via viewport_dwell; if nobody answers, answerYield
 * contracts the credit to zero (the ghost-town law is the gate — no
 * threshold constant exists).
 *
 * Topics are birth certificates written AT publish, already archived — no
 * ready pool, no draft state, no nightly refresh cron.
 */
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  PollMode,
  PollOrigin,
  PollState,
  PollTopicStatus,
  PollTopicType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { NotificationsService } from '../../notifications/notifications.service';
import { gaussianRamp } from '../../analytics/demand-scoring/curves';
import { DemandMassReader, SubjectDemandMass } from './demand-mass.reader';
import { PollSupplyEstimators, CohortOutcome } from './poll-supply-estimators';
import {
  SupplyDecision,
  SupplyState,
  decideSupply,
} from './poll-supply-controller';
import {
  COOLDOWN_GAUSSIAN_DAYS,
  MS_PER_DAY,
  RITUAL_LOCAL_DAY_OF_WEEK,
  RITUAL_LOCAL_HOUR,
  SEEDED_POLL_WINDOW_DAYS,
} from './poll-supply.constants';
import {
  effectiveTimeZone,
  localParts,
  ritualJitterMs,
} from './place-local-time';

interface RankedSubject {
  subject: SubjectDemandMass;
  cooldownAvailability: number;
  resurgenceBoost: number;
  score: number;
}

type Sleeper = (ms: number) => Promise<void>;
const defaultSleep: Sleeper = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class PollWeeklyRitualService {
  private readonly logger: LoggerService;
  /** Injectable for specs — production uses real sleep for the jitter. */
  sleep: Sleeper = defaultSleep;

  constructor(
    private readonly prisma: PrismaService,
    private readonly demandMass: DemandMassReader,
    private readonly estimators: PollSupplyEstimators,
    private readonly notifications: NotificationsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PollWeeklyRitualService');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async tick(now: Date = new Date()): Promise<void> {
    try {
      await this.runTick(now);
    } catch (error) {
      this.logger.error('Weekly poll ritual tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async runTick(now: Date): Promise<void> {
    // Candidates: places with ANY intersecting signal (mass can be > 0) plus
    // places carrying supply state (credit/frontier maintenance).
    const [signalPlaceIds, supplyRows] = await Promise.all([
      this.demandMass.placesWithAnySignal(),
      this.prisma.pollPlaceSupply.findMany({
        select: { placeId: true },
      }),
    ]);
    const candidateIds = [
      ...new Set([...signalPlaceIds, ...supplyRows.map((row) => row.placeId)]),
    ];
    if (!candidateIds.length) {
      return;
    }

    const places = await this.prisma.place.findMany({
      where: { placeId: { in: candidateIds } },
      select: {
        placeId: true,
        name: true,
        timeZone: true,
        centroidLat: true,
        centroidLng: true,
      },
    });

    // Local-time gate: fire places inside their local Sunday ritual window.
    const due: { placeId: string; name: string; weekOf: string }[] = [];
    for (const place of places) {
      const zone = effectiveTimeZone(place);
      if (!zone) {
        // Un-sketched centroid — cannot host a local ritual yet (documented
        // skip; the place enters the ritual once §2 sketches it).
        continue;
      }
      const local = localParts(now, zone);
      if (
        local.dayOfWeek === RITUAL_LOCAL_DAY_OF_WEEK &&
        local.hour >= RITUAL_LOCAL_HOUR
      ) {
        due.push({
          placeId: place.placeId,
          name: place.name,
          weekOf: local.date,
        });
      }
    }
    if (!due.length) {
      return;
    }

    // Idempotency pre-check (cheap filter; the tick row inside the publish
    // transaction is the true guarantee).
    const existingTicks = await this.prisma.pollWeeklyTick.findMany({
      where: { OR: due.map((d) => ({ placeId: d.placeId, weekOf: d.weekOf })) },
      select: { placeId: true, weekOf: true },
    });
    const ticked = new Set(
      existingTicks.map((t) => `${t.placeId}:${t.weekOf}`),
    );
    const pending = due.filter((d) => !ticked.has(`${d.placeId}:${d.weekOf}`));
    if (!pending.length) {
      return;
    }

    // One registry per run, replayed from durable outcomes (global streams
    // need every place's cohorts, not just this hour's).
    const registry = this.estimators.buildRegistry();
    const outcomes = await this.harvestCohortOutcomes(now);
    for (const outcome of outcomes) {
      this.estimators.observeCohort(registry, outcome);
    }
    const lastCohortByPlace = new Map<string, number[]>();
    for (const outcome of outcomes) {
      // outcomes are sorted ascending by observedAt; the last write wins.
      lastCohortByPlace.set(outcome.placeId, outcome.answerCounts);
    }

    const pendingIds = pending.map((d) => d.placeId);
    const [massRows, subjectRows, supplyStates] = await Promise.all([
      this.demandMass.placeDemandMass(pendingIds, now),
      this.demandMass.subjectDemandMass(pendingIds, now),
      this.prisma.pollPlaceSupply.findMany({
        where: { placeId: { in: pendingIds } },
      }),
    ]);
    const massByPlace = new Map(massRows.map((r) => [r.placeId, r.mass]));
    const subjectsByPlace = new Map<string, SubjectDemandMass[]>();
    for (const row of subjectRows) {
      const list = subjectsByPlace.get(row.placeId) ?? [];
      list.push(row);
      subjectsByPlace.set(row.placeId, list);
    }
    const stateByPlace = new Map(
      supplyStates.map((row) => [
        row.placeId,
        {
          frontier: row.frontier,
          phase: row.phase as SupplyState['phase'],
          credit: Number(row.credit),
          creditUpdatedAt: row.creditUpdatedAt,
        } satisfies SupplyState,
      ]),
    );
    const cooldowns = await this.loadCooldowns(pendingIds);

    // Per-place jitter within the minute (§4): deterministic hash offsets,
    // walked in order.
    const ordered = [...pending].sort(
      (a, b) => ritualJitterMs(a.placeId) - ritualJitterMs(b.placeId),
    );
    let elapsed = 0;
    for (const entry of ordered) {
      const jitter = ritualJitterMs(entry.placeId);
      if (jitter > elapsed) {
        await this.sleep(jitter - elapsed);
        elapsed = jitter;
      }
      try {
        await this.publishForPlace({
          now,
          placeId: entry.placeId,
          placeName: entry.name,
          weekOf: entry.weekOf,
          weeklyDemandMass: massByPlace.get(entry.placeId) ?? 0,
          subjects: subjectsByPlace.get(entry.placeId) ?? [],
          state: stateByPlace.get(entry.placeId) ?? null,
          lastCohortAnswerCounts: lastCohortByPlace.get(entry.placeId) ?? null,
          registry,
          cooldowns,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Idempotency key hit: another tick already published this
          // (place, weekOf) — the atomic transaction rolled everything back.
          continue;
        }
        this.logger.error('Weekly ritual publish failed for place', {
          placeId: entry.placeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Durable cohort outcomes: every place-keyed seeded poll whose 7-day
   * window has fully elapsed, grouped into (place, weekOf) cohorts. Answers
   * come from the immutable poll_vote ledger (distinct actors), so this
   * never waits on the lifecycle cron's close pass.
   */
  private async harvestCohortOutcomes(now: Date): Promise<CohortOutcome[]> {
    const windowEnd = new Date(
      now.getTime() - SEEDED_POLL_WINDOW_DAYS * MS_PER_DAY,
    );
    const polls = await this.prisma.poll.findMany({
      where: {
        origin: PollOrigin.seeded,
        placeId: { not: null },
        launchedAt: { lte: windowEnd },
      },
      select: {
        pollId: true,
        placeId: true,
        launchedAt: true,
        graduatedAt: true,
        metadata: true,
      },
    });
    if (!polls.length) {
      return [];
    }
    const pollIds = polls.map((poll) => poll.pollId);
    const [voteRows, commentRows] = await Promise.all([
      this.prisma.$queryRaw<{ poll_id: string; answers: bigint }[]>`
        SELECT meta->>'pollId' AS poll_id, COUNT(DISTINCT actor_id) AS answers
        FROM signals
        WHERE kind = 'poll_vote' AND meta->>'pollId' = ANY(${pollIds}::text[])
        GROUP BY meta->>'pollId'
      `,
      this.prisma.pollComment.groupBy({
        by: ['pollId'],
        where: {
          pollId: { in: pollIds },
          deletedAt: null,
          moderationStatus: 'approved',
        },
        _count: { pollId: true },
      }),
    ]);
    const answersByPoll = new Map(
      voteRows.map((row) => [row.poll_id, Number(row.answers)]),
    );
    const commentsByPoll = new Map(
      commentRows.map((row) => [row.pollId, row._count.pollId]),
    );

    const cohorts = new Map<
      string,
      { placeId: string; launchedAt: Date; polls: typeof polls }
    >();
    for (const poll of polls) {
      const weekOf =
        (poll.metadata as { weekOf?: string } | null)?.weekOf ??
        (poll.launchedAt ?? new Date(0)).toISOString().slice(0, 10);
      const key = `${poll.placeId}:${weekOf}`;
      const cohort = cohorts.get(key) ?? {
        placeId: poll.placeId as string,
        launchedAt: poll.launchedAt ?? new Date(0),
        polls: [] as typeof polls,
      };
      cohort.polls.push(poll);
      cohorts.set(key, cohort);
    }

    const outcomes: CohortOutcome[] = [];
    for (const cohort of cohorts.values()) {
      // Attention mass AT LAUNCH — the demand that warranted the cohort.
      const [mass] = await this.demandMass.placeDemandMass(
        [cohort.placeId],
        cohort.launchedAt,
      );
      const answerCounts = cohort.polls.map(
        (poll) => answersByPoll.get(poll.pollId) ?? 0,
      );
      // Launch proxy for "demonstrably produced strong content": the poll
      // graduated AND carried discussion. OWNER-RATIFY(§18): the mature
      // definition (graduation richness, discussion depth, settledness) is
      // an item-6 aggregate reader; the estimator's observation stream is
      // re-derivable so the definition can change without data loss.
      const viableAnswerCounts = cohort.polls
        .filter(
          (poll) =>
            poll.graduatedAt !== null &&
            (commentsByPoll.get(poll.pollId) ?? 0) >= 1,
        )
        .map((poll) => answersByPoll.get(poll.pollId) ?? 0);
      outcomes.push({
        placeId: cohort.placeId,
        attentionMass: mass?.mass ?? 0,
        answerCounts,
        viableAnswerCounts,
        observedAt: new Date(
          cohort.launchedAt.getTime() + SEEDED_POLL_WINDOW_DAYS * MS_PER_DAY,
        ),
      });
    }
    return outcomes.sort(
      (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
    );
  }

  /** Last birth-certificate topic per (place, subject) and per-place
   *  bootstrap — the 28d gaussian cooldown's memory. */
  private async loadCooldowns(placeIds: string[]): Promise<{
    bySubject: Map<string, Date>;
    bootstrapByPlace: Map<string, Date>;
  }> {
    const topics = await this.prisma.pollTopic.findMany({
      where: { placeId: { in: placeIds } },
      select: {
        placeId: true,
        topicType: true,
        targetDishId: true,
        targetRestaurantId: true,
        createdAt: true,
      },
    });
    const bySubject = new Map<string, Date>();
    const bootstrapByPlace = new Map<string, Date>();
    for (const topic of topics) {
      if (topic.topicType === PollTopicType.best_restaurants) {
        const prev = bootstrapByPlace.get(topic.placeId as string);
        if (!prev || topic.createdAt > prev) {
          bootstrapByPlace.set(topic.placeId as string, topic.createdAt);
        }
        continue;
      }
      const target = topic.targetDishId ?? topic.targetRestaurantId;
      if (!target) continue;
      const key = `${topic.placeId}:${target}`;
      const prev = bySubject.get(key);
      if (!prev || topic.createdAt > prev) {
        bySubject.set(key, topic.createdAt);
      }
    }
    return { bySubject, bootstrapByPlace };
  }

  private rankSubjects(params: {
    now: Date;
    placeId: string;
    subjects: SubjectDemandMass[];
    cooldowns: Map<string, Date>;
  }): RankedSubject[] {
    return params.subjects
      .map((subject) => {
        const lastPolled = params.cooldowns.get(
          `${params.placeId}:${subject.subjectId}`,
        );
        const cooldownAvailability = lastPolled
          ? gaussianRamp(
              (params.now.getTime() - lastPolled.getTime()) / MS_PER_DAY,
              COOLDOWN_GAUSSIAN_DAYS,
            )
          : 1;
        // Surge-over-baseline as a multiplicative boost; max(1, ·) is
        // definitional — a "boost" never penalizes (§16).
        const resurgenceBoost =
          subject.baselineWeeklyMass > 0
            ? Math.max(1, subject.currentMass / subject.baselineWeeklyMass)
            : 1;
        return {
          subject,
          cooldownAvailability,
          resurgenceBoost,
          score: subject.mass * cooldownAvailability * resurgenceBoost,
        };
      })
      .filter((ranked) => ranked.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private async publishForPlace(params: {
    now: Date;
    placeId: string;
    placeName: string;
    weekOf: string;
    weeklyDemandMass: number;
    subjects: SubjectDemandMass[];
    state: SupplyState | null;
    lastCohortAnswerCounts: number[] | null;
    registry: ReturnType<PollSupplyEstimators['buildRegistry']>;
    cooldowns: {
      bySubject: Map<string, Date>;
      bootstrapByPlace: Map<string, Date>;
    };
  }): Promise<void> {
    const { now, placeId, weekOf } = params;
    const read = (name: string) =>
      this.estimators.hierarchicalRead(params.registry, name, placeId, now);
    const readings = {
      weeklyDemandMass: params.weeklyDemandMass,
      answerYield: read('poll.answerYield').estimate,
      conversion: read('poll.conversion').estimate,
      tailConcentration: read('poll.tailConcentration').estimate,
      viability: (() => {
        const reading = read('poll.viability');
        return {
          estimate: reading.estimate,
          uncertainty: reading.uncertainty,
        };
      })(),
    };
    const decision = decideSupply({
      now,
      state: params.state,
      readings,
      lastClosedCohortAnswerCounts: params.lastCohortAnswerCounts,
    });

    const ranked = this.rankSubjects({
      now,
      placeId,
      subjects: params.subjects,
      cooldowns: params.cooldowns.bySubject,
    });
    const selection = ranked.slice(0, Math.max(0, decision.cohortTarget));
    const useBootstrap = selection.length === 0 && decision.cohortTarget >= 1;
    const publishCount = useBootstrap ? 1 : selection.length;

    const marketKeyShim = await this.resolveMarketKeyShim(placeId);
    const controllerFactors = this.controllerFactors(decision, readings);

    const publishedPollIds = await this.prisma.$transaction(async (tx) => {
      // The idempotency row FIRST — a concurrent tick for the same
      // (place, weekOf) dies here on the unique key and publishes nothing.
      await tx.pollWeeklyTick.create({
        data: {
          placeId,
          weekOf,
          publishedCount: publishCount,
          factors: controllerFactors,
        },
      });

      const pollIds: string[] = [];
      const publishOne = async (input: {
        topicType: PollTopicType;
        title: string;
        description: string;
        targetDishId?: string;
        targetRestaurantId?: string;
        seedEntityIds: string[];
        axis: Prisma.InputJsonValue;
        birthCertificate: Prisma.JsonObject;
      }) => {
        // The birth certificate is written AT publish, already archived —
        // there is no draft or ready state to pass through (§4).
        const topic = await tx.pollTopic.create({
          data: {
            title: input.title,
            description: input.description,
            placeId,
            marketKey: marketKeyShim,
            topicType: input.topicType,
            targetDishId: input.targetDishId ?? null,
            targetRestaurantId: input.targetRestaurantId ?? null,
            categoryEntityIds: input.targetDishId ? [input.targetDishId] : [],
            seedEntityIds: input.seedEntityIds,
            status: PollTopicStatus.archived,
            metadata: {
              source: 'poll_supply_weekly_ritual',
              weekOf,
              birthCertificate: input.birthCertificate,
            } satisfies Prisma.JsonObject,
          },
          select: { topicId: true },
        });
        const poll = await tx.poll.create({
          data: {
            topicId: topic.topicId,
            question: input.title,
            placeId,
            marketKey: marketKeyShim,
            state: PollState.active,
            origin: PollOrigin.seeded,
            mode: PollMode.ranked,
            axis: input.axis,
            scheduledFor: now,
            launchedAt: now,
            allowUserAdditions: true,
            metadata: {
              weekOf,
              // K1: the 7-day poll window — read by poll-timing's
              // extractCloseWindowDays so cohorts close together.
              closeWindowDays: SEEDED_POLL_WINDOW_DAYS,
              birthCertificate: input.birthCertificate,
            } satisfies Prisma.JsonObject,
          },
          select: { pollId: true },
        });
        pollIds.push(poll.pollId);
      };

      if (useBootstrap) {
        await publishOne({
          topicType: PollTopicType.best_restaurants,
          title: `Best restaurants in ${params.placeName}`,
          description: `Help rank the best spots in ${params.placeName}.`,
          seedEntityIds: [],
          axis: {
            targetType: 'restaurant',
            constraint: null,
            anchor: null,
            marketHint: params.placeName,
          },
          birthCertificate: {
            kind: 'structural_bootstrap',
            demandMass: params.weeklyDemandMass,
            lastBootstrapAt:
              params.cooldowns.bootstrapByPlace.get(placeId)?.toISOString() ??
              null,
            ...controllerFactors,
          },
        });
      } else {
        let rank = 0;
        for (const entry of selection) {
          rank += 1;
          const isDish = entry.subject.entityType === 'food';
          await publishOne({
            topicType: isDish
              ? PollTopicType.best_dish
              : PollTopicType.what_to_order,
            title: isDish
              ? `What's the best ${entry.subject.entityName} right now?`
              : `What should we order at ${entry.subject.entityName}?`,
            description: isDish
              ? `Which spot has the best ${entry.subject.entityName}?`
              : `Help everyone decide what to order at ${entry.subject.entityName}.`,
            targetDishId: isDish ? entry.subject.subjectId : undefined,
            targetRestaurantId: isDish ? undefined : entry.subject.subjectId,
            seedEntityIds: [entry.subject.subjectId],
            axis: isDish
              ? {
                  targetType: 'dish',
                  constraint: {
                    kind: 'category',
                    value: entry.subject.entityName,
                  },
                  anchor: null,
                  marketHint: null,
                }
              : {
                  targetType: 'dish',
                  constraint: null,
                  anchor: entry.subject.entityName,
                  marketHint: null,
                },
            birthCertificate: {
              kind: 'subject',
              rank,
              demandMass: entry.subject.mass,
              currentMass: entry.subject.currentMass,
              baselineWeeklyMass: entry.subject.baselineWeeklyMass,
              cooldownAvailability: entry.cooldownAvailability,
              resurgenceBoost: entry.resurgenceBoost,
              score: entry.score,
              ...controllerFactors,
            },
          });
        }
      }

      // Spend: 1 credit per published poll, inside the same transaction.
      await tx.pollPlaceSupply.upsert({
        where: { placeId },
        create: {
          placeId,
          frontier: decision.frontier,
          phase: decision.phase,
          credit: new Prisma.Decimal(
            Math.max(0, decision.credit - pollIds.length),
          ),
          creditUpdatedAt: now,
        },
        update: {
          frontier: decision.frontier,
          phase: decision.phase,
          credit: new Prisma.Decimal(
            Math.max(0, decision.credit - pollIds.length),
          ),
          creditUpdatedAt: now,
        },
      });

      return pollIds;
    });

    if (publishedPollIds.length && marketKeyShim) {
      // Item-5 shim: notification targeting still keys on the legacy device
      // city registration; §4's home-place targeting lands with the feed cut.
      await this.notifications.queuePollReleaseNotification({
        city: marketKeyShim,
        pollIds: publishedPollIds,
        scheduledFor: now,
      });
    }

    this.logger.info('Weekly poll ritual published', {
      placeId,
      weekOf,
      published: publishedPollIds.length,
      frontier: decision.frontier,
      phase: decision.phase,
      creditRate: decision.creditRate,
    });
  }

  private controllerFactors(
    decision: SupplyDecision,
    readings: {
      weeklyDemandMass: number;
      answerYield: number;
      conversion: number;
      tailConcentration: number;
      viability: { estimate: number; uncertainty: number };
    },
  ): Prisma.JsonObject {
    return {
      controller: {
        frontier: decision.frontier,
        phase: decision.phase,
        creditRate: decision.creditRate,
        creditAfterAccrual: decision.credit,
        cohortTarget: decision.cohortTarget,
        predictedFrontier: decision.predictedFrontier,
        medianTestP: decision.medianTestP ?? null,
        weeklyDemandMass: readings.weeklyDemandMass,
        answerYield: readings.answerYield,
        conversion: readings.conversion,
        tailConcentration: readings.tailConcentration,
        viability: readings.viability.estimate,
        viabilityUncertainty: Number.isFinite(readings.viability.uncertainty)
          ? readings.viability.uncertainty
          : null,
      },
    };
  }

  /**
   * Item-5 SHIM (marked for deletion with the feed cut): the live feed and
   * notifications still key on marketKey, so a place-keyed poll gets the
   * smallest active legacy market whose bbox contains the place centroid,
   * when one exists. New supply TRUTH is placeId.
   */
  private async resolveMarketKeyShim(placeId: string): Promise<string | null> {
    const place = await this.prisma.place.findUnique({
      where: { placeId },
      select: { centroidLat: true, centroidLng: true },
    });
    if (place?.centroidLat == null || place.centroidLng == null) {
      return null;
    }
    const lat = Number(place.centroidLat);
    const lng = Number(place.centroidLng);
    const markets = await this.prisma.market.findMany({
      where: {
        isActive: true,
        bboxSwLat: { lte: lat },
        bboxNeLat: { gte: lat },
        bboxSwLng: { lte: lng },
        bboxNeLng: { gte: lng },
      },
      select: {
        marketKey: true,
        bboxSwLat: true,
        bboxNeLat: true,
        bboxSwLng: true,
        bboxNeLng: true,
      },
    });
    if (!markets.length) {
      return null;
    }
    let best: { marketKey: string; area: number } | null = null;
    for (const market of markets) {
      const area =
        (Number(market.bboxNeLat) - Number(market.bboxSwLat)) *
        (Number(market.bboxNeLng) - Number(market.bboxSwLng));
      if (!best || area < best.area) {
        best = { marketKey: market.marketKey, area };
      }
    }
    return best?.marketKey ?? null;
  }
}
