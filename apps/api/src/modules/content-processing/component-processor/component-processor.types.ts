import { EntityType, ActivityLevel } from '@prisma/client';

/**
 * Component Processor Types
 *
 * Implements PRD Section 6.5 - Component-Based DB Processing Guide
 * Provides type definitions for all 6 component processors that handle different
 * entity combinations from LLM output
 */

// Input types for component processing
export interface ProcessedMention {
  tempId: string;

  // Restaurant data
  restaurantNormalizedName?: string;
  restaurantOriginalText?: string;
  restaurantTempId?: string;
  restaurantAttributes?: string[];

  // Dish/Category data
  dishOrCategoryNormalizedName?: string;
  dishOrCategoryOriginalText?: string;
  dishOrCategoryTempId?: string;
  dishCategories?: string[];
  dishPrimaryCategory?: string;

  // Dish attributes
  dishAttributesSelective?: string[];
  dishAttributesDescriptive?: string[];

  // Processing flags
  isMenuItem?: boolean;
  generalPraise?: boolean;

  // Source metadata
  sourceType: 'post' | 'comment';
  sourceId: string;
  sourceUrl: string;
  subreddit: string;
  contentExcerpt: string;
  author?: string;
  upvotes: number;
  createdAt: Date;
}

export interface ResolvedEntities {
  tempIdToEntityIdMap: Map<string, string>;
  entityDetails: Map<
    string,
    {
      entityId: string;
      name: string;
      type: EntityType;
      aliases: string[];
    }
  >;
}

// Component processor results
export interface ComponentResult {
  componentName: string;
  processed: boolean;
  success: boolean;
  operations: ComponentOperation[];
  error?: string;
  metrics: {
    connectionsCreated: number;
    connectionsUpdated: number;
    mentionsCreated: number;
    processingTimeMs: number;
  };
}

export interface ComponentOperation {
  operationType:
    | 'create_connection'
    | 'update_connection'
    | 'create_mention'
    | 'update_entity';
  entityId?: string;
  connectionId?: string;
  mentionId?: string;
  details: Record<string, any>;
}

// Connection-related types
export interface ConnectionAttributes {
  categories: string[];
  dishAttributes: string[];
  restaurantAttributes: string[];
  isMenuItem: boolean;
}

export interface ConnectionMetrics {
  mentionCount: number;
  totalUpvotes: number;
  recentMentionCount: number;
  lastMentionedAt: Date;
  activityLevel: ActivityLevel;
  topMentions: TopMention[];
}

export interface TopMention {
  mentionId: string;
  score: number;
  upvotes: number;
  createdAt: Date;
  sourceUrl: string;
  author?: string;
  contentExcerpt: string;
}

export interface CreateConnectionInput {
  restaurantId: string;
  dishOrCategoryId: string;
  categories: string[];
  dishAttributes: string[];
  restaurantAttributes: string[];
  isMenuItem: boolean;
  initialMention: ProcessedMention;
}

export interface UpdateConnectionInput {
  connectionId: string;
  newMention: ProcessedMention;
  additionalCategories?: string[];
  additionalDishAttributes?: string[];
  additionalRestaurantAttributes?: string[];
}

// Attribute processing types
export interface AttributeMatchResult {
  existingConnections: {
    connectionId: string;
    restaurantId: string;
    dishOrCategoryId: string;
    attributes: ConnectionAttributes;
    metrics: ConnectionMetrics;
  }[];
  matchedSelectiveAttributes: string[];
  unmatchedSelectiveAttributes: string[];
  descriptiveAttributesToAdd: string[];
}

export interface AttributeProcessingConfig {
  enableSelectiveMatching: boolean;
  enableDescriptiveAddition: boolean;
  requireExactAttributeMatch: boolean;
  maxAttributesPerConnection: number;
}

// Component processor configuration
export interface ComponentProcessorConfig {
  enableParallelProcessing: boolean;
  maxConcurrentComponents: number;
  enableMetrics: boolean;
  enableErrorRecovery: boolean;
  attributeProcessing: AttributeProcessingConfig;
}

// Processing context for components
export interface ComponentProcessingContext {
  batchId: string;
  mention: ProcessedMention;
  resolvedEntities: ResolvedEntities;
  config: ComponentProcessorConfig;
  existingConnections?: Map<string, any>; // Cache for connection lookups
}

// Consolidated processing result
export interface ComponentProcessingResult {
  batchId: string;
  totalMentionsProcessed: number;
  componentResults: ComponentResult[];
  overallSuccess: boolean;
  processingTimeMs: number;
  metrics: {
    connectionsCreated: number;
    connectionsUpdated: number;
    mentionsCreated: number;
    entitiesUpdated: number;
    errorsEncountered: number;
  };
  errors: string[];
}

// Base processor interface
export interface ComponentProcessor {
  readonly componentName: string;

  /**
   * Check if this component should process the given mention
   */
  shouldProcess(
    mention: ProcessedMention,
    context: ComponentProcessingContext,
  ): boolean;

  /**
   * Process the mention and return results
   */
  process(context: ComponentProcessingContext): Promise<ComponentResult>;
}

// Processing decision logic types
export interface ProcessingDecision {
  componentName: string;
  shouldProcess: boolean;
  reason: string;
  requiredEntities: string[];
  expectedOperations: string[];
}

// Attribute logic types (PRD Section 6.5.3)
export interface SelectiveAttributeMatch {
  dishOrCategoryId: string;
  connectionId: string;
  matchedAttributes: string[];
  attributeType: 'selective';
}

export interface DescriptiveAttributeAddition {
  connectionId: string;
  attributesToAdd: string[];
  attributeType: 'descriptive';
}

export interface AttributeProcessingResult {
  selectiveMatches: SelectiveAttributeMatch[];
  descriptiveAdditions: DescriptiveAttributeAddition[];
  newConnectionsNeeded: CreateConnectionInput[];
  processing: 'selective_only' | 'descriptive_only' | 'mixed' | 'none';
}

// Error types for component processing
export class ComponentProcessingError extends Error {
  constructor(
    public componentName: string,
    public operation: string,
    message: string,
    public context?: any,
  ) {
    super(`[${componentName}] ${operation}: ${message}`);
    this.name = 'ComponentProcessingError';
  }
}

export class AttributeProcessingError extends ComponentProcessingError {
  constructor(
    componentName: string,
    operation: string,
    message: string,
    public attributeType: 'selective' | 'descriptive',
    context?: any,
  ) {
    super(componentName, operation, message, context);
    this.name = 'AttributeProcessingError';
  }
}
