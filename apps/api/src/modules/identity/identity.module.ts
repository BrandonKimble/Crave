import { forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ClerkAuthService } from './auth/clerk-auth.service';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { AdminGuard } from './auth/admin.guard';
import { OptionalClerkAuthGuard } from './auth/optional-clerk-auth.guard';
import { NativeAppleAuthService } from './auth/native-apple-auth.service';
import { AuthController } from './auth.controller';
import { UserController } from './user.controller';
import { PublicUserController } from './public-user.controller';
import { UserService } from './user.service';
import { UsernameService } from './username.service';
import { UserStatsService } from './user-stats.service';
import { UserFollowService } from './user-follow.service';
import { UserBlockService } from './user-block.service';
import { UserReportService } from './user-report.service';
import { ClosenessService } from './closeness.service';
// Favorites-domain code, but PROVIDED here: the signup provisioning seam is
// UserService.syncFromClerkClaims, and FavoritesModule imports IdentityModule
// — providing it in favorites would be a module cycle.
import { FavoriteListProvisioningService } from '../favorites/favorite-list-provisioning.service';

@Module({
  imports: [
    ConfigModule,
    SharedModule,
    PrismaModule,
    HttpModule,
    ModerationModule,
    EntitlementsModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [UserController, PublicUserController, AuthController],
  providers: [
    ClerkAuthService,
    ClerkAuthGuard,
    AdminGuard,
    OptionalClerkAuthGuard,
    NativeAppleAuthService,
    UserService,
    UsernameService,
    UserStatsService,
    UserFollowService,
    UserBlockService,
    UserReportService,
    ClosenessService,
    FavoriteListProvisioningService,
  ],
  exports: [
    ClerkAuthService,
    ClerkAuthGuard,
    AdminGuard,
    OptionalClerkAuthGuard,
    NativeAppleAuthService,
    UserService,
    UsernameService,
    UserStatsService,
    UserFollowService,
    UserBlockService,
    ClosenessService,
    FavoriteListProvisioningService,
  ],
})
export class IdentityModule {}
