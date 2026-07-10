# Archive-Load Run Audit — stage-2 (1,250-post) pass, 2026-07-08 → 07-10

Every failure the staged Austin load surfaced, its root cause, its fix status,
and the ideal-shape architecture changes the pattern demands. The staged-proof
run did exactly its job: it flushed out six real defect classes before the
full load. **Full load is HOLD until the owner reviews this audit.**

Verdicts from the 30-agent cost-recon red team are folded in (§7–8).

---

## Incident inventory

### 1. Ontology hard-delete vs in-flight extraction (FK crash) — FIXED

- **Symptom:** 40/44 batch ingests failing for ~6h; `restaurantEntityEvent.createMany`
  FK violation, deterministic per retry.
- **Root cause:** `AttributeOntologyService.applyPlan` hard-DELETED rejected/merged
  attribute entities while in-flight extractions held those ids in memory
  (resolution → event-write window spans minutes). Two writers, no contract.
- **Fix (committed `3797f626`):** archive-never-delete. Reject/merge → `status='archived'`
  tombstones; resolver exact/alias tiers exclude archived (merged synonyms forward
  via banked alias); creation path sinks repeat junk mentions onto the rejected
  tombstone (also ends the reject→recreate→re-judge cycle). FK crash impossible
  by construction.
- **Residual ideal:** codify **"no hard delete of live-graph rows"** as a stated
  contract; sweep the codebase for remaining `DELETE FROM core_entities`-class
  statements (dedupe-merge and janitor already archive; verify nothing else).

### 2. Orphaned `ingesting` claims (the biggest operational tax) — OPEN, design below

- **Symptom:** 4 separate manual resets; jobs stuck in `ingesting` for hours,
  invisible to the retry path (which only watches `succeeded`), waiting on the
  30h reconciler.
- **Root cause:** claims are a bare status flip. Any process death mid-ingest
  (and `nest --watch` restarts on EVERY file save in a concurrent session —
  it is an orphan **factory**) strands the claim. The stale-job reconciler is a
  30h backstop, not an answer.
- **Ideal fix — lease-based claims:** claim = `status='ingesting'` +
  `lease_expires_at = now() + interval` (e.g. 10 min), heartbeat extends the
  lease while sub-batches progress; the poller's retry query becomes
  `status='succeeded' OR (status='ingesting' AND lease_expires_at < now())`.
  Dead workers self-release within minutes, no reconciler wait, no manual
  resets, safe under any number of concurrent pollers. Same pattern for the
  new `submitting` state. This replaces manual ops with mechanism — it is the
  single highest-value change from this run.

### 3. `pending` jobs never submitted — FIXED

- **Symptom:** 25 jobs sat in `pending` for 10h; the poll loop reported
  "waiting on 26 jobs" that Google had never received.
- **Root cause:** `submit()` persists items BEFORE the provider call precisely
  so failure between the two is resumable — but no resumer existed. The spend-cap
  429 hit that exact window 25 times.
- **Fix (committed `8c30a9c2`):** poll() resume-submits stale pending jobs from
  persisted items (age-gated claim via `submitting`).
- **Ideal principle it proves:** every persisted state must have exactly one
  owner that moves it forward. Audit the state machine:
  `pending → submitting → submitted → succeeded → ingesting → ingested/failed`
  — each edge needs a named owner and a recovery path.

### 4. Transient failures burn bounded retry attempts — OPEN

- **Symptom:** spend-cap 429s (pure transient) consumed `ingest_attempts` and
  drove 8 jobs to terminal `failed`, which also failed their extraction runs.
  Needed manual resurrection twice.
- **Root cause:** one retry budget for two different failure kinds.
- **Ideal fix — error taxonomy at the ingest boundary:**
  - **Transient** (429/5xx/network/timeouts): never consumes an attempt;
    exponential backoff; unlimited (the job is durable, waiting is free).
  - **Deterministic** (validation/contract, e.g. `Invalid source_id`): fails
    fast — attempts=3 is pointless when the input can't change; one attempt,
    then terminal + loud.
    The `MAX_INGEST_ATTEMPTS` counter applies only to the deterministic class
    (guarding against misclassification).

### 5. Cause-chain swallowed by generic wrappers — OPEN

- **Symptom:** job rows stored `"LLM output processing failed for batch X"`;
  real causes (FK violation; spend-cap 429) required foreground repro runs to
  see. Attribution cost hours, twice.
- **Root cause:** `UnifiedProcessingExceptionFactory` wraps with a message and
  drops the cause text; the batch job's `error` column stores only the wrapper.
- **Ideal fix:** persist the full cause chain (`err.message` + each `cause`
  message, truncated) into `llm_batch_jobs.error`, and make the sub-batch
  aggregate error name each sub-batch's underlying cause. Loud-RED doctrine:
  the failure record must carry enough to attribute without a repro.

### 6. Multi-poller anarchy — OPEN, policy decision

- **Symptom:** at one point THREE processes (seed script, `nest --watch` dev
  server, a stale `dist/main`) polled/claimed/ingested concurrently — with
  different code versions. The stale binary kept re-crashing ingests with the
  pre-fix delete code; attempts burned across all three.
- **Ideal fix:** batch lifecycle gets a single-writer gate like enrichment's
  `isWorkerRuntime`: only one designated runtime polls/ingests. The seed
  script becomes a pure OBSERVER (enqueue, wait on counts, report) — it never
  ingests. Leases (§2) make the residual race harmless; the gate makes it
  structurally absent. In prod (Railway) this is one worker dyno; in dev, the
  dev server owns it.

### 7. Job granularity: one bad chunk fails a whole job/run — OPEN

- **Symptom:** 5 jobs terminally failed over a single chunk's bad `source_id`
  while their other 4+ chunks were perfectly ingestable.
- **Ideal fix:** per-chunk disposition at ingest — a deterministic chunk
  failure quarantines THAT chunk (persisted, named, loud) while the rest of
  the job ingests; the run completes with named gaps instead of failing whole.
  Re-collection then refills only the quarantined chunks.

### 8. `source_id` out-of-range refs (model contract, 5 threads) — OPEN investigation

- **Symptom:** on 5 specific threads, the model emits refs beyond the chunk's
  source map (`SRC0044` when only SRC001–SRC010 exist; also 4-digit forms) —
  deterministic across resubmission, survived the byte-for-byte prompt fix.
- **Hypothesis to verify:** these are split threads (`group_1/2/3`); the
  payload's post-context or ordinal hints leak a thread-global numbering wider
  than the group's own map, and the model follows it. Investigate the actual
  stored `llm_batch_job_items.request` for one failing chunk before theorizing
  further (ATTRIBUTE-before-ideate).

### 9. Cost report: in-process, wall-clock, and it died with the script — OPEN

- **Symptoms:** the killed seed task took its report with it; and the report's
  wall-clock `createdAt` deltas counted the NYC corpus, producing a WRONG
  "saturation is flat" conclusion (post-sequence truth: discovery fell
  407→~25 per 100 posts, re-mention rate 91–97% — deep saturation).
- **Ideal fix:** a standalone `cost-report` command (window + market-scoped,
  discovery attributed by post-sequence via first-discovering-post, not
  wall clock), rerunnable at any time; `seed-market` merely invokes it. The
  seed script also writes its own logfile — never again lose output to a
  killed wrapper's pipe buffer.

### 10. Ledger priced with wrong rates — FIXED

- **Finding (red-teamed, proven):** ledger token counts were accurate; the
  price sheet was ~5x low (real gemini-3.5-flash: $1.50/M in, $9.00/M out,
  batch half). Portal $232 vs report $64 reconciled to within 2% once rates
  (and plausibly batch cache-read billing) were corrected.
- **Fix (committed `f0702d06`):** official rates in `GEMINI_RATES` (dated,
  sourced); `thoughtsTokenCount` summed into output at both chokepoints;
  photo-vision (the one unledgered Gemini caller) now ledgered.
- **Residual ideals:** (a) BigQuery billing export — dataset
  `crave-467301:billing_export` created 2026-07-10; the export linkage itself
  is console-only (Billing → Billing export → BigQuery export → detailed
  usage cost → select dataset). Once flowing, reconcile dollars exactly.
  (b) Cloud Monitoring request-count reconciliation is proven to work from
  this machine (`serviceruntime.googleapis.com/api/request_count` per
  method/day) — fold a `--reconcile` flag into the cost-report command.
  (c) Batch cached-token billing (the residual ~$69) remains unproven —
  verify against the first billing-export data.

---

## Economics facts locked in by the audit (red-team verified)

- Full r/austinfood archive: 27,120 posts all-time; **15,652 in the 3y window**.
- Discovery is a clean power law, already deep in saturation at 1,200 posts
  (re-mention rate 91–97%). Projected unique place-backed restaurants for the
  full corpus: ~1,600 (log fit) / ~2,600 (power fit) / ~4,600 (flat-tail worst).
- **Full remaining Austin load ≈ $600 expected ($560–780 band), LLM-dominated**
  (~$37/1k posts batch; Places tail $25–160 at $0.044/new restaurant).
- Places economics inverted vs April because of the 2026-04-17 dedupe guard +
  per-SKU free tiers (post-2025-03 model); nothing is broken — Places now
  converges on unique restaurants while LLM scales with posts.
- Austin metro corpus so far: 2,416 place-backed locations (the 7,275 total is
  global incl. NYC); 1,060 discovered by this load's 1,317 posts.

## Recommended sequence (pre-full-load)

1. **Leases** (§2) + **single-writer poller gate** (§6) — kills the whole
   manual-reset class.
2. **Error taxonomy** (§4) + **cause-chain persistence** (§5) — transient
   outages stop terminally failing work; failures self-attribute.
3. **Per-chunk quarantine** (§7) — bad model output stops failing good chunks.
4. **Standalone market-scoped cost report** (§9) — the full load's numbers
   come from a rerunnable command, post-sequence-attributed.
5. `source_id` payload investigation (§8) — evidence-first, before any prompt edit.
6. Console step for billing export (owner, 1 click) + first-bill reconciliation (§10c).

Items 1–4 are each small, sharply-scoped, and remove entire failure classes;
none require re-collection or schema-destructive changes.
