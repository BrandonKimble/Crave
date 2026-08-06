import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityModule } from './identity.module';
import { BillingModule } from '../billing/billing.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PhotosModule } from '../photos/photos.module';
import { AccountDeletionService } from './account-deletion.service';
import { PersonDataEraserService } from './person-data/person-data-eraser.service';
import { DeletionPurgeService } from './person-data/deletion-purge.service';
import { PersonDataExportService } from './person-data/person-data-export.service';
import { RetentionHorizonService } from './person-data/retention-horizon.service';
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
    PhotosModule,
  ],
  controllers: [AccountDeletionController],
  providers: [
    AccountDeletionService,
    // Erasure derived from PERSON_DATA_RULES, and the cron that converts a
    // 30-day "hidden" into "gone".
    PersonDataEraserService,
    DeletionPurgeService,
    PersonDataExportService,
    // The horizon on a `retain` rule is a promise; this is what keeps it.
    RetentionHorizonService,
  ],
})
export class AccountDeletionModule {}
