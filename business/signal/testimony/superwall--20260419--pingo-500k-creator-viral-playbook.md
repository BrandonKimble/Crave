---
source: superwall/20260419 - How I built a $500k⧸mo ai app (so you can just copy me) [s9qQPM92JNs].txt
date: 2026-04-19
speakers: Mori (guest; co-founder of Pingo, runs growth/content — name possibly "Murray", auto-caption uncertain; co-founder Michael referenced, not present); Joseph Choi (host, Superwall podcast / founder of Consumer Club)
apps: Pingo — AI language-learning voice companion (category: ai-utility); claimed ~$450–500k/mo revenue, ~350–400M organic views/month, ~3M users, 14 months post-launch; hard-push annual paywall $99.99/yr with 7-day trial (annual only; monthly hidden, no trial), Stripe web checkout in US, transaction-abandoned discount flows
evidence_quality: claimed-numbers throughout (founder self-report; some screen-shared dashboards shown to host but not independently verifiable); paywall test deltas = first-party but preliminary ("data polling stops Monday"); host intro figures = secondhand repetition of guest claims
incentive_flags: host is the Superwall podcast (sells paywall tooling; guest uses Superwall and credits a Superwall podcast for his best paywall); mid-roll ads for paywallexperiments.com (Superwall AI tool, "422 profitable paywall experiments") and SpyTok (paid promo, "only growth tool I 100% vouch for"); guest is a YC-funded survivor telling his own success story and hiring
---

## Arc

Mori co-founded Pingo, an AI voice companion for conversational language fluency, launched from his Northwestern dorm ~Dec 2024/Jan 2025 ("January 25th was like what we call launch"). 14 months later he claims ~$450–500k/mo revenue and ~350–400M organic TikTok views in a single month, driven almost entirely by a ~100-creator UGC program across 20 languages. The video exists as a Superwall podcast episode to showcase the creator playbook and paywall testing (both flattering to Superwall's product).

## Claims

### Content strategy (organic)

- ~350–370M views in the last 30 days, "part of me that wants to say 400 million" — claimed, dashboard shown.
- Most viral single video: 52M views — the "crying" format: user mispronounces a word, Pingo roasts them, creator cries on camera. Format works "in every language" (Korean, German, French, Arabic, Japanese, Russian shown). Claimed.
- Core thesis: "virality that converts shows and doesn't tell" — every viral video must show the product itself. "Everything that's gone viral for us since August only has used Pingo. We have one creator who tries videos not doing that, and they'll go viral but they don't convert." Claimed.
- The viral roast format required ZERO product development — creators discovered it inside the day-one "custom scenarios" feature (free-prompt roleplay), prompting Pingo to be mean. Best marketing insight came from creators, not the team. First-party account.
- Format longevity is unusually high: first format (plain talking-with-Pingo learning content) lasted 4–5 months; crying format running since ~Aug/Sep and still working at interview time (~6 months). Claimed.
- Early history: first videos ~Dec 16–17; multiple non-Pingo-hook videos flopped; first viral hit ~100k views ("POV your Chinese teacher... so now you seek validation from an AI", dual captions). One Chinese cultural video (TikTok ban / RedNote moment) ~1M views. A Korean quiz video 77,000 views. First 3 months = just the two founders filming themselves with an iPad, to ~$20k MRR. Claimed.
- Slideshows: can go viral (some hit 1M views) and can convert with a strong CTA, but accounts "burned out pretty quick" — spike then crash; conversion gap vs. product-demo videos "night and day." Not automating content with AI yet — "if it ain't broke, don't fix it."
- Users now ASK for the mean-Pingo mode seen in videos (requesting a "mean" toggle) — marketing format feeding product roadmap.

### UGC & creator deals

- ~100 active creators currently; just cut 30–50. "VC model": top 20–30% of creators do most of the views, bottom is "dead spend" — cut bottom, coach mid-range, scale winners. ~30 creators generate own ideas; "there's 20 of those who are pretty good and there's 10 who are like goated."
- Recruiting profile: micro creators under 10k followers in the language-learning niche; 5–10k "a really nice range"; 10–30k mid-range creators are better if willing to do UGC; diamonds-in-the-rough under 2k followers have blown up. Follower count doesn't predict success. Must have ≥1 breakout video (proves they know virality and will chase the bonus).
- Search keywords: learners first ("learning German", "practicing German"), then college students (German major/minor/class), native speakers last.
- Outreach: VAs mass-DM on TikTok/Instagram (founder did it himself for a long time; DMs to "a few thousand creators" made TikTok unusably slow), move to email once interested for CRM/follow-up. DM template evolved only by updating the user-count stat (tens of thousands → "we have three million users").
- Internal clock on how long a new creator gets before cut/keep decision. Discord community where creators teach each other what's going viral. Content coaching program started ~1 week before interview; built an internal tool for paying creators.
- Two spend buckets: (1) in-house program = base pay per video + non-stacking view-milestone bonuses (fixed spend, can't turn off); (2) "Noise" platform creators = CPM model with a post cap (flexible budget; used to scale winners and quick-test ideas).
- Testing method: founder makes the example video himself for never-tried formats; briefs = example video + "here's why it went viral" + key steps + "recreate as close as possible in your target language." Untested shower-thought: have ~20 core creators post the same new format the same day to engineer a measurable mass spike.

### Launch & sequencing (geo problem)

- Went viral in Russia: ~200k+ Russian users in February who "couldn't pay us anything" — Russia unmonetizable (Apple/Google block transactions under sanctions). "Dead users… a lot of spend on views that did not monetize at all." Killed all Russian content.
- Dashboard read-out (slightly garbled numbers, flagged): of ~23,000 new iOS users, ~12,500 Russian; of ~12,000 Android users, ~5,000 Russian — roughly half the user base from Russia at peak.
- Virality is NOT geo-controlled by creator location: a UK-based creator had "90-something percent" Russian viewership. Hypothesis: native speakers find the content funnier than learners do. Open problem: making content go viral among target-language LEARNERS, not native speakers.
- English learners arrive as a "catch-all bucket" without ever marketing English — viewers infer "it's a language app" — but this only monetizes in higher-converting countries.
- Country-level price localization mentioned (host intro) as part of the path to $500k/mo; not detailed in the body.

### Pricing & paywall

- Hard-pushed annual plan: $99.99/yr; monthly exists but hidden behind a "view all plans" link, gets NO trial and isn't shown on the main paywall. Rationale: higher LTV/ARPU.
- Best-performing paywall = multi-page with a trial TIMELINE ("today you unlock Pingo… day 5 set reminder… day 7 you'll be charged; reminded 2 days before trial ends") + annual price shown with weekly equivalent ("$99.99 a year is daunting"). He says he took the timeline design "from a Superwall podcast."
- Key insight: reinforcing the LOW-RISK nature of the trial (reminder promise, cancel anytime, "pressing the start trial button does nothing to you") outperformed value-prop/testimonial variants. Even the reminder timing (notified 2 days vs 1 day before trial end) changes conversion. Claimed, first-party tests.
- Social-proof variant also tested: "join over 3 million learners" + ratings/review anchors — worked, but timeline won.
- Transaction-abandoned flow: 55%-off one-time offer with the same timeline/de-risk framing "performs better." Also: users abandoning a 3-day-trial paywall who then see a 7-day-trial abandon offer "convert higher." Docket experiment: offer 10- or 14-day trial to 7-day abandoners (unknown post-trial conversion).
- 3-day vs 7-day trial test (preliminary — "data polling stops Monday"): US conversion "mildly different… point .7 to .3% difference" (garbled, uncertain), ARPU ~$0.20 difference, cancel rate ~5–7% HIGHER on the 3-day (theory: notification lands day-after, purchase fresh in mind). Internationally: 7-day converts ~2% higher; "people want a 7-day trial." Android "a little more drastic"/more susceptible than iOS.
- Trial-length choice also has a COST axis for a voice-AI app: if trial users front-load usage in days 1–3, a 3-day trial saves inference cost — needs CAC/usage deep-dive.
- Shifting all US billing to Stripe web checkout (new Superwall capability) because "margins are a lot better"; can't do it internationally — this forced the US-vs-international paywall segmentation.
- Paywall design was static ("set it and forget it") for ~a year before systematic testing began; testing only started once team grew.

### Team, tools & cost structure

- Two people (both founders) until mid-October; now four (one content hire, one engineer). Content lead lived in Germany, coaches German creators on cultural hooks.
- YC-funded; ~$500k YC money referenced ("YC half a million dollars"); post-YC raise closed "in like 3 days" with ~100 meetings scheduled then mostly canceled — enabled by strong metrics ("our revenue is high, our CAC LTV is good"). Negative cash flow for a while (App Store payout timing + high voice-AI costs) — venture cushion made that survivable.
- VAs for outreach; internal creator-payment tool; Noise for CPM distribution; Superwall for paywalls.

### Retention & product

- Product philosophy: no avatar — Pingo is four colored sound-wave lines; "companion" connection built through conversation/memory, not a character. Roadmap: beginner-guided structured lessons, plans, memory. Recently shipped any-to-any language pairs (previously English-base only, 25 target languages).

## Deal structures

- In-house creators: base pay per video (amount unstated) + view-milestone bonuses at 50k / 100k / 200k / 500k / 1M views. Bonuses are NON-STACKING — you earn only the highest tier hit (example given: $50 at 50k, $100 at 100k; hitting 200k pays the 200k tier only, not cumulative). Base pay signals "we value your time"; "really like the money's in the bonuses."
- Noise platform: CPM-based payout per post with a cap; elastic budget vs. the fixed in-house program.
- Exact dollar rates per video and CPM figures not disclosed.

## Contrarian positions

- No avatar/character for the AI companion — against the character-app wave; minimal four-line waveform, betting minimal now stands out.
- Refuses gimmick virality: views must come from the product on screen or they don't convert — rejects the mass-AI-slideshow/automation meta despite acknowledging it's nearly free ("what we have works so well").
- Founder personally makes the example video before asking creators to (host notes few founders do this).
- Pro-venture/YC for a viral consumer app, against the bootstrapped consensus in that scene — though he hedges it as lifestyle-dependent and admits the value was fundraising ease + advice, contingent on already-great metrics.
- Low-risk trial framing (reminder timeline) beats value-prop messaging on the paywall — de-risking outconverts persuading.

## Crave transfer

The most transferable material is the paywall stack, not the growth story: annual-first with hidden/trial-less monthly, a trial-timeline "you'll be reminded, cancel anytime" de-risk page, and a discounted transaction-abandoned offer map directly onto Crave's $39.99/yr-with-trial vs $7.99/mo-pay-now structure — cheap to test and mechanism-plausible, though every delta cited is preliminary self-report told on the vendor's own podcast. The creator playbook transfers only in skeleton (micro-creators with one breakout video, base + non-stacking view bonuses, cut-the-bottom-20% portfolio management, founder-made example videos): Pingo is a global-TAM AI-wow product where one format works in 20 languages, while Crave is single-city utility — Austin food creators are a tiny, finite pool and a 52M-view video would be mostly wasted geography, which is exactly Pingo's Russia lesson (400M views bought ~200k unmonetizable users; geo-mismatched virality is spend, not growth). The genuinely portable insight is "virality that converts shows the product" — Crave UGC should show the map/Crave Score answering a real "where should I eat" moment, not food-porn b-roll. Discount the survivorship and the two sponsor reads heavily; note his own admission that non-product-centric videos go viral but don't convert.
