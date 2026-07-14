# Wave 4 — the foundations reckoning (owner directive, 2026-07-13 late)

Owner directive after the hands-on fix arc. Execution = DIRECT (no agent delegation for
build+verify; Jarvis scrapped). THE LAW applies with the owner's added heat: attack
everything non-ideal, tear out what's wrong, design every one of these as an app-wide
primitive for every current AND future page — never one-page fixes. Use git history +
old plans as the map ("if you don't have context on them, you're building blind").
Instrument the sim without limits — "there's nothing I can do that you can't do on the
sim." Full sim control assumed (move the sheet before touching the map, etc.).

## §1 — THE FAILURE/RETRY PRIMITIVE (owner law, standardized long ago, NEVER BUILT)

**The law:** any pushed/feature screen whose load fails → the app POPS BACK to the
screen that triggered it and shows THE ONE SHARED RETRY MODAL describing what failed;
retry re-runs the flow. Root pages (home etc.): stay/dismiss in place + the modal.
Page-local retry buttons are BANNED — grep-and-destroy every one ("We couldn't load"

- Retry exists in ListDetailPanel, UserProfilePanel, PostPhotosPanel, EditProfilePanel,
  FollowListPanel, NotificationsPanel, +). WHY (owner asked it be understood): local
  retry = every page invents its own dead-end; the user is stranded on broken chrome;
  failure stops being an app-wide guarantee. Ground-up shape: a failure contract at the
  route/scene layer (the child-transition machinery already knows pushes/origins — the
  failure edge triggers origin-pop + modal via ONE host), inherited by construction by
  every future screen. Verified state 2026-07-13 (hands-on): the standardized announcer EXISTS —
  `announceFailureIfOnline` in app-modal-store.ts (+ the offline law: offline announces
  NOTHING, the system banner + persisting skeletons explain; wired at boot via
  wireFailureAnnouncerOfflineRead). What was never finished: (a) no Retry action (OK
  only), (b) nothing wires automatic POP-to-origin on a child scene's load failure,
  (c) zero panel adoption — six+ panels hand-roll local "We couldn't load"+Retry.
  THE CUT: extend the announcer to `announceSceneLoadFailure({sceneKey, what, retry})`
  — online: closeActiveRoute() then modal [OK · Retry] (Retry re-runs the flow);
  root scenes: modal in place. Integrate at SceneBodyReadyGate (a `failure` input;
  role from the scene-policy registry) so every gated panel inherits the law by
  construction; DELETE all six local error UIs; add a RED sweep so an in-page retry
  cannot return. SystemStatusBanner additionally must clear on health restoration,
  not only on a later request success. Also fix: failed ROOT query leaves
  home permanently blank with no refetch (seen on-sim).

### §1 STATUS: COMPLETE (2026-07-13, hands-on, sim-proven)

- Law wired: scene-load-failure-policy.ts (child = shared modal + pop-on-dismiss;
  root = modal + skeleton stays + refetch on next presentation; offline silent) via
  SceneBodyReadyGate `failure` input — inherited by construction.
- Adopted + local retry UIs DELETED: ListDetail, UserProfile, FollowList,
  Messaging (inbox + session), EditProfile, Notifications; ROOT branch on Bookmarks
  home (blank-home fixed). Action retries (message resend, upload re-poll) kept.
- RED sweep: scene-load-failure-law.spec.ts (2 tests) — proven RED with a planted
  offender, then green. jest 26/26, tsc/lint clean.
- SIM-PROVEN twice end-to-end: modal over failed list → OK → pop to intact home.
- Banner health probe added at the api.ts chokepoint (5s interval only while an
  issue is live; bare axios; clears on first healthy 200). Logic+gate verified;
  on-screen proof pending a real 5xx (connection-refused never raises the banner —
  the interceptor reports only status>=500; noted).

## §2 — WHY ARE 500s/BANNERS SO COMMON (attribute the class, then kill it)

Known members so far: (a) mapper hard-throws over per-row data (fixed 2026-07-13:
snippet score throw — sweep the API for the same throw-in-mapper pattern);
(b) stale-API-binary trap (recipe hardened in CLAUDE.md);
(c) stale Prisma client post-migration (CLAUDE.md trap);
(d) banner stickiness amplifies every blip into "service unavailable" theater.
Also investigate the hourly `[Scheduler] PrismaClientKnownRequestError` cron failure
in the API log. Owner asks: is the map implicated? Attribute honestly.

### §2 STATUS: COMPLETE (2026-07-13, hands-on) — the 500/banner class, attributed and killed

1. List-mapper snippet throw → ROOT-FIXED (unscored connection can't be a "top
   food"; the saved-item invariant guard stays loud; DB-probed: all saved items
   scored).
2. search-coverage.service.ts:401 throw → LEGITIMATE invariant (the SQL's INNER
   lateral join guarantees a scored top dish — a real RED contract). KEEP.
3. Hourly `[Scheduler]` failure → poll-leaderboard rebuild RACE (delete+createMany
   under concurrency: cron × interaction rebuilds × the double-process trap) →
   ROOT-FIXED with a per-poll transaction-scoped advisory lock
   (pg_advisory_xact_lock; different polls stay parallel). Leaderboards had been
   silently starved hourly since the seed. Built, jest green, deployed to :3000
   (binding verified).
4. Process/binary traps → CLAUDE.md recipe hardened TWICE (xargs-all-LISTEN-pids +
   the load-bearing -sTCP:LISTEN filter — bare lsof kills the SIMULATOR APP's
   client sockets; cost three phantom "crashes").
5. Banner amplification → health probe (§1). Map implicated? NO evidence — every
   member attributed elsewhere.

## §3 — SEARCH-AGNOSTIC RESTORATION (owner override: BUILD NOW, gate or no gate)

The owner ordered the full restoration regardless of the perf session's uncommitted
files (diff-and-preserve their edits; never revert; note overlaps). The map/plans:
`plans/trigger-regression-audit.md` (5 dead mouths, one lane; restoration plan),
`plans/listdetail-ideal.md` §1d (composite verb), leg-10 gate record (lane =
parameterize requestSearchPresentationIntent; lens-forward-compatible),
`resolve-fit-all-camera.ts` (built, jest-level), the a48e96ef-era wiring in git
history (what WORKED), `plans/search-flow rebuild` charter + page-registry §1/§4.
Deliver: list-open (all five mouths: home tiles, per-side All, profile list taps,
/l/ slug, messaging card) runs the REAL search flow — press-up → header + skeleton →
world fetch → pins/labels/dots/cards reveal together → fitAll camera in the safe
region → sheet to middle if at top → toggles slice as world-consequence → X pops to
exact origin. Plus the span build-outs (pollDetail spans stay; profile comment spans

- restaurant mention spans = first-time builds; API already computes mention spans).
  Fix the leg-15 stale-bbox world-push defect as part of it. THEN: instrument + test
  the hell out of it on the sim (drive every mouth, screenshot/video evidence, RED
  markers) before claiming anything.

### §3 LANE MAP (traced 2026-07-13, build in progress)

Tap → `useEntityRefActionExecutor` (use-entity-ref-action-executor.ts: pushScene
pushes directly; search-shaped actions ride `dispatchLaunchIntent({type:
'entityAction', action})`) → consumer = use-search-foreground-launch-intent-
runtime.ts (branches: entityDesire → `launchEntitySearchResults`; restaurantWorld
→ warm-seed + `runRestaurantEntitySearch`; sharedList → plain push W1s4). THE CUT:
(1) policy list arm → new `listWorld` composite action (keeps title warm-seed
params); (2) executor: listWorld = push listDetail THEN dispatch the intent;
(3) consumer: listWorld branch → new `launchListSearchResults` mirroring
launchEntitySearchResults' committed-search shape with identity {kind:'list',
listId, listType} (arm ALIVE at search-desired-state-contract:35 + fetch arm
search-world-fetch:170); (4) sharedList lane: desire write rides the panel's
slug→listId resolution edge; (5) panel reads presented world, self-fetch dies,
strip flips to 'world'; (6) commitFitAllCamera at reveal-ramp start + snapTo
middle row (both already built, leg 10); (7) two bypasses deleted (BookmarksPanel
handleOpenAll :663ish, ProfileSectionsBody :320) — route through the executor
with listType in the EntityRef arm. ⚠ launchEntitySearchResults likely lives in
the perf session's live files (use-search-submit-owner.ts family) — diff first,
preserve, additive only.

WRITER MECHANICS (read 2026-07-13): use-search-structured-submit-owner.ts — a
structured submit is literally `writeSearchDesiredTuple(searchRuntimeBus,
{queryIdentity, tab, filterVariant:{includeSimilar:false}, committedBounds},
cause)` (S4b: the submit IS the tuple write; the reconciler classifies + presents

- resolves). `launchListSearchResults` = a ~20-line sibling with queryIdentity
  {kind:'list', listId, listType, displayTitle} + tab from listType; may need a
  'list_open' cause added to the writer vocabulary (additive).
  TWO CRITICAL NUANCES:
  (a) PRESENTATION COUPLING — writing the tuple today presents the RESULTS scene
  (leg-9 defect: world-present ⟷ results scene) which would fight the pushed
  listDetail child. The presentation parameterization (requestSearchPresentation-
  Intent keyed by the pushing entry) must land IN THE SAME CUT as the verb — this
  is exactly where leg 9 stopped and where the perf session's files are hottest.
  (b) LIST BOUNDS — a list world is identity-fetched (getListResults by listId);
  membership must NEVER be viewport-filtered, and the leg-15 stale-bbox 0-rows
  defect is this exact class: the world-commit bbox must be DERIVED from the list's
  pins (the fitAll region), not adopted from the stale viewport. Fix at the
  commit/derive layer as part of the cut.
  EntityRef gains optional `listType` (all tap sites know it); a listWorld action
  with null listType falls back to the plain push LOUDLY (dev bark), never a silent
  half-world.
  SEAM ENTRY POINT (pinned): requestSearchPresentationIntent = a dispatcher in
  use-results-presentation-owner-presentation-actions-runtime.ts:98 over
  {focus_editing/exit_editing → editingActionsRuntime, close →
  closeActionsRuntime, default → enterActionsRuntime.requestEnterPresentationIntent}.
  THE PARAMETERIZATION = an enter-intent variant carrying `targetEntry: {sceneKey,
entryId}` so the world presents INTO the pushed listDetail entry instead of
  opening the results session — design work continues in
  useResultsPresentationEnterActionsRuntime (file is live-modified in the shared
  tree; diff-and-preserve). ENTER RUNTIME (read 2026-07-13): use-results-presentation-enter-actions-runtime.ts
  already threads `preserveSheetState` (drives the transaction's cover state) and
  `entrySurface` into `executeSurfaceEnterTransaction` — the parameterization may be
  a NEW intent kind (e.g. 'list_open') + entrySurface/targetEntry value rather than
  a structural rework. THE DECISIVE READ IS ONE FILE DEEPER:
  use-search-surface-results-enter-transaction-execution-runtime.ts (perf-session-
  hot; diff-and-preserve) — what it does scene-wise (results-scene takeover vs
  presentable-into-entry).

CHAIN COMPLETE (traced to the classifier, 2026-07-13):

- Execution runtime read: the results-scene coupling is ONE call —
  `openAppSearchRouteResults({snap: targetSnap})`, fired only when targetSnap !=
  null, and `resolveSearchSurfaceResultsSheetTargetSnap` returns NULL when
  `preserveSheetState === true` (results-presentation-shell-transaction-intent.ts
  :8-12). A preserve-style enter already presents the world with NO scene/sheet
  takeover (search-this-area's in-place behavior).
- The classification: use-search-submit-owner.ts `enterForegroundEffectsRef`
  (:242) receives the RECONCILER-DERIVED `{presentationIntentKind,
preserveSheetState, entrySurface}` and fires onPresentationIntentStart →
  use-search-root-submit-ui-presentation-intent-ports.ts (:27-58) maps it onto
  the enter intent.
  THE CUT (all pieces now known; land as ONE coherent change):

1. Reconciler rule: identity kind:'list' ⇒ derive preserveSheetState=true (find
   the derivation origin in search-world-resolver.ts / seam construction — where
   'search_this_area'/'variant_rerun' classify; one grep next window).
2. `launchListSearchResults` in use-search-structured-submit-owner.ts (tuple
   write; maybe a 'list_open' writer cause, additive) + export through
   use-search-submit-owner (additive lines in the hot file).
3. Policy `listWorld` action (+EntityRef.listType, loud fallback) + executor
   composite (push listDetail THEN dispatch) + launch-intent consumer branch.
4. Bounds: list membership is identity-fetched — world-commit bbox DERIVES from
   the list's pins (fitAll region), never the stale viewport (fixes leg-15).
5. `commitFitAllCamera` at the world-presented effect for list identities
   (executor built leg 10); sheet-to-middle already rides listDetail's
   descriptor row.
6. Panel world-read (self-fetch dies) + strip consequence flip to 'world' +
   bypass deletions (BookmarksPanel handleOpenAll, ProfileSectionsBody list tap)
   - span build-outs.
7. Instrument + drive all FIVE mouths on the sim; screenshots or it didn't
   happen.

BUILD PROGRESS UPDATE (stretch 2): MOUTH 2 LIVE-PROVEN — per-side All routes
through the composite ([WORLD-COMMIT] list:all:restaurants restaurantCount:41);
the BookmarksPanel bypass is DELETED. MOUTH 3 WIRED — ProfileSectionsBody routes
through the policy w/ listType + targetUserId (EntityRef/listWorld extended;
executor threads targetUserId into the push). MOUTH 4 (messaging card): share
payload carries no listType → the LOUD fallback covers it (plain push + bark);
one-line API follow-up = add listType to the share-resolver payload. MOUTH 5
(slug): rides the panel's slug→listId resolution edge — lands with the panel
world-read step by design. Gates: tsc/lint clean, jest 159/159 incl. the
reconciler suite. TODO next stretch: a classifier spec pinning the list rule
(RED-provable), alongside the reveal-go machine work.

BUILD PROGRESS (2026-07-13 late-late, sim-instrumented):
✅ Steps 1-3 BUILT + LIVE-PROVEN: classifier list rule fired
([RECONCILE] favorites_launch/session_enter/preserveSheet:true), verb wrote the
tuple, resolver fetched getListResults, [WORLD-COMMIT] restaurantCount:8; the
search chrome adopted "Taco crawl 2026" + dismiss X; NO results takeover; list
page presents normally. tsc/lint green throughout.
✅ Step 5 half-LIVE: onListWorldPresented uiPort (submit owner) wired at
use-search-root-submit-control-runtime w/ sessionCoreLane.cameraIntentArbiter +
sharedSheetSnapPoints (safe region = expanded→middle snap, the sheet's own
datums) → commitFitAllCamera + RED bark. CAMERA MOVED on-sim (fit ran).
⛔ REMAINING BLOCKER — THE REVEAL-GO: [NATIVE-SNAP] shows the render owner
prepared fully (catalog 10 → pin_roster_synced candidates:10 promoted:2 →
reveal_begin, renderPhase reveal_preroll) but lifecycle STAYS preparingReveal
@opacity 0.001 — revealStarted never fires. TWO instances live: the old visible
owner (renderPhase live, reveal null) and the NEW hidden one holding the list
world. The reveal ramp is started only by the results-scene presentation
lifecycle; list worlds need the reveal-go fired when the pushed child + camera
settle (the reveal joint).
REVEAL-GO ROOT CAUSE (diagnosed to the mechanism, 2026-07-13): the map
presentationPhase derives from the STAGED enter transaction's executionStage
(deriveSearchMapRenderPresentationPhase, search-map-render-controller.ts:623) —
enter_pending_mount/enter_mounted_hidden → 'enter_requested' (owner preps the
reveal and WAITS), enter_executing → 'entering' (ramp runs), settled → 'live'.
The stage advances only via the RESULTS route switch's content-readiness
collector: a normal enter passes `contentReadinessTransactionId:
snapshot.transactionId` into openAppSearchRouteResults (enter-transaction
execution runtime ~:130) and the collector completes the 'content' plane on real
paint → the machine advances → the ramp. Preserve-from-home advances nothing →
reveal_preroll stall @0.001.
THE LENS-COMPATIBLE CUT: the listWorld composite's CHILD PUSH carries the same
readiness token — the listDetail entry's paint completes the content plane and
the machine advances scene-agnostically ("the presentation lane keyed by the
pushing entry", literally). Mechanics to settle next: the push needs the enter
transactionId — (a) mint/return it before the push (executor reorders to
dispatch-then-push, or the consumer performs the push), or (b) the readiness
collector accepts a late bind keyed by the pushed entry. Study the collector API
(scene-switch controller settle/readiness gates, UI-leg-6 chrome work) + the
machine's stage writers (results-presentation-runtime-machine-\* transports;
results-presentation-authority observes the transitions). Perf-hot; mach-clock
verification per §3 item 4. Then: bounds nuance (tuple carried stale viewport bbox in the
worldKey — membership unaffected (8/8 committed) but the coverage/bbox keying
should derive from list pins), remaining mouths (per-side All, profile,
messaging, slug), panel world-read, strip flip, spans, five-mouth sim blitz.

SESSION 2 PROGRESS (2026-07-13 evening, sim-attributed one cause at a time):
✅ RAMP JOINT UNBLOCKED: fresh boots now show the FULL JS joint for list enters —
[REVEALSYNC] cardsAdmit → rampStart (prior stall class GONE). Remaining invisibility
was NOT the machine: pin_roster_synced shows candidates:274 desired:0 promoted:0 —
the LOD engine promotes ZERO for list worlds; the ramp runs over an empty roster.
✅ ROOT-CAUSED + FIXED — patch-baseline reject class ([MAPFRAME] cascade). Genesis =
LEDGER DISHONESTY: native's resident-publishing acks echo the frame's DECLARED
sourceRevisions (JS adopts them as its next patch base) but
appliedJsSourceRevisionBySourceId advanced only via applied deltas —
reuse/short-circuit acks (sources_reused_resident, no-delta frames) diverge the
ledgers permanently → every later patch rejects. FIX (native emit block): a
resident-publishing ack stamps appliedJsSourceRevisionBySourceId =
frameSourceRevisions per family. JS resync-on-reject already existed (2026-07-12);
the pair closes the loop. Post-fix runs: ZERO rejects.
✅ FITALL FROZEN-MID-FLIGHT ROOT-CAUSED + FIXED: animated arbiter commits must set
deferControlledCameraStateUntilCompletion:true (canonical route-camera does) — else
the controlled Camera props stomp the native easeTo mid-interpolation. Fixed in
commitFitAllCamera. Camera now LANDS the exact cross-market fit (continent frame,
z4.3, Tennessee-centered; NYC members rank 1-3). Screenshot-verified.
✅ Classifier spec added (idle→list + in-session→list both preserve the sheet).
📌 **DEV** instrumentation added: [FITALL], [CAMCOMMIT] (+native rejection reason),
[BASELEDGER], [CATALOG]. LODDBG flipped ON (temporary, flip back before commit).
⛔ CURRENT BLOCKER: LodEngine promotes 0/274 for list worlds (desired:0 views:0
before AND after camera settle; restaurantWorld promotes fine — Tomoni pin rendered +
framed on-sim). Attributing via [LODDBG] narrative next.
📌 Owner feel item parked: X-dismiss from the accidental Tomoni push returned to the
All-restaurants sheet but search chrome kept "Tomoni" — chrome/world desync on child
pop; fold into §4 / return-to-origin audit.

SESSION 2 END-STATE (verified on-sim, screenshots in session scratchpad):
✅ ALL-RESTAURANTS (cross-market list): FULL SUCCESS — tap tile → world commits (41)
→ chrome adopts title → fitAll lands continent frame (z3.30 commanded AND landed,
512-solve) → LodEngine promotes 30 → pins REVEAL fully opaque (NYC cluster + Austin
"26 Enchiladas Y Mas" + labels). The complete §3 composite verb chain is ALIVE.
✅ 512-TILE ZOOM CONSTANT: Mapbox GL zoom is 512-based; fit-all's metersPerPixel
fixed 256→512 (spec still 8/8 green). ⚠️ resolve-focus-camera.ts still carries the
256 constant — same physical bug, masked by zMax clamps; owner-blessed feel, so NOT
changed — needs its own reviewed pass.
✅ Chrome datum: safe-region top now = measured searchBarTop + searchBarFrame.height
(the profile band camera's own datum), not snapPoints.expanded (=70, wrong).
⛔ OPEN A — residual reject genesis (in-flight race class): "claims base v1, native
applied v2" on the Taco enter — JS built frame N+1 on base v1 while frame N (v1→v2)
was in flight. The 2026-07-12 resync self-heals (replace ships, roster recovers:
desired 9, views 9, opacity 1) but the enter frame loss costs the choreography. The
transport queue's in-flight serialization vs the enter lane needs a proper pass.
✅ OPEN B RESOLVED (was: Taco camera freeze): byte-offset log window caught the killer
red-handed — after the fitAll easeTo, a mode-none commit re-asserted the PREVIOUS
world's camera. Producer = use-search-session-origin-camera-runtime's session-exit
origin glide: its deferred microtask fired after a NEW session had already entered
(dismiss list A → immediately open list B) and stomped the new world's fit. FIX: the
microtask re-checks the bus at fire time — the glide commits only if the session is
STILL idle (completes the runtime's own "origin is the final word" ordering contract).
SIM-PROVEN: Taco crawl 2026 → fitAll z9.22 lands → promoted climbs 2→5→7→8 → ALL 8
ranked pins + labels fully opaque in the safe band, ZERO [MAPFRAME] rejects in the
whole window. Screenshot taco-fixed2.png.
📌 Open B addendum: that window also showed the earlier "resync replace died on
'unknown instance or frame'" only occurs when the enter races instance churn (folds
into Open A's in-flight race class — no reject at all on the clean run).
✅ OPEN C RESOLVED (bounds keying): list launches now write committedBounds: null —
a list world is BOUNDS-INDEPENDENT (fetch arm is "no LLM, no bounds"; camera derives
from members via fitAll). The viewport bbox only polluted the worldKey (same list
from different viewports minted different worlds; junk continental bboxes).
SIM-PROVEN: worldId now `list:<id>:restaurant||filters||none@v1`, all 8 pins reveal,
zero rejects. Regression sweep green (reconciler+camera+world-cache 30/30).
✅ MOUTH 4 DONE (messaging share → list world): SharePackagePreviewDto +
share-package-resolver list arm now carry listType; SharedEntityCard passes it into
the EntityRef so a shared-list tap runs the full list world (messaging spec 32/32,
both tsc clean). NOTE: API needs its usual rebuild+restart to serve the new field.
✅ TARGETUSERID IDENTITY FIX (correctness hole found while scoping the panel
world-read): the launch consumer DROPPED targetUserId — another user's virtual-All
world would have fetched the VIEWER's scoping. targetUserId is IDENTITY-relevant
(same virtual id under two owners = two worlds): added to the list queryIdentity
(contract + equality + identityKey gains `:u:<id>`), threaded launch → consumer →
fetch arm → getListResults. tsc clean, contract specs 15/15, Taco regression run
clean on-sim (8 pins, zero rejects, [FAVDBG] 8/8).
PANEL WORLD-READ — DESIGN DECIDED (implement next context): the composite push
carries `worldBacked: true` on the listDetail params (the executor knows a world
launch accompanies the entry — no store-sniffing); the panel then reads the mounted
results via subscribe/getSearchMountedResultsDataSnapshot (module-global, matcher =
resultsRequestKey contains `list:<listId>`) as the PRIMARY source for the DEFAULT
slice, with its own query enabled only for non-default slices and non-world entries
(slug/plain-push, until mouth 5). Kills the double-fetch on all world mouths. The
full strip 'world' flip needs the tuple's filterVariant to grow sort/market — a
separate contract decision (today's variant lacks both).
✅ PANEL WORLD-READ IMPLEMENTED + SIM-PROVEN: the listWorld composite push stamps
`worldBacked: true` (app-overlay-route-types listDetail params); ListDetailPanel
reads the mounted results store (subscribe/getSearchMountedResultsDataSnapshot,
matcher = resultsRequestKey startsWith `favorites:<listId>:` — the favorites lane's
key vocabulary) as the PRIMARY source for the DEFAULT slice; its own query is
enabled only for non-default slices and non-world entries. VERIFIED: full page
renders from world data with the panel query NEVER running (queryData=null
throughout; server log = ONE getListResults per open, was two), and an Open-now
slice flip correctly runs exactly one panel fetch (5 of 8, re-ranked). Pending
gates rewired (world-backed default slice pending = world not yet presented; a
failed enter pops via the §1 policy first).
✅ MOUTH 5 (SLUG) BUILT + SIM-PROVEN: shareSlug threaded as RT-18 ACCESS MATERIAL
on the list identity (deliberately EXCLUDED from identityKey/equality — same
viewer+list = same world regardless of capability) → fetch arm presents it. The
panel, on slug→listId meta resolution of a non-worldBacked entry, dispatches the
listWorld action through the SAME launch channel (no re-push; effectiveWorldBacked
= param || slugLaunched, so the world-read seam engages too). SIM:
`xcrun simctl openurl … crave://l/leg12been` → "Been" page + owner row + ALL 6
pins/labels revealed + fitAll camera + `||none@v1` worldId. Screenshot slug.png.
⛔ OPEN A — NOW THE LAST PIN-VISIBILITY DEFECT, fresh evidence: the Ramen Del
Barrio entity enter rejected ("claims base v2, native applied v3", instance
9ecilofg3ej, transactionKind enter, pins patch 1-upsert/7-removes) and the profile
world presented WITHOUT its pin. Class: a frame BUILT against a stale ack while a
prior frame is in flight (deltas must be built at FLUSH time against the latest
ack, not at queue time), plus the resync-replace dying on 'unknown instance or
frame' when instance churn races the enter. Both live in the transport queue
(use-search-map-native-render-owner) + native — the perf session's hot file; needs
its own focused pass with [BASELEDGER] windows.
✅ OPEN A FIXED + SIM-PROVEN: flush-time delta rebuild in flushLatestDesiredFrame —
a queued frame whose patch bases disagree with the LATEST ack rebuilds its source
transport at flush (buildSearchMapRenderSourceTransport against
lastNativeAck/lastNativeAckSnapshot; live role-frame transports untouched). The
exact raced sequence that rejected every prior run (dismiss All → immediately open
Taco) now logs `[BASELEDGER] flush-rebuild … changed=none` and produces ZERO
[MAPFRAME] rejects; reveal runs clean (promoted 8, views 8, settled live).
📌 OWNER NUANCE FOUND on that run: a multi-location member (Home Slice) came back
with a DIFFERENT representative location (east TX) than prior fetches → the exact
fit faithfully widened to z6.62 to include it. Representative-location selection
for multi-location restaurants in list results is a server/product decision to
ratify (stable rep vs nearest-to-user), not a camera defect.
✅ FIVE-MOUTH BLITZ COMPLETE (all sim/spec-proven):

1. home tile → list world (Taco crawl 8 pins) — sim-proven
2. virtual All → cross-market fit (30 pins) — sim-proven
3. restaurant card → entity world (Sunflower profile + rank-1 pin, zero rejects)
   — sim-proven via the testID lever (below)
4. messaging share → list world (listType threaded) — spec-proven (32/32)
5. slug deep link → list world (Been, 6 pins) — sim-proven
   testID lever CONFIRMED WORKING: `result-card-press-<restaurantId>` on the card
   Pressable resolves for maestro `tapOn: id:` (the earlier miss was my own id-space
   bug — I queried core_entities.entity_id, but the card key is the restaurantId /
   scoring-subject id from the hierarchy dump; NOT a reachability problem). The
   testID is a permanent rig lever, keep it.
   ✅ STRIP 'WORLD' FLIP COMPLETE + RED-PROVEN — §3 IS DONE. Contract decision made by
   CONSISTENCY (not owner-gate): the main search strip already re-slices the world
   (map+cards) on open-now/price and re-ranks on sort, so a list world MUST match —
   that's parity, not a product fork. Implemented:
   • filterVariant grew listSort + marketKey (equality + worldKey append-only when
   present; non-list worlds keep their exact historical key).
   • fetch arm passes the full slice (sort/openNow/price/market) to getListResults.
   • new `list_reslice` write cause (semantic, not per-chip — no type-list disease);
   launchListSearchResults accepts a `slice` → writes filterVariant, reconciler
   classifies variant_rerun (same identity, new filters, preserveSheet:true).
   • listWorld action carries `slice`; the panel's applySlice dispatches the re-slice
   (world serves ALL slices now — worldServesResults = worldBacked, isDefaultSlice
   gate dropped); the world-read seam updates cards reactively.
   • default-sort omitted from the dispatched slice (sort==defaultSort is the ABSENCE
   of a choice — same key-pollution principle as the bounds fix).
   RED PROOF on-sim: Taco crawl Open-now → map pins 8→1 (Home Slice, the one open
   member) + header "1 restaurant" + camera re-fit, all together; round-trip 8→1→8;
   worldKey clean (`open:1|...|similar:0||none`, no redundant sort); ZERO [MAPFRAME]
   rejects; variant_rerun classified each way. Search-runtime specs 89/89.

§3 STATUS: COMPLETE. 7 root reveal fixes + all 5 mouths (sim/spec-proven) + panel
world-read + bounds-independent keys + targetUserId/shareSlug identity/access +
strip world flip.
CONTRACT COVERAGE HARDENED (search-desired-state-contract.spec.ts, NEW, 11 tests,
PLANTED-OFFENDER RED-PROVEN): the session's load-bearing key/identity decisions are
now RED-lawed — shareSlug NEVER keys the world (leak → RED, verified), targetUserId
DOES key it (`:u:` segment), listSort/marketKey key only when present (pollution
guard), filterVariant equality covers the new axes. Full search-runtime suite 100/100. Only owner gates remain (finger-test, the multi-location
representative-location product ratification) + the pre-commit Swift LODDBG revert.

NEXT: §4 (the transition verdict program) — see below.

## §4 — VERDICT DELIVERED (plans/wave4-section4-transition-verdict.md)

Grounded read of the shipped transition system (2026-07-13). HEADLINE FINDING: §4 is
NOT a rebuild — the transition system was already brought to the ideal shape in prior
legs, with RED-provable laws guarding each seam. Three independent mechanisms already
satisfy the owner's "strip-placement crossing must be a NON-EVENT / chrome structurally
incapable of affecting the new page's layout":

1. THE SPINE — `app-route-scene-transition-policy-runtime.ts`: every switch resolves to
   explicit motion planes (sheet|camera|chrome|content) + a content handoff
   (swapImmediately vs preserveOutgoingUntilSettle). Dismiss = ZERO planes → sync idle;
   content plane arms IFF a crossfade runs; SEEDED opens swap in one frame. This IS
   "decide per permutation from first principles." Keep it.
2. STRIP STRUCTURAL ISOLATION — `scene-foundation-spec.ts` declares
   `strip: none|in-list|header` per scene, RED-lawed by `toggle-strip-scene-law.ts`
   (rendering an undeclared strip barks, naming the scene). Each scene mounts its OWN
   strip in its OWN host; the crossing is declarative, not a shared reflow.
3. STRIP-PRESENCE HEIGHT COUPLING — `scene-chrome-ack-runtime.ts`: per-scene chrome
   height cache; `resolveSceneChromeHeight` = exact → same-composition-signature
   (strip×grabHandle) → retained fallback, SYNCHRONOUS. Its stated law: "the chrome box
   and the body lane move in the SAME committed frame" — written to kill EXACTLY the
   owner's see-through-gap smell. A first-present scene borrows the right height class
   from any same-signature scene on frame 1; onLayout self-heals + is exact forever.
   Owner's named smell = STRUCTURALLY CLOSED. Child skeleton parity (every scene declares a
   `skeleton`) and entry-keyed child mount (ListDetailPanelBody reads `entry.params`, C2) are
   satisfied by construction. §4's remaining work = CONFIRM eye-checks + the per-permutation
   human feel oracle (owner-reserved), NOT new machinery. Full matrix + audit method in the
   verdict doc.

## SESSION SELF-REVIEW (2026-07-13, correctness pass over the session's own diff — the

## quality gate against "shipped-under-green"): two highest-risk changes reviewed.

## (1) Open-A flush-time rebuild: PERF-SAFE (cheap .some() per flush; the expensive

## buildSearchMapRenderSourceTransport fires ONLY on a detected stale base, not per frame);

## CORRECT (recomputes from native's acked state, preserves frameGenerationId so ack-match

## holds, null-ack degrades to full replace). (2) Strip-flip reslice: rapid-tap SAFE

## (contentSeam coalesces the burst to one dispatch against sliceRef.current; reconciler is

## last-write-wins). ONE minor documented edge: a reslice FETCH FAILURE leaves the chip

## state (sortOverride/openNow/…) briefly ahead of the reverted world (fire-and-forget

## dispatch, contentSeam can't roll back what it doesn't await) — transient visual desync,

## NO crash/corruption, self-heals on the next successful action. Acceptable v1; a clean fix

## would await the world-commit in the reslice branch before resolving the seam.

##

## MULTI-LOCATION REP ATTRIBUTION (2026-07-13, "attribute before ideate" — done):

## Traced the "Home Slice fit-widens" observation to root. The list-world pin coordinate

## comes from `search-query.executor` FIRST-CONNECTION-WINS (the first location row for a

## restaurant sets locationId/lat/lng; later rows only fill null price/status/distance) —

## NOT nearest-to-user (no viewport compute) and NOT a within-list non-determinism bug.

## Home Slice showed a different rep because I opened it from TWO DIFFERENT lists

## (All-restaurants[NYC-heavy] vs Taco crawl[Austin]) whose query SCOPES surface different

## first-connections. VERDICT: a genuine multi-location-representative product+architecture

## question (which location represents a chain in a given list's map?), with real blast

## radius on the SHARED executor. Owner-gated by EVIDENCE, not assumption — options:

## (a) nearest-to-list-centroid, (b) the saved location, (c) primary-market location.

## FIX PATH DE-RISKED (found, deliberately NOT applied — owner reserved the decision):

## the favorites TILE view already uses stable `restaurant.primaryLocation`

## (favorite-list.mappers.ts:374); the list WORLD uses the executor's first-connection

## location — the two views of the SAME list can disagree. The consistency fix (world uses

## primaryLocation, matching the tile) is LOCALIZED to favorite-list-results.assembler.ts —

## override each restaurant row's lat/lng with its primaryLocation (source items already

## include it), NO shared-executor change, NOT entangled with the perf session. Watch-outs:

## keep distanceMiles consistent with the chosen coord; fall back to executor coord when

## primaryLocation is null. NOT applied because the owner explicitly reserved "stable rep vs

## nearest-to-user" — a stable-primaryLocation default (≈ b/c) would pre-empt a possible

## nearest-to-user (a).

## CORRECTION (deeper impl-level look — the "~15-line" estimate was WRONG): the executor

## restaurant row is NOT just lat/lng — it also carries locations[], displayLocation, and

## distanceMiles, ALL internally consistent with the executor's chosen location. Overriding

## only lat/lng in the assembler mints NEW internal inconsistencies (pin vs profile-locations

## vs distance). A correct fix must re-derive ALL location-linked row fields together from the

## chosen location, OR change the shared executor's connection-join to prefer primaryLocation

## (high blast radius — every search). So this is a genuine multi-field ARCHITECTURE change

## with real verification surface, NOT a quick win — correctly owner-gated + deserves its own

## focused pass. (The investigation itself is the value: it proved the item is genuinely

## non-trivial, not something being avoided.)

##

## WAVE-4 STATUS: §1 done (failure law), §2 done (500-class), §3 COMPLETE (this session),

## §4 verdict + ALL STRUCTURAL AUDITS DONE (entry-keyed mount PASS, child skeleton parity

## PASS, git-history sweep = canonical culmination nothing-to-graft, strip-crossing gap

## structurally disproven). §4 structural program COMPLETE — only the owner's live-eye

## per-permutation feel verdict remains (reserved to the human oracle by methodology).

## Remaining across the WHOLE charter = owner gates ONLY: finger-test, the per-permutation

## feel oracle, the multi-location representative-location product call, + THE COMMIT.

## Binary returned to clean state (lodDebugLoggingEnabled=false, rebuilt+installed).

## NOTHING FURTHER IS EXECUTABLE IN CODE WITHOUT THE OWNER.

⛔ OPEN C — tuple committedBounds for the Taco world carried junk continental bbox
(48.13,-68.26,-25.23,-103.85) into the worldKey — the known bounds-keying item, now
with a live repro.
🔧 TEMPORARY STATE TO REVERT BEFORE COMMIT: lodDebugLoggingEnabled=true + the
[LODDBG] decideZERO block (SearchMapRenderController.swift); instrumentation logs
([FITALL]/[CAMCOMMIT]/[BASELEDGER]/[CATALOG]) are **DEV**-only and can stay or be
trimmed per owner taste.
REPRO RECIPE: maestro tap flows in session scratchpad (tap-all.yaml = Lists tab
50%,93% → "All restaurants"; Taco = tile has no text-match, coordinate-tap 27%,35%
on the Lists page). Reload via scripts/rig/reload-dev-client.sh; LODDBG via
`xcrun simctl spawn <udid> log show --last 3m --predicate 'eventMessage CONTAINS "LODDBG"'`.

## §4 — THE PAGE-TRANSITION PRIMITIVE, DECIDED HOLISTICALLY

The owner's frame: we are not fixing pages; we are deciding THE transition system for
every permutation — parent↔parent, parent↔child, child↔child, and every strip
placement combination (header-mounted strip page ↔ in-list strip page must be a
NON-EVENT: the old page's chrome must be structurally incapable of affecting the new
page's layout — today's strip-gap/adjust behavior means chrome is coupled across the
switch, which is the architectural smell to root out). Decide from first principles +
industry practice: where skeletons are the right cover (parent↔parent already decided
good), whether children use the same skeleton flow, what "everything settles at the
same instant" requires structurally. Audit every existing page against the decided
pattern (do they follow ANY precedent?); what deviates gets cut over, not patched.
Use git history to check whether prior eras (crossfade engine, hard-swap+skeleton
pivot, scrollHeader era) had pieces closer to ideal — bring back what was better,
make it better than it ever was. Prior art docs: page-switch-redesign,
transition-hard-swap-skeleton-pivot, child-transition-primitive.md (UI legs 5-6),
scene-chrome-ack-runtime (height cache), page-foundation-standard (8 pieces).

## §5 — Execution order (direct, hands-on, sim-verified per item)

1. §1 failure primitive (small surface, unblocks trust) + banner clear-on-health.
2. §2 attribution sweep (mapper throw pattern + cron error) — cheap, parallel reads.
3. §3 search restoration (the big one; owner's top anger; instrument relentlessly).
4. §4 transition-primitive design verdict → cutover (interacts with §3's reveal flow;
   design after §3's wiring exposes the real seams, cut over once).
   Each item: logic walkthrough → build → MY eyes on the sim → only then reported.
   Rig: iPhone 17 Pro 7B0DD874-3496-46F7-9480-3EDDABCE2F31, Austin pinned; reload rig
   from repo ROOT; API restarts per hardened recipe; never touch the Pro Max.
