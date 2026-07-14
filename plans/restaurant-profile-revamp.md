# Restaurant Profile Revamp — Google-inspired, hours-first, ideal architecture

> **⏸ PINNED (owner, 2026-07-14):** profile work paused — owner isn't happy with the profile
> yet, but it's "the least of our problems"; to be revisited TOGETHER after the app-wide
> issues are ironed out. Mid-flight Known-for-pills work (shared `knownFor` type + API
> parallel-query wiring) was REVERTED to a clean state; everything below marked ✅ is
> finished, in the tree, and uncommitted. Resume point: "REMAINING" section below.

Owner ask (2026-07-13): use Google's restaurant profile as inspiration; completely
revamp how we do profile pages; **hours especially**; ideal architecture; performance +
best practices. Product vision of record = product/restaurant-profile.md (four segmented
views Overview/Dishes/Discussions/Photos; free core = Crave rating + evidence + price &
hours + quick actions + save + Known-for pills; dish list = paid hero; discussion free).

## The north-star (from Google's profile screenshot)

- Header: name; rating (4.9) + review count (7,021) + drive-time (1 min) + category
  (Brunch restaurant) + price ($10–20) + accessibility glyph, all on compact rows.
- **Hours line: "Closed · Opens 7 AM Tue"** — current state + next transition, one glance,
  color-coded, tap to expand the full weekly schedule.
- Action row (horizontally scrollable pills): Directions / Start / Order / Waitlist.
- Photo collage (1 large + 2 small), then segmented tabs.

## THE HOURS ARCHITECTURE (the hero — the reason this is a revamp, not a restyle)

### What's wrong today (traced 2026-07-13)

- `RestaurantStatusService.evaluateOperatingStatus` (apps/api .../utils/restaurant-status.ts)
  computes open/closed SERVER-SIDE at request time (`new Date()`) and ships only display
  STRINGS: `OperatingStatus { isOpen, closesAtDisplay, closesInMinutes, nextOpenDisplay }`
  (packages/shared/src/types/search.ts:35).
- Consequences: (1) the response is NOT cacheable — status goes stale by the minute; a
  cached profile shows wrong open/closed. (2) The full WEEKLY SCHEDULE never reaches the
  client, so there is no way to render Google's expandable weekly hours (which the product
  doc explicitly wants: "full weekly hours per location in the expanded card"). (3) Status is
  computed against the SERVER clock, and only a single `nextOpenDisplay` string — no
  "closes soon" caution, no structured next transition, no split-interval schedule.
- The raw material IS present: `RestaurantLocation.hours` (JSON) + `utcOffsetMinutes` +
  `timeZone` (IANA). The messy JSON is already normalized to per-day segments server-side.

### The ideal shape — separate IMMUTABLE schedule from EPHEMERAL live status

Best-practice: ship the schedule (immutable, cacheable) ONCE; compute the live open/closed
status CLIENT-SIDE from the device clock via a pure, timezone-aware, unit-tested engine.

1. **Shared type (packages/shared): `StructuredWeeklyHours`** — the immutable schedule:

   ```ts
   interface StructuredWeeklyHours {
     timeZone: string | null; // IANA, e.g. "America/Chicago"
     utcOffsetMinutes: number | null; // fallback when tz absent
     // index 0=Sun..6=Sat; intervals in local minutes-from-midnight, end may exceed 1440
     // for overnight (open 20:00 close 02:00 → {start:1200,end:1560}); [] = closed that day.
     days: Array<{ intervals: Array<{ start: number; end: number }> }>;
     open24h: boolean; // all-week 24h shortcut
     permanentlyClosed: boolean;
     temporarilyClosed: boolean;
     hasSchedule: boolean; // false ⇒ "Hours unavailable"
   }
   ```

   The backend normalizes `hours` JSON → this ONCE (reuse the existing parse), on the
   PROFILE response per location. Cacheable — it changes only when Google Places data does.

2. **Client engine (pure, RED-tested): `resolveHoursState(schedule, nowUtcMs)`** →

   ```ts
   {
     status: 'open' |
       'closed' |
       'opens_soon' |
       'closes_soon' |
       'open_24h' |
       'permanently_closed' |
       'temporarily_closed' |
       'unknown';
     headline: string; // "Open · Closes 10 PM" / "Closed · Opens 7 AM Tue" / "Open 24 hours"
     tone: 'positive' | 'negative' | 'caution' | 'neutral';
     weeklyRows: Array<{
       dayLabel;
       isToday;
       intervalsLabel /* "11 AM–2 PM, 5–10 PM" | "Closed" */;
     }>;
   }
   ```

   - Timezone-correct via Intl.DateTimeFormat(location tz) applied to `nowUtcMs` → local
     day + minutes. Falls back to utcOffsetMinutes, then device tz.
   - "closes_soon" when closing ≤ 60 min out; "opens_soon" when opening ≤ 60 min out.
   - Next-open scans forward across days → "Opens 7 AM Tue" when the next open is another day.
   - Overnight + split intervals handled (the schedule already encodes them).
   - ONE engine feeds BOTH the compact line and the expanded weekly card — one source of truth.

3. **UI: `RestaurantHoursCard`** — compact tone-colored status line + chevron; expands to the
   weekly schedule (today bolded, split intervals, "Closed" days, "Open 24 hours"). Recomputes
   on mount + on a low-frequency timer so the status stays live without any refetch.

### Why this is the ideal (performance + correctness)

- Profile response becomes cacheable (schedule is immutable) — no per-minute server churn.
- Status is always live + timezone-accurate (device clock, location tz) — never a stale cache.
- The weekly card is now possible at all (schedule reaches the client).
- One pure engine = one tested place; RED-provable specs (open/closed/overnight/split/next-day/
  tz-boundary/permanently-closed) lock every state.
- The legacy card `OperatingStatus` (search result rows) stays untouched for now — this revamp
  scopes to the PROFILE detail surface; cards can adopt the engine later (it's shared).

## The rest of the revamp (after hours lands + is sim-proven)

- Header polish: Crave Score hero + evidence row ("Based on N polls · M votes") + distance +
  category/"Known for" one-liner + price `$`–`$$$$`. Google-style compact rows.
- Action row: Directions / Website / Call / Share as scrollable pills (Order/reservation as
  integrations land — product doc).
- Photo collage section.
- Architecture: decompose the Overview into memoized sections (Header, HoursCard, ActionRow,
  KnownForPills, PhotoStrip, EvidenceRow); lazy-load the heavy tabs (Dishes/Discussions/Photos
  fetch only when their tab opens) — don't fetch dish intelligence to render Overview.

## Build order (one change at a time, sim-verified each)

1. `StructuredWeeklyHours` shared type + backend normalization on the profile response (+ RED specs).
2. Client `resolveHoursState` engine + RED-provable spec suite (the hero; independent, testable first).
3. `RestaurantHoursCard` UI wired into the profile Overview; sim-verify all states against real data.
4. Header + action-row + photo polish.
5. Overview decomposition + lazy tabs (perf).

## STATUS (2026-07-13) — HOURS HERO DONE + PROVEN; price/category shipped

✅ **HOURS (the hero) — COMPLETE, ideal architecture, RED-proven end to end:**

- `StructuredWeeklyHours` shared type (packages/shared/src/types/search.ts) + `structuredHours`
  on `RestaurantLocationResult`.
- Server normalizer `buildStructuredWeeklyHours` (apps/api .../utils/restaurant-status.ts) —
  reuses the existing battle-tested parser, encodes overnight as end>1440, collapses
  open-24h, carries permanently/temporarily-closed from `businessStatus` (now selected in
  the profile query). Wired into `mapLocation` + the synthetic fallback location. **Spec 7/7,
  RED-provable** (restaurant-status.spec.ts).
- Client engine `resolveHoursState` (apps/mobile/src/features/restaurant-hours/hours-engine.ts)
  — pure, timezone-aware (Intl), computes live status from the device clock: open / closes-soon
  / opens-soon / closed(+next-day "Opens 7 AM Tue") / open-24h / permanently+temporarily-closed
  / unknown, plus today-first weekly rows with splits. **Spec 16/16, RED-provable** (Chicago
  fixtures pin timezone correctness; overnight, week-wrap, splits all covered).
- `RestaurantHoursCard` (apps/mobile/.../RestaurantHoursCard.tsx) — tone-colored compact line +
  expandable weekly schedule + 60s live-refresh timer. Wired into RestaurantPanel, replacing the
  crude "Hours" detailRow. Reads `displayLocation.structuredHours`.
- ARCHITECTURE WIN: the profile hours response is now cacheable (immutable schedule); status is
  live + tz-correct client-side; the weekly card is possible at all. Legacy `OperatingStatus`
  (search cards) untouched — engine is reusable if cards adopt it later.

✅ **PRICE RANGE + CATEGORY (Google-parity) — shipped (backend metadata was already selected,
just dropped):** `RestaurantResult.priceRangeText` (real Google "$10–20" from
`restaurantMetadata.priceRange.formattedText`, preferred over the fabricated bucket) +
`categoryLabel` ("Brunch restaurant" from `primaryTypeDisplayName`). Extracted in
getRestaurantProfile; the panel prefers priceRangeText for the price line and renders a
category subline. Type-clean; API rebuilt + serving.

✅ **EVIDENCE ROW (product doc §"Score evidence") — shipped (mobile-only, existing data):**
"Based on N mentions · M votes" under the Crave rating, from the profile's existing
`mentionCount`/`totalUpvotes` — makes the score auditable, not a black box. Type-clean.

⚠️ **SIM-VISUAL VERIFICATION BLOCKED THIS SESSION (harness, not code):** every navigation lever
to reach a hydrated restaurant profile is blocked — tab-bar + results-card synthetic taps are
eaten by the native touch layer (same class as the wave-4 tab-sweep finding); the perf
`open_overlay_scene` verb opens the profile SHELL but its data pipeline doesn't hydrate through
the synthetic path. The hours LOGIC is fully unit-proven (23 RED specs across every state); the
pixel render awaits a real-finger open (the owner's finger-test) or a hydration-capable harness.

✅ **HOURS CARD SIM-VERIFIED (2026-07-14):** owner opened Casino El Camino — "● Open · Closes
2 AM" (green, correct at 12:21 AM vs the 2:00 AM close), evidence row + rating hero render.

✅ **ACTION PILLS + META LINE (2026-07-14):** action row rebuilt as a horizontally scrollable
row of Google-style compact pills (the old flex:1 squeeze wrapped "Direction s"/"Add photo");
category + price collapsed into one Google-parity meta line ("Brunch restaurant · $10–20"),
replacing the label/value Price row. Type-clean + lint-clean; verified reload done; awaiting
owner eye.

## REMAINING (next phase — needs sim-visual iteration / owner eye)

- Known-for pills (needs a core_restaurant_entity_signals query); rising badge; review/poll
  count + distance in the meta row; photo collage section (gallery infra already batched);
  Overview decomposition into memoized sections + lazy tabs (don't fetch memberships/mentions
  before the user reaches those sections).

## RELATED (same session): open-now list⇄map parity + unification verdict

The owner's "1 card vs 20+ pins" observation led to the open-now filter-after-limit fix
(S0: filter-before-paginate + hydrate-by-ids, RED-proven, API rebuilt+serving) and the
standing design of record plans/search-results-unification-verdict.md — open-now as a
client LENS over one schedule-carrying set, reusing this revamp's hours engine +
StructuredWeeklyHours. The revamp's architecture generalized to the whole search surface.
