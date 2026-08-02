import { isEnvFlagEnabled } from './env-flag';
import { normalizeAppEnv, isProdEnv, isDeployedEnv } from './app-env';
import { readSpendCapUsd } from '../../modules/external-integrations/governance/governance.service';

// Three env-parsing defects, all found 2026-08-02, all of the same family:
// a plausible value silently means something other than what was typed.

describe('boolean env flags', () => {
  it('TRUE and True are ON — the case split that desynchronized the collector', () => {
    // COLLECTION_SCHEDULER_ENABLED had two readers: one lowercased, one did
    // `=== 'true'`. With `TRUE`, the pacer dispatched collection while Reddit
    // credential validation was skipped. One switch, two answers.
    for (const raw of ['true', 'TRUE', 'True', ' true ', '1', 'yes', 'on']) {
      expect({ raw, on: isEnvFlagEnabled(raw) }).toEqual({ raw, on: true });
    }
  });

  it('every off-spelling is OFF', () => {
    for (const raw of ['false', 'FALSE', '0', 'no', 'off', '', '   ']) {
      expect({ raw, on: isEnvFlagEnabled(raw) }).toEqual({ raw, on: false });
    }
  });

  it('an unrecognized value is OFF, never a silent yes', () => {
    expect(isEnvFlagEnabled('enabled')).toBe(false);
    expect(isEnvFlagEnabled('maybe')).toBe(false);
  });

  it('only ABSENT falls back', () => {
    expect(isEnvFlagEnabled(undefined, true)).toBe(true);
    expect(isEnvFlagEnabled('false', true)).toBe(false);
  });
});

describe('spend caps', () => {
  it('ZERO means zero — it is how an owner halts spend', () => {
    // `Number(env || '300')` turned a deliberate 0 into a $300 live budget:
    // the exact opposite of the instruction, discovered only by the next bill.
    expect(readSpendCapUsd('0', 300)).toBe(0);
  });

  it('absent or unparseable falls back; junk suffixes do NOT parse', () => {
    expect(readSpendCapUsd(undefined, 300)).toBe(300);
    expect(readSpendCapUsd('   ', 300)).toBe(300);
    expect(readSpendCapUsd('abc', 300)).toBe(300);
    // parseFloat would have accepted this as 200.
    expect(readSpendCapUsd('200usd', 300)).toBe(300);
  });

  it('a real value is honored', () => {
    expect(readSpendCapUsd('200', 300)).toBe(200);
    expect(readSpendCapUsd('12.5', 300)).toBe(12.5);
  });
});

describe('app environment', () => {
  it('staging is its own environment, not a spelling of prod', () => {
    expect(normalizeAppEnv('staging')).toBe('staging');
    expect(isProdEnv('staging')).toBe(false);
    expect(isDeployedEnv('staging')).toBe(true);
  });

  it('prod answers YES to both questions', () => {
    for (const raw of ['prod', 'production', 'PROD']) {
      expect(normalizeAppEnv(raw)).toBe('prod');
    }
    expect(isProdEnv('prod')).toBe(true);
    expect(isDeployedEnv('prod')).toBe(true);
  });

  it('dev is deployed-NO, so a laptop can never be mistaken for infrastructure', () => {
    expect(normalizeAppEnv(undefined)).toBe('dev');
    expect(normalizeAppEnv('anything-else')).toBe('dev');
    expect(isProdEnv('dev')).toBe(false);
    expect(isDeployedEnv('dev')).toBe(false);
  });

  it('normalizes the spellings that used to fork Redis key namespaces', () => {
    // Readers disagreed on whether APP_ENV=production normalized to `prod`.
    // These strings become Redis prefixes, so two spellings meant two disjoint
    // rate-limit windows and a silently doubled global ceiling.
    expect(normalizeAppEnv('production')).toBe(normalizeAppEnv('prod'));
    expect(normalizeAppEnv('development')).toBe(normalizeAppEnv('dev'));
    expect(normalizeAppEnv('STAGING')).toBe(normalizeAppEnv('stage'));
  });
});
