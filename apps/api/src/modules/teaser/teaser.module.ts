import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { TeaserController } from './teaser.controller';
import { TeaserService } from './teaser.service';

// PrismaModule/SharedModule imports completed by another session (boot was
// crashing on unresolved PrismaService — the module was committed mid-wire).
@Module({
  imports: [PrismaModule, SharedModule],
  controllers: [TeaserController],
  providers: [TeaserService],
})
export class TeaserModule {}
