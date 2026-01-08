import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared';
import { ClerkAuthService, type ClerkJwtClaims } from './clerk-auth.service';
import { UserService } from '../user.service';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly clerkAuthService: ClerkAuthService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.clerkAuthService.extractBearerToken(
      request.headers?.authorization,
    );
    const claims: ClerkJwtClaims = await this.clerkAuthService.verifyToken(
      token,
    );
    const user = await this.userService.syncFromClerkClaims(claims);
    request.user = user;
    return true;
  }
}
