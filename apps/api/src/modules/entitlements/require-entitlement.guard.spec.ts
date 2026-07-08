/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequireEntitlementGuard } from './require-entitlement.guard';
import type { EntitlementService } from './entitlement.service';
import type { LoggerService } from '../../shared';

const fakeLogger = {
  setContext: () => fakeLogger,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as LoggerService;

function makeGuard(mode: string, hasAccess: boolean, code?: string) {
  process.env.ENTITLEMENT_GATING = mode;
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(code),
  } as unknown as Reflector;
  const entitlements = {
    hasAccess: jest.fn().mockResolvedValue(hasAccess),
  } as unknown as EntitlementService;
  const guard = new RequireEntitlementGuard(
    reflector,
    entitlements,
    fakeLogger,
  );
  const context = {
    getHandler: () => ({ name: 'testHandler' }),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: { userId: 'user-1' } }),
    }),
  } as never;
  return { guard, context, entitlements };
}

afterAll(() => {
  delete process.env.ENTITLEMENT_GATING;
});

describe('RequireEntitlementGuard mode matrix', () => {
  it('off: always allows, never even checks', async () => {
    const { guard, context, entitlements } = makeGuard('off', false, 'premium');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((entitlements.hasAccess as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('log: allows but records the would-block', async () => {
    const { guard, context } = makeGuard('log', false, 'premium');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((fakeLogger.info as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('enforce: blocks without access, allows with', async () => {
    const denied = makeGuard('enforce', false, 'premium');
    await expect(denied.guard.canActivate(denied.context)).rejects.toThrow(
      ForbiddenException,
    );
    const allowed = makeGuard('enforce', true, 'premium');
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(
      true,
    );
  });

  it('enforce: undecorated endpoints pass untouched', async () => {
    const { guard, context, entitlements } = makeGuard(
      'enforce',
      false,
      undefined,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((entitlements.hasAccess as jest.Mock).mock.calls).toHaveLength(0);
  });
});
