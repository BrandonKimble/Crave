# Brief: Hold $7.99/$39.99, Win on Craft

## The position

$7.99/mo · $39.99/yr with a ~1-week annual-only trial is the right launch price, and the
work that actually moves the number is presentation craft and instrumentation, not a price
change nobody can test yet. The corpus's two closest analogs by price _and_ mechanic — Glow
($10/mo·$40/yr) and Pepai ($10/mo·$40/yr) — are first-party revenue proof that this exact
shape converts for consumer-utility apps with no ad budget (`ledger/02-business-model-and-price.md`
numbers table). The one serious challenge to the level, Blue Throne's $20/mo ceiling argument,
is real but untestable with statistical validity at zero installs — the corpus's own floor is
~100 purchases per variant before a test means anything (`ledger/03-onboarding-and-paywall-craft.md`,
citing RevenueCat via `arthurspalanzani--20260110`). Crave should ship the settled price, spend
its scarce pre-launch effort on the paywall screen, the pre-wall demo, and the monthly-trial
question — all of which are genuinely open and genuinely cheap to get right — and stage a real
price-ceiling test only once real Austin traffic exists to make it valid.

## The affirmative case

**Convergence on level, not just structure.** Glow ($10/mo·$40/yr, 3-day trial, yearly-only,
~$2,800/mo shown on dashboards) and Pepai ($10/mo·$40/yr, 3-day trial yearly-only, $100k in 70
days) sit almost exactly on Crave's $7.99/$39.99, and Parra's cross-portfolio aggregate
independently names $29.99–39.99/yr as the "market-settled" band (`ledger/02`). This is not one
data point wearing three names — it's price convergence from two operating businesses plus one
consultant's aggregate. The ledger is honest that this is also an echo-chamber risk (all
Superwall-ecosystem, same podcast), but the convergence holds even against Parra's own
counter-example of $20–22/mo surviving in a different niche — the corpus's _own_ framing is that
sub-$10 fits products without per-query inference cost, which is exactly Crave's profile (no
Cal-AI-scale compute per search).

**Hard paywall over freemium is the best-replicated finding in the whole corpus.** Cal AI's
GrindClock A/B, Quittr's explicit "no one used it free," Stronger's ~25% overnight lift on an
accidental hard-paywall bug, and Cardstock's ~$30k/mo after the switch are four independent
first-party flips in the same direction (`ledger/10-retention-metrics-revenue-engine.md`). Crave's
gate-everything gets this for free because the owner decision already matches the winning
pattern for utility-shaped apps with day-one value and no pre-existing loyalty to protect.

**Annual-default, trial-forward, Blinkist-timeline craft is cheap, replicated, and largely
already free for Crave.** Coconote (+16% trial conversion from a longer, more invasive
onboarding), Glow (74%→83% completion from a progress bar + commitment screen), Sunflower's
priming screen, and Pingo's timeline paywall all point the same direction, and — critically —
"Apple literally sends that reminder for Crave's store-managed intro trial" (`ledger/03` Crave
transfer), so Crave inherits the corpus's best-measured lift mechanism at zero build cost. The
capital-velocity logic (annual cash upfront funds next month's growth) is also the argument
Crave's own "loosen-risk overridden for capital-return speed" decision already encodes — this
isn't imported advice, it's confirmation of a call already made.

**A price-ceiling test is worth planning, not worth running now.** Blue Throne's math ($4.99/mo
→ 500k payers vs $20/mo → 125k payers for the same $30M ARR) is the sharpest counter-argument in
the corpus, and it deserves a real test — but Waking Up, his proof case, carries a celebrity
(Sam Harris) authority moat Crave doesn't have at launch, and the corpus's own testing floor
(~100 purchases/variant, RevenueCat) makes a ceiling test at zero installs statistical theater,
not craft.

## Pre-empting the other side

**"Show the real product before the wall — Halo AI's double paywall converts 16.5% combined,
better than hard-gate-alone."** Concede this cleanly: the ledger's own conflict section
(`ledger/03`) says Crave can show real Austin rankings at zero marginal cost, unlike Cal AI's
scan-based aha, and Sway's own reconciliation ("if you can show the aha cheaply pre-paywall,
that's better") applies directly to Crave. The answer is not to abandon gate-everything — that
architecture is a fixed owner decision — but to build the richer demo _inside_ the onboarding
that already precedes the wall: a real-data teaser screen using the quiz's own cuisine/occasion
answers ("your taco-obsessed Austin profile is ready," `ledger/03` citing spine/06), landing
right before the paywall route. This is presentation craft threaded through the existing
architecture, not a structural change, and it directly answers the demo-richness question this
panel was asked to address.

**"Monthly needs a trial too — zero-brand-trust launch, and ~10% of users take a skip-trial
toggle when offered one (Riz/Cal AI)."** This is the most honest concession in this brief. The
current design puts the entire launch-week download-to-paid risk on the one leg with no
de-risking mechanism at all, and Vahe's own precondition for removing a trial — high volume,
measured funnel, acutely-motivated user — is exactly what Crave _doesn't_ have yet
(`ledger/02` conflicts). The corpus doesn't resolve whether Crave should add it; it flags this as
an open question the panel itself raised. Recommendation below treats this as a cheap, fast
launch-week A/B rather than a settled "no."

**"30% vs 44% renewal — pick the wrong bracket and the kill-criteria lies to you."** Also
conceded honestly: the ledger states the gap is likely methodology (Cal AI's team stating a
casual "industry average" vs. business-model.md's cited RevenueCat lifestyle-category
benchmark), not a real disagreement resolved in Crave's favor (`ledger/02`, `ledger/10`). Crave's
retention thesis argues it should land above both, but that is a claim, not evidence — treat it
as such below.

## Concrete implementation

- **Ship the decided prices as-is** once Apple Developer enrollment lands: $7.99/mo pay-now (no
  trial), $39.99/yr with a 7-day store-managed intro trial, annual default-selected and labeled
  "Try it free" — the highest-prominence number is the real billed price (`business-model.md`
  Apple-proofing rule 1).
- **Keep the 17-step quiz**, add a progress bar + a commitment screen (Glow's 74%→83% pattern),
  and mirror quiz answers into paywall copy.
- **Add one real-data teaser screen inside onboarding**, after city pick, showing 3–5 live
  Austin-ranked dishes/restaurants filtered by the user's own cuisine answers, immediately before
  the paywall route — this is the cheap-aha answer to the Halo AI/Sway point without touching the
  hard-gate architecture.
- **Paywall screen**: single-page bullet-list benchmark (USP + 3–5 bullets + social proof),
  56–65pt "Continue" CTA, "No commitment, cancel anytime," inline auto-renew terms, Blinkist-style
  trial timeline, Clear30-style price-transparency screen before the charge.
- **Launch-week A/B on the monthly leg**: ship two monthly SKUs behind the existing RevenueCat
  offering config — $7.99/mo no-trial (current design) vs. a short (3-day) trial variant — and
  read install→paid separately on each within the first real cohort. This is a flag flip, not a
  rebuild, and it answers the open "does monthly need a trial" question with data instead of
  assumption.
- **Instrument from day one** (the entitlement ledger + webhook plumbing already exists): trial-
  start rate (target >15%), trial→paid (target >30%), no-trial install→paid (target >10%, <4% is
  a stop-and-fix-onboarding signal, per Vahe's bracket in `ledger/02`/`ledger/10`), annual-mix
  share, and the top-20%-by-engagement retention curve at day-30/60/90 (Blue Throne's framework,
  `ledger/10`).
- **Defer the price-ceiling test** until Crave clears ~100 purchases in a variant (the corpus's
  own floor) — realistically the first real Austin cohort, on the order of 60–90 days past a live
  App Store listing given the corpus's own "no instant marketing" read window (`ledger/10`
  consensus). At that point, push 10–20% of new annual subscribers into a $59.99–79.99/yr cohort,
  not before.
- **Bracket renewal kill-criteria against the conservative 30%** (Cal AI's health/fitness figure)
  rather than the optimistic 44% (RevenueCat aggregate cited secondhand in business-model.md),
  and pull RevenueCat's actual benchmark report directly once there's a live account, rather than
  trusting the corpus's secondhand citation of it.
- **Hold the Apple-proofing line without exception**: no decline-cascade discounts (25–33%
  one-time offers, spin-the-wheel, 55%-off abandoned-cart), no divide-down framing more prominent
  than the billed price, no decliner re-prompts, no forced ratings — every one of these is claimed
  to lift revenue in the corpus, and every one of them is in the same tactic family that got Cal
  AI pulled in April 2026 one month after its own $50M-ARR victory lap (`ledger/02`, `ledger/03`).
  The expected value of copying that lift is negative for a single-app, hard-gated, solo-founder
  business with no second app to fall back on.

## What would prove me wrong

If the monthly-trial A/B shows install→paid on the no-trial leg lands under 4% and the trial
variant clears it, that proves the trial-on-monthly concession should have been the launch
default, not a test — ship it everywhere immediately. If the day-30/60/90 top-20%-engagement
retention curve does _not_ separate from AI-wrapper baselines, Crave's entire "data density
produces durable retention, so hold the price and wait for scale" thesis is wrong, and the
right move flips to pulling the price lever early as a hail-mary rather than waiting for a
clean cohort. If organic, no-ad-budget installs arrive so slowly that reaching 100
purchases-per-variant would take more than roughly two quarters, the "defer the ceiling test"
recommendation itself becomes bootstrap-hostile and should be pulled forward on a smaller,
noisier sample rather than held to the textbook floor. And if RevenueCat's actual benchmark
report (not the secondhand citation) shows lifestyle-category renewal well above 44% while
Crave can't even clear Cal AI's 30% floor, that's a product/onboarding signal, not a pricing
one — no amount of paywall craft or price adjustment fixes a retention problem.
