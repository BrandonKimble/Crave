import { Controller, Delete, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { AccountDeletionService } from './account-deletion.service';

/** DELETE /users/me — in-app account deletion (Apple 5.1.1(v)). Reachable
 *  by ANY authenticated user, entitled or lapsed (Apple requires it). */
@Controller('users')
@UseGuards(ClerkAuthGuard)
export class AccountDeletionController {
  constructor(private readonly accountDeletion: AccountDeletionService) {}

  @Delete('me')
  async deleteMe(@CurrentUser() user: User): Promise<{ deleted: true }> {
    return this.accountDeletion.deleteAccount(user);
  }
}
