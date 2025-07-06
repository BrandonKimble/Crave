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

#### Core System Flow

```
User Query → Cache Check → LLM Analysis → Entity Resolution →
Graph Database Query → Ranking Application → Result Formatting →
Cache Storage → User Response
```

#### Data Collection Flow

```
Reddit API → Content Retrieval → LLM Processing →
Single Consolidated Processing Phase (Entity Resolution + Mention Scoring + Components) →
Single Database Transaction → Quality Score Computation
```

### 1.4 Core System Architecture

#### Processing Architecture

- **Modular component system**: Independent processors handle different entity combinations from LLM output
- **Dynamic query system**: Single adaptive SQL query that optimizes based on extracted entities
- **Background data collection**: Scheduled cycles (weekly new entities, quarterly full refresh) plus on-demand query-driven collection
- **Real-time query processing**: Entity resolution → dynamic query building → result ranking

#### Performance Strategy

- **Pre-computed quality scores**: Rankings calculated during data processing, not query time
- **Multi-level caching**: Hot queries (1hr), recent results (24hr), static data (7d+)
- **Single-phase processing**: Streamlined architecture eliminating intermediate JSON structures
- **Batch operations**: Bulk entity resolution, database updates, and mention processing
- **Geographic optimization**: Map-based filtering applied before ranking for performance

### 1.5 Data Collection & Knowledge Synthesis

#### Community Content Processing

- **Reddit discussion analysis**: Extract dish-restaurant connections, attributes, and sentiment from food community posts/comments
- **Organic category emergence**: Food categories develop naturally from community language patterns rather than predetermined hierarchies
- **Multi-source mention aggregation**: Combine mentions across posts, comments, and discussion threads for comprehensive evidence

#### Dynamic Ranking & Relevance

- **Quality score evolution**: Dish and restaurant rankings improve with additional community evidence over time
- **Activity indicators**: Real-time trending (🔥) and active (🕐) status based on mention recency patterns
- **Contextual performance scoring**: Restaurant rankings adapt based on query context (category/attribute-specific performance vs. global scores)

---

## 2. Data Model & Database Architecture

### 2.1 Core Database Schema

#### Graph-Based Model

_**Note**: This design uses a unified entity-relationship model where all entities (restaurants, dishes, categories, attributes) are stored in a single `entities` table differentiated by type, with relationships modeled through the `connections` table. This approach enables flexible many-to-many relationships while maintaining referential integrity and query performance. These schemas may evolve during implementation as requirements are refined._

##### 1. Entities Table

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

##### 2. Restaurant Metadata Structure

```json
{
  "phone": "+1-512-555-0123",
  "hours": {"monday": "11:00-22:00", "tuesday": "11:00-22:00", ...},
  "last_places_update": "2024-01-15T10:30:00Z",
  "additional_place_details": {...},
  ...
}
```

##### 3. Connections Table

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

##### 4. Top Mentions Metadata Structure

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

##### 5. Mentions Table

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

##### 6. User & Subscription Tables

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

### 2.2 Data Model Principles

#### Graph-Based Unified Entity Model

- **Unified dish_or_category entities**: Serve dual purposes as specific menu items AND general food categories
- **Connection-scoped relationships**: Categories and dish attributes exist only within restaurant→dish connections
- **Restaurant-scoped attributes**: Ambiance, features, and service qualities stored directly on restaurant entities
- **Evidence-driven connections**: All relationships backed by trackable community mentions with scoring
- **All connections are restaurant→dish**: No direct category or attribute connections

#### Entity Type Definitions

- **restaurant**: Physical dining establishments with location and operational data
- **dish_or_category**: Food items that can be both menu items and general categories
- **dish_attribute**: Connection-scoped descriptors that apply to dishes (spicy, vegan, house-made, Italian when describing dishes)
- **restaurant_attribute**: Restaurant-scoped descriptors that apply to restaurants (patio, romantic, family-friendly, Italian when describing restaurants)

**Context-Dependent Attributes**: Many attributes exist as separate entities based on their contextual scope. For example, "Italian" exists as both a dish_attribute entity (for Italian dishes) and a restaurant_attribute entity (for Italian restaurants), enabling precise query targeting and flexible cross-scope analysis.

### 2.3 Data Model Architecture

#### Unified dish_or_category Entity Approach

- **Single entity type serves dual purposes**:
  - Node entity (when is_menu_item = true)
  - Connection-scope metadata (stored in categories array)
- **Same entity ID can represent both menu item and category**
- **Eliminates redundancy and ambiguity** in food terminology

#### Context-Driven Attribute Entity Management

- **Separate entities by scope**: Context-dependent attributes (cuisine, dietary, value, etc.) exist as separate entities based on their scope
- **Scope-aware entity resolution**: Entity resolution matches by name AND scope to find the correct entity
- **Flexible query capabilities**: Enables precise filtering by restaurant attributes vs dish attributes
- **Examples**: "Italian" exists as both dish_attribute and restaurant_attribute entities with different IDs

#### All Connections are Restaurant-to-dish_or_category

- **Restaurant attributes**: Stored as entity IDs in restaurant entity's metadata (restaurant_attributes: uuid[])
- **Dish attributes**: Connection-scoped entity IDs stored in dish_attributes array
- **Categories**: Connection-scoped entity IDs stored in categories array
- **Only restaurant-to-dish_or_category connections** exist in the connections table

#### Categories in Connection Scope Only

- **Categories stored as entity ID references** in restaurant→dish_or_category connections
- **Restaurant-category mentions boost scores** of all related dish_or_category items
- **Enables flexible categorization** without entity proliferation

---

## 3. Data Collection & Processing

### 3.1 Data Collection Strategy

The system uses two complementary data collection strategies to build and maintain the knowledge graph: scheduled background collection and on-demand query-driven collection. Both share the same LLM-powered entity extraction pipeline but serve different purposes in the system. Implementaion details can be found in section 4

#### 3.1.1 Scheduled Background Collection

##### Purpose

Build and maintain a comprehensive knowledge graph by systematically processing community content.

##### Collection Cycles

The system implements two types of background collection cycles:

1. **Weekly New Entity Enrichment**

- **Purpose**: Process newly discovered entities from the previous week
- **Scope**: All entities created but not yet enriched
- **Schedule**: Weekly during off-peak hours
- **Focus**: Building initial connections and scoring for new entities

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

- Recalculate quality scores for affected entities
- Update score timestamps
- Maintain score history for trend analysis

##### Processing Approach

- **Single-Pass Processing**: Each processing cycle focuses only on enriching the selected entities
- **Complete Context Capture**: All discovered entities and relationships from the content are stored
- **Opportunistic Connection Updates**: Any relationships found are updated, even for entities not in the current selection
- **No Recursive API Calls**: New entities are simply created to be enriched in the next weekly cycle

#### 3.1.2 On-Demand Query-Driven Collection

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
- Recalculate quality scores for affected entities
- No additional API calls for newly discovered entities

4. **Result Enhancement**

- Immediately incorporate new data into query results

##### Key Differences from Background Collection

- Triggered by user queries rather than scheduled
- Narrower initial search focus (query-specific)

#### 3.1.3 Data Processing Efficiency

##### Shared Processing Optimizations

- **Content Maximization**: Extract all possible entities and connections from any retrieved content
- **Connection Reuse**: All content contributes to the knowledge graph, regardless of the original search purpose
- **Efficient API Usage**:
  - Store post IDs to enable direct full access (bypassing search limitations)
  - Batch similar API calls
  - Cache intermediate processing results
  - Avoid redundant API calls for the same content

#### 3.1.4 Knowledge Graph Growth

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

### 3.2 Shared Entity Resolution System

To ensure accurate metrics and search functionality, the system employs a multi-phase approach to handle name variations of all entity types: restaurants, dish_or_category, dish_attribute, and restaurant_attribute:

#### 3.2.1 Resolution Process Flow

##### Phase 1: LLM Entity Extraction & Normalization

During data collection, the LLM:

- Extracts raw entity mentions from content
- Normalizes spelling, formatting, and common variations
- Provides both raw text and normalized version

##### Phase 2: Database Entity Resolution w/ Batching (Server-Side)

###### Scope-Aware Resolution Process

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

###### Three-Tier Resolution Process

1. **Exact match against canonical names**: Single query `WHERE name IN (...) AND type = $entity_type`
2. **Alias matching**: Single query with array operations `WHERE aliases && ARRAY[...] AND type = $entity_type`
3. **Fuzzy matching for remaining entities**: Individual queries, edit distance ≤ 3-4, with type constraint

##### Phase 3: Batched Processing Pipeline

1. **Batch deduplication**: Consolidate duplicates within batch by normalized name
2. **In-memory ID mapping**: Build `{temp_id → db_id}` dictionary from results
3. **Bulk database operations**: Single transaction with UPSERT statements
4. **Prepared statement caching**: Cache query execution plans for all resolution and insertion queries

###### Resolution Decision Logic

- **High confidence (>0.85)**: Merge with existing entity, add original text as alias
- **Medium confidence (0.7-0.85)**: Apply heuristic rules or flag for review
- **Low confidence (<0.7)**: Create new entity

###### Alias Management

- When merging with existing entity, add raw text as new alias if not exists

#### 3.2.2 Entity Resolution Optimization

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

#### 3.2.3 Query Processing Application

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

**1. Read-Only Entity Resolution**

- **Never creates new entities** - only matches existing ones
- **No alias additions** - database remains unchanged
- **Unrecognized terms** treated as search filters or ignored

**2. Speed-Optimized Processing**

- **Cached common mappings** for frequent queries ("tatsuyas" → "Ramen Tatsu-Ya")
- **Faster fuzzy matching** with optimized thresholds
- **Real-time constraints** - sub-100ms entity resolution target
- **Parallel processing** of multiple entity types

**3. Search Expansion Strategy**

- **Lower confidence threshold** (>0.6 vs >0.7) - better to include than miss
- **Multi-entity candidates** - include multiple matches when ambiguous
- **Broader category inclusion** - "ramen" expands to all ramen subtypes
- **Alias propagation** - all aliases included in database queries

**4. Graceful Degradation**

- **Partial entity matching** - process recognized entities, ignore unrecognized
- **Fallback to broader categories** if specific entities not found
- **Maintain query intent** even with imperfect entity resolution

### 3.3 Quality Score Computation

#### Dish Quality Score (85-90%)

##### Primary component based on connection strength:

- **Connection strength metrics**:
  - Mention count with time decay
  - Total upvotes with time decay
  - Source diversity (unique discussion threads)

##### Secondary component (10-15%):

- **Restaurant context factor**: Derived from the parent restaurant's quality score
  - Provides a small boost to dishes from generally excellent restaurants
  - Serves as effective tiebreaker

#### Restaurant Quality Score (80% + 20%)

##### Primary component (80%):

- **Top dish connections**: 3-5 highest-scoring dishes at restaurant
  - Captures standout offerings that define restaurant

##### Secondary component (20%):

- **Overall menu consistency**: Average quality across all mentioned dishes
  - Rewards restaurants with strong overall performance

#### Category/Attribute Performance Score

For restaurant ranking in category/attribute queries:

- **Find relevant dishes**: All restaurant's dishes in queried category or with attribute
- **Contextual score**: Calculate weighted average of dish quality scores for those relevant dishes
- **Replace restaurant score**: Use contextual score instead of restaurant quality score for relevance

---

## 4. Reddit Data Collection Process

**Collection Triggers:**

- **Scheduled Background Collection**: Weekly (new entities) + Quarterly (full refresh)
- **On-Demand Collection**: Triggered by insufficient query results

### 4.1 Processing Pipeline

```
1. Entity Selection (based on collection cycle or user query when on-demand collection is triggered)
2. Reddit API Search & Post/Comment Retrieval
3. LLM Content Processing (outputs structured mentions with temp IDs; see llm_content_processing.md)
4. Single Consolidated Processing Phase:
   4a. Entity Resolution (with in-memory ID mapping; see section 3.2)
   4b. Mention Scoring & Activity Calculation (using existing DB data; see section 4.4)
   4c. Component-Based Processing (all 6 components applied in parallel; see section 4.5)
5. Single Bulk Database Transaction (all updates atomically committed)
6. Quality Score Updates (triggered by new connection data)
```

**Step 1 and 2**: Entity Selection & Reddit Data Retrieval

- Select entities based on collection cycle or user query triggers
- Reddit API search with rate limiting and cost optimization
- Fetch complete posts and comment threads with URLs

**Step 3**: LLM Content Processing (see llm_content_processing.md for more details)

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

### 4.2 LLM Processing & Entity Extraction

**Primary Function:** Convert Reddit content into structured mentions with normalized entities

**Key Processing Rules** (see `llm_content_processing.md` for full details):

- **Entity Extraction**: All 4 entity types (restaurant, dish_or_category, dish_attribute, restaurant_attribute)
- **Scope Determination**: Context-dependent attributes assigned to correct scope (dish vs restaurant)
- **Sentiment Filtering**: Only positive mentions processed
- **Category Hierarchy**: Create specific → general food categories naturally
- **Entity Normalization**: Handle variations, standardize references

**Output Structure:** Structured mentions with temp IDs (only JSON structure needed in entire pipeline)

### 4.3 LLM Data Collection Input/Output Structures

See llm_content_processing.md for more implementation and processing details.

#### LLM Input Structure

_**Note**: Structure may evolve during implementation. Key principles are batch processing efficiency, original context preservation, and hierarchical post-comment relationships._

```json
{
  "posts": [
    {
      "post_id": "string",
      "title": "string",
      "content": "string",
      "subreddit": "string",
      "url": "string",
      "upvotes": number,
      "created_at": "timestamp",
      "comments": [
        {
          "comment_id": "string",
          "content": "string",
          "author": "string",
          "upvotes": number,
          "created_at": "timestamp",
          "parent_id": "string|null",
          "url": "string"
        }
      ]
    }
  ]
}
```

#### LLM Output Structure

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
          "attribute": "string",
          "type": "selective|descriptive"
        }
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

### 4.4 Consolidated Processing Phase

The system uses a **single consolidated processing phase** (step 4 above) that eliminates intermediate JSON structures and performs all operations within one efficient database transaction.

**Phase Input:** LLM output structure (the only JSON structure needed)
**Phase Output:** Direct database updates (no intermediate JSON required)

**Key Benefits:**

- **Single database transaction** ensures atomicity and performance
- **In-memory processing** eliminates serialization overhead
- **Batch operations** optimize database performance
- **Simplified error handling** - single phase to retry if needed

Within the single consolidated processing phase, the system performs:

#### Entity Resolution (step 4a):

_**Note**: see section 3.2 for detailed implementation_

- **Three-tier resolution process**: Entity matching using exact, alias, and fuzzy matching
- **In-memory ID mapping**: Build `{temp_id → db_id}` dictionary from resolution results
- **Batched processing**: All resolution operations performed in batches for optimal performance

#### Mention Scoring & Activity Calculation (step 4b):

**Purpose**: Calculate time-weighted mention scores and activity levels to support the attribution system and user experience strategy outlined in section 6.2.

##### 1. Top Mention Scoring and Management

###### Process Overview

- **Update trigger**: Recalculated each time new mentions are processed
- **Re-scoring process**: Re-score ALL existing top mentions using time-weighted formula: `upvotes × e^(-days_since / 60)`
- **New mention scoring**: Score new mentions with same formula
- **Top mention selection**: Compare all scores and update top 3-5 mentions array
- **Continuous decay**: This approach ensures recent mentions naturally rise to top over time

###### Attribution Integration

- **Purpose**: Top mention is used for attribution display (see section 6.2)
- **Storage format**: Top mentions stored in `connections.top_mentions` JSONB array with mention metadata: `{"mention_id": "uuid", "score": 45.2, "upvotes": 67, ...}`

##### 2. Activity Level Calculation and Management

###### Timestamp Tracking

- **Process**: For each new mention, compare mention timestamp against current `last_mentioned_at` value
- **Update logic**: Update connection metadata if newer mention timestamp found
- **Usage**: This timestamp drives activity level calculations and user experience features

###### Activity Level Determination

- **"trending" (🔥)**: All top 3-5 mentions are within 30 days
- **"active" (🕐)**: `last_mentioned_at` is within 7 days
- **"normal"**: Default state - no activity indicator displayed
- **Real-time relevance**: Activity indicators provide immediate signals to users about community engagement (see section 6.2)

###### Implementation Details

- **Calculation timing**: Activity level determined during this mention processing phase
- **Data dependency**: Uses existing `last_mentioned_at` and `top_mentions` data
- **Database storage**: Activity level stored in `connections.activity_level` enum field
- **Update frequency**: Recalculated when new mentions processed
- **UI integration**: Simple conditional display based on stored activity_level enum
- **Performance**: No additional API calls or real-time calculations required

#### Component-Based Processing (step 4c):

_**Note**: see section 4.5 below for component details_

- All 6 processing components execute in parallel using resolved entity IDs
- Results accumulated in memory for single transaction

### 4.5 Component-Based DB Processing Guide

##### Modular Processing Components

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

##### Entity Creation Rules

**Always Create:**

- Restaurant entities: When restaurant is missing from database
- Specific dish connections: When is_menu_item: true and no matching connection exists

**Never Create (Skip Processing):**

- Category dishes: When category mentioned but no dishes with that category exist
- Attribute matches: When attribute filtering finds no existing dishes
- General praise dish connections: When general_praise: true but no dish connections exist
- Descriptive-only attributes: When no dish_or_category is present

##### Attribute Processing Logic

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

##### Core Principles

1. **Modular Processing:** All applicable components process independently
2. **Additive Logic:** Multiple processing components can apply to the same mention
3. **Selective = Filtering:** Find existing connections that match any of the selective attributes
4. **Descriptive = Enhancement:** Add attributes to existing connections if not already present
5. **OR Logic:** Multiple selective attributes use OR logic (any match qualifies)
6. **Create Specific Only:** Only create new connections for specific dishes (menu items)
7. **No Placeholder Creation:** Never create category dishes or attribute matches that don't exist
8. **Restaurant Always Created:** Restaurant entities are always created if missing

### 4.6 Database Operations, Metrics, and Performance Optimizations

##### Foundation Infrastructure

**Database Connection Management:**

- **Connection pooling**: Establish database connection pool at application startup
- **Prepared statements**: Cache query execution plans for all resolution and insertion queries
- **Core indexes**: Pre-existing indexes on entity names, aliases, and normalized fields for optimal performance

##### Bulk Database Operations

**Transaction Strategy:**

- **Single atomic transaction**: All updates committed together for consistency and performance
- **UPSERT operations**: `ON CONFLICT DO UPDATE/NOTHING` for efficient entity merging
- **Bulk operations**: Multi-row inserts/updates minimize database round trips (biggest performance gain)

**Operation Sequence:**

1. **Entity resolution results** → Update existing entities, create new entities, update aliases, add restaurant attributes to metadata, etc.
2. **Connection updates** → Modify metrics, attributes, categories, activity levels, and other metadata
3. **Top mention updates** → Replace top mention arrays with newly ranked mentions

##### Metric Aggregation

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

##### Performance Monitoring and Optimization

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

## 5. Query Processing System

### 5.1 Query Processing Pipeline (occurs when queries return sufficient data)

```
1. User Query Input
2. Cache Check (Hot Query Cache - 1 hour)
3. LLM Entity Extraction and Analysis (see llm_query_processing.md for processing rules)
4. Entity Normalization and Resolution
5. Dynamic Query Building Based on Extracted Entities
6. Graph Database Query Execution and Result Ranking
  6.1 If insufficient data is returned, trigger on-demand data collection (see section 3 for details)
7. Return Format Determination Based on Entity Composition
8. Cache Storage
9. Response Delivery
```

### 5.2 Multi-Level Caching Strategy

#### Cache Implementation Levels

##### 1. Hot Query Cache (1 hour retention)

**Purpose:** Handle high-frequency and trending searches
**Example:** "best ramen downtown"

- First query: Process and cache results
- Same query within hour: Instant results
- **Benefits:** Handles viral/trending searches efficiently

##### 2. Recent Search Results (24 hour retention)

**Purpose:** Optimize follow-up searches with complete result sets
**Example:** User searches "best tacos", comes back later

- Store complete result sets with quality scores and evidence
- Update if significant new data becomes available

##### 3. Static Data Cache (7+ days retention)

**Purpose:** Reduce database load for common data
**Examples:** Restaurant basic info, entity metadata, common patterns

#### Cache Invalidation Strategy

- **Time-based expiration** for different data types based on volatility
- **Smart invalidation** when entities receive new mentions or updates
- **Trend-based cache warming** for predicted popular queries
- **Geographic cache segmentation** for location-based query optimization

#### Redis Implementation

- **Connection pooling** established at application startup
- **Efficient serialization** for complex result sets
- **LRU eviction** with appropriate memory limits
- **Performance monitoring** of hit rates and response times

### 5.3 Query Understanding & Processing via LLM Analysis

#### Entity-Based Query Processing

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

#### Query Analysis & Processing

##### Primary Function: Convert natural language queries to structured entity parameters for dynamic query building

_Important: This process maps queries to existing entities and relationships for graph traversal._

Simplified Processing Tasks (see llm_query_processing.md for more details):

- **Entity extraction**: Extract all relevant entities (restaurants, dish_or_category, dish_attribute, restaurant_attribute)
- **Term normalization and entity resolution**: Handle entity variations and standardize references
- **Attribute scope classification**: Distinguish between dish-scoped and restaurant-scoped attributes
- **Location and availability requirements**: Identify geographic and temporal constraints
- **Output standardized format**: Structure extracted entities for dynamic query building

### 5.4 LLM Query Processing Input/Output Structures

See llm_query_processing.md for more implementation and processing details.

#### LLM Input Structure

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

#### LLM Output Structure

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

### 5.5 Dynamic Query Architecture

#### Entity-Driven Query System Design

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

#### Dynamic Query Building Logic

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

#### Attribute Scope Processing

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

#### Query Building Process

Following **step 5** in the query pipeline, the system:

1. **Entity Analysis**: Examine which entity types are present in the processed query
2. **Dynamic SQL Construction**: Build conditional WHERE clauses based on entity presence
3. **Parameter Binding**: Inject resolved entity IDs and filter values into query
4. **Scope-Aware Filtering**: Apply restaurant attributes before connection filtering for optimal performance
5. **Geographic Integration**: Include map boundaries and availability filters
6. **Query Optimization**: Leverage database indexes and pre-computed scores for fast execution

#### Query Execution Examples

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

#### Performance Optimizations

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

### 5.6 Location & Availability Filtering

Enabled by Google Maps/Places API integration and attribute-based filtering

#### Map-Based Location Filtering

- **Map-Centric UI**: Users navigate a map interface to define their area of interest
- **Implicit Boundary Filtering**: Query uses visible map boundaries as location filter
- **Implementation**:
  - Each query includes viewport coordinates (NE and SW bounds)
  - Applied during **Dynamic Query Building** (step 5) and executed in **Graph Database Query Execution** (step 6)
  - Database filters restaurants within these coordinates **before ranking** using geographic indexes
  - No text-based location parsing required - eliminates ambiguity in location interpretation

#### Availability Filtering: Toggle + Attribute Approach

- **"Open Now" Toggle**: Binary filter using current time against stored operating hours
  - Applied during **Dynamic Query Building** with current timestamp
  - Executed in database query **before ranking** for performance optimization
  - Uses structured operating hours data from Google Places API
- **Attribute-based Time Filtering**: System finds restaurants with connections to time/occasion attribute entities
  - Examples: "brunch", "happy hour", "late night", "weekend specials"
  - Processed as dish_attribute or restaurant_attribute entities through natural language
  - Applied using existing dynamic query filtering

### 5.7 Return Format Determination

#### Entity-Based Return Strategy

The system determines return format based on the **entity composition** of the query rather than predefined query types. This approach provides consistent, predictable responses while adapting to user intent naturally.

#### Return Format Logic

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

#### Return Format Types

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

#### Restaurant Ranking Methodology

For dual list returns, restaurant rankings are **contextually calculated** based on query entities:

- **Aggregated performance scoring**: Restaurant rankings based on weighted average of relevant dish_or_category quality scores
- **Entity-specific relevance**: Only dish_or_category items matching the query entities contribute to restaurant ranking
- **Attribute-driven scoring**: Restaurant performance calculated from connections that match specified attributes
- **Recency weighting**: Recent performance weighted more heavily than historical data

#### Implementation Benefits

- **Predictable UI patterns**: Frontend handles consistent return format logic
- **Entity-driven relevance**: Restaurant rankings always contextual to query entities
- **Natural user flow**: Users get both specific recommendations and venue discovery
- **Performance consistency**: Single query generates both lists simultaneously

#### Result Structure Consistency

Each result format maintains consistent data structure for seamless UI integration:

- Dish results always include restaurant context and performance metrics
- Restaurant results always include relevant dish examples and performance metrics
- Evidence attribution present across all result types

### 5.8 Post-Processing Result Structure

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

### 5.9 Ranking System

_Important: This system relies on pre-computed global quality scores for ranking with attributes serving as filters._

#### Query Time Ranking

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

#### Results Display

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

## 6. Community Engagement & Growth Strategy

### 6.1 Enhanced Attribution System (Foundation Feature)

#### UI Implementation

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

#### Link Strategy

**Dual-Access Approach:**

- **Natural interaction**: Users can click quote text intuitively
- **Explicit CTA**: "Join conversation" button provides clear action
- **Consistent destination**: Both link to same Reddit thread for focused engagement
- **Mobile-optimized**: Links open Reddit app when available, web/appstore fallback

#### Attribution Benefits

**For Users:**

- **Context preservation**: See exact discussion that led to recommendation
- **Community discovery**: Find relevant food communities and active discussants
- **Engagement continuity**: Seamless transition from app to Reddit discussion

**For Reddit:**

- **High-quality traffic**: Users arrive at specific, relevant comment threads
- **Mobile engagement**: Optimized for mobile Reddit experience
- **Content context**: Users understand the community discussion context

### 6.2 Top Mentions & Activity Indicators (User Experience Strategy)

#### Visual Activity Indicators

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

#### Top Mentions for Attribution

**Strategy**: Use the highest-scoring recent mentions to drive attribution and Reddit engagement.

**Implementation Approach**:

- **Top mention selection**: Automatically select the best recent mention for attribution display
- **Time-weighted relevance**: Recent mentions with community engagement rise to the top
- **Attribution quality**: Ensure attribution uses compelling, recent community quotes
- **Engagement optimization**: Activity indicators guide users toward active discussions

**Technical Implementation**: See section 4.4 (step 4b) for detailed processing logic and database integration.

### 6.3 Social Sharing & Contribution Features

#### Bookmark Page Share Extension

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

#### Content Generation Strategy

**Smart Templates:**

- **Dynamic dish/restaurant insertion**: Pull from user's recently saved items
- **Community context**: Reference specific subreddit communities
- **Gratitude expression**: Built-in thanks to community for recommendations
- **Customization**: User can modify template before posting

**Engagement Optimization:**

- **Subreddit targeting**: Auto-select appropriate food subreddit based on location
- **Timing suggestions**: Recommend optimal posting times for engagement
- **Follow-up prompts**: Encourage users to engage with responses to their posts

### 6.4 Database Schema Extensions for Reddit Integration

_Note: Core database schema defined in section 2.1. This section covers Reddit-specific field usage and implementation._

#### Connection Table Updates

- **last_mentioned_at**: Timestamp of most recent mention for activity calculation
- **activity_level**: Pre-computed activity status for UI display optimization
- **top_mentions**: JSONB array storing mention metadata for attribution display

#### Mentions Table Modifications

- **source_url**: Store full Reddit URLs instead of just post/comment IDs
- **subreddit**: Extract subreddit from URL during processing OR store separately

### 6.5 Growth Metrics & Attribution Strategy

#### Trackable Success Metrics

**User Engagement Metrics:**

- **Click-through rate**: Quote clicks vs. CTA button clicks
- **Community discovery**: Subreddit visits from attribution links
- **Share completion rate**: Bookmark share feature usage and completion

**Growth & Acquisition Metrics:**

- **Reddit referral traffic**: Inbound traffic from Reddit communities
- **Geographic expansion**: User requests for new city coverage
- **Community growth**: New subreddit communities engaged
- **Content virality**: User-generated posts that gain traction

#### Attribution & Tracking Implementation

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

#### Value Creation for Reddit

- **High-quality mobile traffic**: Users arrive at specific, relevant discussions
- **Content creation assistance**: Share features generate new posts for food communities
- **Community engagement**: Users engage with existing discussions through attribution
- **Third-party marketing**: Bookmark sharing and attribution drive new users to Reddit
- **Content licensing**: Proper attribution maintains Reddit as authoritative source
- **API collaboration**: Potential for enhanced Reddit API integration

---

## 7. Technology Stack

_**Note**: This is a high-level overview of the technology stack. The actual implementation will be determined by the specific requirements of the project._

### Frontend Layer

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

### Backend Layer

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

### Data Layer

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

### Infrastructure

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

### External APIs

- Reddit API for community data
- Google Places API for location services
- Gemini or Deepseek LLM API for content analysis

### Testing Stack

- **Frontend:**
  - Jest for unit testing
  - React Native Testing Library
  - Maestro for E2E mobile testing
- **Backend:**
  - Jest for unit testing
  - @nestjs/testing for integration tests
  - Supertest for HTTP testing
  - k6 for performance testing

### Development Tools

- **Essential:**
  - pnpm for package management
  - Lefthook for commit rules and git hooks
  - dotenv for environment management
  - Postman or Insomnia for API testing
  - Storybook for component development

---

## 8. Modular Monolith Architecture

### 8.1 Core Module Structure

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
├── shared/                        # Shared utilities and types
│   ├── types/                     # Common TypeScript interfaces
│   ├── utils/                     # Helper functions, constants
│   ├── decorators/                # Custom NestJS decorators
│   └── exceptions/                # Custom exception classes
│
└── main.ts                        # Application bootstrap
```

### 8.2 Domain Responsibilities

**Content Processing**: Handles all aspects of ingesting and analyzing community content

- **Workflow Orchestration**: Coordinate reddit-collector → llm-processor → entity-resolver workflow
- **Metric Aggregation**: Update connection metrics when new mentions are processed
- **Score Computation**: Calculate global quality scores after connection metrics are updated
- **Background Job Management**: Schedule and manage systematic content processing operations

**Search & Discovery**: Manages query processing and result delivery using pre-computed data

- **Result Ranking**: Retrieve and apply stored global quality scores for fast ranking
- **Query Optimization**: Use pre-computed scores and activity levels for sub-second responses
- **Discovery Features**: Leverage activity indicators computed during data processing

**User Experience**: Focuses on user-facing features and interactions
**External Integrations**: Centralizes third-party service connections
**Infrastructure**: Provides foundational system services

### 8.3 Development and Design Principles

**Dependency Injection & Loose Coupling**:

- **NestJS DI container**: Use dependency injection for all module interactions
- **Interface-based design**: Define clear contracts between modules to enable testing and flexibility
- **Repository pattern**: Abstract database access through repositories for clean separation
- **Service layer isolation**: Keep business logic separate from framework concerns

**Event-Driven Communication**:

- **Asynchronous operations**: If performant, use events for background processing and cross-module notifications
- **Score update events**: If performant, eit events when process-orchestrator completes mention processing to trigger downstream updates
- **User activity events**: Track search patterns and bookmark changes for personalization
- **Decoupled notifications**: Use event bus for sending alerts and updates without tight coupling

**Performance-First Architecture**:

- **Pre-computed rankings**: Calculate all scores right after each content processing cycle, not query time
- **Strategic caching**: Cache at multiple levels (query results, entity data, computed scores)
- **Bulk operations**: Process entities and mentions in batches for database efficiency
- **Background processing**: Move heavy computation (LLM analysis, score calculation) to process-orchestrator

**Code Organization Best Practices**:

- **Domain-driven structure**: Organize code by business domain, not technical layer
- **Single responsibility**: Each module has clear, focused purpose
- **Shared infrastructure**: Common concerns (database, caching, monitoring) centralized in infrastructure domain
- **Testability**: Design for easy unit testing with mocked dependencies and clear interfaces

---

## 9. Implementation Roadmap

_Dependencies-based development order with testable milestones_

### Milestone 1: Database Foundation (Week 1-2)

_Nothing works without this_

- **Database schema creation**: Entities, connections, mentions tables with proper indexes
- **Connection pooling and basic database operations**: CRUD operations, bulk inserts
- **Database migrations and version control**: Schema evolution capability

**Success Criteria:**

- Database handles 1000+ entity inserts in <500ms
- All foreign key relationships properly enforced
- Migration system functional for schema changes

### Milestone 2: Entity Processing Core (Week 3-4)

_Required for any content processing_

- **LLM integration**: API connectivity, structured input/output handling
- **Basic entity resolution**: Exact name matching, simple deduplication
- **Bulk operations pipeline**: Multi-row inserts/updates, transaction management

**Success Criteria:**

- Process 100 entity batch in <2 seconds
- LLM integration handles malformed input gracefully
- Entity resolution accuracy >80% on simple test cases

### Milestone 3: Reddit Data Collection (Week 5-6)

_Required for any community content_

- **Reddit API integration**: Authentication, rate limiting, cost management
- **Content retrieval pipeline**: Post/comment fetching, URL storage
- **Background job system**: Scheduled collection, error handling, retry logic

**Success Criteria:**

- Successfully collect data from 3+ food subreddits
- API cost stays under $50/day during testing
- Job system handles failures and retries appropriately

### Milestone 4: Dynamic Query System (Week 7-8)

_Core search architecture - required for MVP_

- **Dynamic query builder**: Single adaptive SQL query system that responds to any entity combination
- **Entity-based filtering**: Automatic scope-aware filtering for restaurant vs dish attributes
- **Result standardization**: Entity-driven single/dual list returns, consistent formatting

**Success Criteria:**

- All entity combinations return properly formatted results
- Query response time <1 second without caching
- Location filtering works within map boundaries

### Milestone 5: Basic Ranking & Scoring (Week 9-10)

_Required for useful search results_

- **Global quality score computation**: Dish and restaurant ranking algorithms
- **Mention scoring system**: Time-weighted formula, activity indicators
- **Connection metrics aggregation**: Mention count, upvotes, source diversity

**Success Criteria:**

- Search results correlate with obvious community consensus
- Activity indicators (trending/active) reflect recent discussions
- Score computation completes in <100ms per connection

### Milestone 6: Basic Caching Layer (Week 11-12)

_Performance requirement for MVP_

- **Multi-level cache implementation**: Hot queries (1hr), recent results (24hr), static data (7d)
- **Redis setup**: Connection pooling, basic key structure, memory management
- **Cache integration**: Query pipeline integration, hit/miss tracking

**Success Criteria:**

- Cache hit rate >85% for repeat queries
- Cached queries respond in <200ms
- Cache memory usage stays under configured limits

### Milestone 7: Payment Integration (Week 13-14)

_Business requirement for launch_

- **Subscription management**: Stripe integration, trial flow, billing cycles
- **User authentication**: Account creation, login, session management
- **Access control**: Feature gating, subscription status checking

**Success Criteria:**

- Payment flow conversion rate >60% in testing
- Trial-to-paid conversion tracking functional
- No payment processing errors in test transactions

### Milestone 8: Basic Search Interface (Week 15-16)

_MVP user experience_

- **Search functionality**: Natural language input, LLM query processing
- **Result display**: Dish-restaurant pairs, basic evidence cards
- **Map integration**: Location selection, viewport boundary filtering

**Success Criteria:**

- Search responds in <2 seconds end-to-end
- Users can successfully find specific dishes/restaurants
- Map filtering produces relevant local results

### Milestone 9: Evidence & Attribution System (Week 17-18)

_Core value proposition_

- **Reddit attribution**: Quote display, source links, "Join conversation" CTAs
- **Evidence cards**: Upvote counts, recency indicators, subreddit attribution
- **Activity indicators**: Visual cues for trending/active discussions

**Success Criteria:**

- Evidence cards drive measurable Reddit click-through
- Attribution links work correctly to specific comments
- Users understand the community-powered value proposition

### Milestone 10: Bookmarking & Sharing (Week 19-20)

_Basic user engagement features_

- **Dish-centric bookmarking**: Save dishes with restaurant context
- **List management**: Create, edit, delete personal lists
- **Basic sharing**: Share lists with friends, simple URLs

**Success Criteria:**

- Users save >3 items per session on average
- Shared lists load correctly for recipients
- List management is intuitive and error-free

**MVP LAUNCH CHECKPOINT** _(End of Month 5)_

- All core functionality operational
- Payment processing live
- Basic user acquisition can begin

### Milestone 11: Advanced Entity Resolution (Week 21-22)

_Performance and accuracy improvements_

- **Three-tier resolution**: Exact → Alias → Fuzzy matching
- **Fuzzy matching optimization**: Levenshtein distance, performance tuning
- **Alias management**: Automatic alias creation, duplicate prevention

**Success Criteria:**

- Entity resolution accuracy >90%
- Fuzzy matching completes in <100ms per entity
- Duplicate entity creation reduced by >50%

### Milestone 12: Discovery Features (Week 23-24)

_User engagement and retention_

- **Discovery feed**: Recently discussed, quick bites, hidden gems
- **Enhanced attribution**: Multiple quotes, source diversity display
- **"Open now" filtering**: Real-time availability, hours integration

**Success Criteria:**

- Discovery feed drives >20% of user sessions
- User retention improves by >15% week-over-week
- "Open now" filtering produces accurate results

### Milestone 13: Premium Tier Features (Week 25-28)

_Revenue optimization_

- **Advanced discovery**: Trending analysis, neighborhood insights, category reports
- **Smart alerts**: Personalized notifications, custom alert creation
- **Complex queries**: Multi-attribute search, advanced filtering
- **Enhanced history**: Personal food maps, pattern analysis

**Success Criteria:**

- Premium conversion rate >10%
- Premium users show >2x engagement vs basic users
- Advanced features are actively used (>50% of premium users)

### Milestone 14: Growth & Viral Features (Week 29-32)

_User acquisition optimization_

- **Share/contribute tools**: Reddit post templates, community integration
- **Referral system**: Tracking, incentives, viral mechanics
- **Collaborative features**: Shared lists, friend recommendations
- **A/B testing framework**: Feature optimization, conversion testing

**Success Criteria:**

- Viral coefficient >0.2
- Referral system drives >20% of new signups
- User-generated content creates measurable Reddit engagement

### Milestone 15: Scale & Advanced Performance (Week 33+)

_Growth infrastructure_

- **Advanced caching**: Intelligent invalidation, Redis optimization
- **Database optimization**: Query tuning, advanced indexing, performance monitoring
- **Multi-city expansion**: Geographic scaling, local community integration
- **Advanced monitoring**: Performance tracking, user analytics, system health

**Success Criteria:**

- System handles 10,000+ concurrent users
- Database queries maintain <100ms average response time
- Multi-city launch successful with local traction

---

## 10. Appendices

### A. LLM Processing Guidelines

See `llm_content_processing.md` for detailed content processing rules

### B. Database Migrations

See migration files in `/prisma/migrations`
