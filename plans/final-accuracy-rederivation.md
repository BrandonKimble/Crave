# Final accuracy rederivation — the 8 wrongs + 2 misses (2026-08-30)

The coordinator's personal 301-mention audit found 8 true wrongs and 2 in-doc
misses. Mandate: for each, work out what a model FOLLOWING THE PROMPT EXACTLY
would do, find why the prompt's text licenses or fails to prevent the
emission, and fix the CAUSE by rederiving the owning section. No pins without
a rederivation behind them.

Territory: `apps/api/src/modules/external-integrations/llm/prompts/collection-prompt.candidate.md`,
`apps/api/scripts/fixtures/prompt-ab-cases.json` (14 new `FA*` cases),
quote-mirror untouched and green.

---

## CLASS A — dead dishes (3 wrongs)

**The obedient model's reading.** Gate 2's old DISH STATUS clause keyed on a
STATED REMOVAL: "any in-scope clause stating the dish no longer exists —
removed, replaced, renamed away…", capped by "Only VERBED removal kills."
A model following that text exactly looks for a removal verb about the dish:

- "La Santa Barbacha **used to have** a delicious strawberry horchata agua
  fresca" — past availability, no removal verb; nothing "states the dish no
  longer exists," so the dish reads as live and the warm adjective emits it.
- "Hopefully they'll **bring back** the Llano Poblano burger!" — the only
  verb is a RESTORATION verb, and it is future/hopeful; no clause verbs the
  removal, so the rule as written never fires.
- "cypress grill **did one over thanksgiving break one year**… so freaking
  amazing. i dream about it still" — a one-time past offering; nothing was
  ever "removed," so the removal-shaped rule has nothing to bite, and the
  vivid praise carries the emission.

The cause: the law was phrased as a removal-statement test when the ideal is
temporal — the failure lives exactly in past-availability phrasings that
entail goneness without verbing it.

**The rederivation (Gate 2, DISH STATUS).** The test is now TEMPORAL: *where
does this text place the DISH — the venue's present, or only its past?* The
tense of the EATING is explicitly severed from the tense of the dish (past
meals are how testimony normally reads). What places the dish itself in the
past: "used to have/make/serve", "back when they had", verbed removal,
mourning ("RIP the shake"), a restoration wish ("you only bring back what is
gone"), and a one-time offering from a bygone window. A loved-but-gone dish
earns NOTHING — no dish, no place carrier: memory never outranks a stated
ending, and the section now names the trap (vivid praise is how eulogies
read). Present availability, the ordering-idiom "off the menu", and a stated
return stay alive.

Pins: FA1, FA2, FA3 (must-not). Protections: FA12 (Culver's "has cod … and
it's good" stays a live dish — the live prompt actually FAILS this case, the
candidate passes), FA16 (past-tense meal narration alive), plus the existing
N21 off-the-menu idiom and N11/N20 closure pins, all still green.

## CLASS B — logistics-as-praise (2 wrongs + the Maudie's boundary)

**The obedient model's reading.** The criterion law said the ask's CRITERION
decides, and gave stock/hours/deals as fact-ask examples. Neither wrong is on
that list, and both asks wear taste words: "where are the **BETTER** places
to order 50+ breakfast tacos by 7am?" and "**AFFORDABLE** bars to rent for a
private party". A model reading "the criterion, read as what the asker is
polling for" sees "better"/"affordable" and calls it a judgment ask; the
picks then emit as praise. Capacity and rental were unrepresented classes,
and the superlative was doing criterion duty it never earned.

**The rederivation (A.1 condition 1).** Two additions at the decision point:
(1) **a superlative is courtesy dressing, never the criterion** — read the
criterion by what would make an answer WRONG: wrong because the food isn't
good → judgment ask; wrong because the place CAN'T DO THE THING (fill a
50-taco order by 7am, be rented for 50 guests, be open, stock it) → the ask
polls CAPABILITY, a fact ask, picks assert fit and emit nothing. (2) The
line that keeps it from over-rotating: a craving/occasion ask stays a
judgment ask however constrained ("date night that won't break the bank"
still polls where to eat WELL — a capability ask's constraints are the whole
question; an occasion ask's constraints narrow a field still ranked by
taste).

**The Maudie's ruling (pinned).** "Maudie's is my go to for this problem" is
habitual patronage SCOPED to the capability — habitual USE, not repeated
choice of the food — so it asserts fit and emits nothing. An unscoped or
food-scoped go-to ("my go-to", "my go-to for breakfast tacos") stays A.1's
vouch. This lands the boundary on the consistent side of the rederived law:
the stated scope of the habit is the criterion of the habit.

Pins: FA4 (Rosa's), FA5 (rental/URL pick), FA13 (Maudie's). Protection:
FA15 (ABGB under the date-night-budget ask still emits with praise).

## CLASS C — narration (1 wrong)

**The obedient model's reading.** Gate 3 already said narration births no
dish — but nothing forbade MARRYING a category-wide verdict in one clause
("Most cocktails were solid") to the one specific name that appeared only in
operations narration ("drink mixers to speed up the Ramos gin fizz prep").
The model, hunting a subject for "solid", grabbed the only named cocktail in
scope. The prompt policed each clause but not the cross-clause wedding.

**The rederivation (Gate 3, final wording after one over-rotation — see
iteration findings).** Added: **a verdict binds to its own subject —
resolved, not borrowed.** Resolution stays untouched (a pronoun resolves
into a neighboring availability clause; a plural subject like "their tacos"
is a dish claim as ever); what a verdict never does is MIGRATE to a subject
it doesn't have — "Most cocktails were solid" never retro-specifies onto
the Ramos gin fizz named only inside operations narration. The exact
Daydreamer text is the worked example.

Pin: FA6 (must-not `ramos gin fizz`).

## CLASS D — shelf (1 wrong)

**The obedient model's reading.** B.2's shelf law lived in the CLAUSE's own
words — "the text always tells you which." But the reply "I do enjoy the
beef fajitas though" carries no shelf marker; the shelf-mode lives in the
POST ("the stuff that you cook at home", "cooked on the grill"). Worse, the
salvage shape ("Not a fan… I do enjoy X though") reads as A.2's
conceded-upward verdict, which the prompt says STANDS — so testimony passed
and nothing in the reply's own text failed the PLACE TEST.

**The rederivation (B.2).** Added: **MODE is a fact about the GOOD, resolved
through the depth-aware order like any referent** — a reply inherits the
mode of the thing the thread discusses. A thread about a packaged at-home
product makes "I do enjoy the beef fajitas though" praise of the writer's
grill: shelf, nothing emits, and it says explicitly that a conceded-upward
verdict changes the verdict's DIRECTION, never the good's MODE. Escape
hatch: a reply's own words placing its food in a served context.

Pin: FA7 (must-not; emitsNothing).

## CLASS E — attribute fabrication (1 wrong)

**The obedient model's reading.** D.1's fold rule licenses renaming a
writer's word into a canonical term ("ambience" → `great atmosphere`). That
license, plus an attribute vocabulary full of familiar flavor words, is the
bridge: "strongest [margs] … fully toasted" states alcohol strength; the
model reached for the nearest familiar drink-intensity attribute and wrote
`spicy`. Nothing said the fold may never change WHICH property is claimed.

**The rederivation (D.1 + D.2).** Added to the fold: **the fold changes
SPELLING, never SUBSTANCE — a stated property is never mapped onto a
DIFFERENT nearby property to reach a familiar term**, with the strongest-marg
example named; and if the stated property fails the STANDALONE TEST on its
own word, it drops entirely rather than shape-shifting into one that passes.
`strong` added to D.2's FAILS list (strong drink / strong roast / strong
flavor diverge like "light").

Pin: FA8 (must-not `spicy`, must-not `strong`).

## MISS M1 — the "PLACE for FOOD" formula

**The obedient model's reading.** The reply's first sentence is first-person
testimony about Clark's; the second sentence is three verbless "X for Y"
entries. The ANSWER TEST's named shapes (bare name, list, annotated list)
did not include the formula, and beside a real first-person verdict the
verbless entries read as lesser — the model emitted the testified entry and
let the formula entries fall.

**The rederivation (A.1, ANSWER TEST).** Added the formula as the annotated
list at its most compressed: each "PLACE for FOOD" entry is a pick whose
"for" phrase names what to get there — those foods are the entry's OWN dish
words and walk Step C's gates. A first-person sentence beside such a list
never absorbs it (tied to B.1's most-common-miss law).

Pin: FA9 (hillside farmacy / junes all day / pool burger must emit;
`spicy chicken sandwich` must emit as a dish).

## MISS M2 — shared verdict before a choice

**The obedient model's reading.** This one the prompt CAUSED: A.3 said "the
endorsement lands on the one they settle on, never on the one they set
aside." "I love both but if I had to choose… El Dorado" settles on El
Dorado; the obedient model dutifully set Enchiladas y Más aside — ignoring
that "love both" is a stated shared verdict over both names.

**The rederivation (A.3).** Added: **settling decides PREFERENCE only, and
never un-says a verdict already stated over both.** "I love both but if I
had to choose, El Dorado" vouches for BOTH (B.1's shared-verb law); only an
option weighed with NO verdict of its own is set aside empty.

Pin: FA10 (both places must emit, with praise).

---

## Certification

Suite: 190 cases (176 existing + 14 new FA pins), `--repeat=3` per run,
three independent full runs. Gate: candidate all-PASS (pending-class cases
excluded by the harness as always), zero regressions vs live, quote-mirror
green, `yarn invariants` green.

Results (candidate; `prompt-ab.final.cert.run{1,2,3}.result.json`):

| run | PASS | FLAKY | FAIL | PENDING | regressions |
| --- | ---- | ----- | ---- | ------- | ----------- |
| 1   | 189  | 0     | 0    | 1 (N8, by design) | 0 |
| 2   | 189  | 0     | 0    | 1       | 0           |
| 3   | 189  | 0     | 0    | 1       | 0           |

(Live prompt on the same suite: ~105 PASS / ~83 FAIL — the 8 wrong classes
all reproduce on live, plus the previously-rederived vouch/value/offering
classes live never had.)

Quote-mirror green after every edit; `yarn invariants` green ("Every
invariant rejected the defect it was bought with"); prettier clean.

**Two iteration findings worth keeping.** (a) A first cut of the C1 fix
(a mid-sentence "letter for letter" parenthetical inside Gate 3's
inheritance law) flipped three UNRELATED boundary cases to 0/3 — prompt
edits at that decision point are chaotic; the surviving version rides at
the end of the existing example list. (b) A first cut of the Class C law
("a verdict on a CATEGORY never retro-specifies onto a name from a clause
that earned nothing") over-rotated: it blocked legitimate pronoun
RESOLUTION into availability clauses ("has cod for their fish n chips and
it's good" lost the dish) and read plural subjects as categories ("their
tacos have no business being as good" lost `taco`). The final wording
separates resolution (untouched, with both protections as worked examples)
from migration (banned).

## Targeted wild re-run (the 10 docs + 20 controls)

`scratchpad/targeted-rerun.ts` (throwaway; result at
`scratchpad/targeted-rerun.result.json`): the 8 wrong docs + 2 miss docs
rebuilt from the dossier (post + parent chain + target source), one call
per prompt per doc, target-source mentions only; 20 deterministic control
docs (every 7th non-target dossier doc) run the same way.

| doc | class | dossier (wrong/miss) | candidate now |
| --- | ----- | -------------------- | ------------- |
| t1_k35xspt | A1 used-to-have | live agua fresca dish | NOTHING |
| t1_nrz9v63 | A2 bring-back | live llano poblano burger | NOTHING |
| t1_k3a5pof | A3 one-year monte cristo | live monte cristo | NOTHING |
| t1_k1gpnz4 | B4 capacity ask (Rosa's) | general_praise | NOTHING |
| t1_nqtm5dg | B5 rental ask (URL pick) | general_praise | NOTHING |
| t1_k2bik21 | C6 narration | ramos gin fizz dish | no fizz (generic `cocktail` only) |
| t1_jx7i58i | D7 HEB shelf | beef fajita dish at HEB | NOTHING |
| t1_jyyjqwk | E8 strongest→spicy | item_attributes ["spicy"] | frozen marg, NO attributes |
| t1_jz3t9bw | M1 X-for-Y | 3 entries unemitted | all 3 emit, incl. `spicy chicken sandwich` at Junes |
| t1_k0c1qyy | M2 love-both | only El Dorado | BOTH places, praise carriers |

Controls: 20/20 with candidate output identical to live or strictly closer
to the dossier's audited grain — the only deltas are t1_jt98ten (candidate
drops the drive-to-Killeen yardstick names live over-credited; dossier
credits only Kublai Khan, matching candidate), t1_jydc9lh (candidate drops
live's extra inherited-`pastry` duplicates; counts match the dossier), and
t1_k1g0d6e (Maudie's — changed BY the pinned ruling, not drift).
