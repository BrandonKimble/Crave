# Named-offering fragmentation study (2026-08-29)

Corpus research backing the "named offerings are dishes" rederivation
(plans/extraction-ideal-spec.md, "Named-offering dishes"). Question: if
omakase / tasting menus / named combos become dishes, does one restaurant
accumulate "combo", "$25 combo", "lunch combo", "elvis presley combo" as
separate items? All numbers from staging (8,338 active places, 3,941 active
items; queries run 2026-08-29).

## 1. Fragmentation census

Restaurants with 2+ items whose names share a format-family word
(word-boundary match, non-category connections only):

| family  | restaurants with any | with 2+ in family |
|---------|---------------------|-------------------|
| plate   | 52 | 8 |
| omakase | 23 | 4 |
| tasting | 15 | 2 |
| combo   | 15 | 1 |
| box     |  5 | 1 |
| special | 14 | 0 |
| lunch   | 10 | 0 |
| pairing |  9 | 0 |
| thali   |  1 | 0 |

16 clusters at 15 restaurants total — small in absolute terms today. Judged
one by one against their source texts:

**Genuinely fragmented (same offering, multiple item entities):**

- **P Thai's Khao Man Gai & Noodles** — `combo` (3), `chicken combo` (1),
  `khao man gai combo` (1). Sources show ONE offering: "I got the combo and
  that's the best of both worlds" and "I had the Khao Man Gai combo ($18)"
  come from the same conversations; one doc even feeds both `combo` and
  `khao man gai combo`. 3 entities, 1 real thing. This is exactly the
  owner's feared shape.
- **Hecho En Mexico** — `mole plate` (5), `three mole plate` (2),
  `3-mole enchilada plate` (3). Same dish: "Be sure to try Hecho en Mexico's
  three mole plate" credits `mole plate` AND `three mole plate`; "I love
  their 3-mole enchilada plate" credits `3-mole enchilada plate` AND
  `mole plate`. 3 entities, 1 real thing.
- **Soto** — `omakase` (2) + `soto omakase` (1). "We got the Soto Omakase
  for my birthday" — the venue's name inside a dish name (already banned by
  the extraction spec); same offering as `omakase`.

**Genuinely distinct (a real venue really has several format-family offerings):**

- **OTOKO** — `omakase` (10) + `sushi omakase` (1): "Otoko does a true Tokyo
  style sushi omakase on Wednesday nights. The other nights are a Kyoto style
  kaiseki omakase." Two orderable offerings; the generic `omakase` bucket
  legitimately overlaps both.
- **Uchi / Uroko / Barley Swine** — `omakase` vs `vegetarian omakase`,
  `tasting menu` vs `vegetarian tasting menu`: distinct offerings a diner
  picks on purpose.
- The plate clusters (Rosas migas/taco plate, Tacos Durango fajita/migas,
  Shoyu Sugar chicken/red rocks, Uroko sashimi/temaki, Eldorado mole/nomad)
  are different dishes that happen to share the word "plate" — not
  fragmentation.

So: **~3 of 16 clusters are true fragmentation, ~13 are real distinct
offerings.** The generic-vs-named split (a venue with both "combo" and named
combos) occurred at 1 restaurant (P Thai's). The distinct-offering pattern
(generic omakase + a dietary/style variant) is the more common cluster shape.

Other format-word verbatim reality (corpus-wide item names): `combo` (1
restaurant), `combo plate` (2 — one of which, Chuy's, sits beside
`elvis presley combo` sourced from the SAME review thread), `dh special`,
`fish special` (Bill's Oyster — actually "fish of the day"), `lazybones
special` (Texas Chili Parlor — a real named dish: "pork chops smothered in
queso & habanero chili"), `sake pairing` (4), `wine pairing` (4), `tasting
menu` (13), `omakase` (22 restaurants, 78 mentions — the workhorse).

Side finding: `Tcp` and `Texas Chili Parlor` exist as two unmerged
restaurant entities, both carrying `lazybones special` from the same docs.

## 2. Beyond formats — is fragmentation broader?

Within-restaurant item pairs at trigram similarity > 0.65: **98** exist right
now; another **270** sit in the 0.55–0.65 band. Sampling the top pairs, most
are legitimately distinct ("spicy chicken sandwich" vs "chicken sandwich",
"margarita" vs "mango margarita") — but real unmerged fragments are in
there: `tres leches` vs `tres leches cake` (4 restaurants), `barbacoa` vs
`barbacoa taco` (2), `petes tantalizing` vs `petes tantalizing tacos`
(Maudie's), `salsa` vs `salsa x` (Eldorado), `stupid hot chicken` vs
`stupid hot chicken sandwich` (Tumble 22).

**Why candidatePairs was only 15 in the last sweep** (read
apps/api/src/modules/content-processing/entity-resolver/food-dedupe-merge.service.ts):
the sweep scans GLOBAL entity pairs with `similarity(a.name,b.name) > 0.65`
(floor derived 2026-08-03, F470) plus a token-multiset word-order lane, and
carries verdict memory — already-judged pairs are never re-bought. 15 is the
NEW backlog, not the universe. But the generation misses the format-family
pairs structurally:

- `mole plate` / `three mole plate`: sim **0.647** — just under the 0.65 floor.
- `omakase` / `sushi omakase`: **0.571** — under.
- `omakase` / `vegetarian omakase`: **0.421** — far under.
- `combo` / `khao man gai combo`: **0.316** — far under.
- `combo` / `$25 combo`: **0.667** — the only one that would surface.

So the sweep never even sees the generic-vs-specific family. That is partly
protective (see §4), but it means nothing in the pipeline today merges the
P Thai's or Hecho fragments.

## 3. ONE-THING judge: placement and live probe

**Where the judge runs** (entity-resolution.service.ts): both at INGEST —
tier 3 of resolution, after exact/alias/joined-identity, for offline
consumers with `useLlmMatcher` on (place/item/ingredient) — and inside the
dedupe sweep's judge lane (batched, via settleDedupeVerdict). So a new
mention's name IS judged against recalled neighbours at extraction time,
with decision records preventing re-asks.

**Live probe** (dev Gemini via LLMService.matchEntity, kind 'item',
single-candidate shortlists, run 2026-08-29):

| term vs candidate | verdict | judge's reason | matches product sense? |
|---|---|---|---|
| chef's tasting vs tasting menu | **match** | culinary synonyms for a multi-course meal | YES |
| combo vs $25 combo | new | generic category vs specific price-point offering | correct globally; leaves the per-venue fragment |
| elvis presley combo vs combo | new | specific named combo vs generic category | correct globally; same caveat |
| omakase vs sushi omakase | **match** | shorthand for the same dining experience | RISKY — at OTOKO these are two distinct offerings |
| omakase vs vegetarian omakase | new | dietary restriction vs general | YES (Uchi/Uroko distinct) |
| lunch special vs executive lunch | new | generic vs specific menu offering | YES (safe) |
| mole plate vs three mole plate | new | specific quantity vs generic dish | NO — sources prove same dish at Hecho |
| three mole plate vs 3-mole enchilada plate | **match** | numeric variant, same dish | YES |
| khao man gai combo vs combo | new | specific dish vs generic category | correct globally; leaves the P Thai fragment |
| soto omakase vs omakase | new | restaurant-branded vs generic | the term should never exist (venue name in dish) |
| margherita vs pepperoni pizza (control) | new | different topping | YES |
| tasting menu vs brisket taco (control) | new | different category | YES |

Read on the results: the judge is doctrinally CONSISTENT — its own prompt
says "a broader category never matches a specific dish in either direction"
and "doubt says new." So **the assumption that the ONE-THING judge unifies
generic-vs-named format fragments is FALSE, by design.** It unifies true
synonyms (chef's tasting = tasting menu, 3-mole variants) and would even
over-unify one (omakase = sushi omakase, wrong at OTOKO).

## 4. The structural fact that decides pipeline placement

**Dish entities are corpus-GLOBAL.** `combo` is one entity; `omakase` is one
entity shared by 22 restaurants. Merging `combo` into `khao man gai combo`
at the ENTITY level would move every restaurant's generic combo credit onto
one Thai dish. The same for `omakase` → any specific omakase. Therefore:

- The entity-level judge and the dedupe sweep are the WRONG owners for
  generic-vs-named unification, and their refusals above are correct
  behavior, not bugs. Do not lower the 0.65 floor to chase these; it would
  only surface pairs the judge must refuse (or worse, merge globally).
- The fragmentation is a PER-RESTAURANT phenomenon: "the combo" in a khao
  man gai thread means one specific offering at one venue. Only two layers
  see that context: extraction (the thread) and the connection layer
  (restaurant_id × food_id).

## Recommendation — the merging story to ship with the named-offering rule

1. **Extraction-time is the primary owner (prompt: most-specific-name
   resolution within the document).** A bare format word ("the combo",
   "their omakase", "that plate") whose thread names a more specific
   offering at the same restaurant is a PRO-FORM of that offering — emit the
   specific name ("khao man gai combo", "three mole plate"), exactly like
   the existing pro-forms-resolved-or-dropped dish law. A bare format word
   with NO more specific antecedent stays as-spoken ("omakase" alone is a
   fine dish). This kills the P Thai's and Hecho shapes at birth, inside
   machinery (dish-as-spoken + pro-form resolution) the prompt already has.
   The `soto omakase` case is already covered by the venue-name-never-inside-
   a-dish-name law — enforce it in the rederivation gold cases.
2. **True-synonym unification stays with the ingest-time judge — it already
   works.** chef's tasting = tasting menu and the 3-mole spelling variants
   merge correctly. One calibration case to pin in entity-match gold:
   `omakase` vs `sushi omakase` must be NEW (a venue can run both a sushi
   and a kaiseki omakase — OTOKO does), i.e. treat a style-qualified format
   like a dietary-qualified one. Today's judge merges it.
3. **The dedupe sweep needs no new lane for formats.** Its floor already
   excludes the family, correctly, because entity-global merges are the
   wrong tool. Leave it; the real dedupe gaps found are ordinary ones
   (`tres leches`/`tres leches cake` at 0.687 sits under no lane's reach —
   below-floor band 0.55–0.65 holds 270 within-restaurant pairs, mostly
   legit; not worth chasing pre-launch).
4. **What falls through and stays open:** cross-document generic mentions —
   doc A says "khao man gai combo", doc B (different thread) just "the
   combo". Extraction can't see across docs; the entity judge must refuse.
   If this residue ever matters at scale, the owner is a CONNECTION-level
   fold (per-restaurant: a bare-format-word connection folds into the
   venue's single more-specific same-family offering when exactly one
   exists), not entity dedupe. At today's scale (~3 fragmented restaurants
   of 8,338) it does not yet earn building.

Scale honesty: current fragmentation is tiny (3 true clusters). The rule
change will grow the class (more format phrases become dishes), which is
exactly why the prompt-side pro-form rule (#1) should land WITH the
rederivation, and the judge calibration case (#2) in the same wave.
