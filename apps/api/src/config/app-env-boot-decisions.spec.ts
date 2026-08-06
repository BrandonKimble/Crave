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
    delete process.env.DATABASE_CONNECTION_POOL_MAX;

    const config = loadConfig();

    expect(config.database.connectionPool.max).toBe(25);
    expect(config.database.connectionPool.max).not.toBe(50);
  });

  it('real production (APP_ENV=prod, NODE_ENV=production) still gets the 50-connection pool', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'prod';
    delete process.env.DATABASE_CONNECTION_POOL_MAX;

    const config = loadConfig();

    expect(config.database.connectionPool.max).toBe(50);
  });

  it('staging Cloudinary assets default to the staging namespace, not "dev"', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';
    delete process.env.CLOUDINARY_ENV_PREFIX;

    const config = loadConfig();

    expect(config.cloudinary.envPrefix).toBe('staging');
    expect(config.cloudinary.envPrefix).not.toBe('dev');
  });
});
