import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import {
  readDefaultEntitlementCode,
  readGatingMode,
} from './entitlement-config';

const SRC = path.resolve(__dirname, '../../..', 'src');

/** Every non-spec .ts under src/ containing the literal pattern. */
function filesMatching(pattern: string): string[] {
  let out = '';
  try {
    out = execFileSync('grep', ['-rlF', '--include=*.ts', '-e', pattern, SRC], {
      encoding: 'utf8',
    });
  } catch {
    out = ''; // grep exits 1 on no match
  }
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.endsWith('.spec.ts'))
    .map((f) => path.relative(SRC, f))
    .sort();
}

describe('one home for the paywall constants (LOCKDOWN)', () => {
  it("the 'premium' default literal is declared in config and NOWHERE else", () => {
    // It used to be written FOUR times: configuration.ts plus a `|| 'premium'`
    // re-default in entitlement.service, billing.service and user.service.
    // Changing the config fallback left three services disagreeing.
    expect(filesMatching("BILLING_DEFAULT_ENTITLEMENT || 'premium'")).toEqual([
      'config/configuration.ts',
    ]);
    expect(filesMatching("billing.defaultEntitlement') || 'premium'")).toEqual(
      [],
    );
  });

  it('ENTITLEMENT_GATING is parsed in exactly one file', () => {
    // The interceptor and user.service each parsed it independently, so the
    // client's `access.enforced` and the server's actual behaviour could drift.
    expect(filesMatching('ENTITLEMENT_GATING?.trim')).toEqual([
      'modules/entitlements/entitlement-config.ts',
    ]);
  });
});

describe('readGatingMode', () => {
  const original = process.env.ENTITLEMENT_GATING;
  afterEach(() => {
    if (original === undefined) delete process.env.ENTITLEMENT_GATING;
    else process.env.ENTITLEMENT_GATING = original;
  });

  it('reads the three modes, trimmed and case-insensitive', () => {
    process.env.ENTITLEMENT_GATING = ' Enforce ';
    expect(readGatingMode()).toBe('enforce');
    process.env.ENTITLEMENT_GATING = 'LOG';
    expect(readGatingMode()).toBe('log');
    process.env.ENTITLEMENT_GATING = 'off';
    expect(readGatingMode()).toBe('off');
  });

  it('anything unrecognised is off, the safe end', () => {
    process.env.ENTITLEMENT_GATING = 'enfroce';
    expect(readGatingMode()).toBe('off');
    delete process.env.ENTITLEMENT_GATING;
    expect(readGatingMode()).toBe('off');
  });
});

describe('readDefaultEntitlementCode', () => {
  const config = (value?: string) => ({ get: () => value }) as never;

  it('returns the configured code, byte-identical', () => {
    expect(readDefaultEntitlementCode(config('premium'))).toBe('premium');
  });

  it('REFUSES rather than guessing when config is misassembled', () => {
    expect(() => readDefaultEntitlementCode(config(undefined))).toThrow(
      /billing.defaultEntitlement is not configured/,
    );
    expect(() => readDefaultEntitlementCode(config('  '))).toThrow();
  });
});
