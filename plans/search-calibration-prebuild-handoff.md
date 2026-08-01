# Handoff: pre-build the calibration tail (2026-08-01)

FROM the audit/pipeline session TO the search session (owner of
search-from-scratch-derivation.md steps 2–5). Owner-approved division:
you build search structure + these pre-builds; the audit session runs
the prompt cycle → re-extraction; nobody flips data-dependent behavior
until the graph settles.

## Context you don't have (why the sequence looks like this)

A five-surface data audit (plans/data-audit-2026-08.md) found the graph
you'd calibrate against is about to change wholesale: a re-extraction of
Austin (+possibly NY) under a rewritten prompt is queued behind six owner
rulings (P2) and a prompt-rules fold-in (P3). Separately, the pipeline
got a five-step async-integrity rebuild + five red-team rounds
(plans/async-integrity-ideal-shape.md) — evidence identity, coverage
claims, supersede-on-activation are all new since you last looked.
Net: any measurement taken against TODAY's graph is disposable; any
HUMAN review of today's entity lists reviews a pile the rerun will
regenerate differently.

## The principle: build the instruments now, take the readings once

## DO NOW (all graph-independent)

1. **Steps 3→4→5 as you planned** (pooling, structured grounding,
   per-word demand signals). No conflict with the rerun; proceed.
2. **Gazetteer cutover behind a flag.** Wire search's Understand step to
   entity-text-search's scanForKnownEntityGroups (built + tested, ZERO
   consumers today — verified). Flag-gated, default OFF, plus a shadow
   mode that logs old-vs-new segmentation diffs on real queries. Flip
   AFTER the rerun.
3. **Linker floor-fitting HARNESS** (script, not adoption): given the
   current graph, fit fuzzy-match floors for the multi-type recall and
   emit them as a report. Include the residue rule from spec §4.2: probe
   residue tokens JOINED with adjacent grounded spans ("brekfast" +
   "tacos" → candidate "brekfast tacos"), and wire food-lemma variant
   probes into the gazetteer candidate set (plural grounding must not
   depend on alias luck — 1,003 of 1,085 single-word foods have no
   plural alias).
4. **~44-name conflict EXTRACTOR** (script): emit the curated-placement
   review list (genuine cross-bucket names, per-type event counts,
   example usages) as a table the owner reviews in one sitting. Do NOT
   hand-curate now — list membership changes post-rerun.
5. **Junk DETECTORS** (queries/script): generic-word restaurant names,
   ≥5-word fragments, menu-format foods — emit counts + samples. Do NOT
   adjudicate now; the new prompt stops minting most of this class.
6. **Threshold re-measurement query**: the scarce-rate measurement for
   RELAX_STRICT_THRESHOLD=25 (already adopted), ready to re-run.

## DO NOT (until the audit session says the graph settled)

- Flip the gazetteer flag or adopt fitted linker floors (would tune live
  behavior to a graph we're replacing).
- Hand-curate the placement list or adjudicate junk (human time spent on
  a pile about to be regenerated).
- Any merge/archive of entities beyond what plans/data-audit-2026-08.md
  P1 already schedules (those run pre-rerun on the audit session's side,
  through the shared EntityAnchorRehomeService so user anchors rehome).

## Post-rerun, the tail collapses to

run the harnesses → owner reviews two short lists (placement + junk) →
adopt floors → flip the gazetteer flag → re-measure threshold. Days of
work becomes an afternoon.

## Two corrections to your scoreboard

- "Multi-type gazetteer ✅" is true of the COMPONENT only — search has
  not been cut over (scanForKnownEntityGroups has no consumers). Item 2
  above is that cutover.
- Your step-2 "waits for re-extract" is right, and its blocking reason
  is precisely items 3–4 here (floors + placement) — pre-building them
  is how your step 2 lands fast afterward.

## Coordination gates (audit session owns these; don't wait on them,

just don't cross them)

1. Owner P2 rulings → prompt fold-in → shadow replay diff review.
2. Re-extraction (campaign-guarded runner; supersede-on-activation is
   live — activating a run now PHYSICALLY deletes superseded evidence,
   so never activate shadow runs outside the reextract skill flow).
3. "Graph settled" signal → you flip/adopt/curate.
