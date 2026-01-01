import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { IdentityModule } from '../identity/identity.module';
import { SearchModule } from '../search/search.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [PrismaModule, SharedModule, IdentityModule, SearchModule],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
