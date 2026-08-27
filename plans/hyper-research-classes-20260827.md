# Hyper-research: eight problem classes vs the full Austin corpus (2026-08-27)

Every instance of eight enumerable problem classes was pulled from
`collection_source_documents` (community=`austinfood`, title+body) with context
windows and read in full. Verdicts are against the current
`collection-prompt.candidate.md`. Counts are of regex hits actually read (some
comments hit twice; noted). Raw dumps live in the session scratchpad
(`c1_closure.txt` … `c8_giftcard.txt`).

Legend: **FITS-ALL** = every real instance is handled by the current rule.
**FITS-MOST** = handled except a named tail, quoted below.

---

## 1. CLOSURE — 213 hits (regex fixed: word-boundary RIP; the ~239 estimate included "trip"/"crispy")

Sub-senses, every hit classified:

| sense | ~count | handling |
|---|---|---|
| Real venue closure, eulogy/testimony around it | ~140 | rule fits: place CLOSED, warm words are a eulogy, nothing emits |
| RIP a **dish**, place still open | ~10 | Gate 2 dead-dish — see divergences |
| RIP a **person/joke/non-venue** | ~15 | closure attaches to nothing; no emit |
| "shut down" non-venue sense (unions, "the world shut down", electrical box, trademark, clubs) | ~10 | object isn't a venue; no effect |
| **Branch** closed, brand alive | ~8 | GAP — see below |
| Closed-then-reopened / temporary | ~5 | open-again override covers most |
| Out-of-market yardstick places (Meadowood, Chicago beefs) | ~8 | yardsticks anyway |
| Questioned/secondhand closure ("Didn't they shut down?", "someone on here said they shut down ATX Grill") | ~5 | see hearsay-closure ruling under class 5 |
| Corpus/meta noise | ~12 | none |

**Verdict: FITS-MOST, two named tails.**

**Tail A — the closure verb needs an OBJECT test.** The rule says "RIP …
anywhere in scope marks the place CLOSED", but the corpus is full of RIPs whose
object is not the venue:

- "**RIP Uchi Candy Bar** … our favorite date night spot Uchi. As always the
  food and service were excellent" (t3_1v4wt03) — the dish died; Uchi is open
  and praised. A naive scope-wide RIP read kills Uchi.
- "Post-2020 24 Diner has been disappointing… **RIP the roasted banana shake**"
  (t1_k43565h); "**RIP Freedmen's Bloody Mary**" (t1_jtj832h, mixed with live
  recs for Launderette/Paperboy); "RIP Nutella Hopdoddy Shake" (t3_1pcow3j);
  "I'm sad to report: RIP - this burger is no more" (t1_k217cyr, Wendy's-style
  place still open).
- Non-venue RIPs: "RIP to whoever sits beside me on that flight" (t1_k3bwagz),
  "RIP pops!" (t1_jw65l69), "RIP Brack hospital" (t1_jy1j4vw), "Mr Zaiger, I
  salute you, RIP" (t1_jusibd1), "RIP everyone who develops a $25/week wasabi
  habit" (t1_k0toe7l).

The prompt DOES already say "a dead dish is not a closed place" (Gate 2), but
PLACE STATUS itself never says to resolve WHAT the closure statement is about.
**Rederived ideal:** a closure marker closes exactly the entity it is ABOUT,
resolved like any reference: a venue → that venue is CLOSED; a dish → Gate 2
dead-dish (venue untouched); a person, branch, building, or joke → nothing.

**Tail B — a closed BRANCH is not a closed brand.** "They closed the South
location" (t1_k2q7bbb), "the eastside location closed recently … there's one in
Dripping Springs" (t1_k0zx6hp), "RIP the 29th St. location" (t1_jyu23ge), "sad
since the one on MLK closed. Great tortillas, great bean and cheese"
(t1_k2fc2tq — live testimony beside a branch closure!), "my heart broke when
they closed the Triangle location during COVID. They're always solid"
(t1_k435e04). Our grain is the brand; a branch closure must NOT trip PLACE
STATUS. Only "all/last of them gone" closes the brand: "they closed the last
one on 183 around 2018" (t1_lxvonty), "Not sure why they closed **all the
locations**" (t1_mozqd9t).

Tense never deciding, and unstated=open, are confirmed at scale ("I used to
get food there back in the early 00s" comments about live places are common).

## 2. DEAD DISH — 22 hits

| sense | count | handling |
|---|---|---|
| Genuine removed dish, place open (adobo taco, Elvis Green Chile Fried Chicken, Sway tom yum, Conquistador, tortilla española, pork dish) | 8 | rule fits: dish emits nothing, place untouched |
| **"off the menu" = FROM the menu, dish alive** | 5 | see divergence |
| Seasonal/pandemic removal, may return | 3 | "took it off the menu for summer" (t1_juosofw), "stopped making it due to the pandemic… if they brought it back it's a must try" (t1_k3f4bvk), feijoada (t1_k27xmsi) — not orderable NOW; correctly no dish emit; the venue's other verdicts still emit |
| Packaged/chain goods (HEB frozen pizza, Pepperidge Farm, KFC wedges) | 4 | fail PLACE TEST anyway |
| Regex noise ("no longer make my reservation") | 2 | none |

**Verdict: FITS-MOST, one named tail.** "Off the menu" has a live idiomatic
sense: "I enjoy several off the menu and it is 24/7" (t1_k2xbc4l), "ordering
straight off the menu" (t1_l8so0i3), "you can order them off the menu any other
time" (t1_nvgvhhs), "cocktails off the menu, good stuff" (t3_1639n0f). The
prompt's own example wisely quotes the verbed form ("they TOOK it off the
menu"). **Ideal (one clause):** a dish is dead only when the text says it was
REMOVED or is gone ("took it off", "no longer", "discontinued", "RIP");
"ordered/enjoyed X off the menu" is the from-the-menu idiom and the dish is
alive. Seasonal removals stay non-emitting until a source says it's back —
same shape as the closure open-again override.

## 3. BRANCH REFERENCE — 399 hits

| sense | ~count | handling |
|---|---|---|
| Branch phrase + brand in scope, carrying testimony ("the one on 183 … massive portions", "the S Lamar location is 🔥") | ~150 | rule fits: resolve to brand, brand-grain claim |
| Branch-vs-branch quality ranking ("south bakery better than north", "Mueller location is garbage / S Lamar always 🔥", "worst Whataburger is…") | ~60 | positive-branch clause emits at brand grain; negatives emit nothing. Pure relative within one brand ("the DQ on Manor is better than the one off Stassney") asserts no absolute verdict — should emit nothing; see class 6 |
| **"location" = the SITE quality/attribute sense** ("great location", "the location is ass", "location and vibe", real-estate talk) | ~70 | not a branch reference at all; nothing resolves. D-steps drop it (site-praise is either praise or complaint) |
| Operational/availability ("location coming soon", hours, parking, where is it) | ~45 | availability — no emit |
| Branch closed, brand alive | ~25 | class-1 Tail B |
| Out-of-market branches (Dallas/Houston/airport) | ~15 | brand-grain claim; geography is downstream's problem |
| Non-restaurant noise (grape appellations, WFH, photo location, planet k) | ~30 | none |

Brand actually in scope: in effectively every genuine branch-reference the
brand IS resolvable in the post object — the prompt's claim "nobody says 'the
south lamar location' without the brand being in the conversation" held with
no counterexample found. Unresolvable cases were the unnamed-venue kind
("the location next to Costco is cursed" — about the SITE, not a restaurant).

**Verdict: FITS-MOST.** Two additions earn their place: (a) class-1 Tail B
(branch closure never closes the brand; "last/all locations" does); (b) one
sentence noting that "location/the one on X" is only a branch REFERENCE when
it picks out a venue — "great location", "the location is bad" is a statement
about the site and resolves nothing. Sense (b) is ~18% of the regex class, so
the discrimination is worth stating, not just trusting.

## 4. ADOPTION — 140 hits

| sense | ~count | handling |
|---|---|---|
| "+1 for X" / "came here to say X" naming its own referent | ~35 | rule fits (self-named referent, ANSWER-TEST shape) |
| Bare "+1"/"seconded"/"came here to say this" resolving to parent | ~55 | rule fits (depth-aware referent; ambiguous → nothing) |
| Adoption + writer's own added testimony ("Seconded. Also Fajita Pete's, Lupe Tortilla…") | ~25 | both parts emit; fits |
| Dish-level adoption ("> Ramen tatsuya +1", "+1 on the burrata", "Seconded on the egg drop soup") | ~10 | dish-when-unambiguous arm fits |
| **Adoption of a NEGATIVE/hedged parent** | ~6 | see divergence |
| Partial adoption with carve-out ("+1 for Bricks but not for the wings" t1_jurpco3) | ~3 | clause law handles: place adopted, wings excluded |
| Noise ("+100 pts" inside an ask t3_155a2ei, "+1000lbs", "RIP"-style jokes, meta) | ~8 | no referent/testimony; nothing |

**Verdict: FITS-MOST, one named tail — adoption inherits the parent's
POLARITY.** The corpus contains agreements whose referent is a pan:

- "+1 on Launderette. It's like aimed at rich people with no taste in food"
  (t1_k426u0p) — agreement WITH a pan.
- "Seconded. Their soup is almost flavor free." (t1_k05cvjh)
- "Came here to say this. Ugh." (t1_jxgpac9)
- "Came here to say this. Do not go to Pasta Bar. Juniper and Intero are the
  way to go" (t1_ju5vxuh) — adopts a warning AND adds real picks; the picks
  emit, the warning doesn't.
- "Came here to say that Red Ash is overpriced nonsense … and to ring the
  Lenoir Klaxon … superbly delicious" (t1_jzkd07x) — mixed; only Lenoir emits.

The rule's wording ("under a parent that VOUCHES") already implies this, but
nothing says what a "+1" under a pan does. **Ideal (one clause):** an
agreement adopts the parent's testimony WITH its direction — under a negative
or hedged parent it is agreement with that criticism (A.2 NEGATIVE/hedged
applies) and emits nothing. ~6/140 real instances; cheap insurance against
minting praise from seconded pans.

## 5. HEARSAY — 89 hits

| sense | ~count | handling |
|---|---|---|
| Pure hearsay rec ("heard good things, haven't been") | ~48 | rule fits: no emit |
| Hearsay entry inside a mixed list (own-experience entries beside it) | ~15 | per-entry stripping (A.1 annotation rule) fits |
| Hearsay then went — **disconfirmed** ("had heard good things and took a friend — the gumbo was awful" t1_jzscdzk; "heard so many exciting comments… Verdict: 3/10" t1_jxi0wrh; "Had heard good things but won't go back" t1_k42a73c) | 3 | negative; no emit — fits |
| Hearsay then went — **confirmed** ("It's supposedly the most 'authentic Japan' ramen in Austin. And it is indeed very good." t1_jtu18fo) | 1 | the writer's own verdict clause emits; the hearsay clause doesn't — clause law fits |
| Hearsay about world facts (moving, prices, sold out, roaster heat) | ~12 | no claims; fits |
| "Supposedly" trivia/history/gossip (brothel bar, banana cultivars, gofundme) | ~10 | fits |

**Verdict: FITS-ALL for testimony — plus one interaction ruling to write
down: HEARSAY CLOSURE.** Closure is a fact about the WORLD, not testimony:
nobody needs to have eaten anywhere to report a place is gone, and the cost
asymmetry runs opposite to praise (a falsely-open place gets recommended to a
door that's locked; a falsely-closed one is recovered by B.1's open-again
override the next time anyone says it's back). **Ideal:** a closure REPORT in
scope — even secondhand ("I heard they closed", "someone on here said they
shut down ATX Grill" t1_jxyls0f) — counts as stated closure. A closure
QUESTION ("Didn't they shut down?" t1_jsc3b3j) states nothing; and a
self-corrected guess ("I figured it went out of business" answered by "glad
to hear it's still around" t1_jveg95p) resolves open by the override. This is
a deliberate asymmetry with A.2: hearsay can close a place, it can never
praise one.

## 6. COMPARISON — 488 hits (the big one)

| sense | ~count | handling |
|---|---|---|
| Winner declared, loser = named place, loser merely out-measured | ~170 | yardstick rule: winner emits, loser earns/loses nothing — RIGHT at scale (see below) |
| Winner + loser actively panned in the same breath ("compared to Interstellar it was basically toilet level garbage" t1_jzmviha; "Pok-E-Jo's is F-tier trash" t1_jzomcco; "that weird boiled meat at Bill Miller" t1_jxwoc0w) | ~20 | the pan is A.2 NEGATIVE for the loser's clause — emits nothing; system stores no negatives, so "loses nothing" is exactly right |
| Chains / three-way ("better than New World or Little Deli, but not on the level of Otherside" t1_jwrqpza; "on par with Franklins and L&L" t3_1747rw8) | ~20 | subject judged by net direction; ALL other names yardsticks — see the superior-yardstick note |
| "On par with" as a POSITIVE verdict vs an elite anchor ("on par with some Michelin starred meals" t1_ju52z0q; "on par with what I got in Louisiana" t1_jrn2c1x) | ~15 | net-positive verdict on subject emits; anchor is a yardstick — fits |
| Hedged wins = no endorsement ("no better than McD's" t1_jssqu1n; "wasn't much better than FF"; "marginally better than Terry Blacks"; "a little better than WiseGuys but not the star") | ~20 | net-direction law: fails — fits |
| Comparison vs non-place standard (home cooking, other cities, "better than expected", "better than it has any right to be" t1_k3nd6ia) | ~50 | positive verdict emits, no yardstick place involved; the relation itself never a property (D.2) — fits |
| Self-comparison over time ("much better than before" t1_k42n800; "WAY better than I remembered" t1_jujrcju; "better than it used to be" class) | ~10 | net-positive verdict on the place today; emits — fits. (Downhill direction is negative; no emit.) |
| Dish-vs-dish inside one venue ("tiramisu better than their cannoli" t1_k110p2e; "their fajitas are better than their BBQ" t1_jtl9uep; "ramen blows their sushi out of the water" t1_k0i3ykl) | ~15 | winner dish emits, loser dish is a yardstick — fits |
| Branch-vs-branch, same brand ("the DQ on Manor is better than the one off Stassney" t1_jyqafds) | ~10 | purely relative within one brand: no absolute verdict exists; ideally emits nothing (both subject and yardstick are the same brand-grain entity). Worth one clarifying sentence |
| Comparative ASK ("Anyone know if it's better than Katz" t1_k2ild45; "Better than Veracruz for breakfast tacos?") | ~15 | A.2: names in a request are the question — fits |
| Grocery/packaged comparisons (HEB tortillas, milks, "Better than Bouillon" the PRODUCT ~5 hits) | ~35 | PLACE TEST; note "Better than Bouillon" is a brand name, not a comparison — B.1 framing handles it, but it is the one string where the comparison regex names a product |
| Non-food noise (people, politics, google skills) | ~60 | none |
| Duplicate hits within long comments | ~20 | — |

**Verdict on "loser earns nothing, loses nothing": CORRECT AT SCALE.** Read
against all 488, the alternative (giving losers negative treatment) would be
wrong: most losers are respected places out-measured on one axis by one
person ("Franklin does have the best brisket in town, but not by much"
t1_k2ki36x — Franklin is the LOSER of the sentence and obviously not
negative). Where the loser genuinely deserves negativity, the writer always
supplies pan words of their own, and A.2 NEGATIVE already silences that
clause. No corpus instance needs a third arm.

**One honest recall tail, recommendation: keep the rule.** The
superior-yardstick shape — "X is better than A, but not on the level of B" —
implies the writer ranks B above both, usually from experience (~20
instances: Otherside's reuben, La BBQ/Micklethwait over True Texas t1_jzz5idn,
Tumble22 over "almost on par" t1_juop5f5). Under the rule B earns nothing.
The endorsement is real but inferential (no clause is ABOUT B), and opening
the door invites the LLM to mine every comparison's upper bound. Precision
wins; the loss is bounded and known.

## 7. TASTING / PRIX FIXE / RESTAURANT WEEK — 106 hits

| sense | ~count | handling |
|---|---|---|
| Ate the tasting menu, verdict follows ("did the tasting menu and everything was perfect" t1_k1c471u) | ~40 | terms-only phrase: restaurant-only carrier + `tasting menu` place attribute; dishes named inside judged normally ("the Vietnamese coffee ice cream sandwich was probably one of the best things I've ever eaten" t1_jv85wq5 emits as a dish) — fits |
| Pick + tasting-menu use-note ("Apt 115 — don't let their online menu fool you, try their tasting menu", 4 near-identical comments) | ~15 | ANSWER-TEST pick with a use-note annotation; fits |
| Hedged/negative tasting experiences ("felt short… one was bad" t1_ju55jnh; "absurdly bad QPR" t1_jrjsk0k) | ~15 | no emit — fits |
| Restaurant-week PLANS / menu-browsing ("who's going where?", "this year thinking about cafe no se, loca Doro, sway" t1_jyu6vxh) | ~12 | plan/browse — the browsing-shortlist law covers exactly this; no emit |
| Restaurant-week EATEN reports | ~8 | judged on their verdicts: "went the other night and it was great. Packed for restaurant week" (t1_jzh2wud) emits; L'Oca RW "completely just fine" (t3_16l98g6) and "left disappointed… way too salty" (t1_k11n7x8) fail; "the Chicken Rice Bowl ($16) was fantastic!" (t3_16cpaxw) emits as a dish — fits |
| ARW meta: pricing analysis, website complaints, participation lists | ~12 | directory/price-only/negative — fits |
| Prix-fixe value picks ("Carillon — cheap 3 course prix fixe" t1_k3547pi) | ~4 | value testimony: carrier + `good value`/`prix fixe` attributes — fits |

**Verdict: FITS-ALL.** Restaurant week needed no rule of its own: it decomposes
into the plan-vs-report tense law, the external-criterion directory arm (ARW
participation lists), the terms-vs-food gate, and price-only. Confirmed the
danger case — a curated "which RW menus look good" list — is precisely
N14-browsing-shortlist, already pinned.

## 8. GIFT CARD — 19 hits

| sense | count | handling |
|---|---|---|
| Ask: which restaurant to buy a gift card FOR (t3_16kbocx atmosphere criterion; t3_1pr1qzg vegetarian) | 2 | judgment asks about the venue; replies are picks — ANSWER TEST |
| Reply = pick ("Gift card for bouldin creek cafe!" t1_nuyzm7c; Justine's "phenomenal food" t1_k0v0mi9) | 3 | picks/testimony emit; "they sell gift cards too" is availability |
| Bought/holds a card + hearsay ("I bought an online giftcard for Tillies… I hear it is a very lovely venue" t1_k0uvg2v — the known leak) | 1 | A.2 HEARSAY; buying a card is not eating. Covered as-is |
| Card as payment context inside real testimony ("had a gift card to use… was really impressed with everything" t1_jzp3jej; Loro price defense t1_jywiwdn; ALC "pretty good food" + Costco GC t1_jty87na) | 4 | testimony judged on its verdict clauses; the card is irrelevant — fits |
| Negative/refusal ("would rather throw the gift card in the trash than eat at La Condessa" t1_nv4xnxh; "noped so hard" t1_jzyatbn; sewage smell t1_jypl9jb; "Guess I won't be using that gift card" t1_jutx8qp) | 4 | NEGATIVE — no emit |
| Non-claims (raffle/marketing math, spa reward, Oseyo unknown, Aussie-business ask, "refund and a gift card please") | 5 | nothing |

**Verdict: NO RULE NEEDED.** All 19 decompose into existing arms (hearsay,
answer test, availability, negative, clause law). The Tillies leak was a plain
hearsay miss, not a gap: owning a gift card is anticipation, not testimony —
if anything, one illustrative example in A.2 HEARSAY ("bought a giftcard, I
hear it's lovely") is the entire fix.

---

## Gold-pin impact

No fresh case flips an existing pin. Checked against
`apps/api/scripts/fixtures/prompt-ab-cases.json` (123 cases): D12-closed-place
and N6-closure-lulu-bs stay CLOSED under the object-resolved closure rule
(their closures are about the venue itself); N11-discontinued-dish unchanged
(verbed removal); N12-branch-phrase unchanged (resolution, not status);
N13-yardstick unchanged (rule kept as-is, deliberately); C7/V14e adoption pins
are positive-parent adoptions, untouched by the polarity clause. All proposed
changes are ADDITIVE clauses; each also supplies fresh gold-pin material:

1. **Closure-object test** (class 1 Tail A) — pin: "RIP Uchi Candy Bar" post
   → Uchi OPEN, dessert dead, date-night testimony emits.
2. **Branch closure ≠ brand closure** (class 1 Tail B / class 3) — pin:
   "sad since the one on MLK closed. Great tortillas, great bean and cheese"
   → brand OPEN, testimony emits.
3. **"Off the menu" idiom** (class 2) — pin: "I enjoy several off the menu
   and it is 24/7" → dishes alive.
4. **Adoption polarity** (class 4) — pin: "+1 on Launderette… no taste in
   food" → nothing emits.
5. **Hearsay closure closes** (class 5) — pin: "someone said the owners shut
   down ATX Grill" → CLOSED; "Didn't they shut down?" alone → OPEN.
6. Optional clarifier: within-brand relative comparison emits nothing
   (class 6/3 overlap).
