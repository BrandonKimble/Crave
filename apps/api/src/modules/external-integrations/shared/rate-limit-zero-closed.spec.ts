import { RateLimitCoordinatorService } from './rate-limit-coordinator.service';
import { ExternalApiService } from './external-integrations.types';

/**
 * F114 (owner-ratified 2026-08-03): a configured ceiling of ZERO means
 * CLOSED — never "unset", never the service default. These specs can show
 * RED: reverting the closed-scope branch makes the first one fail with
 * allowed=true (the old fail-open), and reverting boot refusal makes the
 * second construct silently.
 */
describe('rate limits: zero means closed', () => {
  function build(perMinute: number): RateLimitCoordinatorService {
    const config = {
      get: (key: string) => {
        if (key === 'googlePlaces.operationLimits') {
          return { textSearch: { requestsPerMinute: perMinute } };
        }
        if (key === 'googlePlaces.requestsPerMinute') return 60;
        if (key === 'googlePlaces.requestsPerDay') return 1000;
        return undefined;
      },
    };
    const redis = {
      getOrThrow: () => ({ eval: () => Promise.resolve([1, 0, 0]) }),
    };
    const logger: Record<string, unknown> = {
      setContext: () => logger,
      debug() {},
      info() {},
      warn() {},
      error() {},
    };
    const svc = new RateLimitCoordinatorService(
      config as never,
      logger as never,
      redis as never,
    );
    svc.onModuleInit();
    return svc;
  }

  it('a 0-limit operation DENIES (closed), before Redis is even asked', async () => {
    const svc = build(0);
    const res = await svc.requestPermission({
      service: ExternalApiService.GOOGLE_PLACES,
      operation: 'textSearch',
    } as never);
    expect(res.allowed).toBe(false);
    expect(res.limit).toBe(0);
  });

  it('a malformed limit refuses to boot', () => {
    expect(() => build(Number.NaN)).toThrow(/malformed/);
  });
});
