---
source: arthurspalanzani/20260330 - Building the tool that makes YOUR app RANK [VIjWSaddAAg].txt
date: 2026-03-30
speakers: Arthur Spalanzani (indie iOS/Mac developer, YouTuber; runs business "Tap and Swipe"; builder-seller of the AppSprints ASO tool and a paid builder community)
apps: AppSprints ASO (a.k.a. "AppSprint" / garbled once as "App Trend ISO"); category: tool (Mac app ASO/keyword tool for app developers); claimed scale: 122 trials at filming start → 156 trials by end, 1 paid "pro" client converted from free trial, ~15,000 API requests/24h; business model: free trial → paid license tiers ("solo" and "pro" versions; prices not stated). Also referenced: unnamed community member's AI app (ai-utility, credits model, €50/day revenue). Apps analyzed inside the tool (not his): Duolingo, Babbel, Bubble, I Am (daily affirmations), Rosetta Stone, Khan Academy, ChatGPT.
evidence_quality: first-party-numbers for trial counts, API request volume, and infra specs (he shows his own dashboards); claimed-numbers for the community member's €50/day (screenshot promised, secondhand); speculation for the blog/SEO benefit (explicitly framed as an untested experiment).
incentive_flags: speaker sells the exact tool being showcased AND a paid community with group calls (both linked in description) — the video is content-marketing for both; community-member success story is a testimonial for his own coaching/community; "new format" experiment means he is optimizing for channel growth too.
---

## Arc

Arthur Spalanzani, an indie developer who previously made videos about using ASO to generate his first app revenue, built a Mac ASO tool (AppSprints ASO) as a spin-off. His prior video unexpectedly drove 120+ trials (and an Expo repost on X), so this video is a 2-day build vlog: self-hosting the backend/frontend to escape usage limits, shipping a competitor-analysis feature, and starting an SEO blog — all doubling as marketing for the tool and his paid community.

## Claims

### ASO & app store

- Core thesis (carried from his prior video): ASO/keyword optimization is how he generated his first revenue on his apps; the tool exists to systematize that. (first-party, but details in prior video)
- The tool's "game-changer" feature: per-competitor keyword rankings — see the exact keywords a specific competitor ranks for, to "steal their keywords." He claims the incumbent tool's ("ASO" — likely garbled name of AppTweak/Astro/Appfigures-type competitor, uncertain) similar feature returns "very generic keywords." (claimed)
- Country-ranking heat map as a strategy read: seeing where an app ranks (e.g. Duolingo ranking in 73 countries; "Bubble" [likely Babbel, transcription uncertain] ranking strongly in Germany, Cameroon, US, Canada) lets you infer keyword quality or ad spend by geography. (first-party demo, inference is speculation)
- Big apps rank on thousands of keywords; his SQL over all of them took ~2.5 seconds, so he limits analysis to an app's top 200 keywords. (first-party)
- Tool also includes: niche analysis (revenue-share/download-share of a niche), explore page, App Store page editor for locales, price localization by purchasing-power index ("to get more revenue all around the world"), and Apple Ads campaign management in-app. (first-party feature list)

### Content strategy (organic)

- One YouTube video (posted "the 19th," 4 days before filming) drove 120+ → 122 trials of the tool; Expo reposted the video on X. By end of the 2-day vlog: 156 trials. (first-party)
- Quote: "I got more than 120 trials on the tool… actual developers actually using it and actually breaking it."
- He cites a "conversion rate is 50% because I had two trials there" from an unknown traffic source — garbled/ambiguous; unclear what converts to what; flag as uncertain. (first-party but incoherent as stated)
- New SEO experiment: added a blog (3 articles answering niche-relevant questions) + Canva images + Google Search Console, explicitly framed as untested: "It's just an experiment. I've never done that before." (speculation)
- Video-as-distribution loop: build in public → post the build vlog → trials arrive. This video itself is the channel's pivot to "things related to apps" (SEO learnings, pricing strategies), i.e. audience-first distribution. (first-party behavior)

### Retention & product

- Ship-small-and-ask cadence: "I don't like to build too much without feedbacks" — he pushes small updates to a dedicated community channel and lets users react before building more (avoided stacking ~10 unvalidated features). (first-party)
- 120 trials was enough load to hit his usage limits and surface real bugs ("actually breaking it"). (first-party)
- Customer-support failure story: his Resend transactional email said "reply to this email" but wasn't linked to a mailbox; a customer emailed several times with no answer. Same customer had upgraded solo→pro but the backend didn't reflect it (stuck at one app). Patched same day; his rule: answer and fix "as fast as possible, otherwise you will lose your clients." This was his first pro client converting from free trial. (first-party)
- Onboarding fix from feedback: many Mac users didn't drag the app into /Applications, which silently broke updates; he added a first-launch drag-to-Applications modal. Lesson: "You're not your users. You're not paying for your product." (first-party)

### Team, tools & cost structure

- Solo dev; Claude Code ("Cloud Code") does heavy lifting — configured his Coolify instance via API keys, built him an internal API-analytics dashboard, and solved the GeoJSON map rendering performance (initial load was ~5 seconds per app click). (first-party)
- Infra migration to cut cost: Railway (DB + API) + Vercel (frontend) → self-hosted everything on Coolify on an Oracle Cloud instance. Trigger: Vercel's ~1M edge requests/month limit ("I think" — uncertain), which he hit quickly even optimized. (first-party)
- Oracle instance: 12 GB RAM, 2 CPU cores, 100 GB disk. Signup gotcha: Oracle rejects virtual credit cards; he had to use his personal physical card. (first-party)
- ~15,000 API requests in the last 24h on his self-hosted API. (first-party, own dashboard)
- Bought appsprint.app domain ~5 hours before filming (tool needed its own domain separate from the Tap and Swipe business site). Uses Sentry (crash) + Resend (email) + Cloudflare (DNS) + proxies for Apple-server requests. (first-party)
- Closing joke that reveals a real fear: "I hope my next video won't be I got hacked and I got a $20,000 bill for AI credits." (speculation/humor)

### Pricing & paywall

- AppSprints has at least two paid tiers, "solo" and "pro" (pro = more than one app); free trial converts to paid license. No prices, trial length, or conversion rates disclosed. (first-party, sparse)
- Community-member result (his coaching testimonial): an AI app with a credits model reached €50/day after ~2 months of ASO work plus "a lot of iterations on his onboarding and payroll [paywall — transcription error]." He notes the credits model "is a different business model than regular apps" and was harder. (secondhand/claimed)

### Launch & sequencing

- Sequence he actually ran: ship v1 → announce in a YouTube video → 120 trials in ~4 days → spend 2 days fixing limits/bugs/feature requests → re-announce. Traction preceded polish. (first-party)

## Deal structures

None discussed. (Distribution is his own YouTube channel, his own community, and one unpaid Expo repost.)

## Contrarian positions

- Anti-roadmap building: refuses to ship a batch of features without interleaved user feedback — mild, but stated as a hard rule versus "build the vision" advice.
- Self-host everything on a cheap VPS (Coolify/Oracle) instead of managed PaaS the moment free-tier limits bite — against the "don't touch infra, focus on product" consensus for solo founders.
- Top-200-keywords truncation: deliberately caps analysis depth for speed — pragmatic accuracy trade-off he states openly rather than hiding.
- Implicit: build-in-public YouTube is his primary acquisition channel; he spends zero on ads and doesn't mention paid acquisition once.

## Crave transfer

Category and audience mismatch is severe: this is a B2B Mac tool sold to app developers via the seller's own developer-audience YouTube — Crave's consumers aren't reachable that way, so the "one video → 120 trials" result does not transfer; it's a function of a pre-existing niche audience plus a tool aimed at that exact audience. What does transfer: (1) the community member's arc — a hard-paywall consumer app took ~2 months of ASO + onboarding/paywall iteration to hit €50/day, a sober base rate for Crave's post-launch grind (though secondhand and a coaching testimonial); (2) the operational hygiene items — verify your reply-to email actually routes somewhere, and expect the first trial-to-paid converters to hit entitlement bugs (his solo→pro bug is exactly the class Crave's hard paywall will surface); (3) price localization by purchasing-power index is worth noting for a future non-US expansion, irrelevant at Austin launch. His ASO-first thesis is directionally supportive for Crave's organic-only plan but comes from someone selling an ASO tool and community — treat the enthusiasm, not the mechanics, as the biased part.
