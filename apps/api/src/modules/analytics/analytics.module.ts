import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { SearchDemandService } from './search-demand.service';

@Module({
  imports: [PrismaModule, SharedModule],
  providers: [SearchDemandService],
  exports: [SearchDemandService],
})
export class AnalyticsModule {}
