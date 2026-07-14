# Fidelity Audit — ledger/11-scaling-and-sequencing.md

Auditor slot 10/11. Ground truth = raw transcripts. I fully read my 5 assigned
raws (Blue Throne 20260708, Ryan Thorp 20260117, Dan Kwan 20251026, Bloom
20250707, Coconote 20260412) — two of which (Blue Throne, Ryan Thorp) are the
single most load-bearing sources for this section and for the blueprint's metrics
table, and a third (Dan Kwan) is cited in this section's consensus #1. I
grep-verified every remaining number in the section against its source raw.

**Headline: this section is high-fidelity.** Essentially every load-bearing
number checks out digit-for-digit against the raw, and the ledger honestly
flagged uncertainty exactly where the founder himself was uncertain (Speedran
valuation). The defects are minor: one externally-sourced figure inserted as if
from the transcript ($345M), one confusing table label, two prescriptive→
descriptive / derived-precision softenings, and a 2-vs-3 agency source-count
mismatch with the blueprint. None overturns a blueprint call.

Note on citation labels: the section's `NN-name` labels (e.g.
`04-jenny-ai-matt-ugc-program`) are the ledger author's shorthand and do **not**
match any real filename; I mapped each to its true raw by content and verified
there. The labels mislead a cross-referencer but the underlying sourcing is sound.

---

## Fidelity table

| Claim (ledger)                                                                                           | Cited source → true raw               | Verdict                                    | Note                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0→1 = work ethic + idea + ONE channel; 1→10 = expert in many                                             | 02→blue-throne 20260708 (l.26-31)     | **CONFIRMED**                              | "1→10 is a different sport" is a fair paraphrase set in quote-brackets, not verbatim                                                                                                                                                                                                                                         |
| One channel: push to ceiling before jumping                                                              | 02→20260708 (l.329-332)               | **CONFIRMED**                              | verbatim in spirit ("push, push, and push until you find the ceiling")                                                                                                                                                                                                                                                       |
| Organic share: 50%+ great / 35–50 good / <20 UA-treadmill                                                | 02→20260708 (l.137-138)               | **CONFIRMED**                              | digit-exact ("50% great. 3550 [=35-50] good. Under 20 not great… UA treadmill")                                                                                                                                                                                                                                              |
| Year-1 resubscribe: 50 amazing/40 good/30 ok/20 bad                                                      | 02→20260708 (l.116)                   | **CONFIRMED**                              | digit-exact, verbatim                                                                                                                                                                                                                                                                                                        |
| Top-20%-by-engagement retention curve must flatten = the buyer's metric                                  | 02→20260708 (l.103-107)               | **CONFIRMED**                              | verbatim; Josh is indeed the corpus's only actual M&A buyer                                                                                                                                                                                                                                                                  |
| MFP $475M (2015) → **$345M** (2020, PE)                                                                  | 02→20260708 (l.293-294)               | **OVERSTATED (precision)**                 | $475M/2015/Under-Armour ✓ and "Francisco Partners, 2020, PE" ✓, but the raw says only "over 100 million less" — the exact **$345M is external knowledge, not in the transcript**. Also the cell label "**MFP: Cal AI** $475M" is wrong: this deal is MyFitnessPal↔Under Armour, unrelated to Cal AI                         |
| Cal AI $1M/mo → $5.7M/mo (Jan 2026); $30M 2025 rev                                                       | 07→zach 20260302 (l.1,39,2)           | **CONFIRMED**                              | digit-exact; "$30M" garbled as "$30" but unmistakable. "~30 FTE" context **not in this 2026 raw** (likely the 2024 companion); low-stakes                                                                                                                                                                                    |
| Influencer-pool ceiling ≈ $2M/mo (single niche), forced broadening                                       | 07→20260302 (l.34-37,62)              | **CONFIRMED**                              | "consistently to like 2 million a month… then decided to broaden the horizon"                                                                                                                                                                                                                                                |
| Health/fitness year-1 renewal ≈ 30%                                                                      | 07→20260302 (l.102-104)               | **CONFIRMED**                              | "average for the industry is about 30%… 30% retention, not churn" — ledger correctly reads it as renewal                                                                                                                                                                                                                     |
| Zach fired agency ("never care as much"), capped $5k/day, Meta in-house                                  | 07→20260302 (l.95,99)                 | **CONFIRMED**                              | "never going to care as much as someone… on the team" (l.95); "couldn't pass 5K a day in spend" (l.99). Quote lightly compressed                                                                                                                                                                                             |
| Geo-arb devs ~$1k/mo = "quality ceiling"                                                                 | 07→20260302 (l.158-159)               | **CONFIRMED**                              | "1K a month developers… in India… no wonder the quality wasn't good" — self-discredited, as ledger says                                                                                                                                                                                                                      |
| Joseph Choi: agency lifespan ≈ 6 months; the good ones run their own apps                                | 10→joseph-choi 20250404 (l.445-447)   | **CONFIRMED**                              | "lifespan is no more than… 6 [months]" + "so good that they… just build their own products"                                                                                                                                                                                                                                  |
| Sideshift campaign-mgr:creator = 1:10 (max 15)                                                           | 05→sideshift 20260601 (l.81)          | **CONFIRMED**                              | verbatim: "One to 10 is the winning ratio. They can go up to 15"                                                                                                                                                                                                                                                             |
| Sideshift mature CPM sub-$1; >$100k/mo programs @ $0.80–0.90                                             | 05→20260601 (l.319,329)               | **CONFIRMED**                              | "sub 90 cent CPM"; ">$100,000 a month… sub 80 to 80 [~$0.80]"                                                                                                                                                                                                                                                                |
| StudyFetch 7M users/2.5yr, $11.5M Series A                                                               | 03→studyfetch 20260524 (l.1,54-55)    | **CONFIRMED**                              | digit-exact ("11.5 billion" garble self-corrected to million on l.55)                                                                                                                                                                                                                                                        |
| StudyFetch "hundreds of creators" = post-Series-A scale move                                             | 03→20260524 (l.71,242-243)            | **CONFIRMED**                              | "Prior to the series A we had a creator program… series A money went to scaling up the creator program"                                                                                                                                                                                                                      |
| StudyFetch "marketing generalist" as first non-founder growth hire                                       | 03→20260524 (l.305-311)               | **OVERSTATED (prescriptive→descriptive)**  | Raw is Kieran's _advice_ to a hypothetical team ("what's the first hire?" → "a skilled generalist"), **not a description of StudyFetch's own first hire** (Kieran himself joined to make TikToks on launch day; initial team was 7). Generalist-first thesis holds; the "StudyFetch did this" framing is looser than the raw |
| Zero-follower brand-account retainer ~$10k/mo, 20–30 videos                                              | 03→20260524 (l.84,121-122)            | **CONFIRMED**                              | "$10,000 a month… as a whole" for "20-30 videos a month"                                                                                                                                                                                                                                                                     |
| Jenny AI: 0→75M views/3mo, <$2 CPM, 150 creators (80 in mo.1)                                            | 04→jenni 20251123 (l.2,33,87)         | **CONFIRMED**                              | all digit-exact; "80 within the first month" (l.87). Person = Matt runs Jenny/Jenni's program — "Jenny/Matt" is correct                                                                                                                                                                                                      |
| Jenny "violent effort" 16-hr-day hiring push                                                             | 04→20251123 (l.34-35)                 | **CONFIRMED**                              | "A violent amount of effort… work 7 days a week… at least 16 hours" — verbatim; the noise-flag is well-grounded                                                                                                                                                                                                              |
| Quittr: $3k→$37k mo.1; $250k/30 days at mo.4-5; 15% download→paid                                        | thebrettway 20250210 (l.20,1,3,140)   | **CONFIRMED**                              | digit-exact                                                                                                                                                                                                                                                                                                                  |
| Quittr: Pakistani VA sourcing hire for creator logistics                                                 | 20250210 (l.253,341)                  | **CONFIRMED**                              | "virtual assistants out in Pakistan… runs through all the DMs… finding creators" — note the "dedicated creator manager PLUS a VA" reads as one hire (Omar the VA), so "plus" is mildly redundant                                                                                                                             |
| Nomad Table: 1M+ dl, ~$65k/mo, 60–70 creators                                                            | jay-nomad 20260223 (l.1,57)           | **CONFIRMED**                              | "60 to 70 creators" (l.57) ✓, $65k/mo ✓, 1M+ dl ✓                                                                                                                                                                                                                                                                            |
| Nomad Table: **7 months** solo before first creator hire                                                 | 20260223 (l.319,326,51)               | **CONFIRMED (derived)**                    | Not a stated figure — it's quit "I want to say September" (l.319) → "started first hiring creators I think in April" (l.326) = ~7 mo. Both anchors are hedged; ledger dropped the "~" and "after quitting". Qualitative claim (solo many months first) is rock-solid                                                         |
| Dan Kwan: "founder should be the biggest influencer"                                                     | dan-kwan 20251026 (l.113,87)          | **CONFIRMED**                              | verbatim: "the founder should be the biggest influencer of their app"                                                                                                                                                                                                                                                        |
| Dan Kwan: cult/momentum-wave frame                                                                       | 20251026 (l.98-100)                   | **CONFIRMED**                              | verbatim: "building the cult or finding the cult… riding like a momentum wave"                                                                                                                                                                                                                                               |
| Ryan Thorp: 30–35 apps, ~2,000 creators on books                                                         | app-portfolio 20260117 (l.46,236-237) | **CONFIRMED**                              | "another 30 35 apps" (l.46); "just over 2,000 creators on the books" (l.237) — the "on books" qualifier correctly distinguishes from the 250-creator core                                                                                                                                                                    |
| Ryan Thorp B2B: "couple hundred k" / 3–5yr / 6–12mo cycle / one contract = ¼ revenue; late-stage bolt-on | 20260117 (l.261-269)                  | **CONFIRMED**                              | all four figures verbatim; B2B is explicitly "the next phase of growth" post-scale, as ledger says                                                                                                                                                                                                                           |
| Speedran: sold ~$100–180k at 26–28 days, 4.5–5x ARR; valuation uncertain                                 | speedran 20260309 (l.1,4,286,291,311) | **CONFIRMED**                              | "$100k 180k valuation" (l.291); "5X, 4.5, 5X, I can't remember exactly" (l.286) — **the uncertainty flag is warranted and correctly applied**                                                                                                                                                                                |
| No-agency = **2-source** consensus (Zach + Joseph Choi)                                                  | this section, consensus #2            | **INTERNALLY OK / conflicts w/ blueprint** | See cross-doc note below — blueprint §4 says **3-source**; Bloom (my raw) is a live _dissenter_                                                                                                                                                                                                                              |
| Organic-share benchmark quality tag = "secondhand-informed (Sensor Tower)"                               | numbers table                         | **MISLABEL (minor)**                       | The 50/35-50/<20 organic bands are Josh's own buyer rule-of-thumb (first-party judgment); Sensor Tower is his download/revenue data source, not the source of these benchmarks                                                                                                                                               |

---

## Fresh-sweep findings (per assigned raw)

### 1. Blue Throne / Josh (20260708) — heavily cited, CLEAN

Faithfully mined; no distortions beyond the two minor items above ($345M, tag).
One bonus corroboration the blueprint should know it has: Josh's own price-test
recipe — "test it on 10, 15, 20% of the audience… start pushing up that number
and see where the numbers start to break. Try and find the ceiling" (l.225-226)
— is the **direct source seed for blueprint §2's week-3 $9.99/$59.99 ceiling
cohort on 10–20% of traffic**. Good lineage.

### 2. Ryan Thorp / app-portfolio (20260117) — cited, CLEAN

All cited numbers verified. Two notes:

- **January seasonal arbitrage** (spend ~75% of annual ad budget in January when
  CPI is ~50% cheaper, l.11-13, 122-124) is a real, quotable mechanic — but it's
  category-specific to health/fitness/New-Year's-resolution apps. **Marginal for
  Crave** (food discovery is year-round, not a resolution category). Correctly
  absent from the blueprint; noting so nobody "discovers" it later and mis-applies it.
- **Mild contradiction of blueprint §4's "DM outreach, not email"**: Ryan's
  actual outreach was "combination… DM or email" (l.229). Coconote (below) also
  used "DMs… and then eventually emails" (l.84). The absolutist "not email" isn't
  what the corpus's creator-ops operators actually do.

### 3. Dan Kwan (20251026) — cited, CLEAN + one missing corroboration

Both cited claims verbatim-confirmed. Two decision-relevant additions:

- **MISSING (corroborating) citation:** Dan's crisp rule — _"don't touch paid
  until you've cracked at least five winning formats"_ (l.171-172) — is a clean,
  quotable spine for the blueprint's paid-last sequencing (§6) and would
  strengthen the §4 organic-first gate. The ledger cites Dan for content framing
  but not this.
- **Mild over-transfer in the Crave-transfer paragraph:** it pairs "programmatic
  ranked-dish content" with "Dan Kwan's cult/momentum-wave frame." But Dan's
  whole method is _timing cultural moments_ (Solo Leveling finale, Duolingo-
  cancellation, Christian revival) and he explicitly builds **thin, momentum-wave
  apps he abandons in "a couple months"** (l.159). Crave is the evergreen,
  no-cold-start opposite (fact sheet). Invoking his momentum-wave frame for
  programmatic evergreen content is conceptually incongruent — Nick Weber's
  "content factory" framing (already cited) carries that load fine on its own.

### 4. Bloom / "Jay", fintech (20250707) — NOT cited in this section; 3 findings

(Confirms Jenny/Matt is _not_ this episode — Jenny is 20251123.)

- **Pro-agency dissent (decision-relevant).** Bloom — a genuine "$2M/yr, insane
  growth engine" first-party operator — **works with agencies** for AI content
  and micro-influencer sourcing (l.33, 40), alongside internal teams. The section
  presents agency-avoidance as near-consensus and the blueprint §10 discards
  "agencies of any kind." The evidence is more mixed than that absolute implies:
  the practical conclusion (a solo bootstrapper shouldn't hand growth to an
  agency) still holds, but the corpus is **not unanimous** — at least one scaled
  app uses agencies productively for specialized functions.
- **"90 days is the minimum to make any video viral"** (l.261-262). This bears
  directly on **blueprint §4's kill-signal** ("two consecutive 2-week cycles… =
  organic thesis fails" ≈ 4 weeks). See Coconote below — together these two raws
  say real traction is a _months_-long game, so a 4-week judgment window risks a
  premature "organic failed" call (see Bottom line).
- **Integrity reinforcement:** Bloom's engine leans on **planted-comment
  astroturfing** — a "comment team going in there commenting about our app…
  indirect CTA" so "people organically flow" in (l.36-39). This is precisely the
  class blueprint §4 prohibits ("planted fake-persona comments, disguised-
  discovery scripting"). A useful reminder that the corpus's best growth engines
  routinely use tactics Crave's integrity brand forbids — the growth-rate
  benchmarks come bundled with methods Crave can't copy.

### 5. Coconote / Brett + Zack, ex-Loom, AI note-taker → Quizlet (20260412) — NOT cited; 4 findings

- **STRONG second example for the "conversion, not vanity views" lesson**
  (corroborates blueprint §8 geo-discount + §10's Pingo "national virality is a
  trap"). Coconote's "PDF-to-brain-rot" feature did **100–200M views → ~3,000
  trial starts → only ~$25k revenue** (would've been $360k at 100% convert);
  their verdict: _"we'd rather have 10M views on a video that converts than a 40M
  view video… that drives low-intent traffic"_ (l.4-5, 29-51). The blueprint cites
  only Pingo for this; here's an independent, better-quantified first-party proof.
- **Traction takes months, not weeks** (kill-signal calibration): Coconote's
  breakout came _"about 8 9 months into the journey… it took us a little while to
  find that level of traction"_ (l.28). Paired with Bloom's 90-day minimum, this
  is the sweep's most actionable note for the blueprint (Bottom line).
- **Coach:creator ratio 1:12** (l.112) — a clean, uncited **second data point**
  for consensus #3's staffing ratio (Sideshift said 1:10 / max 15). It would
  upgrade "Sideshift's explicit ratio" to a genuinely two-source ratio.
- **Two items in tension with Crave's decided model (override still holds, but
  worth logging):** (a) Coconote's big monetization win was **letting users get an
  hour-plus into real product value _before_ the paywall** (l.173-176) — another
  "value-first" voice against gate-everything, beyond the Symmetry/Phoenix/Jungle
  set the blueprint names; Crave's override (value demonstrable in one screen, no
  daily-loop to protect) is still sound. (b) **Trial-extension win-back saves 27%
  of cancelers** (l.181) — Crave keeps win-back _dormant by design_; the corpus
  shows this specific tool is highly effective, so it's real money the current
  design parks (a deliberate choice, but the owner should know the magnitude).
- Minor integrity cautionary: Coconote films with **"creator-only screens" that
  aren't real product UI** (a giant rainbow recording wave, l.65-70) — a
  beautified-demo gray area Crave's "no fake demos" line should stay clear of.
- Bonus corroboration: Coconote independently restates blueprint §1's clock-risk
  — _"there are going to be a hundred copycat products next week"_ (l.229-230) —
  and the moat argument (if you lack a real moat you're stuck chasing "wow"). Crave
  has the data/cornered-resource moat Coconote calls rare, which _validates_ §1.

---

## Bottom line

**Does the section faithfully represent the raw data? Yes — strongly.** I checked
~30 load-bearing claims digit-by-digit against ground truth; all substantive
numbers are confirmed, and the one figure the source itself hedged (Speedran's
4.5–5x / $100–180k) is correctly flagged uncertain. The prior agent did an honest,
accurate job. The blueprint's metrics table (year-1 renewal 30/40, organic share
≥35%/<20%, the top-20%-engagement flatten-curve, the week-3 price-ceiling test)
all trace cleanly to Blue Throne's actual words, and the B2B-is-late call traces
cleanly to Ryan Thorp's actual words.

**Defects to fix in the ledger (all minor):**

1. Numbers table MFP row: drop or footnote the **$345M** (raw says only "over
   $100M less" than $475M) and fix the "**Cal AI**" mislabel (that deal is
   MyFitnessPal↔Under Armour, no Cal AI).
2. Soften "StudyFetch's marketing generalist as first hire" → it's Kieran's
   _recommendation_, not StudyFetch's documented first hire.
3. Nomad Table "7 months" → write "~7 months (Sept→April, both hedged)".
4. Re-tag the organic-share benchmark: it's Josh's first-party buyer rule of
   thumb, not a Sensor-Tower-derived figure.

**What the blueprint should weigh (none forces a reversal):**

- **Reconcile the agency source-count.** §4 says "3-source consensus"; this
  section says "2-source." The raw _can_ support a third skeptic (Ryan Thorp built
  in-house because agencies "couldn't crack it," 20260117 l.63) — **but Bloom
  (20250707) is a scaled app that uses agencies productively**, so the honest
  framing is "strong majority, one notable dissenter," not a flat "agencies of any
  kind = discarded." Pick one count and acknowledge the dissent.
- **Re-examine the §3/§4 ~4-week organic kill-signal.** Two of my raws say
  traction is a months-long game: Bloom "90 days minimum to make any video viral,"
  Coconote "8–9 months to find that level of traction." As a _floor_ (<300 views
  across 3 formats in 4 weeks = truly nothing), the signal is defensible; but the
  §9 sequencing that gates _creator trials_ on "content-market fit proved" by
  months 2–3 may be optimistic. Consider stating explicitly that the 60–90-day
  channel-zero window is a _minimum_, and that a sub-viral-but-improving signal in
  weeks 3–8 is expected, not a failure.
- **Log the win-back magnitude.** Coconote's trial-extension saved 27% of
  cancelers — a data-backed number to sit alongside Crave's deliberate "win-back
  stays dormant" choice.
- **Free wins available:** cite Dan Kwan's "don't touch paid until 5 winning
  formats" (paid-last, §6) and add Coconote as the second, better-quantified proof
  for the §8/§10 "conversion beats vanity views" law.
