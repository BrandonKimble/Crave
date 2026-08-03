/**
 * "WHAT DOES THIS GUARD DO TO request.user?" — declared by the guard, checked
 * at boot.
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
 * THREE KINDS, NOT TWO. The predecessor of this file was a BOOLEAN marker,
 * `@BearsRequestUser()`, and it lied by omission: OptionalClerkAuthGuard sets
 * `request.user` only when a token is PRESENT, yet it bore the same
 * unconditional marker as ClerkAuthGuard. The audit read the marker as
 * coverage, so a route guarded solely by the optional guard and lacking
 * `@AllowUnentitled` passed boot — and would 403 every anonymous caller the
 * moment gating flips. "Reachable anonymously" is a property of the ROUTE, and
 * a two-valued marker rounds the middle kind to the dangerous value.
 *
 * So a guard declares one of three effects:
 *   'required' — the request cannot proceed without an authenticated user, and
 *                `request.user` is set. Coverage on its own.
 *   'optional' — a user is attached IF a credential was presented; anonymous
 *                callers pass through. NOT coverage: the route must also say
 *                `@AllowUnentitled()` out loud.
 *   'none'     — sets no user (an operator token, a signature check, a rate
 *                limiter). Not coverage. This is also the DEFAULT for an
 *                unmarked guard, so a forgotten declaration fails boot rather
 *                than passing.
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
 * ownership: what a guard does to `request.user` is a fact about the guard.
 */
const AUTHENTICATION_EFFECT = Symbol.for('crave:guard-authentication-effect');

export type AuthenticationEffectKind = 'required' | 'optional' | 'none';

/**
 * Declare what this guard does to `request.user`. A new auth guard that
 * forgets this is read as 'none' and makes its controllers fail the boot
 * audit — loudly, at startup, with the fix named in the message.
 */
export function AuthenticationEffect(
  effect: AuthenticationEffectKind,
): ClassDecorator {
  return (target) => {
    Object.defineProperty(target, AUTHENTICATION_EFFECT, {
      value: effect,
      enumerable: false,
    });
  };
}

/**
 * Read a guard's declared effect. Accepts both class-valued guards
 * (`@UseGuards(SomeGuard)`) and instance-valued ones (`new SomeGuard()`),
 * which carry the flag on their constructor. Anything undeclared is 'none'.
 */
export function authenticationEffectOf(
  guard: unknown,
): AuthenticationEffectKind {
  if (typeof guard !== 'function' && typeof guard !== 'object') return 'none';
  const own = (guard as Record<symbol, unknown> | null)?.[
    AUTHENTICATION_EFFECT
  ];
  const inherited = (guard as { constructor?: Record<symbol, unknown> })
    ?.constructor?.[AUTHENTICATION_EFFECT];
  const effect = own ?? inherited;
  return effect === 'required' || effect === 'optional' ? effect : 'none';
}
