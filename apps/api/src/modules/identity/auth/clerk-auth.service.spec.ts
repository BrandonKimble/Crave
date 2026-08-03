import { UnauthorizedException } from '@nestjs/common';
import {
  ClerkAuthService,
  normalizeAudienceClaim,
  parseAudienceList,
} from './clerk-auth.service';

function makeService(config: Record<string, string | undefined>) {
  return new ClerkAuthService({
    get: (key: string) => config[key],
  } as never);
}

describe('CLERK_JWT_AUDIENCE parsing', () => {
  it('is a comma-separated list, trimmed', () => {
    expect(parseAudienceList(' a , b,c ')).toEqual(['a', 'b', 'c']);
  });

  it('unset or empty is an EMPTY list, not a silent pass', () => {
    expect(parseAudienceList(undefined)).toEqual([]);
    expect(parseAudienceList('')).toEqual([]);
    expect(parseAudienceList('  ,  ')).toEqual([]);
  });

  it('an aud claim is a string or an array of strings — nothing else', () => {
    expect(normalizeAudienceClaim('crave')).toEqual(['crave']);
    expect(normalizeAudienceClaim([' a ', 'b'])).toEqual(['a', 'b']);
    expect(normalizeAudienceClaim(undefined)).toEqual([]);
    expect(normalizeAudienceClaim(42)).toEqual([]);
    expect(normalizeAudienceClaim({ aud: 'x' })).toEqual([]);
  });
});

describe('unconfigured audience REFUSES', () => {
  it('a deployed environment refuses to BOOT', () => {
    expect(() =>
      makeService({ appEnv: 'staging', 'clerk.secretKey': 'sk' }),
    ).toThrow(/CLERK_JWT_AUDIENCE is not configured/);
    expect(() =>
      makeService({ appEnv: 'prod', 'clerk.secretKey': 'sk' }),
    ).toThrow(/CLERK_JWT_AUDIENCE is not configured/);
  });

  it('RED — locally it boots, but every token is REFUSED (never skipped)', async () => {
    // THE DEFECT: the old branch logged "skipping audience validation" and
    // verified tokens with no audience check at all — absence granting
    // access, in the file that states the opposite law for its dev token.
    const service = makeService({ appEnv: 'dev', 'clerk.secretKey': 'sk' });
    await expect(service.verifyToken('some.jwt.token')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.verifyToken('some.jwt.token')).rejects.toThrow(
      /audience is not configured/,
    );
  });

  it('a configured audience boots in every environment', () => {
    expect(() =>
      makeService({
        appEnv: 'prod',
        'clerk.secretKey': 'sk',
        'clerk.jwtAudience': 'crave-api',
      }),
    ).not.toThrow();
  });
});
