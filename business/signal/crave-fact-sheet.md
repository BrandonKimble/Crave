# Crave — Business Fact Sheet (grounding for the blueprint work)

> Built 2026-07-12 from two deep repo/docs recon passes. This is the Crave-side
> anchor for every "does this advice transfer?" judgment in the claims ledger and
> blueprint. Dense on purpose. Sources: repo code + plans/ + business/ docs.

## What the product is (one breath)

iOS-first food-discovery app. Objective, evidence-backed, never-personalized,
no-pay-to-rank ranking of restaurants AND individual dishes per city ("Crave
Score", 0–10, built from Reddit-mined + LLM-extracted testimony). Map+search-
first UX with a best-in-class custom map. Heroes Google/Yelp/Beli structurally
can't do: **dish-level cross-restaurant search** ("best birria in the city"
ranks dishes, not venues), freeform NL search ("spicy vegan ramen with patio",
"with gruyere"), best-near-me-now, map-as-filter. Secondary flywheel: polls
(graduate into the Score at close), shareable ranked lists, friend graph, DMs,
photos.

## The category-defining fact

**The Score rebuilds from the founder-controlled pipeline with ZERO live
users.** Crowd is ~4/10 load-bearing, not existential. Day-one valuable to a
single user — no cold-start. This separates Crave from every social/network
analog (Beli) and every single-session AI-wow app in the advice corpus. It's a
_content/data product_ wearing a consumer-app body.

## Business model as decided (owner, FINAL 2026-07-09; reconfirmed 2026-07-12)

- **HARD paywall at onboarding end, card required to enter the app. Gate
  everything** (thin-free-shell shelved).
- **$7.99/mo pay-now** (no trial) **or $39.99/yr with ~1-week store-managed
  intro free trial** (annual only; Apple charges at trial end, Apple sends the
  pre-charge reminder).
- Freemium = documented future pivot, fully built + env-gated, one-commit-sized
  (`@AllowUnentitled` on free surfaces + `BILLING_TRIAL_DAYS>0`). Never the
  reverse of "loosen later": the loosen-risk warning was consciously overridden
  for capital-return speed.
- Bootstrapped, solo, **no ad budget** → distribution must be organic
  (UGC/creators/content/ASO). No pay-to-rank ever; B2B (restaurant analytics,
  sponsored polls outside the ranking) = Phase 2, post-density.

## Monetization machinery — state of the world

**Built + hardened:** append-only access-grant ledger (one truth), global
entitlement interceptor with `off|log|enforce` modes, dual-rail billing
(RevenueCat iOS + Stripe-webhook web; Stripe _client_ rail deleted 2026-07-09),
`access.enforced` client axis, non-dismissible PaywallScreen route (renders
prices from the RevenueCat offering, Apple-3.1.2-compliant terms line incl.
"N-day free trial, then $X. Auto-renews."), mid-session lapse takeover, account
deletion, webhook idempotency, TRANSFER handling. Test-Store E2E passed.

**Not yet live / gaps:**

1. Server gating is `log`, not `enforce` — today a user routes to main, not
   the wall. One env flip when ready.
2. **Real App Store products blocked on Apple Developer enrollment** ($7.99/
   $39.99 + annual intro trial exist only as $9.99/$79.99 Test-Store
   placeholders; production RC iOS key empty; dev client needs an RC-pod
   rebuild).
3. PaywallScreen is a functional skeleton — flow final, visual/copy re-skin
   pending. This is THE conversion surface for a hard-paywall business.
4. Legal URLs are placeholders (example.com in onboarding; cravesearch.com/
   privacy not live). App-review blocker if unfixed.
5. Win-back/gift day-grants exist in policy but have no callers (dormant by
   design). `BILLING_TRIAL_DAYS=0` stays.

**Onboarding as built** (17 steps, single linear machine): hero ("Know what to
order, not just where to go") → attribution → dining frequency → budget →
animated money-wasted graph → occasion/vibe → cuisines (min 3) → dining goals →
barriers → use-case carousel → notification preference → rating ask → city pick
(Austin/NYC live; else waitlist branch) → Clerk auth (Apple/Google/email) →
username. **No paywall step inside onboarding** — the wall is a separate
post-onboarding route. Personalization answers currently feed nothing
monetization-related; they are quiz-as-investment steps.

**Margin lever:** iOS nets ~85% (Apple Small Business), web Stripe ~97% —
steering renewals/returning users to Apple-legal out-of-app web checkout is a
~12-point margin swing (web purchase rail would need rebuilding; only webhook
ingestion survives).

## City economics (the numbers the multi-city question turns on)

- **Austin (launch city) full archive load ≈ $600 expected ($560–780 band)**,
  LLM-dominated, at ~$37 per 1,000 posts (Gemini Batch ≈ 50% off) + Google
  Places tail $25–160 (~$0.044/new restaurant) + relevance pre-filter <$1/city.
  (Earlier $217 estimate was superseded by the red-teamed audit.)
- Austin corpus: r/austinfood 27,120 posts all-time / 15,652 in the 3-yr
  window; ~2,416 place-backed locations so far; projected ~1,600–4,600 unique
  restaurants at full load. Discovery is deep in power-law saturation (91–97%
  re-mention rate) — the marginal post mostly _thickens evidence_ on known
  places rather than finding new ones.
- **City #2..N is mechanized:** one command onboards a market (TomTom county
  polygons + PostGIS), one command seeds it; idempotent re-runs; dark-launch
  (load → validate → flip visible). Cost scales with corpus size; plan is a
  ~3-year window per market. NYC (city #2) = proportionally more than $600.
- Archives on hand: **783 city/food subreddits (~70GB) downloaded**, 1,240-sub
  relevant worldwide manifest classified (~187GB available). The relevance
  gate makes noisy general-city subs cheap (28–57% keep rates → 40–70% token
  savings).
- Ongoing per-city collection: scheduler-owned cadence + Gemini Batch, bounded
  by budget not user traffic; on-demand collection triggers on low-result
  searches. Exact $/mo not yet stated; structurally small.
- **Implication for the one-city-vs-many debate: seeding ~every major US metro
  (say 25 cities) is plausibly a $15–40k one-time LLM spend + pipeline
  babysitting, NOT an army or a year.** The real constraints are score-quality
  calibration per market (constants flagged "re-derive against production
  density"), Places enrichment, and validation eyeballs — not raw dollars.

## Moats (defensibility inventory)

1. Dish-intelligence layer (structurally absent from Google/Yelp/Beli).
2. Objective evidence-receipted score (auditable quotes + deep links) — the
   integrity brand; never personalized, never pay-to-rank.
3. Founder-controlled data pipeline + classified 1,240-sub manifest + tuned
   extraction/relevance/scoring stack (the thing a copycat must rebuild).
4. Best-in-class custom map (~9.7k-line iOS LOD engine, shipped).
5. Personal layer OFF the objective score: ranked shareable lists + friend
   graph = the word-of-mouth surface.
6. Abuse-resistance: restaurants Google-Place-gated, dishes plausibility-gated;
   users affect ranking weight, never existence.

## Needs-users vs needs-no-users (for any growth-loop argument)

| Rebuilds with zero users                                                                             | Needs live users                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Score (stable+rising), rankings, search, map, "Known for", evidence quotes, autocomplete, enrichment | Polls + graduation into Score                                      |
| On-demand collection (founder can trigger)                                                           | Lists/curation, friend graph, DMs, photos, notification engagement |

## Launch-blocking checklist implied by all of the above

Apple Developer enrollment → real ASC products + intro trial → RC prod key +
dev-client rebuild → paywall re-skin → legal URLs → flip `ENTITLEMENT_GATING=
enforce`. (Everything else is already in place.)

## Verified fact (2026-07-12, web): metro-level ad geo-targeting EXISTS

TikTok Ads Manager supports US location targeting at DMA/metro (210 Nielsen
DMAs), city, and zip level, configured at the ad-group level (up to 3,000
locations); **Spark Ads inherit this targeting**. Meta ads support city+radius
targeting (long-standing). ⇒ "Post organic, spark the winners aimed at the
Austin DMA" is a real mechanic — the one-city UGC geo-dilution objection has a
paid-amplification answer at small dollars. (Sources: TikTok location-targeting
help doc; TikTok DMA announcement; Strike Social guide.)

## Open score-quality caveat

Score constants (ρ=0.5, acclaim/praise weights, upvote premium, opinion
floors) are explicitly "re-derive against production density" — final tuning
happens after the full Austin load, before launch judgment on feel.
