import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { Cron, CronExpression } from '@nestjs/schedule';
import { LLMService } from './llm.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService, buildCauseChain } from '../../../shared';
import { UsageLedgerService } from '../shared/usage-ledger.service';
import { GovernanceService } from '../governance/governance.service';
import { SpendCampaignService } from '../shared/spend-campaign.service';

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

/** Transient = the input can succeed unchanged once the world recovers
 *  (quota, provider blips, network, DB connections). Anything else is
 *  deterministic and bounded by MAX_INGEST_ATTEMPTS. Classification walks the
 *  whole cause chain. */
export function isTransientFailure(error: unknown): boolean {
  const chain = buildCauseChain(error);
  return /\b429\b|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|\b50[0-4]\b|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|fetch failed|socket hang up|network|timed? ?out|Connection is closed|Can't reach database|P1001|P1002|P1008|P1017|too many connections/i.test(
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
 * completion on a cron, and hand completed items to the purpose-keyed ingestor
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
export class GeminiBatchService implements OnModuleDestroy {
  private readonly logger: LoggerService;
  private readonly ingestors = new Map<string, BatchIngestor>();
  private readonly failureHandlers = new Map<string, BatchFailureHandler>();
  private pollInFlight = false;
  private pollDone: Promise<void> | null = null;
  private shuttingDown = false;

  /** Ideal shutdown ordering by OWNERSHIP: this service owns its in-flight
   *  poll/ingest cycle, so shutdown (a) stops NEW cycles and (b) awaits the
   *  running one — an ingest's DB writes always complete before Nest tears
   *  down Prisma/Redis. No mid-write "Connection is closed" is possible; the
   *  parked-job retry design remains the backstop for hard kills (SIGKILL). */
  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
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
    // The TRANSPORT no longer owns a vendor client: the gateway exposes the
    // three batch operations as typed ops, so the raw SDK has exactly one
    // owner and this service cannot drift into a second assembler.
    private readonly llmService: LLMService,
  ) {
    this.logger = loggerService.setContext('GeminiBatchService');
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
    // §24.1 Tier 3 CATASTROPHE BACKSTOP (mirrors llm.service.callLLMApi's
    // assertSpendBudgetOpen; demoted from work governor, §24.4 item 2): a
    // spent or vendor-poisoned gemini.monthlySpend pool refuses NEW batch
    // submissions locally — queued work refills and drains when the
    // backstop reopens. Expected to never fire in healthy operation: Tier 1
    // campaigns stop via their envelope, Tier 2 lanes via cost baselines;
    // this pool's limit is BACKSTOP_MULTIPLE × trailing measured monthly
    // spend, re-derived nightly (governance.service.ts).
    // ONE GATE (2026-07-28). This used to hand-compare a poolStatus()
    // snapshot, which never re-reads the durable window and treats an
    // unconfirmed store as zero spent — i.e. fail-OPEN on the path that is
    // both the default extraction mode and 46.9% of measured spend.
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
    const campaignId = campaignIdFromResumeContext(params.resumeContext);
    if (campaignId) {
      const dispatchable = await this.spendCampaigns.isDispatchable(campaignId);
      if (!dispatchable) {
        throw new Error(
          `campaign breached — batch submission refused; work stays queued (campaignId ${campaignId})`,
        );
      }
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
        resumeContext:
          params.resumeContext === undefined
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
      await this.prisma.llmBatchJob.update({
        where: { jobId: job.jobId },
        data: { leaseExpiresAt: leaseFromNow() },
      });
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
    await this.prisma.llmBatchJob.update({
      where: { jobId: job.jobId },
      data: { status: 'pending', leaseExpiresAt: null },
    });

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

  async cancel(jobId: string): Promise<void> {
    const job = await this.prisma.llmBatchJob.findUnique({
      where: { jobId },
      select: { providerJobName: true },
    });
    if (job?.providerJobName) {
      await this.batchOps.cancel(job.providerJobName);
    }
    await this.prisma.llmBatchJob.update({
      where: { jobId },
      data: { status: 'failed', error: 'cancelled', completedAt: new Date() },
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async poll(): Promise<void> {
    if (process.env.LLM_BATCH_POLL_ENABLED === 'false') return;
    if (this.shuttingDown) return;
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    let markDone: () => void = () => undefined;
    this.pollDone = new Promise<void>((resolve) => {
      markDone = resolve;
    });
    try {
      const now = new Date();
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
      // Google bills COMPLETED items inside a cancelled/expired/failed batch.
      // Before this, a provider-failed job ledgered nothing — paid work with
      // no meter. Sum whatever usage the remote carries; idempotent by the
      // same one-row-per-job dedupe key as the success path.
      const failedResumeRow = await this.prisma.llmBatchJob.findUnique({
        where: { jobId },
        select: { resumeContext: true },
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
        this.usageLedger.record({
          service: 'gemini',
          operation: 'batchGenerateContent',
          model: failedUsage.model || undefined,
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
      await this.prisma.llmBatchJob.update({
        where: { jobId },
        data: {
          status: 'failed',
          error: remote.error ? JSON.stringify(remote.error) : state,
          completedAt: new Date(),
        },
      });
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
      select: { resumeContext: true },
    });
    const campaignId = campaignIdFromResumeContext(
      resumeContextRow?.resumeContext,
    );

    // Idempotent by dedupeKey (one row per job): a crash/retry re-record is
    // skipped at the unique index, so ordering vs the status flip no longer
    // chooses between under- and double-counting.
    this.usageLedger.record({
      service: 'gemini',
      operation: 'batchGenerateContent',
      model: usage.model || undefined,
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
    const ingestor = this.ingestors.get(purpose);
    if (!ingestor) {
      this.logger.warn('No ingestor registered for batch purpose', {
        jobId,
        purpose,
      });
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
      await ingestor({
        jobId,
        purpose,
        resumeContext: job.resumeContext,
        items: items.map((item) => ({
          itemIndex: item.itemIndex,
          itemKey: item.itemKey,
          response: item.response ?? null,
          error: item.error,
        })),
      });
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
        await this.prisma.llmBatchJob.update({
          where: { jobId },
          data: {
            status: 'succeeded',
            error: causeChain,
            leaseExpiresAt: null,
          },
        });
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
