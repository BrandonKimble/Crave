import {
  NotFoundException,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { OpsTokenGuard } from './ops-token.guard';

/**
 * §18.4 auth: absent OPS_DASH_TOKEN -> 404 (the dashboard is OFF, not
 * merely unauth'd); present env + wrong/missing token -> 401; present env
 * + matching token (x-ops-token header ONLY — the ?token= branch was removed by the
 * final-final red team #7 security fix; URL tokens leak into logs) ->
 * admits.
 */

function buildContext(
  query: Record<string, string>,
  headers: Record<string, string>,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ query, headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('OpsTokenGuard', () => {
  const original = process.env.OPS_DASH_TOKEN;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.OPS_DASH_TOKEN;
    } else {
      process.env.OPS_DASH_TOKEN = original;
    }
  });

  it('404s every route when OPS_DASH_TOKEN is unset (the dashboard is OFF)', () => {
    delete process.env.OPS_DASH_TOKEN;
    const guard = new OpsTokenGuard();
    expect(() => guard.canActivate(buildContext({}, {}))).toThrow(
      NotFoundException,
    );
  });

  it('401s a missing token when the env IS set', () => {
    process.env.OPS_DASH_TOKEN = 'secret-token';
    const guard = new OpsTokenGuard();
    expect(() => guard.canActivate(buildContext({}, {}))).toThrow(
      UnauthorizedException,
    );
  });

  it('401s a wrong token', () => {
    process.env.OPS_DASH_TOKEN = 'secret-token';
    const guard = new OpsTokenGuard();
    expect(() =>
      guard.canActivate(buildContext({ token: 'wrong' }, {})),
    ).toThrow(UnauthorizedException);
  });

  // THE COMPARISON ITSELF (added 2026-08-02, mutation-proven). Every other
  // case in this file supplies the token via `query`, which a header-only
  // guard ignores — so they all exercise the SAME branch: "no x-ops-token
  // header". With no wrong-HEADER case, the suite passed 5/5 against a mutant
  // whose constantTimeEquals returned `true` unconditionally: any header value
  // at all would have opened the owner's incident console. These two assert
  // that the value is actually compared.
  it('401s a WRONG x-ops-token header (not merely a missing one)', () => {
    process.env.OPS_DASH_TOKEN = 'secret-token';
    const guard = new OpsTokenGuard();
    expect(() =>
      guard.canActivate(buildContext({}, { 'x-ops-token': 'wrong-token' })),
    ).toThrow(UnauthorizedException);
  });

  it('401s an x-ops-token header that is a PREFIX of the secret', () => {
    process.env.OPS_DASH_TOKEN = 'secret-token';
    const guard = new OpsTokenGuard();
    expect(() =>
      guard.canActivate(buildContext({}, { 'x-ops-token': 'secret' })),
    ).toThrow(UnauthorizedException);
  });

  it('REFUSES a matching ?token= query param (URL tokens leak into logs)', () => {
    process.env.OPS_DASH_TOKEN = 'secret-token';
    const guard = new OpsTokenGuard();
    expect(() =>
      guard.canActivate(buildContext({ token: 'secret-token' }, {})),
    ).toThrow(UnauthorizedException);
  });

  it('admits a matching x-ops-token header', () => {
    process.env.OPS_DASH_TOKEN = 'secret-token';
    const guard = new OpsTokenGuard();
    expect(
      guard.canActivate(buildContext({}, { 'x-ops-token': 'secret-token' })),
    ).toBe(true);
  });
});
