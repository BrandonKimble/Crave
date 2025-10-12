# Crave App: LLM Content Processing Guide

### Processing Loop

- Run Steps 1-6 separately for each source within the provided input payload: the post body (once, only when `extract_from_post: true`) and every individual comment, whether top-level or nested. Each run produces output for just that source, while still using the surrounding content for context according to the later step instructions. When a source fails Step 1 eligibility, emit nothing for that source and continue with the remaining items in the payload.

### Pipeline Snapshot (read before diving into the step sections)

- Step 1 - Eligibility & intent check; inputs: in-scope text; outputs: `resolvedRestaurants`.
- Step 2 - Canonicalize restaurant names; inputs: `resolvedRestaurants`; outputs: `canonicalRestaurants`.
- Step 3 - Classify food/restaurant attributes and prepare tokens; inputs: `canonicalRestaurants`, source text; outputs: `classifiedAttributes`, `foodTokensClean`, `attributeLinks`.
- Step 4 - Compose dish terms per restaurant connection; inputs: `foodTokensClean`, contextual anchors; outputs: `composedFoods`.
- Step 5 - Decide item vs category vs restaurant-only; inputs: `composedFoods`, context cues; outputs: `itemDecisions`.
- Step 6 - Apply sentiment gate and emit mentions; inputs: prior outputs plus sentiment cues; outputs: final `mentions` JSON.

### Data Contracts (owned outputs per step)

- Step 1 -> `resolvedRestaurants: string[]`
- Step 2 -> `canonicalRestaurants: Array<{ restaurant_name: string, restaurant_temp_id: string }>`
- Step 3 -> `classifiedAttributes`, `foodTokensClean`, `attributeLinks`
- Step 4 -> `composedFoods`
- Step 5 -> `itemDecisions`
- Step 6 -> `mentions`

Each step's section below is authoritative for how to populate these structures. Nothing in this preface replaces the detailed instructions; it only orients you before reading them.

### Core Concepts & Terminology

- **In-scope context**: strictly the text provided in the current input payload (post title/body subject to `extract_from_post`, the active comment, and any parent/earlier lines included).
- **Anchor types** discovered in-scope:
  - `restaurant anchors`: explicit restaurant names.
  - `food anchors`: explicit dishes/categories or inherited food references.
  - `attribute anchors`: modifiers tied to restaurants or foods.
- **Anchor handling across steps** (orientation only-follow each step's detailed rules before acting):
  - Step 1 resolves restaurant anchors and decides whether to continue; it does not collect food or attribute anchors.
  - Step 3 classifies food and attribute anchors after Step 1/Step 2 have supplied the restaurant context.
  - Steps 4-6 reuse the anchored outputs from Steps 1-3; they never introduce new anchors.
- **References**: pronouns, deictics, definites, possessives, ellipsis, and short affirmations that point back to anchors.
- **Depth-aware resolution order** (applies whenever a step calls for it):
  - Replies: current comment (closest clause first) -> parent comment -> earlier lines in this input -> post title/body.
  - Top-level comments: current comment -> post title/body -> earlier lines in this input.

### Global Example Note

- Every example in this guide is illustrative. When an example seems to diverge, follow the principles and rules in the relevant step.

## Step 1: Eligibility & Intent

Scope & Goal
- Scope: Resolve restaurant references using in-scope context; infer recommendation intent; decide whether to continue processing this post/comment.
- Goal: Produce `resolvedRestaurants` for downstream steps and decide early whether this source should be abandoned (no canonicalizing names, composing dishes, or assigning `general_praise` here).

Inputs & Dependencies
- Inputs: in-scope text per the Global Principle (post title/body per `extract_from_post`, current comment, parent/earlier lines included in this input).
- Dependencies: depth-aware reference resolution order from the Global Principle; Step 1.1 `extract_from_post` semantics; Step 1.3 recommendation-reply interpretation.

Outputs
- `resolvedRestaurants: string[]` - resolved restaurant names (not yet canonicalized) referenced by this post/comment.

### Execution order summary (apply after reading 1.1-1.5)
1. Apply `extract_from_post` semantics (scope sources)
2. Discover anchors and resolve references in the current comment (depth-aware order)
3. Interpret recommendation replies for intent (positive unless explicitly negative)
4. Evaluate the Eligibility Flow (1.4) and Skip Conditions (1.5).
Outcome: `resolvedRestaurants` (only continue to Step 2 when all checks succeed; otherwise emit nothing for this source and move on)

### 1.1 Post Extraction Control

**CRITICAL RULE - MUST BE FOLLOWED**: Check the `extract_from_post` flag in each input:

- If `extract_from_post: true` -> Extract entities from both the post content AND comments
- If `extract_from_post: false` -> **DO NOT EXTRACT ANY ENTITIES FROM THE POST CONTENT** - Extract entities ONLY from comments
- The post is always provided for context to understand references in comments
- extract_from_post semantics: When `extract_from_post` is false, do not emit mentions from the post body. Still use the post title and content to disambiguate and canonicalize restaurant and food names in replies. The flag only controls emitting mentions from the post body; it does not reduce the use of post context for resolving names in comments.

### 1.2 Anchor Discovery & Reference Resolution

Extract explicit restaurant names from the in-scope text (anchors).

- Scan these in-scope sources for anchors (order depends on depth):
  - For replies (has parent): current comment (same sentence/clause first), then the parent comment, then any earlier lines included in this input, then the post title/body (subject to `extract_from_post`).
  - For top-level comments (no parent): current comment first, then the post title/body, then any earlier lines included in this input.
- Resolve references in the current comment (pronouns, deictics, definite descriptions, possessives, ellipsis) to the nearest viable anchor per the depth-aware order.
- If the current comment lacks an explicit name, still discover anchors from surrounding in-scope text and resolve the current comment's references to those anchors here.
- If no anchors are found after scanning all in-scope sources, deem this source ineligible and move on. If irreducible ambiguity remains after applying the depth-aware order (two anchors equally likely), do the same—stop here rather than carrying ambiguity forward.
- Hand off the resolved restaurant names to Step 2 for canonicalization & alias unification.

### 1.3 Recommendation Replies - Interpretation (intent only)

Interpret ask/response patterns to set intent; do not modify `resolvedRestaurants` here (anchor discovery and reference resolution happen in 1.2). Final emission and `general_praise` are decided in Step 6.

- Non item-specific asks (e.g., "Where should I eat?"): treat a reply as positive only when it either (a) includes an explicit quality or recommendation cue ("it’s fantastic", "definitely go", "people rave about ___", "worth the trip"); or (b) consists almost entirely of one or more restaurant names separated by commas, slashes, "and"/"or", or simple connectors such as "try" or "go to". Any additional wording must itself convey quality; neutral statements should fail the intent check.
- Item-specific asks (e.g., "best burger in EV?"):
  - If the reply ties a dish to a restaurant, intent is positive for that link.
  - If the reply names a restaurant without tying a dish, intent is positive for the named restaurant; do not force itemhood.
- You may accept indirect recommendation verbs (“worth the trip”, “take them to ___”) or concise quality adjectives (“amazing”, “favorite spot”) even without first-hand framing. Statements that only express curiosity or desire (“want to try”, “never been but interested”) do not qualify.
- When a reply only names the restaurant and satisfies the quality criteria above, Steps 5-6 will reuse the ask's target category as `food_name`/`food_categories` with `is_menu_item: false`; Step 1 still refrains from emitting from the ask itself.

Quality signal (for this step) means the text expresses—explicitly or by clear implication—that the restaurant or dish is good, worth visiting, or positively distinctive. Direct praise, strong recommendations, consensus statements, and bare restaurant lists qualify. Neutral context, scheduling, price talk, or expressions of curiosity alone do not.

### 1.4 Eligibility Decision Flow

Apply these checks in order. If any check fails, emit nothing for this source and continue with the next comment/post.

1. **Source permission**: If `extract_from_post` forbids emitting from this source (post body when false, or other excluded text), stop here.
2. **Anchors available**: If Step 1.2 produced zero resolved restaurants (or ambiguity could not be resolved), stop here.
3. **Quality signal present**: Confirm the source contains a quality/recommendation signal as defined in 1.3. If it does not, stop here.
4. **Timeliness**: If the text clearly describes a closed/past-only scenario (e.g., "RIP", "used to", "miss" with no contradicting context), stop here.

When all four checks succeed, carry the `resolvedRestaurants` into Step 2.

Timeliness cues to watch:
- Stop when the source states the place is closed or only referenced in the past ("RIP/closed", "used to", "I miss ...") without immediate contradiction.
- Continue when the source uses present/recent dining language ("had", "got", "their X is great") or the status is unclear.

### 1.5 Skip Conditions (overrides)

- Fails the Eligibility Decision Flow (1.4).
- Purely non-food/restaurant content (no quality or attribute signal, no recommendation intent).
- Replies that only convey participation, availability, desire, or other neutral statements and never surface a quality/recommendation cue.
- Promotional/marketing content.
- The ask itself (requests/questions) - record intent in 1.3; do not emit from the ask.
- Secondhand information or hearsay.
- Explicitly negative listing asks ("bad/avoid/worst"): treat replies as negative intent; Step 6 will withhold emission.

## Step 2: Canonicalization & Alias Unification

Scope & Goal
- Scope: Normalize and unify the restaurant names resolved in Step 1 for this input. Do not perform reference resolution or eligibility checks.
- Goal: Choose a single canonical `restaurant_name` per establishment (from observed variants only) and assign a consistent `restaurant_temp_id` for reuse in this input.

Inputs & Dependencies
- Inputs: `resolvedRestaurants` from Step 1.
- Dependencies: Global Principle (in-scope evidence only); safe alias unification rules; canonical selection rules.

Outputs
- `canonicalRestaurants: Array<{ restaurant_name: string, restaurant_temp_id: string }>` - canonicalized names and IDs for use in Steps 3-6.

### Execution order summary (apply after reading 2.1-2.7)
1. Canonicalize names produced by Step 1 (no pronoun/deictic resolution)
2. Unify aliases/short forms only when safe (equal after normalization, or strict superset with no subset collisions)
3. Choose the canonical from observed variants only; never synthesize new tokens
4. Include branch/location only when needed to disambiguate within this input
5. Assign and reuse `restaurant_temp_id` per canonical form in this input
Outcome: canonical `restaurant_name` values and `restaurant_temp_id`s for downstream steps

### 2.1 Inputs & Constraints

- Input: the `resolvedRestaurants` produced by Step 1 (reference resolution already done there).
- Use only in-scope evidence (this input payload) to choose canonical forms.
- Do not fabricate names. The canonical restaurant_name MUST be chosen from the observed surface forms in this input after normalization. Never synthesize or expand a name with tokens not present in any observed form.
- This step does not skip in normal cases. If a canonicalization conflict cannot be unified using the criteria below (rare), apply canonical selection rules to choose one.

### 2.2 Canonicalization Rules (restaurant_name)

Normalize each resolved restaurant name into a canonical string to avoid duplicates:

- Lowercase everything.
- Remove leading English articles: "the", "a", "an".
- Collapse repeated whitespace to a single space; trim leading/trailing spaces.
- Standardize punctuation and symbols:
  - Replace ampersand "&" with the word "and".
  - Remove trailing punctuation (commas, periods, quotes) that are not part of the name.
  - Normalize apostrophes to plain ASCII when present (e.g., "joe's" -> "joes").
- Keep brand tokens intact (e.g., "bbq", "deli", "bakery", "taqueria"). Do not drop generic words if they are integral to the brand's written name.
- Preserve multi-word brand tokens and ordering as written after normalization.

Examples:

- "Franklin BBQ" -> "franklin bbq"
- "The Smith" -> "smith"
- "Joe's Pizza" -> "joes pizza"
- "Pho & Co." -> "pho and co"

### 2.3 Alias & Short Forms (unification only)

- Unify only when safe, using observed variants in this input:

- Equal after normalization: two observed forms are identical after applying 2.2.
- Strict superset: one observed form is a strict token-superset of another AND no other anchor in this input shares the subset tokens (prevents accidental merges).
- Otherwise, keep forms distinct in this input (do not merge across distinct places).
- Pronouns and deictics are resolved in Step 1 and are not handled here.
- Chains and multi-branch brands: When the text stays generic or lacks a branch qualifier, keep the location-free canonical form exactly as observed (e.g., "mcdonalds"). Only include neighborhood/city tokens when the written name in this input explicitly contains them. See 2.5 for scoring tie-breakers.
- Eligibility happens here; the surviving canonical string still comes from the normalization rules in 2.2, and when several survivors remain, defer to the canonical selection scoring in 2.5 to choose the one to keep.

### 2.4 Ambiguity & Safety

- This step does not skip in normal cases. If a canonicalization conflict cannot be unified using 2.2 and 2.5 (e.g., two non-equivalent observed variants assert different canonicals for the same place), apply canonical selection rules (2.5) to choose one. Step 1 has already resolved references; only pathological conflicts should remain.
- Never emit placeholders like "unknown restaurant", "that place", or partial names without a clear brand token.

### 2.5 Canonical Selection (scoring)

When multiple observed variants exist for the same establishment in this input, pick one canonical from those observed variants, then stick to it:

- Variant gathering: Consider only name variants present in the in-scope text; normalize variants per 2.2. Never synthesize a new form.
- Scoring criteria (apply in order):
  - Completeness: prefer names that include full brand tokens (e.g., "katz's delicatessen" over "katz's") when unambiguous.
  - Disambiguation: include branch/location tokens only if multiple branches are clearly referenced in this input; otherwise omit location suffixes.
  - Specificity over brevity: prefer the more informative name if unambiguous in context.
  - Tie-breakers: higher frequency in this input's text; if still tied, prefer the longer informative token set.
- Canonical output: For all mentions of the same place within this post, emit `restaurant_name` as the chosen canonical; do not switch to a shorter alias once established. Reuse the same `restaurant_temp_id` for that place across mentions. Avoid emitting multiple normalized names that are token-subsets of one another for the same establishment.
- Location qualifiers: follow the 2.3 guidance-only include branch/location tokens when the written name in this input explicitly includes them.

### 2.6 Temporary IDs (restaurant_temp_id)

- Assign `restaurant_temp_id` as `r1`, `r2`, `r3`, ... in first-mention order within this output.
- Reuse the same `restaurant_temp_id` for all subsequent mentions that resolve to the same canonical `restaurant_name` in this output.

### 2.7 Examples

- Post: "Best tacos at Nixta?" -> canonical `restaurant_name: "nixta"`; `restaurant_temp_id: r1`.
- Comment: "Franklin is insane. Their brisket slaps." (thread clearly about Franklin BBQ) -> unify short form to canonical "franklin bbq" only if "franklin bbq" (or equivalent) appears as an observed variant in this input; otherwise keep "franklin".
- Comment: "Nixta was packed last night." (no observed "nixta taqueria" etc. in this input) -> keep canonical as "nixta".
- Comment: "Yafa Deli\nCrispy Burger" (reply to "Where should I eat?") -> two restaurants: "yafa deli" and "crispy burger", each with its own `restaurant_temp_id`.

## Step 3: Entity & Attribute Classification

Scope & Goal
- Scope: Identify entity types in the current comment and classify modifiers as `restaurant_attributes`, `food_attributes_selective`, and `food_attributes_descriptive`. Do not compose `food_name` or decide item/category/emission here.
- Goal: Produce normalized attribute arrays and a clean set of food substance tokens for composition.

Inputs & Dependencies
- Inputs: current comment text; in-scope context (title/body per `extract_from_post`, parent/earlier lines) for implicit references; `canonicalRestaurants` (Step 2) for disambiguation.
- Dependencies: Global Principle depth-aware reference resolution (applies to food/attribute references when implicit in the current comment).

Outputs
- `classifiedAttributes: { restaurant_attributes: string[] | null, food_attributes_selective: string[] | null, food_attributes_descriptive: string[] | null }` - normalized, comment-scoped attribute arrays for reuse across mentions.
- `foodTokensClean: string[]` - food substance tokens (attributes removed) to be used as inputs to Step 4 composition.
- `attributeLinks: Array<{ restaurant_temp_id: string, food_name: string | null, restaurant_attributes: string[], food_attributes_selective: string[], food_attributes_descriptive: string[] }>` - mention-level linkage objects that point each attribute to the restaurant->food pair(s) it modifies.

### Execution order summary (apply after reading 3.1-3.7)
1. Surface candidate food spans and modifiers in the current comment.
2. Apply the Attribute Exclusion Principle (3.2) so attributes are separated from food substance tokens.
3. Resolve implicit references (definites, pronouns, deictics) to nearby anchors using the depth-aware order.
4. Classify remaining tokens into restaurant vs food vs attribute; split food attributes into selective vs descriptive.
5. Normalize (lowercase, dedupe, natural singular) and emit `classifiedAttributes`, the cleaned food tokens for composition, and the `attributeLinks` map for downstream steps.
Outcome: `classifiedAttributes`, `attributeLinks`, and `foodTokensClean` ready for Step 4 and Step 6

### 3.1 Candidate harvesting

- Parse the current comment for nouns/noun phrases that could represent food items, restaurant descriptors, or attributes.
- Include inherited anchors from the parent/post when the current text uses pronouns or ellipsis.
- Keep the raw span plus any leading modifiers so the next step can decide which tokens stay with the dish vs peel off as attributes.

### 3.2 Attribute Exclusion Principle

Before handing tokens to composition, peel away modifiers that are attributes rather than core food substance terms.

- Remove preparation styles, cuisines-as-adjectives, dietary labels, serving periods, texture descriptors, and other modifiers that would better live in attribute arrays.
- Exclude multi-word modifiers as a unit when they behave as a single attribute (e.g., "house-made", "very spicy", "gluten free").
- Keep anchor words that define the food identity (e.g., protein, dish type) with the food tokens.
- Examples (non-exhaustive):
  - "spicy ramen" -> attribute "spicy"; food tokens keep "ramen".
  - "breakfast burrito" -> attribute "breakfast"; food tokens keep "burrito".
  - "house-made carnitas taco" -> attribute "house-made"; food tokens keep "carnitas taco".

### 3.3 Entity types

- `restaurant`: named establishments (e.g., "hui", "franklin bbq", "joe's pizza").
- `food`: food items that can be specific prepared items and broader categories (e.g., "ramen", "sesame noodles", "duck carnitas tacos").
- `food_attribute`: descriptive terms that apply to food items (connection-scoped), split into selective vs descriptive.
- `restaurant_attribute`: descriptive terms that apply to restaurants (restaurant-scoped).

### 3.4 Context-Driven Attribute Classification

Use local context to decide whether a term is a category (food) or an attribute (food/restaurant). Lists highlight patterns; rely on context, not keyword matching.

- Only food types can be categories: nouns representing food items (e.g., pizza, taco, burger, sandwich, soup, salad, pasta, ramen, sushi, noodles, dessert).
- Primarily food-scoped attributes (examples):
  - Preparation methods (e.g., grilled, fried, smoked, steamed, baked, roasted, house-made, raw)
  - Texture/consistency (e.g., tender, juicy, flaky, smooth, chunky, crisp/crunchy, creamy)
  - Flavor profiles (e.g., sweet, savory, tangy, rich, mild, spicy, umami, tart, bitter)
  - Portion context (e.g., generous portions, shareable, bite-sized)
- Primarily restaurant-scoped attributes (examples):
  - Physical features (e.g., patio, rooftop, outdoor, bar seating, view, fireplace, drive-through)
  - Ambiance (e.g., romantic, quiet, lively, cozy, intimate, upscale, casual)
  - Service model (e.g., counter service, full service, fast casual, fine dining, quick service)
  - Operational (e.g., BYOB, reservations required, walk-ins only, takeout friendly, delivery available)
  - Group dynamics (e.g., family-friendly, date night spot, business lunch venue, large groups, communal seating)

### 3.5 Scope Determination Principle

Determine scope by usage:
- "Italian pasta" -> `food_attribute`; "Italian restaurant" -> `restaurant_attribute`.
- "house-made" or "spicy" about a dish -> `food_attribute`; "great service", "cozy" -> `restaurant_attribute`.

### 3.6 Selective vs Descriptive (food-level)

- Selective attributes filter or categorize options (e.g., "great vegan sandwiches" -> `vegan`; "best Italian restaurants" -> `italian`; "good breakfast spots" -> `breakfast`).
- Descriptive attributes characterize specific items (e.g., "this pasta is very fresh" -> `fresh`; "their sandwich is so big" -> `big`).

### 3.7 Normalization & Outputs

- Lowercase everything; use natural singulars when it preserves meaning ("noodles" -> "noodle" is awkward, keep plural).
- Deduplicate within each attribute list while preserving selective vs descriptive separation.
- Emit `foodTokensClean` as the remaining food substance terms in reading order; these feed Step 4 composition.

### 3.8 Mention-level Attribute Linking

- Emit one `attributeLinks` entry per restaurant->food connection using the normalized strings from `classifiedAttributes`. Include a `food_name: null` entry only when the restaurant attribute explicitly belongs on that particular mention (e.g., a standalone restaurant sentence). Do not create entries for mentions that never referenced the attribute.
- Attach restaurant attributes only to the mentions whose text supports them, and attach food attributes only to the dish (restaurant->food pair) they modify. When the text clearly scopes an attribute to multiple dishes or mentions, create a separate link for each affected pair.
- Example: "Nixta's duck carnitas tacos are incredibly rich, Suerte's version is smoky, and Nixta's patio is gorgeous." -> emit one entry per restaurant->food pair, plus a restaurant-only entry just for the patio sentence:

```json
[
  {
    "restaurant_temp_id": "r1",
    "food_name": "duck carnitas tacos",
    "restaurant_attributes": [],
    "food_attributes_descriptive": ["rich"]
  },
  {
    "restaurant_temp_id": "r2",
    "food_name": "duck carnitas tacos",
    "restaurant_attributes": [],
    "food_attributes_descriptive": ["smoky"]
  },
  {
    "restaurant_temp_id": "r1",
    "food_name": null,
    "restaurant_attributes": ["patio"],
    "food_attributes_descriptive": []
  }
]
```

Step 6 will merge the matching entry (same `restaurant_temp_id` + `food_name`) with any restaurant-level entry before populating mentions, keeping the normalized strings intact.

## Step 4: Food Term Composition

Scope & Goal
- Scope: From the current comment's food language, compose a dish for each restaurant->food connection (`food_name` + `food_categories`) without ingredient fan-out. Do not decide item vs category or emission.
- Goal: Produce stable food terms for Step 5. When food/attribute references are implicit (definites/pronouns/deictics), resolve them to nearby food/attribute anchors using the Global Principle's depth-aware order.

Inputs & Dependencies
- Inputs: current comment text; `foodTokensClean` (Step 3); resolved/canonical restaurant context from Steps 1-2 for disambiguation; in-scope context (title/body, parent/earlier lines) for food/attribute reference resolution when needed.
- Dependencies: Global Principle depth-aware reference resolution (applied to food/attributes when the current comment's food reference is implicit); classification outputs from Step 3.

Outputs
- `composedFoods: Array<{ restaurant_temp_id: string, food_name: string, food_categories: string[] }>` - one or more composed dish objects (each tied to a canonical restaurant) for Steps 5-6.

### Execution order summary (apply after reading 4.1-4.5)
1. Start from `foodTokensClean` (Step 3) and confirm the dish is tied to the correct canonical `restaurant_temp_id` when context is implicit.
2. Compose a single `food_name` using the head food noun plus identity-changing specifiers; avoid ingredient fan-out.
3. Build concise `food_categories` (ingredients + parent categories), 3-6 salient terms, deduped and singular where natural.
4. Validate invariants (readable name, aligned categories) and emit `composedFoods` entries, each carrying the linked `restaurant_temp_id`, for Steps 5-6.
Outcome: structured `food_name` with complementary `food_categories` for use in Steps 5-6

### 4.1 Connection-Level Composition Principle

Represent each restaurant->food connection as one composed dish. Do not emit separate mentions for component ingredients or related nouns; capture them under `food_categories` for the same dish connection.
- Carry forward the `restaurant_temp_id` that the dish inherits from Step 1/Step 2 resolution so downstream steps can join decisions unambiguously.

### 4.2 Primary `food_name` Formation

- Use the head food noun plus essential specifiers that change dish identity (e.g., protein, style, subtype): "duck carnitas tacos", "sesame noodles", "tonkotsu ramen".
- If the phrase includes additive lists introduced by "with/and" (e.g., "with burrata, chanterelle mushrooms, and pesto"), keep `food_name` concise and push the additive list into `food_categories`.
- Do not reattach attributes stripped in Step 3; rely on the attribute arrays produced there.
- Normalize: lowercase; singularize where natural (avoid awkward singulars that reduce clarity); keep punctuation minimal and human-readable.

### 4.3 Hierarchical Decomposition to `food_categories`

Create a concise, meaningful set of categories to support search, filtering, and aggregation:

- Include component ingredients and related nouns from the dish context (e.g., burrata, chanterelle mushrooms, pesto).
- Include parent categories when a term is a subtype (e.g., "carnitas taco" -> "taco"; "tonkotsu ramen" -> "ramen").
- Exclude attributes; convert to singular; deduplicate.
- Bound the set to the most salient 3-6 terms - avoid combinatorial n-grams.

### 4.4 Inference Rules

- Infer reasonable parent categories for specific subtypes even when not explicitly mentioned.
- Derive broader cuisine/parent categories when they are food categories (not attributes already excluded above).
- Apply known culinary relationships conservatively to avoid over-generation.

### 4.5 Examples

- "house-made carnitas taco" ->
  - `food_name`: "carnitas taco"
  - `food_categories`: ["taco", "carnitas"]
  - attributes: ["house-made"]
- "spicy ramen" ->
  - `food_name`: "ramen"
  - `food_categories`: ["ramen"]
  - attributes: ["spicy"]
- "pasta with burrata, chanterelle mushrooms, and pesto" ->
  - `food_name`: "pasta"
  - `food_categories`: ["pasta", "burrata", "chanterelle mushrooms", "pesto"]
  - One mention only; ingredients captured as categories.
- Two restaurants, same dish: "Get the carnitas tacos at Nixta and at Suerte." -> emit two `composedFoods` entries with identical `food_name`/`food_categories` but distinct `restaurant_temp_id` values so later steps can keep the pairs separate.
## Step 5: Menu Item Identification

Scope & Goal
- Scope: Decide `is_menu_item` for each composed dish (or choose restaurant-only) using in-scope context; do not re-split composed dishes or assign `general_praise`.
- Goal: Produce conservative item/category decisions for Step 6 emission.

Inputs & Dependencies
- Inputs: `canonicalRestaurants` from Step 2; `composedFoods` from Step 4; in-scope context signals (local tie, specificity, coherence).
- Dependencies: Respect Step 4 (no re-split); respect Step 2's canonical restaurant names.

Outputs
- `itemDecisions: Array<{ restaurant_temp_id: string, food_name: string | null, food_categories: string[] | null, is_menu_item: boolean }>` for use in Step 6. For true restaurant-only recommendations (no dish mention and no inherited ask category), set both `food_name` and `food_categories` to null with `is_menu_item: false`. For item-specific replies that only name the restaurant, follow the Ask Handling guidance below.

### Execution order summary (apply after reading 5.1-5.4)
1. Aggregate context (local tie, specificity, coherence)
2. Align each decision with the correct `composedFood` entry (matching `restaurant_temp_id` and `food_name` when present) or, for item-specific asks without a dish mention, inherit the ask's target category.
3. Set `is_menu_item: true` only with strong evidence; else category/restaurant-only
4. Respect Step 4.1 (Single-Mention Composition): reuse the composed dish as emitted
Outcome: decide `is_menu_item` (true/false) or restaurant-only when no clear dish applies

### 5.1 Principles

- Context scope: Use all in-scope text - post title, post body, the current comment, and any earlier text included in this same input/chunk.
- No placeholders: Never emit fabricated or placeholder restaurant names. If the restaurant cannot be resolved with high confidence, skip the mention instead of inventing a name.
- Sentiment alignment: Step 1 ensures there is a positive or recommendatory intent before you reach this step, and Step 6 performs the final positive-only gate. Step 5 should remain neutral - do not override the pipeline with additional sentiment heuristics here, but avoid forwarding obviously negative dish mentions.
- Canonicalization alignment: Within a post, use the single canonical `restaurant_name` and `restaurant_temp_id` chosen in Step 2. Short forms must align with that canonical name; do not produce multiple variants for the same establishment.
- Food linking: Match `food_name` and `restaurant_temp_id` to one of the `composedFoods` produced in Step 4 so downstream steps can merge decisions without guessing.
- Respect Step 4.1: Reuse the composed dish as emitted; do not re-split dishes or ingredients already locked in.

### 5.2 Decision Framework (apply in order)

1. Confirm link to canonical restaurant (from Step 2)

   - If this composed dish has no confirmed link for this source, skip (do not emit placeholders).

2. Confirm composed dish terms (from Step 4)

  - Use the `food_name`/`food_categories` produced by Step 4 as-is (per Step 4.1); do not re-split or re-compose here.
   - When Step 4 has no composed dish because the reply only names the restaurant, inherit the ask's target category as `food_name` and set `food_categories` to a minimal list (e.g., `["burger"]`). Keep `is_menu_item: false` in this scenario.

3. Assess itemhood evidence (aggregate; do not rely on a single cue)

   - Local tie: Dish and restaurant are linked in the same clause/sentence or an immediately adjacent reference (e.g., "at [restaurant]", "from here", "their/this/that [dish]", clear ordering verbs like "got/ordered/had/tried"). A clear combination suffices; not all signals are required.
   - Specificity: The dish is specific enough that a typical diner could order it without additional specification (e.g., "duck carnitas tacos", "sesame noodles"), not just a broad type ("sushi", "pizza", "shawarma") unless the context makes it specific.
   - Coherence: If earlier text in the same input has already established a dish->restaurant pairing, concise follow-ups (e.g., "the tacos are insane", "this was incredible") may inherit itemhood when unambiguous.

4. Decide outcome (be conservative when uncertain)
   - `is_menu_item: true` when itemhood evidence is sufficiently strong (as above) in the local context.
   - `is_menu_item: false` when the food reference reads as a category or when evidence is weak/ambiguous after aggregating context.
   - Restaurant-only when the reply lists restaurants without a clear dish, or when sentiment applies holistically to the restaurant.

### 5.3 Examples

- Specific prepared item (`is_menu_item: true`)
  - "Duck carnitas tacos at Nixta were insane." -> `restaurant_name`: "nixta"; `food_name`: "duck carnitas tacos".
  - "Their sesame noodles are fantastic." (thread already about that restaurant) -> `food_name`: "sesame noodles".
- Category or skip (`is_menu_item: false` or no dish mention)
  - "The sushi roll was pretty good." (no clear restaurant tie in local context) -> either skip, or treat as category if the restaurant is otherwise clearly in scope but the dish remains generic.
  - "Mixed shawarma platter. Maybe add falafel." (no restaurant tie, generic discussion) -> skip.
- Mixed sentiment (emit only positive dish)
  - "PSA: the ribs suck. The brisket is good." -> emit "brisket" (positive); do not emit "ribs".
- Inherited itemhood in concise follow-ups (when unambiguous)
  - Post: "Best dishes at Nixta?" Reply: "Duck carnitas tacos." -> itemhood inherited; `is_menu_item: true`.
- Item-specific ask with restaurant-only reply
  - Post: "Best burger in EV?" Reply: "Check out Royale." -> emit `food_name: "burger"`, `is_menu_item: false`, linked to Royale with the ask's target category.

### 5.4 Notes

- When producing pure restaurant-only recommendations (e.g., "Great patio at X"), set both `food_name` and `food_categories` to null with `is_menu_item: false` so Step 6 can emit a restaurant-only mention while still attaching attributes.
- When inheriting an ask's target category, supply that term as `food_name`, keep `food_categories` minimal, and leave `is_menu_item: false`.
- When multiple dishes tie to the same restaurant in one source, emit one `itemDecisions` entry per distinct `food_name`.

### Ask Handling (item-specific replies)

- Trigger when Step 1.3 identifies that the current source replies to an item-specific ask and the reply itself does not supply a dish mention.
- Step 5: create an `itemDecisions` entry tied to the restaurant with `food_name` set to the ask's target category, a minimal `food_categories` list (e.g., `["burger"]`), and `is_menu_item: false`. This preserves the category context without fabricating a dish.
- Step 6: emit the mention as a restaurant->food connection using that inherited category. Keep the food fields populated (do not null them out) and apply `general_praise` only when holistic praise is present; merely listing the restaurant does not set the flag.
- Only apply this inheritance when the reply itself contains a positive quality/recommendation cue per 1.3; otherwise skip the source.


## Step 6: Sentiment & Output Assembly

Scope & Goal
- Scope: Confirm `general_praise`, respect the final positivity constraints, and assemble the JSON mentions; do not re-resolve references or re-split composition (see Step 4.1).
- Goal: Emit one high-quality mention per valid connection, with canonical restaurant fields (Step 2), composed food (Step 4), and item/category decision (Step 5).

Inputs & Dependencies
- Inputs: `canonicalRestaurants` (Step 2), `classifiedAttributes` + `attributeLinks` (Step 3), `composedFoods` (Step 4), `itemDecisions` (Step 5), and in-scope sentiment signals.
- Dependencies: General Praise & Emission Rules (6.1); Field Population Rules (6.2); Output Format (6.3).

Outputs
- `mentions: Array<...>` - final JSON objects for downstream consumers.

### Execution order summary (apply after reading 6.1-6.4)
1. Confirm `general_praise` using 6.1 and ensure the positivity rules are satisfied
2. Assemble one mention per valid connection with: canonical `restaurant_name` (Step 2); attribute arrays from Step 3; composed `food_name`/`food_categories` (Step 4); `is_menu_item` (Step 5); and required source fields
Outcome: one consolidated, high-quality mention per valid connection, ready for downstream processing

### 6.1 General Praise & Emission Rules

- **Holistic praise**: When the text clearly praises the restaurant overall (e.g., "this place is amazing"), set `general_praise: true` on every mention for that restaurant (restaurant-only and restaurant->food). Never emit a duplicate general-praise-only mention if a dish mention already exists.
- **Non item-specific listings**: Treat a listing as endorsement only when the comment is limited to one or more restaurant names (plus simple connectors like commas, "and", "or", " / ", "try", "go to"). Set `general_praise: true` on those mentions. If additional text introduces statements unrelated to food/restaurant quality, skip.
- **Item-specific replies**: If the reply ties a dish to the restaurant, apply normal item vs category rules and set `general_praise: true` only with holistic praise. If it only names the restaurant, follow "Ask Handling (item-specific replies)" to inherit the category and keep `general_praise: true` gated on explicit holistic praise (fields still populated per that subsection).
- **Restaurant-only attributes**: Positive attributes without holistic praise (e.g., "great patio") can emit a restaurant-only mention with `general_praise: false` when the attribute appears in the source. If no attribute or praise exists, skip the mention.
- **Mixed/negative cues**: Do not emit negative dish mentions. You may emit another positive dish or set `general_praise: true` only when clear positive language exists in the same local context. Pure chatter (price, wait, ads) without positive signal keeps `general_praise` unset.
- **Inherited short replies**: Short affirmations ("+1", "agreed", "this") inherit the parent's `general_praise` when the referent is unambiguous. Elliptical/definite replies ("the sundae is the best") inherit the restaurant but require local holistic praise to set the flag.
- **Duplicate prevention**: When a dish mention already captures the relationship, reuse it; do not emit a second mention solely to carry `general_praise`.

### 6.2 Field Population Rules

For every mention, populate fields as follows:

- Identifiers
  - `temp_id`: `m1`, `m2`, ... unique per mention object in this output.
  - `restaurant_temp_id`: reference the resolved restaurant's temp ID (from Step 2).
- Restaurant
  - `restaurant_name`: canonicalized per Step 2.
  - `restaurant_attributes`: array of restaurant-scoped attributes (or omit/null if none).
- Food (optional)
  - If a food is present: set `food_name` from the aligned `composedFood` (Step 4) or, when inheriting an ask's target, from the category supplied in Step 5. Pair it with `food_categories` from the same source (Step 4 or the inherited list in Step 5), apply the `is_menu_item` decision from Step 5, and assign a `food_temp_id`.
  - If no food (and no inherited ask category): set `food_name`, `food_categories`, `food_temp_id`, and `is_menu_item` to null (or omit when allowed by schema). Item-specific asks that only yield a restaurant still count as having food data via the inherited category, so do not null them out.
  - `food_temp_id`: assign `f1`, `f2`, ... in first-mention order per unique normalized `food_name` within this output. Reuse the same `food_temp_id` wherever the same `food_name` repeats.
- Attributes
  - Split food attributes into `food_attributes_selective` vs `food_attributes_descriptive` (see Entity Types & Attribute Classification section) and keep them as arrays. Omit or set to null when none.
  - Look up the matching `attributeLinks` entry from Step 3 (same `restaurant_temp_id` and `food_name` null vs populated) and copy the arrays into this mention. The strings must stay identical to the normalized values in `classifiedAttributes`.
  - Do not broadcast restaurant-level attributes to every mention. Only merge the `food_name: null` entry when this specific mention was linked to it in Step 3. If the resulting mention has no food fields, no attributes, and `general_praise` remains false, skip emitting it.
- Core flags
  - `general_praise`: boolean as defined above.
- Source attribution
  - `source_id`: the Reddit ID of the exact source text for this mention.
    - For post-derived mentions (only when `extract_from_post: true`): use the post's `id`.
    - For comment-derived mentions: use that comment's `id` (even when sentiment/entities are inherited from the parent).
  - Do not include `source_type`, `source_url`, `source_created_at`, or upvote fields - these are injected server-side.

Additional rules:

- Names and attributes must be lowercase; collapse repeated spaces; avoid leading/trailing spaces.
- Do not emit duplicate mention objects for the same restaurant->food pair from the same source text. If the same pair is referenced multiple times in the same comment/post, emit a single mention for that source.
- It is valid for one source to emit multiple mentions when it references multiple restaurants and/or multiple distinct dishes.

### 6.3 Output Format

- Output must be valid JSON matching the schema: a single object with a `mentions` array.
- Do not wrap output in markdown code fences; no explanations or commentary - JSON only.
- When a property has no values, either omit it or set it to `null` if the schema marks it as nullable. Do not emit empty strings.

### 6.4 Example

Source text: "Nixta's duck carnitas tacos are incredibly rich, Suerte's version is smoky, and Nixta's patio is gorgeous."

{
  "mentions": [
    {
      "temp_id": "m1",
      "restaurant_temp_id": "r1",
      "restaurant_name": "nixta",
      "food_temp_id": "f1",
      "food_name": "duck carnitas tacos",
      "food_categories": ["tacos", "carnitas"],
      "is_menu_item": true,
      "food_attributes_selective": null,
      "food_attributes_descriptive": ["rich"],
      "restaurant_attributes": null,
      "general_praise": false,
      "source_id": "t1_comment"
    },
    {
      "temp_id": "m2",
      "restaurant_temp_id": "r2",
      "restaurant_name": "suerte",
      "food_temp_id": "f2",
      "food_name": "duck carnitas tacos",
      "food_categories": ["tacos", "carnitas"],
      "is_menu_item": true,
      "food_attributes_selective": null,
      "food_attributes_descriptive": ["smoky"],
      "restaurant_attributes": null,
      "general_praise": false,
      "source_id": "t1_comment"
    },
    {
      "temp_id": "m3",
      "restaurant_temp_id": "r1",
      "restaurant_name": "nixta",
      "food_temp_id": null,
      "food_name": null,
      "food_categories": null,
      "is_menu_item": null,
      "food_attributes_selective": null,
      "food_attributes_descriptive": null,
      "restaurant_attributes": ["patio"],
      "general_praise": true,
      "source_id": "t1_comment"
    }
  ]
}
