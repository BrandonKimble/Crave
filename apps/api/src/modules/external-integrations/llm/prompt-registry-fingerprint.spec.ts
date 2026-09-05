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
  schemaHashFor,
  contentSha,
  COLLECTION_SYSTEM_PROMPT_KIND,
} from './prompt-registry.service';

function build(row: {
  version: number;
  content: string;
  contentHash: string;
  status: string;
  contentSha?: string | null;
  schemaHash?: string | null;
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

  it('serves a row pushed under a PREVIOUS schema as a PRIOR contract, and onModuleInit blocks LIVE extraction only (2026-09-05)', async () => {
    // A row whose content_hash folded an older schema: text intact
    // (content_sha matches), schema_hash on record and different from the
    // running code's. Before this, the boot door threw and the process could
    // not shadow the very candidate that carries the schema change.
    const oldSchemaHash = createHash('sha256')
      .update(JSON.stringify({ old: 'schema' }))
      .digest('hex');
    const { service, logger } = build({
      version: 22,
      content,
      contentHash: createHash('sha256')
        .update(`${content}\0schema:${JSON.stringify({ old: 'schema' })}`)
        .digest('hex'),
      status: 'active',
      contentSha: contentSha(content),
      schemaHash: oldSchemaHash,
    });
    expect(oldSchemaHash).not.toBe(schemaHashFor(kind));
    const active = await service.getActive(kind);
    expect(active.contract).toBe('prior');
    await service.onModuleInit();
    expect(() => service.assertCollectionPromptAvailable()).toThrow(
      /previous response schema/,
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('still REFUSES a corrupted row — text that matches neither its content_sha nor any hash on record — even with a schema_hash', async () => {
    // A prior contract's folded hash is unverifiable by construction (the
    // old schema is gone from the code); what content_sha proves is that
    // the TEXT is the text that was pushed. Tampered text is refused.
    const { service } = build({
      version: 23,
      content,
      contentHash: 'deadbeef'.repeat(8),
      status: 'active',
      contentSha: contentSha(content + ' tampered'),
      schemaHash: 'not-the-current-schema',
    });
    await expect(service.getActive(kind)).rejects.toThrow(
      /nor a recorded prior schema/,
    );
  });
});
