# Crave: Extracting Food Claims from Community Text

## What you are extracting

**A CLAIM is: someone who has eaten X at Y, saying something about it — or
naming X as their own pick, when asked for one.**

That sentence is the whole job. Four things must each be the RIGHT KIND for a
claim to exist, and you must test each one explicitly. Text that looks right
but is the wrong kind is the single largest source of bad data — a trip plan
looks like a recommendation, a supermarket looks like a restaurant, a format
looks like a dish, and a comparison looks like a property.

**THE FOUR TESTS.** Learn these by name; the steps below refer to them by name.

1. **THE TESTIMONY TEST** — _Has the writer eaten it?_
   A claim is a report of experience. Planning, asking, announcing,
   cataloguing a roster, and repeating what others say are not experience.
   One named satisfier: **THE ANSWER TEST** — _was this name offered as the
   writer's own pick, in answer to a request for a pick?_ If yes, **the name
   IS the verdict** — testimony is satisfied with no adjective, no verb, and
   no dish.
2. **THE PLACE TEST** — _Is this claim about food prepared and served by this
   place, to eat now?_ Not goods sold packaged to take home and prepare later.
3. **THE ORDER TEST** — _Could you say this to a server as the thing you
   want?_
4. **THE STANDALONE TEST** — _Severed from the noun it modified, does this word
   still mean one definite thing?_

A failure at any test ends the work for that claim. Test in order: they run
cheapest-first, and each one protects the tests after it.

---

## Processing loop and scope

- Run the steps below **separately for each source** in the input payload: the
  post body (once, only when `extract_from_post: true`) and every individual
  comment, top-level or nested. Each run emits output only for that source,
  while using surrounding content for context.
- When a source fails a gate, **emit nothing for that source** and continue
  with the remaining items.

**`extract_from_post`**: when `false`, do not emit mentions from the post body.
Still use the post title and body to resolve names in comments. The flag
controls emission from the body only, never the use of context.

**`subreddit`**: the community this post comes from — background context
for reading the thread (what "the domain" of local shorthand is). It
licenses no claims and changes no rule below.

**GEOGRAPHY IS NOT A GATE.** Genuine food testimony extracts wherever
the place is — the source community never scopes eligibility, and
distance or city is NEVER a drop reason. "Go to San Antonio and India
Palace Buffet is one of the best buffets I've ever had" is a real vouch
and emits, from any community's thread; so does a vouch for a place in
Houston, Dallas, or another country. Which places a given searcher sees
is another system's job entirely. Every real drop reason below —
pastness, closure, speculation, hearsay, asks, self-promotion, retail —
still applies on its own merits; being far away is simply not one of
them, and never rescues or condemns a mention on its own.

**In-scope context**: strictly the text of the POST OBJECT the active source
belongs to — that post's title/body (subject to `extract_from_post`), the
active comment, and parent/earlier lines within that same post's threads. The
payload may contain MULTIPLE independent post objects: **each post is its own
sealed world.** Never resolve references, inherit food/restaurant context, or
unify names across different post objects.

**Depth-aware resolution order**, whenever a step resolves a reference
(pronouns, deictics, definites, possessives, ellipsis, short affirmations):

- Replies: current comment (closest clause first) → parent comment → earlier
  lines in the same post object → that post's title/body.
- Top-level comments: current comment → that post's title/body → earlier lines
  in the same post object.

**Every example in this guide is illustrative.** When an example seems to
diverge from a principle, follow the principle. And every rule holds for
ANY source, from anywhere, in any language: the cities, cuisines,
currencies, and institutions inside the examples are incidental scenery
(a rule shown with tacos in Texas governs pho in Sài Gòn, jollof in
Lagos, and pierogi in Kraków identically), and verdicts, hedges,
posture, and names are judged in the source's OWN words and grammar —
never by whether they resemble English phrasing or U.S. dining customs.

---

## Step A — Is there testimony here? (THE TESTIMONY TEST)

Answer one question about the writer: **is this person reporting on food they
have eaten, or doing something else?**

Never answer it for the source as a whole. **A source has no genre.** A
question post carries the asker's own past verdicts, and they emit ("Ate at
Uchiko one time, thought it was great … is Uchi still worth a trip?" — the
verdict emits, the question does not; a REMEMBERED verdict is still a
verdict unless its own sentence says the thing is GONE, which is B.1's and
Gate 2's eulogy). A complaint carries standing praise, and it emits ("I
always say they have the best burger in Austin" emits however long the
service rant around it). A rave carries items that fail, and they do not
emit (the fries the writer "hoped would be crispier"; a price list inside a
rave). Deciding a genre first and then emitting all of a source's clauses or
none of them is the failure this step exists to kill. The cure is a
procedure, run on every source before any other rule here:

### A.0 DECOMPOSE, then run THE LANDING TEST

1. **List the SUBJECTS** the source speaks about: each place, each dish, each
   aspect (service, room, wait, price), each deal. Resolve every pronoun,
   deictic, definite, ellipsis, and bare affirmation to its subject by the
   depth-aware order first — a reply that names nothing at all ("Build your
   own. … You won't leave disappointed") takes the thread's subject, walking
   up past any intermediate comment that itself named nothing. A thing the
   text never names — a truck at a bar, "that lady", "a place on 34th" — is
   still a subject and gets its own line.
2. **Assign every clause to the ONE subject it is about.** A clause about the
   post, the thread, the photo, other commenters, "this sub", or the
   writer's own day or body has no food subject: it belongs to no line and
   touches no verdict.
3. **Mark each clause's ACT** — what the writer is DOING with it: a VERDICT
   (judging how good the thing is to eat or worth having); a FACT (what the
   venue has, sells, charges, when it is open, how a dish is made); a PLAN
   or an ASK; HEARSAY (someone else's verdict, a rating); a STEER (telling
   you what to order or where to go); a PICK (a name offered in answer to a
   request); an AFFIRMATION (putting the writer's own weight behind a
   parent's claim).
4. **Run THE LANDING TEST on every subject.**

**THE LANDING TEST — per subject. This is the decision procedure; no
example outweighs it.**

- **Only this subject's own clauses count.** Clauses about any other subject
  are invisible to it: a pan of a neighbor, criticism of the photo or of the
  order, a service complaint, a reaction to the post, a plan — none moves
  this subject up or down, and this subject's praise rescues none of them.
  "I love casino and that burger, but this photo (and the order being wrong)
  are a crime to both of them" — the "but" is about the photo; the place and
  the burger land on "love". "Their turkey sub and meatball sub are so good"
  under a thread trashing the pizza lands the subs high; the pizza is another
  subject. "I love Uroko, but their handrolls would move up a tier if the
  seaweed was better" holds two subjects: the place lands on "love" and
  emits; the handrolls land low and do not.
- **The verdict is where the subject's OWN clauses land**: the last
  evaluative clause about it, or the one after a contrast marker in the
  writer's language ("but", "though", "still", "however"). **The clause
  after the marker IS the verdict; the praise before it is not.** "Good,
  but definitely nothing special" lands on "nothing special"; "nice and
  crispy but very average" lands on "average"; "liked it — but didn't love"
  takes the praise back to the ordinary; "found the food delicious, but …
  Not worth it" and "Good, but definitely not worth waiting on a long-ass
  line for" land on "not worth" — all low, and nothing emits for those
  subjects. The downgrade need not concern flavor: value, wait, or price
  qualifying THIS subject's verdict defeats it. **What the marker does
  depends on the WEIGHT of the clause after it**: a REAL verdict after the
  marker reverses the frame ("wasn't sure about it, but honestly great",
  "…but their queso is genuinely great" land high), while a MILD word after
  the marker only concedes — it takes the frame's direction and does not
  reverse it ("I wasn't huge on De Nada but they had a decent hard shell
  taco" lands low: the frame is about that food's quality, and "decent" is
  a concession inside it). The frame must be about the same food's quality
  to pull a mild word down; a gripe on another axis (price, shrinking
  portions, a wait) is another subject, and a mild word reasserted against
  it stands ("they've shrunk by about 20%. But quality still solid" endorses
  the cookies). When the clause is a RATING,
  the score IS the landing, judged against the writer's own scale (a 7.3
  beside the writer's 8.4 favorite lands low; eating it added nothing on
  top).
- **Evaluative means about how good it is to eat or how worth having.** A
  clause that doubts a PROPERTY ("good but I don't know how authentic they
  are" — or how spicy, or whether it counts as barbacoa), quotes a price
  without judging it, describes size or portions, or gives directions and
  hours is not evaluative: it neither raises nor lowers the landing, so the
  verdict beside it stands and the doubted property simply enters no array.
  In the other direction, praise of size, price, or portions never lifts a
  verdict that landed low on taste ("average quality but absurd portions"
  lands low).
- **Read the writer's MEANING, not the surface.** Sarcasm ("Makes sense if
  your go-to is Waffle House" endorses nothing), a rhetorical question that
  asserts ("Why Pollo Rico when Pollo Regio is the GOAT?" is a verdict for
  Pollo Regio and asks nothing), reluctant assent ("Lol regretfully yes" to
  "is the queso still good?" affirms the queso — reluctance is not a
  downgrade), and a superlative relative to a panned field ("They all suck …
  probably your best bet still" endorses nothing) are all read for what the
  writer means about the subject.
- **Then judge the landing clause with THE BASELINE TEST (A.2).**

**Outcome per subject.** Lands ABOVE the ordinary → testimony for this
subject; carry it to Steps B–D. Lands AT or BELOW the ordinary, or negative
→ NEGATIVE CONTENT for this subject: nothing emits for it, and none of its
descriptors, prices, or properties leaks into output ("crispy" never rides
a defeated verdict). No evaluative clause at all → the subject's clauses are
acts, not verdicts, and the ACT rules decide: a PICK or a STEER is a verdict
by itself (A.1); a FACT volunteered for a WANT banks its item (A.1's
volunteer principle); every other act — plan, ask, hearsay, announcement,
an unchosen fact — earns nothing (A.2).

The procedure is self-contained: it names subjects, groups clauses, marks
acts, and lands each subject. Everything below tells you how to judge the
acts it surfaces.

### A.1 What counts as testimony

The writer vouches from experience, or reports a clear consensus:

- Direct verdicts: "it's fantastic", "best cheesesteak I've ever had",
  "their brisket slaps", "The only restaurant where I'll gladly order the
  chicken entree!" (a verdict on that dish, however roundabout).
- Experience narrated in the past: "went to Sour Duck last Sat", "had an
  incredible meal off the Bunbelly truck" — **when the narration carries or
  leads to a verdict** about the same establishment (a visit list
  introducing a review of a DIFFERENT place is a credential, A.3's
  yardstick). **Bare attendance is not testimony**: "I've only been to
  Cuba512", "went to maman this morning and they told me" state that the
  writer WAS somewhere and nothing about the food.
- Indirect recommendation: "worth the trip", "definitely go", "my go-to" —
  and the IMPERATIVE steering the reader to a specific thing: "get the hash
  browns deep fried", "don't snooze on the hot bar", "don't sleep on the
  jollof". Telling someone what to order IS vouching for it, and a tip
  passed on as the writer's protip is the writer's own steer. (The steer
  still walks Steps B and C: "junk the tortillas and get fresh ones from
  HEB" steers you to a grocery SHELF — B.2, nothing emits.)
- Consensus reported: "people rave about \_\_\_", "this sub loves \_\_\_".
- **THE VOLUNTEER PRINCIPLE — choosing to answer is itself the
  endorsement.** One insight, three faces: a NAME offered to a rec ask is a
  pick (the ANSWER TEST, next); a DEAL offered to a thread that wants one is
  a recommendation of that deal (A.2's posture rule); a SOURCE offered for a
  thing the thread wants — "Quack's on 43rd has them. Also Epoch sells them
  sometimes" — banks that item at each place as a dish mention, no praise
  carrier. Nobody volunteers a place for a thing unless the thing is worth
  having there, and the volunteered item is coverage a searcher needs.
  **SCOPE — one test: _in answer to a WANT, did the writer hand the asker
  something they can GO GET — a place, or an item standing on a place's
  menu?_** Only that is volunteered, and only that banks. An answer to a
  describe / explain / does-it question hands nothing to go get: "It's a
  little sweet and they serve it with honey butter" (to "is it the sweet
  type or the savory type?"), "No waffles but they do have gingerbread
  pancakes and corn pancakes" (to "does Magnolia have waffles?"), "Din tai
  fung and other less famous places make them fresh … steamed on demand"
  (to "are dumplings ever made to order?"), "the butter chicken comes as
  part of the combo — you pick two sides" are facts answering a question
  about the world, and volunteer nothing — no dish, no place. An answer
  that corrects a does-it question and then lists what the place has
  INSTEAD is still describing the menu: the asker wanted waffles, and
  nobody asked for pancakes, so no pancake was handed to anyone. A report of
  today's board ("The current daily special at X is swordfish") describes
  the menu's state, not a standing thing to go get, and volunteers nothing
  either — while "you're in luck, Jack in the Box has them as a limited item
  rn", answering "who still does potato wedges?", hands the asker the very
  thing they wanted, and banks it. The bank is always AN ITEM: a source whose
  words name no orderable thing ("serves BBQ" — a tradition, not an order)
  banks nothing, not even a bare place; a list reply banks only each entry's
  OWN named item. A reply may mix a volunteered source with its own
  testimony, each clause on its own words: "Casa Columbia still has it on
  tap, and the food there is delicious" banks the sought pour (the volunteered
  item) AND the food praise as its own place claim.
  The principle needs a CHOSEN answer to SOMEONE ELSE's want: the asker
  cannot volunteer to themselves ("I've only been to Cuba512 — but wondering
  if anywhere else makes them" is the ask's own attendance clause and banks
  nothing), and the business's own voice (SELF-PROMOTION), a correction
  that WITHDRAWS the thing ("they have it but I wouldn't bother"), and terms
  dropped into unrelated chatter volunteer nothing — while a correction that still hands you the thing ("Higher
  Ground isn't an oyster bar, but they have $1 raw East Coast Oysters every
  Tuesday") volunteers it. **It only PROMOTES a clause that would otherwise
  be silent for lacking a vouch; it never demotes, revives, or re-types.**
  B.2 outranks it — a store, and every shelf good, stays retail-silent: a
  thing the asker would buy and carry off is a shelf errand whoever
  volunteers it ("The Meteor has it" answering a sourdough-STARTER ask;
  "found the blueberry soda … in the cooler at Natural Gardner"; "Hudson's
  Meat Market has great dried sausage, we grab a few links every time" —
  nothing emits from any of them; a bottle in a cooler stands on no menu); a subject the LANDING TEST landed low stays dead,
  volunteered or not; a volunteered item still walks Step C's gates (an
  occasion like "lunch buffet" never becomes an item); and a clause that
  PASSES as a vouch on its own words ("hits the spot") follows the normal
  rules. Under a judgment ask a pick keeps its praise carrier — only the pure
  item-locating answer banks its item carrier-less.
- **Answering a request for a pick (THE ANSWER TEST).** When the in-scope
  post, or a parent comment, asks for a recommendation or a judgment, a
  reply that **names one or more places is testimony, complete as written**:
  a single bare name ("Adrienne's in FiDi"), a list ("Pho phong luu, Tan My,
  Fresh Bowl, Sip Pho if central"), an annotated list ("Roscioli for
  dinner / Pasticceria Regoli for breakfast"), an addition to an ongoing answer
  thread ("Bar Snack & Paradise Lost as well"), a restatement of a name
  already in the thread ("Seconding Odd Duck!"), and the "PLACE for FOOD"
  formula at its most compressed ("Hillside Farmacy for a burger with an old
  fashioned, Junes All Day for a spicy chicken sandwich, Pool Burger for a
  burger and a tiki drink" — three picks, each "for" phrase the entry's OWN
  dish words, walking Step C's gates). The writer chose those names out of
  everything they could have said; the choice is the endorsement. A reply
  that endorses WITHOUT naming ("+1", "Facts") is the AFFIRMATION move
  below. Count every entry and emit each (B.1's most-common-miss law):
  headings, per-neighborhood groupings, "My classification", and a
  first-person sentence beside the list demote nothing. Two conditions,
  both required:
  1. **THE ONE QUESTION, asked of the ASK: _would a MEDIOCRE KITCHEN be a
     CORRECT answer to it?_**
     - **No — the asker wants to eat WELL, however constrained** ("where
       should I eat", "best pizza", "date night that won't break the bank",
       "the most authentic ones", "who has a GOOD selection of veggie
       tacos", and every craving or occasion: "Spumoni??? Where can it be
       found in Austin????", "Cabrito in Monterrey? Anyone serve it?"
       — nobody posts a craving to a food forum wanting the phonebook; they
       want the one worth eating). This is a **JUDGMENT ask**: every pick is
       food testimony and earns the praise carrier; the ask's constraint
       words are Step D's fit assertion and its dish words are C.1 Gate 3's
       inheritance. Authenticity, tradition, and "the real deal" are
       taste-linked criteria — a judgment ask.
     - **Yes — the food's quality is beside the point, and any place with
       the property answers correctly**: a policy or how the house treats
       its people ("a restaurant where the workers are paid good wages and I
       don't have to tip", "places where staff are treated well" — "Know
       some people at Dai Due … pays well, good treatment" emits nothing:
       a fact about employment, relayed), hours ("who's
       open Christmas Day?"), capacity ("50+ breakfast tacos by 7am"), a
       room to rent, a joke criterion ("most likely to have stoned
       cooks?"), and **a SHELF errand — a place to shop or a good to carry
       home** ("who stocks tamales? need a couple dozen to take home and
       reheat", "where can I buy masa?", "best middle eastern grocery
       store?", "best yogurt — farmers market or shops?"): under a shelf
       errand every bare name is a SHELF pick, whatever its name says — a
       "bakery and deli", a "meat market", a yogurt maker — because the
       claim it makes is the claim the ask requested, and that claim is
       about goods carried home (B.2). This
       is a **FACT ask**: a pick asserts only fit with the property and
       carries NO testimony — nothing emits, not a carrier and not the food
       the ask happened to name ("Rosa's — opens at 6:30 and can def do
       that" banks no `breakfast taco`: the fit is the capacity, not the
       taco; "Ikea cafe", "Tsuke Edomae.", "Cheba Hut is actually weed
       themed", "Julio's." under the take-home tamale errand all emit
       nothing). Habitual use scoped to the capability ("Maudie's is my go
       to for this problem") is use of the capability, not taste, and emits
       nothing (an unscoped or food-scoped "my go-to" stays A.1's vouch).
     An ask that names FOOD THE ASKER WANTS TO EAT is never a fact ask,
     however procurement-shaped its words ("who has espresso buns?",
     "Spumoni??? Where can it be found????", "who still does potato
     wedges?"): a BARE NAME answering it is offered as where to eat that
     thing — a judgment pick, carrier owed — while a CLAUSE that only states
     a source has it ("Quack's on 43rd has them", "Jack in the Box has them
     as a limited item rn") volunteers the item and banks it carrier-less
     (the volunteer principle): the bare name endorses the place, the
     clause endorses only what its words say. The VERB never decides
     ("sells", "who has", "where to buy" appear on both sides) and a
     superlative is courtesy dressing ("best", "better", "affordable" front
     asks of both kinds): read the criterion by what would make an answer
     WRONG. **The ONE QUESTION decides only BARE nominations.** A reply
     CLAUSE with its own words faces A.2's VOUCH TEST on its own text, in
     both directions: a vouch inside a fact thread emits ("Tsos Chinese
     delivery has got you. Delicious food and they don't accept tips"
     vouches the food; the tipping fact claims nothing; "Arturo's is great …
     miss their tacos and coffee" under an HOURS question emits on its own
     words), and a fact clause inside a judgment thread earns only what the
     volunteer principle grants. Under a
     judgment ask, then, a verdict clause beside a deal clause ("Perla's
     does them at happy hour — and honestly their oysters are the best in
     town") emits on its own words while the volunteered deal adds
     `affordable`. What a passing pick INHERITS from a judgment ask — its
     dish words and constraints — is C.1 Gate 3's and Step D's business
     ("Taquería El Califa, sin duda" under "¿los mejores tacos?" inherits
     `taco` and emits its carrier).
  2. **Nothing in the reply re-frames the name as neutral information or
     disclaims it.** Judge an annotation by what it DOES to the pick. One
     that helps you USE a pick the writer's taste already chose ("for
     dinner", "if central", "open til like 3am" under a late-night ask,
     "sells out around 4:30", "has what you want") leaves the endorsement
     standing. One that supplies a NON-TASTE REASON the name is on the list
     ("H-E-B (location at Lake Austin blvd serves BBQ)" qualifies by stock)
     demotes the entry to a VOLUNTEERED SOURCE: no praise carrier, and its
     item banks only where the words name an orderable thing — "BBQ" names
     none, so that entry emits nothing at all, not even a bare place. One
     that DISCLAIMS — secondhandness ("never been but", "I've heard", a
     verdict attributed to someone else: "my wife swears by Papasitos
     version" relays her pick and makes none) or a landing on the downside ("not spectacular but on the cheaper side"
     lands on the price reason) — strips the entry entirely: no food, no
     place, no value word ("cheaper" inside a stripped entry banks no
     `affordable`). Whether an annotation lands on the downside is the
     LANDING TEST, not a word scan: "cheaper BBQ but decent" lands on
     "decent" — above the ordinary, and on another axis than the price
     frame — and that entry BANKS. Each entry is judged on its own
     annotation; one stripped entry never strips its neighbors.
- **A verdict has no minimum eloquence.** "is good", "is great", "love this
  place", "my go-to", "their breakfast tacos are solid" are complete
  endorsements — as complete as a paragraph. Register changes nothing:
  slang, clipped words, and internet markers carry full verdicts ("They got
  some good food, and Margs" vouches the food and the margs; "her tamales
  are truly great … FTW!!!"; "I like the bologna" is a complete dish claim;
  "Bahn MI Galang is above average" is a pick). A short comment is not a
  low-confidence comment; whether a plain word endorses is THE BASELINE
  TEST (A.2), never its length.
- **A reaction to the post has no food subject (A.0, step 2).** "Great
  list!", "You did NYC proud", "Well done" earn nothing and silence nothing:
  the same comment often continues into the writer's own testimony ("Great
  list, my friend! I love La Gran Uruguaya"), and that emits like any other.
  Criticism of the list ("half this list is overrated — but Chivito d'Oro is
  fantastic") is NEGATIVE CONTENT for the criticized entries only. Every
  comment nested below a reaction runs on its own text — a chain of
  compliments can carry a reply full of real picks.
- **Asking for feedback on an experience already had IS testimony.** "2026
  NYC Food Trip Review — how did I do?" reports meals eaten; the question at
  the end does not undo them.
- **AN AFFIRMATION ADOPTS the parent's testimony as the writer's own — a NEW
  claim, emitted FROM THIS SOURCE'S id, polarity included.** The test, not a
  phrase list: **does this reply exist to put the writer's own weight behind
  the parent's claim?** However worded — "+1", "this", "agreed", "Facts",
  "This is the way", "Truth", an emoji of assent — if endorsing the parent is
  what the reply DOES, this writer's judgment becomes its own mention: two
  people vouching is twice the evidence. (An affirmation that RESTATES the
  name is the ANSWER TEST's pick instead.) Under a parent that PANS ("+1 on
  Launderette… no taste in the food") it seconds the pan and emits nothing
  positive. Resolve the referent by the depth-aware order to the nearest
  source that actually NAMES the subject, however many levels up — an
  intermediate reply that itself emitted nothing (a hearsay comment) is not
  the referent and blocks nothing; an ambiguous referent credits nothing.
  **A bare verdict with an unstated subject is the same move**: "God it's so
  good", "obsessed" under a parent describing one unambiguous place adopts
  that referent. The adoption reproduces the parent's endorsement in THIS
  writer's name, SHAPE included: the parent's dish claims adopt as dish
  mentions, and a pick's place-level endorsement adopts as this source's own
  place carrier at `general_praise: true` — an affirmation under a pick
  always emits its own carrier. **Judging another diner's ORDER is dish
  testimony of the same family**: "I see you've ordered the Tio Chon
  enchiladas. Excellent call." certifies THAT DISH from the writer's own
  knowledge ("excellent call", "great choice" are verdicts on the plate).
  When the referent's food fails Step C (a deal frame, an occasion like
  "lunch buffet", no dish at all), the adopted claim is a restaurant-only
  carrier (`general_praise: true`) — a failed dish never cancels the adopted
  endorsement into silence.

### A.2 What is NOT testimony (each of these fails)

- **A PLAN.** The writer has not been yet: "Headed to Austin at the end of the
  month. Here's our short list", "Judge my itinerary", "we plan to split
  things at several of these places". A list of places someone INTENDS to
  visit is a request for testimony, however much it looks like a
  recommendation list — and a shortlist built by BROWSING ("from my list of
  open tabs, these menus stood out to me") is a plan too, however curated:
  reading chose the names, not eating. **This is the single most common
  false positive; check tense and intent before crediting a list.** The
  check cuts both ways: the SAME list shape in the past tense — "just got
  back", "here's what we ate through", "how did we do?" — is a trip REPORT,
  and its entries emit: OFFERING your eaten list as your account is the
  claim. Attendance emits nothing only when stated for another PURPOSE, as a
  credential qualifying an ask ("I've only been to Cuba512"). A plan is one
  subject's act, never the source's genre (A.0): "Always love good sushi.
  Soto and Uchi is a go to." inside a reservations comment vouches for both
  places; "the pepperoni one is really good too" inside scheduling chatter
  is a dish claim; a habitual treat list ("oysters on the half shell,
  lobster bisque, gumbo and étouffée") emits its dishes however long the
  health rider around it.
- **AN ASK.** The request itself never emits. **Every name inside a genuine
  request is part of the QUESTION** — the target ("best Vinnie Special slice
  you've had?"), the benchmark ("on par or better than hey yuet?"), the
  anchor ("birria Landon the best Mexican?") — however admiring the
  phrasing: an ask states what the asker WANTS TO KNOW. Only ANSWERS emit.
  A rhetorical question asks nothing — it asserts — and is judged as the
  verdict it carries (the LANDING TEST's meaning rule). An asker's separate
  clause reporting their OWN past verdict is A.1 testimony as ever.
- **AN ANNOUNCING ACT.** The test: _is the writer ANNOUNCING what exists —
  or ANSWERING, REPORTING, or STEERING?_ Announcing looks like a roster or
  line-up (participants, fundraiser lists, "these 12 spots are doing a prix
  fixe this week"), a list built on an EXTERNAL criterion (open on a holiday
  — "Restaurants Open on Christmas Day"; awarded or ranked by someone else —
  "James Beard semifinalists"; on promotion — "Wingstop has an offer, code
  FREESAMMY"), marketing, the business's own voice, an APPEARANCE post
  ("Tonight's truck …… Birria-Landia !", "look who pulled up" — presence,
  not a verdict, and no exclamation mark makes it one), and a TITLE-ONLY
  CAPTION ("Woodneck Kitchen - The Poor Joe" — a photo labeled with WHAT
  THIS IS). Naming many restaurants neutrally, or one, is not endorsing
  them: emit nothing for the announcing act, and judge any verdict clause
  beside it on its own ("…and it made me so happy", "all amazing" emit
  normally). **The announcing act belongs to the ANNOUNCER — never to a
  diner's answer, however long, categorized, or fact-sheet its phrasing.** A
  diner who answers an ask with a list has NOMINATED every entry: a
  forty-name halal list sorted by cuisine under "any halal recommendations I
  should consider?" is forty picks, each carrying the ask's attribute
  (`halal`) as its fit assertion (Step D); "Loro, eldorado, curras, lenoir
  will accommodate vegans, sway, Elizabeth street cafe, biscuits and groovy
  for brunch…" under a vegan ask is a pick per name, each with `vegan`.
  Existence framing ("There is a food truck called Weird Food at Cboys
  that's open til like 3am", to a late-night ask) is simply how you introduce
  a place the asker doesn't know — a pick; and directions or longevity
  beside a verdict ("Chief's BBQ off of S1st, a good chop house down south,
  it's been there decades") demote nothing. The announcing reading needs the
  announcer's move — the business's voice, an arrival post, a roster, an
  external criterion the text states — never a reply that states facts
  while choosing names. (A volunteer whose own words place the thing in the
  PAST — "used to have a delicious strawberry horchata agua fresca" — is a
  eulogy: the STATUS rules own that sentence, and nothing emits from it.)
- **A FACT ABOUT THE VENUE'S OFFERINGS — run THE VOUCH TEST.** For every
  clause that connects food to a place, named or reached by reference, ask
  ONE question: **if this food were mediocre, would this sentence become
  false?** Still true → a FACT about the world — existence, stock, menu
  presence, variety, format, price, a deal's terms, a schedule, popularity
  ("it's always packed"), business success ("they're doing great") — and it
  emits nothing on its own, whatever verb carries it ("has", "sells",
  "carries", "serves", "does") and however dish-specific the detail. Becomes
  false → a VOUCH, and it emits: a taste verdict, and habitual choice ("I
  usually get the roast duck", "my go-to" — a mediocre dish would not keep
  being chosen; repeated return IS the verdict). A writer's OWN eaten
  account ("I got the duck", "we also ordered the squid" inside an offered
  trip account) is A.1's experience narration, not a stock fact. **A clause
  that fails faces one more question — was it VOLUNTEERED?** A.1's volunteer
  principle and its scope test decide: handed to a WANT as something to go
  get → banks its item; explaining, describing, promoting, or withdrawing →
  silent. A clause that passes has only passed THIS test: it still walks
  Steps B and C — habitual love for a CLOSED place is a eulogy (B.1), and
  habitual procurement from a SHELF is retail (B.2).
  **DEALS — POSTURE decides everything.** Of every deal clause ask: **is the
  writer RECOMMENDING the deal — offering it as a thing for you to go get —
  or REPORTING it — stating its terms as a fact about the world?**
  Recommending looks like praise ("$10 Steak Frites at Justine's happy hour
  — best deal in town!"), habitual choice ("I get the lunch specials — around
  $15 and it's 2 meals for me"), nominating the deal as one's pick, or
  VOLUNTEERING it to a thread that wants one ("One Taco has $2 Al Pastor
  Trompo tacos on Tuesdays", offered to a taco-deals ask). Reporting looks
  like terms dropped unprompted into unrelated chatter ("set lunch is
  ¥1,100, weekdays only" mid-story), a complaint's pricing, the business's
  own promotion, or a correction that WITHDRAWS the thing. **Nobody
  recommends a deal whose food is bad**: a RECOMMENDED deal is food
  testimony with value testimony riding along — its identified offering
  extracts as a dish, as the writer spoke it (`steak frites`, `lunch
  special`, "the Java special" → `java special`), AND the place earns
  `affordable`; a recommended deal that identifies NO dish ("kids eat free",
  "their happy hour deal is unbeatable") is a place mention with `affordable`
  and no dish. A REPORTED deal extracts NOTHING. Ask-context never demotes: a
  deals-seeking thread is where deals get volunteered.
  **Polarity is absolute**: a value word enters only with its own sign.
  "pretty expensive but worth it", "a bit pricey … but IMO well worth it",
  "€25 cocktails, but very much worth it" are praise and never `affordable`,
  however glowing — worth-it praise rides the PLACE carrier; "expensive"
  stated is `expensive`; and a stated CHEAPNESS word ("cheap", "dirt cheap",
  "super affordable") IS the value claim `affordable`, however short the
  clause ("Dirt cheap too" as its own reply asserts `affordable` on its
  referent). Value words ride only claims that pass the PLACE TEST ("Sprouts
  rules!! Fast cheap and organic" praises a STORE'S aisles — B.2 silences
  the whole mention, `affordable` included). A bare nomination has no clause
  to test — the ONE QUESTION (A.1) decides what it endorses; discriminate a
  clause by its own words, never by how much the reply said.
- **HEARSAY, DESIRE, or SPECULATION.** "I've heard", "supposedly", "want to
  try", "would love to try", "been meaning to go", "never been but
  interested" — wanting is not eating, however warm the wanting; hearsay dressed in commitment ("I
  bought a giftcard… I hear it is a very lovely venue" — money spent is not
  food eaten); the writer's own guess about a meal never eaten ("I bet Junes
  All Day does a great burger" — a prediction, not a verdict); and **a
  verdict the writer relays for SOMEONE ELSE — a spouse's, a friend's, a
  neighbor's, or a crowd's number** ("She swears by Papasitos version",
  "They have like 7,600 reviews and a 4.9 rating") — is not this writer's
  testimony, even when it is offered in answer to a rec ask: the test is
  whose mouth the verdict came out of, and relaying another's pick makes
  none. Hearsay
  CONFIRMED by the writer's own visit is testimony as ever ("heard good
  things, finally went — it lived up").
- **SELF-PROMOTION.** A writer with a self-disclosed stake in the place —
  "my shop", "we just launched", "our website", staff speaking for the house
  — is the business's own voice, not word-of-mouth: nothing emits, however
  sincere, and no rule elsewhere rescues it.
- **A VERDICT THAT LANDS AT OR BELOW THE ORDINARY — THE BASELINE TEST.** Ask
  of the landing clause (A.0): **where does this phrase place the food
  relative to the ORDINARY, in the writer's own idiom?** ABOVE it, however
  slightly — "above average", "pretty good", "decent", "not bad at all",
  "solid", "A-" — leans positive when it stands as the whole verdict, and
  emits. AT or BELOW it — "fine", "okay", "aight", "average", "6/10",
  "nothing special", "meh", "mid", "decent for what it is" — withholds
  endorsement: not a positive claim, and nothing emits for that subject. The
  test reads the phrase's relation to the ordinary in the source's own
  language, never a word list — "A okay" and "aight" sit AT the ordinary in
  their idiom; "más que bien" sits above it. One tiebreak for a phrase that
  sits only slightly above: explicitly qualified ("solid enough", "decent
  for what it is") → withholds. Where a clause LANDS — including what a
  mild word does after a contrast marker — is the LANDING TEST's business;
  this test only reads the clause it landed on.
- **NEGATIVE CONTENT.** A subject that landed low or negative (A.0), a
  warning ("I'd skip \_\_\_", "avoid Abbys like the plague"), or a reply to an
  explicitly negative ask ("worst/avoid/overrated"). Emit nothing **for the
  criticized subjects** — and only for them.
- **PRICE-ONLY commentary.** "priciest in town", "a 300 zł steak", "Also
  supremas enchiladas for 11", "6 dollar beers, 18 dollar spritzes" — quoted
  numbers with no value word and no verdict. A fact clause like any other:
  the priced items do not emit, however warm the surrounding clauses.
- **A CLOSED PLACE** — decided in Step B, not here. Testimony about a place
  that no longer exists is real testimony that cannot emit; B.1's PLACE
  STATUS resolves each place once per post object. Nothing about the WRITER
  (tense, nostalgia) decides this.

### A.3 A name is either the SUBJECT or the YARDSTICK

In a ranked, listed, or mixed source, **each restaurant and each dish is its
own subject with its own landing (A.0).** A verdict on one never transfers
to another, and an attribute stated for one never attaches to another. When
the writer weighs options, the endorsement lands on the one they settle on
— **but settling decides PREFERENCE only, and never un-says a verdict
already stated over both**: "I love both but if I had to choose between the
two, El Dorado" vouches for BOTH (a shared verdict, B.1's shared-verb law);
only an option weighed with NO verdict of its own is set aside empty.

**A name in a verdict clause is either the SUBJECT or the YARDSTICK — the
thing measured against — and yardsticks earn nothing, in either
direction.** One law, three costumes: the benchmark inside an ask ("on par
or better than hey yuet?"), the credential list qualifying a judgment of
something else ("I've had all 3 omakase at Otoko, Sushi Bar, and Toshokan —
anyway, here's my review of Craft": those three earn no claims), and the
losing side of a comparison ("enjoyed my meal at J Carvers 100% more than
Jeffreys" — Jeffreys gains nothing and, merely out-measured, loses
nothing). Ask of every name: is the verdict ABOUT this, or measured AGAINST
it? **One asymmetry: which side HOLDS the standard.** When the SUBJECT is
the one found wanting — "did jprime and the price to quality was not there
compared to places like Carvers or even ALC or Three Forks" — the writer
asserts from their own table that the benchmark places DO deliver: each
benchmark emits as this source's own place claim, while the failing subject
earns nothing. **The law has a stop: a writer's own RANKED LIST is not a
yardstick chain** — every entry the writer chose to rank is a SUBJECT. A
source that is positive overall but names a dish neutrally does not thereby
endorse that dish.

### A.4 Outcome

If no subject in this source lands as testimony, **emit nothing and move
on.** Otherwise carry forward the specific claims that passed — not the
whole source.

A source that passes the ANSWER TEST must emit **even though nothing was said
about the food** — the pick is the claim. Silence about quality is not a
failure of the TESTIMONY TEST; it is what an answer to a rec request normally
looks like.

---

## Step B — What place is it? (THE PLACE TEST)

### B.1 Find the names

Gather candidate names from in-scope context in depth-aware order, then decide
each candidate **by how the text uses the span, not by its words.**

**Keep** a span the text frames as the name of a place: proper-noun
capitalization, "The" fronting it as a title, a possessive, a locating tail
("at/on/from \_\_\_"), or a slot in a series of names. Under such a frame the
span denotes a particular establishment, so keep it even when its words are
generic ("The Smith", "Superiority Burger").

**A naming frame needs a name inside it.** A locating tail or definite article
around a bare category noun is a DESCRIPTION of an unnamed venue, not a name:
"the boba shop in 99 ranch market", "the phở stall on Bùi Viện", "the deli
downstairs" describe a place the writer never names. **A branch phrase is
a REFERENCE, never a name**: "the south lamar location", "the one on
Burnet", "their downtown spot" point at a restaurant whose actual name
lives elsewhere in scope — nobody says "the south lamar location" without
the brand being in the conversation. Resolve it through the depth-aware
order to that named restaurant (the claim credits the RESTAURANT;
per-branch identity is not this system's grain), and emit that name with
its source pointer; if no named anchor resolves, the reference is the
unnamed-venue case above. Skip that venue; never
promote the description (or the landmark hosting it) into a restaurant name.
The head must be a proper name for the frame to keep it ("Liberty halal cart"
names; "the halal cart at South Ferry" describes). **And the unnamed
venue CONSUMES its own verdict**: praise of a place the writer never
names ("a place on 34th street … best muffaletta ever") is a complete,
resolved claim about THAT unnamed place — it is spent there and emits
nothing, leaving no free-floating praise. **A HOST VENUE IS NEVER THE
VENDOR'S STAND-IN.** When an unnamed vendor operates at a named landmark,
the verdict is consumed by the vendor and the host earns nothing: "Taco
truck at Hi Sign is fire!" praises a truck, not Hi Sign; "Another
recommendation for the truck at Draught House" nominates a truck, not
the pub; "that lady makes exceptional tamales" outside a hardware store
credits the lady, never the store. **The vendor's DISHES are consumed
with it**: "The taco truck at Oskar Blues is incredible, get the barbacoa"
praises the truck and steers to ITS barbacoa — the host venue serves
neither, and neither the place mention nor the dish may land on the host.
Only a NAMED vendor can carry the claim
(a named truck at a bar emits as itself). **The test for a name: it must
contain at least one token that is neither a category noun nor a
location.** "taco truck at Hi Sign", "the tamale lady outside the Home
Depot", "the halal cart at South Ferry" contain only category words (truck,
lady, cart, tamale, taco) and locations (Hi Sign, the Home Depot, South
Ferry) — DESCRIPTIONS, never `place_observed`: the verdict is spent on the
unnamed vendor and nothing emits. A different place the same
source happens to name still earns only what its OWN clauses say ("even
though I bowled there a lot, only ate at Dart Bowl once" — attendance,
no verdict, nothing emits).

**A one-word shorthand in a list names its referent, not itself.** Locals
clip names: "Vinnie's, Williamsburg Pizza, Best, Smiling, Ben's" uses "Best"
as shorthand for a fuller brand. A series slot alone does not make a bare
generic English word ("Best", "Good", "Place") a canonical name — keep such a
slot only when this input elsewhere shows the fuller form (then emit that
form); otherwise drop ONLY that slot. Every other name in the list, and all
dish/testimony handling, is untouched by this rule. Possessives and
distinctive coinages are real shorthands and stay ("Vinnie's", "Smitty's",
"sho").

**Discard** a span the text uses as a category, dish, or dining format — the
object of a craving, comparison, or description with no naming frame ("just
want good tacos", "love hot pot", "a solid steakhouse"). **A dish phrase is not
a venue** merely because it is capitalized: if a span names a food and carries
no locating tail, possessive, or ordering frame, it is a dish. When a span
could read either way and no naming frame is present, treat it as a descriptor
and discard. **One more naming frame: being the answer.** A bare reply to a
where/which-place ask is answering with a PLACE, because a place is what was
asked for — "Crit Dog" replying to "what's the best option for junk food near
here?" names a venue, even though the words could also read as a dish. The
ask's slot supplies the frame the reply's own words lack.

**A name is never split.** Punctuation INSIDE a name is part of it: slashes
("Uchi/ko"), apostrophes ("Joe's"), hyphens ("Tan-Tan"), periods ("LOS TACOS
No.1"), ampersands ("Rudy's Bar & Grill"). Split only on a separator with
whitespace on BOTH sides, and only when each piece independently reads as a
name — the "&" question is WHAT the "&" joins: parts of one brand, where
one side is a generic word that names nothing alone ("Rudy's Bar &
Grill" — "Grill" is no one's name), or TWO NAMED PLACES, where each side
carries its own brand ("Captain Brad's & Captain Tom's" is two
establishments sharing one verdict — emit both; dropping the second name
of such a pair is the same most-common-miss as dropping it from a comma
series). "Uchi, Uchiko and Suerte" is three names; "Uchi/ko" is one. **A LINE
BREAK is a series separator too** — a reply listing one name per line
("Yafa Deli ⏎ Crispy Burger") is a list of distinct places, each judged on
its own.

**A shared verb covers every name it governs — account for each.** "I would
go out of my way just for La Gran Uruguaya and La Nueva Bakery" vouches for
BOTH places; "Chivito d'Oro nearby is also fantastic" is a third,
self-contained verdict in the same comment. Emitting only the first name of
a coordinated series, or only the first section of a long sectioned comment,
is the most common miss in large threads: count the names the testimony
covers, then emit a mention for each.

**A misspelling is still a name.** Emit it as written after normalization —
resolution happens downstream. But when the writer disclaims the name itself
("some place called Ravi's or whatever it's called"), the reference is too
uncertain to carry: skip it.

Resolve references (pronouns, deictics, definites, ellipsis) to the nearest
viable anchor. A comment with no explicit name may inherit an anchor from
surrounding in-scope text. **If no anchor survives, or two anchors remain
equally likely, stop — never carry ambiguity forward.**

**Oblique reference is not ambiguity.** Ambiguity means TWO DIFFERENT
candidate establishments remain equally likely — never one establishment
referred to indirectly. "their", "her", "that spot", "it", second person
addressed to the venue ("I love y'all and your food so much" — "your
food" is testimony about the venue, not a mere reaction), and branch
plurals ("both locations have always been great" praises the ONE brand,
per the branch rule, holistic verdict intact) all resolve by the
depth-aware order like any reference. When one establishment is the
subject under discussion, the referent is unambiguous — do not demand a
restated name before the verdict counts. (Resolution chooses the
REFERENT only — emission still obeys B.3 exactly, span boundary
included: a source that writes the name emits its own spelling with
B.3's boundaries applied, never a fuller form borrowed from another
source; only a truly nameless source points at the source that names.)

**PLACE STATUS — resolved ONCE per place, for the whole post object.**
Before any claim about a place emits, ask: does the in-scope text state
that this place is GONE? Closure is stated ABOUT AN OBJECT — check what
died: "RIP Uchi Candy Bar" mourns a dish (Gate 2's business, Uchi stays
open); "RIP my wallet" mourns nothing; and a closed BRANCH never closes
the brand ("sad since the one on MLK closed — great tortillas" leaves the
brand open and the praise standing). Stated closure of the place itself
("RIP", "closed down", "went out of business", "closed suddenly") — or a
statement of the place's PRESENT STATE that entails it no longer operates
("now a dilapidated ruin", "it's a parking lot now", "the building sits
empty"; the state IS the closure, no closure verb required) —
including closure reported secondhand ("I heard they closed": closure is
a fact about the world, and crediting a dead place costs more than
missing a live one; a stated reopening overrides) — anywhere in scope — including the frame
of an ask whose selection criterion is that its places are gone ("who
remembers \_\_\_?", "a memorable meal at a place that didn't last long")
— marks the place CLOSED, and NO mention of it emits from any source in
this post object, however warm the words: praise beside a closure is a
eulogy. A place is closed only by a STATED fact about the PLACE — stated by the
text directly, or stated by an ask's own gone-criterion frame (both are
the thread SAYING the place is gone) — never by the writer's own tense
or distance ("I used to live in NYC and would go out of my way just for
\_\_\_" reports a live place from a writer who moved away), and never by
guessing: a place whose status neither the text nor the frame states is
OPEN. A source
that says the place is open again overrides an older closure in the same
scope.

### B.2 Is the claim about food this place serves?

**THE PLACE TEST — one question: was this food SERVED to the writer to
eat, or SOLD to carry away?** Served — made or plated by this place's
kitchen and handed over to be eaten now — is the claim this system exists
for. Sold to carry away — taken from a shelf, a case, a cooler, a freezer,
an aisle, or a product page, to be eaten, cooked, or finished elsewhere — is
RETAIL, and retail earns nothing here: no dish, no ingredients, no place,
**even when the good needs no preparing** (a bottle, a jug of milk, a
packaged bar, a six-pack, a pastry from a grocery's case) and however
lovingly vouched ("their milk is unbeatable", "you can buy it in a case
of 6.. I ship it to my best friend"). A product's brand ("Caymus",
"Fairlife") is never a restaurant.

This is a test on **the claim, not on the venue** — the same business does
both, and the text tells you which:

- **At a STORE, only a counter that SERVES serves.** The hot bar, the food
  court, the taquería or deli counter make food for you, and their claims
  are real ("the food court at 99 Ranch … the youtiao … blown away" banks
  the youtiao). Everything else in the store is stock — the store's own
  bakery and dessert case included ("Central Market pastries or desserts",
  "Whole Foods bakery has been better for everything I've tried" are
  shelf, however good), a bottle found in the cooler, a marinade you cook
  at home. A store praised AS a store ("Ashahi Imports slaps", "Sprouts
  rules!! Fast cheap and organic") is praise of aisles: nothing emits.
- **At a RESTAURANT, what it serves is the kitchen's; a good it sells for
  your pantry is the shelf's.** "Suerte used to sell their masa by the
  pint", a restaurant's bottled sauce, a bakery's take-home starter, a
  yogurt maker's tubs "for farmer's market pickup and carried around town"
  are retail, however beloved — the mirror image of the store's counter.

A good the writer finishes or cooks AT HOME is the shelf's, however proud
the result ("I've made killer pizzas with that HEB dough" claims the
writer's kitchen, not H-E-B's). **Read served-or-sold, never the kind of
business.**

**MODE is a fact about the GOOD, resolved through the depth-aware order
like any referent — a reply inherits the mode of the thing the thread
is discussing.** When the post's subject is a packaged at-home product
("Has anyone tried HEB Mi Tienda Al Pastor marinaded pork? The stuff
that you cook at home"), a reply praising that product or its shelf
siblings ("Not a fan of the al pastor. I do enjoy the beef fajitas
though") is praising something the WRITER'S grill finished — shelf, and
nothing emits, however warm or however salvage-shaped ("not X, but I do
enjoy Y") the praise reads: a conceded-upward verdict changes the
verdict's direction, never the good's mode. A reply escapes the
inherited mode only when its own words place its food in a served
context (the taquería counter, "their cafe's tortas").

**An ANSWER-TEST pick inherits the ask's MODE** (A.1's ONE QUESTION, shelf
errand): a bare name under a shop-or-good ask makes the claim the ask
requested — goods carried home — and fails this test, whoever's kitchen is
on the sign ("Mother culture is great!" under a yogurt ask praises a
producer of tubs). A shelf ask's food words are never inherited either: no
item ("meat", "masa", "yogurt") banks from a shelf pick.

Also fails the PLACE TEST: a venue whose business is not serving food,
where the food is incidental and unserved by them (a stadium, a hotel, a
hardware store) — UNLESS the claim is about food that venue itself prepared
and served. When the text names a landmark and a vendor inside it, the
claim belongs to the vendor (B.1's host-venue law: an UNNAMED vendor
consumes it, and the landmark earns nothing).

### B.3 Emit the name as this source wrote it

**Each mention emits the name AS WRITTEN in one specific source, and names
WHERE it read it.** There is no choosing, no unifying, and no "canonical
name" to maintain: two comments spelling the same place differently produce
two mentions with two different name strings, and that is correct — deciding
whether two spellings are the same establishment is another system's job,
done downstream with an audit trail. Your job is a faithful transcript.

- **`place_observed`** is the name span exactly as this source's text wrote
  it (after the mechanical normalization below). Never synthesize or expand
  a name with tokens absent from that source, never contract one into an
  acronym or initialism the text does not use, and **never substitute a
  name used elsewhere in the thread** — a one-off mention of "Luckys" in a
  thread full of "Lefty's" emits `luckys`, full stop. If the string you are
  about to emit does not appear in the source you are citing (or in the
  fuller-form source you cite for a shorthand — below), you have invented
  it: stop and re-read.
- **`place_source_id`** is the id of the source whose text contains the
  span you emitted. Usually it equals `source_id` (the claim and the name
  come from the same comment). It differs in exactly two licensed cases:
  a reference resolved through the depth-aware order (a "+1" or "it's so
  good" inherits its referent — point at the source that NAMES the place),
  and B.1's shorthand rule (a clipped slot like "Best" emits the fuller
  brand form — point at the source where the fuller form appears).

**The span's boundary follows the text's own framing (B.1), not your
knowledge of the brand.** Brand tokens as written are the name ("Lefty's
Pizza Kitchen", "Violet Crown Wine Bar & Coffee Shop"). Only two things
sit OUTSIDE the span: a PREPOSITIONAL locating tail ("in FiDi", "in
Westlake", "on 5th" — grammar locating the place, not naming it), and a
lowercase category word the writer appended as description ("Baldinucci
pizza" — the pizza is what Baldinucci makes, not what it is named; when
the writer capitalizes it as part of the brand, "Williamsburg Pizza", it
IS the name). A bare trailing area or city tag welded onto the name
("Momoya soho", "Au Cheval NYC") stays IN the span, whatever its
capitalization — emit it as written; a downstream normalizer owns
branch-tag handling, never you. One override outranks capitalization:

- **A capitalized bare generic English word in a list slot is a
  shorthand, never a brand** ("Vinnie's, Williamsburg Pizza, Best,
  Smiling, Ben's"): B.1's shorthand rule governs — emit the fuller
  observed form from this input (citing its source) or drop that slot.
  From that example list, `vinnie's`, `williamsburg pizza`, and `ben's`
  emit; "Best" and "Smiling" emit NOTHING unless this input elsewhere
  writes their fuller brand names. Capitalization in a name series is how
  lists are written; it proves nothing.

**Your world knowledge of the establishment is off-limits here.** You will
often RECOGNIZE the place and know its fuller real-world name or its correct
spelling. Do not use it: "Minetta" stays `minetta` even when you know it is
Minetta Tavern; "sho" stays `sho`; a misspelled name stays as the writer
spelled it. Completing or correcting a name mis-resolves it downstream —
emission records what was OBSERVED; resolution to the real place is another
system's job. **Both directions of "fixing" are forbidden.** Never repair a
typo toward the real-world name ("Dominic Ansel" stays `dominic ansel`,
"Switf's" stays `switf's` — even when you know who is meant), and never
strip letters the writer DID write (the normalize rule below: diacritics
are identity). A typo is not yours to correct; an accent is not yours to
remove.

Normalize:

Normalization is MECHANICAL — the only changes you may make to the span:

- Lowercase everything — but **keep every letter as the writer spelled it,
  diacritics included** ("Phở Lệ" → `phở lệ`, never `pho le`): accent marks
  are identity, and stripping them fuses different names downstream.
- Collapse repeated whitespace; trim.
- Keep the writer's punctuation as written — apostrophes, "&", periods are
  part of the observed form: "Joe's Pizza" → `joe's pizza`; "Pho & Co." →
  `pho & co.`.
- **Strip a possessive clitic used to attach the name to a dish**: "Nixta's
  duck carnitas tacos are crispy" is about a place written "Nixta" — the
  `'s` is this sentence's grammar, not the name. A possessive that IS the
  brand as written stays: "Adrienne's in FiDi" → `adrienne's`.
- Preserve multi-word ordering as written.

Repeated references to the same place WITHIN one source still collapse to
one mention per (restaurant, food) pair (F.2) — use the span as this
source wrote it. Across sources, emit each source's own spelling; never
carry one source's spelling into another's mention.

Never emit placeholders ("unknown restaurant", "that place") or a partial name
with no brand token. A bare generic English word kept from a list slot (B.1's
shorthand rule) is a partial name under this law — if no fuller observed form
completes it, it must not survive to output.

Examples: "Franklin BBQ" → `franklin bbq`; "The Smith" → `the smith`; "Joe's
Pizza" → `joe's pizza`; "Pho & Co." → `pho & co.`.

---

## Step C — What was ordered? (THE ORDER TEST)

**Compose the dish BEFORE extracting any properties.** A modifier can only be
judged once you know what it was modifying; peeling first is what turns
"lighter than Jets" into a property called "light".

### C.1 Is there a dish at all?

Find the food language of THE CLAUSES THAT PASSED STEP A — a clause that
earned nothing contributes no food, however much it names (Step A passes
clauses, never whole sources; C inherits exactly that scoping) — and walk
it through three gates, in order. The venue's name is never food language: praising the truck
"Birria-Landia" praises no dish called "birria"; "Ramen Del Barrio" names
no ramen claim.

**Gate 1 — THE OFFERING TEST.** **A NAMED OFFERING YOU COULD ORDER is a
dish. You ORDER an omakase; you ATTEND brunch.** The selecting question:
**does this phrase NAME the thing the writer ordered — or does it price
the offering, name the occasion around it, sit inside it as an included
part, or staple separately-named foods together?** Ask it of the phrase
as the clause USES it, and route to exactly one arm:

- **NAMES the offering → a DISH, emitted AS SPOKEN.** Three name shapes,
  one law. Food words ("steak combo", "seafood lunch special", "salmon
  omakase", "sake pairing"); a FORMAT that is itself the offering a diner
  orders by name — "omakase", "tasting menu", "chef's tasting", "prix
  fixe", "thali", "kaiseki", "executive lunch", "dim sum" (usually a
  FAMILY, `is_menu_item: false`, Step E); and a PROPER NAME that fixes
  one menu offering ("the Elvis Presley combo" emits `elvis presley
combo`, "the Hangover Special" → `hangover special`; the article stays
  behind — and when the house coined the offering's name out of its OWN
  name-token, the token is part of the coinage and stays: "the Java
  special" at Cafe Java emits `java special`; only ATTRIBUTIVE grammar
  locating food at a venue — "the Suerte tacos" — is the
  venue-name-never-food-language shape, C.1). **The words need not predict the plate**: two diners ordering
  "the chef's tasting" are handed the same offering — the menu supplies
  what the words don't, exactly as it does for the Elvis Presley combo.
  Whether the words predict the plate matters to no field at all: the
  dish exists, and what broader classes it rolls up into is derived
  downstream from its name (C.3). Emit the phrase a diner would say to
  the server — "steak combo", never a stripped "steak". Praising the
  offering AS an experience is a taste verdict on the offering — "I had
  the kaiseki style omakase, which truly was an amazing experience" is
  a standard eaten-and-judged review, and the dish is `kaiseki style
  omakase`; "experience" wording never demotes an ordered offering to
  an occasion.
  **A bare format word is often a PRO-FORM.** When "the combo", "the
  special", "that plate" points at a MORE SPECIFIC offering already
  named for the SAME restaurant in scope ("I had the Khao Man Gai combo…
  the combo is the best of both worlds"), it is a pro-form of that
  offering — resolve it by the depth-aware order and emit the specific
  name (`khao man gai combo`), one dish, exactly as C.2 resolves "the
  mushroom based one". With no more specific antecedent, the bare word
  stands as its own generic dish ("their omakase is incredible" →
  `omakase`; "I got the combo" alone → `combo`).
- **PRICES the offering → A.2's POSTURE rule decides.** When the clause
  QUOTES THE TERMS of a deal — a price, a schedule, a
  contents-inventory — ask A.2's one deal question, CLAUSE BY CLAUSE:
  recommending, or reporting? **REPORTING extracts nothing**: terms
  dropped unprompted mid-chatter, a complaint's pricing, a promo — no
  dish, no `affordable`, no praise, however dish-specific the detail.
  **RECOMMENDING — praise, habit, nomination, or VOLUNTEERING the deal
  to a thread that wants one — routes back to the
  dish arm**: the recommended deal's identified offering is the dish,
  as the writer spoke it — "$10 Steak Frites … best deal in town!" →
  `steak frites`; "great weekday lunch special - 2 tacos, rice y
  beans, iced tea like $10" → `lunch special`; "the Java special … at
  $9.50 is probably the best breakfast deal in town" → `java special`;
  habitual choice ("I get the lunch specials — 2 meals for me") is
  recommendation posture too, and so is a personal value verdict ("the
  full churrasco lunch is a good deal to me" → `churrasco lunch`) —
  the place earns `affordable` beside the dish. One comment can do
  both — "Estancia has Executive lunches starting at $21 … The full
  churrasco Lunch experience is a good deal to me" reports the first
  deal's terms (nothing) and recommends the second (dish +
  `affordable`): judge each clause's own posture. A taste verdict
  on the offering was never a deal question at all ("the tasting menu
  was extraordinary", "el menú del día sale 12 euros y está buenísimo"
  — the food is judged; emit the offering, price ignored). Two shapes
  identify NO dish even when recommended, and yield `affordable`
  alone: a price/count FRAME where the number or count is the whole
  name ("the €25 combo", "2 item combo", "3-course menu" — a quantity
  structure, not an offering), and a deal whose terms name no food
  ("kids eat free", "their happy hour deal"). A MENU-word wrapper is
  the same no-dish shape: "the lunch menu", "thực đơn trưa" name the
  DOCUMENT the offerings live on, not an order — a recommended
  menu-price deal yields `affordable` and no dish ("Thực đơn trưa của
  họ tầm 150k … quá đáng tiền" → place + `affordable`), while an
  offering word ("lunch special", "set lunch", "menú del día" — a
  thing a diner asks for by that name) is the dish arm's as ever. Foods DESCRIBED inside
  the deal are judged by the clause law like any other words: an
  enumeration that only prices or lists ("2 tacos, rice y beans, iced
  tea like $10") stays the deal's contents-inventory and claims
  nothing — but a writer who ate SERVED contents and judges them
  ("got the 2 item combo with brisket and sausage — the sausage was
  incredible") makes normal dish claims with those foods. B.2's mode
  still governs: a grocery haul is eaten too, but it was never
  SERVED — packaged goods stay out however enthusiastically consumed.
- **NAMES the occasion AROUND the food → never a dish.** "brunch",
  "happy hour", "lunch", "dinner", a "lunch buffet" name a time or
  spread you ATTEND, not a thing
  you order — however warmly praised ("their brunch is the best in
  town" praises the place at brunch; a praised lunch buffet — and any
  verdict adopting it — yields a restaurant-only carrier for the place
  as written, never a `buffet` dish). The occasion lands as a
  `place_attributes` entry per Step D ("great happy hour", "brunch");
  the mention is restaurant-only unless a real dish is also named.
- **SITS INSIDE the offering → part, never a dish.** "Your choice of
  meat", "you pick two sides", the unlimited salad bar included with the
  executive lunch are SLOTS of the offering the diner ordered — the
  offering is the dish; its included parts are never their own claims
  (never an `item`) unless the writer ate one and
  judged it in its own clause (the consumed-contents law above).
- **STAPLES separately-named foods → each food is its own claim.**
  "Combo" (or "pairing", "duo") here isn't a menu phrase at all — it is the writer's own COMMENTARY on
  things they combined: "buffalo cauliflower wings and a vanilla
  milkshake — my favorite combo at Alamo", "beer & shot combo", "half a
  Rueben and a cup of French onion soup lunch combo", even two venues
  ("Swift's Attic then Elephant Room, always a good combo"). The tell:
  the combined things are named separately and the combo word just
  staples them. Emit the FOODS as their own claims — each judged
  normally, which includes A.2's arms: an enumeration that only PRICES
  its items ("6 dollar beers, 18 dollar spritzes") emits none of them,
  however warm the surrounding rec. Nothing named "combo" exists, and
  two venues paired this way are two place mentions at most.

**Gate 2 — THE ORDER TEST.** _Could you say this to a server as the thing
you want to order?_ Anything orderable is a dish, drinks included — an
espresso or a cocktail exactly like a taco. **And it must still EXIST — DISH STATUS, resolved once
per dish per post object, the exact mirror of B.1's PLACE STATUS.** The
test is TEMPORAL, asked of the text, not of the writer's warmth: **where
does this text place the DISH — in the venue's PRESENT, or only in its
PAST?** The tense of the EATING is never the tense of the dish: meals
are always narrated in the past ("had the cod and it's good", "went
last week — the ramen was perfect" report live dishes), so a past-tense
verb about a meal says nothing. What places the DISH ITSELF in the past
is availability language: "used to have/make/serve", "back when they
had", verbed removal ("took it off the menu", "replaced it",
"discontinued"), mourning ("RIP the shake"), a wish for restoration
("hopefully they'll bring it back" — you only bring back what is gone),
and a one-time offering from a past occasion ("did one over
Thanksgiving break one year" — a dish that existed for one bygone
window is in the past, however dreamed-about since). Any of these,
anywhere in scope, marks that dish DEAD, and no clause about it emits.
**A loved-but-gone dish earns NOTHING — not a live dish, not a place
carrier: memory never outranks a stated ending**, and the vividness of
the memory ("so freaking amazing. i dream about it still") is exactly
what makes this trap — vivid praise is how eulogies read. (The
restaurant is untouched: a dead dish is not a closed place, and the
same source's claims about LIVE food emit normally.) A dish the text
places in the present — "has", "serves", "still on the menu", an
ordering-idiom "off the menu" ("I enjoy several things off the menu" is
a live dish being eaten) — is ALIVE, and a stated return overrides an
older ending. Failing by definition:

- wanting-anything words — "food", "a meal", "the food here", "drinks"/"a
  drink" bare — name the desire to eat or drink, not a thing the server
  could bring (a NAMED drink, "espresso", "margarita", is a dish as ever);
- traditions and styles, however modified — "great Indian place", "red
  sauce italian food", bare "BBQ" (a tradition, not an order — "serves
  BBQ" banks nothing, while "brisket" or "bbq ribs" name orders) name
  no order (irreducible "comfort food" is the
  exception: carry it whole to Step D, where it is a style attribute);
- a when-word praised holistically — "Dinner is super solid there" names
  a clock, not an order;
- the kind of place it is — a cocktail bar does not thereby serve a dish
  called "cocktail".

What fails here is not lost: the cuisine or style lands in Step D as an
attribute where it describes.

**Gate 3 — THE VERDICT: a dish is born only from a vouching clause.**
Something survived Gates 1–2 AND its clause passed Step A → compose it in
C.2. Food language in a clause that earned nothing — a price complaint
("$30 for a medium pizza", "the salt and pepper banh mi is $18 where I
could happily get one for $10 at NG Cafe" — the named item is priced
and complained about, never vouched, and births no dish at the
complained-about place however specifically it is named; and the
cheaper alternative is a VALUE yardstick, not an eaten account —
"could happily get" is subjunctive terms-quoting, so the alternative
place may earn `affordable` at most, per A.3's failed-against law in
the value domain, and its banh mi is priced, not vouched: no dish on
EITHER side), a pan ("no flavor at all"), an UNPROMPTED deal or
availability aside ("half off oysters on Wednesdays" dropped
mid-story — a source VOLUNTEERED to a thread that wants the thing
banks its item instead, A.1's volunteer principle), narration or a
receipt, a photo reaction ("this LOOKS great") — names food and births
NO dish: the clause's verdict is what a dish is made of, and that clause
has none. **And a verdict
binds to its own subject — resolved, not borrowed.** Resolution is
untouched: a verdict clause's pronoun or elliptical subject resolves by
the depth-aware order, including into a neighboring availability clause
("has cod for their fish n chips and it's good" — "it" IS the fish n
chips, and the verdict makes that dish; "their tacos have no business
being as good as they are" is a `taco` claim as ever). What a verdict
never does is MIGRATE to a subject it doesn't have: "Most cocktails
were solid. One was a little unbalanced" judges cocktails at large —
it never retro-specifies onto "Ramos gin fizz", a name appearing only
inside operations narration ("…drink mixers to speed up the Ramos gin
fizz prep", a complaint about pace). Marrying a category verdict to a
narrated name invents a claim the writer never made: no `ramos gin
fizz` dish exists there — that category verdict is holistic and mixed,
and it lands (or fails) at the place level per A.2 and F.1. Nothing
survived → the mention is restaurant-only (a PLACE mention, no dish
fields — F.2) — with ONE inheritance, defined here and only here. **AN
UNQUALIFIED PICK** — a source that passes the TESTIMONY TEST while
answering a dish-targeted ask (by bare name or with its own verdict
words, "Desano and Homeslice are all great"), and whose own text neither
names food nor hedges/re-scopes the pick — inherits the ASK's food
language: the ask's dish PHRASE, as the asker
composed it, walks these same gates, C.2, and Step D exactly as if this
source had written it — "best burger in EV?" → `burger`; "crispy
shoestring fries?" → `shoestring fry` with `crispy` peeling into
`item_attributes` by D's normal tests; and in the asker's own spelling
("Best pho in Austin?" bequeaths `pho`, never a restored "phở" — C.2's
as-written law reads the asker's letters here). WHO inherits is the only gate:
only an unqualified pick — a reply that hedges or re-scopes the ask's
terms ("ask them to fry it twice") inherits none of them, and a DEAL
answer never needs inheritance: it carries its own words, so A.2's
posture rule owns it outright — a RECOMMENDED deal's dish comes from
the deal's own identified offering (Gate 1), a reported deal emits
nothing, and neither borrows the ask's dish phrase — and
an ask whose food language fails the gates inherits nothing: "craving red
sauce italian food" targets no orderable dish. Two boundary shapes:
a dish wrapped in a venue type is still a DISH ask ("best burger joint?",
"quán phở nào ngon nhất?" — the dish inside the wrapper, `burger`/`phở`,
passes the gates and inherits; the reply's restaurant name containing the
same word changes nothing); a cuisine or style ask ("best Indian
around?") FAILS the ORDER TEST — no dish inherits,
the food slots stay empty, and the cuisine reaches the pick only as Step
D's place-side fit assertion. (`is_menu_item` stays false for anything
inherited — Step E.)

### C.2 Build the order-name

1. **Anchor the head dish noun phrase** — the chunk a diner would speak. When a
   phrase ends in a generic classifier (wrap, taco, sandwich, roll, burger,
   pasta, soup, salad, pizza, bowl, plate, noodle, dumpling, bao, bun, fry,
   sando, arepa …), keep it attached for now. When the specifier trails the
   head ("pho tai", "ramen abura soba"), keep the head noun inside the phrase.

2. **Keep every word that names the order.** The governing question: **would
   two diners each ordering "the X" be handed the same thing?** If dropping a
   word would leave the diner needing to specify again, the word STAYS.
   - "fried chicken sandwich" — the whole phrase names the order; keep it all.
   - "carnitas taco", "tonkotsu ramen", "duck carnitas taco" — the specifier
     changes what arrives; keep it.
   - "breakfast taco" — a different order from "a taco"; **never** peel the
     word out. "thin crust pizza" is the
     same shape: ordering "the thin crust pizza" and "the pizza" are
     different orders, so the style words STAY in the dish name — a style
     word inside an order-name is never peeled off into an attribute (and
     "thin" alone would fail the STANDALONE TEST anyway).
   - **"chef's tasting", "executive lunch"** — two diners ordering these
     are handed the same offering; the whole phrase names the order (Gate
     1's dish arm). The sameness question decides which WORDS of a dish
     name to keep; it never rescues a phrase Gate 1 refused — a
     price/count frame ("the €25 combo", "3-course menu"), an occasion
     ("brunch"), or a reported deal never became a dish, and no amount
     of word-keeping makes one.
   - "grilled burger" — the same order as "burger"; "grilled" is a property and
     will be handled in Step D. "good taco" orders a taco — an evaluative
     word is the writer's verdict, never a dish token and never a property.

3. **Drop additive components.** For "with/and" clauses, keep the core dish as
   `item`; the listed items are components of this dish, not dishes of
   their own. They may be recorded in `ingredients` (C.5).

4. **Sanity-check.** Is the phrase you composed the NAME of one offering,
   or is a word of commentary — the writer's verdict, a comparison,
   narration — still stuck to it? Peel such words one at a time, keeping
   the head noun; judge the WORDS as spoken, never menus you remember. If
   you end with a lone ingredient, keep the broader dish instead — a lone
   ingredient is not a dish. When the source names NO broader dish ("Love
   their rice"), there is no dish at all: the mention is restaurant-only.
   - **A coherent name is NOT sufficient.** Re-run Gate 1's OFFERING
     TEST on the phrase you just composed: an offering you could order
     stays as spoken ("chicken special", "nigiri special", "chef's
     tasting" — a thing the writer ordered by this name); a price/count
     frame or an occasion heading emits no dish ("Happy Hour Deal",
     "3-Course Menu", "game day deal" — the deal or the clock, not the
     order).

5. **Normalize**: lowercase; use the natural singular ("taco", not "tacos";
   but keep "noodles" where the singular is awkward); minimal punctuation.
   **Never reorder tokens** — emit the word order the source used — and keep
   every letter as the writer spelled it, diacritics included ("phở", never
   "pho", when the source wrote the marks). **Dish names obey the same as-written law as
   place names (B.3)**: emit the words the source wrote — "cevichi"
   stays `cevichi`, never "corrected" to ceviche, and never a different
   word ("crudo" is not "steamed") — and NEVER TRANSLATED: the source's
   own language is the observed form ("lemonade" never becomes
   `limonada`, "phở" never "noodle soup", in either direction) — a
   downstream judge unifies variants
   of the same dish; your transcript is its evidence. Strip only menu
   bookkeeping ("seafood boil combo #5" — the "#5" numbers the menu, not
   the food). A pro-form is not a name: "the mushroom based one" resolves
   to the dish it points at or emits nothing.

**Never PEEL a phrase down to a bare structure word**: "get the sake
pairing" is a dish AS SPOKEN (`sake pairing` — the offering the writer
orders, Gate 1's dish arm); peeled to bare `pairing` it names no
offering and is never an order-name. **And a venue's name is never part
of an order-name**: "Don't miss the Suerte tacos" orders tacos AT
Suerte — `taco`, never `suerte taco` (C.1: the venue's name is never
food language).

**Never emit a truncated or abbreviated food token.** If a word is cut short
("jap" for jalapeño), write the full word or drop it. A truncated token can
land on an unintended and offensive word.

### C.3 The order-name is the whole deliverable

The name you composed in C.2 is the finished dish claim. **What broader
classes a dish rolls up into — that a "carnitas taco" is a taco, a
"croissant" a pastry — is a fact about the dish CONCEPT, not about this
mention**: it is stamped downstream, once per dish, by another system
working from the exact name you emitted (the same delegation as a dish's
cuisine, D.4). Nothing here asks you for it, so there is nothing to
peel, roll up, or classify — re-deriving it per mention is how the same
dish came to disagree with itself across sources.

Your name IS that system's entire input. That is why C.2's laws carry
the weight they do: every word kept as spoken ("breakfast taco", never a
peeled "taco"), nothing corrected, nothing reordered — the downstream
derivation can only be as faithful as the name it reads.

### C.4 One dish per connection

Each restaurant→food connection is ONE composed dish. Never emit separate
mentions for component ingredients or related nouns. Two restaurants praised
for the same dish produce two entries with identical `item` and distinct
restaurants.

### C.5 Ingredients

`ingredients` is a TRANSCRIPT, not a description: you are quoting the
writer, never annotating the dish. **The field asks what the source
WROTE, and you answer by READING — the moment you find yourself KNOWING
an ingredient instead of reading it, the answer is `[]`.** What a rib is
made of, what goes in a fritter, what a mole contains — real knowledge,
and none of it is this writer's claim: "the ribs were incredible" names
NO `pork`, ever. Two sources only:

1. Additive clauses: "pasta **with burrata, chanterelles, and pesto**" →
   `["burrata", "chanterelle", "pesto"]`; "banh mi **with fermented crab
   paste**" → `["crab paste"]` — singularized, never expanded (no
   synthesized "mushroom").
2. Ingredient nouns inside the dish name: "gruyere popover" → `["gruyere"]`.

**An ingredient is the NAME of a substance, and the name is as long as
the source made it.** "Crab paste", "fish sauce", "brown butter" each
name ONE substance, kept whole — shortened, each word names a DIFFERENT
substance ("crab" is an animal; the writer wrote about a paste). Only a
preparation participle in front may fall away ("fermented crab paste" →
`crab paste`); the substance's own name is never trimmed.

**Never add ingredients from your own knowledge**: "al pastor taco" → `[]`
unless the source names contents. **And the ingredient is the WORD THE
SOURCE WROTE — the same as-written law as names (B.3)**: "fermented crab"
never becomes `salted crab`, "peach tea glazed" contains no `tea leaf`,
"coq au vin" is a dish name, not a claim that wine is in your glass —
if the noun you are about to write does not appear in the source, you
inferred it: drop it. Singular, lowercase. An empty list is the
expected output for most mentions.

---

## Step D — What is left over? (THE STANDALONE TEST)

Only now, with the order-name settled, look at what remains — and for a
bare pick answering a constrained ask, the ask's venue-level constraint
words ARE what remains (the fit assertion below). Every candidate must
clear two bars to become an attribute.

**Attributes are PREDICATES, and predicates come only from THIS source's own
words.** Surrounding context — the ask, parent comments, siblings — resolves
the SUBJECTS of a claim (which place, which dish; Steps B and E); it never
supplies what is CLAIMED about them. One choice speaks: **an unqualified
pick answering a constrained ask asserts fit** — the ask's VENUE-level
constraint words ("romantic", "cheap", "outdoor seating", a cuisine like
"mexican") are that pick's own claim, walking D.1/D.2 like any stated
word: the answerer chose this place BECAUSE it fits what was asked, and
that choice vouches for the fit. **The ask a pick answers is found by
the depth-aware order**: a pick replying to an intermediate comment
(a clarifying question, a sub-thread) still answers the post's ask and
inherits its constraint words, unless the intermediate comment
re-framed the question into a different one. **FIT IS A QUOTATION, NEVER
A PARAPHRASE**: a fit-asserted word is a word the ASK WROTE (or its
canonical spelling, D.5). A constraint you INFER from the ask's situation
asserts nothing — "My parents (in their late 50s) are visiting … suggest
places" writes no `family-friendly`, and a pick under it carries none;
"my sister is vegan" writes `vegan`, and a pick under it carries it. **A
deal answered to a value-seeking ask is A.2's posture rule, not a fit
assertion**: recommended → its identified dish plus `affordable`; reported
→ nothing. A re-scoping annotation blocks the word it re-scopes ("great
but pricey" blocks "cheap"), an off-axis answer that pushes back on the
ask's frame asserts nothing from it, and the ask itself still emits
nothing. Fit-asserted words land on the PLACE side —
"Best Indian around?" → "Ravi Kabab, hands down" carries `indian` in
`place_attributes`, never in a food slot — the ask constrained the
venue, and its dish words are SUBJECTS handled by C.1 Gate 3, never
attributes. Before any other word enters an attribute
array, point to the words of this source that state it. A parent's words, the
venue's own name, and your knowledge of the venue are never this source's
words. **An empty attribute array is the normal output for a pick
answering an unconstrained ask.**

**A NAME IS A SUBJECT-IDENTIFIER, NEVER EVIDENCE OF A PROPERTY.** Words
spent NAMING are not words DESCRIBING. The tokens inside a venue's name —
"Cuantas Hamburguesas", "4 Charles Prime Rib", "Phoenicia bakery and deli",
"p Thais" — do appear in this source's text, but the source used them to say
WHICH place, not WHAT the place is like: they license no cuisine, no venue
type, no attribute of any kind, on either side. (C.1 makes the same point
for dishes: praising "Birria-Landia" names no birria.) A property enters an
attribute array only when the source's DESCRIBING words state it — or via
a fit-asserting pick's ask constraints (this step's opening rule).

### D.1 Does it describe, or does it judge?

**A real attribute states a property the food or place objectively HAS. Praise
states HOW GOOD it is.** Only descriptions are attributes — with ONE
principled conversion: **praise OF A NAMED ASPECT becomes that aspect's
strength**, exactly as praised price already becomes `affordable` — "the
atmosphere is killer" → `great atmosphere`, "fabulous decor" → `great
decor`, "service was flawless" → `great service`: a diner filtering for
atmosphere wants exactly the places whose atmosphere people praise. The
emitted term is always `great` + the aspect's plainest common noun, ONE
spelling per aspect — the writer's synonym or spelling folds into it
("ambience", "ambiance", "the vibe" → `great atmosphere`; praised
price → `affordable`), because each spelling would otherwise become its
own unsearchable entity. The fold renames only the ASPECT noun inside
this praise conversion — a DESCRIBING word stays itself: "romantic
ambiance", stated or fit-asserted from an ask, asserts `romantic`,
never `great atmosphere`. **And the fold changes SPELLING, never
SUBSTANCE: a stated property is never mapped onto a DIFFERENT nearby
property to reach a familiar term.** "The strongest frozen margs …
you'll be fully toasted" states alcohol strength — it is not `spicy`,
and no vocabulary of familiar attributes licenses the swap; if the
property the writer stated fails D.2's STANDALONE TEST on its own
word, it drops entirely rather than shape-shifting into one that
passes.
Whole-thing praise with no aspect ("amazing", "delicious", "iconic")
still converts to nothing — it has no aspect to strengthen, and it is
already the claim's endorsement.

- `spicy`, `crispy`, `smoky`, `grilled`, `vegan`, `cozy`, `outdoor seating`,
  `indian`, `comfort food` → describe → attributes. (`indian` here is a
  word the source WROTE — a cuisine word reaches Step D only as this
  source's own describing words. Recognizing the tradition yourself
  puts NO word on the table: an In-N-Out burger carries no `american`,
  a taco truck no `mexican` — the word was never written, so there is
  nothing to route, to EITHER side; the dish's tradition is derived
  downstream from the name you already emitted. Stamping the venue's
  identity into `item_attributes` is the recurring failure this
  parenthesis exists to kill.)
- `delicious`, `flavorful`, `iconic`, `worth the trip` — and every word
  of their kind, however novel ("elite", "hidden gem", "seasoned
  perfectly") → judge → **NOT attributes. Drop them.** ("flavorful" is
  the recurring offender: it feels descriptive and only ever judges.)
- The test: **could the same word describe a BAD dish?** "spicy" yes (a dish
  can be badly spicy) → attribute. "delicious" no → praise, drop.
- The very praise that made this source eligible in Step A is what feeds
  `general_praise` in Step F. It must NOT also become an attribute.

### D.2 THE STANDALONE TEST

**Severed from the noun it modified, does this word still mean one definite
thing a diner could filter by?**

- **PASSES**: `gluten free`, `spicy`, `smoky`, `crispy`, `vegan`, `patio`,
  `counter service`, `byob`. Each means the same thing wherever it lands.
- **FAILS**: `rich`, `light`, `strong`, `authentic` — and their whole kind
  (`thin`, `old school`, `filling`, …). A **strong drink**, a **strong
  roast**, and a **strong flavor** diverge the same way light does. A **light roast**, a **light marinara**, and a
  **light meal** are three unrelated senses; separated from its noun the word
  asserts nothing and two readers will not agree what it claims. **Drop it.**

This is not a word list to memorize — it is a test to run. New words appear
constantly; run the test rather than matching the examples.

Two consequences follow directly:

- **A COMPARISON IS NEVER A PROPERTY.** "Really great Roman style pizza,
  LIGHTER THAN Jets or 313" asserts a relation to two other pizzerias, not a
  property of this pizza. Emit nothing from it.
- **A CONTEXT-STRIPPED FRAGMENT IS NEVER A PROPERTY.** "medium", "regular",
  "classic service", "frozen", "sat only" — if you cannot say what it filters
  by without guessing, drop it.
- **When a word is part of the order-name, it already rode into `item` in Step
  C** and must not also appear as an attribute. "classic banh mi" on a menu is
  a dish name, not a dish plus a property.

### D.3 Other things that are not attributes

- **Ingredients and ingredient-bound phrases.** A bare ingredient ("mayo",
  "basil") or a property welded to a component ("brown butter", "vodka sauce",
  "toasted garlic", "thick layers") describes this dish's makeup → it belongs
  in composition (Step C), not an attribute. Dietary and sourcing CLAIMS stay
  attributes ("vegan", "gluten free", "organic", "grass-fed") — diners filter
  by them.
- **Dish roles and courses** as menu positions ("side", "main", "palette
  cleanser") — not properties of the food.
- **Complaints.** The app recommends, so attributes are things a diner filters
  FOR. Drop "grumpy staff", "overpriced", "too loud", "rushed". Keep neutral
  states phrased as negations ("not crowded", "no wait", "cash only").
- **Over-specific single-use phrases.** An attribute must be reusable across
  many dishes or places. Strip "63rd floor roof bar" to "rooftop", "basted in
  herby butter" to nothing.
- **Anything Gate 1 calls an offering is never an attribute, on either
  side.** One split, decided by the same law that governs Step C:
  - An ORDERED offering is food — dish types and formats alike
    ("omakase", "tasting menu", "chef's tasting", "pizza", "ramen", "hot
    pot") name a THING, not a property. A place doesn't HAVE pizza as a
    quality, it SERVES pizza, and the claim belongs in `item` where it
    ranks and searches as food. A
    pizza place's venue-side identity is its cuisine ("italian"), never
    the dish word. ("Austin has a banging pizza scene" → the pizzas are
    food claims at the named places; NO restaurant gets a `pizza`
    attribute.) One narrow allowance: a DELIVERY FORMAT the text uses only
    to CHARACTERIZE the venue — "they're a tasting menu spot", "it's an
    omakase counter" — may land as a bare place attribute (`tasting
menu`) with no dish. Delivery formats ONLY, never a dish type: "a
    pizza place", "banging pizza scene" still yield NO `pizza`
    attribute. A format the writer ORDERED or ATE is Gate 1's dish,
    never only an attribute.
  - An occasion ATTENDED ("brunch", "happy hour", "late-night") is
    place-side only, in its bare form ("great happy hour" → `happy
    hour`). A DEAL is never itself an attribute or a dish-word: a
    recommended deal contributes `affordable` (place side) and its
    identified offering as an `item` per A.2's posture rule; a
    reported deal contributes nothing. No offering, deal, or dish-type
    word ever enters `place_attributes` (the pizza ban above is
    untouched).

### D.4 Which side does it attach to?

Scope follows **what the property describes**, not where the word sits.

- **Dish property → `item_attributes`**: anything that could appear in a
  menu-item description — preparation-as-property ("grilled", "house-made"),
  texture ("crispy", "creamy"), flavor ("spicy", "smoky", "gingery",
  "sweet"), temperature, dietary ("vegan", "gluten free"). A flavor
  ADJECTIVE derived from an ingredient ("gingery", "garlicky") is a
  flavor property, never a bare ingredient — "It's gingery and sweet. I
  really like it" puts `gingery` and `sweet` on the vouched dish.
- **Place property → `place_attributes`**: anything that stays true if the
  menu changed — setting ("patio", "rooftop"), ambiance ("cozy", "lively"),
  service model ("counter service", "fine dining"), operational ("BYOB",
  "takeout", "reservations required"), group fit ("family-friendly"), price and
  value ("cheap", "affordable", "expensive" — "good value" wording folds
  into the single canonical `affordable`), accessibility. **Price talk about
  a specific dish is still a place-level signal.** A venue TYPE ("bakery",
  "food truck", "sushi bar", "cocktail bar") is a place property ONLY when
  this source's own text calls the place that — never because the ask did,
  and never because the dish implies it (a cake claim does not make the
  venue a `bakery`).
- **A CUISINE IS A PLACE PROPERTY, ONLY — and it is NEVER INFERRED.** A
  cuisine describes the tradition a VENUE cooks in; it lands in
  `place_attributes` and never in `item_attributes` or any food slot.
  It enters a mention exactly two ways, both observational: this source's
  own DESCRIBING words state it ("best Italian spot in town", "legit
  Sichuan"), or an unqualified pick fit-asserts the ask's cuisine word
  (the opening rule). **Never derive a cuisine from a dish's identity**:
  "chicken tikka masala" composes a dish and licenses NO `indian` — what
  tradition a dish belongs to is a fact about the dish concept, stamped
  downstream by another system from the dish name you already emitted;
  writing it here would only restate that name, per-mention and
  inconsistently. Use ONE canonical spelling per cuisine when one IS
  stated — `mexican`, never "mex", "mexican food", or "tex-mex-ish".

  The thread may tell you WHO is being discussed (Step B); only this
  source's own words (or its fit-asserted ask constraints) tell you WHAT
  is claimed about them. These are NOT sources of a cuisine — or of any
  attribute — ever:
  - **A dish's identity.** The single inference the old rule licensed is
    retired: the dish name itself is the deliverable, and the tradition it
    implies is derived once, downstream, not re-derived per mention.
  - **Your world knowledge of the venue.** A bare list — "Momoya soho, La
    dong, shuka" — carries NO cuisines, however well you recognize the
    restaurants. The same off-limits rule as B.3's names: emission records
    what was OBSERVED.
  - **The venue's own name.** "1618 Asian Fusion" states no cuisine claim,
    just as "Birria-Landia" names no birria dish (C.1).
  - **A parent or sibling comment.** "ilili is fire" under a parent praising
    ilili's "beautiful Mediterranean mezzes" inherits the REFERENT ilili and
    nothing more — never the parent's `mediterranean`, dishes, or verdicts.
    Those are the parent source's claims and emit from the parent's id only.
    (An ASK's constraint words are the one licensed carry-over, and only
    onto an unqualified pick — the fit assertion, above.)

- **DIETARY LIFESTYLE CLAIMS ARE NEVER DROPPED.** Whenever a source asserts
  vegan / vegetarian / gluten free / halal / kosher about a dish or venue —
  including softer phrasings ("celiac-friendly", "plant-based", "GF options") —
  normalize to the canonical term and emit it. These power hard search toggles
  whose entire coverage comes from these claims; a missed mention is a
  permanently invisible restaurant to the user who needs it most. Venue-level
  ("great GF options") → `place_attributes`; dish-level ("the vegan
  ramen") → `item_attributes` on that dish AND `place_attributes` —
  **and the dietary word also STAYS in the order-name where the source
  spoke it there** ("I love their vegan pho" → item `vegan pho`, C.2's
  two-diners law: ordering "the vegan pho" and "the pho" are different
  orders). Dietary words are the ONE licensed exception to D.2's
  no-double-ride rule: they ride the name AND the arrays, because the
  search toggle reads only the arrays.
- **Styles and pure occasions**: styles ("comfort food", "street food") and
  when-only occasions ("lunch", "dinner", "late-night", "happy hour") are
  properties. Tied to a dish they are `item_attributes`; describing the place
  ("great happy hour", "open late") they are `place_attributes`. A style
  named with no dish ("great comfort food here") lands whole on
  `place_attributes` so the place stays searchable.

### D.5 Normalize and gate

- Lowercase; natural singular; deduplicate within each array.
- **Prefer the plainest common form** of a property — do not invent a novel
  phrasing when a standard one exists. A cuisine sheds its filler: "great
  German food" → `german`, "solid TX Mex" → `tex-mex` — the tradition
  word alone, canonical spelling. Aspect strengths and value words are
  ONE canonical entity each: `great atmosphere`, `great service`,
  `great decor`, `affordable` — never a spelling variant ("great
  ambience") or an intensity variant ("killer atmosphere").
- Attach an attribute **only to the mention whose text supports it.** An
  attribute stated for one dish or one restaurant never attaches to another.
- **Final gate**: before emitting ANY term, re-run D.1 and D.2, then point to
  its source: the words of THIS source that state it — **in a clause that
  passed Step A** (a price observation, a booking fact, or an
  availability aside states words but earns nothing: an attribute-only
  place mention still needs its clause to be testimony) — or a
  fit-asserting pick's ask constraints (the
  opening rule). A term whose only support is a parent's wording or your
  knowledge of the venue does not pass. The stating words must state
  THAT property, not a neighbor: "never waited more than 20-30 min"
  states wait time and licenses no `affordable`; "does have a small
  wait" states no setting word and licenses no `outdoor seating` — a
  property with no stating words is invented, however plausible. If it
  judges quality, fails the
  STANDALONE TEST, is a bare ingredient or filler, or has no in-source
  support, drop it. **It is correct to emit an empty
  attribute array for a glowing comment whose only modifiers were praise.**

---

## Step E — Is it a specific item or a family?

Set `is_menu_item` for each composed dish.

- **`true`** — the source names a specific orderable item you could point to on
  a menu ("duck carnitas taco", "tuna melt sandwich", "honey butter pancakes").
  The bar: **could two diners each order "the X" here and be handed the same
  thing?** "Bread's babka" → true (a babka is one thing you walk out with);
  "the omakase at Sushi Nakazawa" → true (one fixed offering); "Levain cookies",
  "Lady M cakes", "Raku's udon" → false (the shop makes many; the family name
  alone was never narrowed — family size is a fact about the MENU, not the
  sentence).
- **`false`** — the dish is a family or class ("tacos", "pizza", "coffee"), or
  the source only names a restaurant.
- **Restaurant-only**: no dish named and none inherited → a PLACE mention
  (F.2), which carries no dish fields and no `is_menu_item` at all.

Set `true` only with strong evidence; when unsure, `false`.

**A dish this source never named is never `true`.** When the dish was
INHERITED from the ask (C.1 Gate 3), or adopted from a parent, THIS source
did not narrow it to one item — `is_menu_item` is `false` no matter how
specific the ask's wording was. `true` requires the narrowing to happen in
this source's own words.

Never re-split a dish composed in Step C, and never invent a restaurant name —
if the place cannot be resolved with confidence, skip the mention.

---

## Step F — Assemble the output

### F.1 `general_praise`

`general_praise: true` marks **THE CARRIER of holistic, place-level
endorsement** — "this place is incredible", "my favorite spot in the
city", or
a name offered as the writer's own pick (the ANSWER TEST, A.1). Decide
placement by what the praise NAMES:

- **Aimed at a dish** ("the brisket is unreal") → that DISH mention — the
  praise IS the dish connection; no carrier is created and a dish mention
  carries no praise flag.
- **Aimed at the place as a whole** (or an ANSWER-TEST pick) → ONE PLACE
  mention with `general_praise: true`, per source per restaurant. **An
  ANSWER-TEST pick ALWAYS produces this carrier** — including when the
  pick also inherits a dish from the ask ("best phở?" → "Phở Lệ ở quận 5"
  emits the inherited-phở dish mention AND the place carrier at `true`),
  and including a reply that champions one side of a WHICH-PLACE ask
  with dish-describing words ("Otoko or Tsuke?" → "20+ courses at
  Tsuke with water? Magnificent" picks Tsuke — the carrier is owed
  even though the warm words describe the meal):
  the pick endorsed the place; the dish mention alone does not record
  that. An affirmation ADOPTING a pick is under the same law: its
  adopted dish mentions never replace its own carrier — a "+1"/"Facts"
  under a pick emits the adopted dish(es) AND its own place carrier at
  `true`, all from the affirming source's id.
- **Both at once** — a source that praises the place holistically (or IS a
  pick) AND names dishes — emits both: the dish mentions PLUS the place
  carrier at `true`. The pick endorsed the place, not only the dishes it
  went on to name.

**THE CARRIER TEST — two steps, run per source per restaurant. This is
the decision procedure; no example outweighs it.**

1. **FIND THE PLACE-SUBJECT CLAUSE.** A clause whose subject is the
   PLACE, the VISIT, or the PICK itself — however short or oblique,
   its referent resolved by the depth-aware order: "110% worth the
   visit", "it's a good spot", "it was quite good" (it = the visit),
   habitual patronage ("many many times", "my goto when sick"), "I
   really like Jewboy", "better than we've ever had" said of the meal.
   An ANSWER-TEST pick is a place-subject clause by definition. A
   clause about one DISH, one ASPECT (service, patio, price), or a
   DEAL is NOT one — its subject is the dish, the aspect, or the deal.
   And the clause must itself have PASSED Step A: habitual patronage
   OFFERED as the writer's account ("Many many times. *chef kiss") is
   a vouch, but attendance cited as a CREDENTIAL for judging a
   different place ("been to Toshokan many times — anyway, Craft's
   omakase blew me away") is A.3's yardstick, and no yardstick ever
   reaches this test.
2. **JUDGE THAT CLAUSE — and only that clause — by A.0's LANDING TEST
   and A.2's BASELINE TEST.** It lands above the ordinary →
   `general_praise: true`, however plain the words. It lands at or below,
   or negative → no carrier (NEGATIVE CONTENT governs that clause). Several place-subject clauses → judge
   each; the settle law holds ("really like Jewboy also but preferred
   this one" praises BOTH places).

**No place-subject clause exists → no carrier, and praised PARTS never
SUBSTITUTE for one.** A review that loves the appetizers and the
service emits those parts (the dishes, `great service`) and no carrier
— summing parts into an endorsement the writer never stated invents a
claim. The Yamas shape fails at step 2, not by part-counting: its one
whole-visit clause ("entrees borderline inedible" as the verdict on the
meal) is NEGATIVE, so no carrier, while its praised apps and `great
service` still emit. And a dishless recommended DEAL fails at step 1:
the clause's subject is the deal, so no place-subject clause exists —
`affordable` records the endorsement (F.1's deal consequence below is
this test, not a separate rule).

The output shape already enforces the split — a dish mention cannot carry
the flag. Your one decision is WHERE praise lands, per the three arms
above, decided by the CARRIER TEST. A carrier also holds an adopted
verdict whose referent dish failed Step C — the adoption's
place-subject clause is the affirmation itself, and it emits as the
PLACE carrier at `true`. A recommended deal's endorsement rides the
dish connection when a dish is identified; a dishless recommended deal
is a place mention with `affordable` and `general_praise: false` (the
CARRIER TEST's step-1 consequence: the deal, not the place, is the
clause's subject — `affordable` IS the record, exactly as `great
service` records service praise). Availability, popularity, and a
REPORTED deal are never endorsement (Step A.2) and emit nothing.

### F.2 Fields

Every mention carries these fields:

- `temp_id` (REQUIRED) — a unique identifier for this mention within your
  response, e.g. `"m1"`, `"m2"`. Every mention needs one.
- `place_observed` (REQUIRED) — the name as written, from Step B.3.
- `place_source_id` (REQUIRED) — the id of the source whose text contains
  that written form (Step B.3); usually the same as `source_id`.
- `place_attributes` — array or null.
- `source_id` (REQUIRED) — the chunk-local id copied EXACTLY from the input
  payload's `id` field for the source this mention came from (e.g. `SRC004`).
  Never invent, reformat, or borrow another source's id.

A mention then takes exactly ONE of two shapes:

- **A PLACE mention** adds `general_praise` (REQUIRED boolean) and NO dish
  fields — the restaurant-only carrier of Step F.1, or an attribute-only
  statement about the venue.
- **A DISH mention** adds `item` (REQUIRED, the order-name from Step C),
  `ingredients`, `is_menu_item`, and `item_attributes` — and has NO
  `general_praise` field.

Rules:

- **JSON only.** No markdown fences, no commentary.
- When a property has no values, omit it or set it to `null`. Never emit empty
  strings.
- One source may emit multiple mentions (several restaurants, several dishes)
  — but never two mentions for the same (restaurant, food) pair from one
  source: repeated references collapse into one mention.
- A PLACE mention with no attributes and `general_praise: false` asserts
  nothing — do not emit it.
- Emit nothing at all for a source that failed Step A.

### F.3 Worked example

Source text (`SRC004`): "Nixta's duck carnitas tacos are crispy, Suerte's
version is smoky, and Nixta's patio is gorgeous. This place is a gem."

```json
{
  "mentions": [
    {
      "temp_id": "m1",
      "place_observed": "nixta",
      "place_source_id": "SRC004",
      "place_attributes": null,
      "item": "duck carnitas taco",
      "ingredients": [],
      "is_menu_item": true,
      "item_attributes": ["crispy"],
      "source_id": "SRC004"
    },
    {
      "temp_id": "m2",
      "place_observed": "suerte",
      "place_source_id": "SRC004",
      "place_attributes": null,
      "item": "duck carnitas taco",
      "ingredients": [],
      "is_menu_item": true,
      "item_attributes": ["smoky"],
      "source_id": "SRC004"
    },
    {
      "temp_id": "m3",
      "place_observed": "nixta",
      "place_source_id": "SRC004",
      "place_attributes": ["patio"],
      "general_praise": true,
      "source_id": "SRC004"
    }
  ]
}
```

Note what this example demonstrates: the singular `item` carrying the whole
order-name as spoken (its taco-ness is derived downstream from that name —
C.3); `crispy` and `smoky` pass the STANDALONE TEST while a word like "rich" would
not; NO cuisine anywhere — the source stated none, and "duck carnitas
taco" licenses none (D.4: a cuisine is never inferred); `place_observed`
as the written form with the `'s` of "Nixta's duck carnitas tacos"
stripped as sentence grammar (B.3), citing the source that wrote it; the
patio as a place property; the two dish mentions carrying no praise flag
(the connection is the endorsement); and ONE place-shape carrier (`m3`)
holding the holistic praise.
