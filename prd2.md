# Crave - Local Food Discovery App

## Product Requirements Document v2.0

---

## 1. Overview & Core Concepts

### 1.1 Product Vision

Crave transforms scattered community food knowledge into confident dining decisions by surfacing evidence-based dish and restaurant recommendations. Users discover specific dishes through authentic community consensus rather than generic ratings.

### 1.2 Core Value Proposition

- **Evidence-Based Discovery**: Every recommendation backed by specific community mentions and upvotes
- **Dish-Centric Focus**: Find the best version of what you're craving, not just good restaurants
- **Community-Powered**: Leverages authentic discussions from Reddit food communities
- **Mobile-First Experience**: Optimized for quick decisions with detailed evidence when needed

### 1.3 Fundamental System Concepts

#### Unified Entity Model

- **dish_or_category entities**: Serve dual purposes as specific menu items AND general categories
- **Connection-scoped metadata**: Categories and dish attributes exist only in restaurant→dish relationships
- **Restaurant attributes**: Stored directly on restaurant entities (ambiance, features, service)
- **Evidence-based ranking**: All recommendations supported by trackable community mentions

#### Data-Driven Architecture

- **Community knowledge synthesis**: Process Reddit discussions to extract dish-restaurant connections
- **Quality score computation**: Pre-computed rankings based on mention strength, recency, and consensus
- **Dynamic categorization**: Categories emerge organically from community discussions
- **Real-time relevance**: Activity indicators show trending discussions and recent mentions

---

## 2. Data Model & Architecture

### 2.1 Core Database Schema

#### Entities Table

```sql
CREATE TABLE entities (
  entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- Canonical normalized name
  type entity_type NOT NULL, -- 'restaurant', 'dish_or_category', 'dish_attribute', 'restaurant_attribute'
  aliases TEXT[] DEFAULT '{}', -- Original texts and known variations
  metadata JSONB DEFAULT '{}', -- Type-specific data (location, hours, restaurant_attributes array)
  global_quality_score DECIMAL(10,4) DEFAULT 0, -- Pre-computed ranking score
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Indexes for performance
  UNIQUE(name, type),
  INDEX idx_entities_type_score (type, global_quality_score DESC),
  INDEX idx_entities_name_gin (name gin_trgm_ops),
  INDEX idx_entities_aliases_gin (aliases gin_trgm_ops)
);

CREATE TYPE entity_type AS ENUM (
  'restaurant',
  'dish_or_category',
  'dish_attribute',
  'restaurant_attribute'
);
```

#### Connections Table

```sql
CREATE TABLE connections (
  connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES entities(entity_id),
  dish_or_category_id UUID NOT NULL REFERENCES entities(entity_id),
  categories UUID[] DEFAULT '{}', -- dish_or_category entity IDs (connection-scoped)
  dish_attributes UUID[] DEFAULT '{}', -- dish_attribute entity IDs (connection-scoped)
  is_menu_item BOOLEAN NOT NULL DEFAULT true, -- Specific menu item vs general category reference
  metrics JSONB NOT NULL DEFAULT '{}', -- Performance and mention data
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints and indexes
  UNIQUE(restaurant_id, dish_or_category_id, dish_attributes), -- Prevent duplicate connections
  INDEX idx_connections_restaurant (restaurant_id),
  INDEX idx_connections_dish (dish_or_category_id),
  INDEX idx_connections_categories_gin (categories),
  INDEX idx_connections_attributes_gin (dish_attributes),
  INDEX idx_connections_menu_item (is_menu_item)
);
```

#### Connection Metrics Structure (JSONB)

```json
{
  "mention_count": 12,
  "total_upvotes": 234,
  "source_diversity": 8,
  "recent_mention_count": 3,
  "last_mentioned_at": "2024-01-15T10:30:00Z",
  "activity_level": "active", // "trending", "active", "normal"
  "top_mentions": [
    {
      "mention_id": "uuid",
      "score": 45.2,
      "upvotes": 67,
      "age_days": 2
    }
  ]
}
```

#### Mentions Table

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
  created_at TIMESTAMP NOT NULL, -- When mention was posted
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When we processed it

  INDEX idx_mentions_connection (connection_id),
  INDEX idx_mentions_source (source_type, source_id),
  INDEX idx_mentions_subreddit (subreddit),
  INDEX idx_mentions_created (created_at DESC)
);

CREATE TYPE mention_source AS ENUM ('post', 'comment');
```

### 2.2 Entity Type Specifications

#### Restaurant Entities

- **Purpose**: Physical dining establishments
- **Metadata Structure**:
  ```json
  {
    "location": {"lat": 30.2672, "lng": -97.7431},
    "address": "1234 Main St, Austin, TX",
    "hours": {"monday": "11:00-22:00", ...},
    "phone": "+1-512-555-0123",
    "google_place_id": "ChIJ...",
    "restaurant_attributes": ["uuid1", "uuid2"], // References to restaurant_attribute entities
    "last_places_update": "2024-01-15T10:30:00Z"
  }
  ```

#### dish_or_category Entities

- **Dual Purpose**: Specific menu items AND general food categories
- **Examples**: "brisket", "tacos", "chicken caesar wrap", "ramen"
- **Category Classification**: Only dish type nouns (pizza, burger, salad, etc.)
- **Exclusions**: No cuisine terms, meal periods, or preparation methods

#### Attribute Entities

- **dish_attribute**: Connection-scoped descriptors (spicy, vegan, gluten-free, house-made)
- **restaurant_attribute**: Restaurant-scoped descriptors (patio, romantic, family-friendly)
- **Strict Separation**: No overlap between dish and restaurant attributes

### 2.3 Connection-Scoped Architecture

#### Why Connection-Scoped

- **Categories exist in relationships**: "Franklin BBQ's brisket is BBQ" stores BBQ in the connection
- **Dish attributes describe specific instances**: "Their spicy ramen" stores spicy in the connection
- **Eliminates entity proliferation**: Same dish can have different attributes at different restaurants
- **Flexible querying**: Find all spicy dishes or all dishes at restaurants with patios

#### Relationship Processing Rules

- **Restaurant-category mentions**: Boost all restaurant's dishes in that category
- **Restaurant-attribute mentions**: Add attribute to restaurant's metadata
- **Specific dish mentions**: Create/boost direct restaurant→dish connection
- **Category-attribute mentions**: Boost existing dishes in category that have the attribute

---

## 3. Entity Processing System

### 3.1 LLM Integration Points

#### Content Processing Pipeline

1. **Input**: Reddit posts/comments with structured metadata
2. **LLM Analysis**: Process content using guidelines in `LLM_Processing_Guidelines.md`
3. **Output**: Structured entity extractions with normalized names and relationships
4. **Entity Resolution**: Match extracted entities to existing database entities
5. **Database Operations**: Bulk insert/update entities, connections, and mentions

#### Required LLM Outputs

```json
{
  "mentions": [
    {
      "temp_id": "string",
      "restaurant": {"normalized_name": "string", "original_text": "string", "temp_id": "string"},
      "restaurant_attributes": ["string"] | null,
      "dish_or_category": {"normalized_name": "string", "original_text": "string", "temp_id": "string"} | null,
      "dish_attributes": [{"attribute": "string", "type": "selective|descriptive"}] | null,
      "is_menu_item": boolean,
      "general_praise": boolean,
      "source": {"type": "post|comment", "id": "string", "url": "string", "upvotes": number, "created_at": "timestamp"}
    }
  ]
}
```

### 3.2 Entity Resolution Workflow

#### Three-Tier Resolution Process

1. **Exact Name Matching**: Single query `WHERE name IN (...)`
2. **Alias Matching**: Single query `WHERE aliases && ARRAY[...]`
3. **Fuzzy Matching**: Individual queries with Levenshtein distance ≤ 3-4

#### Resolution Decision Logic

- **High confidence (>0.85)**: Merge with existing entity, add original text as alias
- **Medium confidence (0.7-0.85)**: Apply heuristic rules or flag for review
- **Low confidence (<0.7)**: Create new entity

#### Performance Optimizations

- **Batch deduplication**: Consolidate duplicate entities within batch before resolution
- **In-memory ID mapping**: Build {temp_id → db_id} dictionary from resolution results
- **Bulk operations**: Multi-row inserts/updates in single transaction
- **Prepared statements**: Cache query execution plans for all resolution queries

### 3.3 Modular Processing Components

#### Component 1: Restaurant Entity Processing

- **Trigger**: Always (restaurant always present in LLM output)
- **Action**: Create restaurant entity if missing, update metadata if changed

#### Component 2: Restaurant Attributes Processing

- **Trigger**: When restaurant_attributes array is present
- **Action**: Add attribute entity IDs to restaurant's metadata.restaurant_attributes

#### Component 3: General Praise Processing

- **Trigger**: When general_praise = true
- **Action**: Boost all existing dish connections for this restaurant (no new connections created)

#### Component 4: Specific Dish Processing

- **Trigger**: When dish_or_category is present AND is_menu_item = true
- **Logic**: Find/create restaurant→dish connection, apply attribute filtering and boosting based on selective vs descriptive attributes

#### Component 5: Category Processing

- **Trigger**: When dish_or_category is present AND is_menu_item = false
- **Logic**: Find existing dishes in category, boost based on attribute matching (no new connections created)

#### Component 6: Attribute-Only Processing

- **Trigger**: When dish_or_category is null AND dish_attributes is present
- **Logic**: Find existing dishes with specified attributes and boost (no new connections created)

### 3.4 Data Collection Strategies

#### Scheduled Background Collection

- **Weekly New Entity Enrichment**: Process entities created but not yet enriched
- **Quarterly Full Refresh**: Comprehensive update of all entities, prioritizing oldest data
- **Processing Flow**: Entity selection → Reddit API calls → LLM processing → Entity resolution → Bulk database operations

#### On-Demand Query-Driven Collection

- **Trigger**: Query results below quality/quantity threshold
- **Scope**: Narrow focus on query-relevant entities
- **Optimization**: Rapid processing with immediate result enhancement

#### Reddit API Management

- **Cost**: $0.24/1000 calls, 100 requests/minute limit
- **Historical Access**: Store post/comment IDs for direct access
- **Optimization**: Batch similar requests, track last check timestamps, aggressive caching

---

## 4. Query Processing & Search System

### 4.1 Template-Based Query Architecture

#### Query Type Classification

1. **Dish-Specific**: "best ramen", "chicken caesar wrap" → Single dish list
2. **Category-Specific**: "best sandwiches" → Dual lists (dishes + restaurants)
3. **Venue-Specific**: "best dishes at Franklin BBQ" → Single dish list
4. **Attribute-Specific**: "best vegan restaurants", "patio dining" → Dual lists
5. **Broad**: "best food", "best restaurants" → Dual lists

#### Template System Design

- **Specialized SQL templates** for each query type with performance optimizations
- **Dynamic parameter injection** for filters, attributes, and ranking criteria
- **Consistent extension points** for map boundaries, open hours, and other filters

#### LLM Query Processing

```json
{
  "query_type": "dish_specific|category_specific|venue_specific|attribute_specific|broad",
  "entities": {
    "restaurants": [{"normalized_name": "string", "original_text": "string"}],
    "dish_or_categories": [{"normalized_name": "string", "original_text": "string"}],
    "attributes": [{"normalized_name": "string", "original_text": "string", "scope": "restaurant|dish"}]
  },
  "filters": {
    "location_bounds": {"ne_lat": number, "ne_lng": number, "sw_lat": number, "sw_lng": number},
    "open_now": boolean
  }
}
```

### 4.2 Standardized Return Formats

#### Single List Returns

- **Dish-specific queries**: Only dish list with restaurant context
- **Venue-specific queries**: Only dish list for specified restaurant

#### Dual List Returns

- **Category/attribute/broad queries**: Both dish list and restaurant list
- **Restaurant ranking**: Based on aggregated performance of relevant dishes
- **Consistent UI pattern**: Users see both specific dishes and overall restaurant performance

#### Result Structure

```json
{
  "query_type": "string",
  "dish_results": [
    {
      "dish_name": "string",
      "restaurant_name": "string",
      "quality_score": number,
      "evidence": {
        "mention_count": number,
        "total_upvotes": number,
        "recent_activity": boolean,
        "top_quote": {"text": "string", "author": "string", "url": "string", "upvotes": number}
      },
      "restaurant_info": {"location": {}, "hours": {}, "status": "open|closed"}
    }
  ],
  "restaurant_results": [ // Only for dual-list queries
    {
      "restaurant_name": "string",
      "category_performance_score": number, // Aggregated score for relevant dishes
      "relevant_dishes": ["string"], // Top dishes in queried category/attribute
      "restaurant_info": {"location": {}, "hours": {}, "status": "open|closed"}
    }
  ]
}
```

### 4.3 Location & Availability Filtering

#### Map-Based Location

- **UI**: Users navigate map to define area of interest
- **Implementation**: Query includes viewport coordinates (NE/SW bounds)
- **Database**: Filter restaurants within coordinate bounds before ranking
- **No text parsing**: Eliminates ambiguity in location interpretation

#### Availability Toggle

- **"Open Now" toggle**: Binary filter using current time against stored hours
- **Attribute-based time filtering**: "brunch", "happy hour" processed as attributes
- **Performance optimization**: Apply filters before ranking for efficiency

---

## 5. Ranking & Scoring System

### 5.1 Global Quality Score Architecture

#### Dish Quality Score (Primary Component: 85-90%)

- **Connection strength metrics**:
  - Mention count with recency weighting
  - Total upvotes with time decay
  - Source diversity (unique discussion threads)
  - Recent activity bonus (mentions within 30 days)

#### Dish Quality Score (Secondary Component: 10-15%)

- **Restaurant context factor**: Small boost from parent restaurant's quality
- **Tiebreaker function**: Differentiates between similar dishes

#### Restaurant Quality Score (Primary Component: 80%)

- **Top dish connections**: 3-5 highest-scoring dishes at restaurant
- **Standout offerings**: Captures what defines the restaurant

#### Restaurant Quality Score (Secondary Component: 20%)

- **Overall menu consistency**: Average quality across all mentioned dishes
- **Breadth reward**: Recognizes restaurants with strong overall performance

### 5.2 Category/Attribute Performance Scoring

#### Contextual Restaurant Ranking

- **Find relevant dishes**: All restaurant's dishes in queried category or with attribute
- **Weighted average**: Calculate score based on relevant dish performance
- **Category mention boost**: Add strength from direct restaurant-category mentions
- **Replace global score**: Use contextual score instead of global restaurant score for relevance

#### Example: "Best Italian Restaurants"

1. Find all dishes at each restaurant with "italian" attribute or in Italian categories
2. Calculate weighted average of those dish scores
3. Boost with any direct "great Italian restaurant" mentions
4. Rank restaurants by this contextual Italian performance score

### 5.3 Activity Indicators & Trending

#### Real-Time Relevance

- **Trending (🔥)**: All top 3-5 mentions within 30 days
- **Active (🕐)**: Recent mentions within 7 days
- **Normal**: Standard display without activity indicators

#### Mention Scoring Formula

- **Time-weighted score**: `upvotes × e^(-days_since / 60)`
- **Continuous updating**: Re-score all mentions when new ones added
- **Top mention tracking**: Maintain ranked list of best 3-5 mentions per connection

---

## 6. User Interface & Features

### 6.1 Launch Features (99¢/month Tier)

#### Core Search Experience

- **Smart search bar**: Natural language input with query suggestions
- **Map-based location**: Interactive map for area selection
- **"Open Now" toggle**: Filter for currently operating restaurants
- **Evidence-based results**: Each recommendation shows community quotes and metrics

#### Basic Discovery Feed

- **Recently Discussed**: Dishes trending in past week (23 mentions this week)
- **Quick Bites**: Most mentioned casual spots for immediate decisions
- **Hidden Gems**: Dishes gaining traction but not yet mainstream
- **Community Highlights**: Recent mentions that caught algorithmic attention

#### Result Display

- **List view**: Scrollable results with dish-restaurant pairs, quality indicators, evidence preview
- **Evidence cards**: Top community quote, upvote count, recency indicator, "Join conversation" link
- **Quick actions**: Order/reservation links, Google Maps, save to list, share

#### Bookmarking System

- **Dish-centric lists**: Save specific dishes with restaurant context
- **Personal notes**: Add own thoughts and experiences
- **List sharing**: Share curated dish collections with others
- **Examples**: "My Austin Taco Journey", "Date Night Winners", "Business Lunch Spots"

### 6.2 Premium Features ($7.99/month Tier)

#### Advanced Discovery Feed

- **Trending Deep Dives**: Analysis of why spots are gaining attention
- **Neighborhood Insights**: Area-specific recommendations with context
- **Time-Based Trends**: What's popular for breakfast, late night, etc.
- **Category Deep-Dives**: Monthly reports on pizza scene, coffee culture, etc.
- **Rising Stars**: New dishes gaining serious community praise

#### Smart Alerts & Personalization

- **Craving notifications**: "That ramen you bookmarked is trending again with winter weather"
- **New spot alerts**: "Your favorite type of dish was spotted at a new location"
- **Custom alerts**: "Notify me when anyone raves about new pizza spots"
- **Personal recommendations**: "Based on your love of Little Deli's wrap..."

#### Advanced Search & History

- **Complex attribute queries**: "best vegan brunch with patio seating"
- **Search history with context**: Remember why you searched and what you found
- **Personal food maps**: Visual representation of your discovered spots
- **Early trend access**: See emerging discussions before they hit mainstream

### 6.3 Reddit Community Integration

#### Enhanced Attribution System (Foundation Feature)

```
🌮 Franklin BBQ Brisket 🔥
"Worth every minute of the wait, incredible bark"
- u/bbqfan23 on r/austinfood, 2 days ago, 67↑
💬 Join conversation
```

**Implementation Details**:

- **Clickable quotes**: Direct link to specific Reddit comment thread
- **Clear attribution**: Username, subreddit, timestamp, upvote count
- **"Join conversation" CTA**: Explicit call-to-action for Reddit engagement
- **Subreddit links**: Connect users to relevant food communities
- **Footer attribution**: "Powered by Reddit communities"

#### Share/Contribute Feature

**Bookmark page extension**:

- **"Share Your Discovery" button**: Prominent placement on saved items
- **Pre-filled templates**: "Just tried [dish] at [restaurant] - found through community recommendations. [Your experience]. Thanks r/austinfood!"
- **Direct Reddit posting**: Deep link to Reddit post creation with subreddit auto-selection
- **Draft saving**: Allow users to save and refine posts before sharing

#### Value Creation for Reddit

- **High-quality traffic**: Users land at specific comment threads, not just posts
- **Content creation assistance**: Templates and prompts drive new community posts
- **Geographic expansion**: User requests help identify new cities for Reddit food communities
- **Attribution maintenance**: Reddit remains authoritative source for all recommendations

---

## 7. External Integrations

### 7.1 Reddit API Integration

#### Technical Implementation

- **API Costs**: $0.24/1000 calls, 100 requests/minute rate limit
- **Historical access strategy**: Store all post/comment IDs for direct access
- **Search limitations**: 1000 post limit, work around with stored ID database
- **Cost management**: Aggressive caching, smart update scheduling, batch processing

#### Data Processing Flow

1. **API calls**: Search for entity-specific terms, fetch complete post/comment threads
2. **Content processing**: Send structured data to LLM for entity extraction
3. **Mention scoring**: Apply time-weighted scoring formula for ranking
4. **Activity calculation**: Determine trending/active status based on recency
5. **Database updates**: Bulk operations with new mentions and updated metrics

#### Attribution Requirements

- **Full URLs**: Store complete Reddit URLs for attribution links
- **Subreddit tracking**: Maintain subreddit information for community linking
- **Author attribution**: Preserve username for quote attribution
- **Upvote tracking**: Store upvote counts for evidence strength

### 7.2 Google Places API Integration

#### Primary Functions

- **Restaurant data**: Name, address, coordinates, phone, basic hours
- **Location services**: Geocoding for map-based filtering
- **Operating hours**: Real-time "Open Now" functionality
- **Order/reservation links**: Deep links to delivery and booking platforms

#### Performance Optimization

- **Batch operations**: Group Places API calls for efficiency
- **Update scheduling**: Periodic background refresh of restaurant data
- **Strategic caching**: Store coordinate and hours data with appropriate TTL
- **Selective updates**: Only fetch detailed data when necessary

#### Integration Strategy

- **Complement, don't replace**: Reddit provides recommendation data, Google provides operational data
- **Seamless user experience**: Combine community insights with practical information
- **Cost optimization**: Minimize API calls through intelligent caching and batching

---

## 8. Performance & Optimization

### 8.1 Database Performance

#### Core Indexes

```sql
-- Entity lookups
CREATE INDEX idx_entities_type_score ON entities(type, global_quality_score DESC);
CREATE INDEX idx_entities_name_gin ON entities USING gin(name gin_trgm_ops);
CREATE INDEX idx_entities_aliases_gin ON entities USING gin(aliases);

-- Connection traversal
CREATE INDEX idx_connections_restaurant ON connections(restaurant_id);
CREATE INDEX idx_connections_dish ON connections(dish_or_category_id);
CREATE INDEX idx_connections_categories_gin ON connections USING gin(categories);
CREATE INDEX idx_connections_attributes_gin ON connections USING gin(dish_attributes);

-- Geographic filtering
CREATE INDEX idx_restaurants_location ON entities USING gist(((metadata->>'location')::jsonb));

-- Mention lookups
CREATE INDEX idx_mentions_connection ON mentions(connection_id);
CREATE INDEX idx_mentions_created ON mentions(created_at DESC);
```

#### Query Optimization

- **Template-based queries**: Pre-optimized SQL for each query type
- **Filter-first approach**: Apply geographic and time filters before ranking
- **Score pre-computation**: Global quality scores calculated during background processing
- **Connection denormalization**: Store frequently accessed data in connection metrics

### 8.2 Caching Strategy

#### Multi-Level Cache Architecture

1. **Hot Query Cache (1 hour)**: High-frequency searches with instant results
2. **Recent Search Results (24 hours)**: Complete result sets for follow-up queries
3. **Static Data Cache (7 days)**: Restaurant info, entity metadata, common patterns

#### Cache Invalidation

- **Time-based expiration**: Different TTLs based on data volatility
- **Smart invalidation**: Update caches when entities receive new mentions
- **Trend-based warming**: Pre-populate cache for predicted popular queries

#### Redis Implementation

- **Connection pooling**: Establish Redis connection pool at startup
- **Serialization strategy**: Efficient JSON serialization for complex result sets
- **Memory management**: LRU eviction with appropriate memory limits

### 8.3 Entity Resolution Optimization

#### Batched Processing Pipeline

1. **Batch deduplication**: Consolidate duplicates within batch by normalized name
2. **Three-tier resolution**: Exact → Alias → Fuzzy matching with separate queries
3. **In-memory ID mapping**: Build {temp_id → db_id} dictionary from results
4. **Bulk database operations**: Single transaction with UPSERT statements

#### Performance Monitoring

- **Resolution timing**: Track time by entity type and batch size
- **Fuzzy match efficiency**: Monitor expensive operations
- **Database operation metrics**: Measure insert/update performance
- **Memory usage tracking**: Ensure efficient resource utilization

---

## 9. Technology Stack

### 9.1 Frontend Architecture

#### Core Framework

- **React Native**: Cross-platform mobile development
- **TypeScript**: Type safety and development efficiency
- **Expo**: Accelerated development and deployment

#### Essential Libraries

- **State Management**: Zustand for client state, React Query for server state
- **Navigation**: React Navigation with deep linking support
- **Maps**: React Native Maps for location-based features
- **Forms**: React Hook Form for search and user input
- **Animations**: React Native Reanimated for smooth interactions
- **Storage**: React Native MMKV for fast local storage

#### Development Tools

- **Styling**: NativeWind for utility-first styling
- **Testing**: Jest + React Native Testing Library + Maestro for E2E
- **Development**: Expo development tools, React Native debugging

### 9.2 Backend Architecture

#### Core Framework

- **NestJS**: Scalable Node.js framework with TypeScript
- **Fastify**: High-performance HTTP server
- **TypeScript**: Type safety across the entire backend

#### Essential Services

- **Background Jobs**: @nestjs/bull with Redis for data processing
- **Caching**: @nestjs/cache-manager with Redis for performance
- **API Documentation**: @nestjs/swagger for development and integration
- **Authentication**: Passport.js for user management
- **Validation**: class-validator & class-transformer for data integrity

#### Infrastructure Services

- **Logging**: winston for comprehensive application logging
- **Security**: helmet for security headers, express-rate-limit for protection
- **Monitoring**: Sentry for error tracking, prom-client for metrics

### 9.3 Modular Monolith Architecture

#### Architectural Decision: Modular Monolith

**Recommendation**: Start with a modular monolith architecture for faster development, simpler operations, and easier debugging while maintaining clear service boundaries for future microservice extraction.

#### Core Module Structure

```
src/
├── modules/
│   ├── content-processing/          # Domain: Community content ingestion & analysis
│   │   ├── reddit-collector/        # Reddit API integration, data retrieval
│   │   ├── llm-processor/          # LLM content analysis and entity extraction
│   │   ├── entity-resolver/        # Entity resolution and deduplication
│   │   └── process-orchestrator/   # Workflow coordination, score computation, metric aggregation
│   │
│   ├── search-discovery/           # Domain: Query processing & result delivery
│   │   ├── query-engine/           # Query analysis, template selection
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
├── shared/                        # Shared utilities and types
│   ├── types/                     # Common TypeScript interfaces
│   ├── utils/                     # Helper functions, constants
│   ├── decorators/                # Custom NestJS decorators
│   └── exceptions/                # Custom exception classes
│
└── main.ts                        # Application bootstrap
```

#### Domain Responsibilities

**Content Processing**: Handles all aspects of ingesting and analyzing community content

- **Workflow Orchestration**: Coordinate reddit-collector → llm-processor → entity-resolver workflow
- **Score Computation**: Calculate global quality scores after connection metrics are updated
- **Metric Aggregation**: Update connection metrics when new mentions are processed
- **Background Job Management**: Schedule and manage systematic content processing operations

**Search & Discovery**: Manages query processing and result delivery using pre-computed data

- **Result Ranking**: Retrieve and apply stored global quality scores for fast ranking
- **Query Optimization**: Use pre-computed scores and activity levels for sub-second responses
- **Discovery Features**: Leverage activity indicators computed during data processing

**User Experience**: Focuses on user-facing features and interactions
**External Integrations**: Centralizes third-party service connections
**Infrastructure**: Provides foundational system services

#### Development and Design Principles

**Dependency Injection & Loose Coupling**:

- **NestJS DI container**: Use dependency injection for all module interactions
- **Interface-based design**: Define clear contracts between modules to enable testing and flexibility
- **Repository pattern**: Abstract database access through repositories for clean separation
- **Service layer isolation**: Keep business logic separate from framework concerns

**Event-Driven Communication**:

- **Asynchronous operations**: Use events for background processing and cross-module notifications
- **Score update events**: Emit events when process-orchestrator completes mention processing to trigger downstream updates
- **User activity events**: Track search patterns and bookmark changes for personalization
- **Decoupled notifications**: Use event bus for sending alerts and updates without tight coupling

**Performance-First Architecture**:

- **Pre-computed rankings**: Calculate all scores during content processing, not query time
- **Strategic caching**: Cache at multiple levels (query results, entity data, computed scores)
- **Bulk operations**: Process entities and mentions in batches for database efficiency
- **Background processing**: Move heavy computation (LLM analysis, score calculation) to process-orchestrator

**Code Organization Best Practices**:

- **Domain-driven structure**: Organize code by business domain, not technical layer
- **Single responsibility**: Each module has clear, focused purpose
- **Shared infrastructure**: Common concerns (database, caching, monitoring) centralized in infrastructure domain
- **Testability**: Design for easy unit testing with mocked dependencies and clear interfaces

### 9.3 Data Layer

#### Database

- **PostgreSQL 15**: Primary database with advanced features
- **Prisma**: Type-safe database access and migrations
- **Redis**: Caching and job queue management

#### Performance Tools

- **Connection pooling**: Optimized database connections
- **Query optimization**: Prepared statements and efficient indexes
- **Migration management**: Prisma migrations for schema evolution

### 9.4 Infrastructure & Deployment

#### Cloud Services

- **Database**: AWS RDS for PostgreSQL with automated backups
- **Cache**: AWS ElastiCache for Redis with high availability
- **Storage**: AWS S3 for static assets and backups
- **Notifications**: AWS SNS for push notifications

#### Deployment Pipeline

- **Hosting**: Railway.app for initial deployment simplicity
- **Containerization**: Docker for consistent environments
- **CI/CD**: GitHub Actions for automated testing and deployment
- **Mobile**: Expo Application Services (EAS) for app store deployment

#### Monitoring & Analytics

- **Application Monitoring**: Sentry for error tracking and performance
- **Infrastructure Monitoring**: Prometheus + Grafana for system metrics
- **User Analytics**: PostHog for product analytics and user behavior

### 9.5 External APIs

#### Primary Integrations

- **Reddit API**: Community data collection with cost optimization
- **Google Places API**: Restaurant data and location services
- **LLM API**: Gemini or DeepSeek for content analysis

#### Development Tools

- **Package Management**: pnpm for efficient dependency management
- **Code Quality**: Lefthook for git hooks and automated checks
- **API Testing**: Postman/Insomnia for endpoint testing and documentation

---

## 10. Implementation Phases

### 10.1 Phase 1: Core Data Foundation (Months 1-2)

#### Database & Schema Implementation

- **Entity tables creation**: Restaurants, dish_or_category, attributes with proper indexes
- **Connection system**: Restaurant→dish relationships with metadata arrays
- **Mention tracking**: Full Reddit attribution and evidence storage

#### Entity Processing Pipeline

- **LLM integration**: Connect to content processing API with structured output
- **Entity resolution**: Three-tier matching system with fuzzy search
- **Bulk operations**: Optimized database insertion and updates

#### Basic Reddit Integration

- **API connectivity**: Reddit API integration with cost management
- **Content collection**: Background jobs for systematic data gathering
- **Historical access**: Post/comment ID storage for direct access

**Success Criteria**:

- Process 1000+ restaurant-dish connections with 90%+ accuracy
- Handle 100+ entity batch resolution in <2 seconds
- Successfully collect and process Reddit data from 3+ subreddits

### 10.2 Phase 2: Search & Ranking System (Months 3-4)

#### Query Processing Engine

- **Template-based queries**: Specialized SQL for each query type
- **LLM query analysis**: Natural language to structured query conversion
- **Standardized returns**: Single and dual list result formats

#### Ranking & Scoring

- **Global quality scores**: Pre-computed dish and restaurant rankings
- **Activity indicators**: Trending and active status calculation
- **Category performance**: Contextual restaurant scoring for attribute queries

#### Basic Caching

- **Multi-level cache**: Hot queries, recent results, static data
- **Performance optimization**: Sub-second response times for cached queries
- **Cache warming**: Intelligent pre-loading based on usage patterns

**Success Criteria**:

- Support all 5 query types with <500ms response time
- 95%+ cache hit rate for repeat queries
- Accurate ranking correlates with community consensus

### 10.3 Phase 3: User Interface & Features (Months 5-6)

#### Mobile App Development

- **Core search experience**: Natural language input with map-based location
- **Result display**: Evidence cards with Reddit attribution and quick actions
- **Bookmarking system**: Dish-centric lists with sharing capabilities

#### Discovery Features

- **Basic discovery feed**: Recently discussed, quick bites, hidden gems
- **Activity indicators**: Visual trending and active discussion cues
- **Reddit integration**: Enhanced attribution with "Join conversation" links

#### User Management

- **Subscription tiers**: 99¢ basic tier with core features
- **User preferences**: Location, dietary restrictions, search history
- **Sharing functionality**: Social features and list collaboration

**Success Criteria**:

- Smooth user experience with <2 second search results
- 70%+ user retention after first week
- Measurable Reddit click-through traffic

### 10.4 Phase 4: Advanced Features & Optimization (Months 7+)

#### Premium Features ($7.99 tier)

- **Advanced discovery**: Trending deep dives, neighborhood insights, category reports
- **Smart alerts**: Personalized notifications and custom alert creation
- **Enhanced search**: Complex attribute queries and search history

#### Reddit Community Strategy

- **Share/contribute features**: Template-driven post creation for Reddit
- **Community growth**: Trackable metrics for Reddit partnership discussions
- **Geographic expansion**: User-driven identification of new markets

#### Performance & Scale

- **Advanced caching**: Redis optimization and intelligent invalidation
- **Database optimization**: Query performance tuning and index refinement
- **Monitoring & analytics**: Comprehensive performance tracking and user behavior analysis

**Success Criteria**:

- 15%+ premium subscription conversion rate
- Measurable Reddit community growth contribution
- System handles 10,000+ concurrent users with <1 second response times

### 10.5 Ongoing Maintenance & Growth

#### Data Quality & Expansion

- **Algorithm refinement**: Continuous improvement of ranking and relevance
- **Geographic expansion**: New city onboarding with local community integration
- **Data source diversification**: Additional review platforms and community sources

#### Partnership Development

- **Reddit partnership**: Formal relationship development with trackable value creation
- **Restaurant partnerships**: Direct relationships for enhanced data and features
- **Platform integrations**: Ordering, reservation, and delivery platform connections

#### Product Evolution

- **User feedback integration**: Feature development based on usage patterns and feedback
- **Market expansion**: Additional markets and cuisine types
- **Advanced personalization**: Machine learning for improved recommendations

---

## 11. Success Metrics & KPIs

### 11.1 Product Metrics

- **Search satisfaction**: Query success rate, result relevance scores
- **User engagement**: Search frequency, discovery feed usage, bookmarking activity
- **Reddit integration**: Click-through rates, share feature usage, community contribution

### 11.2 Technical Metrics

- **Performance**: Query response times, cache hit rates, uptime percentage
- **Data quality**: Entity resolution accuracy, mention processing success rate
- **Scalability**: Concurrent user capacity, database performance under load

### 11.3 Business Metrics

- **User acquisition**: Download rates, onboarding completion, retention curves
- **Monetization**: Subscription conversion rates, revenue per user, churn analysis
- **Partnership value**: Reddit traffic generation, restaurant engagement, community growth

---

## 12. Risk Mitigation

### 12.1 Technical Risks

- **Reddit API changes**: Maintain flexible integration, develop alternative data sources
- **LLM processing costs**: Optimize content filtering, implement efficient batching
- **Database performance**: Proactive monitoring, query optimization, scaling preparation

### 12.2 Business Risks

- **Competitive landscape**: Focus on unique community synthesis value proposition
- **User adoption**: Extensive testing, iterative improvement, strong onboarding experience
- **Reddit relationship**: Provide measurable value, maintain attribution, contribute to community growth

### 12.3 Operational Risks

- **Data accuracy**: Multiple validation layers, community feedback mechanisms
- **Content moderation**: Automated filtering, community reporting, manual review processes
- **Privacy compliance**: Clear data usage policies, user control over personal information
