# Judge Ledger Audit — how the current sameness judges actually perform

Audited 2026-08-30 from the staging decision ledgers (`claim_verdicts` +
`llm_decision_records`), read-only. All counts below are real query results;
all rulings are hand judgments on sampled rows, with verbatim examples.

Ledger inventory (staging):

| lane | store | rows | outcomes |
|---|---|---|---|
| entity_match | claim_verdicts | 9,727 | match 1,102 / new 8,625 |
| entity_dedupe | claim_verdicts | 38 (22 real + 16 rehearsal probes) | merge 6 / hold 16 / new 16 (probes) |
| attribute_placement | llm_decision_records (kind=`attribute_placement`) | 9,587 | reject 6,391 / new 1,754 / match 1,442 |

(The attribute lane never writes to `claim_verdicts` on staging — the
`attribute_merge` lane adapter exists but has zero verdict rows; placement
decisions live only in `llm_decision_records`.)

---

## Lane 1: entity_match (birth-time ONE-THING judge)

### What the judge sees (context inventory)

Prompt: `apps/api/src/modules/external-integrations/llm/prompts/entity-match-prompt.md`.
Invocation: `entity-resolution.service.ts` `performLlmMatches` →
`llmService.matchEntitiesBatch` (~10 terms per request), plus a per-term
intra-batch overlay judge for unpersisted primaries.

Per call the judge gets, and ONLY gets:
- `term` — the extracted normalizedName (folded free text).
- `kind` — place / item / ingredient.
- `candidates` — K=8 shortlist (K tested vs 15 on 2026-07-11), each with
  `name` + `aliases`. Shortlist is market-scoped and pre-filtered by
  name/meaning; remembered-'new' pairs are struck before the call.

It does NOT see: the source quote or thread, the restaurant either name is
attached to, menu presence, mention counts/co-occurrence, or the candidate's
kind-of-place. Verdicts are keyed per (term, candidate) pair — one term
produces up to 8 ledger rows.

### Outcome stats

| kind | match | new | match rate |
|---|---|---|---|
| place | 543 | 2,235 | 19.5% |
| item | 457 | 5,155 | 8.1% |
| ingredient | 102 | 1,235 | 7.6% |

### Hand-judged accuracy (170 stratified: 60 match, 110 new, all kinds) + targeted probes

**match direction (60): 54 CORRECT, 3 WRONG, 3 UNDECIDABLE → ~90–95% correct.**
Every WRONG found:

- `shanghai lumpia` → matched `lumpia` ("specific subtype matches general
  category alias") — WRONG per the prompt's own "broader never matches
  specific" rule; a Shanghai lumpia is a distinct order.
- `central texas slow-smoked bbq` → matched `bbq` ("regional style variant of
  generic category") — WRONG merge; regional style folded into the generic.
- `vegan reuben` → matched `veggie reuben` ("vegan and veggie are synonyms")
  — WRONG; the same corpus correctly split `vegan tasting menu` from
  `vegetarian tasting menu`. Dietary distinction, and internally inconsistent.

UNDECIDABLE (each hinged on evidence the judge asserted but wasn't given):
- `san diego style burrito` → `carne asada burrito` via claimed alias — needs
  the alias list / menu to verify.
- `no. 16 noodles` → `noodle with meat and bean sauce` ("shorthand alias") —
  needs the actual menu; a number-to-dish mapping is restaurant-local.
- `wasabi aoli` → `wasabi mayo` — aioli≠mayo strictly; needs how the
  restaurant itself names it.

**new direction (110): ~99% correct as binary verdicts** (only clear
wrong-split-lean: `texmex taco` vs `taco`). But two systemic diseases hide
inside the "correct" news:

1. **No reject outcome — junk terms mint entities.** ~8/110 sampled news are
   garbage terms that should never become entities: `5 piece`, `53 extra
   veggies`, `South Lamar Location`, `mushroom based one`, `classic`, `clay`,
   `cask`, `small plate`, `Lee`. The judge's reasons even say so ("generic
   quantity without a noun is too ambiguous", "ambiguous location-only name")
   — but `new` is the only non-match option, so each mints a spurious entity.
2. **Modifier fragmentation.** Correct-per-rules news that fragment one
   diner-concept: `cheeseburger on texas toast`, `mac n cheese w crab`,
   `green bell pepper` vs `bell pepper`, `pickled okra` vs `okra`, plus the
   omakase swarm below. This is the named-offering fragmentation problem the
   prompt's spec-splitting rules produce by design.

**Owner sore-spot probes:**

- *omakase vs sushi omakase*: **no merge verdict exists in this ledger** for
  that pair — both live as separate canonicals, alongside `steak omakase`,
  `tea omakase`, `chicken omakase`, `cocktail omakase`, `vegan omakase`,
  `vegetarian omakase`, `kaiseki`, `home-makase`. On staging the live disease
  is the opposite of the OTOKO complaint: `20 course omakase experience`,
  `in-home omakase`, `take home omakase`, `soto omakase` (a NYC restaurant
  name judged as an item!) were all `new` — an 12+-entity omakase swarm where
  a diner has maybe 3 concepts. One questionable merge: `kyoto style kaiseki
  omakase` → `kaiseki`.
- *attribute words under kind item*: handled correctly — `crispy` judged
  `new` vs 8 crispy-dishes with reason "generic texture/adjective" — but
  again `new` mints a `crispy` ITEM entity because there is no reject.
- *cross-language/diacritics*: strong. 25/25 sampled non-ASCII matches
  correct (`bún bò huế`=`bun bo hue`, `crème fraîche`, `Café Malta`,
  `Matt'el Rancho`→`Matt's El Rancho`). Places are the lane's best kind.

**Error economics:** wrong-merge ≈ 3/60 of matches (~5% of merges, ~0.6% of
all verdicts). Wrong-split ≈ ~1% of news. The judge honors "doubt says new"
faithfully — the cost has moved downstream into fragmentation + junk minting.

---

## Lane 2: entity_dedupe (post-hoc dish sweep)

Service: `food-dedupe-merge.service.ts`. Pairs found by trigram candidate
scan; deterministic token-multiset rule first, batched LLM judge for the
rest; verdict memory added after the no-memory re-buy bug; judge lanes
gated (`judgeHeld` when off). Judge context: the two names only.

22 real verdicts, **all 22 hand-judged: 22 CORRECT (100%)**.
- 6 merges, all `identical names` token-multiset cases (`lime butter` ×2 etc.)
  — trivially right.
- 16 holds, all right and impressively so: `dumpling soup` vs `soup dumplings`
  ("soup with dumplings vs dumplings filled with soup"), `espresso shake` vs
  `shaken espresso`, `lobster hand roll` vs `lobster roll`, `thai fried
  chicken` vs `chicken fried chicken`, `chocolate cookie` vs `chocolate chip
  cookie`.

No errors found; the sample is tiny because the lane has barely run (gate
mostly off). Nothing here needs fixing before rederivation; note it inherits
whatever fragmentation the birth-time judge leaves behind and, seeing only
two bare names, could never safely merge the omakase swarm.

---

## Lane 3: attribute_placement

### What the judge sees

Prompt: `attribute-placement-prompt.md` (3-test gate: describe-vs-judge,
standalone, scope; then bidirectional interchangeability). Service:
`attribute-ontology.service.ts` — embeddings for recall, shortlist =
union of three signals (embedding top-K + shared-significant-token +
trigram-near), LLM for precision; candidates frozen per batch. Judge gets
`term`, `kind`, candidate names (no ids' usage data, no example mentions).

**Wart found:** the prompt defines kinds `place_attribute` / `item_attribute`
but the service sends `restaurant_attribute` / `food_attribute` (9,567 rows);
only 22 stray rows use the prompt's own kind names. The judge is inferring
the mapping.

### Outcome stats

| kind sent | reject | new | match |
|---|---|---|---|
| food_attribute | 3,581 | 724 | 334 |
| restaurant_attribute | 2,796 | 1,028 | 1,102 |

67% of all placements are rejects — the lane is mostly a garbage filter.

### Hand-judged accuracy (105: 45 match, 35 reject, 25 new)

**match (45): 38 CORRECT, 4 WRONG, 3 borderline → ~84–91% correct.**
Every WRONG:
- `great batter` → `battered` — praise passed the describe-vs-judge gate and
  then got merged; reason field literally "match".
- `double meat` → `generous portions` — an order modification merged into a
  portion filter; not interchangeable either way.
- `piano bar` → `live music` — violates the prompt's own "narrower filter
  people seek on purpose" rule (its rooftop example exactly).
- `pizza truck` → `food truck` — a pizza-truck searcher is not satisfied by
  any food truck; cuisine got erased.

Borderline (lean wrong): `winter` → `seasonal`, `farm` → `farm to table`,
`32 oz` → `generous portions`.

**reject (35): 33 CORRECT, ~2 inconsistent-wrong.** The gate is good at
cuisines (`malaysian`, `nepali`, `desi`), ingredients (`sea salt`,
`tomatillo`), praise (`beautiful`, `authentic`, `reliable`). The failure is
an unstable **regional-style axis**: `nashville style` and `sonoran-style`
rejected as cuisine while `nashville hot`, `nj style`, `texas-style`,
`neapolitan style` were accepted as attributes — same axis, coin-flip
outcome.

**new (25): 25 CORRECT.** Spot-checked the scary-looking ones
(`creamy`/`savory` → new): their shortlists genuinely lacked a twin at the
time — legitimate first coinings, not wrong splits.

**Ledger hygiene defect:** 836 of 1,442 match decisions (58%) carry the
literal string "match" as their reason — the evidence requirement is being
ignored more often than honored, which hollows out exactly the audit trail
this exercise depends on.

---

## What context was missing — aggregated, per-verdict → curation recommendation

Every WRONG/UNDECIDABLE above was re-examined for "what single extra fact
would have decided it." Ranked by how many verdicts it would have flipped:

1. **The source mention text (quote + thread restaurant).** Decides: `no. 16
   noodles` (menu-local numbering), `soto omakase` (it's a restaurant, not a
   dish — the thread says so), `Lee` / `South Lamar Location` (anaphora for a
   specific place named upthread), `san diego style burrito`, `shisho` (typo
   of shiso vs a dish). The judge is resolving *references* while seeing only
   the *surface string*. This is the highest-value addition by far.
2. **A reject/garbage outcome for entity_match** (context in the schema sense):
   the junk-minting class (`5 piece`, `clay`, `cask`, `classic`,
   `mushroom based one`) needs a third verdict, not more evidence — the judge
   already articulates the garbage-ness in its reasons and then has nowhere
   to put it.
3. **The candidate's home restaurant(s) + whether term and candidate co-occur
   at one restaurant.** Decides the merge-vs-fragment cases: `shanghai
   lumpia`→`lumpia` and the omakase swarm are one dish when they live at one
   restaurant's thread and different offerings when they don't (the OTOKO
   lesson: same words, different restaurants ⇒ different things). A
   same-restaurant flag would let a rederived judge unify `20 course omakase
   experience` into that restaurant's `omakase` while keeping OTOKO's two
   omakases apart.
4. **For attribute matches: 2–3 example uses of each canonical** (or its top
   co-occurring dishes). `piano bar`→`live music` and `pizza truck`→`food
   truck` both die once the candidate is grounded in what diners actually
   filter for; bare 1–2-word names invite plausible-sounding folds.
5. **An explicit regional-style ruling in the attribute prompt** (is
   `X-style` a cuisine-reject or a style-attribute?) — pure prompt gap, the
   inconsistency is doctrinal, not evidential.
6. **Enforce non-degenerate reasons** (schema-level: reason may not equal the
   outcome token) — 58% of attribute match rows are unauditable today.

What the ideal judge call should include, concretely: term + kind +
shortlist (names + aliases) **+ the verbatim mention sentence + the thread's
restaurant + per-candidate: home restaurant name(s) and a same-restaurant
flag + a reject outcome (entity_match) + 2–3 usage examples per candidate
(attributes)**. Everything else audited here (diacritics, brand tokens,
error-economics asymmetry) the current prompts already do well — keep it.

---

## Bottom line

| lane | hand-judged accuracy | wrong-merge rate | wrong-split rate |
|---|---|---|---|
| entity_match | ~93% of sampled verdicts | ~5% of matches (3/60) | ~1% of news |
| entity_dedupe | 22/22 (100%) | 0 | 0 |
| attribute_placement | ~90% (95/105) | ~9% of matches (4/45) | 0/25 news; ~2/35 rejects inconsistent |

Top failure patterns: (1) junk terms minted as entities because entity_match
has no reject verdict; (2) modifier/format fragmentation (the omakase swarm)
— splits that are each "correct" but collectively wrong for diners; (3)
subtype-into-category folds that violate each prompt's own narrower-want
rule (`shanghai lumpia`→`lumpia`, `piano bar`→`live music`,
`pizza truck`→`food truck`).
