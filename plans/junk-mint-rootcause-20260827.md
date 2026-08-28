# Junk-mint root causes — v17 shadow replay (bench-review-20260827-034805)

Full-population walk of all 72 JUNK-MINT + VARIANT-TWIN entities from the
new-entities report. For every one: the raw source text was pulled from staging
(`collection_source_documents` joined through `core_restaurant_entity_events`
scoped to the d68b8b2b shadow runs), and the model's reasoning was re-walked
against the candidate prompt. This goes one level below the report's symptom
buckets: not "grocery leaked" but WHY the rule lost.

**Blast radius up front: it's small per entity.** 68 junk entities carry 71
events total; the 4 twins carry 4. All but three entities have exactly ONE
event from ONE source (super thin: 2, craft beer bar: 2, traditional bbq: 2).
No junk entity has consensus weight — each is a one-mention leaf. The
user-facing risk is not ranking damage, it's clutter: junk dish rows under
real venues, and (worse, uncounted by the report) the grocery cluster also
minted **retail brands as restaurants** — Caymus (the winery), Fairlife (the
milk brand), plus H-E-B / Central Market / Whole Foods / Sprouts carrying
"dishes." A user browsing H-E-B would see nine Napa cabernets listed as things
it serves.

---

## Root cause 1 — B.2's drop arm is "prepare later"-shaped, so ready-to-consume retail goods walk through (16 entities, 16 events)

**The model's-shoes walk.** Take "Some nice Napa cabs I've had from heb: Paul
Hobbs ~$100…". Step A: real first-person testimony ("I've had", "drink the
shit out of Lewis") — passes. Step B.1: H-E-B is named — passes. Step B.2, the
PLACE TEST: *"food PREPARED AND SERVED BY this place, to eat now — or goods
SOLD PACKAGED to take home and **prepare later**?"* A bottle of wine needs no
preparing. Every PACKAGED example in B.2 involves cooking or bulk ("gets
watery when you cook it", "buy a 40 lb bag", "marinara"), and the SERVED
examples include "the meat pastries **from** the ladies in the windows" and
"the deli's turkey" — so "cabs I've had **from** heb" pattern-matches the KEEP
shapes. The one sentence that would kill it — "a grocery haul is eaten too,
but it was never SERVED" — lives buried inside C.1 Gate 1's NONE arm (deal
contents), a step the model only reaches after B already passed, and phrased
about deal enumerations. The model is not ignoring B.2; B.2's own words
genuinely fail to cover consumed-as-sold retail goods.

**Instances (16):** 2018 caymus ("saw it recently behind glass at my local
H-E-B" — and minted venue "Caymus"), alexander valley silver oak, cade
cabernet, heitz cabernet, lewis cellars cabernet, mayacamas cabernet, nickel
& nickel cabernet, paul hobbs cabernet, plumpjack cabernet (all one H-E-B
wine-shopping thread, t1_k1qvj10 / t1_k1rp0xq / t1_k1rid08 / t1_k1t7q7v);
pork sausage ("Check out this great item I found at Central Market!" +
product URL); pizza sauce (cooking class + "found out how good their pizza
sauce and pesto are"); raspberry bars ("Whole Foods Raspberry Bars… they keep
for weeks"); rubicon chocolate cupcake ("from Sprouts" — a packaged brand);
ultra-filtered milk ("I stick to Fairlife" — brand minted as venue);
pressed juice (JD's Supermarket #8); pink salt wine ("I buy it whenever I
can" @ The Austin Winery).

**Verdict: PROMPT DEFECT.** Rederived shape: B.2's question should be
**"does this claim credit the venue's KITCHEN or its SHELF?"** — food this
place MADE and handed you to eat, versus a product (anyone's brand, theirs
included) you bought off a shelf. State plainly that "prepare later" is not
the test — a bottle, a carton, a packaged bar are shelf goods even though you
consume them unchanged — and that retail-purchase language ("behind glass",
"~$100", "I buy it", "found this item", a product URL, "keep for weeks") is
the tell. A second line closes the brand hole: a PRODUCER brand named as the
source of a shelf good (Caymus, Fairlife) is not a place at all.

---

## Root cause 2 — the ingredient slot has no observed-span discipline, so the model canonicalizes to its pantry lexicon (9 entities, 9 events)

**The walk.** C.5 says ingredients come from additive clauses or nouns inside
the dish name, "never from your own knowledge." But unlike place names — where
B.3 spends a page on "if the string you are about to emit does not appear in
the source, you have invented it," backed by a CODE-side contract refusal
(884 `span_not_in_cited_source` refusals banked this run, places only) — the
ingredient slot has no as-written law and no guard. So the model does what it
does everywhere it isn't forbidden: it emits the ingredient CONCEPT in its
canonical pantry form, not the observed span. Six of nine are exactly that
move: "fermented crab" → **salted crab** (same Thai condiment concept in the
model's knowledge); "the dirty earl" → **earl grey tea** (expanding a drink
nickname); "coq au vin" → **wine** (translation); "peach tea glazed" → **tea
leaf** (peels "tea", then writes the pantry-noun form because bare "tea" reads
as a drink, not an ingredient); "sesame bun" → **sesame seed bun**; "Enchiladas
rojas adobadas" → **rojas adobadas sauce** ("sauce" synthesized). The other
three are slot-routing errors with the same no-guard root: **house-made**
("housemaid English muffins" — typo repaired to a property, then the property
lands in the ingredient array because it modified a component); **chilaquiles**
("the chilaquiles bowl" — C.5's "nouns inside the dish name" arm read
literally, with no line saying the dish's own identity noun is not its
ingredient); **granola** ("Yogurt, fruit and granola from central market" — an
office-catering roster with no verdict AND grocery mode; the ingredient row is
collateral of a mention that should not exist, so it also counts under RC1/RC4
thinking).

**Verdict: PROMPT DEFECT + PIPELINE GAP, in that order.** Prompt: give C.5 the
one sentence it is missing — ingredient tokens are emitted **as this source
wrote them**; never expand, translate, complete, or substitute (mirror of
B.3, two lines, not a page). Pipeline: extend the observed-span contract
refusal to ingredient spans — the machinery exists
(`collection_extraction_contract_refusals`, currently place-only), and this
slot is the only emitted-text slot with zero enforcement. A wording fix alone
will shrink but not zero this: canonicalization is the model's default
behavior, so the guard is what makes it stay fixed.

---

## Root cause 3 — v17's "remembered verdict" rescue outguns death signals (4 entities, 4 events)

**The walk.** Step A now says "A REMEMBERED verdict is still a verdict," added
in v17 to rescue "I remember Uchi being one of the best." Every closed/dead
mint is that rule beating B.1/Gate 2 in-flight: **borscht** ("i moved away
from that area but really loved their borscht. RIP" — remembered love emits;
the trailing bare "RIP" has an ambiguous object, and B.1's own "RIP my wallet
mourns nothing" example teaches that RIP objects need interpreting, giving the
model a licensed non-closure reading: mourning the writer's access after
moving away); **salmon meatball** ("one of the most satisfying meals of my
life… The meal disappeared from the menu and then so did Snack Bar" — the
verdict clause is vivid, the double closure is two sentences later and phrased
poetically); **sloppy jac** ("they got rid of the Sloppy Jac, which was one of
my sandwiches in town" — Gate 2 lists "got rid of" verbatim, but the removal
verb and the remembered verdict share one clause, and the rescue won);
**green chile fry** (different shape: "removed the chili con carne fries,
leaving only the green chile ones 🤢" — the green chile fries EXIST; this is
NEGATIVE CONTENT emitted, the model crediting the surviving item from a
comment whose whole point is disgust — the report's own "removed ones" note is
slightly off here).

**Verdict: PROMPT DEFECT (rule competition), cheap fix.** The remembered-verdict
sentence needs its counterweight IN THE SAME BREATH: "…and it emits only while
the thing remembered still exists — a stated closure or removal (B.1, Gate 2)
beats any remembered love, in the same clause included." Also worth one clause
in B.1: a bare trailing "RIP" in a past-tense mourning of a place resolves to
the PLACE — the prompt already states the cost asymmetry (crediting a dead
place costs more than missing a live one); let it decide this tie.

---

## Root cause 4 — no final "point to the verdict words" gate on the item side (15 entities, 15 events)

Step D has a final gate (D.5: before emitting ANY attribute, re-run the tests
and point to the words that state it). Items have nothing equivalent — once a
source passes Step A somewhere, each food noun rides on the model's overall
sense that "this comment is warm." Every hedged/availability/price mint is a
verdict-binding failure that a per-item "which words judge THIS item's taste?"
re-check would catch:

- **Enthusiastic narration mistaken for verdict:** fanta ("I walk into a BK to
  get a frozen red Fanta… for $1.08" — habitual patronage narrated with color,
  zero judgment; the model extends A.1's "my go-to" license to described
  habits); modelo ("shitty drunk on $1 Modelos??"); frose ("$6 frose… comes
  with a complimentary tapa!" — deal announcement); jello shot ("And jello
  shots if that's exciting to you" — roster snark inside a real bar pick);
  cantonese hot pot ("You've got soupleaf Cantonese hot pot, Kura…" — plaza
  roster; "A great place to spend a day" praises the PLAZA); fireman's 4 beer
  ("($8 bad deal haha)" — a receipt line, price-only and negative); sweet
  spicy sauce (TITLE-ONLY CAPTION, A.2's rule verbatim, but the title's rich
  order detail reads like a report).
- **Place-verdict bleeding onto enumerated dishes:** chicken from the spit
  ("big fan of Peace Bakery… had their gyros and chicken from the spit…
  didn't have an issue, got plenty of meat" — the place verdict carried the
  dish; A.3 forbids the transfer but nothing forces the per-item re-check);
  beef bahn mi + shrimp bahn mi ("Pork or chicken or shrimp or beef. Not bad
  at all" — a deal-contents enumeration, plus A.2's listed hedge "not bad"
  flipped positive by "at all"); east buffet ("decent when I went… not a
  4 star experience but tasty" — three mild/hedge rules compete and the
  terminal "but tasty" won; ALSO the venue's own name minted as the dish);
  migas & fajitas ("used to be a fan… Not as big the last time" — the
  remembered-verdict rescue again, on a withdrawn endorsement); mexican
  mashed potatoes ("no flavor at all" — flat negative; pure execution slip,
  no rule ambiguity); fun junky stuff ("torchy's has some reliable fun junky
  stuff" — genuinely positive, but not an orderable thing; ORDER TEST slip);
  salsa bar ("really good salsa bar" — real verdict, wrong slot: a venue
  fixture emitted as an item).

**Verdict: SPLIT.** "Not bad at all" / "decent…but tasty" / "used to be a
fan" are genuine boundary band — the net-direction and but-laws legitimately
compete, and some would misfire under ANY wording (model-capability limit;
accept or pin as gold cases). The rest is a missing structural gate: add a
C-side mirror of D.5 — **before emitting a dish, point to the clause words
that judge THIS dish (or the pick/ask that licenses it); price, habit,
roster-slot, caption, and portion words are not those words.** That one gate
covers narration-without-verdict, place-verdict bleed, and enumeration leaks
in a single mechanism instead of three more list rules.

---

## Root cause 5 — attribute-only place mentions have no testimony gate, and D.5's "plainest form" loses to the prompt's own fidelity training (16 entities, 18 events)

Two sub-causes, one slot.

**5a — F.2 legitimizes "an attribute-only statement about the venue," and no
step re-asserts that Step A must have passed for it (8 entities).** The model
reads a purely factual clause about a venue and has an output shape that fits:
craft beer bar ×2 ("The only places I've ever seen beer top $10 is at
dedicated craft beer bars like Brass Tap and Yard House" — a price
observation, zero testimony); reservations open ("still have plenty of
reservations open on Resy" — transient booking fact); alcoholic drinks +
non-alcoholic drinks ("diverse selection of…" — selection talk in a post that
pans the food); hawaii plate lunch ("Its hawaii plate lunch and a staple" —
a hearsay-adjacent identity claim, food format on the place side); frozen
margaritas ("(frozen Margs!)" — an orderable drink with no clause of its own,
parked as a place property because the slot was there); mesquite-grilled kin.
Also the evaluative pair — top quality, worth the drive — is a cousin:
A.1 lists "worth the trip" as testimony, D.1 bans it as an attribute, and the
model resolved the collision by emitting the testimony PHRASE into the
attribute slot. **Verdict: PROMPT DEFECT.** Rederive: the attribute-only place
mention needs its own one-line gate in F.2/D.5 — an attribute rides only on a
mention that EARNED existence in Step A (testimony or pick); a clause that
merely describes, prices, or locates a venue mints nothing. Plus one line in
D.1: a phrase that IS testimony (A.1's indirect-recommendation shapes) is by
definition praise, never an attribute.

**5b — canonicalization asked for but not operationalized (5 entities).**
central texas german food (hedged besides — "wouldn't be the best thing you
eat"), coastal seafood, southern food vs southern cooking (the twin split),
traditional bbq ×2, hawaii plate lunch again. D.5 says "prefer the plainest
common form," but every OTHER slot spends paragraphs teaching emit-as-written
— the model's fidelity instinct, correctly trained by B.3/C.5, wins in the
attribute slot too. **Verdict: PROMPT DEFECT (tension), honest cost.** Either
name the canonical cuisine/style vocabulary move explicitly ("strip modifiers
to the head tradition: `german`, `seafood`, `southern`, `bbq` — the modifier
words are what you drop, this is the ONE slot where you do") or accept the
variance and canonicalize downstream where cuisines already get stamped.

**5c — composition vs preparation is undecided at the boundary (3 entities).**
masa beer batter ("Masa beer batter, amazing tortillas" — D.3 says
ingredient-bound phrase → composition; D.4 says preparation-as-property →
attribute, and lists "house-made"; "masa beer batter" is both at once);
seeded kaiser roll (availability clause + "I like em ok" hedge + a component
emitted as attribute); border style / burnt top style / super thin ×2 / very
thin (D.2 STANDALONE failures — but note super thin and very thin come from a
factual style Q&A thread with no testimony, so 5a's missing gate is the
deeper cause; "thin" is even D.2's own listed example, severed anyway when
the sentence used it predicatively rather than inside an order-name).
**Verdict: mostly MODEL-CAPABILITY at the D.2 boundary (the test is stated;
severed predicative uses still leak), with the 5a gate removing the
no-testimony half of them for free.**

---

## Root cause 6 — C.2's "keep the head noun" points the wrong way when the head is a wrapper word, plus two missing dish-side mirrors of place-side rules (7 entities, 7 events)

- **pairing** ("get the sake pairing"): Gate 1 should read "sake pairing" as
  ONE offering (food word present). C.2's build steps then say anchor the head
  and, in the sanity check, "peel one modifier, keeping the head noun" — the
  head is "pairing," a terms word, so the peel PRODUCED the junk. C.3 patches
  this for categories ("lunch special dies because its head is special") but
  C.2 emits the item before C.3 runs. **Prompt defect:** one line in C.2 —
  when peeling would leave a terms-word head, the phrase either stays whole or
  dies; a terms head is never emitted bare.
- **special summer cocktail**: Gate 1's ONE arm explicitly keeps
  "seafood lunch special" — "special summer cocktail" is the same shape
  (food word + terms words), so the model followed the prompt. The report
  calls it junk (menu-section wrapper, "one of their…" = several). **Rule
  collision inside Gate 1**: "one of their X-s" plurals signal a FAMILY of
  rotating offerings, not one offering; the none/one/several selector has no
  plural-of-a-section tell. Honest verdict: boundary; cheap tell to add.
- **treat** ("has some cakes, cupcakes, and a couple other treats"): an
  answer-test pick whose annotation is availability-shaped ("has some") — the
  pick license overpowered A.1's condition 2, and "treat" is a wanting-word
  besides. Capability slip on a stated rule.
- **north indian food** ("AusIndia has authentic North Indian food"): the
  pick's food language should fail Gate 2 (tradition) and land as a place
  attribute; it was routed to the item slot. Stated rule, mis-routed —
  capability slip (1 instance; watch, don't rewrite).
- **chasu** ("plentiful slices of chashu" inside a tsukemen report): C.4
  one-dish-per-connection; "an extra side of noods" made a second-order
  reading plausible. Boundary.
- **chickme chicken** ("or something (can't remember name)"): B.1 has the
  disclaimed-name skip — FOR PLACES ONLY. **Prompt defect (missing mirror):**
  the writer disclaiming a dish name is the same too-uncertain-to-carry case;
  one line in C.2.
- **suerte taco** ("Don't miss the Suerte tacos"): C.1 says the venue name is
  never food language, but that rule contemplates praising a venue NAME, not
  the venue's name used attributively inside a real dish phrase the source
  wrote. Fidelity training says emit as written; C.1 says never. Collision;
  the fix is one clause: strip the venue's own name from an order-name unless
  the menu-proper-name arm applies.

---

## Root cause 7 — PIPELINE: per-run rehearsal sandboxing double-mints when the same doc completes two shadow runs (2 entity pairs, 2 excess entities/events; plus 2 prompt-side twins)

The two duplicate-id pairs are fully traced and are **not prompt defects**:

- `fast food burger` 7f9f9253 (born run f06d0005, 07:34) vs fe16d388 (born
  run 1dd717ba, 08:35) — identical name, identical `identity_key`
  ("fast food burger"), same source comment t1_k3wf1t9, both status
  `rehearsal`.
- `garlic pepper mayo` 5f2ceb32 (run 515f89b6, 07:16) vs bc8ab97a (run
  598650ba, 07:23) — same story, source t1_jt483fp.

Mechanism: the shadow replay ran as ~118 separate completed extraction runs
under one prompt hash, and the resolver's exact tier deliberately hides
rehearsal rows from every run but their own —
`apps/api/src/modules/content-processing/entity-resolver/entity-resolution.service.ts:793-806`
("rehearsal rows are visible ONLY to their own run… a rehearsal must see its
own so its chunks cohere": the lookup filter is
`status != 'rehearsal' OR born_extraction_run_id = rehearsalRunId`). That
sandboxing is correct per shadow-sandbox design — the defect is that the SAME
source document was extracted to completion in TWO shadow runs (a retry or
overlapping batch), and nothing afterward collapses same-`identity_key`
rehearsal rows born from different runs of the same replay. Fix options, owner
choice: (a) make the replay/diff treat one doc + one prompt hash as one
extraction (dedupe before or at diff time on `identity_key`), or (b) fold
same-identity rehearsal twins at activation. The diff script counting them as
two "new entities" is the visible symptom.

The other two twins are prompt-side and already covered: **falloda** vs
`pesto badshahi falloda` (both minted from ONE sentence at Kwality — C.4
breach: the model emitted the full form and its clipped head as separate
dishes; the C-side final gate of RC4 plus C.4's existing law cover it) and
**southern food** vs `southern cooking` (RC5b canonicalization).

---

## Instance table (all 72)

| # | entity | type | venue | decisive text (verbatim, trimmed) | root cause | verdict |
|---|--------|------|-------|-----------------------------------|-----------|---------|
| 1 | 2018 caymus | item | Caymus (!) | "I saw it recently behind glass at my local H-E-B" | RC1 | prompt |
| 2 | alexander valley silver oak | item | H-E-B | "SO Alexander Valley is a surprisingly well made wine" (wine-shopping thread) | RC1 | prompt |
| 3 | cade cabernet | item | H-E-B | "Also, Plumpjack and Cade" (Napa cabs from heb) | RC1 | prompt |
| 4 | heitz cabernet | item | H-E-B | "Some nice Napa cabs I've had from heb… Heitz ~$80" | RC1 | prompt |
| 5 | lewis cellars cabernet | item | H-E-B | "drink the shit out of Lewis (Cellars.)" | RC1 | prompt |
| 6 | mayacamas cabernet | item | H-E-B | "Mayacamas ~$130" | RC1 | prompt |
| 7 | nickel & nickel cabernet | item | H-E-B | "Nickel & nickel ~ $120" | RC1 | prompt |
| 8 | paul hobbs cabernet | item | H-E-B | "Paul Hobbs ~$100" | RC1 | prompt |
| 9 | plumpjack cabernet | item | H-E-B | "Also, Plumpjack and Cade" | RC1 | prompt |
| 10 | pork sausage | item | Central Market | "Check out this great item I found at Central Market!" + product URL | RC1 | prompt |
| 11 | pizza sauce | item | Central Market | "found out how good their pizza sauce and pesto are" (cooking class) | RC1 | prompt |
| 12 | raspberry bars | item | Whole Foods | "sooo fkn good, and they keep for weeks" (grocery haul) | RC1 | prompt |
| 13 | rubicon chocolate cupcake | item | Sprouts | "The Rubicon chocolate cupcakes from Sprouts" (packaged brand) | RC1 | prompt |
| 14 | ultra-filtered milk | item | Fairlife (!) | "I stick to Fairlife, ultra-filtered milk only" | RC1 | prompt |
| 15 | pressed juice | item | JD's Supermarket #8 | "I've only tried their pressed juices, which are good" | RC1 | prompt |
| 16 | pink salt wine | item | The Austin Winery | "I buy it whenever I can now" | RC1 | prompt |
| 17 | salted crab | ingredient | DEE DEE | source says "the **fermented** crab one" | RC2 | prompt+pipeline |
| 18 | tea leaf | ingredient | Interstellar BBQ | source says "peach tea glazed pork belly" | RC2 | prompt+pipeline |
| 19 | earl grey tea | ingredient | Dog Day Coffee | source says "the dirty earl" | RC2 | prompt+pipeline |
| 20 | wine | ingredient | Blue Dahlia | source says "coq au vin" | RC2 | prompt+pipeline |
| 21 | rojas adobadas sauce | ingredient | Manuel's | source says "Enchiladas rojas adobadas" | RC2 | prompt+pipeline |
| 22 | sesame seed bun | ingredient | Cuantas Hamburguesas | source says "loved the sesame bun" | RC2 | prompt+pipeline |
| 23 | house-made | ingredient | June's | "really incredible housemaid English muffins" (property→ingredient) | RC2 | prompt+pipeline |
| 24 | chilaquiles | ingredient | La Santa Barbacha | "the chilaquiles bowl goes CRAZY" (dish as its own ingredient) | RC2 | prompt+pipeline |
| 25 | granola | ingredient | Central Market | "Yogurt, fruit and granola from central market" (catering roster, no verdict) | RC2/RC1 | prompt |
| 26 | borscht | item | Uzeats | "i moved away… really loved their borscht. RIP" | RC3 | prompt |
| 27 | salmon meatball | item | Snack Bar | "The meal disappeared from the menu and then so did Snack Bar" | RC3 | prompt |
| 28 | sloppy jac | item | Jack Allen's Oak Hill | "they got rid of the Sloppy Jac" | RC3 | prompt |
| 29 | green chile fry | item | Hopdoddy | "leaving only the green chile ones 🤢" (negative content) | RC3 | capability |
| 30 | fanta | item | Burger King | "frozen red Fanta… for $1.08… before a night of drinking" | RC4 | prompt (gate) |
| 31 | modelo | item | Lavaca Street Bar | "Guess who's shitty drunk on $1 Modelos??" | RC4 | prompt (gate) |
| 32 | frose | item | Luminaire | "limited menu with $6 frose" | RC4 | prompt (gate) |
| 33 | jello shot | item | The Silver Medal | "And jello shots if that's exciting to you" | RC4 | prompt (gate) |
| 34 | cantonese hot pot | item | Soupleaf Hot Pot | "You've got soupleaf Cantonese hot pot, Kura…" (plaza roster) | RC4 | prompt (gate) |
| 35 | fireman's 4 beer | item | Truluck's | "Fireman's 4 beer ($8 bad deal haha)" (receipt) | RC4 | prompt (gate) |
| 36 | sweet spicy sauce | item | Hi Wings | title-only caption: "9-pc dark meat order with sweet spicy sauce on the side" | RC4 | capability |
| 37 | chicken from the spit | item | Peace Bakery | "didn't have an issue, got plenty of meat" (place verdict bled) | RC4 | prompt (gate) |
| 38 | beef bahn mi | item | Moi Vietnamese | "Pork or chicken or shrimp or beef. Not bad at all" | RC4 | boundary |
| 39 | shrimp bahn mi | item | Moi Vietnamese | same sentence | RC4 | boundary |
| 40 | east buffet | item | East Buffet | "decent… not a 4 star experience but tasty" + venue name as dish | RC4/RC6 | boundary |
| 41 | migas & fajitas | item | Trudys | "used to be a fan… Not as big the last time" | RC4/RC3 | prompt |
| 42 | mexican mashed potatoes | item | Tacodeli | "no flavor at all" | RC4 | capability |
| 43 | fun junky stuff | item | Torchy's | "has some reliable fun junky stuff" (not orderable) | RC4 | capability |
| 44 | salsa bar | item | Tacos Matamoros | "really good salsa bar" (fixture as item) | RC4 | capability |
| 45 | pairing | item | Toshokan | "get the sake pairing" (peel left terms head) | RC6 | prompt |
| 46 | special summer cocktail | item | El Chile | "one of their special summer cocktails" | RC6 | boundary |
| 47 | treat | item | Quack's 43rd | "has some cakes, cupcakes, and a couple other treats" | RC6 | capability |
| 48 | north indian food | item | AustIndia | "AusIndia has authentic North Indian food" (cuisine as item) | RC6 | capability |
| 49 | chasu | item | Ramen Tatsu-ya | "plentiful slices of chashu" (component of tsukemen) | RC6 | boundary |
| 50 | chickme chicken | item | MezzeMe | "the chickme chicken or something (can't remember name)" | RC6 | prompt |
| 51 | suerte taco | item | Suerte | "Don't miss the Suerte tacos" (venue name in dish) | RC6 | prompt |
| 52 | top quality | item_attr | Teddy Simon | "all the sushi is top quality" (praise as attribute) | RC5a | prompt |
| 53 | super thin (×2) | item_attr | Jet's; Via 313 | "square cut and super thin" / "Super thin, cracker consistency" (style Q&A, no testimony) | RC5a/5c | prompt |
| 54 | very thin | item_attr | East Side Pies | "very thin crust, but not tavern style" | RC5a/5c | prompt |
| 55 | border style | item_attr | Jewboy | "Get it border style" (severed fragment) | RC5c | capability |
| 56 | burnt top style | item_attr | Kalimotxo | "if you like basque/burnt top style" | RC5c | capability |
| 57 | masa beer batter | item_attr | Este | "Masa beer batter, amazing tortillas" (composition vs preparation) | RC5c | prompt (tension) |
| 58 | seeded kaiser roll | item_attr | Little Deli | "lets you get sandwiches on a seeded Kaiser… I like em ok" | RC5c/5a | prompt |
| 59 | worth the drive | place_attr | Mudbugs | "it's worth the drive" (testimony phrase into attribute slot) | RC5a | prompt |
| 60 | alcoholic drinks | place_attr | Cosmic Saltillo | "diverse selection of alcoholic and non-alcoholic drinks" (post pans food) | RC5a | prompt |
| 61 | non-alcoholic drinks | place_attr | Cosmic Saltillo | same sentence | RC5a | prompt |
| 62 | craft beer bar (×2) | place_attr | Brass Tap; Yard House | "beer top $10… at dedicated craft beer bars like…" (price observation) | RC5a | prompt |
| 63 | reservations open | place_attr | Tiny Boxwoods | "still have plenty of reservations open on Resy" | RC5a | prompt |
| 64 | hawaii plate lunch | place_attr | L&L Hawaiian | "Its hawaii plate lunch and a staple" | RC5a/5b | prompt |
| 65 | frozen margaritas | place_attr | Enchiladas Y Mas | "(frozen Margs!)" (food parked as place property) | RC5a | prompt |
| 66 | central texas german food | place_attr | Scholz Garten | "might be worth a trip… wouldn't be the best thing you eat" | RC5b | prompt |
| 67 | coastal seafood | place_attr | Mongers | "your best bet for coastal seafood" (plainest form: seafood) | RC5b | prompt |
| 68 | traditional bbq (×2) | place_attr | Opie's | "my favorite traditional BBQ" / "old-time central Texas BBQ joints" | RC5b | prompt |
| 69 | falloda | item (twin) | Kwality | same sentence as `pesto badshahi falloda` — C.4 breach | RC6/RC4 | prompt |
| 70 | fast food burger (dup id) | item (twin) | P. Terry's | identical (name, source) as 7f9f9253 | RC7 | pipeline |
| 71 | garlic pepper mayo (dup id) | item (twin) | Lebowski's | identical (name, source) as 5f2ceb32 | RC7 | pipeline |
| 72 | southern food | place_attr (twin) | Moonshine Grill | "very good southern food" vs Olamaie's "southern cooking" | RC5b | prompt |

---

## What to change, in priority order

1. **B.2 rewrite (RC1, 16 junk + 2 junk venues):** kitchen-vs-shelf test;
   "prepare later" is not the bar; retail-purchase tells; producer brands are
   not places. Single biggest lever.
2. **C.5 as-written law + ingredient contract refusal (RC2, 9):** two prompt
   lines + extend the existing place-span refusal machinery to ingredients.
3. **C-side final gate (RC4, ~15):** "point to the words that judge THIS dish"
   before emitting any item — the item-side mirror of D.5's final gate.
4. **Attribute-only mention testimony gate + testimony-phrase exclusion
   (RC5a, ~10):** one line each in F.2 and D.1.
5. **Remembered-verdict counterweight (RC3, 4):** "…only while the thing
   remembered still exists"; RIP tie-break toward closed.
6. **Small mirrors (RC6):** terms-head never emitted bare (C.2); disclaimed
   dish name skip; venue-name stripped from order-names. Plainest-form
   cuisine/style either operationalized or moved downstream (RC5b).
7. **Pipeline (RC7):** collapse same-`identity_key` rehearsal twins born from
   different runs of one replay (diff-time or activation-time), or guarantee
   one completed shadow extraction per doc per prompt hash.
   `entity-resolution.service.ts:793-806` is the sandbox filter that makes
   the double-mint possible; the double-extraction is the actual bug.

Boundary band to pin as gold cases rather than rewrite: "not bad at all",
"decent… but tasty", "one of their special summer cocktails", "extra side"
components. Rewriting rules to catch these risks unwinding v17's certified
gains (the clause law and mild-word position rule are doing real work in the
69 REAL-GAINs).
