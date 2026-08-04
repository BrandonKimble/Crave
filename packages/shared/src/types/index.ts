// The shared entity model. HISTORY (F1656, 2026-08-04): this header used to read
// "PRD Section 4 compliant unified entity model types" and the file carried a block of
// PRD-§4.1-era shapes that NOTHING imported — EntityInMenuContext, EntityInCategoryContext,
// DualPurposeEntity, LocationData, ApiResponse, PaginatedResponse, EntityFilter,
// LocationQuery (plus EntityUsageType/AttributeScope, live only as EntityFilter's fields).
// A 130-name export census across apps/api and apps/mobile found zero consumers, and the
// banking re-grep found only doc mentions in PRD.md/CRAVE.md, which are not consumers.
// They are deleted. What remains is what both apps actually import.

/**
 * Restaurant Metadata structure
 * PRD 4.1.1: Complex/infrequent Google Places data in JSONB format
 */
export interface RestaurantMetadata {
  phone?: string;
  hours?: Record<string, string>;
  last_places_update?: string;
  additional_place_details?: Record<string, unknown>;
  priceLevel?: number;
  priceLevelUpdatedAt?: string;
  priceSymbol?: string;
  priceText?: string;
  [key: string]: unknown;
}

/**
 * Entity Types for unified entity model
 * PRD 4.2: All food-related entities stored in single table differentiated by type
 */
export enum EntityType {
  RESTAURANT = 'restaurant',
  FOOD = 'food',
  FOOD_ATTRIBUTE = 'food_attribute',
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
  latitude?: number;
  longitude?: number;
  address?: string;
  googlePlaceId?: string;
  restaurantMetadata: RestaurantMetadata;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  priceLevel?: number;
  priceLevelUpdatedAt?: string;
  lastPolledAt?: string;
  primaryLocationId?: string | null;
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
  foodId: string;
  categories: string[];
  foodAttributes: string[];
  mentionCount: number;
  totalUpvotes: number;
  supportMentionCount?: number;
  supportTotalUpvotes?: number;
  sourceDiversity: number;
  lastMentionedAt?: Date;
  lastUpdated: Date;
  createdAt: Date;
}

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

export type OnboardingAnswerValue = string | string[] | number | undefined;

export type OnboardingAnswers = Record<string, OnboardingAnswerValue>;

export interface UserOnboardingProfile {
  status: OnboardingStatus;
  completedAt: string | null;
  onboardingVersion: number;
  selectedCity: string | null;
  previewCity: string | null;
}

export * from './search';
