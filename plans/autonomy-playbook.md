# Autonomy Playbook (Thin)

## Mission

Deliver each refactor slice to promotion quality with minimal process overhead.

## Core Loop

1. Review the previously completed slice against plan exit gate + delete gate.
2. If anything deviates, fix it first.
3. Run contextual validation for touched scope.
4. Re-review the slice.
5. If promotable, move to the next slice; if not, repeat fix + validate.
6. For the active slice, continue this loop until promotion-ready.

## Execution Rules

- One cluster at a time.
- Keep behavior parity with existing UX.
- Prefer subtraction and ownership cutover over additive compatibility branches.
- Use judgment; skip steps that cannot change a decision or reduce risk.
- No ceremony requirements for update style.

## Validation Matrix

> **Correction 2026-08-03 (truth audit):** every script path below is wrong,
> and three of the four scripts do not exist. The repo root is
> `/Users/brandonkimble/Crave/Crave` — `/Users/brandonkimble/crave-search`
> does not exist on this machine. Only `scripts/no-bypass-search-runtime.sh`
> is real (plus `scripts/search-runtime-root-ownership-gate.sh`, unlisted
> here). `search-runtime-natural-cutover-contract.sh`,
> `search-runtime-s4-mode-cutover-contract.sh`, and
> `perf-shortcut-local-ci.sh` are all absent from `scripts/` — the natural
> cutover / S4 mode-cutover contracts they gated died with the search-ladder
> deletion (2026-08-02; pooled gate + gazetteer Understand are canonical).
> The standing gate today is CI (`.github/workflows/ci.yml`), which is green
> and GATING, invariants job included.

Always:

- relevant lint/tests for touched files
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

Conditional:

- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh` when natural cutover paths/contracts are touched
- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh` when mode-cutover paths/contracts are touched
- `bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh promote-slice <SLICE_ID>` for perf-bearing runtime ownership slices

Baseline refresh only when settle policy or harness signature changes:

- `bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh record-baseline`

## Promotion Criteria

A slice is promotion-ready only when:

- plan exit gate is satisfied,
- delete gate is satisfied,
- required contextual checks pass,
- no unresolved deviations remain after re-review.

## Stop Conditions

Stop only when user action is required (credentials, environment access, device/manual step, or plan-level decision ambiguity).
