// PRD Section 4 compliant unified entity model types

/**
 * Restaurant Metadata structure
 * PRD 4.1.1: Complex/infrequent Google Places data in JSONB format
 */
export interface RestaurantMetadata {
  phone?: string;
  hours?: Record<string, string>;
  last_places_update?: string;
  additional_place_details?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Top Mention structure
 * PRD 4.1.1: Top mentions metadata structure for connections
 */
export interface TopMention {
  mention_id: string;
  score: number;
  upvotes: number;
  content_excerpt: string;
  source_url: string;
  created_at: string;
}

/**
 * Entity Types for unified entity model
 * PRD 4.2: All food-related entities stored in single table differentiated by type
 */
export enum EntityType {
  RESTAURANT = 'restaurant',
  DISH_OR_CATEGORY = 'dish_or_category',
  DISH_ATTRIBUTE = 'dish_attribute', 
  RESTAURANT_ATTRIBUTE = 'restaurant_attribute',
}

/**
 * Base Entity interface
 * PRD 4.2: Unified entity storage with type differentiation
 */
export interface Entity {
  entityId: string;
  name: string;
  type: EntityType;
  aliases: string[];
  restaurantAttributes: string[];
  restaurantQualityScore?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  googlePlaceId?: string;
  restaurantMetadata: RestaurantMetadata;
  lastUpdated: Date;
  createdAt: Date;
}

/**
 * Connection interface for entity relationships
 * PRD 4.2: Graph-based relationships between entities
 */
export interface Connection {
  connectionId: string;
  restaurantId: string;
  dishOrCategoryId: string;
  categories: string[];
  dishAttributes: string[];
  isMenuItem: boolean;
  mentionCount: number;
  totalUpvotes: number;
  sourceDiversity: number;
  recentMentionCount: number;
  lastMentionedAt?: Date;
  activityLevel: 'low' | 'normal' | 'high' | 'trending';
  topMentions: TopMention[];
  dishQualityScore: number;
  lastUpdated: Date;
  createdAt: Date;
}

/**
 * Mention interface for community evidence
 * PRD 4.2: Reddit community evidence with attribution
 */
export interface Mention {
  mentionId: string;
  connectionId: string;
  sourceType: 'reddit_post' | 'reddit_comment';
  sourceId: string;
  sourceUrl: string;
  subreddit: string;
  contentExcerpt: string;
  author?: string;
  upvotes: number;
  createdAt: Date;
  processedAt: Date;
}

/**
 * Context-aware entity resolution types
 * PRD 4.3.1: Dual-purpose entity handling
 */
export interface EntityInMenuContext {
  entity: Entity;
  connection: Connection;
  isMenuItem: boolean;
}

export interface EntityInCategoryContext {
  entity: Entity;
  connectionCount: number;
  usageType: 'category';
}

export interface DualPurposeEntity {
  entity: Entity;
  menuItemUsage: number;
  categoryUsage: number;
}

/**
 * Location interface for restaurant entities
 * PRD 4.2: Location data for restaurants
 */
export interface LocationData {
  coordinates: {
    lat: number;
    lng: number;
  };
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * API Response types
 */
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Search and filter types
 */
export type EntityUsageType = 'menu_item' | 'category' | 'both';
export type AttributeScope = 'dish' | 'restaurant';

export interface EntityFilter {
  usageContext?: EntityUsageType;
  restaurantId?: string;
  scope?: AttributeScope;
  limit?: number;
  offset?: number;
}

export interface LocationQuery {
  centerPoint: {
    lat: number;
    lng: number;
  };
  radiusKm: number;
  includeInactive?: boolean;
}