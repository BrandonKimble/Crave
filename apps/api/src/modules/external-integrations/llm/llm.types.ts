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
  post_id: string;
  title: string;
  content: string;
  subreddit: string;
  url: string;
  upvotes: number;
  created_at: string;
  comments: LLMComment[];
  extract_from_post?: boolean;
}

export interface LLMComment {
  comment_id: string;
  content: string;
  author: string;
  upvotes: number;
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
  
  // Restaurant fields (ALL preserved)
  restaurant_normalized_name: string | null;
  restaurant_original_text: string | null;
  restaurant_temp_id: string;
  
  // Enhanced dish fields for compound term processing
  dish_primary_category?: string | null;
  dish_categories?: string[] | null;
  dish_original_text?: string | null;
  dish_temp_id?: string | null;
  dish_is_menu_item?: boolean | null;
  
  // Attributes (preserved as arrays)
  restaurant_attributes?: string[] | null;
  dish_attributes?: string[] | null;
  
  // Core processing fields (VITAL)
  general_praise: boolean;
  
  // Source tracking with enhanced fields
  source_type: 'post' | 'comment';
  source_id: string;
  source_content: string;
  source_upvotes?: number | null;
  source_url?: string | null;
  source_created_at?: string | null;
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
