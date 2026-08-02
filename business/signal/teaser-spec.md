# The Teaser Screen — spec (v1, 2026-07-26)

> The onboarding payoff beat: one non-interactive screen, after the recap,
> before auth + the wall. Designed from the full system audit (search wire
> shapes, score mechanics, extraction vocabulary, density reality) + the
> conversion evidence (ledger/03, panels/p1, onboarding-doctrine.md). Owner
> constraints honored: NO Reddit quotes; not a frozen app surface; optimized
> for the onboarding moment, not for showing the app.

## The concept: "Your first answer"

The teaser is not a demo of the app — it is the first time Crave _answers_ the
user, personally, with real data. It demonstrates all three true
differentiation claims in one composition: we rank the DISH (not the
restaurant), the number has RECEIPTS (counts, not opinions), and the city was
ranked BEFORE you arrived (no cold start).

### Composition (top to bottom)

1. **Setup line (their words, mirrored):**
   "You said you never turn down **tacos**. In **Austin**, the answer is:"
   — uses their FIRST `always-craving` selection + their city. (Fallback
   ordering below guarantees this never lands on thin data.)
2. **The #1 card — fully revealed, real component language:** dish name +
   restaurant name, decile-colored rank badge "1", score at 1 decimal
   (display-capped 9.9), and the receipt line built from real fields:
   **"{mentionCount} mentions · {totalUpvotes} upvotes"**. No blur, no
   redaction — the specific real thing is what triggers belief (and the
   "what app is this" reflex). Optional photo if the strip has one; the
   composition must look intentional with zero photos (cold-data reality).
3. **The scope tease (honest curiosity gap):** ranks #2 and #3 as compact,
   fully-real rows (name + score, receding scale), then a fade-out gradient
   and the line: **"…and {totalFoodResults − 3} more {tacos}, every one
   scored."** Scope-tease, never content-tease: nothing individual is hidden;
   the list visibly _continues_. (Nicole's blur kit is prohibited; the fade
   communicates continuation, not redaction.)
4. **One personalization echo from a second answer** (pick the strongest
   available): dietary → "every pick here is {gluten-free}-friendly";
   else budget → "all inside your {$$} range." Proof the quiz mattered.
5. **The claim line (the outcome, one sentence, true):**
   "One number for every dish in the city — built from real endorsements,
   never personalized, never paid for."
6. **CTA:** "Unlock the full ranking" → auth → wall. (Sell the result, not
   the install — Hunter's law. The paywall screen then mirrors the same quiz
   language, closing the loop.)

Dish-vs-restaurant duality: the teaser LEADS dish — it's the category claim,
the moat, and `always-craving` answers are dish-shaped. The restaurant side
gets one clause at most ("and every restaurant, ranked too"); don't split the
emotional moment across two subjects.

## Why this shape (evidence chain)

- Show-the-aha-cheaply: Sway's concession + Halo's 16.5% double paywall;
  Crave's aha is precomputed and free to render (P1 verdict).
- One screen, non-interactive: Nicole's +50% (browse-before-wall hurts) — we
  take the credibility of real components without the browsing risk. A frozen
  live surface invites dead touches (frustration at peak conviction) and edges
  toward browse; a curated composition built FROM real card components gets
  authenticity without either.
- Show #1 fully / tease scope only: the Cal AI name-on-screen lesson
  (specificity drives curiosity + belief); blur/redaction = the discarded dark
  kit, brand poison for an evidence-receipted product.
- Kill trigger stands (P1): if the teaser measurably lowers trial-start OR
  trial→paid, remove it.

## Engineering contract

**New public endpoint** — the existing search stack CANNOT serve this:
`/search/*` is Clerk-guarded and entitlement-walled, and the teaser renders
pre-auth. Add a dedicated controller (pattern: the share/public controllers):
`POST /teaser/preview` — public, aggressively rate-limited, no PII.

- **Input:** `{ city, dishIds: string[] (ordered, from always-craving),
priceLevels?: number[], exclusions?: string[] (dietary) }`.
- **Server:** hardcoded map from the 14 `always-craving` option ids →
  canonical food entity terms (resolve server-side; `brunch` maps to the
  meal-period attribute path, `sweets`/`salad-bowls` to category terms — or
  simply exclude those three from teaser eligibility, fallback handles it).
  Runs the internal ranked query per the search executor with a
  **`minimumVotes` floor** (start ≥5; tune at full-load density) so a
  2-opinion 9.9 can never headline (the evidence floor is otherwise unbuilt).
- **Output (trimmed, no entity graph):** `{ top: {dishName, restaurantName,
score, mentionCount, totalUpvotes, photoUrl?}, runners: [{dishName,
restaurantName, score} × 2], totalCount, appliedEcho: 'dietary'|'budget'|null }`.
- **Fallback chain (never render an empty state — it kills the payoff):**
  user's dish #1 → dish #2 → dish #3 → generic "Best dishes in {city}"
  browse (always returns rows in a covered city). The setup line adapts
  ("Here's where Austin starts:").
- **Caching:** cardinality is tiny (cities × 14 dishes × 4 price bands) —
  cache whole payloads server-side with a daily TTL; the screen is then one
  cheap GET. Warm the cache at deploy.
- **Ordering:** by `craveScoreExact` (percentile), never the rounded display
  score (ties desync). Rank shown = this query's ordering — the same
  score-vs-rank semantics as the product ("score is intrinsic, rank is the
  search's answer"), so the claim is honest.

## Honesty rails (from the audits — hard constraints)

- Counts (`mentionCount`, `totalUpvotes`) are real per-dish fields: USE them.
- NO stored per-city rank exists (percentile pool is global): never claim
  "#3 of 214 in Austin" as a stored fact; the rendered rank is this query's
  ordering, which is exactly what the product means by rank.
- NO Reddit quotes (owner rule; also the only verbatim-quote surface is the
  Discussions section, which the teaser must not render).
- NO poll/vote-count claims (polls need live users; day-one ≈ zero) and NO
  rising/trending claims (noise-dominated at thin evidence).
- NO occasion-list promises ("date night" / "business lunch" vocabulary does
  not exist yet; only groups/kids/patio/meal-period/price/diet are canonical
  today via Google enrichment).
- Display score caps at 9.9 for non-perfect (existing util); 1 decimal.

## Build items this creates (ordered)

1. `POST /teaser/preview` public controller + service + payload cache +
   rate-limit tier + the always-craving id→term map.
2. The teaser screen in onboarding (new step type `teaser`, rendered from
   real card visual components; step sits after the processing/recap step,
   before `account-live`; visible only for live-city selections; feature-flag
   until the endpoint ships).
3. Warm-cache job + `minimumVotes` floor tuning after the full-load density
   pull.
4. (Separate, for the home surface, NOT the teaser: mint canonical occasion
   attributes — map `good for groups`/`good for children` from Google
   booleans now; `date night`/`business lunch` need corpus mining + curation
   before the contexts chips can honestly gain list promises again.)

---

## v2 (2026-07-26): BUILT — and two corrections from the owner's red-team

**Correction 1 — the attribute vocabulary claim was WRONG.** The audit agent
read prompt files and the Google enrichment list but never queried the
database. DB reality (local, pre-full-load — prod is denser): 650 ACTIVE mined
attributes; `romantic` is active with aliases including "date night", "date
night spot", "date night vibes" (90 restaurants); `celebratory` absorbs
special-occasion/birthday/anniversary (16); `good for groups` 1,674;
`family-friendly` 36; `solo dining` 9. "Business lunch" has no single
attribute but composes from serves-lunch/quick-lunch + register attributes.
⇒ Date-night home lists are buildable TODAY; the contexts chips are better
backed than v1 claimed. Meta-rule recorded in doctrine: data-existence claims
are verified against the DATABASE, never against code/prompts.

**Correction 2 — the copy was feature-bragging.** "One number for every dish in
the city — built from real endorsements, never personalized, never paid for"
sells our machinery, not the user's outcome (and "never personalized" reads as
a MINUS to users trained to want personalization). v2 register rules: second
person; scenes, not features; verbs of finishing; numbers only as labor-done-
for-you proof; mechanism words (endorsements, personalized, ranked-corpus)
stay OUT of onboarding copy.

**v2 copy (as built):**

- Kicker: YOUR FIRST ANSWER
- Headline: "The best {tacos} in {Austin}" / sub: "according to everyone who's
  actually eaten them:"
- #1 hero card: dish, "at {restaurant}", score, receipt "{N} raved · {M} agreed"
- #2/#3 compact rows (fully real — no blur anywhere, per owner)
- Labor line: "That's {count} {tacos} read, argued over, and scored — an hour
  of review-digging you'll never do again."
- Claim: "This is dinner from now on: pick a craving, get the answer, go."
- CTA: "Unlock every answer"

**Build state:** SHIPPED (uncommitted): `apps/api/src/modules/teaser/`
(public POST /teaser/preview, @AllowUnentitled, no Clerk guard; term map for 11
dish ids; one-hop category expansion mirroring search; MIN_MENTIONS=3 floor;
6h in-memory cache; fallback chain dish→dish→browse; display cap 9.9; ordered
by percentile_rank). Smoke test (local DB, Austin/tacos): #1 migas taco @
Veracruz All Natural 9.2 — a locally-credible answer. Mobile:
`OnboardingTeaser.tsx` + teaser step between notifications and account-live
(hidden on waitlist track), graceful degrade on any failure, ONBOARDING_VERSION 6. City scoping v1 = location.city names (Austin; NYC boroughs) — replace with
place-geometry scoping when Texas-wide launch lands. Rate-limit tier: TODO
(public endpoint currently unthrottled beyond platform defaults — add before
launch).

## v2.1 (2026-07-26): failure law + copy red-team fixes

**Failure behavior corrected to THE app-wide load-failure law** (owner spec,
scene-load-failure-policy): error edge → announceFailureIfOnline (the ONE
shared modal, offline-aware, no auto-retry, no page-local retry button) →
body renders the static outcome fallback (flow never blocks; Continue stays
enabled) → re-presentation is the retry (step unmounts on back-nav, refetches
on return). Served-null ≠ failure (quiet degrade, no modal).

**Copy red-team fixes:** mirror line restored ("You said you never turn down
{tacos}." — the personalization proof that earns the word "answer");
"everyone who's actually eaten them" → "the people who've…" (honesty);
receipt counts THRESHOLDED (≥10 mentions shows "{N} raved · {M} agreed";
below, "locals keep bringing this one up" — low counts read as weakness);
labor line thresholded (≥15: "{N} contenders, one clear answer — that's the
digging you'll never do again."); browse headline "The dishes {city} swears
by"; account-live screen rewritten to continue the CTA thread ("Unlock every
answer" → "Your answers are waiting"), fixing the unlock-lands-on-a-form
micro-bait-and-switch.

## v3 (2026-07-26): dual-set teaser (owner direction), numbers copy removed

Owner cuts applied: receipt line ("N raved · M agreed") REMOVED — score + outcome
only; labor/count line REMOVED (no coverage numbers anywhere).

**Dual composition (implemented):** the dish hero moment stays singular
(mirror line → headline → #1 card → #2/#3 rows), then a SECOND compact set of
3 restaurants framed by the user's declared context: "And your date-night list
has already started:" (or cuisine framing when no context attr clears the
floor: "Where Austin goes for Mexican:"). Specificity ladder per set:
context∧cuisine → context → cuisine, first rung with ≥3 rows wins; selectivity
order for contexts = date-nights(romantic 36 ATX) > special-occasions
(celebratory) > family > group-hangs (good-for-groups ≈ quarter of the city —
weak differentiator, last). Answer consumption doubles: city + always-craving

- contexts + cuisines now all feed the payoff (budget/dietary/spice = v-next
  filters). Real-data validation (local DB): romantic∧mexican → Fonda San Miguel
  alone (n=1, ladder falls through); romantic → J Carver's/Uchi/Uroko (credible);
  mexican → Cuantos Tacos 10 / Ramen Del Barrio / Nixta Taqueria (superb).
  Known noise: good-for-groups tail (coffee shops); scores bunch at 9.9+ pre-
  recalibration (known re-derive caveat).
