# Crave - Local Food Discovery App

## Product Requirements Document v3.0

---

## 1. Overview & Core Concepts

### 1.1 Product Vision

Crave transforms scattered community food knowledge into confident dining decisions by surfacing evidence-based dish and restaurant recommendations. Users discover specific dishes through authentic community consensus rather than generic ratings.

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
Entity Resolution → Graph Database Storage → Metric Aggregation →
Quality Score Computation
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

### 2.4 Natural Category Emergence

A key advantage of our graph approach is allowing specific dish categories to emerge naturally from community discussion:

- When users mention "the French Dip at Bartlett's," the system creates:

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

---

## 3. Query Processing & Search System

### 3.1 Query Processing Pipeline

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

### 3.2 Template-Based Query Architecture

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

The system processes natural language queries through LLM analysis (see LLM_Guidelines.md) to extract:

- Query type (dish_specific, category_specific, venue_specific, attribute_specific, broad)
- Entity references (restaurants, dishes, categories, attributes)
- Location boundaries and availability requirements
- Structured parameters for template selection

### 3.3 Standardized Return Formats

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

### 3.4 Location & Availability Filtering

#### Map-Based Location

- **UI**: Users navigate map to define area of interest
- **Implementation**: Query includes viewport coordinates (NE/SW bounds)
- **Database**: Filter restaurants within coordinate bounds before ranking
- **No text parsing**: Eliminates ambiguity in location interpretation

#### Availability Toggle

- **"Open Now" toggle**: Binary filter using current time against stored hours
- **Attribute-based time filtering**: "brunch", "happy hour" processed as attributes
- **Performance optimization**: Apply filters before ranking for efficiency

### 3.5 Caching Strategy

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

---

## 4. Data Collection & Processing

### 4.1 Data Collection Strategies

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
- Send to LLM for entity and relationship extraction (see LLM_Guidelines.md)
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

### 4.2 Reddit Data Collection Flow

1. Entity Selection (based on collection cycle)
2. Reddit API Search (with rate limiting)
3. Post/Comment Retrieval (store IDs for historical access)
4. LLM Content Processing (see LLM_Guidelines.md)
5. Entity Resolution
6. Mention Scoring: upvotes × e^(-days_since / 60)
7. Activity Level Calculation:
   - "trending" if all top 3-5 mentions within 30 days
   - "active" if last_mentioned_at within 7 days
   - "normal" otherwise
8. Bulk Database Operations with updated metrics

#### Mention Scoring & Activity Calculation Details

- **Time-weighted score**: `upvotes × e^(-days_since / 60)`
- **Continuous updating**: Re-score all mentions when new ones added
- **Top mention tracking**: Maintain ranked list of best 3-5 mentions per connection
- **Activity indicators**: Visual cues (🔥 for trending, 🕐 for active) based on mention recency

### 4.3 Entity Resolution System

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

##### Phase 3: Batch Processing Optimization

- **Batch deduplication**: Consolidate duplicate entities within batch before resolution
- **In-memory ID mapping**: Build {temp_id → db_id} dictionary from resolution results
- **Bulk operations**: Multi-row inserts/updates in single transaction
- **Prepared statements**: Cache query execution plans for all resolution queries

##### Query Processing Application

The same entity resolution process applies during user queries:

1. LLM normalizes user query terms
2. System matches against canonical names and aliases
3. System expands search to include all matching entities and their aliases

Example:

- User searches: "best food at tatsuyas"
- System identifies "tatsuyas" as alias for "Ramen Tatsu-Ya"
- Query processes as venue-specific search for this canonical entity

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

### 5.4 Query-Time Ranking

#### Adapts based on query specificity:

##### 1. Dish Queries

- Filter: Find dish-restaurant pair connected to the specified dish or category
- Apply map viewport boundary filter
- Apply "Open Now" filter if enabled
- Return: Dish-restaurant pairs
- Rank: By dish global quality score
- Example: "best ramen" returns highest-quality ramen dishes

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

---

## 6. External Integrations

### 6.1 Reddit API Integration

#### Technical Implementation

- **API Costs**: $0.24/1000 calls, 100 requests/minute rate limit
- **Historical access strategy**: Store all post/comment IDs for direct access
- **Search limitations**: 1000 post limit, work around with stored ID database
- **Cost management**: Aggressive caching, smart update scheduling, batch processing

#### Data Processing Flow

1. **API calls**: Search for entity-specific terms, fetch complete post/comment threads
2. **Content processing**: Send structured data to LLM for entity extraction (see LLM_Guidelines.md)
3. **Mention scoring**: Apply time-weighted scoring formula for ranking
4. **Activity calculation**: Determine trending/active status based on recency
5. **Database updates**: Bulk operations with new mentions and updated metrics

#### Attribution Requirements

- **Full URLs**: Store complete Reddit URLs for attribution links
- **Subreddit tracking**: Maintain subreddit information for community linking
- **Author attribution**: Preserve username for quote attribution
- **Upvote tracking**: Store upvote counts for evidence strength

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

### 6.2 Google Places API Integration

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

## 7. Performance & Optimization

### 7.1 Database Performance

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

### 7.2 Entity Resolution Optimization

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

### 7.3 Graph Traversal Optimization

Challenge: Efficient filtering and ranking in the graph model
Example: "best vegan ramen near downtown open now"
Strategy:

- Optimize SQL for graph traversal patterns
- Index entity global quality scores
- Pre-compute common attribute relationships
- Cache traversal results
- Use efficient filtering steps before ranking

---

## 8. Technology Stack

### 8.1 Frontend Architecture

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

### 8.2 Backend Architecture

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

### 8.3 Data Layer

#### Database

- **PostgreSQL 15**: Primary database with advanced features
- **Prisma**: Type-safe database access and migrations
- **Redis**: Caching and job queue management

#### Performance Tools

- **Connection pooling**: Optimized database connections
- **Query optimization**: Prepared statements and efficient indexes
- **Migration management**: Prisma migrations for schema evolution

### 8.4 Infrastructure & Deployment

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

### 8.5 External APIs

#### Primary Integrations

- **Reddit API**: Community data collection with cost optimization
- **Google Places API**: Restaurant data and location services
- **LLM API**: Gemini or DeepSeek for content analysis

#### Development Tools

- **Package Management**: pnpm for efficient dependency management
- **Code Quality**: Lefthook for git hooks and automated checks
- **API Testing**: Postman/Insomnia for endpoint testing and documentation

---

## 9. Implementation Phases

### 9.1 Phase 1: Core Data Foundation (Months 1-2)

#### Database & Schema Implementation

- **Entity tables creation**: Restaurants, dish_or_category, attributes with proper indexes
- **Connection system**: Restaurant→dish relationships with metadata arrays
- **Mention tracking**: Full Reddit attribution and evidence storage

#### Entity Processing Pipeline

- **LLM integration**: Connect to content processing API with structured output (see LLM_Guidelines.md)
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

### 9.2 Phase 2: Search & Ranking System (Months 3-4)

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

### 9.3 Phase 3: User Interface & Features (Months 5-6)

#### Mobile App Development

- **Core search experience**: Natural language input with map-based location
- **Result display**: Evidence cards with Reddit attribution and quick actions
- **Bookmarking system**: Dish-centric lists with sharing capabilities

#### Discovery Features

- **Basic discovery feed**: Recently discussed, quick bites, hidden gems
- **Activity indicators**: Visual trending and active discussion cues
- **Reddit integration**: Enhanced attribution with "Join conversation" links

#### User Management

- **Subscription tiers**: $3.99 basic tier with core features
- **User preferences**: Location, dietary restrictions, search history
- **Sharing functionality**: Social features and list collaboration

**Success Criteria**:

- Smooth user experience with <2 second search results
- 70%+ user retention after first week
- Measurable Reddit click-through traffic

### 9.4 Phase 4: Advanced Features & Optimization (Months 7+)

#### Premium Features ($9.99 tier)

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

---

## 10. Success Metrics & KPIs

### 10.1 Product Metrics

- **Search satisfaction**: Query success rate, result relevance scores
- **User engagement**: Search frequency, discovery feed usage, bookmarking activity
- **Reddit integration**: Click-through rates, share feature usage, community contribution

### 10.2 Technical Metrics

- **Performance**: Query response times, cache hit rates, uptime percentage
- **Data quality**: Entity resolution accuracy, mention processing success rate
- **Scalability**: Concurrent user capacity, database performance under load

### 10.3 Business Metrics

- **User acquisition**: Download rates, onboarding completion, retention curves
- **Monetization**: Subscription conversion rates, revenue per user, churn analysis
- **Partnership value**: Reddit traffic generation, restaurant engagement, community growth

---

## 11. Risk Mitigation

### 11.1 Technical Risks

- **Reddit API changes**: Maintain flexible integration, develop alternative data sources
- **LLM processing costs**: Optimize content filtering, implement efficient batching
- **Database performance**: Proactive monitoring, query optimization, scaling preparation

### 11.2 Business Risks

- **Competitive landscape**: Focus on unique community synthesis value proposition
- **User adoption**: Extensive testing, iterative improvement, strong onboarding experience
- **Reddit relationship**: Provide measurable value, maintain attribution, contribute to community growth

### 11.3 Operational Risks

- **Data accuracy**: Multiple validation layers, community feedback mechanisms
- **Content moderation**: Automated filtering, community reporting, manual review processes
- **Privacy compliance**: Clear data usage policies, user control over personal information
