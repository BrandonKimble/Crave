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
2. **estimate** — `estimate <communities|all-actives>` prints doc counts;
   create the campaign with `SpendCampaignService.prepareManifestEstimate`
   (the onboarding manifest machinery), render the manifest to the owner
   (a small table or visual: per-line $, tolerance, envelope, hash), and
   wait for their explicit approval; approve by hash.
3. **shadow** — `shadow <communities> <version> <campaignId>` arms the
   worker env (REEXTRACT\_\* with ACTIVATE=false). Staging by default
   (REEXTRACT_ENV=production for prod data). Before arming, verify
   quiescence: no in-flight collection jobs or non-terminal llm_batch_jobs
   for those communities. Watch worker logs; wait for the batch queue to
   drain fully.
4. **diff** — `diff <communities> <version>` writes the review file. Triage:
   - **AUTO** (act yourself, no ping): exact/alias/plural twins from the
     lexical TWIN section → merge the new entity INTO the anchor via the
     dedupe/merge services (rehome runs automatically). Unanchored
     lost-support rows → nothing to do (GC will take them).
   - **AGENT-REVIEW** (judge, then act or escalate): SEMANTIC TWIN
     candidates (embedding distance) — obvious rename ("wings" vs "chicken
     wings" class) → merge into the anchor; genuinely different concept →
     leave both, note it. Renamed anchored restaurants (Places display-name
     swaps) → verify, note.
   - **OWNER-DECISION** (never decide alone): ANCHORED lost-support rows —
     a user's saved thing that the new prompt no longer extracts. Present
     the list with counts and your recommendation; wait.
5. **activate** — only after the review is closed:
   `activate <communities> <version>` → dry-run, then `--execute` (pointer
   flip + full-ledger projection rebuild), then GC dry-run → execute, then
   anchor-audit must come back clean, then `prompt-activate.ts <version>`
   - redeploy workers so LIVE collection extracts under the new prompt,
     then `./scripts/rig/cost-reconcile.sh`.
6. **Global / rolling**: same flow with more communities; activate region
   by region as each community's shadow drains — activation is
   per-document, rolling is native. Disarm the REEXTRACT\_\* env vars when
   done.

## Hard invariants proven by the final red team (2026-08-01)

- **Activation is ONE-WAY.** The pointer flip deletes the superseded runs'
  events and compaction reaps the emptied runs within the hour. There is no
  rollback after `--execute` — only re-paying a full extraction. Treat the
  diff review as the last exit.
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
- **After disarming, run `scripts/enrich-restaurants.ts`.** The shadow sets
  `DISABLE_RESTAURANT_ENRICHMENT` service-wide, so restaurants minted by
  LIVE collection during the window never got Places grounding, and the
  backfill has no cron.

## Gotchas learned the hard way

- Railway var changes trigger their own redeploys that race `railway up`;
  after arming env vars, prefer `railway redeploy` or a clean-worktree up.
- The worker one-shot runner fires at BOOT; disarm (delete REEXTRACT\_\*)
  after completion or every redeploy re-runs it (coverage dedupe makes that
  a no-op cost-wise, but logs get noisy).
- `railway up` ships the WORKING TREE — deploy from a clean worktree of
  HEAD when other sessions have the tree dirty.
- Report costs from the ledger AND run cost-reconcile; any one-off estimate
  must include BOTH Gemini and Places lines (a re-extract's Places line is
  legitimately $0 — restaurants are already grounded).
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
