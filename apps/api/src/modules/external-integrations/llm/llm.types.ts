/**
 * LLM configuration interface
 */
export interface LLMConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
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
 * LLM API response wrapper
 */
export interface LLMApiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
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
