# Page-Switch Master Plan — the Committed-Presentation-Frame Architecture

**Canonical source of truth** for the nav-page-switch redesign (2026-07-01). This is the actionable
synthesis of the 9-agent design panel (`w3lj3g6zs`) + the owner requirements, and it SUPERSEDES the
crossfade/fold-up lineage. It EXTENDS `transition-engine-final-master-plan.md` (hard-swap + skeleton +
dismiss=inverse) with the nav-page specialization the final-master-plan under-specified: the single
PresentationFrame, the persistent header, and uniform skeleton legs. `transition-pillars-build-plan.md`
(fold-up lineage) is **RETIRED**. The old "transition with fading/crossfades" is **RETIRED** — switches are
HARD-SWAP to skeleton, reveal in place, dismiss = the inverse of the trigger path.

Requirements + attribution + KEEP/REDO detail live in `page-switch-redesign.md` (§1–§6); this doc is the
build spine. Scope: nav-page + child-page switches. Search QUERY flows are out of scope (only the search
LEG structure changes). iOS-first (consistent with the map work).

---

## 0. THE ONE IDEA

Every "what's on screen" decision collapses onto **ONE immutable value, committed once per switch by the
single scene-switch authority, read as a pure function by every consumer.** Leg-that-paints and
leg-that-has-a-body can no longer disagree, because they read the same value. The bug class is deleted
structurally, not patched.

## 1. THE PRESENTATION FRAME (PF)

`AppRouteSceneSwitchController` (already the single-writer of `activeSceneKey`) computes and publishes, in
the SAME atomic `setTransitionState` that commits a switch, exactly one:

```
PresentationFrame = {
  switchId: number,                    // monotonic; ties a frame to its switch
  activeSceneKey: OverlayKey,          // ROUTE TRUTH → drives the header title
  presentedSceneKey: OverlayKey,       // what the visible leg is; == activeSceneKey EXCEPT the ONE
                                       // legal divergence: laneKind==='docked-polls' → 'polls' under search-home
  outgoingSceneKey: OverlayKey | null, // the leg held for a bounded crossfade during a hard-swap reveal
  bodyReady: boolean,                  // is presentedSceneKey's body attached + painted? (else show its skeleton)
  laneKind: 'top-level' | 'docked-polls' | 'child',
  contentMode: 'content' | 'skeleton',
  snapIntent: TabOverlaySnap,          // the detent this switch resolves to (from the descriptor table)
  originRef: OriginSnapshot | null,    // for dismiss=inverse (child/return flows)
}
```

Resolved ONCE from the fresh resolved target: `transitionContract.targetSceneKey ?? pendingSceneKey ??
routeActiveSceneKey` (the exact signal the deny-list already trusts, `native-overlay-target-authorities.ts:365`).
Published via ONE dispatch target. **Every consumer is `PF => ...`:** leg opacity (`resolveSceneStackLegRole`),
body attach (`createSceneActivitySnapshot`), header title (HeaderModel), snap intent, plate. `laneKind`
REPLACES the `isPersistentPollLane` scalar that was re-read (and re-derived) by 4 consumers.

## 2. INVARIANTS (asserted in `__DEV__`, each fires on exactly one repro symptom)

- **S1 (wrong-page):** at most one leg is non-idle besides `PF.outgoingSceneKey` during a token-bounded held
  crossfade, and it === `PF.presentedSceneKey`. (docked-polls is encoded via `laneKind`, not naive equality.)
- **S2 (blank):** every visible leg is `bodyReady` OR rendering its OWN non-null skeleton — never visible+empty.
- **H1 (header-vanish):** the header node identity is stable across all switches;
  `title === HeaderModel(PF.presentedSceneKey ?? PF.activeSceneKey)` — PRESENTED-first (amended §9.5-b:
  the header titles what the sheet PAINTS; under docked-polls that is the polls feed on the search root).
- **SR1 (search-blank):** the 'search' leg never renders null while presented.
- **T1 (descriptor completeness):** every switch resolves to exactly one descriptor row; `dismiss.to === origin.snap`
  (the dismiss clause is superseded by §9.5-a's P6 re-scope — pending owner sign-off; the row-completeness half stands
  and is spec-pinned in `app-route-sheet-motion-descriptor-table.spec.ts`).

## 3. THE HARNESS (P1 — built BEFORE any resolution edit; the regression gate for every phase)

- **Driver:** a Maestro nav-tab flow replaying the exact owner repro order (Search→Favorites→Search→[move
  sheet]→Favorites→Search→Favorites→Profile→Favorites→Profile→Search). `tapOn: id:` on the nav testIDs;
  integer percentages only. Force a fresh FULL bundle + a `[pageswitch-vN]` marker per run.
- **Probe:** a `__DEV__` `[pageswitch]` JSONL line once per committed frame at `ActiveSceneStackSurfaceHost`:
  `{t, switchId, sheetHost_displayedSceneKey, sceneStack_activitySceneKey, host_effectiveDisplayedSceneKey,
searchSurfaceOwnsVisibleSheet, legs:[{key,legRole,opacityGt0_5,bodyChildIsNull}], headerTitle, snap}`.
  console.log → Metro stdout → grep `/tmp/crave-metro.log`.
- **Definition of done (per phase):** replay the FULL repro; per settled frame `activeScene == visibleBody ==
headerTitle == the tab pressed`, snap == the configured detent; NO blank frame, NO wrong-page frame across
  ALL steps; retained round-trip (Favorites→Profile→Favorites) shows content both times, no skeleton blink.

## 4. KEEP (substrate is ~60% ideal — do not rewrite)

Co-mounted absolute-fill leg siblings; the Phase-0 frost hoist; the paint-ack player
(`transition-lane-player.ts` — already does hard body swap + instant header swap on one paintAck: THIS is
the hard-swap/skeleton mechanism, repurpose as a decoration); the route reducer (setRoot/push/closeActive/
popToRoot); the single-writer `activeSceneKey`; the transition-policy resolver SHAPE; the descriptor CONTRACT
shape; `OverlaySheetHeaderChrome` as the header VISUAL; `SceneLoadingSurface` cutout skeletons; the single
sheet + kept spring at rest.

## 5. REDO (the resolution layer — where the bug lives)

The 3-site "presented scene" derivation → PF; `isPersistentPollLane` scalar → `PF.laneKind` (delete the
deny-list band-aids); per-scene header → persistent hoisted header; the poll badge cutout → deleted; the 3
blank-holes → skeleton-or-content; the bespoke search leg + self-frost cover → uniform leg + real skeleton;
instant-switch gating → all nav switches commit instantly; the dead sheet-Y descriptor lane + scattered snap
switch → the descriptor table with a real sheet-Y lane, dismiss=inverse.

## 6. PHASES (full send P0–P6; the harness gates each)

- **P0 — poll header cutout (free, no deps).** Delete the poll-count badge cutout
  (`OverlaySheetHeaderChrome.tsx:174-190` + badge props + the `{badge}` row slot) + `PollsHeaderBadge`
  (`PollsPanel.tsx:406` + plumbing) + dead `OverlaySheetHeader.tsx` + `useHeaderCloseCutout.tsx`. Result:
  every header = right close-circle cutout + left title. (Owner req 2c.)
- **P1 — harness + attribute (GATE).** Build §3's probe + invariants + Maestro driver on the CURRENT code;
  reproduce + PIN the bug with data (confirm displayedSceneKey ≠ activitySceneKey on blank frames;
  non-idle-leg-key ≠ routeActiveSceneKey on wrong-page frames) BEFORE editing the resolution layer.
- **P2 — PF core (atomic; kills the bug).** Introduce PF from the controller; rewire leg-opacity +
  body-attach + header-title to read PF; DELETE the sheet-host cascade (`app-route-sheet-host-authority-
controller.ts:1045-1120`), `resolveSheetPresentationSceneKey` + `resolveTransitionSheetPresentationSceneKey`
  (`app-route-scene-stack-runtime.ts:844-888`), the host search override (`BottomSheetSceneStackHost.tsx:960-977`),
  all `isPersistentPollLane` scalar reads (→ `PF.laneKind`), and the deny-list band-aids — in ONE phase
  (a half-migration re-creates the desync). Ship when P1 harness is green through the full repro.
- **P3 — persistent header (req 2b).** Hoist ONE `OverlaySheetHeaderChrome` above the legs (like the frost
  hoist), opacity locked 1.0, reading {title, actionButton, onClose, live models} from a HeaderModel keyed by
  `PF.activeSceneKey`. Delete the per-scene header wiring (mounted-chrome registry header branch, the 6
  \*MountedSceneHeader / headerComponent builders, the header surface in createChromeEntry, SceneStackHeaderLayer,
  the page-frame header lane). Decouple the per-scene white plate from the header mount gate. CAVEAT: swap ALL of
  {title, actionButton, onClose, live progress models} on press-up (not just title) so the close/action fires
  the RIGHT scene's handler. Title seeds allowed for late titles (seed 'Poll'/query/'Restaurant', fill on land).
- **P4 — instant switch + skeleton-first (req 2a).** Generalize the synchronous commit
  (`commitRouteSceneSwitchIdleState`) to ALL nav switches; arm the paint-ack content token for every cross-scene
  switch (not just isForwardOpenCrossfade); drop the search/polls exclusion from the seeded set; SYNTHETIC
  paint-ack for warm retained legs (they're already painted); demote the 600ms `SCENE_READINESS_LIVENESS_MS`
  watchdog to a pure safety net. Body-render gate keys on `PF.presentedSceneKey` alone (+ outgoing during a
  held crossfade). Every page renders its own skeleton (SceneLoadingSurface) until `bodyReady`.
- **P5 — search as a page (req 2e).** Fold 'search' into the uniform `SceneStackBodyLayerHost` leg; render a
  real results skeleton page (shared header + results-skeleton + toggle-strip skeleton) — never null; the
  results reveal becomes a page-switch on the incoming paint-ack (same trigger the cover uses today). DELETE
  the cover-state transport, the `pageBundle`-null→null branch, the `searchSurfaceOwnsVisibleSheet` override,
  the `shouldPublishResultsPageBundle` persistent-poll gate. KEEP the search reveal readiness join as the
  `bodyReady` producer for 'search' (only the self-frost cover is deleted; the reveal timing stays).
- **P6 — tunable transitions, FULL lane (req 2d).** ONE descriptor table row per `(fromScene, toScene,
direction)` driving a REAL sheet-Y lane both directions: `sheetY = interpolate(progress,[0,1],
[detentY(from),detentY(to)])`, `dismiss = inverse(descriptor)` against the remembered origin
  (`PF.originRef` / enrich `OverlayRouteEntry {key,params}→{key,params,origin}`). Move all snap decisions out
  of the scattered per-transitionKind switch into descriptor rows. **CRITICAL: single-writer sheet-Y handoff**
  — the player owns translateY during a transition, the gesture/kept-spring owns it at rest, handoff at settle;
  establish this BEFORE mounting the lane (avoid the three-fighting-springs double-driver). Owner's
  poll-detail-movement example becomes a two-row edit (forward + reverse), no engine change. Applies uniformly
  to nav pages AND child/trial sheets (`role:'child'` rows), so future child-pages inherit it.

## 7. OPEN ITEMS (owner-answered / defaulted)

- Plan governance: this doc is canonical; final-master-plan extended; pillars retired; crossfade retired. ✓
- 2d: FULL descriptor sheet-Y lane (owner chose the ideal). ✓
- Sequencing: full send P0–P6. ✓
- Defaults (owner: "yes unless I say otherwise"): title seeds OK; delete only the search cover (keep the
  reveal join); docked-polls is the only legal presented≠active divergence (audit for others — e.g.
  results_dismissing — and make each an explicit PF field, not a scalar); iOS-first.

---

## 8. GROUND-UP SCRUTINY PASS (2026-07-01, pre-P2 — Fable 5)

Full re-derivation of the consensus from first principles before committing to P2. **Verdict: the
PresentationFrame architecture is CONFIRMED** — this is the textbook single-source-of-truth fix for a
derived-state race, and it is the same pattern this codebase has repeatedly converged on when burned
(LodEngine single authority, sole-writer scroll restore, one richness-gated restore path, SceneLoadingSurface
single chokepoint). Alternatives genuinely considered and rejected:

- **Align the 3 sites' inputs without restructuring** — insufficient: the sites also apply different
  TRANSFORMS (poll-lane forcing, search override); centralizing the transforms IS the PF. Converges to PF.
- **Render only the active scene (drop co-mounted legs)** — simpler model but loses retained warm bodies
  (favorites/profile would remount cold → slower switches, against req 2a) and the held-outgoing crossfade.
- **Off-the-shelf navigator** — doesn't model legs-in-one-sheet + detents + frost + docked-polls. Churn, no fit.

### REFINEMENTS (adopted — these amend §1/§6)

- **R1 — bodyReady moves OUT of PF.** PF said "immutable per switch" yet carried `bodyReady`, which flips
  mid-presentation when data/paint lands — that would make the scene a second writer into the controller's
  value (a cross-writer coupling, the exact disease we're curing). REFINED: **PF = identity only**
  `{switchId, activeSceneKey, presentedSceneKey, outgoingSceneKey, laneKind, snapIntent/descriptorRef,
originRef}` — truly immutable per switch, controller-only writer. **Per-scene READINESS is its own
  authority** (written by the scene's data/paint lifecycle); the LEG composes the two:
  `visible = f(PF)`, `content-vs-skeleton = f(ownReadiness)`. Two clean writers, no ordering hazard.
  (`contentMode` also drops from PF — derivable from the descriptor row.)
- **R2 — rapid-switch supersede semantics (the repro IS rapid tab taps).** On a new switch during an
  in-flight transition: new PF's `outgoingSceneKey` = the leg CURRENTLY painted (previous PF's presented);
  the previous outgoing goes idle immediately; the player restarts. Paint-acks are keyed by `switchId` so a
  late ack from a superseded switch can never flip the live one. Last-wins; no queueing.
- **R3 — crisper divergence invariant.** Steady-state presented≠active is legal ONLY for
  `laneKind:'docked-polls'`. TRANSIENT divergence is legal only via `outgoingSceneKey` during an in-flight
  switch, bounded by switchId+settle. (results_dismissing is the transient kind — an outgoing leg, not a
  steady-state override. This subsumes the searchOwns override's legitimate job.)
- **R4 — P4/P5 ordering guard.** P4 must NOT extend instant-commit to switches TARGETING 'search' until P5
  makes the search leg never-null — otherwise P4 temporarily WIDENS the blank window. P4 = all scenes except
  search; search joins at P5. (SR1 would catch it, but sequence it out rather than assert it away.)
- **R5 — fold the STARTUP reveal into the model.** The startup frost-cover wedge (observed on-device:
  `isStartupPollsResolved` stuck false → frosted screen forever, no retry, even after the readiness timeout
  and backend recovery) is the same failure family: content gated on a stuck signal with no skeleton
  fallback. In the PF model the startup reveal IS the first page switch (null → home). Fold in (P4 scope):
  main-launch reveal becomes skeleton-first (reveal home with skeletons on readiness timeout/failure;
  retry startup polls in background; a permanently-frosted screen becomes structurally impossible).
- **R6 — P2's regression gate includes the return-to-origin flows.** Not just the nav-tab repro: the home
  dismiss byte-identity (golden assertion), bookmarks/profile restore, and the comment→pollDetail re-push
  all ride the same switch machinery P2 rewires. All must stay green.
- **R7 — one subscription source.** All PF consumers read the SAME store (useSyncExternalStore semantics,
  one commit) — no mixed-cadence re-derivations, or the tear re-enters through the back door.
- **R8 — future simplification candidate (post-PF, not now):** remodel the route root so home is 'polls'
  (root truth == presented truth ALWAYS) and delete `laneKind` entirely. Deferred: the root drives more
  than the sheet (search bar, map ownership); PF makes this a mechanical follow-up if ever wanted.
- **R9 — "content as fast as possible" lever (future):** press-DOWN prefetch — start the target scene's
  data fetch on pressIn, ~100ms before the press-up commit. Cheap win once PF lands.
- **R10 — HeaderModel = a registry, house-pattern.** Per-scene `{title, actionKind, handlers, progress}`
  registered synchronously (mirror of origin-capture-registry / origin-scene-live-state-registry).
  P2 should not over-polish the per-leg header path P3 deletes.

### OWNER DECISIONS (2026-07-01, post-scrutiny — these are binding)

- **Rapid taps = LAST-WINS SUPERSEDE** (R2 confirmed): every tap commits a new PF immediately; the newest
  always wins; superseded switches' late signals are ignored via switchId. No lock, no queue.
- **Skeleton→content reveal = ALWAYS IMMEDIATE** (owner overrode the min-hold recommendation; Instagram-style).
  Content reveals the instant it's ready, even if the skeleton flashed briefly. Implement with hold=0;
  keep the hold as a config knob (default 0) so a min-hold is a one-line tune if it ever grates.
- **Nav-switch detent default = PER-PAGE REMEMBERED DETENT** — each page returns to where its sheet was
  last left (matches current behavior + the repro). Encoded as the default descriptor rows; all tunable.
- **STARTUP FOLD-IN CONFIRMED (R5 → P4 scope)**: the startup reveal is the first page-switch; home reveals
  skeleton-first on readiness timeout/failure; startup polls retry in the background; a permanently-frosted
  launch becomes structurally impossible.

### REQUIREMENTS → MECHANISM (does it buy everything?)

2a instant+skeleton → P4 (PF instant commit + per-scene readiness + skeletons) ✓ · 2b persistent header,
instant text → P3 (hoist + HeaderModel) ✓ · 2c one header → P0 DONE ✓ · 2d tunable both directions → P6
(descriptor table + Y-lane + dismiss=inverse) ✓ · 2e search-as-page → P5 ✓ · THE BUG → P2 (structural) ✓ ·
startup wedge → R5 ✓ · return-to-origin compatibility → originRef + R6 ✓.

---

## 9. P2 EXECUTION SPEC (verification-panel-amended, 2026-07-01 — BINDING; supersedes §6-P2/§8 where they conflict)

The pre-P2 verification sweep (wr651bxt1, Fable-5 agents, all findings code-VERIFIED) returned **GO** with
these amendments. There are **FIVE** live "which scene is presented" derivations, not three — all five die
in the same atomic phase.

### 9.1 AMENDED SEMANTICS (fixes to §8's R1/R2/R3)

- **R2-AMENDED (supersede outgoing rule).** `outgoing := prev.presented` ONLY IF the prev switch's
  switchId-keyed paint-ack committed; ELSE `outgoing := prev.outgoing` (pre-ack, the PAINTED leg is still
  the previous outgoing — `resolveContentLaneOpacities` holds outgoing=1/incoming=0 until paintAck,
  transition-lane-player.ts:74-84; start() resets paintAck=0 :139-141. The naive rule paints a never-landed
  page). The controller holds the ack record JS-side keyed by switchId (reportScenePaint already transits
  JS). AND descriptor-conditional: outgoing only when the new switch's descriptor declares
  preserveOutgoingUntilSettle; swapImmediately (closeChild/modalClose, transition-policy :321-323) →
  outgoing=null — preserves dismiss byte-identity. Role-by-exclusion (any leg ∉ {presented, outgoing} is
  idle) needs no explicit second-previous clear.
- **R1-AMENDED (laneKind lifecycle).** PF stays SINGLE-WRITER but not frozen: laneKind's inputs mutate
  without a switch (isDockedPollsDismissed is a gesture write in app-route-sheet-snap-session-runtime;
  surfaceVisualPolicy is pulled live at native-authorities :339; eligibility/restore-intent flip
  mid-presentation :355-358/:386-388). The controller SUBSCRIBES to those inputs and RE-MINTS PF (bumping a
  revision id) on change. Identity fields (switchId/active/presented/outgoing/originRef) stay switch-static.
- **R3-AMENDED (results_dismissing = an ack).** Model the frozen-results release as the polls leg's
  switchId-keyed ACK for the dismiss switch: (dismissBottomBoundaryReached ∧ pollHeaderReady ∧ pollBodyReady
  ∧ pollHostReady) (use-results-presentation-close-transition-state-runtime.ts:75-98). Plus the explicit
  descriptor rule PF can't express alone: the sheet SHELL follows the OUTGOING frame on dismiss, the TARGET
  frame on forward open (today's sheet-host :1013-1022 vs :992-1012 asymmetry).
- **INTERACTIVE/INPUT-OWNER RULE (new PF derivation — else touch routing keeps a private lane).**
  interactive = PF.presentedSceneKey ('polls' when laneKind==='docked-polls'); input-owner = the OUTGOING
  leg while a held window is open (compose in the leg, where PF + ack state are both in hand). Replaces
  scene-stack :2525-2527/:2673-2675 deriving it from the scalar (→ canInteract/isInteractive :1914/:1982,
  pointerEvents BottomSheetSceneStackHost.tsx:526).
- **P2/P5 SEAM (searchOwns override).** The relabel's JOB moves INTO the PF writer at P2 (sampled at the
  reveal/dismiss switch commits, with R3's boundary-as-ack); the store-side override DELETES at P2; the
  pageBundle machinery waits for P5; invariant SR1 is scoped to "presented 'search' WITH a bundle" until P5.
- **READINESS EPOCHS (R1 companion).** Per-scene readiness is keyed by PF.switchId/content-epoch and RESET
  inside the controller's same batched commit — kills the stale-flash on same-scene re-push. Readiness does
  NOT reset when a retained leg goes idle (protects Fav→Profile→Fav no-skeleton-blink). P4's synthetic ack
  is EVIDENCE-based (body attached + painted this epoch), never scene-class-based.
- **P2 DoD SCOPE.** Either pull a minimal skeleton-leg into P2 (render SceneLoadingSurface when PF presents
  a leg whose derived body store hasn't caught up — today SceneStackBodyContentLayerHost returns null) or
  scope P2's "no blank frame" gate to warmed sessions and move cold-start to P4's gate. The body store stays
  DERIVED (needs mount/prewarm state PF doesn't carry); on supersede it applies the NEWEST PF only
  (last-wins collapses the defer queue :2465-2490); all PF consumers read ONE delivery cadence (the
  post-batch dispatch-target flush, not the synchronous transition-state listeners).
- **originRef CAPTURE RULE (enters PF at P2, bites at P6):** capture the last SETTLED detent, never the
  live mid-motion snap target — else T1's dismiss.to===origin.snap binds to a transient detent under
  supersede.

### 9.2 THE FIVE DERIVATION SITES (all die atomically in P2; corrected ranges)

1. Sheet-host cascade = getResolvedSurfaceInput's WHOLE presentation block,
   `app-route-sheet-host-authority-controller.ts:942-1128` (NOT §6's 1045-1120 — that leaves the :976-991
   relabel + :1000-1022 shell-hold alive). Includes the EMPTY_ACTIVE_SCENE_FRAME_ENTRY fallback :222-225.
2. Scene-stack `resolveSheetPresentationSceneKey` :844-862 + `resolveTransitionSheetPresentationSceneKey`
   :864-888 + all 5 call sites (:884,:2449,:2457,:2517,:2665).
3. Host search override = `BottomSheetSceneStackHost.tsx:970-1002` as ONE unit (NOT §6's 960-977 — partial
   delete leaves the per-leg :993-999 relabel as a live second authority on the crossfade-held leg).
4. Native displayedSceneKey 'polls' forcing `app-route-native-overlay-target-authorities.ts:559-560`
   (panel-missed 4th site).
5. Session-state controller's INDEPENDENT docked-lane formula
   `app-route-overlay-session-state-controller.ts:811-815` + its PARALLEL producer
   `use-search-root-overlay-foundation-runtime.ts:25-47` (panel-missed 5th site) — one laneKind formula,
   thin adapters.

### 9.3 P2 REWIRE CHECKLIST (definitive, from the sweep — Groups A rewire / B delete / C leave)

**A — REWIRE to f(PF):** sheet-host getResolvedSurfaceInput→PF read; createBodySnapshot :1210-1284
(publish presented/outgoing/switchId through app-route-sheet-host-surface-runtime-contract.ts:12-34,98-103 →
SearchRouteSceneStackBottomSheetSurfaceHost.tsx:187-190); the SNAP family (createMotionRuntimeSnapshot
:1286-1306, createRuntimeConfigSnapshot :1308-1326, resolveSheetRuntimeRegistrationSeedSnap :1735-1750,
resolveSheetRuntimeInitialSnap :1752-1769, syncInitialVisibleSnap :1771-1837) → PF.snapIntent/descriptorRef;
SNAP MEMORY (resolveSnapPersistenceKey :273-292 + createMotionPersistenceInput :1189-1207) → PF identity key;
createNativeAdapterSnapshot :1155-1187 (verify the nav-silhouette UI-thread input,
app-route-nav-silhouette-authority.ts:139-151); resolveSharedSheetInteractionPolicy :329-356 +
isDockedPollsSearchSurface :294-304 + shouldUseMountedSheetRuntimeReseedLane :1848-1857;
scene-stack applyRouteSwitchPresentationUpdate :2517-2524, recomputeTransitionSlice :2665-2672,
canApplyRouteSwitchPresentationUpdate :2441-2490, resolveMountedSceneKeys :822-842,
createSceneActivitySnapshot :1891-1990 (+ the INTERACTIVE rule above); host resolveSceneStackLegRole
:108-124 reads PF, player start effect :1069-1105 + reportScenePaint :1059-1068 keyed by PF.switchId,
memo gates follow mechanically, KEEP the [pageswitch] probe until post-P2; isPersistentPollLane scalar
readers → PF.laneKind (polls-scene-input-controller :43-52,:75,:247,:278-281 →
useSearchRoutePollsSceneStateRuntime :61-66; sheet-host :685,:939,:1039-1044,:1141; native-authorities
internal sites :416,:446,:454,:496,:513,:543,:571,:582,:613,:643,:685 — resolveIsPersistentPollLane's body
minus the deny-list BECOMES the laneKind computation, executed once from the fresh-target coalesce
:365-368); shrink carrier contracts (route-overlay-navigation-snapshot-contract.ts:11,
route-overlay-display-snapshot-contract.ts:14,19, app-route-dynamic-scene-inputs-contract.ts:61);
session-state computeSnapshot :811-815 + foundation-runtime :25-47 → PF.laneKind (consumers unchanged);
registry activeTabIndexValue app-route-scene-display-target-registry.ts:34-43 → PF.activeSceneKey index
(→ NavSilhouetteHost.tsx:208); chrome/header consumers (AppRouteSceneChromeMotionRuntimeProvider.tsx:70-100
— :88-95 joins two differently-timed identity signals, re-key on PF; native-authorities
resolveChromeModeSnapshot :596-606, resolveOverlayHeaderActionMode :638-679, resolveSheetPolicySnapshot
:681-699, shouldSuppressOverlaySheetVisibility :608-636); shouldRenderSearchOverlay PRODUCER :578-585 →
PF.laneKind (consumers untouched).
**B — DELETE:** the five sites in §9.2 (corrected ranges, each as ONE unit); both deny-list band-aids
(native-authorities :369-383, sheet-host :1032-1044 — keep the fresh-target coalesce :365-368 as PF's
input); dead per-scene visibility SharedValue lane (scene-display-target-registry :13,:39,:46-56 +
route-overlay-display-shared-values scene-visibility writes :66-79 — writer with zero readers +
always-null prewarmedSceneKey :561); dead isPersistentPollLaneEligible mirror
(app-route-scene-visibility-policy-contract.ts:14,:118 + caller-less getRouteSceneVisibilityPolicySnapshot).
**C — LEAVE (not presentation consumers):** rootOverlayKey/route-stack bookkeeping;
shouldRenderSearchOverlay CONSUMERS; route-scene-policy-controller :146-186 (an INPUT producer to PF);
snap-session per-scene snap memory (data for descriptor resolution); the persistent-poll header restoration
readiness reporter (scene-stack :1244-1345 — the P5 dismiss-join bodyReady producer, do NOT delete);
shouldPublishResultsPageBundle + pageBundle-null branch (P5 targets; per R4 no instant-commit to 'search'
until P5); submit-flow transitionFromDockedPolls bookkeeping.

### 9.4 STARTUP WEDGE — EXACT SEAMS (for P4; attribution CONFIRMED end-to-end)

The cover is the NATIVE expo splash (App.tsx:54 preventAutoHideAsync). The reveal gate requires
`isStartupPollsResolved` (MainLaunchCoordinator.tsx:1043-1052) but the 10s timeout escape hatch sets ONLY
`isMainLaunchReady` (:1003-1012) — the wrong bit — so it re-arms and fires forever: the wedge I observed
on-device. P4 fixes: drop isStartupPollsResolved from the reveal gate (:1043-1052) and the isMainLaunchReady
producer (:974); make the timeout force the FULL predicate; fix the bootstrap effect (never latch-return
while unresolved :763-766; dep = derived launchIntentMarketKey string not launchIntent identity :831; add
the missing startupLocationSnapshot?.ipMarketKey dep :750-752); move fetch+retry ownership to
polls-feed-runtime-controller (single writer). P1 addendum: add a bootstrap-lifecycle probe (effect
entry/latch-return/resolve/cleanup) for runtime proof before P4 touches it.

### 9.5 POST-BUILD AMENDMENTS + POST-SOAK CLEANUP LEDGER (2026-07-02, final red-team pass)

**(a) P6 SHEET-Y LANE — FORMAL NO-GO AMENDMENT — ✅ OWNER-APPROVED 2026-07-02.** The §6-P6
"REAL sheet-Y lane + dismiss=inverse(descriptor)" scope did NOT ship and is re-scoped as follows.
OWNER RULING: blessed the re-scope (detent-tunable via the table now; motion curve stays with the
one kept snap spring; origin-restore via the return-to-origin foundation) — NOT re-opening a second
sheet-Y driver. [Separately, TRUE per-page detent memory was wired + verified this session — that is
the descriptor `rememberedDetent` rule, a DIFFERENT topic from this sheet-Y no-go.]

- **What req 2d now means (shipped):** the DETENT TARGET of every switch is tunable via the
  descriptor table (`app-route-sheet-motion-descriptor-table.ts`) — one row edit per
  `(from, to, transitionKind)`, mandate tier for modals, `rememberedDetent` for bookmarks/profile,
  parity-pinned by the frozen-oracle spec. The motion CURVE stays with the KEPT snap spring
  (single writer, no player sheet-Y lane, no three-fighting-springs handoff problem).
- **Removed from the PF contract:** `PF.originRef` and `PF.snapIntent` (the descriptor-driven
  sheet-Y interpolation inputs) — never populated, deleted rather than carried dead.
- **T1's `dismiss.to === origin.snap` clause is SUPERSEDED:** dismiss detents are now the table's
  own dismiss rows (`closeChild → preserveLiveY`, `terminalDismiss → hide`), and true
  return-to-origin (page+scroll+snap+anchor restore) belongs to the return-to-origin foundation's
  capture/restore machinery — NOT to a descriptor inverse. The row-completeness half of T1 stands
  (catch-all row + spec + `__DEV__` init assert).
- **Owner decision requested:** bless this re-scope (detent-tunable now, curve/origin-restore via
  the kept spring + return-to-origin foundation), or re-open the full sheet-Y lane as new work.

**(b) H1 AMENDED — PRESENTED-FIRST (applied to §2).** The invariant is
`title === HeaderModel(PF.presentedSceneKey ?? PF.activeSceneKey)`. The header titles what the
sheet PAINTS; the one legal steady divergence (docked-polls: route='search', sheet presents the
polls feed) is exactly the case presented-first gets right. `PersistentSheetHeaderHost` implements
this; a `__DEV__` warn now fires if a presented scene has no registered header descriptor, and the
registry warns on duplicate registration.

**(c) POST-SOAK CLEANUP LEDGER** (nothing here blocks soak; execute after the owner drive-through):

1. **Probe teardown inventory** (ALL deliberately still in; delete as one sweep post-soak):
   `[pageswitch] frame` (app-route-scene-switch-controller.ts:1526),
   `[pageswitch] watchdog` (:1746 — keep the WATCHDOG MECHANISM, delete only the log),
   `[pageswitch] controller replaced` (:2004),
   `[pageswitch] host` (BottomSheetSceneStackHost.tsx:1195 via logPageSwitch:142),
   `[pageswitch] body` (BottomSheetSceneStackHost.tsx:725),
   `[pageswitch] bodyActivity` (BottomSheetSceneStackBodyLayer.tsx:163),
   `[pageswitch] activity` (app-route-scene-stack-runtime.ts:2035),
   `[pageswitch] bootstrap` (MainLaunchCoordinator.tsx:37 + polls-feed-runtime-controller.ts:35),
   `[DISMISS-SEAM]` ×2 (app-route-overlay-session-state-controller.ts:772 +
   app-search-route-command-runtime.ts:195).
   **DELETION LANDMINE:** the host effect at BottomSheetSceneStackHost.tsx:~723-728 carries BOTH
   the `body` probe AND the FUNCTIONAL `recordSceneBodyAttached` call (synthetic-ack evidence) —
   delete only the logPageSwitch line, never the effect.
   (The `[pageswitch]` descriptor-table console.error lines are `__DEV__` INVARIANT asserts, not
   probes — permanent.)
2. **§9.3 Group-A carrier shrink** — the rewired-to-PF carriers still transport fields consumers
   no longer read; shrink the contracts (route-overlay-navigation-snapshot-contract.ts,
   app-route-dynamic-scene-inputs-contract.ts, and the mounted-chrome `mountedChromeKey` /
   `excludedSurfaces` fields whose only remaining consumers are equality functions).
3. **SearchSceneStackBodyDisplayTarget fold-in** (deferred residual): the search leg still renders
   through its bespoke bundle host (`SearchResultsPageBundleHost`) inside the uniform frame host;
   folding it into the uniform `SceneStackBodyContentLayerHost` deletes the parts-slot
   indirection. Includes the dead `sheetYValue` thread: `SearchResultsPageBundleHostProps.sheetYValue`
   is typed but never destructured (SearchMountedScenePageBundleAuthority.tsx) while the host still
   passes it (BottomSheetSceneStackHost.tsx:~846) — delete both sides together.
4. **rememberedDetent semantics question (owner):** with ONE physical shared sheet, "the detent the
   page was last left at" is implemented as "the LIVE shared-sheet detent at switch time" — i.e.
   bookmarks inherits the detent profile left behind, not its own last detent. If the owner wants
   TRUE per-page memory, the rule needs a per-scene detent store (snap-session memory exists as a
   candidate source).
5. **Dead `getRouteSceneVisibilityPolicySnapshot`** — zero call sites on BOTH controllers
   (app-route-scene-switch-controller.ts:907 + app-route-overlay-session-state-controller.ts:391,
   plus the type slot at scene-switch :148); delete both (deferred: files owned by the parallel
   P2/P5 agents this round).
6. **Host stale comments** (same parallel-owned file): the 'until P5' claims at
   BottomSheetSceneStackHost.tsx:1028, :1171, :1390, :1400 (P5 landed — search's header/divider are
   hoisted and the page frame no longer has an in-frame header/divider lane at all), and the
   :137-138 probe-lifecycle claim "removed after P2 lands the fix" (P2 landed; probes stay until
   post-soak — reword to point at this ledger).
7. **Idle-leg skeleton parity note:** scene-stack legs skip the skeleton when `legRole==='idle'`
   (host :743); the search leg's pre-bundle skeleton page (SearchResultsPageBundleHost) renders
   even while the search leg is idle-hidden (SR1 keeps it never-null; the idle leg is display-hidden
   so this is only wasted work). Revisit with item 3's fold-in.
8. **CONTENT_MODE_BY_INCOMING_SCENE is all-HARD** (host-token-transition-adapter.ts): every row and
   the fallback resolve HARD; the table survives as the documented extension point. If no non-HARD
   mode exists by cleanup time, collapse to a constant and drop the dead `held-dissolve` ContentMode
   variant from the descriptor contract + player.
