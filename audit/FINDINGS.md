# FINDINGS — evidence-backed, with ladder results

Format: F<N> | territory | file:line | failure scenario | ladder result | status (FIXED/ESCALATED/OWNER-DECISION) | proof

F1 | repo-root | .githooks/_ + scripts/agent-log/_ + scripts/install-agent-hooks.sh | Dead multi-agent coordination scheme: hooks requiring a claimed entry in plans/agent-log.md before commit. NEVER WIRED on this machine (core.hooksPath unset — verified; live hooks are lefthook's in .git/hooks). Ladder: compensated for multi-session collisions before the commit-straight-to-main + pathspec law existed (CLAUDE.md 2026-07-05); bedrock = that law + lefthook, which is the live shape. Banking/replay hunt: references exist ONLY within the cluster + .gitignore + two plans/ docs (protected, left in place); mtimes all Apr 17; opt-in installer never run. | FIXED (deleted 7 files + .gitignore line) | git rm + repo-wide grep in commit
F2 | repo-root | App.tsx, app.config.js (root) | NOT a defect — deliberate Expo monorepo shim (root re-export so Expo resolves the entry). IDEAL-VERIFIED: minimal honest shape for a workspace quirk, self-documenting. | - | read + apps/mobile/package.json main
F3 | repo-root | .knip.json + scripts/deps-check.sh | knip IS live (pre-commit deps-check lane, correctly gated on package-file changes; rg-missing falls back to grep rather than passing). IDEAL-VERIFIED. | - | read deps-check.sh
