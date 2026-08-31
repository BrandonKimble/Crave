# Waves 3–4 red team — commits 50850a637 + c8f647ad3, run 2026-08-30

Method: read plans/wave-redteam-report.md + campaign-redteam-v3.md first (closed
findings re-verified in HEAD, not re-litigated); then both wave diffs and the
load-bearing files end to end (tripwire, chooser prompt + rule ledger, strike
void, intake service + matcher extraction, match-explain + builder/executor
columns, servable-place-scope + all 8 consumers, polls frame gate, fold v2,
prompt debts); then 3 LIVE mutation spot-checks (run, not reasoned); then a
staging SELECT-only data pass (verdicts, strikes, A-1 census, twins, fold
census, satisfies versions) plus a local-DB provenance probe. $0 LLM spent.

---

## FINDINGS (ranked)

### W1 — MEDIUM/HIGH — The decline-rate tripwire guards only the batch sweep; the reload's dominant grounding lane (mention-driven per-entity worker jobs) has no rate alarm, and chooser v2 has ZERO real verdicts yet
Code: `grounding-sweep-tripwire.ts` is a per-run in-memory accumulator wired
into exactly two callers — `enrichMissingPlaces` (the sweep loop,
restaurant-location-enrichment.service.ts:410) and `reground-ghosts.ts`. The
path the Austin load actually exercises — unified-processing enqueues on every
place mention → BullMQ → `enrichPlaceById` → `enrichPlace` — passes through NO
accumulator: each job is its own "run", so a v2 chooser misbehaving at scale
would spend definitive strikes job-by-job with zero alarm, the exact 08-20
disease one lane over.
Data (staging): `claim_verdicts` lane place_grounding holds **v1 only** (3,904
rejected / 2,445 selected) — **not one v2 verdict exists anywhere**. v2's
10/10×3 gold cert is real but harness-only; its live acceptance rate is
unmeasured, and the tripwire that would catch a broken v2 doesn't sit on the
lane that will do the judging.
From-scratch fix (not a patch): the rate is a property of the LANE, not the
loop — give the worker path the same alarm from the durable breadcrumbs it
already writes (e.g. the ops-alert emitter reads the trailing-N
`no_acceptable_candidate` share across completed jobs, halting the enrichment
queue the way the sweep halts), and/or SEQUENCE the load: run the tripwired
`enrichMissingPlaces` sweep over the 1,021-entity ungrounded backlog FIRST,
watch v2's real acceptance rate land, only then arm mention-driven retries.
Blocking: the Austin load's grounding wave.

### W2 — MEDIUM — The A-1 visibility floor lives in the ONE fragment — but 5 of 8 servable-scope consumers deliberately compose only `marketIncludedSql` and never see it
`servablePlaceConditionsSql` (search list/map/dots + search-coverage) carries
the new `placeVisibilityFloorSql`; autocomplete.service.ts:1417,
teaser.service.ts:301, curated-list-builder.service.ts:839,
signal-demand-read.service.ts:531/778, public-crave-score.service.ts:944/990
compose `marketIncludedSql` alone. The file's "two grains" rationale predates
A-1 — it justified STATUS strictness, not the new visibility floor — so the
floor silently forked at birth. Concrete UX: a 1-mention ungrounded mint (or
one of the 507 shells) still autocompletes and can seed teaser/curated rows,
and the search it hands off to then serves nothing.
Fix: export the floor as its own grain (`placeVisibilityFloorSql`) and compose
it at autocomplete/teaser/curated (score + signal lanes may genuinely not want
it — say so in a named opt-out comment at each site, the user-list pattern).
User-list opt-out verified present and principled (assembler:334).

### W3 — MEDIUM — docs/llm-systems-map.md still documents the DELETED unsegmented-residue service — in the same commit that claims the glossary was baked into that doc
Row 87 names `search/unsegmented-residue.service.ts` (deleted by 50850a637) as
a live system, and line 137 teaches the OVERRULED doctrine ("Two
vocabulary-learning lanes … different triggers, prompts, no shared budget" —
falsified by the ONE-INTAKE merge, which unified trigger, matcher, and budget).
Also dangling: search-query-interpretation.service.ts:815 comment cites
"unsegmented-residue.service.ts:17". A future agent reading the map re-learns
the deleted architecture. Fix: rewrite the two doc rows to the intake shape,
fix the comment.

### W4 — MEDIUM(low) — 174 hand-seeded `prompt_version=999` widening edges live in the LOCAL dev DB, readers don't version-filter, and the default staging fill would promote them
The TEMPORARY why-matched probe seeded staging's judged edges into local
`entity_satisfies` at prompt_version=999 (why-matched-probe.ts:6; local census:
174 rows at 999 beside 2,120 at v1). The satisfies readers
(search-sibling-expansion.service.ts:306/473/530) filter by relation only —
never by version — so these provenance-less rows are LIVE widening arms
locally, and `push-local-db-to-staging.sh` ("staging == your local corpus, the
default pit-stop") would make them staging truth with no ledger entry behind
the version stamp. Staging itself is clean today (v1/4/5 only). Also in this
class: why-matched-probe.ts + why-matched-rebuild.ts are self-labeled "delete
after the report records the findings" — the report is banked, the scripts
remain; and the L5 artifact sweep (shard3*, run-result fixtures) is now flagged
by a THIRD consecutive red team.
Fix: `DELETE FROM entity_satisfies WHERE prompt_version = 999` locally; delete
the two temp scripts; sweep/archive the study artifacts — all before the next
push-local-db-to-staging.

### W5 — LOW/MEDIUM — An intake retry double-writes demand for rows that already succeeded
`processGroup` writes per-row demand (recordRequests + on_demand_ask signals)
inside a loop over ALL staged rows, and only marks the rows 'segmented' after
the whole loop. A mid-loop failure (row 5 of 10) retries the entire group up to
3×, re-recording demand for rows 1–4 — inflating the ask counts the R4-② law
exists to keep honest (and the void the row-dedup fix was celebrated for).
Second defect in the same block: `this.signals.record(...)` is fire-and-forget
(unawaited) — a rejected promise is an unhandled rejection and a silently lost
ask. Fix shape: process-and-mark per ROW (each row's demand write and its
status update travel together), await the signal write.

### W6 — LOW — The intake re-tokenizes by whitespace — a second tokenizer beside the A2 one-tokenizer law
`segmentPieces` uses `residueText.split(/\s+/)`: an unspaced CJK residue run
counts as ONE token, skips the splitter LLM entirely, and lands as one giant
untyped on_demand_ask "word". The interpretation service upstream obeys A2
(analyzer units); the intake forked it. Zero Austin impact (en/vi/es are
spaced); a real zh defect. Fix with the zh vocab launch (or now): count
analyzer strip-units, not whitespace splits. Note the old hot path's threshold
was `tokenCount <= 2` for the direct-ask lane; the intake's is `<= 1` — 2-word
residues now buy a segmentation call each. Deliberate-looking, but nobody wrote
it down.

### W7 — NOTE — The why-matched token column's hot-path cost is reasoned, not measured
`restConceptTokenSelect` re-evaluates `restConceptExpr` (which embeds a
correlated dish-EXISTS) up to twice more per soft concept per
ranked-restaurant row, always-on in pooled mode — on top of the tier CASE and
the rswc windows. plans/why-this-matched-report.md carries wire proofs but no
latency row. Almost certainly fine at Austin scale; measure it in the load's
timing logs, and if it shows, fold the token into the tier CASE's single
evaluation instead of a second scan.

### W8 — NOTE — Commit-message garble
50850a637's message says the winning bundle size cost "/bin/zsh.39/1k docs" —
a shell-expanded `$0.39`. History is immutable; the real numbers are banked in
plans/bundle-size-experiment.md ($0.49/$0.62/$0.91 interactive). Know it when
reading history; no action.

---

## DATA PASS (staging SELECT-only)
- **Strike void landed as claimed**: the 08-20 cohort now sits 676 at fc=0,
  31 at fc=1 (= 707 voided; drift from re-attempts). Nobody at fc≥2.
- **A-1 census exact**: 507 sub-floor ungrounded shells excluded — the
  commit's number, reproduced independently from the fragment's own logic.
- **v2 verdicts: none yet** (see W1) — the ledger auto-reopen is correctly
  version-scoped (`decidedVerdicts` at PLACE_GROUNDING_RULE_VERSION), so v1's
  3,904 rejections are all re-hearable.
- **Twin state**: 7 byte-identical active place-name pairs remain (The Alley,
  M Tea, Truth, Super Burrito, Tiger Sugar, Taqueria Jalisco #4/4, Mughlai) —
  the "held for owner" set, verified. Variant twins (Rudys vs Rudy's "Country
  Store", La Bbq, Shake Shack) remain active and mention-splitting by design:
  their heal is chooser v2's first live acceptance → grounding-conflict merge.
  They also PASS the A-1 floor (≥2 mentions), so the split stays user-visible
  until grounding succeeds — one more reason W1's sequencing matters.
- **Fold v2 deferral sound**: 0 active names contain ™/℠ on staging.
- **Widening edges sane** (sampled: tasting-menu→omakase family, sushi→maki);
  staging entity_satisfies versions are ledgered (1/4/5) — no 999 leak.

## TEST HONESTY — 3 live mutations, 3 RED
1. Tripwire: replaced the halt-throw with `return` → 3/4 tests RED. Honest.
2. match-explain: forced `basis: 'evidence'` unconditionally → derived/absent
   hedge cases RED. Honest (the owner's never-promise ruling is pinned).
3. Intake: disabled the fold-known filter → known-piece-no-op test RED. Honest.
All three restored byte-identical; suites green after.

## VERIFIED CLEAN
- Chooser v2: prompt rederivation coherent (snippets-are-samples; the
  out-of-market veto retained for SELECTING out-of-market — the correct
  asymmetry); rule ledger v1/v2 fingerprints resolve; unversioned edit throws
  at import; context repair (3 distinct snippets + mention count) reaches the
  worker path too, not just the sweep.
- Waves 1–2 fixes hold in HEAD: presink NOT-EXISTS live-twin standdown (×4),
  `stated || undefined` reason honesty (llm.service.ts:2175), F2 ledger
  anti-join inside both LIMIT bounds.
- Intake: pinned-exhaustive group map (`satisfies Record<QueryEntityGroupKey,…>`),
  flag default OFF + flip-list row present, budget cap shared per pass, matcher
  extraction is a true one-implementation merge (sweep and intake run the same
  closure), `interpretResidue` still has exactly one caller, the residue table
  + person-data classification rows remain correct (table retained by design).
- A-1 fragment itself: correct table (core_restaurant_events = place
  mentions), index-backed LIMIT-2 existence test, honest in-flight-signal
  refusal note; integration spec fails loudly without a DB rather than
  skipping.
- Polls frame gate: sync roleOf/holdsUnjudged, conservative unheard-links-today
  direction, all-frame-span composition matches search's rule, ingredient in
  the winner order AFTER item, DI wired (EntityResolverModule imported).
- Fold v2: pre-NFKD separator replacement is the only correct ordering (the
  spec's own reasoning), pinned vectors updated WITH the version bump.
- Match-explain: pure, display-only, never read by admission/ordering
  (verified in builder SQL — tokens/evidence column appear only in SELECT);
  anchor-beats-widened CASE order; chip copy encodes the evidence/derived
  ruling including absent-basis-hedges.
- Prompt debts: new C.2 step-4 walks coherently in the model's shoes (peel
  commentary words, never menus-you-remember; OFFERING TEST re-run retained);
  N27 fix states the substance-name law with its one sanctioned trim
  (preparation participle) — consistent with the as-written law.

## FIX-FIRST vs POST-LOAD
**Fix-first (before the Austin load):**
- W1 — worker-lane decline alarm AND/OR load sequencing: tripwired sweep over
  the ungrounded backlog first, measure v2's live acceptance, then arm
  mention-driven retries.
- W4 — purge local v999 satisfies rows + delete the two temp scripts (must
  precede any push-local-db-to-staging), sweep the L5 artifacts.
- W5 — per-row demand-write marking + awaited signal write (cheap, and the
  load is exactly when drain failures will happen).
**With the next commit (cheap):** W2 (third grain + named opt-outs), W3 (two
doc rows + one comment), W6 (analyzer units, or at least a written ruling on
the <=1 threshold).
**Post-load:** W7 (read the timing logs; refactor only if it shows).

## VERDICT
Ship-shaped with sequencing. No wave-1/2 regression found; the new code's
doctrine (one fragment, one intake, one ledger discipline, display-only
explain) is genuinely coherent and 3/3 mutation-honest. The one load-blocking
risk is not a bug but a GAP: the entire grounding-repair thesis rests on a
chooser version that has never judged outside its gold harness, and the alarm
built for its failure mode doesn't cover the lane the load will use.

---

## Fixes applied (2026-08-30, fix-first pass — uncommitted)

**W1 — worker-lane decline alarm + load sequencing. DONE.**
- New `apps/api/src/modules/restaurant-enrichment/worker-lane-decline-alarm.ts`:
  a lane-level alarm reading the DURABLE breadcrumbs (declines =
  `lastEnrichmentAttempt` no_match rows with `failureAt` in the trailing
  120-minute window; successes = `googlePlaces.fetchedAt` in-window — success
  deletes the failure breadcrumb, so both sides are queryable). ≥20 attempts
  and >90% decline → fail-closed hold. Wired into `enrichPlaceById` (the
  mention-driven worker lane): held jobs return `skipped`
  (`worker_lane_decline_alarm_held`) — zero Places spend, zero strike spend —
  and a critical ops alert (`grounding_worker_lane_held`, deduped) fires. The
  verdict being durable means a restarted worker re-trips on its first job
  while the evidence stands; the in-process latch avoids re-querying while
  held. The window read is cached 30s (one aggregate per interval, not per
  job at concurrency 5).
- RED proof (live mutation): neutered the trip condition
  (`declines/attempts > bound` → `false`) → **3/6 tests failed**
  (trip-on-08-20-shape, latch, restart-re-trip); restored byte-identical →
  6/6 green. The spec's headline case replays a 716-job 08-20-shaped run and
  pins the halt at exactly attempt 20 (696 strikes not spent).
- `plans/austin-launch-load.md` step 9 rewritten as SEQUENCED GROUNDING:
  (a) tripwired `enrichMissingPlaces` sweep over the 1,021-entity backlog
  FIRST, (b) observe v2's live acceptance in claim_verdicts, (c) only then
  arm mention-driven retries — the lane alarm is the backstop, not the plan.

**W5 — intake double-demand. DONE (with one honest correction).**
- `unknown-search-intake.service.ts` `processGroup` restructured to per-row
  process-and-mark: each row's demand writes (`writeRowDemand`) and its
  status flip travel together, so a mid-group failure leaves ONLY unwritten
  rows pending — the next drain refetches `status='pending'` alone and never
  re-records rows 1–4's demand. Idempotency is at the write (row leaves
  'pending' in the same iteration its demand lands), not a guard flag. The
  group-level catch (segmentation/matcher failures) now scopes its attempt
  increment and failed-parking to `status: 'pending'` so it can never touch
  a row the loop already marked. Two new specs pin both behaviors (the
  per-row-where assertions are structurally RED against the old whole-group
  `updateMany` shape).
- CORRECTION to the finding's second half: `signals.record()` is a `void`
  fire-and-forget BY THE SIGNALS SERVICE'S OWN LAW — it attaches its own
  `.catch` internally (signals.service.ts:230–250), so "a rejected promise
  is an unhandled rejection" is factually wrong; there is nothing to await.
  A failed ask write is logged loss by fleet-wide design. Documented at the
  call site; no contract change made.

**W2 — A-1 floor composition, per-consumer verdicts. DONE.**
`placeVisibilityFloorSql` is now an exported third grain (fragment header
rewritten). Staging proof the fix is load-bearing: **312 sub-floor place
entities are active + in-market on staging today** — they passed every old
teaser/curated/autocomplete predicate and search refused them all.
- teaser.service.ts (~:305) — COMPOSED. Serving surface; a teaser hands off
  to a search that refuses sub-floor places.
- curated-list-builder.service.ts (~:845) — COMPOSED. Same reasoning.
- autocomplete.service.ts — COMPOSED twice: the corpus-count denominator
  (aligns with the servable corpus, same reason as the L3 F1 market ruling)
  and, more importantly, a new `filterServablePlaceMatches` post-filter on
  the hybrid type-ahead lane (entity-text-search has NO corpus scoping —
  a one-mention mint really did autocomplete). Named opt-outs at the
  injected lanes: favorites (user-owned, user-list ruling) and viewed
  (floored at its own read, below).
- signal-demand-read.service.ts :531/:778 — COMPOSED. These are recall
  SUGGESTION lanes (recently-viewed / viewed-name matches) whose own L3 F1
  comment states the governing rule: never suggest a re-search that serves
  nothing. Rarely binds (a viewed place was visible when viewed) but the
  suggestion lane must agree with the serving lane.
- public-crave-score.service.ts (both lanes) — NAMED OPT-OUT, deliberate:
  scoring is evidence-side, not a serving surface. A sub-floor place must
  already hold a computed score so that crossing the floor (second mention
  or grounding) surfaces it WITH its score; flooring the pool would also
  shift every percentile each time the floor moved.

**W3 — systems-map staleness. DONE.** Row rewritten to
`unknown-search-intake.service.ts` (one-intake shape: segment → fold-known →
flag-gated judge under the shared budget → typed requests + untyped asks);
overlap #1 marked RESOLVED with the merge, old doctrine noted OVERRULED; the
dangling `unsegmented-residue.service.ts:17` citation in
search-query-interpretation.service.ts:815 now points at the intake's
staging-zone doc block.

**W4 — provenance + artifact cleanup. DONE.**
- Local dev DB: `DELETE FROM entity_satisfies WHERE prompt_version = 999`
  → 174 rows gone, census now v1-only (2,120). Ran before any
  push-local-db-to-staging.
- `scripts/why-matched-probe.ts` + `why-matched-rebuild.ts` deleted (both
  self-labeled delete-after-report). Reproducibility survives:
  `apps/api/logs/why-matched/wire-verification.txt` exists (5,962 bytes) and
  plans/why-this-matched-report.md:141 cites it. No other references in the
  tree.
- L5 artifacts deleted (all untracked): shard3-raw.{json,tsv}, shard3.json,
  shard3_fetch_parents.sql, shard3_full.json, shard3_readable.txt,
  dish-knowledge-gold.d4.run{1,2,3}.result.json,
  prompt-ab.d4.cert.run{1,2,3}.result.json.
- The reader version-filter question, answered honestly: NOT fixed, queued.
  The satisfies readers filter by relation only, and a version filter is
  neither cheap nor obviously right — the table has no active-version
  registry (staging's 1/4/5 are all live, ledgered generations; edges retire
  by rewrite, not by version). The real guarantee is that every WRITE is
  ledgered — which held everywhere except the hand-seeded probe, now deleted
  with its rows. If provenance-at-read is wanted, the right shape is an
  active-version registry the readers join, not a hardcoded version list.
  Queued for an owner ruling.

**Not taken here:** W6 (intake whitespace tokenizer — vocabulary-file
territory of a concurrent agent; zero Austin impact, tied to the zh vocab
launch), W7 (post-load timing read), W8 (no action possible).

**Gates:** `yarn build` clean · targeted suites green (restaurant-enrichment
11/11 suites 69 tests; intake 14; autocomplete/teaser/curated/tripwire all
green) · `yarn invariants` 43 invariants / 88 proofs all green · boot smoke
healthy on :3999 (DB + redis checks pass) · prettier/eslint clean on every
touched file. Staging access was SELECT-only. Nothing committed.
