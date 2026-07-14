---
source: arthurspalanzani/20260203 - I built a PROFITABLE app in 72 hours [oEiuULJUSHU].txt
date: 2026-02-03
speakers: Arthur Spalanzani (solo indie iOS developer, French student, YouTuber, runs a paid Discord community)
apps: >
  Glow (his own; lifestyle — daily affirmations; claimed ~$2,000/mo profit at peak plus ~$800 made "organically" while paused; subscription paywall, prices localized via Price Localize);
  New prayer-reminder app, unnamed on-screen (his own; lifestyle — prayer reminders/streaks/widgets; brand new, no revenue data yet; monthly+yearly subscription A/B via RevenueCat);
  "Preycreen"/PrayScreen [name uncertain, garbled] (third-party; lifestyle — locks phone to pray; "making real money", no figures);
  Prayer Lock (third-party; lifestyle; claimed $20K revenue/mo on 20K downloads/mo);
  Discord member's photo-restoration app (third-party; ai-utility; no figures)
evidence_quality: claimed-numbers for his own Glow revenue (no dashboards shown in transcript); secondhand for Prayer Lock ($20K/mo) and PrayScreen; anecdote/speculation for most tactical advice — the new app had zero market data at filming
incentive_flags: sells a paid community/Discord (explicit pitch at end, "link in the description"); asks viewers for 5-star reviews and downloads of the new app; survivor narrating his own success; tool mentions (Astro, RevenueCat, PostHog, Price Localize) possibly affiliate-adjacent but no disclosure either way
---

## Arc

Arthur is a French student/indie dev whose affirmations app Glow reached a claimed ~$2,000/mo profit, then he paused ads for ~4 weeks to incorporate a company in France because personal-account taxes would have taken "almost half of everything." While waiting, he challenges himself to build and ship a new app — a prayer-reminder app cloning Glow's structure into a validated niche — in 72 hours, documenting the idea-sourcing, ASO, onboarding, pricing, and launch playbook. The video doubles as a funnel into his paid Discord community.

## Claims

### Pricing & paywall

- Uses RevenueCat for payments; its key value to him is remote paywall experiments — "different UI, different products, different prices" pushed to users without an app update; new users download the latest paywall on open. (first-party workflow, no results shared)
- Advises testing many product pairs on the paywall: weekly+yearly vs monthly+yearly vs yearly-only. (claimed best practice, no data)
- Started the new app's A/B test with monthly + yearly prices. (first-party)
- Price localization by purchasing power: Apple's automatic currency conversion "is not great at all" — a $50 US subscription "might still cost the equivalent of $40 US in Brazil." Uses the Price Localize app: set a reference price (example $30 US), it computes purchasing-power-fair prices per country; has a purchasing-power-parity index template that mirrors "the exact same ratio that Netflix uses." (first-party workflow; the $50→$40 example is illustrative, not measured)
- Result claim: after localizing Glow's prices he "started getting trials from countries I never had before." (first-party, claimed, no counts)

### Trial & onboarding

- Core thesis: "80% of the revenue is coming from the onboarding" — the onboarding flow is the single most important revenue lever; iterate by reordering screens, adding/removing screens, changing the paywall placement. (claimed; no attribution shown)
- Onboarding schema copied from top-performing apps: (1) ask about the user's problems to pinpoint the biggest pain point, (2) make them feel understood, (3) show how the app solves it, (4) create a "wow moment" immediately before the paywall. Goal: "make your users emotionally invested in your app before they ever see a price." Feature-list-then-paywall "won't convert" — "you'll get destroyed." (claimed best practice)
- His onboarding asks name, age, and daily phone-time, then reframes: a fraction of your screen time could be prayer time. Deliberately long ("lots of different questions"). (first-party design choice, unvalidated at filming)
- Shipped TWO onboarding flows at launch for an immediate A/B test. (first-party)
- Case study: a Discord member's AI photo-restoration app had a features-then-paywall onboarding, "no emotion"; the fix was restoring the user's first photo inside the onboarding — see the magic before the price. (secondhand, no numbers)
- Small polish claims: haptics on next/animation-end feel "more premium"; liquid-glass buttons look premium. (opinion)

### ASO & app store

- Idea sourcing: watch where founders share numbers — Superwall's YouTube channel and Starter Story. Found "Preycreen" [uncertain spelling] (phone-lock-to-pray, "making real money"), then competitor Prayer Lock at a claimed $20K revenue/month on 20K downloads/month. (secondhand)
- Keyword validation BEFORE writing code — "the step most people skip and it's the reason most apps fail." Uses Astro (ASO tool) against Apple's API per target country. Thresholds: difficulty under 55 (he also says "under 60, 55") and popularity above 20. For the UK only ONE keyword passed: "daily prayer." (first-party workflow; thresholds are his heuristics)
- From apps ranking on your keyword, inspect THEIR keywords (Bible, Bible app, prayer times UK) and harvest them. (first-party workflow)
- Localization as growth hack: translate in-app content (his content lives in one big JSON keyed by screen; a script sends it to the Claude API for translation) AND create App Store variants per language — new title, description, screenshots — so you rank on Spanish/French/German keywords, not just English. Only translate for main target markets, not all languages. New app shipped in 3 languages: English, Spanish (targeting Mexico), Portuguese (targeting Brazil). (first-party workflow; traffic claim unquantified)
- Screenshots: most organic traffic lands on the store page; ugly screenshots forfeit it. Funnel = keywords (top) → app icon + screenshots (impression→download conversion). Reused his Glow Figma templates; generated ~a dozen Jesus artworks with Gemini and used the best as an eye-catching first screenshot; screenshots produced in all 3 languages. (first-party workflow)

### Launch & sequencing

- New apps get an initial ~3-day App Store boost pushing the app to people searching your target keywords — but ONLY if keywords, screenshots, and app icon are nailed (i.e., impression→download conversion is good); "if any of those are wrong… the boost won't work." (claimed mechanism, no source)
- Three-step validation framework, organic first: (1) organic only — "do not start with ads"; no downloads = keywords/screenshots/icon broken; (2) downloads but no trials = onboarding broken, use analytics to find the drop-off; (3) trials but no payments = paywall/pricing wrong or features broken. Only after the funnel is fixed do you spend on ads — otherwise "you're just paying to send people into a broken system." (claimed framework)
- Free-traffic accelerator: a new Apple Ads account gets $100 free credit; run a campaign on your exact target keyword to get data faster than waiting for organic. (claimed; credit amount is a standard Apple promo)
- App review: Apple usually takes 24–48 hours, first submission up to ~3 days max and is the hardest; expect a first-submission rejection and resubmit. (first-party experience)
- Anti-virality stance: "you only see the top 0.001%" — the one-viral-TikTok-to-50K-MRR story "is not how most of the app works"; optimize the free levers instead. (claimed)
- Plans to publish the video ~1 month after the app launch so YouTube traffic doesn't contaminate onboarding data. (first-party)

### Retention & product

- Feature set deliberately minimal — really ONE feature (prayer reminders/notifications) plus widgets, streaks ("people love to have streaks"), and prayer history: "way better to do one thing but super well" than five average features. (claimed principle)

### Team, tools & cost structure

- Solo; built the whole feature set in ~2.5 hours using Claude Code by reusing Glow's codebase — "build clean code" so the structure ports to the next similar app. Total build: 72 hours idea→submission. (first-party)
- Tool stack: Astro (ASO keywords), Figma (screenshots), Gemini (artwork), Claude/Claude Code (code + color palettes + JSON translation), RevenueCat (payments/paywall experiments), PostHog [transcribed "Postto/postg", near-certain PostHog] (A/B testing + event tracking), Price Localize (PPP pricing), Google Fonts. (first-party)
- Analytics as non-negotiable: without event tracking "you're just blind… you'll think the problem is your paywall, but actually 60% of users are leaving on screen three" [illustrative number, not measured]. (claimed)
- France tax/structure: running Glow through a personal account meant losing "almost half" to taxes at its growth rate; paused ads ~4 weeks to incorporate; Glow still made ~$800 organically while paused. (first-party, claimed)
- Portfolio strategy: prefers multiple apps at ~$2K/mo each over scaling one to $10K–$50K — de-risks ad-account bans and competitor takeover; finds 0→1 more interesting than 2→10 scaling. (first-party stated preference)
- Monetizes audience via a paid community: weekly group calls, roadmap, tool list; "the main value of this community is through those group calls." (first-party, self-promotional)

## Deal structures

None discussed. No creator/UGC/affiliate deals mentioned; the only ad spend referenced is Apple Ads ($100 free credit tactic) and previously running ads on Glow (no rates, budgets, CPI, or ROAS given).

## Contrarian positions

- "80% of revenue comes from onboarding" — inverts the usual product-first framing; onboarding/paywall choreography over features.
- Do NOT launch with paid ads; the App Store's 3-day new-app boost plus fixed funnel comes first (against the "buy data immediately" school).
- Anti-viral-TikTok: dismisses the dominant UGC-virality narrative as top-0.001% survivorship.
- Portfolio of small ~$2K/mo apps over one scaled winner — against standard "focus and scale" advice.
- One feature done superbly beats five average ones (conventional in principle, contrarian against feature-checklist competitor matching).

## Crave transfer

Category and scale are badly mismatched: this is a template-clone, low-build-cost, broad-keyword lifestyle niche where the entire moat is ASO + onboarding choreography; Crave's moat is city-scale data density and it launches in ONE metro, so the "3-day keyword boost" and multi-language store variants transfer weakly (Austin-local intent barely registers in national keyword tools, and Spanish/Portuguese variants are irrelevant at launch). What transfers well: the funnel-triage framework (organic first; downloads-no-trials = onboarding; trials-no-pay = paywall/pricing) maps cleanly onto Crave's hard paywall and is cheap discipline; the emotional-investment-before-price onboarding schema is directly applicable — Crave's "wow moment" before the card wall should be a live, personalized taste of Austin's ranked dishes, not a feature list; RevenueCat remote paywall experiments and rigorous event analytics are near-universal. Treat the $2K/mo and $20K/mo figures as unverified claims from someone selling a community — the video was filmed before the new app had ANY market data, so the playbook is asserted, not demonstrated, for this launch. Ignore the portfolio-of-small-apps strategy; it is the opposite of Crave's depth-in-one-city bet, and his no-ads-at-launch stance coincidentally matches Crave's constraint rather than validating it.
