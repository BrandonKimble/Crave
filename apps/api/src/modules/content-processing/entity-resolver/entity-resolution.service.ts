import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { EntityType, Entity } from '@prisma/client';
import * as stringSimilarity from 'string-similarity';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntityRepository } from '../../../repositories/entity.repository';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { AliasManagementService } from './alias-management.service';
import {
  EntityResolutionInput,
  EntityResolutionResult,
  BatchResolutionResult,
  EntityResolutionConfig,
  ResolutionPerformanceMetrics,
  FuzzyMatchResult,
  ContextualAttributeInput,
} from './entity-resolution.types';

/**
 * Three-tier entity resolution service
 * Implements PRD Section 5.2.1 - Database Entity Resolution w/ Batching
 *
 * Resolution Process:
 * 1. Exact match against canonical names
 * 2. Alias matching with array operations
 * 3. Fuzzy matching with confidence scoring
 */
@Injectable()
export class EntityResolutionService implements OnModuleInit {
  private logger!: LoggerService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityRepository: EntityRepository,
    private readonly aliasManagementService: AliasManagementService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('EntityResolutionService');
  }

  private readonly restaurantNonDistinctTokens = new Set<string>([
    'restaurant',
    'cafe',
    'cafeteria',
    'bar',
    'pub',
    'tavern',
    'grill',
    'steakhouse',
    'chophouse',
    'cookhouse',
    'smokehouse',
    'roadhouse',
    'taphouse',
    'taproom',
    'brewery',
    'brasserie',
    'bistro',
    'osteria',
    'trattoria',
    'cantina',
    'taqueria',
    'taco',
    'tacos',
    'pizzeria',
    'eatery',
    'food',
    'foods',
    'saloon',
    'cuisine',
    'farm',
    'farms',
    'coffee',
    'kitchen',
    'kitchenette',
    'diner',
    'lounge',
    'house',
    'bakery',
    'bakeshop',
    'market',
    'coop',
    'cooperative',
    'co',
    'company',
    'heb',
    'atx',
    'bbq',
    'barbecue',
    'estiatorio',
    'ristorante',
    'cucina',
    'no',
    'numero',
    'number',
    'hashtag',
    'el',
    'la',
    'los',
    'las',
    'le',
    'les',
    'the',
  ]);

  private readonly restaurantConnectorTokens = new Set<string>([
    'and',
    'n',
    'y',
    'et',
  ]);

  private readonly restaurantNonDistinctPhrases: string[][] = [
    ['food', 'truck'],
    ['coffee', 'shop'],
    ['beer', 'garden'],
    ['ice', 'cream'],
  ];

  /**
   * Resolve a batch of entities using three-tier resolution
   * Implements PRD Section 5.2.1 - Three-Tier Resolution Process
   */
  async resolveBatch(
    entities: EntityResolutionInput[],
    config?: Partial<EntityResolutionConfig>,
  ): Promise<BatchResolutionResult> {
    const startTime = Date.now();
    const DEFAULT_CONFIG: EntityResolutionConfig = {
      batchSize: 100,
      enableFuzzyMatching: true,
      fuzzyMatchThreshold: 0.75,
      maxEditDistance: 3,
      confidenceThresholds: {
        high: 0.85,
        medium: 0.7,
        low: 0.7,
      },
    };
    const resolveConfig = { ...DEFAULT_CONFIG, ...config };

    this.logger.info('Starting batch entity resolution', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'resolve_batch',
      entityCount: entities.length,
      batchSize: resolveConfig.batchSize,
    });

    try {
      const results: EntityResolutionResult[] = [];
      const tempIdToEntityIdMap = new Map<string, string>();
      const globalNewEntityMap = new Map<string, EntityResolutionResult>();
      let newEntitiesCreated = 0;

      // Process entities in batches for optimal performance
      for (let i = 0; i < entities.length; i += resolveConfig.batchSize) {
        const batch = entities.slice(i, i + resolveConfig.batchSize);
        const batchResults = await this.processBatch(
          batch,
          resolveConfig,
          globalNewEntityMap,
        );

        results.push(...batchResults.results);

        // Build ID mapping
        batchResults.results.forEach((result) => {
          if (result.entityId) {
            tempIdToEntityIdMap.set(result.tempId, result.entityId);
          }
        });

        newEntitiesCreated += batchResults.newEntitiesCreated;
      }

      const processingTime = Date.now() - startTime;
      const metrics = this.calculatePerformanceMetrics(results, processingTime);

      this.logger.info('Batch entity resolution completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'resolve_batch',
        processingTime,
        ...metrics,
      });

      // ADDED: Populate entity details for validation
      const entityDetails = new Map<string, any>();
      for (const result of results) {
        if (result.entityId) {
          // Fetch entity details for each resolved entity
          const entity = await this.entityRepository.findById(result.entityId);
          if (entity) {
            entityDetails.set(result.entityId, {
              entityId: entity.entityId,
              name: entity.name,
              type: entity.type,
              aliases: entity.aliases || [],
            });
          }
        }
      }

      // Automatically add observed aliases for matched entities (PRD Section 9.2.1)
      const aliasUpdates = new Map<string, Set<string>>();
      for (const result of results) {
        if (!result.entityId) continue;
        if (!result.originalInput?.originalText) continue;
        if (result.resolutionTier === 'new') continue;

        const originalText = result.originalInput.originalText.trim();
        if (!originalText) continue;

        const matchedName = result.matchedName || '';
        if (matchedName.toLowerCase() === originalText.toLowerCase()) continue;

        if (!aliasUpdates.has(result.entityId)) {
          aliasUpdates.set(result.entityId, new Set());
        }
        aliasUpdates.get(result.entityId)!.add(originalText);
      }

      for (const [entityId, aliases] of aliasUpdates.entries()) {
        for (const alias of aliases) {
          try {
            await this.addAliasToEntity(entityId, alias);
          } catch (aliasError) {
            this.logger.warn('Alias enrichment failed', {
              entityId,
              alias,
              error: {
                message:
                  aliasError instanceof Error
                    ? aliasError.message
                    : String(aliasError),
              },
            });
          }
        }
      }

      return {
        tempIdToEntityIdMap,
        resolutionResults: results,
        newEntitiesCreated,
        performanceMetrics: metrics,
        entityDetails, // ADDED: Include entity details
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Batch entity resolution failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'resolve_batch',
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        entityCount: entities.length,
      });
      throw error;
    }
  }

  /**
   * Process a single batch using optimized three-tier approach
   */
  private async processBatch(
    entities: EntityResolutionInput[],
    config: EntityResolutionConfig,
    globalNewEntityMap: Map<string, EntityResolutionResult>,
  ): Promise<{
    results: EntityResolutionResult[];
    newEntitiesCreated: number;
  }> {
    const results: EntityResolutionResult[] = [];
    let newEntitiesCreated = 0;

    // Group entities by type for optimized batch queries
    const entitiesByType = this.groupEntitiesByType(entities);

    for (const [entityType, typeEntities] of entitiesByType) {
      const typeResults = await this.resolveEntitiesByType(
        typeEntities,
        entityType,
        config,
        globalNewEntityMap,
      );
      results.push(...typeResults);

      // Count new entities created
      newEntitiesCreated += typeResults.filter(
        (r) => r.resolutionTier === 'new' && r.isNewEntity,
      ).length;
    }

    return { results, newEntitiesCreated };
  }

  /**
   * Resolve entities of the same type using optimized three-tier process
   */
  private async resolveEntitiesByType(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    config: EntityResolutionConfig,
    globalNewEntityMap: Map<string, EntityResolutionResult>,
  ): Promise<EntityResolutionResult[]> {
    this.logger.debug('Resolving entities by type', {
      entityType,
      count: entities.length,
    });

    // Tier 1: Exact match resolution (bulk query)
    const exactMatchResults = await this.performExactMatches(
      entities,
      entityType,
    );
    const unmatchedAfterExact = entities.filter(
      (entity) =>
        !exactMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Exact match results', {
      entityType,
      matched: exactMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterExact.length,
    });

    // Tier 2: Alias matching (bulk query) - only for unmatched entities
    const aliasMatchResults = await this.performAliasMatches(
      unmatchedAfterExact,
      entityType,
    );
    const unmatchedAfterAlias = unmatchedAfterExact.filter(
      (entity) =>
        !aliasMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Alias match results', {
      entityType,
      matched: aliasMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterAlias.length,
    });

    // Tier 3: Fuzzy matching (optimized individual queries) - only for unmatched entities
    const fuzzyMatchResults = config.enableFuzzyMatching
      ? await this.performFuzzyMatches(unmatchedAfterAlias, entityType, config)
      : [];

    const unmatchedAfterFuzzy = unmatchedAfterAlias.filter(
      (entity) =>
        !fuzzyMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Fuzzy match results', {
      entityType,
      matched: fuzzyMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterFuzzy.length,
    });

    // Mark unmatched entities for transaction-based creation (PRD approach)
    const primaryNewEntityMap = globalNewEntityMap;
    const newEntityResults = this.markEntitiesForCreation(
      unmatchedAfterFuzzy,
      entityType,
      {
        exactMatches: exactMatchResults,
        aliasMatches: aliasMatchResults,
        fuzzyMatches: fuzzyMatchResults,
      },
      primaryNewEntityMap,
    );

    // Combine results from all tiers
    // Each entity should appear exactly once in the final results
    const entityResultMap = new Map<string, EntityResolutionResult>();

    // Add exact match results (highest priority)
    exactMatchResults.forEach((result) => {
      if (result.entityId) {
        entityResultMap.set(result.tempId, result);
      }
    });

    // Add alias match results (only for entities not already matched)
    aliasMatchResults.forEach((result) => {
      if (result.entityId && !entityResultMap.has(result.tempId)) {
        entityResultMap.set(result.tempId, result);
      }
    });

    // Add fuzzy match results (only for entities not already matched)
    fuzzyMatchResults.forEach((result) => {
      if (result.entityId && !entityResultMap.has(result.tempId)) {
        entityResultMap.set(result.tempId, result);
      }
    });

    // Add new entity results (only for entities not already matched)
    newEntityResults.forEach((result) => {
      if (!entityResultMap.has(result.tempId)) {
        entityResultMap.set(result.tempId, result);
      }
    });

    return Array.from(entityResultMap.values());
  }

  /**
   * Tier 1: Exact match resolution using optimized bulk query
   * Single query: WHERE name IN (...) AND type = $entityType
   */
  private async performExactMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    const normalizedNames = entities.map((e) =>
      e.normalizedName.toLowerCase().trim(),
    );

    try {
      // Optimized bulk query for exact matches
      const matchedEntities = await this.prisma.entity.findMany({
        where: {
          type: entityType,
          name: {
            in: normalizedNames,
            mode: 'insensitive',
          },
        },
        select: {
          entityId: true,
          name: true,
        },
      });

      // Create lookup map for O(1) resolution
      const nameToEntityMap = new Map(
        matchedEntities.map((entity) => [
          entity.name.toLowerCase().trim(),
          entity.entityId,
        ]),
      );

      return entities.map((entity) => {
        const entityId = nameToEntityMap.get(
          entity.normalizedName.toLowerCase().trim(),
        );
        return {
          tempId: entity.tempId,
          entityId: entityId || null,
          confidence: entityId ? 1.0 : 0.0,
          resolutionTier: entityId ? 'exact' : 'unmatched',
          matchedName: entityId ? entity.normalizedName : undefined,
          originalInput: entity,
        };
      });
    } catch (error) {
      this.logger.error('Exact match query failed', {
        error: error instanceof Error ? error.message : String(error),
        entityType,
        count: entities.length,
      });
      throw error;
    }
  }

  /**
   * Tier 2: Alias matching using optimized array operations
   * Single query: WHERE aliases && ARRAY[...] AND type = $entityType
   */
  private async performAliasMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    // Collect all possible alias variations
    const allAliases = entities
      .flatMap((entity) => [
        entity.normalizedName,
        entity.originalText,
        ...(entity.aliases || []),
      ])
      .filter((alias) => alias && alias.trim().length > 0);

    if (allAliases.length === 0) {
      return entities.map((entity) => ({
        tempId: entity.tempId,
        entityId: null,
        confidence: 0.0,
        resolutionTier: 'unmatched' as const,
        originalInput: entity,
      }));
    }

    try {
      // Optimized alias matching query
      const matchedEntities = await this.prisma.entity.findMany({
        where: {
          type: entityType,
          aliases: {
            hasSome: allAliases,
          },
        },
        select: {
          entityId: true,
          name: true,
          aliases: true,
        },
      });

      return entities.map((entity) => {
        const entityAliases = [
          entity.normalizedName,
          entity.originalText,
          ...(entity.aliases || []),
        ].filter((alias) => alias && alias.trim().length > 0);

        // Find matching entity based on alias overlap
        const matchedEntity = matchedEntities.find((dbEntity) =>
          entityAliases.some((alias) =>
            dbEntity.aliases.some(
              (dbAlias) =>
                dbAlias.toLowerCase().trim() === alias.toLowerCase().trim(),
            ),
          ),
        );

        return {
          tempId: entity.tempId,
          entityId: matchedEntity?.entityId || null,
          confidence: matchedEntity ? 0.95 : 0.0,
          resolutionTier: matchedEntity ? 'alias' : 'unmatched',
          matchedName: matchedEntity?.name,
          originalInput: entity,
        };
      });
    } catch (error) {
      this.logger.error('Alias match query failed', {
        error: error instanceof Error ? error.message : String(error),
        entityType,
        count: entities.length,
      });
      throw error;
    }
  }

  /**
   * Tier 3: Fuzzy matching with confidence scoring
   * Individual queries with edit distance ≤ 3-4 and confidence thresholds
   */
  private async performFuzzyMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    config: EntityResolutionConfig,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    const results: EntityResolutionResult[] = [];

    // Get all entities of this type for fuzzy comparison
    const allEntitiesOfType = await this.prisma.entity.findMany({
      where: { type: entityType },
      select: {
        entityId: true,
        name: true,
        aliases: true,
      },
    });

    for (const entity of entities) {
      const fuzzyResult = this.findBestFuzzyMatch(
        entity,
        allEntitiesOfType,
        entityType,
        config,
      );

      results.push({
        tempId: entity.tempId,
        entityId: fuzzyResult?.entityId || null,
        confidence: fuzzyResult?.confidence || 0.0,
        resolutionTier: fuzzyResult ? 'fuzzy' : 'unmatched',
        matchedName: fuzzyResult?.matchedText,
        originalInput: entity,
      });
    }

    return results;
  }

  /**
   * Find best fuzzy match using string similarity and edit distance
   */
  private findBestFuzzyMatch(
    inputEntity: EntityResolutionInput,
    candidateEntities: { entityId: string; name: string; aliases: string[] }[],
    entityType: EntityType,
    config: EntityResolutionConfig,
  ): FuzzyMatchResult | null {
    const searchTerms = [
      inputEntity.normalizedName,
      inputEntity.originalText,
      ...(inputEntity.aliases || []),
    ].filter((term) => term && term.trim().length > 0);

    let bestMatch: FuzzyMatchResult | null = null;

    for (const candidate of candidateEntities) {
      const candidateTerms = [candidate.name, ...candidate.aliases];

      for (const searchTerm of searchTerms) {
        for (const candidateTerm of candidateTerms) {
          if (entityType === 'restaurant') {
            const inputTokens = this.tokenizeEntityName(
              searchTerm.toLowerCase().trim(),
            );
            const candidateTokens = this.tokenizeEntityName(
              candidateTerm.toLowerCase().trim(),
            );

            if (
              inputTokens.length > 0 &&
              candidateTokens.length > 0 &&
              this.shouldMergeRestaurantTokens(inputTokens, candidateTokens)
            ) {
              const confidenceBoost = Math.max(
                0.9,
                config.fuzzyMatchThreshold + 0.15,
              );
              if (!bestMatch || confidenceBoost > bestMatch.confidence) {
                bestMatch = {
                  entityId: candidate.entityId,
                  confidence: Math.min(confidenceBoost, 0.99),
                  matchedText: candidateTerm,
                  editDistance: this.calculateEditDistance(
                    searchTerm.toLowerCase().trim(),
                    candidateTerm.toLowerCase().trim(),
                  ),
                };
              }
              continue;
            }
          }

          // Calculate string similarity
          const normalizedSearch = searchTerm.toLowerCase().trim();
          const normalizedCandidate = candidateTerm.toLowerCase().trim();

          const similarity = stringSimilarity.compareTwoStrings(
            normalizedSearch,
            normalizedCandidate,
          );

          // Calculate edit distance (approximate)
          const editDistance = this.calculateEditDistance(
            normalizedSearch,
            normalizedCandidate,
          );

          const firstCharMatches =
            normalizedSearch.charAt(0) === normalizedCandidate.charAt(0);

          const isSingleTokenMatch =
            entityType === 'restaurant' &&
            this.tokenizeEntityName(normalizedSearch).length === 1 &&
            this.tokenizeEntityName(normalizedCandidate).length === 1;

          // Check if within thresholds
          const forceMerge = this.shouldForceRestaurantFuzzyMatch(
            entityType,
            searchTerm,
            candidateTerm,
          );

          if (
            forceMerge ||
            (similarity >=
              (isSingleTokenMatch
                ? Math.max(0.8, config.fuzzyMatchThreshold)
                : config.fuzzyMatchThreshold) &&
              editDistance <= config.maxEditDistance &&
              (isSingleTokenMatch ? firstCharMatches : true))
          ) {
            if (!bestMatch || similarity > bestMatch.confidence) {
              bestMatch = {
                entityId: candidate.entityId,
                confidence: similarity,
                matchedText: candidateTerm,
                editDistance,
              };
            }
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Mark entities for transaction-based creation (PRD approach)
   * Return null entity IDs to allow database auto-generation
   */
  private markEntitiesForCreation(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    context: {
      exactMatches: EntityResolutionResult[];
      aliasMatches: EntityResolutionResult[];
      fuzzyMatches: EntityResolutionResult[];
    },
    primaryNewEntityMap: Map<string, EntityResolutionResult>,
  ): EntityResolutionResult[] {
    const results: EntityResolutionResult[] = [];

    for (const entity of entities) {
      try {
        // Prepare aliases using alias management service
        const aliasResult = this.aliasManagementService.addOriginalTextAsAlias(
          entity.aliases || [],
          entity.originalText,
        );

        // Validate scope constraints for attribute entities
        const scopeValidation =
          this.aliasManagementService.validateScopeConstraints(
            entityType,
            aliasResult.updatedAliases,
          );

        if (scopeValidation.violations.length > 0) {
          this.logger.warn('Scope violations detected for entity creation', {
            entityType,
            entityName: entity.normalizedName,
            violations: scopeValidation.violations,
          });
        }

        const normalizedKey = `${entityType}:${entity.normalizedName
          .toLowerCase()
          .trim()}`;
        const existingPrimary = primaryNewEntityMap.get(normalizedKey);

        if (existingPrimary) {
          const duplicateResult: EntityResolutionResult = {
            tempId: entity.tempId,
            entityId: existingPrimary.entityId ?? null,
            confidence: 1.0,
            resolutionTier: 'new',
            matchedName: entity.normalizedName,
            originalInput: entity,
            isNewEntity: false,
            entityType: entityType,
            normalizedName: entity.normalizedName,
            validatedAliases: scopeValidation.validAliases,
            primaryTempId: existingPrimary.tempId,
          };

          results.push(duplicateResult);

          this.logger.debug('Resolver reused primary new entity within batch', {
            entityType,
            normalizedName: entity.normalizedName,
            primaryTempId: existingPrimary.tempId,
            duplicateTempId: entity.tempId,
          });

          continue;
        }

        const similarPrimary = this.findSimilarPrimaryCandidate(
          primaryNewEntityMap,
          entity,
          entityType,
        );

        if (similarPrimary) {
          const duplicateResult: EntityResolutionResult = {
            tempId: entity.tempId,
            entityId: similarPrimary.entityId ?? null,
            confidence: 0.95,
            resolutionTier: 'new',
            matchedName: entity.normalizedName,
            originalInput: entity,
            isNewEntity: false,
            entityType,
            normalizedName: entity.normalizedName,
            validatedAliases: scopeValidation.validAliases,
            primaryTempId: similarPrimary.tempId,
          };

          const mergedAliasSet = new Set<string>([
            ...(similarPrimary.validatedAliases || []),
            ...scopeValidation.validAliases,
          ]);
          similarPrimary.validatedAliases = Array.from(mergedAliasSet);

          results.push(duplicateResult);

          this.logger.debug(
            'Merged near-duplicate entity into primary new entity',
            {
              entityType,
              normalizedName: entity.normalizedName,
              primaryTempId: similarPrimary.tempId,
              duplicateTempId: entity.tempId,
              similaritySource: 'levenshtein-threshold',
            },
          );

          continue;
        }

        const primaryResult: EntityResolutionResult = {
          tempId: entity.tempId,
          entityId: null,
          confidence: 1.0,
          resolutionTier: 'new',
          matchedName: entity.normalizedName,
          originalInput: entity,
          isNewEntity: true,
          entityType: entityType,
          normalizedName: entity.normalizedName,
          validatedAliases: scopeValidation.validAliases,
        };

        results.push(primaryResult);
        primaryNewEntityMap.set(normalizedKey, primaryResult);

        const closestFuzzyMatch = context.fuzzyMatches
          .filter((r) => r.entityId)
          .reduce<{
            entityId: string;
            confidence: number;
            matchedName?: string;
          } | null>((best, current) => {
            if (!current.entityId) return best;
            if (!best || (current.confidence || 0) > best.confidence) {
              return {
                entityId: current.entityId,
                confidence: current.confidence || 0,
                matchedName: current.matchedName,
              };
            }
            return best;
          }, null);

        this.logger.warn('Resolver created new entity', {
          entityType,
          normalizedName: entity.normalizedName,
          originalText: entity.originalText,
          aliases: entity.aliases,
          searchTerms: [
            entity.normalizedName,
            entity.originalText,
            ...(entity.aliases || []),
          ],
          closestFuzzyMatch,
        });

        this.logger.debug('Marked entity for transaction creation', {
          tempId: entity.tempId,
          entityType,
          name: entity.normalizedName,
        });
      } catch (error) {
        this.logger.error('Failed to prepare entity for creation', {
          error: error instanceof Error ? error.message : String(error),
          entityType,
          entityName: entity.normalizedName,
        });

        // Add unmatched result for failed preparation
        results.push({
          tempId: entity.tempId,
          entityId: null,
          confidence: 0.0,
          resolutionTier: 'unmatched',
          originalInput: entity,
        });
      }
    }

    return results;
  }

  private shouldForceRestaurantFuzzyMatch(
    entityType: EntityType,
    searchTerm: string,
    candidateTerm: string,
  ): boolean {
    if (entityType !== 'restaurant') {
      return false;
    }

    const normalizedInput = searchTerm.toLowerCase().trim();
    const normalizedCandidate = candidateTerm.toLowerCase().trim();

    if (normalizedInput.length < 4 || normalizedCandidate.length < 4) {
      return false;
    }

    const distance = this.calculateEditDistance(
      normalizedInput,
      normalizedCandidate,
    );

    if (
      distance === 1 &&
      normalizedInput.charAt(0) === normalizedCandidate.charAt(0)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Resolve context-dependent attributes with scope awareness
   * Implements PRD Section 4.2.2 - Context-Dependent Attributes
   */
  async resolveContextualAttributes(
    attributes: ContextualAttributeInput[],
    config?: Partial<EntityResolutionConfig>,
  ): Promise<BatchResolutionResult> {
    this.logger.info('Resolving contextual attributes', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'resolve_contextual_attributes',
      count: attributes.length,
    });

    // Convert to standard resolution inputs with proper entity types
    const resolutionInputs = attributes.map((attr) => ({
      tempId: attr.tempId,
      normalizedName: attr.attributeName,
      originalText: attr.originalText,
      entityType: (attr.scope === 'food'
        ? 'food_attribute'
        : 'restaurant_attribute') as EntityType,
      aliases: attr.aliases || [],
    }));

    return this.resolveBatch(resolutionInputs, config);
  }

  /**
   * Helper method to group entities by type for batch processing
   */
  private groupEntitiesByType(
    entities: EntityResolutionInput[],
  ): Map<EntityType, EntityResolutionInput[]> {
    const grouped = new Map<EntityType, EntityResolutionInput[]>();

    for (const entity of entities) {
      if (!grouped.has(entity.entityType)) {
        grouped.set(entity.entityType, []);
      }
      grouped.get(entity.entityType)!.push(entity);
    }

    return grouped;
  }

  /**
   * Calculate performance metrics for resolution results
   */
  private calculatePerformanceMetrics(
    results: EntityResolutionResult[],
    processingTimeMs: number,
  ): ResolutionPerformanceMetrics {
    const exactMatches = results.filter(
      (r) => r.resolutionTier === 'exact' && r.entityId,
    ).length;
    const aliasMatches = results.filter(
      (r) => r.resolutionTier === 'alias' && r.entityId,
    ).length;
    const fuzzyMatches = results.filter(
      (r) => r.resolutionTier === 'fuzzy' && r.entityId,
    ).length;
    const newEntitiesCreated = results.filter(
      (r) => r.resolutionTier === 'new' && r.entityId,
    ).length;

    const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence =
      results.length > 0 ? totalConfidence / results.length : 0;

    return {
      totalProcessed: results.length,
      exactMatches,
      aliasMatches,
      fuzzyMatches,
      newEntitiesCreated,
      processingTimeMs: Math.max(processingTimeMs, 1), // Ensure minimum 1ms for testing
      averageConfidence: Math.round(averageConfidence * 100) / 100,
    };
  }

  /**
   * Merge two entities by consolidating their aliases and updating the target entity
   * Implements PRD Section 9.2.1 - Alias management integrates seamlessly with entity resolution system
   */
  async mergeEntities(
    sourceEntityId: string,
    targetEntityId: string,
    entityType: EntityType,
  ): Promise<{
    mergedEntity: Entity;
    aliasesAdded: number;
    duplicatesRemoved: number;
    violations: string[];
  }> {
    this.logger.info('Starting entity merge operation', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'merge_entities',
      sourceEntityId,
      targetEntityId,
      entityType,
    });

    try {
      // Fetch both entities
      const [sourceEntity, targetEntity] = await Promise.all([
        this.prisma.entity.findUnique({
          where: { entityId: sourceEntityId },
          select: { entityId: true, name: true, aliases: true, type: true },
        }),
        this.prisma.entity.findUnique({
          where: { entityId: targetEntityId },
          select: { entityId: true, name: true, aliases: true, type: true },
        }),
      ]);

      if (!sourceEntity || !targetEntity) {
        throw new Error(
          `Entity not found: source=${!sourceEntity}, target=${!targetEntity}`,
        );
      }

      if (sourceEntity.type !== targetEntity.type) {
        throw new Error(
          `Entity type mismatch: source=${sourceEntity.type}, target=${targetEntity.type}`,
        );
      }

      // Prepare alias merge using alias management service
      const mergeResult = this.aliasManagementService.prepareAliasesForMerge({
        sourceEntityId,
        targetEntityId,
        sourceAliases: sourceEntity.aliases,
        targetAliases: targetEntity.aliases,
        entityType,
      });

      // Update target entity with merged aliases
      const updatedEntity = await this.prisma.entity.update({
        where: { entityId: targetEntityId },
        data: {
          aliases: mergeResult.mergedAliases,
          lastUpdated: new Date(),
        },
      });

      // Log the merge operation
      this.logger.info('Entity merge completed successfully', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'merge_entities',
        sourceEntityId,
        targetEntityId,
        finalAliasCount: mergeResult.mergedAliases.length,
        duplicatesRemoved: mergeResult.duplicatesRemoved,
        violations: mergeResult.crossScopeViolations.length,
      });

      return {
        mergedEntity: updatedEntity,
        aliasesAdded:
          mergeResult.mergedAliases.length - targetEntity.aliases.length,
        duplicatesRemoved: mergeResult.duplicatesRemoved,
        violations: mergeResult.crossScopeViolations,
      };
    } catch (error) {
      this.logger.error('Entity merge operation failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'merge_entities',
        error: error instanceof Error ? error.message : String(error),
        sourceEntityId,
        targetEntityId,
        entityType,
      });
      throw error;
    }
  }

  /**
   * Add alias to existing entity with duplicate prevention and scope validation
   * Implements PRD Section 9.2.1 - Automatic alias creation, duplicate prevention
   */
  async addAliasToEntity(
    entityId: string,
    newAlias: string,
  ): Promise<{
    updated: boolean;
    aliasAdded: boolean;
    violations: string[];
  }> {
    this.logger.debug('Adding alias to entity', {
      entityId,
      newAlias,
    });

    try {
      // Fetch current entity
      const entity = await this.prisma.entity.findUnique({
        where: { entityId },
        select: { entityId: true, name: true, aliases: true, type: true },
      });

      if (!entity) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      // Use alias management service to add alias
      const aliasResult = this.aliasManagementService.addOriginalTextAsAlias(
        entity.aliases,
        newAlias,
      );

      // Validate scope constraints
      const scopeValidation =
        this.aliasManagementService.validateScopeConstraints(
          entity.type,
          aliasResult.updatedAliases,
        );

      if (!aliasResult.aliasAdded) {
        this.logger.debug('Alias already exists, no update needed', {
          entityId,
          newAlias,
        });
        return {
          updated: false,
          aliasAdded: false,
          violations: scopeValidation.violations,
        };
      }

      // Update entity with new aliases
      await this.prisma.entity.update({
        where: { entityId },
        data: {
          aliases: scopeValidation.validAliases,
          lastUpdated: new Date(),
        },
      });

      this.logger.debug('Alias added to entity successfully', {
        entityId,
        newAlias,
        finalAliasCount: scopeValidation.validAliases.length,
        violations: scopeValidation.violations.length,
      });

      return {
        updated: true,
        aliasAdded: true,
        violations: scopeValidation.violations,
      };
    } catch (error) {
      this.logger.error('Failed to add alias to entity', {
        error: error instanceof Error ? error.message : String(error),
        entityId,
        newAlias,
      });
      throw error;
    }
  }

  private findSimilarPrimaryCandidate(
    primaryNewEntityMap: Map<string, EntityResolutionResult>,
    entity: EntityResolutionInput,
    entityType: EntityType,
  ): EntityResolutionResult | null {
    const normalizedInput = entity.normalizedName.toLowerCase().trim();
    const inputTokens = this.tokenizeEntityName(normalizedInput);
    let bestMatch: {
      candidate: EntityResolutionResult;
      similarity: number;
      editDistance: number;
    } | null = null;

    for (const candidate of primaryNewEntityMap.values()) {
      if (!candidate.normalizedName || candidate.entityType !== entityType) {
        continue;
      }

      const normalizedCandidate = candidate.normalizedName.toLowerCase().trim();
      const candidateTokens = this.tokenizeEntityName(normalizedCandidate);

      if (
        entityType === 'restaurant' &&
        this.shouldMergeRestaurantTokens(inputTokens, candidateTokens)
      ) {
        return candidate;
      }

      const similarity = stringSimilarity.compareTwoStrings(
        normalizedInput,
        normalizedCandidate,
      );
      const editDistance = this.calculateEditDistance(
        normalizedInput,
        normalizedCandidate,
      );

      if (similarity >= 0.7 && editDistance <= 2) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { candidate, similarity, editDistance };
        }
      }
    }

    return bestMatch?.candidate ?? null;
  }

  private tokenizeEntityName(value: string): string[] {
    if (!value) {
      return [];
    }

    const cleaned = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    if (!cleaned) {
      return [];
    }

    const tokens: string[] = [];

    cleaned.split(/\s+/).forEach((token) => {
      if (!token) {
        return;
      }

      let normalized = token;
      if (normalized.endsWith("'s")) {
        normalized = normalized.slice(0, -2);
      }
      if (normalized.endsWith('s') && normalized.length > 3) {
        normalized = normalized.slice(0, -1);
      }

      const segments = normalized.match(/[a-z]+|\d+/g);
      if (segments) {
        segments.forEach((segment) => {
          if (segment.length > 0) {
            tokens.push(segment);
          }
        });
      } else if (normalized.length > 0) {
        tokens.push(normalized);
      }
    });

    return tokens;
  }
  private isRestaurantDescriptorToken(token: string): boolean {
    if (!token) {
      return false;
    }
    if (this.restaurantNonDistinctTokens.has(token)) {
      return true;
    }
    if (/^\d+$/.test(token)) {
      return true;
    }
    if (token.length === 1 && /[a-z]/.test(token)) {
      return true;
    }
    return false;
  }

  private stripLeadingDescriptorTokens(tokens: string[]): string[] {
    let startIndex = 0;
    while (
      startIndex < tokens.length &&
      this.isRestaurantDescriptorToken(tokens[startIndex])
    ) {
      startIndex += 1;
    }
    return tokens.slice(startIndex);
  }

  private removeDescriptorTokens(tokens: string[]): string[] {
    return tokens.filter((token) => !this.isRestaurantDescriptorToken(token));
  }

  private removeDescriptorPhrases(tokens: string[]): string[] {
    if (!tokens.length) {
      return tokens;
    }

    const result: string[] = [];

    for (let index = 0; index < tokens.length; index += 1) {
      let phraseMatched = false;

      for (const phrase of this.restaurantNonDistinctPhrases) {
        if (phrase.length === 0) {
          continue;
        }

        if (index + phrase.length > tokens.length) {
          continue;
        }

        let matches = true;
        for (let offset = 0; offset < phrase.length; offset += 1) {
          if (tokens[index + offset] !== phrase[offset]) {
            matches = false;
            break;
          }
        }

        if (matches) {
          phraseMatched = true;
          index += phrase.length - 1;
          break;
        }
      }

      if (!phraseMatched) {
        result.push(tokens[index]);
      }
    }

    return result;
  }

  private expandCompoundTokens(tokens: string[]): string[] {
    if (!tokens.length) {
      return tokens;
    }

    const expanded: string[] = [];

    tokens.forEach((token) => {
      const split = this.splitRepeatedToken(token);
      if (split) {
        expanded.push(...split);
      } else {
        expanded.push(token);
      }
    });

    return this.combineSingleLetterTokens(expanded);
  }

  private splitRepeatedToken(token: string): string[] | null {
    if (!token || token.length < 4) {
      return null;
    }

    for (
      let segmentLength = 2;
      segmentLength <= Math.floor(token.length / 2);
      segmentLength += 1
    ) {
      if (token.length % segmentLength !== 0) {
        continue;
      }

      const segment = token.slice(0, segmentLength);
      if (segment.length < 2) {
        continue;
      }

      const repetitions = token.length / segmentLength;
      if (segment.repeat(repetitions) === token) {
        return Array.from({ length: repetitions }, () => segment);
      }
    }

    return null;
  }

  private combineSingleLetterTokens(tokens: string[]): string[] {
    if (!tokens.length) {
      return tokens;
    }

    const combined: string[] = [];
    let index = 0;

    while (index < tokens.length) {
      const token = tokens[index];

      if (token.length === 1) {
        const nextIndex = index + 1;

        if (nextIndex < tokens.length && tokens[nextIndex].length > 1) {
          combined.push(token + tokens[nextIndex]);
          index += 2;
          continue;
        }

        let runEnd = index;
        let concatenated = '';
        while (runEnd < tokens.length && tokens[runEnd].length === 1) {
          concatenated += tokens[runEnd];
          runEnd += 1;
        }

        if (runEnd === tokens.length && index === 0) {
          combined.push(concatenated);
          break;
        }

        combined.push(token);
        index += 1;
        continue;
      }

      combined.push(token);
      index += 1;
    }

    return combined;
  }

  private removeConnectorTokens(tokens: string[]): string[] {
    if (!tokens.length) {
      return tokens;
    }
    return tokens.filter((token) => !this.restaurantConnectorTokens.has(token));
  }

  private tokensSharePrefix(
    shorter: string[],
    longer: string[],
    prefixLength: number,
  ): boolean {
    if (shorter.length < prefixLength || longer.length < prefixLength) {
      return false;
    }
    for (let index = 0; index < prefixLength; index += 1) {
      if (shorter[index] !== longer[index]) {
        return false;
      }
    }
    return true;
  }

  private shouldMergeRestaurantTokens(
    left: string[],
    right: string[],
  ): boolean {
    if (!left.length || !right.length) {
      return false;
    }

    const [shorterOriginal, longerOriginal] =
      left.length <= right.length ? [left, right] : [right, left];

    const shorter = this.stripLeadingDescriptorTokens(shorterOriginal);
    const longer = this.stripLeadingDescriptorTokens(longerOriginal);

    const baseShorter = shorter.length > 0 ? shorter : shorterOriginal;
    const baseLonger = longer.length > 0 ? longer : longerOriginal;

    const normalizedShorter = this.expandCompoundTokens(
      this.removeDescriptorPhrases(this.removeConnectorTokens(baseShorter)),
    );
    const normalizedLonger = this.expandCompoundTokens(
      this.removeDescriptorPhrases(this.removeConnectorTokens(baseLonger)),
    );

    if (!normalizedShorter.length || !normalizedLonger.length) {
      return false;
    }

    const prefixLength = Math.min(2, normalizedShorter.length);
    if (prefixLength === 0) {
      return false;
    }

    if (
      !this.tokensSharePrefix(normalizedShorter, normalizedLonger, prefixLength)
    ) {
      return false;
    }

    const shorterRemainder = normalizedShorter.slice(prefixLength);
    const longerRemainder = normalizedLonger.slice(prefixLength);

    if (
      normalizedShorter.length >= 3 &&
      shorterRemainder.length === 0 &&
      longerRemainder.length > 0
    ) {
      return true;
    }

    const significantShorter = this.removeDescriptorTokens(
      this.removeDescriptorPhrases(this.expandCompoundTokens(shorterRemainder)),
    );
    const significantLonger = this.removeDescriptorTokens(
      this.removeDescriptorPhrases(this.expandCompoundTokens(longerRemainder)),
    );

    if (significantShorter.length === 0 && significantLonger.length === 0) {
      return true;
    }

    if (
      significantShorter.length === significantLonger.length &&
      significantShorter.every(
        (token, index) => token === significantLonger[index],
      )
    ) {
      return true;
    }

    if (significantShorter.length === 1 && significantLonger.length >= 2) {
      const abbreviation = significantLonger.map((token) => token[0]).join('');
      if (abbreviation && abbreviation === significantShorter[0]) {
        return true;
      }
    }

    if (significantLonger.length === 1 && significantShorter.length >= 2) {
      const abbreviation = significantShorter.map((token) => token[0]).join('');
      if (abbreviation && abbreviation === significantLonger[0]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple edit distance calculation (Levenshtein distance)
   */
  private calculateEditDistance(str1: string, str2: string): number {
    const matrix: number[][] = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(0) as number[]);

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}
