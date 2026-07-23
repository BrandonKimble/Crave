import { RetryOptions } from '../shared/external-integrations.types';

/**
 * LLM configuration interface for Gemini API
 */
export interface LLMConfig {
  apiKey: string;
  model: string;
  queryModel?: string | null;
  queryTimeout?: number;
  queryLogOutputs?: boolean;
  baseUrl?: string;
  timeout?: number;
  headersTimeoutMs?: number;
  bodyTimeoutMs?: number;
  connectTimeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  thinking?: {
    level?: string;
    queryLevel?: string;
    includeThoughts?: boolean;
  };
  thoughtDebug?: {
    enabled: boolean;
    query: boolean;
    content: boolean;
    maxChars: number;
    maxQueryEntries?: number;
    maxContentEntries?: number;
    writeToFile?: boolean;
    filePath?: string;
    filePathQuery?: string;
    filePathContent?: string;
  };
  retryOptions: RetryOptions;
  cache?: {
    systemTtlSeconds: number;
    systemRefreshLeadSeconds: number;
    redisKey: string;
    queryResultTtlSeconds?: number;
    queryResultRedisKey?: string;
    queryResultCacheVersion?: string;
    queryResultLocalTtlSeconds?: number;
    queryResultLocalMaxEntries?: number;
    queryResultIncludeMetadata?: boolean;
  };
}

/**
 * LLM Input Structure as defined in PRD Section 6.3.1
 */
export interface LLMSourceMapEntry {
  canonical_id: string;
  source_type: 'post' | 'comment';
}

export type LLMSourceMap = Record<string, LLMSourceMapEntry>;

export interface LLMModelInput {
  posts: LLMPost[];
}

export interface LLMProcessingInput extends LLMModelInput {
  source_map: LLMSourceMap;
}

export interface LLMPost {
  id: string;
  title: string;
  content: string;
  subreddit: string;
  author: string;
  url: string;
  score: number;
  created_at: string;
  comments: LLMComment[];
  extract_from_post?: boolean;
}

export interface LLMComment {
  id: string;
  content: string;
  author: string;
  score: number;
  created_at: string;
  parent_id: string | null;
  url: string;
}

/**
 * LLM Output Structure - flattened for performance while preserving ALL properties
 * Enhanced for compound term processing with hierarchical decomposition
 */
export interface LLMOutputStructure {
  mentions: LLMMention[];
  usageMetadata?: LLMUsageMetadata | null;
  rateLimitInfo?: RateLimitInfo;
}

export interface EnrichedLLMOutputStructure {
  mentions: EnrichedLLMMention[];
  usageMetadata?: LLMUsageMetadata | null;
  rateLimitInfo?: RateLimitInfo;
}

interface LLMMentionBase {
  temp_id: string;

  // Restaurant fields (REQUIRED)
  restaurant: string; // Normalized name only
  restaurant_surface?: string | null; // Exact string as observed in source

  // Food entity fields (optional - null when no food mentioned)
  food?: string | null; // Normalized name only
  food_surface?: string | null; // Exact string as observed in source
  food_categories?: string[] | null; // Hierarchical decomposition
  ingredients?: string[] | null; // Source-named ingredient nouns for this dish (4.6) — evidence tier; canonical dish ingredients are synthesized offline
  food_category_surfaces?: (string | null)[] | null; // Surface tokens aligned with food_categories
  is_menu_item?: boolean | null;

  // Attributes (preserved as arrays)
  restaurant_attributes?: string[] | null;
  restaurant_attribute_surfaces?: (string | null)[] | null;
  food_attributes?: string[] | null;
  food_attribute_surfaces?: (string | null)[] | null;

  // Core processing fields (VITAL)
  general_praise: boolean;

  // Source tracking from the prompt input, using chunk-local source refs
  // such as SRC001 that are resolved back to canonical IDs server-side.
  source_id: string;
}

/**
 * Flat mention structure with ALL properties preserved
 * Optimized structure for better LLM parsing performance and compound term support
 */
export type LLMMention = LLMMentionBase;

/**
 * Enriched mention shape used after the collector hydrates model output
 * with source metadata and internal provenance.
 */
export interface EnrichedLLMMention extends LLMMentionBase {
  source_id: string;
  source_type: 'post' | 'comment';
  source_content?: string;
  source_ups: number;
  source_url: string;
  source_created_at: string;
  subreddit?: string;
  post_context?: string;

  // Internal processing fields populated server-side
  __restaurantTempId?: string | null;
  __foodEntityTempId?: string | null;
  __foodCategoryTempIds?: Array<{
    name: string;
    tempId: string;
    surface?: string | null;
  }>;
  __inputChunkId?: string | null;
  __extractionInputId?: string | null;
  __sourceDocumentId?: string | null;
}

/**
 * LLM Entity Reference type
 */
export interface LLMEntityRef {
  name: string;
}

/**
 * LLM Source type
 */
export interface LLMSource {
  type: 'post' | 'comment';
  id: string;
  content: string;
  ups?: number | null;
  url?: string | null;
  created_at?: string | null;
}

/**
 * Gemini API response structure
 */
export interface LLMApiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
        thought?: boolean;
        thoughtSignature?: string;
      }>;
      role?: string;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
    citationMetadata?: {
      citationSources: Array<{
        startIndex: number;
        endIndex: number;
        uri: string;
        license: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  modelVersion?: string;
  promptFeedback?: unknown;
}

/**
 * Gemini API request structure
 */
export interface GeminiApiRequest {
  contents: Array<{
    role?: string;
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    candidateCount?: number;
    stopSequences?: string[];
    responseMimeType?: string;
    responseSchema?: object;
    responseJsonSchema?: unknown;
    thinkingConfig?: {
      thinkingBudget?: number;
      thinkingLevel?: string;
      includeThoughts?: boolean;
    };
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
  systemInstruction?: {
    parts: Array<{
      text: string;
    }>;
  };
}

/**
 * Performance metrics for LLM operations
 */
export interface LLMPerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  totalTokensUsed: number;
  lastReset: Date;
  errorCount: number;
  successRate: number;
}

export interface LLMSearchQueryAnalysis {
  restaurants: string[];
  foods: string[];
  foodAttributes: string[];
  restaurantAttributes: string[];
  /** Ingredient nouns searched BY ("burrata", "miso") — the ingredient lane. */
  ingredients?: string[];
  /** Ingredient nouns the user wants ABSENT ("no egg", "without cilantro",
   *  "peanut-free") — the allergy-safe exclusion lane. */
  excludedIngredients?: string[];
  metadata?: Record<string, unknown>;
}

export interface LLMCuisineExtractionResult {
  cuisines: string[];
}

export interface LLMModerationResult {
  allowed: boolean;
  reason: string;
}

export interface LLMAttributePlacementCandidate {
  id: number;
  name: string;
}

export interface LLMAttributePlacementInput {
  term: string;
  kind: 'food_attribute' | 'restaurant_attribute';
  candidates: LLMAttributePlacementCandidate[];
}

export interface LLMAttributePlacementResult {
  decision: 'match' | 'new' | 'reject';
  candidateId: number | null;
  /** Audit-only; absent in prod (llm-audit-policy). */
  reason?: string;
}

export interface LLMAttributeNameInput {
  kind: 'food_attribute' | 'restaurant_attribute';
  /** The synonym group (canonical + aliases) to pick a display name from. */
  names: string[];
}

export interface LLMEntityMatchCandidate {
  id: number;
  name: string;
}

export interface LLMEntityMatchInput {
  /** The newly-extracted entity name to resolve. */
  term: string;
  /** restaurant (a place), food (a dish), or ingredient (a component). */
  kind: 'restaurant' | 'food' | 'ingredient';
  /** Existing entities recalled as the closest matches to `term`. */
  candidates: LLMEntityMatchCandidate[];
}

export interface LLMEntityMatchResult {
  decision: 'match' | 'new';
  candidateId: number | null;
  /** Audit-only; absent in prod (llm-audit-policy). */
  reason?: string;
}

export interface LLMPollAxisConstraint {
  kind: 'category' | 'cuisine' | 'dish_attribute' | 'restaurant_attribute';
  value: string;
}

export interface LLMPollAxis {
  targetType: 'dish' | 'restaurant';
  constraint: LLMPollAxisConstraint | null;
  anchor: string | null;
  marketHint: string | null;
}

export interface LLMPollSubjectResult {
  mode: 'ranked' | 'discussion';
  confidence: number;
  axis: LLMPollAxis | null;
  reason: string;
}

export interface LLMRestaurantPlaceChooserCandidate {
  candidateId: string;
  name: string;
  address?: string | null;
  types?: string[] | null;
  sourceLabels?: string[] | null;
  autocompleteRank?: number | null;
  searchTextRank?: number | null;
}

export interface LLMRestaurantPlaceChooserInput {
  query: string;
  sourceText?: string | null;
  sourceLocale?: {
    city?: string | null;
    region?: string | null;
  } | null;
  candidates: LLMRestaurantPlaceChooserCandidate[];
}

export interface LLMRestaurantPlaceChooserDecision {
  decision: 'select' | 'reject';
  candidateId?: string | null;
}

export type LLMUsageMetadata = NonNullable<LLMApiResponse['usageMetadata']>;

export interface RateLimitInfo {
  waitTimeMs: number;
  totalDurationMs: number;
  processingTimeMs: number;
  guaranteed: boolean;
  workerId: string;
  utilizationPercent: number;
  rpmUtilization: number;
  tpmUtilization: number;
}

export interface SystemInstructionCacheState {
  cacheId: string;
  expiresAt: number;
  refreshedAt: number;
  promptHash: string;
  model: string;
}
