# Verdict: Hold $7.99/$39.99 at launch; one real-data teaser screen before the wall; no monthly trial; ceiling test as a post-baseline cohort, not a launch bet

## The call

Launch at **$7.99/mo pay-now and $39.99/yr with the ~1-week annual-only store-managed trial, annual default-selected** — exactly as decided. No pre-launch price signal test of any kind: at zero installs it is statistical theater (the corpus's own floor is ~100 purchases per variant, RevenueCat via `arthurspalanzani--20260514`/`20260110`, cited in both `ledger/03` and both briefs), and a painted-door pricing probe burns scarce Austin first impressions for an unreadable number. Instead: **weeks 1–2 run single-price to get a clean control baseline; then route 10–20% of new subscribers to a $9.99/mo·$59.99/yr variant via the existing RevenueCat offering rail and leave it running until each arm clears ~100 purchases**, with an early kill if the variant's install→paid falls below Vahe's 4% line while control holds ≥4% (read within the first ~200 paywall views per arm). Pre-wall demo: **exactly one real-data teaser screen inside onboarding** — after city pick, before Clerk auth and the wall — rendering 3–5 live Austin-ranked dishes filtered by the user's own quiz cuisine answers, with one evidence quote; non-interactive, no search, no map, no browse. **Monthly stays pay-now, no trial, at launch.** The revenue model brackets against the **conservative ~30% year-1 annual renewal** (Cal AI's figure, `thebrettway--20260302`), with 44% (RevenueCat lifestyle benchmark cited secondhand in business-model.md) allowed only as an upside scenario after the actual RevenueCat report is pulled first-party. Paywall spec: copy the compliant benchmark stack below wholesale; refuse the entire decline-cascade family without exception.

## Why

**Price level.** The hold case won on its own terms and the raise case conceded it: "Keep $7.99/$39.99 as the default at launch" is the raise brief's own implementation step 1. Glow and Pepai ($10/mo·$40/yr, first-party dashboards / claimed, `ledger/02` numbers table) are the closest analogs by price _and_ mechanic, and Parra's $29.99–39.99/yr aggregate independently brackets the band. The echo-chamber discount is real (all Superwall-ecosystem) but the convergence survives it — and business-model.md already treats the price as "a starting hypothesis to A/B," so holding is not complacency, it's sequencing. Blue Throne's fewer-payers-at-higher-price arithmetic (`superwall--20260708`) is the one serious outside challenge and it earns the ceiling cohort — but it is a framework, not a measurement; its proof case (Waking Up, $20/mo on a Sam Harris celebrity moat, secondhand Sensor Tower) does not transfer to a zero-brand-trust city launch, as `ledger/02` itself flags. The raise brief's strongest true point survives as the test's _rationale_: a no-UA bootstrapper self-funding city #2 (fact-sheet: >$600/city, $15–40k for 25) controls exactly one revenue lever, so the ceiling must be measured, not assumed.

**Ceiling-test timing.** Both briefs half-right. The hold brief's "defer until ~100 purchases exist" confuses when a test is _readable_ with when it should _start collecting_ — at organic-only Austin volume that defers the answer by a quarter for no benefit. The raise brief's "start in the first cohort" risks polluting launch week, when the founder needs one clean read of whether the funnel works at all. The synthesis is strict: baseline first (two weeks single-price), then the cohort runs continuously with the kill criterion armed. Configure both offerings in RevenueCat before launch so the switch is a flag, not a build.

**Gate craft.** The Sway concession is the decisive evidence: paywall-first won their A/B _because their aha required user effort_ — "if you can show the aha cheaply pre-paywall, that's better" (`ledger/03` conflicts). Crave's aha is precomputed and renders to an unpaid viewer at zero marginal cost; Halo AI's 16.5% combined double paywall points the same way. Both briefs converged on the identical screen independently — that convergence, plus the ledger's explicit "the conflict resolves differently for Crave than for Cal AI," settles it. The strict one-screen, non-interactive cap is what keeps this inside the fixed gate-everything architecture: it changes the onboarding _narrative_, not where the card is required.

**Monthly trial: no.** The hold brief's launch-week monthly A/B is the same statistical theater it correctly diagnosed in the ceiling test — the monthly leg is the _minority_ of traffic, so 100 purchases per variant on it is months away; the brief is internally inconsistent. The raise brief's "just mirror the trial" dies on three facts: (1) the trial-on-annual-only asymmetry is the steering mechanism every winning analog uses (Cal AI, Glow, Pepai, Riz's toggle economics — the trial is the _reason_ to pick annual); (2) a monthly trial converts day-one cash into deferred cash on the leg with the worst retention (~17.5% at 12 months) while ~50% of trial-starts cancel (Parra) — directly against the capital-velocity logic that motivates the hard wall; (3) Vahe's ~10% skip-trial statistic proves pay-now demand exists even when a trial is offered. The de-risking the raise brief wants now arrives via the teaser screen instead.

**Renewal band.** The 30/44 gap is methodology, not resolved disagreement (`ledger/10`). Kill-criteria must not flatter themselves: plan against 30%, and pull RevenueCat's actual benchmark report once the account is live before ever modeling 44%.

## Discarded as noise

- Weekly-plan evidence (NGL, PushScroll, Halo, Locked, RizzGPT) — impulse/teen categories; already correctly excluded.
- Regional/GDP pricing, Symmetry's Spain-first cost argument — single-US-city launch.
- Claim's trial removal — preconditions (volume, measured funnel, acute intent) Crave hasn't earned.
- Nicole's dark kit (fake scan, blur, forced attestation) and Social Wizard's rigged demo — brand poison for an evidence-receipted integrity product.
- Every vendor-aggregate lift number without a baseline (Parra's +111%, Sunflower's self-inconsistent +46–70%) — directional inputs only, never targets.
- Waking Up's $20/mo as a transferable anchor — celebrity moat, secondhand.

## Reversal triggers

- **Ceiling variant wins:** if $9.99/$59.99 holds install→paid within ~1 point of control at ≥100 purchases/arm, migrate the default upward — the raise brief was right about the band.
- **Ceiling variant rate-collapses** (<4% while control ≥4%, within 200 paywall views/arm): kill it; the category ceiling sits at the AI-wrapper band.
- **Monthly leg install→paid <4% over the first 60 days while annual trial-start ≥15%:** flip a 3-day trial onto monthly (RevenueCat config change) — the raise brief's monthly concern was right.
- **Teaser screen lowers downstream trial-start or trial→paid:** remove it; the Cal-AI hard-gate-immediately pattern wins for Crave specifically.
- **Top-20%-engagement retention curve fails to separate from AI-wrapper decay by day 90** (`ledger/10` Blue Throne oracle): the hold-and-wait pricing posture loses its premise — pull the price lever early rather than waiting for clean cohorts.
- **Organic installs so slow that 100 purchases/arm exceeds ~two quarters:** read the ceiling test on the noisier sample rather than holding the textbook floor.

## Owner-conditional items

- **Cohort size 10% vs 20%** on the ceiling test — pure risk-tolerance call (Brandon).
- **Teaser-screen build time** vs launch date — one screen against the existing pipeline, but it competes with the paywall re-skin; Brandon sequences.
- **Apple Developer enrollment timing** gates everything (real ASC products, RC prod key, dev-client rebuild) — calendar is Brandon's.
- **Apple-native win-back/cancel-flow offers** (Coconote's 27% save): ruled _inside_ the compliance line in principle (Apple's own StoreKit machinery is not a decliner re-prompt), but stays dormant per the win-back-only design until churn data exists — activation is Brandon's call.

## Implementation notes

1. **Pre-launch (blocked on Apple enrollment):** create ASC products $7.99/mo (no trial) and $39.99/yr (7-day intro trial); also pre-configure the $9.99/$59.99 variant offering in RevenueCat. Fix legal URLs; flip `ENTITLEMENT_GATING=enforce`.
2. **Paywall screen (the re-skin):** single-page bullet-list benchmark — USP + 3–5 bullets + social proof, 56–65pt "Continue" CTA, "No commitment, cancel anytime," two plans ordered by duration, annual default-selected labeled "Try it free" **with $39.99 as the most prominent number**, inline auto-renew terms, Blinkist trial timeline ending "we'll remind you before your trial ends" (Apple sends it — free lift), Clear30-style price-transparency screen before the charge. Quiz answers mirrored into paywall copy.
3. **Onboarding:** keep the 17-step quiz; add progress bar + commitment screen (Glow 74%→83%); insert the teaser screen after city pick, before Clerk auth — 3–5 live ranked dishes from the user's cuisine answers, one evidence quote, one Continue button.
4. **Refuse without exception:** decline-cascade offers (X-out drawer reframes, 25–33% one-time offers, spin-the-wheel, 55%-off abandoned-cart), decliner re-prompts, divide-down prominence, fake scarcity, forced ratings — the Cal AI April 2026 pull class; expected value negative for a one-app solo founder.
5. **Instrument from day one:** trial-start (>15%), trial→paid (>30%), no-trial install→paid (>10% good, <4% stop-and-fix), annual-mix share, organic-install share (vs 50/35/20 bands), top-20%-engagement retention at day 30/60/90.
6. **Weeks 1–2:** single-price. **Week 3 onward:** 10–20% ceiling cohort live, kill criterion armed. Read at 100 purchases/arm or per the reversal triggers above.
