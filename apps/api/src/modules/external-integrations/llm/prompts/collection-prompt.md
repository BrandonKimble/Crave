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
- Step 2 -> `canonicalRestaurants: Array<{ restaurant: string }>`
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

Extract explicit restaurant names from the in-scope text (anchors) using the following sequence:

1. Gather anchor candidates from in-scope context (order depends on depth).

- For replies (has parent): current comment (same sentence/clause first), then the parent comment, then any earlier lines included in this input, then the post title/body (subject to `extract_from_post`).
- For top-level comments (no parent): current comment first, then the post title/body, then any earlier lines included in this input.

2. Decide each candidate by how the text **uses** the span, not by its words. Keep a span the text frames **as the name of a place** — proper-noun capitalization, the article "The" fronting it as a title, a possessive, a locating tail ("at/on/from &lt;place&gt;"), or a slot in a series of venues (comma/slash/"and"-joined items that are themselves names). Under any such frame the span denotes a particular establishment, so keep it even when its words are otherwise generic (e.g., "The Smith", "Superiority Burger", "Best Bagel"). Discard a span only when the text uses it **as a category, dish, or dining format** — the object of a craving, comparison, or description with no naming frame around it (e.g., "just want good tacos", "love hot pot", "no best sushi in this town", "a solid steakhouse"). When a span could read either way and no naming frame is present, treat it as a descriptor and discard.
3. Resolve references in the current comment (pronouns, deictics, definite descriptions, possessives, ellipsis, etc.) to the nearest viable anchor per the depth-aware order.

- If the current comment lacks an explicit name, you may still inherit an anchor from surrounding in-scope text and resolve references to that anchor here.

4. If no explicit anchors survive after the rejection step, deem this source ineligible and move on. If irreducible ambiguity remains after (two anchors equally likely), stop here rather than carrying ambiguity forward.
5. After completing the rest of step 1, hand the surviving anchor list to Step 2 for canonicalization & alias unification.

### 1.3 Recommendation Replies - Interpretation (intent only)

Interpret ask/response patterns to set intent; do not modify `resolvedRestaurants` here (anchor discovery and reference resolution happen in 1.2). Final emission and `general_praise` are decided in Step 6.

- Non item-specific asks (e.g., "Where should I eat?"): treat a reply as positive only when it (a) firsthand or by clear consensus endorses the place — an explicit quality or recommendation cue ("it's fantastic", "definitely go", "people rave about \_\_\_", "worth the trip") — or (b) consists almost entirely of one or more restaurant names joined by commas, slashes, "and"/"or", or simple connectors such as "try" or "go to". When the reply weighs options against each other, the endorsement lands on the winner it settles on, never on the option it sets aside. Any additional wording must itself convey quality; neutral statements fail the intent check.
- Item-specific asks (e.g., "best burger in EV?"):
  - If the reply ties a dish to a restaurant, intent is positive for that link.
  - If the reply names a restaurant without tying a dish, intent is positive for the named restaurant; do not force itemhood.
- Accept indirect recommendation verbs ("worth the trip", "take them to \_\_\_") and concise quality adjectives ("amazing", "favorite spot") as firsthand endorsement even without explicit first-person framing. A reply qualifies only when the speaker vouches for the place from experience or reports a clear consensus; curiosity, desire, or secondhand rumor ("want to try", "never been but interested", "I hear it's good") does not.
- When a reply only names the restaurant and satisfies the quality criteria above, Steps 5-6 will reuse the ask's target category as `food`/`food_categories` with `is_menu_item: false`; Step 1 still refrains from emitting from the ask itself.

Quality signal (canonical definition, reused wherever this guide refers to a quality/recommendation signal) means the text conveys — explicitly or by clear implication — a firsthand or consensus verdict that the place is good, worth visiting, or positively distinctive. Direct praise, strong recommendations, consensus statements, and bare restaurant lists qualify. When the text compares options, the signal attaches to the choice it endorses, never the one set aside. Neutral context, scheduling, price talk, curiosity, and secondhand hearsay do not qualify.

### 1.4 Eligibility Decision Flow

Apply these checks in order. If any check fails, emit nothing for this source and continue with the next comment/post.

1. **Source permission**: If `extract_from_post` forbids emitting from this source (post body when false, or other excluded text), stop here.
2. **Anchors available**: If Step 1.2 produced zero resolved restaurants (or ambiguity could not be resolved), stop here. Generic-only strings rejected in Step 1.2 do not count toward anchor availability.
3. **Quality signal present**: Confirm the source carries the quality signal as defined in 1.3 — a firsthand or consensus endorsement, attached to the option the source actually endorses. If it does not, stop here.
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
- Secondhand information, hearsay, or curiosity ("I've heard", "supposedly", "want to try") without a firsthand or consensus verdict.
- In a ranked, listed, or mixed source, judge each restaurant and each dish on its own local verdict. A positive verdict on one entry never carries to another entry, and an attribute stated for one entry never attaches to another.
- Explicitly negative listing asks ("bad/avoid/worst"): treat replies as negative intent; Step 6 will withhold emission.

## Step 2: Canonicalization & Alias Unification

Scope & Goal

- Scope: Normalize and unify the restaurant names resolved in Step 1 for this input. Do not perform reference resolution or eligibility checks.
- Goal: Choose a single canonical `restaurant` per establishment (from observed variants only). The API will assign deterministic IDs downstream.

Inputs & Dependencies

- Inputs: `resolvedRestaurants` from Step 1.
- Dependencies: Global Principle (in-scope evidence only); safe alias unification rules; canonical selection rules.

Outputs

- `canonicalRestaurants: Array<{ restaurant: string }>` - canonicalized names for use in Steps 3-6.

### Execution order summary (apply after reading 2.1-2.7)

1. Canonicalize names produced by Step 1 (no pronoun/deictic resolution)
2. Unify aliases/short forms only when safe (equal after normalization, or strict superset with no subset collisions)
3. Choose the canonical from observed variants only; never synthesize new tokens
4. Include branch/location only when needed to disambiguate within this input
5. Maintain the chosen canonical `restaurant` consistently across the input.

### 2.1 Inputs & Constraints

- Input: the `resolvedRestaurants` produced by Step 1 (reference resolution already done there).
- Use only in-scope evidence (this input payload) to choose canonical forms.
- Do not fabricate names. The canonical restaurant MUST be chosen from the observed surface forms in this input after normalization. Never synthesize or expand a name with tokens not present in any observed form.
- This step does not skip in normal cases. If a canonicalization conflict cannot be unified using the criteria below (rare), apply canonical selection rules to choose one.

### 2.2 Canonicalization Rules (restaurant)

Normalize each resolved restaurant name into a canonical string to avoid duplicates:

- Lowercase everything.
- Drop all trailing neighborhood/borough/location suffixes (e.g., `les`, `chelsea`, `soho`, `ucl`, `midtown`, `queens`). Do not keep them even when the text contrasts multiple branches—emit only the core brand tokens. Location context is preserved in `restaurant_surface` for auditing.
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
- Chains and multi-branch brands: Always emit the location-free canonical form (e.g., "mcdonalds"), even if the written variant includes a neighborhood/city token. The raw location text still lives in `restaurant_surface`. See 2.5 for scoring tie-breakers.
- When several surviving variants remain after unification, defer to the canonical selection scoring in 2.5 to choose the one to keep.

### 2.4 Ambiguity & Safety

- This step does not skip in normal cases. If a canonicalization conflict cannot be unified using 2.2 and 2.5 (e.g., two non-equivalent observed variants assert different canonicals for the same place), apply canonical selection rules (2.5) to choose one. Step 1 has already resolved references; only pathological conflicts should remain.
- Never emit placeholders like "unknown restaurant", "that place", or partial names without a clear brand token.

### 2.5 Canonical Selection (scoring)

When multiple observed variants exist for the same establishment in this input, pick one canonical from those observed variants, then stick to it:

- Variant gathering: Consider only name variants present in the in-scope text; normalize variants per 2.2. Never synthesize a new form.
- Scoring criteria (apply in order):
  - Completeness: prefer names that include full brand tokens (e.g., "katz's delicatessen" over "katz's") when unambiguous.
  - Disambiguation: stick to the core brand tokens even when multiple branches are referenced; do not append neighborhood/location descriptors. Mention-level surfaces and context handle disambiguation.
  - Generic-suffix trimming: when two observed variants share the same leading brand tokens and one only differs by appending a generic cuisine/service term (e.g., `korean bbq`, `hot pot`, `ramen`, `bbq`, `steakhouse`, `cafe`, `bakery`, `diner`), prefer the tighter brand-only form as long as that shorter variant also appears in this input. If the shorter form never appears, keep the longer one intact.
  - Specificity over brevity: prefer the more informative name if unambiguous in context.
  - Tie-breakers: higher frequency in this input's text; if still tied, prefer the longer informative token set.
- Canonical output: For all mentions of the same place within this post, emit `restaurant` as the chosen canonical and stick with it. Avoid emitting multiple normalized names that are token-subsets of one another for the same establishment.

### 2.6 Examples

- Post: "Best tacos at Nixta?" -> canonical `restaurant: "nixta"`.
- Comment: "Franklin is insane. Their brisket slaps." (thread clearly about Franklin BBQ) -> unify short form to canonical "franklin bbq" only if "franklin bbq" (or equivalent) appears as an observed variant in this input; otherwise keep "franklin".
- Comment: "Nixta was packed last night." (no observed "nixta taqueria" etc. in this input) -> keep canonical as "nixta".
- Comment: "Yafa Deli\nCrispy Burger" (reply to "Where should I eat?") -> two restaurants: "yafa deli" and "crispy burger".

### 2.7 Surface Preservation

- Record the exact string as written in the source before any canonicalization.
- Emit it in `restaurant_surface`, and mirror the approach for associated food (`food_surface`), categories (`food_category_surfaces`), and attributes (`restaurant_attribute_surfaces`, `food_attribute_surfaces`).
- Surface fields are one-to-one with their canonical counterparts and stay untouched by the normalization rules above. They exist solely so downstream services can attach aliases or audit the LLM’s transformations.

## Step 3: Entity & Attribute Classification

Scope & Goal

- Scope: Identify entity types in the current comment and classify modifiers as `restaurant_attributes` and `food_attributes`. Do not compose `food` or decide item/category/emission here.
- Goal: Produce normalized attribute arrays and a clean set of food substance tokens for composition.

Inputs & Dependencies

- Inputs: current comment text; in-scope context (title/body per `extract_from_post`, parent/earlier lines) for implicit references; `canonicalRestaurants` (Step 2) for disambiguation.
- Dependencies: Global Principle depth-aware reference resolution (applies to food/attribute references when implicit in the current comment).

Outputs

- `classifiedAttributes: { restaurant_attributes: string[] | null, food_attributes: string[] | null }` - normalized, comment-scoped attribute arrays for reuse across mentions.
- `foodTokensClean: string[]` - food substance tokens (attributes removed) to be used as inputs to Step 4 composition.
- `attributeLinks: Array<{ restaurant: string, food: string | null, restaurant_attributes: string[], food_attributes: string[] }>` - mention-level linkage objects that point each attribute to the restaurant->food pair(s) it modifies.

### Execution order summary (apply after reading 3.1-3.7)

1. Surface candidate food spans and modifiers in the current comment.
2. Apply the Attribute Exclusion Principle (3.2) so attributes are separated from food substance tokens.
3. Resolve implicit references (definites, pronouns, deictics) to nearby anchors using the depth-aware order.
4. Classify remaining tokens into restaurant vs food vs attribute.
5. Normalize (lowercase, dedupe, natural singular) and emit `classifiedAttributes`, the cleaned food tokens for composition, and the `attributeLinks` map for downstream steps.
   Outcome: `classifiedAttributes`, `attributeLinks`, and `foodTokensClean` ready for Step 4 and Step 6

### 3.0 What food language is (read first)

Every food-related word in the comment answers to one question — **"Could you say this word to a server as the thing you want to ORDER?"**

- **YES → it is FOOD.** The single most specific orderable order-name is `food` (e.g. "chicken tikka masala", "fried chicken sandwich"). The broader **edible nouns it rolls up into** are `food_categories` (e.g. "curry", "sandwich", "dessert") — parents of the dish, never properties of it. Food and categories are the same kind of thing at different altitudes: both name something you could order.
- **NO → it is a `food_attribute`.** A property telling you what the food is LIKE, or what tradition or occasion it belongs to: sensory/diet ("spicy", "crispy", "vegan"), **cuisines** ("indian", "peruvian"), and **styles / meal-periods** ("comfort food", "street food", "breakfast").

**The tell:** `food` and `food_categories` answer _"what did you order?"_; a `food_attribute` answers _"what is it like / what tradition or occasion does it belong to?"_ "Indian" is never what you ordered — you ordered "chicken tikka masala", which _is_ indian.

This single distinction governs everything in Step 3 and Step 4. The corollaries below follow from it directly:

- **(a) A cuisine attaches on BOTH sides, always.** A cuisine is a property of the dish (`food_attribute`) AND a property of the place (`restaurant_attribute`). It is never an either/or — emit it in both arrays.
- **(b) Infer the cuisine from the dish's identity even when unstated.** A named dish carries its tradition with it: "tikka masala" → "indian", "lomo saltado" → "peruvian", "banh mi" → "vietnamese". Attach the inferred cuisine on both sides even when the comment never says the cuisine word.
- **(c) A dish exists only when an orderable item is named.** If the comment names no orderable item, `food` and `food_categories` are null and the mention is restaurant-only — the cuisine/style still lands as an attribute (and a bare style with no dish is kept whole on `restaurant_attributes`; see 3.5).
- **(d) Praise is an INDEPENDENT axis.** Composing a dish neither creates nor suppresses `general_praise`, and endorsing a place neither creates nor suppresses a dish. Quality lives on its own axis (Step 6); food language lives here.
- **(e) Preparation words stay in `food` when they name the order.** "fried chicken sandwich" is the whole order-name → it all stays in `food`. A preparation word becomes an attribute only when the dish is the same order without it: "grilled burger" is the same order as "burger", so "grilled" peels off as an attribute.

### 3.1 Candidate harvesting

- Parse the current comment for nouns/noun phrases that could represent food items, restaurant descriptors, or attributes.
- Include inherited anchors from the parent/post when the current text uses pronouns or ellipsis.
- Keep the raw span plus any leading modifiers so the next step can decide which tokens stay with the dish vs peel off as attributes.

### 3.2 Attribute Exclusion Principle

Before handing tokens to composition, peel away modifiers that are attributes (properties per 3.0) and keep the tokens that name the order.

- **Peel off properties**: sensory and texture terms ("spicy", "crispy", "smoky"), dietary labels ("vegan", "gluten free"), cuisines ("indian", "thai" — these become attributes on both sides per 3.0(a)), styles and serving periods ("comfort food", "street food", "breakfast"), and standalone preparation words whose dish is the same order without them ("grilled" from "grilled burger"). Each of these answers "what is it like / what tradition does it belong to?", so each belongs in an attribute array, not with the food tokens.
- **Keep the order-name whole**: retain every word that is part of what the diner would say to order — proteins, dish types, and preparation words that name the order ("fried chicken sandwich" stays whole; "carnitas taco" keeps "carnitas"). If removing the word would change what you ordered, it stays with the food tokens.
- Keep a multi-word modifier together ONLY when the whole phrase is a generic, ingredient-free property ("house-made", "very spicy", "gluten free"). When a modifier is tied to a specific ingredient or component ("brown butter sauce", "rich broth", "toasted garlic"), peel off only the generic property word if any ("rich", "toasted") and leave the ingredient/component with the dish tokens — the ingredient names part of the dish, so it composes in Step 4 rather than becoming an attribute.
- Treat generic filler nouns ("food", "foods", "meal", "dish", "the food", "restaurant", "place", "spot") as noise — they name nothing orderable and describe no property, so drop them from foods, food_categories, and attributes alike.

Examples:

- "spicy ramen" → attribute "spicy"; food tokens keep "ramen".
- "breakfast burrito" → attribute "breakfast"; food tokens keep "burrito".
- "fried chicken sandwich" → NO "fried" attribute; the whole phrase names the order, so "fried chicken sandwich" stays with the food tokens.
- "grilled burger" → attribute "grilled"; food tokens keep "burger" (same order without the word).
- "house-made carnitas taco" → attribute "house-made"; food tokens keep "carnitas taco".
- "chicken tikka masala" → attribute (cuisine) "indian" on both sides per 3.0(a)–(b); food tokens keep "chicken tikka masala".
- "rich broth ramen" → NO "rich broth" attribute; "broth" stays with the dish; emit "rich" only if the text frames it as a quality.

### 3.3 Entity types

- `restaurant`: named establishments (e.g., "hui", "franklin bbq", "joe's pizza").
- `food`: the single most specific **order-name** — the exact thing a diner would say to a server to order it (e.g., "ramen", "sesame noodles", "duck carnitas tacos", "chicken tikka masala"). One `food` per restaurant→food connection.
- `food_categories`: the broader **edible nouns the `food` rolls up into** — parents of the dish, themselves orderable (e.g., "curry", "sandwich", "dessert"). Same kind of thing as `food`, at a higher altitude; never properties.
- `food_attribute`: a **property of the food** — what it is like or what tradition/occasion it belongs to (sensory, diet, preparation-as-property, cuisine, style, meal-period). Connection-scoped.
- `restaurant_attribute`: a **property of the restaurant** — what the place is like (setting, ambiance, service, price, cuisine, style). Restaurant-scoped.

### 3.4 What Qualifies as an Attribute (the bar)

An attribute is a **filterable property** (per 3.0, an answer to "what is it like / what tradition or occasion does it belong to?"): a reusable axis-plus-value a diner could search or filter by (diet, preparation-as-property, texture, flavor, temperature, portion, setting, amenity, service style, timing, price level, **cuisine**, **style/meal-period**).

**The decisive test — describes vs. judges.** A real attribute states a property the food or place objectively **HAS** (what it _is_ or what tradition it belongs to). Praise states **HOW GOOD** it is (a judgment of quality or enjoyment). Only descriptions are attributes; judgments are never attributes, no matter how food-flavored they sound.

- `spicy`, `crispy`, `smoky`, `grilled`, `vegan`, `cozy`, `outdoor seating`, `indian`, `comfort food` → describe properties or traditions → attributes.
- `delicious`, `tasty`, `amazing`, `incredible`, `insane`, `bonkers good`, `solid`, `best`, `elite`, `top notch`, `quality`, `high quality`, `specialty`, `favorite`, `well crafted`, `standout` → judge how good → **NOT attributes. Drop them.**
- Accolades and recommendation language judge worth, not properties — also drop: "award winning", "worth the trip", "must-try", "hidden gem", "iconic", "famous", "world class".
- Watch for this: the very praise that made this comment eligible in Step 1 ("the brisket is _delicious_") is what feeds `general_praise` (Step 6) — it must NOT also become a food_attribute. Extract the description ("smoky", "tender"), never the verdict ("delicious", "the best").
- When in doubt, ask: could the same word describe a _bad_ dish? "spicy" yes (a dish can be badly spicy) → attribute. "delicious"/"amazing" no (they only mean good) → praise, drop.

Other non-attributes:

- **Ingredients and ingredient-bound phrases.** A bare ingredient ("mayo", "coconut", "basil") OR a property welded to a specific ingredient/component ("rich broth", "toasted garlic", "brown butter", "vodka sauce", "thick layers", "tempered chocolate") describes _this dish's makeup_ → it belongs in food composition (Step 4), not an attribute. Extract only the generic, ingredient-free property if one applies ("rich", "toasted") and send the ingredient/component to the dish; otherwise drop. Dietary/sourcing _claims_ remain attributes ("vegan", "gluten free", "organic", "grass-fed") — diners filter by them.
- **Dish roles / courses.** "side", "main", "appetizer", "palette cleanser", "dessert"-as-course name where a dish sits on the menu, not a property of it — do not emit as attributes.
- **Ambiguous, context-stripped fragments.** A word that asserts no clear property on its own once removed from its sentence ("medium", "regular", "classic service", "sat only") — if you cannot say what it filters by without guessing, drop it rather than emit a fragment.
- **Complaints / negative-quality.** The app recommends, so attributes are things a diner filters FOR. Drop criticism ("grumpy staff", "overpriced", "terrible acoustics", "rushed", "inefficient", "too loud"). Keep neutral states even when phrased as a negation ("not crowded", "no wait", "cash only").
- **Over-specific, single-use phrases.** An attribute must be reusable across many dishes or places. If only one dish/restaurant could ever have it ("korean-french tasting menu", "63rd floor roof bar", "basted in herby butter", "cocktails in early evening"), strip it to the reusable core ("tasting menu", "rooftop") or drop it.

**Cuisines and dish/format types split by the 3.0 test:**

- **Cuisines** ("thai", "turkish", "afro-caribbean", "indian") answer "what tradition does it belong to?" → they are **attributes**. A cuisine attaches on BOTH sides (a `food_attribute` on each dish it names AND a `restaurant_attribute`), inferred from the dish's identity even when unstated (per 3.0(a)–(b)).
- **Dish / format types** ("dim sum", "hot pot", "kbbq") name an orderable thing — you could say them to a server as what you want to order → they are **FOOD**. Keep them in the food tokens and send them to Step 4 composition; do not emit them as attributes.

### 3.5 Scope Determination Principle

Most properties describe **either** the dish **or** the place, and scope follows what the property describes, not where the word sits in the sentence. Cuisines and styles are the exception — they can attach to both sides at once.

- **Dish property → `food_attribute`**: anything that could appear in a menu-item description — preparation-as-property ("grilled", "house-made"), texture ("crispy", "creamy"), flavor ("spicy", "smoky"), temperature, portion ("generous portions", "shareable"), dietary ("vegan", "gluten free").
- **Place property → `restaurant_attribute`**: anything that would stay true if the menu changed — setting/physical ("patio", "rooftop", "view"), ambiance ("romantic", "cozy", "lively"), service model ("counter service", "fine dining"), operational ("BYOB", "reservations required", "takeout friendly"), group fit ("family-friendly", "date night spot"), **price/value ("cheap", "good value", "expensive", "mid-tier")**, and **accessibility**. Price talk about a specific dish is still a place-level signal — scope it to the restaurant.
- **Cuisines attach on BOTH sides, always.** A cuisine is a property of the dish AND of the place, so it goes in `food_attributes` on every dish it names AND in `restaurant_attributes` — never an either/or. Infer it from the dish's identity even when unstated: "chicken tikka masala" → `food_attributes: ["indian"]` on that dish AND `restaurant_attributes: ["indian"]`. This holds even when the dish's inferred cuisine differs from the venue's stated cuisine: tacos ordered at a Korean spot give the dish `food_attributes: ["mexican"]` and add "mexican" to `restaurant_attributes` **in addition to** "korean".
- **Styles and meal-periods are attributes.** Styles ("comfort food", "street food", "home-style") and meal-periods ("breakfast", "brunch", "lunch", "dinner", "late-night", "happy hour", "tasting") are properties. When tied to a dish they are `food_attributes`, so time-of-day and style variants collapse onto one dish (`food: "prix fixe"`, `food_attributes: ["lunch"]`; `food: "burrito"`, `food_attributes: ["breakfast"]`). When they describe the place ("great happy hour", "open late") they are `restaurant_attributes`. **A style named with no dish** ("great comfort food here", no orderable item) lands whole on `restaurant_attributes` (`["comfort food"]`) so the place stays searchable — keep the phrase intact.

### 3.6 Attribute Emission Gate

Before placing ANY term in `food_attributes` or `restaurant_attributes`, run the 3.4
describes-vs-judges test on it one more time. If the term judges how good something is
(praise/evaluation), or is a bare ingredient or vague filler, **drop it** —
do not emit it on either side. This gate overrides harvesting: it is correct to emit an empty
attribute array for a glowing comment whose only modifiers were praise. A cuisine or style is
a real property — it passes this gate and is emitted on both sides per 3.5; a dish/format type
is FOOD (3.4), so it never reaches an attribute array in the first place.

- Keep modifiers that truly define the dish (e.g., "fish sauce wings") with the food tokens;
  only peel off modifiers that pass the 3.4 bar.
- When multiple real attributes apply, include each one separately so downstream systems can
  match on any of them.

### 3.7 Normalization & Outputs

- Lowercase everything; use natural singulars when it preserves meaning ("noodles" -> "noodle" is awkward, keep plural).
- Deduplicate within each attribute list so each attribute appears at most once.
- Emit `foodTokensClean` as the remaining food substance terms in reading order; these feed Step 4 composition.

### 3.8 Mention-level Attribute Linking

- Emit one `attributeLinks` entry per restaurant->food connection using the normalized strings from `classifiedAttributes`. Include a `food: null` entry only when the restaurant attribute explicitly belongs on that particular mention (e.g., a standalone restaurant sentence). Do not create entries for mentions that never referenced the attribute.
- Attach restaurant attributes only to the mentions whose text supports them, and attach food attributes only to the dish (restaurant->food pair) they modify. When the text clearly scopes an attribute to multiple dishes or mentions, create a separate link for each affected pair.
- Example: "Nixta's duck carnitas tacos are incredibly rich, Suerte's version is smoky, and Nixta's patio is gorgeous." -> emit one entry per restaurant->food pair, plus a restaurant-only entry just for the patio sentence:

```json
[
  {
    "restaurant": "nixta",
    "food": "duck carnitas tacos",
    "restaurant_attributes": [],
    "food_attributes": ["rich"]
  },
  {
    "restaurant": "suerte",
    "food": "duck carnitas tacos",
    "restaurant_attributes": [],
    "food_attributes": ["smoky"]
  },
  {
    "restaurant": "nixta",
    "food": null,
    "restaurant_attributes": ["patio"],
    "food_attributes": []
  }
]
```

Step 6 will merge the matching entry (same canonical `restaurant` + `food`) with any restaurant-level entry before populating mentions, keeping the normalized strings intact.

## Step 4: Food Term Composition

Scope & Goal

- Scope: From the current comment's food language, compose a dish for each restaurant->food connection (`food` + `food_categories`) without ingredient fan-out. Do not decide item vs category or emission.
- Goal: Produce stable food terms for Step 5. When food/attribute references are implicit (definites/pronouns/deictics), resolve them to nearby food/attribute anchors using the Global Principle's depth-aware order.

Inputs & Dependencies

- Inputs: current comment text; `foodTokensClean` (Step 3); resolved/canonical restaurant context from Steps 1-2 for disambiguation; in-scope context (title/body, parent/earlier lines) for food/attribute reference resolution when needed.
- Dependencies: Global Principle depth-aware reference resolution (applied to food/attributes when the current comment's food reference is implicit); classification outputs from Step 3.

Outputs

- `composedFoods: Array<{ restaurant: string, food: string, food_categories: string[] }>` - one or more composed dish objects (each tied to a canonical restaurant) for Steps 5-6.

### Execution order summary (apply after reading 4.1-4.5)

1. Start from `foodTokensClean` (Step 3) and confirm the dish is tied to the correct canonical `restaurant` when context is implicit.
2. Compose a single `food` using the head food noun plus identity-changing specifiers; avoid ingredient fan-out.
3. Build concise `food_categories` (orderable parent dish classes ONLY — never ingredients, flavors, or serving formats), deduped and singular where natural.
4. Validate invariants (readable name, aligned categories) and emit `composedFoods` entries, each carrying the linked `restaurant`, for Steps 5-6.
   Outcome: structured `food` with complementary `food_categories` for use in Steps 5-6

### 4.1 Connection-Level Composition Principle

Represent each restaurant->food connection as one composed dish. Do not emit separate mentions for component ingredients or related nouns — a dish is ONE mention. Component ingredients are not categories either: they are dropped unless they independently name an orderable dish class (4.3).

- Carry forward the canonical `restaurant`; the backend maps names to deterministic IDs.

### 4.2 `food` Construction Algorithm

Run this procedure for each composed dish after Step 3 cleansing:

0. Confirm an orderable order-name exists (base case).
   - Ask the 3.0 question of the remaining food tokens: "Could you say this to a server as the thing you want to order?" If nothing does — the comment named a cuisine, a style, a property, or filler but no orderable item — there is **no dish**: leave `food` and `food_categories` null and let the cuisine/style land as an attribute (3.5). Do not manufacture a `food` from a cuisine or style word.

1. Anchor the head dish noun phrase.
   - Identify the noun chunk the diner would speak when ordering.
   - If the phrase ends with a generic classifier (wrap, taco, sandwich, roll, burger, pasta, soup, salad, pizza, bowl, plate, toast, skewer, snack, grain bowl, noodle, dumpling, bao, bun, slider, fry, sando, lavash, arepa, etc.), keep it attached to the specific head words for now; it can be trimmed later when building categories.
   - When the specifier trails the head (e.g., "pho tai", "ramen abura soba"), keep the head noun inside the phrase — never drop it in pursuit of a shorter form.

2. Attach only identity-defining specifiers.
   - Retain proteins, broths, or preparation words that **name the order** and change the dish identity ("duck carnitas taco", "tonkotsu ramen", "fried chicken sandwich"). A preparation word stays in `food` when it is part of what you would say to order; it becomes an attribute (Step 3) only when the dish is the same order without it ("grilled burger" → `food: "burger"`, attribute "grilled").
   - Do not reattach modifiers already exported to `food_attributes` in Step 3.
   - For additive clauses introduced by "with/and", keep the core dish as `food` and DROP the additive list items — they are components of this dish, not categories (4.3).

3. Sanity-check the phrase.
   - Ask: "Would this exact wording appear on a menu?" If not, peel a modifier until it does while keeping the head noun intact.
   - Confirm the remaining phrase is still an orderable dish rather than a single ingredient. If you end up with a lone ingredient, keep the broader dish for `food` and drop the ingredient — a lone ingredient is neither a dish nor a category.

4. Normalize.
   - Lowercase, singularize where natural (avoid awkward singulars that reduce clarity), and keep punctuation minimal.

Self-check examples:

- Good: "tuna melt sandwich" → `food: "tuna melt sandwich"` (guests order it verbatim).
- Good: "fried chicken sandwich" → `food: "fried chicken sandwich"` (the preparation word names the order; no "fried" attribute).
- Avoid: "melt sandwich" (dropped the anchor noun) or "spicy tuna" (attributes crept back in).
- Good: "south indian filter coffee" → `food: "filter coffee"` with `food_attributes: ["south indian"]`.
- Good: "pho tai" → `food: "pho tai"` (head-first phrasing keeps the base noun).
- No dish: "great Indian place" → `food: null`, `food_categories: null`; "indian" lands as an attribute on both sides (3.5), the mention is restaurant-only (3.0(c)).

### 4.3 `food_categories` Hierarchy Algorithm

Produce a cascading, high-signal list of categories after locking the `food` phrase. Every entry must pass a STRICTER test than 3.0: it must name a dish class someone could order **by that name alone** as a complete order ("tuna roll", "roll", "soup"). Cuisines, styles, meal-periods, and other properties are attributes, never categories — and **ingredients, flavor descriptors, and serving formats are NOTHING** (not categories, not attributes): "balsamic", "gruyere", "pecan", "ranch", "pepperoni", "sweet and spicy", "buffet", "combo plate" must never appear in `food_categories`. The tell: "I'll have the gruyere" is not a complete order; "I'll have the popover" is. Each category becomes a searchable dish entity downstream — emit only words a diner would search as a dish.

1. Seed with the most specific dish noun.
   - Start with the `food` phrase unless it still includes attribute words; otherwise use the first attribute-free variant (e.g., "tuna roll" instead of "spicy tuna roll").
   - If no shorter variant exists, keep the single item as the seed.

2. Derive progressive fallbacks.
   - Iteratively remove leading modifiers that remain after Step 3, asking the strict gate question: "Could a diner order the remainder **by that name alone** as a complete order?" Only keep versions that pass — "masa crouton" → neither "crouton" nor "masa" passes (components of a composed dish, not orders); "tuna roll" → "roll" passes.
   - After each iteration, consider trimming a trailing classifier (wrap, taco, sandwich, roll, burger, pasta, soup, salad, pizza, bowl, plate, toast, skewer, snack, grain bowl, noodle, dumpling, bao, bun, slider, fry, sando, lavash, arepa, etc.) when the preceding chunk is dish-like. Treat the list as guidance — if a new tail word functions as a serving format, handle it the same way.
   - Preserve head-first constructions: "pho tai" → `["pho tai", "pho"]`, not `["tai"]`.
   - Stop before the remainder is a lone ingredient; ingredient nouns are dropped entirely (they are components of the dish, not classes it belongs to).

3. Add parent categories (menu-section parents).
   - Use the parent-category rules in 4.4 to add section-level parents (dessert, pastry, coffee, tea, sandwich, soup, etc.) that the dish implies.
   - Add these even when not explicitly stated, but only when the dish clearly belongs to that section.

4. Deduplicate, sort by specificity (most specific first). Keep the list concise but do not enforce a hard cap; include all high-signal parent dish classes. Ingredients, flavors, and formats never appear — a peeled component ("tuna" from "tuna roll", "burrata" from a "with burrata" clause) enters ONLY if it independently names a complete orderable dish class in this context (e.g. "tuna" at a sushi bar); default to dropping it.

Self-check questions:

- Does each category name a dish class orderable **by that name alone** (no bare ingredients, flavors, or formats)?
- Does the chain broaden logically without jumping to unrelated attribute-only terms?
- Are cuisines, styles, dietary flags, and meal periods kept in attributes instead of categories?
- Does the list include parent categories when the dish clearly belongs to a menu section?

Example pairs:

- Good: "spicy tuna roll" → `["tuna roll", "roll"]`; avoid `["spicy", "tuna"]` (flavor + bare ingredient).
- Good: "tuna melt sandwich" → `["tuna melt sandwich", "tuna melt", "sandwich"]`; avoid emitting only `["sandwich"]`.
- Good: "south indian filter coffee" → `["filter coffee", "coffee"]` with "south indian" as an attribute.
- Good: "pho tai" → `["pho tai", "pho", "soup"]`.

### 4.4 Parent Category Inference

Goal: ensure dishes carry one or more parent categories when they clearly belong to a common menu section. Parent categories are **orderable edible nouns** (menu sections or dish families), not cuisines, styles, or meal periods.

Rules:

- Add 1-3 parent categories when the dish clearly implies them, even if they are not explicitly stated.
- Parent categories must be food nouns that pass the 3.0 test (dessert, pastry, cake, cookie, ice cream, coffee, tea, sandwich, soup, salad, pizza, taco, burger, noodle, dumpling, rice bowl, etc.).
- Do not add cuisines, styles, meal periods, or service styles (mexican, indian, comfort food, street food, brunch, bbq, happy hour, etc.); those are properties and belong in attributes.
- It is fine to include both dish-family and section-level parents (e.g., "croissant" → "pastry" and "dessert").

Common inference families (non-exhaustive; use judgment and context):

- Desserts & sweets: cake, brownie, pie, tart, pudding, custard, parfait, sundae, sorbet, gelato, ice cream, frozen yogurt -> add "dessert" (and "ice cream" for frozen desserts).
- Pastries & baked goods: croissant, danish, scone, muffin, brioche, strudel, turnover, baklava, macaron, cookie -> add "pastry" (and "dessert" when sweet).
- Coffee drinks: latte, cappuccino, espresso, americano, cold brew, mocha -> add "coffee".
- Tea drinks: chai, matcha, oolong, earl grey, herbal tea -> add "tea".
- Sandwich family: banh mi, torta, hoagie, grinder, sub, hero, panini, po' boy -> add "sandwich".
- Soups & stews: pho, ramen, udon, pozole, menudo, laksa (when brothy) -> add "soup".

Apply these inferences conservatively so categories stay focused and high-signal.

### 4.5 Examples

- "house-made carnitas taco" ->
  - `food`: "carnitas taco"
  - `food_categories`: ["taco", "carnitas"]
  - attributes: ["house-made"]
- "spicy ramen" ->
  - `food`: "ramen"
  - `food_categories`: ["ramen"]
  - attributes: ["spicy"]
- "spicy tuna roll" ->
  - `food`: "spicy tuna roll"
  - `food_categories`: ["tuna roll", "roll"]
  - attributes: ["spicy"]
- "pasta with burrata, chanterelle mushrooms, and pesto" ->
  - `food`: "pasta"
  - `food_categories`: ["pasta"]
  - One mention only; the "with" ingredients (burrata, chanterelles, pesto) are components of this dish — dropped, never categories.
- "chicken caesar salad wrap" ->
  - `food`: "chicken caesar salad wrap"
  - `food_categories`: ["chicken caesar salad wrap", "caesar salad wrap", "salad wrap", "wrap", "caesar salad"]
  - attributes: [] ("chicken" alone is a bare ingredient here, not a dish class)
- Two restaurants, same dish: "Get the carnitas tacos at Nixta and at Suerte." -> emit two `composedFoods` entries with identical `food`/`food_categories` but distinct `restaurant` values so later steps can keep the pairs separate.

### 4.6 Dish Aliases (`food_aliases`)

`food_aliases` is the ONE sanctioned exception to the food-side anti-synthesis law, and it is
deliberately narrow: an alias is an ESTABLISHED, canonical shorthand or expansion for exactly this
dish — a name that would itself appear as the dish's name on a menu and points to nothing but this
dish. Apply the test to the finished canonical `food` phrase (that is why this step sits after
`food_categories`: a parent category is never an alias).

- "bacon egg and cheese" -> `food_aliases`: ["bec"] (established shorthand)
- "barbecue" -> `food_aliases`: ["bbq"]
- "budae jjigae" -> `food_aliases`: ["army stew"] (established co-name for the same dish)
- "carnitas taco" -> `food_aliases`: [] — no established shorthand exists; do not invent one
- "spicy tuna roll" -> `food_aliases`: [] — "tuna roll" is a CATEGORY (broader), never an alias
- "ramen" -> `food_aliases`: [] — most dishes have NO alias; empty is the correct default
- "margherita pizza" -> `food_aliases`: [] — "marg" FAILS the collision half: it more commonly
  means margarita (the drink). An alias that could point at ANY other dish or drink is poison
  for search recall — never bank it, even if this source used it.

Decisive test, BOTH halves required: (1) would this alias appear as a dish name on a menu, and
(2) does it point to nothing but this dish — anywhere in the food world, not just in this thread?
If either half fails or you are unsure, omit it. **An empty list is the expected, correct output
for the vast majority of dishes — there is no credit for producing aliases and no penalty for
producing none.** Never derive an alias by shortening, pluralizing, or translating the name
yourself — only record shorthand the food world already uses. Restaurants never get aliases from
this step.

## Step 5: Menu Item Identification

Scope & Goal

- Scope: Decide `is_menu_item` for each composed dish (or choose restaurant-only) using in-scope context; do not re-split composed dishes or assign `general_praise`.
- Goal: Produce conservative item/category decisions for Step 6 emission.

Inputs & Dependencies

- Inputs: `canonicalRestaurants` from Step 2; `composedFoods` from Step 4; in-scope context signals (local tie, specificity, coherence).
- Dependencies: Respect Step 4 (no re-split); respect Step 2's canonical restaurant names.

Outputs

- `itemDecisions: Array<{ restaurant: string, food: string | null, food_categories: string[] | null, is_menu_item: boolean }>` for use in Step 6. For true restaurant-only recommendations (no dish mention and no inherited ask category), set both `food` and `food_categories` to null with `is_menu_item: false`. For item-specific replies that only name the restaurant, follow the Ask Handling guidance below. Remember: cuisines/dietary flags belong in attributes, not in `food_categories`.

### Execution order summary (apply after reading 5.1-5.4)

1. Aggregate context (local tie, specificity, coherence)
2. Align each decision with the correct `composedFood` entry (matching the canonical `restaurant` and `food` when present) or, for item-specific asks without a dish mention, inherit the ask's target category.
3. Set `is_menu_item: true` only with strong evidence; else category/restaurant-only
4. Respect Step 4.1 (Single-Mention Composition): reuse the composed dish as emitted
   Outcome: decide `is_menu_item` (true/false) or restaurant-only when no clear dish applies

### 5.1 Principles

- Context scope: Use all in-scope text - post title, post body, the current comment, and any earlier text included in this same input/chunk.
- No placeholders: Never emit fabricated or placeholder restaurant names. If the restaurant cannot be resolved with high confidence, skip the mention instead of inventing a name.
- Sentiment alignment: Step 1 ensures there is a positive or recommendatory intent before you reach this step, and Step 6 performs the final positive-only gate. Step 5 should remain neutral - do not override the pipeline with additional sentiment heuristics here, but avoid forwarding obviously negative dish mentions.
- Canonicalization alignment: Within a post, use the single canonical `restaurant` chosen in Step 2. Short forms must align with that canonical name; do not produce multiple variants for the same establishment.
- Food linking: Match `food` and canonical `restaurant` to one of the `composedFoods` produced in Step 4 so downstream steps can merge decisions without guessing.
- Respect Step 4.1: Reuse the composed dish as emitted; do not re-split dishes or ingredients already locked in.

### 5.2 Decision Framework (apply in order)

1. Confirm link to canonical restaurant (from Step 2)
   - If this composed dish has no confirmed link for this source, skip (do not emit placeholders).

2. Confirm composed dish terms (from Step 4)

- Use the `food`/`food_categories` produced by Step 4 as-is (per Step 4.1); do not re-split or re-compose here.
- **Standalone cuisine or style with no orderable noun** ("great Indian place", "the spot for comfort food"): Step 4 produced no dish (`food` null per 4.2 base case). This is **restaurant-only** — set `food` and `food_categories` to null with `is_menu_item: false`; the cuisine/style rides as an attribute (3.5).
- When Step 4 has no composed dish because the reply only names the restaurant in answer to an **item-specific** ask, inherit the ask's target category as `food` and set `food_categories` to a minimal list (e.g., `["burger"]`), with `is_menu_item: false` (see Ask Handling). This inheritance applies to an item-specific dish ask, not to a cuisine/style ask-target (5.4).

3. Assess itemhood evidence (aggregate; do not rely on a single cue)
   - Local tie: Dish and restaurant are linked in the same clause/sentence or an immediately adjacent reference (e.g., "at [restaurant]", "from here", "their/this/that [dish]", clear ordering verbs like "got/ordered/had/tried"). A clear combination suffices; not all signals are required.
   - Specificity: The dish is specific enough that a typical diner could order it without additional specification (e.g., "duck carnitas tacos", "sesame noodles"), not just a broad type ("sushi", "pizza", "shawarma") unless the context makes it specific.
   - Coherence: If earlier text in the same input has already established a dish->restaurant pairing, concise follow-ups (e.g., "the tacos are insane", "this was incredible") may inherit itemhood when unambiguous.

4. Decide outcome (be conservative when uncertain)
   - `is_menu_item: true` when itemhood evidence is sufficiently strong (as above) in the local context.
   - `is_menu_item: false` when the food reference reads as a category or when evidence is weak/ambiguous after aggregating context.
   - Restaurant-only (`food` and `food_categories` null) when the reply lists restaurants without a clear dish, or when the only food language is a standalone cuisine/style.
   - When the source endorses the place **as a whole** (a verdict about the place with no dish object), record that a single restaurant-level connection (`food: null`) is owed for this `(source, restaurant)` — the one mention that will carry the holistic verdict in Step 6. This is one restaurant-level connection regardless of how many dishes the source also names, and it is **not** owed when the recommendation points at a specific dish ("go here for the burger" credits the burger connection, not the place).

### 5.3 Examples

- Specific prepared item (`is_menu_item: true`)
  - "Duck carnitas tacos at Nixta were insane." -> `restaurant`: "nixta"; `food`: "duck carnitas tacos".
  - "Their sesame noodles are fantastic." (thread already about that restaurant) -> `food`: "sesame noodles".
- Category or skip (`is_menu_item: false` or no dish mention)
  - "The sushi roll was pretty good." (no clear restaurant tie in local context) -> either skip, or treat as category if the restaurant is otherwise clearly in scope but the dish remains generic.
  - "Mixed shawarma platter. Maybe add falafel." (no restaurant tie, generic discussion) -> skip.
- Standalone cuisine/style (restaurant-only)
  - "Ravi Kabab is the best Indian in the area." -> `food`: null, `food_categories`: null, `is_menu_item: false`; "indian" rides as an attribute on both sides.
  - "Go here for great comfort food." (no dish named) -> `food`: null, `food_categories`: null, `is_menu_item: false`; "comfort food" lands on `restaurant_attributes`.
- Mixed sentiment (emit only positive dish)
  - "PSA: the ribs suck. The brisket is good." -> emit "brisket" (positive); do not emit "ribs".
- Inherited itemhood in concise follow-ups (when unambiguous)
  - Post: "Best dishes at Nixta?" Reply: "Duck carnitas tacos." -> itemhood inherited; `is_menu_item: true`.
- Item-specific ask with restaurant-only reply
  - Post: "Best burger in EV?" Reply: "Check out Royale." -> emit `food: "burger"`, `is_menu_item: false`, linked to Royale with the ask's target category.

### 5.4 Notes

- When producing pure restaurant-only recommendations (e.g., "Great patio at X", "best Indian around", "the spot for comfort food"), set both `food` and `food_categories` to null with `is_menu_item: false` so Step 6 can emit a restaurant-only mention while still attaching attributes.
- When inheriting an **item-specific dish** ask's target category, supply that term as `food`, keep `food_categories` minimal, and leave `is_menu_item: false`.
- **Cuisine/style ask-target guard.** The ask-inheritance above applies only to an orderable dish ask ("best burger?" → inherit "burger"). When the ask targets a **cuisine or style** ("best Indian?", "where for comfort food?") and the reply only names the restaurant, do NOT inherit it as `food` — a cuisine/style is not an order-name. Leave `food`/`food_categories` null (attribute side only) and emit restaurant-only.
- When multiple dishes tie to the same restaurant in one source, emit one `itemDecisions` entry per distinct `food`.
- A holistic endorsement of the place is carried by a single restaurant-level connection (`food` and `food_categories` null) per source. When the source names dishes and also endorses the place overall, keep each dish as its own decision and add exactly one restaurant-level entry to hold the holistic verdict; do not multiply it across the dishes. A dish-directed recommendation ("go here for the X") is not a holistic endorsement — it credits the X connection and adds no restaurant-level entry.

### Ask Handling (item-specific replies)

- Trigger when Step 1.3 identifies that the current source replies to an item-specific **dish** ask (the ask targets an orderable order-name, e.g. "best burger?") and the reply itself does not supply a dish mention.
- Step 5: create an `itemDecisions` entry tied to the restaurant with `food` set to the ask's target category, a minimal `food_categories` list (e.g., `["burger"]`), and `is_menu_item: false`. This preserves the category context without fabricating a dish.
- Step 6: emit the mention as a restaurant→food connection using that inherited category, `general_praise: false`. When the reply **also** endorses the place holistically (a verdict about the place itself, not the dish), that verdict rides the single restaurant-level (`food: null`) connection per 6.1 — not the inherited dish connection. Keep the food fields populated (do not null them out).
- Only apply this inheritance when the reply itself contains a positive quality/recommendation cue per 1.3; otherwise skip the source.
- **Cuisine/style asks do not inherit.** When the ask targets a cuisine or style ("best Indian?", "where for comfort food?") rather than an orderable dish, do not inherit it as `food` — it is a property, not an order-name. Emit restaurant-only with `food`/`food_categories` null; the cuisine/style rides on the attribute side (3.5).

## Step 6: Sentiment & Output Assembly

Scope & Goal

- Scope: Confirm the holistic verdict, set `general_praise` on the single restaurant-level connection that carries it, respect the final positivity constraints, and assemble the JSON mentions; do not re-resolve references or re-split composition (see Step 4.1).
- Goal: Emit one high-quality mention per valid connection — with canonical restaurant fields (Step 2), composed food (Step 4), and item/category decision (Step 5) — and exactly one `general_praise: true` per endorsed `(source, restaurant)`.

Inputs & Dependencies

- Inputs: `canonicalRestaurants` (Step 2), `classifiedAttributes` + `attributeLinks` (Step 3), `composedFoods` (Step 4), `itemDecisions` (Step 5), and in-scope sentiment signals.
- Dependencies: General Praise & Emission Rules (6.1); Field Population Rules (6.2); Output Format (6.3).

Outputs

- `mentions: Array<...>` - final JSON objects for downstream consumers.

### Execution order summary (apply after reading 6.1-6.4)

1. Confirm `general_praise` using 6.1 and ensure the positivity rules are satisfied
2. Assemble one mention per valid connection with: canonical `restaurant` (Step 2); attribute arrays from Step 3; composed `food`/`food_categories` (Step 4); `is_menu_item` (Step 5); and required source fields
   Outcome: one consolidated, high-quality mention per valid connection, ready for downstream processing

### 6.1 General Praise & Emission Rules

- **Praise is an independent, restaurant-level axis (governing rule).** `general_praise` records whether the source **endorses the place overall**, judged by the quality signal defined in 1.3 (firsthand or consensus, positive, and landing on the option the source endorses). Composing a dish neither creates nor suppresses it, and endorsing a place neither creates nor suppresses a dish (3.0(d)). Because the verdict is about the whole place, it is a single fact per `(source, restaurant)`.
- **Holistic means the object is the place, not a dish.** A holistic verdict targets the place itself ("this place is amazing", "this is the spot", "a must", "you can't go wrong here", or a bare "go to Royale"). A recommendation whose object is a specific dish ("go here **for the burger**", "get the X") is **not** holistic — it credits the dish connection, and `general_praise` stays `false`. The dish's endorsement is the connection itself (3.0(d)).
- **One holistic verdict, one carrier.** When the source endorses the place overall, set `general_praise: true` on the single restaurant-level connection for that `(source, restaurant)` — the `food: null` mention seeded in Step 5, or, when the source named only dishes, one `food: null` mention added here to hold the verdict. Every dish→restaurant mention keeps `general_praise: false`. This yields exactly one `general_praise` no matter how many dishes the source praises.
- **Neutral mentions.** A neutral, non-endorsing aside sets nothing; the connection stands on its own with `general_praise: false`. Two shapes that are NEVER endorsements on their own: (1) **bare availability** — "X has Y", "they also do X", "you can get Y at X" states existence, not quality; (2) **popularity/busy-ness anecdotes** — "they're slammed", "busy slanging a shitload of tacos", "there's always a line" describe traffic, not the speaker's verdict. Both require an explicit quality signal elsewhere in the same source before any `general_praise: true`.
- **Non item-specific listings**: When the comment is limited to one or more restaurant names (plus simple connectors like commas, "and", "or", " / ", "try", "go to"), treat it as a holistic endorsement of each named place — carry `general_praise: true` on that place's single restaurant-level connection. If additional text introduces statements unrelated to food/restaurant quality, skip.
- **Item-specific replies**: When the reply ties a dish to the restaurant, apply the normal item vs category rules; the dish mention stays `general_praise: false`. A holistic endorsement of the place — one whose object is the place, not the dish — additionally carries `general_praise: true` on the single restaurant-level connection. When the reply only names the restaurant, follow "Ask Handling (item-specific replies)" to inherit the category; the inherited connection carries the holistic verdict only when the place itself is endorsed.
- **Restaurant-only attributes**: A positive attribute without a holistic verdict ("great patio") emits a restaurant-only mention with `general_praise: false`. If neither an attribute nor a holistic verdict is present, skip the mention.
- **Mixed cues**: Emit only the positive connections. Set `general_praise: true` only when the place itself is endorsed in the local context; a positive dish alongside silence about the place leaves `general_praise` unset. Pure chatter (price, wait, ads) sets nothing.
- **Inherited short replies**: Short affirmations ("+1", "agreed", "this") inherit the parent's holistic verdict when the referent is unambiguous — carry it on the single restaurant-level connection. An elliptical/definite reply ("the sundae is the best") inherits the restaurant as a dish connection (`general_praise: false`); a holistic verdict present locally rides that place's one restaurant-level connection.
- **One praise carrier.** `general_praise` lives only on the single restaurant-level (`food: null`) connection; it never rides a dish mention, and it is never repeated across dishes. When a source both names dishes and endorses the place, the dish mentions capture the dish connections and the one restaurant-level connection carries the verdict.

### 6.2 Field Population Rules

For every mention, populate fields as follows:

- Restaurant
  - `restaurant`: canonicalized per Step 2.
  - `restaurant_surface`: the exact string observed in the source before canonicalization.
  - `restaurant_attributes`: array of restaurant-scoped attributes (or omit/null if none).
  - `restaurant_attribute_surfaces`: array aligned with `restaurant_attributes`, preserving the original attribute tokens before normalization.
- Food (optional)
  - If a food is present: set `food` from the aligned `composedFood` (Step 4) or, when inheriting an ask's target, from the category supplied in Step 5. Pair it with `food_categories` from the same source (Step 4 or the inherited list in Step 5)—these must stay orderable dish nouns—and apply the `is_menu_item` decision from Step 5.
  - `food_surface`: exact source string for the composed dish/item.
  - `food_category_surfaces`: array aligned index-for-index with `food_categories`, preserving the surface tokens.
  - `food_aliases`: established shorthand for exactly this dish per 4.6 (empty for most dishes).
  - If no food (and no inherited ask category): set `food`, `food_categories`, and `is_menu_item` to null (or omit when allowed by schema). Item-specific asks that only yield a restaurant still count as having food data via the inherited category, so do not null them out.
- Attributes
  - Populate `food_attributes` with the array from the matching `attributeLinks` entry in Step 3 (same canonical `restaurant` and `food` null vs populated). Omit or set to null when none.
  - The strings must stay identical to the normalized values in `classifiedAttributes`.
  - Emit `food_attribute_surfaces` aligned with `food_attributes`, capturing the original modifiers.
  - Do not broadcast restaurant-level attributes to every mention. Only merge the `food: null` entry when this specific mention was linked to it in Step 3. If the resulting mention has no food fields, no attributes, and `general_praise` remains false, skip emitting it.
- Core flags
  - `general_praise`: boolean per 6.1 — `true` only on the single restaurant-level (`food: null`) connection that carries the holistic verdict, `false` on every dish connection.
- Source attribution
  - `source_id`: copy the exact `id` value from the input payload for this mention.
    - For post-derived mentions (only when `extract_from_post: true`): use that post's full canonical ID in fullname format (for example `t3_abc123`).
    - For comment-derived mentions: use that comment's full canonical ID in fullname format (for example `t1_def456`), even when sentiment/entities are inherited from the parent.
    - Preserve the `t3_` / `t1_` prefix exactly; do not shorten, strip, or reformat the ID.

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
"restaurant": "nixta",
"food": "duck carnitas tacos",
"food_categories": ["tacos", "carnitas"],
"is_menu_item": true,
"food_attributes": ["rich"],
"restaurant_attributes": null,
"general_praise": false,
"source_id": "t1_def456"
},
{
"restaurant": "suerte",
"food": "duck carnitas tacos",
"food_categories": ["tacos", "carnitas"],
"is_menu_item": true,
"food_attributes": ["smoky"],
"restaurant_attributes": null,
"general_praise": false,
"source_id": "t1_def456"
},
{
"restaurant": "nixta",
"food": null,
"food_categories": null,
"is_menu_item": null,
"food_attributes": null,
"restaurant_attributes": ["patio"],
"general_praise": true,
"source_id": "t1_def456"
}
]
}
