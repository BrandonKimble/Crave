# Trigger/Nav Ideal — vision, verdict, and strides

**Method (owner-directed, 2026-07-08):** the ideal architecture below was composed from first
principles and FIXED before any code was inspected; three read-only auditors then graded the
current implementation against it (trigger layer · nav/entry model · links/addressability/pick).
Effort/difficulty were excluded from every judgment by instruction — only "is it the most ideal
and what would it take."

---

## 1. The ideal (fixed before inspection)

**Organizing principle: a search is a VALUE, and searching from anywhere is PUSHING A PAGE —
the same push as any other page. There is no "search flow" to trigger; there is one navigation
algebra, and search is a destination in it.**

1. **One value — the Desire**: `{ identity (closed sum: text | shortcut | entity | entity-set |
seeded), constraints (filters/area/tab), mode (navigate | pick) }`. Triggers construct it,
   never interpret it.
2. **Two trigger verbs app-wide**: `push(searchScene, desire)` (session-creating) and
   `revise(desirePatch)` (in-session mutation). Nothing else.
3. **One reconciliation engine**: desired vs presented; resolve (cache→derive→network);
   last-write-wins; loading/failure/offline/empty are world states.
4. **Navigation = a stack of self-describing value entries**: entry =
   `{sceneKey, params, origin, chrome{snap, header}}`. Search is an ORDINARY scene. Child pages
   nest by pushing. Pop = restore the previous entry.
5. **The return trip is captured at departure**: uniform `captureOrigin()/restoreOrigin()` scene
   interface; dismiss from any depth is pixel-exact.
6. **Chrome shared, position is data**: one sheet + one header host; snap positions live as data;
   trigger-at-any-sheet-position is interpolation, not a code path.
7. **One universal tappable — EntityLink**: any entity mention anywhere maps entityRef → Desire →
   push through one component; new surfaces inherit triggering by rendering it.
8. **Addressability**: Desire ⇄ URL bijection; deep links, notifications, share links, and in-app
   taps are the same parse → value → push.
9. **Pick mode = a result-handling policy on the entry** with a completion promise; nothing else
   differs.
10. **Choreography belongs to the transition engine**, not to search; presentation intent is
    DERIVED from the entry/desire delta, never passed.

**Invariants:** I1 every trigger ≤1 line of value construction · I2 no trigger references
presentation · I3 pop from N deep is pixel-exact · I4 desire⇄URL total · I5 newest desire wins ·
I6 a new page joins by implementing the scene interface alone · I7 pick changes only result-tap
handling.

**One refinement the code taught (vision improved post-inspection):** transition MOTION between
two entries is a _relation_, correctly kept in a declarative (from,to,kind)-keyed descriptor
table — the existing snap-motion table is BETTER than putting motion on the entry. The entry
should carry only its own captured presentation state (origin, detent, params); the relation
table stays.

---

## 2. Verdict — pillar by pillar (audited 2026-07-08, three agents, file:line grounded)

### Already IS the ideal (keep, do not rebuild)

- **Pillars 1/3/10 (value + engine + derived intent)** — the desired-state S1–S4 rebuild: one
  tuple, one writer, delta-classifying reconciler whose DERIVED intent provably wins (one passed
  hint is literally `void`ed; another is re-derived from view inputs and ignored). Failure/
  offline/retry are world states.
- **Revise-class triggers** (4 chips, tab pill, retry): 1–2 lines, pure value, zero presentation
  references — I1/I2 PASS today.
- **Generic transition core**: PF single-writer switch + co-mounted legs + paint-ack hard-swap +
  one skeleton engine for all scenes; one physical sheet; one persistent header host; snap rules
  as a declarative descriptor table.
- **OriginSnapshot** is already the full ideal payload `{sceneKey, params, detent, segment,
scroll[], anchor}` with a provider-registry capture seam.
- **The de-facto Desire union exists**: `LaunchIntent` + `dispatchLaunchIntent` (4 surfaces +
  notifications already flow through it), and poll comments ALREADY carry structured
  `entitySpans` with entity ids — the EntityLink data model is live.

### Misses the ideal — the six gaps

**GAP A — push-class triggers are procedures, not values (I1/I2 FAIL).**
Every session-creating trigger (search bar, autocomplete, recents, shortcuts, STA, deep link)
ends in the right tuple write but fronts it with 10–60 lines of chrome (keyboard/blur/suggestion
teardown, warm-seeding, docked-polls flags, perf attribution) threaded through 3–5 owner hops,
still passing vestigial hints (`presentationIntentKind`, `preserveSheetState`, `entrySurface`,
the mutable `submission` decoration side-channel). Only two hint duties are still load-bearing
and both are derivable: bounds-source selection (STA fresh capture) and the include-similar
session reset (≡ session_enter/replace class).

**GAP B — the stack entry is impoverished (the deepest miss).**
Entry = `{key, params}` only; origin, snap, header live in _sibling registries keyed by
sceneKey_, and rendering is one warm leg per scene key. Direct consequences: same-key nesting is
structurally impossible (`userProfile(A) → userProfile(B)` cannot exist — push replaces the top
entry when keys match); child pop restores by warm-leg accident, not by restoring a captured
entry (breaks the moment legs re-param per entry); nav-out is a 2/13 per-scene opt-in instead of
a `laneKind==='child'` derivation. Summary: **entries-as-values route truth, registry-keyed-by-
scene presentation truth.**

**GAP C — search is first-among-equals, not ordinary.**
The shared sheet still lives inside a "searchRoute" shell; origin capture/restore verbs are
search-dismiss-named (the machinery is scene-generic, the triggering isn't); the map-synchronized
reveal/dismiss is a private search transaction family (surface phase machine, prepared-
presentation runtimes, own command verbs) rather than a readiness contract any push can supply.

**GAP D — no EntityLink; tap→desire policy re-encoded 3–4×.**
Poll span rendering + the restaurant-vs-entity dispatch fork are ~70 bespoke lines inside
PollDetailPanel; profile/bookmarks rows hand-roll intents; the search side (autocomplete/recents/
result cards) uses a _different_ thrice-duplicated `selectedEntityId` submission shape that never
touches LaunchIntent. TWO value families exist where the ideal has one.

**GAP E — addressability is 2 of 7.**
`parseLaunchIntentFromUrl` handles `crave://restaurant/<id>` + `crave://saved-place/<id>` only.
No serializer exists. Outbound share links (`/l/<shareSlug>`) are emitted but have NO inbound
route — a shared list cannot open in-app at all. Notifications parse payload→intent (good
layering) but handle one type.

**GAP F — pick mode is a plan-doc paragraph.**
Zero code; result-card taps are per-card handlers, not a policy-injectable chokepoint.

---

## 3. The strides (ideal-only; dependency-ordered)

**S-A. The great trigger deletion. — ✅ EXECUTED 2026-07-10 (STA-as-toggle 4c55f24f; flag
deletion 92274913 + harvest commit).** `presentationIntentKind`/`preserveSheetState`/
`entrySurface`/`transitionFromDockedPolls`/the filter overrides are DELETED from every submit
trigger (they were copies of facts `classifySearchWorldTransition` derives; the enter effects
already ran on the derived intent). The include-similar reset rides the identity tuple write
(`filterVariant includeSimilar:false` when not `replaceResultsInPlace`); retry became
`replaceResultsInPlace:true`; the attempt config shrank to the decoration payload; the
foreground entry-surface resolver is deleted. Every push trigger is `prepare + submit()`.
**Adjudications (probed against the code, not the plan):** (1) the keyboard/suggestion/blur
teardown does NOT move into session_enter effects — it is press-side by nature (gesture-blur
ref ordering, the beginSubmitTransition deferral, and it must fire on the empty-query bail
where no tuple write happens); it is already ONE line per trigger (`prepareSubmitChrome()`).
(2) The decoration side-channel STAYS — analytics-only ({submissionSource, submissionContext}),
one register/take pair braced around the write; folding it into the tuple would pollute value
identity. (3) `searchThisArea`/`forceFreshBounds` survive as the two honest trigger facts
(bounds capture is a trigger-time ACTION — awaiting the settled camera — not derivable after
the fact). Hop count is now trigger → submit owner → tuple write.

> **S-A carries one INBOUND deliverable from the toggle-system effort**
> (`plans/toggle-system-ideal.md` v2.1 — read its header + "Search-this-area" section
> before rewriting the STA trigger): **search-this-area rides the toggle coordinator.**
> The owner decreed STA IS a toggle (availability = a predicate, flow = identical to
> every chip); three red-teams settled the shape: the reconciler's `area_rerun` branch
> (`search-world-reconciler.ts` ~:277-300, today a direct `env.resolve` that bypasses
> `scheduleToggleCommit`) dispatches through the coordinator with the kind the
> classifier DERIVES (`'search_this_area'` — never trigger-passed, per I1/I2; widen
> `ToggleInteractionKind` + `deriveToggleKindFromFilterDelta`'s return type);
> `runEnterForegroundEffects`/intent-kind semantics preserved (parameterize the kick,
> don't fork it); **`mapMovedSinceSearch` resets AT CAPTURE (tuple-write time), not at
> finalize** — reset-at-finalize preserves two live bugs (pan-during-flight wipes the
> button; a failed search clears the retry affordance). The 300ms quiet window on a
> today-synchronous dispatch is a feel-check item; `settleMs` per-kind override is the
> declared knob if the eye rejects it. It lands in exactly the files S-A rewrites
> (the STA submit runtime, `use-search-submit-entry-owner.ts`, the classifier), which
> is why it is S-A's deliverable and was NOT built by the toggle session. The search
> coordinator is already the thin adapter over the generic engine
> (`src/toggles/toggle-interaction-engine.ts`, landed 613f850b, API unchanged) — S-A
> consumes `scheduleToggleCommit` as-is.

**S-B. Entries become values (the foundation stride).** Move origin + captured presentation
(detent, segment, scroll, params) ONTO the stack entry, captured at push; key presentation off
entry _instances_, not scene keys (per-entry leg instantiation for children); pop = restore the
popped-to entry, always, replacing the warm-leg accident; derive nav-out from
`laneKind==='child'` (13/13); delete the same-key top-replacement so `userProfile(A) →
userProfile(B)` exists. The motion descriptor table STAYS (relations, not entry state). This is
"the child-nav stack" — the registry's hardest contract — with the audit-identified root cause
fixed rather than worked around.

**S-C. De-special search.** Rename/dissolve the "searchRoute" shell (the sheet system is the
app's, not search's); make origin capture/restore fire on EVERY push/pop (the snapshot is
already scene-generic); lift the results-readiness join into the generic push as an optional
content-readiness contract (search supplies map+cards readiness; other scenes already supply
paint-ack — same slot).

> **S-C COMPLETION UNBLOCKS toggle Gate 2 (owner directive 2026-07-09):** when S-C
> closes (specifically once `SearchOverlayChromeHost` / the warmup-host threading is
> re-homed), run `plans/toggle-system-ideal.md` Gate 2 — FilterChip upgrades + port
> the five SearchFilters chips; SegmentedToggle warm-restore + a11y tap + REPLACE the
> hand-rolled SearchFilters pill; stable strip slot keys — with the feel-check script
> in that plan (incl. chrome-swap first frame + polls strip). Flag it to the owner at
> S-C close if a session isn't picking it up.

**S-D. One Desire + EntityLink.** Dissolve the dual value families: LaunchIntent's search-shaped
members become `push(search, desire)` (the tuple identity IS the payload); its pure-nav members
become plain pushes. One `entityRef → Desire` function replaces the 3–4 copies (restaurant-vs-
entity policy encoded once). Wrap PollDetailPanel's span rendering into the shared `EntityLink`
component; profile rows, bookmarks rows, and (later) notification rows render through it. New
surfaces then inherit search-triggering with zero wiring (I6).

**S-E. Addressability. — ✅ EXECUTED 2026-07-10 (59dc2413).** `desire-url-codec.ts` = THE
parser+serializer pair (26 round-trip goldens, both bases): `/r /e /u /l /list /q /s /p` under
crave:// AND https://crave-search.app. Found+fixed on the way: (1) custom-scheme URLs park the
first segment in `URL.hostname` — the old pathname-only restaurant parse NEVER fired on real
crave:// links; (2) the API's list-results endpoint was owner-scoped, so a share recipient could
resolve the slug but never load the world — visibility widened to owner OR shareEnabled.
LaunchIntent gained `sharedList` (async getShared → the same listWorld lane) + `searchDesire`
(/q, /s → the same submit verbs); notifications route any `url` payload through the codec
(poll_release kept); outbound share links serialize through it. Rig-proven: crave://q/tacos →
full natural world; crave://l/<slug> → the shared list's world with members rendered — **list
sharing works end-to-end for the first time.** REMAINING (named, deferred): OS universal-link
registration (associated-domains entitlement + hosted AASA — infra/release item; until then
https share links open the browser); ListBody failure/empty body for dead slugs (§5.6, the
listDetail-era item — today a dead slug logs loudly and stays home). The S-C.5 re-probe RAN
same night: polls deep link over an open profile lands canonical — the post-commit arms are
healthy under programmatic switches.

> ✅ **CLOSED (2026-07-10 ~4:40AM, d139bc11): [SE-QSTALL] root-fixed.** Attribution via 4
> staged probes: the results-sheet interaction flags (isResultsSheetSettling) latched TRUE
> when a terminal dismissal detached the results plane mid-settle (the settle-END callback
> dispatched to the next plane); the latched flag starved the hydration publication's
> motion-lane gate (596 rAF loops/10s measured) → listPreparedRowsReady never published →
> the next enter parked at skeleton. Only sheet-motionless submits hit it (the /q lane);
> the perf-scenario correlation was a timing red herring. Fix at the flags' OWNER: the
> interaction-state runtime zeroes them when the surface's active bundle leaves 'results'.
> RED→GREEN on the exact repro. Original finding below for the record.
>
> ⚠️ **OPEN RED (2026-07-10 ~4AM, [SE-QSTALL]): the NEW `searchDesire` lane (/q, /s) stalls
> at skeleton when fired as a session_enter while the DOCKED-POLLS home is presented.** The
> world resolves fine (API 200, rows committed, frame cached, [RECONCILE] session_enter
> clean) — the content-plane reveal never finalizes. NOT a regression of existing flows:
> typed submit from the same docked home renders fully; session_replace over a stuck world
> renders fully; the lane worked at fresh boot (before polls presented). Repro:
> docked-dismiss-roundtrip → wait settled 'Polls in New York' → `xcrun simctl openurl
crave://q/ramen` → title commits, skeleton forever. Attribution next session: plant a
> probe at the results-presentation surface authority logging (visualPolicy.phase,
> enter-transaction state, poll release gates) on the repro — candidate class: the enter
> presentation intent racing/awaiting the docked-polls release the same way the S-C.5
> lane-input deadlock did, but on the ENTER side. Instrument, don't theorize.

**S-F. Pick mode. — ADJUDICATED 2026-07-10: rides the listDetail page, not before.** §5's
red-team already called pick non-foundational; with S-A..S-E executed the sharper fact is that
pick's ONLY consumer (listDetail "Add places") doesn't exist yet — landing
`push(search, desire, {pick})` now would be dead machinery guarding a phantom consumer.
Original spec (unchanged, executes with the listDetail design pass): centralize result-card tap
into one policy-injectable handler, then `push(search, desire, {pick}) → Promise<Selection>`.

**Then the pages land on this foundation** — userProfile, listDetail, followList, notifications,
settings each become: scene metadata row + body + skeleton spec + header descriptor + origin
provider (S-B makes that the whole contract), with listDetail = the search-results renderer fed
by `push(search, entity-set-desire)`.

**Dependency order:** S-B first (foundation; everything keys off entry instances) with S-A in
parallel; then S-C; then S-D; then S-E; then S-F; pages ride along from S-C onward (listDetail
is both a page and the proof of S-C/S-D).

---

## 4. Owner ratification + the drill-in / orphan addendum (2026-07-08)

The owner walked the gap list and ratified the strides, with the following refinements. These
are DESIGN, part of the fixed ideal — extracted from the behavioral brief, not from code.

### 4.1 Orphan pages (new vocabulary, replaces the "child nav-out" special case)

Three surfaces belong to NO page: **restaurantProfile**, **userProfile**, **listDetail**
(deep-linked or in-app). They are triggerable from anywhere — search bar, autocomplete, an
entity span in a poll, a deep link, a profile row — and pushing one does NOT change which root
page you are "on": pull up a user profile while on Favorites and you are still on Favorites; the
content switched and the nav bar left, that is all. Dismissal from any depth returns to the
exact origin.

**The unified law (supersedes the per-scene nav-out opt-in AND the "children only" phrasing):**

> **The nav bar shows iff the top-of-stack entry is a root tab page (stack depth 1).**

Derived, never opted into. This single rule covers children of root pages (settings under
profile, poll detail under polls) and orphans identically — an orphan IS a stack child of
wherever you were standing. No `laneKind` enum needed for the nav bar at all; `laneKind` remains
only if some OTHER behavior genuinely differs by it (none identified yet — delete it if none
materializes).

Orphans come in two flavors, and the stack does not care:

- **world-backed orphans** (restaurantProfile, listDetail): the entry's payload is a Desire; the
  push runs the search flow and presents a world (ProfileBody / ListBody per the companion doc
  `plans/world-camera-multilocation-foundation.md`); map + camera participate.
- **plain-scene orphans** (userProfile): an ordinary scene body; no world, no map coupling (a
  user profile may EMBED map-backed content later, but the page itself is not a world).

**userProfile is searchable**: the search bar / autocomplete may resolve a person and construct
`push(userProfile, {userId})` — same two-verb law (I1/I2), the trigger builds a value. The
Desire sum does NOT grow a person arm; people are not worlds, they are scenes. Autocomplete
returning mixed result kinds (dish/restaurant/person/list) maps each row kind to the right
push — that mapping lives in EntityLink (S-D), once.

### 4.2 The drill-in contract (the "locked-in standardized pattern")

Drill-in journeys — poll → username → their profile → one of their lists → a restaurant →
back-back-back to the exact origin — reduce to exactly two obligations, and nothing else:

1. **To BE drillable-into**, a scene implements the scene contract: metadata row + body +
   skeleton spec + header descriptor + origin provider (`captureOrigin()/restoreOrigin()`).
   That is the whole membership card (invariant I6).
2. **To DRILL IN**, a surface renders an `EntityLink` (S-D): entityRef → value → push. One
   component, one `entityRef → push` policy function, zero per-surface wiring.

Everything else is the engine's: per-entry instances (S-B) make same-key nesting and loops legal
(`userProfile(A) → list → restaurant → userProfile(B)`, arbitrary depth, cycles fine); pop
restores the popped-to entry's captured presentation exactly; nav-bar visibility derives from
depth (§4.1). A new drill-in destination in the future = implement the contract; a new drill-in
SOURCE = render EntityLink. Nothing to design per journey, ever.

**Logic-perfect before UI-perfect (owner directive):** build the mechanism against REAL known
destinations now, with unstyled-but-real pushes — a Follow button and follower/following counts
on userProfile (→ followList), a notifications row, a settings gear, and **homes for the
already-built modals** (buttons somewhere real so they stop living nowhere). The pages ship as
contract-complete scenes with placeholder bodies: real entries, real origin capture, real
skeletons, real back — provisional pixels. UI identity passes come later per page; the stack
logic must be exercised end-to-end (poll → profile → list → restaurant → back×3, byte-exact
origin) BEFORE any page gets its design pass.

### 4.3 Registry relationship + deferrals

`plans/page-registry.md` stays the owner's brain-dump of end-state behavior — we extract
patterns FROM it into the fixed ideal (this doc + the world/camera companion); we do not build
from it directly. Updates flowing back INTO the registry from this addendum: the nav-bar law
generalizes to orphans (restaurantProfile / userProfile / listDetail hide it regardless of
trigger source); listDetail is a peer surface kind, not a results variant.

**Deferred (owner call): S-F pick mode.** Special-case, not foundational — drops out of the
foundation sequence entirely; revisit when listDetail "Add places" is actually being built. The
result-tap chokepoint centralization survives inside S-C/S-D on its own merits.

**Revised dependency order:** S-B (entries-as-values, the foundation) with S-A in parallel →
S-C (de-special search; the readiness contract is what lets world-backed orphan pushes ride the
generic push) → S-D (One Desire + EntityLink, incl. the autocomplete row-kind → push mapping) →
S-E (addressability; /l/<slug> inbound) → pages land from S-C onward as contract-complete
placeholder-body scenes (userProfile, followList, listDetail, notifications, settings) →
world/camera layers L1–L5 per the companion doc interleave where their code overlaps (L3
ProfileBody worlds pairs naturally with S-C).

---

## 5. Red-team resolutions (2026-07-08, three auditors: design-consistency, code-grounded, scenario-walk)

Every finding below is RESOLVED into the fixed ideal; where a doc section above says otherwise,
this section wins.

### 5.1 Search itself is a push (the nav-law dependency)

Presenting a search session on any tab **is a push**: depth 2, nav out. The depth-1 search root
is home@collapsed. TODAY search results are NOT a push (`openAppSearchRouteResults` re-roots via
`requestOverlaySwitch` default `'setRoot'` — depth stays 1), so the nav-bar law cannot land
before search-as-push (S-C) without an interim clause: **interim, a presented world counts as
depth>1**. The registry's search row and its "one leg per scene key" §2 design constraint are
SUPERSEDED by S-B (per-entry instances). Also superseded: the registry's
`openChildScene(..., {searchFlow?})` sketch — world-backedness is scene METADATA, never a
trigger flag (I2).

### 5.2 The verb is `push(sceneKey, payload)`

Retire the `push(searchScene, desire)` phrasing. World-backed scenes (`restaurantProfile`,
`listDetail`, search) take a Desire payload; plain scenes take params. Body kind and
world-backedness live on the scene metadata row. **Naming: `restaurantProfile`** (the current
`restaurant` key renames). The Desire identity sum gains a **`list(listId)` arm** — live list
identity (mutable membership, share slugs, the synthetic "All" list), NOT a frozen entity-set;
`entity-set` remains for literal id arrays.

### 5.3 World residency and the pop path (the deepest resolution)

**Exactly ONE world is live: that of the nearest world-backed entry at or below top-of-stack**
(the root page's world is the base case). Plain-scene entries (userProfile) are TRANSPARENT to
world presentation — the world below stays presented under them (map live behind; any
frost-under-plain-scenes treatment is a later UI decision, not structure).

**Pop never re-fetches.** At push, the covered world-backed entry retains its resolved world
snapshot (data pinned on the entry); pop re-presents FROM that snapshot through the normal
reveal machinery — skeleton-free, pixel-exact (I3), network never on the pop path. Legs beyond
a small depth K unmount; the entry keeps data + origin for instant remount. Same-key entries
are independent instances; **no pop-to-existing / dedupe** — back always pops exactly one.

**Origin semantics, one way only:** the origin lives on the PUSHED entry (captured at
departure); pop applies the popped entry's origin to the scene it reveals. The single-slot
`capturedOriginContext` (first capture wins) is replaced by per-entry origins under S-B.
**I3 is scoped to committed presentation** (detent, segment, scroll, anchor, camera) — transient
input chrome (autocomplete overlay, keyboard, partial query) always closes on push and is never
restored. The verdict §2 OriginSnapshot line is amended: the ideal payload INCLUDES
`camera{center, zoom}` (today nothing captures camera — net-new, per the companion doc).

### 5.4 Camera choreography rules (added to companion doc §3.2)

- Camera intent executes on **session_enter/replace deltas only**, or when the intent VALUE
  changes; revise-class deltas (sort, filter, toggle) NEVER move the camera. (A list re-sort
  re-drives rows + catalog, not the camera.)
- Restores are **last-write-wins and cancel in-flight motion**; a restore within epsilon of the
  current camera is a no-op (rapid back-back-back coalesces cleanly).
- **`hold` on unresolved/failed worlds** — failure never moves the camera.
- `safeRegion` derives from the world's **target snap** (data, not a constant): profile worlds
  present at MID snap (the registry's "profile select → top snap" row is superseded — the body
  IS the profile now; anchor lands in the visible top third).
- List LOD promotion keys off **crave-rank (stable across sorts)**, not the active sort order —
  no promotion churn on re-sort. (Map-mirrors-sort is a flaggable product knob, default off.)
- `fitAll` stays exact per owner decree; cross-market lists (continent zoom on one NYC entry in
  an Austin list) are a NAMED open owner call, not silently clamped.

### 5.5 laneKind: delete the `'child'` arm only

Code audit: zero consumers of `laneKind === 'child'`; nav-out today is an intent-store opt-in
(2 registrants), not laneKind. But `'docked-polls'` is load-bearing across 5+ authorities
(persistent-poll-lane discriminator). Resolution: **docked-polls is a presentation MODE of the
depth-1 polls entry, not a stack level** — keep it (enum or boolean), delete the `'child'` arm;
nav-bar visibility derives from depth alone (§4.1).

### 5.6 Failure/empty is the eighth member of the scene contract

§4.2's contract list omitted it: every scene (plain orphans included) ships metadata + body +
skeleton + header + origin **+ failure/empty spec** (the page-foundation standard already
requires this) — an offline `userProfile` push must show its failure body with retry, never a
permanent skeleton behind a hidden nav bar. For S-E: a failed `/l/<slug>` resolution presents
the world failure state inside ListBody with Retry + explicit "Go home" (pop); private/deleted
lists get a distinct empty-state body; auth/visibility gating deferred but NAMED.

### 5.7 Scope table (what rides the stack, what doesn't)

- **Stack entries:** root tab pages; children (pollDetail, saveList, pollCreation, settings,
  editProfile, shareConfig, followList, notifications); orphans (restaurantProfile, userProfile,
  listDetail); search sessions (§5.1). saveList/pollCreation opens become one-line pushes under
  S-A. shareConfig joins the S-E share story explicitly.
- **NOT stack entries:** modals (sortSheet, marketPicker, duplicatePoll, pollInfo, paywall,
  listEdit, listConfig — all green-field; plus built price/scoreInfo/appModal) — overlays that
  never change top-of-stack, exempt from the nav-bar law by construction. The full-screen
  search-suggestion surface and the handle picker are transient input chrome (§5.3): closed on
  push, excluded from origin.
- **"Homes" correction (§4.2):** what actually lives nowhere is the 7 contract-complete STUB
  SCENES in `StubScenePanels.tsx` (no entry points) — plus the profile "Settings" placeholder
  modal, which becomes a real `push(settings)`. The registry's new modals are unbuilt.

### 5.8 Autocomplete row kinds = explicit S-D deliverable

The wire type is open (`entityType: string`) but THREE closed unions gate it (`matchType`
`'entity'|'query'|'poll'`, the submit-runtime fork, the SearchSuggestions render branches) —
textbook type-list disease. S-D delivers a `rowKind` widening (person, list) + the
row-kind → push mapping inside EntityLink; the desired-tuple entity union correctly does NOT
grow (people/lists are pushes, not tuple identities). Note §4.1's "still on Favorites" is
tab/route truth, not map truth: today `ensureAppSearchRouteSearchScene` re-roots to search
before entity pushes (destroying the Favorites root) — S-B/S-C remove that re-rooting; the
root's world is restored by the dismissal chain, not untouched.
