import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { IdentityModule } from '../identity/identity.module';
import { SearchModule } from '../search/search.module';
import { SignalsModule } from '../signals/signals.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { EntityAccessModule } from '../entities/entity-access.module';

@Module({
  imports: [
    PrismaModule,
    SharedModule,
    IdentityModule,
    SearchModule,
    SignalsModule,
    EntityAccessModule,
  ],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
