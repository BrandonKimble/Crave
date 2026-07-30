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
