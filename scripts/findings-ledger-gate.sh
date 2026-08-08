#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job no-bypass-search-runtime, step "Findings
#     ledger status gate", line 227: `bash scripts/findings-ledger-gate.sh`).
#     WIRED — corrected 2026-08-06 (F2141); this header used to read "NOT YET
#     WIRED", which was false and told readers the trailer discipline below was
#     unenforced.
#
# audit/FINDINGS.md STATUS IS A NORMALIZED, MACHINE-CHECKABLE TRAILER.
#
# WHY (2026-08-04 status-sweep + vocabulary normalization pass). The ledger's
# historical STATUS field lived at an inconsistent column position across 825
# rows (FIXED/EXECUTED/CLOSED-EXECUTED/VERIFIED/RECORDED/ESCALATED/OPEN/
# PROPOSED/"NOT FIXED"/DEFERRED/MOOT/CONFIRMED-STILL-LIVE/STOPPED/"-", plus
# free-text rows with no dedicated status field at all) — no mechanical rule
# could tell "closed" from "open" without a human reading the row. Every row
# now carries an APPENDED trailer of the shape:
#   | STATUS: <TOKEN> (was: <original text>) [| NEXT ACTION: <text>]
# The original fields are untouched (provenance); this trailer is the one
# place a script — or a reader — should look for "is this closed."
#
# THE VOCABULARY (see the legend at the top of audit/FINDINGS.md):
#   TERMINAL (closed, nothing owed): FIXED, DELETED, OWNER-DECISION, MOOT
#   OPEN (something still owed):     OPEN, CONFIRMED-STILL-LIVE, ESCALATED,
#                                     PARTIAL, NEEDS-TRIAGE
#
# THIS GATE ENFORCES:
#   (a) every row's STATUS token is one of the nine above — a bogus token
#       fails loudly, naming the row's F-number and the bad value.
#   (b) every row whose STATUS is in the OPEN bucket carries a NEXT ACTION
#       segment with non-trivial content (more than a few characters) —
#       an OPEN row with nothing owed stated is exactly the silent-debt
#       failure mode this ledger exists to prevent.
#
# MUTATION PROOF: corrupt one real row's `STATUS: <TOKEN>` to a bogus token
# (e.g. `STATUS: KINDA-DONE`) and re-run — the gate must exit 1 and name that
# row. If it does not, the parse below has lost the trailer and every
# assertion here is vacuous.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# F8900 (2026-08-07): the row parse and the NEXT-ACTION extraction both ended in
# `|| true`. For the extraction that is deliberate and documented below (grep's
# exit 1 must not kill the report) — but `|| true` cannot tell exit 1 from exit
# 127, so on a machine without grep the parse yielded zero rows. That trips the
# floor, so this gate fails closed today; it is migrated so the guarantee comes
# from the vocabulary rather than from the direction one comparison points.
source "$ROOT_DIR/scripts/lib/gate-runner.sh"
gate_init findings-ledger-gate accumulate
gate_require_tool grep sed

LEDGER="audit/FINDINGS.md"

if [[ ! -f "$LEDGER" ]]; then
  gate_fail_hard "$LEDGER not found."
fi

TERMINAL_STATUSES="FIXED DELETED OWNER-DECISION MOOT"
OPEN_STATUSES="OPEN CONFIRMED-STILL-LIVE ESCALATED PARTIAL NEEDS-TRIAGE"
ALL_STATUSES="$TERMINAL_STATUSES $OPEN_STATUSES"

# Data rows only: a line beginning with an identifier (F<N>, F<N>-F<M>,
# F<N>/F<M>, D<N>-P<N>, ...) followed by " | ". Same shape used across the
# other ledger gates in this repo.
mapfile_lines=()
while IFS= read -r line; do
  mapfile_lines+=("$line")
done < <(gate_grep_extract "$(cat "$LEDGER")" -nE '^[A-Za-z0-9_./-]+ \| ')

row_count="${#mapfile_lines[@]}"

# NO-EMPTY-LOOP GREEN. If the row pattern stops matching (a reformat, a
# renamed prefix), every check below would run over zero rows and pass
# vacuously — exactly the disease this audit exists to kill. The ledger has
# 825+ data rows; anything under 800 means the parse, not the ledger, broke.
gate_require_floor "data rows from $LEDGER (every check below would be vacuously green)" "$row_count" 800

bogus_status=()
missing_status=()
missing_next_action=()

for entry in "${mapfile_lines[@]}"; do
  line_no="${entry%%:*}"
  content="${entry#*:}"

  fid="$(printf '%s' "$content" | sed -n 's/^\([A-Za-z0-9_./-]*\) .*/\1/p')"

  # Extract the STATUS token: last "STATUS: <TOKEN>" occurrence on the line
  # (rows quoting other docs' prose, e.g. "BUILD STATUS: COMPLETE", can
  # contain an earlier false match inside a quoted field — the trailer this
  # gate writes is always the LAST one on the line).
  # F8900 (2026-08-07): this was a bare `grep -oE … ` inside `set -e`. A row
  # whose STATUS trailer does not match (e.g. `STATUS: (see next row after fix)`)
  # made grep exit 1, which KILLED THE SCRIPT MID-LOOP — the gate exited 1 having
  # printed NOTHING, indistinguishable from a crash and naming no row. That is
  # the same disease as the swallow, one polarity over: a gate that cannot say
  # why it failed. gate_grep_extract yields empty on exit 1 (which then lands in
  # the bogus-status report below, naming the row) and FAILS on any other status.
  status_token="$(gate_grep_extract "$content" -oE 'STATUS: [A-Z][A-Z-]*' | tail -1 | sed -E 's/^STATUS: //')"

  if [[ -z "$status_token" ]]; then
    missing_status+=("line ${line_no} (${fid}): no 'STATUS: <TOKEN>' trailer found")
    continue
  fi

  if [[ " $ALL_STATUSES " != *" $status_token "* ]]; then
    # NAME THE LIKELY INTENT, don't just reject. CLOSED/DONE/RESOLVED kept
    # recurring from concurrent agents who reached for the natural word and
    # turned this CI-wired gate red for everyone. A guard that says only
    # "wrong" makes the next writer guess; one that says "you meant FIXED"
    # is self-correcting.
    hint=""
    case "$status_token" in
      CLOSED|DONE|RESOLVED|COMPLETE|EXECUTED|VERIFIED) hint=" — did you mean FIXED?" ;;
      PARTIALLY|IN-PROGRESS) hint=" — did you mean PARTIAL?" ;;
      WONTFIX|SKIPPED|DEFERRED|N/A) hint=" — did you mean MOOT (gone/not applicable) or OWNER-DECISION?" ;;
      FALSE-CLAIM|INVALID|STALE) hint=" — did you mean MOOT?" ;;
      ESCALATION|OWNER|BLOCKED) hint=" — did you mean ESCALATED?" ;;
    esac
    bogus_status+=("line ${line_no} (${fid}): STATUS: ${status_token} — not in vocabulary {${ALL_STATUSES}}${hint}")
    continue
  fi

  if [[ " $OPEN_STATUSES " == *" $status_token "* ]]; then
    # Require a NEXT ACTION segment with non-trivial content after the
    # matching trailer. Take everything after the LAST "NEXT ACTION:" and
    # strip whitespace; require more than a few characters.
    # `|| true` IS LOAD-BEARING. Under `set -euo pipefail` a non-matching grep
    # exits 1, fails the pipeline, and kills this script BEFORE the missing-
    # NEXT-ACTION report below can name the offending row — so the gate exited
    # 1 with ZERO output, indistinguishable from a crash. A gate that cannot
    # say why it failed is the same disease as one that cannot fail at all.
    # The tolerant form also accepts a parenthetical before the colon, e.g.
    # `NEXT ACTION (question/options, spend semantics): ...`.
    next_action="$(gate_grep_extract "$content" -oE 'NEXT ACTION[^:]*:.*$' | tail -1 | sed -E 's/^NEXT ACTION[^:]*: ?//')"
    next_action_trimmed="$(printf '%s' "$next_action" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    if [[ -z "$next_action_trimmed" || "${#next_action_trimmed}" -lt 8 ]]; then
      missing_next_action+=("line ${line_no} (${fid}): STATUS: ${status_token} is OPEN-bucket but carries no discernible NEXT ACTION")
    fi
  fi
done

failed=0

if [[ "${#missing_status[@]}" -ne 0 ]]; then
  echo "findings-ledger-gate: every data row must carry a 'STATUS: <TOKEN>' trailer. Missing:" >&2
  printf '  %s\n' "${missing_status[@]}" >&2
  failed=1
fi

if [[ "${#bogus_status[@]}" -ne 0 ]]; then
  echo "findings-ledger-gate: STATUS token must be one of the normalized vocabulary. Bogus:" >&2
  printf '  %s\n' "${bogus_status[@]}" >&2
  failed=1
fi

if [[ "${#missing_next_action[@]}" -ne 0 ]]; then
  echo "findings-ledger-gate: an OPEN-bucket row without a NEXT ACTION is silent debt — the whole point of this ledger is that nothing owed goes unstated. Offending rows:" >&2
  printf '  %s\n' "${missing_next_action[@]}" >&2
  failed=1
fi

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "findings-ledger-gate: pass (${row_count} data rows, all carry a valid STATUS trailer, all OPEN-bucket rows carry a NEXT ACTION)."
