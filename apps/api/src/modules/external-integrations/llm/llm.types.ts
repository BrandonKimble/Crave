import { RetryOptions } from '../shared/external-integrations.types';

/**
 * LLM configuration interface for Gemini API
 */
export interface LLMConfig {
  apiKey: string;
  model: string;
  queryModel?: string | null;
  queryTimeout?: number;
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
    enabled: boolean;
    budget?: number;
    level?: string;
    queryLevel?: string;
    includeThoughts?: boolean;
  };
  retryOptions: RetryOptions;
  cache?: {
    systemTtlSeconds: number;
    systemRefreshLeadSeconds: number;
    redisKey: string;
  };
}

/**
 * LLM Input Structure as defined in PRD Section 6.3.1
 */
export interface LLMInputStructure {
  posts: LLMPost[];
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

/**
 * Flat mention structure with ALL properties preserved
 * Optimized structure for better LLM parsing performance and compound term support
 */
export interface LLMMention {
  temp_id: string;

  // Restaurant fields (REQUIRED)
  restaurant: string; // Normalized name only
  restaurant_surface?: string | null; // Exact string as observed in source

  // Food entity fields (optional - null when no food mentioned)
  food?: string | null; // Normalized name only
  food_surface?: string | null; // Exact string as observed in source
  food_categories?: string[] | null; // Hierarchical decomposition
  food_category_surfaces?: (string | null)[] | null; // Surface tokens aligned with food_categories
  is_menu_item?: boolean | null;

  // Attributes (preserved as arrays)
  restaurant_attributes?: string[] | null;
  restaurant_attribute_surfaces?: (string | null)[] | null;
  food_attributes?: string[] | null;
  food_attribute_surfaces?: (string | null)[] | null;

  // Core processing fields (VITAL)
  general_praise: boolean;

  // Source tracking
  source_id: string;
  // The following are injected server-side (LLM should not emit them),
  // but are required in the enriched mention shape used downstream.
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
  metadata?: Record<string, unknown>;
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
}
