import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import {
  ALLOW_UNENTITLED_KEY,
  EntitlementEnforcementInterceptor,
} from './entitlement-enforcement.interceptor';

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

function build(options: {
  exempt: boolean;
  entitled: boolean;
  entitledUserId?: string;
}) {
  const handled = { called: false };
  // THE VIEWER IS THE ARGUMENT UNDER TEST (F2182). A verdict double that
  // answers ANY user id identically cannot tell "asked about the caller" from
  // "asked about somebody else": with one, hardcoding a foreign id at the call
  // site left all seven specs green — a cross-user entitlement read. This fake
  // grants exactly one subject.
  const subject = options.entitledUserId ?? 'u1';
  const accessVerdict = jest.fn((userId: string) =>
    Promise.resolve(
      options.entitled && userId === subject
        ? { kind: 'granted', entitlementCode: 'crave_plus' }
        : { kind: 'denied', reason: 'no_grant' },
    ),
  );
  const next = {
    handle: () => {
      handled.called = true;
      return of('body');
    },
  };
  // THE EXEMPTION VOCABULARY IS THE ARGUMENT UNDER TEST (F4922). This used
  // to be `getAllAndOverride: () => options.exempt`, answering ANY metadata
  // key and ANY target list. `@AllowUnentitled` is the entire exemption
  // mechanism, so decoupling the interceptor's lookup key from the
  // decorator's left all 41 specs green while, in production, EVERY exempt
  // route starts 403ing — including billing, which the interceptor's own
  // comment says a user must reach while unentitled in order to pay. A
  // lapsed subscriber could then never resubscribe. This reflector answers
  // only for the real key, and only when the lookup includes the route
  // handler (a class-only lookup would miss method-level decorators).
  const reflectorLookups: Array<{ key: string; targets: unknown[] }> = [];
  const getAllAndOverride = jest.fn((key: string, targets: unknown[]) => {
    reflectorLookups.push({ key, targets });
    if (key !== ALLOW_UNENTITLED_KEY) {
      return undefined;
    }
    if (!targets.includes(HANDLER)) {
      return undefined;
    }
    return options.exempt;
  });
  const interceptor = new EntitlementEnforcementInterceptor(
    {
      getAllAndOverride,
    } as never,
    {
      accessVerdict,
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
  return {
    interceptor,
    next,
    handled,
    accessVerdict,
    getAllAndOverride,
    reflectorLookups,
  };
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

  it("the exemption is looked up under @AllowUnentitled's OWN key, against handler AND class", async () => {
    // The decorator and the interceptor read one exported symbol
    // (ALLOW_UNENTITLED_KEY), so the failure mode that remains is a wrong
    // lookup: a different key, or a target list that omits the handler and
    // therefore misses every method-level decorator. Both are asserted here
    // because both silently 403 the whole exempt surface, billing included.
    const { interceptor, next, reflectorLookups, getAllAndOverride } = build({
      exempt: true,
      entitled: false,
    });
    await interceptor.intercept(contextFor(undefined), next as never);
    expect(getAllAndOverride).toHaveBeenCalledTimes(1);
    expect(reflectorLookups[0].key).toBe(ALLOW_UNENTITLED_KEY);
    expect(ALLOW_UNENTITLED_KEY).toBe('allow_unentitled');
    expect(reflectorLookups[0].targets).toContain(HANDLER);
    expect(reflectorLookups[0].targets).toHaveLength(2);
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

  it('an INDETERMINATE verdict allows here — the wall guards availability, and says so', async () => {
    // The paywall's chosen policy for "don't know" is `allow`: denying on an
    // entitlement-store outage would lock out every PAYING customer over an
    // infrastructure blip. Same outcome as the old fail-open, but now a
    // decision at a call site rather than a lie forced by a boolean return —
    // and one line to flip per surface. Anything that SPENDS must choose deny.
    const { interceptor, next } = build({ exempt: false, entitled: false });
    (
      interceptor as unknown as {
        entitlements: { accessVerdict: jest.Mock };
      }
    ).entitlements.accessVerdict.mockResolvedValue({
      kind: 'indeterminate',
      cause: 'store_unavailable',
      message: 'redis down',
    });
    const result = await interceptor.intercept(
      contextFor({ userId: 'u1' }),
      next as never,
    );
    await expect(firstValueFrom(result)).resolves.toBe('body');
  });

  it('allows an entitled user', async () => {
    const { interceptor, next, accessVerdict } = build({
      exempt: false,
      entitled: true,
    });
    const result = await interceptor.intercept(
      contextFor({ userId: 'u1' }),
      next as never,
    );
    await expect(firstValueFrom(result)).resolves.toBe('body');
    // Asked about THE CALLER, not about whoever the call site happened to name.
    expect(accessVerdict).toHaveBeenCalledWith('u1');
  });

  it("never spends ANOTHER user's grant — the verdict is scoped to the caller", async () => {
    const { interceptor, next, accessVerdict } = build({
      exempt: false,
      entitled: true,
      entitledUserId: 'u1',
    });
    await expect(
      interceptor.intercept(contextFor({ userId: 'u2' }), next as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accessVerdict).toHaveBeenCalledWith('u2');
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
