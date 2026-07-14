# Brief: Raise the Ceiling — Price Higher, Taste Before the Wall

## The position

$39.99/yr and $7.99/mo are anchored to the wrong comparison set: Crave copied the
price band of Glow and Pepai (`$10/mo·$40/yr`), two AI-wrapper novelty apps whose
economics are inference-cost-calibrated and whose value decays with sameness, not
to any precedent for a durable local-data-density utility with no ad budget and
no ability to buy volume. Blue Throne's price-ceiling math says the cheapest path
to a target ARR for a bootstrapper is fewer payers at a higher price, and Crave —
uniquely among the corpus's guests — cannot spend into the "more payers at $4.99"
side of that trade even if it wanted to, because it has zero UA budget; that makes
the higher-price side of the argument not just attractive but close to the _only_
side actually reachable from Austin's organic-only install base. Separately, the
corpus's own logic on gate placement (Sway's concession, Halo AI's 16.5% combined
double-paywall) says Cal-AI-style hide-everything-first-then-hard-gate is a
category-mismatched import: Crave can show a real, live Austin Score for free at
zero marginal cost, which none of the AI-wrapper apps in the corpus could do. The
strongest version of this argument pushes on price level (test above $39.99/yr)
and on gate craft (taste real data before the card ask) without touching the
fixed hard-paywall-gate-everything structure itself.

## The affirmative case

**Price level.** Blue Throne's Josh — the one buyer in the corpus who has
audited real M&A targets rather than narrated a survivor story — frames the
ceiling question as pure arithmetic: $4.99/mo to $30M ARR needs ~500k payers,
$20/mo to the same $30M needs ~125k; "the cheapest path... is fewer payers at
higher prices" (`superwall--20260708--blue-throne-six-rules-exit.md`, ledger
`02-business-model-and-price.md` numbers table + conflicts). His proof case,
Waking Up, sustains $20/mo·$150/yr on ~25k downloads/mo → $1M+/mo, a 10x-normal
downloads-to-revenue ratio. That shape is exactly what a no-UA bootstrapper
needs: Crave cannot manufacture 500k organic installs in year one, so the
volume-dependent side of every low-price precedent (Cal AI, Glow, Pepai — all
resting on a bigger addressable download base or paid-assisted scale than one
city) doesn't transfer to a single-city, organic-only launch. The ledger flags
this directly: "Crave's dish-level data density is a real, non-AI-wrapper moat
that the $29.99–39.99 band was never calibrated for... under-$10/mo may be
leaving bootstrap-critical margin on the table" (`02-business-model-and-price.md`,
Crave transfer). Margin math sharpens it: iOS nets ~85% (Apple Small Business
Program, per the fact sheet); every incremental ARPU dollar funds city #2, which
the fact sheet's own city-economics section prices "proportionally more than
$600" — a 25-city rollout runs $15–40k in LLM spend alone. A bootstrapper
self-funding geographic expansion out of subscription revenue should not
under-price the one lever it fully controls.

**Gate craft.** Ledger `03-onboarding-and-paywall-craft.md` names the exact
tension directly: "Halo AI's skippable-then-hard-gate-at-first-action combo
converts at 16.5%, beating either paywall alone" and "none of Crave's core
surfaces... carry Cal-AI-scale inference cost, so the cost-based argument for
hard-gating doesn't obviously transfer, but the psychological argument (let
people taste the Score before the wall) is untested for Crave specifically." The
same ledger file states the resolution in Crave's favor explicitly: "Crave can
show real Austin rankings for free at zero marginal cost — the corpus's own
logic says the conflict resolves differently for Crave than for Cal AI" (line
18, "Show the product before the wall?" conflict). Sway's own A/B is the
strongest evidence _against_ blind paywall-first: they found paywall-first won
only because their aha required user effort (uploading photos) — a precondition
that does not hold for Crave, where the aha (a ranked, evidence-backed dish list
for a real Austin cuisine) is already computed and costs nothing to render to an
unpaid viewer.

**Trial on monthly too.** Vahe's aggregate data shows ~10% of users offered a
trial-skip toggle take it outright (`03-onboarding-and-paywall-craft.md` numbers
table, `superwall--20251116`). Ledger `02` names the open question directly:
"does Crave's zero-brand-trust city launch argue for offering the same short
trial on the monthly path too... until funnel metrics are strong enough to earn
Vahe's trial-removal preconditions?" A first-time, no-brand-equity local app
asking an Austin user to pay $7.99 sight-unseen is a harder ask than the same
user choosing annual _because_ it carries a trial — the monthly path currently
carries 100% of the funnel's risk with 0% of the de-risking machinery the corpus
proves works.

## Pre-empting the other side

**Their strongest point: Glow and Pepai are Crave's closest actual analogs, and
they're priced where Crave priced.** True, and this is a real concession — two
independent, first-party-dashboarded apps converged on almost exactly Crave's
number, which is real evidence, not just an echo. But both are AI-wrapper
novelty products (affirmations, peptide tracking) with inference-cost economics
and short natural lifespans; neither claims a repeat-use, local-data-density
moat. Converging with them is convergence with the wrong reference class, not
proof of the right price.

**Their second point: Waking Up's $20/mo works because of Sam Harris's
celebrity-authority halo, which Crave doesn't have.** True — the ledger says so
explicitly ("Waking Up has a celebrity-authority moat Crave doesn't have"). I
concede Crave cannot import Waking Up's specific number. But that gap cuts
against a _specific_ ceiling, not the underlying arithmetic — fewer-payers-at-
higher-price doesn't depend on having a celebrity, it depends on a UA-budget
constraint, which Crave has more acutely than almost any guest in the corpus.

**Their third point: a botched high-price test at zero brand trust could crater
install→paid below Vahe's <4% "problem" line, and Crave has no ad budget to
refill a broken funnel.** This is the strongest objection and I concede it in
full: Crave gets one credible first impression per Austin user, and the corpus
has no example of a data-density local utility testing a $50+/yr price cold. The
honest answer is not "price higher at launch" outright — it's "instrument a
price-ceiling cohort test, don't bet the whole launch on the untested number,"
which is exactly the ledger's own prescription: "plan an explicit price-ceiling
test cohort (10–20% of new subscribers pushed to a higher annual price, e.g.
$59.99–79.99/yr) rather than treating $39.99/yr as settled."

**On the gate specifically:** the fixed decision is hard-paywall-gate-everything
at onboarding end, and that is correctly not up for relitigation — a solo
founder with no other revenue source cannot afford a free tier that cannibalizes
day-one cash. I am not arguing to break that. I am arguing that "gate everything"
fixes _where the card is required_, not _whether a real data preview appears
before the ask_ — and the corpus's own reasoning, not just Crave's, says those
are different levers.

## Concrete implementation

1. **Price-ceiling cohort test, not a launch-wide change.** Keep $7.99/$39.99 as
   the default at launch (protects against the conceded downside above). Route
   10–20% of new-subscriber traffic to a $9.99/mo·$59.99/yr variant via
   RevenueCat's existing offering infrastructure (already dual-rail per the fact
   sheet) the moment real ASC products exist post-Apple-enrollment. Do not wait
   for "enough traffic to be significant" to start collecting the comparison —
   start it in the first cohort, read it at 90 days alongside the retention
   curve (ledger `10`'s Blue Throne oracle: top-20%-engagement cohort curve
   flattening is the real signal, not raw conversion rate).
2. **Trial on monthly, mirrored from annual.** Attach the same ~1-week
   store-managed trial to the $7.99 monthly SKU. This is a copy/config change
   in the existing RevenueCat offering, not new engineering — no PaywallScreen
   architecture change, since the screen already renders prices/terms from the
   offering object per the fact sheet.
3. **Taste-then-wall inside onboarding, not after it.** Insert one screen after
   city pick (Austin is already confirmed live) that renders a real, live
   Crave Score card — one dish, one restaurant, real evidence quotes — pulled
   from the already-built pipeline at zero marginal cost. This sits _before_
   the Clerk-auth/paywall steps, so "card required to enter the app" and
   "gate everything" both hold exactly as decided; it only changes whether the
   onboarding narrative includes one proof-of-value beat before the ask,
   which is the Sway/Halo AI insight applied without touching the fixed gate
   location.
4. **Kill criteria for the test, stated up front:** if the $59.99–79.99/yr
   variant's install→paid falls below Vahe's <4% problem line while the
   control holds ≥4%, kill the variant within the first 200 paywall views per
   arm — don't let a bad higher-price test bleed the whole launch's install
   base, per the corpus's own ~50–100-conversions-per-variant floor.

## What would prove me wrong

If the $9.99/$59.99+ cohort's install→paid rate falls meaningfully below the
$7.99/$39.99 control's rate at matched traffic quality (not just lower revenue
per payer, but a collapse in the _rate_, signaling the higher price is turning
away payers rather than just filtering harder) — that is a direct, ungamed
signal that Crave's category ceiling sits nearer the AI-wrapper $29.99–39.99
band than the ChatGPT-reset band, and the test should be killed per the
criteria above, not argued with. Likewise, if the onboarding taste-screen
measurably lowers downstream trial-start or trial→paid (evidence that showing
value first invites "I've seen enough, I don't need to pay" rather than
building desire), that would validate the Cal-AI/Nicole hard-gate-immediately
pattern over the Sway/Halo AI taste-first pattern for Crave specifically, and
the screen should come out. Both tests are cheap, reversible, and don't touch
the fixed hard-paywall-gate-everything structure — which is exactly why they're
the right way to resolve this argument with data instead of opinion.
