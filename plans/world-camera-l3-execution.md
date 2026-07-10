# World-camera L3 — ProfileBody worlds: execution plan

**Status:** designed 2026-07-10 (~4:45AM) from a full terrain survey, for a FRESH focused
session. Parent: `plans/world-camera-multilocation-foundation.md` §2/§4-item-1/§5-L3.
Companions: `plans/world-camera-l1-execution.md` (restaurantOnly map + L1.c sequencing —
its profile-adjacent arms land HERE), L2's pure `resolve-focus-camera.ts` (shipped 640e98f5)
plugs in here, and the L5 resolver roll-up shipped 9e656bc4.

---

## ⚠️ PROPOSED RE-ADJUDICATION (2026-07-10 ~5AM) — the more ideal L3: NO ProfileBody world

**Sizing the body-union cut against the code surfaced that the premise may be stale.** The
owner ratified "ProfileBody as a peer world kind" on 2026-07-08 — BEFORE S-B (entries as
values, origin capture/restore), S-C (search de-specialed, pops own their teardown), and
S-C.5 (the pop-teardown writer owning camera restore) existed. With those landed, everything
the profile "world" was designed to provide already exists as composable primitives:

- **Push/pop with exact origin restore incl. camera** — the route entry + origin-on-entry +
  the pop-teardown writer (rig-proven for months of this effort). A world adds nothing here.
- **The map relationship** — the profile's catalog/camera needs are EXACTLY L4's selection
  overlay on the L1 group substrate: select the restaurant's group → all locations promote
  (budget-EXEMPT, Q5 extend-not-displace), camera = focus (L2's shipped focus-fit),
  deselect on pop → roles recompute, camera restores. Profile-over-a-search-session keeps
  the session's catalog and selects into it — which is ALSO the owner's stated ideal for
  in-search selection. Profile-from-home = the same selection over a one-group catalog
  (published directly under L1 — the seeded-marker channel's honest replacement).
- **The body data** — profile hydration (cache-first) already owns it; no world resolution
  adds value on top.

**Under this shape L3 becomes:** open profile = `push(restaurant entry)` + `selectGroup(id)`;
dismiss = pop (existing restore) + `deselect`. The 7-file prepared-presentation machine, the
warm-seed choreography, pendingSelection, auto-open's pending branch, restaurantOnly, and
seeded markers ALL still die (L3.c unchanged) — but they dissolve into push+selection+
hydration instead of into a widened search-world pipeline. The `profileSeed` identity kind
and the body-union cut below become UNNECESSARY for profiles (delete the stub identity);
the body union remains the right shape for **ListBody** (lists ARE result sets — the world
pipeline is their natural home) and lands with listDetail instead.

**Consequences:** L3 collapses to ~L4's selection substrate + the deletion sweep; L4 stops
being a separate layer (profile open IS its first consumer); the natural-query
single-result auto-open keeps working unchanged (it opens a profile OVER its results world
— exactly the selection model). The reveal-joint camera track (L3.d) attaches to the child
push transition instead of the world reveal.

**ADJUDICATED ACCEPTED (2026-07-10 ~5:35AM, under the owner's standing ideal-mandate —
"nothing set in stone; chase the true ideal with new context"; REVERSIBLE by the owner,
who ratified the original §2 before S-B/S-C existed).** Execution order: the dissolution
trace below → profile open/close cutover to the standard child-push path → the L3.c
deletion sweep (machine + restaurantOnly + seeded markers + z-lift with its selection
consumer) → camera-in-origin. The body union survives for ListBody, landing with
listDetail. The original ProfileBody slice plan below is RETAINED FOR THE RECORD only.

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

> **SCOPING FACT (read of the fetch table, 2026-07-10 ~4:50AM):** the world VALUE is
> SearchResponse-centric — §2's `World.body` union (ResultsBody | ProfileBody | ListBody)
> does not exist in code. The entity-restaurant lane already runs a structured
> single-entity SEARCH producing a results world the profile auto-opens OVER; profileSeed's
> "zero-network" promise means replacing that round trip with the profile fetch
> (cache-first) as the world's data. So L3.a's real first move is the BODY-KIND AXIS on
> the world value (constructor + seam + panel attach), with profileSeed synthesizing a
> ProfileBody world from the hydration payload — not a SearchResponse look-alike. Do not
> shortcut this with a synthesized single-restaurant SearchResponse: that would re-encode
> the auto-open-over-results shape the stride exists to dissolve.
>
> **Sizing (verified in the seam):** `SearchWorldValue.committedResponse: SearchResponse`
> is REQUIRED and the seam commit pipes it into the mounted-results store, root-bus patch,
> and marker projections (`search-world-presentation-seam.ts:51-64`). The axis therefore
> means a body-discriminated value — `body: {kind:'results', committedResponse, …} |
{kind:'profile', restaurantId, profile, group}` — with the seam's commit steps
> body-dispatched (results steps unchanged verbatim; profile steps = panel seed + catalog
> publish + camera focus). Start the cut at the seam's commit function: list its steps,
> classify each as body-agnostic vs results-only, and let that classification BE the
> union's shape.

> **The commit-step classification (read 2026-07-10 ~4:50AM,
> `search-world-presentation-seam.ts:146-280`) — this IS the union's shape:**
>
> | step                                                                             | body-agnostic?                                                                                                                                                                               |
> | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | represent-noop branch (:163-194, identity compare + operation completion)        | ✅ agnostic                                                                                                                                                                                  |
> | rowCount/totals contract check (:199-212)                                        | results-only                                                                                                                                                                                 |
> | `publishSearchMountedResultsDataSnapshot(committedResponse, projections)` (:213) | SPLIT: marker projections agnostic (a profile world publishes its one-group projection); the response rows results-only — the mounted store needs a body-aware publish, NOT a faked response |
> | coverage commits (:218-229)                                                      | results-only                                                                                                                                                                                 |
> | surface-authority hydration keys (:230-239)                                      | results-only in content; the profile world's REVEAL READINESS analog = panel-body-ready (the redraw contract's 'cards' weld becomes body-dispatched)                                         |
> | root-bus patch + pagination (:240-253)                                           | results-only except presentedWorldId/phase (agnostic)                                                                                                                                        |
> | `onPageOneResultsCommitted` choreography (:255-267)                              | ✅ agnostic — the enter-txn weld every body needs                                                                                                                                            |
> | `onWorldCommitted` → lastSearchRequestIdRef (:268)                               | dies with the auto-open web in L3.c                                                                                                                                                          |

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

---

## THE DISSOLUTION TRACE (2026-07-10 ~5:40AM — the cutover is now mechanical)

**Open, ordered effects:** only THREE machine-only effects exist, all self-contained:
(0) the snapshot/openSettle ledger write (`transition-runtime.ts:39-63`), (2) the
`transition.status` write, (3) the settleToken/settle-callback plumbing. The actual
navigation (push 'restaurant' + openChild) and the camera (arbiter) are standard-path.
The pre_shell camera rides `commitProfileCameraTargetCommand`
(`profile-native-command-runtime.ts:38-63`) — NOT the route cameraIntent (resolver nulls
it) — and folds into the camera-intent-arbiter as the sole open-camera owner.

**Completion consumers:** the ENTIRE settle/dismiss/preparedTransaction ledger is
class-(a) self-contained (no reader outside the machine family). The two exceptions:
`isPresentationActive` (`profile-view-state-runtime.ts:34`) re-feeds from ROUTE-ENTRY
PRESENCE (`selectHasRestaurantEntry`) + panel snapshot — every profilePresentationActiveRef
consumer then needs zero change; and the pop-writer's `isMachineCloseInFlight` guard
(`profile-owner-action-surface-runtime.ts:96-102`) is DEAD once the machine dies (it only
existed to yield to the machine's close).

**Close verdict — ONE owner:** the machine close's `cameraIntent(restoreCamera)` and the
pop-teardown writer's `focusPreparedProfileCamera(savedCamera)` read the SAME savedCamera
(snapshot copies it at `snapshot-contract.ts:79-87`) and are mutually exclusive by the
guard above. Delete the machine → the standard pop + the pop-teardown writer is the sole
close/camera-restore owner. Sheet motion selection is already a descriptor-table concern.

**Snap:** `shouldForceSharedMiddleSnap`/promoteAtLeast-middle is FULLY REDUNDANT with the
openChild descriptor row (`app-route-sheet-motion-descriptor-table.ts:104-109`); only the
resultCard `preserveLiveY` variant needs a sheetMotion on the standard push if that feel
is kept.

**Deletable (verify importers on 17-20 first):** the 8-file navigation family
(transaction/resolver/snapshot/transition/settle/completion/dismiss contracts+runtimes +
focus builder) + 12 screens/profile files (transaction/state/command/completion/event/
entry runtimes, open/close builders, runtime+contract+binding shims, profile-app-route
bridge, native-command runtime, prepared-snapshot-key runtime). **Survivors:**
`resolveProfileCloseRouteAction` + camera-intent helpers in the normalizer; the WHOLE
pop-teardown writer (sole owner); `handleRestaurantEntryPopped`/finalize/prepare in the
action surface (guard clauses pruned); `isPresentationActive` re-fed;
`searchRestaurantRouteController` (the standard path); the arbiter;
`ProfileTransitionState.savedCamera/savedResultsScrollOffset/status` (completionState
fields removed); the profilePresentationActiveRef bridge unchanged.

## Cutover slice 1 addendum (2026-07-10 ~5:45AM — the model's full input contract)

`resolveProfilePresentationModel` (profile-view-state-runtime.ts) derives FIVE facts from
`transitionStatus`, not just `isPresentationActive`:

- `isPresentationActive` → re-feed: route-entry presence OR panelSnapshot != null.
- `isOverlayVisible` (consumer: results-sheet suspension,
  `use-search-root-results-presentation-state-runtime.ts:24,37,48`) → re-feed:
  route-entry presence (the stack fact — S-C.5 slice-A proved it the MORE correct signal).
- `activeOpenRestaurantId` (consumer: auto-open dedupe) → re-feed:
  entry-present ? panelSnapshot?.restaurant.restaurantId : null.
- `isTransitionAnimating` (consumer: same results-presentation runtime :26,49) → re-feed:
  the scene-switch in-flight fact for the restaurant switch (PF outgoing/pending — plumb
  from the route authority; verify which exact signal at the wiring site).
- `preparedSnapshotKey` → dies with the machine (its runtime is deletable #20).

Wiring site: `createProfilePresentationModelRuntime` is created ONLY by
`profile-owner-presentation-view-runtime.ts:47`; the profile OWNER runtime
(`use-search-root-profile-owner-runtime.ts`) already holds `routeOverlayNavigationAuthority`
(it registers the pop-teardown writer at :15) — plumb `hasRestaurantRouteEntry` +
`isRestaurantSwitchInFlight` from there into `profileShellState` and the model derives
everything; `transitionStatus` leaves the input contract. The shell-state PUBLISHER
(`profile-shell-state-publisher.ts`) keeps writing status until the machine deletion slice,
so slice 1 is behavior-parity by the S-C.5 one-frame argument.
