# CRAVE SEARCH — CANONICAL MASTER PLAN

_(This document replaces the prior accreted version in full — produced by the 14-agent research +
4-stance design panel + 4-lens red team, workflow wf_f7ca4ec9, 2026-07-01/02. `plans/search-routing-redesign.md`
was already merged+deleted; its maximalist ladder survives only in git history.)_

**Governing rule, earned by the red team:** every REPLACE in this plan ships only with a green run of
its named harness attached. All four panel designs independently specced a flagship fix
(levenshtein-on-trigram-shortlist) that provably cannot reach its own motivating failure case
(4–5-char typos average sim 0.223, below the 0.3 `%` shortlist floor). The harness is not
documentation; it is the merge gate.

---

# PART A — THE SYSTEM, EXPLAINED SIMPLY

**You type a letter.** Six suggestion sources race in parallel: known entities (restaurants, foods,
attributes), your own favorites and recently-viewed places, your past queries, everyone's popular
queries, canned suggestions, and polls. Each exists because it answers a different question ("is this
a thing we know?", "is this a thing _you_ know?", "have people asked this before?").

**Each entity suggestion is found two ways at once.** A text lane (exact name, prefix, full-text
words, sound-alike, typo-tolerant) and a meaning lane (embeddings) both fetch candidates, and their
ranked lists are fused — the shared matcher, our house standard, which only _finds_ candidates and
never _decides_ anything.

**Typo tolerance is an edit budget, not a similarity score.** A short word may contain no typos, a
medium word one, a long word two — the same rule Elasticsearch, Algolia, and Typesense ship — because
"how many letters can be wrong" is a question a human can argue about, and four hand-picked
similarity floats are not.

**Every suggestion carries its evidence, not a made-up number.** Each candidate is labeled with _how_
it matched — exact, alias-exact, prefix, word-match, sound-alike, fuzzy — and that label travels all
the way to the client, because "how sure are we" should be the true answer, not a hardcoded 0.65.

**Suggestions are arranged by slots, then by evidence.** Each lane gets reserved slots up top
(variety guarantee); within a lane, better evidence beats worse evidence, and popularity only breaks
near-ties — what you typed beats what's popular.

**Attributes always show if you typed them.** An attribute you've essentially spelled out ("vegan",
"spicy") always appears; how _popular_ it is decides where it ranks, never whether it appears.

**You hit submit.** Four rules route you: tapped a suggestion → we already know what you mean, no AI;
tapped a generic chip ("best restaurants") → just rank the map, no AI; typed the exact, unambiguous
name of a known thing and hit Return → same as tapping it, no AI; anything else → one AI call splits
your words into four typed buckets (restaurants / foods / food-attributes / restaurant-attributes).
Identical questions are answered from a cache instead of re-paying the AI, and if the AI is down,
search degrades to what we can match directly instead of dying.

**Each word links to a known entity by a dominance test.** Exact or alias-exact name → link.
Otherwise link only when the best candidate _clearly beats_ the runner-up (a margin, which is
meaningful within one query, unlike an absolute score cutoff). Two candidates genuinely tied → link
_both_ and let ranking sort it (reveal-all, never a coin flip, never an AI judge at query time). A
near-miss feeds the query-widening step immediately; only a word with _no_ plausible candidate
becomes a learning signal.

**SQL runs in three honest layers.** Strict = exactly what you asked. Expand = if strict is thin,
widen the plan with text-related entities (reveal, don't subtract). Relax = if a page still can't
fill, drop _attribute_ constraints only — never the thing you named — and append the looser rows
_below_ every strict row.

**Results are ordered by Crave Score alone.** The precomputed quality percentile orders everything;
the map badge number _is_ the list position; relevance never reorders results.

**Every search teaches the system.** Page-1 impressions and unresolved words are logged and
aggregated nightly into a demand signal that decides what to ingest next — the flywheel.

**And every decision the system makes is logged with the evidence it decided on**, so every remaining
number in this design gets swept against replayable data instead of taste.

Every mechanism above survives the one-sentence test. The things that didn't — the four-float ladder,
the 0.82 cutoff in three files, the six-cell attribute matrix, the placeholder confidences — are
deleted by this plan.

---

# PART B — THE CANONICAL DESIGN (flow-ordered)

## B1. Autocomplete recall — the fuzzy arm

**CURRENT:** Five OR'd recall arms (exact/prefix/FTS/name-fuzzy/alias-fuzzy,
`entity-text-search.service.ts:840-853`); the fuzzy arm is gated by a four-float length ladder
0.7/0.55/0.45/0.35 (`:505-510`) with a silent `?? 0.35` fallback (`:728`); phonetic backfill fires
conditionally (`:421-441`).

**IDEAL:** Keep all five arms and the phonetic arm's fire conditions. Replace the ladder with
**length-banded token-level edit distance**:

- Exact/prefix/FTS own short queries (already true — the ladder only ever gated fuzzy).
- Add a **dedicated edit-distance recall arm**: `levenshtein()` (fuzzystrmatch installed) against a
  length-windowed candidate set, **per-token / best-word-extent**, never whole-string ("frankln" vs
  "Franklin Barbecue" is 1 token-edit, ~10 whole-string edits). For the 176 names ≤5 chars an
  exhaustive scan is cheap; longer names window by length ±budget.
- Budget: 0 edits ≤2 chars, 1 edit in the middle band, 2 edits above — **two integer breakpoints**,
  seeded at the ES-AUTO consensus, _set by the typo-replay harness_ (the panel's seeds disagreed:
  (3,8) vs (4,8) vs ES (3,6) — the sweep decides, and that disagreement is exactly why it must).
- Admission is a **union, never a subtractive filter**: within edit budget OR above the flat trigram
  floor. Filtering trigram survivors by edit budget would delete long-string variants the current
  0.35 tier serves ("capital grille" → "The Capital Grille" = 4 edits, sim 0.79) — the red team's S3.
- The trigram floor (`%` default 0.3) is **a named knob on the ledger**, not "Postgres's number": its
  correct value degrades with corpus size and its failure mode (LIMIT displacement) is silent.
- Fuzzy _scoring_ moves to `word_similarity` (fixes the typo'd-first-word class, 93.9% rejected
  today, and the concatenated-alias dilution at `:807`). Index support for the `<%` operator class is
  part of this step.
- Structural pre-step: **Unicode/`unaccent`/NFC normalization**; the phonetic arm is **gated by
  script** (dmetaphone is English/ASCII — a data-driven gate, not a content list); the breakpoints
  are declared Latin-script policy pending per-script rules.

**WHY (plain):** "A four-letter word may have one typo" explains the whole gate; the industry
expresses length-adaptive tolerance as edit-distance integers precisely because they're arguable and
sweepable, and the audit proved the float ladder rejects 94–100% of realistic typos while blocking
one legitimate name.

**Owner smell (a) answered directly:** the _instinct_ (short queries need stricter handling) is
industry-standard and principled; the _unit_ (similarity floats by char count) is the accreted part —
and empirically inverted, since short typos produce intrinsically _lower_ similarity while the ladder
demands higher.

**DELETED:** the four floats, the `?? 0.35` fallback and the per-term threshold map it falls back
from, similarity-as-accept-gate.

## B2. Autocomplete — attributes

**CURRENT:** Six-cell confidence×support matrix (`autocomplete.service.ts:37-47`, applied
`:967-993`, with a seventh 0.82 literal at `:991`); failing attributes deleted from the response
(`:694-703`).

**IDEAL:** Delete the matrix outright. Structural rule: **exact or prefix evidence ⇒ always show;
fuzzy attribute evidence requires query ≥4 chars** (one integer, same band family as B1).
Demand/corpus support moves entirely into `calculateAttributeScore` (`:995-1000`) as a _ranking_
signal — where it already exists.

**WHY:** The matrix is not mis-tuned, it is mathematically dead — rankSupport caps at 0.096 against
floors of 0.22/0.42/0.65, so a user typing "vegan" verbatim gets _nothing_, and suppressed attributes
can never accrue the selection demand that would unsuppress them; it also silently subtracts, the one
thing the ethos forbids.

**Blocking prerequisite:** unstrand dish `food_attributes` (0/1,178 tagged — evidence stranded on
inactive extraction runs) via a fresh extraction + projection re-run, so the support _ranking_ signal
has fuel.

**DELETED:** all six cells + the `:991` 0.82, the response-side attribute deletion. (Two of the three
0.82 sites die here.)

## B3. Autocomplete — confidence, evidence, ordering, blending

**CURRENT:** Evidence tier computed (`entity-search.service.ts:58`) then discarded at the DTO
(`autocomplete.service.ts:304-313, :335-344`); favorites hardcoded 0.65 (`:577,:587`), canned queries
confidence 1 (`:763`), poll confidence duplicating sim; the `:561` else-bucket labels any weak row
`'alias'`; blend = reserved slots 3/2/1/1 + score overflow; dead `autocomplete-rerank.ts`.

**IDEAL:**

- **The evidence tier IS the confidence.** DTO ships `{score, evidenceTier, lane}` end-to-end; the
  else-bucket becomes `'weak'` (a label must mean what it says — fix _before_ tiers become
  load-bearing, it's a landmine today and a live bug tomorrow).
- Within-lane ordering: evidence-**group** tuple sort — groups {exact, aliasExact, prefix} /
  {fts, phonetic, fuzzy} with the existing bounded score/similarity blend inside groups, similarity
  before popularity. (Six strict strata would bury a famous FTS match under an obscure prefix match —
  red-team S6; popularity-above-similarity inside a fat tier is a rich-get-richer loop.)
- Cross-lane: keep reserved slots, declared honestly as **layout policy** — with a week-1,
  user-independent check (per-lane impression share vs slot quota) and the impression+selection log
  as its eventual sweep.
- The favorites 0.65 is a _policy_ wearing a float: replace with an explicit rule — **injected
  personal lanes sort after entity-lane text matches** — and injected rows carry their true `prefix`
  evidence.
- Delete every write-only confidence: canned `1`, poll duplicate, interpretation-side confidence, the
  ingestion judge's `1.0` where unread.
- **Delete `autocomplete-rerank.ts`** (zero importers). Its evidence-tiered design is _absorbed_ as
  the tier-group sort above — it is not promoted as a second live ranking stage (two orderers for one
  surface is the confidence patchwork reborn).

**WHY:** A categorical you can sort on beats a float you invented; every number nothing reads is
deleted so "confidence" means one thing everywhere.

**DELETED:** 0.65, 1, poll confidence, interpretation confidence, the client's decorative
`confidence` field, `autocomplete-rerank.ts`.

## B4. Autocomplete — market scoping

**CURRENT:** Hard `core_entity_market_presence` equality against one resolved marketKey
(`entity-text-search.service.ts:1083-1103`); the user's real coordinates are consumed only to pick
the key, then discarded.

**IDEAL:** Scope restaurant recall to **any market overlapping the viewport** (the
`collectableMarketKeys` set already computed for on-demand), **bounded by viewport size** (the ~2mi
on-demand eligibility machinery is the existing pattern) so a zoomed-out view over 100 markets
doesn't degenerate to a no-op filter.

**WHY:** A restaurant 300m away must never be unfindable because of which side of a market line it
sits on — the failure is binary, silent, and scales linearly with the market count.

**Sequencing note (panel split, resolved):** D4's "defer until data shows harm" loses because its
proposed tripwire is blind — autocomplete misses never write on-demand rows. Instead the ledger
metric (re-run market-filtered misses unfiltered, count recoveries) ships _first_ and is this
change's gate; the geometry change ships when the metric is measurable, not on a hunch either way.

## B5. Submit routing

**CURRENT:** 4-rule routing (`search-orchestration.service.ts:314-366, :81-96, :115`) — settled, and
per the industry research literally the Instacart/DoorDash frontier shape. Typed-Return always pays
the LLM; interpretation cache off (`llm.service.ts:153`); LLM failure kills the search
(`search-query-interpretation.service.ts:104`).

**IDEAL:** Keep the 4 rules verbatim. Three additions:

1. **Typed-Return promoter**, wired in
   `apps/mobile/src/screens/Search/runtime/shared/use-search-foreground-query-submit-runtime.ts`
   (currently zero `submissionContext` references — reuse the tap payload built in
   `use-search-foreground-suggestion-submit-runtime.ts:110-121`). **Uniqueness precondition,
   non-negotiable:** the promoter fires only when the exact text match is _unique_ — the
   profile-jump gate's singleDominant condition reused, same dominance vocabulary. (18 aliases
   resolve to two entities and 7 exact same-name duplicate pairs exist; without this, typing
   "alinea" + Return silently commits to an arbitrary entity, violating settled reveal-all.)
2. **Interpretation cache** — but cache the **segmentation** (the four arrays, which are
   market-independent) and re-run linking per market; alternatively key by (normalized text, market).
   A text-only key serves Austin's entity IDs to a Dallas viewport for TTL-hours — a silent
   wrong-results bug worse than the latency it saves. Single-flight the head query (no N×4.4s
   stampede) and invalidate on entity activation so the flywheel's ingest→re-search loop isn't
   frozen.
3. **LLM-outage degradation:** on `LLMUnavailableError`, run the raw query through the linker as a
   single term (exact/margin path) or return a browse with `coverageStatus:'unresolved'` — a dead LLM
   degrades search, never kills it.

**WHY:** Identical questions shouldn't re-pay 4.4 seconds; typing a thing's full unambiguous name is
the same intent as tapping it.

## B6. Interpret & link — the 0.82's replacement

**CURRENT:** Exact fast-path checks `c.name` only (`search-query-interpretation.service.ts:318` —
alias-exact hits link mislabeled `'fuzzy'`); else best sparse candidate ≥0.82 (`:61,:338`), argmax
with no margin check; else unresolved → on-demand; dense runs in `'fallback'` mode feeding a decider
that structurally cannot use dense candidates (`:332-336`).

**IDEAL — one named link policy, one module, in the shared matcher:**

- **L1 (structural):** exact or aliasExact ⇒ link, correctly tiered (fix `:318` to check aliases).
- **L2 (dominant):** else link the top candidate iff it has **real lexical evidence**
  (prefix/FTS/word-extent fuzzy tier — never raw sim-above-floor; that's the "omakase→Osaka"
  junk-link hole, red-team S4) AND top ≥ m × runner-up.
- **L2b (sole survivor):** a lone candidate links only if it is **within the typo budget** of the
  term (D2's rule, grafted by two critiques) — not merely above a float floor; this is what keeps new
  sparse markets, where most terms return ≤1 candidate, from degenerating to "link anything."
- **L3 (tie ⇒ reveal-all):** near-tied candidates all link — tie band defined by **the same m**
  (tied = every c with top < m×c), zero new knobs; SQL's `ANY(ids)` accepts plural IDs natively. No
  LLM judge at query time (settled).
- **L4 (near-miss ⇒ same-pass expansion):** a term with plausible-but-not-dominant candidates enters
  the plan-expansion candidate set immediately and is **excluded from on-demand recording**; only
  terms with no plausible candidate become learning signals. This deletes the "briskit tacos"
  pathology (failed strict stage + bogus on-demand request for an entity we already have + gateless
  expansion rescue). L2b and L4 are exclusive by construction: within-budget singleton links;
  below-budget singleton expands.
- **Dense OFF in the linker** until a decider exists that can consume dense evidence — today's
  fallback dense call is measured pure dead cost.

**WHY:** The literature is explicit that fused/similarity scores have no absolute cross-query meaning,
and the audit proved it both ways (5.1% of true variants clear 0.82; 32 wrong-entity containments
clear it) — margin is self-normalizing within one query's candidate set, and it is the same dominance
shape as the settled profile-jump gate.

**DELETED:** the 0.82 in all three files (two die with the matrix, B2; this one becomes the named
margin policy), the dense fallback call, the on-demand recording for near-misses.

## B7. Data integrity (gates can't outsmart bad data)

**CURRENT:** 7 exact same-name duplicate pairs, 4 word-order duplicate foods at trigram sim 1.00
(invisible to _any_ similarity rule), 18 ambiguous aliases, 2 entities mistyped `restaurant`, 76% of
aliases are name-copies, 44% apostrophe-variant coverage.

**IDEAL:** Merge/fix all of the above now; add a **scheduled corpus-integrity check** (duplicate-pair
count, ambiguous-alias count, cross-type collision list — the audit's own queries) that keeps the
counts at zero; backfill apostrophe-stripped aliases so alias-exact stops depending on the fuzzy gate
for half that class.

**WHY:** The margin rule is blind to sim=1 duplicates — the "wrong Alinea" bug is a data bug, and no
decision layer can see it.

## B8. SQL stage chain

**CURRENT:** strict probe → expansion (<25 coverage or unresolved terms, `search.service.ts:421-425`)
→ relaxation (<10 per axis, `:322`, attribute-constraints-only per `:1824-1853`) → relaxed rows
appended below strict — executed as ~12–16 sequential statements; cross-table attribute OR
(`search-query.builder.ts:788-817`); vote totals aggregate pre-LIMIT.

**IDEAL:** Keep the semantics byte-identical (strict = what you asked; expand = widen the plan; relax
= drop attributes only, never what you named; strict always above backfill — all principled). Change
execution only:

- **Speculative fan-out, structurally gated:** fire the independent relaxation probes concurrently
  with the strict probe **only when the plan predicts thinness** (unresolved terms or attribute
  constraints present) — speculating on every query taxes the healthy majority in DB load to speed
  the sparse tail (red-team load-budget finding). Results consulted after strict counts arrive;
  identical output by construction.
- The one legitimate **cross-table OR→UNION** (attribute EXISTS shape), EXPLAIN-gated — explicitly
  distinct from the dead UNION-at-scale broadening.
- **Vote-totals pre-LIMIT aggregation** fix, same step.
- **Keep 25 and 10 as two separate knobs**, promoted to config with firing-rate logs. D2's collapse
  into one page-size constant is rejected: it silently moves the relax trigger 10→25 (2.5× more loose
  backfill below the strict seam) while declaring itself exempt from validation — the owner's smell
  (e) in a new costume.

**WHY:** The ladder's cost is decision serialism, not SQL; parallelizing probes changes wall time,
never rows.

**Settled and honored:** no SQL broadening, no search-every-lane UNION fan-out, no relevance tiebreak
— the old plan's Stage 3 is dead and stays dead.

## B9. Ranking & presentation

**CURRENT = IDEAL:** pure Crave-Score ordering (`search-query.builder.ts:1604-1613, :1581-1584`),
badge==position, coverage status, profile-jump gate (exact/aliasExact + singleDominant + restaurant),
page-1 impression logging. All keep, untouched.

**One binding caveat, not a mechanism:** 91.2% of connections carry ≤1 mention and 98.6% of adjacent
scores sit within 0.05 display points — **no downstream logic may branch on small score deltas**; the
precision is a percentile artifact. The score-stability audit (re-rank churn per new mention) runs as
a scheduled check feeding the already-planned Crave-Score redesign, which owns that problem — this
plan does not scope-creep into rescoring.

**Geo and ordering:** if geography ever needs influence, the only sanctioned placements are
retrieval-side bias (B4 is exactly that) and exact-tie tiebreak — both preserve badge==position
byte-identically. Neither is needed now.

## B10. Learning loop / on-demand

**CURRENT:** Two pathways already feed learning — OnDemandRequest recording plus unconditional page-1
`recordQueryImpressions` (`search.service.ts:2205-2234`) → nightly demand aggregation (quota 8,
largest). The old plan's "Step 4 three-set collection" was motivated by a hole that was later
disproven.

**IDEAL:** Keep both pathways; **the old Step-4 three-set collection dies** (the `unmet` slice
already covers resolved-but-low-coverage). Two changes land elsewhere in this plan: near-misses stop
polluting on-demand (B6-L4), and the ledger adds the permanent tripwire — **"on-demand requests whose
recall shortlist contained the eventual entity" → target 0**.

## B11. Ingestion divergences

- **denseMode `'always'` in ingestion: principled, keep** — its decider is an LLM judge that can act
  on dense-only semantic candidates; latency is batch.
- **LLM judge stays ingestion-only** — query-time ambiguity is reveal-all (settled); the judge
  matters only when you must commit to one (ingestion).
- **Retire Sørensen-Dice + private Levenshtein** in `entity-resolution.service.ts:740-875, :1589+`
  and drop the `string-similarity` dep — the last off-standard scorer; alias tiebreaks speak the
  shared matcher's pg_trgm vocabulary.

## B12. Dead code & doc deletions (enumerated, mechanical)

`entity-text-search/autocomplete-rerank.ts` (zero importers) · Dice/Levenshtein + `string-similarity`
dep · the `?? 0.35` fallback + threshold map · write-only confidences (query `1` at `:763`, poll
`:951`, interpretation `:297,325,342`, judge `1.0` at `:712`) · the client `confidence` field (read
only as a React key fallback, `SearchSuggestions.tsx:198-207`) · the three 0.82 sites as such · the
six matrix cells · `plans/search-routing-redesign.md` (already deleted; superseded — git has it).

---

# PART C — VALIDATION PLAN

**Deliverable 0 — the Decision Ledger + replay harnesses (prerequisite for every REPLACE).** One
structured line per decision — `{gate_id, query, term, candidates:[(id, sparse, dense, evidence,
rank)], decision, margin, chosen_id}` — at: fuzzy-arm admission, link/no-link, attribute show,
expansion trigger, relaxation pick, on-demand queue. **Sampling policy:** 100% for link decisions
(low QPS, high value); sampled for autocomplete admissions (hot path — full-fidelity logging there is
its own bottleneck). Harnesses are in-repo scripts against a **frozen snapshot fixture**
(names+aliases dump, versioned, regenerated deliberately) so CI is hermetic and the gate can't rot
into `skip`.

| Knob                                                                                               | Values                            | Data                                                                                                                                                                                        | Harness                                                                                                                                                                                                                                                                   | Success bar                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit-distance breakpoints (2 ints)                                                                 | seed (3,8); sweep decides         | **Synthetic typo corpus** (Report 3's generator over 3,654 names — exists in prototype); `search_events` replay demoted to smoke test (its "selected" labels are partly heuristic-circular) | Typo-replay in CI: recall@10 of true entity per length bucket **through the actual recall SQL**, + junk-admission count, + **junk-link rate on no-true-entity queries** (missing from every design)                                                                       | Bar provisional until first run (the current spec likely fails it — that is the harness working); target ≥95% for 1-edit typos per bucket, junk bounded by zero exact/prefix/FTS LIMIT displacement; per-script buckets when non-Latin markets exist; stratified sampling at 10× corpus |
| Trigram shortlist floor (named knob)                                                               | `%` 0.3 today                     | same corpus                                                                                                                                                                                 | shortlist-recall-vs-corpus-size curve in the same replay                                                                                                                                                                                                                  | recall stable as corpus grows; alarm on degradation                                                                                                                                                                                                                                     |
| Link margin m (1 ratio)                                                                            | seeded pre-launch                 | **1,172 alias→name pairs + 32 containment pairs** (exists today); ledger boundary queue post-launch                                                                                         | Variant-link replay: sweep m; containment errors as a _heavily weighted cost_, not an inviolable 100% constraint at N=32 (one adversarial pair would drive m to a new 0.82); boundary-labeling queue refines when volume exists — honestly declared near-empty pre-launch | max variant recall subject to containment cost; **tripwire: on-demand-for-known-entity = 0**                                                                                                                                                                                            |
| Fuzzy-attribute min prefix (1 int)                                                                 | 4                                 | autocomplete selection log (needs traffic) + **week-1 canary needing none**: count of exact-typed attribute queries returning zero suggestions                                              | floor-clearance recompute (the audit's query, scheduled)                                                                                                                                                                                                                  | canary = 0 from day one; loosen the int if 2-char fuzzy selections materialize                                                                                                                                                                                                          |
| Expansion 25 / relax 10                                                                            | promoted to config, kept separate | stage-outcome log (per query: strict count, which stage fired, final count)                                                                                                                 | firing-rate dashboard; sweep only with evidence                                                                                                                                                                                                                           | firing rates stable and explained                                                                                                                                                                                                                                                       |
| Slot counts 3/2/1/1                                                                                | layout policy, declared           | per-lane impression share vs quota (day-one, user-independent); selection log later                                                                                                         | impression/selection log = the eventual sweep and the LTR unlock                                                                                                                                                                                                          | explicit declaration: owner-eyeballed until selection volume X                                                                                                                                                                                                                          |
| Boost weights (0.35/0.1/0.05/0.08), poll floor 0.4, lane weight 0.9, dense-≥3, phonetic conditions | kept as-is, **on the ledger**     | selection logs when they exist                                                                                                                                                              | env knobs already; swept then                                                                                                                                                                                                                                             | declared "unswept until volume X" — an exhaustive census is the ethos requirement                                                                                                                                                                                                       |
| SQL fan-out                                                                                        | —                                 | replayed head queries                                                                                                                                                                       | **result-equivalence diff** (old chain vs fan-out, byte-compare rows) + stage-timing + statement-count budget                                                                                                                                                             | zero row changes; p95 down on thin-plan queries; load multiplier bounded                                                                                                                                                                                                                |
| Market geometry                                                                                    | —                                 | ledger: re-run market-filtered misses unfiltered                                                                                                                                            | boundary-miss recovery count                                                                                                                                                                                                                                              | metric measurable before the change ships; misses → 0 after                                                                                                                                                                                                                             |

**Corpus-integrity check (scheduled):** duplicate pairs, ambiguous aliases, cross-type collisions —
target 0 permanently. **Cache:** hit-rate logged from day one; head-heaviness measurable from
`search_events` now. **LLM degradation:** dev chaos toggle + top-50 head-query replay through the
degraded path.

---

# PART D — MIGRATION (each step independently shippable, with its gate)

**Step 0 — free wins, zero behavior risk.** Delete `autocomplete-rerank.ts`, Dice/Levenshtein +
`string-similarity` dep, write-only confidences; turn dense OFF in the linker; fix the `:318`
aliasExact check + tier label; fix the `:561` else-bucket → `'weak'`. _Gate:_ tsc + tests; no result
diffs (dead/mislabeled code).

**Step 1 — Decision Ledger + harnesses (Deliverable 0).** Frozen fixture, typo generator,
variant-link replay, integrity check, tripwire metrics, sampling policy. _Gate:_ green baseline run
documenting _current_ failure rates (this is also the evidence pack for every later step).

**Step 2 — evidence tier end-to-end.** DTO ships `{score, evidenceTier, lane}`; tier-group sort;
explicit injected-lane rule (0.65 deleted). _Gate:_ impression log shows tiers; suggestion-diff
replay reviewed.

**Step 3 — data integrity + attribute fuel.** Merge the 7+4 duplicates, fix 18 ambiguous aliases + 2
mistyped entities, apostrophe-alias backfill; fresh extraction run to unstrand `food_attributes`.
_Gate:_ integrity check → 0; food_attributes 0→N; dish attribute search returns rows.

**Step 4 — attribute matrix deletion → structural rule.** _Gate:_ floor-clearance recompute;
exact-typed-attribute-zero-suggestions canary = 0. (Depends on Step 3 for sane in-lane ordering.)

**Step 5 — routing additions.** Typed-Return promoter (uniqueness precondition) in
`use-search-foreground-query-submit-runtime.ts`; segmentation cache with per-market linking +
single-flight + activation invalidation; LLM degradation path. _Gate:_ promoter fires only on unique
exact (replay the 18 ambiguous aliases — must NOT fire); cache hit-rate live; chaos replay green.

**Step 6 — fuzzy recall rework** (edit-distance arm, union admission, `word_similarity`,
normalization, script-gated phonetics, named shortlist floor). _Gate:_ typo-replay green per bucket
vs baseline — **merges only with the green run attached.**

**Step 7 — margin linker,** shadowed first. Shadow-log margin decisions vs live 0.82 decisions; seed
m from the alias replay; then flip; near-miss→same-pass expansion + on-demand exclusion. _Gate:_
variant-link replay at the chosen operating point; tripwire trending to 0; shadow diff reviewed.

**Step 8 — SQL execution.** Gated speculative fan-out, OR→UNION (EXPLAIN-gated), vote pre-LIMIT.
_Gate:_ result-equivalence diff = zero row changes; timing + load budget met.

**Step 9 — market geometry,** bounded by viewport. _Gate:_ the Step-1 boundary-miss metric
before/after; misses recovered, candidate-pool growth bounded.

---

# PART E — WHAT STAYS AND WHY (the anti-forced-rethink ledger)

- **Shared recall core (two-lane RRF, recall-only)** — the house standard; every smell lives around
  it, none in it. _Principled._
- **Six-lane autocomplete + reserved-slot blending** — LinkedIn's federation pattern; heterogeneous
  sources can't share a score scale, so slots guarantee variety and score fills the rest. _Principled._
- **Lexical-first entity scoring (bounded boost)** — what you typed beats what's popular. _Principled._
- **Phonetic backfill with its fire conditions** — rescues 63% of typo rejects, but only when better
  evidence under-fills; un-gating it floods short queries. _Principled (D2's un-gating rejected)._
- **4-rule submit routing** — independently convergent with the published Instacart/DoorDash frontier
  shape. _Settled + vindicated._
- **Four-array bucketing + four typed SQL predicates** — the arrays are the type system; 0.41%
  cross-type collision confirms the split earns its keep, and reveal-all covers the collisions.
  _Settled + principled._
- **Strict→expand→relax semantics, relaxation-capability rule, strict-above-backfill** — "never drop
  what the user named" is the ethos in code. _Principled._
- **25/10 thresholds** — interpretable quantities ("a page", "a screenful"), the right _kind_ of
  number; promoted to config with firing logs, kept separate. _Principled shape, knob values now
  instrumented._
- **Pure Crave-Score ordering, badge==position, no relevance tiebreak** — sacred, settled, and
  defensible (even Google treats proximity as soft). _Settled._
- **Profile-jump gate (exact/aliasExact + singleDominant + restaurant)** — the margin rule in
  miniature; now also lends the promoter its uniqueness test. _Settled._
- **Coverage status + two-pathway demand logging** — the flywheel is the long-term moat. _Principled._
- **denseMode `'always'` in ingestion** — its LLM judge can consume dense evidence; each consumer
  runs dense exactly when its decider can act on it. _Principled._
- **LLM judge at ingestion only** — commit-to-one belongs offline; query time reveals. _Settled._
- **Cross-table attribute OR semantics** — a restaurant qualifies via direct tag or dish-signal
  graph; only its _execution_ changes (UNION). _Principled._
- **`entity-doc.ts`** — canonical embedding-doc definition, live consumer. _Keep._
- **Generic-token strip, empty-interpretation gate, viewport `ST_Covers`, minimumVotes** — each one
  plain sentence, none contested. _Principled._

---

# PART F — OPEN QUESTIONS / OWNER DECISIONS

1. **Relax-trigger sequencing tension (small):** the panel unanimously keeps 10≠25, but D2's point
   stands that neither has ever been swept; the firing-rate log may eventually argue for change. No
   action needed now — flagging that "10" remains a taste-number with instrumentation, not yet a
   derived one.
2. **Containment-precision constraint for m:** critiques disagree — hard 100% precision on the 32
   pairs (validation-rigor) vs weighted-cost (explainability, "statistically illiterate at N=32").
   This plan chose weighted-cost with heavy penalty; if the owner wants zero-tolerance on wrong-dish
   links regardless of variant-recall cost, say so and the sweep constraint flips.
3. **Boundary-labeling reality:** pre-launch link volume is single-digits/week; m rides its
   replay-derived seed for months. The plan says so honestly — but if launch traffic stays low, m's
   refinement loop is decorative and the alias-replay corpus is the only ground truth. Acceptable?
4. **Multilingual timing:** normalization + script-gated phonetics ship with Step 6, but per-script
   edit-budget rules (CJK names are complete at 2–3 chars; transliteration variants are
   normalization-shaped, not edit-shaped) are deferred until a non-Latin market exists. If one is on
   the near roadmap, pull this forward.
5. **Speculation gate shape:** "speculate iff unresolved terms or attribute constraints present" is a
   structural condition, but it's still a _prediction_ of thinness; if the load budget proves
   generous in practice, unconditional speculation is simpler. Decide after Step 8's measurements —
   flagged so the condition doesn't calcify unexamined.
6. **Old Step-4 three-set on-demand collection is declared dead** here (the `unmet` slice covers
   resolved-but-low-coverage; the hole was disproven). If the owner believes a genuine
   no-local-coverage gap remains, that's a product call — the plumbing evidence says no.
7. **No settled owner decision was overturned.** The panel converged on keeping all of them, and in
   three cases (routing, geo-softness, profile gate) the industry research independently vindicated
   them.
