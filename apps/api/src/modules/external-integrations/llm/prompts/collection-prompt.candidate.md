# Crave: Extracting Food Claims from Community Text

## What you are extracting

**A CLAIM is: someone who has eaten X at Y, saying something about it.**

That sentence is the whole job. Four things must each be the RIGHT KIND for a
claim to exist, and you must test each one explicitly. Text that looks right
but is the wrong kind is the single largest source of bad data — a trip plan
looks like a recommendation, a supermarket looks like a restaurant, a format
looks like a dish, and a comparison looks like a property.

**THE FOUR TESTS.** Learn these by name; the steps below refer to them by name.

1. **THE TESTIMONY TEST** — _Has the writer eaten it?_
   A claim is a report of experience. Planning, asking, announcing, listing,
   and repeating what others say are not experience.
2. **THE PLACE TEST** — _Is this claim about food prepared and served by this
   place, to eat now?_ Not goods sold packaged to take home and prepare later.
3. **THE ORDER TEST** — _Could you say this to a server as the thing you want?_
   and **THE PREDICTION TEST** — _If a diner names only this word, do you know
   anything about the food that arrives?_
4. **THE STANDALONE TEST** — _Severed from the noun it modified, does this word
   still mean one definite thing?_

A failure at any test ends the work for that claim. Test in order: they run
cheapest-first, and each one protects the tests after it.

---

## Processing loop and scope

- Run the steps below **separately for each source** in the input payload: the
  post body (once, only when `extract_from_post: true`) and every individual
  comment, top-level or nested. Each run emits output only for that source,
  while using surrounding content for context.
- When a source fails a gate, **emit nothing for that source** and continue
  with the remaining items.

**`extract_from_post`**: when `false`, do not emit mentions from the post body.
Still use the post title and body to resolve names in comments. The flag
controls emission from the body only, never the use of context.

**In-scope context**: strictly the text of the POST OBJECT the active source
belongs to — that post's title/body (subject to `extract_from_post`), the
active comment, and parent/earlier lines within that same post's threads. The
payload may contain MULTIPLE independent post objects: **each post is its own
sealed world.** Never resolve references, inherit food/restaurant context, or
unify names across different post objects.

**Depth-aware resolution order**, whenever a step resolves a reference
(pronouns, deictics, definites, possessives, ellipsis, short affirmations):

- Replies: current comment (closest clause first) → parent comment → earlier
  lines in the same post object → that post's title/body.
- Top-level comments: current comment → that post's title/body → earlier lines
  in the same post object.

**Every example in this guide is illustrative.** When an example seems to
diverge from a principle, follow the principle.

---

## Step A — Is there testimony here? (THE TESTIMONY TEST)

Answer one question about the writer: **is this person reporting on food they
have eaten, or doing something else?**

### A.1 What counts as testimony

The writer vouches from experience, or reports a clear consensus:

- Direct verdicts: "it's fantastic", "best cheesesteak I've ever had",
  "their brisket slaps".
- Experience narrated in the past: "went to Sour Duck last Sat", "had an
  incredible meal off the Bunbelly truck", "I had the salmon lox focaccia".
- Indirect recommendation: "worth the trip", "definitely go", "take them to
  \_\_\_", "my go-to".
- Consensus reported: "people rave about \_\_\_", "this sub loves \_\_\_".
- **A recommendation list ANSWERING a request** — a reply that is just names
  ("Pho phong luu, Tan My, Fresh Bowl, Sip Pho if central") is testimony when
  it responds to someone asking where to eat. The writer is putting their own
  judgment behind those names.
- **Asking for feedback on an experience already had IS testimony.** "2026 NYC
  Food Trip Review — how did I do?" reports meals eaten; the question at the
  end does not undo them.
- **A short agreement ADOPTS the parent's testimony as the writer's own.**
  "+1", "this", "agreed", "seconded", "came here to say this" under a parent
  that vouches for a place puts this writer's judgment behind the same
  claims — resolve the referent by the depth-aware order and credit the same
  restaurant (and dish, when unambiguous) from THIS source's id. An agreement
  with an ambiguous referent credits nothing.

### A.2 What is NOT testimony (each of these fails)

- **A PLAN.** The writer has not been yet: "Headed to Austin at the end of the
  month. Here's our short list", "Please revise my list", "Judge my itinerary",
  "we plan to split things at several of these places". A list of places
  someone INTENDS to visit is a request for testimony, not testimony — no
  matter how much it looks like a recommendation list. **This is the single
  most common false positive; check tense and intent before crediting a list.**
- **AN ASK.** The request itself never emits, whether or not it names places.
- **AN ANNOUNCEMENT or DIRECTORY.** Participant rosters, event line-ups,
  fundraiser lists, "these 12 spots are doing a prix fixe this week", opening
  notices, marketing. Naming many restaurants neutrally is not endorsing them.
- **AVAILABILITY or POPULARITY alone.** "X has Y", "they sell it by the pound",
  "it's always packed", "there's a location on 5th". Stating that food exists,
  or that others go, is not a verdict on it.
  **This holds even when the availability answers the question asked.** A
  "where can I find \_\_\_?" ask makes "Quack's on 43rd has them. Also Epoch
  sells them sometimes" a helpful and RESPONSIVE reply — and still not
  testimony, because the writer said where to get the thing, never that it is
  good. Being the answer to a findability question is not endorsement.
  Responsiveness never substitutes for a verdict: ask what the writer SAID
  about the food, not whether they were helpful.
- **HEARSAY or DESIRE.** "I've heard", "supposedly", "want to try", "never been
  but interested".
- **A MIDDLING OR HEDGED VERDICT.** "it's fine", "solid enough", "6/10", "not
  bad", "perfectly fine", "decent for what it is". These withhold endorsement;
  they are not positive claims.
- **NEGATIVE CONTENT.** Criticism, warnings, "I'd skip \_\_\_", "many of your
  items I would not suggest", or a reply to an explicitly negative ask
  ("worst/avoid/overrated"). Emit nothing.
- **PRICE-ONLY commentary.** "priciest in town", "$100+ steak" with no verdict.
- **A CLOSED PLACE.** "RIP", "closed down", "went out of business", "used to
  go", "who remembers", "back in the day", "I miss \_\_\_" — with no
  contradicting present-tense context. A recommendation for a place that no
  longer exists is not actionable. Places whose status is unstated remain
  eligible; never guess at a closure.

### A.3 Judge each entry on its own verdict

In a ranked, listed, or mixed source, **each restaurant and each dish carries
its own verdict.** A positive verdict on one entry never transfers to another,
and an attribute stated for one never attaches to another. When the writer
weighs options, the endorsement lands on the one they settle on, never on the
one they set aside. A source that is positive overall but names a dish
neutrally does not thereby endorse that dish.

### A.4 Outcome

If nothing in this source passes the TESTIMONY TEST, **emit nothing and move
on.** Otherwise carry forward the specific claims that passed — not the whole
source.

---

## Step B — What place is it? (THE PLACE TEST)

### B.1 Find the names

Gather candidate names from in-scope context in depth-aware order, then decide
each candidate **by how the text uses the span, not by its words.**

**Keep** a span the text frames as the name of a place: proper-noun
capitalization, "The" fronting it as a title, a possessive, a locating tail
("at/on/from \_\_\_"), or a slot in a series of names. Under such a frame the
span denotes a particular establishment, so keep it even when its words are
generic ("The Smith", "Superiority Burger").

**Discard** a span the text uses as a category, dish, or dining format — the
object of a craving, comparison, or description with no naming frame ("just
want good tacos", "love hot pot", "a solid steakhouse"). **A dish phrase is not
a venue** merely because it is capitalized: if a span names a food and carries
no locating tail, possessive, or ordering frame, it is a dish. When a span
could read either way and no naming frame is present, treat it as a descriptor
and discard.

**A name is never split.** Punctuation INSIDE a name is part of it: slashes
("Uchi/ko"), apostrophes ("Joe's"), hyphens ("Tan-Tan"), periods ("LOS TACOS
No.1"), ampersands ("Rudy's Bar & Grill"). Split only on a separator with
whitespace on BOTH sides, and only when each piece independently reads as a
name. "Uchi, Uchiko and Suerte" is three names; "Uchi/ko" is one.

**A misspelling is still a name.** Emit it as written after normalization —
resolution happens downstream. But when the writer disclaims the name itself
("some place called Ravi's or whatever it's called"), the reference is too
uncertain to carry: skip it.

Resolve references (pronouns, deictics, definites, ellipsis) to the nearest
viable anchor. A comment with no explicit name may inherit an anchor from
surrounding in-scope text. **If no anchor survives, or two anchors remain
equally likely, stop — never carry ambiguity forward.**

### B.2 Is the claim about food this place serves?

**THE PLACE TEST: is this claim about food PREPARED AND SERVED BY this place,
to eat now — or about goods SOLD PACKAGED to take home and prepare later?**

This is a test on **the claim, not on the venue.** The same business
legitimately produces both kinds, and the text always tells you which:

- **SERVED (keep)**: "their fish tacos", "the meat pastries from the ladies in
  the windows", "tacos that have no business being as good as they are",
  "potato wedges when they fresh", "their breakfast tacos during breakfast
  hours", "the deli's turkey with pepper bacon".
- **PACKAGED (drop)**: "gets watery when you cook it on the stove", "in the
  chest freezer between the meat and fish counters", "buy a 40 lb bag",
  "store-bought, packaged stuff", "they sell a very light, fresh marinara",
  "get the circulars or check the app for coupons", a linked product page.

A grocery store with a taquería counter yields real claims from the counter and
none from the aisles. A restaurant that sells its sauce in bottles is the
mirror image. **Read the mode of consumption, never the kind of business.**

Also fails the PLACE TEST:

- Claims about a venue whose business is not serving food, where the food is
  incidental and unserved by them (a stadium, a hotel, a museum) — UNLESS the
  claim is about food actually prepared and served there, in which case it
  passes like any other.
- **Landmark-plus-vendor**: when the text names a landmark and a vendor inside
  it, the claim belongs to the vendor.

### B.3 Canonicalize the name

Choose ONE canonical name per establishment, from **observed forms only** —
never synthesize or expand a name with tokens absent from the text, and never
contract a name into an acronym or initialism the text does not use.

Normalize:

- Lowercase everything.
- Drop trailing neighborhood/borough/location suffixes ("les", "chelsea",
  "midtown", "queens"), even when the text contrasts branches — emit only the
  core brand tokens.
- Remove leading articles: "the", "a", "an".
- Collapse repeated whitespace; trim.
- Replace "&" with "and"; remove trailing punctuation that is not part of the
  name; normalize apostrophes away ("joe's" → "joes").
- **Strip a possessive clitic used to attach the name to a dish**: "Nixta's
  duck carnitas taco" yields the name "nixta", so the same venue always
  produces one stable form.
- Keep brand tokens intact ("bbq", "deli", "bakery", "taqueria") and preserve
  multi-word ordering as written.

Unify variants only when safe: identical after normalization, or one is a
strict token-superset of another AND no other anchor shares the subset tokens.
Otherwise keep them distinct.

When several variants survive, choose by: completeness (prefer full brand
tokens, "katz's delicatessen" over "katz's"); prefer the tighter brand-only
form when a longer variant only appends a generic cuisine/service term AND the
shorter form also appears in this input; then frequency; then the longer
informative token set. **Use the chosen canonical consistently for every
mention of that place within the post object.**

Never emit placeholders ("unknown restaurant", "that place") or a partial name
with no brand token.

Examples: "Franklin BBQ" → `franklin bbq`; "The Smith" → `smith`; "Joe's Pizza"
→ `joes pizza`; "Pho & Co." → `pho and co`.

---

## Step C — What was ordered? (THE ORDER TEST)

**Compose the dish BEFORE extracting any properties.** A modifier can only be
judged once you know what it was modifying; peeling first is what turns
"lighter than Jets" into a property called "light".

### C.1 Is there a dish at all?

Ask THE ORDER TEST of the food language: _could you say this to a server as the
thing you want to order?_

If nothing does — the source named a cuisine, a style, a property, or filler
but no orderable item — **there is no dish.** Leave `food` and
`food_categories` null; the mention is restaurant-only and the cuisine or style
lands as an attribute in Step D. **Never manufacture a dish** from a cuisine
word, a style word, or the kind of place it is: a cocktail bar does not thereby
serve a dish called "cocktail", and "great Indian place" names no food.

**A format that fails the PREDICTION TEST is not a dish either, even when the
writer praises it by name.** "It is our newest favorite tasting menu" praises
the venue's offering, but "tasting menu" predicts nothing about what arrives —
there is NO dish and no `food_categories`; the mention is restaurant-only,
the praise is holistic (`general_praise: true`), and the format may ride as a
`restaurant_attributes` entry per Step D. (Formats that PASS prediction —
omakase, dim sum — are dishes and go through Step C normally.)

Drop generic filler outright ("food", "meal", "dish", "the food", "restaurant",
"place", "spot") — it names nothing orderable and describes no property.

### C.2 Build the order-name

1. **Anchor the head dish noun phrase** — the chunk a diner would speak. When a
   phrase ends in a generic classifier (wrap, taco, sandwich, roll, burger,
   pasta, soup, salad, pizza, bowl, plate, noodle, dumpling, bao, bun, fry,
   sando, arepa …), keep it attached for now. When the specifier trails the
   head ("pho tai", "ramen abura soba"), keep the head noun inside the phrase.

2. **Keep every word that names the order.** The governing question: **would
   two diners each ordering "the X" be handed the same thing?** If dropping a
   word would leave the diner needing to specify again, the word STAYS.
   - "fried chicken sandwich" — the whole phrase names the order; keep it all.
   - "carnitas taco", "tonkotsu ramen", "duck carnitas taco" — the specifier
     changes what arrives; keep it.
   - "breakfast taco" — a different order from "a taco"; **never** peel the
     word out (see the PREDICTION TEST in C.3).
   - "grilled burger" — the same order as "burger"; "grilled" is a property and
     will be handled in Step D.

3. **Drop additive components.** For "with/and" clauses, keep the core dish as
   `food`; the listed items are components of this dish, not dishes or
   categories of their own. They may be recorded in `ingredients` (C.5).

4. **Sanity-check.** Would this exact wording appear on a menu? If not, peel
   one modifier until it would, keeping the head noun. If you end with a lone
   ingredient, keep the broader dish instead — a lone ingredient is neither a
   dish nor a category.
   - **A "special" / "deal" / "menu" head must still predict the food.**
     "chicken special" and "nigiri special" predict what arrives — real orders.
     "tuesday special", "lunch deal", "happy hour tasting menu" predict only
     when or how much; **there is no dish.**

5. **Normalize**: lowercase; use the natural singular ("taco", not "tacos";
   but keep "noodles" where the singular is awkward); minimal punctuation.
   **Never reorder tokens** — emit the word order the source used.

**Never emit a truncated or abbreviated food token.** If a word is cut short
("jap" for jalapeño), write the full word or drop it. A truncated token can
land on an unintended and offensive word.

### C.3 Build the categories (THE PREDICTION TEST)

`food_categories` are the broader **orderable dish classes** the `food` rolls
up into. Every entry must pass a STRICTER bar than the ORDER TEST:

**THE PREDICTION TEST — if a diner names only this word, do you already know
something about the food that arrives?**

- **YES → category.** "dessert" (something sweet), "appetizer", "side",
  "snack" (a small dish of known shape), "coffee", "beer", "pastry", "taco",
  "soup" — all categories, even though several also name a course or a time.
  **"breakfast" and "brunch" pass**: breakfast food is a recognizable kind
  (eggs, pancakes, breakfast tacos).
- **NO → not a category.** "dinner" is any food at all; "lunch", "happy hour"
  constrain when, never what. **A format fails when what arrives is
  UNCONSTRAINED**: "tasting menu", "prix fixe", "buffet", "combo plate" tell
  you how the food is delivered and how much of it, but the food itself could
  be anything.
- **A format that DOES constrain the food passes, like any other category.**
  "omakase" predicts sushi, chef-selected, in a known style; "dim sum"
  predicts small Cantonese plates. Diners search for these by name and order
  them by name. Judge a format by the same question as everything else — does
  naming it tell you what arrives? — not by the fact that it is a format.

A word may reference a time AND still name a food class. **Judge by the food
the word predicts, not by whether a clock is involved.**

Never categories: ingredients ("gruyere", "pecan", "pepperoni"), flavors
("sweet and spicy", "balsamic"), cuisines, styles, meal periods, service modes.
The tell: "I'll have the gruyere" is not a complete order; "I'll have the
popover" is.

Build the list:

1. **Seed** with the most specific attribute-free dish noun.
2. **Peel progressively**, asking the PREDICTION TEST of each remainder.
   "tuna roll" → "roll" passes. "masa crouton" → neither "crouton" nor "masa"
   passes. Preserve head-first constructions: "pho tai" → `["pho tai", "pho"]`,
   never `["tai"]`. Stop before a lone ingredient. A peel landing on a
   when-only word yields nothing, even inside the dish's own name
   ("ploughman's lunch" is a dish; "lunch" is not a class).
3. **Add 1–3 parent classes** the dish clearly belongs to, even when unstated —
   food nouns only (dessert, pastry, coffee, tea, sandwich, soup, salad, pizza,
   taco, burger, noodle, dumpling). A printed menu section is a category only
   when the heading predicts the food: "Desserts", "Sides", "Tacos" do;
   "Happy Hour", "Chef's Tasting" do not.
   - **Run the ORDER TEST on the PARTS of the dish name, not just the whole.**
     Any part that would itself be a complete order somewhere is a parent.
     "carnitas taco" → `["taco", "carnitas"]`; "carbonara udon" → `["udon",
"noodle", "pasta", "carbonara"]`; "breakfast taco" → `["breakfast taco",
"taco", "breakfast"]`; but "grilled burger" → `["burger"]` only.
     Whether the part is traditionally its own dish family is irrelevant —
     categories follow how people order today. Dropping such a part is the most
     common miss: someone craving carbonara wants the udon version too.
4. **Deduplicate**, most specific first, singular where natural.

Common parents: cake/brownie/pie/tart/gelato/ice cream → "dessert";
croissant/scone/muffin/macaron/cookie → "pastry" (and "dessert" when sweet);
latte/cappuccino/cold brew → "coffee"; chai/matcha → "tea"; banh mi/torta/
hoagie/panini → "sandwich"; pho/ramen/udon/pozole → "soup".

### C.4 One dish per connection

Each restaurant→food connection is ONE composed dish. Never emit separate
mentions for component ingredients or related nouns. Two restaurants praised
for the same dish produce two entries with identical `food` and distinct
restaurants.

### C.5 Ingredients

`ingredients` records ingredient nouns **THIS SOURCE names for THIS dish** —
the same kind of claim as everything else: something the writer said, not
something you know. Two sources only:

1. Additive clauses: "pasta **with burrata, chanterelles, and pesto**" →
   `["burrata", "chanterelle mushroom", "pesto"]`.
2. Ingredient nouns inside the dish name: "gruyere popover" → `["gruyere"]`.

**Never add ingredients from your own knowledge**: "al pastor taco" → `[]`
unless the source names contents. Singular, lowercase. An empty list is the
expected output for most mentions.

---

## Step D — What is left over? (THE STANDALONE TEST)

Only now, with the order-name settled, look at what remains. Every leftover
modifier must clear two bars to become an attribute.

### D.1 Does it describe, or does it judge?

**A real attribute states a property the food or place objectively HAS. Praise
states HOW GOOD it is.** Only descriptions are attributes.

- `spicy`, `crispy`, `smoky`, `grilled`, `vegan`, `cozy`, `outdoor seating`,
  `indian`, `comfort food` → describe → attributes.
- `delicious`, `tasty`, `amazing`, `incredible`, `insane`, `solid`, `best`,
  `elite`, `top notch`, `quality`, `specialty`, `favorite`, `standout`,
  `award winning`, `worth the trip`, `must-try`, `hidden gem`, `iconic`,
  `famous`, `world class` → judge → **NOT attributes. Drop them.**
- The test: **could the same word describe a BAD dish?** "spicy" yes (a dish
  can be badly spicy) → attribute. "delicious" no → praise, drop.
- The very praise that made this source eligible in Step A is what feeds
  `general_praise` in Step F. It must NOT also become an attribute.

### D.2 THE STANDALONE TEST

**Severed from the noun it modified, does this word still mean one definite
thing a diner could filter by?**

- **PASSES**: `gluten free`, `spicy`, `smoky`, `crispy`, `vegan`, `patio`,
  `counter service`, `byob`. Each means the same thing wherever it lands.
- **FAILS**: `rich`, `light`, `thin`, `thick`, `heavy`, `simple`, `hearty`,
  `old school`, `classic`, `authentic`, `traditional`, `generous portions`,
  `bright`, `clean`, `filling`. A **light roast**, a **light marinara**, and a
  **light meal** are three unrelated senses; separated from its noun the word
  asserts nothing and two readers will not agree what it claims. **Drop it.**

This is not a word list to memorize — it is a test to run. New words appear
constantly; run the test rather than matching the examples.

Two consequences follow directly:

- **A COMPARISON IS NEVER A PROPERTY.** "Really great Roman style pizza,
  LIGHTER THAN Jets or 313" asserts a relation to two other pizzerias, not a
  property of this pizza. Emit nothing from it.
- **A CONTEXT-STRIPPED FRAGMENT IS NEVER A PROPERTY.** "medium", "regular",
  "classic service", "frozen", "sat only" — if you cannot say what it filters
  by without guessing, drop it.
- **When a word is part of the order-name, it already rode into `food` in Step
  C** and must not also appear as an attribute. "classic banh mi" on a menu is
  a dish name, not a dish plus a property.

### D.3 Other things that are not attributes

- **Ingredients and ingredient-bound phrases.** A bare ingredient ("mayo",
  "basil") or a property welded to a component ("brown butter", "vodka sauce",
  "toasted garlic", "thick layers") describes this dish's makeup → it belongs
  in composition (Step C), not an attribute. Dietary and sourcing CLAIMS stay
  attributes ("vegan", "gluten free", "organic", "grass-fed") — diners filter
  by them.
- **Dish roles and courses** as menu positions ("side", "main", "palette
  cleanser") — not properties of the food.
- **Complaints.** The app recommends, so attributes are things a diner filters
  FOR. Drop "grumpy staff", "overpriced", "too loud", "rushed". Keep neutral
  states phrased as negations ("not crowded", "no wait", "cash only").
- **Over-specific single-use phrases.** An attribute must be reusable across
  many dishes or places. Strip "63rd floor roof bar" to "rooftop", "basted in
  herby butter" to nothing.
- **Anything the PREDICTION TEST calls food is never an attribute, on either
  side.** One split, decided by the same test that governs Step C:
  - A format that FAILS prediction ("tasting menu", "buffet", "prix fixe" —
    what arrives could be anything) is not food, and it CAN be a restaurant
    attribute when it characterizes how the venue serves.
  - A format or dish type that PASSES prediction ("omakase", "dim sum",
    "pizza", "ramen", "tacos", "hot pot") IS food — it names a THING, not a
    property. A place doesn't HAVE pizza as a quality, it SERVES pizza, and
    that claim belongs in `food`/`food_categories` where it ranks and
    searches as food. A pizza place's venue-side identity is its cuisine
    ("italian"), never the dish word. ("Austin has a banging pizza scene" →
    the pizzas are food claims at the named places; NO restaurant gets a
    `pizza` attribute, and an omakase house earns `japanese`, never
    `omakase`-as-attribute.)

### D.4 Which side does it attach to?

Scope follows **what the property describes**, not where the word sits.

- **Dish property → `food_attributes`**: anything that could appear in a
  menu-item description — preparation-as-property ("grilled", "house-made"),
  texture ("crispy", "creamy"), flavor ("spicy", "smoky"), temperature,
  dietary ("vegan", "gluten free").
- **Place property → `restaurant_attributes`**: anything that stays true if the
  menu changed — setting ("patio", "rooftop"), ambiance ("cozy", "lively"),
  service model ("counter service", "fine dining"), operational ("BYOB",
  "takeout", "reservations required"), group fit ("family-friendly"), price and
  value ("cheap", "good value", "expensive"), accessibility. **Price talk about
  a specific dish is still a place-level signal.**
- **A CUISINE ATTACHES ON BOTH SIDES, ALWAYS** — it is a property of the dish
  AND of the place, never either/or. **Infer it from the dish's identity even
  when unstated**: "chicken tikka masala" → `indian` in `food_attributes` on
  that dish AND in `restaurant_attributes`. This holds when the dish's cuisine
  differs from the venue's: tacos at a Korean spot give the dish `mexican` and
  add `mexican` to the restaurant's attributes **in addition to** `korean`.
  Use ONE canonical spelling per cuisine — `mexican`, never "mex",
  "mexican food", or "tex-mex-ish".
- **DIETARY LIFESTYLE CLAIMS ARE NEVER DROPPED.** Whenever a source asserts
  vegan / vegetarian / gluten free / halal / kosher about a dish or venue —
  including softer phrasings ("celiac-friendly", "plant-based", "GF options") —
  normalize to the canonical term and emit it. These power hard search toggles
  whose entire coverage comes from these claims; a missed mention is a
  permanently invisible restaurant to the user who needs it most. Venue-level
  ("great GF options") → `restaurant_attributes`; dish-level ("the vegan
  ramen") → `food_attributes` on that dish AND `restaurant_attributes`.
- **Styles and pure occasions**: styles ("comfort food", "street food") and
  when-only occasions ("lunch", "dinner", "late-night", "happy hour") are
  properties. Tied to a dish they are `food_attributes`; describing the place
  ("great happy hour", "open late") they are `restaurant_attributes`. A style
  named with no dish ("great comfort food here") lands whole on
  `restaurant_attributes` so the place stays searchable.

### D.5 Normalize and gate

- Lowercase; natural singular; deduplicate within each array.
- **Prefer the plainest common form** of a property — do not invent a novel
  phrasing when a standard one exists.
- Attach an attribute **only to the mention whose text supports it.** An
  attribute stated for one dish or one restaurant never attaches to another.
- **Final gate**: before emitting ANY term, re-run D.1 and D.2. If it judges
  quality, fails the STANDALONE TEST, or is a bare ingredient or filler, drop
  it. **It is correct to emit an empty attribute array for a glowing comment
  whose only modifiers were praise.**

---

## Step E — Is it a specific item or a family?

Set `is_menu_item` for each composed dish.

- **`true`** — the source names a specific orderable item you could point to on
  a menu ("duck carnitas taco", "tuna melt sandwich", "honey butter pancakes").
  The bar: **could two diners each order "the X" here and be handed the same
  thing?** "Bread's babka" → true (a babka is one thing you walk out with);
  "the tasting menu at Corima" → true (one fixed offering); "Levain cookies",
  "Lady M cakes", "Raku's udon" → false (the shop makes many; the family name
  alone was never narrowed — family size is a fact about the MENU, not the
  sentence).
- **`false`** — the dish is a family or class ("tacos", "pizza", "coffee"), or
  the source only names a restaurant.
- **Restaurant-only**: no dish named and none inherited → `food` and
  `food_categories` both null, `is_menu_item: false`.

Set `true` only with strong evidence; when unsure, `false`.

**Answering an item-specific ask.** When the ask names a target dish ("best
burger in EV?") and a reply ONLY names a restaurant while passing the TESTIMONY
TEST, reuse the ask's target as `food`/`food_categories` with
`is_menu_item: false`. This applies only when the reply names no dish of its
own — a reply that restates the dish in its own words goes through the normal
path above. **The inherited target must be an ORDERABLE DISH — it must pass
BOTH the ORDER TEST and the PREDICTION TEST**, because each catches what the
other misses:

- "best burger in EV?" → `burger` passes both → inherit it.
- "nice dinners on a budget?", "lunch spots?" → `dinner`/`lunch` fail the
  PREDICTION TEST (they predict no food at all) → inherit NOTHING.
- "best Indian around?", "where for comfort food?" → `indian`/`comfort food`
  PASS prediction (they do predict a kind of food) but FAIL the ORDER TEST —
  a cuisine or style is not a thing you order — so they inherit NOTHING as
  food; they ride the attribute side per Step D.
  A reply that inherits nothing is a restaurant-only mention. **The ask itself
  never emits.** Cuisines and dietary flags are attributes and never enter
  `food_categories`.

Never re-split a dish composed in Step C, and never invent a restaurant name —
if the place cannot be resolved with confidence, skip the mention.

---

## Step F — Assemble the output

### F.1 `general_praise`

`general_praise` is **true when the source endorses the PLACE AS A WHOLE**,
independent of any dish — "this place is incredible", "my favorite spot in
Austin", or a bare recommendation list answering a where-should-I-eat ask.

- It is an **independent axis**. Composing a dish neither creates nor
  suppresses it; endorsing a place neither creates nor suppresses a dish.
- Praise aimed at a specific dish ("the brisket is unreal") sets
  `general_praise: false` on that dish's mention — the praise is already
  carried by the dish connection.
- **One carrier per source per restaurant**: when a source praises a place
  holistically AND names dishes, emit the dish mentions with
  `general_praise: false` plus ONE restaurant-only mention with
  `general_praise: true`.
- Availability, popularity, and price are never endorsement (Step A.2).

### F.2 Fields

Emit one object per mention with these fields, in this order:

- `temp_id` (REQUIRED) — a unique identifier for this mention within your
  response, e.g. `"m1"`, `"m2"`. Every mention needs one.
- `restaurant` (REQUIRED) — the canonical name from Step B.3.
- `restaurant_attributes` — array or null.
- `food` — the order-name from Step C, or null.
- `food_categories` — array or null.
- `ingredients` — array or null (usually empty).
- `is_menu_item` — boolean or null.
- `food_attributes` — array or null.
- `general_praise` (REQUIRED) — boolean.
- `source_id` (REQUIRED) — the chunk-local id copied EXACTLY from the input
  payload's `id` field for the source this mention came from (e.g. `SRC004`).
  Never invent, reformat, or borrow another source's id.

Rules:

- **JSON only.** No markdown fences, no commentary.
- When a property has no values, omit it or set it to `null`. Never emit empty
  strings.
- One source may emit multiple mentions (several restaurants, several dishes)
  — but never two mentions for the same (restaurant, food) pair from one
  source: repeated references collapse into one mention.
- A mention with no food, no attributes, and `general_praise: false` asserts
  nothing — do not emit it.
- Emit nothing at all for a source that failed Step A.

### F.3 Worked example

Source text (`SRC004`): "Nixta's duck carnitas tacos are crispy, Suerte's
version is smoky, and Nixta's patio is gorgeous. This place is a gem."

```json
{
  "mentions": [
    {
      "temp_id": "m1",
      "restaurant": "nixta",
      "restaurant_attributes": ["mexican"],
      "food": "duck carnitas taco",
      "food_categories": ["taco", "carnitas"],
      "ingredients": [],
      "is_menu_item": true,
      "food_attributes": ["crispy", "mexican"],
      "general_praise": false,
      "source_id": "SRC004"
    },
    {
      "temp_id": "m2",
      "restaurant": "suerte",
      "restaurant_attributes": ["mexican"],
      "food": "duck carnitas taco",
      "food_categories": ["taco", "carnitas"],
      "ingredients": [],
      "is_menu_item": true,
      "food_attributes": ["smoky", "mexican"],
      "general_praise": false,
      "source_id": "SRC004"
    },
    {
      "temp_id": "m3",
      "restaurant": "nixta",
      "restaurant_attributes": ["patio", "mexican"],
      "food": null,
      "food_categories": null,
      "ingredients": [],
      "is_menu_item": null,
      "food_attributes": null,
      "general_praise": true,
      "source_id": "SRC004"
    }
  ]
}
```

Note what this example demonstrates: singular `food` and singular categories;
`crispy` and `smoky` pass the STANDALONE TEST while a word like "rich" would
not; the inferred cuisine `mexican` on BOTH sides of both dishes; the patio as
a place property; and ONE carrier for the holistic praise (`m3`), with the dish
mentions at `general_praise: false`.
