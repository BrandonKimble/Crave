import { Module } from '@nestjs/common';
import { EntityResolutionService } from './entity-resolution.service';
import { FoodDedupeMergeService } from './food-dedupe-merge.service';
import { MetroAdoptionService } from './metro-adoption.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { ConceptSatisfiesService } from './concept-satisfies.service';
import { DishKnowledgeSynthesisService } from './dish-knowledge-synthesis.service';
import { AliasManagementService } from './alias-management.service';
import { WordClaimAdjudicatorService } from './word-claim-adjudicator.service';
import { RestaurantNameHearingService } from './restaurant-name-hearing.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { ClaimRehearingBudgetService } from './claim-rehearing-budget.service';
import { WordVocabularyJudgeService } from './word-vocabulary-judge.service';
import { JudgedVocabularyService } from './judged-vocabulary.service';
import { VocabularyMaintenanceService } from './vocabulary-maintenance.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../../shared/shared.module';
import { LLMModule } from '../../external-integrations/llm/llm.module';
import { EntityTextSearchModule } from '../../entity-text-search/entity-text-search.module';

/**
 * Entity Resolver Module
 *
 * Provides three-tier entity resolution system with alias management for content processing domain
 * Implements PRD Section 5.2.1 - Database Entity Resolution w/ Batching
 * Implements PRD Section 9.2.1 - Alias management: Automatic alias creation, duplicate prevention, scope-aware resolution
 */
@Module({
  imports: [PrismaModule, SharedModule, LLMModule, EntityTextSearchModule],
  providers: [
    ConceptSatisfiesService,
    EntityResolutionService,
    FoodDedupeMergeService,
    MetroAdoptionService,
    DishKnowledgeSynthesisService,
    AliasManagementService,
    WordClaimAdjudicatorService,
    RestaurantNameHearingService,
    ClaimVerdictLedgerService,
    ClaimRehearingBudgetService,
    WordVocabularyJudgeService,
    JudgedVocabularyService,
    VocabularyMaintenanceService,
    EntityAnchorRehomeService,
  ],
  exports: [
    ConceptSatisfiesService,
    WordClaimAdjudicatorService,
    RestaurantNameHearingService,
    ClaimVerdictLedgerService,
    ClaimRehearingBudgetService,
    WordVocabularyJudgeService,
    JudgedVocabularyService,
    VocabularyMaintenanceService,
    EntityResolutionService,
    MetroAdoptionService,
    AliasManagementService,
    EntityAnchorRehomeService,
    FoodDedupeMergeService,
  ],
})
export class EntityResolverModule {}
