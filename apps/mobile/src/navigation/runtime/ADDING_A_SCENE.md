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
- **THE ONE SCENE-DECLARATION SCHEMA row** — `scene-foundation-spec.ts`
  (`SCENE_DECLARATIONS`). ONE row per scene, three groups, every column a REQUIRED
  literal:
  - `policy` — snaps / posture seat / chrome policy (was the scene-policy registry's
    own `Record`; that file is now a derived view).
  - `track` — `role`, `residency`, `body` (`parts` | `mounted` | `published-lane` |
    `none`), `createFallbackRoute` (was three hand-kept `Set`s plus per-scene
    ternaries inside `TrackSheetRouteHost.tsx`).
  - `foundation` — skeleton / strip / grabHandle / snapLock / worldJoin, or `null`
    for the four keys deliberately outside the sheet foundation.

  A missing row and a half-filled row are BOTH tsc errors that name the key/column;
  the parity sweep lives in `scene-declaration-schema-parity.spec.ts`.

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
- **Scene with imperative, non-React lifecycle state** (rare — only the docked
  lane's scene today) → a **controller class** publishes shell + chrome + manages the
  state; pair it with a writer for the `'list'` body. `polls` is this hybrid.

Child scenes also need: a scene-state runtime + panel-spec hook + the writer, plus
a `pushRoute` case in `app-overlay-route-command-runtime.ts` (mirror `pollDetail`).

## 4. Curated policies to consider (NOT auto-derived)

These intentionally aren't metadata-derived — they're product policies that
**degrade gracefully** (a forgotten scene doesn't break, it just gets a default).
Decide whether your scene belongs:

- `postureSeat` (`app-route-scene-policy-registry.ts`) — is the scene a ROOT PAGE, and
  which two-posture-law seat does it present at ('home'/'content'/null)? Compile-forced;
  a tab-reachable root page left `null` turns the descriptor-table exhaustiveness sweep
  RED and barks `[snap-law]` in dev.
- `openChild` snap (`app-route-scene-transition-policy-runtime.ts`) — which snap
  does the scene open to? (defaults to `preserveLiveY`.)
- `isSceneBodyDataActivityKey` (`app-route-scene-input-registry.ts`) — does the
  body run a tracked live data lane?

## 5. THE PAGE FOUNDATION — every page gets all eight (owner standard, 2026-07-08)

Every page in this app is built from the same eight foundation pieces. A new page
is not done until each row below has an explicit answer — "not applicable" is an
answer, "we forgot" is not. (Audit 2026-07-08: pieces marked ⚠️ are honor-system
today and slated for compile-time hardening — see
`plans/page-foundation-codification.md`.)

| #   | Piece                          | The ONE home                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | New-page requirement                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Persistent header              | `app-route-persistent-header-registry.ts` → `PersistentSheetHeaderHost`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Register a header descriptor. ⚠️ Runtime map, dev-warn only — a missing one renders null.                                                                                                                                                                                                                                                        |
| 2   | Frost + white plate w/ cutouts | ONE hoisted `FrostedGlassBackground` (`BottomSheetSceneStackHost`); the FOUNDATION WHITE LAYER via membership in `SCENE_FOUNDATION_SPECS` (`scene-foundation-spec.ts`) → `SceneBodyFoundationSurface` (body lane)                                                                                                                                                                                                                                                                                                                                                                     | Free by construction — HAVING a spec row is the law (no page on bare frost; the record is a compile-time-exhaustive `Record<SheetSceneKey>`, so a new scene cannot forget one and there is no opt-out value). Cutouts: wrap any content box in `<FrostCutout borderRadius={r}>` — see the white-layer law below.                                 |
| 3   | Cutout skeleton                | `SceneLoadingSurface` via the `skeleton` row of `SCENE_FOUNDATION_SPECS` (`scene-foundation-spec.ts`) — the shared skeleton LEG covers a null body; `SceneBodyReadyGate` covers IN-BODY pending (leg 6)                                                                                                                                                                                                                                                                                                                                                                               | Free by construction: the spec table is a compile-time-exhaustive `Record<SheetSceneKey>` (a forgotten key is a build error) and any in-body pending gate is `<SceneBodyReadyGate pending={q.isPending}>…` — the DECLARED skeleton renders, never a spinner (ActivityIndicator is a lint error in `overlays/panels/**`).                         |
| 4   | Toggle/filter strip            | `ToggleStrip` (`src/toggles/ToggleStrip.tsx`, the strip ENGINE — leg 2) + `SegmentedToggle`/`FilterChip`/`SelectorChip` citizens; search's strip renders through it (the reference)                                                                                                                                                                                                                                                                                                                                                                                                   | Declare `placement` + `backdrop` + controls; band geometry/frost/cutouts/physics/warm-restore are engine-owned. Declare the scene's `strip:` in `scene-foundation-spec.ts` — it is ASSERTED (strip-band law below). NEVER hand-roll a segment row. (`FrostedFilterStrip` = frozen legacy shim for polls/bookmarks until their leg-3 conversion.) |
| 5   | Snap rules                     | `SHEET_MOTION_DESCRIPTOR_TABLE` (+ scene-policy allowed snaps)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Add your rows. House de-facto rules: top-level map-first scenes → `collapsed`; content top-levels → `rememberedDetent`→`expanded`; child opens → `snapTo expanded` (restaurant's `promoteAtLeast middle` is the exception); `closeChild` → `preserveLiveY`; `terminalDismiss` → `hide`; modals → mandate `none`.                                 |
| 6   | Child-page nav-out + header X  | ✅ DERIVED (leg 6 — PF chrome clock): nav-out (`isChildSceneRevealed`) and the header action (`headerNavAction`) are PresentationFrame FIELDS derived from route role — the bottom nav leaves and the host-owned plus rotates to the X whenever the top-of-stack entry is a `'child'`, all in the ONE PF commit. A new child page inherits both by construction — nothing to wire (do NOT register a per-scene close button; the descriptor's `Action` slot is dead). Session-verb closes register `registerHeaderCloseAction`; parent create shortcuts `registerHeaderCreateAction`. |
| 7   | Scroll/no-bounce list          | The track's single FlashList (`TrackSheetPage.tsx`, post-R8) via `surfaceKind: 'list'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Free when you pick `'list'` (§2). Never a raw FlatList/ScrollView.                                                                                                                                                                                                                                                                               |
| 8   | Failure + offline              | `announceFailureIfOnline()` (uniform modal, ONE OK button, every close path identical) + offline = the hang (banner + persisting skeleton, NO error UI) + a self-guarding `unwindFailedXEnter()` if the page has an enter transition                                                                                                                                                                                                                                                                                                                                                  | Mutations get the announcer free via the QueryClient `MutationCache`. Hand-rolled async: call `announceFailureIfOnline()` in the catch. Enterable surface: export ONE self-guarding unwind (mirror `search-failed-enter-unwind.ts`) and wire `onDismissed` in one line. NEVER bespoke failure copy, inline retry buttons, or `Alert.alert`.      |

The house seam for all of this is the metadata table + `Record<OverlayKey>`
completeness pattern (§1): when a piece can be a compile-time-exhaustive table, make
it one — a forgotten key must be a build error that names the key, not a silent
default.

**The header/content seam laws (owner decree, 2026-07-11):** two unconditional
laws at the header's bottom edge — neither has a per-scene flag, by design:

1. **FLUSH LAW** — the first content sits EDGE-TO-EDGE on the header's bottom
   edge: zero content-side top spacing (no body `paddingTop`/`paddingVertical`
   top, no first-child `marginTop`, no transport `contentContainerStyle`
   paddingTop). The header's own internal `paddingBottom`
   (`OVERLAY_HEADER_PADDING_BOTTOM`) is part of the header and stays. Failure /
   empty / loading state bodies are flush too (`paddingBottom` only). If an
   element visually needs breathing room, that space lives INSIDE the element's
   own layout — the default is flush.
2. **DIVIDER IS PART OF THE HEADER** — the scroll-fade hairline
   (`HeaderScrollDivider`, canonical fade `useHeaderScrollDividerOpacityStyle`
   in `BottomSheetSceneStackPageFrame.tsx`: offset `[0, 3, 14]` → opacity
   `[0, 0.35, 1]`, CLAMP) renders ONCE above the hoisted persistent header
   (`PersistentHeaderScrollDividerHost`), faded by the PRESENTED scene's body
   scroll offset — every header gets it automatically, no opt-in. Scenes on the
   shared scroll container publish that offset for free
   (`bodyScrollRuntime.scrollOffset`); a body that OWNS its scroll
   (`contentScrollMode: 'static'` — dmSession's thread) publishes its UI-thread
   offset via `sceneHeaderScrollOffsetRegistry` (stack semantics for entry-keyed
   children). A body that genuinely publishes no scroll gets an honest hidden
   divider (offset 0). Standalone headers outside the sheet chrome
   (RecentHistoryView) compose the SAME fade hook — never a forked interpolation.

**The white-layer law (owner decree, 2026-07-11):** EVERY page renders a WHITE
LAYER on top of the shared frosted foundation — no page may sit on bare frost.

- **Where it lives:** `scene-foundation-spec.ts` — F1389 deleted the
  single-inhabitant per-row surface field, so the enforcer is now MEMBERSHIP:
  `SCENE_FOUNDATION_SPECS` is an exhaustive `Record<SheetSceneKey>` (a forgotten key
  is a build error) and `getSceneFoundationSpec(sceneKey) != null` IS the plate —
  opting out of the plate means leaving `SheetSceneKey`, not setting a field.
  The body host (post-R8: the track's leg bodies in `use-track-leg-resolver.tsx`)
  renders it via `SceneBodyFoundationSurface` (`src/overlays/SceneBodyFoundationSurface.tsx`)
  at the body lane, under the scene's scroll/list/static content. Never re-add a
  per-transport `contentSurfaceStyle` white or a panel-painted full-bleed white —
  those are the hacks this replaced. The search/results sheet is the stated
  exclusion (it owns the canonical frost + plate composition this generalizes).
- **Cutouts (per-page, optional — most pages have none):** to punch a hole in the
  white layer so the frost shows through as a content box's background, wrap the
  box in `<FrostCutout borderRadius={r} style={...}>` (exported from
  `SceneBodyFoundationSurface.tsx`). It onLayout-measures its laid-out rect
  (measureLayout against the body lane — content coordinates, immune to sheet
  motion/scroll) and registers the hole; the white plate renders as a
  `MaskedHoleOverlay` (the same plate-with-punched-holes primitive as the header
  cutout plate and the cutout skeleton) translated by `-scrollOffset` on the UI
  thread, so the hole tracks the box while scrolling. Give the box NO opaque
  background of its own, and keep its text legible on frost gray. First consumer:
  the profile metrics box (`ProfilePanel` `statsRow`).
- **In-body loading skeletons:** a `SceneLoadingSurface` rendered INSIDE a body
  (list-empty/loading states) is a TRUE cutout automatically: it wraps itself in a
  `FrostCutout`, punching its whole rect out of the foundation white plate, so its
  own plate is the one white there and the holes reach the real frost. There is no
  `frostBacking`/self-frost fork any more — never paint an imitation frost. The
  shared skeleton LEG (body-null fallback) renders before the white layer mounts
  and frost-throughs by construction.

**The strip-band backdrop law (owner ratified 2026-07-12 — "the cutouts should
actually see through, and we should adapt the white area to accommodate that"):**
a toggle-strip band is a SANCTIONED FROST WINDOW in the white layer. The two
masking systems (the strip's white cutout plate, the foundation white plate) must
never fight: a strip's see-through holes over an opaque plate blur to flat white —
the keystone defect that white-washed the polls/bookmarks strips
(plans/toggle-strip-audit-leg1.md D2.1).

- **Structural, not procedural:** the strip engine (`ToggleStrip`) always renders
  its band inside a `FrostCutout` — on a foundation-plated scene the plate gets a
  band-height hole automatically; cutouts-over-dead-white is unrepresentable. The
  plate adapts to the strip, never the reverse. No page wires this.
- **Declared, and the declaration can show RED:** every scene row's `strip:` field
  (`'none' | 'in-list' | 'header'`) is LOAD-BEARING — `useSceneStripLawAssert`
  (`src/toggles/toggle-strip-scene-law.ts`) barks a dev contract violation when a
  strip renders on a scene declared `'none'` or under a contradicted placement.
  The strip's required `backdrop:` literal (`'chrome-frost' | 'plated-body'`) is
  likewise asserted against the actual surface (a `'chrome-frost'` strip inside a
  plated body, or vice versa, barks). The inverse assert — a scene declaring a
  strip that never renders — lands with the leg-3 header mount (descriptor
  pattern).

**The toggle contract (owner decree, 2026-07-08):** every toggle-like control —
including conditional ones like "Search this area" (a toggle whose availability is a
predicate) — gets FIVE benefits from the shared implementations, never hand-rolled:
(1) pill/chip visual mechanics (`SegmentedToggle`/`FilterChip`), (2) optimistic
press-up flip, (3) restarting quiet-window debounce, (4) cancelable consequence,
(5) visual-sync finalize (the results-presentation toggle coordinator — being
extracted into a portable `declareToggle` core; status + work queue in
`plans/page-foundation-codification.md` §4b).

## 6. Docked-lane caveat

The docked lane is the one bespoke subsystem: exactly one scene (the "docked
scene") presents under the search root whenever the search sheet dismisses,
restorable after dismissal — not a tab. Which scene that is lives in ONE
constant, `DOCKED_SCENE_KEY` — in **`docked-scene-target.ts`**, a deliberately
import-free leaf module (hosting it in `app-overlay-route-types.ts` produced a
boot-order TDZ that neither tsc nor jest can see). Its value today is
**`'home'`**: the polls → home retarget already happened (2026-07-26).

Re-targeting the persistent surface is _intended_ to be a one-constant change
plus the new scene's own publication files, and after the F953/F962 fixes
(2026-08-03) that is true again — but it was NOT true when the retarget was
actually done. Three live sites hardcoded `'polls'` where the HOME posture seat
was meant (the home-landing seat write, the shared sheet's initial position, and
a presentation-controller input still _named_ `getPollsSheetSnap`), plus a test
comment asserting the old carrier. They read `HOME_SEAT_CARRIER_SCENE_KEY` /
`DOCKED_SCENE_KEY` now. **If you re-target again, grep for the outgoing scene's
literal key across `navigation/runtime` before believing this paragraph** — the
promise is a convention, not something the compiler enforces.

The lane's search→docked dismiss handoff marks readiness off the docked scene's
body surface, so it is **surface-aware** (mounted OR list). If you change the
docked scene's body surface kind, re-check
`logDockedSceneHeaderRestorationContract` in `app-route-scene-stack-runtime.ts`.

---

## 7. Performance: what actually governs it here

This section replaces `overlays/PERFORMANCE_PATTERNS.md`, deleted 2026-08-03
(F961). That guide's headline recommendation — a `useKeyedCallback` /
`useCallbackFactory` pair for list-item callback stability — had **zero consumers
anywhere in the app** (the hooks themselves were deleted 2026-08-04, F1551), and its worked "hook extraction" example was written
against a `useSaveSheetState` hook that does not exist in the codebase. It also
predated the scene-stack architecture it sat beside, so it said nothing about
the four mechanisms that actually decide whether a scene feels fast today. A
guide recommending an unused hook sends a stranger down a dead path on their
first day; these are the live mechanisms instead.

**1. Body-spec hooks do not run effects.** The hooks that build
`sceneBodyContent` / `sceneBodyTransport` render to produce a spec, and their
effects never commit. Anything effect-shaped (a scroll command, a subscription,
an imperative ref call) written there is DEAD CODE that will look correct in
review. Put it in the feed runtime or the controller, whose effects do fire.

**2. The reveal is paint-ack-gated, not timed.** A scene switch holds the
outgoing body opaque until the incoming scene's first real paint, then swaps in
one frame. So the cost that matters on a switch is the incoming scene's FIRST
FRAME, not its steady state: seed a skeleton/shell that paints immediately and
let the real content hydrate under it. A scene that cannot paint until its data
arrives stalls the whole transition (and trips the engine's join-liveness
watchdog, which barks).

**3. Residency: hidden shells must be quiet.** Residency-managed scenes mount
once and stay mounted; a switch retargets VISIBILITY. A hidden resident that
keeps a query subscribed, an animation running or a socket open is paying for a
screen nobody is looking at. Read `useShellLiveness()` and gate on it — that is
the one bit that says "I am the visible scene".

**4. MVCP is ON by default and will eat your header.** FlashList 2.x enables
`maintainVisibleContentPosition`, which anchors the previously-top row. On a
list whose rows RE-ORDER (any sortable feed), that scrolls your header off
screen on every sort change. Re-sortable lists must pass
`flashListProps: { maintainVisibleContentPosition: { disabled: true } }` through
their transport. Append/chat lists should keep it ON.

**Measuring it.** Instrument the COMPOSITE — what the eye actually sees — never
intent (a state value, a handler firing). A metric that cannot be made to show
RED against a real defect is lying, and a bare FPS target is not a finding. The
old guide's "35-45+ FPS during interactions" goal is deliberately not carried
over: the standard is a human-blessed baseline plus an instrument that can
regress against it.
