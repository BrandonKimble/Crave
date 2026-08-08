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

Owner: "do all the deferred items." Done.

> **CORRECTION (2026-08-08, claim-vs-reality audit):** the original line here read
> "nothing from the ratified ladder remains." That is not accurate — one item was
> **silently substituted**. Shortlist item 3 of `plans/redteam-abstractions.md`,
> **"one paint resolver"** (merge readiness + skeleton + hidden-presentation into a
> single total `resolvePaint`, discharging F3's "host wiring unfalsified" debt), was
> **DISPLACED by the domain authority** — a different pass's finding that landed in
> the same territory — rather than done. **Disposition: displaced-not-done,
> re-evaluate after R8.** The press-up handoff has since added a FOURTH paint
> decision to exactly that glue, which **strengthens** the item rather than
> retiring it.

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

## THE PRESS-UP HANDOFF — RE-DERIVATION CHECKPOINT (2026-08-05, touch latency)

Owner complaint: "pages respond slowly to touch; they should respond immediately on press
up, and if they're not ready we use the skeleton flow." Measured on device (warm polls tab
switch): press->paint=280ms, commit->paint=119ms, and the ~160ms between the route txn
COMMITTING and the ack bridge ARMING is React rendering the destination's tree before the
layout effect runs. The probe said polls "presented real rows in the switch commit" — the
skeleton path never engaged and the finger paid the full first-screenful render.

THE RE-DERIVATION found a CONFLATION, not a missing optimization. The readiness axis asks
"does a concrete body RESOLUTION exist" — a DATA question, and the right one for OA6.1's
frozen world. The owner's question is "can this paint THIS frame?" On the one-track page
(ONE FlashList, fed by the PRESENTED leg only — the reason posture is unambiguous at all)
PAINT RESIDENCY belongs to exactly one entry at a time: the outgoing one. So the
destination of ANY switch has, by construction, zero mounted rows, and "the switch commit
renders the destination's rows" is a promise the page cannot keep in one frame. R2's own
honesty note already recorded the structural half of this ("only the presented leg's rows
mount"); what was missing was the consequence for the FLIP.

CONTRACT SHARPENING (Part 1, the readiness row): readiness is TWO facts, not one. The lane
fact (a body resolution exists) latches for every leg, presented or not — a resident's
parts hook latches it at BOOT, before the scene is ever shown, which is exactly why a
data-warm entry was allowed to cost 119ms of finger time. The PAINT fact (this entry's real
body has been rendered AS THE PRESENTED LEG) is what separates "first paint of this entry"
from "re-presenting an entry that already has painted content", and it is the fact OA6.1
actually needs on the track. It lives in TrackEntryPaintLedger (track-entry-handoff.ts),
written at exactly one place — the commit that builds an entry's real body for
presentation — so it cannot drift back into meaning "data arrived".

THE MECHANISM (option b of the four offered: commit the flip, let the body arrive async):
planTrackEntryHandoff is a total pure function over four facts, and every 'direct' is a
STATED reason rather than a fallthrough — no outgoing paint (boot: no finger waiting), no
real rows (readiness already owns the skeleton/frozen decision; a second mechanism deciding
the same thing is the class this system deletes), a world-join scene (OA1 owns its reveal,
and a handoff would be a rival phase inside the join), or the entry has painted before
(OA6.1: a warm revisit never flashes). Otherwise DEFER: the press-up commit paints the
destination's chrome — already-mounted layers, an opacity flip — over the ONE body the page
can always paint in a frame, THE SKELETON with its per-scene variant (OA2); the real body
is the next commit, released at the paint boundary (rAF, the same after-paint reading the
[PERF] probe runs on). No new "wait" state: every commit still paints. No second
announcement: G-A11Y keys on the PAINTED ENTRY, and the entry does not change on release.

REJECTED, with reasons. (a) a render-readiness signal feeding the ledger — render cost is
not knowable before rendering, and the only honest proxy (a measured per-entry paint cost)
CONFLICTS with OA6.1: a genuinely slow scene would exceed any frame budget forever and
would therefore flash a skeleton on every revisit. (c) arming the ack bridge without
waiting on the destination render — the arming is 2ms and moving it earlier does not make
pixels appear earlier; the join was never the cost. (d) prewarm rendering the destination's
first screenful during finger-down — it needs a SECOND mounted list lane, which reintroduces
N rival scroll views, the ancestor of every hard bug of this arc.

WHAT IS NOT CLOSED, and needs the owner's device. The handoff makes the FIRST paint of any
entry unblockable. A REVISIT still renders its rows in the flip commit by OA6.1's demand —
cheaper (recycler pools, module and component caches are warm) but not bounded. Making a
revisit's first frame IMPOSSIBLE to be slow requires PAINT RESIDENCY for more than one
entry, i.e. the second lane rejected above; that is a real rung, not a patch, and it should
be cut only if the measured revisit is still slow. MEASURE: (1) press->paint on a FIRST
switch to polls (expect chrome+skeleton, tens of ms, with the probe reporting "presented
cold (skeleton commit)" then "switch-commit->real-rows"), (2) press->paint on a REVISIT to
polls (this is the open number), (3) that no skeleton is visible on any revisit.

KILL-LIST: none created and none revealed. The [PERF] cold-flip probe was CORRECTED rather
than deleted — it read the resolution, which would have reported "presented real rows in
the switch commit" for the exact frame whose purpose is that it has none (an always-green
metric, and the precise lie that hid this defect); it reports what was PAINTED now, one log
pair per switch. FALSIFIERS (same change): 9 pure checks (track-entry-handoff.spec.ts,
including totality) + 6 render-lane checks against the real host chain
(**render**/track-host-handoff.render-spec.tsx), with the expensive-body simulation counting
renderItem invocations so "the flip did not wait on the body" is measured, not inferred.
RED-proven by six mutations (1/1/1/6/1/1); one candidate mutation (hasOutgoingPaint) is
claimed only in the pure lane because its render-lane RED was intermittent.

### CORRECTION (2026-08-05, independent audit — three blocking defects)

**D1 — the rung did not fix the measured defect.** The section above states the physics
correctly ("paint residency belongs to exactly one entry at a time: the outgoing one") and
then contradicts it in the mechanism: `entryHasPaintedContent` exempted any entry that had
EVER painted, which is precisely the repeat tab switch the 280ms measurement came from. A
first visit deferred; every revisit blocked the flip frame on the destination's first
screenful all over again. The rung fixed the case nobody complained about.

RE-DERIVED: the exemption's true fact is not history but RESIDENCY — cheap-to-paint is a
claim about the CURRENT view tree, and a tree that unmounted two switches ago costs exactly
what one that never existed costs. `TrackEntryPaintLedger` is replaced by
`TrackEntryResidencyLedger`, a SINGLE-SLOT fact (the page has one body, so at most one
entry's rows are mounted) written when the presented leg builds its real body and CLEARED at
the flip, where the outgoing rows leave the tree. Consequence, and the intent: the
destination of every switch is non-resident, so EVERY switch defers.

**OA6.1 is preserved without an exemption.** The deferred frame is not obliged to paint a
skeleton — only to paint something producible without the destination's live resolution. For
an entry that has shown content that is its FROZEN last-good body (`lastGoodListRef`, the
readiness ledger's existing 'frozen' phase). Skeleton stays what it always was: the body of
an entry that has never had one. So a revisit defers AND never flashes. The "WHAT IS NOT
CLOSED" paragraph above is superseded in part: the revisit no longer renders its CURRENT
rows in the flip commit. THE HONEST RESIDUAL: when an entry's frozen body and its current
resolution are the same list, the flip frame pays the same render it would have paid without
the rung. What the rung provably removes is the destination's LIVE first screenful, and the
falsifier is written against exactly that and nothing more. The second-lane rung is still the
only thing that makes a revisit's first frame impossible to be slow.

**D2 — the metric would have gone green by definition.** With the handoff armed, the press
stamp was consumed by the commit that painted the SKELETON, so the number the rung exists to
move improved trivially while the span the user feels (press -> real rows) went unmeasured;
worse, the two probes anchored differently (one at the press, one at the commit) and were
never summed. RE-DERIVED as ONE span with ONE anchor and TWO marks, reported as ONE line:
`[PERF] press <entry> press->first-paint=<a>ms press->real-rows=<b>ms
first-paint-real-rows=<bool> deferred=<bool>`. The skeleton is a PHASE of the span, not its
result — `press->real-rows` can only be stamped by a commit that painted real rows. The
commit-anchored `[PERF] switch … commit->paint=…` line stays as a diagnostic and no longer
carries a press number: one anchor, one owner. Two further holes closed: an unconsumed stamp
now EXPIRES (`TRACK_PRESS_SPAN_TTL_MS`, lazily evaluated — a press that landed nowhere used
to let a later unrelated paint report a fabricated multi-second latency), and CHILD PUSHES
are stamped at `revealRoute`, the one chokepoint every reveal already flows through, so
listDetail / pollDetail / restaurant / userProfile / settings / saveList / pollCreation have
an honest span for the first time.

**D3 — the render lane.** `track-host-switch` (deferred-swap) and `track-host-readiness`
(activation bridge) both assert on the mounted body, which the rung deliberately moves to
the commit AFTER the flip (R2's two-phase law, applied). Verdict for both: (ii) stale
expectation, re-pointed at the release commit with an explicit `flushFrame()` — not a
regression, and neither spec is about WHICH frame the body lands in (the handoff spec owns
that). RED-ABILITY RE-PROVEN after re-pointing: unregistering `userProfile` from
`MOUNTED_BODY_COMPONENTS` reddens the deferred-swap spec; forcing
`deriveTrackEntryBodyActivity` back to the pre-R2 all-false reddens the activation-bridge
spec. Also corrected: the revisit falsifier asserted row PRESENCE, which is green whether or
not the finger paid for the render; it now asserts on `cost.renders` (the destination's
current resolution is not rendered in the flip frame), and OA6.1 keeps a separate check.

KILL-LIST (this correction): `TrackEntryPaintLedger` and `TrackEntryHandoffFacts.entryHasPaintedContent`
(deleted — the wrong fact); `consumeTrackNavPressLatency` (deleted — a consuming, single-mark
probe); the `press->paint=` fragment of TrackSheetPage's commit-anchored line (deleted —
second anchor). Nothing else revealed.

## R8 OPENER — QUEUED ITEMS (2026-08-08)

R8 remains the old-SYSTEM delete pass, gated on owner burn-in. Two items are added to
its opener by the 2026-08-08 claim-vs-reality audit (both are the same class the ladder
already ruled on — one authority per fact, stated once):

1. **Four presented-refs → ONE host-owned latch.** "Who is presented" is still tracked
   by four refs across two files: `TrackSheetRouteHost:298`, `use-track-leg-resolver:245`,
   `TrackSheetPage:1182` and `:1184`. Collapse to a single host-owned latch handed down
   to the page (the shape §2 of `plans/redteam-abstractions.md` prescribed).
2. **τ-domain encoded twice → a single statement in the domain authority's header.**
   `track-entry-switch.ts:57` and `:66` re-derive "we are in the hidden domain" from τ
   instead of reading the domain authority. State it once, in the authority's header.

Also already assigned to R8: **F9400–F9403 (defined in audit/FINDINGS.md)**.

Additionally queued from the same audit, per the correction above: shortlist item 3
**"one paint resolver"** — displaced, not done; re-evaluate here.

## CLAIM-VS-REALITY AUDIT WRITE-IN (2026-08-08)

Carried in VERBATIM from the audit (finding B4), because it previously lived only in a
session transcript that cited `plans/redteam-claims-audit.md` — **a file that never
existed**. Recording it here makes it durable:

> world-join audit reads {q2RowsResident, q2MapFrameClean} while
> markRedrawCardsReady/markRedrawNativeMarkerFrameReady offer join inputs directly —
> genuinely RED-able but can bark on a healthy enter if mounted_hidden precedes the
> transport ack; five entry points, two lanes, vs the design's three-producers-one-per-input

Dispositions: the **cry-wolf check stays on the owner's post-deploy sitting** (a live sim
observation, not a desk verdict); the **`entity/` and `-cluster` re-home is returned to
coordinator triage** — not scheduled here.

## OA8 — OA6.1 REFRAMED (owner ruling 2026-08-07): warm revisits are an OUTCOME, not a ban

The owner's actual intent, stated directly: the no-skeleton-on-revisit behavior was
never a RULE to enforce — it was the natural OUTCOME of an industry-best-practice
implementation where a visited screen stays loaded/retained/preloaded and therefore
revisits faster than first visits. Forcing the skeleton to hide on a heavy screen
purely to obey the old phrasing is WRONG. A revisit may honestly show a skeleton if
the screen genuinely cannot paint; the goal is an implementation where that is rarely
needed because retention/prewarming makes revisits cheap. The OA6.1 latch drift
("was ever resolved while hidden") is therefore not a defect to revert but a question
subsumed by this reframe: the paint decision should be honest (paint what is
actually cheap and real), not rule-bound.

OWNER APPROVALS (same ruling): R8 old-system delete, one-paint-resolver merge, the
six hardcoded rowType bypasses fixed through the resolver, SaveList contradiction
resolved (rowType question open), and the queued F9400-F9403 absorption — ALL
approved. Open questions to owner: SaveList skeleton 'history' vs 'tile' (which is
right?); R8 landing timing vs the imminent ~400-commit prod push (coordinator board
says post-burn-in; owner approval may supersede — confirm).

NEW MANDATE: an INDUSTRY BEST-PRACTICES audit — given the landed ONE TRACK
architecture, what do best-in-class apps do for parent/child/nested/backward screen
switching (retention, preloading, priming, transition choreography) that we do not,
and what does our architecture uniquely lend itself to leverage? Deliverable: a
rundown of every non-ideal behavior + a plan to the frontier.
