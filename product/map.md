# Map

> **Rolling canonical vision — not a changelog.** Keep this file thin and *current*: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

The Map is Crave's primary discovery surface: an interactive Mapbox map where every result restaurant is a marker whose color, badge, and level-of-detail (pin vs dot) encode the objective Crave Score and search rank. It doubles as the location filter — the visible viewport bounds ARE the geographic query. The Crave Score ranking shown here is objective and global, never personalized.

The map itself, restaurant search, the open-now/price filters, and poll voting are free — this is the tier that beats Google at what Google does. The dish intelligence layer (dish-level markers/scores, dish search, rising/trending) is the paid Crave+ hero, so any map mode that surfaces dish-level signal is a gating candidate, not a free feature.

## Marker model — pins, dots, badges, colors

- **Pin vs dot level-of-detail.** Each restaurant marker renders as either a tall bottom-anchored PIN (promoted, top-rank) or a small centered DOT (demoted). Role is a pure per-marker opacity crossfade; both pin and dot are resident at all times and never added/removed on camera motion.
- **Promotion budget = top 30.** Only the top 30 by rank within the on-screen set get full pins; the rest stay dots. Crowding self-resolves as a stair-step (one in / one out) on zoom.
- **8 score-bucket colors (green→orange-red).** Pin sprite, result-list rank pill, and dot all derive color from one source of truth (`apps/mobile/src/utils/quality-color.ts`): 8 buckets in 5-point increments over display scores 60–100 (95+ vivid green … 60–64 orange-red). Color carries fine-grained objective-quality signal at a glance.
- **In-viewport RANK badge vs out-of-viewport SCORE badge.** Inside the submitted-search viewport a pin shows its frozen search RANK (1..99, contextual); pan outside that viewport and it shows the intrinsic 0–100 SCORE (stable as you move away). Ranks above 99 fold to a shared "99+" overflow sprite. The number is baked into the pin sprite so pin and number order together as one unit.
- **Active/selected pin recolor.** Tapping a marker swaps its pin to an active-color sprite (#ff3368) keeping the rank number. Selected pins are force-promoted, so a tapped restaurant ranked below 30 doesn't demote to a dot on pan.
- **Badge/list parity.** The map sorts markers by high-precision exact Crave Score so the map badge order matches the results-list position even on display-score ties (two "99.9" restaurants resolve consistently).
- **Name labels on promoted pins.** Promoted pins carry a name label whose opacity tracks the pin's; a collision layer makes labels yield to pin bodies so labels never cover a pin.

## Rendering substrate (the LOD engine)

The map carries a large LOD/rendering subsystem with its own telemetry harness, because smooth pin/dot transitions across pan and zoom are the difference between a premium map and a janky one. The product invariants the substrate must hold:

- **Single authority per marker.** One scalar per anchor drives pin opacity; `dot ≡ 1−pin` and `label ≡ pin` are derived, never separately written.
- **Resident membership.** Pins and dots are always present; role changes are opacity-only and resolve on a wall-clock fade that reaches its target on schedule regardless of frame drops.
- **No jitter, no wiggle, no mid-flight reversal.** No source add/remove during camera motion (which would re-tile the layer and re-snap every pin), and a fade in flight never reverses.
- **Map runtime as an island.** The map render model does not rebuild on overlay/tab switches; map and overlay communicate only through a narrow stable protocol — camera/marker state in, profile-open and selection-clear and marker-lifecycle telemetry out.

A dev-only JSONL telemetry harness is the source of truth for what the map is actually doing — promote/demote counts, pins actually painted, wiggle, frame jank, label-over-pin — with an independent oracle that computes the expected top-30 by Crave rank rather than validating the renderer against itself. A contract gate fails the build on any flash-reversal or any pin/dot add/remove during camera motion.

## Map-based filtering & viewport

- **Viewport bounds ARE the location filter.** Each search query carries the visible NE/SW bounds; the DB filters restaurants within them (spatial index) before ranking. There's no text location parsing — pan/zoom to redefine the area of interest.
- **Open Now + price filter.** A binary open-now filter (current time vs stored hours) and a price-level filter apply before ranking. These are the free power-filters that pair with the map.
- **Attribute/time filtering.** Time/occasion terms ("brunch", "happy hour", "late night") resolve to attribute entities and filter results — a richer layer over the binary open-now toggle.
- **Viewport-polygon coverage.** Coverage pins fetch a wider city-top set beyond the strict search viewport, and the map refetches coverage as the viewport widens on zoom-out so the screen stays populated instead of collapsing to a central blob.
- **Dense-urban strategy.** Dense areas and far-zoom views need a decluttering strategy — clustering, a smarter declutter pass, or a heat view (see Still to decide).

## Map UX directions

- **Marker clustering at low zoom.** When zoomed far out, markers collapse to a central blob and the outer screen goes empty; a clustering/declutter pass (count bubbles that expand on zoom-in) fills the map and handles dense-urban density.
- **Heat / density view.** A score-weighted heat overlay — where the high-Crave-Score clusters in a city are — as an alternate map mode, good for "which neighborhood should I go to."
- **Neighborhood browsing.** A neighborhood overlay or quick-jump turns the map into a browse surface, not just a search-result canvas.
- **"Near me" entry.** A "best near me" launch state centers the map on the user's current location.
- **Personal Food Maps.** A visual map of a user's saved/discovered spots — geographic visualization of bookmarks. This is curation of a user's own list, not ranking personalization.
- **Quick actions from a marker.** Tapping a pin opens the restaurant profile; quick actions can extend to directions, order link, save to list, and share.

Two map directions are Crave+ gating candidates because they surface dish-level or trending signal: a **dish-level map mode** (markers/heat for the best DISH near you, not just the best restaurant) and a **trending/rising overlay** (🔥 surging and 🕐 active spots on the map). Surfacing these on the map follows the same free-vs-paid split as everywhere else — dish and trending intelligence are paid.

## Still to decide

- Clustering vs decluttering vs heat view as the fix for dense-urban / low-zoom: which one is the intended approach.
- Map#1 vs list#1 parity: coverage pins (city-wide top) can include restaurants the main results list doesn't, so the top map pin may not match the top list row. Do we exclude coverage from badged pins, or accept the divergence?
- Whether the dish-level map mode is on the roadmap, or the map stays intentionally restaurant-only.
- Whether trending/rising spots get on-map indicators, and how that overlay is gated as a Crave+ surface.
