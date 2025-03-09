# Crave - Local Food Discovery App - Product Requirements Document

## Overview

This app enables users to make confident dining decisions by surfacing evidence-based dish and restaurant recommendations from community knowledge. It transforms scattered social proof into actionable insights about specific dishes and dining experiences using a flexible, relationship-based approach.

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
7. Database Returns Connection-Strength Based Rankings
8. Cache New Results
9. Return Results to User

#### Data Collection Flow:

1. Collect Reddit/Review Data
2. LLM Analysis
3. Entity/Relationship Extraction
4. Connection-Based Graph Storage
5. Connection Strength Computation

## 1. Query Processing & Understanding

### 1.1 Launch Features (99¢ Tier)

Our search functionality focuses on core value-driving features at launch, with additional capabilities implemented post-launch once our database has matured.

#### Core Query Types

##### These queries represent our core value proposition, offering reliable recommendations backed by community evidence.

_Note: All queries are processed through entity matching and graph traversal, without need for specialized search engines._

- Dish-specific: "best ramen", "best chicken caesar wrap"
- Venue-specific: "best dishes at Franklin BBQ"
- Dish-level broad queries: "best dishes in Austin"
- Category-specific queries: "best sandwiches in Austin"

#### Location & Availability

##### Implemented through Google Maps/Places API integration:

- Availability: "open now", "late night", "open until midnight"
- Distance-based: "within 2 miles"
- Location-based: "near me", "downtown"
- Neighborhood-specific: "south austin"

### 1.2 Post-Launch Features ($7.99 Tier)

#### Advanced Query Types

- Restaurant-level broad queries: "best restaurant open now", "best patio spots"
- Attribute-specific queries
  - With category-specific: "best vegan ramen", "happy hour sushi"
  - With dish-specific: "best vegan pad thai", "best brunch chicken and waffles", best chicken fingers
  - With venue-specific: "best dishes at vegan restaurants"
  - With broad: "best patio restaurants", "best brunch"

#### Attribute Entity System

##### Implementation Strategy:

- Entities can have connections to attribute entities
- Attributes identified through background data collection
- Natural language processing for attribute requests in queries
- No separate filter UI - integrated into queries

##### Attribute Types:

- Dish Categories: thai, sandwich, noodles, asian, tacos, ramen, sushi, etc.
- Dietary: vegan, vegetarian, halal, keto
- Time-based: happy hour, brunch
- Atmosphere: patio, quiet, good for groups
- Service-type: sports bar, BYOB

_Note: All post-launch features require a mature database with substantial connection data._

### 1.3 Search Limitations

##### Unsupported Query Types:

- Dish Modifications: "ramen with no egg"
- Specific Price Points: "under $15"
- Ingredient Exclusions: "dairy free pad thai"
- Portion Specifications: "large portions"
- Custom Combinations: "extra crispy"

### 1.4 Natural Language Processing via LLM Integration

#### Query Understanding & Processing

##### Primary Function: Convert natural language queries to structured graph traversal parameters

_Important: This process maps queries to existing entities and relationships for traversal._

Processing Tasks:

- Entity extraction (restaurants, dishes, attributes)
  - Extract search intent and type (dish-specific, venue-specific, broad)
- Term normalization and entity resolution
  - Handle entity variations/expansions
  - Standardize entity references
- Detect and validate attribute requests
- Map generic terms to specific entities
- Identify location and availability requirements
- Output standardized format for dynamic graph traversal and filtering

#### Content Processing & Analysis

##### Primary Function: Process Reddit/review content into structured data with graph entities and connections

Processing Tasks:

- Entity extraction (restaurants, dishes, attributes)
- Relationship identification (serves, is_a, has_attribute)
- Infer likely attributes and connection types from content
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

- Entity ID
- Name (canonical)
- Type (restaurant, dish, category, attribute)
- Aliases (known variations)
- Basic info (for restaurants: location, hours, etc.)
- Entity metadata (when relevant)

##### 2. Connections Table

- Connection ID
- From Entity ID
- To Entity ID
- Relationship Type (serves, is_a, has_attribute)
- Connection Strength (computed score)
- Mention metrics (count, upvotes, sources, recency)
- Last updated timestamp

##### 3. Mentions Table

- Mention ID
- Connection ID
- Source (post/comment ID)
- Content excerpt
- Author
- Upvotes
- Timestamp

_Note: Connection strengths are pre-computed during data processing but can be augmented with runtime factors_

### 2.2 Data Collection

The system uses two distinct collection processes:  background collection for comprehensive data enrichment and initial query-driven collection for immediate user needs. Both processes leverage a cheap LLM for entity and relationship extraction.


#### Background Data Collection and Freshness (Database-Driven)

##### 1. Entity Processing Cycle

For each tracked entity:

- Prioritize the newest entities
- Call Reddit search API for posts and comments
- Collect complete discussion contexts
- Send structured data to LLM for analysis
- Create new entities and connections
- Strengthen existing connections with new mentions and update metrics
- Update connection strength scores

##### 2. Entity Discovery Flow

When new entities or connections are found:

- Immediate creation in database
- Background job for Google Places data enrichment (for restaurants)
- Included in regular refresh cycle

##### 3. Relationship Processing

- LLM analyzes discussion context to identify:
  - Entity relationships (serves, is_a, has_attribute)
  - Supporting mention evidence
  - Context and sentiment
- System updates:
  - Connection strengths
  - Entity metadata
  - Mention aggregation

##### 4. Implementation Strategy

- Weekly processing during off-peak hours
- Update basic info via Google Places API
- Store post/comment IDs for historical access (bypasses Reddit API limitations)
- Optimization techniques:
  - Batch similar API calls
  - Prioritize high-activity entities
  - Cache intermediate results

##### 5. Key Behaviors

- Continuous Enrichment:

  - Strengthen existing connections
  - Create new entity relationships
  - Add supporting mentions and update metrics
  - Update connection strengths

- Progressive Building:
  - New entities are incorporated into the graph
  - Each cycle strengthens the connection network
  - Connection strengths become more reliable
  - The graph naturally evolves to match community patterns

#### Initial Data Collection (Query-Driven)

Triggered when query results fall below threshold:

##### 1. Query-Specific Search:

- Only search Reddit posts and comments for query terms
- Collect full context:
  - Post content
  - All comment threads
  - Parent-child relationships
  - Discussion context

##### 2. Entity Processing:

When new entities are discovered:

- Create entities in Entities table
- Create appropriate connections in Connections table
- Add mention data that supports these connections
- Include basic Google Places data if immediately available

##### 3. AI-Powered Analysis:

- Send structured data to LLM:
  - Combined posts and comments
  - Thread hierarchies
  - Contextual and semantic relationships
- LLM extracts:
  - Entities (restaurants, dishes, attributes)
  - Relationships between entities
  - Sentiment analysis
  - Supporting mention text

##### 4. Scope:

- Process only data from query-related searches
- Store all entities, connections, and mentions identified by LLM
- No additional API calls for discovered entities
- Focus on quick result generation

### 2.3 Entity Name Variation Handling

To ensure accurate metrics and search functionality:

1. **Entity Resolution During Ingestion**:
   - LLM identifies potential variations of the same entity
   - System considers candidate matches for resolution

2. **Canonical Entity Structure**:
   - Each entity has a canonical name in the Entities table
   - Known variations stored as aliases
   - All mentions map to the same entity regardless of reference style

3. **Fuzzy Matching**:
   - Implement similarity algorithms for detecting spelling variations
   - Apply during both data ingestion and query processing

4. **Contextual Disambiguation**:
   - Use location, related entities, and other contextual clues
   - Progressively refine entity resolution as more evidence emerges

### 2.4 Caching Strategy

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
- Include connection strengths and evidence
- Update if significant new data

##### 3. Static Data (7 day retention)

Purpose: Reduce database load for common data

Example: Restaurant basic info, historical trends

- Location/hours data
- Entity metadata
- Common connection patterns

## 3. External Integration

### 3.1 Reddit API Strategy

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

### 3.2 Google Places Integration

##### Primary Functions:

- Basic restaurant information
- Location data/geocoding
- Operating hours
- Order/reservation links

##### Implementation Strategy:

- Store location and hours data with restaurant entities
- Update periodically in background jobs
- Optimize API calls through batching
- Consider third-party review data sources (Google, Yelp, etc.)

## 4. Ranking System

### 4.1 Connection Strength Architecture

_Important: This system relies on pre-computed connection strengths with simple graph traversals at query time._

##### Strength Calculation

- Core components:
  - Mention frequency (number of distinct mentions)
  - Upvote weighting (with logarithmic scaling)
  - Source diversity (unique threads/posts)
  - Time recency (more recent mentions worth more)

- Pre-computed during data processing:
  - Stored with each connection
  - Updated periodically in background jobs
  - Incrementally adjusted with new mentions

##### Evidence Storage

- Each connection stores its supporting mentions
- Top quotes by upvotes are easily retrievable
- Source attribution maintained
- Mention metrics aggregated for transparency

### 4.2 Query-Time Ranking

##### Adapts based on query specificity:

1. Dish-Specific Queries

   - Traverses graph from dish entity
   - Finds connections to restaurant entities
   - Ranks by connection strength
   - Example: "best chicken fingers"

2. Venue-Specific Queries

   - Traverses graph from restaurant entity
   - Finds dish connections
   - Ranks by connection strength
   - Example: "best dishes at Franklin BBQ"

3. Attribute Queries

   - Traverses graph from attribute entity
   - Finds connections to restaurants or dishes
   - Ranks by connection strength
   - Example: "best patio restaurants", "best tacos"

4. Compound Queries
   - Finds paths requiring multiple connections
   - Ranks by combined strength across connections
   - Example: "best vegan ramen"

5. Broad Queries
   - Finds connections to restaurants or dishes
   
   - Ranks by connection strength
   - Example: "best tacos"

### 4.3 Runtime Modifications

Filters applied during query processing:

- Location constraints (using stored coordinates)
- Availability checks (using stored hours data)
- Distance calculations
- Time-sensitive adjustments

### 5. Technology Stack

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

Challenge: Efficient path finding for complex queries
Example: "best vegan ramen near downtown open now"
Strategy:

- Optimize SQL for graph traversal patterns
- Index connection properties strategically 
- Pre-compute common traversal patterns
- Cache traversal results
- Use query planning optimization

### 6.3 Connection Strength Calculation

Challenge: Balance between pre-computation and freshness
Considerations:

- Storage vs computation trade-offs
- Update frequency requirements
- Data freshness needs
- Approach:
  - Hybrid model with periodic updates
  - Store aggregated metrics with connections
  - Background jobs for strength recalculation
  - Incremental updates for new mentions