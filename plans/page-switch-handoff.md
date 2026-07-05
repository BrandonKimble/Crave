# Page-Switch Redesign — Session Handoff

**Last updated:** 2026-07-03 · **Status:** merged to `main` (`4eeaa27b`), UX shape built + happy-path
verified on-device; owner finger-test of a few edge cases still pending.

This doc hands off the nav **page-switch redesign** + the **zero-JS-switch frame-fix** to a fresh
session. Read this first, then the deeper docs it points to.

---

## 1. What this effort is

A **ground-up redesign of nav-page switching** (Search ↔ Favorites ↔ Profile, with a poll docked at the
bottom) and the child-page transitions (restaurant / poll-detail / poll-creation / save-list). It replaced a
buggy switch (content vanished / wrong page showed on a nav tap) with a single-authority, UI-thread-driven,
instant-feeling switch.

**Owner requirements (the north star):**

1. **Instant on press-up** — content switches immediately, or instantly to a **skeleton** first if content
   isn't ready (skeleton reveals the real content when ready). Every page must be able to show a skeleton.
2. **One shared persistent header** — never unmounts; only the body under it swaps. Header **title/action
   switch immediately** on press-up.
3. **Standardize on ONE header shape** (circle close-cutout on the right + title on the left; the poll
   header's extra count-cutout was removed).
4. **Tunable snap transitions** — easy config for how pages move between snap points, both directions, for
   nav pages AND child/trial sheets.
5. **Search results as a real page** (skeleton page), not a self-frost cover.
6. **Per-page detent memory** + **grab-handle promote** (a header/grab tap can raise a page to its next snap,
   but NEVER dismisses — only the close button dismisses).

Full requirements + phase history: **`plans/page-switch-master-plan.md`**. Product backlog for this area:
**`product/map.md`**, **`product/search-and-dishes.md`**.

---

## 2. The architecture (what a new session must understand)

The switch is driven by a **single-writer PresentationFrame (PF)** and rendered by a stack of **co-mounted
legs** whose _visibility is UI-thread (SharedValue) driven_, so a switch does minimal synchronous React work.

- **PresentationFrame (PF)** — the one source of truth: `{ activeSceneKey, presentedSceneKey, outgoingSceneKey,
laneKind, switchId, revision }`. All consumers derive from it. Files:
  `navigation/runtime/app-route-presentation-frame-contract.ts`, `use-presentation-frame.ts`.
- **Co-mounted legs** — every scene is mounted at once; a switch just changes which leg is _visible_. The
  legs live in `overlays/BottomSheetSceneStackHost.tsx` (the heart of the system — read it).
- **SV swap-lane (`liveSwapRoles`)** — a `SharedValue<{presented, outgoing}>` written **synchronously in the
  PF subscription** (off the React commit). The leg's opacity + zIndex + elevation + pointerEvents all ride
  worklets off this SV, so the visible leg flips on the next **UI frame**, independent of commit weight.
- **role-as-prop (the frame-fix, 2026-07-03)** — the surface host computes each leg's role
  (`idle|incoming|outgoing`) **in its render body** (`computeLegRole`) and passes it as a `legRole` **prop**.
  Every leg's memo comparator includes `legRole`, so a switch re-renders **only the 2 involved legs**
  (incoming + outgoing), synchronous-in-render (Commit-A). The 5 uninvolved legs skip both re-render and
  commit. (We chose prop-drilling over a `useSyncExternalStore` leaf store because the store notifies
  one commit late, which would break the Commit-A skeleton/paint-ack lanes.)
- **Stable ports context** — `SceneStackTransitionDisplayContext` carries only identity-stable services
  (`player`, `liveSwapRoles` SV, `contentMode`, the paint-ack callbacks) — **no volatile role fields**. Two
  gotchas that were load-bearing: `useTransitionLanePlayer` must **memoize its return object**, and
  `inFlightContentMode` must be keyed on its **semantic mode** (not on effectiveIncoming/Outgoing) — otherwise
  the context re-mints every switch and every leg re-renders (this bit us; see `transition-lane-player.ts`).
- **Paint-ack + hard-swap + skeleton** — content does a **paint-ack-gated hard swap** (NOT a crossfade). The
  incoming body's first `onLayout` calls `reportScenePaint` (now **unconditional**; the surface host re-gates
  on `effectiveIncomingRef`/`isTransitioningRef`) → `player.markPaintAck()` reveals it. A **cold** leg (body
  not yet loaded) shows a **cutout-shimmer skeleton** until content arrives. A **warm/retained** leg never
  re-fires `onLayout`, so there's a **synthetic warm-leg ack** (`hasPaintedSceneKeysRef`). ← these are
  **load-bearing correctness fallbacks**, do not "clean them up".
- **One persistent header** — `overlays/PersistentSheetHeaderHost.tsx` renders every scene's header from
  `navigation/runtime/app-route-persistent-header-registry.ts`; title/action swap per PF in the same frame.

### Key files

| Concern                                        | File                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| PF contract + React bridge                     | `navigation/runtime/app-route-presentation-frame-contract.ts`, `use-presentation-frame.ts`                                               |
| The legs / role-as-prop / worklets / paint-ack | `overlays/BottomSheetSceneStackHost.tsx`                                                                                                 |
| Body layer / activation / skeleton             | `overlays/BottomSheetSceneStackBodyLayer.tsx`, `BottomSheetSceneStackPageFrame.tsx`, `BottomSheetSceneStackDecorLayers.tsx`              |
| Persistent header                              | `overlays/PersistentSheetHeaderHost.tsx`, `navigation/runtime/app-route-persistent-header-registry.ts`, `overlays/*-header-live-state.*` |
| Transition player (settle ramp + paint-ack)    | `navigation/runtime/transition-engine/transition-lane-player.ts`                                                                         |
| Sheet motion / snap descriptor table           | `navigation/runtime/app-route-sheet-motion-descriptor-table.ts`, `app-route-scene-motion-*.ts`                                           |
| Scene-stack runtime (admission/retention)      | `navigation/runtime/app-route-scene-stack-runtime.ts`                                                                                    |
| List body surface (scroll runtime)             | `overlays/BottomSheetSceneStackListBodySurface.tsx`, `useBottomSheetShared*Runtime.tsx`                                                  |

---

## 3. Current state (what's done vs pending)

**Done + merged to main:**

- The PF single-writer architecture, co-mounted legs, SV swap-lane.
- role-as-prop frame-fix: only the 2 involved legs re-render per switch (measured: leg re-renders 104→26,
  dropped-frame estimate 23→15, median commit gap 41→32ms, profiler-off).
- One persistent header, per-page detent memory, grab-handle promote.
- Hard-swap + skeleton content model.
- Favorites-as-search (favorites render through the search results surface; FE + backend).
- Search-system refinements + a frozen search-quality harness (`apps/api/scripts/search-harness/`).
- Mapbox platform upgrade to `@rnmapbox/maps` 10.3.1 / iOS SDK 11.26.0-rc.1.

**On-device verified (happy paths):** nav switches (0 wrong-page / anomaly / watchdog), search reveal →
skeleton → results, search dismiss (return-to-origin), warm switches smooth + content instant.

**NOT yet owner-finger-tested (the real gate — do this first):**

- **Cold page-frame skeleton**: first-ever open of `restaurant` / `saveList` / `pollDetail` (page-frame legs
  using `SceneStackBodyContentLayerHost`'s skeleton). Structurally verified + the analogous search skeleton
  works, but not driven on-device (Maestro can't reliably tap those). **Tap a body row on the first visible
  frame** to confirm touch-routing, and confirm it reveals (never blank frost).
- The overall _feel_ (instant / centered / seamless) across all pages — the eye is the oracle.

---

## 4. Immediate next steps for the new session

1. **`yarn install` && (cd apps/mobile/ios && pod install)`** — `main` currently has 2 transient typecheck
   errors (`search-map.tsx`, `use-search-runtime-camera-intent-runtime.ts`) because the map code uses new
   Mapbox-API fields; the 10.3.1 upgrade is on `main` but `node_modules`/pods aren't reinstalled yet. The
   reinstall clears them.
2. **Finger-test the cold page-frame skeleton** (§3) + the overall switch feel.
3. Address any remaining requirements from `plans/page-switch-master-plan.md` (e.g. per-page skeleton polish,
   tunable-snap ergonomics).

---

## 5. Process knowledge / gotchas (hard-won — don't relearn these)

- **Sim:** iPhone 17 Pro `7B0DD874` (this effort), Metro on **:8081**, logs to `/tmp/crave-metro.log`.
  Reload the dev client via `crave://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`. (A second
  sim, iPhone 17 Pro Max `8116E09B` on Metro :8083, runs the parallel **map-LOD** effort out of a separate
  clone `/Users/brandonkimble/Crave-map` — leave it alone.)
- **RN `console.log` does NOT go to `simctl log stream`** — it goes to Metro's stdout → grep
  `/tmp/crave-metro.log`. Debug probes: `[pageswitch]` (frame/liveSwap/motion/host/activity/body),
  `[READYGATE]`. These are **kept on purpose** for finger-testing — do not strip them.
- **Measuring the switch stall:** `crave://perf-scenario?scenario=external_flow&jsSampler=true&durationMs=…`
  → `[SearchPerf][JsFrameSampler]` stall/window events. **CRITICAL LESSON:** the `React.Profiler` is a ~20ms
  per-switch **observer effect** that inflates the sampler — always measure with the profiler OFF (there's a
  kill-switch pattern: make `handleProfilerRender` return null in
  `screens/Search/runtime/shared/use-search-runtime-profiler-instrumentation-runtime.ts`). Profiler-off truth
  for a switch: ~32ms median (surface-host render + Fabric commit) — **near the practical floor for a React
  switch**; literal-zero JS would need an imperative/SV-only switch rewrite (out of scope). The slide itself
  is a Reanimated spring (UI thread) so it's smooth regardless; content is instant (co-mounted + SV lane).
- **Metro cold-launch serves the last FULL bundle, not HMR patches** — force a fresh bundle before validating:
  `curl -s -o /dev/null "http://localhost:8081/apps/mobile/AppEntry.bundle?platform=ios&dev=true"` (watch for
  a multi-second rebuild). After a runtime-module edit, force a full reload, not a `(1 module)` HMR patch.
- **Maestro:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@17`; **integer** tap percentages only; **block**
  YAML form (inline `{point: …}` fails to parse); on the gesture-handoff sheet, `tapOn: id:` a testID is
  reliable where coordinate taps get eaten by the pan gesture. Flows live in `maestro/perf/flows/` (e.g.
  `p2-nav-switch-repro.yaml`, `warm-switch-only.yaml`, `p4-cold-tab-*.yaml`).
- **Attribution rule:** for a runtime/state bug, **instrument the running app yourself** — static reading
  gives confident-but-wrong answers here. Instrument the COMPOSITE (what the eye sees), and make every metric
  able to show RED.
- **Load-bearing "fallbacks" — DO NOT delete** (they look removable but are correctness): the pre-first-SV-write
  role fallback (`resolveLiveLegRole` when `liveSwap==null`), the synthetic warm-leg paint-ack, the
  `reservedHeaderHeight ?? OVERLAY_TAB_HEADER_HEIGHT` header-inset fallback, the same-scene re-entry →
  incoming, the held-hold paintAck/settleRamp pins, the roles-change guard.

---

## 6. Related memory + docs

- Auto-memory (loaded each session): `page-switch-redesign` (canonical), `map-architecture-shipped`,
  `testing-methodology-instrument-composite`, plus the per-topic notes it links.
- `plans/page-switch-master-plan.md` — the full requirements + phase (P1–P6) history.
- `CLAUDE.md` — workflow rules (solo dev, commit straight to main), the Metro/sim gotchas.

---

## 7. Cleanup status (2026-07-03)

A focused cleanup pass over all 46 subsystem files found it **already essentially clean** — the ground-up
redesign deleted its own scaffolding, and the earlier tree-wide sweep caught the rest. An independent thorough
verification (ESLint + targeted greps over all 45 present files) surfaced exactly **one** genuine removal:
the unused `routeSceneRuntime` threaded into `useSearchRoutePollDetailPanelSpec` (removed; tsc-clean).

**Deliberately KEPT (looks removable, is not):** the `ContentMode` union's extension arms
(`held-dissolve`/`instant-on-paint-ack`) + `resolveContentLaneOpacities` `_ramp`/`_mode` params (documented
descriptor-shape/extension points; `settleRamp` still times `onSettle`); the `'header'` chrome-surface concept
(distinct from the deleted per-leg header lane — still read via `excludedSurfaces`); the `_surfaceVisualPolicy`
exclusion destructure (intentionally kept OUT of the forwarded input); the `source` attribution params on
`recomputeAll`/`recomputeRuntimeReseed` (finger-test attribution — the fix is to _use_ them, not delete);
`SheetDiagSnapshot` (diag scaffolding). Zero commented-out blocks, zero feature-flag/AB residue, no leaf-store
remnants — confirmed.
