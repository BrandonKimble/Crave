# Async Integrity — the ideal shape (2026-08-01)

Trigger: the ledger-dedupe class from the data audit turned out to be one
symptom of a design-level truth — the pipeline was designed with a
sequential mental model, but its reality is concurrent (three batch
queues ingesting asynchronously over hours, crons, replays, and a future
of multiple worker replicas). Three fresh-context deep reads (ingest
path, resolver, state machine/scheduling) traced every surface. This doc
is the canonical assessment: the foundational abstraction the system
should have, and everything currently violating it.

## THE ONE-SENTENCE DIAGNOSIS

The system keys identity by DELIVERY (which run/batch/process produced a
fact) and coordinates by CHECKING (read state, then act), but a
concurrent system must key identity by CONTENT (what the fact is) and
coordinate by CLAIMING (atomically reserve, then act) — nearly every
observed defect (double-counted events, twin entities, tombstone writes,
dark evidence, double ingestion, ungoverned spend) is one of those two
mistakes wearing a different costume.

## THE FOUR LAWS OF THE IDEAL SHAPE

1. **Identity is content, not delivery.** A claim's identity is
   (document, content, subject) — the run id is provenance metadata.
   - Event uniqueness: (source_document_id, content-deterministic
     mention key, restaurant_id, entity_id, evidence_type). Today it is
     run-scoped (schema @@unique includes extractionRunId) and the
     mention key hashes a model-assigned temp_id — not content — so even
     one run can double-file a claim.
   - Mention uniqueness: (connection_id, source_document_id, kind).
   - Entity identity: (type, identity_key) where identity_key =
     lemma-collapsed, token-sorted canonical name — enforced by a
     partial unique index WHERE status != 'archived', with upsert-adopt.
     Today there is NO unique constraint on (type, name) at all (dropped
     2026-04, never restored); the advisory lock keys the literal name
     string so word-order/plural twins take different locks.
2. **Claim, don't check.** Every read-then-act becomes an atomic
   reservation:
   - Extraction coverage: an INSERT..ON CONFLICT claim table keyed
     (source_id, prompt_hash), claimed in the same tx that creates the
     run — replacing the covered-check's join across two tables written
     minutes apart (the blind window every entry point shares, and the
     replay path doesn't even call the check — its docstring lies).
   - Provider submission: the deterministic displayName IS the
     idempotency key — list-and-adopt before create, so a crash between
     provider-create and DB-write cannot double-pay.
   - Spend: reserve estimated cost at submit, reconcile at poll (the
     PoolRegistry already has reserve/reconcile; the money pool is the
     one place it isn't used). A boolean admit() read every 30s is not a
     cap.
   - State transitions: EVERY terminal write is a guarded updateMany
     WHERE status = expected, and a zero-count result means "I was
     reclaimed — abort, don't commit." Two bare update()s in pollOne are
     how double ingestion happens.
3. **Validate at time of use, not time of check.** Work computed outside
   a transaction must be re-validated inside it:
   - Resolution results (computed minutes before the write tx, reused
     across retries) get a status + entity_redirects hop INSIDE the
     write tx — closing the events-onto-tombstones class (observed:
     Sway/Abgb, and the whole attribute-tombstone leak's write side; the
     creation-path findFirst also lacks a status filter, so new mentions
     can ADOPT an archived loser).
   - Activation: a document's active_extraction_run_id may flip ONLY to
     a run that actually extracted that document (today activation uses
     the pre-trim set — every partially-covered re-collection darkens
     the prior run's evidence for the trimmed docs; compaction then
     DELETES the superseded run = permanent loss. Mirror measured
     18,110 dark events, 0 yet unrecoverable — compaction hasn't eaten
     them; fix before it does).
   - Projection rebuild: per-restaurant advisory lock (ids sorted), so
     two concurrent full-replace rebuilds can't commit a stale snapshot
     over a fresh one; the category-edge refresh also stops rewriting
     global rows for unrelated restaurants without ordering.
4. **A guard that lives in one process protects one process.**
   In-memory booleans (pollInFlight), per-queue concurrency:1, the
   campaign breach verdict read from a process-local pool, the pacer's
   instance-field reservations — all are correct only under the
   accidental single-worker deployment, and nothing enforces that shape.
   Either move the guard into the database (lease, claim row, guarded
   update — the job-lease pattern already in the code is the model) or
   enforce single-flight explicitly. Never both assume and not enforce.

## FULL DAMAGE LIST (ranked, with observed status)

CRITICAL — active data loss/corruption:

- C1 Activation overreach + compaction = permanent evidence loss
  (observed: 18,110 dark events; recoverable TODAY). Fix: activate only
  extracted docs; compaction refuses to delete runs still referenced by
  events; repair job re-lights dark events whose run survives.
- C2 Replay path has NO coverage gate (processStoredInputs never calls
  it) — a worker restart mid-reload re-pays the completed prefix; the
  re-extract runner's crash-safety comment is false. Fix: gate in
  processChunkPlan (both entry points) + durable cursor in the runner.
- C3 pollOne's two unguarded status writes allow double ingestion under
  a second poller; the hourly stale sweep ignores leases and can kill a
  live ingest (then the unconditional write resurrects it, and
  compaction can delete the run under the evidence).
- C4 Run-scoped event uniqueness + non-content mention keys = structural
  double-counting (observed: 23,358 duplicate-lineage events, 2-4x
  score inflation; ALSO load-bearing: the active-run filter currently
  masks most of it — C1 and C4 must be fixed together).

HIGH — correctness under concurrency:

- H1 Entity twins: no DB uniqueness, name-string lock key, per-call
  in-memory dedupe map (observed: cross-batch plural residue, live
  word-order twins 2026-07-31). Fix per Law 1 (identity_key lock + partial
  unique index + adopt).
- H2 Tombstone adoption/writes (observed). Fix per Law 3.
- H3 Merge crons hold no locks vs ingest; no post-merge orphan sweep —
  every merge has an open tail the projection silently drops. Fix:
  merges take the same identity locks; nightly re-point of events on
  archived entities via redirects (now extended to ALL types, per the
  data-audit P0.1).
- H4 Concurrent projection rebuilds (poller x poller/cron/ballot). Fix
  per Law 3.
- H5 Spend meter flushDurable/ensureWindow lost+double counts (candidate
  source of the Gemini ~5% reconcile drift); Tier-3 admit() staleness +
  no reservation; campaign breach verdict process-local. Fix per Law 2.

MEDIUM:

- M1 Provider-submit crash orphan (paid, unrecorded provider job). Fix:
  displayName adoption (Law 2).
- M2 Five non-atomic writes in run setup (crash = partial run, wrong
  pointer); persistExtractionInputs unbatched; ensureCollectionRun
  find-then-create race.
- M3 Batch requests freeze a cachedContent name that can expire before
  resubmission (30h TTL vs 30h stale horizon, no ordering). Fix:
  re-resolve cache at submit.
- M4 Cache mint memoizes result not promise → N concurrent acquires park
  on the advisory lock and can exhaust the Prisma pool.
- M5 Keyword batch enqueue passes no jobId (dedupe left to the leaky
  coverage window); MAX_INGEST_ATTEMPTS unguarded increment; pacer tick
  reservations clobberable via the probe-exposed entry.

## WHAT'S ALREADY RIGHT (build on these, don't replace)

The job LEASE (claim + heartbeat + CAS reclaim) is exactly the right
pattern — the fix list is mostly "apply the lease's discipline to the
rest of the state machine." The entity advisory lock is in the right
place — wrong key. The campaign spentMicros increment is atomic. The
context-cache registry is correctly locked (advisory + in-lock
re-check). Read Committed + single-tx consolidated processing gives
atomic per-batch writes. Redirects are chain-flattened and clean.

## EXECUTION RECORD (2026-08-01, all five steps)

- Step 1 DONE (e81c9c35): ledger repair ran on prod — 23,358 superseded +
  7,384 same-run duplicate events deleted, 2,086 restaurants rebuilt,
  detectors zero.
- Step 2 DONE (b39631a2, deployed): doc-scoped event uniques + mention
  partial unique + counter recompute (migration); supersede-on-activation
  (dark evidence can no longer exist); identity-key advisory locks +
  variant adopt-probe + tombstone-adopt-via-redirect; one-(doc,kind)
  claim guard in the rebuild. The (type, identity_key) DB unique index
  is DEFERRED until the restaurant/food dedupe classes clear the ~190
  existing violations.
- Step 3 DONE (2158acd2): ExtractionCoverageClaim reservations at every
  entry point (replay finally gated — runner crash-restart is real);
  guarded pollOne transitions; idempotent provider submission
  (displayName adoption); lease-respecting stale sweep; claim release on
  terminal states + orphan reaping.
- Step 4 DONE (925367c1): activation from post-trim extracted set;
  compaction refuses runs with live evidence; per-restaurant sorted
  rebuild locks; in-tx redirect revalidation of resolution ids; nightly
  tombstone-event sweep (re-point + rebuild + stranded count);
  ensureCollectionRun upsert; atomic input persist.
- Step 5 DONE (flush single-flight + ensureWindow subtract-not-zero;
  campaign breach verdict from durable spentMicros). DEFERRED: Tier-3
  monthlySpend reserve/reconcile at submit — the backstop stays a soft
  30s-TTL gauge (by design a catastrophe brake; campaigns are the real
  cap); revisit if multi-worker ever ships.

## RED-TEAM ROUND (2026-08-01, two fresh-context adversaries, all fixed same day)

Mechanism attack found 9 (4 high) — all verified and fixed:

- F1/F2: activation ran BEFORE the event write, so supersede-delete
  destroyed old evidence while the replacement didn't exist (failed
  chunks = permanent loss). Activation now happens INSIDE the
  consolidated write tx, restricted to documents of chunks that produced
  output; restaurants losing evidence join the rebuild set under their
  rebuild locks.
- F3: my stored-input gate/claim/stamp hashed the LIVE prompt, not the
  run's EFFECTIVE (versioned) prompt — every shadow replay would have
  silently no-opped and versioned claims never released. All three sites
  now use resolveEffectivePrompt.
- F4: replay's date-range/doc-list activation could take over documents
  the run never extracted (destructive under supersede). Now intersects
  with the run's extraction_input_documents.
- F5: tombstone sweep's DELETE removed unmovable (archived-winner)
  evidence and its same-snapshot moves could abort on the content unique
  nightly. DISTINCT ON candidate selection + winner-active DELETE guard.
- F6: campaign breach verdict was read-then-compute; now the guarded
  UPDATE..RETURNING's own value decides (increment and verdict atomic).
- F7: ensureWindow window-roll and add-succeeded/load-failed edges could
  drop or double-persist deltas; residual math now window-aware.
- F8: identity-key fold was asymmetric (curry/curries different locks) —
  variant-closure fold; non-food adopt-probe now queries the SAME
  stripped-name expression the lock keys on (Phil's/Phils adopt).
- F9: ledger-repair runner deleted (job done; its keep-oldest rule now
  conflicts with supersede semantics and re-arming was dangerous).

End-state judge verdict: right scale (~85%), point mechanisms correct
for a single-worker Postgres system; no outbox/event-sourcing needed
(the ledger already is one). Adopted from it: M4 fixed (batch cache mint
memoizes the PROMISE — cold-cache fan-out no longer parks N Prisma
connections behind a vendor call). CONSCIOUS deferrals, recorded:

- M3 (cachedContent name frozen into persisted batch requests): bounded
  by the 25h reuse floor + registry young-cache guard; a real fix needs
  the job to carry prompt identity — fold into any future batch-cache
  work.
- Law 4 (process-local guards): ACCEPTED single-worker posture — leases,
  claims, and guarded transitions make a second worker SURVIVABLE, and
  Railway runs one worker by configuration. Revisit only if replicas
  ever ship; the judge's work-item-table unification is the shape to
  build then.
- (type, identity_key) DB unique: still waits on the restaurant/food
  dedupe classes (existing twins would violate it — including the
  Phil's/Phils class the audit found).
- OWNER QUESTION carried to the re-extract work: supersede-by-DELETE vs
  keeping superseded events + the projection's active-run filter (the
  readers still apply it anyway). Delete is simpler and shipped;
  keep-and-filter would preserve one-command re-activation of a prior
  run. Decide before the first shadow-activation on prod.

## RED-TEAM ROUND 2 (2026-08-01, fix-attacker + cold end-to-end sweep, all fixed same day)

Cold sweep (looked where rounds 1 didn't): the content uniques BROKE the
poll ballot lane — per-voter events shared one synthetic document, so the
second agreeing voter aborted graduation (P2002) and the rebuild guard
would collapse N voters to one mention. FIX: one synthetic document per
voter (the voter IS the claim identity); zero prod rows existed, no
migration. Also: all three merge services pre-checked event collisions on
the OLD mention-key unique — re-keyed to the live (run, doc, ...) key.
Archive lane, interactive path, on-demand, places writes, and all
post-supersede readers verified CLEAN (negative results recorded).

Fix-attacker (on efec8bc7's own fixes): '\s+' in a template literal
cooked to 's+' — the stripped-name probe replaced letter runs of 's' and
could FALSELY ADOPT distinct entities ("Taco" adopting "Tacos"); fixed
'\\s+'. Zero-mention batches early-returned BEFORE activation, so "the
new prompt correctly found nothing" never superseded old claims — the
supersede now runs in that branch too (shared applyActivationSupersede).
Identity fold now iterates variants to a true FIXPOINT (two levels still
split curry/curries). Tombstone sweep gained the RESTAURANT dimension
(merged-away restaurant ids on both event tables — the projection loads
by restaurant and never saw them) and rebuilds restaurants whose
duplicate rows were deleted. Campaign zero-count refusal distinguishes
breached (requeue) from terminal states (stop); month-roll unpersisted
tails now flush to their own window key (drift class). Verified sound
under attack: effective-prompt gate coherence, F5 sweep ordering,
UPDATE..RETURNING verdict, M4 single-flight, residual math on all three
interleavings.

## RED-TEAM ROUND 3 (2026-08-01, static fix-attacker + EMPIRICAL adversary

executing code/SQL against the prod mirror; all fixed same day)

Static (on round-2's fixes): C1 CRITICAL — per-voter ballot source_id
(85 chars) overflowed VARCHAR(64); every graduation would 22001-abort in
an infinite retry loop (unit specs passed because the mock hid the
column). Voter suffix is now a 12-char hash (61 total). C2 — voter docs
inflated the poll room's A(τ) mass by turnout; excluded from the mass
count via raw_payload voterUserId (+ parentSourceId provenance). C3 —
zero-mention supersede ran BEFORE the dry-run gate (shadow runs would
delete real evidence); gated. C4 — month-roll tail was clobbered when
its flush failed (bail-and-retry now) + mid-load pre-roll consume guard.
C5 — stranded metric gained the restaurant dimension (was blind to it).
C6 — breach-error docstring corrected (no requeue caller exists yet).
Plus: city-reextract excludes poll_surface docs (replaying no-LLM ballot
runs would supersede-delete ballot mentions). Verified sound: ballot
re-mint idempotency, sweep pass composition (entity-first is required
and correct), fixpoint termination (proven, ≤3 iterations, ns cost).

Empirical (17,188 real names, sweep dry-runs under simulated merge
load, full unique-violation scans): the identity fold was NOT
order-invariant (41.8% of multi-word names — the docblock's own
"pizza square" example still split) because only the HEAD word was
stemmed — now folds EVERY token to its closure minimum then sorts
(re-verified invariant on all divergent pairs); the food probe never
covered word-order twins even under a shared lock — added a
token-sorted stripped SQL probe for foods. PASSES with numbers: 0
content-unique violations on prod data; 0 false adoptions in the
stripped probe (21/21 real dupes it would have prevented); sweep
leak-free and abort-free under a simulated 38-pair merge (2,963 events,
7 real collisions proving the re-keyed pre-check earns its keep); TS
key ≡ SQL key byte-for-byte on all 10k+ non-food names; fold runs 17k
names in 43ms. Claims table: 0 rows ever — the claim path is still
UNTESTED in production (first real exercise = the next collection
cycle; watch it). Stranded-metric note: the entity-dim count is
dominated by ~11k deliberately-archived cuisine attributes awaiting the
class-② ruling — expected to drain then.

## RED-TEAM ROUND 4 (2026-08-01, diff-attacker + live/prod verification)

BLOCKER caught before it ever fired: both adopt-probe raw queries cast to
::"EntityType" but the DB type is entity_type (@@map) — every new-entity
mint whose variant probe missed would 42704-abort the write tx. Shipped
by round 2, propagated by round 3, masked by mocked specs; fixed to
::entity_type and verified live (finds pizza square/square pizza). Also:
null-safe raw_payload predicate in the mass query (latent NULL drop);
the pool-registry bail paths now ALERT via onDurableFlushFailure (a
persistent store failure wedges the pool loudly, not silently); dry runs
report would-supersede counts (shadow diffs see the most consequential
class); order-probe adoptions are audit-logged (design ruling: adoption
stays ON — zero false collisions exist in the graph today, the
chocolate-milk/milk-chocolate class is prospective and now findable).
Verified sound: '\\s+' escaping (this time), TS≡SQL sorted keys on all
7,614 food names, voter-hash collision math (4e-12/poll), parent_source_id
consumers, jsonb ? operator under Prisma, stranded-query cost (19ms).
CLAIMS PATH: first real execution (local Postgres) — claim/contention/
stamp/reap all correct; prod detectors all zero post-deploy; production
soak of the claim path = next scheduled collection cycle.

## SEQUENCE (this becomes audit class ①, expanded)

1. Stop the bleeding (data): repair C1's dark events while all runs
   survive; then the C4 dedupe + mention dedupe + counter recompute
   (from the data audit) — one migration-plus-script pass, rehearsed on
   the mirror.
2. Identity keys (schema): content-deterministic mention key; document-
   scoped event uniqueness; entity identity_key column + partial unique
   index + lock-key change + adopt semantics; mention triple index.
3. Claims (behavior): coverage claim table wired into processChunkPlan;
   guarded terminal transitions + lease-respecting sweep; displayName
   adoption; runner cursor.
4. Time-of-use validation: in-tx redirect/status hop for resolution
   results; activation from extracted-set only; compaction reference
   check; per-restaurant rebuild locks; post-merge orphan sweep.
5. Money: pool reserve/reconcile on submit/poll; single-flight flush;
   DB-derived campaign breach.
   Then the remaining data-audit classes proceed on a trustworthy substrate.
