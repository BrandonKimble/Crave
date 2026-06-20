# Nav ↔ Sheet visibility — how it actually works

> One-page map of the hard-won logic that hides/shows the bottom nav bar relative to the
> bottom sheet. Read this before touching nav visibility or adding a new sheet scene — the
> behavior is delicate (drag / settle / interrupt / scene-swap edge cases) and was painful to
> get right. **Don't refactor it casually; extend via the documented hook.** Symbols are stable;
> line numbers drift.

## The rule

- **Nav HIDDEN** while the **search RESULT** sheet owns the screen (incl. during its motion) and
  while the **suggestion** surface is open.
- **Nav VISIBLE** on **nav-sheet** pages (polls, bookmarks, profile) and the idle map.

## The single source of truth: `backdropTarget`

Everything keys off one piece of state, **`backdropTarget`**:

| `backdropTarget`                     | meaning                           | nav                                                            |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------------- |
| `'results'`                          | search has active results content | **hidden**                                                     |
| `'suggestions'`                      | suggestion panel open             | (suggestion surface; nav hidden via `isSuggestionPanelActive`) |
| `'default'` → normalized to `'none'` | idle map / a nav-sheet scene      | **visible**                                                    |

It's set in **`use-results-presentation-shell-local-state.ts`** from `hasActiveSearchContent`:
results present → `'results'`; otherwise idle → `'default'`. Nav-sheets (polls/bookmarks/profile)
have no active _search_ content, so they land on `'default'` → nav shows. **That's why nav-sheets
"just work" — there is no per-scene nav flag; absence of search results is the signal.**

## The decision (the heart)

**`use-search-foreground-bottom-nav-visual-runtime.ts`** computes:

```
shouldHideBottomNavForSearchResultsMotion =
     isSearchOverlay
  && inputMode !== 'editing'                                   // keyboard up = editing, not hiding
  && (backdropTarget === 'results' || isSearchResultsSurfaceOwner)
  && surfaceVisualPolicy.phase !== 'results_dismissing'
  && !isPersistentPollHandoffCommitted
shouldHideBottomNavForSuggestionSurface = isSuggestionPanelActive
shouldHideBottomNavForMotion = (results) || (suggestion)        // → drives the motion target
shouldHideBottomNavForRender = (suggestion only)               // → drives pointerEvents
```

`isSearchResultsSurfaceOwner` = `surfaceVisualPolicy.bottomBandOwner === 'results_header'` or the
`animatedSearchTransition` clip mode — this is what keeps the nav hidden _during the open/close
animation_, not just at rest.

## Data flow (set → decide → animate → render)

```
hasActiveSearchContent
  └─> use-results-presentation-shell-local-state.ts        sets backdropTarget ('results' | 'default')
        └─> shellModel.backdropTarget (results presentation owner store)
              └─> use-search-root-overlay-foreground-visual-presentation-source-runtime.ts   ('default' → 'none')
                    └─> use-search-foreground-visual-runtime.ts                               (forwards inputs)
                          └─> use-search-foreground-bottom-nav-visual-runtime.ts              ◀ THE DECISION
                                ├─ useLayoutEffect: commandBottomNavMotion('hide'|'show')     (JS fires ONLY on change)
                                │     └─> runOnUI(commandBottomNavMotionOnUI)                  ◀ UI-thread worklet
                                │           bottomNavHideProgress / navOpacity / navTranslateY = withTiming(…, 360ms)
                                └─ returns bottomNavMotionRuntime { navOpacity, navTranslateY } + shouldHideBottomNavForRender
                                      └─> search-root-visual-runtime-contract  (pick)
                                            └─> use-search-root-overlay-bottom-nav-presentation-runtime.ts  (adapter)
                                                  └─> SearchBottomNav.tsx
                                                        opacity/translateY  = bottomNavMotionRuntime (animated style)
                                                        pointerEvents       = shouldHideBottomNav ? 'none' : 'box-none'
```

**Key perf property:** the animation is **UI-thread only** (`commandBottomNavMotionOnUI` worklet +
`withTiming`). JS crosses the bridge **once per decision change** (the `useLayoutEffect`), never
per-frame. Keep it that way — don't add JS state that re-renders on nav motion.

## File roles (the ~10 files)

| File                                                                                                                                            | Role                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `components/SearchBottomNav.tsx`                                                                                                                | The nav bar view. Reads `navOpacity`/`navTranslateY` (animated style) + `shouldHideBottomNav` (pointerEvents).                    |
| `runtime/shared/use-search-foreground-bottom-nav-visual-runtime.ts`                                                                             | **The decision + motion command.** `shouldHide*` flags, `commandBottomNavMotion`, the UI worklet.                                 |
| `runtime/shared/search-bottom-nav-motion-runtime.ts`                                                                                            | Motion contract: `'hide'\|'show'` target, 360ms duration, the command-sink registry.                                              |
| `runtime/shared/use-results-presentation-shell-local-state.ts`                                                                                  | **Owns `backdropTarget`** (`'results'` vs `'default'`) from `hasActiveSearchContent`.                                             |
| `runtime/shared/use-search-root-overlay-foreground-visual-presentation-source-runtime.ts`                                                       | Normalizes `'default'`→`'none'`; assembles the visual inputs.                                                                     |
| `runtime/shared/use-search-foreground-visual-runtime.ts`                                                                                        | Aggregates the foreground visual runtime; forwards inputs to the nav decision.                                                    |
| `runtime/shared/use-search-root-overlay-bottom-nav-presentation-runtime.ts`                                                                     | Thin adapter → `{ bottomNavMotionRuntime, shouldHideBottomNav }` for the component.                                               |
| `runtime/shared/search-root-visual-runtime-contract.ts`                                                                                         | `Pick`s `bottomNavMotionRuntime` + `shouldHideBottomNavForRender` up to the overlay host.                                         |
| `runtime/shared/search-foreground-chrome-contract.ts` / `use-search-foreground-visual-runtime-contract.ts`                                      | Type shapes (`backdropTarget`, `isSuggestionPanelActive`, the runtime outputs).                                                   |
| `overlays/SearchOverlayChromeHost.tsx` / `overlays/NavSilhouetteHost.tsx` / `navigation/runtime/app-route-overlay-host-authority-controller.ts` | Host/orchestration: render chrome, hold the startup nav inputs (default `shouldHideBottomNav: false`), publish overlay snapshots. |

## Adding a new nav-VISIBLE scene (e.g. `pollDetail`)

This is the whole point of the doc — and it's **small**, because nav-sheets need no nav flag:

1. Add the scene to **`APP_OVERLAY_ROUTE_METADATA_BY_KEY`** in
   `navigation/runtime/app-overlay-route-types.ts` with `chromePolicy: 'searchChrome'` or
   `'preserve'` (both keep the nav chrome). For a poll-detail sub-scene of polls, use
   `role: 'child'`, `parentSceneKeys: ['polls']`.
2. **That's it for nav visibility.** A nav-sheet scene has no active _search_ results, so
   `backdropTarget` stays `'default'` → the decision computes `shouldHideBottomNavForMotion = false`
   → nav shows. No change to the nav decision logic, no per-scene flag.

If you ever need a scene that **hides** the nav like the result sheet, it must drive
`backdropTarget === 'results'` _or_ own the bottom band (`surfaceVisualPolicy.bottomBandOwner`) —
i.e. it has to look like result content to the surface policy. Prefer not to; the result-sheet
hide path is the delicate one.

## Gotchas / invariants (don't break these)

- **Editing beats hiding:** `inputMode === 'editing'` (keyboard up) keeps the nav logic from
  treating it as a results-motion hide. Don't drop that guard.
- **The "during motion" hide** depends on `isSearchResultsSurfaceOwner` (bottom-band owner / clip
  mode), not just `backdropTarget` — that's what prevents the nav from flashing back during the
  open/close animation. Touch with care.
- **`isPersistentPollHandoffCommitted`** suppresses the results-hide during the search→polls
  handoff. It exists for a reason; don't remove it when reworking polls.
- **Never add JS state that updates on nav motion.** The motion is a UI worklet; JS fires once per
  decision change. Re-rendering on motion is the regression class V4's perf gate guards against.
