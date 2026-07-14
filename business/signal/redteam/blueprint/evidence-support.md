# Red team — evidence-support audit of blueprint.md

> 2026-07-12. Method: walked blueprint.md section by section; traced every number,
> threshold, and sequencing rule to claims-ledger.md, ledger/01–11, the five
> panel verdicts, crave-fact-sheet.md, and spine/ close-reads (grep-verified
> against testimony where the trail was ambiguous). Fixed constraints (hard
> paywall, $7.99/$39.99, bootstrapped solo, no-pay-to-rank) were not relitigated.
> Findings ranked most-severe first; the "tested and held" list at the bottom is
> the part of the document that survived attack.

---

## MAJOR-1 · §4/§9 — the listicle factory lost its gate; the blueprint runs it months 1–2 against P3's explicit sequencing

**What:** P3's verdict gates the programmatic listicle factory twice: during days
0–60/90 the founder should "spec (don't yet ship) the listicle-factory template"
as pure engineering, and the factory ships "only after formats 1–2 validate
distribution … measured against the 0.1% floor" (P3 verdict, call §3 + impl.
notes 1/4; the factory-as-growth-engine framing "died to its own numbers").
The blueprint drops the gate entirely: §4 lists it as a format to "run as the
retargeting ground game," and §9 places "listicle factory as ground game"
inside the Months 1–2 lineup with no precondition.

**Why it matters:** this is a sequencing rule, and the canon doc now contradicts
its own panel. The factory is the corpus's worst-converting format (0.05–0.2%)
and the one that consumes founder _engineering_ hours — the exact asset P5's
hour-cap and tripwire exist to protect. Running it pre-validation is the
Copia/Jack-Frics failure mode the panel explicitly rejected.

**Change:** in §4 and §9, restore the gate: "spec only during channel zero; ship
the factory only after a demo-wow or controversy format validates distribution,
and measure it against the generic ~0.1% floor (P3 reversal 6)."

## MAJOR-2 · §4 — "~5k views on a post = signal" is an invented threshold that contradicts the panel's protocol, and the top conversion gate vanished

**What:** No source anywhere in the corpus says 5k views = signal. The measured
protocol (ledger/05 operating protocol, adopted verbatim by P3) is: **~15k views
flags a candidate**, and the 1–5k band means "keep format, vary copy" — i.e., a
mid-tier result, not validation. Worse, the blueprint's validation bar drops the
panel's non-view gates entirely: 3-sec watch-through ≥70–75%, skip <20%, and
"above all, 'what app is that' comment density" — which ledger/05 calls the top
signal precisely because installs won't attribute. (The failure bar — two 2-week
cycles under ~300 views — traces cleanly to P3 reversal 1; only the success bar
is fabricated.)

**Why it matters:** the canon doc's only content-success threshold is 3× looser
than the evidence, and the one metric the corpus says actually predicts
conversion is absent. A founder reading §4 alone would declare victory on posts
the panel protocol classifies as "vary the copy."

**Change:** replace the line with the P3 gates: ~15k views + ≥70% watch-through +
"what app is that" comment density flags a candidate; 1–5k = iterate copy. If 5k
is intended as a deliberately easier bar for a one-metro account, label it
engineered and say why the geo-discount justifies it.

## MAJOR-3 · §2 — the ceiling test kept only the migrate-up rule; the armed kill criterion and slow-volume fallback were dropped

**What:** P1's verdict arms the week-3 $9.99/$59.99 cohort with a symmetric rule:
migrate up if it holds within ~1 point at ~100 purchases/arm, **and kill early
"if the variant's install→paid falls below Vahe's 4% line while control holds
≥4% (read within the first ~200 paywall views per arm)."** P1 also carries a
volume fallback ("organic installs so slow that 100 purchases/arm exceeds ~two
quarters → read on the noisier sample") and a prerequisite (pre-configure both
offerings in RevenueCat before launch so the switch is a flag). §2 states only
the migrate-up half.

**Why it matters:** as written, the blueprint has no instruction to stop routing
10–20% of scarce launch traffic into a rate-collapsing variant, and at realistic
organic volume the test never resolves. Asymmetric decision rules are exactly
the synthesis-drift class this audit exists to catch.

**Change:** add one sentence to §2: "Kill early if variant install→paid <4% while
control ≥4% (within ~200 paywall views/arm); if 100/arm would take >~2 quarters,
read the noisier sample. Pre-configure both offerings in RevenueCat pre-launch."

## MINOR-4 · §8 — the install→paid halt rule lost its minimum-sample qualifier

**What:** P5: "<4% for two consecutive weeks **(min ~200 installs)** = halt all
distribution scaling." Blueprint §8: "<4% for 2 weeks = halt scaling and fix."

**Why it matters:** in the earliest weeks the rule can fire on a 30-install
sample of noise and halt the machine for nothing. **Change:** restore the
"(min ~200 installs)" qualifier in the table row.

## MINOR-5 · §0.2 — the monthly-LTV arithmetic is invented, and it flatters the annual case

**What:** "a typical monthly sub survives ~3–6 payments (~$25–45 LTV at $7.99)"
appears nowhere in ledger/panels/spine. The only monthly-retention benchmark on
file (ledger/02 numbers table via business-model.md: monthly retains ~17.5% at
12 months, RevenueCat lifestyle) implies ~7 expected payments (~$56) under
constant hazard — the invented figure understates monthly LTV, tilting the
already-settled annual argument. In the same breath, "renews at roughly 2–2.5×
the rate monthly retains" only holds at the 40–44% band (44/17.5≈2.5), while
the sentence instructs modeling on 30% (≈1.7×) — internally inconsistent.

**Why it matters:** §0 presents itself as "reconstructed from the strongest
evidence rather than vibes"; motivated arithmetic in the rationale corrodes
exactly that claim. The decision doesn't change; the honesty of the document
does. **Change:** either cite the 17.5%-at-12-months benchmark and let the
multiple be "~1.7–2.5× depending on which renewal figure verifies," or label
the 3–6-payments figure as an illustrative front-loaded-churn assumption.

## MINOR-6 · §0.1 — "Every bootstrapped operator in the corpus who scaled ran exactly this shape" overclaims a HIGH-echo-risk four-app pattern

**What:** ledger/02's shape-consensus (annual-only trial + big monthly/annual
gap) rests on four apps and is flagged "Echo risk: HIGH — the same podcast
ecosystem citing each other … claimed, first-party self-report, no independent
verification." Meanwhile bootstrapped operators who scaled on _other_ shapes
exist in the same corpus (NGL and RizzGPT on weekly, Quittr at $12.99/mo·~$45/yr,
Pingo at $99.99/yr with monthly hidden). "Every … exactly this shape" is false
as stated; the direction (annual-first capital velocity) is real and P1-blessed.

**Change:** soften to "the winning analogs closest to Crave's shape (Cal AI,
Glow, Pepai) all ran it and reinvested the float" — which is what the evidence
actually says.

## MINOR-7 · §10 — invite-unlock is rejected on the wrong citation; the ledger says Quittr's flop is the _less_ probative datapoint

**What:** §10 discards "invite-unlock referral schemes through a hard wall
(Quittr's $5 flop)." Ledger/07 conflict 4 says the opposite about that evidence:
Nicole's invite-3 unlock did NOT hurt conversion, Wink's produced "millions of
organic downloads," and "for food (zero shame, natural endorsement), the
Nicole/Wink side is more probative." The real rejection ground is P4's
mechanism argument: invite-unlock "contaminates the pay-now message and creates
a second offer path Apple-proofing forbids."

**Why it matters:** §10 forbids relitigating "without new evidence" — but the
cited evidence points the other way; only the mechanism holds. Someone auditing
the discard would reopen it. **Change:** cite the P4 mechanism, not the flop.

## MINOR-8 · Dropped panel nuances — mostly deliberate slimming, three worth a conscious call

1. **§3 hardened P2's clone-pressure reversal away.** Blueprint: bench cities
   flip only after "the same calibration + density bar Austin passed." P2's
   reversal triggers explicitly rule that if "a funded dish-level competitor
   ships multi-city before Austin clears its bar … accept a lighter per-city
   validation pass and say so in-product." The blueprint's unconditional phrasing
   is _stronger than the ruling_. Also dropped: P2's calibration-transferability
   forks (bench shrinks to 1 / widens to 8–10).
2. **§2 teaser-removal trigger** dropped "or trial→paid" (P1 monitored both
   metrics downstream of the teaser, not trial-start alone).
3. **§9 part-time editor/VA pull-forward** is a **$4k-envelope-only** item in
   P5; the blueprint states it unconditionally — at $1k/mo it isn't affordable
   per the panel's own envelope math. (Also trivial: §3's trigger says "flat
   view→install" where P2 reads "flat-or-declining view→install/**paid**.")

---

## Tested and held (one line each)

- §0 hard-paywall flip evidence: the five-name list (Cal AI/GrindClock, Quittr, Stronger, Cardstock, Nicole) is exactly ledger/03 consensus 1 — verified, though the ledger's "echo risk: severe" caveat is silently dropped.
- §0 "Apple pays ~2 months late" — spine/06, verbatim. "Cal AI to $30M/yr" — spine/07 ($30M 2025 revenue), verified.
- §1 positioning, hybrid identity, and the 2–3-month copycat clock ("dozens" honestly softens ledger/01's ~70) — all trace clean.
- §2 paywall spec — every element ($39.99 most prominent, "Try it free," Blinkist timeline w/ Apple-sent reminder, bullet-list + demo-video test #2, quiz-mirrored copy, duration ordering) matches ledger/03 + P1 verbatim; the compliance refusal list matches the Cal-AI-pull class precisely.
- §2 monthly-trial flip condition (<4% over 60 days while annual trial-start ≥15%) — P1 reversal trigger, verbatim.
- §3 wall-flip gates (full 3-yr load, owner-feel recalibration, top-20 query classes ≥10 receipted dishes), bench size/cost (3–5 cities, ~$2–4k), and the primary trigger + both overrides — P2 verdict, faithful.
- §4 conversion ladder (0.5–1% / 0.05–0.2%), creator deal grid ($300–500/mo, $20–50/video, non-stacking $60/$200/$500/$800, perpetual rights, no cap), anchor terms ($500–1,500/mo, day 90–150, no equity), DM-not-email, agencies-never (3-source) — all trace to P3/ledger 05–06.
- §4 integrity line (allowed vs prohibited) — P3's engagement-bait ruling, faithfully carried including own-identity pinned comments.
- §5 slug policy — P4 verdict carried intact: rendering table, terminal-page boundary, standard funnel, launch-blocking trio, monetization-and-gating.md superseded wholesale (P4's rejection of partial revival preserved).
- §6 ASA-as-instrument (credit → ~$100–300/mo cap, product-quality validation via competitor keywords) and Spark grid (≥8% ER → $20 DMA test → $50–100/day while >5%; Meta fallback; bench +2–3 cities if both fail) — P5 + ledger/08, incl. the verified DMA-targeting fact.
- §7 ASO — matches ledger/09's concrete leaning point-for-point.
- §8 bands (4–10%/>10%, ≥15%, ≥30%/<20%, 50/35/20 organic, top-20% cohort oracle) — Vahe/Blue Throne via P5; the "~50–100 conversions per variant" A/B floor is genuinely in ledger/10 (not a dilution of P1's 100/arm).
- §8/§0 renewal handling ("model on ~30%; verify RevenueCat ~44% before kill lines") — an acceptable merge of P1's bracket-on-30 and P5's don't-anchor-kill-criteria-on-30 warning.
- §9 calendar, hour caps (10–12 → 15–20 h/wk), depth-not-phases, operator-at-8–10-creators, cut-creator-hours-first — P5, faithful.
- §10 discard list — every item traces (Massive ~0.5% waitlist, Pingo 400M/200k, Glow's credit-riding + course incentive flag verified in testimony, Waking Up celebrity moat, weekly plans, equity, studio amortization) except the Quittr citation in finding 7.
