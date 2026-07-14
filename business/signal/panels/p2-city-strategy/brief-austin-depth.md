# Brief: Austin-Only Concentration

## The position

Crave launches Austin-only and stays Austin-only until Austin proves saturated by
evidence, not by calendar or by how cheap the next city's data load is. The $600–1.5k/
city, two-command seeding cost (`crave-fact-sheet.md`) is real, but it prices only the
LLM/data layer — not the two things that actually gate expansion: founder attention
(Brandon is solo founder _and_ sole engineer, with five launch blockers still open) and
score-quality calibration against real local density, which the fact sheet flags as
unresolved even for Austin. A second market, dark-seeded or not, inherits both costs
before it inherits a dollar of the $15–40k the ledger quotes for 25 cities. The corpus's
least echo-risked finding — win one geography or category completely before broadening
(Alberto, Symmetry, Blue Throne, Lobby; `ledger/04-launch-shape.md`) — plus the
near-universal founder-led-content consensus (`ledger/05-founder-led-content.md`,
`ledger/11-scaling-and-sequencing.md`) both point the same direction: depth in Austin
compounds the moat; breadth is a distraction dressed as insurance.

## The affirmative case

**Score-constant calibration is unvalidated even in Austin, let alone anywhere else.**
The fact sheet's own open caveat: ρ=0.5, acclaim/praise weights, upvote premium, opinion
floors are explicitly "re-derive against production density" — tuning happens _after_
the full Austin load, before any launch judgment on feel. Crave's entire moat is "an
objective, evidence-receipted score, never personalized, never pay-to-rank"
(`crave-fact-sheet.md`, Moats §2). A score that hasn't been eyeballed against one city's
real density cannot be trusted to transfer its constants to a second city's different
restaurant mix, review density, and community voice — that's an assumption, not a fact,
and the panel's own epistemic rule says don't guess where data should decide.

**Founder attention is the scarcest resource in the model, and the corpus prices it
explicitly.** Founder-led content precedes any creator spend in essentially every
success case — StudyFetch, Jenny AI, Sideshift, Nomad Table (7 months solo before the
first creator hire), Symmetry ("you cannot manage people expecting them to go viral if
you don't know how") — five-plus independent sources (`ledger/05-founder-led-content.md`,
`ledger/11-scaling-and-sequencing.md`). A campaign manager is only the correct first hire
once a creator roster needs logistics (Sideshift's 1:10 ratio implies ~10 creators first)
— a single-city timeline on its own. Every hour Brandon spends validating a second
market's score quality is an hour not spent on the five items still blocking launch
(Apple enrollment, real ASC products, paywall re-skin, legal URLs,
`ENTITLEMENT_GATING=enforce`) or on the 60–90 days of founder-shot content the corpus
calls non-negotiable. Section 11 says it plainly: "nobody models a solo technical founder
simultaneously shipping product" — Crave has to model that, because no comparable guest
ever had to.

**Home-market-first is the least echo-risked consensus in the entire corpus.** Alberto's
Spain-first budget app (viral rate 1-in-6 to 1-in-10 at home vs 1-in-30–35 in the US via
VPN), Symmetry's Mauro (Spain-first Gen-Z gym app, "the market will not get saturated,"
expansion only after Spain dominance), Blue Throne's Flo/Runna narrow-before-broad rule,
Lobby's Israel-first cascade (25–30% day-90 retention at home vs ~half elsewhere) — four
sources across finance, fitness, and social-network categories, converging without
citing each other (`ledger/04-launch-shape.md`, `ledger/01-positioning-and-category.md`).
For Crave the transfer is arguably _stronger_ than for any of them: Symmetry's product
works identically in any Spanish city; Crave's product **cannot function at all** outside
a data-dense market. The "home market" unit for Crave isn't a country of convenience —
it's the literal boundary of the product's usefulness.

**Credibility liability of thin cities is a real, named risk, not a hypothetical.** Ledger
04's own open caveat: "a shallowly-validated 25-city flip risks the integrity brand
everywhere at once, an asset none of this corpus's churn-and-burn guests ever had to
protect." A user who searches a half-seeded city and gets sparse or wrong results doesn't
read that as "beta" — on a hard-paywall product they already paid for, they read it as
"the app is broken" or "the score is fake," the one accusation the no-pay-to-rank brand
cannot survive even once.

**Spark geo-targeting answers the geo-dilution objection at a fraction of the cost of
seeding cities.** The fact sheet's verified fact: TikTok Spark Ads inherit DMA/metro/
city/zip targeting (up to 3,000 locations); Meta supports city+radius. This is the
mechanism the corpus's Pingo/StudyFetch geo-dilution finding is actually asking for — not
"seed more cities so the diluted views have somewhere to land," but "pay a few dollars to
put the winning organic video's paid amplification directly in front of the Austin DMA
and let the rest go where it was always going to convert at zero: nowhere." Sideshift's
own spark-test economics (ER ≥7.5–8% → scale at ~$20; kill under 5%; sub-$1 mature CPMs)
make this a cheap, decoupled fix that requires zero additional market data.

## Pre-empting the other side

**Their strongest point: geo-dilution insurance.** Ledger 04 recommends dark-loading a
bench of spillover cities so a viral Austin video's wasted national reach has "somewhere
to land," quantified against Pingo (~half of peak new users unmonetizable) and StudyFetch
(a national creator's audience is only ~80% in-country). I concede the mechanism is real
— but it conflates two actions. _Loading data in the background, never surfaced, never
marketed_ is genuinely close to free and doesn't compete for founder attention if it's
truly inert. But the objection actually asks for cities ready to "have somewhere to
land" — visible, receiving traffic, functioning the moment a video breaks out — and the
fact sheet's own words describe exactly that state as the liability ("a liability if UGC
sends traffic there before the Score is trustworthy"). A city seeded but never validated
by the founder isn't insurance, it's a landmine with the pin already pulled. Spark
geo-targeting removes the need for the insurance in the first place — contain the ad
spend to Austin instead of pre-building somewhere for the overflow to go.

**Their second point: the PrayScreen ASO-decay clock.** Sole-listing keyword ownership
collapsed into ~70 clones in 2–3 months once the category became legible. This argues for
speed on the _category claim_ ("dish-level food discovery"), not for spreading across
cities — a copycat chasing dish-level ranking anywhere still has to pay Crave's own
$600+/city + calibration + Reddit-corpus cost floor. Owning the ASO query class now
(ledger 01's actual recommendation) is fully compatible with Austin-only depth; it argues
for shipping fast in one place, not thin in many.

**Their third point: existing NYC exposure.** Onboarding today already lists NYC as a
"live" city alongside Austin, not waitlisted (`crave-fact-sheet.md`). This is a real
inconsistency with the position argued here, and it should be fixed, not rationalized —
see Concrete Implementation.

## Concrete implementation

1. **Collapse NYC back into the waitlist branch** in the onboarding city picker until
   Austin hits the saturation bar below. It should not receive founder content, creator
   spend, or ad spend before Austin does, and should not present as "live" if its data
   hasn't passed the same calibration pass Austin requires.
2. **Spend the next 60–90 days of founder time on Austin-scoped content only** — screen-
   recorded demo-wow, ranking-controversy formats, Austin-native hooks — per section 05's
   protocol (5–6 formats in 2 weeks, 15k-view candidate flag, 70–75% 3-second watch-through
   gate). Zero creator-program hiring until an Austin roster needs the 1:10 logistics
   ratio.
3. **Use Spark/Meta geo-targeting, not city-seeding, as the answer to any viral overflow**
   — the first time an Austin video breaks out nationally, spend $20–50 geo-targeted at
   the Austin DMA per Sideshift's spark-test gate, rather than treating the overflow as a
   signal to seed city #2.
4. **Gate city #2 behind four conditions, not a date:** (a) full Austin archive loaded and
   score constants re-derived + owner-feel-approved against real production density; (b)
   two consecutive 2-week Austin content cycles show flattening view→install RPM despite
   format variation — the same plateau signal that made Cal AI broaden past its
   fitness-influencer pool at ~$2M/mo (`ledger/11-scaling-and-sequencing.md`); (c) a live
   Austin paying cohort clears Blue Throne's "good" bands (≥35–50% organic share, ~40%+
   year-1 resubscribe); (d) the five launch blockers are fully shipped and
   `ENTITLEMENT_GATING=enforce` is live, freeing founder bandwidth. Only then does the
   $600–1.5k marginal cost of city #2 matter — the gate is capacity and calibration, not
   dollars.
5. **"Austin saturated" is defined as all four conditions above being true simultaneously**
   — not App Store rank, not download count, not competitor-race urgency (PrayScreen's
   clone window). Any one condition failing means Crave is not ready to protect its
   integrity brand in a second market yet, however cheap that market's data is.

## What would prove me wrong

If two consecutive Austin-scoped content cycles show _zero_ distribution regardless of
format (Marcus Burke's niche-adset-throttling warning materializing, not hypothesized),
that would mean Austin-only concentration cannot even generate the founder-content signal
this brief depends on — at that point the geography itself, not just the content, may be
the constraint, and dark-seeding cities to diversify the format-testing surface would
become a legitimate hedge rather than premature breadth. Separately, if a well-funded
direct dish-level competitor emerges with its own data pipeline before Austin clears the
four gates, the PrayScreen decay-clock risk would outweigh the calibration-and-attention
argument, and speed-to-multi-city would become the correct trade even at the cost of a
less-validated score elsewhere. Absent either signal, the evidence points at depth.
