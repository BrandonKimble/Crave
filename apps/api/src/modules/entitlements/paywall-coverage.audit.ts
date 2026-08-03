import { Injectable, OnApplicationBootstrap, type Type } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ALLOW_UNENTITLED_KEY } from './entitlement-enforcement.interceptor';
import { authenticationEffectOf } from './authentication-effect';

/** Where Nest stores `@UseGuards` metadata (class and handler level). */
const GUARDS_METADATA = '__guards__';

/** Where Nest stores a route handler's path (@Get/@Post/... all set it). */
const ROUTE_PATH_METADATA = 'path';

/**
 * BOOT REFUSES A ROUTE THE PAYWALL WOULD 403.
 *
 * Every registered route is one of two things: it ALWAYS produces a
 * `request.user` (some guard in its stack declares
 * `@AuthenticationEffect('required')`), or it declares itself public
 * (`@AllowUnentitled`). A route that is neither passes the paywall today only
 * because ENTITLEMENT_GATING is not `enforce` — the flip turns it into a 403,
 * and `log` mode cannot warn you, because log mode is the mode where it still
 * works.
 *
 * A guard whose effect is 'optional' is NOT coverage: it attaches a user only
 * when a credential was presented, so the route is reachable anonymously and
 * must say so with `@AllowUnentitled()`. See authentication-effect.ts for the
 * boolean marker this replaced and the gap it hid.
 *
 * This replaced a Jest spec that walked the tree for `*.controller.ts` and
 * grepped for guard names. See user-bearing-guard.ts for why reading the DI
 * graph is not the same check written twice: the scanner could only see files
 * in the directories it walked, spelled the way it expected.
 *
 * It throws rather than logs. A warning at boot is a warning nobody reads
 * until the incident, and the failure this prevents IS the incident console.
 */
@Injectable()
export class PaywallCoverageAudit implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const { uncovered, controllersSeen, routesSeen } = this.audit();

    // NOT VACUOUSLY GREEN.
    //
    // The Jest scanner this replaced asserted it had found more than ten
    // controller FILES, precisely so a walk that silently matched nothing
    // could not pass every other assertion. The first version of this audit
    // dropped that property: route detection hangs on Nest's internal 'path'
    // metadata key, and if a version bump renames it, `uncovered` is empty
    // and boot sails through having checked nothing.
    //
    // Controllers with zero routes between them is not a real app. Zero
    // CONTROLLERS is, though — `createApplicationContext` (every script in
    // scripts/) registers none, and silence there is the right answer rather
    // than a false alarm.
    if (controllersSeen > 0 && routesSeen === 0) {
      throw new Error(
        `Paywall coverage audit inspected ${controllersSeen} controller(s) ` +
          `and found ZERO routes. Route detection is broken (Nest's route ` +
          `metadata key is no longer '${ROUTE_PATH_METADATA}'), so this ` +
          `audit is checking nothing. Fix the detection — do not delete ` +
          `this check.`,
      );
    }

    if (uncovered.length === 0) return;
    throw new Error(
      `Paywall coverage gap — ${uncovered.length} route(s) may reach the ` +
        `paywall with no request.user and are not @AllowUnentitled, so ` +
        `flipping ENTITLEMENT_GATING=enforce would 403 them:\n` +
        uncovered
          .map(
            ({ route, effect }) =>
              `  - ${route} — ${
                effect === 'optional'
                  ? `its only auth guard is @AuthenticationEffect('optional'), ` +
                    `which admits anonymous callers. Fix: add @AllowUnentitled().`
                  : `no guard declares @AuthenticationEffect('required'). ` +
                    `Fix: add @AllowUnentitled() if the route is public, or a ` +
                    `guard declaring 'required' if it is not.`
              }`,
          )
          .join('\n'),
    );
  }

  /** Exposed for the spec, which proves this can actually go RED. */
  uncoveredRoutes(): string[] {
    return this.audit().uncovered.map(({ route }) => route);
  }

  private audit(): {
    uncovered: Array<{ route: string; effect: 'optional' | 'none' }>;
    controllersSeen: number;
    routesSeen: number;
  } {
    const uncovered: Array<{ route: string; effect: 'optional' | 'none' }> = [];
    let controllersSeen = 0;
    let routesSeen = 0;

    for (const wrapper of this.discovery.getControllers()) {
      const instance: unknown = wrapper.instance;
      const metatype = wrapper.metatype as
        | (Type<unknown> & { name: string })
        | null;
      if (!instance || !metatype) continue;
      controllersSeen += 1;
      const prototype = Object.getPrototypeOf(instance) as object;

      const classGuards = this.guardsOn(metatype);
      const classExempt =
        this.reflector.get<boolean>(ALLOW_UNENTITLED_KEY, metatype) === true;
      const classEffects = classGuards.map(authenticationEffectOf);

      for (const method of this.scanner.getAllMethodNames(prototype)) {
        const handler = (instance as Record<string, unknown>)[method];
        if (typeof handler !== 'function') continue;
        // Only actual routes — a public helper on a controller is not one.
        if (this.reflector.get(ROUTE_PATH_METADATA, handler) === undefined) {
          continue;
        }
        routesSeen += 1;

        const exempt =
          classExempt ||
          this.reflector.get<boolean>(ALLOW_UNENTITLED_KEY, handler) === true;
        if (exempt) continue;

        const effects = [
          ...classEffects,
          ...this.guardsOn(handler).map(authenticationEffectOf),
        ];
        if (effects.includes('required')) continue;
        uncovered.push({
          route: `${metatype.name}.${method}`,
          effect: effects.includes('optional') ? 'optional' : 'none',
        });
      }
    }

    return {
      uncovered: uncovered.sort((a, b) => a.route.localeCompare(b.route)),
      controllersSeen,
      routesSeen,
    };
  }

  private guardsOn(target: object): unknown[] {
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
    return Array.isArray(guards) ? guards : [];
  }
}
