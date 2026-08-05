import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../../shared';
import { ClerkAuthService, type ClerkJwtClaims } from './clerk-auth.service';
import { UserService } from '../user.service';
import { UserDevicesService } from '../user-devices.service';
import { AuthenticationEffect } from '../../entitlements/authentication-effect';

export const ALLOW_DELETED_ACCOUNT_KEY = 'allowDeletedAccount';

/**
 * Reachable by an account inside its deletion grace window.
 *
 * Exactly ONE route wants this — the explicit restore. Everything else must be
 * refused: a deleted account is closed, and "closed" has to mean the API
 * declines, not merely that the UI hides it.
 */
export const AllowDeletedAccount = () =>
  SetMetadata(ALLOW_DELETED_ACCOUNT_KEY, true);

@Injectable()
@AuthenticationEffect('required')
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly clerkAuthService: ClerkAuthService,
    private readonly userService: UserService,
    private readonly userDevices: UserDevicesService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.clerkAuthService.extractBearerToken(
      request.headers?.authorization,
    );
    const claims: ClerkJwtClaims =
      await this.clerkAuthService.verifyToken(token);
    const user = await this.userService.syncFromClerkClaims(claims);

    // A DELETED ACCOUNT IS CLOSED — the API refuses it.
    //
    // Two defects lived here, and the second was mine. (1) Nothing anywhere
    // checked `deletedAt`, so a session that outlived the deletion request had
    // FULL access to a "deleted" account — and I justified best-effort session
    // revocation with a comment claiming every route already refused such a
    // user, which was simply untrue. (2) Worse, the sync above used to clear
    // `deletedAt`, so ANY request — a background refresh, a retry, a stale
    // in-flight call — silently UN-deleted the account. Restore has to be an
    // intentional act by a person, not a side effect of traffic.
    //
    // The client distinguishes this from an ordinary 403 by the code and can
    // offer "Restore account"; `purgeDueAt` tells it how long is left.
    if (
      user.deletedAt &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_DELETED_ACCOUNT_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      // `errorCode`, not `code`: that is the field the client's closed
      // failure-policy vocabulary reads (api-failure-policy.ts), the same one
      // ENTITLEMENT_REQUIRED uses. A payload the policy cannot see would have
      // degraded into a generic "something went wrong" with no way back.
      throw new ForbiddenException({
        errorCode: 'ACCOUNT_DELETED',
        message: 'This account has been deleted.',
        purgeDueAt: user.purgeDueAt?.toISOString() ?? null,
      });
    }

    request.user = user;
    // Vote-integrity device observation (plans/vote-integrity-ladder.md) —
    // fire-and-forget; never blocks or fails the request.
    this.userDevices.recordObservation(
      user.userId,
      request.headers?.['x-device-key'],
    );
    return true;
  }
}
