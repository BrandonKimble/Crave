import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { LoggerService } from '../../../shared';

/**
 * Alias Management Service for Entity Resolution System
 * Implements PRD Section 9.2.1 - Alias management: Automatic alias creation, duplicate prevention, scope-aware resolution
 */

export interface AliasManagementConfig {
  maxAliasLength: number;
  preventCrossScope: boolean;
  deduplicationEnabled: boolean;
}

export interface EntityMergeInput {
  sourceEntityId: string;
  targetEntityId: string;
  sourceAliases: string[];
  targetAliases: string[];
  entityType: EntityType;
}

export interface EntityMergeResult {
  mergedAliases: string[];
  duplicatesRemoved: number;
  crossScopeViolations: string[];
}

@Injectable()
export class AliasManagementService {
  private readonly logger: LoggerService;
  private readonly defaultConfig: AliasManagementConfig = {
    maxAliasLength: 255,
    preventCrossScope: true,
    deduplicationEnabled: true,
  };

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.setContext('AliasManagementService');
  }

  /**
   * Merge aliases from two entities with automatic deduplication
   * Implements PRD Section 9.2.1 - Automatic alias creation when merging entities
   */
  mergeAliases(
    sourceAliases: string[],
    targetAliases: string[],
    originalTexts: string[] = [],
    config: Partial<AliasManagementConfig> = {},
  ): EntityMergeResult {
    const mergeConfig = { ...this.defaultConfig, ...config };

    this.logger.debug('Merging aliases', {
      sourceCount: sourceAliases.length,
      targetCount: targetAliases.length,
      originalTextsCount: originalTexts.length,
    });

    // Combine all alias sources
    const allAliases = [...sourceAliases, ...targetAliases, ...originalTexts];

    // Filter and normalize aliases
    const normalizedAliases = allAliases
      .filter((alias) => alias && typeof alias === 'string')
      .map((alias) => alias.trim())
      .filter(
        (alias) =>
          alias.length > 0 && alias.length <= mergeConfig.maxAliasLength,
      );

    // Remove duplicates if enabled
    let mergedAliases = normalizedAliases;
    let duplicatesRemoved = 0;

    if (mergeConfig.deduplicationEnabled) {
      const deduplicationResult = this.removeDuplicates(normalizedAliases);
      mergedAliases = deduplicationResult.uniqueAliases;
      duplicatesRemoved = deduplicationResult.duplicatesRemoved;
    }

    this.logger.debug('Alias merge completed', {
      totalInput: allAliases.length,
      afterNormalization: normalizedAliases.length,
      finalCount: mergedAliases.length,
      duplicatesRemoved,
    });

    return {
      mergedAliases,
      duplicatesRemoved,
      crossScopeViolations: [], // No cross-scope validation for basic alias merging
    };
  }

  /**
   * Remove duplicate aliases from array using case-insensitive comparison
   * Implements PRD Section 9.2.1 - Duplicate prevention logic
   */
  removeDuplicates(aliases: string[]): {
    uniqueAliases: string[];
    duplicatesRemoved: number;
  } {
    const seen = new Set<string>();
    const uniqueAliases: string[] = [];
    let duplicatesRemoved = 0;

    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase().trim();

      if (!seen.has(normalizedAlias)) {
        seen.add(normalizedAlias);
        uniqueAliases.push(alias); // Keep original casing
      } else {
        duplicatesRemoved++;
      }
    }

    return { uniqueAliases, duplicatesRemoved };
  }

  /**
   * Validate scope constraints for entity types
   * Implements PRD Section 9.2.1 - Scope-aware resolution maintains entity type constraints
   * Implements PRD Section 4.2.2 - Context-dependent attribute scope handling
   */
  validateScopeConstraints(
    entityType: EntityType,
    aliases: string[],
    config: Partial<AliasManagementConfig> = {},
  ): {
    validAliases: string[];
    violations: string[];
  } {
    const mergeConfig = { ...this.defaultConfig, ...config };

    if (!mergeConfig.preventCrossScope) {
      return {
        validAliases: aliases,
        violations: [],
      };
    }

    // PRD Section 4.2.2: Context-dependent attributes must maintain scope
    const scopeViolations: string[] = [];
    const validAliases: string[] = [];

    for (const alias of aliases) {
      const violation = this.checkScopeViolation(alias, entityType);

      if (violation) {
        scopeViolations.push(alias);
        this.logger.warn('Scope violation detected', {
          alias,
          entityType,
          violation,
        });
      } else {
        validAliases.push(alias);
      }
    }

    return {
      validAliases,
      violations: scopeViolations,
    };
  }

  /**
   * Check for scope violations based on entity type
   * PRD Section 4.2.2 - Separate entities by scope (dish vs restaurant attributes)
   */
  private checkScopeViolation(
    alias: string,
    entityType: EntityType,
  ): string | null {
    // Basic scope validation - in real implementation, this could be enhanced
    // with a lookup table or more sophisticated logic

    const lowercaseAlias = alias.toLowerCase().trim();

    // Restaurant-specific terms that shouldn't be in dish attributes
    const restaurantTerms = [
      'patio',
      'romantic',
      'family-friendly',
      'casual',
      'upscale',
      'dive bar',
      'food truck',
      'fine dining',
      'fast casual',
    ];

    // Dish-specific terms that shouldn't be in restaurant attributes
    const dishTerms = [
      'spicy',
      'mild',
      'crispy',
      'tender',
      'juicy',
      'flaky',
      'house-made',
      'gluten-free',
      'dairy-free',
    ];

    switch (entityType) {
      case 'dish_attribute':
        if (restaurantTerms.some((term) => lowercaseAlias.includes(term))) {
          return `Restaurant-specific term "${alias}" not allowed in dish_attribute`;
        }
        break;

      case 'restaurant_attribute':
        if (dishTerms.some((term) => lowercaseAlias.includes(term))) {
          return `Dish-specific term "${alias}" not allowed in restaurant_attribute`;
        }
        break;

      case 'restaurant':
      case 'dish_or_category':
        // No cross-scope restrictions for main entity types
        break;

      default:
        return `Unknown entity type: ${entityType as string}`;
    }

    return null;
  }

  /**
   * Prepare aliases for entity merge operations
   * Implements PRD Section 9.2.1 - Alias management integrates seamlessly with entity resolution system
   */
  prepareAliasesForMerge(
    mergeInput: EntityMergeInput,
    config: Partial<AliasManagementConfig> = {},
  ): EntityMergeResult {
    this.logger.info('Preparing aliases for entity merge', {
      sourceEntityId: mergeInput.sourceEntityId,
      targetEntityId: mergeInput.targetEntityId,
      entityType: mergeInput.entityType,
    });

    // Step 1: Merge aliases with deduplication
    const mergeResult = this.mergeAliases(
      mergeInput.sourceAliases,
      mergeInput.targetAliases,
      [],
      config,
    );

    // Step 2: Validate scope constraints
    const scopeValidation = this.validateScopeConstraints(
      mergeInput.entityType,
      mergeResult.mergedAliases,
      config,
    );

    const finalResult: EntityMergeResult = {
      mergedAliases: scopeValidation.validAliases,
      duplicatesRemoved: mergeResult.duplicatesRemoved,
      crossScopeViolations: scopeValidation.violations,
    };

    this.logger.info('Alias merge preparation completed', {
      sourceEntityId: mergeInput.sourceEntityId,
      targetEntityId: mergeInput.targetEntityId,
      finalAliasCount: finalResult.mergedAliases.length,
      duplicatesRemoved: finalResult.duplicatesRemoved,
      violationsFound: finalResult.crossScopeViolations.length,
    });

    return finalResult;
  }

  /**
   * Add new original text as alias to existing aliases array
   * Implements automatic alias creation for entity resolution
   */
  addOriginalTextAsAlias(
    existingAliases: string[],
    originalText: string,
    config: Partial<AliasManagementConfig> = {},
  ): {
    updatedAliases: string[];
    aliasAdded: boolean;
  } {
    if (!originalText || originalText.trim().length === 0) {
      return {
        updatedAliases: existingAliases,
        aliasAdded: false,
      };
    }

    const mergeResult = this.mergeAliases(
      existingAliases,
      [],
      [originalText],
      config,
    );

    const aliasAdded =
      mergeResult.mergedAliases.length > existingAliases.length;

    return {
      updatedAliases: mergeResult.mergedAliases,
      aliasAdded,
    };
  }
}
