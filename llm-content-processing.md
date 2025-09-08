# Crave App: Comprehensive System Design & Implementation Guide

## Central Entity Extraction & Processing Guide

**CRITICAL: Follow this step-by-step processing flow to extract entities systematically, referencing the appropriate section for each step.**

### Step 1: Initial Content Assessment → Use Section 1
- Apply **Core Comment & Post Processing Criteria** (Section 1) to determine if content should be processed
- **Entity Inheritance:** Check if entities can be inherited from parent comment/post when connection is unambiguous
- **Short Affirmations:** Handle "+1", "seconded", "this", "agreed" by automatically inheriting all entities and sentiment from parent
- **General Praise Identification:** Determine if mention contains holistic restaurant praise

### Step 2: Entity Identification & Classification → Use Section 2
- Extract restaurant mentions (explicit or contextually inferred)
- Apply **Entity Types & Classification Rules** (Section 2) to identify:
  - Which terms are food entities (food nouns)
  - Which terms are food_attributes based on context (preparation, cuisine when applied to food, etc.)
  - Which terms are restaurant_attributes based on context (ambiance, features, cuisine when applied to restaurants, etc.)
- **Context-dependent attributes**: Determine scope based on usage

### Step 3: Food Term Processing → Use Section 3
- Apply **Compound Term Processing Rules** (Section 3):
  - Exclude attribute terms identified in Step 2
  - Apply hierarchical decomposition to remaining food substance terms
  - Create parent-child category relationships

### Step 4: Menu Item Classification → Use Section 4
- Apply **Menu Item Identification Rules** (Section 4) to determine is_menu_item flag
- Apply **Selective vs Descriptive Classification** for attributes

### Step 5: Name Normalization & Output
- Convert to lowercase canonical forms
- Remove unnecessary articles (the, a, an)
- Standardize punctuation and spacing
- Fix obvious typos if detected

#### Key Processing Example

**Example for "The house-made spicy Nashville hot chicken sandwich is amazing":**

```json
{
  "temp_id": "mention_1",
  "restaurant_temp_id": "rest_1",
  "restaurant_name": "inferred_restaurant_name_here",
  "food_temp_id": "food_1",
  "food_name": "nashville hot chicken sandwich",
  "food_categories": [
    "nashville hot chicken sandwich",
    "hot chicken sandwich",
    "chicken sandwich",
    "sandwich",
    "chicken"
  ],
  "is_menu_item": true,
  "food_attributes_selective": ["spicy"],
  "food_attributes_descriptive": ["nashville", "house-made"],
  "restaurant_attributes": null,
  "general_praise": false,
  "source_id": "t1_abc123"
}
```

## Section 1: Core Comment & Post Processing Criteria

### Post Extraction Control

**CRITICAL RULE - MUST BE FOLLOWED**: Check the `extract_from_post` flag in each input:
- If `extract_from_post: true` → Extract entities from both the post content AND comments
- If `extract_from_post: false` → **DO NOT EXTRACT ANY ENTITIES FROM THE POST CONTENT** - Extract entities ONLY from comments
- The post is always provided for context to understand references in comments
- **IMPORTANT**: When `extract_from_post: false`, even if the post mentions restaurants and food, you MUST NOT create mentions from the post content itself - only use it as context for understanding comment references

### Entity Inheritance Principle

Comments may inherit entities (restaurants, food, attributes) from parent comment/post when connection is unambiguous. Short affirmations ("+1", "seconded", "this", "agreed", etc.) automatically inherit all entities and sentiment from the parent comment.

### Core Processing Criteria - Process ONLY When ALL Are Met

1. **Sentiment Criterion:** Content contains either explicit positive sentiment about food/restaurant quality from first‑hand experience, or an implied endorsement when a reply lists places in response to a request for recommendations/options.
2. **Entity Criterion:** Content can be linked to:
   - Restaurant entity AND EITHER:
     - Food entity, OR
     - Restaurant attribute, OR
     - Clear general praise for the restaurant
3. **Relevance Criterion:** Content appears to describe current offerings

### Skip Conditions (Overrides All Other Rules)

- Content fails to meet ANY of the core requirements above
- Focused exclusively on non-food/restaurant aspects  
- Promotional or marketing content
- Any request for recommendations, suggestions, or opinions from others (the request itself is context; process the replies to it as usual)
- Secondhand information or hearsay

### Recommendation Replies & General Praise

When processing replies to requests for recommendations/options:

- If the request is NOT item‑specific: mentioning one or more restaurants implies positive endorsement. Emit a restaurant‑only mention per restaurant with `general_praise: true` (unless explicitly negative).
- If the request IS item‑specific (e.g., “best burger in EV?”):
  - If the reply explicitly ties a dish to a restaurant, emit a restaurant+food mention per restaurant-food connection with normal `is_menu_item` inference.
  - Otherwise, emit a restaurant+food mention per restaurant-food connection using the request’s target item as `food_name` and set `is_menu_item: false`. Do not set `general_praise` unless there is holistic praise; when it does co‑occur, set `general_praise: true` on the same restaurant→food mention (do not emit a separate general‑praise‑only mention).

Notes and exceptions:

- Restaurant‑only validity: Emit a restaurant‑only mention (food_name = null, general_praise = false) only when the content positively attributes a restaurant feature (e.g., patio, rooftop). If there is neither dish‑specific praise nor holistic praise and no positive/neutral restaurant attribute is mentioned, skip the mention.
- Do not require explicit first‑hand language in recommendation replies; listing a place in response counts as an endorsement unless explicitly negative (e.g., “avoid”, “don’t go”, “worst”, “bad”).
- Neutral/negative caveats (e.g., “sides suck”, “long wait”, “pricey”) should be ignored — do not extract negative attributes.
- If the original ask is for “bad/avoid/worst” places, skip processing for those replies (do not create mentions).

Examples:

- “This place is amazing” → general_praise: true
- “Franklin BBQ is amazing and their brisket is great” → single restaurant→food mention (Franklin BBQ + brisket) with `general_praise: true`
- Post: “Where should I eat?” Reply: “Yafa Deli\nCrispy Burger” → two restaurant‑only mentions with `general_praise: true`
- Post: “Best burger in EV?” Reply: “Crispy Burger — sides suck” → restaurant→food mention with `restaurant_name: "crispy burger"`, `food_name: "burger"`, `is_menu_item: false`, `general_praise: false`; ignore the caveat for extraction

### Context and Entity Inference Note

**For posts/comments that don't contain directly processable information:** Even if content doesn't meet the core processing criteria, it can still provide valuable context for entity inheritance, restaurant identification, or setting up context for subsequent comments in the thread.

## Section 2: Entity Types & Classification Rules

### Entity Types

- **restaurant**: Physical dining establishments
- **food**: Food items that can serve as both specific menu items and general categories
- **food_attribute**: Descriptive terms that apply to food items (connection-scoped)
- **restaurant_attribute**: Descriptive terms that apply to restaurants (restaurant-scoped)

### Context-Driven Attribute Classification

Note on scope and examples: The category labels and example lists below are illustrative, not exhaustive. Use them as guidance (e.g., not a closed set) and apply context to map terms appropriately.

**Only food types can be categories:**

- Nouns representing food items (e.g., pizza, taco, burger, sandwich, soup, salad, pasta, ramen, sushi, noodles, dessert)

**Primarily food-scoped attributes:**

- **Preparation methods** (e.g., grilled, fried, smoked, steamed, baked, roasted, house‑made, raw)
- **Texture/consistency** (e.g., tender, juicy, flaky, smooth, chunky, crisp/crunchy, creamy)
- **Flavor profiles** (e.g., sweet, savory, tangy, rich, mild, spicy, umami, tart, bitter)
- **Portion context** (e.g., generous portions, shareable, bite‑sized)

**Primarily restaurant-scoped attributes:**

- **Physical features** (e.g., patio, rooftop, outdoor, bar seating, view, fireplace, drive‑through)
- **Ambiance** (e.g., romantic, quiet, lively, cozy, intimate, upscale, casual)
- **Service model** (e.g., counter service, full service, fast casual, fine dining, quick service)
- **Operational** (e.g., BYOB, reservations required, walk‑ins only, takeout friendly, delivery available)
- **Group dynamics** (e.g., family‑friendly, date night spot, business lunch venue, large groups, communal seating)

**Context-dependent attributes (LLM determines scope based on usage):**

- **Cuisine** (e.g., Italian, Mexican, Thai, Chinese, Japanese, Mediterranean, Indian, French, Korean, Vietnamese)
- **Dietary** (e.g., vegan, vegetarian, gluten‑free, halal, kosher, keto, low‑carb, dairy‑free, nut‑free, shellfish‑free)
- **Value** (e.g., expensive, cheap, budget‑friendly, worth‑it, great value, affordable)
- **Quality descriptors** (e.g., authentic, fresh, best, amazing, incredible, worth‑the‑splurge)
- **Meal timing** (e.g., breakfast, lunch, dinner, brunch, late night, Sunday brunch)
- **Occasion** (e.g., comfort food, celebration, special occasion, happy hour, daily specials, weekend specials)
- **Service quality** (e.g., friendly, attentive, quick service, great service)

**Scope Determination Principle**: The same attribute concept (e.g., "Italian") exists as separate entities based on context - "Italian pasta" creates a food_attribute entity, while "Italian restaurant" creates a restaurant_attribute entity.

### Selective vs Descriptive Classification

**Selective attributes:** Help filter or categorize options

- "great vegan sandwiches" → vegan is selective
- "best Italian restaurants" → Italian is selective
- "good breakfast spots" → breakfast is selective

**Descriptive attributes:** Characterize or describe specific items

- "this pasta is very fresh" → fresh is descriptive
- "their sandwich is so big" → big is descriptive

**Principle:** Is it about what type of thing it is (selective) or how that thing is (descriptive)?

## Section 3: Compound Term Processing Rules (Food Terms Only)

_Apply these rules only to food-related compound terms, not restaurant names or other entities._

### Attribute Exclusion Principle

Before applying compound term processing to food mentions, exclude any terms that are preparation methods, cooking styles, dietary restrictions, cuisines meal periods, or serving formats. Apply compound term processing only to remaining food substance terms.

### Complete Preservation Rule

Always store the complete compound food term as primary category in singular form, **excluding any terms identified as attributes**.

### Hierarchical Decomposition Rule

Create all meaningful food noun combinations as additional categories:

- Include significant ingredients as standalone categories
- Convert all category terms to singular form
- Include parent categories when term represents specific subtype
- **Exclude any terms identified as attributes from decomposition**

Examples:

- "spicy ramen" → Extract "spicy" as attribute, process only "ramen" for compound terms
- "breakfast burrito" → Extract "breakfast" as attribute, process only "burrito" for compound terms
- "house-made carnitas taco" → Extract "house-made" as preparation attribute, process "carnitas taco" for compound terms

### Inference Rules

- Infer parent categories for specific food subtypes even when not explicitly mentioned
- Derive broader cuisine attributes from specific ones
- Apply known culinary relationships

## Section 4: Menu Item Identification Rules

When setting the is_menu_item flag on restaurant→food connections (applied to clean food terms after attribute extraction):

### Specificity

- More specific food items are likely menu items
- Example: "brisket" at Franklin BBQ (is_menu_item = true)
- Example: "BBQ" (is_menu_item = false)

### Plurality

- Singular forms often indicate menu items
- Example: "the burger" (is_menu_item = true)
- Example: "burgers" (is_menu_item = false)

### Modifiers

- Specific preparation details suggest menu items
- Example: "house-made carnitas taco" (is_menu_item = true)
- Example: "seafood" (is_menu_item = false)

### Context

- "Try their X" typically indicates menu item
- "Known for X" typically indicates menu item
- "Type of X" typically indicates category
- Example: "Try their migas taco" (is_menu_item = true)
- Example: "They have all types of tacos" (is_menu_item = false)

### Hierarchical Position

- If entity is mentioned alongside more specific versions, likely a category
- Example: In "great ramen, especially the tonkotsu"
  "tonkotsu ramen" (is_menu_item = true)
  "ramen" (is_menu_item = false)

### Default Case

- If uncertain, check if food is mentioned as something specifically ordered
- Example: "I ordered the pad thai" (is_menu_item = true)
- Example: "They specialize in Thai food" (is_menu_item = false)
