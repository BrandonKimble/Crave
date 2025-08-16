import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { EntityResolutionService } from '../entity-resolver/entity-resolution.service';
import {
  ContextualAttributeInput,
  BatchResolutionResult,
  EntityResolutionConfig,
} from '../entity-resolver/entity-resolution.types';
import {
  LLMOutputStructure,
  LLMMention,
} from '../../external-integrations/llm/llm.types';

/**
 * Context Determination Service
 *
 * Implements PRD Section 4.2.2 - Context-Dependent Attributes processing
 * Extracts attributes from LLM output and determines scope for entity resolution
 */
@Injectable()
export class ContextDeterminationService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly entityResolutionService: EntityResolutionService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ContextDeterminationService');
  }

  /**
   * Process LLM output and resolve context-dependent attributes
   * Implements PRD Section 4.2.2 - Separate entities by scope
   */
  async processLLMOutputForAttributes(
    llmOutput: LLMOutputStructure,
    config?: Partial<EntityResolutionConfig>,
  ): Promise<BatchResolutionResult> {
    this.logger.info('Processing LLM output for context-dependent attributes', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'process_llm_attributes',
      mentionCount: llmOutput.mentions.length,
    });

    const contextualAttributes = this.extractContextualAttributes(llmOutput);

    this.logger.debug('Extracted contextual attributes from LLM output', {
      correlationId: CorrelationUtils.getCorrelationId(),
      totalAttributes: contextualAttributes.length,
      dishAttributes: contextualAttributes.filter(
        (attr) => attr.scope === 'dish',
      ).length,
      restaurantAttributes: contextualAttributes.filter(
        (attr) => attr.scope === 'restaurant',
      ).length,
    });

    if (contextualAttributes.length === 0) {
      this.logger.info('No contextual attributes found in LLM output');
      return {
        tempIdToEntityIdMap: new Map(),
        resolutionResults: [],
        newEntitiesCreated: 0,
        performanceMetrics: {
          totalProcessed: 0,
          exactMatches: 0,
          aliasMatches: 0,
          fuzzyMatches: 0,
          newEntitiesCreated: 0,
          processingTimeMs: 0,
          averageConfidence: 0,
        },
      };
    }

    return this.entityResolutionService.resolveContextualAttributes(
      contextualAttributes,
      config,
    );
  }

  /**
   * Extract contextual attributes from LLM mentions with scope determination
   * Implements PRD Section 5.2.1 - Scope-Aware Resolution Process
   */
  private extractContextualAttributes(
    llmOutput: LLMOutputStructure,
  ): ContextualAttributeInput[] {
    const attributes: ContextualAttributeInput[] = [];

    for (const mention of llmOutput.mentions) {
      // Extract restaurant attributes (restaurant scope)
      if (
        mention.restaurant_attributes &&
        mention.restaurant_attributes.length > 0
      ) {
        for (const attr of mention.restaurant_attributes) {
          attributes.push({
            tempId: `${mention.temp_id}_restaurant_attr_${attr}`,
            attributeName: attr,
            originalText: attr,
            scope: 'restaurant',
            aliases: [], // LLM normalization already done
          });
        }
      }

      // Extract selective dish attributes (dish scope)
      if (
        mention.dish_attributes_selective &&
        mention.dish_attributes_selective.length > 0
      ) {
        for (const dishAttr of mention.dish_attributes_selective) {
          attributes.push({
            tempId: `${mention.temp_id}_dish_attr_selective_${dishAttr}`,
            attributeName: dishAttr,
            originalText: dishAttr,
            scope: 'dish',
            aliases: [], // LLM normalization already done
          });
        }
      }

      // Extract descriptive dish attributes (dish scope)
      if (
        mention.dish_attributes_descriptive &&
        mention.dish_attributes_descriptive.length > 0
      ) {
        for (const dishAttr of mention.dish_attributes_descriptive) {
          attributes.push({
            tempId: `${mention.temp_id}_dish_attr_descriptive_${dishAttr}`,
            attributeName: dishAttr,
            originalText: dishAttr,
            scope: 'dish',
            aliases: [], // LLM normalization already done
          });
        }
      }
    }

    return attributes;
  }

  /**
   * Process single mention for attributes (helper method for testing)
   */
  processMentionForAttributes(mention: LLMMention): ContextualAttributeInput[] {
    return this.extractContextualAttributes({ mentions: [mention] });
  }
}
