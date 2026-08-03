# Re-extraction: ideal shape, red team, and the coordinator

Owner intent (2026-08-01): re-extraction is a recurring, agent-operated
workflow. The owner says "re-extract with this prompt"; the agent coordinates
everything — pause/resume (if needed), spend estimate + approval, execution,
delta safety, and a review queue for conflicts. Design FOR the agent as
operator. This doc supersedes the earlier draft; it folds in the deep-read
of the wipe mechanics, the user-ownership model, and the onboarding pattern
(3 subagent reports, 2026-08-01).

## 1. How today's re-extraction protects users (plain-English)

Two independent survival rules, both in `preserved-anchors.sql` (shared by
wipe + audit so they can't drift):

1. **Anchored = untouchable.** Anything a user has touched — list items,
   photos, poll targets/endorsements (both halves of composite ids), signals,
   on-demand requests, curated-list items, plus every place-grounded
   restaurant — puts its entity/connection on the preserved list. The wipe
   never deletes those rows. Same ID, same name, same row.
2. **Referenced-means-alive.** Anything still pointed at by any surviving
   row (arrays included, other cities' events included) also survives.

What the wipe deletes is only the EVIDENCE for the target community:
mentions, event-ledger rows, scores, orphan entities nobody references.
Re-extraction then re-reads the same source documents with the new prompt;
the resolver lands mentions back on the surviving entities by exact-name →
alias → LLM-judge matching. Scores/connections/categories rebuild.
`anchor-audit.sql` closes: TWINS (new prompt minted a duplicate of an
anchored entity), STARVED anchors/connections (anchor got no new evidence).

**Why a user's list survives:** their item points at an entity ID that is
never deleted and never renamed by extraction. What CAN change: the score,
the evidence chips, the surrounding graph.

## 2. Red team — real defects found (2026-08-01 deep read)

### 🔴 R1. Everyday projection rebuild can CASCADE-DELETE user list rows

`projection-rebuild.service.ts:897-908` deletes connections not in
`retainedKeys`; `user_list_items.connection_id` is `onDelete: Cascade`
(schema.prisma:1362-1363), `photos.restaurant_id` likewise. The WIPE is
anchor-careful but the ROUTINE rebuild path is not — a user's saved dish row
(note, position and all) can be silently destroyed outside any re-extract.
**Fix at the schema abstraction: user-layer FKs into the derived layer must
be `Restrict`, never `Cascade`** — then every deleter is forced through an
anchor-aware path (merge/rehome), and "user data deleted by derived-layer
GC" becomes impossible by construction. This is the single most important
fix in this doc and is independent of any choreography.

### 🔴 R2. Poll endorsements and comment spans never survive merges

`poll_endorsements.subjectId` is a bare string (schema.prisma:965, no FK);
merges never rekey it (unlike list items/photos/topics via
EntityAnchorRehomeService). After a merge the user's vote points at the
archived loser → silently stops counting. `poll_comments.entitySpans` same.
Fix: either rekey in rehome, or resolve through `entity_redirects` at read
(the signals-ledger pattern, already the blessed design there).

### 🟠 R3. Food-merge list rekey is a blunt updateMany

`food-dedupe-merge.service.ts:311-314` — no conflict check; if a user has
both dishes in one list it throws P2002 and aborts the whole merge.
Restaurant merge handles this (but resolves by DELETING the losing item,
discarding the user's note — should merge notes/keep earliest position).
Unify both through EntityAnchorRehomeService with a real conflict policy.

### 🟠 R4. Semantic twins evade the audit

anchor-audit's TWIN check is lexical (name/alias/plural). A prompt that
renames a concept ("birria tacos" → "quesabirria") yields a live new entity

- a starved user anchor, invisible to the audit. Fix: add an
  embedding-distance candidate pass to the audit (entities already carry
  name embeddings) — output pairs for agent review, auto-merge only above a
  conservative threshold.

### 🟠 R5. Cross-community counter zeroing without rebuild

Wipe L91-96 zeroes counters restaurant-scoped (not community-scoped); a
shared restaurant's other-city evidence survives in the ledger but nothing
replays it — counters stay zeroed until something touches that restaurant.
Fix: choreography must end with a projection rebuild for
`affected_restaurants` from the FULL surviving ledger (the ledger-repair
runner from e81c9c35 is the machinery).

### 🟡 R6. Places enrichment renames anchored restaurants

`restaurant-location-enrichment.service.ts:1101-1208` swaps the display
name for Google's. Usually correct; but it's a silent label change in user
lists. Disposition: accept, but surface renamed-anchored-entities in the
review output.

### 🟡 R7. Anchor-list blind spots

`user_list_items.location_id` not in preserved-anchors (narrow today);
`signals.subject_type='entity'` only — audit live distinct subject_types;
redirect preservation is one hop. Cheap additions to preserved-anchors.sql.

### Carried from the earlier red team (still true in the current shape)

prompt-hash coverage trap (resume keyword lanes = creeping global re-extract
under a new prompt); quiescence before wipe; rogue local workers; ~35-day
comfortable pause envelope (74-day theoretical, foodnyc 13.4 posts/day —
the ONLY fast lane; austinfood is 1/day).

## 3. From-scratch derivation — the shape we'd build knowing all this

Question asked: knowing we must do this repeatedly while LIVE, is
wipe-then-rebuild right? The owner's instinct (extract to the side, diff,
keep what matches, review deletions) turns out to be nearly buildable from
existing primitives:

- The event ledger is already append-only and RUN-VERSIONED; documents carry
  `active_extraction_run_id` — an activation POINTER.
- `ReplayService.replayExtractionRun({activate})` already has an activation
  flag — the concept of a non-active (shadow) run exists.
- Coverage is keyed by prompt hash — runs already know which prompt made them.

**Ideal end state (three moves):**

1. **Versioned prompts (kill the pause entirely).** Prompt becomes a
   versioned runtime input (row, not deploy asset); every run pins its
   prompt version; the "active prompt" is a governed switch. Consequence:
   collection NEVER pauses for prompt iteration — live lanes keep extracting
   with the blessed prompt while candidate prompts run shadow replays. The
   entire delta/74-day-clock/keyword-lane-trap problem class disappears —
   it only exists because prompt deployment is global and implicit.
2. **Shadow replay + diff, then atomic activation.** Re-extract = replay the
   city's documents under the candidate prompt with `activate:false`. Both
   runs coexist in the ledger. A DIFF REPORTER compares old-active vs shadow
   per entity: unchanged / renamed (same resolution target, new surface) /
   new / lost-support — with user-anchor annotations. Nothing user-visible
   changes during any of this. Activation = flip the documents'
   `active_extraction_run_id` + projection rebuild — atomic, reviewable
   first, and (owner decision 2026-08-01) genuinely REVERSIBLE: a
   cross-generation activation RETAINS the superseded events
   (`supersede:'retain'`), so `rollback` is a pointer flip back + rebuild —
   proven as an exact round trip on the real schema. Within-generation
   live-ingest supersede still deletes (same prompt, superset extraction,
   no rollback semantics — retention there would accumulate junk on every
   re-collection). Space for a superseded generation is reclaimed ONLY by
   the explicit discard verb, which is the one step that forecloses
   rollback.
3. **Anchored GC replaces the wipe.** After activation, entities with zero
   active-run support AND no anchor/reference get garbage-collected —
   the wipe's preservation laws become the GC's laws. The wipe script
   remains only as the disaster tool.

Rolling/global: activation is per-document-set, so per-region rolling
activation is native; "global re-extract" = shadow-replay everything under
the funded campaign, activate region by region as each drains. Collection
stays live throughout.

Cost: identical LLM spend (same docs, same prompt, same batches); extra
ledger storage during shadow (bounded, GC'd after activation). What it buys:
no degradation window, review-before-commit, instant rollback, no pause, no
delta problem, no prompt-hash trap (coverage under versioned prompts is
explicit per-version).

**Verdict: build the shadow/versioned-prompt shape. Do NOT build the
pause-based choreography script — it would be throwaway.** The pause
switches (CRONS_ENABLED / COLLECTION_SCHEDULER_ENABLED) remain as the
emergency brake, not the workflow.

## 4. The coordinator (agent-operated)

One entry point (script + runbook .md the agent follows), owner speaks one
sentence. Verbs the agent runs:

- `estimate --communities <list|all> --prompt <version>` — doc counts →
  `prepareManifestEstimate` (the SAME manifest machinery onboarding uses:
  4-line all-in estimate, tolerance, hash). Agent renders the manifest +
  a spend visual for the owner; owner replies "approved" in chat; agent
  passes the hash (`--approve-estimate <hash>` pattern, standing law §24.3).
  Campaign id is AUTO-created and threaded — owner never tracks ids; the
  `spend_campaigns` table IS the re-extraction registry (state, envelope,
  spent, breach — the ops-dashboard Campaigns card already shows it).
- `shadow` — replay under candidate prompt version, activate:false,
  campaign-gated (isDispatchable), batch-drained. Quiescence is a MANUAL pre-check (red team B4: never built — verify no non-terminal llm_batch_jobs for the target communities before arming).
- `diff` — the reporter; outputs a structured review file:
  AUTO (exact/alias twins → merge; unchanged) vs AGENT-REVIEW (semantic
  twins by embedding distance, renamed anchors) vs OWNER-DECISION (starved
  user anchors, lost-support entities with user references). The runbook
  instructs the agent how to triage and what requires owner input.
- `activate --communities <list|all|rolling>` — flip pointers + projection
  rebuild (R5 fix included) + anchored GC + anchor-audit + cost-reconcile.
  Refuses a non-candidate version and a sub-99% shadow. NOTE (red team B4): it does NOT check the campaign state or the review file — `--reviewed` is an operator ATTESTATION, not a verified gate.
- `status` — campaigns in flight, shadow coverage, review-queue counts,
  per-lane collection health.

Onboarding convergence: onboarding already owns the estimate-hash approval,
manifest, drain-and-report pattern (seed-archive.ts). The coordinator reuses
those primitives (SpendCampaignService, cost-report, drain-wait) rather than
duplicating; longer-term, onboarding's script sequence becomes coordinator
verbs too (`onboard` = sources row + lanes + funded archive load).

## 5. Build order (no throwaway work)

1. **R1 schema fix** (Restrict FKs) + R2/R3 rehome fixes — independent,
   user-protecting, do first.
2. Versioned prompts (runtime prompt registry; runs pin version; active
   switch). Verify replay's activate:false semantics end-to-end.
3. Diff reporter + review-file format + runbook for agent triage.
4. Coordinator verbs (estimate/shadow/diff/activate/status) wrapping the
   existing campaign/replay/audit machinery. Semantic-twin pass in audit.
5. Preserved-anchors additions (R7) + projection-rebuild closing step (R5).
6. Onboarding verb convergence (later).

## 6. CI/CD decision (2026-08-01, unchanged)

Staging auto-deploys from main (verify trigger connected); prod manual only
via deploy.sh — disconnect prod's GitHub trigger (dashboard, owner). No
GitHub Actions until a second committer.

> **CORRECTION 2026-08-03 (truth audit F1204): "No GitHub Actions" is FALSE
> and has been since ~2026-08-02.** `.github/workflows/ci.yml` exists and
> runs on every push to main — jobs: type-check, lint, build, test,
> `test:db`, plus `search-runtime-contract-tests` and a
> `no-bypass-search-runtime` static guard (added/hardened by `0aece2b4d`
> "CI teeth", `9102d8887`, `c29265179`, `6dd63eae7`, `2395a51e7`).
> AND, more importantly: **CI IS RED ON MAIN RIGHT NOW.** Checked
> 2026-08-03 — the six most recent runs all show `failure`, including the
> latest (`30855830203`, 2026-08-03T21:43). So no doc anywhere may treat CI
> as a passing gate, and `deploy.sh`'s known-red refusal (CLAUDE.md THE
> DEPLOY LAW) will currently block a prod deploy without `--force`. Getting
> CI green is an open owner item, not a settled one.

## SHADOW VOCABULARY CONTRACT (big-one red team, 2026-08-02 — supersedes

any earlier "nothing user-visible changes during shadow" phrasing)

A shadow DOES mint real entities in the live vocabulary (there is no
provisional status yet — recorded as the honest end-state option). The
contract that makes this safe:

- Projections/scores never read shadow evidence (active-run filter), so
  rankings are untouched.
- Places enrichment is DISABLED during shadows (the shadow verb sets
  DISABLE_RESTAURANT_ENRICHMENT=true) — a candidate prompt can never buy
  vendor data.
- A rejected candidate is removed with `reextract.sh discard <version>`:
  runs+events+claims deleted, prompt retired, then
  gc-unsupported-entities.sql (now active-run-filtered) collects the
  minted vocabulary. Discard hard-refuses if any document ACTIVATED the
  version.
- Zero-mention shadow runs are compaction-immune while their prompt is
  non-retired (the "correctly found nothing" verdict survives to
  activation).
- The in-flight coverage check is prompt-hash-scoped: shadows and live
  lanes never mask each other's coverage.
