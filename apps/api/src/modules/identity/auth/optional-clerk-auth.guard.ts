import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared';
import { ClerkAuthService, type ClerkJwtClaims } from './clerk-auth.service';
import { UserService } from '../user.service';

@Injectable()
export class OptionalClerkAuthGuard implements CanActivate {
  constructor(
    private readonly clerkAuthService: ClerkAuthService,
    private readonly userService: UserService,
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
    request.user = user;
    return true;
  }
}
