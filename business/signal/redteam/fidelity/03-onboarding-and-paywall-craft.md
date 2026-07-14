# Fidelity Audit — 03. Onboarding & Paywall Craft

Auditor pass: red-team fidelity check of `ledger/03-onboarding-and-paywall-craft.md`
against the RAW folded transcripts (ground truth). Assigned fresh-read raws
(round-robin slot 2/11): arthurspalanzani--20260319 (ASO), superwall--20250803
(Massive), superwall--20251121 (Fitted), superwall--20260208 (Parra),
superwall--20260505 (Sway), thebrettway--20241128 (Cal AI). I also grepped the
non-assigned source raws to verify every load-bearing number the blueprint leans on.

**Headline: this section is exceptionally faithful.** ~56 load-bearing claims checked;
all confirmed against the raw, most digit-exact. Prior-agent uncertainty flags
(Sunflower's inconsistent revenue figures; Clear30's uncited 85%; Pingo "garbled")
are ACCURATE. The handful of issues below are minor precision/framing caveats and one
genuine fresh-sweep gap — none change a blueprint call.

---

## Fidelity table (claim | cited source | verdict | note)

### From my assigned raws (deep-read, ground truth)

| Claim                                                                                 | Source   | Verdict                | Note                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parra: avg paywall conversion ~8%                                                     | 20260208 | CONFIRMED              | L296-297 "from like 8%, which I see is the average across the board, to 15 to 20% after a couple iterations."                                                                                                                                                                       |
| Parra: 15-20% after iterations                                                        | 20260208 | CONFIRMED              | Same line; applies to $10-50k/mo apps.                                                                                                                                                                                                                                              |
| Parra: ~50% of trial starts cancel                                                    | 20260208 | CONFIRMED              | L73 "50% of the time on average they'll just cancel after subscribing."                                                                                                                                                                                                             |
| Parra: generic Continue / less-info beat descriptive +111% (comparison table loses)   | 20260208 | CONFIRMED              | L5 + L143-145 "the 111% conversion rate increase" (50%-off visual vs free→premium comparison chart). Ledger honestly labels it a "combined test."                                                                                                                                   |
| Parra: simplification test +10%                                                       | 20260208 | CONFIRMED              | L40 "Why was this 10% better?" (simplify footer + no-commitment line).                                                                                                                                                                                                              |
| Parra: one-time-offer discount band 25-33% (never deeper)                             | 20260208 | CONFIRMED              | L112-113 "you could go between 25 and 33... save your really big juicy sales for Black Friday." Parra himself calls this drawer/one-time-offer kit "gray hat" (L85) — corroborates the compliance framing.                                                                          |
| Parra: 422 profitable paywall experiments                                             | 20260208 | CONFIRMED              | L18, digit-exact.                                                                                                                                                                                                                                                                   |
| Parra: bullet-list single-page = cross-category benchmark                             | 20260208 | CONFIRMED              | L6, L181 ("single page bullet list paywall... one of the few that perform well across the board").                                                                                                                                                                                  |
| Parra: Blinkist trial timeline durable, no half-life                                  | 20260208 | CONFIRMED              | L219-221 "people have been using for years, still very high performing"; L218 "without any halflife."                                                                                                                                                                               |
| Parra: order by duration; highlight annual; no-commitment micro-bump                  | 20260208 | CONFIRMED              | L67-70, L48-49.                                                                                                                                                                                                                                                                     |
| Cal AI: $30/yr or $10/mo, most take yearly                                            | 20241128 | CONFIRMED              | L175 exact.                                                                                                                                                                                                                                                                         |
| Cal AI: 3-day free trial, premium-only (hard paywall)                                 | 20241128 | CONFIRMED              | L261-265.                                                                                                                                                                                                                                                                           |
| Cal AI: 50% margin, bootstrapped, ASC shown ($1.14M Oct)                              | 20241128 | CONFIRMED              | L179, L3. (Podcast title rounds to 1.12M; not carried into ledger.)                                                                                                                                                                                                                 |
| Cal AI/GrindClock: free→hard = more revenue on fewer downloads                        | 20241128 | CONFIRMED              | L269-273. **Precision:** the flip is GrindClock's; Cal AI was born hard-paywalled from that lesson. Ledger's "Cal AI/GrindClock" label is fair but the flip datum = GrindClock.                                                                                                     |
| Cal AI: purposeless "why are you doing this" questions A/B-raise conversion           | 20241128 | CONFIRMED              | L258-262, first-party, no numbers (as ledger states).                                                                                                                                                                                                                               |
| Cal AI: "once people are used to something being free, they're used to it being free" | 20241128 | CONFIRMED              | L273, near-verbatim; blueprint §0 quote grounded.                                                                                                                                                                                                                                   |
| Cal AI: Apple pays ~2 months late → reinvest the float                                | 20241128 | CONFIRMED              | L452-456. **Load-bearing for blueprint §0 point 1** — accurately captured.                                                                                                                                                                                                          |
| Sway: A/B'd photos-before vs after paywall; paywall-first won                         | 20260505 | CONFIRMED              | L136-138 "we explored both... [photos before] risk them leaving... [not asking them to do too much] just performed a lot better."                                                                                                                                                   |
| Sway: paywall-first won _because the aha required user effort_                        | 20260505 | CONFIRMED              | L136 "they would have to go to their other app and upload screenshots."                                                                                                                                                                                                             |
| Sway: "if you can show the aha cheaply pre-paywall, that's better"                    | 20260505 | CONFIRMED (paraphrase) | L138 "if there's a way to show the aha moment... it would have been better before the paywall." The word "cheaply" is interpolated (not spoken) but faithfully captures the effort-based reasoning. **This is the crux of blueprint §2's pre-wall-demo call — substance is sound.** |
| Sway: annual default = LTV posture                                                    | 20260505 | CONFIRMED              | L123-124 "defaulting to annual... collect more revenue up front to fuel growth; weekly = slower growth."                                                                                                                                                                            |
| Fitted: ripping hard paywall out (→ free)                                             | 20251121 | CONFIRMED              | L116-118, L155 "making it entirely free... not turning away users turned off by a paywall."                                                                                                                                                                                         |
| Fitted: admits no PMF                                                                 | 20251121 | CONFIRMED              | L68, L200 "haven't found product market fit yet... market pull but no PMF."                                                                                                                                                                                                         |
| Fitted: $0.25/download lifetime                                                       | 20251121 | CONFIRMED (derived)    | $150k subscriptions (L66) / 600k downloads (L4,65,87) = $0.25. Ledger's skeptical read (weak monetization, network-effect land-grab, not evidence against hard gates) is sound (L115-125, L153 "churn is high, app isn't sticky").                                                  |
| Massive: waitlist converted ~0.5%                                                     | 20250803 | CONFIRMED              | L41 "half a percentage of the waitlist converted to even signing up... no one paid." Feeds blueprint §10 discard.                                                                                                                                                                   |
| Massive: "charge from day one"                                                        | 20250803 | CONFIRMED (paraphrase) | L4,48-50 "waitlists are useless... get people to pay... test with influencers." **Context note:** Massive is VC-backed ($3M raised, L15) — not a bootstrapper. Doesn't undermine the waitlist claim, but worth knowing since the ledger leans on capital-position elsewhere.        |

### Non-assigned source raws (grepped + read to verify blueprint-load-bearing numbers)

| Claim                                                                                | Source   | Verdict                             | Note                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | -------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vahe: trial-start >15% good; 34% best-in-class (Claim app)                           | 20251116 | CONFIRMED                           | L31 ">15% is good"; L92 "34% trial start rate... more than double the benchmark."                                                                                                                                                                               |
| Vahe: 8-11% fixable to 15% "in 90% of cases"                                         | 20251116 | CONFIRMED                           | L33 de-garbled ("81%"→"8-11%"); ledger reconstruction defensible.                                                                                                                                                                                               |
| Vahe: trial→paid >30% good; 50-55% best                                              | 20251116 | CONFIRMED                           | L31 ">30% good"; L98 "50 55%" (Claim's rate).                                                                                                                                                                                                                   |
| Vahe: install→paid >10% good / 4-10% ok / <4% problem                                | 20251116 | CONFIRMED                           | L34-36 exact. **The key Crave calibration number and the blueprint §8 kill band — verbatim.**                                                                                                                                                                   |
| Vahe: multi-step paywall +20-40%                                                     | 20251116 | CONFIRMED                           | L86-88.                                                                                                                                                                                                                                                         |
| Vahe: ~10% skip trial and buy now (trial toggle)                                     | 20251116 | CONFIRMED                           | L194 "around 10% of users will choose to buy without a trial."                                                                                                                                                                                                  |
| Vahe: say "free" 5-7×; reminder "2 days before, cancel anytime"                      | 20251116 | CONFIRMED                           | L74 "five, seven times"; L128 "reminder two days before your trial ends."                                                                                                                                                                                       |
| Vahe: 1.1%→4% case study, 40-50k organic installs/mo                                 | 20251116 | CONFIRMED                           | L36 exact.                                                                                                                                                                                                                                                      |
| Vahe: abandonment discount annual-only (80%/90%)                                     | 20251116 | CONFIRMED                           | L190-196 "discount only an annual product... don't discount weekly/monthly." Predates the Apple pull (Nov 2025 < Apr 2026) — chronology accurate.                                                                                                               |
| Blue Throne: year-1 renewal 50 amazing / 40 good / 30 ok / 20 bad                    | 20260708 | CONFIRMED                           | L114 verbatim rule-of-thumb; he's a buyer/acquirer.                                                                                                                                                                                                             |
| Blue Throne: top-20%-engagement retention curve must flatten (day-90 oracle)         | 20260708 | CONFIRMED                           | L~104-110. **Blueprint §8's headline "one metric the corpus's only real buyer trusts" — accurately sourced.**                                                                                                                                                   |
| Cal AI: health/fitness annual renewal ~30%                                           | 20260302 | CONFIRMED                           | L103-104 "average for the industry is about 30%... retention, not churn." Ledger correctly reads as renewal. Feeds blueprint §0/§8 "model on ~30%."                                                                                                             |
| Glow: onboarding completion 74%→83%                                                  | 20260110 | CONFIRMED (minor)                   | L253 exact BUT it's a day-over-day dashboard bump from the whole "new onboarding," and completion "went down just a bit" the next day (L256). Ledger's "(progress bar + commitment screen)" tightening is slightly cleaner than a controlled A/B.               |
| Glow: download→trial ~14%; trial→paid ~31%                                           | 20260110 | CONFIRMED                           | L361 exact.                                                                                                                                                                                                                                                     |
| Glow: "fewer personal questions" variant = ZERO conversions                          | 20260110 | CONFIRMED                           | L274-275 "removing questions... drove no conversion." Load-bearing independent-lineage corroboration.                                                                                                                                                           |
| Glow/RevenueCat: >50 conversions per paywall before trusting a test                  | 20260110 | CONFIRMED                           | L324 "more than 50 conversion per paywall... that's what Revenue Cat recommends."                                                                                                                                                                               |
| Sunflower: reminder-priming +46% trial conversion, +~48% revenue, +70% annual        | 20260323 | CONFIRMED + FLAG ACCURATE           | L287 "+56% revenue" then L288 "48% increase in revenue" — founder states BOTH; ledger flags the 56%/48% inconsistency and takes the conservative +~48%. Correctly skeptical. +46% (L290), +70% annual (L289) exact.                                             |
| Coconote: onboarding 5→13 screens → +16% trial conversion                            | 20260412 | CONFIRMED                           | L167-169 exact.                                                                                                                                                                                                                                                 |
| Coconote: cancel-flow 7-day extension saves 27% of cancelers                         | 20260412 | CONFIRMED                           | L181-183; ledger notes the nuance (27% don't cancel in-moment, smaller fraction convert).                                                                                                                                                                       |
| Clear30: feature carousel → day-by-day program = 20%→30%                             | 20250828 | CONFIRMED                           | L199-209; founder rounds 18-19%→20% (ledger matches his rounding). Only the first screen changed.                                                                                                                                                               |
| Clear30: "85% decide to pay in first 5 minutes"                                      | 20250828 | CONFIRMED-as-stated + FLAG ACCURATE | L70 stated with no citation; ledger correctly marks "uncited/discard." Also L71 "we tore down Cali's onboarding" — corroborates echo-chamber lineage.                                                                                                           |
| Nicole: hard-gate-immediately beat let-them-browse by +50% conversion                | 20260511 | CONFIRMED                           | L254-255 "complete hard paywall after onboarding, they don't even go into the app... we see a 50% increase in conversion." Ledger cited the RIGHT +50% (there's a _second_ 50% at L144 = the 50%-off decline-cascade paywall; no conflation). n=1 tag accurate. |
| Quittr: 12-page quiz, deliberately long to "filter out people who aren't serious"    | 20250210 | CONFIRMED                           | L38, L181.                                                                                                                                                                                                                                                      |
| Quittr: ~15% download→paid; 98-99% per-step completion                               | 20250210 | CONFIRMED                           | L140 "15%... 85% don't convert"; L45 "99 99 98%."                                                                                                                                                                                                               |
| Stronger: accidental hard-paywall bug → ~+25% overnight, made permanent              | 20250815 | CONFIRMED                           | L7 "biggest boost probably like 25%"; L148-151 accidental toggle on NYE, then adopted.                                                                                                                                                                          |
| Cardstock: hard paywall → ~$30k/mo; users bought "sight unseen at the first paywall" | 20251128 | CONFIRMED                           | L187 "buy it right then sight unseen"; L217 "hard paywall... making like 30k a month." ("biggest jump ever" framing consistent with narrative, not pinned to one line — non-load-bearing.)                                                                      |

---

## Fresh-sweep findings (per assigned raw)

**superwall--20260208 (Parra) — clean, plus a corroboration.** Every number checks
out (above). Parra himself labels the decline-drawer/one-time-offer machinery "gray
hat" (L85) and won't run big discounts because they "cheapen the brand" (L117) — the
ledger could _strengthen_ the compliance argument by citing the tactic's own designer
calling it gray hat, but this is an addition, not a correction. Parra's core thesis
("design & packaging is the biggest lever, not pricing; price-testing is a pain, do it
late") directly supports blueprint §2/§8 discipline.

**thebrettway--20241128 (Cal AI) — clean, two precision notes.**
(1) The "dozens of quiz screens" characterization of Cal AI in the ledger's Conflicts
section is _not_ supported by this transcript — Zach describes Cal AI onboarding as
short ("really easy... a few general questions," L253). Only the _purposeless-
commitment-questions A/B_ (L258-262) is supported. The "long quiz" evidence properly
belongs to Quittr/Coconote/Clear30, not Cal AI. Minor, non-load-bearing (the blueprint
doesn't claim Cal AI has a long quiz).
(2) Cal AI's ad spend here is **$7,000/day** (L372), not the "$40k/day machine" the
blueprint §6 attributes to Cal AI — the $40k figure must come from the later
thebrettway--20260302. Flag for whoever owns ledger 08 to confirm §6's $40k is sourced
to the right transcript. Not my section.

**superwall--20260505 (Sway) — clean, one genuine gap.** The load-bearing "show-
product-before-wall" reconciliation is faithfully captured. **Decision-relevant gap
absent from ledger 03 AND the blueprint:** Daniel (Sway/Cal AI head of product)
explicitly warns that going _straight into quiz questions_ without first explaining
what the app does hurt Sway — users emailed "what does this app even do? what am I
subscribing for?" (L149-153). His fix: front-load and interleave value/explanation
_before and between_ the questions ("otherwise you're asking someone questions and they
have no context why"). Crave's onboarding (per fact sheet) opens with one hero screen
then goes straight into attribution/frequency/budget questions — Sway's lesson argues
for weaving app-explanation/value through the early quiz, not just one hero card. This
is squarely "paywall-screen craft" (which the section says is the remaining work) and
belongs in the Crave-transfer or the §2 onboarding notes. Worth surfacing to the owner.

**superwall--20251121 (Fitted) — clean.** Confirms the cautionary read. Side note:
Fitted is the _give-the-viral-creator-equity/co-founder_ model (Max, crawl-walk-run),
which blueprint §10 deliberately discards ("equity for the first creator deal"). Fitted
having no PMF supports that discard rationale. (Content-section territory, not mine.)

**superwall--20250803 (Massive) — clean, one context note.** ~0.5% waitlist + charge-
from-day-one confirmed. Massive is VC-backed ($3M, L15) — flag for calibration since
the ledger's hard-vs-soft framing leans on capital-position; here a _hard-paywall_
advocate is also VC-cushioned (though his advice is the conservative one). Also a nice
uncited corroboration of the echo-chamber thesis: Zach (Cal AI) and Dan (Massive) both
admit they "just ripped" their onboardings from somewhere (L92-95). Most of this raw is
content-marketing (audience-targeting hooks, gray-hat UGC by PrepAI, career-Dave
format) = ledger 05/06 territory; nothing contradicts my section.

**arthurspalanzani--20260319 (ASO playbook) — clean, not cited by ledger 03.** Pure
ledger-09/blueprint-§7 territory. This is the archetypal _locale-arbitrage_ playbook
(chase Brazil for lower keyword difficulty; the "US matrix trick" of 9 foreign locales
with English keywords; add Spanish/Portuguese/Korean) — exactly the "country/locale ASO
arbitrage" the blueprint §7/§10 discards as noise for an Austin-only English metro
product. **The discard is sound** — none of Arthur's leverage transfers to Crave. The
raw _corroborates_ blueprint §7 mechanics (title > subtitle > keyword-field, no
duplicate keywords, difficulty <50 to rank organically, ASA $100 free credit, 3-day
launch boost). No misquote, no contradiction relevant to my section.

---

## Bottom line

**Yes — section 03 faithfully represents the raw data.** This is the best-evidenced
topic in the corpus and the ledger handled it with unusual discipline: numbers are
accurate digit-by-digit, echo-risk is honestly disclosed, secondhand/vendor/uncited
figures carry correct quality tags, and the two internal-inconsistency flags
(Sunflower 56%/48%, Clear30 uncited 85%) are real and correctly surfaced. Every
blueprint call that leans on this section — §0 (five free→paid flips + reinvest-the-
float + "once free, used to free"), §2 (compliant paywall spec + the pre-wall-demo
reconciliation via Sway), §8 (the install→paid <4%/4-10%/>10% and trial-start-15% /
trial→paid-30% kill bands, the ~30% renewal floor, the top-20%-engagement day-90
oracle), §10 (~0.5% waitlist) — is grounded in a passage I located and verified.

**The blueprint requires no numeric change.** Recommended non-blocking edits:

1. **Add Sway's "explain the app before/between the quiz questions" refinement** to the
   §2 onboarding craft or ledger-03 Crave-transfer — a real, decision-relevant gap for
   Crave's 17-step quiz (currently hero → straight into questions).
2. **Soften the "Cal AI = dozens of quiz screens" characterization** (Conflicts) — the
   Cal AI raw describes a _short_ onboarding; only the commitment-question A/B is
   Cal AI's. Attribute the long-quiz evidence to Quittr/Coconote/Clear30.
3. **Note Glow's 74→83 is a day-over-day dashboard bump** (slipped back next day), not
   a clean isolated A/B — the "first-party dashboards" tag already softens it; just
   don't over-read the causal cleanliness.
4. Cross-check (ledger 08, not this section): blueprint §6's "Cal AI's $40k/day machine"
   — this transcript shows $7k/day; the $40k should trace to thebrettway--20260302.
