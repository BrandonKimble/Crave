#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
log_file="$repo_root/plans/agent-log.md"
template_file="$repo_root/plans/agent-log.template.md"

if [[ ! -f "$template_file" ]]; then
  echo "Missing template: $template_file" >&2
  exit 1
fi

if [[ -f "$log_file" ]]; then
  exit 0
fi

mkdir -p "$repo_root/plans"
cp "$template_file" "$log_file"

