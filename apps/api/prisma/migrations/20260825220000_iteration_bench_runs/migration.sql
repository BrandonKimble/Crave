-- THE ITERATION BENCH (plans/iteration-bench.md): one durable row per
-- prompt-iteration run — the state machine that replaces the runbook. New
-- table, no rewrite; no parallel-worker guard needed (AUTHORING.md §1).

CREATE TABLE iteration_runs (
  run_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus            text[] NOT NULL,
  prompt_kind       varchar(64) NOT NULL DEFAULT 'collection_system',
  candidate_version integer NOT NULL,
  phase             varchar(32) NOT NULL DEFAULT 'inventory',
  -- Per-phase artifacts: inventory list, proof reports, approval hash,
  -- campaign id, replay actuals, diff artifact path, review closure.
  phase_state       jsonb NOT NULL DEFAULT '{}',
  status            varchar(16) NOT NULL DEFAULT 'active',
  created_at        timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One ACTIVE run per prompt kind: two concurrent iterations of the same
-- prompt would race the same corpus and confound each other's diffs.
CREATE UNIQUE INDEX uq_iteration_runs_active_kind
  ON iteration_runs (prompt_kind) WHERE status = 'active';
