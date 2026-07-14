# Spine notes — "I made 4,000 app paywalls and learned this" (superwall, 2026-02-08)

**Who:** Jonathan Parra — Superwall's lead paywall designer 3 yrs (4,000–4,500 paywalls),
now running his own agency ("Equals"-adjacent client work). Host: Joseph Choi (Consumer
Club). **Incentives:** Superwall's own channel + its own former designer + host runs a
paid community; but this is the most data-dense paywall source in the corpus (draws on
Superwall A/B data across thousands of apps; they ship a tool trained on 422 profitable
paywall experiments).

## The claims that matter

**Meta-lesson: there is no golden paywall.** His single most surprising finding across
4,000+ designs: identical paywalls flounder or win unpredictably even within one app
category. What survives is a _component system_ + a benchmark baseline to iterate from.
→ For Crave: don't cargo-cult any specific screenshot; ship the benchmark, then test.

**The benchmark that works "across the board":** single-page bullet-list paywall —
USP heading + subtitle, 3–5 bullets of what you get, social accolades, big Continue CTA
(65pt button height, chevron arrow bumps conversions). Users don't read; visual > copy.

**Reliable micro-wins (his "add to almost every paywall" list):**

- "No commitment, cancel anytime" line under the CTA — near-universal small bump.
- Generic **Continue** beats descriptive CTAs ("Put AI into action") — one test +111%
  (combined with simplification).
- Simplify plan naming (Annual/Monthly/Weekly, not "AI Assistant Annual").
- Plans ordered by duration (ascending or descending, never mixed); highlight annual.
- Comparison **tables lose** to bullets/video — overwhelm. "We want you to try X for
  50% off" + one big app visual beat a feature-comparison table by 111% (he says he
  took this pattern **from Cal AI**).
- SwiftUI-native-looking paywalls beat heavily-designed custom ones (seen twice,
  incl. Pillometer+) — matching the app's design language reads trustworthy.
- Video paywalls (Rotato phone-in-hand demo of real app) work well (Mojo style).

**Pricing & packaging:**

- Packaging _design_ is a bigger early lever than price-level testing; price testing is
  operationally painful (cohort management) — do it later, after design tests.
- Market-settled AI-wrapper band: **$29.99–39.99/yr** ("what the market settled on");
  higher only if image/video inference. Custom-prompt niche chat apps sustain
  **$20–22/mo** — users pay for the tailored prompt/flow, not the model. Insecurity-
  targeting (looks, dating) supports the highest prices.
- Weekly plans: born of AI-wrapper churn-and-burn; users often end up paying more than
  annual; **declining for social/multiplayer apps**; sometimes annual+weekly beats
  annual+monthly. Hide 3rd plan behind "view all plans" — 3 visible plans = decision fatigue.
- Friends & family annual plan = underused LTV bump.
- Two-tier (plus/pro) rising in dating/social/AI-video; premium-contrast styling (dark/
  gold on the pro tier) nudges tier-up.

**Trials:**

- Trial vs no-trial is a _diagnostic choice_: no-trial tests willingness-to-pay off
  onboarding alone; trial tests product stickiness. If trial churn is high and onboarding
  is good → it's a product problem.
- **~50% of trial-starts cancel on average** (his number, said in passing) — LTV model input.
- Blinkist-style trial-timeline paywall (day 1 unlock → day 5 reminder → day 7 billed)
  is a years-long durable winner — no half-life despite mass copying.
- Highlighting the trial on a cheap plan while defaulting annual = both knobs at once.

**Decline cascade (he calls it "gray hat"):** X-out → drawer "not ready to commit to a
year? plans for everyone" (same yearly price reframed per-week) → "not now" → one-time
offer at 25–33% off. Never discount deeper (cheapens brand; save big cuts for BF/CM).
⚠️ **CONFLICT with our Apple-proofing rule #3** ("never re-prompt a decliner with a
different offer" — one of the four things in the Cal AI pull). Superwall culture
normalizes exactly this. Must adjudicate: which decline-flows are Apple-safe in 2026?

**Benchmarks:** average paywall conversion he sees ≈ **8%**; 15–20% after a few
iterations. Best testing ROI: apps ≥$100k/mo that never tested; his newer clients are
$10–50k/mo. Implication: at Crave's launch scale, paywall A/B is NOT the first lever —
you won't have traffic for significance; ship the benchmark + micro-wins and go get users.

**Closed-loop insight:** the apps that convert best have a _closed feedback loop_ — a
clear before/after transformation the paywall can point at. Crave's loop is per-session
("craving → exact dish + where"), not multi-week transformation — so Clear30/hero's-
journey paywalls are the wrong archetype; "show the answer working" (video/real data)
is the right one.

## Crave-specific takeaways (to feed the ledger)

1. v1 paywall spec is basically dictated: bullet-list benchmark + no-commitment line +
   Continue + annual default w/ trial badge + real-app video variant as test #2.
2. $39.99/yr sits exactly at the market-settled band. $7.99/mo is _above_ the wrapper
   norm — fine (utility + insecurity-free but real recurring value), watch monthly take-rate.
3. Trial-cancel ~50% and 8%→15-20% conversion ranges = inputs for the revenue model.
4. Don't burn pre-launch weeks on paywall A/B; no traffic = no significance. Benchmark + go.
5. Flag the decline-cascade ↔ Apple-rule conflict for adversarial review.
