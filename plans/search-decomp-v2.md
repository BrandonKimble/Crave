# SearchScreen Structural Decomposition Plan (Stall-First v2)

Last updated: 2026-02-16  
Owner: Codex + Brandon  
Primary objective: get search JS stalls consistently below `50ms` with UX parity.

## 1) Reality Check

The current path has improved attribution and moved some first-stall windows from ~`260-300ms` down toward ~`160ms`, but we are still failing the target because catastrophic windows remain in:

- `marker_reveal_state`
- `results_hydration_commit`

Key point:
- Most measured runtime helper spans are sub-ms to low-ms, while frame stalls are hundreds of ms.
- That means the dominant cost is render/commit overlap and large subtree invalidation, not individual helper logic.

Conclusion:
- Further timing/scheduling-only tweaks have diminishing returns.
- We need structural render isolation and commit-size reduction.

## 2) What Changes in This Plan

Old emphasis:
- Mostly timing and lane tuning around existing architecture.

New emphasis:
- Commit-cost reduction first.
- Render-boundary isolation first.
- Strict keep/revert gates using matched harness runs.

Do not treat Android new architecture enablement as the primary fix for current iOS harness bottlenecks. It is a separate platform stream.

## 3) Program Success Criteria

### 3.1 Final target
- All JS windows during shortcut run satisfy `stallLongestMs < 50ms` in matched runs.

### 3.2 Interim gates (required progression)
1. Gate A: first `>50ms` stall p95 `<150ms` over matched runs.
2. Gate B: worst-stall p95 `<120ms` over matched runs.
3. Gate C: no catastrophic (`>300ms`) windows.
4. Gate D: final target `<50ms` for all windows.

### 3.3 Sampling policy
- Dev loop keep/revert: `runs=3` (matched signature).
- Promotion decision: `runs=6` minimum.
- No “keep” decisions from single-run wins.

## 4) Non-Negotiable Constraints

- Preserve UX parity: pins/dots/list/header/shortcut behavior must remain equivalent unless explicitly approved.
- No dual-control ownership: if a concern moves to a new owner, old path is deleted in same slice.
- No fallback behavior masking regressions.

## 5) Workstreams (Ordered by Leverage)

## 5.1 Commit Attribution Upgrade (before major edits)

Goal:
- Attribute stall windows to React commit boundaries by subtree, not only runtime spans.

Changes:
- Add profiling boundaries around:
  - `SearchMapTree`
  - `SearchResultsSheetTree`
  - `SearchOverlayChrome`
  - `SearchSuggestionSurface`
- Emit per-commit duration + operation phase labels (`h1/h2/h3/h4`) into harness channel.

Exit gate:
- For each `stallLongestMs > 50`, we can identify the top subtree commit contributor in that window.

## 5.2 Render-Boundary Isolation (core path)

Goal:
- Prevent one state update from invalidating map + list + chrome together.

Slices:
1. Extract `SearchMapSubtree` ownership.
2. Extract `SearchResultsSubtree` ownership.
3. Extract `SearchOverlayChrome/SuggestionsSubtree` ownership.
4. Keep coordinator thin; no heavy derivation in root.

Rules:
- Subtree props must be identity-stable.
- Root should pass primitives and stable refs only.
- Shared mutable/high-frequency state goes through runtime owner/ref store, not root React state.

Exit gate per slice:
- React commit traces confirm sibling subtrees do not re-render on isolated updates.

## 5.3 State Ownership + Subscription Hygiene

Goal:
- Remove high-fanout root subscriptions and state churn.

Actions:
- Consolidate store selectors where feasible.
- Move frame-rate and gesture-rate values to refs/shared values.
- Keep root state limited to coarse session identity.

Exit gate:
- Root render count materially reduced during search run.

## 5.4 Map Pipeline Stability

Goal:
- Stop marker/dot/pin key churn from causing cross-frame heavy commits.

Actions:
- Make marker topology keys change only on semantic dataset changes.
- Keep staged map publish internal to map owner; avoid root state flips for intermediate map phases.
- Ensure visual-ready signaling does not require extra root render waves.

Exit gate:
- `marker_reveal_state` no longer dominates stage attribution in matched runs.

## 5.5 Hydration/Results Finalization Isolation

Goal:
- Prevent hydration finalize from overlapping with map-heavy commit windows.

Actions:
- Keep phase-A minimal and deterministic.
- Delay non-critical finalization work until no map-heavy commit is in-flight.
- Apply one-heavy-domain-per-frame admission where effective, but only after ownership split.

Exit gate:
- `results_hydration_commit` catastrophic windows eliminated.

## 6) Execution Protocol

For each slice:
1. Implement minimal structural change.
2. Run:
   - `npx eslint <touched files>`
   - `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`
3. Run matched harness (`runs=3`).
4. Compare against previous kept candidate.
5. Keep only if median improves or at least no-regression with better attribution clarity.
6. Revert otherwise.

Promotion run:
- `runs=6`, matched signature.

## 7) Immediate Next 3 Slices

### Slice S1: Commit attribution by subtree
Files:
- `apps/mobile/src/screens/Search/index.tsx`
- `apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts`

Deliverable:
- Per-window mapping: stall window -> dominant subtree commit.

### Slice S2: Extract Results subtree first
Reason:
- Results and hydration commits are currently a dominant catastrophic source.

Files (expected):
- `apps/mobile/src/screens/Search/subtrees/SearchResultsSubtree.tsx`
- `apps/mobile/src/screens/Search/index.tsx`
- `apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`

Exit:
- Results updates do not re-render map subtree.

### Slice S3: Extract Map subtree second
Reason:
- Map reveal windows remain dominant and should no longer share root commit with list/chrome.

Files (expected):
- `apps/mobile/src/screens/Search/subtrees/SearchMapSubtree.tsx`
- `apps/mobile/src/screens/Search/index.tsx`
- `apps/mobile/src/screens/Search/components/search-map.tsx`

Exit:
- Map stage commits isolated from results/chrome commits.

## 8) What We Explicitly Avoid

- More one-off delay knobs as primary strategy.
- Single-run keep decisions.
- Adding fallback behavior that hides data/UX regressions.
- Treating Fabric enablement as a substitute for decomposition on current target platform.

## 9) Validation Commands

Always run:
- `npx eslint <touched files>`
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

When contracts touched:
- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`
- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh`

Perf loop:
- `EXPO_PUBLIC_PERF_HARNESS_RUNS=3 bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-loop.sh <tag>`
- `bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-loop-report.sh <log>`

## 10) Definition of Done

Done means all are true:
1. Matched harness runs show no JS window above `50ms`.
2. Stage attribution no longer dominated by map/hydration catastrophic windows.
3. UX parity checks pass (`pins=30`, `dots=80`, list/pagination behavior intact).
4. Ownership is clean (no dual control paths left behind).
