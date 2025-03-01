import { Module } from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';
import { RedditModule } from '../reddit/reddit.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [RedditModule, PrismaModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}
