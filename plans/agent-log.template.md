# Agent Coordination Log (local-only)

This file is used to coordinate multiple Codex chat sessions working in the same checkout.

- Before you start a task, add an entry under **Entries** describing what you’re changing (task + files/areas).
- Update your entry if you start touching additional files/areas.
- Git hooks enforce that `plans/agent-log.md` contains at least one entry before committing.
- The log is reset automatically after a successful commit.

## Entries

<!-- Add bullets like:
- 2026-01-12 13:45 [task] Fix overlay sheet snapping. Files: apps/mobile/src/screens/Search/index.tsx, apps/mobile/src/overlays/BottomSheetWithFlashList.tsx. Notes: preserve existing diffs.
-->
