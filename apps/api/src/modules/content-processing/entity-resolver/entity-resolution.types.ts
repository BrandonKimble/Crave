import { EntityType } from '@prisma/client';
import { LLMEntityRef } from '../../external-integrations/llm/llm.types';

/**
 * Entity resolution interfaces for the three-tier resolution system
 * Implements PRD Section 5.2.1 - Resolution Process Flow
 */

/**
 * Input entity for resolution with normalized data and context
 */
export interface EntityResolutionInput {
  tempId: string;
  normalizedName: string;
  originalText: string;
  entityType: EntityType;
  aliases?: string[];
}

/**
 * Resolution result with confidence scoring
 */
export interface EntityResolutionResult {
  tempId: string;
  entityId: string | null;
  confidence: number;
  resolutionTier: 'exact' | 'alias' | 'fuzzy' | 'new' | 'unmatched';
  matchedName?: string;
  originalInput: EntityResolutionInput;
}

/**
 * Batch processing result with ID mapping
 */
export interface BatchResolutionResult {
  tempIdToEntityIdMap: Map<string, string>;
  resolutionResults: EntityResolutionResult[];
  newEntitiesCreated: number;
  performanceMetrics: ResolutionPerformanceMetrics;
}

/**
 * Performance metrics for resolution operations
 */
export interface ResolutionPerformanceMetrics {
  totalProcessed: number;
  exactMatches: number;
  aliasMatches: number;
  fuzzyMatches: number;
  newEntitiesCreated: number;
  processingTimeMs: number;
  averageConfidence: number;
}

/**
 * Resolution configuration options
 */
export interface EntityResolutionConfig {
  fuzzyMatchThreshold: number; // 0.0 to 1.0, higher = more strict
  maxEditDistance: number; // Maximum edit distance for fuzzy matching
  batchSize: number; // Number of entities to process in each batch
  enableFuzzyMatching: boolean;
  confidenceThresholds: {
    high: number; // > 0.85 - merge with existing
    medium: number; // 0.7-0.85 - apply heuristics
    low: number; // < 0.7 - create new entity
  };
}

/**
 * Fuzzy matching result for optimization
 */
export interface FuzzyMatchResult {
  entityId: string;
  confidence: number;
  matchedText: string;
  editDistance: number;
}

/**
 * Context-dependent attribute resolution input
 * Implements PRD Section 4.2.2 - Entity Type Definitions
 */
export interface ContextualAttributeInput {
  tempId: string;
  attributeName: string;
  originalText: string;
  scope: 'dish' | 'restaurant';
  aliases?: string[];
}

/**
 * Helper function to convert LLM entity reference to resolution input
 */
export function llmEntityRefToResolutionInput(
  entityRef: LLMEntityRef,
  entityType: EntityType,
  aliases: string[] = [],
): EntityResolutionInput {
  return {
    tempId: entityRef.temp_id,
    normalizedName: entityRef.normalized_name || entityRef.original_text || '',
    originalText: entityRef.original_text || entityRef.normalized_name || '',
    entityType,
    aliases: [
      ...aliases,
      entityRef.original_text,
      entityRef.normalized_name,
    ].filter(
      (alias): alias is string =>
        alias !== null && alias !== undefined && alias.trim().length > 0,
    ),
  };
}

/**
 * Helper function to convert contextual attribute to resolution input
 */
export function contextualAttributeToResolutionInput(
  attributeInput: ContextualAttributeInput,
): EntityResolutionInput {
  const entityType: EntityType =
    attributeInput.scope === 'dish' ? 'dish_attribute' : 'restaurant_attribute';

  return {
    tempId: attributeInput.tempId,
    normalizedName: attributeInput.attributeName,
    originalText: attributeInput.originalText,
    entityType,
    aliases: attributeInput.aliases || [],
  };
}
