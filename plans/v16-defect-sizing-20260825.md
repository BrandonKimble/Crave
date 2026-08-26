# v16 Defect Sizing — corpus-wide counts behind the trace audit

**Date:** 2026-08-25. Companion to `plans/v16-trace-audit-20260825.md`, which read 160 docs; this measures each defect class across the whole corpus. All queries SELECT-only against staging (`crave_search`). Corpora: **v16** = raw mentions from the 45 completed runs with prompt hash `40d3fc1a…` (`collection_system` v11, 29,563 mentions / 14,736 docs); **active** = raw mentions from the active-prompt runs (`cf421fe7…`, v1) restricted to the same r/austinfood doc set (31,216 mentions / 15,874 docs). Both baselines reproduce the audit's numbers exactly.

## Summary table

| Class | v16 | Active | Source of the defect |
|---|---|---|---|
| 1. Closed-place credits | 448 mentions sit next to a closure phrase; hand-check says ~15% are real violations → **~50–90 mentions (~30–50 docs)** | 367 flagged, similar precision | Prompt rule exists and is explicit (A.2 CLOSED PLACE) — model non-compliance, mostly when the closure sits in the parent and the food in the reply |
| 2. Hedged non-verdicts emitted | 332 mentions have the credited place within ~120 chars of a hedge word; hand-check ~20–25% real → **~65–85 mentions** | 356 flagged, comparable | Prompt rule exists (A.2 MIDDLING/HEDGED) — model non-compliance |
| 3. Wrapper-as-dish | **63 items** (26 bare "tasting menu") | **174 items** (78 "tasting menu") | Prompt rule exists (C.1 Gate 1) — model non-compliance; v16 is 2.8x better but still leaks |
| 4. Out-of-market groundings (>50 mi from Austin) | **60 of 1,685 grounded restaurants (3.6%), 171 events** — but 19 of them (109 events) are Austin places WRONGLY grounded to NY branches; genuine out-of-market ≈ 41 restaurants / 62 events | **198 of 2,034 (9.7%), 376 events** | No geography gate in either prompt (by design); the NY cluster is the sibling investigation's wrong-grounding defect, not extraction |
| 5. general_praise=true on dish rows | **2,383 / 29,563 (8.1%)** — audit's numbers verified exactly | **9,775 / 31,216 (31.3%)** | Prompt invariant exists (F.1) and is unenforced anywhere — model non-compliance + no schema/persist enforcement |
| 6. Cuisine tokens in item_categories | **337 rows** with my 60-word cuisine vocab (audit said 394 with a presumably broader list) | **218 rows** | Prompt ban exists ("Cuisines and dietary flags never enter `item_categories`") — model non-compliance |

Headline: every class the owner asked about has an explicit prompt rule in v16 that the model violates a small percentage of the time. Nothing was "lost" from the old prompt — including the closure rule. On four of six classes v16 is better than active; classes 1 and 6 are the two where v16 is not clearly better (closed-place roughly equal, cuisine-in-categories somewhat worse: 337 vs 218).

---

## 1. Closed places

**The rule is NOT missing from v16.** The owner's hypothesis (old prompt respected closure, v16 lost it) is wrong on the text: v16 (prompt v11, hash `40d3fc…`) contains a dedicated A.2 bullet:

> **A CLOSED PLACE.** "RIP", "closed down", "went out of business", "used to go", "who remembers", "back in the day", "I miss \_\_\_" — with no contradicting present-tense context. A recommendation for a place that no longer exists is not actionable. … **Closure is a fact stated about the PLACE, never an inference from the WRITER's tense**

The active prompt (v1) has the same rule in three places ("Timeliness … RIP/used to/miss", "Defunct establishments … skip the mention"). Git history of `collection-prompt.candidate.md` shows the closure rule present continuously; nothing to diff away. So this class is **model non-compliance**, and the dominant failure shape is exactly what the audit spotted: the closure signal lives in the parent comment, the food praise in the reply.

**Sizing.** 448 v16 mentions (252 docs) credit a place whose name appears within ~200 chars of a closure phrase in the doc or its parent (active: 367 / 216 docs). Most of those are lawful — "used to be a Sonic", "where Zushi Sushi used to be", a writer who moved away — the exact carve-outs the rule names. Hand-classifying 27 sampled rows: 4 true violations (~15%) → **roughly 50–90 v16 mentions corpus-wide**, similar order in active. Verbatim true violations (v16):

- **t1_jrvqyzw** (Elaine's Pork and Pies) — parent: "Elaine's Pork and Pies next door 🥲 I miss having those amazing pulled pork tacos" → reply "I miss the pulled pork sandwiches. Perfection." → v16 credits `elaine's pork and pies` / `pulled pork sandwich`.
- **t1_jry4eak / t1_jrw5cqs** (East Side Cafe) — thread titled "Who Remembers the East Side Cafe on Manor? :: I miss that place!" → replies "I miss their baked brie and apple chutney", "This is where I discovered buttermilk pie" → v16 credits `east side cafe` with `baked brie` and `buttermilk pie`.
- **t1_ozdj9jv** (Lulu B's) — "Lulu Bs was the best banh mi and spring rolls I ever had … they finally opened a brick and mortar and closed suddenly after like a year in that spot, RIP" → reply "They're the only ones who put enough mint in their spring rolls" → v16 credits `lulu bs` / `spring rolls`.
- Also t1_jygr6db: "I miss Fuddruckers. It was a damned good burger" → v16 credits `fuddruckers` with `burger`, `wedge fries`, `jalapeno cheese sauce`.

## 2. Hedged non-verdicts emitted as claims

The v16 threshold rule (A.2):

> **A MIDDLING OR HEDGED VERDICT.** "it's fine", "solid enough", "6/10", "not bad", "perfectly fine", "decent". These withhold endorsement; they are not positive claims. The test is the NET DIRECTION of the clause … any qualifier that pulls the verdict downward defeats it

**Sizing.** 332 v16 mentions (172 docs) have the credited place's name within ~120 chars of a hedge token (decent / alright / it's okay / not bad / nothing special / mediocre / mid / it's fine …). Active: 356 / 186 docs. Hand-classifying ~25 rows: most flags are the hedge landing on a *neighboring* place (which v16 handled correctly — it's evidence the clause-level rule usually works); ~20–25% are true violations → **roughly 65–85 v16 mentions corpus-wide**, active comparable. Verbatim true violations (v16):

- **t1_jy0f14l** (Oddwood Brewing) — "Oddwood has a decent thin crust / bar pizza. I always ask them to crisp it a bit more … I think their pies are too expen[sive]" → v16 emits `thin crust pizza` claim.
- **t1_jth5mnt** (Home Slice) — "Home slice is decent if you ask for it well done" (inside a rant that Austin pizza "is generally shit") → v16 emits `pizza` claim.
- **t1_jxmyy2m** (Quatro Gatti) — "Quatro Gatti is decent enough, I miss La Traviata…" → v16 emits restaurant praise.
- Audit's own three (Wise Guys "not quite there", Thai Fresh "I like alright", H-E-B "a decent wine") confirmed present in the raw output.

## 3. Wrapper-as-dish

v16 rule (C.1 Gate 1): "A DELIVERY WRAPPER head (`menu`, `tasting menu`, `course`/`N-course`, `prix fixe`, `buffet`, `special`, `deal`, `combo`) is never the dish, and a modifier cannot rescue it."

**Sizing** (item whose head noun is a wrapper word): **v16 = 63** items; **active = 174**. v16's residue by item: `tasting menu` 26, `vegetarian tasting menu` 4, `combo` 3, plus proper-noun specials (`nikki's special`, `jess special`, `dh special`, `java special`, `elvis presley combo`, `tokyo combo`) which are actual menu-item names and arguably gray zone. Verbatim (v16):

- **t1_jy0itw0** (Waffle Love) — "I like the grilled cheese tomato soup combo" → `item='grilled cheese tomato soup combo'` (rule says: item = the food, never the compound).
- **t1_k0226k3** (Chuy's) — trip report → `item='elvis presley combo'`.
- **t1_k1h6j7l** (H-E-B) — "Tokyo combo is my fav" → `item='tokyo combo'` (also a grocery-sushi-counter case).

Source: prompt rule present and mostly obeyed (2.8x fewer than active); residual model non-compliance concentrated on `tasting menu` (26 of 63) — which the rule names explicitly.

## 4. Out-of-market leakage

Neither prompt has a geography gate — the audit already noted out-of-market testimony "emits into the Austin corpus by design"; grounding is the only fence. Measured at the grounding layer (restaurants credited by extraction events, distance from Austin 30.2672,-97.7431, entity/primary-location coordinates):

- **v16:** 2,334 credited restaurants, 1,685 grounded, **60 beyond 50 mi (3.6%), 171 events**. Split by region: NY 19 restaurants / 109 events, TX 36 / 57, other states 5 / 5.
- **Active (austinfood docs):** 2,707 credited, 2,034 grounded, **198 beyond 50 mi (9.7%), 376 events**.

The NY cluster is **not out-of-market testimony** — it is Austin testimony wrongly grounded to same-named NY entities (the sibling investigation's wrong-grounding class): `Joe's Bakery` → Queens NY (29 events; the doc is Austin's Joe's on E 7th), `Chili's Grill & Bar` → Staten Island ("Chilis on 45th?", "Chili's on N Lamar" — Austin docs), `Clark's` → Brooklyn (Austin's Clark's Oyster Bar). Genuine out-of-market ≈ **41 restaurants / 62 events** in v16, dominated by Texas day-trip territory: Fredericksburg wineries (Featherstone Ranch, Grape Creek, Barons Creek), Corpus Christi (Water Street Oyster Bar, Landry's), Temple ("The best fajitas I ever had were in Temple, TX at Fajita Kings"), Lockhart/Bastrop BBQ. Verbatim:

- "The best fajitas I ever had were in Temple, TX at Fajita Kings, their food is just good period" → 4 events on a place 61 mi out.
- "Featherstone Ranch Vineyards for sure! Great pizza as well as charcuterie" → Stonewall TX, 51 mi.
- Chicago thread (t1_nsw2dq2 Capri/Rosebud/Greek Isle) emits raw mentions as the audit found; those names are among the 649 ungrounded v16 restaurants, so they don't appear in the >50 mi count — the count above therefore *understates* raw leakage and measures what actually landed on a map pin.

Source: schema/pipeline shape (no geography rule in either prompt) + the separate wrong-grounding defect. Not a v16 regression — active is ~2.7x worse on the same measure.

## 5. general_praise=true on dish rows

Audit numbers **verified exactly**: v16 **2,383 / 29,563 (8.1%)**; active **9,775 / 31,216 (31.3%)**. The v16 rule (F.1):

> The invariant that follows: **`general_praise: true` lives ONLY on a restaurant-only mention (`item` null).** Before emitting, if any mention carries BOTH a non-null `item` and `general_praise: true`, split it

What the rows look like: overwhelmingly dish-praise sentences where the praise IS the dish connection and F.1 says the flag must be false — not a praise+dish "both at once" situation. Verbatim (v16):

- **t1_jy0jimc** — "Oddwood Brewing has excellent tavern style thin crust pizza." → `item='tavern style thin crust pizza'`, `general_praise=true` (should be false — praise aimed at the dish).
- **t1_jyaxp9t** — "Cabo Bob's is a good burrito!" → `item='burrito'`, `general_praise=true`.
- **t1_jy0i5ei** — "East side pies is very thin crust, but not tavern style. I love ESP though" → `item='thin crust pizza'`, `general_praise=true` (here a lawful output would be a dish row at false PLUS a restaurant-only carrier at true; the model fused them).

Source: model non-compliance with a cross-field invariant the response schema cannot express, and nothing in the persist path executes the prompt's own "split it" instruction. (The audit said the same; the 4x improvement over active is real.)

## 6. Cuisine tokens inside item_categories

v16 rule: "**Cuisines and dietary flags never enter `item_categories`.**" (and the C-step schema note that cuisines belong in the attribute arrays).

**Sizing:** with a 60-term cuisine vocabulary I count **337 v16 category entries** that are cuisine tokens (audit reported 394 — same order; the delta is vocabulary choice). Active: **218**. This is one class where v16 is *worse* than active. v16 token list: `mexican` 133, `italian` 59, `thai` 39, `japanese` 32, `southern` 22, `indian` 16, `chinese` 12, `tex-mex` 6, `korean` 5, `cuban` 4, `ethiopian` 4, plus singles (`peruvian`, `turkish`, `nepalese`, `vietnamese`, `american`). Active's residue was dominated by `japanese` (125). Verbatim (v16):

- **t1_jy69aei** (Ichiban) — "Sit at the bar and ask for Chef Ji…" → `item='sashimi'`, `cats=["sashimi","japanese"]`.
- **t1_jyaxp9t** (Cabo Bob's) — "Cabo Bob's is a good burrito!" → `cats=["burrito","mexican"]`.
- **t1_jy7y2td** (IchiUmi) — "good sushi and sashimi lunch specials" → `cats=["sushi","japanese"]`.

Source: model non-compliance against an explicit ban; the pattern is a cuisine token appended after a correct dish-class token, i.e. the model treats the array as "dish + cuisine tag" despite the rule.

---

*Method notes: mention sets were dumped from `collection_extraction_inputs.raw_output` joined through `source_map` to `collection_source_documents` (closure/hedge scans include the parent doc's text). Classes 1–2 use phrase-proximity flags with hand-classified precision samples (27 and ~25 rows) — treat those two totals as estimates, the rest as exact counts. Class 4 uses `core_restaurant_events` → `core_entities`/`core_restaurant_locations` coordinates (rehearsal-born entities have since been resolved into the active graph; 649 v16-credited restaurants have no coordinates and are excluded). Scripts and raw example files in the session scratchpad (`size.py`, `c1-v16.txt` … `c6-v16.txt`).*
