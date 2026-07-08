import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LoggerService } from '../../shared';
import { EntitlementService } from './entitlement.service';

export const ENTITLEMENT_KEY = 'required_entitlement';

/** Mark an endpoint as requiring an active entitlement (default 'premium').
 *  Apply WITH the guard: @UseGuards(RequireEntitlementGuard). Rollout is
 *  staged via ENTITLEMENT_GATING=off|log|enforce (default off) so dev and
 *  dogfooding stay open until the business-model call. */
export const RequireEntitlement = (code = 'premium') =>
  SetMetadata(ENTITLEMENT_KEY, code);

@Injectable()
export class RequireEntitlementGuard implements CanActivate {
  private readonly logger: LoggerService;
  private readonly mode: 'off' | 'log' | 'enforce';

  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RequireEntitlementGuard');
    const mode = process.env.ENTITLEMENT_GATING?.trim().toLowerCase();
    this.mode = mode === 'enforce' || mode === 'log' ? mode : 'off';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.mode === 'off') return true;
    const code = this.reflector.getAllAndOverride<string | undefined>(
      ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!code) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { userId?: string } }>();
    const userId = request.user?.userId;
    if (!userId) {
      // Unauthenticated requests are the auth guard's problem, not ours.
      return true;
    }

    const allowed = await this.entitlements.hasAccess(userId, code);
    if (allowed) return true;

    if (this.mode === 'log') {
      this.logger.info('Entitlement gate WOULD block (log mode)', {
        userId,
        entitlementCode: code,
        handler: context.getHandler().name,
      });
      return true;
    }
    throw new ForbiddenException({
      code: 'ENTITLEMENT_REQUIRED',
      entitlement: code,
    });
  }
}
