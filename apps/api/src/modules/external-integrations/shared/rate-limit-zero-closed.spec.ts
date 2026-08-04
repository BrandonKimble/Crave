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
  const warnings: string[] = [];

  function build(
    perMinute: number,
    serviceOverrides: Record<string, unknown> = {},
  ): RateLimitCoordinatorService {
    const config = {
      get: (key: string) => {
        if (key === 'googlePlaces.operationLimits') {
          return { textSearch: { requestsPerMinute: perMinute } };
        }
        if (key in serviceOverrides) return serviceOverrides[key];
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
      warn(message: string) {
        warnings.push(message);
      },
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

  // The other half of the owner ruling: 0 STAYS legal, so an ACCIDENTAL 0
  // must be loud rather than silent. Deleting the closed-scope warn makes
  // this go RED.
  it('a closed scope announces itself at boot', () => {
    warnings.length = 0;
    build(0);
    expect(
      warnings.some(
        (line) =>
          line.includes('RATE LIMIT SCOPE CLOSED') &&
          line.includes('google-places:textSearch'),
      ),
    ).toBe(true);
  });

  it('a closed SERVICE-WIDE ceiling is kept, not re-opened to a literal', () => {
    warnings.length = 0;
    // `|| 600` used to resurrect the service default here; `??` semantics
    // keep the operator's 0 and close the whole service.
    build(500, { 'googlePlaces.requestsPerMinute': 0 });
    expect(
      warnings.some(
        (line) =>
          line.includes('RATE LIMIT SCOPE CLOSED') &&
          line.includes("'google-places'"),
      ),
    ).toBe(true);
  });

  it('a MISSING service ceiling refuses to boot rather than guessing', () => {
    expect(() =>
      build(500, { 'googlePlaces.requestsPerMinute': undefined }),
    ).toThrow(/missing or malformed/);
  });
});
