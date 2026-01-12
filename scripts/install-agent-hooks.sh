#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"

chmod +x "$repo_root/.githooks/pre-commit" "$repo_root/.githooks/post-commit"
chmod +x "$repo_root/scripts/agent-log/ensure-agent-log.sh" "$repo_root/scripts/agent-log/reset-agent-log.sh"

git config core.hooksPath .githooks

echo "Installed git hooks: core.hooksPath=.githooks"
echo "Agent log path: plans/agent-log.md (ignored by git)"

