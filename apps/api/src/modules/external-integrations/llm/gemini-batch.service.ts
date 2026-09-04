import { isEnvFlagExplicitlyDisabled } from '../../../shared/config/env-flag';
import { NON_TERMINAL_BATCH_STATUSES } from './batch-job-status';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { isWorkerRuntime } from '../../../shared/utils/process-role';
import { OpsAlertsService } from '../shared/ops-alerts.service';
import { LLMService } from './llm.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService, buildCauseChain } from '../../../shared';
import { UsageLedgerService } from '../shared/usage-ledger.service';
import { currentCampaignId, runInWorkContext } from '../shared/work-context';
import { GovernanceService } from '../governance/governance.service';
import { SpendCampaignService } from '../shared/spend-campaign.service';

/** The provider job as the transport returns it — the terminalizer meters
 *  from this shape (red team 2026-08-19 D1/D2). */
type ProviderBatchJob = Awaited<
  ReturnType<ReturnType<LLMService['batchTransportOps']>['get']>
>;

export interface BatchSubmitItem {
  /** Caller's stable key for this item (e.g. the chunk id). */
  key: string;
  contents: string;
  config: Record<string, unknown>;
}

export interface BatchIngestItem {
  itemIndex: number;
  itemKey: string;
  /** GenerateContentResponse-shaped JSON (null when the item errored). */
  response: unknown;
  error: string | null;
}

export type BatchIngestor = (params: {
  jobId: string;
  purpose: string;
  resumeContext: unknown;
  items: BatchIngestItem[];
}) => Promise<void>;

export type BatchFailureHandler = (params: {
  jobId: string;
  purpose: string;
  resumeContext: unknown;
  error: string;
}) => Promise<void>;

/** DETERMINISTIC ingest failures beyond this many attempts are terminal.
 *  Transient failures (429/5xx/network) never consume attempts — the job is
 *  durable and waiting is free; this bound exists only as the misclassification
 *  guard (audit §4). */
const MAX_INGEST_ATTEMPTS = 3;

/** Lease horizon for claimed states ('persisting'/'submitting'/'ingesting').
 *  A live worker heartbeats the lease forward; an expired lease means the
 *  worker died and any poller may reclaim (audit §2 — bare status flips
 *  orphaned 4 jobs in the stage-2 load; nest --watch restarts are an orphan
 *  factory without this). */
const LEASE_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

const leaseFromNow = (): Date => new Date(Date.now() + LEASE_MS);

/** Poll cadence — unchanged from the retired @Cron(EVERY_5_MINUTES). */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Job statuses that still owe work — anything here for too long is stalled.
 *  Terminal ('ingested'/'failed') rows are done and never alarm. */
const NON_TERMINAL_STATUSES = NON_TERMINAL_BATCH_STATUSES;

/** STALL ALARM THRESHOLD. Evidence (no invented numbers): the 2026-08-31
 *  incident's 45 jobs were submitted at 03:18 UTC and the vendor had them
 *  all succeeded within ~1h; the healthy poller advances any non-terminal
 *  state every 5 minutes (updatedAt moves on each transition). 2h = double
 *  the observed worst vendor turnaround — a job whose updatedAt has not
 *  moved in 2h is not "slow", it is abandoned (nobody polling) or wedged
 *  at the provider. */
const STALL_ALARM_AFTER_MS = 2 * 60 * 60 * 1000;

/** Typed 'not now' errors — transient BY TYPE, not by message shape. A
 *  breached campaign (CampaignBreachedError) is a governance hold that
 *  lifts on resumeAfterBreach; a closed spend budget
 *  (SpendBudgetClosedError) reopens with the month window. Neither is a
 *  property of the input, so neither may burn a bounded deterministic
 *  attempt. Matched by error NAME across the cause chain (instanceof is
 *  fragile across module copies; the name IS the type's declared identity —
 *  every one of these classes sets this.name explicitly). */
const TRANSIENT_ERROR_NAMES = new Set([
  'CampaignBreachedError',
  'SpendBudgetClosedError',
]);

function causeChainErrors(error: unknown): Error[] {
  const out: Error[] = [];
  let cursor: unknown = error;
  for (let depth = 0; depth < 10 && cursor instanceof Error; depth += 1) {
    out.push(cursor);
    cursor = cursor.cause;
  }
  return out;
}

/** Transient = the input can succeed unchanged once the world recovers
 *  (quota, provider blips, network, DB connections, a governance hold).
 *  Anything else is deterministic and bounded by MAX_INGEST_ATTEMPTS.
 *  TYPED errors classify FIRST (by name, across the cause chain); the
 *  message regex is only the fallback for untyped vendor/driver strings —
 *  a typed error's classification must never hinge on its prose. */
export function isTransientFailure(error: unknown): boolean {
  if (
    causeChainErrors(error).some((cause) =>
      TRANSIENT_ERROR_NAMES.has(cause.name),
    )
  ) {
    return true;
  }
  const chain = buildCauseChain(error);
  // NARROWED (red team 2026-09-04 G-1): bare `\b50[0-4]\b`, `\b429\b` and
  // `network` matched ordinary deterministic ingest prose — "chunk 503
  // has no source_map entry", "Invalid source ref SRC-429", "network-
  // attached storage path missing" — and re-queued those jobs forever
  // with no attempt spent. A status number counts only in an HTTP-status
  // shape; `network` only as a failure phrase.
  return /(?:status|HTTP|code)[ :=]*(?:429|50[0-4])\b|\[(?:429|50[0-4])\]|\b(?:429|50[0-4]) (?:Too Many|Service Unavailable|Bad Gateway|Gateway Timeout|Internal Server)|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENETUNREACH|fetch failed|socket hang up|network (?:error|failure|request failed)|timed? ?out|Connection is closed|Can't reach database|P1001|P1002|P1008|P1017|too many connections/i.test(
    chain,
  );
}

/** Terminal Gemini states → our status. */
const TERMINAL: Partial<Record<string, 'succeeded' | 'failed'>> = {
  // Vendor job-state strings (formerly the SDK's JobState enum — inlined so
  // the transport needs no SDK import; the lockdown spec flags any file
  // referencing the vendor SDK outside the gateway).
  JOB_STATE_SUCCEEDED: 'succeeded',
  // PARTIALLY_SUCCEEDED is terminal too (round-6 F1: unmapped, such a job
  // polled forever — never ingested, never failed, never ledgered). Treated
  // as succeeded: the ingest path already stores per-item errors, so the
  // completed items land and the failed ones surface item-level.
  JOB_STATE_PARTIALLY_SUCCEEDED: 'succeeded',
  JOB_STATE_FAILED: 'failed',
  JOB_STATE_CANCELLED: 'failed',
  JOB_STATE_EXPIRED: 'failed',
};

/**
 * Gemini Batch API orchestration: submit inlined-request jobs at ~50% of
 * interactive pricing (Google processes them on spare capacity, ≤24h SLA —
 * fine for ALL collection work, none of which blocks a user), poll for
 * completion on a self-owned worker interval (NOT a cron — see pollTimer),
 * and hand completed items to the purpose-keyed ingestor
 * that resumes the owning pipeline. Job + item state is persisted
 * (llm_batch_jobs / llm_batch_job_items) so restarts lose nothing; ingestion
 * is idempotent (status guards).
 *
 * Gemini's inlined responses come back IN REQUEST ORDER, which is how items
 * are mapped back (itemIndex); itemKey additionally rides along for callers.
 */
/** §24.3: campaign id (if any) rides in resumeContext, stashed at submit()
 *  time (extraction-pipeline.service.ts). One extraction, both read sites
 *  (submit-time dispatchability gate + terminal-success metering). */
function campaignIdFromResumeContext(ctx: unknown): string | undefined {
  return ctx &&
    typeof ctx === 'object' &&
    'campaignId' in ctx &&
    typeof (ctx as Record<string, unknown>).campaignId === 'string'
    ? ((ctx as Record<string, unknown>).campaignId as string)
    : undefined;
}

@Injectable()
export class GeminiBatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: LoggerService;
  private readonly ingestors = new Map<string, BatchIngestor>();
  private readonly failureHandlers = new Map<string, BatchFailureHandler>();
  private pollInFlight = false;
  private pollDone: Promise<void> | null = null;
  private shuttingDown = false;

  /**
   * THE POLLER IS A PLAIN setInterval, NOT AN @Cron — and the difference is
   * a proven production incident (2026-08-31): 45 batch jobs submitted at
   * 03:18 UTC sat at 'submitted' for 13.7 HOURS on the staging worker with
   * nobody polling, even though the vendor had finished them within ~1h.
   * The old @Cron(EVERY_5_MINUTES) only fires when ScheduleModule is
   * registered, and app.module.ts registers it only under
   * isSchedulerRuntime() — false whenever CRONS_ENABLED is off. The same
   * silent hang had previously exceeded 24h.
   *
   * THE LAW: CRONS_ENABLED means "do not START new discretionary work
   * unattended". Collecting the results of work ALREADY DISPATCHED AND
   * PAID FOR is not discretionary — abandoning it wastes vendor spend
   * already incurred and strands every extraction run queued behind it.
   * So the batch rail's completion half must be alive whenever the
   * background runtime is alive, independent of the cron switch: the poll
   * starts itself in onModuleInit on the WORKER runtime (isWorkerRuntime,
   * deliberately NOT isSchedulerRuntime — and NOT the api runtime: ingest
   * is heavy and triggers downstream LLM work; the worker owns background
   * work), honours only this rail's own explicit off-switch
   * (LLM_BATCH_POLL_ENABLED=false), and unref()s so a script that boots
   * the full graph still exits. Same idiom as
   * vocabulary-maintenance.service.ts's refreshCache poll.
   */
  private pollTimer: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    if (isEnvFlagExplicitlyDisabled(process.env.LLM_BATCH_POLL_ENABLED)) {
      return;
    }
    if (!isWorkerRuntime()) return;
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    this.pollTimer.unref();
    // Boot-time stall sweep, deliberately OUTSIDE the poll loop: it can
    // scream even when the poll loop itself is dead (crashed, wedged, or a
    // deploy that broke it) — a worker restart is enough to surface a
    // stranded backlog. What no in-process arm can catch: the whole worker
    // being down; that residual belongs to external uptime monitoring.
    void this.checkForStalledJobs();
  }

  /** Ideal shutdown ordering by OWNERSHIP: this service owns its in-flight
   *  poll/ingest cycle, so shutdown (a) stops NEW cycles and (b) awaits the
   *  running one — an ingest's DB writes always complete before Nest tears
   *  down Prisma/Redis. No mid-write "Connection is closed" is possible; the
   *  parked-job retry design remains the backstop for hard kills (SIGKILL). */
  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.pollDone) {
      await this.pollDone;
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly usageLedger: UsageLedgerService,
    private readonly governance: GovernanceService,
    private readonly spendCampaigns: SpendCampaignService,
    private readonly opsAlerts: OpsAlertsService,
    // The TRANSPORT no longer owns a vendor client: the gateway exposes the
    // three batch operations as typed ops, so the raw SDK has exactly one
    // owner and this service cannot drift into a second assembler.
    private readonly llmService: LLMService,
  ) {
    this.logger = loggerService.setContext('GeminiBatchService');
    // BREACH FINISHES WHAT IT STARTED (rederivation 2026-08-31): the breach
    // flip in SpendCampaignService reaps the campaign's open batch jobs
    // through this callback — same registration shape as registerIngestor,
    // because the batch rail sits above the shared module and cannot be
    // injected into it.
    this.spendCampaigns.registerBreachReaper((campaignId) =>
      this.cancelCampaignJobs(campaignId),
    );
  }

  /**
   * Cancel every LIVE batch job belonging to a campaign: vendor-cancel +
   * meter partial output (reapRemote inside cancel()), fail the job, and
   * terminalize its owning run through the registered failure handler.
   * Called by the breach reaper; safe to call twice (cancel() is guarded
   * and no-ops on terminal jobs).
   */
  async cancelCampaignJobs(campaignId: string): Promise<void> {
    const jobs = await this.prisma.$queryRaw<Array<{ job_id: string }>>`
      SELECT job_id FROM llm_batch_jobs
      WHERE resume_context->>'campaignId' = ${campaignId}
        AND status IN ('persisting', 'pending', 'submitting', 'submitted')
    `;
    // Deliberately NOT 'succeeded'/'ingesting': those jobs are already PAID
    // and vendor-terminal — cancelling them would erase completed output.
    // The ingest-side dispatch hold (see ingest()) parks them instead, so
    // they resume for free after resumeAfterBreach.
    if (!jobs.length) return;
    this.logger.warn('Breach reap: cancelling campaign batch jobs', {
      campaignId,
      jobCount: jobs.length,
    });
    for (const job of jobs) {
      try {
        await this.cancel(job.job_id);
      } catch (error) {
        this.logger.error('Breach reap: cancel failed for job (continuing)', {
          campaignId,
          jobId: job.job_id,
          error: { message: buildCauseChain(error) },
        });
      }
    }
  }

  private get batchOps() {
    return this.llmService.batchTransportOps();
  }

  /** Pipelines register how their purpose's completed items get ingested. */
  registerIngestor(purpose: string, ingestor: BatchIngestor): void {
    this.ingestors.set(purpose, ingestor);
  }

  /** Pipelines register how a terminal job failure propagates to the owning
   *  run (e.g. fail the extraction run stashed in resumeContext). Lives here
   *  as a callback because the run lifecycle is owned a layer above this
   *  module — injecting it would be circular. */
  registerFailureHandler(purpose: string, handler: BatchFailureHandler): void {
    this.failureHandlers.set(purpose, handler);
  }

  async submit(params: {
    purpose: string;
    model: string;
    items: BatchSubmitItem[];
    resumeContext?: unknown;
    displayName?: string;
  }): Promise<string> {
    if (!params.items.length) {
      throw new Error('GeminiBatchService.submit: no items');
    }
    // JUDGE-CONTRACT WARN MODE, batch rail (plans/llm-lane-primitive.md):
    // the batch purpose is a spend identity exactly like a sync caller tag —
    // the ledger records it as `gemini-batch.<purpose>` — so it runs the
    // SAME warn-mode registry check callLLMApi runs on usageCaller.
    // Contracts declare their purposes via spend.batchPurposes.
    this.llmService.warnIfUncontractedCaller(`gemini-batch.${params.purpose}`);
    // §24.1 Tier 3 CATASTROPHE BACKSTOP (mirrors llm.service.callLLMApi's
    // assertSpendBudgetOpen; demoted from work governor, §24.4 item 2): a
    // spent or vendor-poisoned gemini.monthlySpend pool refuses NEW batch
    // submissions locally — queued work refills and drains when the
    // backstop reopens. Expected to never fire in healthy operation: Tier 1
    // campaigns stop via their envelope, Tier 2 lanes via cost baselines;
    // this pool's limit is a fixed GEMINI_MONTHLY_SPEND_CAP_USD ($1,500
    // default ≈ 10x measured steady state — D149, 2026-08-07). Batch is
    // background work, so a refusal here reaches a queue, never a person.
    // ONE GATE (2026-07-28). This used to hand-compare a poolStatus()
    // snapshot, which never re-reads the durable window — so a month's spend
    // could be a boot-time number on the path that is both the default
    // extraction mode and 46.9% of measured spend. (The other half of that
    // old complaint, "and it admits on an unconfirmed store", is no longer a
    // defect: D149 made admit-and-scream the law everywhere but grant pools.
    // The refusal to re-read was always the real bug.)
    await this.governance.assertGeminiSpendOpen();
    // §24 red team finding 1 ("a breach must stop work"): when this batch
    // belongs to a Tier 1 campaign (resumeContext.campaignId), refuse BEFORE
    // any vendor call unless the campaign is still dispatchable
    // ('approved'/'running'). Without this, a breached campaign's envelope
    // stops METERING further spend (recordSpend refuses) but nothing had
    // ever stopped NEW batches from being submitted in the first place —
    // the vendor call already happened by the time the campaign found out.
    // Same pattern as the Tier-3 gate above: typed refusal, work stays
    // queued (the caller's enqueue layer retries once the campaign resumes).
    // ONE ENFORCEMENT for every caller (2026-08-12): the gate used to fire
    // only when the caller had remembered to stash campaignId on
    // resumeContext — a caller that forgot (or ran inside an ambient
    // campaign without a durable stash) submitted ungated. The campaign is
    // now resolved from the explicit stash FIRST, then from the ambient
    // WorkContext, and the refusal itself is the shared typed
    // assertDispatchable — one message, one distinction (breached =
    // requeue-and-wait vs terminal), not a per-site paraphrase.
    const campaignId =
      campaignIdFromResumeContext(params.resumeContext) ?? currentCampaignId();
    if (campaignId) {
      await this.spendCampaigns.assertDispatchable(campaignId);
    }
    // State machine (each state has exactly ONE owner that moves it — audit §3):
    //   persisting -> pending -> submitting -> submitted -> succeeded
    //     -> ingesting -> ingested | failed
    // Claimed states (persisting/submitting/ingesting) carry a LEASE; an
    // expired lease means the worker died and the poller reclaims.
    const job = await this.prisma.llmBatchJob.create({
      data: {
        purpose: params.purpose,
        model: params.model,
        status: 'persisting',
        leaseExpiresAt: leaseFromNow(),
        requestCount: params.items.length,
        // THE RESOLVED CAMPAIGN RIDES THE ROW (red team 2026-09-03
        // governance #4): the dispatch gate above resolves explicit-or-
        // ambient, but every downstream reader — pollOne's metering, the
        // breach reaper, the ingest hold, the runner's completion query —
        // reads resume_context->>'campaignId' only. An ambient-campaign
        // submit that did not persist the id was gated at dispatch yet
        // unmetered, unreapable, and invisible to completion. One truth:
        // whatever id the gate used is the id the row carries.
        resumeContext:
          campaignId !== null && campaignId !== undefined
            ? ({
                ...((params.resumeContext as object | undefined) ?? {}),
                campaignId,
              } as Prisma.InputJsonValue)
            : params.resumeContext === undefined
              ? Prisma.JsonNull
              : (params.resumeContext as Prisma.InputJsonValue),
      },
      select: { jobId: true },
    });
    // Persist items BEFORE the provider submit so a crash between the two
    // leaves a resumable job rather than an orphaned provider job. 'pending'
    // is only entered once every item row exists — a resumer can never see a
    // half-persisted job.
    const CHUNK = 200;
    for (let i = 0; i < params.items.length; i += CHUNK) {
      // GUARDED (C3): the heartbeat only extends a lease THIS submitter still
      // holds. A zombie whose claim was reclaimed must not re-extend the
      // lease and keep appending items to a job another worker now owns —
      // abort loudly instead; the reclaim sweeper owns the job's fate.
      const heartbeat = await this.prisma.llmBatchJob.updateMany({
        where: { jobId: job.jobId, status: 'persisting' },
        data: { leaseExpiresAt: leaseFromNow() },
      });
      if (heartbeat.count === 0) {
        throw new Error(
          `batch persist aborted: persisting claim on ${job.jobId} was reclaimed mid-write`,
        );
      }
      await this.prisma.llmBatchJobItem.createMany({
        data: params.items.slice(i, i + CHUNK).map((item, j) => ({
          jobId: job.jobId,
          itemIndex: i + j,
          itemKey: item.key,
          request: {
            contents: item.contents,
            config: item.config,
          } as Prisma.InputJsonValue,
        })),
      });
    }
    // GUARDED (C3): the pending handoff is only valid while THIS submitter
    // holds the 'persisting' claim — a stale submitter whose lease expired
    // (job reclaimed) must not yank a job another worker already moved past
    // pending back into the queue.
    const staged = await this.prisma.llmBatchJob.updateMany({
      where: { jobId: job.jobId, status: 'persisting' },
      data: { status: 'pending', leaseExpiresAt: null },
    });
    if (staged.count === 0) {
      this.logger.error(
        'Batch pending-handoff no-oped — persisting claim was gone (reclaimed); not re-queueing',
        { jobId: job.jobId, purpose: params.purpose },
      );
    }

    // Provider submission is DURABLE-DEFERRED: a failure here (429, network)
    // leaves the job 'pending' for the poller's resumer instead of throwing —
    // a throw would push callers toward re-enqueueing a job that already
    // exists (duplicate extraction). The caller owns nothing past this point.
    try {
      await this.resumeSubmit(job.jobId, params.purpose, params.model);
    } catch (error) {
      this.logger.warn(
        'Batch provider submit deferred to poller (job stays pending)',
        { jobId: job.jobId, error: { message: buildCauseChain(error) } },
      );
    }
    return job.jobId;
  }

  /** Complete the provider half of submit() for a job whose items are already
   *  persisted: rebuild the request from llm_batch_job_items and submit.
   *  Claims via lease so concurrent pollers can't double-submit and a dead
   *  submitter's claim self-releases on expiry. */
  private async resumeSubmit(
    jobId: string,
    purpose: string,
    model: string,
  ): Promise<void> {
    const claimed = await this.prisma.llmBatchJob.updateMany({
      where: {
        jobId,
        OR: [
          { status: 'pending' },
          { status: 'submitting', leaseExpiresAt: { lt: new Date() } },
        ],
      },
      data: { status: 'submitting', leaseExpiresAt: leaseFromNow() },
    });
    if (claimed.count === 0) return;
    try {
      const items = await this.prisma.llmBatchJobItem.findMany({
        where: { jobId },
        orderBy: { itemIndex: 'asc' },
        select: { itemIndex: true, itemKey: true, request: true },
      });
      // IDEMPOTENT SUBMISSION (step 3, Law 2): a crash between the
      // provider create and the DB write leaves a PAID provider job the
      // row doesn't know about; on reclaim we must adopt it, not buy a
      // twin. The deterministic displayName is the idempotency key.
      const displayName = `${purpose}-${jobId.slice(0, 8)}`;
      const adopted = await this.batchOps.findByDisplayName(displayName);
      if (adopted) {
        await this.prisma.llmBatchJob.updateMany({
          where: { jobId, status: 'submitting' },
          data: {
            providerJobName: adopted,
            status: 'submitted',
            submittedAt: new Date(),
            leaseExpiresAt: null,
          },
        });
        this.logger.warn('Gemini batch ADOPTED existing provider job', {
          jobId,
          providerJobName: adopted,
          purpose,
        });
        return;
      }
      const created = await this.batchOps.create({
        model,
        src: {
          inlinedRequests: items.map((item) => {
            const req = item.request as {
              contents: unknown;
              config: unknown;
            };
            return {
              contents: req.contents,
              config: req.config,
              metadata: { key: item.itemKey, index: String(item.itemIndex) },
            } as never;
          }),
        },
        config: { displayName },
      });
      await this.prisma.llmBatchJob.updateMany({
        where: { jobId, status: 'submitting' },
        data: {
          providerJobName: created.name ?? null,
          status: 'submitted',
          submittedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
      this.logger.info('Gemini batch submitted', {
        jobId,
        providerJobName: created.name,
        purpose,
        requestCount: items.length,
      });
    } catch (error) {
      // Back to 'pending' so the next poll cycle retries the provider call.
      await this.prisma.llmBatchJob.updateMany({
        where: { jobId, status: 'submitting' },
        data: {
          status: 'pending',
          leaseExpiresAt: null,
          error: buildCauseChain(error),
        },
      });
      throw error;
    }
  }

  /**
   * ONE step of the job's lifecycle, driven by an AWAITING caller instead of
   * the 5-minute poll loop (prompt-fleet audit 2026-08-11, cost fix 1:
   * pooled batch pricing for non-interactive sweeps). The poll loop only
   * runs on worker runtimes — a sweep awaiting its own pooled job must
   * be able to advance it from any process. Every transition this calls is
   * the SAME lease-guarded machinery the poll loop uses, so a concurrent
   * tick is harmless: whoever claims the lease wins, the other no-ops.
   * Returns the job's status after the step.
   */
  async driveOnce(jobId: string): Promise<string> {
    const job = await this.prisma.llmBatchJob.findUniqueOrThrow({
      where: { jobId },
      select: {
        status: true,
        providerJobName: true,
        purpose: true,
        model: true,
      },
    });
    try {
      if (job.status === 'pending' || job.status === 'submitting') {
        await this.resumeSubmit(jobId, job.purpose, job.model);
      } else if (job.status === 'submitted' && job.providerJobName) {
        await this.pollOne(jobId, job.providerJobName, job.purpose);
      } else if (job.status === 'succeeded' || job.status === 'ingesting') {
        await this.ingest(jobId, job.purpose);
      }
    } catch (error) {
      // The job is durable; a failed step is retried on the next drive tick
      // (or by the cron). Surface, don't throw — the awaiter's loop owns
      // timeout policy.
      this.logger.warn('driveOnce step failed (will retry)', {
        jobId,
        status: job.status,
        error: { message: buildCauseChain(error) },
      });
    }
    const refreshed = await this.prisma.llmBatchJob.findUniqueOrThrow({
      where: { jobId },
      select: { status: true },
    });
    return refreshed.status;
  }

  /**
   * THE ONE FAILED-JOB METER (red team 2026-08-19 D1/D2). Google bills
   * COMPLETED items inside a cancelled/expired/failed batch; any path that
   * terminalizes a job without running this leaves paid work with no ledger
   * row, no pool meter, no campaign debit. Idempotent by the same
   * one-row-per-job dedupe key as the success path, so cancel, the poller
   * and the stale sweep can all call it without double-billing.
   */
  private async meterFailedRemoteUsage(
    jobId: string,
    purpose: string,
    remote: ProviderBatchJob,
  ): Promise<void> {
    const failedResumeRow = await this.prisma.llmBatchJob.findUnique({
      where: { jobId },
      select: { resumeContext: true, model: true },
    });
    const failedCampaignId = campaignIdFromResumeContext(
      failedResumeRow?.resumeContext,
    );
    const failedInlined = remote.dest?.inlinedResponses ?? [];
    const failedUsage = { input: 0, output: 0, cached: 0, model: '' };
    for (const entry of failedInlined) {
      const meta = entry.response?.usageMetadata;
      failedUsage.input += meta?.promptTokenCount ?? 0;
      failedUsage.output +=
        (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
      failedUsage.cached += meta?.cachedContentTokenCount ?? 0;
      failedUsage.model ||= entry.response?.modelVersion ?? '';
    }
    if (failedInlined.length > 0) {
      // Price by the REQUESTED model (the job row's own id — the string
      // GEMINI_RATES is keyed by). The vendor's response-side modelVersion
      // can be a dated variant that misses the rate table and silently
      // prices at UNKNOWN_MODEL_RATES (per-field max, ~3x flash) — money-
      // spine audit 2026-08-26. modelVersion stays informational (logged
      // below when it diverges).
      const failedRequestedModel = failedResumeRow?.model || undefined;
      if (
        failedRequestedModel &&
        failedUsage.model &&
        failedUsage.model !== failedRequestedModel
      ) {
        this.logger.info('Batch vendor modelVersion differs from requested', {
          jobId,
          requested: failedRequestedModel,
          modelVersion: failedUsage.model,
        });
      }
      this.usageLedger.record({
        service: 'gemini',
        operation: 'batchGenerateContent',
        model: failedRequestedModel ?? (failedUsage.model || undefined),
        mode: 'batch',
        inputTokens: failedUsage.input,
        outputTokens: failedUsage.output,
        cachedTokens: failedUsage.cached,
        requestCount: failedInlined.length,
        caller: `gemini-batch.${purpose}`,
        runKey: jobId,
        dedupeKey: `gemini-batch:${jobId}`,
        // Round-6 F2: without this, partial spend on a failed batch was
        // invisible to campaign budget accounting while identical spend on
        // a succeeded batch counted.
        campaignId: failedCampaignId,
        outcome: 'failed',
      });
    }
  }

  /**
   * Reap a job's remote side: vendor-cancel (so a wedged-but-alive job
   * cannot keep billing) and meter whatever it already completed. Safe on
   * jobs with no provider name; every error degrades to a warn — reaping is
   * accounting, never a reason to fail the caller's own terminalization.
   */
  async reapRemote(jobId: string): Promise<void> {
    const job = await this.prisma.llmBatchJob.findUnique({
      where: { jobId },
      select: { providerJobName: true, purpose: true },
    });
    if (!job?.providerJobName) return;
    try {
      await this.batchOps.cancel(job.providerJobName);
    } catch {
      // Already terminal at the vendor — get() below still reads usage.
    }
    try {
      const remote = await this.batchOps.get(job.providerJobName);
      await this.meterFailedRemoteUsage(jobId, job.purpose, remote);
    } catch (error) {
      this.logger.warn('reapRemote could not meter remote usage', {
        jobId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async cancel(jobId: string): Promise<void> {
    // Meter-before-flip (D1): once status leaves 'submitted', pollOne's
    // failed path can never run for this job — reap now or never.
    await this.reapRemote(jobId);
    // GUARDED: cancel only overtakes LIVE states — a job that already
    // reached a terminal state ('succeeded'/'ingested'/'failed') keeps its
    // truth; stamping 'failed' over 'ingested' would erase a completed,
    // PAID ingest from the record.
    const cancelled = await this.prisma.llmBatchJob.updateMany({
      where: {
        jobId,
        status: {
          in: ['pending', 'submitting', 'submitted', 'ingesting', 'persisting'],
        },
      },
      data: { status: 'failed', error: 'cancelled', completedAt: new Date() },
    });
    if (cancelled.count === 0) {
      this.logger.warn(
        'Batch cancel no-oped — job already in a terminal state; record kept',
        { jobId },
      );
      return;
    }
    // ENDING GOES THROUGH ONE DOOR (red team 2026-08-22, the 79 stuck-run
    // incident): cancel flipped the JOB but never terminalized its RUN —
    // the owning extraction run sat 'running' forever, invisible to every
    // sweep (the stale reaper only reads job status) and poisoning
    // coverage math. Route through the same registered failure handler the
    // poller's provider-failed and the stale sweep use, so a cancelled
    // job's run fails exactly like every other terminal failure.
    const jobRow = await this.prisma.llmBatchJob.findUnique({
      where: { jobId },
      select: { purpose: true },
    });
    if (jobRow) {
      await this.notifyJobFailed(jobId, jobRow.purpose, 'cancelled').catch(
        (error: unknown) => {
          this.logger.warn('cancel: run terminalization failed', {
            jobId,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
        },
      );
    }
  }

  /** One poll cycle. Driven by the onModuleInit interval (worker runtime,
   *  see the pollTimer law above) — no @Cron: the schedule registry does
   *  not exist when CRONS_ENABLED is off, and this rail must not die with
   *  it (45 jobs, 13.7h, 2026-08-31). */
  async poll(): Promise<void> {
    if (isEnvFlagExplicitlyDisabled(process.env.LLM_BATCH_POLL_ENABLED)) return;
    if (this.shuttingDown) return;
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    let markDone: () => void = () => undefined;
    this.pollDone = new Promise<void>((resolve) => {
      markDone = resolve;
    });
    try {
      const now = new Date();
      // Stall alarm each cycle too (this arm catches a WEDGED PROVIDER job
      // while the poller is alive; the boot-time arm catches a dead loop).
      await this.checkForStalledJobs();
      // Abandoned 'persisting' claims: the submitter died mid-item-write, so
      // the item set is incomplete and CANNOT be resumed — fail loudly; the
      // enqueue layer's retry re-creates the job whole (audit §3: every state
      // has an owner).
      const abandonedPersisting = await this.prisma.llmBatchJob.updateMany({
        where: { status: 'persisting', leaseExpiresAt: { lt: now } },
        data: {
          status: 'failed',
          error:
            'persisting abandoned: submitter died mid-item-write (incomplete item set is not resumable; re-enqueue re-creates the job whole)',
          completedAt: now,
        },
      });
      if (abandonedPersisting.count > 0) {
        this.logger.error('Failed abandoned persisting batch jobs', {
          count: abandonedPersisting.count,
        });
      }

      // Resume-submit: 'pending' rows (items fully persisted, provider call
      // outstanding) and dead submitters ('submitting' with an expired lease).
      const resumable = await this.prisma.llmBatchJob.findMany({
        where: {
          OR: [
            { status: 'pending' },
            { status: 'submitting', leaseExpiresAt: { lt: now } },
          ],
        },
        select: { jobId: true, purpose: true, model: true },
        // Per-cycle bound only (submits are provider round-trips); leftovers
        // resume next poll cycle, so any small value works.
        take: 10,
      });
      for (const job of resumable) {
        try {
          await this.resumeSubmit(job.jobId, job.purpose, job.model);
        } catch (error) {
          this.logger.warn('Batch resume-submit failed for pending job', {
            jobId: job.jobId,
            error: { message: buildCauseChain(error) },
          });
        }
      }

      const open = await this.prisma.llmBatchJob.findMany({
        where: { status: 'submitted' },
        select: { jobId: true, providerJobName: true, purpose: true },
        // Sized for archive loads: a full city sliced at ~250 posts/job can
        // have ~100 jobs open at once; poll them all each cycle.
        take: 200,
      });
      for (const job of open) {
        if (!job.providerJobName) continue;
        try {
          await this.pollOne(job.jobId, job.providerJobName, job.purpose);
        } catch (error) {
          this.logger.warn('Batch poll failed for job', {
            jobId: job.jobId,
            error:
              error instanceof Error
                ? { message: error.message }
                : { message: String(error) },
          });
        }
      }
      // Retry ingestion: unclaimed results plus dead ingesters ('ingesting'
      // with an expired lease self-releases — no reconciler wait, no manual
      // resets; audit §2).
      const uningested = await this.prisma.llmBatchJob.findMany({
        where: {
          OR: [
            { status: 'succeeded' },
            { status: 'ingesting', leaseExpiresAt: { lt: new Date() } },
          ],
        },
        select: { jobId: true, purpose: true },
        // Ingestion is the heavy DB-write step; a small per-cycle bound keeps
        // one poll tick cheap. Leftovers ingest next cycle — throughput knob,
        // not correctness.
        take: 5,
      });
      for (const job of uningested) {
        await this.ingest(job.jobId, job.purpose).catch((error: unknown) => {
          this.logger.warn('Batch ingest retry failed', {
            jobId: job.jobId,
            error:
              error instanceof Error
                ? { message: error.message }
                : { message: String(error) },
          });
        });
      }
    } finally {
      this.pollInFlight = false;
      markDone();
    }
  }

  /**
   * THE STALL ALARM — the silent half of the 2026-08-31 incident. The
   * defect was never "the vendor is slow"; it was that 45 finished jobs
   * sat uncollected for 13.7h and NOTHING SAID SO. Any non-terminal job
   * whose updatedAt (moved by every real state transition) is older than
   * STALL_ALARM_AFTER_MS gets a CRITICAL deduped ops alert naming the two
   * real causes to check: (a) nothing is polling this runtime, (b) the
   * provider job is wedged. Runs from two arms:
   *   - each poll cycle: catches (b) — a wedged provider job under a live
   *     poller. It cannot catch (a) from here (a dead loop never runs it).
   *   - worker boot (onModuleInit): catches (a) after the fact — the next
   *     restart of a worker whose loop was dead screams about the backlog.
   * Honest residual: if the whole worker process is down, nothing
   * in-process can scream; that is external uptime monitoring's job.
   * Deduped per job per UTC day so a standing stall pages once a day, not
   * every 5 minutes. Never throws — alarming must not break the poll.
   */
  async checkForStalledJobs(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - STALL_ALARM_AFTER_MS);
      // STALL IS MEASURED FROM WHEN THE JOB BECAME OWED, never from its
      // last touch (red team 2026-09-04 G-1). `updatedAt` is bumped by
      // every transient re-queue, so a job cycling through a
      // misclassified deterministic failure every 5 minutes refreshed
      // itself out of this sweep forever. The owing clock is the phase
      // entry: completed_at once the provider finished (output waiting
      // for ingest), submitted_at while the provider works, created_at
      // before submission.
      const stalled = await this.prisma.llmBatchJob.findMany({
        where: {
          status: { in: [...NON_TERMINAL_STATUSES] },
          OR: [
            { completedAt: { lt: cutoff } },
            { completedAt: null, submittedAt: { lt: cutoff } },
            { completedAt: null, submittedAt: null, createdAt: { lt: cutoff } },
          ],
        },
        select: {
          jobId: true,
          status: true,
          updatedAt: true,
          completedAt: true,
          submittedAt: true,
          createdAt: true,
          purpose: true,
        },
        take: 200,
      });
      const utcDay = new Date().toISOString().slice(0, 10);
      for (const job of stalled) {
        const owedSince = job.completedAt ?? job.submittedAt ?? job.createdAt;
        const ageHours = (Date.now() - owedSince.getTime()) / (60 * 60 * 1000);
        this.logger.error('Gemini batch job STALLED — paid work uncollected', {
          jobId: job.jobId,
          status: job.status,
          purpose: job.purpose,
          ageHours: Number(ageHours.toFixed(1)),
        });
        this.opsAlerts.emit({
          severity: 'critical',
          kind: 'llm-batch-stall',
          title: `Gemini batch job stalled at '${job.status}' for ${ageHours.toFixed(1)}h`,
          body:
            `Job ${job.jobId} (purpose ${job.purpose}) has sat in ` +
            `non-terminal status '${job.status}', owed since ${owedSince.toISOString()} ` +
            `(last touched ${job.updatedAt.toISOString()}) ` +
            `(${ageHours.toFixed(1)}h; threshold ${STALL_ALARM_AFTER_MS / 3_600_000}h). ` +
            `This is PAID vendor work not being collected. Check: ` +
            `(a) nothing is polling this runtime (poller dead / wrong PROCESS_ROLE / ` +
            `LLM_BATCH_POLL_ENABLED=false), or (b) the provider job is wedged at Gemini.`,
          dedupeKey: `llm-batch-stall:${job.jobId}:${utcDay}`,
        });
      }
    } catch (error) {
      this.logger.warn('Batch stall check failed (non-fatal)', {
        error: { message: buildCauseChain(error) },
      });
    }
  }

  private async pollOne(
    jobId: string,
    providerJobName: string,
    purpose: string,
  ): Promise<void> {
    const remote = await this.batchOps.get(providerJobName);
    const state =
      typeof remote.state === 'string' && remote.state.length > 0
        ? remote.state
        : 'unknown';
    const terminal = TERMINAL[state];
    if (!terminal) return; // still queued/pending/running

    if (terminal === 'failed') {
      await this.meterFailedRemoteUsage(jobId, purpose, remote);
      // GUARDED (C3): a late poller must not stamp 'failed' over a state
      // another worker already decided — the exact cancel-over-terminal
      // shape (b0db25258): 'failed' over 'succeeded'/'ingested' erases the
      // record of completed PAID work.
      const failedWrite = await this.prisma.llmBatchJob.updateMany({
        where: { jobId, status: 'submitted' },
        data: {
          status: 'failed',
          error: remote.error ? JSON.stringify(remote.error) : state,
          completedAt: new Date(),
        },
      });
      if (failedWrite.count === 0) {
        this.logger.error(
          'Batch failed-write no-oped — job state was decided elsewhere; record kept',
          { jobId, state },
        );
      }
      this.logger.error('Gemini batch failed', { jobId, state });
      await this.notifyJobFailed(
        jobId,
        purpose,
        remote.error
          ? JSON.stringify(remote.error)
          : `provider batch state ${state}`,
      );
      return;
    }

    // SUCCEEDED: store responses by request order.
    const inlined = remote.dest?.inlinedResponses ?? [];
    const usage = { input: 0, output: 0, cached: 0, model: '' };
    for (const entry of inlined) {
      const meta = entry.response?.usageMetadata;
      usage.input += meta?.promptTokenCount ?? 0;
      // Thinking tokens BILL as output (cost-recon audit 2026-07-10).
      usage.output +=
        (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
      usage.cached += meta?.cachedContentTokenCount ?? 0;
      usage.model ||= entry.response?.modelVersion ?? '';
    }
    for (let index = 0; index < inlined.length; index += 1) {
      const entry = inlined[index];
      await this.prisma.llmBatchJobItem.updateMany({
        where: { jobId, itemIndex: index },
        data: {
          response:
            entry.response === undefined || entry.response === null
              ? Prisma.JsonNull
              : (entry.response as unknown as Prisma.InputJsonValue),
          error: entry.error ? JSON.stringify(entry.error) : null,
        },
      });
    }
    // §24.3 Leg C read side: campaign id (if any) rides in resumeContext,
    // stashed at submit() time (extraction-pipeline.service.ts). One extra
    // small select, only on the terminal-success path (not every poll tick).
    const resumeContextRow = await this.prisma.llmBatchJob.findUnique({
      where: { jobId },
      select: { resumeContext: true, model: true },
    });
    const campaignId = campaignIdFromResumeContext(
      resumeContextRow?.resumeContext,
    );
    // Price by the REQUESTED model (the id GEMINI_RATES is keyed by), not
    // the vendor's response-side modelVersion — a dated variant string would
    // miss the rate table and silently price at UNKNOWN_MODEL_RATES (~3x
    // flash). modelVersion stays informational, logged when it diverges.
    const requestedModel = resumeContextRow?.model || undefined;
    if (requestedModel && usage.model && usage.model !== requestedModel) {
      this.logger.info('Batch vendor modelVersion differs from requested', {
        jobId,
        requested: requestedModel,
        modelVersion: usage.model,
      });
    }

    // Idempotent by dedupeKey (one row per job): a crash/retry re-record is
    // skipped at the unique index, so ordering vs the status flip no longer
    // chooses between under- and double-counting.
    this.usageLedger.record({
      service: 'gemini',
      operation: 'batchGenerateContent',
      model: requestedModel ?? (usage.model || undefined),
      mode: 'batch',
      inputTokens: usage.input,
      outputTokens: usage.output,
      cachedTokens: usage.cached,
      requestCount: inlined.length,
      caller: `gemini-batch.${purpose}`,
      runKey: jobId,
      dedupeKey: `gemini-batch:${jobId}`,
      campaignId,
      outcome: 'ok',
    });
    // GUARDED transition (step 3, Law 2): only submitted→succeeded. A bare
    // update here could knock a concurrently-claimed 'ingesting' job back
    // to 'succeeded' and let a second poller ingest it again.
    await this.prisma.llmBatchJob.updateMany({
      where: { jobId, status: 'submitted' },
      data: { status: 'succeeded', completedAt: new Date() },
    });
    this.logger.info('Gemini batch succeeded', {
      jobId,
      responses: inlined.length,
    });
    await this.ingest(jobId, purpose);
  }

  private async ingest(jobId: string, purpose: string): Promise<void> {
    // POOLED purposes ('pooled.<caller>') have no ingestor by design: their
    // results are read from llm_batch_job_items by the awaiting
    // PooledBatchRunner, and the job's only remaining lifecycle need is the
    // succeeded->ingested flip so the awaiter (and the stale-job sweep) can
    // tell "results ready" from "still owed work".
    const ingestor =
      this.ingestors.get(purpose) ??
      (purpose.startsWith('pooled.')
        ? (): Promise<void> => Promise.resolve()
        : undefined);
    if (!ingestor) {
      this.logger.warn('No ingestor registered for batch purpose', {
        jobId,
        purpose,
      });
      return;
    }
    // DISPATCHABILITY BEFORE CLAIM (rederivation 2026-08-31): ingestion is
    // itself a spend dispatch — the ingest tree runs interactive calls under
    // the job's ambient campaign. A BREACHED campaign used to find that out
    // only when a downstream callLLMApi threw mid-ingest, burning a claimed
    // attempt against paid vendor output that had done nothing wrong. Check
    // BEFORE claiming: a breached campaign's job is simply held — status
    // stays 'succeeded', zero attempts spent, and it resumes on the first
    // poll after resumeAfterBreach.
    const preClaim = await this.prisma.llmBatchJob.findUnique({
      where: { jobId },
      select: { resumeContext: true },
    });
    const holdCampaignId = campaignIdFromResumeContext(preClaim?.resumeContext);
    if (
      holdCampaignId &&
      (await this.spendCampaigns.isBreached(holdCampaignId))
    ) {
      this.logger.warn(
        'Batch ingest held — campaign is breached (job kept, no attempt spent)',
        { jobId, purpose, campaignId: holdCampaignId },
      );
      return;
    }
    // Idempotency guard: claim via LEASE. Attempts are NOT consumed at claim
    // time — only a DETERMINISTIC failure spends one (audit §4: the spend-cap
    // outage burned 8 jobs to terminal failure over a transient 429).
    const claimed = await this.prisma.llmBatchJob.updateMany({
      where: {
        jobId,
        OR: [
          { status: 'succeeded' },
          { status: 'ingesting', leaseExpiresAt: { lt: new Date() } },
        ],
      },
      data: { status: 'ingesting', leaseExpiresAt: leaseFromNow() },
    });
    if (claimed.count === 0) return;
    // Heartbeat: extend the lease while the (long) ingest runs so a LIVE
    // worker is never reclaimed; a dead one stops heartbeating and its claim
    // self-releases within LEASE_MS.
    const heartbeat = setInterval(() => {
      this.prisma.llmBatchJob
        .updateMany({
          where: { jobId, status: 'ingesting' },
          data: { leaseExpiresAt: leaseFromNow() },
        })
        .catch(() => undefined);
    }, HEARTBEAT_MS);

    try {
      const job = await this.prisma.llmBatchJob.findUniqueOrThrow({
        where: { jobId },
        select: { resumeContext: true },
      });
      const items = await this.prisma.llmBatchJobItem.findMany({
        where: { jobId },
        orderBy: { itemIndex: 'asc' },
        select: { itemIndex: true, itemKey: true, response: true, error: true },
      });
      // AMBIENT CAMPAIGN (final red team D4): everything downstream of this
      // call — entity resolution, name embeddings, attribute placement,
      // cuisine extraction — is interactive spend the campaign PAID FOR in
      // its manifest but never metered, because only the batch line carried
      // a campaignId (~7% of the priced total). Establishing the context
      // here attributes the whole ingest tree without any call site
      // knowing campaigns exist.
      await runInWorkContext(
        {
          campaignId: campaignIdFromResumeContext(job.resumeContext),
          label: `batch-ingest:${purpose}`,
        },
        async () =>
          ingestor({
            jobId,
            purpose,
            resumeContext: job.resumeContext,
            items: items.map((item) => ({
              itemIndex: item.itemIndex,
              itemKey: item.itemKey,
              response: item.response ?? null,
              error: item.error,
            })),
          }),
      );
      // GUARDED terminal write: a zero-count result means the stale sweep
      // (or another poller) reclaimed this job mid-ingest — say so loudly
      // instead of silently resurrecting a row someone else owns.
      const finished = await this.prisma.llmBatchJob.updateMany({
        where: { jobId, status: 'ingesting' },
        data: {
          status: 'ingested',
          ingestedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
      if (finished.count === 0) {
        this.logger.error(
          'Gemini batch ingest finished but the claim was gone — job was reclaimed mid-ingest; writes are committed but job state was decided elsewhere',
          { jobId, purpose },
        );
      } else {
        this.logger.info('Gemini batch ingested', { jobId, purpose });
      }
    } catch (error) {
      const causeChain = buildCauseChain(error);
      if (isTransientFailure(error)) {
        // Transient: the world will recover; the job is durable and waiting
        // is free. Release the claim, spend NO attempt, retry next cycle.
        await this.prisma.llmBatchJob.updateMany({
          where: { jobId, status: 'ingesting' },
          data: {
            status: 'succeeded',
            leaseExpiresAt: null,
            error: `transient (will retry, no attempt spent): ${causeChain}`,
          },
        });
        this.logger.warn('Batch ingest hit transient failure — will retry', {
          jobId,
          purpose,
          error: { message: causeChain },
        });
        throw error;
      }
      // Deterministic: the input cannot change, so retries are bounded by
      // MAX_INGEST_ATTEMPTS purely as the misclassification guard.
      // Guarded: only the claim-holder spends an attempt; a reclaimed job's
      // late failure must not double-charge the bound.
      const attemptSpent = await this.prisma.llmBatchJob.updateMany({
        where: { jobId, status: 'ingesting' },
        data: { ingestAttempts: { increment: 1 } },
      });
      const updated = await this.prisma.llmBatchJob.findUniqueOrThrow({
        where: { jobId },
        select: { ingestAttempts: true },
      });
      if (
        attemptSpent.count > 0 &&
        updated.ingestAttempts >= MAX_INGEST_ATTEMPTS
      ) {
        // Terminal: fail the job AND its owning run instead of letting the
        // poll cron retry forever.
        await this.prisma.llmBatchJob.updateMany({
          where: { jobId, status: 'ingesting' },
          data: {
            status: 'failed',
            error: causeChain,
            completedAt: new Date(),
            leaseExpiresAt: null,
          },
        });
        this.logger.error('Batch ingest failed terminally', {
          jobId,
          purpose,
          attempts: updated.ingestAttempts,
          error: { message: causeChain },
        });
        await this.notifyJobFailed(
          jobId,
          purpose,
          `batch ingest failed after ${updated.ingestAttempts} attempts: ${causeChain}`,
        );
      } else {
        // Back to 'succeeded' so the cron retries ingestion (bounded above).
        // GUARDED like every sibling write: only the 'ingesting' claim-holder
        // may requeue — a reclaimed job's late failure must not resurrect a
        // row whose state was decided elsewhere (same unguarded-status-write
        // class the async-integrity doc exists to kill).
        const requeued = await this.prisma.llmBatchJob.updateMany({
          where: { jobId, status: 'ingesting' },
          data: {
            status: 'succeeded',
            error: causeChain,
            leaseExpiresAt: null,
          },
        });
        if (requeued.count === 0) {
          this.logger.error(
            'Batch ingest retry write no-oped — claim was gone (reclaimed mid-ingest); not resurrecting',
            { jobId, purpose },
          );
        }
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** Terminal job failure → the purpose's registered failure handler (which
   *  fails the owning extraction run stashed in resumeContext). Public: the
   *  ONE mechanism for job-level run-failure — the poller's provider-failed
   *  and ingest-exhausted paths and the hourly stale-job sweep all route
   *  through here, so a richer future handler can't silently diverge. */
  async notifyJobFailed(
    jobId: string,
    purpose: string,
    error: string,
  ): Promise<void> {
    const handler = this.failureHandlers.get(purpose);
    if (!handler) {
      this.logger.warn('No failure handler registered for batch purpose', {
        jobId,
        purpose,
      });
      return;
    }
    const job = await this.prisma.llmBatchJob.findUniqueOrThrow({
      where: { jobId },
      select: { resumeContext: true },
    });
    await handler({ jobId, purpose, resumeContext: job.resumeContext, error });
  }
}
