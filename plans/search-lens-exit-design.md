# The Lens Exit (Leg 5 / A2-S2) — clean-room design

2026-07-15. Input: ledger A1/A2 (lens laws), the phase-2 verdict §2 (resolver KEEP+EXTEND;
sibling-world + true-up machinery DELETES), the open-now list⇄map parity constraint
(2026-07-14: open filtering for paginated worlds is SERVER-side filter-before-paginate —
a client lens over loaded pages undercounts; that WAS the parity bug), and the listSort
precedent (already "keys the world (cache) but never the identity"). Owner ratifies
before any code.

## 0. The problem, stated once

`filterVariant.openNow` is part of WORLD IDENTITY today: flipping the chip mints a new
worldKey, routes cache→derive→network, and the derive tier synthesizes a SIBLING world
client-side from coverage features (search-open-now-variant.ts) that is later "trued up"
over the network. Consequences the identity placement causes by construction:

- Session semantics treat an open-now flip as a DIFFERENT world: entry.desire, dismiss/
  restore, and the episode vocabulary all see two worlds where the user sees one view
  toggled.
- The sibling derivation is a parallel data path (synthesized response + provisional
  true-up) — the exact "second way to compute the same fact" disease Q-2 just killed in
  the reveal pipeline.
- Every new fact-projection filter (price is already in; sort arrived with lists)
  re-raises the same question and can re-mint the same machinery.

## 1. The ideal (A2, reconciled with the pagination constraint)

**A LENS is out of IDENTITY, not necessarily out of the SERVER.** Two axes that today
are conflated:

- **Identity** (what world is this?): query/entity/list identity + retrieval-semantic
  filters (includeSimilar — it changes what the search MEANS) + tab. This is what
  entry.desire stamps, what dismiss/restore preserves, what the episode presents, what
  `areTuplesEqual` compares for session coercion.
- **Lens** (how is this world currently viewed?): openNow, priceLevels, rising,
  listSort, marketKey — fact-projections and orderings over one world. Lens state
  lives BESIDE identity, flips never create sessions/worlds, and X/dismiss ignores it.

**Fetch mechanics are free to slice server-side.** The parity fix stands: a paginated
world's open slice is fetched filter-before-paginate. The resolver caches lens-slices
UNDER the identity — `worldCache[identityKey].slices[lensKey]` — so a lens flip is a
slice lookup (warm) or a slice fetch (cold), never a new world. listSort already
behaves exactly like this ("keys the world (cache) but never the identity"); the lens
exit GENERALIZES that precedent to openNow/price/rising and names the axis.

**The sibling-world + true-up machinery DELETES** (search-open-now-variant.ts, the
derivation tier's openNow arm, buildOpenNowCoverageEntry plumbing): the honest
server slice replaces the synthesized sibling. The one derivation that SURVIVES is the
includeSimilar page-1 flip — includeSimilar is retrieval-semantic (identity), and its
derivation is a true identity-adjacent cache move, not a lens.

**A1 at one chokepoint:** the presented slice feeds BOTH the rows preparation and the
marker projection from ONE set (the mounted store already is that chokepoint — the
slice lands there once; `listIdSet === mapIdSet` under every lens is then structural,
and the §8.8 invariant becomes grep/spec-assertable).

## 2. The vocabulary change (the actual cut)

- `SearchDesiredTuple` splits: `{ identity: SearchQueryIdentity, tab, committedBounds,
  lens: SearchLens }` where `SearchLens = { openNow, priceLevels, rising, listSort?,
  marketKey? }` and `filterVariant` keeps ONLY `includeSimilar` (or dissolves into
  identity outright).
- `buildSearchCardsWorldKey` = identity + tab + bounds + includeSimilar. The lens is
  NOT in the world key; the slice cache keys `(worldKey, lensKey)`.
- `areTuplesEqual` for session coercion (M-1) compares IDENTITY only — a lens flip
  over a live session is not even a revise; it is a slice presentation.
- `entry.desire` unchanged in shape (it already stamps identity, not filters).
- The reconciler's `variant_rerun` class splits: identity-revise (includeSimilar,
  mid-pagination) vs LENS-FLIP (a new, lighter class: no world teardown, no episode
  camera work — the map re-slices markers, the list re-slices rows, ONE joint).
- The episode (reveal pipeline): a lens flip stages a `revise` txn with plan `{paint,
  mapFrame}` — exactly the soak-proven toggle/revise vocabulary; nothing new.

## 3. What deletes

- `search-open-now-variant.ts` (67 lines) + the derivation tier's openNow arm +
  `buildOpenNowCoverageEntry` (the provisional sibling + true-up path).
- The `open:{0|1}` axis in every world key (trace keys shrink).
- The open-now special-casing in coverage plumbing where it exists solely to seed the
  sibling synthesis.

## 4. Laws preserved / RED gates

- Parity (the 2026-07-14 fix): the LIST world's server-side filter-before-paginate is
  the slice fetch — unchanged behavior, new vocabulary. The RED proof re-runs: open
  pins count === open cards count on a paginated world.
- §8.8 `listIdSet === mapIdSet` under every lens: spec at the mounted-store chokepoint
  + a harness assertion (compare mountedResults ids to the marker catalog ids under
  openNow on/off).
- M-1: a lens flip never pushes/revises a session (harness: entryId stable across chip
  flips — extends the existing M-1 check).
- Dismiss/restore: X from a lensed world unwinds identically to unlensed (the lens is
  presentation state; whether it RESTORES with the origin is an owner call — default:
  lens resets on session exit, survives within-session pops).
- L-2 (same arc): identity-stable warm state (snapshot-equal ⇒ reference-equal at the
  slice cache), stack-pinned eviction (a world referenced by any live entry's desire is
  unevictable), memory budget (slice cache bounded per world; LRU across worlds).

## 4b. S2 sizing facts (comprehension sweep, 2026-07-15 — post-S1)

- The flat cache keyed by the full tuple key ALREADY IS `(worldKey, lensKey)`,
  flattened: `cache[identity+lens]` ≡ `cache[identity].slices[lens]` for lookup
  semantics. S2's real content is therefore NOT a cache restructure — it is (a) the
  reconciler's LENS_FLIP class, (b) identity-grouped bookkeeping for L-2's
  stack-pinned eviction, and (c) key-shape hygiene. Do not rebuild the cache topology
  for its own sake.
- `buildSearchCardsWorldKey` has exactly 3 consumer files (resolver ×2 call sites,
  reconciler ×1, derivation ×2 — the derivation dies in S3). The sweep is small.
- ⚠️ S3 LATENCY CONSEQUENCE (must be an explicit owner-visible tradeoff, not a silent
  regression): the sibling derivation makes open-now flips INSTANT on natural/shortcut
  worlds (client-derived from coverage features — which ARE full-world open truth for
  the map). Deleting it makes those flips a network slice fetch. Options at S3:
  (i) accept the fetch (with the episode skeleton covering it), (ii) keep a
  COVERAGE-PROJECTION fast path as the lens's optimistic first paint with the slice
  fetch as the settle — one world, no sibling identity, the derivation code shrinks to
  a projection helper. Lean (ii): it preserves instant feel AND kills the
  sibling-IDENTITY disease (the true-up machinery dies either way; what survives is a
  pure projection over the presented world's coverage).

## 5. Migration (strangler)

- **S1 vocabulary**: introduce `SearchLens` + the split tuple with a compatibility
  shim (filterVariant getters derive from lens) — zero behavior change; tsc guides the
  consumer sweep. World keys keep the lens axis in S1 (identical runtime behavior).
- **S2 slice cache + identity keys**: worldKey drops the lens axis; the resolver gains
  the `(worldKey, lensKey)` slice table; the reconciler's lens-flip class lands; the
  sibling derivation still present but unreachable (lens flips route to slices).
- **S3 deletion**: the sibling/true-up machinery + the open key axis + the shim.
  Grep-invariants gains: zero `search-open-now-variant` occurrences; worldKey builder
  contains no `open:` token.
- Each slice: matrix + the parity RED proof + the §8.8 assertion + tsc/suites.

## 6. Open items (verify in S1, never assume)

- The strip chip's write path for openNow on NATURAL/SHORTCUT worlds (today a tuple
  write): confirm every caller flows through one setter that can retarget to the lens.
- Coverage worlds (openNow SHORTCUT mouth): the openNow *shortcut submit* is an
  IDENTITY (a shortcut world whose retrieval is open-scoped) — NOT a lens flip over
  'best restaurants'. Verify the mouth vocabulary survives the split (the shortcut
  tab axis stays identity; only the in-results chip becomes a lens).
- Mid-pagination lens flips: the slice fetch is page-1-scoped; confirm the list resets
  to page 1 under a lens flip today (believed yes — the parity fix's two-phase shape).
- The dismiss-restore lens default (owner call at feel-pass; ship with reset-on-exit).
- `rising`'s classification: it changes the RANKING SOURCE (trending), which is arguably
  retrieval-semantic — but it groups with open/price in today's coverage-variant key and
  reads like a view toggle in the strip. Default: LENS (with open/price); flag for the
  owner at ratification.
- Natural-world price/rising slice fetches: the list-world API takes priceLevels
  (leg 10); confirm the natural lane's variant fetch covers the same axes (believed yes
  — today's variant_rerun re-queries with filters; the slice fetch is that fetch,
  re-keyed under the identity).
