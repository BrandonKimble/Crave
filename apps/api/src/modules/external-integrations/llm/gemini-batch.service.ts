import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoogleGenAI, JobState } from '@google/genai';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { UsageLedgerService } from '../shared/usage-ledger.service';

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

/** Terminal Gemini states → our status. */
const TERMINAL: Partial<Record<string, 'succeeded' | 'failed'>> = {
  [JobState.JOB_STATE_SUCCEEDED]: 'succeeded',
  [JobState.JOB_STATE_FAILED]: 'failed',
  [JobState.JOB_STATE_CANCELLED]: 'failed',
  [JobState.JOB_STATE_EXPIRED]: 'failed',
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
@Injectable()
export class GeminiBatchService {
  private readonly logger: LoggerService;
  private readonly genAI: GoogleGenAI;
  private readonly ingestors = new Map<string, BatchIngestor>();
  private pollInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    loggerService: LoggerService,
    private readonly usageLedger: UsageLedgerService,
  ) {
    this.logger = loggerService.setContext('GeminiBatchService');
    this.genAI = new GoogleGenAI({
      apiKey: configService.get<string>('llm.apiKey') || '',
    });
  }

  /** Pipelines register how their purpose's completed items get ingested. */
  registerIngestor(purpose: string, ingestor: BatchIngestor): void {
    this.ingestors.set(purpose, ingestor);
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
    const job = await this.prisma.llmBatchJob.create({
      data: {
        purpose: params.purpose,
        model: params.model,
        status: 'pending',
        requestCount: params.items.length,
        resumeContext:
          params.resumeContext === undefined
            ? Prisma.JsonNull
            : (params.resumeContext as Prisma.InputJsonValue),
      },
      select: { jobId: true },
    });
    // Persist items BEFORE provider submit so a crash between the two leaves a
    // resumable 'pending' job rather than an orphaned provider job.
    const CHUNK = 200;
    for (let i = 0; i < params.items.length; i += CHUNK) {
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

    const created = await this.genAI.batches.create({
      model: params.model,
      src: {
        inlinedRequests: params.items.map((item, index) => ({
          contents: item.contents,
          config: item.config,
          metadata: { key: item.key, index: String(index) },
        })),
      },
      config: {
        displayName:
          params.displayName ?? `${params.purpose}-${job.jobId.slice(0, 8)}`,
      },
    });

    await this.prisma.llmBatchJob.update({
      where: { jobId: job.jobId },
      data: {
        providerJobName: created.name ?? null,
        status: 'submitted',
        submittedAt: new Date(),
      },
    });
    this.logger.info('Gemini batch submitted', {
      jobId: job.jobId,
      providerJobName: created.name,
      purpose: params.purpose,
      requestCount: params.items.length,
    });
    return job.jobId;
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.prisma.llmBatchJob.findUnique({
      where: { jobId },
      select: { providerJobName: true },
    });
    if (job?.providerJobName) {
      await this.genAI.batches.cancel({ name: job.providerJobName });
    }
    await this.prisma.llmBatchJob.update({
      where: { jobId },
      data: { status: 'failed', error: 'cancelled', completedAt: new Date() },
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async poll(): Promise<void> {
    if (process.env.LLM_BATCH_POLL_ENABLED === 'false') return;
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const open = await this.prisma.llmBatchJob.findMany({
        where: { status: 'submitted' },
        select: { jobId: true, providerJobName: true, purpose: true },
        take: 20,
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
      // Retry ingestion for completed-but-unins gested jobs (ingestor crash).
      const uningested = await this.prisma.llmBatchJob.findMany({
        where: { status: 'succeeded' },
        select: { jobId: true, purpose: true },
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
    }
  }

  private async pollOne(
    jobId: string,
    providerJobName: string,
    purpose: string,
  ): Promise<void> {
    const remote = await this.genAI.batches.get({ name: providerJobName });
    const state = remote.state ? String(remote.state) : 'unknown';
    const terminal = TERMINAL[state];
    if (!terminal) return; // still queued/pending/running

    if (terminal === 'failed') {
      await this.prisma.llmBatchJob.update({
        where: { jobId },
        data: {
          status: 'failed',
          error: remote.error ? JSON.stringify(remote.error) : state,
          completedAt: new Date(),
        },
      });
      this.logger.error('Gemini batch failed', { jobId, state });
      return;
    }

    // SUCCEEDED: store responses by request order.
    const inlined = remote.dest?.inlinedResponses ?? [];
    const usage = { input: 0, output: 0, cached: 0, model: '' };
    for (const entry of inlined) {
      const meta = entry.response?.usageMetadata;
      usage.input += meta?.promptTokenCount ?? 0;
      usage.output += meta?.candidatesTokenCount ?? 0;
      usage.cached += meta?.cachedContentTokenCount ?? 0;
      usage.model ||= entry.response?.modelVersion ?? '';
    }
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
    });
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
    await this.prisma.llmBatchJob.update({
      where: { jobId },
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
    // Idempotency guard: claim the job before ingesting.
    const claimed = await this.prisma.llmBatchJob.updateMany({
      where: { jobId, status: 'succeeded' },
      data: { status: 'ingesting' },
    });
    if (claimed.count === 0) return;

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
      await this.prisma.llmBatchJob.update({
        where: { jobId },
        data: { status: 'ingested', ingestedAt: new Date() },
      });
      this.logger.info('Gemini batch ingested', { jobId, purpose });
    } catch (error) {
      // Back to 'succeeded' so the cron retries ingestion.
      await this.prisma.llmBatchJob.update({
        where: { jobId },
        data: {
          status: 'succeeded',
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
