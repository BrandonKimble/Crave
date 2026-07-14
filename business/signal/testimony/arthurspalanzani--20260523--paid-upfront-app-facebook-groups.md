---
source: arthurspalanzani/20260523 - #1 on the App Store with no ads [jQzJ-Xl4FT4].txt
date: 2026-05-23
speakers: Arthur (host, founder of AppSprint, a mobile attribution tool; also plugs "AppSprint community" and at the close says "App Launch" — name inconsistency, uncertain); guest "Brell" (name from auto-captions, likely garbled — solo indie dev in the Philippines, builder of Darcy)
apps: Darcy — offline-first budget tracking app with on-device AI (Apple Intelligence); category: tool; claimed scale ~$14.9k USD iOS + ~$19-20k total iOS+Android in first ~month; model: PAID UPFRONT app + optional in-app subscriptions for cloud features; Android priced $2 lower. Second app — unnamed trip planner; category: tool; claimed "#1 travel app in the paid category"; same paid-upfront playbook.
evidence_quality: claimed-numbers throughout (guest states revenue verbally; host asks him to share App Store Connect dashboard but transcript does not confirm figures were shown); marketing-channel claims are anecdote
incentive_flags: host sells paid-ads attribution tooling (AppSprint) and a paid community — ironic given the episode's no-ads thesis; guest is a survivor telling his own success story with no verification; auto-caption transcript, several numbers/names garbled
---

## Arc

Podcast interview: a solo dev in the Philippines built "Darcy," an offline-first, on-device-AI budget tracker, in a single weekend as a demo for a university vibe-coding talk. He published it as a PAID-UPFRONT app (no free trial, no paywall infra), it climbed to #1 on the App Store (chart/category unspecified), and he claims ~$20k in the first month across iOS+Android with zero paid ads — growth driven by a public Facebook group and a Strava-style social sharing feature. The episode exists to showcase the paid-upfront + community playbook (and to funnel listeners to the host's AppSprint tool/community).

## Claims

### Pricing & paywall

- App is paid upfront ("you have to pay before you download the app") — explicitly framed as "a completely different game" vs. free app + paywall + onboarding conversion. (claimed)
- Primary reason for paid-upfront: speed/simplicity — no separate paywall accounts, no RevenueCat or other payment-provider integration; "I just let App Store do the monetization." (first-party rationale)
- Secondary discovery: "people were willing to pay for something when there's no free trial"; positioning against subscription fatigue — "the market right now are full of freemium apps… users feel like it's a breath of fresh air" that the app gives unlimited accounts/usage without a subscription. (claimed)
- Hybrid layer: paid app ALSO has optional in-app subscriptions for cloud features (profile upload/sync across iOS+Android devices, bill splitting, more AI features) — justified because "these services cost me money to operate." (first-party)
- Anti-bait-and-switch rule: everything advertised in the App Store description/screenshots is included in the upfront price; cloud features are NOT shown in screenshots at all "cuz that might be misleading to customers." Subscriptions framed as "optional quality of life features." (first-party)
- Android price is $2 less than iOS — NOT because it's Android, but because the Android build has fewer features (no receipt scanning, no Apple Intelligence — not natively available on Android). Exact price points never stated. (first-party)

### Content strategy (organic)

- Zero paid ads, "no complex marketing." Channels used: Facebook and Threads only — "I just use what channels I have available." (first-party)
- Core mechanic: a link in the app's settings goes to a PUBLIC Facebook group (deliberately no in-app feedback form; App Store review is the feedback channel). When users interact with the public group, Facebook recommends it to their friends/family/connections — "It just appears on their feed. So that's free marketing for me." (first-party)
- Social-share growth loop: posted (initially as a joke, pre-release) a Strava-style feature — share your day's spending/savings to Instagram Stories. Got heavy engagement (laugh reacts, "so many shares" into the community), so he shipped it. Shares show percentages saved, no actual dollar values. App name is a watermark on the share graphic → "leads to more conversions." (first-party, no numbers)

### ASO & app store

- Reached #1 on the App Store (category/chart unspecified in transcript — likely a paid chart given the later framing; uncertain). (claimed)
- Thesis: "paid apps with no competition can top the charts easily" — paid-category charts have far less competition, so ranking is achievable. Second app validated it: "#1 travel app on the paid category, which meant my strategy worked." (claimed)
- Screenshots made in Figma (free mockup plugin) + ChatGPT for heading/subtext outlines; used the full 10-screenshot limit; focused on features that drive installs; "the first three are quite important." (first-party process claim)

### Launch & sequencing

- Built the app in a single weekend, published as a demo for a university talk; people started paying immediately. (claimed)
- Revenue: first month ~$20,000 across iOS and Android (host framing); guest states "$14.9" (≈$14.9k USD, uncertain — auto-caption renders "14 .9") on iOS alone "for a month or more," and "around 19 or 20" [thousand] total with Android. Android had been live only ~3 weeks with fewer sales than iOS. Published "last month, March 17th" (guest, "if I'm not mistaken"). NOTE: none of these figures verified on-screen in the transcript. (claimed)
- Android release lagged iOS by 2–3 weeks, partly due to Google Play's new closed-testing requirement: at least 12 testers using the app for 14 days straight before publishing. (first-party)
- Android waitlist: a simple Google Form got 900 responses for beta testing — treated as "potential sales." Beta testers still PURCHASED the paid app during beta (he didn't know how to make it free for them) — sales before official Android publish. (first-party)
- App Review took extra time because it was a new app. (first-party)
- Localization next: starting with popular Asian markets — Japanese and Chinese support first, then other markets. (first-party plan)

### Retention & product

- Offline-first, on-device AI (Apple Intelligence); no servers at launch. Later added a server for the subscription tier (cross-device sync iOS↔Android). (first-party)
- iOS-exclusive features: receipt scanning, Apple Intelligence. (first-party)

### Team, tools & cost structure

- Solo dev; tools: Codex (primary), React Native templates, Nano Banana (Gemini) for the mascot (Bulbasaur reference image → tarsier with baseball cap + t-shirt), ChatGPT for screenshot copy, Figma for mockups. No prototyping tool — iterates design via prompts directly in code. (first-party)
- Scaling via equity, not cash: on app #2 (trip planner) he "didn't have the bandwidth to handle two apps," so he delegated some development to friends FOR SOME EQUITY; they maintain that app's community and features. Third app incoming. (first-party)
- No paid marketing spend, no paywall tooling, no payment-provider fees beyond Apple/Google. (first-party)

### Other

- Ship-early philosophy: "If you think that your app looks good, then you probably shipped too late." Got flak from developers for publishing without proper testing; counters that AI lets him iterate fast on feedback and validate — vs. devs "who have clean code but zero sales." "AI is really an amplifier." (opinion)

## Deal structures

Development of app #2 delegated to friends "for some equity" — percentage, vesting, and scope unstated. No creator/UGC/affiliate deals discussed.

## Contrarian positions

- Paid-upfront (pay before download, no free trial) beats the standard freemium + onboarding-paywall model — because paid charts are an uncontested niche and subscription fatigue makes a one-time price a selling point. Directly against near-universal 2020s app-growth consensus.
- No paid ads at all; a public Facebook group + Threads as the entire distribution stack (contrarian vs. the host's own business, which sells paid-ads attribution).
- Deliberately NO in-app feedback form — route feedback to App Store reviews and the public Facebook group (turning support into ranking fuel and reach).
- Ship embarrassingly early; polish is a signal you shipped too late.
- Don't advertise your subscription features in screenshots — undersell to avoid feeling like a bait-and-switch.

## Crave transfer

The transferable pieces are the loops, not the model: a public Facebook group as the in-app feedback destination (Facebook's recommendation engine gives free local reach — plausibly strong for an Austin food community), a watermark-branded Strava-style share artifact (Crave analog: shareable dish-ranking cards / "my Austin top-10"), and the "everything shown in screenshots is included" trust rule, which matters double behind a hard paywall. The core paid-upfront thesis does NOT transfer: Crave is subscription-dependent (ongoing data-collection costs) and the "no subscription = breath of fresh air" USP is the opposite of Crave's $7.99/mo card-required gate; his "#1" is a low-competition PAID-chart ranking, not the free charts Crave would compete in. Scale caveats: ~$15-20k one month, all self-reported with no dashboard verification in the transcript, weekend-build ai-tool novelty, and classic single-survivor selection — n=1 (arguably n=2 with the trip planner, same author). Treat the numbers as existence proof that no-trial willingness-to-pay exists, not as a conversion benchmark.
