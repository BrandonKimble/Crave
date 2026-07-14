# Red-team verdict

> Judge consolidation, 2026-07-12. Inputs: 11 fidelity audits (`redteam/fidelity/01–11`,
> each = digit-by-digit raw-transcript verification of one ledger section + a fresh
> round-robin sweep of ~6 raws), 4 blueprint lens reports (`redteam/blueprint/`:
> evidence-support, hostile-expert, compliance, completeness), and `blueprint.md` itself.
> Findings below are deduped across all 15 reports, cross-checked between auditors, and
> false alarms killed. Fixed constraints (hard paywall gate-everything, $7.99/$39.99,
> solo bootstrap, no-pay-to-rank) were not relitigated by any reviewer.

---

## Fidelity scorecard

Per ledger section: claims checked / confirmed / worst surviving severity.

| §   | Section                            | Checked | Confirmed          | Worst severity                                                                                                                                                                |
| --- | ---------------------------------- | ------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Positioning & category             | ~39     | 37                 | MINOR — Jay/Nomad geo-rationale overstated; ($6.5M "NOT-FOUND" was a false alarm, see below)                                                                                  |
| 02  | Business model & price             | ~25     | 24                 | **MAJOR — "Apple pulled Cal AI April 2026" fabricated at ledger stage** (cited transcript predates the alleged event and contains nothing)                                    |
| 03  | Onboarding & paywall craft         | ~56     | 56                 | CLEAN — best-evidenced section in the corpus, digit-exact throughout                                                                                                          |
| 04  | Launch shape                       | ~28     | 24                 | MODERATE — 2 distortions (Payout "Food & Drink" prose vs raw's Finance; fake-scarcity anecdote misattributed to PrayScreen), 2 overstatements (press "consensus"; Pingo 400M) |
| 05  | Founder-led content                | 16      | 13                 | MODERATE — Cardstock/Noise "27M views" is 10× too high (~2.7M), an explicitly-hedged garble de-hedged downstream                                                              |
| 06  | Creator/UGC machine                | ~40     | 38                 | MINOR — "$3 CPM ceiling" not in cited raw; "Matt made all Jenni content" misattributed                                                                                        |
| 07  | Product-led loops & sharing        | ~44     | 41                 | MINOR — one nonexistent-filename citation (content itself confirmed elsewhere); Quittr pinned-comment conflation                                                              |
| 08  | Paid amplification                 | ~34     | 34                 | CLEAN — every figure digit-exact; only a framing overclaim ("Spark = the only mechanism")                                                                                     |
| 09  | ASO & App Store                    | ~34     | 27 clean + 6 minor | **MAJOR — Casper/Payout "Food & Drink far less contested than Finance" is a fabricated quotation** (absent from the cited raw and the entire corpus)                          |
| 10  | Retention, metrics, revenue engine | ~24     | 20                 | MODERATE — Parra's weekly-pricing view INVERTED (he says weekly is _rising_ for social apps); kill-board spine itself digit-exact                                             |
| 11  | Scaling & sequencing               | ~30     | 27                 | MINOR — $345M is external knowledge inserted as transcript fact; "MFP: Cal AI" mislabel; two prescriptive→descriptive softenings                                              |

**False alarms killed by cross-check:**

- **Sunflower "$6.5M VC" (auditor 01: NOT-FOUND) — OVERTURNED.** Auditor 02 located it
  verbatim in the same transcript (superwall--20260323: "$6 and 1/2 million… couldn't
  have built it without the VC"). Caption-garble search miss. The figure stands.
- **Fitted "$0.25/download" (auditors 01 & 07: distorted/unsupported) — PARTIALLY
  REHABILITATED.** Auditor 03 found the derivation: $150k subscription revenue ÷ 600k
  downloads = $0.25 revenue-per-download. The "1–15¢" passages the other two matched are
  acquisition _cost_ — a different quantity. Keep the figure, relabel it "derived."

**Overall answer — did the mid-tier model faithfully represent the raw data? Yes,
emphatically, with two localized fabrications.** Across ~370 verified claims, every
load-bearing number the blueprint actually spends — the §0 model evidence, the full §2
paywall spec, the §8 kill-board bands (Vahe's 4/10/15/30, Blue Throne's 50/40/30/20 and
organic bands, the top-20%-cohort oracle), the §4 deal grids and conversion ladder, the
§6 Spark thresholds, the §3 geography consensus — reconciles digit-for-digit with the
raws, and the quality hedges (secondhand/vendor-claimed/self-inconsistent) were applied
honestly. The two fabrications (#1, #2 below) are both in the _evidence trail_, not in
any decision-driving band, and both blueprint calls survive on other grounds. The
remaining defects are citation blemishes and one inverted paraphrase. The synthesis
failure mode the audit was commissioned to catch — a hedge stripped and a confident
figure minted (27M views), a causal event invented at ledger stage (Cal-AI pull) — did
occur, exactly twice at severity, out of hundreds of opportunities.

---

## Confirmed issues, ranked

**1. Fabricated "Apple pulled Cal AI (April 2026)" — HIGH (fidelity).**
Touches: §2 "the documented Cal-AI-pull class," §10 "the Apple-pull class."
The cited transcript (thebrettway--20260302) is a pre-sale victory lap containing zero
pull/ban/guideline content, and a March-2026 interview cannot report an April-2026
event; the claim is also absent from the intermediate testimony file — injected at
ledger synthesis. The _decision_ (refuse the whole dark-pattern family) survives
untouched: the tactics are genuinely documented (Vahe demonstrates all of them,
superwall--20251116) and Apple 3.1.2 exposure is independently sourced.
**Amendment: re-source the framing; if the pull is a real external fact, cite an
external source (A1).**

**2. Fabricated Casper/Payout "Food & Drink far less contested than Finance" — HIGH
(fidelity).** Touches: §7 category choice. A quotation of something never said,
anywhere in the corpus, presented as an "explicit aside" and tagged first-party in the
ledger 09 numbers table. §7's Food & Drink lean survives on its own hedge (defers to
the keyword pull) but currently rests on a phantom prop and must be relabeled as
Crave-side reasoning with zero corpus evidence. **(A2)**

**3. No FTC sponsorship disclosure on paid creator content — HIGH (compliance + brand).**
Touches: §4 integrity line, §6 Spark. The integrity line bans undisclosed _commenters_
and _AI personas_ but never requires in-video #ad disclosure on the paid videos
themselves — a textbook material connection (16 CFR 255), inherited from a corpus that
normalizes the violation (Cal AI's "no 'sponsored by'" law). One undisclosed paid
"#1 birria" video is simultaneously FTC exposure and the cheapest possible kill-shot on
the no-pay-to-rank moat. Spark also legally requires the branded-content toggle +
per-video authorization codes, which the contract grid omits. **(A3, A4)**

**4. §7 rating ask is unsatisfiable as written and keeps the pre-value harvest tactic —
HIGH (compliance).** "After a value moment, never gated" — but under gate-everything no
pre-wall value moment exists except the teaser, and the as-built flow asks _before_
city pick. That's the Cal AI/Clear30 ratings-harvest lineage, in the same Apple
enforcement family §2's own logic refuses absolutely. **(A5)**

**5. The listicle factory lost its P3 gate — MEDIUM-HIGH (synthesis drift).**
Touches: §4 format 3, §9 months 1–2. P3 ruled: spec-only during channel zero; ship only
after a top-rung format validates, measured against the ~0.1% floor. The blueprint runs
it ungated in months 1–2 — the canon contradicting its own panel, spending scarce
founder engineering hours on the corpus's worst-converting format. **(A6)**

**6. "~5k views = signal" is an invented threshold and the real gates vanished —
MEDIUM-HIGH (synthesis drift).** Touches: §4 validation bar. The adopted protocol is
~15k views flags a candidate; 1–5k = keep format, vary copy; and the non-view gates
(≥70% 3-sec watch-through, "what app is that" comment density — the corpus's top
conversion signal, since installs won't attribute) are absent. The only success bar in
the canon is 3× looser than its own evidence. **(A7)**

**7. The §2 ceiling test kept only the migrate-up half, and its decision rule is
statistically unreadable — MEDIUM-HIGH.** P1's symmetric kill (variant <4% while
control ≥4%, ~200 paywall views/arm), the slow-volume fallback, and the
RevenueCat pre-config were all dropped; and "within ~1 point at ~100 purchases/arm" is
~50% power at a ~7% base rate — the exact "statistical theater" §2 convicts pre-launch
tests of. The cohort is still worth running: the kill criterion is a large effect and
IS readable small-sample. **(A8)**

**8. All ratios, no volumes — no absolute demand/revenue model anywhere — MEDIUM-HIGH
(completeness).** Touches: §8, §9. Every gate is a rate; run the blueprint's own
numbers (geo-discount × ladder × mid-band install→paid) and a breakout video ≈ 3–7
payers, an optimistic month-6 total ≈ $25–45k gross booked against $6–24k spend plus
six months of build time. Nothing says what month-6 success IS in payers/dollars, so
"green on every gate" can't be told apart from a hobby with good dashboards. The corpus
structurally can't supply this number (all national TAMs); it was Crave's to compute
and wasn't. **(A10)**

**9. Rich-open slugs silently create the indexable/AI-scrapable page network §11.8
deliberately parked — MEDIUM-HIGH.** Public slug pages are crawlable by default; the
moment they ship, Crave accretes fully-rendered scored "best X in Austin" pages — the
parked freemium-drift decision made by omission, in the riskiest direction (AI answer
engines return the answer with no store tap). The P4 navigational boundary controls
humans, not crawlers. **(A11)**

**10. Founder-hours contradiction at the binding constraint — MEDIUM-HIGH.** Touches:
§9. P5's tripwire says cut creator/Spark hours first (but months 0–2 have none);
ledger 05 says channel zero wins ties with launch blockers. Both imported, unresolved —
the conflict will be resolved ad hoc under stress in week 3. And the corpus content
protocol was executed by full-time operators; it's budgeted here at 10–12 h/wk with no
$1k-envelope relief valve. **(A12)**

**11. The central call has no evaluation trigger, and its one architectural consequence
is unstated — MEDIUM.** Touches: §0, §8. Gate-everything makes the polls/social
flywheel dormant at launch (payers-only poll base in one metro ≈ zero) — the one place
the dismissed soft-paywall camp's argument lands on Crave's actual architecture, and
the blueprint absorbs it silently. Every subordinate call carries reversal triggers;
the model itself has none (ledger 10 proposed one; it was dropped). This asks for a
trigger, not a change — the wall is a fixed constraint. **(A13)**

**12. Competitive model covers only indie ASO copycats; incumbent absorption has no
trigger — MEDIUM.** Touches: §1, §3. Google surfacing dish answers in AI results and
Beli adding a dish layer trip nothing as written; and the demo-wow rung quietly assumes
a novelty perception ("nobody shows dish rankings") that Google is actively eroding.
**(A14)**

**13. Retention is measured but never caused — MEDIUM (completeness).** Touches: §0,
§8, §9. Renewal IS the business under annual-first, the day-90 oracle is crowned, and
there is not a single retention mechanic in the document — no notification strategy
(the onboarding already collects a preference that feeds nothing), no re-engagement
surface. A genuine corpus blind spot (guests monetize first sessions, not year two)
inherited whole. Crave has unusually cheap levers (ranking-change push, weekly city
digest, poll lifecycle). **(A15)**

**14. Community seeding demoted to a failure-fallback; for Crave it's a launch-moment
channel AND a provenance obligation — MEDIUM.** Touches: §4. r/austinfood appears only
in the failure branch, yet the ledger's own recommended shape had an authentic launch
post there; it's the highest-affinity zero-dollar channel (pre-filtered to the metro,
immune to geo-dilution) — and **the Score is built from r/austinfood posts and surfaces
their quotes.** The community discovers this within days regardless; owning the
introduction is the only defensible provenance posture. No pipeline document addresses
data-provenance reception at all. **(A16)**

**15. Controversy formats target named local businesses with no subjects-of-rankings
policy — MEDIUM.** Touches: §4. The integrity line regulates methods, not targets;
"most overrated" formats punch at the Phase-2 B2B customer base in a small networked
scene, and paid creators aren't contractually bound to claim only what the live Score
says (nor barred from restaurant comps — a second undisclosed material connection).
**(A17)**

**16. Parra's weekly-pricing stance inverted in ledger 10 — MEDIUM fidelity, zero
decision impact.** Ledger built an anti-weekly "consensus" by reversing him (he says
weekly/monthly are _rising_ for social apps; annual is what declines there; weekly is a
legitimate cash-flow/price-test lever, and Josh agrees it's fine for cash-flow
businesses). Crave's rejection of weekly still lands — but on category fit, not on a
corpus that supposedly disowns weekly. **(A23)**

**17. Evidence-grade inflation in transfer — MEDIUM.** Touches: §4, §8. Flame's
single-operator, phone-farm-derived ladder became "the measured conversion ladder"
(ordering transfers; absolute volume doesn't; the ~300-view tripwire is a repurposed
shadowban diagnostic); Vahe's unaudited national-traffic aggregates became hard kill
lines for a $40/yr local product on organic social traffic; and two fresh-sweep raws
(Bloom "90 days minimum," Coconote "8–9 months to traction") say the 4-week organic
kill clock risks a premature "organic failed" call. Bands should be priors, not
calibrated verdicts. **(A9, A18)**

**18. §0's rationale contains motivated arithmetic and an overclaim — MEDIUM.**
"~3–6 payments (~$25–45 LTV)" appears nowhere in the pipeline (the one on-file
benchmark implies ~7 payments/~$56 — the invented figure flatters the annual case),
and the 2–2.5× renewal multiple is inconsistent with the same sentence's model-on-30%
instruction (≈1.7×). "Every bootstrapped operator in the corpus who scaled ran exactly
this shape" is false as stated (NGL/RizzGPT weekly, Quittr monthly-heavy, Pingo $99.99)
and the four-app shape-consensus is flagged HIGH echo risk. Also loose grouping in the
"five flips": Stronger is free-tier-with-gated-pro, Cardstock's flip was
paid-upfront→trial-subscription, Nicole's evidence is wall-hardness not a free→paid
transition. Direction survives everywhere; the honesty of the flagship section is what's
at stake. **(A22)**

**19. Absolutes stronger than their evidence — LOW-MEDIUM (several, deduped).**
"No agencies, ever (3-source)": ledger 11 counts 2 sources, Kyle is pro-agency-after-
learning, and Bloom is a scaled first-party operator using agencies productively — the
honest rule is "no agencies in the founder-learning/bootstrap phase; strong majority,
one dissenter." "DM outreach, not email": Connor ($1M/yr) says email beats DM for large
creators; StudyFetch/Ryan Thorp/Coconote use every channel — make it size-dependent.
§6 "Spark is the only mechanism [for one-city waste]": Symmetry ($200k/mo, ~1B views)
solved geo-concentration organically; restate Spark as the only _paid_ lever at metro
granularity where language can't filter. §1 "an algorithm that won't hold a city":
Jay/Nomad's actual reason is a traveler audience, and §6's own verified DMA-targeting
contradicts the absolute — add "organically." Clone clock "2–3 months": the corpus
spans 2–3 (PrayScreen) to ~12 months (Stronger); plan on the fast end, say the range.
**(A19, A20, A24, A26)**

**20. Dropped panel nuances + minor rule erosion — LOW.** §8's <4% halt rule lost its
"(min ~200 installs)" qualifier; §3 hardened away P2's clone-pressure reversal (lighter
per-city validation under competitive pressure); §2's teaser-removal trigger lost "or
trial→paid"; §9's editor/VA pull-forward is $4k-envelope-only in P5 but stated
unconditionally; §10's invite-unlock discard cites the evidence that points the _other_
way (ledger 07: Nicole/Wink more probative) instead of P4's mechanism argument; §10's
Pingo figure should read ~350–400M (founder's own hedge). **(A9, A23, A25, A27)**

**21. Cheap completeness adds — LOW.** Pre-order operationalization (§10 implies it,
§9 never creates it — Runafy's 3,000 day-one auto-installs are first-party verified);
iOS-only never stated while slugs/content face a half-Android metro; web-checkout
margin lever (~12 pts) vanished between fact sheet and blueprint; App Store featuring
nomination (free, corpus never competed there); Austin event seasonality (SXSW/ACL/F1)
can bend every §2/§3/§8 timing gate; clock anchors undefined (posting-start vs
wall-live); App Review completeness notes for a hard-gated app; trial-event
pixel-attribution trap (2 independent raws); win-back magnitude (27% of cancelers
saved) logged beside the deliberate dormant choice; Pingo's profitable decline-cascade
logged as the priced-in cost of the compliance refusal. **(A28–A32)**

**22. Ledger evidence-trail hygiene (no blueprint text change) — LOW.** 27M→~2.7M
views; Payout prose Finance-not-Food&Drink; fake-scarcity anecdote → superwall--20251009
not PrayScreen; `superwall--20260623` → `arthurspalanzani--20260623`; drop/re-attribute
the "$3 CPM ceiling"; fix "Matt made all Jenni content"; strike Pepai from the
hard-paywall-jump list; Sunflower range 30–70%; Halo 16.5% = per-paywall not combined;
$345M external-knowledge footnote + "MFP: Cal AI" mislabel; Fitted $0.25/dl relabeled
"derived ($150k/600k)". **(A33)**

---

## Blueprint calls that CHANGE

Conservative read: **no strategic call flips.** The model, the price, Austin-only, the
content ladder, the slug policy, and the discard list all survive. Six pieces of
operative text change (rules and specs, not directions):

1. **§4 content-validation bar** — "~5k views = signal" is replaced by the panel's own
   protocol (~15k views + ≥70% watch-through + "what app is that" comment density;
   1–5k = iterate copy). The current bar is invented and 3× looser than the evidence.
2. **§2 ceiling-cohort decision rule** — "within ~1 point at ~100 purchases/arm →
   migrate" is replaced by the honest small-sample rule (collapse/no-collapse read +
   P1's symmetric kill criterion + slow-volume fallback + RevenueCat pre-config).
3. **§4/§9 listicle-factory sequencing** — from "run in months 1–2" back to P3's
   ruling: spec-only during channel zero, ship only after a top format validates.
4. **§7 rating-ask placement** — from "in onboarding after a value moment" (unsatisfiable
   under gate-everything; currently pre-value as built) to first post-purchase value
   moment, SKStoreReviewController only.
5. **§4 integrity line** — gains a mandatory requirement: in-video sponsorship
   disclosure + branded-content toggle + Spark auth codes as contract terms on all paid
   creator content. (Addition to a non-negotiable list = spec change.)
6. **§5 slug spec** — gains a mandatory launch decision: default `noindex` +
   restrictive robots/AI-crawler policy, with "flip to indexed" reserved for the parked
   §11.8 SEO call. (The rich-open human loop is untouched.)

Everything else in the amendment list is wording, caveats, added parked items, or
ledger hygiene.

---

## Tested and held

The blueprint was genuinely pressured; these survived attack from multiple lenses:

- **§0 hard-paywall gate-everything + annual-first capital velocity** — the five-flip
  evidence, the Quittr reinvest-the-float quotes, "Apple pays ~2 months late," and the
  loop-protecting characterization of every anti-paywall voice all verified in raw;
  the hostile expert's strongest run at it produced a trigger request, not a crack.
- **§1 dish-not-restaurant positioning + narrow-until-you-win + clone clock** — Blue
  Throne and PrayScreen verified digit-exact; "dozens of copycats" honestly softens the
  raw's ~70.
- **§2 price hold, no pre-launch test, monthly pay-now/no-trial, and the full paywall
  spec** — every element (Try-it-free, $39.99 prominence, Blinkist timeline, duration
  ordering, no-commitment line) traces verbatim to ledger 03/P1; the ceiling-test _idea_
  traces to Josh's own 10–20% recipe; the pre-wall teaser stands as a knowing defiance
  (now with Nicole's +50% named as the number it bets against).
- **§2/§10 compliance refusal of the dark-pattern family** — correct and complete even
  after the Cal-AI-pull re-sourcing; the tactics are documented (Vahe) and the
  no-free-tier-to-retreat-to asymmetry is sound.
- **§3 Austin-only + earned dark bench + engineered expansion trigger** — the
  hostile expert's verdict: "best-reasoned call in the document"; consensus #4
  (win-one-geography) is the single best-supported claim in the corpus, 4 independent
  sources verified; Jay/Nomad even endorses geo-sequential expansion first-party.
- **§3 wall-flip integrity gates** (full load, owner-feel, top-20 query classes ≥10
  receipted dishes) — P2 carried faithfully.
- **§4 founder-before-creators (channel zero)** — the strongest consensus in the whole
  corpus; auditors found two _additional_ uncited first-party sources (Stronger,
  Nicole) rather than any counter.
- **§4 creator economics** — the $20–50/video + non-stacking $60/$200/$500/$800 grid,
  $300–500 trials, gated $500–1,500 anchor, no-equity, never-cap-a-winner: all
  digit-exact against Halo/Sideshift/StudyFetch/Pingo raws.
- **§4 integrity moat (methods side)** — independently corroborated from both
  directions: operators of the prohibited tactics call them saturating/short-lived, and
  transparent framing measurably out-converts covert.
- **§5 rich-open terminal slugs** — the structural argument (artifact loop, terminal
  boundary as the anti-freemium mechanism, launch-blocking instrumentation) survived a
  hostile read on its affirmative logic; watermark mechanic corroborated by two
  additional raws (Darcy, Lobby). Only the crawler omission needed fixing.
- **§6 paid-as-instruments** — ASA-as-hygiene-validation and the Spark grid (≥8% ER →
  $20 DMA → $50–100/day while >5%) verified verbatim against the Drew raw; the
  verified DMA-targeting fact holds.
- **§8 kill board** — every band digit-exact against Vahe and Blue Throne; the
  top-20%-engagement day-90 oracle is verbatim from the corpus's only real buyer.
  (Bands get a "provisional/priors" label, not new numbers.)
- **§9 depth-not-phases calendar + hour caps + operator-at-8–10-creators** — P5,
  faithful (minus the tie-break and envelope conditioning above).
- **§10 discard list** — every item traces; the genuinely ToS-fatal corpus tactics are
  all discarded. Only the invite-unlock _citation_ (not the discard) changes.
- **"Austin TikTok audience too small" attack** — failed: ~2.5M metro, food is the most
  content-native vertical, a real dozens-deep local creator scene exists.
- **Localization/locale-arbitrage discard, waitlist discard (~0.5% verified),
  press-for-installs discard (SEO backlinks only, first-party verified)** — all held.

---

## Amendment list

Fidelity corrections (evidence trail):

1. **§2+§10:** Replace "the documented Cal-AI-pull class" / "the Apple-pull class" with:
   "the standard aggressive-monetization toolkit demonstrated across the corpus (Vahe,
   superwall--20251116) sitting squarely in Apple's 3.1.2 enforcement zone; a
   gate-everything app has no free tier to retreat to if pulled." If the April-2026
   Cal-AI pull is a real external fact, cite an external source — the cited transcript
   contains no such event and predates it.
2. **§7:** Strike the Casper/Payout "Food & Drink far less contested than Finance" prop
   everywhere (fabricated quotation); label the Food & Drink lean as Crave-side
   reasoning with zero corpus evidence, to be resolved by the keyword pull.

Compliance (blueprint text):

3. **§4 integrity line, required side:** every paid creator post carries in-video
   sponsorship disclosure (#ad / "paid partnership with Crave") + the platform
   branded-content toggle, as a non-negotiable contract term; Crave-side reposts and
   Sparks of that content carry it too; the Crave-ATX bio states official-account
   status; founder content carries "founder of Crave" in bio/handle.
4. **§4 deal grid:** add "branded-content toggle ON + renewable Spark authorization
   codes delivered per video as a payment condition" (and Meta partnership-ad
   permissions for the fallback).
5. **§7 rating ask:** SKStoreReviewController only, never custom UI; move the ask to
   the first post-purchase value moment (first successful ranked-dish search); if kept
   in-onboarding, earliest defensible slot is after the §2 teaser and it must be
   recorded as a consciously-held risk; flip the as-built rating-ask→city-pick order
   regardless.

Synthesis-drift restorations (blueprint text):

6. **§4+§9:** restore the P3 listicle gate — spec (don't ship) the factory during
   channel zero; ship only after a demo-wow or controversy format validates
   distribution, measured against the ~0.1% generic floor.
7. **§4:** replace "~5k views on a post = signal" with the P3 protocol: ~15k views +
   ≥70% 3-sec watch-through + "what app is that" comment density flags a candidate;
   1–5k = keep format, vary copy. (If a deliberately easier one-metro bar is intended,
   label it engineered and justify via the geo-discount.)
8. **§2 ceiling cohort:** add the symmetric kill (variant install→paid <4% while
   control ≥4%, read within ~200 paywall views/arm), the slow-volume fallback (100/arm
   > ~2 quarters → read the noisier sample), and RevenueCat pre-config of both
   > offerings pre-launch; restate the migrate rule honestly — at ~100 purchases/arm the
   > test reads collapse-vs-no-collapse, not "within ~1 point."
9. **§8:** restore "(min ~200 installs)" on the <4% halt row; mark all corpus bands
   "provisional priors until ~200 Austin installs recalibrate them"; add listing rating
   - refund-request rate to the board with a band.

Structural gaps (blueprint text):

10. **§8.5 (new):** absolute demand model — month-0 desk study of 10–20 real Austin
    food/lifestyle accounts (view distributions, follower geography); three-scenario
    payers/dollars projection through month 6 at both envelopes; an explicit month-6
    success line in subscribers and dollars, plus a below-viability line that triggers
    the P2 expansion read early.
11. **§5:** default `noindex` + restrictive robots/AI-crawler policy on all slug pages
    at launch, named as a launch decision; "flip to indexed" reserved for the parked
    §11.8 SEO-network call; add slug-indexation/AI-answer-citation to §8
    instrumentation; visibly date-stamp every rendered artifact.
12. **§9:** pre-register the month-0 tie-break (recommend: launch blockers beat founder
    content until `enforce` is live — content that can't convert loses ties); restate
    the months-0–3 cadence as what 10–12 h/wk actually buys and re-derive the 2-week
    kill clocks from that cadence; name the $1k-envelope relief valve (faceless
    demo-wow-only); condition the editor/VA pull-forward on the $4k envelope per P5.
13. **§0+§8:** one honest sentence — "under gate-everything the polls/social flywheel
    is dormant at launch; the Score stands on the founder pipeline alone — priced in";
    pre-register the wall-evaluation trigger in §8 (top-20% cohort curve flattens by
    day 90 AND organic ≥35% AND installs plateaued 2 consecutive months → run the
    env-gated freemium evaluation as a deliberate decision).
14. **§1+§3:** add an incumbent-absorption override to the §3 trigger list (a Big-3
    surface shipping cross-restaurant dish _ranking_ = clone-trigger equivalent); A/B
    channel-zero hooks against the "Google already does this" objection and script the
    differentiation into pinned comments; one §1 line naming the moat when the
    sole-occupant claim expires (pipeline + receipts, not the slot).
15. **§8b/§9 (new):** retention mechanics v1 — ranking-change push in the user's saved
    cuisines + weekly Austin digest + poll lifecycle notifications, shipped by ~month 2,
    each instrumented against the top-20% cohort curve (the oracle gates the mechanics,
    not just the marketing).
16. **§4:** promote community seeding from failure-fallback to a named launch-moment
    lane — one transparent founder-voice r/austinfood + Austin-FB-group introduction at
    wall-flip (receipts-forward, owning the Reddit-derived provenance before the
    community discovers it), plus a standing own-identity presence rule; keep the
    existing fallback escalation unchanged.
17. **§4 integrity block:** subjects-of-rankings policy — controversy leads with
    positive superlatives; negative framings always attributed to the receipts ("per N
    Redditors"), never Crave's editorial voice, never below a size/fame floor;
    restaurant objections get the evidence trail. Contract terms: paid ranking claims
    must match the live Score at post time (with correction clause); no undisclosed
    restaurant comps for covered venues.

Calibration & honesty (blueprint text):

18. **§4:** label the conversion ladder "single-operator, phone-farm-derived (Flame) —
    ordering transfers, absolute volume does not"; note the ~300-view tripwire is a
    repurposed account-health diagnostic; state the 60–90-day channel-zero window is a
    minimum (Bloom: 90 days to make any video viral; Coconote: 8–9 months to traction)
    and a sub-viral-but-improving weeks-3–8 signal is expected, not failure.
19. **§4:** soften "No agencies, ever" → "no agencies in the bootstrap/founder-learning
    phase (strong majority; one scaled dissenter uses them for specialized functions)";
    reconcile the 2- vs 3-source count between §4 and ledger 11.
20. **§4:** soften "DM outreach, not email" → size-dependent: DM for small local
    creators (Crave's targets); large programs use email/DM/LinkedIn together.
21. **§4:** add the one-line "Noise two-pronged model" clarifier (structure borrowed;
    Noise's engine — account farms, comment seeding, disguised discovery — is
    prohibited); cap factory cadence (≤1–2/day/account, visible template variation,
    reach-collapse pauses the factory, never route around with extra accounts).
22. **§0:** fix the monthly-LTV arithmetic (cite the on-file 17.5%-at-12-months
    benchmark ⇒ ~7 payments/~$56, or label 3–6 payments an illustrative front-loaded-
    churn assumption; renewal multiple = ~1.7–2.5× depending on which figure verifies);
    soften "every bootstrapped operator… exactly this shape" → "the winning analogs
    closest to Crave's shape (Cal AI, Glow, Pepai) all ran it and reinvested the
    float"; restate the five flips as directional hard-gating evidence with the
    ledger's echo-risk caveat (Stronger = gated-pro freemium; Cardstock =
    paid-upfront→trial-sub; Nicole = wall-hardness A/B).
23. **§10:** re-ground the invite-unlock discard on P4's mechanism (second offer path
    contaminates pay-now + Apple-proofing), not Quittr's $5 flop; soften Pingo to
    "~350–400M views"; re-ground the weekly-plan discard on category fit (adult,
    no-urgency, retention-seeking), not an anti-weekly corpus consensus (Parra actually
    says weekly is rising for social apps).
24. **§1:** "an algorithm that won't hold a city" → "won't hold a city _organically_"
    (consistent with §6's verified DMA targeting); widen the clone clock to "2–3 months
    (PrayScreen, fast end) to ~12 months (Stronger) — category-dependent; plan on the
    fast end."
25. **§2:** cite Nicole's +50% (hard-wall-immediately beats let-them-browse) as the
    measured magnitude the pre-wall teaser knowingly defies; restore "or trial→paid" to
    the teaser-removal trigger; add Sway's lesson (explain the app before/between the
    early quiz questions, not just one hero card); optionally tie paywall copy to the
    already-built "money wasted on bad meals" anchor (the corpus's most consistent
    price-ceiling lever).
26. **§6:** restate "the only mechanism" → organic geo-concentration (local creators +
    city/dish hooks, §4's own plan) is the primary lever; Spark is the only _paid_
    lever at metro granularity, amplifying the residual national leak US-English
    content can't language-filter (Symmetry counter-example).
27. **§3:** carry P2's clone-pressure reversal — a funded dish-level competitor
    shipping multi-city before Austin clears its bar → accept a lighter per-city
    validation pass and say so in-product (the current unconditional bench bar is
    stronger than the ruling).

Cheap adds (blueprint text):

28. **§9 month 0:** flip the ASC listing to pre-order as soon as V1 passes review; all
    pre-launch content CTAs point at it. Add App Review completeness notes (reviewer
    path through the wall: sandbox IAP + throwaway credentials; 3.1.2 terms line +
    live legal URLs at submission).
29. **§3/§5 + §11:** state iOS-only-at-launch deliberately; slug pages show a notify-me
    capture to non-iOS visitors and the slug funnel counts Android taps; park "Android
    timing" and "web checkout rail (~12-pt margin swing) + web-to-app funnels" as §11
    items.
30. **§7:** submit the App Store editorial-featuring nomination at launch and at each
    meaningful release (cost ~zero; the one channel the corpus never competed in — no
    strategy built on it).
31. **§8:** read every timing gate against the Austin event calendar (SXSW/ACL/F1/
    holidays) — never open or close a kill/scale/expansion decision across an event
    boundary; event-week traffic is its own visitor-heavy, renewal-poor cohort; define
    every clock's anchor (content-craft clocks at posting-start; conversion-denominated
    gates armed only at wall-live); re-date the month-6 price revisit to
    "at ceiling-cohort readability"; name the trial-event pixel-attribution trap
    (platforms optimize on day-0 trial starts; real conversion lands day ~7) beside the
    §6 instruments.
32. **§8/§11:** log the win-back magnitude (trial-extension saves ~27% of cancelers —
    Coconote) beside the deliberate dormant-win-back choice, and Pingo's profitable
    decline-cascade beside the compliance refusal — both are real money consciously
    forgone, and the owner should see the price tags.

Ledger hygiene (evidence trail only, no blueprint change):

33. Fix in ledgers: 27M→~2.7M views (05); Payout prose "Finance" not "Food & Drink"
    (04); fake-scarcity anecdote → superwall--20251009, not PrayScreen (04);
    `superwall--20260623` → `arthurspalanzani--20260623` (07); drop/re-attribute the
    "$3 CPM ceiling" (06); fix "Matt made all Jenni content pre-hire" (06); strike
    Pepai from the hard-paywall-jump list (10); Sunflower range 30–70% (10); Halo
    16.5% = per-paywall, combined higher (02/10); footnote $345M as external + fix the
    "MFP: Cal AI" mislabel (11); relabel Fitted "$0.25/download" as derived
    ($150k/600k) revenue-per-download, distinct from the 1–15¢ CPI (01/03/07);
    "agency half-life ~6mo" belongs to Choi 20250404, not Kyle (05); Clear30 are
    founders, not "ads professionals" (05).
