# World-camera L3 — ProfileBody worlds: execution plan

**Status:** designed 2026-07-10 (~4:45AM) from a full terrain survey, for a FRESH focused
session. Parent: `plans/world-camera-multilocation-foundation.md` §2/§4-item-1/§5-L3.
Companions: `plans/world-camera-l1-execution.md` (restaurantOnly map + L1.c sequencing —
its profile-adjacent arms land HERE), L2's pure `resolve-focus-camera.ts` (shipped 640e98f5)
plugs in here, and the L5 resolver roll-up shipped 9e656bc4.

## The strangler seam (the survey's key finding)

**`profileSeed` is a reserved-but-unwritten identity kind** — defined in
`search-desired-state-contract.ts:52-57` ("the seed payload IS the world", zero-network),
cards-key + equality + write-cause `'profile_seed'` all exist, `deriveEntrySurface` already
maps it to `'profile'`. NOTHING writes it, and `search-world-fetch.ts:231` throws
`unrouted identity kind` for it (loud by design). **The live lane can land FIRST, additively,
with the parallel machine coexisting until proven — then the machine is deleted whole.**

## The parallel machine (dissolves as ONE joint after the lane is proven)

- The 7-file `navigation/runtime/app-route-profile-prepared-presentation-*` family
  (transaction/snapshot/resolver/transition/settle/completion/dismiss — one closed
  transaction graph; camera rides as snapshot `targetCamera`/`restoreCamera` →
  pre_shell command / close routeIntent → normalizer `cameraIntent`).
- The execution plumbing: `profile-prepared-presentation-entry-runtime.ts` (:31-80 —
  `openPreparedProfilePresentation`/`close.../focusPreparedProfileCamera`) + the
  `profile-prepared-*` executor/binding/event files + open/close/focus builders.
- The warm-seed choreography: `openRestaurantProfilePreview`
  (`profile-preview-action-runtime.ts:23` → `profile-preview-action-execution.ts:41`;
  callers: launch-intent :164,190, recents :53,92,125, autocomplete suggestion :100, map
  command :54) + `seedRestaurantProfile` (`profile-panel-seed-runtime.ts:38`) +
  `pendingRestaurantSelectionRef` (declared `use-search-root-search-primitives-runtime.ts:29`;
  producers launch-intent :159 + recents; consumer `use-search-root-profile-owner-runtime.ts:81-83`).
- The auto-open web: `resolveProfileAutoOpenAction` (`profile-auto-open-action-runtime.ts:21-99`,
  two lanes: pending-selection + single-candidate w/ `lastAutoOpenKey` dedupe);
  `profile-open-presentation-plan-runtime.ts:49-93` (reads restaurantOnlyId :24 — the L1.c
  coupling); the submit-owner refs (`lastSearchRequestIdRef` truthful via onWorldCommitted
  :323-325; single-restaurant collapse + `resetSheetToHidden` :299-308; `lastAutoOpenKeyRef`).
- restaurantOnly (84 refs, map in the L1 plan) + seeded markers
  (`profile-panel-hydration-runtime.ts:61-64` publish + `focusSeededMarkerCamera`).

**STAYS (not part of the machine):**

- `use-restaurant-entry-pop-teardown-writer-runtime.ts` — the working camera-restore /
  teardown owner; the ProfileBody dismiss RIDES it (L2 adjudication).
- `CameraIntentArbiter` (`camera-intent-arbiter.ts:45-311`) — the low-level single-writer
  camera EXECUTOR (gesture-guard, tokens, last-write-wins). L2's declarative CameraIntent
  FEEDS it; it is the mechanism, not the machine.
- `profile-panel-hydration-runtime` hydration core (cache-first profile data) — the
  ProfileBody world's body data source; only its seeded-marker/camera side effects move.

## Slices

**L3.a — the `profileSeed` live lane (additive; machine coexists).**
Route it in `search-world-fetch.ts` (zero-network synthesis: the world's catalog = the one
restaurant group — needs the restaurant profile fetch for locations; "zero-network" means
no SEARCH round trip; profile hydration cache-first supplies the body); world value carries
`restaurantOnlyId: null` already (`search-world-value-constructor.ts:161` stub becomes
real). Camera: `focus` via the shipped `resolveFocusCamera` fed by the P5 anchor pair.
Producer: NONE yet (prove via a rig-only write first — RED probe: the unrouted throw dies).

**L3.b — the taps cut over.** `resolveEntityRefAction`'s restaurant arm becomes the
one-line `profileSeed` tuple write (executor: `use-entity-ref-action-executor.ts` — note
the survey agent couldn't find it by its S-D name; it exists, navigation/runtime/);
autocomplete suggestion + recents + map command + launch-intent restaurantWorld branch all
route through it. The warm-seed dies (the panel seeds from the world value); the committed
single-restaurant search + auto-open web dies with it (a profile IS a world now — no
collapse detection needed for these lanes; ⚠️ adjudicate the NATURAL-query single-result
collapse separately: "pizza" resolving to one restaurant still needs auto-open or an owner
call to keep the results list).
**L3.c — the deletion.** The 7-file family + plumbing + warm-seed + pending-selection +
auto-open pending-branch + restaurantOnly (the L1.c arms incl.
`profile-open-presentation-plan-runtime.ts:24`) + seeded markers. Camera restore on
dismiss = the pop-teardown writer (already owns it).
**L3.d — L2 integration rides here:** camera-in-origin ({center,zoom} on OriginSnapshot,
captured at push) replaces the machine's `restoreCamera` snapshot plumbing; the reveal
joint's camera track starts at ramp start.

## Rig proof per slice

- L3.a: probe-write profileSeed → world resolves, no unrouted throw, camera focus fires.
- L3.b: poll-span restaurant tap, autocomplete restaurant, recents restaurant, deep-link
  /r — all present the profile world; X/back pops to exact origin incl. camera
  (the S-D rig levers: 'View <name>' a11y tap; poll seeding via POST comments w/ perf token).
- L3.c: full deletion sweep + the three-shape dismiss sweep + zero NAV-CONTRACT fires.
- Owner finger: camera feel on open (focus-fit vs today's motion) + terminal-dismiss restore.
