import { isDebugRoutesEnabled } from './debug-routes.gate';

// The old gate was `NODE_ENV !== 'production'`, which FAILS OPEN — a
// container that never set NODE_ENV served the Sentry error-injection routes
// publicly. These tests pin the inverted default: absence of configuration
// grants nothing.

describe('debug-route exposure gate', () => {
  it('is OFF on a bare environment — the old gate turned this ON', () => {
    expect(isDebugRoutesEnabled({})).toBe(false);
  });

  it('is OFF in production and staging even if something opted in', () => {
    expect(
      isDebugRoutesEnabled({
        NODE_ENV: 'production',
        ENABLE_DEBUG_ROUTES: 'true',
      }),
    ).toBe(false);
    expect(
      isDebugRoutesEnabled({ APP_ENV: 'prod', ENABLE_DEBUG_ROUTES: 'true' }),
    ).toBe(false);
    expect(
      isDebugRoutesEnabled({ APP_ENV: 'staging', ENABLE_DEBUG_ROUTES: 'true' }),
    ).toBe(false);
  });

  // F402: these four spellings ALL returned true against the old
  // literal-comparison gate — `production`, `PROD`, `stage`, `PRODUCTION` are
  // exactly what `normalizeAppEnv` (used by the rest of the codebase) accepts,
  // and each one exposed the error-injection routes on a deployed env.
  it.each([
    ['production', { APP_ENV: 'production' }],
    ['PROD', { APP_ENV: 'PROD' }],
    ['stage', { APP_ENV: 'stage' }],
    ['STAGING', { APP_ENV: 'STAGING' }],
    ['NODE_ENV=PRODUCTION', { NODE_ENV: 'PRODUCTION' }],
    ['CRAVE_ENV=prod', { CRAVE_ENV: 'prod' }],
  ])('is OFF for the deployed-env spelling %s', (_label, env) => {
    expect(isDebugRoutesEnabled({ ...env, ENABLE_DEBUG_ROUTES: 'true' })).toBe(
      false,
    );
  });

  it('is OFF in development unless explicitly opted in', () => {
    expect(isDebugRoutesEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(
      isDebugRoutesEnabled({
        NODE_ENV: 'development',
        ENABLE_DEBUG_ROUTES: 'false',
      }),
    ).toBe(false);
    // An unrecognized value is not a silent yes.
    expect(
      isDebugRoutesEnabled({
        NODE_ENV: 'development',
        ENABLE_DEBUG_ROUTES: 'maybe',
      }),
    ).toBe(false);
  });

  // The opt-in now reads through the canonical flag reader instead of its own
  // fifth dialect, so the spellings a human types work locally (F402).
  it.each(['true', 'TRUE', '1', 'yes', 'on'])(
    'accepts the local opt-in spelled %s',
    (raw) => {
      expect(
        isDebugRoutesEnabled({
          NODE_ENV: 'development',
          ENABLE_DEBUG_ROUTES: raw,
        }),
      ).toBe(true);
    },
  );

  it('is ON only for an explicit local opt-in', () => {
    expect(
      isDebugRoutesEnabled({
        NODE_ENV: 'development',
        ENABLE_DEBUG_ROUTES: 'true',
      }),
    ).toBe(true);
  });
});
