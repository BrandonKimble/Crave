# Crave - Local Food Discovery App

## Product Requirements Document v3.0

---

## 1. Overview & Core System Architecture

### 1.1 Product Vision

This app enables users to make confident dining decisions by surfacing evidence-based dish and restaurant recommendations from community knowledge. It transforms scattered social proof into actionable insights about specific dishes and dining experiences.

### 1.2 System Architecture Overview

#### Core System Flow

```
User Query → Cache Check → LLM Analysis → Entity Resolution →
Graph Database Query → Ranking Application → Result Formatting →
Cache Storage → User Response
```

#### Data Collection Flow

```
Reddit API → Content Retrieval → LLM Processing (see LLM_Guidelines.md) →
Entity Resolution → Graph Database Storage → Quality Score Computation →
Metric Aggregation
```

### 1.3 Core Value Proposition

- **Evidence-Based Discovery**: Every recommendation backed by specific community mentions and upvotes
- **Dish-Centric Focus**: Find the best version of what you're craving, not just good restaurants
- **Community-Powered**: Leverages authentic discussions from Reddit food communities
- **Mobile-First Experience**: Optimized for quick decisions with detailed evidence when needed

### 1.4 Fundamental System Concepts

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

## 2. Data Architecture

### 2.1 Database Structure

#### Graph-Based Model

##### 1. Entities Table

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

##### 2. Connections Table

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

Connection Metrics Structure (JSONB):

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

##### 3. Mentions Table

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

_Note: Global quality scores are pre-computed during data processing and used as the primary ranking factor_

### 2.2 Natural Category Emergence

A key advantage of our graph approach is allowing specific dish categories to emerge naturally from community discussion:

- When users mention "the French Dip at Bartlett's," the llm_guideline.md process creates:

  - A specific dish entity ("French Dip at Bartlett's")
  - A dish category entity ("french dip") if it doesn't exist
  - A broader category entity ("sandwich") if it doesn't exist
  - Appropriate connections between these entities

- This enables both specific and general queries:
  - "Best french dip" finds all dishes connected to the "french dip" category
  - "Best sandwich" includes all sandwich types, including french dips
- Categories evolve organically based on how the community discusses food:
  - No need for predetermined hierarchies
  - New categories automatically created as they appear in discussions
  - Relationships between categories formed naturally through mentions

### 2.3 Data Collection

The system uses two complementary data collection strategies to build and maintain the knowledge graph: scheduled background collection and on-demand query-driven collection. Both share the same LLM-powered entity extraction pipeline but serve different purposes in the system.

#### Scheduled Background Collection

##### Purpose

Build and maintain a comprehensive knowledge graph by systematically processing community content.

##### Collection Cycles

The system implements two types of background collection cycles:

1. **Weekly New Entity Enrichment**

- **Purpose**: Process newly discovered entities from the previous week
- **Scope**: All entities created but not yet enriched
- **Schedule**: Weekly during off-peak hours
- **Focus**: Building initial connections for new entities

2. **Quarterly Full Refresh**

- **Purpose**: Comprehensive update of all entities in the database
- **Scope**: All existing entities, prioritizing those with oldest data
- **Schedule**: Quarterly (every 3 months)
- **Focus**: Capturing new mentions and trends, refreshing quality scores

##### Standard Process Flow

Regardless of cycle type, all background collection follows this process:

1. **Entity Selection**

- Select entities based on cycle type (new or all)
- Batch entities for efficient processing
- Prepare search terms based on entity names and aliases

2. **Data Retrieval**

- Call Reddit API with entity-specific search terms
- Fetch complete posts and comment threads
- Store post/comment IDs for future direct access
- Optimize API usage through batching

3. **Content Processing**

- Parse and structure the retrieved content
- Send to LLM for entity and relationship extraction
- Extract sentiment and context information
- Connect to Google Places API for restaurant entities

4. **Knowledge Graph Updates**

- Create new entities, connections, and mentions as discovered
- When processing content, the system will **create or update ANY connections between entities that are mentioned**, even if those entities weren't part of the original search target
- Store supporting mentions with metrics
- Update raw connection metrics
- No attempt to fully enrich newly discovered entities or attributes

5. **Quality Score Updates**

- Recalculate global quality scores for affected entities
- Update score timestamps
- Maintain score history for trend analysis

##### Processing Approach

- **Single-Pass Processing**: Each processing cycle focuses only on enriching the selected entities
- **Complete Context Capture**: All discovered entities and relationships from the content are stored
- **Opportunistic Connection Updates**: Any relationships found are updated, even for entities not in the current selection
- **No Recursive API Calls**: New entities are simply created to be enriched in the next weekly cycle

#### On-Demand Query-Driven Collection

##### Purpose

Fill knowledge gaps in real-time when user queries return insufficient data.

##### Trigger Conditions

- Query results fall below quality or quantity threshold
- High-interest entities with limited data
- User explicitly requests more information

##### Process Flow

1. **Query-Specific Search**

- Search Reddit using query terms and relevant entities
- Process complete discussion contexts
- Focus only on content directly relevant to query

2. **Rapid Processing**

- Use the same LLM pipeline as background collection
- Process only content needed for current query
- Optimize for response speed

3. **Knowledge Graph Updates**

- Update query-relevant entities and connections
- Create new entities, connections, and mentions as discovered
- When processing content, the system will **create or update ANY connections between entities that are mentioned**, even if those entities weren't part of the original search target
- Recalculate global quality scores for affected entities
- No additional API calls for newly discovered entities

4. **Result Enhancement**

- Immediately incorporate new data into query results

##### Key Differences from Background Collection

- Triggered by user queries rather than scheduled
- Narrower initial search focus (query-specific)

#### Data Processing Efficiency

##### Shared Processing Optimizations

- **Content Maximization**: Extract all possible entities and connections from any retrieved content
- **Connection Reuse**: All content contributes to the knowledge graph, regardless of the original search purpose
- **Efficient API Usage**:
  - Store post IDs to enable direct full access (bypassing search limitations)
  - Batch similar API calls
  - Cache intermediate processing results
  - Avoid redundant API calls for the same content

#### Knowledge Graph Growth

- **Organic Expansion**:

  - Graph grows naturally based on community discussions
  - Weekly cycles incorporate new entities
  - Quarterly refreshes capture evolving trends
  - User queries trigger targeted enrichment

- **Connection Strengthening**:
  - Each mention adds evidence to connections
  - Raw metrics accumulate over time
  - Quality scores become more reliable with additional data
  - Entity relationships develop natural patterns based on community knowledge

### 2.4 Entity Resolution System

To ensure accurate metrics and search functionality, the system employs a multi-phase approach to handle name variations of all entity types: restaurants, dishes, attributes, and dish categories:

#### Resolution Process Flow

##### Phase 1: LLM Entity Extraction & Normalization

During data collection, the LLM:

- Extracts raw entity mentions from content
- Normalizes spelling, formatting, and common variations
- Provides both raw text and normalized version

##### Phase 2: Database Entity Resolution (Server-Side)

For each normalized entity from the LLM:

1. Matching Algorithm

- Check for exact match against canonical names
- If no match, check for exact match against aliases
- If no match, apply fuzzy matching with Levenshtein distance

2. Resolution Decision

- High confidence match (>0.85): Merge with existing entity
- Medium confidence (0.7-0.85): Apply heuristic rules or flag for review
- Low confidence (<0.7): Create new entity

3. Alias Management

- When merging with existing entity, add raw text as new alias if not exists
- Periodically consolidate aliases to avoid duplication

##### Query Processing Application

The same entity resolution process applies during user queries:

1. LLM normalizes user query terms
2. System matches against canonical names and aliases
3. System expands search to include all matching entities and their aliases

Example:

- User searches: "best food at tatsuyas"
- System identifies "tatsuyas" as alias for "Ramen Tatsu-Ya"
- Query processes as venue-specific search for this canonical entity

### 2.5 Caching Strategy

#### Cache Levels & Implementation

##### 1. Hot Query Cache (1 hour retention)

Purpose: Handle high-frequency and trending searches

Example: "best ramen downtown"

- First query: Process and cache results
- Same query within hour: Instant results
- Benefits: Handles viral/trending searches efficiently

##### 2. Recent Search Results (24 hour retention)

Purpose: Optimize for follow-up searches

Example: User searches "best tacos", comes back later

- Store complete result sets
- Include global quality scores and evidence
- Update if significant new data

##### 3. Static Data (7 day retention)

Purpose: Reduce database load for common data

Example: Restaurant basic info, historical trends

- Location/hours data
- Entity metadata
- Common connection patterns

### 2.6 Component-Based DB Processing Guide

#### Modular Processing Components

The system processes LLM output through independent components. All applicable components process independently for each mention.

**Component 1: Restaurant Entity Processing**

- Always Processed
- Action: Create restaurant entity if missing from database

**Component 2: Restaurant Attributes Processing**

- Processed when: restaurant_attributes is present
- Action: Add restaurant_attribute entity IDs to restaurant entity's metadata

**Component 3: General Praise Processing**

- Processed when: general_praise is true (mentions containing holistic restaurant praise)
- Action: Boost all existing dish connections for this restaurant
- Note: Do not create dish connections if none exist

**Component 4: Specific Dish Processing**

- Processed when: dish_or_category is present AND is_menu_item is true

With Dish Attributes:

- **All Selective:** Find existing restaurant→dish connections for the same dish that have ANY of the selective attributes; If found: boost those connections; If not found: create new connection with all attributes
- **All Descriptive:** Find ANY existing restaurant→dish connections for the same dish; If found: boost connections + add descriptive attributes; If not found: create new connection with all attributes
- **Mixed:** Find existing connections for the same dish that have ANY of the selective attributes; If found: boost + add descriptive attributes; If not found: create new connection with all attributes

Without Dish Attributes:

- Action: Find/create restaurant→dish connection and boost it

**Component 5: Category Processing**

- Processed when: dish_or_category is present AND is_menu_item is false

With Dish Attributes:

- **All Selective:** Find existing dish connections with category; Filter to connections with ANY of the selective attributes; Boost filtered connections; Do not create if no matches found
- **All Descriptive:** Find existing dish connections with category; Boost all found connections; Add descriptive attributes to those connections; Do not create if no category dishes exist
- **Mixed:** Find existing dish connections with category; Filter to connections with ANY of the selective attributes; Boost filtered connections + add descriptive attributes; Do not create if no matches found

Without Dish Attributes:

- Action: Find existing dish connections with category and boost them
- Do not create if no category dishes exist

**Component 6: Attribute-Only Processing**

- Processed when: dish_or_category is null AND dish_attributes is present

- **All Selective:** Find existing dish connections with ANY of the selective attributes; Boost those connections; Do not create if no matches found
- **All Descriptive:** Skip processing (no target for descriptive attributes)
- **Mixed:** Find existing dish connections with ANY of the selective attributes; Boost those connections; Ignore descriptive attributes

---

## 3. Query Processing & Understanding

### 1.1 Query Processing Pipeline

```
1. User Query Input
2. Cache Check (Hot Query Cache - 1 hour)
3. LLM Query Analysis (see LLM_Guidelines.md for processing rules)
4. Entity Resolution
5. Template Selection based on query type
6. Dynamic Parameter Injection
7. Graph Database Query Execution
8. Ranking Application (pre-computed scores)
9. Result Formatting
10. Cache Storage
11. Response Delivery
```

### 3.2 Core Query Types

These queries represent our core value proposition, offering reliable recommendations backed by community evidence.

_Note: All queries are processed through entity matching and graph traversal, without need for specialized search engines._

- **Dish-specific**: "best ramen", "best chicken caesar wrap"
- **Category-specific queries**: "best sandwiches in Austin"
- **Venue-specific**: "best dishes at Franklin BBQ"
- **Dish-level broad queries**: "best dishes in Austin"

#### Location & Availability

Enabled by Google Maps/Places API integration and attribute-based filtering:

##### Location Filtering: Map-Based Approach

- **Map-Centric UI**: Users navigate a map interface to define their area of interest
- **Implicit Boundary Filtering**: Query uses visible map boundaries as location filter
- **Implementation**:
  - Each query includes viewport coordinates (NE and SW bounds)
  - Database filters restaurants within these coordinates
  - No text-based location parsing required

##### Availability Filtering: Toggle + Attribute Approach

- "Open Now" Toggle: Simple binary filter using current time against operating hours
- Time/Occasion Terms: Processed as attribute entities through natural language
  - Examples: "brunch", "happy hour", "late night"
  - System finds restaurants with connections to these attribute entities

### 3.3 Natural Language Processing via LLM Integration

#### Query Understanding & Processing

##### Primary Function: Convert natural language queries to structured graph traversal parameters

_Important: This process maps queries to existing entities and relationships for traversal._

Processing Tasks:

- Entity extraction (restaurants, dishes, attributes)
  - Extract search intent and type (dish-specific, venue-specific, broad)
  - Identify attribute requests (brunch, dinner, vegan, etc.)
- Term normalization and entity resolution
  - Handle entity variations/expansions
  - Standardize entity references
- Identify location and availability requirements
- Output standardized format for dynamic graph traversal and filtering

#### Content Processing & Analysis

##### Primary Function: Process Reddit/review content into structured data with graph entities, connections, and mentions

Processing Tasks:

- Entity extraction (restaurants, dishes, dish categories, attributes)
- Relationship identification (serves, is_a, has_attribute)
- Inference-based attribute and dish category assignment
  - **Create specific and general dish category entities** (e.g., "french dip", not just "sandwich")
  - Allow entities to emerge organically from community mentions
- Sentiment analysis (positive/negative classification)
  - Discard negative sentiment content
- Connection mapping between entities
  - Link dishes to restaurants in nested comments
  - Process implicit entity connections
  - Maintain comment thread context
- Term normalization and entity resolution
  - Handle entity variations/expansions
  - Standardize entity references
  - Map to canonical entities
- Output structured data for graph insertion

### 3.4 Standardized Return Formats

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

---

## 4. Ranking System

### 4.1 Global Quality Score Architecture

_Important: This system relies on pre-computed global quality scores for ranking with attributes serving as filters._

#### Global Quality Score Calculation

For Restaurants:

- ##### Primary Component (80%):

  - Top 3-5 dish connections by strength
  - Direct connections to food categories (treated similarly to top dishes)
  - This captures the standout offerings that define a restaurant

- ##### Secondary Component (20%):
  - Holistic assessment of the restaurant's entire digital menu
  - Breadth of positively mentioned dishes beyond the top ones
  - Average quality across all mentioned dishes
  - Consistency across menu items
  - This rewards restaurants with overall menu strength beyond a few star items

For Dishes:

- ##### Primary Component (85-90%):

  - Combined strength from all mention types:
  - Dish-restaurant mentions ("their pad thai is amazing")
  - Dish-category mentions ("best pad thai in town")
  - Dish-attribute mentions (any that occur)
  - This captures all relevant praise regardless of context

- ##### Secondary Component (10-15%):
  - Restaurant context factor
  - Derived from the parent restaurant's quality score
  - Provides a small boost to dishes from generally excellent restaurants
  - Serves as an effective tiebreaker between similar dishes

##### Metric Aggregation

- Raw metrics stored with each connection:

  - Mention count
  - Total upvotes
  - Source diversity count
  - Recent mention count
  - Timestamp of latest mentions

- Metrics used for:
  - Evidence display to users
  - Global quality score calculation
  - Attribute filtering thresholds

#### Results Display

- ##### List View: Scrollable results with:

  - Name of dish-restaurant pair
  - Global quality score representation
  - Supporting evidence (top mentions, connection metrics)
  - Open/closed status

- ##### Detail View: Expanded information on selection
  - Name of dish-restaurant pair
  - Complete evidence display
  - All connected entities, top mentions, connection metrics
  - Operating hours
  - Order/reservation links

### 4.2 Query-Time Ranking

#### Adapts based on query specificity:

##### 1. Dish Queries

- Filter: Find dish-restaurant pair connected to the specified dish or category
- Apply map viewport boundary filter
- Apply "Open Now" filter if enabled
- Return: Dish-restaurant pairs
- Rank: By dish global quality score
- Example: "best ramen" returns highest-quality ramen dishes

##### 1.1 Dish-Category Queries

- Filter: Find entities connected to the specified dish category
- Apply map viewport boundary filter
- Apply "Open Now" filter if enabled
- Rank: By entity global quality score
- Example: "best sandwiches in Austin" returns highest-quality sandwich entities

##### 2. Venue-Specific Queries

- Filter: Find dishes connected to the specified restaurant
- Rank: By dish global quality score
- Example: "best dishes at Franklin BBQ" returns their highest-quality offerings

##### 3. Attribute Queries

- Filter: Find entities connected to the specified attribute
- Apply map viewport boundary filter
- Apply "Open Now" filter if enabled
- Rank: By entity global quality score
- Example: "best patio restaurants" returns highest-quality restaurants with patios

##### 4. Broad Queries

- Filter: Find all dish or restaurant entities
- Rank: By entity global quality score
- Example: "best dishes" or "best food" returns highest-quality dishes

##### 5. Compound Queries

- Filter: Find entities matching all specified attributes
- Apply map viewport boundary filter
- Apply "Open Now" filter if enabled
- Rank: By entity global quality score
- Example: "best vegan dessert" returns highest-quality vegan dessert dish-restaurant pairs
- Example: "best patio brunch spot" returns highest-quality brunch restaurants with patios
- Example: "best vegan food" returns highest-quality vegan dishes

_Note: "entities" refers to dish-restaurant pairs or restaurants_

### 4.3 Runtime Filters

Applied during query processing:

##### 1. Map Viewport Boundary Filter

- Applied to all queries
- Uses viewport coordinates from client
- Applied before ranking to improve performance

##### 2. Open Now Filter

- Only applied when toggle is enabled
- Checks current time against stored hours data
- Applied before ranking to improve performance

### 4.4 Data Collection Flow for Reddit Integration

```
1. Entity Selection (based on collection cycle)
2. Reddit API Search (with rate limiting)
3. Post/Comment Retrieval (store IDs for historical access)
4. LLM Content Processing (see LLM_Guidelines.md)
5. Entity Resolution
6. Mention Scoring and Activity Calculation
7. Bulk Database Operations
```

#### Mention Scoring and Activity Calculation Details

After LLM processing and entity resolution:

1. **LLM processes content → outputs all mentions with URLs**

2. **Entity resolution** (as described in Section 2.4)

3. **Top mention scoring and comparison**:

   - Re-score ALL existing top mentions using time-weighted formula: `upvotes × e^(-days_since / 60)`
   - Score new mentions with same formula
   - Compare all scores and update top 3-5 mentions array
   - This continuous decay ensures recent mentions naturally rise to top over time
   - Store mention metadata: `{"mention_id": "uuid", "score": 45.2, "upvotes": 67, "age_days": 2}`

4. **Update last_mentioned_at**:

   - For each new mention, compare mention timestamp against current `last_mentioned_at` value
   - Update connection metadata if newer

5. **Calculate activity level**:

   - **"trending" (🔥)**: All top 3-5 mentions are within 30 days
   - **"active" (🕐)**: `last_mentioned_at` is within 7 days
   - **"normal"**: Default state
   - Activity indicators provide real-time relevance signals to users

6. **Bulk DB operations with updated metrics and activity levels**:
   - Update connection metrics (mention_count, total_upvotes, source_diversity)
   - Update top_mentions array with new scored mentions
   - Update activity_level enum
   - Insert new mentions into mentions table
   - Single transaction for atomicity and efficiency

---

## 5. External Integration

_Note: Consider additional third-party review data sources (Google, Yelp, etc.)_

### 5.1 Reddit API

#### Implementation Challenges

- 1000 post search limit
- Limited historical data access
- Cost: $0.24/1000 calls
- Rate limit: 100 requests/minute

##### Example Impact:

"best tacos" search might require:

- Initial post search (1 call)
- Comment fetching (multiple calls)
- Historical data access (saved post IDs)
  Total: 5-10 API calls per comprehensive search

#### Solution Strategy

##### 1. Build Historical Access:

- Store all encountered post/comment IDs
- Enable direct content access
- Bypass search limitations

##### 2. Optimize Updates:

- Track last check timestamp
- Only fetch new content
- Batch similar requests

##### 3. Cost Management:

- Aggressive result caching
- Smart update scheduling
- Maintain post ID database

### 5.2 Google Places API

##### Primary Functions:

- Basic restaurant information
- Location data/geocoding
- Operating hours for "Open Now" filtering
- Order/reservation links

##### Implementation Strategy:

- Store precise coordinates with restaurant entities
- Store structured operating hours data
- Update periodically in background jobs
- Optimize API calls through batching

### 5.3 Reddit Community Integration

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

## 6. Technology Stack

#### Frontend Layer

- **Core:**
  - React Native
  - TypeScript
  - Nativewind
- **Essential Libraries:**
  - React Query for server state & caching
  - Zustand for client state management
  - React Navigation
  - React Hook Form
  - React Native Maps
  - React Native MMKV
  - React Native Reanimated for advanced animations
  - React Native Placeholder
  - Expo (for faster development)
    - expo-location for location services
    - expo-notifications for push notifications
    - expo-linking for deep linking
    - expo-updates for OTA updates
- **Add When Needed:**
  - React Native SVG
  - FlashList
  - date-fns for complex date operations
  - Zod for advanced validation

#### Backend Layer

- **Core:**
  - NestJS
  - TypeScript
  - Fastify
- **Essential Libraries:**
  - @nestjs/bull for background jobs
  - @nestjs/cache-manager with Redis
  - @nestjs/config for configuration
  - @nestjs/swagger for API documentation
  - @nestjs/websockets for real-time features
  - @nestjs/config (with dotenv-vault)
  - class-validator & class-transformer
  - Passport.js for authentication
  - winston for logging
  - helmet (security)
  - express-rate-limit
  - prom-client for Prometheus metrics
- **Add When Needed:**
  - @nestjs/microservices if scaling needs arise
  - @nestjs/schedule for cron jobs
  - Node worker_threads for CPU-intensive tasks

#### Modular Monolith Architecture

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

#### Data Layer

- **Database:**
  - PostgreSQL 15
  - Prisma
  - node-postgres for raw queries when needed
- **Cache:**
  - Redis with ioredis
  - Bull for job queues
  - Bull Board for queue monitoring
- **Migrations:**
  - Prisma migrations

#### Infrastructure

- **AWS Services:**
  - RDS for PostgreSQL
  - ElastiCache for Redis
  - S3 for storage
  - SNS for push notifications
- **Deployment**
  - Railway.app (initial deployment)
  - Docker
  - GitHub Actions for CI/CD
- **Mobile Specific**
  - Expo Application Services (EAS)
    - Build automation
    - OTA updates
    - Push notifications
    - App Store and Play Store deployments
- **Monitoring:**
  - Prometheus for metrics collection (implement in Phase 2)
  - Grafana for dashboards and visualization
  - Docker Compose setup for local Prometheus/Grafana development
  - Sentry for error and mobile crash reporting
- **Analytics:**
  - PostHog (open source) or Amplitude (free tier)

#### External APIs

- Reddit API for community data
- Google Places API for location services
- Gemini or Deepseek LLM API for content analysis

#### Testing Stack

- **Frontend:**
  - Jest for unit testing
  - React Native Testing Library
  - Maestro for E2E mobile testing
- **Backend:**
  - Jest for unit testing
  - @nestjs/testing for integration tests
  - Supertest for HTTP testing
  - k6 for performance testing

#### Development Tools

- **Essential:**
  - pnpm for package management
  - Lefthook for commit rules and git hooks
  - dotenv for environment management
  - Postman or Insomnia for API testing
  - Storybook for component development

---

## 7. Implementation Challenges

### 7.1 Entity Resolution

Challenge: Identifying when different mentions refer to the same entity
Example: "Ramen Tatsu-Ya" vs "Tatsuya Ramen" vs "Tatsu Ya"
Proposed Solution:

- Multi-layered entity resolution system
- Fuzzy matching for name variations
- Contextual clues for disambiguation
- Progressive refinement of entity mapping
- Canonical entity structure with alias storage

### 7.2 Graph Traversal Optimization

Challenge: Efficient filtering and ranking in the graph model
Example: "best vegan ramen near downtown open now"
Strategy:

- Optimize SQL for graph traversal patterns
- Index entity global quality scores
- Pre-compute common attribute relationships
- Cache traversal results
- Use efficient filtering steps before ranking

### 7.3 Global Quality Score Computation

Challenge: Balance between pre-computation and freshness
Considerations:

- Update frequency requirements
- Data freshness needs
- Computational efficiency
- Approach:
  - Background jobs for score recalculation
  - Incremental updates based on new mentions
  - Periodic full recalculation
  - Store aggregated metrics with connections
  - Score version tracking for consistency
