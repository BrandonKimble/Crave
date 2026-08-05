import { Controller, Delete, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { AllowDeletedAccount, ClerkAuthGuard } from './auth/clerk-auth.guard';
import { AccountDeletionService } from './account-deletion.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { NoSignal } from '../signals/records-signal.decorator';

/** DELETE /users/me — in-app account deletion (Apple 5.1.1(v)). Reachable
 *  by ANY authenticated user, entitled or lapsed (Apple requires it). */
// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('users')
@UseGuards(ClerkAuthGuard)
export class AccountDeletionController {
  constructor(private readonly accountDeletion: AccountDeletionService) {}

  @Delete('me')
  // D36/F645: authenticated mutation. Deleting an account is the ERASURE of a
  // person's acts, not a new act — and the ledger it would be written to is
  // exactly what this route severs.
  @NoSignal('account erasure severs the ledger; it never appends to it')
  async deleteMe(@CurrentUser() user: User): Promise<{ deleted: true }> {
    return this.accountDeletion.deleteAccount(user);
  }

  /**
   * POST /users/me/restore — the undo, inside the disclosed 30-day window.
   *
   * THE ONE ROUTE A DELETED ACCOUNT MAY REACH. Restore used to happen as a
   * side effect of any authenticated request (the auth sync cleared the
   * tombstone), which meant a stray background call could un-delete an account
   * nobody meant to bring back. It is a decision, so it is a route.
   */
  @Post('me/restore')
  @AllowDeletedAccount()
  @NoSignal('restoring an account is identity bookkeeping, not a user act')
  async restoreMe(@CurrentUser() user: User): Promise<{ restored: true }> {
    return this.accountDeletion.restoreAccount(user);
  }
}
