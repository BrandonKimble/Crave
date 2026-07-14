# Hostile outside-expert red team — blueprint.md

> Reviewer stance: smart skeptic who never read the corpus, attacking the five
> biggest calls (price hold + ceiling test; Austin-only + bench + trigger;
> founder-content/creator ladder; rich-open terminal slugs; lean solo ladder).
> Fixed constraints respected: hard paywall gate-everything, $7.99/$39.99
> structure, bootstrapped solo, no-pay-to-rank are NOT relitigated — execution
> and evidence are. Findings ranked most-severe first. Concessions (what was
> attacked and held) at the end.

---

## F1 — MAJOR: The plan is all ratios and no volumes; there is no absolute demand/revenue model anywhere

**What's wrong/missing.** Every gate in §8 is a rate (install→paid %, trial-start %,
ER %, organic share %). Nowhere does the blueprint state what success IS in
payers or dollars at month 6, or run the multiplication its own numbers imply.
Run it: the P2 "breakout" override is a 15k-view video. At an optimistic 30%
Austin-local share (ledger/05 itself says corpus view counts need an
"order-of-magnitude geo-discount") × the top-rung 0.5–1% view→download × the
7% mid-band install→paid, one breakout video ≈ **3–7 payers**. The §4
validation bar ("~5k views = signal") ≈ one payer. Even a fully _working_
channel-zero machine plausibly produces tens of payers per month; P1's own
reversal trigger concedes 100 purchases per test arm may take "two quarters,"
i.e., the optimistic-case total across both arms by month ~7 is ~600–1,100
purchases ≈ $25–45k gross booked — against $6–24k of envelope spend plus six
months of the founder-engineer's build time. The pessimistic case is far below
break-even. None of this arithmetic appears in the blueprint, so nobody can
say whether month-6 "green on every gate" is a business or a hobby with good
dashboards.

**Why it matters.** Ratio-gates can all be green while the absolute business is
too small to fund the next phase (bench, anchor, the founder's rent). The
corpus can't supply this number — every corpus view/conversion figure rides a
national/global TAM — so it must be built from Crave-side assumptions, and it
wasn't. This is the survivorship hole in its purest form: the evidence base
contains zero metro-scoped consumer apps, so the one number that is uniquely
Crave's to compute was left uncomputed.

**What to change.** Add a §8.5 absolute model: (a) month-0 desk study of 10–20
real Austin food/lifestyle accounts (view distributions, engagement, follower
geography where inferable) to replace national corpus reach numbers with
measured local ones — this costs an afternoon; (b) a three-scenario payers/
revenue projection (pessimistic/plan/optimistic) through month 6 at both
envelopes; (c) an explicit month-6 success line in subscribers and dollars
(and a "this is below viability, trigger the P2 expansion read early" line).
The kill board gates effort; nothing currently gates _scale of expectation_.

## F2 — MAJOR: The ceiling test's decision rule is statistically unreadable at its own sample floor

**What's wrong.** §2: migrate up if $9.99/$59.99 "holds install→paid within ~1
point of control" read at ~100 purchases/arm. At a ~7% base rate, 100
purchases ≈ ~1,430 installs/arm; the standard error of the _difference_
between arms is ≈0.95 points. "Within 1 point" at that sample is a coin flip —
a true 1-point degradation is ~1σ, roughly 50% power. Detecting a 1-point drop
with conventional power needs ~650–700 purchases/arm (~9,500 installs/arm),
i.e., 6–7× the stated floor and, at Austin organic volume, over a year away.
The blueprint commits the exact sin it (correctly) convicts pre-launch tests
of — "statistical theater" — just at a different sample size.

**Why it matters.** The price lever is, per the blueprint's own P1 reasoning,
the only revenue lever a no-UA bootstrapper controls. Migrating up on noise
could silently cost several points of conversion at the whole-funnel level;
refusing to migrate on noise leaves the raise case's margin on the table.
Either error is expensive and invisible.

**What to change.** Keep the cohort (it's cheap and the kill criterion —
variant <4% while control ≥4% — IS readable at small samples because it's a
large effect). But restate the migration rule honestly: at 100 purchases/arm
the test can only detect _collapse vs. no-collapse_, so the rule becomes "if
the variant does not collapse and revenue/installed-user is directionally
higher, migrate and keep watching" — or size the cohort to the effect (20%
minimum, and state the real read date). Delete "within ~1 point" or attach the
sample it actually requires.

## F3 — MAJOR: The competitive-response model only covers ASO copycats; incumbent feature absorption has no trigger

**What's wrong/missing.** §1's clock is "dozens of copycat listings within 2–3
months" (the PrayScreen pattern), and P2's override is "a credible dish-ranking
clone shipping multi-city." Both model the threat as _another indie app_. The
threats a skeptic actually prices: (a) **Google** — Maps has surfaced
ML-extracted "popular dishes" on place pages since ~2019, and by 2026 AI
answers respond to "best birria in Austin" directly with review-grounded,
citation-bearing lists; the demo-wow video is effectively an ad for a query
class Google is actively absorbing into zero-click answers. (b) **Beli** —
VC-funded, has the social graph and the food-ranking brand; a dish layer on
Beli is a feature sprint, not a company. Neither event trips any trigger as
written: Google isn't a "clone shipping multi-city," and Beli-adds-dishes
isn't a clone at all. The corpus is structurally blind here — no guest ever
faced hyperscaler feature absorption — and the blueprint inherited the
blindness.

**Why it matters.** Two distinct damages: (1) the positioning claim "the
dish-level slot is genuinely unoccupied" has a shelf life the plan doesn't
model; (2) subtler and sooner — the _demo-wow novelty assumption_. §4 rung 1
assumes "nobody has seen dish-level city rankings." A non-user who believes
Google already tells them the best dish (it half-does) doesn't feel wow; the
0.5–1% top-rung transfer quietly depends on a novelty perception the plan
never tests.

**What to change.** (a) Add an incumbent-absorption override to the P2/§3
trigger list: a Big-3 surface (Google/Yelp/Beli) shipping cross-restaurant
dish _ranking_ (not dish mentions) = same effect as the clone trigger. (b) In
channel zero, explicitly A/B hooks against the "Google already does this"
objection and script the differentiation (cross-restaurant, evidence-
receipted, no-pay-to-rank) into the pinned comment from day one. (c) One line
in §1 acknowledging what the moat is when the claim expires: the pipeline +
receipts, not the slot.

## F4 — MAJOR: Rich-open terminal slugs silently create the indexable/AI-scrapable page network the blueprint explicitly parked

**What's wrong.** §5 renders every shared artifact "completely — no wall, no
blur, no login" on public web pages, while §11.8 parks the programmatic SEO
page network as a _deliberate future call_ because of "real freemium-drift
risk." But public pages are crawlable and indexable **by default**. The moment
slugs ship, Crave has an accreting network of fully-rendered, evidence-quoted,
scored "best X in Austin" pages — the parked decision gets made by omission,
in the riskiest direction. Worse than classic SEO drift: pages carrying full
scores + ordinals + quotes are ideal retrieval fodder for AI answer engines,
which return the _answer_ with no store tap — the exact artifact-without-
install substitution P4 worried about, at infinite scale and zero K-factor.

**Why it matters.** It undermines two settled decisions at once (the hard
wall's scarcity of the answer, and the parked-SEO boundary), and it's
invisible until traffic analysis months later. The P4 verdict's navigational
boundary controls _humans_ on the page; it does nothing about crawlers.

**What to change.** Make crawl/index policy a named launch decision alongside
the slug template: default `noindex` + restrictive robots/AI-crawler policy on
all slug pages at launch (preserving the human artifact loop untouched), with
"flip to indexed" reserved for the future SEO-network decision where it
belongs. Add "slug pages discovered in Google index / cited in AI answers" to
the §8 instrumentation. (The screenshot-substitution risk on canonical lists
was also pressed: partially held — static snapshots go stale and the
dinner-table artifact is query-specific — but staleness is the defense, so
date-stamp every rendered artifact visibly.)

## F5 — MAJOR: The founder-hours plan contains an unresolved contradiction exactly where the binding constraint is

**What's wrong.** Month 0 loads onto one person: five launch blockers, Austin
full load + recalibration, share slugs + cards, teaser screen, paywall
re-skin, full instrumentation, ASO pull — _and_ channel-zero content start.
The P5 tripwire says "if any launch blocker slips past week 4 because of
growth admin, cut **creator/Spark** hours first" — but in months 0–2 there ARE
no creator/Spark hours; the only growth hours are founder content. Meanwhile
ledger/05's transfer guidance says the opposite: "if founder time collides
with launch blockers, channel zero still wins the tie." The blueprint imports
both without resolving them. And the content protocol itself (5–6 formats/2
weeks, cross-post 3 platforms, comment-section management as "the conversion
surface," creator scouting in parallel, 100–200-days-of-daily-posts ramp
expectation) was executed in the corpus by full-time operators — Flame's 4
h/day was _just doomscrolling_ — yet is budgeted here at 10–12 h/wk total.
At the $1k envelope there is no relief valve at all (editor/VA is
$4k-envelope-only).

**Why it matters.** The plan's own thesis is that founder-engineer build time
is "the scarcest asset." A plan whose two canonical documents give opposite
tie-breaks on the scarcest asset will resolve the conflict ad hoc, under
stress, in week 3 — the worst possible way.

**What to change.** Pre-register the tie-break in §9 explicitly: launch
blockers beat founder content until `enforce` is live (content that can't
convert loses ties; the waitlist/receipts dividend is real but subordinate) —
or the reverse, but _say it_. Restate the month 0–3 content cadence as what
10–12 h/wk actually buys (likely 3–4 posts/wk + comment management, not the
corpus protocol), and re-derive the "two 2-week cycles" kill clocks from that
cadence. Name the $1k-envelope relief valve (drop to demo-wow-faceless-only is
the natural one).

## F6 — MAJOR: The soft-paywall voices were dismissed on a condition that is Crave's own roadmap, and the wall has no pre-registered evaluation trigger

**What's wrong** (execution/evidence attack — the launch wall itself is fixed
and not contested here). §0 dismisses Symmetry/Phoenix/Jungle as "apps
protecting an existing daily-habit/network loop. Crave has no such loop to
protect _yet_." But the fact sheet lists polls→Score graduation, friend graph,
lists, and DMs as the secondary flywheel, and the product docs (via ledger/07)
held that polls stay open because gating them "would kill the flywheel."
Gate-everything at launch means the polls flywheel is dormant (payers-only
poll base in one metro ≈ statistical zero) and the Score must stand entirely
on the founder pipeline. The blueprint never states this consequence — the
one place the soft-paywall camp's argument lands on Crave's actual
architecture is silently absorbed. And while every other call in the canon
carries reversal triggers, the model itself has none: the freemium pivot
exists as built machinery (§0.4, one commit, env-gated) with no pre-registered
condition for ever evaluating it. Ledger/10 proposed one ("if the top-20%
curve flattens by day 90… worth reconsidering whether the hard paywall should
loosen at the margins"); the blueprint dropped it.

**Why it matters.** A decision document whose every subordinate call is
falsifiable but whose central call has no review condition will never revisit
it under any evidence — that's doctrine, not engineering. Separately, anyone
modeling Score quality needs to know the polls input is ~zero for the
foreseeable future.

**What to change.** (a) One honest sentence in §0: "Under gate-everything the
poll/social flywheel is dormant at launch; the Score stands on the pipeline
alone — priced in." (b) Pre-register the wall-evaluation trigger in §8, e.g.:
top-20% cohort curve flattens by day 90 AND organic share ≥35% AND install
volume has plateaued for two consecutive months → run the env-gated freemium
evaluation as a deliberate decision (not a drift). This asks for a trigger,
not a change.

## F7 — MINOR: Evidence-grade inflation between ledger and blueprint; borrowed kill lines treated as calibrated

**What's wrong.** The ledger's careful quality tags degrade on the way into
the blueprint: Flame's _single-operator claimed_ ladder becomes "the measured
conversion ladder" (§4); Vahe's unaudited consultant aggregates (4–10%
install→paid, 15% trial-start, 30% trial→paid — denominated on national,
largely paid/viral traffic) become hard kill lines for a considered $40/yr
local purchase from organic social traffic; the five free→paid flips (§0.3)
are survivor self-reports on the paywall vendor's own podcast presented as
"the only honest validation." The transfer of every one of these bands to
Crave's traffic mix is unknown.

**Why it matters.** A <4%-for-two-weeks halt line derived from AI-wrapper
funnels could fire on a perfectly healthy local product that simply converts
slower from cold social traffic — halting distribution on a mis-transferred
benchmark is the kill board hurting you. (The reverse error is milder.)

**What to change.** Mark §8's bands "provisional until ~200 Austin installs
recalibrate them"; treat the first two weeks of real funnel data as the event
that _sets_ the kill lines, with the corpus bands as priors. Restore the
"claimed, single-source" qualifier to the ladder in §4 — it changes nothing
operationally and keeps the document honest.

## F8 — MINOR: Calendar clocks are anchored ambiguously, and two calendar items can't be measured when scheduled

**What's wrong.** (a) Channel zero starts month 0, pre-wall — but the kill
gate (two 2-week cycles <300 views), the creator-trial gate ("day 60–90"), and
the P2 expansion trigger all read view→install/paid conversion, which cannot
exist until `enforce` is live and the store listing is up. Day zero is never
defined: posting-start or wall-live? If Apple enrollment (§11.4, "the single
longest pole") slips a month, every downstream date silently shifts — or
doesn't — undefined. (b) §9 month 6 says "revisit price default per
ceiling-cohort data," but per F2 (and P1's own two-quarters reversal trigger)
the cohort is unlikely to be readable by month 6 at organic volume. (c) Under
a hard wall with tiny early volume, listing-rating fragility (a handful of
"you pay just to see anything" 1-stars on a 20-review listing poisons ASA and
slug conversion) is a known failure mode of exactly this model that no §8
metric watches — the survivor corpus wouldn't report it.

**What to change.** Define every clock's anchor (recommend: content-craft
clocks anchor at posting-start; all conversion-denominated gates anchor at
wall-live and are explicitly UNARMED before it). Re-date the month-6 price
revisit as "at ceiling-cohort readability" with a fallback directional read.
Add listing rating (and refund-request rate) to the §8 board with a band.

---

## Attacked and held (tested, survives)

- **Austin-only + earned dark bench + engineered trigger (P2):** survives in
  full. Least echo-risked consensus in the corpus, the product is
  non-functional outside a dense market, the bench is correctly earned-not-
  bought, and the trigger is honestly falsifiable. Best-reasoned call in the
  document (add F3's incumbent override and it's complete).
- **The geo-dilution "is the Austin TikTok audience big enough AT ALL" attack
  largely fails:** ~2.5M metro, plausibly ~1M TikTok users, food is the most
  content-native vertical, and a real dozens-deep Austin creator scene exists.
  The binding questions are algorithmic delivery of city-scoped content
  (already gated, with a named kill) and absolute volume (F1) — not audience
  existence.
- **Hold $7.99/$39.99, no pre-launch test, annual-trial asymmetry (P1):**
  survives; the reasoning against pre-launch testing and monthly trials is
  airtight on its own evidence. Only the cohort's decision rule breaks (F2).
- **Founder-before-creators, locality-first, $300–500 trials → gated anchor,
  no agencies, no equity (P3):** survives. Mechanism-based (vet/brief/coach
  requires personal literacy; receipts unlock recruiting), failure modes are
  pre-registered, and the astroturf line is both principled and commercially
  correct for an evidence-receipted brand. Only the labor budget breaks (F5).
- **Rich-open terminal slugs as the anti-freemium mechanism (P4):** the
  structural argument (artifact loop; recipient needs the answer; navigational
  boundary) survives a hostile read — the corpus's zero-precedent-for-walled-
  artifacts point is absence-of-evidence, but the affirmative logic stands
  without it. Only the crawler/index omission breaks (F4).
- **The compliance line (§2) and the §10 discard list:** correct, complete,
  and the Cal-AI-pull framing is exactly how a one-app founder should price
  that risk.
- **Kill-board discipline generally:** the instinct to pre-register kills is
  the document's best feature; F1/F7/F8 are calibration fixes, not challenges
  to the discipline.
