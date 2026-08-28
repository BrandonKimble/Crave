# Full-population miss hunt — Austin corpus vs. v17 shadow replay (2026-08-27)

Subject: every short/plain compliment in the **entire** austinfood corpus that the v17
shadow replay (prompt `collection_system` v14, hash `d68b8b2b081264f7`) failed to credit.
This supersedes the 26-row regression list in
`apps/api/logs/bench-review-20260827-034805.lost-support.report.md`, which sampled 91 of
500 lost-support rows.

---

## 1. Method

**Ground truth for "the shadow emitted something on this source."** Extraction is
document-scoped and a comment IS a document (`collection_source_documents.source_type =
'comment'`), so "did the shadow credit this comment" is a direct join, not an inference.

- Shadow run set: all 127 `collection_extraction_runs` with
  `system_prompt_hash LIKE 'd68b8b2b%'` (118 archive, 6 chronological, 3 keyword),
  **including the recovered `replaySource: banked_refusals` runs** — those replays cut
  span refusals from 884 to **133**, so the miscited-pointer bucket the earlier triage
  called "the single largest recoverable loss" is already ~85% recovered and is NOT a
  driver of what follows.
- Evidence = any row in `core_restaurant_events` ∪ `core_restaurant_entity_events` for
  that `source_document_id` under those runs (17,920 place events + 47,827 entity events).
- Scope check: the shadow's input set covers **39,793 of 39,802** austinfood documents
  (1,358 posts + 38,444 comments). Nothing material is out of scope, so "no evidence" is
  a real silence, never an un-replayed doc.
- **9,747 documents carry evidence** (24.5% of the corpus; 37.2% of comments).

**Detector.** SQL over all 38,444 austinfood comments, four arms named by the A.1 law each
one probes:

| arm | pattern | comments matched |
|---|---|---|
| **I** | `is (so/really) good\|great\|awesome\|amazing\|excellent\|solid\|fantastic\|incredible\|delicious` | 1,274 |
| **D** | `slaps`, `my go-to`, `the best`, `love it/this/them/this place`, `10/10`, `chef's kiss`, `worth it/the`, `never disappoints`, `can't go wrong` | 2,181 |
| **A** | `^(\+1\|this\.\|seconded\|agreed\|came here to say)`, `so good`, `underrated` | 594 |
| **B** | comment < 60 chars containing a capitalised token, under a post whose title/body reads as a rec-ask (573 such posts) | 6,324 |

**Total candidate population: 9,718 comments. 5,580 of them (57.4%) already carry shadow
evidence.** The hunt is the remaining **4,138 with none**.

**Reading.** All 4,138 were dumped with post title, parent-comment text, and full body, and
**all of them were read** (14 batches). Each was classified TRUE MISS (an A.1 law names it
as emitting — quoted below) or CORRECT SILENCE (naming the arm of A.2/B/C that kills it).

**Known blind spot, stated up front:** this detector cannot see **answer-list partial
emission** (a reply naming five places where only three emitted). That doc HAS evidence,
so it never enters the no-evidence population. The B.1 shared-verb miss the earlier
triage flagged (Red River Cafe, Small's Pizza) is therefore *unmeasured here*, not
absolved. See §6.

---

## 2. Headline counts

| | count |
|---|---|
| austinfood comments | 38,444 |
| detector candidates | 9,718 |
| candidates WITH shadow evidence | 5,580 (57.4%) |
| candidates WITHOUT shadow evidence (all read) | 4,138 |
| — of those, **CORRECT SILENCE** | **~3,940 (95%)** |
| — of those, **TRUE MISS** | **~200 (5%)** |

**Correct-silence rate on the no-evidence population: ~95%.**
**Whole-candidate accuracy (emitted or correctly silent): ~98%.**

Per-arm TRUE MISS density from the read:

| arm (no-evidence rows) | rows | ≈ TRUE MISS | rate |
|---|---|---|---|
| B only (short reply under rec-ask) | 3,085 | ~95 | 3% |
| D only (verdict idiom) | 608 | ~20 | 3% |
| I only (`is … good`) | 185 | ~20 | 11% |
| A only (adoption) | 130 | ~20 | 15% |
| **multi-arm (DB/AB/IB/DA/IA/ID/IAB)** | **130** | **~45** | **~35%** |
| total | 4,138 | ~200 | 5% |

The multi-arm rows — a short comment that is BOTH an adoption AND carries a verdict idiom
— are the densest miss pocket in the corpus by a factor of ten.

**The 95% is not the prompt getting lucky.** The junk is thick and the v17 laws name every
class of it. From the read, the dominant correct-silence arms, with quotes:

- **Chatter / reaction / logistics** (by far the largest — most of arm B): "Thank you!",
  "Which location?", "Where is this joint? Details", "Franklin'szzssz'z'zss5zzs".
- **Non-taste criterion asks (A.1 condition 1).** The whole *"At what Austin establishment
  are you MOST likely to get food prepared by someone who is completely stoned?"* thread —
  ~120 candidate comments, essentially all correctly silent. A joke superlative is not a
  food-taste criterion, and the prompt says so in as many words. Same for *"which chain
  location is the 'good' one?"* worst-of chains.
- **Negative / comparative threads.** *"why go to chuy's when you could go to maudie's?"*,
  *"What popular Austin restaurants are aggressively mediocre?"*, *"pick this not that"* —
  hundreds of rows, correctly dead as NEGATIVE CONTENT or yardstick comparisons.
- **PLACE STATUS closure (B.1).** *"Longhorn Poboy had the best gyro wraps of all time.
  RIP"*, *"Alcomar had the best ceviche"*, *"The carrot cake at that place was \*chefs
  kiss\*"* under *"Who Remembers the East Side Cafe on Manor?"* — the ask's own
  gone-criterion frame killing it, exactly as the law specifies. **This is the law doing
  precise work**: warm, quotable, first-person praise, correctly refused.
- **PACKAGED mode (B.2).** The entire *"favorite brand of frozen pizza"*, *"go-to sauce
  from HEB"*, *"best pre-made fresh salsas"*, *"Costco blueberries"* threads. Note this
  **corrects one entry in the earlier triage**: `Dogtown` ("The pepperoni one is really
  good too") was listed there as regression #22; it is a *frozen grocery pizza at Central
  Market* and is CORRECT SILENCE.
- **Unnamed venue consumes its own verdict (B.1).** *"The best spot is the Carnitas truck
  on Montopolis"*, *"The truck in the parking lot next to the Walgreens on bluebonnet is
  great!"*, *"never gone wrong with side of the road barbacoa"*.
- **Praise of a person, not food.** *"Mo is so great at what he does"*, *"Curtis is
  amazing… a very genuine guy"*, *"Ross is the best"*.
- **Hedge / plan / hearsay.** *"Agree. It's so fine in my opinion"*, *"This looks like the
  best bet for sure"*, *"I'm ridiculously excited to go try it now"*.

---

## 3. Root-cause table for the ~200 TRUE MISSES

| # | cause | ≈ count | the law that says it emits | verdict |
|---|---|---|---|---|
| 1 | **Adoption referent — the idiom is outside the prompt's example set** | ~120 | A.1: *"A short agreement ADOPTS the parent's testimony as the writer's own… resolve the referent by the depth-aware order and credit the same restaurant"* | **prompt defect — fixable by text** |
| 2 | **Short plain verdict on a place the source itself names** | ~45 | A.1: *"A verdict has no minimum eloquence. 'is good', 'is great', 'love this place', 'my go-to' are complete endorsements — as complete as a paragraph."* | **capability limit at the margin, aggravated by cause 4** |
| 3 | **Value/deal testimony (Gate 1 NONE)** | ~15 | C.1 Gate 1: *"praise of a deal is VALUE testimony, however strong the verb… all emit"* with `general_praise: true` | **prompt defect — fixable by text** |
| 4 | **Chunk-position attention decay** | multiplier on 1–3, not a separate bucket | — | **chunking-pipeline effect — structural** |
| 5 | Non-Austin place praised in an Austin thread | ~10 | no law excludes it; the prompt is city-agnostic | **owner ruling needed, low value** |
| 6 | Bar/drink-only venues (Elephant Room, Treasury Room) | ~10 | Gate 2: *"a NAMED drink… is a dish as ever"* | **boundary, defensible either way** |

### Cause 1 — adoption referent (the big one)

The A.1 adoption law is stated and its examples are `"+1"`, `"this"`, `"agreed"`,
`"seconded"`, `"came here to say this"`, `"God it's so good"`, `"so good!!"`, `"obsessed"`.
**The idioms this corpus actually uses are a much wider set, and almost none of them
emitted.** Every one of these is a no-evidence row whose parent names one unambiguous
place:

| the reply that emitted nothing | parent it adopts |
|---|---|
| "This is the way." | `Bummer Burrito on Rainey` / `Conan's` / `Koriente` / `Hyde Park Bar and Grill` (4 separate docs) |
| "This is the correct answer." | `Counter at ALC` / `Enchilada y Mas` |
| "Correct" | `Bartlett's` |
| "Facts" | `Combo Donuts on S. Lamar` |
| "Truth!" / "This is the truth." | `Rudy's brisket breakfast tacos` / `Interstellar pork belly burnt ends` |
| "This is the winner." | `Bouldin Creek cafe` |
| "Yessss good call" | `The Lil Darlin chicken sandwich` |
| "Absolutely" | `La Posada` |
| "Seconding Pacha" / "Yes to the pear bacon pancake from Pacha!!" | `Pacha` (3 docs on one thread) |
| "Seconding Micklethwaits" | `Micklethwait` |
| "Seconding Odd Duck!" | `Odd Duck` |
| "Easily Milky Way" / "Yessssss" | `Milky Way Shakes` |
| "I agree, Upper Crust has the best European style pastries." | `Upper Crust` |
| "I concur, this is the best answer!" | `Baguette et Chocolat` |
| "Italian here—these are good recs. I stamp with approval" | a 6-name Italian list |
| "Ever." | "I've never had a bad daily special at `Habanero Cafe`" |
| "Louie's is off the hook!!!" | `Louie's food truck in Buda` |
| "Agree with this. Only place I'll order corn over flour" | `Masa y Mas blue corn` |

**Reading of the failure at the model's-shoes level.** These are not hedges and not
chatter; the model is treating a one-word affirmation as contentless because it carries no
food noun and no adjective of its own. The law that rescues it requires two moves the
model does not make for these forms: (a) recognise the affirmation as a *verdict*, and (b)
reach into the parent for the subject AND set `place_source_id` at the parent
(B.3's second licensed cross-source case). The prompt's own examples are all *stock*
agreement tokens; the corpus is full of *idiomatic* ones ("Facts", "This is the way",
"Truth", "Correct"), and the model does not generalise from the list to the move.

**Verdict: prompt defect, fixable by text — but the fix is a rederived shape, not a longer
example list.** Adding "Facts"/"This is the way" to the examples repeats the mistake that
caused the miss (an enumerable list of idioms, which the prompt philosophy canon
explicitly rejects). The right shape states the *test*: **"a reply whose entire content is
agreement or affirmation — of any wording — asserts the parent's clause as this writer's
own; ask what the parent claimed, not what words this reply used."** That is one sentence,
it is a test rather than a list, and it covers every row in the table.

### Cause 2 — short plain verdicts

These name the place themselves; no referent resolution needed. Still silent:

- "Love this place." → `Boteco`
- "Yes love this place!" → `Cafe Malta`
- "Casa Linda Taqueria. Love that place."
- "85 degrees is AMAZING."
- "That place is terrific. Maybe going for lunch." → `First Chinese BBQ`
- "Their breakfast is to die for" → `Lazarus Brewing`
- "That Dry Fried Chicken is amazing." → `House of Three Gorges`
- "The chicken salad sandwich is amazing" → `Tucci's`
- "Their panaderia is great too" → `Casa Maria`
- "Best in town, IMO. I love the flavor profile!" → `Hoody's Philly`
- "Yes!! Everything is incredible." → `Baguette et Chocolat`
- "Her food is delicious and made with so much love." → `Yeni's`
- "Pound for pound the best restaurant in Austin" → `Sour Duck`
- "They are probably the best roaster in town." → `Flat Track`

The no-minimum-eloquence law is already stated as clearly as it can be. **Length is not
the discriminator** — the corpus-wide numbers prove it: comments under 30 characters
carry evidence at **37.6%**, versus 34.0% for 30–59 chars and 36.2% for 60–119. Short
comments are not systematically dropped. **Verdict: capability limit — these are recall
failures inside long inputs, not law failures.** See cause 4.

### Cause 3 — value/deal testimony

- "Or a full size salad and a pizza roll with dipping sauce. So good!" → `Pinthouse` lunch deal
- "Truth! It's enough for two people too!" → `One Taco` $2.50 Tuesday
- "+1. When they're good they're AMAZING." → `Waterloo` fish n chips
- "Truly great pie and great owners" → `Favorite Pizza`

C.1 Gate 1's NONE branch is explicit that these emit restaurant-only with
`general_praise: true`. They did not. This branch is buried inside a three-way Gate 1
routing question; **verdict: prompt defect, fixable by text** — the NONE branch needs to
say "emits" before it says what it doesn't emit.

### Cause 4 — chunk-position attention decay (the structural finding)

Chunks average **57.1 documents** (max 143) across 2,541 LLM calls. Emission rate by
position within the chunk, over all 78,763 document-slots:

| chunk quintile | doc-slots | % with evidence |
|---|---|---|
| 1st (earliest) | 14,231 | **43.2%** |
| 2nd | 15,797 | 41.3% |
| 3rd | 15,741 | 38.2% |
| 4th | 15,797 | 37.9% |
| 5th (latest) | 14,656 | **35.5%** |

Monotonic, −7.7 points, **−18% relative from first slot to last**. The same shape shows in
thread position (42.6% → 34.2%) and worsens for very large threads (150+ comments: 29.5%
with evidence vs 39.8% for 60–149-comment threads).

**Reading.** This is not a law failure and it cannot be written away. A single call is
asked to run the full A→F loop separately for up to 143 sources and the later sources get
measurably less of it. It does not *create* the miss classes above — a 5% miss rate on
verdict-bearing comments would exist at ~4% even with a flat curve — but it is the
multiplier on causes 1–3, and it is why the same law fires on one "This is the way" and
not on another.

**Verdict: chunking-pipeline effect — structural, not fixable by prompt text.** The lever
is chunk size, and the trade is cost: halving docs-per-chunk roughly doubles the call count
and the token bill. Owner decision, not a prompt edit.

---

## 4. What the numbers mean per thousand documents

- **~200 true misses / 39,802 documents = ~5.0 misses per 1,000 documents.**
- Against comments only: ~5.2 per 1,000 comments.
- Against *verdict-bearing* comments (the 9,718 candidates): **~21 per 1,000 candidates**
  — i.e. the model credits ~98% of the real testimony the detector can see.

Fixable-by-text vs structural, by count:

| | ≈ misses | share |
|---|---|---|
| fixable by prompt text (causes 1 + 3) | ~135 | **68%** |
| capability / structural (causes 2 + 4) | ~55 | 27% |
| owner ruling / boundary (causes 5 + 6) | ~20 | 10% |

**Two thirds of the remaining loss is a prompt-text fix, and it is one rederived
paragraph** (the adoption test in cause 1) plus one reordered sentence (Gate 1 NONE).

---

## 5. Open sweep — non-ideal processing seen while reading

Counts are over the shadow set's 47,827 entity events.

1. **`affordable` is the 4th most-emitted entity in the corpus (1,077 events,
   place_attribute).** More than `dessert`, `pizza` or `breakfast taco`. Almost certainly
   the D-step fit-assertion over-firing on the many price-framed asks ("Nice restaurant
   $25-30 per person?", "Whats some GOOD CHEAP restaurants", "date night without dropping
   $$$"). The fit-assertion law is correct in principle; at 1,077 it deserves a spot-check
   that the asks it fires on really constrain the *venue* and that no re-scoping
   annotation ("great but pricey") was ignored. **Pattern, high count, worth its own pass.**
2. **`fajitas` emitted 488 times as a plural.** C.2 normalize: *"lowercase; use the
   natural singular ('taco', not 'tacos')"*. `fajitas` has no awkward singular exception
   like "noodles". A normalization leak concentrated on one term.
3. **`chicken` emitted 503× as `item` and 359× as `ingredient`.** C.2 step 4: *"If you end
   with a lone ingredient, keep the broader dish instead — a lone ingredient is neither a
   dish nor a category."* Bare `chicken` as an orderable item is the exact shape that rule
   forbids.
4. **`breakfast` emitted 821× as `item`.** The earlier triage classified the
   attribute→item move as a healthy resolve-shift. It is healthy as a *category*
   (C.3 explicitly passes "breakfast"), but 821 emissions of `breakfast` in the **item**
   slot is a wrapper standing in for a dish. Worth a ruling on whether `item` may ever
   hold a category-only token.
5. **Span refusals are down to 133** (from 884) and are all `span_not_in_cited_source`.
   The banked-refusal replay worked. This bucket is no longer a leading loss source and
   the earlier report's ranking of it as "the single largest recoverable loss bucket"
   should be read as *superseded*.
6. **The `<20`-comment threads emit at 36.8% and 150+-comment threads at 29.5%.** Small
   threads are not the problem; the giants are. Same finding as cause 4 from the other end.

---

## 6. Honest bottom line

The v17 candidate prompt is **not diffusely lossy**. Over the whole Austin corpus, of
9,718 comments that pattern-match a compliment, 57% were credited and 95% of the rest are
junk the prompt's own laws exist to kill — and the killing is precise, quotable, and
often subtle (a closure-frame ask, a joke superlative, a grocery aisle, an unnamed truck).
The residue is **~200 true misses, ~5 per 1,000 documents.**

That residue is not random. **Roughly 60% of it is one failure: a short affirmation whose
verdict lives in the parent comment.** The prompt already contains the law that rescues
it; what it lacks is a *test* in place of an example list, so idioms outside the list
("Facts", "This is the way", "Correct", "Truth", "Seconding X") read to the model as
chatter. That is fixable by text, in one paragraph, and it is the single highest-value
edit available.

The remainder splits into a small value-testimony routing bug (also text-fixable) and a
genuine structural tax: **a document sitting late in a 57–143-document chunk is ~18% less
likely to be credited than one sitting first.** No prompt sentence closes that gap. Chunk
size is the lever and cost is the price.

Two caveats on these numbers, stated plainly:

- The counts are from a full read of the 4,138-row no-evidence population, tallied by arm.
  They are honest to ±10%, not a row-by-row audit ledger.
- **Answer-list partial emission is invisible to this method** and is therefore excluded
  from the 200. A reply that names five places and emits three has evidence, so it never
  entered the population. The earlier triage found real instances of this shape
  (Red River Cafe, Small's Pizza, Bad Larrys). Measuring it needs a *span-level* detector
  — count capitalised name-slots in the source, compare to the mention count on that doc —
  and it is the obvious next hunt.
