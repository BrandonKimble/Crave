# Ask-taxonomy study: is there a principled line between "what's good?" and "who sells it?"

Corpus research, 2026-08-29. Question: the extractor stores some bare AVAILABILITY answers
("Cherrywood sells cold slices of pie/cake") as vouched dishes (~5% of dish mentions). The owner
will only approve a fix if the corpus shows a learnable boundary between recommendation asks
(including bare-noun asks) and directory/fact asks — without regressing the recommendation side.

All numbers below come from queries against staging (`crave_search`, community `austinfood`) and
hand tallies of the actual rows. Working files (sample TSVs, the classification script with every
per-row judgment) are in the session scratchpad (`ask-taxonomy.tsv`, `dir-replies-sample.tsv`,
`sample-active.tsv`, `classify.py`).

## 1. Method

- 450 posts sampled deterministically (`ORDER BY md5(document_id::text) LIMIT 450`) from the 1,358
  austinfood posts; every one hand-classified (no keyword filter, so bare-noun asks without "?"
  are captured).
- 646 reply comments to the 76 directory-class posts pulled via `parent_source_id`; a deterministic
  250-comment subsample hand-judged one by one.
- Stored behavior checked by joining those 250 comments through
  `core_restaurant_entity_events` / `core_restaurant_item_mentions` restricted to
  `active_extraction_run_id`.

## 2. Ask taxonomy and prevalence (450 posts, hand-classified)

| Class | n | % of docs | % of asks (n=295) |
|---|---|---|---|
| NONASK (reviews, news, rants, PSAs, meta) | 155 | 34.4% | — |
| REC-QUAL — explicit quality words ("best", "good", "recs") | 87 | 19.3% | 29.5% |
| REC-CONSTRAINED — occasion/diet/area/budget/group ("date night", "vegan downtown lunch") | 79 | 17.6% | 26.8% |
| DIR-STOCK — findability/procurement ("where to buy masa/honey/natto/50lb beans") | 38 | 8.4% | 12.9% |
| DIR-LOGISTICS — hours/waits/lines/closures/prices/identification | 31 | 6.9% | 10.5% |
| REC-BARE — bare-noun craving asks ("Laksa? Where to buy?", "Spumoni???", "Goat tacos?") | 27 | 6.0% | 9.2% |
| CHARACTERIZATION — "is X still good / worth it / anyone been?" | 15 | 3.3% | 5.1% |
| REC-SIMILAR — "something like X" (Bean Burger, Boston Market, Mozart's shake) | 11 | 2.4% | 3.7% |
| DIR-DEAL — deals/specials ("Taco Tuesday deals?", "wine wednesday specials?") | 7 | 1.6% | 2.4% |

Headline shape: **recommendation asks are ~69% of all asks** (REC-QUAL + REC-CONSTRAINED +
REC-BARE + REC-SIMILAR = 204/295), **directory asks ~26%** (76/295, DIR-STOCK + DIR-LOGISTICS +
DIR-DEAL), characterization 5%. Two-thirds of DIR-STOCK asks are *grocery/product* procurement
(masa, honey, salt, milk, spices, CSA boxes) where a dish-vouch is mostly meaningless anyway; the
restaurant-adjacent directory asks (menu stock like "which Wingstop has curly fries", "places
carrying Thirsty Planet", deal asks, hours asks) are roughly 10% of asks.

## 3. Reply split for directory asks (250 replies hand-judged)

| Reply type | n | % |
|---|---|---|
| PURE-AVAIL — names a source, zero valuation | 69 | 27.6% |
| AVAIL+ENDORSE — names a source + taste/experience/habit/comparison | 64 | 25.6% |
| PURE-ENDORSE — unsolicited praise/derision of a place | 16 | 6.4% |
| FACT — non-place answer (wait time, date, price history, gossip) | 44 | 17.6% |
| BANTER | 36 | 14.4% |
| OTHER (advice, recipes, questions) | 21 | 8.4% |

**The owner's key reply number: of the 149 replies that name a place, 80 (54%) carry real
endorsement and 69 (46%) are bare availability.** A directory-ask thread is NOT an
endorsement-free zone — half its substantive replies must keep counting.

Verbatim pure-availability examples (15+): "Amazon." / "H Mart" (t1_js6s2t0, t1_js6u8yd, Joha
rice); "Fiesta. 3909 N Interstate 35 Service Rd." (t1_jufk8ig, pig tails); "Julio's."
(t1_juhjfrz, salsas); "Costco" (t1_julu629); "Peace bakery" (t1_jude1qd); "JD's will probably
have them." (t1_jwi7ik7, nopalitos); "Zaviya has lunch buffets on weekends" (t1_jumv5vi);
"Restaurant Depot does. Just went this past weekend. You can get a day pass." (t1_jvjaccx);
"Wheatsville can special order 25lb or maybe even 50lb bags." (t1_jvjmyaa); "Trader Joe's for
sure has it right now." (t1_jz4l58w, Diamond Crystal); "Bought some at Trader Joe's (Great Hills)
yesterday. $8.99 for 3lbs." (t1_jz513lp); "Bell & Evans air chilled from Whole Foods."
(t1_jvtdppj); "Parkside has 1/2 price oysters and champagne on Wednesdays" (t1_jvszjb3);
"Foreign and Domestic on North Loop has oyster Tuesdays. 1 dollar oysters and rosé specials."
(t1_jwa4i2y); "Dollar beer night at Lavaca St Bar... Drinks Lounge has $2 Tecates and $2 tacos"
(t1_jud2aa6); "Browns on South Lamar for take out." (t1_jtks8r6); "You want Steiner Ranch
Steakhouse" (t1_jufa6nd); "Shakeys" (t1_jyr89c8); "Higher Ground... they have $1 raw East Coast
Oysters every Tuesday until they sell out." (t1_jvsqy9k).

Verbatim availability+endorsement examples (15+): "their anchovy stuffed olives are out of this
world" (t1_ju10sta); "Phoenicia Deli... Great hummus/tabouli... Very much recommend the
wraps/gyros/shwarmas" (t1_jucnlpu); "Rosa's. $5.99 3 taco plate... I'm eating it now and it's
great." (t1_judbhg5); "Peace Bakery and Deli... Stay for my favorite hummus in Austin. Ask for it
spicy" (t1_jui9u94); "La Escondida... has the best tomatillo/avocado based salsa I've ever had"
(t1_jun32s5); "Jardin Corona has ridiculous salsa" (t1_jui596n); "Salsas I gladly pay for, as
they are spicy and hit that balance between pain and craving: Carnitas El Güero... Taquito
Avilés... Regios" (t1_juhvsgn); "Pricey but totally worth it IMHO would be Clark's... my goto for
a few years now when I need that crustacean hit" (t1_jvsffc1); "Local pastures on Oltorf... so
worth it. All the meat there is great! And the best eggs!" (t1_jvti3ul); "some of the WF locations
have fresh pitas and they're really damn good... I see it regularly at the Domain spot"
(t1_jucmmzd); "Central Market... They make fresh daily and it's great." (t1_jue8okb); "Mother
culture is great!" (t1_jwir5du); "Round rock Honey and Stroope and good flow are all supposed to
be local. I like good flow a lot." (t1_jwlnrei); "I like the Cooks Venture brand at HEB, and also
check out the Local Pastures truck on Oltorf for some fantastic local poultry" (t1_jvthsz3);
"making cheese from their milk for over a year now, it's amazing" (t1_jx4qw0o, Richardson Farms);
"Arturo's is great. I used to work nearby and miss their tacos and coffee." (t1_jyt07rx — a reply
to an HOURS question); "I've been eating their cookies since 2005-ish... quality still solid"
(t1_jwejc9d, Tiff's, inside a price-complaint thread).

Note the last two: endorsements routinely arrive as replies to hours/price/logistics asks. The
ask class alone can never be the storage gate.

**"Bare availability that is probably endorsement anyway":** among the 69 pure-avail replies,
roughly 15–20 are habitual-procurement statements ("Just went this past weekend", "where I've
purchased it", "I get all my meat from wild fork") — the replier demonstrably chose that source
among options they know. Almost all of these are grocery/product sources, not restaurant dishes,
so dropping their implicit vouch costs the dish graph almost nothing.

## 4. Ambiguity rate

47 of 295 asks (15.9%) were flagged HARD during classification — a human pauses on them. But most
resolve on a second read; the genuinely either-way residue is about 20 asks (~7%). All 47 are
listed with verbatim text in `ask-taxonomy.tsv`; the full flagged set:

Bare-noun craving asks that use pure procurement phrasing (lean REC — every human reads "tell me
a good one"): "Laksa? / Where to buy?"; "Spumoni??? Where can it be found in Austin????"; "Goat
tacos in Austin? Anyone serve them? Where? What style?"; "Crab pretzel — I have an intense
craving... any suggestions"; "Where to find a Doner kebab? ... Does any place in Austin serve one
and it's good?"; "Tamales de piña??"; "Potato wedges — serious hankering... anyone know where I
can get any fix"; "Where can I get coffee bun"; "closest I can get to a British style sausage
roll"; "Where to get fish bone broth"; "Where to go for cuban croquetas?"; "Any restaurant in
Austin make pork brains?"; "Good sfogliatelle? ... or honestly just any sfogliatelle at all";
"Any reputable burgers served on a pretzel bun in this town?"; "Is there a place in Austin that
serves haggis?"; "Strawberry Pretzel Salad — is there any place that sells it in Austin?";
"Help- lookin for egg noodles"; "hot cracklin pork rinds — Does anybody around here sell that?";
"Looking for cream cheese and cucumber tea sandwiches to try"; "Where to find fresh fruit cake in
north Austin?"; "Steamed clams? Anyone know of a place in town that serves steamed clams?";
"Mooncakes... south?"; "Kabsah or Mandi in Austin ??"; "Looking for Players burgers — Is this
still true...?"; "I need white coffee"; "Scottish cuisine... genuine Scottish dishes"; "Can I get
a SoCal-style Machaca con Huevos burrito in the ATX?".

Procurement asks wearing quality words (lean DIR — the deliverable is a stock location, but
quality clauses in replies are real endorsements): "Cheapest Meat Market near Jollyville?";
"Best low sodium frozen meals?"; "Best pre-made fresh salsas?"; "Mexican meat markets with good
quality meat?"; "Where are y'all buying reliable chicken breast?"; "Fresh baked pita bread...
to buy for my house"; "Central Asian restaurants or stores... place to buy qazi"; "Coffee for a
large group... does boxes of coffee to go".

Format/constraint asks where availability IS the question but the asker will eat the answer
(the true either-way core): "pork ribs open in the evening (after 8pm)"; "House of Three Gorges
closed X-mas Day — what's the alternative?"; "Places open on Christmas Day for food? ...anything
really"; "Breweries Open on Mondays?"; "premade breakfast tacos on S Lamar (commute)"; "Indian
Buffets Redux — have any returned to lunch buffet service?"; "oyster bars with good happy hours";
"Absolute cheapest food... when location or taste doesn't matter much"; "DJ Brunch — are there
any places?"; "spooky themed restaurants in October?"; "Vegan Indian? Do any other Indian
restaurants do something similar?"; "cheese enchiladas with queso blanco inside rather than
melty queso".

## 5. Current (v16-lineage active run) behavior cross-check

Of the 250 judged replies, **28 produced stored events under their document's active extraction
run** (113 events total; `sample-active.tsv` has every row).

- **~24 of 28 are endorsement-backed and correctly stored** — e.g. t1_jun32s5 ("best
  tomatillo/avocado salsa I've ever had" → La Escondida tomatillo avocado salsa), t1_jvmdmyh
  ("Sammataro is by far and away the best pizza in Austin" → pizza), t1_jyt07rx (Arturo's
  tacos/coffee from an hours thread), t1_juhvsgn (four salsa vouches).
- **1 clear availability leak**: t1_jvsqy9k — "Higher Ground isn't an oyster bar... they have $1
  raw East Coast Oysters every Tuesday until they sell out" (a deal-fact correction, zero
  valuation) → stored `food_mention: east coast oyster` + `menu_item_food`-grade structure at
  Higher Ground. This is exactly the Cherrywood class: **a deal/stock clause promoted to a dish
  mention.**
- **2 borderline**: t1_jss7g2r (a Loro wait-time answer whose aside "the frozen gin and tonic 🤤"
  became a full menu_item extraction — the emoji is arguably praise, so defensible) and
  t1_jtqes9z ("they had duck pastrami the last time i went" → menu_item duck pastrami — habitual
  visit + "interesting cuts!", availability-dominant phrasing).
- **Correct restraint is the norm**: none of the bare grocery answers (Fiesta, H Mart, Costco,
  Trader Joe's, JD's, Wheatsville), none of the deal-facts (Parkside, F&D, Lavaca St), and none
  of the long-waitlist restaurant lists (t1_jw1fqft names 8 restaurants, t1_jw2z1gx names 5 —
  zero active-run events) were stored.
- **The opposite error exists too but at restaurant level, not dish level**: replies like "Slab
  is... pretty good. I would say better than PokEJoes" (t1_jtly84g) and "recommend stiles switch"
  (t1_jtobwg7) produced no active-run dish events — correctly, since no dish is named; whether
  the restaurant-level vouch lands elsewhere is out of scope here.

So the leak is real but narrow in this slice: ~1 clear + 2 borderline out of 28 stored (≈4–11%),
consistent with the ~5% population figure. The model already refuses the easy 90%; it slips
specifically on clauses whose surface is menu-detail-rich ("$1 raw East Coast Oysters every
Tuesday", "sells cold slices of pie/cake", "they put it in their bun bo hue") — availability
stated with dish-level specificity.

## 6. Bare-noun asks specifically

27/295 asks (9.2%) are bare-noun. Their replies read as recommendations — a one-word "Julio's."
under "Spumoni???" is a vouch, and every human reads it that way. A naive "could a directory
answer this ask?" test misfires on ALL of them: a directory can list laksa places, but nobody
posting "Laksa? Where to buy?" to a food subreddit wants the list — they want the one worth
eating. What separates them from "who sells single slices" / "places carrying Thirsty Planet" is
not the verb (both use "sells/carry/where to buy") but **what is being polled**: a bare-noun ask
names a dish the asker intends to eat and polls the crowd's taste (the crowd is the instrument);
a procurement/logistics ask polls the crowd's knowledge of stock, hours, or price (the crowd is a
phonebook). Every one of the 27 bare-noun cases names an eating want (craving, memory, occasion);
every DIR-STOCK case names an obtainment problem (an ingredient/product to take home, a format,
a schedule). Tested against all 47 hard cases, this want-vs-obtainment reading places each one
where the human read lands, with the residual ~20 format-constraint asks (open Christmas, buffet
availability, commute tacos) genuinely mixed — and for those the reply-level test below decides
correctly anyway.

## 7. Conclusion: the boundary, its formulation, and the recommendation

**Yes, there is a principled boundary, but it is not primarily an ask classifier — it is a
clause-level test on the reply, with the ask deciding only one case (the bare nomination).**
The corpus shows why an ask-side-only fix can't work: half of place-naming replies to directory
asks are real endorsements (§3), and endorsements routinely appear in hours/price threads (§5).
Equally, a reply-side verb list can't work: "sells", "has", "carries" appear in both leaks and
valid vouches.

Proposed test, in the decision-point style:

> **The vouch test.** A (restaurant, dish) claim earns a mention only if the clause would become
> false were the dish mediocre. "Their tomatillo salsa is the best I've ever had" fails to be
> true of a mediocre salsa — vouch. "They have $1 raw East Coast Oysters every Tuesday" /
> "Cherrywood sells cold slices of pie" stay true of a mediocre one — availability, not a vouch.
> Personal experience, taste words, habitual use, and comparison all pass the test; existence,
> stock, format, price, hours, and deals all fail it.
>
> **The bare-nomination branch** (the only place the ask matters): a reply that merely names a
> place, with no clause at all ("Julio's."), inherits the question it answers. If the thread asks
> what is good or where to eat a named want — including bare-noun asks — the nomination is an
> answer to "what's good" and counts. If the thread asks who stocks, what's open, or what it
> costs, the nomination asserts only the fact and does not count.

What it would get wrong, and how often, measured against this sample:

- It keeps every one of the 64 AVAIL+ENDORSE and 16 PURE-ENDORSE replies (no regression on the
  endorsements the owner fears losing) and every bare nomination under the 204 recommendation
  asks, bare-noun included.
- It drops the ~15–20 habitual-procurement pure-avail replies whose naming is "probably an
  endorsement anyway" ("Restaurant Depot does. Just went this past weekend"). Nearly all are
  grocery sources; the dish-graph cost is negligible, and erring safe here is the right default.
- Its residual error zone is the ~5% of asks that mix want and format ("open after 8pm",
  "single slices") when the reply is ALSO a bare nomination — rare (bare nominations are a
  minority of replies, mixed asks a minority of asks; compound incidence well under 2% of
  directory-thread replies), and the miss is a dropped weak vouch, not a fabricated one.

**Recommendation: fix it.** The leak is small (~5% of dish mentions; 1 clear + 2 borderline of 28
stored in this sample) but it is a *false-vouch* error — it manufactures crowd endorsement that
never happened, which is the one direction the product cannot tolerate — and the corpus shows the
boundary is learnable without regressing (a): every endorsement-bearing reply in the sample passes
the vouch test on its own text, and bare-noun asks are cleanly protected by the nomination branch
because they name a want, not an obtainment problem. Err-safe-and-keep-counting would keep
polluting exactly the availability-heavy threads (deals, stock, hours) where the app's answer
looks most authoritative and is most checkable against a menu. The cost of the fix, honestly
stated: we forfeit the implicit vouch inside habitual bare availability answers — a handful of
mostly-grocery mentions per hundred directory replies.
