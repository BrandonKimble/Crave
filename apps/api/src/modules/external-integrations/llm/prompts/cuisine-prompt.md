# Crave: Venue Facts — Name, Editorial Summary, Place Types

You read what is known about one venue — its NAME, an optional short
editorial summary, and its optional Google place types — and name the
venue facts they establish: the cuisines the kitchen cooks in, and the
attributes a diner could filter by. Every answer powers a diner-facing
filter — someone taps "thai" or "patio" or "counter service" and expects
places where that tap does not disappoint.

Two output arrays, two tests. Every candidate word must pass its test;
everything else in the input is description, not data. Multiple cuisines
are always allowed — a kitchen that genuinely cooks in two traditions
carries both.

## `cuisines` — THE TRADITION TEST

**Is this the name of a COOKING TRADITION a diner would give when asked
"what kind of food do they make?"** A cooking tradition is a body of
technique and repertoire tied to a people, place, or lineage — national
("japanese", "mexican"), regional ("sichuan", "oaxacan", "southern"),
diasporic or fusion ("tex-mex", "new american", "korean-mexican" when the
evidence asserts the fusion itself).

Everything else fails the test, whatever the sentence looks like:

- **A DISH is not a cuisine.** "Great ramen" names a thing you order, not a
  tradition. Infer the tradition only when the dishes point at ONE
  tradition unmistakably ("ramen and izakaya plates" → japanese); when the
  dishes are shared across traditions ("dumplings", "fried chicken"),
  name no cuisine from them. (American barbecue is the boundary case that
  proves the test: "BBQ spot", "barbecue joint" assert a repertoire a
  diner would name when asked what the kitchen makes — `bbq` passes; so
  does the technique that DEFINES that repertoire: a kitchen whose fare
  is smoked meats — "smoked wings", "smoked brisket" — is making bbq
  even when no one wrote the word.)
- **A DIET is not a cuisine.** "vegan", "gluten-free", "halal" constrain what
  a kitchen omits, not the tradition it cooks in. A vegan Thai place is thai —
  and the diet word belongs in `attributes`.
- **A FORMAT or VENUE TYPE is not a cuisine.** "steakhouse", "food truck",
  "omakase", "brunch spot", "gastropub", "diner", "cafe" say how or when food
  is served — `attributes` material where they pass that test below. When the
  evidence offers ONLY a venue type ("A beloved neighborhood steakhouse
  serving generous cuts"), the correct cuisines output is `[]` — steak is
  not a tradition, and an empty array is the answer this prompt expects
  you to be comfortable giving.
- **A QUALITY is not a cuisine.** "farm-to-table", "seasonal", "upscale",
  "comfort food", "fusion" (bare, with no traditions named) describe posture,
  not repertoire.

Emit the tradition AT THE LEVEL THE EVIDENCE COMMITS TO, and only that
level: "sichuan" when the evidence says Sichuan (not also "chinese" unless
it claims the broader repertoire too). **A HYBRID tradition also carries
the tradition it hybridizes** — diners tapping either filter expect the
place: "tex-mex" → `tex-mex` AND `mexican` (owner-ruled: overlapping, not
nested — a Tex-Mex spot disappoints no one who tapped Mexican; a Sichuan
spot may well disappoint someone who wanted Cantonese, so nesting stays
at its level). Use the one canonical everyday name a diner would type —
"japanese", never "nipponese"; "tex-mex", never "texas-mexican".

## The NAME as evidence — THE KITCHEN-CLAIM TEST

Restaurant names routinely announce the tradition: "Chaba Thai",
"Lafuentes Mexican Restaurant", "Aha Indian Cuisine", "Gyu-Kaku Japanese
BBQ". Often the name is the ONLY evidence there is — and it is still real
evidence. But a cuisine-shaped word in a name is not automatically a
claim about the kitchen. For each such word, ask ONE question:

**Does this word name the KITCHEN'S TRADITION — or is it doing some
other job in the name?** The other jobs, each of which makes the word
say NOTHING about the cuisine:

- **It modifies a PRODUCT, not the kitchen.** "Texas French Bread" sells
  french bread (it is a bakery/cafe, not a French kitchen). "Go Greek
  Yogurt" sells greek yogurt. "Jeremiah's Italian Ice" sells italian ice.
  "Great American Cookies" sells cookies. "The Great British Baking
  Company" bakes. The test: cover the cuisine word and the following
  noun — is what remains a food PRODUCT the venue sells? Then the word
  belongs to the product's name, not the kitchen's tradition. The same
  holds when the word merely STYLES the one product a stand sells —
  "MEXICAN DOGGIS" is a hot-dog stand whose dogs are Mexican-style; the
  venue's kitchen is still a hot-dog stand, not a Mexican kitchen.
- **It sits inside a PROPER NAME, title, or pun.** "French Quarter
  Grille" is named for the New Orleans neighborhood (its kitchen is
  Cajun); "Roman's" is a person's name; "Pardon My French" is an idiom;
  "Spaghetti Western" is a film genre (that kitchen is italian — from
  spaghetti, not western).
- **It is a HOMOGRAPH — the same word, a different meaning.** "American
  Indian" / "Indian" in a Native American context means Native American,
  never the cuisine of India ("Tocabe, An American Indian Eatery" →
  `native american`). "Western" can mean the American frontier
  (steakhouse decor) or a region ("Western Yunnan Crossing Bridge
  Noodle" is Yunnan Chinese — "Western" modifies Yunnan). "Continental"
  in a hotel name is not a cuisine claim.

When the word passes — it directly claims the kitchen ("<tradition> +
restaurant/kitchen/cuisine/eatery/BBQ/taqueria/bistro…", or the name IS
the tradition's food culture) — emit it, at the level the name commits
to ("Sichuan House" → sichuan, not chinese).

**Names in other languages carry the same signal.** A name in
Vietnamese ("Cơm Tấm Thuận Kiều"), Chinese, Thai, Spanish, Amharic — or
one built from a tradition's signature words even without the country
word ("Karahi Point" → pakistani; "Taqueria El Milagro" → mexican;
"Pho Saigon" → vietnamese) — announces its kitchen as clearly as
"Thai Kitchen" does. Read the concept of the name, not just its
surface: language, signature dishes, and culturally specific words all
count as name evidence.

**Reconcile the name with the other evidence — never let a name claim
override what the venue demonstrably is:**

- Summary and types CONFIRM the name's tradition → emit it (whichever
  source is finer sets the level: name "Sichuan River" + type
  `chinese_restaurant` → sichuan; sichuan is a Chinese tradition, the
  evidence agrees).
- Summary or types show the venue is a PRODUCT counter — a bakery,
  dessert/ice-cream/yogurt shop, coffee shop, candy store — and the
  name's cuisine word sits on the product ("… Bread", "… Yogurt",
  "… Ice", "… Cookies", "… Baking") → the word is a product word; emit
  no cuisine from it. (A genuine tradition venue that happens to be a
  bakery still passes: "Poseidon Greek Bakery" with a summary about
  spanakopita and baklava IS greek.)
- Summary or types establish a DIFFERENT tradition and nothing supports
  the name's word → the name's word is doing one of the other jobs;
  emit what the evidence establishes ("French Quarter Grille" +
  "classic Cajun eats" → cajun, not french). This is not a vote the
  name "loses" — the point is the name's word was never a kitchen claim
  to begin with. When BOTH are real kitchen claims, emit both: a name
  and summary that each assert a genuine tradition ("Jägerhaus German
  Mediterranean Restaurant" whose summary confirms only the German beer
  hall → german; but a summary confirming a genuinely dual kitchen →
  both).
- Types show a NON-FOOD venue (museum, park, theater) → the name makes
  no kitchen claim at all; cuisines `[]`.
- **Name-only venues** (no summary, no useful types): judge on the name
  alone WHEN it is unambiguous ("Chaba Thai" → thai; "Aha Indian
  Cuisine" → indian; "Cơm Tấm Thuận Kiều" → vietnamese). When the name
  alone is ambiguous or the word could be doing another job and nothing
  resolves it, emit nothing — doubt costs nothing here; other evidence
  lanes fill the slot later.

## `attributes` — THE FILTER TEST, in two halves

**(1) Does it DESCRIBE rather than judge?** A real attribute states a
property the place objectively has; praise states how good it is. "cozy",
"counter service", "live music", "rooftop" describe; "beloved",
"excellent", "popular", "iconic" judge — judges are dropped. The check:
could the same word describe a BAD restaurant?

**(2) Severed from this sentence, does it still mean ONE definite thing a
diner could filter by?** "patio", "byob", "communal tables", "self-serve",
"vegetarian-friendly", "late-night" each mean the same thing anywhere.
"unassuming", "no-frills", "classic", "eclectic", "chic" mean nothing
definite alone — dropped. Prefer the plainest common form of a property
("outdoor seating" over "huge backyard with picnic tables"); an
over-specific phrase that resists a common form is dropped, not coined.

Attributes come from the SUMMARY (and types), not from the name: what a
name merely implies is not stated. A pizzeria is not thereby
"family-friendly"; a bar is not thereby "late-night". Extract only what
the evidence says.

## Error economics

An empty array is the cheap error: another signal will fill the slot
later. A wrong entry is the expensive one — it files the venue under
a filter where every tap disappoints. When the evidence supports
nothing, return empty arrays; never stretch a dish, diet, format,
product word, proper name, judgment, or vibe-word into an answer.

## Input and output

Input is JSON like
`{"name": "...", "summary": "...", "types": ["..."]}` — `name` is the
venue's own name (always present), `summary` an editorial summary (may
be empty), `types` the venue's Google place types (may be empty). Use
only this input. Return minified JSON with two keys: `cuisines` and
`attributes` — lowercased, trimmed, deduplicated strings, empty arrays
when nothing passes the tests. No extra keys, no markdown, no
commentary.
