import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared';
import { ClerkAuthService, type ClerkJwtClaims } from './clerk-auth.service';
import { UserService } from '../user.service';
import { UserDevicesService } from '../user-devices.service';
import { AuthenticationEffect } from '../../entitlements/authentication-effect';

@Injectable()
@AuthenticationEffect('optional')
export class OptionalClerkAuthGuard implements CanActivate {
  constructor(
    private readonly clerkAuthService: ClerkAuthService,
    private readonly userService: UserService,
    private readonly userDevices: UserDevicesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers?.authorization;
    const token = this.clerkAuthService.extractBearerToken(authHeader);
    if (!token) {
      return true;
    }

    const claims: ClerkJwtClaims =
      await this.clerkAuthService.verifyToken(token);
    const user = await this.userService.syncFromClerkClaims(claims);

    // A DELETED ACCOUNT IS ANONYMOUS HERE — it is not an error, it is a
    // non-identity (F9964).
    //
    // The required guard REFUSES a deleted account with 403 ACCOUNT_DELETED.
    // This one cannot: its routes are public, so refusing would break them for
    // everybody. But attaching the user was the other wrong answer — it made a
    // closed account a VIEWER on six public GETs, personalizing them with
    // block filtering and "did I vote", and it falsified the law three other
    // places state in as many words ("every authenticated route refuses a
    // deleted user"). I wrote that sentence to justify best-effort session
    // revocation and never checked this guard; the claim was true of the
    // required path and false of the optional one.
    //
    // Returning early — before request.user and before the device
    // observation — is what makes a deleted account's request byte-identical
    // to a signed-out one, which is the property the mutation proof asserts.
    // Recording a device for a closed account would also keep feeding the
    // vote-integrity ledger an identity that is on its way to being erased.
    if (user.deletedAt) {
      return true;
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
