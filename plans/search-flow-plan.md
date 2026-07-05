# Search Flow — the source-agnostic trigger/reveal/dismiss spine (step 2)

**Status:** designed 2026-07-05 from a 3-mapper grounding pass (triggers · origin/stack ·
reveal timing), all findings file:line-verified against current `main`. Step 2 of the
sequencing (after `plans/page-registry.md`, before toggle-primitive extraction).

**The requirement (owner):** one search flow, agnostic to its trigger source. From anywhere —
search bar, shortcut, favorites list, poll-comment entity tap, another user's shared list —
the SAME flow runs: press-up reactive, sheet content swaps in place (never a second sheet),
snap adjusts per flow kind, map pins/coverage load, and the **cards reveal exactly when the
map items START fading in — gated on BOTH being ready, and not a ms later than that**.
Dismiss is equally agnostic: map items start fading OUT on press-up, and the content pops
back to the EXACT trigger origin (page + scroll + snap + anchor), one stack level at a time.

---

## 0. Grounded reality — what already exists (do not rebuild)

**Triggers already converge.** Every trigger path funnels into ONE executor:
`ResultsSurfaceEnterTransactionExecutor` (`use-search-surface-results-enter-transaction-execution-runtime.ts:35`).
The submit-owner API surface (`use-search-foreground-interaction-runtime-contract.ts:23`) already
has `submitSearch` / `submitViewportShortcut` / `rerunActiveSearch`, plus launch-intents
`launchFavoritesListResults` (favorites-as-search IS built — `BookmarksPanel.tsx:541`) and
`launchEntitySearchResults` (poll entity taps — `PollDetailPanel.tsx:967`, with `childAnchor`
return-to-comment). Snap rules already match the registry contract (`preserveSheetState`
→ in-place; else `middle`).

**The child stack is built.** `overlayRouteStack` is an unbounded array with same-key
re-entry (`userProfile(A)→userProfile(B)` = two entries), pop-exactly-one
(`closeActiveRouteState` slices one), nav-tab invariance (nav follows `rootOverlayKey`),
and the §3 nav rule is already structural (`resolvePresentationLaneKind`,
`app-route-presentation-frame-contract.ts:98`).

**The readiness gate exists — for cards only.** `canCommitReveal = cardsReady ∧
nativeMarkerFrameReady ∧ sheetReady` (`search-surface-runtime.ts:170-195`) gates
`canAdmitResultsBody`, with 800/1200ms watchdogs. The map fade-in, however, starts
unconditionally when the reveal request reaches native — so map and cards desync by
0–160ms+. Native already has both signals we need: `reveal_generation_ready`
(catalog projected under cover = ready-to-START) and `presentation_toggle_settled`
(ramp COMPLETE).

## 1. The gaps (all of step 2 is these four)

| #   | Gap                                                                                                                                                                                                                                                                               | Where                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| G1  | **No both-ready reveal joint.** Map fade starts unconditionally; cards gate independently. Owner wants cards-admit == map-fade-START, both-ready.                                                                                                                                 | `search-surface-runtime.ts:170` + `SearchMapRenderController.swift` reveal arm |
| G2  | **Dismiss fade is not universal.** `beginInteractionFadeOut()` fires on toggles + search-this-area; other dismiss paths (child close from favorites-launched results, etc.) never fade the map on press-up.                                                                       | `armDismissMotion` (`search-surface-runtime.ts:740`) vs `closeActiveRoute`     |
| G3  | **Origin capture is global, not per-entry.** Stack entries are `{key, params}`; one origin per dismiss. Nested flows (profile→followers→profile→list) restore wrong. Rich re-push exists only for pollDetail (`resolveChildOriginRePush`).                                        | `app-route-scene-switch-controller.ts:285-310`, session-state-controller       |
| G4  | **Trigger-specific coupling on top of the shared executor.** `prepareSubmitChrome` variants, `entrySurface` micro-behaviors, `shouldPrepareShortcutSheetTransition`, launch-intents on a side path. Works, but a NEW source today means learning five idioms. Plus: no pick mode. | submit-owner runtimes                                                          |

## 2. Design decisions

### D1 — The synchronized reveal joint (G1): START-sync, both-ready, JS owns the gate

> **⚠️ PHASE-1 SCOPE CORRECTION (2026-07-05, pre-build ground pass):** the ENTER lane
> already HAS this joint — do NOT rebuild it. In
> `use-results-presentation-marker-enter-runtime.ts:46-93`: `nativeMarkerFrameReady` is
> marked at native **mounted-hidden** (ready-to-START, not ramp-complete — the mapper's
> "settled" reading was the toggle lane's naming), the native start request is **gated on
> `canAdmitResultsBody`** (the 3-way joint) with a pending-flush on surface change
> (:115-122), and `markEnterNativeStartRequested` flips `coverState:'hidden'` in the SAME
> transition (enter-completion-transport.ts:21-30) — cover lift and ramp start are already
> atomic. Native holds the ramp until the JS-published `enterStartToken`
> (`SearchMapRenderController.swift:5721-5731` `startEnterPresentationIfReady`).
> **Phase 1 therefore starts with ATTRIBUTION, not code:** timestamp-probe the real lanes
> (fresh search enter · favorites-entry · toggle redraw · search-this-area rerun) —
> native `presentation_enter_started.startedAtMs` vs the JS cover-hide/cards-admit tick —
> and fix the lane(s) that actually diverge (suspects: the toggle/rerun lanes, which ride
> `beginInteractionFadeOut`/`reprojectCatalogUnderCoverIfReady` OUTSIDE this machine, and
> any gap between `coverState:'hidden'` and painted pixels). The D1 mechanism below remains
> the TARGET SHAPE for whichever lane lacks it.
> Probe recipe: arm scenario → `trigger` via `submit_shortcut_restaurants` / favorites
> `open_overlay_scene`+list tap / `toggle_tab` → grep `presentation_enter_started`,
> `markEnterNativeStartRequested`, `[pageswitch]` cover events; compare timestamps.

Owner's words are explicit: cards reveal when map items **start** their fade-in, gated on
both ready. So:

- **"Map ready to reveal" = `reveal_generation_ready`** (under-cover catalog projected +
  first QRF done), NOT ramp-complete. Redefine `nativeMarkerFrameReady` to this signal.
- **The joint** stays where the 3-way gate lives (`selectSearchSurfaceVisualPolicy`): when
  `cardsReady ∧ sheetReady ∧ mapReadyToReveal` first becomes true, ONE commit does BOTH on
  the same tick: (a) JS → native `commitReveal(requestKey)` — native starts the 160ms
  presentation ramp; (b) `canAdmitResultsBody` flips — cards paint. Native ARMS the reveal
  (preroll, under-cover work) as today but does NOT start the opacity ramp until
  `commitReveal`.
- **Watchdogs keep their job** (never hang): tier-1 force-flags map-ready, tier-2
  force-commits — both now force the JOINT, not just the cards.
- **Anti-lying guardrail:** two mach-clock emits — native logs `revealRampStartMs`
  (first ramp tick), JS logs `cardsAdmitMs` (admit flip) — and the contract
  `|revealRampStart − cardsAdmit| ≤ 1 frame` is asserted in the harness run, with a
  self-mutation (delay the commitReveal dispatch 100ms) proving it can go RED.
  `presentation_toggle_settled` keeps meaning ramp-complete (finalize/cover-teardown).

### D2 — Universal press-up dismiss (G2)

`closeActiveRoute()` / every dismiss entry point calls `beginInteractionFadeOut()` on
press-up when (and only when) the closing surface owns live map content (results/listDetail
lanes; plain children like settings/userProfile don't touch the map). One rule, lane-derived
— not per-call-site. The pop/restore continues in parallel; the fade never waits for it.

### D3 — Per-entry origins (G3): the stack entry grows an `originCapture`

`OverlayRouteEntry` → `{key, params, originCapture?}`. Capture at `pushRouteState()` via the
existing origin-capture-registry (a scene without a rich provider gets the degenerate
capture — always safe). `closeActiveRoute()` restores FROM the popped entry's capture.
Extend `resolveChildOriginRePush` with `userProfile`/`listDetail`/`followList` branches
(params re-push, like pollDetail's comment anchor). Acceptance flow: push
restaurant → userProfile(A) → listDetail → userProfile(B); three pops restore B's, A's,
restaurant's origins in order, nav tab never moves.

### D4 — The trigger contract (G4): `openSearchFlow`, a thin façade — not a rewrite

One typed entry point wrapping the EXISTING executor:

```ts
openSearchFlow({
  source:  // provenance + chrome variant, replaces entrySurface sprawl
    'searchBar' | 'shortcut' | 'favoritesList' | 'entityTap' | 'sharedList' | 'command',
  request: // exactly one
    | { kind: 'query'; query: string }
    | { kind: 'structured'; targetTab; label }
    | { kind: 'entities'; entityIds; label }        // favorites / shared lists
    | { kind: 'entity'; entityId; entityType; label } // poll entity taps
    | { kind: 'rerun'; presentationIntentKind },      // search-this-area class
  origin?: { childAnchor? },   // per-entry capture happens at push regardless
  selection?: { mode: 'navigate' } | { mode: 'pick'; onPick },  // pick mode (registry §4)
})
```

Existing runtimes become one-line delegates; behavior is preserved (this is convergence,
not migration risk). **Pick mode** threads through the search-mode select-transition: same
UI, same transition; `mode:'pick'` returns the selection to the requester and closes back —
no search flow, no page switch (listDetail "Add places" is the first consumer).

### D5 — Command-bus verbs ride along (methodology phase-0)

- `trigger_search` → `openSearchFlow({source:'command', ...})`, ack + `{transactionId}`.
- `dismiss_search` → the universal dismiss; ack.
- `read_search_state` → `{phase, canAdmitResultsBody, readiness triple, revealRequestKey,
stackDepth, activeSceneKey}` — the honest "what state am I actually in" read.
  Verification of every phase below uses these + the painter probe + the D1 timing emits —
  never the command ack alone (lesson: the stub pass's green-ack-wrong-screen).

## 3. Build phases (each lands committed + sim-verified before the next)

**Phase 1 — The reveal joint + universal dismiss (G1+G2, the feel prize).**
Native: split arm vs start (`commitReveal`), emit `revealRampStartMs`. JS: redefine
`nativeMarkerFrameReady`→ready-to-start, single-tick joint commit, watchdog re-point;
lane-derived dismiss fade in `closeActiveRoute`. Verify: mach-clock subtraction
(`touchUp→fadeOutStart` on dismiss; `|rampStart−cardsAdmit|`) over 10 runs via the
command verbs; self-mutation proves RED.

**Phase 2 — `openSearchFlow` façade + verbs (G4 minus pick).**
Introduce the type + delegate the five existing runtimes; add `trigger_search`/`dismiss_search`/
`read_search_state`. Verify: every legacy trigger drives byte-identical transactions
(replay each entry surface via Maestro id-taps + verbs; diff the transaction snapshots).

**Phase 3 — Per-entry origins + rich re-push (G3).**
Entry shape change + capture-at-push + restore-from-entry + re-push branches for
userProfile/listDetail/followList. Verify: the D3 acceptance flow on-sim (drive with
`open_overlay_scene`, assert restored `{scroll, snap, segment, params}` via
`read_search_state` + painter probe), including the stub scenes.

**Phase 4 — Pick mode.**
`selection.mode:'pick'` through the select-transition; first consumer = listDetail
"Add places" (can land with the listDetail real build if that's sooner). Verify: pick
returns the selection, NO search transaction created, origin restore intact.

## 4. Open questions for the owner (non-blocking to Phase 1)

1. **Reveal-start vs perceived latency:** D1 means the map's fade-in now WAITS for cards
   (today it can start earlier). Net feel should improve (no straggler cards), but if a slow
   data lane ever holds a fast map hostage past the watchdog window, the tier-1 forced joint
   commits both — acceptable? (Recommend: yes; the watchdog ceiling is the guarantee.)
2. **`source` list:** is `'sharedList'` distinct enough from `'favoritesList'` to keep as a
   separate provenance, or collapse? (Recommend: keep — analytics + future gating differ.)
3. **Dismiss-fade lane rule:** confirm plain children (settings/userProfile/followList)
   should NOT fade the map on their dismiss (they never faded it in). (Recommend: confirm.)
