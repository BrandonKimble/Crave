import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from '../../../shared';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminIds: Set<string>;

  constructor(private readonly configService: ConfigService) {
    const configuredIds =
      this.configService.get<string[]>('clerk.adminUserIds');
    this.adminIds = new Set((configuredIds ?? []).map((value) => value.trim()));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const clerkId = request.user?.authProviderUserId;
    const fallbackUserId = request.user?.userId;

    if (!clerkId && !fallbackUserId) {
      throw new ForbiddenException('User context is missing');
    }

    if (this.adminIds.size === 0) {
      throw new ForbiddenException('Admin access is not configured');
    }

    const candidates = [clerkId, fallbackUserId].filter(
      (value): value is string => Boolean(value),
    );

    if (candidates.some((value) => this.adminIds.has(value))) {
      return true;
    }

    throw new ForbiddenException('Admin privileges required');
  }
}
