# Prompt red team — COMPLEXITY / REDUNDANCY / MINIMAL FORM (2026-08-26)

Target: `apps/api/src/modules/external-integrations/llm/prompts/collection-prompt.candidate.md`
(1,157 lines / **10,772 words**), plus the paired descriptions in
`apps/api/src/modules/external-integrations/llm/prompts/llm-response-schemas.ts`
(`COLLECTION_RESPONSE_JSON_SCHEMA`, `PLACE_*` consts, and — see F3 — the
neighbouring `SEARCH_QUERY_RESPONSE_JSON_SCHEMA`).

Lens: principles over lists; examples only when they teach a whole class; token
mass is a measured regression vector; a rule lives exactly at its decision
point; nothing survives because it was certified before.

---

## Plain-language summary (owner)

The prompt is **10,772 words**, and roughly **one word in seven is a rule the
prompt already stated somewhere else**. That is not a style complaint — it is
three concrete risks:

1. **Copies have already drifted.** The "wrapper" rule (menu / special / deal /
   combo / buffet / prix fixe / course) is written out **eight times**, and the
   copies no longer agree. One of them (C.3 step 2) shrank the list to
   `special`, `menu`, `deal` — so a model following THAT copy would happily mint
   a dish called "lunch buffet" or "lunch combo", which every other copy forbids.
   Same class of drift in the schema file, where the search-query schema still
   says a **cuisine belongs on the dish side** — the exact thing this prompt
   spends 600 words abolishing.
2. **One real defect, shipping today.** `SEARCH_QUERY_RESPONSE_JSON_SCHEMA`
   requires two fields that **do not exist** in it (`foodAttributes`,
   `restaurantAttributes` — the properties are named `itemAttributes` /
   `placeAttributes`). Old-contract names left behind in a rename. Fix
   regardless of anything else in this document.
3. **Step E is mostly Step C said twice.** ~450 of Step E's 703 words re-teach
   ask-inheritance that C.1 Gate 3 and Step D already own — including a line
   that openly admits it ("do not re-litigate the gate here"). When a prompt has
   to tell the model not to re-litigate, the rule is in the wrong place.

**The compression that loses nothing is ~1,400 words (13%)**: fold the
duplicated clause-law, give the wrapper machinery one home, and shrink Step E to
the one decision only it makes (`is_menu_item`). Ranked below, each with the
behaviors that must be pinned as gold cases first (the 161-loss lesson: name
every behavior you are compressing away, or you will not notice it leave).

Two things I am NOT recommending cutting, despite being repetition: the
world-knowledge ban (F2) and the clause-by-clause law's *directional pair* of
examples (F1). Reasons given inline.

---

## Token mass by section (measured)

| Section | words | % |
|---|---:|---:|
| Preamble — "What you are extracting" | 300 | 2.8 |
| Processing loop and scope | 261 | 2.4 |
| **Step A** (opener 378 + A.1 908 + A.2 **1,362** + A.3 74 + A.4 74) | **2,796** | **26.0** |
| **Step B** (B.1 729 + B.2 396 + B.3 876) | **2,001** | 18.6 |
| **Step C** (33 + C.1 576 + C.2 580 + C.3 696 + C.4 33 + C.5 85) | **2,003** | 18.6 |
| **Step D** (361 + D.1 127 + D.2 225 + D.3 331 + D.4 622 + D.5 145) | **1,811** | 16.8 |
| **Step E** | **703** | 6.5 |
| Step F (F.1 258 + F.2 241 + F.3 190) | 689 | 6.4 |

A.2 alone is 12.6% of the prompt and is the single densest concentration of
echo (see F1, F4, F5).

---

# RANKED FINDINGS

---

## F1 — CRITICAL. The wrapper rule is written 8 times and the copies have DIVERGED

**The echo cluster.** Every copy of the same law:

1. C.1 Gate 1: "A DELIVERY WRAPPER head (`menu`, `tasting menu`,
   `course`/`N-course`, `prix fixe`, `buffet`, `special`, `deal`, `combo`) is
   never the dish, and a modifier cannot rescue it"
2. C.2 step 2: "**\"lunch special\", \"3/4 course menu\"** — two diners ordering
   \"the lunch special\" here ARE handed the same thing, and the phrase still
   names no food… C.1's head-noun check governs."
3. C.2 step 4: "**Appearing on a menu is NOT sufficient.** \"Lunch Special\",
   \"3-Course Menu\", \"Happy Hour Deal\", \"Chef's Tasting\"… **Re-run C.1's
   HEAD NOUN check**… if its head noun is a delivery wrapper (`menu`, `course`,
   `special`, `deal`, `combo`, `buffet`, `prix fixe`)"
4. C.3 "NO → not a category": "**A format fails when what arrives is
   UNCONSTRAINED**: \"tasting menu\", \"prix fixe\", \"buffet\", \"combo
   plate\", \"lunch special\", \"3-course menu\"… **A modifier never changes
   this** — test the head noun, not the string."
5. C.3 step 2: "if removing the time-word leaves a wrapper (`special`, `menu`,
   `deal`), there was never a dish."
6. D.3 final bullet: "A format or deal that FAILS prediction (\"tasting menu\",
   \"buffet\", \"prix fixe\", \"lunch special\", \"3-course menu\" — what
   arrives could be anything) is not food"
7. Schema, `item`: "never a delivery wrapper (special, combo, menu)"
8. Schema, `item_categories`: "NEVER a cuisine…, meal period, or delivery
   wrapper"

**The drift, concretely.** The canonical set is 7 heads (C.1). Copy 3 keeps all
7. Copy 4 lists 6 and adds "combo plate". **Copy 5 lists three** — `special`,
`menu`, `deal`. Copies 7 and 8 list three and zero respectively. A model
executing C.3 step 2 on "lunch buffet" or "lunch combo" finds no wrapper in the
list it was just handed and proceeds to mint a category. This is precisely the
"copies can diverge — some already have" failure: the shrunken copy is not a
teaching subset, it is a **different rule**.

Independently: the wrapper set is stated as a **closed list of 7 tokens**, but
the governing test is already stated crisply twice — the PREDICTION TEST ("if a
diner names only this word, do you already know something about the food that
arrives?") and its clean asymmetry, "\"salmon omakase\" composes as a dish;
\"salmon tasting menu\" redirects to `salmon`". **The test subsumes the list.**
Every one of the 7 tokens fails prediction; "omakase" and "dim sum" pass. A
model that has the test does not need the roster, and a roster invites the exact
closed-world reading that a new wrapper word ("chef's board", "feast menu")
would slip through.

**Rederivation — one home, one test, three examples.** Delete copies 2–6. C.1
Gate 1 becomes the sole decision point:

> **Gate 1 — THE HEAD NOUN.** Find the head noun of the food phrase. Run the
> PREDICTION TEST on it *alone*: naming only this word, do you know anything
> about the food that arrives? A head that fails is a **delivery wrapper** — it
> describes how, when, or how much food is delivered, never what. `tasting
> menu`, `lunch special`, `prix fixe` fail; `omakase`, `dim sum` pass and are
> food like any other. A modifier never rescues a failing head — triage the
> modifier instead: [the two existing bullets].

Then C.2 step 4 becomes one clause ("re-run Gate 1 on the phrase you composed"),
C.3 keeps only the asymmetry sentence, D.3's format split becomes "a head that
fails Gate 1 is not food and may be a venue attribute in its bare form;
a head that passes is food and belongs in `item`" — with the `tasting menu` →
bare-form normalization rule, which is D.3's ONLY non-duplicated content, kept.

**Saving: ~400 words.**

**Behaviors at risk if compressed — pin these as gold cases first:**
- `wagyu tasting menu` → `item: wagyu` (modifier names a food → redirect)
- `nigiri special` → `item: nigiri`; `chicken special` → `item: chicken`
- `lunch special` praised warmly → restaurant-only, `general_praise: true`,
  `good value` in `place_attributes`, **no item**
- `3/4 course menu`, `happy hour deal`, `$25 combo`, `elvis presley combo`,
  `game day deal`, `tuesday special` → no item, mention still emits
- `great weekday lunch special - 2 tacos, rice y beans, iced tea like $10` →
  **no** taco/rice dish mentions (components of a deal are not claims)
- `salmon omakase` → dish; `salmon tasting menu` → `salmon`
- `omakase`/`dim sum` → `item`, `is_menu_item: false`, and **never** a venue
  attribute; `wagyu tasting menu` → venue attribute `tasting menu` (bare)
- `ploughman's lunch` survives as a dish while `lunch` is not a class
- **the drifted case that must now pass**: `lunch buffet`, `lunch combo` →
  no item (today C.3 step 2's short list misses these)

---

## F2 — HIGH. "Your world knowledge is off-limits" is stated 10 times — and this one is LOAD-BEARING, but not in 10 places

**The cluster:**

- Step D opener: "A parent's words, the venue's own name, and your knowledge of
  the venue are never this source's words."
- B.3: "**Your world knowledge of the establishment is off-limits here.**… \"Minetta\" stays `minetta` even when you know it is Minetta Tavern"
- B.3: "**Both directions of \"fixing\" are forbidden.**… \"Dominic Ansel\" stays `dominic ansel`… de-diacritization is the same correction run in reverse"
- C.5: "**Never add ingredients from your own knowledge**: \"al pastor taco\" → `[]`"
- D.4: "**Your world knowledge of the venue.** A bare list — \"Momoya soho, La dong, shuka\" — carries NO cuisines, however well you recognize the restaurants. The same off-limits rule as B.3's names"
- D.5 final gate: "A term whose only support is a parent's wording or your knowledge of the venue does not pass."
- E: "your own knowledge of the venue still adds nothing."
- Schema `PLACE_OBSERVED_SCHEMA`: "never expanded, corrected, unified with another spelling in the thread, or **completed from world knowledge of the venue**"
- Schema `PLACE_ATTRIBUTES_SCHEMA`: "never from a parent comment or **world knowledge of the venue**"
- Schema `ingredients`: "**never from world knowledge**"

**Verdict: KEEP the repetition, but restructure it.** This is the rare echo I
judge load-bearing. It is not one rule repeated — it is one *principle* applied
at four genuinely different decision points where the model's default behavior
differs: name completion (B.3), ingredient invention (C.5), cuisine derivation
(D.4), and item narrowing (E). The pull toward each is independent; a single
statement in the preamble would not survive 8,000 words of context to reach D.4.
The v17 contract exists *because* the model performed this exact error class
(the Luckys → Lefty's swap in `plans/v17-coherence-redteam-20260825.md` F1).

**What IS drift-risk here:** the three copies inside B.3 alone. The
diacritics rule is stated **twice within 20 lines**:

> "never strip letters the writer DID write: de-diacritization is the same
> correction run in reverse (\"Café Crème\" → `café crème`, never `cafe creme`)"

then, in the Normalize block:

> "Lowercase everything — but **keep every letter as the writer spelled it,
> diacritics included** (\"Phở Lệ\" → `phở lệ`, never `pho le`)"

…and a third time in C.2 step 5 for dishes. The B.3 pair is pure duplication —
one belongs in Normalize (it is a normalization rule), the prose paragraph
should keep only the *typo* half ("Dominic Ansel"), which is a different
behavior. **This one is verified against code**: `place-name-contract.ts:59`
`normalizeSpanMechanically` does NFC + lowercase + apostrophe-fold + whitespace
only — it does NOT fold diacritics, so a de-diacritized emission would fail
`observedSpanAppearsInSource` and be **refused**. The rule must survive; only the
duplicate must go.

**Rederivation.** State the principle once in the preamble as a fifth named
law — **THE OBSERVATION LAW: you emit what the source WROTE, never what you
KNOW** — then let each decision point cite it in one clause instead of
re-arguing it. B.3 loses its second diacritics copy; D.4's "The same off-limits
rule as B.3's names" becomes "(THE OBSERVATION LAW)"; E's trailing clause and
D.5's clause become citations.

**Saving: ~130 words.** Small — but it removes the divergence surface on the
rule whose violation is the most expensive error the pipeline makes.

**Behaviors at risk:** `minetta` not "minetta tavern"; `sho` stays `sho`;
`dominic ansel` / `switf's` uncorrected; `café crème` and `phở lệ` keep marks;
`luckys` in a Lefty's thread emits `luckys`; `al pastor taco` → `ingredients: []`;
"Momoya soho, La dong, shuka" → **zero** cuisines; "1618 Asian Fusion" → no cuisine.

---

## F3 — HIGH. Obsolete contract text in the schema file: dish-side cuisine, and a broken `required`

Two distinct problems in `llm-response-schemas.ts`, both survivors of an earlier
contract.

**(a) A real defect, live today.** `SEARCH_QUERY_RESPONSE_JSON_SCHEMA` (lines
37–43):

```ts
required: ['places', 'items', 'foodAttributes', 'restaurantAttributes', 'ingredients'],
```

The properties block defines `itemAttributes` and `placeAttributes`. Neither
`foodAttributes` nor `restaurantAttributes` exists. These are the **old
food/restaurant field names** from before the item/place rename. Under strict
validation this is an invalid schema; under lenient handling the two attribute
arrays are simply never required. Fix: `['places','items','itemAttributes','placeAttributes','ingredients']`.

**(b) Obsolete dish-side cuisine, contradicting the new canon.** Same schema:

> `itemAttributes`: "Food properties passing THE STANDALONE TEST (dietary,
> flavor, preparation, **cuisine-of-a-dish**)"

The collection prompt D.4 now states the opposite in bold: "**A CUISINE IS A
PLACE PROPERTY, ONLY**… it lands in `place_attributes` and never in
`item_attributes` or `item_categories`" — and the collection schema's own
`item_attributes` correctly says "never a cuisine (place side only)". The search
schema is a different prompt, but it is the **query** side of the same concept
space: a searcher's "spicy thai noodles" would tag `thai` as a dish attribute
and then fail to match a corpus where cuisine lives only on places. This is
exactly the F5 read-side mismatch the v17 red team flagged
(`plans/v17-coherence-redteam-20260825.md` item 5). **Owner call needed** — it
is out of this file's scope to change search behavior — but the contradiction
should not survive as an accident.

Also obsolete/stale in the same const: `placeAttributes` lists "neighborhood" as
a place attribute, which the collection prompt B.3 explicitly excludes from the
name span and never re-admits as an attribute anywhere.

**Behaviors at risk: none from (a)** — it is a pure bug fix. (b) must be an
explicit ruling, not a compression.

---

## F4 — HIGH. Step E is 703 words to make one decision; ~450 of them are Step C and Step D restated

Step E's only unique job is `is_menu_item`. Everything else in it is
inheritance, already decided upstream:

- **C.1 Gate 3 already owns subject-inheritance**: "when this source is a pick
  answering a dish-targeted ask, the ASK's food language walks these same gates,
  and what survives is the claim's subject. \"best burger in EV?\" → a bare pick
  carries `burger`"
- **Step D's opener already owns predicate fit-assertion**: "**an unqualified
  pick answering a constrained ask asserts fit** — the ask's VENUE-level
  constraint words… are that pick's own claim"

Step E then re-derives both, at length, with the same worked example:

> "**Answering an item-specific ask.** When the ask names a target dish (\"best
> burger in EV?\")… reuse the ask's target as `item`/`item_categories` with
> `is_menu_item: false`… **The inherited target must be an ORDERABLE DISH — it
> must pass BOTH the ORDER TEST and the PREDICTION TEST**… \"best burger in
> EV?\" → `burger` passes both → inherit it."

and re-derives the fit assertion a third time:

> "What an unqualified pick DOES assert is FIT (Step D's opening rule): the
> ask's venue-level constraint words — its cuisine, price, and vibe words — are
> the pick's own place-side claim."

The tell that this is misplaced is in the text itself: "(a bare name answering a
judgment ask passes it via the ANSWER TEST in A.1 — **do not re-litigate the
gate here**)". A prompt instructing the model not to re-litigate a rule is a
prompt that put the rule in the wrong section. And the boundary sentence Step E
offers as its crown jewel —

> "**the ask's named DISH is a SUBJECT**… **the ask's cuisines, vibes, and price
> words are PREDICATES**"

— is genuinely excellent, and belongs in **Step D's opener**, where the
subject/predicate split is first drawn, not 250 lines later.

**Rederivation.** Step E becomes ~200 words:

> ## Step E — Is it a specific item or a family?
> Set `is_menu_item` for each composed dish.
> - **`true`** — this source's own words name one specific orderable item: could
>   two diners each order "the X" here and be handed the same thing? "duck
>   carnitas taco" yes; "Levain cookies" no (the shop makes many — family size is
>   a fact about the MENU, not the sentence).
> - **`false`** — a family or class, or a dish this source did not name.
> **A dish this source never named is never `true`** — an inherited or adopted
> dish was never narrowed here, however specific the ask's wording.
> Set `true` only with strong evidence; when unsure, `false`.

Move the subject/predicate boundary sentence and the three inheritance worked
cases (`burger` / `dinner` / `indian`) up into C.1 Gate 3 and D's opener
respectively — where the model is already standing when it needs them.

**Saving: ~450 words.**

**Behaviors at risk — pin before touching:**
- "best burger joint?" / "quán phở nào ngon nhất?" → dish inside a venue-type
  wrapper IS inherited (`burger`, `phở`)
- "Phở Lệ" replying to a phở ask → inherited dish is the ASK's word, **not**
  minted from the venue name
- "nice dinners on a budget?" / "lunch spots?" → inherit NOTHING
- "best Indian around?" → `ravi kabab`, restaurant-only, `indian` in
  **`place_attributes`**, nothing in `item`/`item_categories`
- "Mexican restaurant vibe?" + bare name → `mexican` place-side, empty food slots
- inherited dish always `is_menu_item: false`
- "the omakase at Sushi Nakazawa" → `true`; "Levain cookies", "Lady M cakes",
  "Raku's udon" → `false`; "Bread's babka" → `true`
- a hedged/re-scoped reply asserts **nothing** from the ask

---

## F5 — MEDIUM-HIGH. The clause-by-clause law is stated 6 times; A.3 is a pure restatement

**The cluster:**

1. Step A opener (the whole 378-word section, with the three directional
   examples): "Answer it **clause by clause, never for the comment as a
   whole.**… **A source has no genre.**"
2. A.1 reaction bullet: "Judge every sentence of the source (clause by clause,
   as Step A opens); never let a reaction frame silence the rest of the comment."
3. A.2 hedged bullet: "a different dish, a different place, or a separate aside
   is a new clause under **this step's clause-by-clause law**"
4. A.2 PRICE-ONLY: "**This is a clause-level fact like every other**"
5. A.2 NEGATIVE CONTENT: "Emit nothing **for the criticized items** — and only
   for them"
6. **A.3 in full** (74 words): "In a ranked, listed, or mixed source, **each
   restaurant and each dish carries its own verdict.** A positive verdict on one
   entry never transfers to another…"
7. D.5: "Attach an attribute **only to the mention whose text supports it.** An
   attribute stated for one dish or one restaurant never attaches to another."

**A.3 says nothing the Step A opener has not already said 300 words earlier**,
and the opener says it better (with the mixed-source examples). A.3 exists as a
separate numbered section, which reads as a separate law — the classic
"certified before" survivor. Copies 2–5 are one-clause citations, which is the
correct shape and costs almost nothing; copy 7 is at a genuinely different
decision point (attribute attachment, 400 lines later) and earns its place.

**Verdict on the opener itself: KEEP its length.** Its three examples are a
*directional pair plus a mixed case* (ask-post-with-verdicts, complaint-with-praise,
rave-with-failures), and they teach the whole class in both directions —
that is exactly what the canon licenses examples for. Do not trim to one.

**Rederivation.** Delete A.3 entirely; fold its one non-duplicated clause
("When the writer weighs options, the endorsement lands on the one they settle
on, never on the one they set aside") into the Step A opener as a fourth
sentence. Renumber A.4 → A.3.

**Saving: ~70 words** — small in tokens, but it removes a whole numbered section
that reads as an independent law and can drift away from its parent.

**Behaviors at risk:**
- ranked list: `porchetta ribs (7.3)` withheld while the 8.4 favorite emits
- "I love Uroko, but their handrolls…" → place verdict emits, handroll clause fails
- "Honestly, half this list is overrated — but Chivito d'Oro is fantastic" →
  Chivito d'Oro emits
- "6 dollar beers, 18 dollar spritzes" inside a rave → no mentions
- a positive verdict never transferring to a neighboring entry

---

## F6 — MEDIUM. The ANSWER TEST is written 8 times across A, C, D, E, F and the schema

**The cluster** (I quote the load-bearing fragment of each):

1. Preamble Four Tests: "**THE ANSWER TEST** — _was this name offered as the writer's own pick…_ If yes, **the name IS the verdict**"
2. A.1 (~210 words, the fullest statement, with its two required conditions)
3. A.2 AVAILABILITY: "**But when the ask requested a PICK rather than a location, naming a place IS the verdict — see the ANSWER TEST in A.1.**"
4. A.4: "A source that passes the ANSWER TEST must emit **even though nothing was said about the food**"
5. B.2: "**An ANSWER-TEST pick inherits the ask's MODE.**"
6. C.1 Gate 3: the ask-inheritance rule
7. E: "a bare name answering a judgment ask passes it via the ANSWER TEST in A.1 — do not re-litigate the gate here"
8. F.1: "**An ANSWER-TEST pick ALWAYS produces this carrier**"
9. Schema `general_praise`: "True when this source carries holistic place-level endorsement or an ANSWER-TEST pick"

**Judgment: mostly load-bearing, one deletion.** Copies 3, 5, 8 are each a
*different consequence* at a different decision point (does a findability answer
emit / does a shopping ask kill the pick / does the pick produce a carrier) —
those are new information, not echo. Copy 1 is the naming. Copy 2 is the home.

Copy 4 (**A.4's second paragraph**) is pure restatement — "Silence about quality
is not a failure of the TESTIMONY TEST; it is what an answer to a rec request
normally looks like" repeats A.1's "testimony is satisfied with no adjective, no
verb, and no dish" and the preamble's "the name IS the verdict". Copy 7 goes
away with F4.

**Rederivation.** Delete A.4's second paragraph (A.4 shrinks to its first two
sentences). Everything else stays, but each consequence-site should carry a
one-token citation `(A.1)` rather than a re-argument.

**Saving: ~60 words.**

**Behaviors at risk:** bare-name picks emit ("Adrienne's in FiDi"); list picks
emit entry-by-entry; annotated lists emit; "Bar Snack & Paradise Lost as well"
emits; a classified/heading-organized answer still emits every entry; a grocery
ask's picks emit **nothing**; a fact-ask's answers emit nothing.

---

## F7 — MEDIUM. Two lists are standing in for tests that are already crisp

**(a) D.1's judge-word roster — 24 words.**

> `delicious`, `tasty`, `amazing`, `incredible`, `insane`, `flavorful`,
> `seasoned perfectly`, `solid`, `best`, `elite`, `top notch`, `quality`,
> `specialty`, `favorite`, `standout`, `award winning`, `worth the trip`,
> `must-try`, `hidden gem`, `iconic`, `famous`, `world class`

The governing test is stated immediately below it and is perfectly crisp: "**could
the same word describe a BAD dish?** \"spicy\" yes… \"delicious\" no". A
22-item roster after a working test teaches nothing the test does not, and its
length invites the closed-world reading ("`fire` isn't on the list"). **Shrink to
three that span the space**: a flavor-praise word (`delicious`), a
reputation-praise word (`hidden gem` — the one a model most often mistakes for a
venue property), and a rank word (`best`).

**Saving: ~35 words.** **Behaviors at risk:** `award winning`, `famous`,
`iconic`, `specialty`, `worth the trip`, `must-try` must all still drop — these
are the *reputation* family and are the likeliest to leak into
`place_attributes` if the roster shrinks. Pin all six.

**(b) D.2's FAILS roster — 14 words.**

> `rich`, `light`, `thin`, `thick`, `heavy`, `simple`, `hearty`, `old school`,
> `classic`, `authentic`, `traditional`, `generous portions`, `bright`, `clean`,
> `filling`

Here the *following sentence already teaches the whole class perfectly*: "A
**light roast**, a **light marinara**, and a **light meal** are three unrelated
senses". That is a complete-class example — one word, three senses, the
mechanism visible. And the prompt then says so out loud: "This is not a word
list to memorize — it is a test to run." **Take its own advice**: keep `light`
(the taught case) + `authentic` and `generous portions` (the two that come from
different families — cultural-claim and quantity-claim) and cut the rest.

**Saving: ~25 words.** **Behaviors at risk:** `classic` and `traditional` must
still drop (they are the ones D.2 later has to re-except in "classic banh mi on
a menu is a dish name"); `old school`, `hearty`, `filling` must still drop.

**(c) NOT recommended for trimming.** C.2's classifier list ("wrap, taco,
sandwich, roll, burger, pasta, soup, salad, pizza, bowl, plate, noodle,
dumpling, bao, bun, fry, sando, arepa …") and C.3's "Common parents" table
(cake/brownie/pie → dessert; pho/ramen/udon → soup; etc.) look like the same
defect but are not: they are **coverage data**, not a rule — they exist to make
the category graph consistent across millions of mentions, which is a
consistency requirement a test cannot deliver. They do violate the
no-non-exhaustive-list canon in *form* (the trailing "…"), and the honest fix is
to move them to code as a deterministic parent-class map — an owner call and a
real project, not a compression. Flagging, not recommending.

---

## F8 — MEDIUM. F.1 and F.2 argue for a constraint the schema makes structurally impossible

The schema file's own comment states the intent (lines 280–286):

> "Two mention shapes, structurally exclusive… The invalid combination — praise
> flag on a dish row — is **unrepresentable at the decode layer, replacing the
> F.1 split-before-emitting instruction**."

The replacement did not happen. F.1 still spends a paragraph arguing it:

> "The shape enforces this: **a PLACE mention (no `item` field) is the only
> shape that carries `general_praise`; a DISH mention (non-null `item`) has no
> praise flag at all** — the dish connection IS its endorsement."

and F.2 restates the union a third time:

> "A mention then takes exactly ONE of two shapes: **A PLACE mention** adds
> `general_praise` (REQUIRED boolean) and NO dish fields… **A DISH mention**
> adds `item`… and has NO `general_praise` field."

Under constrained decoding the model **cannot** emit the forbidden combination.
Prose defending an impossible state is the purest form of "survived because it
was certified before" — it was written when the flag was a free boolean.

**Rederivation.** F.1 keeps only the *placement decision*, which is a real
judgment the schema cannot make (does this praise aim at the dish or the place?
does a pick that also names a dish produce both?). Delete the "shape enforces
this" paragraph. F.2's two-shape block collapses to one sentence pointing at the
schema. Note the v17 red team's finding 3 here as context: refusing praise-on-a-dish
rows would have deleted 8.1% of v16 mentions — the structural fix is the right
one, which is exactly why the prose is now surplus.

**Saving: ~110 words.**

**Behaviors at risk:** a pick that names a dish emits **both** the dish mention
and the place carrier ("best phở?" → "Phở Lệ ở quận 5" → two mentions); dish
praise creates **no** carrier ("the brisket is unreal" → one dish mention only);
one carrier per source per restaurant; a PLACE mention with no attributes and
`general_praise: false` is not emitted.

---

## F9 — LOW-MEDIUM. Prompt/schema duplication: which side owns each statement

The schema descriptions are the right length overall (they are field-level
reminders at the point of emission, which is a legitimate second decision
point). Three statements are near-verbatim prompt copies and should be **thinned
to a pointer on the schema side**, because the prompt is where the judgment
happens:

| Statement | Prompt home | Schema copy | Owner |
|---|---|---|---|
| The two licensed `place_source_id` cases | B.3 bullet | `PLACE_SOURCE_ID_SCHEMA` (near-verbatim, both cases spelled out) | **Prompt.** Schema → "id of the source containing the emitted name form; usually `source_id` (B.3)" |
| The bare-generic-list-slot rule ("Best", "Good") | B.1 + B.3 override bullet (already 2 copies) | `PLACE_OBSERVED_SCHEMA` (a 3rd copy) | **Prompt.** Schema drops it |
| Fit-assertion carry-over of ask constraints | Step D opener, D.4, E (3 copies) | `PLACE_ATTRIBUTES_SCHEMA` (a 4th) | **Prompt** (Step D opener after F4). Schema → "…plus fit-asserted ask constraints (Step D)" |

Three that the **schema should own outright**, because they are field mechanics
with no judgment in them, and the prompt can drop its copy:

- `is_menu_item` inherited-dish rule → schema already says it exactly ("false
  for any dish inherited from the ask or a parent — a dish this source never
  named is never true"); after F4, keep the prompt's one-line version and let the
  schema carry the elaboration.
- "empty is the normal output" for `item_attributes` / `ingredients` → schema
  says it; the prompt says it in D.5 and C.5 as well. Schema wins; the prompt's
  D.5 "**It is correct to emit an empty attribute array for a glowing comment
  whose only modifiers were praise**" is the *teaching* version and stays.
- `source_id` copied exactly from the payload → the chunk-constrained variant
  (`collectionResponseJsonSchemaForSourceRefs`) makes typos **impossible by
  enum**; F.2's "Never invent, reformat, or borrow another source's id" is the
  same class of surplus prose as F8. Keep one short line, drop the elaboration.

**Saving: ~90 words prompt-side, ~50 schema-side.**

---

## F10 — LOW. Structural: a from-scratch rederivation would reorder three things

Not compressions — shape fixes. Listed for completeness; each is cheap and each
removes a forward-reference the model has to hold in working memory.

1. **B.2's `PLACE TEST` inherits-the-ask's-MODE paragraph is a third
   inheritance home** (after C.1 Gate 3 and Step D). It is correctly placed —
   the mode question *is* the place test — but it should cite the ANSWER TEST
   rather than restate its conditions.
2. **C.1's Gate 3 forward-references Step E** twice ("`is_menu_item` stays false
   — Step E", "usually a FAMILY, `is_menu_item: false` — Step E"). After F4
   shrinks E, these become the natural home for the rule and E can stop
   re-teaching. Fold the flag-setting into Gate 3 and E becomes almost vestigial
   — which is the honest reading: **is `is_menu_item` a step, or a field?** A
   from-scratch rederivation would make it a field rule inside C, and the
   pipeline would be **A→B→C→D→F**, five steps, not six.
3. **The preamble names FOUR tests but the prompt runs FIVE.** THE ANSWER TEST
   is introduced as a sub-clause of the TESTIMONY TEST ("One named satisfier"),
   yet it is cited by name 8 times across four sections as an independent gate,
   and F.1 and the schema both treat it as a first-class condition. Either
   promote it to a named fifth test in the preamble, or stop citing it by name.
   Same question for THE OBSERVATION LAW proposed in F2. **Owner call**: my
   recommendation is five named tests + one named law, because the prompt's own
   citation behavior already treats them that way.

---

# Compression ledger

| # | Change | Words saved | Risk |
|---|---|---:|---|
| F1 | Wrapper machinery → one home (C.1 Gate 1), test replaces roster | ~400 | Medium — pin 10 gold cases |
| F4 | Step E → `is_menu_item` only; move inheritance to C/D | ~450 | Medium — pin 8 gold cases |
| F2 | Name THE OBSERVATION LAW; kill B.3's duplicate diacritics rule | ~130 | Low |
| F8 | Delete prose defending a structurally impossible state | ~110 | Low |
| F9 | Thin prompt/schema duplicates to pointers | ~90 | Low |
| F5 | Delete A.3, fold its one unique clause into the Step A opener | ~70 | Low |
| F6 | Delete A.4's restatement paragraph | ~60 | Low |
| F7 | Trim D.1 (24→3) and D.2 (15→3) rosters | ~60 | Medium — pin 9 words |
| — | **Total** | **~1,370 (12.7%)** | |

**Top 3 that lose nothing** (highest confidence, in order): **F4** (Step E
collapse — largest saving, and every behavior it carries already has a home
upstream), **F8** (prose about an unrepresentable state), **F1** (wrapper
unification — largest saving after F4, and it *fixes* a live divergence rather
than merely shrinking).

---

# Master "behaviors at risk" list — pin every one of these before any rewrite

The 161-loss lesson: a compression that removes an unnamed behavior is a
regression nobody attributes. Every behavior below is currently produced by text
this document proposes to move or delete. Each needs a pinned gold case in the
iteration bench **before** the edit, and a flip-rate probe after.

**Wrappers (F1):** wagyu tasting menu→wagyu · nigiri special→nigiri · chicken
special→chicken · lunch special→no item + `good value` + praise carrier · 3/4
course menu · happy hour deal · $25 combo · elvis presley combo · game day deal ·
tuesday special · deal-components never emit · salmon omakase vs salmon tasting
menu · omakase/dim sum as food not attribute · bare `tasting menu` as venue
attribute · ploughman's lunch vs lunch · **lunch buffet / lunch combo** (the
drifted pair).

**Inheritance & is_menu_item (F4):** best burger joint→burger · quán phở nào
ngon nhất→phở · Phở Lệ never mints phở from its name · nice dinners on a
budget→nothing · lunch spots→nothing · best Indian around→`indian` place-side
only · Mexican restaurant vibe→`mexican` place-side, empty food slots · every
inherited dish `is_menu_item:false` · Bread's babka true · omakase at Sushi
Nakazawa true · Levain cookies / Lady M cakes / Raku's udon false · hedged reply
asserts nothing from the ask.

**Observation law (F2):** minetta · sho · dominic ansel · switf's · café crème ·
phở lệ · luckys-in-a-Lefty's-thread · al pastor taco→[] · Momoya soho/La
dong/shuka→zero cuisines · 1618 Asian Fusion→no cuisine · Birria-Landia→no
birria · chicken tikka masala→no `indian`.

**Clause law (F5):** porchetta ribs (7.3) withheld · I love Uroko but their
handrolls · half this list is overrated but Chivito d'Oro · 6 dollar beers /
18 dollar spritzes inside a rave · verdicts never transfer between entries ·
attributes never transfer between mentions.

**Answer test (F6):** Adrienne's in FiDi · Pho phong luu/Tan My/Fresh Bowl/Sip
Pho · Cabernet Grill for dinner / Sunset Grill for breakfast · Bar Snack &
Paradise Lost as well · classified/heading-organized answer emits every entry ·
grocery-ask picks emit nothing · fact-ask answers emit nothing · "not
spectacular but on the cheaper side" strips its own entry only.

**Praise shape (F8):** pick + inherited dish → dish mention AND place carrier ·
dish praise → no carrier · one carrier per source per restaurant · empty
false-praise PLACE mention not emitted.

**Attribute rosters (F7):** award winning · famous · iconic · specialty · worth
the trip · must-try (reputation family, must drop) · classic · traditional · old
school · hearty · filling (standalone-fail family, must drop) · classic banh mi
stays a dish name.

---

# Immediate action, independent of any rewrite

Fix `SEARCH_QUERY_RESPONSE_JSON_SCHEMA.required` (F3a) — it names two fields
that do not exist. One-line change, no behavior at risk.

Then take the F3b cuisine contradiction to the owner as a ruling, not a cleanup:
the search-query schema's dish-side cuisine is the read-side twin of the write-side
change this prompt makes, and the two must move together or search returns fewer
results (v17 red team item 5).
