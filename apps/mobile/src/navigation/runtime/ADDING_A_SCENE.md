# Adding an overlay scene / page

The overlay scene system is **metadata-driven**: most of what a scene "is" comes
from one entry in `APP_OVERLAY_ROUTE_METADATA_BY_KEY` (`app-overlay-route-types.ts`).
Adding a page should be: add the metadata entry, fix the build errors it points you
at, create the body/publication files, done. If you find yourself hunting for a
scattered list to edit, that's a smell — prefer deriving from metadata.

## 1. Register the scene

- `OverlayKey` union — `overlays/types.ts`.
- `APP_OVERLAY_ROUTE_METADATA_BY_KEY` entry — `app-overlay-route-types.ts`
  (role, sheetPolicy, `sceneSwitch`, `sceneInput`, `staticSceneInput`, …).
- `OverlayRouteParamsMap` entry — the route's params.
- The scene-policy `Record<OverlayKey>` — `app-route-scene-policy-registry.ts`.

**Let the compiler find the rest.** The `Record<OverlayKey>` registries and the
**completeness assertions** in `app-overlay-route-types.ts` turn a forgotten key
into a build error that _names the key_. Derived sets (e.g.
`CHILD_SHARED_SHEET_SCENES`, via `selectOverlayRouteKeysWhere`) update from the
metadata automatically — no hand-edit. This exhaustiveness exists specifically
because a missing `CHILD_SHARED_SHEET_SCENES` entry once silently broke nav.

## 2. Pick the body surface (`surfaceKind`)

- **`'list'`** — for ANY scrollable body (feed / list / thread). The ONLY kind
  with the sheet-drag → list-scroll handoff in one gesture AND working item taps.
  Default to this.
- **`'mounted'` / `'content'`** — static, non-scrolling content only. No FlashList,
  no handoff; the sheet pan swallows taps on scrollable children. (The polls feed
  was wrongly `'mounted'` — that's why its cards didn't tap and it didn't scroll.)

## 3. Publish the scene — pick the pattern from the surface kind

This is a principled rule, not a free choice:

- **Static `'mounted'`/`'content'` body** → a **static descriptor controller**
  (mirror `app-route-static-scene-descriptor-controller.ts`). The data lives inside
  the mounted body component, which fetches it itself; the descriptor is constant,
  so no React is needed to publish it.
- **Dynamic `'list'` body** → a **React writer hook** (mirror
  `use-app-route-poll-detail-scene-input-writer-runtime.tsx`). The list's `data` +
  `renderItem` must be IN the published spec so the shared list surface can render
  them, which requires a hook. Mount it at the app shell
  (`AppShellMainNavigator.tsx`) for a top-level scene, or
  `use-app-route-dynamic-scene-input-writers-runtime.tsx` for a child route.
- **Scene with imperative, non-React lifecycle state** (rare — only the persistent
  poll lane today) → a **controller class** publishes shell + chrome + manages the
  state; pair it with a writer for the `'list'` body. `polls` is this hybrid.

Child scenes also need: a scene-state runtime + panel-spec hook + the writer, plus
a `pushRoute` case in `app-overlay-route-command-runtime.ts` (mirror `pollDetail`).

## 4. Curated policies to consider (NOT auto-derived)

These intentionally aren't metadata-derived — they're product policies that
**degrade gracefully** (a forgotten scene doesn't break, it just gets a default).
Decide whether your scene belongs:

- `isSharedOverlaySnapOwner` (`app-route-sheet-snap-session-runtime.ts`) — does the
  user's drag persist as the _shared_ sheet snap?
- `openChild` snap (`app-route-scene-transition-policy-runtime.ts`) — which snap
  does the scene open to? (defaults to `preserveLiveY`.)
- `isSceneBodyDataActivityKey` (`app-route-scene-input-registry.ts`) — does the
  body run a tracked live data lane?

## 5. Persistent-poll-lane caveat

The docked polls lane is the one bespoke subsystem. Its search→docked dismiss
handoff marks readiness off the polls body surface, so it is **surface-aware**
(mounted OR list). If you change the polls body surface kind, re-check
`logPersistentPollHeaderRestorationContract` in `app-route-scene-stack-runtime.ts`.
