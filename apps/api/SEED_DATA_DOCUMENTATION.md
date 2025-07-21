# Seed Data Documentation

## Overview

This documentation describes the structure and content of the seed data created by `prisma/seed.ts` for the Crave Search database schema validation.

## Data Volume

- **Restaurants**: 5 Austin food establishments
- **Dishes/Categories**: 14 entities (8 dishes, 6 categories)
- **Attributes**: 15 entities (8 dish attributes, 7 restaurant attributes)
- **Connections**: 5 restaurant-dish relationships
- **Mentions**: Sample Reddit mentions with realistic attribution

## Entity Types Created

### Restaurant Entities

All restaurants include Austin-specific data with real addresses and coordinates:

1. **Franklin Barbecue** (Quality Score: 9.2)

   - Address: 900 E 11th St, Austin, TX 78702
   - Cuisine: BBQ
   - Known for: Premium brisket and BBQ

2. **Ramen Tatsu-Ya** (Quality Score: 8.7)

   - Address: 1234 S Lamar Blvd, Austin, TX 78704
   - Cuisine: Japanese
   - Known for: Authentic ramen

3. **La Barbecue** (Quality Score: 8.5)

   - Address: 2401 E Cesar Chavez St, Austin, TX 78702
   - Cuisine: BBQ
   - Known for: Artisanal BBQ

4. **Torchy's Tacos** (Quality Score: 8.1)

   - Address: 1311 S 1st St, Austin, TX 78704
   - Cuisine: Mexican
   - Known for: Creative taco combinations

5. **Uchi** (Quality Score: 9.1)
   - Address: 801 S Lamar Blvd, Austin, TX 78704
   - Cuisine: Japanese
   - Known for: High-end sushi

### Dish/Category Entities

**Specific Dishes:**

- Brisket (with aliases: Texas Brisket, Smoked Brisket, BBQ Brisket)
- Pork Ribs (Baby Back Ribs, BBQ Ribs, Smoked Ribs)
- Tonkotsu Ramen (Tonkotsu, Pork Bone Ramen, Rich Ramen)
- Spicy Miso Ramen (Miso Ramen, Spicy Ramen)
- Trailer Park Taco (Trailer Park, Fried Chicken Taco)
- Democratic Taco (Democratic, BBQ Taco)
- Hama Chili (Hamachi, Yellowtail Sashimi)
- Machi Cure (Machi, Cured Fish)

**Categories:**

- BBQ (Barbecue, Barbeque, Smoked Meats)
- Ramen (Japanese Noodles, Noodle Soup)
- Tacos (Mexican Tacos, Austin Tacos)
- Sushi (Japanese Sushi, Raw Fish, Sashimi)
- Japanese (Japanese Cuisine, Japanese Food)
- Mexican (Mexican Cuisine, Tex-Mex)

### Attribute Entities

**Dish Attributes:**

- Spicy, Smoky, Tender, Crispy, Rich, Fresh, Vegan, Gluten-free

**Restaurant Attributes:**

- Casual, Long Wait, Food Truck, Outdoor Seating, Family-friendly, Date Night, Local Favorite

## Connection Data Patterns

The seed data creates realistic restaurant-dish connections with the following structure:

### Franklin Barbecue → Brisket

- **Quality Score**: 9.8
- **Categories**: BBQ
- **Attributes**: Smoky, Tender
- **Mentions**: 89 (1,247 upvotes)
- **Activity**: Trending
- **Sample Mention**: "Franklin's brisket is absolutely perfect - smoky bark with the most tender interior"

### Ramen Tatsu-Ya → Tonkotsu Ramen

- **Quality Score**: 8.9
- **Categories**: Ramen, Japanese
- **Attributes**: Rich, Tender
- **Mentions**: 67 (892 upvotes)
- **Activity**: Trending
- **Sample Mention**: "Tatsu-Ya's tonkotsu has the perfect rich broth and tender chashu"

### Torchy's Tacos → Trailer Park Taco

- **Quality Score**: 8.4
- **Categories**: Tacos, Mexican
- **Attributes**: Crispy, Spicy
- **Mentions**: 123 (1,456 upvotes)
- **Activity**: Trending

### Uchi → Hama Chili

- **Quality Score**: 9.3
- **Categories**: Sushi, Japanese
- **Attributes**: Fresh, Spicy
- **Mentions**: 45 (623 upvotes)
- **Activity**: Active

## Data Validation Features

The seed script includes comprehensive validation:

### Referential Integrity Checks

- Verifies all connections reference valid restaurant and dish entities
- Ensures entity type constraints are respected
- Validates foreign key relationships

### Data Quality Metrics

- Source diversity calculation based on mention patterns
- Recent mention counts (30% of total mentions)
- Activity level assignment based on mention frequency
- Geographic coordinate validation for Austin area

### Query Performance Setup

- Realistic quality scores for ranking algorithms
- Varied mention counts and upvote distributions
- Activity indicators for trending/active status
- Alias arrays for fuzzy search testing

## Usage Instructions

### Running the Seed Script

```bash
# Start database services
npm run docker:up

# Run migrations
npm run prisma:migrate

# Execute seed script
npm run prisma:seed
```

### Validation Queries

The seed script automatically runs validation queries to ensure:

- Zero orphaned connections
- Correct entity type constraints
- Valid relationship patterns
- Realistic data distributions

## Testing Scenarios Supported

1. **Geographic Queries**: Austin-area restaurants with real coordinates
2. **Category Filtering**: Hierarchical category relationships
3. **Attribute Matching**: Context-dependent attribute scoping
4. **Quality Ranking**: Realistic score distributions for ranking tests
5. **Fuzzy Search**: Alias arrays for name variation handling
6. **Activity Indicators**: Time-based trending/active status
7. **Reddit Attribution**: Realistic mention data with upvote patterns

## Data Reset Procedure

To reset and re-seed the database:

```bash
# Clear existing data
npm run prisma:reset

# Re-run migrations and seed
npm run prisma:migrate
npm run prisma:seed
```

## Notes

- All restaurant data uses real Austin establishments for realistic testing
- Quality scores follow realistic distributions (7.0+ for popular spots)
- Geographic data covers Austin metro area (30.2° N, -97.7° W region)
- Mention data includes realistic Reddit-style content and attribution
- Connection patterns mirror real Austin food scene relationships
