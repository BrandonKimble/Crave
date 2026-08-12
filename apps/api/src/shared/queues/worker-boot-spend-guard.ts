import {
  QUEUE_SPEND_CLASSIFICATION,
  SPEND_BEARING_QUEUE_NAMES,
} from './queue-spend-classification';

/**
 * THE WORKER-BOOT SPEND GUARD (ledger 12d, from a real $25 incident).
 *
 * A freshly booted worker drained a FOSSIL backlog: ~1,100 grounding and
 * cuisine jobs enqueued by a process that had already died, ~880 Google
 * Places calls, none of it work anyone had asked for that day.
 * `DISABLE_RESTAURANT_ENRICHMENT` gated new SCHEDULING and did nothing about
 * the jobs already sitting in Redis — a flag on the tap, not on the bucket.
 *
 * THE LAW THIS ENCODES: a worker may spend money on work IT was told about.
 * Work that predates its own boot is, by definition, someone else's decision
 * — usually a decision that has since been reversed (a killed reload, a
 * disarmed re-extract, a crashed run). So on boot, BEFORE any spend-bearing
 * queue is consumed, the pre-existing backlog is measured. Past a small
 * grace, the queue is PAUSED and a critical ops alert names the queue, the
 * backlog, and the exact command to resume. A human — or a budget-owning
 * process — resumes deliberately.
 *
 * WHY NO ENV FLAG. The mechanism IS the law: there is nothing to turn on,
 * and exactly one way to turn it off for a given queue (resume it, which is
 * also the only way to spend the backlog). An env flag would just be the
 * `DISABLE_RESTAURANT_ENRICHMENT` mistake again — a second thing to remember.
 *
 * WHY THIS RUNS BEFORE NEST. `@nestjs/bull` starts consuming inside module
 * init, so any Nest-lifecycle hook is a race with the first jobs. This runs
 * from `main.ts` against raw Bull clients before `NestFactory.create`, so
 * "before consuming" is a fact, not a hope. Bull's GLOBAL pause is a Redis
 * RENAME of the wait list, so the pause survives the pre-Nest → Nest
 * boundary and every subsequent restart: a paused queue stays paused until a
 * human resumes it. Adding jobs still works while paused — they queue up
 * behind the pause and drain on resume; nothing is lost.
 *
 * The ALERT is emitted later, by `BootSpendGuardAlertService`, because the
 * alert infrastructure (Prisma + Resend) only exists once Nest is up. The
 * verdicts recorded here are the handoff.
 */

/**
 * How many pre-boot jobs are "normal churn". A rolling redeploy legitimately
 * leaves a handful of jobs mid-flight, and freezing the lane on every deploy
 * would make the guard something people route around. The incident was 1,100.
 */
export const PRE_BOOT_BACKLOG_GRACE = 25;

/** The one switch. Named verbatim in the alert so nobody has to go find it. */
export const resumeCommandFor = (queueName: string): string =>
  `cd apps/api && npx ts-node scripts/job-control.ts resume ${queueName}`;

export interface QueueBacklogPort {
  /**
   * Jobs already ENQUEUED (waiting / paused / delayed) whose enqueue time
   * predates `bootAt`. Active jobs are excluded on purpose: another live
   * worker owning them is not this worker's fossil.
   */
  countPreBootBacklog(queueName: string, bootAt: number): Promise<number>;
  isPaused(queueName: string): Promise<boolean>;
  /** GLOBAL pause — durable in Redis, survives this process. */
  pause(queueName: string): Promise<void>;
}

export type BootSpendGuardOutcome =
  /** Fossil backlog over the grace: queue paused, human must resume. */
  | 'paused'
  /** Backlog within the grace: queue drains normally. */
  | 'within-grace'
  /** A previous boot (or a human) already paused it. Left alone. */
  | 'already-paused'
  /** Could not measure. Paused anyway — see the fail-closed note below. */
  | 'measurement-failed';

export interface BootSpendGuardVerdict {
  readonly queueName: string;
  readonly outcome: BootSpendGuardOutcome;
  readonly backlog: number;
  readonly resumeCommand: string;
  readonly detail?: string;
}

const pendingVerdicts: BootSpendGuardVerdict[] = [];

/** Drained once by `BootSpendGuardAlertService` after Nest is up. */
export const takeBootSpendGuardVerdicts = (): BootSpendGuardVerdict[] =>
  pendingVerdicts.splice(0, pendingVerdicts.length);

/**
 * Measure, and pause what must not drain. Returns the verdicts it also
 * records for the alert service.
 *
 * Non-spend queues are never touched — they are not passed in, not measured,
 * not paused. A fossil backlog of Reddit reads costs latency, not dollars.
 */
export const guardSpendBearingQueuesAtBoot = async (params: {
  port: QueueBacklogPort;
  bootAt: number;
  /** Defaults to every `vendor-spend` queue in the classification. */
  queueNames?: readonly string[];
  grace?: number;
}): Promise<BootSpendGuardVerdict[]> => {
  const grace = params.grace ?? PRE_BOOT_BACKLOG_GRACE;
  const queueNames = params.queueNames ?? SPEND_BEARING_QUEUE_NAMES;
  const verdicts: BootSpendGuardVerdict[] = [];

  for (const queueName of queueNames) {
    // A caller that hands us a non-spend queue is asking for the wrong thing;
    // the classification, not the caller, decides what gets frozen.
    if (QUEUE_SPEND_CLASSIFICATION[queueName]?.spend !== 'vendor-spend') {
      continue;
    }
    const resumeCommand = resumeCommandFor(queueName);
    try {
      if (await params.port.isPaused(queueName)) {
        verdicts.push({
          queueName,
          outcome: 'already-paused',
          backlog: 0,
          resumeCommand,
        });
        continue;
      }
      const backlog = await params.port.countPreBootBacklog(
        queueName,
        params.bootAt,
      );
      if (backlog <= grace) {
        verdicts.push({
          queueName,
          outcome: 'within-grace',
          backlog,
          resumeCommand,
        });
        continue;
      }
      await params.port.pause(queueName);
      verdicts.push({ queueName, outcome: 'paused', backlog, resumeCommand });
    } catch (error) {
      // FAIL CLOSED. "We could not tell whether this queue holds a thousand
      // vendor calls" resolves to not spending: the failure mode we are
      // paying down cost $25 by assuming the optimistic answer. If the pause
      // itself is what failed, the alert still fires and says so.
      const detail = error instanceof Error ? error.message : String(error);
      await params.port.pause(queueName).catch(() => undefined);
      verdicts.push({
        queueName,
        outcome: 'measurement-failed',
        backlog: -1,
        resumeCommand,
        detail,
      });
    }
  }

  pendingVerdicts.push(...verdicts);
  return verdicts;
};
