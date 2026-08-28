// p-limit is ESM-only; jest's CJS transform chokes on it when the replay
// service's import chain pulls in llm-concurrent-processing. Stub it — this
// spec never runs concurrent LLM work.
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import { ReplayService } from './replay.service';

/**
 * ONE SHADOW EXTRACTION PER SOURCE RUN PER PROMPT (junk RC7, v17 loop2).
 * The rehearsal sandbox hides shadow runs from each other, so a source run
 * replayed to completion twice under one candidate prompt minted
 * identical-identity_key rehearsal twins. The guard refuses the duplicate
 * replay before any spend; a failed prior replay does NOT block a retry.
 */
describe('ReplayService shadow duplicate guard', () => {
  function buildService(options: {
    existingRuns: Array<{ extraction_run_id: string; status: string }>;
  }): {
    service: ReplayService;
    processStoredInputs: jest.Mock;
  } {
    const processStoredInputs = jest.fn().mockResolvedValue({
      extractionRunId: 'new-run',
      dbResult: { affectedPlaceIds: [], affectedConnectionIds: [] },
    });
    const prisma = {
      extractionRun: {
        findUnique: jest.fn().mockResolvedValue({
          extractionRunId: 'source-run',
          pipeline: 'archive',
          metadata: {},
          inputs: [
            {
              inputId: 'input-1',
              inputIndex: 0,
              inputPayload: { posts: [] },
              sourceMap: {},
              sourceDocuments: [
                {
                  document: {
                    documentId: 'doc-1',
                    platform: 'reddit',
                    community: 'austinfood',
                    sourceType: 'comment',
                    sourceId: 't1_abc',
                    parentSourceId: 't3_post',
                    title: null,
                    body: 'text',
                    url: null,
                    sourceCreatedAt: new Date(),
                    scoreSnapshot: 1,
                    rawPayload: null,
                  },
                },
              ],
            },
          ],
        }),
      },
      llmPrompt: {
        findFirst: jest.fn().mockResolvedValue({ contentHash: 'hash-v17' }),
      },
      $queryRaw: jest.fn().mockResolvedValue(options.existingRuns),
    };
    const service = new ReplayService(
      prisma as never,
      { processStoredInputs } as never,
      {
        setContext: jest.fn().mockReturnValue({
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
        }),
      } as never,
    );
    service.onModuleInit();
    return { service, processStoredInputs };
  }

  it('skips a shadow replay whose source run already completed under the prompt hash', async () => {
    const { service, processStoredInputs } = buildService({
      existingRuns: [{ extraction_run_id: 'prior-run', status: 'completed' }],
    });
    const summary = await service.replayExtractionRun({
      sourceExtractionRunId: 'source-run',
      promptVersion: 17,
    });
    expect(processStoredInputs).not.toHaveBeenCalled();
    expect(summary.extractionRunId).toBe('prior-run');
    expect(summary.chunkCount).toBe(0);
    expect(summary.activated).toBe(false);
  });

  it('proceeds when no running/completed replay exists under the hash (failed runs retry)', async () => {
    const { service, processStoredInputs } = buildService({
      existingRuns: [],
    });
    const summary = await service.replayExtractionRun({
      sourceExtractionRunId: 'source-run',
      promptVersion: 17,
    });
    expect(processStoredInputs).toHaveBeenCalledTimes(1);
    expect(summary.extractionRunId).toBe('new-run');
  });
});
