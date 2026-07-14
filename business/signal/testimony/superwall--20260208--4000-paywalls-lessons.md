---
source: superwall/20260208 - I made 4,000 app paywalls and learned this [lkwX_kc0NS8].txt
date: 2026-02-08
speakers: Jonathan Parra (lead paywall designer at Superwall, ~3 years; now runs an agency "equals" [name uncertain — auto-caption]); Joseph Choi (host, Superwall podcast, founder of Consumer Club)
apps: No single app is the subject — aggregate testimony across thousands of Superwall customer apps (categories: ai-utility rappers/wrappers, lifestyle/fitness, health chat, dating/social, addiction-recovery journey apps like Clear 30, Pyometer Plus [name uncertain], Mojo, Blinkist-style). Claimed scale: Superwall corpus of 4,000–4,500 paywalls designed; customer bands cited $10k–$50k/mo and $100k+/mo; podcast guests median ~$1M ARR. Business models discussed: weekly/monthly/annual subs, hard vs soft paywalls, 3-day and 7-day trials, one-time-offer discounts, two-tier plans, friends-and-family plans.
evidence_quality: claimed-numbers throughout (A/B lift percentages are first-party to Superwall but presented without sample sizes, baselines, or app identities); category averages (8% → 15–20% conversion) are claimed aggregates; AI-wrapper pricing norms are secondhand market observation.
incentive_flags: The entire video is Superwall content marketing — host explicitly names Superwall as sponsor/channel owner, plugs paywallexperiments.com (free AI tool "trained on 422 profitable paywall experiments") and $100k+/mo founder dinners; guest is a former Superwall employee who now sells paywall design services through an agency and is building his X audience. Every claim flatters the value of paywall experimentation tooling. No losing tests quantified except as anonymized lessons.
---

## Arc

Jonathan Parra spent ~3 years as Superwall's lead paywall designer, hand-building paywalls for customers — he claims 4,000+ (probably ~4,500) designed, "more than anyone on Earth." He joined pre-revenue (early paywalls in Webflow — at one point Superwall traffic was allegedly 12% of Webflow's egress costs — then Svelte-coded, then the current editor). The video walks through real A/B test screenshots to teach paywall design principles; his headline lesson is that no universal "golden paywall" exists, only components and benchmarks.

## Claims

### Pricing & paywall

- No perfect/golden paywall exists: the same paywall in the same app category "could just flounder completely in one app versus another." His single most surprising cross-portfolio lesson. (claimed, aggregate)
- Price & packaging DESIGN (not price levels) is one of the biggest levers in paywall experimentation — most founders obsess over pricing when design/packaging is the bigger lever. (claimed; attributed to Nick Godwin's principles)
- Test 1: simplified paywall beat control by **10%** — removed redundant plan-name copy ("AI assistant weekly" → "Weekly"), added "No commitment, cancel anytime" checkmark, removed "limited time" from a 70%-off badge (kept "70% off"), swapped CTA "Put AI into action" → "Continue". Attributes most of the lift to the cleaner product group + the no-commitment line. (claimed A/B result, no baseline given)
- Test 2 (dramatic increase, exact % not stated): dropped from 3 plans to 2 (annual + weekly), CTA "Start my 3-day trial". Rationale: 3 options = decision fatigue; order plans by subscription length (ascending or descending, never weekly/annual/monthly scrambled). (claimed)
- Test 3: bare "We want you to try [app] for 50% off" + big app screenshot + Continue beat a feature-comparison-table paywall with 3/6/12-month options by **111%**. Table components consistently underperform bullets/video/visual cues — "users don't read." Pattern copied from Cal AI ("Cali" in captions — uncertain). (claimed A/B result)
- "No commitment, cancel anytime" is a near-universal micro-hack he adds to "almost every paywall"; gives a "very granular percentage bump." A chevron/right-arrow on the CTA button also bumps conversions. (claimed)
- CTA buttons: large — 65pt height preferred (sometimes 56pt); large CTA text. (claimed practice)
- Urgency copy isn't wrong per se, but "limited time" in tiny badge text fails; urgency belongs in a heading on a dedicated one-time-offer paywall. (claimed)
- One-time-offer discounts: keep to **25–33%** off; save big discounts for Black Friday/Cyber Monday; frequent deep discounts cheapen the brand, especially for larger apps. Example: $40/yr discounted to $30/yr (33% arbitrary). (claimed practice)
- AI-wrapper market pricing settled at **$29.99–$40/year** (text-inference apps); image/video apps price higher because inference costs more. **$39/yr = $0.76/week** reframing used on a fallback drawer. (secondhand market observation)
- Counter-example: niche chat apps with a dialed-in custom prompt charge **$20–22/month** (ChatGPT/Claude-level pricing) and sustain it; a health-space app launched 2–3 years ago still earns consistent revenue despite frontier models. Thesis: "users are willing to pay for prompts" — a custom end-to-end flow tailored to one problem, especially targeting an insecurity (LooksMax apps, dating-reply apps). Trend visible ~3 years, uptake in the last year as models improved. (claimed/secondhand)
- SwiftUI-native-looking paywalls: twice he expected custom-designed variants to win and the plain Apple-style design "outperformed everything by quite a long shot" (Pyometer Plus [uncertain] + one other app) — likely because it matched the rest of the app's design. (claimed, n=2)
- Two-tier plans (pro/plus, like ChatGPT): growing among dating/social and AI image/video apps; "pain in the ass to manage." Contrast trick: dark/premium background for the higher tier vs white for lower conditions users toward the premium tier — "more users subscribe to the Pro plan" (inspired by Hinge). (claimed)
- Friends-and-family/annual family plans are an underused LTV/ARPU lever (more Apple SDK work; usually annual). (claimed, speculation on why rare)
- Credits-on-top-of-subscription upsells work for LLM labs (Claude max-plan behavior cited) but are rare in consumer apps; he's unsure why. (speculation)

### Trial & onboarding

- Weekly plans rose with churn-and-burn AI wrappers: high weekly price gets users in; many forget to unsubscribe, so weekly payers often pay more total than annual would have cost. Weekly also serves as price-discovery without a year commitment. But weekly is fading for social/multiplayer apps, where weekly+monthly (sic — likely monthly/annual) grow more popular. (claimed)
- ~**50%** of free-trial starters cancel after subscribing "on average" — but the trial still buys you the demo window, especially behind a hard paywall. (claimed aggregate)
- Trial strategy = a product-diagnosis instrument: offer trials when inference cost is low, to test stickiness; trial + high churn + good onboarding funnel = product problem. No-trial hard sell tests whether onboarding alone convinces. Heavy monthly (vs annual) uptake signals onboarding failed to sell the product. (claimed heuristic)
- Cascade pattern (gray-hat, his current go-to for heavily-tested apps): main paywall (yearly $30–40 selected) → on close, drawer "Not ready to commit for a year? We have plans for everyone" (yearly still selected, monthly added, per-week reframing shown) → on "not now, thanks", one-time-offer paywall at 25–33% off with chevron CTA. (claimed practice)
- Blinkist-style trial-timeline paywall (day 1 unlock / day 5 notification / day 7 billing) has stayed high-performing "for years" with no half-life despite mass copying. (claimed)
- Clear 30-style journey paywall (steps showing who you'll be after the week/month; hero's-journey framing) works across categories — but only for apps with a clear USP and transformation arc. (claimed)
- Multi-page paywalls: benchmark single-page bullet-list paywall first, then add pages (image/video page, social-proof page with reviews, "Try 7 days free" CTA). (claimed practice)

### Retention & product

- Best-monetizing apps have a "closed loop" — clear before/after transformation the user can expect; conversion rates for closed-loop apps "just work so well." (claimed)
- Watching friends/family use apps: "they don't read, they just hit continue" — the root psychology behind simplification wins. (anecdote)

### Team, tools & cost structure

- Bullet-list single-page paywall = the benchmark that performs well across nearly every category; Superwall's answer to no-golden-paywall was a component system to drop into any paywall. (claimed)
- Design tests + price-packaging tests give "more mileage… than really anything else"; price-level testing should come LAST — it forces user-cohort/seed management overhead in Superwall and becomes painful. (claimed)
- Video paywalls: Rotato (only tool he knows) for phone-in-hand app-demo videos; record your own screen, drop it in. Michaela-app example (video + social proof + bullets, female demographic, Mojo-inspired) won its test. (claimed)
- Best ROI on paywall experimentation: apps ≥ **$100k/month** that never A/B tested. His recent customers skew **$10k–$50k/month**; average paywall conversion he sees is ~**8%**, and "a couple iterations" can lift to **15–20%** with no ad-spend or product investment. (claimed aggregates)
- Host/sponsor numbers: Consumer Club founders build at a **median $1M ARR**; paywallexperiments.com trained on **422 profitable paywall experiments**; SF/NY dinners gated at **$100k/month** revenue. (claimed, promotional)

## Deal structures

None discussed (no creator/UGC/affiliate terms).

## Contrarian positions

- There is no golden paywall template — copying a winner from the same category can fail completely (against the copy-what-works consensus).
- Urgency badges ("limited time") can HURT when small; simplification beats persuasion copy nearly everywhere ("users don't read").
- Comparison tables — a staple of SaaS pricing pages — underperform simple bullets on mobile paywalls.
- Don't test price levels first; test design/packaging first and price last (inverts the common price-testing obsession).
- Plain SwiftUI-native paywalls can beat heavily branded custom designs.
- Descriptive CTAs ("Put AI into action") lose to generic "Continue."

## Crave transfer

Highly transferable, low-risk tactics: "No commitment, cancel anytime" line, generic Continue CTA, big 56–65pt buttons, plan list ordered by length, bullet-list benchmark paywall, and skipping comparison tables — these are cheap paywall-craft moves that don't depend on category. The trial-as-diagnostic framing maps directly onto Crave's annual-only ~1-week trial: heavy monthly uptake would signal onboarding isn't selling the data density. Treat the lift numbers (10%, 111%, 8→15–20%) as directional only — they're vendor-marketing aggregates with no baselines, from a speaker whose livelihood is paywall-design services; and his own headline lesson (no paywall transfers reliably between apps) argues for testing on Crave rather than importing any specific design. The $30–40/yr "AI wrapper" price anchor does NOT transfer — Crave is a repeat-use local-utility app, closer to his $20–22/mo custom-prompt/niche-value counterexample, which actually supports Crave's $7.99/mo pricing. The gray-hat close-cascade (drawer reframe → discount) conflicts with a hard pay-now gate and with brand-cheapening concerns for a premium positioning; use cautiously if at all.
