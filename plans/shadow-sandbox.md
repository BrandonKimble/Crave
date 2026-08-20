# Shadow sandbox — the from-scratch isolation model (P6)

> **STATUS (added 2026-08-19, plans reconciliation): LANDED.** The design below is
> implemented — `born_extraction_run_id` lives on core_entities + entity_surface
> (schema.prisma), the byte-identical acceptance is 4/4 per plans/v16-program.md,
> and the SD-1/SD-2 retro sweep EXECUTED (4,510 surfaces deprecated + 4,116 entities
> archived; see v16-program "Ground truth"). SD-3 (ghost `Best`) rides the P8
> reground/ghost-lifecycle sweep, in flight 2026-08-19.

Owner ruling (2026-08-14 walkthrough subject 7): not a patch on the
entity-quarantine hack — rederive the entire shadow isolation model. One
invariant: **a rehearsal must be observable (diffable, auditable) and
side-effect-free until activated; activation is one atomic flip.**
This document is the complete write enumeration (every door verified in
code, not grepped), each door's verdict, and the design. Must land before
the next shadow run.

## What is true today (verified 2026-08-16, exhaustive sweep)

The only working quarantine is the ACTIVATION JOIN: `core_restaurant_events`
and `core_restaurant_entity_events` carry `extraction_run_id`, and every
reader joins `d.active_extraction_run_id = ev.extraction_run_id`
(extraction-scope.service.ts:171-228, projection-rebuild.service.ts:242+).
A shadow run (`REEXTRACT_ACTIVATE=false`) never becomes any document's
active run, so its events are inert. `activateDocumentIds=[]` gates exactly
two more things: `supersedeAndActivate` and the zero-mention supersede.
**Everything else the banking transaction writes is globally live**, which
is how 1,402 shadow surfaces went live (v13 shadow incident).

## The door inventory

GLOBAL today (must become rehearsal-scoped or justified-live):

| # | Door | Site | Verdict |
|---|------|------|---------|
| 1 | `entity_surface` bank (fuzzy reuse / adoption / new-entity) | unified-processing 1727, 2115, 2262 → entity-surface 713 | REHEARSAL-SCOPED. Highest-volume leak; a candidate prompt phrases differently, so shadows bank MORE fuzzy surfaces than live runs. |
| 2 | `core_entities` mint (restaurant/food/ingredient/category → `active`, unmarked) | unified-processing 2162, 2183 | REHEARSAL-SCOPED. Today shadow mints are indistinguishable from real entities and unrecoverable on rejection (no marker). |
| 3 | identity-key occupation by shadow mints | same insert | Follows #2 — a rehearsal entity must not occupy a live identity key. |
| 4 | placeholder `core_restaurant_locations` + `primary_location_id` | unified-processing 2274-2286 | Follows #2. |
| 5 | `restaurant_attributes[]` merge onto LIVE restaurants | unified-processing 2967 | SKIP IN REHEARSAL — projection re-derives from evidence at activation; the merge is redundant there and a leak here. |
| 6 | `name_embedding_stale` touch on live entities | entity-surface 589 | SKIP IN REHEARSAL (an un-banked surface must not trigger live re-embedding). |
| 7 | entity-match `claim_verdicts` + markExecuted | entity-resolution 1758/1768 | REHEARSAL-SCOPED with SELF-VISIBILITY: the run reads its own verdicts (byte-identical replay) but live resolution must not; flip to steady at activation. |
| 8 | coverage claims | collection-evidence 454-485 | JUSTIFIED-LIVE: already quarantined BY PROMPT HASH (F3) — a candidate-hash claim never blocks the live prompt. |
| 9 | `api_usage_events` + campaign spend | usage-ledger 288, spend-campaign 911 | JUSTIFIED-LIVE (⭐05 #6): billing truth doesn't rehearse. A shadow may breach and stop its campaign — intended. |
| 10 | batch job machinery | gemini-batch 216+ | JUSTIFIED-LIVE: operational, job-keyed, not a data surface. |
| 11 | ontology adjudication queue (60s debounce → pending attrs go ACTIVE, merges, redirects) | unified-processing 845 | SUPPRESS IN REHEARSAL; enqueue at activation. Today this converts the attribute "quarantine" into a 60-second latency window. |
| 12 | restaurant-enrichment queue (Places spend per shadow mint) | unified-processing 3482 | SUPPRESS IN REHEARSAL; enqueue for flipped mints at activation. |
| 13 | metro-probe queue | unified-processing 3399 | SUPPRESS IN REHEARSAL; same. |
| 14 | projection rebuild fired from mention-derived `affectedRestaurantIds` | unified-processing 820 | SKIP IN REHEARSAL: inputs are activation-joined so it recomputes what already exists — pure churn today, and it would bake in any upstream leak. Activation runs it once, correctly. |

RUN-SCOPED already (keep): restaurant/entity events (the activation join),
extraction run/input/input-document rows, collection_runs (synthetic scope
key). Not reached in replay: source-document creation, processed-sources
ledger (skipSourceLedgerDedupe), active-run flip + supersede deletes
(gated by the empty activation set).

⭐05's lanes (their verdicts, folded verbatim): vocabulary_hearing_queue
rows LIVE (word knowledge is activation-independent); word-lane hearing
DRAINS live only once this sandbox makes rehearsal surfaces invisible to
the evidence sampler (until then: gated off during windows); word-claim
adjudicator hearings fired by banking QUARANTINE (spend + a takeWord
effect can evict a live incumbent's label); embedding of rehearsal
entities QUARANTINE (dense leftover lane); demand/sync-hearing/C4a court
not replay-reachable. Entity-match + place-grounding lanes (mine since
c539da367): entity-match is door #7; place-grounding only runs via the
enrichment queue, so #12 covers it.

## Why "don't bank in shadow" loses

The diff instrument (scripts/reload/shadow-diff.sql) reads shadow EVENTS
joined to resolved ENTITIES — the rehearsal must run real resolution to be
observable. So the sandbox cannot skip banking; it must make banking's
writes carry the rehearsal.

## The design: a rehearsal generation on the write path

Exactly the shape the owner's ruling anticipated: the write path carries a
generation/status, and readers see only activated rows.

1. **`born_extraction_run_id` (nullable uuid) on `core_entities`,
   `entity_surface`** — the marker. NULL = born live (all existing rows).
   Set for every row the banking tx creates under a rehearsal run.
2. **Status carries visibility**: rehearsal-minted entities and surfaces
   are born `status='rehearsal'` (new enum value). Every live reader
   already filters `status='active'` (entity-text-search all arms,
   embedder, derived-index nightlies, score) — **zero reader changes**,
   verified per-reader at build time and enforced by the acceptance test.
3. **Self-visibility inside the run**: the resolver/banking path for run R
   treats `status='rehearsal' AND born_extraction_run_id=R` rows as
   visible — the replay is internally coherent (its own mints resolve, its
   own surfaces match) without leaking to anyone else. Entity-match
   verdicts record with `source='rehearsal:R'`; `decidedVerdicts` includes
   steady + own-run rows only.
4. **The rehearsal flag is explicit**: the runner threads
   `rehearsal: true` (from REEXTRACT_ACTIVATE=false) through pipeline
   params into banking — never inferred from an empty activation list.
   Under the flag: doors 5, 6, 11, 12, 13, 14 do not fire.
5. **Activation = one transaction keyed by the run set**: flip entities +
   surfaces `rehearsal→active` (and verdicts `rehearsal:R→steady`) WHERE
   `born_extraction_run_id IN (runs)`; then the existing active-run flip +
   supersede; then fire the deferred machinery once (adjudication queue,
   enrichment for flipped mints, projection rebuild) inside the
   calibration epoch. **Rejection** = archive by the same key: entities +
   surfaces `rehearsal→archived`, verdicts deleted (never fed to memory),
   nothing else to clean because nothing else fired.
6. **Dedupe across shadows**: a second rehearsal of the same content
   adopts the first's rehearsal rows only within the same run id;
   different runs mint their own (rehearsals never share state — byte
   identity per run beats cross-run thrift).

## Acceptance test (⭐05's formulation, adopted as the mutation-proof)

A shadow replay followed by the nightly derived-index rebuilds produces
**byte-identical derived tables** to a world where the replay never
happened; and live search/text-search/score results are row-identical
during the window. Implemented as an invariant-style integration spec on
the live DB: snapshot → replay a canned run in rehearsal mode → rebuild →
compare. RED-capable by construction: removing the rehearsal status from
any one door (e.g. surfaces born active) fails the compare — that IS the
1,402-surface incident, reproduced as a test.

## Implementation order

1. Migration (create-only + deploy): `rehearsal` enum value +
   `born_extraction_run_id` on core_entities + entity_surface; index on
   (born_extraction_run_id) partial WHERE not null.
2. Thread `rehearsal` from city-reextract runner → replay → pipeline →
   unified-processing (params object, not env sniffing).
3. Banking: mint/bank with rehearsal status + born-run id; suppress doors
   5/6/11/12/13/14; resolver self-visibility (entity lookup arms +
   fuzzy-tier candidate queries add the own-run OR-arm); verdict source
   tagging + decidedVerdicts filter.
4. Activation service: the atomic flip + deferred machinery, wired into
   the existing activate path (reextract.sh activate).
5. The acceptance spec + a RED mutation for at least doors 1, 2, 7, 11.
6. ⭐05 un-gates word-lane drains during windows (their #2) once the
   acceptance spec is green.

## Shadow-damage docket (live witnesses, tracked by id — not prose)

- **SD-1 — shadow-banked live surfaces (the 1,402 class).** Witnesses:
  `bơ` → junk ingredient "bo" (surface 4200d370, source=extraction, born
  2026-08-13 01:29 — inside a shadow window; makes acc-02 red: exact-match
  beats the real vi avocado/butter surfaces) and the hg-01 `pan` flag.
  Cleanup: retro sweep at sandbox landing — surfaces whose ONLY evidence
  ties to never-activated runs (join their events' run ids) archive; the
  sweep ships with the rehearsal migration so the marker gap never needs
  guessing again.
- **SD-2 — shadow-minted junk entities.** Witness: ingredient "bo"
  (adopted the folded key, now the exact-match target). Same retro sweep,
  entity side; survivors need live-run evidence.
- **SD-3 — ghost `Best` (b92af0ed) serves autocomplete exact-top.** Name-
  hearing correctly UPHELD it (it is a real shorthand of Best Pizza) — the
  defect is lifecycle, not name-hood: ungrounded-after-attempt must not be
  searchable. Owned by the P8 reground → ghost-lifecycle sweep,
  explicitly, so no lane assumes another owns it.
