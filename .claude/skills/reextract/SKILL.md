---
name: reextract
description: Coordinate a prompt-iteration re-extraction — shadow replay, diff review triage, activation. Use when the owner asks to re-extract (a city or globally), iterate the collection prompt, or review a shadow diff.
---

# Re-extraction coordinator runbook

You (the agent) run the whole choreography; the owner speaks one sentence
("re-extract Austin with the new prompt") and makes exactly two kinds of
calls: approving the spend manifest, and deciding OWNER-DECISION review
items. Design doc: plans/reextract-choreography.md. Entry point:
`./scripts/rig/reextract.sh <verb>`.

## Invariants (never violate)

- **Collection never pauses for prompt iteration.** Live lanes extract under
  the ACTIVE prompt version while the candidate runs SHADOW replays
  (activate:false). This is now TRUE rather than aspirational: the merge
  sweeps filter to active-supported vocabulary, so crons stay ON.
- **No spend without an approved campaign.** The runner and batch submit
  refuse without `isDispatchable`. Never work around it.
- **Never activate a candidate prompt without a closed diff review.**
  Activation under an unreviewed prompt is the July 2026 self-heal accident.
- **wipe-city-derived.sql is the disaster tool only** — the normal flow
  never wipes; activation supersedes and GC cleans up.
- Place-grounded restaurants and user-anchored entities are never deleted
  (preserved-anchors.sql is the single definition).

## The flow

1. **push** — `./scripts/rig/reextract.sh push <prompt.md> --notes "..."`
   registers the candidate; note the version number.
2. **estimate** — `estimate <communities> <version>` prints doc counts and
   the campaign manifest (built on `prepareManifestEstimate`, the onboarding
   manifest machinery). The **Places line is a measured forecast**: the
   mint count of the newest prior shadow of the SAME community set (the
   script prints `PLACES forecast: MEASURED — v<N> ... minted <M> places`)
   at the published `google_places.enrichment` rate. With no comparable
   prior shadow it prints `PLACES forecast: UNKNOWN` and prices the line at
   zero mints — tell the owner that line is uncovered except by the
   tolerance. Render the manifest to the owner (a small table or
   visual: per-line $, tolerance, envelope, hash), wait for their explicit
   approval, then re-run with `--approve-estimate <hash>` (it approves the
   existing awaiting_approval row, never mints a twin).
3. **shadow** — `shadow <communities> <version> <campaignId>` arms the
   worker env (REEXTRACT\_\* with ACTIVATE=false). Staging by default
   (REEXTRACT_ENV=production for prod data). Before arming, verify
   quiescence: no in-flight collection jobs or non-terminal llm_batch_jobs
   for those communities. Watch worker logs; wait for the batch queue AND
   the `restaurant-primary-enrichment` queue to drain fully.
   **The shadow is the full pipeline (2026-09-04):** rehearsal mints are
   Places-grounded inside the shadow, metered into the campaign, and a
   mint whose Google place is already owned by a live restaurant merges
   into it through the ledgered place-merge door (that is how the diff
   shows the TRUE twin count — v23 reported 48 anchored places "lost"
   only because its 1,375 rehearsal mints were never grounded). The
   shadow no longer sets `DISABLE_RESTAURANT_ENRICHMENT`; that flag is an
   operator kill-switch on new scheduling only.
4. **diff** — `diff <communities> <version>` writes the review file. Triage:
   - **AUTO** (act yourself, no ping): NOTHING to merge by hand — owner
     ruling 2026-08-10. Shadow-minted name-variant twins (Mcdonalds vs
     McDonald's class) are the designed job of (a) the deterministic
     identity-key tiers at resolution (f1e1770d4), (b) the place-id
     collision merge when post-activation enrichment grounds them, and
     (c) the nightly convergence sweep. Manual merges duplicate the
     machine's work and don't scale; COUNT the twins in the review file
     and verify they drain after activation+enrichment instead.
     Unanchored lost-support rows → nothing to do (GC will take them).
   - **AGENT-REVIEW** (judge, then act or escalate): SEMANTIC TWIN
     candidates (embedding distance) — obvious rename ("wings" vs "chicken
     wings" class) → merge into the anchor; genuinely different concept →
     leave both, note it. Renamed anchored restaurants (Places display-name
     swaps) → verify, note.
   - **OWNER-DECISION** (never decide alone): ANCHORED lost-support rows —
     a user's saved thing that the new prompt no longer extracts. Present
     the list with counts and your recommendation; wait.
5. **activate** — only after the review is closed:
   `activate <communities> <version>` → dry-run, then
   `--reviewed --execute` (the script REFUSES `--execute` alone — the
   `--reviewed` flag is your attestation that step 4 closed) (pointer
   flip + full-ledger projection rebuild), then GC dry-run → execute, then
   anchor-audit must come back clean, then `prompt-activate.ts <version>`
   - redeploy workers so LIVE collection extracts under the new prompt,
     then `./scripts/rig/cost-reconcile.sh`.
   - **close the spend campaign**: `scripts/complete-campaign.ts
--campaign-id <uuid>` once the shadow queue is drained — whether the
     candidate activates OR is rejected. A finished replay parked in
     'running' is a still-open spend envelope with no work behind it, and
     the drift feedback (declared vs actual) only records on completion
     (found 2026-08-11: the v7 replay sat 'running' at $30.44 after its
     verdict).
6. **Global / rolling**: same flow with more communities; activate region
   by region as each community's shadow drains — activation is
   per-document, rolling is native. Disarm the REEXTRACT\_\* env vars when
   done.

## Hard invariants proven by the final red team (2026-08-01)

- ~~Activation is one-way~~ — **DELETED 2026-08-01**: cross-generation
  activation now RETAINS the superseded events (readers filter on the
  active run, so they are inert), and `rollback <communities> <version>` is
  a pointer flip back plus a projection rebuild. It is a round trip for
  every document whose activation recorded `replayOfExtractionRunId`; the
  script REPORTS any unrollable documents (no recorded predecessor — e.g.
  docs first extracted under the new version) instead of guessing. The old
  generation's space is reclaimed only when you explicitly `discard` it;
  do that only once you are confident, because discard is what makes
  rollback impossible. KNOWN GAP (round six #7): after a CITY-SCOPED
  activation, `discard` of the superseded version refuses while that
  version is still active elsewhere — correct behavior, but it means
  reclamation for partially superseded generations waits until the version
  is inactive EVERYWHERE. There is no per-community reclamation; don't
  fight the refusal.
- **`activate` refuses a non-candidate version and a shadow below 99%
  coverage.** Both refusals are correct; do not `--allow-partial` without
  the owner, and never work around the candidate check.
- ~~CRONS_ENABLED must stay false for the shadow window~~ — **DELETED
  2026-08-01**: the dedupe sweeps now only consider vocabulary with ACTIVE
  support (`core_restaurant_items` membership), so shadow-minted entities
  are invisible to them by construction. Measured on the corpus: 5,232 of
  5,815 active foods are supported — the 583 unsupported ones are exactly
  what the sweep must not touch. Crons may stay ON during a shadow, which
  restores the design's actual promise: **collection never pauses.**
- ~~The envelope only meters the batch line (~7%)~~ — **DELETED
  2026-08-01**: spend attribution is now AMBIENT
  (`shared/work-context.ts`). The runner and the batch-ingest tree run
  inside a campaign context and the usage ledger reads it, so resolution,
  embeddings and attribute calls meter automatically. The envelope now
  guards what it was sized for, and a breach actually stops the work.
- **Every verb targets `REEXTRACT_DB`** — including push/estimate/activate,
  which boot AppModule. Unset, they hit the LOCAL dev database and the prod
  worker will never find the candidate or campaign.
- ~~After disarming, run `apps/api/scripts/enrich-restaurants.ts`~~ —
  **DELETED 2026-09-04**: the shadow no longer sets
  `DISABLE_RESTAURANT_ENRICHMENT`, so live collection AND the shadow's own
  mints ground as they are mentioned. Run the operator sweep only if you
  set the kill-switch by hand for some other reason. Note the sweep honors
  the same grounding decline hold the worker does (one hold, at
  `enrichPlace`); a halted sweep means the judge is broken, not that the
  backlog is done.

## Gotchas learned the hard way

- Railway var changes trigger their own redeploys that race `railway up`;
  after arming env vars, prefer `railway redeploy` or a clean-worktree up.
- The worker one-shot runner fires at BOOT; disarm (delete REEXTRACT\_\*)
  after completion or every redeploy re-runs it (coverage dedupe makes that
  a no-op cost-wise, but logs get noisy).
- `railway up` ships the WORKING TREE — deploy from a clean worktree of
  HEAD when other sessions have the tree dirty.
- Report costs from the ledger AND run cost-reconcile; any one-off estimate
  AND any report of a shadow's cost must include BOTH Gemini and Places
  lines — a shadow's Places line is real now (rehearsal mints are grounded
  inside it); only already-grounded restaurants are never re-bought.
- The SQL verbs (diff, gc, status) run against LOCAL Postgres by default —
  set `REEXTRACT_DB` to the target DB (the READ-ONLY credential in
  `~/.crave-prod-readonly.env` for prod diff/status; superuser only for the
  GC execute, deliberately).
- Editing `prompts/collection-prompt.md` and deploying DOES NOTHING once
  the registry is seeded — the registry's ACTIVE row rules. Prompt changes
  go through push → shadow → activate, always.
- Re-arming the runner mid-flight can re-pay for stored-input replays (the
  pre-LLM coverage gate is strongest on the posts path) — before re-arming,
  check `llm_batch_jobs` for non-terminal jobs and let them drain.
