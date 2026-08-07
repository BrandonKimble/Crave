/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs a
   fresh require() per case: configuration resolves APP_ENV/DATABASE_URL at module load. */
/* eslint-disable no-restricted-syntax -- this spec drives the raw APP_ENV/secret env vars
   it is the test OF; calling the resolver here would test it against itself. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
/**
 * F2075 + F2101 — BOOT-TIME CONFIG VALIDATION FAILS CLOSED IN A DEPLOYED ENV.
 *
 * F2075: a deployed process with a missing boot-critical secret must refuse to
 *   boot, not come up "healthy" and fail later. RED recipe: delete a name from
 *   DEPLOYED_REQUIRED_SECRETS in validate-env.ts and the matching case passes
 *   the missing var silently.
 * F2101: an explicitly-SET loopback DATABASE_URL on a deployed env is a config
 *   error, not a database — getDatabaseUrl throws unless the operator opts in.
 *   RED recipe: drop the loopback branch in configuration.ts's getDatabaseUrl.
 */
import {
  validateEnv,
  DEPLOYED_REQUIRED_SECRETS,
} from '../shared/config/validate-env';

const DEPLOYED = { APP_ENV: 'prod', NODE_ENV: 'production' } as const;

const allSecrets = (): Record<string, string> =>
  Object.fromEntries(
    DEPLOYED_REQUIRED_SECRETS.map((name) => [name, 'set-value']),
  );

describe('validateEnv boot validation (F2075)', () => {
  it('throws when a required secret is missing in a deployed env', () => {
    const env = { ...DEPLOYED, ...allSecrets() } as Record<string, unknown>;
    delete env.JWT_SECRET;
    expect(() => validateEnv(env)).toThrow(/JWT_SECRET/);
  });

  it('throws naming every missing required secret', () => {
    const env = { ...DEPLOYED } as Record<string, unknown>;
    expect(() => validateEnv(env)).toThrow(/SIGNAL_AUDIT_HMAC_KEY/);
  });

  it('treats a blank string as missing', () => {
    const env = {
      ...DEPLOYED,
      ...allSecrets(),
      CLERK_SECRET_KEY: '   ',
    } as Record<string, unknown>;
    expect(() => validateEnv(env)).toThrow(/CLERK_SECRET_KEY/);
  });

  it('passes when every required secret is present in a deployed env', () => {
    const env = { ...DEPLOYED, ...allSecrets() } as Record<string, unknown>;
    expect(() => validateEnv(env)).not.toThrow();
  });

  it('does NOT require the secrets in a local (non-deployed) env', () => {
    const env = { APP_ENV: 'dev', NODE_ENV: 'development' } as Record<
      string,
      unknown
    >;
    expect(() => validateEnv(env)).not.toThrow();
  });
});

describe('getDatabaseUrl rejects a loopback host in a deployed env (F2101)', () => {
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

  it('throws when a deployed env sets a localhost DATABASE_URL', () => {
    process.env.APP_ENV = 'prod';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/crave';
    delete process.env.ALLOW_LOOPBACK_DATABASE_URL;
    expect(() => loadConfig()).toThrow(/loopback host/);
  });

  it('throws for 127.0.0.1 and ::1 too', () => {
    process.env.APP_ENV = 'staging';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:5432/crave';
    expect(() => loadConfig()).toThrow(/loopback host/);
  });

  it('honors the named ALLOW_LOOPBACK_DATABASE_URL owner override', () => {
    process.env.APP_ENV = 'prod';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/crave';
    process.env.ALLOW_LOOPBACK_DATABASE_URL = 'true';
    expect(loadConfig().database.url).toBe(
      'postgresql://postgres:postgres@localhost:5432/crave',
    );
  });

  it('allows a real (non-loopback) host verbatim in a deployed env', () => {
    process.env.APP_ENV = 'prod';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://u:p@db.internal:5432/crave';
    expect(loadConfig().database.url).toBe(
      'postgresql://u:p@db.internal:5432/crave',
    );
  });

  it('allows a localhost DATABASE_URL in a local dev env', () => {
    process.env.APP_ENV = 'dev';
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/crave';
    expect(loadConfig().database.url).toBe(
      'postgresql://postgres:postgres@localhost:5432/crave',
    );
  });
});
