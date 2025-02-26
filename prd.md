# Local Food Discovery App - Product Requirements Document

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
6. Database Query
7. Database Returns Pre-computed Rankings
8. Cache New Results
9. Return Results to User

#### Data Collection Flow:

1. Collect Reddit/Review Data
2. LLM Analysis
3. Entity/Relationship Extraction
4. Database Storage
5. Score Computation

## 1. Query Processing & Understanding

### 1.1 Launch Features (99¢ Tier)

Our search functionality focuses on core value-driving features at launch, with additional capabilities implemented post-launch once our database has matured.

#### Core Query Types

##### These queries represent our core value proposition, offering reliable recommendations backed by community evidence.

_Note: All queries are processed through entity matching and pre-computed rankings, without need for specialized search engines._

- Dish-specific: "best ramen", "best chicken caesar wrap"
- Venue-specific: "best dishes at Franklin BBQ"
- Dish-level broad queries: "best dishes in Austin"

#### Location & Availability

##### Implemented through Google Maps/Places API integration:

- Availability: "open now", "late night", "open until midnight"
- Distance-based: "within 2 miles"
- Location-based: "near me", "downtown"
- Neighborhood-specific: "south austin"

### 1.2 Post-Launch Features ($7.99 Tier)

#### Advanced Query Types

- Restaurant-level broad queries: "best restaurant open now", "best patio spots"
- Tag-Based Queries
  - With dish-specific: "best vegan ramen", "happy hour sushi"
  - With venue-specific: "best dishes at vegan restaurants"
  - With broad: "best patio restaurants"

#### Restaurant Tag System

##### Implementation Strategy:

- Tags attached to restaurant records only
- Tags identified through background data collection
- Natural language processing for tag requests in queries
- No separate filter UI - integrated into queries

##### Tag Categories:

- Dish Categories: thai, sandwich, noodles, asian, etc.
- Dietary: vegan, vegetarian, halal, keto
- Time-based: happy hour, brunch
- Atmosphere: patio, quiet, good for groups
- Service-type: sports bar, BYOB

_Note: All post-launch features require a mature database with substantial dish-level data._

### 1.3 Search Limitations

##### Unsupported Query Types:

- Dish Modifications: "ramen with no egg"
- Specific Price Points: "under $15"
- Ingredient Exclusions: "dairy free pad thai"
- Portion Specifications: "large portions"
- Custom Combinations: "extra crispy"

### 1.4 Natural Language Processing via LLM Integration

#### Query Understanding & Processing

##### Primary Function: Convert natural language queries to Primary Function: Convert natural language queries to structured search parameters matching our pre-computed entities.

_Important: This process does not require specialized search engines or text analysis - it simply maps queries to existing entities and filters._

Processing Tasks:

- Entity extraction (restaurants, dishes, experience and category tags)
  - Extract search intent and type (dish-specific, venue-specific, broad)
- Term normalization and categorization
  - Handle entity variations/expansions
  - Standardize entity references
- Detect and validate tag requests
- Map generic terms to specific tags
  - Create new categories if needed
- Identify location and availability requirements
- Output standardized format for query builder and filtering

#### Content Processing & Analysis

##### Primary Function: Process Reddit/review content into structured data

Processing Tasks:

- Entity extraction (restaurants, dishes, experience and category tags)
- Sentiment analysis (positive/negative classification)
  - Discard negative sentiment content
- Relationship mapping between entities
  - Link dishes to restaurants in nested comments
  - Process implicit entity connections
  - Maintain comment thread context
- Term normalization and categorization
  - Handle entity variations/expansions
  - Standardize entity references
- Output structured data for database insertion

## 2. Data Architecture

### 2.1 Database Structure

#### Core Tables & Relationships

##### 1. Restaurants

- Basic info (name, location, hours)
- Experience tags
- Digital menu
- Aggregate metrics and stats

##### 2. Dishes

- Name and variations
- Restaurant association
- Category tags
- Dietary tags (maybe)
- Mention metrics and statistics
- Base score

##### 3. Mentions

- Source (post/comment ID)
- Content excerpt
- Thread context/relationships
- Sentiment indicator
- Associated entities (dish/restaurant)
- Upvotes
- Timestamp

_Note: Query-dependent rankings like dish-specific rankings may have to calculated at runtime to be cost effective_

### 2.2 Data Collection

The system uses two distinct collection processes: initial query-driven collection for immediate user needs and background collection for comprehensive data enrichment. Both processes leverage a cheap LLM for entity extraction and relationship analysis.

#### Initial Data Collection (Query-Driven)

Triggered when query results fall below threshold:

##### 1. Query-Specific Search:

- Search Reddit posts and comments for query terms
- Collect full context:
  - Post content
  - All comment threads
  - Parent-child relationships
  - Discussion context

##### 2. Entity Processing:

When new entities (restaurants, dishes) are discovered:

- Create immediate database record with 'pending_enrichment' status
- Include minimal required data for search functionality
- Add basic Google Places data if immediately available

##### 3. AI-Powered Analysis:

- Send structured data to LLM:
  - Combined posts and comments
  - Thread hierarchies
  - Contextual relationships/semantic connections
- LLM extracts:
  - Entities (restaurants, dishes, experience and category tags)
  - Sentiment analysis
  - Entity relationships

##### 4. Scope:

- Process only data from query-related searches
- Store all entities and relationships identified by LLM
- No additional API calls for discovered entities
- Focus on quick result generation
- Mark new entities for priority enrichment in next update cycle

#### Background Data Collection and Freshness (Database-Driven)

##### 1. Entity Processing Cycle

For each tracked entity (restaurant, dish, experience and category tags):

- Prioritize entities marked as 'pending_enrichment'
- Call Reddit search API for posts and comments
- Collect complete discussion contexts
- Send structured data to LLM for analysis
- Update existing entity metrics
- Add newly discovered entities
- Assign standardized experience and category tags

##### 2. Entity Discovery Flow

When new entities are found:

- Immediate database creation with minimal data
- Marked as 'pending_enrichment'
- Prioritized in next update cycle
- Status updates as processing completes
- Regular refresh cycle once 'active'

##### 3. Relationship Processing

- LLM analyzes discussion context to identify:
  - Restaurant-dish associations
  - Experience and category tag assignments
  - Implicit entity connections
  - Sentiment patterns
- System updates:
  - Entity metrics
  - Associations
  - Tags

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

  - Update existing entity metrics
  - Add newly discovered entities
  - Refresh entity relationships
  - Update experience and category tags

- Progressive Building:
  - New entities become tracked entities
  - Each cycle builds on previous data
  - Metrics become more comprehensive
  - Relationships grow more detailed

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
- Include ranking context
- Update if significant new data

##### 3. Static Data (7 day retention)

Purpose: Reduce database load for common data

Example: Restaurant basic info, historical trends

- Location/hours data
- Historical rankings
- Tag associations

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

- Limited review access (5 most recent only)
- Focus on core business data
- Consider third-party review data sources
- Optimize API call patterns

## 4. Ranking System

### 4.1 Scoring Architecture

_Important: This system relies entirely on pre-computed scores and simple database queries. No specialized search engines or real-time text analysis are required._

##### Scoring System

- Scores computed during data collection/processing
- Stored with dish/restaurant records
- Updated periodically in background jobs
- No real-time score computation needed -- Query time only involves:
  - Entity matching
  - Score retrieval
  - Basic filtering

##### Database Ranking Operations

- Fast retrieval of pre-computed scores
- Simple ranking based on stored scores
- Efficient filtering by extracted entities
- Minimal computation at query time

#### Base Score Components

##### 1. Dish Scoring

Calculated from Mention frequency, upvotes, Source diversity, and Time relevance (minimal impact)

- Updated with new mentions
- Independent of other dishes
- Reflects community sentiment

##### 2. Restaurant Scoring

Derived from top dish scores

- Updated automatically with dish changes
- Independent of other restaurants

### 4.2 Query-Time Ranking

##### Adapts based on query specificity:

1. Broad Queries

   - Returns: Dishes/Restaurants ranked via base scores
   - Filtered by: Any specified tags
   - Example: "best restaurants" "best food"

2. Category Queries

   - Returns: Dishes with matching tags
   - Ranked by: Base score
   - Example: "best sandwiches"

3. Specific Dish Queries

   - Returns: Matching dishes across restaurants
   - Ranked by: Base score
   - Example: "best pad thai"

4. Venue Queries
   - Returns: Restaurant's dishes
   - Uses: Restaurant menu rankings
   - Example: "what to order at [restaurant]"

### 4.3 Runtime Modifications

Filters applied during query processing:

- Tag requirements
- Location constraints
- Availability checks
- Time sensitivity

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
- Google or Deepseek LLM API for content analysis

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

### 6.1 Generic Term/Dish Category Handling

Challenge: Balancing specific vs broad dishes
Example: "best salad" vs "best caesar salad"
Proposed Solution:

- Implement dish category system
- Maintain hierarchy of specificity
- Store category relationships
- Compute specific rankings at query time
  Open Questions:
- How to classify a Reuben as a sandwich
- Reliable categorization method
- Possibility of a tagging system
- Performance implications
- Hierarchy maintenance

### 6.2 Thread Context Processing

Challenge: Maintaining context in nested comments
Example: Parent asks about tacos, sub-comment recommends specific dish
Strategy:

- Track thread relationships
- Store context indicators
- Link related mentions
- Process full conversation chains

### 6.3 Ranking Optimization

Challenge: Balance pre-computation vs runtime
Considerations:

- Storage vs computation trade-offs
- Query performance requirements
- Data freshness needs
- Approach:
  - Pre-compute stable rankings
  - Runtime calculation for dynamic factors
  - Caching for common patterns
