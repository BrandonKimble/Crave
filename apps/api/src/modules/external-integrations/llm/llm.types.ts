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
 * LLM Output Structure as defined in PRD Section 6.3.2
 */
export interface LLMOutputStructure {
  mentions: LLMMention[];
}

export interface LLMMention {
  temp_id: string;
  restaurant: LLMEntityRef;
  restaurant_attributes: string[] | null;
  dish_or_category: LLMEntityRef | null;
  dish_attributes: LLMDishAttribute[] | null;
  is_menu_item: boolean;
  general_praise: boolean;
  source: LLMSource;
}

export interface LLMEntityRef {
  normalized_name: string | null;
  original_text: string | null;
  temp_id: string;
}

export interface LLMDishAttribute {
  attribute: string;
  type: 'selective' | 'descriptive';
}

export interface LLMSource {
  type: 'post' | 'comment';
  id: string;
  url: string;
  upvotes: number;
  created_at: string;
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
