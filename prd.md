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
- **Venue-specific**: "best dishes at Franklin BBQ"
- **Dish-level broad queries**: "best dishes in Austin"
- **Category-specific queries**: "best sandwiches in Austin"

#### Location & Availability

##### Implemented through Google Maps/Places API integration:

- Availability: "open now", "late night", "open until midnight"
- Distance-based: "within 2 miles"
- Location-based: "near me", "downtown"
- Neighborhood-specific: "south austin"

### 1.2 Post-Launch Features ($7.99 Tier)

#### Advanced Query Types

- **Restaurant-level broad queries**: "best restaurant open now", "best patio spots"
- **Attribute-specific Queries**
  - With category-specific: "best vegan ramen", "happy hour sushi"
  - With dish-specific: "best vegan pad thai", "best brunch chicken and waffles", "best chicken fingers"
  - With venue-specific: "best dishes at vegan restaurants"
  - With broad: "best patio restaurants", "best brunch"

#### Entity Attribute System

##### Implementation Strategy:

- Entities have connections to attribute entities in the graph
- Attributes identified through background data collection
- Natural language processing for attribute requests in queries
- No separate filter UI - integrated into queries

##### Attribute Types:

Will likely include but not limited to:

- Cuisine Categories:

  - Regional: thai, japanese, chinese, mexican, italian, mediterranean, etc.
  - Dish Types: sandwich, noodles, tacos, ramen, sushi, pizza, burger, etc.
  - Preparation: grilled, fried, raw, smoked, etc.

- Dietary Preferences & Restrictions:

  - Restrictions: vegan, vegetarian, halal, kosher, etc.
  - Health-focused: keto, gluten-free, dairy-free, low-carb, etc.
  - Allergens: nut-free, shellfish-free, etc.

- Time & Occasion:

  - Meal Periods: breakfast, brunch, lunch, dinner, late night, etc.
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

##### Primary Function: Process Reddit/review content into structured data with graph entities, connections, and mentions

Processing Tasks:

- Entity extraction (restaurants, dishes, attributes)
- Relationship identification (serves, is_a, has_attribute)
  - **Create specific and general dish category entities** (e.g., "french dip", not just "sandwich")
  - Allow entities to emerge organically from community mentions
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
- Global quality score (pre-computed for restaurants and dishes)
- Entity metadata (when relevant)

##### 2. Connections Table

- Connection ID
- From Entity ID
- To Entity ID
- Relationship Type (serves, is_a, has_attribute)
- Raw metrics:
  - Mention count
  - Total upvotes
  - Source diversity count
  - Most recent mention timestamp
- Last updated timestamp

##### 3. Mentions Table

- Mention ID
- Connection ID
- Source (post/comment ID)
- Content excerpt
- Author
- Upvotes
- Timestamp

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

The system uses two complementary data collection strategies to build and maintain the knowledge graph: continuous background collection and on-demand query-driven collection. Both leverage the same LLM-powered entity extraction pipeline.

#### Continuous Background Collection

##### Purpose

Build and maintain a comprehensive knowledge graph by systematically processing community content.

##### Process Flow

1. **Entity Discovery & Selection**

   - Prioritize processing for:
     - Newest entities in the database
     - Entities with limited connection data
     - High-interest entities based on user queries
   - Schedule regular processing cycles (weekly during off-peak hours)

2. **Data Retrieval**

   - Call Reddit API with entity names as search terms
   - Fetch complete posts and comment threads
   - Optimize API usage through batching and caching
   - Store post/comment IDs for direct future access

3. **LLM Processing & Entity Extraction**

   - Process structured data through LLM
   - Extract entities, relationships, and supporting mentions
   - Analyze sentiment and context
   - Normalize entity references

4. **Database Updates**

   - Create new entities as discovered
   - Add new connections between entities
   - Store supporting mentions with metrics
   - Update raw connection metrics
   - Google Places enrichment for restaurant entities

5. **Quality Score Calculation**
   - Store aggregated metrics with connections
   - Calculate global quality scores for restaurants and dishes
   - Store updated scores in entity records

##### Optimization Strategies

- Batch similar API calls
- Cache intermediate processing results
- Store post IDs to enable direct access (bypassing search limitations)
- Prioritize processing based on entity activity and user interest

#### On-Demand Query-Driven Collection

##### Purpose

Provide immediate data enrichment when user queries return insufficient results.

##### Trigger Conditions

- Query results fall below minimum threshold
- High-interest queries with limited data
- User explicitly requests more information

##### Process Flow

1. **Query-Specific Search**

   - Search Reddit specifically for query terms and entities
   - Process complete discussion contexts
   - Limit scope to content directly relevant to query

2. **Rapid Processing**

   - Use same LLM pipeline as background collection
   - Focus on entities relevant to the query
   - Prioritize speed over comprehensiveness

3. **Immediate Integration**

   - Create discovered entities, connections, and mentions
   - Calculate preliminary quality scores
   - Make new data immediately available for search

4. **Result Enhancement**
   - Enhance query results with newly discovered data
   - Provide transparent indication of data freshness

##### Implementation Notes

- Maintain separate processing queues for on-demand vs. background collection
- No additional enrichment for non-query related entities
- Implement circuit breakers to prevent excessive API usage
- Cache query-specific processing results to avoid redundant calls

#### 2.3.3 Data Freshness & Growth

- **Continuous Enrichment:**

  - Each cycle adds new mentions to existing connections
  - Strengthens entity relationships
  - Updates global quality scores
  - Expands the entity network

- **Progressive Building:**

  - Knowledge graph grows naturally based on community discussions
  - Entity relationships become richer and more nuanced over time
  - Quality scores become more reliable with additional data
  - Graph adapts to evolving food trends and new establishments

- **Adaptive Prioritization:**

  - Processing prioritizes entities with user interest
  - Resources allocated based on query patterns
  - Background processing fills gaps identified during user queries
  - Focus on quality over quantity of data

### 2.4 Entity Name Variation Handling

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

### 4.1 Global Quality Score Architecture

_Important: This system relies on pre-computed global quality scores for ranking with attributes serving as filters._

##### Global Quality Score Calculation

For Restaurants:

- **Primary Component (80%)**:

  - Top 3-5 dish connections by strength
  - Direct connections to food categories (treated similarly to top dishes)
  - This captures the standout offerings that define a restaurant

- **Secondary Component (20%)**:
  - Holistic assessment of the restaurant's entire digital menu
  - Breadth of positively mentioned dishes beyond the top ones
  - Average quality across all mentioned dishes
  - Consistency across menu items
  - This rewards restaurants with overall menu strength beyond a few star items

For Dishes:

- **Primary Component (85-90%)**:

  - Combined strength from all mention types:
  - Dish-restaurant mentions ("their pad thai is amazing")
  - Dish-category mentions ("best pad thai in town")
  - Dish-attribute mentions (any that occur)
  - This captures all relevant praise regardless of context

- **Secondary Component (10-15%)**:
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

### 4.2 Query-Time Ranking

##### Adapts based on query specificity:

1. Dish-Specific Queries

   - Filter: Find dishes connected to the specified category
   - Rank: By dish global quality score
   - Example: "best ramen" returns highest-quality ramen dishes

2. Venue-Specific Queries

   - Filter: Find dishes connected to the specified restaurant
   - Rank: By dish global quality score
   - Example: "best dishes at Franklin BBQ" returns their highest-quality offerings

3. Attribute Queries

   - Filter: Find entities connected to the specified attribute
   - Rank: By entity global quality score
   - Example: "best patio restaurants" returns highest-quality restaurants with patios

4. Compound Queries

   - Filter: Find entities matching all specified attributes
   - Rank: By entity global quality score
   - Example: "best vegan ramen" returns highest-quality ramen dishes that are vegan

5. Broad Queries
   - Filter: Find all dish or restaurant entities
   - Rank: By entity global quality score
   - Example: "best dishes" returns highest-quality dishes

### 4.3 Runtime Filters

Applied during query processing:

- Location constraints (using stored coordinates)
- Availability checks (using stored hours data)
- Distance calculations
- Time-sensitive adjustments

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
