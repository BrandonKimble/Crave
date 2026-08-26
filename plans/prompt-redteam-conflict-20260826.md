# Red team: collection-prompt.candidate.md — internal conflict & synergy (2026-08-26)

Target: `apps/api/src/modules/external-integrations/llm/prompts/collection-prompt.candidate.md`
(read in full) + `COLLECTION_RESPONSE_JSON_SCHEMA` in
`apps/api/src/modules/external-integrations/llm/prompts/llm-response-schemas.ts`.
Method: pairwise rule composition, model's-shoes walks on the three flapping
texts, bolt-on hunt, cross-reference audit. Findings are ranked; each gives the
two passages, the tear, and the rederived shape (never a patch).

## Plain-language summary

The prompt's biggest internal war is **closure**: one law says judge every
clause on its own and never guess that a place closed; another law says a
closure stated anywhere silences everything, and a "who remembers…" ask makes
every reply inherit closure. The remembrance post sits exactly on that fault —
that's why it flaps. Second: the trip-report rule ("past tense = every place
was eaten at") reads like a blanket pass, while the bare-attendance rule says
"I went to X" with no verdict emits nothing — the Austin trip list sits on that
fault. Third: two different sentences define when a reply inherits the ask's
dish (C.1 says "a pick"; Step E says "any reply that only names a restaurant"),
and the fit assertion is defined only for an "unqualified pick" — a reply with
its own verdict (Luckys) falls between the definitions. Fourth: nothing says
what happens to the ask's dish-side adjectives ("crispy fries") — venue words
are covered, the dish noun is covered, the adjective on the dish noun is
covered by neither, which is exactly the leak we observed. Plus a same-bullet
contradiction (a neighborhood tag is both a "plain annotation" that keeps a
pick and "a location" that strips it), and a set of bolt-on clauses that should
dissolve into their arms' principles.

---

## F1 (SEVERE) — Closure fights the clause-by-clause law, the no-genre law, and "never guess a closure"

**Passage 1** (Step A opening): "a fact about its own clause and never
silences the writer's other clauses"; "A source has no genre… The A.2 failures
below are failures of CLAUSES, not of sources."

**Passage 2** (A.2 CLOSED PLACE): "A closure stated anywhere in scope silences
every mention of that place in this post object"; and the ask-criterion
appendage: "an ask whose SELECTION CRITERION is the place being gone… each
named place inherits the ask's closure frame and emits nothing, unless its own
source says the place is open." Meanwhile the same arm says: "Places whose
status is unstated remain eligible; never guess at a closure."

**The tear.** Closure is the only A.2 arm that is explicitly NOT a clause-level
fact — it is a place-level fact with post-object scope — but it lives inside
the clause-level list, under an opening that swears no clause silences another.
The ask-criterion appendage goes further and does exactly what the no-genre
paragraph forbids: it classifies the SOURCE ("a remembrance ask") and silences
every clause in it and below it. And it contradicts its own sibling sentence:
a reply naming a place with UNSTATED status is "eligible, never guess" by one
sentence and "inherits the ask's closure frame" by the next. A model holding
all four sentences has two defensible procedures and no priority order.

**Model's-shoes walk — text (c), the remembrance post.** "A memorable meal at
a place that didn't last long", body praises an unnamed place, mentions bowling
at Dart Bowl. Pass 1: no-genre + clause-by-clause → the praise is real
testimony about a past meal; the praised place is unnamed → dies at B.1; Dart
Bowl is named → is it the meal's place? The text genuinely underdetermines
whether Dart Bowl (which had a cafe) IS the memorable place or a landmark
aside — B.1's "two anchors equally likely, stop" should end it, but B.1's
"praise of an unnamed venue never migrates to a DIFFERENT place the source
names" tempts resolution either way. Pass 2: ask-criterion arm → the whole
post is a closure-framed ask, everything inherits closure, emit nothing. Both
walks are licensed; the flap is the prompt's, not the model's. (Note the
title's own hedge — "didn't last long OR you never went back" — the second
disjunct is not even a closure criterion, so frame-inheritance is doubly shaky.)

**Rederived shape.** Closure is not a testimony failure; it is a **place
status**, resolved where places are resolved — Step B. Move it out of A.2
entirely: *when Step B resolves a place, it also resolves that place's status
from every in-scope statement ABOUT the place (a closure statement, an ask
whose criterion is the place being gone, present-tense contradiction), one
status per place per post object; writer tense alone never sets it; unstated
= open; a place resolved closed emits nothing from any source.* This single
relocation dissolves: the clause-vs-post-scope contradiction (place status was
never clause-scoped), the no-genre violation (the ask isn't a genre verdict,
it's a status statement about the places it names), the "never guess" clash
(the ask IS a stated status, not a guess), and the whole ask-criterion bolt-on.

## F2 (SEVERE) — "Tense decides" reads as a blanket pass; bare attendance says the opposite

**Passage 1** (A.2 PLAN): "the SAME list shape in the past tense — 'just got
back', 'here's what we ate through', 'how did we do?' — is a trip REPORT, and
every place on it was eaten at. Tense decides, never the shape."

**Passage 2** (A.1): "**Bare attendance is not testimony**: 'I've only been to
Cuba512'… state that the writer WAS somewhere, and nothing about the food —
they fail, however recent or first-person the visit." Also A.3: "each
restaurant and each dish carries its own verdict."

**The tear.** "Every place on it was eaten at" is written as the mirror image
of the plan arm (plan → emit nothing; report → …emit everything?). But eaten-at
is attendance, and attendance without a verdict fails A.1. The prompt never
says which reading wins for a report entry with no per-entry verdict; worse,
A.1's "Asking for feedback on an experience already had IS testimony" ("how
did I do?") blesses the report frame wholesale, amplifying the blanket-pass
reading.

**Model's-shoes walk — text (b).** "Just got back from Austin and did Perla's,
Odd Duck…" Reading 1 (tense-decides-as-pass): the report shape endorses; emit
Perla's and Odd Duck as `general_praise` carriers. Reading 2 (per-entry
verdict): "did Perla's" is bare attendance → nothing; "Odd Duck had the best
corn rib" carries a verdict → dish mention `corn rib` at Odd Duck; Perla's
emits nothing. Both are defensible from the text of the prompt — the observed
flap. (Side note: "X had the best Y" brushes A.2 AVAILABILITY's literal "X has
Y" tell; net-direction saves it, but the availability arm should say its tell
is *availability with no verdict*, so a judge-word inside the "has" clause
never trips it.) The Elvis Presley combo is F6 below.

**Rederived shape.** The tense clause is only there to kill the plan false
positive; rederive it so it can't over-claim: *tense decides whether the
writer is REPORTING or PLANNING — nothing more. A report earns Step A's normal
clause-by-clause reading: each entry emits on its own verdict, and an entry
that is only attendance emits nothing.* "Every place on it was eaten at"
deletes; it asserted a fact the arm never needed.

## F3 (SEVERE) — Two definitions of dish inheritance + an undefined "unqualified", between them the Luckys flap

**Passage 1** (C.1 Gate 3): "with ONE inheritance: when this source is **a
pick** answering a dish-targeted ask, the ASK's food language walks these same
gates."

**Passage 2** (Step E): "When the ask names a target dish… and **a reply ONLY
names a restaurant while passing the TESTIMONY TEST** (a bare name answering a
judgment ask passes it via the ANSWER TEST in A.1 — do not re-litigate the
gate here), reuse the ask's target as `item`."

**Passage 3** (Step D opening): "**an unqualified pick** answering a
constrained ask asserts fit."

**The tear.** C.1's trigger is "a pick" — a name whose testimony IS the choice
(the ANSWER TEST). E's trigger is broader: any reply that names only a
restaurant and passes testimony — including one that passes on its OWN verdict.
And D's fit assertion is defined only for an "unqualified" pick, a word the
prompt never defines: is a reply that adds its own verdict ("its the real
deal") qualified? The three passages carve three different sets of replies.

**Model's-shoes walk — text (a), Luckys.** Thread: a (say) deep-dish rec ask
dominated by Lefty's. Comment: "OK so i went and tried Luckys. Former
chicagoan here - its the real deal, thumbs up." Names: B.3 is unambiguous and
strong — emit `luckys` from this source, never `lefty's` (the observed-span
contract holds; no conflict here). Testimony: passes on its own verdict, not
the ANSWER TEST. Now: Reading 1 (E's trigger) — the reply only names a
restaurant, so inherit the ask's `pizza`/`deep dish` as item,
`is_menu_item: false`, plus the place carrier. Reading 2 (C.1's trigger) —
this is not a bare "pick", it is self-standing testimony; nothing inherits;
restaurant-only `general_praise: true`. Both licensed → flap. Fit assertion
adds a third micro-flap: does "the real deal" reply fit-assert the ask's
"chicago style"/"deep dish" venue words, or is it no longer "unqualified"?

**Rederived shape.** One trigger, defined by what the reply LACKS, not how it
passed Step A: *a reply that passes the TESTIMONY TEST and contains no food
language of its own takes its subject and its place-side fit from the ask —
the ask's dish (gated by ORDER + PREDICTION) becomes the claim's subject, and
the ask's venue-constraint words become the pick's place-side claim — unless
the reply re-scopes or pushes back on the ask's frame.* "Pick", "bare",
"unqualified" all collapse into "contains no food language / no re-scoping of
its own"; C.1, D, and E then describe one rule from three angles instead of
three rules.

## F4 (HIGH) — The ask's dish-side adjectives have no rule ("crispy" leaked)

**Passage 1** (Step D opening): "the ask's VENUE-level constraint words
('romantic', 'cheap', 'outdoor seating', a cuisine like 'mexican') are that
pick's own claim… Fit-asserted words land on the PLACE side… its dish words
are SUBJECTS handled in Step C/E, never attributes."

**Passage 2** (Step E boundary sentence): "the ask's named DISH is a SUBJECT…
the ask's cuisines, vibes, and price words are PREDICATES."

**The tear.** "Best crispy fries in town?" → bare pick. "Crispy" is not a
venue-level constraint (it modifies the dish), so the fit assertion doesn't
claim it; it is not the named dish head, so the subject rule doesn't obviously
carry it; it IS a describing word that passes D.1/D.2 — and D's opening says
fit-asserted words walk D.1/D.2 "like any stated word," which is the exact
groove the model slid down when it emitted `crispy` as an `item_attribute`
from the ask. The enumerations in both boundary sentences cover venue words
and the dish noun; the adjective ON the dish noun belongs to neither list, and
under the method canon a non-exhaustive list is precisely where this leaks.

**Rederived shape (and its home).** No new rule — extend the subject principle
to the whole phrase, at C.1 Gate 3 where inheritance happens: *the ask's food
language is inherited AS A PHRASE and walks C.2 whole — whatever C keeps in
the order-name ("crispy fries", like "thin crust pizza") IS the subject;
whatever C would peel dies, because attributes require THIS source's
describing words and a bare pick has none on the dish side. Nothing from an
ask ever enters `item_attributes`.* The E boundary sentence then reads: the
ask's dish PHRASE is the subject; its venue words are the fit-asserted
predicates; there is no third bucket. This also harmonizes with C.2's
existing "a style word inside an order-name is never peeled into an
attribute."

## F5 (HIGH) — Same bullet, opposite verdicts on a location tag

**Passage 1** (A.1 ANSWER TEST, condition 2): "Positive or plain annotations
do not [strip] ('for dinner', 'if central', **a neighborhood tag**)."

**Passage 2** (same bullet, two sentences later): "An operational annotation
('serves BBQ', **a location**, hours) re-frames its entry as availability —
that entry also emits nothing."

**The tear.** "Sip Pho if central" keeps; "Sip Pho — on 5th st" strips? Both
are locations. The bullet blesses a neighborhood tag as plain and condemns "a
location" as operational with no line between them — a reply like "Cabernet
Grill (Fredericksburg Rd)" is decidable both ways. This is also where the
directory tell (A.2 external criterion: "per-entry operational annotation…
addresses as a roster") back-feeds into single answers.

**Rederived shape.** The distinction was never plain-vs-operational wording;
it is *what the annotation does to the choice*: an annotation that helps the
asker USE the pick (where it is, when to go, which branch) leaves the pick a
pick; an annotation that replaces taste as the REASON the name appears (it's
open, it's participating, it merely sells the thing) re-frames it as
availability. State that principle and drop both example lists — the A.2
directory tell ("did taste choose these names, or did a fact about the
world?") is the same principle and should be cited as such, one rule in two
places becoming one rule.

## F6 (MEDIUM) — The proper-name wrapper: C.1 wins on paper but fights E's sameness bar and F.1's semantics

**Passage 1** (C.1): "a proper name or theme ('elvis presley combo'…): no
dish… but the mention still EMITS, restaurant-only with
`general_praise: true`: praise of a deal is VALUE testimony."

**Passage 2** (Step E): "the bar: could two diners each order 'the X' here and
be handed the same thing?" and F.1: "`general_praise: true` marks THE CARRIER
of **holistic, place-level** endorsement."

**The tear.** "The Elvis Presley combo at X was great" — the combo is one
fixed, named, orderable offering; E's sameness bar screams `is_menu_item:
true`, and C.2 even flags the tension ("the sameness question… never decides
that a wrapper IS a dish") — the priority IS stated, so the model usually
obeys. The residual tear is semantic: F.1 defines the carrier as HOLISTIC
place endorsement, but here the praise is aimed at one combo, not the place —
the model is told to emit a flag whose definition the text doesn't satisfy.
That mismatch is a hesitation point (and a certification flap risk: emit the
carrier, emit nothing, or emit a dish).

**Rederived shape.** Give the wrapper arm its own honest principle instead of
borrowing F.1's: *a wrapper's praise is testimony that eating at this place is
worth it — that is exactly the place-level connection, and the carrier is its
shape; the wrapper's CONTENTS are the place's food, not a dish this source
named.* Fold that sentence into F.1's "aimed at" triage (praise aimed at a
delivery wrapper → the place carrier), so F.1's own text licenses what C.1
orders. Also worth an owner look: a proper-named fixed combo genuinely is a
menu item; if the sameness bar is the real principle, "elvis presley combo"
belongs with "ploughman's lunch" (named composed offering), and the wrapper
list should be about heads that are wrappers *as used*, not tokens.

## F7 (MEDIUM) — Adoption vs closure/negative parents: the spanning rules never say how they compose

A.1 adoption ("+1… adopts the parent's testimony") composes with the
depth-aware order, but nothing says what "+1" adopts under a parent that is a
eulogy ("Lulu B's was the best… they closed suddenly" → child: "+1 miss that
place") — the closure-silences rule (F1) should win, but adoption's text says
the agreement "puts this writer's judgment behind the same claims," and the
parent's praise clauses ARE claims by A.2's own eulogy framing ("praise beside
the closure is a eulogy"). Under the F1 rederivation this resolves for free
(the PLACE is closed, so nobody's mention of it emits); until then it is a
live tear. Same gap for "+1" under a hedged parent (adopts… what, exactly? —
presumably nothing, but unstated).

## F8 (MEDIUM) — Bolt-on inventory and the arms that absorb them

Each of these reads as an accreted patch ("including X", "even when Y", "this
holds even when"); each dissolves under a rederived arm:

1. **A.2 ASK arm**: "including an ask that names its target with admiration…
   and including a BENCHMARK inside an ask." Rederived arm: *every name inside
   a request is part of what is being asked — target, benchmark, example, or
   anchor — and a question's furniture never carries the answer's verdict.
   Only answers emit.* Both "including" clauses become instances.
2. **A.2 AVAILABILITY**: "This holds even when the availability answers a
   FINDABILITY ask…" Rederived arm: *an answer asserts exactly what the ask
   requested — a location ask's answer asserts location, a judgment ask's
   answer asserts preference* (this is already A.1 condition 1 and the arm's
   own closing sentence; state it once, as the arm's principle, and the
   "even when" paragraph and the Casa Columbia carve-out become examples).
3. **A.2 APPEARANCE**: "and no exclamation mark makes it one. This covers
   announcing an arrival or the business's success ONLY —…" Rederived: *an
   announcement states presence; testimony states eating. The clause's verb
   decides* — then the exclamation-mark and "ONLY" fences are unnecessary.
4. **A.2 CLOSED PLACE**: the whole three-clause accretion (tense-inference
   fence, anywhere-in-scope scope, ask-criterion frame) — absorbed by the F1
   relocation to Step B place-status.
5. **A.1 ANSWER TEST**: "This is true of a single bare name…, of a list…, of
   an annotated list…, and of a reply that ADDS names…" + "Presentation never
   demotes a pick." Rederived: *the unit of an answer is each NAME, whatever
   the reply's format; format is presentation, and presentation is never
   evidence either way.* The four-way enumeration and the headings clause
   become one sentence.
6. **B.1 shorthand rule**: "Every other name in the list, and all
   dish/testimony handling, is untouched by this rule" is a blast-radius
   fence, and the rule is then RESTATED in B.3's capitalization override
   (two homes, drift risk — it has already drifted once into an example list
   duplicated verbatim). Rederived, once: *an emitted name must contain a
   brand token observed in this input; a bare generic word in a name slot is
   a pointer, and a pointer whose target is not observed in this input emits
   nothing.* B.3 then cites B.1 instead of re-legislating it.
7. **A.2 MIDDLING**: the ratings appendage ("When an entry carries a rating,
   THE SCORE IS that entry's verdict… adds nothing on top") — absorbed by
   stating net-direction as *read every verdict against the writer's own
   scale in this source*; a score is just a verdict written as a number.
8. **A.2 PLAN**: "The check cuts both ways…" — see F2; the reverse direction
   over-claims and should shrink to "tense decides report vs plan, then
   Step A reads the report normally."

## F9 (LOW) — Cross-reference audit

Checked every by-name reference (B.1, B.3, D.4, F.1, F.2, Step C/D/E, the
ANSWER TEST, the fit assertion, the PREDICTION TEST). Results:

- **Sound**: B.3→B.1 (shorthand), C.3→D.4 (cuisine entry paths match D.4's
  two ways exactly), C.1→Step D (bare-wrapper venue attribute exists in D.3),
  D.4→C.1 (Birria-Landia), D.4→B.3 (off-limits world knowledge), E→A.1
  ("do not re-litigate"), E→Step D (fit assertion), F.1→A.1, F.2→F.1,
  B.1/B.3→F.2 (collapse rule), A.1 adoption→Step C wrapper. Schema
  descriptions agree with the prompt (item never a wrapper/cuisine/venue
  token; categories never a cuisine; is_menu_item inherited-never-true;
  place shape as sole praise carrier — matches F.1/F.2 and the v17 §4 split).
- **Drifted**: C.1 Gate 3 ("a pick answering") vs Step E ("a reply ONLY
  names a restaurant while passing the TESTIMONY TEST") — the referent sets
  differ; this is F3, and one of the two must become the citation of the
  other.
- **Duplicated, not yet drifted**: the "Vinnie's, Williamsburg Pizza, Best,
  Smiling, Ben's" list and its rule live in full in both B.1 and B.3 (F8.6);
  the fit-assertion is legislated in full in both D's opening and E's cuisine
  bullet ("Best Indian around?" walk) — E should cite, not restate: today the
  two copies agree, and every future edit must hit both or they fork.
- **Cosmetic**: F.2 says a DISH mention "has NO general_praise field" while
  the schema merely omits it from the dish shape's properties (consistent;
  constrained decoding enforces it). A.1's adoption bullet emits
  "`general_praise: true`" before the term is defined (forward reference to
  F.1 without naming it — name it).

## Synergies worth keeping (so the rewrite doesn't lose them)

- The four named tests + cheapest-first ordering genuinely compose; every arm
  that cites a test by name resolved cleanly in the walks.
- B.3's observed-span contract is the strongest section: in the Luckys walk it
  produced zero hesitation on the NAME (the flap is all Step C/E inheritance,
  F3) — evidence the v17 §1 rederivation worked.
- D.4's cuisine never-inferred block and C.3's cuisine-is-not-a-parent block
  reinforce each other from both sides of the same boundary; the worked
  example (F.3) demonstrates exactly the rules most often broken.

## Recommended fix order

F1 (closure → Step B place status) and F3 (one inheritance trigger) first —
they own two of the three certification flaps. F4's boundary sentence lands
inside F3's rewrite (same paragraph). F2 is a two-sentence rederivation of the
PLAN arm. F5, F6, F7 next; F8's absorptions ride along wherever the rewrite
touches each arm; F9's duplications get collapsed to citations in the same
pass.
