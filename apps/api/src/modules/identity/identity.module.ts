import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClerkAuthService } from './auth/clerk-auth.service';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { NativeAppleAuthService } from './auth/native-apple-auth.service';
import { AuthController } from './auth.controller';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [ConfigModule, SharedModule, PrismaModule, HttpModule],
  controllers: [UserController, AuthController],
  providers: [
    ClerkAuthService,
    ClerkAuthGuard,
    NativeAppleAuthService,
    UserService,
  ],
  exports: [
    ClerkAuthService,
    ClerkAuthGuard,
    NativeAppleAuthService,
    UserService,
  ],
})
export class IdentityModule {}
