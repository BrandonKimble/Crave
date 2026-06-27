# Business / Growth / Revenue — Mined from BRD + PRD

> Living feature-idea notes. Seeded 2026-06-27 by mining `PRD.md` + `BRD.md` + `plans/` + memory.
> Add ideas here as they come up. This is a backlog of *ideas*, not an execution plan (those live in `plans/`).

---

This file seeds the living business notes for Crave: monetization, restaurant B2B, growth/virality, and community engagement. It is an EXTRACTION from BRD.md (full), PRD §8 & §10, the canonical business-model memory (`crave-business-model.md`, the single source of truth — decision dated 2026-06-26 after deep research + multi-agent red-team), copy.md, and the actual codebase (billing infra, favorites sharing). Where older PRD/BRD ideas contradict the CURRENT freemium + objective-ranking + dishes-are-the-paid-hero decision, they are flagged in the Stale section, not deleted, because the underlying mechanic is often still reusable.

The load-bearing CURRENT decisions every idea below must respect:
- Ranking is OBJECTIVE and global; NEVER personalized, NEVER pay-to-rank.
- FREE = the objective restaurant ranking (beats Google) + restaurant search + map + open-now/price filters + poll vote/discussion + create & share favorites + profiles/following.
- PAID (Crave+) = the DISH intelligence layer (dish ranking/scores, dish-level search, restaurant-profile dish list beyond top-N), score EVIDENCE/"why", rising/momentum + trending, NL/semantic search, power filters/sort on your own lists, offline, unlimited lists. Dishes are the paid HERO.
- "Gate what Google/Yelp/Beli structurally can't do; keep free what Google does (we just do it better)."

## Monetization & pricing

### Canonical model — freemium "AllTrails archetype" (CURRENT)
Free to BROWSE + CONTRIBUTE (poll voting, discussion, autocomplete feedback are free forever — cheap to serve, feed the secondary flywheel); pay for CONSUMPTION DEPTH. Integrity rationale: eater-pays subscription (not ads/B2B-in-ranking) structurally aligns revenue with the "no pay-to-rank, ever" promise. (source: crave-business-model.md) — status: planned/direction (not yet built as a gate; infra exists)

### Pricing — $7.99/mo + $39.99/yr, push annual hard
Annual ≈ 5 months (~58% off); annual retains ~44% at 12mo vs ~17.5% monthly. Chosen over the earlier $6.99/$39.99 (weak annual nudge, $6.99 undercut the premium signal). No weekly SKU. Plan ~2-7% conversion; Lifestyle category is ~98% winner-take-all with vicious churn (~72% annual Year-1) so annual is the hero SKU. (source: crave-business-model.md) — status: planned/direction

### Reverse trial (~7 days) — full Crave+ then drop to a generous free floor
Loss aversion in the safe direction. CAVEAT: the day-8 clawback is the one brand-incongruent risk for an integrity-first product; mitigate with a genuinely good free floor + honest "your trial is ending" framing, or fall back to a plain time-limited (non-clawback) trial if the clawback offends the integrity gut. Must A/B against no-trial; trials can REDUCE LTV (~21% in some Lifestyle data) so the trial is NOT assumed optimal. (source: crave-business-model.md) — status: idea/to-be-A/B-tested

### Sequencing — START freemium; hold hard paywall as a later data-earned option
Reversibility is asymmetric: tightening (freemium→paywall) is routine and grandfatherable (Netflix removed its trial at scale, no churn spike); loosening (paywall→freemium) is the most brand-destroying move available (resets price anchor to zero, burns the seed cohort). NEVER open with a paywall and loosen later. Pre-commit a kill criterion before launch (e.g. trial→paid < ~5-6% after ~90 days AND no referral/WoM lift AND support load crushing solo bandwidth → tighten). (source: crave-business-model.md) — status: planned/direction

### The one real dial — where the free line sits
Under adversarial hardening the "ideal freemium+trial" and "ideal hard-paywall+trial" models CONVERGED to the same machine ($39.99/yr hero + ~$7.99-8.99/mo, no weekly SKU, earn-then-reveal onboarding, referral-unlock escape hatch, a permanently-free trust crumb, Cal-AI-proof paywall, mandatory Q1 A/B). So the decision is ONE DIAL (how much survives the trial / where the free line sits), settled by A/B, not by archetype. Whole call hinges on: is word-of-mouth install-elastic? Bigger free base → more installs/referrals → freemium; conversion pins at the ~2-4% floor and depth-gate never bites → tighten. Both dial-able via remote config. (source: crave-business-model.md) — status: planned/direction

### What is gated — the corrected free/paid split (HERO = dish depth + NL/semantic search)
FREE: full objective ranked list + Crave Score + ordering (restaurants & dishes, uncapped, never blurred), structured search + autocomplete, map, restaurant detail basics + top-N dishes, poll vote/discussion, create + SHARE favorites lists, profiles/following. PAID (Crave+): NL/semantic search (the LLM-costed magic via `/search/natural` + pgvector), full dish-level ranking + dish detail beyond top-N, full score EVIDENCE/"why", power sorts/filters (rising/momentum, stacked filters, best-near-me-now), offline, unlimited lists. Gating these doesn't hide the ranking or hurt growth. (source: crave-business-model.md) — status: planned

### Meter the COSTED NL search as a soft-degrade, never a wall
NL/semantic search costs an LLM call per query, so a few free NL searches/day → Crave+ is justified — but degrade (Perplexity/ChatGPT pattern), never blank-wall, and apply ONLY to NL search, NOT to basic structured search (core + cheap + the word-of-mouth engine). What's actually policed as "scammy" (FTC 2024) is hidden BILLING, not locked content. (source: crave-business-model.md) — status: idea

### Cal-AI-proof paywall rules (Apple compliance, post Apr-2026 enforcement)
Show the REAL billed number most prominently (never a per-week divide-down bigger than the charge); auto-renewal terms inline + visual trial timeline; never re-prompt a decliner with a different offer; StoreKit IAP in-app only. The existing web Stripe rail is Apple-LEGAL ONLY for out-of-app checkout — NEVER embed Stripe in-app. (source: crave-business-model.md) — status: rule/constraint

### Dual-rail margin lever (already built in codebase)
iOS RevenueCat nets ~85% (Apple Small Business <$1M); web Stripe nets ~97% → steering renewals/returning users to web checkout is a ~12-pt margin swing (Apple-legal out-of-app). Infra exists: `apps/api/src/modules/billing` has Stripe web checkout + RevenueCat iOS webhook (`billing-webhook.controller.ts`, `dto/revenuecat-webhook.dto.ts`) + UserEntitlement + SubscriptionStatus.trialing; PRD §4 has `subscriptions` + `users.trial_started_at/trial_ends_at/subscription_status` schema; billing infra can gate by arbitrary entitlement code. Use the existing notifications module for the trial-end reminder push; Clerk for end-placed sign-in. (source: crave-business-model.md + codebase `apps/api/src/modules/billing/`) — status: shipped (infra) / planned (gating)

### Profitability reality (sizing the bet)
~$4-4.3 net/payer/mo blended → ~2,100-2,490 active payers for $10k/mo (~43-47k city users at ~5% conv); ~7k payers for $30k/mo (likely needs city #2). Only ~4.6% of apps clear $10k/mo in 2yr. Launch ONE city first. (source: crave-business-model.md) — status: context

### #1 structural risk — discovery-as-subscription
Discovery is low-frequency and free via Google/Yelp; no Western pure-play food-discovery CONSUMER subscription has scaled (Beli "no coherent revenue model" after 4yr/58M ratings; DoorDash's Zesty dead in <5mo; Tabelog/Japan works only because there's no free alternative — doesn't transfer to the US where 62% discover via Google). Paid value MUST feel like RECURRING personal utility ("your dish intel / what to order, kept current"), not one-time "find a place." This is WHY dishes-kept-current is the hero. (source: crave-business-model.md) — status: context/guardrail

## Restaurant B2B / partnerships

### B2B is PHASE 2 — post-density, never in the ranking
Restaurant B2B (claimed profiles, analytics, sponsored polls) is held until after consumer density, and is structurally walled off from the objective ranking. B2B is plausibly the bigger long-run revenue pool (where Beli/Foursquare/Yelp all point). (source: crave-business-model.md) — status: planned (phase 2)

### Data-driven outreach / onboarding triggers
Auto-detect restaurants worth pitching: highActivity (monthly mentions > 50 → generate insight preview); trendingDish (weekly growth rate > 200% → share trend report); consistentPraise (positive reviews > 25 AND unique threads > 3 → highlight community impact). The Reddit-mining pipeline already produces the mention/trend signals these triggers need. (source: BRD §3.1) — status: idea (phase 2)

### Restaurant analytics dashboard (the core B2B product)
Real-time mention alerts, sentiment analysis, menu-item performance tracking ("your chicken caesar wrap was mentioned 12× this week"), dish-by-dish popularity, trend forecasting, "here's how your burger ranks in local discussions," choose top community quotes to feature, spotlight trending dishes, competitor/category relative rankings. Enterprise add: API access for data integration, custom reporting, dedicated support. (source: BRD §3.2, §8.2) — status: idea (phase 2)

### Claimed/verified restaurant profiles
Let restaurants claim a profile to highlight verified community favorites, share select customer praise, surface time-sensitive promotions/happy-hour. Verification + claim flow is the B2B onboarding wedge. (source: BRD §3.2 Basic Tier, crave-business-model.md) — status: idea (phase 2)

### Sponsored polls (integrity-safe B2B engagement)
Restaurants sponsor/seed polls as a community-engagement surface — explicitly distinct from the ranking, which they can never buy into. This is the one "promotional" B2B lever that survives the integrity stance because polls feed the score only at close-time graduation, by real votes. (source: crave-business-model.md) — status: idea (phase 2, needs integrity guardrails)

### Restaurant partnership pricing tiers (older numbers, mechanic still valid)
BRD floated Basic $99/mo, Pro $249/mo, Enterprise $399/mo as the B2B SaaS ladder. Numbers are unvalidated and pre-date the current model, but the three-tier structure (monitoring → insights+highlights → advanced analytics+API) is a reasonable starting frame. (source: BRD §3.2) — status: speculative (revisit pricing)

### "Your customers are already sharing — see how to amplify"
B2B marketing angle: surface the user-generated content + community buzz a restaurant is already getting and sell the dashboard to amplify/respond to it, plus viral-moment identification ("capitalize when your dishes go viral"). (source: BRD §8.2) — status: idea (phase 2)

### Long-term data products
Trend prediction / early-trend analytics, "community intelligence" into local food culture, and food-preference market research sold to the restaurant industry. Adjacent platform expansions floated: event/pop-up discovery, travel-destination food discovery. (source: BRD §8.3) — status: speculative

## Growth & virality

### Free tier IS the growth engine
With no ad budget, the free tier is the only word-of-mouth/organic reach engine — "you can't go viral behind a wall." This is one of the two REAL reasons to start freemium (the other being reversibility asymmetry). Note: the crowd is NOT load-bearing for the score (it rebuilds solo from the Reddit pipeline with zero live users), so freemium won't feel empty — no cold-start problem. (source: crave-business-model.md) — status: direction

### Referral system + referral-unlock escape hatch
PRD §4 schema already has `users.referral_code` (UNIQUE). Mechanic: referral tracking drives share-driven signups; a "referral-unlock" can serve as an escape hatch to earn Crave+ access (surfaced in the converged ideal model). Target viral coefficient > 0.2. (source: PRD §4 schema, §9.11, BRD §7.1, crave-business-model.md) — status: idea (schema exists)

### Shareable favorites lists (a built virality surface)
Favorites lists are shipped AND public-shareable via `share_slug` (codebase: `favorites.share.controller.ts` GET `:shareSlug`, `favorite-lists.service.ts` getSharedList/generateUniqueShareSlug with rotate support). Shared lists load for non-users → discovery funnel. Keep list creation + sharing FREE (it's a growth lever); gate only power sort/filter on your own lists. (source: codebase `apps/api/src/modules/favorites/`, crave-business-model.md) — status: shipped (sharing infra)

### Bookmark/discovery share extension → social posts
"Share/Contribute Your Discovery" modal: pre-filled template ("Just tried [dish] at [restaurant] — found through community recommendations…") + share to social. Also "Share your Bookmarks": an info-graphic of top 5-10 saved dish-restaurant pairs with subtle Crave branding. Pre-filled templates ensure consistent high-quality posts; creates a viral loop (shared content → new-user discovery). NOTE: the BRD framing leans hard on "Post to r/austinfood / Thanks r/austinfood!" Reddit attribution — see Stale flags; the social-share mechanic itself is still strong if de-Reddit-branded. (source: BRD §6, PRD §8.3) — status: idea/planned (rework Reddit framing)

### Social graph — profiles, usernames, followers
On the roadmap as another virality layer; keep FREE. Profiles/following turn discovery into a social object and create follow-driven retention. (source: crave-business-model.md) — status: planned (roadmap)

### Geographic expansion — city-by-city, demand-signaled
Launch ONE city, expand as high-quality signal accumulates. Capture city demand via in-app "see Crave in your city next" prompts / waitlist (copy already drafted in copy.md §"Cities" and the launch about-page paragraph). Track new-city requests as a growth metric. (source: crave-business-model.md, copy.md, BRD §7.3, PRD §8.5) — status: planned

### Cross-platform content distribution
Instagram food-photo sharing with attribution, TikTok short-form on trending dishes, food-blogger/influencer network, local food-media partnerships. Platform cross-pollination loop. (source: BRD §7.3) — status: speculative

### Growth metrics to instrument
Viral coefficient (target >0.2), share completion rate, referral signups/conversions, geographic-expansion requests, content virality (UGC posts that gain traction), premium conversion after discovery features. Analytics stack: PostHog or Amplitude free tier (PRD §2); PRD §10.6 plans conversion funnels + retention metrics; copy/PRD §8.5 detail UTM strategy for outbound links. (source: BRD §7.1, PRD §8.5, §10.6, §2) — status: idea

## Community & engagement

### Polls — free forever, the contribution flywheel
Poll voting + discussion stay free permanently (cheap to serve, feed the secondary flywheel; polls feed the score only at close-time graduation by real votes). This is the participation layer that both engages users and supplies fresh signal. (source: crave-business-model.md, polls memory) — status: shipped/free

### A permanently-free "trust crumb"
The converged ideal model keeps a permanent free taste of the paid layer — a trust crumb that signals the gate isn't hiding the answer. Reinforces the integrity brand and reduces "they hid the results" backlash. (source: crave-business-model.md) — status: idea

### Earn-then-reveal onboarding
Onboarding that has the user earn/experience value before the reveal (vs. a cold paywall). Surfaced in both converged models as the right onboarding shape. (source: crave-business-model.md) — status: idea

### Activity indicators — trending / active signals
Lightweight visual signals on items: 🔥 Trending (multiple recent mentions), 🕐 Active (recently discussed), none (normal). Drives immediate relevance + discovery; integrates with attribution. Backed by Connection-table fields (last_mentioned_at, activity_level, top_mentions). Trending/rising/momentum surfaces themselves are gated to Crave+ per current split. (source: PRD §8.2, §8.4) — status: idea/partial

### Trending-dish alerts on saved items
Notification: "Heads up: a dish you saved is trending again in your city" / "Your bookmarked {dish} is getting a fresh wave of praise." Copy drafted (copy.md §1.8). Re-engagement lever; pairs with the "kept current" recurring-utility positioning. PRD §10.5 plans smart-alerts (>40% opt-in, >15% re-engagement targets). NOTE: PRD §10.5 calls these "personalized/AI recommendations" — saved-item alerts are fine (user-declared interest, not taste personalization), but anything implying taste-personalized re-ranking is STALE. (source: copy.md §1.8, PRD §10.5, BRD §6.2) — status: idea (de-personalize framing)

### Social-status / recognition features
Discoverer badges (found a trending dish early), community leaderboards (top contributors), "track your impact on the food discovery community," insider/early-trend access. Engagement + retention levers; "users who contribute show higher retention." Keep these as engagement (free) rather than monetization hooks given the integrity stance. (source: BRD §7.2, §8.1) — status: speculative

### Attribution / "join the conversation" links
Clickable source quotes + "Join conversation" CTA on evidence cards, opening the source discussion; UTM-decorated outbound links for growth tracking. STRONG mechanic for showing evidence + driving engagement, BUT the BRD/PRD framing is Reddit-specific ("Powered by Reddit communities," r/austinfood deep-links) — see Stale flags; copy.md deliberately avoids naming source platforms, so re-frame attribution as generic "community discussion" not "Reddit." (source: PRD §8.1, BRD §8.1, copy.md) — status: idea (de-Reddit-brand)

### Score evidence on detail pages (trust engine, free basics / paid depth)
Detail pages carry confidenceLabel + "Based on N polls with M votes" + pollCount/voteCount. Basics free (builds trust + word-of-mouth + the integrity promise); the FULL evidence/"why" is a Crave+ depth lever. (source: crave-business-model.md, copy.md §1.3-1.4 score tooltips) — status: shipped (basics) / planned (full depth gate)

### Marketing positioning assets (ready-to-use)
copy.md has drafted: tagline options ("Dish-first food discovery"; "Stop guessing. Order the dish everyone actually loves."), value props (dish-first not star-first; evidence-backed scores; what's good RIGHT NOW), score tooltips, and a "vs other apps" positioning paragraph. Aligns with the objective-ranking + dishes-hero strategy. (source: copy.md §1-2) — status: shipped (copy drafts)

---

## Stale / superseded ideas (from the old PRD/BRD — do NOT revive without re-checking)

- PAY-TO-RANK / sponsored ranking — FORBIDDEN. BRD §3.2 Enterprise ('Boost existing positive mentions', 'Feature in Trending Now') and BRD §8.2 ('Marketing Amplification', amplify mentions) imply restaurants paying to influence visibility/ranking. The current integrity stance bans any pay-to-rank or sponsored results forever. Restaurant B2B may sell analytics/claimed profiles/sponsored-polls ONLY, never ranking influence. REJECTED as written.
- Personalized recommendations / personalized re-ranking — STALE/OFF PERMANENTLY. BRD §6.2 ('Based on your love of Little Deli's wrap…', 'Similar to dishes you've saved'), PRD §10.5 'Personal recommendations: AI-driven suggestions based on history' and §10.7 'Personalized feeds / recommendation engine'. Ranking is OBJECTIVE and global; taste enters ONLY via the user's own search query or their own favorites lists. Saved-item TRENDING alerts are fine (user-declared, not taste-curated); taste-personalized re-ranking/feeds are not.
- Old tier pricing — SUPERSEDED. BRD §2.4/§6 list Basic $3.99/mo + Premium $9.99/mo (and a 99¢ launch tier, and $7.99). PRD §4 has a generic subscriptions schema. Current pricing is a SINGLE Crave+ tier at $7.99/mo + $39.99/yr (push annual). The multi-tier consumer pricing ladder is dead.
- Old free/paid feature split — SUPERSEDED. BRD §2.4 put 'full search + bookmarking + list sharing' in a PAID Basic tier and 'discovery feed' entirely behind Premium. Current split makes the objective ranking + structured search + map + open-now/price + poll vote/discussion + list create&share all FREE; the DISH layer + NL search + momentum/rising + score 'why' + power filters are paid.
- Reddit-specific attribution & sharing branding — REWORK, not reject. BRD §6/§8.1 and PRD §8.1/§8.3 hard-code Reddit ('Post to r/austinfood', 'Thanks r/austinfood!', 'Powered by Reddit communities', Reddit deep-links, Reddit-moderator partnerships). copy.md deliberately does NOT name source platforms ('without naming specific source platforms'). The share/attribution MECHANICS are good; the Reddit-named copy is stale/off-brand — re-frame as generic 'community'.
- Ads / advertising as a revenue line — CONTRADICTED. The integrity stance is eater-pays subscription specifically to AVOID ads-or-B2B-in-ranking misalignment. Any ad-supported monetization is off the table for the ranking surface.
- 'Vote' model as a live ranking input — STALE. The vote model was DELETED (commit 19a2cbd6); polls feed the score only at close-time graduation (cb6d91ab). Any business idea premised on continuous live community voting driving the score is outdated; design around polls-graduation instead.

---

## Open questions

- Reverse trial vs. plain time-limited trial vs. no-trial direct-purchase: the day-8 clawback is the one integrity-incongruent risk — which wins the mandatory Q1 60-day-RPI A/B, and does the founder's integrity gut veto the clawback regardless of the number?
- Where exactly does the free line sit (the 'one dial')? E.g. how many free NL/semantic searches per day before soft-degrade; top-N dishes shown free on a restaurant profile (3? 5?); how much score 'evidence' is free vs. Crave+.
- What is the pre-committed kill criterion to tighten freemium→paywall (proposed: trial→paid < ~5-6% after ~90 days AND no referral/WoM lift AND support load unmanageable) — lock the exact thresholds before launch.
- Is word-of-mouth install-elastic? This single empirical question decides freemium-vs-tighten; what instrumentation (referral attribution, install→share funnel) proves it post-launch?
- B2B Phase-2 pricing: are the BRD $99/$249/$399 tiers anywhere near right, and what's the minimum consumer density before B2B outreach is credible?
- Sponsored polls: what guardrails keep them visibly distinct from the ranking and immune to the 'pay-to-rank' perception, given polls graduate into the score?
- Margin steering: how aggressively (and Apple-legally) can renewals/returning users be routed to web Stripe checkout (~+12pts) without tripping App Store anti-steering rules?
- Launch city: which single city has enough Reddit/food-community signal density to seed the objective ranking and the demand-waitlist loop?
