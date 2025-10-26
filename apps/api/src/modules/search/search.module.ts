import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchQueryExecutor } from './search-query.executor';

@Module({
  imports: [SharedModule, PrismaModule, RepositoryModule],
  controllers: [SearchController],
  providers: [SearchService, SearchQueryExecutor],
  exports: [SearchService],
})
export class SearchModule {}
