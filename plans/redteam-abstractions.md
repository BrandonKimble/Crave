# ABSTRACTION RED TEAM — the track sheet transition system

> **STATUS BANNER (2026-08-08) — this document is HISTORY, not current truth.**
>
> This is a **2026-08-04 point-in-time critique**. The ladder ratified out of it is
> **COMPLETE and verified** — see `plans/transition-endstate-contract.md` ("THE TWO
> AUTHORITIES LANDED", "ALL DEFERRED ITEMS EXECUTED", the G-A11Y / G-ROTATE and
> press-up-handoff checkpoints) for the landed verdicts and their falsifiers.
>
> **EVERY `file:line` CITATION BELOW IS STALE.** The host is now **551 lines** (was
> 1429 here); the JS settle sampler, `hasClearedScreenEdge`, the 12×200ms retrying
> snap, the dual `trackHiddenEdgeCleared` subscriptions and the host's hand-kept
> scene sets are all **deleted or replaced**. Do not navigate from a line number in
> this file; read `transition-endstate-contract.md` for current truth, then the code.
>
> Per-claim verdicts (line refs are to THIS file):
>
> | Here | Claim | Verdict 2026-08-08 |
> | --- | --- | --- |
> | :155 | host is 1429 lines | STALE — host is **551 lines** (orchestrator extraction landed) |
> | :41–42 | JS settle sampler is the primary rest signal | STALE — **native spring emits settle**; sampler gone |
> | :51 | `hasClearedScreenEdge` is a dead JS mirror | **DELETED** |
> | :85 | three host refs hold motion state | STALE — folded into the **motion authority** |
> | :117–119 | two hand-rolled `trackHiddenEdgeCleared` subscriptions | STALE — **collapsed to one** |
> | :127–129 | F2 (redraw born `sheetMotionSettled: true`) | **CLOSED** — the seed asks the authority |
> | :170–171 | `legScene === 'polls' ? … : …` glue in the host | STALE — **moved out** to the leg/body resolver |
> | :173–176 | three hand-kept scene sets + `scene === …` conditionals | STALE — **collapsed into `SCENE_DECLARATIONS`** |
> | :205–211 | hidden depth computed in JS from `Dimensions` | STALE — **derived natively** from live bounds |
> | :213–217 | the 12×200ms retrying snap | **DELETED** |
>
> (Stale note resolved 2026-08-08: item 3 ("one paint resolver") LANDED in R8 —
> `resolveTrackPaint`, contract "ONE PAINT RESOLVER"; see the R8 checkpoint in
> `transition-endstate-contract.md`.)

2026-08-04. Read against: transition-endstate-contract.md (all checkpoints + end
red team), every file in apps/mobile/src/tracksheet/, TrackScrollKit/Sources/
(TrackScrollPhysics.m, TrackShellSlot.m), and the R7 search-side surface
(world-join-contract.ts, scene-foundation-spec.ts worldJoin,
search-surface-runtime.ts fence/admission, ListDetailPanel worldBacked).

Charter: not "does it work" — "are these the right primitives at the right
altitude." Every finding names a CLASS. The system's own ratified laws are the
yardstick: ONE TRACK, collapsed-is-τ=0, chrome-is-content, entries-as-values,
glide-only (OA5), the world join (OA1), 60fps.

---

## 1. THE MODULE MAP — a rung ledger wearing a module system's clothes

_Verdict 2026-08-08: `hasClearedScreenEdge` DELETED; the settle sampler replaced by a native settle event. The "one paint resolver" fix LANDED in R8 (`resolveTrackPaint`, contract "ONE PAINT RESOLVER")._

**What a from-scratch design looks like.** Given the ratified laws, the pure
layer has FOUR domain axes, not twelve files:

1. **Identity & memory** — who an entry is, what it remembers (scroll, latch,
   retention order).
2. **Motion** — where the sheet is, whether it is moving, what proves rest.
3. **Paint** — given identity + data facts, what does this commit paint
   (content / skeleton / frozen / deferred-outgoing).
4. **Audit** — the falsifier layer that re-checks delivered values (liveness,
   world-join, shell audit).

**Reality.** Twelve `track-entry-*` modules whose names are the contract's
G-rows (`readiness` = G-READY, `hidden` = G-HIDDEN, `prewarm` = G-PREWARM…).
Each is individually excellent — small, pure, falsified — but the partition is
BY RUNG, not by domain. The tells:

- **τ-domain facts are encoded twice.** `planEntrySwitch` re-derives "we are in
  the hidden domain" from `tau >= 0` (track-entry-switch.ts:56, 71) while
  track-entry-hidden.ts owns the domain concept. If the domain rule ever
  changes (e.g. a partial hide), two modules must agree by luck.
- **Four encodings of "at rest / in motion."** (a) `sheetLegIsAtRest` (fence) —
  four host refs; (b) `classifyRestingPosture` (interrupt) — ±2pt detent
  epsilon; (c) the settle observer's τ-stability heuristic (TrackSheetPage
  ~558: two consecutive frames within 0.5pt); (d) native `inMotion`
  (isTracking || isDragging || isDecelerating || springLink). Four independent
  definitions of the single most load-bearing fact in the system.
- **Three modules answer one question.** readiness (phase), skeleton
  (material), and hidden's `resolveHiddenPresentation` (deferred paint) are all
  fragments of "what does this commit paint," reassembled by ~120 lines of
  host glue (`resolveLegBodyResolution` / `resolveLegList` / the paintedRef
  latch). The composition — the actual paint decision — is the one part that
  is NOT pure and NOT falsified (red-team F3 said exactly this about
  fence/hidden host wiring; it is a symptom of this class).
- **`hasClearedScreenEdge` is a dead JS mirror** (F4 already flagged) — a
  module exporting a fact whose one real producer is native. The class:
  mirrors created so a rung's spec could quote the fact, kept after the
  runtime stopped needing them.

**Severity:** medium (nothing is wrong; the seams are).
**Class:** partition-by-delivery-schedule instead of partition-by-domain.
**Principled fix:** re-home, don't rewrite: fold switch/scroll-memory/
retention/identity into an `entry/` cluster (they already compose cleanly);
merge readiness + skeleton + hidden-presentation into ONE total paint resolver
(`resolvePaint(entry, facts) → {body, chrome, deferred}`) so the host executes
a plan instead of assembling one; motion facts go to the authority in §3.
**Migration cost:** low-moderate — file moves + one new pure function whose
jest suite is the union of three existing suites.
**What NOT to do:** a big-bang "consolidate the modules" rewrite that re-derives
scope from the code. The specs are the ledger; move them WITH the code.

---

## 2. STATE AUTHORITIES — the echoes are back, one strangler-layer later

_Verdict 2026-08-08: the three host motion refs folded into the motion authority. The four presented-refs → one host-owned latch LANDED in R8 (`TrackPresentedEntryLatch`)._

**From-scratch:** the system's own history (posture register derivation,
"every stored echo eventually lied") demands: ONE stored authority per fact,
everything else derived at read time.

**The census.** Genuine authorities: native τ, native σ, the entry scroll
memory, the readiness latch, the retention LRU, the route stack (external),
`hiddenEngaged`/target (native). Everything else is a cache or a mirror:

| Store                                                                                 | Verdict                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gTrackPostureRegister` (native global)                                               | **Stale-rationale echo.** Its header justifies it by "N scroll views, N rival claims" — but THE ONE TRACK (TrackSheetPage ~1136) deleted the N-legs world. With one scroll view, posture = clamp(τ−σ, 0, H) is a pure derivation. Kept only because refuse()/seed paths read it. |
| `gTrackShellExpandedTop/TrackH` mirrors                                               | Same class — "a fresh leg has no proxy yet" is a one-scroll-view anachronism.                                                                                                                                                                                                    |
| `gTrackCarveSheetTop`                                                                 | Derived every frame from τ; a global because hitTest can't reach the proxy. Acceptable, but it is a THIRD copy of the sheetTop formula (native shell writer, JS `sheetTopY` derived value, carve global).                                                                        |
| `inFlightSnapTargetRef`, `pendingSettleTokenRef`, `hiddenExcursionInFlightRef` (host) | The motion authority's state, scattered as three refs in a hook. See §3.                                                                                                                                                                                                         |
| `paintedRef` (host)                                                                   | A second "presented" authority. Legitimate latch (deferred swap needs last-painted), but it lives beside `presentedEntryKeyLiveRef` (host) and `presentedEntryKeyRef` + `prevEntryKeyRef` (page) — FOUR refs tracking flavors of "who is presented," in two files.               |
| JS mirrors `tau`/`sigma`/`dragging` SVs                                               | Necessary bridge mirrors; the code already treats them as lagging (switch reads them only at rest; native computes fresh in refuse()). Correct, but the discipline is tribal — nothing marks a mirror as "rest-only."                                                            |
| publication bridge (sheetTranslateY/sheetScrollOffset)                                | Mirror-of-a-mirror for legacy riders. Correct strangler artifact. NOTE 2026-08-08: R8 landed WITHOUT deleting it — the bridge migration is owned by `plans/residue-kill-plan.md` §1.                                                                                             |
| `lastGoodListRef`                                                                     | Genuine (OA6.1 frozen world) — a store, not an echo. Keep.                                                                                                                                                                                                                       |

**Severity:** medium now, high if left through R8.
**Class:** echoes whose justifying world was deleted out from under them.
**Principled fix:** an explicit register of authorities: for each fact, ONE
owner and a documented read path. Concretely: derive posture from τ/σ inside
native (NOTE 2026-08-08: the register + geometry-mirror deletion was NEVER
scheduled into R8 — it needs coordinator triage; see `plans/residue-kill-plan.md`
§6.5 — with a falsifier that a switch still cannot move the sheet); the four
presented-refs → one host-owned latch is DONE (R8's `TrackPresentedEntryLatch`).
**Migration cost:** low for the JS refs; the native globals are burn-in-risky —
schedule with R8, not before.
**What NOT to do:** delete the posture register "because it's derivable"
without first proving the cold-leg seed path (the OUTSIDE-shellEnabled-gate
comment, TrackScrollPhysics.m ~634) no longer needs it.

---

## 3. EVENT/FACT FLOW — there is no motion authority, and F2 is its ghost

_Verdict 2026-08-08: LANDED. Motion authority exists; F2 CLOSED by construction; the dual `trackHiddenEdgeCleared` subscriptions collapsed to one; settle is emitted by the native spring._

**From-scratch:** one MOTION AUTHORITY owning the facts {dragging,
in-flight target, hidden excursion, pending settle, last rest}, with exactly
the proven producers writing it (willMove command, native drag begin, settle,
edge cleared, deadline) and every consumer — fence, interrupt reads, liveness,
join arming, settle-token completion, posture memory — READING it. Queryable
and subscribable, so a consumer that is born mid-flight can ask.

**Reality:** the facts exist but as ad-hoc wiring per consumer:

- `trackHiddenEdgeCleared` has TWO independent NativeEventEmitter
  subscriptions in the same file (host ~336 for the deferred swap/boundary,
  host ~621 for settle completion). Two subscribers to one fact is fine; two
  hand-rolled subscriptions is the no-bus tell.
- The settle FACT is detected twice: the native spring knows the exact frame
  it settles, yet JS re-derives settle by sampling τ stability in an animated
  reaction (Page ~558). The most important rest fact in the system is an
  inference, not an event.
- **F2 is precisely this class**, not a bug of its own: a redraw arming
  mid-flight is born `sheetMotionSettled: true` because the surface runtime's
  seed path (search-surface-runtime.ts:689, 719) has no authority to ASK — the
  at-rest fact lives in three refs inside a React hook, reachable only by the
  push producers. Patch F2 alone and the next new consumer re-opens the same
  window.
- The fence's pure half (`sheetLegIsAtRest`) is a projection over exactly the
  facts the authority would own — the module is the authority's type
  signature, waiting for its store.

**Severity:** HIGH — this is the one place the architecture still permits the
old disease (a consumer inventing its own view of motion).
**Class:** facts without an authority; every consumer keeps a private ledger.
**Principled fix:** a `TrackMotionAuthority` (module-level store, same shape as
the prewarm signal): producers are exactly today's five proven facts; expose
`isAtRest()` + subscribe. The surface runtime's seed asks it (closing F2 by
construction); the fence pure module becomes its selector; the two emitter
subscriptions collapse to one. Second step, native-side: emit `trackDidSettle
(detentTau, writer)` from the spring/engine and make the JS stability sampler
the backstop instead of the primary.
**Migration cost:** moderate; touches burn-in-watched wiring — land as its own
rung with the F2 repro as the falsifier, after burn-in, not during.
**What NOT to do:** the tempting patch — teach the redraw seed path to peek at
the host's refs via another module-singleton getter. That adds a fourth
private ledger and names no authority.

---

## 4. THE HOST — an orchestrator that also runs three governments

_Verdict 2026-08-08: LANDED. Host 1429 → **551** lines; motion controller, transaction bridge and leg/body resolver extracted (the `legScene === 'polls'` glue with them); the three hand-kept scene sets collapsed into `SCENE_DECLARATIONS`._

TrackSheetRouteHost is 1429 lines. Its legitimate job — select the presented
entry, build legs, hand the page a plan — is maybe 400 of them. The absorbed
responsibilities, each a clean extraction seam a from-scratch design would
have drawn:

1. **The motion controller** (~200 lines: executeMotionCommand, settle tokens,
   the 700ms deadline, interrupt refs, fence marks, hidden-settle emitter).
   Pure-ish, testable, and it is the §3 authority's natural home.
2. **The transaction bridge** (~80 lines: ack bridge, arm/seal/offer, the
   freezeUntilSnap routing). This is transition-ENGINE policy executed inside
   a layout effect, guarded by a 30-line comment. It belongs beside
   transition-transaction.ts as a named function
   (`bridgeTrackCommitToTxn(scene, frame)`), where its ORDER LAW can be a
   test instead of prose.
3. **The leg/body resolver** — see §6; the three body dialects are reconciled
   inline with per-scene conditionals (`legScene === 'polls' ? pollsParts :
homeParts` appears twice, host ~1137 and ~1194).
4. **Scene policy leaked into code:** `ROOT_TRACK_SCENES`,
   `RESIDENT_TRACK_SCENES`, `UNPADDED_BODY_SCENES`, `scene === 'settings'`
   (grab handle), `scene === 'polls'` (create fallback, scroll activity,
   rowSurfaceStyle ternary). The host's own F872 NOT-DONE note already rules
   this belongs on the route-metadata/foundation table. It is the contract's
   own "seats are table rows" law, unapplied to residency/padding/chrome.

**Severity:** medium (the code is honest; the altitude is wrong).
**Class:** the orchestrator absorbing every rung's landing site because it was
always the file already open.
**Principled fix:** extractions 1–3 are mechanical (no behavior change, same
commit as their existing specs); 4 is a data migration into the one schema
(§6). The host ends as: read frame → resolve paint plan → render page.
**Migration cost:** low for 1–3; 4 rides the §6 schema.
**What NOT to do:** extract "a hook per concern" that still lives in this file
— the win is that the transaction bridge and motion controller get their OWN
falsifiers, which requires them to leave the .tsx.

---

## 5. JS/NATIVE BOUNDARY — facts up, commands down; three leaks

_Verdict 2026-08-08: all three leaks closed — native settle event, hidden depth derived from live native bounds, and the 12×200ms retrying snap DELETED._

**From-scratch contract:** native is the motion engine — owns τ, σ, domain,
range, springs, detent choice, pin/shell/carve — and exports FACTS as events
(settled, edge cleared, sigma changed, drag began). JS is policy — decides
WHAT to command and what to paint — and sends COMMANDS (snapTo, refuse,
bindShell). Nothing crosses twice.

Reality is close (the legitimacy filter, range law, header-gated release, and
shell writer are exactly where they belong), with three leaks:

1. **The settle fact lives on the wrong side** (§3): native knows; JS infers.
   One event closes it.
2. **The hidden depth is computed in JS from `Dimensions.get('window')`**
   (host ~532, planHiddenExcursion) while native owns every other geometry
   derivation. This is also exactly where G-ROTATE lives (module-scope
   Dimensions, recorded R6 gap): the excursion target should be
   `snapTo('hidden')` and native computes depth from its own screen geometry —
   deleting both the JS duplicate of the screen-height fact and one rotation
   hazard.
3. **The 12×200ms retrying snap** (Page ~634) is a JS babysitter for a native
   gap: commands against an unattached track are dropped, so JS polls. The
   principled shape is a one-deep native command latch — attach applies the
   pending command — making "snap before attach" a queued fact instead of a
   race. (The attach-gated restore coordinator already IS this pattern on the
   JS side; the asymmetry is the tell.)

Also note: facts currently arrive over TWO channels — NativeEventEmitter
(edge, sigma, shell warning) and reanimated-sampled state (drag, settle).
Choose one per fact class and say so; the split is why the settle sampler
looks load-bearing when it should be a backstop.

**Severity:** low-medium individually; the class matters.
**Class:** each side keeping a private copy of a fact the other side owns.
**Migration cost:** small, native-touching — bundle with the next deliberate
physics change (per the map lesson: never as a naked cleanup).
**What NOT to do:** move the fence or excursion PLANNING native "for
consistency" — paint/policy decisions are correctly JS; only the facts leak.

---

## 6. THE DATA MODEL — five dialects of "declare a scene"

_Verdict 2026-08-08: LANDED as `SCENE_DECLARATIONS` — every column a required literal, parity proven by a 284-test oracle._

**From-scratch:** ONE scene-declaration row consumed everywhere:

```
scene: {
  role: 'root' | 'child',  resident: boolean,
  body: { kind: 'lane' | 'parts' | 'mounted', source },
  chrome: { Title, Strip, Extras, grabHandle, insets },
  skeleton: { rowType, stripHoles },        // exists (foundation spec)
  seats: { … },                              // exists (descriptor table)
  worldJoin: boolean,                        // exists (foundation spec)
  keyboard: policy,                          // G-KEYS
}
```

**Reality — the dialects:** foundation-spec rows (rowType/strip/worldJoin);
the motion descriptor table (seats); the persistent-header registry
(Title/Strip/Extras); `MOUNTED_BODY_COMPONENTS` (+ its derived set); the
host's three hand-kept scene sets; the scene-input published-lane protocol
(surfaceKind 'list' spec, entry stamps opt-in per writer); the list-parts
hooks (polls/home — a body "kind" that exists only as two hardcoded hook
calls); `ResolvedLegList` deliberately loose-typed because the three body
dialects don't share a row type. Adding a scene today touches up to six
tables plus inline conditionals; the failure mode F872 documented (set/map
disagreement → silent blank body) exists pairwise between every two of them.

The worldJoin two-layer design (scene declares membership as a REQUIRED
literal; entry carries participation) is the counter-example that proves the
point: it is the one place a new fact was added AS a schema column with an
exhaustiveness guarantee, and it came out clean (R7 checkpoint).

**Severity:** medium-high (this is where the next silent bug is cheapest).
**Class:** N registries each holding one column of the same logical row.
**Principled fix:** grow the foundation spec into THE scene row (it already
has the exhaustiveness guard and the worldJoin precedent); each registry
becomes either a column or a derived view of it; `body.kind` makes the
lane/parts/mounted trichotomy a declared fact, deleting the host's
per-scene ternaries and giving `ResolvedLegList` a real discriminated union.
**Migration cost:** moderate but incremental — one column at a time, each with
the guard extended; no behavior change until the host reads the row instead
of its sets.
**What NOT to do:** a parallel "track metadata" table local to the host
(the F872 note already refused this — the shared table is the home).

---

## THE RANKED SHORTLIST (leverage ÷ risk)

1. **TrackMotionAuthority** (§3) — one queryable store of motion/rest facts;
   surface-runtime seed asks it. Closes F2 as a CLASS, collapses four rest
   definitions, gives the fence its store. Moderate cost; land post-burn-in
   with the F2 repro as falsifier.
2. **One scene row** (§6 + host item 4) — fold the host's scene sets, body
   kind, and chrome/padding policy into the foundation spec. Low risk (data
   motion, guard-extended per column), kills the silent-disagreement class.
3. **One paint resolver** (§1) — merge readiness + skeleton + hidden
   presentation into a single total `resolvePaint`; the host executes.
   Directly discharges F3's "host wiring unfalsified" debt.
4. **Host extractions** (§4, items 1–2) — motion controller + transaction
   bridge out of the .tsx. Mechanical; unlocks 1 and 3.
5. **Native settle event + native hidden depth** (§5) — bundle with the next
   deliberate physics change, never as a standalone cleanup.

## NOT ACCRETIONS — correct, do not churn

- **The two chrome twins** (invisible touch twin in content + visual twin in
  the shell slot) — each is load-bearing; the design made two-headers
  unrepresentable. The prose history reads like accretion; the shape is right.
- **The freezeUntilSnap branch in the ack bridge** — documented as the hidden
  family's ROUTING. CORRECTED 2026-08-08: R8 ruled the OPPOSITE of the earlier
  note here — the freezeUntilSnap plan kind is NOT deleted; it is the hidden
  family's live routing (see the R8 checkpoint). It stays.
- **Scroll memory surviving element eviction** — deliberate (offset outlives
  the React instance); the asymmetric lifetime is the feature.
- **The entry-stamp opt-in on the scene-input lane** — per-writer adoption is
  the correct migration shape, not indecision (R6 ruled it).
- **The 700ms deadline, 12×200ms snap budget, 120ms pagination throttle** —
  all carry F874 provenance notes; the numbers are argued, not vestigial.
  (The snap retry's EXISTENCE is a §5 finding; its tuning is not.)
- **`lastGoodListRef` (frozen world)** — a real store mandated by OA6.1.
- **The legitimacy filter's clamp-signature design** — classify the disease,
  not the writers; genuinely principled, both edges.
- **Opacity-detached hidden legs / MVCP disabled / uncapped backoff attach** —
  each is a measured lesson with the receipt attached.
- **The liveness probe sampling DELIVERED values** — the "never re-derive or
  the audit compares the derivation with itself" rule is exactly right and
  should be the template for future audits.

## One meta-observation

The strongest pattern in this codebase — pure decision + falsifier + host
executes — is applied everywhere EXCEPT the two places with the most state:
the paint composition and the motion facts. Both shortlist items 1 and 3 are
just "apply the system's own best pattern to its own two remaining holes."
