import {
  PhotoVisionService,
  IS_FOOD_RESPONSE_JSON_SCHEMA,
} from './photo-vision.service';
import type { LLMService } from '../external-integrations/llm/llm.service';
import type { LoggerService } from '../../shared';

/**
 * IS-FOOD GATE — the last parse-and-pray call site, closed (prompt-fleet
 * audit 2026-08-11). These are mutation proofs:
 * - reverting to the old startsWith('NO') free-text parse fails the
 *   "schema is sent" and "preamble cannot read as YES" tests;
 * - flipping the fail posture (fail-closed on infra) fails the fail-open
 *   tests — topicality must never block a legitimate photo.
 */

const loggerService = {
  setContext: () => ({
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  }),
} as unknown as LoggerService;

function makeService(generate: jest.Mock): PhotoVisionService {
  const llm = { generateForCaller: generate } as unknown as LLMService;
  return new PhotoVisionService(llm, loggerService);
}

function mockFetchOk(): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  }) as unknown as typeof fetch;
}

describe('PhotoVisionService.isFoodContent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the enforced enum schema — the verdict is decoded, not scraped', async () => {
    mockFetchOk();
    const generate = jest.fn().mockResolvedValue('{"answer":"YES"}');
    const service = makeService(generate);
    await expect(service.isItemContent('http://x/thumb.jpg')).resolves.toBe(
      true,
    );
    const call = (generate.mock.calls as unknown[][])[0][0] as {
      caller: string;
      generationConfig: {
        responseJsonSchema: unknown;
        responseMimeType: string;
      };
    };
    expect(call.generationConfig.responseJsonSchema).toBe(
      IS_FOOD_RESPONSE_JSON_SCHEMA,
    );
    expect(call.generationConfig.responseMimeType).toBe('application/json');
    expect(call.caller).toBe('photos.is_food');
  });

  it('NO means false', async () => {
    mockFetchOk();
    const service = makeService(jest.fn().mockResolvedValue('{"answer":"NO"}'));
    await expect(service.isItemContent('http://x/thumb.jpg')).resolves.toBe(
      false,
    );
  });

  it('a preamble can no longer read as a verdict: malformed output fails OPEN (kept)', async () => {
    mockFetchOk();
    // The old parser read this as YES ("does not start with NO"); the new
    // one refuses to treat it as a verdict and the infra posture (fail-open)
    // applies instead.
    const service = makeService(
      jest.fn().mockResolvedValue('I think the answer is NO'),
    );
    await expect(service.isItemContent('http://x/thumb.jpg')).resolves.toBe(
      true,
    );
  });

  it('an LLM error fails OPEN — topicality never blocks a legitimate photo', async () => {
    mockFetchOk();
    const service = makeService(
      jest.fn().mockRejectedValue(new Error('spend budget closed')),
    );
    await expect(service.isItemContent('http://x/thumb.jpg')).resolves.toBe(
      true,
    );
  });

  it('a failed thumb fetch skips the gate (kept)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    const generate = jest.fn();
    const service = makeService(generate);
    await expect(service.isItemContent('http://x/thumb.jpg')).resolves.toBe(
      true,
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
