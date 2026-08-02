import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { EntitlementEnforcementInterceptor } from './entitlement-enforcement.interceptor';

// PUBLICNESS IS DECLARED, NEVER INFERRED FROM ABSENCE.
//
// The wall used to wave through any request with no authenticated user,
// reasoning "public surface, not this wall's job". But auth here is PER-ROUTE
// and often OptionalClerkAuthGuard, which sets request.user only when a token
// is present. So the paywall let an ANONYMOUS caller through while 403ing a
// lapsed subscriber who presented a token: omitting the Authorization header
// WAS the bypass. `@AllowUnentitled` already existed and was carefully
// applied; the absence check simply ran first and it was never reached.

const HANDLER = function getThing() {};

function contextFor(user: { userId?: string } | undefined): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => HANDLER,
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ user, url: '/api/v1/thing' }),
    }),
  } as unknown as ExecutionContext;
}

function build(options: { exempt: boolean; entitled: boolean }) {
  const handled = { called: false };
  const next = {
    handle: () => {
      handled.called = true;
      return of('body');
    },
  };
  const interceptor = new EntitlementEnforcementInterceptor(
    {
      getAllAndOverride: () => options.exempt,
    } as never,
    {
      hasAccess: jest.fn().mockResolvedValue(options.entitled),
      defaultCode: 'crave_plus',
    } as never,
    {
      setContext: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    } as never,
  );
  return { interceptor, next, handled };
}

describe('paywall: enforce mode', () => {
  const saved = process.env.ENTITLEMENT_GATING;
  beforeEach(() => {
    process.env.ENTITLEMENT_GATING = 'enforce';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ENTITLEMENT_GATING;
    else process.env.ENTITLEMENT_GATING = saved;
  });

  it('REFUSES an anonymous caller on a non-exempt route — the bypass', async () => {
    const { interceptor, next, handled } = build({
      exempt: false,
      entitled: true,
    });
    await expect(
      interceptor.intercept(contextFor(undefined), next as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(handled.called).toBe(false);
  });

  it('allows an anonymous caller on a route that DECLARES itself public', async () => {
    const { interceptor, next } = build({ exempt: true, entitled: false });
    const result = await interceptor.intercept(
      contextFor(undefined),
      next as never,
    );
    await expect(firstValueFrom(result)).resolves.toBe('body');
  });

  it('refuses an authenticated user without entitlement', async () => {
    const { interceptor, next } = build({ exempt: false, entitled: false });
    await expect(
      interceptor.intercept(contextFor({ userId: 'u1' }), next as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an entitled user', async () => {
    const { interceptor, next } = build({ exempt: false, entitled: true });
    const result = await interceptor.intercept(
      contextFor({ userId: 'u1' }),
      next as never,
    );
    await expect(firstValueFrom(result)).resolves.toBe('body');
  });
});

describe('paywall: log mode reports what enforce WOULD do', () => {
  const saved = process.env.ENTITLEMENT_GATING;
  beforeEach(() => {
    process.env.ENTITLEMENT_GATING = 'log';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ENTITLEMENT_GATING;
    else process.env.ENTITLEMENT_GATING = saved;
  });

  it('an anonymous caller passes through but is REPORTED — otherwise log mode', async () => {
    // ...cannot be used to validate the exempt set before flipping to
    // enforce, which is the only reason log mode exists.
    const { interceptor, next, handled } = build({
      exempt: false,
      entitled: true,
    });
    const result = await interceptor.intercept(
      contextFor(undefined),
      next as never,
    );
    await expect(firstValueFrom(result)).resolves.toBe('body');
    expect(handled.called).toBe(true);
  });
});

describe('paywall: off mode touches nothing', () => {
  const saved = process.env.ENTITLEMENT_GATING;
  afterEach(() => {
    if (saved === undefined) delete process.env.ENTITLEMENT_GATING;
    else process.env.ENTITLEMENT_GATING = saved;
  });

  it('passes every caller through when gating is off', async () => {
    delete process.env.ENTITLEMENT_GATING;
    const { interceptor, next } = build({ exempt: false, entitled: false });
    const result = await interceptor.intercept(
      contextFor(undefined),
      next as never,
    );
    await expect(firstValueFrom(result)).resolves.toBe('body');
  });
});
