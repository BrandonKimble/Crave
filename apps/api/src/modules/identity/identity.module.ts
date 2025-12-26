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
import { UserEventService } from './user-event.service';
import { UsernameService } from './username.service';
import { UserStatsService } from './user-stats.service';
import { UserFollowService } from './user-follow.service';

@Module({
  imports: [
    ConfigModule,
    SharedModule,
    PrismaModule,
    HttpModule,
    ModerationModule,
  ],
  controllers: [UserController, PublicUserController, AuthController],
  providers: [
    ClerkAuthService,
    ClerkAuthGuard,
    AdminGuard,
    OptionalClerkAuthGuard,
    NativeAppleAuthService,
    UserService,
    UserEventService,
    UsernameService,
    UserStatsService,
    UserFollowService,
  ],
  exports: [
    ClerkAuthService,
    ClerkAuthGuard,
    AdminGuard,
    OptionalClerkAuthGuard,
    NativeAppleAuthService,
    UserService,
    UserEventService,
    UsernameService,
    UserStatsService,
    UserFollowService,
  ],
})
export class IdentityModule {}
