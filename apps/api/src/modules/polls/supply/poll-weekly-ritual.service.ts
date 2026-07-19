/**
 * §4 THE WEEKLY RITUAL — one tick per place at Sunday 09:00 LOCAL, publishing
 * the controller-approved cohort TOGETHER (appointment behavior; 7-day
 * windows close together = weekly results day).
 *
 * Implementation shape (per the §22 staging directive): an HOURLY cron that
 * fires exactly the places whose local wall-clock is inside their Sunday
 * ritual (dow = Sunday, hour ≥ 09:00 — the ≥ gives same-Sunday catch-up if
 * an hour is missed; a fully missed Sunday is skipped, next week's tick
 * carries the demand — credit persists). Hours in which NO timezone on earth
 * can be inside that window are derived from the UTC instant and skipped
 * without touching the database (red-team 3a). The pacer-lane version
 * replaces the cron wholesale when the §21.2 pacer lands. Idempotency: the
 * UNIQUE (placeId, weekOf-local) tick row, created INSIDE the publish
 * transaction — publish is atomic (tick + poll rows + archived
 * birth-certificate topics + supply-state update + the notification queue
 * rows) so a crash can neither double-publish nor half-publish nor lose the
 * push (red-team 1c). Per-place jitter within the minute is a deterministic
 * hash of the placeId.
 *
 * TIME IS LABELS, NOT MILLISECONDS: cohort closure ("has the week passed?")
 * and evidence consumption ("did the last tick already see this cohort?")
 * compare weekOf LABELS in the place's local calendar (red-team 1a/2b) — a
 * cohort launched last Sunday closes at this Sunday's tick regardless of
 * wall-clock drift or DST, and a consumed cohort can never re-drive the
 * median test.
 *
 * Subject choice: demandMass × cooldownAvailability × resurgenceBoost
 * (28d gaussian cooldown recovery; resurgence = surge-over-baseline as a
 * multiplicative factor ≥ 1). The cooldown also GATES (red-team 2d): a
 * subject is unavailable until the gaussian ramp — measured from its last
 * poll's WINDOW CLOSE — recovers to at least the ramp's own value at the
 * window length (no new constant; see rampRecovered). Credit with no ranked
 * subject publishes the structural bootstrap poll ("Best restaurants in
 * {place}") — browse-only towns cold-start via viewport_dwell; the bootstrap
 * obeys the SAME cooldown gate, so it can never re-publish while the prior
 * bootstrap's window just closed. If nobody answers, answerYield contracts
 * the credit to zero (the ghost-town law is the gate — no threshold constant
 * exists).
 *
 * Topics are birth certificates written AT publish, already archived — no
 * ready pool, no draft state, no nightly refresh cron.
 */
import { randomUUID } from 'node:crypto';
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
  ESTIMATOR_EVIDENCE_HORIZON_DAYS,
  MS_PER_DAY,
  RITUAL_LOCAL_DAY_OF_WEEK,
  RITUAL_LOCAL_HOUR,
  SEEDED_POLL_WINDOW_DAYS,
} from './poll-supply.constants';
import {
  anyZoneInsideLocalWindow,
  currentWeekOfLabel,
  effectiveTimeZone,
  labelDayDiff,
  localParts,
  ritualJitterMs,
} from './place-local-time';

interface RankedSubject {
  subject: SubjectDemandMass;
  cooldownAvailability: number;
  resurgenceBoost: number;
  score: number;
}

/**
 * THE COOLDOWN GATE (red-team 2d), derived from the existing gaussianRamp
 * with NO new constant. Recovery is measured from the last poll's WINDOW
 * CLOSE (launch + window — the subject occupied the stage through its whole
 * window), and the availability threshold is the ramp's OWN value at the
 * window length:
 *
 *   available ⇔ gaussianRamp(sinceClose, 28d) ≥ gaussianRamp(window, 28d)
 *   where sinceClose = labelDaysSinceLaunch − window.
 *
 * Reading: "a subject can't repeat while its last poll's window just
 * closed" — at the next tick sinceClose ≈ 0 so the ramp is 0, strictly under
 * the threshold; by monotonicity the gate first opens one full window past
 * close (label distance ≥ 2 × window = 14d at weekly cadence). Judged on
 * weekOf LABELS so DST / wall-clock drift can never flip it.
 */
function rampRecovered(labelDaysSinceLaunch: number): boolean {
  return (
    gaussianRamp(
      labelDaysSinceLaunch - SEEDED_POLL_WINDOW_DAYS,
      COOLDOWN_GAUSSIAN_DAYS,
    ) >= gaussianRamp(SEEDED_POLL_WINDOW_DAYS, COOLDOWN_GAUSSIAN_DAYS)
  );
}

type Sleeper = (ms: number) => Promise<void>;
const defaultSleep: Sleeper = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Publish-transaction timeout: headroom for warm-start cohorts (the writes
 *  are two createMany batches + three rows, but a 100+-poll payload and the
 *  notification queue insert deserve slack — a K3-class operational bound,
 *  not a behavior constant). */
const PUBLISH_TX_TIMEOUT_MS = 20_000;

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
    // Red-team 3a: if NO timezone on earth is inside the Sunday ritual
    // window at this instant, nothing can be due — skip the candidate scan
    // entirely (pure UTC derivation, zero queries).
    if (
      !anyZoneInsideLocalWindow(
        now,
        RITUAL_LOCAL_DAY_OF_WEEK,
        RITUAL_LOCAL_HOUR,
      )
    ) {
      return;
    }

    // Candidates: places with a signal inside the kernel's derived horizon
    // (mass can be > 0) plus places carrying supply state (credit/frontier
    // maintenance).
    const [signalPlaceIds, supplyRows] = await Promise.all([
      this.demandMass.placesWithAnySignal(now),
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
    const zoneByPlace = new Map<string, string>();
    for (const place of places) {
      const zone = effectiveTimeZone(place);
      if (!zone) {
        // Un-sketched centroid — cannot host a local ritual yet (documented
        // skip; the place enters the ritual once §2 sketches it).
        continue;
      }
      zoneByPlace.set(place.placeId, zone);
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

    // Red-team 2b — ONCE-ONLY evidence consumption, in label space: the
    // last tick (creditUpdatedAt) ran in some ritual week L; every cohort it
    // could already see had weekOf < L, so only cohorts with weekOf ≥ L are
    // NEW evidence for the median test / first-cohort correction. A place
    // with no state (or no timestamp) consumes everything.
    const lastCohortByPlace = new Map<string, number[]>();
    for (const outcome of outcomes) {
      const state = stateByPlace.get(outcome.placeId);
      if (state?.creditUpdatedAt) {
        const zone = zoneByPlace.get(outcome.placeId);
        if (zone) {
          const consumedFloor = currentWeekOfLabel(
            state.creditUpdatedAt,
            zone,
            RITUAL_LOCAL_DAY_OF_WEEK,
          );
          if (outcome.weekOf < consumedFloor) {
            continue; // already consumed by a prior tick — never replays
          }
        }
      }
      // outcomes are sorted ascending by observedAt; the last write wins.
      lastCohortByPlace.set(outcome.placeId, outcome.answerCounts);
    }

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
   * Durable cohort outcomes: every place-keyed seeded poll whose ritual week
   * has PASSED — judged by weekOf LABEL in the place's local calendar
   * (cohort.weekOf < the place's current-cycle weekOf), never by wall-clock
   * elapsed ms (red-team 1a: a cohort launched last Sunday closes at this
   * Sunday's tick even when DST or ms drift makes the elapsed time < 7·24h).
   * Bounded below by the estimator-evidence horizon (red-team 3b: beyond 10
   * estimator half-lives a cohort contributes < epsilon to every estimate).
   * Answers come from the immutable poll_vote ledger (distinct actors), so
   * this never waits on the lifecycle cron's close pass.
   */
  private async harvestCohortOutcomes(now: Date): Promise<CohortOutcome[]> {
    const horizonStart = new Date(
      now.getTime() - ESTIMATOR_EVIDENCE_HORIZON_DAYS * MS_PER_DAY,
    );
    const polls = await this.prisma.poll.findMany({
      where: {
        origin: PollOrigin.seeded,
        placeId: { not: null },
        launchedAt: { gte: horizonStart, lte: now },
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

    // Closure is a LABEL judgment in each place's local calendar.
    const placeIds = [...new Set(polls.map((poll) => poll.placeId as string))];
    const places = await this.prisma.place.findMany({
      where: { placeId: { in: placeIds } },
      select: { placeId: true, timeZone: true, centroidLng: true },
    });
    const currentWeekOfByPlace = new Map<string, string>();
    for (const place of places) {
      // A place that hosted a ritual has a zone; 'Etc/GMT' is the inert
      // fallback for legacy rows so closure still resolves deterministically.
      const zone = effectiveTimeZone(place) ?? 'Etc/GMT';
      currentWeekOfByPlace.set(
        place.placeId,
        currentWeekOfLabel(now, zone, RITUAL_LOCAL_DAY_OF_WEEK),
      );
    }

    const pollWeekOf = (poll: (typeof polls)[number]): string =>
      (poll.metadata as { weekOf?: string } | null)?.weekOf ??
      (poll.launchedAt ?? new Date(0)).toISOString().slice(0, 10);
    const closedPolls = polls.filter((poll) => {
      const currentWeekOf = currentWeekOfByPlace.get(poll.placeId as string);
      return currentWeekOf !== undefined && pollWeekOf(poll) < currentWeekOf;
    });
    if (!closedPolls.length) {
      return [];
    }

    const pollIds = closedPolls.map((poll) => poll.pollId);
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
      {
        placeId: string;
        weekOf: string;
        launchedAt: Date;
        polls: typeof closedPolls;
      }
    >();
    for (const poll of closedPolls) {
      const weekOf = pollWeekOf(poll);
      const key = `${poll.placeId}:${weekOf}`;
      const cohort = cohorts.get(key) ?? {
        placeId: poll.placeId as string,
        weekOf,
        launchedAt: poll.launchedAt ?? new Date(0),
        polls: [] as typeof closedPolls,
      };
      cohort.polls.push(poll);
      cohorts.set(key, cohort);
    }

    // Attention mass AT LAUNCH — the demand that warranted each cohort —
    // read for ALL cohorts in one batched query (red-team 3b).
    const cohortList = [...cohorts.values()];
    const massRows = await this.demandMass.placeDemandMassAt(
      cohortList.map((cohort) => ({
        placeId: cohort.placeId,
        at: cohort.launchedAt,
      })),
    );
    const massByCohort = new Map(
      massRows.map((row) => [`${row.placeId}:${row.at.getTime()}`, row.mass]),
    );

    const outcomes: CohortOutcome[] = [];
    for (const cohort of cohortList) {
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
        weekOf: cohort.weekOf,
        attentionMass:
          massByCohort.get(
            `${cohort.placeId}:${cohort.launchedAt.getTime()}`,
          ) ?? 0,
        answerCounts,
        viableAnswerCounts,
        // Evidence timestamp for registry decay: the window's nominal end,
        // clamped to now (label closure can precede launch+7d in wall-clock
        // terms on a DST week — an observation is never dated in the future).
        observedAt: new Date(
          Math.min(
            cohort.launchedAt.getTime() + SEEDED_POLL_WINDOW_DAYS * MS_PER_DAY,
            now.getTime(),
          ),
        ),
      });
    }
    return outcomes.sort(
      (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
    );
  }

  /**
   * Last birth-certificate topic per (place, subject) and per-place
   * bootstrap, as weekOf LABELS — the cooldown gate and the availability
   * multiplier both run on label distance (deterministic at weekly cadence,
   * DST-immune). Topics without a weekOf (legacy) fall back to their
   * createdAt calendar date — a day-grain label that compares identically.
   */
  private async loadCooldowns(placeIds: string[]): Promise<{
    bySubject: Map<string, string>;
    bootstrapByPlace: Map<string, string>;
  }> {
    const topics = await this.prisma.pollTopic.findMany({
      where: { placeId: { in: placeIds } },
      select: {
        placeId: true,
        topicType: true,
        targetDishId: true,
        targetRestaurantId: true,
        createdAt: true,
        metadata: true,
      },
    });
    const topicWeekOf = (topic: (typeof topics)[number]): string =>
      (topic.metadata as { weekOf?: string } | null)?.weekOf ??
      topic.createdAt.toISOString().slice(0, 10);
    const bySubject = new Map<string, string>();
    const bootstrapByPlace = new Map<string, string>();
    for (const topic of topics) {
      const weekOf = topicWeekOf(topic);
      if (topic.topicType === PollTopicType.best_restaurants) {
        const prev = bootstrapByPlace.get(topic.placeId as string);
        if (!prev || weekOf > prev) {
          bootstrapByPlace.set(topic.placeId as string, weekOf);
        }
        continue;
      }
      const target = topic.targetDishId ?? topic.targetRestaurantId;
      if (!target) continue;
      const key = `${topic.placeId}:${target}`;
      const prev = bySubject.get(key);
      if (!prev || weekOf > prev) {
        bySubject.set(key, weekOf);
      }
    }
    return { bySubject, bootstrapByPlace };
  }

  private rankSubjects(params: {
    weekOf: string;
    placeId: string;
    subjects: SubjectDemandMass[];
    cooldowns: Map<string, string>;
  }): RankedSubject[] {
    return params.subjects
      .map((subject) => {
        const lastWeekOf = params.cooldowns.get(
          `${params.placeId}:${subject.subjectId}`,
        );
        const sinceDays = lastWeekOf
          ? labelDayDiff(params.weekOf, lastWeekOf)
          : null;
        // THE GATE (red-team 2d): a just-polled subject is structurally
        // unavailable — not merely down-ranked — until the ramp recovers
        // (see rampRecovered). With alternatives it loses to them anyway;
        // WITHOUT alternatives (subject pool of 1) the gate is what stops
        // the same subject re-polling the very next week.
        if (sinceDays !== null && !rampRecovered(sinceDays)) {
          return null;
        }
        const cooldownAvailability =
          sinceDays !== null
            ? gaussianRamp(sinceDays, COOLDOWN_GAUSSIAN_DAYS)
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
      .filter(
        (ranked): ranked is RankedSubject =>
          ranked !== null && ranked.score > 0,
      )
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
      bySubject: Map<string, string>;
      bootstrapByPlace: Map<string, string>;
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

    // Red-team 1c/2a: a place with NO state and NO warrant writes NOTHING —
    // no tick row, no supply row. One searcher (or one continental viewport)
    // must leave no per-place residue; a place WITH state falls through so
    // its weekly decay bookkeeping still commits even at publish 0.
    if (!params.state && decision.cohortTarget < 1) {
      this.logger.debug('Weekly ritual: no warrant and no state — no rows', {
        placeId,
        weekOf,
        creditRate: decision.creditRate,
      });
      return;
    }

    const ranked = this.rankSubjects({
      weekOf,
      placeId,
      subjects: params.subjects,
      cooldowns: params.cooldowns.bySubject,
    });
    const selection = ranked.slice(0, Math.max(0, decision.cohortTarget));

    // Red-team 2d (bootstrap gate): the structural bootstrap obeys the same
    // ramp law as any subject — no re-publish while the prior bootstrap's
    // window just closed.
    const lastBootstrapWeekOf = params.cooldowns.bootstrapByPlace.get(placeId);
    const bootstrapAvailable =
      !lastBootstrapWeekOf ||
      rampRecovered(labelDayDiff(weekOf, lastBootstrapWeekOf));
    const useBootstrap =
      selection.length === 0 &&
      decision.cohortTarget >= 1 &&
      bootstrapAvailable;

    const controllerFactors = this.controllerFactors(decision, readings);

    // Build the full publish payload OUTSIDE the transaction (ids minted
    // client-side) so the tx is two createMany batches + three rows — the
    // O(cohort) per-row await loop that starved the tx timeout is gone
    // (red-team 1c).
    interface PlannedPoll {
      topicId: string;
      pollId: string;
      topicType: PollTopicType;
      title: string;
      description: string;
      targetDishId: string | null;
      targetRestaurantId: string | null;
      categoryEntityIds: string[];
      seedEntityIds: string[];
      axis: Prisma.InputJsonValue;
      birthCertificate: Prisma.JsonObject;
    }
    const planned: PlannedPoll[] = [];
    if (useBootstrap) {
      planned.push({
        topicId: randomUUID(),
        pollId: randomUUID(),
        topicType: PollTopicType.best_restaurants,
        title: `Best restaurants in ${params.placeName}`,
        description: `Help rank the best spots in ${params.placeName}.`,
        targetDishId: null,
        targetRestaurantId: null,
        categoryEntityIds: [],
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
          lastBootstrapWeekOf: lastBootstrapWeekOf ?? null,
          ...controllerFactors,
        },
      });
    } else {
      let rank = 0;
      for (const entry of selection) {
        rank += 1;
        const isDish = entry.subject.entityType === 'food';
        planned.push({
          topicId: randomUUID(),
          pollId: randomUUID(),
          topicType: isDish
            ? PollTopicType.best_dish
            : PollTopicType.what_to_order,
          title: isDish
            ? `What's the best ${entry.subject.entityName} right now?`
            : `What should we order at ${entry.subject.entityName}?`,
          description: isDish
            ? `Which spot has the best ${entry.subject.entityName}?`
            : `Help everyone decide what to order at ${entry.subject.entityName}.`,
          targetDishId: isDish ? entry.subject.subjectId : null,
          targetRestaurantId: isDish ? null : entry.subject.subjectId,
          categoryEntityIds: isDish ? [entry.subject.subjectId] : [],
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
    const publishedPollIds = planned.map((plan) => plan.pollId);

    await this.prisma.$transaction(
      async (tx) => {
        // The idempotency row FIRST — a concurrent tick for the same
        // (place, weekOf) dies here on the unique key and publishes nothing.
        await tx.pollWeeklyTick.create({
          data: {
            placeId,
            weekOf,
            publishedCount: planned.length,
            factors: controllerFactors,
          },
        });

        if (planned.length) {
          // Birth certificates written AT publish, already archived — there
          // is no draft or ready state to pass through (§4).
          await tx.pollTopic.createMany({
            data: planned.map((plan) => ({
              topicId: plan.topicId,
              title: plan.title,
              description: plan.description,
              placeId,
              topicType: plan.topicType,
              targetDishId: plan.targetDishId,
              targetRestaurantId: plan.targetRestaurantId,
              categoryEntityIds: plan.categoryEntityIds,
              seedEntityIds: plan.seedEntityIds,
              status: PollTopicStatus.archived,
              metadata: {
                source: 'poll_supply_weekly_ritual',
                weekOf,
                birthCertificate: plan.birthCertificate,
              } satisfies Prisma.JsonObject,
            })),
          });
          await tx.poll.createMany({
            data: planned.map((plan) => ({
              pollId: plan.pollId,
              topicId: plan.topicId,
              question: plan.title,
              placeId,
              state: PollState.active,
              origin: PollOrigin.seeded,
              mode: PollMode.ranked,
              axis: plan.axis,
              scheduledFor: now,
              launchedAt: now,
              allowUserAdditions: true,
              metadata: {
                weekOf,
                // K1: the 7-day poll window — read by poll-timing's
                // extractCloseWindowDays so cohorts close together.
                closeWindowDays: SEEDED_POLL_WINDOW_DAYS,
                birthCertificate: plan.birthCertificate,
              } satisfies Prisma.JsonObject,
            })),
          });
        }

        // Spend: 1 credit per published poll, inside the same transaction.
        await tx.pollPlaceSupply.upsert({
          where: { placeId },
          create: {
            placeId,
            frontier: decision.frontier,
            phase: decision.phase,
            credit: new Prisma.Decimal(
              Math.max(0, decision.credit - planned.length),
            ),
            creditUpdatedAt: now,
          },
          update: {
            frontier: decision.frontier,
            phase: decision.phase,
            credit: new Prisma.Decimal(
              Math.max(0, decision.credit - planned.length),
            ),
            creditUpdatedAt: now,
          },
        });

        if (publishedPollIds.length) {
          // §4 place-keyed notification moment, INSIDE the publish
          // transaction (red-team 1c): the notification rows ARE the durable
          // dispatch queue (the dispatcher cron sends + retries them), and
          // committing them WITH the polls means a crash can neither publish
          // silently nor push rolled-back polls. Targeting (home-place
          // subtree, big-place never-push) lives in NotificationsService.
          await this.notifications.queuePollReleaseForPlace(
            {
              placeId,
              placeName: params.placeName,
              pollIds: publishedPollIds,
              scheduledFor: now,
            },
            tx,
          );
        }
      },
      { timeout: PUBLISH_TX_TIMEOUT_MS },
    );

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
}
