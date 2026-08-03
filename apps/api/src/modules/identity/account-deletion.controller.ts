import { Controller, Delete, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
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
}
