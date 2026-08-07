#!/usr/bin/env bash
# @script-class: gate
# @run-by: lefthook.yml pre-commit (job lane-pathspec) — opt-in per shell via
#     the LANE_PATHS env var; unset means the hook passes silently.
#
# THE CONCURRENT-LANE COMMIT FENCE (F4102 / D83).
#
# Five times in one exercise, a lane's `git commit` swept in files belonging to
# a concurrently-working lane — staged deletions riding a pre-existing dirty
# index, or another lane's working-tree edits to a shared ledger absorbed by a
# pathspec commit. The fifth instance committed deletions WITHOUT the caller
# edits that make them compile: a commit on main that did not typecheck
# standalone. The rule ("review `git diff --cached --name-only` before every
# commit") was written in three places by then. A rule a lane can still forget
# is a convention, not a mechanism — this exercise's own law, applied to its
# own process.
#
# THE MECHANISM. A lane exports LANE_PATHS before committing:
#
#     export LANE_PATHS='audit/FINDINGS.md:audit/COVERAGE.md:apps/api/src/modules/polls/**'
#
# and this hook REFUSES any commit whose staged file set is not a subset of
# those patterns. Unset LANE_PATHS = hook passes silently (a human committing
# normally is unaffected; the fence is for orchestrated lanes, whose briefs
# set it). Colon-separated; bash extglob-style globs matched per path segment
# via case patterns, `**` treated as "any suffix".
#
# WHAT THIS CANNOT DO: it cannot know which lane a file BELONGS to — only what
# this lane DECLARED. A lane that declares too much still sweeps. The fence
# turns "forgot to look" into "had to lie", which is the strongest available
# guarantee without per-lane worktrees.
set -euo pipefail

if [[ -z "${LANE_PATHS:-}" ]]; then
  # F6621: say so, so a lane's transcript can never mistake an unguarded commit
  # (LANE_PATHS forgotten) for a fence that ran and passed. A bare green tick was
  # indistinguishable from a real subset-check.
  echo "lane-pathspec: SKIPPED (LANE_PATHS unset — fence not armed for this commit)"
  exit 0
fi

staged="$(git diff --cached --name-only)"
if [[ -z "$staged" ]]; then
  exit 0
fi

IFS=':' read -r -a patterns <<< "$LANE_PATHS"

violations=()
while IFS= read -r file; do
  ok=0
  for pat in "${patterns[@]}"; do
    [[ -z "$pat" ]] && continue
    # `**` -> match any suffix; plain pattern -> exact or glob match.
    case_pat="${pat//\*\*/§}"
    if [[ "$case_pat" == *"§"* ]]; then
      prefix="${case_pat%%§*}"
      if [[ "$file" == "$prefix"* ]]; then ok=1; break; fi
    else
      # shellcheck disable=SC2254
      case "$file" in
        $pat) ok=1; break ;;
      esac
    fi
  done
  if [[ "$ok" -eq 0 ]]; then
    violations+=("$file")
  fi
done <<< "$staged"

if [[ ${#violations[@]} -gt 0 ]]; then
  echo "lane-pathspec FENCE: the index contains ${#violations[@]} staged file(s) OUTSIDE this lane's declared LANE_PATHS:" >&2
  for v in "${violations[@]}"; do
    echo "  - $v" >&2
  done
  echo "Another lane's work is about to ride into your commit (this has happened" >&2
  echo "five times; once the swept commit did not typecheck). Unstage what is not" >&2
  echo "yours: git restore --staged <path> — the working tree is left intact." >&2
  exit 1
fi
exit 0
