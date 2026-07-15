# Search lifecycle — Phase 0 requirements & constraints ledger

**2026-07-14. This is the ONLY input to the Phase 1 clean-room design.** Every line is a
behavioral requirement or hard constraint, stated without reference to any existing code
shape. Sources: owner directives (2026-07-14 session + prior ratifications), the ratified
2026-07-08 ideal (plans/trigger-nav-ideal-verdict.md — itself composed clean-room), the
lens-law verdict, and platform facts. The companion autopsy
(plans/search-lifecycle-phase0-autopsy.md) is QUARANTINED from design — it informs only the
Phase 2 gap verdict.

## A. What a "search" is (behavioral)

- A1. A search presents a **world**: a set of ranked, mappable results (restaurants/dishes)
  shown simultaneously as map objects (pins/labels/dots) and sheet cards. Map and sheet are
  two projections of ONE set — they can never disagree (the lens-law invariant:
  `listIdSet === mapIdSet` under any filter).
- A2. World identity is a **value** (query/entity/list identity + retrieval-semantic
  filters + tab). Time/fact-projection filters (open-now, price once available, sort
  flips) are **lenses** applied client-side over one world — never part of world identity.
- A3. A **single restaurant** opened directly (comment span, autocomplete, deep link,
  result-card/pin tap) is the SAME kind of thing: a world of one (or the restaurant's
  world) presented with full map coordination + the profile as sheet content. "One
  restaurant" and "a list of results" are not different systems.
- A4. Worlds resolve through one engine: cache → derive → network; newest desire wins;
  loading / failure / offline / empty are world states, not special flows.

## B. Mouths (triggers) — the agnostic law

- B1. A mouth is ANY surface that can start a search. Known today: home search bar +
  autocomplete + recents + shortcut tiles; home list tiles; bookmarks rows + per-side All;
  profile list taps (own + foreign, targetUserId-scoped); poll-comment entity spans
  (dish/food → entity world; restaurant → restaurant world); messaging shared-list cards;
  slug deep links (crave://l/, /q, /s, /r, /e); notifications. Future mouths must inherit
  everything by construction.
- B2. A mouth's ONLY job is to construct a value (the desire + its anchor) and fire one
  verb. ≤1 line of value construction; zero presentation knowledge (ratified invariants
  I1/I2). If a mouth needs its own dismiss/reveal/choreography code, the abstraction has
  failed.
- B3. **Sub-mouths**: inside a presented world, tapping a result card or a map pin/label/dot
  is itself a trigger. It must NOT tear down the world: all pins stay, the tapped pin flips
  to active color, the sheet content swaps to the restaurant profile (pushed WITHIN the
  session), and back pops cleanly to the world exactly as it was. Re-taps of other
  cards/pins while a profile is open re-target in place.
- B4. Toggles/chips on a presented world are **revisions** of the live session (reslice or
  re-fetch per the lens law), never new sessions. Same engine, same choreography contract.
- B5. Search-this-area is a toggle-class revision (owner decree), not a special flow.

## C. Origin & dismissal — the return-to-origin law

- C1. **Every mouth captures its origin at trigger time**: the exact anchor the user left —
  page + params + detent/snap + scroll position(s) + the specific element (comment id,
  list row, tile) + camera where meaningful. Origin is a value carried by the thing the
  trigger created; capture is source-agnostic (each surface knows how to snapshot itself).
- C2. **Dismissing a search returns to the exact origin.** Home is the degenerate origin,
  not a privileged path. (One ratified exception pending re-confirmation: pollDetail
  dismiss deliberately lands the EXPANDED feed, not the captured docked detent — owner
  call M-3.) There is NO fallthrough-to-home anywhere: an unrecognized state
  is a loud contract violation, never silently "go home."
- C3. The two close affordances have distinct, context-derived meanings:
  - Search-bar X = end the search session → return to the session's origin.
  - Sheet X / back on a sub-mouth (profile over results) = pop one level WITHIN the
    session (world stays presented, pin de-activates, camera restores per the one
    camera-restore owner).
  - Drag-to-bottom on a home-origin world = the map-dominant home landing (docked polls
    resurrect) — a named product intent, still just the home-origin case of C2.
- C4. Dismissal at any depth restores intermediate entries per the ratified guarantee:
  **"scroll near + anchor exact"** (the tapped element scrolled into view + highlighted),
  NOT byte-exact pixels (unachievable on refetched virtualized lists — ratified owner
  decision). Retention of a covered entry's resolved world is an OPTIMIZATION over the
  C5 reconstruct path, evictable under pressure, never a correctness dependency.
  Carve-out (ratified §5.3): transient input chrome — autocomplete overlay, keyboard,
  partial query, handle picker — always closes on push and is NEVER restored; back after
  a search-mode selection does not re-arm search mode.
- C5. Restore is reconstruct-shaped where content is virtualized: stable IDs + skeleton-
  first + anchor-resolves-post-fetch ("scroll near + anchor exact"), never stored indices.
- C6. Dismissal tears the world down COMPLETELY as part of its choreography: map objects
  fade out with the sheet motion; zero stale pins/labels/dots can survive, structurally.
  A dismissal from a non-home origin gets the SAME quality of exit choreography as home
  (motionless teardown is a defect, not a tier).

- C7. **Universal sheet-snap choreography (owner, 2026-07-14):** triggering ANY mouth —
  including direct restaurant-profile opens — moves the sheet to the MIDDLE snap as part
  of the reveal (no-op if already there). The pre-trigger snap is part of the captured
  origin, and dismissal restores the sheet to exactly that snap. One primitive, every
  mouth inherits it. (Nuance to confirm with the owner's eye: whether a collapsed sheet
  rises to middle on trigger, or middle is approached from above only.)

## D. Choreography — one reveal/dismiss contract

- D1. **Reveal**: press-up acknowledges instantly (skeleton/cover per the app-wide scene
  law); when the world is ready, map objects (pins/labels/dots) and sheet cards begin
  their fade **on the same clock tick** (the joint), camera executes its intent (fitAll
  for list/entity-set worlds into the safe region derived from live chrome; focus for
  single-restaurant), sheet lands at its target snap. One canonical fade duration shared
  by every ramp (native constant).
- D2. **Dismiss** is the reverse of the same contract: sheet motion + map fade-out + origin
  restore coordinated by one owner; the fade-out floor gates any world swap underneath.
- D3. **Toggle/revise**: debounced (restarting quiet window), cancelable consequence,
  commit gated on the visual floor (fade-out acked) with a bounded loud fallback;
  content-class revisions swap without skeleton; world-class revisions ride the full
  cover→reveal contract. Camera moves ONLY on session enter/replace or intent-value
  change — never on revise.
- D4. The choreography contract is scene-agnostic: any world-backed page (search results,
  listDetail, restaurantProfile) supplies the same readiness planes (content paint, map
  frame, sheet motion) to the same transition engine that every other page uses (paint-ack,
  chrome-ack, declared skeletons). Search may not be spec-less: it declares skeleton,
  strip, header like every scene.
- D5. Reveal/dismiss/toggle choreography must be instrumentable as a composite (mach-clock
  event log, RED-provable), per the testing methodology.

## E. Navigation & structure

- E1. Navigation is ONE stack of self-describing value entries `{entryId, sceneKey, params,
origin, captured presentation}`; push/pop are the only session verbs; same-key nesting
  legal; pop restores the popped-to entry. (Ratified S-B; the nav-bar law: visible iff
  depth 1.)
- E2. **Exactly one world is live**: that of the nearest world-backed entry at or below
  top-of-stack (ratified §5.3). Plain scenes (userProfile) are transparent to world
  presentation. Pushing a world-backed entry over another retains the covered world's
  snapshot for its pop.
- E3. Docked polls is a presentation MODE of the depth-1 home root, not a stack level.
- E4. Deep links, notifications, share links, and in-app taps are one parse → value → push
  (desire⇄URL bijection; ratified S-E, built).
- E5. Every scene ships the 8-piece foundation contract (metadata, body, skeleton, header,
  origin provider, failure/empty spec, …) — membership is the whole cost of being
  drillable-into.

## F. Hard constraints (platform / precious surfaces)

- F1. The native map render contract is SHIPPED and precious: JS declares frames
  (setRenderFrame + cover state + highlighted keys); native owns the joint fade ramp,
  LOD promotion (LodEngine), collision, and emits the presentation-event stream
  (fade*out_acked / enter_started / enter_settled / exit*\* / toggle_settled). Do not
  redesign the wire; design TO it. LodEngine/render-controller internals are
  out-of-bounds except where a real defect is attributed there.
- F2. The golden home dismissal seam ({polls,search}@collapsed, zero-plane, deadlock-guarded)
  is byte-identity-proven; any redesign must re-prove it.
- F3. Sheet gesture system: one physical sheet, one persistent header host, snap motion as
  a declarative (from,to,kind) descriptor table; two-posture snap law with named writers.
- F4. World data comes from the existing resolvers/endpoints (list worlds identity-fetched,
  bounds-independent; targetUserId keys identity; shareSlug is access material, never
  identity). The lens-law migration (S1–S3) is the data-shape trajectory.
- F5. RED-provable instrumentation and a mouth × action × dismiss automated matrix (perf
  command-bus + acks + state reads) are part of the deliverable, not an afterthought.
- F6. Solo-dev, pre-launch: no migration-compatibility burden beyond "the app works at each
  landed cut"; code volume/diff size are not constraints (engineering philosophy governs).

## H. Performance — a design input, not a patch target (owner, 2026-07-14)

- H1. **60 fps on BOTH the UI and JS threads through every transition and flow** — reveal,
  dismiss, toggle, sub-mouth push/pop — including REPEATED back-to-back cycles (the
  historically worst case). This is an invariant the architecture must make natural, not
  a number to chase afterward.
- H2. The abstraction must therefore decide, as part of its contract, WHEN work happens:
  interaction frames carry only acknowledgment (commit-then-slide is law); heavy work
  (world commit fan-out, row prep, frame builds) is scheduled off the motion window or
  fenced behind motion-readiness; caches/warm state make repeat cycles cheaper, not
  dirtier. Any design where correctness requires work inside a gesture/animation frame
  is wrong by construction.
- H3. Frame-rate is harness-asserted: the mouth × action matrix runs with the frame/JS
  samplers and fails RED on sustained drops, with a human-blessed baseline per flow.

## I. Transition arbitration (red-team round 1, 2026-07-14 — the ledger's v1 gap: overlapping

## lifecycle operations need rules, not implementations)

- I-1. **New top-level mouth during a live session**: the design must state one rule for
  what a fresh mouth does to a presented session (replace the session entry in place vs
  push a second session) and what the new session's origin becomes. (Owner call J-1.)
- I-2. **Trigger mid-reveal**: newest desire wins choreography too — a second trigger
  during an unsettled reveal supersedes it cleanly; origin capture NEVER snapshots a
  mid-transition state (the superseding trigger inherits the FIRST trigger's captured
  origin when it replaces, or captures the settled pre-trigger state when it pushes).
- I-3. **Dismiss cancels everything**: dismissal aborts in-flight resolution, pending
  debounced revisions, and queued toggle consequences; a resolution landing after
  dismissal may cache but may not present or touch the map. X during dismiss = no-op
  (idempotent). User sheet gestures always win over programmatic snaps.
- I-4. **Nesting**: sessions may nest (a mouth fired from inside a pushed profile pushes a
  new session per E2's world residency); search-bar X ends the NEAREST enclosing session;
  sheet X/back pops one entry. Depth is bounded only by memory policy (H).
- I-5. **Sub-mouth re-targets coalesce**: rapid card/pin re-taps are newest-wins in place;
  re-target is a replace-top of the profile entry (one back returns to the world, never
  through the re-target chain).
- I-6. **Deep link over a presented stack**: parse → value → push onto the live stack
  (origin = current top, dismissal unwinds through it); a link targeting the already-
  presented world identity is a no-op/revise, never a duplicate entry.
- I-7. **Cold-start mouths** (slug/notification with no prior state): origin = the
  app-default home state, minted explicitly as the entry's origin value — the degenerate
  origin as DATA, never a fallthrough branch.
- I-8. **Edit-mode collision**: a search trigger from an edit-mode surface first resolves
  the edit session (commit/abort per its own law); edit state is not part of origin.
- I-9. **Background/foreground mid-choreography**: on return, choreography jumps to its
  settled end state (never resumes mid-ramp); origins need not survive process death.

## J. Camera algebra (ratified in trigger-nav §5.4 + world-camera doc; absent from v1)

- J-1. `CameraIntent = hold | fitAll | focus` — and **hold is the default**: natural
  searches, shortcuts, poll-dish taps, chip reruns never move the map un-asked (STA is
  the recovery lever). fitAll = list/entity-set worlds, EXACT by owner decree (no
  clamping; cross-market continent zoom is a NAMED open owner call). focus = committed
  single-restaurant worlds.
- J-2. Camera executes on session enter/replace or intent-VALUE change only; revisions
  never move it. `hold` on unresolved/failed worlds — failure never moves the camera.
- J-3. Restores: last-write-wins, cancel in-flight motion, epsilon no-op. camera{center,
  zoom} is part of OriginSnapshot. ONE camera-restore owner: popping a profile entry
  fires the same cameraIntent the back-close fires (world beneath restores ITS camera;
  profile-only world restores pre-search camera — one rule, no cases).
- J-4. List LOD promotion keys off crave-rank (stable across sorts), never active sort —
  zero promotion churn on re-sort. Map-mirrors-sort = flaggable knob, default off.
- J-5. Multi-location: one representative location per restaurant competes for the
  promoted slot (anchor rule: closest-to-user-if-inside-viewport-else-closest-to-center);
  in-viewport siblings = dots; selection promotes the whole location group budget-EXEMPT
  (extend, never displace). Representative stability (stable vs nearest-to-user) is an
  owner-reserved product call.
- J-6. Empty world: camera holds (fitAll over zero members is undefined — never attempted);
  the "Search all of {market}" affordance is an explicit user action (an STA with market
  bounds), never automatic camera movement.

## K. Identity & failure amendments (corpus mine)

- K-1. The desire identity sum: text | shortcut | entity | entity-set | **list(listId —
  live identity: mutable membership, slugs, synthetic All)** | seeded. People/lists from
  autocomplete are PUSHES (scenes), never identity arms; the row-kind → action mapping
  lives in EntityLink once. targetUserId keys list identity; shareSlug is access material.
- K-2. Single-restaurant collapse (results sheet hides, profile presents) applies to
  natural/entity worlds only — SUPPRESSED for list worlds (a one-member list stays a
  list). 'restaurant' rides the seeded scene set, never 'search'.
- K-3. Failure asymmetry (owner law, product/search-and-dishes): a failed ENTER closes
  the session via exact pop-to-origin ("how far they got is where they return to"); a
  failed REVISE unwinds nothing (worlds commit on success — old world never left; the
  chip/control state must reconcile to the reverted world). Offline = the finite
  self-completing hang (auto-retry on reconnect), never an error surface. Modal shape:
  ONE button (OK), no auto-retry — reconcile with the §1-built [OK · Retry] modal
  (owner call J-6 below).
- K-4. STA's two honest trigger facts stand as ratified B2 exceptions: searchThisArea/
  forceFreshBounds are trigger-time ACTIONS (bounds capture awaits the settled camera);
  mapMovedSinceSearch resets at capture; press-side chrome teardown (one line) and the
  analytics decoration side-channel stay outside the value.
- K-5. Pick mode (invariant I7) is DEFERRED, not dropped: the design must keep result-tap
  handling a single policy-injectable chokepoint so pick lands later without rework.
- K-6. Nav-TAB invariance: the selected tab never changes while walking the child stack
  (distinct from nav-bar visibility). The sheet system must accommodate the exceptional
  'full' snap kind (past top, no grab handle, returns to prior snap — settings).
- K-7. Docked-polls regression classes are named RED flows: the home landing must be
  canonical even when docked polls were user-swipe-dismissed before the search
  (docked-dismiss-roundtrip.yaml); the resurrect priming is load-bearing product intent.
- K-8. MVCP: re-sortable lanes disable maintainVisibleContentPosition; origin restore is
  the sole scroll writer in its frame.

## L. Performance amendments (perf red team)

- L-1. The task law (round-4 ratified, adopted here): during any transition, every JS task
  is either inside a declared choreography-quiet window or ≤16ms. This is the enforceable
  form of H2.
- L-2. "Cheaper, not dirtier" means IDENTITY STABILITY: warm state is referentially stable
  across cycles (snapshot-equal ⇒ reference-equal); plus an explicit eviction law and a
  retained-world memory budget (C4 retention is evictable per its amended wording).
- L-3. The D1 joint's resolution order (fade × fitAll × sheet motion) is a Phase-1
  deliverable, designed TO the existing native vocabulary — NOTE: no camera-settled
  event exists on the wire today; if a camera readiness plane is needed it must be
  minted (JS-side arbiter completion), not assumed.
- L-4. The zero-plane synchronous home dismiss is part of G1's gold standard; C6's
  choreographed teardown must be reconciled with it (the fade can ride the same window
  without making the route mutation async) and the golden byte-identity re-proof is a
  STANDING gate during every Phase-3 cut, not a final check.
- L-5. H3 baselines bind the environment: release-build (or dev with a known multiplier),
  measured over visible-motion windows; cold TTI and first-reveal latency do not regress.
- L-6. Frame-build cost scales with pin count — the design states a frame-build scaling
  budget or a max-world-size product decision; native ramp behavior under mid-ramp frame
  declarations is a DISCOVERY item against the wire (F1), verified before design freeze.

## N. The press-up & choreography grammar (owner, 2026-07-14 — supersedes D1/D2's sketch

## where more specific; studied against page-switch-redesign.md §2a/2e, the child-transition

## primitive, and toggle-system-ideal.md)

**N-1. Press-up is the universal clock.** Every screen change in the app responds ON
press-up, exactly. "Same clock" means one committed sequence, not literal same-frame:
the ratified commit-then-slide mechanism (heavy commit flushes first, motion follows
raf-sequenced — the ~230-270ms pre-slide hold is an open owner polish item, M-11)
IS the clock's implementation; visible response is still instant. For any search mouth,
press-up simultaneously: (a) swaps the sheet
content to the SKELETON loading state, (b) begins the sheet's repositioning motion
(C7 middle-snap law — up from collapsed, down from expanded, or no motion if already
there; the abstraction handles all origin snaps indifferently), (c) begins the outgoing
map items' fade-out when a world is being replaced, (d) drives the global nav behavior
(nav-bar exit) off the same clock. This is the page-switch law (instant press-up →
skeleton, ratified 2026-07-01) applied to search — search flows are the LONGEST-lived
skeletons in the app (data wait), not an exception to the law. Search results is a real
skeleton PAGE under the shared persistent header (the ratified-but-never-executed
page-switch P5), not a self-frost cover.

**N-2. Reveal joint (sharpened D1).** The cards appear at the INSTANT the pins/labels/
dots BEGIN their fade-in — cards do not fade alongside; they land as the map ramp
starts. One clock tick starts both. Camera intent (J) executes into this window per the
Phase-1 joint-order design (L-3).

**N-3. Dismiss choreography (home-default reference).** On dismiss press-up: map items
begin fade-out AND the sheet begins its downward motion immediately. The sheet CONTENT
freezes (outgoing world's cards stay painted) until the sheet REACHES the designated
snap point, then the content switches at the snap-hit instant. Today's home dismiss
approximates this but switches LATE — the snap-hit trigger mechanism must be redesigned
to fire as close as physically possible to the crossing (owner: non-negotiable; the
mechanism generalizes to ANY snap point, not just bottom).

**N-4. Dismiss content policy is a configurable axis of the primitive.** Two modes,
selectable per flow (for experimentation and per-mouth product tuning):

- `freezeUntilSnap(target)` — N-3's behavior generalized: content holds until the
  sheet crosses the target snap (the captured origin snap), then switches instantly.
- `switchOnPressUp` — content swaps back to the origin's content immediately on
  press-up, while sheet motion + map fade run.
  **Degenerate rule (the key nuance):** freezeUntilSnap when the sheet is ALREADY AT
  the target snap (e.g. triggered at middle, dismissed at middle) collapses to an
  immediate switch on press-up — zero wait, by construction (the freeze is "until the
  sheet is at target," a state condition, not an animation phase). Both modes share the
  same press-up clock for map fade + sheet motion; only the content-swap moment differs.

**N-5. Toggle press-up parity.** The skeleton/cover for a world-class toggle enters ON
press-up, exactly like a reveal (the toggle ideal's optimistic press-up + the
floor-gated commit stay as the consequence machinery underneath). Foundational
correctness now; skeleton VISUAL design is deferred and out of scope.

**N-6. Per-mouth variation lives in DATA, not code paths.** The choreography engine is
one; a mouth/flow contributes only its parameters: origin snap, target snap, dismiss
content policy, camera intent, skeleton spec. If a mouth needs a bespoke choreography
code path, the abstraction has failed (B2's law extended to choreography).

## O. Choreography grammar — round-2 corpus amendments (2026-07-14; all ratified/shipped

## laws mined from the transition corpus, verified against source docs)

- O-1. **Complete-bundle freeze**: the frozen outgoing content (N-3) is an indivisible
  bundle — header + toggle strip + body + cover; no header-only/strip-only/body-only
  frame ever paints; boundaries swap complete bundles only. The dismiss press-up also
  clears the visible search-bar TEXT immediately while the frozen bundle stays painted.
- O-2. **Snap-crossing trigger shape (ratified)**: the boundary handoff arms within a
  small visual-frame tolerance BEFORE the numeric snap Y — the rendered frame AT the
  snap already shows the new bundle; never switches during mid-travel. This is the
  answer shape for N-3's late-switch redesign.
- O-3. **Nav is a follower projection**: nav translate + frost + cutout + sheet-exclusion
  move as ONE object whose progress DERIVES from sheet Y/snap progress (translate-only,
  constant opacity); the nav never appears/disappears/reappears within one transaction;
  identical motion signature regardless of origin tab.
- O-4. **Gesture reversal of an in-flight dismiss**: re-expanding before the boundary
  CANCELS the pending dismiss — world stays presented, teardown aborted; any in-flight
  transition is grabbable (gesture seizes live values + velocity and re-targets).
- O-5. **One chrome commit + joined reveal (child-transition law)**: press-up = ONE React
  commit for header title + strip + nav-out + plus/X rotation (chrome LEADS
  deliberately; rotation: cw on push, ccw on dismiss, 220ms); body reveal joins
  {paint-ack, chromeAck} so content can never lead chrome; a skeleton counts as painted
  content (honest ack).
- O-6. **Under-cover settle precedes the joint**: LOD promotion + label placement settle
  UNDER the cover before the fade-in begins; placement may gate the START of the ramp
  but nothing re-places mid-ramp; the LodEngine is frozen during the fade.
- O-7. **One fade discipline for reveal/dismiss/toggle (shipped sync contract)**: one
  scalar, one clock; pin (CA overlay) + dot/label (GL) written the same tick; GL
  opacity-transitions pinned to 0ms; placement out of the fade path.
- O-8. **Toggle fade laws (owner-confirmed 2026-06-29)**: strip flips instantly on
  press-up; cover slides UNDER the strip, never over; map items fade out immediately
  (no data wait); rapid-tap stays faded out, last tap wins, one fade-in; the settled
  event fires unconditionally (empty→empty still lifts the cover); a selected
  restaurant filtered out closes its callout inside the same transition; camera-move
  mid-toggle finishes the fade against the live camera.
- O-9. **The sheet is the sole physical motion source**: no search-owned writer may
  command sheetTranslateY, force a boundary Y, or define its own apparent sheet timing
  (rejected-architecture class, by name).
- O-10. **Engine canon (supersession record)**: the motion-plane/handoff-policy model is
  THE spine; the four-lane descriptor + inverse() dismiss engine is SUPERSEDED — do not
  resurrect it. Child/preserveLiveY dismisses resolving to ZERO planes with a
  synchronous idle commit is DECIDED-GOOD generally (not just golden home; extends L-4).
- O-11. **Reveal-side content-handoff vocabulary**: swapImmediately (seeded scenes, no
  content plane) vs preserveOutgoingUntilSettle (crossfade; plane arms iff a crossfade
  runs); readiness gates only when incoming content becomes visible inside the
  already-moving opaque sheet — never the sheet/map motion itself.
- O-12. **Warm-hit rule**: when the world is already resolved (cache hit), an immediate
  content switch is PREFERRED over a skeleton flash (ratified page-switch §2a) — but
  the commit still takes the uniform async hop off the press-up task (the 656ms
  same-tick mega-stall class). N-1(a)'s skeleton is for the unresolved case.
- O-13. **Never-see-through invariant**: sheet surface alpha is constant 1.0; content
  crossfades happen over an opaque backing; the map shows only where sheet geometry
  doesn't cover, never through it.
- O-14. **Search-mode (suggestion surface) choreography**: bar + shortcut chips fade as
  the blur + suggestion overlay fades in — one shared progress driver,
  keyboard-duration-matched, symmetric on exit; submit rides the SAME driver with the
  overlay held at full height until progress completes, results sheet already visible
  in loading beneath (no slide-in). (Verify current code matches; ratified target.)
- O-15. **C7 × the two-posture seat law**: the programmatic move-to-middle must NOT
  write posture seats (user-gesture settles, the origin-restore seam, and named intents
  are the only writers — RED-asserted); C7's dismissal restore rides the named
  origin-restore writer.

## P. Owner feel-check round 1 additions (2026-07-15, post-freeze-primitive)

- P-1. **Toggle-strip cutout plate is part of the chrome commit** (extends O-5): the white
  cutout strip must be computed-before-reveal and land in the same committed frame as the
  header/body — never snap in after the cards. One primitive, applied to EVERY strip
  surface (the "buttons floating over frost" glitch class dies).
- P-2. Reveal skeleton continuity: no gap between header bottom and skeleton top; the
  skeleton may not visibly reconfigure mid-reveal (one declared skeleton per scene, O-5's
  one-commit law covers its plate too).
- P-3. Late-popping content (collaborator row, usernames) joins the reveal — content
  that isn't ready rides the skeleton, never pops after the joint (N-1/O-5).
- P-4. Map items must never snap in after cards on ANY mouth (N-2 joint enforcement is
  per-mouth-verified in the harness trace, not assumed).
- P-5. ATTRIBUTION ITEM: images look washed out for a frame at reveal, clearing on
  settle (suspect fade-over-white compositing) — attribute before fixing.

## P (round 2, 2026-07-15 owner feel-check — new RED targets for the plan engine)

- P-6. List open: NO double motion ever — one sheet movement per transition (observed:
  slides down, snaps to TOP as the new sheet, slides down again). One clock, one motion.
- P-7. Shadow/mask must track the sheet edge exactly during motion (observed lagging).
- P-8. White cover must not outlive the reveal (observed lingering over strip cutouts on
  a repeat list search, making cutouts read as white).
- P-9. ADOPT-pop camera: dismissing an adopted profile restores the WORLD's camera
  (zoom back out to the list viewport) via the one camera-restore owner (J-3) — the
  warm-open path currently skips the restore wiring.
- P-10. Root-page switches obey the press-up content law too (observed: polls sheet
  slides up AS polls before switching to the list page — content must commit on
  press-up, motion carries the committed content).
- P-12. Submit press-up STALL (owner, 2026-07-15 round 3): the nav-out fade + shortcut
  buttons SNAP instead of fading at search submit — a JS frame drop in the press-up
  window (L-1 task-law violation; measure with the harness samplers; suspect
  world-commit/fan-out work inside the press-up task on the shortcut path).
- P-13. The reveal cover lift must JOIN the ramp (owner round 3): skeleton lifted at
  ~ramp start but cards weren't ready → blank frost body until cards popped in at
  ramp-halfway. The T4 joint gates cover-lift AND card visibility on the same
  ramp-start edge — a lifted cover with no content is a forbidden frame (extends O-1).
- P-14. FOUR-OWNERS FACT (the T1d/T2/T4 conversion map, recorded): every visible sheet
  is composed by (1) the persistent header host [PF-driven, swaps at press-up], (2) the
  leg lanes [txn-gated since T1c], (3) the search surface bundle [boundary-driven], and
  (4) the native ramp/cover [own clock]. The owner-visible dismiss bugs (early chrome
  flip, partial-bundle frames, bottom double-flip) are owners 1+3 disagreeing with 2;
  the reveal bugs are owner 4 disagreeing with everyone. One txn gates all four.
- P-11. Home dismiss regression note (for the record): the freeze-primitive wiring into
  the OLD motion plane was reverted 2026-07-15 after two owner-caught regressions —
  the snap-crossing swap ships ONLY inside the transition-transaction engine (§Q).

## Q. THE ROOT SMELL (recorded 2026-07-15; the rip-out-and-redo verdict)

Why transitions keep failing here — six compounding structural facts, named so the
redo can be judged against them:

- Q-1. **No reified transition.** "A transition" exists only as a correlation of side
  effects across ~6 authorities (route reducer, PF flush, scene-stack legs, lane-player
  gates, sheet snap runtime, search surface transactions, motion planes, native
  transport). Nothing anywhere IS the transition — so lifecycle facts (when to swap,
  when to reset a gate, what supersedes what) have no home. The stale-boundaryGate bug
  was not a bug; it was this fact expressing itself.
- Q-2. **Search's parallel universe.** Search's transaction family (redraw/dismiss
  transactions, cover-state transport, surface phases) predates the generic engine and
  is BRIDGED to it by correlation ids and threading, not unified. Every non-home mouth
  falls between the two systems — hence "not riding the abstraction at all."
- Q-3. **Clock proliferation.** paintAck, chromeAck, settleRamp, boundary marks,
  poll-page readiness, native acks, snap settles — each a pairwise sync added to fix
  one desync; none compose; the readiness JOIN exists only for the home reveal.
- Q-4. **Golden paths as exceptions.** The zero-plane home dismiss is byte-guarded as a
  special case rather than the degenerate output of a general engine — so any general
  mechanism breaks on it (it skips the general lifecycle entirely).
- Q-5. **Keyless singleton state.** Surface runtime / mounted results / floor signal are
  module globals; a transition cannot be per-instance because its state is global.
- Q-6. **Choreography as implicit time.** Ordering lives in effect sequencing
  (batchedUpdates blocks, raf chains, microtask re-checks) instead of declared plans —
  correctness by coincidence of scheduling.

THE VERDICT: no further mechanism may be wired into these structures. The redo = ONE
reified TransitionTransaction per stack mutation — sole owner of plan, phase, gates
(swap/boundary/join), sheet target, content policy, map transition, camera intent —
with every consumer reading IT, search's transaction family dissolving into it, and
gate-reset-by-construction (a new transaction is a new object; stale gates become
unrepresentable). The golden home dismiss must fall out as the degenerate plan, not
survive as an exception.

## M. Owner decisions required before/during Phase 1

- M-1. New-mouth-during-live-session: replace the session vs push a second (I-1) — and
  which the origin chain follows.
- M-2. C7 nuance: does a collapsed sheet RISE to middle on trigger, and does a FULL sheet
  drop? Sub-mouth (profile push) also forces middle or preserves?
- M-3. pollDetail dismiss: expanded feed (current deliberate behavior) vs pure captured-
  origin restore — the two-pop-class question (child pops = product-chosen detent).
- M-4. Cross-market fitAll: exact continent zoom stays, or a named alternative.
- M-5. Multi-location representative: stable rep vs nearest-to-user.
- M-6. Failure modal shape: OK-only (product doc law) vs [OK · Retry] (§1 as built) — one
  law must win. (Ties into the banner=offline-only redesign already recorded.)
- M-7. Search-results full unification (lens-law D2 stage S4): ratify the staged "yes."
- M-8. Toggle STA quiet-window feel (300ms settleMs) — per-kind override is the knob.
- M-9. Per-mouth dismiss content policy defaults (N-4): which flows freeze-until-snap
  vs switch-on-press-up — expected to be settled by eye during Phase 3, but the
  home-default (freeze to bottom) is presumed kept.
- M-10. Nav-bar exit timing on search press-up (N-1d): confirm the nav behavior is
  truly global (one derivation) — flagged "should be global, but we should check."
  (O-3's follower-projection law is the ratified shape to confirm against.)
- M-11. The pre-slide hold diet (~230-270ms commit-then-slide hold) — how short can it
  get; owner feel item carried from round 4.

## G. Feel oracles (owner-verified, must not regress)

- G1. Home reveal+dismiss loop is the current gold standard (commit-then-slide press-up,
  joint fade) — every mouth must reach this bar, and home must not lose it.
- G2. Press-up response is instant; skeletons never flash-swap; no chrome from the old page
  ever paints over the new one.
- G3. The eye is the oracle for feel; instruments gate regression only.
