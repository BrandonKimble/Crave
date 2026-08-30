# Merge-batch audit — entity_dedupe sweep of 2026-08-30 (21:30–21:43 UTC)

Audited: every merge verdict the sweep recorded in the window (162 judge-lane
verdicts in `claim_verdicts`, lane `entity_dedupe`; 159 executed + 3 unexecuted.
The remaining ~6 "auto" merges of the reported 165 ran through the deterministic
lanes (`mergeItemPair` direct) and leave NO ledger row — they are not auditable
from the verdict ledger; that is itself a finding, noted below).

## Verdict counts

- **CORRECT: 80** (mostly ingredient-lane true synonyms/spelling/plural variants)
- **WRONG: 48** (39 items, 9 ingredients; 47 of the 48 were EXECUTED)
- **DEFENSIBLE: 34** (plausibly-same-thing folds, or single-venue folds that are
  materially right but doctrinally belong to extraction pro-forms, not entity merge)

The wrong class is overwhelmingly the coordinator's flagged shape: 32 of the 48
wrong merges carry a "same restaurant" reason, and the reason strings literally
name classes the doctrine BANS — "category fold", "specification fold",
"format fold". The judge did not merely misjudge edge cases; it announced, in its
own reasons, that it was performing the folds the entity-match prompt forbids
("A subtype never folds into its category — in either direction"; "A genuine
variant never folds, even at one restaurant").

Worst example: **`carnitas` (a corpus-global entity, 15 restaurants) folded into
`carnitas tacos`** — every venue credited for carnitas anywhere in the corpus now
lists "carnitas tacos" on its menu surface, including venues that serve carnitas
plates, tortas, or by the pound. Same shape at scale: `sub` (16 restaurants) →
`italian deli sandwiches`, `ceviche de pescado` → global `ceviche` (22
restaurants), `beef fajitas` → `fajitas` (35), `bbq pork` → base ingredient
`pork` (68 dish references).

## Root cause

Read from `food-dedupe-merge.service.ts` (judge lane, ~L1080–1170) plus the
prompt actually sent (`prompts/entity-match-prompt.md` via
`renderEntityMatchSystemInstruction` / `matchEntitiesBatch`):

1. **The D2 same-place flag is computed wrong for the sweep.** `sharesHome()`
   returns true when the two entities share ANY home restaurant
   (`a.place_ids ∩ b.place_ids ≠ ∅`). For a corpus-GLOBAL generic (`ceviche`,
   22 homes; `fajitas`, 35; `baklava`, 8) any specific dish at any one of those
   venues gets `same_place: true`. The prompt's home-restaurant (OTOKO) rule was
   written for a term mentioned AT one restaurant vs a candidate living AT that
   restaurant; the sweep hands it a pair of corpus-wide aggregates and labels
   them "same place". The pre-wave sweep held these pairs because it sent bare
   names — no flag, so "without home evidence, doubt says new" fired. The D2
   context change (sameness-court report) is what flipped the judge from hold to
   merge on exactly this class. The prompt names decoration/narration/channel as
   the ONLY same-place fold classes, but a model shown `same_place: true` on
   thousands-of-diners generics treats it as a license: it invented
   "category fold, same restaurant" / "specification fold, same restaurant" —
   classes the same prompt bans unconditionally.
2. **The doctrine itself is the deeper bug (foundation finding).** The
   sameness-court modifier-fold clauses (venue-decoration / narration / channel
   fold "at the same restaurant") are written as ENTITY-merge rules, but the
   fragmentation study (named-offering-fragmentation-study.md §4) already ruled
   that dish entities are corpus-global and that same-restaurant unification is
   the WRONG job for entity dedupe — it belongs to extraction pro-forms
   (study rec #1) or, at most, a per-restaurant CONNECTION fold (rec #4). The
   two documents contradict each other, and the sweep implemented the
   sameness-court side. A same-restaurant fold is only ever safe at the entity
   level when BOTH entities live at exactly that one restaurant — a precondition
   neither the prompt nor the code states or checks. The embedding recall lane
   (new this wave) then surfaced hundreds of generic-vs-specific pairs the old
   0.65-trigram floor structurally never showed the judge (the study noted that
   floor was "partly protective") — new candidate shapes + the new license =
   this batch.
3. **The auto lanes are un-ledgered.** The ~6 deterministic merges bypassed
   `settleDedupeVerdict`, so they carry no plan/subject row and cannot be
   audited or reversed from the ledger at all.

## Reversibility — NOT byte-exact; treat the wrong merges as data loss to repair, not to "undo"

The stored plan is only `{winnerId, winnerName, loserId, loserName, entityType}`.
The inverse of `executeItemMergePlan` would be, per merge:

1. Un-archive the loser (`core_entities.status = 'active'`, restore name).
2. Delete the `entity_redirects` row loser→winner (and un-flatten any chain
   rewrites A→winner that previously pointed A→loser).
3. Re-point the loser's former connections back (`connection.itemId = loserId`).
4. Re-split colliding connections: recreate the DELETED loser connection row at
   restaurants where both existed, restore its counters, re-point its mentions,
   RESURRECT the mentions deleted by collision-dedupe, and decrement the
   survivor's summed counters.
5. Un-union the alias bank on the winner (remove the loser's banked names).
6. For ingredients: rewrite `ingredients` / `canonical_ingredients` arrays
   winner→loser in exactly the rows that used to carry the loser.
7. Re-key the entity-dimension event ledger rows back to the loser.
8. Re-point user anchors (poll targets, curated items, photos) that were
   re-homed.

**The plan data does NOT suffice for steps 3–8.** Nothing records which
connections/mentions/events/anchors belonged to the loser: repointed rows carry
no origin marker, colliding connection rows and duplicate mention rows were
DELETED, counters were summed in place, arrays were rewritten with
`array_agg(DISTINCT …)` (a row that carried both winner and loser is
indistinguishable from one that carried only the winner), and alias banking
unions sets. Information loss is real on every executed merge whose pair
collided at any restaurant or shared aliases. Honest recovery paths, best first:

- **Restore from a pre-sweep staging snapshot/backup** of the affected tables
  (cleanest, if one exists — the sweep window is tight: 21:30–21:43 UTC).
- **Re-derivation**: un-archive losers + drop redirects (steps 1–2 ARE fully
  plan-recoverable), then let re-extraction / the event-ledger rebuild re-grow
  loser connections from source docs. This heals eventually but leaves the
  interim graph mixed.
- Per-merge surgical repair is possible only where the pair never collided
  (loser connections merely repointed) — but identifying "which rows were the
  loser's" still requires the source-doc evidence, not the plan.

## Recommended actions

1. **Freeze the judge lanes now** (the `judgeLanesEnabled` activation gate) and
   the embedding recall lane until re-certified.
2. **Un-merge list = the 47 executed WRONG merges** (table below; `dumpling
   soup → soup dumplings` is wrong but was never executed — record a `hold` over
   it so the next scan doesn't buy it). Prefer snapshot restore; else steps 1–2
   ledger reversal + rebuild. Also re-audit the 34 DEFENSIBLE rows after the
   doctrine fix — many are extraction-pro-form territory.
3. **Doctrine fix (from scratch, per the fragmentation study's law):** entity
   merge = IDENTITY only. Same-restaurant variant folding moves OUT of the
   entity-match prompt entirely: delete the venue-decoration / narration /
   channel same-place fold clauses from the sweep's use of the prompt (or gate
   them on "both entities have exactly one home and it is the same one"), and
   route that unification to extraction pro-forms (study rec #1) / a future
   connection-level fold (rec #4). `same_place` for sweep hearings must mean
   "both entities are single-homed at the same venue", never "footprints
   overlap".
4. **Mechanical guard independent of the prompt:** the sweep refuses any
   judge-approved merge whose reason matches the banned classes
   (category/specification/format fold) — the judge's own reason string was a
   perfect tripwire this run and nothing read it. Also: ledger the auto lanes
   (every merge gets a verdict row), and extend the plan to snapshot the
   loser's connection/mention/alias/array state so a merge is actually
   reversible.
5. **Re-cert before re-arming:** re-run the entity-match gold gate with new
   pinned cases from this batch (carnitas/carnitas tacos, ceviche de
   pescado/ceviche, caesar wrap/chicken wrap, bell pepper/peppers, bbq
   pork/pork, dark rum/rum → all must HOLD; muffuletta, karaage, salsa verde,
   white/light rum → must MERGE), plus the study's `omakase` vs `sushi omakase`
   NEW case, then a dry-run sweep (`Would judge…` log mode) diffed against this
   audit's verdict column before any live re-arm.

## The 48 WRONG merges — blast radius (winner's CURRENT footprint = surface now showing the merged identity)

| merge (loser → winner) | type | footprint now carrying the fold | executed | why wrong |
|---|---|---|---|---|
| dumpling soup → **soup dumplings** | item | 8 connections / 8 restaurants | NO (unexecuted) | dumpling soup (soup containing dumplings) is not xiao long bao; two different dishes fused |
| duck carnitas taco → **duck carnitas** | item | 1 connections / 1 restaurants | yes | 'taco' is a format word, not venue decoration; reason mislabeled |
| fajita taco → **beef fajita taco** | item | 5 connections / 5 restaurants | yes | protein spec folded; generic fajita taco is multi-venue |
| dum biryani → **chicken dum biryani** | item | 2 connections / 2 restaurants | yes | generic dum biryani (could be goat/veg) fused into chicken |
| rendang → **beef rendang** | item | 2 connections / 2 restaurants | yes | rendang is a category (chicken/beef/jackfruit); subtype fold |
| chili cheeseburger → **chili burger** | item | 3 connections / 3 restaurants | yes | cheese is a spec a diner orders on purpose |
| wagyu ribeye → **dry aged ribeye** | item | 2 connections / 2 restaurants | yes | wagyu vs dry-aged are different specs; not the same steak |
| chicken adobo → **adobo** | item | 1 connections / 1 restaurants | yes | adobo is the category/global entity; protein subtype fused |
| ribs → **pork rib** | item | 20 connections / 20 restaurants | yes | generic multi-venue 'ribs' fused into pork rib |
| lamb and cheese sausage → **lamb sausage** | item | 2 connections / 2 restaurants | yes | ingredient spec folded |
| chicken wrap → **caesar wrap** | item | 4 connections / 4 restaurants | yes | two different orderable wraps; coordinator flag confirmed |
| savory pastry → **savory pie** | item | 1 connections / 1 restaurants | yes | pie vs pastry are different categories, not one thing |
| crispy rice noodles → **crispy noodle** | item | 2 connections / 2 restaurants | yes | rice-noodle spec dropped; global fold with no venue evidence |
| pistachio baklava → **baklava** | item | 8 connections / 8 restaurants | yes | subtype into multi-venue category; worst-shape fold |
| ceviche de pescado → **ceviche** | item | 22 connections / 22 restaurants | yes | fish-ceviche subtype fused into global generic ceviche |
| mole enchilada → **chicken mole enchiladas** | item | 11 connections / 11 restaurants | yes | protein spec + generic fused |
| jalapeno popper sausage → **jalapeno sausage** | item | 3 connections / 3 restaurants | yes | 'popper' is a distinct composition (cream cheese) |
| beef fajitas → **fajitas** | item | 35 connections / 35 restaurants | yes | global generic fajitas fused into beef |
| asian noodle salad → **asian salad** | item | 1 connections / 1 restaurants | yes | noodle salad vs salad are two menu items |
| chocolate macaron → **macaron** | item | 5 connections / 5 restaurants | yes | flavor subtype into global category |
| pimento cheese sandwiches → **pimento cheese** | item | 6 connections / 6 restaurants | yes | spread vs sandwich: component/format, not one thing |
| mushroom veggie burger → **veggie burger** | item | 33 connections / 33 restaurants | yes | spec into multi-venue generic |
| fried pork belly → **pork belly** | item | 8 connections / 8 restaurants | yes | preparation spec; also pork belly is near-global |
| sliced brisket sandwich → **chopped brisket sandwich** | item | 2 connections / 2 restaurants | yes | chopped vs sliced is a choice the diner makes |
| brisket banh mi french dip → **banh mi french dip** | item | 1 connections / 1 restaurants | yes | protein spec fold |
| loaded pupusas → **pupusas** | item | 2 connections / 2 restaurants | yes | subtype into global category |
| spicy chicken biscuit → **chicken biscuit** | item | 2 connections / 2 restaurants | yes | 'spicy' is a spec (doctrine's own dietary/variant class) |
| prime rib french dip → **french dip** | item | 9 connections / 9 restaurants | yes | french dip is multi-venue generic; spec fused globally |
| carnitas → **carnitas tacos** | item | 15 connections / 15 restaurants | yes | format fold; carnitas (the meat/dish) is global; coordinator flag confirmed |
| honey mustard potato salad → **potato salad** | item | 11 connections / 11 restaurants | yes | variant into global generic |
| brisket gouda hot pockets → **gouda hot pockets** | item | 1 connections / 1 restaurants | yes | protein spec fold |
| sea salt chocolate tart → **chocolate tart** | item | 1 connections / 1 restaurants | yes | spec fold |
| veggie omelet → **omelet** | item | 2 connections / 2 restaurants | yes | subtype into global generic omelet |
| watermelon agua fresca → **agua fresca** | item | 20 connections / 20 restaurants | yes | flavor spec into global generic |
| pork belly bun → **pork bun** | item | 2 connections / 2 restaurants | yes | belly is a spec; different bun |
| cheeseburger happy meal → **happy meal** | item | 1 connections / 1 restaurants | yes | spec fold; happy meal is a family of options |
| sub → **italian deli sandwiches** | item | 16 connections / 16 restaurants | yes | bare category 'sub' fused into a specific deli line |
| pho broth → **broth** | item | 8 connections / 8 restaurants | yes | generic broth fused with pho broth globally |
| garden salad → **salad** | item | 24 connections / 24 restaurants | yes | global generic 'salad' fused into garden salad |
| peppers → **bell pepper** | ingredient | 11 dish ingredient-array references | yes | global generic 'peppers' (jalapeno? serrano?) fused into bell pepper; coordinator flag confirmed |
| key lime juice → **key lime** | ingredient | 10 dish ingredient-array references | yes | juice vs fruit: component vs whole |
| dill pickle → **pickles** | ingredient | 14 dish ingredient-array references | yes | subtype fused into generic pickles |
| queso blanco → **queso fresco** | ingredient | 3 dish ingredient-array references | yes | two different cheeses; recipes distinguish them |
| hard shell tortilla → **hard taco** | ingredient | 1 dish ingredient-array references | yes | a taco is not a tortilla: component vs dish |
| chili → **chili pepper** | ingredient | 21 dish ingredient-array references | yes | bare 'chili' also names the stew and the powder; generic fused into pepper |
| dark rum → **rum** | ingredient | 2 dish ingredient-array references | yes | subtype into category (the scotch/whisky example verbatim) |
| grapefruit → **grapefruit juice** | ingredient | 2 dish ingredient-array references | yes | juice vs fruit: component vs whole |
| bbq pork → **pork** | ingredient | 68 dish ingredient-array references | yes | preparation fused into the global base ingredient 'pork' |
Footprint = post-merge winner reach (loser pre-merge counts are unrecoverable
from the DB — see reversibility). Items: connections/restaurants whose menu
surface now shows the winner name for the loser's evidence. Ingredients: dish
rows whose ingredient arrays now resolve to the winner.

## Full verdict table (all 162 ledgered merges)

| term (a) | candidate (b) | survivor | type | lane | judge reason | verdict | note |
|---|---|---|---|---|---|---|---|
| dumpling soup | soup dumplings | soup dumplings | item | token-multiset | established shorthand name variant | **WRONG** | dumpling soup (soup containing dumplings) is not xiao long bao; two different dishes fused |
| barbecue sauce | bbq sauce | bbq sauce | item | embedding | culinary synonym | **CORRECT** | name-variant/synonym per doctrine |
| french dip sandwich | french dip | french dip sandwich | item | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| duck carnitas | duck carnitas taco | duck carnitas | item | embedding | venue-name decoration, same restaurant | **WRONG** | 'taco' is a format word, not venue decoration; reason mislabeled |
| chicken tinga enchiladas | tinga de pollo enchiladas | chicken tinga enchiladas | item | embedding | cross-language synonym | **CORRECT** | true cross-language same dish |
| japanese fried chicken | chicken karaage | chicken karaage | item | embedding | culinary synonym | **CORRECT** | established synonym |
| hotpot | hot pot | hot pot | item | embedding | spacing variant | **CORRECT** | name-variant/synonym per doctrine |
| muffaletta sandwich | muffuletta | muffaletta sandwich | item | embedding | spelling variant | **CORRECT** | spelling + format word |
| fajita taco | beef fajita taco | beef fajita taco | item | embedding | specification fold, same restaurant | **WRONG** | protein spec folded; generic fajita taco is multi-venue |
| chicken dum biryani | dum biryani | chicken dum biryani | item | embedding | specification fold, same restaurant | **WRONG** | generic dum biryani (could be goat/veg) fused into chicken |
| tots | tator tots | tots | item | embedding | spelling variant | **CORRECT** | name-variant/synonym per doctrine |
| rendang | beef rendang | beef rendang | item | embedding | specification fold, same restaurant | **WRONG** | rendang is a category (chicken/beef/jackfruit); subtype fold |
| chili burger | chili cheeseburger | chili burger | item | embedding | shorthand variant, same restaurant | **WRONG** | cheese is a spec a diner orders on purpose |
| vanilla milkshake | vanilla shake | vanilla shake | item | embedding | shorthand variant | **CORRECT** | true shorthand |
| stupid hot chicken sandwich | stupid hot chicken | stupid hot chicken | item | embedding | shorthand variant, same restaurant | **CORRECT** | fragmentation study proved this exact Tumble 22 fragment |
| chicharron | pork rinds | chicharron | item | embedding | culinary synonym | **CORRECT** | culinary synonym |
| vegetarian sides | veggie side | veggie side | item | embedding | plural variant | **CORRECT** | same thing, plural/shorthand |
| wagyu ribeye | dry aged ribeye | dry aged ribeye | item | embedding | specification fold, same restaurant | **WRONG** | wagyu vs dry-aged are different specs; not the same steak |
| chicken adobo | adobo | adobo | item | embedding | specification fold, same restaurant | **WRONG** | adobo is the category/global entity; protein subtype fused |
| pork rib | ribs | pork rib | item | embedding | category fold, same restaurant | **WRONG** | generic multi-venue 'ribs' fused into pork rib |
| lamb sausage | lamb and cheese sausage | lamb sausage | item | embedding | specification fold, same restaurant | **WRONG** | ingredient spec folded |
| caesar wrap | chicken wrap | caesar wrap | item | embedding | category fold, same restaurant | **WRONG** | two different orderable wraps; coordinator flag confirmed |
| cheesesteak | philly sandwich | cheesesteak | item | embedding | culinary synonym | **CORRECT** | established synonym |
| jalapeno cornbread casserole | jalapeno cornbread | jalapeno cornbread | item | embedding | narration decoration, same restaurant | **DEFENSIBLE** | plausibly one dish retold; casserole is arguably format not narration |
| savory pie | savory pastry | savory pie | item | embedding | category fold, same restaurant | **WRONG** | pie vs pastry are different categories, not one thing |
| crispy rice noodles | crispy noodle | crispy noodle | item | embedding | specification fold | **WRONG** | rice-noodle spec dropped; global fold with no venue evidence |
| pan sausage and cabbage | pan sausage and kraut | pan sausage and kraut | item | embedding | culinary synonym, same restaurant | **DEFENSIBLE** | kraut vs cabbage differ, but plausibly one venue dish retold |
| coffee flight | espresso flight | coffee flight | item | embedding | culinary synonym, same restaurant | **DEFENSIBLE** | likely one venue offering, but coffee!=espresso |
| whole duck | roast duck | roast duck | item | embedding | culinary synonym, same restaurant | **DEFENSIBLE** | plausibly same venue offering; but names encode different things |
| texas chili cheese takoyaki | chili cheese takoyaki | chili cheese takoyaki | item | embedding | venue-name decoration, same restaurant | **DEFENSIBLE** | venue-token decoration plausible if venue name carries 'Texas' |
| pistachio baklava | baklava | baklava | item | embedding | category fold, same restaurant | **WRONG** | subtype into multi-venue category; worst-shape fold |
| caldo de pollo | chicken caldo | caldo de pollo | item | embedding | cross-language synonym | **CORRECT** | cross-language same dish |
| ceviche de pescado | ceviche | ceviche | item | embedding | category fold, same restaurant | **WRONG** | fish-ceviche subtype fused into global generic ceviche |
| chicken mole enchiladas | mole enchilada | chicken mole enchiladas | item | embedding | specification fold, same restaurant | **WRONG** | protein spec + generic fused |
| jalapeno sausage | jalapeno popper sausage | jalapeno sausage | item | embedding | specification fold, same restaurant | **WRONG** | 'popper' is a distinct composition (cream cheese) |
| chicken fried steak | chicken fried steak breakfast | chicken fried steak | item | embedding | narration decoration, same restaurant | **DEFENSIBLE** | 'breakfast' reads as menu-channel wording at one venue |
| beef fajitas | fajitas | fajitas | item | embedding | specification fold, same restaurant | **WRONG** | global generic fajitas fused into beef |
| asian noodle salad | asian salad | asian salad | item | embedding | specification fold, same restaurant | **WRONG** | noodle salad vs salad are two menu items |
| chocolate macaron | macaron | macaron | item | embedding | category fold | **WRONG** | flavor subtype into global category |
| pimento cheese | pimento cheese sandwiches | pimento cheese | item | embedding | format fold | **WRONG** | spread vs sandwich: component/format, not one thing |
| mushroom veggie burger | veggie burger | veggie burger | item | embedding | category fold, same restaurant | **WRONG** | spec into multi-venue generic |
| pork belly | fried pork belly | pork belly | item | embedding | category fold, same restaurant | **WRONG** | preparation spec; also pork belly is near-global |
| chopped brisket sandwich | sliced brisket sandwich | chopped brisket sandwich | item | embedding | culinary synonym, same restaurant | **WRONG** | chopped vs sliced is a choice the diner makes |
| brisket banh mi french dip | banh mi french dip | banh mi french dip | item | embedding | specification fold, same restaurant | **WRONG** | protein spec fold |
| loaded pupusas | pupusas | pupusas | item | embedding | category fold | **WRONG** | subtype into global category |
| cauliflower wings | buffalo cauliflower nuggets | cauliflower wings | item | embedding | culinary synonym, same restaurant | **DEFENSIBLE** | likely one venue item; wings vs nuggets differ |
| chicken biscuit | spicy chicken biscuit | chicken biscuit | item | embedding | specification fold, same restaurant | **WRONG** | 'spicy' is a spec (doctrine's own dietary/variant class) |
| petes taco | petes tantalizing tacos | petes taco | item | embedding | shorthand variant, same restaurant | **CORRECT** | study-proven Maudie's fragment |
| duck mole enchiladas | braised duck enchiladas | braised duck enchiladas | item | embedding | culinary synonym, same restaurant | **DEFENSIBLE** | plausibly one venue dish under two retellings |
| caviar and potato chip | chips and caviar | chips and caviar | item | embedding | word order variant | **CORRECT** | word order |
| french dip | prime rib french dip | french dip | item | embedding | specification fold, same restaurant | **WRONG** | french dip is multi-venue generic; spec fused globally |
| carnitas tacos | carnitas | carnitas tacos | item | embedding | format fold, same restaurant | **WRONG** | format fold; carnitas (the meat/dish) is global; coordinator flag confirmed |
| honey mustard potato salad | potato salad | potato salad | item | embedding | category fold, same restaurant | **WRONG** | variant into global generic |
| steamed bun | bao | bao | item | embedding | cross-language synonym | **CORRECT** | established cross-language synonym |
| green salsa | salsa verde | salsa verde | item | embedding | cross-language synonym, same restaurant | **CORRECT** | cross-language synonym |
| gouda hot pockets | brisket gouda hot pockets | gouda hot pockets | item | embedding | specification fold, same restaurant | **WRONG** | protein spec fold |
| detroit style pizza | detroit/sicilian pizza | detroit style pizza | item | embedding | category fold | **DEFENSIBLE** | near-synonym styles; low harm |
| chocolate tart | sea salt chocolate tart | chocolate tart | item | embedding | specification fold, same restaurant | **WRONG** | spec fold |
| veggie omelet | omelet | omelet | item | embedding | category fold | **WRONG** | subtype into global generic omelet |
| agua fresca | watermelon agua fresca | agua fresca | item | embedding | category fold, same restaurant | **WRONG** | flavor spec into global generic |
| boiled shrimp | peel and eat shrimp | peel and eat shrimp | item | embedding | culinary synonym | **CORRECT** | established synonym |
| pork bun | pork belly bun | pork bun | item | embedding | specification fold, same restaurant | **WRONG** | belly is a spec; different bun |
| supreme slice | supreme pizza | supreme pizza | item | embedding | format fold | **DEFENSIBLE** | slice vs whole pie of same pizza; format but same food |
| thin pie | thin crust pizza | thin crust pizza | item | embedding | shorthand variant, same restaurant | **DEFENSIBLE** | venue-local shorthand plausible |
| peach tea glazed pork belly burnt ends | peach glazed pork belly | peach glazed pork belly | item | embedding | shorthand variant, same restaurant | **DEFENSIBLE** | burnt ends vs belly differ, but reads like one venue dish |
| nada chicken | nada chicken sandwich | nada chicken | item | embedding | shorthand variant, same restaurant | **DEFENSIBLE** | named-offering shorthand at one venue (study's stupid-hot pattern) |
| happy meal | cheeseburger happy meal | happy meal | item | embedding | specification fold, same restaurant | **WRONG** | spec fold; happy meal is a family of options |
| sub | italian deli sandwiches | italian deli sandwiches | item | embedding | category fold, same restaurant | **WRONG** | bare category 'sub' fused into a specific deli line |
| broth | pho broth | broth | item | embedding | specification fold | **WRONG** | generic broth fused with pho broth globally |
| garden salad | salad | salad | item | embedding | category fold, same restaurant | **WRONG** | global generic 'salad' fused into garden salad |
| mashed potatoes | mashed potatoes with gravy | mashed potatoes | item | embedding | specification fold, same restaurant | **DEFENSIBLE** | gravy plausibly how one venue serves it; still a spec |
| migas | migas plate | migas | item | embedding | format fold, same restaurant | **DEFENSIBLE** | 'plate' is format decoration, but migas is multi-venue |
| cueritos | cuerito | cuerito | ingredient | token-multiset | pluralization variant | **CORRECT** | plural |
| date | dates | date | ingredient | token-multiset | singular/plural variant | **CORRECT** | name-variant/synonym per doctrine |
| walnut | walnuts | walnut | ingredient | token-multiset | singular/plural variant | **CORRECT** | name-variant/synonym per doctrine |
| beef ribeye | ribeye beef | ribeye beef | ingredient | token-multiset | word order variant | **CORRECT** | word order |
| hot pepper | hot peppers | hot pepper | ingredient | token-multiset | singular/plural variant | **CORRECT** | name-variant/synonym per doctrine |
| bok choy | boke choy | bok choy | ingredient | token-multiset | spelling variant | **CORRECT** | typo |
| oaxaca cheese | oaxacan cheese | oaxaca cheese | ingredient | similarity | spelling variant | **CORRECT** | spelling |
| roasted rice powder | toasted rice powder | toasted rice powder | ingredient | similarity | culinary synonym | **CORRECT** | same ingredient |
| wood ear mushroom | woodear mushroom | wood ear mushroom | ingredient | similarity | spacing variant | **CORRECT** | name-variant/synonym per doctrine |
| ricotta cheese | ricotta | ricotta | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| sourdough | sourdough bread | sourdough | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| burrata cheese | burrata | burrata | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| cold brew coffee | cold brew | cold brew | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| bbq sauce | barbecue sauce | barbecue sauce | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| dried red chili pepper | dried red chili | dried red chili | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| habanero | habanero pepper | habanero | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| ramen | ramen noodle | ramen noodle | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| mayonnaise | mayo | mayonnaise | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| flour | wheat flour | flour | ingredient | embedding | synonym variant | **DEFENSIBLE** | flour is broader than wheat flour, but culinary default |
| dried chili | dried chili pepper | dried chili | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| beef brisket | brisket | brisket | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| vegetable patty | veggie patty | vegetable patty | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| carnitas | pork carnitas | carnitas | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| sirloin beef | sirloin | sirloin | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| macaroni | macaroni pasta | macaroni | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| shiitake | shiitake mushroom | shiitake mushroom | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| feta cheese | feta | feta cheese | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| matzoh meal | matzah meal | matzoh meal | ingredient | embedding | spelling variant | **CORRECT** | name-variant/synonym per doctrine |
| choux pastry | pate a choux | choux pastry | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| lemongrass | lemon grass | lemongrass | ingredient | embedding | spacing variant | **CORRECT** | name-variant/synonym per doctrine |
| tri-tip | tri-tip beef | tri-tip | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| cumin seed | cumin | cumin | ingredient | embedding | synonym variant | **DEFENSIBLE** | form vs spice; culinary default equates |
| agave nectar | agave syrup | agave nectar | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| romaine | romaine lettuce | romaine lettuce | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| collard greens | collard green | collard green | ingredient | embedding | singular/plural variant | **CORRECT** | name-variant/synonym per doctrine |
| semolina | semolina flour | semolina flour | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| puffed rice | puffed rice cereal | puffed rice | ingredient | embedding | synonym variant | **DEFENSIBLE** | near-identical |
| nilgai antelope | nilgai | nilgai | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| gouda | gouda cheese | gouda | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| orange blossom water | orange flower water | orange flower water | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| hibiscus | hibiscus flower | hibiscus flower | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| salsa verde | green salsa | salsa verde | ingredient | embedding | synonym variant | **CORRECT** | cross-language synonym |
| anise seed | anise | anise | ingredient | embedding | synonym variant | **DEFENSIBLE** | form fold |
| bean | beans | bean | ingredient | embedding | singular/plural variant | **CORRECT** | name-variant/synonym per doctrine |
| pesto | pesto sauce | pesto | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| ground beef patty | hamburger patty | hamburger patty | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| beef chuck roast | beef chuck | beef chuck | ingredient | embedding | synonym variant | **DEFENSIBLE** | cut vs roast form |
| provolone cheese | provolone | provolone | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| pig stomach | pork stomach | pork stomach | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| al pastor pork | pastor | pastor | ingredient | embedding | synonym variant | **CORRECT** | established shorthand |
| tikka sauce | tikka masala sauce | tikka sauce | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| kampachi | kanpachi | kampachi | ingredient | embedding | spelling variant | **CORRECT** | name-variant/synonym per doctrine |
| sesame seed | sesame | sesame seed | ingredient | embedding | synonym variant | **DEFENSIBLE** | form fold |
| pearls | tapioca pearl | tapioca pearl | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| corn grits | grits | grits | ingredient | embedding | synonym variant | **DEFENSIBLE** | grits are corn by default |
| green onion | scallion | scallion | ingredient | embedding | synonym variant | **CORRECT** | canonical synonym |
| vegetable stock | vegetable broth | vegetable broth | ingredient | embedding | synonym variant | **CORRECT** | culinary synonym |
| gruyere | gruyere cheese | gruyere cheese | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| chicken thigh | thigh | chicken thigh | ingredient | embedding | synonym variant | **DEFENSIBLE** | bare 'thigh' generic, but context is poultry |
| nopal cactus | nopales | nopales | ingredient | embedding | synonym variant | **CORRECT** | true synonym |
| sea bass | european seabass | sea bass | ingredient | embedding | synonym variant | **DEFENSIBLE** | species vs market name; doctrine says species stay separate |
| achiote | achiote paste | achiote | ingredient | embedding | synonym variant | **DEFENSIBLE** | form fold |
| pecorino | pecorino romano | pecorino romano | ingredient | embedding | synonym variant | **DEFENSIBLE** | romano is a subtype of pecorino; doctrine leans separate |
| bell pepper | peppers | bell pepper | ingredient | embedding | synonym variant | **WRONG** | global generic 'peppers' (jalapeno? serrano?) fused into bell pepper; coordinator flag confirmed |
| wagyu | wagyu beef | wagyu | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| pork fat | lard | lard | ingredient | embedding | synonym variant | **DEFENSIBLE** | lard is the rendered form; doctrine says processed form stays separate |
| carbonated water | soda water | soda water | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| coriander root | cilantro root | cilantro root | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| brie | brie cheese | brie | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| mascarpone | mascarpone cheese | mascarpone | ingredient | embedding | synonym variant | **CORRECT** | name-variant/synonym per doctrine |
| cow milk | milk | milk | ingredient | embedding | synonym variant | **DEFENSIBLE** | default equivalence, mild category fold |
| key lime juice | key lime | key lime | ingredient | embedding | synonym variant | **WRONG** | juice vs fruit: component vs whole |
| impossible meat patty | impossible meat | impossible meat | ingredient | embedding | synonym variant | **DEFENSIBLE** | form fold |
| pork rind | pork skin | pork skin | ingredient | embedding | synonym variant | **CORRECT** | synonym |
| dill pickle | pickles | pickles | ingredient | embedding | synonym variant | **WRONG** | subtype fused into generic pickles |
| queso fresco | queso blanco | queso fresco | ingredient | embedding | synonym variant | **WRONG** | two different cheeses; recipes distinguish them |
| dough | yeast dough | dough | ingredient | embedding | synonym variant | **DEFENSIBLE** | near-default |
| meat gravy sauce | gravy | gravy | ingredient | embedding | synonym variant | **DEFENSIBLE** | junk-ish name folded to generic |
| hard taco | hard shell tortilla | hard taco | ingredient | embedding | synonym variant | **WRONG** | a taco is not a tortilla: component vs dish |
| chili pepper | chili | chili pepper | ingredient | embedding | synonym variant | **WRONG** | bare 'chili' also names the stew and the powder; generic fused into pepper |
| dark rum | rum | rum | ingredient | embedding | synonym variant | **WRONG** | subtype into category (the scotch/whisky example verbatim) |
| cardamom pod | cardamom | cardamom | ingredient | embedding | synonym variant | **DEFENSIBLE** | form fold |
| white rum | light rum | white rum | ingredient | embedding | synonym variant | **CORRECT** | true synonym |
| miso paste | miso | miso | ingredient | embedding | synonym variant | **CORRECT** | same ingredient |
| chicken drumstick | chicken leg | chicken drumstick | ingredient | embedding | synonym variant | **DEFENSIBLE** | leg often = drumstick+thigh; loose but common usage |
| grapefruit juice | grapefruit | grapefruit juice | ingredient | embedding | synonym variant | **WRONG** | juice vs fruit: component vs whole |
| gram flour | chickpea flour | chickpea flour | ingredient | embedding | synonym variant | **CORRECT** | true synonym |
| pomegranate seed | pomegranate | pomegranate | ingredient | embedding | synonym variant | **DEFENSIBLE** | arils are how the fruit is eaten; mild form fold |
| bbq pork | pork | pork | ingredient | embedding | synonym variant | **WRONG** | preparation fused into the global base ingredient 'pork' |
| string beans | green bean | green bean | ingredient | embedding | synonym variant | **CORRECT** | true synonym |
## Repair applied (2026-08-30, same day)

### 1. Un-merge — DONE on staging, verified

`apps/api/scripts/unmerge-entity-dedupe-2026-08-30.ts` (dry-run default,
`--apply`): matched **48/48** audit rows in the ledger; applied — **47
executed merges un-merged**, the 1 unexecuted verdict (dumpling soup → soup
dumplings) flipped to `hold` so resume can never execute it. Per pair: loser
un-archived, loser→winner redirect deleted, the winner's merge-folded
surfaces removed (the 'merge_fold' display-name row + rows copied verbatim
from surfaces the loser still carries), winner+loser marked
name_embedding_stale, and the claim_verdicts row flipped to `hold` (plan
nulled, reason prefixed "overturned by merge-batch audit 2026-08-30" — so the
overturn is on the record AND the any-version hold now outranks the
deterministic code folds). Post-verify inside the script: all 47 losers
active, redirect-free, verdicts hold; spot-checked by name (carnitas, ribs,
peppers, sub, ceviche de pescado, bbq pork, garden salad): active, own
surfaces intact, 0 redirects.

**What stays fused until the Austin reload** (printed per-entity by the
script's dry-run): every loser returns with ZERO connections/references —
its evidence rows, colliding-mention deletions, summed counters, rekeyed
entity-dimension events, rewritten ingredient arrays, rehomed user anchors,
and pruned score rows all remain on the winner (e.g. winner footprints still
carrying the fold: fajitas 35, veggie burger 33, ceviche 22, salad 24,
pork 194 ingredient refs, chili pepper 136). The reload regenerates these
from source docs. Also unrecoverable: any pre-existing redirect chain
A→loser that the merge rewrote to A→winner (nothing recorded which).

### 2. Doctrine — THE CORPUS-GLOBAL LAW (entity-match-prompt.md, rule v5)

Reconciled in favor of the fragmentation study (§4): for corpus-global
entity kinds (item, ingredient), **merge = IDENTITY ONLY** — the same thing
under a different name wherever it appears. The home-restaurant section is
replaced: the **narration-decoration and channel-wording same-restaurant
fold clauses are DELETED** ("same restaurant is never a ground for match");
that unification belongs to extraction (pro-form resolution / emit-as-spoken
— the study already noted narration decoration is CORRECT extraction, so
the extraction side owns it with no prompt change there). What remains, as
identity rulings: venue-name decoration folds (a venue's name is never part
of a dish's identity — legacy residue of the v17 extraction ban), the
menu-number-with-stated-mapping name variant, genuine-variant-never-folds
(now explicitly including style-qualified formats: sushi omakase ≠ omakase),
source-contrast, and doubt-says-new. The prompt also names
category/specification/format/broader-narrower/same-restaurant as
SELF-REFUTING reasons.

**same_place decision (from first principles): removed from the sweep's
judge calls entirely** (and from the sweep replay adapter). The honest
version ("both entities single-homed at the same single venue") would only
license folds the doctrine no longer contains, so an honest flag has no
consumer; footprint overlap — the bug — licensed the batch. The birth
judge's same_place is a DIFFERENT, honest fact (thread restaurant vs
candidate homes on a mention hearing) and remains: it scopes the venue-name
identity rule, the one same-place clause that survives. The prompt's
evidence-field description now says it is sent only on mention hearings and
is never by itself a reason to match.

entity-dedupe-rule.ts bumped to **v5** (fingerprint e0236ace3f8a) — this
re-opens every judged pair, including the 48 overturned holds, which is
intended: the v5 doctrine + tripwire re-hear them safely.

### 3. Reason tripwire — mechanical, shared, proven

`apps/api/src/shared/merge-reason-tripwire.ts` — typed classifier over the
judge's stated reason, wired at BOTH verdict-recording chokepoints
(`settleDedupeVerdict` in food-dedupe-merge.service.ts, `settleVerdict` in
attribute-dedupe-merge.service.ts — one shared implementation): a merge
whose reason names a banned class (category/specification/format fold,
broader/narrower, same-restaurant/place/venue/kitchen, and the deleted
narration/channel classes) is REFUSED — recorded fail-closed as `hold` with
the original ground preserved inside the refusal reason and an error-level
log. Holds are never inspected (a banned phrase may lawfully ground a
keep). Deliberately fail-closed even for "venue-name decoration, same
restaurant" at the sweep: a held pair costs a re-hearing, a wrong merge
costs the corpus. Specs: `merge-reason-tripwire.spec.ts` (every banned
reason string from this batch's verdict table refuses; every CORRECT-merge
reason from the same table passes) and
`merge-reason-tripwire-chokepoint.spec.ts` (merge→hold conversion at the
chokepoint, plan dropped, effect never runs; clean merge unaffected).

### 4. Auto lanes ledgered

`mergeItemPair` (number lane + identical-token-multiset lane) now routes
through `settleDedupeVerdict`: every deterministic merge records a
claim_verdicts row FIRST (outcome `merge`, via `number-auto` /
`token-multiset-auto`, reason naming the deterministic rule), then executes
— the same verdict-then-effect contract as the judge lane. No un-ledgered
merge path remains in the service.

### 5. Pins + re-cert

entity-match-gold grew 27 → **38 cases**: this batch's wrong classes pinned
correct-side (carnitas/carnitas tacos BOTH directions, beef fajitas≠fajitas,
ceviche de pescado≠ceviche, caesar wrap≠chicken wrap, bell pepper≠peppers,
bbq pork≠pork, plus the study's omakase≠sushi omakase), the batch's true
synonyms pinned merge-side (bbq sauce=barbecue sauce, boke choy typo,
beef ribeye/ribeye beef word order), and the two deleted-doctrine pins
FLIPPED (course-count-narration and channel-wording now expect `new`, why
fields citing the corpus-global law). Certified **38/38 PASS ×3, on three
consecutive harness runs** (one flake of the menu-number pin during
iteration was fixed by naming menu numbers as venue labeling in the prompt
— part of v5's text).

### 6. Post-fix sweep dry-run (staging) + gates

Dry-run at floor 0.65 after the v5 bump: **442 would-judge hearings**
(the re-opened docket, incl. dumpling soup/soup dumplings back in the
word-order judge lane), **0 auto merges** — no deterministic fold touches
anything, and the 48 overturned holds outrank the code folds by design.
The exact overturned generic-vs-specific pairs sit deeper than this run's
top-200 embedding docket; when they surface, the certified v5 doctrine
holds them (each is a literal gold pin) and the tripwire refuses any
relapse at recording time. Judge lanes remain gated off
(DEDUPE_JUDGE_LANES_ENABLED unset).

Gates: `yarn build` green; targeted jest 10 suites / 77 tests green;
`yarn invariants` 43/88 proofs green; boot smoke green (/health healthy,
0 errors). Nothing committed.
