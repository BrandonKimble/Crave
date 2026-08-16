/**
 * THE MONEY GUARD (owner ruling 2026-08-08, janitor slim-down).
 *
 * Retry is mention-driven: every batch enqueues enrichment for every
 * restaurant it mentions. Without this guard, a much-discussed but
 * ungroundable name (a food truck, a pop-up) re-buys autocomplete plus the
 * expensive textSearch fallback on EVERY future mention, forever. The guard
 * refuses — status `skipped`, zero vendor calls — once definitive failures
 * reach the configured threshold, while the entity stays ACTIVE and
 * name-searchable.
 *
 * The bypasses are the point, not an afterthought: `force` (identity
 * changed — the janitor's moved arm) and `retryTerminal` (the ghost
 * recovery sweep, whose entire purpose is re-attempting known failures
 * after a root-cause fix).
 */
import { PlaceLocationEnrichmentService } from './restaurant-location-enrichment.service';

const THRESHOLD = 3;

function makeService(entity: Record<string, unknown>) {
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  // Any vendor touch fails the test: the guard's contract is zero spend.
  const googlePlaces = new Proxy(
    {},
    {
      get: (_target, property) => () => {
        throw new Error(
          `guard leaked a vendor call: googlePlaces.${String(property)}`,
        );
      },
    },
  );
  const prisma = {
    entity: {
      findUnique: jest.fn().mockResolvedValue(entity),
    },
    // The snippet derivation runs before the vendor call and is DB-only;
    // returning no rows keeps the path honest without seeding events.
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const service = new PlaceLocationEnrichmentService(
    prisma as never,
    googlePlaces as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      get: (key: string) =>
        key === 'locationLifecycle.noMatchAttemptThreshold'
          ? THRESHOLD
          : undefined,
    } as never,
    { emit: jest.fn() } as never,
    {
      decidedVerdicts: () => Promise.resolve(new Map()),
      record: () => Promise.resolve(undefined),
      markExecuted: () => Promise.resolve(undefined),
      pendingExecution: () => Promise.resolve([]),
    } as never,
    logger as never,
  );
  return service;
}

const terminalEntity = {
  entityId: 'e-terminal',
  type: 'place',
  status: 'active',
  // eslint-disable-next-line no-restricted-syntax -- test FIXTURE simulating a row the counter already incremented, not a production assignment
  enrichmentFailureCount: THRESHOLD,
  primaryLocation: null,
  locations: [],
  name: 'Ungroundable Food Truck',
};

describe('the terminal-failure money guard', () => {
  it('refuses (skipped, zero vendor calls) at the threshold', async () => {
    const service = makeService(terminalEntity);
    const result = await service.enrichPlaceById('e-terminal');
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('terminal');
  });

  it('below the threshold the attempt proceeds to the vendor (proven by the vendor-call tripwire firing)', async () => {
    const service = makeService({
      ...terminalEntity,
      // eslint-disable-next-line no-restricted-syntax -- test fixture
      enrichmentFailureCount: THRESHOLD - 1,
    });
    const result = await service.enrichPlaceById('e-terminal');
    // The Proxy throws on the first Places touch; the outer catch converts it
    // to an error result — which is exactly the proof the guard stood aside.
    expect(result.status).toBe('error');
    expect(result.reason).toContain('guard leaked a vendor call');
  });

  it('retryTerminal bypasses the guard (the recovery sweep after a root-cause fix)', async () => {
    const service = makeService(terminalEntity);
    const result = await service.enrichPlaceById('e-terminal', {
      retryTerminal: true,
    });
    expect(result.status).toBe('error');
    expect(result.reason).toContain('guard leaked a vendor call');
  });

  // F9965: `force` is deliberately WIDER than `retryTerminal` — it bypasses
  // BOTH the already-grounded short-circuit and the money guard, because a
  // moved-place identity refresh must re-buy details for an entity that is
  // grounded AND may be past the threshold. This pins that width.
  it('force bypasses the money guard too (the janitor moved-arm path)', async () => {
    const service = makeService(terminalEntity);
    const result = await service.enrichPlaceById('e-terminal', {
      force: true,
    });
    expect(result.status).toBe('error');
    expect(result.reason).toContain('guard leaked a vendor call');
  });

  it('force also bypasses the already-grounded short-circuit, retryTerminal does NOT', async () => {
    const grounded = {
      ...terminalEntity,
      primaryLocation: { googlePlaceId: 'place-1' },
    };
    const viaRetryTerminal = await makeService(grounded).enrichPlaceById(
      'e-terminal',
      { retryTerminal: true },
    );
    // retryTerminal is the narrow bypass: a grounded entity still short-circuits.
    expect(viaRetryTerminal.status).toBe('skipped');
    expect(viaRetryTerminal.reason).toContain('already has place-backed');

    const viaForce = await makeService(grounded).enrichPlaceById('e-terminal', {
      force: true,
    });
    expect(viaForce.status).toBe('error');
    expect(viaForce.reason).toContain('guard leaked a vendor call');
  });
});
