# Location-Optional Search And Market Context Plan

Last updated: 2026-04-13
Status: delivered
Scope:

- `/Users/brandonkimble/crave-search/apps/mobile/src/navigation/runtime/MainLaunchCoordinator.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/services/{markets,polls,search}.ts`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/markets/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/polls/**`

Related plans:

- `/Users/brandonkimble/crave-search/plans/contextual-score-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/polls-coverage-resolution-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/restaurant-identity-domain-rollup-plan.md`

## Objective

Make current device location optional across the app without silently changing semantics.

The target model is:

- `userLocation`
  - real current or last-known device coordinate
  - used only for distance, nearby bias, and explicitly proximity-native behavior
- `searchContext`
  - submitted bounds / viewport
  - used for search geography, contextual scoring cohort, and map/panel visual focus
- `marketContext`
  - resolved market for polls and market-scoped UI
  - derived from explicit market choice or a legitimate anchor, not a fake substitute

## Locked rules

### 1. Missing location degrades features, not meaning

If current location is unavailable:

- search still runs
- autocomplete still runs
- map browsing still works
- restaurant profiles still work
- polls still work from market or bounds context
- distance becomes unavailable
- near-me semantics become unavailable

What should never happen:

- viewport center being treated as if it were the user's actual location
- city bootstrap coordinates being treated as semantic user truth

### 2. Search is viewport-first

Search requests may include:

- `bounds`
- optional `userLocation`

If `userLocation` is missing:

- search still executes from the submitted bounds
- distance bias is simply omitted
- no fallback anchor is synthesized from bounds

### 3. Polls prefer explicit market, then bounds, then unresolved

For polls:

- if there is an explicit market, use it
- otherwise use submitted bounds plus optional user location for market resolution
- if neither yields a real market, stay unresolved / no-market

This keeps polls functional without inventing a fake "near me" location.

### 4. Startup framing is not semantic location

City bootstrap / startup camera state may still seed:

- initial map camera
- initial poll bounds
- cached market bootstrap lookups

But those bootstrap coordinates are not semantic `userLocation`.

## Delivered changes

### Search

- Normal search submission no longer blocks on fetching current location before sending a request.
- Search request building now uses `userLocation` only when a real location is already available.
- Backend search interpretation no longer invents a fake anchor from bounds when location is missing.

### Startup

- Startup location snapshots are now split into semantic and non-semantic cases.
- `city_fallback` and `none` no longer populate app-wide `userLocation`.
- startup recent-search replay and startup polls bootstrap now use semantic user location only.

### Polls and market resolution

- Poll query contracts are now `marketKey` / `bounds` / `userLocation`, without legacy city aliases.
- Docked polls runtime now threads semantic user location through the overlay/runtime contract.
- Poll refresh requests now include `userLocation` only when one actually exists.
- `/markets/resolve` now prefers real user location when it is present, but still supports bounds-only resolution when location is unavailable.

### UI / runtime cleanup

- Search response handling no longer fabricates `searchRequestId`.
- UI label defaults like `'Local'` were removed where they were masking missing state.
- Primary-location and "pick first location" fallbacks were removed from key restaurant status / selection paths.

## Remaining boundary

The remaining intentional non-user-location anchors are:

- bounds-only market resolution, which is valid for explicit map-area browsing
- city/bootstrap camera coordinates, which are valid for initial framing only
- visual-only map selection helpers that may use bounds center when no semantic user location exists

Those are acceptable because they are now explicit search/presentation context, not disguised proximity truth.

## Ideal end state

The repo should continue converging toward these invariants:

- no feature silently upgrades `searchContext` into `userLocation`
- no feature silently upgrades startup bootstrap coordinates into semantic user location
- all proximity features explicitly require semantic user location
- all non-proximity browsing flows remain fully usable without it
