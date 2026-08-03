import { Injectable, OnApplicationBootstrap, type Type } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ALLOW_UNENTITLED_KEY } from './entitlement-enforcement.interceptor';
import { bearsRequestUser } from './user-bearing-guard';

/** Where Nest stores `@UseGuards` metadata (class and handler level). */
const GUARDS_METADATA = '__guards__';

/**
 * BOOT REFUSES A ROUTE THE PAYWALL WOULD 403.
 *
 * Every registered route is one of two things: it produces a `request.user`
 * (some guard in its stack is marked `@BearsRequestUser`), or it declares
 * itself public (`@AllowUnentitled`). A route that is neither passes the
 * paywall today only because ENTITLEMENT_GATING is not `enforce` — the flip
 * turns it into a 403, and `log` mode cannot warn you, because log mode is
 * the mode where it still works.
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
    const uncovered = this.uncoveredRoutes();
    if (uncovered.length === 0) return;
    throw new Error(
      `Paywall coverage gap — ${uncovered.length} route(s) produce no ` +
        `request.user and are not @AllowUnentitled, so flipping ` +
        `ENTITLEMENT_GATING=enforce would 403 them:\n` +
        uncovered.map((route) => `  - ${route}`).join('\n') +
        `\nFix: add @AllowUnentitled() if the route is public, or a guard ` +
        `marked @BearsRequestUser() if it is not.`,
    );
  }

  /** Exposed for the spec, which proves this can actually go RED. */
  uncoveredRoutes(): string[] {
    const uncovered: string[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const instance: unknown = wrapper.instance;
      const metatype = wrapper.metatype as
        | (Type<unknown> & { name: string })
        | null;
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as object;

      const classGuards = this.guardsOn(metatype);
      const classExempt =
        this.reflector.get<boolean>(ALLOW_UNENTITLED_KEY, metatype) === true;
      const classBearsUser = classGuards.some(bearsRequestUser);

      for (const method of this.scanner.getAllMethodNames(prototype)) {
        const handler = (instance as Record<string, unknown>)[method];
        if (typeof handler !== 'function') continue;
        // Only actual routes — a public helper on a controller is not one.
        if (this.reflector.get('path', handler) === undefined) continue;

        const exempt =
          classExempt ||
          this.reflector.get<boolean>(ALLOW_UNENTITLED_KEY, handler) === true;
        if (exempt) continue;

        const bearsUser =
          classBearsUser || this.guardsOn(handler).some(bearsRequestUser);
        if (!bearsUser) {
          uncovered.push(`${metatype.name}.${method}`);
        }
      }
    }

    return uncovered.sort();
  }

  private guardsOn(target: object): unknown[] {
    const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
    return Array.isArray(guards) ? guards : [];
  }
}
