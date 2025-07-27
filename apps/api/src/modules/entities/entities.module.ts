import { Module } from '@nestjs/common';
import { RepositoryModule } from '../../repositories/repository.module';
import { SharedModule } from '../../shared/shared.module';
import { EntitiesService } from './entities.service';

/**
 * Entities module providing service layer for entity management
 * Includes EntityContextService for PRD 4.2-4.3 compliance
 * Exports EntitiesService for use in other modules
 */
@Module({
  imports: [RepositoryModule, SharedModule],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
