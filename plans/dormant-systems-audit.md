# Dormant-systems audit (the D7 reachability docket, executed)

2026-08-30. Read-only audit of every dead/gated/orphan flag in
`docs/llm-systems-map.md`, with ledger evidence from **staging**
(tokaido, `crave_search`). This is the per-system input the
post-reload "D7 reachability" step in `plans/ideal-architecture.md`
asked for. One caveat that colors two systems below: **staging's
`signals` table is EMPTY (0 rows)** — user-demand-driven backlogs
cannot be measured there, only their machinery.

**Two map corrections found (the map is stale on both):**
- `user-taste-profile.builder.ts` is NOT orphaned — it is called by
  `signal-demand-aggregate.service.ts:244` (the 15-min cron) and read
  by `curated-list-builder.service.ts` (2 sites).
- `estimator-registry.ts` has TWO consumer families, not one: polls
  supply (4 configs) AND collection's `keyword-explore-yield.estimator.ts`
  (D41, durable store, live in keyword slice selection).

---

## 1. Restaurant-name court — WIRE UP (build the census feeder); ledger quality is GOOD with one live counter-example

**Purpose:** judge "is this surface genuinely a NAME of this restaurant"
so a generic word minted as a restaurant surface stops annihilating
searches (the ghost-"Best" incident: `best` as a recall surface hard-ANDs
every "best X" query to one entity).

**Ledger (119 verdicts, all decided 2026-08-16 in one 2-minute manual
run, all `executed_at` set — no stranded effects):**
- 105 isName / 14 notAName.
- Hand-read of all 14 denials: high quality. Every reason cites concrete
  evidence — `easily` ("Easily has a really good prime rib sandwhich" —
  adverb misread), `cozy` ("Cozy NY style pizza" — adjective), `side`
  (shorthand truncation of "A Side"), `bem`/`bep`/`senza` (ungrounded,
  zero corroboration). No denial looks wrong.
- Hand-read of upholds: also sound — `bbq` is bb.q Chicken (grounded),
  `goal` is Goal Omakase Sushi (grounded), and the deliberately hard
  generic names (Supper, Apothecary, Ordinary, Quality, Standard, Home,
  House, Library, Secret) are real venues; upholding them is the whole
  point of a provenance court over a word-shape blacklist.
- **The one thing that looks OFF:** the founding ghost itself, entity
  "Best" (`b92af0ed`), was UPHELD (`isName` — "the source text
  consistently uses 'Best' as a proper noun"). That is defensible under
  the rule (SD-3 ruled name-hood and searchability separately: an
  upheld name on an ungroundable entity dies at the LIFECYCLE, not the
  court). But the lifecycle half is dormant: "Best" is still
  `active`, its `best/recall/active` surface still live,
  `enrichment_failure_count = 1` (< threshold 3), and the janitor cron
  is off. **The court + SD-3 doctrine only closes the ghost hole when
  the janitor runs** — the two systems are one mechanism.

**Ghost exposure without a feeder:** 399 unheard single-word active
recall surfaces sit on UNGROUNDED active place entities right now.
Most are legit proper names (alonzos, arturos, braums…), but the pool
contains live query-words: `bacon`, `bbq`, `bliss`, `brooklyn`, `buff`,
`buddies`, `7`, `capri`. Each is a potential search-annihilator today.

**Intended feeder:** the "generic-word census" referenced in the service
header and script ("the other session's subject E") was **never
committed** — no census script exists anywhere in the repo. The court
deliberately selects nothing corpus-wide itself.

**Ideal-shape check:** ledgered ✔ versioned (rule fingerprint) ✔
budget-gated ✔ crash-resume ✔ scheduled ✘ (the only gap).

**Recommendation — WIRE UP:** write the census as a docket feeder
(~the SQL above: single-word active recall forms on place entities,
ungrounded-first, unheard-at-current-rule-version) and hang it on the
knowledge-maintenance rail (watermark-driven, like every other pass),
feeding `hear()` under the existing budget gate. Cost: tiny — the whole
119-verdict backlog was 8 claims/call ≈ 15 LLM calls; the 399-row
backlog is ~50 calls once, then a trickle. Post-reload (surfaces churn
in a reload; hearing before it wastes verdicts on rows the reload
replaces). Pair it with item 3 — the court without the janitor does not
close the ghost hole.

## 2. Demand-vocabulary learner — LEAVE (manual) until launch, then WIRE UP; zero past bankings to judge

**Purpose:** learn a word we lack for a concept we have (`gambas`→shrimp)
from unmet-search-ask signals, via the existing identity judge; bank as
`entity_surface` source `query_banking`.

**Evidence:** staging `signals` is empty ⇒ unmet-ask backlog = 0 rows,
0 distinct terms; **`entity_surface` has 0 `query_banking` rows** — the
lane has never banked a single word, so there is no past-quality to
grade and nothing is currently being "silently missed" (there are no
users generating asks yet; iteration-phase ruling has staging/prod
user traffic at ~nil). The 84 `collection_on_demand_requests` rows are
the other (multi-token, cron-served) lane's business.

**Code quality:** genuinely good and recently hardened — advisory-locked
(F8), locale-chain-correct known-set, fail-closed judge, collision-
guarded banking, k-anonymity floor joined as a DB object, the R14
dead-enum bug found+fixed 2026-08-19. Ledger note: it spends under lane
`entity_match` with no lane of its own, so its spend/decisions are
indistinguishable from resolution's in `claim_verdicts` — acceptable
(same prompt, same claim shape) but worth knowing when auditing
entity_match volumes.

**Recommendation — LEAVE manual now; wire at launch.** The input is
user demand; before launch there is none, and a cron would run empty
forever. Add it to the pre-launch checklist next to
`LOCATION_LIFECYCLE_CRON_ENABLED`: a nightly slot on the vocabulary-
maintenance rail (it already owns the 4AM word-hearing drain — same
family, shared cadence). Cost when live: one `matchEntity` call per
distinct unknown term, capped at 100/run.

## 3. Restaurant janitor — WIRE UP at launch (it is on the pre-launch checklist already); staleness is real but cheap

**Purpose:** the ACT half of grounded-place decay — weekly refresh of
stale locations (business_status, moved redirects) + archive
all-closed and terminally-ungroundable restaurants.

**Staging evidence:**
- 13,256 grounded locations; median `last_polled_at` ≈ 2026-07-30
  (~1 month old); 7,445 already >30 days stale, 1,185 never polled,
  none yet past the 90-day TTL (corpus is young — the wall arrives
  ~late October when the July grounding wave crosses 90d at once).
- Missed-signal backlog today: 1 restaurant all-CLOSED_PERMANENTLY
  (would archive), 107 locations CLOSED_TEMPORARILY, 0 moved_place_id,
  0 entities at the ungroundable threshold (≥3 failures) — but 716
  active ungrounded places carry ≥1 definitive failure and are drifting
  toward it, and per item 1 the SD-3 ghost-kill depends on this arm.
- Code is in ideal shape: config validated at boot (F365), selection
  ids in the summary for testability (F370), user anchors inviolable,
  archive = reversible status flip, place-grounded rows never deleted.

**Cost of turning it on:** DETECT = ≤250 lean-SKU details calls/week
(`LOCATION_REFRESH_LIMIT`). Steady state wants 13,256/90d ≈ 147
calls/day ≈ 1,030/week — so the 250 cap means the fleet cycles every
~53 weeks, not 13; at launch either accept slower rotation or raise
the cap. Money: even priced at the enterprise details rate from
CLAUDE.md (~$25/1k, an overestimate for the lean SKU), 250/wk ≈
**$6.25/week (~$27/mo)**; the full 90-day-honest rate ≈ 1,030/wk ≈
$26/week (~$110/mo) upper bound. Real lean-SKU cost is likely 3–5×
lower. Reconcile against BigQuery after the first month (standing law).

**Recommendation — LEAVE off until launch, then flip
`LOCATION_LIFECYCLE_CRON_ENABLED=true` (it self-documents this:
"Enable at launch — a dev corpus has nothing worth keeping fresh").
Decision needed at flip time: raise `LOCATION_REFRESH_LIMIT` toward
~1,000/week or accept the slow cycle. No pre-reload action.**

## 4. user-taste-profile.builder — LEAVE; the map's "no caller" flag is WRONG — fix the map

**Purpose (D40 §3):** derived facts-only taste profile (act_count,
last_act_at per actor×subject×window) so curated recipes read one
table instead of hand-rolling `signals` SQL.

**Evidence:** it IS wired: `signal-demand-aggregate.service.ts:244`
calls `rebuildForDays()` on every 15-min aggregate tick;
`curated-list-builder.service.ts` reads `user_taste_profile` at 2
sites; person-data (GDPR) rules cover the table. Recent commits show
active care (redirect-following fix, red-team 2026-08-19 H1). The
table is empty on staging only because `signal_demand_daily` is empty
(no user signals). Product home: personalization for home curated
lists (`product/` weekly-list work, D39/D40 lineage).

**Recommendation — LEAVE as is; delete the "Orphaned" bullet from
`docs/llm-systems-map.md` (and the D7 line in ideal-architecture.md
that repeats it).** No other work owed.

## 5. full-projection-rebuild.runner vs rebuild-affected-projections.ts — LEAVE the runner, DELETE-or-genericize the script

**Both call the same real path** (`ProjectionRebuildService
.rebuildForPlaces` + `rescoreCoordinator.markDirty`), so there is no
divergence risk — they differ only in SELECTION:
- **Runner** (env-gated, worker-boot): EVERY restaurant with any
  evidence. The generic after-data-surgery disaster tool. Recently
  maintained (F466 flag dialect, F9608 process-role, lens-2 auto-
  markDirty). Still the right tool for "a migration touched evidence
  tables"; nothing supersedes it.
- **Script** (2026-08-29): a scoped one-off, self-declared
  `@runner: one-off (v16 activation repair)` — the affected-set for
  one prompt hash. It exists because `activate-shadow`'s
  `affectedPlacesForDocuments` had an alias bug; the durable fix
  belongs in activate-shadow itself (verify that bug is fixed there —
  if it is, the script is a spent one-shot).

**Recommendation:** keep the runner as THE disaster tool. The script:
check `activate-shadow.ts` carries the alias fix, then either delete it
or strip the v16 framing and keep it as the *scoped* companion
("rebuild for prompt-hash X in communities Y") — useful again at the
next activation, and cheaper than the full runner. Either way, one
line in the map distinguishing "full (runner)" from "scoped (script)".

**RESOLVED (red-team L4, 2026-08-30): script DELETED.** The alias bug is
fixed at the source — `extraction-scope.service.ts` selects
`restaurant_id AS place_id` in `affectedPlacesForDocuments`, and
`activate-shadow.ts` calls that method; the scoped selection logic lives
durably in the service (`activePlacesForPromptHash`). A future scoped
rebuild is a small runner over the service, not the v16-framed artifact.

## 6. estimator-registry — LEAVE; shrink the docblock, not the code

Two live consumer families (polls supply ×4; collection exploreYield,
with the durable D41 state store). The docblock still promises
"viability, answerYield, conversion, concentration, expected-new-
content, thread-activity half-life, burst variance, kind weights,
demand estimators" — most unbuilt. The engine itself is small (390
lines), well-tested, and its registration-time laws (closed-loop
exploration, named turn-on triggers) are exactly the no-fake-estimates
doctrine in code form. Generalizing further with no third consumer
would be speculative; deleting punishes a working primitive.

**Recommendation — LEAVE the implementation; edit the header docblock
to name the two real consumer families and demote the rest to "config
shapes future consumers may register" (the prompt-philosophy canon's
no-non-exhaustive-promises rule applies to docblocks too).** Post-
reload, trivial.

## 7. alias-management.service — MERGE INTO callers and DELETE the service (post-reload)

**What it is now:** 273 lines of PRD-9.2.1-era logic reduced to two
jobs across 4 consumers:
- `mergeAliases`/`addOriginalTextAsAlias` (entity-resolution:2082,
  location-enrichment:1564): trim + length-cap + case-insensitive
  dedupe of NEW alias strings before they go to `addSurfaces` — which
  is already idempotent per (entity, locale, form) and collision-
  guarded. The dedupe is a micro-optimization the surface writer makes
  redundant.
- `validateScopeConstraints` (cuisine-extraction ×3, poll-entity-seed,
  entity-resolution): a **hardcoded 18-word keyword blacklist**
  ("patio", "spicy"…) deciding place-vs-item attribute scope by
  substring. This is exactly the non-exhaustive-list antipattern the
  prompt canon banned, and it duplicates what the attribute-ontology
  placement judge and word courts now own with real judgment. In
  entity-resolution it only WARNS (log line, nothing filtered); in
  cuisine-extraction it silently drops matching cuisines (an English-
  only, substring-based drop — `includes('mild')` would eat any
  cuisine containing that substring); in poll-entity-seed it 400s.

**What breaks on removal:** nothing structural. entity-resolution loses
a warn-log; location-enrichment inlines a 5-line trim/dedupe (or drops
it — addSurfaces dedupes); cuisine-extraction stops pre-filtering and
lets the ontology quarantine judge scope (its S4 comment says venue
attributes already ride the ontology); poll-entity-seed keeps a scope
check only if the owner wants a hard 400 — if so, that one becomes a
local 20-line helper, not a shared "service".

**Recommendation — MERGE/DELETE post-reload:** inline the trim/dedupe
where still wanted, delete `validateScopeConstraints` in favor of the
ontology judge (cuisine) and a local check (polls), delete the service
+ module wiring. Zero LLM cost; ~1-day change with the 4 call sites.

## 8. Lane governance nits — small fixes, enumerated exactly

1. **Orphan lane `dish.knowledge_synthesize`:** the bare string appears
   in `dish-knowledge-synthesis.service.ts` (×3),
   `dish-knowledge-rule.ts:43`, `gemini-caller-profiles.ts:197`,
   `llm.service.ts:1934`. Fix: mint
   `export const DISH_KNOWLEDGE_LANE = 'dish.knowledge_synthesize'` in
   `dish-knowledge-rule.ts` (or a new `dish-knowledge-lane.ts`
   matching the other lanes' shape) and use it at all sites, so the
   map's lane grep (`grep "LANE = '"`) finds it. Do NOT rename the
   string itself — 0 verdict rows exist on staging (the flag defaults
   off), so a rename is *currently* free, but the caller-profile key
   shares the string; keep them equal.
2. **Hyphen/underscore drift** (`word-genericness` etc. vs everything
   else): 138k verdict rows are keyed under the hyphen names on
   staging alone. A rename buys cosmetic consistency at the price of a
   claim_verdicts data migration in every env. **LEAVE — document the
   drift in the lane constants file as deliberate-frozen** ("the lane
   string is a ledger key, not a style choice").
3. **Unprobed lanes:** `bench-prober.ts` has exactly ONE registration
   site (`word-vocabulary-judge.service.ts:176`, the word lanes).
   Every other lane reports "unprobed" on approval sheets — which the
   registry's own doc calls honest, so this is a per-lane cost/benefit
   call, not a defect. Highest-value next probers, in order:
   `entity_match` (9,727 verdicts, backs TWO lanes — a version bump is
   currently unprobeable in both) and `word_claim` (4,819). The tiny
   lanes (restaurant_name 119, entity_dedupe 38, attribute_merge 0)
   aren't worth adapters yet.

## 9. Relevance gate's private verdict table — LEAVE (deliberately), record the reasoning

`collection_relevance_verdicts`: 8,846 rows across 3 prompt hashes,
keyed (platform, postId, promptHash). What it "loses" vs
`claim_verdicts` is mostly inapplicable:
- **Crash-resume/verdict-then-effect:** the gate's effect is inline
  flow control (drop-or-extract this post now); there is no deferred
  corpus mutation to resume. The primitive's best feature buys nothing
  here.
- **Rehearing gates:** prompt-hash-in-key already IS its rehearing
  policy (new prompt = new row, old rows inert), and its prompt is one
  of the only two registry-versioned ones — governance is ahead of the
  fleet, not behind it.
- **Budget metering:** real gap, but gate spend is governed upstream by
  collection's spend-campaign envelope; a per-claim rolling allowance
  would double-govern the same dollars.
- **Scale asymmetry:** the gate writes one row per POST — at reload
  scale this is the highest-cardinality verdict stream in the system.
  Folding it into claim_verdicts bloats the ledger every other lane
  scans (decidedKeys, pendingExecution) for zero shared machinery.

**Recommendation — LEAVE, and change D8's wording** from "fold into
claim_verdicts (queued)" to "examined 2026-08-30: intentionally
separate; per-document gate verdicts are a different animal from
per-claim corpus rulings." Migration cost if ever done anyway: new
lane + adapter + 8.8k-row backfill + index pressure — a day of work
buying nothing.

## 10. Photo is-food inline prompt — WIRE UP (make it a .md), lowest priority

The one classifier whose rule text isn't a file in `prompts/`. The
call itself is already fleet-standard (gateway caller profile, temp 0,
enforced JSON enum schema after the 2026-08-11 parse-and-pray fix,
fail-open documented as topicality-not-safety). The prompt is one
sentence. Moving it to `photos-is-food-prompt.md` + `readFileSync`
loader costs ~30 minutes and makes the prompt-dir census complete —
worth doing purely so "every .md in prompts/ is a system" stays a true
sentence. Note it then joins the D6 problem (unversioned readFileSync
fleet) — fine; D6 fixes them all together.

---

## Action table

### Pre-reload (changes extraction/resolution behavior)
**None.** Confirmed expectation: every item here is post-reload or
launch-gated. (The only near-miss: if the owner wants the 399-surface
ghost pool judged BEFORE the reload's search validation, the court can
be run manually today with a hand-built docket — but reload churn will
re-mint surfaces, so post-reload is still the right slot.)

### Post-reload
| # | Action | System | Size | Notes |
|---|--------|--------|------|-------|
| 1 | Build the generic-word census docket feeder → knowledge-maintenance rail → `hear()` | restaurant-name court | ~1–2d + ~50 LLM calls | Closes the 399-surface ghost pool (`bacon`, `bbq`, `brooklyn`…). Feeder never existed — was "the other session," never committed |
| 2 | Fix the map: taste-profile is wired; estimator has 2 consumers; runner-vs-script note | docs/llm-systems-map.md | 30min | Two flags proven stale by this audit |
| 3 | Delete alias-management: inline trim/dedupe, ontology owns scope, local check for polls | alias-management | ~1d | 4 call sites; the 18-word blacklist silently drops cuisines today |
| 4 | Verify activate-shadow carries the affected-set alias fix, then delete or genericize the one-off script | projection rebuild | 1–2h | Runner stays THE disaster tool |
| 5 | Mint `DISH_KNOWLEDGE_LANE` constant; freeze-and-document the hyphen drift | lane governance | 1h | No string renames — ledger keys |
| 6 | entity_match bench prober (covers entity_dedupe's shared prompt too) | iteration bench | ~1d | 9.7k verdicts currently unprobeable on a version bump |
| 7 | Shrink estimator-registry docblock to real consumers | estimators | 15min | |
| 8 | `photos-is-food-prompt.md` extraction | photo vision | 30min | Then rides D6 |
| 9 | Rewrite D8's relevance-gate bullet: examined, intentionally separate | ideal-architecture.md | 10min | |

### Launch-gated (pre-launch checklist, not backlog)
| Action | Flag | Cost |
|--------|------|------|
| Turn on the janitor; decide refresh cap (250/wk cycles the fleet in ~1yr; ~1,000/wk honors the 90d TTL) | `LOCATION_LIFECYCLE_CRON_ENABLED=true` | ~$27–110/mo Places, reconcile vs BigQuery after month 1 |
| Schedule demand-vocabulary on the vocabulary-maintenance rail | (add cron) | ~100 judge calls/night max, only with real user asks |

### Ledger verdicts on "are they doing a good job"
- **restaurant-name court:** yes — 14/14 denials well-grounded, upholds
  defensible. The OFF item is systemic, not a bad verdict: the ghost
  "Best" is upheld-as-name AND still search-live because the janitor
  (its designated killer under SD-3) is dormant and its failure counter
  sits at 1 of 3. The court and the janitor are one mechanism; ship
  them together.
- **demand-vocabulary:** no ledger to judge — zero bankings ever
  (`query_banking` = 0 rows), zero unmet asks on staging.
- **everything else:** deterministic or unrun; no verdict history to
  grade.
