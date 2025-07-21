---
task_id: T01_S01
sprint_sequence_id: S01
status: completed
complexity: High
last_updated: 2025-07-20T12:00:00Z
---

# Task: Core Database Schema Implementation

## Description

Implement the core database schema foundation for Crave Search using Prisma ORM. This task establishes the unified entity-relationship model where all entities (restaurants, dishes, categories, attributes) are stored in a single `entities` table differentiated by type, with relationships modeled through the `connections` table. This approach enables flexible many-to-many relationships while maintaining referential integrity and query performance.

The implementation will replace the current placeholder User model in the Prisma schema with the complete database structure required for the application's core functionality.

## Goal / Objectives

Establish the foundational database schema that supports:

- Unified entity storage with type differentiation for restaurants, dishes, categories, and attributes
- Flexible relationship modeling through connections table
- Reddit community evidence tracking through mentions
- User management and subscription handling
- Performance-optimized structure ready for indexing and constraints

## Acceptance Criteria

- [x] Complete Prisma schema file with all required models and enums
- [x] Unified entities table with proper type differentiation and restaurant-specific fields
- [x] Connections table enabling flexible many-to-many relationships with quality scoring
- [x] Mentions table for Reddit community evidence with attribution
- [x] User management tables with subscription status tracking
- [x] All enum types properly defined (entity_type, activity_level, subscription_status, mention_source)
- [x] Schema follows Prisma naming conventions and best practices
- [x] Existing PrismaService integration maintained
- [x] Schema generates successfully without errors

## PRD References

- Section 4.1: Core Database Schema - Complete unified entity model specification
- Section 4.1.1: Graph-Based Model - Entity-relationship design principles
- Section 2.3: Data Layer - Database architecture and ORM integration requirements

## Subtasks

- [x] Remove placeholder User model from existing schema
- [x] Define all required enum types (entity_type, activity_level, subscription_status, mention_source)
- [x] Implement entities table with unified entity model
- [x] Implement connections table for entity relationships
- [x] Implement mentions table for Reddit community evidence
- [x] Implement users table with subscription management
- [x] Implement subscriptions table for Stripe integration
- [x] Implement user_events table for analytics
- [x] Add proper field types, defaults, and nullability constraints
- [x] Verify schema compiles and generates Prisma client successfully

## Technical Implementation Guidance

### Prisma Schema Structure

Replace the existing schema.prisma content with the complete unified model:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Enum definitions
enum EntityType {
  restaurant
  dish_or_category
  dish_attribute
  restaurant_attribute

  @@map("entity_type")
}

enum ActivityLevel {
  trending
  active
  normal

  @@map("activity_level")
}

enum SubscriptionStatus {
  trialing
  active
  cancelled
  expired

  @@map("subscription_status")
}

enum MentionSource {
  post
  comment

  @@map("mention_source")
}
```

### Entities Model

Implement the unified entity table with proper field types and restaurant-specific columns:

```prisma
model Entity {
  entityId String    @id @default(dbgenerated("gen_random_uuid()")) @map("entity_id") @db.Uuid
  name     String    @db.VarChar(255)
  type     EntityType
  aliases  String[]  @default([])

  // Restaurant-specific columns (null for non-restaurant entities)
  restaurantAttributes    String[] @default([]) @map("restaurant_attributes") @db.Uuid
  restaurantQualityScore  Decimal? @default(0) @map("restaurant_quality_score") @db.Decimal(10, 4)

  // Google Places data
  latitude       Decimal? @db.Decimal(10, 8)
  longitude      Decimal? @db.Decimal(11, 8)
  address        String?  @db.VarChar(500)
  googlePlaceId  String?  @unique @map("google_place_id") @db.VarChar(255)
  restaurantMetadata Json @default("{}") @map("restaurant_metadata") @db.JsonB

  lastUpdated DateTime @default(now()) @map("last_updated")
  createdAt   DateTime @default(now()) @map("created_at")

  // Relations
  restaurantConnections Connection[] @relation("RestaurantEntity")
  dishConnections       Connection[] @relation("DishEntity")

  @@unique([name, type])
  @@map("entities")
}
```

### Connections Model

Implement the flexible relationship model with quality scoring:

```prisma
model Connection {
  connectionId       String    @id @default(dbgenerated("gen_random_uuid()")) @map("connection_id") @db.Uuid
  restaurantId       String    @map("restaurant_id") @db.Uuid
  dishOrCategoryId   String    @map("dish_or_category_id") @db.Uuid
  categories         String[]  @default([]) @db.Uuid
  dishAttributes     String[]  @default([]) @map("dish_attributes") @db.Uuid
  isMenuItem         Boolean   @default(true) @map("is_menu_item")

  // Quality metrics
  mentionCount       Int       @default(0) @map("mention_count")
  totalUpvotes       Int       @default(0) @map("total_upvotes")
  sourceDiversity    Int       @default(0) @map("source_diversity")
  recentMentionCount Int       @default(0) @map("recent_mention_count")
  lastMentionedAt    DateTime? @map("last_mentioned_at")
  activityLevel      ActivityLevel @default(normal) @map("activity_level")
  topMentions        Json      @default("[]") @map("top_mentions") @db.JsonB
  dishQualityScore   Decimal   @default(0) @map("dish_quality_score") @db.Decimal(10, 4)

  lastUpdated DateTime @default(now()) @map("last_updated")
  createdAt   DateTime @default(now()) @map("created_at")

  // Relations
  restaurant Entity @relation("RestaurantEntity", fields: [restaurantId], references: [entityId])
  dish       Entity @relation("DishEntity", fields: [dishOrCategoryId], references: [entityId])
  mentions   Mention[]

  @@unique([restaurantId, dishOrCategoryId, dishAttributes])
  @@map("connections")
}
```

### Implementation Notes

1. **Field Mapping**: Use `@map()` for PostgreSQL snake_case column names while maintaining Prisma camelCase conventions
2. **UUID Generation**: Use `@default(dbgenerated("gen_random_uuid()"))` for PostgreSQL UUID generation
3. **Decimal Precision**: Specify precision for quality scores: `@db.Decimal(10, 4)`
4. **JSON Fields**: Use `@db.JsonB` for PostgreSQL JSONB optimization
5. **Array Fields**: PostgreSQL arrays map directly to Prisma String[] fields
6. **Enum Mapping**: Use `@@map()` for enum table names to match PostgreSQL naming
7. **Unique Constraints**: Implement composite unique constraints as specified in PRD
8. **Relations**: Establish proper foreign key relationships with descriptive relation names

### Integration Requirements

- Maintain compatibility with existing PrismaService dependency injection
- Ensure schema generates valid TypeScript types for API modules
- Support future index and constraint additions (covered in separate tasks)
- Follow NestJS + Prisma patterns established in the codebase

## Output Log

[2025-07-20 13:20] Task started - Core Database Schema Implementation
[2025-07-20 13:20] Status updated to in_progress  
[2025-07-20 13:20] Beginning schema analysis and implementation
[2025-07-20 13:21] ✅ Analyzed existing Prisma schema - found placeholder User model
[2025-07-20 13:22] ✅ Implemented complete database schema replacement: - Defined 4 enum types: EntityType, ActivityLevel, SubscriptionStatus, MentionSource - Implemented Entity model with unified entity storage and restaurant-specific fields - Implemented Connection model with quality metrics and relationship tracking - Implemented Mention model for Reddit community evidence - Implemented User model with subscription management - Implemented Subscription model for Stripe integration - Implemented UserEvent model for analytics tracking
[2025-07-20 13:23] ✅ Enabled DATABASE_URL in .env for validation
[2025-07-20 13:23] ✅ Schema validation successful: "The schema at prisma/schema.prisma is valid 🚀"
[2025-07-20 13:24] ✅ Prisma client generation successful - TypeScript types generated
[2025-07-20 13:24] ✅ All acceptance criteria completed
[2025-07-20 13:24] 🎯 Task completed successfully - Core database schema foundation established
