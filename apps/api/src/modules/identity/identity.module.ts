import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClerkAuthService } from './auth/clerk-auth.service';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [ConfigModule, SharedModule, PrismaModule],
  controllers: [UserController],
  providers: [ClerkAuthService, ClerkAuthGuard, UserService],
  exports: [ClerkAuthService, ClerkAuthGuard, UserService],
})
export class IdentityModule {}
