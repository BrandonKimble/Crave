/**
 * "THIS GUARD POPULATES request.user" — declared by the guard, checked at boot.
 *
 * The paywall interceptor blocks any request that reaches a non-exempt route
 * without a `request.user`. So a controller whose guard stack never sets one,
 * and which carries no `@AllowUnentitled`, is a 403 waiting for someone to
 * flip ENTITLEMENT_GATING to `enforce`. Two such controllers existed and were
 * found only by a human reading: the ops dashboard (OpsTokenGuard
 * authenticates an OPERATOR and sets no user) and the root route. Flipping
 * enforce would have 403'd the incident console at the moment you reached for
 * it — and `log` mode cannot warn you, because log mode is the mode where it
 * still works.
 *
 * A test used to walk the tree for `*.controller.ts` and grep each file for
 * the guard NAMES. That reads the source, not the app: it cannot see a
 * controller registered outside the directories it walks, a guard applied via
 * `APP_GUARD`, or a route added to a dynamic module. The boot audit reads the
 * DI graph instead, and refuses to start rather than reporting later.
 *
 * The marker lives HERE, in entitlements, and the guards import it — never the
 * reverse. Identity already depends on entitlements; a list of guard classes
 * inside entitlements would close that cycle. It is also the more honest
 * ownership: whether a guard sets `request.user` is a fact about the guard.
 */
const BEARS_REQUEST_USER = Symbol.for('crave:guard-bears-request-user');

/**
 * Mark a guard as one that attaches `request.user` on success. A new auth
 * guard that forgets this makes its controllers fail the boot audit — loudly,
 * at startup, with the fix named in the message.
 */
export function BearsRequestUser(): ClassDecorator {
  return (target) => {
    Object.defineProperty(target, BEARS_REQUEST_USER, {
      value: true,
      enumerable: false,
    });
  };
}

export function bearsRequestUser(guard: unknown): boolean {
  if (typeof guard !== 'function' && typeof guard !== 'object') return false;
  return (
    (guard as Record<symbol, unknown> | null)?.[BEARS_REQUEST_USER] === true ||
    // Instance-valued guards (`new SomeGuard()` in @UseGuards) carry the flag
    // on their constructor.
    (guard as { constructor?: Record<symbol, unknown> })?.constructor?.[
      BEARS_REQUEST_USER
    ] === true
  );
}
