# THE TRANSITION END-STATE CONTRACT

2026-08-03. Phase 0 of the final transition plan. This document is the CONTRACT
every rung answers to — built under the post-archaeology regime, because the
archaeology proved how five ratified standards died: rungs were staffed by
symptoms, rewrites re-derived scope from code instead of the previous ledger,
"restored X" commits restored artifacts without wiring, and nothing barked.

## THE REGIME (process law, binding on this plan)

1. Every requirement row carries a FALSIFIER — the RED-able check (grep
   invariant, dev bark, or jest) that screams if the row is dropped. A rung is
   not done until its falsifier lands IN THE SAME COMMIT.
2. Deferral is legal only when the receiving rung is appended to this file's
   rung list in the same commit. A parenthesis is not a schedule.
3. Any commit that deletes a structure must grep this file for rows keyed on
   it and re-home them in the same commit.
4. The plan itself is red-teamed before implementation; the result is
   red-teamed after; the owner's thumb is the final gate.

## PART 1 — THE UNIFORM MODEL (the owner's thesis, adopted)

ONE transition operation for ANY pair of pages, in ANY direction, at ANY
nesting depth. Every difference between transitions is POLICY DATA consumed by
that one operation — never a second mechanism.

- **The unit is the ENTRY, not the scene kind.** Scroll memory, residency,
  and state key on stack entry identity (`sceneKey#entryId`). Two stacked DM
  threads are two entries. This is the ONE new abstraction this plan adds.
- **The operation** (exists today, proven): swap data on the one track +
  refuse() carries posture and restores the incoming entry's scroll + chrome
  opacity-flips in the same commit. Single painted frame when warm.
- **Readiness is an axis, not a branch order.** Every entry exposes
  isReady; a not-ready entry presents THE skeleton (foundation-spec shape) in
  the flip commit; content is the entry's own next state. (The dead branch in
  resolveLegList becomes reachable by condition, not by luck.)
- **Seats are table rows** (already true): snapTo / promoteAtLeast /
  preserveLiveY / rememberedDetent+fallback / hidden — data, not code paths.
- **Triggers are the only choreographic variable.** Press-up for everything
  except dismiss-to-map, whose swap fires at the τ-crossing of the bottom
  boundary (user-paced, no watchdog). Same operation, different trigger time.

## PART 2 — THE CLASSIFICATION of every old mechanism

From the reconstructed old-system spec (child/dismiss/nested; see git history
of this file's companion agent reports for full file:line citations).

### SUBSUMED BY ATOMICITY (do not port; falsifier proves absence of need)

- Freeze-mode dismissal chrome (existed because chrome could lead a slow
  reveal; our swaps are single-frame — nothing to freeze).
- Held-dissolve / four-lane content player / liveSwapRoles (superseded by the
  atomic data swap).
- Paint-ack joined reveal for warm entries (the commit IS the join).
- H5 strip-gap measured-height cache (persistent strips + computed geometry).

### BECOMES POLICY DATA (rows in existing tables; no new mechanism)

- Child seats: pollCreation instant-cover expanded; detail children spring
  expanded; settings expanded + grabHandle hidden; restaurant promoteAtLeast
  middle; listDetail ABSOLUTE middle (deliberately demotes an expanded sheet —
  the map must show).
- Dismiss seats: pollDetail rememberedDetent→middle; listDetail/settings
  rememberedDetent→expanded; all other children preserveLiveY.
- Seat mode ('instant' vs spring) — one field the seat socket must honor.
- Depth-K body eviction (K=3) — the residency memory knob.
- Docked-polls resurrect posture.

### REAL GAPS (the work; each gets a falsifier in Part 3)

- G-ENTRY: entry-keyed identity (mounts, scroll memory, residency) — the
  abstraction change. Old W1 semantics: pop reveals the buried entry
  byte-exact; params from the entry value; outgoing retention through settle.
- G-READY: the readiness axis + skeleton-by-condition + two-phase cold flip.
- G-SKEL: skeleton material from the foundation spec (rowType per scene,
  strip-in-skeleton pills — the SKELETON-STRIP LAW on the track).
- G-HIDDEN: 'hidden' as a reachable seat (the sheet can leave the screen);
  onHidden lifecycle; dismiss-to-map swap-at-boundary trigger; docked
  resurrect.
- G-PREWARM: idle prewarm (warm-before-navigate law, machinery exists on the
  dead path; bark must fire on the live one).
- G-ACTIVITY: body activity derived from (presented, posture) — no all-true.
- G-LIVENESS: the visibility bit gets a writer on the track path.
- G-RESTORE: dismiss-return scroll restore folds into entry-keyed scroll
  memory (falls out of G-ENTRY; verify the staged-restore cases: offset-0
  valid, segment-before-scroll on profile).
- G-RETAP: re-tap semantics — OWNER MUST RECONCILE two ratified behaviors
  (extend-only promote vs scroll-to-top; see Part 5).
- G-SIGNALS: drag/settle/momentum fan-out to map/search riders.
- G-KEYS: per-scene keyboard policy on the one track.
- G-TOUCHGATE: input freeze during choreography (or a verdict that atomicity
  subsumes it — decide in derivation, with evidence).
- G-DIVIDER: static-scroll bodies (dmSession) publish divider offsets.
- G-EXTRAS: header Extras slot in track chrome.
- G-NAVCURVE: nav silhouette curve on the track (last recorded state:
  missing — re-verify first).
- G-REDS: the dev RED contracts ported (chrome-geometry bark, descriptor
  barks) — the falsifier infrastructure itself.

## PART 3 — FALSIFIERS (samples; every G-row gets one before its rung starts)

- G-READY: dev bark — "cold first visit painted rows before a skeleton
  frame" (the warm-before-navigate analogue). grep-invariant: the skeleton
  branch has a reachable condition (a test renders a not-ready entry and
  asserts SceneLoadingSurface).
- G-SKEL: jest — render the skeleton for every SCENE_FOUNDATION_SPECS key,
  assert the spec's rowType and strip pills where declared.
- G-ENTRY: jest — push A, push B (same scene), pop; assert A's state object
  identity survived. grep-invariant: no scene-keyed scroll-memory writes.
- G-HIDDEN: sim acceptance — dismiss-to-map reaches hidden, onHidden fires,
  boundary swap lands in the τ-crossing frame.
- G-LIVENESS: grep-invariant — setVisibleResidentScene (or successor) has
  ≥1 caller on the flip-on path.
- G-ACTIVITY: jest — a collapsed/hidden entry's body reports inactive.
- G-PREWARM: the existing "warm-before-navigate violated" bark rewired to the
  live path; RED-proven once by forcing a mid-transition compile.
- Rung-5 deletes: grep-invariants — zero held-dissolve hits, zero flip forks,
  one skeleton material (already specced in the residents plan, never run).

## PART 4 — PHASES

- P1 DERIVATION: the uniform model written against the code; red team vs code
  AND old code (the proven pattern). Output: amendments to Parts 1-2.
- P2 RUNGS (cut from Part 2/3, NOT from symptoms; falsifier-in-same-commit):
  R1 G-ENTRY + G-RESTORE. R2 G-READY + G-SKEL (+ two-phase flip).
  R3 G-PREWARM. R4 G-HIDDEN (dismiss family). R5 G-ACTIVITY + G-LIVENESS.
  R6 remaining G-rows by owner priority. R7 search/results (deliberately
  last). R8 the old-system delete pass + full grep-invariant suite +
  acceptance walk (gated on owner burn-in).
- P3 END RED TEAM + owner thumb.

## PART 5 — OWNER RATIFICATIONS OWED

1. Re-tap semantics: extend-only promote (root-snap-law leg 5, built) vs
   animated scroll-to-top (residents E2, ratified later). Pick one.
2. Slow-network law (progressive above-fold vs shimmer-timeout→error).
3. Result-list dish tap destination (profile vs results) — open since the
   transition-engine plan.

---

## PHASE 1 AMENDMENTS (2026-08-03, binding — supersede the sections they name)

The plan red team returned ten findings; the model survives for press-
triggered switches and falls in two places. Amendments:

**A1 (supersedes Part 1 "triggers are the only variable") — THE HIDDEN
EXCURSION IS A SECOND MOTION PRIMITIVE.** τ is contentOffset; collapsed is
τ=0 and a UIScrollView cannot REST below 0 — "the sheet leaves the screen"
is not expressible as a τ excursion on the one track. G-HIDDEN therefore
requires a DECLARED second primitive: either (a) native τ-domain extension
below collapsed (physics change; the legitimacy filter audits only the MAX
edge today and must learn the MIN edge), or (b) a container translation with
a specified mid-gesture handoff point from scroll physics. The derivation
picks (a) or (b) with evidence; Part 1's sentence is amended to: "press-up
triggers every switch; the hidden excursion is the ONE declared second
primitive."

**A2 (supersedes the SUBSUMED verdict on freeze-chrome) — DEFERRED SWAP IS
REAL FOR THE DISMISS FAMILY.** The dismiss slide is user-paced and multi-
frame; the outgoing entry AND its chrome must ride it fully opaque, and the
swap fires when the sheet crosses the SCREEN EDGE (not the collapsed
detent — swapping at τ=0 flips chrome while the band is still visible).
Freeze-mode moves from SUBSUMED to G-HIDDEN's scope, including deleting the
track host's freezeUntilSnap seal-bypass guard when the new path lands
(Regime rule 3). Falsifier: assert outgoing chrome present during the slide.
SUBSUMED remains correct for every press-triggered swap.

**A3 (expands G-ENTRY) — ENTRY IDENTITY REACHES REACT ELEMENT IDENTITY.**
The track has ONE component instance per scene; two stacked DM threads
would share composer draft and hook state, and pop-back is not byte-exact.
G-ENTRY's scope now enumerates every scene-keyed store that becomes entry-
keyed: leg identity/keyExtractor, mounted-body React key (per-entry
instances with depth-K retention, reconciled with the hide-never-unmount
Fabric constraint), scroll memory, strip/title/chrome caches, and scene-
keyed publications (dmSession header-offset). The jest falsifier runs
against the TRACK page.

**A4 (falsifier repairs).** G-LIVENESS's grep is vacuous (the old host
calls the writer on a dead path): replace with runtime — after a flip-on
switch, the residency manager's visible scene equals the presented scene.
G-RESTORE loses "falls out of G-ENTRY": own falsifiers — remembered
offset-0 is honored (the ?? 0 default currently makes no-memory and
remembered-0 indistinguishable), restore applies after leg attach, profile
segment-before-scroll ordering.

**A5 (new row) G-INTERRUPT.** Switch during in-flight spring; switch during
active drag (seat dies + settleToken rides the 700ms deadline today);
promoteAtLeast resolves against the SPRING TARGET, not instantaneous
posture (±2pt mid-flight reads misclassify). G-TOUCHGATE becomes a sub-
case, and on a user-paced dismiss the drag IS the choreography — the gate
protects press-triggered flights only. Falsifier: jest on
resolveCurrentSnapTarget mid-flight.

**A6 (new row) G-MODAL.** price/scoreInfo (motion 'none') are overlay-
presented, NOT track content: the track's presented entry must not change.
Falsifier asserts exactly that.

**A7 (rung order).** G-ACTIVITY moves into R2: "cold" is defined by
activity, and the two-phase flip must not mount content whose data lanes
fire eagerly. Its falsifier extends to NON-PRESENTED resident legs (the
case today's all-true gets wrong). R1's per-entry retention multiplies
all-true's cost — R1 lands with a bark budget if activity is not yet in.

**A8 (new rows, per Regime rule 2 — scheduled, not parenthesized):**
G-ROTATE (snap points derive from a startup seed; dimension changes must
recompute), G-APPSTATE (settle deadlines/tokens across suspend), G-DEEPLINK
(cold deep link builds the stack — parent entry under child — and the cold-
child two-phase flip), G-A11Y (a data swap on one persistent list emits no
screen-reader navigation event; announce + move focus on switch). All
placed in R6 unless the derivation promotes them.

**A9 (G-KEYS extension).** The keyboard-aware chin renders outside the mask
for the presented scene only; the row specifies chin behavior DURING a
transition (flips with the presented entry, same commit).

**What the red team confirmed intact:** swap+refuse+opacity-flip atomicity
for press-triggered warm switches; seats-as-data (including instant mode,
promoteAtLeast, rememberedDetent, preserveLiveY catch-all); entry identity
as THE abstraction change; pollCreation-as-form is not a counterexample.

## OWNER AMENDMENTS (2026-08-03, ratified in conversation)

**OA1 — THE WORLD JOIN is a FAMILY, and listDetail is in it.** The owner:
"the same sort of search flow happens when the list details gets pulled up —
choreography between the map items having to be ready and the cards having
to be ready, and then they get revealed at the exact same time; both still
use the skeleton sheet as a loading state." The world-join family =
{search/results, listDetail} (extensible by data): reveal joins {map items
ready, cards ready}, skeleton sheet is the loading state throughout, and
the join is the ONE choreography beyond the uniform switch that a scene may
declare. listDetail's Part-2 row gains `worldJoin: true` alongside its
absolute-middle seat. Falsifier: a world-join scene revealing cards before
map items (or vice versa) is a RED violation.

**OA2 — SKELETON VARIANTS ARE DATA (confirms G-SKEL).** One skeleton sheet
includes the toggle strip, one does not — per-scene shape from the
foundation spec (rowType + strip-in-skeleton pills), never a second
material. Already G-SKEL's scope; recorded here as owner-ratified.

**OA3 — THE PER-RUNG HYGIENE LAW.** Every rung ends with two obligations in
its final commit: (1) its own kill-list — dead branches, unused fallbacks,
superseded attempts created OR revealed by the rung — deleted, not deferred
to R8 (R8 remains for the old-SYSTEM delete only); (2) a re-derivation
checkpoint — one paragraph in this file stating whether the rung's
implementation changed the believed ideal shape, and amending Parts 1-2 if
so. "We question everything as we go, rederiving the ideal end state and
abstractions while implementing" — owner directive, now regime rule 5.

**OA4 — pollCreation's instant mode: owner to reaffirm or retire** (added
to Part 5 ratifications; the field ships either way, the default is the
question).

## OWNER AMENDMENTS — round 2 (2026-08-03, ratifications answered)

**OA5 — INSTANT MODE IS DEAD (Part 5 ratification answered).** "I don't ever want a
sheet to just instantly appear where it should be. Every sheet needs to glide between
transitions. That is the canonical movement pattern and the only one really." The
`mode: 'instant'` field is DELETED, not kept as data — the glide is universal.
pollCreation springs to expanded like every other child. Executed same-turn: descriptor
row + spec oracle updated. Kill-list obligation: the `mode?: 'spring'|'instant'`
plumbing in the motion command types dies with the old system (R8) or earlier if a rung
touches it. Falsifier: any code path that sets a sheet's position without an animated
glide (outside the hidden excursion's declared primitive) is RED.

**OA6 — THE SEARCH FLOW IS SOURCE-AGNOSTIC (scope expansion for R7 + world join).**
Owner enumeration of search-flow entry points, all of which must share ONE choreography
(map items ready + cards ready → revealed simultaneously; skeleton sheet as the loading
state throughout):

- query search (search page)
- listDetail from the LISTS page
- listDetail from the user's PROFILE page (shared lists)
- curated list from the HOME page (may not be implemented yet — home is new)
- poll-detail discussion comment text-highlight spans: tapping a DISH span triggers the
  query search flow; tapping a RESTAURANT span triggers the restaurant search flow.
  Owner: this machinery "may be broken given we haven't looked at it in a while" — R7
  begins with a dedicated research/rederivation pass over the old search-flow plans
  (intent, choreography bar, 60fps hard requirement) before any code change, and the
  rederived ideal shape is appended to this contract before R7 implementation.

**OA7 — EXECUTION MODE.** Owner directive: run the whole ladder end-to-end under
parent-managed subagents; parent reviews code between rungs and re-derives continuously;
owner-gated decisions are surfaced as FYIs but never pause development; 60fps during
every transition is a HARD requirement; red team + test at the end.

**OA6.1 — SKELETON vs FROZEN WORLD (parent ruling, FYI to owner).** Research surfaced a
tension: OA1 "skeleton sheet as the loading state throughout" vs the ratified O-1
frozen-old-world-under-cover behavior for in-session revises. Resolution: these compose.
The skeleton is the loading state ONLY when no prior world exists (cold entry into a
search flow); an in-session revise keeps the frozen old world visible until the new
world's join completes — content is never replaced by a skeleton when content exists.
Falsifiers: cold entry shows skeleton (correct variant per OA2); revise never shows a
skeleton frame. Owner may override; development does not pause on this per OA7.
See plans/search-flow-rederivation.md for the full R7 gap list.

## R1 RE-DERIVATION CHECKPOINT (parent-reviewed, landed)

Entry identity landed as `sceneKey#entryId` derived from the route stack's existing
per-push `entryId` (one identity authority — no parallel counter). Two contract
sharpenings absorbed: (1) "the unit is the ENTRY" now reads "a top-level tab is ONE
entry forever" — residents pin to `scene#root` because stack entries re-mint across tab
revisits and raw ids would fork tab scroll memory; (2) the scene-input publication lane
remains scene-keyed (outside this rung's surface); on the track it is constrained to
presented-entry-only reads. If a scene ever publishes ONLY via that lane and needs
hidden retention, the lane must become entry-scoped — assigned to R2/R6 scope review.
Falsifiers proven RED-able (identity collapse → 4 failures; offset-0 collapse → 2).
Kill-list executed: strips prop, scene-keyed stripCacheRef/scroll memory/pendingRestore,
scene-keyed renderMountedBody. Retention K=3 with capacity bark; hidden legs still run
all-true data lanes until G-ACTIVITY (R2).

## R2 RE-DERIVATION CHECKPOINT (G-READY + G-SKEL + G-ACTIVITY + two-phase flip)

Readiness landed as resolution → phase, all pure (track-entry-readiness.ts): each
commit an entry resolves to {none | mounted | list(rowCount)}, and a latching ledger
maps that to a total paint decision {content | skeleton | frozen} — "wait" is
unrepresentable, so the switch commit always paints. TWO contract sharpenings: (1)
"ready" is A CONCRETE BODY EXISTS, not "rows exist" — a published list with zero rows
is the scene SPEAKING (polls' leg-4 bare-white toggle gap, the §6 promise card, every
declared empty face); gating on rows would replace owner-ratified empty states with a
host skeleton. Rows-exist remains a separate fact (resolutionHasRealRows) and is what
the [PERF] cold-flip probe measures (switch-commit → real-rows). (2) OA6.1's frozen
world got a mechanism: a latched entry whose lane resolves to nothing renders its
LAST-GOOD body from an entry-keyed store — which also erases the pop-back skeleton
flash for lane-published children. G-SKEL: the variant rides the existing
resolveSceneLoadingMaterial (rowType + strip-holes law) through one total resolver.
G-ACTIVITY: activity derives from presentation (deriveTrackEntryBodyActivity) — hidden
= attached-but-suspended, activation never revoked; HONESTY NOTE: on today's one-
FlashList page only the presented leg's rows mount, so hidden mounted bodies are
structurally unmounted — A3's "byte-exact pop-back hook state" is narrower in code
than in prose (renderer caches + scroll memory + chrome/strip elements survive; body
hook state does not). Assigned R6: rule whether hidden-mount retention is required or
A3's wording is amended. Item-5 scope review: the scene-input lane stays scene-keyed;
no scene needs entry-SCOPING now, but same-scene pop (pollDetail A→B) can alias A's
still-published rows into B for a commit until the writer republishes — R6 should
entry-STAMP the publication so the host can reject a mismatched entryId. Kill-list
executed: hardcoded restaurant skeleton, all-true activity object, the A7 capacity
bark (premise deleted), R1's leftover unused vars (host + OneTrackPrototype).

## R4 RE-DERIVATION CHECKPOINT (G-HIDDEN — the hidden family)

A1 is ANSWERED: the second primitive is (a) τ-DOMAIN EXTENSION, and the re-derivation
sharpened WHY — every derivation in the system (sheetTop = expandedTop + (H+σ−τ),
frost/tail/pin/masks, native shell writer) is ALREADY linear below collapsed; only
UIScrollView's domain floor (offset ≥ −contentInset.top) blocked the excursion.
Extending the domain (contentInset.top = depth for the excursion's lifetime, collapsed
at rest back on-screen) keeps ONE variable, ONE writer, the SAME critically damped
spring (OA5's glide is structural — the plan type has no teleport variant), THE FINGER
OWNS TAU intact (a touch mid-excursion kills the spring and drags the same track), and
σ cancels by algebra (snapTo target −depth+σ still lands sheetTop exactly at the
screen edge). A container translate would have been a second position writer over the
track — rejected. The legitimacy filter learned the MIN edge (mirrored clamp
signature, native). A2 landed as declared: the screen-edge fact is native
(trackHiddenEdgeCleared, τ ≤ target+0.5); the paint decision is pure
(resolveHiddenPresentation) and the txn 'boundary' input is offered at that edge — the
freeze plan's join has a live producer on the track path, and the hide's settleToken
completes there too (no detent settle exists for a hidden rest). ONE contract
sharpening: THE HIDDEN DOMAIN NEVER WRITES MEMORY — a switch committing at τ<0 has no
live scroll term, so the outgoing entry's offset is snapshotted at hide START
(saveScrollForPresentedEntry) and planEntrySwitch suppresses hidden-domain saves; hide
composes with R1/R2 by construction (latch + memory untouched, falsified in
track-entry-hidden.spec.ts). The ack-bridge freezeUntilSnap branch is NOT deleted: it
is now the hidden family's ROUTING (amending a freeze txn to {paint, chrome} would
clobber the boundary join it protects); it dies only with the freezeUntilSnap plan
kind itself (R8, old-system delete). Open: a finger catching the sheet mid-excursion
and dragging it back on-screen leaves the freeze txn joining until superseded — same
watchdog behavior as the old system; revisit if burn-in shows it.

## R3/R5/R6 RE-DERIVATION CHECKPOINTS (parent-reviewed, landed)

R3 G-PREWARM: press-down prewarm mounts a cold resident leg during the finger-down
window (pure planScenePrewarm; no per-scene cases); "warm" is STRUCTURAL, not a data
promise — the honest bark is the existing cold-commit PERF probe. Child-push prewarm
has no pre-commit window (entry identity does not exist earlier) — out by construction.
R5 G-LIVENESS: A4's check sharpened to "delivered activity equals derived-from-
presentation activity, judged per commit at the delivery point" — samples are the
DELIVERED values, seq-tagged; re-derivation would be always-green. Row satisfied.
R6: (1) G-INTERRUPT companion clause — a hidden excursion records NO snap-target for
policy reads (its target is not a detent); (2) the scene-input lane stays scene-keyed
with per-entry STAMPS (opt-in per writer); full entry-scoping only if a scene ever
needs hidden retention through the lane (none does). Mid-excursion freeze-txn catch
re-deferred to R8/burn-in (navigation-runtime surface, watchdog parity). G-RETAP
extend-only is live; the scroll-to-top alternative remains an owner ratification with
ONE call site (NavSilhouetteHost.tsx extendActiveRootFromNavReTap). Report-only gaps
recorded: G-ROTATE (module-scope Dimensions), G-APPSTATE (wall-clock timers),
G-A11Y (no announce), G-DIVIDER (registry lacks subscribe semantics — fix belongs
with sceneScrollStateRegistry), G-MODAL falsifier → R8 grep suite.

## R7 RE-DERIVATION CHECKPOINT (parent-reviewed, landed)

(1) OA1's falsifier is FACTS-AT-REVEAL, not plan-shape: the RED audits residency
({rowsResident, mapFrameClean}) at the revealed edge, so a plan that silently dropped
mapFrame still trips it; a liveness-degrade forced reveal is deliberately RED.
(2) worldJoin membership is two-layered: the SCENE declares family membership (a
required literal on every foundation-spec row; search by construction), the ENTRY
carries participation (worldBacked + stamped desire); admission is keyed to the
active entry — G-ENTRY stacking of listDetail can no longer alias holds.
(3) D2 fence CLOSED: motion-pending flips on proven facts (willMove, native drag
begin, hidden excursion) and restores on every rest fact (settle observer, edge
event, 700ms backstop) — the honest wiring the old deferral demanded. D6 stays
declare-sheet-always + at-rest self-offer (conditional declaration would race the
post-txn reveal snap). OA6 correction: home curated lists ARE implemented (verified
E4); all five mouths arm the SAME join (parity table in the R7 report).

## END-TO-END RED TEAM (2026-08-04) — verdict + burn-in watchlist

F1 (HIGH) FIXED same-day (23434ef24): the hidden-domain switch immediately re-fused
through the >= 0 posture clamp — an OA5 teleport; now armed-only with a falsifier.
Watchlist for burn-in (not blocking): F2 a redraw arming mid-flight is born
sheetMotionSettled:true (seed path never asks the host's at-rest fact) — the one
remaining D2-class window; F3 falsifier debt — fence/hidden specs cover the pure
modules, not the host wiring (G-HIDDEN sim acceptance owns the runtime side), and
hasClearedScreenEdge is an unused JS mirror to delete; F4 hygiene — OneTrackPrototype
corpse, unused delete()/forget(), one ungated console.log; F5 owner-eyeball — the
presented 'search' leg resolves through homeParts (docked-feed lane): confirm intended
in every phase. Everything else walked clean: contract conformance, falsifier honesty
on the other suites, no prod per-frame work added (60fps hard requirement holds).
Verdict: burn-in ready.

## DEEP RED TEAM (2026-08-04, round 2) — synthesis, ratified direction

Three independent passes (abstraction critique: plans/redteam-abstractions.md; native
engine; host-wiring harness). Landed same-round: the three native law violations
(b5bf2420d — refuse kills a live spring; the excursion is an event-driven machine with
generation-stamped edges the JS fence validates; snapTo yields to the finger and the
retry loop aborts for good on refusal) and the render lane (1d345c5ef — 18 falsifiers
over the real host/page/physics chain, 17-mutation RED ledger; F3 closed as a class).

RATIFIED POST-BURN-IN LADDER (principled primitives, not patches — each subsumes a
finding class):

1. THE MOTION AUTHORITY: one queryable store over the proven motion facts (willMove,
   drag begin, settle, edge, deadline) with episode ids on every engine emission;
   fence, interrupt reads, liveness probe, and reveal seeds all read it. Subsumes F2
   (redraw born settled mid-flight) and the F5 event-ordering ledger. The fence's pure
   module is already its type signature.
2. THE DOMAIN AUTHORITY: one pure legalRange(contentH, viewport, dragKind,
   excursionState, sigma, boundary) with insets as its only output, invoked from every
   input change; the two clamp filters remain as the single backstop predicate. The
   five tau-guards become instances. Subsumes native F4 (ceiling drift under mid-drag
   content growth) and F7 (keyboard/reachability inset ownership).
3. ONE SCENE-DECLARATION SCHEMA: fold the host's hand-kept sets, body-kind map, and
   descriptor fragments into the foundation spec (worldJoin's required-literal column
   is the proof of shape). 4. Host extractions (motion controller, txn bridge, leg
   resolver) — mechanical, after 1-3. 5. Native settle event + native hidden depth —
   bundled with the next real physics change only.
   BURN-IN WATCH (native, bounded): posture-register owner-death/boot-steal, pinChrome
   seal no-op, audit slot-TY fiction, carve seed comment/code mismatch, MAX-filter bounce
   false positive, return-to-same-detent settle suppression. PROTECTED LIST (correct,
   do not churn): chrome twins, freezeUntilSnap ack routing, scroll-memory-survives-
   eviction, entry-stamp opt-in, F874 timing constants, frozen-world store, clamp
   filter, delivered-values liveness probe.

## THE TWO AUTHORITIES LANDED (2026-08-04) — deferral corrected

Owner pushed back on parking these as "post-burn-in": they are the class fixes for
LIVE bugs, and burn-in is for unknown problems, not known ones. Both landed:

DOMAIN AUTHORITY (6aee2bdf6, build-verified): one TrackDomainLegalRange() owns the
legal tau domain; insets are its only output; exactly one contentInset assignment
remains in the engine. applyRangeLawTo deleted, the posture ceiling deleted as a
write (declaring the drag IS the act), prior-grow folded in as a phase, the two
clamp filters kept as the DETECTION predicate only. F4 closes by identity
(maxOffset === boundary in both directions, so mid-drag content growth cannot lift
the ceiling nor shrink create a phantom wall); F7 closes by single-writer
composition max(engineNeed, registeredBaseline). Falsifiers compile the real header
on the host: yarn test:track-domain, 37 checks, 10 mutations proven RED.
NOTE: the external-baseline seam has no live JS caller today (keyboard avoidance
here is transform-based) — ratified mechanism, currently unexercised.

MOTION AUTHORITY (e01afd164): facts in as transitions, state out as a total query
API with episode identity. The fence bits, interrupt refs, excursion refs and the
two rival edge subscriptions are gone; four rival encodings of "at rest" are now
one. F2 closes AT THE SEED — a redraw arming mid-flight asks the authority instead
of being born settled. Falsifier lives in the surface-runtime spec.

STILL DEFERRED, and correctly: the scene-declaration schema collapse and the host
extractions (structural, no behavioral payoff, churn risk before burn-in), and the
native settle/hidden-depth move (bundled with the next real physics change).

## ALL DEFERRED ITEMS EXECUTED (2026-08-04) — the ladder is complete

Owner: "do all the deferred items." Done; nothing from the ratified ladder remains.

64148ea54 ONE SCENE SCHEMA — five dialects (policy Record, three host Sets, the
scene===key ternaries) collapse into SCENE_DECLARATIONS with every column a
required literal: a new scene key fails tsc until fully stated, so no scene can
be half-configured or silently inherit a default. Parity PROVEN by a 284-test
oracle that fossilizes every pre-change source and sweeps 21 keys x every
consumer. The motion descriptor table deliberately stays separate: it is an edge
relation over scene PAIRS with a precedence lattice, not a per-scene column; it
references the schema for posture seats, which is the correct coupling.

d9df23bd4 THE ENGINE STATES ITS FACTS — settle is emitted by the spring (closing
two holes the sampler had: rest at a non-detent, and return to the SAME detent,
which the old one-shot keyed on the detent rather than the motion); hidden depth
is derived from live native bounds instead of a JS Dimensions copy (where
G-ROTATE staleness lived); and a contract version + capability list makes a stale
binary fail LOUDLY — the class fix for the silent degradation that cost the owner
an evening. No compatibility shim by design.

a4c3b96a0 THE HOST IS AN ORCHESTRATOR — 1400 lines to 462. Motion controller,
transaction bridge and leg/body resolver extracted as pure cores + thin adapters;
the render lane (whose purpose is catching wiring deletions) stayed green
throughout, which is what makes "pure relocation" a test result and not a claim.

REMAINING (unchanged): the burn-in watchlist, and owner ratifications (re-tap
semantics; the presented 'search' leg resolving through homeParts). R8 (old-system
delete) still gated on owner burn-in.

## G-A11Y RE-DERIVATION CHECKPOINT (2026-08-05, landed)

The row said "announce + move focus on switch". The re-derivation refused that shape as a
call site and asked what the ACCESSIBLE MODEL of a persistent surface whose content is
replaced actually is. Answer: THE SWAP IS THE NAVIGATION EVENT, and its identity is the
identity the whole track already runs on — the ENTRY (G-ENTRY). One presented entry is one
screen to the user. So the pure core (track-a11y-plan.ts, `TrackA11yAnnouncementLedger`)
has exactly ONE input axis — the PAINTED entry key plus the destination's declared name —
and everything the row's naive shape would have leaked is UNREPRESENTABLE rather than
merely avoided: readiness phase is not a parameter, so a cold entry's skeleton→real-rows
sequence cannot double-announce (it is one navigation); motion is not a parameter, so no
announcement can attach to a dismissal or a slide — during a hidden excursion the PAINTED
entry is still the outgoing one (A2's deferred swap), so the core is silent by identity and
the destination announces itself once, when it is actually painted. The adapter
(use-track-a11y-announcer.ts) is the only AccessibilityInfo caller and runs on EVERY commit
with no dependency array ON PURPOSE: a dep list would make the effect the suppressor and
the ledger unfalsifiable decoration — the law must be where the RED lands. Focus: the page
owns which chrome layer is presented (all layers are mounted and opacity-flipped), so it
attaches the host's ref to that layer and the cursor moves to the DESTINATION's header
instead of being stranded mid-list.
ONE CONTRACT SHARPENING, in the schema's own idiom: the announcement TEXT is a REQUIRED
literal column `track.a11yName` on every SCENE_DECLARATIONS row (the worldJoin shape). A
scene that forgot its name would be SILENTLY unannounced — the one defect class a
screen-reader user cannot detect — so omission is a tsc error. The header Title is a React
component in the registry and cannot be read as text; this column is the announcement's
only possible home.
Falsifiers (same change): 5 pure checks (track-a11y-plan.spec.ts, incl. "no scene has an
empty name") + 5 render-lane checks against the real host chain
(**render**/track-host-a11y.render-spec.tsx). RED-proven by four mutations: latch removed →
2 render + 2 pure RED (skeleton double-announce, same-entry re-render); focus ref detached →
2 RED; entry-keyed → scene-keyed → 1 RED (same-scene push); announce call removed → 3 RED.
Kill-list: none — the rung ADDED a fact nothing previously stated; no dead branch or
superseded attempt was created or revealed (the render lane's AccessibilityInfo stub is new
instrumentation, not scaffolding).

## G-ROTATE — OWNER RULING (2026-08-05): PORTRAIT-ONLY, with one un-pinned edge

Owner ruling: the app is PORTRAIT-ONLY, so "snap points derive from a startup seed and must
recompute on a dimension change" is not a concern to fix. Evidence, iPhone: `app.json`
`"orientation": "portrait"`, and `ios/cravesearch/Info.plist`
`UISupportedInterfaceOrientations` = Portrait + PortraitUpsideDown only (no landscape) —
the window's dimensions cannot change on iPhone, so a startup seed cannot go stale. The
G-ROTATE staleness that DID have teeth is already gone by other means: the hidden
excursion's depth is derived from live native bounds (d9df23bd4), not a JS Dimensions copy.
THE ROW STAYS OPEN, narrowed, because the config does not pin what the ruling claims on one
edge: `TARGETED_DEVICE_FAMILY = "1,2"` + `"supportsTablet": true`, and
`UISupportedInterfaceOrientations~ipad` DOES list LandscapeLeft/LandscapeRight — an iPad
build can rotate, and `TrackSheetPage.tsx`'s module-scope `const SCREEN =
Dimensions.get('window')` (grab-handle x, close-button x, drawDistance, tail height) would
then be stale. Nothing was deleted on the strength of the ruling: these are LIVE readers,
not dead scaffolding, and replacing them with `useWindowDimensions` is a behavior change
that only earns its risk if iPad is a real target. OWNER FYI / the row's whole remaining
question: is iPad a shipping target? A "no" is one edit (drop the ~ipad landscape entries,
device family 1) and G-ROTATE dies with it; a "yes" makes the SCREEN snapshot a real bug to
fix.

## G-A11Y / G-APPSTATE / G-ROTATE — executed (2026-08-05)

G-A11Y (be8402ae8) CLOSED. The accessible identity of a data-swapping persistent
surface is the ENTRY: one presented entry = one screen. The pure core takes only
{painted entry, name}, so readiness cannot leak (skeleton→rows cannot
double-announce — phase is not a parameter) and motion cannot leak (a hidden
excursion still paints the OUTGOING entry, so it is silent by identity). The
announcement name is a REQUIRED column on all 21 scene rows: a silently
unannounced scene is the one defect its audience cannot report, so omission is a
tsc error. 10 falsifiers, 4 mutations RED incl. against the real host chain.

G-APPSTATE (973d8e094) CLOSED, with the fact list amended: FOUR proven motion
facts (command, drag begin, settle, edge) plus ONE non-fact. A wall clock is a
LIVENESS BACKSTOP against a fact that never arrived — it gets no seat at the
authority's table and MAY NOT manufacture what it cannot observe. deadline-expired
now DEGRADES (rest:false, degraded:true) and barks instead of completing a settle;
liveness consumers release on a degrade (a backstop that cannot release is a
second way to hang), fact consumers do not. Episode-scoped and suspended-time-
aware. Two derived laws: no wall clock may bound a GESTURE; every commanded
episode is backstopped, not only token-bearing ones. KILL: the 12x200ms snap retry
loop — a LIVE DEFECT (snapTo resolves at spring START, so it measured mid-flight
distance and re-issued the command every 200ms through up to 2.4s of every real
motion, restarting the spring and bumping the excursion generation).

G-ROTATE NARROWED, not closed. Owner ruled portrait-only; verified for iPhone
(app.json portrait; Info.plist portrait-only) and the depth staleness that had
teeth is gone (native bounds, d9df23bd4). BUT supportsTablet:true, device family
"1,2", and UISupportedInterfaceOrientations~ipad lists landscape — an iPad build
rotates, and TrackSheetPage's module-scope Dimensions snapshot would be stale.
OWNER QUESTION: is iPad a shipping target? No = one config edit and the row dies.
Yes = the snapshot is a real bug. Nothing deleted on the strength of the ruling.
