# Knowledge attributes — program design (P4)

Owner brief (2026-08-14 walkthrough subjects 4/6): dishes today get
attributes ONLY from testimony; knowledge-synthesis adds ingredients/aliases
but not attributes; restaurants get cuisines from an LLM lane + Places
types. The opportunity: attributes a dish's or venue's IDENTITY entails
("fried chicken sandwich" → fried, crispy) would power search toggles
testimony alone can't fill. This document answers the design questions the
why-didn't-we-just bar requires answered IN WRITING before anything is
built, and specifies the pilots. Owner decides continue-or-kill on pilot
measurements; nothing here ships before that.

## 1. Placement: the async knowledge lane, not extraction

The extraction-context argument, answered rather than skipped: extraction
holds the conversation and is already paying for the tokens — but
identity-entailed attributes need NO conversation context **by
definition**. The IDENTITY-ENTAILMENT TEST (§2) forbids attaching anything
the surrounding text suggested; the only thing context can do is VETO
(§3), and the veto evidence is banked testimony, queryable at synthesis
time from the DB — richer than any single conversation window. Putting
inference inside extraction would (a) blend two provenances in one output,
(b) re-pay the inference on every mention of the same dish instead of once
per entity, (c) make reruns impossible without re-extraction, and (d)
crack the "collection prompt is pure testimony" law that the
dish-knowledge lane already established. Precedent wins: **a new
knowledge-attribute pass extends the dish-knowledge-synthesis pattern**
(per-entity stamp, ~20 subjects per pooled batch call, cron flag-gated +
dry-run-default manual script, period-deadline contract).

## 2. THE IDENTITY-ENTAILMENT TEST (the named test)

**Attach only what the NAME of the entity entails — never what the ask,
the vibes, or the venue suggests.** "fried chicken sandwich" entails
`fried` and `crispy` (frying entails crispness); "chipotle chicken
sandwich" entails NEITHER — chipotle names a flavor, and identity does not
entail preparation. "birria taco" entails `beef`-adjacent stew tradition
but NOT `spicy` (heat varies by kitchen). The test is the mirror of
dish-knowledge's identity-modifier law: identity modifiers live in the
entity name by the composition law, so the name IS the complete evidence.
Empty is the expected default — an invented attribute is indistinguishable
from a real one forever (same error economics as invented ingredients).

## 3. The testimony veto

Testimony outranks knowledge wherever they collide, per-connection: if any
banked mention for a (restaurant, dish) connection states a contradicting
preparation ("grilled" where knowledge says fried), the knowledge
attribute is suppressed FOR THAT CONNECTION. Knowledge describes the dish
as named in general; testimony describes this kitchen's version. The veto
is computed at read/projection time from evidence already banked — never
by showing the synthesizer the testimony (that would blend provenances).

## 4. Provenance separation (storage shape)

Knowledge attributes are ENTITY knowledge, exactly like
`canonical_ingredients`: a `knowledge_attributes uuid[]` on the entity,
pointing at the same attribute entities testimony uses — one attribute
vocabulary, two provenances. They are NEVER written into
`core_restaurant_attribute_evidence` / mention-derived evidence, never
inflate testimony counts, and search may weight the two sources
differently (a testimony `crispy` is this kitchen observed; a knowledge
`crispy` is the dish-as-named default). The projection layer composes
final searchable attributes = testimony ∪ (knowledge − vetoed).

## 5. Existing-attribute strategy (owner question, answered)

The synthesizer does NOT see the entity's current attributes — neither
testimony's nor a prior knowledge pass's. Independence keeps the
provenance clean and makes reruns meaningful (a re-run under a better
prompt must be free to disagree with its predecessor). Reapplication is
set-replacement per entity (the pass owns its own column wholesale), so
rerunning is idempotent and self-correcting; `knowledge_synthesized_at`-
style stamping (its own stamp column) decides due-ness. Testimony
attributes are untouched by construction — different column.

## 6. Pilot A — consumable kind (the first closed-enum exhaustive facet)

Owner/⭐05 consensus R4, ownership mine. Every food entity gets exactly one
of `food | drink`. Why first: two values, mechanically completeness-
checkable (count(unfaceted)=0 is the done condition), cheap (~$3
co-due batched), and it exercises the whole program shape end to end —
closed enum, verdict-ledgered on the hearing machinery (claim_verdicts
lane, absolute subjects, replayable), completeness invariant after
backfill. Search consumes it for the Food/Drinks browse split. Grading: a
stratified 200-entity sample double-judged; disagreement rate is the
accuracy gate before the facet goes searchable.

## 7. Pilot B — meal timing + dessert class (owner ask 2026-08-15)

Facet: `meal_timing` multi-tag over {breakfast, brunch, lunch, dinner,
late_night} + the existing `dessert` category doubling as the
dessert-class signal (no new axis — dessert is already a PREDICTION-TEST
category; the button rides it).

**The ENTAILMENT-vs-CONVENTION boundary (⭐05 co-signs the text before
build):** a timing tags freely only when the IDENTITY entails it
("breakfast taco" → breakfast; "brunch board" → brunch). A CONVENTION
timing (burger ≈ lunch/dinner) is cultural, kitchen-variable, and
locale-variable — it attaches only with a LICENSE: (a) testimony evidence
("their breakfast burger", "late night menu staple" banked for that
connection), or (b) venue hours evidence (Places opening hours bound what
a venue can serve). Never bare inference — an unlicensed convention tag is
exactly the "vibes attribute" class the identity-entailment test exists to
kill. Expected coverage is therefore deliberately sparse at first;
sparseness is honest, completeness comes from licenses accruing, and the
browse UI treats missing timing as "untagged", never as "not served then".

## 8. Pilot C — the +72% venue-tag grading (free accuracy data)

The v13 shadow's venue-tag population (+72% over live) gets a stratified
grade (right tag / wrong tag / valuable?) — it doubles as accuracy data
for ⭐05's Places-types promotion pass and as the restaurant-side
feasibility read for this program. Then a small restaurant-attribute
enumeration pilot (vibe/format words under identity-entailment: a
`steakhouse` entails `steak`-forward; a name never entails `romantic`) and
a dish-attribute enumeration pilot, both fresh-lens graded.

## 9. Sequencing + gates

Post-activation, co-due batched with the wave (owner-ratified). Order:
consumable pilot (A) → grading gate → meal-timing boundary text co-signed
by ⭐05 → pilot B on a bounded sample → +72% grading (C) feeding the
restaurant/dish enumeration pilots → owner continue-or-kill on each
pilot's measured accuracy before any facet becomes searchable. Every
verdict ledgered; every backfill inside a calibration epoch if it moves
ranking or browse membership.
