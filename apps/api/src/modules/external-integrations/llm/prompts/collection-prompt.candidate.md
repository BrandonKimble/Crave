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
  it (nor is it a closure — the place is open, A.2). The asker's OTHER clauses still earn nothing on their
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
  or in the report it introduces). **Bare attendance is not testimony**:
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
  everything they could have said; the choice is the endorsement. This is true
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
     Answering a fact ask names places by availability, not by taste: that is
     A.2's AVAILABILITY case and emits nothing.
  2. **Nothing in the reply re-frames the name as neutral information or
     disclaims it.** Hours, prices, "they sell", "never been but", "I've
     heard" strip the pick back to information. Positive or plain annotations
     do not ("for dinner", "if central", a neighborhood tag). An annotation
     that qualifies DOWNWARD is a hedge and strips THAT entry — it emits
     nothing ("not spectacular but on the cheaper side", "cheaper BBQ but
     decent"). An operational annotation ("serves BBQ", a location, hours)
     re-frames its entry as availability — that entry also emits nothing,
     not even the food it mentions. Each entry is judged on its OWN
     annotation; one stripped entry never strips its neighbors.
- **A verdict has no minimum eloquence.** "is good", "is great", "is awesome",
  "love this place", "my go-to" are complete endorsements — as complete as a
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
- **A short agreement ADOPTS the parent's testimony as the writer's own.**
  "+1", "this", "agreed", "seconded", "came here to say this" under a parent
  that vouches for a place puts this writer's judgment behind the same
  claims — resolve the referent by the depth-aware order and credit the same
  restaurant (and dish, when unambiguous) from THIS source's id. An agreement
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
  matter how much it looks like a recommendation list. **This is the single
  most common false positive; check tense and intent before crediting a list.**
  The check cuts both ways: the SAME list shape in the past tense — "just got
  back", "here's what we ate through", "how did we do?" — is a trip REPORT,
  and every place on it was eaten at. Tense decides, never the shape.
- **AN ASK.** The request itself never emits, whether or not it names places.
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
  never vouched for, and does not emit as `food`. **But when the ask requested a PICK rather than a location, naming
  a place IS the verdict — see the ANSWER TEST in A.1.** Discriminate by what
  the ask wanted, never by how much the reply said.
- **HEARSAY or DESIRE.** "I've heard", "supposedly", "want to try", "never been
  but interested".
- **A MIDDLING OR HEDGED VERDICT.** "it's fine", "solid enough", "6/10", "not
  bad", "perfectly fine", "decent". These withhold endorsement; they are not
  positive claims. The test is the NET DIRECTION of the clause, not a word
  list: any qualifier that pulls the verdict downward defeats it — "liked
  it — but didn't love", "average quality but absurd portions", a middling
  score amid higher-rated siblings ("porchetta ribs (7.3)" when the writer's
  favorites rate 8+). **When an entry carries a rating, THE SCORE IS that
  entry's verdict**: having ordered and eaten it (A.1's experience
  narration) adds nothing on top of the number — judge the score against
  the writer's own scale, and a 7.3 beside the writer's 8.4 favorite
  withholds endorsement and emits nothing. Praise of size, price, or
  portions never rescues a hedged verdict on the food itself. **A "but"
  INSIDE the verdict clause decides that clause's net direction, whatever
  the "but" is about**: "Good, but definitely not worth waiting on a
  long-ass line for" is a net recommendation AGAINST — the downward pull
  need not concern flavor; value, wait, or price qualifying the verdict
  defeats it. (A complaint in a SEPARATE clause about service or logistics
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
- **A CLOSED PLACE.** "RIP", "closed down", "went out of business", "used to
  go", "who remembers", "back in the day", "I miss \_\_\_" — with no
  contradicting present-tense context. A recommendation for a place that no
  longer exists is not actionable. Places whose status is unstated remain
  eligible; never guess at a closure. **Closure is a fact stated about the
  PLACE, never an inference from the WRITER's tense**: "I used to live in
  NYC and would go out of my way just for \_\_\_" reports a live place from
  a writer who moved away — testimony, not closure.

### A.3 Judge each entry on its own verdict

In a ranked, listed, or mixed source, **each restaurant and each dish carries
its own verdict.** A positive verdict on one entry never transfers to another,
and an attribute stated for one never attaches to another. When the writer
weighs options, the endorsement lands on the one they settle on, never on the
one they set aside. A source that is positive overall but names a dish
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
downstairs" describe a place the writer never names. Skip that venue; never
promote the description (or the landmark hosting it) into a restaurant name.
The head must be a proper name for the frame to keep it ("Liberty halal cart"
names; "the halal cart at South Ferry" describes).

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

### B.2 Is the claim about food this place serves?

**THE PLACE TEST: is this claim about food PREPARED AND SERVED BY this place,
to eat now — or about goods SOLD PACKAGED to take home and prepare later?**

This is a test on **the claim, not on the venue.** The same business
legitimately produces both kinds, and the text always tells you which:

- **SERVED (keep)**: "their fish tacos", "the meat pastries from the ladies in
  the windows", "tacos that have no business being as good as they are",
  "potato wedges when they fresh", "their breakfast tacos during breakfast
  hours", "the deli's turkey with pepper bacon".
- **PACKAGED (drop)**: "gets watery when you cook it on the stove", "in the
  chest freezer between the meat and fish counters", "buy a 40 lb bag",
  "store-bought, packaged stuff", "they sell a very light, fresh marinara",
  "get the circulars or check the app for coupons", a linked product page.

A grocery store with a taquería counter yields real claims from the counter and
none from the aisles. A restaurant that sells its sauce in bottles is the
mirror image. **Read the mode of consumption, never the kind of business.**

**An ANSWER-TEST pick inherits the ask's MODE.** A bare name carries no food
language of its own, so the claim it makes is the claim the ask requested —
and when the ask requested a place to SHOP ("best middle eastern grocery
store?", "good butcher?", "where do you buy…?"), every pick answers a
shopping question. Those claims are about goods packaged to take home and
fail the PLACE TEST: emit nothing, however warm the list — and for EVERY
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

### B.3 Canonicalize the name

Choose ONE canonical name per establishment, from **observed forms only** —
never synthesize or expand a name with tokens absent from the text, and never
contract a name into an acronym or initialism the text does not use.

**Your world knowledge of the establishment is off-limits here.** You will
often RECOGNIZE the place and know its fuller real-world name or its correct
spelling. Do not use it: "Minetta" stays `minetta` even when you know it is
Minetta Tavern; "sho" stays `sho`; a misspelled name stays as the writer
spelled it. Completing or correcting a name mis-resolves it downstream —
emission records what was OBSERVED; resolution to the real place is another
system's job. **Both directions of "fixing" are forbidden.** Never repair a
typo toward the real-world name ("Dominic Ansel" stays `dominic ansel`,
"Switf's" stays `switfs` — even when you know who is meant), and never
strip letters the writer DID write: de-diacritization is the same
correction run in reverse ("Café Crème" → `café crème`, never `cafe
creme`). A typo is not yours to correct; an accent is not yours to remove.

Normalize:

- Lowercase everything — but **keep every letter as the writer spelled it,
  diacritics included** ("Phở Lệ" → `phở lệ`, never `pho le`): accent marks
  are identity, and stripping them fuses different names downstream.
- Drop trailing neighborhood/borough/location suffixes ("les", "chelsea",
  "midtown", "queens"), even when the text contrasts branches — emit only the
  core brand tokens.
- Remove a leading article ("the", "a", "an") — unless what remains is a
  bare generic English word, in which case the article is part of the name:
  "The Smith" → `smith`, but "The Place" → `the place`, "The Corner" →
  `the corner`, "A Side" → `a side`.
- Collapse repeated whitespace; trim.
- Replace "&" with "and"; remove trailing punctuation that is not part of the
  name; normalize apostrophes away ("joe's" → "joes").
- **Strip a possessive clitic used to attach the name to a dish**: "Nixta's
  duck carnitas taco" yields the name "nixta", so the same venue always
  produces one stable form.
- Keep brand tokens intact ("bbq", "deli", "bakery", "taqueria") and preserve
  multi-word ordering as written.

Unify variants only when safe: identical after normalization, or one is a
strict token-superset of another AND no other anchor shares the subset tokens.
Otherwise keep them distinct.

When several variants survive, choose by: completeness (prefer full brand
tokens, "katz's delicatessen" over "katz's"); prefer the tighter brand-only
form when a longer variant only appends a generic cuisine/service term AND the
shorter form also appears in this input; then frequency; then the longer
informative token set. **Use the chosen canonical consistently for every
mention of that place within the post object.**

Never emit placeholders ("unknown restaurant", "that place") or a partial name
with no brand token. A bare generic English word kept from a list slot (B.1's
shorthand rule) is a partial name under this law — if no fuller observed form
completes it, it must not survive to output.

Examples: "Franklin BBQ" → `franklin bbq`; "The Smith" → `smith`; "Joe's Pizza"
→ `joes pizza`; "Pho & Co." → `pho and co`.

---

## Step C — What was ordered? (THE ORDER TEST)

**Compose the dish BEFORE extracting any properties.** A modifier can only be
judged once you know what it was modifying; peeling first is what turns
"lighter than Jets" into a property called "light".

### C.1 Is there a dish at all?

Ask THE ORDER TEST of the food language: _could you say this to a server as the
thing you want to order?_ A food here is anything orderable — drinks included:
an espresso or a cocktail is a dish exactly like a taco.

If nothing does — the source named a cuisine, a style, a property, or filler
but no orderable item — **there is no dish.** Leave `food` and
`food_categories` null; the mention is restaurant-only and the cuisine or style
lands as an attribute in Step D. **Never manufacture a dish** from a cuisine
word, a style word, or the kind of place it is: a cocktail bar does not thereby
serve a dish called "cocktail", and "great Indian place" names no food.
Neither does "<cuisine> food", however modified — "red sauce italian food"
names a tradition, not an order (irreducible "comfort food" is the
exception: carry it whole to Step D).
Two more sources that never yield a dish:

- **The venue's own name.** A food token inside a restaurant's name is part
  of the name and nothing more: praising the truck "Birria-Landia" has not
  thereby praised a dish called "birria", and "Ramen Del Barrio" names no
  ramen claim. A dish exists only when the source's own FOOD LANGUAGE names
  one.
- **A when-word praised holistically.** "Dinner is super solid there" names
  no dish — dinner is any food at all (C.3). The mention is restaurant-only.

**A format or deal that fails the PREDICTION TEST is not a dish, even when
the writer praises it by name, and even when it carries a modifier.**
"It is our newest favorite tasting menu" praises the venue's offering, but
"tasting menu" predicts nothing about what arrives — there is NO dish and no
`food_categories`; the mention is restaurant-only, the praise is holistic
(`general_praise: true`), and the format may ride as a `restaurant_attributes`
entry per Step D.

**JUDGE THE HEAD NOUN FIRST.** Before composing anything, find the head noun
of the food phrase — the last noun, the one the modifiers hang off. If that
head noun is a DELIVERY WRAPPER — `menu`, `tasting menu`, `course` /
`N-course`, `prix fixe`, `buffet`, `special`, `deal`, `combo` — the wrapper
predicts nothing about what arrives, and **the wrapper is never the dish.** A
modifier cannot rescue it. Ask instead what the modifier is:

- **The modifier NAMES A FOOD** ("wagyu tasting menu", "nigiri special",
  "dumpling combo"): extract THE FOOD ITSELF and throw the wrapper away —
  `food` is `wagyu`, `nigiri`, `dumpling`, never the compound. The venue may
  earn the BARE wrapper as a `restaurant_attributes` entry per Step D.
- **The modifier NAMES A TIME, PRICE, COUNT, OR OCCASION** ("lunch special",
  "3/4 course menu", "happy hour deal", "tuesday special", "lunch tasting
  menu", "$25 combo"): the whole phrase predicts only WHEN, HOW MUCH, or HOW
  MANY. There is no dish and no `food_categories` — leave both null.
- **A BARE wrapper** ("the tasting menu", "their buffet"): same — no dish.

**MEAL DEALS ARE VALUE TESTIMONY.** "their lunch specials are some of their
big hits", "great weekday lunch special - 2 tacos, rice y beans, iced tea
like $10" are genuine testimony — about PRICE and VALUE, not about an
identifiable food. Do not read the strength of the verb as evidence that a
food exists: "is good", "big hits", "my go-to" applied to a deal are still
about the deal. Emit a restaurant-only mention (`general_praise: true`, food
null, `good value` in `restaurant_attributes` where the text supports it).
Never mint a food named "lunch special", "combo", or "daily special".
Components listed inside a deal ("2 tacos, rice y beans") are the deal's
contents, not this source's dish claims — do not compose a dish from them.

(Formats that PASS prediction — omakase, dim sum — are FOOD and go through
Step C normally: they behave like "breakfast", a recognizable kind — usually
a FAMILY with `is_menu_item: false`, becoming a specific item only where Step
E's sameness test holds, e.g. "the omakase" at one sushi-ya is a single fixed
offering, while dim sum is always many plates. Note the asymmetry with a
wrapper head: "salmon omakase" composes normally as a dish, because `omakase`
predicts the food; "salmon tasting menu" redirects to `salmon`, because
`tasting menu` does not.)

Drop generic filler outright ("food", "meal", "dish", "the food", "restaurant",
"place", "spot") — it names nothing orderable and describes no property.

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
     word out (see the PREDICTION TEST in C.3).
   - **"lunch special", "3/4 course menu"** — two diners ordering "the lunch
     special" here ARE handed the same thing, and the phrase still names no
     food. The sameness question decides which WORDS of a dish name to keep;
     it never decides that a wrapper IS a dish. C.1's head-noun check governs.
   - "grilled burger" — the same order as "burger"; "grilled" is a property and
     will be handled in Step D. "good taco" orders a taco — an evaluative
     word is the writer's verdict, never a dish token and never a property.

3. **Drop additive components.** For "with/and" clauses, keep the core dish as
   `food`; the listed items are components of this dish, not dishes or
   categories of their own. They may be recorded in `ingredients` (C.5).

4. **Sanity-check.** Would this exact wording appear on a menu? If not, peel
   one modifier until it would, keeping the head noun. If you end with a lone
   ingredient, keep the broader dish instead — a lone ingredient is neither a
   dish nor a category. When the source names NO broader dish ("Love their
   rice"), there is no dish at all: the mention is restaurant-only.
   - **Appearing on a menu is NOT sufficient.** "Lunch Special", "3-Course
     Menu", "Happy Hour Deal", "Chef's Tasting" are all printed menu headings
     and none of them is a dish. Re-run C.1's HEAD NOUN check on the phrase
     you just composed: if its head noun is a delivery wrapper (`menu`,
     `course`, `special`, `deal`, `combo`, `buffet`, `prix fixe`), you have
     composed a wrapper, not a dish — go back to C.1 and either redirect to
     the food the modifier names ("chicken special" → `chicken`, "nigiri
     special" → `nigiri`), or emit no dish ("tuesday special", "lunch deal",
     "happy hour tasting menu").

5. **Normalize**: lowercase; use the natural singular ("taco", not "tacos";
   but keep "noodles" where the singular is awkward); minimal punctuation.
   **Never reorder tokens** — emit the word order the source used — and keep
   every letter as the writer spelled it, diacritics included ("phở", never
   "pho", when the source wrote the marks).

**Never emit a truncated or abbreviated food token.** If a word is cut short
("jap" for jalapeño), write the full word or drop it. A truncated token can
land on an unintended and offensive word.

### C.3 Build the categories (THE PREDICTION TEST)

`food_categories` are the broader **orderable dish classes** the `food` rolls
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
   if removing the time-word leaves a wrapper (`special`, `menu`, `deal`),
   there was never a dish.
3. **Add 1–3 parent classes** the dish clearly belongs to, even when unstated —
   **dish shapes that each pass the ORDER TEST** (dessert, pastry, coffee, tea,
   sandwich, soup, salad, pizza, taco, burger, noodle, dumpling). A category
   says WHAT ARRIVES, never where it is from: **a cuisine is NEVER a parent
   class.** The pull is strongest exactly where the dish is most
   tradition-bound — the salient parent of "mapo tofu" in your head is
   "chinese food", and it is wrong here. Say "I'll have the \_\_\_" of every
   entry before it lands: "taco", "soup", "dessert" order something;
   "chinese", "italian", "japanese" name a tradition, an axis whose home is
   the attribute sides (D.4) — "mapo tofu" → `["mapo tofu", "tofu"]`, with
   `chinese` in `food_attributes`/`restaurant_attributes` and never in
   `food_categories`. A printed menu section is a category only
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
for the same dish produce two entries with identical `food` and distinct
restaurants.

### C.5 Ingredients

`ingredients` records ingredient nouns **THIS SOURCE names for THIS dish** —
the same kind of claim as everything else: something the writer said, not
something you know. Two sources only:

1. Additive clauses: "pasta **with burrata, chanterelles, and pesto**" →
   `["burrata", "chanterelle mushroom", "pesto"]`.
2. Ingredient nouns inside the dish name: "gruyere popover" → `["gruyere"]`.

**Never add ingredients from your own knowledge**: "al pastor taco" → `[]`
unless the source names contents. Singular, lowercase. An empty list is the
expected output for most mentions.

---

## Step D — What is left over? (THE STANDALONE TEST)

Only now, with the order-name settled, look at what remains. Every leftover
modifier must clear two bars to become an attribute.

**Attributes are PREDICATES, and predicates come only from THIS source's own
words.** Surrounding context — the ask, parent comments, siblings — resolves
the SUBJECTS of a claim (which place, which dish; Steps B and E); it never
supplies what is CLAIMED about them. Before any word enters an attribute
array, point to the words of this source that state it — or, for a cuisine
alone, to the dish name this source composed (D.4). The ask's words, a
parent's words, the venue's own name, and your knowledge of the venue are
not this source's words. **An empty attribute array is the normal output for
a bare-name pick.**

**A NAME IS A SUBJECT-IDENTIFIER, NEVER EVIDENCE OF A PROPERTY.** Words
spent NAMING are not words DESCRIBING. The tokens inside a venue's name —
"Cuantas Hamburguesas", "4 Charles Prime Rib", "Phoenicia bakery and deli",
"p Thais" — do appear in this source's text, but the source used them to say
WHICH place, not WHAT the place is like: they license no cuisine, no venue
type, no attribute of any kind, on either side. (C.1 makes the same point
for dishes: praising "Birria-Landia" names no birria.) A property enters an
attribute array only when the source's DESCRIBING words state it — or via
the single licensed inference, D.4's cuisine from the dish THIS source
composed.

### D.1 Does it describe, or does it judge?

**A real attribute states a property the food or place objectively HAS. Praise
states HOW GOOD it is.** Only descriptions are attributes.

- `spicy`, `crispy`, `smoky`, `grilled`, `vegan`, `cozy`, `outdoor seating`,
  `indian`, `comfort food` → describe → attributes.
- `delicious`, `tasty`, `amazing`, `incredible`, `insane`, `flavorful`,
  `seasoned perfectly`, `solid`, `best`,
  `elite`, `top notch`, `quality`, `specialty`, `favorite`, `standout`,
  `award winning`, `worth the trip`, `must-try`, `hidden gem`, `iconic`,
  `famous`, `world class` → judge → **NOT attributes. Drop them.**
- The test: **could the same word describe a BAD dish?** "spicy" yes (a dish
  can be badly spicy) → attribute. "delicious" no → praise, drop.
- The very praise that made this source eligible in Step A is what feeds
  `general_praise` in Step F. It must NOT also become an attribute.

### D.2 THE STANDALONE TEST

**Severed from the noun it modified, does this word still mean one definite
thing a diner could filter by?**

- **PASSES**: `gluten free`, `spicy`, `smoky`, `crispy`, `vegan`, `patio`,
  `counter service`, `byob`. Each means the same thing wherever it lands.
- **FAILS**: `rich`, `light`, `thin`, `thick`, `heavy`, `simple`, `hearty`,
  `old school`, `classic`, `authentic`, `traditional`, `generous portions`,
  `bright`, `clean`, `filling`. A **light roast**, a **light marinara**, and a
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
- **When a word is part of the order-name, it already rode into `food` in Step
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
  - A format or deal that FAILS prediction ("tasting menu", "buffet", "prix
    fixe", "lunch special", "3-course menu" — what arrives could be anything)
    is not food, and it CAN be a restaurant attribute when it characterizes
    how the venue serves. Normalize a modified wrapper to its BARE form for
    the attribute: "wagyu tasting menu" and "lunch tasting menu" both yield
    the venue attribute `tasting menu`, never the modified string. A meal
    deal yields `good value` at most, never a food.
  - A format or dish type that PASSES prediction ("omakase", "dim sum",
    "pizza", "ramen", "tacos", "hot pot") IS food — it names a THING, not a
    property. A place doesn't HAVE pizza as a quality, it SERVES pizza, and
    that claim belongs in `food`/`food_categories` where it ranks and
    searches as food. A pizza place's venue-side identity is its cuisine
    ("italian"), never the dish word. ("Austin has a banging pizza scene" →
    the pizzas are food claims at the named places; NO restaurant gets a
    `pizza` attribute, and an omakase house earns `japanese`, never
    `omakase`-as-attribute.)

### D.4 Which side does it attach to?

Scope follows **what the property describes**, not where the word sits.

- **Dish property → `food_attributes`**: anything that could appear in a
  menu-item description — preparation-as-property ("grilled", "house-made"),
  texture ("crispy", "creamy"), flavor ("spicy", "smoky"), temperature,
  dietary ("vegan", "gluten free").
- **Place property → `restaurant_attributes`**: anything that stays true if the
  menu changed — setting ("patio", "rooftop"), ambiance ("cozy", "lively"),
  service model ("counter service", "fine dining"), operational ("BYOB",
  "takeout", "reservations required"), group fit ("family-friendly"), price and
  value ("cheap", "good value", "expensive"), accessibility. **Price talk about
  a specific dish is still a place-level signal.** A venue TYPE ("bakery",
  "food truck", "sushi bar", "cocktail bar") is a place property ONLY when
  this source's own text calls the place that — never because the ask did,
  and never because the dish implies it (a cake claim does not make the
  venue a `bakery`).
- **A CUISINE ATTACHES ON BOTH SIDES, ALWAYS — and its ONLY inference base is
  the dish THIS source composed.** A cuisine is a property of the dish AND of
  the place, never either/or. **Infer it from the dish's identity even when
  unstated**: "chicken tikka masala" → `indian` in `food_attributes` on
  that dish AND in `restaurant_attributes`. This holds when the dish's cuisine
  differs from the venue's: tacos at a Korean spot give the dish `mexican` and
  add `mexican` to the restaurant's attributes **in addition to** `korean`.
  Use ONE canonical spelling per cuisine — `mexican`, never "mex",
  "mexican food", or "tex-mex-ish".

  That dish-name inference is the SINGLE licensed inference in this step, it
  runs on the dish's name **as this source said it** — nothing else — and it
  yields a CUISINE only, never a venue type: "funfetti cake" licenses no
  `bakery`, "sushi" licenses `japanese`, never `sushi bar`. The
  thread may tell you WHO is being discussed (Step B); only this source's own
  words tell you WHAT is claimed about them. **When this source composed no
  dish, there is nothing to infer from**: a restaurant-only mention carries a
  cuisine (or any attribute) only when this source's own text states one.
  These are NOT inference bases, ever:
  - **Your world knowledge of the venue.** A bare list — "Momoya soho, La
    dong, shuka" — carries NO cuisines, however well you recognize the
    restaurants. The same off-limits rule as B.3's names: emission records
    what was OBSERVED.
  - **The venue's own name.** "1618 Asian Fusion" states no cuisine claim,
    just as "Birria-Landia" names no birria dish (C.1).
  - **The ASK.** Its cuisine, price, and venue-type words ("Mexican
    restaurant vibe", "cheap", "bakeries") describe what the ASKER wants. A
    bare-name pick answers the ask without asserting its constraints — the
    pick says "go here", not "this place is mexican/cheap/a bakery".
  - **A parent or sibling comment.** "ilili is fire" under a parent praising
    ilili's "beautiful Mediterranean mezzes" inherits the REFERENT ilili and
    nothing more — never the parent's `mediterranean`, dishes, or verdicts.
    Those are the parent source's claims and emit from the parent's id only.

- **DIETARY LIFESTYLE CLAIMS ARE NEVER DROPPED.** Whenever a source asserts
  vegan / vegetarian / gluten free / halal / kosher about a dish or venue —
  including softer phrasings ("celiac-friendly", "plant-based", "GF options") —
  normalize to the canonical term and emit it. These power hard search toggles
  whose entire coverage comes from these claims; a missed mention is a
  permanently invisible restaurant to the user who needs it most. Venue-level
  ("great GF options") → `restaurant_attributes`; dish-level ("the vegan
  ramen") → `food_attributes` on that dish AND `restaurant_attributes`.
- **Styles and pure occasions**: styles ("comfort food", "street food") and
  when-only occasions ("lunch", "dinner", "late-night", "happy hour") are
  properties. Tied to a dish they are `food_attributes`; describing the place
  ("great happy hour", "open late") they are `restaurant_attributes`. A style
  named with no dish ("great comfort food here") lands whole on
  `restaurant_attributes` so the place stays searchable.

### D.5 Normalize and gate

- Lowercase; natural singular; deduplicate within each array.
- **Prefer the plainest common form** of a property — do not invent a novel
  phrasing when a standard one exists.
- Attach an attribute **only to the mention whose text supports it.** An
  attribute stated for one dish or one restaurant never attaches to another.
- **Final gate**: before emitting ANY term, re-run D.1 and D.2, then point to
  its source: the words of THIS source that state it, or the dish name that
  licenses a cuisine. A term whose only support is the ask's wording, a
  parent's wording, or your own knowledge of the venue does not pass. If it
  judges quality, fails the STANDALONE TEST, is a bare ingredient or filler,
  or has no in-source support, drop it. **It is correct to emit an empty
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
- **Restaurant-only**: no dish named and none inherited → `food` and
  `food_categories` both null, `is_menu_item: false`.

Set `true` only with strong evidence; when unsure, `false`.

**A dish this source never named is never `true`.** When the dish was
INHERITED from the ask, or adopted from a parent, THIS source did not narrow
it to one item — `is_menu_item` is `false` no matter how specific the ask's
wording was. `true` requires the narrowing to happen in this source's own
words.

**Answering an item-specific ask.** When the ask names a target dish ("best
burger in EV?") and a reply ONLY names a restaurant while passing the TESTIMONY
TEST (a bare name answering a judgment ask passes it via the ANSWER TEST in
A.1 — do not re-litigate the gate here), reuse the ask's target as
`food`/`food_categories` with
`is_menu_item: false`. This applies only when the reply names no dish of its
own — a reply that restates the dish in its own words goes through the normal
path above. **The inherited target must be an ORDERABLE DISH — it must pass
BOTH the ORDER TEST and the PREDICTION TEST**, because each catches what the
other misses:

- "best burger in EV?" → `burger` passes both → inherit it.
- **A dish wrapped in a venue type is still a DISH ask.** "best burger
  joint?", "quán phở nào ngon nhất?" ("which phở place is best?") target
  the dish through the kind of place that serves it: the dish inside the
  wrapper (`burger`, `phở`) passes both tests and IS inherited as `food`.
  The reply's restaurant name containing the same dish word ("Phở Lệ")
  changes nothing — the inherited dish is the ASK's food language, not a
  dish minted from the venue's name. The boundary in one sentence: **the
  ask's named DISH is a SUBJECT — it becomes what the reply's claim is
  about, gated by the ORDER and PREDICTION tests; the ask's cuisines,
  vibes, price words, and venue-type words are PREDICATES and never
  transfer — not as `food`, and not as attributes.** "Mexican restaurant
  vibe?" answered by a bare name is a restaurant-only mention with EMPTY
  attributes; no `mexican` rides over from the ask.
- "nice dinners on a budget?", "lunch spots?" → `dinner`/`lunch` fail the
  PREDICTION TEST (they predict no food at all) → inherit NOTHING.
- "best Indian around?", "where for comfort food?" → `indian`/`comfort food`
  PASS prediction (they do predict a kind of food) but FAIL the ORDER TEST —
  a cuisine or style is not a thing you order — so they inherit NOTHING at
  all: not as food, and not as attributes either. Inheritance fills the
  SUBJECT slots of a claim (which place, which dish — "best burger" does
  hand its replies `burger`); it never supplies PREDICATES. The ask's
  cuisine, style, price, and venue-type words are the ASKER's; Step D
  attaches only what THIS reply's own text states, so a bare-name reply to
  a cuisine or style ask is a restaurant-only mention with EMPTY attributes:
  "Best Indian around?" → "Ravi Kabab, hands down" emits `ravi kabab` with
  NO `indian` anywhere — not as food, and not as an attribute (neither from
  the ask's words nor from your knowledge of the venue).
  A reply that inherits nothing is a restaurant-only mention. **The ask itself
  never emits.** Cuisines and dietary flags never enter `food_categories`.

Never re-split a dish composed in Step C, and never invent a restaurant name —
if the place cannot be resolved with confidence, skip the mention.

---

## Step F — Assemble the output

### F.1 `general_praise`

`general_praise: true` marks **THE CARRIER of holistic, place-level
endorsement** — "this place is incredible", "my favorite spot in Austin", or
a name offered as the writer's own pick (the ANSWER TEST, A.1). Decide
placement by what the praise NAMES:

- **Aimed at a dish** ("the brisket is unreal") → that dish's mention with
  `general_praise: false` — the praise IS the dish connection; no carrier is
  created.
- **Aimed at the place as a whole** (or an ANSWER-TEST pick) → ONE
  restaurant-only mention (`food` null) with `general_praise: true`, per
  source per restaurant.
- **Both at once** — a source that praises the place holistically (or IS a
  pick) AND names dishes — emits both: the dish mentions at `false` PLUS the
  restaurant-only carrier at `true`. The pick endorsed the place, not only
  the dishes it went on to name.

The invariant that follows: **`general_praise: true` lives ONLY on a
restaurant-only mention (`food` null).** Before emitting, if any mention
carries BOTH a non-null `food` and `general_praise: true`, split it — the
dish keeps `false`, the `true` moves to a restaurant-only carrier. It is an
independent axis: composing a dish neither creates nor suppresses it, and
endorsing a place neither creates nor suppresses a dish. Availability,
popularity, and price are never endorsement (Step A.2).

### F.2 Fields

Emit one object per mention with these fields, in this order:

- `temp_id` (REQUIRED) — a unique identifier for this mention within your
  response, e.g. `"m1"`, `"m2"`. Every mention needs one.
- `restaurant` (REQUIRED) — the canonical name from Step B.3.
- `restaurant_attributes` — array or null.
- `food` — the order-name from Step C, or null.
- `food_categories` — array or null.
- `ingredients` — array or null (usually empty).
- `is_menu_item` — boolean or null.
- `food_attributes` — array or null.
- `general_praise` (REQUIRED) — boolean.
- `source_id` (REQUIRED) — the chunk-local id copied EXACTLY from the input
  payload's `id` field for the source this mention came from (e.g. `SRC004`).
  Never invent, reformat, or borrow another source's id.

Rules:

- **JSON only.** No markdown fences, no commentary.
- When a property has no values, omit it or set it to `null`. Never emit empty
  strings.
- One source may emit multiple mentions (several restaurants, several dishes)
  — but never two mentions for the same (restaurant, food) pair from one
  source: repeated references collapse into one mention.
- A mention with no food, no attributes, and `general_praise: false` asserts
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
      "restaurant": "nixta",
      "restaurant_attributes": ["mexican"],
      "food": "duck carnitas taco",
      "food_categories": ["taco", "carnitas"],
      "ingredients": [],
      "is_menu_item": true,
      "food_attributes": ["crispy", "mexican"],
      "general_praise": false,
      "source_id": "SRC004"
    },
    {
      "temp_id": "m2",
      "restaurant": "suerte",
      "restaurant_attributes": ["mexican"],
      "food": "duck carnitas taco",
      "food_categories": ["taco", "carnitas"],
      "ingredients": [],
      "is_menu_item": true,
      "food_attributes": ["smoky", "mexican"],
      "general_praise": false,
      "source_id": "SRC004"
    },
    {
      "temp_id": "m3",
      "restaurant": "nixta",
      "restaurant_attributes": ["patio", "mexican"],
      "food": null,
      "food_categories": null,
      "ingredients": [],
      "is_menu_item": null,
      "food_attributes": null,
      "general_praise": true,
      "source_id": "SRC004"
    }
  ]
}
```

Note what this example demonstrates: singular `food` and singular categories;
`crispy` and `smoky` pass the STANDALONE TEST while a word like "rich" would
not; the inferred cuisine `mexican` on BOTH sides of both dishes; the patio as
a place property; and ONE carrier for the holistic praise (`m3`), with the dish
mentions at `general_praise: false`.
