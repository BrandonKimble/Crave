# Crave App: Comprehensive System Design & Implementation Guide

## Section 1: LLM Context & Processing Guidelines

_These sections function together as a logical processing flow for the LLM: first establishing data structures, then classification frameworks and processing rules, then providing step-by-step extraction and processing instructions._

### 1.1 Core Comment & Post Processing Criteria

#### Post Extraction Control

**CRITICAL**: Check the `extract_from_post` flag in each input:
- If `extract_from_post: true` → Extract entities from both the post content AND comments
- If `extract_from_post: false` → Extract entities ONLY from comments, NOT from the post content
- The post is always provided for context to understand references in comments

#### Entity Inheritance Principle

Comments may inherit entities (restaurants, dishes, attributes) from parent comment/post when connection is unambiguous. Short affirmations ("+1", "seconded", "this", "agreed", etc.) automatically inherit all entities and sentiment from the parent comment.

#### Core Processing Criteria - Process ONLY When ALL Are Met

1. **Sentiment Criterion:** Content expresses or affirms positive sentiment about food/restaurant quality from first-hand experience (having personally visited, eaten, or tasted)
2. **Entity Criterion:** Content can be linked to:
   - Restaurant entity AND EITHER:
     - Dish/category entity, OR
     - Restaurant attribute, OR
     - Clear general praise for the restaurant
3. **Relevance Criterion:** Content appears to describe current offerings

#### Skip Conditions (Overrides All Other Rules)

- Content fails to meet ANY of the core requirements above
- Focused exclusively on non-food/restaurant aspects  
- Promotional or marketing content
- Any request for recommendations, suggestions, or opinions from others
- Secondhand information or hearsay

#### General Praise Identification

**General Praise (general_praise: true):**
Set to true when mention contains any holistic restaurant praise, regardless of whether it also contains specific praise.

Examples:

- "This place is amazing" → true
- "Franklin BBQ is amazing and their brisket is great" → true
- "Their brisket is great" → false

#### Context and Entity Inference Note

**For posts/comments that don't contain directly processable information:** Even if content doesn't meet the core processing criteria, it can still provide valuable context for entity inheritance, restaurant identification, or setting up context for subsequent comments in the thread.

### 1.2 Entity Types & Classification Rules

#### Entity Types

- **restaurant**: Physical dining establishments
- **dish_or_category**: Food items that can serve as both specific menu items and general categories
- **dish_attribute**: Descriptive terms that apply to dishes (connection-scoped)
- **restaurant_attribute**: Descriptive terms that apply to restaurants (restaurant-scoped)

#### Context-Driven Attribute Classification

**ONLY dish types can be categories:**

- Nouns representing food items: pizza, taco, burger, sandwich, soup, salad, pasta, ramen, sushi, noodles, dessert

**Primarily dish-scoped attributes:**

- **Preparation methods**: grilled, fried, crispy, raw, smoked, house-made, steamed, baked, roasted
- **Texture/consistency**: tender, juicy, flaky, smooth, chunky, crisp, creamy
- **Flavor profiles**: sweet, savory, tangy, rich, mild, hot, umami, spicy, tart, bitter
- **Portion context**: generous portions, shareable, bite-sized

**Primarily restaurant-scoped attributes:**

- **Physical features**: patio, rooftop, outdoor, bar seating, view, fireplace, drive-through
- **Ambiance**: romantic, quiet, lively, cozy, intimate, upscale, casual
- **Service model**: counter service, full service, fast casual, fine dining, quick service
- **Operational**: BYOB, reservations required, walk-ins only, takeout friendly, delivery available
- **Group dynamics**: family-friendly, date night spot, business lunch venue, large groups, communal seating

**Context-dependent attributes (LLM determines scope based on usage):**

- **Cuisine**: Italian, Mexican, Thai, Chinese, Japanese, Mediterranean, Indian, French, Korean, Vietnamese
- **Dietary**: vegan, vegetarian, gluten-free, halal, kosher, keto, low-carb, dairy-free, nut-free, shellfish-free
- **Value**: expensive, cheap, budget-friendly, worth-it, great value, affordable
- **Quality descriptors**: authentic, fresh, best, amazing, incredible, worth-the-splurge
- **Meal timing**: breakfast, lunch, dinner, brunch, late night, sunday brunch
- **Occasion**: comfort food, celebration, special occasion, happy hour, daily specials, weekend specials
- **Service quality**: friendly, attentive, quick service, great service

**Scope Determination Principle**: The same attribute concept (e.g., "Italian") exists as separate entities based on context - "Italian pasta" creates a dish_attribute entity, while "Italian restaurant" creates a restaurant_attribute entity.

#### Selective vs Descriptive Classification

**Selective attributes:** Help filter or categorize options

- "great vegan choices" → vegan is selective
- "best Italian restaurants" → Italian is selective
- "good breakfast spots" → breakfast is selective

**Descriptive attributes:** Characterize or describe specific items

- "this pasta is very vegan" → vegan is descriptive
- "their sandwich is so Italian" → Italian is descriptive
- "feels breakfast-y" → breakfast is descriptive

**Principle:** Is it about what type of thing it is (selective) or how that thing is (descriptive)?

### 1.3 Compound Term Processing Rules (Food Terms Only)

_Apply these rules only to food-related compound terms, not restaurant names or other entities._

#### Attribute Exclusion Principle

Before applying compound term processing to food mentions, exclude any terms that are preparation methods, cooking styles, dietary restrictions, cuisines meal periods, or serving formats. Apply compound term processing only to remaining food substance terms.

#### Complete Preservation Rule

Always store the complete compound food term as primary category in singular form, **excluding any terms identified as attributes**.

#### Hierarchical Decomposition Rule

Create all meaningful food noun combinations as additional categories:

- Include significant ingredients as standalone categories
- Convert all category terms to singular form
- Include parent categories when term represents specific subtype
- **Exclude any terms identified as attributes from decomposition**

Examples:

- "spicy ramen" → Extract "spicy" as attribute, process only "ramen" for compound terms
- "breakfast burrito" → Extract "breakfast" as attribute, process only "burrito" for compound terms
- "house-made carnitas taco" → Extract "house-made" as preparation attribute, process "carnitas taco" for compound terms

#### Inference Rules

- Infer parent categories for specific dish subtypes even when not explicitly mentioned
- Derive broader cuisine attributes from specific ones
- Apply known culinary relationships

### 1.4 Menu Item Identification Rules

When setting the is_menu_item flag on restaurant→dish connections (applied to clean food terms after attribute extraction):

#### Specificity

- More specific dishes are likely menu items
- Example: "brisket" at Franklin BBQ (is_menu_item = true)
- Example: "BBQ" (is_menu_item = false)

#### Plurality

- Singular forms often indicate menu items
- Example: "the burger" (is_menu_item = true)
- Example: "burgers" (is_menu_item = false)

#### Modifiers

- Specific preparation details suggest menu items
- Example: "house-made carnitas taco" (is_menu_item = true)
- Example: "seafood" (is_menu_item = false)

#### Context

- "Try their X" typically indicates menu item
- "Known for X" typically indicates menu item
- "Type of X" typically indicates category
- Example: "Try their migas taco" (is_menu_item = true)
- Example: "They have all types of tacos" (is_menu_item = false)

#### Hierarchical Position

- If entity is mentioned alongside more specific versions, likely a category
- Example: In "great ramen, especially the tonkotsu"
  "tonkotsu ramen" (is_menu_item = true)
  "ramen" (is_menu_item = false)

#### Default Case

- If uncertain, check if dish is mentioned as something specifically ordered
- Example: "I ordered the pad thai" (is_menu_item = true)
- Example: "They specialize in Thai food" (is_menu_item = false)

### 1.5 Central Entity Extraction & Processing Guide

#### Processing Flow Overview

Use this central guide to extract entities systematically, referencing the appropriate classification rules and processing guidelines at each step:

#### Step 1: Initial Content Assessment

- Apply **Core Comment & Post Processing Criteria** (Section 1.1) to determine if content should be processed
- **Entity Inheritance:** Check if entities can be inherited from parent comment/post when connection is unambiguous
- **Short Affirmations:** Handle "+1", "seconded", "this", "agreed" by automatically inheriting all entities and sentiment from parent
- **General Praise Identification:** Determine if mention contains holistic restaurant praise using guidelines from Section 1.1

#### Step 2: Entity Identification & Classification

- Extract restaurant mentions (explicit or contextually inferred)
- For food mentions, apply **Entity Types & Classification Rules** (Section 1.2) to identify:
  - Which terms are dish_or_category entities (food nouns)
  - Which terms are dish_attributes based on context (preparation, cuisine when applied to dishes, etc.)
  - Which terms are restaurant_attributes based on context (ambiance, features, cuisine when applied to restaurants, etc.)
- **Context-dependent attributes**: Determine scope based on usage - same attribute concept may create separate entities for different scopes

#### Step 3: Food Term Processing

- For food mentions, apply **Compound Term Processing Rules** (Section 1.3):
  - Exclude attribute terms identified in Step 2
  - Apply hierarchical decomposition to remaining food substance terms
  - Create parent-child category relationships
- Apply **Menu Item Identification Rules** (Section 1.4) to determine is_menu_item flag

#### Step 4: Attribute Classification

- For identified attributes, apply **Selective vs Descriptive Classification** (Section 1.2)
- Ensure proper scope assignment (dish attributes vs restaurant attributes)

#### Step 5: Normalization & Output

- Convert to lowercase canonical forms
- Remove unnecessary articles (the, a, an)
- Standardize punctuation and spacing
- Store original mention text separately for alias creation
- Handle common abbreviations and nicknames
- Output in standardized JSON structure

#### Key Processing Examples

**Flat Schema Example for "House-made spicy Nashville hot chicken sandwich is amazing":**

```json
{
  "temp_id": "mention_1",
  "restaurant_normalized_name": "restaurant_name_here",
  "restaurant_temp_id": "rest_1", 
  "dish_primary_category": "nashville hot chicken sandwich",
  "dish_categories": ["nashville hot chicken sandwich", "hot chicken sandwich", "chicken sandwich", "sandwich", "chicken"],
  "dish_temp_id": "dish_1",
  "dish_is_menu_item": true,
  "dish_attributes": ["spicy", "nashville", "house-made"],
  "general_praise": false,
  "source_type": "comment",
  "source_id": "t1_abc123",
  "source_content": "House-made spicy Nashville hot chicken sandwich is amazing"
}
```

**Traditional Examples:**
- "Their tonkotsu ramen is amazing" → Create restaurant→"tonkotsu ramen" connection with "ramen" in categories
- "Great breakfast tacos here" → Find/boost taco dishes with "breakfast" in dish_attributes
- "Great patio dining at Uchiko" → Add "patio" entity ID to Uchiko's restaurant_attributes array in metadata
