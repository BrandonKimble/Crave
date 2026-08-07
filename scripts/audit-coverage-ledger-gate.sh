#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job no-bypass-search-runtime).
#
# PATH IS THE PRIMARY KEY OF audit/COVERAGE.md.
#
# WHY (F1665, 2026-08-04). The ledger held 4,318 data rows for 4,297 distinct
# paths — 21 files counted twice, and the duplicate rows DISAGREED with each
# other: the two `scripts/app-route-runtime-delete-gate.sh` rows carried
# different findings cells, so a reader got a different answer depending on
# which row they hit, and the 2026-08-03 git-provenance reconciler happily
# processed both. Everything the header promises rests on path being a key:
# "seeded from git ls-files", a per-file sha that is "a fact again", and a
# two-clean-passes finale "measured against it". A denominator you can inflate
# by pasting a row is not a denominator.
#
# The 21 pairs were merged by hand-checked script under F1665 (each pair
# reconciled to the strictly more informative status/findings, never the
# emptier one). This gate is what stops them coming back.
#
# MUTATION PROOF: duplicate any data row in audit/COVERAGE.md and re-run — the
# gate must exit 1 and name the path. If it does not, the parse below has lost
# the table and every assertion here is vacuous.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LEDGER="audit/COVERAGE.md"

if [[ ! -f "$LEDGER" ]]; then
  echo "audit-coverage-ledger-gate: $LEDGER not found." >&2
  exit 1
fi

# Data rows only: a leading '| ', not the header and not the '---' separator.
#
# F5101: this used to require NF == 8 — exactly six cells. A row whose FINDINGS
# text contained a pipe had NF > 8 and was SILENTLY SKIPPED: the count dropped
# while the gate printed "pass", and ~29 paths were exempt from the uniqueness
# guarantee this gate exists to give. The path is $2, so pipes in later cells
# cannot affect the key — the NF condition bought nothing and cost coverage.
paths="$(
  awk -F'|' '
    /^\| / && NF >= 8 {
      p = $2
      gsub(/^[ \t]+|[ \t]+$/, "", p)
      if (p == "path") next
      if (p ~ /^-+$/) next
      print p
    }
  ' "$LEDGER"
)"

row_count="$(printf '%s\n' "$paths" | grep -c . || true)"

# NO-EMPTY-LOOP GREEN. If the parse stops matching the table (a format change,
# a column added), `sort | uniq -d` over nothing is silently green forever —
# the exact disease this audit exists to kill. The ledger has thousands of
# rows; anything under a thousand means the parse, not the ledger, changed.
if [[ "$row_count" -lt 1000 ]]; then
  echo "audit-coverage-ledger-gate: parsed only ${row_count} data rows from $LEDGER — the parse has lost the table, so the uniqueness check below would be vacuously green." >&2
  exit 1
fi

duplicates="$(printf '%s\n' "$paths" | sort | uniq -d)"

if [[ -n "$duplicates" ]]; then
  dup_count="$(printf '%s\n' "$duplicates" | grep -c . || true)"
  echo "audit-coverage-ledger-gate: path is the PRIMARY KEY of $LEDGER, but ${dup_count} path(s) appear on more than one row. Duplicate rows disagree with each other and inflate the denominator every finale is measured against. Merge each pair into the strictly more informative row (never the emptier one):" >&2
  printf '  %s\n' $duplicates >&2
  exit 1
fi

echo "audit-coverage-ledger-gate: pass (${row_count} data rows, ${row_count} distinct paths)."
