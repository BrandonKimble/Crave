# Child-transition primitive + plus/X rotation — design of record (leg 5, 2026-07-13)

UI & small-tasks agent, read-only leg. Scope = wave-2 charter §4 + §5
(plans/wave2-lists-transitions-charter.md). Owner review gates the build (leg 6).
Every claim below is traced with file:line on today's tree.

---

## 1. Attribution — why child transitions are janky and nav switches "nice but laggy"

### 1.1 The four commit clocks (root cause frame)

A page switch is ONE logical event but today it fans out over FOUR independently-flushed
lanes, each with its own subscription and cadence. Nothing co-commits them:

| #   | Lane                                              | Store / clock                                                                                                                | Where                                                                                                    |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Header title + action + header-mounted strip      | PresentationFrame via `usePresentationFrame` (React commit)                                                                  | `apps/mobile/src/overlays/PersistentSheetHeaderHost.tsx:48,55-56`                                        |
| 2   | Body CONTENT (which scene's body/skeleton mounts) | scene-stack body-surface authority — dispatched via `flushSceneStackTransitionDispatchTarget()`, flushed LAST and separately | `app-route-scene-switch-controller.ts:1553-1554` (PF-first order at `:1463-1469`)                        |
| 3   | Body OPACITY / leg visibility                     | UI-thread SharedValue `liveSwapRoles`, gated on the incoming leg's **paint-ack**                                             | `BottomSheetSceneStackHost.tsx:588-609,664-668`                                                          |
| 4   | Nav bar out/in                                    | `nav-out-derivation-store` ← routeOverlayNavigationAuthority projection → `useLayoutEffect` → `withTiming`                   | `nav-out-derivation-store.ts:8-33`, `use-search-foreground-bottom-nav-visual-runtime.ts:120-131,196-198` |

The header keys on `frame.presentedSceneKey ?? frame.activeSceneKey`; the body content
keys on the per-scene body snapshot (`BottomSheetSceneStackHost.tsx:801-848`). Two
different snapshots, two different React commits; body opacity is a third (UI-thread)
clock. That is the WHOLE observed defect class — not a broken animation, a missing
atomic commit.

### 1.2 Why the nav-page switch is the reference (and still one beat off)

Tab targets (`search/polls/bookmarks/profile`) are all in `SEEDED_FORWARD_OPEN_SCENES`
(`app-route-scene-transition-policy-runtime.ts:190-212`) → `resolveContentHandoff` =
`'swapImmediately'` (`:401-406`) → NO content motion plane (`:459-465`) → the switch
commits synchronously to idle (`app-route-scene-switch-controller.ts:1538,1771-1827`).
It looks clean because (a) seeded top-level panels paint a REAL frame-1 skeleton
(`SceneLoadingSurface` in PollsPanel/BookmarksPanel/ProfilePanel) so paint-ack is
immediate, and (b) their strips are `strip: 'header'` (`scene-foundation-spec.ts:72,84`)
so strip and title swap in the SAME header commit (`PersistentSheetHeaderHost.tsx:143-157`).

**The one-beat header/strip lag on tab switches**: body opacity flips on the UI thread
the moment paint-ack lands (clock 3), while the header's content swap is a React commit
scheduled off the PF flush (clock 1). Content therefore visibly changes a frame (or more,
under JS load) before the header/strip commit paints. Same root cause, mild symptom.

### 1.3 Why child pushes are worse — the ActivityIndicator seed

Child scenes ride the IDENTICAL seeded hard-swap machinery (all child keys are in
`SEEDED_FORWARD_OPEN_SCENES`). The difference is what the seeded frame CONTAINS:

- The shared skeleton leg (`SceneStackBodyContentLayerHost` →
  `SceneLoadingSurface`, `BottomSheetSceneStackHost.tsx:833-901`) renders ONLY when the
  leg's body entry is null. Child panels ARE the body (contentEntry non-null), and most
  of them self-gate on their query's `isPending` with a raw `ActivityIndicator` — so the
  foundation skeleton is bypassed and the seeded first frame is a near-blank body:
  bare frost / white → spinner → content. The frame-1 paint-ack fires on that blank
  frame, so the OLD body's opacity is already driven to 0 → the see-through gap.
- Meanwhile the header title swapped on the PF commit (clock 1) and nav-out started on
  the route-role projection (clock 4) — four staggered movements = "piecemeal".
- Every scene ALREADY has a declared skeleton row — `scene-foundation-spec.ts:66-227`
  gives all 16 sheet scenes a `skeleton: { rowType }`. The primitive is half-built: the
  declaration exists; the child bodies just don't render through it. (ADDING_A_SCENE.md
  §5 row 3 still names `SCENE_STACK_BODY_SKELETON_SPECS` — stale, the table became
  `SCENE_FOUNDATION_SPECS`; fix the doc in leg 6.)

### 1.4 Child dismiss (closeChild)

`resolveContentHandoff` forces `'swapImmediately'` (`:385-387`), idle-commit. The parent
leg is retained warm (`app-route-scene-stack-runtime.ts:820-825`) so its body re-reveals
via warm paint evidence (`BottomSheetSceneStackHost.tsx:640-647`) — clock 3, instant.
The header/strip re-render off the PF (clock 1) and the nav bar re-derives (clock 4)
in later commits → "content shifts, strip pops late, header title late, nav late".
Origin/detent restore is staged separately again (`stagePoppedEntryOriginRestore`,
scene-switch-controller `:246-252,955-960`).

### 1.5 Per-page deviation table

Transition machinery is uniform (seeded hard-swap); the deviation is the SEED CONTENT
and the unsynchronized chrome clocks (all pages inherit those). Body-seed audit:

| Page                            | Seed on push today                                            | Deviation                       | Evidence                                                                |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| listDetail                      | own `ActivityIndicator` on `metaQuery/resultsQuery.isPending` | spinner-first                   | `panels/ListDetailPanel.tsx:1134-1139` (+ button spinners `:569,:1194`) |
| messagesInbox                   | `ActivityIndicator` on `isPending`                            | spinner-first                   | `panels/MessagingPanels.tsx:132-135`                                    |
| dmSession                       | `ActivityIndicator` on messages/conversation pending          | spinner-first                   | `panels/MessagingPanels.tsx:450-453`                                    |
| settings                        | `ActivityIndicator` in privacy/blocked section                | spinner-first                   | `panels/ChildScenePanels.tsx:132-136`                                   |
| notifications                   | `ActivityIndicator`                                           | spinner-first                   | `panels/NotificationsPanel.tsx:95`                                      |
| followList                      | `ActivityIndicator` on `listQuery.isPending`                  | spinner-first                   | `panels/FollowListPanel.tsx:56-59`                                      |
| userProfile                     | `ActivityIndicator` on `profileQuery.isPending`               | spinner-first                   | `panels/UserProfilePanel.tsx:276-279`                                   |
| editProfile                     | `ActivityIndicator` ×3                                        | spinner-first                   | `panels/EditProfilePanel.tsx:176,222,291`                               |
| profile sections (in-page)      | `SectionLoading` spinner                                      | spinner-first                   | `panels/ProfileSectionsBody.tsx:70,333,363,401,480`                     |
| postPhotos                      | `ActivityIndicator` ×3 (dish list + submit)                   | spinner-first                   | `panels/PostPhotosPanel.tsx:137,224,695`                                |
| pollDetail                      | `SceneLoadingSurface`                                         | ✅ conformant                   | PollDetailPanel                                                         |
| saveList                        | `SceneLoadingSurface`                                         | ✅ conformant                   | SaveListPanel                                                           |
| restaurant                      | `SceneLoadingSurface`                                         | ✅ conformant                   | RestaurantPanel                                                         |
| pollCreation                    | static form, no pending gate                                  | ✅ n/a                          | —                                                                       |
| polls/bookmarks/profile (roots) | `SceneLoadingSurface`                                         | ✅ conformant (chrome-lag only) | PollsPanel/BookmarksPanel/ProfilePanel                                  |

### 1.6 Legacy spinner inventory (app-wide, kill list)

Skeletons for content, the squircle for buttons — per charter §1.6/§5.

Content spinners (→ foundation skeleton via the ready-gate, §2.2): every `panels/*` row
in the table above.

Button/submit spinners (→ squircle affordance):

- `panels/BookmarksPanel.tsx:421` (Save button — coordinate with Strip leg 7, §1.6)
- `panels/ListDetailPanel.tsx:569,1194`; `panels/PostPhotosPanel.tsx:695`
- `panels/EditProfilePanel.tsx:291` (save)
- `components/ui/Button.tsx:105` — the SHARED Button loading prop renders an
  ActivityIndicator: replace with the squircle at the primitive level and every consumer
  inherits it.
- `components/ShareModalHost.tsx:291,330`
- `panels/BookmarksPanel.tsx:657` (footer/pagination — decide: skeleton row)

Out of scope for leg 6 (not sheet pages; flag only): `screens/Onboarding.tsx:1294,1472`,
`screens/PaywallScreen.tsx:169,189`, `screens/CameraCaptureHost.tsx:128,206`.

---

## 2. THE CHILD-TRANSITION PRIMITIVE (design)

Goal restated as a law: **press-up = one chrome commit (header + strip + nav-out +
plus/X rotation start); body = skeleton until ready; reveal = one joined frame; never
piecemeal.** Three pieces, all at the layer where the defect lives:

### 2.1 One chrome clock (kills the piecemeal chrome)

The PresentationFrame is already the single-writer truth for "what page are we on"
(`resolveNextPresentationFrame` / `commitPresentationFrame`,
scene-switch-controller `:789-891`), and its dispatch is already flushed FIRST (`:1465`).
Make it the ONLY chrome clock:

- `isChildSceneRevealed` (nav-out) and the new `headerNavAction` mode (§3) become
  **PF-derived fields** carried on the frame itself (derived from the top-of-stack
  entry's metadata `role` — the same derivation `nav-out-derivation-store` does today
  from a different subscription). The separate nav-out store's writer runtime
  (`use-app-route-nav-out-derivation-writer-runtime.ts`) dies; consumers read the frame.
- `PersistentSheetHeaderHost`, the nav visual runtime, and the action button all consume
  the SAME frame commit → title, strip, nav-out start, and rotation start are one React
  commit by construction. This is the "react on press-up immediately" half of the law —
  chrome LEADS, deliberately; only the body reveal is gated.

### 2.2 The skeleton law becomes structural (kills spinner-first seeds)

The declaration already exists (`scene-foundation-spec.ts` skeleton rows, exhaustive).
What's missing is the render path for in-body pending states. New shared primitive:

- `SceneBodyReadyGate` (one component, `src/overlays/` next to
  `SceneBodyFoundationSurface`): `<SceneBodyReadyGate pending={q.isPending}>{content}
</SceneBodyReadyGate>` renders the scene's DECLARED foundation skeleton
  (`SceneLoadingSurface` with the row's `rowType`/`frostBacking`, resolved from
  `getSceneFoundationSpec(presented scene via SceneStripLawContext-style scene context)`)
  while pending. No per-page skeleton choice at the call-site — the spec row is the law.
- Every `panels/*` ActivityIndicator content gate in §1.5 is REPLACED by this gate
  (a mechanical sweep; the pending predicates stay, the spinner JSX dies).
- RED-provable contract: dev bark when an `ActivityIndicator` renders inside a sheet
  scene body — cheapest honest form: an eslint `no-restricted-imports` on
  `ActivityIndicator` scoped to `src/overlays/panels/**` (+ Button.tsx once squircled),
  so a new spinner is a lint error that names the file. (A runtime probe can't see
  "spinner-ness"; the import ban can, and it can show RED today on 10 files.)

### 2.3 The joined reveal (kills the frost gap + the one-beat lag)

Today reveal = paint-ack only (clock 3 flips `liveSwapRoles` opacity the moment the
incoming leg paints). Two changes:

- **Skeleton counts as painted content** — with §2.2, frame-1 of every child is a real
  skeleton, so the ack is honest (this alone kills the bare-frost gap: the old body's
  opacity never drops before a visually-complete frame exists).
- **Reveal joins {paint-ack, chrome-commit}**: the header host records a `chromeAck`
  for the presented sceneKey in a `useLayoutEffect` after its commit (the host is a real
  component — its effects fire, unlike body-spec hooks), and the swap SV flip waits for
  BOTH marks. This is the "one committed frame" fix for the nav-page one-beat lag too:
  content opacity can never lead the header/strip paint. Watchdog: reuse the existing
  content-plane timeout machinery (`clearContentPlaneTimeout`,
  scene-switch-controller `:1100-1105`) so a missing chromeAck degrades to today's
  behavior after ~2 frames, with a `__DEV__` bark (provably RED by suppressing the ack).

Dismiss inherits all three pieces symmetrically: warm parent body + parent chrome commit
join before the reveal; nav-in and X→plus rotation ride the same PF commit.

### 2.4 What dies when the primitive lands

- All §1.5/§1.6 in-panel ActivityIndicators (10 panel files) + `Button.tsx` spinner.
- `nav-out-derivation-store.ts` + its writer runtime (folded into the PF).
- The per-scene header `Action` close-button factories (§3): duplicated X Pressables in
  `ChildScenePanels.tsx:304-332`, PollDetailPanel, PollCreationPanel, SaveListPanel,
  MessagingPanels, PostPhotosPanel, RestaurantPanel's bespoke `headerCloseButton`
  (`RestaurantPanel.tsx:816,829`).
- The stale `SCENE_STACK_BODY_SKELETON_SPECS` reference in ADDING_A_SCENE.md §5 row 3
  (now `SCENE_FOUNDATION_SPECS`), and row 3's ⚠️ Partial-Record caveat (spec rows are
  already exhaustive — the doc lags reality).
- `headerActionPolicy` in `app-overlay-route-types.ts:28,40` — superseded by role
  derivation (§3); `'follow-collapse'` has been visually dead since `e9bd105a` forced
  the polls button to fixed-plus.

---

## 3. §4 — the plus↔X rotation (design)

### 3.1 Prior art (excavated)

The mechanism is ALIVE on main: `src/overlays/OverlayHeaderActionButton.tsx:29-35` —
two stacked `LucideX` glyphs crossfading by opacity inside one rotating stack
(`rotation = 45 * progress`; the "+" is literally the X rotated 45°). Its old driver
(`overlayHeaderActionProgress`, `use-app-route-sheet-frame-host-authority.ts:209-256`)
maps mode → target with `withTiming(220ms, Easing.out(Easing.cubic))` on mode change
and tracks the live sheet 1:1 under `follow-collapse`. Commit `e9bd105a` (2026-06-20)
removed only the polls snap-tracking wiring (pinned progress=1). A parallel older copy
lives in `useOverlayHeaderActionController.ts` (`:34,:91`) — one of the two dies.

### 3.2 Today's design (rebuilt on the persistent header)

**One host-owned button.** `HeaderNavAction` (the re-idealized
`OverlayHeaderActionButton`) is rendered by `PersistentSheetHeaderHost` itself in the
action position — NOT via per-scene `Action` descriptor components. The descriptor's
`Action` slot narrows to optional per-scene EXTRAS chrome (ListDetail's ellipsis, §3.5);
the plus/X is chrome law, not page choice.

**Glyph + geometry.** Semantics invert from the prior art (parent=plus is now the rest
state): two stacked `LucidePlus` glyphs — red (`progress=0`, parents) and black
(`progress=1`, children) — crossfading while the stack rotates `45° · progress`.
Plus rotated +45° IS the X:

- **Child push**: progress 0→1 → CLOCKWISE quarter-twist into the black X.
- **Child dismiss**: 1→0 → counterclockwise back to the red plus. Symmetry is free from
  the single scalar.
- **Child→child** (pollDetail→pollCreation, etc.): target stays 1 → no animation, X↔X.
- **Curve**: `withTiming(220, Easing.out(Easing.cubic))` — the proven prior-art feel
  ("quick, satisfying, cubic"). No snap-tracking mode: the driver is discrete.

**Driver = the PF chrome clock (§2.1).** `headerNavAction: 'create' | 'close'` derived
on the frame from the top-of-stack entry's metadata `role`
(`APP_OVERLAY_ROUTE_METADATA_BY_KEY[key].role`: `topLevel` → create/plus, `child` →
close/X; modals preserve). Because the PF commit IS the press-up commit, the rotation
starts on press-up and runs during the transition by construction — never after
arrival. Search RESULTS keep the X (the results scene is a dismissable search session,
role-wise a child of home; today's fixed-close behavior stands).

**Parents become non-dismissable**: with the plus in the seat, the parent X dies — no
code path needed beyond the action map (the plus press never dismisses). The header
grab-tap promote law is untouched (`PersistentSheetHeaderHost.tsx:29-32`).

### 3.3 Per-page plus ACTION map (parents, press behavior)

Keyed by PRESENTED scene (matches the header's own keying, so the docked-polls lane is
correct by construction):

| Presented scene                             | Plus action                                                       |
| ------------------------------------------- | ----------------------------------------------------------------- |
| polls (incl. docked lane under search root) | push pollCreation                                                 |
| bookmarks (→ "Lists")                       | create list (the existing new-list flow → saveList/creation path) |
| profile                                     | catch-all create sheet: poll / image post / discussion / list     |
| search results / any child                  | (no plus — X, role-derived)                                       |

OPEN (owner): whether home's plus should be the catch-all instead of create-poll — the
docked lane presents polls, so poll-create is the derivation-consistent default;
flagging, not deciding.

### 3.4 Nav re-tap (extend-only)

Today a same-key tab press runs the normal transaction (no same-key early-out in
`requestOverlaySwitchBase`, scene-switch-controller `:1072-1084`) and the two-posture
`postureSeat` rule resolves `snapTo seat = live snap` → no motion. Design:

- `NavSilhouetteHost.handleOverlaySelect` detects active-target re-tap (target ===
  current root) and, instead of a switch, fires a NAMED PRODUCT INTENT
  `extendActiveRootFromNavReTap` — the snap law's sanctioned writer category (c)
  (plans/root-snap-law.md leg 2): promotes the shared sheet to `expanded` AND writes the
  side's seat via the named-intent path (peer of `primeDockedPollsForHomeLanding`).
- **Extend-only**: if already expanded, the intent is inert (no write, no motion). No
  third-tap toggle, ever — drag is the only way down. Docked-polls resurrect on a
  search re-tap when dismissed/hidden keeps its existing lane
  (`NavSilhouetteHost.tsx:167-193`) and takes precedence over the extend intent for
  that press.
- RED contract: it's a seat write from a non-gesture source — it MUST go through the
  named-intent gate or the existing `[snap-law]` `__DEV__` assert barks (already
  provable RED by routing it as a programmatic settle).

### 3.5 ListDetail ellipsis seam (charter §6, coordinate only)

The ellipsis fades in LEFT of the nav action as a white→clear CUTOUT reveal. Seam
contract for the Strip leg's page design: the persistent header exposes the SAME
progress SharedValue that drives the plus→X (0→1 on child push) to the descriptor's
extras slot; ListDetail's ellipsis opacity = that progress (and its chrome-plate hole
is part of the header cutout mask, like the close circle,
`OverlaySheetHeaderChrome.tsx:106-137`). One driver, two synchronized affordances,
starting on press-up. Candidate primitive name: header `extras` slot with
`transitionProgress` — future pages inherit slot-fade-in chrome for free.

---

## 4. In-flight overlap fence (charter §10 — leg 6 must respect)

Dirty on the shared tree today (git status 2026-07-13), by owner:

- **Snap-law legs 1-4 (this agent's own)**: descriptor table + spec, snap-session
  runtime, sheet-host authority controller, scene-transition-policy runtime,
  session-utils, overlay-session-state controller/contract, NavSilhouetteHost,
  scene-policy-registry, use-app-route-shared-sheet-runtime, app-search-route-command-
  runtime, ADDING_A_SCENE.md.
- **Strip wave (Strip agent)**: PersistentSheetHeaderHost.tsx,
  app-route-persistent-header-registry.ts, scene-foundation-spec.ts, SegmentedToggle,
  FrostedFilterStrip (deleted), panels (BookmarksPanel, ListDetailPanel, PollsPanel),
  useBottomSheetSceneStackBodyContentRuntime.tsx, SceneBodyFoundationSurface.tsx,
  reorder/\*, ShareModalHost, polls-feed runtime files.
- **Transition-perf session**: the whole `screens/Search/runtime/shared/
use-results-presentation-*` family, search map controllers/stores,
  SearchMapRenderController.swift, AppOverlayRouteHost, SearchOverlayRouteSheetSurfaceHost,
  SearchMountedSceneBody, app-route-polls-scene-input-controller.
- **CLEAN (leg-6 core build surface)**: `app-route-scene-switch-controller.ts`,
  `app-route-scene-stack-runtime.ts`, `BottomSheetSceneStackHost.tsx`,
  `BottomSheetSceneStackBodyLayer.tsx`, `transition-lane-player.ts`,
  `OverlayHeaderActionButton.tsx`, `nav-out-derivation-store.ts`, all `panels/`
  spinner files except the three strip-wave panels.

Leg-6 rule: before editing PersistentSheetHeaderHost, NavSilhouetteHost, the three
shared panels, or scene-foundation-spec — diff first, PRESERVE the in-flight changes,
note the merge in the ledger.

---

## 5. What leg 6 builds (after owner ratifies)

1. PF-derived chrome fields (`isChildSceneRevealed`, `headerNavAction`) + delete the
   nav-out store/writer. 2. `HeaderNavAction` rotation button host-mounted; per-scene
   Action close factories die; `headerActionPolicy` dies; one of the two action-button
   controllers dies. 3. `SceneBodyReadyGate` + the 10-file spinner sweep + Button
   squircle + the panels ActivityIndicator lint ban. 4. chromeAck join on the reveal
   (+ watchdog + RED bark). 5. Nav re-tap named intent. 6. ADDING_A_SCENE.md updates
   (skeleton table name, row-3 hardening note, header-action law). Verify per the
   testing methodology: composite-level (screen recording frame-steps of push/dismiss
   on listDetail + messages + settings + tab switches), plus the RED contracts above.
