# Results Sheet + Cross-Tab Search Session Plan

## What You Were Asking For (Exact Product Contract)

### Close behavior contract (search results -> contextual collapsed handoff)

1. Keep results content unchanged while the sheet is moving downward.
2. At the instant the sheet reaches `collapsed`, switch to the correct persistent collapsed header for the current root context (polls, favorites/bookmarks, profile, etc.).
3. Do not add a second `collapsed -> hidden` dismissal leg.
4. Nav transition should feel like part of the same handoff, not a separate delayed phase.

### Cross-tab behavior contract (global search from non-search tabs)

1. If search starts from `favorites`/`polls`/`profile`, remember that tab and its snap.
2. Show search results as usual while search is active.
3. On close, return to the exact origin tab and snap state that existed before search launch.
4. Nav bar should still run the same in/out transition pattern during search enter/exit.
5. Closing search should not force users back to `search` root unless search truly originated there.

In short: search is a temporary session layered over the current tab context, not a permanent root switch; handoff target is contextual, not always polls.

## Why The Earlier Attempt Became Janky

1. Close/handoff behavior was spread across many handlers instead of one orchestrator.
2. Snap processing had multiple pathways, so commit logic could be bypassed.
3. Some paths still forced `hidden`, creating a second visual leg after `collapsed`.
4. Poll/nav restore was triggered from multiple places, causing races and timing churn.
5. Motion tuning and correctness rewiring were mixed together, obscuring root cause.
6. Global tab-origin restoration was not modeled, so search launch implicitly mutated ownership (`setOverlay('search')` root reset) and lost origin context.

## Current Architecture: What Is Good vs What Is Hurting Us

### What is good and should be reused

1. `BottomSheetWithFlashList` already gives a reliable snap model (`onSnapStart`, settled `onSnapChange`).
2. `overlayStore` already models root/stack overlay ownership.
3. `useOverlaySheetPositionStore` already persists shared tab snap preference.
4. `createOverlayRegistry` and panel specs already provide a central overlay rendering surface.
5. Existing nav hide/show animation and cutout infrastructure is usable once transition ownership is centralized.

### What is hurting us now

1. Search launch paths repeatedly call `ensureSearchOverlay()`, which force-resets overlay root to `search`.
2. Search clear/close currently always requests docked polls restore, even when search began from another tab.
3. No single source of truth exists for “search origin context” and “search exit target context”.
4. `activeOverlayKey` prioritization is rendering-driven, but orchestration decisions are state-spread and timing-sensitive.

## Option Analysis (What We Considered)

### Option A: Keep current structure and patch each close/launch path

Pros:

1. Lowest immediate code churn.
2. Fast to attempt incremental fixes.

Cons:

1. Reintroduces race bugs quickly.
2. High regression risk as more entrypoints are added.
3. Hard to reason about ownership and restoration.

Decision: reject.

### Option B: Store just `previousOverlay`/snap and restore on close

Pros:

1. Smaller than full coordinator.
2. Better than ad-hoc patches.

Cons:

1. Insufficient for nested transitions (restaurant/profile-on-top, suggestion flow, tab switch mid-search).
2. Still leaves close timing ownership fragmented.

Decision: reject.

### Option C (recommended): Introduce explicit Search Session Coordinator state machine

Pros:

1. Single owner for search launch, active, close, and restore.
2. Solves close-handoff correctness and cross-tab restoration in the same model.
3. Creates a stable surface for nav/cutout timing rules.
4. Removes duplicated restore triggers and implicit root mutations.

Cons:

1. Medium refactor in `Search/index.tsx` and related hooks.
2. Requires deliberate migration of all launch/close entrypoints.

Decision: choose Option C.

## Recommended Architecture

### 1) Add explicit search session context

Create `SearchSessionContext` captured only once at search start:

- `originRootOverlay: OverlayKey`
- `originActiveOverlay: OverlayKey`
- `originOverlayStack: OverlayKey[]`
- `originTabSnap: OverlaySheetSnap | null`
- `originPollsDockedState: { dismissed: boolean; snap: OverlaySheetSnap } | null`
- `launchSource: 'manual' | 'shortcut' | 'autocomplete' | 'recent'`
- `sessionId: number`

Contract:

1. Captured at first transition from non-active-search to active-search.
2. Frozen for the session (no mid-session overwrite).
3. Consumed exactly once at close commit.

### 2) Centralize lifecycle in a coordinator

Add a dedicated orchestrator/hook:

- `requestSearchLaunch(...)`
- `requestSearchClose(reason)`
- `onResultsSnapChanged(snap)`
- `commitCloseAtCollapsed()`
- `restoreOriginOverlayContext()`

State machine:

1. `idle`
2. `launching`
3. `active`
4. `closing_to_collapsed`
5. `restoring_origin`
6. back to `idle`

Rules:

1. Only coordinator can mutate search session active/close flags.
2. Only coordinator commits close at `collapsed`.
3. No direct `clearSearchState()` from UI handlers.

### 3) Separate visual handoff from logical cleanup

At `collapsed` during close:

1. Swap overlay content target immediately to `resolveCollapsedHost(originContext)`:
   - `search` origin -> docked polls collapsed host
   - `bookmarks` origin -> bookmarks collapsed host
   - `profile` origin -> profile collapsed host
   - `polls` origin -> polls collapsed host
2. Keep nav/cutout timing in same transaction window.
3. Clear search data/session in same commit block.
4. Never force `hidden` in this path.

### 4) Restore origin context, not hard-coded search home

Current behavior forces search-root restoration. Replace with:

1. If origin root was `bookmarks`, restore `bookmarks` and its snap.
2. If origin root was `profile`, restore `profile` and its snap.
3. If origin root was `polls`, restore `polls` and its snap mode.
4. If origin root was `search`, restore docked polls/search contract.

### 4.1) Collapsed Host Resolver (explicit)

Define one resolver function so handoff destination is deterministic and shared:

- `resolveCollapsedHost(originRootOverlay, originActiveOverlay, originOverlayStack)`

Contract:
1. Returns the exact collapsed host overlay key + snap for post-search handoff.
2. Never defaults to polls unless origin context requires it.
3. Used by both close and cancel/restore paths to keep behavior identical.

### 5) Centralize nav/cutout transition ownership

Introduce a single `navChromeTransitionState` derived from coordinator state:

- `visible`
- `hiding_for_search`
- `hidden_for_search`
- `showing_after_restore`

Rules:

1. Nav opacity stays constant (as requested), only translate changes.
2. Cutout follows the same progress source as nav position.
3. No independent nav restore triggers outside coordinator.

### 5.1) Shared nav behavior parity (hard requirement)

Treat current search-page nav behavior as the canonical motion contract and reuse it globally:

1. Launching search from any tab uses the same nav slide-out behavior as search root.
2. Closing search back to any tab uses the same nav slide-in behavior timing/curve.
3. Nav/cutout timing source is identical regardless of whether collapsed host is polls, bookmarks, or profile.
4. No per-tab nav logic forks beyond host selection.

### 6) Restrict root overlay mutations

`ensureSearchOverlay()` should no longer hard-reset root overlay blindly.
Replace with coordinator-aware launch intent:

1. Preserve origin in session context.
2. Mark search surface active without destroying root ownership metadata.

## Implementation Structure (Refactor Plan)

Keep behavior work scoped but organized:

1. `apps/mobile/src/screens/Search/session/use-search-session-coordinator.ts`
2. `apps/mobile/src/screens/Search/session/use-results-close-handoff.ts`
3. `apps/mobile/src/screens/Search/session/use-search-origin-context.ts`
4. `apps/mobile/src/screens/Search/session/search-session-types.ts`
5. `apps/mobile/src/screens/Search/session/nav-chrome-transition.ts`

`Search/index.tsx` keeps orchestration wiring, but imperative transition logic moves into these modules.

## Edge Cases We Must Handle Explicitly

1. Search launched from favorites at `middle`, close during loading -> return to favorites `middle`.
2. Search launched from profile at `expanded`, close after network error -> return to profile `expanded`.
3. Shortcut launched from docked polls collapsed -> handoff still atomic at `collapsed`.
4. User starts close then re-expands before `collapsed` -> cancel pending close.
5. Restaurant overlay open during clear path -> preserve existing restaurant-dismiss semantics.
6. User switches tab while search active -> not applicable in intended UX (nav hidden while active search), so origin remains locked to launch tab/session.
7. Polls hidden via gesture before search launch -> on search close, restore polls as `collapsed` and visible (do not restore hidden).
8. Repeated rapid shortcut taps -> session token prevents stale commits.

## Product Decisions Locked

1. Active search keeps nav hidden and prevents tab switching, matching current search-page behavior.
2. Origin context is captured once at search launch and remains fixed for that session.
3. If origin polls was hidden/dismissed before launch, close restoration still returns to `collapsed` visible state.

## Rollout Phases (No Patch-Stitching)

1. Instrumentation first
   - Add temporary dev logs for coordinator state transitions + snap events + origin restore commits.
2. Coordinator scaffold
   - Introduce session context + state machine with no visual behavior change yet.
3. Route all launch paths
   - Submit, shortcut buttons, autocomplete, recent/recently viewed into `requestSearchLaunch`.
4. Route all close paths
   - Header close, clear, back-close into `requestSearchClose`.
5. Atomic collapsed commit
   - Implement single `collapsed` commit transaction and remove hidden leg for this flow.
6. Origin restoration
   - Restore tab + snap from captured context.
7. Nav/cutout coupling
   - Bind nav translation and cutout to unified transition progress.
8. Cleanup
   - Remove duplicate restore calls and legacy close flags superseded by coordinator.

## Validation Matrix

1. Launch from each root tab (`search`, `polls`, `bookmarks`, `profile`) and close from each results state (`loading`, `loaded`, `error`).
2. Verify restore target:
   - Correct tab
   - Correct snap
   - Correct nav visibility state
3. Confirm handoff timing:
   - No content swap before `collapsed`
   - Immediate swap at `collapsed`
   - No extra drop to `hidden`
4. Stress test rapid repeat interactions:
   - no every-other failure
   - no stuck collapsed state
5. Confirm no duplicate restore churn in logs (single owner per side effect).
6. Nav parity check:
   - Launch shortcut from `search`, `polls`, `bookmarks`, `profile` and verify identical nav motion signature (duration/easing/progress shape).
   - Close search from each origin and verify identical nav re-entry signature.

## Non-Goals

1. No fallback-heavy branching to paper over race conditions.
2. No motion-duration experimentation until lifecycle correctness is stable.
3. No hidden reset path in the collapsed close-handoff contract.
