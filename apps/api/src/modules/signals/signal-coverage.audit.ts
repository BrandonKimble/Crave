import { Injectable, OnApplicationBootstrap, type Type } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { authenticationEffectOf } from '../entitlements/authentication-effect';
import { NO_SIGNAL_KEY, RECORDS_SIGNAL_KEY } from './records-signal.decorator';

/** Where Nest stores `@UseGuards` metadata (class and handler level). */
const GUARDS_METADATA = '__guards__';

/** Where Nest stores a route handler's path (@Get/@Post/... all set it). */
const ROUTE_PATH_METADATA = 'path';

/** Where Nest stores a route handler's HTTP verb. */
const ROUTE_METHOD_METADATA = 'method';

/**
 * Nest's RequestMethod enum values for the verbs that MUTATE user-visible
 * state. Named rather than imported as a bare enum so the intent survives a
 * reader who does not know the enum's numbering.
 */
const MUTATING_METHODS = new Set([
  1, // POST
  2, // PUT
  3, // DELETE
  4, // PATCH
]);

/**
 * BOOT REFUSES A USER ACT THAT SAYS NOTHING ABOUT THE LEDGER.
 *
 * Same shape, and the same reasoning, as PaywallCoverageAudit next door — it
 * reads the DI graph rather than grepping source, and it THROWS rather than
 * logs, because a warning at boot is a warning nobody reads until the incident.
 *
 * A USER-ACT ROUTE is defined structurally, not by taste: a route that MUTATES
 * (POST/PUT/PATCH/DELETE) and BEARS A USER — some guard in its stack declares
 * `@AuthenticationEffect('required')`. That is exactly "a thing a known person
 * did", which is what §3 says the ledger is the record of. A read is not an
 * act by this definition; a webhook bears no user; an operator console is not
 * a user at all — all three fall out of the definition rather than out of an
 * allowlist.
 *
 * THE EXEMPTION IS "BEARS NO AUTHENTICATED USER", NOT "@AllowUnentitled"
 * (D36/F645, rederived 2026-08-03). This audit used to skip any route carrying
 * `@AllowUnentitled` — but that decorator answers a DIFFERENT question: it is
 * a PAYWALL exemption ("must they pay?"), and whether a user must pay has
 * nothing to do with whether the ledger is the record of what they did. The
 * proxy let three authenticated notification mutations (register/unregister a
 * device, mark the feed read) — plus the billing cancel, the account deletion
 * and four profile writes — escape the declaration requirement entirely,
 * silently, forever. The two questions are independent, so only the
 * authentication effect is asked here.
 *
 * See records-signal.decorator.ts for what the declarations mean and for the
 * binding limits of what this proves.
 */
@Injectable()
export class SignalCoverageAudit implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const { undeclared, controllersSeen, actRoutesSeen } = this.audit();

    // NOT VACUOUSLY GREEN — the same property PaywallCoverageAudit protects,
    // for the same reason. Route/verb detection hangs on Nest's internal
    // metadata keys; if a version bump renames one, `undeclared` is empty and
    // boot sails through having checked nothing. A real API process has
    // user-act routes. A script context (createApplicationContext) registers
    // no controllers at all, and silence there is correct.
    if (controllersSeen > 0 && actRoutesSeen === 0) {
      throw new Error(
        `Signal coverage audit inspected ${controllersSeen} controller(s) ` +
          `and found ZERO user-act routes. Route detection is broken (Nest's ` +
          `metadata keys are no longer '${ROUTE_PATH_METADATA}' / ` +
          `'${ROUTE_METHOD_METADATA}'), so this audit is checking nothing. ` +
          `Fix the detection — do not delete this check.`,
      );
    }

    if (undeclared.length === 0) return;
    throw new Error(
      `Signal coverage gap — ${undeclared.length} user-act route(s) declare ` +
        `neither @RecordsSignal(kind) nor @NoSignal(reason), so whether the ` +
        `§3 ledger hears about them is a matter of someone having remembered ` +
        `to write a line:\n` +
        undeclared
          .map(
            (route) =>
              `  - ${route} — Fix: add @RecordsSignal('<kind>') if this act ` +
              `reaches the ledger, or @NoSignal('<why not>') if it ` +
              `deliberately does not.`,
          )
          .join('\n'),
    );
  }

  /** Exposed for the spec, which proves this can actually go RED. */
  undeclaredActRoutes(): string[] {
    return this.audit().undeclared;
  }

  /** Exposed for the spec: every user-act route and what it declares. */
  declarations(): Array<{ route: string; declaration: string }> {
    return this.audit().declared;
  }

  private audit(): {
    undeclared: string[];
    declared: Array<{ route: string; declaration: string }>;
    controllersSeen: number;
    actRoutesSeen: number;
  } {
    const undeclared: string[] = [];
    const declared: Array<{ route: string; declaration: string }> = [];
    let controllersSeen = 0;
    let actRoutesSeen = 0;

    for (const wrapper of this.discovery.getControllers()) {
      const instance: unknown = wrapper.instance;
      const metatype = wrapper.metatype as
        | (Type<unknown> & { name: string })
        | null;
      if (!instance || !metatype) continue;
      controllersSeen += 1;
      const prototype = Object.getPrototypeOf(instance) as object;

      const classGuards = this.guardsOn(metatype);
      const classEffects = classGuards.map(authenticationEffectOf);

      for (const method of this.scanner.getAllMethodNames(prototype)) {
        const handler = (instance as Record<string, unknown>)[method];
        if (typeof handler !== 'function') continue;
        if (this.reflector.get(ROUTE_PATH_METADATA, handler) === undefined) {
          continue;
        }

        const verb = this.reflector.get<number>(ROUTE_METHOD_METADATA, handler);
        if (!MUTATING_METHODS.has(verb)) continue;

        // Not a USER act iff it never carries an authenticated user. (An
        // @AllowUnentitled route guarded by a REQUIRED guard still carries
        // one — see the header: paywall exemption is not act exemption.)
        const effects = [
          ...classEffects,
          ...this.guardsOn(handler).map(authenticationEffectOf),
        ];
        if (!effects.includes('required')) continue;

        actRoutesSeen += 1;
        const route = `${metatype.name}.${method}`;

        const kinds = this.reflector.get<string[]>(RECORDS_SIGNAL_KEY, handler);
        const reason = this.reflector.get<string>(NO_SIGNAL_KEY, handler);
        if (Array.isArray(kinds) && kinds.length > 0) {
          declared.push({ route, declaration: `records:${kinds.join('+')}` });
          continue;
        }
        if (typeof reason === 'string' && reason.trim().length > 0) {
          declared.push({ route, declaration: `none:${reason}` });
          continue;
        }
        undeclared.push(route);
      }
    }

    return {
      undeclared: undeclared.sort((a, b) => a.localeCompare(b)),
      declared: declared.sort((a, b) => a.route.localeCompare(b.route)),
      controllersSeen,
      actRoutesSeen,
    };
  }

  private guardsOn(target: object): unknown[] {
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
    return Array.isArray(guards) ? guards : [];
  }
}
