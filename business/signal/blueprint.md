# The Crave Blueprint — business model & distribution canon (v1.1, red-teamed)

> **This is the decision document.** Built 2026-07-12 from 64 founder/operator
> transcripts (~659k words): evidence extraction → cross-examined claims ledger →
> five adversarial panels → **full red team** (11 raw-transcript fidelity audits +
> 4 adversarial lenses + judge; see [redteam/verdict.md](redteam/verdict.md) —
> ~370 claims verified, all decision-driving numbers digit-exact, 33 amendments
> applied in this version, no strategic call flipped). Where this file conflicts
> with any other business/ doc, **this file wins.** Evidence trails:
> [claims-ledger.md](claims-ledger.md) → `ledger/` → `panels/*/verdict.md` →
> `testimony/` + `spine/`. Slim by design: the calls, not the survey.

---

## §0 The model — decided, and why it's right

**Hard paywall, gate everything, card required at onboarding end. $7.99/mo
pay-now, or $39.99/yr with a ~1-week store-managed intro trial (annual only).**

The argument, from the strongest evidence:

1. **Capital velocity is the bootstrap's oxygen.** An annual signup hands you
   ~$40 on day one instead of $8 dripped over months — and Apple pays ~2 months
   late, so front-loaded cash funds next month's growth loop. The winning
   analogs closest to Crave's shape (Cal AI, Glow, Pepai) all ran exactly this
   structure and reinvested the float.
2. **Annual LTV is churn math, not magic.** Using the on-file benchmark
   (~17.5% monthly retention at 12 months), an average monthly sub pays ~7
   times (~$56); under a front-loaded-churn assumption it's worse (~3–6
   payments). Annual collects $39.99 with zero churn exposure for 12 months,
   then renews at ~1.7–2.5× monthly's effective retention (benchmarks: ~30%
   conservative / 40% good / 44% = RevenueCat's lifestyle figure — model on 30%
   until verified). The trial exists to push people onto the annual leg.
3. **Payers are the only honest validation.** Five first-party monetization
   flips in the corpus all moved toward harder gating and more revenue on fewer
   downloads (directional evidence with an echo-risk caveat; the cleanest are
   Cal AI/Grindclock and Quittr — Stronger was free→gated-pro, Cardstock
   paid-upfront→trial-sub, Nicole a wall-hardness A/B). Renewal — not DAU — is
   the metric even acquirers trust.
4. **The door only swings one way.** "Once people are used to something being
   free, they're used to it being free." Loosening to freemium later is one
   commit (built, env-gated); tightening later torches the brand.
5. **Solo simplicity.** One funnel, one wall, no free-tier support load.

Priced in, said plainly: **under gate-everything the polls/social flywheel is
dormant at launch** (a payers-only poll base in one metro rounds to zero); the
Score stands on the founder-controlled pipeline alone, which it was built to
do. The wall itself gets a pre-registered evaluation trigger in §8 — every
subordinate call has reversal conditions, and the central one shouldn't be the
exception.

## §1 Positioning — claim the vertical, never the geography

**Crave is "the app that ranks dishes, not restaurants."** Narrow-but-believable
#1 (Google/Yelp/Beli provide the legible competitor ecosystem; the dish-level
slot is genuinely unoccupied). Austin lives in _hooks, creators, and keywords_
("best birria in Austin") — never in the category claim, because store
positioning can't out-argue an algorithm that won't hold a city **organically**
(paid geo-targeting exists — §6). Content identity: **Austin-insider voice,
always making the dish-category claim** (city+dish in the hook; category in
metadata and pinned comments) — P3.

Clock risk: visible sole-occupant success draws copycat listings in **2–3
months at the fast end (PrayScreen) to ~12 months (Stronger)** — plan on the
fast end. And when the sole-occupant claim expires, the moat is not the slot:
it's the pipeline + evidence receipts a cloner can't fake. Incumbent absorption
(Google/Beli shipping dish-level _ranking_) is a live risk with its own trigger
in §3, and channel-zero content should A/B hooks against the "doesn't Google
already do this?" objection with the differentiation scripted into pinned
comments.

## §2 The wall — price, staging, spec (P1 verdict, red-team-hardened)

- **Hold $7.99 / $39.99 at launch.** No pre-launch price test (statistical
  theater at zero installs). **Pre-configure both offerings in RevenueCat
  before launch; week 3: a $9.99/$59.99 ceiling cohort on 10–20% of new
  traffic.** Honest decision rules for a small sample: the readable signal at
  ~100 purchases/arm is _collapse vs no-collapse_, not fine differences —
  symmetric kill if the variant's install→paid runs <4% while control holds
  ≥4% (read within ~200 paywall views/arm); if reaching 100 purchases/arm
  would take more than ~2 quarters, read the noisier sample rather than
  waiting; migrate the default upward only on a clear no-collapse read.
- **Pre-wall demo = exactly one screen:** a non-interactive real-data teaser
  inside onboarding (3–5 live Austin-ranked dishes drawn from the user's own
  quiz cuisine answers + one evidence quote), after city pick, before auth and
  the wall. This **knowingly defies the corpus's measured doctrine** (Nicole's
  hard-wall-immediately beat let-them-browse by +50%) on the argument that
  Crave's demo is free to show and IS the pitch — so it lives under a hard
  trigger: remove it if it measurably lowers trial-start **or trial→paid**.
  Additionally (Sway's lesson): explain what the app _is_ in one line early in
  the quiz, not only at the teaser. Paywall copy may test the already-built
  "money wasted on disappointing meals" anchor — the corpus's most consistent
  price-ceiling lever.
- **Monthly stays pay-now, no trial.** Flip a 3-day monthly trial only if
  monthly install→paid runs <4% over 60 days while annual trial-start ≥15%.
- **Paywall spec (compliant benchmark stack):** annual default labeled **"Try
  it free"** with **$39.99 the most prominent number**; Blinkist-style trial
  timeline (unlock → day-5 reminder → day-7 billed); "no commitment, cancel
  anytime"; bullet-list layout + a real-app demo-video variant as test #2;
  quiz-mirrored copy; generic Continue; plans ordered by duration.
- **The compliance line is absolute.** The aggressive-monetization toolkit this
  scene teaches (decline cascades, decliner re-prompts with different offers,
  fake scarcity, divide-down price display, trial toggles that obscure
  auto-renewal) is demonstrated across the corpus (Vahe,
  superwall--20251116) and sits squarely in Apple's enforcement zone —
  **externally verified: Apple briefly pulled Cal AI in April 2026 under
  Guidelines 3.1.2(c)/3.1.1/5.6 for exactly these patterns** (TechCrunch,
  MacRumors, 9to5Mac, 2026-04-21). Cal AI had MyFitnessPal behind it and
  survived a brief pull; a gate-everything solo app has no free tier to retreat
  to. We refuse the entire family — and we log the price tag honestly: Pingo
  ran a _profitable_ decline cascade; that is real money consciously forgone
  for survivability and brand. (Apple-native cancel-flow/win-back offers are
  compliant in principle but stay dormant per the win-back-only design —
  forgone value also logged: trial-extension saves ~27% of cancelers at
  Coconote.)

## §3 Launch shape — Austin-only, with an earned bench (P2 verdict)

- **Austin-only on every axis at launch.** One visible city; NYC folds back
  into the waitlist branch; all content/creator/ad dollars Austin-scoped for
  the first 60–90 days.
- **The wall flips on only when:** the full 3-year Austin archive is loaded,
  the score is recalibrated and owner-approved on feel, and **the top 20
  Austin dish-query classes each return ≥10 evidence-receipted dishes.** The
  integrity veto is unconditional — with one carried exception from P2: **if a
  funded dish-level competitor ships multi-city before Austin clears its bar,
  accept a lighter per-city validation pass and disclose the city's coverage
  maturity in-product.**
- **No dark bench at launch.** Seed a **3–5 city dark bench** (~$2–4k) only
  after Austin's full load proves the calibration methodology AND the launch
  blockers ship; bench cities stay invisible until each passes the Austin bar
  (or the disclosed lighter bar under clone pressure).
- **Expansion triggers:** (primary) two consecutive 2-week content cycles with
  flat view→install despite ≥3 format variations WHILE Austin holds ≥35%
  organic share; (overrides) a majority-non-Austin breakout video (≥15k views,
  ≥70% watch-through); a dish-ranking clone shipping multi-city; **or a Big-3
  incumbent (Google/Yelp/Beli) shipping cross-restaurant dish _ranking_** —
  incumbent absorption counts as a clone-trigger equivalent.
- **iOS-only at launch is a deliberate call, stated:** slug pages (§5) show a
  notify-me capture to non-iOS visitors and the funnel counts Android taps —
  that count is the data that later prices the Android decision (§11).

## §4 The content machine (P3 verdict, red-team-hardened)

**Channel zero is Brandon, minimum 60–90 days,** before any creator dollar
(the corpus's strongest consensus; the red team found two _additional_
first-party sources). Calibration honesty: the corpus's full-time operators
took ~90 days to first virality (Bloom) and up to 8–9 months to traction
(Coconote) — at 10–12 h/wk, sub-viral-but-improving weeks 3–8 is expected
progress, not failure.

**Formats, ranked by the conversion ladder** (label: single-operator,
phone-farm-derived data (Flame) — the _ordering_ transfers, the absolute
volumes don't):

1. **Demo-wow screen recordings** (search → ranked dish map): ~0.5–1%
   view→download class; works faceless.
2. **Receipt-backed ranking controversy** ("Crave says this is Austin's #1
   birria — fight me"): converts hardest with a face; the product is named
   inside the claim.
3. **Programmatic listicle slideshows** — **spec-only during channel zero;
   ship only after a top-rung format validates distribution** (P3's gate,
   restored), then run as the retargeting ground game measured against the
   ~0.1% generic floor. Cadence caps: ≤1–2/day per account, visible template
   variation, reach-collapse pauses the factory — never route around it with
   extra accounts. (The Noise "two-pronged" model is borrowed as _structure
   only_ — its engine of account farms, comment seeding, and disguised
   discovery is prohibited below.)

**Validation bar (P3 protocol):** ~15k views + ≥70% 3-second watch-through +
"what app is that?" comment density flags a candidate format; **1–5k views =
keep the format, vary the copy.** (Comment density matters because installs
won't attribute — comments are the top conversion signal.) Failure tripwire:
two consecutive 2-week cycles under ~300 views across ≥3 formats (note: a
repurposed account-health/shadowban diagnostic, not a demand verdict) → shift
weight to community seeding, local press, and geo-fenced validation ads.

**Community seeding is a named launch-moment lane, not a fallback:** one
transparent, founder-voice introduction post on r/austinfood + the main Austin
FB groups at wall-flip, receipts-forward, **owning the Reddit-derived
provenance before the community discovers it** (the Score is built from their
posts and quotes them; they will notice within days — the only defensible
posture is to have introduced yourself first). Standing rule: all founder/team
participation in those communities is own-identity, always.

**Creators: locality-first, then charisma.** Scout the dozens-sized Austin
food/lifestyle pool; screen for engagement quality and camera charisma.
**First deals: 1–2 creators at $300–500/mo trials** (4–8 videos; $20–50/video
base + non-stacking milestones $60/$200/$500/$800; perpetual content rights;
never cap a winner). **"Crave ATX" zero-follower anchor at $500–1,500/mo (no
equity), day 90–150,** only if a trial creator passes the gates founder content
passed with a majority-Austin audience; roster to 3–5 only after the anchor
validates. Outreach is size-dependent: DM for small local creators (our
targets); larger operations use every channel. **No agencies in the
bootstrap/founder-learning phase** (strong majority; one scaled operator uses
them for specialized functions later — irrelevant at our stage).

**The integrity line (non-negotiable — it IS the moat):**

- **Required: FTC disclosure on everything paid.** Every paid creator post
  carries in-video sponsorship disclosure (#ad / "paid partnership with
  Crave") AND the platform's branded-content toggle, as a contract term;
  Crave-side reposts and Sparks of that content carry it too; the Crave-ATX
  bio states official-account status; founder content says "founder of Crave"
  in bio/handle. Deal grid addition: branded-content toggle ON + renewable
  per-video Spark authorization codes (and Meta partnership-ad permissions)
  are payment conditions. One undisclosed paid ranking video is simultaneously
  FTC exposure and the cheapest kill-shot on the no-pay-to-rank brand.
- **Subjects-of-rankings policy:** controversy leads with positive superlatives
  ("#1 birria"); negative framings are always attributed to receipts ("per N
  Redditors"), never voiced editorially by Crave, and never target
  below-size-floor businesses; restaurants that object get the evidence trail.
  Contract terms: paid ranking claims must match the live Score at post time
  (with a correction clause); no undisclosed restaurant comps for covered
  venues.
- **Prohibited:** planted fake-persona comments, undisclosed paid commenters,
  rage-bait, fake demos, disguised-discovery scripting, account farms,
  undisclosed AI personas. (Allowed: receipt-backed claim controversy,
  own-identity pinned comments/replies and comment-section CTAs.)

## §5 The sharing surface — rich-open slugs with two boundaries (P4 + red team)

- **Every shared slug renders its artifact completely — no wall, no blur, no
  login — and renders _nothing beyond the artifact_.** Terminal pages, no
  outbound navigation: that boundary, not teasing, is the anti-freemium
  mechanism for humans. Lists and polls fully rich; single dish fully rich
  incl. score + citywide ordinal; dish-ranking shares as static snapshots;
  restaurant pages dish-names-only.
- **The second boundary is for machines (red-team addition): default
  `noindex` + restrictive robots/AI-crawler policy on all slug pages at
  launch.** Without it, rich-open slugs silently become the indexable "best X
  in Austin" page network we deliberately parked (§11.8) — in the riskiest
  form, AI answer engines serving the answer with no store tap. "Flip to
  indexed" is reserved for that parked decision. Every rendered artifact is
  visibly date-stamped.
- Recipient path: standard onboarding + standard wall (no slug-specific
  offers; non-live cities → waitlist; non-iOS → notify-me capture). Quiz-skip
  fast path is earned by data.
- **Launch-blocking:** minimal shared web template + watermarked share card +
  day-one slug instrumentation (views → store taps → installs, plus
  indexation/AI-citation monitoring). The dinner-table loop can't be
  retrofit-instrumented.

## §6 Paid instruments — never cold UA, always instruments (P5 + ledger 08)

- **Organic geo-concentration is the primary lever** (local creators +
  city/dish hooks — §4's own plan; Symmetry proved geo-concentration can be
  solved organically). **Spark is the only _paid_ lever at metro granularity**
  for the residual national leak that US-English content can't
  language-filter. Verified: TikTok supports DMA/city/zip targeting and Spark
  inherits it.
- **Spark rules:** first dollar only behind an organic post clearing **≥8%
  engagement rate** → $20 DMA-targeted test → $50–100/day while ER >5%. If
  TikTok geo leaks, Meta partnership ads (city+radius) become the whole
  instrument layer; if both fail, the P2 bench earns +2–3 cities.
- **ASA runs from launch week in parallel** (search-intent capture, not UA):
  free credit, then ~$100–300/mo cap on Austin-intent + competitor keywords;
  doubles as product-quality validation.
- The full direct-response ads ladder stays gated on proven Austin LTV.
  Attribution note: platforms optimize on day-0 trial starts but real
  conversion lands ~day 7 — model the lag; don't let the pixel's enthusiasm
  set budgets.

## §7 ASO & App Store — month-0 hygiene, not a growth thesis

Run keyword validation NOW (pre-enrollment) on dish-level + Austin-intent
phrases; expect legacy dominance on generic terms. Title > subtitle >
keyword-field hierarchy, no duplicates. **Category: the Food & Drink lean is
Crave-side reasoning with zero corpus evidence** (the previously-cited
"less contested than Finance" quote was a fabrication caught by the red team)
— the month-0 keyword pull decides it. **Rating ask: SKStoreReviewController
only, never custom UI, moved to the first post-purchase value moment** (first
successful ranked-dish search); the as-built pre-value onboarding ask is the
ratings-harvest pattern in the same enforcement family §2 refuses — flip that
order regardless. Submit the **App Store editorial-featuring nomination** at
launch and each meaningful release (cost ~zero; no strategy built on it).
Custom product pages wait for a paid motion. Country/locale arbitrage = noise
for a metro product.

## §8 Metrics & the kill board (P5 + ledger 10, red-team-hardened)

All corpus-derived bands are **provisional priors until ~200 Austin installs
recalibrate them** — they come from national-audience products.

| Metric                                        | Bands                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Install→paid                                  | <4% sustained two weeks **(min ~200 installs)** = halt scaling and fix; 4–10% okay; >10% scale signal |
| Trial-start (of paywall viewers)              | ≥15% good                                                                                             |
| Trial→paid                                    | ≥30% good; <20% sustained = fix paywall first                                                         |
| Year-1 annual renewal                         | model on ~30%; 40% good (verify RevenueCat ~44% first-party before setting kill lines)                |
| Organic share of installs                     | ≥35% healthy; <20% for 4 weeks = cut paid toward zero                                                 |
| **Top-20%-engagement cohort retention curve** | the day-90 oracle: must flatten                                                                       |
| Austin-local view fraction                    | the geo-discount divisor on every view count                                                          |
| Slug funnel + slug indexation/AI-citation     | decides slug policy evolution                                                                         |
| Listing rating & refund-request rate          | early Apple-health + product-truth signals                                                            |

**Clock anchors (defined):** content-craft clocks start at posting-start;
conversion-denominated gates arm only at wall-live. **Event-calendar rule:**
never open or close a kill/scale/expansion decision across an Austin event
boundary (SXSW/ACL/F1/holidays) — event-week traffic is a visitor-heavy,
renewal-poor cohort of its own. The month-6 price revisit re-dates to "at
ceiling-cohort readability."

**Pre-registered wall-evaluation trigger (the central call gets one too):** if
by day 90 the top-20% cohort curve is flattening AND organic share ≥35% AND
installs have plateaued two consecutive months, run the env-gated freemium
evaluation as a deliberate decision — not as a panic.

**§8.5 The absolute demand model (new — the ratios needed a denominator):**
month-0 desk study of 10–20 real Austin food/lifestyle accounts (view
distributions, follower geography) → a three-scenario payers/dollars
projection through month 6 at both envelopes → an explicit **month-6 success
line in subscribers and dollars**, and a below-viability line that triggers
the P2 expansion read early. Honest baseline from the blueprint's own math: a
single breakout video ≈ 3–7 payers; an optimistic month 6 ≈ $25–45k gross
booked against $6–24k spend — the plan must say what number means "working."

**§8b Retention mechanics v1 (new — renewal is the business, so cause it):**
ranking-change push in the user's saved cuisines + a weekly Austin digest +
poll lifecycle notifications, shipped by ~month 2, each instrumented against
the top-20% cohort curve. The onboarding already collects a notification
preference that currently feeds nothing — wire it.

## §9 The 0–6 month calendar (P5, red-team-hardened)

Budget buys **depth inside phases, never earlier phases**. Growth hours capped
~10–12 h/wk through month 3 (~15–20 h/wk months 4–6 if gates pass) — and the
published cadences are _restated_ for that budget: the corpus's 2-week cycles
assume full-time operators; our kill clocks derive from posts-published, not
calendar weeks. **Pre-registered month-0 tie-break: launch blockers beat
channel-zero content until `enforce` is live** — content that can't convert
loses ties. $1k-envelope relief valve: faceless demo-wow-only content weeks.
The part-time editor/VA pull-forward (product velocity stalled ≥4 weeks) is a
$4k-envelope item. First real hire: an operator at ~8–10 contracted creators.

- **Month 0:** ASO keyword pull; §8.5 demand desk-study; teaser screen;
  paywall re-skin; share slugs + cards + noindex policy; instrumentation;
  channel-zero content starts (builds receipts + waitlist; can't convert yet).
  **Flip the ASC listing to pre-order as soon as V1 passes review** — all
  pre-launch CTAs point at it (pre-orders auto-deliver; waitlist emails
  convert ~0.5%). App Review completeness: reviewer path through the wall
  (sandbox IAP + throwaway credentials), 3.1.2 terms line, live legal URLs at
  submission.
- **Months 1–2:** founder content (demo-wow + controversy; listicle factory
  spec'd, not shipped); launch-moment community posts (r/austinfood + FB, §4);
  ASA capped instrument; first Spark dollars only behind ≥8% ER winners;
  week-3 ceiling cohort; §8b retention mechanics ship by end of month 2.
- **Months 2–3:** creator trials (1–2 × $300–500/mo) only if founder content
  validated a format; listicle factory ships only post-validation.
- **Months 3–5:** "Crave ATX" anchor decision (day 90–150, gated); roster to
  3–5 after the anchor validates; bench seeding (3–5 cities, dark) once
  Austin's bar + blockers are done ($4k envelope).
- **Month 6:** read the P2 trigger honestly (respecting event-calendar
  boundaries); first-hire evaluation; price revisit at ceiling-cohort
  readability; §8.5 success-line reckoning.

## §10 Discarded as noise (weighed, rejected — don't relitigate without new evidence)

Weekly plans (category misfit for an adult, no-urgency, retention-seeking
utility — NOT because the corpus disowns weekly; it's rising for social apps) ·
decline cascades / fake scarcity / divide-down display (the Apple 3.1.2
enforcement family, externally verified via the Cal AI April-2026 pull; the
forgone profit is priced in) · agencies during the bootstrap phase · mass-
creator armies and account farms · undisclosed AI-avatar content · country/
locale ASO arbitrage · waitlists as cold-email capture (~0.5%; use App Store
pre-orders) · press for installs (SEO backlinks only) · chasing national
virality for its own sake (Pingo's ~350–400M views buying ~200k unmonetizable
users) · pre-launch price A/Bs at zero traffic · paid-first growth · invite-
unlock referral schemes (P4's mechanism: a second offer path contaminates the
pay-now funnel and the Apple-proofing posture) · celebrity rentals · studio/
multi-app amortization (Crave amortizes across MARKETS) · equity for the first
creator deal · TV/billboards/events until far post-density.

## §11 Owner decisions & parked items

**Answered:** on-camera = YES, optimizing purely for conversion (demo-wow
stays the faceless workhorse; the face goes where it measurably converts —
controversy/opinion formats). Apple enrollment = submitted, awaiting
acceptance; app completion is the actual bottleneck, so month-0 items that
don't wait on it proceed now.

**Open:**

1. Budget envelope — $1k/mo vs $4k/mo (same calendar, different depth).
2. Ceiling-cohort size — 10% vs 20% of week-3+ traffic.
3. Owner-feel approval of the recalibrated Austin score (gates the wall-flip).
4. Share-slug web infra (rides cravesearch.com with the legal URLs).
5. Launch-date tolerance if share-card work slips (default: slip).

**Parked (deliberate future calls, each with real upside and real risk):** 6. The programmatic "best X in Austin" SEO page network (slugs stay noindex
until this is decided on purpose). 7. Android timing — priced by the slug funnel's Android-tap counts. 8. Web checkout rail (~12-pt margin swing) + web-to-app funnels. 9. Win-back activation (Apple-compliant; saves ~27% of cancelers per the
corpus) — dormant by design until churn data exists.
