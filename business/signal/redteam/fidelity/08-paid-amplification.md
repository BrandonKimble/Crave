# Fidelity audit — ledger/08-paid-amplification.md

Auditor pass: red-team fidelity. Method: extracted the load-bearing claims (esp.
those the blueprint §6 + §8 lean on), located each in the RAW transcript
(digit-by-digit on figures), then fresh-read the 6 round-robin raws (slot 7/11)
for anything the pipeline missed or distorted.

**Headline: this section is unusually faithful.** Every load-bearing number I
checked survived a digit-by-digit read against the raw. The prior agent's
uncertainty flags ("secondhand", "vendor claimed", "claimed, loose ranges") are
placed correctly. Two nano-notes below are paraphrase texture, not error. The
one substantive thing for the blueprint is a _missing counter-datapoint_ from my
fresh sweep (Symmetry), which softens — does not break — §6's "Spark is the only
mechanism" framing.

## Fidelity table (claim | cited source | verdict | note)

| Claim (ledger)                                                                                                     | Cited source                      | Verdict                                      | Note (raw quote / line)                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cal AI subtle cameo capped Meta $10–15k/day → whole-video-about-app "sell in 5s" broke to ~$40k/day                | thebrettway--20260302             | **CONFIRMED**                                | "that guy was maybe at 10K a day… maybe 15… directly selling the app… 5 seconds… we got I think we're doing like 40K a day" (L138–141)                                                                                             |
| Cal AI $7k/day Meta, profitable daily, paid started ~month 4–5                                                     | thebrettway--20241128             | **CONFIRMED**                                | "$7,000 a day… we're profitable every day" (L372–373); "we've only done this the past couple of months" + "launched 6 months ago" (L374/178)                                                                                       |
| ~$2M/mo influencer ceiling (audience overlap saturation) → $5.7M/mo after Meta                                     | thebrettway--20260302             | **CONFIRMED**                                | "consistently to like 2 million a month"; "share the same audiences… smaller bang for the buck" (L35–37); "in January we did $5.7 million" (L39)                                                                                   |
| $500k MrBeast deal, slightly unprofitable direct, brand-halo justified                                             | thebrettway--20260302             | **CONFIRMED**                                | "That was half a million dollars" (L64); "slightly unprofitable just off… conversions… afterwards… so much brand authority… probably made it a profitable deal" (L77–79)                                                           |
| +~30% custom-product-page adjustment for watch-then-search users                                                   | thebrettway--20260302             | **CONFIRMED**                                | "increase it by about 30% because many people… go to the App Store, and type in your app name by themselves" (L45)                                                                                                                 |
| Apple 24h signal window → optimize trial-start pixel, back-model conversion                                        | thebrettway--20260302             | **CONFIRMED**                                | "Apple… only allows you to send high-quality data in the first 24 hours… we have a 3-day free trial… so we just model out" (L128–131)                                                                                              |
| "90% of paid ads is the creatives"                                                                                 | thebrettway--20241128 (+20260302) | **CONFIRMED (lightly hedged)**               | Interviewer: "I've heard that 90% of paid ads is really about the creatives" → Zach: "mhm" (L370). Framing is shared/agreed, not volunteered — but faithful.                                                                       |
| "organic builds goodwill, paid ads liquidate it" (quoted)                                                          | thebrettway--20241128, --20260302 | **CONFIRMED (paraphrase in quote-marks)**    | Actual words: "building up… eyeballs and goodwill… brand building and then paid ads is where you liquidate" (20260302 L193–194). Faithful paraphrase; source is the pair, quote is from 20260302 not 20241128.                     |
| Agency capped Cal AI at $5k/day; "never care as much"                                                              | thebrettway--20260302             | **CONFIRMED**                                | "We were just capped out… couldn't pass 5K a day in spend" (L99); "never going to care as much as someone… on the team" (L95)                                                                                                      |
| Agency half-life ~6 months                                                                                         | superwall--20250404 (Choi)        | **CONFIRMED**                                | "their lifespan is no more than like… no more than 6 [months]… so good they just decide to… build their own products" (L445–447)                                                                                                   |
| AppsFlyer skepticism: "you have to use one… never really does"                                                     | thebrettway--20260302             | **CONFIRMED**                                | "we of course used an MMP… AppsFlyer. You have to really use one for apps… but it never really does" (L133–134)                                                                                                                    |
| Spike-correlation + incrementality on/off tests                                                                    | thebrettway--20260302             | **CONFIRMED**                                | "Looking at the spikes is a big thing. Doing incrementality tests" (L83–87)                                                                                                                                                        |
| Spark: ER >7.5–8% → $20 test (elsewhere 10%); $50–100/day a week; kill <5% ER                                      | superwall--20260601               | **CONFIRMED**                                | "above 7 1/2 to 8" (L128); "gets above a 10%… test putting a little bit of spark money" (L204); "$20 behind it" (L208); "$50 to $100 a day… run for a week" (L254); "drops below 5%, we kill the spark" (L255)                     |
| Sub-$1 CPM sparked; sub-80–90¢ at $100k+/mo programs                                                               | superwall--20260601               | **CONFIRMED**                                | "below dollar CPMs on Spark" (L209); "biggest spenders… $100,000 a month… sub dollar… sub 80 to 80 to 90 cents" (L329)                                                                                                             |
| Creator-program CPM curve: month-1 $5–8 → month-3 <$3 → sub-$1                                                     | superwall--20260601               | **CONFIRMED**                                | "five to eight dollars your first month… by month three… sub three… then after" (L320)                                                                                                                                             |
| Organic ROAS ≈ Spark ROAS +15–20%                                                                                  | superwall--20260601               | **CONFIRMED**                                | "for every $5 I spend, I make $10 on Spark… a little bit better on organic. Call it like 15-20% better" (L225)                                                                                                                     |
| Spark priority = comment-sentiment ("what is that app?") > ER > views                                              | superwall--20260601               | **CONFIRMED**                                | "when you see comments like, what is that app?… comment sentiment is like very important" (L251–252); "content or comments sentiment… then engagement rate, then average views" (L253–254)                                         |
| Don't spark a still-climbing organic; sparking lifts later organic; partnership > spark; Spark targets country/age | superwall--20260601               | **CONFIRMED**                                | L256 (hold on climbing); L248 (future videos do better organically); L269/272 (partnership higher conversion); L235 ("Spark towards countries… age groups… whatever you want")                                                     |
| GoWish #1 App Store "almost entirely Spark"                                                                        | superwall--20260601               | **CONFIRMED — correctly labeled SECONDHAND** | Drew: "Seen Marketing, one of the agencies on Sideshift, was running a campaign… went to number one… almost entirely from Spark" (L209–210) — it's an agency's campaign, not Drew's. Ledger flags "secondhand". ✓                  |
| 1 winner in ~85 ads; ~$800k of $1.5–1.8M wasted, over 2.5 yrs                                                      | superwall--20260426               | **CONFIRMED**                                | "1.5 to 1.8 million… 800k was wasted" (L2); "One in 85 ads" (L5); "Not in a year, but in 2 years and a half" (L118)                                                                                                                |
| $100/day → $10k/day ramp; banned 6–8x                                                                              | superwall--20260426               | **CONFIRMED**                                | "100 a day, 500 a day, 1,000 a day, 10k a day" (L41); "six eight times… permanent bans" (L51)                                                                                                                                      |
| L1 $10–20/video (kill $5–10); L3 evergreens take 90% of spend (3-tier)                                             | superwall--20260117               | **CONFIRMED (verbatim)**                     | "test each video with… $10 to $20"; "shut it off… after $5 or $10" (L103–104); "level three evergreens that get 90% of the ad spend" (L10)                                                                                         |
| Jan CPI ≈ half; 75% of annual budget in month 1 (noise for Crave)                                                  | superwall--20260117               | **CONFIRMED — correctly binned as NOISE**    | "75% of their entire annual ad budget in January… 50% cheaper" (L11–13); health/fitness New-Year artifact. ✓                                                                                                                       |
| Yev $20 TikTok / ~$1 FB platform minimums; kill at $5                                                              | superwall--20250623               | **CONFIRMED** (see nano-note)                | "$20 minimum on Tik Tok" (L252); "turn it off after it spends $5" (L253). FB "$1" = his "$1 amplifier"/platform-minimum (L229), fair read but not a verbatim "$1 on Facebook".                                                     |
| CPP tiers $50 / $100 / $200 (aggressive / profitability / data-fuel)                                               | superwall--20250623               | **CONFIRMED**                                | "$50 cost per purchase versus $100 versus $200… different goals… $200 way more lenient… more aggressive… reach profitability" (L117–119)                                                                                           |
| Real purchases ≈ 2× platform-reported                                                                              | superwall--20250623               | **CONFIRMED**                                | "10 purchases reported or 100… real data where it's like double that… usually like double that" (L157–158)                                                                                                                         |
| Marcus Burke: 65+ cost/trial ~100% higher, converts much better; 18–24 can't afford $70/yr                         | superwall--20260621               | **CONFIRMED**                                | "100% higher… trial cost on a user 65 plus, but they… convert a lot better" (L279); "18 to 24 just doesn't have the money to spend like 70 bucks a year" (L264)                                                                    |
| $1M+ lifetime on one ad; ~400–500 iterations                                                                       | superwall--20260621               | **CONFIRMED**                                | "400 iterations" (L69); "well above like a million dollars… on this specific ad format" (L71); "400 500 iterations" (L237)                                                                                                         |
| Sway: $30–40k/mo organic ceiling → $2M ARR with paid                                                               | superwall--20260505               | **CONFIRMED**                                | "probably like 30 to 40K a month, and then… doing ads… easier" (L69); "30, 40k MRR just from organic… then you got to 2 million ARR… four to five times" (L77–78)                                                                  |
| Quittr: ~$40k/mo spend at 3–4× ROAS, recycling creator videos via usage rights                                     | thebrettway--20250210             | **CONFIRMED**                                | "40 Grand a month in spend… bringing in… three or four row as" (L393–394); "usage rights… in the contract" (L241/292). (Note: the "40K in a day" at L188 is a _separate_ viral-revenue figure — the ledger did NOT conflate them.) |
| Glow ads-first: €25–30/day; <$0.10 CPI best; $360 of ~$700 was free credits; sells a course                        | arthurspalanzani--20260110        | **CONFIRMED**                                | "25 to 30" (L177), "€30 every day" (L199); "than 10 cents per download" (L331); "$35 per day… $700… $210 + $150… nearly half… free credits" (L355–356); "filmed some part of the course" (L345)                                    |
| Glow ASA: $100 credit → 4 downloads (failure)                                                                      | arthurspalanzani--20260110        | **CONFIRMED**                                | "$100 credits" (L193); "I got only four downloads for now. This is not working" (L299)                                                                                                                                             |
| Install→paid 4–10% band (>10% good, <4% problem) — derives Crave CPI ceiling                                       | superwall--20251116               | **CONFIRMED**                                | "10% and above installed to paid rate… really good. Anything less than 4%… not good. Between four to 10%… not terrible but not great" (L34–35)                                                                                     |
| Cal AI: bid competitor ASA keywords; profitability = product-is-better proof                                       | thebrettway--20241128             | **CONFIRMED**                                | "Apple search ads… if your product is better than a competitor's… run the ad on their search terms and it's profitable… you have a better product" (L381–388)                                                                      |

Two nano-notes (texture, not defects): the goodwill/liquidate line is a faithful
paraphrase set in quote-marks; Yev's "$1 FB" is a reasonable rendering of "a $1
amplifier"/platform-minimum rather than a verbatim quoted figure. Neither changes
any downstream call.

## Fresh-sweep findings (my 6 assigned raws, slot 7/11)

Note: **none of my 6 assigned raws are cited in ledger 08** — so this is net-new
coverage. Five of six corroborate the section; one carries a real correction for
the blueprint's framing.

**1. arthurspalanzani--20260702 — Symmetry / Mauro ($200k/mo, ~1B views, 2M
downloads/9mo, 100% organic).** ⚠️ **The one decision-relevant finding.**

- This is a first-party $200k/mo operator who **deliberately declines to Spark
  organic winners** and stays 100% organic: _"some people… when suddenly one pops
  off, they're just switching to spark ads… but you do everything organically.
  Why?… paid ads is a completely different skill"_ (L16–19). Ledger 08's Spark
  doctrine (consensus #6) is sourced almost entirely from Drew (a vendor selling
  the tooling); here is a large operator who considered spark-the-winner and chose
  pure organic. It does **not** refute that Spark works — his reason is founder
  focus/skill — but it confirms Spark is _optional even at scale_, and the
  blueprint frames it as instrument-grade optional, so this is consistent.
- **Bigger point for §6:** Symmetry solves the _single-market concentration_
  problem (Spain-only) with **organic** levers — content in the market's
  language + hiring creators who ARE the ICP — not paid geo-targeting. Ledger 08
  ("Where the evidence points") and blueprint §6 both assert Spark/partnership geo
  is _"the only mechanism anyone offers that fixes the one-city waste problem of
  organic reach."_ Symmetry is a live counter-example that **organic
  geo-concentration exists**. Caveat that saves the blueprint: Spain = a
  country/language you can filter on; **Austin = a sub-national metro inside the
  US-English market, where you can't language-filter**, so Symmetry's lever only
  partially transfers (creator-sourcing + local hooks concentrate, but English
  content still leaks nationally). Net: §6's claim is **overstated as literally
  "the only mechanism"** — it should read _"the only PAID lever, and the only lever
  that bites at metro granularity where hooks/language can't filter the leak."_
  The blueprint's own §4 (Austin creators + Austin hooks) already IS the organic
  half; §6 should acknowledge it rather than imply paid is the sole answer.
- Corroborates spike-correlation attribution (L74–79) — same method the ledger
  attributes to Symmetry via the _other_ (20250707) interview. Not double-counted
  in the ledger today; flagging so a future pass doesn't count the two Symmetry
  appearances as independent sources.
- Also pays creators via a monthly-recalculated CPM with no cap (L64–67) and uses
  _paid ads to recruit creators, not to acquire users_ (L24) — a "paid-as-input"
  variant worth a footnote but not a contradiction.

**2. superwall--20251009 — Zuhair/Double Speed (phone farms, AI mass-account,
A16Z).** Clean. This **is** one of the three raws ledger 08 lists in its Noise
discard ("phone farms, reposter fleets, mass-account Spark of AI slop… ToS-
violating, ban-prone, trust-toxic for a credibility product"). The
characterization is accurate: physical phone farms defeating device
fingerprinting (L28–29), 15 accounts→4.7M views (L142), 25 brands at once, banned
on TikTok Shop (L197). Blueprint §10 already discards this class. No change.
(Minor supporting note: he confirms hyperlocal Facebook-groups/subreddits as an
_organic_ local-targeting lever — L69–72 — reinforcing the same non-paid
geo-concentration point as Symmetry, and matching blueprint §4's community-seeding
fallback.)

**3. superwall--20251221 — Jack Friks (Curiosity Quench / PostBridge / Doof /
Lovely).** Clean for §08; two cross-section notes.

- **Never used paid ads** at 6-figure scale: _"the app's premium right now, so
  paid ads don't really make sense… I've never really used paid ads"_ (L292–293).
  Reinvests into _more organic volume_ (20–40 accounts, hundreds of videos/day —
  L294), not cold UA. Corroborates blueprint §6 no-cold-UA.
- **Out-of-section flag for the §0/§2 owners:** he flipped Lovely from a **hard
  paywall to freemium because of bad App-Store reviews** (_"I got a lot of bad
  reviews about the hard paywall"_ L185). Lovely is a two-player couples app with a
  viral loop, so it fits the blueprint's existing anti-hard-paywall carve-out
  (loop-protecting apps) — but "hard paywalls draw negative reviews" is a concrete
  risk the blueprint doesn't name, and it bears on Crave's in-onboarding rating-ask
  - ASO (ratings weight ASO ranking — see Kesh raw below). Not my section; passing
    to whoever owns §0/§2 fidelity.
- Transcript-reliability caution (not a pipeline error): this raw internally
  garbles Curiosity Quench as "$500,000 a month" (L23) vs "$15,000 in one month"
  peak (L25). Not cited anywhere in ledger 08, so nothing is misquoted downstream —
  but it's a live example of why the digit-by-digit discipline matters.

**4. superwall--20260315 — "Stupid Simple Content Strategy."** Fresh-read; no
paid-amplification claims that touch ledger 08. Content is organic-format /
friend-network mechanics ("goodwill going around, I've done free videos for my
friends" L278). Clean, nothing to add or correct.

**5. superwall--20260607 — Evan Yadegari / Locked ($14k/mo, Cal AI's brother).**
Clean; all corroborating.

- Tested paid ads, dropped them; **influencers won** at his scale (L41–42). Notably
  the intro voiceover garbles this as "Reddit" (L5) while Evan himself says
  "influencers" — internal caption garble, not a pipeline issue (uncited in 08).
- Spike attribution: _"attribution is very difficult because you can't directly
  attribute it to a link… I base it off spikes"_ (L116–117) — corroborates
  consensus #4.
- Content rule: incorporate the app **within the first 15 seconds** or "it will
  seem like an ad" if before / "retention too low" if after (L111) — a close cousin
  of Cal AI's "sell in 5s" (consensus #2), same direction.
- Creator-deal structures (minimum-view-clause favored; CPM-under-RPM discipline,
  RPM $3–4/CPM $1–2) — ledger 05/06 territory, consistent. Gray-hat DM tactic
  (bought 1k followers + multi-account to beat the 100 DM/day limit, L78–83) is the
  account-farm class the blueprint §4/§10 prohibits; noted, off-brand for Crave.

**6. thebrettway--20250904 — Kesh / Social Wizard + Clean Eats ($1.5M).** Clean;
corroborating.

- **Zero cold UA** — growth is 100% founder organic + micro/creator deals
  (retainer/flat-fee; no CPM in his niche, L320–321). Instrument-grade creator
  spend: explicit _"if I spend $1,000… can I make $3,000 back — 3x"_ model (L342);
  one $5k creator deal returned ~$20k (L348). Reinforces blueprint's
  paid-as-instrument + creator-first framing.
- Minimum-view-clause deal structure, tied to **one platform**, **7-day
  measurement window** (L356–361) — a sharper version of the blueprint §4 milestone
  structure; worth folding into creator-contract guidance (that's ledger 05/06).
- ASA context: confirms competitors **run ads against your keywords/app on the App
  Store** (L199–200), and that **Apple weights ratings for ASO ranking** (L202) —
  both relevant to blueprint §6/§7 (ASA + rating-ask), consistent.

## Bottom line

**Does §08 faithfully represent the raw data? Yes — this is the cleanest fidelity
result I'd expect from a mid-tier distillation.** All ~30 load-bearing figures
reconcile digit-for-digit with the raws; the uncertainty/echo/secondhand labels
(GoWish "secondhand", Drew/Sideshift "vendor claimed", January-arbitrage + sub-$1
CPMs binned as "noise", Glow's credit-inflated economics binned as noise) are each
placed correctly. No overstatement of echo-as-independent that I could find; the
Cal-AI-is-the-ur-text echo risk is explicitly acknowledged in consensus #1. The
"organic builds goodwill / paid liquidates" quote is a faithful paraphrase in
quote-marks, and Yev's "$1 FB" is a fair rendering of "platform minimum" — neither
moves a decision.

**What the blueprint should change — one item, and it's a softening, not a
reversal:**

- **§6 (and ledger 08's "Where the evidence points"):** drop the absolute _"Spark…
  is the only mechanism anyone offers that fixes the one-city waste problem."_ My
  fresh Symmetry raw is a first-party $200k/mo, ~1B-view operator who solved
  single-market concentration with **organic** levers (in-market language +
  ICP-creator sourcing) and **deliberately never Sparked**. Restate as: _organic
  geo-concentration (local creators + city/dish hooks — the blueprint's own §4
  plan) is the primary lever; Spark is the **paid amplifier for the residual
  national leak that a US-metro's English content can't filter** (Austin can't
  language-gate the way Spain can)._ This keeps §6's paid recommendation intact
  (metro geo-targeting is verified real per the fact sheet) while removing an
  overclaim that a fresh reader can immediately falsify. It also right-sizes the
  Spark doctrine's evidentiary weight: it leans on a single vendor (Drew), and a
  large operator on the other side of the trade chose to skip it.

**Cross-section hand-off (not §08, flagged for completeness):** Jack Friks
(superwall--20251221) is a concrete hard-paywall→freemium flip driven by **negative
App-Store reviews of the hard wall** — a data point + named risk the blueprint §0/§2
doesn't currently carry, and it interacts with Crave's onboarding rating-ask and
ASO (ratings weight ASO). Worth the §0/§2 owner's attention.
