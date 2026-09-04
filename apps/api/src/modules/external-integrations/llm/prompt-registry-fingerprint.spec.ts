/**
 * THE FINGERPRINT IS ENFORCED ON THE ROW WE SERVE (red team 2026-09-04
 * G-4). A version's hash covers prompt text AND response schema; served
 * un-checked, a schema edit shipped while every run's coverage still read
 * "covered". A pre-fold row (content-only sha256) is tolerated with a
 * warning; any other mismatch is refused. RED against the old registry:
 * the garbage-hash row was served without a word.
 */
import { createHash } from 'crypto';
import {
  PromptRegistryService,
  promptFingerprint,
  COLLECTION_SYSTEM_PROMPT_KIND,
} from './prompt-registry.service';

function build(row: {
  version: number;
  content: string;
  contentHash: string;
  status: string;
}) {
  const prisma = {
    llmPrompt: {
      findFirst: jest.fn(() => Promise.resolve(row)),
      upsert: jest.fn(),
    },
  };
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };
  const service = new PromptRegistryService(
    prisma as never,
    { setActiveSystemPrompt: jest.fn() } as never,
    logger as never,
  );
  (service as unknown as { logger: unknown }).logger = logger;
  return { service, logger };
}

describe('PromptRegistryService fingerprint enforcement', () => {
  const content = '# prompt text\nrules';
  const kind = COLLECTION_SYSTEM_PROMPT_KIND;

  it('serves a row whose stored hash IS its content+schema fingerprint, silently', async () => {
    const { service, logger } = build({
      version: 9,
      content,
      contentHash: promptFingerprint(kind, content),
      status: 'active',
    });
    await expect(service.getActive(kind)).resolves.toMatchObject({
      version: 9,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('serves a pre-fold row (content-only sha256) with a warning', async () => {
    const legacy = createHash('sha256').update(content).digest('hex');
    const { service, logger } = build({
      version: 1,
      content,
      contentHash: legacy,
      status: 'active',
    });
    await expect(service.getActive(kind)).resolves.toMatchObject({
      version: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('pre-fold'),
      expect.objectContaining({ kind, version: 1 }),
    );
  });

  it('REFUSES a row whose stored hash matches neither fingerprint nor legacy hash', async () => {
    const { service } = build({
      version: 2,
      content,
      contentHash:
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      status: 'active',
    });
    await expect(service.getActive(kind)).rejects.toThrow(
      /matches neither its content\+schema fingerprint/,
    );
  });
});
