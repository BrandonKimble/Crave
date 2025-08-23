import { z } from 'zod';

/**
 * LLM Data Schemas
 *
 * Type-safe validation schemas for LLM input/output structures.
 * Ensures data integrity in LLM processing pipeline.
 */

// ==========================================
// Entity Schemas
// ==========================================

export const LLMRestaurantSchema = z.object({
  temp_id: z.string(),
  name: z.string().min(1).max(100),
  address: z.string().optional(),
  neighborhood: z.string().optional(),
  cuisine_type: z.string().optional(),
  price_range: z.enum(['$', '$$', '$$$', '$$$$']).optional(),
});

export type LLMRestaurant = z.infer<typeof LLMRestaurantSchema>;

export const LLMDishSchema = z.object({
  temp_id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  is_menu_item: z.boolean(),
  category: z.string().optional(),
  price: z.number().positive().optional(),
});

export type LLMDish = z.infer<typeof LLMDishSchema>;

export const LLMAttributeSchema = z.object({
  temp_id: z.string(),
  name: z.string().min(1).max(100),
  category: z.enum(['ambiance', 'service', 'feature', 'dietary', 'other']),
  value: z.string().optional(),
});

export type LLMAttribute = z.infer<typeof LLMAttributeSchema>;

// ==========================================
// Mention Schema
// ==========================================

export const LLMMentionSchema = z.object({
  // Identifiers
  temp_id: z.string(),
  restaurant_temp_id: z.string(),
  food_temp_id: z.string().optional(),
  attribute_temp_ids: z.array(z.string()).default([]),

  // Content
  source_content: z.string(),
  source_url: z.string().url(),
  author: z.string(),
  created_at: z.number(),

  // Sentiment & Quality
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  confidence_score: z.number().min(0).max(1),
  general_praise: z.boolean(),

  // Food specifics (when food_temp_id exists)
  is_menu_item: z.boolean().optional(),
  food_category: z.string().optional(),

  // Metadata
  reddit_post_id: z.string(),
  reddit_comment_id: z.string().optional(),
  subreddit: z.string(),
});

export type LLMMention = z.infer<typeof LLMMentionSchema>;

// ==========================================
// LLM Output Structure
// ==========================================

export const LLMFlatOutputStructureSchema = z.object({
  restaurants: z.array(LLMRestaurantSchema),
  dishes: z.array(LLMDishSchema),
  attributes: z.array(LLMAttributeSchema),
  mentions: z.array(LLMMentionSchema),
  processing_metadata: z
    .object({
      chunk_id: z.string(),
      processing_time_ms: z.number(),
      token_count: z.number().optional(),
      model: z.string(),
    })
    .optional(),
});

export type LLMFlatOutputStructure = z.infer<
  typeof LLMFlatOutputStructureSchema
>;

// ==========================================
// LLM Input Structure
// ==========================================

export const LLMInputPostSchema = z.object({
  id: z.string(),
  title: z.string(),
  selftext: z.string().default(''),
  subreddit: z.string(),
  author: z.string(),
  permalink: z.string(),
  score: z.number(),
  created_utc: z.number(),
  comments: z.array(z.any()).default([]),
});

export type LLMInputPost = z.infer<typeof LLMInputPostSchema>;

export const LLMInputCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  author: z.string(),
  score: z.number(),
  created_utc: z.number(),
  parent_id: z.string().nullable(),
  permalink: z.string(),
  subreddit: z.string(),
});

export type LLMInputComment = z.infer<typeof LLMInputCommentSchema>;

export const LLMInputSchema = z.object({
  posts: z.array(LLMInputPostSchema),
  comments: z.array(LLMInputCommentSchema),
  metadata: z
    .object({
      subreddit: z.string(),
      batch_id: z.string(),
      timestamp: z.date(),
    })
    .optional(),
});

export type LLMInput = z.infer<typeof LLMInputSchema>;

// ==========================================
// Chunk Processing Schemas
// ==========================================

export const LLMChunkSchema = z.object({
  chunk_id: z.string(),
  content: z.string(),
  comment_count: z.number(),
  estimated_tokens: z.number(),
  metadata: z.record(z.any()).optional(),
});

export type LLMChunk = z.infer<typeof LLMChunkSchema>;

export const LLMChunkResultSchema = z.object({
  chunks: z.array(LLMChunkSchema),
  total_chunks: z.number(),
  total_comments: z.number(),
  metadata: z.array(
    z.object({
      chunkId: z.string(),
      commentCount: z.number(),
      estimatedProcessingTime: z.number(),
      rootCommentScore: z.number().optional(),
    }),
  ),
});

export type LLMChunkResult = z.infer<typeof LLMChunkResultSchema>;

// ==========================================
// Processing Result Schemas
// ==========================================

export const LLMProcessingResultSchema = z.object({
  success: z.boolean(),
  data: LLMFlatOutputStructureSchema.optional(),
  error: z.string().optional(),
  metrics: z.object({
    processing_time_ms: z.number(),
    tokens_used: z.number().optional(),
    chunks_processed: z.number(),
    mentions_extracted: z.number(),
  }),
});

export type LLMProcessingResult = z.infer<typeof LLMProcessingResultSchema>;

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Validate LLM output structure
 */
export function validateLLMOutput(data: unknown): LLMFlatOutputStructure {
  return LLMFlatOutputStructureSchema.parse(data);
}

/**
 * Safe validation that returns null on failure
 */
export function safeValidateLLMOutput(
  data: unknown,
): LLMFlatOutputStructure | null {
  const result = LLMFlatOutputStructureSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate LLM input
 */
export function validateLLMInput(data: unknown): LLMInput {
  return LLMInputSchema.parse(data);
}

/**
 * Validate mention data
 */
export function validateLLMMention(data: unknown): LLMMention {
  return LLMMentionSchema.parse(data);
}

/**
 * Merge multiple LLM outputs
 */
export function mergeLLMOutputs(
  outputs: LLMFlatOutputStructure[],
): LLMFlatOutputStructure {
  const merged: LLMFlatOutputStructure = {
    restaurants: [],
    dishes: [],
    attributes: [],
    mentions: [],
  };

  const seenRestaurants = new Set<string>();
  const seenDishes = new Set<string>();
  const seenAttributes = new Set<string>();
  const seenMentions = new Set<string>();

  for (const output of outputs) {
    // Merge restaurants (deduplicated)
    for (const restaurant of output.restaurants) {
      if (!seenRestaurants.has(restaurant.temp_id)) {
        merged.restaurants.push(restaurant);
        seenRestaurants.add(restaurant.temp_id);
      }
    }

    // Merge dishes (deduplicated)
    for (const dish of output.dishes) {
      if (!seenDishes.has(dish.temp_id)) {
        merged.dishes.push(dish);
        seenDishes.add(dish.temp_id);
      }
    }

    // Merge attributes (deduplicated)
    for (const attribute of output.attributes) {
      if (!seenAttributes.has(attribute.temp_id)) {
        merged.attributes.push(attribute);
        seenAttributes.add(attribute.temp_id);
      }
    }

    // Merge mentions (deduplicated)
    for (const mention of output.mentions) {
      if (!seenMentions.has(mention.temp_id)) {
        merged.mentions.push(mention);
        seenMentions.add(mention.temp_id);
      }
    }
  }

  return merged;
}

/**
 * Calculate quality score from mentions
 * Implements PRD Section 5.3 scoring logic
 */
export function calculateQualityScore(mentions: LLMMention[]): number {
  if (mentions.length === 0) return 0;

  let score = 0;
  let weight = 0;

  for (const mention of mentions) {
    // Base score from confidence
    const baseScore = mention.confidence_score * 100;

    // Sentiment multiplier
    const sentimentMultiplier =
      mention.sentiment === 'positive'
        ? 1.2
        : mention.sentiment === 'negative'
          ? 0.8
          : mention.sentiment === 'mixed'
            ? 1.0
            : 0.9;

    // General praise bonus
    const praiseBonus = mention.general_praise ? 10 : 0;

    // Calculate mention score
    const mentionScore = baseScore * sentimentMultiplier + praiseBonus;

    // Weight by recency (newer = higher weight)
    const ageInDays = (Date.now() / 1000 - mention.created_at) / 86400;
    const recencyWeight = Math.max(0.5, 1 - ageInDays / 365);

    score += mentionScore * recencyWeight;
    weight += recencyWeight;
  }

  return weight > 0 ? Math.min(100, score / weight) : 0;
}
