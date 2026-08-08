-- THE PASS-RUN LEDGER (audit KL-A / §11 structural #1). The knowledge layer
-- versioned its OUTPUTS but never its RUNS, so any pass outcome producing no
-- row (empty residual, abstain, judge no-match, guard refusal) was
-- indistinguishable from "never ran" and re-paid forever — the satisfies
-- pass provably starved at the oldest 200 empty-residual concepts, and the
-- demand loop re-judged every unmatched term on every run. One row per
-- (pass, subject) at a prompt version, written UNCONDITIONALLY at the end of
-- processing, whatever the outcome. Light append-only table: no rewrite, no
-- parallel-worker hazard.
CREATE TABLE knowledge_pass_runs (
  pass          text        NOT NULL,
  subject_id    uuid        NOT NULL,
  prompt_version integer    NOT NULL,
  outcome       text        NOT NULL,
  detail        text,
  ran_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_pass_runs_pkey PRIMARY KEY (pass, subject_id, prompt_version)
);
-- Sweeps ask "which subjects lack a run at the current version" — the PK
-- serves that probe; ran_at supports cost-per-night reporting.
CREATE INDEX idx_knowledge_pass_runs_ran_at ON knowledge_pass_runs (pass, ran_at);
