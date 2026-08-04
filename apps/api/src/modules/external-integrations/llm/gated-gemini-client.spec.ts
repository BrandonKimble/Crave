import { GatedGeminiClient } from './gated-gemini-client';
import {
  SURFACE_BILLING,
  undeclaredSurfaces,
} from './gemini-billable-surfaces';

/**
 * The gate runs BEFORE the vendor call, and a closed gate means the vendor is
 * never reached. This is a behavior test, not a source scanner: the scanner it
 * replaced could be satisfied by the word `assertSpendBudgetOpen` appearing in
 * a comment, so it stayed green after the real gate on the main generation
 * path was deleted (red team 2026-08-02).
 */
describe('GatedGeminiClient', () => {
  const PAID: Array<[string, (c: GatedGeminiClient) => Promise<unknown>]> = [
    ['generateContent', (c) => c.generateContent({})],
    ['embedContent', (c) => c.embedContent({})],
    [
      'createCache',
      (c) => c.createCache({ model: 'm', config: { ttl: '60s' } }),
    ],
    ['createBatch', (c) => c.createBatch({})],
    // A TTL extension buys more token-hours — the registry meters it as a
    // cachedContentStorage event against the same pool.
    ['updateCacheTtl', (c) => c.updateCacheTtl('c', '60s')],
  ];

  function raw(client: GatedGeminiClient): {
    models: Record<string, jest.Mock>;
    caches: Record<string, jest.Mock>;
    batches: Record<string, jest.Mock>;
  } {
    const vendor = {
      models: {
        generateContent: jest.fn().mockResolvedValue({}),
        embedContent: jest.fn().mockResolvedValue({}),
      },
      caches: {
        create: jest.fn().mockResolvedValue({ name: 'c' }),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      batches: {
        create: jest.fn().mockResolvedValue({ name: 'b' }),
        cancel: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue({}),
        list: jest.fn().mockResolvedValue([]),
      },
    };
    // The raw client is private and never escapes; swapping it here is the
    // test reaching in, which is exactly what production code cannot do.
    (client as unknown as { raw: unknown }).raw = vendor;
    return vendor;
  }

  it.each(PAID)('a closed gate stops %s before the vendor', async (_, call) => {
    const closed = jest
      .fn()
      .mockRejectedValue(new Error('spend backstop closed'));
    const client = new GatedGeminiClient('key', closed);
    const vendor = raw(client);

    await expect(call(client)).rejects.toThrow('spend backstop closed');

    const reached = [
      ...Object.values(vendor.models),
      ...Object.values(vendor.caches),
      ...Object.values(vendor.batches),
    ].filter((fn) => fn.mock.calls.length > 0);
    expect(reached).toEqual([]);
  });

  it.each(PAID)('an open gate is consulted for %s', async (_, call) => {
    const gate = jest.fn().mockResolvedValue(undefined);
    const client = new GatedGeminiClient('key', gate);
    raw(client);

    await call(client);

    expect(gate).toHaveBeenCalledTimes(1);
  });

  it('every surface is classified — an unclassified one fails CONSTRUCTION', () => {
    // The direction types cannot cover, and the direction the original defect
    // came from: a method added without deciding whether it costs money.
    // TypeScript will not enumerate a class's methods to demand map coverage,
    // so this is checked when the client is built.
    expect(undeclaredSurfaces(new GatedGeminiClient('k', jest.fn()))).toEqual(
      [],
    );
  });

  it('deleteCache is free-and-MUST-STAY-free — gating it would raise spend', () => {
    // Cache storage bills per token-hour for as long as the cache lives, so
    // deleting one STOPS a running charge. A closed budget that also blocked
    // deletion would keep paying for storage it could no longer release.
    expect(SURFACE_BILLING.deleteCache).toBe('free-and-must-stay-free');
  });

  it('free surfaces do not pay the gate', async () => {
    const gate = jest.fn().mockRejectedValue(new Error('closed'));
    const client = new GatedGeminiClient('key', gate);
    raw(client);

    await client.cancelBatch('b');
    await client.getBatch('b');
    await client.listBatches(100);
    await client.deleteCache('c');

    expect(gate).not.toHaveBeenCalled();
  });
});
