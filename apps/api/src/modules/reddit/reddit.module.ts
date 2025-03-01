import { Module } from '@nestjs/common';
import { RedditService } from './reddit.service';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    BullModule.registerQueue({
      name: 'reddit',
    }),
  ],
  providers: [RedditService],
  exports: [RedditService],
})
export class RedditModule {}
