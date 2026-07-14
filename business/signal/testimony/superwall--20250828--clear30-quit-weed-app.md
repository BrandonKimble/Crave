---
source: superwall/20250828 - I Built a $30k⧸mo App That Helps You Quit Smoking [cYcU4_HQdIk].txt
date: 2025-08-28
speakers: Asher Hurstman + Thatcher Kloff (co-founders, Clear 30; names uncertain — auto-caption spellings "Hurstman"/"Kloff"; third co-founder Dr. Fred Munch, clinical psychologist, not present); host Joseph (Superwall podcast)
apps: Clear 30; category: lifestyle (addiction recovery — quit/moderate cannabis); claimed scale: $10k/mo → $30k/mo subscriptions in ~8 weeks, "25,000+ people" social-proof claim, ~1,000 App Store reviews; business model: free trial paywall (3 days free, no payment due now, Blinkist-style reminder timeline), yearly ~$30/yr (price-tested $30/$40/$50 anchors) + monthly option, majority pick yearly
evidence_quality: claimed-numbers throughout (founders narrate their own Amplitude/Superwall dashboards on screen — shown but not independently verifiable; conversion %s and revenue are first-party claims); competitor/organic anecdotes are secondhand
incentive_flags: host is Superwall (sells paywall tooling; guests are Superwall customers and shout it out); founders telling their own success story (survivorship); guests are Consumer Club members; ad-creative meme credited to marketer Sebastian Steph
---

## Arc

Two young co-founders (plus a clinical-psychologist third co-founder) built Clear 30, a science-based quit-weed app. After ~1.5 years of grinding organic channels to ~$10k/mo, they spent two months focused exclusively on onboarding + paid ads and tripled to $30k/mo in subscriptions. The video is a Superwall-sponsored teardown of their onboarding Figma, paywall iterations, and ads dashboards.

## Claims

### Pricing & paywall

- Changed ONLY the first paywall screen and conversion jumped 20% → 30% ("We changed the paywall once and we went from 20% conversion to 30%"). Old first screen = feature-carousel slideshow (features "isn't necessarily super good at converting") + 7-day-outline second screen; new first screen = day-by-day program outline (day 0, day 1...) framing the trial as a program/system, with embedded mini dream outcomes ("your CB-1 receptors begin to bounce back within 48 hours") and explicit time-delay management ("wins quickly," not fixed-tomorrow). Everything else on the paywall unchanged. (claimed, dashboard shown)
- Old paywall converted ~18–19%, "round it off and say 20%." (claimed)
- Price testing ran $30 / $40 / $50 per year variants using the higher prices as anchors; landed on ~$30/year. (claimed)
- Paywall shows price clearly at bottom, "no payment due now," Blinkist-style trial timeline (start → reminder → billing starts) — framed as trust-building, explicitly avoiding "scummy" free framing. (claimed)
- Large majority of users pick the yearly option (the one with "3 days free" + reminder). (claimed)
- Superwall's built-in trial-ending notification (2-day reminder) required no custom notification work. (claimed; sponsor-aligned)
- Pre-paywall "this costs money and here's why that's fair" expectation-setting screen (copied from Ahead's onboarding) increased conversion by ~3%; they cite 1–5% AB-test increments as the compounding unit of onboarding work. (claimed)
- Value equation used everywhere: dream outcome × perceived likelihood of achievement ÷ (time delay × effort/sacrifice) — Hormozi-style framework applied slide by slide.

### Trial & onboarding

- "85% of users decide if they're going to pay for your app in the first 5 minutes." (claimed/secondhand stat, no source)
- Intro screen converts ~85–90%, fluctuating with ad intent. (claimed, first-party dashboard)
- Collect analytics from the very first screen — before phone-number sign-in — or you can't see drop-off. Early they had no data before phone auth. (first-party lesson)
- Ask name early, then use the name in the next question — conversational, "make them feel seen."
- Good friction: users spend 20–30 seconds on the goals and triggers questions with <5% drop-off — long dwell + no drop = commitment, don't cut the question. (first-party dashboard, host: "less than 5%... insane metric")
- Onboarding mirrors answers back with social proof tied to the selected goal ("81% of users improve mental clarity"). (claimed)
- Comparison stat screen: "you're smoking 94–96% more than an average person," with cited sources (datasets, publications, surveys) — showing sources is claimed to matter.
- Pain→presentation mode: highlight current pain, then "we WILL take you" framing; e.g., "$220 more dollars" in 30 days; "proven by 25,000+ people"; "improvement in just the first 3 days."
- Users self-report spending "upwards of $55 a week on weed" vs the $30/yr program; saving-money motivated users convert at 23% vs legal-obligations at 29% — gap read as an onboarding fix (call out the spend-vs-price math), not a lost cause. (first-party dashboard)
- Conversion by age: 18–20 converts at 0.19 (~19%, caption ambiguous "convert at .19"); 26–30 is "almost double that." Consensus meta = switch off 18–25 targeting on Meta/TikTok. (first-party dashboard + secondhand consensus)
- Review-prompt glitch (copied from Cali['s] onboarding — likely "Cal AI," uncertain): show a reviews/social-proof slide and trigger the native rating prompt BEFORE the user has used the app; reviews went from ~50 to almost 1,000. "From a consumer perspective the dumbest thing I've ever seen... reviews skyrocketed." Justified because 5 minutes of personalized feedback preceded it, so nobody's angry yet. (first-party)
- Free personalized feedback screen before the paywall (strengths, "areas for exploration" not weaknesses, money-savings opportunity) = give value before asking.
- Phone-number auth chosen over Google (more friction) specifically to enable SMS via Twilio; "95% of people who get a text read it within 5 minutes" (secondhand stat); human, funny, non-GPT copy; users can text support back.
- Quiz-framed ads/onboarding (competitor Reframe, alcohol: "take our quiz to see what alcohol type you are") did NOT work for them — attributed to their own low effort, not the tactic. (first-party negative result, honestly hedged)
- Onboarding annotated in Figma with a written reason for every screen; "onboarding is the best conversation" since a TikTok ad can't engage deeply.

### Paid ads

- Organic (influencers, Reddit, organic content, SEO) was an "uphill battle" for 0→$1k; the flywheel only started with paid acquisition. $0→1k was the hardest stretch. (first-party)
- "We know people who've gotten 10 million views on videos and made a thousand bucks" — organic views ≠ revenue. (secondhand)
- They script, storyboard, and film their own ads (dad is an actor; mom stars in a calm "zen" ad that outconverts clickbait for the older audience).
- Hyper-specific callouts ("hit your pen until 3:00 a.m. watching skateboarding videos") + comedy grab attention even when not literally applicable.
- Creative iteration = watch which creatives Meta/TikTok allocate spend to, read primary/secondary metrics (CTR), form hypotheses (girl vs guy in ad; phone-camera look beat polished-camera look); admits no systematic hook spreadsheet yet — intuition-driven; scripted-ad format resists one-word tweak testing.
- Attribution stack: Amplitude panels; ROAS after "the Apple tax" per channel; trials started per channel (TikTok, Instagram); MMP attribution matters for feeding the Meta/TikTok algorithms; PLUS an in-onboarding "where did you hear about us" question (acknowledged bias: Instagram listed first) used to steer intraday ad spend. (first-party)
- Ads don't need to carry the persuasion — they "bring people in the door"; the onboarding does the selling.

### ASO & app store

- The pre-use review prompt drove ratings volume 50 → ~1,000 (see above) and "can really boost your rating"; reviews on the slide are real user reviews ("smoked for 12 years... this app helped me"). Big apps "rip this exact copy from each other."

### Launch & sequencing

- Sequence that worked: organic first to get initial users + feedback → fix product/onboarding so it converts → then paid ads become a scalable flywheel ("if you don't have a product that converts... you can't have that flywheel").
- Focus framework: pick the ONE thing that would solve everything and double down "till it hurts" — they did onboarding + ads only, for 2 months straight, producing the 10k→30k jump.
- Timeline: ~1.5 years total; last 2 months = the inflection.

### Retention & product

- Post-notification engagement (what happens after the trial-reminder tap) named as current work-in-progress.
- Explicit goal-metric: cut "why is this paid" social-media complaints by 50% via value communication (peer support specialist framing — "not just a tracker").
- "Obsessively talk to the people using their products" — clinician co-founder drives science credibility (National Institute of Health grant, credible board).

### Team, tools & cost structure

- 3 co-founders (2 operators + clinical psychologist). Tools named: Superwall (paywall + trial notification), Amplitude (analytics), Twilio (SMS), Figma (onboarding spec).

### Other / future

- Pending B2B partnership with University of Michigan (faculty rollout); interest in addiction/state services channels; users request supplements and therapy → upsell/downsell LTV expansion planned.

## Deal structures

None discussed. (A referral-code onboarding screen "used more for influencers" is mentioned — being moved in-app — but no terms given.)

## Contrarian positions

- Organic content is largely a trap for revenue ("virgin organic poster" vs "Chad paid marketer" meme); 10M views can equal $1k. Paid ads are the flywheel.
- DON'T follow the consensus of excluding 18–25 from ad targeting reflexively — but do weight spend to older converters; likes from 19-year-olds are vanity.
- Friction can be good: long dwell time on hard onboarding questions is commitment, not a drop-off risk — six months earlier they'd have cut those questions.
- Tell users the app costs money BEFORE the paywall ("fair trial" screen) — most funnels hide it; transparency raised conversion ~3% and reduces "nice try, it's paid" ad-comment blowback.
- Ask for the App Store rating before the user has used the product — "dumbest thing I've ever seen" as a consumer, works anyway.
- Features don't sell; day-by-day program outlines + outcome framing do (the entire 20%→30% jump).

## Crave transfer

Strongest transfers: the paywall-first-screen lesson (sell the program/outcome timeline, not a feature carousel — Crave's hard paywall should show "here's your first week of eating better in Austin," not screenshots), pre-paywall price transparency (Crave already fronts a hard paywall; the "this costs money and it's fair" framing + anchoring against what users overspend on bad meals maps directly to Clear 30's $55/week-weed vs $30/year anchor), the pre-use review prompt after delivering free personalized value, and instrumenting onboarding drop-off from screen one. Weak transfers: their whole engine is paid ads, which Crave explicitly won't run at launch — and their claim that organic is an uphill battle is a direct warning about Crave's organic-only plan, though category differs (pain-driven addiction recovery has a burning problem and self-selecting ad audiences; food discovery is want-driven and local, where UGC/creators plausibly work better than they did for quitting weed). Their $30/YEAR price point undercuts Crave's $39.99/yr for a habit-change product with a clinician — treat their 30% trial-start conversion as non-comparable to Crave's pay-now monthly path (their number is free-trial starts, not paid conversions). All numbers are founder-claimed on a sponsor's podcast; survivorship and Superwall's incentive to showcase paywall wins both apply.
