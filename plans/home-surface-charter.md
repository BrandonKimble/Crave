# Home surface charter (ratified decisions — 2026-07-26)

The persistent page becomes HOME: a Spotify-browse-style surface of
app-curated lists (global-with-rotation + made-for-you). Polls demotes to a
regular page/tab. This file records the owner-ratified decisions that the
build must honor; the full build plan comes later.

## Ratified decisions

1. **Header**: home shares the polls header law EXACTLY (finest place whose
   polygon covers ≥2/3 of the viewport; straddle → "this area"). Fully
   dynamic — it says "Upper West Side" when that is true. The place-verdict
   must be extracted to a shared seam when home is built (it currently rides
   inside the polls feed response) — never forked.
2. **Home content granularity**: shelves floor at CITY. Header may name a
   neighborhood while shelves say "Best of Austin" (scoped to the containing
   city). Zoomed out beyond city: home shows the user's home city's shelves
   plus a pick-a-city shelf of live cities. PLUS: one dedicated dynamic
   section keyed to the user's current location/viewport — when it sits
   inside a neighborhood with sufficient mention density, that section
   builds more-granular lists best-effort ("Best near you in the Domain").
   The architecture must be prepared to handle ANY granularity; the city
   floor is a content-quality policy (a list must be earned by data — the
   no-fake-estimates law applied to curation), not a structural limit.
   Neighborhood shelves generally unlock when measured mention density
   supports them — an earned unlock, not a config toggle.
3. **Polls granularity**: stays fully granular (presence facts + cold-start
   promise). The §6 place-selector's deferred server-side leg (areas with
   polls + counts under the viewport, GROUP BY place_id — no schema change)
   upgrades as a fast-follow of this arc, sharing the "what's under this
   viewport" primitive home needs anyway.
4. **Lists are first-class**: app-curated lists reuse the ListDetail surface
   (toggle strip: open now, price, sort) via viewerRole: 'viewer' + a system
   owner; savable to the user's lists, shareable, showable on profile. No
   sorting controls on home itself; possibly a restaurants/dishes toggle.
5. **Passive location inference** (from the onboarding session's ratified
   rule): home city and travel mode are INFERRED from behavior (search/map
   dwell), never asked. Away-from-home detection flips the dynamic section
   to the visited area.

## TomTom neighborhood capability (proven 2026-07-26)

Reverse geocode with entityType=Neighbourhood returns real neighborhoods
with own bbox + stable geometry id (live-verified: 40.787,-73.9754 →
entityType Neighbourhood, "Upper West Side", geometry id 0000554e-…).
The catalog's lazy sketch-on-first-attention already consumes exactly this
shape; neighborhoods appear in the header as attention reaches them. A
grid-probe audit of nameable neighborhoods in NYC + Austin lives in the
ledger entry of the same date.

## Prep work (before the home build proper)

- Lane generalization: the docked lane is scene-agnostic; ONE registry
  constant names its target (polls today, home later). No poll-named
  identifiers in the runtime layer.
- Deny-list metadata-derived; parentSceneKeys single constant.
- Sequencing decision owner still owes: build home on the current lane
  architecture vs wait for the one-track substrate (an active prototype).
- Polls' legacy FrostedFilterStrip conversion lands with its demotion.

## Curation recipes (constructible from existing data; build subset first)

Per-cuisine/per-dish best-ofs (onboarding-seeded) · context/job lists from
extracted attributes (date night, business lunch, group/kids) · price-band
variants · Trending (21-day rising component) · Hidden Gems (high score,
mention count below city median) · New on the Scene (recent first-mentions)
· "Because you love X" (sibling co-inclusion edges) · weekly personal
rotator ("Your Weekly Tasting" — Discover-Weekly analog: untried dishes
from loved cuisines, refreshes Mondays) · global monthly rotation ("Best
breakfast taco in Austin — July") · programmatic cover art: photo collages

- per-list-type color extraction from existing Cloudinary assets.
