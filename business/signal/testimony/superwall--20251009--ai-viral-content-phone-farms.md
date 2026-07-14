---
source: superwall/20251009 - How to Make Viral Content 100% Using AI in 2025 [kMO0VYTBC7U].txt
date: 2025-10-09
speakers: Zuhair Lani (guest; founder of "Double Speed", a VC-backed AI content + phone-farm posting platform; ex TikTok Shop seller / agency operator; name uncertain — auto-captions render it "Zuhair Lani"/"Zuher"/"Zuhair"; a16z speedrun founder), Joseph Choy (host; founder of Consumer Club; Superwall-sponsored podcast)
apps: Double Speed (name uncertain from captions; tool — AI slideshow/content generation + phone-farm posting platform; claimed scale = client with 4.7M views from 15 accounts in <4 weeks; raised ~$1M via a16z speedrun); guest's prior TikTok Shop poster brand (other/e-commerce; claimed $100K sales in first month); guest's content agency (tool/service; claimed $40K/mo while in college); "Cali" calorie app and a Spanish-learning app appear only as format examples, no numbers
evidence_quality: claimed-numbers throughout (founder telling his own story, no dashboards shown on screen that we can verify from transcript; view counts and revenue are self-reported); the product demo itself is first-party but its performance claims are claimed-numbers
incentive_flags: guest is actively selling the exact platform he describes (every claim doubles as a pitch for Double Speed); host's podcast is sponsored by Superwall (paywall tooling) and host sells Consumer Club membership ("median revenue of member is about a million ARR"); classic survivor narrative — banned TikTok Shop account reframed as origin story
---

## Arc

Zuhair Lani (spelling uncertain) went from sneaker/retail botting during COVID → white-label products (pickleball paddles in TJ Maxx) → Supreme-style hype marketing for his dad's restaurant → TikTok Shop poster brand run on AI content ($100K claimed first month) → content agency ($40K/mo claimed while in college) → a16z-speedrun-funded startup that owns both halves of the AI-content stack: generation (templated slideshows, synthetic faces) and deployment (physical phone farms of real devices posting to warmed TikTok accounts). The video exists to showcase that startup on a Superwall-sponsored app-growth podcast.

## Claims

### Content strategy (organic)

- Client on his platform generated **4.7 million views with 15 accounts in under 4 weeks** (claimed; his own client, no verification shown in transcript).
- First AI-made TikTok for his poster product: **~5K views on day one, 3 sales**; a later/related video "got 280,000 views." Quote: "as soon as it got three sales I went to the print shop and I gave them a deposit... like 100 bucks." (claimed)
- Slideshow strategy: "minimum viable content" on **sub-accounts**, not the main account — e.g. "cool stuff you need in your room" carousels where one slide of several is your own product; car account posting "eight pictures of a Porsche 911" with the poster as the last slide, prompting "where can I get that poster?" comments. Insert the product as a relevant subject, never as an overt ad.
- Pain-point slideshow formula: slide 1 names the pain ("I used to struggle with tracking my calories"), body slides list solutions ordered hardest-first (a food scale), your app is inserted as the easy/cheap final solution — "give them some solutions that feel real but are just way too high effort... and then pose your solution."
- Image-bank modularity: slide 1 = AI or real creator face; remaining slides drawn from a bank — "a collection of 50 images that you can run 300 slideshows on."
- Synthetic faces: contract a real person's likeness → train a LoRA (captioned "Laura"/"Allora" — LoRA intended) → consistent AI creator across posts; converts better "because you have a real person giving a real story." Tools named: Flux; "Hfield" (uncertain — likely Higgsfield); earlier stack was ElevenLabs ("11 Labs") + Midjourney.
- Ran **25** face-creator slideshow accounts simultaneously, "a post or two every single day" each, with a human final check.
- 95/5 rule: "You want AI to do like 95% of the work and then human comes in 5% for touch-up. I don't think AI is there yet to do the last 5% and nor do I sell that dream" — anyone claiming 100% AI is "fully BS." (Note: contradicts the video's own title.)
- Format discovery: search niche terms ("study talk" for a study tool), look at viral hits from the **last month or two**, train your own FYP algorithm onto the niche; then clone a winning TikTok via his link-to-template tool and vary it ("you can copy someone's content but then you need to make some type of difference").
- Arbitrage cycles: "one marketing strategy does not work for more than like a couple months at a time. Maybe like a year if you're lucky." The hire-a-bunch-of-creators cycle has run **2–3 years**; once "all the big guys" (Duolingo, "Belly" — uncertain, possibly Bilt/Blinkist-type brand) adopt a format it dies "in a couple months." Mass-account strategy itself will persist "as long as content is organic and... followers don't really matter anymore."
- "Attention intelligence" feedback loop: because they own posting, they get view/like/bookmark data per variant and feed it back — "this content worked better, this prompt did good, this model did good." Host corroborates from his own practice: feeding real engagement numbers into Claude/GPT makes generated content "probably five ten times better than just generic prompting." (anecdote)
- Prove the concept manually **before** automating: early slideshows were a VA manually pulling images from Cosmos/Pinterest; "you want to prove out the concept before you start automating it."

### UGC & creator deals

- Traditional creator model: hire college kids for "30 videos in 30 days" at **$500–$1,000/month per creator**; one full-time person managing 25 creators via weekly calls; creators unreliable ("sometimes they'll post, sometimes they won't"), no accountability — "The ROI just isn't there." He was one of these creators himself (first-party from the creator side, claimed on the economics).
- His verdict: "if you're doing hook and demo, you probably shouldn't be paying creators" — auto-match hooks to app screen recordings instead.

### Team, tools & cost structure

- Phone farm: physical devices running custom software that swipes/reposts/comments "to look like a natural human"; multiple TikTok accounts per phone; proprietary warm-up algorithms ("we just don't showcase" them). Android emulators (BlueStacks) worked in 2023 but are dead now — "TikTok has device fingerprinting."
- Warm-up mechanics: accounts search operator-chosen exact terms, watch/scroll; screenshots are sent to an LLM to judge relevance → repost/comment if relevant, keep swiping if not.
- Account setup: AI generates usernames/bios/personas per account ("this person is 24 years old, goes to USC, lives in Los Angeles"); vary one axis per account (self-care vs self-improvement vs lifestyle) — "you don't want to run all your accounts the same cuz then you're not really A/B testing anything. But you also don't want too many variables."
- Ran **15 brands** simultaneously with AI while in school; agency hit **$40K/month** (claimed, per host intro); host intro also credits him with **$100K revenue in a single month** from AI TikTok content.
- Owning both layers (generation + deployment) is the thesis: "We only do half the job, then we're worthless."

### Launch & sequencing

- Restaurant hype playbook (his dad's restaurant): Supreme-style waitlist + reservation "drops" every **Wednesday at 4:00 p.m.**; first drop had only ~20 signups against 100 seats but he declared it sold out anyway — "it's better to look like you're full and get people to hit you up." Result: sold out for **2 months**, **6,000-person waitlist**, press article. Local Facebook groups = the restaurant equivalent of a hyper-specific subreddit; encouraged customer reviews there for FOMO. "Google ads did great. Facebook, same thing. This is all organic." (last line is self-contradictory as captioned — ads vs organic garbled.)
- Waitlist also improved ops: control reservations to pack tables (fill 100 seats instead of ~88).
- TikTok Shop poster business: **$100,000 sales in the first month** using only AI content (claimed). Ended when a 3PL manager "got deported to Mexico on New Year's Eve weekend" with **1,000 orders** queued, blowing TikTok Shop's **2-day delivery** deadline → account banned.
- Fundraise: a16z "speedrun" (their YC-style program), "they do a total of **1 million**." Motivation: "I didn't drop out of school and quit my job to not build a billion dollar company" — he was earning more in college running the agency than at his Cosmos job.

### Retention & product

- None discussed for consumer apps; the only retention-adjacent idea is the content feedback loop making posts "smarter over time."

## Deal structures

- Creator-market rate (secondhand/claimed): $500–$1,000/month per college-age creator for ~30 videos/30 days, managed in Slack/iMessage, ~1 FTE manager per 25 creators.
- His poster print shop: $100 standing deposit, print-on-order, bill card after — improvised just-in-time supply, not a creator deal.
- No platform pricing for Double Speed was stated. No rev-share, per-view, or affiliate terms discussed.

## Contrarian positions

- Don't pay human UGC creators for hook-and-demo content at all — the standard $500–$1K/mo creator program is negative-ROI and AI + phone farms replace it.
- Followers don't matter; run many warmed sub-accounts rather than building one brand account.
- Fake scarcity is a feature: declare sell-outs you haven't achieved ("we weren't even booked... I just said it was done").
- Against the "100% AI" hype his own title sells: 95% AI / 5% human, and anyone selling full automation is "fully BS."
- Copying winning content is the starting point (link → template → variants), not originality; the moat is the posting/data layer, not the creative.
- Every format decays in months; strategy = perpetual format arbitrage, not a durable channel.

## Crave transfer

Almost every number here is a self-reported claim from someone selling the tool that produced it, so treat the 4.7M-views/15-accounts and $100K-month figures as marketing, not benchmarks. The mass-account slideshow playbook transfers poorly to Crave as-is: it's built for impulse, low-consideration purchases (posters, TikTok Shop goods) and single-session apps, whereas Crave needs a hard-paywall subscription with local trust — and running fake-persona phone farms is TOS-violating, ban-prone (his own Shop account died), and brand-toxic for a credibility product. What does transfer: the pain-point slideshow structure ("I used to pick restaurants off 4.2-star Google averages…" → harder solutions → Crave as the easy one), sub-accounts/local niching (Austin-food-specific accounts and the "Facebook groups are the local subreddit" insight fit a one-city launch exactly), image-bank modularity for cheap volume (50 dish photos → hundreds of carousels), and the discipline of manually proving a format before automating. The creator-cost anchor ($500–$1K/mo per college creator, flaky output) is a useful real-world price point if Crave considers UGC deals — but note his incentive is to make that option look bad.
