import { RetryOptions } from '../shared/external-integrations.types';

/**
 * LLM configuration interface for Gemini API
 */
export interface LLMConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  thinking?: {
    enabled: boolean;
    budget: number;
  };
  retryOptions: RetryOptions;
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
}

/**
 * Flat mention structure with ALL properties preserved
 * Optimized structure for better LLM parsing performance and compound term support
 */
export interface LLMMention {
  temp_id: string;

  // Restaurant fields (REQUIRED)
  restaurant_temp_id: string;
  restaurant_name: string;  // Normalized name only

  // Food entity fields (optional - null when no food mentioned)
  food_temp_id?: string | null;
  food_name?: string | null;  // Normalized name only
  food_categories?: string[] | null;  // Hierarchical decomposition
  is_menu_item?: boolean | null;

  // Attributes (preserved as arrays)
  restaurant_attributes?: string[] | null;
  food_attributes_selective?: string[] | null;
  food_attributes_descriptive?: string[] | null;

  // Core processing fields (VITAL)
  general_praise: boolean;

  // Source tracking with enhanced fields
  source_type: 'post' | 'comment';
  source_id: string;
  source_content: string;
  source_ups: number;
  source_url: string;
  source_created_at: string;
}

/**
 * LLM Entity Reference type
 */
export interface LLMEntityRef {
  name: string;
  temp_id: string;
}

/**
 * LLM Dish Attribute type
 */
export interface LLMDishAttribute {
  attribute: string;
  type: 'selective' | 'descriptive';
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
  };
  modelVersion?: string;
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
