import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { recordUnanswered } from './unanswered-outcome';
import { GeminiBatchService } from './gemini-batch.service';
import { LLMService } from './llm.service';
import { currentWorkContext } from '../shared/work-context';
import type { GeminiGenerationConfig } from './gemini-generation-config';

/**
 * POOLED BATCH RUNNER (prompt-fleet audit 2026-08-11, cost fix 1).
 *
 * Batch API requests bill at HALF the sync rate, and until now the only lane
 * that used them was collection extraction. Every other non-interactive
 * sweep — vocabulary labels, dish knowledge synthesis, and future corpus
 * passes — paid full sync price for work where nobody is waiting.
 *
 * This is the awaitable bridge between the two shapes: a sweep hands over N
 * prompts under ONE caller tag and awaits a Map of texts; underneath, the
 * prompts ride the DURABLE GeminiBatchService (crash-safe, lease-guarded,
 * spend-gated, ledgered at batch rates under `gemini-batch.pooled.<caller>`)
 * and the runner drives the job's lifecycle itself via driveOnce, so it
 * works from any process — cron or not.
 *
 * FAILURE SEMANTICS ARE THE SWEEP'S OWN: a missing/errored item resolves to
 * `null`, exactly like a failed sync call resolved to "nothing for those
 * concepts". Every current consumer is watermark-driven — unanswered work is
 * re-offered on the next run — so a timeout costs latency, never data, and
 * never a fabricated result. On timeout the job is CANCELLED so a wedged
 * provider job cannot bill for work nobody will read (completed items inside
 * a cancelled batch still ledger — cancel() reaps the remote and meters
 * them itself before flipping status; the poller can no longer see a
 * cancelled job, which is why the meter rides the cancel — red team
 * 2026-08-19 D1).
 *
 * Request assembly lives in LLMService.buildCallerBatchRequest — the runner
 * never writes a model, ceiling, thinking level, or schema conversion, which
 * is what keeps the "one assembler forgot X" class closed on this path.
 */
@Injectable()
export class PooledBatchRunner {
  private readonly logger: LoggerService;

  /** Sweeps are background work: generous by default, bounded always. */
  private static readonly DEFAULT_TIMEOUT_MS = 12 * 60 * 60 * 1000;
  private static readonly DEFAULT_POLL_MS = 30_000;

  constructor(
    private readonly llm: LLMService,
    private readonly batch: GeminiBatchService,
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PooledBatchRunner');
  }

  /**
   * Run N prompts for one caller through the Batch API and await the texts.
   * Returns a Map keyed by the caller's item keys; `null` = no usable
   * response for that item (errored, missing, or timed out).
   */
  async generateMany(params: {
    caller: string;
    items: Array<{ key: string; prompt: string }>;
    systemInstruction?: string;
    generationConfig?: GeminiGenerationConfig;
    timeoutMs?: number;
    pollMs?: number;
  }): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>(
      params.items.map((item) => [item.key, null]),
    );
    if (!params.items.length) {
      return out;
    }
    const model = this.llm.modelForCaller(params.caller);
    const submitItems = params.items.map((item) => {
      const { contents, config } = this.llm.buildCallerBatchRequest({
        caller: params.caller,
        prompt: item.prompt,
        systemInstruction: params.systemInstruction,
        generationConfig: params.generationConfig,
      });
      return { key: item.key, contents, config };
    });
    // CAMPAIGN ATTRIBUTION RIDES WITH THE JOB (red team 2026-08-12). The sync
    // rail is attributed AMBIENTLY: usage-ledger.service reads
    // currentCampaignId() at record time, in the caller's own async context.
    // A pooled batch breaks that context in two ways, and both were live:
    //   1. The ledger row is written by whichever process reaches the job's
    //      terminal state first — and the shared batch poll cron reaches
    //      'submitted' jobs too. Driven there, currentCampaignId() is
    //      undefined and the campaign's own sweep spend vanishes from its
    //      envelope: the same "spent << envelope, never breaches" hole the
    //      ambient context was built to close (work-context.ts, D4).
    //   2. GeminiBatchService.submit refuses a batch belonging to a BREACHED
    //      campaign — but only when it can see a campaignId in resumeContext.
    //      With none, a breached campaign's sweeps kept dispatching.
    // Stashing the ambient context on the job makes both facts durable, so
    // attribution no longer depends on WHO polls.
    const work = currentWorkContext();
    const jobId = await this.batch.submit({
      purpose: `pooled.${params.caller}`,
      model,
      items: submitItems,
      resumeContext: work?.campaignId
        ? { campaignId: work.campaignId, label: work.label }
        : undefined,
    });

    const timeoutMs = params.timeoutMs ?? PooledBatchRunner.DEFAULT_TIMEOUT_MS;
    const pollMs = params.pollMs ?? PooledBatchRunner.DEFAULT_POLL_MS;
    const deadline = Date.now() + timeoutMs;
    let status = 'pending';
    for (;;) {
      status = await this.batch.driveOnce(jobId);
      if (status === 'ingested' || status === 'failed') {
        break;
      }
      if (Date.now() >= deadline) {
        recordUnanswered(this.logger, {
          lane: params.caller,
          unit: 'item',
          count: params.items.length,
          reason: 'timeout_cancelled',
        });
        this.logger.warn('Pooled batch timed out — cancelling', {
          jobId,
          caller: params.caller,
          timeoutMs,
        });
        await this.batch.cancel(jobId).catch((error: unknown) => {
          this.logger.warn('Pooled batch cancel failed', {
            jobId,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
        });
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    // Read whatever landed — even a failed/cancelled job may carry completed
    // items (Google bills them; we should not throw their answers away).
    const rows = await this.prisma.llmBatchJobItem.findMany({
      where: { jobId },
      select: { itemKey: true, response: true, error: true },
    });
    for (const row of rows) {
      if (row.error || !row.response) continue;
      const text = extractBatchResponseText(row.response);
      if (text !== null && out.has(row.itemKey)) {
        out.set(row.itemKey, text);
      }
    }
    const answered = [...out.values()].filter((v) => v !== null).length;
    this.logger.info('Pooled batch complete', {
      jobId,
      caller: params.caller,
      status,
      items: params.items.length,
      answered,
    });
    return out;
  }
}

/** Text of a stored GenerateContentResponse-shaped batch item response —
 *  the same candidates[0].content.parts[].text walk the sync path reads.
 *  Thought parts (part.thought === true) are never answer text. */
export function extractBatchResponseText(response: unknown): string | null {
  const candidates = (
    response as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    }
  )?.candidates;
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .filter((part) => part?.thought !== true && typeof part?.text === 'string')
    .map((part) => part.text)
    .join('');
  return text.length ? text : null;
}
