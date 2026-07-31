# THE TRANSITION — from-scratch derivation (2026-07-29)

Companion to native-shell-derivation.md; same charter. Derived AFTER a full
read of the old system's switch choreography (BottomSheetSceneStackHost legs,
motion descriptor table, snap-session runtime, shell backdrop host) and a full
trace of the track host's switch path. The clamp guard shipped earlier was one
mechanism aimed at an undecomposed cluster — a patch. This is the decomposition.

## I. What the OLD system actually guaranteed on a switch

O1. CO-MOUNTED HARD SWAP. All 7 scene legs are permanently mounted absolute-
fill siblings (Host:75,1709-40). A switch mounts/unmounts NOTHING. The
outgoing leg stays at opacity 1 until the transition txn joins
{paint, chrome}; then every leg flips in ONE frame on the paintAck shared
value. Nothing fades; nothing intermediate is ever visible.
O2. POSITION NEVER DERIVES FROM CONTENT. The sheet is a FIXED height:screenH
container moved only by translateY(sheetY); every leg is absolute-fill; the
body lane's top is a COMPUTED chrome height. No measurement feeds position.
O3. A SWITCH COMMANDS MOTION ONLY BY DESCRIPTOR. topLevelSwitch resolves the
posture seat (home seat vs ONE shared content seat); a same-side switch
resolves to the CURRENT detent and the spring short-circuits at <0.5pt —
zero pixels. preserveLiveY/none ⇒ no command at all.
O4. THE ABOVE-SHEET TREATMENT IS A DIM PLANE, NOT A SHADOW. A black strip
(opacity ≤0.12) from y=0 with height = sheetTopY exactly, plus inverse-
corner wedges, at z80 UNDER the sheet (z90); driven by
1 − searchChromeTransitionProgress over a 220px response zone above middle.

## II. The four violations in the track system (each = an owner symptom)

V1 (breaks O2): τ's legal range depends on content — and the JS insetBottom is
recomputed ABSOLUTELY per contentSize pass (TrackSheetPage:765), one render
LATE. A taller body SHRINKS the inset; UIKit clamps τ on the inset commit.
The native guard I shipped watches contentSize only — the inset shrink
re-clamps right through it. ⇒ "snaps to a weird mid-high", not persistent.
V2 (breaks O3): the seat re-asserts inside EVERY onContentSizeChange
(reassertSeatRef, :756) — a swap yields several passes, each re-firing the
native spring mid-flight. ⇒ jerks, re-targeting wobble.
V3 (breaks O1): ONE FlashList whose data/renderItem/rowSurfaceStyle all change
identity in the switch commit — the outgoing body is DESTROYED in place,
every cell invalidated, several relayout passes visible; unpublished scenes
flash PLACEHOLDER_ROWS. ⇒ flicker, flash states, jerking content.
V4 (breaks O4): the dim plane geometry mirrors sheetTranslateY; the strip's
height must equal the REAL sheet top every frame. The track publishes the
mirror from the JS-side worklet — during native springs/clamps the
publication lags or misses, so the strip detaches from the sheet.
⇒ "search bar caught above the shadow band / fully white when extended."
(The deleted top-edge shadow was the OLD sheet's own 4px shadowShell bleed —
distinct from the dim plane, which must stay.)

## III. The laws (the ideal shape)

L1. THE RANGE LAW — the ENGINE owns τ's legal range. contentInset.bottom is
written by NATIVE ONLY, synchronously with every contentSize change:
inset = max(0, viewport − (contentH − H)) + max(0, τ − maxOffset) headroom.
JS never touches contentInset (delete insetBottom state + prop). With the
range always covering [0, H]+list, EVERY seat is reachable by construction
— the reachability re-assert machinery (V2's trigger) is DELETED, not
fixed. τ-invariance across swaps stops being a guard and becomes algebra.
L2. THE SEAT IS DESCRIPTOR-ONLY. One command per switch, from the motion
descriptor resolution (already one-shot); never re-fired by content events;
spring short-circuits when |τ − target| < 0.5 (port the old check into
snapTo so a same-posture switch provably writes zero pixels).
L3. THE SWAP IS HELD, THEN HARD. Port O1's contract to the one-list world:
the switch commit keeps the OUTGOING body's data until the incoming
scene's body is RESOLVED (published/parts — never placeholder between real
scenes), then swaps once. Row identity (renderItem/rowSurfaceStyle) must be
scene-stable so a swap invalidates cells exactly once. The paint ack fires
on the post-swap layout, same as today.
L4. THE DIM PLANE RIDES THE SHELL. The strip's height must be the SAME value
the shell writes — native. Either bind the backdrop strip into bindShell
(native transforms it like frost/tail) or drive it from a native-written
shared value; never from a JS-thread mirror. Reuse the production wedge
components verbatim (law #20).

## IV. Order (each rung: land → instrument → owner thumb)

1. L1 native range law + delete JS inset + delete reachability re-assert.
2. L2 short-circuit + descriptor-only seat (verify lists↔polls↔home: zero
   commanded pixels on same-posture switches — log the command decisions).
3. L4 dim plane onto the shell (fixes the search-bar band artifacts).
4. L3 held swap (the flicker) — last, it is pure RN sequencing.

---

## V. RED TEAM (2026-07-29, owner-directed) — §I–III are NOT yet the ideal; corrections recorded before any code

The owner was right not to trust it. Verified against the tree:

**Corrections to §I.** O1: 18 legs, not 7; and the body lane genuinely
CROSS-DISSOLVES in held-dissolve mode — "nothing fades" is only true of the
chrome lanes. O2: the persistent header's onLayout is a SECOND inset source
alongside computeSceneChromeHeight. O3 is materially wrong: postureSeat
resolves the REMEMBERED GESTURE seat (gesture-written only) — after any
programmatic move a same-side switch commands REAL pixels; the short-circuit
is confirmed but is not why tab switches were still. O4: the dim plane is
gated on search-root focus and its zone starts at EXPANDED, not above middle.

**Omitted vocabulary the ideal must cover** (all cited in the agent record):
warm-leg early-flip vs cold paint via hasPaintedSceneKeys evidence; held
transitions pinning paintAck=0 across the flush→commit window; the motion
FENCE producers (snap START → pending, settle → restore, issue-side expected);
the full descriptor table (promoteAtLeast, rememberedDetent with per-row
fallbacks, terminalDismiss→hide, none-mandates, preserveLiveY catch-all,
isPreserveMotionContract suppressing camera+chrome); dismiss/restore
choreography (poll restore hold, dismiss boundary at collapsed,
gesture-hidden); origin capture pre-writing the popped-to posture; and search
ALIASING the home seat (home↔search = same seat) with a bespoke leg outside
the data lane.

**THE LEGS QUESTION — opened, with hard facts on both sides.** §III L3
accepted the single-FlashList shape from the current tree — a violation of the
from-scratch charter. Co-mounted per-scene legs with ONE re-attaching engine
are PARTIALLY supported: attach is idempotent per scroll view, setOffset can
seed τ pre-reveal, detach restores delegates safely. And PARTIALLY blocked,
today: display:none legs have zero bounds so a seeded τ clamps to 0; N lists
share one onScroll handler (each would write τ); commandsRef is last-mount-
wins; the clamp-guard KVO is not removed on detach (a crash class on
attach/detach cycles — REAL BUG, fix regardless); the track host already
tried registry prewarm legs once and got the phantom-duplicate paint; and the
old system's co-mounting was BUDGETED residency (shells never evict, content
evicts; warm-before-navigate), not unconditional mounting.

**Verdict.** §I–III stand as a corrected evidence record, not as the ideal.
The v2 derivation must be built from THIS section's facts, must answer the
legs question from scratch (budgeted co-mounted legs + engine re-attach VS
held single-list swap — decided by the phantom-duplicate and zero-bounds
constraints, not by what exists), and must cover the full descriptor/fence/
restore vocabulary above. Nothing from §IV ships before that.

---

## VI. V2 — THE DECISION (from scratch, from §V's facts)

### The insight §I–III missed: τ fuses two DIFFERENT kinds of state

τ < H is SHEET POSTURE — app-level, shared, must survive every switch.
τ ≥ H is LIST SCROLL — per-scene, private, must NOT leak across scenes.
The old system stored these separately (sheetY + each leg's own scroll). ONE
TRACK fused them into one number and the switch path never decomposed it — so
a switch either leaked the old scene's scroll into the new one or re-seated τ
(moving the sheet). Every jank symptom lives in that missing decomposition.

### THE SWITCH FORMULA (the core of v2)

On scene switch: τ_new = min(τ, H) + listScroll(incomingScene)
with listScroll(scene) saved at switch-out as max(0, τ − H).
Proof of stillness: sheetTop(τ) = expandedTop + max(0, H − τ) is FLAT for
τ ≥ H, and listScroll is nonzero only when both sides are ≥ H — so
sheetTop(τ_new) ≡ sheetTop(τ). The sheet CANNOT move on a switch, by algebra,
while each scene keeps its own scroll. A descriptor seat (home↔content
crossing, child open, dismiss) is the ONLY thing that changes posture, exactly
as the old table specifies — including remembered-gesture seats and
preserveLiveY.

### THE LEGS VERDICT: co-mounted lists are NOT needed

Their sole purpose in the old system was "outgoing visible until incoming
painted" — but there each leg carried its own full surface. In the native-shell
world the SURFACE never swaps (frost/plate/chrome/tail are persistent native);
only ROWS swap. So the purpose is served by THE HELD SWAP alone: keep the
outgoing rows' data until the incoming body is resolved AND its first layout
has painted (the paint-evidence gate, ported), then swap data + apply the
switch formula + swap chrome in the SAME commit, with the shell re-asserted
that frame. Zero-bounds seeding, N τ-writers, phantom duplicates, per-leg
masks — the entire §V blocker list — never exist. Budgeted residency returns
later ONLY as data prewarming, never as mounted duplicate lists.

### The remaining v2 laws (unchanged from §III, now consistent)

RANGE (native-only contentInset; every posture always legal; delete the JS
inset + reachability re-assert + fix the detach KVO leak) · SEAT
(descriptor-only, <0.5pt short-circuit, gesture-only memory) · FENCE (snap
START → sheetReady pending, settle → restore — produced by the track's one
facts bridge) · DIM PLANE (strip height = the shell's own sheetTop, bound in
bindShell; search-root-gated, zone at expanded, wedges reused).

### Why this is a design and not a plan

Every owner symptom maps to exactly one law, and each law makes its symptom
unwritable: mid-high snaps (RANGE + FORMULA), jerk/re-target (SEAT), flicker/
flash (HELD SWAP), scroll leaking between tabs (FORMULA), search-bar band
artifacts (DIM PLANE), reveal hangs (FENCE). Nothing in it references the
current tree except as the thing to delete.

## VII. Archaeology (owner-directed, 2026-07-29) — the pre-home contract, and one design change

The owner recalled switching being correct "before we added the home page."
Confirmed in history. The pre-home seat runtime (checkpoint 9ad80e33,
2026-07-14) states the contract verbatim: "Switching tabs never moves the
sheet EXCEPT when crossing between home and the rest." Two seats only — HOME
(carrier scene: 'polls', because home's presentation WAS docked polls;
seeded collapsed) and ONE SHARED content seat (seeded expanded); writes
gesture-only.

Then 1613024f ("the home surface — polls DEMOTED TO A TAB") made home a real
scene — but polls kept its home-side seat classification from its carrier
days. So today lists→polls is a home↔content CROSSING by stale taxonomy, and
the system commands a downward seat exactly as designed for a crossing —
that is the owner's "switching from lists to polls snaps the sheet down."
Not a physics bug: a stale classification.

DESIGN CHANGE (the one thing VI missed): **a scene's seat side is DERIVED
from its presentation role — the map-dominant root owns the home seat;
every tab is content** — never inherited from history. Concretely: polls
moves to the content seat; 'home' is the sole home-side scene; search keeps
aliasing the home seat. lists↔polls becomes same-seat → zero commanded
pixels by the same rule that always governed same-side switches.

CLARIFICATION (dim band vs shadow): the SHADOW (gray top-edge gradient,
shadowShell) is DELETED — owner decision, done. The DIM PLANE (the ≤12%
black scrim that recedes the search bar as the sheet reaches full extension)
is a different mechanism and still exists in production, search-root-gated.
The design keeps it, shell-bound (L4), because "search bar behind the scrim"
is a stated want — if the owner wants it gone too, L4 deletes cleanly and
nothing else depends on it.

## VIII. Owner correction (2026-07-29): shadow STAYS, the 12% scrim dies

Misread corrected. "Get rid of the shadowing" meant the DIM PLANE — the ≤12%
black scrim (strip + inverse-corner wedges) that darkens the search chrome as
the sheet extends. That is DELETED from the design outright: L4 is struck, and
with it the whole scrim-tracking problem (a layer that must equal sheetTop
every frame simply no longer exists — the class of "band detached from the
sheet" artifacts dies with it).

The sheet's own TOP-EDGE SHADOW (production shadowShell, ~4px bleed above the
corner silhouette) STAYS — restored to the frost wrapper in the tree. S3
stands as originally written.

KEPT unchanged: every other search-chrome transformation driven by the
transition progress — the scale ramp (0.985→1), visibility/opacity from
overlayChromeVisibilityProgress, the dismiss plane, origin capture. Those ride
the progress value, not the scrim, and are unaffected by its deletion.

## IX. Implementation record (2026-07-29) — the rungs landed, with three laws the derivation earned on contact with UIKit

CORRECTION to VII: the registry already classifies polls as content-side (the
home migration did it); the seat-taxonomy rung was a no-op. The observed
snap-down was V1+V2 (clamp + seat), as V2's laws predicted.

Landed and device-verified (τ probes + screenshots, home↔polls round trip:
916→648 held expanded; 648→916 exact scroll restore, sheet still):

1. THE RANGE LAW, native. With THE PRIOR-GROW: UIKit clamps contentOffset
   WHILE processing a new contentSize — before any after-the-fact observer —
   so the guard pre-grows the inset in the KVO PRIOR notification (τ +
   viewport covers any new height), and the after-notification tightens to
   the exact formula. Growing an inset never moves content.
2. THE SHELL REFRESH: with no clamp there is also no didScroll after a swap,
   so the after-notification re-runs the shell writer explicitly — tail/mask/
   chrome always positioned against the NEW contentSize (the parked-tail
   defect, seen live).
3. THE SWITCH FORMULA in the page (sceneKey prop): save max(0, τ−H) per
   scene at switch-out; instant setOffset to min(τ,H) + restored. Never a
   spring — restoring your own scroll is not motion.
4. THE SEAT IS POSTURE-SPACE: a seat targets sheetTop, which is FLAT for
   τ ≥ H — 'expanded' is satisfied by ANY τ ≥ H. Seats compare min(τ,H),
   never raw τ (an 'expanded' seat was destroying restored scroll, live).
   Plus the native <0.5pt short-circuit in snapTo.
5. THE HELD SWAP: the outgoing scene's rows stay until the incoming body
   resolves; placeholder never flashes between real scenes. Scroll memory
   keys on the DISPLAYED scene.
6. JS inset + reachability re-assert DELETED (range law subsumes both);
   detach KVO leak fixed; the 12% scrim off (BACKDROP_DIM_MAX_OPACITY=0,
   host deletion deferred to the delete pass).

Open (burn-in): polls' leader inset shows frost between strip and card
(pre-existing composition, not a switch defect); child-page enter/exit and
search/results still ride the old descriptors untouched.

## X. NEXT (owner, 2026-07-30): the header is a HANDLE, not part of the page

Owner report: with the page scrolled, dragging the HEADER scrolls the page's
content back up before the sheet moves — the header feels like page surface
instead of a sheet handle, and blocks pulling the sheet down mid-scroll.

The old system never had this: the header lived outside the scroll, so a
header drag drove ONLY sheetY while the body's scroll stayed put. This is the
posture/scroll decomposition (VI) applied MID-GESTURE, not just at switches:

LAW: a drag BEGINNING in the chrome band drives POSTURE ONLY (sheet slides
with the finger, list scroll preserved; re-expansion restores the exact
scroll). A drag beginning on rows keeps the ONE TRACK continuum. Mechanism
must live natively beside the engine (a temporary, scoped posture-drag path —
the one place a second writer is permitted, because the finger IS the writer).
Needs its own derivation + verification round: release settles, ballistic
wall interplay, and the τ/scroll re-fusion at settle are all non-trivial.

## XI. THE STASH (σ) — the header-handle derivation (2026-07-30)

**Old system:** header outside the scroll; a header drag drove sheetY only,
body scroll untouched. Free, because posture and scroll were two variables.

**Why ONE TRACK can't express it:** a sheet at middle with a scrolled list is
UNREPRESENTABLE — τ < H forces listY = 0. Any fix that rewrites τ per-frame
(P8) or jumps it at drag-begin produces visible teleports.

**The insight:** don't move τ — move the EDGE. Introduce one native variable,
THE STASH σ, and make H+σ the effective sheet/list boundary everywhere:

    sheetTop(τ) = expandedTop + max(0, (H+σ) − τ)
    listY(τ)    = max(0, τ − (H+σ))

- STASH (header-drag begin): σ += max(0, τ − (H+σ)). At that instant
  sheetTop is unchanged by algebra — no jump. From the next frame, finger
  motion moves the sheet edge 1:1, and because ROWS are content (screen y =
  contentY − τ), they move WITH the sheet automatically — the whole sheet
  slides as one object, scrolled content glued in place, exactly the old feel.
- DISSOLVE (τ rises to H+σ): σ := 0. sheetTop unchanged by algebra again —
  and the content offset is genuinely H+σ, i.e. THE OLD SCROLL, restored
  exactly, with zero discontinuity. Not stored and replayed: never lost.
- Everything shifts by σ: ballistic edge, snap region, sheet-region detents
  (detentTau+σ), the chrome pin, the band mask. snapTo inputs are
  POSTURE-space (native adds σ); setOffset is τ-space and RESETS σ (a scene
  switch re-fuses). Scene switches save σ + listY as the outgoing scroll.
- Behavior table: header drag anywhere ⇒ sheet moves immediately. Row drag at
  a lower posture with σ ⇒ the classic handoff (sheet first), and expansion
  lands on the preserved scroll. Row drag at expanded ⇒ unchanged continuum.
- ONE WRITER holds: σ lives in the proxy, written only in
  willBeginDragging (stash) and didScroll (dissolve) — the same two hands
  that already own τ.

This is not a patch on the fusion; it is the fusion completed — posture and
scroll become separable exactly when the finger demands it, by moving the
boundary instead of the state.

## XII. GROUND-UP VERDICT (owner-directed, 2026-07-30) — why switching is unstable

Standing broken state observed (not a flash): polls header flush with the
SCREEN TOP, body far below, frost gap between them. Three introduced
fragilities, each a violation of our own derivation:

F1. THE FAKE SLOT. The chrome/frost/tail are React-managed views whose
transforms native writes — but React RESETS transforms on every commit,
and we re-assert AFTER (the commit-proof law). That is a race, not a
guarantee: any commit that lands without a follow-up shell apply leaves
the header at y=0 (screen top) — seen on profile, now polls. The
native-shell derivation specified a REAL native slot (native container
views the shell owns, RN renders INTO them); we shipped the transform
shortcut instead. VERDICT: build the real slot — chrome position becomes
un-writable by React, the header-at-top class dies.
F2. THE DIVISIBLE SWITCH. Content swap (commit), tau re-fuse (async block),
sigma reset, shell rebind are separate observable steps. VERDICT: the
ARMED RE-FUSE — the host arms the target at the presentation-frame flush
(before React commits); the native contentSize observer (already
synchronous with the mount) applies it. No interim state exists.
F3. THE PARALLEL SEAT (law #20 violation). The old, locked-in logic — "the
sheet stays exactly where it is unless crossing to/from the home sheet,
which restores its remembered seat" — lives in the motion descriptor
table. The track host RE-IMPLEMENTED seat resolution beside it
(getRouteSceneSwitchSceneSnap + one-shot + formula ordering). A second
implementation of locked-in choreography is why it no longer behaves.
VERDICT: delete the parallel path; consume the descriptor pipeline's
output (posture-space snapTo / none), exactly as the old host did.

Plus DRAG ROLES (XI red team) and the switch-commit profiler. Execution
order: F1 (the slot) → F2 (armed re-fuse) → F3 (descriptor-driven seat) →
roles → profile. Each rung device-verified before the next.
