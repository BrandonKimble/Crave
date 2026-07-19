import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { SignalsService } from './signals.service';
import { SignalDemandAggregateService } from './signal-demand-aggregate.service';
import { SignalDemandReadService } from './signal-demand-read.service';

/**
 * The Signals Ledger (master plan §3): the append-only write path
 * (SignalsService), the derived day×actor×place×subject×kind aggregate
 * (SignalDemandAggregateService), and the substrate readers every former
 * event-table consumer cut over to (SignalDemandReadService, §22 item 6).
 */
@Module({
  imports: [SharedModule, PrismaModule],
  providers: [
    SignalsService,
    SignalDemandAggregateService,
    SignalDemandReadService,
  ],
  exports: [
    SignalsService,
    SignalDemandAggregateService,
    SignalDemandReadService,
  ],
})
export class SignalsModule {}
