import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared';
import { ClerkAuthService, type ClerkJwtClaims } from './clerk-auth.service';
import { UserService } from '../user.service';
import { UserDevicesService } from '../user-devices.service';
import { AuthenticationEffect } from '../../entitlements/authentication-effect';

@Injectable()
@AuthenticationEffect('required')
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly clerkAuthService: ClerkAuthService,
    private readonly userService: UserService,
    private readonly userDevices: UserDevicesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.clerkAuthService.extractBearerToken(
      request.headers?.authorization,
    );
    const claims: ClerkJwtClaims =
      await this.clerkAuthService.verifyToken(token);
    const user = await this.userService.syncFromClerkClaims(claims);
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
