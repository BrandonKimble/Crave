# Campaign red-team v3 — commits 1e0c17907 + 9b326d5ed, run 2026-08-30

Method: read plans/wave-redteam-report.md, wave-acceptance-report.md,
merge-batch-audit.md first (closed findings NOT re-litigated — their fixes
were re-verified in the committed tree and on staging data); then both wave
diffs and the load-bearing files; then staging data passes (SELECT-only):
widening edges + ledger provenance, the 47 un-merged entities, the healed
evidence debt, recent claim_verdicts across lanes, and the owner-ordered
ungrounded-places audit. No LLM spend was needed — every finding below is
provable from code + data already on disk/staging.

---

## FINDINGS (ranked)

### R1 — HIGH — The place chooser declined ALL 716 grounding attempts in one sweep, and every decline spent a permanent strike; famous restaurants sit one failure from auto-archive
Data (staging): of 1,021 active ungrounded places, **716 share one last
attempt** — a single sweep, 2026-08-20 01:13→03:18 UTC (~10.5s/entity, so
the full autocomplete+Gemini flow really ran) — and **every single one**
carries `failureReasonCode='no_acceptable_candidate'`, reason "chooser
declined all candidate sets". The declined set includes trivially
groundable, famous, active Austin places: Rudys (1,315 entity events),
Easy Tiger, Salt And Time, Valentinas, Joe's Bakery, La Bbq, Shake Shack.
A 100% decline rate over 716 including these is a broken run, not 716
correct judgments — yet each decline was classified DEFINITIVE
(`restaurant-location-enrichment.service.ts` ~885–905: definitive spends a
strike; `LOCATION_NO_MATCH_ATTEMPT_THRESHOLD` default 3,
configuration.ts:253) and **682 entities now sit at fc=1, 34 at fc=2**.
At threshold the janitor ARCHIVES the entity (same file, the money-guard
comment). Mention-driven retry is real and fires
(`unified-processing.service.ts:3717–3733` enqueues on every place mention;
`restaurant-enrichment-queue.service.ts` jobId-deduped) — which means the
**Austin reload will re-attempt all of these, and if the chooser is still
declining, the fc=2 cohort (all of the highest-mention ungrounded places)
gets archived by the janitor in bulk.** Real, high-demand restaurants would
vanish from grounding permanently.
From-scratch fix (not a patch):
1. The chooser is a judged lane with **no gold gate and no rule ledger**
   (`restaurant-place-chooser.prompt.ts`) — bring it under the campaign's
   own fleet standard before the reload: pinned gold cases (Rudys/Shake
   Shack/Easy Tiger from this batch MUST accept; genuine ambiguity cases
   MUST decline), rule-release ledger, ×3 cert.
2. A run-level acceptance-rate tripwire, the merge-tripwire's sibling: a
   grounding sweep whose decline rate crosses a bound halts and alerts
   instead of writing hundreds of definitive strikes (the 08-20 run wrote
   716 with zero alarm — same disease as "the reason was a perfect tripwire
   and nothing read it").
3. After the chooser is fixed, void the 08-20 strikes via the existing
   `retryTerminal` bypass sweep (built for exactly this: "after a
   root-cause fix").
Blocking: Austin reload (the retry storm is mention-driven and automatic).

### R2 — HIGH/MEDIUM — Active place-entity twins: 26 exact-fold duplicates (plus variant twins) split mentions between an ungrounded shell and the grounded real entity; no court owns place sameness
Data: 26 active ungrounded places share an exact canonical fold with an
active GROUNDED place (e.g. `Valentinas` + `Valentina's` + `Valentina's`
[curly] — THREE actives on one fold, one grounded; `Joes Bakery` vs
grounded `Joe's Bakery`; also grounded-grounded twins: `Super Burrito` ×2,
`Mughlai Indian Cuisine` ×2). Beyond exact fold: `Rudys` vs grounded
`Rudy's "Country Store" and Bar-B-Q` (20 locations), `La Bbq` vs grounded
`la Barbecue`, `Shake Shack` vs a grounded NY Shake Shack row. The
ungrounded twin keeps absorbing mentions (Rudys: 1,315 events) that never
credit the real place — user-visible loss: praise for Rudy's ranks nothing.
Why it doesn't self-heal: the one mechanism that merges a duplicate into
the grounded owner is the grounding conflict path
(`restaurant-location-enrichment.service.ts:1027` "Place already owned by
another entity — merging without a details call") — which only runs when
the chooser ACCEPTS a candidate. R1's chooser declines everything, so the
self-heal is dead behind it. And the dedupe sweep the wave extended covers
items/ingredients/attributes — **places have no dedupe lane at all**.
From-scratch fix: place sameness belongs to the same sameness court as
everything else — a place-dedupe docket (exact-fold twins first, then the
embedding-recall shape) whose merge rule is identity + geography, with the
grounded row as survivor. Not a one-off script: the court, the ledger, the
same verdict-before-effect contract. (Fixing R1 also revives the
conflict-path self-heal for the variant-name twins.)
Blocking: not the reload mechanically, but the reload re-grows mention
volume onto the wrong twin — fix-first strongly preferred.

### R3 — MEDIUM — The rebuilt cuisine judge shipped without a rule ledger — the exact fleet standard this campaign set, violated by the campaign's own newest lane
Wave2 rebuilt cuisine-prompt.md wholesale (139 lines changed, 41/41 ×3
certified) — and it is one of two judged prompts in the new work with **no
rule-release ledger** (no fingerprint constant anywhere; grep for
`8fdb8cb2cd26` = the current text's hash finds nothing;
`core_restaurant_attribute_evidence` carries no version column). The next
unversioned edit re-rules every venue silently — the precise failure mode
acceptance finding 0 just demonstrated on attribute-merge. The rebuild was
the moment to add it and didn't. Same for the place chooser (R1.1).
Fix: the same `PromptRuleRelease` ledger shape as entity-dedupe /
attribute-merge / widening — v1 = the certified 41/41 bytes; recompute
rides the existing input-fingerprint gate plus the rule version.
Blocking: any future cuisine-prompt edit; cheap now, expensive later.

### R4 — MEDIUM — Falsified doctrine text committed: the attribute-merge gold fixture still declares the OVERRULED basis
`apps/api/scripts/fixtures/attribute-merge-gold-cases.json:2` —
"THE INTERCHANGEABILITY TEST, searcher-tolerance basis per owner rulings
2026-08-30" — is the v3 doctrine the same wave replaced with SAME-CLAIM
(v4/v5; the fixture's own case `why` fields cite "storage merges only
same-claim"). Wave-redteam L3 flagged exactly this line; the fix agent
deferred it to "the attribute-doctrine agent's territory" and it was
committed stale. A future agent reading the fixture header re-learns the
overruled doctrine. Also in this class: `scripts/fixtures/cuisine-prompt.v2.md`
is a stale DRAFT of the live prompt (first line already diverges) sitting
in the fixtures directory with no reader (`grep cuisine-prompt.v2` over
scripts+src: zero hits) — a drift trap beside a certified prompt.
Fix: one-line description correction; delete the v2 draft.

### R5 — LOW/MEDIUM — The L5 sweep never happened, and a new in-flight edit is sitting uncommitted on a certified file's module
The tree after both commits still carries the spent study artifacts
wave-redteam L5 ordered swept "before commit": `scripts/fixtures/shard3*`
(6 files), `dish-knowledge-gold.d4.run*.result.json`,
`prompt-ab.d4.cert.run*.result.json`, `cuisine-gold.name-judge.run*.json`,
plus a new `scripts/bundle-size-experiment.ts`. And
`src/modules/search/demand-vocabulary.service.ts` has a substantive
UNCOMMITTED modification (the owner-ordered "ONE-INTAKE merge") — active
work, fine, but it is exactly the shape acceptance finding 0 punished:
an edit riding on a module between certification and commit with no
owner-of-record in any report. Coordinator should name its owner and land
or revert it deliberately; sweep the artifacts (keep the gold fixtures
harnesses read; archive run-results and shard dumps).

### R6 — MEDIUM (post-reload sequencing) — First crons-on nightly can silently wipe the 4,907 category edges before the knowledge backfill runs
Staging holds 4,907 `derived_food_category_edges` rows — pre-D4 edges from
the retired per-connection categories (scheduler is off, so the nightly
never re-ran). The rebuilt builder derives ONLY from `knowledge_categories`
(`food-category-edge-builder.service.ts:118–125`), which is empty
everywhere (0 rows staging) until the v4 backfill runs. The base class
deliberately does NOT scream on zero-input-zero-output ("not a defect"),
so the first nightly in a crons-enabled env replaces 4,907 edges with 0,
silently — category search goes dark until the backfill. The reports say
"backfill before trusting category search" but nothing prevents the wipe.
From-scratch fix: the rebuild should refuse to replace a non-empty edge
table from a zero-input population — as a stated stand-down ("knowledge
backfill has not run; keeping the standing edges"), logged, not a silent
guard. Sequencing note added to the reload runbook either way.

### R7 — NOTE — Owner-lens on the applied widening edge set (no code defect)
The 174-edge reviewed set applied cleanly (sha provenance verified, both
rounds: 519e1460… rv2/3, 647a7cc8… rv4/5; `entity_satisfies` 63 satisfies
/ 111 rejects at rv4/5). Reading the applied satisfies edges as a diner:
`kebab shop→gyros`, `kebab shop→shawarma`, `not overly sweet→lemony`, and
`pasture raised↔grass fed` (both directions) are the stretchiest survivors
of the tie-break law — each admits venues on a tag the searcher didn't
name. None is wrong under the same-domain-adjacency ruling; all four are
worth the owner's eye on the first real search pages. `pub→bar` correctly
absent (judged direction is bar→pub); `gooey↔fudgy` now settled BOTH
directions by the reviewed table, retiring the instability finding.

---

## UNGROUNDED-PLACES AUDIT (owner addition)

### Census
- Active place entities: **8,338**. Ungrounded (no google_place_id on any
  location): **1,021 (12.2%)** — 875 with placeless location rows, 146
  with no location row at all.
- Age: 572 born July (the 07-30 reload era), 449 August.
- Attempt state: **303 never attempted** (fc=0, no breadcrumb),
  **716 attempted-and-declined in the single 08-20 sweep** (all
  `no_acceptable_candidate`), 2 upstream errors. Strikes: 305 at 0,
  682 at 1, 34 at 2 (threshold 3 = janitor archive).
- Mention volume: 87 entities with ≥100 events, 278 with 20–99, 281 with
  5–19, 375 with <5.

### Verdict table (110 sampled: top-45 by events + 65 stratified mid/low/never)
| Class | Share (est.) | Evidence | Disposition |
|---|---|---|---|
| REAL-BUT-UNHOOKED, high demand | ~all of the ≥20-event cohort (365 entities) | Rudys 1,315 ev, Rebel Cheese 908, Valentinas 824, Salt And Time 731, Chiefs Bbq 598, Joes Bakery 562, Easy Tiger 431, La Bbq 228, Shake Shack 194… every one verified a real venue | R1 (chooser) is why they're unhooked; 26+ are twin-splits (R2). User-visible loss TODAY: their mentions rank nothing on the map |
| REAL, low demand / out-of-metro | ~35–45% of the <20-event tail | Craftsman And Wolves (SF), L Industrie (Brooklyn), Coco Ichibanya, Beto's, Word Of Mouth, Irenes, Greens Sausage House, Shoreline Grill, Continental Club | Mention-driven retry is the right economics; fix R1 first so retries can succeed |
| GHOST (junk extraction) | ~30–40% of the <5-event tail (~120–150 entities) | "Bbq", "Halal", "Tiki", "512", "Cm" (×6 same-fold actives!), "Chipotlane", "Dfh 90 Min", "Chef Michael Wake" (a person), "Moody Theater" (a venue, not a restaurant), "Cypress Hill" | Exactly the restaurant-name census docket head — the court + janitor pairing already built and flagged off; arm per launch-flip-list |

### Retry machinery verdict
Mention-driven retry EXISTS and FIRES (code: unified-processing enqueue on
every place mention → BullMQ jobId-deduped → worker hasPlaceId-idempotent;
evidence: the fc counters and breadcrumbs move together). Nothing is
retry-starved by design — the 08-20 sweep IS the starvation: it converted
one broken run into 716 definitive strikes, and staging has had no
collection since to retry them. Headline: **the ungrounded backlog is not
a lifecycle gap; it is one broken judge (R1) plus a missing place-dedupe
court (R2), and the ghost tail already has its designed drain.**

---

## VERIFIED CLEAN (checked, found sound)
- **Un-merge held**: all 47 losers active and redirect-free on staging
  (spot-checked carnitas, ribs, peppers, sub, ceviche de pescado, bbq
  pork, garden salad, beef fajitas, dark rum); 48/48 audit rows sit as
  `hold` with "overturned by merge-batch audit" reasons.
- **Reason tripwire**: shared implementation, wired at BOTH chokepoints;
  reasonless judge verdicts already fail to hold upstream
  (food-dedupe-merge.service.ts:1179–1185), so the reasonless-merge gap is
  closed; banned-class list matches the batch's actual wrong reasons.
- **F1/F2/G1 fixes stuck in the commit**: presink NOT-EXISTS live-twin
  standdown + advisory lock + P2002-only absorb; embedding docket
  ledger anti-join INSIDE both LIMIT bounds (lines 555/694/724); no lane
  synthesizes a reason from the decision token.
- **Prompt/ledger integrity**: attribute-merge v5 fingerprint
  `f5416506d060` matches disk (honest unrecoverable-delta note in the
  ledger); entity-dedupe v5 `e0236ace3f8a` matches disk; entity-match-gold
  carries the batch pins (carnitas both directions, omakase). Boot-smoke
  standing gate present and truthful.
- **Widening apply provenance**: every concept_satisfies ledger row
  stamps its reviewed-table sha; both applied tables accounted for; edge
  reads indexed (from+relation, to) and request-memoized (H6) — no new
  unmeasured hot-path cost found; verdict reasons are uniformly
  diner-framed and specific.
- **Stale-evidence heal executed and complete**: 0 redirect-healable
  evidence rows remain; the 758 tombstone-pointed rows left alone by
  design; oppose/product-kind subqueries now require `status='active'`.
- **Verdict quality data pass**: recent entity_match rejects are the
  intended junk classes ("la", "chicago" → new with honest reasons);
  entity_dedupe v999 rows are rehearsal probes, not a leak;
  dumpling-soup hold never executed.
- **Corpus-global doctrine v5**: same_place removed from sweep hearings in
  the prompt text; prompt says it is "NEVER by itself a reason to match" —
  consistent with the tripwire and the gold pins.

## FIX-FIRST vs POST-RELOAD
**Fix-first (before the Austin reload / arming):**
- R1 — chooser gold gate + acceptance-rate tripwire + strike void
  (the reload's mention-driven retries otherwise walk the fc=2 cohort into
  janitor archive).
- R2 — place-dedupe court (at minimum: exact-fold twin absorption into the
  grounded survivor) so reload mentions credit the real entities.
- R5 — name the owner of the uncommitted demand-vocabulary edit; sweep or
  archive the study artifacts.
**Cheap, do with the next commit:** R3 (cuisine + chooser rule ledgers),
R4 (fixture description line, delete cuisine-prompt.v2.md).
**Post-reload / sequencing:** R6 (edge-wipe stand-down + runbook order:
knowledge backfill → category edge nightly), R7 (owner eyeball of the four
stretchy edges on real pages), ghost-tail drain via the already-built
census+janitor pairing.
