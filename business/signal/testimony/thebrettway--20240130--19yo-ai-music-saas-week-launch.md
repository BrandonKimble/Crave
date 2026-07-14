---
source: thebrettway/20240130 - The 19-year-old Who Built a $1.5M Ai SaaS in 7 Days [oUZsCS-N0QA].txt
date: 2024-01-30
speakers: "Guest: 19-year-old founder of Musicfy (auto-caption renders it 'music file/music F/music fi/music vibe'; name garbled as 'Arab/Arib', handles @ARB K24 Twitter / @aribk7 Instagram — likely Arib Khan, UNCERTAIN). Host: Brett (The Brett Way podcast)."
apps: 'Musicfy — ai-utility (AI voice conversion / voice cloning for music); claimed ~$1.2–1.5M first-year revenue, $100K+/mo MRR at 8 months, ~2M total users, ~1M MAU; model: started free, then $1/mo subscription paywall, later raised prices (final consumer price never stated); pivoting to B2B (gaming audio) with $10s–100s of thousands/yr contracts. Secondary mentions: buildspace (education, raised $12M, 200K students), Tweet Hunter (sold ~$10M), Beat Saber (claimed $2B sale to Meta).'
evidence_quality: 'claimed-numbers throughout (founder narrating own metrics, no screenshots/dashboards); secondhand for Beat Saber $2B, Tweet Hunter $10M, Shopify affiliate $500, Musa 3x; anecdote for most growth-mechanics claims.'
incentive_flags: "Host sells a no-code SaaS course (WGMI Academy 'Future Dev' — bubble/make.com) and inserts a mid-roll ad for it; guest is building a personal brand explicitly to launch future products and is hiring content creators; guest plugs a friend's product (Tolt) twice; classic survivor telling his own success story with round numbers."
---

## Arc

A 19-year-old SF-based dev (ex-buildspace employee, ex-web3) built Musicfy — an AI voice-to-voice conversion tool riding the viral "AI Drake" wave — in 7 days, hit 100K free users in the next 7 days, monetized reactively after GPU bills spiked, and is at claimed $100K+/mo MRR eight months post-launch. The interview is a growth-playbook walkthrough: affiliate army, catching research-paper trends early, and a pivot to B2B gaming audio after a triple cease-and-desist from major labels.

## Claims

### Pricing & paywall

- Launched completely free with no auth, no rate limiting, no monetization; "I was losing money" — burning ~$3,000/day in GPU credits in the first weeks. (claimed)
- Expected to spend ~$5K total as a resume project; costs hit "$10–12K" before he monetized. (claimed)
- First paywall = a $1/month subscription slapped on with no strategy: $95 of $1 subs in the first hour, ~2,000 paying by end of day one — "so 2,000 people paid a dollar today... I could probably raise it a little bit more." Then raised prices (new price never stated). (claimed)
- At 8 months: "over 100K a month in MRR"; first-year revenue projected $1.2–1.5M. (claimed, headline number)
- Switched payments from Stripe to Paddle to accept PayPal ("PayPal is a huge thing worldwide"); claims a 20–30% increase in subscription conversion from the switch. (claimed)
- B2B API is gated by a spend floor: closed API offered only to customers committing at least $10K spend. (first-party description of own policy)

### UGC & creator deals

- Affiliate program is the core growth engine: ~4,000 people (elsewhere "4 or 5,000") made TikTok pages pushing affiliate links. Base rev-share 25%; some custom affiliates at 30–40%. Biggest single affiliate has earned $50,000. (claimed)
- Affiliate ops run by one 16-year-old paid $500/month, managing everything in Discord since launch month. (claimed)
- Affiliate tooling: Tolt (tolt.io) — anyone makes a link in <5 min, hooks the Stripe (or Paddle) checkout endpoint; dashboard tracks leads/referrals/plans. Guest calls it "one of the best companies I've seen in the last year" — but notes it's "one of my friends companies." (incentive-flagged endorsement)
- Now converting top affiliates into salaried in-house content creators ("monthly or weekly sal[ary]"), copying a strategy attributed to "Oliver." (claimed, garbled reference)
- 10–20 YouTube videos exist about the product that the company never made — creators made them "because our product was good" plus the affiliate link nudge. (claimed)
- Secondhand: friend Musa's info product revenue "3x" as soon as he launched affiliates on it. (secondhand)

### Content strategy (organic)

- Traffic-quality contrast (the load-bearing claim of the video): TikTok = huge volume, terrible conversion; long-form YouTube = small volume, dense revenue. Numbers given: ~300 million TikTok views in a month → only ~$20–30K revenue; ONE YouTube video by a music producer with 300K views → $30K revenue in a month. "Huge contrast. The density of YouTube." (claimed; the 300M figure is suspiciously round — treat as directional)
- Viral demo videos as distribution: his voice-to-trumpet demo got ~4,000 likes on Twitter; a similar talking-demo on an Instagram page got ~30 million views overnight. First AIHub demo: "you might be wondering why I sound like Drake right now... now I sound like Ariana Grande." (claimed)
- Controversy-as-marketing: "to create any type of viral product you want to make a lot of controversy" — AI Drake had lovers and haters both talking. (stated strategy)
- Distribution didn't come from his own audience — he had none. Seeded via an existing community: found the AIHub Discord (only 5–8K members then) full of non-devs failing to run the models, gave ~30–40 beta users the tool, asked the Discord's founder to announce it — that announcement drove "10–20,000" visits and one beta user made the viral AI Drake song ("all of our distribution done for us"). (claimed)
- His general playbook for a new idea: create the Discord community / newsletter / IG + TikTok theme pages around the topic first, then present the product natively into it. (stated strategy)

### Paid ads

- "I have never r[u]n any ads for Musicfy... so I can't talk about ads." Zero paid acquisition claimed for the entire run. (first-party)

### Launch & sequencing

- Timeline: idea → launch in 7 days; launch → 100,000 users in 7 more days; launched April 2023; C&D letter from Universal, Sony, AND Warner Music at 3 weeks in (framed on his wall). (claimed)
- C&D response same day: deleted all celebrity models (Drake/Kanye), replaced with (a) paid user-trained custom models — "that's where our pricing came in" — and (b) 100 in-house voices: 50+50 unknown people, 10-minute recordings each, blended via linear interpolation (50/50 model-weight mixes) into voices that "never existed" = no copyright. Monetization was forced by legal threat, not planned. (claimed)
- Prior practice: built a new app every month for 4–5 months after leaving buildspace (one was "Lensa two weeks before Lensa"); Musicfy was app #5-ish. Analogy: Tweet Hunter did the same and sold for $10M. (claimed/secondhand)
- Trend-spotting stack: arXiv research papers (earliest signal), Hacker News, Hugging Face (new models). Vocal-style-transfer paper + first AI Kanye video = "industry advancement + distribution happening → build." (stated method)
- "Iterate in the wild" / buildspace's "GTFOL — get the f off localhost": v1 shipped with no login, no rate limiting (which is why costs blew up), fixed live. (first-party)

### Retention & product

- Entertainment users vs. business users: AI-cover tourists churn ("if the site goes down tomorrow they disappear"); producers/pro users have "much higher retention" — deliberate repositioning toward the professional use case post-C&D. Claimed A-list usage incl. Louis Bell (Post Malone's producer) under NDAs. (claimed)
- Quality bar as moat: next model takes quality "from 95% to 97%"; competitors who kept offering Drake/Kanye voices grow fast but carry label legal risk + non-sticky entertainment users. (claimed/speculation)
- Scaling warning: past $50–100–200K/mo it gets harder; one UI change to a login page can move retention ±5%. (anecdote)

### Team, tools & cost structure

- Team of 4, all engineers; solo + 1 person for the first 4–5 months; 2 part-time engineers added later. Plus the $500/mo affiliate manager and ~4–5K affiliates (not employees). (claimed)
- Funding: only two checks, both strategic and inbound — Founders Inc (incubator he worked out of) and one angel, ~$100K, from the Beat Saber founder (name garbled "Jer slav" — likely Jaroslav Beck, UNCERTAIN; claim that Beat Saber sold to Meta for $2B is secondhand and likely inflated — reported figures were never confirmed at that level).
- B2B gaming plan: contracts "tens to hundreds of thousands of dollars a year"; example — a studio paying a sound agency $50K/game could get the in-house tool for $30K/yr; 3 pilots targeted by end of December, full launch Jan–Feb. Market logic: music software TAM <$1B vs gaming ~$250B expected to double in 3 years. First 10–20 B2B customers sourced through the two investors' networks. (claimed/plan — unverified forward-looking)
- Stack: TypeScript/Next.js, Supabase, Modal (serverless GPUs — pay only for spun-up capacity, key to surviving spiky load), no third-party model APIs (self-hosted = defensibility + lets them SELL an API). Tools: PostHog (session recordings/heatmaps, "best analytical tool"), Retool, Paddle, Tolt, Customer.io (CRM, "quite expensive"), Superhuman, Cal[.com?] (garbled "Kon", UNCERTAIN).

### Other

- "If you have distribution you can be any company" / it's not too late in AI if you have distribution. For a non-technical founder: don't learn to code — find someone with distribution, then recruit a dev with that leverage; find devs by dropping a bug in a Discord and seeing who solves it. (stated playbook)
- Claim: ~30–40% of AI startups would die if the OpenAI API shut off. (speculation)

## Deal structures

- Affiliate rev-share: 25% standard, 30–40% custom for big accounts; per-signup payment framing ("getting paid for every sign up"); top affiliate lifetime earnings $50,000.
- Affiliate manager: $500/month flat (16-year-old, Discord-based).
- Top affiliates graduated to weekly/monthly salaries for in-house content.
- Angel check: ~$100K from Beat Saber founder; Founders Inc check (amount unstated); both taken "for connections," not money.
- B2B target deal: ~$30K/yr per game studio (vs. their $50K/agency status quo); API access floor $10K minimum spend.
- Secondhand: Shopify affiliate payout "~$500 per" referral; dropshipping gurus "pay the entire LTV up front to affiliates."

## Contrarian positions

- Paid ads are entirely absent from a $1.5M/yr run — against the default "test FB/TikTok ads" playbook.
- Viral TikTok reach is nearly worthless for conversion (300M views ≈ one 300K-view YouTube video in revenue); optimize for dense, intent-matched long-form instead.
- Don't learn to code and don't build an audience yourself — be the dealmaker who pairs an existing distributor with an existing dev.
- Launch with no auth, no rate limiting, no monetization; let the market and even a cease-and-desist letter design your pricing ("iterate in the wild").
- Controversy is a feature: pick a product that makes both fans and haters post.
- Entertainment virality is explicitly the WRONG customer; business users are the retention base — he's abandoning the viral wedge for B2B.

## Crave transfer

Category mismatch is severe: Musicfy is a single-session AI-wow utility that monetized an exploding trend with a $1 impulse paywall — almost nothing about its pricing arc (free → $1 → raise) transfers to Crave's hard $7.99/$39.99 gate on a repeat-use local utility. The transferable core is the TikTok-vs-YouTube density claim (300M views → $20–30K vs one 300K-view creator video → $30K): for Crave, one deep Austin-food YouTube/long-form creator embed should beat any volume of viral map-screenshot reach, and creators with existing local-food audiences are the analog of the AIHub Discord — seed an existing community rather than building an audience from zero (Austin food Reddit/TikTok communities are Crave's AIHub). The affiliate mechanics (25% rev-share, Tolt-style friction-free links, a cheap community manager) are directly testable at Crave's price point, though App Store commerce makes link-attributed rev-share harder than a Stripe web checkout — but Crave's paywall being card-required web-adjacent pricing may allow a web funnel where this works. Discount every metric here: all self-reported, round, and told by a survivor on a host's channel that sells a build-a-SaaS course; the "never ran ads" claim is credible but rests on catching a once-a-cycle viral wave Crave will not get.
