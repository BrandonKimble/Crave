# HANDOFF: Austin re-extraction under the new prompt (shadow flow)

For the session iterating the collection prompt. You will run the FIRST
real exercise of the shadow re-extraction machinery (built + prod-verified
2026-08-01; commits `0de7311e..dfe9bd15`). Read
`.claude/skills/reextract/SKILL.md` (the runbook — invoke the `/reextract`
skill) and `plans/reextract-choreography.md` (design + red team) before
starting. This file adds the Austin-specific context and the first-run
verification duties.

## Why the flow looks like this (30 seconds)

- **Collection never pauses.** Prompts are versioned rows in `llm_prompts`
  (one ACTIVE per kind). Live lanes keep extracting under the active
  version; your candidate runs SHADOW replays (`activate:false`) whose
  events sit in the ledger without touching what the app serves. This
  exists because the old implicit prompt-hash coverage voided the world on
  any prompt change (the July $100–200 ungoverned self-heal).
- **Activation is a pointer flip, not a rebuild** — per-document
  `active_extraction_run_id`, reversible, zero LLM re-spend.
- **Nothing user-anchored can die.** preserved-anchors.sql + Restrict FKs;
  the wipe script is a disaster tool you should NOT need.

## Current state you inherit

- Prod: current code, healthy. `CRONS_ENABLED` / `COLLECTION_SCHEDULER_ENABLED`
  are currently false because the corpus is parked pending the prompt work —
  turn them back ON before/during the shadow; the flow does NOT require them
  off (see the skill's invariants). Registry: collection v1 active
  (hash cf421fe7…), v2–v6 = historical prompts, retired.
- Prod GitHub auto-deploy is DISABLED for api+worker (watch patterns that
  never match) — deploy prod with `./scripts/rig/deploy.sh` only.
- No `REEXTRACT_*` vars armed anywhere. Spend campaigns: one stale
  `archive:foodnyc` awaiting_approval (ignore or clean).
- Austin communities: `austinfood` (+ `region-us-tx-austin` has a handful
  of docs — check `collection_source_documents.community` and include what
  you intend). ~70k docs corpus; last full re-extract finished 07-31 07:04.

## Free rider for the prompt revision (charter §3c)

While you are editing the prompt anyway: §3c (full-reload-charter.md,
"ASSERTED vs INFERRED CATEGORIES", deferred at 0.38% score mass) wants
extraction to MARK the category the commenter actually NAMED, so inferred
taxonomy ancestors never score alone. Its cost was "a new prompt
obligation right before a spend" — that objection vanishes when a prompt
revision + full re-extract is happening regardless. Owner call whether to
fold it in; if yes, it needs a field in the output schema + one line in
the scoring shadow rule, and the audit harness should check it.

## The sequence (agent-operated; owner approves twice)

```bash
# 0. prompt file finalized → register it
./scripts/rig/reextract.sh push <your-prompt.md> --notes "austin re-extract <date>"
#    → prints candidate version N

# 1. campaign (owner approval #1: show them the manifest, then approve)
./scripts/rig/reextract.sh estimate austinfood N
./scripts/rig/reextract.sh estimate austinfood N --approve-estimate <hash>

# 2. shadow replay ON PROD DATA (this is a prod-worker one-shot at boot)
REEXTRACT_ENV=production ./scripts/rig/reextract.sh shadow austinfood N <campaignId>
#    wait for llm_batch_jobs to fully drain (poller ingests over hours)

# 3. diff + review file (point at prod via the read-only credential)
REEXTRACT_DB=$(grep -o 'postgresql://.*' ~/.crave-prod-readonly.env | sed 's/PROD_RO_DATABASE_URL=//') \
  ./scripts/rig/reextract.sh diff austinfood N
#    triage per the skill: AUTO / AGENT-REVIEW / OWNER-DECISION (approval #2)

# 4. activate (dry-run first; needs write access — run via prod worker env
#    or superuser, NOT the read-only role)
./scripts/rig/reextract.sh activate austinfood N            # dry run
./scripts/rig/reextract.sh activate austinfood N --execute
#    then: gc-unsupported-entities.sql (dry → execute), anchor-audit clean,
#    prompt-activate.ts N, redeploy prod (deploy.sh), cost-reconcile.sh

# 5. DISARM every REEXTRACT_* var + DISABLE_RESTAURANT_ENRICHMENT, then run
#    scripts/enrich-restaurants.ts to ground restaurants live collection
#    minted during the window.
#    NOTE: crons and collection stay ON throughout — the merge sweeps now
#    filter to active-supported vocabulary, so a shadow no longer needs the
#    kill-switch. (Superseded the old "re-enable at the end" step, which
#    contradicted the skill and would have left collection dead for the
#    whole review window.)
```

## FIRST-RUN verification duties (you are calibrating the machinery)

1. **Shadow isolation**: while the shadow runs, spot-check the app/search
   for Austin — NOTHING should change. Any user-visible drift during
   shadow = stop and investigate (activation leak).
2. **Coverage/hash join**: after the first batches land, verify
   `collection_extraction_runs.system_prompt_hash` for shadow runs equals
   `llm_prompts.content_hash` for version N (the diff/activate scripts
   join on this — if 0 rows match, stop).
3. **Spend meters the campaign**: `spend_campaigns.spent_micros` climbing
   during the run; a breach STOPS submissions (that's correct behavior,
   resume via resume-campaign.ts after review).
4. **Semantic-twin threshold**: the audit's 0.25 cosine cutoff is a GUESS.
   Record how many candidates it surfaces and the false-positive feel;
   tune the constant in `anchor-audit.sql` from what you see.
5. **Review volume**: if OWNER-DECISION items (anchored lost-support)
   exceed a few dozen, stop and design batch tooling before proceeding —
   don't grind the owner through hundreds of prompts.
6. **Post-activation integrity**: anchor-audit must be CLEAN (no twins, no
   unexplained starved anchors); polls/lists counts unchanged (17,931
   polls / 201 list items as of 08-01); zero C4 coverage-gap facts after
   collection resumes; `cost-reconcile.sh` within tolerance of the
   campaign envelope (BOTH Gemini and Places lines — Places should be ~$0).
7. **Known first-run rough edges** (from the build red team): the runner
   re-fires on every worker boot while armed (coverage dedupe should make
   re-runs ~free on the POSTS path, weaker on stored-inputs — check
   llm_batch_jobs before any re-arm); Railway var-sets trigger their own
   redeploys that race `railway up`; deploy from a clean worktree if your
   tree is dirty.

## If something goes wrong

**If activation was INTERRUPTED** (crash, SIGTERM, laptop sleep): the pointer
flips that committed are durable, the rebuild may not have run. Do NOT
`rollback` and do NOT re-run blindly — first re-run
`activate ... --reviewed --execute`: it now resolves the whole plan BEFORE
mutating, saves it to `~/.crave-activation-plan-v<N>-<communities>.json`, and
rebuilds the ENTIRE planned restaurant set every time, so a resume is
idempotent and self-healing. Verify the printed plan counts match the first
run's before continuing.

Activation is reversible (owner decision 2026-08-01): the superseded
generation's events are RETAINED, so `reextract.sh rollback <communities>
<version>` flips every document back to its pre-activation run and rebuilds
projections — an exact round trip. The ONE step that forecloses rollback is
`discard` of the old version; run it only after you are confident in the
new generation. Before `--execute` you can abandon freely
(`reextract.sh discard <candidate-version>`).
Never reach for `wipe-city-derived.sql` unless the ledger itself is
corrupt. Place-grounded restaurants are never deleted under any path —
that's the $118 law. Ask the owner before any step that spends or deletes.
