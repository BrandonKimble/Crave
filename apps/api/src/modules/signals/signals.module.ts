import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { SignalsService } from './signals.service';

/** The Signals Ledger write path (master plan §3) — write-only by law. */
@Module({
  imports: [SharedModule, PrismaModule],
  providers: [SignalsService],
  exports: [SignalsService],
})
export class SignalsModule {}
