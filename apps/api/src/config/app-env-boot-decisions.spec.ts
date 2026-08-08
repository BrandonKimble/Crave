/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs a
   fresh require() per case: configuration resolves APP_ENV at module load, so a static
   import would freeze the first case's env for every later one. */
/* eslint-disable no-restricted-syntax -- the no-raw-APP_ENV rule guards PRODUCTION code
   from a second spelling of the env var. This spec is the test OF that resolution, so it
   must write the raw variable to drive the subject; calling the resolver here would test
   the resolver against itself. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
/**
 * F404 lockdown: boot-time decisions must key on AppEnv (APP_ENV), not
 * NODE_ENV — staging deploys with NODE_ENV=production, so a NODE_ENV check
 * cannot distinguish staging from prod, and before this fix staging silently
 * inherited prod's database pool size and Cloudinary asset namespace default.
 */
describe('configuration() boot decisions key on AppEnv (F404)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function loadConfig() {
    let configuration: () => any;
    jest.isolateModules(() => {
      configuration = require('./configuration').default;
    });
    return configuration!();
  }

  it("staging (APP_ENV=staging, NODE_ENV=production) gets the staging pool size, not prod's", () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    process.env.DATABASE_URL = 'postgresql://u:p@db.internal:5432/crave';
    delete process.env.DATABASE_CONNECTION_POOL_MAX;

    const config = loadConfig();

    // Rederived 2026-08-08 with the ceiling-derived defaults (dev 10 /
    // staging 15 / prod 20 — see getDatabasePoolSize). The F404 claim this
    // pins is unchanged: staging gets STAGING's default, never prod's.
    expect(config.database.connectionPool.max).toBe(15);
    expect(config.database.connectionPool.max).not.toBe(20);
  });

  it('real production (APP_ENV=prod, NODE_ENV=production) gets the ceiling-derived 20-connection default', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'prod';
    process.env.DATABASE_URL = 'postgresql://u:p@db.internal:5432/crave';
    delete process.env.DATABASE_CONNECTION_POOL_MAX;

    const config = loadConfig();

    // 20 per service: two services × 20 = 40% of the 100-connection
    // ceiling. The old default of 50 meant two services could consume the
    // entire ceiling — the 2026-08-08 incident's arithmetic as a default.
    expect(config.database.connectionPool.max).toBe(20);
  });

  it('staging Cloudinary assets default to the staging namespace, not "dev"', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    process.env.DATABASE_URL = 'postgresql://u:p@db.internal:5432/crave';
    delete process.env.CLOUDINARY_ENV_PREFIX;

    const config = loadConfig();

    expect(config.cloudinary.envPrefix).toBe('staging');
    expect(config.cloudinary.envPrefix).not.toBe('dev');
  });
});

/**
 * F2075: a MISSING DATABASE_URL must not be survivable on deployed
 * infrastructure.
 *
 * `DatabaseValidationService` opens with `if (!url) throw 'DATABASE_URL is
 * required but not provided'` — a guard named for exactly this failure that
 * could never fire, because `getDatabaseUrl()` returned
 * `postgresql://postgres:postgres@localhost:5432/crave_search` instead of
 * undefined, and that string then passed every remaining check (prefix,
 * hostname, database name). The result was a deployed container with a
 * dropped or typo'd DATABASE_URL booting green and quietly dialling
 * localhost.
 *
 * These cases assert the COMPOSITE — what `configuration()` actually hands
 * the app — rather than that some branch was taken. The dev case is here so
 * this can show RED in both directions: an over-eager fix that removed the
 * fallback everywhere would break every laptop, and would fail here.
 */
describe('configuration() refuses an invented DATABASE_URL on deployed envs (F2075)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function loadConfig() {
    let configuration: () => any;
    jest.isolateModules(() => {
      configuration = require('./configuration').default;
    });
    return configuration!();
  }

  const LOCALHOST_FALLBACK =
    'postgresql://postgres:postgres@localhost:5432/crave_search';

  for (const appEnv of ['prod', 'staging'] as const) {
    it(`APP_ENV=${appEnv} with DATABASE_URL unset throws instead of defaulting to localhost`, () => {
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = appEnv;
      delete process.env.DATABASE_URL;
      delete process.env.TEST_DATABASE_URL;

      expect(() => loadConfig()).toThrow(/DATABASE_URL is required/);
      // The specific regression: not merely "it threw", but that it did not
      // hand back the invented localhost url.
      try {
        loadConfig();
        throw new Error('expected configuration() to throw');
      } catch (error) {
        expect((error as Error).message).not.toContain(LOCALHOST_FALLBACK);
        expect((error as Error).message).toContain(appEnv);
      }
    });

    it(`APP_ENV=${appEnv} with DATABASE_URL SET is honoured verbatim`, () => {
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = appEnv;
      process.env.DATABASE_URL = 'postgresql://u:p@db.internal:5432/crave';

      expect(loadConfig().database.url).toBe(
        'postgresql://u:p@db.internal:5432/crave',
      );
    });
  }

  it('dev (a laptop) still gets the localhost fallback when DATABASE_URL is unset', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'dev';
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;

    expect(loadConfig().database.url).toBe(LOCALHOST_FALLBACK);
  });
});
