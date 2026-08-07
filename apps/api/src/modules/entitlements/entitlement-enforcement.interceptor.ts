import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { LoggerService } from '../../shared';
import { EntitlementService } from './entitlement.service';
import { resolveVerdict } from './access-verdict';
import { readGatingMode } from './entitlement-config';

export const ALLOW_UNENTITLED_KEY = 'allow_unentitled';

/**
 * Exempt a controller/route from the app-wide entitlement wall. The exempt
 * surface under the HARD PAYWALL (decided 2026-07-09) is exactly: auth,
 * identity self-service (profile, onboarding, deletion), public share
 * surfaces, billing (a user must be able to PAY and manage billing while
 * unentitled), webhooks, health, legal, and onboarding support (markets).
 * The FREEMIUM PIVOT is: add this decorator to the free-surface controllers
 * (restaurants/map/polls) — one line per controller, nothing else moves.
 */
export const AllowUnentitled = () => SetMetadata(ALLOW_UNENTITLED_KEY, true);

/**
 * The app-wide paywall (hard-paywall model, 2026-07-09): EVERY authenticated
 * route requires an active entitlement unless @AllowUnentitled.
 *
 * A global INTERCEPTOR, not a global guard, on purpose: global guards run
 * BEFORE controller-level guards, so request.user (attached by
 * ClerkAuthGuard at the controller) would never be visible to a global
 * guard. Interceptors run after all guards — auth state is settled here.
 *
 * Unauthenticated requests pass: routes without auth are either public by
 * design (share links, webhooks with their own auth) or protected by their
 * own guard stack; the wall is an ACCESS wall, not an auth wall.
 *
 * Rollout rides ENTITLEMENT_GATING (off | log | enforce), read per call:
 * log mode records every WOULD-block with route + user so the exempt set is
 * validated against real traffic before enforce is flipped.
 */
@Injectable()
export class EntitlementEnforcementInterceptor implements NestInterceptor {
  private readonly logger: LoggerService;

  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('EntitlementEnforcement');
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const mode = readGatingMode();
    if (mode === 'off' || context.getType() !== 'http') {
      return next.handle();
    }
    const exempt = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNENTITLED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (exempt) {
      return next.handle();
    }
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { userId?: string }; url?: string }>();
    const userId = request.user?.userId;
    if (!userId) {
      // PUBLICNESS IS DECLARED, NEVER INFERRED FROM ABSENCE (red team
      // 2026-08-02). This used to wave through any request with no
      // authenticated user, reasoning "public surface, not this wall's job".
      // But auth here is PER-ROUTE and often OptionalClerkAuthGuard, which
      // sets request.user only when a token is present — so the wall let an
      // ANONYMOUS caller through while 403ing a lapsed subscriber who
      // presented one. Simply omitting the Authorization header was the
      // bypass.
      //
      // The @AllowUnentitled vocabulary above already exists and is carefully
      // applied; it was just never reached, because the absence check ran
      // first. A non-exempt route now requires an entitled AUTHENTICATED
      // user, which is what "behind the paywall" was always meant to mean.
      return this.refuse(context, request, next, mode, null);
    }
    const verdict = await this.entitlements.accessVerdict(userId);

    // THE PAYWALL'S POLICY FOR "DON'T KNOW", STATED OUT LOUD.
    //
    // `allow`. This wall guards the whole product surface, so denying on an
    // entitlement-store outage would lock out every PAYING customer over an
    // infrastructure blip — a worse failure than briefly serving a lapsed one.
    // That is the same conclusion the old fail-open reached, but it is now a
    // DECISION AT A CALL SITE rather than a lie forced by a boolean return,
    // and it is one line to change per surface.
    //
    // `resolveVerdict` leaves the door open for a spend surface to pass `deny`
    // instead (money is not availability), but NO surface does so today — this
    // wall uniformly resolves `allow`. Spend is not protected here: unbounded
    // vendor/LLM cost on an unverified account is guarded by the governance-pool
    // catastrophe backstops in the usage ledger, not by a per-surface `deny` at
    // this layer. If that ever moves here, this is the one line that changes.
    if (resolveVerdict(verdict, 'allow')) {
      return next.handle();
    }
    return this.refuse(context, request, next, mode, userId);
  }

  /**
   * One refusal path for both reasons a caller can fail the wall: no
   * authenticated user at all, or an authenticated user without entitlement.
   * They were two separate outcomes before, which is how one of them ended up
   * silently being "allow".
   */
  private refuse(
    context: ExecutionContext,
    request: { url?: string },
    next: CallHandler,
    mode: 'log' | 'enforce',
    userId: string | null,
  ): Observable<unknown> {
    if (mode === 'log') {
      this.logger.info('Paywall WOULD block (log mode)', {
        userId: userId ?? '(anonymous)',
        reason: userId ? 'not_entitled' : 'unauthenticated',
        url: request.url,
        handler: context.getHandler().name,
      });
      return next.handle();
    }
    throw new ForbiddenException({
      code: 'ENTITLEMENT_REQUIRED',
      // errorCode mirrors the api client's existing response-field convention.
      errorCode: 'ENTITLEMENT_REQUIRED',
      entitlement: this.entitlements.defaultCode,
    });
  }
}
