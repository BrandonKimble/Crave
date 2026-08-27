# v17 Preflight Trace Audit — fresh sample, candidate prompt

**Date:** 2026-08-26. **What this is:** the final pre-flight check on the candidate extraction prompt (`collection-prompt.candidate.md`, the "v17" text). I pulled 116 fresh Austin threads (1,431 comments) from the local DB — none of them used in the v16 trace audit or the prompt-ab gold fixture — ran them through the existing corpus A/B harness (`apps/api/scripts/prompt-corpus-ab.ts`, both live and candidate prompts, gemini-3-flash), then read every thread myself, formed my own opinion of the ideal extraction, and compared. Raw model outputs for the independent judge: `apps/api/scripts/fixtures/v17-preflight-outputs.json` (every mention, both prompts, per doc).

**Sample strata (posts):** 12 closure/nostalgia, 16 long reviews, 14 negative, 22 big rec-ask threads, 20 small rec-asks, 16 short posts, 4 list posts, 12 other. All strata read in full.

## Bottom line

The candidate is close to ready and dramatically better than live. Every mechanical defect class from the v16 audit is at ZERO on this sample: no cuisine-as-food, no wrapper-as-dish ("tasting menu"/"combo"), no judge-words as attributes, and **zero praise flags on dish rows** (the schema split did its job — v16's worst invariant violation is structurally gone). Closures are dead, groceries are ~90% dead, directories and marketing are dead, thin praise is captured, "+1" adoption works, misspellings are preserved. Candidate emits 17% fewer mentions than live, and reading the one-sided docs shows that gap is almost entirely live's junk, not lost signal.

What still stands between this and "perfect": one *systematic* judgment gap (availability answers to fact-shaped asks still emit as picks, ~2-3% of mentions), one *data-integrity* bug that is not about judgment at all (2.5% of mentions carry a corrupted `source_id`), a 2% rate of correct names citing the wrong `place_source_id`, and a scatter of one-off misreads. Misses of real signal are rare (~10 claims across 1,317 mentions). My verdict distribution over the 116 docs: **~62 PERFECT, ~38 ACCEPTABLE (defensible differences only), ~16 docs contain at least one JUNK/WRONG-PLACE mention, ~7 contain a MISS.** At the claim level: roughly 55–65 junk mentions (4–5%) and ~10 misses out of 1,317.

## Headline numbers (candidate vs live, same 116 docs)

| | live | candidate |
|---|---|---|
| docs emitting | 111 | 103 |
| mentions | 1,587 | 1,317 |
| cuisine-as-food defects | 4 | **0** |
| format-as-food defects (tasting menu, prix fixe…) | 25 | **0** |
| bad attributes (rich, authentic, hidden gem…) | 7 | **0** |
| praise flag on dish rows | n/a (old shape) | **0** |
| cuisine tokens in item_categories | — | **0** |
| one-sided docs (live emitted, candidate silent) | | 8 — all 8 are correct refusals (see §2) |

## 1. What v17 gets right — the v16 defect classes, retested

- **Thin praise captured.** "Yeah Fonda does slap" → praise carrier. "God-tier one-liners" all landed: "It's good stuff!" (adopted to Central Market Cafe soup), "Oh hell yea", "the mole enchilada's still HIT", "I'll be sticking to Vegan Nom"-style loyalty ("We've switched to Pho Saigon permanently" → praise). The v16 Jollibee class is essentially gone on this sample.
- **"+1" / bare-verdict adoption works with correct pointers.** "And the bourbon buttermilk pie"-style replies now resolve: "Those buns are absurdly good… theirs is prepared perfectly" → pork belly + duck credited to Bunbelly with `place_source_id` pointing at the post that names it. Dozens of `(name@post)` pointers verified correct against the text.
- **Closures dead.** "Gourmand's… RIP" → nothing. "Pouring one out for Sea Dragon #rip" → nothing. "Bonhomie, also closed, would have fit" → nothing. "Buffet Palace 😢" → nothing. The whole Mongolian-grill nostalgia thread ("I miss Mongo Fire", "It was called chow down, wish it was open") emitted only the live places ("Kublai Khan… is pretty good!").
- **Wrappers dead, value testimony rerouted correctly.** "Bougie Tuesdays at SLAB BBQ. Each Tuesday one of the entrees is $7.99… Yum!" → restaurant-only carrier with `good value`, no "entree" dish. "Hestia has a good tasting menu" → `place_attributes: ['tasting menu']`, never an item. "We got the Filipino eggrolls, combo pincit bihon" → the "combo" prefix stripped, dish kept.
- **No inferred cuisine.** Bare lists ("Momoya soho"-style) carry no cuisines; "mapo-tofu-implies-chinese" class absent. Cuisines appear only when stated ("favorite Chinese spot in the city" → `chinese`; "the better Italian" → `italian`) or fit-asserted from a constrained ask.
- **Fit assertion works.** "Upscale vegetarian focused dining?" → every pick carries `vegetarian`; "casual French" → `french, casual` on picks — and correctly BLOCKED where the reply pushes back: "Rose Gose on Airport is **not French** but has some european influence" → praise with no `french`.
- **Groceries/packaged mostly dead.** The biggest wins: the HEB go-to-sauce thread (live: 20 brand-sauce mentions; candidate: 3), Diamond Crystal salt (live 12, candidate 0), bulk oysters to shuck at home (live 11, candidate 1), meat delivery services (live 5, candidate 0), mooncakes-to-recreate (live 7, candidate 0), soju liquor stores (live 14, candidate 2). And the mode-not-venue rule works in the good direction too: "HEB Mueller bbq lol but seriously its pretty good" → emitted (served counter), while "Their burger pattys **from the butcher side** are still amazing" at Salt & Time → refused.
- **Rosters/marketing dead.** The Dine-with-Maui fundraiser roster: live minted **58** mentions from the participant list; candidate emitted exactly one — the only real testimony in the thread ("Great cause to try out ATX Shoyu Sugar - that place is phenomenal"). James Beard semifinalists: live 58, candidate only the real comment verdicts ("His sandwiches blow the doors off anything this sub freaks out on"). Korea House free-food announcement: live minted the 9-dish menu; candidate kept only "I love this place! Been a favorite of mine for over a decade".
- **Clause-by-clause discipline.** "The pizza is NOT v good… The cheesy breadsticks were 🔥 though and the hot wings were not bad too" → breadsticks only (wings "not bad" = hedge, dropped). "I love the guys at ramen512 (the jiro special a few weeks ago was mindblowing) but it was just overall disappointing this time" → jiro special emitted, tsukemen not. "Everything they make there is good but I don't like their fried chicken" → praise, no chicken.
- **Names as written.** "pho phung luu" (misspelling) kept; "boudan" kept; "blue dhalia" and "blue dahlia" emitted separately per source; "sushi | bar atx" pipe preserved. No C3→cover3-style world-knowledge expansion found anywhere in 1,317 mentions.
- **Hedges refused.** "Easy Tigers pretty decent" → nothing (live emitted). "pretty solid… but I don't get the hype. I'll be sticking to the other ramens" → nothing. "The pad cha at Wat Zab… was alright… not for regular visits" → nothing (live emitted it). Scores: not exercised this sample beyond the spicy-log heat ratings, which aren't taste verdicts and were handled fine.

The 8 docs where candidate emitted nothing and live emitted something are all correct refusals: cinnamon-roll pop-up meetup (live credited "Zilker Sand Volleyball Courts" with cinnamon rolls!), bottarga/salt/meat-delivery/mooncake shopping asks, the Reunion 64 pan, Snow's to-go logistics, Tamale House article chatter.

## 2. What's still wrong — every class, with quotes

### 2.1 Availability answers to fact-shaped asks still emit (the biggest residual, ~30 mentions)

The prompt's rule is explicit ("Answering a fact ask names places by availability, not by taste… emits nothing") and it works on the cleanest cases, but leaks when the availability answer is helpful-sounding or the ask is hybrid:

- Coffee-bun findability ask ("Any info **where I can get** coffee buns?"): "85C bakery. They call them 'Espresso Buns'" → emitted dish + praise=True for 85c bakery, 85 degrees, AND Paris Baguette. Pure location answers; ideal = nothing.
- Caviar ("**Where can I try** some non-bank-breaking caviar?"): "Justine's does Xavier 'bumps'", "Swedish Hill has a caviar service", "Diner Bar has it", "Uchiko has a Caviar and potato chip dish on their menu", "There is a caviar and champagne bar at Fairmont" → all emitted as claims. (The same doc correctly refused Central Market/Specs/Whole Foods retail — the shopping half worked; the has-it-on-the-menu half didn't.)
- Weekday deals ("What are some weekday deals…? I'm looking to create a masterlist" — a fact ask): "Dollar oysters on Tuesday at Foreign and Domestic", "Dawa sushi happy hour: two roll combo for $10", "241 Dogs at Silver Medal", "$4.50 IPA's at Poke Joes", "Pollo regio half chicken $12" → all became dish claims with `good value`. (Real testimony in the same thread — "My go to is $2.50 Al Pastor… at One Taco", "killer deal and killer pizza" — is correctly kept; the model can't tell a listed deal from a vouched one.)
- Christmas Eve reservations: "I just looked on **open table** — Geraldine's, Carve, Fixe and Perry's **all have options**" → four praise carriers. The selection criterion is stated (has availability) and should have killed all four.
- 24-hour diners: "all 3 locations of Bennu Coffee are 24 hours", "Stars Cafe is 24 hours!" → praise carriers; the only claim in the text is hours.
- Smaller singles: "Fixe downtown **has** catfish and fries during their happy hour for $12" → dish claims; "Wees Cozy Kitchen has Char Kway Teow. **Not sure how it compares** to the dishes you mentioned" → dish + praise despite the explicit disclaimer; "Uchi has a relatively extensive vegetarian menu: <link>" → praise + vegetarian.

Root cause opinion: prompt defect more than model variance. A.1's fact-vs-judgment split exists, but nothing tells the model what to do with a *helpful availability answer inside a judgment-adjacent ask* ("where can I try X", a deals masterlist, "who's open with seats"). The A.2 AVAILABILITY paragraph's example is bare "X has them"; the leaks all carry extra warmth or specificity. One more worked example pinning "has it / does it / is open / has availability on OpenTable → not a claim, even when responsive" would target the whole class.

### 2.2 Source-id corruption — 33 of 1,317 mentions (2.5%), a pipeline hazard, not a judgment error

The model sometimes emits `source_id`/`place_source_id` without the `t1_` prefix ("jzoodze", "jwzxn7t", "jxmc960" — it clusters per response: the whole Franklin/Terry-Black's doc came back prefix-less), and three ids were mangled beyond the prefix: `t1_l8joc` for `t1_k1l8joc`, `t1_mecr5` for `t1_k1mecr5`, `t1_y9i82` for `t1_k2y9i82`. F.2 says "copied EXACTLY… never reformat" — the model violates it at a low, bursty rate. This one matters more than its rate: a corrupted id can't be joined back to a document downstream. Before spending, either (a) add a persist-side validation that every emitted id ∈ the payload's id set (repair by unique suffix match, else drop the mention loudly), or (b) accept silent loss/misattribution of ~2.5% of mentions. I'd do (a) — it's mechanical and prompt-independent.

### 2.3 Right name, wrong `place_source_id` — 26 of 1,285 checkable mentions (2%)

When a comment names the place itself, pointers are near-perfect. When the name is inherited, the model repoints correctly most of the time (dozens of verified `(name@post)` cases) but ~2% of the time keeps its own id even though its text never contains the name: "They're doing something right, **I love that place**" → `place_observed: fonda san miguel`, `place_source_id: t1_jtjxo72` (the name lives only in the post title); same shape for "Their food is delicious." → hawaiian bros, "I love this place!" → korea house, "I bookmarked these guys" → pho phong luu, and all Kapatad comments. The name itself was always RIGHT — this is an audit-trail defect, not a wrong-place defect. Two adjacent fidelity slips found: "Torchy's" emitted as `torchys` (apostrophe dropped), and "Wees Cozy Kitchen" emitted as `wee's cozy kitchen` (apostrophe ADDED — repair toward the real name, explicitly forbidden), plus one dish-token repair ("combo pincit bihon" → `pancit bihon`).

### 2.4 Testimony-test misreads (scattered, ~15 mentions)

- **Bare-attendance credential list credited.** Craft review: "I've had all 3 omakase at Otoko, Sushi Bar, Toshokan, Uroko/Tonari, and been to Tsuke many times" → FIVE omakase dish claims (otoko, sushi bar, toshokan, uroko, tonari). This is the "I've only been to Cuba512" rule verbatim — a credential qualifying the review, zero verdicts. Clearest single violation in the sample.
- **Menu-reading picks credited.** Restaurant-week deals post: "From the previous thread and my **list of open tabs**… Some menus still not updated, these are just the ones that **stood out to me**" → praise carriers for L'oca D'oro, Paul Martin, J Prime, Carve. The writer read menus; nothing was eaten. (Same doc: "KG BBQ is charging more for a brisket rice bowl than it costs normally (still love them)" → the love is right, but the brisket rice bowl also emitted as a dish — price-only.)
- **Unopened place credited.** "New Feng Cha **opening** at Parmer/35… I think this is a good addition to the area when I get a hankering" → dish + praise + an adopted "Oh hell yea". The shop isn't open ("No idea when it's coming").
- **Comparison LOSER credited.** "I enjoyed my meal there [J Carvers] **100% more than Jeffreys**" → Jeffreys got `general_praise: true`. Wrong direction.
- **Sarcasm/jokes.** The Oasis: "Legions of other food aficionados **choke on their hand crafted fajita** at the site of this power couple" (a bit mocking Austin's famously view-over-food spot) → `fajita` claim. "Lol, 24 Diner" → praise.
- **Review-of-a-review.** "There was an Infatuation **review** by Raphael Brion on Pasta Bar that I **thoroughly enjoyed**" → Pasta Bar praise. The writer enjoyed the writing.
- **Story-wings.** "his #1 complaint was people calling back to ask why they were **missing wings** from their order" → Pluckers `wing` claim; and "I recommend ordering from **Favor**" (a delivery app) → praise carrier.
- **Hearsay slip.** "I bought a giftcard [for Tillies]… **I hear** it is a very lovely venue" → praise=True. And two hedged picks in the taco thread: "Fresas. Papalote, **even maybe** Torchy's" → torchys credited; "I wasn't huge on De Nada but they had a **decent** hard shell taco" → emitted.
- **No-verdict enumerations.** "I have been many times and had many of their offerings, **e.g.** burger, steak, muffaletta sandwich, pasta" → muffaletta + pasta minted as dishes (only the burger and steak carry verdicts elsewhere in the post); "my steak has always been **cooked at the temp I asked**" → a steak dish claim (service fact).
- **Speculated dietary.** "I **think they might be** vegan too. **Check with the store**" → `vegan` on Howdy Donut's donut. The never-drop-dietary rule out-muscled the hedge.

### 2.5 Misses (real signal dropped, ~10 claims — the honest tail)

- "the **empanadas are still great**, polenta is **good and a huge portion**" → empanada emitted, **polenta dropped** (t1_jzjmef0).
- "The pickled okra (they called it shishito) **was great. I'd eat more of those**" → dropped, inside the mixed L'oca D'oro review (t3_16l98g6).
- "Definitely **don't miss Dirty Bills** next door though" → dropped (t1_nwo50le) — an indirect recommendation per A.1.
- "**EZ's bean burger was my jam**" → dropped (t1_jzlcyn) — past-tense verdict, no stated closure, should emit.
- "their **breakfast tacos are solid**" → dropped (Howdy Donut post) — the bare-"solid" wobble; A.1 says no minimum eloquence, A.2 lists "solid enough"; the model breaks ties toward silence.
- "Athenian Grill, 2010 / Ted's Greek Corner, 1993" → dropped — a two-name answer to "best gyro?" with year annotations; picks per the ANSWER TEST.
- "Great list but if you missed out on **Billy's on Burnet** you'll have to come back" → dropped.
- Borderline (defensible either way): "Been eating their banh mi since… **Still solid**"; "**I've had curry house pizza so I know good Indian pizza**".

That's the whole miss tail I could find in 116 docs. The v16 thin-praise bleed (~6/25 in the old-only stratum) is down to isolated ties around "solid"-class words and buried side clauses.

### 2.6 Prompt-law gaps the model obeyed but a diner loses on (defects in the law, not the model)

- **Discontinued DISHES have no closure rule.** "RIP Uchi Candy Bar… tonight is the last night for this iconic dessert" → candy bar (menu=True), plus the whole memorial thread: mango panna cotta ("they got rid of"), tobacco cream ("I still miss"), foie gras nigiri ("The loss… still hurts"). All prompt-lawful — the PLACE is open — and every one of these items no longer exists. B.1's PLACE STATUS needs a dish-level sibling, or these bank as recommendable dishes.
- **Branch descriptions become place names.** Jet's thread: `place_observed: "south lamar location"`, `"locations down south near slaughter"`, `"south location"` — B.3 forbids partial names with no brand token; ideal is `jet's pizza` (named in the title) for all of them. Related landmark case: "the pop up in **Fareground**. The sliders I had there were super good" → credited to `fareground` (the food hall), not the Jewboy pop-up — B.2's landmark-plus-vendor rule missed.
- **Cuisine canonicalization can destroy information.** "reliable and underrated for **tex-mex**" → `mexican` (twice), while Vivo's "Tex Mex" → `tex-mex`. If tex-mex is a real cuisine in the taxonomy, "one canonical spelling per cuisine" is being read as "fold into the nearest big cuisine". The prompt never says whether tex-mex is its own canon.
- **"bbq" fit-assertion ambiguity.** "Best BBQ restaurants?" → every pick got `place_attributes: ['bbq']` (24 mentions). D.3 says a prediction-passing food word is never a venue attribute; but as an ask constraint it's venue-shaped ("BBQ restaurant"). The prompt doesn't settle whether bbq is a cuisine, a dish, or both; the corpus detector counts it as cuisine. Needs an owner ruling more than a model fix.
- **Ingredients from a question.** "Any guesses as to what's in their Crispy Brussels? Pine nuts, golden raisins, mint, lemon vinaigrette…..?" → all four recorded as `ingredients`. C.5 says "something the writer said" — these were said as guesses.
- **Fit-assertion vs explicit pushback, one leak:** "Peche, 1417 french bistro are French restaurants. I like them… but if you were to ask me what cuisine they are, **I would've never said French**" → both still got `french`. The reply disputes the very fit being asserted.
- **No geography gate (by design):** Houston's Tumble-22, San Antonio's L&L etc. emit into the corpus; downstream grounding remains the only wall between these and a wrong pin — unchanged from v16, noting it for the record.

## 3. Is it ready to spend on?

**Yes, with two conditions.** The judgment core — testimony, clause discipline, closures, wrappers, groceries, names-as-written, fit assertion, dietary capture — is performing at a level where I found ~10 lost claims and ~55–65 junk mentions in 1,317, and the junk is heavily concentrated in ONE describable class (availability answers) rather than scattered randomness. Nothing here resembles v16's structural violations; the schema split killed the praise-on-dish class outright.

Before the paid run:
1. **Guard the ids (required, code not prompt).** Validate every emitted `source_id`/`place_source_id` against the payload's id set at persist time; repair by unique suffix match, drop-and-log otherwise. Without this, ~2.5% of mentions land with ids that can't join back to documents.
2. **One more prompt pass at the availability class (recommended, cheap).** A single worked example covering "X has it / X does a $10 deal / X has OpenTable availability — responsive, warm, still not a claim" targets ~half of all remaining junk. If the owner would rather ship as-is, the cost is ~2-3% availability-flavored junk mentions, mostly praise carriers on real restaurants — polluting but not poisonous.

Worth an owner ruling, not blocking: discontinued-dish closure, the bbq/tex-mex taxonomy questions, and whether the 2% wrong-`place_source_id` audit-trail rate is acceptable (the names themselves were right in every one of those 26).

*Method note: sampling SQL, thread texts, and per-doc candidate-vs-live renderings live in the session scratchpad; all DB access was SELECT-only; the harness ran interactively (caller-tagged via the standard LLMService path), two full passes of 116 docs x 2 prompts on gemini-3-flash — well under the $5 envelope. Doc ids excluded: all 29 from plans/v16-trace-audit-20260825.md and all 45 from scripts/fixtures/prompt-ab-cases.json (posts containing any excluded comment were also excluded).*
