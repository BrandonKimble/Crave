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
3. **THE ORDER TEST** — _Could you say this to a server as the thing you want?_
   and its stricter sibling **THE PREDICTION TEST** — _If a diner names only
   this word, do you know anything about the food that arrives?_
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
diverge from a principle, follow the principle.

---

## Step A — Is there testimony here? (THE TESTIMONY TEST)

Answer one question about the writer: **is this person reporting on food they
have eaten, or doing something else?**

Answer it **clause by clause, never for the comment as a whole.** A verdict,
hedge, frame, or annotation binds only to the clause or list entry that
carries it: a reaction to the post, criticism of other entries, or an
availability aside is a fact about its own clause and never silences the
writer's other clauses — and a positive clause never rescues a hedged or
negative neighbor.

**A source has no genre.** Never classify the source as "an ask post", "a
complaint", "a trip report", or "a rave" and let that label decide its
clauses. The A.2 failures below are failures of CLAUSES, not of sources, and
mixed sources are the norm — in both directions:

- A question or planning post routinely contains the writer's own past
  verdicts, and they emit: "Ate at Uchiko one time, thought it was great …
  is Uchi still worth a trip?" — the verdict clauses emit even though the
  post exists to ask. A REMEMBERED verdict is still a verdict: "I remember
  Uchi being one of the best restaurants in the city" emits, and the
  writer's present question about whether it still holds does not un-say
  it (nor is it a closure — the place is open; B.1's PLACE STATUS rule).
  **But memory never outranks a stated ending**: a remembered verdict
  whose own sentence says the place or dish is GONE ("RIP the borscht —
  best soup in town", "loved the sloppy jac before they took it off the
  menu") is a eulogy — B.1's PLACE STATUS and Gate 2's must-still-exist
  own that sentence, and nothing emits. The asker's OTHER clauses still earn nothing on their
  own: "I've only been to Cuba512" states experience with no verdict, and
  the ask's own comparison anchors ("birria Landon the best Mexican?") are
  questions, not claims.
- A complaint post routinely contains standing positive testimony, and it
  emits: "I always say they have the best burger in Austin … I would
  recommend it to anyone" emits, however long the service rant around it —
  the complaint silences only the clauses it is about.
- A glowing report routinely contains clauses that fail: the praised burgers
  emit while the fries the writer "hoped would be crispier" do not; a price
  list inside a rave ("6 dollar beers, 18 dollar spritzes") stays
  PRICE-ONLY; a visit narrated with no verdict stays AVAILABILITY.

The failure mode this paragraph exists to kill: deciding the source's
overall genre first and then emitting all of its clauses or none of them.

### A.1 What counts as testimony

The writer vouches from experience, or reports a clear consensus:

- Direct verdicts: "it's fantastic", "best cheesesteak I've ever had",
  "their brisket slaps".
- Experience narrated in the past: "went to Sour Duck last Sat", "had an
  incredible meal off the Bunbelly truck", "I had the salmon lox focaccia" —
  **when the narration carries or leads to a verdict** (in the same clause,
  or in the report it introduces **about the same establishment** — a
  visit list introducing a review of a DIFFERENT place is a credential,
  A.3's yardstick). **Bare attendance is not testimony**:
  "I've only been to Cuba512", "went to maman this morning and they told
  me" state that the writer WAS somewhere, and nothing about the food —
  they fail, however recent or first-person the visit.
- Indirect recommendation: "worth the trip", "definitely go", "take them to
  \_\_\_", "my go-to".
- Consensus reported: "people rave about \_\_\_", "this sub loves \_\_\_".
- **Answering a request for a pick (THE ANSWER TEST).** When the in-scope
  post, or a parent comment, asks for a recommendation or a judgment — "where
  should I eat", "best pizza", "favorite spot", "anywhere good for X", "what's
  worth it", "recs for" — a reply that **names one or more places is
  testimony, complete as written.** The writer chose those names out of
  everything they could have said; the choice is the endorsement — and
  the same act in every form: naming first-hand, RESTATING a name already
  offered ("Seconding Odd Duck!"), or putting bare assent behind one
  ("+1", "Facts") all place the writer's weight on that name. This is true
  of a single bare name with no other words at all ("Adrienne's in FiDi"), of
  a list ("Pho phong luu, Tan My, Fresh Bowl, Sip Pho if central"), of an
  annotated list ("Cabernet Grill for dinner / Sunset Grill for breakfast"),
  and of a reply that ADDS names to an ongoing answer thread ("Bar Snack &
  Paradise Lost as well"). **Presentation never demotes a pick**: a writer
  answering a rec ask may organize their picks like a catalogue — headings,
  "Notable \_\_\_", "My classification", per-neighborhood groupings. The
  directory tell (A.2) is an EXTERNAL criterion choosing the names; when the
  writer's own taste chose them, a classified list is still an answer, judged
  entry by entry — every entry under every heading. Two conditions, both
  required:
  1. **The ask requests a JUDGMENT, not a FACT.** A judgment ask asks which is
     good or which you'd pick. A fact ask asks where to obtain, who is open,
     who delivers — "where can I find kolaches?", "who's open Christmas Day?".
     **A fact ask often wears enthusiasm without becoming a judgment ask** —
     the tell is that a DIRECTORY could answer it CORRECTLY: deals and
     specials ("who does dollar oysters?"), reservations and hours, bare
     stock and menu presence ("who has espresso buns?") are facts about
     the world. The verb never decides — the CRITERION does, because a pick
     endorses exactly what the ask's criterion asks for: a FOOD-TASTE
     criterion ("who has GOOD variety?", "best milkshakes?", "where's
     the tastiest…?") makes every pick food testimony, however the ask
     is phrased; any OTHER criterion — availability, and equally any
     non-taste characterization ("most likely to have stoned cooks?",
     "rudest staff?", a joke superlative) — makes its picks assert fit
     with THAT, which is not food testimony and emits nothing. A
     reply's CLAUSE that names who has/does/serves the thing is an
     availability clause, however warm its phrasing ("85C — they call them
     Espresso Buns!" locates the bun, vouches for nothing), and emits
     nothing. This mutes exactly that clause and no other — the
     clause-by-clause law as everywhere: a verdict clause beside it
     ("Perla's does them at happy hour — and honestly their oysters are
     the best in town") emits on its own words, while the deal it located
     still never becomes a claim.
  2. **Nothing in the reply re-frames the name as neutral information or
     disclaims it.** Judge an annotation by what it DOES to the
     pick: an annotation that helps you USE a pick the writer's taste
     already chose ("for dinner", "if central", "on the east side") leaves
     the endorsement standing — but an annotation that supplies the REASON
     the name is on the list ("H-E-B (location at Lake Austin blvd serves
     BBQ)" — it qualifies by AVAILABILITY, not taste) is not a use-note,
     and that entry emits nothing; an annotation that REPLACES taste as the
     reason the name is here — availability ("they sell", hours, "serves
     BBQ"), secondhandness ("never been but", "I've heard"), or a
     downward qualification ("not spectacular but on the cheaper side",
     "cheaper BBQ but decent") — strips that entry back to information,
     and it emits nothing, not even the food it mentions. Each entry is
     judged on its OWN annotation; one stripped entry never strips its
     neighbors.
- **A verdict has no minimum eloquence.** "is good", "is great", "is awesome",
  "their breakfast tacos are solid", "love this place", "my go-to" are
  complete endorsements — as complete as a
  paragraph. A hedge is a word that qualifies DOWNWARD ("it's _fine_", "not
  bad", "6/10", "decent for what it is"), not a word that is merely short or
  plain. Do not require enthusiasm.
- **A reply that reacts to the post still testifies for itself.** "Great
  list!", "You did NYC proud", "Well done" are reactions to the post's list —
  not testimony. But the same comment often continues into the writer's own
  first-person testimony ("Great list, my friend! I love La Gran Uruguaya"),
  and that testimony emits like any other. Judge every sentence of the
  source (clause by clause, as Step A opens); never let a reaction frame silence the rest of
  the comment. **A critical reaction is still only a reaction**: "Honestly,
  half this list is overrated — but Chivito d'Oro is fantastic" testifies
  for Chivito d'Oro; the criticism of the list is a fact about the LIST's
  entries (A.2's NEGATIVE CONTENT applies to the criticized items, and to
  them only). And a
  reaction is only ever a fact about ITS OWN source: every comment nested
  below it is still run through these steps on its own text — a chain of
  compliments can carry a reply full of real picks, and those picks emit.
- **Asking for feedback on an experience already had IS testimony.** "2026 NYC
  Food Trip Review — how did I do?" reports meals eaten; the question at the
  end does not undo them.
- **AN AFFIRMATION ADOPTS the parent's testimony as the writer's own —
  POLARITY included.** The test, not a phrase list: **does this reply
  exist to put the writer's own weight behind the parent's claim?**
  However the affirmation is worded — "+1", "this", "agreed", "Facts",
  "Correct", "This is the way", "This is the correct answer", "Truth",
  an emoji of assent — if endorsing the parent is what the reply DOES,
  the writer's judgment lands behind the same claims. **An affirmation
  that RESTATES the name ("Seconding Odd Duck!") is even simpler: it is
  the writer's own pick, complete as written — no referent to resolve.** Under a parent that PANS ("+1 on Launderette… no taste in the
  food") it seconds the pan and emits nothing positive. Resolve the
  referent by the depth-aware order and credit the same restaurant (and
  dish, when unambiguous) from THIS source's id. An agreement
  with an ambiguous referent credits nothing. **A bare verdict with an
  unstated subject is the same move**: "God it's so good", "so good!!",
  "obsessed" under a parent describing one unambiguous place resolves by the
  same depth-aware order and adopts that referent. And when the referent's
  food fails Step C (a wrapper like "lunch buffet", or no dish at all), the
  adopted claim is a restaurant-only carrier (`general_praise: true`) — a
  failed dish never cancels the adopted endorsement into silence.

### A.2 What is NOT testimony (each of these fails)

- **A PLAN.** The writer has not been yet: "Headed to Austin at the end of the
  month. Here's our short list", "Please revise my list", "Judge my itinerary",
  "we plan to split things at several of these places". A list of places
  someone INTENDS to visit is a request for testimony, not testimony — no
  matter how much it looks like a recommendation list. **A shortlist built
  by BROWSING is a plan too, however curated**: "from my list of open
  tabs, these menus stood out to me" chose names by reading, not eating —
  the writer's taste selected what to TRY, and trying hasn't happened. **This is the single
  most common false positive; check tense and intent before crediting a list.**
  The check cuts both ways: the SAME list shape in the past tense — "just got
  back", "here's what we ate through", "how did we do?" — is a trip REPORT,
  and its entries emit: OFFERING your eaten list as your account (or for
  judgment — A.1's feedback rule) is the claim; the writer chose and ate
  these. Attendance emits nothing only when stated for another PURPOSE —
  as a credential qualifying an ask ("I've only been to Cuba512"), not as
  an account being offered.
- **AN ASK.** The request itself never emits. **Every name inside a
  request is part of the QUESTION** — the target being asked about ("best
  Vinnie Special slice you've had?"), the benchmark it measures against
  ("on par or better than hey yuet?"), the anchor it compares ("birria
  Landon the best Mexican?") — however admiring the phrasing: an ask
  states what the asker WANTS TO KNOW, never what they vouch for. Only
  ANSWERS emit. (An asker's separate clause reporting their OWN past
  verdict is A.1 testimony as ever — that clause answers no question.)
- **AN ANNOUNCEMENT or DIRECTORY.** Participant rosters, event line-ups,
  fundraiser lists, "these 12 spots are doing a prix fixe this week", opening
  notices, marketing. Naming many restaurants neutrally is not endorsing them.
  An APPEARANCE post is the one-name form of the same thing: "Tonight's
  truck …… Birria-Landia !", "look who pulled up" announce WHO IS HERE —
  presence, not a verdict on the food, and no exclamation mark makes it
  one. This covers announcing an arrival or the business's success ONLY —
  a writer reporting on food they ATE ("what a great meal!") is testimony
  as ever — each such clause still judged on its own verdict by the tests
  below (a hedged or middling item in the report still fails). Emit
  nothing for the announcement. **A TITLE-ONLY CAPTION is the same thing**:
  a post whose entire text names a venue and/or an item — "Woodneck
  Kitchen - The Poor Joe", a photo caption labeling what is pictured — states
  WHAT THIS IS, not that it is good. Posting the photo is not a verdict.
  Emit nothing, unless some clause of the title or body carries an actual
  verdict ("…and it made me so happy", "all amazing" — then emit normally).
- **A LIST BUILT ON AN EXTERNAL CRITERION.** When the names were selected by
  something other than the writer's taste — and the text says so — the list
  is a directory, however long: open on a holiday ("Restaurants Open on
  Christmas Day"), participating in an event or fundraiser, awarded or ranked
  by someone else ("James Beard semifinalists"), on sale or promoting
  ("Wingstop has an offer, code FREESAMMY"), in stock, or on the writer's own
  future itinerary. The tell is a **stated selection criterion, or per-entry
  operational annotation** (hours, ranges, addresses as a roster). Ask: _did
  this writer's taste choose these names, or did a fact about the world?_
  Emit nothing.
- **AVAILABILITY or POPULARITY alone.** "X has Y", "they sell it by the pound",
  "it's always packed", "there's a location on 5th", "they're doing great".
  Stating that food exists, that others go, or that the BUSINESS is
  succeeding is not a verdict on its food.
  **This holds even when the availability answers a FINDABILITY ask.** A
  "where can I find \_\_\_?" ask makes "Quack's on 43rd has them. Also Epoch
  sells them sometimes" a helpful and RESPONSIVE reply — and still not
  testimony, because the writer said where to _get_ the thing, never that it
  is good. A reply may mix an availability answer with its own real
  testimony; the availability item still never becomes a food claim: "Casa
  Columbia still has it on tap, and the food there is delicious" praises the
  food generally (a restaurant-only mention) — the thing on tap was located,
  never vouched for, and does not emit as `item`. **But when the ask requested a PICK rather than a location, naming
  a place IS the verdict — see the ANSWER TEST in A.1.** Discriminate by what
  the ask wanted, never by how much the reply said.
- **HEARSAY or DESIRE.** "I've heard", "supposedly", "want to try", "never been
  but interested" — including hearsay dressed in commitment ("I bought a
  giftcard… I hear it is a very lovely venue" — money spent is not food
  eaten). Hearsay CONFIRMED by the writer's own visit is testimony as
  ever ("heard good things, finally went — it lived up").
- **A MIDDLING OR HEDGED VERDICT.** "it's fine", "solid enough", "6/10", "not
  bad", "perfectly fine", "decent for what it is". These withhold endorsement;
  they are not
  positive claims. The test is the NET DIRECTION of the clause, not a word
  list — and for the mild words ("solid", "decent") POSITION decides the
  direction: standing alone as the whole verdict they lean positive
  ("their breakfast tacos are solid" emits — A.1's no-minimum-eloquence
  law); explicitly qualified they withhold ("solid enough", "decent for
  what it is"). This is the ONE interaction with the "but" law below: a
  mild word joined by "but" to a NEGATIVE verdict about the same
  establishment is a concession — "I wasn't huge on De Nada but they had
  a decent hard shell taco" softens the miss and endorses nothing (the
  cool frame denies the mild word its positive lean); the "but" law's
  subject-change rule still governs everything stronger than mild ("I
  love Uroko, but…" stands because "love" needs no lean). Any qualifier
  that pulls the verdict downward defeats it — "liked
  it — but didn't love", "average quality but absurd portions", a middling
  score amid higher-rated siblings ("porchetta ribs (7.3)" when the writer's
  favorites rate 8+). **When an entry carries a rating, THE SCORE IS that
  entry's verdict**: having ordered and eaten it (A.1's experience
  narration) adds nothing on top of the number — judge the score against
  the writer's own scale, and a 7.3 beside the writer's 8.4 favorite
  withholds endorsement and emits nothing. Praise of size, price, or
  portions never rescues a hedged verdict on the food itself. **A "but"
  decides net direction only for the SUBJECT its verdict is about**:
  "Good, but definitely not worth waiting on a long-ass line for" is one
  verdict on one dish, and the "but" defeats it — the downward pull need
  not concern flavor; value, wait, or price qualifying the verdict
  defeats it. But **a "but" never reaches back across a subject change**:
  "I love Uroko, but their handrolls would move up a tier if the seaweed
  was better" holds TWO verdicts on TWO subjects — the place verdict ("I
  love Uroko") stands and emits; the handroll clause is judged on its own
  and fails as hedged. Before letting a "but" defeat a verdict, ask what
  the downgrade is ABOUT: the same subject as the verdict defeats it; a
  different dish, a different place, or a separate aside is a new clause
  under this step's clause-by-clause law, and the earlier verdict stands.
  (A complaint in a SEPARATE clause about service or logistics
  is A.2 NEGATIVE CONTENT for that clause only, and leaves an unqualified
  verdict elsewhere standing.)
- **NEGATIVE CONTENT.** Criticism, warnings, "I'd skip \_\_\_", "many of your
  items I would not suggest", or a reply to an explicitly negative ask
  ("worst/avoid/overrated"). Emit nothing **for the criticized items** — and
  only for them: a comment that pans the list and then vouches for one place
  in its own words still emits that place.
- **PRICE-ONLY commentary.** "priciest in town", "$100+ steak" with no
  verdict. This is a clause-level fact like every other: inside an otherwise
  glowing review, "Also supremas enchiladas for 11" and "6 dollar beers, 18
  dollar spritzes" price items without judging them — those items do not
  emit, however warm the surrounding clauses.
- **A CLOSED PLACE** — decided in Step B, not here. Testimony about a
  place that no longer exists is real testimony that cannot emit; B.1's
  PLACE STATUS rule resolves each place's status once for the whole post
  object and kills every mention of a closed one. Nothing about the
  WRITER (their tense, their nostalgia) decides this — see Step B.

### A.3 Judge each entry on its own verdict — and know a YARDSTICK when you see one

In a ranked, listed, or mixed source, **each restaurant and each dish carries
its own verdict.** A positive verdict on one entry never transfers to another,
and an attribute stated for one never attaches to another. When the writer
weighs options, the endorsement lands on the one they settle on, never on the
one they set aside.

**A name in a verdict clause is either the SUBJECT or the YARDSTICK — the
thing measured against — and yardsticks earn nothing, in either
direction.** This is one law with three familiar costumes: the benchmark
inside an ask ("on par or better than hey yuet?"), the credential list
qualifying a judgment of something else ("I've had all 3 omakase at
Otoko, Sushi Bar, and Toshokan — anyway, here's my review of Craft":
those three calibrate the writer's authority and earn no claims), and
the losing side of a comparison ("enjoyed my meal at J Carvers 100% more
than Jeffreys" — Jeffreys is the measuring stick; it gains nothing and,
being merely out-measured, loses nothing). Ask of every name: is the
verdict ABOUT this, or measured AGAINST it? **The law has a stop: a
writer's own RANKED LIST is not a yardstick chain** — every entry the
writer chose to rank is a SUBJECT with its own verdict (this section's
first paragraph); the yardstick reading applies only to names invoked to
measure, never to names being ranked. A source that is positive overall but names a dish
neutrally does not thereby endorse that dish.

### A.4 Outcome

If nothing in this source passes the TESTIMONY TEST, **emit nothing and move
on.** Otherwise carry forward the specific claims that passed — not the whole
source.

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
"the boba shop in 99 ranch market", "the taco truck on 5th", "the deli
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
nothing, leaving no free-floating praise. A different place the same
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
name. "Uchi, Uchiko and Suerte" is three names; "Uchi/ko" is one. **A LINE
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

**PLACE STATUS — resolved ONCE per place, for the whole post object.**
Before any claim about a place emits, ask: does the in-scope text state
that this place is GONE? Closure is stated ABOUT AN OBJECT — check what
died: "RIP Uchi Candy Bar" mourns a dish (Gate 2's business, Uchi stays
open); "RIP my wallet" mourns nothing; and a closed BRANCH never closes
the brand ("sad since the one on MLK closed — great tortillas" leaves the
brand open and the praise standing). Stated closure of the place itself
("RIP", "closed down", "went out of business", "closed suddenly") —
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

**THE PLACE TEST: did THIS PLACE'S KITCHEN make this food for the writer —
or did a SHELF hold it?** Kitchen-made-for-you is the claim this system
exists for; shelf goods — bought off a shelf, out of a case, from a list
of products — are retail, and retail earns nothing here **even when the
product is ready to consume as-is**: a bottle of wine, a jug of milk, a
packaged bar, a six-pack needs no preparing, and is still a shelf good.
The question is who made it and for whom — not whether cooking remains.

This is a test on **the claim, not on the venue.** The same business
legitimately produces both kinds, and the text always tells you which:

- **KITCHEN (keep)**: "their fish tacos", "the meat pastries from the ladies
  in the windows", "tacos that have no business being as good as they are",
  "potato wedges when they fresh", "their breakfast tacos during breakfast
  hours", "the deli's turkey with pepper bacon" — made here, for you.
- **SHELF (drop)**: "gets watery when you cook it on the stove", "in the
  chest freezer between the meat and fish counters", "buy a 40 lb bag",
  "store-bought, packaged stuff", "they sell a very light, fresh marinara",
  "the cabs I've had from HEB", "their milk is unbeatable", a linked
  product page — held here, made elsewhere or for no one in particular.
  A product's brand ("Caymus", "Fairlife") is never a restaurant.

A good the writer finishes or cooks AT HOME is the shelf's, however
proud the result ("I've made killer pizzas with that HEB dough" claims
the writer's kitchen, not H-E-B's). A grocery store with a taquería
counter yields real claims from the counter and
none from the aisles. A restaurant that sells its sauce in bottles is the
mirror image. **Read who made it for whom, never the kind of business.**

**An ANSWER-TEST pick inherits the ask's MODE.** A bare name carries no food
language of its own, so the claim it makes is the claim the ask requested —
and when the ask requested a place to SHOP ("best middle eastern grocery
store?", "good butcher?", "where do you buy…?"), every pick answers a
SHELF question — the claim is about goods a shelf held, whoever's kitchen
is on the sign — and fails the PLACE TEST: emit nothing, however warm the list — and for EVERY
entry on it: a pick whose name says "bakery and deli" or "meat market" is
still answering the grocery ask, and the ask's shopping mode, not the
name's tokens, decides. Likewise, praising
a business AS a store — aisles, BOGO deals, "fast cheap and organic" — is
about buying packaged goods, not food served to eat now, and emits nothing.

Also fails the PLACE TEST:

- Claims about a venue whose business is not serving food, where the food is
  incidental and unserved by them (a stadium, a hotel, a museum) — UNLESS the
  claim is about food actually prepared and served there, in which case it
  passes like any other.
- **Landmark-plus-vendor**: when the text names a landmark and a vendor inside
  it, the claim belongs to the vendor.

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

**Gate 1 — FOOD OR TERMS.** Every word of a food phrase says one of two
things: WHAT FOOD ARRIVES, or THE TERMS OF THE PURCHASE — when it is
sold, what it costs, how many pieces or courses, in what format ("lunch",
"happy hour", "$25", "3-course", "special", "deal", "combo", "menu",
"buffet", "prix fixe"). This is how diners themselves hear a phrase.
**One selecting question routes every case: how many ORDERABLE THINGS
does the phrase tell you about — none, one, or several?**

- **ONE — the phrase describes one offering → it is a DISH, emitted AS
  SPOKEN.** It can tell you what arrives through food words ("steak
  combo", "seafood lunch special", "salmon omakase"), through a format
  that itself predicts the food ("omakase", "dim sum" — usually a FAMILY,
  `is_menu_item: false`, Step E), or through a PROPER NAME that fixes one
  menu offering ("the Elvis Presley combo" emits `elvis presley combo`,
  "the Hangover Special" → `hangover special` — two diners ordering it
  are handed the same thing; the menu supplies what the words don't; the
  article stays behind). Emit the phrase a diner would say to the server —
  "steak combo", never a stripped "steak" — with categories from the
  parts that predict food (C.3: `steak combo` → `steak`; the terms-word
  itself is never a category and never an attribute).
- **NONE — the phrase tells you ONLY terms → no dish exists** ("lunch special",
  "$25 combo", "happy hour deal", "3/4 course menu", a bare "the tasting
  menu", "game day deal" — nothing about the plate) — **but the mention
  still EMITS**, restaurant-only with `general_praise: true`: praise of a
  deal is VALUE testimony, however strong the verb — "their lunch
  specials are big hits", "my go-to", "great weekday lunch special - 2
  tacos, rice y beans, iced tea like $10" all emit — and `good value`
  rides in `place_attributes` where the text supports it. Never mint an
  item named "lunch special", "combo", or "daily special". Foods DESCRIBED
  inside the deal are judged by the clause law like any other words: an
  enumeration that only prices or lists ("2 tacos, rice y beans, iced tea
  like $10") stays the deal's contents and claims nothing — but a writer
  who ate SERVED contents and judges them ("got the 2 item combo with
  brisket and sausage — the sausage was incredible") makes normal dish
  claims with those foods. B.2's mode still governs: a grocery haul is
  eaten too, but it was never SERVED — packaged goods stay out however
  enthusiastically consumed. The venue may also earn the BARE terms-word as
  a `place_attributes` entry per Step D ("tasting menu" as how the place
  serves).
- **SEVERAL — the phrase names separate things the writer combined or
  consumed → each food is its own claim.** "Combo" (or "pairing", "duo")
  here isn't a menu phrase at all — it is the writer's own COMMENTARY on
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
per dish per post object, the exact mirror of B.1's PLACE STATUS**: any
in-scope clause stating the dish no longer exists — removed, replaced,
renamed away, "disappeared from the menu", or the writer's fondness
explicitly withdrawn as past — marks that dish DEAD, and no clause about
it emits, however warm the memory (the restaurant is untouched: a dead
dish is not a closed place). Only VERBED removal kills: "off the menu"
as an idiom of ordering ("I enjoy several things off the menu") is a
live dish being eaten, not a dead one. Failing by definition:

- wanting-anything words — "food", "a meal", "the food here", "drinks"/"a
  drink" bare — name the desire to eat or drink, not a thing the server
  could bring (a NAMED drink, "espresso", "margarita", is a dish as ever);
- traditions and styles, however modified — "great Indian place", "red
  sauce italian food" name no order (irreducible "comfort food" is the
  exception: carry it whole to Step D, where it is a style attribute);
- a when-word praised holistically — "Dinner is super solid there" names
  no dish (C.3);
- the kind of place it is — a cocktail bar does not thereby serve a dish
  called "cocktail".

What fails here is not lost: the cuisine or style lands in Step D as an
attribute where it describes.

**Gate 3 — THE VERDICT: a dish is born only from a vouching clause.**
Something survived Gates 1–2 AND its clause passed Step A → compose it in
C.2. Food language in a clause that earned nothing — a price complaint
("$30 for a medium pizza"), a pan ("no flavor at all"), a deal or
availability line ("half off oysters on Wednesdays", "Rocky's also has
it"), narration or a receipt, a photo reaction ("this LOOKS great"), a
reply-chain riff — names food and births NO dish: the clause's verdict
is what a dish is made of, and that clause has none. Nothing
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
`item_attributes` by D's normal tests. WHO inherits is the only gate:
only an unqualified pick — a reply that hedges or re-scopes the ask's
terms ("ask them to fry it twice") inherits none of them — and
an ask whose food language fails the gates inherits nothing: "craving red
sauce italian food" targets no orderable dish. Two boundary shapes:
a dish wrapped in a venue type is still a DISH ask ("best burger joint?",
"quán phở nào ngon nhất?" — the dish inside the wrapper, `burger`/`phở`,
passes the gates and inherits; the reply's restaurant name containing the
same word changes nothing); a cuisine or style ask ("best Indian
around?") PASSES prediction but FAILS the ORDER TEST — no dish inherits,
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
     word out (see the PREDICTION TEST in C.3). "thin crust pizza" is the
     same shape: ordering "the thin crust pizza" and "the pizza" are
     different orders, so the style words STAY in the dish name — a style
     word inside an order-name is never peeled off into an attribute (and
     "thin" alone would fail the STANDALONE TEST anyway).
   - **"lunch special", "3/4 course menu"** — two diners ordering "the lunch
     special" here ARE handed the same thing, and the phrase still names no
     food. The sameness question decides which WORDS of a dish name to keep;
     it never turns a terms-only phrase into a dish. Gate 1's FOOD-OR-TERMS
     question governs.
   - "grilled burger" — the same order as "burger"; "grilled" is a property and
     will be handled in Step D. "good taco" orders a taco — an evaluative
     word is the writer's verdict, never a dish token and never a property.

3. **Drop additive components.** For "with/and" clauses, keep the core dish as
   `item`; the listed items are components of this dish, not dishes or
   categories of their own. They may be recorded in `ingredients` (C.5).

4. **Sanity-check.** Would this exact wording appear on a menu? If not, peel
   one modifier until it would, keeping the head noun. If you end with a lone
   ingredient, keep the broader dish instead — a lone ingredient is neither a
   dish nor a category. When the source names NO broader dish ("Love their
   rice"), there is no dish at all: the mention is restaurant-only.
   - **Appearing on a menu is NOT sufficient.** "Lunch Special", "3-Course
     Menu", "Happy Hour Deal", "Chef's Tasting" are all printed menu headings
     and none of them is a dish. Re-run Gate 1's FOOD-OR-TERMS question on
     the phrase you just composed: a phrase that tells you what arrives
     stays as spoken ("chicken special", "nigiri special" — the food word
     carries it); a phrase that is only terms emits no dish ("tuesday
     special", "lunch deal", "happy hour tasting menu").

5. **Normalize**: lowercase; use the natural singular ("taco", not "tacos";
   but keep "noodles" where the singular is awkward); minimal punctuation.
   **Never reorder tokens** — emit the word order the source used — and keep
   every letter as the writer spelled it, diacritics included ("phở", never
   "pho", when the source wrote the marks). **Dish names obey the same as-written law as
   place names (B.3)**: emit the words the source wrote — "cevichi"
   stays `cevichi`, never "corrected" to ceviche, and never a different
   word ("crudo" is not "steamed") — a downstream judge unifies variants
   of the same dish; your transcript is its evidence. Strip only menu
   bookkeeping ("seafood boil combo #5" — the "#5" numbers the menu, not
   the food). A pro-form is not a name: "the mushroom based one" resolves
   to the dish it points at or emits nothing.

**Never PEEL a phrase down to its bare terms-word**: "get the sake
pairing" is a dish AS SPOKEN (`sake pairing` — the food word tells you
what arrives, Gate 1's ONE arm); peeled to bare `pairing` it is
terms-only and never an order-name. **And a venue's name is never part
of an order-name**: "Don't miss the Suerte tacos" orders tacos AT
Suerte — `taco`, never `suerte taco` (C.1: the venue's name is never
food language).

**Never emit a truncated or abbreviated food token.** If a word is cut short
("jap" for jalapeño), write the full word or drop it. A truncated token can
land on an unintended and offensive word.

### C.3 Build the categories (THE PREDICTION TEST)

`item_categories` are the broader **orderable dish classes** the `item` rolls
up into. Every entry must pass a STRICTER bar than the ORDER TEST:

**THE PREDICTION TEST — if a diner names only this word, do you already know
something about the food that arrives?**

- **YES → category.** "dessert" (something sweet), "appetizer", "side",
  "snack" (a small dish of known shape), "coffee", "beer", "pastry", "taco",
  "soup" — all categories, even though several also name a course or a time.
  **"breakfast" and "brunch" pass**: breakfast food is a recognizable kind
  (eggs, pancakes, breakfast tacos).
- **NO → not a category.** "dinner" is any food at all; "lunch", "happy hour"
  constrain when, never what. **A format fails when what arrives is
  UNCONSTRAINED**: "tasting menu", "prix fixe", "buffet", "combo plate",
  "lunch special", "3-course menu" tell you how the food is delivered, when,
  and how much of it, but the food itself could be anything. **A modifier
  never changes this** — test the head noun, not the string.
- **A format that DOES constrain the food passes, like any other category.**
  "omakase" predicts sushi, chef-selected, in a known style; "dim sum"
  predicts small Cantonese plates. Diners search for these by name and order
  them by name. Judge a format by the same question as everything else — does
  naming it tell you what arrives? — not by the fact that it is a format.

A word may reference a time AND still name a food class. **Judge by the food
the word predicts, not by whether a clock is involved.**

Never categories: ingredients ("gruyere", "pecan", "pepperoni"), flavors
("sweet and spicy", "balsamic"), cuisines, styles, meal periods, service modes.
The tell: "I'll have the gruyere" is not a complete order; "I'll have the
popover" is.

Build the list:

1. **Seed** with the most specific attribute-free dish noun.
2. **Peel progressively**, asking the PREDICTION TEST of each remainder.
   "tuna roll" → "roll" passes. "masa crouton" → neither "crouton" nor "masa"
   passes. Preserve head-first constructions: "pho tai" → `["pho tai", "pho"]`,
   never `["tai"]`. Stop before a lone ingredient. A peel landing on a
   when-only word yields nothing, even inside the dish's own name
   ("ploughman's lunch" is a dish; "lunch" is not a class). Note the
   direction: "ploughman's lunch" survives because its head is `lunch` used
   as a named composed dish, and its modifier is not a wrapper. "lunch
   special" does not survive, because its head is `special`. When in doubt:
   if removing the time-word leaves only terms-words (Gate 1), there was
   never a dish.
3. **Add 1–3 parent classes** the dish clearly belongs to, even when unstated —
   **dish shapes that each pass the ORDER TEST** (dessert, pastry, coffee, tea,
   sandwich, soup, salad, pizza, taco, burger, noodle, dumpling). A category
   says WHAT ARRIVES, never where it is from: **a cuisine is NEVER a parent
   class.** The pull is strongest exactly where the dish is most
   tradition-bound — the salient parent of "mapo tofu" in your head is
   "chinese food", and it is wrong here. Say "I'll have the \_\_\_" of every
   entry before it lands: "taco", "soup", "dessert" order something;
   "chinese", "italian", "japanese" name a tradition, and a tradition is
   never yours to add — "mapo tofu" → `["mapo tofu", "tofu"]`, with NO
   `chinese` anywhere (a cuisine enters only when stated or fit-asserted —
   D.4). A printed menu section is a category only
   when the heading predicts the food: "Desserts", "Sides", "Tacos" do;
   "Happy Hour", "Chef's Tasting" do not.
   - **Run the ORDER TEST on the PARTS of the dish name, not just the whole.**
     Any part that would itself be a complete order somewhere is a parent.
     "carnitas taco" → `["taco", "carnitas"]`; "carbonara udon" → `["udon",
"noodle", "pasta", "carbonara"]`; "breakfast taco" → `["breakfast taco",
"taco", "breakfast"]`; but "grilled burger" → `["burger"]` only.
     Whether the part is traditionally its own dish family is irrelevant —
     categories follow how people order today. Dropping such a part is the most
     common miss: someone craving carbonara wants the udon version too.
4. **Deduplicate**, most specific first, singular where natural.

Common parents: cake/brownie/pie/tart/gelato/ice cream → "dessert";
croissant/scone/muffin/macaron/cookie → "pastry" (and "dessert" when sweet);
latte/cappuccino/cold brew → "coffee"; chai/matcha → "tea"; banh mi/torta/
hoagie/panini → "sandwich"; pho/ramen/udon/pozole → "soup".

### C.4 One dish per connection

Each restaurant→food connection is ONE composed dish. Never emit separate
mentions for component ingredients or related nouns. Two restaurants praised
for the same dish produce two entries with identical `item` and distinct
restaurants.

### C.5 Ingredients

`ingredients` records ingredient nouns **THIS SOURCE names for THIS dish** —
the same kind of claim as everything else: something the writer said, not
something you know. Two sources only:

1. Additive clauses: "pasta **with burrata, chanterelles, and pesto**" →
   `["burrata", "chanterelle", "pesto"]` — singularized, never expanded
   (no synthesized "mushroom").
2. Ingredient nouns inside the dish name: "gruyere popover" → `["gruyere"]`.

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
that choice vouches for the fit. A re-scoping annotation blocks the word
it re-scopes ("great but pricey" blocks "cheap"), an off-axis answer that
pushes back on the ask's frame asserts nothing from it, and the ask
itself still emits nothing. Fit-asserted words land on the PLACE side —
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
strength**, exactly as praised price already becomes `good value` — "the
atmosphere is killer" → `great atmosphere`, "fabulous decor" → `great
decor`, "service was flawless" → `great service`: a diner filtering for
atmosphere wants exactly the places whose atmosphere people praise.
Whole-thing praise with no aspect ("amazing", "delicious", "iconic")
still converts to nothing — it has no aspect to strengthen, and it is
already the claim's endorsement.

- `spicy`, `crispy`, `smoky`, `grilled`, `vegan`, `cozy`, `outdoor seating`,
  `indian`, `comfort food` → describe → attributes.
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
- **FAILS**: `rich`, `light`, `authentic` — and their whole kind (`thin`,
  `old school`, `filling`, …). A **light roast**, a **light marinara**, and a
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
- **Anything the PREDICTION TEST calls food is never an attribute, on either
  side.** One split, decided by the same test that governs Step C:
  - A terms-only phrase (Gate 1: "tasting menu", "buffet", "prix fixe",
    "lunch special", "3-course menu" — what arrives could be anything) is
    not food, and it CAN be a restaurant attribute when it characterizes
    how the venue serves. Normalize it to its BARE form for the attribute:
    "lunch tasting menu" yields the venue attribute `tasting menu`, never
    the modified string. (A phrase with a food word — "wagyu tasting
    menu" — is a DISH per Gate 1 and never lands here.) A meal deal
    yields `good value` at most, never a food.
  - A format or dish type that PASSES prediction ("omakase", "dim sum",
    "pizza", "ramen", "tacos", "hot pot") IS food — it names a THING, not a
    property. A place doesn't HAVE pizza as a quality, it SERVES pizza, and
    that claim belongs in `item`/`item_categories` where it ranks and
    searches as food. A pizza place's venue-side identity is its cuisine
    ("italian"), never the dish word. ("Austin has a banging pizza scene" →
    the pizzas are food claims at the named places; NO restaurant gets a
    `pizza` attribute, and an omakase house earns `japanese`, never
    `omakase`-as-attribute.)

### D.4 Which side does it attach to?

Scope follows **what the property describes**, not where the word sits.

- **Dish property → `item_attributes`**: anything that could appear in a
  menu-item description — preparation-as-property ("grilled", "house-made"),
  texture ("crispy", "creamy"), flavor ("spicy", "smoky"), temperature,
  dietary ("vegan", "gluten free").
- **Place property → `place_attributes`**: anything that stays true if the
  menu changed — setting ("patio", "rooftop"), ambiance ("cozy", "lively"),
  service model ("counter service", "fine dining"), operational ("BYOB",
  "takeout", "reservations required"), group fit ("family-friendly"), price and
  value ("cheap", "good value", "expensive"), accessibility. **Price talk about
  a specific dish is still a place-level signal.** A venue TYPE ("bakery",
  "food truck", "sushi bar", "cocktail bar") is a place property ONLY when
  this source's own text calls the place that — never because the ask did,
  and never because the dish implies it (a cake claim does not make the
  venue a `bakery`).
- **A CUISINE IS A PLACE PROPERTY, ONLY — and it is NEVER INFERRED.** A
  cuisine describes the tradition a VENUE cooks in; it lands in
  `place_attributes` and never in `item_attributes` or `item_categories`.
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
  ramen") → `item_attributes` on that dish AND `place_attributes`.
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
  word alone, canonical spelling.
- Attach an attribute **only to the mention whose text supports it.** An
  attribute stated for one dish or one restaurant never attaches to another.
- **Final gate**: before emitting ANY term, re-run D.1 and D.2, then point to
  its source: the words of THIS source that state it — **in a clause that
  passed Step A** (a price observation, a booking fact, or an
  availability aside states words but earns nothing: an attribute-only
  place mention still needs its clause to be testimony) — or a
  fit-asserting pick's ask constraints (the
  opening rule). A term whose only support is a parent's wording or your
  knowledge of the venue does not pass. If it judges quality, fails the
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
endorsement** — "this place is incredible", "my favorite spot in Austin", or
a name offered as the writer's own pick (the ANSWER TEST, A.1). Decide
placement by what the praise NAMES:

- **Aimed at a dish** ("the brisket is unreal") → that DISH mention — the
  praise IS the dish connection; no carrier is created and a dish mention
  carries no praise flag.
- **Aimed at the place as a whole** (or an ANSWER-TEST pick) → ONE PLACE
  mention with `general_praise: true`, per source per restaurant. **An
  ANSWER-TEST pick ALWAYS produces this carrier** — including when the
  pick also inherits a dish from the ask ("best phở?" → "Phở Lệ ở quận 5"
  emits the inherited-phở dish mention AND the place carrier at `true`):
  the pick endorsed the place; the dish mention alone does not record that.
- **Both at once** — a source that praises the place holistically (or IS a
  pick) AND names dishes — emits both: the dish mentions PLUS the place
  carrier at `true`. The pick endorsed the place, not only the dishes it
  went on to name.

The output shape already enforces the split — a dish mention cannot carry
the flag. Your one decision is WHERE praise lands, per the three arms
above. A carrier also holds endorsement whose target failed the dish
gates: praise of a deal or wrapper (C.1's value-testimony arm) and an
adopted verdict whose referent dish failed Step C both emit as the PLACE
carrier at `true`. Availability, popularity, and price are never
endorsement (Step A.2).

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
  `item_categories`, `ingredients`, `is_menu_item`, and `item_attributes` —
  and has NO `general_praise` field.

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
      "item_categories": ["taco", "carnitas"],
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
      "item_categories": ["taco", "carnitas"],
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

Note what this example demonstrates: singular `item` and singular categories;
`crispy` and `smoky` pass the STANDALONE TEST while a word like "rich" would
not; NO cuisine anywhere — the source stated none, and "duck carnitas
taco" licenses none (D.4: a cuisine is never inferred); `place_observed`
as the written form with the `'s` of "Nixta's duck carnitas tacos"
stripped as sentence grammar (B.3), citing the source that wrote it; the
patio as a place property; the two dish mentions carrying no praise flag
(the connection is the endorsement); and ONE place-shape carrier (`m3`)
holding the holistic praise.
