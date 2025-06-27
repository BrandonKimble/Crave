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
Reddit API → Content Retrieval → LLM Processing (see llm_content_processing.mdline.md) →
Entity Resolution → Graph Database Storage → Metric Aggregation →
Quality Score Computation
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
    "source_url": "string",
    "content_excerpt": "string",
    "upvotes": 67,
    "created_at": "2024-01-15T10:30:00Z"
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
- **dish_attribute**: Connection-scoped descriptors that apply to dishes(spicy, vegan, house-made)
- **restaurant_attribute**: Restaurant-scoped descriptors that apply to (patio, romantic, family-friendly)

### 2.3 Data Model Architecture

#### Unified dish_or_category Entity Approach

- **Single entity type serves dual purposes**:
  - Node entity (when is_menu_item = true)
  - Connection-scope metadata (stored in categories array)
- **Same entity ID can represent both menu item and category**
- **Eliminates redundancy and ambiguity** in food terminology

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

###### Three-Tier Resolution Process

1. **Exact match against canonical names**: Single query `WHERE name IN (...)`
2. **Alias matching**: Single query with array operations `WHERE aliases && ARRAY[...]`
3. **Fuzzy matching for remaining entities**: Individual queries, edit distance ≤ 3-4

##### Phase 3: ID mapping and bulk operations

- Build temporary ID to database ID mapping
- Use single transaction with UPSERT operations
- Batch all insertions and updates for performance

###### Resolution Decision Logic

- **High confidence (>0.85)**: Merge with existing entity, add original text as alias
- **Medium confidence (0.7-0.85)**: Apply heuristic rules or flag for review
- **Low confidence (<0.7)**: Create new entity

###### Alias Management

- When merging with existing entity, add raw text as new alias if not exists

#### 3.2.2 Entity Resolution Optimization

##### Batched Processing Pipeline

1. **Batch deduplication**: Consolidate duplicates within batch by normalized name
2. **In-memory ID mapping**: Build {temp_id → db_id} dictionary from results
3. **Bulk database operations**: Single transaction with UPSERT statements
4. **Prepared statement caching**: Cache query execution plans for all resolution and insertion queries

##### Performance Monitoring

- **Resolution timing**: Track time by entity type and batch size
- **Fuzzy match efficiency**: Monitor expensive operations
- **Database operation metrics**: Measure insert/update performance
- **Memory usage tracking**: Ensure efficient resource utilization

#### 3.2.3 Query Processing Application

The same entity resolution process applies during user queries, but with key optimizations for real-time performance:

1. LLM normalizes user query entity terms
2. System matches against canonical names and aliases
3. Query processes using matched entities for database search

Example:

- User searches: "best food at tatsuyas"
- System identifies "tatsuyas" as alias for "Ramen Tatsu-Ya"
- Query processes as venue-specific search for this canonical entity

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

#### 3.2.4 Fuzzy Matching Performance Optimizations

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

### 3.3 Data Collection Process

#### 3.3.1 Reddit Data Collection Pipeline (background & on-demand collection)

```
1. Entity Selection (based on collection cycle or user query when on-demand collection is triggered)
2. Reddit API Search
3. Post/Comment Retrieval
4. LLM Content Processing (see llm_content_processing.mdline.md)
5. Entity Resolution (see section 3.2)
6. Mention Scoring: upvotes × e^(-days_since / 60)
7. Activity Level Calculation:
   - "trending" if all top 3-5 mentions within 30 days
   - "active" if last_mentioned_at within 7 days
   - "normal" otherwise
8. Bulk Database Operations with Updated Metrics
```

#### 3.3.2 Mention Scoring & Activity Calculation Details

After LLM processing and entity resolution:

1. **LLM processes content → outputs all mentions with URLs**

2. **Entity resolution** (as described in Section 3.2)

3. **Top mention scoring and comparison**:

   - Re-score ALL existing top mentions using time-weighted formula: `upvotes × e^(-days_since / 60)`
   - Score new mentions with same formula
   - Compare all scores and update top 3-5 mentions array
   - This continuous decay ensures recent mentions naturally rise to top over time
   - Store mention metadata: `{"mention_id": "uuid", "score": 45.2, "upvotes": 67, ...}`

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

#### 3.3.3 Content Understanding & Processing via LLM Analysis

##### Primary Function: Process Reddit/review content into structured data with graph entities, connections, and mentions

Simplified Processing Tasks (see llm_content_processing.mdline.md for more details):

- Entity extraction (restaurants, dish_or_category, dish_attribute, restaurant_attribute)
- Inference-based attribute and dish category identification
  - Create specific and general dish category entities (e.g., "french dip", not just "sandwich")
  - Allow entities to emerge organically from community mentions
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

#### 3.3.4 Natural Category Emergence

A key advantage of our graph approach is allowing specific dish categories to emerge naturally from community discussion:

- When comments recommend "the French Dip at Bartlett's," an LLM uses the llm_content_processing.mdline.md to create:

  - A menu item dish_or_category entity (french dip")
  - A category dish_or_category entity ("french dip")
  - A broader category dish_or_category entity ("sandwich")
  - Appropriate connections between these entities

- This enables both specific and general queries:
  - "Best french dip" finds all dishes connected to the "french dip" category
  - "Best sandwich" includes all sandwich types, including french dips
- Categories evolve organically based on how the community discusses food:
  - No need for predetermined hierarchies
  - New categories automatically created as they appear in discussions
  - Relationships between categories formed naturally through mentions

#### 3.3.5 Data Collection Output Structure

_**Note**: This is only a example. The actual output structure may vary._

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

#### 3.3.6 Component-Based DB Processing Guide

##### Modular Processing Components

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
4. **Descriptive = Enhancement:** Add attributes to existing connections
5. **OR Logic:** Multiple selective attributes use OR logic (any match qualifies)
6. **Create Specific Only:** Only create new connections for specific dishes (menu items)
7. **No Placeholder Creation:** Never create category dishes or attribute matches that don't exist
8. **Restaurant Always Created:** Restaurant entities are always created if missing

---

## 4. Query Processing System

### 4.1 Query Processing Pipeline (occurs when queries return sufficient data)

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

### 4.2 Query Understanding & Processing via LLM Analysis

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
- **"best Italian food at romantic restaurants"** → dish_or_category: ["Italian"], restaurant_attributes: ["romantic"] → Combine filters, return dual lists

#### Query Analysis & Processing

##### Primary Function: Convert natural language queries to structured entity parameters for dynamic query building

_Important: This process maps queries to existing entities and relationships for graph traversal._

Simplified Processing Tasks (see llm_query_processing.md for more details):

- **Entity extraction**: Extract all relevant entities (restaurants, dish_or_category, dish_attribute, restaurant_attribute)
- **Term normalization and entity resolution**: Handle entity variations and standardize references
- **Attribute scope classification**: Distinguish between dish-scoped and restaurant-scoped attributes
- **Location and availability requirements**: Identify geographic and temporal constraints
- **Output standardized format**: Structure extracted entities for dynamic query building

### 4.3 LLM Query Processing Output Structure

```json
{
  "entities": {
    "restaurants": [
      {
        "normalized_name": "string",
        "original_text": "string" | null,
        "entity_ids": ["uuid"]
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

### 4.4 Location & Availability Filtering

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

### 4.5 Dynamic Query Architecture

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

The system constructs queries using conditional SQL blocks based on entity presence:

```sql
-- Core query structure adapts to available entities
WITH filtered_restaurants AS (
  SELECT entity_id FROM entities
  WHERE type = 'restaurant'
  -- Restaurant entity filtering (when specific restaurants mentioned)
  AND ($restaurant_ids IS NULL OR entity_id = ANY($restaurant_ids))
  -- Restaurant attribute filtering (when restaurant attributes mentioned)
  AND ($restaurant_attribute_ids IS NULL OR restaurant_attributes && $restaurant_attribute_ids)
  -- Geographic filtering (always applied if provided)
  AND ($geographic_bounds IS NULL OR ST_Contains($geographic_bounds, point(longitude, latitude)))
  -- Availability filtering (when open_now toggle used)
  AND ($open_now IS NULL OR operating_hours_check(restaurant_metadata->>'hours', $current_timestamp))
),
filtered_connections AS (
  SELECT c.* FROM connections c
  JOIN filtered_restaurants fr ON c.restaurant_id = fr.entity_id
  -- dish_or_category filtering (when specific dishes/categories mentioned)
  WHERE ($dish_or_category_ids IS NULL OR c.dish_or_category_id = ANY($dish_or_category_ids))
  -- Dish attribute filtering (when dish attributes mentioned)
  AND ($dish_attribute_ids IS NULL OR c.dish_attributes && $dish_attribute_ids)
)
SELECT * FROM filtered_connections
ORDER BY dish_quality_score DESC;
```

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

1. **Entity Extraction**: dish_or_category: ["ramen"], dish_attributes: ["spicy"], restaurant_attributes: ["patio"]
2. **Dynamic Query Building**:
   ```sql
   -- Apply restaurant attribute filter first
   filtered_restaurants: restaurant_attributes && ARRAY[patio_id]
   -- Then dish_or_category filter
   filtered_connections: dish_or_category_id = ramen_id
   -- Finally dish attribute filter
   AND dish_attributes && ARRAY[spicy_id]
   ```
3. **Result**: Dual lists of spicy ramen at restaurants with patios

**Query: "best dishes at Franklin BBQ"**

1. **Entity Extraction**: restaurants: ["Franklin BBQ"]
2. **Dynamic Query Building**:
   ```sql
   -- Filter to specific restaurant only
   filtered_restaurants: entity_id = franklin_bbq_id
   -- Get all connections for this restaurant
   filtered_connections: (no additional dish/attribute filters)
   ```
3. **Result**: Single list of all dishes at Franklin BBQ

**Query: "best vegan Italian food"**

1. **Entity Extraction**: dish_or_category: ["Italian"], dish_attributes: ["vegan"]
2. **Dynamic Query Building**:
   ```sql
   -- No restaurant filtering needed
   filtered_restaurants: (all restaurants)
   -- Filter by category and attribute
   filtered_connections: dish_or_category_id = italian_id AND dish_attributes && ARRAY[vegan_id]
   ```
3. **Result**: Dual lists of vegan Italian dishes and top restaurants for vegan Italian food

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

### 4.6 Return Format Determination

#### Entity-Based Return Strategy

The system determines return format based on the **entity composition** of the query rather than predefined query types. This approach provides consistent, predictable responses while adapting to user intent naturally.

#### Return Format Logic

```typescript
function determineReturnFormat(entities): 'single_list' | 'dual_list' {
  // Single list: Only when specific restaurants mentioned with no dish/attribute context
  const hasOnlyRestaurants =
    entities.restaurants.length > 0 &&
    entities.dish_or_categories.length === 0 &&
    entities.dish_attributes.length === 0 &&
    entities.restaurant_attributes.length === 0;

  return hasOnlyRestaurants ? 'single_list' : 'dual_list';
}
```

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

### 4.7 Post-Processing Result Structure

_**Note**: This is only an example. The actual return format may vary._

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
        },
        {
          "dish_or_category_name": "Miso Ramen",
          "dish_or_category_id": "uuid",
          "connection_id": "uuid",
          "quality_score": 82.1,
          "activity_level": "active"
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

### 4.8 Caching Strategy

#### Cache Levels & Implementation

##### 1. Hot Query Cache (1 hour retention)

Purpose: Provide instant results for high-frequency and trending searches

Example: "best ramen downtown"

- First query: Process and cache results
- Same query within hour: Instant results
- Benefits: Handles viral/trending searches efficiently

##### 2. Recent Search Results (24 hour retention)

Purpose: Provide quick result sets for follow-up queries

Example: User searches "best tacos", comes back later

- Store complete result sets
- Include quality scores and evidence
- Update if significant new data

##### 3. Static Data (>7 days retention)

Purpose: Reduce database load for common data

Example: Restaurant info, entity metadata, common patterns

#### Cache Invalidation

- **Time-based expiration**: Different TTLs based on data volatility
- **Smart invalidation**: Update caches when entities receive new mentions
- **Trend-based warming**: Pre-populate cache for predicted popular queries

#### Redis Implementation

- **Connection pooling**: Establish Redis connection pool at startup
- **Serialization strategy**: Efficient JSON serialization for complex result sets
- **Memory management**: LRU eviction with appropriate memory limits

---

## 8. Technology Stack

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

## 9. Modular Monolith Architecture

### 9.1 Core Module Structure

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

### 9.2 Domain Responsibilities

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

### 9.3 Development and Design Principles

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

## 10. Implementation Roadmap

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

## 11. Appendices

### A. LLM Processing Guidelines

See `llm_content_processing.md` for detailed content processing rules

### B. Database Migrations

See migration files in `/prisma/migrations`
