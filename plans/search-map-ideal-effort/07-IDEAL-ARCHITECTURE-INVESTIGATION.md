# Canonical-Swap — the ground-up ideal (investigation → design → one-shot implementation)

Owner mandate (2026-07-02): STOP patching. Investigate the whole area, figure out the ideal shape, answer all
questions grounded, then implement the ENTIRE thing in one continuous push — no stop-start, no guards/patches,
delete non-ideal paths, reach the most ideal long-term architecture no matter the effort.

## OWNER TARGET (confirmed)

Toggle = a miniature dismiss-then-reveal of the MAP ONLY (sheet + search bar stay). Press-up → pins+dots+labels
fade OUT together, FAST (search-reveal speed, not slow 300ms). Keep tapping while faded. Settle → they fade IN
together like a fresh reveal; cards sync to the map fade-in. Always lockstep, never partial, no mid-toggle
flash. Previous tab's objects fully LEAVE collision during the swap. ZERO network on a toggle (first search
loads BOTH tabs' ranked + coverage). Network ONLY when a search parameter changes. ONE canonical path for
every trigger (search / toggle / chips / dropdowns=deferredApply / search-this-area); labels in front of pins.

## MY DIRECT FINDINGS (complementing the running investigation workflow)

### Archaeology (owner Q5) — the OLD good toggle REUSED the enter machinery

- OLD toggle (f26102bc, 2026-04-30): on settle it just did `clearStagedPreparedResultsSnapshot()` +
  `commitPreparedResultsSnapshot(createPreparedResultsEnterSnapshot(intentId, 'initial_search',
'interaction_loading'))`. NO bespoke press-up fade, NO under-cover reproject — it reused the STANDARD enter/
  reveal path. Simple.
- The CURRENT complexity is all from the **2026-06-30 rework** (`2dc8f6fa` WIP-freeze): `beginInteractionFadeOut`
  (press-up map fade) + `reprojectCatalogUnderCoverIfReady` (under-cover re-decide) were BORN there — a
  PARALLEL toggle-specific path bolted beside the enter machinery. That parallel path is the bug surface.
- The pin→CA-overlay migration `ed080fd9` (2026-06-29) split pins onto a second channel (the dual-publish
  desync, since fixed by cb97686f) and put pins above GL labels (the z-order regression).
- Per-tab coverage keying (`activeTab` in the coverage requestKey) dates to `9fa642d7` (2026-05-19) — the
  reason a toggle re-fetches coverage (the 12s blank).
- LESSON: the ideal REUSES the canonical enter/reveal machinery for the toggle (like the old shape), plus a
  fast press-up fade, plus both-tab prefetch — NOT a parallel reproject path.

### Collision lifecycle (owner Q2) — dormancy, NOT cease-to-exist

- Objects do NOT get destroyed+recreated. On dismiss/hide: label RENDER layers → `visibility:none` (Mapbox
  drops a hidden layer from layout/placement entirely = out of collision), collision-obstacle/twin layers →
  visibility:none too; pins/dots stay RESIDENT but `ignorePlacement` (≈0 cost) at opacity 0. Sources are NOT
  cleared (resident). `keepSourcesHiddenUntilEnter=true`.
- On reveal (`beginRevealVisualLifecycle` ~6656): wake collision-obstacle layers + label render layers
  (`setLabelRenderLayersVisible(true)`) at preroll while opacity≈0 (flash-free) → `.preparingReveal` →
  presentation ramp.
- The SWAP replaces the resident features (old tab → new tab) via `commitResidentSourceFrameSnapshot` across
  pins/dots/labels/twin. For the owner's "previous objects fully leave collision," the swap must happen UNDER
  COVER (dormant) AND the twin must be fully re-committed to the new tab (no lingering old labels in the twin
  competing). The bare-swap FLASH (`kind=enter pres=1.0 removes=65`) means the swap sometimes applies while
  still VISIBLE — the fade hasn't covered yet. IDEAL: guarantee swap-under-cover ordering.

### Network (owner Q3)

- RANKED: one SearchResponse carries BOTH dishes[] + restaurants[] → toggling ranked data = in-memory (owner
  is right "we already do the calls" for ranked).
- COVERAGE (the dots): fetched per-tab (`includeTopDish = activeTab==='dishes'`, requestKey includes
  activeTab) → a toggle to the un-prefetched tab RE-FETCHES (device-proven 12s blank; toggle-back to the
  cached tab is instant). FIX: prefetch BOTH coverage variants at search commit, cache tab-agnostic → zero-
  network toggle. Network only on bounds/market/entities/filter change.

### The mess (owner Q4) — parallel paths

- Source controller: cached-prepared-frame reveal path (~1512-1617, early-returns) vs live-rebuild path
  (~1619+) = two publish paths.
- Toggle path (use-results-presentation-tab-toggle-runtime.ts) vs filter path
  (query-mutation-orchestrator.ts scheduleToggleCommit) = two wrappers, duplicated fade+stage logic.
- Native: press-up interaction fade + under-cover reproject + enter reveal = three interleaving mechanisms
  (the 2026-06-30 parallel path). Collapsing to ONE canonical enter path removes the interaction points that
  cause the blank/flash/slow-fade.

(The comprehensive adversarially-verified design + file-by-file plan is produced by the
canonical-swap-ideal-architecture workflow; this doc is the human-readable synthesis to implement from.)
