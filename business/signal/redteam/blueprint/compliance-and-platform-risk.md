# Red team — compliance & platform risk (blueprint.md)

> Reviewer lane: Apple App Review, FTC endorsement rules, TikTok/Meta ToS,
> integrity-brand endangerment. 2026-07-12. Fixed constraints (hard paywall,
> $7.99/$39.99, solo bootstrap, no-pay-to-rank) not relitigated — this audits
> execution and evidence only. Sources checked: blueprint §2/§4/§5/§6/§7/§10/§11,
> panels/p3 + p4 verdicts, ledger 03/05/06/08/09, spine/06, crave-fact-sheet.md.

---

## MAJOR-1 — The integrity line never requires sponsorship disclosure on paid creator content (FTC gap, and it's inherited from the corpus)

**What's wrong.** Blueprint §4's "integrity line (non-negotiable, it IS the
moat)" prohibits fake-persona comments, _undisclosed paid commenters_,
rage-bait, fake demos, disguised-discovery scripting, account farms, and
_undisclosed AI personas_ — but nowhere requires the one disclosure the FTC
actually mandates: **clear #ad / paid-partnership disclosure on the paid
creator videos themselves.** The P3 verdict has the same hole. The trial
creators ($300–500/mo retainers + $60/$200/$500/$800 view milestones) post
"on their own accounts" (P3 verdict §First-paid-deal) making ranking-controversy
claims ("#1 birria in Austin — fight me") — that is a textbook material
connection under the FTC Endorsement Guides (16 CFR Part 255, 2023 revision),
and disclosure must be in the video itself (unmissable, not description-only;
the FTC has said platform toggles alone are not sufficient). This is not an
oversight the corpus would have caught — the corpus _normalizes the violation_:
Cal AI's content law is literally "NO script reads, no 'this video is
sponsored by'" with the app deliberately unnamed and legible on screen
(spine/06). The blueprint imports that lineage's formats and pay grids while
its prohibited-list drafters clearly knew disclosure mattered (they banned
undisclosed _commenters_ and undisclosed _AI personas_) — the far larger
surface, the paid videos, just isn't covered.

**Why it matters.** (a) Legal: FTC penalty-offense notices put undisclosed
endorsements at ~$50k+/violation exposure; a solo bootstrapper cannot absorb
even an inquiry. (b) Brand: this is the single cheapest way to kill the
no-pay-to-rank moat — the day a local reporter or competitor reveals that
"#1 birria" videos were paid and undisclosed, "objective, evidence-receipted,
never pay-to-rank" reads as a lie, and the §1 positioning is unrecoverable.
The blueprint's own test (ledger/05 Conflict C: outrage at a _deception_ is
brand poison) already condemns this — undisclosed payment IS the deception.
(c) Platform: it also breaks TikTok's Branded Content Policy (see MINOR-3),
so the Spark instrument in §6 sits on non-compliant inventory.

**What to change.** Add one sentence to the §4 integrity line's _allowed/
required_ side: **"Every paid creator post carries in-video sponsorship
disclosure (#ad / 'paid partnership with Crave') plus the platform's branded-
content toggle; disclosure is a contract term, non-negotiable, and Crave-side
reposts/Sparks of that content carry it too."** Also: the "Crave ATX" anchor
account must keep the brand identity explicit (bio: official Crave account,
creator-operated) — the brand-named handle largely self-discloses, but the bio
line makes it airtight and costs nothing. Founder content needs only
"founder of Crave" in bio/handle. Note what this does NOT cost: the demo-wow
and receipt-controversy formats convert on the claim and the evidence, not on
feigned independence — disclosure is compatible with every format the ladder
ranks.

## MAJOR-2 — §7's rating ask is unsatisfiable as written and keeps a documented Apple-risk tactic the blueprint's own §2 logic refuses elsewhere

**What's wrong.** §7: "rating ask stays in onboarding but placed after a value
moment and never gated." Under gate-everything there is no pre-wall value
moment except the §2 teaser screen — and the as-built flow (fact sheet) has
the rating ask _before_ city pick, i.e. before even the teaser. So the
instruction as written is either unsatisfiable (no real value has occurred
pre-purchase) or silently defaults to the current pre-use ask, which is the
Cal AI/Clear30 lineage tactic (ledger/09) of harvesting ratings from people
who have never used the product. That is ratings-integrity / review-
manipulation adjacency (Apple Developer Code of Conduct + the 5.6 family §2
already treats as radioactive), and ledger/09 itself flags that the corpus is
silent on the Apple risk here and says "resolve conservatively" — the
blueprint didn't. §2's own argument — "a gate-everything app has no free tier
to retreat to if Apple pulls it — we refuse the entire family" — applies with
identical force to this tactic and is not applied.

**Why it matters.** Same tail-risk asymmetry §2 accepts as absolute for the
paywall: enforcement is probabilistic but the downside is existential for a
hard-gated app. Secondary costs: SKStoreReviewController is capped at 3
prompts/365 days — burning one pre-value wastes the scarcest ASO asset on the
users least likely to rate well; and pre-purchase raters who then hit a hard
wall are the 1-star cohort.

**What to change.** Specify mechanics in §7: (1) system
SKStoreReviewController only, never a custom rating UI (custom review prompts
are disallowed outright); (2) never gated (already stated — keep); (3) move
the ask to the **first post-purchase value moment** (e.g. first successful
ranked-dish search), which is also when the rating is honest and highest;
(4) if the owner insists on in-onboarding, earliest defensible slot is
immediately after the §2 teaser screen, and the blueprint should record it as
a consciously-held risk inside the §2 refuse-the-family boundary, not as
hygiene. Reorder note: the as-built rating-ask→city-pick order must flip
regardless.

## MINOR-3 — §6 Spark spec is missing the branded-content toggle and per-video Spark authorization mechanics

**What's wrong.** §6/P3 contract terms secure "perpetual content rights," but
Spark Ads run on a per-video, time-boxed **authorization code the creator
issues** — usage rights ≠ Spark authorization; and TikTok's Branded Content
Policy requires the branded-content toggle on paid-partnership content, with
boosting of unlabeled paid content a disapproval/penalty class. Ledger/08's
own doctrine ("Spark/partnership rights contracted up front per Boost App
Social's perpetual-rights rule") didn't make it into the blueprint text.

**Why it matters.** The Spark instrument is the blueprint's only answer to
one-city geo-dilution; discovering at boost time that the winner video can't
be legally sparked (no auth code, no toggle) stalls the whole §6 layer, and
repeated disapprovals degrade the ad account.

**What to change.** One clause in the §4 creator-deal grid: "branded-content
toggle ON + Spark authorization codes (renewable) delivered per video as a
payment condition." Same for Meta partnership-ads permissions
(paid-partnership label + partner approval).

## MINOR-4 — Listicle-factory volume posting has no cadence cap or account-health tripwire (TikTok unoriginal-content/spam exposure)

**What's wrong.** §4 runs programmatic Top-N slideshows as the "retargeting
ground game" with no stated posting cadence, template-variation rule, or
account-health signal. TikTok's unoriginal/mass-produced-content and spam
policies throttle exactly this shape (templated, repetitive, high-volume from
one account) — reach suppression first, account flags later. The blueprint
correctly discarded account farms (§10), but volume-on-one-account is the
residual risk it kept.

**Why it matters.** The factory posts from the same brand account the
demo-wow and controversy winners live on; a spam flag on that account taxes
the top of the ladder, not just the ground game.

**What to change.** Add to §4: cap factory output (e.g. ≤1–2/day/account),
require visible template variation, and treat a sudden reach collapse on
factory posts as a ToS signal that pauses the factory — never route around it
with additional accounts (already prohibited, keep it that way).

## MINOR-5 — View-milestone bonuses on ranking-claim content need a claims-accuracy contract term and a no-comps rule

**What's wrong.** The pay grid rewards views ($60–$800 milestones) on a
format whose engine is ranking controversy. Nothing in §4 or the P3 verdict
contractually binds paid creators to assert only what the live Score actually
says, and nothing addresses the second material connection — restaurants
comping creators who cover them — which lands directly on the no-pay-to-rank
brand ("did that restaurant buy its #1?").

**Why it matters.** One exaggerated paid "#1" claim that doesn't match the
in-app ranking is simultaneously an FTC deceptive-claim problem and a
receipts-brand contradiction a competitor can screenshot.

**What to change.** Two contract lines: (1) every ranking claim in paid
content must match the live Score at post time, receipts in-frame (the P3
"receipt-backed" norm, made a term, with a takedown/correction clause);
(2) creators on retainer may not accept restaurant comps/payment for covered
venues (or must disclose and Crave won't Spark those posts).

## MINOR-6 — §2's compliance line is paywall-scoped; add App Review completeness (reviewer path) to the launch checklist

**What's wrong.** The §2 "compliance line is absolute" covers the 3.1.2(c)/5.6
dark-pattern family only. A gate-everything app with auth-before-wall
routinely draws Guideline 2.1 (App Completeness) metadata requests; the
blueprint/§11 checklist carries legal URLs but not reviewer access notes.

**Why it matters.** Cheap, and it's the most common first-submission
rejection class for hard-gated apps; a rejection cycle costs weeks against
the "longest pole" enrollment timeline (§11.4).

**What to change.** Add to the Month-0 list: App Review notes describing the
gate-everything model, a reviewable path (sandbox IAP through the full wall +
throwaway Clerk credentials), and confirmation the paywall shows the built
3.1.2 terms line and live legal URLs at submission.

---

## Attacked and held (tested, no finding)

- **§2 paywall spec** — "Try it free" with $39.99 most prominent + trial
  timeline + built "N-day free trial, then $X. Auto-renews." terms line, no
  decline cascades / fake scarcity / divide-down: correctly identifies and
  refuses the documented Cal-AI pull class (ledger/03); compliant as specced.
- **Trial-reminder promise** — backed by Apple's own pre-charge reminder
  (fact sheet, verified), so the "day-5 reminder" claim isn't an undeliverable
  promise; just don't promise an in-app channel (push) the user can decline.
- **Teaser screen (§2)** — non-interactive real-data screen pre-wall trips no
  guideline; it _improves_ review posture (reviewer sees real content).
- **Web-slug CTA (§5)** — free rich web pages + standard store CTA carry no
  Apple exposure; no in-app link-out to web purchase exists in the blueprint,
  so no 3.1.1 anti-steering surface. (If the fact-sheet web-checkout margin
  lever is ever activated, it needs the US external-link entitlement rules —
  a future decision, not a blueprint defect.)
- **Pinned own-identity comments / comment CTAs (§4)** — explicitly
  own-identity; platform-compliant; the Cal-AI fake-user plant-and-pin is
  already prohibited.
- **§10 discards** — the corpus's genuinely ToS-fatal tactics (account farms,
  15-posts/day fleets, undisclosed AI avatars, decline cascades) are all
  discarded; the discard list is the strongest compliance work in the doc.
- **Week-3 price-ceiling cohort (§2)** — price A/B via separate offerings is
  standard and compliant; no finding.
- **Legal URLs** — correctly carried as launch-blocking (§11.6).
