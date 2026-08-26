# v16 Trace Audit — how the new prompt actually performs on real posts

**Date:** 2026-08-25. **What this is:** I read 160 real Austin Reddit posts/comments myself, worked out what the v16 prompt (collection_system v11, hash `40d3fc…`) *says* the model should extract for each one, then compared that against what v16 actually produced on staging and what the old active prompt (v1) produced for the same documents. Everything below is backed by a quoted example. Raw model output was compared directly (the `raw_output` JSON on `collection_extraction_inputs`), so nothing here is confused by downstream resolution.

**Bottom line up front:** v16 is a large real improvement — it stops most of the old corpus's junk (grocery stores, marketing posts, "haven't tried it yet" speculation, invented restaurant names) while extracting rich reviews well. Its two real weaknesses are (1) it still drops a meaningful slice of short, genuine praise (~7 of my 160 docs), and (2) a cluster of rule violations the prompt explicitly forbids but the model does anyway: wrapper words as dishes ("combo"), praise flags on dish rows, grocery inconsistency, and a few hedge/closed-place misses in the other direction. The famous "86% of item attributes are cuisine words" finding is **not a v16 defect at all** — both prompts order the model to do exactly that; the old corpus only *looks* clean because those events were archived later.

---

## 1. Sample composition

All 39,793 documents covered by the 45 completed v16 runs (r/austinfood). 160 docs sampled, stratified and oversampled on disagreement:

| Stratum | How chosen | Sampled |
|---|---|---|
| Old-extracted, v16-silent | old rows exist, v16 emitted nothing (2,236 such docs) | 25 |
| v16-extracted, old-silent | reverse (1,098 docs) | 20 |
| Long detailed reviews | >800 chars with output (238 docs) | 20 |
| Short/thin praise | <120 chars with output (10,584 docs) | 25 |
| List-style answer threads | comments under "best X?" posts (8,892) | 25 |
| Negative-language docs | avoid/overrated/meh/bland etc. (1,122) | 15 |
| Zero output from both | (22,821 docs — mostly chatter) | 15 |
| Other docs with output | random | 15 |
| Multilingual | **none exist** — every doc in this corpus is `language='en'` | 0 |

Corpus-level counts: v16 = 29,563 raw mentions on 14,736 docs; old = 31,216 mentions on 15,874 docs. So v16 is ~5% leaner overall and covers ~1,100 fewer docs — the sample shows most of that gap is old-corpus junk correctly refused, plus a smaller slice of real misses.

## 2. Headline verdicts (my classification of the 160 docs)

| Verdict on v16 | Count | Notes |
|---|---|---|
| FAITHFUL (matches what the prompt asks, or defensibly so) | ~118 | includes ~35 docs where v16 correctly emits nothing |
| Correct silence where OLD had junk | 19 of the 25 "old-only" docs | groceries, promos, plans, hearsay, invented names |
| MISS — real endorsement dropped | 7 clear + ~4 partial | see §3.1 |
| OVER-EXTRACTION — emitted what the prompt forbids | ~13 | see §3.2–3.4 |
| WRONG-SLOT | pervasive but *instructed* (cuisine on dishes) + a small real leak (cuisine into categories, 394 rows corpus-wide) | see §3.5 |
| Prompt-ambiguity | ~5 | naming an unnamed praised venue, bakery/grocery boundary, "used to enjoy" |

Corpus-wide numbers backing the classes: 2,383 v16 mentions (8%) carry `general_praise: true` together with a non-null item — the prompt's F.1 invariant forbids this outright (old corpus: 9,775 / 31%, so v16 is 4x better but still violating). 394 cuisine tokens sit inside `item_categories` (1.6%) despite an explicit ban. 1,376 mentions carry the near-meaningless cuisine `american`. 5,904 exact duplicate (place, item) rows exist within docs — that is the chunk-overlap replay design, not the model; the DB unique constraint collapses them.

## 3. Defect classes, with worked examples

### 3.1 Thin/short genuine praise still dropped (the Jollibee class — confirmed live)

The prompt could not be clearer: *"A verdict has no minimum eloquence. 'is good', 'is great' … 'my go-to' are complete endorsements … Do not require enthusiasm."* The model still under-emits when praise is short, slangy, or wrapped in an aside. Seven clear cases in 160 docs:

- **t1_jrh6kr2** — "And a Taco Palenque!-**that place slaps**, but they're only in San Antonio…" → v16: nothing. Old: praise for `taco palenque`. Ideal: restaurant-only praise. Likely trigger: the surrounding wish ("I just don't understand why we don't have five of those in town") reads as A.2 DESIRE, and the model let the desire frame silence the verdict clause — exactly the "source has no genre" failure Step A warns about.
- **t1_ia8aa4n** — "**I love uroko** but their handrolls would move up a tier if the seaweed was a bit better" → v16: nothing. Old: praise + handroll. Ideal: `uroko` praise carrier (the handroll hedge kills only the handroll). The prompt sentence being over-applied: *"a positive clause never rescues a hedged or negative neighbor"* — the model ran it in reverse and let the hedged neighbor kill the positive clause.
- **t1_jyr27y1** — "Thundercloud is **iconic** and I hope they never change" → v16: nothing. D.1 lists `iconic` as a judge-word to drop *as an attribute*; the model appears to have treated the whole sentence as non-testimony because its only verdict word is on the drop list.
- **t1_nt8fn1w** — "I've been at least once a year… it's **consistently pretty good**" (Fixe) → v16: nothing. Old: praise. "Pretty good" is positive, not a hedge; likely mis-read under A.2 MIDDLING.
- **t1_k3ibiz1** — "**I'll be sticking with Vegan Nom**" → v16: nothing. A loyalty statement is A.1's "my go-to" in other words.
- **t1_juuh25q** — "You can do upscale and **go to Lucy's**" → v16: nothing. "Definitely go" is listed as indirect recommendation.
- **t1_k1fwlcy** — "Taco Shack, but definitely order ahead or get yelled at ;-)" answering "better places to order 50+ breakfast tacos" → v16: nothing. The operational aside seems to have re-framed the pick as availability; the prompt says an operational annotation strips *its* entry, and the model applies that even when the annotation is a joke appended to a real pick.

Extrapolation, with caution: 19 of my 25 "old-only" docs were correct v16 refusals, ~6 were real misses. Applied to the 2,236 old-only docs, that suggests very roughly 400–600 genuinely endorsed places dropped corpus-wide. The mechanism that would have to move: Step A's hedge/aside handling — the clause-by-clause instruction exists but the model still lets one deflating clause (a hedge on a *different* dish, a logistics joke, a wish) mute the endorsement clause next to it.

### 3.2 The forbidden-but-emitted cluster (model violates explicit prompt text)

- **Wrapper as dish.** t1_jwms1e9 (P Thai's): "Also got the combo… The sauces were excellent" → v16 emitted `item='combo'` (`cats=['chicken','rice']`, menu=True). C.1: *"A DELIVERY WRAPPER head (`menu`, … `combo`) is never the dish."* Same doc also emits `item='rice'` from "Also loved the rice" — C.2.4's own example ("Love their rice" → no dish) forbids it. Also t1_k0226k3: `item='elvis presley combo'`. Note v16 *does* get this right elsewhere ("half chicken special" → `half chicken`), so it's inconsistent, not absent.
- **Praise flag on dish rows** (2,383 rows, 8%). E.g. t1_jy46vj5 Tiny Pies: `item='pie'` + `general_praise=true`; Via 313, Rockin' Rolls, In-N-Out same. F.1: *"`general_praise: true` lives ONLY on a restaurant-only mention (`item` null)."* The response schema can't enforce a cross-field rule, and nothing downstream splits the row, so the flag's meaning degrades. Mechanism: either the F.1 split rule needs to be executed by the persist path (split on ingest), or the invariant stays a paper rule.
- **Hedged verdicts emitted.** t1_jt2ojuy Wise Guys: "it's better than nothing, but it's just not quite there… room for improvement" → v16 emitted the italian-beef claim. t1_k3dlewa Thai Fresh: "a golden tofu burger that **I like alright**" → emitted. t1_k1rdh0u: "Nickel & Nickel is **a decent wine**" → emitted (and it's a bottle at H-E-B — double violation, see 3.3). A.2 MIDDLING covers all three.
- **Closed/nostalgia places emitted.** t1_lra8rn3: parent says "I **miss** having those amazing pulled pork tacos" (Elaine's Pork & Pies, in a "Who Remembers…" thread); reply "And the bourbon buttermilk pie 🥲" → v16 minted the pie claim. t1_ju9c6oo: "…before my shift on Saturday mornings… **RIP** 💔" → v16 credited `heb` with a blueberry fritter. A.2 CLOSED PLACE forbids both. (v16 does handle the Hoover's "RIP" case correctly — again inconsistent.)

### 3.3 Grocery/packaged-goods refusal works — but not always

This is v16's biggest win: it refused H-E-B cabrito ($117 frozen goat), Whole Foods salsa, Central Market olives/pavlova, mail-order chicos, farmer's-market jars, meat-market steaks — all of which the old corpus banked as restaurant claims (t1_jwcc3or, t1_juhn91l, t1_ju1h64h, t1_k3ao5vq, t1_jwz1qr5, t3_15qyj0h). The old corpus even fabricated a restaurant from world knowledge ("a vegan shake place way east on 2nd" → old minted `milky way shakes`; v16 correctly refused — B.1's unnamed-venue rule).

But the same test fails intermittently: t1_jwt6knk "Buy their 'fresh' raw sausage for your grill. **You cook it, it comes fresh raw**" → v16 emitted `city meat market` sausage + praise (explicit PACKAGED language). t1_k2h2ttx "Farmhouse Delivery has the tastiest corn… comes straight to your door" → emitted. t1_k1rdh0u wine bottles at H-E-B → emitted. So retail junk still leaks at maybe a fifth of the old rate. Mechanism: B.2 is stated as a claim-level test; the failures are all cases where warm praise words appear ("tastiest", "the best") and the model lets the verdict outweigh the mode-of-consumption.

### 3.4 Ask-inheritance: mostly right, over-applied on FACT asks

The good: judgment asks work beautifully — bare picks ("Soto", "Justine's", "The Little Darlin", "+1 for school house") emit as praise; "best burger in EV"-style dish inheritance works; the ask itself never emits; fit-assertion attaches the ask's constraint ("won't break the bank" → `cheap`/`good value` on Roaring Fork — as designed).

The bad: **fact/findability asks** still produce picks. A.1 condition 1: *"Answering a fact ask names places by availability, not by taste… emits nothing."*

- **t1_k41128g** — ask: "Anybody know **where in town to buy** Chocolate Mousse? **Who sells it?**" reply: "El dorado café" → v16 emitted a `chocolate mousse` dish claim (+`mexican`). Ideal: nothing.
- **t1_ju4aap2** — ask: "**Where to find** fresh fruit cake…" reply: "Central Market or Upper Crust" → v16 emitted praise picks for two grocery stores. Ideal: nothing (fact ask AND shopping mode).
- **t1_jyrt9za** — ask: "At what establishment are you MOST likely to get food prepared by someone completely stoned?" reply: "Wham Bam Bagels. I'm batting like 10% on my orders being right…" → v16: praise=true. The ask's criterion is a joke about stoned staff, not food judgment; the reply is a complaint played for laughs.

Also one fabricated detail found during inheritance/resolution: **t1_jyh6v2t** text says "a split **Serrano** pepper" — v16 wrote `ingredients=['poblano pepper', …]`. One case only, but it's a true hallucination, not a slot error.

### 3.5 Cuisine on dish attributes: the model is obeying orders

The known stat ("86% of v16 item_attribute events are cuisine words vs 0% in old corpus") decomposes like this:

1. **Both prompts explicitly command it.** v11 D.4: *"A CUISINE ATTACHES ON BOTH SIDES, ALWAYS… 'chicken tikka masala' → `indian` in `item_attributes` on that dish AND in `place_attributes`."* The worked example ships `"item_attributes": ["crispy", "mexican"]`. v1 §3.0(a) said the identical thing. The schema description for `item_categories` reinforces it: *"cuisines belong in the attribute arrays."*
2. **Raw outputs agree:** 79% of v16 item-attribute tokens are cuisine words — and **53% of the OLD corpus's raw** food_attribute tokens were too. The old prompt's model just also emitted more non-cuisine texture words.
3. **The "0% in old events" is an artifact of cleanup, not extraction.** The old corpus's cuisine attribute events were deliberately archived in the taxonomy drain — the code says so: `projection-rebuild.service.ts:1160` — *"~11k deliberately-archived attribute events (cuisine vocabulary) awaiting the class-② repointing ruling."* v16's rehearsal rows mint fresh rehearsal entities, so the same cuisines reappear un-archived.

So there is nothing to "find in the model's head" here. The decision that would have to change is the D.4 doctrine itself (cuisine on both sides) — or, if the doctrine stands, the activation path must run the same cuisine-vocabulary drain the old corpus got, or the v16 events will re-pollute what the drain cleaned.

Two genuine wrong-slot residues on top of the doctrine: cuisine tokens leak into `item_categories` in 394 rows despite an explicit ban (e.g. Sap's `cats=['pad cha catfish','catfish','thai']`, Suerte brisket taco `cats=[…,'mexican']`), and 119 restaurant-only mentions carry `item_attributes` with no item. Also, `american` (1,376 mentions) gets stamped on every burger/BBQ/wine mention — technically licensed by D.4's inference but close to information-free, and it puts `american` on Texas BBQ joints where the old corpus said `bbq`.

### 3.6 Wrong-place notes (mechanism owned by the sibling investigation)

Observed, not diagnosed: t1_k0mvof5 emitted `cover3` where the text says only "C3" (B.3 forbids expansion from world knowledge); "Las Tranchas" was silently corrected to `las trancas` (typo repair, forbidden — old did it too); t1_ju9c6oo credited a "RIP" workplace bakery memory to `heb`; and out-of-market testimony (Chicago's Capri/Rosebud/Greek Isle in t1_nsw2dq2, In-N-Out) emits into the Austin corpus by design — the prompt has no geography gate, so downstream grounding is what stands between these and a wrong Austin pin. Name-variant twins are prompt-lawful (`franklin` vs `franklin bbq`, `micklethwaites`, `terry black` — B.3 says emit observed forms; unification is downstream), but note the same doc can emit both `torchys` and `torchy's` across overlapping chunks, which hands the resolver an avoidable twin.

## 4. New issues not on the known list

1. **F.1 invariant violated in 8% of mentions** (praise=true on dish rows) — nothing enforces the prompt's own "split it" instruction (§3.2).
2. **Fact-ask picks** (where-to-buy/where-to-find asks answered with names still emit) (§3.4).
3. **Closed/nostalgia leakage** in reply chains — the closure signal sits in the parent ("RIP", "I miss"), the food sits in the reply, and the reply emits (§3.2).
4. **One ingredient hallucination** (serrano → "poblano pepper") (§3.4).
5. **Cuisine tokens in `item_categories`** — 394 rows against an explicit ban; these become dish-class entities downstream if not caught (§3.5).
6. **`american` noise** — 1,376 mentions; D.4's inference doctrine plus a vague cuisine yields near-zero-information attributes at scale (§3.5).
7. **Canonical-name instability across chunk repeats** of the same doc (`torchys`/`torchy's`) — a free source of twin surfaces (§3.6).
8. Minor: evaluative one-liners the model over-reads ("delicious **sounding** subs" → praise; "maybe … are decent" → praise) — the hedge detector fails on *sounding* and *maybe*.

Things that worked notably well and deserve saying: clause-level mixed reviews (Chuy's "food is obviously not good but their refried beans are my favourite" → beans only), score-scale judgment (7/10 dishes dropped, 9/10 kept, in the same list), negation and "meh" (every negative doc in the sample emitted nothing wrong), announcement/marketing refusal, and the unnamed-venue rule.

## 5. What I could not determine

- **Why the model drops thin praise** beyond plausible readings of which sentence misfires — that needs prompt-side probing (the flip-rate bench), not trace reading.
- **The wrong-place grounding mechanism** (Luckys/Lefty's) — downstream of raw output; sibling investigation owns it. My examples are raw-output-level naming violations only.
- **t1_jyh6v2t's venue** ("bulevar mexican kitchen") — the parent post isn't in the covered doc set, so I can't confirm whether the name was in-context or world knowledge.
- **Whether the 6-of-25 old-only miss rate extrapolates linearly** to all 2,236 old-only docs — the stratum was sampled randomly but 25 is a thin base; treat 400–600 as an order of magnitude.
- **Multilingual behavior** — untestable; the Austin corpus is 100% English-tagged.
- Failed runs: 204 v16 runs are status=failed, nearly all "cancelled — owner re-scope to austinfood"; I treated the 45 completed runs as the audit universe and did not verify per-doc coverage completeness beyond the 39,793 join.

*Method note: shadow rows are distinguished exactly as the code says — `core_entities.status='rehearsal'` + `born_extraction_run_id`, verdicts under `rehearsal:<runId>`, doc pointers still on the old runs (`rehearsal-generation.service.ts`). All queries were SELECT-only.*
