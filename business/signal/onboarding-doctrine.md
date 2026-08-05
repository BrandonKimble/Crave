# Onboarding Doctrine — the first principles (derived before auditing the as-built flow)

> Distilled 2026-07-12 from ledger/03 (the corpus's best-evidenced topic:
> 7+ sources on quiz-as-investment, 3 independent A/B lineages), panels/p1
> (the gate verdict), blueprint §2, and spine 01/06/09. This is the lens the
> onboarding redesign is judged against. Written BEFORE re-reading the current
> flow, per the owner's instruction.

## The ten principles (the signal, noise removed)

1. **Onboarding is the sales conversation, not a settings wizard.** Under
   gate-everything, onboarding + paywall IS the whole revenue funnel —
   install→paid (4–10% band) is the business. Every screen either builds the
   case to buy, or it leaks. There is no neutral screen.

2. **Friction is a tool, not a leak — when every screen does work.** Proven
   across three independent lineages, not just the Cal AI echo: Coconote went
   5→13 screens for +16% trial conversion; Glow's "fewer personal questions"
   variant produced ZERO conversions; Copia's quiz rework took install→paywall
   from 50–60% to 85–90%. The mechanism is self-persuasion: answering "why do
   you need this" makes the user argue themselves into the purchase. Corollary
   with teeth: **a screen that neither persuades, personalizes, nor measures
   is pure drop-off cost.** Every step must be able to name its job.

3. **The arc beats the question count: hook → frame → pain → investment →
   payoff → de-risked ask.** Emotional sequencing is the design, screens are
   just its beats. Pain must be agitated concretely (the money-wasted graph is
   loss-framing — the corpus's most consistent price-ceiling lever). The
   payoff beat is Crave's unique weapon: real, precomputed Austin data shown
   free (the Sway concession: paywall-first only wins when the aha is
   expensive to show; ours is free). The ask comes last, at peak conviction.

4. **Personalization must be real, or it becomes a lie the user can check.**
   Mirror answers back (recap screens, paywall copy — "your taco-obsessed
   Austin profile is ready"); wire answers into the teaser and first-session
   defaults. A recap that renders empty is fake personalization visibly
   breaking — worse than not asking. Never ask what nothing consumes, with one
   disciplined exception: a small number of commitment questions whose job IS
   the asking — and even those must feed the recap so the investment is
   acknowledged.

5. **Say what the app is before deep questioning** (Sway's lesson). One line,
   early. Ten questions about a product the user can't picture yet reads as a
   survey, not a consultation.

6. \*\*Triple-purpose every answer where possible: psychology + personalization
   - instrumentation.\*\* The attribution question is the organic-share metric
     (blueprint §8). Frequency + budget feed the money graph AND the §8.5 demand
     model. "How do you decide where to eat" is competitive-displacement data.
     Single-purpose questions must justify their slot; triple-purpose ones are
     free.

7. **At the ask: de-risk, never pressure.** Trial-forward framing ("Try it
   free," say free repeatedly), the reminder promise (Sunflower: +46% trial
   conversion from ONE priming screen — and Apple literally sends Crave's
   reminder for free), cancel-anytime, price transparency before the charge.
   The compliance line is absolute: no forced ratings, no fake urgency, no
   decliner re-prompts (the Cal AI pull class).

8. **One decision per screen; momentum mechanics.** Progress bar + commitment
   screen moved Glow's completion 74%→83%. Taps beat typing; typing is allowed
   only for high-value taste anchors. Auto-advance where a choice isn't needed.

9. **Auth as late as possible, wall at the very end.** Nothing before the
   payoff beat should cost the user anything (account, permissions, ratings).

10. **Instrument per-step from day one; test only drastic changes early.**
    Healthy bands: 98–99% per-step completion (Quittr), 20–30s dwell on goal
    questions with <5% drop = good friction (Clear30). No A/B below ~100
    purchases/variant — ship the benchmark and watch the funnel.

## What this implies for Crave specifically

- The **teaser screen** (P1: one non-interactive screen, 3–5 live ranked
  dishes from the user's own quiz answers + one evidence quote, after city
  pick, before auth/wall) is the payoff beat and the single highest-leverage
  unbuilt piece of the flow.
  > **CORRECTION 2026-08-04 (Phase-3 doc-territory drain, audit F749) —
  > the teaser screen IS BUILT.** `apps/api/src/modules/teaser/{module,
  > controller,service}.ts` is wired at `app.module.ts:26,112`;
  > `apps/mobile/src/screens/onboarding/OnboardingTeaser.tsx` implements
  > `STEP_IDS.teaser` (`constants/onboarding.ts:484-485`). Its placement
  > differs from this spec — it sits at the END of the quiz, immediately
  > before the account step, not "after city pick" — which is an owner
  > call (see `business/signal/redteam/verdict.md`'s 2026-08-03
  > correction, item F1221), but existence is no longer hypothetical.
- The **taste-profile questions are not throat-clearing** — they are the
  teaser's _inputs_ and the paywall copy's raw material. The more real the
  wiring, the more the investment psychology compounds.
- The **rating ask does not belong in onboarding at all** (blueprint §7:
  post-purchase value moment, SKStoreReviewController only). Pre-value rating
  harvest is in the enforcement family we refuse.
- **Notification preference is a retention asset** (§8b mechanics: ranking-
  change pushes, weekly digest) — it must be framed around those benefits and
  actually wired to them.
- Questions that feed nothing today (and aren't commitment beats) are cut
  candidates, not "nice to have": every screen is paid for in drop-off.

## Addendum (2026-07-25): the personalized-home consumer

The Spotify-style home surface (constructed lists: global-with-rotation +
made-for-you) gives onboarding answers a second first-class consumer beyond the
teaser. Consequences applied: the occasion/company axis returned as `contexts`
— trait-framed ("regularly picking spots for"), one screen, each chip a named
list recipe (date-night / family / business / group / everyday / special-
occasion). "Adventurous" maps to the `hidden-gems` goals chip, not a screen;
its recipes: Trending = top `rising` component; Hidden gems = high score +
below-median mention volume with an evidence floor (great-but-under-discussed —
NOT trend-slope, which is Trending's job). Neighborhoods stays OUT of
onboarding (its options require the city, which is picked at step 15; asking
after city pick would delay the close at peak conviction) — it becomes the home
surface's own first-session prompt. Standing rule this created: an onboarding
question is justified by a NAMED consumer (teaser, home list recipe, recap,
instrumentation) — "will feed personalization someday" is not a consumer.

## Addendum 2 (2026-07-25): city pick moved to the front; neighborhoods go passive

Owner pushed on relitigating foundations, and the city picker failed the audit:
its late position (step 15) made non-live users invest 14 screens before
learning the truth — sunk-cost-flavored, resentment-generating for a paid app,
and it blocked any city-aware copy. MOVED to Phase 1 (hero → carousel →
attribution → city). Attribution stays before city so the source is captured
even for users who bounce at the city gate. Non-live users now branch to an
honest SHORT track: waitlist-info → cuisines → always-craving (framed as
"your answers decide what we load first" — waitlist answers are literal
seeding-priority signal for the bench cities) → preview pick → waitlist
account. Live users continue the full arc, now city-aware throughout.
ONBOARDING_VERSION → 4.

> **CORRECTION 2026-08-04 (Phase-3 doc-territory drain, audit F749) —
> superseded version.** `ONBOARDING_VERSION` is now `6`
> (`packages/shared/src/constants/index.ts:12`), not the `4`/`5` this
> doc's latest entries state.

Neighborhoods: no question ANYWHERE — superseded by passive inference (owner's
call, better than the first-session prompt idea). The home surface infers the
primary neighborhood from usage location over time, and travel becomes a
feature (away from home → lists flip to the visited area). Asking would be a
worse version of what the map already knows. Standing rule sharpened: prefer
inferring from behavior over asking, whenever inference reaches the same
quality within days.

## Addendum 3 (2026-07-26): the waitlist one-shot rule; presentation beats

**The onboarding arc is a one-shot sales conversation — never run it when the
store is closed.** Waitlist users can't buy; burning the pain→investment→payoff
arc on them spends the emotional peak months before the conversion moment. The
waitlist track is therefore MINIMAL: city truth → save-your-spot account → out
(three beats). At city launch, the notification brings them through the FULL
onboarding fresh — that is their real first onboarding, with a live teaser and
a real wall. Corollary: their onboarding status stays "waitlisted," never
"completed"; launch-day machinery must route them into the full flow (build
item). Corrected signal model: a waitlist user's value = their SIGNUP COUNT
(city build-order ranking = the demand signal) + the re-engagement channel.
Their taste answers have no consumer pre-launch → cuisines/always-craving cut
from the track; waitlist-preview step and all "free preview searches" promises
deleted (no machinery existed; phantom-promise rot resolved by removal).
ONBOARDING_VERSION → 5.

**Presentation beats (the non-question screens), corpus verdict:** loss-framed
personalized graphs = keep (calendar-graph is the Cal AI lineage's best beat and
uses the user's own frequency×budget). Feature carousels = the measured LOSER
(Clear30: feature-carousel → outcome-journey screen took the paywall 20%→30%;
Parra: users don't read; real-product video works across the board). The
use-cases carousel is therefore a placeholder: replace with ONE short
auto-playing real screen-capture demo (search → ranked answer, ~10s loop,
outcome-captioned) once the asset exists — the SAME asset as the founder-content
demo-wow format (one recording serves onboarding + TikTok). Until then the
carousel keeps the comprehension slot.

## Addendum 4 (2026-07-26): copy register + the database rule

**Copy register (all onboarding surfaces):** sell the finished outcome, never
the machinery. Second person; concrete scenes (the "what do you feel like"
spiral, the wall of 4.6s in a new city, right-restaurant-wrong-order); verbs
of finishing (answered, decided, done); numbers only as proof of labor done
FOR the user. Mechanism words (endorsements, corpus, personalized/non-
personalized, algorithm) stay out — users don't buy how it works, they buy
that the hour of review-digging is already done. The deep value prop, owner-
ratified direction: undifferentiated abundance (everything is 4.5★) forces
manual research; people respond by settling into defaults; Crave has already
done the research for the whole city, so the outcome is CERTAINTY IN MINUTES
— never settle by default, never miss what's nearby.

**The database rule:** any claim about what data/vocabulary EXISTS is verified
against the database, never inferred from prompts, code, or enrichment lists.
(The "date night doesn't exist" error: `romantic` was active with date-night
aliases the whole time.)
