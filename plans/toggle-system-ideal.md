# THE TOGGLE SYSTEM — ideal shape v2 (design of record, post-red-team)

> **v2.1 RECONCILIATION (2026-07-08, third red-team) with the strides/layers plans**
> (`plans/trigger-nav-ideal-verdict.md` S-A..S-E + `plans/world-camera-multilocation-
foundation.md` L1-L5, being executed by a parallel session starting S-B, S-A in
> parallel): the two ideals are complementary halves of ONE algebra — the verdict
> blesses revise-class triggers as already-ideal, and THIS coordinator is the
> revise-protocol machinery behind that blessing; no stride dissolves it (verified:
> L2's camera track never enters the toggle finalize path — revise never moves the
> camera; S-C's readiness contract is the PUSH join, a different lifecycle; the
> world doc's §4 anti-pattern list never names the coordinator). Ownership split:
> **the strides own push, this plan owns revise.** Consequences:
>
> 1. **Gate 1 items 1/2/4 (engine + adapter + polls) run NOW** — zero file overlap
>    with S-A/S-B (verified against both plans' demonstrable file sets).
> 2. **The search-this-area section below is HANDED TO THE S-A SESSION** — both its
>    halves land in files S-A rewrites (`search-world-reconciler.ts` classifier/
>    decoration, the STA submit runtime, `use-search-submit-entry-owner.ts`), and
>    S-A's fold of bounds-source into the writer/classifier is the same edit. ONE
>    correction to that section (I2 compliance): the kick must NOT take a
>    trigger-passed `presentationIntentKind` — the classifier already DERIVES
>    `'search_this_area'`; route the derived kind through `scheduleToggleCommit`
>    reconciler-internally. Reset-at-capture + the settleMs-per-kind knob stand.
> 3. **Gate 2 waits for/rides S-C** (the warm-restore threading runs through
>    `SearchOverlayChromeHost`, which S-C's searchRoute-shell dissolution re-homes;
>    the generic `initialSegmentLayouts` API survives). Add the polls strip to the
>    Gate 2 feel-check (it consumes the same primitives).
> 4. The failed-enter unwind (`closeSearchResultsSession`) is superseded by
>    entry-pop under S-B/S-C; the `onDismissed → pop-to-origin` contract is
>    unchanged.
> 5. Engine purity addendum: the coordinator's `U2:` insertion markers (commit-time
>    mutation flush, D6c enter-start) and the S4c port-deletion seam belong to the
>    SEARCH ADAPTER, never the pure core.
> 6. Polls adoption addendum (code-verified): the adoption DELETES the
>    refetch-on-state-change effect (`polls-feed-runtime-controller.ts` ~:336-348;
>    press handlers call the engine directly); `refreshPollFeed`'s internal
>    latest-wins seq guard covers the flat-store stale-landing gap; do NOT wire the
>    engine's 'failed' event there (the retry ladder never rejects — its deferred
>    freshness error is the intended UX); preserve `skipSpinner`/never-empty-list +
>    the visibility gate; socket/market/deep-link refetch paths stay OUTSIDE the
>    engine.

Owner commission (2026-07-08): one toggle-strip primitive containing EVERYTHING that
makes a toggle strip good, placeable on ANY page, toggle-agnostic and logic-agnostic.
No increments — cut over to the full long-term shape. v1 was red-teamed by two
adversarial reviewers (runtime lens + consumer/data lens); every FLAW/MISSING is
resolved below. v1's uncorrected claims are struck; do not build from v1.

## The four concerns (unchanged — the insight held)

1. **Visuals** — pill/chip/strip look and motion.
2. **Interaction protocol** — optimistic press-up, restarting quiet-window debounce,
   seq-guarded cancelable consequence, visual-sync finalize, lifecycle events.
3. **Consequence** — what the toggle does (four standard shapes, below).
4. **State** — where the value lives (bus / react-query / component state).

The primitive = 1+2, agnostic to 3+4.

## Layer 0 — `src/toggles/toggle-interaction-engine.ts` (pure core)

Extraction of the TR5 coordinator's state machine (its logic moves verbatim; the
React hook structure becomes closures). Red-team corrections baked in:

```ts
export type ToggleInteractionState<TKind extends string> = {
  kind: TKind | null;
  pendingPresentationIntentId: string | null;
};
// IDLE_TOGGLE_INTERACTION_STATE moves HERE (generic); the search contract re-exports
// its instantiation. No `unknown` anywhere: the engine is generic on TKind only.

export type ToggleRunner = (args: { intentId: string; signal: AbortSignal }) =>
  | { awaitVisualSync?: boolean }
  | Promise<{ awaitVisualSync?: boolean } | void>
  | void;

createToggleInteractionEngine<TKind extends string>({
  onInteractionState?: (state: ToggleInteractionState<TKind>) => void, // bus adapter sink; OPTIONAL
  onLifecycle?: (event: ToggleLifecycleEvent<TKind>) => void,          // OPTIONAL
  settleMs?: number, // default 300
}) => {
  begin(runner: ToggleRunner, { kind: TKind }): void,
  cancel(): void,               // seq bump + abort in-flight signal + idle publish + 'cancelled'
  notifyIntentComplete(id): void,
  getState(): ToggleInteractionState<TKind>,
  subscribe(listener): () => void,   // pageless reactive pending (no bus required)
}
```

- **`startPatch` is DELETED, not parameterized** — red team proved zero callers pass
  it; the optimistic flip is the caller's own state write at press time. Dead surface
  dies.
- **Async runners are first-class**: a Promise-returning runner is awaited with the
  seq guard re-checked after; **rejection → `'failed'` lifecycle event + finalize**
  (pages route 'failed' to `announceFailureIfOnline` — the toggle system and the
  failure standard meet here, by design not accident). `cancel()` aborts the runner's
  `AbortSignal`; a consequence that can't abort (fired refetch) still gets its landing
  dropped by the seq guard — "cancel = stop caring, and the engine guarantees the
  stale landing can't publish through IT" (the consequence's own store, e.g.
  react-query, may still update its cache; pages using keyed caches are fine — the
  key the user is ON is what renders).
- **What stays OUT of the engine**: the perf-scenario attribution block and the
  `[T1DBG]` timing logs move to the SEARCH ADAPTER (they are search-rig concerns);
  `logger` (generic app util) may stay. The engine gets its own jest spec (fake
  timers): burst→one commit, cancel-mid-window, visual-sync, runner-throw AND
  async-rejection → 'failed', superseded landing, settleMs override.
- Both sinks optional: a page with no bus and no cover uses `subscribe`/`getState`
  for pending UI (or ignores it). No no-op boilerplate.

## Layer 1 — visuals (upgrades specified by the red team)

- **`FilterChip`**: gains `accessibilityState` passthrough (price chip's `expanded`),
  a `style` prop (price's asymmetric right padding), a **`variant: 'default' |
'quiet'`** ('quiet' = the muted informational N-similar species — never
  accent-filled), and children as a render-prop of `active` (chevron color swap).
- **`FrostedFilterStrip`**: slot keys become STABLE (child `key`-based, not
  positional index) — the conditionally-mounted N-similar chip currently shifts the
  Rising chip's hole identity. Also: chips keep search's no-hitSlop (FilterChip's
  `hitSlop={6}` overlaps adjacent chips by ~4px in an 8px-gap strip — remove or gate
  it).
- **`SegmentedToggle`**: gains (a) `onAccessibilityTap` flip-next (the inline pill
  has it; dropping it breaks VoiceOver), (b) a GENERIC warm-restore API —
  `initialSegmentLayouts?: LayoutRectangle[]` + `onSegmentLayoutsChange?` — so the
  pill is correct on the FIRST frame after a chrome swap (the warmup-host handshake:
  SearchOverlayChromeHost measures a throwaway copy against a detached bus;
  SearchFilters joins and re-emits the cache — that threading generalizes to the
  array schema).

## Layer 2 — adapters

- **Search adapter** = the existing coordinator file reduced to: engine instance +
  bus sink (`publish({toggleInteraction})`) + the REACTIVE `pendingTogglePresentationIntentId`
  bus selector (consumers need it reactive; it stays) + lifecycle handler wiring +
  the perf-attribution/T1DBG blocks. Public API unchanged (`scheduleToggleCommit`,
  `cancelToggleInteraction`, `notifyIntentCompleteRef`) — reconciler port, cancel
  call sites (clear/close/blur), and both bus readers survive untouched (verified).
- **Pageless adapter** = nothing: engine + optional subscribe. A react-query page
  writes `declareToggle`-style press handlers with async runners; 'failed' →
  `announceFailureIfOnline`.

## Layer 3 — the consequence taxonomy (v2: FOUR shapes; two v1 misfiles corrected)

| Shape                  | When                                                              | Engine mode                                               | Examples                                                                                                     |
| ---------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **local slice**        | all states' data loaded; toggle = re-render                       | settleMs 0 (or Layer-1-only, see below)                   | favorites segments over a loaded list                                                                        |
| **derive-from-cache**  | new state is a projection of a cached payload                     | debounced, zero network                                   | search tab switch (both tabs in ONE response — exists); include-similar first flip (page-1 union — verified) |
| **keyed-cache switch** | toggle swaps a query key; instant when cached, refetch when stale | debounced; async runner; landing seq-guarded              | bookmarks listType, profile segments (react-query keys, 60s staleTime)                                       |
| **remote re-resolve**  | toggle changes the QUERY                                          | debounced + cancelable + visual-sync where a cover exists | search chips, search-this-area, **polls Live/Results**                                                       |

- **Polls Live/Results was MISFILED in v1**: it is a network refetch per tap TODAY
  (`refreshPollFeed` on every feedState/sort/type/time change) with NO debounce — the
  exact disease the engine prevents. Polls adopts the engine (remote shape, async
  runner, no visual-sync); burst-tapping Live↔Results stops firing N requests.
- **Panels rule (anti-ceremony, red-team D)**: a control adopts Layer 2 ONLY when a
  real consequence exists (network, cover, cancelability). Bookmarks/profile segment
  switches and form fields are Layer-1-only today (react-query already coalesces
  keyed switches); they adopt the engine the day they gain a real consequence.
- **Data doctrine (wording corrected)**: cache worlds by identity; derive when the
  toggle is a projection; A→B→A is instant **within staleness/eviction bounds**
  (openNow worlds stale after 60s; cache holds 8 unpinned worlds; the provisional
  present-then-true-up path covers the miss). Blanket prefetch of every toggle
  permutation stays REJECTED (combinatorics × pagination); pagination fetches only
  the active state's next page.

## Search-this-area (spec completed per red team — **OWNED BY THE S-A SESSION, see v2.1 header; apply the derived-kind correction**)

- Rides the coordinator with kind `'search_this_area'`. Verified safe: bounds are
  press-time in both worlds (tuple write captures them; commit re-reads the tuple);
  the map cover is NOT new (today's press already applies the same interaction cover
  synchronously); adding the kind breaks no exhaustive switches (only two files
  reference the union; widen `deriveToggleKindFromFilterDelta`'s return type and the
  kick param — type-list-disease check done).
- **`kickRerunThroughCoordinator` is PARAMETERIZED, not forked**: it gains
  `{ kind, presentationIntentKind, onResolutionBegan? }` so the area path carries
  `presentationIntentKind: 'search_this_area'` and keeps firing
  `runEnterForegroundEffects` exactly as today's `area_rerun` branch does. One
  function, no second kick, no semantics drift.
- **`mapMovedSinceSearch` resets AT CAPTURE (press/tuple-write time), not at
  finalize.** Reset-at-finalize (v1) imports two existing bugs: a pan during the
  in-flight window gets wiped (button vanishes while screen ≠ searched area), and a
  FAILED search clears the retry affordance. Reset-at-capture fixes both: post-press
  pans re-set the flag naturally; failure leaves it set. (Fuller ideal — derive the
  flag from camera-vs-desiredTuple.committedBounds comparison so no imperative flag
  exists — noted for the map-movement pass; reset-at-capture is correct and minimal
  now.) The kind-dispatching side effect needs a named home: a small
  `search_this_area` case in the foreground submit runtime's lifecycle SUBSCRIBER
  (not the pure transport resolver, which stays kind-agnostic).
- The 300ms quiet window adds latency to a today-synchronous dispatch — feel-check
  item; if the eye rejects it, `settleMs` per-kind override (area: 0) is a declared
  knob, not a fork.

## Cutover (two gates, one effort, no legacy survivors)

**Gate 1 — test-gated (no sim), v2.1 scope:** extract engine + spec; rewire search
adapter (API-identical); polls onto the engine (remote shape, per addendum 6). Full
runtime suite + engine spec + tsc green. (The area/kick work moved to the S-A
session — v2.1 header item 2.)

**Gate 2 — SHIPPED 2026-07-09 (4243d1c5, net −375 lines; sim-verified — a Reanimated array-shared-value read-after-write bug in the N-segment pill was caught+fixed on this pass: geometry now derives from plain-JS layoutsRef, never a .value read-back). Owner finger items remain (pill feel ×4 surfaces, chrome-swap first frame, N-similar mount, polls hitSlop, burst feel). Original spec:** FilterChip upgrades + port the five search chips;
SegmentedToggle warm-restore + a11y tap + REPLACE the inline pill; stable strip slot
keys. Feel-check script MUST include: pill travel + burst-tap coalescing; chip flips;
chrome-swap FIRST FRAME (cold reveal after sheet close — the warm-restore case);
N-similar chip mount/unmount (Rising hole stability); search-this-area press (cover +
latency verdict); polls Live↔Results burst.

Deletions at the end of gate 2 (none earlier, none skipped): the inline pill JSX +
segment styles + layout-cache pill fields in SearchFilters, the five inline chip
Pressables, the coordinator's inlined state machine. No legacy path survives either
gate; the two gates exist because they have different oracles (tests vs the eye), not
as resting states.
