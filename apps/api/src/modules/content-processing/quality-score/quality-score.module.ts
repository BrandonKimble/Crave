import { Module } from '@nestjs/common';
import { QualityScoreService } from './quality-score.service';
import { SharedModule } from '../../../shared';
import { RepositoryModule } from '../../../repositories/repository.module';

/**
 * Quality Score Module
 * 
 * Implements PRD Section 5.3 - Quality Score Computation
 * 
 * Provides comprehensive quality scoring services for:
 * - Dish Quality Scores (connection strength + restaurant context)
 * - Restaurant Quality Scores (top dishes + menu consistency)
 * - Category/Attribute Performance Scores (contextual relevance)
 * 
 * This module integrates with the component processing pipeline to ensure
 * quality scores are updated whenever new mentions are processed.
 */
@Module({
  imports: [
    SharedModule, // Provides LoggerService
    RepositoryModule, // Provides ConnectionRepository, EntityRepository
  ],
  providers: [
    QualityScoreService,
  ],
  exports: [
    QualityScoreService,
  ],
})
export class QualityScoreModule {}