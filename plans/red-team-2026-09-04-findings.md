# Holistic red team 2026-09-04 — findings ledger

Scope: plans/red-team-2026-09-04-scope.md. Rule: an item is FINDING only
after I re-verified the agent's claim personally (code read + executed
probe); everything else stays LEAD. Probes against staging are read-only.

## Wave 0 — CI (DONE, commit 8a6dbb200)

CI red since 2026-08-09 at the doc-claims step (7 unqualified script
paths); nothing after it ran for 25 days. Paths fixed; `deploy.sh` now
refuses STAGING on a red main lineage (one `ci_gate`, proven RED against
the live state before the fix). Local: tsc clean, 2,494 unit tests green.

## Territory 1 — content-processing (agent read + my verification)

| # | Verdict | Claim | My proof |
|---|---|---|---|
| T1-1 | FINDING (latent, 0 rows today) | Tier-3 reject-tombstone pre-sink selects EVERY archived entity with no redirect and no live twin, with no `born_extraction_run_id IS NULL` predicate — so an entity minted by a REJECTED shadow (status archived, born run set) becomes a permanent sink for live mentions of that name. | Read `entity-resolution.service.ts:1642-1673` (first UNION arm keys on identity_key, no born predicate); flip path at `rehearsal-generation.service.ts:74-86` names the distinction the sink ignores. Staging probe: 23 archived-with-born rows, 0 currently sink-eligible (all redirected or twinned). Real class, empty today. |
| T1-2 | **FINDING (live data)** | Banked-refusal recovery mints a NEW run R (`replay.service.ts:456-483`, `replayOfExtractionRunId = S`); `documentsOwnedByRun` requires `d.active_extraction_run_id = replayOf` (`extraction-scope.service.ts:48-69`) so at activation R owns 0 docs; its events are keyed to R and never become active. | Staging: **75 recovery runs, 2,122 events, 0 whose document is active on that run; 7 rehearsal mints born to recovery runs.** Recovered evidence is dark and the shadow diff still counts it. |
| T1-3 | LEAD (needs a spec) | `recoverBankedRefusals` not idempotent across a failed recovery run — refusals are banked before the failure-rate law, so the next pass re-admits the failed run's copies. | Code path plausible; not executed. |
| T1-4 | FINDING (mechanism) / LEAD (consequence) | Merge-fold `judged` aliases route only at the CURRENT rule version (`identityGradeSql`), a merge is irreversible and its pair unhearable, so a dedupe rule bump silently un-routes every merged-away name; nothing re-arms them. | `entity-surface.service.ts:150-185` confirmed. Staging: merge_fold rows exist only under place_merge v1 (current) — no dedupe-lane folds to demonstrate on. Ideal shape stands: the resolver should honour `entity_redirects` directly; a merge is the durable fact. |
| T1-5 | FINDING | `scripts/replay-banked-refusals.ts` and `scripts/replay-extraction-run.ts` call the replay service with NO ambient campaign; judge/embedding spend inside rehearsal resolution is unattributed and never breaches the envelope. | Grep: only `city-reextract.runner.ts` wraps in `runInWorkContext`. Ideal: `ReplayService` establishes the context itself. |
| T1-6 | FINDING (minor) | Verdict replay bills production caller tags but writes no `claim_verdicts` rows, so `microUsdPerHearing` (spend ÷ hearings) inflates after every replay and the drain estimate hash moves. | `claim-rehearing-budget.service.ts:272-287`; grep: zero ledger writes in verdict-replay/*. |
| T1-7..14 | LEAD | quarantined-chunk partial persistence; collision guard keyed by source not grade; dish-knowledge side door out of rehearsal; stored merge plans vs moved corpus; satisfies edges vs verdict keys on merge (46 rows with a non-active side locally); rehearsal:true hardcoded post-activation; three documented `catch {}` sites; dead/minor. | Docketed for the fix wave; each gets a probe before a fix. |

Clean bills (agent, sampled by me): place-name-contract, extraction-scope,
claim-verdict-ledger, widening/concept-satisfies, metro-adoption,
restaurant-entity-merge, usage-ledger/work-context, gemini-batch seams,
iteration-bench, vocabulary-maintenance, entity-match-lane.

Fix sequencing for T1: T1-2 first (live dark evidence; design change —
recovery appends to the shadow run's evidence, one active run per doc),
then T1-5 (one-line class fix), T1-1 (reject fact instead of overloaded
`archived`), T1-6 (replay attribution tag), T1-4 (redirect-honouring
resolver). Each with the spec/probe that would have caught it.

## Wave 0b — CI, the second gate (DONE, commit bd58ac688)

The first green-path run died: no PROCESS_ROLE in CI → worker runtime →
collection reconciler boot-arms inside a spec whose logger stub lacked
`.error` → the timer's `void run()` let the rejection kill jest. Locally
`.env` pins PROCESS_ROLE=api, so timers never arm and the suite read green
(an environment-dependent test). Timer now owns every tick failure through
a required `onFailure`; seven callers route to their logger; proof added.

## Territory 1b — identity seams (sub-read; agent executed rolled-back proofs; verified by me)

| # | Verdict | Claim | My proof |
|---|---|---|---|
| ID-1 | **FINDING** | `foldSurfacesFromMerge` stmt 1 writes the loser's name at `judged`; stmt 2 carries the loser's own rows — its own name at `observed` (every extraction-born entity banks its own spellings observed) — and GRADE-ONLY-RISES lifts the row to observed with `origin_lane NULL`. Every merge alias becomes permanent identity on the winner; a wrong merge can never be un-routed by a rule bump. | Read `entity-surface.service.ts:992-1102`: same (entity_id, locale, form) key, observed > judged in `gradeRankSql`. The doc at :1104 even says "merge-fold carries OBSERVED surfaces". Ideal: a carried row's grade is capped at the MERGE's grade (its association to the winner is the merge's inference, not testimony). |
| ID-2 | **FINDING** | `WordClaimAdjudicatorService.refuse()` writes `status:'deprecated'` through `addSurfaces` with default role recall; on an existing active display row the role expr yields `'both'` and status stays active — the refusal GRANTS the word. | Read `word-claim-adjudicator.service.ts:1121-1133` + `entity-surface.service.ts:536-540, 849-878`. Ideal: refusal is an absolute state write (reuse `takeTheWord`). |
| ID-3 | **FINDING (corpus-visible)** | Ontology-plan merges fold WITHOUT a merge verdict (recall grade), archive the loser, write no redirect, no ledger row; since the grade law a mention of a merged-away attribute name is sunk/dropped, not routed. | Read `attribute-ontology.service.ts:795-812`. Local: 36 item_attribute + 78 place_attribute archived with no redirect. Ideal: one merge door — ontology merges execute through `AttributeDedupeMergeService.executeMergePlan`. |
| ID-4/5 | LEAD (agent-executed) | Metro gate re-resolve adopts REHEARSAL restaurants (`status <> 'archived'` only); its uniqueness probe groups by `lower(name)` not `identity_key` (4 live fold-twin pairs each read unique). | Not re-run by me; docketed with the fix. |
| ID-6..11 | LEAD | pre-sink arm 2 sinks on deprecated rows; food-dedupe lane no budget chokepoint; stale origin on equal-grade carry; lying matchedVia after gate re-point; rehome drops loser note; stale doc at :1104. | Docketed. |

## Territory 2 — LLM gateway / batch rail / governance (verified)

| # | Verdict | Claim | My proof |
|---|---|---|---|
| G-1 | **FINDING** | `isTransientFailure` falls back to a regex over prose (`\b50[0-4]\b`, `\b429\b`, `network`) so deterministic ingest errors ("chunk 503 has no source_map entry") cycle forever with no attempt spent, and `checkForStalledJobs` keys on `updatedAt`, which every cycle refreshes — the stall alarm cannot see the loop. | Read `gemini-batch.service.ts:110-132, 1171-1190, 884-918`. Ideal: stall measured from the owing timestamp; typed classification only; governance hold is its own status. |
| G-3 | **FINDING** | A `completed` campaign is not dispatchable, so a straggler batch job's PAID output hits `CampaignStateError` (not transient) → 3 attempts → job failed, output discarded; `complete-campaign.ts` has no open-job guard. | Read `spend-campaign.service.ts:833-859` (its own comment contradicts the code). Ideal: dispatchability distinguishes start-new from finish-paid, or `complete()` refuses with open jobs. |
| G-4 | **FINDING** | Active prompt rows are served with their STORED hash and never re-fingerprinted; stored hashes are content-only, so a schema edit ships with coverage still "covered". | Local probe: active rows' `content_hash` == sha256(content) exactly; `promptFingerprint` folds the schema. Ideal: boot asserts fingerprint(active) == stored, fail-closed. |
| G-2 | FINDING (agent-computed on local rows) | `resumeAfterBreach` re-quotes a MANIFEST campaign as extraction-only and the script hashes with a different tolerance → resume always throws StaleEstimateHash, or re-breaches instantly. | Arithmetic reproduced by agent from local rows; not re-run by me. Fix with a single `quoteResume()` used by prepare/resume/script. |
| G-5 | FINDING (agent-executed) | `searchHarness.launchGateGrader` is an unprofiled, uncontracted caller invisible to the lockdown scan (case-sensitive regex). | Ideal: caller tag is a TYPE; delete the regex scanner. |
| G-6 | FINDING | ops-alert dedupe keys are permanent (unique on dedupe_key; ack never clears) — a second collapse of the same table emits nothing. | Read by agent; local ops_alerts holds 4 collapse rows. Ideal: uniqueness scoped to OPEN alerts. |
| G-7 | FINDING | Campaign quotes read `spend_unit_costs` with no freshness check; refresher is still an `@Cron` (dead on staging). | Ideal: typed refusal on stale rate; refresher on the completion-work timer. |
| G-8..12 | LEAD | warn-mode census silent under NODE_ENV=production (staging too); Tier-3 backstop off for scripts (owner-ruled D149); adoption scan 200-job window; retired-version re-activation on empty registry. | Docketed. |

## Territory 4 — search → app (agent ran two RED scratch specs)

| # | Verdict | Claim | My proof |
|---|---|---|---|
| S-1/S-3/S-6 | **FINDING (user-visible)** | The app's "Include similar" flip derives the ON world locally from `exactMatch===false` rows and dead `similarDishes/similarPlaces` arrays the API no longer emits; the pooled gate now marks tier-1 PARTIAL rows `exactMatch=false`. Result: the "N similar" chip does nothing, and flipping OFF hides rows the server served. With includeSimilar ON, dense siblings carry no tier at all and render unlabeled. | Agent's scratch spec RED; to re-run before the fix. Ideal: `includeSimilar` is identity on the server (the flip re-fetches; it already keys a different world); tier is a row property from `ItemGrounding`, not a side effect of whether a gate CTE compiled; delete the dead wire fields on all three sides. |
| S-2 | **FINDING (user-visible)** | "May have X in it" chip stamped on dishes that never rode the containment arm (satisfies/category members, dense siblings). | Agent's scratch spec RED. Ideal: the dish CTE selects `admitted_via_containment`; `contains` derives only from it. |
| S-4 | FINDING | The 8-word soft cap turns the 9th attribute word into a HARD wall and drops the 9th cuisine word entirely; the comment claims otherwise; no spec pins ≥9. | Read by agent (`search.service.ts:1648-1764`). Ideal: cap before partition; membership = all − soft − walls. |
| S-5 | FINDING | Territory-scoping "fail open by policy" alarm is unreachable (coverage never throws). | Ideal: one degrade contract (`degraded:true`), delete the dead catch. |
| S-7..11 | LEAD | structured `/search/run` + see-locations never resolve redirects / no servable check; attribute merge leaves signals tally on the loser until rebuild; intake budget counts retrievals not judge calls; per-search hearing shares the nightly allowance (denial-of-hearing); client "Similar match" fallback contradicts server silence. | Docketed. |

Spend doors on the user path: none found ungated (embedding cached, hearings budgeted, intake cron-batched).

## Wave 0c — CI, the third gate (commit 51c2fefaa)

The unit lane went green in CI; the DB-integration lane then failed five
janitor-policy tests: the shared user-anchor predicate cast the entity id
to `::text` against two UUID signal columns (`operator does not exist:
uuid = text`). Every consumer of the predicate — the janitor's
ungroundable gate first — has thrown since it was shared (2026-08-31);
the weekly lifecycle pass caught it and only logged "failed", so
closed-place archival and moved-place re-enrichment have not run. Casts
dropped; spec RED→GREEN. FOLLOW-UP (docketed): that catch must emit an
ops alert, not a log line (silence class).

## Fixes landed this wave (identity territory)

- ID-1 41e3dbbbd — carried merge-fold rows capped at the merge's grade.
- ID-2, ID-3 576dd87a0 — refusal is an absolute write; ontology merges
  through the one ledgered merge door.

## Territory 3 — restaurant-enrichment (agent read; verified by me)

| # | Verdict | Claim | My proof |
|---|---|---|---|
| E-1 | **FINDING — FIXED** | `wipe-city-derived.sql`'s orphan sweep was corpus-wide: a community matching nothing → 746 deletes. | Re-ran the dry run myself before/after: 746 → 0. |
| E-2 | **FINDING — FIXED (spec owed)** | Court ceiling charged before the ledger lookup; remembered pairs starve new ones forever. | Read `:944-972`; memory now consulted first. No sweep harness exists — spec docketed. |
| E-5 | **FINDING — FIXED** | Janitor closed arm archived user-anchored places. | Read `:153-172`; guard added; spec RED→GREEN. |
| E-3 | FINDING (agent-read; docket) | Moved-arm is a weekly Places spend loop (re-grounded moved row never cleared, enrichment mints a second row). | Staging today: 0 moved rows, so no live spend; structural. Ideal: Google's redirect is Google's verdict — one lean details call, rewrite in place. OWNER: worth its own pass. |
| E-4 | FINDING (agent-read; docket) | Resurrection loop: active entity whose chooser picks a place owned by an archived, un-redirected entity re-buys autocomplete+details on every mention, no strike, no alarm. | Staging: 230 archived places without redirects (0 currently hold place ids). Ideal: revive-and-merge as a ledgered place_merge. |
| E-6 | FINDING (agent-read; docket) | Batch sweep ignores the worker-lane hold; tripwire can't arm under 20 attempts. | Ideal: one hold at the `enrichPlace` chokepoint. |
| E-7 | FINDING (agent-read; docket) | Enrichment-time domain merge and the sweep answer "is this domain owned?" with two predicates (status filter differs). | Ideal: one `ownedDomainCluster`. |
| E-8/E-9 | FINDING — dead code | `handleEntityNameConflict` unreachable (no name/type unique); `mergeLocations` shared-place branch unreachable (global unique). | Delete in the cleanup pass. |
| E-10..12 | LEAD | cross-metro merge via "no community evidence"; 259 multi-primary rows; 17 stranded redirects on staging with no alarm. | Docketed. |

Places (TomTom) module: one LEAD (promotion attempts uncapped/unread).

## Fixes landed (continued)

- T1-2/T1-5 b065247de — recovery evidence folded onto its shadow; service
  owns campaign context. STAGING BACKFILL EXECUTED: 75 runs / 2,450 events
  folded, 0 stranded (all shadows superseded → no rebuilds needed).
- E-1/E-2/E-5 5dd5b7f60 — wipe blast-radius scoping (746→0 in the
  no-match dry run); court memory before ceiling (spec owed); janitor
  closed-arm anchor guard.
- G-1/G-3 1a9aa5eee — stall alarm keyed on owed-since; transient regex
  narrowed; complete() refuses with open batch work; one non-terminal
  status list.
- S-4/S-5 (search) + G-4 (registry fingerprint) — landed; S-4 spec owed.
- NOTE 2026-09-04 03:36: a SECOND Claude session ran `yarn invariants`
  in this tree while this session's jest ran (the harness mutates source:
  entity-match-prompt.md, entity-match.contract.ts, a probe file). The
  CLAUDE.md law "never run invariants concurrently with jest" now needs a
  cross-SESSION guard, not just a same-session one — docketed as a
  finding against the harness (it should take a repo-level lock file and
  refuse when another runner holds it).
- T1-1/T1-6 1131ad2bb; E-8/E-9 + janitor scream e9117e171; G-6 7366a5fb6
  (partial unique on open alerts; migration applied locally).
- HOTFIX 5731b7aaa: my governance commit used a directory-wide `git add`
  and swept in another session's uncommitted entity-match-prompt.md edit;
  its fingerprint was unreleased so entity-dedupe-rule threw at import
  and the API could not boot on main for ~40 minutes. LAW for this
  campaign: `git add` explicit paths only; never a directory while
  another session may be dirtying the tree.

## Remaining queue (as of 2026-09-04 04:10)
FIX: S-1/S-2/S-3 app "include similar" seam (user-visible; mobile+API);
G-2 resume quote; G-5 caller-tag type; G-7 rate freshness; E-2 + S-4
specs owed; invariants harness cross-session lock. OWNER BATCH: E-3
moved-arm spend loop, E-4 resurrection loop, E-6 sweep ignores hold,
E-7 two domain-ownership predicates; mobile docket (Wave 3). Wave 2
docket drain + Wave 4 coverage census not started.
