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

  it('is OFF in development unless explicitly opted in', () => {
    expect(isDebugRoutesEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(
      isDebugRoutesEnabled({
        NODE_ENV: 'development',
        ENABLE_DEBUG_ROUTES: 'false',
      }),
    ).toBe(false);
    expect(
      isDebugRoutesEnabled({
        NODE_ENV: 'development',
        ENABLE_DEBUG_ROUTES: '1',
      }),
    ).toBe(false);
  });

  it('is ON only for an explicit local opt-in', () => {
    expect(
      isDebugRoutesEnabled({
        NODE_ENV: 'development',
        ENABLE_DEBUG_ROUTES: 'true',
      }),
    ).toBe(true);
  });
});
