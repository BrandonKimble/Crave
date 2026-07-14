# Finger-test checklist — strip engine + edit mode + snap law wave (2026-07-12)

Everything below is BUILT, logic-verified, jest/sim-green, and UNCOMMITTED. One pass
covers Strip legs 2-5 + UI legs 2-4. The eye is the oracle for FEEL; the logic is
already proven. After your pass: Jarvis commits with clean attributions (the map
lens-transport session's files are separate — not co-attributed).

## Strips (legs 2-3)

- [ ] **Polls feed**: strip present the instant the page presents (no snap-in); map
      genuinely visible through every control; edge-to-edge (no white pillars);
      rubber-band overscroll never shows an end; divider sits BELOW the strip.
- [ ] **Favorites home**: same fidelity bar; collapsed teaser unchanged.
- [ ] **Results**: identical to before EXCEPT — scroll the strip midway, flip
      Restaurants↔Dishes → it stays put; dismiss search, re-present → back at start.
- [ ] Header strips also reset scroll on tab-away+return (documented reading of
      "reset on re-present" — flag if you want it scoped tighter).

## Content choreography (leg 4)

- [ ] Polls Live↔Results: press-up → old cards leave immediately → new cards snap in
      (bare white between, never a skeleton). Measured gap ~340-650ms — decide later
      whether you want the Spotify quick-fade on the landing edge.
- [ ] Favorites Recent/Custom + Restaurants/Dishes: instant slice, no visible gap.
- [ ] Kill the API mid-toggle if you're curious: pill and cards revert TOGETHER
      (failure-path coherence).

## Edit mode (leg 5)

- [ ] Favorites → sort Custom → Edit slides in as a strip citizen (pushes, never
      squeezes); enter Edit → toggle row exits from its live scroll position, action
      row (Cancel · Undo/Redo · Save) spreads properly, is static, and can never be
      reached by scrolling when edit is off.
- [ ] Tiles stay TILES: ellipsis fades out / grab handle fades in at pixel-identical
      positions (judge the feel — it's a mode-remount fade, not a two-icon crossfade).
- [ ] Drag a tile across columns (e.g. slot 5 → slot 0): 180ms shuffle, full tile
      visuals while dragging, order persists after Save, Cancel restores exactly.
- [ ] System lists + the per-side All tile never move, never grow handles.

## Snap law (UI legs 2+4)

- [ ] Cold start: home at bottom. Raise home to middle → Favorites (extends) →
      Profile (NO motion) → home returns at middle (the original bug, dead).
- [ ] Drag Favorites to half → Profile opens at half (content swaps in place) →
      home → back: still half. Two seats, one boundary.
- [ ] Dismiss-X from Favorites → home at ITS remembered snap.
- [ ] Search from Favorites-at-half → X-dismiss → exact restore (page+scroll+snap).
- [ ] Leave home at bottom deliberately → away → back → bottom.
- [ ] **Feel-regression candidates (store collapse)**: pollCreation/pollDetail no
      longer echo a prior raised-to-middle drag on hidden re-registration (they open
      at their default). Dismissed docked polls now ALWAYS resurrect at collapsed
      (consistency fix). Flag if either feels wrong.

## Decisions parked with you (none block the commit)

1. Visibility-canon API fixes: private-flip currently deletes collaborators + kills
   share links; enableShare force-flips private→public. Both contradict your canon —
   say go for the API leg.
2. Polls quick-fade-in on the content-ready edge (data says it would land cleanly).
3. Strip scroll reset scope (tab-away counts as re-present — keep or tighten).
