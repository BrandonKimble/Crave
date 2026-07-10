import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityModule } from './identity.module';
import { BillingModule } from '../billing/billing.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionController } from './account-deletion.controller';

/**
 * Own module (not part of IdentityModule): deletion orchestrates identity
 * AND billing, and BillingModule already imports IdentityModule — folding
 * this into either would create a cycle.
 */
@Module({
  imports: [
    SharedModule,
    PrismaModule,
    IdentityModule,
    BillingModule,
    EntitlementsModule,
  ],
  controllers: [AccountDeletionController],
  providers: [AccountDeletionService],
})
export class AccountDeletionModule {}
