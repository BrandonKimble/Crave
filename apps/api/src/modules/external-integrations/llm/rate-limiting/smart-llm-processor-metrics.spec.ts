/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- hand-built doubles for a service whose real deps are Redis + the Gemini SDK */
import { SmartLLMProcessor } from './smart-llm-processor.service';
import { LLMRateLimitError } from '../llm.exceptions';
import type { LLMService } from '../llm.service';
import type { LLMModelInput } from '../llm.types';

/**
 * F115 / D11 — THE INSTRUMENT MUST BE ABLE TO SHOW RED.
 *
 * getMetrics() used to hard-code `rateLimitHits: 0 // ZERO by design!` and
 * `successfulRequests = processedRequests // All requests succeed`, while
 * logPerformanceMetrics emitted `rateLimitViolations: 0 // Always ZERO!` and
 * `successRate: 100 // Always 100%!` to prod logs every 50 requests — from
 * the SAME class whose catch block was, at that moment, counting real
 * LLMRateLimitErrors and throwing them away.
 *
 * These specs feed a SIMULATED rate limit and assert the counters move. On
 * the old code every one of them fails (the numbers were literals), which is
 * the point: an always-green metric is lying, and this is the proof it can
 * now go red.
 */
describe('SmartLLMProcessor performance metrics (F115: RED-able, not decorative)', () => {
  const buildProcessor = () => {
    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const rateLimiter = {
      reserveRequestSlot: jest.fn().mockResolvedValue({
        reservationTime: Date.now(),
        waitMs: 0,
        guaranteed: true,
        metrics: { currentRPM: 1, utilizationPercent: 1 },
        reservationMember: 'm-1',
      }),
      confirmReservation: jest.fn().mockResolvedValue(undefined),
      finalizeTokenReservation: jest.fn().mockResolvedValue(undefined),
      getRPMAnalysis: jest.fn().mockResolvedValue({
        currentRPM: 1,
        utilizationPercent: 1,
        availableCapacity: 99,
      }),
      getTPMAnalysis: jest.fn().mockResolvedValue({
        currentTPM: 10,
        reservedTPM: 0,
        windowTokens: 10,
        utilizationPercent: 1,
        projectedTPM: 10,
        avgTokensPerRequest: 10,
        bottleneckType: 'none',
      }),
    };
    const processor = new SmartLLMProcessor(logger as any, rateLimiter as any);
    processor.onModuleInit();
    // Sleep between retries is the vendor's reset window — irrelevant to
    // whether the COUNTER moved, and it would make this spec take minutes.
    (processor as any).sleep = () => Promise.resolve();
    return { processor, logger, rateLimiter };
  };

  const input = { posts: [] } as unknown as LLMModelInput;
  const llmOk = (impl: jest.Mock) =>
    ({ processContent: impl }) as unknown as LLMService;

  it('a REAL rate limit increments rateLimitHits — the counter that used to be the literal 0', async () => {
    const { processor } = buildProcessor();
    const before = await processor.getMetrics();
    expect(before.performance.rateLimitHits).toBe(0);

    const processContent = jest
      .fn()
      .mockRejectedValueOnce(new LLMRateLimitError(1, { kind: 'rpm' }))
      .mockResolvedValue({ places: [] });

    await processor.processContent(input, llmOk(processContent), 'worker-test');

    const after = await processor.getMetrics();
    expect(after.performance.rateLimitHits).toBe(1);
    // And the request that eventually succeeded still counts as a success.
    expect(after.performance.successfulRequests).toBe(1);
    expect(after.performance.totalRequests).toBe(1);
  });

  it('successRate can fall BELOW 100 — a terminal failure is counted, not erased', async () => {
    const { processor, logger } = buildProcessor();
    const boom = jest.fn().mockRejectedValue(new Error('vendor exploded'));
    await expect(
      processor.processContent(input, llmOk(boom), 'worker-test'),
    ).rejects.toThrow('vendor exploded');

    const metrics = await processor.getMetrics();
    expect(metrics.performance.totalRequests).toBe(1);
    expect(metrics.performance.successfulRequests).toBe(0);

    // The prod log line reports the same real numbers (it used to print
    // successRate: 100 unconditionally).
    await (processor as any).logPerformanceMetrics();
    const entry = logger.info.mock.calls.find(
      (call: unknown[]) => call[0] === 'LLM Processor performance',
    );
    expect(entry).toBeDefined();
    expect((entry as any[])[1].highlights).toMatchObject({
      rateLimitViolations: 0,
      successRate: 0,
    });
  });

  it('the dev circuit breaker abort is a FAILURE and reports every 429 it saw', async () => {
    const { processor } = buildProcessor();
    const always429 = jest
      .fn()
      .mockRejectedValue(new LLMRateLimitError(1, { kind: 'rpm' }));

    await expect(
      processor.processContent(input, llmOk(always429), 'worker-test'),
    ).rejects.toThrow(/consecutive LLM rate limits/);

    const metrics = await processor.getMetrics();
    // 3 = the non-prod maxConsecutiveRateLimitErrors this spec runs under.
    expect(metrics.performance.rateLimitHits).toBe(3);
    expect(metrics.performance.successfulRequests).toBe(0);
    expect(metrics.performance.totalRequests).toBe(1);
  });
});
