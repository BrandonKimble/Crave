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
