# Crave — Business Model

> Last updated 2026-06-27. Decision-grade; built from a deep-research pass, an adversarial
> red-team, a two-model bake-off, and a both-sides paywall-resurgence research pass.
> Companion: [monetization-and-gating.md](monetization-and-gating.md) (the feature-level free/paid map).

## Founder constraints & goals (the lens for every decision)

- **Solo, bootstrapped, limited cash, no ad budget** → growth must be organic / word-of-mouth.
- **Profitable early** matters more than scale. Happy anywhere from **$10–80k/mo up to ~$10M ARR**.
- **Stay independent** (no VC pressure to chase a unicorn). Values personal happiness over scale.
- **Integrity-first:** "no pay-to-rank, EVER." The objective ranking is the whole brand.

## The model: freemium + trial

**Freemium**, "AllTrails template" — give away the answer, charge for the defensible depth layer
the free incumbent lacks.

- **Free forever:** the objective restaurant ranking + Crave Score, restaurant search, map,
  open-now/price filters, poll voting + discussion. (This is the trust asset + word-of-mouth engine.)
- **Crave+ (paid):** the **dish** intelligence layer (the hero), rising/momentum + trending, and
  power filter/sort on your own favorites lists. Full free/paid map → [monetization-and-gating.md](monetization-and-gating.md).
- **Trial:** a soft, multi-step onboarding that lets people *feel* the rankings, then a trial of
  Crave+. The exact trial mechanic (reverse trial vs. honest time-limited trial vs. card-on-file vs.
  no-trial direct-purchase) is a **launch A/B**, decided on 60-day revenue-per-install — not assumed.
  Adapty's Lifestyle data shows trials can *reduce* LTV ~21%, so "trial = good" is not a given.

### Pricing

- **$7.99/mo + $39.99/yr**, with **annual as the headline** (annual ≈ 5 months; ~58% off).
- Push annual hard: annual retains ~44% at 12 months vs ~17.5% monthly (~2.5×), and front-loads cash.
- **No weekly plan** — 65% of weekly subs churn in 30 days, and weekly "divide-down" framing is
  exactly what got Cal AI pulled by Apple.
- Don't underprice; the Lifestyle band is ~$7.99–9.99/mo, $29.99–39.99/yr. $7.99 reads premium-enough
  without capping revenue-per-payer. Treat all prices as a **starting hypothesis to A/B**.

## Why freemium, not a hard paywall (the corrected reasoning)

Earlier reasoning leaned on "a paywall would starve the network." The codebase audit showed the
crowd is **~4/10 load-bearing, not existential** — the Score rebuilds from a founder-controlled
Reddit-mining pipeline with zero live users, the vote model is deleted, and polls feed the Score
only at close-time graduation. So the app is **day-one valuable to a single user** (no cold-start),
which actually makes a paywall *more* viable than for a typical network app. The real reasons to
start freemium anyway:

1. **Reversibility is asymmetric.** Tightening (freemium → paywall) is routine and grandfatherable
   (Netflix removed its trial at scale with no churn spike). Loosening (paywall → freemium) is the
   single most brand-destroying move available — it resets your price anchor to zero and burns your
   earliest payers (Evernote, Heroku, Her 75, App.net, Vero all corroborate). **Start in the state
   you can walk back; hold the harder gate as a data-earned later option.**
2. **No ad budget → the free tier is the only reach engine.** You can't go viral behind a wall.

### The paywall-"resurgence" verdict (so we don't get talked into the wrong thing)

- The resurgence is **real but overstated, and concentrated in a category Crave is not in** —
  acute-pain, single-session, GPU-costly AI utilities (Cal AI / Rizz / Umax, largely one promoter's
  playbook; the failures are invisible).
- "Hard converts 5× better" (10.7% vs 2.1%, RevenueCat) is a **survivorship/denominator artifact** —
  Adapty's view-to-payment metric shows **soft beats hard ~50%** (4.85% vs 3.34%). Different denominators.
- **1-year retention is model-independent (~27% vs ~28%)** — a paywall buys front-loaded cash, *not* stickiness.
- "86% of AI apps skip trials" = **busted / unverifiable. Do not cite.**
- Every authoritative source names discovery / network / UGC apps as where **freemium stays correct**.
- **Hard truth:** no Western pure-play food-discovery *consumer subscription* has scaled. Beli ("no
  coherent revenue model" after 4yr / 58M ratings), DoorDash's Zesty (dead in <5 months). The analogs
  that work monetize a **utility the free incumbent lacks** (AllTrails: offline/nav) or a no-free-
  alternative market (Tabelog/Japan — doesn't transfer to the US, where 62% discover via Google).
- **Plan for ~2–7% conversion.** ~4.6% of new apps clear $10k/mo within 2 years; Lifestyle is ~98%
  winner-take-all. This is a top-5% outcome contingent on the product being genuinely better, not on
  pricing cleverness.

## Sequencing & kill criterion

1. Launch **one city**, freemium, with the trial A/B running from day one.
2. **Pre-commit a kill criterion before launch:** e.g. if trial→paid is below ~5–6% after ~90 days
   AND free users show no referral/word-of-mouth lift AND free support load is crushing solo bandwidth
   → *tighten* (move the gate earlier, thin the free tier; harder paywall only as a last resort,
   grandfathering anyone who already paid). **Never run the reverse sequence (paywall → freemium).**
3. **B2B is Phase 2** — claimed restaurant profiles, analytics, sponsored polls — only post-density,
   and **never injected into the ranking** (see [monetization-and-gating.md](monetization-and-gating.md)
   and [brd-extraction.md](brd-extraction.md)). Likely the bigger long-run revenue pool.

## Funding stance

Stay **100% bootstrapped**; it's realistic here because solo opex is near-zero (so you can be
"default alive" at a few hundred payers). If fuel is ever wanted, only **founder-friendly,
non-dilutive-style** capital that doesn't force a unicorn: TinySeed ($120k + $60k/founder, dividend
returns, frames $5–10M ARR as a win) or Calm Company Fund's SEAL (no equity/board at inception,
returns capped at 2–5×, then nothing). Caveat: this capital is real but **thin and unstable** —
Indie.vc shut down in 2021 when its own LPs balked. Don't bank the plan on it.

## Apple-proofing (non-negotiable from v1 — a pull is existential for a solo founder)

Apple pulled Cal AI (April 2026, Guideline 3.1.2(c)/5.6) for four things — avoid all of them:
1. Show the **real billed number** most prominently (never a per-week divide-down bigger than the charge).
2. Auto-renewal terms **inline** + a visual trial timeline (what you get / when charged / how to cancel).
3. **Never re-prompt a decliner** with a second, different offer.
4. **StoreKit IAP in-app only.** The existing web Stripe rail is Apple-legal **only** for out-of-app
   checkout — never embed Stripe inside the app.

## Margin lever you already have

`apps/api/src/modules/billing` already runs **dual-rail billing** (Stripe web + RevenueCat iOS,
`UserEntitlement`, `SubscriptionStatus.trialing`). iOS nets ~85% (Apple Small Business, <$1M); web
Stripe nets ~97%. **Steer renewals / returning users to web checkout** for a ~12-point margin swing
(Apple-legal out-of-app). Use the existing notifications module for the trial-end reminder push;
Clerk for end-placed sign-in.

## Manifestos / reading list (the philosophy behind this path)

- *Rework* and *It Doesn't Have to Be Crazy at Work* — Jason Fried & DHH (the calm-company bible)
- *The Minimalist Entrepreneur* — Sahil Lavingia (tried for the billion, nearly died, found better)
- *The SaaS Playbook* + the "stair-step approach" — Rob Walling (MicroConf)
- "Default Alive or Default Dead" — Paul Graham
- RevenueCat *State of Subscription Apps*, Adapty *State of In-App Subscriptions*, Airbridge
  "Hard Paywall vs Freemium", RevenueCat's AllTrails product-channel piece (the template)

## Open decisions

- Exact trial mechanic (the launch A/B): reverse trial vs honest time-limited trial vs card-on-file vs no-trial.
- The free-tier cap on number of lists (if any).
- Whether/how to meter freeform (LLM-costed) search for cost control — see [monetization-and-gating.md](monetization-and-gating.md).
