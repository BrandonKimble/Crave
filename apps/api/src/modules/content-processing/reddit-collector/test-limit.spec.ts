/* eslint-disable no-restricted-syntax -- this spec TESTS the env
   resolution itself; writing process.env.APP_ENV in a jest sandbox is
   the subject under test, not a second spelling in production code. */
import { resolveTestLimit } from './test-limit';

/**
 * F455: the TEST_* truncation levers must REFUSE in prod (a stray cap there is
 * silent, permanent collection loss). Every assertion can show RED — it did,
 * against the three inline parsers that had no isProdEnv guard.
 */
describe('resolveTestLimit (F455)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function setEnv(appEnv: string, value?: string) {
    delete process.env.CRAVE_ENV;
    delete process.env.NODE_ENV;
    process.env.APP_ENV = appEnv;
    if (value === undefined) delete process.env.TEST_X;
    else process.env.TEST_X = value;
  }

  it('returns the parsed value in a dev environment', () => {
    setEnv('dev', '25');
    expect(resolveTestLimit('TEST_X')).toBe(25);
  });

  it('clamps to the cap in dev', () => {
    setEnv('dev', '5000');
    expect(resolveTestLimit('TEST_X', 1000)).toBe(1000);
  });

  it('REFUSES in prod — returns null even when the lever is set', () => {
    setEnv('prod', '25');
    expect(resolveTestLimit('TEST_X')).toBeNull();
  });

  it('REFUSES when NODE_ENV=production and no APP_ENV', () => {
    delete process.env.APP_ENV;
    delete process.env.CRAVE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.TEST_X = '25';
    expect(resolveTestLimit('TEST_X')).toBeNull();
  });

  it('returns null when unset or unparseable', () => {
    setEnv('dev', undefined);
    expect(resolveTestLimit('TEST_X')).toBeNull();
    setEnv('dev', 'not-a-number');
    expect(resolveTestLimit('TEST_X')).toBeNull();
  });
});
