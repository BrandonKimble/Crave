# Crave Score — Flat 0–10 Native Display Scale Migration

## Status

Execution + canonical record (2026-06-28). Migrates the **public Crave Score display** off the
squished `60.0–99.9` band onto a **flat, native `0.0–10.0` scale**, and reshapes the
displayed-score DISTRIBUTION with a gentle bell curve (see *Display curve* below). The underlying
endorsement→global-percentile RANKING pipeline
(`crave-score-v3-endorsement-redesign-plan.md` + `crave-score-rising-heat-redesign.md`) is
unchanged, and the display reshape is rank-preserving (monotonic) — same ordering, new band and
new spacing.

---

## The decision (locked)

- **Native 0–10 scale, stored.** The score is stored ON the 0–10 scale — NOT the old x10
  convention where a `99.9`-band number was divided by 10 at display time. The stored number IS
  the rating.
  ```
  display_score = displayFromPercentile(global_percentile)   # floor 0.0, perfect 10.0 for the top
  ```
  Floor `0.0`; the top of each subject-type percentile lands at a literal `10.0`. The
  percentile→display map is the **display curve** below (a bell by default), not a bare
  `10 · percentile`.
- **Stored precision.**
  - `display_score` rounded to **2 decimals** (so the 2-decimal score-info sheet reads the stored
    value directly — no `/10`, no re-derivation).
  - `rising` rounded to **3 decimals**, also in 0–10 units (rating points, signed).
- **The x10 convention is DROPPED entirely.** The mobile `CRAVE_RATING_SCALE = 10` divisor is gone.
  Nothing divides by 10 anywhere — not the score, not the delta. The score IS the rating; the delta
  IS in rating points.
- **Display formatting.**
  - **1 decimal** on result cards (e.g. `8.4`).
  - **2 decimals** in the score-info sheet, for BOTH the score and the delta (e.g. `8.42`,
    `+0.18 pts`).
  - **The "perfect 10" rule:** only a literal `10.0` renders as `10`. Everything else caps at
    `9.9` (1dp) / `9.99` (2dp) — a `9.97` never rounds up to a fake `10`.
- **`confidenceLabel` is DEAD.** The old SQL `CASE` that bucketed `display_score` into
  `'strong' / 'solid' / 'early'` is deleted everywhere (scorer, types, search payload, mobile
  score sheet). It was a band artifact with no place on the native scale.
- **Off-map color surfaces use the DISCRETE bucket color** — preview dots and the splash backdrop
  take the decile's flat hex, not a continuous gradient sample.

## Display curve (the percentile → 0–10 map)

`display_score` comes from `displayFromPercentile(percentile)` in the scorer
(`displayCurveVersion 'crave-score-display-v6'`) — a **config dial** with two modes:

- **Bell (default, `bellK = 3.0`).** The inverse-CDF of a truncated normal centered at `5.0` with
  std `bellK`, clamped to `[0,10]`. Most places land mid-scale and the green/red extremes are rare
  (~1-in-20 green at `bellK = 3.0`, ~60% in the gold tiers 3–6). It reaches `0.0`/`10.0` smoothly at
  `p = 0/1` with **no pile-up** at the bounds (a clamped probit would clump the tails). A smaller
  `bellK` = a more pronounced bell, rarer extremes (`2.5` ≈ 1-in-30 green).
- **Linear / uniform (`bellK = null`).** The bare affine map
  `displayMin + (displayMax − displayMin)·percentile` (= `10·percentile`), giving equal-population
  deciles (~10% per tier). Available as a config option; NOT the default.

Both modes are **rank-preserving** — they reshape only the displayed number's spacing, never the
ordering, ties, or the sign of the Rising delta. Changing `bellK` is a config-only re-score (no
migration).

## Why

- **Un-squish.** The `60–99.9` band was chosen to keep "normal" results from feeling like failing
  grades, but it compressed every real score into a ~40-point window that read as one indistinct
  green-ish blob and forced a `/10` translation at every display site. The native `0–10` scale is
  the number users already think in for a rating, with no translation layer.
- **The RANKING is untouched — only the display band and spacing change.** The band swap
  (`[60, 99.9]` → `[0, 10]`) and the bell reshape are both pure functions of the SAME global
  percentile, applied at display time. Rankings and ties are identical; only the *spacing* of the
  numbers moves (the bell deliberately fattens the middle and thins the tails). No endorsement or
  composite dial moves — this is a presentation layer on top of the unchanged percentile.
- **The map color mix is intentional, not flat.** Tiers are cut on the bell-mapped `display_score`
  (`tier = clamp(floor(score), 0, 9)`), so under the default bell the deciles are **not**
  equal-population: the gold middle (tiers 3–6) holds the bulk (~60% at `bellK = 3.0`) and the
  red/green ends are rare (~3–5% each). That scarcity is the point — a green pin signals a genuine
  standout. (The `bellK = null` linear option instead gives the even ~10%-per-tier split; it's
  available but not the default.)

## The 10-tier color ramp (V3 — Apple-green anchored)

Ten color tiers = deciles aligned to the integer rating:
```
tier = clamp(floor(score), 0, 9)        # score in [0,10] → tier in 0..9
```
The canonical source is **`apps/mobile/src/constants/score-bucket-palette.json`** (`default` key —
10 hex + `defaultRgb` 10 `[r,g,b]` triples). NEVER hardcode these colors elsewhere; both
`quality-color.ts` and the `scripts/generate-*-sprites.js` generators import/require this file so
pins, dots, and rank pills stay in lockstep.

Red→green ramp (V3), tier 0..9:

| Tier | Range | Hex |
|---|---|---|
| 0 | `[0,1)` | `#FF5C60` |
| 1 | `[1,2)` | `#FF775B` |
| 2 | `[2,3)` | `#FF8D52` |
| 3 | `[3,4)` | `#FEA245` |
| 4 | `[4,5)` | `#FEB528` |
| 5 | `[5,6)` | `#F8C810` |
| 6 | `[6,7)` | `#D5CA09` |
| 7 | `[7,8)` | `#ABCB31` |
| 8 | `[8,9)` | `#7BCA48` |
| 9 | `[9,10]` | `#35C759` |

The ramp is perceptually OKLab-spaced (not a naive RGB lerp), with a chroma-lifted gold→green
middle so the 4–7 deciles stay distinct instead of muddying into olive. **V3 detail:** the three
anchor colors were sampled from macOS system surfaces with Digital Color Meter in
*display-native* (Display-P3) mode, then converted P3→sRGB so each renders as the exact measured
color on a P3 display — tier 9 is the macOS system green (`#35C759`, renders as P3 `(101,196,102)`).
The vivid-looking hex values are the sRGB encodings; on a wide-gamut screen they render as the
softer measured colors. **Open item:** the map pin/dot sprites are untagged PNGs uploaded to
Mapbox GL — color management of those textures on a real P3 device is unverified (the RN
`backgroundColor` path for card pills/dots *is* sRGB-managed). Confirm on a physical P3 device that
map sprites match the card pills; if GL samples them raw, bake the sprite PNGs with the P3-native
values instead. A `NEUTRAL_SCORE_COLOR` gray is used for null/unknown scores (distinct from the red
bottom tier).

## Colorblind accessibility — viridis (future toggle)

A **viridis** ramp lives in the same palette json under the `colorblind` key (10 hex, purple→yellow,
colorblind-safe + perceptually uniform). It is a **future** accessibility setting that will swap the
active palette wholesale. Do NOT wire a runtime toggle now — the palette is staged and available;
the toggle is a later UX pass. When built, it flips `default` → `colorblind` everywhere the palette
is read (mobile color util + sprite generators), no scoring change.

## File-by-file change list

### Backend (scorer + schema)
- `apps/api/src/modules/content-processing/public-crave-score/public-crave-score.service.ts`
  — set the display band to `displayMin: 0` / `displayMax: 10`; store `display_score` rounded to
  **2dp** (was 1dp); `rising` rounded to **3dp** in 0–10 units; **delete** the `confidenceLabel`
  `CASE` and any references to it.
- `apps/api/prisma/schema.prisma` — widen `display_score` precision to 2 decimals
  (`Decimal @db.Decimal(4,2)` range 0.00–10.00); keep `rising` at `Decimal? @db.Decimal(5,3)`
  (now 0–10 units, ±10 range); **drop** the `confidenceLabel` column / enum if present.
- `apps/api/src/modules/content-processing/public-crave-score/public-crave-score.types.ts` — drop
  `confidenceLabel` from the score/scoreInfo types; ensure the score field carries the 0–10 value.
- `apps/api/scripts/validate-crave-score-fixtures.ts` — update target bands / assertions from the
  `60–99.9` band to `0–10` (deciles, full-range distribution, no `confidenceLabel`).

### Search read path
- `apps/api/src/modules/search/search-query.builder.ts`,
  `search-query.executor.ts`, `search.service.ts`, `search-coverage.service.ts` — SELECT the
  0–10 `display_score`/`rising`; **remove the `confidenceLabel` SQL `CASE`** from the score-info
  build; sort/tiebreak logic unchanged (same percentile order).
- `apps/api/src/modules/favorites/favorite-lists.service.ts`,
  `entity-text-search.service.ts` — read the 0–10 score through the same join; no `/10`.
- `apps/api/src/modules/search/README.md` — refresh sample `craveScore` numbers to the 0–10 band.
- `packages/shared/src/types/search.ts` — `craveScore` / `rising` are 0–10 numbers; drop
  `confidenceLabel` from `ScoreInfoSummary`.

### Mobile
- `apps/mobile/src/constants/score-bucket-palette.json` — canonical palette (already created):
  `default` (soft ramp) + `defaultRgb` + `colorblind` (viridis). Single source of truth.
- `apps/mobile/src/utils/quality-color.ts` — color from `tier = clamp(floor(score), 0, 9)`,
  reading the `default` palette from the json (discrete bucket color for off-map surfaces; the map
  may still crossfade between adjacent tier colors for smoothness). **No hardcoded hex.**
- Score/rating formatting (`quality.ts` + the score-info sheet, e.g.
  `SearchRankAndScoreSheets.tsx`) — **drop `CRAVE_RATING_SCALE` / the `/10` divisor**; render the
  score directly: 1dp on cards, 2dp in the sheet; apply the perfect-10 rule (`10.0`→`10`, else cap
  `9.9`/`9.99`); render `rising` directly as `±X.X pts` (sheet `±X.XX pts`) — no scaling.
- Result cards (`dish-result-card.tsx`, `restaurant-result-card.tsx`) and profile header — read the
  0–10 score/delta directly; remove any `confidenceLabel` UI.
- Map read model + source controller (`map-read-model-builder.ts`,
  `use-direct-search-map-source-controller.ts`, `search-map.tsx`) — pass the 0–10 score through to
  pin/dot color via the tier function; off-map preview dots + splash backdrop use the discrete
  bucket color.

### Sprites
- `apps/mobile/.../scripts/generate-*-sprites.js` — regenerate pin/dot/rank-pill sprites reading
  the `default` palette + `defaultRgb` from `score-bucket-palette.json` (10 tiers). Re-run the
  node generators after the palette is final so on-device sprites match `quality-color.ts`.

## Verification checklist

- [ ] Rebuild the scorer (global `rebuildAllScores()`); spot-check that `display_score` values read
      as `0.x`–`10.0`, 2 decimals stored, and the top subject per type is a literal `10.0`.
- [ ] `rising` stored at 3dp in 0–10 units, centered ≈0, signed.
- [ ] Result cards show the score at 1dp and the delta as `±X.X pts` (no `/10`); the score-info
      sheet shows 2dp for both, and a `9.97` shows `9.97`, never `10`.
- [ ] Map colored across the FULL range — all ten deciles visible, ~10% per tier, no single-color
      blob.
- [ ] Off-map preview dots + splash backdrop use the discrete bucket hex (not a gradient sample).
- [ ] Sprites regenerated from the palette json; on-device pin/dot/pill colors match
      `quality-color.ts` tier-for-tier.
- [ ] `confidenceLabel` is gone from scorer, schema, search payload, shared types, and mobile UI
      (grep returns no active references).
- [ ] Viridis `colorblind` palette present in the json but NOT wired to a runtime toggle.
