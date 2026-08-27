# Collection prompt — synergy red team (v17-final + af681538a working tree)

Target: `apps/api/src/modules/external-integrations/llm/prompts/collection-prompt.candidate.md`
(1,212 lines / **11,378 words**) and `COLLECTION_RESPONSE_JSON_SCHEMA` in
`apps/api/src/modules/external-integrations/llm/prompts/llm-response-schemas.ts`.
Lens: does this read as ONE law-system, or as laws that fight, echo with drift, and
leave torn cases? Read line by line; prior audits treated as stale.

Verdict up front: the spine (four named tests, clause-by-clause, observed-span) is
genuinely coherent and mostly holds under load. The damage is concentrated in three
places: (1) the schema's `item` description contradicts Gate 1's own first arm;
(2) the mild-word POSITION rule and the "but"-subject rule return opposite verdicts on
the prompt's own example sentence; (3) PLACE STATUS's criterion clause and its
"unstated means OPEN" clause collide in exactly the thread shape it was written for.
Everything else is drift, echo mass, and two unabsorbed riders.

---

## F1 (P0) — The schema forbids what Gate 1 commands: "combo" as `item`

Prompt, Gate 1 arm 1:

> **The phrase tells you what arrives → it is a DISH, emitted AS SPOKEN.** … ("steak
> combo", "seafood lunch special", "salmon omakase", "dumpling combo") … through a
> PROPER NAME that fixes one menu offering ("the Elvis Presley combo", "the Hangover
> Special") … Emit the phrase a diner would say to the server — "steak combo", never a
> stripped "steak"

Schema, `item`:

> complete compound term, singular, excluding attributes — **never a delivery wrapper
> (special, combo, menu)**, a cuisine, or a food token from the venue name

These are flat contradictory on the exact strings the prompt uses as its teaching
examples. The schema description is not commentary — under constrained decoding it is
in-context law arriving *after* the prompt, at the moment of emission. Any "steak
combo" / "Elvis Presley combo" / "nigiri special" case is a coin flip, and the coin is
weighted toward the last thing read (the schema).

Rederived shape: the schema's `item` description must carry the SAME question, not a
banned-word list. Replace with the FOOD-OR-TERMS question itself — *"the phrase a diner
would say to the server, kept whole when any part of it predicts what arrives ('steak
combo', 'nigiri special'); no item at all when the phrase is only terms ('lunch
special', '$25 combo')"*. Word lists in a schema description will always drift from a
prompt that reasons; the schema should state the test, never the banned tokens. Same
audit is owed on `item_categories` ("never a … delivery wrapper") — that one is
consistent with C.3 and can stay.

## F2 (P0) — POSITION vs the "but"-subject rule contradict on the prompt's own sentence

Both live in A.2, ~15 lines apart.

POSITION rule:

> for the mild words ("solid", "decent") POSITION decides the direction: standing alone
> as the whole verdict they lean positive … qualified or offered as a CONCESSION inside
> a cooler frame they withhold ("solid enough", **"I wasn't huge on De Nada but they had
> a decent hard shell taco"** — the concession softens the miss, it doesn't endorse)

"but"-subject rule:

> **a "but" never reaches back across a subject change** … Before letting a "but" defeat
> a verdict, ask what the downgrade is ABOUT: the same subject as the verdict defeats
> it; **a different dish, a different place, or a separate aside is a new clause** under
> this step's clause-by-clause law, and the earlier verdict stands.

Walk De Nada under the second rule: subject 1 = the place (negative), subject 2 = the
hard shell taco (a DIFFERENT subject). The "but" therefore does not reach the taco
clause; the taco clause is judged on its own; standing alone "a decent hard shell taco"
is a mild word as the whole verdict → **emits**. The first rule says it emits nothing.
The prompt's own worked example is the counterexample to its own later law.

The deeper problem: the two rules use different units. POSITION reasons about the
RHETORICAL FRAME (concession inside a cooler sentence); "but"-subject reasons about the
SUBJECT. A concession is by definition a clause about a different subject — so the
"but"-subject rule, read literally, dissolves the entire concession category.

Rederived shape: one law with an explicit order of operations. *A clause's net direction
is decided on its own words (POSITION). A "but" transfers a downgrade only within one
subject. When a mild-word clause is the CONCESSIVE half of a contrast whose other half
is a miss on the same visit, the contrast is the frame, not two verdicts — the mild word
withholds.* Then re-cite De Nada under the single law, and give the "but"-subject rule an
example where the two halves are genuinely independent (the Uroko sentence already
there) so the reader sees the boundary rather than two competing tests.

## F3 (P0) — PLACE STATUS: criterion-closure vs unstated-means-OPEN

> Stated closure ("RIP", "closed down", …) anywhere in scope — **including the frame of
> an ask whose selection criterion is that its places are gone** ("who remembers \_\_\_?",
> "a memorable meal at a place that didn't last long") — marks the place CLOSED, and NO
> mention of it emits from any source in this post object … A place is closed only by a
> **STATED fact about the PLACE** … and never by guessing: **unstated status means OPEN.**

The criterion clause makes an ASK's framing a closure fact; the next sentence says only
a stated fact about THE PLACE closes it and unstated means open. In the canonical
nostalgia thread — "what Austin restaurant do you miss most?" — the ask names no place,
and every ANSWER names a place whose status is never stated. Three defensible readings:

1. the ask's criterion propagates to every answer → the whole thread emits nothing;
2. closure attaches only to places the ask itself names → every answer emits, and the
   ANSWER TEST (A.1) makes each bare name a full endorsement → the pipeline ingests a
   thread of dead restaurants as live picks;
3. per-place: closed only where a source says so.

Reading 2 is the literal one and it is the failure the rule was written to prevent.
Compounding it: A.1 has "a REMEMBERED verdict is still a verdict" with a parenthetical
pointing HERE — "(nor is it a closure — the place is open; B.1's PLACE STATUS rule)" —
which is true only because that example's place happens to be open. The reader now has a
memory rule that says remembered-is-live and a status rule that says the ask's nostalgia
frame is a closure fact.

Rederived shape: make the unit explicit and make the criterion a per-place inference,
not a scope-wide one. *PLACE STATUS is resolved per NAME. A place is closed when some
source in scope says THAT place is gone, or when the ask asks specifically for places
that are gone AND this name is offered as an answer to it.* That second half is exactly
the missing bridge — it closes reading 2 without turning an ask's mood into a fact about
places it never names. Add the one-line consequence the pipeline needs: *a nostalgia ask
whose criterion is "gone" yields NO mentions from its answers, however warm — the
endorsement is real and unusable.*

## F4 (P1) — `is_menu_item` is torn on the formats Gate 1 promotes

C.1 Gate 1: `"salmon omakase"` is a DISH; formats like omakase/dim sum are
"usually a FAMILY, `is_menu_item: false`, Step E". Step E:

> "the omakase at Sushi Nakazawa" → true (one fixed offering)

So the same word is the false-example in C and the true-example in E, and "salmon
omakase" (a narrowing the source itself wrote) has no verdict at all. E's own bar —
"could two diners each order 'the X' here and be handed the same thing?" — answers
TRUE for an omakase house and FALSE for a place with three omakase tiers, i.e. it asks
about the MENU, which E elsewhere forbids ("family size is a fact about the MENU, not
the sentence" — used to justify FALSE for "Levain cookies").

Rederived shape: drop the menu-fact reasoning entirely and make E purely a fact about
the SENTENCE: *`true` when this source's own words narrow the order to one thing a
server would not ask a follow-up question about.* Then "the omakase" → false (which
tier?), "salmon omakase" → true, "Levain cookies" → false, and C and E stop disagreeing.
Fix C.1's parenthetical to point at the sentence bar rather than pre-deciding `false`.

## F5 (P1) — Gate 1's three arms have no priority, and multi-food combos fall between them

Requested walks, with where each lands:

| phrase | walk | outcome |
|---|---|---|
| "salmon omakase" | arm 1 (food word) | dish `salmon omakase`; `is_menu_item` torn (F4) |
| "the Elvis Presley combo" | arm 1 (proper name) | dish, empty categories, `is_menu_item: true` — clean |
| "lunch special" | arm 2 | no dish, PLACE carrier `general_praise: true`, `good value` — clean, and echoed identically at C.2.4, C.3, D.3, F.1 |
| "$25 combo that includes a drink" | arm 2 (a "drink" is a wanting-anything word, Gate 2) | place carrier — clean, mild wobble on whether "drink" is food language |
| "wings and a milkshake, my favorite combo" | arm 3 vs C.2 step 3 | **torn** |
| "2 item combo with brisket" | arm 1 vs arm 3 vs C.2 step 3 | **torn** |
| "seafood boil combo #5" | arm 1, span boundary unruled | **torn** |
| "half a Rueben and French onion soup lunch combo" | no arm fits | **torn** |

The four tears share one cause: **the arms are presented as a menu of readings with no
question that selects between them.** Specifically —

- Arm 3 ("the writer's own COMMENTARY on things they combined") says emit the FOODS
  separately; C.2 step 3 says "For with/and clauses, keep the core dish as `item`; the
  listed items are components". "wings and a milkshake" satisfies both descriptions.
- "2 item combo with brisket": arm 1 sees a food word and wants `2 item combo with
  brisket`; C.2 step 3 wants core = "2 item combo" = terms-only = no dish; arm 3 wants
  `brisket`. The prompt's own example only resolves because a verdict lands on one
  content ("the sausage was incredible"). Strip the verdict and nothing decides.
- "half a Rueben and French onion soup lunch combo" is a MENU combo naming two foods.
  Arm 3 covers only writer-stapled combinations; arm 1 produces an unsayable 8-word
  `item`; C.2.4's sanity peel has no rule for which of two heads survives.

Rederived shape: replace the three arms with one question asked of the FOOD WORDS, not
of the combo word: *how many things does this phrase tell you arrive?*
**None → no dish (place carrier).** **One → one dish, emitted as spoken, terms-words
included when they are part of how you'd order it.** **More than one → one dish claim
per food, each judged on its own clause; the combo word names nothing.** That single
counting question decides all eight rows above without arms, and it subsumes C.2 step 3
(additive components are the ones the phrase does NOT say arrive separately — a
"with burrata" pasta is one thing arriving).

Two smaller gaps surfaced in the same walk: no rule for a numbered menu item
(`seafood boil combo #5` — keep the number or not?), and **no dish-side misspelling
rule**. B.3 is emphatic that a misspelled NAME stays as written; C.2's "keep every
letter as the writer spelled it" appears only inside the diacritics clause, so "Rueben"
has no ruling. Dishes resolve to a shared concept downstream — the correct law is the
opposite of B.3's, and it should be stated: *a dish is emitted in its standard spelling;
only names are transcribed faithfully.* That asymmetry is currently invisible.

## F6 (P1) — The YARDSTICK law has no stop, and it points at ranked lists

A.3:

> **A name in a verdict clause is either the SUBJECT or the YARDSTICK — the thing
> measured against — and yardsticks earn nothing, in either direction.** This is one law
> with three familiar costumes: the benchmark inside an ask …, the credential list …,
> and the losing side of a comparison

The three costumes are clean and the law is genuinely one law. The bleed is that the
selecting question — *"is the verdict ABOUT this, or measured AGAINST it?"* — returns
"measured against" for structures that are not comparisons at all:

- **Ranked lists.** "#1 Franklin, #2 la Barbecue, #3 Interstellar" — every entry below
  #1 is, on its face, measured against #1. Nothing in A.3 says a rank POSITION is not a
  yardstick, and A.2 actively teaches rank-relative suppression ("a middling score amid
  higher-rated siblings … a 7.3 beside the writer's 8.4 favorite withholds endorsement").
  A model that generalizes that will silently drop the tail of every ranked rec list —
  the highest-value shape in the corpus.
- **"better than the old location."** B.1 resolves a branch phrase to the named brand,
  so subject and yardstick are the SAME restaurant. Harmless in outcome, but the reader
  has to notice the collapse; nothing says so.
- **"lighter than Jets"** is handled twice (A.3 yardstick, D.2 comparison-is-never-a-
  property) and the two agree — this one is fine, and is the model for what the others
  should look like.

Rederived shape: give the law its boundary in the same sentence that states it. *A
yardstick is a name the clause uses to CALIBRATE a verdict about something else. A name
that carries its own verdict is a subject, however it is ordered relative to others —
rank is presentation, not measurement.* And separate the score rule from the yardstick
rule explicitly: the 7.3-among-8.4s case fails because a score IS that entry's verdict
and this one is low on the writer's own scale, not because it was measured against a
sibling. As written the two read as one mechanism and they are not.

## F7 (P2) — The fact-ask boundary works; its asymmetry is unstated

Walk "who has good cheap tacos open late?":

1. A.1 cond 1 — criterion includes quality ("good") → **judgment ask**. The rule fires
   cleanly ("The verb never decides — the CRITERION does"). No hesitation.
2. Bare reply "Torchy's" → ANSWER TEST → testimony; ask's dish word inherits via C.1
   Gate 3 → dish `taco`, `is_menu_item: false`.
3. D's fit assertion → `cheap`, `open late` in `place_attributes` (D.4 lists both as
   place-side; "cheap tacos" resolves via "price talk about a specific dish is still a
   place-level signal"). "good" is praise, dropped by D.1. F.1 also emits the place
   carrier. Correct, and reached without a coin flip.

The hesitation is elsewhere: the same reply's own sentence "they're open till 3" is an
availability clause and emits nothing (A.2), while the ASK's word "open late" becomes an
attribute of that same place. The reply is forbidden to assert what the ask is allowed to
assert on its behalf. This is defensible (a pick vouches for FIT; a locator vouches for
nothing) but nowhere said, and it is the kind of asymmetry a model resolves by
overgeneralizing one side. One clause in D's opening rule fixes it: *the ask's constraint
is asserted by the CHOICE, not by the reply's sentences — a reply that merely restates the
constraint as a fact still adds nothing.*

## F8 (P2) — The two flagged riders: one is a real bolt-on, one is a duplicate law

**(a) "A shortlist built by BROWSING is a plan too, however curated"** (A.2 PLAN).
This is a bolt-on, and it marks a real collision it does not name: A.1's ANSWER TEST
grounds endorsement in "the writer chose those names out of everything they could have
said; the choice is the endorsement" — and a browsed shortlist IS a taste-driven choice.
The rider says "no" without saying WHY the choice doesn't count. Rederive by stating the
precedence once, in the four-tests preamble where THE TESTIMONY TEST is defined: *choice
is endorsement only when the chooser has eaten, or when the choice ANSWERS a request for
a pick. A choice made by reading menus answers nothing and has eaten nothing.* The
browsing case then falls out of the law and the rider deletes.

**(b) "(about the same establishment)"** (A.1, experience-narration bullet) — with its
own inline gloss "a visit list introducing a review of a DIFFERENT place is a credential,
A.3's yardstick". This is not a rider, it is **A.3's credential costume stated a second
time, in A.1, in different words**, with a cross-reference admitting it. Two homes for
one law is exactly the drift generator this document is otherwise good at avoiding.
Rederive: delete the parenthetical and the gloss; the narration bullet says only "when
the narration carries or leads to a verdict", and A.3's SUBJECT-or-YARDSTICK question
answers "a verdict about WHAT?" once, for both steps. -35 words, one law, one home.

## F9 (P2) — Token mass and name re-bloat

11,378 words against the ~10,500 the trim landed on: **+~880 (+8%) re-bloat**, 26
commits touching the file this month. Distribution:

| section | words | share |
|---|---|---|
| Step A (incl. A.1 1,127 / A.2 1,371) | 3,455 | 30% |
| Step B | 2,285 | 20% |
| Step C | 2,365 | 21% |
| Step D | 1,828 | 16% |
| preamble + loop | 561 | 5% |
| Steps E + F | 934 | 8% |

A.1+A.2 alone are 2,498 words — 22% of the document in two subsections, both of which
are now long enough that their internal rules (F2) no longer see each other. That is the
structural cause of the P0s, not a style problem.

Named machinery in play: 5 named TESTS plus, as separately-named laws the reader must
hold, PLACE STATUS, THE YARDSTICK, FOOD-OR-TERMS, the fit assertion, the ANSWER TEST,
the depth-aware order, the clause law, the shorthand rule, the position rule, and the
"but"-subject rule — **~14 named things**, against the preamble's promise that there are
FOUR ("Learn these by name; the steps below refer to them by name"). "combo" appears on
16 lines; `general_praise` on 10; "shorthand" on 9. The four-test frame is still the best
thing in the document; it is now describing a minority of the law.

Recommended reductions, all of which fall out of findings above and none of which is a
patch: F5 collapses Gate 1's three arms + C.2 step 3 (~-180 words); F8 deletes two riders
(~-70); F2 merges two rules into one (~-90); F6's boundary is +20 but retires the
overlap between the score rule and the yardstick rule (~-60 net). ≈ -400 words while
removing three contradictions.

---

## Three fresh end-to-end walks

### Walk 1 — trip report with a credential intro

> **Post** (`SRC001`, `extract_from_post: true`): "Four days in Austin, first time.
> I've eaten at every Michelin spot in SF and Chicago so my bar is high. Anyway: Franklin
> (worth the 3am line, the fatty brisket is unreal), Veracruz — got the migas taco, solid,
> and the al pastor was way better than the ones at Torchy's. Uchi's happy hour is the
> best deal in the city. Sad we missed Suerte. How'd we do?"

- "every Michelin spot in SF and Chicago" — credential, A.3 yardstick. No names, nothing
  to suppress. Clean.
- "How'd we do?" — A.1 feedback rule; the past-tense list is a REPORT not a plan (A.2's
  cuts-both-ways clause). Clean, and this is the doc working well.
- Franklin: "worth the 3am line" = indirect recommendation; fatty brisket unreal → dish
  `fatty brisket`? or `brisket` + `fatty` peeled? **Hesitation:** C.2 step 2's sameness
  question says "fatty brisket" and "brisket" are different orders → keep whole; D.2 would
  find "fatty" fails STANDALONE (a fatty roast, a fatty broth). Both point the same way
  (keep in `item`, not an attribute) but only if the model runs C before D — which the
  Step C opener demands. Resolves, with a wobble.
- Veracruz / migas taco "solid": **F2 fires.** Standing alone as the clause's whole
  verdict → emits. But it sits in a contrast with the al-pastor praise that follows, which
  reads as a concession frame. Coin flip on a very common shape.
- "al pastor was way better than the ones at Torchy's": subject = Veracruz al pastor
  (emits), Torchy's = yardstick, earns nothing. Clean — A.3 handles it, and D.2 stops
  "better" becoming an attribute.
- "Uchi's happy hour is the best deal in the city": Gate 1 arm 2, terms-only → PLACE
  carrier, `general_praise: true`, `good value`. **Hesitation:** D.3 also permits the bare
  terms-word as a venue attribute "when it characterizes how the venue serves" — is
  `happy hour` in `place_attributes` here, or only `good value`? D.4's occasions bullet
  says "great happy hour" → `place_attributes`. So three rules touch it and two say yes,
  one is silent. Probably `["good value","happy hour"]`; not certain.
- "Sad we missed Suerte" — no experience, emits nothing. Clean.
- `place_observed` for "Uchi's happy hour": B.3 strips the possessive clitic → `uchi`.
  Clean.

Net: 3 clean, 2 hesitations, 1 coin flip (F2).

### Walk 2 — deal thread with consumed contents

> **Post** (`SRC010`): "Anyone know who's doing good lunch deals downtown?"
> **C1** (`SRC011`): "Cafe Nena has a $14 two-course lunch, Mon-Fri only."
> **C2** (`SRC012`): "Nena's lunch special is my go-to. Got the 2 item combo with brisket
> and mac last week — brisket was incredible, mac was fine."
> **C3** (`SRC013`): "+1, and their patio is great"

- Ask: criterion is "good lunch deals" → contains quality → **judgment ask** (A.1 cond 1
  fires correctly). Fit-asserted venue words: `lunch`? `downtown`? **Hesitation:** "downtown"
  is a location, not a filterable venue property; D.2 would likely drop it as
  context-stripped, but D's opening rule lists the ask's constraint words without excluding
  geography. Unruled.
- SRC011: availability + hours annotation → A.2 AVAILABILITY, and A.1 cond 2's
  "annotation that supplies the REASON the name is on the list" → emits nothing. Clean, and
  two independent rules agree — good redundancy.
- SRC012: "lunch special is my go-to" → Gate 1 arm 2 → place carrier `general_praise:
  true` + `good value`. Then "2 item combo with brisket and mac" → **F5 fires** three ways;
  the per-item verdicts rescue it (brisket emits; mac "fine" is hedged, A.2, drops). So the
  right answer is reachable but only via the arm the prompt happens to have exampled.
- SRC013: "+1" adopts SRC012's testimony (A.1 short-agreement) — adopts WHICH claim? The
  parent holds a place carrier, a brisket dish, and a failed mac. The rule says "credit the
  same restaurant (and dish, when unambiguous)". Two dishes, one hedged → **hesitation** on
  whether "unambiguous" means "one dish" or "one PASSING dish". Then "their patio is
  great" → place attribute `patio`, praise dropped. `place_source_id` = SRC012 (the source
  that names Nena) while `source_id` = SRC013 — the two-licensed-cases rule handles this
  precisely. Clean and impressive.
- **Cross-source naming:** SRC011 writes "Cafe Nena", SRC012 writes "Nena's". B.3 is
  explicit — two spellings, two mentions, no unification; SRC012 emits `nena` (clitic
  stripped). Clean.

Net: 2 clean, 2 hesitations, 1 fired defect (F5).

### Walk 3 — nostalgia ask with a still-open aside

> **Post** (`SRC020`): "Which Austin restaurant do you miss the most? Mine's Threadgill's
> — that chicken fried steak was the best in town."
> **C1** (`SRC021`): "El Azteca. RIP. Their puffy tacos ruined me for everyone else's."
> **C2** (`SRC022`): "Hoover's, hands down."
> **C3** (`SRC023`): "Everyone says Threadgill's but honestly Nau's Drug Store is still
> open and their chicken fried steak is better than Threadgill's ever was."

- **F3 fires immediately and hard.** The ask's criterion is "gone". Threadgill's, Hoover's,
  El Azteca are all closed in the real world; only El Azteca is STATED closed ("RIP").
  - El Azteca: clean — stated closure, PLACE STATUS kills the puffy-taco claim despite
    real testimony. The doc's "praise beside a closure is a eulogy" line is exactly right.
  - Threadgill's (SRC020) and Hoover's (SRC022): status never stated. Literal reading —
    unstated means OPEN → both emit, Hoover's as a bare ANSWER-TEST pick with
    `general_praise: true`, Threadgill's with an inherited/own `chicken fried steak` dish
    mention. **Both are wrong ingests, and the prompt as written licenses them.**
  - Under reading 1 (criterion propagates thread-wide), SRC023's Nau's is also killed —
    also wrong, and the "says the place is open again overrides" clause is the only thing
    that saves it. It saves Nau's by luck: the writer happened to say "is still open".
- SRC023's comparison: Nau's is the subject (emits, `chicken fried steak`), Threadgill's is
  the yardstick — and A.3's "being merely out-measured, loses nothing" means the yardstick
  rule does NOT close Threadgill's either. **Hesitation:** "Everyone says Threadgill's but
  honestly…" is a reaction-to-consensus; A.1's consensus-reported rule ("people rave about
  ___" is testimony) collides with the "but" that rejects it. The "but"-subject rule
  should defeat it (same subject) — but consensus-as-testimony and the negative reaction
  are never put in contact anywhere in the document.
- SRC022 "Hoover's, hands down" — ANSWER TEST, bare pick, place carrier. The pick machinery
  is working perfectly; it is working on a restaurant that closed in 2019.

Net: 1 clean, 1 hesitation, 1 P0 defect producing 2–3 bad rows on a 4-source thread.
This walk is the strongest argument for F3 being the top fix.

---

## Ranked summary

| # | Sev | Finding | Shape of fix |
|---|---|---|---|
| F1 | P0 | Schema `item` bans "combo/special/menu"; Gate 1 emits them | schema states the FOOD-OR-TERMS question, not a banned-word list |
| F2 | P0 | POSITION rule vs "but"-subject rule contradict on De Nada | one law, explicit order: clause direction first, "but" transfers within one subject, concession named as a frame |
| F3 | P0 | PLACE STATUS criterion vs unstated-means-OPEN; nostalgia threads ingest dead places | status resolved per NAME; a "gone" ask closes the names offered as its answers |
| F4 | P1 | `is_menu_item`: omakase false in C, true in E; menu-fact vs sentence-fact | E becomes purely a fact about the sentence |
| F5 | P1 | Gate 1's three arms unprioritized; multi-food combos unhandled; no dish-misspelling rule | count how many things the phrase says arrive (none/one/many); state the dish-vs-name spelling asymmetry |
| F6 | P1 | YARDSTICK has no stop — bleeds toward ranked lists; tangled with the score rule | yardstick = calibrating name; rank is presentation; separate the score rule |
| F7 | P2 | Fit assertion asserts what the reply's own availability clause may not | say the choice asserts, not the sentence |
| F8 | P2 | "browsing shortlist" bolt-on; "(about the same establishment)" duplicates A.3 | precedence line in the preamble; delete the duplicate |
| F9 | P2 | 11,378 words (+8% since trim); A.1+A.2 = 22%; ~14 named laws vs a promised 4 | the fixes above net ≈ -400 words |
