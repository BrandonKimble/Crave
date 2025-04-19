# Crave - Local Food Discovery App - Product Requirements Document

## Overview

This app enables users to make confident dining decisions by surfacing evidence-based dish and restaurant recommendations from community knowledge. It transforms scattered social proof into actionable insights about specific dishes and dining experiences.

## Core System Flow

#### Query Processing Flow:

1. User Query
2. Cache Check
   - If cached: Return cached results
   - If not cached: Continue to step 3
3. LLM Analysis
4. Entity/Intent Extraction
5. Query Builder
6. Graph-Based Database Query
7. Database Returns Results Ordered by Global Quality Scores
8. Cache New Results
9. Return Results to User

#### Data Collection Flow:

1. Collect Reddit/Review Data
2. LLM Analysis
3. Entity/Relationship Extraction
4. Graph Database Storage & Metric Aggregation
5. Global Quality Score Computation

## 1. Query Processing & Understanding

### 1.1 Launch Features (99¢ Tier)

Our search functionality focuses on core value-driving features at launch, with additional capabilities implemented post-launch once our database has matured.

#### Core Query Types

##### These queries represent our core value proposition, offering reliable recommendations backed by community evidence.

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

### 1.2 Post-Launch Features ($7.99 Tier)

#### Advanced Query Types

- **Restaurant-level broad queries**: "best restaurant open now", "best patio spots"
- **Attribute-specific Queries**
  - With category-specific: "best vegan ramen", "happy hour sushi"
  - With dish-specific: "best vegan pad thai", "best brunch chicken and waffles", "best chicken fingers"
  - With venue-specific: "best dishes at vegan restaurants"
  - With broad: "best patio restaurants", "best brunch"

#### Attribute-Entity System

##### Implementation Strategy:

- Entities have connections to attribute entities in the graph
- Attributes identified through background data collection
- Natural language processing for attribute requests in queries
- No separate filter UI - integrated into queries

##### Attribute Types:

Will likely include but not limited to:

- Dish Categories:

  - Regional: thai, japanese, chinese, mexican, italian, mediterranean, etc.
  - Dish Types: sandwich, noodles, tacos, ramen, sushi, pizza, burger, dessert, etc.
  - Preparation: grilled, fried, raw, smoked, etc.

- Dietary Preferences & Restrictions:

  - Restrictions: vegan, vegetarian, halal, kosher, etc.
  - Health-focused: keto, gluten-free, dairy-free, low-carb, etc.
  - Allergens: nut-free, shellfish-free, etc.

- Time & Occasion:

  - Meal Periods: breakfast, brunch, lunch, dinner, late night, sunday brunch, dessert, etc.
  - Special Times: happy hour, daily specials, weekend specials, etc.
  - Events: date night, business lunch, family dining, etc.

- Atmosphere & Ambiance:

  - Seating: patio, rooftop, outdoor, indoor, bar, etc.
  - Environment: quiet, romantic, casual, upscale, family-friendly, etc.
  - Features: view, fireplace, live music, sports viewing, etc.
  - Group Size: large groups, intimate, communal seating, etc.

- Service & Style:

  - Format: counter service, full service, fast casual, fine dining, etc.
  - Options: BYOB, reservations accepted, walk-ins only, etc.
  - Specialties: tasting menu, chef's table, buffet, etc.

- Experience Attributes:
  - Value: great value, budget-friendly, worth the splurge, generous portions, etc.
  - Service: great service, attentive service, quick service, etc.
  - Convenience: easy parking, delivery available, takeout friendly, etc.

_Note: All post-launch features require a mature database with substantial connection data._

### 1.3 Search Limitations

##### Unsupported Query Types:

- Dish Modifications: "ramen with no egg"
- Specific Price Points: "under $15"
- Ingredient Exclusions: "peanut free pad thai"

### 1.4 Natural Language Processing via LLM Integration

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

## 2. Data Architecture

### 2.1 Database Structure

#### Graph-Based Model

##### 1. Entities Table

- entity id
- name (canonical)
- type (restaurant, dish, category, attribute)
- aliases (known variations)
- basic info from google places api (for restaurants: location, hours, etc.)
- global quality score (pre-computed for restaurants and dishes)
- entity metadata (when relevant)
- last updated timestamp
- created at timestamp

##### 2. Connections Table

- connection id
- from entity id
- to entity id
- relationship type (serves, is_a, has_attribute)
- raw metrics:
  - mention count
  - total upvotes
  - source diversity (thread count)
  - avg of age of 5 most recent mentions
  - top 5-10 mentions
    - mention id
    - content
    - upvotes
- last updated timestamp
- created at timestamp

##### 3. Mentions Table

- mention id
- connection id
- source (post/comment id)
- content excerpt
- author
- upvotes
- created at timestamp

_Note: Global quality scores are pre-computed during data processing and used as the primary ranking factor_

### 2.2 Natural Category Emergence

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

To aviod duplicate entities and ensure accurate metrics and search functionality, the system employs a multi-phase approach to handle name variations of all entity types: restaurants, dishes, attributes, and dish categories:

#### 2.4.2 Resolution Process Flow

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

##### 2.4.3 Query Processing Application

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

## 3. External Integration

_Note: Consider additional third-party review data sources (Google, Yelp, etc.)_

### 3.1 Reddit API

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

### 3.2 Google Places API

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
- Example: "best sandwiches in Austin" returns highest-quality sandwiche entities

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

_Note: "entities" refers to dish-restaurant pairs or a restaurants_

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

## 5. Technology Stack

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

## 6. Implementation Challenges

### 6.1 Entity Resolution

Challenge: Identifying when different mentions refer to the same entity
Example: "Ramen Tatsu-Ya" vs "Tatsuya Ramen" vs "Tatsu Ya"
Proposed Solution:

- Multi-layered entity resolution system
- Fuzzy matching for name variations
- Contextual clues for disambiguation
- Progressive refinement of entity mapping
- Canonical entity structure with alias storage

### 6.2 Graph Traversal Optimization

Challenge: Efficient filtering and ranking in the graph model
Example: "best vegan ramen near downtown open now"
Strategy:

- Optimize SQL for graph traversal patterns
- Index entity global quality scores
- Pre-compute common attribute relationships
- Cache traversal results
- Use efficient filtering steps before ranking

### 6.3 Global Quality Score Computation

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
