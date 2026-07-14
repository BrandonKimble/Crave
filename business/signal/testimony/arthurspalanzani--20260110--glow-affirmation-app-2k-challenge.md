---
source: arthurspalanzani/20260110 - How I built an app that makes $2,000 in one month (from scratch) [Z-0Vf79GD3w].txt
date: 2026-01-10
speakers: Arthur (surname uncertain — channel slug "arthurspalanzani"; auto-captions garble it); 20-year-old 4th-year CS student, solo dev, prior failed AI-for-doctors startup
apps: Glow (daily affirmations app for Nordic winter/seasonal depression); category: lifestyle; claimed scale: ~$2,800 revenue / ~$2,000+ profit in last 28 days, 66 active subscriptions, 46 active trials, MRR $143 at day ~46; business model: hard-ish paywall at end of onboarding (pay now OR 3-day free trial), $10/mo or $40/yr with 3-day trial on yearly
evidence_quality: first-party-numbers (own dashboards shown on screen: RevenueCat, App Store Connect, TikTok Ads, PostHog) — but self-reported, unaudited, and the "profit" figure leans heavily on one-time free ad credits
incentive_flags: survivor telling his own success story; building an audience/Discord community and filming a course ("AppSprint" domain purchased) — the $2k number is the channel's product; timeline framed as 30 days, actually ~60
---

## Arc

Arthur, a 20-year-old CS student who previously co-founded a failed AI startup for doctors, challenges himself to build an app from scratch to $2,000/month profit with only $200 of his own ad money. He clones the proven "daily affirmations" category (I Am, Daily Affirmations, Daily Motivation) with a niche angle — Nordic-winter seasonal depression, cozy candle mascot "Glow" — ships in ~1 week with Expo/React Native, and grinds through failed organic content into TikTok paid ads plus relentless onboarding/paywall A/B testing. Hits ~$2,800 revenue / claimed >$2,000 profit in the trailing 28 days around day 57. The video exists to feed his YouTube channel, Discord community, and an in-progress course.

## Claims

### Pricing & paywall

- Subscriptions: **$10/month** or **$40/year with a 3-day free trial** — trial only on yearly ("I want people committing long-term"). Deliberately huge monthly-vs-annual gap. (first-party)
- Per-country price points set individually for Nordic countries (currency differences). (first-party)
- Paywall built from RevenueCat templates: hero image (mascot), testimonials, pricing cards; one-click publish. (first-party)
- Copied the special-offer screen pattern from the I Am app: "pay now or start the trial" popup immediately after onboarding, "just like Duolingo… quite smart, but aggressive." (claimed observation of competitor)
- Three-step trial-explainer paywall: screen 1 = "3 days free trial," screen 2 = "reminder one day before trial ends," screen 3 = what you get by subscribing. Rule stated: **one piece of information per screen**, never one paywall crammed with everything. (first-party practice)
- Paywall A/B via RevenueCat Experiments (metric: initial conversion rate); copied a "claim" paywall variant from a **Superwall** video; RevenueCat reportedly recommends waiting for **>50 conversions per paywall** before judging. (first-party + secondhand)
- **Billing grace period (App Store Connect) switched on, set to 3 days** → "made me three or four new subscriptions… nearly 10% of the revenue is coming from that." (first-party, the 10% claim likely loose)
- Apple/Google take 30%; **Small Business Program reduces to 15%**, leaving 85%. RevenueCat free under **$2,500/month**. (claimed, standard facts)

### Trial & onboarding

- Core thesis: **"spend nearly 90% of your time on the onboarding… more than 80% of conversions are during the onboarding… way more important than the app itself."** (first-party conclusion)
- Competitor I Am has **40+ onboarding questions**; he cut to ~15 screens max. (claimed observation)
- Onboarding completion improved **74% → 83%** overnight after adding a progress bar + commitment screen (copied "commitment psychology" from a RevenueCat article, as used by Flo/Duolingo/Headway: "tap/hold to commit" right before the paywall). Baseline had been 76% completed; target was 80–85%. (first-party)
- PostHog onboarding A/B: 4 variants, **300+ users**; "no pact" variant (one specific screen removed) won on BOTH completion and conversion; the "less personal questions" variant (3 screens removed) drove **zero conversions** — "really small changes can change everything." (first-party)
- Post-onboarding tutorial + "For You" recommended categories added after seeing trial users cancel within "2 or 3 minutes" of starting — diagnosed as users not seeing value fast enough. (first-party)
- Notification permission: only **2/3 of users allowed notifications**; added a pre-permission explainer screen + a post-denial "you're missing out" screen. (first-party; result of the change not reported)
- Funnel end-state: **download→trial ~14%+ average** (spot days: 136 downloads→17 trials = 12.5%; 29 downloads→6 trials = 20.6%; 50 downloads→8 trials = 16%), **trial→paid ~31%+**, computing to "**$1.64 per 100 downloads… for every download I earn $1.64**" — NOTE: transcript literally says "$164 for 100 downloads" then "for every download I earn $164"; the internally consistent reading is ~$1.64/download (garbled decimal, flag as uncertain). (first-party)
- Earlier trial→paid was **0%**: 10 trials from first ad flight, nobody converted. (first-party)

### UGC & creator deals

- Paid a girl on TikTok **$20 per video, 3 videos of 5 seconds each ($60 total)** — "worked really well because it's TikTok native format." (first-party)

### Content strategy (organic)

- Organic TikTok largely FAILED for direct installs: warmed up account a few days (like/comment in niche before posting so the algorithm flags the niche), posted ~15 videos by day 22, only 2 broke 2,000 views → **exactly 2 trial signups, both canceled immediately**. (first-party)
- Three organic formats prescribed: POV videos ("POV: you finally found a wellness app for seasonal depression"), product demos, transformation/results ("used this app 3 weeks, here's what changed"). Plan: 10–20 pieces, 2–3 posts/day, "a numbers game… we only need one to pop off." (first-party playbook, unproven by his own results)
- YouTube shorts to his own dev audience: 2 shorts, **20,000 views total, ~300 link clicks, only 10 attributed downloads** — bad conversion because his audience is developers, not affirmation users (audience-product mismatch). (first-party)
- Single Reddit post (others banned on productivity subreddits): **10 upvotes, ~3,000 views**; free-access offer. Later daily Reddit posting; an Expo-subreddit post led the Expo team to invite a guest blog post on their site (+ free t-shirt). (first-party)
- Launch tactic: made the app **completely free with lifetime pro access** initially — explicitly to farm downloads + reviews for algorithmic traction, "I won't make any money from this, but that's not the point." Result: **~900 downloads** early (WeChat ~200 via apparent Chinese group-share, App Raven/"apps gone free" auto-created page, Telegram), **600+ claimed the free lifetime offer**, 8 ratings incl. two 1-star (avg 4/5) — one 1-star for not being able to buy premium while it was free. (first-party)
- Answer every review publicly — "you're not answering the angry guy, you're showing future users that you give a [care]." (first-party practice)

### Paid ads

- Personal budget cap: **$200 own money** total; TikTok smart campaign, iOS-14-dedicated, app-install objective, Nordic countries, English, 18+, **€25–30/day** (TikTok's stated minimum is $50/day; he ran under it). (first-party)
- Attribution: TikTok Events SDK **not supported by React Native/Expo** — built his own native wrapper on a broken library; MMPs rejected as "a few cents per install… way too expensive." (first-party)
- First 3-day test flight: ~**100 downloads/day at €30/day**, 10 trials, **0% trial→paid, lost ~€55–60 of ~€60 spent**. (first-party)
- Rule: let TikTok campaigns run **≥3 days** before judging (algorithm learning phase); created a NEW campaign (not resumed) after the onboarding rework to reset the learning phase. (first-party practice)
- After onboarding rework: "$160 by spending only €30" on day 34; day 35 two new payers ($80) + 10 trials started; day 36 **$164 revenue, 4 new payers**; ads driving **200+ downloads/day**. Best day: **7 conversions, $278+** (day ~53). (first-party)
- **Free ad credits were half the economics**: TikTok new-account promo "spend $200 get $200" (actually credited €172 on €180 spent), later another €100 (~$115) coupon; total recap = **20 days × $35/day ≈ $700 gross ad spend, of which $210 + $150 = $360 was TikTok free credits**; plus $60 UGC videos. Profit defined as revenue − 15% Apple cut − ad spend. (first-party; the $2k "profit" materially depends on these one-time credits — he says so: "really good profit because I had lots of free credits")
- **Apple Search Ads: total failure** — $100 promo credit, tried different CPT bids, wouldn't spend, **4 downloads total**: "this is not working." (first-party)
- Best-performing creative: **<$0.10 cost per download** — rhythmic music over a default iOS Earth wallpaper video; 2nd: similar YouTube-ripped Earth video + trendy music; 3rd: the $20/video UGC girl. Pinterest-style "glow up in one month" formats got "freaking low" CPC but zero downloads (intent mismatch with his app). (first-party)
- Dayparting experiment: script over exported RevenueCat data → trial distribution by hour → restricted TikTok ad schedule to peak-conversion hours ("not really sure if that works"). (first-party, self-flagged speculation)

### ASO & app store

- Tool: **Astro**; rule of thumb: keyword **popularity >20, difficulty <50**. Example: "helse" (Norwegian "health") popularity ~70, difficulty 46. (first-party)
- Title = 2–3 main keywords, subtitle = supporting keywords; renamed app to explicit "Glow: Daily Affirmations." Claim: Apple ranks partly on most-recent reviews → "new reviews on new keywords = higher ranking." (claimed mechanism, first-party practice)
- Early retention was terrible on generic keywords — **only 15% day-2 retention** ("people downloaded but expected something else") → switched to specific keywords BEFORE driving new traffic. (first-party)
- Product-page optimization A/B (App Store Connect) on app icon started; no result reported. (first-party, inconclusive)
- Final review state: **55 ratings, 4.7/5** (some reviewers got free premium via Reddit campaigns — mild goosing acknowledged). (first-party)
- First submission **rejected** for privacy-label mismatch (checked "tracking" on everything); 5-minute fix, but re-review took 5 days. "Most apps get rejected on first submission for tiny things." Later submissions approved in hours-to-2-days; one later version also rejected once. (first-party)

### Launch & sequencing

- Idea selection: copy a proven top-grossing category (affirmation apps — "one feature, that's it"), differentiate by market/angle (Nordic winters, 4 hours of sunlight, seasonal depression) rather than invent. Screenshot every competitor screen into Figma first. (first-party)
- Build stack/speed: Figma → Dribbble inspiration → mascot via ChatGPT (following Chris Rarok's tutorial — name uncertain), Expo/React Native, no login/signup (all on-device, works in airplane mode), Swift widgets via tutorial, Supabase (2 tables: onboarding answers + feedback), RevenueCat, Next.js landing page "90% written by Claude" in 1 hour, ChatGPT-drafted privacy policy/ToS, EAS build/submit. App essentially built in ~1 week of days. (first-party)
- New Apple developer account purchased to separate from his old startup. (first-party)
- 100-download early milestone framed as the threshold where "the App Store will do its algorithm thing." (claimed mechanism)
- Timeline honesty: expected 30 days, took ~60. Payout lag: Apple holds money **30–45 days**, so he self-loaned float for ads; notes RevenueCat is building an instant-payout-for-a-fee product. (first-party)
- Tip: Apple's **Transporter** app uploads a build in ~5 min vs 1–2 hr EAS free-tier queue. (first-party)

### Retention & product

- Day-2 retention only **15%** early on — attributed to keyword mismatch, not product. (first-party)
- Post-launch rule: only code from user feedback + key metrics (retention, conversion, demographics); "retention by far" most important — "if users log in daily… I won't have any problem to convert them." (first-party stance; note his actual wins all came from onboarding/paywall, not retention work)
- Dark mode = most-requested feature (20+ messages), took 6–7 hours. Later "practice" feature: TTS affirmations via **Gemini API**, audio stored in Supabase. (first-party)

### Team, tools & cost structure

- Solo; total own cash: **$200 ads + $60 UGC + Apple dev account ($99, implied) + $20 domain-ish (AppSprint)**; RevenueCat free tier (<$2,500/mo); Supabase; PostHog experiments; Jitter for animations; Claude Code + ChatGPT throughout. (first-party)
- End-state dashboard trail: day ~46: 22 trials / 37 subs / MRR $143 / revenue ~$1,500; day 55: 39 trials / 61 subs / $2,400 per 28 days; day 56: 46 trials / 66 subs / ~$2,600; day 57: **~$2,800 revenue per 28 days, claimed >$2,000 profit**. First App Store payout email: **$800+ for the first month**. (first-party, on-screen dashboards)

## Deal structures

- UGC: **$20 flat per video** to one TikTok creator; 3 videos × 5 seconds = $60 total. No rev-share, no exclusivity discussed.
- Platform promos (not negotiated deals): TikTok spend-match credits ($210 then $150, later ~€100 more); Apple Search Ads $100 promo credit.

## Contrarian positions

- **The onboarding IS the product for revenue**: 90% of effort on onboarding/paywall, >80% of conversions happen there, "way more important than the app itself" — inverts build-a-great-app-first advice.
- Organic content (TikTok + own YouTube audience) is framed by most indie-dev advice as the free growth engine; his own data shows it failed (15 videos → 2 canceled trials; 20k views → 10 installs) and paid ads + funnel optimization carried everything.
- Launching **fully free with lifetime pro** to farm reviews/traction before monetizing — most advice says never train users to expect free.
- Trial only on the annual plan, with an aggressive monthly-vs-annual price gap ($10/mo vs $40/yr), copied from category leaders rather than "fair" pricing.
- Judges nothing before 3 days of ad delivery / 50 conversions per paywall variant — anti-impatience stance.
- MMPs (Adjust/AppsFlyer-class) dismissed as not worth cents-per-install at small scale; built janky native SDK glue instead.

## Crave transfer

Treat this as a funnel-mechanics source, not a strategy source: the transferable material is the onboarding/paywall craft (progress bar + commitment screen moving completion 74%→83%, one-info-per-screen trial explainer, A/B with real minimum sample sizes, billing grace period ON, download→trial ~14% / trial→paid ~31% as reference points for a paywalled consumer app) — all cheap to adopt and directly relevant to Crave's hard paywall. The category and economics do NOT transfer: Glow is a global, zero-backend, single-feature lifestyle clone where a $0.10 CPI on broad TikTok targeting works; Crave is geo-locked to Austin, so paid social CPIs against a one-city audience will be far worse, and his entire "profit" margin rode one-time TikTok credits ($360 of ~$700 spend) plus a garbled ~$1.64/download unit number — do not benchmark Crave LTV/CAC against it. His strongest negative results are arguably the most useful: organic TikTok and posting to a mismatched existing audience produced near-zero installs, and Apple Search Ads spent nothing — cautionary for Crave's no-ad-budget organic plan, which will need genuinely local creator/UGC angles rather than volume-posting generic formats. Survivorship and incentive distortion are high (he's building a course/Discord off this exact narrative), and note Crave's paywall is harder than his (card required, no free tier) while his 3-day trial sat on the CHEAPER-commitment annual plan — same structure as Crave's annual-only trial, which is mild convergent validation of that specific mechanic.
