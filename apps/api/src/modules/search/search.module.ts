import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { PlaceEnrichmentModule } from '../restaurant-enrichment';
import { IdentityModule } from '../identity/identity.module';
import { EntityTextSearchModule } from '../entity-text-search/entity-text-search.module';
import { PublicCraveScoreModule } from '../content-processing/public-crave-score';
import { SignalsModule } from '../signals/signals.module';
import { PlacesModule } from '../places/places.module';
import { SearchController } from './search.controller';
import { DemandVocabularyService } from './demand-vocabulary.service';
import { SearchService } from './search.service';
import { SearchCoverageService } from './search-coverage.service';
import { SearchQueryExecutor } from './search-query.executor';
import { SearchQueryBuilder } from './search-query.builder';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { SearchOrchestrationService } from './search-orchestration.service';
import { OnDemandRequestService } from './on-demand-request.service';
import { EngineCoverageService } from './engine-coverage.service';
import { OnDemandCleanupService } from './on-demand-cleanup.service';
import { SearchQuerySuggestionService } from './search-query-suggestion.service';
import { SearchPopularityService } from './search-popularity.service';
import { PlaceStatusService } from './restaurant-status.service';
import { SearchEntityExpansionService } from './search-entity-expansion.service';
import { SearchSiblingExpansionService } from './search-sibling-expansion.service';
import { DietaryConstraintRegistry } from './dietary-constraints';
import { UnsegmentedResidueService } from './unsegmented-residue.service';
import { ScoringTerritoryRefreshService } from './scoring-territory-refresh.service';
import { OpenIntervalsBuilderService } from './open-intervals-builder.service';
import { ItemCategoryEdgeBuilderService } from './food-category-edge-builder.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RedditCollectorModule,
    EntityResolverModule,
    ExternalIntegrationsModule,
    PlaceEnrichmentModule,
    IdentityModule,
    EntityTextSearchModule,
    PublicCraveScoreModule,
    SignalsModule,
    // §22 cut 3: the search header names from the Place Catalog, and the §2
    // naming reconciler goes live at the search viewport chokepoint.
    PlacesModule,
  ],
  controllers: [SearchController],
  providers: [
    DemandVocabularyService,
    SearchService,
    SearchCoverageService,
    SearchQueryExecutor,
    SearchQueryBuilder,
    SearchQueryInterpretationService,
    OnDemandRequestService,
    EngineCoverageService,
    SearchOrchestrationService,
    OnDemandCleanupService,
    SearchQuerySuggestionService,
    SearchPopularityService,
    PlaceStatusService,
    SearchEntityExpansionService,
    SearchSiblingExpansionService,
    DietaryConstraintRegistry,
    UnsegmentedResidueService,
    ScoringTerritoryRefreshService,
    OpenIntervalsBuilderService,
    ItemCategoryEdgeBuilderService,
  ],
  exports: [
    DemandVocabularyService,
    SearchService,
    SearchOrchestrationService,
    OnDemandRequestService,
    SearchQuerySuggestionService,
    SearchPopularityService,
    PlaceStatusService,
    SearchQueryExecutor,
    DietaryConstraintRegistry,
  ],
})
export class SearchModule {}
