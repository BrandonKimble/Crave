# The Widening System — attributes and ingredients (built 2026-08-30)

Owner ruling (plans/extraction-ideal-spec.md "Sameness and widening"):
merging is same-claim identity only; WIDENING owns generosity — judged,
ledgered, reversible, one-hop satisfies edges connect kept-separate
concepts so a broad searcher sees the union. Dishes had this; this work
builds it for ATTRIBUTES (place_attribute + item_attribute) and
INGREDIENTS. Restaurants excluded by the same ruling.

**Status: fully built and certified. NO edges written anywhere — the
docket ran DRY-RUN only; the verdict table below awaits your review.
Until `--apply` runs, search behavior is byte-for-byte unchanged.**

**Determinism note (acceptance fix 2026-08-30): dry-run verdicts drift
run-to-run on ~5/174 marginal pairs at temperature 0, so the dry-run now
writes its verdict table to a JSON file and `--apply <verdicts.json>`
settles EXACTLY that reviewed table — no re-judging; the file's sha256 is
stamped on every ledger row. The table you review is the table that
binds.**

## What a user gets once edges are applied

**(CORRECTED 2026-08-30, acceptance red team — the original paragraph
here sold the pub 37→368 experience, but that number comes from the e2e's
INJECTED pub→bar edge, a direction the judge REJECTED in the verdict
table below. The applied edge set does not deliver it.)**

After a real `--apply` of the judged verdicts: **"pub" stays at 37
places** — the judge ruled pub→bar reject ("a bar may lack the
traditional community atmosphere or food focus expected of a pub"). The
direction that DOES apply is bar→pub: a "bar" search additionally admits
the 37 pub-tagged places, a real but low-drama widening (most already
score below the bar-rich page 1). If the owner's instinct is "asked pub,
show the bars too," that is a docket flip (pub→bar → satisfies) + gold
pin — an owner decision to put plainly, not a code change. Someone asking
"piano bar" is NOT shown generic live-music venues (the reverse direction
was judged separately and can be refused). "Bacon" searches gain the
pancetta carbonara; a pancetta search gains no smoked American bacon
(directed, per the judge's own reasoning below).

## Design derivation

### The judge (the widening court)

- `widening-satisfies-rule.ts` — two rule templates in the item court's
  H5 shape: version DERIVED from the rendered rule text against an
  append-only release ledger; an unversioned edit throws at import.
  - ATTRIBUTE rule = **the searcher-tolerance test** ("a user filtered by
    the ASKED attribute and we showed them something tagged only the
    SHOWN attribute — would they feel the filter worked?"). This question
    moved HERE from the merge doctrine, per the ruling. Doctrine pins:
    the asked word sets the promise; extra specificity satisfies (live
    music → piano bar); lost specificity fails when the distinctive
    promise may be missing (piano bar → live music); doubt rejects.
  - INGREDIENT rule = **culinary substitutability from the asker's side**
    ("asked bacon, shown a dish made with pancetta — order it happily?").
    Same-role-same-craving satisfies; family/component/container and
    role changes reject; doubt rejects.
  - ONE VERSION NUMBER SPACE with the item rule: `entity_satisfies.
    prompt_version` and the ledger compare `=` with no kind column, so
    the item rule keeps v1, attribute = **v2**, ingredient = **v3**.
  - Per-direction verdicts: every pair is heard as two claims (A→B and
    B→A) — the table below shows how often they genuinely differ.
- `WideningSatisfiesService` — docket-driven (NEVER a cron), same
  `concept_satisfies` ledger lane (justified: the claim is literally the
  same claim — one directed id pair; a second lane would mint a second
  definition of one claim), same `entity_satisfies` effect upsert,
  verdict-before-effect settle with markExecuted (H5 (c)). D2 context:
  up to 3 REAL carriers per side (attributes reuse the two benches'
  shared `fetchAttributeCarriers`; ingredients get carrying dishes from
  canon ∪ evidence). Schema-forced evidence reasons (`reason` required;
  a bare verdict word is refused and the case left unreturned — never
  laundered). A missing verdict is left unjudged, never recorded as a
  reject. The ledger is the memory: re-runs judge nothing twice.
  Rehearing budget: a `concept_satisfies` meter entry was added to
  HEARING_METERS (callers concepts.satisfies + concepts.widening_
  satisfies) so future drains are quotable; the docket itself is all
  first hearings at fresh rule versions (nothing re-opened).

### Candidate sourcing (scripts/widening-docket.ts)

Docket = the owner's kept pairs (each a widening candidate BY DESIGN:
the merge court ruled "not the same claim"; this court asks "would the
broad searcher tolerate it anyway?") ∪ embedding nominations per anchor
(retrieveCandidates denseMode-always over the anchor's own type, top 5,
both directions) ∪ merge-court hold verdicts over widening kinds
(auto-flows once the attribute merge lane ledgered; today that lane's
holds are items, which this court skips as out-of-kind). Bounded,
deduped by directed key, idempotent under apply via the ledger.

### Search consumption (plan time, executePooledStage)

- New readers on SearchSiblingExpansionService, both under the H6
  request-memoized reader, both with the item reader's proven laws
  (DIRECTED from the asked word, `satisfies` relation only, redirect
  followed one hop, archived-no-redirect dropped, rejects/cousins never
  read, fail-open to no widening):
  - `getSatisfiesAttributeArms(anchorIds)` → per-anchor arms carrying
    the COLUMN the widened attribute's type dictates (F3: no caller
    re-derives columns).
  - `getSatisfiesIngredientIds(anchorIds)` → widened ingredient ids.
- SOFT concepts (subject + attribute words): `widenConceptArms` appends
  the widened arms to the anchor's concept — OR within the concept, AND
  across concepts preserved, `concept.id` (the starvation JSON key)
  unchanged, unwidened concepts byte-identical to before. Cross-column
  arms are legal here (both axis renderers handle either column).
- HARD attribute walls (attribute IS the ask): the id lists compile to
  array OVERLAP (`&&`), already OR-within-the-list — same-column widened
  ids append into that union. Cross-column targets are deliberately
  skipped in hard mode: the two column lists AND against each other, so
  a cross-column append would get STRICTER (the F5 failure); cross-
  column widening is the soft-arms' job.
- Dietary walls are NEVER widened (softening a health wall is a wrong
  answer; so is admitting neighbors). Cuisine keeps its dual-home law —
  out of widening scope v1 (open question below).
- INGREDIENTS: widened ids OR into `buildEffectiveIngredientsClause`'s
  existing union (evidence ∪ canon ∪ named-dish), asked-side only.
- Ordering untouched everywhere: widening is admission only.
- Provenance: a debug-mode log line ("satisfies widening applied")
  reports anchor→arm mappings and widened ingredient ids per request.
  (matched_tags naturally shows the widened attribute on rows admitted
  through it — the tag rendering already reads the row's own attributes.)

### Schema

`entity_satisfies` already accepts ANY entity ids (uuid pair + relation
+ prompt_version; FKs to core_entities, no type constraint) — **no
migration needed**. Verified against prisma/schema.prisma and exercised
against the live DB in the integration spec.

## Docket dry-run — the owner-pair verdicts (per direction)

Heard on staging vocabulary, Gemini dev key, temperature 0. "piano bar"
(folded away — no live entity) and "pizza truck" (never minted) skipped
gracefully as predicted. Read each row as: a user asked LEFT; should a
thing tagged only RIGHT be admitted?

| asked → shown | verdict | judge's reason (verbatim) |
|---|---|---|
| bar → pub | **satisfies** | a pub is a specific type of bar that serves the same primary function |
| pub → bar | reject | a bar may lack the traditional community atmosphere or food focus expected of a pub |
| deli → sandwich shop | reject | may lack the specialty meats and grocery items characteristic of a deli |
| sandwich shop → deli | **satisfies** | delis are fundamentally known for preparing and selling sandwiches |
| kebab shop → shawarma | **satisfies** | shawarma is a specific style of spit-roasted meat within the broader kebab category |
| shawarma → kebab shop | reject | a kebab shop might only serve grilled skewers, not shaved-meat shawarma |
| modern → trendy | reject | a trendy spot might be vintage or rustic rather than modern |
| trendy → modern | reject | modern can be clinical or minimalist without being popular |
| citrus → lemony | **satisfies** | lemon is a specific and common type of citrus |
| lemony → citrus | reject | citrus could be orange or lime rather than lemon's tartness |
| fudgy → gooey | **satisfies** | fudgy textures are inherently gooey and dense |
| gooey → fudgy | reject | gooey can be liquid or sticky without fudge's dense chocolate consistency |
| grass fed → pasture raised | **satisfies** | pasture-raised animals are typically grass-fed |
| pasture raised → grass fed | reject | grass-fed animals might be raised in confined feedlots |
| cold → iced | **satisfies** | iced items are by definition cold |
| iced → cold | reject | chilled soup or a refrigerated soda has no ice |
| soft → tender | **satisfies** | tender food yields to pressure like soft food |
| tender → soft | reject | soft (mousse, bread) lacks the fibrous yield of tender meat |
| bakery → pastry shop | **satisfies** | a pastry shop is a specialized bakery |
| pastry shop → bakery | reject | a general bakery might only do breads or donuts |
| bacon → pancetta (ingredient) | **satisfies** | same salty cured pork belly profile |
| pancetta → bacon (ingredient) | reject | bacon's smoke is a departure from the unsmoked cure sought |

**Headline: 22 directed cases heard, 10 satisfies / 12 reject, 0
unreturned — and the pattern is strikingly consistent: the judge widens
the BROAD word toward the SPECIFIC one and refuses the reverse, exactly
the searcher-tolerance asymmetry the doctrine asks for.** The one
surprise worth your eye: bar→pub satisfies (a pub-seeker's word was
ruled the pickier one, not bar). If your instinct was the reverse for
any row, that's a gold pin + rule note, not a code change.

The full run with embedding nominations heard **174 directed cases (55
satisfies / 119 reject, 0 unreturned)**; nominations surfaced real
widening candidates the docket alone missed (live music→piano bar
satisfies, iced→frozen drink satisfies, bakery→cake shop satisfies,
bacon→applewood/pepper bacon satisfies, pancetta→guanciale satisfies,
cured meat→pancetta satisfies) plus clean rejects for junk neighbors
(bakery→hot tub, cold→warm both ways, grass fed→non-gmo both ways).
Nothing was applied.

## Rule certification (gold, x3 each through production LLMService)

`scripts/widening-docket.ts --gold` — **6/6 PASS x3** (18 calls, zero
flakes): live-music→piano-bar satisfies / piano-bar→live-music reject
(the direction pair), pub→nightclub reject, bacon→pancetta satisfies,
bacon→tofu reject, bacon→mushroom reject.

## End-to-end proof (scripts/widening-e2e.ts)

Real searches through SearchOrchestrationService/SearchService against
**staging state, read-only twice over**: the Postgres session was opened
with `default_transaction_read_only=on` (any stray write ERRORS) and the
three submit write paths (signals ledger, on-demand recording, viewport
reconciler) stubbed to no-ops. Edges injected IN-MEMORY by patching the
two satisfies readers on the live instance (pub→bar,
bacon→pancetta) — everything downstream (memoization, arm minting, SQL
compilation, the pooled gate) is the untouched production path.

| query | before | after (injected) | proof |
|---|---|---|---|
| "pub" (attribute-only hard wall) | 37 places / 92 dishes | **368 places / 1005 dishes** | union admission through the widened `&&` list; page order of shared rows intact. NOTE: this row proves the MACHINERY with an injected pub→bar edge — a direction the judge REJECTED, so a real `--apply` leaves "pub" at 37 (see the corrected section above) |
| "cozy pub" (two hard walls) | 63 / 371 | **390 / 1266** | widening one concept while the other still walls (same injected pub→bar edge — same caveat) |
| "bacon" (natural text) | 72 / 81 | 72 / 81 | grounds as ITEM subject — ingredient widening correctly does not engage |
| bacon as structured INGREDIENT | 72 / 81 | **73 / 82** | exactly the one pancetta-carrying staging dish admitted |
| all four | — | — | `sharedOrderIntact=true` every run: rows served by both runs keep relative order (pure-score ordering untouched) |

Page-1 composition shifts on "pub" (bar venues outscore many pub
venues) — that is the design: admission widens, the Crave Score alone
orders. Starvation keying was pinned in unit tests (the concept id — the
starvation JSON key — never changes when arms are added).

## Tests and cert results

- `widening-arm-compilation.spec.ts` — 6/6: identity/starvation key
  stable, arms append + dedupe, empty-axis doctrine preserved, empty
  widening is the literal identity (byte-shape stability), cross-column
  arms render as OR within the concept on both axes.
- `widening-satisfies-expansion.integration.spec.ts` (real Postgres) —
  8/8: type→column mapping, directedness, reject/cousin never read,
  redirect following, archived drop, ingredient asked-side + kind
  isolation, fail-open.
- `widening-satisfies.service.spec.ts` — 6/6: docket hygiene (missing/
  archived/mismatched/merged skipped, judge never paid), dry-run writes
  NOTHING, verdict-before-effect with per-kind rule versions, laundered
  reasons refused, ledger memory skips decided cases.
- Existing suites re-run green: satisfies-expansion.integration (4),
  search-pooled-gate, cuisine-dual-projection, dense-admission,
  search-ingredient-include (47 unit tests total in the targeted run).
- `yarn build` green; full `npx tsc --noEmit` green on this work.
- `yarn invariants` GREEN: 43 invariants, 88 proofs, "Every invariant
  rejected the defect it was bought with" (the run queued behind other
  agents' runs on the shared tree; earlier transient failures during the
  session were all in other agents' mid-flight files). The
  caller-profile law is satisfied: `concepts.widening_satisfies` is
  registered in GEMINI_CALLER_PROFILES (FLASH — it writes per-pair
  evidence reasons at docket volume) and the gateway-lockdown suite
  passes (69/69 across the gemini specs).
- Known not-mine: `food-dedupe-hearing.integration.spec.ts` fails 4
  cases against another agent's +317-line in-flight edit to
  food-dedupe-merge.service.ts — a file this task does not touch.

## Migration notes

None needed: `entity_satisfies` is type-agnostic (uuid FKs to
core_entities). Rule versions 2/3 extend the existing
`prompt_version` int column; the `concept_satisfies` lane's claim keys
are unfolded id pairs, kind-independent by construction.

## How to apply (when you've reviewed the table)

```
yarn workspace api ts-node scripts/widening-docket.ts --apply            # full docket incl. nominations
yarn workspace api ts-node scripts/widening-docket.ts --apply --no-nominate  # owner pairs only
```
Idempotent; verdicts land in the ledger first, then `entity_satisfies`.
Reversal = delete the edge rows / re-hear at a bumped rule version (the
release ledger enforces the bump).

## Open questions

1. **Which environment gets the edges** — the runner writes wherever
   DATABASE_URL points; staging first per the iteration-phase ruling.
2. **Cuisine widening** (thai → laotian-style questions) deliberately
   out of v1 — cuisine has its own dual-home + dual-pool law; wants its
   own derivation if ever.
3. **Row-by-row review**: any verdict you'd flip becomes a gold pin and
   a rule-version bump (the ledger machinery makes that a diff, not a
   re-build). bar→pub satisfies is the one I'd have you look at first.
4. **Hard-wall cross-column widening** is soft-arms-only by design (the
   AND'd id lists would get stricter). If a cross-kind pair ever earns a
   hard-mode widening, the plain hard attributes would need to become
   wall ConceptConstraints first — a separate, contained change.
5. **piano bar**: folded away (no live entity) — its widening question
   is moot until/unless the surface is unfolded; "live music →
   piano bar" heard via nomination anyway (satisfies) but cannot bind
   without a live target entity.

## Tie-break law (owner ruling 2026-08-30, rule v4/v5)

The merge-vs-widen study found the coin-flip hole: on genuinely uncertain
directions the promise test alone left ~3% of rows drifting run-to-run,
and two owner pairs (fudgy/gooey, soft/tender) flipping across sessions
with coherent reasons on both sides. The fix is not row rulings but a
LAW derived from the doctrine's own asymmetric-cost reasoning:

**When the satisfaction test comes out genuinely uncertain for a
direction, ask WHAT KIND of difference separates the words.**
- **Same-domain adjacency** — shades of one quality (texture↔texture,
  mood↔mood, vibe↔vibe within one food domain) → **satisfies**: an
  adjacent extra row never annoys; the filter reads as generous. The
  KIND of difference is symmetric, so both directions satisfy.
- **Cross-domain or identity difference** — different food, ingredient,
  cut/cure/preparation, dietary class, or temperature-of-food-class →
  **reject**: a wrong-food row poisons the filter where an adjacent-shade
  row merely pads it. Both directions reject.

Encoded in both rule templates at the decision point with worked
examples both sides (fudgy→gooey brownie; tender-promises-meat vs
soft-spans-shave-ice; applewood bacon vs plain bacon; guanciale's jowl
vs pancetta's belly). Releases: attribute **v4** (d63255f146bb),
ingredient **v5** (53c9ee96e664).

### Certification and gold pins

`--gold` now carries 13 cases (7 new pins: fudgy↔gooey satisfies both
ways, soft↔tender reject both ways, shawarma→gyros reject,
applewood bacon→bacon satisfies, guanciale→pancetta reject).
**13/13 PASS ×3, zero flakes** (dev Gemini, temperature 0).

### Stability matrix, before vs after (full 174-pair docket ×3, staging vocabulary)

| | v2/v3 (study) | v4/v5 |
|---|---|---|
| identical across 3 runs | 168/174 (96.6%) | **172/174 (98.9%)** |
| previously-unstable 6 rows | flip together in one run | **all 6 stable 3/3** |
| fudgy↔gooey | cross-session coin-flip | satisfies both ways 3/3 (matches pin) |
| soft↔tender | cross-session coin-flip | reject both ways 3/3 (matches pin) |
| still unstable | — | falafel↔kebab shop (2 rows; law-edited to reject in the reviewed table) |

One law-vs-judge conflict: the docket stably calls shawarma↔gyros
"adjacent shades of spit-roasted meat wraps" (satisfies), but the law
classes different named foods of different traditions as an identity
difference — the gold pin (reject, passing ×3 with venue carriers) and
the reviewed table carry the law's determination; the reviewed-table-
binds mechanism exists for exactly this.

### The applied delta (staging, 2026-08-30)

New reviewed table: `plans/merge-vs-widen-tiebreak-verdicts.json`
(sha256 647a7cc8ca99…, majority-of-3 + five law edits: gyros→kebab shop,
falafel↔kebab shop, shawarma↔gyros all → reject). **27 of 174 verdicts
changed** vs the applied v2/v3 table (sha 519e1460…):

- 22 reject→satisfies, all same-domain adjacencies the old rule's
  doubt-rejects starved: modern↔trendy (the study's "gap pair" now
  widens both ways), fudgy→gooey, fudgy→chewy/rich, gooey↔chewy,
  soft↔smooth, delicate→soft/tender, fluffy→soft, deli→sandwich shop,
  pasture raised→grass fed, eclectic→modern, funky→trendy,
  not overly sweet→citrus; ingredients pepper/applewood bacon→bacon,
  bacon→bacon bits.
- 5 satisfies→reject, all identity differences: gyros/falafel/shawarma
  cluster (4 rows) and **pancetta→guanciale** — the jowl-vs-belly line
  now cuts both ways, consistent with guanciale→pancetta's standing
  reject. (soft→creamy and confectionery→pastry shop also flipped to
  reject inside the 27.)
- The two prior owner-lens flips: meaty→grass fed stays reject on the
  judge's own verdict; soft→smooth returns to satisfies because the law
  itself rules texture adjacency — the law supersedes that row-lens edit.

Applied via `widening-docket.ts --apply` on staging: settled=174,
alreadyDecided=0, sideGone=0. Post-apply `entity_satisfies`: 55
satisfies + 101 reject at v4, 8 satisfies + 10 reject at v5 (the v2/v3
edges upserted away; their ledger rows remain historical under
rule-version keying). Net satisfies edges: 50 → **63**.

`yarn build` green, widening suites 19/19, `yarn invariants` green
(43 invariants, 88 proofs).
