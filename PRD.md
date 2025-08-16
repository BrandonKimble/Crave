# Crave - Local Food Discovery App

## Product Requirements Document v3.0

---

## 1. Overview & Core System Architecture

### 1.1 Product Vision

This app enables users to quickly make confident dining decisions by surfacing evidence-based dish and restaurant recommendations from community knowledge. It transforms scattered social proof into actionable insights about specific dishes and dining experiences.

### 1.2 Core Value Proposition

- **Evidence-Based Discovery**: Every recommendation backed by specific community mentions and upvotes
- **Dish-Centric Focus**: Find the best version of what you're craving, not just good restaurants
- **Community-Powered**: Leverages authentic discussions from Reddit food communities
- **Mobile-First Experience**: Optimized for quick decisions with detailed evidence when needed

### 1.3 System Architecture Overview

#### 1.3.1 Core System Flow

```
User Query → Cache Check → LLM Analysis → Entity Resolution →
Graph Database Query → Ranking Application → Result Formatting →
Cache Storage → User Response
```

#### 1.3.2 Data Collection Flow

```
Reddit API → Content Retrieval → LLM Processing →
Single Consolidated Processing Phase (Entity Resolution + Mention Scoring + Components) →
Single Database Transaction → Quality Score Computation
```

### 1.4 Core System Architecture

#### 1.4.1 Processing Architecture

- **Modular component system**: Independent processors handle different entity combinations from LLM output
- **Dynamic query system**: Single adaptive SQL query that optimizes based on extracted entities
- **Background data collection**: Dual scheduled cycles (chronological collection + keyword entity search) plus on-demand query-driven collection
- **Real-time query processing**: Entity resolution → dynamic query building → result ranking

#### 1.4.2 Performance Strategy

- **Pre-computed quality scores**: Rankings calculated during data processing, not query time
- **Multi-level caching**: Hot queries (1hr), recent results (24hr), static data (7d+)
- **Single-phase processing**: Streamlined architecture eliminating intermediate JSON structures
- **Batch operations**: Bulk entity resolution, database updates, and mention processing
- **Geographic optimization**: Map-based filtering applied before ranking for performance

### 1.5 Data Collection & Knowledge Synthesis

#### 1.5.1 Community Content Processing

- **Reddit discussion analysis**: Extract dish-restaurant connections, attributes, and sentiment from food community posts/comments
- **Organic category emergence**: Food categories develop naturally from community language patterns rather than predetermined hierarchies
- **Multi-source mention aggregation**: Combine mentions across posts, comments, and discussion threads for comprehensive evidence

#### 1.5.2 Dynamic Ranking & Relevance

- **Quality score evolution**: Dish and restaurant rankings improve with additional community evidence over time
- **Activity indicators**: Real-time trending (🔥) and active (🕐) status based on mention recency patterns
- **Contextual performance scoring**: Restaurant rankings adapt based on query context (category/attribute-specific performance vs. global scores)

---

## 2. Technology Stack

_**Note**: This is a high-level overview of the technology stack. The actual implementation will be determined by the specific requirements of the project._

### 2.1 Frontend Layer

#### 2.1.1 Core Framework

- **React Native**
- **TypeScript**
- **Nativewind**

#### 2.1.2 Essential Libraries

- **React Query** for server state & caching
- **Zustand** for client state management
- **React Navigation**
- **React Hook Form**
- **React Native Maps**
- **React Native MMKV**
- **React Native Reanimated** for advanced animations
- **React Native Placeholder**
- **Expo** (for faster development)
  - expo-location for location services
  - expo-notifications for push notifications
  - expo-linking for deep linking
  - expo-updates for OTA updates

#### 2.1.3 Add When Needed

- **React Native SVG**
- **FlashList**
- **date-fns** for complex date operations
- **Zod** for advanced validation

### 2.2 Backend Layer

#### 2.2.1 Core Framework

- **NestJS**
- **TypeScript**
- **Fastify**

#### 2.2.2 Essential Libraries

- **@nestjs/bull** for background jobs
- **@nestjs/cache-manager** with Redis
- **@nestjs/config** for configuration
- **@nestjs/swagger** for API documentation
- **@nestjs/websockets** for real-time features
- **@nestjs/config** (with dotenv-vault)
- **class-validator & class-transformer**
- **Passport.js** for authentication
- **winston** for logging
- **helmet** (security)
- **express-rate-limit**
- **prom-client** for Prometheus metrics

#### 2.2.3 Add When Needed

- **@nestjs/microservices** if scaling needs arise
- **@nestjs/schedule** for cron jobs
- **Node worker_threads** for CPU-intensive tasks

### 2.3 Data Layer

#### 2.3.1 Database

- **PostgreSQL 15**
- **Prisma**
- **node-postgres** for raw queries when needed

#### 2.3.2 Cache

- **Redis** with ioredis
- **Bull** for job queues
- **Bull Board** for queue monitoring

#### 2.3.3 Migrations

- **Prisma migrations**

### 2.4 Infrastructure

#### 2.4.1 AWS Services

- **RDS** for PostgreSQL
- **ElastiCache** for Redis
- **S3** for storage
- **SNS** for push notifications

#### 2.4.2 Deployment

- **Railway.app** (initial deployment)
- **Docker**
- **GitHub Actions** for CI/CD

#### 2.4.3 Mobile Specific

- **Expo Application Services (EAS)**
  - Build automation
  - OTA updates
  - Push notifications
  - App Store and Play Store deployments

#### 2.4.4 Monitoring

- **Prometheus** for metrics collection (implement in Phase 2)
- **Grafana** for dashboards and visualization
- **Docker Compose** setup for local Prometheus/Grafana development
- **Sentry** for error and mobile crash reporting

#### 2.4.5 Analytics

- **PostHog** (open source) or **Amplitude** (free tier)

### 2.5 External APIs

- **Reddit API** for community data ⚠️ **HYBRID APPROACH CONFIRMED**
  - **Primary Strategy**: Hybrid Pushshift archives + Reddit API approach addresses 1000-item search limitations while maintaining real-time capabilities
  - **Initial Historical Load**: Pushshift archives via Academic Torrents (https://academictorrents.com/details/1614740ac8c94505e4ecb9d88be8bed7b6afddd4) for comprehensive historical data through end-2024
    - **Data Source**: Top 40k subreddits archive (zstd-compressed ndjson format)
    - **Processing**: Stream processing of archived files to avoid memory issues with large datasets
    - **Coverage**: Complete historical coverage without 1000-item limitations
    - **Target Subreddits**: r/austinfood (primary), r/FoodNYC
  - **Ongoing Real-Time Collection**: Reddit API for new data (post-2024)
    - **Cost**: $0 (FREE within rate limits), 100 requests/minute rate limit
    - **Frequency**: Daily/hourly based on subreddit activity (~10-20 posts/day for r/austinfood)
    - **Efficiency**: 1000-item limit manageable for ongoing collection of recent data
  - **Gap Mitigation Strategy**:
    - Start Reddit API collection immediately to minimize 2024-2025 gap
    - Seek additional archives for 2024-2025 bridge period
    - Accept remaining gaps as MVP limitation with user notification
    - Process archives in parallel with ongoing API collection
  - **Cost Optimization**:
    - Minimal API costs for daily refreshes (~few dollars monthly)
    - One-time archive processing overhead
    - Efficient streaming to handle large archive files
  - **Implementation Benefits**:
    - Comprehensive historical foundation for quality scoring
    - Real-time updates for trending/active indicators
    - Bypasses Reddit API search limitations for historical data
    - Scalable approach for multiple subreddits
- **Google Places API** for location services and restaurant data
- **Gemini** or **Deepseek LLM API** for content analysis and entity extraction

### 2.6 Testing Stack

#### 2.6.1 Frontend

- **Jest** for unit testing
- **React Native Testing Library**
- **Maestro** for E2E mobile testing

#### 2.6.2 Backend

- **Jest** for unit testing
- **@nestjs/testing** for integration tests
- **Supertest** for HTTP testing
- **k6** for performance testing

### 2.7 Development Tools

#### 2.7.1 Essential

- **pnpm** for package management
- **Lefthook** for commit rules and git hooks
- **dotenv** for environment management
- **Postman** or **Insomnia** for API testing
- **Storybook** for component development

---

## 3. Hybrid Monorepo & Modular Monolith Architecture

### 3.1 Complete System Architecture

#### 3.1.1 Turborepo Monorepo Structure (Project Root)

```
crave-search/                      # Root monorepo
├── apps/
│   ├── api/                       # NestJS backend (modular monolith)
│   │   ├── src/                   # API application code
│   │   ├── prisma/                # Database schema and migrations
│   │   ├── docker-compose.yml     # Local development services
│   │   ├── package.json           # API dependencies
│   │   └── tsconfig.json          # API TypeScript config
│   │
│   └── mobile/                    # React Native mobile app
│       ├── src/                   # Mobile application code
│       ├── package.json           # Mobile dependencies
│       └── tsconfig.json          # Mobile TypeScript config
│
├── packages/                      # Shared packages (future)
│   └── shared-types/              # Common TypeScript interfaces
│       ├── src/
│       │   ├── api/               # API response types
│       │   ├── entities/          # Database entity types
│       │   └── common/            # Shared utility types
│       └── package.json
│
├── turbo.json                     # Turborepo build pipeline
├── package.json                   # Workspace configuration
├── pnpm-workspace.yaml            # pnpm workspace config
├── .gitignore                     # Git ignore rules
├── lefthook.yml                   # Git hooks configuration
└── PRD.md                         # This document
```

#### 3.1.2 API Modular Monolith Structure (apps/api/src/)

```
apps/api/src/
├── modules/
│   ├── content-processing/          # Domain: Community content ingestion & analysis
│   │   ├── reddit-collector/        # Reddit API integration, data retrieval
│   │   ├── llm-processor/          # LLM content analysis and entity extraction
│   │   ├── entity-resolver/        # Entity resolution and deduplication
│   │   └── process-orchestrator/   # Workflow coordination, score computation, metric aggregation
│   │
│   ├── search-discovery/           # Domain: Query processing & result delivery
│   │   ├── query-engine/           # Entity extraction, dynamic query building
│   │   ├── result-ranking/         # Pre-computed score retrieval and application
│   │   ├── discovery-feed/         # Trending analysis, personalized content
│   │   └── caching-layer/          # Query caching, performance optimization
│   │
│   ├── user-experience/            # Domain: User interactions & features
│   │   ├── user-management/        # Authentication, subscriptions, preferences
│   │   ├── bookmark-system/        # Dish saving, list management, sharing
│   │   ├── search-api/            # Public search endpoints, result formatting
│   │   └── reddit-community/       # Attribution, sharing, community features
│   │
│   ├── external-integrations/      # Domain: Third-party service connections
│   │   ├── google-places/          # Restaurant data, location services
│   │   ├── reddit-api/            # Reddit API client, rate limiting
│   │   ├── llm-api/               # LLM service integration
│   │   └── notification-services/  # Push notifications, email services
│   │
│   └── infrastructure/             # Domain: Cross-cutting system concerns
│       ├── database/              # Schema, migrations, core data access
│       ├── caching/               # Redis abstractions, cache strategies
│       ├── monitoring/            # Logging, metrics, health checks
│       ├── security/              # Auth guards, rate limiting, validation
│       └── configuration/         # Environment config, feature flags
│
├── shared/                        # API-specific shared utilities
│   ├── types/                     # API-specific TypeScript interfaces
│   ├── utils/                     # Helper functions, constants
│   ├── decorators/                # Custom NestJS decorators
│   └── exceptions/                # Custom exception classes
│
├── app.module.ts                  # Root NestJS module
└── main.ts                        # Application bootstrap
```

#### 3.1.3 Mobile App Structure (apps/mobile/src/)

```
apps/mobile/src/
├── components/
│   ├── cards/                     # Dish and restaurant cards
│   ├── layout/                    # Layout components
│   └── ui/                        # Reusable UI components
│
├── screens/
│   ├── Home/                      # Main search and discovery
│   ├── Search/                    # Search results and filters
│   ├── Details/                   # Dish/restaurant details
│   ├── Bookmarks/                 # Saved dishes and lists
│   └── Profile/                   # User account and settings
│
├── services/
│   └── api.ts                     # API client configuration
│
├── store/
│   └── searchStore.ts             # Zustand state management
│
├── navigation/
│   └── index.ts                   # React Navigation setup
│
├── hooks/                         # Custom React hooks
├── utils/                         # Mobile-specific utilities
├── types/                         # Mobile-specific types
└── constants/                     # App constants
```

### 3.2 Architecture Benefits & Tooling Integration

#### 3.2.1 Hybrid Approach Advantages

**Turborepo Monorepo Benefits:**

- **Build Optimization**: Parallel builds, intelligent caching, dependency orchestration
- **Code Sharing**: Shared packages in `packages/` for common types and utilities
- **Developer Experience**: Single repository, unified tooling, consistent development workflow
- **Scalability**: Easy to add new apps (admin dashboard, analytics, etc.)

**Modular Monolith Benefits:**

- **Business Domain Separation**: Clear boundaries between content processing, search, user experience
- **Team Autonomy**: Teams can work independently within domain boundaries
- **Shared Infrastructure**: Common database, caching, monitoring across all domains
- **Deployment Simplicity**: Single API deployment while maintaining internal modularity

#### 3.2.2 Shared Package Strategy

**`@crave-search/shared`** provides shared types and constants across API and mobile apps.

**Contains:**

- Entity types (graph-based model from Section 4.1)
- API request/response types
- Application constants

**Usage:**

```typescript
import { EntityType, ENTITY_TYPES } from '@crave-search/shared';
```

#### 3.2.3 Developer Workflows

**Essential Commands:**

```bash
# Development
pnpm dev                       # Start all apps
pnpm --filter api dev         # API only

# Services
pnpm --filter api docker:up    # PostgreSQL + Redis
pnpm --filter api prisma:studio # Database browser

# Database
turbo run db:migrate          # Run migrations
turbo run db:generate         # Generate Prisma client
pnpm --filter api db:seed      # Seed test data

# Quality
turbo run lint                # Lint all
turbo run type-check         # TypeScript check
```

### 3.3 Domain Responsibilities

#### 3.3.1 Content Processing

Handles all aspects of ingesting and analyzing community content

- **Workflow Orchestration**: Coordinate reddit-collector → llm-processor → entity-resolver workflow
- **Metric Aggregation**: Update connection metrics when new mentions are processed
- **Score Computation**: Calculate global quality scores after connection metrics are updated
- **Background Job Management**: Schedule and manage systematic content processing operations

#### 3.3.2 Search & Discovery

Manages query processing and result delivery using pre-computed data

- **Result Ranking**: Retrieve and apply stored global quality scores for fast ranking
- **Query Optimization**: Use pre-computed scores and activity levels for sub-second responses
- **Discovery Features**: Leverage activity indicators computed during data processing

#### 3.3.3 Supporting Domains

**User Experience**: Focuses on user-facing features and interactions
**External Integrations**: Centralizes third-party service connections
**Infrastructure**: Provides foundational system services

### 3.4 Development and Design Principles

#### 3.4.1 Balanced Architecture: DI for Infrastructure, FP for Business Logic

- **Strategic Dependency Injection**: Use NestJS DI container for stateful services, lifecycle management, and cross-cutting concerns (database connections, external APIs, logging, caching)
- **Functional Programming for Pure Logic**: Implement business rules, data transformations, and calculations as pure functions without DI overhead
- **Utility-First Approach**: Simple operations (deduplication, merging, validation) implemented as utility functions, not injectable services
- **Event-Driven Decoupling**: Replace excessive service-to-service dependencies with event-based communication where appropriate
- **Schema-Based Validation**: Use Zod schemas for runtime validation instead of custom validator services

#### 3.4.2 Event-Driven Communication

- **Asynchronous operations**: If performant, use events for background processing and cross-module notifications
- **Score update events**: If performant, emit events when process-orchestrator completes mention processing to trigger downstream updates
- **User activity events**: Track search patterns and bookmark changes for personalization
- **Decoupled notifications**: Use event bus for sending alerts and updates without tight coupling

#### 3.4.3 Performance-First Architecture

- **Pre-computed rankings**: Calculate all scores right after each content processing cycle, not query time
- **Strategic caching**: Cache at multiple levels (query results, entity data, computed scores)
- **Bulk operations**: Process entities and mentions in batches for database efficiency
- **Background processing**: Move heavy computation (LLM analysis, score calculation) to process-orchestrator

#### 3.4.4 Code Organization Best Practices

- **Domain-driven structure**: Organize code by business domain, not technical layer
- **Single responsibility**: Each module has clear, focused purpose
- **Shared infrastructure**: Common concerns (database, caching, monitoring) centralized in infrastructure domain
- **Testability**: Design for easy unit testing with mocked dependencies and clear interfaces

#### 3.4.5 Monorepo Guidelines

**Dependency Rules:**

- ✅ Apps can import packages (`apps/api` → `@crave-search/shared`)
- ❌ Packages cannot import apps (maintains package independence)
- ✅ Packages can import other packages (for composition)

**Code Placement:**

- **Shared package**: Types, constants, utilities used by multiple apps
- **App-specific**: Framework code, environment config, business logic

---

## 4. Data Model & Database Architecture

### 4.1 Core Database Schema

#### 4.1.1 Graph-Based Model

_**Note**: This design uses a unified entity-relationship model where all entities (restaurants, dishes, categories, attributes) are stored in a single `entities` table differentiated by type, with relationships modeled through the `connections` table. This approach enables flexible many-to-many relationships while maintaining referential integrity and query performance. These schemas may evolve during implementation as requirements are refined._

##### Entities Table

```sql
CREATE TABLE entities (
  entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- Canonical normalized name
  type entity_type NOT NULL, -- 'restaurant', 'dish_or_category', 'dish_attribute', 'restaurant_attribute'
  aliases TEXT[] DEFAULT '{}', -- Original texts and known variations

  -- Restaurant-specific columns (null for non-restaurant entities)
  restaurant_attributes UUID[] DEFAULT '{}',
  restaurant_quality_score DECIMAL(10,4) DEFAULT 0,
  -- Google Places data
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address VARCHAR(500),
  google_place_id VARCHAR(255),
  restaurant_metadata JSONB DEFAULT '{}', -- For complex/infrequent google places data only

  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(name, type),
  UNIQUE(google_place_id) WHERE google_place_id IS NOT NULL,
  INDEX idx_entities_type (type),
  INDEX idx_entities_type_score (type, restaurant_quality_score DESC),
  INDEX idx_entities_name_gin (name gin_trgm_ops),
  INDEX idx_entities_aliases_gin (aliases gin_trgm_ops),
  INDEX idx_entities_restaurant_attributes_gin (restaurant_attributes) WHERE type = 'restaurant',
  INDEX idx_entities_location ON entities USING gist(point(longitude, latitude)) WHERE type = 'restaurant',
  INDEX idx_entities_address_gin (address gin_trgm_ops) WHERE type = 'restaurant'
);

CREATE TYPE entity_type AS ENUM (
  'restaurant',
  'dish_or_category',
  'dish_attribute',
  'restaurant_attribute'
);
```

##### Restaurant Metadata Structure

```json
{
  "phone": "+1-512-555-0123",
  "hours": {"monday": "11:00-22:00", "tuesday": "11:00-22:00", ...},
  "last_places_update": "2024-01-15T10:30:00Z",
  "additional_place_details": {...},
  ...
}
```

##### Connections Table

```sql
CREATE TABLE connections (
  connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES entities(entity_id),
  dish_or_category_id UUID NOT NULL REFERENCES entities(entity_id),
  categories UUID[] DEFAULT '{}', -- dish_or_category entity IDs (connection-scoped)
  dish_attributes UUID[] DEFAULT '{}', -- dish_attribute entity IDs (connection-scoped)
  is_menu_item BOOLEAN NOT NULL DEFAULT true, -- Specific menu item vs general category reference
  mention_count INTEGER DEFAULT 0,
  total_upvotes INTEGER DEFAULT 0,
  source_diversity INTEGER DEFAULT 0,
  recent_mention_count INTEGER DEFAULT 0,
  last_mentioned_at TIMESTAMP,
  activity_level activity_level DEFAULT 'normal',
  top_mentions JSONB DEFAULT '[]',
  dish_quality_score DECIMAL(10,4) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(restaurant_id, dish_or_category_id, dish_attributes), -- Prevent duplicate connections
  INDEX idx_connections_restaurant (restaurant_id),
  INDEX idx_connections_dish (dish_or_category_id),
  INDEX idx_connections_categories_gin (categories),
  INDEX idx_connections_attributes_gin (dish_attributes),
  INDEX idx_connections_menu_item (is_menu_item),
  INDEX idx_connections_mention_count (mention_count DESC),
  INDEX idx_connections_total_upvotes (total_upvotes DESC),
  INDEX idx_connections_source_diversity (source_diversity DESC),
  INDEX idx_connections_recent_mention_count (recent_mention_count DESC),
  INDEX idx_connections_last_mentioned (last_mentioned_at DESC),
  INDEX idx_connections_activity (activity_level),
  INDEX idx_connections_dish_quality_score (dish_quality_score DESC),
  INDEX idx_connections_restaurant_dish_quality (restaurant_id, dish_quality_score DESC),
  INDEX idx_connections_dish_quality (dish_or_category_id, dish_quality_score DESC)
);

CREATE TYPE activity_level AS ENUM ('trending', 'active', 'normal');
```

##### Top Mentions Metadata Structure

```json
[
  {
    "mention_id": "uuid",
    "score": 45.2,
    "upvotes": 67,
    "content_excerpt": "Their tonkotsu ramen is incredible - the broth is so rich",
    "source_url": "https://reddit.com/r/Austin/comments/xyz123",
    "created_at": "2024-01-10T14:20:00Z"
  },
  ...
]
```

##### Mentions Table

```sql
CREATE TABLE mentions (
  mention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES connections(connection_id),
  source_type mention_source NOT NULL, -- 'post', 'comment'
  source_id VARCHAR(255) NOT NULL, -- Reddit post/comment ID
  source_url VARCHAR(500) NOT NULL, -- Full Reddit URL for attribution
  subreddit VARCHAR(100) NOT NULL,
  content_excerpt TEXT NOT NULL, -- Relevant quote for display
  author VARCHAR(255),
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_mentions_connection (connection_id),
  INDEX idx_mentions_upvotes (upvotes DESC),
  INDEX idx_mentions_source (source_type, source_id),
  INDEX idx_mentions_subreddit (subreddit),
  INDEX idx_mentions_created (created_at DESC),
  INDEX idx_mentions_processed (processed_at DESC)
);

CREATE TYPE mention_source AS ENUM ('post', 'comment');
```

##### User & Subscription Tables

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  trial_started_at TIMESTAMP,
  trial_ends_at TIMESTAMP,
  subscription_status subscription_status DEFAULT 'trialing',
  stripe_customer_id VARCHAR(255),
  referral_code VARCHAR(50) UNIQUE,
  referred_by UUID REFERENCES users(user_id),

  INDEX idx_users_subscription_status (subscription_status),
  INDEX idx_users_trial_ends (trial_ends_at),
);

CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'cancelled', 'expired');

CREATE TABLE subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  stripe_subscription_id VARCHAR(255) UNIQUE,
  status subscription_status NOT NULL,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_subscriptions_user (user_id),
  INDEX idx_subscriptions_status (status),
  INDEX idx_subscriptions_period_end (current_period_end)
);

CREATE TABLE user_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_events_user_type (user_id, event_type),
  INDEX idx_user_events_created (created_at DESC)
);
```

### 4.2 Data Model Principles

#### 4.2.1 Graph-Based Unified Entity Model

- **Unified dish_or_category entities**: Serve dual purposes as specific menu items AND general food categories
- **Connection-scoped relationships**: Categories and dish attributes exist only within restaurant→dish connections
- **Restaurant-scoped attributes**: Ambiance, features, and service qualities stored directly on restaurant entities
- **Evidence-driven connections**: All relationships backed by trackable community mentions with scoring
- **All connections are restaurant→dish**: No direct category or attribute connections

#### 4.2.2 Entity Type Definitions

- **restaurant**: Physical dining establishments with location and operational data
- **dish_or_category**: Food items that can be both menu items and general categories
- **dish_attribute**: Connection-scoped descriptors that apply to dishes (spicy, vegan, house-made, Italian when describing dishes)
- **restaurant_attribute**: Restaurant-scoped descriptors that apply to restaurants (patio, romantic, family-friendly, Italian when describing restaurants)

**Context-Dependent Attributes**: Many attributes exist as separate entities based on their contextual scope. For example, "Italian" exists as both a dish_attribute entity (for Italian dishes) and a restaurant_attribute entity (for Italian restaurants), enabling precise query targeting and flexible cross-scope analysis.

### 4.3 Data Model Architecture

#### 4.3.1 Unified dish_or_category Entity Approach

- **Single entity type serves dual purposes**:
  - Node entity (when is_menu_item = true)
  - Connection-scope metadata (stored in categories array)
- **Same entity ID can represent both menu item and category**
- **Eliminates redundancy and ambiguity** in food terminology

#### 4.3.2 Context-Driven Attribute Entity Management

- **Separate entities by scope**: Context-dependent attributes (cuisine, dietary, value, etc.) exist as separate entities based on their scope
- **Scope-aware entity resolution**: Entity resolution matches by name AND scope to find the correct entity
- **Flexible query capabilities**: Enables precise filtering by restaurant attributes vs dish attributes
- **Examples**: "Italian" exists as both dish_attribute and restaurant_attribute entities with different IDs

#### 4.3.3 All Connections are Restaurant-to-dish_or_category

- **Restaurant attributes**: Stored as entity IDs in restaurant entity's metadata (restaurant_attributes: uuid[])
- **Dish attributes**: Connection-scoped entity IDs stored in dish_attributes array
- **Categories**: Connection-scoped entity IDs stored in categories array
- **Only restaurant-to-dish_or_category connections** exist in the connections table

#### 4.3.4 Categories in Connection Scope Only

- **Categories stored as entity ID references** in restaurant→dish_or_category connections
- **Restaurant-category mentions boost scores** of all related dish_or_category items
- **Enables flexible categorization** without entity proliferation

---

## 5. Data Collection Strategy & Architecture

### 5.1 Data Collection Strategy

The system uses a hybrid approach combining comprehensive historical data from Pushshift archives with real-time Reddit API collection. This strategy addresses Reddit API limitations while maintaining both historical depth and real-time capabilities. Implementation details can be found in section 6.

#### 5.1.1 Initial Historical Load (Primary Foundation)

- **Data Source**: Pushshift archives via Academic Torrents (apps/api/data/pushshift)
- **Format**: zstd-compressed ndjson files (one JSON object per line)
- **Target Subreddits**: r/austinfood (primary), r/FoodNYC
- **Processing Method**: Stream processing line-by-line to handle large files without memory issues
- **Coverage**: Complete historical data through end-2024 without 1000-item limitations
- **Implementation**:
  - Download via torrent client (qBittorrent recommended)
  - Decompress using zstd libraries
  - Stream parse with Node.js readline interface
  - Extract entities/mentions via LLM pipeline
  - Build knowledge graph with full historical context
- **Timing**: One-time setup during development, processed in parallel with ongoing API collection
  - **Storage**: Local development (apps/api/data/pushshift/), S3 for production

#### 5.1.2 Ongoing Reddit API Collection

##### Purpose

Maintain real-time updates and capture new community content post-2024 using Reddit API through two complementary collection strategies.

##### Dual Collection Strategy

**Chronological Collection Cycles**

- **Purpose**: Complete recent coverage ensuring no content gaps
- **Method**: Fetch all recent posts chronologically using `/r/subreddit/new`
- **Dynamic Scheduling**: Collection frequency calculated per subreddit based on posting volume
  - Uses safety buffer equation: `safe_interval = (750_posts / avg_posts_per_day)`
  - Examples: r/austinfood (~15 posts/day) = 50 days, r/FoodNYC (~40 posts/day) = 18 days
  - Constraints: minimum 7 days, maximum 60 days between cycles
- **Implementation**: Track last_processed_timestamp, fetch all posts and comments since last cycle

**Keyword Entity Search Cycles**

- **Purpose**: Targeted historical enrichment for specific entities across all timeframes
- **Method**: Search using `/r/subreddit/search?q={entity}&sort=relevance&limit=1000`
- **Schedule**: Monthly, offset from chronological collection to distribute API usage
- **Entity Priority**: High-priority entities selected using priority scoring algorithm considering:
  - Data recency (days since last enrichment, new entity status)
  - Data quality (mention count, source diversity)
  - User demand (query frequency, high-potential entities)
- **Multi-Entity Coverage**: Searches all entity types (restaurants, dishes, attributes) creating comprehensive semantic net
- **Implementation**: Select top 20-30 entities monthly, fetch all comments for relevant posts

**Gap Minimization Strategy**

- **Start immediately**: Begin both collection strategies to minimize 2024-2025 gap
- **Bidirectional enrichment**: Chronological collection discovers new entities, keyword search provides historical context
- **Parallel processing**: Run alongside Pushshift archive processing
- **Overlap detection**: Merge data based on timestamps to avoid duplicates

##### Standard Process Flow

Both historical archive processing and ongoing Reddit API collection follow this unified process:

1. **Data Retrieval**

**Historical (Pushshift Archives):**

- Download and decompress zstd files
- Stream parse ndjson line-by-line
- Extract post/comment objects with timestamps

**Ongoing (Reddit API):**

- Call Reddit API for recent content
- Fetch complete posts and comment threads
- Store post/comment IDs for direct access
- Optimize API usage through batching

2. **Content Processing**

- Parse and structure the retrieved content
- Send to LLM for entity and relationship extraction
- Extract sentiment and context information
- Connect to Google Places API for restaurant entities

3. **Knowledge Graph Updates**

- Create new entities, connections, and mentions as discovered
- When processing content, the system will **create or update ANY connections between entities that are mentioned**
- Store supporting mentions with metrics
- Update raw connection metrics
- Handle overlapping data between archives and API

4. **Quality Score Updates**

- Recalculate quality scores for affected entities
- Update score timestamps
- Maintain score history for trend analysis

##### Processing Approach

- **Unified Pipeline**: Both data sources use the same entity extraction and processing pipeline
- **Temporal Merging**: Combine archive data with API data based on timestamps
- **Duplicate Detection**: Prevent duplicate processing of overlapping content
- **Complete Context Capture**: All discovered entities and relationships from both sources are stored

#### 5.1.3 On-Demand Query-Driven Collection

##### Purpose

Fill knowledge gaps in real-time when user queries return insufficient data from existing archives and recent Reddit API data.

##### Trigger Conditions

- Query results fall below quality or quantity threshold
- High-interest entities with limited data in knowledge graph
- User explicitly requests more information
- Recent trending topics not captured in scheduled collection

##### Process Flow

1. **Query-Specific Keyword Search**

- Extract entities from user query requiring enrichment
- Search Reddit API using `/r/subreddit/search?q={entity}&sort=relevance&limit=1000`
- Fetch complete posts and comment threads for relevant results
- Focus on most relevant content prioritized by Reddit's algorithm

2. **Rapid Processing**

- Use the same LLM pipeline as other collection methods
- Process only content needed for current query
- Optimize for response speed and user experience

3. **Comprehensive Knowledge Graph Updates**

- **Create or update ANY connections between entities that are mentioned** (not just search targets)
- Organic entity discovery through cross-references in found content
- Update query-relevant entities and connections
- Recalculate quality scores for affected entities
- No additional API calls for newly discovered entities

4. **Result Enhancement**

- Immediately incorporate new data into query results
- Provide user with enhanced recommendations

##### Key Characteristics

- **Keyword search methodology**: Uses same approach as ongoing keyword entity search cycles
- **1000-item limit acceptable**: Quality over quantity for gap-filling, most relevant content prioritized
- **Entity expansion**: Discovers and processes all entities mentioned, not just search targets
- **Comment limitation workaround**: Fetches all comments for relevant posts found via keyword search
- **Real-time optimization**: Balances comprehensive processing with response speed requirements

#### 5.1.4 Knowledge Graph Growth

- **Multi-Source Organic Expansion**:

  - **Historical foundation**: Pushshift archives provide comprehensive baseline entity discovery
  - **Chronological growth**: Regular collection cycles capture new entities and evolving discussions
  - **Targeted enrichment**: Keyword entity search fills historical gaps for priority entities
  - **Query-driven discovery**: On-demand collection uncovers entities through user interest patterns
  - **Cross-entity discovery**: Multi-entity-type keyword searches create comprehensive semantic coverage

- **Bidirectional Connection Strengthening**:
  - **Historical context**: Keyword searches provide deep historical context for recently discovered entities
  - **Real-time validation**: Chronological collection validates and updates historical entity relevance
  - **Attribute-driven discovery**: Restaurant and dish attribute searches uncover indirect entity mentions
  - **Quality evolution**: Connections strengthen through diverse mention sources and cross-validation
  - **Comprehensive coverage**: Full timeline knowledge from archives + real-time updates creates robust entity relationships

### 5.2 Shared Entity Resolution System

To ensure accurate metrics and search functionality, the system employs a multi-phase approach to handle name variations of all entity types: restaurants, dish_or_category, dish_attribute, and restaurant_attribute:

#### 5.2.1 Resolution Process Flow

##### Phase 1: LLM Entity Extraction & Normalization

During data collection, the LLM:

- Extracts raw entity mentions from content
- Normalizes spelling, formatting, and common variations
- Provides both raw text and normalized version

##### Phase 2: Database Entity Resolution w/ Batching (Server-Side)

**Scope-Aware Resolution Process**

**Standard Entity Resolution Process**: The system resolves all entity types through name matching with type constraints. Most entities have unambiguous types and resolve directly (restaurants and dish_or_categories). For context-dependent attributes that can exist in both dish and restaurant contexts (cuisine, dietary, value, etc.), the system creates separate entities based on scope and matches by both **name AND entity type** to ensure accurate targeting.

**Standard entity resolution examples:**

- "Franklin BBQ" → Resolves to Franklin BBQ restaurant entity
- "ramen" → Resolves to ramen dish_or_category entity

**Context-dependent attribute resolution (special case):**

- "Italian pasta" → LLM determines dish context → Resolves to Italian dish_attribute entity (ID: 123)
- "Italian restaurant" → LLM determines restaurant context → Resolves to Italian restaurant_attribute entity (ID: 456)
- "vegan burger" → LLM determines dish context → Resolves to vegan dish_attribute entity
- "vegan restaurant" → LLM determines restaurant context → Resolves to vegan restaurant_attribute entity

This enables precise query targeting while maintaining normal operation for all standard entity types.

**Three-Tier Resolution Process**

1. **Exact match against canonical names**: Single query `WHERE name IN (...) AND type = $entity_type`
2. **Alias matching**: Single query with array operations `WHERE aliases && ARRAY[...] AND type = $entity_type`
3. **Fuzzy matching for remaining entities**: Individual queries, edit distance ≤ 3-4, with type constraint

##### Phase 3: Batched Processing Pipeline

1. **Batch deduplication**: Consolidate duplicates within batch by normalized name
2. **In-memory ID mapping**: Build `{temp_id → db_id}` dictionary from results
3. **Bulk database operations**: Single transaction with UPSERT statements
4. **Prepared statement caching**: Cache query execution plans for all resolution and insertion queries

**Resolution Decision Logic**

- **High confidence (>0.85)**: Merge with existing entity, add original text as alias
- **Medium confidence (0.7-0.85)**: Apply heuristic rules or flag for review
- **Low confidence (<0.7)**: Create new entity

**Alias Management**

- When merging with existing entity, add raw text as new alias if not exists

#### 5.2.2 Entity Resolution Optimization

##### Fuzzy Matching Performance Optimizations

If fuzzy matching becomes a bottleneck, implement these alternatives:

**Efficient Algorithm Alternatives:**

- BK-tree or locality-sensitive hashing for faster string matching
- Use approximate string matching libraries optimized for this use case
- Pre-compute common variations/misspellings for high-frequency entities

**Processing Optimizations:**

- Process fuzzy matching in smaller sub-batches to prevent memory issues
- Set time limits per entity rather than count limits
- Use parallel processing for the fuzzy matching step specifically

**Async Processing Approach:**

- Do exact/alias matching first, create entities for non-matches
- Run fuzzy matching in background and merge duplicates later
- Prioritize system responsiveness over perfect deduplication

##### Performance Monitoring

- **Resolution timing**: Track time by entity type and batch size
- **Fuzzy match efficiency**: Monitor expensive operations
- **Database operation metrics**: Measure insert/update performance
- **Memory usage tracking**: Ensure efficient resource utilization

#### 5.2.3 Query Processing Application

The same entity resolution process applies during user queries, with scope determination only for context-dependent attributes, and key optimizations for real-time performance:

1. LLM normalizes user query entity terms and determines contextual scope for attributes
2. System matches against canonical names and aliases with type constraints (standard for all entities)
3. Query processes using matched entities for database search

**Standard entity resolution examples:**

- User searches: "best food at tatsuyas" → "tatsuyas" resolves to "Ramen Tatsu-Ya" restaurant entity
- User searches: "best reuben" → "reuben" resolves to reuben dish_or_category entity

**Context-dependent attribute resolution examples:**

- User searches: "crispy chicken" → "crispy" resolves to crispy dish_attribute, "chicken" to chicken dish_or_category
- User searches: "restaurants with patio" → "patio" resolves to patio restaurant_attribute entity
- User searches: "spicy ramen" → "spicy" resolves to spicy dish_attribute, "ramen" to ramen dish_or_category
- User searches: "best Italian food" → "Italian" resolves to Italian dish_attribute entity (context-dependent)
- User searches: "Italian restaurants" → "Italian" resolves to Italian restaurant_attribute entity (context-dependent)
- User searches: "vegan ramen" → "vegan" resolves to vegan dish_attribute, "ramen" to ramen dish_or_category (context-dependent)

##### Key Differences from Data Collection Resolution

**Read-Only Entity Resolution**

- **Never creates new entities** - only matches existing ones
- **No alias additions** - database remains unchanged
- **Unrecognized terms** treated as search filters or ignored

**Speed-Optimized Processing**

- **Cached common mappings** for frequent queries ("tatsuyas" → "Ramen Tatsu-Ya")
- **Faster fuzzy matching** with optimized thresholds
- **Real-time constraints** - sub-100ms entity resolution target
- **Parallel processing** of multiple entity types

**Search Expansion Strategy**

- **Lower confidence threshold** (>0.6 vs >0.7) - better to include than miss
- **Multi-entity candidates** - include multiple matches when ambiguous
- **Broader category inclusion** - "ramen" expands to all ramen subtypes
- **Alias propagation** - all aliases included in database queries

**Graceful Degradation**

- **Partial entity matching** - process recognized entities, ignore unrecognized
- **Fallback to broader categories** if specific entities not found
- **Maintain query intent** even with imperfect entity resolution

### 5.3 Quality Score Computation

#### 5.3.1 Dish Quality Score (85-90%)

##### Primary component based on connection strength:

- **Connection strength metrics**:
  - Mention count with time decay
  - Total upvotes with time decay
  - Source diversity (unique discussion threads)

##### Secondary component (10-15%):

- **Restaurant context factor**: Derived from the parent restaurant's quality score
  - Provides a small boost to dishes from generally excellent restaurants
  - Serves as effective tiebreaker

#### 5.3.2 Restaurant Quality Score (80% + 20%)

##### Primary component (80%):

- **Top dish connections**: 3-5 highest-scoring dishes at restaurant
  - Captures standout offerings that define restaurant

##### Secondary component (20%):

- **Overall menu consistency**: Average quality across all mentioned dishes
  - Rewards restaurants with strong overall performance

#### 5.3.3 Category/Attribute Performance Score

For restaurant ranking in category/attribute queries:

- **Find relevant dishes**: All restaurant's dishes in queried category or with attribute
- **Contextual score**: Calculate weighted average of dish quality scores for those relevant dishes
- **Replace restaurant score**: Use contextual score instead of restaurant quality score for relevance

---

## 6. Reddit Data Collection Process

**✅ HYBRID APPROACH CONFIRMED**: This section covers the hybrid Pushshift archives + Reddit API approach, addressing 1000-item search limitations while maintaining real-time capabilities.

**Data Collection Sources:**

- **Historical Foundation**: Pushshift archives (comprehensive historical data through end-2024)
- **Real-Time Updates**: Reddit API for ongoing collection (post-2024)
- **On-Demand Collection**: Reddit API for query-driven gap filling

**Collection Triggers:**

- **Historical Load**: One-time processing of Pushshift archives
- **Scheduled Collection**: Chronological and keyword entity search with dynamic, offset scheduling
- **On-Demand Collection**: Triggered by insufficient query results (Reddit API only)

### 6.1 Processing Pipeline

```
1. Data Source Selection & Content Scope Definition
2. Content Retrieval:
   2a. Pushshift Archive Processing (stream parse zstd-ndjson files)
   2b. Reddit API Collection (chronological + keyword entity search)
   2c. On-Demand Query Collection (keyword search for missing entities)
3. LLM Content Processing (outputs structured mentions with temp IDs; see llm-content-processing.md)
4. Single Consolidated Processing Phase:
   4a. Entity Resolution (with in-memory ID mapping; see section 5.2)
   4b. Mention Scoring & Activity Calculation (using existing DB data; see section 6.4)
   4c. Component-Based Processing (all 6 components applied in parallel; see section 6.5)
5. Single Bulk Database Transaction (all updates atomically committed)
6. Quality Score Updates (triggered by new connection data)
```

**Step 1 and 2**: Data Source Selection & Content Retrieval

**Historical Archives (Pushshift):**

- Download and decompress zstd files from torrent
- Stream parse ndjson line-by-line to handle large files
- Extract post/comment objects with full historical context
- No entity selection needed - process all content linearly

**Reddit API Ongoing Collection:**

- **Chronological Collection**: Fetch all recent posts from target subreddits using dynamic scheduling
- **Keyword Entity Search**: Select high-priority entities using priority scoring algorithm, search for historical content
- Rate limiting and cost optimization across both collection types

**On-Demand Collection:**

- Extract entities from user query requiring enrichment
- Keyword search Reddit API for specific missing entities
- Fetch complete posts and comment threads with URLs

**Step 3**: LLM Content Processing (see llm-content-processing.md for more details)

- Input: Reddit posts/comments
- Output: Structured mentions with temp IDs (only JSON structure needed)
- Processing: Entity extraction, normalization, sentiment filtering

**Step 4**: Consolidated Processing Phase (All-in-One)
4a. Entity Resolution: Three-tier matching with in-memory ID mapping
4b. Mention Scoring: Time-weighted scoring with activity level calculation
4c. Component Processing: 6 parallel components handle all entity combinations

**Step 5**: Single Bulk Database Transaction

- Atomic commit of all entities, connections, mentions, and metrics
- Leverages connection pooling and prepared statements

**Step 6**: Quality Score Updates

- Triggered by new connection data from Step 4
- Pre-computed scores for fast query performance

### 6.2 LLM Processing & Entity Extraction

**Primary Function:** Convert Reddit content into structured mentions with normalized entities

**Key Processing Rules** (see `llm-content-processing.md` for full details):

- **Entity Extraction**: All 4 entity types (restaurant, dish_or_category, dish_attribute, restaurant_attribute)
- **Scope Determination**: Context-dependent attributes assigned to correct scope (dish vs restaurant)
- **Sentiment Filtering**: Only positive mentions processed
- **Category Hierarchy**: Create specific → general food categories naturally
- **Entity Normalization**: Handle variations, standardize references

**Output Structure:** Structured mentions with temp IDs (only JSON structure needed in entire pipeline)

### 6.3 LLM Data Collection Input/Output Structures

See llm-content-processing.md for more implementation and processing details.

#### 6.3.1 LLM Input Structure

_**Note**: Based on real Reddit API field analysis (NYC subreddit sample). Uses exact Reddit field names for consistency with source data. Key principles are batch processing efficiency, original context preservation, and hierarchical post-comment relationships._

```json
{
  "posts": [
    {
      "id": "string",
      "title": "string", 
      "selftext": "string",
      "subreddit": "string",
      "author": "string",
      "permalink": "string",
      "score": number,
      "created_utc": number,
      "comments": [
        {
          "id": "string",
          "body": "string",
          "author": "string",
          "score": number,
          "parent_id": "string",
          "permalink": "string",
          "subreddit": "string",
          "created_utc": number
        },
        ...
      ]
    }
  ],
  "comments": [
    {
      "id": "string",
      "body": "string", 
      "author": "string",
      "score": number,
      "parent_id": "string|null",
      "permalink": "string",
      "subreddit": "string",
      "created_utc": number
    },
    ...
  ]
}
```

**Field Descriptions:**
- **`id`**: Reddit ID with type prefix (e.g., `"t3_1mg7vy4"`, `"t1_n6mnqad"`) for type safety
- **`title`**: Post title text
- **`selftext`**: Post body text content (Reddit field name) 
- **`body`**: Comment text content (Reddit field name)
- **`author`**: Reddit username
- **`subreddit`**: Subreddit name without "r/" prefix
- **`parent_id`**: Parent object ID with type prefix (`"t3_postid"` for top-level comments, `"t1_commentid"` for replies)
- **`permalink`**: Reddit URL path for source attribution
- **`score`**: Net votes (upvotes minus downvotes)
- **`created_utc`**: Unix timestamp (Reddit field name)
- **`comments`**: Array for standalone comments from archive-only processing

**Minimal Field Set:** Optimized for food discovery use case, removing unnecessary metadata like editing timestamps, vote ratios, and moderation flags.

#### 6.3.2 LLM Output Structure

_**Note**: Structure will evolve during implementation. Key principles are entity normalization with original text preservation, attribute classification for processing guidance, and source traceability._

```json
{
  "mentions": [
    {
      "temp_id": "string",
      "restaurant": {
        "normalized_name": "string" | null,
        "original_text": "string" | null,
        "temp_id": "string"
      },
      "restaurant_attributes": ["string"] | null,
      "dish_or_category": {
        "normalized_name": "string" | null,
        "original_text": "string" | null,
        "temp_id": "string"
      } | null,
      "dish_attributes": [
        {
          "attribute": ["string"] | null,
          "type": "selective|descriptive"
        },
      ] | null,
      "is_menu_item": boolean,
      "general_praise": boolean,
      "source": {
        "type": "post|comment",
        "id": "string",
        "url": "string",
        "upvotes": number,
        "created_at": "timestamp"
      }
    }
  ]
}
```

### 6.4 Consolidated Processing Phase

The system uses a **single consolidated processing phase** (step 4 above) that eliminates intermediate JSON structures and performs all operations within one efficient database transaction.

**Phase Input:** LLM output structure (the only JSON structure needed)
**Phase Output:** Direct database updates (no intermediate JSON required)

**Key Benefits:**

- **Single database transaction** ensures atomicity and performance
- **In-memory processing** eliminates serialization overhead
- **Batch operations** optimize database performance
- **Simplified error handling** - single phase to retry if needed

Within the single consolidated processing phase, the system performs:

#### 6.4.1 Entity Resolution (step 4a):

_**Note**: see section 5.2 for detailed implementation_

- **Three-tier resolution process**: Entity matching using exact, alias, and fuzzy matching
- **In-memory ID mapping**: Build `{temp_id → db_id}` dictionary from resolution results
- **Batched processing**: All resolution operations performed in batches for optimal performance

#### 6.4.2 Mention Scoring & Activity Calculation (step 4b):

**Purpose**: Calculate time-weighted mention scores and activity levels to support the attribution system and user experience strategy outlined in section 8.2.

**✅ HYBRID DATA SUPPORT**: Activity level calculations leverage real-time Reddit API data for current trends while historical Pushshift data provides comprehensive context for quality scoring.

##### Top Mention Scoring and Management

###### Process Overview

- **Update trigger**: Recalculated each time new mentions are processed
- **Re-scoring process**: Re-score ALL existing top mentions using time-weighted formula: `upvotes × e^(-days_since / 60)`
- **New mention scoring**: Score new mentions with same formula
- **Top mention selection**: Compare all scores and update top 3-5 mentions array
- **Continuous decay**: This approach ensures recent mentions naturally rise to top over time

###### Attribution Integration

- **Purpose**: Top mention is used for attribution display (see section 8.2)
- **Storage format**: Top mentions stored in `connections.top_mentions` JSONB array with mention metadata: `{"mention_id": "uuid", "score": 45.2, "upvotes": 67, ...}`

##### Activity Level Calculation and Management

###### Timestamp Tracking

- **Process**: For each new mention, compare mention timestamp against current `last_mentioned_at` value
- **Update logic**: Update connection metadata if newer mention timestamp found
- **Usage**: This timestamp drives activity level calculations and user experience features

###### Activity Level Determination

- **"trending" (🔥)**: All top 3-5 mentions are within 30 days
- **"active" (🕐)**: `last_mentioned_at` is within 7 days
- **"normal"**: Default state - no activity indicator displayed
- **Real-time relevance**: Activity indicators provide immediate signals to users about community engagement (see section 8.2)

###### Implementation Details

- **Calculation timing**: Activity level determined during this mention processing phase
- **Data dependency**: Uses existing `last_mentioned_at` and `top_mentions` data
- **Database storage**: Activity level stored in `connections.activity_level` enum field
- **Update frequency**: Recalculated when new mentions processed
- **UI integration**: Simple conditional display based on stored activity_level enum
- **Performance**: No additional API calls or real-time calculations required

#### 6.4.3 Component-Based Processing (step 4c):

_**Note**: see section 6.5 below for component details_

- All 6 processing components execute in parallel using resolved entity IDs
- Results accumulated in memory for single transaction

### 6.5 Component-Based DB Processing Guide

#### 6.5.1 Modular Processing Components

The system processes LLM output through independent components. All applicable components process independently for each mention.

**Component 1: Restaurant Entity Processing**

- Always Processed
- Action: Create restaurant entity if missing from database

**Component 2: Restaurant Attributes Processing**

- Processed when: restaurant_attributes is present
- Action: Add restaurant_attribute entity IDs to restaurant entity's metadata if not already present

**Component 3: General Praise Processing**

- Processed when: general_praise is true (mentions containing holistic restaurant praise)
- Action: Boost all existing dish connections for this restaurant
- Note: Do not create dish connections if none exist

**Component 4: Specific Dish Processing**

- Processed when: dish_or_category is present AND is_menu_item is true

With Dish Attributes:

- **All Selective:** Find existing restaurant→dish connections for the same dish that have ANY of the selective attributes; If found: boost those connections; If not found: create new connection with all attributes
- **All Descriptive:** Find ANY existing restaurant→dish connections for the same dish; If found: boost connections + add descriptive attributes if not already present; If not found: create new connection with all attributes
- **Mixed:** Find existing connections for the same dish that have ANY of the selective attributes; If found: boost + add descriptive attributes if not already present; If not found: create new connection with all attributes

Without Dish Attributes:

- Action: Find/create restaurant→dish connection and boost it

**Component 5: Category Processing**

- Processed when: dish_or_category is present AND is_menu_item is false

With Dish Attributes:

- **All Selective:** Find existing dish connections with category; Filter to connections with ANY of the selective attributes; Boost filtered connections; Do not create if no matches found
- **All Descriptive:** Find existing dish connections with category; Boost all found connections; Add descriptive attributes to those connections if not already present; Do not create if no category dishes exist
- **Mixed:** Find existing dish connections with category; Filter to connections with ANY of the selective attributes; Boost filtered connections + add descriptive attributes if not already present; Do not create if no matches found

Without Dish Attributes:

- Action: Find existing dish connections with category and boost them
- Do not create if no category dishes exist

**Component 6: Attribute-Only Processing**

- Processed when: dish_or_category is null AND dish_attributes is present

- **All Selective:** Find existing dish connections with ANY of the selective attributes; Boost those connections; Do not create if no matches found
- **All Descriptive:** Skip processing (no target for descriptive attributes)
- **Mixed:** Find existing dish connections with ANY of the selective attributes; Boost those connections; Ignore descriptive attributes

#### 6.5.2 Entity Creation Rules

**Always Create:**

- Restaurant entities: When restaurant is missing from database
- Specific dish connections: When is_menu_item: true and no matching connection exists

**Never Create (Skip Processing):**

- Category dishes: When category mentioned but no dishes with that category exist
- Attribute matches: When attribute filtering finds no existing dishes
- General praise dish connections: When general_praise: true but no dish connections exist
- Descriptive-only attributes: When no dish_or_category is present

#### 6.5.3 Attribute Processing Logic

**Selective Attributes (OR Logic):**
When finding existing connections with selective attributes, use OR logic (match ANY of the selective attributes):

- "great vegan and gluten-free options" → Boost dishes that are vegan OR gluten-free
- "spicy reuben is amazing" → Find reuben connections that have spicy OR any other selective attributes

**Descriptive Attributes (AND Logic):**
When adding descriptive attributes to connections, ALL descriptive attributes are added together:

- "this pasta is very creamy and rich" → Add both "creamy" AND "rich" to the pasta connection
- Descriptive attributes characterize the specific item, so they all apply simultaneously

**Why This Logic:**

- Selective attributes represent filtering criteria - users want options that satisfy any of their dietary/preference needs
- Descriptive attributes describe specific characteristics of individual items - they all describe the same dish
- OR logic for selective maximizes relevant results; AND logic for descriptive ensures complete characterization

#### 6.5.4 Core Principles

1. **Modular Processing:** All applicable components process independently
2. **Additive Logic:** Multiple processing components can apply to the same mention
3. **Selective = Filtering:** Find existing connections that match any of the selective attributes
4. **Descriptive = Enhancement:** Add attributes to existing connections if not already present
5. **OR Logic:** Multiple selective attributes use OR logic (any match qualifies)
6. **Create Specific Only:** Only create new connections for specific dishes (menu items)
7. **No Placeholder Creation:** Never create category dishes or attribute matches that don't exist
8. **Restaurant Always Created:** Restaurant entities are always created if missing

### 6.6 Database Operations, Metrics, and Performance Optimizations

#### 6.6.1 Foundation Infrastructure

**Database Connection Management:**

- **Connection pooling**: Establish database connection pool at application startup
- **Prepared statements**: Cache query execution plans for all resolution and insertion queries
- **Core indexes**: Pre-existing indexes on entity names, aliases, and normalized fields for optimal performance

#### 6.6.2 Bulk Database Operations

**Transaction Strategy:**

- **Single atomic transaction**: All updates committed together for consistency and performance
- **UPSERT operations**: `ON CONFLICT DO UPDATE/NOTHING` for efficient entity merging
- **Bulk operations**: Multi-row inserts/updates minimize database round trips (biggest performance gain)

**Operation Sequence:**

1. **Entity resolution results** → Update existing entities, create new entities, update aliases, add restaurant attributes to metadata, etc.
2. **Connection updates** → Modify metrics, attributes, categories, activity levels, and other metadata
3. **Top mention updates** → Replace top mention arrays with newly ranked mentions

#### 6.6.3 Metric Aggregation

**Connection Metrics Aggregation:**

Raw metrics calculated and accumulated with each connection during processing:

- **Mention count**: Total number of mentions for this connection
- **Total upvotes**: Sum of upvotes across all mentions
- **Source diversity**: Count of unique threads/discussions mentioning this connection
- **Recent mention count**: Mentions within last 30 days
- **Last mentioned timestamp**: Most recent mention date for activity calculations

**Metrics Usage:**

- **Evidence display**: Support user-facing evidence cards and attribution
- **Quality score computation**: Feed into global ranking algorithms
- **Query filtering**: Enable attribute-based filtering thresholds

#### 6.6.4 Performance Monitoring and Optimization

**Key Performance Metrics:**

- **Resolution timing**: Track entity resolution time by type and batch size
- **Database operation timing**: Measure insert/update performance across operation types
- **Batch processing efficiency**: Monitor processing time vs. batch size relationships
- **Memory usage tracking**: Ensure efficient resource utilization during bulk operations
- **Fuzzy matching efficiency**: Identify expensive operations for optimization

**Implementation Strategy:**

**Phase 1: Foundation (Start Here)**

- Straightforward sequential processing with robust error handling
- Simple batch size tuning (start with 100-500 entities per batch)
- Basic instrumentation to measure bottlenecks and identify optimization opportunities
- Focus on getting fundamentals right before advanced optimizations

**Phase 2: Measured Improvements (Only After Testing)**

- Simple LRU cache for frequently accessed entities (track cache hit rates)
- Basic parallelization by entity type based on measured bottlenecks
- Batch size optimization based on actual performance data
- Query optimization based on real usage patterns

**Phase 3: Scale-Driven Optimizations (Only If Needed)**

- Redis caching for high-frequency entity lookups
- Worker pools for parallel processing
- Bloom filters for efficient duplicate detection
- Temporary tables for very large batch processing

---

## 7. Query Processing System

### 7.1 Query Processing Pipeline (occurs when queries return sufficient data)

```
1. User Query Input
2. Cache Check (Hot Query Cache - 1 hour)
3. LLM Entity Extraction and Analysis (see llm_query_processing.md for processing rules)
4. Entity Normalization and Resolution
5. Dynamic Query Building Based on Extracted Entities
6. Graph Database Query Execution and Result Ranking
  6.1 If insufficient data is returned, trigger on-demand data collection (see section 5 for details)
7. Return Format Determination Based on Entity Composition
8. Cache Storage
9. Response Delivery
```

### 7.2 Multi-Level Caching Strategy

#### 7.2.1 Cache Implementation Levels

##### Hot Query Cache (1 hour retention)

**Purpose:** Handle high-frequency and trending searches
**Example:** "best ramen downtown"

- First query: Process and cache results
- Same query within hour: Instant results
- **Benefits:** Handles viral/trending searches efficiently

##### Recent Search Results (24 hour retention)

**Purpose:** Optimize follow-up searches with complete result sets
**Example:** User searches "best tacos", comes back later

- Store complete result sets with quality scores and evidence
- Update if significant new data becomes available

##### Static Data Cache (7+ days retention)

**Purpose:** Reduce database load for common data
**Examples:** Restaurant basic info, entity metadata, common patterns

#### 7.2.2 Cache Invalidation Strategy

- **Time-based expiration** for different data types based on volatility
- **Smart invalidation** when entities receive new mentions or updates
- **Trend-based cache warming** for predicted popular queries
- **Geographic cache segmentation** for location-based query optimization

#### 7.2.3 Redis Implementation

- **Connection pooling** established at application startup
- **Efficient serialization** for complex result sets
- **LRU eviction** with appropriate memory limits
- **Performance monitoring** of hit rates and response times

### 7.3 Query Understanding & Processing via LLM Analysis

#### 7.3.1 Entity-Based Query Processing

The system processes queries through LLM analysis (see llm_query_processing.md) to extract **all relevant mentioned entities**, which are then used to dynamically build optimal database queries that **adapt to the entity combination provided**. The extracted entities determine both the query structure and the return format.

**Entity Types Processed:**

- **restaurants**: Physical dining establishments referenced by name
- **dish_or_category**: Specific dishes or food categories mentioned
- **dish_attributes**: Connection-scoped descriptors (spicy, vegan, house-made, crispy)
- **restaurant_attributes**: Restaurant-scoped descriptors (patio, romantic, family-friendly, authentic)

##### Examples of Entity-Driven Query Processing:

- **"best ramen"** → dish_or_category: ["ramen"] → Find all ramen connections, return dual lists
- **"best dishes at Franklin BBQ"** → restaurant: ["Franklin BBQ"] → Find all connections for this restaurant, return single list
- **"best spicy ramen with patio"** → dish_or_category: ["ramen"], dish_attributes: ["spicy"], restaurant_attributes: ["patio"] → Filter connections by all criteria, return dual lists
- **"best vegan restaurants"** → restaurant_attributes: ["vegan"] → Find restaurants with vegan attribute, return dual lists
- **"best Italian food at romantic restaurants"** → dish_attributes: ["Italian"], restaurant_attributes: ["romantic"] → Combine filters, return dual lists

#### 7.3.2 Query Analysis & Processing

##### Primary Function: Convert natural language queries to structured entity parameters for dynamic query building

_Important: This process maps queries to existing entities and relationships for graph traversal._

Simplified Processing Tasks (see llm_query_processing.md for more details):

- **Entity extraction**: Extract all relevant entities (restaurants, dish_or_category, dish_attribute, restaurant_attribute)
- **Term normalization and entity resolution**: Handle entity variations and standardize references
- **Attribute scope classification**: Distinguish between dish-scoped and restaurant-scoped attributes
- **Location and availability requirements**: Identify geographic and temporal constraints
- **Output standardized format**: Structure extracted entities for dynamic query building

### 7.4 LLM Query Processing Input/Output Structures

See llm_query_processing.md for more implementation and processing details.

#### 7.4.1 LLM Input Structure

_**Note**: Structure may evolve during implementation. Key principles are query context preservation, geographic constraint integration, and user preference continuity._

```json
{
  "query": "string",
  "location_bounds": {
    "ne_lat": number,
    "ne_lng": number,
    "sw_lat": number,
    "sw_lng": number
  },
  "open_now": boolean,
  "user_context": "string|null"
}
```

#### 7.4.2 LLM Output Structure

_**Note**: Structure may evolve during implementation. The key principles are entity organization by type with preserved original text and resolved database identifiers._

```json
{
  "entities": {
    "restaurants": [
      {
        "normalized_name": "string",
        "original_text": "string" | null, // original user text
        "entity_ids": ["uuid"] // resolved database IDs
      }
    ],
    "dish_or_categories": [
      {
        "normalized_name": "string",
        "original_text": "string" | null,
        "entity_ids": ["uuid"]
      }
    ],
    "dish_attributes": [
      {
        "normalized_name": "string",
        "original_text": "string" | null,
        "entity_id": "uuid"
      }
    ],
    "restaurant_attributes": [
      {
        "normalized_name": "string",
        "original_text": "string" | null,
        "entity_id": "uuid"
      }
    ]
  }
}
```

### 7.5 Dynamic Query Architecture

#### 7.5.1 Entity-Driven Query System Design

The system uses a **single dynamic query builder** that adapts its SQL structure based on the entities extracted from user queries. This approach eliminates the need for multiple specialized query patterns while maintaining optimal performance.

**Core Architecture Principles:**

- **Entity-Based Logic**: Query structure determined entirely by which entities are present
- **Adaptive Filtering**: Dynamic WHERE clauses based on entity types and scopes
- **Performance Optimization**: Single query pattern optimized for all entity combinations
- **Scope-Aware Processing**: Automatic handling of restaurant-scoped vs connection-scoped attributes

**Query Building Flexibility:**

- **Multiple entities of same type**: Natural OR logic handling (`WHERE dish_or_category_id = ANY($entity_ids)`)
- **Mixed entity types**: Combines filters across entity scopes seamlessly
- **Attribute scope processing**: Automatic tier-based filtering for dish_attributes vs restaurant_attributes
- **Missing entities**: Graceful handling when certain entity types are not provided

#### 7.5.2 Dynamic Query Building Logic

The system constructs adaptive database queries through a multi-stage filtering approach that responds to entity presence. The query architecture uses conditional logic blocks that activate only when corresponding entities are detected, creating an efficient and flexible query execution pattern.

##### Multi-Stage Filtering Approach:

- Conditional logic blocks activate based on entity presence
- Efficient execution pattern adapts to any entity combination
- Performance optimized through early dataset reduction

**Stage 1: Restaurant Filtering**

- **Direct entity matching**: When specific restaurants mentioned → filter to those venues
- **Restaurant attributes**: Array intersection for attributes like "patio" or "romantic"
- **Geographic bounds**: Spatial operations using map viewport coordinates
- **Availability**: Operating hours metadata + "open now" toggle evaluation

**Stage 2: Connection Filtering**

- **dish_or_category matching**: Array operations for specific dishes/categories mentioned
- **Dish attributes**: Array intersection for connection-scoped attributes ("spicy", "vegan")
- **Applied to**: Eligible restaurant set from Stage 1

**Adaptive Execution Logic:**

- **Entity present** → Corresponding filter activates
- **Entity absent** → Filter becomes null check (disabled)
- **Performance benefit**: Avoids unnecessary operations
- **Flexibility**: Handles any entity combination naturally

**Result Processing:**

- **Ranking**: Leverages pre-computed `dish_quality_score` or `restaurant_quality_score` values, ranked in descending order in real-time

#### 7.5.3 Attribute Scope Processing

The system automatically applies the correct filtering logic based on attribute scope:

**Restaurant-Scoped Filtering (restaurant_attributes)**

- Applied to restaurants table in the `filtered_restaurants` CTE
- Affects which restaurants are considered for the entire query
- Filter: `WHERE restaurant_attributes && ARRAY[attribute_ids]`
- Examples: patio, romantic, family-friendly, authentic

**Connection-Scoped Filtering (dish_attributes)**

- Applied to connections table in the `filtered_connections` CTE
- Affects which dish-restaurant pairs are returned
- Filter: `WHERE dish_attributes && ARRAY[attribute_ids]`
- Examples: spicy, vegan, house-made, crispy

#### 7.5.4 Query Building Process

Following **step 5** in the query pipeline, the system:

1. **Entity Analysis**: Examine which entity types are present in the processed query
2. **Dynamic SQL Construction**: Build conditional WHERE clauses based on entity presence
3. **Parameter Binding**: Inject resolved entity IDs and filter values into query
4. **Scope-Aware Filtering**: Apply restaurant attributes before connection filtering for optimal performance
5. **Geographic Integration**: Include map boundaries and availability filters
6. **Query Optimization**: Leverage database indexes and pre-computed scores for fast execution

#### 7.5.5 Query Execution Examples

**Query: "best spicy ramen with patio seating"**

- **Entities extracted**: dish_or_category ("ramen") + dish_attribute ("spicy") + restaurant_attribute ("patio")
- **Processing order**:
  1. Filter restaurants with "patio" attribute
  2. Find ramen connections at those restaurants
  3. Filter connections with "spicy" attribute
- **Result**: Dual lists of spicy ramen dishes at restaurants with patios

**Query: "best dishes at Franklin BBQ"**

- **Entities extracted**: restaurant ("Franklin BBQ") only
- **Processing order**:
  1. Filter to Franklin BBQ specifically
  2. Retrieve all connections for that restaurant
  3. No additional dish/attribute filtering
- **Result**: Single list of all Franklin's menu items (restaurant context known)

**Query: "best vegan Italian food"**

- **Entities extracted**: dish_or_category ("Italian") + dish_attribute ("vegan")
- **Processing order**:
  1. No restaurant-level filtering (all eligible)
  2. Filter connections for Italian food AND vegan attribute
  3. Array intersection logic for both criteria
- **Result**: Dual lists → vegan Italian dishes + restaurants excelling in this combo

**Processing Adaptation Logic:**

- **Multiple entity types** → Apply in order: restaurant filters first, then connection filters
- **Missing entity types** → Corresponding filter stages remain dormant
- **Performance benefit** → Early dataset reduction through restaurant-scoped filtering
- **Flexibility** → No predefined query categories, pure entity-driven logic

#### 7.5.6 Performance Optimizations

**Single Query Pattern Benefits:**

- **Database optimization**: Query planner optimizes one consistent pattern instead of multiple specialized queries
- **Index utilization**: Consistent query structure leverages database indexes effectively
- **Execution plan caching**: Single query pattern enables better plan reuse
- **Filter ordering**: Restaurant-scoped filters applied first to minimize dataset size before connection filtering

**Query Performance Features:**

- **Pre-computed rankings**: Leverages stored `dish_quality_score` and `restaurant_quality_score` fields
- **Geographic index usage**: ST_Contains operations use spatial indexes for fast location filtering
- **Conditional execution**: NULL checks prevent unnecessary filtering when entities not present
- **Bulk parameter binding**: Array parameters enable efficient OR logic for multiple entities

### 7.6 Location & Availability Filtering

Enabled by Google Maps/Places API integration and attribute-based filtering

#### 7.6.1 Map-Based Location Filtering

- **Map-Centric UI**: Users navigate a map interface to define their area of interest
- **Implicit Boundary Filtering**: Query uses visible map boundaries as location filter
- **Implementation**:
  - Each query includes viewport coordinates (NE and SW bounds)
  - Applied during **Dynamic Query Building** (step 5) and executed in **Graph Database Query Execution** (step 6)
  - Database filters restaurants within these coordinates **before ranking** using geographic indexes
  - No text-based location parsing required - eliminates ambiguity in location interpretation

#### 7.6.2 Availability Filtering: Toggle + Attribute Approach

- **"Open Now" Toggle**: Binary filter using current time against stored operating hours
  - Applied during **Dynamic Query Building** with current timestamp
  - Executed in database query **before ranking** for performance optimization
  - Uses structured operating hours data from Google Places API
- **Attribute-based Time Filtering**: System finds restaurants with connections to time/occasion attribute entities
  - Examples: "brunch", "happy hour", "late night", "weekend specials"
  - Processed as dish_attribute or restaurant_attribute entities through natural language
  - Applied using existing dynamic query filtering

### 7.7 Return Format Determination

#### 7.7.1 Entity-Based Return Strategy

The system determines return format based on the **entity composition** of the query rather than predefined query types. This approach provides consistent, predictable responses while adapting to user intent naturally.

#### 7.7.2 Return Format Logic

##### Format Determination Process:

- Analyze entity composition → determine user intent → select response format
- **Deterministic logic**: No scoring or probability, just entity presence patterns
- **Predictable experience**: Same entity combination = same format

**Single List Criteria:**

```
IF restaurants.length > 0
AND dish_or_categories.length = 0
AND dish_attributes.length = 0
AND restaurant_attributes.length = 0
→ RETURN single_list
```

**Single List Reasoning:**

- User already knows the restaurant
- Intent = menu discovery within that establishment
- Examples: "best dishes at Franklin BBQ", "menu at Tatsu-Ya"

**Dual List Default:**

- **All other entity combinations** → dual_list format
- **Philosophy**: Users benefit from both specific items + venue discovery
- **Includes**: dish_or_category only, attributes only, mixed combinations

**Restaurant + Other Entities:**

- **Interpretation**: Restaurant as filter constraint, not venue focus
- **Example**: "best ramen at patio restaurants" → dual list (not venue-specific)
- **Maintains discovery value**: Shows both items + venues

**Implementation Benefits:**

- **Consistent UI**: Frontend handles predictable format patterns
- **Clear logic**: Boolean evaluation, no complex decision trees
- **User-intuitive**: Format matches natural query interpretation

#### 7.7.3 Return Format Types

**Single List Returns**

- **Criteria**: Specific restaurants mentioned without dish or attribute context
- **Content**: dish_or_category list scoped to the specified restaurant(s)
- **Rationale**: Users already know the restaurant, want to discover menu items
- **Examples**:
  - "best dishes at Franklin BBQ" → Franklin's top dishes
  - "menu at Ramen Tatsu-Ya" → Tatsu-Ya's dish list

**Dual List Returns**

- **Criteria**: All other entity combinations
- **Content**: Both dish_or_category list and restaurant list with contextual rankings
- **Rationale**: Users benefit from seeing both specific options and venue recommendations
- **Examples**:
  - "best ramen" → Top ramen dishes + restaurants known for ramen
  - "best spicy food with patio" → Spicy dishes + restaurants with patios serving great spicy food
  - "best vegan restaurants" → Top vegan dishes + restaurants ranked by vegan offerings

#### 7.7.4 Restaurant Ranking Methodology

For dual list returns, restaurant rankings are **contextually calculated** based on query entities:

- **Aggregated performance scoring**: Restaurant rankings based on weighted average of relevant dish_or_category quality scores
- **Entity-specific relevance**: Only dish_or_category items matching the query entities contribute to restaurant ranking
- **Attribute-driven scoring**: Restaurant performance calculated from connections that match specified attributes
- **Recency weighting**: Recent performance weighted more heavily than historical data

#### 7.7.5 Implementation Benefits

- **Predictable UI patterns**: Frontend handles consistent return format logic
- **Entity-driven relevance**: Restaurant rankings always contextual to query entities
- **Natural user flow**: Users get both specific recommendations and venue discovery
- **Performance consistency**: Single query generates both lists simultaneously

#### 7.7.6 Result Structure Consistency

Each result format maintains consistent data structure for seamless UI integration:

- Dish results always include restaurant context and performance metrics
- Restaurant results always include relevant dish examples and performance metrics
- Evidence attribution present across all result types

### 7.8 Post-Processing Result Structure

_**Note**: Structure will evolve during implementation. Key principles are format adaptation, comprehensive evidence, and cross-reference integrity._

```json
{
  "return_format": "single_list|dual_list",
  "entity_composition": {
    "restaurants": ["Franklin BBQ"],
    "dish_or_categories": ["ramen"],
    "dish_attributes": ["spicy"],
    "restaurant_attributes": ["patio"]
  },
  "applied_filters": {
    "location": {
      "coordinates": { "lat": 30.2672, "lng": -97.7431 }
    },
    "temporal": "open_now"
  },
  "dish_or_category_results": [
    {
      "dish_or_category_name": "Tonkotsu Ramen",
      "dish_or_category_id": "uuid",
      "restaurant_name": "Ramen Tatsu-Ya",
      "restaurant_id": "uuid",
      "connection_id": "uuid",
      "quality_score": 87.5,
      "activity_level": "trending|active|normal",
      "evidence": {
        "mention_count": 23,
        "total_upvotes": 145,
        "source_diversity": 8,
        "recent_mention_count": 5,
        "last_mentioned_at": "2024-01-15T10:30:00Z",
        "top_mentions": [
          {
            "mention_id": "uuid",
            "content_excerpt": "Their tonkotsu ramen is incredible - the broth is so rich",
            "source_url": "https://reddit.com/r/Austin/comments/xyz123",
            "subreddit": "r/Austin",
            "upvotes": 67,
            "created_at": "2024-01-10T14:20:00Z"
          }
        ]
      },
      "attributes": [
        {
          "name": "rich broth",
          "attribute_id": "uuid",
          "scope": "dish"
        }
      ],
      "restaurant_info": {
        "address": "123 Main St, Austin, TX",
        "coordinates": { "lat": 30.2672, "lng": -97.7431 },
        "phone": "+1-512-555-0123",
        "hours": {
          "monday": "11:00-22:00",
          "tuesday": "11:00-22:00"
        },
        "status": "open|closed",
        "google_place_id": "ChIJ..."
      }
    }
  ],
  "restaurant_results": [
    {
      "restaurant_name": "Ramen Tatsu-Ya",
      "restaurant_id": "uuid",
      "contextual_performance_score": 85.2,
      "relevant_dish_or_categories": [
        {
          "dish_or_category_name": "Tonkotsu Ramen",
          "dish_or_category_id": "uuid",
          "connection_id": "uuid",
          "quality_score": 87.5,
          "activity_level": "trending"
        }
      ],
      "restaurant_attributes": [
        {
          "name": "authentic",
          "attribute_id": "uuid",
          "scope": "restaurant"
        }
      ],
      "restaurant_info": {
        "address": "123 Main St, Austin, TX",
        "coordinates": { "lat": 30.2672, "lng": -97.7431 },
        "phone": "+1-512-555-0123",
        "hours": {
          "monday": "11:00-22:00",
          "tuesday": "11:00-22:00"
        },
        "status": "open|closed",
        "google_place_id": "ChIJ..."
      }
    }
  ],
  "metadata": {
    "total_results": 25,
    "query_execution_time_ms": 145,
    "cache_hit": false
  }
}
```

### 7.9 Ranking System

_Important: This system relies on pre-computed global quality scores for ranking with attributes serving as filters._

#### 7.9.1 Query Time Ranking

##### Core Ranking Philosophy

The system uses **pre-computed global quality scores** for all ranking decisions, with attributes serving as **filters** rather than ranking modifiers. This approach ensures consistent, fast query performance while maintaining ranking quality.

**Key Principles:**

- **Pre-computed scores drive ranking**: All `dish_quality_score` and `restaurant_quality_score` values calculated during data processing
- **Attributes filter, don't rank**: dish_attributes and restaurant_attributes reduce result sets but don't modify scores
- **Contextual restaurant scoring**: Restaurant rankings calculated from relevant dish performance, not global restaurant scores
- **Activity indicators enhance relevance**: trending/active status provides recency signals without affecting core ranking

##### Ranking Application Logic

**Single List Queries (Restaurant-Specific)**

- **Primary ranking**: `dish_quality_score DESC` for all connections at the specified restaurant
- **No attribute ranking**: Attributes filter eligible dishes but don't modify their pre-computed scores
- **Result**: Restaurant's top dishes ordered by their individual quality scores

**Dual List Queries (Discovery Format)**

**Dish Rankings:**

- **Primary ranking**: `dish_quality_score DESC` across all eligible connections
- **Attribute filtering**: dish_attributes reduce eligible connections before ranking
- **Geographic filtering**: Applied before ranking to eligible restaurant set
- **Result**: Top dishes globally, filtered by query criteria

**Restaurant Rankings:**

- **Contextual performance calculation**: Weighted average of `dish_quality_score` values for dishes matching query entities
- **Entity-specific relevance**: Only dishes matching dish_or_category or dish_attributes contribute to restaurant ranking
- **No global restaurant score**: Restaurant rankings always contextual to query content
- **Result**: Restaurants ranked by their performance in the queried category/attributes

##### Performance Optimizations

**Score Utilization:**

- **Direct database ordering**: `ORDER BY dish_quality_score DESC` leverages database indexes
- **No real-time computation**: All ranking values pre-calculated during data processing
- **Consistent sorting**: Same entity combinations produce identical ranking order
- **Sub-second response**: Ranking logic optimized for < 100ms execution time

**Contextual Restaurant Scoring:**

- **Query-time calculation**: Restaurant scores calculated from eligible dish scores during query execution
- **Attribute-specific performance**: Restaurant ranking reflects query-relevant dish performance only
- **Fallback logic**: Global restaurant score used when no matching dishes exist

##### Ranking Consistency

**Deterministic Results:**

- **Same inputs = same outputs**: Identical queries produce identical rankings
- **Score stability**: Rankings only change when underlying data changes
- **Predictable behavior**: Users see consistent results for repeat queries
- **Cache-friendly**: Stable rankings optimize cache hit rates

**Activity Level Integration:**

- **Visual indicators only**: trending (🔥) and active (🕐) status displayed but don't affect ranking order
- **Relevance signals**: Activity indicators help users identify recently discussed items
- **Score independence**: Activity levels calculated from recency, not incorporated into quality scores
- **User guidance**: Visual cues help users understand community engagement patterns

#### 7.9.2 Results Display

##### List View: Scrollable results with:

- Name of dish-restaurant pair
- Global quality score representation
- Supporting evidence (top mentions, connection metrics)
- Open/closed status

##### Detail View: Expanded information on selection

- Name of dish-restaurant pair
- Complete evidence display
- All connected entities, top mentions, connection metrics
- Operating hours
- Order/reservation links

---

## 8. Community Engagement & Growth Strategy

**✅ HYBRID APPROACH BENEFITS**: This strategy leverages both comprehensive historical context from Pushshift archives and real-time Reddit API access for optimal community engagement. Historical data provides deep attribution context while real-time data enables trending indicators and fresh community links.

### 8.1 Enhanced Attribution System (Foundation Feature)

#### 8.1.1 UI Implementation

The attribution system creates clear, compelling links between dishes and their Reddit community discussions, driving engagement while providing proper attribution.

**Display Format:**

```
🌮 Franklin BBQ Brisket 🔥
"Worth every minute of the wait, incredible bark"
- u/bbqfan23 on r/austinfood, 2 days ago, 67↑
💬 Join conversation
```

**Technical Implementation:**

- **Clickable quote text**: Links directly to specific Reddit comment thread
- **"Join conversation" CTA**: Same Reddit link with explicit call-to-action
- **Fallback strategy**: Use post URL if comment URL unavailable
- **Subreddit attribution**: Source subreddit links to subreddit homepage
- **Subtle branding**: "Powered by Reddit communities" in app footer/settings
- **Integrated metrics**: Thread count already captured in existing metrics suite

#### 8.1.2 Link Strategy

**Dual-Access Approach:**

- **Natural interaction**: Users can click quote text intuitively
- **Explicit CTA**: "Join conversation" button provides clear action
- **Consistent destination**: Both link to same Reddit thread for focused engagement
- **Mobile-optimized**: Links open Reddit app when available, web/appstore fallback

#### 8.1.3 Strategic Benefits

**User Benefits:**

- **Context preservation**: See exact discussion that led to recommendation
- **Community discovery**: Find relevant food communities and active discussants
- **Engagement continuity**: Seamless transition from app to Reddit discussion

**Reddit Partnership Value:**

- **High-quality mobile traffic**: Users arrive at specific, relevant comment threads
- **Content creation assistance**: Share features generate new posts for food communities
- **Community engagement**: Users engage with existing discussions through attribution
- **Third-party marketing**: Bookmark sharing and attribution drive new users to Reddit
- **Content licensing**: Proper attribution maintains Reddit as authoritative source

**Business Growth:**

- **Click-through tracking**: Quote clicks vs. CTA button performance
- **Community expansion**: Geographic scaling through new subreddit engagement
- **Content virality**: User-generated posts create measurable community traction
- **API collaboration**: Potential for enhanced Reddit API integration

### 8.2 Top Mentions & Activity Indicators (User Experience Strategy)

#### 8.2.1 Visual Activity Indicators

**Purpose**: Provide immediate signals to users about community engagement levels and discussion recency.

**Display Strategy**:

- **🔥 "Trending"**: Visual indicator for dishes with multiple recent mentions
- **🕐 "Active"**: Visual indicator for recently discussed dishes
- **No indicator**: Default state for normal discussion levels

**User Experience Benefits**:

- **Immediate relevance signals**: Users can quickly identify recently discussed items
- **Community engagement visibility**: Activity levels help users understand discussion patterns
- **Discovery enhancement**: Trending items surface popular current discussions
- **Attribution integration**: Activity indicators enhance the attribution system's effectiveness

#### 8.2.2 Top Mentions for Attribution

**Strategy**: Use the highest-scoring recent mentions to drive attribution and Reddit engagement.

**Implementation Approach**:

- **Top mention selection**: Automatically select the best recent mention for attribution display
- **Time-weighted relevance**: Recent mentions with community engagement rise to the top
- **Attribution quality**: Ensure attribution uses compelling, recent community quotes
- **Engagement optimization**: Activity indicators guide users toward active discussions

**Technical Implementation**: See section 6.4 (step 4b) for detailed processing logic and database integration.

### 8.3 Social Sharing & Contribution Features

#### 8.3.1 Bookmark Page Share Extension

**Implementation as Extension to Existing Bookmark System:**

The share feature extends the existing bookmark functionality to encourage user-generated content and community contribution.

**UI Flow:**

```
[Existing saved dishes/restaurants list]

[Share/Contribute Your Discovery] (prominent button)
↓ Opens modal with:
- Text area with optional template:
  "Just tried [dish] at [restaurant] - found through community
   recommendations. [Your experience here]. Thanks r/austinfood!"
- "Post to r/austinfood" button OR share to other social media platforms → create post with pre-filled content

OR

[Share your Bookmarks] (prominent button)
↓ Opens modal with:
- Info graphic of top 10 bookmarked dish-restaurant pairs with subtle branding:
  [top 5-10 bookmarked dish-restaurant pairs] + "found through reddit community
   recommendations using the Crave app. Thanks r/austinfood!"
- "Post to r/austinfood" button OR share to other social media platforms → create post with pre-filled content
```

**Technical Requirements:**

- **Bookmark integration**: Extend existing bookmark page with share functionality
- **Template generation**: Dynamic content based on user's saved items
- **Deep linking**: Direct link to Reddit post creation with subreddit pre-selection
- **Social media sharing**: Share to other social media platforms
- **Draft capability**: Optional local storage for post drafts
- **Cross-platform**: Optional native sharing on iOS/Android with Reddit app integration

#### 8.3.2 Content Generation Strategy

**Smart Templates:**

- **Dynamic dish/restaurant insertion**: Pull from user's recently saved items
- **Community context**: Reference specific subreddit communities
- **Gratitude expression**: Built-in thanks to community for recommendations
- **Customization**: User can modify template before posting

**Engagement Optimization:**

- **Subreddit targeting**: Auto-select appropriate food subreddit based on location
- **Timing suggestions**: Recommend optimal posting times for engagement
- **Follow-up prompts**: Encourage users to engage with responses to their posts

### 8.4 Database Schema Extensions for Reddit Integration

_Note: Core database schema defined in section 4.1. This section covers Reddit-specific field usage and implementation._

#### 8.4.1 Connection Table Updates

- **last_mentioned_at**: Timestamp of most recent mention for activity calculation
- **activity_level**: Pre-computed activity status for UI display optimization
- **top_mentions**: JSONB array storing mention metadata for attribution display

#### 8.4.2 Mentions Table Modifications

- **source_url**: Store full Reddit URLs instead of just post/comment IDs
- **subreddit**: Extract subreddit from URL during processing OR store separately

### 8.5 Growth Metrics & Attribution Strategy

#### 8.5.1 Trackable Success Metrics

**User Engagement Metrics:**

- **Click-through rate**: Quote clicks vs. CTA button clicks
- **Community discovery**: Subreddit visits from attribution links
- **Share completion rate**: Bookmark share feature usage and completion

**Growth & Acquisition Metrics:**

- **Reddit referral traffic**: Inbound traffic from Reddit communities
- **Geographic expansion**: User requests for new city coverage
- **Community growth**: New subreddit communities engaged
- **Content virality**: User-generated posts that gain traction

#### 8.5.2 Technical Implementation

**UTM Parameter Strategy:**

- **Source tracking**: `utm_source=crave-app&utm_medium=attribution`
- **Campaign identification**: `utm_campaign=dish-attribution`
- **Content tracking**: `utm_content=dish-[dish_id]-restaurant-[restaurant_id]`
- **Geographic tagging**: Include city/region data for expansion insights

**Technical Implementation:**

- **Link decoration**: Append UTM parameters to all outbound Reddit links
- **Event tracking**: Log attribution clicks, share completions, community discoveries
- **A/B testing framework**: Test different attribution formats and CTA language
- **Privacy compliance**: Ensure tracking complies with app store and privacy requirements

## 9. PRE-MVP IMPLEMENTATION ROADMAP

_Dependencies-based development order with testable milestones_

_**Note**: This roadmap is a high-level overview of the project. The actual implementation, performance and scalability requirements, milestones, tasks, success criteria, and timelines are subject to change based on the specific requirements, constraints, and evolution of the project during development._

### Performance & Scalability Targets

#### Response Time Targets

- **Search queries**: <400ms (cached), <3s (uncached with LLM processing)
- **Discovery feed**: <1s (pre-computed data)
- **Authentication**: <200ms (JWT validation)
- **Payment processing**: <3s (Stripe integration)
- **Reddit API operations**: Constrained by 100 requests/minute rate limit

#### MVP Scalability Targets

- **Concurrent users**: 1,000-2,000 (scale to 10,000+ post-MVP)
- **Search throughput**: 50 searches/second (scale to 100+ post-MVP)
- **Reddit data processing**: 5,000 mentions/hour (API rate limit constraint)
- **System uptime**: 99.9%

#### Data Processing Requirements

- **Entity resolution**: <2s for 100 entity batch
- **Quality score computation**: <10 minutes for full dataset refresh
- **Cache hit rate**: >85% for popular queries (>90% target post-optimization)
- **Database connection pool**: 50 connections (MVP), scale to 100+
- **Reddit API efficiency**: >80% of rate limit utilization during active collection

---

### 9.1 Milestone 1: Database Foundation & Basic Setup (Week 1-2)

_Nothing works without this_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections) 
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.1.1 Core Tasks

- **Database schema creation**: Entities, connections, mentions tables with proper indexes
- **Connection pooling and basic database operations**: CRUD operations, bulk inserts
- **Database migrations and version control**: Schema evolution capability
- **Testing infrastructure setup**: Jest, @nestjs/testing, test database configuration
- **Environment configuration**: dotenv management, config validation
- **Basic logging**: Simple console logging for development

#### 9.1.2 Success Criteria

- Database schema created and all foreign key relationships properly enforced
- Basic CRUD operations functional for all entity types
- Migration system successfully creates and applies schema changes
- Test suite runs successfully with comprehensive code coverage for database operations
- Local development environment setup documented and reproducible
- Basic logging captures database operations and errors
- Connection pooling configured and functional
- Database supports bulk insert operations (performance validation in later milestones)

### 9.2 Milestone 2: Entity Processing Core & External Integrations (Week 3-4)

_Required for any content processing and location services_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **6** Reddit Data Collection Process (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.2.1 Core Tasks

- **LLM integration**: API connectivity, structured input/output handling (see llm-content-processing.md for LLM details)
- **Complete entity resolution system**: Three-phase system with LLM normalization, database matching (exact, alias, fuzzy), and batched processing pipeline
- **Alias management**: Automatic alias creation, duplicate prevention, scope-aware resolution
- **Context-dependent attribute handling**: Separate entities by scope (dish vs restaurant attributes), referencing section 4.2.2's entity type definitions
- **Bulk operations pipeline**: Multi-row inserts/updates, transaction management
- **Google Places API integration**: Restaurant data enrichment, location services setup
- **External integrations module**: Centralized API management, basic rate limiting for google-places, reddit-api, llm-api
- **Basic security essentials**: Input validation, basic rate limiting, essential API security

#### 9.2.2 Success Criteria

- LLM integration successfully processes test content and extracts entities
- Entity resolution system correctly handles exact matches, aliases, and fuzzy matching
- Context-dependent attributes (Italian, vegan, etc.) resolve to correct scope
- Bulk operations successfully process batches of entities without data corruption
- Google Places API integration enriches restaurant entities with location and hours data
- External integrations module handles API errors gracefully with proper retry logic
- Basic security validation prevents common injection attacks and malformed requests
- System processes sample data end-to-end without critical errors

### 9.3 Milestone 3: Hybrid Data Collection Implementation (Week 5-6)

_Community content foundation using hybrid Pushshift + Reddit API approach_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **6** Reddit Data Collection Process (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.3.1 Core Tasks

**Historical Data Processing (Pushshift Archives):**

- **Archive download and setup**: Download target subreddit files via torrent
- **Stream processing implementation**: zstd decompression and ndjson parsing
- **Historical content pipeline**: Extract posts/comments from archives, process timestamps
- **Batch processing system**: Handle large datasets efficiently without memory issues

**Real-Time Data Collection (Reddit API):**

- **Reddit API integration**: Authentication, rate limiting, cost management
- **Content retrieval pipeline**: Post/comment fetching, URL storage
- **Scheduled collection jobs**: Daily/hourly updates with error handling and retry logic
- **Gap tracking system**: Monitor for missed content and data continuity

**Unified Processing Pipeline:**

- **Data merge logic**: Combine historical and real-time data by timestamp
- **Duplicate detection**: Prevent duplicate processing of overlapping content
- **LLM processing integration**: Unified entity extraction for both data sources

#### 9.3.2 Success Criteria

- Successfully download and process sample Pushshift archive files
- Archive processing handles large files without memory or performance issues
- Reddit API authentication and basic data retrieval functional
- Scheduled collection jobs run reliably with proper error handling
- Data merge logic correctly handles overlapping content
- LLM processing pipeline extracts entities from both data sources
- Combined dataset provides comprehensive coverage (historical + real-time)
- Gap tracking identifies and reports data continuity issues

### 9.4 Milestone 4: Dynamic Query System (Week 7-8)

_Core search architecture - required for MVP_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **7** Query Processing System (all subsections)

#### 9.4.1 Core Tasks

- **LLM query processing**: Natural language query analysis, entity extraction, and intent understanding
- **Dynamic query builder**: Single adaptive SQL query system that responds to any entity combination
- **Entity-based filtering**: Automatic scope-aware filtering for restaurant vs dish attributes
- **Result standardization**: Entity-driven single/dual list returns, consistent formatting
- **Query pipeline integration**: Cache check → LLM analysis → entity resolution → SQL generation

#### 9.4.2 Success Criteria

- LLM query processing extracts entities with >90% accuracy
- All entity combinations return properly formatted results
- Query response time <3s without caching (meets uncached response target)
- Database queries execute in <1s (supports overall response time target)
- Location filtering works within map boundaries
- Query pipeline handles malformed input gracefully

### 9.5 Milestone 5: Basic Ranking & Scoring (Week 9-10)

_Required for useful search results_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **6** Reddit Data Collection Process (all subsections)
- **7** Query Processing System (all subsections)

#### 9.5.1 Core Tasks

- **Dish quality score computation**: Connection strength-based algorithm (85-90% weighting)
- **Restaurant quality score computation**: Combined dish performance + direct mentions (80% + 20% formula)
- **Category/attribute performance scoring**: Restaurant ranking for category/attribute queries
- **Mention scoring system**: Time-weighted formula, activity indicators (trending/active status)
- **Connection metrics aggregation**: Mention count, upvotes, source diversity, recency weighting
- **Basic performance optimization**: Essential performance tuning for entity resolution
- **Performance benchmarking**: Basic load testing for scoring algorithms, response time validation

#### 9.5.2 Success Criteria

- Quality scores accurately reflect community consensus (dish rankings align with popular mentions)
- Activity indicators (trending 🔥, active 🕐) correctly identify recent discussion patterns
- Score computation completes in <100ms per connection (meets performance target)
- Full dataset refresh completes in <10 minutes (meets data processing requirement)
- Restaurant rankings contextually adjust based on query entities (category/attribute performance)
- System handles 500+ concurrent scoring operations without performance degradation
- Entity resolution performance adequate for user testing (>90% accuracy, <2s for 100 entities)

### 9.6 Milestone 6: Complex Multi-Attribute Queries (Week 11-12)

_Core search functionality enhancement_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **6** Reddit Data Collection Process (all subsections)
- **7** Query Processing System (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.6.1 Core Tasks

- **Multi-attribute search**: "spicy vegan ramen with patio" query support
- **Advanced filtering logic**: Attribute selection, multiple criteria combination
- **Query optimization**: Efficient handling of complex entity combinations
- **Result relevance**: Improved ranking for multi-attribute queries
- **Basic caching**: Simple in-memory caching for query performance

#### 9.6.2 Success Criteria

- Multi-attribute queries successfully parse and execute
- Query results accurately reflect all specified criteria
- System handles attribute combinations across different entity types
- Search results accurately reflect multi-criteria requests
- Basic caching improves response times for repeated queries

### 9.7 Milestone 7: Basic Search Interface + Open Now Filtering (Week 13-15)

_MVP user experience with essential filtering_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **7** Query Processing System (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.7.1 Core Tasks

**Backend Implementation:**

- **Search functionality**: Natural language input, LLM query processing, with explicit trigger for on-demand data collection if query results are insufficient (referencing section 5.1.2)
- **Result display**: Dish-restaurant pairs, basic evidence cards
- **Map integration**: Location selection, viewport boundary filtering
- **Open now filtering**: Real-time availability toggle using Google Places hours
- **Basic user analytics**: Search query tracking, result interaction logging
- **Error handling middleware**: Structured error responses, graceful degradation
- **Health checks**: Basic system health monitoring endpoints

**Mobile App Implementation (Parallel):**

- **React Native search interface**: Search input, results display, navigation
- **Map integration**: React Native Maps, location services, boundary filtering
- **UI components**: Search results cards, evidence display, filtering controls
- **State management**: Zustand store for search state, results caching
- **Basic error tracking**: Client-side error logging for debugging
- **Error handling**: User-friendly error states, network failure handling

#### 9.7.2 Success Criteria

**Backend Success Criteria:**

- Search API successfully processes natural language queries and returns relevant results
- "Open now" filtering correctly shows only currently open restaurants
- Location-based filtering returns restaurants within specified area
- Error handling provides clear feedback for common error scenarios
- API gracefully handles malformed requests and invalid input
- Health check endpoints accurately reflect system status
- Search functionality works end-to-end with sample data

**Mobile App Success Criteria:**

- Search interface loads and is responsive on target devices
- Location services successfully obtain user coordinates when permitted
- Search results display properly formatted with evidence cards
- Map interactions work smoothly without crashes or lag
- Filtering controls (open now, distance) function as expected
- Users can complete basic search tasks without critical errors
- Navigation between screens works smoothly without crashes
- Error states provide helpful guidance to users
- State management maintains search context during normal usage

### 9.8 Milestone 8: Evidence & Attribution System (Week 16-17)

_Core value proposition with hybrid data foundation_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **6** Reddit Data Collection Process (all subsections)
- **7** Query Processing System (all subsections)
- **8** Community Engagement & Growth Strategy (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.8.1 Core Tasks

**Backend Implementation:**

**Hybrid Attribution System:**

- **Comprehensive evidence cards**: Display evidence from both historical archives and real-time data
- **Smart attribution linking**: Use real-time Reddit data for active links, historical data for context
- **Activity indicators**: Trending/active status based on real-time Reddit API data
- **Historical depth**: Rich evidence context from complete Pushshift archives

**Attribution Features:**

- **Reddit attribution**: Quote display, source links, "Join conversation" CTAs
- **Evidence cards**: Upvote counts, recency indicators, subreddit attribution
- **Activity indicators**: Visual cues for trending/active discussions (🔥 trending, 🕐 active)
- **Historical context**: Deep evidence from archived discussions

**Mobile App Implementation (Parallel):**

- **Evidence card UI**: Quote display, attribution links, visual indicators
- **Activity indicator components**: 🔥 trending, 🕐 active status display
- **Link handling**: Deep linking to Reddit app/web, fallback handling
- **Evidence expansion**: Expandable evidence cards, full context display
- **Historical browsing**: Access to rich historical evidence

#### 9.8.2 Success Criteria

**Backend Success Criteria:**

- Evidence cards drive measurable Reddit click-through for recent content
- Attribution links work correctly to specific comments (recent) and show historical context
- Activity indicators reflect recent community engagement from Reddit API
- Historical evidence provides comprehensive context for recommendations
- Users understand the community-powered value proposition with both depth and freshness

**Mobile App Success Criteria:**

- Evidence cards are visually appealing and informative with both historical and recent data
- Attribution links open correctly in Reddit app or browser when available
- Activity indicators are clearly visible and understood by users
- Evidence expansion works smoothly without performance issues
- Historical evidence enhances user confidence in recommendations

### 9.9 Milestone 9: User Management & Authentication (Week 18-19)

_Foundation for user engagement features_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.9.1 Core Tasks

**Backend Implementation:**

- **User authentication**: Account creation, login, session management
- **Basic user profiles**: User preferences, search history
- **Access control**: Feature gating, account management
- **Basic user analytics**: PostHog/Amplitude integration for user events
- **Search analytics**: Query tracking, conversion metrics, user journey analysis
- **Basic metrics collection**: User engagement metrics, feature usage tracking

**Mobile App Implementation (Parallel):**

- **Authentication screens**: Login, signup, password reset UI
- **User profile interface**: Settings, preferences, search history
- **Session management**: Token handling, auto-login, logout
- **Access control UI**: Premium feature gates, subscription status
- **Analytics integration**: User event tracking, search behavior analytics

#### 9.9.2 Success Criteria

**Backend Success Criteria:**

- Authentication responds in <200ms (meets performance target)
- Account creation flow has >80% completion rate
- Session management is reliable and secure
- User profile operations complete in <500ms
- Analytics capture user registration, search, and engagement events
- Search analytics track query patterns and success rates
- Basic metrics dashboard functional for monitoring user behavior

**Mobile App Success Criteria:**

- Authentication flow is intuitive and user-friendly
- Profile management is easily accessible and functional
- Session handling works seamlessly across app restarts
- Premium features are clearly differentiated and accessible
- Analytics events fire correctly for user actions and search behavior

### 9.10 Milestone 10: Bookmarking System (Week 20-21)

_Core user engagement foundation_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.10.1 Core Tasks

**Backend Implementation:**

- **Dish-centric bookmarking**: Save dishes with restaurant context
- **List management**: Create, edit, delete personal lists
- **Bookmark organization**: Categories, tags, search within bookmarks

**Mobile App Implementation (Parallel):**

- **Bookmark interface**: Save/unsave buttons, bookmark indicators
- **List management UI**: Create, edit, delete lists, list organization
- **Bookmark screens**: Saved items display, categories, search functionality
- **Offline capability**: Local storage for bookmarks, sync on reconnection

#### 9.10.2 Success Criteria

**Backend Success Criteria:**

- Bookmark operations complete in <500ms
- List management API is robust and handles edge cases
- Bookmark organization supports complex querying and filtering

**Mobile App Success Criteria:**

- Users save >3 items per session on average
- List management is intuitive and error-free
- Users actively organize and revisit saved items
- Bookmark interface is easily accessible from search results

### 9.11 Milestone 11: Share/Contribute Tools (Week 22-23)

_User acquisition and community engagement_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **8** Community Engagement & Growth Strategy (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.11.1 Core Tasks

**Backend Implementation:**

- **Share/contribute tools**: Reddit post templates, community integration
- **Bookmark sharing**: Share lists with friends, social media integration
- **Viral mechanics**: Referral tracking, sharing incentives
- **Community features**: Reddit attribution sharing, discussion CTAs

**Mobile App Implementation (Parallel):**

- **Share functionality**: Native sharing, social media integration
- **Contribute interface**: Reddit post templates, community posting
- **Bookmark sharing UI**: Share lists, social media posting
- **Viral mechanics**: Referral tracking, sharing incentives UI

#### 9.11.2 Success Criteria

**Backend Success Criteria:**

- Sharing features load in <500ms
- Reddit API integration works correctly for post creation
- Viral tracking captures user referrals and sharing metrics

**Mobile App Success Criteria:**

- User-generated content creates measurable Reddit engagement
- Shared lists load correctly for recipients
- Viral coefficient shows positive growth
- Sharing interface is intuitive and encourages user participation

### 9.12 Milestone 12: Enhanced History & Food Maps (Week 24-25)

_Personal food journey tracking_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **7** Query Processing System (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.12.1 Core Tasks

**Backend Implementation:**

- **Enhanced history**: Search history API, user analytics
- **Personal food maps**: Location-based bookmarks, geographic insights

**Mobile App Implementation (Parallel):**

- **History interface**: Search history display, pattern analysis
- **Food maps UI**: Interactive maps, location-based bookmark visualization
- **Personal insights**: User dining patterns, preference analytics
- **Data visualization**: Charts, maps, and insights presentation

#### 9.12.2 Success Criteria

**Backend Success Criteria:**

- History API responds in <500ms
- Food maps data is accurate and up-to-date
- Personal analytics provide meaningful insights

**Mobile App Success Criteria:**

- History features actively used by >60% of users
- Food maps load in <2s with interactive performance
- Personal insights provide meaningful user value
- Data visualizations are intuitive and engaging

### 9.13 Milestone 13: Payment Integration (Week 26-27)

_Business monetization foundation_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.13.1 Core Tasks

**Backend Implementation:**

- **Subscription management**: Stripe integration, trial flow, billing cycles
- **Premium feature gating**: Access control for advanced features
- **Payment optimization**: Conversion funnel optimization
- **Billing management**: Invoice handling, payment method updates

**Mobile App Implementation (Parallel):**

- **Payment screens**: Subscription signup, payment method management
- **Premium UI**: Feature gates, subscription status, upgrade prompts
- **Payment flow**: Stripe integration, payment processing, confirmations
- **Billing interface**: Invoice display, payment history, subscription management

#### 9.13.2 Success Criteria

**Backend Success Criteria:**

- Payment processing completes in <3s (meets response time target)
- Subscription management API is robust and handles edge cases
- Premium feature gating works correctly across all endpoints

**Mobile App Success Criteria:**

- Payment flow conversion rate >60% in testing
- Trial-to-paid conversion tracking functional
- No payment processing errors in test transactions
- Payment interface is intuitive and trustworthy

### 9.14 Milestone 14: UI Polish & Mobile Optimization (Week 28-29)

_Pre-MVP UI/UX refinement and mobile experience optimization_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **7** Query Processing System (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.14.1 Core Tasks

- **UI/UX refinement**: Visual design consistency, interaction improvements, accessibility
- **Mobile optimization**: Touch interactions, navigation flow, responsive design
- **Performance optimization**: Animation smoothness, loading states, error handling
- **User testing**: Usability testing, A/B testing of key flows, feedback integration
- **E2E testing**: Maestro mobile testing, critical user journey validation
- **Production monitoring setup**: Crash reporting, basic performance metrics for MVP launch
- **Component development**: Storybook setup for component development and documentation

#### 9.14.2 Success Criteria

- All screens meet accessibility standards (WCAG 2.1)
- Mobile interactions feel native and responsive
- App performance maintains 60fps during interactions
- User testing shows >80% task completion rate
- E2E test suite covers all critical user journeys
- Production monitoring ready for MVP launch (crash reporting, basic analytics)
- Component library documented and testable in Storybook

### 9.15 Milestone 15: **MVP LAUNCH CHECKPOINT** (Week 30-31)

_Final preparation and launch_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **6** Reddit Data Collection Process (all subsections)
- **7** Query Processing System (all subsections)
- **8** Community Engagement & Growth Strategy (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 9.15.1 Core Tasks

- **Final testing**: End-to-end user testing, bug fixes, performance validation
- **Launch preparation**: App store submission, basic deployment infrastructure
- **User feedback systems**: Basic analytics, feedback collection mechanisms
- **Documentation**: User guides, basic API documentation
- **Launch execution**: Coordinated launch across platforms

#### 9.15.2 Success Criteria

- MVP ready for user acquisition and feedback
- All core functionality operational meeting performance targets
- System supports 1,000-2,000 concurrent users
- Search quality satisfies user needs with complex multi-attribute queries
- Evidence attribution drives community engagement
- User management enables bookmarking and sharing
- Basic infrastructure supports initial user load
- Payment system operational for premium features
- Feedback collection systems operational
- Launch executed successfully

- **Ready for user acquisition and revenue generation**

---

## 10. POST-MVP ROADMAP (Week 32+)

_Advanced features and optimizations deferred until after MVP validation_

### 10.1 Milestone 1: Advanced Infrastructure & Monitoring (Week 32-33)

_Production-ready infrastructure (Deferred from Milestones 1-2)_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 10.1.1 Core Tasks

**CI/CD & Deployment (Deferred from Milestone 1):**

- **GitHub Actions CI/CD pipeline**: Automated testing, building, and deployment
- **Docker containerization**: Production-ready containerized deployment
- **Railway.app deployment**: Full production deployment with environment management
- **Environment management**: Comprehensive config validation and secrets management

**Advanced Monitoring (Deferred from Milestone 2):**

- **Prometheus metrics collection**: Comprehensive application metrics
- **Grafana dashboards**: Real-time monitoring and alerting
- **Error tracking**: Sentry integration for error monitoring and alerting
- **Performance monitoring**: Response time tracking, error rate monitoring, health checks
- **Log aggregation**: Winston structured logging with centralized log management

**Security & Documentation (Deferred from Milestone 2):**

- **Security middleware**: Helmet security headers, express-rate-limit comprehensive setup
- **API documentation**: @nestjs/swagger comprehensive API documentation
- **Shared packages**: @crave-search/shared package with common types and constants

#### 10.1.2 Success Criteria

- CI/CD pipeline automatically deploys on successful tests
- Docker containers run efficiently in production environment
- Monitoring captures all critical application metrics
- Error tracking provides actionable insights for debugging
- Security middleware protects against common vulnerabilities
- API documentation comprehensive and auto-generated
- Shared packages reduce code duplication across services

### 10.2 Milestone 2: Basic Caching Layer (Week 34-35)

_Essential caching for improved performance with real user patterns_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **7** Query Processing System (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 10.2.1 Core Tasks

- **In-memory caching**: Simple cache for frequent queries
- **Query result caching**: Cache search results for common queries
- **Entity resolution caching**: Cache entity lookups to reduce database load
- **Cache invalidation strategy**: Basic TTL-based cache management
- **Performance monitoring**: Cache hit/miss tracking and optimization

#### 10.2.2 Success Criteria

- Caching system successfully stores and retrieves query results
- Cache invalidation properly updates when underlying data changes
- Cache improves response times for repeated queries (measurable improvement)
- Memory usage remains stable during extended operation
- Cache gracefully handles errors and high load scenarios

### 10.3 Milestone 3: Entity Resolution Performance Optimization (Week 33-34)

_Advanced entity resolution optimization (Deferred from Milestone 5)_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **6** Reddit Data Collection Process (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 10.3.1 Core Tasks

- **Performance optimization**: Query caching, prepared statements, connection pooling for resolution queries
- **Advanced fuzzy matching**: Optimized algorithms, confidence scoring, performance tuning
- **LRU caching**: Frequently accessed entities, cache hit rate optimization
- **Batch processing optimization**: Size tuning, parallel processing by entity type

#### 10.3.2 Success Criteria

- Entity resolution accuracy >95% (improved from basic 90%)
- Fuzzy matching completes in <50ms per entity batch (improved from basic 100ms)
- Cache hit rate >70% for frequently accessed entities
- Batch processing maintains <1s target for 100 entities (improved from basic 2s)
- Duplicate entity creation reduced by >80%

### 10.4 Milestone 4: Advanced Caching Infrastructure (Week 35-36)

_Multi-level caching system (Deferred from Milestone 7)_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **7** Query Processing System (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 10.4.1 Core Tasks

- **Multi-level cache implementation**: Hot queries (1hr), recent results (24hr), static data (7d)
- **Redis setup**: Connection pooling, basic key structure, memory management (referencing section 7.2.3 for Redis implementation details)
- **Cache integration**: Query pipeline integration, hit/miss tracking
- **Basic performance testing**: k6 load testing setup, critical path testing
- **Performance monitoring foundation**: Response time tracking, cache hit rate monitoring

#### 10.4.2 Success Criteria

- Cache hit rate >85% for repeat queries (meets performance target)
- Cached queries respond in <400ms (meets cached response target)
- Cache memory usage stays under configured limits
- Cache invalidation works correctly for fresh data
- Load testing validates system handles 50 concurrent users
- Performance monitoring captures response times and bottlenecks

### 10.5 Milestone 5: Smart Alerts (Week 37-38)

_Personalized notification system (Post-MVP)_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 10.5.1 Core Tasks

- **Smart alerts**: Personalized notifications, custom alert creation
- **Trending notifications**: Alert users to trending dishes in their area
- **Personal recommendations**: AI-driven suggestions based on history
- **Alert management**: User control over notification frequency and types

#### 10.5.2 Success Criteria

- Alert system has >40% user opt-in rate
- Notifications drive >15% user re-engagement
- Users actively customize and manage alert preferences
- Alert delivery completes in <1s

### 10.6 Milestone 6: Advanced Performance Monitoring & Scale Infrastructure (Week 39-40)

_Post-MVP scaling infrastructure for real user load_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **7** Query Processing System (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 10.6.1 Core Tasks

- **Real user monitoring**: Performance tracking based on actual user behavior patterns, optional Prometheus metrics collection, Grafana dashboards, comprehensive system health
- **Database optimization**: Query tuning based on real usage patterns, advanced indexing, performance monitoring, connection pool scaling
- **Advanced caching**: Intelligent invalidation based on real usage data, Redis optimization, optional distributed caching strategies
- **Load testing with real patterns**: Stress testing based on actual user behavior, not simulated; E2E testing infrastructure, stress testing, capacity planning
- **Advanced analytics**: User behavior analysis, conversion funnels, retention metrics
- **Observability**: Distributed tracing, performance profiling, bottleneck identification

#### 10.6.2 Success Criteria

- System scales to 10,000+ concurrent users (reaches post-MVP scalability target)
- Cache hit rate reaches >90% based on real usage patterns
- Search throughput scales to 100+ searches/second (post-MVP target)
- Database queries maintain <1s average response time under real load
- 99.9% uptime maintained under increased real user load
- Analytics and comprehensive monitoring provide actionable insights and alerting for product development
- Performance optimization reduces response times by 25% from MVP baseline

### 10.7 Milestone 7: Discovery Features (Week 41+)

_Advanced recommendation engine (lowest priority)_

**Reference Sections:**

- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections)
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
- **5** Data Collection Strategy & Architecture (all subsections)
- **6** Reddit Data Collection Process (all subsections)
- **7** Query Processing System (all subsections)
- **8** Community Engagement & Growth Strategy (all subsections)
- **9** PRE-MVP Implementation Roadmap (all subsections)
- **10** POST-MVP Roadmap (all subsections)

#### 10.7.1 Core Tasks

- **Discovery feed**: Recently discussed, quick bites, hidden gems
- **Advanced discovery**: Trending analysis, neighborhood insights, category reports
- **Recommendation engine**: AI-driven dish discovery algorithms
- **Personalized feeds**: Custom discovery based on user preferences

#### 10.7.2 Success Criteria

- Discovery feed consistently loads in <1s (maintains performance target)
- Discovery feed drives >20% of user sessions
- User retention improves by >15% week-over-week
- Advanced recommendation algorithms show measurable user engagement

### 10.8 Performance Target Evolution Summary

#### 10.8.1 MVP Targets (Weeks 1-31)

- **Concurrent Users**: 1,000-2,000
- **Search Response**: <400ms cached, <3s uncached
- **Cache Hit Rate**: >85%
- **Reddit Processing**: 5,000 mentions/hour (API limited)
- **Database Connections**: 50 connections

#### 10.8.2 Post-MVP Scaling Targets (Week 32+)

- **Concurrent Users**: 10,000+ (5x scale-up)
- **Search Response**: <400ms cached, <2s uncached (optimization)
- **Cache Hit Rate**: >90% (advanced optimization)
- **Search Throughput**: 100+ searches/second (2x scale-up)
- **Database Connections**: 100+ connections

#### 10.8.3 Hybrid Data Source Characteristics

**Pushshift Archives (Historical Foundation):**

- **Data Completeness**: Comprehensive historical data through end-2024
- **Processing**: One-time bulk processing of zstd-compressed files
- **Storage**: Local/S3 storage for archive files
- **Coverage**: Complete historical context without API limitations

**Reddit API (Real-Time Updates):**

- **Rate Limit**: 100 requests/minute (hard constraint)
- **Cost**: $0 within rate limits (minimal cost for daily updates)
- **Search Limit**: 1000 posts per query (manageable for daily updates)
- **Processing Cap**: ~6,000 API calls/hour maximum

**Hybrid Benefits:**

- **Comprehensive Coverage**: Full historical + real-time data
- **Cost Efficiency**: Minimal ongoing API costs
- **Feature Completeness**: Activity indicators, attribution, and historical depth
- **Scalability**: Approach scales to multiple subreddits

#### 10.8.4 Final Roadmap Summary

**MVP Phase (Weeks 1-31):**

- Core search functionality with community-powered results
- Basic mobile app with essential features
- User management and bookmarking
- UI polish for user experience
- Ready for user validation and feedback

**Post-MVP Phase (Weeks 32+):**

- Advanced infrastructure and monitoring
- Performance optimizations and caching
- Discovery and recommendation features
- Enhanced user features (smart alerts, restaurant profiles, etc.)
- Scaling infrastructure for growth

---

## 11. Appendices

### A. LLM Processing Guidelines

See `llm-content-processing.md` for detailed content processing rules

### B. Database Migrations

See migration files in `/prisma/migrations`
