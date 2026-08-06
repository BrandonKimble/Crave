#!/usr/bin/env bash
# @script-class: gate
# @run-by: package.json.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

changed_files="$(git diff --cached --name-only)"

needs_check=0
if command -v rg >/dev/null 2>&1; then
  if echo "$changed_files" | rg -q '^(package\.json|yarn\.lock|apps/[^/]+/package\.json|packages/[^/]+/package\.json)$'; then
    needs_check=1
  fi
else
  if echo "$changed_files" | grep -Eq '^(package\.json|yarn\.lock|apps/[^/]+/package\.json|packages/[^/]+/package\.json)$'; then
    needs_check=1
  fi
fi

if [[ "$needs_check" != "1" ]]; then
  exit 0
fi

echo "deps-check: running knip (dependency hygiene)…"
knip_bin="$REPO_ROOT/node_modules/.bin/knip"
if [[ ! -x "$knip_bin" ]]; then
  echo "deps-check: knip is not installed. Run 'yarn install'." >&2
  exit 1
fi

# DISCOVER THE WORKSPACES — DO NOT HAND-WRITE THEM (F2060/F2501).
#
# This used to be `--workspace 'apps/*' --workspace 'packages/*'`. The ROOT
# workspace is neither, so the only dependency gate this repo has could not see
# the root's dependencies or any of the ~57 files in `scripts/` — which is
# exactly how the dead `lint-staged` devDependency (F1992) survived a gate that
# fired on every package.json change, and how `pixelmatch` (referenced by zero
# files) and two `@commitlint/*` packages (no config, no commit-msg hook) sat
# installed for months. A gate that structurally cannot fail on one of its
# surfaces is an always-green instrument for that surface.
#
# The denominator is now a FACT about the repo: every package.json git tracks.
# A future `tools/*` workspace is covered the day it is committed, with no edit
# here — the same discovery shape scripts/check-railway-manifests.mjs uses.
workspaces=()
while IFS= read -r manifest; do
  [[ -z "$manifest" ]] && continue
  dir="$(dirname "$manifest")"
  workspaces+=(--workspace "$dir")
done < <(git ls-files '*package.json' | grep -v '/node_modules/')

# ZERO RESOLVED WORKSPACES IS A FAILURE, NEVER A PASS. A discovery that finds
# nothing would otherwise run knip over an empty set, exit 0, and report the
# dependency surface clean while covering none of it.
if [[ ${#workspaces[@]} -eq 0 ]]; then
  echo "deps-check: FAILED — resolved ZERO workspaces from \`git ls-files '*package.json'\`." >&2
  echo "  Either the manifests moved or this discovery is broken; both mean this gate covers nothing." >&2
  exit 1
fi

echo "deps-check: auditing $(( ${#workspaces[@]} / 2 )) workspace(s)."
"$knip_bin" \
  "${workspaces[@]}" \
  --dependencies \
  --no-progress \
  --reporter compact
