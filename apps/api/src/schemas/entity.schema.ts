import { z } from 'zod';

/**
 * Entity Data Schemas
 * 
 * Type-safe validation schemas for entity structures.
 * Aligns with database schema and PRD entity model.
 */

// ==========================================
// Entity Type Enum
// ==========================================

export const EntityTypeSchema = z.enum(['restaurant', 'dish_or_category', 'attribute']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

// ==========================================
// Base Entity Schema
// ==========================================

export const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  entity_type: EntityTypeSchema,
  quality_score: z.number().min(0).max(100).default(0),
  mention_count: z.number().int().min(0).default(0),
  created_at: z.date(),
  updated_at: z.date(),
  metadata: z.record(z.any()).nullable().optional(),
});

export type BaseEntity = z.infer<typeof BaseEntitySchema>;

// ==========================================
// Restaurant Entity Schema
// ==========================================

export const RestaurantEntitySchema = BaseEntitySchema.extend({
  entity_type: z.literal('restaurant'),
  address: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  cuisine_type: z.string().nullable().optional(),
  price_range: z.enum(['$', '$$', '$$$', '$$$$']).nullable().optional(),
  google_place_id: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  hours: z.record(z.string()).nullable().optional(),
});

export type RestaurantEntity = z.infer<typeof RestaurantEntitySchema>;

// ==========================================
// Dish Entity Schema
// ==========================================

export const DishEntitySchema = BaseEntitySchema.extend({
  entity_type: z.literal('dish_or_category'),
  is_menu_item: z.boolean().default(false),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: z.number().positive().nullable().optional(),
  restaurant_id: z.string().uuid().nullable().optional(),
});

export type DishEntity = z.infer<typeof DishEntitySchema>;

// ==========================================
// Attribute Entity Schema
// ==========================================

export const AttributeEntitySchema = BaseEntitySchema.extend({
  entity_type: z.literal('attribute'),
  category: z.enum(['ambiance', 'service', 'feature', 'dietary', 'other']),
  value: z.string().nullable().optional(),
});

export type AttributeEntity = z.infer<typeof AttributeEntitySchema>;

// ==========================================
// Entity Union Type
// ==========================================

export const EntitySchema = z.union([
  RestaurantEntitySchema,
  DishEntitySchema,
  AttributeEntitySchema,
]);

export type Entity = z.infer<typeof EntitySchema>;

// ==========================================
// Connection Schema
// ==========================================

export const ConnectionSchema = z.object({
  id: z.string().uuid(),
  from_entity_id: z.string().uuid(),
  to_entity_id: z.string().uuid(),
  connection_type: z.enum(['has_dish', 'has_attribute', 'related_to']),
  strength: z.number().min(0).max(1).default(1),
  evidence_count: z.number().int().min(0).default(0),
  created_at: z.date(),
  updated_at: z.date(),
  metadata: z.record(z.any()).nullable().optional(),
});

export type Connection = z.infer<typeof ConnectionSchema>;

// ==========================================
// Mention Schema
// ==========================================

export const MentionSchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  source_url: z.string().url(),
  source_content: z.string(),
  author: z.string(),
  created_at: z.date(),
  source_created_at: z.date(),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  confidence_score: z.number().min(0).max(1),
  general_praise: z.boolean().default(false),
  reddit_post_id: z.string(),
  reddit_comment_id: z.string().nullable().optional(),
  subreddit: z.string(),
  metadata: z.record(z.any()).nullable().optional(),
});

export type Mention = z.infer<typeof MentionSchema>;

// ==========================================
// Alias Schema
// ==========================================

export const AliasSchema = z.object({
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  alias: z.string().min(1).max(200),
  source: z.enum(['user', 'llm', 'google', 'manual']),
  confidence: z.number().min(0).max(1).default(1),
  created_at: z.date(),
});

export type Alias = z.infer<typeof AliasSchema>;

// ==========================================
// Entity Resolution Schema
// ==========================================

export const EntityResolutionRequestSchema = z.object({
  temp_id: z.string(),
  name: z.string(),
  entity_type: EntityTypeSchema,
  context: z.object({
    address: z.string().optional(),
    neighborhood: z.string().optional(),
    cuisine_type: z.string().optional(),
    related_entities: z.array(z.string()).optional(),
  }).optional(),
});

export type EntityResolutionRequest = z.infer<typeof EntityResolutionRequestSchema>;

export const EntityResolutionResultSchema = z.object({
  temp_id: z.string(),
  resolved_id: z.string().uuid(),
  match_type: z.enum(['exact', 'alias', 'fuzzy', 'google', 'new']),
  confidence: z.number().min(0).max(1),
  entity: EntitySchema,
});

export type EntityResolutionResult = z.infer<typeof EntityResolutionResultSchema>;

// ==========================================
// Query Schemas
// ==========================================

export const EntitySearchQuerySchema = z.object({
  query: z.string().min(1),
  entity_types: z.array(EntityTypeSchema).optional(),
  min_quality_score: z.number().min(0).max(100).optional(),
  min_mention_count: z.number().int().min(0).optional(),
  neighborhood: z.string().optional(),
  cuisine_type: z.string().optional(),
  price_range: z.array(z.enum(['$', '$$', '$$$', '$$$$'])).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  sort_by: z.enum(['quality_score', 'mention_count', 'name', 'created_at']).default('quality_score'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type EntitySearchQuery = z.infer<typeof EntitySearchQuerySchema>;

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Validate entity data
 */
export function validateEntity(data: unknown): Entity {
  return EntitySchema.parse(data);
}

/**
 * Safe validation that returns null on failure
 */
export function safeValidateEntity(data: unknown): Entity | null {
  const result = EntitySchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate connection data
 */
export function validateConnection(data: unknown): Connection {
  return ConnectionSchema.parse(data);
}

/**
 * Validate mention data
 */
export function validateMention(data: unknown): Mention {
  return MentionSchema.parse(data);
}

/**
 * Type guards for entity types
 */
export function isRestaurantEntity(entity: Entity): entity is RestaurantEntity {
  return entity.entity_type === 'restaurant';
}

export function isDishEntity(entity: Entity): entity is DishEntity {
  return entity.entity_type === 'dish_or_category';
}

export function isAttributeEntity(entity: Entity): entity is AttributeEntity {
  return entity.entity_type === 'attribute';
}

/**
 * Create entity from resolution request
 */
export function createEntityFromRequest(
  request: EntityResolutionRequest,
  id: string
): Entity {
  const base = {
    id,
    name: request.name,
    entity_type: request.entity_type,
    quality_score: 0,
    mention_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };
  
  switch (request.entity_type) {
    case 'restaurant':
      return {
        ...base,
        entity_type: 'restaurant',
        address: request.context?.address,
        neighborhood: request.context?.neighborhood,
        cuisine_type: request.context?.cuisine_type,
      } as RestaurantEntity;
      
    case 'dish_or_category':
      return {
        ...base,
        entity_type: 'dish_or_category',
        is_menu_item: false,
      } as DishEntity;
      
    case 'attribute':
      return {
        ...base,
        entity_type: 'attribute',
        category: 'other',
      } as AttributeEntity;
  }
}