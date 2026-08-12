import {
  PooledBatchRunner,
  extractBatchResponseText,
} from './pooled-batch-runner';
import type { LLMService } from './llm.service';
import type { GeminiBatchService } from './gemini-batch.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { LoggerService } from '../../../shared';
import { runInWorkContext } from '../shared/work-context';

/**
 * POOLED BATCH RUNNER — behavior proofs for the half-price sweep bridge.
 *
 * Mutation-proven, not shape-checked: each test pins an outcome a plausible
 * regression would flip —
 * - a runner that "helpfully" fabricates text for errored items breaks the
 *   null-for-unanswered contract (the no-fake-estimates law applied to
 *   sweeps);
 * - a runner that forgets to submit under `pooled.<caller>` orphans the job
 *   (no ingestor family -> never flips to ingested);
 * - a runner that keeps driving past its deadline wedges the sweep AND keeps
 *   a provider job billing;
 * - an extractor that concatenates THOUGHT parts leaks reasoning into parsed
 *   JSON.
 */

const loggerService = {
  setContext: () => ({
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  }),
} as unknown as LoggerService;

function makeRunner(overrides: {
  drive: string[];
  rows: Array<{ itemKey: string; response: unknown; error: string | null }>;
  onSubmit?: (params: unknown) => void;
  onCancel?: () => void;
}): PooledBatchRunner {
  const llm = {
    modelForCaller: () => 'test-model',
    buildCallerBatchRequest: (params: { prompt: string }) => ({
      contents: params.prompt,
      config: { assembled: true },
    }),
  } as unknown as LLMService;
  let driveIndex = 0;
  const batch = {
    submit: (params: unknown) => {
      overrides.onSubmit?.(params);
      return Promise.resolve('job-1');
    },
    driveOnce: () => {
      const status =
        overrides.drive[Math.min(driveIndex, overrides.drive.length - 1)];
      driveIndex += 1;
      return Promise.resolve(status);
    },
    cancel: () => {
      overrides.onCancel?.();
      return Promise.resolve();
    },
  } as unknown as GeminiBatchService;
  const prisma = {
    llmBatchJobItem: {
      findMany: () => Promise.resolve(overrides.rows),
    },
  } as unknown as PrismaService;
  return new PooledBatchRunner(llm, batch, prisma, loggerService);
}

const textResponse = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] } }],
});

describe('PooledBatchRunner.generateMany', () => {
  it('returns each answered item under its own key, at the pooled purpose', async () => {
    let submitted:
      | { purpose: string; items: Array<{ config: unknown }> }
      | undefined;
    const runner = makeRunner({
      drive: ['ingested'],
      rows: [
        { itemKey: 'a', response: textResponse('{"x":1}'), error: null },
        { itemKey: 'b', response: textResponse('{"x":2}'), error: null },
      ],
      onSubmit: (params) =>
        (submitted = params as {
          purpose: string;
          items: Array<{ config: unknown }>;
        }),
    });
    const out = await runner.generateMany({
      caller: 'labels.vocabulary',
      items: [
        { key: 'a', prompt: 'p1' },
        { key: 'b', prompt: 'p2' },
      ],
    });
    expect(out.get('a')).toBe('{"x":1}');
    expect(out.get('b')).toBe('{"x":2}');
    // The pooled purpose IS the ingestor contract: any other purpose has no
    // registered ingestor and the job never reaches 'ingested'.
    expect(submitted?.purpose).toBe('pooled.labels.vocabulary');
    // Assembly went through the gateway's builder, not hand-rolled config.
    expect(submitted?.items[0].config).toEqual({ assembled: true });
  });

  it('resolves errored and missing items to null — never fabricated text', async () => {
    const runner = makeRunner({
      drive: ['ingested'],
      rows: [
        { itemKey: 'a', response: textResponse('ok'), error: null },
        { itemKey: 'b', response: textResponse('poisoned'), error: 'boom' },
        // 'c' has no row at all.
      ],
    });
    const out = await runner.generateMany({
      caller: 'concepts.satisfies',
      items: [
        { key: 'a', prompt: 'p' },
        { key: 'b', prompt: 'p' },
        { key: 'c', prompt: 'p' },
      ],
    });
    expect(out.get('a')).toBe('ok');
    expect(out.get('b')).toBeNull(); // errored: its text must NOT be used
    expect(out.get('c')).toBeNull();
  });

  it('cancels on timeout and returns whatever landed', async () => {
    let cancelled = false;
    const runner = makeRunner({
      drive: ['submitted'], // never terminal
      rows: [{ itemKey: 'a', response: textResponse('late'), error: null }],
      onCancel: () => (cancelled = true),
    });
    const out = await runner.generateMany({
      caller: 'dish.knowledge_synthesize',
      items: [
        { key: 'a', prompt: 'p' },
        { key: 'b', prompt: 'p' },
      ],
      timeoutMs: 0,
      pollMs: 1,
    });
    expect(cancelled).toBe(true);
    expect(out.get('a')).toBe('late'); // completed items are still read
    expect(out.get('b')).toBeNull();
  });

  /**
   * SPEND ATTRIBUTION SURVIVES THE HANDOFF (red team 2026-08-12).
   * The sync rail is attributed ambiently at record time; a pooled batch is
   * ledgered LATER, by whichever poller reaches the terminal state — possibly
   * the shared batch cron, outside the sweep's async context. Unless the
   * campaign rides ON the job, that spend leaves the campaign's envelope and
   * a breached campaign's sweeps keep dispatching.
   */
  it('stashes the ambient campaign on the job so the ledger and the breach gate can see it', async () => {
    let submitted: { resumeContext?: unknown } | undefined;
    const runner = makeRunner({
      drive: ['ingested'],
      rows: [{ itemKey: 'a', response: textResponse('ok'), error: null }],
      onSubmit: (params) => (submitted = params as { resumeContext?: unknown }),
    });
    await runInWorkContext(
      { campaignId: 'camp-7', label: 'reextract:austinfood:v8' },
      () =>
        runner.generateMany({
          caller: 'labels.vocabulary',
          items: [{ key: 'a', prompt: 'p' }],
        }),
    );
    expect(submitted?.resumeContext).toEqual({
      campaignId: 'camp-7',
      label: 'reextract:austinfood:v8',
    });
  });

  it('carries NO resumeContext when no campaign funds the sweep', async () => {
    let submitted: { resumeContext?: unknown } | undefined;
    const runner = makeRunner({
      drive: ['ingested'],
      rows: [{ itemKey: 'a', response: textResponse('ok'), error: null }],
      onSubmit: (params) => (submitted = params as { resumeContext?: unknown }),
    });
    await runner.generateMany({
      caller: 'labels.vocabulary',
      items: [{ key: 'a', prompt: 'p' }],
    });
    expect(submitted?.resumeContext).toBeUndefined();
  });

  it('short-circuits an empty item list without submitting', async () => {
    let submitted = false;
    const runner = makeRunner({
      drive: ['ingested'],
      rows: [],
      onSubmit: () => (submitted = true),
    });
    const out = await runner.generateMany({ caller: 'x', items: [] });
    expect(out.size).toBe(0);
    expect(submitted).toBe(false);
  });
});

describe('extractBatchResponseText', () => {
  it('concatenates answer parts and drops thought parts', () => {
    expect(
      extractBatchResponseText({
        candidates: [
          {
            content: {
              parts: [
                { text: 'thinking...', thought: true },
                { text: '{"a"' },
                { text: ':1}' },
              ],
            },
          },
        ],
      }),
    ).toBe('{"a":1}');
  });

  it('returns null for empty/malformed responses', () => {
    expect(extractBatchResponseText(null)).toBeNull();
    expect(extractBatchResponseText({})).toBeNull();
    expect(
      extractBatchResponseText({ candidates: [{ content: { parts: [] } }] }),
    ).toBeNull();
  });
});
