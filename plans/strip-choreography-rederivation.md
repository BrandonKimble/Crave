# Strip choreography — line-by-line rederivation (2026-08-08)

Read-only investigation of the owner's three witnessed symptoms (strip pops after page,
gap on the outgoing page, skeleton never seen). Every claim below is grounded in a
file:line read this pass, not logs, not prior memory. Deliverable of the owner directive:
"read the code line by line, figure out the ideal from-scratch shape, what's wrong, how
far off we are."

---

## 0. The system as built — who paints what, on which clock

Three clocks touch the strip region on a tab switch. This is the disease in one line:
**the band's pixels are assembled by three mechanisms with three different notions of
"now", and only one of them is the React commit the flip rides.**

| # | Mechanism | Clock | What it paints |
|---|-----------|-------|----------------|
| 1 | RESIDENT CHROME STACK opacity flip (`TrackSheetPage.tsx:1024-1061`, layers `:1033-1051`) + FlashList body swap (`:1363-1397`) | The React/Fabric flip commit | Which leg's chrome layer shows; the body rows/skeleton/frozen cell |
| 2 | Native shell config: `pinChrome`/`bindShell` → `shellChromeHeight` → THE PATH RULE row masks (`TrackSheetPage.tsx:445-463` calling `TrackScrollPhysics.m:1424-1445, 1461-1530`; masks applied at `TrackScrollPhysics.m:818-893`) | The **legacy RCTUIManager `addUIBlock` queue** — flushed on the main thread on its own schedule, not inside Fabric's mounting transaction | Where rows are clipped (bandBottom = τ + sheetTop + chromeHeight), i.e. the SIZE of the chrome band carved out of the rows |
| 3 | Post-layout measurement loops inside the cutout surfaces: ToggleStrip's hole registry + `contentRowWidth`/`rowHeight` state (`ToggleStrip.tsx:452-456, 742-771`), TrackSheetDockedStrip's `measureLayout`→`setHoles` (`TrackSheetStrip.tsx:43-62, 97-106`), CutoutSkeletonSurface's `onLayout`→`size` (`CutoutSkeletonSurface.tsx:158-167, 201-216`) | onLayout → setState → **a second (or third) React commit**, one+ frame later | The WHITE CUTOUT MATERIAL itself and its holes |

Clock 1 is right. Clocks 2 and 3 are the two symptom factories.

The one supporting fact that makes everything below legible: **the white cutout strip is
not painted by the chrome layer flip.** The chrome layer that flips at the commit contains
the ToggleStrip, but the strip's white plate (`CutoutBandMaterial`) is gated at
`ToggleStrip.tsx:774`:

```
{contentRowWidth > 0 && rowHeight > 0 && maskedHoles.length > 0 ? (
  <CutoutBandMaterial ... />
) : null}
```

and `contentRowWidth` **always initializes to 0** (`ToggleStrip.tsx:456` —
`React.useState(0)`; the warm cache seat at `:437-455` seeds `holeMap`, `viewportWidth`,
`rowHeight`, `scrollX`, but there is no `contentRowWidth` field in the cache). So **every
fresh mount of a ToggleStrip — warm seed or not — renders at least one committed frame
with NO white material at all**: a transparent band over frost. Meanwhile the pills paint
frame 1 by explicit design — SegmentedToggle's "LAYOUT-FIRST FIRST PAINT" twin
(`SegmentedToggle.tsx:255-265`) exists precisely so the pill is never invisible on first
paint. The engineers of the pill solved the frame-1 problem for the pill and left the
plate on the layout clock. That asymmetry IS the owner's "buttons are there, the white
strip that creates the cutout shapes is not."

---

## 1. The three symptoms, mechanically

### Symptom 2 first (it is the primitive): polls → lists, first frame

Frame-by-frame, from the code:

1. **Flip commit** (clock 1): presented entry flips to `lists#root`. The chrome stack
   shows lists' layer — header says "Lists" (title element cached,
   `use-track-leg-resolver.tsx:719-724`), the lists ToggleStrip element (cached at
   `:725-735`) is mounting for the first time this session (lists is a resident leg,
   mounted on first visit / prewarm — `use-track-leg-resolver.tsx:394-431`).
   - Strip band this commit: SegmentedToggle's layout-first twin paints pills + pill
     color (`SegmentedToggle.tsx:255-278`); `CutoutBandMaterial` is **gated off**
     (`ToggleStrip.tsx:774`, `contentRowWidth === 0`, holes empty on a first-ever visit).
     Result: **pills floating on frost — the gap, buttons present, no white**. Exactly
     as reported.
   - Body this commit: the handoff defers (`planTrackEntryHandoff` → `'defer'`,
     `track-entry-handoff.ts:129-148`; the destination is never resident,
     `TrackEntryResidencyLedger` cleared at the flip,
     `use-track-leg-resolver.tsx:549-554`). Paint resolver: first visit ⇒ no frozen body
     ⇒ **skeleton** (`track-paint-resolver.ts:63-67`). But the skeleton's first committed
     frame is a **hole-less white plate**: `CutoutSkeletonSurface` derives row holes from
     `size.width`, which comes from `onLayout` (`CutoutSkeletonSurface.tsx:158-167`), so
     on its first commit `resolvedHoles` is empty (`:201-216`) and
     `MaskedHoleOverlay ... renderWhenEmpty` (`:351`) paints solid white. Result: **the
     content region below is completely white** — as reported.
2. **Next frame** (rAF handoff release, `use-track-leg-resolver.tsx:564-577`): the
   skeleton is evicted after exactly one paint boundary — before its own `onLayout`
   round-trip can ever produce holes — and the real lists body mounts
   (`ListsMountedSceneBody` through `rendererForMountedEntry`,
   `use-track-leg-resolver.tsx:262-339`). If lists' queries are pending, its
   `SceneBodyReadyGate` mounts **a fresh** `SceneLoadingSurface` — which restarts the
   measure cycle and paints hole-less white again. More white frames.
3. **A commit or two later** (clock 3): ToggleStrip's `onLayout`s land
   (`ToggleStrip.tsx:742-771`), `contentRowWidth`/`rowHeight`/holes go >0, the white
   `CutoutBandMaterial` **pops in** — "the strip pops in a few frames later". Then lists'
   data commits and the content pops in. The pop ORDER the owner reports (strip first,
   then content) matches: the strip needs one layout round-trip; content needs data.

Why "consistently", not just on first visit? The resident chrome stack keeps the strip
mounted after visit 1 (`TrackSheetPage.tsx:1016-1023`), so a *warm* revisit should skip
step 1's strip half. The residual witnessed paths: (a) any session's first visit to each
tab; (b) prewarm (`use-track-leg-resolver.tsx:403-431`) narrows but cannot close the
window — it buys only press-down→press-up (~100ms) against a chain that needs mount →
onLayout → setState → second commit, and the prewarmed layer is opacity:0, so any part
of the chain that hasn't finished by press-up is paid in the open; (c) child scenes'
strips are evicted with depth-K retention (`use-track-leg-resolver.tsx:471-480`) and
remount cold on return.

### Symptom 1: home → polls — the gap appears ON THE OUTGOING page

Home declares `strip:'none'` (`scene-foundation-spec.ts:283-286`), polls/lists
`strip:'header'` (`:316, :344`). So this direction changes `chromeHeight`
68.25 → 108.25 (`TrackSheetPage.tsx:366-371`) — and chromeHeight is **clock-2 state**:

- The flip's layout effect runs `executeEntrySwitch`, whose `applyChromeSelection`
  re-asserts the shell config for exactly this reason (`TrackSheetPage.tsx:1224-1234` —
  its own comment records the 40pt tall/short mask bug that motivated it).
- `applyPin` → `pinChrome` + `bindShell` (`TrackSheetPage.tsx:445-463`) are
  `RCT_EXPORT_METHOD`s that enqueue `addUIBlock`s (`TrackScrollPhysics.m:1424-1445,
  1461-1530`). `bindShell` sets `shellChromeHeight` and immediately replays
  `scrollViewDidScroll` (`:1527-1529`), which rewrites THE PATH RULE row masks
  (`:818-893`): every non-chrome sibling is clipped to start at
  `bandBottom = τ + sheetTop + chromeHeight` (`:842, :869-872`), inside a
  `CATransaction` with actions disabled — **instant, native, this main-thread turn**.
- The Fabric mounting of the flip commit (opacity flip + body swap + the taller slot
  content) lands on ITS clock. Nothing sequences the two: the legacy UIManager block
  queue and Fabric's mount transaction are independent main-thread work items.

When the addUIBlock flush wins the race (home→polls direction), for one-to-two frames
the screen shows: **home's chrome layer (68.25, no band, so no buttons in the band
region) + home's rows clipped 40pt LOWER than home's chrome covers** — a strip-shaped
band of nothing between header and rows, revealing the frost slot behind
(`TrackSheetPage.tsx:1335-1343`). That is precisely "the gap appears while the HOME
content is still up — buttons absent — and only when the content switches to polls does
everything look right." The reverse race order and the strip→plain direction produce the
other flavors; **strip→strip switches (polls↔lists) have NO chromeHeight delta, so this
mechanism is silent there — which is why that direction's lateness is instead the
symptom-2 material mechanism.** The direction-dependence the owner noticed is the two
mechanisms partitioning the switch matrix between them.

(Confirmed non-causes, for the record: the chrome element caches do NOT remount the strip
on a warm switch — signatures at `TrackSheetPage.tsx:950-958` exclude per-switch
identities and the strip element identity is entry-cached
(`use-track-leg-resolver.tsx:725-735`); the opacity flip IS same-commit with the data
swap (`TrackSheetPage.tsx:1033-1051` + `:1367`); MVCP is disabled (`:1381`). The stack
design is sound — the bug is what the stack does NOT own: the white material and the
native band size.)

### Symptom 3: the skeleton is never seen — it is structurally invisible

Three independent reasons, all in the code:

1. **Its first frame is blank white.** `CutoutSkeletonSurface.tsx:201-216`: row holes
   require `size.width > 0`, which arrives only via `onLayout` → `setState` → second
   commit (`:158-167`). The first commit paints `MaskedHoleOverlay` with `holes=[]`,
   `renderWhenEmpty` (`:351`) — a solid white plate. (Only the static
   `extraHoles`/filter-strip pills could paint frame 1 — `SceneLoadingSurface.tsx:72-75`
   builds them without measurement — but they're merged into a list that still renders
   under the same plate, and the body-region holes are the visible mass.)
2. **Its lifetime is one paint boundary.** The handoff release fires on the next rAF
   unconditionally (`use-track-leg-resolver.tsx:564-577`) — not on destination
   readiness. The skeleton is evicted at exactly the moment its second commit (the one
   that would have shown holes) could land. So it exists as pixels only in its blank
   first frame: **the skeleton and "a white gap" are pixel-identical.**
3. **No identity continuity.** After release, a pending mounted body renders its OWN
   fresh `SceneLoadingSurface` under `SceneBodyReadyGate`
   (`use-track-leg-resolver.tsx:299-335` provides the context that makes that possible).
   A fresh instance restarts the measure loop — blank white again. The "skeleton" the
   architecture believes in is actually a relay of short-lived surfaces, each dying
   before it can cut a hole.

So the owner is right twice over: the visible churn happens in the open, AND the skeleton
that exists to cover it is provably incapable of covering anything — it never survives to
its own second commit, and its first commit is indistinguishable from the defect it
exists to hide. Under the owner's ruling ("a white gap between skeleton-drop and content
may NEVER exist"), the current shape violates the law **by construction**, not by tuning.

---

## 2. What is RIGHT and stays

- **The resident chrome stack** (`TrackSheetPage.tsx:1016-1054`): all legs' chromes
  mounted, opacity-flipped in the flip commit, entry-keyed caches. Correct; keep.
- **The one paint resolver + handoff split** (`track-paint-resolver.ts`,
  `track-entry-handoff.ts`): the DECISION layer is clean, total, and owner-ratified
  (OA8). The defect is not in what body is chosen but in what the chosen bodies can
  actually paint on frame 1 and how long they are allowed to live.
- **The sacred strip behaviors are all in the engine and untouched by any fix below**:
  horizontal scroll + rubber band (`ToggleStrip.tsx:748-793`), infinite-white illusion
  (`CutoutBandMaterial` flanking panes, `:591-605`), true cutouts to the one frost
  (one-frost law, `:728-735`), warm scrollX restore (`:461-481`).
- **THE PATH RULE itself** (`TrackScrollPhysics.m:818-893`) and the slot's composed-frame
  seal (`TrackShellSlot.m:59-89`): the masking mechanism is right; only WHEN its
  chromeHeight input changes is wrong.
- The pill's layout-first twin (`SegmentedToggle.tsx:255-278`) — it is the proof of the
  correct principle (frame-1 paint from deterministic layout), applied to only one of
  the three surfaces that need it.
- The CutoutFadeCover pattern (`ToggleStrip.tsx:219-264`) — the exact tool the ideal
  shape needs (holes appearing late hide under a same-color cover), already built.

## 3. The from-scratch ideal — one choreography under the reveal law

**Law restated as a commit schedule.** On press-up, ONE flip commit paints, atomically:
the destination's complete chrome (white plate WITH cutout holes, pills, title) and a
skeleton covering the entire body region WITH its holes already cut. That state persists
— shimmering, no pixel changing except the shimmer — until the single reveal commit in
which real text/structure replaces the skeleton in the same frame. Images fade in
starting at that reveal. No frame in between may show frost where white belongs, white
where a skeleton hole belongs, or content that later shifts.

Three principles derive everything:

1. **Cutout geometry is render-time data, never post-layout discovery.** Every quantity
   the gates wait for is knowable at render time: band height is declared
   (`TOGGLE_STRIP_BAND_HEIGHT`), viewport width is `Dimensions`/the window, control rects
   are either cached (the seat already stores them) or computable from the same flex
   inputs the pill twin uses, skeleton hole geometry is a pure function of window width
   (`buildPresetHoles` needs only a width). Measurement remains as a *refinement*
   (sub-pixel correction under a fade cover), never as the *existence condition* of the
   white.
2. **Plate-first, holes-additive.** A cutout surface's white plate renders
   unconditionally on its first commit. Holes may sharpen a commit later ONLY beneath a
   plate-colored cover that fades (the §2.8 cover, already implemented). Legal sequence:
   white → white-with-holes-fading-in. Illegal, and today's actual sequence:
   frost-gap → white → holes.
3. **One clock, one owner per pixel.** (a) Anything that changes with the flip
   (chromeHeight, band size, which chrome shows) changes ON the flip commit's clock —
   the native band config must ride the same frame as the chrome pixels, not the legacy
   addUIBlock queue. (b) The skeleton is ONE continuous mounted surface from flip to
   reveal — the handoff phase and the body-gate phase share the instance (or hand off
   without a remount), so the measure/shimmer state never restarts and no white seam can
   exist between phases. (c) The release is gated on the destination's readiness
   (content commit built), not on a fixed rAF; the rAF stays only as the mechanism that
   lets the flip frame reach the screen first.

## 4. How far off — verdict

**Resequencing, not restructuring.** The load-bearing architecture (resident stack, one
track, one paint resolver, handoff, PATH RULE, engine-owned strip) is the right
from-scratch shape and survives intact. The gaps are all "right pixels, wrong clock":

| Gap | Kind | Where |
|---|---|---|
| White material gated on measurement | resequencing (make plate unconditional; seed/derive geometry) | `ToggleStrip.tsx:456, 774`; `TrackSheetStrip.tsx:112` is already plate-first (`renderWhenEmpty`) — the header plate is fine; the band material is not |
| Skeleton holes gated on onLayout | resequencing (width as prop / Dimensions) | `CutoutSkeletonSurface.tsx:158-167, 201-216` |
| Handoff release ignores readiness; skeleton lifetime 1 frame | resequencing (gate the release) | `use-track-leg-resolver.tsx:564-577` |
| Skeleton remounts across handoff→gate | small restructuring (one surface identity across the two phases) | `use-track-leg-resolver.tsx:346-371` vs the gate's own surface |
| Native band config on the legacy UIManager clock | the one genuinely structural item (move chromeHeight onto the commit clock) | `TrackSheetPage.tsx:445-466, 1234`; `TrackScrollPhysics.m:1461-1530` |

## 5. Ordered fixes + falsifiers

**Fix 1 — plate-first ToggleStrip (kills symptom 2's strip half).**
Render `CutoutBandMaterial` whenever `viewportWidth > 0` can be substituted by the window
width; drop the `contentRowWidth`/`maskedHoles.length` conditions for the PLATE (holes
list may be empty; the flanking-pane math needs an extent — use the seeded/estimated
content extent, refine on layout). Add `contentRowWidth` to the layout cache so warm
mounts are exact frame 1. New holes appearing post-first-commit ride `CutoutFadeCover`.
*Falsifier (render lane):* mount a fresh ToggleStrip, assert the first committed tree
contains the band material; mutation-proof by restoring the gate and watching it go RED.
*Dev bark:* a cutout surface that commits with pills but no plate logs
`[STRIP] transparent band committed`.

**Fix 2 — skeleton frame-1 holes + readiness-gated release + continuity (kills symptom 3;
satisfies the reveal law).**
(a) Pass width into `CutoutSkeletonSurface` (the track cell is full-window-width minus
known insets; `SceneLoadingSurface` knows `insetX`) so `resolvedHoles` is non-empty on
commit 1. (b) Gate the handoff release (`use-track-leg-resolver.tsx:570-576`) on
`resolutionHasRealRows`/mounted-body-content-committed instead of bare rAF — the skeleton
persists until the reveal commit; keep the rAF only to guarantee the flip frame painted
first. (c) One skeleton surface across handoff→body-gate: either the gate adopts the
already-mounted surface (shared element via context) or the handoff skeleton stays
mounted above the pending body until the gate reports ready. Images: the mounted bodies'
image components start their fade at the reveal commit, never before.
*Falsifier:* render-lane test that a cold flip's first commit contains ≥N skeleton holes;
a dev assert that no commit between flip and reveal removes the skeleton while the
presented body has no real rows ("white-gap law" — must show RED if the rAF release is
restored).

**Fix 3 — chromeHeight on the commit clock (kills symptom 1).**
Make the band size change atomically with the chrome pixels: pass `chromeHeight` (and
strip-presence) as a PROP on the chromeContent `TrackShellSlot` so it arrives inside the
Fabric mounting transaction, and have the slot's `setFrame`/prop-set trigger the PATH
RULE re-mask natively (the slot already self-registers and composes in `setFrame` —
`TrackShellSlot.m:67-89`; extend the same pattern). `bindShell` keeps everything else;
chromeHeight simply stops being addUIBlock-carried state.
*Falsifier:* hard to unit-test the race; the honest instrument is the frame capture
protocol below plus a native os_signpost pair (`maskApplied(chromeHeight)` /
Fabric-commit-mounted) whose ordering is asserted in a device run — must be able to show
RED by reverting to the addUIBlock path.

**Frame-capture protocol (device verification, all three fixes):**
`xcrun simctl io <udid> recordVideo --codec h264 --force strip.mp4` while driving the
switch via the perf deep link (`crave://perf-scenario-command?...`) or a finger; step
frames in QuickTime (⌘←/→). Per direction (home→polls, polls→lists, lists→home,
polls→home) assert per frame: never frost in the band region while any page is
presented; never a hole-less white body region longer than 0 frames after flip; skeleton
holes visible on the flip frame; content replaces skeleton with no intermediate white
frame. Correlate with `[PERF] switch` + the phase lines in `/tmp/crave-metro.log`
(marker per run, per CLAUDE.md capture recipe).

**Explicitly not touched:** strip scroll physics, rubber band, warm scrollX restore,
CutoutBandMaterial geometry, THE PATH RULE walk, the paint resolver's decision table,
the resident stack — the sacred behaviors ride through unchanged.
