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
